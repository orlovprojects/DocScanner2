import os
import logging
import re
from datetime import datetime, date
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone

from ..models import (
    BankStatement,
    IncomingTransaction,
    OutgoingTransaction,
    PaymentAllocation,
    normalize_name,
    Invoice,
    JournalEntry,
    JournalEntryLine,
)
from ..utils.bank_statement_parcers import (
    detect_bank_from_content, detect_format_from_content, get_parser,
)
from ..utils.payment_invoice_matching import InvoiceMatchingEngine
from ..utils.journal_generators import finalize_journal_entry


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
    MAX_FILE_SIZE = 20 * 1024 * 1024  # 10 MB

    def __init__(self, user, company_profile=None):
        self.user = user
        self.company_profile = company_profile or user.active_company_profile

    def _log_duplicate(self, Model, txn, stmt, raw, direction):
        existing = (
            Model.objects
            .filter(transaction_hash=txn.transaction_hash)
            .select_related("bank_statement")
            .first()
        )

        ex_stmt = existing.bank_statement if existing else None

        logger.warning(
            "[BANK_DUPLICATE] direction=%s hash=%s "
            "NEW stmt_id=%s bank=%s stmt_iban=%s stmt_currency=%s "
            "date=%s amount=%s currency=%s doc=%r ref=%r cp_name=%r cp_code=%r cp_acc=%r purpose=%r "
            "EXISTING txn_id=%s stmt_id=%s bank=%s stmt_iban=%s stmt_currency=%s "
            "date=%s amount=%s currency=%s doc=%r ref=%r cp_name=%r cp_code=%r cp_acc=%r purpose=%r",
            direction,
            txn.transaction_hash,

            stmt.id,
            stmt.bank_name,
            stmt.account_iban,
            stmt.currency,
            txn.transaction_date,
            txn.amount,
            txn.currency,
            txn.doc_number,
            txn.reference_number,
            txn.counterparty_name,
            txn.counterparty_code,
            txn.counterparty_account,
            (txn.payment_purpose or "")[:300],

            existing.id if existing else None,
            ex_stmt.id if ex_stmt else None,
            ex_stmt.bank_name if ex_stmt else None,
            ex_stmt.account_iban if ex_stmt else None,
            ex_stmt.currency if ex_stmt else None,
            existing.transaction_date if existing else None,
            existing.amount if existing else None,
            existing.currency if existing else None,
            existing.doc_number if existing else None,
            existing.reference_number if existing else None,
            existing.counterparty_name if existing else None,
            existing.counterparty_code if existing else None,
            existing.counterparty_account if existing else None,
            (existing.payment_purpose or "")[:300] if existing else None,
        )

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

        # ── 1.1 Save raw file immediately (for debugging/audit) ─
        # Saugome prieš validacijas, kad net klaidingi importai liktų debug papkėje.
        saved_path = self._save_raw_file(content, filename)
        logger.info("[BankImport] Raw file saved: %s", saved_path)

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

        # ── 5. Detect bank ─────────────────────────────────────
        if not bank_name:
            bank_name = detect_bank_from_content(content) or ""
            logger.info("[BankImport] Auto-detected bank: '%s'", bank_name)
            if not bank_name:
                # Diagnostika: kodėl neatpažinta — parodom antraštę ir formatą
                enc_used, preview = None, ""
                for e in ("utf-8-sig", "utf-8", "windows-1257", "iso-8859-13"):
                    try:
                        preview = content[:1000].decode(e)
                        enc_used = e
                        break
                    except UnicodeDecodeError:
                        continue
                first_line = (preview.splitlines()[0] if preview else "")[:400]
                logger.warning(
                    "[BankImport] FAILED: could not detect bank. "
                    "format=%s encoding=%s first_line=%r",
                    detect_format_from_content(content), enc_used, first_line,
                )
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
            company_profile=self.company_profile,
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
            if raw:
                stmt.currency = raw[0].get("currency", "EUR")

            stmt.save(update_fields=[
                "period_from",
                "period_to",
                "account_iban",
                "currency",
                "updated_at",
            ])

            logger.info(
                "[BankImport] Metadata: period=%s..%s, iban=%s, currency=%s",
                stmt.period_from, stmt.period_to, stmt.account_iban, stmt.currency,
            )

            # ── Register / resolve bank account BEFORE matching ─────────
            try:
                from ..models import CompanyProfile

                cp = CompanyProfile.objects.filter(
                    user=self.user,
                    is_active=True,
                ).first()

                cp = self.company_profile

                if cp:
                    bank_info = cp.get_bank_chart_account(
                        iban=stmt.account_iban or "",
                        bank_name=bank_name,
                        currency=stmt.currency or "EUR",
                    )

                    logger.info(
                        "[BankImport] Bank account resolved before matching: "
                        "bank=%s iban=%s currency=%s account=%s label=%s",
                        bank_name,
                        stmt.account_iban or "",
                        stmt.currency or "EUR",
                        bank_info.get("account"),
                        bank_info.get("label"),
                    )
            except Exception as e:
                logger.warning("[BankImport] Bank account pre-resolve failed: %s", e)
            # ── Проверка пересечения периодов ──────────────
            if stmt.account_iban and stmt.period_from and stmt.period_to:
                overlap = BankStatement.objects.filter(
                    user=self.user,
                    account_iban=stmt.account_iban,
                    status="processed",
                    period_from__lte=stmt.period_to,
                    period_to__gte=stmt.period_from,
                ).exclude(id=stmt.id).first()
                if overlap:
                    logger.info(
                        "[BankImport] Period overlap with stmt %s (%s – %s), "
                        "duplicates will be skipped by hash",
                        overlap.id, overlap.period_from, overlap.period_to,
                    )

            # ── 9+10. Create transactions + match in atomic block ──
            # If matching fails, transactions are rolled back too
            with db_transaction.atomic():
                created_inc, created_out, dupes, duplicate_details = self._create_transactions(stmt, raw)

                logger.info(
                    "[BankImport] Transactions created: incoming=%d, outgoing=%d, dupes=%d",
                    len(created_inc), len(created_out), dupes,
                )

                stmt.duplicates_skipped = dupes
                stmt.duplicate_details = duplicate_details

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

                # ── Match outgoing → Purchase ──────────────────
                if created_out:
                    logger.info(
                        "[BankImport] Starting SIGNAL purchase matching for %d outgoing transactions...",
                        len(created_out),
                    )

                    from ..utils.purchase_matching_signals import SignalPurchaseMatchingEngine

                    p_engine = SignalPurchaseMatchingEngine(self.user)
                    p_results = p_engine.match_transactions(created_out)
                    p_engine.apply_results(p_results)

                    p_matched = sum(
                        1 for r in p_results
                        if getattr(r, "status", "unmatched") != "unmatched"
                    )
                    logger.info(
                        "[BankImport] Purchase matching complete: %d/%d matched",
                        p_matched, len(p_results),
                    )

                # ── Classify remaining unmatched ───────────────
                from ..utils.transaction_classifier import TransactionClassifier
                all_unmatched = list(
                    stmt.outgoing_transactions.filter(
                        match_status="unmatched", transaction_category="",
                    )
                ) + list(
                    stmt.incoming_transactions.filter(
                        match_status="unmatched", transaction_category="",
                    )
                )
                if all_unmatched:
                    classifier = TransactionClassifier(self.user)
                    classified = classifier.classify_and_apply(all_unmatched)
                    logger.info(
                        "[BankImport] Classified %d/%d unmatched transactions",
                        len(classified), len(all_unmatched),
                    )

                # ── Create DK for safe bank categories ─────────
                category_dk = BankCategoryJournalBuilder(self.user, self.company_profile)
                dk_result = category_dk.create_for_statement(stmt)
                logger.info(f"[BankImport] Category DK created: {dk_result}")

                # ── Agregatorių payout'ai → Pinigai kelyje (273) ──
                payout_dk = AggregatorPayoutJournalBuilder(self.user, self.company_profile)
                payout_result = payout_dk.create_for_statement(stmt)
                logger.info(f"[BankImport] Aggregator payouts: {payout_result}")

            stmt.status = "processed"
            stmt.save(update_fields=[
                "status",
                "duplicates_skipped",
                "duplicate_details",
                "updated_at",
            ])
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
        """Полный сброс и повторный matching всех транзакций выписки."""
        from ..models import PaymentAllocation, JournalEntry
        from ..utils.transaction_classifier import TransactionClassifier
        from ..utils.purchase_matching_signals import SignalPurchaseMatchingEngine

        with db_transaction.atomic():
            # ── 1. Собрать затронутые документы ─────────────
            affected_invoice_ids = set()
            affected_purchase_ids = set()
            je_ids_to_delete = set()

            for alloc in PaymentAllocation.objects.filter(
                incoming_transaction__bank_statement=stmt,
            ).select_related("invoice"):
                if alloc.invoice_id:
                    affected_invoice_ids.add(alloc.invoice_id)
                if alloc.journal_entry_id:
                    je_ids_to_delete.add(alloc.journal_entry_id)

            for alloc in PaymentAllocation.objects.filter(
                outgoing_transaction__bank_statement=stmt,
            ).select_related("purchase"):
                if alloc.purchase_id:
                    affected_purchase_ids.add(alloc.purchase_id)
                if alloc.journal_entry_id:
                    je_ids_to_delete.add(alloc.journal_entry_id)

            # JE от classified транзакций
            for txn in stmt.incoming_transactions.filter(journal_entry__isnull=False):
                je_ids_to_delete.add(txn.journal_entry_id)
            for txn in stmt.outgoing_transactions.filter(journal_entry__isnull=False):
                je_ids_to_delete.add(txn.journal_entry_id)

            # ── 2. Удалить JE ──────────────────────────────
            if je_ids_to_delete:
                JournalEntry.objects.filter(id__in=je_ids_to_delete).delete()

            # ── 3. Удалить все allocations ──────────────────
            PaymentAllocation.objects.filter(
                incoming_transaction__bank_statement=stmt,
            ).delete()
            PaymentAllocation.objects.filter(
                outgoing_transaction__bank_statement=stmt,
            ).delete()

            # ── 4. Сбросить статусы транзакций ─────────────
            stmt.incoming_transactions.update(
                match_status="unmatched",
                match_confidence=0,
                match_details={},
                transaction_category="",
                category_account_debit="",
                category_account_credit="",
                category_rule=None,
                matched_document_number="",
                journal_entry=None,
                allocated_amount=0,
            )
            stmt.outgoing_transactions.update(
                match_status="unmatched",
                match_confidence=0,
                match_details={},
                transaction_category="",
                category_account_debit="",
                category_account_credit="",
                category_rule=None,
                matched_document_number="",
                journal_entry=None,
                allocated_amount=0,
            )

            # ── 5. Matching incoming → Invoice ─────────────
            inc_txns = list(stmt.incoming_transactions.all())
            if inc_txns:
                engine = InvoiceMatchingEngine(self.user)
                results = engine.match_transactions(inc_txns)
                engine.apply_results(results)

            # ── 6. Matching outgoing → Purchase ────────────
            out_txns = list(stmt.outgoing_transactions.all())
            if out_txns:
                logger.info(
                    "[BankImport] Starting SIGNAL re-match for %d outgoing transactions...",
                    len(out_txns),
                )

                p_engine = SignalPurchaseMatchingEngine(self.user)
                p_results = p_engine.match_transactions(out_txns)
                p_engine.apply_results(p_results)

                p_matched = sum(
                    1 for r in p_results
                    if getattr(r, "status", "unmatched") != "unmatched"
                )
                logger.info(
                    "[BankImport] SIGNAL purchase re-match complete: %d/%d matched",
                    p_matched,
                    len(p_results),
                )

            # ── 7. Classify remaining ──────────────────────
            all_unmatched = list(
                stmt.outgoing_transactions.filter(
                    match_status="unmatched", transaction_category="",
                )
            ) + list(
                stmt.incoming_transactions.filter(
                    match_status="unmatched", transaction_category="",
                )
            )
            if all_unmatched:
                TransactionClassifier(self.user).classify_and_apply(all_unmatched)

            # ── 8. Create / rebuild DK for safe bank categories ─
            category_dk = BankCategoryJournalBuilder(self.user, self.company_profile)
            dk_result = category_dk.create_for_statement(stmt)
            logger.info(f"[BankImport] Re-match Category DK: {dk_result}")

            # ── Agregatorių payout'ai → Pinigai kelyje (273) ──
            payout_dk = AggregatorPayoutJournalBuilder(self.user, self.company_profile)
            payout_result = payout_dk.create_for_statement(stmt)
            logger.info(f"[BankImport] Re-match Aggregator payouts: {payout_result}")

            # ── 8. Пересчитать документы ───────────────────
            if affected_invoice_ids:
                from ..models import Invoice
                for inv in Invoice.objects.filter(id__in=affected_invoice_ids):
                    inv.recalc_payment_status()

            if affected_purchase_ids:
                from ..models import Purchase
                for p in Purchase.objects.filter(id__in=affected_purchase_ids):
                    p.recalc_from_allocations()

        stmt.refresh_stats()
        logger.info(
            "[BankImport] Re-match complete for stmt %s: "
            "%d JEs deleted, %d invoices, %d purchases recalculated",
            stmt.id, len(je_ids_to_delete),
            len(affected_invoice_ids), len(affected_purchase_ids),
        )

    # ── Private ─────────────────────────────────────────────

    def _save_raw_file(self, content: bytes, filename: str) -> str:
        """
        Save raw uploaded file to disk for debugging.
        Path: MEDIA_ROOT/bank_imports/user_{id}/{date}_{filename}
        """
        try:
            user_dir = os.path.join(BANK_IMPORT_DIR, f"user_{self.user.id}")
            os.makedirs(user_dir, exist_ok=True)

            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
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
        
    def _make_own_account_key(self, bank_name="", currency="EUR", iban=""):
        """
        Returns own account key for dedupe:
        - real IBAN if available
        - otherwise bank_currency, e.g. revolut_USD
        """
        iban_clean = (iban or "").replace(" ", "").upper()
        if iban_clean:
            return iban_clean

        bank = (bank_name or "other").strip().lower()
        cur = (currency or "EUR").strip().upper()

        return f"{bank}_{cur}"

    def _serialize_txn_for_duplicate(self, txn):
        if not txn:
            return None

        stmt = txn.bank_statement

        return {
            "id": txn.id,
            "statement_id": stmt.id if stmt else None,
            "bank": stmt.bank_name if stmt else "",
            "statement_filename": stmt.original_filename if stmt else "",
            "statement_iban": stmt.account_iban if stmt else "",
            "statement_currency": stmt.currency if stmt else "",
            "own_account_key": getattr(txn, "own_account_key", ""),
            "date": txn.transaction_date.isoformat() if txn.transaction_date else "",
            "amount": str(txn.amount),
            "currency": txn.currency,
            "doc_number": txn.doc_number or "",
            "reference_number": txn.reference_number or "",
            "counterparty_name": txn.counterparty_name or "",
            "counterparty_code": txn.counterparty_code or "",
            "counterparty_account": txn.counterparty_account or "",
            "payment_purpose": (txn.payment_purpose or "")[:500],
            "transaction_hash": txn.transaction_hash,
        }

    def _build_duplicate_info(self, new_txn, existing_txn, stmt, direction):
        return {
            "direction": "incoming" if direction == "credit" else "outgoing",
            "transaction_hash": new_txn.transaction_hash,
            "reason": "transaction_hash_exists",
            "new": {
                "statement_id": stmt.id,
                "bank": stmt.bank_name,
                "statement_filename": stmt.original_filename,
                "statement_iban": stmt.account_iban or "",
                "statement_currency": stmt.currency or "",
                "own_account_key": getattr(new_txn, "own_account_key", ""),
                "date": new_txn.transaction_date.isoformat() if new_txn.transaction_date else "",
                "amount": str(new_txn.amount),
                "currency": new_txn.currency,
                "doc_number": new_txn.doc_number or "",
                "reference_number": new_txn.reference_number or "",
                "counterparty_name": new_txn.counterparty_name or "",
                "counterparty_code": new_txn.counterparty_code or "",
                "counterparty_account": new_txn.counterparty_account or "",
                "payment_purpose": (new_txn.payment_purpose or "")[:500],
            },
            "existing": self._serialize_txn_for_duplicate(existing_txn),
        }

    def _create_transactions(self, stmt, raw_list):
        created_inc = []
        created_out = []
        dupes = 0
        duplicate_details = []

        for raw in raw_list:
            if not raw.get("transaction_date") or not raw.get("amount"):
                continue

            direction = raw.get("direction", "credit")
            Model = IncomingTransaction if direction == "credit" else OutgoingTransaction

            own_account_key = self._make_own_account_key(
                bank_name=stmt.bank_name,
                currency=raw.get("currency") or stmt.currency or "EUR",
                iban=stmt.account_iban,
            )

            txn = Model(
                user=self.user,
                company_profile=self.company_profile,
                bank_statement=stmt,
                source="bank_import",
                own_account_key=own_account_key,
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

                existing = (
                    Model.objects
                    .filter(transaction_hash=txn.transaction_hash)
                    .select_related("bank_statement")
                    .first()
                )

                duplicate_info = self._build_duplicate_info(
                    new_txn=txn,
                    existing_txn=existing,
                    stmt=stmt,
                    direction=direction,
                )
                duplicate_details.append(duplicate_info)

                logger.warning(
                    "[BANK_DUPLICATE] direction=%s hash=%s new=%s existing=%s",
                    direction,
                    txn.transaction_hash,
                    duplicate_info.get("new"),
                    duplicate_info.get("existing"),
                )

        return created_inc, created_out, dupes, duplicate_details

    def _extract_iban(self, content: bytes) -> str:
        import re

        text = ""
        for enc in ("utf-8-sig", "utf-8", "windows-1257"):
            try:
                text = content[:5000].decode(enc)
                break
            except UnicodeDecodeError:
                continue

        # LT IBAN
        ibans = re.findall(r"LT\d{18}", text)
        if ibans:
            return ibans[0]

        # DE, PL ir kiti IBAN
        ibans = re.findall(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", text)
        if ibans:
            return ibans[0]

        return ""

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

        # ── Auto JE ──
        from .accounting_transfer import create_je_for_allocation
        try:
            create_je_for_allocation(alloc)
        except Exception as e:
            logger.warning("[MarkPaid] Auto JE failed for alloc %s: %s", alloc.id, e)

        return alloc

    def confirm_allocation(self, allocation_id):
        """Юзер подтверждает proposed allocation."""
        from django.db.models import Q

        alloc = PaymentAllocation.objects.select_related(
            "incoming_transaction", "outgoing_transaction",
            "invoice", "purchase",
        ).get(
            Q(invoice__user=self.user) | Q(purchase__user=self.user),
            id=allocation_id,
        )

        alloc.status = "confirmed"
        alloc.confirmed_at = timezone.now()
        alloc.confirmed_by = self.user
        alloc.save(update_fields=["status", "confirmed_at", "confirmed_by"])

        # Обновляем транзакцию
        txn = alloc.transaction  # property: incoming or outgoing
        if txn:
            has_proposed = txn.allocations.filter(status="proposed").exists()
            if not has_proposed:
                txn.match_status = "confirmed"
                txn.save(update_fields=["match_status", "updated_at"])

        # Пересчитываем документ
        if alloc.invoice:
            alloc.invoice.recalc_payment_status()
        elif alloc.purchase:
            alloc.purchase.recalc_from_allocations()

        # Refresh bank statement counters
        if txn and txn.bank_statement:
            txn.bank_statement.refresh_stats()

        # ── Auto JE ──
        from .accounting_transfer import create_je_for_allocation
        try:
            create_je_for_allocation(alloc)
        except Exception as e:
            logger.warning("[Confirm] Auto JE failed for alloc %s: %s", alloc.id, e)

        return alloc

    def reject_allocation(self, allocation_id):
        """Юзер отклоняет proposed allocation."""
        from django.db.models import Q

        alloc = PaymentAllocation.objects.select_related(
            "incoming_transaction", "outgoing_transaction",
            "invoice", "purchase",
        ).get(
            Q(invoice__user=self.user) | Q(purchase__user=self.user),
            id=allocation_id,
        )
        txn = alloc.transaction  # property: incoming or outgoing
        document = alloc.document  # property: invoice or purchase

        # ── Delete JE ──
        from .accounting_transfer import delete_je_for_allocation
        delete_je_for_allocation(alloc)

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
            if txn.bank_statement:
                txn.bank_statement.refresh_stats()

    def remove_manual_payment(self, allocation_id):
        """Удаление ручной пометки оплаты."""
        from django.db.models import Q

        alloc = PaymentAllocation.objects.get(
            Q(invoice__user=self.user) | Q(purchase__user=self.user),
            id=allocation_id,
            source="manual",
        )
        invoice = alloc.invoice
        purchase = alloc.purchase

        # ── Delete JE ──
        from .accounting_transfer import delete_je_for_allocation
        delete_je_for_allocation(alloc)

        alloc.delete()

        if invoice:
            invoice.recalc_payment_status()
        elif purchase:
            purchase.recalc_from_allocations()

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
                "direction": a.direction,
                "invoice_id": a.invoice_id,
                "purchase_id": a.purchase_id,
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
    


# ════════════════════════════════════════════════════════════
# Category DK entries for bank transactions
# ════════════════════════════════════════════════════════════

SAFE_BANK_DK_CATEGORIES = {
    "bank_fee": {
        "debit_account": "6880",
        "debit_name": "Banko mokesčiai",
        "description": "Banko mokestis",
    },
    "tax_vmi": {
        "debit_account": "4481",
        "debit_name": "Mokėtini mokesčiai VMI",
        "description": "VMI įmoka",
    },
    "tax_sodra": {
        "debit_account": "4482",
        "debit_name": "Mokėtina Sodra",
        "description": "Sodra įmoka",
    },
    "salary": {
        "debit_account": "4461",
        "debit_name": "Mokėtinas darbo užmokestis",
        "description": "Darbo užmokesčio išmokėjimas",
    },
}


class BankCategoryJournalBuilder:
    """
    DK įrašai banko operacijoms be sudengimo:
    bank_fee / tax_vmi / tax_sodra / salary.

    PaymentAllocation nekuriame.
    Statusas visada draft / Nauja.
    Užregistruota bus tik period lock metu.
    """

    def __init__(self, user, company_profile=None):
        self.user = user
        self.company_profile = company_profile or getattr(user, "active_company_profile", None)

    def create_for_statement(self, statement) -> dict:
        if not self.company_profile:
            logger.warning("[BankCategoryDK] No company profile for user %s", self.user.id)
            return {"created": 0, "skipped": 0, "errors": 0}

        created = 0
        skipped = 0
        errors = 0

        txns = list(
            statement.outgoing_transactions.filter(
                transaction_category__in=list(SAFE_BANK_DK_CATEGORIES.keys()),
            ).order_by("transaction_date", "id")
        )

        for txn in txns:
            try:
                entry = self.create_for_transaction(txn)
                if entry:
                    created += 1
                else:
                    skipped += 1
            except Exception as exc:
                errors += 1
                logger.exception(
                    "[BankCategoryDK] Failed txn=%s: %s",
                    txn.id,
                    exc,
                )

        return {"created": created, "skipped": skipped, "errors": errors}

    def rebuild_for_statement(self, statement) -> dict:
        removed = self.delete_draft_category_entries(statement)
        result = self.create_for_statement(statement)
        result["removed"] = removed
        return result

    def delete_draft_category_entries(self, statement) -> int:
        removed = 0

        txns = list(
            statement.outgoing_transactions.filter(
                journal_entry__isnull=False,
                journal_entry__source_type=JournalEntry.SOURCE_BANK,
                journal_entry__purchase__isnull=True,
                journal_entry__invoice__isnull=True,
            ).select_related("journal_entry")
        )

        for txn in txns:
            entry = txn.journal_entry
            if not entry:
                continue

            if entry.status == JournalEntry.STATUS_POSTED:
                continue

            with db_transaction.atomic():
                txn.journal_entry = None
                txn.save(update_fields=["journal_entry", "updated_at"])
                entry.delete()
                removed += 1

        return removed

    def create_for_transaction(self, txn):
        category = txn.transaction_category or ""
        cfg = SAFE_BANK_DK_CATEGORIES.get(category)

        if not cfg:
            return None

        if txn.journal_entry_id:
            return None

        # Jei susieta su dokumentu, category DK nekuriame.
        if txn.match_status in (
            "auto_matched",
            "likely_matched",
            "confirmed",
            "manually_matched",
        ):
            return None

        # Salary tik kai aiškiai parašyta paskirtyje.
        if category == "salary" and not self._is_explicit_salary(txn):
            return None

        amount = abs(txn.amount or Decimal("0"))
        if amount <= Decimal("0"):
            return None

        # Šitam pirmam sluoksniui auto-DK tik EUR.
        if (txn.currency or "EUR").upper() != "EUR":
            return None

        debit_account = txn.category_account_debit or cfg["debit_account"]
        debit_name = cfg["debit_name"]

        credit_account = txn.category_account_credit or self._get_bank_account_code(txn)
        credit_name = self._get_bank_account_name(txn)

        description = self._build_description(txn, cfg["description"])
        document_number = self._build_document_number(txn)

        with db_transaction.atomic():
            locked_txn = OutgoingTransaction.objects.select_for_update().get(id=txn.id)

            if locked_txn.journal_entry_id:
                return None

            entry = JournalEntry.objects.create(
                user=self.user,
                company_profile=self.company_profile,
                source_type=JournalEntry.SOURCE_BANK,
                entry_date=locked_txn.transaction_date,
                period=self._period_start(locked_txn.transaction_date),
                document_number=document_number,
                counterparty_name=locked_txn.counterparty_name or "",
                counterparty_code=locked_txn.counterparty_code or "",
                description=description,
                status=JournalEntry.STATUS_DRAFT,
                currency="EUR",
            )

            JournalEntryLine.objects.create(
                entry=entry,
                side=JournalEntryLine.SIDE_DEBIT,
                account_code=debit_account,
                account_name=debit_name,
                amount=amount,
                description=description,
                sort_order=1,
            )

            JournalEntryLine.objects.create(
                entry=entry,
                side=JournalEntryLine.SIDE_CREDIT,
                account_code=credit_account,
                account_name=credit_name,
                amount=amount,
                description=description,
                sort_order=2,
            )

            finalize_journal_entry(entry)

            details = dict(locked_txn.match_details or {})
            details["category_dk"] = {
                "created": True,
                "journal_entry_id": entry.id,
                "category": category,
                "debit_account": debit_account,
                "credit_account": credit_account,
                "amount": str(amount),
            }

            locked_txn.journal_entry = entry
            locked_txn.match_status = "classified"
            locked_txn.category_account_debit = debit_account
            locked_txn.category_account_credit = credit_account
            locked_txn.match_details = details
            locked_txn.save(update_fields=[
                "journal_entry",
                "match_status",
                "category_account_debit",
                "category_account_credit",
                "match_details",
                "updated_at",
            ])

            logger.info(
                "[BankCategoryDK] Created DK #%s for txn %s category=%s amount=%s",
                entry.id,
                locked_txn.id,
                category,
                amount,
            )

            return entry

    @staticmethod
    def _period_start(d):
        return date(d.year, d.month, 1)

    @staticmethod
    def _is_explicit_salary(txn) -> bool:
        text = f"{txn.payment_purpose or ''} {txn.counterparty_name or ''}".lower()
        return bool(re.search(
            r"(atlyginim|darbo\s+užmokest|darbo\s+uzmokest|\bdu\b|salary)",
            text,
            flags=re.IGNORECASE,
        ))

    @staticmethod
    def _build_document_number(txn) -> str:
        return txn.doc_number or txn.reference_number or f"BANK-{txn.id}"

    @staticmethod
    def _build_description(txn, base: str) -> str:
        name = txn.counterparty_name or ""
        purpose = (txn.payment_purpose or "").strip()

        if name:
            return f"{base}: {name}"[:255]

        if purpose:
            return f"{base}: {purpose[:180]}"[:255]

        return base[:255]

    def _get_bank_account_code(self, txn) -> str:
        statement = getattr(txn, "bank_statement", None)

        iban = getattr(statement, "account_iban", "") if statement else ""
        bank_name = getattr(statement, "bank_name", "") if statement else ""
        currency = getattr(statement, "currency", "") if statement else ""

        if self.company_profile and hasattr(self.company_profile, "get_bank_chart_account"):
            try:
                info = self.company_profile.get_bank_chart_account(
                    iban=iban,
                    bank_name=bank_name,
                    currency=currency or txn.currency,
                )
                if isinstance(info, dict) and info.get("account"):
                    return str(info["account"])
            except Exception:
                logger.exception("[BankCategoryDK] Bank account mapping failed")

        return "2710"

    def _get_bank_account_name(self, txn) -> str:
        statement = getattr(txn, "bank_statement", None)
        bank_name = getattr(statement, "bank_name", "") if statement else ""
        currency = getattr(statement, "currency", "") if statement else ""

        label = "Bankas"
        if bank_name:
            label = bank_name.upper()
        if currency:
            label = f"{label} {currency}"

        return label[:255]
    



class AggregatorPayoutJournalBuilder:
    """
    DK įrašai agregatorių payout'ams banko išraše (Variantas A).

    Incoming транзакция, kuri NEpriskirta sąskaitai, bet kontrahentas =
    agregatorius (Montonio/Stripe/...) → tai payout, uždarantis Pinigai kelyje.

    Provodka (Variantas A):
        D 271x (bankas)        — banko išrašo suma
        K 273x (Pinigai kelyje: provider)  — ta pati suma

    Komisija NEskaičiuojama automatiškai — lieka kaboti 273x kaip likutis,
    kurį vartotojas uždaro rankiniu DK arba pirkimo sąskaita (6200).
    """

    def __init__(self, user, company_profile=None):
        self.user = user
        self.company_profile = company_profile or getattr(user, "active_company_profile", None)

    def create_for_statement(self, statement) -> dict:
        if not self.company_profile:
            return {"created": 0, "skipped": 0, "errors": 0}

        created = skipped = errors = 0

        # Только несматченные incoming (payout не привязан к инвойсу)
        txns = list(
            statement.incoming_transactions.filter(
                match_status="unmatched",
                journal_entry__isnull=True,
            ).order_by("transaction_date", "id")
        )

        for txn in txns:
            # Приоритет: ручная пометка юзера > авто-распознавание по имени
            provider = (getattr(txn, "manual_aggregator_provider", "") or "").strip().lower()
            if not provider:
                provider = self.company_profile.detect_aggregator_provider(
                    txn.counterparty_name or ""
                )

            # Не агрегатор → пропускаем, НИКАКОГО JE
            if not provider:
                skipped += 1
                continue

            try:
                entry = self._create_for_txn(txn, provider)
                if entry:
                    created += 1
                else:
                    skipped += 1
            except Exception:
                errors += 1
                logger.exception("[AggregatorPayout] Failed txn=%s", txn.id)

        return {"created": created, "skipped": skipped, "errors": errors}

    def _create_for_txn(self, txn, provider: str):
        if txn.journal_entry_id:
            return None

        # Защита: без провайдера JE не создаём (иначе поймаем всё подряд)
        provider = (provider or "").strip().lower()
        if not provider or provider not in self.company_profile.AGGREGATOR_LABELS:
            return None

        # Защита: только incoming (payout — всегда приход)
        if not isinstance(txn, IncomingTransaction):
            logger.warning(
                "[AggregatorPayout] Non-incoming txn %s rejected",
                getattr(txn, "id", "?"),
            )
            return None

        amount = abs(txn.amount or Decimal("0"))
        if amount <= Decimal("0"):
            return None

        if (txn.currency or "EUR").upper() != "EUR":
            return None

        # Транзит счёт агрегатора (тот же ключ, что и на входящей стороне)
        transit = self.company_profile.get_transit_account("payment_link", provider)
        transit_code = transit["account"]
        transit_name = f"Pinigai kelyje ({transit['label']})"

        # Банковский счёт выписки
        bank_code = "2711"
        stmt = getattr(txn, "bank_statement", None)
        if stmt and stmt.account_iban:
            info = self.company_profile.get_bank_chart_account(
                stmt.account_iban, stmt.bank_name, stmt.currency or "EUR",
            )
            bank_code = info.get("account", "2711")

        desc = f"Agregatoriaus išmoka: {transit['label']}"

        with db_transaction.atomic():
            locked = IncomingTransaction.objects.select_for_update().get(id=txn.id)
            if locked.journal_entry_id:
                return None

            entry = JournalEntry.objects.create(
                user=self.user,
                company_profile=self.company_profile,
                source_type=JournalEntry.SOURCE_BANK,
                entry_date=locked.transaction_date,
                period=date(locked.transaction_date.year, locked.transaction_date.month, 1),
                document_number=locked.doc_number or f"PAYOUT-{locked.id}",
                counterparty_name=locked.counterparty_name or transit["label"],
                counterparty_code=locked.counterparty_code or "",
                description=desc,
                status=JournalEntry.STATUS_DRAFT,
                currency="EUR",
            )

            JournalEntryLine.objects.bulk_create([
                JournalEntryLine(
                    entry=entry, side="D",
                    account_code=bank_code, account_name="Banko sąskaita",
                    amount=amount, description=desc, sort_order=0,
                ),
                JournalEntryLine(
                    entry=entry, side="K",
                    account_code=transit_code, account_name=transit_name,
                    amount=amount, description=desc, sort_order=1,
                ),
            ])

            finalize_journal_entry(entry)

            locked.journal_entry = entry
            locked.match_status = "classified"
            locked.save(update_fields=["journal_entry", "match_status", "updated_at"])

            logger.info(
                "[AggregatorPayout] DK #%s: D %s / K %s = %s (%s)",
                entry.id, bank_code, transit_code, amount, transit["label"],
            )
            return entry