import re
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Dict, Optional
import logging

logger = logging.getLogger("celery")

# ---- твои базовые парсеры (оставь как есть) ----
def parse_date_lit(s: str):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except (ValueError, TypeError):
            continue
    return None

def parse_decimal_lit(s: Any):
    if s is None:
        return None
    if not isinstance(s, str):
        s = str(s)
    cleaned = re.sub(r"[^\d,\.\-]", "", s)
    normalized = cleaned.replace(",", ".")
    try:
        return Decimal(normalized)
    except Exception:
        return None

def parse_percent_int(s: Any):
    if s is None or s == "" or str(s).lower() == "null":
        return None
    cleaned = re.sub(r"[^\d,\.\-]", "", str(s))
    normalized = cleaned.replace(",", ".")
    try:
        pct = Decimal(normalized)
        return int(pct.to_integral_value())
    except Exception:
        return None

# ---- дополнительные преобразователи ----
def convert_for_json(obj):
    """Преобразует Decimal и даты в сериализуемый вид для JSON."""
    if isinstance(obj, dict):
        return {k: convert_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_for_json(v) for v in obj]
    elif isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, (date, datetime)):
        return obj.isoformat()  # YYYY-MM-DD
    return obj


TRUE_SET = {"true", "t", "1", "yes", "y", "on"}
FALSE_SET = {"false", "f", "0", "no", "n", "off"}

def coerce_bool(v: Any) -> Optional[bool]:
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in TRUE_SET:
        return True
    if s in FALSE_SET:
        return False
    return None  # неизвестно — оставим None

def coerce_str(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s != "" else None

def clamp_len(s: Optional[str], max_len: int) -> Optional[str]:
    if s is None:
        return None
    return s[:max_len]

def empty_to_none(v: Any) -> Any:
    # "" -> None, "null" -> None
    if v is None:
        return None
    if isinstance(v, str) and v.strip().lower() in {"", "null", "none"}:
        return None
    return v

# ---- поля и их парсеры для верхнего уровня документа ----
DOC_FIELD_PARSERS = {
    # dates
    "invoice_date": parse_date_lit,
    "due_date": parse_date_lit,
    "operation_date": parse_date_lit,
    # decimals
    "amount_wo_vat": parse_decimal_lit,
    "vat_amount": parse_decimal_lit,
    "vat_percent": parse_decimal_lit,  # сюда может прилететь "21%" — ок
    "amount_with_vat": parse_decimal_lit,
    "invoice_discount_with_vat": parse_decimal_lit,
    "invoice_discount_wo_vat": parse_decimal_lit,
    "similarity_percent": parse_decimal_lit,
    # booleans
    "with_receipt": coerce_bool,
    "separate_vat": coerce_bool,
    "seller_is_person": coerce_bool,
    "buyer_is_person": coerce_bool,
    "report_to_isaf": coerce_bool,
}

# строковые поля и их max_length из модели ScannedDocument
DOC_STR_MAXLEN = {
    "seller_id": 100,
    "seller_name": 255,
    "seller_vat_code": 50,
    "seller_address": 255,
    "seller_country": 50,
    "seller_country_iso": 10,
    "seller_iban": 255,
    "buyer_id": 100,
    "buyer_name": 255,
    "buyer_vat_code": 50,
    "buyer_address": 255,
    "buyer_country": 50,
    "buyer_country_iso": 10,
    "buyer_iban": 255,
    "document_series": 50,
    "document_number": 100,
    "order_number": 100,
    "currency": 20,
    "document_type": 100,
    "note": 1024,  # безопасный лимит
    "document_type_code": 50,
    "xml_source": 255,
    # product-like shortcuts for sumiskai:
    "prekes_kodas": 128,
    "prekes_barkodas": 128,
    "prekes_pavadinimas": 255,
    "prekes_tipas": 128,
    "preke_paslauga": 12,
    "sandelio_kodas": 128,
    "sandelio_pavadinimas": 255,
    "objekto_kodas": 128,
    "objekto_pavadinimas": 255,
    "padalinio_kodas": 128,
    "padalinio_pavadinimas": 255,
    "mokescio_kodas": 128,
    "mokescio_pavadinimas": 255,
    "atsakingo_asmens_kodas": 128,
    "atsakingo_asmens_pavadinimas": 255,
    "operacijos_kodas": 128,
    "operacijos_pavadinimas": 255,
    "islaidu_straipsnio_kodas": 128,
    "islaidu_straipsnio_pavadinimas": 255,
    "pvm_kodas": 128,
    "pvm_pavadinimas": 255,
    "tipo_kodas": 128,
    "tipo_pavadinimas": 255,
    "zurnalo_kodas": 128,
    "zurnalo_pavadinimas": 255,
    "projekto_kodas": 128,
    "projekto_pavadinimas": 255,
    "projekto_vadovo_kodas": 128,
    "projekto_vadovo_pavadinimas": 255,
    "skyrio_kodas": 128,
    "skyrio_pavadinimas": 255,
    "partijos_nr_kodas": 128,
    "partijos_nr_pavadinimas": 255,
    "korespondencijos_kodas": 128,
    "korespondencijos_pavadinimas": 255,
    "serijos_kodas": 128,
    "serijos_pavadinimas": 255,
    "centro_kodas": 128,
    "centro_pavadinimas": 255,
}

# ---- line item парсинг ----
LINE_DECIMAL_FIELDS = {
    "quantity", "price", "subtotal", "vat", "vat_percent", "total",
    "discount_with_vat", "discount_wo_vat"
}

LINE_STR_MAXLEN = {
    "line_id": 100,
    "product_code": 128,
    "product_barcode": 128,
    "product_name": 255,
    "prekes_tipas": 128,
    "preke_paslauga": 12,
    "unit": 50,
    "sandelio_kodas": 128,
    "sandelio_pavadinimas": 255,
    "objekto_kodas": 128,
    "objekto_pavadinimas": 255,
    "padalinio_kodas": 128,
    "padalinio_pavadinimas": 255,
    "mokescio_kodas": 128,
    "mokescio_pavadinimas": 255,
    "atsakingo_asmens_kodas": 128,
    "atsakingo_asmens_pavadinimas": 255,
    "operacijos_kodas": 128,
    "operacijos_pavadinimas": 255,
    "islaidu_straipsnio_kodas": 128,
    "islaidu_straipsnio_pavadinimas": 255,
    "pvm_kodas": 128,
    "pvm_pavadinimas": 255,
    "tipo_kodas": 128,
    "tipo_pavadinimas": 255,
    "zurnalo_kodas": 128,
    "zurnalo_pavadinimas": 255,
    "projekto_kodas": 128,
    "projekto_pavadinimas": 255,
    "projekto_vadovo_kodas": 128,
    "projekto_vadovo_pavadinimas": 255,
    "skyrio_kodas": 128,
    "skyrio_pavadinimas": 255,
    "partijos_nr_kodas": 128,
    "partijos_nr_pavadinimas": 255,
    "korespondencijos_kodas": 128,
    "korespondencijos_pavadinimas": 255,
    "serijos_kodas": 128,
    "serijos_pavadinimas": 255,
    "centro_kodas": 128,
    "centro_pavadinimas": 255,
}

def sanitize_document_struct(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Нормализует все известные поля документа: даты/десятичные/булевы/строки/пустые."""
    out = dict(doc or {})

    # пустые -> None
    for k, v in list(out.items()):
        out[k] = empty_to_none(v)

    # известные преобразования типов
    for field, fn in DOC_FIELD_PARSERS.items():
        if field in out:
            out[field] = fn(out[field])

    # строки + ограничение длины
    for field, max_len in DOC_STR_MAXLEN.items():
        if field in out:
            out[field] = clamp_len(coerce_str(out[field]), max_len)

    # отдельная защита: если vat_percent от парсера пришёл как int/Decimal — ок; если нет — None
    # (parse_decimal_lit уже сделал всё, включая "21%")
    return out

def sanitize_line_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Нормализует line item: числа/строки/пустые/ограничение длины."""
    out = dict(item or {})

    for k, v in list(out.items()):
        out[k] = empty_to_none(v)

    # десятичные/проценты
    for f in LINE_DECIMAL_FIELDS:
        if f in out:
            out[f] = parse_decimal_lit(out[f])

    # строки + ограничение длины
    for f, max_len in LINE_STR_MAXLEN.items():
        if f in out:
            out[f] = clamp_len(coerce_str(out[f]), max_len)

    # нормализуем unit (например, пустые -> None)
    if "unit" in out:
        out["unit"] = clamp_len(coerce_str(out["unit"]), LINE_STR_MAXLEN["unit"])

    return out




















# import re
# from datetime import datetime
# from decimal import Decimal
# import logging
# logger = logging.getLogger("celery")

# def parse_date_lit(s: str):
#     if not s:
#         return None
#     for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
#         try:
#             return datetime.strptime(s, fmt).date()
#         except (ValueError, TypeError):
#             continue
#     return None

# def parse_decimal_lit(s: str):
#     if s is None:
#         return None
#     if not isinstance(s, str):
#         s = str(s)
#     cleaned = re.sub(r"[^\d,\.\-]", "", s)
#     normalized = cleaned.replace(",", ".")
#     try:
#         return Decimal(normalized)
#     except Exception:
#         return None

# def parse_percent_int(s):
#     if s is None or s == "" or str(s).lower() == "null":
#         return None
#     cleaned = re.sub(r"[^\d,\.\-]", "", str(s))
#     normalized = cleaned.replace(",", ".")
#     try:
#         pct = Decimal(normalized)
#         return int(pct.to_integral_value())
#     except Exception:
#         return None