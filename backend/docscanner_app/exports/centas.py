import io
import zipfile
import xml.etree.ElementTree as ET
from xml.dom import minidom
from django.utils.encoding import smart_str
from django.http import HttpResponse
from datetime import date
from ..models import ScannedDocument
import re

def format_date(date_obj):
    return date_obj.strftime("%Y.%m.%d") if date_obj else ""

def vat_to_int_str(val):
    try:
        if val is None or str(val).strip() == "":
            return "0"
        if float(val) == 0:
            return "0"
        return str(int(float(val)))
    except Exception:
        return "0"

def get_price_or_zero(val):
    try:
        if val is None or str(val).strip() == "":
            return "0.00"
        val_f = float(val)
        if val_f == 0:
            return "0.00"
        return f"{val_f:.2f}"
    except Exception:
        return "0.00"

def expand_empty_tags(xml_bytes):
    # Преобразует <tag/> и <tag /> в <tag></tag> во всём XML (включая namespace)
    # Работает и с юникод-строкой, и с байтовой строкой
    if isinstance(xml_bytes, bytes):
        xml_str = xml_bytes.decode('utf-8')
    else:
        xml_str = xml_bytes

    # Поддержка тегов с namespace и атрибутами!
    pattern = r'<([a-zA-Z0-9:_\-]+)([^>]*)\s*/>'
    repl = r'<\1\2></\1>'
    xml_str = re.sub(pattern, repl, xml_str)
    return xml_str.encode('utf-8')

def export_document_to_centras_xml(document: ScannedDocument, orig_path: str = "") -> bytes:
    root = ET.Element('root')
    dok = ET.SubElement(root, 'dokumentas')

    if document.pirkimas_pardavimas == 'pirkimas':
        party_prefix = 'seller'
    elif document.pirkimas_pardavimas == 'pardavimas':
        party_prefix = 'buyer'
    else:
        party_prefix = 'seller'

    ET.SubElement(dok, 'kontrah').text         = smart_str(getattr(document, f"{party_prefix}_name", "") or "")
    ET.SubElement(dok, 'kontrah_kodas').text   = smart_str(getattr(document, f"{party_prefix}_id_programoje", "") or "")
    ET.SubElement(dok, 'salis').text           = smart_str(getattr(document, f"{party_prefix}_country", "") or "")
    ET.SubElement(dok, 'salis_kodas').text     = smart_str(getattr(document, f"{party_prefix}_country_iso", "") or "")
    ET.SubElement(dok, 'adresas').text         = smart_str(getattr(document, f"{party_prefix}_address", "") or "")
    ET.SubElement(dok, 'im_kodas').text        = smart_str(getattr(document, f"{party_prefix}_id", "") or "")
    ET.SubElement(dok, 'pvm_kodas').text       = smart_str(getattr(document, f"{party_prefix}_vat_code", "") or "")
    ET.SubElement(dok, 'as_num').text          = smart_str(getattr(document, f"{party_prefix}_iban", "") or "")

    invoice_date = document.invoice_date
    due_date = document.due_date or invoice_date
    reg_data = getattr(document, "operation_date", None) or invoice_date
    apsk_data = getattr(document, "operation_date", None) or invoice_date

    ET.SubElement(dok, 'data').text        = format_date(invoice_date)
    ET.SubElement(dok, 'dok_suma').text    = get_price_or_zero(document.amount_with_vat)
    
    # ====== Обновлённая логика для dok_num ======
    series = smart_str(document.document_series or "")
    number = smart_str(document.document_number or "")
    if series and not number.startswith(series):
        dok_num = f"{series}{number}"
    else:
        dok_num = number
    ET.SubElement(dok, 'dok_num').text     = dok_num
    # ============================================

    ET.SubElement(dok, 'apmok_iki').text   = format_date(due_date)
    ET.SubElement(dok, 'pvm_suma').text    = get_price_or_zero(document.vat_amount)
    ET.SubElement(dok, 'bepvm_suma').text  = get_price_or_zero(document.amount_wo_vat)
    ET.SubElement(dok, 'orig_nuoroda').text= smart_str(document.preview_url or orig_path or "")
    ET.SubElement(dok, 'isaf').text        = "taip"
    ET.SubElement(dok, 'reg_data').text    = format_date(reg_data)
    ET.SubElement(dok, 'apsk_data').text   = format_date(apsk_data)

    # Все line_items (eilute)
    line_items = getattr(document, "line_items", None)
    if line_items and hasattr(line_items, 'all') and line_items.exists():
        for item in line_items.all():
            eilute = ET.SubElement(dok, "eilute")
            ET.SubElement(eilute, "kodas").text        = smart_str(getattr(item, "prekes_kodas", None) or "PREKES")
            ET.SubElement(eilute, "pavadinimas").text  = smart_str(getattr(item, "prekes_pavadinimas", None) or "PIRKIMAS")
            ET.SubElement(eilute, "matovnt").text      = getattr(item, "unit", None) or "d.v."
            ET.SubElement(eilute, "kiekis").text       = str(getattr(item, "quantity", None) or "1")
            ET.SubElement(eilute, "kaina").text        = get_price_or_zero(getattr(item, "price", None))
            ET.SubElement(eilute, "pvmtar").text       = vat_to_int_str(getattr(item, "vat_percent", None))
            ET.SubElement(eilute, "mok_kodas").text    = smart_str(getattr(item, "pvm_kodas", None) or "")
            ET.SubElement(eilute, "sandelis").text     = smart_str(getattr(item, "sandelio_kodas", None) or "")
    else:
        # Если нет line_items — только одна строка
        eilute = ET.SubElement(dok, "eilute")
        ET.SubElement(eilute, "kodas").text        = smart_str(getattr(document, "prekes_kodas", None) or "PREKES")
        ET.SubElement(eilute, "pavadinimas").text  = smart_str(getattr(document, "prekes_pavadinimas", None) or "PIRKIMAS")
        ET.SubElement(eilute, "matovnt").text      = "d.v."
        ET.SubElement(eilute, "kiekis").text       = "1"
        ET.SubElement(eilute, "kaina").text        = get_price_or_zero(getattr(document, "amount_wo_vat", None))
        ET.SubElement(eilute, "pvmtar").text       = vat_to_int_str(getattr(document, "vat_percent", None))
        ET.SubElement(eilute, "mok_kodas").text    = smart_str(getattr(document, "pvm_kodas", None) or "")
        ET.SubElement(eilute, "sandelis").text     = smart_str(getattr(document, "sandelio_kodas", None) or "")

    xml_bytes = ET.tostring(root, encoding="utf-8")
    return xml_bytes


def export_documents_group_to_centras_xml(documents):
    root = ET.Element('root')
    for doc in documents:
        xml_bytes = export_document_to_centras_xml(doc)
        doc_tree = ET.fromstring(xml_bytes)
        dokumentas = doc_tree.find('dokumentas')
        root.append(dokumentas)
    compact_bytes = ET.tostring(root, encoding="utf-8")
    # Красивый формат (с отступами)
    pretty_bytes = minidom.parseString(compact_bytes).toprettyxml(indent="  ").encode('utf-8')
    # Вот здесь, после всех манипуляций, превращаем <tag/> в <tag></tag>
    final_bytes = expand_empty_tags(pretty_bytes)
    return final_bytes

def export_selected_docs_view(request):
    today_str = date.today().strftime('%Y-%m-%d')
    ids = request.GET.getlist('ids[]') or request.POST.getlist('ids[]')
    documents = ScannedDocument.objects.filter(pk__in=ids)

    pirkimai = [doc for doc in documents if getattr(doc, 'pirkimas_pardavimas', None) == 'pirkimas']
    pardavimai = [doc for doc in documents if getattr(doc, 'pirkimas_pardavimas', None) == 'pardavimas']

    if pirkimai and pardavimai:
        files_to_export = []
        xml_bytes = export_documents_group_to_centras_xml(pirkimai)
        files_to_export.append((f"{today_str}_pirkimai.xml", xml_bytes))
        xml_bytes = export_documents_group_to_centras_xml(pardavimai)
        files_to_export.append((f"{today_str}_pardavimai.xml", xml_bytes))
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for filename, xml_bytes in files_to_export:
                zf.writestr(filename, xml_bytes)
        zip_buffer.seek(0)
        response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename={today_str}_importui.zip'
        return response
    elif pirkimai:
        xml_bytes = export_documents_group_to_centras_xml(pirkimai)
        filename = f"{today_str}_pirkimai.xml"
        response = HttpResponse(xml_bytes, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename={filename}'
        return response
    elif pardavimai:
        xml_bytes = export_documents_group_to_centras_xml(pardavimai)
        filename = f"{today_str}_pardavimai.xml"
        response = HttpResponse(xml_bytes, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename={filename}'
        return response
    else:
        return HttpResponse("No documents to export.", status=400)
