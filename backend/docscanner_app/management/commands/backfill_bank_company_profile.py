"""
Backfill company_profile на BankStatement / IncomingTransaction / OutgoingTransaction.

Запускать ВРУЧНУЮ после миграции, добавляющей FK company_profile:
    python manage.py backfill_bank_company_profile --dry-run   # посмотреть
    python manage.py backfill_bank_company_profile             # применить

Логика:
  BankStatement          → активный CompanyProfile юзера (или первый по id)
  Incoming/Outgoing txn  → cp из своей выписки; если выписки нет — активный cp юзера
"""

from django.core.management.base import BaseCommand

from docscanner_app.models import (
    BankStatement,
    IncomingTransaction,
    OutgoingTransaction,
    CompanyProfile,
)


class Command(BaseCommand):
    help = "Проставить company_profile существующим банковским выпискам и транзакциям"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Только показать, ничего не сохранять",
        )

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        self._cp_cache = {}

        stmt_done = self._backfill_statements(dry)
        txn_done = self._backfill_transactions(dry)

        self.stdout.write(self.style.SUCCESS(
            f"{'[DRY-RUN] ' if dry else ''}Готово: "
            f"выписки={stmt_done}, транзакции={txn_done}"
        ))

    # ── helpers ──

    def _cp_for_user(self, user_id):
        if user_id not in self._cp_cache:
            self._cp_cache[user_id] = (
                CompanyProfile.objects.filter(user_id=user_id, is_active=True).first()
                or CompanyProfile.objects.filter(user_id=user_id).order_by("id").first()
            )
        return self._cp_cache[user_id]

    def _backfill_statements(self, dry):
        done = 0
        skipped = 0
        for stmt in BankStatement.objects.filter(
            company_profile__isnull=True
        ).iterator():
            cp = self._cp_for_user(stmt.user_id)
            if not cp:
                skipped += 1
                self.stdout.write(
                    f"  ⚠ stmt #{stmt.id}: нет CompanyProfile у user {stmt.user_id}"
                )
                continue
            if not dry:
                stmt.company_profile_id = cp.id
                stmt.save(update_fields=["company_profile"])
            done += 1
        self.stdout.write(f"BankStatement: обновлено {done}, пропущено {skipped}")
        return done

    def _backfill_transactions(self, dry):
        done = 0
        skipped = 0
        for Model in (IncomingTransaction, OutgoingTransaction):
            for txn in Model.objects.filter(
                company_profile__isnull=True
            ).iterator():
                cp_id = None

                # 1. cp из своей выписки
                if txn.bank_statement_id:
                    cp_id = (
                        BankStatement.objects
                        .filter(id=txn.bank_statement_id)
                        .values_list("company_profile_id", flat=True)
                        .first()
                    )

                # 2. fallback: активный профиль юзера
                if not cp_id:
                    cp = self._cp_for_user(txn.user_id)
                    cp_id = cp.id if cp else None

                if not cp_id:
                    skipped += 1
                    continue
                if not dry:
                    txn.company_profile_id = cp_id
                    txn.save(update_fields=["company_profile"])
                done += 1
        self.stdout.write(f"Transactions: обновлено {done}, пропущено {skipped}")
        return done