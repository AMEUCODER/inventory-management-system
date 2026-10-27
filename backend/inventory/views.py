from datetime import timedelta
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import (
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Q,
    Sum,
    Value,
)
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Coalesce, TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Product, Transaction, User
from .permissions import IsAdminRole
from .serializers import (
    AdjustSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    ProductSerializer,
    ScanSerializer,
    TransactionSerializer,
    UserSerializer,
)

MONEY = DecimalField(max_digits=18, decimal_places=3)
ZERO_MONEY = Value(Decimal("0"), output_field=MONEY)


def money_str(value) -> str:
    """Stable 3-decimal string (SQLite returns sums with float noise)."""
    return str(Decimal(str(value)).quantize(Decimal("0.001")))


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Conflict."
    default_code = "conflict"


# --- Auth -------------------------------------------------------------------
class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        return Response({"detail": "Password updated."})


# --- Admin: users -----------------------------------------------------------
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "first_name", "last_name", "email"]

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise ValidationError({"detail": "You can't delete your own account."})
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            raise Conflict(
                "This user has transaction history and can't be deleted. "
                "Deactivate the account instead."
            )


# --- Admin: products --------------------------------------------------------
class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAdminRole]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "barcode"]
    ordering_fields = ["name", "price", "quantity", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        qs = Product.objects.all()
        stock = self.request.query_params.get("stock")
        if stock == "low":
            qs = qs.filter(quantity__gt=0, quantity__lte=F("low_stock_threshold"))
        elif stock == "out":
            qs = qs.filter(quantity=0)
        return qs

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            raise Conflict(
                "This product has transaction history and can't be deleted. "
                "Mark it inactive instead."
            )

    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        """Audited manual stock change (restock, damaged goods, recount...)."""
        serializer = AdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        delta = serializer.validated_data["delta"]
        note = serializer.validated_data.get("note", "")

        with db_transaction.atomic():
            product = get_object_or_404(Product.objects.select_for_update(), pk=pk)
            if product.quantity + delta < 0:
                raise Conflict("Stock can't go below zero.")
            Product.objects.filter(pk=product.pk).update(quantity=F("quantity") + delta)
            product.refresh_from_db()
            tx = Transaction.objects.create(
                product=product,
                user=request.user,
                type=Transaction.Type.ADJUSTMENT,
                quantity_change=delta,
                unit_price=product.price,
                stock_after=product.quantity,
                note=note,
            )
        return Response(
            {
                "product": ProductSerializer(product).data,
                "transaction": TransactionSerializer(tx).data,
            }
        )


# --- Transactions (history) -------------------------------------------------
class TransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """Admins see everything; regular users only see their own scans."""

    serializer_class = TransactionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["product__name", "product__barcode", "user__username"]

    def get_queryset(self):
        qs = Transaction.objects.select_related("product", "user")
        user = self.request.user
        params = self.request.query_params

        if user.role != User.Role.ADMIN:
            qs = qs.filter(user=user)
        elif params.get("user", "").isdigit():
            qs = qs.filter(user_id=int(params["user"]))

        if params.get("type") in Transaction.Type.values:
            qs = qs.filter(type=params["type"])
        if params.get("product", "").isdigit():
            qs = qs.filter(product_id=int(params["product"]))

        date_from = parse_date(params.get("date_from", ""))
        date_to = parse_date(params.get("date_to", ""))
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs


# --- Scanning: the one write path regular users have ------------------------
class ScanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        barcode = serializer.validated_data["barcode"]
        scan_action = serializer.validated_data["action"]

        # Everything below is one atomic unit: the stock change and its audit
        # record either both happen or neither does.
        with db_transaction.atomic():
            try:
                product = Product.objects.select_for_update().get(barcode=barcode)
            except Product.DoesNotExist:
                raise NotFound(f"No product with barcode {barcode}.")

            if not product.is_active:
                raise Conflict(f"{product.name} is inactive and can't be scanned.")

            if scan_action == "sell":
                # Conditional UPDATE: only succeeds while stock >= 1, so two
                # simultaneous scans can never oversell the last unit, even on
                # databases where select_for_update is a no-op (SQLite).
                changed = Product.objects.filter(
                    pk=product.pk, quantity__gte=1
                ).update(quantity=F("quantity") - 1)
                if not changed:
                    raise Conflict(f"{product.name} is out of stock.")
                tx_type, delta = Transaction.Type.SALE, -1
            else:
                # A return must correspond to a sale: returned units can never
                # exceed units sold, otherwise stock could be inflated by scanning.
                totals = Transaction.objects.filter(
                    product=product,
                    type__in=[Transaction.Type.SALE, Transaction.Type.RETURN],
                ).aggregate(
                    sold=Count("id", filter=Q(type=Transaction.Type.SALE)),
                    returned=Count("id", filter=Q(type=Transaction.Type.RETURN)),
                )
                if totals["returned"] >= totals["sold"]:
                    raise Conflict(
                        f"{product.name} has no sold units left to return."
                    )
                Product.objects.filter(pk=product.pk).update(
                    quantity=F("quantity") + 1
                )
                tx_type, delta = Transaction.Type.RETURN, 1

            product.refresh_from_db()
            tx = Transaction.objects.create(
                product=product,
                user=request.user,
                type=tx_type,
                quantity_change=delta,
                unit_price=product.price,
                stock_after=product.quantity,
            )

        return Response(
            {
                "transaction": TransactionSerializer(tx).data,
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "barcode": product.barcode,
                    "price": str(product.price),
                    "quantity": product.quantity,
                },
            },
            status=status.HTTP_201_CREATED,
        )


# --- Admin dashboard --------------------------------------------------------
class StatsView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        Tx = Transaction
        revenue = ExpressionWrapper(
            -F("unit_price") * F("quantity_change"), output_field=MONEY
        )
        sales_returns = Tx.objects.filter(type__in=[Tx.Type.SALE, Tx.Type.RETURN])

        totals = Product.objects.aggregate(
            products=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            units=Coalesce(Sum("quantity"), Value(0)),
            value=Coalesce(
                Sum(ExpressionWrapper(F("price") * F("quantity"), output_field=MONEY)),
                ZERO_MONEY,
            ),
            low=Count(
                "id",
                filter=Q(is_active=True, quantity__gt=0, quantity__lte=F("low_stock_threshold")),
            ),
            out=Count("id", filter=Q(is_active=True, quantity=0)),
        )

        today = timezone.localdate()
        today_row = sales_returns.filter(created_at__date=today).aggregate(
            sales=Count("id", filter=Q(type=Tx.Type.SALE)),
            returns=Count("id", filter=Q(type=Tx.Type.RETURN)),
            revenue=Coalesce(Sum(revenue), ZERO_MONEY),
        )

        # Last 7 days. Each scan moves exactly one unit, so counting rows == units.
        start = today - timedelta(days=6)
        rows = (
            sales_returns.filter(created_at__date__gte=start)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(
                sales=Count("id", filter=Q(type=Tx.Type.SALE)),
                returns=Count("id", filter=Q(type=Tx.Type.RETURN)),
                revenue=Coalesce(Sum(revenue), ZERO_MONEY),
            )
        )
        by_day = {r["day"]: r for r in rows}
        daily = []
        for i in range(7):
            day = start + timedelta(days=i)
            r = by_day.get(day)
            daily.append(
                {
                    "date": day.isoformat(),
                    "sales": r["sales"] if r else 0,
                    "returns": r["returns"] if r else 0,
                    "revenue": money_str(r["revenue"]) if r else "0.000",
                }
            )

        needs_restock = (
            Product.objects.filter(is_active=True, quantity__lte=F("low_stock_threshold"))
            .order_by("quantity", "name")[:10]
            .values("id", "name", "barcode", "quantity", "low_stock_threshold")
        )

        # Net units sold (sales minus returns) over the last 30 days.
        top = (
            sales_returns.filter(created_at__date__gte=today - timedelta(days=29))
            .values("product_id", "product__name")
            .annotate(net=Sum("quantity_change"))
            .filter(net__lt=0)
            .order_by("net")[:5]
        )

        return Response(
            {
                "totals": {
                    "products": totals["products"],
                    "active_products": totals["active"],
                    "units": totals["units"],
                    "inventory_value": money_str(totals["value"]),
                    "low_stock": totals["low"],
                    "out_of_stock": totals["out"],
                },
                "today": {
                    "sales": today_row["sales"],
                    "returns": today_row["returns"],
                    "revenue": money_str(today_row["revenue"]),
                },
                "daily": daily,
                "low_stock": list(needs_restock),
                "top_products": [
                    {
                        "product_id": t["product_id"],
                        "name": t["product__name"],
                        "units_sold": -t["net"],
                    }
                    for t in top
                ],
            }
        )
