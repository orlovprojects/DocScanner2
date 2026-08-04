import logging

from django.core.management.base import BaseCommand
from django.db import transaction

from docscanner_app.models import InvoiceSettings, CompanyProfile

logger = logging.getLogger("docscanner_app")


class Command(BaseCommand):
    help = "Проставляет company_profile существующим InvoiceSettings (активный профиль юзера)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Показать, что было бы сделано, без записи в БД.",
        )

    def _resolve_profile(self, user):
        """Активный профиль юзера; если не выставлен — самый ранний. None, если фирм нет."""
        active_id = getattr(user, "active_company_profile_id", None)
        if active_id:
            prof = CompanyProfile.objects.filter(id=active_id, user=user).first()
            if prof:
                return prof, "active"
        prof = CompanyProfile.objects.filter(user=user).order_by("id").first()
        if prof:
            return prof, "fallback-earliest"
        return None, "no-profile"

    def handle(self, *args, **options):
        dry = options["dry_run"]
        prefix = "[DRY] " if dry else ""

        qs = InvoiceSettings.objects.filter(company_profile__isnull=True).select_related("user")

        assigned = 0
        skipped_no_profile = 0
        via_active = 0
        via_fallback = 0

        with transaction.atomic():
            for s in qs:
                prof, how = self._resolve_profile(s.user)
                if prof is None:
                    skipped_no_profile += 1
                    logger.info("%sskip (no profile): InvoiceSettings id=%s user=%s", prefix, s.id, s.user_id)
                    continue

                if how == "active":
                    via_active += 1
                else:
                    via_fallback += 1
                    logger.info(
                        "%sfallback-earliest: InvoiceSettings id=%s user=%s -> profile id=%s",
                        prefix, s.id, s.user_id, prof.id,
                    )

                if not dry:
                    s.company_profile = prof
                    s.save(update_fields=["company_profile"])
                assigned += 1

            if dry:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(f"{prefix}InvoiceSettings assigned: {assigned}"))
        self.stdout.write(f"{prefix}  via active:   {via_active}")
        self.stdout.write(f"{prefix}  via fallback: {via_fallback}")
        self.stdout.write(f"{prefix}skip (no profile): {skipped_no_profile}")