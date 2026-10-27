from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    """Only users whose role is ``admin``. Role is read from the database on
    every request, so demoting or deactivating someone takes effect at once."""

    message = "Admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == "admin")
