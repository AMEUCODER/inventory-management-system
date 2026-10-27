from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

# No trailing slashes anywhere in the API: it keeps proxying through Next.js simple.
router = DefaultRouter(trailing_slash=False)
router.register("products", views.ProductViewSet, basename="product")
router.register("users", views.UserViewSet, basename="user")
router.register("transactions", views.TransactionViewSet, basename="transaction")

urlpatterns = [
    path("auth/login", views.LoginView.as_view(), name="login"),
    path("auth/refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/me", views.MeView.as_view(), name="me"),
    path("auth/change-password", views.ChangePasswordView.as_view(), name="change-password"),
    path("scan", views.ScanView.as_view(), name="scan"),
    path("stats", views.StatsView.as_view(), name="stats"),
    *router.urls,
]
