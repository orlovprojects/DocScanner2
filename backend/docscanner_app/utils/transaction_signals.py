"""
invoicing/utils/transaction_signals.py
=======================================
Универсальный экстрактор сигналов из банковских транзакций
и улучшенный scoring для PurchaseMatchingEngine.

Извлекает ВСЁ возможное из транзакции:
  - Мерчант/контрагент (из counterparty_name, purpose, operation_code)
  - Reference/номера документов (все форматы)
  - Оригинальная сумма и валюта (для кросс-валютных матчей)
  - Тип транзакции (для pre-classification)

Поддерживаемые форматы SEB:
  Format A (MDOPOTHR): прямое карточное списание
    counterparty: "Upwork -278277805REF,Dublin,IE"
    purpose: "2020-01-06 kortelė...7657 Upwork -278277805REF,Dublin,IE, ..."

  Format B (CCRDOTHR): SEB card clearing
    counterparty: "SEB bankas"
    purpose: "17/02/2020 00:00 206.00 USD(190.37 EUR + mokestis 5.04 EUR(2.65%))
              kortelė...917657 Upwork -285781864REF/Dublin/IE #775717"

  Format C: банковский перевод (SEPA/BOOK)
    counterparty: "AB Lietuvos paštas"
    counterparty_code: "121215587"
    counterparty_account: "LT717044060000187388"

  Format D: комиссии, зарплаты, налоги
"""

import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Optional

logger = logging.getLogger("docscanner_app")


# ════════════════════════════════════════════════════════════
# Known IBANs for pre-classification
# ════════════════════════════════════════════════════════════

# VMI (Valstybinė mokesčių inspekcija) — налоговая
VMI_IBANS = {
    "LT057044060007887175",
    "LT247300010112394300",  # VMI alternative
}

# Sodra (socialinis draudimas) — соцстрах
SODRA_IBANS = {
    "LT337044060007740589",
    "LT817300010129203471",
}

# Muitinė (таможня)
CUSTOMS_IBANS = {
    "LT374010042400369573",
}

# All institutional IBANs (not supplier payments)
INSTITUTIONAL_IBANS = VMI_IBANS | SODRA_IBANS | CUSTOMS_IBANS


# ════════════════════════════════════════════════════════════
# Merchant aliases — bank name → seller name in invoices
# ════════════════════════════════════════════════════════════

# Maps normalized merchant keyword → known seller names
MERCHANT_ALIASES = {
    "facebk": ["facebook", "meta"],
    "facebook": ["facebook", "meta"],
    "meta": ["facebook", "meta"],
    "hetzner": ["hetzner"],
    "shopify": ["shopify"],
    "upwork": ["upwork"],
    "planoly": ["planoly"],
    "klaviyo": ["klaviyo"],
    "canva": ["canva"],
    "google": ["google"],
    "foursixty": ["foursixty", "four sixty"],
    "fiverr": ["fiverr"],
    "fastspring": ["fastspring"],
    "payoneer": ["payoneer"],
    "stripe": ["stripe"],
    "luminati": ["luminati", "bright data"],
    "ionos": ["ionos", "1&1"],
}


# ════════════════════════════════════════════════════════════
# Data classes
# ════════════════════════════════════════════════════════════

@dataclass
class ExtractedReference:
    """Один извлечённый reference/номер документа."""
    value: str                # Исходное значение: "278277805"
    value_normalized: str     # Normalized: "278277805"
    source: str               # Откуда: "counterparty_name", "purpose", "doc_number"
    confidence: str           # "high" | "medium" | "low"


@dataclass
class TransactionSignals:
    """Все возможные сигналы, извлечённые из банковской транзакции."""

    # ── Тип транзакции ──────────────────────────────────────
    txn_type: str = "unknown"
    # Варианты: card_direct, card_clearing, bank_transfer,
    #           bank_fee, salary, tax, social_insurance,
    #           customs, internal_transfer, unknown
    skip_matching: bool = False
    skip_reason: str = ""

    # ── Мерчант / контрагент ────────────────────────────────
    merchant_name_raw: str = ""          # Из банковской записи
    merchant_name_clean: str = ""        # Очищенное
    merchant_keywords: list = field(default_factory=list)  # ["upwork"]
    merchant_alias_matches: list = field(default_factory=list)  # Совпадения с алиасами

    # ── Извлечённые references ──────────────────────────────
    references: list = field(default_factory=list)  # List[ExtractedReference]

    # ── Суммы ───────────────────────────────────────────────
    original_amount: Optional[Decimal] = None    # 206.00 (оригинальная валюта)
    original_currency: str = ""                  # "USD"
    settled_amount: Optional[Decimal] = None     # 190.37 (EUR)
    settled_currency: str = ""                   # "EUR"
    conversion_fee: Optional[Decimal] = None     # 5.04
    is_cross_currency: bool = False

    # ── Стандартные поля (pass-through) ─────────────────────
    counterparty_code: str = ""
    counterparty_iban: str = ""
    counterparty_name: str = ""
    bank_amount: Optional[Decimal] = None        # Сумма из банковской строки
    bank_currency: str = ""                      # Валюта из банковской строки


# ════════════════════════════════════════════════════════════
# Main extraction function
# ════════════════════════════════════════════════════════════

def extract_signals(txn) -> TransactionSignals:
    """
    Извлекает все возможные сигналы из банковской транзакции.

    Args:
        txn: OutgoingTransaction или IncomingTransaction с полями:
             counterparty_name, counterparty_code, counterparty_account,
             payment_purpose, bank_operation_code, amount, currency,
             doc_number, reference_number, transaction_date
    """
    signals = TransactionSignals()

    purpose = txn.payment_purpose or ""
    cp_name = txn.counterparty_name or ""
    op_code = getattr(txn, "bank_operation_code", "") or ""
    doc_num = getattr(txn, "doc_number", "") or ""

    # Pass-through
    signals.counterparty_code = (txn.counterparty_code or "").strip()
    signals.counterparty_iban = (txn.counterparty_account or "").strip().upper()
    signals.counterparty_name = cp_name.strip()
    signals.bank_amount = txn.amount
    signals.bank_currency = txn.currency or ""

    # ── Step 1: Classify transaction type ───────────────────
    signals.txn_type = _classify_type(txn, purpose, cp_name, op_code, signals.counterparty_iban)

    if signals.txn_type in ("bank_fee", "salary", "tax", "social_insurance", "customs"):
        signals.skip_matching = True
        signals.skip_reason = signals.txn_type
        return signals  # Ранний выход — нет смысла парсить дальше

    # ── Step 2: Parse amounts (cross-currency) ──────────────
    _parse_amounts(txn, purpose, signals)

    # ── Step 3: Extract merchant name ───────────────────────
    _extract_merchant(txn, purpose, cp_name, op_code, signals)

    # ── Step 4: Extract all references ──────────────────────
    _extract_references(txn, purpose, cp_name, doc_num, signals)

    # ── Step 5: Resolve merchant aliases ────────────────────
    _resolve_aliases(signals)

    logger.debug(
        "[Signals] txn=%s type=%s merchant=%s refs=%s "
        "orig_amt=%s %s cross=%s skip=%s",
        txn.id, signals.txn_type, signals.merchant_name_clean,
        [r.value for r in signals.references],
        signals.original_amount, signals.original_currency,
        signals.is_cross_currency, signals.skip_matching,
    )

    return signals


# ════════════════════════════════════════════════════════════
# Step 1: Transaction type classification
# ════════════════════════════════════════════════════════════

def _classify_type(txn, purpose: str, cp_name: str, op_code: str, iban: str) -> str:
    """Определяет тип транзакции для pre-classification."""

    pu = purpose.upper()
    cp_upper = cp_name.upper()

    # ── Bank fees ───────────────────────────────────────────
    if "CHRG" in op_code or "FEES" in op_code:
        return "bank_fee"
    if "MOKESTIS" in pu and not cp_name:
        return "bank_fee"
    if "PASLAUGŲ PLANO" in pu:
        return "bank_fee"
    if re.search(r"UŽ PERVEDIM[AĄ]", pu):
        return "bank_fee"

    # ── Salary ──────────────────────────────────────────────
    if re.search(r"\bATLYGINIM(AS|AI|O|Ų)\b", pu, re.IGNORECASE):
        return "salary"

    # ── Tax (VMI) ───────────────────────────────────────────
    if iban in VMI_IBANS:
        return "tax"
    if "MOKESČIŲ INSPEKCIJ" in cp_upper:
        return "tax"

    # ── Social insurance (Sodra) ────────────────────────────
    if iban in SODRA_IBANS:
        return "social_insurance"
    if "SOC. DR" in cp_upper or "SOCIALINIO DRAUDIMO" in cp_upper:
        return "social_insurance"
    if "SOC. DR. ĮMOKŲ" in pu:
        return "social_insurance"

    # ── Customs ─────────────────────────────────────────────
    if iban in CUSTOMS_IBANS:
        return "customs"
    if "MUITINĖS" in cp_upper:
        return "customs"

    # ── Card clearing (SEB format B) ────────────────────────
    if "CCRDOTHR" in op_code or "CCRD" in op_code:
        return "card_clearing"

    # ── Direct card debit (format A) ────────────────────────
    if "MDOPOTHR" in op_code and "KORTELĖ" in pu:
        return "card_direct"

    # ── Bank transfer ───────────────────────────────────────
    if "ICDT" in op_code or "BOOK" in op_code or "ESCT" in op_code:
        return "bank_transfer"

    return "unknown"


# ════════════════════════════════════════════════════════════
# Step 2: Amount parsing (cross-currency detection)
# ════════════════════════════════════════════════════════════

# Format B (CLR): "17/02/2020 00:00 206.00 USD(190.37 EUR + mokestis 5.04 EUR(2.65%))"
CLR_AMOUNT_PATTERN = re.compile(
    r"(\d+[.,]\d{2})\s+([A-Z]{3})"          # original amount + currency
    r"\((\d+[.,]\d{2})\s+EUR"                # EUR equivalent
    r"\s*\+\s*mokestis\s+(\d+[.,]\d{2})\s+EUR",  # fee
    re.IGNORECASE,
)

# Format A: "valiutos keitimo mok. 0,24 EUR"
FX_FEE_PATTERN = re.compile(
    r"valiutos\s+keitimo\s+mok\.\s+(\d+[.,]\d{2})\s+EUR",
    re.IGNORECASE,
)


def _parse_amounts(txn, purpose: str, signals: TransactionSignals):
    """Парсит суммы — определяет оригинальную валюту/сумму для кросс-валютных платежей."""

    # Попробуем Format B (CLR)
    m = CLR_AMOUNT_PATTERN.search(purpose)
    if m:
        signals.original_amount = _parse_decimal(m.group(1))
        signals.original_currency = m.group(2).upper()
        signals.settled_amount = _parse_decimal(m.group(3))
        signals.settled_currency = "EUR"
        signals.conversion_fee = _parse_decimal(m.group(4))
        signals.is_cross_currency = True
        return

    # Format A: валюта транзакции ≠ EUR, есть "valiutos keitimo mok."
    fee_m = FX_FEE_PATTERN.search(purpose)
    if fee_m:
        signals.conversion_fee = _parse_decimal(fee_m.group(1))
        # В format A валюта транзакции уже оригинальная
        signals.original_amount = txn.amount
        signals.original_currency = txn.currency or ""
        signals.is_cross_currency = signals.original_currency != "EUR"
        return

    # Нет конвертации — оригинал = банковская сумма
    signals.original_amount = txn.amount
    signals.original_currency = txn.currency or ""
    signals.is_cross_currency = False


# ════════════════════════════════════════════════════════════
# Step 3: Merchant name extraction
# ════════════════════════════════════════════════════════════

# Паттерн для карточных мерчантов: "MERCHANT_NAME,LOCATION,COUNTRY"
# или "MERCHANT_NAME/LOCATION/COUNTRY"
CARD_MERCHANT_PATTERN = re.compile(
    r"^(.+?)[,/]\s*(.+?)[,/]\s*([A-Z]{2})\s*$"
)

# Для CLR format: "kortelė...NNNNNN MERCHANT_NAME #NNNNN"
CLR_MERCHANT_PATTERN = re.compile(
    r"kortel[eė]\.\.\.\d+\s+(.+?)\s+#\d+",
    re.IGNORECASE,
)

# Для вычленения имени мерчанта из разных форматов
MERCHANT_CLEANUP_PATTERNS = [
    (re.compile(r"\s*-\s*\d+REF$", re.IGNORECASE), ""),    # Remove "-278277805REF"
    (re.compile(r"\*\s*"), " "),                              # "SHOPIFY* " → "SHOPIFY "
    (re.compile(r"\s+"), " "),                                # Multiple spaces
]


def _extract_merchant(txn, purpose: str, cp_name: str, op_code: str,
                       signals: TransactionSignals):
    """Извлекает имя мерчанта из всех доступных источников."""

    merchant_raw = ""

    if signals.txn_type == "card_clearing":
        # Format B: мерчант в purpose после "kortelė...NNNNNN"
        m = CLR_MERCHANT_PATTERN.search(purpose)
        if m:
            merchant_raw = m.group(1).strip()

    elif signals.txn_type == "card_direct":
        # Format A: мерчант в counterparty_name
        merchant_raw = cp_name.strip()

    else:
        # Bank transfer: counterparty_name уже содержит имя
        merchant_raw = cp_name.strip()

    signals.merchant_name_raw = merchant_raw

    # Чистим: убираем location, reference suffix, звёздочки
    clean = merchant_raw

    # Убираем ",Dublin,IE" или "/Dublin/IE" или ",GUNZENHAUSEN,DE"
    m = CARD_MERCHANT_PATTERN.match(clean)
    if m:
        clean = m.group(1).strip()

    # Убираем "-278277805REF" и "* "
    for pattern, replacement in MERCHANT_CLEANUP_PATTERNS:
        clean = pattern.sub(replacement, clean)

    clean = clean.strip()
    signals.merchant_name_clean = clean

    # Ключевые слова для fuzzy matching
    keywords = _extract_keywords(clean)
    signals.merchant_keywords = keywords


def _extract_keywords(name: str) -> list:
    """Извлекает значимые ключевые слова из имени мерчанта."""
    if not name:
        return []

    # Убираем спецсимволы, оставляем слова
    words = re.findall(r"[A-Za-z0-9]+", name.upper())

    # Фильтруем стоп-слова
    stop_words = {
        "INC", "LTD", "LLC", "GMBH", "UAB", "AB", "VŠĮ", "PTY",
        "LIMITED", "SOFTWARE", "GLOBAL", "INTERNATIONAL",
        "PAYMENTS", "EUROPE", "IRELAND", "HTTPSWWW", "HTTP", "HTTPS",
        "WWW", "COM", "CO", "DE", "IE", "US", "GB", "CA",
        "REF", "PLAN",
    }

    keywords = [w.lower() for w in words if w not in stop_words and len(w) >= 3]
    return keywords


# ════════════════════════════════════════════════════════════
# Step 4: Reference extraction
# ════════════════════════════════════════════════════════════

# Upwork pattern: "Upwork -278277805REF" → "278277805"
UPWORK_REF_PATTERN = re.compile(
    r"[Uu]pwork\s*-\s*(\d{6,12})(?:REF)?",
)

# Shopify pattern: "SHOPIFY* 73611917" → "73611917"
SHOPIFY_REF_PATTERN = re.compile(
    r"SHOPIFY\*?\s*(\d{6,12})",
    re.IGNORECASE,
)

# Canva pattern: "CANVA* 02572-11815432" → "0257211815432"
CANVA_REF_PATTERN = re.compile(
    r"CANVA\*?\s*(\d{4,6}[-]\d{6,12})",
    re.IGNORECASE,
)

# Google Ads: "GOOGLE *ADS2039782970" → "2039782970"
GOOGLE_ADS_PATTERN = re.compile(
    r"GOOGLE\s*\*?\s*ADS\s*(\d{8,15})",
    re.IGNORECASE,
)

# Facebook: "FACEBK *XNYC9RARJ2" → "XNYC9RARJ2" (usually not matching invoices)
FACEBOOK_REF_PATTERN = re.compile(
    r"FACEBK?\s*\*?\s*([A-Z0-9]{8,15})",
    re.IGNORECASE,
)

# Generic: любой reference-like token после известных ключевых слов
# "dok. nr. 581", "krepselis Nr. 935201"
DOC_NR_PATTERN = re.compile(
    r"(?:dok\.?\s*nr\.?|krepšelis\s*nr\.?|Nr\.?)\s*([A-Za-z0-9\-/]{3,30})",
    re.IGNORECASE,
)

# Generic number after merchant separator: "PAYONEER*PAYONEER.COM*175"
GENERIC_MERCHANT_REF = re.compile(
    r"[A-Z]+\*[A-Z.]+\*(\d{2,10})",
    re.IGNORECASE,
)


def _extract_references(txn, purpose: str, cp_name: str, doc_num: str,
                         signals: TransactionSignals):
    """Извлекает все возможные reference/номера из транзакции."""

    refs = []
    seen = set()  # Для дедупликации

    def _add_ref(value: str, source: str, confidence: str):
        norm = _normalize_ref(value)
        if norm and len(norm) >= 3 and norm not in seen:
            seen.add(norm)
            refs.append(ExtractedReference(
                value=value, value_normalized=norm,
                source=source, confidence=confidence,
            ))

    # ── 1. doc_number поле транзакции ───────────────────────
    if doc_num and doc_num.strip():
        _add_ref(doc_num.strip(), "doc_number", "high")

    # ── 2. Upwork reference ─────────────────────────────────
    for text, source in [(cp_name, "counterparty_name"), (purpose, "purpose")]:
        for m in UPWORK_REF_PATTERN.finditer(text):
            digits = m.group(1)
            _add_ref(digits, source, "high")
            # Также добавляем с prefix "T" (Upwork invoices: T278277805)
            _add_ref(f"T{digits}", source, "high")

    # ── 3. Shopify reference ────────────────────────────────
    for text, source in [(cp_name, "counterparty_name"), (purpose, "purpose")]:
        for m in SHOPIFY_REF_PATTERN.finditer(text):
            _add_ref(m.group(1), source, "high")

    # ── 4. Canva reference ──────────────────────────────────
    for text, source in [(cp_name, "counterparty_name"), (purpose, "purpose")]:
        for m in CANVA_REF_PATTERN.finditer(text):
            raw = m.group(1)  # "02572-11815432"
            _add_ref(raw, source, "medium")
            # Strip dashes for matching: "0257211815432"
            stripped = raw.replace("-", "")
            _add_ref(stripped, source, "high")

    # ── 5. Google Ads reference ─────────────────────────────
    for text, source in [(cp_name, "counterparty_name"), (purpose, "purpose")]:
        for m in GOOGLE_ADS_PATTERN.finditer(text):
            _add_ref(m.group(1), source, "medium")

    # ── 6. Facebook reference ───────────────────────────────
    for text, source in [(cp_name, "counterparty_name"), (purpose, "purpose")]:
        for m in FACEBOOK_REF_PATTERN.finditer(text):
            _add_ref(m.group(1), source, "low")

    # ── 7. Generic merchant ref (PAYONEER*...*175) ──────────
    for text, source in [(cp_name, "counterparty_name"), (purpose, "purpose")]:
        for m in GENERIC_MERCHANT_REF.finditer(text):
            _add_ref(m.group(1), source, "low")

    # ── 8. Doc number from purpose ──────────────────────────
    for m in DOC_NR_PATTERN.finditer(purpose):
        val = m.group(1).strip()
        # Фильтруем мусор: слишком короткие, чисто числовые < 3 цифр
        if len(val) >= 3:
            _add_ref(val, "purpose_doc_nr", "medium")

    signals.references = refs


def _normalize_ref(ref: str) -> str:
    """Нормализует reference: upper, strip spaces/dashes."""
    if not ref:
        return ""
    return re.sub(r"[\s\-/]", "", ref).upper()


# ════════════════════════════════════════════════════════════
# Step 5: Merchant alias resolution
# ════════════════════════════════════════════════════════════

def _resolve_aliases(signals: TransactionSignals):
    """Находит известные алиасы мерчанта для fuzzy matching с seller names."""
    aliases = set()

    for keyword in signals.merchant_keywords:
        if keyword in MERCHANT_ALIASES:
            aliases.update(MERCHANT_ALIASES[keyword])

    # Также проверяем raw name
    raw_lower = signals.merchant_name_clean.lower()
    for key, values in MERCHANT_ALIASES.items():
        if key in raw_lower:
            aliases.update(values)

    signals.merchant_alias_matches = list(aliases)


# ════════════════════════════════════════════════════════════
# Helper
# ════════════════════════════════════════════════════════════

def _parse_decimal(value: str) -> Optional[Decimal]:
    """Парсит decimal из строки, поддерживает запятую как разделитель."""
    if not value:
        return None
    try:
        return Decimal(value.replace(",", "."))
    except (InvalidOperation, ValueError):
        return None


# ════════════════════════════════════════════════════════════
# Enhanced scoring using signals
# ════════════════════════════════════════════════════════════

def score_with_signals(
    signals: TransactionSignals,
    candidate: dict,
    normalize_name_func,
    amount_tolerance_abs=Decimal("0.05"),
    amount_tolerance_pct=Decimal("0.01"),
) -> tuple[Decimal, dict]:
    """
    Скорит кандидата (Purchase/Invoice dict из кэша) используя
    извлечённые сигналы. Возвращает (score, reasons_dict).

    candidate dict keys:
        id, full_number, series, number, amount, remaining, currency,
        seller_name, seller_norm, seller_code, seller_iban,
        invoice_date, due_date
    """
    score = Decimal("0")
    reasons = {}

    # ════════════════════════════════════════════════════════
    # 1. ВАЛЮТА — hard filter или cross-currency
    # ════════════════════════════════════════════════════════

    match_currency = signals.original_currency or signals.bank_currency
    inv_currency = candidate.get("currency", "EUR")

    currency_match = (match_currency.upper() == inv_currency.upper()) if match_currency else True

    if not currency_match:
        # Если есть оригинальная валюта и она не совпадает — жёсткий фильтр
        if not signals.is_cross_currency:
            return Decimal("-1"), {"Valiuta nesutampa": f"{match_currency} ≠ {inv_currency}"}

    # ════════════════════════════════════════════════════════
    # 2. REFERENCE / НОМЕР ДОКУМЕНТА — самый сильный сигнал
    # ════════════════════════════════════════════════════════

    number_found = False
    inv_number_upper = (candidate.get("number") or "").upper()
    inv_full_upper = (candidate.get("full_number") or "").upper()

    # Нормализованные версии для сравнения
    inv_number_clean = re.sub(r"[\s\-/]", "", inv_number_upper)
    inv_full_clean = re.sub(r"[\s\-/]", "", inv_full_upper)

    # Также пробуем stripped prefix: T278277805 → 278277805
    inv_number_digits = re.sub(r"^[A-Z]{1,2}", "", inv_number_clean)

    for ref in signals.references:
        norm = ref.value_normalized

        if norm == inv_full_clean or norm == inv_number_clean:
            number_found = True
            conf_bonus = Decimal("0.40") if ref.confidence == "high" else Decimal("0.30")
            score += conf_bonus
            reasons["Dokumento numeris rastas"] = ref.value
            break

        # Stripped prefix match: reference "278277805" matches invoice "T278277805"
        if inv_number_digits and len(inv_number_digits) >= 6 and norm == inv_number_digits:
            number_found = True
            score += Decimal("0.35")
            reasons["Dokumento numeris rastas (be prefikso)"] = f"{ref.value} → {candidate['full_number']}"
            break

        # Partial: reference цифры содержатся в full_number
        if len(norm) >= 6 and (norm in inv_full_clean or norm in inv_number_clean):
            number_found = True
            score += Decimal("0.30")
            reasons["Dokumento numeris panašus"] = ref.value
            break

    # ════════════════════════════════════════════════════════
    # 3. СУММА — с поддержкой cross-currency
    # ════════════════════════════════════════════════════════

    amount_match = False
    match_amount = signals.original_amount or signals.bank_amount

    if match_amount and currency_match:
        remaining = candidate.get("remaining", Decimal("0"))
        total = candidate.get("amount", Decimal("0"))

        if abs(match_amount - remaining) <= amount_tolerance_abs:
            score += Decimal("0.30")
            reasons["Suma tiksliai sutampa su likučiu"] = str(remaining)
            amount_match = True
        elif abs(match_amount - total) <= amount_tolerance_abs:
            score += Decimal("0.25")
            reasons["Suma tiksliai sutampa su bendra suma"] = str(total)
            amount_match = True
        elif remaining > 0 and abs(match_amount - remaining) / remaining <= amount_tolerance_pct:
            score += Decimal("0.15")
            reasons["Suma artima likučiui (±1%)"] = str(remaining)
            amount_match = True
        elif total > 0 and abs(match_amount - total) / total <= amount_tolerance_pct:
            score += Decimal("0.15")
            reasons["Suma artima bendrai sumai (±1%)"] = str(total)
            amount_match = True
        elif match_amount < remaining:
            score += Decimal("0.05")
            reasons["Dalinė įmoka"] = True

    elif not currency_match and signals.is_cross_currency:
        # Cross-currency: транзакция в EUR, инвойс в USD
        # Используем settled amount для приблизительного сравнения
        # tolerance ±5% из-за курсовых колебаний
        remaining = candidate.get("remaining", Decimal("0"))
        if signals.settled_amount and remaining > 0:
            ratio = signals.settled_amount / remaining
            if Decimal("0.85") <= ratio <= Decimal("1.15"):
                score += Decimal("0.10")
                reasons["Suma panašiai sutampa (keitimo kursas)"] = (
                    f"{signals.settled_amount} EUR ≈ {remaining} {inv_currency}"
                )
                amount_match = True

    # ── Combo: номер + сумма ────────────────────────────────
    if number_found and amount_match:
        score += Decimal("0.10")
        reasons["Numeris ir suma sutampa"] = True

    # ════════════════════════════════════════════════════════
    # 4. КОНТРАГЕНТ — код, IBAN, имя (с алиасами)
    # ════════════════════════════════════════════════════════

    # ── 4a. Код контрагента ─────────────────────────────────
    txn_code = signals.counterparty_code
    inv_code = candidate.get("seller_code", "")

    if txn_code and inv_code:
        if txn_code == inv_code:
            score += Decimal("0.40")
            reasons["Tiekėjo kodas sutampa"] = txn_code
        else:
            score -= Decimal("0.30")
            reasons["Tiekėjo kodas nesutampa"] = f"{txn_code} ≠ {inv_code}"

    # ── 4b. IBAN ────────────────────────────────────────────
    txn_iban = signals.counterparty_iban
    inv_iban = candidate.get("seller_iban", "")

    if txn_iban and inv_iban and txn_iban == inv_iban:
        score += Decimal("0.25")
        reasons["Tiekėjo IBAN sutampa"] = txn_iban

    # ── 4c. Имя контрагента (обычное сравнение) ─────────────
    name_score = _score_name_match(signals, candidate, normalize_name_func)
    if name_score > Decimal("0"):
        score += name_score
        if name_score >= Decimal("0.20"):
            reasons["Tiekėjo pavadinimas sutampa"] = True
        else:
            reasons["Tiekėjo pavadinimas panašus"] = True
    elif name_score < Decimal("0"):
        score += name_score
        reasons["Tiekėjo pavadinimas nesutampa"] = True

    # ════════════════════════════════════════════════════════
    # 5. ДАТА
    # ════════════════════════════════════════════════════════

    date_score, date_reason = _score_date(
        getattr(signals, '_txn_date', None) or candidate.get("_txn_date"),
        candidate.get("invoice_date"),
        candidate.get("due_date"),
    )
    if date_score != Decimal("0") and date_reason:
        score += date_score
        reasons[date_reason] = True

    # ── Clamp ───────────────────────────────────────────────
    score = max(min(score, Decimal("1.00")), Decimal("-1.00"))

    return score, reasons


# ════════════════════════════════════════════════════════════
# Name matching with alias support
# ════════════════════════════════════════════════════════════

def _score_name_match(
    signals: TransactionSignals,
    candidate: dict,
    normalize_name_func,
) -> Decimal:
    """
    Скорит совпадение имени контрагента/мерчанта с seller.
    Использует:
      1. Прямое нормализованное сравнение
      2. Substring matching
      3. Alias-based matching (FACEBK → facebook → "Facebook Ireland Limited")
      4. Keyword intersection
    """

    seller_name = candidate.get("seller_name", "")
    seller_norm = candidate.get("seller_norm", "") or normalize_name_func(seller_name)

    if not seller_norm:
        return Decimal("0")

    # ── 1. Прямое сравнение counterparty_name ───────────────
    if signals.counterparty_name:
        txn_norm = normalize_name_func(signals.counterparty_name)
        if txn_norm and len(txn_norm) >= 3:
            if txn_norm == seller_norm:
                return Decimal("0.20")
            if len(txn_norm) >= 5 and len(seller_norm) >= 5:
                if txn_norm in seller_norm or seller_norm in txn_norm:
                    return Decimal("0.10")

    # ── 2. Merchant clean name (для карточных) ──────────────
    if signals.merchant_name_clean:
        merchant_norm = normalize_name_func(signals.merchant_name_clean)
        if merchant_norm and len(merchant_norm) >= 3:
            if merchant_norm == seller_norm:
                return Decimal("0.20")
            if len(merchant_norm) >= 4 and len(seller_norm) >= 4:
                if merchant_norm in seller_norm or seller_norm in merchant_norm:
                    return Decimal("0.10")

    # ── 3. Alias-based matching ─────────────────────────────
    # Если мерчант "FACEBK", aliases = ["facebook", "meta"]
    # Проверяем: содержится ли alias в seller_norm?
    if signals.merchant_alias_matches:
        seller_lower = seller_name.lower()
        for alias in signals.merchant_alias_matches:
            if alias in seller_lower:
                return Decimal("0.15")

    # ── 4. Keyword intersection ─────────────────────────────
    if signals.merchant_keywords:
        seller_keywords = set(_extract_keywords(seller_name))
        if seller_keywords:
            common = set(signals.merchant_keywords) & seller_keywords
            if common:
                # Хотя бы одно значимое слово совпало
                return Decimal("0.10")

    # ── 5. Нет совпадения — штраф (если оба имени есть) ────
    has_txn_name = bool(signals.counterparty_name or signals.merchant_name_clean)
    if has_txn_name and len(seller_norm) >= 4:
        # Мягкий штраф — не такой жёсткий как для кода
        return Decimal("-0.10")

    return Decimal("0")


# ════════════════════════════════════════════════════════════
# Date scoring (reused from existing engine)
# ════════════════════════════════════════════════════════════

def _score_date(txn_date, inv_date, due_date) -> tuple[Decimal, str]:
    """Score based on payment date proximity to invoice/due date."""
    if not txn_date or not inv_date:
        return Decimal("0"), ""

    if txn_date < inv_date:
        days_before = (inv_date - txn_date).days
        if days_before <= 3:
            return Decimal("0"), ""
        return Decimal("-0.20"), f"Mokėjimas {days_before} d. prieš dokumentą"

    reference = due_date or inv_date
    days = (txn_date - reference).days

    if days <= 60:
        return Decimal("0.05"), "Mokėjimas laiku"
    elif days <= 120:
        return Decimal("-0.05"), f"Mokėjimas vėluoja {days} d."
    elif days <= 180:
        return Decimal("-0.10"), f"Mokėjimas labai vėluoja ({days} d.)"
    return Decimal("-0.20"), f"Mokėjimas per toli ({days} d.)"


# ════════════════════════════════════════════════════════════
# Multi-invoice matching (1 payment → N invoices)
# ════════════════════════════════════════════════════════════

def try_multi_invoice_match(
    signals: TransactionSignals,
    scored_candidates: list,
    likely_threshold: Decimal = Decimal("0.40"),
    amount_tolerance: Decimal = Decimal("0.05"),
) -> Optional[dict]:
    """
    Пробует сматчить один платёж с несколькими счетами
    от одного контрагента.

    scored_candidates: list of (candidate_dict, score, reasons)
    Returns: dict с результатом или None.
    """
    match_amount = signals.original_amount or signals.bank_amount
    if not match_amount:
        return None

    eligible = [(c, s, r) for c, s, r in scored_candidates if s >= likely_threshold]
    if len(eligible) < 2:
        return None

    # Группируем по контрагенту (seller_code → seller_norm → seller_iban)
    groups = {}
    for c, s, r in eligible:
        key = (
            c.get("seller_code") or
            c.get("seller_norm") or
            c.get("seller_iban") or
            "unknown"
        )
        groups.setdefault(key, []).append((c, s, r))

    best_result = None

    for group_key, group in groups.items():
        if len(group) < 2:
            continue

        # Сортируем по дате (FIFO — старые первые)
        group.sort(key=lambda x: x[0].get("invoice_date") or "9999-99-99")

        selected = []
        running = Decimal("0")

        for c, s, r in group:
            if running >= match_amount:
                break
            remaining = c.get("remaining", Decimal("0"))
            take = min(remaining, match_amount - running)
            selected.append((c, s, r, take))
            running += take

        if len(selected) < 2:
            continue

        # Проверяем: набралась ли сумма?
        if abs(running - match_amount) <= amount_tolerance:
            sum_bonus = Decimal("0.25")
        elif running > 0 and abs(running - match_amount) / running <= Decimal("0.01"):
            sum_bonus = Decimal("0.15")
        elif running < match_amount:
            continue  # Не набрали — пропускаем
        else:
            sum_bonus = Decimal("0")

        avg_score = sum(s for _, s, _, _ in selected) / len(selected) + sum_bonus
        min_score = min(s for _, s, _, _ in selected)

        if best_result is None or avg_score > best_result["avg_score"]:
            best_result = {
                "selected": selected,
                "avg_score": avg_score,
                "min_score": min_score,
                "sum_bonus": sum_bonus,
                "total_allocated": running,
            }

    return best_result


# ════════════════════════════════════════════════════════════
# Integration helper: use signals in existing engine
# ════════════════════════════════════════════════════════════

def should_skip_transaction(txn) -> tuple[bool, str]:
    """
    Быстрая проверка — нужно ли пропустить транзакцию.
    Используется ДО build_cache для раннего выхода.

    Returns: (should_skip, category)
    """
    signals = extract_signals(txn)
    if signals.skip_matching:
        return True, signals.txn_type
    return False, ""


def get_match_amount_and_currency(txn) -> tuple[Decimal, str]:
    """
    Возвращает правильную сумму и валюту для матчинга.
    Для cross-currency транзакций — оригинальная сумма/валюта.
    """
    signals = extract_signals(txn)
    return (
        signals.original_amount or txn.amount,
        signals.original_currency or txn.currency or "",
    )