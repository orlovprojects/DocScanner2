import os
import logging
from datetime import datetime
from decimal import Decimal
from django.db.models import Sum

from django.conf import settings
from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.utils import timezone

from ..models import (
    BankStatement, IncomingTransaction, OutgoingTransaction,
    PaymentAllocation, normalize_name, Invoice
)
from ..utils.bank_statement_parcers import (
    detect_bank_from_content, detect_format_from_content, get_parser,
)
from ..utils.payment_invoice_matching import InvoiceMatchingEngine


logger = logging.getLogger("docscanner_app")


# Where to save raw uploaded files for debugging
BANK_IMPORT_DIR = os.path.join(
    getattr(settings, "MEDIA_ROOT", ""),
    "bank_imports",
)


class BankImportError(Exception):
    pass


class BankImportService:
    """Импорт банковской выписки: файл → validate → save raw → parse → dedup → match."""

    ALLOWED_EXTENSIONS = {".csv", ".xml"}
    ALLOWED_CONTENT_TYPES = {
        "text/csv", "text/xml", "application/xml",
        "application/vnd.ms-excel",  # some systems send CSV as this
        "text/plain",  # some CSVs come as text/plain
    }
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

    def __init__(self, user):
        self.user = user

    def import_statement(self, file, bank_name="", file_format="",
                         original_filename="") -> BankStatement:

        filename = original_filename or getattr(file, "name", "unknown")
        logger.info("=" * 60)
        logger.info(
            "[BankImport] Start: user=%s, filename=%s, bank=%s, format=%s",
            self.user.id, filename, bank_name or "auto", file_format or "auto",
        )

        # ── 1. Read content ────────────────────────────────────
        content = file.read() if hasattr(file, "read") else file
        if hasattr(file, "seek"):
            file.seek(0)

        logger.info("[BankImport] File size: %d bytes", len(content))

        # ── 2. Validate extension ──────────────────────────────
        ext = os.path.splitext(filename)[1].lower() if filename else ""
        logger.info("[BankImport] Extension: '%s'", ext)

        if ext and ext not in self.ALLOWED_EXTENSIONS:
            logger.warning(
                "[BankImport] REJECTED: unsupported extension '%s'", ext
            )
            raise BankImportError(
                f"Netinkamas failo formatas: {ext}. "
                f"Priimami tik CSV ir XML failai."
            )

        # ── 3. Validate size ──────────────────────────────────
        if len(content) > self.MAX_FILE_SIZE:
            raise BankImportError(
                f"Failas per didelis ({len(content) // 1024 // 1024} MB). "
                f"Maksimalus dydis: {self.MAX_FILE_SIZE // 1024 // 1024} MB."
            )

        if len(content) < 10:
            raise BankImportError("Failas tuščias arba per mažas.")

        # ── 4. Save raw file to disk (for debugging) ──────────
        saved_path = self._save_raw_file(content, filename)
        logger.info("[BankImport] Raw file saved: %s", saved_path)

        # ── 5. Detect bank ─────────────────────────────────────
        if not bank_name:
            bank_name = detect_bank_from_content(content) or ""
            logger.info("[BankImport] Auto-detected bank: '%s'", bank_name)
            if not bank_name:
                logger.warning("[BankImport] FAILED: could not detect bank")
                raise BankImportError(
                    "Nepavyko automatiškai nustatyti banko. "
                    "Pasirinkite banką rankiniu būdu."
                )
        else:
            logger.info("[BankImport] Bank provided: '%s'", bank_name)

        # ── 6. Detect format ───────────────────────────────────
        if not file_format:
            file_format = detect_format_from_content(content)
            logger.info("[BankImport] Auto-detected format: '%s'", file_format)
        else:
            logger.info("[BankImport] Format provided: '%s'", file_format)

        # ── 7. Create BankStatement record ─────────────────────
        stmt = BankStatement.objects.create(
            user=self.user,
            bank_name=bank_name,
            file=file if hasattr(file, "read") else None,
            file_format=file_format,
            original_filename=filename,
            status="processing",
        )
        logger.info("[BankImport] BankStatement created: id=%s", stmt.id)

        # ── 8. Parse ───────────────────────────────────────────
        try:
            parser = get_parser(bank_name, file_format)
            logger.info(
                "[BankImport] Parser: %s (bank=%s, format=%s)",
                parser.__class__.__name__, bank_name, file_format,
            )

            # Log first 500 chars for debugging separator/encoding issues
            try:
                encoding = parser._detect_encoding(content)
                preview = content.decode(encoding)[:500]
                logger.info("[BankImport] Encoding: %s", encoding)
                logger.info("[BankImport] File preview (first 500 chars):\n%s", preview)
            except Exception:
                logger.info("[BankImport] Could not preview file content")

            raw = parser.parse(content)
            logger.info("[BankImport] Parsed rows: %d", len(raw) if raw else 0)

            if raw:
                for i, txn in enumerate(raw[:3]):
                    logger.info(
                        "[BankImport] Sample row %d: date=%s, amount=%s, "
                        "direction=%s, counterparty=%s, purpose=%s",
                        i + 1,
                        txn.get("transaction_date"),
                        txn.get("amount"),
                        txn.get("direction"),
                        (txn.get("counterparty_name", ""))[:50],
                        (txn.get("payment_purpose", ""))[:50],
                    )

            if not raw:
                stmt.status = "error"
                stmt.error_message = "Faile nerasta operacijų."
                stmt.save()
                logger.warning(
                    "[BankImport] No transactions found in file. "
                    "Raw file saved at: %s", saved_path,
                )
                logger.info("=" * 60)
                return stmt

            meta = parser._extract_metadata(raw)
            stmt.period_from = meta.get("period_from")
            stmt.period_to = meta.get("period_to")
            stmt.account_iban = self._extract_iban(content)

            logger.info(
                "[BankImport] Metadata: period=%s..%s, iban=%s",
                stmt.period_from, stmt.period_to, stmt.account_iban,
            )

            # ── 9+10. Create transactions + match in atomic block ──
            # If matching fails, transactions are rolled back too
            with db_transaction.atomic():
                created_inc, created_out, dupes = self._create_transactions(stmt, raw)

                logger.info(
                    "[BankImport] Transactions created: incoming=%d, outgoing=%d, dupes=%d",
                    len(created_inc), len(created_out), dupes,
                )

                stmt.duplicates_skipped = dupes

                if created_inc:
                    logger.info(
                        "[BankImport] Starting matching for %d incoming transactions...",
                        len(created_inc),
                    )
                    engine = InvoiceMatchingEngine(self.user)
                    results = engine.match_transactions(created_inc)
                    engine.apply_results(results)

                    matched = sum(
                        1 for r in results
                        if getattr(r, "status", "unmatched") != "unmatched"
                    )
                    logger.info(
                        "[BankImport] Matching complete: %d/%d matched",
                        matched, len(results),
                    )

                    # ── Auto SF creation for auto_matched invoices ──
                    for r in results:
                        if getattr(r, "status", "") == "auto_matched":
                            for prop in r.allocations:
                                try:
                                    from .auto_sf import maybe_auto_create_sf
                                    from ..models import Invoice
                                    inv = Invoice.objects.get(id=prop.invoice_id)
                                    created_sf = maybe_auto_create_sf(inv)
                                    if created_sf:
                                        logger.info(
                                            "[BankImport] Auto SF created: %s for invoice %s",
                                            created_sf.full_number, inv.full_number,
                                        )
                                except Exception as e:
                                    logger.warning(
                                        "[BankImport] Auto SF failed for invoice %s: %s",
                                        prop.invoice_id, e,
                                    )

            stmt.status = "processed"
            stmt.save()
            stmt.refresh_stats()

            logger.info(
                "[BankImport] SUCCESS: stmt=%s, incoming=%d, outgoing=%d, dupes=%d",
                stmt.id, len(created_inc), len(created_out), dupes,
            )
            logger.info("=" * 60)
            return stmt

        except BankImportError:
            raise
        except Exception as e:
            logger.exception("[BankImport] PARSE ERROR for statement %s", stmt.id)
            logger.info("[BankImport] Raw file available at: %s", saved_path)
            stmt.status = "error"
            stmt.error_message = str(e)[:1000]
            stmt.save()
            logger.info("=" * 60)
            raise BankImportError(f"Importavimo klaida: {e}") from e

    def re_match_statement(self, stmt: BankStatement):
        """Повторный matching для unmatched/likely транзакций."""
        txns = stmt.incoming_transactions.filter(
            match_status__in=["unmatched", "likely_matched"],
        )
        if not txns.exists():
            return

        PaymentAllocation.objects.filter(
            incoming_transaction__in=txns, status="proposed",
        ).delete()

        engine = InvoiceMatchingEngine(self.user)
        results = engine.match_transactions(list(txns))
        engine.apply_results(results)
        stmt.refresh_stats()

    # ── Private ─────────────────────────────────────────────

    def _save_raw_file(self, content: bytes, filename: str) -> str:
        """
        Save raw uploaded file to disk for debugging.
        Path: MEDIA_ROOT/bank_imports/user_{id}/{date}_{filename}
        """
        try:
            user_dir = os.path.join(BANK_IMPORT_DIR, f"user_{self.user.id}")
            os.makedirs(user_dir, exist_ok=True)

            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = "".join(
                c if c.isalnum() or c in "._-" else "_"
                for c in filename
            )
            save_path = os.path.join(user_dir, f"{ts}_{safe_name}")

            with open(save_path, "wb") as f:
                f.write(content)

            return save_path
        except Exception as e:
            logger.warning("[BankImport] Could not save raw file: %s", e)
            return "(failed to save)"

    def _create_transactions(self, stmt, raw_list):
        created_inc = []
        created_out = []
        dupes = 0

        for raw in raw_list:
            if not raw.get("transaction_date") or not raw.get("amount"):
                continue

            direction = raw.get("direction", "credit")
            Model = IncomingTransaction if direction == "credit" else OutgoingTransaction

            txn = Model(
                user=self.user,
                bank_statement=stmt,
                source="bank_import",
                transaction_date=raw["transaction_date"],
                value_date=raw.get("value_date"),
                doc_number=raw.get("doc_number", ""),
                bank_operation_code=raw.get("bank_operation_code", ""),
                counterparty_name=raw.get("counterparty_name", ""),
                counterparty_name_normalized=normalize_name(
                    raw.get("counterparty_name", "")
                ),
                counterparty_code=raw.get("counterparty_code", ""),
                counterparty_account=raw.get("counterparty_account", ""),
                payment_purpose=raw.get("payment_purpose", ""),
                reference_number=raw.get("reference_number", ""),
                amount=raw["amount"],
                currency=raw.get("currency", "EUR"),
            )
            txn.transaction_hash = txn.compute_hash()

            try:
                with db_transaction.atomic():
                    txn.save()
                if direction == "credit":
                    created_inc.append(txn)
                else:
                    created_out.append(txn)
            except IntegrityError:
                dupes += 1

        return created_inc, created_out, dupes

    def _extract_iban(self, content: bytes) -> str:
        import re
        text = ""
        for enc in ("utf-8-sig", "utf-8", "windows-1257"):
            try:
                text = content[:3000].decode(enc)
                break
            except UnicodeDecodeError:
                continue
        ibans = re.findall(r"LT\d{18}", text)
        return ibans[0] if ibans else ""


# ────────────────────────────────────────────────────────────
# PaymentService — управление платежами
# ────────────────────────────────────────────────────────────


class PaymentService:
    """
    Центральный сервис для всех операций с платежами Invoice.

    Используется:
      - invoice_mark_paid view (ручная пометка)
      - bank import matching (автоматическая)
      - webhook handlers (payment link — потом)
      - confirm/reject proposed allocations
    """

    def __init__(self, user):
        self.user = user

    def mark_paid_manual(self, invoice, amount, payment_date, note=""):
        """
        Ручная пометка Invoice как оплаченный.
        Создаёт PaymentAllocation с source="manual", без транзакции.

        Args:
            invoice: Invoice instance
            amount: Decimal — сумма (может быть частичная)
            payment_date: date — дата оплаты
            note: str — комментарий юзера

        Returns:
            PaymentAllocation instance
        """
        alloc = PaymentAllocation.objects.create(
            incoming_transaction=None,
            invoice=invoice,
            source="manual",
            status="manual",
            amount=amount,
            payment_date=payment_date,
            confidence=Decimal("1.00"),
            match_reasons={"manual": True},
            note=note,
            confirmed_at=timezone.now(),
            confirmed_by=self.user,
        )

        invoice.recalc_payment_status()
        return alloc

    def confirm_allocation(self, allocation_id):
        """Юзер подтверждает proposed allocation."""
        alloc = PaymentAllocation.objects.select_related(
            "incoming_transaction", "invoice",
        ).get(id=allocation_id, invoice__user=self.user)

        alloc.status = "confirmed"
        alloc.confirmed_at = timezone.now()
        alloc.confirmed_by = self.user
        alloc.save(update_fields=["status", "confirmed_at", "confirmed_by"])

        # Обновляем транзакцию
        if alloc.incoming_transaction:
            txn = alloc.incoming_transaction
            has_proposed = txn.allocations.filter(status="proposed").exists()
            if not has_proposed:
                txn.match_status = "confirmed"
                txn.save(update_fields=["match_status", "updated_at"])

        # Пересчитываем invoice
        alloc.invoice.recalc_payment_status()

        # ── Refresh bank statement counters ──
        if alloc.incoming_transaction and alloc.incoming_transaction.bank_statement:
            alloc.incoming_transaction.bank_statement.refresh_stats()

        return alloc

    def reject_allocation(self, allocation_id):
        """Юзер отклоняет proposed allocation."""
        alloc = PaymentAllocation.objects.get(
            id=allocation_id, invoice__user=self.user,
        )
        txn = alloc.incoming_transaction
        alloc.delete()

        # Пересчитываем транзакцию
        if txn:
            new_total = (
                txn.allocations.aggregate(t=Sum("amount"))["t"]
                or Decimal("0")
            )
            txn.allocated_amount = new_total
            if not txn.allocations.exists():
                txn.match_status = "unmatched"
                txn.match_confidence = Decimal("0")
            txn.save(update_fields=[
                "allocated_amount", "match_status", "match_confidence", "updated_at",
            ])

            # ── Refresh bank statement counters ──
            if txn.bank_statement:
                txn.bank_statement.refresh_stats()

    def remove_manual_payment(self, allocation_id):
        """Удаление ручной пометки оплаты."""
        alloc = PaymentAllocation.objects.get(
            id=allocation_id,
            invoice__user=self.user,
            source="manual",
        )
        invoice = alloc.invoice
        alloc.delete()
        invoice.recalc_payment_status()

        # no bank_statement to refresh (manual has no transaction)

    def manual_match(self, transaction_id, invoice_id, amount=None):
        """Юзер вручную привязывает транзакцию к invoice."""

        txn = IncomingTransaction.objects.get(id=transaction_id, user=self.user)
        invoice = Invoice.objects.get(id=invoice_id, user=self.user)

        if amount is None:
            amount = min(txn.unallocated_amount, invoice.amount_with_vat or Decimal("0"))

        alloc, _ = PaymentAllocation.objects.update_or_create(
            incoming_transaction=txn,
            invoice=invoice,
            defaults={
                "amount": amount,
                "source": txn.source,
                "status": "manual",
                "confidence": Decimal("1.00"),
                "match_reasons": {"manual_match": True},
                "payment_date": txn.transaction_date,
                "confirmed_at": timezone.now(),
                "confirmed_by": self.user,
            },
        )

        txn.allocated_amount = (
            txn.allocations.aggregate(t=Sum("amount"))["t"] or Decimal("0")
        )
        txn.match_status = "manually_matched"
        txn.save(update_fields=["allocated_amount", "match_status", "updated_at"])

        invoice.recalc_payment_status()

        if txn.bank_statement:
            txn.bank_statement.refresh_stats()

        return alloc

    def get_invoice_payment_details(self, invoice):
        """
        Получить полную информацию о платежах invoice для модалки.

        Returns:
            {
                "invoice_total": Decimal,
                "paid_amount": Decimal,
                "remaining": Decimal,
                "payment_status": str,
                "allocations": [
                    {
                        "id": int,
                        "source": str,
                        "status": str,
                        "amount": Decimal,
                        "payment_date": date,
                        "confidence": Decimal,
                        "match_reasons": dict,
                        "note": str,
                        "transaction": { ...bank data... } | None,
                    },
                    ...
                ],
            }
        """
        allocs = (
            invoice.payment_allocations
            .select_related("incoming_transaction", "incoming_transaction__bank_statement")
            .order_by("-created_at")
        )

        allocations_data = []
        for a in allocs:
            entry = {
                "id": a.id,
                "source": a.source,
                "source_display": a.get_source_display(),
                "status": a.status,
                "status_display": a.get_status_display(),
                "amount": a.amount,
                "payment_date": a.effective_payment_date,
                "confidence": a.confidence,
                "match_reasons": a.match_reasons,
                "note": a.note,
                "created_at": a.created_at,
                "transaction": None,
            }

            if a.incoming_transaction:
                txn = a.incoming_transaction
                entry["transaction"] = {
                    "id": txn.id,
                    "transaction_date": txn.transaction_date,
                    "counterparty_name": txn.counterparty_name,
                    "counterparty_code": txn.counterparty_code,
                    "counterparty_account": txn.counterparty_account,
                    "payment_purpose": txn.payment_purpose,
                    "bank_operation_code": txn.bank_operation_code,
                    "amount": txn.amount,
                    "currency": txn.currency,
                    "source": txn.source,
                    "source_display": txn.get_source_display(),
                    "bank_name": (
                        txn.bank_statement.get_bank_name_display()
                        if txn.bank_statement else ""
                    ),
                    "bank_period": (
                        f"{txn.bank_statement.period_from}–{txn.bank_statement.period_to}"
                        if txn.bank_statement else ""
                    ),
                }

            allocations_data.append(entry)

        invoice_total = invoice.amount_with_vat or Decimal("0")
        paid_amount = invoice.paid_amount or Decimal("0")

        return {
            "invoice_id": invoice.id,
            "invoice_number": invoice.full_number,
            "invoice_total": invoice_total,
            "paid_amount": paid_amount,
            "remaining": max(invoice_total - paid_amount, Decimal("0")),
            "payment_status": invoice.status,
            "allocations": allocations_data,
        }