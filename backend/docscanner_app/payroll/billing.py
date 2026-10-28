"""
DU planas: 30 d. bandomasis laikotarpis + Stripe mėnesinė prenumerata pagal aktyvių darbuotojų skaičių.

Kaina (Stripe „graduated“ kaina, STRIPE_DU_PRICE_ID):
    iki 10 darbuotojų - 20 € / mėn. (fiksuota),  11-100 - po 2 €,  nuo 101 - po 1 €.
Be plano (pasibaigus bandomajam): negalima tvirtinti DU ir skelbti grafikų; visa kita veikia.
Įjungiama PAYROLL_BILLING_ENABLED=true (.env) - iki tol viskas leidžiama ir baneris nerodomas.

Darbuotojų skaičiaus pokyčiai: kasdien (sync_payroll_subscriptions) prieš kiekvieną mokėjimą Stripe kiekis
nustatomas pagal darbuotojus, dirbusius besibaigiančiu laikotarpiu - naujas kiekis taikomas nuo kito mokėjimo,
atgal nieko neperskaičiuojama.
"""
import json
import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger("docscanner_app")

TRIAL_DAYS = 30
MIN_PRICE, MIN_INCLUDED, PRICE_TO_100, PRICE_FROM_101 = 20, 10, 2, 1
PRICE_TEXT = "iki 10 darbuotojų – 20 €/mėn., 11–100 – po 2 €, nuo 101 – po 1 € už darbuotoją"


class PlanRequired(ValueError):
    pass


def enabled():
    return str(getattr(settings, "PAYROLL_BILLING_ENABLED", "") or "").lower() in ("1", "true", "yes")


def price_for(n):
    """€ per mėnesį (be PVM) - tas pats kaip Stripe graduated kaina."""
    n = max(int(n or 0), 0)
    if n <= MIN_INCLUDED:
        return MIN_PRICE
    return MIN_PRICE + PRICE_TO_100 * (min(n, 100) - MIN_INCLUDED) + PRICE_FROM_101 * max(n - 100, 0)


def active_employee_count(company, start=None, end=None):
    """Darbuotojai, kurių sutartis galiojo bent vieną dieną [start, end] (be juodraščių)."""
    from docscanner_app.models import EmploymentContract
    today = timezone.localdate()
    start, end = start or today, end or today
    return (EmploymentContract.objects.filter(employee__company=company, start_date__lte=end)
            .exclude(status="draft")
            .filter(Q(termination_date__isnull=True) | Q(termination_date__gte=start))
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=start) | Q(termination_date__gte=start))
            .values("employee_id").distinct().count())


def _sub(company):
    from docscanner_app.models import PayrollSubscription
    return PayrollSubscription.objects.get_or_create(company=company)[0]


def payroll_access(company):
    """Būsena frontendui ir patikroms: none | trial | active | past_due | expired."""
    n = active_employee_count(company)
    base = {"enabled": enabled(), "employees": n, "price": price_for(n), "price_text": PRICE_TEXT,
            "trial_days": TRIAL_DAYS}
    if not enabled():
        return {**base, "state": "free", "can_approve": True}
    s = _sub(company)
    now = timezone.now()
    state = "none"
    if s.status == "active":
        state = "active"
    elif s.status == "past_due":
        state = "past_due"                                    # Stripe dar bando nuskaičiuoti - leidžiama
    elif s.status == "canceled":
        state = "active" if s.current_period_end and s.current_period_end > now else "expired"
    elif s.status == "trial":
        state = "trial" if s.trial_ends_at and s.trial_ends_at > now else "expired"
    days_left = None
    if state == "trial":
        days_left = max(0, (s.trial_ends_at - now).days + (1 if (s.trial_ends_at - now).seconds else 0))
    return {**base, "state": state, "can_approve": state in ("trial", "active", "past_due"),
            "trial_ends_at": s.trial_ends_at, "days_left": days_left,
            "current_period_end": s.current_period_end, "cancel_at_period_end": s.cancel_at_period_end,
            "billed_employees": s.billed_employees, "has_subscription": bool(s.stripe_subscription_id)}


def require_payroll_access(company, what="DU tvirtinimui"):
    a = payroll_access(company)
    if a["can_approve"]:
        return a
    if a["state"] == "none":
        raise PlanRequired(f"{what} pradėkite nemokamą {TRIAL_DAYS} d. bandomąjį laikotarpį arba užsakykite DU planą")
    raise PlanRequired(f"Bandomasis laikotarpis baigėsi – {what} reikalingas DU planas")


def start_trial(company):
    s = _sub(company)
    if s.status != "none":
        raise ValueError("Bandomasis laikotarpis jau buvo pradėtas")
    now = timezone.now()
    s.status, s.trial_started_at, s.trial_ends_at = "trial", now, now + timedelta(days=TRIAL_DAYS)
    s.save(update_fields=["status", "trial_started_at", "trial_ends_at", "updated_at"])
    return payroll_access(company)


# ============================================================
# Stripe
# ============================================================

def _stripe():
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _plain(o):
    for m in ("to_dict_recursive", "to_dict"):
        if hasattr(o, m):
            return getattr(o, m)()
    return o


def _customer(user):
    stripe = _stripe()
    if user.stripe_customer_id:
        return user.stripe_customer_id
    c = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
    user.stripe_customer_id = c["id"]
    user.save(update_fields=["stripe_customer_id"])
    return c["id"]


def _front(path):
    return f"{settings.SITE_URL_FRONTEND.rstrip('/')}{path}"


def create_checkout(company, user):
    s = _sub(company)
    if s.stripe_subscription_id and s.status in ("active", "past_due"):
        raise ValueError("DU planas jau užsakytas - valdykite jį per „Mokėjimo nustatymai“")
    stripe = _stripe()
    n = max(active_employee_count(company), 1)
    meta = {"product": "du", "company_id": str(company.id), "user_id": str(user.id)}
    sub_data = {"metadata": meta, "description": f"DokSkenas DU – {company.name}"}
    if s.status == "trial" and s.trial_ends_at and s.trial_ends_at > timezone.now() + timedelta(hours=49):
        sub_data["trial_end"] = int(s.trial_ends_at.timestamp())       # mokėti tik pasibaigus bandomajam
    session = stripe.checkout.Session.create(
        mode="subscription", customer=_customer(user), client_reference_id=str(company.id),
        line_items=[{"price": settings.STRIPE_DU_PRICE_ID, "quantity": n}],
        subscription_data=sub_data, metadata=meta, locale="lt", allow_promotion_codes=True,
        success_url=_front("/darbo-uzmokestis?du_plan=success"), cancel_url=_front("/darbo-uzmokestis"))
    return session["url"]


def create_portal(company, user):
    if not user.stripe_customer_id:
        raise ValueError("Mokėjimų paskyra dar nesukurta")
    session = _stripe().billing_portal.Session.create(customer=user.stripe_customer_id,
                                                      return_url=_front("/darbo-uzmokestis"))
    return session["url"]


STATUS_MAP = {"trialing": "active", "active": "active", "past_due": "past_due", "unpaid": "past_due",
              "canceled": "canceled", "incomplete_expired": "canceled"}


def _apply_subscription(sub):
    from docscanner_app.models import PayrollSubscription
    from datetime import datetime, timezone as dt_tz
    meta = sub.get("metadata") or {}
    if meta.get("product") != "du" or not meta.get("company_id"):
        return None
    s, _ = PayrollSubscription.objects.get_or_create(company_id=int(meta["company_id"]))
    new = STATUS_MAP.get(sub.get("status"))
    if new:
        s.status = new
    items = ((sub.get("items") or {}).get("data") or [])
    item = items[0] if items else {}
    end = sub.get("current_period_end") or item.get("current_period_end")
    s.stripe_subscription_id = sub.get("id") or s.stripe_subscription_id
    s.stripe_item_id = item.get("id") or s.stripe_item_id
    s.billed_employees = item.get("quantity") or s.billed_employees
    s.current_period_end = datetime.fromtimestamp(end, tz=dt_tz.utc) if end else s.current_period_end
    s.cancel_at_period_end = bool(sub.get("cancel_at_period_end"))
    s.save()
    logger.info("DU planas: įmonė %s -> %s (%s)", s.company_id, s.status, sub.get("status"))
    return s


def handle_webhook(payload, sig_header):
    stripe = _stripe()
    stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_DU_WEBHOOK_SECRET)   # parašo patikra
    event = json.loads(payload)
    t, obj = event.get("type", ""), (event.get("data") or {}).get("object") or {}
    if t == "checkout.session.completed":
        if obj.get("mode") == "subscription" and (obj.get("metadata") or {}).get("product") == "du":
            _apply_subscription(_plain(stripe.Subscription.retrieve(obj["subscription"])))
    elif t.startswith("customer.subscription."):
        _apply_subscription(obj)
    elif t in ("invoice.payment_failed", "invoice.paid"):
        sub_id = obj.get("subscription") or ((obj.get("parent") or {}).get("subscription_details") or {}).get("subscription")
        if sub_id:
            _apply_subscription(_plain(stripe.Subscription.retrieve(sub_id)))


@shared_task
def sync_payroll_subscriptions():
    """Kasdien: likus ≤2 d. iki mokėjimo - Stripe kiekis = darbuotojai, dirbę besibaigiančiu laikotarpiu."""
    from docscanner_app.models import PayrollSubscription
    if not enabled():
        return 0
    stripe = _stripe()
    now = timezone.now()
    changed = 0
    for s in PayrollSubscription.objects.filter(status__in=("active", "past_due")).exclude(stripe_item_id="") \
            .select_related("company"):
        if not s.current_period_end or s.current_period_end - now > timedelta(days=2) or s.cancel_at_period_end:
            continue
        start = timezone.localdate(s.current_period_end) - timedelta(days=31)
        n = max(active_employee_count(s.company, start, timezone.localdate()), 1)
        if n == s.billed_employees:
            continue
        try:
            stripe.SubscriptionItem.modify(s.stripe_item_id, quantity=n, proration_behavior="none")
            s.billed_employees = n
            s.save(update_fields=["billed_employees", "updated_at"])
            changed += 1
        except Exception:
            logger.exception("DU planas: nepavyko pakeisti kiekio, įmonė %s", s.company_id)
    return changed
