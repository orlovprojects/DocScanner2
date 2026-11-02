"""
Išrašymas planas - įmonei (CompanyProfile), ne vartotojui.
Bandomasis laikotarpis - vieną kartą vartotojui (per visas jo įmones).
"""

STATUS_RANK = {"active": 3, "trial": 2, "free": 1}


def _cp_id(user, company_profile_id=None):
    return company_profile_id or getattr(user, "active_company_profile_id", None)


def cp_for_invoice_id(user, invoice_id):
    """Sąskaitos įmonė (jei nėra - aktyvi vartotojo įmonė)."""
    from .models import Invoice
    cp = None
    if invoice_id:
        cp = Invoice.objects.filter(pk=invoice_id).values_list("company_profile_id", flat=True).first()
    return _cp_id(user, cp)


def inv_sub(user, company_profile_id=None):
    """
    Įmonės Išrašymas prenumerata. Jei įmonei jos dar nėra - perimama vartotojo „be įmonės“
    (sukurta registruojantis) arba sukuriama nauja free. Be įmonės - grąžinama „be įmonės“ eilutė.
    """
    from .models import InvSubscription
    cp_id = _cp_id(user, company_profile_id)
    if not cp_id:
        return (InvSubscription.objects.filter(user=user, company_profile__isnull=True).first()
                or InvSubscription(user=user))
    sub = InvSubscription.objects.filter(company_profile_id=cp_id).first()
    if sub is None:
        orphan = InvSubscription.objects.filter(user=user, company_profile__isnull=True).first()
        if orphan:
            orphan.company_profile_id = cp_id
            orphan.save(update_fields=["company_profile"])
            sub = orphan
        else:
            sub, _ = InvSubscription.objects.get_or_create(company_profile_id=cp_id, defaults={"user": user})
    if sub.pk:
        sub.check_and_expire()
    return sub


def inv_sub_for_invoice(invoice):
    return inv_sub(invoice.user, invoice.company_profile_id)


def inv_usage(user, company_profile_id=None):
    """Free plano mėnesio limitai - įmonei."""
    from .models import InvMonthlyUsage
    return InvMonthlyUsage.get_current(user, _cp_id(user, company_profile_id))


def inv_trial_used(user):
    from .models import InvSubscription
    return InvSubscription.objects.filter(user=user, trial_used=True).exists()


def inv_best_sub(user):
    """Geriausia vartotojo prenumerata per visas įmones (admin sąrašui)."""
    from .models import InvSubscription
    subs = list(InvSubscription.objects.filter(user=user))
    return max(subs, key=lambda s: STATUS_RANK.get(s.status, 0), default=None)
