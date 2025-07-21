import io
import zipfile
import xml.etree.ElementTree as ET
from xml.dom import minidom
from django.utils.encoding import smart_str
from django.http import HttpResponse
from datetime import date
from ..models import ScannedDocument

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

def export_document_to_centras_xml(document: ScannedDocument, orig_path: str = "") -> bytes:
    root = ET.Element('root')
    dok = ET.SubElement(root, 'dokumentas')

    # Определяем, какие поля использовать
    if document.pirkimas_pardavimas == 'pirkimas':
        party_prefix = 'seller'
    elif document.pirkimas_pardavimas == 'pardavimas':
        party_prefix = 'buyer'
    else:
        party_prefix = 'seller'  # по умолчанию

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
    ET.SubElement(dok, 'dok_suma').text    = str(document.amount_with_vat or "")
    ET.SubElement(dok, 'dok_num').text     = smart_str(document.document_number or "")
    ET.SubElement(dok, 'apmok_iki').text   = format_date(due_date)
    ET.SubElement(dok, 'pvm_suma').text    = str(document.vat_amount if document.vat_amount is not None else "0")
    ET.SubElement(dok, 'bepvm_suma').text  = str(document.amount_wo_vat or "")
    ET.SubElement(dok, 'orig_nuoroda').text= smart_str(document.preview_url or orig_path or "")
    ET.SubElement(dok, 'isaf').text        = "taip"
    ET.SubElement(dok, 'reg_data').text    = format_date(reg_data)
    ET.SubElement(dok, 'apsk_data').text   = format_date(apsk_data)

    # Все line_items (eilute)
    line_items = getattr(document, "line_items", None)
    if line_items and hasattr(line_items, 'all') and line_items.exists():
        for item in line_items.all():
            eilute = ET.SubElement(dok, "eilute")
            ET.SubElement(eilute, "kodas").text        = smart_str(item.prekes_kodas or "PREKES")
            ET.SubElement(eilute, "pavadinimas").text  = smart_str(item.prekes_pavadinimas or "PIRKIMAS")
            ET.SubElement(eilute, "matovnt").text      = item.unit or "d.v."
            ET.SubElement(eilute, "kiekis").text       = str(item.quantity or "1")
            ET.SubElement(eilute, "kaina").text        = str(item.price or "")
            ET.SubElement(eilute, "pvmtar").text       = vat_to_int_str(item.vat_percent)
            ET.SubElement(eilute, "mok_kodas").text    = smart_str(item.pvm_kodas or "")
            ET.SubElement(eilute, "sandelis").text     = smart_str(item.sandelio_kodas or "")
    else:
        # Если нет line_items — только одна строка
        eilute = ET.SubElement(dok, "eilute")
        ET.SubElement(eilute, "kodas").text        = smart_str(document.prekes_kodas or "PREKES")
        ET.SubElement(eilute, "pavadinimas").text  = smart_str(document.prekes_pavadinimas or "PIRKIMAS")
        ET.SubElement(eilute, "matovnt").text      = "d.v."
        ET.SubElement(eilute, "kiekis").text       = "1"
        ET.SubElement(eilute, "kaina").text        = str(document.amount_wo_vat or "")
        ET.SubElement(eilute, "pvmtar").text       = vat_to_int_str(document.vat_percent)
        ET.SubElement(eilute, "mok_kodas").text    = smart_str(document.pvm_kodas or "")
        ET.SubElement(eilute, "sandelis").text     = smart_str(document.sandelio_kodas or "")

    # Компактный XML
    xml_bytes = ET.tostring(root, encoding="utf-8")
    return xml_bytes

def export_documents_group_to_centras_xml(documents):
    """
    Собирает несколько документов в один XML и возвращает результат как bytes (utf-8)
    """
    root = ET.Element('root')
    for doc in documents:
        xml_bytes = export_document_to_centras_xml(doc)
        doc_tree = ET.fromstring(xml_bytes)
        dokumentas = doc_tree.find('dokumentas')
        root.append(dokumentas)
    # Красивый формат (с отступами)
    compact_bytes = ET.tostring(root, encoding="utf-8")
    pretty_bytes = minidom.parseString(compact_bytes).toprettyxml(indent="  ").encode('utf-8')
    return pretty_bytes

def export_selected_docs_view(request):
    today_str = date.today().strftime('%Y-%m-%d')
    ids = request.GET.getlist('ids[]') or request.POST.getlist('ids[]')
    documents = ScannedDocument.objects.filter(pk__in=ids)

    # Группируем
    pirkimai = [doc for doc in documents if getattr(doc, 'pirkimas_pardavimas', None) == 'pirkimas']
    pardavimai = [doc for doc in documents if getattr(doc, 'pirkimas_pardavimas', None) == 'pardavimas']

    print("DEBUG: Всего документов:", len(documents))
    for d in documents:
        print(f"id={d.pk}, type={getattr(d, 'pirkimas_pardavimas', None)}")
    print("pirkimai:", len(pirkimai), "pardavimai:", len(pardavimai))

    # Определяем, есть ли оба типа документов
    if pirkimai and pardavimai:
        # Оба типа: ZIP
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
        # Только покупки: один xml
        xml_bytes = export_documents_group_to_centras_xml(pirkimai)
        filename = f"{today_str}_pirkimai.xml"
        response = HttpResponse(xml_bytes, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename={filename}'
        return response
    elif pardavimai:
        # Только продажи: один xml
        xml_bytes = export_documents_group_to_centras_xml(pardavimai)
        filename = f"{today_str}_pardavimai.xml"
        response = HttpResponse(xml_bytes, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename={filename}'
        return response
    else:
        return HttpResponse("No documents to export.", status=400)