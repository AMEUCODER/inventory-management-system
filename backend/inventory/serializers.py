from django.contrib.auth.password_validation import validate_password
from django.db import transaction as db_transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Product, Transaction, User


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "role",
            "is_active",
            "password",
            "date_joined",
            "last_login",
        ]
        read_only_fields = ["date_joined", "last_login"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        instance = self.instance
        if instance is not None:
            if instance.is_superuser and attrs.get("role") == User.Role.USER:
                raise serializers.ValidationError(
                    {"role": "A superuser is always an admin."}
                )
            if request is not None and instance.pk == request.user.pk:
                if attrs.get("role") == User.Role.USER:
                    raise serializers.ValidationError(
                        {"role": "You can't remove your own admin role."}
                    )
                if attrs.get("is_active") is False:
                    raise serializers.ValidationError(
                        {"is_active": "You can't deactivate your own account."}
                    )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "This field is required."})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(TokenObtainPairSerializer):
    """Standard JWT login that also returns the user, so the UI needs one call."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value


class ProductSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "barcode",
            "description",
            "price",
            "quantity",
            "low_stock_threshold",
            "is_active",
            "is_low_stock",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_barcode(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Barcode can't be blank.")
        return value

    def validate(self, attrs):
        # Stock is only changed through scans or the audited "adjust" action, so
        # the transaction log always explains the current quantity.
        if self.instance is not None and "quantity" in attrs:
            if attrs["quantity"] != self.instance.quantity:
                raise serializers.ValidationError(
                    {"quantity": "Use the stock adjustment action to change stock."}
                )
        return attrs

    @db_transaction.atomic
    def create(self, validated_data):
        product = super().create(validated_data)
        if product.quantity > 0:
            Transaction.objects.create(
                product=product,
                user=self.context["request"].user,
                type=Transaction.Type.ADJUSTMENT,
                quantity_change=product.quantity,
                unit_price=product.price,
                stock_after=product.quantity,
                note="Initial stock",
            )
        return product


class AdjustSerializer(serializers.Serializer):
    delta = serializers.IntegerField()
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_delta(self, value):
        if value == 0:
            raise serializers.ValidationError("Adjustment can't be zero.")
        return value


class TransactionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_barcode = serializers.CharField(source="product.barcode", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "product",
            "product_name",
            "product_barcode",
            "user",
            "username",
            "type",
            "quantity_change",
            "unit_price",
            "stock_after",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class ScanSerializer(serializers.Serializer):
    barcode = serializers.CharField(max_length=64, trim_whitespace=True)
    action = serializers.ChoiceField(choices=["sell", "return"])
