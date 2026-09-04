"""
Operacijos likučio uždarymas: avansas arba nurašymas.

Sukuria PaymentAllocation be dokumento (kind="advance" / "writeoff")
ir atskirą JournalEntry kiekvienam kontrahentui.
"""

import logging
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction as db_transaction

from ..models import (
    IncomingTransaction, PaymentAllocation,
    JournalEntry, JournalEntryLine,
)
from ..utils.journal_generators import finalize_journal_entry

logger = logging.getLogger("docscanner_app")


def _q2(v):
    return Decimal(str(v or "0")).quantize(Decimal("0.01"), ROUND_HALF_UP)


def _bank_account(txn, cp):
    stmt = getattr(txn, "bank_statement", None)
    if cp and stmt:
        try:
            info = cp.get_bank_chart_account(
                iban=stmt.account_iban or "",
                bank_name=stmt.bank_name or "",
                currency=stmt.currency or txn.currency or "EUR",
            )
            if info.get("account"):
                return info["account"], (info.get("label") or "Bankas")[:255]
        except Exception:
            logger.exception("[Remainder] bank account mapping failed")
    return "2710", "Bankas"


def _amount_eur(txn, amount_txn):
    """amount_txn — operacijos valiuta. Grąžina EUR."""
    cur = (txn.currency or "EUR").upper()
    if cur == "EUR":
        return _q2(amount_txn)

    if txn.amount_eur and txn.amount:
        # proporcingai pagal operacijos kursą
        return _q2(
            Decimal(str(amount_txn)) * Decimal(str(txn.amount_eur))
            / Decimal(str(txn.amount))
        )

    from .accounting_transfer import rate_to_eur
    r = rate_to_eur(cur, txn.transaction_date)
    return _q2(Decimal(str(amount_txn)) / r)


def create_remainder_allocation(
    txn, user, cp, kind, amount_txn,
    counterparty=None, counterparty_name="", counterparty_code="", note="",
):
    """
    kind: "advance" | "writeoff"
    amount_txn: suma operacijos valiuta
    """
    is_incoming = isinstance(txn, IncomingTransaction)
    amount_txn = _q2(amount_txn)
    if amount_txn <= 0:
        raise ValueError("Suma turi būti teigiama.")

    amount_eur = _amount_eur(txn, amount_txn)

    if kind == "advance":
        acc_kind = "advance_in" if is_incoming else "advance_out"
    elif kind == "writeoff":
        # Išlaida: sumokėjome mažiau nei skola → kitos pajamos.
        # Įplauka: gavome mažiau → kitos sąnaudos.
        acc_kind = "writeoff_inc" if not is_incoming else "writeoff_exp"
    else:
        raise ValueError(f"Nežinomas kind: {kind}")

    diff_acc = cp.get_diff_account(acc_kind)
    bank_code, bank_name = _bank_account(txn, cp)

    with db_transaction.atomic():
        alloc_kwargs = {
            "kind": kind,
            "source": "bank_import",
            "status": "manual",
            "amount": amount_eur if kind == "writeoff" else amount_txn,
            "amount_txn": amount_txn,
            "payment_date": txn.transaction_date,
            "confidence": Decimal("1.00"),
            "match_reasons": {"remainder": kind},
            "note": note,
            "counterparty": counterparty,
            "counterparty_name": counterparty_name or (counterparty.name if counterparty else ""),
            "counterparty_code": counterparty_code or (counterparty.company_code if counterparty else ""),
        }
        if is_incoming:
            alloc = PaymentAllocation.objects.create(incoming_transaction=txn, **alloc_kwargs)
        else:
            alloc = PaymentAllocation.objects.create(outgoing_transaction=txn, **alloc_kwargs)

        d = date(txn.transaction_date.year, txn.transaction_date.month, 1)
        label = "Avansas" if kind == "advance" else "Nurašomas skirtumas"
        desc = f"{label}: {alloc.counterparty_name or txn.counterparty_name or ''}"[:255]

        entry = JournalEntry.objects.create(
            user=user,
            company_profile=cp,
            source_type=JournalEntry.SOURCE_BANK,
            entry_date=txn.transaction_date,
            period=d,
            document_number=txn.doc_number or f"BANK-{txn.id}",
            counterparty_name=alloc.counterparty_name or txn.counterparty_name or "",
            counterparty_code=alloc.counterparty_code or txn.counterparty_code or "",
            description=desc,
            status=JournalEntry.STATUS_DRAFT,
            currency="EUR",
        )

        # Įplauka: D bankas / K avansas(4420) arba K pajamos
        # Išlaida: D avansas(2080) arba D sąnaudos / K bankas
        if is_incoming:
            lines = [
                ("D", bank_code, bank_name),
                ("K", diff_acc["account"], diff_acc["label"]),
            ]
        else:
            lines = [
                ("D", diff_acc["account"], diff_acc["label"]),
                ("K", bank_code, bank_name),
            ]

        JournalEntryLine.objects.bulk_create([
            JournalEntryLine(
                entry=entry, side=side, account_code=code,
                account_name=name[:255], amount=amount_eur,
                description=desc, sort_order=i,
            )
            for i, (side, code, name) in enumerate(lines)
        ])

        finalize_journal_entry(entry)

        alloc.journal_entry = entry
        alloc.save(update_fields=["journal_entry"])

        txn.recalc_allocation_state()

        logger.info(
            "[Remainder] txn=%s kind=%s amount=%s EUR=%s DK#%s",
            txn.id, kind, amount_txn, amount_eur, entry.id,
        )

    return alloc