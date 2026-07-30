"""
invoicing/utils/transaction_classifier.py
==========================================
Классификатор банковских транзакций.

Применяет:
  1. User rules (BankTransactionRule) — приоритет выше
  2. Built-in patterns — банковские комиссии, VMI, Sodra, POS и т.д.

Вызывается ПОСЛЕ matching engines — классифицирует только
транзакции, которые не были привязаны к документам.
"""

import logging
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from .tax_payment_refs import (
    extract_payment_code,
    get_default_sodra_account,
    get_default_vmi_account,
    is_sodra_account,
    is_vmi_account,
)

from django.utils import timezone

logger = logging.getLogger("docscanner_app")


@dataclass
class ClassificationResult:
    transaction_id: int
    category: str
    debit_account: str
    credit_account: str
    description: str
    rule_id: Optional[int] = None
    rule_name: str = ""

# ════════════════════════════════════════════════════════════
# VMI / Sodra refs
# ════════════════════════════════════════════════════════════

VMI_ACCOUNTS = {
    "LT057044060007887175",  # SEB
}

SODRA_ACCOUNTS = {
    "LT337044060007740589",  # SEB
}

VMI_PAYMENT_CODES = {
    "1001": {"label": "VMI įmoka", "account": "4481"},
    "1311": {"label": "VMI įmoka", "account": "4481"},
}

SODRA_PAYMENT_CODES = {
    "252": {"label": "Sodra įmoka", "account": "4482"},
}


def _normalize_iban(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "")).upper()


def _is_vmi_account(value: str) -> bool:
    return _normalize_iban(value) in VMI_ACCOUNTS


def _is_sodra_account(value: str) -> bool:
    return _normalize_iban(value) in SODRA_ACCOUNTS


def _extract_payment_code(txn) -> str:
    ref = str(getattr(txn, "reference_number", "") or "").strip()
    if ref.isdigit() and 2 <= len(ref) <= 6:
        return ref

    purpose = str(getattr(txn, "payment_purpose", "") or "")

    patterns = [
        r"įmokos\s+kodas\s*[:\-]?\s*(\d{2,6})",
        r"imokos\s+kodas\s*[:\-]?\s*(\d{2,6})",
        r"(?:^|[,;\s])(\d{2,6})(?:[,;\s]|$)",
    ]

    for p in patterns:
        m = re.search(p, purpose, flags=re.IGNORECASE)
        if m:
            return m.group(1)

    return ""


def _default_vmi_account(code: str = "") -> str:
    return VMI_PAYMENT_CODES.get(str(code or "").strip(), {}).get("account") or "4481"


def _default_sodra_account(code: str = "") -> str:
    return SODRA_PAYMENT_CODES.get(str(code or "").strip(), {}).get("account") or "4482"

# ════════════════════════════════════════════════════════════
# Built-in patterns (применяются если user rules не сработали)
# ════════════════════════════════════════════════════════════

BUILTIN_PATTERNS = [
    # ── VMI / Sodra pagal surenkamąją sąskaitą ──
    {
        "name": "VMI pagal surenkamąją sąskaitą",
        "field": "counterparty_account",
        "operator": "custom",
        "value": "is_vmi_account",
        "direction": "debit",
        "category": "tax_vmi",
        "debit_account": "4481",
    },
    {
        "name": "Sodra pagal surenkamąją sąskaitą",
        "field": "counterparty_account",
        "operator": "custom",
        "value": "is_sodra_account",
        "direction": "debit",
        "category": "tax_sodra",
        "debit_account": "4482",
    },
    # ── Банковские комиссии ──
    {
        "name": "SEB paslaugų mokestis",
        "field": "bank_operation_code",
        "operator": "contains",
        "value": "ACMTMDOP",
        "direction": "debit",
        "category": "bank_fee",
        "debit_account": "6880",
    },
    {
        "name": "Banko mokestis (bendras)",
        "field": "bank_operation_code",
        "operator": "regex",
        "value": r"(?i)(FEES|CHRG|COMM|mokest|paslaug)",
        "direction": "debit",
        "category": "bank_fee",
        "debit_account": "6880",
    },
    {
        "name": "Banko mokestis pagal pavadinimą",
        "field": "counterparty_name",
        "operator": "regex",
        "value": r"(?i)^(SEB bankas|Swedbank|Luminor|Revolut)$",
        "direction": "debit",
        "category": "bank_fee",
        "debit_account": "6880",
        "extra_check": "_is_fee_purpose",
    },
    # ── VMI ──
    {
        "name": "VMI mokestis",
        "field": "counterparty_name",
        "operator": "regex",
        "value": r"(?i)(VMI|VALSTYBIN.+MOKES.+INSPEKCIJ|VALSTYBIN.+MOKES.+TARNYB)",
        "direction": "debit",
        "category": "tax_vmi",
        "debit_account": "4481",
    },
    {
        "name": "VMI pagal paskirtį",
        "field": "payment_purpose",
        "operator": "regex",
        "value": r"(?i)(GPM|PVM|pelno mokest|žemės mokest)",
        "direction": "debit",
        "category": "tax_vmi",
        "debit_account": "4481",
        "extra_check": "_is_tax_counterparty",
    },
    # ── Sodra ──
    {
        "name": "Sodra mokestis",
        "field": "counterparty_name",
        "operator": "regex",
        "value": r"(?i)(SODRA|VSDFV|SOCIALIN.+DRAUDIM)",
        "direction": "debit",
        "category": "tax_sodra",
        "debit_account": "4482",
    },
    # ── Darbo užmokestis ──
    {
        "name": "Atlyginimas",
        "field": "payment_purpose",
        "operator": "regex",
        "value": r"(?i)(darbo užmokest|atlyginim|salary|DU už|avansas už)",
        "direction": "debit",
        "category": "salary",
        "debit_account": "4491",
    },
    # ── Provider payout ──
    {
        "name": "Tarpininko išmoka",
        "field": "counterparty_name",
        "operator": "regex",
        "value": r"(?i)(PAYSERA|Stripe|Shopify|Montonio|PayPal|Square)",
        "direction": "credit",
        "category": "provider_payout",
        "debit_account": "2719",
    },
    # ── Grąžinimai ──
    {
        "name": "Kortelės grąžinimas",
        "field": "bank_operation_code",
        "operator": "regex",
        "value": r"(?i)(PMNTMCOP|ADJT|RFND|refund|grąžinim)",
        "direction": "credit",
        "category": "refund_received",
        "debit_account": "",
    },
]

# ════════════════════════════════════════════════════════════
# Категории, для которых автоматически ставится classified
# ════════════════════════════════════════════════════════════

AUTO_CLASSIFIED_CATEGORIES = {
    "bank_fee", "tax_vmi", "tax_sodra", "salary",
}


# ════════════════════════════════════════════════════════════
# Classifier
# ════════════════════════════════════════════════════════════


class TransactionClassifier:
    """
    Классифицирует банковские транзакции по правилам.

    Порядок:
      1. User rules (BankTransactionRule, ordered by priority DESC)
      2. Built-in patterns (BUILTIN_PATTERNS)
      3. Если ничего не подошло — категория остаётся пустой

    Использование:
        classifier = TransactionClassifier(user, company_profile)
        results = classifier.classify(unmatched_transactions)
        classifier.apply_results(results)
    """

    def __init__(self, user, company_profile=None):
        self.user = user
        self.company_profile = company_profile
        self._user_rules = None

    # ── Public API ──────────────────────────────────────────

    def classify(self, transactions) -> list[ClassificationResult]:
        """Классифицировать список транзакций."""
        self._load_user_rules()
        results = []
        for txn in transactions:
            r = self._classify_one(txn)
            if r:
                results.append(r)
        return results

    def apply_results(self, results: list[ClassificationResult]):
        """Применить результаты классификации к транзакциям."""
        from ..models import (
            IncomingTransaction,
            OutgoingTransaction,
            BankTransactionRule,
        )

        for r in results:
            # Определить модель по направлению
            try:
                txn = OutgoingTransaction.objects.get(id=r.transaction_id)
            except OutgoingTransaction.DoesNotExist:
                try:
                    txn = IncomingTransaction.objects.get(id=r.transaction_id)
                except IncomingTransaction.DoesNotExist:
                    continue

            txn.transaction_category = r.category
            txn.category_account_debit = r.debit_account
            txn.category_account_credit = r.credit_account

            update_fields = [
                "transaction_category",
                "category_account_debit",
                "category_account_credit",
                "updated_at",
            ]

            # Для safe-категорий сразу ставим classified
            if r.category in AUTO_CLASSIFIED_CATEGORIES:
                txn.match_status = "classified"
                update_fields.append("match_status")

            if r.rule_id:
                txn.category_rule_id = r.rule_id
                update_fields.append("category_rule_id")

                # Обновить статистику правила
                try:
                    rule = BankTransactionRule.objects.get(id=r.rule_id)
                    rule.times_applied += 1
                    rule.last_applied_at = timezone.now()
                    rule.save(update_fields=["times_applied", "last_applied_at"])
                except BankTransactionRule.DoesNotExist:
                    pass

            txn.save(update_fields=update_fields)

        logger.info(
            "[Classifier] Applied %d classifications",
            len(results),
        )

    def classify_and_apply(self, transactions) -> list[ClassificationResult]:
        """Classify + apply в одном вызове."""
        results = self.classify(transactions)
        self.apply_results(results)
        return results

    # ── Load Rules ──────────────────────────────────────────

    def _load_user_rules(self):
        from ..models import BankTransactionRule

        qs = BankTransactionRule.objects.filter(
            user=self.user,
            is_active=True,
        ).order_by("-priority")

        if self.company_profile:
            qs = qs.filter(company_profile=self.company_profile)

        self._user_rules = list(qs)
        logger.info(
            "[Classifier] Loaded %d user rules for user %s",
            len(self._user_rules), self.user.id,
        )

    # ── Classify One ────────────────────────────────────────

    def _classify_one(self, txn) -> Optional[ClassificationResult]:
        # Пропустить уже классифицированные
        if txn.transaction_category:
            return None

        # Пропустить уже matched/proposed к документу.
        if txn.match_status in (
            "auto_matched",
            "likely_matched",
            "confirmed",
            "manually_matched",
            "classified",
        ):
            return None

        # 1. User rules (highest priority)
        for rule in self._user_rules:
            if rule.matches(txn):
                category = rule.category
                debit_account = rule.debit_account or ""

                if category == "tax_vmi":
                    code = extract_payment_code(txn)
                    debit_account = get_default_vmi_account(code)
                elif category == "tax_sodra":
                    code = extract_payment_code(txn)
                    debit_account = get_default_sodra_account(code)

                return ClassificationResult(
                    transaction_id=txn.id,
                    category=category,
                    debit_account=debit_account,
                    credit_account=rule.credit_account or "",
                    description=rule.name,
                    rule_id=rule.id,
                    rule_name=rule.name,
                )

        # 2. Built-in patterns
        from ..models import IncomingTransaction
        is_incoming = isinstance(txn, IncomingTransaction)
        txn_direction = "credit" if is_incoming else "debit"

        for pattern in BUILTIN_PATTERNS:
            # Проверить направление
            p_direction = pattern.get("direction", "")
            if p_direction and p_direction != txn_direction:
                continue

            if self._matches_pattern(txn, pattern):
                # Extra check если нужен
                extra = pattern.get("extra_check")
                if extra and not getattr(self, extra)(txn):
                    continue

                return ClassificationResult(
                    transaction_id=txn.id,
                    category=pattern["category"],
                    debit_account=pattern.get("debit_account", ""),
                    credit_account=pattern.get("credit_account", ""),
                    description=pattern.get("name", ""),
                )

        return None

    # ── Pattern Matching ────────────────────────────────────

    @staticmethod
    def _matches_pattern(txn, pattern: dict) -> bool:
        field_name = pattern["field"]
        operator = pattern["operator"]
        value = pattern["value"]

        field_map = {
            "counterparty_name": txn.counterparty_name or "",
            "counterparty_code": txn.counterparty_code or "",
            "counterparty_account": txn.counterparty_account or "",
            "bank_operation_code": txn.bank_operation_code or "",
            "payment_purpose": txn.payment_purpose or "",
            "reference_number": txn.reference_number or "",
            "doc_number": txn.doc_number or "",
        }
        field_value = field_map.get(field_name, "")

        if operator == "contains":
            return value.lower() in field_value.lower()
        elif operator == "exact":
            return field_value.lower() == value.lower()
        elif operator == "starts_with":
            return field_value.lower().startswith(value.lower())
        elif operator == "regex":
            try:
                return bool(re.search(value, field_value))
            except re.error:
                return False

        elif operator == "custom":
            if value == "is_vmi_account":
                return is_vmi_account(field_value)
            if value == "is_sodra_account":
                return is_sodra_account(field_value)
            return False

        return False

    # ── Extra checks ────────────────────────────────────────

    @staticmethod
    def _is_fee_purpose(txn) -> bool:
        """
        Проверить что назначение платежа похоже на отдельную банковскую комиссию.

        Важно:
        SEB card clearing может выглядеть так:
        9.00 USD(8.31 EUR + mokestis 0.22 EUR) kortelė... PLANOLY...
        Это НЕ bank_fee transaction.
        Это покупка картой + FX fee внутри операции.
        """
        purpose_raw = txn.payment_purpose or ""
        op_raw = txn.bank_operation_code or ""

        purpose = purpose_raw.lower()
        op = op_raw.upper()
        text = f"{purpose_raw} {op_raw}"

        # ── Card purchase / clearing with embedded FX fee ─────────
        card_purchase_markers = (
            "CCRDOTHR",
            "MDOPOTHR",
            "PURCHASE IN POS",
        )

        has_card_purchase_context = (
            any(marker in op for marker in card_purchase_markers)
            or "kortelė" in purpose
            or "kortele" in purpose
            or "card" in purpose
        )

        has_embedded_original_amount = bool(
            re.search(
                r"\d+(?:[.,]\d{2})?\s+[A-Z]{3}\s*\(",
                text,
                flags=re.IGNORECASE,
            )
        )

        has_merchant_after_card = bool(
            re.search(
                r"(kortel[ėe].+)(upwork|canva|planoly|klaviyo|google|foursixty|shopify|facebook|facebk|hetzner|fiverr)",
                purpose,
                flags=re.IGNORECASE,
            )
        )

        if has_card_purchase_context and (has_embedded_original_amount or has_merchant_after_card):
            return False

        # ── Real bank fee ────────────────────────────────────────
        fee_keywords = [
            "komisinis",
            "paslaugų plano",
            "paslaugu plano",
            "paslaugos mokestis",
            "planas",
            "mėnesio mokestis",
            "menesio mokestis",
            "kasdienis",
            "fee",
            "commission",
            "charge",
        ]

        if any(kw in purpose for kw in fee_keywords):
            return True

        if "mokestis" in purpose and not has_card_purchase_context:
            return True

        if re.search(r"už pervedim[aą]", purpose, flags=re.IGNORECASE):
            return True

        return False

    @staticmethod
    def _is_tax_counterparty(txn) -> bool:
        """Проверить что контрагент похож на налоговый орган."""
        name = (txn.counterparty_name or "").lower()
        tax_keywords = [
            "vmi", "mokesčių", "mokesciu",
            "inspekci", "tarnyb",
            "biudžet", "biudzet",
        ]
        return any(kw in name for kw in tax_keywords)


# ════════════════════════════════════════════════════════════
# Convenience: find similar unclassified transactions
# ════════════════════════════════════════════════════════════


def find_similar_transactions(txn, all_transactions) -> list:
    """
    Найти транзакции похожие на данную (для предложения «применить ко всем»).

    Используется в UI когда юзер классифицирует вручную:
      «Rasta dar 12 panašių operacijų su "CAFFEINE". Priskirti visas?»
    """
    from ..models import normalize_name

    txn_name = normalize_name(txn.counterparty_name or "")
    if not txn_name or len(txn_name) < 3:
        return []

    similar = []
    for t in all_transactions:
        if t.id == txn.id:
            continue
        if t.transaction_category:  # уже классифицирована
            continue
        if t.match_status in ("auto_matched", "confirmed", "classified"):
            continue

        t_name = normalize_name(t.counterparty_name or "")
        if t_name and (t_name == txn_name or t_name in txn_name or txn_name in t_name):
            similar.append(t)

    return similar