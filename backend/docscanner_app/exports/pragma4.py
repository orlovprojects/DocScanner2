"""
Экспорт документов в формат Pragma 4.0 (E-Sąskaita XML)
Формат: XML, кодировка UTF-8
Поддерживаются покупки (pirkimai) и продажи (pardavimai)
"""
import xml.etree.ElementTree as ET
import logging
import zipfile
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from io import BytesIO

logger = logging.getLogger(__name__)


# =========================
# Символы, которых нет в стандартном XML -> замена
# =========================

NON_STANDARD_MAP = {
    # Чешские / Словацкие
    'á': 'a', 'Á': 'A',
    'ď': 'd', 'Ď': 'D',
    'ě': 'e', 'Ě': 'E',
    'í': 'i', 'Í': 'I',
    'ĺ': 'l', 'Ĺ': 'L',
    'ľ': 'l', 'Ľ': 'L',
    'ň': 'n', 'Ň': 'N',
    'ř': 'r', 'Ř': 'R',
    'ť': 't', 'Ť': 'T',
    'ú': 'u', 'Ú': 'U',
    'ů': 'u', 'Ů': 'U',
    'ý': 'y', 'Ý': 'Y',

    # Венгерские
    'ő': 'o', 'Ő': 'O',
    'ű': 'u', 'Ű': 'U',

    # Румынские
    'ă': 'a', 'Ă': 'A',
    'â': 'a', 'Â': 'A',
    'î': 'i', 'Î': 'I',
    'ș': 's', 'Ș': 'S',
    'ț': 't', 'Ț': 'T',

    # Хорватский
    'đ': 'd', 'Đ': 'D',

    # Французский
    'à': 'a', 'À': 'A',
    'ç': 'c', 'Ç': 'C',
    'è': 'e', 'È': 'E',
    'ê': 'e', 'Ê': 'E',
    'ë': 'e', 'Ë': 'E',
    'ï': 'i', 'Ï': 'I',
    'ô': 'o', 'Ô': 'O',
    'œ': 'oe', 'Œ': 'OE',
    'ù': 'u', 'Ù': 'U',
    'û': 'u', 'Û': 'U',
    'ÿ': 'y', 'Ÿ': 'Y',

    # Испанский
    'ñ': 'n', 'Ñ': 'N',
    '¿': '?', '¡': '!',

    # Португальский
    'ã': 'a', 'Ã': 'A',

    # Итальянский
    'ì': 'i', 'Ì': 'I',
    'ò': 'o', 'Ò': 'O',

    # Турецкий
    'ğ': 'g', 'Ğ': 'G',
    'ı': 'i',
    'ş': 's', 'Ş': 'S',
    'İ': 'I',

    # Исландские
    'þ': 'th', 'Þ': 'Th',
    'ð': 'd',  'Ð': 'D',

    # Немецкая заглавная ß
    'ẞ': 'SS',
}

# Страны ЕС
EU_COUNTRIES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
}


# =========================
# Helpers
# =========================

def _normalize_str(value):
    """Нормализует строку — заменяет нестандартные символы."""
    if value is None:
        return ""
    s = str(value)
    return "".join(NON_STANDARD_MAP.get(ch, ch) for ch in s)


def _safe_D(x):
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _s(v):
    """Безопасная строка с strip() и нормализацией."""
    if v is None:
        return ""
    return _normalize_str(str(v).strip())


def _format_date(date_obj):
    """Формат даты для Pragma 4.0: YYYY-MM-DD"""
    if not date_obj:
        return ""
    if isinstance(date_obj, str):
        return date_obj
    return date_obj.strftime("%Y-%m-%d")


def _format_date_header(date_obj):
    """Формат даты для Header: YYYYMMDD"""
    if not date_obj:
        return datetime.now().strftime("%Y%m%d")
    if isinstance(date_obj, str):
        try:
            dt = datetime.strptime(date_obj, "%Y-%m-%d")
            return dt.strftime("%Y%m%d")
        except Exception:
            return datetime.now().strftime("%Y%m%d")
    return date_obj.strftime("%Y%m%d")


def _format_file_id():
    """Формат FileId: YYYY-MM-DDTHH:MM:SS"""
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def _format_decimal(value, decimals=2):
    """Форматирование числа."""
    try:
        d = _safe_D(value)
        pattern = "0." + "0" * decimals
        return str(d.quantize(Decimal(pattern), rounding=ROUND_HALF_UP))
    except Exception:
        return "0.00"


def _get_vat_rate(vat_percent):
    """Получить ставку НДС как целое число."""
    try:
        val = _safe_D(vat_percent or 0)
        return str(int(val))
    except Exception:
        return "0"


def _is_eu_country(iso_code):
    """Проверка — страна в ЕС?"""
    if not iso_code:
        return False
    return str(iso_code).strip().upper() in EU_COUNTRIES


def _get_preke_paslauga(value):
    """
    Преобразует preke_paslauga в формат Pragma 4.0:
    1, 3 -> "0" (prekė/товар)
    2, 4 -> "1" (paslauga/услуга)
    """
    try:
        v = int(value)
        if v in (1, 3):
            return "0"
        elif v in (2, 4):
            return "1"
    except (ValueError, TypeError):
        pass
    return "0"  # По умолчанию товар


def _get_document_number(doc):
    """Формирует номер документа из series и number."""
    series = _s(getattr(doc, "document_series", "")).replace(" ", "")
    number = _s(getattr(doc, "document_number", "")).replace(" ", "")

    if series and number:
        while number.startswith(series) and series:
            number = number[len(series):]
        return f"{series}{number}"

    return number or ""


def _get_company_code(doc, doc_type):
    """
    Получает код компании.
    doc_type: 1=pirkimas (seller), 2=pardavimas (buyer)
    """
    if doc_type == 1:  # pirkimas - seller
        return (
            _s(getattr(doc, 'seller_id', ''))
            or _s(getattr(doc, 'seller_vat_code', ''))
            or _s(getattr(doc, 'seller_id_programoje', ''))
        )
    else:  # pardavimas - buyer
        return (
            _s(getattr(doc, 'buyer_id', ''))
            or _s(getattr(doc, 'buyer_vat_code', ''))
            or _s(getattr(doc, 'buyer_id_programoje', ''))
        )


def _get_product_code(item=None, doc=None):
    """Получает код товара."""
    if item:
        code = _s(getattr(item, 'prekes_kodas', '')) or _s(getattr(item, 'prekes_barkodas', ''))
        if code:
            return code
    if doc:
        code = _s(getattr(doc, 'prekes_kodas', '')) or _s(getattr(doc, 'prekes_barkodas', ''))
        if code:
            return code
    return "PREKE001"


def _detect_document_type(doc):
    """Определяет тип документа: 1=pirkimas, 2=pardavimas"""
    doc_type_str = (_s(getattr(doc, 'pirkimas_pardavimas', ''))).lower()
    
    if doc_type_str == 'pirkimas':
        return 1
    elif doc_type_str == 'pardavimas':
        return 2
    else:
        if _s(getattr(doc, 'seller_id', '')) or _s(getattr(doc, 'seller_vat_code', '')):
            return 1
        elif _s(getattr(doc, 'buyer_id', '')) or _s(getattr(doc, 'buyer_vat_code', '')):
            return 2
        else:
            return 2


def _indent(elem, level=0):
    """Добавляет отступы для pretty-print XML."""
    i = "\n" + "  " * level
    if len(elem):
        if not (elem.text and elem.text.strip()):
            elem.text = i + "  "
        for ch in elem:
            _indent(ch, level + 1)
        if not (elem.tail and elem.tail.strip()):
            elem.tail = i
    else:
        if not (elem.tail and elem.tail.strip()):
            elem.tail = i


# =========================
# Party builders
# =========================

def _build_party(parent, tag, doc, prefix):
    """
    Создает элемент SellerParty или BuyerParty.
    prefix: 'seller_' или 'buyer_'
    """
    party = ET.SubElement(parent, tag)
    
    name = _s(getattr(doc, f'{prefix}name', '')) or 'Nežinoma'
    ET.SubElement(party, "Name").text = name[:255]
    
    reg_number = _s(getattr(doc, f'{prefix}id', ''))
    ET.SubElement(party, "RegNumber").text = reg_number[:50]
    
    vat_code = _s(getattr(doc, f'{prefix}vat_code', ''))
    if vat_code:
        ET.SubElement(party, "VATRegNumber").text = vat_code[:50]
    
    # ContactData
    contact = ET.SubElement(party, "ContactData")
    
    email = _s(getattr(doc, f'{prefix}email', ''))
    if email:
        ET.SubElement(contact, "E-mailAddress").text = email[:100]
    
    # LegalAddress
    legal = ET.SubElement(contact, "LegalAddress")
    
    address = _s(getattr(doc, f'{prefix}address', ''))
    if address:
        ET.SubElement(legal, "PostalAddress1").text = address[:100]
    
    city = _s(getattr(doc, f'{prefix}city', ''))
    if city:
        ET.SubElement(legal, "City").text = city[:50]
    
    country = _s(getattr(doc, f'{prefix}country', ''))
    if country:
        ET.SubElement(legal, "Country").text = country[:50]
    
    country_iso = _s(getattr(doc, f'{prefix}country_iso', '')).upper()
    if country_iso:
        ET.SubElement(legal, "CountryCode").text = country_iso[:2]
        
        # PostCode (если есть)
        post_code = _s(getattr(doc, f'{prefix}post_code', ''))
        if post_code:
            ET.SubElement(legal, "PostCode").text = post_code[:20]
        
        # CountryEU
        if _is_eu_country(country_iso):
            ET.SubElement(legal, "CountryEU").text = "1"
    
    return party


# =========================
# Invoice builders
# =========================

def _build_invoice_information(invoice, doc):
    """Создает InvoiceInformation."""
    info = ET.SubElement(invoice, "InvoiceInformation")
    
    # Type
    doc_type_elem = ET.SubElement(info, "Type")
    doc_type_elem.set("type", "DEB")
    
    # DocumentName (серия)
    series = _s(getattr(doc, 'document_series', ''))
    if series:
        ET.SubElement(info, "DocumentName").text = series[:10]
    
    # InvoiceNumber
    doc_number = _get_document_number(doc)
    ET.SubElement(info, "InvoiceNumber").text = doc_number[:15] or "UNKNOWN"
    
    ET.SubElement(info, "InvoiceContentText").text = "PVM SĄSKAITA FAKTŪRA"
    
    # InvoiceDate
    invoice_date = getattr(doc, 'invoice_date', None)
    ET.SubElement(info, "InvoiceDate").text = _format_date(invoice_date)
    
    # DueDate
    due_date = getattr(doc, 'due_date', None)
    if due_date:
        ET.SubElement(info, "DueDate").text = _format_date(due_date)
    
    # InvoiceType (SF, DS, KS, etc.)
    invoice_type = _s(getattr(doc, 'invoice_type', '')) or "SF"
    ET.SubElement(info, "InvoiceType").text = invoice_type
    
    # Registry (1 = включать в i.SAF)
    ET.SubElement(info, "Registry").text = "1"
    
    # FR0564 (если есть)
    fr0564 = getattr(doc, 'fr0564', None) or getattr(doc, 'isaf_code', None)
    if fr0564 in (13, 14, 18):
        ET.SubElement(info, "FR0564").text = str(fr0564)


def _build_invoice_sum_group(invoice, doc):
    """Создает InvoiceSumGroup."""
    sum_group = ET.SubElement(invoice, "InvoiceSumGroup")
    
    amount_wo_vat = _safe_D(getattr(doc, 'amount_wo_vat', 0) or 0)
    vat_amount = _safe_D(getattr(doc, 'vat_amount', 0) or 0)
    amount_with_vat = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    
    ET.SubElement(sum_group, "InvoiceSum").text = _format_decimal(amount_wo_vat)
    
    # Скидка
    discount = _safe_D(getattr(doc, 'invoice_discount_wo_vat', 0) or 0)
    if discount > 0:
        addition = ET.SubElement(sum_group, "Addition")
        addition.set("addCode", "DSC")
        ET.SubElement(addition, "AddContent").text = "Pritaikytos nuolaidos"
        ET.SubElement(addition, "AddSum").text = _format_decimal(discount)
    
    # VAT
    vat_elem = ET.SubElement(sum_group, "VAT")
    vat_elem.set("vatId", "TAX")
    
    vat_percent = getattr(doc, 'vat_percent', 21)
    ET.SubElement(vat_elem, "VATRate").text = _get_vat_rate(vat_percent)
    ET.SubElement(vat_elem, "VATSum").text = _format_decimal(vat_amount)
    
    ET.SubElement(sum_group, "TotalVATSum").text = _format_decimal(vat_amount)
    ET.SubElement(sum_group, "TotalSum").text = _format_decimal(amount_wo_vat)
    ET.SubElement(sum_group, "TotalToPay").text = _format_decimal(amount_with_vat)
    
    # Currency
    currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
    ET.SubElement(sum_group, "Currency").text = currency


def _build_invoice_items(invoice, doc):
    """Создает InvoiceItem с ItemEntries."""
    invoice_item = ET.SubElement(invoice, "InvoiceItem")
    item_group = ET.SubElement(invoice_item, "InvoiceItemGroup")
    
    line_items = getattr(doc, 'line_items', None)
    has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
    
    if has_items:
        row_no = 1
        for item in line_items.all():
            _build_item_entry(item_group, item, row_no, doc)
            row_no += 1
    else:
        _build_item_entry_from_doc(item_group, doc)


def _build_item_entry(item_group, item, row_no, doc):
    """Создает ItemEntry из line_item."""
    entry = ET.SubElement(item_group, "ItemEntry")
    
    ET.SubElement(entry, "RowNo").text = str(row_no)
    
    # SerialNumber (prekes_kodas)
    product_code = _get_product_code(item, doc)
    ET.SubElement(entry, "SerialNumber").text = product_code[:20]
    
    # SellerProductId
    ET.SubElement(entry, "SellerProductId").text = str(getattr(item, 'id', row_no))[:20]
    
    # Description (prekes_pavadinimas)
    pavadinimas = _s(getattr(item, 'prekes_pavadinimas', '')) or _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
    ET.SubElement(entry, "Description").text = pavadinimas[:150]
    
    # Type (0=prekė, 1=paslauga)
    preke_paslauga = getattr(item, 'preke_paslauga', None) or getattr(doc, 'preke_paslauga', None)
    ET.SubElement(entry, "Type").text = _get_preke_paslauga(preke_paslauga)
    
    # ItemDetailInfo
    detail = ET.SubElement(entry, "ItemDetailInfo")
    
    unit = _s(getattr(item, 'unit', '')) or 'vnt.'
    ET.SubElement(detail, "ItemUnit").text = unit[:10]
    
    quantity = _safe_D(getattr(item, 'quantity', 1) or 1)
    ET.SubElement(detail, "ItemAmount").text = _format_decimal(quantity, 4)
    
    price = _safe_D(getattr(item, 'price', 0) or 0)
    ET.SubElement(detail, "ItemPrice").text = _format_decimal(price, 8)
    
    # ItemSum
    item_sum = price * quantity
    ET.SubElement(entry, "ItemSum").text = _format_decimal(item_sum)
    
    # Addition (скидка)
    discount = _safe_D(getattr(item, 'discount', 0) or 0)
    addition = ET.SubElement(entry, "Addition")
    addition.set("addCode", "DSC")
    discount_pct = "0"
    if price > 0 and discount > 0:
        discount_pct = str(int((discount / price) * 100))
    ET.SubElement(addition, "AddContent").text = f"{discount_pct}%"
    ET.SubElement(addition, "AddSum").text = _format_decimal(discount * quantity)
    
    # VAT
    vat_elem = ET.SubElement(entry, "VAT")
    
    sum_before_vat = item_sum - (discount * quantity)
    ET.SubElement(vat_elem, "SumBeforeVAT").text = _format_decimal(sum_before_vat)
    
    vat_percent = _safe_D(getattr(item, 'vat_percent', 21) or 21)
    ET.SubElement(vat_elem, "VATRate").text = _get_vat_rate(vat_percent)
    
    vat_sum = _safe_D(getattr(item, 'vat', 0) or 0)
    ET.SubElement(vat_elem, "VATSum").text = _format_decimal(vat_sum)
    
    sum_after_vat = sum_before_vat + vat_sum
    ET.SubElement(vat_elem, "SumAfterVAT").text = _format_decimal(sum_after_vat)


def _build_item_entry_from_doc(item_group, doc):
    """Создает ItemEntry из документа без line_items."""
    entry = ET.SubElement(item_group, "ItemEntry")
    
    ET.SubElement(entry, "RowNo").text = "1"
    
    product_code = _get_product_code(None, doc)
    ET.SubElement(entry, "SerialNumber").text = product_code[:20]
    
    ET.SubElement(entry, "SellerProductId").text = str(getattr(doc, 'id', '1'))[:20]
    
    pavadinimas = _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
    ET.SubElement(entry, "Description").text = pavadinimas[:150]
    
    preke_paslauga = getattr(doc, 'preke_paslauga', None)
    ET.SubElement(entry, "Type").text = _get_preke_paslauga(preke_paslauga)
    
    detail = ET.SubElement(entry, "ItemDetailInfo")
    
    unit = _s(getattr(doc, 'unit', '')) or 'vnt.'
    ET.SubElement(detail, "ItemUnit").text = unit[:10]
    ET.SubElement(detail, "ItemAmount").text = "1.0000"
    
    amount_wo_vat = _safe_D(getattr(doc, 'amount_wo_vat', 0) or 0)
    ET.SubElement(detail, "ItemPrice").text = _format_decimal(amount_wo_vat, 8)
    
    ET.SubElement(entry, "ItemSum").text = _format_decimal(amount_wo_vat)
    
    # Addition (скидка)
    discount = _safe_D(getattr(doc, 'invoice_discount_wo_vat', 0) or 0)
    addition = ET.SubElement(entry, "Addition")
    addition.set("addCode", "DSC")
    ET.SubElement(addition, "AddContent").text = "0%"
    ET.SubElement(addition, "AddSum").text = _format_decimal(discount)
    
    # VAT
    vat_elem = ET.SubElement(entry, "VAT")
    
    sum_before_vat = amount_wo_vat - discount
    ET.SubElement(vat_elem, "SumBeforeVAT").text = _format_decimal(sum_before_vat)
    
    # separate_vat check
    separate_vat = getattr(doc, 'separate_vat', False)
    if separate_vat:
        vat_percent = ""
    else:
        vat_percent = _get_vat_rate(getattr(doc, 'vat_percent', 21))
    ET.SubElement(vat_elem, "VATRate").text = vat_percent
    
    vat_amount = _safe_D(getattr(doc, 'vat_amount', 0) or 0)
    ET.SubElement(vat_elem, "VATSum").text = _format_decimal(vat_amount)
    
    amount_with_vat = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    ET.SubElement(vat_elem, "SumAfterVAT").text = _format_decimal(amount_with_vat)


def _build_payment_info(invoice, doc, doc_type):
    """
    Создает PaymentInfo.
    doc_type: 1=pirkimas, 2=pardavimas
    """
    payment = ET.SubElement(invoice, "PaymentInfo")
    
    currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
    ET.SubElement(payment, "Currency").text = currency
    
    doc_number = _get_document_number(doc)
    ET.SubElement(payment, "PaymentDescription").text = f"Apmokėjimas pagal sąskaitą Nr. {doc_number}"
    ET.SubElement(payment, "Payable").text = "YES"
    
    due_date = getattr(doc, 'due_date', None)
    if due_date:
        ET.SubElement(payment, "PayDueDate").text = _format_date(due_date)
    
    amount_with_vat = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    ET.SubElement(payment, "PaymentTotalSum").text = _format_decimal(amount_with_vat)
    
    doc_id = str(getattr(doc, 'id', '') or '')
    ET.SubElement(payment, "PaymentId").text = doc_id
    
    # PayToAccount и PayToName — всегда от seller
    seller_iban = _s(getattr(doc, 'seller_iban', ''))
    if seller_iban:
        ET.SubElement(payment, "PayToAccount").text = seller_iban[:40]
    
    seller_name = _s(getattr(doc, 'seller_name', ''))
    if seller_name:
        ET.SubElement(payment, "PayToName").text = seller_name[:255]


# =========================
# Main invoice builder
# =========================

def _build_invoice(doc, doc_type):
    """
    Создает элемент <Invoice>.
    doc_type: 1=pirkimas, 2=pardavimas
    """
    invoice = ET.Element("Invoice")
    
    doc_id = str(getattr(doc, 'id', '') or '')
    
    if doc_type == 1:  # pirkimas
        reg_number = _s(getattr(doc, 'seller_id', ''))
        seller_reg = reg_number
    else:  # pardavimas
        reg_number = _s(getattr(doc, 'buyer_id', ''))
        seller_reg = _s(getattr(doc, 'seller_id', ''))
    
    invoice.set("invoiceId", doc_id)
    invoice.set("regNumber", reg_number[:50])
    invoice.set("presentment", "YES")
    invoice.set("invoiceGlobUniqId", doc_id)
    invoice.set("sellerRegNumber", seller_reg[:50])
    
    # InvoiceParties
    parties = ET.SubElement(invoice, "InvoiceParties")
    _build_party(parties, "SellerParty", doc, "seller_")
    _build_party(parties, "BuyerParty", doc, "buyer_")
    
    # InvoiceInformation
    _build_invoice_information(invoice, doc)
    
    # InvoiceSumGroup
    _build_invoice_sum_group(invoice, doc)
    
    # InvoiceItem
    _build_invoice_items(invoice, doc)
    
    # PaymentInfo
    _build_payment_info(invoice, doc, doc_type)
    
    return invoice


# =========================
# Export functions
# =========================

def _export_documents_to_xml(documents, doc_type_filter=None):
    """
    Экспортирует документы в XML.
    doc_type_filter: 1=только pirkimai, 2=только pardavimai, None=все
    """
    root = ET.Element("E_Invoice")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    
    # Header
    header = ET.SubElement(root, "Header")
    first_doc = documents[0] if documents else None
    doc_date = getattr(first_doc, 'invoice_date', None) if first_doc else None
    
    ET.SubElement(header, "Date").text = _format_date_header(doc_date)
    ET.SubElement(header, "FileId").text = _format_file_id()
    ET.SubElement(header, "AppId").text = "EINVOICE"
    ET.SubElement(header, "Version").text = "1.1"
    
    total_invoices = 0
    total_amount = Decimal("0")
    
    for doc in documents or []:
        doc_type = _detect_document_type(doc)
        
        if doc_type_filter and doc_type != doc_type_filter:
            continue
        
        invoice = _build_invoice(doc, doc_type)
        root.append(invoice)
        total_invoices += 1
        total_amount += _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    
    # Footer
    footer = ET.SubElement(root, "Footer")
    ET.SubElement(footer, "TotalNumberInvoices").text = str(total_invoices)
    ET.SubElement(footer, "TotalAmount").text = _format_decimal(total_amount)
    
    _indent(root)
    xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    
    logger.info("[PRAGMA40] Export completed: %d invoices, total=%.2f", 
                total_invoices, float(total_amount))
    
    return xml_bytes


def export_pirkimai_to_pragma40(documents):
    """Экспорт pirkimai в XML."""
    logger.info("[PRAGMA40:PIRKIMAI] Starting export for %d documents", len(documents) if documents else 0)
    return _export_documents_to_xml(documents, doc_type_filter=1)


def export_pardavimai_to_pragma40(documents):
    """Экспорт pardavimai в XML."""
    logger.info("[PRAGMA40:PARDAVIMAI] Starting export for %d documents", len(documents) if documents else 0)
    return _export_documents_to_xml(documents, doc_type_filter=2)


def export_to_pragma40_xml(pirkimai_documents=None, pardavimai_documents=None):
    """
    Основная функция экспорта для Pragma 4.0.
    
    Returns:
        bytes: XML если только один тип документов, иначе ZIP-архив
    """
    has_pirkimai = bool(pirkimai_documents)
    has_pardavimai = bool(pardavimai_documents)
    
    if not has_pirkimai and not has_pardavimai:
        logger.warning("[PRAGMA40] No documents provided for export")
        return b""
    
    # Если только один тип - возвращаем XML
    if has_pirkimai and not has_pardavimai:
        logger.info("[PRAGMA40] Exporting only pirkimai")
        return export_pirkimai_to_pragma40(pirkimai_documents)
    
    if has_pardavimai and not has_pirkimai:
        logger.info("[PRAGMA40] Exporting only pardavimai")
        return export_pardavimai_to_pragma40(pardavimai_documents)
    
    # Оба типа - создаем ZIP
    logger.info("[PRAGMA40] Exporting both pirkimai and pardavimai as ZIP")
    
    zip_buffer = BytesIO()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        if pirkimai_documents:
            pirkimai_xml = export_pirkimai_to_pragma40(pirkimai_documents)
            zip_file.writestr(f"Pragma40_Pirkimai_{timestamp}.xml", pirkimai_xml)
        
        if pardavimai_documents:
            pardavimai_xml = export_pardavimai_to_pragma40(pardavimai_documents)
            zip_file.writestr(f"Pragma40_Pardavimai_{timestamp}.xml", pardavimai_xml)
    
    return zip_buffer.getvalue()