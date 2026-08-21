"""
Site.pro (B1) Accounting API — REST/JSON клиент.

Поток на один документ:
  1. Client     clients/create                             — контрагент (blind create + кэш)
  2. Item(s)    reference-book/items/create                — товары/услуги (blind create + кэш)
  3. Header     warehouse/{sales,purchases}/create         — документ
  4. Lines      warehouse/sale-items/create-simple         — строки продажи
                warehouse/purchase-items/create            — строки закупки

Ключ:  header B1-Api-Key: <key>  (хранится в APIProviderKey provider="site_pro_api",
        приходит в модуль параметром api_key — НЕ из extra_fields).
URL :   https://site.pro/My-Accounting/api/<method>   (все методы POST JSON).

Стратегия запросов (важно из-за дневных лимитов Užklausų, 1 API-вызов = 1 Užklausa):
  - clientId/itemId — BLIND create БЕЗ /list, id берётся из ответа и кэшируется на
    прогон (SiteProResolver._client_ids / ._item_ids) → дедуп по пачке: один клиент/
    товар создаётся один раз за экспорт;
  - справочники (warehouse/op-type/currency/unit/vat-class/attribute/group/employee) —
    резолвятся по именам через */list ОДИН раз на прогон и кэшируются (дёшево);
  - purchase-items требует ЦЕЛЫХ (qty×1000, price×10000, vat×100, discount×1000000);
    sale-items/create-simple — обычные десятичные.

Один SiteProResolver на весь прогон (кэш справочников + code→id клиентов/товаров).
Маппинг значений переиспользуется из файлового экспортёра (docscanner_app.exports.site_pro).
"""
from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import requests
from django.utils import timezone

# --- Хелперы маппинга из файлового Site.pro экспортёра (единый источник правды) ---
from docscanner_app.exports.site_pro import (
    _s,
    _doc_type,
    _safe_D,
    _quantize_2,
    _get_seller_fields,
    _get_buyer_fields,
    _get_item_identity,
    _attribute_name_from_preke_paslauga,
    _get_operation_type_name,
    _get_measure_unit,
    _get_currency,
    _get_doc_number,
    _get_doc_date,
    _get_doc_series_optional,
    _get_doc_series_for_sales,
    _normalize_number_remove_series_prefix,
    _calc_discounted_price_map,
    _get_vat_classifier,
    _parse_cp_key,
    _get_own_company_code_from_doc,
    _get_group_name,
    _get_warehouse_name,
    _get_employee_name,
    _get_purchase_employee_name,
    _location_from_country_iso,
)
from docscanner_app.utils.extra_fields import get_extra_for_export

logger = logging.getLogger("docscanner_app")

# Программа extra-полей для API-версии Site.pro (sandelis/grupe/darbuotojas/...).
# ВНИМАНИЕ: сам API-ключ здесь НЕ лежит — он в APIProviderKey (provider="site_pro_api")
# и приходит в модуль параметром api_key.
SITE_PRO_API_PROGRAM = "site_pro_api"


def _get_extra(user, doc, own_company_code=None) -> dict:
    """
    Extra-поля (sandelis/grupe/darbuotojas/kastu_centras) для документа.
    Приоритет: запрошенный own_company_code -> код своей фирмы из дока -> __all__.
    """
    if not user:
        return {}
    requested = _parse_cp_key(own_company_code)
    doc_code = _get_own_company_code_from_doc(doc)

    extra = {}
    if requested:
        extra = get_extra_for_export(user, SITE_PRO_API_PROGRAM, requested)
    if not extra and doc_code and doc_code != requested:
        extra = get_extra_for_export(user, SITE_PRO_API_PROGRAM, doc_code)
    if not extra:
        extra = get_extra_for_export(user, SITE_PRO_API_PROGRAM, None)
    return extra or {}


# =========================================================
# Исключения / константы
# =========================================================
class SiteProError(Exception):
    """Ошибка при работе с Site.pro (B1) API."""
    pass


API_BASE = "https://site.pro/My-Accounting/api"
REQUEST_TIMEOUT = 30
LIST_ROWS = 500  # справочники обычно небольшие — тянем одной страницей

_RETRYABLE_STATUS_CODES = {500, 502, 503, 504}

_USER_FRIENDLY_ERRORS = {
    401: "Autorizacijos klaida. Pasitikrinkite Site.pro API raktą DokSkeno nustatymuose.",
    403: "Autorizacijos klaida. Pasitikrinkite Site.pro API raktą DokSkeno nustatymuose.",
    404: "Netinkamas Site.pro API adresas arba metodas.",
    405: "Operacija Site.pro sistemoje pakeisti/ištrinti negalima.",
}

# location: LT -> 1, EU -> 2, kita -> 3
_LOCATION_ID = {"lt": 1, "eu": 2, "rest": 3}


# =========================================================
# Dataclasses — результаты
# =========================================================
@dataclass
class SiteProRequestResult:
    success: bool
    status_code: int = 0
    response_body: str = ""
    error: str = ""
    exception: str = ""
    api_message: str = ""     # parsed id / message


@dataclass
class SiteProItemResult:
    name: str = ""
    code: str = ""
    barcode: str = ""
    item_id: Optional[int] = None
    line_result: Optional[SiteProRequestResult] = None
    message: str = ""


@dataclass
class SiteProDocumentResult:
    doc_id: int
    overall_status: str = ""          # success / partial_success / error
    operation_type: str = ""          # "sale" / "purchase"
    client_result: Optional[SiteProRequestResult] = None
    header_result: Optional[SiteProRequestResult] = None
    item_results: list = field(default_factory=list)   # list[SiteProItemResult]
    remote_ids: dict = field(default_factory=dict)      # {"client":..,"header":..}
    exception: str = ""


# =========================================================
# Авторизация
# =========================================================
def build_auth_headers(api_key: str) -> dict:
    return {
        "B1-Api-Key": _s(api_key),
        "Content-Type": "application/json",
    }


# =========================================================
# HTTP слой (retry + user-friendly ошибки) — как в dineta.py
# =========================================================
def _check_inner_json_error(body: str) -> str:
    """Site.pro иногда отдаёт HTTP 200 с {"status":400,"message":"..."} в теле."""
    if not body or not body.strip():
        return ""
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        return ""
    if not isinstance(data, dict):
        return ""
    status = data.get("status")
    if isinstance(status, int) and status >= 400:
        return _s(data.get("message", ""))[:500] or f"Site.pro klaida (status {status})"
    return ""


def _send_request_once(url: str, payload, headers: dict,
                       timeout: int = REQUEST_TIMEOUT) -> SiteProRequestResult:
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
    except requests.exceptions.Timeout:
        return SiteProRequestResult(success=False, error="Request timeout", exception="Timeout")
    except requests.exceptions.ConnectionError as e:
        return SiteProRequestResult(success=False, error=f"Connection error: {e}", exception=str(e))
    except Exception as e:
        return SiteProRequestResult(success=False, error=f"Request failed: {e}", exception=str(e))

    body = resp.text[:4000]

    if resp.status_code in (200, 201):
        inner = _check_inner_json_error(body)
        if inner:
            logger.warning("[SITE_PRO] HTTP %s но внутренняя ошибка: %s url=%s",
                           resp.status_code, inner, url)
            return SiteProRequestResult(success=False, status_code=resp.status_code,
                                        response_body=body, error=inner)
        return SiteProRequestResult(success=True, status_code=resp.status_code, response_body=body)

    return SiteProRequestResult(success=False, status_code=resp.status_code,
                                response_body=body, error=_build_error_message(resp, body))


def _send_request(url: str, payload, headers: dict,
                  timeout: int = REQUEST_TIMEOUT, max_retries: int = 3) -> SiteProRequestResult:
    last = None
    for attempt in range(max_retries):
        if attempt > 0:
            delay = 2 ** attempt + random.uniform(0, 1)
            logger.info("[SITE_PRO] retry #%d/%d after %.1fs url=%s", attempt, max_retries, delay, url)
            time.sleep(delay)

        last = _send_request_once(url, payload, headers, timeout)

        if last.status_code in _RETRYABLE_STATUS_CODES:
            continue
        if last.exception and ("Timeout" in last.exception or "Connection" in last.exception):
            continue
        break

    if not last.success:
        original = last.error
        if last.status_code in _USER_FRIENDLY_ERRORS:
            last.error = _USER_FRIENDLY_ERRORS[last.status_code]
        elif last.status_code in _RETRYABLE_STATUS_CODES:
            last.error = "Site.pro serveris neatsako. Pabandykite vėliau."
        elif last.exception and ("Timeout" in last.exception or "Connection" in last.exception):
            last.error = "Site.pro serveris neatsako. Pabandykite vėliau."
        if original != last.error:
            logger.info("[SITE_PRO] user_error='%s' raw='%s' http=%s url=%s",
                        last.error, original, last.status_code, url)
    return last


def _build_error_message(resp, body: str) -> str:
    if resp.status_code == 401:
        return "Neteisingas Site.pro API raktas (401)"
    if resp.status_code == 404:
        return "Netinkamas Site.pro API adresas (404)"
    try:
        data = resp.json()
        if isinstance(data, dict):
            return (data.get("message", "") or data.get("error", "")
                    or data.get("detail", "") or f"HTTP {resp.status_code}")
    except Exception:
        pass
    return body[:500] if body else f"HTTP {resp.status_code}"


# =========================================================
# Парсинг ответов
# =========================================================
def _parse_rows(body: str) -> list:
    """Ответ */list: {"page":..,"records":..,"data":[...]}."""
    try:
        d = json.loads(body)
    except Exception:
        return []
    if isinstance(d, dict):
        dat = d.get("data")
        if isinstance(dat, list):
            return dat
    if isinstance(d, list):
        return d
    return []


_ID_KEYS = ("id", "clientId", "itemId", "saleId", "purchaseId", "recordId")


def _parse_created_id(body: str) -> Optional[int]:
    """
    Ответ create. Форма в доке не зафиксирована — парсим защитно:
    data как int / "123" / {"id":..}, либо id на верхнем уровне.
    (ПРОВЕРЬ на первом живом вызове по логам и, если нужно, сузь.)
    """
    try:
        d = json.loads(body)
    except Exception:
        return None
    if isinstance(d, int):
        return d
    if isinstance(d, str) and d.strip().isdigit():
        return int(d.strip())
    if isinstance(d, dict):
        dat = d.get("data", None)
        if isinstance(dat, int):
            return dat
        if isinstance(dat, str) and dat.strip().isdigit():
            return int(dat.strip())
        if isinstance(dat, dict):
            for k in _ID_KEYS:
                if dat.get(k) is not None:
                    try:
                        return int(dat[k])
                    except (TypeError, ValueError):
                        pass
        for k in _ID_KEYS:
            if d.get(k) is not None:
                try:
                    return int(d[k])
                except (TypeError, ValueError):
                    pass
    return None


def _truthy(v) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    return _s(v).lower() in ("1", "true", "t", "yes", "y")


# =========================================================
# Фильтр для */list (jqGrid стиль)
# =========================================================
def _flt(field_name: str, data, op: str = "eq") -> dict:
    return {"groupOp": "AND", "rules": [{"field": field_name, "op": op, "data": _s(data)}]}


# =========================================================
# Масштабирование (только purchase-items требует целых)
# =========================================================
def _scale_int(x, factor: int) -> int:
    return int((_safe_D(x) * factor).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _price_with_vat(price_wo_vat, vat_pct) -> Decimal:
    p = _safe_D(price_wo_vat)
    v = _safe_D(vat_pct)
    return _quantize_2(p * (Decimal("1") + v / Decimal("100")))


# =========================================================
# Резолвер справочников + find-or-create (кэш на прогон)
# =========================================================
class SiteProResolver:
    """
    Тянет справочники через */list и кэширует, резолвит имена → ID.
    Один инстанс на прогон экспорта (переиспользуется между документами).
    """

    def __init__(self, headers: dict, base_url: str = API_BASE):
        self.headers = headers
        self.base_url = base_url.rstrip("/")
        self._cache: dict = {}          # справочники (list-эндпоинты)
        self._client_ids: dict = {}     # code/vat/name -> clientId (дедуп по прогону)
        self._item_ids: dict = {}       # code/barcode -> itemId (дедуп по прогону)

    # ---- низкоуровневый list ----
    def _list(self, endpoint: str, filters: Optional[dict] = None, rows: int = LIST_ROWS) -> list:
        payload = {"rows": rows, "page": 1, "sidx": "", "sord": "asc"}
        if filters:
            payload["filters"] = filters
        res = _send_request(f"{self.base_url}/{endpoint}", payload, self.headers)
        if not res.success:
            logger.warning("[SITE_PRO] list %s klaida: %s", endpoint, res.error)
            return []
        return _parse_rows(res.response_body)

    def _create(self, endpoint: str, payload: dict) -> SiteProRequestResult:
        res = _send_request(f"{self.base_url}/{endpoint}", payload, self.headers)
        res.api_message = _s(_parse_created_id(res.response_body) or "")
        return res

    def _cached(self, key: str, endpoint: str) -> list:
        if key not in self._cache:
            self._cache[key] = self._list(endpoint)
        return self._cache[key]

    @staticmethod
    def _by_name(rows: list, name: str, field_name: str = "name"):
        n = _s(name).lower()
        if not n:
            return None
        for r in rows:
            if _s(r.get(field_name)).lower() == n:
                return r
        return None

    # ---- справочники ----
    def operation_type_id(self, is_purchase: bool, name: Optional[str] = None) -> Optional[int]:
        rows = self._cached("op_types", "reference-book/operation-types/list")
        flag = "isPurchase" if is_purchase else "isSale"
        ret_flag = "isPurchaseReturn" if is_purchase else "isSaleReturn"
        cands = [
            o for o in rows
            if _truthy(o.get(flag)) and not _truthy(o.get(ret_flag))
            and _truthy(o.get("isActive", True))
            and not _truthy(o.get("isWriteOff")) and not _truthy(o.get("isInternalMove"))
        ]
        if name:
            hit = self._by_name(cands, name)
            if hit:
                return hit.get("id")
        cands.sort(key=lambda o: (o.get("priority") if o.get("priority") is not None else 9999))
        return cands[0].get("id") if cands else None

    def warehouse_id(self, name: Optional[str] = None) -> Optional[int]:
        rows = self._cached("warehouses", "reference-book/warehouses/list")
        if name:
            hit = self._by_name(rows, name)
            if hit:
                return hit.get("id")
        for r in rows:
            if _truthy(r.get("isPrimary")):
                return r.get("id")
        return rows[0].get("id") if rows else None

    def measurement_unit_id(self, unit: str) -> Optional[int]:
        rows = self._cached("units", "reference-book/measurement-units/list")
        u = _s(unit).rstrip(".").lower()
        for fld in ("code", "codeName", "name"):
            for r in rows:
                if _s(r.get(fld)).rstrip(".").lower() == u:
                    return r.get("id")
        # fallback: vnt
        for r in rows:
            if _s(r.get("code")).rstrip(".").lower() == "vnt":
                return r.get("id")
        return rows[0].get("id") if rows else None

    def vat_classification_id(self, code: str) -> Optional[int]:
        code = _s(code)
        if not code:
            return None
        rows = self._cached("vat_class", "reference-book/vat-classifications/list")
        for r in rows:
            if _s(r.get("code")).lower() == code.lower():
                return r.get("id")
        return None

    def currency_id(self, code: str = "EUR") -> Optional[int]:
        code = _s(code) or "EUR"
        rows = self._cached("currencies", "reference-book/currencies/list")
        # ВНИМАНИЕ: в доке поля currency перепутаны (name<->code) → матчим по обоим
        for r in rows:
            if code.lower() in (_s(r.get("name")).lower(), _s(r.get("code")).lower()):
                return r.get("id")
        for r in rows:
            if _truthy(r.get("isPrimary")):
                return r.get("id")
        return rows[0].get("id") if rows else None

    def item_attribute_id(self, name: str) -> Optional[int]:
        rows = self._cached("attrs", "reference-book/item-attributes/list")
        hit = self._by_name(rows, name)
        if hit:
            return hit.get("id")
        return rows[0].get("id") if rows else None

    def item_group_id(self, name: Optional[str]) -> Optional[int]:
        if not _s(name):
            return None
        rows = self._cached("groups", "reference-book/item-groups/list")
        hit = self._by_name(rows, name)
        return hit.get("id") if hit else None

    def employee_id(self, name: Optional[str] = None) -> Optional[int]:
        rows = self._cached("employees", "personnel/employees/list")
        active = [r for r in rows if _truthy(r.get("isEmployed", True))] or rows
        if name:
            n = _s(name).lower()
            for r in active:
                full = f"{_s(r.get('name'))} {_s(r.get('lastName'))}".strip().lower()
                if full == n or _s(r.get("name")).lower() == n:
                    return r.get("id")
        return active[0].get("id") if active else None

    # ---- clients / items: blind create + кэш на прогон (БЕЗ /list) ----
    # Дедуп по пачке: один и тот же клиент/товар создаётся один раз за прогон,
    # его id переиспользуется. /list не шлём (решение: см. лимиты Užklausų).
    # Повторный экспорт между разными прогонами упрётся в поведение API на
    # дубль create — это тестируем на живом ключе.
    def find_or_create_client(self, doc, doc_type: str) -> tuple[Optional[int], Optional[SiteProRequestResult]]:
        p = _get_seller_fields(doc) if doc_type == "pirkimas" else _get_buyer_fields(doc)
        name = _s(p["name"])
        code = _s(p["code"])
        vat = _s(p["vat"])

        cache_key = code or vat or name.lower()
        if cache_key and cache_key in self._client_ids:
            return self._client_ids[cache_key], None

        if not name:
            return None, SiteProRequestResult(success=False, error="Kliento pavadinimas tuščias")

        location = _location_from_country_iso(p["country"])  # "lt"/"eu"/"rest"
        payload = {
            "name": name[:200],
            "isActive": True,
            "isJuridical": not bool(p["is_person"]),
            "locationId": _LOCATION_ID.get(location, 3),
            "isSupplier": (doc_type == "pirkimas"),
        }
        if code:
            payload["code"] = code[:20]
        if vat:
            payload["vatCode"] = vat[:30]

        res = self._create("clients/create", payload)
        cid = _parse_created_id(res.response_body)
        if cid and cache_key:
            self._client_ids[cache_key] = cid
        return cid, res

    def find_or_create_item(self, doc, it, group_id: Optional[int],
                            vat_rate=None) -> tuple[Optional[int], Optional[SiteProRequestResult]]:
        name, code, barcode = _get_item_identity(doc, it)
        name = _s(name)
        code = _s(code)
        barcode = _s(barcode)

        cache_key = code or barcode or name.lower()
        if cache_key and cache_key in self._item_ids:
            return self._item_ids[cache_key], None

        if not name:
            name = "Preke"

        attr_name = _attribute_name_from_preke_paslauga(
            (it and getattr(it, "preke_paslauga", None)) or getattr(doc, "preke_paslauga", None)
        )
        attr_id = self.item_attribute_id(attr_name)
        unit_id = self.measurement_unit_id(_get_measure_unit(it) if it is not None else "vnt.")

        payload = {
            "name": name[:200],
            "attributeId": attr_id,
            "measurementUnitId": unit_id,
            "isActive": True,
        }
        if code:
            payload["code"] = code[:60]
        if barcode:
            payload["barcode"] = barcode[:60]
        if group_id:
            payload["groupId"] = group_id
        if vat_rate is not None and _s(vat_rate) != "":
            payload["vatRate"] = float(_safe_D(vat_rate))

        res = self._create("reference-book/items/create", payload)
        iid = _parse_created_id(res.response_body)
        if iid and cache_key:
            self._item_ids[cache_key] = iid
        return iid, res


# =========================================================
# Построение header + line payloads
# =========================================================
def _iter_line_items(doc):
    li = getattr(doc, "line_items", None)
    if li and hasattr(li, "all") and li.exists():
        return list(li.all())
    return []


def _build_sale_header(doc, client_id, warehouse_id, op_type_id, employee_id) -> dict:
    series = _get_doc_series_for_sales(doc)
    number = _normalize_number_remove_series_prefix(series, _get_doc_number(doc))
    header = {
        "saleDate": _get_doc_date(doc),
        "autoGenerateNumberAndSeries": False,
        "series": series[:10],
        "number": number[:20],
        "warehouseId": warehouse_id,
        "clientId": client_id,
        "operationTypeId": op_type_id,
        "employeeId": employee_id,
    }
    return header


def _build_sale_line_simple(sale_id, item_id, qty, price_wo_vat, vat_pct,
                            vat_class_id, warehouse_id, row_no) -> dict:
    line = {
        "saleId": sale_id,
        "itemId": item_id,
        "quantity": float(_safe_D(qty)),
        "priceWithoutVat": float(_quantize_2(_safe_D(price_wo_vat))),
        "warehouseId": warehouse_id,
        "rowNo": row_no,
        "discountRate": 0,
    }
    if vat_pct is not None and _s(vat_pct) != "":
        line["vatRate"] = float(_safe_D(vat_pct))
    if vat_class_id:
        line["vatClassificationId"] = vat_class_id
    return line


def _build_purchase_header(doc, supplier_id, warehouse_id, op_type_id,
                           currency_id, employee_id) -> dict:
    series = _get_doc_series_optional(doc)
    number = _normalize_number_remove_series_prefix(series, _get_doc_number(doc))
    header = {
        "warehouseId": warehouse_id,
        "operationTypeId": op_type_id,
        "supplierId": supplier_id,
        "purchaseDate": _get_doc_date(doc),
        "number": number[:50],
        "currencyId": currency_id,
        "employeeId": employee_id,
    }
    if series:
        header["series"] = series
    return header


def _build_purchase_line(purchase_id, position, warehouse_id, item_id,
                         qty, price_wo_vat, vat_pct, vat_class_id) -> dict:
    price_wo = _quantize_2(_safe_D(price_wo_vat))
    price_w = _price_with_vat(price_wo, vat_pct)
    line = {
        "purchaseId": purchase_id,
        "position": position,
        "warehouseId": warehouse_id,
        "itemId": item_id,
        "quantity": _scale_int(qty, 1000),                       # ×1000
        "vatRate": _scale_int(vat_pct, 100),                     # ×100
        "priceWithoutVat": _scale_int(price_wo, 10000),          # ×10000
        "priceWithVat": _scale_int(price_w, 10000),              # ×10000
        "priceWithoutVatWithDiscount": _scale_int(price_wo, 10000),  # скидка уже в цене
        "discountRate": 0,                                       # ×1000
        "discount": 0,                                           # ×1000000
        "discountSum": 0,                                        # ×10000
    }
    if vat_class_id:
        line["vatClassificationId"] = vat_class_id
    return line


# =========================================================
# Экспорт одного документа — полный цикл
# =========================================================
def export_document_to_site_pro(
    doc,
    api_key: str,
    user=None,
    own_company_code=None,
    resolver: Optional[SiteProResolver] = None,
) -> SiteProDocumentResult:
    """
    1) client find-or-create
    2) резолв справочников (warehouse, operationType, currency, employee, group)
    3) для каждой строки item find-or-create
    4) header create
    5) lines create
    """
    doc_id = getattr(doc, "id", None) or getattr(doc, "pk", 0)
    doc_type = _doc_type(doc)  # "pirkimas" / "pardavimas"
    is_purchase = (doc_type == "pirkimas")

    result = SiteProDocumentResult(doc_id=doc_id)
    result.operation_type = "purchase" if is_purchase else "sale"

    headers = build_auth_headers(api_key)
    if resolver is None:
        resolver = SiteProResolver(headers)

    try:
        extra = _get_extra(user, doc, own_company_code)

        # ── 1) CLIENT ───────────────────────────────────────
        client_id, client_res = resolver.find_or_create_client(doc, doc_type)
        result.client_result = client_res
        if not client_id:
            result.overall_status = "error"
            if client_res is None:
                result.client_result = SiteProRequestResult(success=False, error="Nepavyko sukurti/rasti kliento")
            return result
        result.remote_ids["client"] = client_id

        # ── 2) РЕЗОЛВ СПРАВОЧНИКОВ ───────────────────────────
        warehouse_id = resolver.warehouse_id(_get_warehouse_name(extra, doc_type))
        doc_attr = _attribute_name_from_preke_paslauga(getattr(doc, "preke_paslauga", None))
        op_type_name = _get_operation_type_name(doc_type, doc_attr)
        op_type_id = resolver.operation_type_id(is_purchase, op_type_name)
        group_id = resolver.item_group_id(_get_group_name(extra, doc_type))
        emp_name = _get_purchase_employee_name(extra) if is_purchase else _get_employee_name(extra)
        employee_id = resolver.employee_id(emp_name)
        currency_id = resolver.currency_id(_get_currency(doc)) if is_purchase else None

        missing = [n for n, v in (("warehouse", warehouse_id), ("operationType", op_type_id),
                                  ("employee", employee_id)) if not v]
        if is_purchase and not currency_id:
            missing.append("currency")
        if missing:
            result.overall_status = "error"
            result.header_result = SiteProRequestResult(
                success=False,
                error="Nepavyko nustatyti Site.pro reikšmių: " + ", ".join(missing),
            )
            return result

        # ── 3) ITEMS (find-or-create) ────────────────────────
        line_items = _iter_line_items(doc)
        price_map = _calc_discounted_price_map(doc, line_items) if line_items else {}

        prepared = []  # (item_id, qty, price_wo_vat, vat_pct, vat_class_id)
        if line_items:
            for it in line_items:
                vat_pct = getattr(it, "vat_percent", None)
                item_id, item_res = resolver.find_or_create_item(doc, it, group_id, vat_rate=vat_pct)
                name, code, barcode = _get_item_identity(doc, it)
                ir = SiteProItemResult(name=_s(name), code=_s(code), barcode=_s(barcode),
                                       item_id=item_id, line_result=item_res)
                result.item_results.append(ir)
                if not item_id:
                    ir.message = "no item id"
                    continue
                qty = _safe_D(getattr(it, "quantity", 1) or 1)
                price = _safe_D(price_map.get(id(it), getattr(it, "price", 0) or 0)) if price_map \
                    else _safe_D(getattr(it, "price", 0) or 0)
                vat_class_id = resolver.vat_classification_id(_get_vat_classifier(doc, it))
                prepared.append((ir, item_id, qty, price, vat_pct, vat_class_id))
        else:
            # sumiskai — одна строка из doc-уровня
            item_id, item_res = resolver.find_or_create_item(doc, None, group_id,
                                                             vat_rate=getattr(doc, "vat_percent", None))
            name, code, barcode = _get_item_identity(doc, None)
            ir = SiteProItemResult(name=_s(name) or "Preke", code=_s(code), barcode=_s(barcode),
                                   item_id=item_id, line_result=item_res)
            result.item_results.append(ir)
            if item_id:
                amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
                discount = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
                if discount > 0:
                    amount_wo = amount_wo - discount
                    if amount_wo < 0:
                        amount_wo = Decimal("0")
                vat_class_id = resolver.vat_classification_id(_get_vat_classifier(doc, None))
                prepared.append((ir, item_id, Decimal("1"), _quantize_2(amount_wo),
                                 getattr(doc, "vat_percent", None), vat_class_id))

        if not prepared:
            result.overall_status = "error"
            result.header_result = SiteProRequestResult(success=False, error="Nėra prekių eilučių")
            return result

        # ── 4) HEADER ────────────────────────────────────────
        if is_purchase:
            header_payload = _build_purchase_header(doc, client_id, warehouse_id,
                                                    op_type_id, currency_id, employee_id)
            header_endpoint = "warehouse/purchases/create"
        else:
            header_payload = _build_sale_header(doc, client_id, warehouse_id, op_type_id, employee_id)
            header_endpoint = "warehouse/sales/create"

        header_res = _send_request(f"{API_BASE}/{header_endpoint}", header_payload, headers)
        header_id = _parse_created_id(header_res.response_body)
        header_res.api_message = _s(header_id or "")
        result.header_result = header_res

        logger.info("[SITE_PRO] Header doc=%s type=%s http=%s id=%s error=%s",
                    doc_id, result.operation_type, header_res.status_code,
                    header_id or "-", header_res.error or "-")

        if not header_id:
            result.overall_status = "error"
            return result
        result.remote_ids["header"] = header_id

        # ── 5) LINES ─────────────────────────────────────────
        for pos, (ir, item_id, qty, price, vat_pct, vat_class_id) in enumerate(prepared, start=1):
            if is_purchase:
                line_payload = _build_purchase_line(header_id, pos, warehouse_id, item_id,
                                                    qty, price, vat_pct, vat_class_id)
                line_endpoint = "warehouse/purchase-items/create"
            else:
                line_payload = _build_sale_line_simple(header_id, item_id, qty, price, vat_pct,
                                                       vat_class_id, warehouse_id, pos)
                line_endpoint = "warehouse/sale-items/create-simple"

            line_res = _send_request(f"{API_BASE}/{line_endpoint}", line_payload, headers)
            ir.line_result = line_res
            ir.message = "OK" if line_res.success else (line_res.error or "error")
            logger.info("[SITE_PRO] Line doc=%s pos=%d item=%s http=%s error=%s",
                        doc_id, pos, item_id, line_res.status_code, line_res.error or "-")

        # ── OVERALL STATUS ───────────────────────────────────
        header_ok = bool(result.header_result and result.header_result.success)
        lines = [ir.line_result for ir in result.item_results if ir.line_result is not None]
        lines_ok = bool(lines) and all(lr.success for lr in lines)

        if header_ok and lines_ok:
            result.overall_status = "success"
        elif header_ok and any(lr.success for lr in lines):
            result.overall_status = "partial_success"
        else:
            result.overall_status = "error"

    except Exception as e:
        logger.exception("[SITE_PRO] doc=%s netikėta klaida: %s", doc_id, e)
        result.overall_status = "error"
        result.exception = str(e)

    return result


# =========================================================
# Экспорт пачки документов (общий resolver = меньше запросов)
# =========================================================
def export_documents_to_site_pro(documents: list, api_key: str,
                                 user=None, own_company_code=None) -> list:
    if not documents:
        raise ValueError("No documents provided for export")
    resolver = SiteProResolver(build_auth_headers(api_key))
    results = []
    for doc in documents:
        results.append(export_document_to_site_pro(
            doc, api_key, user=user, own_company_code=own_company_code, resolver=resolver,
        ))
    return results


# =========================================================
# Сохранение результата в БД (как в dineta.py)
# =========================================================
def save_site_pro_export_result(export_result: SiteProDocumentResult, user,
                                session=None, program: str = "site_pro") -> None:
    from docscanner_app.models import (
        APIExportLog,
        APIExportArticleLog,
        ScannedDocument,
    )

    now = timezone.now()

    client = export_result.client_result
    partner_status = "success" if (client and client.success) else "error"
    partner_error = client.error if client else ""

    header = export_result.header_result
    if header is None:
        inv_status = "error"
        inv_error = export_result.exception or "Dokumentas neišsiųstas"
        inv_response = ""
        header_id = ""
    else:
        inv_status = "success" if header.success else "error"
        inv_error = header.error
        inv_response = header.response_body
        header_id = header.api_message

    full_resp = {
        "client": {
            "status_code": client.status_code if client else 0,
            "body": client.response_body if client else "",
            "id": export_result.remote_ids.get("client"),
        } if client else {},
        "header": {
            "status_code": header.status_code if header else 0,
            "body": inv_response,
            "id": export_result.remote_ids.get("header"),
        } if header else {},
    }
    full_response_str = json.dumps(full_resp, ensure_ascii=False, default=str)[:5000]

    export_log = APIExportLog.objects.create(
        user=user,
        document_id=export_result.doc_id,
        program=program,
        status=export_result.overall_status,
        invoice_type=f"{export_result.operation_type}",
        invoice_status=inv_status,
        invoice_result=None,
        invoice_error=inv_error,
        partner_status=partner_status,
        partner_error=partner_error,
        full_response=full_response_str,
        session=session,
        message=_s(header_id)[:255],
        partner_message=_s(export_result.remote_ids.get("client", ""))[:255],
    )

    article_logs = []
    for ir in export_result.item_results:
        lr = ir.line_result
        art_status = "success" if (lr and lr.success) else "error"
        art_result = lr.status_code if lr else 0
        art_error = lr.error if lr else ""
        art_response = (lr.response_body[:2000] if lr else "")
        article_logs.append(
            APIExportArticleLog(
                export_log=export_log,
                article_name=_s(ir.name)[:255],
                article_code=_s(ir.code)[:100],
                status=art_status[:10],
                result=art_result,
                error=art_error,
                full_response=art_response,
                message=_s(ir.item_id or ir.message)[:255],
            )
        )
    if article_logs:
        APIExportArticleLog.objects.bulk_create(article_logs)

    updated = ScannedDocument.objects.filter(pk=export_result.doc_id).update(
        site_pro_api_status=export_result.overall_status,
        site_pro_last_try_date=now,
    )
    if not updated:
        from docscanner_app.models import Invoice
        Invoice.objects.filter(pk=export_result.doc_id).update(
            site_pro_api_status=export_result.overall_status,
            site_pro_last_try_date=now,
        )

    logger.info("[SITE_PRO] Išsaugotas export_log=%s doc=%s status=%s articles=%d header_id=%s",
                export_log.pk, export_result.doc_id, export_result.overall_status,
                len(article_logs), header_id or "-")


# =========================================================
# Hello — проверка подключения
# =========================================================
def site_pro_hello(api_key: str) -> str:
    """HTTP 200 на warehouses/list → OK, иначе SiteProError."""
    headers = build_auth_headers(api_key)
    res = _send_request(
        f"{API_BASE}/reference-book/warehouses/list",
        {"rows": 1, "page": 1, "sidx": "", "sord": "asc"},
        headers,
    )
    if res.exception:
        raise SiteProError(f"Ryšio klaida: {res.exception}")
    if res.status_code == 401:
        raise SiteProError("Neteisingas Site.pro API raktas (401)")
    if not res.success:
        raise SiteProError(res.error or "Site.pro prisijungimo patikrinimas nepavyko")
    return "OK"