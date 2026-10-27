from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import Product, Transaction, User

# (name, barcode, price, initial stock, low-stock threshold)
DEMO_PRODUCTS = [
    ("Mineral Water 1.5L", "600000000011", "0.700", 120, 20),
    ("Orange Juice 1L", "600000000028", "2.500", 40, 10),
    ("Whole Wheat Bread", "600000000035", "1.200", 25, 8),
    ("Chocolate Bar 100g", "600000000042", "3.100", 60, 15),
    ("Notebook A5", "600000000059", "4.500", 30, 5),
    ("Ballpoint Pen (blue)", "600000000066", "0.900", 200, 40),
    ("USB-C Cable 1m", "600000000073", "12.000", 15, 5),
    ("Phone Charger 20W", "600000000080", "24.900", 8, 3),
]


class Command(BaseCommand):
    help = "Create a demo admin, a demo cashier and sample products (development only)."

    def add_arguments(self, parser):
        parser.add_argument("--admin-password", default="admin12345")
        parser.add_argument("--user-password", default="cashier12345")

    @transaction.atomic
    def handle(self, *args, **options):
        admin, created = User.objects.get_or_create(
            username="admin",
            defaults={"role": User.Role.ADMIN, "is_superuser": True},
        )
        if created:
            admin.set_password(options["admin_password"])
            admin.save()
            self.stdout.write(f"Created admin  -> admin / {options['admin_password']}")
        else:
            self.stdout.write("Admin user already exists (left unchanged).")

        cashier, created = User.objects.get_or_create(
            username="cashier", defaults={"role": User.Role.USER}
        )
        if created:
            cashier.set_password(options["user_password"])
            cashier.save()
            self.stdout.write(f"Created user   -> cashier / {options['user_password']}")
        else:
            self.stdout.write("Cashier user already exists (left unchanged).")

        added = 0
        for name, barcode, price, qty, threshold in DEMO_PRODUCTS:
            product, was_created = Product.objects.get_or_create(
                barcode=barcode,
                defaults={
                    "name": name,
                    "price": Decimal(price),
                    "quantity": qty,
                    "low_stock_threshold": threshold,
                },
            )
            if was_created:
                added += 1
                Transaction.objects.create(
                    product=product,
                    user=admin,
                    type=Transaction.Type.ADJUSTMENT,
                    quantity_change=qty,
                    unit_price=product.price,
                    stock_after=qty,
                    note="Initial stock",
                )
        self.stdout.write(self.style.SUCCESS(f"Added {added} demo products."))
        self.stdout.write(
            self.style.WARNING("Demo credentials are for development only - change them.")
        )
