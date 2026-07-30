from django.core.management.base import BaseCommand
from django.db import transaction

from docscanner_app.models import CustomUser, CompanyProfile


# ── CompanyProfile.field : CustomUser.field ──
FIELD_MAP = {
    "name":               "company_name",
    "company_code":       "company_code",
    "vat_code":           "vat_code",
    "iban":               "company_iban",
    "address":            "company_address",
    "country_iso":        "company_country_iso",
    "accounting_program": "default_accounting_program",
}

# Профиль создаём, только если ВСЕ эти поля у юзера заполнены
REQUIRED_USER_FIELDS = [
    "company_name",
    "company_code",
    "company_country_iso",
    "default_accounting_program",
]


class Command(BaseCommand):
    help = "Sukuria CompanyProfile seniems vartotojams iš jų billing laukų."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Tik parodo, ką darytų, bet nieko nekuria.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        created = 0
        skipped_has_profile = 0
        skipped_incomplete = 0

        for user in CustomUser.objects.all().iterator():
            # уже есть профиль → пропускаем (идемпотентность)
            if CompanyProfile.objects.filter(user=user).exists():
                skipped_has_profile += 1
                continue

            # не все обязательные поля заполнены → пропускаем
            if not all(
                str(getattr(user, f, "") or "").strip() for f in REQUIRED_USER_FIELDS
            ):
                skipped_incomplete += 1
                continue

            if dry_run:
                self.stdout.write(f"[DRY] sukurtų profilį: {user.email}")
                created += 1
                continue

            with transaction.atomic():
                profile = CompanyProfile.objects.create(
                    user=user,
                    entity_type="imone",
                    is_active=True,
                    **{
                        pf: str(getattr(user, uf, "") or "")
                        for pf, uf in FIELD_MAP.items()
                    },
                )

                user.active_company_profile = profile
                user.onboarding_completed = True
                user.save(update_fields=["active_company_profile", "onboarding_completed"])

            created += 1
            self.stdout.write(f"  ✓ {user.email} → profilis #{profile.id}")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'[DRY-RUN] ' if dry_run else ''}"
            f"Sukurta: {created} | jau turėjo: {skipped_has_profile} | "
            f"nepilni duomenys: {skipped_incomplete}"
        ))