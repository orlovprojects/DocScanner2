"""
Mokėjimų (Payments) aprašymai PDF sąskaitai / mokėjimų istorijai ir Išrašymo planų statistika adminui.
payment_type: "credits" | "inv_subscription" | "du_subscription"
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import Q

logger = logging.getLogger("docscanner_app")


def _eur(cents):
    return round((cents or 0) / 100, 2)


def _period(p):
    """Stripe laikotarpio pabaiga = kito laikotarpio pradžia, todėl rodome -1 d."""
    if not (p.period_start and p.period_end):
        return ""
    end = max(p.period_end - timedelta(days=1), p.period_start)
    return f", laikotarpis {p.period_start:%Y-%m-%d} – {end:%Y-%m-%d}"


def is_yearly(p):
    meta = getattr(p, "meta", None) or {}
    if meta.get("interval"):
        return meta["interval"] == "year"
    return bool(p.period_start and p.period_end and (p.period_end - p.period_start).days > 40)


CREDIT_CODES = {100: "DOK1", 500: "DOK2", 1000: "DOK3", 5000: "DOK4", 10000: "DOK5"}


def payment_line(p):
    """Viena sąskaitos eilutė: pavadinimas, kodas, kiekis, vienetas, kaina, suma (€, su PVM jei taikomas)."""
    total = _eur(p.amount_total)
    meta = getattr(p, "meta", None) or {}
    if p.payment_type == "du_subscription":
        n = int(meta.get("employees") or 1)
        firm = f" – {meta['company_name']}" if meta.get("company_name") else ""
        name = f"DokSkenas DU modulis, mėnesinis planas ({n} darb.){firm}{_period(p)}"
        return {"pavadinimas": name, "kodas": "DU1", "kiekis": 1, "vienetas": "mėn.", "kaina": total, "suma": total}
    if p.payment_type == "inv_subscription":
        y = is_yearly(p)
        name = f"DokSkenas Išrašymas PRO, {'metinis' if y else 'mėnesinis'} planas{_period(p)}"
        return {"pavadinimas": name, "kodas": "INV2" if y else "INV1", "kiekis": 1,
                "vienetas": "metai" if y else "mėn.", "kaina": total, "suma": total}
    n = int(p.credits_purchased or 0)
    return {"pavadinimas": f"{n} DokSkeno kreditų" if n else "DokSkeno kreditai", "kodas": CREDIT_CODES.get(n, "—"),
            "kiekis": 1, "vienetas": "paketas", "kaina": total, "suma": total}


def du_buyer(p):
    """DU planas perkamas įmonei (CompanyProfile) - pirkėjas sąskaitoje yra ta įmonė."""
    from docscanner_app.models import CompanyProfile
    cid = (getattr(p, "meta", None) or {}).get("company_id")
    cp = CompanyProfile.objects.filter(pk=cid).first() if cid else None
    if not cp:
        return None

    def first(*names):
        for n in names:
            v = getattr(cp, n, None)
            if v:
                return str(v)
        return ""

    return {"pavadinimas": first("name", "company_name"), "imonesKodas": first("company_code", "code"),
            "pvmKodas": first("vat_code", "pvm_code", "company_vat_code"),
            "adresas": first("address", "company_address"), "iban": first("iban", "company_iban"),
            "salis": first("country_iso", "company_country_iso", "country")}


# ============================================================
# Admin: aktyvūs mokami Išrašymo planai
# ============================================================

def _stripe_yearly(sub_id):
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        item = stripe.Subscription.retrieve(sub_id)["items"]["data"][0]
        price = item["price"]
        return price["id"] == getattr(settings, "STRIPE_INV_PRO_YEARLY_PRICE_ID", None) or \
            (price.get("recurring") or {}).get("interval") == "year"
    except Exception:
        logger.warning("Išrašymo planas %s: nepavyko nustatyti intervalo", sub_id)
        return False


def inv_paid_split():
    from docscanner_app.models import InvSubscription, Payments
    monthly = yearly = 0
    subs = InvSubscription.objects.filter(status="active").exclude(
        Q(stripe_subscription_id__isnull=True) | Q(stripe_subscription_id=""))
    for sub in subs:
        last = (Payments.objects.filter(user_id=sub.user_id, payment_type="inv_subscription")
                .order_by("-paid_at", "-id").first())
        y = is_yearly(last) if last else _stripe_yearly(sub.stripe_subscription_id)
        if y:
            yearly += 1
        else:
            monthly += 1
    return {"paid_monthly": monthly, "paid_yearly": yearly, "paid_total": monthly + yearly}
