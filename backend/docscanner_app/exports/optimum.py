"""
Optimum API — генерация XML + SOAP 1.1 клиент.

Поток на один документ:
  1. InsertArticle × N (по одному на уникальный товар)
  2. InsertInvoice (pardavimas) или InsertPrcInvoice (pirkimas)
  3. Парсинг ответов, определение статуса, сохранение в БД

Используем строковые шаблоны вместо ET из-за бага с тегом Name в lxml/ET.
"""
from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional
from xml.sax.saxutils import escape as xml_escape

import requests
from django.utils import timezone
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)


# =========================================================
# Исключения
# =========================================================
class OptimumError(Exception):
    """Ошибка при работе с Optimum API."""
    pass


# =========================================================
# Константы
# =========================================================
SEPARATE_VAT_NOTE = (
    "Dokumentas skaitmenizuotas sumiškai, bet jame keli skirtingi PVM kodai. "
    "PVM klasifikatorius nebuvo priskirtas, o PVM tarifas nustatytas nulinis."
)

SOAP_HEADER = '<?xml version="1.0" encoding="utf-8"?>'
ENVELOPE_OPEN = (
    '<soap:Envelope'
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"'
    ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
)
ENVELOPE_CLOSE = '</soap:Envelope>'
OPT_NS_ATTR = 'xmlns="http://api.optimum.lt/v1/lt/Trd/"'

OPTIMUM_API_URL = "http://api.optimum.lt/v1/lt/Trd.asmx"
# OPTIMUM_API_URL = "http://localhost:8877/v1/lt/Trd.asmx"
SOAP_ACTION_PREFIX = "http://api.optimum.lt/v1/lt/Trd"
REQUEST_TIMEOUT = 30


# =========================================================
# Общие хелперы
# =========================================================
def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _get_attr(obj, name: str, default=None):
    try:
        return getattr(obj, name, default)
    except Exception:
        return default


def _safe_D(x) -> Decimal:
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _to_decimal_str(v, default="0") -> str:
    s = _s(v).replace("%", "").replace(",", ".")
    if not s:
        return default
    try:
        d = Decimal(s)
    except (InvalidOperation, ValueError):
        return default
    if d == Decimal("-0"):
        d = Decimal("0")
    result = format(d, "f")
    if "." in result:
        result = result.rstrip("0").rstrip(".")
    return result or "0"


def _to_datetime_str(v) -> str:
    if not v:
        return datetime.now().strftime("%Y-%m-%dT00:00:00")
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%dT00:00:00")
    try:
        dt = datetime.fromisoformat(str(v))
        return dt.strftime("%Y-%m-%dT%H:%M:%S")
    except Exception:
        return datetime.now().strftime("%Y-%m-%dT00:00:00")


def _x(v) -> str:
    return xml_escape(_s(v))


def _tag(name: str, value: str) -> str:
    return f"<{name}>{_x(value)}</{name}>"


def _wrap_soap(key: str, action_xml: str) -> str:
    return (
        f'{SOAP_HEADER}\n'
        f'{ENVELOPE_OPEN}\n'
        f'  <soap:Header>\n'
        f'    <Header {OPT_NS_ATTR}>\n'
        f'      <Key>{_x(key)}</Key>\n'
        f'    </Header>\n'
        f'  </soap:Header>\n'
        f'  <soap:Body>\n'
        f'{action_xml}'
        f'  </soap:Body>\n'
        f'{ENVELOPE_CLOSE}'
    )


# =========================================================
# Единицы измерения
# =========================================================
_CANON_UNITS = {
    "vnt.": {"vnt", "vnt.", "vnt ", "vnt. "},
    "val.": {"val", "val.", "val ", "val. "},
    "d.":   {"d", "d.", "d ", "d. "},
    "kg":   {"kg", "kg "},
    "kompl.": {"kompl", "kompl.", "komplektas", "komplektas.", "kompl "},
    "l":    {"l", "l "},
    "m":    {"m", "m "},
    "m²":   {"m2", "m²", "m^2"},
    "m³":   {"m3", "m³", "m^3"},
    "t":    {"t", "t "},
}

_UNIT_MAP = {}
for canon, variants in _CANON_UNITS.items():
    for v in variants:
        _UNIT_MAP[v.strip().lower()] = canon


def _normalize_unit(unit: str) -> str:
    u = _s(unit).strip()
    if not u:
        return "vnt."
    return _UNIT_MAP.get(u.lower(), u.lower())


# =========================================================
# Документ series/number — формат SERIJA-NUMERIS
# =========================================================
def _build_ref_id(series: str, number: str) -> str:
    s = _s(series)
    n = _s(number)
    if not s and not n:
        return ""
    if not s:
        return n
    if not n:
        return s
    if n.upper().startswith(s.upper()):
        tail = n[len(s):].lstrip("-/ .")
        if tail:
            return f"{s}-{tail}"
        return s
    return f"{s}-{n}"


# =========================================================
# Тип документа
# =========================================================
def _detect_document_type(doc) -> str:
    doc_type_str = _s(_get_attr(doc, "pirkimas_pardavimas", "")).lower()
    if doc_type_str in ("pirkimas", "pardavimas"):
        return doc_type_str
    if _s(_get_attr(doc, "seller_id", "")) or _s(_get_attr(doc, "seller_vat_code", "")):
        return "pirkimas"
    if _s(_get_attr(doc, "buyer_id", "")) or _s(_get_attr(doc, "buyer_vat_code", "")):
        return "pardavimas"
    return "pardavimas"


# =========================================================
# Код контрагента
# =========================================================
def _get_party_code(doc, *, id_field: str, vat_field: str, id_programoje_field: str) -> str:
    for field_name in (id_field, vat_field, id_programoje_field):
        val = _s(_get_attr(doc, field_name, None))
        if val:
            return val
    return ""


# =========================================================
# Код товара / баркод
# =========================================================
def _get_product_code(item=None, doc=None) -> str:
    if item is not None:
        code = _s(_get_attr(item, "prekes_kodas", "")) or _s(_get_attr(item, "prekes_barkodas", ""))
        if code:
            return code
    if doc is not None:
        code = _s(_get_attr(doc, "prekes_kodas", "")) or _s(_get_attr(doc, "prekes_barkodas", ""))
        if code:
            return code
    return "PREKE001"


def _get_barcode(item=None, doc=None) -> str:
    for obj in (item, doc):
        if obj is not None:
            bc = _s(_get_attr(obj, "prekes_barkodas", ""))
            if bc:
                return bc
    return ""


# =========================================================
# Extra fields
# =========================================================
def _get_extra(customuser) -> dict:
    if customuser is None:
        return {}
    d = _get_attr(customuser, "optimum_extra_fields", None)
    return d if isinstance(d, dict) else {}


# =========================================================
# Resolve Type / ArtGrpFllCode / Product из preke_paslauga
# =========================================================
def _resolve_type_group_product(item=None, doc=None) -> tuple[str, str, bool]:
    v = _get_attr(item, "preke_paslauga", None) if item is not None else None
    if v is None and doc is not None:
        v = _get_attr(doc, "preke_paslauga", None)

    if v is not None:
        try:
            n = int(v)
            if n in (2, 4):
                return "PASLAUGA", "PA", False
            return "PREKE", "PR", True
        except (ValueError, TypeError):
            pass

        s = _s(v).lower()
        if s in ("paslauga", "paslaugos"):
            return "PASLAUGA", "PA", False
        if s in ("preke", "prekė", "prekes", "prekės"):
            return "PREKE", "PR", True

    return "PREKE", "PR", True


# =========================================================
# PVM kodas
# =========================================================
def _get_pvm_kodas(doc, item=None, line_map=None) -> str:
    separate_vat = bool(_get_attr(doc, "separate_vat", False))
    scan_type = _s(_get_attr(doc, "scan_type", "")).lower()

    if separate_vat and scan_type == "sumiskai":
        return ""

    if item is not None and line_map is not None:
        item_id = _get_attr(item, "id", None)
        if item_id is not None and item_id in line_map:
            pvm = _s(line_map.get(item_id, ""))
            if pvm == "Keli skirtingi PVM":
                return ""
            return pvm

    if item is not None:
        pvm = _s(_get_attr(item, "pvm_kodas", ""))
        if pvm == "Keli skirtingi PVM":
            return ""
        return pvm

    pvm = _s(_get_attr(doc, "pvm_kodas", ""))
    if pvm == "Keli skirtingi PVM":
        return ""
    return pvm


# =========================================================
# VatTariff с учётом separate_vat
# =========================================================
def _get_vat_tariff(doc, item=None) -> str:
    separate_vat = bool(_get_attr(doc, "separate_vat", False))
    scan_type = _s(_get_attr(doc, "scan_type", "")).lower()

    if separate_vat and scan_type == "sumiskai":
        return "0"

    v = _get_attr(item, "vat_percent", None) if item is not None else None
    if v is None:
        v = _get_attr(doc, "vat_percent", None)
    return _to_decimal_str(v, default="0")


# =========================================================
# Скидка — пропорциональное распределение на цену
# =========================================================
def _compute_line_discounts(doc, line_items: list) -> dict:
    disc = _safe_D(_get_attr(doc, "invoice_discount_wo_vat", 0) or 0)
    if disc <= 0:
        return {}

    items_data = []
    total = Decimal("0")
    for item in line_items:
        qty = _safe_D(_get_attr(item, "quantity", 1) or 1)
        price = _safe_D(_get_attr(item, "price", 0) or 0)
        line_total = price * qty
        items_data.append(line_total)
        total += line_total

    if total <= 0:
        return {}

    result = {}
    distributed = Decimal("0")
    for i, line_total in enumerate(items_data):
        if i == len(items_data) - 1:
            result[i] = disc - distributed
        else:
            part = (disc * line_total / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            result[i] = part
            distributed += part
    return result


# =========================================================
# VatCodes — сводка НДС по документу
# =========================================================
def _build_vat_codes(doc, line_items=None, line_map=None) -> list[dict]:
    separate_vat = bool(_get_attr(doc, "separate_vat", False))
    scan_type = _s(_get_attr(doc, "scan_type", "")).lower()

    if separate_vat and scan_type == "sumiskai":
        return []

    grouped: dict[str, Decimal] = {}

    if line_items:
        for item in line_items:
            pvm = _get_pvm_kodas(doc, item=item, line_map=line_map)
            if not pvm:
                continue
            qty = _safe_D(_get_attr(item, "quantity", 1) or 1)
            price = _safe_D(_get_attr(item, "price", 0) or 0)
            grouped[pvm] = grouped.get(pvm, Decimal("0")) + (price * qty)
    else:
        pvm = _get_pvm_kodas(doc, item=None, line_map=line_map)
        if pvm:
            grouped[pvm] = _safe_D(_get_attr(doc, "amount_wo_vat", 0) or 0)

    return [{"code": c, "txb_amount": _to_decimal_str(a)} for c, a in grouped.items()]


# =========================================================
# amount_with_vat хелпер
# =========================================================
def _get_amount_with_vat(doc) -> Decimal:
    v = _get_attr(doc, "amount_with_vat", None)
    if v is not None:
        return _safe_D(v)
    wo = _safe_D(_get_attr(doc, "amount_wo_vat", 0) or 0)
    vat = _safe_D(_get_attr(doc, "vat_amount", 0) or 0)
    return wo + vat


# =========================================================
# XML генерация: InsertArticle
# =========================================================
def build_insert_article_xml(
    *,
    key: str,
    item=None,
    doc=None,
    customuser=None,
    doc_type: str = "pardavimas",
) -> str:
    extra = _get_extra(customuser)

    code = _get_product_code(item=item, doc=doc)
    barcode = _get_barcode(item=item, doc=doc)
    name = (_s(_get_attr(item, "prekes_pavadinimas", "")) if item else "") or \
           _s(_get_attr(doc, "prekes_pavadinimas", "")) or "Prekė"
    unit = (_s(_get_attr(item, "unit", "")) if item else "") or \
           _s(_get_attr(doc, "unit", "")) or "vnt."
    msr = _normalize_unit(unit)
    currency = (_s(_get_attr(doc, "currency", "")) or "EUR").upper()
    vat_tariff = _to_decimal_str(
        (_get_attr(item, "vat_percent", None) if item else None) or
        _get_attr(doc, "vat_percent", None),
        default="0",
    )

    type_fb, grp_fb, product = _resolve_type_group_product(item=item, doc=doc)

    if doc_type == "pirkimas":
        art_type = _s(extra.get("pirk_prekes_tipas", "")) or type_fb
        art_grp = _s(extra.get("pirk_prekes_grupe", "")) or grp_fb
    else:
        art_type = _s(extra.get("pard_prekes_tipas", "")) or type_fb
        art_grp = _s(extra.get("pard_prekes_grupe", "")) or grp_fb

    lines = []
    lines.append(f'    <InsertArticle {OPT_NS_ATTR}>')
    lines.append(f'      <article>')
    lines.append(f'        {_tag("Code", code)}')
    if barcode:
        lines.append(f'        {_tag("BarCode", barcode)}')
    lines.append(f'        {_tag("Name", name)}')
    lines.append(f'        {_tag("Type", art_type)}')
    lines.append(f'        {_tag("MsrName", msr)}')
    lines.append(f'        <Product>{"true" if product else "false"}</Product>')
    lines.append(f'        {_tag("ArtGrpFllCode", art_grp)}')
    lines.append(f'        {_tag("SlsPrcCurrencyId", currency)}')
    lines.append(f'        <VatTariff>{vat_tariff}</VatTariff>')
    lines.append(f'        <Active>true</Active>')
    lines.append(f'      </article>')
    lines.append(f'    </InsertArticle>')

    return _wrap_soap(key, "\n".join(lines) + "\n")


# =========================================================
# XML генерация: InsertInvoice (pardavimas)
# =========================================================
def build_insert_invoice_xml(
    *,
    key: str,
    doc,
    customuser=None,
    line_map: Optional[dict] = None,
) -> str:
    extra = _get_extra(customuser)
    separate_vat = bool(_get_attr(doc, "separate_vat", False))
    scan_type = _s(_get_attr(doc, "scan_type", "")).lower()
    is_sumiskai_separate = separate_vat and scan_type == "sumiskai"

    inv_date = _get_attr(doc, "invoice_date", None) or _get_attr(doc, "operation_date", None)
    doc_no = _build_ref_id(
        _s(_get_attr(doc, "document_series", "")),
        _s(_get_attr(doc, "document_number", "")),
    )

    buyer_code = _get_party_code(doc, id_field="buyer_id", vat_field="buyer_vat_code",
                                  id_programoje_field="buyer_id_programoje")
    buyer_name = _s(_get_attr(doc, "buyer_name", ""))
    buyer_grp = _s(extra.get("pirkejo_grupe", "")) or "K"
    buyer_city = _s(_get_attr(doc, "buyer_city", "")) or "NA"
    buyer_country = _s(_get_attr(doc, "buyer_country_iso", "")) or "LT"
    currency = (_s(_get_attr(doc, "currency", "")) or "EUR").upper()
    notes = SEPARATE_VAT_NOTE if is_sumiskai_separate else ""

    dpr_code = _s(extra.get("pard_skyriaus_kodas", ""))
    prj_code = _s(extra.get("pard_projekto_kodas", ""))
    emp_code = _s(extra.get("pard_atsakingo_darb_kodas", ""))

    line_items_qs = _get_attr(doc, "line_items", None)
    has_items = bool(line_items_qs and hasattr(line_items_qs, "all") and line_items_qs.exists())
    str_code = _s(extra.get("pard_sandelio_kodas", "")) or "S"

    lines = []
    lines.append(f'    <InsertInvoice {OPT_NS_ATTR}>')
    lines.append(f'      <invoice>')
    lines.append(f'        <Date>{_to_datetime_str(inv_date)}</Date>')
    lines.append(f'        {_tag("No", doc_no)}')

    if dpr_code:
        lines.append(f'        {_tag("DprFllCode", dpr_code)}')
    if prj_code:
        lines.append(f'        {_tag("PrjFllCode", prj_code)}')
    if emp_code:
        lines.append(f'        {_tag("RspEmpCode", emp_code)}')

    lines.append(f'        <CstCompany>')
    lines.append(f'          {_tag("Code", buyer_code)}')
    lines.append(f'          {_tag("Name", buyer_name)}')
    lines.append(f'          {_tag("CstGrpFllCode", buyer_grp)}')
    lines.append(f'          {_tag("CtName", buyer_city)}')
    lines.append(f'          {_tag("CountryId", buyer_country)}')
    lines.append(f'          {_tag("CurrencyId", currency)}')
    lines.append(f'        </CstCompany>')

    if notes:
        lines.append(f'        {_tag("Notes", notes)}')

    lines.append(f'        <Articles>')

    if has_items:
        items_list = list(line_items_qs.all())
        line_discounts = _compute_line_discounts(doc, items_list)

        for i, item in enumerate(items_list):
            art_code = _get_product_code(item=item, doc=doc)
            qty = _safe_D(_get_attr(item, "quantity", 1) or 1)
            price = _safe_D(_get_attr(item, "price", 0) or 0)
            vat_pct = _safe_D(_get_attr(item, "vat_percent", 0) or 0)
            vat_tariff = _get_vat_tariff(doc, item=item)

            line_discount = line_discounts.get(i, Decimal("0"))
            line_total_wo_vat = (price * qty) - line_discount
            new_unit_price = (line_total_wo_vat / qty).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ) if qty else price

            line_vat = (line_total_wo_vat * vat_pct / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            ext_price = line_total_wo_vat + line_vat

            lines.append(f'          <InvArticle>')
            lines.append(f'            {_tag("ArtCode", art_code)}')
            lines.append(f'            {_tag("StrFllCode", str_code)}')
            lines.append(f'            <Quantity>{_to_decimal_str(qty)}</Quantity>')
            lines.append(f'            <UntPrice>{_to_decimal_str(new_unit_price)}</UntPrice>')
            lines.append(f'            <Discount>0</Discount>')
            lines.append(f'            <VatTariff>{vat_tariff}</VatTariff>')
            lines.append(f'            <ExtPrice>{_to_decimal_str(ext_price)}</ExtPrice>')
            lines.append(f'          </InvArticle>')

        vat_codes = _build_vat_codes(doc, items_list, line_map)
    else:
        art_code = _get_product_code(item=None, doc=doc)
        qty = _safe_D(_get_attr(doc, "quantity", 1) or 1)
        amount_wo = _safe_D(_get_attr(doc, "amount_wo_vat", 0) or 0)
        discount = _safe_D(_get_attr(doc, "invoice_discount_wo_vat", 0) or 0)
        vat_tariff = _get_vat_tariff(doc, item=None)

        net_wo_vat = amount_wo - discount
        new_unit_price = (net_wo_vat / qty).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        ) if qty else net_wo_vat

        ext_price = _get_amount_with_vat(doc)

        lines.append(f'          <InvArticle>')
        lines.append(f'            {_tag("ArtCode", art_code)}')
        lines.append(f'            {_tag("StrFllCode", str_code)}')
        lines.append(f'            <Quantity>{_to_decimal_str(qty)}</Quantity>')
        lines.append(f'            <UntPrice>{_to_decimal_str(new_unit_price)}</UntPrice>')
        lines.append(f'            <Discount>0</Discount>')
        lines.append(f'            <VatTariff>{vat_tariff}</VatTariff>')
        lines.append(f'            <ExtPrice>{_to_decimal_str(ext_price)}</ExtPrice>')
        lines.append(f'          </InvArticle>')

        vat_codes = _build_vat_codes(doc, None, line_map)

    lines.append(f'        </Articles>')

    if vat_codes:
        lines.append(f'        <VatCodes>')
        for vc in vat_codes:
            lines.append(f'          <VatCode>')
            lines.append(f'            {_tag("Code", vc["code"])}')
            lines.append(f'            <TxbAmount>{vc["txb_amount"]}</TxbAmount>')
            lines.append(f'          </VatCode>')
        lines.append(f'        </VatCodes>')

    orig_filename = _s(_get_attr(doc, "original_filename", ""))
    preview_url = _s(_get_attr(doc, "preview_url", ""))
    if orig_filename and preview_url:
        lines.append(f'        <Attachments>')
        lines.append(f'          <Attachment>')
        lines.append(f'            {_tag("Name", orig_filename)}')
        lines.append(f'            {_tag("Url", preview_url)}')
        lines.append(f'          </Attachment>')
        lines.append(f'        </Attachments>')

    lines.append(f'      </invoice>')
    lines.append(f'    </InsertInvoice>')

    return _wrap_soap(key, "\n".join(lines) + "\n")


# =========================================================
# XML генерация: InsertPrcInvoice (pirkimas)
# =========================================================
def build_insert_prc_invoice_xml(
    *,
    key: str,
    doc,
    customuser=None,
    line_map: Optional[dict] = None,
) -> str:
    extra = _get_extra(customuser)
    separate_vat = bool(_get_attr(doc, "separate_vat", False))
    scan_type = _s(_get_attr(doc, "scan_type", "")).lower()
    is_sumiskai_separate = separate_vat and scan_type == "sumiskai"

    inv_date = _get_attr(doc, "invoice_date", None) or _get_attr(doc, "operation_date", None)
    doc_no = _build_ref_id(
        _s(_get_attr(doc, "document_series", "")),
        _s(_get_attr(doc, "document_number", "")),
    )

    seller_code = _get_party_code(doc, id_field="seller_id", vat_field="seller_vat_code",
                                   id_programoje_field="seller_id_programoje")
    seller_name = _s(_get_attr(doc, "seller_name", ""))
    seller_grp = _s(extra.get("tiekejo_grupe", "")) or "T"
    seller_city = _s(_get_attr(doc, "seller_city", "")) or "NA"
    seller_country = _s(_get_attr(doc, "seller_country_iso", "")) or "LT"
    notes = SEPARATE_VAT_NOTE if is_sumiskai_separate else ""

    dpr_code = _s(extra.get("pirk_skyriaus_kodas", ""))
    prj_code = _s(extra.get("pirk_projekto_kodas", ""))
    emp_code = _s(extra.get("pirk_atsakingo_darb_kodas", ""))

    line_items_qs = _get_attr(doc, "line_items", None)
    has_items = bool(line_items_qs and hasattr(line_items_qs, "all") and line_items_qs.exists())
    str_code = _s(extra.get("pirk_sandelio_kodas", "")) or "S"

    lines = []
    lines.append(f'    <InsertPrcInvoice {OPT_NS_ATTR}>')
    lines.append(f'      <prcInvoice>')
    lines.append(f'        <Date>{_to_datetime_str(inv_date)}</Date>')
    lines.append(f'        {_tag("No", doc_no)}')

    if dpr_code:
        lines.append(f'        {_tag("DprFllCode", dpr_code)}')
    if prj_code:
        lines.append(f'        {_tag("PrjFllCode", prj_code)}')
    if emp_code:
        lines.append(f'        {_tag("RspEmpCode", emp_code)}')

    lines.append(f'        <SplCompany>')
    lines.append(f'          {_tag("Code", seller_code)}')
    lines.append(f'          {_tag("Name", seller_name)}')
    lines.append(f'          {_tag("SplGrpFllCode", seller_grp)}')
    lines.append(f'          {_tag("CtName", seller_city)}')
    lines.append(f'          {_tag("CountryId", seller_country)}')
    lines.append(f'        </SplCompany>')

    if notes:
        lines.append(f'        {_tag("Notes", notes)}')

    lines.append(f'        <Articles>')

    if has_items:
        items_list = list(line_items_qs.all())
        line_discounts = _compute_line_discounts(doc, items_list)

        for i, item in enumerate(items_list):
            art_code = _get_product_code(item=item, doc=doc)
            qty = _safe_D(_get_attr(item, "quantity", 1) or 1)
            price = _safe_D(_get_attr(item, "price", 0) or 0)
            vat_pct = _safe_D(_get_attr(item, "vat_percent", 0) or 0)
            vat_tariff = _get_vat_tariff(doc, item=item)

            line_discount = line_discounts.get(i, Decimal("0"))
            line_total_wo_vat = (price * qty) - line_discount
            new_unit_price = (line_total_wo_vat / qty).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ) if qty else price

            line_vat = (line_total_wo_vat * vat_pct / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            ext_price = line_total_wo_vat + line_vat

            lines.append(f'          <PrcInvArticle>')
            lines.append(f'            {_tag("ArtCode", art_code)}')
            lines.append(f'            {_tag("StrFllCode", str_code)}')
            lines.append(f'            <UntCost>{_to_decimal_str(new_unit_price)}</UntCost>')
            lines.append(f'            <Quantity>{_to_decimal_str(qty)}</Quantity>')
            lines.append(f'            <UntPrice>{_to_decimal_str(new_unit_price)}</UntPrice>')
            lines.append(f'            <Discount>0</Discount>')
            lines.append(f'            <VatTariff>{vat_tariff}</VatTariff>')
            lines.append(f'            <ExtPrice>{_to_decimal_str(ext_price)}</ExtPrice>')
            lines.append(f'          </PrcInvArticle>')

        vat_codes = _build_vat_codes(doc, items_list, line_map)
    else:
        art_code = _get_product_code(item=None, doc=doc)
        qty = _safe_D(_get_attr(doc, "quantity", 1) or 1)
        amount_wo = _safe_D(_get_attr(doc, "amount_wo_vat", 0) or 0)
        discount = _safe_D(_get_attr(doc, "invoice_discount_wo_vat", 0) or 0)
        vat_tariff = _get_vat_tariff(doc, item=None)

        net_wo_vat = amount_wo - discount
        new_unit_price = (net_wo_vat / qty).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        ) if qty else net_wo_vat

        ext_price = _get_amount_with_vat(doc)

        lines.append(f'          <PrcInvArticle>')
        lines.append(f'            {_tag("ArtCode", art_code)}')
        lines.append(f'            {_tag("StrFllCode", str_code)}')
        lines.append(f'            <UntCost>{_to_decimal_str(new_unit_price)}</UntCost>')
        lines.append(f'            <Quantity>{_to_decimal_str(qty)}</Quantity>')
        lines.append(f'            <UntPrice>{_to_decimal_str(new_unit_price)}</UntPrice>')
        lines.append(f'            <Discount>0</Discount>')
        lines.append(f'            <VatTariff>{vat_tariff}</VatTariff>')
        lines.append(f'            <ExtPrice>{_to_decimal_str(ext_price)}</ExtPrice>')
        lines.append(f'          </PrcInvArticle>')

        vat_codes = _build_vat_codes(doc, None, line_map)

    lines.append(f'        </Articles>')

    if vat_codes:
        lines.append(f'        <VatCodes>')
        for vc in vat_codes:
            lines.append(f'          <VatCode>')
            lines.append(f'            {_tag("Code", vc["code"])}')
            lines.append(f'            <TxbAmount>{vc["txb_amount"]}</TxbAmount>')
            lines.append(f'          </VatCode>')
        lines.append(f'        </VatCodes>')

    orig_filename = _s(_get_attr(doc, "original_filename", ""))
    preview_url = _s(_get_attr(doc, "preview_url", ""))
    if orig_filename and preview_url:
        lines.append(f'        <Attachments>')
        lines.append(f'          <Attachment>')
        lines.append(f'            {_tag("Name", orig_filename)}')
        lines.append(f'            {_tag("Url", preview_url)}')
        lines.append(f'          </Attachment>')
        lines.append(f'        </Attachments>')

    lines.append(f'      </prcInvoice>')
    lines.append(f'    </InsertPrcInvoice>')

    return _wrap_soap(key, "\n".join(lines) + "\n")


# =========================================================
# SOAP dataclasses
# =========================================================
@dataclass
class SoapResult:
    """Результат одного SOAP запроса."""
    success: bool
    status: str = ""
    result: Optional[int] = None
    error: str = ""
    http_status: int = 0
    raw_response: str = ""
    exception: str = ""


@dataclass
class DocumentExportResult:
    """Результат экспорта одного документа."""
    doc_id: int
    overall_status: str = ""  # 'success' / 'partial_success' / 'error'
    article_results: list = field(default_factory=list)
    invoice_result: Optional[SoapResult] = None
    invoice_type: str = ""
    exception: str = ""


# =========================================================
# SOAP запрос + парсинг ответа
# =========================================================
def _send_soap_request(
    xml_body: str,
    soap_action: str,
    timeout: int = REQUEST_TIMEOUT,
) -> SoapResult:
    """Отправляет SOAP 1.1 запрос в Optimum API."""
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f'"{SOAP_ACTION_PREFIX}/{soap_action}"',
    }

    try:
        resp = requests.post(
            OPTIMUM_API_URL,
            data=xml_body.encode("utf-8"),
            headers=headers,
            timeout=timeout,
            verify=False,
        )
    except requests.exceptions.Timeout:
        return SoapResult(
            success=False, status="Error",
            error="Request timeout", exception="Timeout",
        )
    except requests.exceptions.ConnectionError as e:
        return SoapResult(
            success=False, status="Error",
            error=f"Connection error: {e}", exception=str(e),
        )
    except Exception as e:
        return SoapResult(
            success=False, status="Error",
            error=f"Request failed: {e}", exception=str(e),
        )

    return _parse_soap_response(resp, soap_action)


def _parse_soap_response(resp: requests.Response, soap_action: str) -> SoapResult:
    """Парсит SOAP ответ — извлекает Status, Result, Error."""
    result = SoapResult(
        success=False,
        http_status=resp.status_code,
        raw_response=resp.text[:2000],
    )

    if resp.status_code != 200:
        result.status = "Error"
        result.error = f"HTTP {resp.status_code}: {resp.text[:500]}"
        return result

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        result.status = "Error"
        result.error = f"XML parse error: {e}"
        result.exception = str(e)
        return result

    # Ищем InsertArticleResult / InsertInvoiceResult / InsertPrcInvoiceResult
    result_tag = f"{soap_action}Result"
    result_elem = None
    for elem in root.iter():
        local_name = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if local_name == result_tag:
            result_elem = elem
            break

    if result_elem is None:
        result.status = "Error"
        result.error = f"Response element <{result_tag}> not found"
        return result

    status_text = ""
    result_int = None
    error_text = ""

    for child in result_elem:
        local_name = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if local_name == "Status":
            status_text = (child.text or "").strip()
        elif local_name == "Result":
            try:
                result_int = int(child.text or "0")
            except (ValueError, TypeError):
                result_int = None
        elif local_name == "Error":
            error_text = (child.text or "").strip()

    result.status = status_text
    result.result = result_int
    result.error = error_text
    result.success = (status_text == "Success")

    return result


# =========================================================
# Экспорт одного документа в Optimum API
# =========================================================
def export_document_to_optimum(
    doc,
    key: str,
    customuser=None,
) -> DocumentExportResult:
    """
    Полный цикл экспорта одного документа:
      1. InsertArticle × N
      2. InsertInvoice или InsertPrcInvoice
      3. Определение overall_status
    """
    doc_id = _get_attr(doc, "id", None) or _get_attr(doc, "pk", 0)
    doc_type = _detect_document_type(doc)
    line_map = _get_attr(doc, "_pvm_line_map", None)

    export_result = DocumentExportResult(doc_id=doc_id)

    try:
        # --- 1) InsertArticle ---
        line_items_qs = _get_attr(doc, "line_items", None)
        has_items = bool(
            line_items_qs and hasattr(line_items_qs, "all") and line_items_qs.exists()
        )

        seen_codes = set()
        articles_to_send = []

        if has_items:
            for item in line_items_qs.all():
                code = _get_product_code(item=item, doc=doc)
                if code in seen_codes:
                    continue
                seen_codes.add(code)
                articles_to_send.append({
                    "item": item,
                    "code": code,
                    "name": (
                        _s(_get_attr(item, "prekes_pavadinimas", ""))
                        or _s(_get_attr(doc, "prekes_pavadinimas", ""))
                        or "Prekė"
                    ),
                    "barcode": (
                        _s(_get_attr(item, "prekes_barkodas", ""))
                        or _s(_get_attr(doc, "prekes_barkodas", ""))
                    ),
                })
        else:
            code = _get_product_code(item=None, doc=doc)
            articles_to_send.append({
                "item": None,
                "code": code,
                "name": _s(_get_attr(doc, "prekes_pavadinimas", "")) or "Prekė",
                "barcode": _s(_get_attr(doc, "prekes_barkodas", "")),
            })

        for art_info in articles_to_send:
            xml_body = build_insert_article_xml(
                key=key,
                item=art_info["item"],
                doc=doc,
                customuser=customuser,
                doc_type=doc_type,
            )
            soap_result = _send_soap_request(xml_body, "InsertArticle")

            export_result.article_results.append({
                "code": art_info["code"],
                "name": art_info["name"],
                "barcode": art_info["barcode"],
                "status": soap_result.status,
                "result": soap_result.result,
                "error": soap_result.error,
                "success": soap_result.success,
            })

            logger.info(
                "[OPTIMUM_API] InsertArticle code=%s status=%s result=%s error=%s",
                art_info["code"], soap_result.status,
                soap_result.result, soap_result.error or "-",
            )

        # --- 2) InsertInvoice / InsertPrcInvoice ---
        if doc_type == "pardavimas":
            invoice_xml = build_insert_invoice_xml(
                key=key, doc=doc, customuser=customuser, line_map=line_map,
            )
            soap_action = "InsertInvoice"
            export_result.invoice_type = "InsertInvoice"
        else:
            invoice_xml = build_insert_prc_invoice_xml(
                key=key, doc=doc, customuser=customuser, line_map=line_map,
            )
            soap_action = "InsertPrcInvoice"
            export_result.invoice_type = "InsertPrcInvoice"

        invoice_soap = _send_soap_request(invoice_xml, soap_action)
        export_result.invoice_result = invoice_soap

        logger.info(
            "[OPTIMUM_API] %s doc=%s status=%s result=%s error=%s",
            soap_action, doc_id, invoice_soap.status,
            invoice_soap.result, invoice_soap.error or "-",
        )

        # --- 3) overall_status ---
        has_article_errors = any(
            not a["success"] for a in export_result.article_results
        )

        if invoice_soap.success:
            if has_article_errors:
                export_result.overall_status = "partial_success"
            else:
                export_result.overall_status = "success"
        else:
            export_result.overall_status = "error"

    except Exception as e:
        logger.exception("[OPTIMUM_API] doc=%s unexpected error: %s", doc_id, e)
        export_result.overall_status = "error"
        export_result.exception = str(e)

    return export_result


# =========================================================
# Сохранение результата в БД
# =========================================================
def save_export_result(
    export_result: DocumentExportResult,
    user,
    session=None,
    program: str = "optimum",
) -> None:
    """
    Сохраняет результат в APIExportLog + APIExportArticleLog,
    обновляет ScannedDocument.
    """
    from docscanner_app.models import APIExportLog, APIExportArticleLog, ScannedDocument

    now = timezone.now()

    invoice = export_result.invoice_result
    if invoice is None:
        invoice_status = "Error"
        invoice_result_int = None
        invoice_error = export_result.exception or "No invoice sent"
    else:
        invoice_status = invoice.status
        invoice_result_int = invoice.result
        invoice_error = invoice.error

    export_log = APIExportLog.objects.create(
        user=user,
        document_id=export_result.doc_id,
        program=program,
        status=export_result.overall_status,
        invoice_type=export_result.invoice_type or "unknown",
        invoice_status=invoice_status,
        invoice_result=invoice_result_int,
        invoice_error=invoice_error,
        session=session,
    )

    article_logs = []
    for art in export_result.article_results:
        article_logs.append(APIExportArticleLog(
            export_log=export_log,
            article_name=art["name"][:255],
            article_code=art["code"][:100],
            status=art["status"][:10],
            result=art.get("result"),
            error=art.get("error", ""),
        ))
    if article_logs:
        APIExportArticleLog.objects.bulk_create(article_logs)

    # Обновляем ScannedDocument
    update_fields = {}
    if program == "optimum":
        update_fields = {
            "optimum_api_status": export_result.overall_status,
            "optimum_last_try_date": now,
        }

    if update_fields:
        ScannedDocument.objects.filter(pk=export_result.doc_id).update(**update_fields)

    logger.info(
        "[OPTIMUM_API] Saved export_log=%s doc=%s status=%s articles=%d",
        export_log.pk, export_result.doc_id,
        export_result.overall_status, len(article_logs),
    )


# =========================================================
# Hello — проверка API ключа
# =========================================================
def optimum_hello(api_key: str) -> str:
    """
    SOAP Hello — проверка валидности API ключа.
    Возвращает Result строку при успехе.
    Кидает OptimumError при ошибке.
    """
    action_xml = f'    <Hello {OPT_NS_ATTR} />\n'
    soap_body = _wrap_soap(api_key, action_xml)

    soap_result = _send_soap_request(soap_body, "Hello")

    if soap_result.exception:
        raise OptimumError(f"Ryšio klaida: {soap_result.exception}")

    if not soap_result.success:
        raise OptimumError(soap_result.error or "Hello patikrinimas nepavyko")

    return soap_result.result or "OK"