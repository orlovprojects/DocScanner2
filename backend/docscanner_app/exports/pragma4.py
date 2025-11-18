import xml.etree.ElementTree as ET
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
import zipfile
from io import BytesIO

try:
    from django.utils.encoding import smart_str
except ImportError:
    def smart_str(s):
        """Fallback для тестирования без Django."""
        if isinstance(s, bytes):
            return s.decode('utf-8', errors='replace')
        return str(s) if s is not None else ''

logger = logging.getLogger(__name__)

# =========================
# Helpers
# =========================

def _safe_D(x):
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")

def _s(v):
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""

def format_date_pragma(date_obj):
    """Формат даты для Pragma 4.0: YYYY-MM-DD"""
    if not date_obj:
        return ""
    if isinstance(date_obj, str):
        return date_obj
    return date_obj.strftime("%Y-%m-%d")

def format_date_header(date_obj):
    """Формат даты для Header: YYYYMMDD"""
    if not date_obj:
        return datetime.now().strftime("%Y%m%d")
    if isinstance(date_obj, str):
        try:
            dt = datetime.strptime(date_obj, "%Y-%m-%d")
            return dt.strftime("%Y%m%d")
        except:
            return datetime.now().strftime("%Y%m%d")
    return date_obj.strftime("%Y%m%d")

def format_file_id():
    """Формат FileId: YYYY-MM-DDTHH:MM:SS"""
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

def format_decimal(value, decimals=2):
    """Форматирование числа с заданным количеством знаков."""
    try:
        d = _safe_D(value)
        if decimals == 2:
            return format(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), ".2f")
        else:
            pattern = f"0.{'0' * decimals}"
            return format(d.quantize(Decimal(pattern), rounding=ROUND_HALF_UP), f".{decimals}f")
    except:
        return "0.00"

def get_vat_rate(vat_percent):
    """Получить ставку НДС как целое число."""
    try:
        val = _safe_D(vat_percent or 0)
        return str(int(val))
    except:
        return "0"

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
# Главная функция экспорта
# =========================

def export_to_pragma40_xml(
    pirkimai_documents=None,
    pardavimai_documents=None
):
    """
    Основная функция экспорта для Pragma 4.0.
    
    Берёт ВСЕ данные из самих документов (buyer_*/seller_*), 
    как в Apskaita5 - без необходимости передавать company_data отдельно.
    
    Args:
        pirkimai_documents: список документов покупок (опционально)
        pardavimai_documents: список документов продаж (опционально)
    
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
    return _create_combined_zip(pirkimai_documents, pardavimai_documents)

def _create_combined_zip(pirkimai_docs, pardavimai_docs):
    """Создает ZIP-архив с двумя XML файлами."""
    zip_buffer = BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Pirkimai XML
        if pirkimai_docs:
            pirkimai_xml = export_pirkimai_to_pragma40(pirkimai_docs)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            zip_file.writestr(f"Pragma40_Pirkimai_{timestamp}.xml", pirkimai_xml)
        
        # Pardavimai XML
        if pardavimai_docs:
            pardavimai_xml = export_pardavimai_to_pragma40(pardavimai_docs)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            zip_file.writestr(f"Pragma40_Pardavimai_{timestamp}.xml", pardavimai_xml)
    
    return zip_buffer.getvalue()

# =========================
# Pragma 4.0 Export - Pirkimai
# =========================

def export_pirkimai_to_pragma40(documents):
    """
    Экспорт документов покупок (pirkimai) в формат E-Sąskaita XML для Pragma 4.0.
    
    Все данные берутся из самих документов:
    - Seller (поставщик) = seller_* поля документа
    - Buyer (мы-покупатель) = buyer_* поля документа
    
    Args:
        documents: список документов покупок
    
    Returns:
        bytes: XML в кодировке UTF-8
    """
    logger.info("[PRAGMA40:PIRKIMAI] Starting export for %d documents", len(documents) if documents else 0)
    
    root = ET.Element("E_Invoice")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    
    header = ET.SubElement(root, "Header")
    first_doc = documents[0] if documents else None
    doc_date = getattr(first_doc, 'invoice_date', None) if first_doc else None
    
    ET.SubElement(header, "Date").text = format_date_header(doc_date)
    ET.SubElement(header, "FileId").text = format_file_id()
    ET.SubElement(header, "AppId").text = "EINVOICE"
    ET.SubElement(header, "Version").text = "1.1"
    
    total_invoices = 0
    total_amount = Decimal("0")
    
    for doc in documents or []:
        invoice = _create_pirkimas_invoice(doc)
        if invoice is not None:
            root.append(invoice)
            total_invoices += 1
            total_to_pay = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
            total_amount += total_to_pay
    
    footer = ET.SubElement(root, "Footer")
    ET.SubElement(footer, "TotalNumberInvoices").text = str(total_invoices)
    ET.SubElement(footer, "TotalAmount").text = format_decimal(total_amount, 2)
    
    _indent(root)
    xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    
    logger.info("[PRAGMA40:PIRKIMAI] Export completed: %d invoices, total=%.2f", 
                total_invoices, float(total_amount))
    
    return xml_bytes


def _create_pirkimas_invoice(doc):
    """Создает элемент <Invoice> для документа покупки."""
    invoice = ET.Element("Invoice")
    
    doc_id = str(getattr(doc, 'id', '') or '')
    seller_reg = _s(getattr(doc, 'seller_id', '') or '')
    
    invoice.set("invoiceId", doc_id)
    invoice.set("regNumber", seller_reg)
    invoice.set("presentment", "YES")
    invoice.set("invoiceGlobUniqId", doc_id)
    invoice.set("sellerRegNumber", seller_reg)
    
    parties = ET.SubElement(invoice, "InvoiceParties")
    
    # SellerParty (поставщик) - из seller_* полей документа
    seller = ET.SubElement(parties, "SellerParty")
    ET.SubElement(seller, "n").text = smart_str(getattr(doc, 'seller_name', '') or 'Поставщик')
    ET.SubElement(seller, "RegNumber").text = smart_str(getattr(doc, 'seller_id', '') or '')
    
    seller_vat = _s(getattr(doc, 'seller_vat_code', ''))
    if seller_vat:
        ET.SubElement(seller, "VATRegNumber").text = smart_str(seller_vat)
    
    seller_contact = ET.SubElement(seller, "ContactData")
    seller_email = _s(getattr(doc, 'seller_email', ''))
    if seller_email:
        ET.SubElement(seller_contact, "E-mailAddress").text = smart_str(seller_email)
    
    seller_legal = ET.SubElement(seller_contact, "LegalAddress")
    seller_address = _s(getattr(doc, 'seller_address', ''))
    if seller_address:
        ET.SubElement(seller_legal, "PostalAddress1").text = smart_str(seller_address)
    
    seller_city = _s(getattr(doc, 'seller_city', ''))
    if seller_city:
        ET.SubElement(seller_legal, "City").text = smart_str(seller_city)
    
    seller_country = _s(getattr(doc, 'seller_country', ''))
    if seller_country:
        ET.SubElement(seller_legal, "Country").text = smart_str(seller_country)
    
    seller_iso = _s(getattr(doc, 'seller_country_iso', ''))
    if seller_iso:
        ET.SubElement(seller_legal, "CountryCode").text = smart_str(seller_iso.upper())
    
    # BuyerParty (мы-покупатель) - из buyer_* полей документа
    buyer = ET.SubElement(parties, "BuyerParty")
    ET.SubElement(buyer, "n").text = smart_str(getattr(doc, 'buyer_name', '') or 'Моя компания')
    ET.SubElement(buyer, "RegNumber").text = smart_str(getattr(doc, 'buyer_id', '') or '')
    
    buyer_vat = _s(getattr(doc, 'buyer_vat_code', ''))
    if buyer_vat:
        ET.SubElement(buyer, "VATRegNumber").text = smart_str(buyer_vat)
    
    buyer_contact = ET.SubElement(buyer, "ContactData")
    buyer_email = _s(getattr(doc, 'buyer_email', ''))
    if buyer_email:
        ET.SubElement(buyer_contact, "E-mailAddress").text = smart_str(buyer_email)
    
    buyer_legal = ET.SubElement(buyer_contact, "LegalAddress")
    buyer_address = _s(getattr(doc, 'buyer_address', ''))
    if buyer_address:
        ET.SubElement(buyer_legal, "PostalAddress1").text = smart_str(buyer_address)
    
    buyer_city = _s(getattr(doc, 'buyer_city', ''))
    if buyer_city:
        ET.SubElement(buyer_legal, "City").text = smart_str(buyer_city)
    
    buyer_country = _s(getattr(doc, 'buyer_country', ''))
    if buyer_country:
        ET.SubElement(buyer_legal, "Country").text = smart_str(buyer_country)
    
    buyer_iso = _s(getattr(doc, 'buyer_country_iso', ''))
    if buyer_iso:
        ET.SubElement(buyer_legal, "CountryCode").text = smart_str(buyer_iso.upper())
    
    # InvoiceInformation
    _add_invoice_information(invoice, doc)
    
    # InvoiceSumGroup
    _add_invoice_sum_group(invoice, doc)
    
    # InvoiceItem
    _add_invoice_items(invoice, doc)
    
    # PaymentInfo
    _add_payment_info_pirkimas(invoice, doc)
    
    return invoice


# =========================
# Pragma 4.0 Export - Pardavimai
# =========================

def export_pardavimai_to_pragma40(documents):
    """
    Экспорт документов продаж (pardavimai) в формат E-Sąskaita XML для Pragma 4.0.
    
    Все данные берутся из самих документов:
    - Seller (мы-продавец) = seller_* поля документа
    - Buyer (покупатель) = buyer_* поля документа
    
    Args:
        documents: список документов продаж
    
    Returns:
        bytes: XML в кодировке UTF-8
    """
    logger.info("[PRAGMA40:PARDAVIMAI] Starting export for %d documents", len(documents) if documents else 0)
    
    root = ET.Element("E_Invoice")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    
    header = ET.SubElement(root, "Header")
    first_doc = documents[0] if documents else None
    doc_date = getattr(first_doc, 'invoice_date', None) if first_doc else None
    
    ET.SubElement(header, "Date").text = format_date_header(doc_date)
    ET.SubElement(header, "FileId").text = format_file_id()
    ET.SubElement(header, "AppId").text = "EINVOICE"
    ET.SubElement(header, "Version").text = "1.1"
    
    total_invoices = 0
    total_amount = Decimal("0")
    
    for doc in documents or []:
        invoice = _create_pardavimas_invoice(doc)
        if invoice is not None:
            root.append(invoice)
            total_invoices += 1
            total_to_pay = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
            total_amount += total_to_pay
    
    footer = ET.SubElement(root, "Footer")
    ET.SubElement(footer, "TotalNumberInvoices").text = str(total_invoices)
    ET.SubElement(footer, "TotalAmount").text = format_decimal(total_amount, 2)
    
    _indent(root)
    xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    
    logger.info("[PRAGMA40:PARDAVIMAI] Export completed: %d invoices, total=%.2f", 
                total_invoices, float(total_amount))
    
    return xml_bytes


def _create_pardavimas_invoice(doc):
    """Создает элемент <Invoice> для документа продажи."""
    invoice = ET.Element("Invoice")
    
    doc_id = str(getattr(doc, 'id', '') or '')
    buyer_reg = _s(getattr(doc, 'buyer_id', '') or '')
    seller_reg = _s(getattr(doc, 'seller_id', '') or '')
    
    invoice.set("invoiceId", doc_id)
    invoice.set("regNumber", buyer_reg)
    invoice.set("presentment", "YES")
    invoice.set("invoiceGlobUniqId", doc_id)
    invoice.set("sellerRegNumber", seller_reg)
    
    parties = ET.SubElement(invoice, "InvoiceParties")
    
    # SellerParty (мы-продавец) - из seller_* полей документа
    seller = ET.SubElement(parties, "SellerParty")
    ET.SubElement(seller, "n").text = smart_str(getattr(doc, 'seller_name', '') or 'Моя компания')
    ET.SubElement(seller, "RegNumber").text = smart_str(getattr(doc, 'seller_id', '') or '')
    
    seller_vat = _s(getattr(doc, 'seller_vat_code', ''))
    if seller_vat:
        ET.SubElement(seller, "VATRegNumber").text = smart_str(seller_vat)
    
    seller_contact = ET.SubElement(seller, "ContactData")
    seller_email = _s(getattr(doc, 'seller_email', ''))
    if seller_email:
        ET.SubElement(seller_contact, "E-mailAddress").text = smart_str(seller_email)
    
    seller_legal = ET.SubElement(seller_contact, "LegalAddress")
    seller_address = _s(getattr(doc, 'seller_address', ''))
    if seller_address:
        ET.SubElement(seller_legal, "PostalAddress1").text = smart_str(seller_address)
    
    seller_city = _s(getattr(doc, 'seller_city', ''))
    if seller_city:
        ET.SubElement(seller_legal, "City").text = smart_str(seller_city)
    
    seller_country = _s(getattr(doc, 'seller_country', ''))
    if seller_country:
        ET.SubElement(seller_legal, "Country").text = smart_str(seller_country)
    
    seller_iso = _s(getattr(doc, 'seller_country_iso', ''))
    if seller_iso:
        ET.SubElement(seller_legal, "CountryCode").text = smart_str(seller_iso.upper())
    
    # BuyerParty (покупатель) - из buyer_* полей документа
    buyer = ET.SubElement(parties, "BuyerParty")
    ET.SubElement(buyer, "n").text = smart_str(getattr(doc, 'buyer_name', '') or 'Покупатель')
    ET.SubElement(buyer, "RegNumber").text = smart_str(getattr(doc, 'buyer_id', '') or '')
    
    buyer_vat = _s(getattr(doc, 'buyer_vat_code', ''))
    if buyer_vat:
        ET.SubElement(buyer, "VATRegNumber").text = smart_str(buyer_vat)
    
    buyer_contact = ET.SubElement(buyer, "ContactData")
    buyer_email = _s(getattr(doc, 'buyer_email', ''))
    if buyer_email:
        ET.SubElement(buyer_contact, "E-mailAddress").text = smart_str(buyer_email)
    
    buyer_legal = ET.SubElement(buyer_contact, "LegalAddress")
    buyer_address = _s(getattr(doc, 'buyer_address', ''))
    if buyer_address:
        ET.SubElement(buyer_legal, "PostalAddress1").text = smart_str(buyer_address)
    
    buyer_city = _s(getattr(doc, 'buyer_city', ''))
    if buyer_city:
        ET.SubElement(buyer_legal, "City").text = smart_str(buyer_city)
    
    buyer_country = _s(getattr(doc, 'buyer_country', ''))
    if buyer_country:
        ET.SubElement(buyer_legal, "Country").text = smart_str(buyer_country)
    
    buyer_iso = _s(getattr(doc, 'buyer_country_iso', ''))
    if buyer_iso:
        ET.SubElement(buyer_legal, "CountryCode").text = smart_str(buyer_iso.upper())
    
    # InvoiceInformation
    _add_invoice_information(invoice, doc)
    
    # InvoiceSumGroup
    _add_invoice_sum_group(invoice, doc)
    
    # InvoiceItem
    _add_invoice_items(invoice, doc)
    
    # PaymentInfo
    _add_payment_info_pardavimas(invoice, doc)
    
    return invoice


# =========================
# Общие функции для Invoice
# =========================

def _add_invoice_information(invoice, doc):
    """Добавляет InvoiceInformation."""
    info = ET.SubElement(invoice, "InvoiceInformation")
    
    doc_type = ET.SubElement(info, "Type")
    doc_type.set("type", "DEB")
    
    series = _s(getattr(doc, 'document_series', ''))
    if series:
        ET.SubElement(info, "DocumentName").text = smart_str(series)
    
    number = _s(getattr(doc, 'document_number', ''))
    ET.SubElement(info, "InvoiceNumber").text = smart_str(number or 'UNKNOWN')
    
    ET.SubElement(info, "InvoiceContentText").text = "PVM SĄSKAITA FAKTŪRA"
    
    invoice_date = getattr(doc, 'invoice_date', None)
    ET.SubElement(info, "InvoiceDate").text = format_date_pragma(invoice_date)
    
    due_date = getattr(doc, 'due_date', None)
    if due_date:
        ET.SubElement(info, "DueDate").text = format_date_pragma(due_date)


def _add_invoice_sum_group(invoice, doc):
    """Добавляет InvoiceSumGroup."""
    sum_group = ET.SubElement(invoice, "InvoiceSumGroup")
    
    amount_wo_vat = _safe_D(getattr(doc, 'amount_wo_vat', 0) or 0)
    vat_amount = _safe_D(getattr(doc, 'vat_amount', 0) or 0)
    amount_with_vat = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    
    ET.SubElement(sum_group, "InvoiceSum").text = format_decimal(amount_wo_vat, 2)
    
    discount = _safe_D(getattr(doc, 'invoice_discount_wo_vat', 0) or 0)
    if discount > 0:
        addition = ET.SubElement(sum_group, "Addition")
        addition.set("addCode", "DSC")
        ET.SubElement(addition, "AddContent").text = "Pritaikytos nuolaidos"
        ET.SubElement(addition, "AddSum").text = format_decimal(discount, 2)
    
    vat_elem = ET.SubElement(sum_group, "VAT")
    vat_elem.set("vatId", "TAX")
    
    vat_percent = getattr(doc, 'vat_percent', 21)
    ET.SubElement(vat_elem, "VATRate").text = get_vat_rate(vat_percent)
    ET.SubElement(vat_elem, "VATSum").text = format_decimal(vat_amount, 2)
    
    ET.SubElement(sum_group, "TotalVATSum").text = format_decimal(vat_amount, 2)
    ET.SubElement(sum_group, "TotalSum").text = format_decimal(amount_with_vat, 2)
    ET.SubElement(sum_group, "TotalToPay").text = format_decimal(amount_with_vat, 2)
    
    currency = (getattr(doc, 'currency', 'EUR') or 'EUR').upper()
    ET.SubElement(sum_group, "Currency").text = currency


def _add_invoice_items(invoice, doc):
    """Добавляет InvoiceItem с ItemEntries."""
    invoice_item = ET.SubElement(invoice, "InvoiceItem")
    item_group = ET.SubElement(invoice_item, "InvoiceItemGroup")
    
    line_items = getattr(doc, 'line_items', None)
    has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
    
    if has_items:
        row_no = 1
        for item in line_items.all():
            _add_item_entry(item_group, item, row_no, doc)
            row_no += 1
    else:
        _add_item_entry_from_doc(item_group, doc)


def _add_item_entry(item_group, item, row_no, doc):
    """Добавляет ItemEntry из line_item."""
    entry = ET.SubElement(item_group, "ItemEntry")
    
    ET.SubElement(entry, "RowNo").text = str(row_no)
    
    prekes_kodas = _s(getattr(item, 'prekes_kodas', '') or getattr(doc, 'prekes_kodas', ''))
    if prekes_kodas:
        ET.SubElement(entry, "SerialNumber").text = smart_str(prekes_kodas)
    
    ET.SubElement(entry, "SellerProductId").text = str(getattr(item, 'id', row_no))
    
    pavadinimas = _s(getattr(item, 'prekes_pavadinimas', '') or 'Prekė')
    ET.SubElement(entry, "Description").text = smart_str(pavadinimas)
    
    detail = ET.SubElement(entry, "ItemDetailInfo")
    unit = _s(getattr(item, 'unit', 'vnt') or 'vnt')
    ET.SubElement(detail, "ItemUnit").text = smart_str(unit)
    
    quantity = _safe_D(getattr(item, 'quantity', 1) or 1)
    ET.SubElement(detail, "ItemAmount").text = format_decimal(quantity, 2)
    
    price = _safe_D(getattr(item, 'price', 0) or 0)
    ET.SubElement(detail, "ItemPrice").text = format_decimal(price, 2)
    
    item_sum = price * quantity
    ET.SubElement(entry, "ItemSum").text = format_decimal(item_sum, 2)
    
    discount = _safe_D(getattr(item, 'discount', 0) or 0)
    addition = ET.SubElement(entry, "Addition")
    addition.set("addCode", "DSC")
    discount_pct = "0"
    if price > 0 and discount > 0:
        discount_pct = format_decimal((discount / price) * 100, 0)
    ET.SubElement(addition, "AddContent").text = f"{discount_pct}%"
    ET.SubElement(addition, "AddSum").text = format_decimal(discount * quantity, 2)
    
    vat_elem = ET.SubElement(entry, "VAT")
    sum_before_vat = item_sum
    ET.SubElement(vat_elem, "SumBeforeVAT").text = format_decimal(sum_before_vat, 2)
    
    vat_percent = _safe_D(getattr(item, 'vat_percent', 21) or 21)
    ET.SubElement(vat_elem, "VATRate").text = get_vat_rate(vat_percent)
    
    vat_sum = _safe_D(getattr(item, 'vat', 0) or 0)
    ET.SubElement(vat_elem, "VATSum").text = format_decimal(vat_sum, 2)
    
    sum_after_vat = sum_before_vat + vat_sum
    ET.SubElement(vat_elem, "SumAfterVAT").text = format_decimal(sum_after_vat, 2)


def _add_item_entry_from_doc(item_group, doc):
    """Добавляет ItemEntry из документа без строк."""
    entry = ET.SubElement(item_group, "ItemEntry")
    
    ET.SubElement(entry, "RowNo").text = "1"
    
    prekes_kodas = _s(getattr(doc, 'prekes_kodas', ''))
    if prekes_kodas:
        ET.SubElement(entry, "SerialNumber").text = smart_str(prekes_kodas)
    
    ET.SubElement(entry, "SellerProductId").text = str(getattr(doc, 'id', '1'))
    
    pavadinimas = _s(getattr(doc, 'prekes_pavadinimas', '') or 'Prekė')
    ET.SubElement(entry, "Description").text = smart_str(pavadinimas)
    
    detail = ET.SubElement(entry, "ItemDetailInfo")
    unit = _s(getattr(doc, 'unit', 'vnt') or 'vnt')
    ET.SubElement(detail, "ItemUnit").text = smart_str(unit)
    ET.SubElement(detail, "ItemAmount").text = "1.00"
    
    amount_wo_vat = _safe_D(getattr(doc, 'amount_wo_vat', 0) or 0)
    ET.SubElement(detail, "ItemPrice").text = format_decimal(amount_wo_vat, 2)
    
    ET.SubElement(entry, "ItemSum").text = format_decimal(amount_wo_vat, 2)
    
    discount = _safe_D(getattr(doc, 'invoice_discount_wo_vat', 0) or 0)
    addition = ET.SubElement(entry, "Addition")
    addition.set("addCode", "DSC")
    ET.SubElement(addition, "AddContent").text = "0%"
    ET.SubElement(addition, "AddSum").text = format_decimal(discount, 2)
    
    vat_elem = ET.SubElement(entry, "VAT")
    ET.SubElement(vat_elem, "SumBeforeVAT").text = format_decimal(amount_wo_vat, 2)
    
    vat_percent = _safe_D(getattr(doc, 'vat_percent', 21) or 21)
    ET.SubElement(vat_elem, "VATRate").text = get_vat_rate(vat_percent)
    
    vat_amount = _safe_D(getattr(doc, 'vat_amount', 0) or 0)
    ET.SubElement(vat_elem, "VATSum").text = format_decimal(vat_amount, 2)
    
    amount_with_vat = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    ET.SubElement(vat_elem, "SumAfterVAT").text = format_decimal(amount_with_vat, 2)


def _add_payment_info_pirkimas(invoice, doc):
    """Добавляет PaymentInfo для pirkimas - все данные из seller_* полей."""
    payment = ET.SubElement(invoice, "PaymentInfo")
    
    currency = (getattr(doc, 'currency', 'EUR') or 'EUR').upper()
    ET.SubElement(payment, "Currency").text = currency
    
    number = _s(getattr(doc, 'document_number', ''))
    ET.SubElement(payment, "PaymentDescription").text = f"Apmokėjimas pagal sąskaitą Nr. {number}"
    ET.SubElement(payment, "Payable").text = "YES"
    
    due_date = getattr(doc, 'due_date', None)
    if due_date:
        ET.SubElement(payment, "PayDueDate").text = format_date_pragma(due_date)
    
    amount_with_vat = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    ET.SubElement(payment, "PaymentTotalSum").text = format_decimal(amount_with_vat, 2)
    
    doc_id = str(getattr(doc, 'id', '') or '')
    ET.SubElement(payment, "PaymentId").text = doc_id
    
    seller_iban = _s(getattr(doc, 'seller_iban', ''))
    if seller_iban:
        ET.SubElement(payment, "PayToAccount").text = smart_str(seller_iban)
    
    seller_name = _s(getattr(doc, 'seller_name', ''))
    if seller_name:
        ET.SubElement(payment, "PayToName").text = smart_str(seller_name)


def _add_payment_info_pardavimas(invoice, doc):
    """Добавляет PaymentInfo для pardavimas - все данные из seller_* полей."""
    payment = ET.SubElement(invoice, "PaymentInfo")
    
    currency = (getattr(doc, 'currency', 'EUR') or 'EUR').upper()
    ET.SubElement(payment, "Currency").text = currency
    
    number = _s(getattr(doc, 'document_number', ''))
    ET.SubElement(payment, "PaymentDescription").text = f"Apmokėjimas pagal sąskaitą Nr. {number}"
    ET.SubElement(payment, "Payable").text = "YES"
    
    due_date = getattr(doc, 'due_date', None)
    if due_date:
        ET.SubElement(payment, "PayDueDate").text = format_date_pragma(due_date)
    
    amount_with_vat = _safe_D(getattr(doc, 'amount_with_vat', 0) or 0)
    ET.SubElement(payment, "PaymentTotalSum").text = format_decimal(amount_with_vat, 2)
    
    doc_id = str(getattr(doc, 'id', '') or '')
    ET.SubElement(payment, "PaymentId").text = doc_id
    
    seller_name = _s(getattr(doc, 'seller_name', ''))
    if seller_name:
        ET.SubElement(payment, "PayToName").text = smart_str(seller_name)
    
    seller_iban = _s(getattr(doc, 'seller_iban', ''))
    if seller_iban:
        ET.SubElement(payment, "PayToAccount").text = smart_str(seller_iban)