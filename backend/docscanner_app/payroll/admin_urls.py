from django.urls import path

from . import admin_views as v

# įtraukti po API prefiksu: path("admin/du/", include("docscanner_app.payroll.admin_urls"))
urlpatterns = [
    path("whoami/", v.admin_du_whoami),
    path("users/", v.admin_du_users),
    path("companies/", v.admin_du_companies),
    path("errors/", v.admin_du_errors),
    path("uploads/", v.admin_du_uploads),
    path("uploads/<int:pk>/download/", v.admin_du_upload_download),
    path("uploads/<int:pk>/reparse/", v.admin_du_upload_reparse),
]
