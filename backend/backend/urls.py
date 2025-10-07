from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from wagtail.admin import urls as wagtailadmin_urls
from wagtail.documents import urls as wagtaildocs_urls

from wagtail.api.v2.router import WagtailAPIRouter
from wagtail.api.v2.views import PagesAPIViewSet
from wagtail.images.api.v2.views import ImagesAPIViewSet
from wagtail.documents.api.v2.views import DocumentsAPIViewSet

api_router = WagtailAPIRouter("wagtailapi")
api_router.register_endpoint("pages", PagesAPIViewSet)
api_router.register_endpoint("images", ImagesAPIViewSet)
api_router.register_endpoint("documents", DocumentsAPIViewSet)

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include("docscanner_app.urls")),
    path("wagtail-admin/", include(wagtailadmin_urls)),
    path("documents/", include(wagtaildocs_urls)),
    path("guides-api/v2/", api_router.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
