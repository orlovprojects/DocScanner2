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
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction as db_transaction
from ..utils.journal_generators import finalize_journal_entry

logger = logging.getLogger("docscanner_app")


TRANSIT_SOURCES = ("payment_link", "provider_payout", "ecommerce")


def _channel_for_source(source: str) -> str:
    """PaymentAllocation.source → transit channel."""
    if source == "ecommerce":
        return "ecommerce"
    return "payment_link"  # payment_link + provider_payout идут одним каналом


def rate_to_eur(currency, on_date) -> Decimal:
    """
    Курс LB к EUR по конвенции '1 EUR = rate * currency' (LB/ECB reference).
    EUR→1. Фолбэк: последний курс до даты, иначе 1.
    ВАЖНО: если CurrencyRate.rate хранится как обратный (1 currency = X EUR) —
    поменять на amount*rate ниже.
    """
    code = (currency or "EUR").upper()
    if code == "EUR" or not on_date:
        return Decimal("1")
    from ..models import CurrencyRate
    obj = (
        CurrencyRate.objects.filter(currency=code, date=on_date).first()
        or CurrencyRate.objects.filter(currency=code, date__lt=on_date).order_by("-date").first()
    )
    if obj and obj.rate:
        try:
            r = Decimal(str(obj.rate))
            if r > 0:
                return r
        except Exception:
            pass
    return Decimal("1")


def _to_eur(amount, rate) -> Decimal:
    """Сумма в валюте / курс (currency за 1 EUR) = EUR, до сотых."""
    if not amount:
        return Decimal("0.00")
    rate = rate or Decimal("1")
    return (Decimal(str(amount)) / rate).quantize(Decimal("0.01"), ROUND_HALF_UP)


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

    # Определить банковский счёт (271x) — с учётом валюты (мультивалютные субсчета)
    bank_account = "2711"  # default
    if txn and getattr(txn, "bank_statement", None):
        _bs = txn.bank_statement
        _info = cp.get_bank_chart_account(
            _bs.account_iban or "", _bs.bank_name, currency=(txn.currency or "EUR"),
        )
        if isinstance(_info, dict):
            bank_account = _info.get("account") or "2711"
        elif _info:
            bank_account = _info

    payment_date = allocation.effective_payment_date
    period = payment_date.replace(day=1) if payment_date else None

    direction = allocation.direction  # "incoming" / "outgoing" / "manual"

    with db_transaction.atomic():
        # Определить проводку
        if direction == "incoming" and allocation.invoice:
            # Нам заплатили
            if allocation.source in TRANSIT_SOURCES:
                # Через агрегатора → деньги «в пути» (273), не на банке.
                # Иначе задвоим при импорте выписки с payout агрегатора.
                provider = (allocation.match_reasons or {}).get("provider", "")
                channel = _channel_for_source(allocation.source)
                transit = cp.get_transit_account(channel, provider)
                debit_code = transit["account"]
                debit_name = f"Pinigai kelyje ({transit['label']})"
            else:
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

        # ── Конвертация в EUR: 2410/4430 по курсу LB на дату документа,
        #    банк по курсу оплаты (PayPal-факт из выписки, иначе LB) ──
        doc_obj = allocation.invoice or allocation.purchase
        doc_currency = (getattr(doc_obj, "currency", None) or "EUR").upper()
        doc_date = (
            getattr(doc_obj, "invoice_date", None)
            or getattr(doc_obj, "operation_date", None)
            or payment_date
        )
        pay_currency = (txn.currency if txn else doc_currency).upper()

        doc_rate = rate_to_eur(doc_currency, doc_date)
        if txn and txn.exchange_rate:
            txn_rate = Decimal(str(txn.exchange_rate))
        elif txn and txn.amount_eur and txn.amount:
            txn_rate = Decimal(str(txn.amount)) / Decimal(str(txn.amount_eur))
        elif txn:
            txn_rate = rate_to_eur(pay_currency, payment_date or doc_date)
        else:
            txn_rate = doc_rate  # manual: без отдельного курса оплаты

        doc_eur = _to_eur(allocation.amount, doc_rate)
        bank_eur = _to_eur(allocation.amount, txn_rate)

        is_incoming_side = allocation.invoice_id is not None
        if is_incoming_side:
            debit_eur, credit_eur = bank_eur, doc_eur
            gain = bank_eur - doc_eur   # нам заплатили: выгода если получили больше EUR
        else:
            debit_eur, credit_eur = doc_eur, bank_eur
            gain = doc_eur - bank_eur   # мы заплатили: выгода если отдали меньше EUR

        is_foreign = pay_currency != "EUR"

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
            original_amount=allocation.amount if is_foreign else None,
            original_currency=pay_currency if is_foreign else "",
            exchange_rate=txn_rate if is_foreign else None,
            exchange_rate_date=(payment_date or doc_date) if is_foreign else None,
            status=JournalEntry.STATUS_POSTED,
        )

        je_lines = [
            JournalEntryLine(
                entry=je, side="D",
                account_code=debit_code, account_name=debit_name,
                amount=debit_eur, description=desc, sort_order=0,
            ),
            JournalEntryLine(
                entry=je, side="K",
                account_code=credit_code, account_name=credit_name,
                amount=credit_eur, description=desc, sort_order=1,
            ),
        ]

        # ── Курсовая разница: gain>0 → K 5861 (teigiama), gain<0 → D 6861 (neigiama) ──
        if gain > 0:
            je_lines.append(JournalEntryLine(
                entry=je, side="K",
                account_code="5861", account_name="Teigiama valiutų kursų įtaka",
                amount=gain, description=f"Kursinis skirtumas: {doc_number}",
                sort_order=2,
            ))
        elif gain < 0:
            je_lines.append(JournalEntryLine(
                entry=je, side="D",
                account_code="6861", account_name="Neigiama valiutų kursų įtaka",
                amount=-gain, description=f"Kursinis skirtumas: {doc_number}",
                sort_order=2,
            ))

        JournalEntryLine.objects.bulk_create(je_lines)

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