# backend/docscanner_app/exports/apskaita5.py
import xml.etree.ElementTree as ET
from xml.dom import minidom
from django.utils.encoding import smart_str
from django.utils.timezone import localdate

from .formatters import format_date, get_price_or_zero, expand_empty_tags

FNS = {"xsi": "http://www.w3.org/2001/XMLSchema-instance"}
# SCHEMA_URL = "https://app.ivesk.lt/api/schema/xmlexport.xsd"


def _pretty_bytes(elem: ET.Element) -> bytes:
    """
    Возвращает красивый XML (bytes) с декларацией, без пустых строк.
    """
    rough = ET.tostring(elem, encoding="utf-8")
    parsed = minidom.parseString(rough)
    xml = parsed.toprettyxml(indent="  ", encoding="utf-8")
    # убираем пустые строки
    lines = [l for l in xml.decode("utf-8").split("\n") if l.strip()]
    return "\n".join(lines).encode("utf-8")


def _docnum_and_id(doc) -> str:
    """
    Собирает docnum/id из серии и номера:
    - если number не начинается с series -> series+number
    - иначе -> number
    """
    series = smart_str(getattr(doc, "document_series", "") or "")
    number = smart_str(getattr(doc, "document_number", "") or "")
    if series and not number.startswith(series):
        return f"{series}{number}"
    return number


def _select_code(primary, secondary, default_value: str) -> str:
    """
    Возвращает первый непустой код, иначе default_value.
    """
    for v in (primary, secondary):
        s = smart_str(v or "")
        if s.strip():
            return s
    return default_value


def _iter_line_items(doc):
    """
    Безопасно получаем список LineItem:
    - RelatedManager -> .all()
    - список/кортеж -> как есть
    - иначе -> []
    """
    li = getattr(doc, "line_items", None)
    if li is None:
        return []
    if hasattr(li, "all"):
        qs = li.all()
        try:
            # если есть .exists(), используем его чтобы избежать пустой итерации
            if hasattr(qs, "exists") and not qs.exists():
                return []
        except Exception:
            pass
        return list(qs)
    if isinstance(li, (list, tuple)):
        return list(li)
    return []


def export_documents_group_to_apskaita5(documents, site_url: str) -> bytes:
    """
    Экспорт списка документов в XML для Apskaita5.
    ВАЖНО: по твоим правилам:
      - <id> = тот же, что <docnum> (series+number)
      - <date> = invoice_date
      - <operationdate> = operation_date или invoice_date
      - <duedate> = due_date или invoice_date
      - <subtotal>/<vat>/<total> берём ИЗ ПОЛЕЙ ДОКУМЕНТА: amount_wo_vat / vat_amount / amount_with_vat
      - <url> = preview_url
      - <separatevat> = separate_vat
      - <sellerid> = seller_id -> seller_vat_code -> "neraPardavejoImonesKodo"
      - <buyerid>  = buyer_id  -> buyer_vat_code  -> "neraPirkejoImonesKodo"
      - <hasreceipt> = with_receipt
      - В строках: <price>=price, <vat>=vat, <warehouse>=sandelio_kodas и т.п.
    """
    root = ET.Element("documents", {
        "xmlns:xsi": FNS["xsi"]
        # В примере XSD указан noNamespaceSchemaLocation — добавляем для совместимости
        # "xsi:noNamespaceSchemaLocation": SCHEMA_URL,
    })

    for doc in documents:
        doc_el = ET.SubElement(root, "document")

        # --- id/docnum ---
        dok_num = _docnum_and_id(doc)
        ET.SubElement(doc_el, "id").text = dok_num

        # --- даты ---
        inv_date = getattr(doc, "invoice_date", None) or localdate()
        op_date = getattr(doc, "operation_date", None) or inv_date
        due_date = getattr(doc, "due_date", None) or inv_date

        ET.SubElement(doc_el, "date").text = format_date(inv_date)
        ET.SubElement(doc_el, "operationdate").text = format_date(op_date)
        ET.SubElement(doc_el, "duedate").text = format_date(due_date)
        ET.SubElement(doc_el, "docnum").text = dok_num

        # --- суммы документа (ИЗ ПОЛЕЙ ДОКУМЕНТА, как ты просил) ---
        ET.SubElement(doc_el, "subtotal").text = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
        ET.SubElement(doc_el, "vat").text = get_price_or_zero(getattr(doc, "vat_amount", None))
        ET.SubElement(doc_el, "total").text = get_price_or_zero(getattr(doc, "amount_with_vat", None))
        ET.SubElement(doc_el, "currency").text = smart_str(getattr(doc, "currency", "") or "EUR")

        # --- ссылка/файл ---
        ET.SubElement(doc_el, "url").text = smart_str(getattr(doc, "preview_url", "") or "")
        ET.SubElement(doc_el, "filename").text = smart_str(getattr(doc, "original_filename", "") or f"{dok_num}.pdf")

        # --- флаги ---
        ET.SubElement(doc_el, "report2isaf").text = "true"
        ET.SubElement(doc_el, "separatevat").text = "true" if getattr(doc, "separate_vat", True) else "false"

        # --- seller ---
        seller_id = _select_code(getattr(doc, "seller_id", None),
                                 getattr(doc, "seller_vat_code", None),
                                 "neraPardavejoImonesKodo")
        ET.SubElement(doc_el, "sellerid").text = seller_id
        ET.SubElement(doc_el, "sellercode").text = smart_str(getattr(doc, "seller_id", "") or "")
        ET.SubElement(doc_el, "sellervat").text = smart_str(getattr(doc, "seller_vat_code", "") or "")
        ET.SubElement(doc_el, "sellername").text = smart_str(getattr(doc, "seller_name", "") or "")
        ET.SubElement(doc_el, "selleraddress").text = smart_str(getattr(doc, "seller_address", "") or "")
        ET.SubElement(doc_el, "sellerisperson").text = "true" if getattr(doc, "seller_is_person", False) else "false"
        ET.SubElement(doc_el, "sellercountry").text = smart_str(
            (getattr(doc, "seller_country_iso", "") or "LT").lower()
        )
        ET.SubElement(doc_el, "selleriban").text = smart_str(getattr(doc, "seller_iban", "") or "")

        # --- buyer ---
        buyer_id = _select_code(getattr(doc, "buyer_id", None),
                                getattr(doc, "buyer_vat_code", None),
                                "neraPirkejoImonesKodo")
        ET.SubElement(doc_el, "buyerid").text = buyer_id
        ET.SubElement(doc_el, "buyercode").text = smart_str(getattr(doc, "buyer_id", "") or "")
        ET.SubElement(doc_el, "buyervat").text = smart_str(getattr(doc, "buyer_vat_code", "") or "")
        ET.SubElement(doc_el, "buyername").text = smart_str(getattr(doc, "buyer_name", "") or "")
        ET.SubElement(doc_el, "buyeraddress").text = smart_str(getattr(doc, "buyer_address", "") or "")
        ET.SubElement(doc_el, "buyerisperson").text = "true" if getattr(doc, "buyer_is_person", False) else "false"
        ET.SubElement(doc_el, "buyercountry").text = smart_str(
            (getattr(doc, "buyer_country_iso", "") or "LT").lower()
        )

        # --- receipt ---
        ET.SubElement(doc_el, "hasreceipt").text = "true" if getattr(doc, "with_receipt", False) else "false"

        # --- строки ---
        line_items = _iter_line_items(doc)
        if line_items:
            for idx, li in enumerate(line_items):
                line_el = ET.SubElement(doc_el, "line")
                ET.SubElement(line_el, "lineid").text = str(idx)

                ET.SubElement(line_el, "price").text = get_price_or_zero(getattr(li, "price", None))
                ET.SubElement(line_el, "subtotal").text = get_price_or_zero(getattr(li, "subtotal", None))
                ET.SubElement(line_el, "vat").text = get_price_or_zero(getattr(li, "vat", None))
                ET.SubElement(line_el, "vatpercent").text = get_price_or_zero(getattr(li, "vat_percent", None))
                ET.SubElement(line_el, "total").text = get_price_or_zero(getattr(li, "total", None))

                code_val = smart_str(
                    getattr(li, "prekes_kodas", "") or getattr(li, "prekes_barkodas", "") or "neraPrekesKodo"
                )
                ET.SubElement(line_el, "code").text = code_val
                ET.SubElement(line_el, "name").text = smart_str(getattr(li, "prekes_pavadinimas", "") or "")
                ET.SubElement(line_el, "unit").text = smart_str(getattr(li, "unit", "") or "vnt")
                ET.SubElement(line_el, "quantity").text = get_price_or_zero(getattr(li, "quantity", None))
                ET.SubElement(line_el, "vatclass").text = smart_str(getattr(li, "pvm_kodas", "") or "")
                ET.SubElement(line_el, "warehouse").text = smart_str(getattr(li, "sandelio_kodas", "") or "")
                # object — опциональный, оставим пустым
                ET.SubElement(line_el, "object").text = ""
        else:
            # Фоллбек, если нет строк (LineItem)
            line_el = ET.SubElement(doc_el, "line")
            ET.SubElement(line_el, "lineid").text = "0"
            # price пусть будет = subtotal, чтобы не было расхождений
            ET.SubElement(line_el, "price").text = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
            ET.SubElement(line_el, "subtotal").text = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
            ET.SubElement(line_el, "vat").text = get_price_or_zero(getattr(doc, "vat_amount", None))
            ET.SubElement(line_el, "vatpercent").text = "0"
            ET.SubElement(line_el, "total").text = get_price_or_zero(getattr(doc, "amount_with_vat", None))
            ET.SubElement(line_el, "code").text = "neraPrekesKodo"
            ET.SubElement(line_el, "name").text = smart_str(getattr(doc, "prekes_pavadinimas", "") or "")
            ET.SubElement(line_el, "unit").text = "vnt"
            ET.SubElement(line_el, "quantity").text = "1"
            ET.SubElement(line_el, "vatclass").text = ""
            ET.SubElement(line_el, "warehouse").text = ""
            ET.SubElement(line_el, "object").text = ""

    # Красиво и разворачиваем пустые теги (как в Finvalda)
    xml_bytes = _pretty_bytes(root)
    return expand_empty_tags(xml_bytes)

