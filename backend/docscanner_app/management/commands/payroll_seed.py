"""
DU modulio pradiniai duomenys: parametrai (2026, 2027) + sisteminiai DU kodai.
Idempotentiška - galima leisti pakartotinai (update_or_create).

    python manage.py payroll_seed
"""
import logging

from django.core.management.base import BaseCommand
from django.db import transaction

from docscanner_app.models import PayCode, PayrollParameter
from docscanner_app.payroll.seed_data import PARAMETERS, SYSTEM_PAY_CODES

logger = logging.getLogger("docscanner_app")


class Command(BaseCommand):
    help = "Užpildo DU parametrus ir sisteminius DU kodus"

    @transaction.atomic
    def handle(self, *args, **options):
        p_created = p_updated = 0
        for key, value, valid_from, valid_to, prelim, source in PARAMETERS:
            _, created = PayrollParameter.objects.update_or_create(
                key=key, valid_from=valid_from,
                defaults={"value": value, "valid_to": valid_to,
                          "is_preliminary": prelim, "source": source},
            )
            p_created += created
            p_updated += not created

        c_created = c_updated = 0
        for data in SYSTEM_PAY_CODES:
            data = dict(data)
            code = data.pop("code")
            _, created = PayCode.objects.update_or_create(
                company=None, code=code,
                defaults={**data, "is_system": True},
            )
            c_created += created
            c_updated += not created

        msg = (f"Parametrai: +{p_created} / atnaujinta {p_updated}; "
               f"DU kodai: +{c_created} / atnaujinta {c_updated}")
        logger.info("payroll_seed: %s", msg)
        self.stdout.write(self.style.SUCCESS(msg))
