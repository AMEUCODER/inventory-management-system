from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # Django's built-in admin (data repair / debugging). The real admin UI is the
    # Next.js app. Kept under /django-admin/ so it never clashes with it.
    path("django-admin/", admin.site.urls),
    path("api/", include("inventory.urls")),
]
