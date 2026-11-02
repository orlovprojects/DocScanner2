from datetime import timedelta

from django.db import migrations
from django.db.models import Count
from django.utils import timezone


def forwards(apps, schema_editor):
    """
    1) Kiekviena esama (vartotojo) prenumerata -> įmonei, kurioje daugiausia išrašytų sąskaitų
       (jei sąskaitų nėra - aktyviai vartotojo įmonei).
    2) Pereinamasis laikotarpis: jei prenumerata trial / active, kitos to vartotojo įmonės gauna
       tokią pat būseną iki tos pačios pabaigos (be Stripe) - kad perėjimas nieko nesugadintų.
    """
    InvSubscription = apps.get_model("docscanner_app", "InvSubscription")
    Invoice = apps.get_model("docscanner_app", "Invoice")
    CompanyProfile = apps.get_model("docscanner_app", "CompanyProfile")
    User = apps.get_model("docscanner_app", "CustomUser")
    now = timezone.now()

    for sub in list(InvSubscription.objects.filter(company_profile__isnull=True)):
        top = (Invoice.objects.filter(user_id=sub.user_id, company_profile__isnull=False)
               .exclude(status="draft").values("company_profile_id")
               .annotate(n=Count("id")).order_by("-n").first())
        user = User.objects.filter(pk=sub.user_id).first()
        cp_id = top["company_profile_id"] if top else getattr(user, "active_company_profile_id", None)
        if cp_id and not InvSubscription.objects.filter(company_profile_id=cp_id).exists():
            sub.company_profile_id = cp_id
            sub.save(update_fields=["company_profile"])

        if not sub.company_profile_id or sub.status not in ("trial", "active"):
            continue
        if sub.status == "trial":
            if not sub.trial_end or sub.trial_end < now:
                continue
            extra = {"trial_end": sub.trial_end}
        else:
            extra = {"plan": sub.plan, "plan_end": sub.plan_end or now + timedelta(days=31)}
        for cp in CompanyProfile.objects.filter(user_id=sub.user_id).exclude(pk=sub.company_profile_id):
            if InvSubscription.objects.filter(company_profile_id=cp.pk).exists():
                continue
            InvSubscription.objects.create(user_id=sub.user_id, company_profile_id=cp.pk, status=sub.status,
                                           trial_used=sub.trial_used, **extra)


class Migration(migrations.Migration):
    dependencies = [("docscanner_app", "0239_inv_sub_company")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
