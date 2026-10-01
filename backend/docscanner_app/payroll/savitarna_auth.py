"""
esavitarna.lt: žetonai, sesijos, DRF autentifikacija ir domeno atskyrimas.

Saugumas:
- slaptažodžiai - django make_password; žetonai DB saugomi tik kaip SHA-256
- sesija - httpOnly slapukas esv_session (90 d., pratęsiama), SameSite=Lax
- rašymo užklausoms privaloma antraštė X-Requested-With: esavitarna (CSRF apsauga)
- 5 nesėkmingi bandymai -> blokavimas 15 min.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.http import Http404
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import BasePermission

from .savitarna_utils import hash_token, new_token, normalize_login, password_problem  # noqa: F401

logger = logging.getLogger("docscanner_app")

COOKIE_NAME = "esv_session"
SESSION_DAYS = 90
INVITE_DAYS = 7
RESET_HOURS = 2
MAX_FAILED = 5
LOCK_MINUTES = 15
CSRF_HEADER = "HTTP_X_REQUESTED_WITH"
CSRF_VALUE = "esavitarna"
API_PREFIX = "/api/savitarna/"

def base_url():
    return getattr(settings, "SAVITARNA_BASE_URL", "https://esavitarna.lt").rstrip("/")


# ---------- sesija ----------

def create_session(response, account, request, employee=None):
    from docscanner_app.models import EmployeeSession
    raw, h = new_token()
    EmployeeSession.objects.create(
        account=account, token_hash=h, active_employee=employee,
        expires_at=timezone.now() + timedelta(days=SESSION_DAYS),
        ip=_ip(request), user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:255],
    )
    set_cookie(response, raw)
    account.last_login = timezone.now()
    account.failed_attempts = 0
    account.locked_until = None
    account.save(update_fields=["last_login", "failed_attempts", "locked_until"])


def set_cookie(response, raw):
    response.set_cookie(
        COOKIE_NAME, raw, max_age=SESSION_DAYS * 86400, httponly=True,
        secure=not settings.DEBUG, samesite="Lax", path="/",
    )


def _ip(request):
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR")) or None


class EmployeePrincipal:
    """request.user savitarnos užklausose."""
    is_authenticated = True
    is_anonymous = False

    def __init__(self, session):
        self.session = session
        self.account = session.account
        self.employee = session.active_employee

    def __str__(self):
        return f"savitarna:{self.account.login}"


class EmployeeSessionAuthentication(BaseAuthentication):
    def authenticate(self, request):
        from docscanner_app.models import EmployeeSession
        raw = request.COOKIES.get(COOKIE_NAME)
        if not raw:
            return None
        if request.method not in ("GET", "HEAD", "OPTIONS") and request.META.get(CSRF_HEADER) != CSRF_VALUE:
            raise AuthenticationFailed("Neteisinga užklausa")
        s = (EmployeeSession.objects.select_related("account", "active_employee__company")
             .filter(token_hash=hash_token(raw), revoked=False, expires_at__gt=timezone.now()).first())
        if s is None or not s.account.is_active:
            return None
        # slenkantis galiojimas: pratęsiam, jei liko < 80 d.
        if s.expires_at - timezone.now() < timedelta(days=SESSION_DAYS - 10):
            s.expires_at = timezone.now() + timedelta(days=SESSION_DAYS)
            s.save(update_fields=["expires_at", "last_seen"])
            getattr(request, "_request", request)._esv_refresh = raw
        return EmployeePrincipal(s), s

    def authenticate_header(self, request):
        return "Session"


class IsEmployee(BasePermission):
    def has_permission(self, request, view):
        return isinstance(getattr(request, "user", None), EmployeePrincipal)


class HasActiveEmployee(IsEmployee):
    """Pasirinkta įmonė (darbuotojo įrašas), kuri priklauso šiam prisijungimui ir yra prieinama."""
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        emp = request.user.employee
        if emp is None or emp.account_id != request.user.account.id:
            raise PermissionDenied("Pasirinkite įmonę")
        if not employee_access_allowed(emp):
            raise PermissionDenied("Prieiga prie šios įmonės savitarnos baigėsi")
        return True


def employee_access_allowed(emp):
    """Atleistas darbuotojas - 3 mėn. prieiga (tik skaitymas tikrinamas views)."""
    if emp.status != "dismissed":
        return True
    c = emp.contracts.order_by("-start_date").first()
    end = c.effective_end if c else None
    return bool(end and timezone.localdate() <= end + timedelta(days=92))


# ---------- domeno atskyrimas ----------

class SavitarnaHostMiddleware:
    """
    esavitarna.lt - tik /api/savitarna/*; kituose domenuose /api/savitarna/* nepasiekiama.
    settings.SAVITARNA_HOSTS = ["esavitarna.lt", "www.esavitarna.lt"]
    DEBUG režime (localhost) - neribojama.
    """
    def __init__(self, get_response):
        self.get_response = get_response
        self.hosts = {h.lower() for h in getattr(settings, "SAVITARNA_HOSTS", [])}

    def __call__(self, request):
        if not settings.DEBUG and self.hosts:
            host = request.get_host().split(":")[0].lower()
            on_savitarna = host in self.hosts
            is_api = request.path.startswith(API_PREFIX)
            if on_savitarna != is_api:
                raise Http404()
        response = self.get_response(request)
        raw = getattr(request, "_esv_refresh", None)
        if raw:
            set_cookie(response, raw)
        return response
