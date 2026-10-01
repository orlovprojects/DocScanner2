"""esavitarna.lt API maršrutai: įtraukiami docscanner_app/urls.py kaip path("savitarna/", include(...))."""
from django.urls import path

from . import savitarna_views as v

urlpatterns = [
    path("auth/invite/check/", v.InviteCheckView.as_view()),
    path("auth/invite/accept/", v.InviteAcceptView.as_view()),
    path("auth/login/", v.LoginView.as_view()),
    path("auth/logout/", v.LogoutView.as_view()),
    path("auth/password-reset/", v.PasswordResetRequestView.as_view()),
    path("auth/password-reset/confirm/", v.PasswordResetConfirmView.as_view()),
    path("me/", v.MeView.as_view()),
    path("me/company/", v.SelectCompanyView.as_view()),
    path("home/", v.HomeView.as_view()),
    path("anketa/", v.AnketaView.as_view()),
    path("requests/", v.RequestListView.as_view()),
    path("requests/preview/", v.RequestPreviewView.as_view()),
    path("requests/<int:pk>/cancel/", v.RequestCancelView.as_view()),
    path("payslips/", v.PayslipListView.as_view()),
    path("payslips/<int:run_id>/", v.PayslipDetailView.as_view()),
]
