"""
invoicing/utils/payment_invoice_matching.py
============================================
Matching Engine — IncomingTransaction → Invoice.

Scoring v2:
  Invoice number in payment_purpose       +0.40
  Number + amount combo bonus             +0.10
  Amount exact match (remaining)          +0.30
  Amount exact match (total)              +0.25
  Amount close (±1%)                      +0.15
  Partial payment possible                +0.05
  Buyer code matches                      +0.25
  Buyer code MISMATCH (both present)      -0.30
  Buyer name exact (normalized)           +0.20
  Buyer name partial (substring)          +0.10
  Buyer name MISMATCH (both present)      -0.15
  Buyer IBAN matches                      +0.15
  Date in normal window (0-30d)           +0.05
  Date late (60-90d)                      -0.05
  Date very late (90+d)                   -0.10
  Payment BEFORE invoice date             -0.20

Thresholds:
  auto_matched  : score >= 0.80
  likely_matched: 0.40 <= score < 0.80
  unmatched     : score < 0.40
"""

import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from django.db.models import Sum

logger = logging.getLogger("docscanner_app")

AUTO_MATCH_THRESHOLD = Decimal("0.80")
LIKELY_MATCH_THRESHOLD = Decimal("0.40")
AMOUNT_TOLERANCE_ABS = Decimal("0.05")
AMOUNT_TOLERANCE_PCT = Decimal("0.01")


# ════════════════════════════════════════════════════════════
# Data classes
# ════════════════════════════════════════════════════════════

@dataclass
class MatchCandidate:
    invoice_id: int
    invoice_full_number: str
    invoice_amount: Decimal
    invoice_remaining: Decimal
    buyer_name: str
    buyer_code: str
    score: Decimal = Decimal("0")
    reasons: dict = field(default_factory=dict)


@dataclass
class AllocationProposal:
    invoice_id: int
    amount: Decimal
    confidence: Decimal
    reasons: dict
    status: str  # "auto" | "proposed"


@dataclass
class MatchResult:
    transaction_id: int
    status: str  # auto_matched / likely_matched / unmatched
    confidence: Decimal = Decimal("0")
    allocations: list = field(default_factory=list)
    details: dict = field(default_factory=dict)


# ════════════════════════════════════════════════════════════
# Invoice number patterns for extraction from payment purpose
# ════════════════════════════════════════════════════════════

# Known invoice series prefixes (uppercase)
SERIES_PREFIXES = {
    "SF", "ISF", "PVM", "LKP", "ILKP", "KR", "IKR", "SER",
    "SM", "VNT", "SAF", "PAJ", "KSF", "PSF", "PRF",
}

# Keywords that precede invoice numbers in Lithuanian payment purposes
NUMBER_KEYWORDS = [
    r"S[AĄ]SKAIT[\w]*\.?\s*(?:FAKT[UŪ]R[\w]*\.?\s*)?N[Rr]\.?\s*",
    r"S[AĄ]SK\.?\s*N[Rr]\.?\s*",
    r"SF\s*N[Rr]\.?\s*",
    r"N[Rr]\.?\s*",
    r"DOK\.?\s*N[Rr]\.?\s*",
    r"UNIK\.?\s*MOK[\w]*\.?\s*KODAS\s*",
    r"U[ZŽ]\s+(?:S[AĄ]SK[\w]*\.?\s*)?",
    r"PAGAL\s+(?:S[AĄ]SK[\w]*\.?\s*)?(?:SF\s*)?",
    r"APMOK[\w]*\s+(?:S[AĄ]SK[\w]*\.?\s*)?",
    r"SERIJ[AĄ]\s+\w+\s+N[Rr]\.?\s*",
]


# ════════════════════════════════════════════════════════════
# Engine
# ════════════════════════════════════════════════════════════

class InvoiceMatchingEngine:
    """Matching IncomingTransaction → Invoice with scoring."""

    def __init__(self, user):
        self.user = user
        self._cache = {}          # inv_id → dict
        self._number_idx = {}     # "ISF456" → inv_id (full number variations)
        self._bare_number_idx = {}  # "456" → inv_id (bare document_number, needs boundary check)
        self._code_idx = {}       # "123456789" → [inv_id, ...]
        self._name_idx = {}       # "eurodata uab" → [inv_id, ...]
        self._iban_idx = {}       # "LT12345..." → [inv_id, ...]

    # ── Public ──────────────────────────────────────────────

    def match_transactions(self, transactions) -> list[MatchResult]:
        self._build_cache()
        results = []
        for txn in transactions:
            r = self._match_one(txn)
            results.append(r)
            if r.status != "unmatched":
                logger.info(
                    "[Match] txn=%s → %s (%.2f) invoices=%s",
                    txn.id, r.status, r.confidence,
                    [a.invoice_id for a in r.allocations],
                )
        return results

    def apply_results(self, results):
        """Create PaymentAllocations, update transactions and invoices."""
        from ..models import IncomingTransaction, PaymentAllocation

        for r in results:
            if r.status == "ignored":
                continue

            txn = IncomingTransaction.objects.get(id=r.transaction_id)
            txn.match_status = r.status
            txn.match_confidence = r.confidence
            txn.match_details = r.details

            total_allocated = Decimal("0")

            for prop in r.allocations:
                PaymentAllocation.objects.update_or_create(
                    incoming_transaction=txn,
                    invoice_id=prop.invoice_id,
                    defaults={
                        "amount": prop.amount,
                        "confidence": prop.confidence,
                        "match_reasons": prop.reasons,
                        "status": prop.status,
                        "source": txn.source,
                        "payment_date": txn.transaction_date,
                    },
                )
                total_allocated += prop.amount

            txn.allocated_amount = total_allocated
            txn.save(update_fields=[
                "match_status", "match_confidence", "match_details",
                "allocated_amount", "updated_at",
            ])

            if r.status == "auto_matched":
                for prop in r.allocations:
                    self._recalc_invoice(prop.invoice_id)

    # ── Cache ───────────────────────────────────────────────

    def _build_cache(self):
        from ..models import Invoice, PaymentAllocation, normalize_name as norm

        invoices = (
            Invoice.objects
            .filter(user=self.user)
            .filter(status__in=["issued", "sent", "partially_paid"])
            .filter(invoice_type__in=["pvm_saskaita", "saskaita", "isankstine"])
            .exclude(amount_with_vat__isnull=True)
            .exclude(amount_with_vat=0)
        )

        for inv in invoices:
            paid = (
                PaymentAllocation.objects
                .filter(invoice=inv, status__in=["confirmed", "auto", "manual"])
                .aggregate(t=Sum("amount"))["t"]
            ) or Decimal("0")

            remaining = inv.amount_with_vat - paid
            if remaining <= Decimal("0.01"):
                continue

            fn = inv.full_number.strip()
            series = (inv.document_series or "").strip()
            number = (inv.document_number or "").strip()

            entry = {
                "id": inv.id,
                "full_number": fn,
                "series": series,
                "number": number,
                "amount": inv.amount_with_vat,
                "remaining": remaining,
                "buyer_name": inv.buyer_name or "",
                "buyer_norm": inv.buyer_name_normalized or norm(inv.buyer_name or ""),
                "buyer_code": (inv.buyer_id or "").strip(),
                "buyer_iban": (getattr(inv, "buyer_iban", "") or "").strip().upper(),
                "invoice_date": inv.invoice_date,
                "due_date": getattr(inv, "due_date", None),
            }
            self._cache[inv.id] = entry

            # ── Number index (full number with series) ──────
            self._index_number(fn, inv.id)

            # All variations of series+number
            if series and number:
                for variation in self._number_variations(series, number):
                    self._number_idx[variation] = inv.id

            # ── Bare number index (needs word-boundary check) ──
            if number and len(number) >= 3:
                self._bare_number_idx[number.upper()] = inv.id

            # ── Buyer code index ────────────────────────────
            if inv.buyer_id:
                code = inv.buyer_id.strip()
                self._code_idx.setdefault(code, []).append(inv.id)

            # ── Buyer name index ────────────────────────────
            bn = entry["buyer_norm"]
            if bn:
                self._name_idx.setdefault(bn, []).append(inv.id)

            # ── Buyer IBAN index ────────────────────────────
            if entry["buyer_iban"]:
                self._iban_idx.setdefault(entry["buyer_iban"], []).append(inv.id)

        logger.info(
            "[Match] Cache built: %d invoices, %d number keys, %d bare keys, "
            "%d code keys, %d name keys, %d iban keys",
            len(self._cache), len(self._number_idx), len(self._bare_number_idx),
            len(self._code_idx), len(self._name_idx), len(self._iban_idx),
        )

    def _index_number(self, number_str: str, inv_id: int):
        """Add a number string and its cleaned variant to the index."""
        if not number_str or len(number_str) < 3:
            return
        self._number_idx[number_str.upper()] = inv_id
        clean = re.sub(r"[\s\-/]", "", number_str).upper()
        if clean != number_str.upper():
            self._number_idx[clean] = inv_id

    @staticmethod
    def _number_variations(series: str, number: str) -> list[str]:
        """
        Generate all plausible ways an invoice number might appear in payment text.

        ISF + 456 → ISF456, ISF-456, ISF 456, ISF Nr. 456, ISF nr 456,
                     serija ISF Nr 456, serija ISF numeris 456
        """
        s = series.upper()
        n = number.upper()
        # Strip leading zeros for additional matching: "001" → "1"
        n_stripped = n.lstrip("0") or n

        variations = set()

        # Direct combinations
        for num in (n, n_stripped):
            variations.add(f"{s}{num}")          # ISF456
            variations.add(f"{s}-{num}")         # ISF-456
            variations.add(f"{s} {num}")         # ISF 456
            variations.add(f"{s}/{num}")         # ISF/456
            variations.add(f"{s}.{num}")         # ISF.456
            variations.add(f"{s} NR. {num}")     # ISF Nr. 456
            variations.add(f"{s} NR {num}")      # ISF Nr 456
            variations.add(f"{s} NR.{num}")      # ISF Nr.456

        # Uppercase only — all go through .upper() during search
        return [v.upper() for v in variations]

    # ── Single Match ────────────────────────────────────────

    def _match_one(self, txn) -> MatchResult:
        purpose = txn.payment_purpose or ""

        # 1. Find invoice IDs by number in purpose
        from_purpose = self._numbers_from_purpose(purpose)

        # 2. By counterparty code
        from_code = set()
        if txn.counterparty_code:
            from_code = set(self._code_idx.get(txn.counterparty_code.strip(), []))

        # 3. By counterparty name
        from_name = set()
        if txn.counterparty_name:
            from ..models import normalize_name
            tn = normalize_name(txn.counterparty_name)
            if tn and len(tn) >= 3:
                # Exact normalized match
                from_name = set(self._name_idx.get(tn, []))
                # Substring match (both ways)
                for cn, ids in self._name_idx.items():
                    if len(tn) >= 5 and len(cn) >= 5:
                        if tn in cn or cn in tn:
                            from_name.update(ids)

        # 4. By IBAN
        from_iban = set()
        if txn.counterparty_account:
            iban = txn.counterparty_account.strip().upper()
            from_iban = set(self._iban_idx.get(iban, []))

        all_ids = from_purpose | from_code | from_name | from_iban

        # 5. Fallback: by exact amount if nothing found
        if not all_ids:
            for inv_id, inv in self._cache.items():
                if (self._exact(txn.amount, inv["remaining"])
                        or self._exact(txn.amount, inv["amount"])):
                    all_ids.add(inv_id)

        if not all_ids:
            return MatchResult(
                transaction_id=txn.id, status="unmatched",
                details={"reason": "no_candidates"},
            )

        # 6. Score all candidates
        candidates = []
        for inv_id in all_ids:
            inv = self._cache.get(inv_id)
            if not inv:
                continue
            c = self._score(txn, inv, from_purpose)
            candidates.append(c)

        if not candidates:
            return MatchResult(
                transaction_id=txn.id, status="unmatched",
                details={"reason": "no_valid_candidates"},
            )

        candidates.sort(key=lambda c: c.score, reverse=True)

        # Log top candidates for debugging
        for c in candidates[:3]:
            logger.debug(
                "[Match] txn=%s candidate: inv=%s (%s) score=%.2f reasons=%s",
                txn.id, c.invoice_id, c.invoice_full_number, c.score, c.reasons,
            )

        return self._build_result(txn, candidates)

    # ── Number Extraction from Purpose ──────────────────────

    def _numbers_from_purpose(self, purpose: str) -> set:
        """
        Extract invoice IDs from payment purpose text.
        Handles many formats: ISF456, ISF-456, ISF 456, Nr. 456,
        serija ISF Nr 456, už sąsk. 456, pagal SF 456, etc.
        """
        found = set()
        pu = purpose.upper()

        # ── 1. Full number matches (with series prefix) ─────
        # Try all indexed full numbers as substrings
        for inv_number, inv_id in self._number_idx.items():
            if len(inv_number) < 4:
                continue
            if inv_number in pu:
                found.add(inv_id)

        # ── 2. Known prefix + number patterns ───────────────
        # Match: ISF456, ISF-456, ISF 456, ISF/456, ISF.456
        # Also: ISF NR. 456, ISF Nr 456, ISF nr.456
        prefixes_pattern = "|".join(re.escape(p) for p in SERIES_PREFIXES)
        # Without NR in between
        pattern_direct = rf"\b({prefixes_pattern})[\s\-/.]*(\d{{1,10}})\b"
        # With NR/Nr./NUMERIS in between
        pattern_with_nr = rf"\b({prefixes_pattern})\s+(?:NR\.?|NUMERIS)\s*(\d{{1,10}})\b"

        for pattern in (pattern_direct, pattern_with_nr):
            for m in re.finditer(pattern, pu):
                pfx, num = m.group(1), m.group(2)
                self._lookup_number(pfx, num, found)

        # ── 3. "Serija XXX Nr/Numeris YYY" pattern ────────────
        for m in re.finditer(
            r"SERIJ[AĄ]\s+(\w+)\s+(?:NUMERIS|NR\.?)\s*(\d+)", pu
        ):
            s, n = m.group(1), m.group(2)
            self._lookup_number(s, n, found)

        # ── 4. Keyword + number patterns ─────────────────────
        # "sąskaita faktūra Nr. 456", "už sąsk. 456", "pagal SF 456"
        for kw_pattern in NUMBER_KEYWORDS:
            for m in re.finditer(kw_pattern + r"(\d{1,10})", pu):
                num = m.group(m.lastindex) if m.lastindex else ""
                if not num:
                    continue
                # Try bare number
                if num.upper() in self._bare_number_idx:
                    found.add(self._bare_number_idx[num.upper()])
                # Try with every known prefix
                for pfx in SERIES_PREFIXES:
                    self._lookup_number(pfx, num, found)

        # ── 5. Bare number with word boundary ────────────────
        # Only match if number appears at a word boundary, not inside
        # a long string like "12052738390015-3"
        for bare_num, inv_id in self._bare_number_idx.items():
            if len(bare_num) < 4:
                continue
            # Word boundary: space/comma/dot/start/end before and after
            pattern = rf"(?<![0-9]){re.escape(bare_num)}(?![0-9])"
            if re.search(pattern, pu):
                found.add(inv_id)

        return found

    def _lookup_number(self, prefix: str, number: str, found: set):
        """Try all variations of prefix+number against the index."""
        p = prefix.upper()
        for n in {number, number.lstrip("0") or number}:
            for k in [f"{p}{n}", f"{p}-{n}", f"{p} {n}", f"{p}/{n}",
                       f"{p} NR. {n}", f"{p} NR {n}"]:
                ku = k.upper()
                if ku in self._number_idx:
                    found.add(self._number_idx[ku])

    # ── Scoring ─────────────────────────────────────────────

    def _score(self, txn, inv: dict, from_purpose: set) -> MatchCandidate:
        c = MatchCandidate(
            invoice_id=inv["id"],
            invoice_full_number=inv["full_number"],
            invoice_amount=inv["amount"],
            invoice_remaining=inv["remaining"],
            buyer_name=inv["buyer_name"],
            buyer_code=inv["buyer_code"],
        )
        score = Decimal("0")
        reasons = {}

        # ── Invoice number in purpose ───────────────────────
        number_found = inv["id"] in from_purpose
        if number_found:
            score += Decimal("0.40")
            reasons["Sąskaitos numeris rastas mokėjimo paskirtyje"] = True

        # ── Amount ──────────────────────────────────────────
        amount_match = False

        if self._exact(txn.amount, inv["remaining"]):
            score += Decimal("0.30")
            reasons["Suma tiksliai sutampa su likučiu"] = str(inv["remaining"])
            amount_match = True
        elif self._exact(txn.amount, inv["amount"]):
            score += Decimal("0.25")
            reasons["Suma tiksliai sutampa su bendra suma"] = str(inv["amount"])
            amount_match = True
        elif self._close(txn.amount, inv["remaining"]):
            score += Decimal("0.15")
            reasons["Suma artima likučiui (±1%)"] = str(inv["remaining"])
            amount_match = True
        elif self._close(txn.amount, inv["amount"]):
            score += Decimal("0.15")
            reasons["Suma artima bendrai sumai (±1%)"] = str(inv["amount"])
            amount_match = True
        elif txn.amount < inv["remaining"]:
            score += Decimal("0.05")
            reasons["Dalinė įmoka"] = True

        # ── Combo bonus: number + amount together ───────────
        if number_found and amount_match:
            score += Decimal("0.10")
            reasons["Numeris ir suma sutampa"] = True

        # ── Buyer code ──────────────────────────────────────
        txn_code = (txn.counterparty_code or "").strip()
        inv_code = inv["buyer_code"]

        if txn_code and inv_code:
            if txn_code == inv_code:
                score += Decimal("0.25")
                reasons["Įmonės kodas sutampa"] = txn_code
            else:
                score -= Decimal("0.30")
                reasons["Įmonės kodas nesutampa"] = f"{txn_code} ≠ {inv_code}"

        # ── Buyer name ──────────────────────────────────────
        from ..models import normalize_name
        tn = normalize_name(txn.counterparty_name or "")
        bn = inv["buyer_norm"]

        if tn and bn:
            if tn == bn:
                score += Decimal("0.20")
                reasons["Pirkėjo pavadinimas sutampa"] = True
            elif len(tn) >= 5 and len(bn) >= 5 and (tn in bn or bn in tn):
                score += Decimal("0.10")
                reasons["Pirkėjo pavadinimas panašus"] = True
            elif len(tn) >= 4 and len(bn) >= 4:
                score -= Decimal("0.15")
                reasons["Pirkėjo pavadinimas nesutampa"] = (
                    f"{(txn.counterparty_name or '')[:40]} ≠ {inv['buyer_name'][:40]}"
                )

        # ── Buyer IBAN ──────────────────────────────────────
        txn_iban = (txn.counterparty_account or "").strip().upper()
        inv_iban = inv.get("buyer_iban", "")

        if txn_iban and inv_iban and txn_iban == inv_iban:
            score += Decimal("0.15")
            reasons["Pirkėjo IBAN sutampa"] = txn_iban

        # ── Date proximity ──────────────────────────────────
        date_score, date_reason = self._date_score(txn, inv)
        if date_score != Decimal("0"):
            score += date_score
            reasons[date_reason] = True

        # ── Clamp ───────────────────────────────────────────
        c.score = max(min(score, Decimal("1.00")), Decimal("-1.00"))
        c.reasons = reasons
        return c

    # ── Date scoring ────────────────────────────────────────

    @staticmethod
    def _date_score(txn, inv: dict) -> tuple[Decimal, str]:
        """
        Score based on how far the payment date is from invoice/due date.
        Returns (score_delta, reason_string_lt).
        """
        txn_date = txn.transaction_date
        inv_date = inv.get("invoice_date")
        due_date = inv.get("due_date")

        if not txn_date or not inv_date:
            return Decimal("0"), ""

        reference_date = due_date or inv_date
        days_diff = (txn_date - reference_date).days
        ref_label = "termino" if due_date else "sąskaitos datos"

        if txn_date < inv_date:
            days_before = (inv_date - txn_date).days
            if days_before <= 3:
                return Decimal("0"), ""
            return Decimal("-0.20"), f"Mokėjimas {days_before} d. prieš sąskaitą"

        if days_diff <= 30:
            return Decimal("0.05"), f"Mokėjimas per 30 d. nuo {ref_label}"
        elif days_diff <= 60:
            return Decimal("0"), ""
        elif days_diff <= 90:
            return Decimal("-0.05"), f"Mokėjimas vėluoja {days_diff} d."
        elif days_diff <= 180:
            return Decimal("-0.10"), f"Mokėjimas labai vėluoja ({days_diff} d.)"
        else:
            return Decimal("-0.20"), f"Mokėjimas per toli ({days_diff} d.)"

    # ── Amount helpers ──────────────────────────────────────

    @staticmethod
    def _exact(a, b):
        return abs(a - b) <= AMOUNT_TOLERANCE_ABS

    @staticmethod
    def _close(a, b):
        if b == 0:
            return False
        return abs(a - b) / b <= AMOUNT_TOLERANCE_PCT

    # ── Build Result ────────────────────────────────────────

    def _build_result(self, txn, candidates: list[MatchCandidate]) -> MatchResult:
        best = candidates[0]
        amt = txn.amount

        # Score too low — unmatched
        if best.score < LIKELY_MATCH_THRESHOLD:
            return MatchResult(
                transaction_id=txn.id,
                status="unmatched",
                confidence=max(best.score, Decimal("0")),
                details={
                    "reason": "score_below_threshold",
                    "best_score": str(best.score),
                    "best_invoice": best.invoice_full_number,
                },
            )

        # 1:1 exact amount match
        if best.score >= AUTO_MATCH_THRESHOLD and self._exact(amt, best.invoice_remaining):
            return MatchResult(
                transaction_id=txn.id,
                status="auto_matched",
                confidence=best.score,
                allocations=[AllocationProposal(
                    invoice_id=best.invoice_id,
                    amount=best.invoice_remaining,
                    confidence=best.score,
                    reasons=best.reasons,
                    status="auto",
                )],
                details={"match_type": "exact_1_to_1"},
            )

        # Multi-invoice
        multi = self._try_multi(txn, candidates)
        if multi:
            return multi

        # Partial payment
        if amt < best.invoice_remaining:
            is_auto = best.score >= AUTO_MATCH_THRESHOLD
            return MatchResult(
                transaction_id=txn.id,
                status="auto_matched" if is_auto else "likely_matched",
                confidence=best.score,
                allocations=[AllocationProposal(
                    invoice_id=best.invoice_id,
                    amount=amt,
                    confidence=best.score,
                    reasons={**best.reasons, "Dalinė įmoka": True},
                    status="auto" if is_auto else "proposed",
                )],
                details={
                    "match_type": "partial_payment",
                    "invoice_remaining": str(best.invoice_remaining),
                },
            )

        # Likely single match (amount >= remaining, overpayment or close)
        return MatchResult(
            transaction_id=txn.id,
            status="auto_matched" if best.score >= AUTO_MATCH_THRESHOLD else "likely_matched",
            confidence=best.score,
            allocations=[AllocationProposal(
                invoice_id=best.invoice_id,
                amount=min(amt, best.invoice_remaining),
                confidence=best.score,
                reasons=best.reasons,
                status="auto" if best.score >= AUTO_MATCH_THRESHOLD else "proposed",
            )],
            details={
                "match_type": "likely_single",
                "candidates": [
                    {
                        "id": c.invoice_id,
                        "number": c.invoice_full_number,
                        "score": str(c.score),
                        "remaining": str(c.invoice_remaining),
                    }
                    for c in candidates[:5]
                ],
            },
        )

    def _try_multi(self, txn, candidates) -> Optional[MatchResult]:
        """Try to split one payment across multiple invoices."""
        amt = txn.amount
        eligible = [c for c in candidates if c.score >= LIKELY_MATCH_THRESHOLD]
        if len(eligible) < 2:
            return None

        selected = []
        running = Decimal("0")
        for c in eligible:
            if running >= amt:
                break
            take = min(c.invoice_remaining, amt - running)
            selected.append((c, take))
            running += take

        if not self._exact(running, amt) and running < amt:
            return None
        if len(selected) < 2:
            return None

        min_score = min(c.score for c, _ in selected)
        avg_score = sum(c.score for c, _ in selected) / len(selected)
        is_auto = min_score >= AUTO_MATCH_THRESHOLD

        return MatchResult(
            transaction_id=txn.id,
            status="auto_matched" if is_auto else "likely_matched",
            confidence=avg_score,
            allocations=[
                AllocationProposal(
                    invoice_id=c.invoice_id,
                    amount=take,
                    confidence=c.score,
                    reasons={**c.reasons, "Kelių sąskaitų mokėjimas": True},
                    status="auto" if is_auto else "proposed",
                )
                for c, take in selected
            ],
            details={"match_type": "multi_invoice", "count": len(selected)},
        )

    def _recalc_invoice(self, invoice_id):
        from ..models import Invoice
        try:
            inv = Invoice.objects.get(id=invoice_id)
            inv.recalc_payment_status()
        except Invoice.DoesNotExist:
            pass