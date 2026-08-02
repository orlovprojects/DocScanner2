from django.core.management.base import BaseCommand
from docscanner_app.models import InvoiceSeries, CompanyProfile, CustomUser


class Command(BaseCommand):
    help = "Backfill InvoiceSeries.company_profile (NULL only)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        updated = 0
        skipped_no_profile = 0
        skipped_ambiguous = 0

        for user in CustomUser.objects.all().iterator():
            target_id = getattr(user, "active_company_profile_id", None)
            if not target_id:
                profile_ids = list(
                    CompanyProfile.objects.filter(user=user)
                    .values_list("id", flat=True)[:2]
                )
                if len(profile_ids) == 1:
                    target_id = profile_ids[0]
                elif not profile_ids:
                    skipped_no_profile += 1
                    continue
                else:
                    skipped_ambiguous += 1
                    continue

            qs = InvoiceSeries.objects.filter(user=user, company_profile__isnull=True)
            if dry:
                updated += qs.count()
            else:
                updated += qs.update(company_profile_id=target_id)

        prefix = "[DRY] " if dry else ""
        self.stdout.write(f"{prefix}InvoiceSeries: {updated}")
        self.stdout.write(
            f"{prefix}skip (no profile): {skipped_no_profile} | "
            f"skip (ambiguous): {skipped_ambiguous}"
        )