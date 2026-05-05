"""
Rivile GAMA REST API v2 — HTTP клиент и экспорт документов.

Endpoint:  POST https://api.manorivile.lt/client/v2
Auth:      Header ApiKey
Format:    JSON (Content-Type: application/json, Accept: application/json)

Workflow на пачку документов:
  1. EDIT_N08_FULL  × N  (контрагенты + банк. реквизиты)
  2. EDIT_N17       × N  (товары + услуги)
  3. EDIT_N25       × N  (коды)
  4. EDIT_I06_FULL  × N  (документы + строки)

Каждый вызов = 1 запись.  Дубликаты (5008/2011) считаем успехом.
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

import requests
from django.utils import timezone

from .rivile import (
    normalize_preke_paslauga_tipas,
    get_party_code,
    build_dok_nr,
    get_currency_rate,
    get_rivile_fraction,
    _get_gama_extras,
    _get_merge_vat,
    _nz,
    compute_global_invoice_discount_pct,
    compute_global_invoice_discount_pct_for_merge_vat,
    _get_pvm_kodas_for_item,
    _get_pvm_kodas_for_doc,
    _pick_isaf_for_purchase,
    _scale_qty,
)

logger = logging.getLogger("docscanner_app")

# ═══════════════════════════════════════════════════════════
# Константы
# ═══════════════════════════════════════════════════════════
RIVILE_API_URL = "https://api.manorivile.lt/client/v2"
# RIVILE_API_URL = "http://localhost:8879/client/v2" #fake server for testing
REQUEST_TIMEOUT = 45  # секунды

# Коды ошибок, которые означают "запись уже существует" = не ошибка
DUPLICATE_ERROR_CODES = {
    "5008",  # Tokia prekė/paslauga jau yra
    "2011",  # Egzistuoja toks kliento kodas
    "19017",  # Toks kodas jau yra (N25)
}

# Коды инфраструктурных ошибок — прекращаем всю сессию
INFRA_HTTP_CODES = {401, 502, 504, 500}


# ═══════════════════════════════════════════════════════════
# Dataclasses для результатов
# ═══════════════════════════════════════════════════════════
@dataclass
class RivileApiResult:
    """Результат одного API вызова."""
    success: bool = False
    http_status: int = 0
    method: str = ""
    entity_code: str = ""
    rivile_id: str = ""        # напр. I06_KODAS_PO
    errors: list = field(default_factory=list)   # [{tag, code, message}, ...]
    error_message: str = ""    # общий errorMessage
    raw_response: str = ""
    is_duplicate: bool = False
    exception: str = ""


@dataclass
class RivileDocExportResult:
    """Результат экспорта одного документа (I06_FULL)."""
    doc_id: int = 0
    api_result: Optional[RivileApiResult] = None
    n08_result: Optional[RivileApiResult] = None  # контрагент этого документа
    n17_results: list = field(default_factory=list)  # товары этого документа
    n25_results: list = field(default_factory=list)  # коды этого документа
    overall_status: str = ""   # success / partial_success / error


@dataclass
class RivileExportSession:
    """Результат всей сессии экспорта пачки."""
    session_id: str = ""
    overall_status: str = ""   # success / partial_success / error
    n08_results: list = field(default_factory=list)
    n17_results: list = field(default_factory=list)
    n25_results: list = field(default_factory=list)
    i06_results: list = field(default_factory=list)  # [RivileDocExportResult]
    total_requests: int = 0
    infra_error: str = ""      # если 401/502/504 — всё прерываем


# ═══════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════
def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _safe_D(x) -> Decimal:
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _format_date(v) -> str:
    """Дата в формат YYYY-MM-DD."""
    if not v:
        return ""
    if isinstance(v, (date, datetime)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()[:10]
    return s


def _to_decimal_str(v, default="0") -> str:
    s = _s(v).replace(",", ".")
    if not s:
        return default
    try:
        d = Decimal(s)
    except (InvalidOperation, ValueError):
        return default
    result = format(d, "f")
    if "." in result:
        result = result.rstrip("0").rstrip(".")
    return result or "0"


def _vat_to_int_str(v) -> str:
    """Конвертирует ставку НДС в целое число строкой: 21.00 -> '21'."""
    if v is None or v == "":
        return "0"
    try:
        d = Decimal(str(v).replace(",", ".").replace("%", ""))
        return str(int(d))
    except Exception:
        return "0"


# ═══════════════════════════════════════════════════════════
# HTTP Transport
# ═══════════════════════════════════════════════════════════
def _send_request(api_key: str, payload: dict, timeout: int = REQUEST_TIMEOUT) -> RivileApiResult:
    """
    Отправляет один POST запрос к Rivile API v2.
    Возвращает RivileApiResult.
    """
    method_name = payload.get("method", "") if isinstance(payload, dict) else ""
    result = RivileApiResult(method=method_name)

    headers = {
        "ApiKey": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        resp = requests.post(
            RIVILE_API_URL,
            json=payload,
            headers=headers,
            timeout=timeout,
        )
    except requests.exceptions.Timeout:
        result.error_message = "Request timeout"
        result.exception = "Timeout"
        return result
    except requests.exceptions.ConnectionError as e:
        result.error_message = f"Connection error: {e}"
        result.exception = str(e)
        return result
    except Exception as e:
        result.error_message = f"Request failed: {e}"
        result.exception = str(e)
        return result

    result.http_status = resp.status_code
    result.raw_response = resp.text[:3000]

    try:
        data = resp.json()
    except Exception:
        result.error_message = f"JSON parse error, HTTP {resp.status_code}"
        logger.warning(
            "[RIVILE_API<-] method=%s status=%s non_json_response=%s",
            method_name,
            resp.status_code,
            resp.text[:3000],
        )
        return result

    try:
        raw_preview = json.dumps(data, ensure_ascii=False)[:4000]
    except Exception:
        raw_preview = str(data)[:4000]

    if resp.status_code != 200:
        logger.warning(
            "[RIVILE_API<-] method=%s status=%s data_type=%s raw=%s",
            method_name,
            resp.status_code,
            type(data).__name__,
            raw_preview,
        )
    else:
        logger.debug(
            "[RIVILE_API<-] method=%s status=%s data_type=%s raw=%s",
            method_name,
            resp.status_code,
            type(data).__name__,
            raw_preview,
        )

    if resp.status_code == 200:
        result.success = True
        result.error_message = ""
        result.rivile_id = _extract_rivile_id(data, method_name)
        return result

    if resp.status_code == 207:
        result.success = True
        result.rivile_id = _extract_rivile_id(data, method_name)
        result.errors = _extract_errors(data)
        result.error_message = "Partial success (207)"
        return result

    if resp.status_code == 400:
        result.errors = _extract_errors(data)
        result.error_message = _extract_error_message(data) or "Bad Request"

        if _is_duplicate_error(result.errors):
            result.success = True
            result.is_duplicate = True
            result.error_message = "Duplicate (already exists)"

        return result

    result.errors = _extract_errors(data)
    result.error_message = _extract_error_message(data) or f"HTTP {resp.status_code}"
    return result


def _extract_rivile_id(data: dict, method: str) -> str:
    """Извлекает ID созданной записи из ответа Rivile."""
    if not isinstance(data, dict):
        return ""

    if "I06" in data:
        i06 = data["I06"]
        if isinstance(i06, dict):
            return _s(i06.get("I06_KODAS_PO", ""))

    if "N08" in data:
        n08 = data["N08"]
        if isinstance(n08, dict):
            return _s(n08.get("N08_KODAS_KS", ""))

    if "N17" in data:
        n17 = data["N17"]
        if isinstance(n17, dict):
            return _s(n17.get("N17_KODAS_PS", ""))

    if "N25" in data:
        n25 = data["N25"]
        if isinstance(n25, dict):
            return _s(n25.get("N25_KODAS_BS", ""))

    return ""


def _as_list(value) -> list:
    if value is None:
        return []

    if isinstance(value, list):
        return value

    return [value]


def _get_any(d: dict, *keys, default=None):
    if not isinstance(d, dict):
        return default

    for key in keys:
        if key in d and d[key] is not None:
            return d[key]

    return default


def _make_error(tag="", code="", message="", raw=None) -> dict:
    tag = _s(tag)
    code = _s(code)
    message = _s(message)

    if not message and raw is not None:
        if isinstance(raw, str):
            message = raw
        else:
            try:
                message = json.dumps(raw, ensure_ascii=False)
            except Exception:
                message = str(raw)

    return {
        "tag": tag,
        "code": code,
        "message": message,
    }


def _extract_error_message(data) -> str:
    if isinstance(data, dict):
        message = _get_any(
            data,
            "errorMessage",
            "ErrorMessage",
            "message",
            "Message",
            "error",
            "Error",
            default="",
        )

        if isinstance(message, str):
            return _s(message)

        if message:
            try:
                return json.dumps(message, ensure_ascii=False)
            except Exception:
                return str(message)

    errors = _extract_errors(data)
    if errors:
        return errors[0].get("message", "") or errors[0].get("code", "")

    return ""


def _extract_errors(data) -> list:
    """
    Извлекает список ошибок из JSON ответа Rivile.

    Поддерживает разные форматы:
      {"errors": {"error": [...]}}
      {"errors": {"error": {...}}}
      {"errors": [...]}
      {"error": [...]}
      {"error": {...}}
      {"errors": [{"error": {"dataErrors": {"dataError": [...]}}}]}
      [...]
      "error text"
    """
    result = []

    def append_error(tag="", code="", message="", raw=None):
        err = _make_error(tag=tag, code=code, message=message, raw=raw)
        if err.get("tag") or err.get("code") or err.get("message"):
            result.append(err)

    def walk(node):
        if node is None:
            return

        if isinstance(node, list):
            for item in node:
                walk(item)
            return

        if not isinstance(node, dict):
            append_error(message=node, raw=node)
            return

        data_errors = _get_any(
            node,
            "dataErrors",
            "DataErrors",
            "dataError",
            "DataError",
            default=None,
        )

        if data_errors is not None:
            if isinstance(data_errors, dict):
                data_error_items = _get_any(
                    data_errors,
                    "dataError",
                    "DataError",
                    "error",
                    "Error",
                    default=None,
                )

                if data_error_items is None:
                    data_error_items = data_errors
            else:
                data_error_items = data_errors

            walk(data_error_items)
            return

        nested_errors = _get_any(
            node,
            "errors",
            "Errors",
            "error",
            "Error",
            default=None,
        )

        if nested_errors is not None:
            walk(nested_errors)
            return

        tag = _get_any(node, "tag", "Tag", "field", "Field", default="")
        code = _get_any(node, "code", "Code", "errorCode", "ErrorCode", "error_code", default="")
        message = _get_any(
            node,
            "message",
            "Message",
            "text",
            "Text",
            "description",
            "Description",
            "errorMessage",
            "ErrorMessage",
            default="",
        )

        if tag or code or message:
            append_error(tag=tag, code=code, message=message, raw=node)
        else:
            append_error(raw=node)

    if isinstance(data, dict):
        errors_block = _get_any(
            data,
            "errors",
            "Errors",
            "error",
            "Error",
            default=None,
        )

        if errors_block is not None:
            walk(errors_block)
        else:
            message = _get_any(
                data,
                "errorMessage",
                "ErrorMessage",
                "message",
                "Message",
                default="",
            )
            code = _get_any(
                data,
                "code",
                "Code",
                "errorCode",
                "ErrorCode",
                "error_code",
                default="",
            )

            if message or code:
                append_error(code=code, message=message, raw=data)
    else:
        walk(data)

    return result


def _is_duplicate_error(errors: list) -> bool:
    """Проверяет, все ли ошибки являются допустимыми дубликатами."""
    if not errors:
        return False

    return all(
        isinstance(e, dict) and e.get("code", "") in DUPLICATE_ERROR_CODES
        for e in errors
    )


# ═══════════════════════════════════════════════════════════
# Проверка API ключа (Hello)
# ═══════════════════════════════════════════════════════════
def verify_api_key(api_key: str) -> RivileApiResult:
    """
    Проверяет валидность API ключа.
    Делаем простой GET_N08_LIST запрос с pagenumber=1.
    Если 200 — ключ валиден и Gateway доступен.
    """
    payload = {
        "method": "GET_N08_LIST",
        "params": {
            "pagenumber": 1,
            "fil": "N08_KODAS_KS='___VERIFY___'",  # несуществующий код — вернёт пустой список
        },
    }
    result = _send_request(api_key, payload)
    result.method = "VERIFY"

    # 200 с пустым результатом — ключ валиден
    if result.http_status == 200:
        result.success = True
        return result

    # 400 тоже может означать что ключ валиден, но запрос неудачный — ОК
    if result.http_status == 400:
        result.success = True
        return result

    return result


# ═══════════════════════════════════════════════════════════
# Построение JSON payload из данных документа
# ═══════════════════════════════════════════════════════════

def build_n08_full_payload(doc, direction: str) -> Optional[dict]:
    """
    Строит payload для EDIT_N08_FULL (клиент + N33).
    direction: 'pirkimas' | 'pardavimas'
    """
    if direction == "pirkimas":
        client_code = (
            _s(getattr(doc, "seller_id", ""))
            or _s(getattr(doc, "seller_vat_code", ""))
            or _s(getattr(doc, "seller_id_programoje", ""))
        )
        vat_code = _s(getattr(doc, "seller_vat_code", ""))
        im_code = _s(getattr(doc, "seller_id", ""))
        is_person = bool(getattr(doc, "seller_is_person", False))
        name = _s(getattr(doc, "seller_name", "")) or "Nezinoma"
        address = _s(getattr(doc, "seller_address", ""))
        country = _s(getattr(doc, "seller_country_iso", "")).upper()
        iban = _s(getattr(doc, "seller_iban", ""))
        rusis = "2"  # tiekėjas
        tipas_pirk, tipas_tiek = "0", "1"
    else:
        client_code = (
            _s(getattr(doc, "buyer_id", ""))
            or _s(getattr(doc, "buyer_vat_code", ""))
            or _s(getattr(doc, "buyer_id_programoje", ""))
        )
        vat_code = _s(getattr(doc, "buyer_vat_code", ""))
        im_code = _s(getattr(doc, "buyer_id", ""))
        is_person = bool(getattr(doc, "buyer_is_person", False))
        name = _s(getattr(doc, "buyer_name", "")) or "Nezinoma"
        address = _s(getattr(doc, "buyer_address", ""))
        country = _s(getattr(doc, "buyer_country_iso", "")).upper()
        iban = _s(getattr(doc, "buyer_iban", ""))
        rusis = "1"  # pirkėjas
        tipas_pirk, tipas_tiek = "1", "0"

    if not client_code:
        return None

    currency = (_s(getattr(doc, "currency", "EUR")) or "EUR").upper()
    tipas = "2" if is_person else "1"
    val_poz = "0" if currency == "EUR" else "1"

    n08_data = {
        "N08_KODAS_KS": client_code,
        "N08_RUSIS": rusis,
        "N08_PVM_KODAS": vat_code,
        "N08_IM_KODAS": im_code,
        "N08_PAV": name,
        "N08_ADR": address,
        "N08_TIPAS_PIRK": tipas_pirk,
        "N08_TIPAS_TIEK": tipas_tiek,
        "N08_KODAS_DS": _s(getattr(doc, "kodas_ds", "PT001")) or "PT001",
        "N08_KODAS_XS_T": "PVM",
        "N08_KODAS_XS_P": "PVM",
        "N08_VAL_POZ": val_poz,
        "N08_KODAS_VL_1": currency,
        "N08_BUSENA": "1",
        "N08_TIPAS": tipas,
    }

    # N33 — банковские реквизиты
    n33_list = []
    if iban or country:
        n33_entry = {"N33_NUTYL": "1", "N33_KODAS_KS": client_code}
        if iban:
            n33_entry["N33_S_KODAS"] = iban
        if country:
            n33_entry["N33_SALIES_K"] = country
        n33_list.append(n33_entry)

    if n33_list:
        n08_data["N33"] = n33_list

    return {
        "method": "EDIT_N08_FULL",
        "params": {"oper": "I"},
        "data": {"N08": n08_data},
    }


def build_n17_payload(doc, item=None, direction: str = "pirkimas",
                       user=None, own_company_code=None) -> Optional[dict]:
    """
    Строит payload для EDIT_N17 (товар/услуга).
    """

    if item is not None:
        kodas = _s(getattr(item, "prekes_kodas", "")) or _s(getattr(item, "prekes_barkodas", ""))
        pavadinimas = _s(getattr(item, "prekes_pavadinimas", "")) or _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė"
        unit = _s(getattr(item, "unit", "")) or "VNT"
        tipas_src = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
        kodas_ds = _s(getattr(item, "kodas_ds", "")) or "PR001"
    else:
        kodas = _s(getattr(doc, "prekes_kodas", "")) or _s(getattr(doc, "prekes_barkodas", ""))
        pavadinimas = _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė"
        unit = _s(getattr(doc, "unit", "")) or "VNT"
        tipas_src = getattr(doc, "preke_paslauga", None)
        kodas_ds = _s(getattr(doc, "kodas_ds", "")) or "PR001"

    if not kodas:
        return None

    tipas = normalize_preke_paslauga_tipas(tipas_src)
    if tipas == "3":  # kodas → N25, не N17
        return None

    # Extra fields из user settings
    extras = _get_gama_extras(user, own_company_code) if user else {}
    prefix = f"{direction}_"

    rysio_kodas = extras.get(prefix + "saskaitos_rysio_kodas") or kodas_ds

    n17_data = {
        "N17_KODAS_PS": kodas,
        "N17_TIPAS": tipas,
        "N17_KODAS_US": unit,
        "N17_PAV": pavadinimas,
        "N17_KODAS_DS": rysio_kodas,
    }

    # Tiekėjo kodas (только для pirkimas)
    if direction == "pirkimas":
        seller_code = get_party_code(
            doc, role="seller", id_field="seller_id",
            vat_field="seller_vat_code", id_programoje_field="seller_id_programoje",
        )
        if seller_code:
            n17_data["N17_KODAS_KS"] = seller_code

    # Группа
    if tipas == "1":
        grupe = extras.get(prefix + "prekes_grupe")
        if grupe:
            n17_data["N17_KODAS_GS"] = grupe
        assembly = extras.get(f"prekes_assembly_{direction}")
        if assembly:
            n17_data["N17_ASSEMBLY"] = str(assembly)
    elif tipas == "2":
        grupe = extras.get(prefix + "paslaugos_grupe")
        if grupe:
            n17_data["N17_KODAS_GS"] = grupe
        assembly = extras.get(f"paslaugos_assembly_{direction}")
        if assembly:
            n17_data["N17_ASSEMBLY"] = str(assembly)

    # Объект, логистика
    obj = extras.get(prefix + "objektas")
    if obj:
        n17_data["N17_KODAS_OS"] = obj
    log = extras.get(prefix + "logistika")
    if log:
        n17_data["N17_KODAS_LS_1"] = log

    return {
        "method": "EDIT_N17",
        "params": {"oper": "I"},
        "data": {"N17": n17_data},
    }


def build_n25_payload(doc, item=None, direction: str = "pirkimas",
                       user=None, own_company_code=None) -> Optional[dict]:
    """
    Строит payload для EDIT_N25 (код).
    """

    if item is not None:
        kodas = (
            _s(getattr(item, "prekes_kodas", ""))
            or _s(getattr(item, "prekes_barkodas", ""))
            or _s(getattr(doc, "prekes_kodas", ""))
        )
        pavadinimas = (
            _s(getattr(item, "prekes_pavadinimas", ""))
            or _s(getattr(doc, "prekes_pavadinimas", ""))
            or "Prekė"
        )
        unit = _s(getattr(item, "unit", "")) or "VNT"
    else:
        kodas = _s(getattr(doc, "prekes_kodas", "")) or _s(getattr(doc, "prekes_barkodas", ""))
        pavadinimas = _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė"
        unit = _s(getattr(doc, "unit", "")) or "VNT"

    if not kodas:
        return None

    extras = _get_gama_extras(user, own_company_code) if user else {}
    prefix = f"{direction}_"

    tipas = "1" if direction == "pirkimas" else "2"

    n25_data = {
        "N25_KODAS_BS": kodas,
        "N25_PAV": pavadinimas,
        "N25_TIPAS": tipas,
        "N25_KODAS_SS": extras.get(prefix + "pinigu_saskaitos_kodas") or "5001",
        "N25_KODAS_DS": extras.get(prefix + "saskaitos_rysio_kodas") or "PR001",
        "N25_KODAS_US": unit,
    }

    obj = extras.get(prefix + "objektas")
    if obj:
        n25_data["N25_KODAS_OS"] = obj
    grupe = extras.get(prefix + "kodo_grupe")
    if grupe:
        n25_data["N25_KODAS_GS"] = grupe

    return {
        "method": "EDIT_N25",
        "params": {"oper": "I"},
        "data": {"N25": n25_data},
    }


def build_i06_full_payload(doc, direction: str, user=None, merge_vat: bool = False, own_company_code=None) -> dict:
    """
    Строит payload для EDIT_I06_FULL (документ + строки I07).
    """

    extras = _get_gama_extras(user, own_company_code) if user else {}
    prefix = f"{direction}_"
    frac = get_rivile_fraction(user) if user else 1
    use_frac = (frac != 1)

    currency = (_s(getattr(doc, "currency", "EUR")) or "EUR").upper()
    op_date = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None)

    series = _s(getattr(doc, "document_series", ""))
    number = _s(getattr(doc, "document_number", ""))
    dok_num = build_dok_nr(series, number)

    # Скидка
    if merge_vat:
        discount_pct = compute_global_invoice_discount_pct_for_merge_vat(doc)
    else:
        discount_pct = compute_global_invoice_discount_pct(doc)

    # Контрагент
    if direction == "pirkimas":
        party_code = get_party_code(
            doc, role="seller", id_field="seller_id",
            vat_field="seller_vat_code", id_programoje_field="seller_id_programoje",
        )
        op_tip = "1"
    else:
        party_code = get_party_code(
            doc, role="buyer", id_field="buyer_id",
            vat_field="buyer_vat_code", id_programoje_field="buyer_id_programoje",
        )
        op_tip = "51"

    # ─── Шапка I06 ───
    i06 = {
        "I06_OP_TIP": op_tip,
        "I06_DOK_NR": dok_num,
        "I06_OP_DATA": _format_date(op_date),
        "I06_DOK_DATA": _format_date(getattr(doc, "invoice_date", None)),
        "I06_KODAS_KS": party_code,
    }

    # Валюта
    if currency != "EUR":
        i06["I06_VAL_POZ"] = "1"
        i06["I06_KODAS_VL"] = currency
        rate = get_currency_rate(currency, op_date)
        if rate:
            i06["I06_KURSAS"] = str(rate)
    else:
        i06["I06_VAL_POZ"] = "0"

    # DOK_REG
    i06["I06_DOK_REG"] = dok_num

    # NUORODA (preview_url)
    preview_url = _s(getattr(doc, "preview_url", ""))
    if preview_url:
        i06["NUORODA"] = preview_url

    # Описание
    i06["I06_APRASYMAS1"] = preview_url

    # Extra fields из настроек пользователя
    atsk = extras.get(prefix + "atskaitingas_asmuo")
    if atsk:
        i06["I06_KODAS_SM"] = atsk
    acc = extras.get(prefix + "pinigu_saskaitos_kodas")
    if acc:
        i06["I06_KODAS_SS"] = acc
    log = extras.get(prefix + "logistika")
    if log:
        i06["I06_KODAS_LS_1"] = log

    # i.SAF
    if direction == "pirkimas":
        code_isaf = _pick_isaf_for_purchase(doc)
        if code_isaf == "12":
            i06["I06_ISAF"] = "12"

    # ─── Строки I07 ───
    i07_list = []
    line_items = getattr(doc, "line_items", None)
    has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

    line_map = getattr(doc, "_pvm_line_map", None)

    if has_items:
        for item in line_items.all():
            i07 = _build_i07(
                doc, item, currency, direction, user, extras, prefix,
                frac, use_frac, merge_vat, discount_pct, line_map,
            )
            i07_list.append(i07)
    else:
        i07 = _build_i07_sumiskai(
            doc, currency, direction, user, extras, prefix,
            frac, use_frac, merge_vat, discount_pct,
        )
        i07_list.append(i07)

    i06["I07"] = i07_list

    return {
        "method": "EDIT_I06_FULL",
        "params": {"errorAction": "CONTINUE"},
        "data": {"I06": i06},
    }


def _build_i07(doc, item, currency, direction, user, extras, prefix,
               frac, use_frac, merge_vat, discount_pct, line_map):
    """Строит одну строку I07 из line item."""

    kodas = _s(getattr(item, "prekes_kodas", "")) or _s(getattr(doc, "prekes_kodas", "")) or "PREKE001"
    tipas_src = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
    tipas = normalize_preke_paslauga_tipas(tipas_src)

    i07 = {
        "I07_KODAS": kodas,
        "I07_TIPAS": tipas,
    }

    # Line extras
    ser = (extras.get(prefix + "serija") or "").strip()
    cen = (extras.get(prefix + "centras") or "").strip()
    pad = (extras.get(prefix + "padalinys") or "").strip()
    obj = (extras.get(prefix + "objektas") or "").strip()
    if ser:
        i07["I07_SERIJA"] = ser
    if cen:
        i07["I07_KODAS_OS_C"] = cen
    if pad:
        i07["I07_KODAS_IS"] = pad
    if obj:
        i07["I07_KODAS_OS"] = obj

    # Цены и суммы
    if merge_vat:
        price_wo = _safe_D(getattr(item, "price", 0) or 0)
        vat_line = _safe_D(getattr(item, "vat", 0) or 0)
        qty_dec = _safe_D(getattr(item, "quantity", 1) or 1)
        unit_vat = (vat_line / qty_dec) if qty_dec != 0 else Decimal("0")
        gross_price = (price_wo + unit_vat).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

        price_field = "I07_KAINA_BE" if currency == "EUR" else "I07_VAL_KAINA"
        i07[price_field] = _to_decimal_str(gross_price)

        if discount_pct is None:
            pvm_field = "I07_PVM" if currency == "EUR" else "I07_PVM_VAL"
            suma_field = "I07_SUMA" if currency == "EUR" else "I07_SUMA_VAL"
            i07[pvm_field] = "0"
            gross_subtotal = (gross_price * qty_dec).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            i07[suma_field] = _to_decimal_str(gross_subtotal)
        else:
            i07["I07_NUOLAIDA"] = f"{discount_pct:.2f}"

        i07["I07_MOKESTIS"] = "1"
        i07["I07_MOKESTIS_P"] = "0"
        i07["I07_KODAS_KL"] = ""
    else:
        price_field = "I07_KAINA_BE" if currency == "EUR" else "I07_VAL_KAINA"
        i07[price_field] = _to_decimal_str(getattr(item, "price", 0))

        if discount_pct is None:
            pvm_field = "I07_PVM" if currency == "EUR" else "I07_PVM_VAL"
            suma_field = "I07_SUMA" if currency == "EUR" else "I07_SUMA_VAL"
            i07[pvm_field] = _to_decimal_str(getattr(item, "vat", 0))
            i07[suma_field] = _to_decimal_str(getattr(item, "subtotal", 0))
        else:
            i07["I07_NUOLAIDA"] = f"{discount_pct:.2f}"

        i07["I07_MOKESTIS"] = "1"
        i07["I07_MOKESTIS_P"] = _vat_to_int_str(getattr(item, "vat_percent", None))

        code = _get_pvm_kodas_for_item(doc, item, line_map, default="")
        i07["I07_KODAS_KL"] = code

    # Количество
    qty_raw = getattr(item, "quantity", None) or "1"
    if use_frac:
        i07["I07_KIEKIS"] = _scale_qty(qty_raw, frac)
        i07["I07_FRAKCIJA"] = str(frac)
    else:
        i07["I07_KIEKIS"] = _to_decimal_str(qty_raw, "1")

    return i07


def _build_i07_sumiskai(doc, currency, direction, user, extras, prefix,
                         frac, use_frac, merge_vat, discount_pct):
    """Строит единственную строку I07 для режима sumiskai (без отдельных строк)."""

    kodas = _s(getattr(doc, "prekes_kodas", "")) or ("PREKE001" if direction == "pirkimas" else "PREKE002")
    tipas = normalize_preke_paslauga_tipas(getattr(doc, "preke_paslauga", None))

    i07 = {
        "I07_KODAS": kodas,
        "I07_TIPAS": tipas,
    }

    # Line extras
    ser = (extras.get(prefix + "serija") or "").strip()
    cen = (extras.get(prefix + "centras") or "").strip()
    pad = (extras.get(prefix + "padalinys") or "").strip()
    obj = (extras.get(prefix + "objektas") or "").strip()
    if ser:
        i07["I07_SERIJA"] = ser
    if cen:
        i07["I07_KODAS_OS_C"] = cen
    if pad:
        i07["I07_KODAS_IS"] = pad
    if obj:
        i07["I07_KODAS_OS"] = obj

    if merge_vat:
        amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
        vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
        gross_total = (amount_wo + vat_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        price_field = "I07_KAINA_BE" if currency == "EUR" else "I07_VAL_KAINA"
        i07[price_field] = _to_decimal_str(gross_total)

        if discount_pct is None:
            pvm_field = "I07_PVM" if currency == "EUR" else "I07_PVM_VAL"
            suma_field = "I07_SUMA" if currency == "EUR" else "I07_SUMA_VAL"
            i07[pvm_field] = "0"
            i07[suma_field] = _to_decimal_str(gross_total)
        else:
            i07["I07_NUOLAIDA"] = f"{discount_pct:.2f}"

        i07["I07_MOKESTIS"] = "1"
        i07["I07_MOKESTIS_P"] = "0"
        i07["I07_KODAS_KL"] = ""
    else:
        price_field = "I07_KAINA_BE" if currency == "EUR" else "I07_VAL_KAINA"
        i07[price_field] = _to_decimal_str(getattr(doc, "amount_wo_vat", 0))

        if discount_pct is None:
            pvm_field = "I07_PVM" if currency == "EUR" else "I07_PVM_VAL"
            suma_field = "I07_SUMA" if currency == "EUR" else "I07_SUMA_VAL"
            i07[pvm_field] = _to_decimal_str(getattr(doc, "vat_amount", 0))
            i07[suma_field] = _to_decimal_str(getattr(doc, "amount_wo_vat", 0))
        else:
            i07["I07_NUOLAIDA"] = f"{discount_pct:.2f}"

        i07["I07_MOKESTIS"] = "1"
        i07["I07_MOKESTIS_P"] = _vat_to_int_str(getattr(doc, "vat_percent", None))
        pvm_kodas_doc = _get_pvm_kodas_for_doc(doc, default="")
        i07["I07_KODAS_KL"] = pvm_kodas_doc

    # Количество
    if use_frac:
        i07["I07_KIEKIS"] = _scale_qty(1, frac)
        i07["I07_FRAKCIJA"] = str(frac)
    else:
        i07["I07_KIEKIS"] = "1"

    return i07


# ═══════════════════════════════════════════════════════════
# Главная функция экспорта пачки документов
# ═══════════════════════════════════════════════════════════

def export_documents_to_rivile_api(
    documents: list,
    user,
    api_key_obj,  # RivileGamaAPIKey instance
    own_company_code=None,
) -> RivileExportSession:
    """
    Экспортирует пачку документов в Rivile GAMA через API.

    1. Собираем уникальных контрагентов → EDIT_N08_FULL
    2. Собираем уникальные товары/услуги → EDIT_N17
    3. Собираем уникальные коды → EDIT_N25
    4. Для каждого документа → EDIT_I06_FULL

    Возвращает RivileExportSession с полными результатами.
    """

    session = RivileExportSession(
        session_id=str(uuid.uuid4())[:12],
    )

    api_key = api_key_obj.get_api_key()
    merge_vat = _get_merge_vat(user)

    # ─── Определяем direction для каждого документа ───
    doc_directions = {}
    import time as _time
    _phase_start = _time.time()

    for doc in documents:
        direction = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
        if direction not in ("pirkimas", "pardavimas"):
            if _nz(getattr(doc, "seller_id", None)) or _nz(getattr(doc, "seller_vat_code", None)):
                direction = "pirkimas"
            elif _nz(getattr(doc, "buyer_id", None)) or _nz(getattr(doc, "buyer_vat_code", None)):
                direction = "pardavimas"
            else:
                direction = "pirkimas"
        doc_directions[id(doc)] = direction

    # ════════════════════════════════════
    # ШАГ 1: Контрагенты (EDIT_N08_FULL)
    # ════════════════════════════════════
    n08_seen = set()
    n08_results_map = {}
    for doc in documents:
        direction = doc_directions[id(doc)]
        payload = build_n08_full_payload(doc, direction)
        if not payload:
            continue

        entity_code = payload["data"]["N08"]["N08_KODAS_KS"]
        if entity_code in n08_seen:
            continue
        n08_seen.add(entity_code)

        logger.info("[RIVILE_API] EDIT_N08_FULL entity=%s", entity_code)
        result = _send_request(api_key, payload)
        result.entity_code = entity_code
        session.n08_results.append(result)
        session.total_requests += 1

        # Инфраструктурная ошибка — прерываем
        if result.http_status in INFRA_HTTP_CODES and not result.success:
            session.infra_error = result.error_message
            session.overall_status = "error"
            logger.error("[RIVILE_API] Infra error on N08: %s", result.error_message)
            return session

        _save_ref_log(api_key_obj, user, session.session_id, result)
        n08_results_map[entity_code] = result

    _t1 = _time.time()
    logger.info(
        "[RIVILE_API] Phase N08 done: %d requests, %d unique, %.1fs",
        len(session.n08_results), len(n08_seen), _t1 - _phase_start,
    )

    # ════════════════════════════════════
    # ШАГ 2: Товары/Услуги (EDIT_N17)
    # ════════════════════════════════════
    n17_seen = set()
    for doc in documents:
        direction = doc_directions[id(doc)]
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

        items_to_process = list(line_items.all()) if has_items else [None]
        for item in items_to_process:
            # Определяем tipas
            if item is not None:
                tipas_src = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
            else:
                tipas_src = getattr(doc, "preke_paslauga", None)
            tipas = normalize_preke_paslauga_tipas(tipas_src)

            if tipas in ("1", "2"):  # prekė или paslauga
                payload = build_n17_payload(doc, item, direction, user, own_company_code=own_company_code)
                if not payload:
                    continue
                entity_code = payload["data"]["N17"]["N17_KODAS_PS"]
                if entity_code in n17_seen:
                    continue
                n17_seen.add(entity_code)

                logger.info("[RIVILE_API] EDIT_N17 entity=%s tipas=%s", entity_code, tipas)
                result = _send_request(api_key, payload)
                result.entity_code = entity_code
                session.n17_results.append(result)
                session.total_requests += 1

                if result.http_status in INFRA_HTTP_CODES and not result.success:
                    session.infra_error = result.error_message
                    session.overall_status = "error"
                    return session

                _save_ref_log(api_key_obj, user, session.session_id, result)

    _t2 = _time.time()
    logger.info(
        "[RIVILE_API] Phase N17 done: %d requests, %d unique, %.1fs",
        len(session.n17_results), len(n17_seen), _t2 - _t1,
    )

    # ════════════════════════════════════
    # ШАГ 3: Коды (EDIT_N25)
    # ════════════════════════════════════
    n25_seen = set()
    for doc in documents:
        direction = doc_directions[id(doc)]
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

        items_to_process = list(line_items.all()) if has_items else [None]
        for item in items_to_process:
            if item is not None:
                tipas_src = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
            else:
                tipas_src = getattr(doc, "preke_paslauga", None)
            tipas = normalize_preke_paslauga_tipas(tipas_src)

            if tipas == "3":  # kodas
                payload = build_n25_payload(doc, item, direction, user, own_company_code=own_company_code)
                if not payload:
                    continue
                entity_code = payload["data"]["N25"]["N25_KODAS_BS"]
                if entity_code in n25_seen:
                    continue
                n25_seen.add(entity_code)

                logger.info("[RIVILE_API] EDIT_N25 entity=%s", entity_code)
                result = _send_request(api_key, payload)
                result.entity_code = entity_code
                session.n25_results.append(result)
                session.total_requests += 1

                if result.http_status in INFRA_HTTP_CODES and not result.success:
                    session.infra_error = result.error_message
                    session.overall_status = "error"
                    return session

                _save_ref_log(api_key_obj, user, session.session_id, result)

    _t3 = _time.time()
    logger.info(
        "[RIVILE_API] Phase N25 done: %d requests, %d unique, %.1fs",
        len(session.n25_results), len(n25_seen), _t3 - _t2,
    )

    # ════════════════════════════════════
    # ШАГ 4: Документы (EDIT_I06_FULL)
    # ════════════════════════════════════
    for doc in documents:
        direction = doc_directions[id(doc)]
        doc_id = getattr(doc, "id", None) or getattr(doc, "pk", 0)

        doc_result = RivileDocExportResult(doc_id=doc_id)
        if direction == "pirkimas":
            _party = get_party_code(
                doc, role="seller", id_field="seller_id",
                vat_field="seller_vat_code",
                id_programoje_field="seller_id_programoje",
            )
        else:
            _party = get_party_code(
                doc, role="buyer", id_field="buyer_id",
                vat_field="buyer_vat_code",
                id_programoje_field="buyer_id_programoje",
            )
        doc_result.n08_result = n08_results_map.get(_party)

        payload = build_i06_full_payload(doc, direction, user, merge_vat, own_company_code=own_company_code)
        logger.info("[RIVILE_API] EDIT_I06_FULL doc=%s dir=%s", doc_id, direction)

        result = _send_request(api_key, payload)
        result.entity_code = str(doc_id)
        doc_result.api_result = result
        session.total_requests += 1

        if result.http_status in INFRA_HTTP_CODES and not result.success:
            session.infra_error = result.error_message
            doc_result.overall_status = "error"
            session.i06_results.append(doc_result)
            session.overall_status = "error"
            return session

        # Определяем статус документа
        if result.success and result.http_status == 200:
            doc_result.overall_status = "success"
        elif result.success and result.http_status == 207:
            doc_result.overall_status = "partial_success"
        else:
            doc_result.overall_status = "error"

        session.i06_results.append(doc_result)

    # ─── Overall status сессии ───
    statuses = [r.overall_status for r in session.i06_results]
    if all(s == "success" for s in statuses):
        session.overall_status = "success"
    elif all(s == "error" for s in statuses):
        session.overall_status = "error"
    else:
        session.overall_status = "partial_success"

    _t4 = _time.time()
    _total = _t4 - _phase_start
    logger.info(
        "[RIVILE_API] Session %s DONE: status=%s total=%.1fs "
        "| N08: %d/%.1fs | N17: %d/%.1fs | N25: %d/%.1fs | I06: %d/%.1fs "
        "| requests=%d",
        session.session_id, session.overall_status, _total,
        len(session.n08_results), _t1 - _phase_start,
        len(session.n17_results), _t2 - _t1,
        len(session.n25_results), _t3 - _t2,
        len(session.i06_results), _t4 - _t3,
        session.total_requests,
    )

    return session


# ═══════════════════════════════════════════════════════════
# Сохранение логов
# ═══════════════════════════════════════════════════════════

def _save_ref_log(api_key_obj, user, session_id: str, result: RivileApiResult):
    """Сохраняет результат запроса к справочнику в RivileAPIRefLog."""
    from ..models import RivileAPIRefLog  

    if result.is_duplicate:
        status = "Duplicate"
    elif result.success:
        status = "Success"
    else:
        status = "Error"

    error_code = ""
    error_message = ""
    if result.errors:
        error_code = result.errors[0].get("code", "")
        error_message = "; ".join(
            f"{e.get('tag', '')}: {e.get('message', '')}".strip(": ")
            for e in result.errors
        )
    elif result.error_message:
        error_message = result.error_message

    try:
        RivileAPIRefLog.objects.create(
            api_key=api_key_obj,
            user=user,
            session=session_id,
            method=result.method,
            entity_code=result.entity_code,
            status=status,
            http_status=result.http_status,
            error_code=error_code[:20],
            error_message=error_message[:2000],
            raw_response=result.raw_response[:3000],
        )
    except Exception as e:
        logger.exception("[RIVILE_API] Failed to save ref log: %s", e)


def save_export_results(session: RivileExportSession, user, api_key_obj,
                        export_session=None):
    """
    Сохраняет результаты экспорта документов:
      - APIExportLog (по одному на документ)
      - APIExportArticleLog (N17 + N25 из сессии)
      - ScannedDocument (rivile_api_status, rivile_api_last_try, rivile_api_kodas_po)

    export_session: ExportSession instance (для FK), или None.
    """
    from ..models import APIExportLog, APIExportArticleLog, ScannedDocument

    now = timezone.now()

    for doc_result in session.i06_results:
        inv_result = doc_result.api_result

        # ─── Invoice (I06) статус ───
        if inv_result is None:
            inv_status = "error"
            inv_error = session.infra_error or "No request sent"
            inv_rivile_id = ""
        else:
            inv_status = "success" if inv_result.success else "error"
            inv_error = ""
            if inv_result.errors:
                inv_error = "; ".join(
                    f"{e.get('tag', '')}: {e.get('message', '')}".strip(": ")
                    for e in inv_result.errors
                )
            elif inv_result.error_message and not inv_result.success:
                inv_error = inv_result.error_message
            inv_rivile_id = inv_result.rivile_id or ""

        # ─── Partner (N08) статус ───
        n08_res = doc_result.n08_result
        partner_status = ""
        partner_error = ""
        if n08_res is not None:
            if n08_res.success:
                partner_status = "success"
            else:
                partner_status = "error"
                if n08_res.errors:
                    partner_error = "; ".join(
                        f"{e.get('tag', '')}: {e.get('message', '')}".strip(": ")
                        for e in n08_res.errors
                    )
                elif n08_res.error_message:
                    partner_error = n08_res.error_message

        # ─── APIExportLog ───
        try:
            export_log = APIExportLog.objects.create(
                user=user,
                document_id=doc_result.doc_id,
                program="rivile_gama_api",
                status=doc_result.overall_status,
                invoice_type="EDIT_I06_FULL",
                invoice_status=inv_status,
                invoice_result=None,                      # IntegerField, Rivile ID — строка, не пишем
                invoice_error=inv_error[:2000],
                partner_status=partner_status,
                partner_error=partner_error[:2000],
                session=export_session,                   # ExportSession instance или None
            )

            # ─── Article logs: N17 + N25 ───
            article_logs = []
            for ref_res in session.n17_results + session.n25_results:
                if ref_res.is_duplicate:
                    a_status = "duplicate"         
                elif ref_res.success:
                    a_status = "success"            
                else:
                    a_status = "error"      

                article_logs.append(APIExportArticleLog(
                    export_log=export_log,
                    article_name=ref_res.method,                 # EDIT_N17 / EDIT_N25
                    article_code=ref_res.entity_code[:100],
                    status=a_status,
                    result=None,
                    error=ref_res.error_message[:500] if not ref_res.success else "",
                ))

            if article_logs:
                APIExportArticleLog.objects.bulk_create(article_logs)

        except Exception as e:
            logger.exception(
                "[RIVILE_API] Failed to save export log for doc=%s: %s",
                doc_result.doc_id, e,
            )

        # ─── Обновляем ScannedDocument ───
        update_fields = {
            "rivile_api_status": doc_result.overall_status,
            "rivile_api_last_try": now,
        }
        if inv_rivile_id:
            update_fields["rivile_api_kodas_po"] = inv_rivile_id

        try:
            updated = ScannedDocument.objects.filter(pk=doc_result.doc_id).update(**update_fields)
            if not updated:
                from ..models import Invoice
                Invoice.objects.filter(pk=doc_result.doc_id).update(**update_fields)
        except Exception as e:
            logger.exception(
                "[RIVILE_API] Failed to update ScannedDocument %s: %s",
                doc_result.doc_id, e,
            )