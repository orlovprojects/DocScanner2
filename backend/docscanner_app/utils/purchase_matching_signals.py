import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from django.db import transaction as db_transaction
from django.utils import timezone

from ..models import Purchase, PaymentAllocation, normalize_name
from .transaction_signals import extract_signals, score_with_signals

logger = logging.getLogger("docscanner_app")


AUTO_THRESHOLD = Decimal("0.85")
LIKELY_THRESHOLD = Decimal("0.60")


@dataclass
class SignalPurchaseMatchResult:
    txn: object
    status: str = "unmatched"
    confidence: Decimal = Decimal("0")
    purchase_id: Optional[int] = None
    amount: Decimal = Decimal("0")
    matched_document_number: str = ""
    reasons: dict = field(default_factory=dict)
    signals: dict = field(default_factory=dict)


class SignalPurchaseMatchingEngine:
    """
    Experimental outgoing bank transaction → Purchase matching.

    Tik eksperimentui:
    - naudoja transaction_signals.py
    - geriau randa Upwork / Shopify / Canva / Klaviyo / card clearing
    - cross-currency palieka kaip likely_matched, kad DK nebūtų kuriami aklai
    - multi-invoice kol kas nedaro
    """

    def __init__(self, user):
        self.user = user

    def match_transactions(self, transactions):
        purchases = list(self._load_purchases())
        candidates = [self._purchase_to_candidate(p) for p in purchases]

        results = []

        for txn in transactions:
            try:
                result = self._match_one(txn, candidates)
            except Exception as e:
                logger.exception("[SignalPurchaseMatch] txn=%s failed: %s", txn.id, e)
                result = SignalPurchaseMatchResult(txn=txn)

            results.append(result)

        return results

    def apply_results(self, results):
        """
        Sukuria PaymentAllocation ir atnaujina OutgoingTransaction.
        DK įrašų čia specialiai nekuriame — kol eksperimentuojame.
        """
        changed_purchase_ids = set()

        with db_transaction.atomic():
            for r in results:
                txn = r.txn

                if r.status == "unmatched" or not r.purchase_id:
                    txn.match_status = "unmatched"
                    txn.match_confidence = Decimal("0")
                    txn.match_details = r.reasons or {}
                    txn.matched_document_number = ""
                    txn.save(update_fields=[
                        "match_status",
                        "match_confidence",
                        "match_details",
                        "matched_document_number",
                        "updated_at",
                    ])
                    continue

                alloc_status = "auto" if r.status == "auto_matched" else "proposed"

                alloc, _ = PaymentAllocation.objects.update_or_create(
                    outgoing_transaction=txn,
                    purchase_id=r.purchase_id,
                    defaults={
                        "source": "bank_import",
                        "status": alloc_status,
                        "amount": r.amount,
                        "payment_date": txn.transaction_date,
                        "confidence": r.confidence,
                        "match_reasons": {
                            **(r.reasons or {}),
                            "signals": r.signals or {},
                            "experimental_signal_matching": True,
                        },
                    },
                )

                # DK įrašas už mokėjimą tiekėjui — tik auto (proposed praleis pats create_je)
                if alloc_status == "auto":
                    from ..services.accounting_transfer import create_je_for_allocation
                    try:
                        create_je_for_allocation(alloc)
                    except Exception as e:
                        logger.warning(
                            "[SignalPurchaseMatch] Auto JE failed for alloc %s: %s",
                            alloc.id, e,
                        )

                txn.match_status = r.status
                txn.match_confidence = r.confidence
                txn.match_details = {
                    **(r.reasons or {}),
                    "allocation_id": alloc.id,
                    "signals": r.signals or {},
                    "experimental_signal_matching": True,
                }
                txn.matched_document_number = r.matched_document_number or ""
                txn.allocated_amount = r.amount
                txn.save(update_fields=[
                    "match_status",
                    "match_confidence",
                    "match_details",
                    "matched_document_number",
                    "allocated_amount",
                    "updated_at",
                ])

                changed_purchase_ids.add(r.purchase_id)

            for p in Purchase.objects.filter(id__in=changed_purchase_ids):
                try:
                    p.recalc_from_allocations()
                except Exception as e:
                    logger.warning(
                        "[SignalPurchaseMatch] purchase=%s recalc failed: %s",
                        p.id,
                        e,
                    )

    def _match_one(self, txn, candidates):
        signals = extract_signals(txn)
        setattr(signals, "_txn_date", txn.transaction_date)

        if signals.skip_matching:
            return SignalPurchaseMatchResult(
                txn=txn,
                status="unmatched",
                confidence=Decimal("0"),
                reasons={
                    "skip_matching": True,
                    "skip_reason": signals.skip_reason,
                    "txn_type": signals.txn_type,
                },
                signals=self._serialize_signals(signals),
            )

        scored = []

        for c in candidates:
            score, reasons = score_with_signals(
                signals=signals,
                candidate=c,
                normalize_name_func=normalize_name,
            )

            if score < Decimal("0"):
                continue

            if score >= Decimal("0.20"):
                scored.append((c, score, reasons))

        if not scored:
            return SignalPurchaseMatchResult(
                txn=txn,
                status="unmatched",
                confidence=Decimal("0"),
                reasons={"no_candidates": True},
                signals=self._serialize_signals(signals),
            )

        scored.sort(key=lambda x: x[1], reverse=True)
        best, best_score, best_reasons = scored[0]

        if best_score < LIKELY_THRESHOLD:
            return SignalPurchaseMatchResult(
                txn=txn,
                status="unmatched",
                confidence=best_score,
                reasons={
                    "best_score_too_low": str(best_score),
                    "best_candidate": best.get("full_number"),
                    "best_reasons": self._json_safe(best_reasons),
                },
                signals=self._serialize_signals(signals),
            )

        # Saugumas: cross-currency kol kas tik proposed,
        # nes DK / valiutos kurso įtaka dar nėra pilnai sutvarkyta.
        if best_score >= AUTO_THRESHOLD and not signals.is_cross_currency and not signals.conversion_fee:
            status = "auto_matched"
        else:
            status = "likely_matched"

        amount = self._allocation_amount(signals, best)

        return SignalPurchaseMatchResult(
            txn=txn,
            status=status,
            confidence=best_score,
            purchase_id=best["id"],
            amount=amount,
            matched_document_number=best.get("full_number") or "",
            reasons=self._json_safe(best_reasons),
            signals=self._serialize_signals(signals),
        )

    def _load_purchases(self):
        return (
            Purchase.objects
            .filter(user=self.user)
            .exclude(payment_status="paid")
            .order_by("-invoice_date", "-id")[:2000]
        )

    def _purchase_to_candidate(self, p):
        amount = self._dec(getattr(p, "amount_with_vat", None))
        paid = self._dec(getattr(p, "paid_amount", None))

        remaining = getattr(p, "remaining_amount", None)
        if remaining is None:
            remaining = amount - paid
        remaining = self._dec(remaining)

        if remaining <= Decimal("0"):
            remaining = amount

        series = getattr(p, "document_series", "") or ""
        number = getattr(p, "document_number", "") or ""
        full_number = getattr(p, "full_number", "") or f"{series}{number}".strip()

        seller_name = getattr(p, "seller_name", "") or ""
        seller_code = (
            getattr(p, "seller_id", "") or
            getattr(p, "seller_code", "") or
            ""
        )

        return {
            "obj": p,
            "id": p.id,
            "full_number": full_number,
            "series": series,
            "number": number,
            "amount": amount,
            "remaining": remaining,
            "currency": (getattr(p, "currency", "") or "EUR").upper(),
            "seller_name": seller_name,
            "seller_norm": normalize_name(seller_name),
            "seller_code": str(seller_code).strip(),
            "seller_iban": (getattr(p, "seller_iban", "") or "").replace(" ", "").upper(),
            "invoice_date": getattr(p, "invoice_date", None),
            "due_date": getattr(p, "due_date", None),
            "payment_status": getattr(p, "payment_status", "") or "",
        }

    def _allocation_amount(self, signals, candidate):
        """
        Allocation amount laikome dokumento valiuta.

        Pvz:
        bankas: 195.41 EUR
        purpose: 206.00 USD(...)
        purchase: 206.00 USD

        allocation amount = 206.00
        """
        match_amount = signals.original_amount or signals.bank_amount or Decimal("0")
        remaining = candidate.get("remaining") or candidate.get("amount") or Decimal("0")

        if match_amount <= Decimal("0"):
            return remaining

        return min(match_amount, remaining)

    def _serialize_signals(self, signals):
        return {
            "txn_type": signals.txn_type,
            "skip_matching": signals.skip_matching,
            "skip_reason": signals.skip_reason,
            "merchant_name_raw": signals.merchant_name_raw,
            "merchant_name_clean": signals.merchant_name_clean,
            "merchant_keywords": signals.merchant_keywords,
            "merchant_alias_matches": signals.merchant_alias_matches,
            "references": [
                {
                    "value": r.value,
                    "value_normalized": r.value_normalized,
                    "source": r.source,
                    "confidence": r.confidence,
                }
                for r in signals.references
            ],
            "original_amount": str(signals.original_amount) if signals.original_amount is not None else "",
            "original_currency": signals.original_currency,
            "settled_amount": str(signals.settled_amount) if signals.settled_amount is not None else "",
            "settled_currency": signals.settled_currency,
            "conversion_fee": str(signals.conversion_fee) if signals.conversion_fee is not None else "",
            "is_cross_currency": signals.is_cross_currency,
            "bank_amount": str(signals.bank_amount) if signals.bank_amount is not None else "",
            "bank_currency": signals.bank_currency,
        }

    def _json_safe(self, d):
        out = {}
        for k, v in (d or {}).items():
            if isinstance(v, Decimal):
                out[k] = str(v)
            else:
                out[k] = v
        return out

    def _dec(self, v):
        if v is None or v == "":
            return Decimal("0")
        try:
            return Decimal(str(v))
        except Exception:
            return Decimal("0")