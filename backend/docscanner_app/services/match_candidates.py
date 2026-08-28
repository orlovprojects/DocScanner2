"""
services/match_candidates.py
============================
Kandidatų paieška rankiniam banko operacijos susiejimui su dokumentu.

incoming -> Invoice (pardavimo SF)
outgoing -> Purchase (pirkimo dokumentai)
"""

import logging
import re
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q, Sum, DecimalField, Value
from django.db.models.functions import Coalesce

from ..models import normalize_name
from ..utils.transaction_signals import extract_signals, score_with_signals

logger = logging.getLogger("docscanner_app")

DEFAULT_DAYS_BACK = 30
DEFAULT_DAYS_FORWARD = 5
SUGGEST_MIN_SCORE = Decimal("0.35")
SUGGEST_LIMIT = 3


def _dec(v):
    try:
        return Decimal(str(v or "0"))
    except Exception:
        return Decimal("0")


def _digits(v):
    return re.sub(r"\D", "", str(v or ""))


def _date_gap(txn_date, doc_date):
    """Vienodo balo atveju laimi kandidatas, kurio data arčiau mokėjimo."""
    if not txn_date or not doc_date:
        return 9999
    return abs((txn_date - doc_date).days)


def _norm_iban(v):
    return re.sub(r"\s+", "", str(v or "")).upper()


def _preview_url(doc):
    """Skeno peržiūra, jei dokumentas atkeliavo iš skaitmenizavimo."""
    scan = getattr(doc, "scanned_document", None)
    if scan is not None:
        url = getattr(scan, "preview_url", None)
        if url:
            return url
        f = getattr(scan, "file", None)
        if f and getattr(f, "url", None):
            return f.url
    return None


# ════════════════════════════════════════════════════════════
# Scoring — naudojame TĄ PATĮ variklį kaip automatinis susiejimas
# ════════════════════════════════════════════════════════════

INTERNAL_REASON_KEYS = ("_needs_uniqueness_check", "_intermediary_no_auto")


def _to_engine_candidate(info):
    """
    doc_info → candidate dict, kokio tikisi score_with_signals().
    Pardavimo SF atveju pirkėjo laukai paduodami į 'seller_*' raktus —
    varikliui tai tiesiog kontrahentas.
    """
    number = info["full_number"] or ""
    series = ""
    name = info["counterparty_name"] or ""

    return {
        "id": info["id"],
        "full_number": number,
        "series": series,
        "number": number,
        "amount": info["amount_with_vat"],
        "remaining": info["remaining_amount"] or info["amount_with_vat"],
        "currency": (info["currency"] or "EUR").upper(),
        "seller_name": name,
        "seller_norm": normalize_name(name),
        "seller_code": str(info.get("counterparty_code") or "").strip(),
        "seller_iban": _norm_iban(info.get("counterparty_iban")),
        "invoice_date": info.get("invoice_date"),
        "due_date": info.get("due_date"),
    }


def _clean_reasons(reasons):
    out = {}
    for k, v in (reasons or {}).items():
        if k in INTERNAL_REASON_KEYS:
            continue
        out[k] = str(v) if isinstance(v, Decimal) else v
    return out


def score_candidate(signals, info):
    """
    Grąžina (Decimal 0..1, reasons dict) naudojant automatinio
    susiejimo variklį. Neigiamas balas (valiutos hard-filter)
    verčiamas į 0 — dokumentas lieka sąraše, tik ne siūlomas.
    """
    candidate = _to_engine_candidate(info)

    try:
        score, reasons = score_with_signals(
            signals=signals,
            candidate=candidate,
            normalize_name_func=normalize_name,
        )
    except Exception as e:
        logger.warning("[MatchCandidates] scoring failed doc=%s: %s", info["id"], e)
        return Decimal("0"), {}

    if score < Decimal("0"):
        return Decimal("0"), _clean_reasons(reasons)

    return score, _clean_reasons(reasons)

# ════════════════════════════════════════════════════════════
# Queryset
# ════════════════════════════════════════════════════════════

ALLOC_SUM = Coalesce(
    Sum("payment_allocations__amount",
        filter=~Q(payment_allocations__status="proposed")),
    Value(Decimal("0")),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)


def _build_doc_info(doc, is_invoice):
    total = abs(_dec(doc.amount_with_vat))
    allocated = abs(_dec(getattr(doc, "_allocated", 0)))
    remaining = total - allocated
    if remaining < 0:
        remaining = Decimal("0")

    if is_invoice:
        number = doc.full_number
        cp_name = doc.buyer_name or ""
        cp_code = doc.buyer_id or ""
        cp_iban = getattr(doc, "buyer_iban", "") or ""
    else:
        number = f"{doc.document_series or ''}{doc.document_number or ''}".strip()
        cp_name = doc.seller_name or ""
        cp_code = doc.seller_id or ""
        cp_iban = getattr(doc, "seller_iban", "") or ""

    if allocated <= 0:
        pay_status = "unpaid"
    elif remaining <= Decimal("0.01"):
        pay_status = "paid"
    else:
        pay_status = "partial"

    return {
        "type": "invoice" if is_invoice else "purchase",
        "id": doc.id,
        "full_number": number,
        "counterparty_name": cp_name,
        "counterparty_code": cp_code,
        "counterparty_iban": cp_iban,
        "invoice_date": doc.invoice_date,
        "due_date": getattr(doc, "due_date", None),
        "amount_with_vat": total,
        "allocated_amount": allocated,
        "remaining_amount": remaining,
        "payment_status": pay_status,
        "currency": (getattr(doc, "currency", None) or "EUR").upper(),
        "preview_url": _preview_url(doc),
    }


def get_match_candidates(
    txn,
    direction,
    user,
    company_profile=None,
    q="",
    date_from=None,
    date_to=None,
    status="unpaid",
    same_currency=True,
    similar_amount=False,
    limit=30,
    offset=0,
):
    from ..models import Invoice, Purchase

    is_invoice = direction == "incoming"
    Model = Invoice if is_invoice else Purchase

    qs = Model.objects.filter(user=user)
    if company_profile:
        qs = qs.filter(company_profile=company_profile)

    if is_invoice:
        qs = qs.exclude(status__in=["draft", "cancelled"])
    else:
        qs = qs.exclude(status__in=["cancelled", "annulled"])

    # ── Datos ──
    txn_date = txn.transaction_date
    if date_from is None and date_to is None and txn_date:
        date_from = txn_date - timedelta(days=DEFAULT_DAYS_BACK)
        date_to = txn_date + timedelta(days=DEFAULT_DAYS_FORWARD)
    if date_from:
        qs = qs.filter(invoice_date__gte=date_from)
    if date_to:
        qs = qs.filter(invoice_date__lte=date_to)

    # ── Valiuta ──
    if same_currency:
        qs = qs.filter(currency__iexact=(txn.currency or "EUR"))

    # ── Paieška ──
    if q:
        if is_invoice:
            qs = qs.filter(
                Q(buyer_name__icontains=q)
                | Q(buyer_id__icontains=q)
                | Q(document_number__icontains=q)
                | Q(document_series__icontains=q)
            )
        else:
            qs = qs.filter(
                Q(seller_name__icontains=q)
                | Q(seller_id__icontains=q)
                | Q(document_number__icontains=q)
                | Q(document_series__icontains=q)
            )

    qs = qs.select_related("scanned_document").annotate(_allocated=ALLOC_SUM)

    # ── Statusas pagal likutį ──
    if status == "unpaid":
        qs = qs.filter(_allocated__lte=Decimal("0"))
    elif status == "partial":
        qs = qs.filter(_allocated__gt=Decimal("0"))
    if status in ("unpaid", "partial", "open"):
        # niekada nerodome pilnai apmokėtų
        qs = qs.exclude(_allocated__gte=Decimal("999999999"))

    docs = list(qs.order_by("-invoice_date", "-id")[:400])

    txn_amount = _dec(txn.amount)

    # Signalai iš operacijos ištraukiami VIENĄ kartą, ne kiekvienam kandidatui.
    signals = extract_signals(txn)
    setattr(signals, "_txn_date", txn.transaction_date)

    scored = []
    for doc in docs:
        info = _build_doc_info(doc, is_invoice)

        if status in ("unpaid", "partial", "open") and info["remaining_amount"] <= Decimal("0.01"):
            continue

        if similar_amount and info["amount_with_vat"]:
            if abs(txn_amount - info["amount_with_vat"]) > info["amount_with_vat"] * Decimal("0.05"):
                continue

        score, reasons = score_candidate(signals, info)
        info["score"] = float(round(score, 2))
        info["raw_score"] = score
        info["match_reasons"] = reasons
        scored.append(info)

    scored.sort(
        key=lambda d: (
            -d["raw_score"],
            _date_gap(txn.transaction_date, d["invoice_date"]),
        )
    )

    suggested = [d for d in scored if d["raw_score"] >= SUGGEST_MIN_SCORE][:SUGGEST_LIMIT]
    suggested_keys = {(d["type"], d["id"]) for d in suggested}
    rest = [d for d in scored if (d["type"], d["id"]) not in suggested_keys]

    for d in scored:
        d.pop("raw_score", None)

    return {
        "count": len(rest),
        "suggested": suggested,
        "results": rest[offset:offset + limit],
    }