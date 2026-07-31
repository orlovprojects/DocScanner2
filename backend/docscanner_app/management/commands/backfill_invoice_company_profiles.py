from django.core.management.base import BaseCommand
from docscanner_app.models import Invoice, CompanyProfile, CustomUser


class Command(BaseCommand):
    help = "Backfill Invoice.company_profile for existing invoices (NULL only)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        updated = 0
        no_profile = 0
        ambiguous = 0

        for user in CustomUser.objects.all():
            null_qs = Invoice.objects.filter(
                user=user, company_profile__isnull=True,
            )
            n = null_qs.count()
            if n == 0:
                continue

            profiles = list(CompanyProfile.objects.filter(user=user))
            if not profiles:
                no_profile += n
                continue

            target = None
            active_id = getattr(user, "active_company_profile_id", None)
            if active_id:
                target = next((p for p in profiles if p.id == active_id), None)
            if target is None and len(profiles) == 1:
                target = profiles[0]

            if target is None:
                ambiguous += n
                continue

            if not dry:
                null_qs.update(company_profile=target)
            updated += n

        self.stdout.write(self.style.SUCCESS(
            f"{'[DRY] ' if dry else ''}Updated: {updated} | "
            f"no profile: {no_profile} | ambiguous: {ambiguous}"
        ))