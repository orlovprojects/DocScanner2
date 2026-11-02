"""
Įmonės profilio archyvavimas / atkūrimas / ištrynimas.
Archyvuota įmonė: dingsta iš perjungiklio, mokami planai atšaukiami laikotarpio pabaigoje,
periodinės sąskaitos sustabdomos, duomenys lieka. Ištrinti - tik jei įmonėje nėra apskaitos duomenų.
"""
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("docscanner_app")

SUBMITTED = ("submitted", "accepted")


def _inv_paid(cp):
    from .models import InvSubscription
    s = InvSubscription.objects.filter(company_profile=cp).first()
    if s is None:
        return None
    s.check_and_expire()
    return s if s.status == "active" and s.stripe_subscription_id else None


def _du_paid(cp):
    from .models import PayrollSubscription
    s = PayrollSubscription.objects.filter(company=cp).first()
    if s and s.stripe_subscription_id and s.status in ("active", "past_due"):
        return s
    return None


def delete_blockers(cp):
    from .models import FixedAsset, Invoice, JournalEntry, PayrollDeclaration, PayrollRun, Purchase
    from .payroll.services import CLOSED_STATUSES
    out = []
    n = Invoice.objects.filter(company_profile=cp).exclude(status="draft").count()
    if n:
        out.append(f"išrašytų sąskaitų: {n}")
    n = PayrollRun.objects.filter(company=cp, status__in=CLOSED_STATUSES).count()
    if n:
        out.append(f"patvirtintų atlyginimų mėnesių: {n}")
    n = PayrollDeclaration.objects.filter(company=cp, status__in=SUBMITTED).count()
    if n:
        out.append(f"pateiktų deklaracijų: {n}")
    if Purchase.objects.filter(company_profile=cp).exists():
        out.append("yra pirkimo dokumentų apskaitoje")
    if JournalEntry.objects.filter(company_profile=cp).exists():
        out.append("yra didžiosios knygos įrašų")
    if FixedAsset.objects.filter(company_profile=cp).exists():
        out.append("yra ilgalaikio turto")
    if _inv_paid(cp):
        out.append("aktyvus Išrašymas PRO planas")
    if _du_paid(cp):
        out.append("aktyvus DU planas")
    return out


def _switch_active(user, cp):
    user.refresh_from_db(fields=["active_company_profile"])
    if user.active_company_profile_id and user.active_company_profile_id != cp.id:
        return
    nxt = user.company_profiles.filter(archived_at__isnull=True).exclude(pk=cp.pk).first()
    if nxt:
        nxt.apply_as_active()


@transaction.atomic
def archive_company(cp, user):
    """Grąžina pranešimų sąrašą (kas atšaukta)."""
    if cp.archived_at:
        return []
    if not user.company_profiles.filter(archived_at__isnull=True).exclude(pk=cp.pk).exists():
        raise ValueError("Negalima archyvuoti vienintelės aktyvios įmonės.")
    notes = []

    inv = _inv_paid(cp)
    if inv:
        try:
            import stripe
            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Subscription.modify(inv.stripe_subscription_id, cancel_at_period_end=True)
            end = inv.plan_end.strftime("%Y-%m-%d") if inv.plan_end else ""
            notes.append(f"Išrašymas PRO planas atšauktas{f' – galios iki {end}' if end else ''}.")
        except Exception as e:  # noqa: BLE001
            logger.exception("[Archive] Inv cancel failed cp=%s", cp.id)
            raise ValueError(f"Nepavyko atšaukti Išrašymas PRO plano: {e}")

    du = _du_paid(cp)
    if du and not du.cancel_at_period_end:
        from .payroll import billing
        try:
            billing.cancel_subscription(cp)
            end = du.current_period_end.strftime("%Y-%m-%d") if du.current_period_end else ""
            notes.append(f"DU planas atšauktas{f' – galios iki {end}' if end else ''}.")
        except Exception as e:  # noqa: BLE001
            logger.exception("[Archive] DU cancel failed cp=%s", cp.id)
            raise ValueError(f"Nepavyko atšaukti DU plano: {e}")

    from .models import RecurringInvoice
    n = RecurringInvoice.objects.filter(company_profile=cp, status="active").update(status="paused")
    if n:
        notes.append(f"Sustabdyta periodinių sąskaitų: {n}.")

    cp.archived_at = timezone.now()
    cp.save(update_fields=["archived_at"])
    _switch_active(user, cp)
    return notes


def restore_company(cp):
    cp.archived_at = None
    cp.save(update_fields=["archived_at"])


@transaction.atomic
def delete_company(cp, user, confirm):
    if (confirm or "").strip().casefold() != (cp.name or "").strip().casefold():
        raise ValueError("Neteisingai įvestas įmonės pavadinimas.")
    if user.company_profiles.count() <= 1:
        raise ValueError("Negalima pašalinti paskutinės įmonės.")
    blockers = delete_blockers(cp)
    if blockers:
        raise ValueError("Įmonės ištrinti negalima: " + "; ".join(blockers) + ". Galite ją archyvuoti.")
    from .models import InvSubscription
    InvSubscription.objects.filter(company_profile=cp).delete()   # PROTECT - free eilutė trinama ranka
    was_active = user.active_company_profile_id == cp.id
    cp.delete()
    if was_active:
        user.refresh_from_db()
        nxt = user.company_profiles.filter(archived_at__isnull=True).first() or user.company_profiles.first()
        if nxt:
            nxt.apply_as_active()
