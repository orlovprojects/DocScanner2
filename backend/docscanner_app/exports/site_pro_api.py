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

Справочники (warehouse / op-type / currency / unit / vat-class / attribute /
group / employee) резолвятся через */list ОДИН раз на прогон и кэшируются.
clients/items создаются blind (без /list) с кэшем на прогон — дедуп по пачке.

Тип операции (operationTypeId):
  - основной путь: матч по СТАНДАРТНОМУ КОДУ Site.pro (PP / PPP / PIRK);
  - fallback: hardcoded id из шаблона Site.pro (создаётся при регистрации),
    но ТОЛЬКО если в полученном списке этот id не занят другим кодом;
  - иначе — ошибка (лучше явно упасть, чем молча уехать в чужую операцию).

Kreditinės (is_credit_invoice=True):
  идут ОБЫЧНЫМ типом операции с ОТРИЦАТЕЛЬНОЙ ценой (SITE_PRO_API_CREDIT_MODE).
  Проверено на файловом импорте по DK: сторно ложится на те же счета с минусом.
  Возвратные типы (PRG / PIRG) НЕ используются.

purchase-items требует ЦЕЛЫХ (qty×1000, price×10000, vat×100, discount×1000000);
sale-items/create-simple — обычные десятичные.
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
    _is_credit,
    _price_for_export,
    _get_seller_fields,
    _get_buyer_fields,
    _get_item_identity,
    _attribute_name_from_preke_paslauga,
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

# Kreditinės в API: как и в файловом экспорте — обычный тип операции
# с отрицательными суммами (проверено по DK).
# Альтернатива на будущее — return-тип (PRG/PIRG) с плюсовыми суммами.
SITE_PRO_API_CREDIT_MODE = "normal_negative"


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
    resolved_by = ""
    if requested:
        extra = get_extra_for_export(user, SITE_PRO_API_PROGRAM, requested)
        if extra:
            resolved_by = requested
    if not extra and doc_code and doc_code != requested:
        extra = get_extra_for_export(user, SITE_PRO_API_PROGRAM, doc_code)
        if extra:
            resolved_by = doc_code
    if not extra:
        extra = get_extra_for_export(user, SITE_PRO_API_PROGRAM, None)
        if extra:
            resolved_by = "__all__/legacy"

    logger.info(
        "[SITE_PRO:EXTRA] doc=%s requested=%r doc_code=%r resolved_by=%r fields=%s",
        getattr(doc, "pk", None), requested, doc_code, resolved_by,
        {k: v for k, v in (extra or {}).items() if v},
    )
    return extra or {}


# =========================================================
# Исключения / константы
# =========================================================
class SiteProError(Exception):
    """Ошибка при работе с Site.pro (B1) API."""
    pass


API_BASE = "https://site.pro/My-Accounting/api"
REQUEST_TIMEOUT = 30
LIST_ROWS = 500          # справочники обычно небольшие — но пагинацию всё равно проходим
LIST_MAX_PAGES = 50      # предохранитель от бесконечного цикла

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
    item_create_result: Optional[SiteProRequestResult] = None   # reference-book/items/create
    line_result: Optional[SiteProRequestResult] = None          # warehouse/{sale,purchase}-items
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
# HTTP слой (retry + user-friendly ошибки)
# =========================================================
def _humanize_api_error(data: dict) -> str:
    """
    Человекочитаемая ошибка из ответа Site.pro. Форматы:
      {"code":400,"shortMessage":"Error","message":"...","errors":{"headers":["..."],"field":["..."]}}
      {"status":400,"message":"..."}
    Вложенные errors (headers/поля) приоритетнее общего message.
    """
    if not isinstance(data, dict):
        return ""
    parts = []
    errs = data.get("errors")
    if isinstance(errs, dict):
        for _v in errs.values():
            if isinstance(_v, list):
                parts.extend(_s(x) for x in _v if _s(x))
            elif _v:
                parts.append(_s(_v))
    elif isinstance(errs, list):
        parts.extend(_s(x) for x in errs if _s(x))
    if parts:
        return "; ".join(parts)[:500]
    msg = _s(data.get("message") or data.get("shortMessage")
             or data.get("detail") or data.get("error"))
    return msg[:500]


def _response_error(body: str) -> str:
    """
    Текст ошибки из тела ответа, если это ошибка Site.pro; иначе ''.
    Ошибкой считаем code/status >= 400 ИЛИ непустой errors
    (Site.pro отдаёт code=400 — не только status — и на HTTP 200, и на 4xx).
    """
    if not body or not body.strip():
        return ""
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        return ""
    if not isinstance(data, dict):
        return ""
    code = data.get("code")
    status = data.get("status")
    is_err = (isinstance(code, int) and code >= 400) or (isinstance(status, int) and status >= 400)
    errs = data.get("errors")
    has_errs = isinstance(errs, (list, dict)) and len(errs) > 0
    if is_err or has_errs:
        return _humanize_api_error(data) or f"Site.pro klaida (code {code or status})"
    return ""


def _check_inner_json_error(body: str) -> str:
    """Site.pro может вернуть HTTP 200 с телом-ошибкой ({"code":400,...} / errors)."""
    return _response_error(body)


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
    # сначала — вложенная ошибка Site.pro (errors.headers[], code, message)
    nested = _response_error(body)
    if nested:
        return nested
    if resp.status_code == 401:
        return "Neteisingas Site.pro API raktas (401)"
    if resp.status_code == 404:
        return "Netinkamas Site.pro API adresas (404)"
    try:
        data = resp.json()
        if isinstance(data, dict):
            return (_humanize_api_error(data) or f"HTTP {resp.status_code}")
    except Exception:
        pass
    return body[:500] if body else f"HTTP {resp.status_code}"


# =========================================================
# Парсинг ответов
# =========================================================
def _parse_rows(body: str) -> list:
    """Ответ */list: {"page":..,"pages":..,"records":..,"data":[...]}."""
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


def _parse_total_pages(body: str) -> int:
    """Сколько всего страниц у */list-ответа."""
    try:
        d = json.loads(body)
    except Exception:
        return 1
    if isinstance(d, dict):
        try:
            return max(1, int(d.get("pages") or 1))
        except (TypeError, ValueError):
            return 1
    return 1


_ID_KEYS = ("id", "clientId", "itemId", "saleId", "purchaseId", "recordId")


def _parse_created_id(body: str) -> Optional[int]:
    """
    Ответ create. Форма в доке не зафиксирована — парсим защитно:
    data как int / "123" / {"id":..}, либо id на верхнем уровне.
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
# Атрибут (Prekės / Paslaugos) на уровне ДОКУМЕНТА
# =========================================================
def _doc_attribute_name(doc, items_list=None) -> str:
    """
    Тип операции ставится на ДОКУМЕНТ, поэтому Prekės/Paslaugos нужен документный.

    detaliai  — preke_paslauga лежит на line_items, агрегируем по строкам;
    sumiskai  — берём с doc.
    Смешанный документ (и prekės, и paslaugos) -> Prekės.
    """
    if items_list:
        attrs = {
            _attribute_name_from_preke_paslauga(getattr(it, "preke_paslauga", None))
            for it in items_list
        }
        result = "Paslaugos" if attrs == {"Paslaugos"} else "Prekės"
        if len(attrs) > 1:
            logger.info("[SITE_PRO] doc=%s mišrus dokumentas (%s) -> attr=%s",
                        getattr(doc, "pk", None), sorted(attrs), result)
        return result
    return _attribute_name_from_preke_paslauga(getattr(doc, "preke_paslauga", None))


# =========================================================
# Резолвер справочников + find-or-create (кэш на прогон)
# =========================================================
class SiteProResolver:
    """
    Тянет справочники через */list и кэширует, резолвит имена → ID.
    Один инстанс на прогон экспорта (переиспользуется между документами).
    """

    # --- стандартные коды типов операций Site.pro ---
    _STD_OP_CODES = {
        ("sale", "Paslaugos"): ("PPP", "PP"),
        ("sale", "Prekės"):    ("PP", "PPP"),
        ("purchase", None):    ("PIRK",),
    }

    # --- дефолтные id из шаблона Site.pro (создаются при регистрации аккаунта) ---
    _STD_OP_IDS = {
        "PP": 2,
        "PPP": 23,
        "PIRK": 33,
    }

    # --- единицы измерения: синонимы -> канон (без точки, lowercase) ---
    _UNIT_ALIASES = {
        "vienetas": "vnt", "vnt": "vnt", "units": "vnt", "unit": "vnt",
        "pcs": "vnt", "pc": "vnt", "st": "vnt", "ea": "vnt",
        "kilogramas": "kg", "kilogram": "kg", "kgs": "kg", "kg": "kg",
        "litras": "l", "liter": "l", "litre": "l", "ltr": "l", "l": "l",
        "metras": "m", "meter": "m", "metre": "m", "m": "m",
        "valanda": "val", "valandos": "val", "hour": "val", "hours": "val",
        "h": "val", "hrs": "val", "val": "val",
    }

    _WEIGHED_UNITS = {"kg", "g", "t", "gr", "tona", "gramas"}

    # --- атрибуты товара: синонимы -> канон ---
    _ATTR_ALIASES = {
        "prekės": "Prekės", "prekes": "Prekės", "prekė": "Prekės", "preke": "Prekės",
        "goods": "Prekės", "item": "Prekės", "items": "Prekės",
        "paslaugos": "Paslaugos", "paslauga": "Paslaugos",
        "services": "Paslaugos", "service": "Paslaugos",
    }

    def __init__(self, headers: dict, base_url: str = API_BASE):
        self.headers = headers
        self.base_url = base_url.rstrip("/")
        self._cache: dict = {}          # справочники (list-эндпоинты)
        self._client_ids: dict = {}     # code/vat/name -> clientId (дедуп по прогону)
        self._item_ids: dict = {}       # code/barcode -> itemId
        self._unit_ids: dict = {}       # normalized unit -> measurementUnitId
        self._attr_ids: dict = {}       # "Prekės"/"Paslaugos" -> attributeId

    # ---- низкоуровневый list (с пагинацией) ----
    def _list(self, endpoint: str, filters: Optional[dict] = None, rows: int = LIST_ROWS) -> list:
        all_rows = []
        page = 1
        while True:
            payload = {"rows": rows, "page": page}
            if filters:
                payload["filters"] = filters
            res = _send_request(f"{self.base_url}/{endpoint}", payload, self.headers)
            if not res.success:
                logger.warning("[SITE_PRO] list %s klaida (page %s): %s",
                               endpoint, page, res.error)
                break

            batch = _parse_rows(res.response_body)
            all_rows.extend(batch)
            total_pages = _parse_total_pages(res.response_body)

            if page == 1 and total_pages > 1:
                logger.info("[SITE_PRO] list %s: %d puslapiai, traukiame visus",
                            endpoint, total_pages)

            if page >= total_pages or not batch:
                break
            page += 1
            if page > LIST_MAX_PAGES:
                logger.warning("[SITE_PRO] list %s: nutraukta ties %d psl.", endpoint, LIST_MAX_PAGES)
                break

        logger.info("[SITE_PRO] list %s -> %d įrašų", endpoint, len(all_rows))
        return all_rows

    def _create(self, endpoint: str, payload: dict) -> SiteProRequestResult:
        res = _send_request(f"{self.base_url}/{endpoint}", payload, self.headers)
        res.api_message = _s(_parse_created_id(res.response_body) or "")
        logger.info("[SITE_PRO] create %s http=%s ok=%s id=%s error=%s payload=%s",
                    endpoint, res.status_code, res.success, res.api_message or "-",
                    res.error or "-", json.dumps(payload, ensure_ascii=False, default=str)[:600])
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

    # =====================================================
    # Operation types
    # =====================================================
    def operation_type_id(self, is_purchase: bool,
                          attr_name: Optional[str] = None) -> Optional[int]:
        """
        1) матч по стандартному коду (PP / PPP / PIRK)
        2) fallback на hardcoded id — только если id не занят другим кодом
        3) иначе None -> документ падает с понятной ошибкой
        """
        rows = self._cached("op_types", "reference-book/operation-types/list")

        # сырой дамп один раз на прогон — чтобы видеть реальные типы клиента
        if not self._cache.get("_op_types_logged"):
            try:
                logger.info("[SITE_PRO] operation-types/list raw (%d rows): %s",
                            len(rows),
                            json.dumps(rows, ensure_ascii=False, default=str)[:4000])
            except Exception:
                pass
            self._cache["_op_types_logged"] = True

        key = ("purchase", None) if is_purchase else ("sale", attr_name or "Prekės")
        std_codes = self._STD_OP_CODES.get(key, ())

        # 1) по коду
        for code in std_codes:
            for o in rows:
                if _s(o.get("code")).upper() == code and _truthy(o.get("isActive", True)):
                    logger.info("[SITE_PRO] operationType pagal kodą %s -> id=%s ('%s')",
                                code, o.get("id"), _s(o.get("name")))
                    return o.get("id")

        # 2) hardcoded fallback (с защитой от чужого id)
        for code in std_codes:
            fallback_id = self._STD_OP_IDS.get(code)
            if not fallback_id:
                continue
            conflict = next(
                (o for o in rows
                 if o.get("id") == fallback_id and _s(o.get("code")).upper() != code),
                None,
            )
            if conflict is not None:
                logger.error(
                    "[SITE_PRO] fallback id=%s (%s) ATŠAUKTAS: id užimtas kito tipo "
                    "'%s' (code=%s) — rizika neteisingų DK įrašų",
                    fallback_id, code, _s(conflict.get("name")), _s(conflict.get("code")),
                )
                continue
            logger.warning(
                "[SITE_PRO] operationType kodas %s nerastas sąraše (%d rows) — "
                "fallback į standartinį id=%s",
                code, len(rows), fallback_id,
            )
            return fallback_id

        logger.error(
            "[SITE_PRO] operationType nerastas: is_purchase=%s attr=%s codes=%s rows=%d",
            is_purchase, attr_name, std_codes, len(rows),
        )
        return None

    # =====================================================
    # Warehouses
    # =====================================================
    def warehouse_id(self, name: Optional[str] = None) -> Optional[int]:
        rows = self._cached("warehouses", "reference-book/warehouses/list")
        if name:
            hit = self._by_name(rows, name)
            if hit:
                return hit.get("id")
            logger.warning("[SITE_PRO] sandėlis '%s' nerastas — imamas pagrindinis", name)
        for r in rows:
            if _truthy(r.get("isPrimary")):
                return r.get("id")
        if rows:
            logger.warning("[SITE_PRO] pagrindinis sandėlis nerastas — imamas pirmas '%s'",
                           _s(rows[0].get("name")))
            return rows[0].get("id")
        logger.error("[SITE_PRO] sandėlių sąrašas tuščias")
        return None

    # =====================================================
    # Measurement units (list -> create -> fallback vnt.)
    # =====================================================
    @staticmethod
    def _unit_base(unit) -> str:
        """'Vnt.' / 'vnt' / 'VNT.' -> 'vnt'."""
        return _s(unit).rstrip(".").strip().lower()

    def measurement_unit_id(self, unit: str) -> Optional[int]:
        rows = self._cached("units", "reference-book/measurement-units/list")

        base = self._unit_base(unit) or "vnt"
        base = self._UNIT_ALIASES.get(base, base)

        if base in self._unit_ids:
            return self._unit_ids[base]

        # 1) поиск по всем полям с учётом вариаций (с точкой / без / регистр / синонимы)
        for r in rows:
            for fld in ("code", "codeName", "name", "shortName"):
                row_base = self._unit_base(r.get(fld))
                if not row_base:
                    continue
                row_base = self._UNIT_ALIASES.get(row_base, row_base)
                if row_base == base:
                    uid = r.get("id")
                    if uid:
                        self._unit_ids[base] = uid
                        return uid

        # 2) не нашли — создаём (в Site.pro единицы обычно с точкой в конце)
        new_name = _s(unit).strip() or f"{base}."
        if not new_name.endswith("."):
            new_name = f"{new_name}."
        logger.info("[SITE_PRO] mato vienetas %r (base=%s) nerastas — bandome sukurti '%s'",
                    unit, base, new_name)
        uid = self._create_measurement_unit(new_name, base)
        if uid:
            return uid

        # 3) fallback — vnt.
        if base != "vnt":
            logger.warning("[SITE_PRO] mato vienetas %r nesukurtas — fallback 'vnt.'", unit)
            return self.measurement_unit_id("vnt.")

        if rows:
            logger.warning("[SITE_PRO] 'vnt.' nerastas — imamas pirmas mato vienetas '%s'",
                           _s(rows[0].get("name")))
            return rows[0].get("id")
        logger.error("[SITE_PRO] mato vienetų sąrašas tuščias")
        return None

    def _create_measurement_unit(self, name: str, base: str) -> Optional[int]:
        """reference-book/measurement-units/create — name (max 10), canBeWeighed."""
        name = _s(name)[:10]
        if not name:
            return None

        payload = {
            "name": name,
            "canBeWeighed": base in self._WEIGHED_UNITS,
        }
        res = self._create("reference-book/measurement-units/create", payload)
        uid = _parse_created_id(res.response_body)

        if uid:
            self._unit_ids[base] = uid
            self._cache.setdefault("units", []).append(
                {"id": uid, "name": name, "code": name}
            )
            logger.info("[SITE_PRO] sukurtas mato vienetas '%s' -> id=%s", name, uid)
        else:
            logger.warning("[SITE_PRO] nepavyko sukurti mato vieneto '%s': %s",
                           name, res.error or "-")
        return uid

    # =====================================================
    # Item attributes (Prekės / Paslaugos)
    # =====================================================
    def item_attribute_id(self, name: str) -> Optional[int]:
        rows = self._cached("attrs", "reference-book/item-attributes/list")

        raw = _s(name).strip()
        canon = self._ATTR_ALIASES.get(raw.lower(), raw or "Prekės")

        if canon in self._attr_ids:
            return self._attr_ids[canon]

        # 1) поиск с учётом вариаций
        for r in rows:
            row_raw = _s(r.get("name")).strip()
            row_canon = self._ATTR_ALIASES.get(row_raw.lower(), row_raw)
            if row_canon == canon:
                aid = r.get("id")
                if aid:
                    self._attr_ids[canon] = aid
                    logger.info("[SITE_PRO] itemAttribute '%s' -> id=%s", canon, aid)
                    return aid

        # 2) создаём
        logger.info("[SITE_PRO] itemAttribute '%s' nerastas — bandome sukurti", canon)
        payload = {
            "name": canon[:100],
            "isQuantitative": (canon == "Prekės"),
        }
        unit_id = self.measurement_unit_id("vnt.")
        if unit_id:
            payload["measurementUnitId"] = unit_id

        res = self._create("reference-book/item-attributes/create", payload)
        aid = _parse_created_id(res.response_body)
        if aid:
            self._attr_ids[canon] = aid
            self._cache.setdefault("attrs", []).append({"id": aid, "name": canon})
            logger.info("[SITE_PRO] sukurtas itemAttribute '%s' -> id=%s", canon, aid)
            return aid

        logger.warning("[SITE_PRO] nepavyko sukurti itemAttribute '%s': %s",
                       canon, res.error or "-")

        # 3) fallback — первый из списка (attributeId обязателен при items/create)
        if rows:
            logger.warning("[SITE_PRO] itemAttribute '%s' — fallback į '%s' (id=%s)",
                           canon, _s(rows[0].get("name")), rows[0].get("id"))
            return rows[0].get("id")
        logger.error("[SITE_PRO] itemAttributes sąrašas tuščias")
        return None

    # =====================================================
    # VAT / currency / groups / employees
    # =====================================================
    def vat_classification_id(self, code: str) -> Optional[int]:
        code = _s(code)
        if not code:
            return None
        rows = self._cached("vat_class", "reference-book/vat-classifications/list")
        for r in rows:
            if _s(r.get("code")).lower() == code.lower():
                return r.get("id")
        logger.warning("[SITE_PRO] PVM klasifikatorius '%s' nerastas", code)
        return None

    def currency_id(self, code: str = "EUR") -> Optional[int]:
        code = _s(code) or "EUR"
        rows = self._cached("currencies", "reference-book/currencies/list")
        # ВНИМАНИЕ: в доке поля currency перепутаны (name<->code) → матчим по обоим
        for r in rows:
            if code.lower() in (_s(r.get("name")).lower(), _s(r.get("code")).lower()):
                return r.get("id")
        logger.warning("[SITE_PRO] valiuta '%s' nerasta — imama pagrindinė", code)
        for r in rows:
            if _truthy(r.get("isPrimary")):
                return r.get("id")
        return rows[0].get("id") if rows else None

    def item_group_id(self, name: Optional[str]) -> Optional[int]:
        if not _s(name):
            return None
        rows = self._cached("groups", "reference-book/item-groups/list")
        hit = self._by_name(rows, name)
        if hit:
            return hit.get("id")
        logger.warning("[SITE_PRO] prekių grupė '%s' nerasta — bus be grupės", name)
        return None

    def employee_id(self, name: Optional[str] = None) -> Optional[int]:
        rows = self._cached("employees", "personnel/employees/list")
        active = [r for r in rows if _truthy(r.get("isEmployed", True))] or rows
        if name:
            n = _s(name).lower()
            for r in active:
                full = f"{_s(r.get('name'))} {_s(r.get('lastName'))}".strip().lower()
                if full == n or _s(r.get("name")).lower() == n:
                    return r.get("id")
            logger.warning("[SITE_PRO] darbuotojas '%s' nerastas — imamas pirmas aktyvus", name)
        if active:
            return active[0].get("id")
        logger.error("[SITE_PRO] darbuotojų sąrašas tuščias")
        return None

    # =====================================================
    # clients / items: blind create + кэш на прогон (БЕЗ /list)
    # =====================================================
    def find_or_create_client(self, doc, doc_type: str) -> tuple[Optional[int], Optional[SiteProRequestResult]]:
        p = _get_seller_fields(doc) if doc_type == "pirkimas" else _get_buyer_fields(doc)
        name = _s(p["name"])
        code = _s(p["code"])
        vat = _s(p["vat"])

        cache_key = code or vat or name.lower()
        if cache_key and cache_key in self._client_ids:
            logger.info("[SITE_PRO] klientas '%s' iš cache -> id=%s", name, self._client_ids[cache_key])
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
            logger.info("[SITE_PRO] prekė '%s' iš cache -> id=%s", name, self._item_ids[cache_key])
            return self._item_ids[cache_key], None

        if not name:
            name = "Preke"

        attr_name = _attribute_name_from_preke_paslauga(
            (it is not None and getattr(it, "preke_paslauga", None))
            or getattr(doc, "preke_paslauga", None)
        )
        attr_id = self.item_attribute_id(attr_name)
        unit_raw = _get_measure_unit(it) if it is not None else "vnt."
        unit_id = self.measurement_unit_id(unit_raw)

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
            payload["vatRate"] = float(abs(_safe_D(vat_rate)))

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
    return {
        "saleDate": _get_doc_date(doc),
        "autoGenerateNumberAndSeries": False,
        "series": series[:10],
        "number": number[:20],
        "warehouseId": warehouse_id,
        "clientId": client_id,
        "operationTypeId": op_type_id,
        "employeeId": employee_id,
    }


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
        line["vatRate"] = float(abs(_safe_D(vat_pct)))
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
    price_w = _price_with_vat(price_wo, abs(_safe_D(vat_pct)))
    line = {
        "purchaseId": purchase_id,
        "position": position,
        "warehouseId": warehouse_id,
        "itemId": item_id,
        "quantity": _scale_int(qty, 1000),                           # ×1000
        "vatRate": _scale_int(abs(_safe_D(vat_pct)), 100),           # ×100
        "priceWithoutVat": _scale_int(price_wo, 10000),              # ×10000
        "priceWithVat": _scale_int(price_w, 10000),                  # ×10000
        "priceWithoutVatWithDiscount": _scale_int(price_wo, 10000),  # скидка уже в цене
        "discountRate": 0,                                           # ×1000
        "discount": 0,                                               # ×1000000
        "discountSum": 0,                                            # ×10000
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
    is_credit = _is_credit(doc)

    result = SiteProDocumentResult(doc_id=doc_id)
    result.operation_type = "purchase" if is_purchase else "sale"

    headers = build_auth_headers(api_key)
    if resolver is None:
        resolver = SiteProResolver(headers)

    logger.info("[SITE_PRO] === doc=%s type=%s credit=%s nr=%s data=%s ===",
                doc_id, doc_type, is_credit, _get_doc_number(doc), _get_doc_date(doc))

    try:
        extra = _get_extra(user, doc, own_company_code)

        # ── 1) CLIENT ───────────────────────────────────────
        client_id, client_res = resolver.find_or_create_client(doc, doc_type)
        result.client_result = client_res
        if not client_id:
            result.overall_status = "error"
            if client_res is None:
                result.client_result = SiteProRequestResult(
                    success=False, error="Nepavyko sukurti/rasti kliento")
            logger.error("[SITE_PRO] doc=%s klientas nesukurtas: %s",
                         doc_id, (client_res.error if client_res else "-"))
            return result
        result.remote_ids["client"] = client_id

        # ── 2) РЕЗОЛВ СПРАВОЧНИКОВ ───────────────────────────
        line_items = _iter_line_items(doc)
        doc_attr = _doc_attribute_name(doc, line_items)

        warehouse_id = resolver.warehouse_id(_get_warehouse_name(extra, doc_type))
        op_type_id = resolver.operation_type_id(is_purchase, attr_name=doc_attr)
        group_id = resolver.item_group_id(_get_group_name(extra, doc_type))
        emp_name = _get_purchase_employee_name(extra) if is_purchase else _get_employee_name(extra)
        employee_id = resolver.employee_id(emp_name)
        currency_id = resolver.currency_id(_get_currency(doc)) if is_purchase else None

        logger.info(
            "[SITE_PRO] doc=%s resolved: attr=%s warehouse=%s opType=%s group=%s "
            "employee=%s('%s') currency=%s client=%s",
            doc_id, doc_attr, warehouse_id, op_type_id, group_id,
            employee_id, emp_name, currency_id, client_id,
        )

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
            logger.error("[SITE_PRO] doc=%s trūksta reikšmių: %s", doc_id, missing)
            return result

        # ── 3) ITEMS (find-or-create) ────────────────────────
        price_map = _calc_discounted_price_map(doc, line_items) if line_items else {}
        if price_map:
            logger.info("[SITE_PRO] doc=%s pritaikyta nuolaida %s eilutėms",
                        doc_id, len(price_map))

        prepared = []  # (ir, item_id, qty, price, vat_pct, vat_class_id)

        if line_items:
            for it in line_items:
                vat_pct = getattr(it, "vat_percent", None)
                item_id, item_res = resolver.find_or_create_item(doc, it, group_id, vat_rate=vat_pct)
                name, code, barcode = _get_item_identity(doc, it)
                ir = SiteProItemResult(name=_s(name), code=_s(code), barcode=_s(barcode),
                                       item_id=item_id, item_create_result=item_res)
                result.item_results.append(ir)
                if not item_id:
                    ir.message = "no item id"
                    logger.warning("[SITE_PRO] doc=%s prekė '%s' nesukurta — eilutė praleidžiama",
                                   doc_id, _s(name))
                    continue

                qty = _safe_D(getattr(it, "quantity", 1) or 1)
                if is_credit:
                    qty = abs(qty)

                price = _safe_D(price_map.get(id(it), getattr(it, "price", 0) or 0)) if price_map \
                    else _safe_D(getattr(it, "price", 0) or 0)
                if is_credit:
                    price = abs(price)
                price = _price_for_export(price, is_credit)

                vat_class_id = resolver.vat_classification_id(_get_vat_classifier(doc, it))
                prepared.append((ir, item_id, qty, price, vat_pct, vat_class_id))
        else:
            # sumiskai — одна строка из doc-уровня
            item_id, item_res = resolver.find_or_create_item(
                doc, None, group_id, vat_rate=getattr(doc, "vat_percent", None))
            name, code, barcode = _get_item_identity(doc, None)
            ir = SiteProItemResult(name=_s(name) or "Preke", code=_s(code), barcode=_s(barcode),
                                   item_id=item_id, item_create_result=item_res)
            result.item_results.append(ir)
            if item_id:
                amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
                discount = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
                if is_credit:
                    amount_wo = abs(amount_wo)
                    discount = abs(discount)
                if discount > 0:
                    amount_wo = amount_wo - discount
                    if amount_wo < 0:
                        amount_wo = Decimal("0")
                amount_wo = _price_for_export(amount_wo, is_credit)

                vat_class_id = resolver.vat_classification_id(_get_vat_classifier(doc, None))
                prepared.append((ir, item_id, Decimal("1"), _quantize_2(amount_wo),
                                 getattr(doc, "vat_percent", None), vat_class_id))
            else:
                ir.message = "no item id"
                logger.warning("[SITE_PRO] doc=%s (sumiskai) prekė nesukurta", doc_id)

        if not prepared:
            result.overall_status = "error"
            result.header_result = SiteProRequestResult(success=False, error="Nėra prekių eilučių")
            logger.error("[SITE_PRO] doc=%s nėra paruoštų eilučių — dokumentas nesiunčiamas", doc_id)
            return result

        logger.info("[SITE_PRO] doc=%s paruošta %d eilučių (credit=%s, sumos %s)",
                    doc_id, len(prepared), is_credit,
                    "neigiamos" if is_credit else "teigiamos")

        # ── 4) HEADER ────────────────────────────────────────
        if is_purchase:
            header_payload = _build_purchase_header(doc, client_id, warehouse_id,
                                                    op_type_id, currency_id, employee_id)
            header_endpoint = "warehouse/purchases/create"
        else:
            header_payload = _build_sale_header(doc, client_id, warehouse_id, op_type_id, employee_id)
            header_endpoint = "warehouse/sales/create"

        logger.info("[SITE_PRO] doc=%s header payload: %s",
                    doc_id, json.dumps(header_payload, ensure_ascii=False, default=str)[:800])

        header_res = _send_request(f"{API_BASE}/{header_endpoint}", header_payload, headers)
        header_id = _parse_created_id(header_res.response_body)
        header_res.api_message = _s(header_id or "")
        result.header_result = header_res

        logger.info("[SITE_PRO] doc=%s header type=%s http=%s id=%s error=%s body=%s",
                    doc_id, result.operation_type, header_res.status_code,
                    header_id or "-", header_res.error or "-",
                    header_res.response_body[:400])

        if not header_id:
            result.overall_status = "error"
            logger.error("[SITE_PRO] doc=%s dokumentas nesukurtas — eilutės nesiunčiamos", doc_id)
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

            logger.info(
                "[SITE_PRO] doc=%s line #%d item=%s qty=%s price=%s vat=%s http=%s ok=%s error=%s",
                doc_id, pos, item_id, qty, price, vat_pct,
                line_res.status_code, line_res.success, line_res.error or "-",
            )
            if not line_res.success:
                logger.warning("[SITE_PRO] doc=%s line #%d payload: %s",
                               doc_id, pos,
                               json.dumps(line_payload, ensure_ascii=False, default=str)[:600])

        # ── OVERALL STATUS ───────────────────────────────────
        header_ok = bool(result.header_result and result.header_result.success)
        item_creates = [ir.item_create_result for ir in result.item_results
                        if ir.item_create_result is not None]
        items_ok = bool(item_creates) and all(r.success for r in item_creates)
        lines = [ir.line_result for ir in result.item_results if ir.line_result is not None]
        lines_ok = bool(lines) and all(lr.success for lr in lines)

        if header_ok and items_ok and lines_ok:
            result.overall_status = "success"
        elif header_ok and (any(lr.success for lr in lines) or any(r.success for r in item_creates)):
            result.overall_status = "partial_success"
        else:
            result.overall_status = "error"

        logger.info(
            "[SITE_PRO] doc=%s BAIGTA status=%s header_ok=%s items_ok=%s lines_ok=%s "
            "(%d/%d eilučių sėkmingos)",
            doc_id, result.overall_status, header_ok, items_ok, lines_ok,
            sum(1 for lr in lines if lr.success), len(lines),
        )

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

    logger.info("[SITE_PRO] ===== EKSPORTAS: %d dokumentų =====", len(documents))
    resolver = SiteProResolver(build_auth_headers(api_key))
    results = []
    for doc in documents:
        results.append(export_document_to_site_pro(
            doc, api_key, user=user, own_company_code=own_company_code, resolver=resolver,
        ))

    stats = {}
    for r in results:
        stats[r.overall_status] = stats.get(r.overall_status, 0) + 1
    logger.info("[SITE_PRO] ===== EKSPORTAS BAIGTAS: %s =====", stats)
    return results


# =========================================================
# Сохранение результата в БД
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
        # 1) Prekės / paslaugos — карточка товара (reference-book/items/create)
        cr = ir.item_create_result
        item_status = "success" if (cr and cr.success) else "error"
        article_logs.append(
            APIExportArticleLog(
                export_log=export_log,
                kind="item",
                article_name=_s(ir.name)[:255],
                article_code=_s(ir.code)[:100],
                status=item_status[:10],
                result=(cr.status_code if cr else 0),
                error=(cr.error if cr else ""),
                full_response=(cr.response_body[:2000] if cr else ""),
                message=_s(ir.item_id or "")[:255],
            )
        )

        # 2) Dokumento eilutė — строка документа (warehouse/{sale,purchase}-items)
        lr = ir.line_result
        if lr is not None:
            line_status = "success" if lr.success else "error"
            article_logs.append(
                APIExportArticleLog(
                    export_log=export_log,
                    kind="line",
                    article_name=_s(ir.name)[:255],
                    article_code=_s(ir.code)[:100],
                    status=line_status[:10],
                    result=lr.status_code,
                    error=lr.error,
                    full_response=lr.response_body[:2000],
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

    logger.info("[SITE_PRO] išsaugotas export_log=%s doc=%s status=%s logs=%d header_id=%s",
                export_log.pk, export_result.doc_id, export_result.overall_status,
                len(article_logs), header_id or "-")


# =========================================================
# Hello — проверка подключения
# =========================================================
def site_pro_hello(api_key: str) -> str:
    """HTTP 200 на warehouses/list → OK, иначе SiteProError с человеческим текстом."""
    headers = build_auth_headers(api_key)
    res = _send_request(
        f"{API_BASE}/reference-book/warehouses/list",
        {"rows": 10, "page": 1},
        headers,
    )
    logger.info("[SITE_PRO] hello http=%s ok=%s error=%s body=%s",
                res.status_code, res.success, res.error or "-", res.response_body[:300])
    if res.exception:
        raise SiteProError(f"Ryšio klaida: {res.exception}")
    if res.status_code == 401:
        raise SiteProError("Neteisingas Site.pro API raktas (401)")
    if not res.success:
        raise SiteProError(res.error or "Site.pro prisijungimo patikrinimas nepavyko")
    return "OK"