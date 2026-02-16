"""
Экспорт документов в формат Pragma 4.0 (E-Sąskaita XML).
Формат: XML UTF-8.  Поддерживает pirkimai и pardavimai.

Тип документа определяется из CP (counterparty), не из doc.pirkimas_pardavimas.
"""
import logging
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# =========================================================
# Константы
# =========================================================
EU_COUNTRIES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
}


# =========================================================
# Нормализация единиц (без точки, lowercase)
# =========================================================
_PRAGMA_CANON_UNITS = {
    "vnt":   {"vnt", "vnt.", "vnt ", "vnt. "},
    "val":   {"val", "val.", "val ", "val. "},
    "d":     {"d", "d.", "d ", "d. "},
    "kg":    {"kg", "kg "},
    "kompl": {"kompl", "kompl.", "komplektas", "komplektas."},
    "l":     {"l", "l "},
    "m":     {"m", "m "},
    "m2":    {"m2", "m²", "m^2"},
    "m3":    {"m3", "m³", "m^3"},
    "t":     {"t", "t "},
}

_PRAGMA_UNIT_MAP: Dict[str, str] = {}
for _canon, _variants in _PRAGMA_CANON_UNITS.items():
    for _v in _variants:
        _PRAGMA_UNIT_MAP[_v.strip().lower()] = _canon


def _normalize_unit(unit: str) -> str:
    u = _s(unit).strip()
    if not u:
        return "vnt"
    return _PRAGMA_UNIT_MAP.get(u.lower(), u.lower())


# =========================================================
# Базовые хелперы
# =========================================================
def _s(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _D(x) -> Decimal:
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _fmt(value, decimals=2) -> str:
    try:
        d = _D(value)
        pattern = Decimal(10) ** -decimals
        return str(d.quantize(pattern, rounding=ROUND_HALF_UP))
    except Exception:
        return "0." + "0" * decimals


def _date(obj) -> str:
    if not obj:
        return ""
    if isinstance(obj, str):
        return obj[:10]
    return obj.strftime("%Y-%m-%d")


def _truncate(value: str, limit: int) -> str:
    return value[:limit] if len(value) > limit else value


def _is_eu(iso_code) -> bool:
    if not iso_code:
        return False
    return str(iso_code).strip().upper() in EU_COUNTRIES


def _vat_rate_str(vat_percent) -> str:
    """vat_percent → строка. None / '' / 'Keli skirtingi PVM' → '0'."""
    if not vat_percent:
        return "0"
    s = str(vat_percent).strip()
    if s.lower().startswith("keli"):
        return "0"
    try:
        return str(int(_D(s)))
    except Exception:
        return "0"


def _preke_paslauga(value) -> str:
    """1,3 → '0' (prekė), 2,4 → '1' (paslauga)."""
    try:
        v = int(value)
        return "1" if v in (2, 4) else "0"
    except (ValueError, TypeError):
        return "0"


# =========================================================
# Определение doc_type из CP
# =========================================================
def _detect_doc_type(doc, cp) -> str:
    if not cp:
        return "pardavimas"

    cp_code = _s(getattr(cp, 'company_code', ''))
    if not cp_code:
        return "pardavimas"

    for f in ('buyer_id', 'buyer_vat_code', 'buyer_id_programoje'):
        if cp_code == _s(getattr(doc, f, '')):
            return "pirkimas"

    for f in ('seller_id', 'seller_vat_code', 'seller_id_programoje'):
        if cp_code == _s(getattr(doc, f, '')):
            return "pardavimas"

    pp = _s(getattr(doc, 'pirkimas_pardavimas', '')).lower()
    if pp in ('pirkimas', 'pardavimas'):
        return pp

    return "pardavimas"


# =========================================================
# Код контрагента (fallback: _id → _vat_code → _id_programoje)
# =========================================================
def _party_code(doc, prefix: str) -> str:
    for suffix in ('id', 'vat_code', 'id_programoje'):
        val = _s(getattr(doc, f'{prefix}{suffix}', ''))
        if val:
            return val
    return ""


# =========================================================
# Код товара
# =========================================================
def _product_code(item=None, doc=None) -> str:
    if item:
        c = _s(getattr(item, 'prekes_kodas', '')) or _s(getattr(item, 'prekes_barkodas', ''))
        if c:
            return c
    if doc:
        c = _s(getattr(doc, 'prekes_kodas', '')) or _s(getattr(doc, 'prekes_barkodas', ''))
        if c:
            return c
    return "PREKE001"


# =========================================================
# Extra fields
# =========================================================
def _extra(user) -> dict:
    if user is None:
        return {}
    d = getattr(user, 'pragma4_extra_fields', None)
    return d if isinstance(d, dict) else {}


# =========================================================
# i.SAF flag
# =========================================================
def _isaf_flag(doc) -> str:
    country = _s(getattr(doc, 'seller_country_iso', '')).upper()
    if _is_eu(country) or not country:
        return "1"

    items_qs = getattr(doc, 'line_items', None)
    if items_qs and hasattr(items_qs, 'all') and items_qs.exists():
        all_zero = all(_D(getattr(it, 'vat_percent', 0) or 0) == 0 for it in items_qs.all())
    else:
        all_zero = _D(getattr(doc, 'vat_percent', 0) or 0) == 0

    return "0" if all_zero else "1"


# =========================================================
# Самая частая ставка НДС из line_items
# =========================================================
def _most_common_vat(items_list: list) -> str:
    if not items_list:
        return "0"
    rates = []
    for it in items_list:
        vp = getattr(it, 'vat_percent', None)
        if vp is not None:
            try:
                rates.append(str(int(_D(vp))))
            except Exception:
                pass
    if not rates:
        return "0"
    return Counter(rates).most_common(1)[0][0]


# =========================================================
# Распределение скидки на строки
# =========================================================
def _distribute_discount(doc, items: list) -> dict:
    raw = getattr(doc, 'invoice_discount_wo_vat', None)
    if not raw:
        return {}
    try:
        disc = Decimal(str(raw))
    except (ValueError, InvalidOperation):
        return {}
    if disc <= 0:
        return {}

    totals = []
    grand = Decimal("0")
    for it in items:
        qty = _D(getattr(it, 'quantity', 1) or 1)
        price = _D(getattr(it, 'price', 0) or 0)
        lt = price * qty
        totals.append(lt)
        grand += lt

    if grand <= 0:
        return {}

    result = {}
    used = Decimal("0")
    for i, lt in enumerate(totals):
        if i == len(totals) - 1:
            result[i] = disc - used
        else:
            part = (disc * lt / grand).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            result[i] = part
            used += part
    return result


# =========================================================
# Номер документа (серия + номер)
# =========================================================
def _doc_full_number(doc) -> str:
    series = _s(getattr(doc, 'document_series', '')).replace(' ', '')
    number = _s(getattr(doc, 'document_number', '')).replace(' ', '')
    if series and number:
        if number.upper().startswith(series.upper()):
            return number
        return f"{series}{number}"
    return number or series or ""


# =========================================================
# XML indent
# =========================================================
def _indent(elem, level=0):
    i = "\n" + "  " * level
    if len(elem):
        if not (elem.text and elem.text.strip()):
            elem.text = i + "  "
        for child in elem:
            _indent(child, level + 1)
        if not (elem.tail and elem.tail.strip()):
            elem.tail = i
    else:
        if not (elem.tail and elem.tail.strip()):
            elem.tail = i


# =========================================================
# Party builders
# =========================================================
def _party_from_doc(parent, tag: str, doc, prefix: str):
    p = ET.SubElement(parent, tag)

    name = _s(getattr(doc, f'{prefix}name', '')) or 'Nežinoma'
    ET.SubElement(p, "Name").text = _truncate(name, 255)
    ET.SubElement(p, "RegNumber").text = _truncate(_party_code(doc, prefix), 50)

    vat_code = _truncate(_s(getattr(doc, f'{prefix}vat_code', '')), 50)
    if vat_code:
        ET.SubElement(p, "VATRegNumber").text = vat_code

    contact = ET.SubElement(p, "ContactData")
    email = _s(getattr(doc, f'{prefix}email', ''))
    if email:
        ET.SubElement(contact, "E-mailAddress").text = _truncate(email, 100)

    legal = ET.SubElement(contact, "LegalAddress")
    addr = _s(getattr(doc, f'{prefix}address', ''))
    if addr:
        ET.SubElement(legal, "PostalAddress1").text = _truncate(addr, 100)
    city = _s(getattr(doc, f'{prefix}city', ''))
    if city:
        ET.SubElement(legal, "City").text = _truncate(city, 50)
    country = _s(getattr(doc, f'{prefix}country', ''))
    if country:
        ET.SubElement(legal, "Country").text = _truncate(country, 50)
    iso = _s(getattr(doc, f'{prefix}country_iso', '')).upper()
    if iso:
        ET.SubElement(legal, "CountryCode").text = _truncate(iso, 2)
        pc = _s(getattr(doc, f'{prefix}post_code', ''))
        if pc:
            ET.SubElement(legal, "PostCode").text = _truncate(pc, 20)
        if _is_eu(iso):
            ET.SubElement(legal, "CountryEU").text = "1"


def _party_from_cp(parent, tag: str, cp):
    p = ET.SubElement(parent, tag)

    name = _s(getattr(cp, 'name', '')) or 'Nežinoma'
    ET.SubElement(p, "Name").text = _truncate(name, 255)
    ET.SubElement(p, "RegNumber").text = _truncate(_s(getattr(cp, 'company_code', '')), 50)

    vat_code = _truncate(_s(getattr(cp, 'vat_code', '')), 50)
    if vat_code:
        ET.SubElement(p, "VATRegNumber").text = vat_code

    contact = ET.SubElement(p, "ContactData")
    email = _s(getattr(cp, 'email', ''))
    if email:
        ET.SubElement(contact, "E-mailAddress").text = _truncate(email, 100)

    legal = ET.SubElement(contact, "LegalAddress")
    addr = _s(getattr(cp, 'address', ''))
    if addr:
        ET.SubElement(legal, "PostalAddress1").text = _truncate(addr, 100)
    city = _s(getattr(cp, 'city', ''))
    if city:
        ET.SubElement(legal, "City").text = _truncate(city, 50)
    country = _s(getattr(cp, 'country', ''))
    if country:
        ET.SubElement(legal, "Country").text = _truncate(country, 50)
    iso = _s(getattr(cp, 'country_iso', '')).upper()
    if iso:
        ET.SubElement(legal, "CountryCode").text = _truncate(iso, 2)
        pc = _s(getattr(cp, 'post_code', ''))
        if pc:
            ET.SubElement(legal, "PostCode").text = _truncate(pc, 20)
        if _is_eu(iso):
            ET.SubElement(legal, "CountryEU").text = "1"


# =========================================================
# InvoiceInformation
# =========================================================
def _build_info(invoice_el, doc):
    info = ET.SubElement(invoice_el, "InvoiceInformation")

    t = ET.SubElement(info, "Type")
    t.set("type", "DEB")

    series = _truncate(_s(getattr(doc, 'document_series', '')), 10)
    if series:
        ET.SubElement(info, "DocumentName").text = series

    ET.SubElement(info, "InvoiceNumber").text = _truncate(
        _s(getattr(doc, 'document_number', '')), 15
    ) or "0"

    preview_url = _s(getattr(doc, 'preview_url', ''))
    if preview_url:
        ET.SubElement(info, "InvoiceContentText").text = preview_url

    ET.SubElement(info, "InvoiceDate").text = _date(getattr(doc, 'invoice_date', None))

    due_date = _date(getattr(doc, 'due_date', None))
    if due_date:
        ET.SubElement(info, "DueDate").text = due_date

    # Расширения Pragma
    ET.SubElement(info, "InvoiceType").text = "SF"
    ET.SubElement(info, "Registry").text = _isaf_flag(doc)
    # FR0564 — заготовка, раскомментировать при необходимости:
    # ET.SubElement(info, "FR0564").text = ""
    # PayBackDocumentNumber — заготовка:
    # ET.SubElement(info, "PayBackDocumentNumber").text = ""


# =========================================================
# InvoiceSumGroup
# =========================================================
def _build_sum_group(invoice_el, doc, items_list=None):
    sg = ET.SubElement(invoice_el, "InvoiceSumGroup")

    vat_amount = _D(getattr(doc, 'vat_amount', 0) or 0)
    amount_with = _D(getattr(doc, 'amount_with_vat', 0) or 0)
    currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()

    if items_list:
        discounts = _distribute_discount(doc, items_list)
        inv_sum = Decimal("0")
        for i, it in enumerate(items_list):
            qty = _D(getattr(it, 'quantity', 1) or 1)
            price = _D(getattr(it, 'price', 0) or 0)
            inv_sum += (price * qty) - discounts.get(i, Decimal("0"))
        ET.SubElement(sg, "InvoiceSum").text = _fmt(inv_sum)
        vat_rate = _most_common_vat(items_list)
    else:
        ET.SubElement(sg, "InvoiceSum").text = _fmt(
            _D(getattr(doc, 'amount_wo_vat', 0) or 0)
        )
        vat_rate = _vat_rate_str(getattr(doc, 'vat_percent', None))

    vat_el = ET.SubElement(sg, "VAT")
    vat_el.set("vatId", "TAX")
    ET.SubElement(vat_el, "VATRate").text = vat_rate
    ET.SubElement(vat_el, "VATSum").text = _fmt(vat_amount)

    ET.SubElement(sg, "TotalVATSum").text = _fmt(vat_amount)
    ET.SubElement(sg, "TotalSum").text = _fmt(amount_with)
    ET.SubElement(sg, "TotalToPay").text = _fmt(amount_with)
    ET.SubElement(sg, "Currency").text = currency


# =========================================================
# ItemEntry — detaliai
# =========================================================
def _item_entry_detaliai(group, item, row, doc, line_disc, ex_prefix, ex):
    entry = ET.SubElement(group, "ItemEntry")

    ET.SubElement(entry, "RowNo").text = str(row)

    code = _truncate(_product_code(item, doc), 20)
    ET.SubElement(entry, "SerialNumber").text = code
    ET.SubElement(entry, "SellerProductId").text = code

    desc = _s(getattr(item, 'prekes_pavadinimas', '')) \
        or _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
    ET.SubElement(entry, "Description").text = _truncate(desc, 150)

    pp = getattr(item, 'preke_paslauga', None) or getattr(doc, 'preke_paslauga', None)
    ET.SubElement(entry, "Type").text = _preke_paslauga(pp)

    # Extra fields (только если не пусто)
    for key, tag in (
        (f"{ex_prefix}sandelio_kodas", "WarehouseID"),
        (f"{ex_prefix}projekto_kodas", "ProjectID"),
        (f"{ex_prefix}centro_kodas", "PurposeID"),
        (f"{ex_prefix}dk_schemos_kodas", "AccSchemeID"),
    ):
        val = _s(ex.get(key, ""))
        if val:
            ET.SubElement(entry, tag).text = val

    # ItemDetailInfo
    detail = ET.SubElement(entry, "ItemDetailInfo")
    ET.SubElement(detail, "ItemUnit").text = _truncate(
        _normalize_unit(_s(getattr(item, 'unit', ''))), 10
    )

    qty = _D(getattr(item, 'quantity', 1) or 1)
    ET.SubElement(detail, "ItemAmount").text = _fmt(qty, 4)

    price = _D(getattr(item, 'price', 0) or 0)
    orig_sum = price * qty
    new_sum = orig_sum - line_disc

    if qty > 0:
        new_price = (new_sum / qty).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
    else:
        new_price = Decimal("0")

    ET.SubElement(detail, "ItemPrice").text = _fmt(new_price, 8)

    # ItemSum
    item_sum = new_price * qty
    ET.SubElement(entry, "ItemSum").text = _fmt(item_sum)

    # VAT
    vat = ET.SubElement(entry, "VAT")
    ET.SubElement(vat, "SumBeforeVAT").text = _fmt(item_sum)
    ET.SubElement(vat, "VATRate").text = _vat_rate_str(getattr(item, 'vat_percent', None))

    vat_pct = _D(getattr(item, 'vat_percent', 0) or 0)
    if vat_pct > 0 and item_sum > 0:
        new_vat = (item_sum * vat_pct / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    else:
        new_vat = Decimal("0")
    ET.SubElement(vat, "VATSum").text = _fmt(new_vat)
    ET.SubElement(vat, "SumAfterVAT").text = _fmt(item_sum + new_vat)


# =========================================================
# ItemEntry — sumiskai
# =========================================================
def _item_entry_sumiskai(group, doc, ex_prefix, ex):
    entry = ET.SubElement(group, "ItemEntry")

    ET.SubElement(entry, "RowNo").text = "1"

    code = _truncate(_product_code(None, doc), 20)
    ET.SubElement(entry, "SerialNumber").text = code
    ET.SubElement(entry, "SellerProductId").text = code

    desc = _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
    ET.SubElement(entry, "Description").text = _truncate(desc, 150)

    ET.SubElement(entry, "Type").text = _preke_paslauga(getattr(doc, 'preke_paslauga', None))

    for key, tag in (
        (f"{ex_prefix}sandelio_kodas", "WarehouseID"),
        (f"{ex_prefix}projekto_kodas", "ProjectID"),
        (f"{ex_prefix}centro_kodas", "PurposeID"),
        (f"{ex_prefix}dk_schemos_kodas", "AccSchemeID"),
    ):
        val = _s(ex.get(key, ""))
        if val:
            ET.SubElement(entry, tag).text = val

    detail = ET.SubElement(entry, "ItemDetailInfo")
    ET.SubElement(detail, "ItemUnit").text = _truncate(
        _normalize_unit(_s(getattr(doc, 'unit', ''))), 10
    )
    ET.SubElement(detail, "ItemAmount").text = "1.0000"

    amount_wo = _D(getattr(doc, 'amount_wo_vat', 0) or 0)
    ET.SubElement(detail, "ItemPrice").text = _fmt(amount_wo, 8)
    ET.SubElement(entry, "ItemSum").text = _fmt(amount_wo)

    vat = ET.SubElement(entry, "VAT")
    ET.SubElement(vat, "SumBeforeVAT").text = _fmt(amount_wo)

    separate = getattr(doc, 'separate_vat', False)
    ET.SubElement(vat, "VATRate").text = "0" if separate else _vat_rate_str(
        getattr(doc, 'vat_percent', None)
    )

    ET.SubElement(vat, "VATSum").text = _fmt(_D(getattr(doc, 'vat_amount', 0) or 0))
    ET.SubElement(vat, "SumAfterVAT").text = _fmt(_D(getattr(doc, 'amount_with_vat', 0) or 0))


# =========================================================
# InvoiceItem
# =========================================================
def _build_items(invoice_el, doc, doc_type, ex, items_list=None):
    inv_item = ET.SubElement(invoice_el, "InvoiceItem")
    group = ET.SubElement(inv_item, "InvoiceItemGroup")

    prefix = "pirk_" if doc_type == "pirkimas" else "pard_"

    if items_list:
        discounts = _distribute_discount(doc, items_list)
        for i, it in enumerate(items_list):
            _item_entry_detaliai(group, it, i + 1, doc, discounts.get(i, Decimal("0")), prefix, ex)
    else:
        _item_entry_sumiskai(group, doc, prefix, ex)


# =========================================================
# PaymentInfo
# =========================================================
def _build_payment(invoice_el, doc, doc_type, cp):
    pay = ET.SubElement(invoice_el, "PaymentInfo")

    currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
    ET.SubElement(pay, "Currency").text = currency

    ET.SubElement(pay, "PaymentDescription").text = \
        f"Apmokėjimas pagal sąskaitą Nr. {_doc_full_number(doc)}"

    ET.SubElement(pay, "Payable").text = "YES"

    due_date = _date(getattr(doc, 'due_date', None))
    if due_date:
        ET.SubElement(pay, "PayDueDate").text = due_date

    ET.SubElement(pay, "PaymentTotalSum").text = _fmt(
        _D(getattr(doc, 'amount_with_vat', 0) or 0)
    )

    # PaymentId — заготовка:
    # ET.SubElement(pay, "PaymentId").text = ""

    if doc_type == "pardavimas":
        iban = _s(getattr(cp, 'iban', ''))
        name = _s(getattr(cp, 'name', ''))
    else:
        iban = _s(getattr(doc, 'seller_iban', ''))
        name = _s(getattr(doc, 'seller_name', ''))

    if iban:
        ET.SubElement(pay, "PayToAccount").text = _truncate(iban, 40)
    if name:
        ET.SubElement(pay, "PayToName").text = _truncate(name, 255)


# =========================================================
# Один <Invoice>
# =========================================================
def _build_invoice(doc, index: int, doc_type: str, cp, ex: dict):
    inv = ET.Element("Invoice")

    inv.set("invoiceId", str(index))
    inv.set("invoiceGlobUniqId", str(index))
    inv.set("presentment", "YES")

    if doc_type == "pirkimas":
        reg = _party_code(doc, 'seller_')
        seller_reg = reg
    else:
        reg = _party_code(doc, 'buyer_')
        seller_reg = _s(getattr(cp, 'company_code', ''))

    inv.set("regNumber", _truncate(reg, 50))
    inv.set("sellerRegNumber", _truncate(seller_reg, 50))

    # Parties
    parties = ET.SubElement(inv, "InvoiceParties")
    if doc_type == "pirkimas":
        _party_from_doc(parties, "SellerParty", doc, "seller_")
        _party_from_cp(parties, "BuyerParty", cp)
    else:
        _party_from_cp(parties, "SellerParty", cp)
        _party_from_doc(parties, "BuyerParty", doc, "buyer_")

    # InvoiceInformation
    _build_info(inv, doc)

    # line_items
    items_qs = getattr(doc, 'line_items', None)
    has_items = bool(items_qs and hasattr(items_qs, 'all') and items_qs.exists())
    items_list = list(items_qs.all()) if has_items else None

    # InvoiceSumGroup
    _build_sum_group(inv, doc, items_list)

    # InvoiceItem
    _build_items(inv, doc, doc_type, ex, items_list)

    # PaymentInfo
    _build_payment(inv, doc, doc_type, cp)

    return inv


# =========================================================
# Генерация XML
# =========================================================
def _build_xml(documents: list, cp, user=None, type_filter: Optional[str] = None) -> bytes:
    ex = _extra(user)

    root = ET.Element("E_Invoice")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")

    header = ET.SubElement(root, "Header")
    now = datetime.now()
    ET.SubElement(header, "Date").text = now.strftime("%Y%m%d")
    ET.SubElement(header, "FileId").text = now.strftime("%Y-%m-%dT%H:%M:%S")
    ET.SubElement(header, "AppId").text = "EINVOICE"
    ET.SubElement(header, "Version").text = "1.1"

    total_count = 0
    total_amount = Decimal("0")
    idx = 1

    for doc in documents:
        dt = _detect_doc_type(doc, cp)
        if type_filter and dt != type_filter:
            continue

        inv = _build_invoice(doc, idx, dt, cp, ex)
        root.append(inv)

        total_count += 1
        total_amount += _D(getattr(doc, 'amount_with_vat', 0) or 0)
        idx += 1

    footer = ET.SubElement(root, "Footer")
    ET.SubElement(footer, "TotalNumberInvoices").text = str(total_count)
    ET.SubElement(footer, "TotalAmount").text = _fmt(total_amount)

    _indent(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True, short_empty_elements=False)


# =========================================================
# Публичные функции
# =========================================================
def export_to_pragma40_xml(
    documents: list,
    counterparty,
    user=None,
) -> Dict[str, bytes]:
    """
    Основная функция экспорта Pragma 4.0.

    Args:
        documents: документы для экспорта
        counterparty: CP (своя фирма)
        user: пользователь (для pragma4_extra_fields)

    Returns:
        {"pirkimai": xml_bytes} и/или {"pardavimai": xml_bytes}

    Raises:
        ValueError: если не передан counterparty
    """
    if not documents:
        logger.warning("[PRAGMA40] No documents")
        return {}

    if not counterparty:
        raise ValueError("Counterparty (CP) is required for Pragma 4.0 export")

    pirk, pard = [], []
    for doc in documents:
        dt = _detect_doc_type(doc, counterparty)
        (pirk if dt == "pirkimas" else pard).append(doc)

    logger.info("[PRAGMA40] Split: pirkimai=%d, pardavimai=%d", len(pirk), len(pard))

    result = {}
    if pirk:
        result["pirkimai"] = _build_xml(pirk, counterparty, user, "pirkimas")
        logger.info("[PRAGMA40] Pirkimai XML: %d docs, %d bytes", len(pirk), len(result["pirkimai"]))
    if pard:
        result["pardavimai"] = _build_xml(pard, counterparty, user, "pardavimas")
        logger.info("[PRAGMA40] Pardavimai XML: %d docs, %d bytes", len(pard), len(result["pardavimai"]))

    return result