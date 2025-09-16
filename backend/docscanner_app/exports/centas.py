import random
import xml.etree.ElementTree as ET
from xml.dom import minidom
from django.utils import timezone
from django.utils.encoding import smart_str

from ..models import ScannedDocument
from .formatters import format_date, vat_to_int_str, get_price_or_zero, expand_empty_tags


# =========================
# Helpers
# =========================
def prettify_no_header(elem: ET.Element) -> bytes:
    """
    Возвращает XML (bytes) с удалением пустых строк и заменой &quot; на ".
    Заголовок <?xml ...?> сохраняется.
    """
    rough_string = ET.tostring(elem, encoding="utf-8")
    reparsed = minidom.parseString(rough_string)
    pretty_xml = reparsed.toprettyxml(indent="  ")
    # убрать полностью пустые строки
    pretty_xml = '\n'.join([line for line in pretty_xml.split('\n') if line.strip()])
    # ВАЖНО: заменяем только &quot;, не трогаем &amp;/&lt;/&gt;
    pretty_xml = pretty_xml.replace("&quot;", '"')
    return pretty_xml.encode("utf-8")


def _nz(v) -> bool:
    """Есть ли непустая строка после strip()."""
    return bool((str(v).strip() if v is not None else ""))


def _infer_direction(document: ScannedDocument, direction_hint: str | None) -> tuple[str, str]:
    """
    Возвращает (party_prefix, kontrah_tag) на основе:
      1) явного direction_hint ('pirkimas'/'pardavimas')
      2) эвристики по заполненности buyer/seller ID/VAT
      3) дефолт — 'seller'/'kontrah'
    """
    dir_ = (direction_hint or getattr(document, 'pirkimas_pardavimas', '') or '').strip().lower()
    if dir_ not in ('pirkimas', 'pardavimas'):
        if _nz(getattr(document, 'buyer_id', None)) or _nz(getattr(document, 'buyer_vat_code', None)):
            dir_ = 'pardavimas'
        elif _nz(getattr(document, 'seller_id', None)) or _nz(getattr(document, 'seller_vat_code', None)):
            dir_ = 'pirkimas'
        else:
            dir_ = 'pirkimas'

    if dir_ == 'pirkimas':
        return 'seller', 'kontrah'
    else:  # 'pardavimas'
        return 'buyer', 'pirkejas'


def _resolve_party_code(document: ScannedDocument, id_field: str, vat_field: str) -> str:
    """
    Код контрагента по логике:
      1) <id> если непустой
      2) иначе <vat_code> если непустой
      3) иначе 'NERAKODO'
    """
    v = getattr(document, id_field, None)
    if _nz(v):
        return smart_str(str(v).strip())
    v = getattr(document, vat_field, None)
    if _nz(v):
        return smart_str(str(v).strip())
    return "NERAKODO"


def _fallback_doc_num(series: str, number: str) -> str:
    """
    Номер документа:
      - оба пустые  -> NERANUMERIO + 5 случайных цифр
      - только number -> number
      - только series -> series
      - оба есть      -> series + number (если number не начинается с series)
    """
    s = (series or "").strip()
    n = (number or "").strip()
    if not s and not n:
        return f"NERANUMERIO{random.randint(0, 99999):05d}"
    if s and not n:
        return s
    if n and not s:
        return n
    return n if n.startswith(s) else f"{s}{n}"


# =========================
# Export: single document
# =========================
def export_document_to_centras_xml(
    document: ScannedDocument,
    orig_path: str = "",
    direction: str | None = None,  # 'pirkimas' / 'pardavimas'
) -> bytes:
    """
    Генерирует XML для одного документа Centas.
    ВАЖНО: если используется multi-view с overrides, передавай direction.
    """
    root = ET.Element('root')
    dok = ET.SubElement(root, 'dokumentas')

    # 1) Направление и теги стороны
    party_prefix, kontrah_tag = _infer_direction(document, direction)

    # 2) Имя контрагента (жёсткий дефолт)
    kontrah_name = getattr(document, f"{party_prefix}_name", "") or "NERAPAVADINIMO"
    ET.SubElement(dok, kontrah_tag).text = smart_str(kontrah_name)

    # 3) Коды контрагента: ОДИНАКОВЫЕ для kontrah_kodas и im_kodas
    #    Логика: <party>_id -> <party>_vat_code -> 'NERAKODO'
    party_code = _resolve_party_code(document, f"{party_prefix}_id", f"{party_prefix}_vat_code")
    ET.SubElement(dok, 'kontrah_kodas').text = party_code
    ET.SubElement(dok, 'im_kodas').text     = party_code

    # 4) Адресные и банковские реквизиты
    ET.SubElement(dok, 'salis').text       = smart_str(getattr(document, f"{party_prefix}_country", "") or "")
    ET.SubElement(dok, 'salis_kodas').text = smart_str((getattr(document, f"{party_prefix}_country_iso", "") or "").upper())
    ET.SubElement(dok, 'adresas').text     = smart_str(getattr(document, f"{party_prefix}_address", "") or "")
    ET.SubElement(dok, 'pvm_kodas').text   = smart_str(getattr(document, f"{party_prefix}_vat_code", "") or "")
    ET.SubElement(dok, 'as_num').text      = smart_str(getattr(document, f"{party_prefix}_iban", "") or "")

    # 5) Даты: invoice_date→today, due_date→invoice_date, reg/apsk→operation_date|invoice_date
    invoice_date = getattr(document, "invoice_date", None) or timezone.now().date()
    due_date = getattr(document, "due_date", None) or invoice_date
    reg_data = getattr(document, "operation_date", None) or invoice_date
    apsk_data = getattr(document, "operation_date", None) or invoice_date

    ET.SubElement(dok, 'data').text      = format_date(invoice_date)

    # 6) Суммы
    ET.SubElement(dok, 'dok_suma').text   = get_price_or_zero(getattr(document, "amount_with_vat", None))
    ET.SubElement(dok, 'pvm_suma').text   = get_price_or_zero(getattr(document, "vat_amount", None))
    ET.SubElement(dok, 'bepvm_suma').text = get_price_or_zero(getattr(document, "amount_wo_vat", None))

    # 7) Валюта (верхним регистром, дефолт EUR)
    currency = (getattr(document, "currency", "") or "EUR").upper()
    ET.SubElement(dok, 'dok_val').text = smart_str(currency)

    # 8) Номер документа — правила series/number/рандом
    series = smart_str(getattr(document, "document_series", "") or "")
    number = smart_str(getattr(document, "document_number", "") or "")
    dok_num = _fallback_doc_num(series, number)
    ET.SubElement(dok, 'dok_num').text = smart_str(dok_num)

    # 9) Прочее: ссылка на оригинал, iSAF, рег/учётные даты
    ET.SubElement(dok, 'apmok_iki').text   = format_date(due_date)
    ET.SubElement(dok, 'orig_nuoroda').text= smart_str(getattr(document, "preview_url", None) or orig_path or "")
    ET.SubElement(dok, 'isaf').text        = "taip"
    ET.SubElement(dok, 'reg_data').text    = format_date(reg_data)
    ET.SubElement(dok, 'apsk_data').text   = format_date(apsk_data)

    # 10) Для продаж — savikaina=0
    if kontrah_tag == 'pirkejas':
        ET.SubElement(dok, 'savikaina').text = "0"

    # 11) Строки (eilute)
    line_items = getattr(document, "line_items", None)
    if line_items and hasattr(line_items, 'all') and line_items.exists():
        for item in line_items.all():
            eilute = ET.SubElement(dok, "eilute")
            code_val = ((getattr(item, "prekes_kodas", None) or "").strip()
                or (getattr(item, "prekes_barkodas", None) or "").strip()
                or "PREKES")
            ET.SubElement(eilute, "kodas").text = smart_str(code_val)
            ET.SubElement(eilute, "pavadinimas").text  = smart_str(getattr(item, "prekes_pavadinimas", None) or "PIRKIMAS")
            ET.SubElement(eilute, "matovnt").text      = smart_str(getattr(item, "unit", None) or "d.v.")  # unit | d.v.
            q = getattr(item, "quantity", None)
            ET.SubElement(eilute, "kiekis").text       = str(1 if q is None else q)  # None→1, 0 сохраняем
            ET.SubElement(eilute, "kaina").text        = get_price_or_zero(getattr(item, "price", None))
            ET.SubElement(eilute, "pvmtar").text       = vat_to_int_str(getattr(item, "vat_percent", None))
            ET.SubElement(eilute, "mok_kodas").text    = smart_str(getattr(item, "pvm_kodas", None) or "")
            ET.SubElement(eilute, "sandelis").text     = smart_str(getattr(item, "sandelio_kodas", None) or "")
    else:
        eilute = ET.SubElement(dok, "eilute")
        code_val = ((getattr(document, "prekes_kodas", None) or "").strip()
            or (getattr(document, "prekes_barkodas", None) or "").strip()
            or "PREKES")
        ET.SubElement(eilute, "kodas").text = smart_str(code_val)
        ET.SubElement(eilute, "pavadinimas").text  = smart_str(getattr(document, "prekes_pavadinimas", None) or "PIRKIMAS")
        ET.SubElement(eilute, "matovnt").text      = "d.v."
        ET.SubElement(eilute, "kiekis").text       = "1"
        ET.SubElement(eilute, "kaina").text        = get_price_or_zero(getattr(document, "amount_wo_vat", None))
        ET.SubElement(eilute, "pvmtar").text       = vat_to_int_str(getattr(document, "vat_percent", None))
        ET.SubElement(eilute, "mok_kodas").text    = smart_str(getattr(document, "pvm_kodas", None) or "")
        ET.SubElement(eilute, "sandelis").text     = smart_str(getattr(document, "sandelio_kodas", None) or "")

    # 12) Итог
    return prettify_no_header(root)


# =========================
# Export: group of documents
# =========================
def export_documents_group_to_centras_xml(
    documents: list[ScannedDocument],
    direction: str | None = None,  # 'pirkimas'/'pardavimas' override для мульти-режима
) -> bytes:
    """
    Объединяет несколько документов в один <root> и применяет финальную постобработку.
    """
    root = ET.Element('root')
    for doc in documents:
        xml_bytes = export_document_to_centras_xml(doc, direction=direction)
        doc_tree = ET.fromstring(xml_bytes)
        dokumentas = doc_tree.find('dokumentas')
        if dokumentas is not None:
            root.append(dokumentas)

    pretty_bytes = prettify_no_header(root)
    final_bytes = expand_empty_tags(pretty_bytes)
    return final_bytes
