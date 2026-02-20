"""
APSA Export Module for DokSkenas
================================

Экспорт документов в формат i.SAF 1.2 XML для программы APSA.

ВАЖНО: APSA использует ТОЛЬКО стандартный i.SAF формат.
НЕТ дополнительных полей типа "objektas", "padalinys", "sandelis" и т.д.

i.SAF содержит только СУММАРНЫЕ данные по документу (DocumentTotals),
НЕ содержит отдельных строк товаров.
"""

import logging
import re
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import List, Dict, Optional
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


# =============================================================================
# КОНСТАНТЫ
# =============================================================================

ISAF_VERSION = "iSAF1.2"
ISAF_NAMESPACE = "http://www.vmi.lt/cms/imas/isaf"

SOFTWARE_COMPANY = "DokSkenas"
SOFTWARE_NAME = "DokSkenas"
SOFTWARE_VERSION = "1.0"

DATA_TYPE_FULL = "F"       # pirkimas + pardavimas
DATA_TYPE_SALES = "S"      # только pardavimas
DATA_TYPE_PURCHASE = "P"   # только pirkimas


# =============================================================================
# XSD ЛИМИТЫ
# =============================================================================

class Limits:
    MIDDLE_TEXT = 24           # SoftwareVersion
    MIDDLE1_TEXT = 35          # VATRegistrationNumber, RegistrationNumber
    MIDDLE2_TEXT = 70          # InvoiceNo, SupplierID, CustomerID
    LONG_TEXT = 256            # Name
    REGISTRATION_NUMBER = 11   # ИНН компании (цифры)
    COUNTRY_CODE = 2           # ISO код страны
    TAX_CODE_MIN = 4           # PVM код минимум
    TAX_CODE_MAX = 6           # PVM код максимум


# =============================================================================
# HELPERS
# =============================================================================

def _s(v) -> str:
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def _safe_decimal(x) -> Decimal:
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def truncate_str(value: str, max_length: int) -> str:
    """Обрезает строку до лимита XSD."""
    s = _s(value)
    return s[:max_length] if len(s) > max_length else s


def validate_tax_code(tax_code: str) -> Optional[str]:
    """Валидирует PVM код: pattern PVM[0-9]+, длина 4-6."""
    if not tax_code:
        return None
    code = _s(tax_code).upper()
    if not re.match(r'^PVM\d+$', code):
        return None
    if len(code) < Limits.TAX_CODE_MIN or len(code) > Limits.TAX_CODE_MAX:
        return None
    return code


def validate_country_code(country: str) -> str:
    """Валидирует ISO код страны (ровно 2 символа)."""
    code = _s(country).upper()
    return code if len(code) == Limits.COUNTRY_CODE else ""


def validate_registration_number(reg_num: str) -> str:
    """Валидирует ИНН (до 11 цифр)."""
    digits = re.sub(r'\D', '', _s(reg_num))
    return digits[:Limits.REGISTRATION_NUMBER]


def build_dok_nr(series: str, number: str) -> str:
    """Формирует номер документа из серии и номера."""
    s = _s(series)
    n = _s(number)

    if not s:
        return n
    if not n:
        return s

    if n.upper().startswith(s.upper()):
        tail = n[len(s):].lstrip("-/ .")
        return f"{s}{tail}"

    return f"{s}{n}"


def get_party_code(doc, role: str) -> str:
    """Код контрагента: id → vat_code → id_programoje"""
    if role == "seller":
        return _s(getattr(doc, "seller_id", None)) or _s(getattr(doc, "seller_vat_code", None)) or _s(getattr(doc, "seller_id_programoje", None)) or ""
    else:
        return _s(getattr(doc, "buyer_id", None)) or _s(getattr(doc, "buyer_vat_code", None)) or _s(getattr(doc, "buyer_id_programoje", None)) or ""


def _format_decimal(value, decimals: int = 2) -> str:
    """Форматирует Decimal: 123.45"""
    try:
        d = Decimal(str(value))
        rounded = d.quantize(Decimal(10) ** -decimals, rounding=ROUND_HALF_UP)
        return str(rounded)
    except Exception:
        return "0.00"


def _format_date(dt) -> str:
    """Форматирует дату: YYYY-MM-DD"""
    if not dt:
        return ""
    if isinstance(dt, str):
        for fmt in ["%Y-%m-%d", "%Y.%m.%d", "%d.%m.%Y", "%d/%m/%Y"]:
            try:
                dt = datetime.strptime(dt, fmt).date()
                break
            except ValueError:
                continue
        else:
            return ""
    if isinstance(dt, (date, datetime)):
        return dt.strftime("%Y-%m-%d")
    return ""


def _format_datetime(dt=None) -> str:
    """Форматирует datetime: YYYY-MM-DDTHH:MM:SS"""
    if dt is None:
        dt = datetime.now()
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


# =============================================================================
# ЛОГИКА TaxCode / TaxPercentage
# =============================================================================

def get_unified_vat_percent(doc) -> Optional[Decimal]:
    """
    Возвращает единый vat_percent для документа.
    
    Если есть line_items:
        - Проверяем все line_items
        - Если все vat_percent одинаковые → возвращаем его
        - Если разные → возвращаем None
    
    Если нет line_items:
        - Возвращаем doc.vat_percent
    
    Returns:
        Decimal или None
    """
    line_items = getattr(doc, "line_items", None)
    has_items = line_items and hasattr(line_items, "exists") and line_items.exists()
    
    if not has_items:
        # SUMISKAI - берём из документа
        vat_pct = getattr(doc, "vat_percent", None)
        if vat_pct is not None:
            return _safe_decimal(vat_pct)
        return None
    
    # DETALIAI - проверяем все line_items
    vat_percents = set()
    
    for item in line_items.all():
        vat_pct = getattr(item, "vat_percent", None)
        if vat_pct is not None:
            vat_percents.add(_safe_decimal(vat_pct))
    
    # Если все одинаковые - возвращаем, иначе None
    if len(vat_percents) == 1:
        return vat_percents.pop()
    
    return None


def get_unified_pvm_kodas(doc, pvm_resolver: dict = None) -> Optional[str]:
    """
    Возвращает единый pvm_kodas для документа из CP данных.
    
    Если есть line_items:
        - Проверяем pvm_kodas из pvm_resolver для каждого item
        - Если все одинаковые → возвращаем его
        - Если разные → возвращаем None
    
    Если нет line_items:
        - Возвращаем pvm_kodas из pvm_resolver или doc
    
    Returns:
        str (валидный PVM код) или None
    """
    if pvm_resolver is None:
        pvm_resolver = {}
    
    line_items = getattr(doc, "line_items", None)
    has_items = line_items and hasattr(line_items, "exists") and line_items.exists()
    
    if not has_items:
        # SUMISKAI - берём из resolver или doc
        pvm_kodas = _s(pvm_resolver.get("pvm_kodas", ""))
        if not pvm_kodas:
            pvm_kodas = _s(getattr(doc, "pvm_kodas", ""))
        
        if pvm_kodas == "Keli skirtingi PVM":
            return None
        
        return validate_tax_code(pvm_kodas)
    
    # DETALIAI - проверяем все line_items через resolver
    pvm_codes = set()
    
    for item in line_items.all():
        item_id = item.id
        
        if item_id in pvm_resolver:
            pvm_kod = _s(pvm_resolver[item_id].get("pvm_kodas", ""))
        else:
            # Fallback на БД
            pvm_kod = _s(getattr(item, "pvm_kodas", ""))
        
        if pvm_kod and pvm_kod != "Keli skirtingi PVM":
            pvm_codes.add(pvm_kod)
    
    # Если все одинаковые - возвращаем, иначе None
    if len(pvm_codes) == 1:
        return validate_tax_code(pvm_codes.pop())
    
    return None


def _get_tax_fields(doc, pvm_resolver: dict = None) -> dict:
    """
    Определяет TaxCode и TaxPercentage.
    
    TaxPercentage: из БД (line_items или doc.vat_percent)
    TaxCode: из CP resolver (pvm_kodas)
    
    Returns:
        {"tax_code": str|None, "tax_percentage": Decimal|None}
    """
    return {
        "tax_code": get_unified_pvm_kodas(doc, pvm_resolver),
        "tax_percentage": get_unified_vat_percent(doc),
    }


# =============================================================================
# XML BUILDER
# =============================================================================

def _create_element(parent: ET.Element, tag: str, text: str = None) -> ET.Element:
    """Создаёт XML элемент."""
    elem = ET.SubElement(parent, tag)
    if text is not None:
        elem.text = str(text)
    return elem


def _create_nillable_element(parent: ET.Element, tag: str, value) -> ET.Element:
    """Создаёт элемент с xsi:nil="true" если пустой."""
    elem = ET.SubElement(parent, tag)
    v = _s(value) if value is not None else ""
    if v:
        elem.text = v
    else:
        elem.set("xsi:nil", "true")
    return elem


def _build_header(
    root: ET.Element,
    registration_number: str,
    start_date: date,
    end_date: date,
    data_type: str,
) -> ET.Element:
    """Строит Header. registration_number = код выбранного контрагента из CP."""
    header = _create_element(root, "Header")
    file_desc = _create_element(header, "FileDescription")
    
    _create_element(file_desc, "FileVersion", ISAF_VERSION)
    _create_element(file_desc, "FileDateCreated", _format_datetime())
    _create_element(file_desc, "DataType", data_type)
    _create_element(file_desc, "SoftwareCompanyName", truncate_str(SOFTWARE_COMPANY, Limits.LONG_TEXT))
    _create_element(file_desc, "SoftwareName", truncate_str(SOFTWARE_NAME, Limits.LONG_TEXT))
    _create_element(file_desc, "SoftwareVersion", truncate_str(SOFTWARE_VERSION, Limits.MIDDLE_TEXT))
    _create_element(file_desc, "RegistrationNumber", validate_registration_number(registration_number))
    _create_element(file_desc, "NumberOfParts", "1")
    _create_element(file_desc, "PartNumber", "1")
    
    selection = _create_element(file_desc, "SelectionCriteria")
    _create_element(selection, "SelectionStartDate", _format_date(start_date))
    _create_element(selection, "SelectionEndDate", _format_date(end_date))
    
    return header


def _merge_party_data(base: dict, incoming: dict) -> dict:
    """Merge party fields, preferring existing values and filling blanks from incoming."""
    for field in ["vat", "reg", "country", "name"]:
        if not base.get(field) and incoming.get(field):
            base[field] = incoming[field]
    return base


def _collect_parties(docs: List, role: str) -> Dict[str, dict]:
    """Collect unique parties (by SupplierID/CustomerID) from documents."""
    parties: Dict[str, dict] = {}

    for doc in docs:
        party_id = get_party_code(doc, role)
        if not party_id:
            continue

        if role == "seller":
            data = {
                "id": party_id,
                "vat": _s(getattr(doc, "seller_vat_code", "")),
                "reg": _s(getattr(doc, "seller_id", "")),
                "country": validate_country_code(getattr(doc, "seller_country_iso", "")),
                "name": _s(getattr(doc, "seller_name", "")),
            }
        else:
            data = {
                "id": party_id,
                "vat": _s(getattr(doc, "buyer_vat_code", "")),
                "reg": _s(getattr(doc, "buyer_id", "")),
                "country": validate_country_code(getattr(doc, "buyer_country_iso", "")),
                "name": _s(getattr(doc, "buyer_name", "")),
            }

        existing = parties.get(party_id)
        if existing:
            parties[party_id] = _merge_party_data(existing, data)
        else:
            parties[party_id] = data

    return parties


def _build_master_supplier(parent: ET.Element, data: dict) -> ET.Element:
    """Supplier in MasterFiles."""
    supplier = _create_element(parent, "Supplier")

    _create_element(supplier, "SupplierID", truncate_str(data["id"], Limits.MIDDLE2_TEXT))

    vat_code = _s(data.get("vat", ""))
    _create_element(supplier, "VATRegistrationNumber",
                   truncate_str(vat_code, Limits.MIDDLE1_TEXT) if vat_code else "ND")

    reg_num = _s(data.get("reg", ""))
    if reg_num:
        _create_element(supplier, "RegistrationNumber", truncate_str(reg_num, Limits.MIDDLE1_TEXT))
    elif not vat_code:
        _create_element(supplier, "RegistrationNumber", "ND")

    country = validate_country_code(data.get("country", ""))
    _create_element(supplier, "Country", country or "LT")

    name = _s(data.get("name", ""))
    _create_element(supplier, "Name", truncate_str(name, Limits.LONG_TEXT) if name else "ND")

    return supplier


def _build_master_customer(parent: ET.Element, data: dict) -> ET.Element:
    """Customer in MasterFiles."""
    customer = _create_element(parent, "Customer")

    _create_element(customer, "CustomerID", truncate_str(data["id"], Limits.MIDDLE2_TEXT))

    vat_code = _s(data.get("vat", ""))
    _create_element(customer, "VATRegistrationNumber",
                   truncate_str(vat_code, Limits.MIDDLE1_TEXT) if vat_code else "ND")

    reg_num = _s(data.get("reg", ""))
    if reg_num:
        _create_element(customer, "RegistrationNumber", truncate_str(reg_num, Limits.MIDDLE1_TEXT))
    elif not vat_code:
        _create_element(customer, "RegistrationNumber", "ND")

    country = validate_country_code(data.get("country", ""))
    _create_element(customer, "Country", country or "LT")

    name = _s(data.get("name", ""))
    _create_element(customer, "Name", truncate_str(name, Limits.LONG_TEXT) if name else "ND")

    return customer


def _build_masterfiles(root: ET.Element, purchase_docs: List, sales_docs: List) -> ET.Element:
    """MasterFiles with unique Suppliers and Customers."""
    master = _create_element(root, "MasterFiles")

    customers_el = _create_element(master, "Customers")
    suppliers_el = _create_element(master, "Suppliers")

    customers = _collect_parties(sales_docs, role="buyer")
    suppliers = _collect_parties(purchase_docs, role="seller")

    for key in sorted(customers.keys()):
        _build_master_customer(customers_el, customers[key])

    for key in sorted(suppliers.keys()):
        _build_master_supplier(suppliers_el, suppliers[key])

    return master



def _build_supplier_info(parent: ET.Element, doc) -> ET.Element:
    """SupplierInfo для PurchaseInvoice."""
    info = _create_element(parent, "SupplierInfo")
    
    # SupplierID = get_party_code(seller)
    supplier_id = get_party_code(doc, "seller")
    if supplier_id:
        _create_element(info, "SupplierID", truncate_str(supplier_id, Limits.MIDDLE2_TEXT))
    
    # VATRegistrationNumber = seller_vat_code или "ND"
    vat_code = _s(getattr(doc, "seller_vat_code", ""))
    _create_element(info, "VATRegistrationNumber", 
                   truncate_str(vat_code, Limits.MIDDLE1_TEXT) if vat_code else "ND")
    
    # RegistrationNumber = seller_id (опц.)
    reg_num = _s(getattr(doc, "seller_id", ""))
    if reg_num:
        _create_element(info, "RegistrationNumber", truncate_str(reg_num, Limits.MIDDLE1_TEXT))
    elif not vat_code:
        _create_element(info, "RegistrationNumber", "ND")

    # Country = seller_country_iso (если есть)
    country = validate_country_code(getattr(doc, "seller_country_iso", ""))
    _create_element(info, "Country", country or "LT")
    
    # Name = seller_name или "ND"
    name = _s(getattr(doc, "seller_name", ""))
    _create_element(info, "Name", truncate_str(name, Limits.LONG_TEXT) if name else "ND")
    
    return info


def _build_customer_info(parent: ET.Element, doc) -> ET.Element:
    """CustomerInfo для SalesInvoice."""
    info = _create_element(parent, "CustomerInfo")
    
    # CustomerID = get_party_code(buyer)
    customer_id = get_party_code(doc, "buyer")
    if customer_id:
        _create_element(info, "CustomerID", truncate_str(customer_id, Limits.MIDDLE2_TEXT))
    
    # VATRegistrationNumber = buyer_vat_code или "ND"
    vat_code = _s(getattr(doc, "buyer_vat_code", ""))
    _create_element(info, "VATRegistrationNumber",
                   truncate_str(vat_code, Limits.MIDDLE1_TEXT) if vat_code else "ND")
    
    # RegistrationNumber = buyer_id (опц.)
    reg_num = _s(getattr(doc, "buyer_id", ""))
    if reg_num:
        _create_element(info, "RegistrationNumber", truncate_str(reg_num, Limits.MIDDLE1_TEXT))
    elif not vat_code:
        _create_element(info, "RegistrationNumber", "ND")
        
    # Country = buyer_country_iso (если есть)
    country = validate_country_code(getattr(doc, "buyer_country_iso", ""))
    _create_element(info, "Country", country or "LT")
    
    # Name = buyer_name или "ND"
    name = _s(getattr(doc, "buyer_name", ""))
    _create_element(info, "Name", truncate_str(name, Limits.LONG_TEXT) if name else "ND")
    
    return info





def _build_document_totals(parent: ET.Element, doc, is_sales: bool, pvm_resolver: dict = None) -> ET.Element:
    """DocumentTotals - суммы из документа."""
    totals = _create_element(parent, "DocumentTotals")
    doc_total = _create_element(totals, "DocumentTotal")
    
    # TaxableValue = doc.amount_wo_vat
    _create_element(doc_total, "TaxableValue", 
                   _format_decimal(getattr(doc, "amount_wo_vat", 0)))
    
    # TaxCode и TaxPercentage
    tax_fields = _get_tax_fields(doc, pvm_resolver)
    
    # TaxCode (nillable)
    _create_nillable_element(doc_total, "TaxCode", tax_fields["tax_code"])
    
    # TaxPercentage (nillable, но 0% = "0")
    tax_pct = tax_fields["tax_percentage"]
    if tax_pct is not None:
        _create_element(doc_total, "TaxPercentage", _format_decimal(tax_pct, 2))
    else:
        _create_nillable_element(doc_total, "TaxPercentage", None)
    
    # Amount = doc.vat_amount
    _create_nillable_element(doc_total, "Amount",
                            _format_decimal(getattr(doc, "vat_amount", 0)))
    
    # VATPointDate2 (только Sales)
    if is_sales:
        operation_date = getattr(doc, "operation_date", None)
        _create_nillable_element(doc_total, "VATPointDate2", 
                                _format_date(operation_date) if operation_date else None)
    
    return totals


def _build_purchase_invoice(parent: ET.Element, doc, pvm_resolver: dict = None) -> ET.Element:
    """Invoice для PurchaseInvoices."""
    invoice = _create_element(parent, "Invoice")
    
    # InvoiceNo
    inv_no = build_dok_nr(
        getattr(doc, "document_series", ""),
        getattr(doc, "document_number", "")
    )
    _create_element(invoice, "InvoiceNo", truncate_str(inv_no, Limits.MIDDLE2_TEXT) or "ND")
    
    _build_supplier_info(invoice, doc)
    
    _create_element(invoice, "InvoiceDate", _format_date(getattr(doc, "invoice_date", None)))
    _create_element(invoice, "InvoiceType", "SF")
    _create_element(invoice, "SpecialTaxation", "")
    _create_element(invoice, "References")
    
    # VATPointDate (опц.)
    operation_date = getattr(doc, "operation_date", None)
    _create_nillable_element(invoice, "VATPointDate",
                            _format_date(operation_date) if operation_date else None)
    
    _build_document_totals(invoice, doc, is_sales=False, pvm_resolver=pvm_resolver)
    
    return invoice


def _build_sales_invoice(parent: ET.Element, doc, pvm_resolver: dict = None) -> ET.Element:
    """Invoice для SalesInvoices."""
    invoice = _create_element(parent, "Invoice")
    
    # InvoiceNo
    inv_no = build_dok_nr(
        getattr(doc, "document_series", ""),
        getattr(doc, "document_number", "")
    )
    _create_element(invoice, "InvoiceNo", truncate_str(inv_no, Limits.MIDDLE2_TEXT) or "ND")
    
    _build_customer_info(invoice, doc)
    
    _create_element(invoice, "InvoiceDate", _format_date(getattr(doc, "invoice_date", None)))
    _create_element(invoice, "InvoiceType", "SF")
    _create_element(invoice, "SpecialTaxation", "")
    _create_element(invoice, "References")
    
    # VATPointDate (опц.)
    operation_date = getattr(doc, "operation_date", None)
    _create_nillable_element(invoice, "VATPointDate",
                            _format_date(operation_date) if operation_date else None)
    
    _build_document_totals(invoice, doc, is_sales=True, pvm_resolver=pvm_resolver)
    
    return invoice


# =============================================================================
# XML SERIALIZATION
# =============================================================================

def _serialize_xml(root: ET.Element) -> str:
    """Сериализует XML с форматированием."""
    
    def _indent(elem, level=0):
        indent_str = "\n" + "  " * level
        if len(elem):
            if not elem.text or not elem.text.strip():
                elem.text = indent_str + "  "
            if not elem.tail or not elem.tail.strip():
                elem.tail = indent_str
            for child in elem:
                _indent(child, level + 1)
            if not child.tail or not child.tail.strip():
                child.tail = indent_str
        else:
            if level and (not elem.tail or not elem.tail.strip()):
                elem.tail = indent_str
    
    _indent(root)
    
    ET.register_namespace("", ISAF_NAMESPACE)
    
    xml_str = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str


# =============================================================================
# MAIN EXPORT FUNCTION
# =============================================================================

def export_to_apsa(
    documents: List,
    registration_number: str,
    pvm_resolver: dict = None,
) -> dict:
    """
    Экспортирует документы в i.SAF XML для APSA.

    Args:
        documents: список документов (с полем direction='pirkimas'/'pardavimas')
        registration_number: код выбранного контрагента (company) из CP
        pvm_resolver: dict {doc_id: {item_id: {"vat_percent": ..., "pvm_kodas": ...}}}

    Returns:
        {"isaf": bytes} - XML файл
    """
    logger.info("[APSA] Starting export, docs=%d", len(documents))

    if not documents:
        raise ValueError("No documents provided for export")

    if not registration_number:
        raise ValueError("Registration number (company code) is required")

    reg_num = validate_registration_number(registration_number)
    if not reg_num:
        raise ValueError(f"Invalid registration number: {registration_number}")

    if pvm_resolver is None:
        pvm_resolver = {}

    # Разделяем на pirkimas/pardavimas
    purchase_docs = []
    sales_docs = []
    all_dates = []

    for doc in documents:
        direction = _s(getattr(doc, "direction", "")) or _s(getattr(doc, "pirkimas_pardavimas", ""))
        direction = direction.lower()
        
        inv_date = getattr(doc, "invoice_date", None)
        if inv_date:
            all_dates.append(inv_date)
        
        if direction == "pardavimas":
            sales_docs.append(doc)
        else:
            purchase_docs.append(doc)

    logger.info("[APSA] Split: purchases=%d, sales=%d", len(purchase_docs), len(sales_docs))

    # SelectionStartDate/EndDate = min/max invoice_date
    if all_dates:
        start_date = min(all_dates)
        end_date = max(all_dates)
    else:
        start_date = end_date = date.today()

    # DataType
    if purchase_docs and sales_docs:
        data_type = DATA_TYPE_FULL
    elif sales_docs:
        data_type = DATA_TYPE_SALES
    else:
        data_type = DATA_TYPE_PURCHASE

    # XML
    root = ET.Element("iSAFFile")
    root.set("xmlns", ISAF_NAMESPACE)
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")

    _build_header(root, reg_num, start_date, end_date, data_type)

    _build_masterfiles(root, purchase_docs, sales_docs)

    source_docs = _create_element(root, "SourceDocuments")

    if purchase_docs:
        purchase_invoices = _create_element(source_docs, "PurchaseInvoices")
        for doc in purchase_docs:
            doc_pvm = pvm_resolver.get(doc.id, {})
            _build_purchase_invoice(purchase_invoices, doc, doc_pvm)

    if sales_docs:
        sales_invoices = _create_element(source_docs, "SalesInvoices")
        for doc in sales_docs:
            doc_pvm = pvm_resolver.get(doc.id, {})
            _build_sales_invoice(sales_invoices, doc, doc_pvm)

    xml_string = _serialize_xml(root)
    xml_bytes = xml_string.encode('utf-8')

    logger.info("[APSA] Export completed, size=%d bytes", len(xml_bytes))

    return {"isaf": xml_bytes}