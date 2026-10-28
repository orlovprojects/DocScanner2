from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Įjungiant DU mokėjimus: esamoms įmonėms su darbuotojais pradedamas bandomasis laikotarpis"

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=60)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        from docscanner_app.models import CompanyProfile, Employee, PayrollSubscription
        now = timezone.now()
        ids = set(Employee.objects.values_list("company_id", flat=True))
        n = 0
        for cp in CompanyProfile.objects.filter(id__in=ids, accounting_program="dokskenas_erp"):
            s, _ = PayrollSubscription.objects.get_or_create(company=cp)
            if s.status != "none":
                continue
            n += 1
            self.stdout.write(f"{cp.id} {cp.name}")
            if not opts["dry_run"]:
                s.status, s.trial_started_at, s.trial_ends_at = "trial", now, now + timedelta(days=opts["days"])
                s.save()
        self.stdout.write(f"Bandomasis laikotarpis ({opts['days']} d.) pradėtas: {n}" + (" (dry-run)" if opts["dry_run"] else ""))
