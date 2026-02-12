"""
Dineta.web API — REST/JSON клиент.

Поток на один документ:
  1. Partner  (v1/partner/)       — создание/обновление контрагента
  2. Stock    (v1/stock/) × chunks — товары/услуги (max 50 per request)
  3. setOperation (v1/setOperation/) — операция purchase/sale

Авторизация: Basic Auth (base64 encoded username:password).
URL:  https://<SERVER>.dineta.eu/<CLIENT>/ws/dineta_api/v1/<METHOD>/
"""
from __future__ import annotations

import base64
import json
import logging
import random
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from urllib.parse import urlparse

import requests
from django.utils import timezone

# --- Хелперы из Optimum (общие для работы с ScannedDocument) ---
from docscanner_app.exports.optimum import (
    _s,
    _get_attr,
    _safe_D,
    _to_decimal_str,
    _build_ref_id,
    _detect_document_type,
    _get_party_code,
    _get_product_code,
    _get_barcode,
    _resolve_type_group_product,
    _compute_line_discounts,
    _get_amount_with_vat,
)

logger = logging.getLogger(__name__)


# =========================================================
# Исключения
# =========================================================
class DinetaError(Exception):
    """Ошибка при работе с Dineta API."""
    pass


# =========================================================
# Константы
# =========================================================
STOCK_BATCH_SIZE = 50
REQUEST_TIMEOUT = 30


# =========================================================
# Dataclasses — результаты запросов
# =========================================================
@dataclass
class DinetaRequestResult:
    """Результат одного HTTP запроса к Dineta API."""
    success: bool
    status_code: int = 0
    response_body: str = ""
    error: str = ""
    exception: str = ""


@dataclass
class StockBatchResult:
    """Результат одного stock batch запроса (до 50 items)."""
    request_result: DinetaRequestResult
    items: list = field(default_factory=list)   # [{"code":…, "name":…, "barcode":…}]


@dataclass
class DinetaDocumentResult:
    """Результат экспорта одного документа в Dineta."""
    doc_id: int
    overall_status: str = ""        # success / partial_success / error
    partner_result: Optional[DinetaRequestResult] = None
    stock_batch_results: list = field(default_factory=list)   # list[StockBatchResult]
    operation_result: Optional[DinetaRequestResult] = None
    operation_type: str = ""        # "purchase" / "sale"
    exception: str = ""


# =========================================================
# Единицы измерения — Dineta (capitalize, без точки)
# =========================================================
_CANON_UNITS_DINETA = {
    "Vnt":   {"vnt", "vnt.", "vnt ", "vnt. "},
    "Val":   {"val", "val.", "val ", "val. "},
    "D":     {"d", "d.", "d ", "d. "},
    "Kg":    {"kg", "kg "},
    "Kompl": {"kompl", "kompl.", "komplektas", "komplektas.", "kompl "},
    "L":     {"l", "l "},
    "M":     {"m", "m "},
    "M2":    {"m2", "m²", "m^2"},
    "M3":    {"m3", "m³", "m^3"},
    "T":     {"t", "t "},
}

_UNIT_MAP_DINETA: dict[str, str] = {}
for _canon, _variants in _CANON_UNITS_DINETA.items():
    for _v in _variants:
        _UNIT_MAP_DINETA[_v.strip().lower()] = _canon


def _normalize_unit_dineta(unit: str) -> str:
    u = _s(unit).strip()
    if not u:
        return "Vnt"
    return _UNIT_MAP_DINETA.get(u.lower(), u.capitalize())


# =========================================================
# URL / авторизация
# =========================================================
def parse_dineta_url(url: str) -> tuple[str, str]:
    """
    Парсит URL вида  https://lt4.dineta.eu/dokskenas/login.php
    Возвращает (server, client) → ("lt4", "dokskenas").
    """
    parsed = urlparse(url.strip())
    hostname = parsed.hostname or ""

    # server = поддомен перед .dineta.eu
    host_parts = hostname.split(".")
    if len(host_parts) < 3 or "dineta" not in host_parts:
        raise DinetaError(
            f"Netinkamas Dineta URL: {url}. "
            f"Tikimasi formato: https://XXX.dineta.eu/CLIENT/..."
        )
    server = host_parts[0]

    # client = первый сегмент пути
    path_parts = [p for p in parsed.path.strip("/").split("/") if p]
    if not path_parts:
        raise DinetaError(
            f"Netinkamas Dineta URL: {url}. "
            f"Nepavyko nustatyti kliento iš kelio."
        )
    client = path_parts[0]

    return server, client


def build_api_base_url(server: str, client: str) -> str:
    """https://lt4.dineta.eu/ivesklt/ws/dineta_api/v1"""
    return f"https://{server}.dineta.eu/{client}/ws/dineta_api/v1"


def build_auth_header(username: str, password: str) -> dict:
    """Строит заголовки с Basic Auth."""
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode("utf-8")).decode("ascii")
    return {
        "Authorization": f"Basic {encoded}",
        "Content-Type": "application/json",
    }


# =========================================================
# Dineta extra fields / store id
# =========================================================
def _get_dineta_extra(customuser) -> dict:
    if customuser is None:
        return {}
    d = _get_attr(customuser, "dineta_extra_fields", None)
    return d if isinstance(d, dict) else {}


def _get_store_id(customuser, doc_type: str) -> str:
    extra = _get_dineta_extra(customuser)
    if doc_type == "pirkimas":
        store = _s(extra.get("pirk_sandelio_kodas", ""))
    else:
        store = _s(extra.get("pard_sandelio_kodas", ""))
    return store or "S1"


# =========================================================
# Operation ID  (unique, ≤ 20 символов, без дубликатов)
# =========================================================
def _build_operation_id(doc, used_ids: set) -> str:
    """
    Основа — blankNo (series-number).
    Если > 20 → обрезаем с конца.
    Если дубликат → добавляем _XXX (3 random цифры).
    externalDocId всегда = id.
    """
    ref = _build_ref_id(
        _s(_get_attr(doc, "document_series", "")),
        _s(_get_attr(doc, "document_number", "")),
    )
    if not ref:
        ref = str(_get_attr(doc, "pk", 0) or _get_attr(doc, "id", 0))

    # Обрезаем с конца до 20
    if len(ref) > 20:
        ref = ref[:20]

    if ref not in used_ids:
        used_ids.add(ref)
        return ref

    # Дубликат → добавляем суффикс _XXX (нужно 4 символа)
    max_base = min(len(ref), 16)
    base = ref[:max_base]

    for _ in range(100):
        suffix = f"_{random.randint(100, 999)}"
        candidate = f"{base}{suffix}"
        if len(candidate) <= 20 and candidate not in used_ids:
            used_ids.add(candidate)
            return candidate

    # Крайний fallback
    candidate = f"{base}_{random.randint(100, 999)}"[:20]
    used_ids.add(candidate)
    return candidate


# =========================================================
# HTTP — отправка запроса
# =========================================================
def _send_dineta_request(
    url: str,
    payload: dict,
    headers: dict,
    timeout: int = REQUEST_TIMEOUT,
) -> DinetaRequestResult:
    """POST JSON → Dineta API.  Успех = HTTP 200/201."""
    try:
        resp = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=timeout,
        )
    except requests.exceptions.Timeout:
        return DinetaRequestResult(
            success=False, error="Request timeout", exception="Timeout",
        )
    except requests.exceptions.ConnectionError as e:
        return DinetaRequestResult(
            success=False, error=f"Connection error: {e}", exception=str(e),
        )
    except Exception as e:
        return DinetaRequestResult(
            success=False, error=f"Request failed: {e}", exception=str(e),
        )

    body = resp.text[:2000]

    if resp.status_code in (200, 201):
        return DinetaRequestResult(
            success=True,
            status_code=resp.status_code,
            response_body=body,
        )

    # --- ошибка ---
    error_msg = f"HTTP {resp.status_code}"
    try:
        data = resp.json()
        if isinstance(data, dict):
            error_msg = (
                data.get("error", "")
                or data.get("message", "")
                or data.get("detail", "")
                or error_msg
            )
    except Exception:
        error_msg = body[:500]

    return DinetaRequestResult(
        success=False,
        status_code=resp.status_code,
        response_body=body,
        error=error_msg,
    )


# =========================================================
# Build: Partner payload
# =========================================================
def _build_partner_payload(doc, doc_type: str) -> dict:
    """
    Один partner dict для  {"partners": [ <здесь> ]}.
    Pirkimas → seller,  pardavimas → buyer.
    """
    if doc_type == "pirkimas":
        pid = _get_party_code(
            doc,
            id_field="seller_id",
            vat_field="seller_vat_code",
            id_programoje_field="seller_id_programoje",
        )
        name       = _s(_get_attr(doc, "seller_name", ""))
        vat_code   = _s(_get_attr(doc, "seller_vat_code", ""))
        code       = _s(_get_attr(doc, "seller_id", ""))
        country    = _s(_get_attr(doc, "seller_country_iso", "")) or "LT"
        address    = _s(_get_attr(doc, "seller_address", ""))
        is_person  = bool(_get_attr(doc, "seller_is_person", False))
    else:
        pid = _get_party_code(
            doc,
            id_field="buyer_id",
            vat_field="buyer_vat_code",
            id_programoje_field="buyer_id_programoje",
        )
        name       = _s(_get_attr(doc, "buyer_name", ""))
        vat_code   = _s(_get_attr(doc, "buyer_vat_code", ""))
        code       = _s(_get_attr(doc, "buyer_id", ""))
        country    = _s(_get_attr(doc, "buyer_country_iso", "")) or "LT"
        address    = _s(_get_attr(doc, "buyer_address", ""))
        is_person  = bool(_get_attr(doc, "buyer_is_person", False))

    partner: dict = {
        "id":      pid,
        "name":    name,
        "type":    "1" if is_person else "2",
        "country": country,
    }
    if code:
        partner["code"] = code
    if vat_code:
        partner["vat_code"] = vat_code
    if address:
        partner["address"] = address

    return partner


# =========================================================
# Build: Stock items list
# =========================================================
def _build_stock_items(doc, doc_type: str) -> list[dict]:
    """
    Detaliai → один stock per уникальный prekes_kodas из line_items.
    Sumiškai → один stock из doc-уровня.
    Возвращает list[dict] (каждый — один stock item payload).
    """
    line_items_qs = _get_attr(doc, "line_items", None)
    has_items = bool(
        line_items_qs
        and hasattr(line_items_qs, "all")
        and line_items_qs.exists()
    )

    items: list[dict] = []
    seen_codes: set[str] = set()

    if has_items:
        # ---- DETALIAI ----
        for item in line_items_qs.all():
            code = _get_product_code(item=item, doc=doc)
            if code in seen_codes:
                continue
            seen_codes.add(code)

            barcode = _get_barcode(item=item, doc=doc)
            name = (
                _s(_get_attr(item, "prekes_pavadinimas", ""))
                or _s(_get_attr(doc, "prekes_pavadinimas", ""))
                or "Prekė"
            )
            unit = (
                _s(_get_attr(item, "unit", ""))
                or _s(_get_attr(doc, "unit", ""))
                or "vnt."
            )
            vat_pct = _safe_D(
                _get_attr(item, "vat_percent", None)
                or _get_attr(doc, "vat_percent", 0)
                or 0
            )
            type_str, _, _ = _resolve_type_group_product(item=item, doc=doc)
            stock_type = 2 if type_str == "PASLAUGA" else 1

            stock_item: dict = {
                "id":       code,
                "type":     stock_type,
                "name":     name,
                "unitid":   _normalize_unit_dineta(unit),
                "vat_perc": float(vat_pct),
            }
            if barcode:
                stock_item["barcodes"] = [{"barcode": barcode, "default": 1}]

            items.append(stock_item)
    else:
        # ---- SUMIŠKAI ----
        code    = _get_product_code(item=None, doc=doc)
        barcode = _get_barcode(item=None, doc=doc)
        name    = _s(_get_attr(doc, "prekes_pavadinimas", "")) or "Prekė"
        unit    = _s(_get_attr(doc, "unit", "")) or "vnt."
        vat_pct = _safe_D(_get_attr(doc, "vat_percent", 0) or 0)
        type_str, _, _ = _resolve_type_group_product(item=None, doc=doc)
        stock_type = 2 if type_str == "PASLAUGA" else 1

        stock_item = {
            "id":       code,
            "type":     stock_type,
            "name":     name,
            "unitid":   _normalize_unit_dineta(unit),
            "vat_perc": float(vat_pct),
        }
        if barcode:
            stock_item["barcodes"] = [{"barcode": barcode, "default": 1}]

        items.append(stock_item)

    return items


# =========================================================
# Build: stock_lines для setOperation
# =========================================================
def _build_stock_lines(
    doc,
    doc_type: str,
    line_map: Optional[dict] = None,
) -> list[dict]:
    """
    Detaliai → одна строка per line_item.
    Sumiškai → одна строка из doc-уровня.
    priceDisc всегда 0;  скидка вбита в price.
    """
    line_items_qs = _get_attr(doc, "line_items", None)
    has_items = bool(
        line_items_qs
        and hasattr(line_items_qs, "all")
        and line_items_qs.exists()
    )

    now_ms = int(time.time() * 1000)
    lines: list[dict] = []

    if has_items:
        # ---- DETALIAI ----
        items_list = list(line_items_qs.all())
        line_discounts = _compute_line_discounts(doc, items_list)

        for i, item in enumerate(items_list):
            code    = _get_product_code(item=item, doc=doc)
            barcode = _get_barcode(item=item, doc=doc)
            name = (
                _s(_get_attr(item, "prekes_pavadinimas", ""))
                or _s(_get_attr(doc, "prekes_pavadinimas", ""))
                or "Prekė"
            )
            qty     = _safe_D(_get_attr(item, "quantity", 1) or 1)
            price   = _safe_D(_get_attr(item, "price", 0) or 0)
            vat_pct = _safe_D(_get_attr(item, "vat_percent", 0) or 0)

            # Скидка → пересчёт unit price
            line_discount = line_discounts.get(i, Decimal("0"))
            if line_discount > 0 and qty:
                line_total = (price * qty) - line_discount
                new_price = (line_total / qty).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP,
                )
            else:
                new_price = price

            # vatCode из resolved CP данных
            vat_code = _resolve_vat_code(doc, item, line_map)

            line: dict = {
                "stockId":     code,
                "name":        name,
                "quant":       float(qty),
                "vatPerc":     float(vat_pct),
                "vatCode":     vat_code,
                "price":       float(new_price),
                "priceDisc":   0,
                "dateCreated": now_ms,
            }
            if barcode:
                line["barcode"] = barcode

            lines.append(line)
    else:
        # ---- SUMIŠKAI ----
        code    = _get_product_code(item=None, doc=doc)
        barcode = _get_barcode(item=None, doc=doc)
        name    = _s(_get_attr(doc, "prekes_pavadinimas", "")) or "Prekė"
        qty     = _safe_D(_get_attr(doc, "quantity", 1) or 1)
        amount_wo = _safe_D(_get_attr(doc, "amount_wo_vat", 0) or 0)
        discount  = _safe_D(_get_attr(doc, "invoice_discount_wo_vat", 0) or 0)
        vat_pct   = _safe_D(_get_attr(doc, "vat_percent", 0) or 0)

        net_wo_vat = amount_wo - discount
        new_price = (
            (net_wo_vat / qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if qty else net_wo_vat
        )

        vat_code = _s(_get_attr(doc, "pvm_kodas", ""))
        if not vat_code:
            vat_code = "PVM1"
            logger.warning(
                "[DINETA] doc=%s vatCode tuščias (sumiškai), naudojamas PVM1",
                _get_attr(doc, "pk", "?"),
            )

        line = {
            "stockId":     code,
            "name":        name,
            "quant":       float(qty),
            "vatPerc":     float(vat_pct),
            "vatCode":     vat_code,
            "price":       float(new_price),
            "priceDisc":   0,
            "dateCreated": now_ms,
        }
        if barcode:
            line["barcode"] = barcode

        lines.append(line)

    return lines


def _resolve_vat_code(
    doc,
    item=None,
    line_map: Optional[dict] = None,
) -> str:
    """
    vatCode приоритет:
      1. line_map[item.id]  (из resolved CP данных)
      2. item.pvm_kodas
      3. doc.pvm_kodas
      4. fallback "PVM1"
    """
    if item is not None and line_map:
        item_id = _get_attr(item, "id", None)
        if item_id is not None and item_id in line_map:
            val = _s(line_map.get(item_id, ""))
            if val and val != "Keli skirtingi PVM":
                return val

    if item is not None:
        val = _s(_get_attr(item, "pvm_kodas", ""))
        if val and val != "Keli skirtingi PVM":
            return val

    val = _s(_get_attr(doc, "pvm_kodas", ""))
    if val and val != "Keli skirtingi PVM":
        return val

    logger.warning(
        "[DINETA] doc=%s item=%s vatCode tuščias, naudojamas PVM1",
        _get_attr(doc, "pk", "?"),
        _get_attr(item, "id", "?") if item else "-",
    )
    return "PVM1"


# =========================================================
# Build: setOperation payload
# =========================================================
def _build_set_operation_payload(
    doc,
    doc_type: str,
    partner_id: str,
    store_id: str,
    operation_id: str,
    line_map: Optional[dict] = None,
) -> dict:
    """Полный payload для  v1/setOperation/."""

    op = "purchase" if doc_type == "pirkimas" else "sale"

    # Дата
    inv_date = (
        _get_attr(doc, "invoice_date", None)
        or _get_attr(doc, "operation_date", None)
    )
    if isinstance(inv_date, (date, datetime)):
        date_str = inv_date.strftime("%Y-%m-%d")
    else:
        date_str = _s(inv_date) or datetime.now().strftime("%Y-%m-%d")

    # blankNo (max 20)
    blank_no = _build_ref_id(
        _s(_get_attr(doc, "document_series", "")),
        _s(_get_attr(doc, "document_number", "")),
    )
    if len(blank_no) > 20:
        blank_no = blank_no[:20]

    # Суммы
    total_sum = float(_get_amount_with_vat(doc))
    vat_sum   = float(_safe_D(_get_attr(doc, "vat_amount", 0) or 0))

    # stock_lines
    stock_lines = _build_stock_lines(doc, doc_type, line_map)

    return {
        "id":            operation_id,
        "op":            op,
        "docdate":       date_str,
        "aDate":         date_str,
        "blankNo":       blank_no,
        "partnerId":     partner_id,
        "partnerId2":    partner_id,
        "storeFromId":   store_id,
        "storeToId":     store_id,
        "totalSum":      round(total_sum, 2),
        "vatSum":        round(vat_sum, 2),
        "externalDocId": operation_id,
        "stock_lines":   stock_lines,
    }


# =========================================================
# Экспорт одного документа — полный цикл
# =========================================================
def export_document_to_dineta(
    doc,
    base_url: str,
    headers: dict,
    customuser=None,
    used_ids: Optional[set] = None,
) -> DinetaDocumentResult:
    """
    1. Partner  → v1/partner/
    2. Stock    → v1/stock/   (chunks по 50)
    3. Operation → v1/setOperation/

    Если partner/stock вернули 401/500 → setOperation пропускается,
    overall_status = error.
    """
    if used_ids is None:
        used_ids = set()

    doc_id   = _get_attr(doc, "id", None) or _get_attr(doc, "pk", 0)
    doc_type = _detect_document_type(doc)
    line_map = _get_attr(doc, "_pvm_line_map", None)

    result = DinetaDocumentResult(doc_id=doc_id)
    result.operation_type = "purchase" if doc_type == "pirkimas" else "sale"

    has_fatal_error = False          # 401/500 → прекращаем

    try:
        # ── 1) PARTNER ──────────────────────────────────────
        partner_payload = _build_partner_payload(doc, doc_type)
        partner_id = partner_payload["id"]

        if not partner_id:
            result.partner_result = DinetaRequestResult(
                success=False, error="Partner ID yra tuščias",
            )
            result.overall_status = "error"
            return result

        partner_resp = _send_dineta_request(
            url=f"{base_url}/partner/",
            payload={"partners": [partner_payload]},
            headers=headers,
        )
        result.partner_result = partner_resp

        logger.info(
            "[DINETA] Partner doc=%s partner_id=%s http=%s error=%s",
            doc_id, partner_id, partner_resp.status_code,
            partner_resp.error or "-",
        )

        if partner_resp.status_code in (401, 500):
            has_fatal_error = True

        # ── 2) STOCK (chunks по 50) ─────────────────────────
        stock_items = _build_stock_items(doc, doc_type)

        for chunk_start in range(0, len(stock_items), STOCK_BATCH_SIZE):
            chunk = stock_items[chunk_start : chunk_start + STOCK_BATCH_SIZE]

            stock_resp = _send_dineta_request(
                url=f"{base_url}/stock/",
                payload={"stock": chunk},
                headers=headers,
            )

            batch_items_info = []
            for si in chunk:
                bc = ""
                if si.get("barcodes"):
                    bc = si["barcodes"][0].get("barcode", "")
                batch_items_info.append({
                    "code":    si["id"],
                    "name":    si["name"],
                    "barcode": bc,
                })

            result.stock_batch_results.append(
                StockBatchResult(
                    request_result=stock_resp,
                    items=batch_items_info,
                )
            )

            logger.info(
                "[DINETA] Stock doc=%s items=%d-%d http=%s error=%s",
                doc_id,
                chunk_start,
                chunk_start + len(chunk),
                stock_resp.status_code,
                stock_resp.error or "-",
            )

            if stock_resp.status_code in (401, 500):
                has_fatal_error = True

        # ── 3) SET OPERATION ─────────────────────────────────
        if has_fatal_error:
            result.operation_result = DinetaRequestResult(
                success=False,
                error="Praleista dėl kritinės klaidos partner/stock žingsnyje (401/500)",
            )
        else:
            store_id     = _get_store_id(customuser, doc_type)
            operation_id = _build_operation_id(doc, used_ids)

            op_payload = _build_set_operation_payload(
                doc=doc,
                doc_type=doc_type,
                partner_id=partner_id,
                store_id=store_id,
                operation_id=operation_id,
                line_map=line_map,
            )

            op_resp = _send_dineta_request(
                url=f"{base_url}/setOperation/",
                payload=op_payload,
                headers=headers,
            )
            result.operation_result = op_resp

            logger.info(
                "[DINETA] setOperation doc=%s id=%s http=%s error=%s",
                doc_id, operation_id,
                op_resp.status_code, op_resp.error or "-",
            )

        # ── 4) OVERALL STATUS ────────────────────────────────
        op_ok = bool(
            result.operation_result and result.operation_result.success
        )
        partner_ok = bool(
            result.partner_result and result.partner_result.success
        )
        stock_ok = all(
            br.request_result.success
            for br in result.stock_batch_results
        )

        if op_ok and partner_ok and stock_ok:
            result.overall_status = "success"
        elif op_ok and (not partner_ok or not stock_ok):
            result.overall_status = "partial_success"
        else:
            result.overall_status = "error"

    except Exception as e:
        logger.exception("[DINETA] doc=%s netikėta klaida: %s", doc_id, e)
        result.overall_status = "error"
        result.exception = str(e)

    return result


# =========================================================
# Сохранение результата в БД
# =========================================================
def save_dineta_export_result(
    export_result: DinetaDocumentResult,
    user,
    session=None,
    program: str = "dineta",
) -> None:
    """
    APIExportLog          ← partner + setOperation
    APIExportArticleLog   ← stock items (по одной записи на item)
    ScannedDocument       ← dineta_api_status / dineta_last_try_date
    """
    from docscanner_app.models import (
        APIExportLog,
        APIExportArticleLog,
        ScannedDocument,
    )

    now = timezone.now()

    # ── partner ──
    partner = export_result.partner_result
    partner_status = ""
    partner_error  = ""
    if partner:
        partner_status = "success" if partner.success else "error"
        partner_error  = partner.error

    # ── setOperation ──
    operation = export_result.operation_result
    if operation is None:
        inv_status   = "error"
        inv_error    = export_result.exception or "Operacija neišsiųsta"
        inv_response = ""
    else:
        inv_status   = "success" if operation.success else "error"
        inv_error    = operation.error
        inv_response = operation.response_body

    # ── full_response (partner + operation JSON) ──
    full_resp: dict = {}
    if partner:
        full_resp["partner"] = {
            "status_code": partner.status_code,
            "body":        partner.response_body,
        }
    if operation:
        full_resp["operation"] = {
            "status_code": operation.status_code,
            "body":        operation.response_body,
        }
    full_response_str = json.dumps(
        full_resp, ensure_ascii=False, default=str,
    )[:5000]

    # ── APIExportLog ──
    export_log = APIExportLog.objects.create(
        user=user,
        document_id=export_result.doc_id,
        program=program,
        status=export_result.overall_status,
        invoice_type=f"setOperation:{export_result.operation_type}",
        invoice_status=inv_status,
        invoice_result=None,        # Dineta не возвращает int result
        invoice_error=inv_error,
        partner_status=partner_status,
        partner_error=partner_error,
        full_response=full_response_str,
        session=session,
    )

    # ── APIExportArticleLog (per stock item) ──
    article_logs = []
    for batch in export_result.stock_batch_results:
        batch_status   = "success" if batch.request_result.success else "error"
        batch_error    = batch.request_result.error
        batch_response = batch.request_result.response_body[:2000]

        for item_info in batch.items:
            article_logs.append(
                APIExportArticleLog(
                    export_log=export_log,
                    article_name=item_info.get("name", "")[:255],
                    article_code=item_info.get("code", "")[:100],
                    status=batch_status[:10],
                    result=batch.request_result.status_code,
                    error=batch_error,
                    full_response=batch_response,
                )
            )

    if article_logs:
        APIExportArticleLog.objects.bulk_create(article_logs)

    # ── ScannedDocument status ──
    ScannedDocument.objects.filter(pk=export_result.doc_id).update(
        dineta_api_status=export_result.overall_status,
        dineta_last_try_date=now,
    )

    logger.info(
        "[DINETA] Išsaugotas export_log=%s doc=%s status=%s articles=%d",
        export_log.pk,
        export_result.doc_id,
        export_result.overall_status,
        len(article_logs),
    )


# =========================================================
# Hello — проверка подключения
# =========================================================
def dineta_hello(
    server: str,
    client: str,
    username: str,
    password: str,
) -> str:
    """
    Проверка подключения: отправляем пустой запрос на getStoreList.
    HTTP 200 → OK,  иначе → DinetaError.
    """
    base_url = build_api_base_url(server, client)
    headers  = build_auth_header(username, password)

    result = _send_dineta_request(
        url=f"{base_url}/getStoreList/",
        payload={},
        headers=headers,
    )

    if result.exception:
        raise DinetaError(f"Ryšio klaida: {result.exception}")

    if not result.success:
        raise DinetaError(
            result.error or "Dineta prisijungimo patikrinimas nepavyko"
        )

    return "OK"