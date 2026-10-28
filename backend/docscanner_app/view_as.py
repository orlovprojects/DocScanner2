"""
„Žiūrėti kaip“: superuser mato sistemą kaip pasirinktas vartotojas ir jo įmonė.

Antraštės (siunčia frontend, galioja tik superuser):
    X-View-As-User     - vartotojo id
    X-View-As-Company  - to vartotojo CompanyProfile id (aktyvi įmonė tik atmintyje, DB nekeičiama)
    X-View-As-Write    - "1": leisti keisti DokSkenas vidinius DU duomenis (kiekvienas keitimas - AdminViewAsLog)

Taisyklės:
  * be antraščių arba ne superuser - elgiasi lygiai kaip CookiesJWTAuthentication;
  * tik skaitymas: GET / HEAD / OPTIONS + keli „peržiūros“ POST (READ_POSTS);
  * „Keisti“: tik WRITE_PREFIXES (DU), išskyrus BLOCKED (laiškai, Sodra / VMI, banko failai, DU tvirtinimas,
    prašymų sprendimai, prisijungimo duomenys); viskas kita (paskyra, įmonės profiliai, prenumerata,
    integracijos, eksportai) - 403;
  * peržiūros metu laiškai neišsiunčiami (outbound_blocked) ir vartotojo įrašas DB neišsaugomas.
"""
import contextvars
import json
import logging
import re

from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from .authentication import CookiesJWTAuthentication

logger = logging.getLogger("docscanner_app")

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

# visada tikras vartotojas: admin API ir prisijungimo / sesijos keliai
EXEMPT = ("/admin/", "/admin-", "/admin_", "/superuser/", "/token", "/login", "/logout", "/refresh", "/authenticated", "/register", "/password-reset")

# POST, kurie nieko svarbaus nekeičia (peržiūros) - leidžiami ir „tik skaitymas“ režimu
READ_POSTS = [
    (re.compile(r"/payroll/runs/prepare/$"), None),            # DU puslapis atsidarant paruošia / perskaičiuoja juodraštį
    (re.compile(r"/payroll/leave-preview/$"), None),
    (re.compile(r"/payroll/trip-preview/$"), None),
    (re.compile(r"/payroll/roster/action/$"), {"publish_preview", "suggest"}),
    (re.compile(r"/fixed-assets/\d+/sale-check/$"), None),
]

# „Keisti“ režimu leidžiama tik čia (DokSkenas vidiniai DU duomenys)
WRITE_PREFIXES = ("/payroll/",)

# net ir „Keisti“ režimu - draudžiama (išoriniai veiksmai ar kliento sprendimai)
BLOCKED = [
    (re.compile(r"/payroll/employees/\d+/invite/$"), "kvietimas į eSavitarną (laiškas darbuotojui)"),
    (re.compile(r"/payroll/declarations/\d+/(submit|check|status)/$"), "deklaracijų pateikimas / būsena Sodroje ir VMI"),
    (re.compile(r"/payroll/settings/test-vmi/$"), "jungtis prie VMI"),
    (re.compile(r"/payroll/settings/$"), "DU nustatymai (prisijungimo prie Sodros / VMI duomenys)"),
    (re.compile(r"/payroll/requests/\d+/(approve|reject)/$"), "darbuotojų prašymų sprendimai (laiškai)"),
    (re.compile(r"/payroll/payments/file/$"), "mokėjimų failas bankui"),
    (re.compile(r"/payroll/runs/\d+/(approve|reopen)/$"), "DU tvirtinimas / atšaukimas (algalapiai darbuotojams)"),
]

READ_ONLY_MESSAGE = "Peržiūros režimas – keisti negalima"

_active = contextvars.ContextVar("dokskenas_view_as", default=False)


def outbound_blocked():
    """True - šią užklausą vykdo admin „Žiūrėti kaip“: laiškų ir kitų išorinių veiksmų nedaryti."""
    return _active.get()


class ViewAsResetMiddleware:
    """Kiekvienos užklausos pradžioje ir pabaigoje „Žiūrėti kaip“ žymė nuimama (gija naudojama pakartotinai)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _active.set(False)
        try:
            return self.get_response(request)
        finally:
            _active.reset(token)


def _json_action(request):
    try:
        if request.META.get("CONTENT_TYPE", "").startswith("application/json"):
            return (json.loads(request._request.body or b"{}") or {}).get("action")
    except Exception:
        return None
    return None


def _check_method(request, write):
    if request.method in SAFE_METHODS:
        return
    path = request.path
    for rx, actions in READ_POSTS:
        if request.method == "POST" and rx.search(path) and (actions is None or _json_action(request) in actions):
            return
    if not write:
        raise PermissionDenied(READ_ONLY_MESSAGE)
    if not any(p in path for p in WRITE_PREFIXES):
        raise PermissionDenied("Peržiūros režimu galima keisti tik DU duomenis")
    for rx, what in BLOCKED:
        if rx.search(path):
            raise PermissionDenied(f"Peržiūros režimu negalima: {what}")


def _guard_save(target, write):
    """Vartotojo įrašas peržiūros metu DB nekeičiamas (ypač active_company_profile)."""
    orig = target.save

    def save(*args, **kwargs):
        if not write:
            return None
        fields = kwargs.get("update_fields")
        if fields is None:
            fields = [f.name for f in target._meta.concrete_fields if not f.primary_key]
        fields = [f for f in fields if f not in ("active_company_profile", "active_company_profile_id")]
        if not fields:
            return None
        kwargs["update_fields"] = fields
        return orig(*args, **kwargs)

    target.save = save


class ViewAsJWTAuthentication(CookiesJWTAuthentication):
    def authenticate(self, request):
        res = super().authenticate(request)
        if res is None:
            return None
        user, token = res
        uid = request.META.get("HTTP_X_VIEW_AS_USER")
        if not uid or not getattr(user, "is_superuser", False) or any(x in request.path for x in EXEMPT):
            return res

        from .models import CompanyProfile, CustomUser
        target = CustomUser.objects.filter(pk=uid).first()
        if target is None:
            raise AuthenticationFailed("Žiūrėti kaip: vartotojas nerastas")
        cp = None
        cid = request.META.get("HTTP_X_VIEW_AS_COMPANY")
        if cid:
            cp = CompanyProfile.objects.filter(pk=cid, user=target).first()
            if cp is None:
                raise AuthenticationFailed("Žiūrėti kaip: įmonė nepriklauso vartotojui")
            target.active_company_profile = cp          # tik atmintyje

        write = request.META.get("HTTP_X_VIEW_AS_WRITE") == "1"
        _active.set(True)
        _check_method(request, write)
        if request.method not in SAFE_METHODS:
            _log_write(user, target, cp, request)

        _guard_save(target, write)
        target.impersonator = user
        request._request.impersonator = user
        return target, token


def _log_write(admin, target, cp, request):
    try:
        from .models import AdminViewAsLog
        body = ""
        ctype = request.META.get("CONTENT_TYPE", "")
        if ctype.startswith("application/json"):
            body = request._request.body[:4000].decode("utf-8", "ignore")
        elif ctype:
            body = f"({ctype.split(';')[0]})"
        AdminViewAsLog.objects.create(admin=admin, target=target, company=cp, method=request.method,
                                      path=request.path[:500], body=body)
        logger.warning("VIEW-AS %s: %s kaip %s (%s) %s", request.method, admin.email, target.email,
                       cp.id if cp else "-", request.path)
    except Exception:
        logger.exception("AdminViewAsLog įrašas nepavyko")
