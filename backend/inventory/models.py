from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.db import models


class User(AbstractUser):
    """Two roles: ``admin`` manages everything, ``user`` can only scan."""

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        USER = "user", "User"

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.USER)

    @property
    def is_admin_role(self) -> bool:
        return self.role == self.Role.ADMIN

    def save(self, *args, **kwargs):
        # Superusers (createsuperuser) are always admins; is_staff mirrors the
        # role so admins can also open Django's built-in /django-admin/.
        if self.is_superuser:
            self.role = self.Role.ADMIN
        self.is_staff = self.role == self.Role.ADMIN
        super().save(*args, **kwargs)


class Product(models.Model):
    name = models.CharField(max_length=200)
    barcode = models.CharField(max_length=64, unique=True)
    description = models.TextField(blank=True)
    # 3 decimals so currencies such as TND/KWD work; 2-decimal currencies are fine.
    price = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0"))],
    )
    quantity = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    # Products with history can't be deleted, so they are archived instead.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.barcode})"

    @property
    def is_low_stock(self) -> bool:
        return 0 < self.quantity <= self.low_stock_threshold


class Transaction(models.Model):
    """Append-only audit log. Every stock change is recorded here."""

    class Type(models.TextChoices):
        SALE = "sale", "Sale"
        RETURN = "return", "Return"
        ADJUSTMENT = "adjustment", "Adjustment"

    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="transactions"
    )
    user = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="transactions"
    )
    type = models.CharField(max_length=12, choices=Type.choices)
    # Signed effect on stock: sale = -1, return = +1, adjustment = any non-zero int.
    quantity_change = models.IntegerField()
    # Price at the time of the transaction (later price edits don't rewrite history).
    unit_price = models.DecimalField(max_digits=12, decimal_places=3)
    stock_after = models.PositiveIntegerField()
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.type} {self.quantity_change:+d} x {self.product_id}"
