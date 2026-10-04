import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

try:
    from disposable_email_domains import blocklist as DISPOSABLE_DOMAINS
except ImportError:
    DISPOSABLE_DOMAINS = set()

EXTRA_DISPOSABLE = {
    "mozmail.com", "mailforspam.com", "fxavaj.com",
    "suahi.com", "meikeya.com", "luckfeed.com",
}

GMAIL_DOMAINS = {"gmail.com", "googlemail.com"}
MAX_REGISTRATIONS_PER_IP_24H = 3
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(email):
    return (email or "").strip().lower()


def canonical_email(email):
    email = normalize_email(email)
    if email.startswith("@"):
        return email
    local, _, domain = email.partition("@")
    local = local.split("+", 1)[0]
    if domain in GMAIL_DOMAINS:
        local = local.replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}"


def is_disposable(domain):
    parts = domain.split(".")
    for i in range(len(parts) - 1):
        d = ".".join(parts[i:])
        if d in DISPOSABLE_DOMAINS or d in EXTRA_DISPOSABLE:
            return True
    return False


def email_already_registered(email):
    User = get_user_model()
    canon = canonical_email(email)
    local, _, domain = canon.partition("@")
    if domain == "gmail.com":
        candidates = User.objects.filter(
            Q(email__iendswith="@gmail.com") | Q(email__iendswith="@googlemail.com")
        ).values_list("email", flat=True)
        return any(canonical_email(e) == canon for e in candidates)
    return User.objects.filter(
        Q(email__iexact=canon) | Q(email__istartswith=f"{local}+", email__iendswith=f"@{domain}")
    ).exists()


def check_registration(email, ip):
    """Grąžina (klaidos_tekstas, http_status) arba None, jei viskas gerai."""
    from ..models import BlockedEmail

    email = normalize_email(email)
    if not EMAIL_RE.match(email):
        return "Neteisingas el. pašto formatas.", 400

    domain = email.partition("@")[2]
    canon = canonical_email(email)

    if BlockedEmail.objects.filter(email__in=[canon, f"@{domain}"]).exists():
        return "Registracija negalima. Susisiekite su mumis.", 403

    if is_disposable(domain):
        return "Vienkartiniai el. pašto adresai nepriimami. Naudokite savo nuolatinį el. paštą.", 400

    if email_already_registered(email):
        return "Paskyra su šiuo el. paštu jau egzistuoja. Gal norėjote prisijungti?", 400

    if ip:
        since = timezone.now() - timedelta(hours=24)
        recent = get_user_model().objects.filter(registration_ip=ip, date_joined__gte=since).count()
        if recent >= MAX_REGISTRATIONS_PER_IP_24H:
            return "Per daug registracijų iš šio tinklo. Bandykite vėliau arba susisiekite su mumis.", 429

    return None