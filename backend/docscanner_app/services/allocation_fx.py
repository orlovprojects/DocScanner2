"""
Kurso logika susiejimui (B variantas).

Skolos pusė (4430 / 2410) skaičiuojama DOKUMENTO kursu — tuo pačiu,
kuriuo dokumentas buvo užpajamuotas. Banko pusė (271x) — realiai
judėjusia suma. Skirtumas → 5803 / 6803.
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

logger = logging.getLogger("docscanner_app")


def _q2(v):
    return Decimal(str(v or "0")).quantize(Decimal("0.01"), ROUND_HALF_UP)


def _q6(v):
    return Decimal(str(v or "0")).quantize(Decimal("0.000001"), ROUND_HALF_UP)


def get_doc_rate(document):
    """
    1 EUR = X dokumento valiutos, dokumento datai.
    EUR dokumentui grąžina 1.
    """
    from .accounting_transfer import rate_to_eur

    cur = (getattr(document, "currency", "") or "EUR").upper()
    if cur == "EUR":
        return Decimal("1")

    d = (
        getattr(document, "invoice_date", None)
        or getattr(document, "operation_date", None)
    )
    try:
        r = rate_to_eur(cur, d)
        return _q6(r) if r and r > 0 else Decimal("1")
    except Exception:
        logger.warning("[FX] rate_to_eur failed cur=%s date=%s", cur, d)
        return Decimal("1")


def txn_rate(txn):
    """1 EUR = X operacijos valiutos, pagal pačią operaciją."""
    cur = (txn.currency or "EUR").upper()
    if cur == "EUR":
        return Decimal("1")
    if txn.amount_eur and txn.amount and txn.amount_eur > 0:
        return _q6(Decimal(str(txn.amount)) / Decimal(str(txn.amount_eur)))
    if txn.exchange_rate and txn.exchange_rate > 0:
        return _q6(txn.exchange_rate)

    from .accounting_transfer import rate_to_eur
    try:
        return _q6(rate_to_eur(cur, txn.transaction_date))
    except Exception:
        return Decimal("1")


def txn_to_eur(txn, amount_txn):
    """Operacijos valiutos suma → EUR, operacijos kursu."""
    cur = (txn.currency or "EUR").upper()
    if cur == "EUR":
        return _q2(amount_txn)
    r = txn_rate(txn)
    if r <= 0:
        return _q2(amount_txn)
    return _q2(Decimal(str(amount_txn)) / r)


def doc_to_txn(document, txn, amount_doc):
    """
    Dokumento valiutos suma → operacijos valiuta.
    Per EUR: doc → EUR (dokumento kursu) → operacijos valiuta.
    """
    doc_cur = (getattr(document, "currency", "") or "EUR").upper()
    cur = (txn.currency or "EUR").upper()

    # Ta pati valiuta — jokio perskaičiavimo, kitaip kursų skirtumas
    # dirbtinai „nudažo" sumą (9.00 USD → 8.96 USD).
    if doc_cur == cur:
        return _q2(amount_doc)

    eur = _q2(Decimal(str(amount_doc)) / get_doc_rate(document))
    if cur == "EUR":
        return eur
    return _q2(eur * txn_rate(txn))


def build_fx(document, txn, amount_doc, amount_txn=None):
    """
    Grąžina dict su visomis sumomis vienam PaymentAllocation.

    amount_doc — kiek skolos dengiam, dokumento valiuta
    amount_txn — kiek nurašom nuo operacijos, operacijos valiuta.
                 Jei None — skaičiuojam pagal kursus.
    """
    amount_doc = _q2(amount_doc)
    doc_rate = get_doc_rate(document)

    if amount_txn is None:
        amount_txn = doc_to_txn(document, txn, amount_doc)
    amount_txn = _q2(amount_txn)

    amount_eur = txn_to_eur(txn, amount_txn)
    debt_eur = _q2(amount_doc / doc_rate)

    return {
        "amount": amount_doc,
        "amount_txn": amount_txn,
        "amount_eur": amount_eur,
        "doc_rate": doc_rate,
        "debt_eur": debt_eur,
        # teigiama = sumokėjom daugiau EUR nei skola → nuostolis (6803)
        "fx_diff": _q2(amount_eur - debt_eur),
    }


def txn_debt_amount(txn, is_incoming=False):
    """
    Kiek operacijos sumos realiai dengia skolą.
    Išlaida: mokesčiai nurašyti PAPILDOMAI → atimam.
    Įplauka: mokesčiai išskaičiuoti IŠ sumos → pridedam.
    """
    amt = Decimal(str(txn.amount or "0"))
    fee = Decimal(str(getattr(txn, "fee_amount", 0) or "0"))
    fx_fee = Decimal(str(getattr(txn, "exchange_fee", 0) or "0"))
    total = fee + fx_fee
    return _q2(amt + total if is_incoming else amt - total)