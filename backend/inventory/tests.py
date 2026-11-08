from decimal import Decimal

from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Product, Transaction, User


class BaseTestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            "boss", password="pass12345!", role=User.Role.ADMIN
        )
        self.cashier = User.objects.create_user(
            "cashier", password="pass12345!", role=User.Role.USER
        )
        self.other = User.objects.create_user(
            "other", password="pass12345!", role=User.Role.USER
        )
        self.product = Product.objects.create(
            name="Water", barcode="111", price=Decimal("1.500"), quantity=3
        )

    def scan(self, barcode="111", action="sell"):
        return self.client.post(
            reverse("scan"), {"barcode": barcode, "action": action}, format="json"
        )


class ScanTests(BaseTestCase):
    def test_sell_decrements_stock_and_logs_transaction(self):
        self.client.force_authenticate(self.cashier)
        res = self.scan()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["product"]["quantity"], 2)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 2)
        tx = Transaction.objects.get()
        self.assertEqual(
            (tx.type, tx.quantity_change, tx.user, tx.stock_after, tx.unit_price),
            ("sale", -1, self.cashier, 2, Decimal("1.500")),
        )

    def test_cannot_sell_below_zero(self):
        self.client.force_authenticate(self.cashier)
        for _ in range(3):
            self.assertEqual(self.scan().status_code, 201)
        res = self.scan()
        self.assertEqual(res.status_code, 409)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 0)
        self.assertEqual(Transaction.objects.count(), 3)

    def test_return_increments_stock(self):
        self.client.force_authenticate(self.cashier)
        self.scan()
        res = self.scan(action="return")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["product"]["quantity"], 3)

    def test_cannot_return_more_than_was_sold(self):
        self.client.force_authenticate(self.cashier)
        res = self.scan(action="return")
        self.assertEqual(res.status_code, 409)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 3)
        self.assertEqual(Transaction.objects.count(), 0)

        self.scan()
        self.assertEqual(self.scan(action="return").status_code, 201)
        self.assertEqual(self.scan(action="return").status_code, 409)

    def test_unknown_barcode_is_404(self):
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.scan("nope").status_code, 404)

    def test_inactive_product_cannot_be_scanned(self):
        self.product.is_active = False
        self.product.save()
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.scan().status_code, 409)

    def test_invalid_action_is_rejected(self):
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.scan(action="steal").status_code, 400)

    def test_requires_authentication(self):
        self.assertEqual(self.scan().status_code, 401)

    def test_barcode_whitespace_is_trimmed(self):
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.scan("  111 ").status_code, 201)


class PermissionTests(BaseTestCase):
    def test_regular_user_cannot_manage_products_users_or_stats(self):
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.client.get("/api/products").status_code, 403)
        self.assertEqual(
            self.client.post("/api/products", {"name": "x"}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/products/{self.product.id}", {"price": "0"}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"/api/products/{self.product.id}").status_code, 403)
        self.assertEqual(self.client.get("/api/users").status_code, 403)
        self.assertEqual(self.client.get("/api/stats").status_code, 403)
        self.assertEqual(
            self.client.post(
                f"/api/products/{self.product.id}/adjust", {"delta": 50}, format="json"
            ).status_code,
            403,
        )

    def test_user_only_sees_own_transactions(self):
        self.client.force_authenticate(self.cashier)
        self.scan()
        self.client.force_authenticate(self.other)
        self.scan()
        res = self.client.get("/api/transactions")
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["username"], "other")
        # The ?user= filter is admin-only and must not let users peek at others.
        res = self.client.get(f"/api/transactions?user={self.cashier.id}")
        self.assertEqual(res.data["count"], 1)

    def test_admin_sees_all_transactions(self):
        self.client.force_authenticate(self.cashier)
        self.scan()
        self.client.force_authenticate(self.other)
        self.scan()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/transactions").data["count"], 2)
        res = self.client.get(f"/api/transactions?user={self.cashier.id}")
        self.assertEqual(res.data["count"], 1)

    def test_deactivated_user_loses_access_immediately(self):
        res = self.client.post(
            "/api/auth/login",
            {"username": "cashier", "password": "pass12345!"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user"]["role"], "user")
        token = res.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.scan().status_code, 201)

        self.cashier.is_active = False
        self.cashier.save()
        self.assertEqual(self.scan().status_code, 401)

    def test_wrong_password_rejected(self):
        res = self.client.post(
            "/api/auth/login",
            {"username": "cashier", "password": "wrong"},
            format="json",
        )
        self.assertEqual(res.status_code, 401)


class AdminProductTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)

    def test_create_product_with_initial_stock_logs_adjustment(self):
        res = self.client.post(
            "/api/products",
            {"name": "Pen", "barcode": " 222 ", "price": "0.900", "quantity": 10},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["barcode"], "222")
        tx = Transaction.objects.get(product_id=res.data["id"])
        self.assertEqual((tx.type, tx.quantity_change, tx.stock_after), ("adjustment", 10, 10))

    def test_duplicate_barcode_rejected(self):
        res = self.client.post(
            "/api/products",
            {"name": "Dup", "barcode": "111", "price": "1"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_negative_price_rejected(self):
        res = self.client.post(
            "/api/products",
            {"name": "Bad", "barcode": "333", "price": "-1"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_quantity_cannot_be_edited_directly(self):
        res = self.client.patch(
            f"/api/products/{self.product.id}", {"quantity": 999}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 3)

    def test_adjust_stock(self):
        res = self.client.post(
            f"/api/products/{self.product.id}/adjust",
            {"delta": 7, "note": "Restock"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["product"]["quantity"], 10)
        res = self.client.post(
            f"/api/products/{self.product.id}/adjust", {"delta": -11}, format="json"
        )
        self.assertEqual(res.status_code, 409)
        res = self.client.post(
            f"/api/products/{self.product.id}/adjust", {"delta": 0}, format="json"
        )
        self.assertEqual(res.status_code, 400)

    def test_product_with_history_cannot_be_deleted(self):
        self.client.post(
            f"/api/products/{self.product.id}/adjust", {"delta": 1}, format="json"
        )
        res = self.client.delete(f"/api/products/{self.product.id}")
        self.assertEqual(res.status_code, 409)
        # ...but one without history can.
        fresh = Product.objects.create(name="New", barcode="999", price=1)
        self.assertEqual(self.client.delete(f"/api/products/{fresh.id}").status_code, 204)

    def test_stock_filters(self):
        Product.objects.create(name="Gone", barcode="444", price=1, quantity=0)
        Product.objects.create(
            name="Fine", barcode="555", price=1, quantity=50, low_stock_threshold=5
        )
        low = self.client.get("/api/products?stock=low").data["results"]
        out = self.client.get("/api/products?stock=out").data["results"]
        self.assertEqual([p["barcode"] for p in low], ["111"])
        self.assertEqual([p["barcode"] for p in out], ["444"])


class AdminUserTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)

    def test_create_user_and_login(self):
        res = self.client.post(
            "/api/users",
            {"username": "newbie", "password": "Str0ng-pass-99", "role": "user"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotIn("password", res.data)
        self.client.force_authenticate(None)
        login = self.client.post(
            "/api/auth/login",
            {"username": "newbie", "password": "Str0ng-pass-99"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_password_required_on_create(self):
        res = self.client.post(
            "/api/users", {"username": "nopass", "role": "user"}, format="json"
        )
        self.assertEqual(res.status_code, 400)

    def test_admin_cannot_lock_themselves_out(self):
        url = f"/api/users/{self.admin.id}"
        self.assertEqual(
            self.client.patch(url, {"role": "user"}, format="json").status_code, 400
        )
        self.assertEqual(
            self.client.patch(url, {"is_active": False}, format="json").status_code, 400
        )
        self.assertEqual(self.client.delete(url).status_code, 400)

    def test_user_with_history_cannot_be_deleted(self):
        self.client.force_authenticate(self.cashier)
        self.scan()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f"/api/users/{self.cashier.id}").status_code, 409)
        self.assertEqual(self.client.delete(f"/api/users/{self.other.id}").status_code, 204)

    def test_role_promotion_grants_admin_access(self):
        self.client.patch(f"/api/users/{self.cashier.id}", {"role": "admin"}, format="json")
        self.client.force_authenticate(self.cashier)
        # force_authenticate keeps the old in-memory object, so reload it.
        self.cashier.refresh_from_db()
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.client.get("/api/products").status_code, 200)


class StatsTests(BaseTestCase):
    def test_stats_numbers(self):
        self.client.force_authenticate(self.cashier)
        self.scan()
        self.scan()
        self.scan(action="return")
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/stats").data
        self.assertEqual(data["totals"]["units"], 2)
        self.assertEqual(data["today"]["sales"], 2)
        self.assertEqual(data["today"]["returns"], 1)
        self.assertEqual(Decimal(data["today"]["revenue"]), Decimal("1.500"))
        self.assertEqual(len(data["daily"]), 7)
        self.assertEqual(data["top_products"][0]["units_sold"], 1)
        self.assertEqual(Decimal(data["totals"]["inventory_value"]), Decimal("3.000"))


class ChangePasswordTests(BaseTestCase):
    def test_change_own_password(self):
        self.client.force_authenticate(self.cashier)
        bad = self.client.post(
            "/api/auth/change-password",
            {"old_password": "nope", "new_password": "An0ther-pass-77"},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post(
            "/api/auth/change-password",
            {"old_password": "pass12345!", "new_password": "An0ther-pass-77"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.cashier.refresh_from_db()
        self.assertTrue(self.cashier.check_password("An0ther-pass-77"))
