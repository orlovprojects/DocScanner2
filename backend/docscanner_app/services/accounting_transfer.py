"""
services/accounting_transfer.py
================================
Автоматическое создание JournalEntry:
  1. При issue pardavimo SF (pvm_saskaita, saskaita, kreditine)
  2. При создании PaymentAllocation (auto/confirmed/manual)
  3. При классификации банковской транзакции

Удаление JournalEntry:
  1. При отмене (cancel) Invoice
  2. При удалении/reject PaymentAllocation
  3. При переклассификации транзакции
"""

import logging
from decimal import Decimal

from django.db import transaction as db_transaction
from ..utils.journal_generators import finalize_journal_entry

logger = logging.getLogger("docscanner_app")


# ════════════════════════════════════════════════════════════
# 1. Invoice → JournalEntry (при issue)
# ════════════════════════════════════════════════════════════

def create_je_for_invoice(invoice):
    """
    Backward-compatible wrapper.
    Nauja logika yra utils/journal_generators.py
    """
    from ..utils.journal_generators import sync_invoice_journal_entry

    return sync_invoice_journal_entry(invoice)


def delete_je_for_invoice(invoice):
    """
    Backward-compatible wrapper.
    """
    from ..utils.journal_generators import delete_invoice_journal_entry

    return delete_invoice_journal_entry(invoice)


def recreate_je_for_invoice(invoice):
    """
    Backward-compatible wrapper.
    """
    from ..utils.journal_generators import sync_invoice_journal_entry

    return sync_invoice_journal_entry(invoice)



# ════════════════════════════════════════════════════════════
# 2. PaymentAllocation → JournalEntry
# ════════════════════════════════════════════════════════════


def create_je_for_allocation(allocation):
    """
    Создаёт JournalEntry при подтверждении оплаты.

    Incoming → Invoice (нам заплатили):
        Dr. 271x (banko sąskaita)     — suma
        Cr. 2410 (pirkėjų skolos)     — suma

    Outgoing → Purchase (мы заплатили):
        Dr. 443 (tiekėjų skolos)      — suma
        Cr. 271x (banko sąskaita)     — suma

    Не создаёт JE для proposed allocations.
    """
    from ..models import JournalEntry, JournalEntryLine, CompanyProfile

    # Только auto/confirmed/manual
    if allocation.status == "proposed":
        return None

    # Не дублировать
    if allocation.journal_entry_id:
        return allocation.journal_entry

    txn = allocation.transaction
    document = allocation.document
    if not document:
        return None

    # Определить company_profile
    cp = getattr(document, "company_profile", None)
    if not cp:
        cp = document.user.active_company_profile
    if not cp:
        logger.warning("[AccountingTransfer] No CompanyProfile for allocation %s", allocation.id)
        return None

    # Определить банковский счёт (271x)
    bank_account = "2711"  # default
    if txn and hasattr(txn, "bank_statement") and txn.bank_statement:
        iban = txn.bank_statement.account_iban
        if iban:
            bank_account = cp.get_bank_chart_account(
                iban, txn.bank_statement.bank_name,
            )

    payment_date = allocation.effective_payment_date
    period = payment_date.replace(day=1) if payment_date else None

    direction = allocation.direction  # "incoming" / "outgoing" / "manual"

    with db_transaction.atomic():
        # Определить проводку
        if direction == "incoming" and allocation.invoice:
            # Нам заплатили → Dr. банк, Cr. дебиторка
            debit_code = bank_account
            debit_name = "Banko sąskaita"
            credit_code = "2410"
            credit_name = "Pirkėjų skolos"
            counterparty = allocation.invoice.buyer_name or ""
            counterparty_code = allocation.invoice.buyer_id or ""
            doc_number = allocation.invoice.full_number
            desc = f"Mokėjimas už {doc_number}"

        elif direction == "outgoing" and allocation.purchase:
            # Мы заплатили → Dr. кредиторка, Cr. банк
            debit_code = "4430"
            debit_name = "Tiekėjų skolos"
            credit_code = bank_account
            credit_name = "Banko sąskaita"
            counterparty = allocation.purchase.seller_name or ""
            counterparty_code = allocation.purchase.seller_id or ""
            doc_number = (
                f"{allocation.purchase.document_series or ''}"
                f"{allocation.purchase.document_number or ''}"
            ).strip()
            desc = f"Mokėjimas tiekėjui už {doc_number}"

        elif direction == "manual" and allocation.invoice:
            # Ручная пометка invoice → Dr. банк (default), Cr. дебиторка
            debit_code = bank_account
            debit_name = "Banko sąskaita"
            credit_code = "2410"
            credit_name = "Pirkėjų skolos"
            counterparty = allocation.invoice.buyer_name or ""
            counterparty_code = allocation.invoice.buyer_id or ""
            doc_number = allocation.invoice.full_number
            desc = f"Rankinis mokėjimas už {doc_number}"

        elif direction == "manual" and allocation.purchase:
            # Ручная пометка purchase → Dr. кредиторка, Cr. банк
            debit_code = "4430"
            debit_name = "Tiekėjų skolos"
            credit_code = bank_account
            credit_name = "Banko sąskaita"
            counterparty = allocation.purchase.seller_name or ""
            counterparty_code = allocation.purchase.seller_id or ""
            doc_number = (
                f"{allocation.purchase.document_series or ''}"
                f"{allocation.purchase.document_number or ''}"
            ).strip()
            desc = f"Rankinis mokėjimas tiekėjui už {doc_number}"

        else:
            logger.warning(
                "[AccountingTransfer] Unknown allocation direction: %s (alloc %s)",
                direction, allocation.id,
            )
            return None

        txn_currency = txn.currency if txn else "EUR"
        is_foreign = txn_currency.upper() != "EUR" if txn else False

        je = JournalEntry.objects.create(
            user=document.user,
            company_profile=cp,
            source_type=JournalEntry.SOURCE_BANK,
            invoice=allocation.invoice,
            purchase=allocation.purchase,
            entry_date=payment_date or allocation.created_at.date(),
            period=period or allocation.created_at.date().replace(day=1),
            document_number=doc_number,
            counterparty_name=counterparty,
            counterparty_code=counterparty_code,
            description=desc,
            currency="EUR",
            original_amount=txn.amount if is_foreign else None,
            original_currency=txn_currency if is_foreign else "",
            exchange_rate=getattr(txn, "exchange_rate", None) if is_foreign else None,
            exchange_rate_date=getattr(txn, "exchange_rate_date", None) if is_foreign else None,
            status=JournalEntry.STATUS_POSTED,
        )

        JournalEntryLine.objects.bulk_create([
            JournalEntryLine(
                entry=je,
                side="D",
                account_code=debit_code,
                account_name=debit_name,
                amount=allocation.amount,
                description=desc,
                sort_order=0,
            ),
            JournalEntryLine(
                entry=je,
                side="K",
                account_code=credit_code,
                account_name=credit_name,
                amount=allocation.amount,
                description=desc,
                sort_order=1,
            ),
        ])

        finalize_journal_entry(je)

        # Привязать JE к allocation
        allocation.journal_entry = je
        allocation.save(update_fields=["journal_entry"])

    logger.info(
        "[AccountingTransfer] Created JE #%s for allocation %s (%s → %s, %s)",
        je.id, allocation.id, debit_code, credit_code, allocation.amount,
    )
    return je


def delete_je_for_allocation(allocation):
    """Удаляет JE при отклонении/удалении allocation."""
    if allocation.journal_entry_id:
        je_id = allocation.journal_entry_id
        allocation.journal_entry = None
        allocation.save(update_fields=["journal_entry"])

        from ..models import JournalEntry
        JournalEntry.objects.filter(id=je_id).delete()
        logger.info("[AccountingTransfer] Deleted JE #%s for allocation %s", je_id, allocation.id)


# ════════════════════════════════════════════════════════════
# 3. Classified Transaction → JournalEntry
# ════════════════════════════════════════════════════════════


def create_je_for_classified_transaction(txn, company_profile):
    """
    Создаёт JournalEntry для классифицированной банковской транзакции
    (bank_fee, tax_vmi, pos_purchase и т.д.)

    Debit:
        Dr. category_account_debit (6880/4481/etc.)
    Credit:
        Cr. 271x (banko sąskaita)

    Для incoming (credit) — наоборот:
        Dr. 271x
        Cr. category_account_credit
    """
    from ..models import JournalEntry, JournalEntryLine, IncomingTransaction

    if not txn.transaction_category:
        return None

    if txn.journal_entry_id:
        return txn.journal_entry

    debit_account = txn.category_account_debit
    credit_account = txn.category_account_credit

    if not debit_account and not credit_account:
        return None

    # Банковский счёт
    bank_account = "2711"
    if hasattr(txn, "bank_statement") and txn.bank_statement:
        iban = txn.bank_statement.account_iban
        if iban:
            bank_account = company_profile.get_bank_chart_account(
                iban, txn.bank_statement.bank_name,
            )

    is_incoming = isinstance(txn, IncomingTransaction)
    payment_date = txn.transaction_date
    period = payment_date.replace(day=1) if payment_date else None

    # Для outgoing (debit): Dr. expense, Cr. bank
    # Для incoming (credit): Dr. bank, Cr. revenue/account
    if is_incoming:
        d_code = bank_account
        d_name = "Banko sąskaita"
        k_code = credit_account or debit_account
        k_name = txn.get_transaction_category_display()
    else:
        d_code = debit_account or credit_account
        d_name = txn.get_transaction_category_display()
        k_code = bank_account
        k_name = "Banko sąskaita"

    desc = f"{txn.get_transaction_category_display()} – {txn.counterparty_name or ''}"

    with db_transaction.atomic():
        txn_currency = (txn.currency or "EUR").upper()
        is_foreign = txn_currency != "EUR"

        je = JournalEntry.objects.create(
            user=txn.user,
            company_profile=company_profile,
            source_type=JournalEntry.SOURCE_BANK,
            entry_date=payment_date,
            period=period or payment_date.replace(day=1),
            document_number=txn.doc_number or "",
            counterparty_name=txn.counterparty_name or "",
            counterparty_code=txn.counterparty_code or "",
            description=desc[:255],
            currency="EUR",
            original_amount=txn.amount if is_foreign else None,
            original_currency=txn_currency if is_foreign else "",
            exchange_rate=getattr(txn, "exchange_rate", None) if is_foreign else None,
            exchange_rate_date=getattr(txn, "exchange_rate_date", None) if is_foreign else None,
            status=JournalEntry.STATUS_POSTED,
        )

        JournalEntryLine.objects.bulk_create([
            JournalEntryLine(
                entry=je, side="D",
                account_code=d_code, account_name=d_name,
                amount=txn.amount,
                description=desc[:255],
                sort_order=0,
            ),
            JournalEntryLine(
                entry=je, side="K",
                account_code=k_code, account_name=k_name,
                amount=txn.amount,
                description=desc[:255],
                sort_order=1,
            ),
        ])

        finalize_journal_entry(je)

        txn.journal_entry = je
        txn.save(update_fields=["journal_entry", "updated_at"])

    logger.info(
        "[AccountingTransfer] Created JE #%s for classified txn %s (%s)",
        je.id, txn.id, txn.transaction_category,
    )
    return je