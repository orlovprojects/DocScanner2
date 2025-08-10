import xml.etree.ElementTree as ET
import random
import string
from django.utils.encoding import smart_str
from .formatters import format_date, vat_to_int_str, get_price_or_zero, expand_empty_tags
from ..models import CurrencyRate


def get_currency_rate(currency_code, date_obj):
    """
    Получить курс для валюты на заданную дату (по отношению к EUR).
    currency_code: 'USD', 'RUB', ...
    date_obj: datetime.date (например, дата документа)
    """
    if not currency_code or currency_code.upper() == "EUR":
        return 1.0
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date=date_obj).first()
    if obj:
        return obj.rate
    # fallback: ближайшая предыдущая дата
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date__lt=date_obj).order_by('-date').first()
    return obj.rate if obj else None




def prettify_no_header(elem):
    # Преобразует ET.Element в красивый XML без <?xml...> и без <root>
    from xml.dom import minidom
    rough_string = ET.tostring(elem, encoding="utf-8")
    reparsed = minidom.parseString(rough_string)
    pretty_xml = reparsed.toprettyxml(indent="  ")
    # Убираем первую строку с <?xml ... ?>
    pretty_xml = '\n'.join(pretty_xml.split('\n')[1:])
    # Убираем пустые строки и приводим к байтам
    pretty_xml = '\n'.join([line for line in pretty_xml.split('\n') if line.strip()])
    return pretty_xml.encode("utf-8")




def export_prekes_and_paslaugos_group_to_rivile(documents):
    """
    Возвращает 2 xml:
      - prekes_xml: только товары (preke)
      - paslaugos_xml: только услуги (paslauga)
    """
    prekes_dict = {}
    paslaugos_dict = {}

    for doc in documents:
        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            for item in line_items.all():
                kodas = getattr(item, "prekes_kodas", None) or getattr(item, "prekes_barkodas", None)
                tipas_val = getattr(item, "preke_paslauga", "preke")
                tipas = "1" if tipas_val == "preke" else "2"
                unit = getattr(item, "unit", None) or "VNT"
                pavadinimas = getattr(item, "prekes_pavadinimas", None) or "Prekė"

                target_dict = prekes_dict if tipas == "1" else paslaugos_dict

                if kodas and kodas not in target_dict:
                    n17 = ET.Element("N17")
                    ET.SubElement(n17, "N17_KODAS_PS").text = kodas
                    ET.SubElement(n17, "N17_TIPAS").text = tipas
                    ET.SubElement(n17, "N17_KODAS_US").text = unit
                    ET.SubElement(n17, "N17_PAV").text = smart_str(pavadinimas)
                    ET.SubElement(n17, "N17_KODAS_DS").text = "PR001"
                    target_dict[kodas] = n17
        else:
            kodas = getattr(doc, "prekes_kodas", None) or getattr(doc, "prekes_barkodas", None)
            tipas_val = getattr(doc, "preke_paslauga", "preke")
            tipas = "1" if tipas_val == "preke" else "2"
            unit = "VNT"
            pavadinimas = getattr(doc, "prekes_pavadinimas", None) or "Prekė"

            target_dict = prekes_dict if tipas == "1" else paslaugos_dict

            if kodas and kodas not in target_dict:
                n17 = ET.Element("N17")
                ET.SubElement(n17, "N17_KODAS_PS").text = kodas
                ET.SubElement(n17, "N17_TIPAS").text = tipas
                ET.SubElement(n17, "N17_KODAS_US").text = unit
                ET.SubElement(n17, "N17_PAV").text = smart_str(pavadinimas)
                ET.SubElement(n17, "N17_KODAS_DS").text = "PR001"
                target_dict[kodas] = n17

    # Склеиваем XML по отдельности
    prekes_xml = b""
    paslaugos_xml = b""
    for el in prekes_dict.values():
        prekes_xml += prettify_no_header(el) + b"\n"
    for el in paslaugos_dict.values():
        paslaugos_xml += prettify_no_header(el) + b"\n"
    return prekes_xml, paslaugos_xml





def export_clients_group_to_rivile(clients):
    """
    Экспортирует клиентов для Rivile в формате N08 (БЕЗ <root>).
    Каждый client — dict с ключами: id, vat, name, address, country_iso, currency, kodas_ds, type, is_person, iban
    """
    elements = []
    for client in clients:
        # 1) Логика выбора кода клиента
        client_code = smart_str(client.get('id') or client.get('vat') or "111111111")

        # 2) Прочее — как было
        doc_type = client.get('type', 'pirkimas')
        rusis = "2" if doc_type == 'pirkimas' else "1"
        tipas = "2" if client.get('is_person') else "1"

        currency = smart_str(client.get('currency', 'EUR')).upper()
        val_poz = "0" if currency == "EUR" else "1"

        vat_code = smart_str(client.get('vat', ''))

        n08 = ET.Element("N08")
        ET.SubElement(n08, "N08_KODAS_KS").text    = client_code
        ET.SubElement(n08, "N08_RUSIS").text       = rusis
        ET.SubElement(n08, "N08_PVM_KODAS").text   = vat_code
        ET.SubElement(n08, "N08_IM_KODAS").text    = client_code
        ET.SubElement(n08, "N08_PAV").text         = smart_str(client.get('name', ''))
        ET.SubElement(n08, "N08_ADR").text         = smart_str(client.get('address', ''))
        ET.SubElement(n08, "N08_TIPAS_PIRK").text  = "1"
        ET.SubElement(n08, "N08_TIPAS_TIEK").text  = "1"
        ET.SubElement(n08, "N08_KODAS_DS").text    = smart_str(client.get('kodas_ds', 'PT001'))
        ET.SubElement(n08, "N08_KODAS_XS_T").text  = "PVM"
        ET.SubElement(n08, "N08_KODAS_XS_P").text  = "PVM"
        ET.SubElement(n08, "N08_VAL_POZ").text     = val_poz
        ET.SubElement(n08, "N08_KODAS_VL_1").text  = currency
        ET.SubElement(n08, "N08_BUSENA").text      = "1"
        ET.SubElement(n08, "N08_TIPAS").text       = tipas

        n33 = ET.SubElement(n08, "N33")
        ET.SubElement(n33, "N33_NUTYL").text       = "1"
        ET.SubElement(n33, "N33_KODAS_KS").text    = client_code
        ET.SubElement(n33, "N33_S_KODAS").text     = smart_str(client.get('iban', ''))
        ET.SubElement(n33, "N33_SALIES_K").text    = smart_str(client.get('country_iso', ''))

        elements.append(n08)

    # Объединяем все N08 без <root>
    xml = b""
    for el in elements:
        xml += prettify_no_header(el) + b"\n"

    # ВАЖНО: прогоняем результат через expand_empty_tags!
    return expand_empty_tags(xml)






def export_pirkimai_group_to_rivile(documents):
    elements = []
    for doc in documents:
        i06 = ET.Element("I06")
        currency = getattr(doc, 'currency', 'EUR') or 'EUR'
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
        ET.SubElement(i06, "I06_OP_TIP").text = "1"
        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        if series and not number.startswith(series):
            dok_num = f"{series}{number}"
        else:
            dok_num = number
        if currency.upper() != "EUR":
            ET.SubElement(i06, "I06_VAL_POZ").text = "1"
            ET.SubElement(i06, "I06_KODAS_VL").text = currency.upper()
            rate = get_currency_rate(currency, op_date)
            ET.SubElement(i06, "I06_KURSAS").text = str(rate if rate else "")
        else:
            ET.SubElement(i06, "I06_VAL_POZ").text = "0"

        ET.SubElement(i06, "I06_DOK_NR").text     = dok_num
        ET.SubElement(i06, "I06_OP_DATA").text    = format_date(op_date)
        ET.SubElement(i06, "I06_DOK_DATA").text   = format_date(getattr(doc, 'invoice_date', None))
        ET.SubElement(i06, "I06_KODAS_KS").text   = smart_str(getattr(doc, 'seller_id', '') or '')
        ET.SubElement(i06, "I06_DOK_REG").text    = smart_str(getattr(doc, 'document_number', '') or '')
        ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            for item in line_items.all():
                i07 = ET.SubElement(i06, "I07")
                kodas = getattr(item, "prekes_kodas", None) or "PREKE001"
                tipas_val = "1"  # по умолчанию товар
                preke_paslauga = getattr(item, "preke_paslauga", None)
                if preke_paslauga:
                    if preke_paslauga.lower() == "paslauga":
                        tipas_val = "2"
                    elif preke_paslauga.lower() == "preke":
                        tipas_val = "1"
                ET.SubElement(i07, "I07_KODAS").text = kodas
                ET.SubElement(i07, "I07_TIPAS").text = tipas_val
                if currency.upper() == "EUR":
                    ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(item, "subtotal", None))
                else:
                    ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(item, "subtotal", None))
                ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
                ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(item, "vat_percent", None))
                ET.SubElement(i07, "T_KIEKIS").text       = str(getattr(item, "quantity", None) or "1")
                ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(item, "pvm_kodas", None) or "")
            
        else:
        # Если нет line_items — одна строка (можно по аналогии с EUR/неEUR)
            i07 = ET.SubElement(i06, "I07")
            kodas = getattr(doc, "prekes_kodas", None) or "PREKE001"
            tipas_val = "1"  # по умолчанию товар
            preke_paslauga = getattr(doc, "preke_paslauga", None)
            if preke_paslauga:
                if preke_paslauga.lower() == "paslauga":
                    tipas_val = "2"
                elif preke_paslauga.lower() == "preke":
                    tipas_val = "1"
            ET.SubElement(i07, "I07_TIPAS").text = tipas_val
            if currency.upper() == "EUR":
                ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
                ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(doc, "vat_amount", None))
                ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
            else:
                ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
                ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(doc, "vat_amount", None))
                ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
            ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
            ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(doc, "vat_percent", None))
            ET.SubElement(i07, "T_KIEKIS").text       = "1"
            ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(doc, "pvm_kodas", None) or "")

        elements.append(i06)
    xml = b""
    for el in elements:
        xml += prettify_no_header(el) + b"\n"
    return expand_empty_tags(xml)



def export_pardavimai_group_to_rivile(documents):
    """
    Экспортирует "Pardavimai" (продажи) для Rivile в формате I06/I07 (БЕЗ <root>).
    """
    elements = []
    for doc in documents:
        i06 = ET.Element("I06")
        currency = getattr(doc, 'currency', 'EUR') or 'EUR'
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        if series and not number.startswith(series):
            dok_num = f"{series}{number}"
        else:
            dok_num = number
        ET.SubElement(i06, "I06_OP_TIP").text = "51"
        if currency.upper() != "EUR":
            ET.SubElement(i06, "I06_VAL_POZ").text = "1"
            ET.SubElement(i06, "I06_KODAS_VL").text = currency.upper()
            rate = get_currency_rate(currency, op_date)
            ET.SubElement(i06, "I06_KURSAS").text = str(rate if rate else "")
        else:
            ET.SubElement(i06, "I06_VAL_POZ").text = "0"

        ET.SubElement(i06, "I06_DOK_NR").text     = dok_num
        ET.SubElement(i06, "I06_OP_DATA").text    = format_date(op_date)
        ET.SubElement(i06, "I06_DOK_DATA").text   = format_date(getattr(doc, 'invoice_date', None))
        ET.SubElement(i06, "I06_KODAS_KS").text   = smart_str(getattr(doc, 'buyer_id', '') or '')
        ET.SubElement(i06, "I06_DOK_REG").text    = smart_str(getattr(doc, 'document_number', '') or '')
        ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

        # --- Строки документа (I07) ---
        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            for item in line_items.all():
                i07 = ET.SubElement(i06, "I07")
                kodas = getattr(item, "prekes_kodas", None) or "PREKE002"
                ET.SubElement(i07, "I07_KODAS").text = kodas
                ET.SubElement(i07, "I07_TIPAS").text = "3"
                if currency.upper() == "EUR":
                    ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(item, "subtotal", None))
                else:
                    ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(item, "subtotal", None))
                ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
                ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(item, "vat_percent", None))
                ET.SubElement(i07, "T_KIEKIS").text       = str(getattr(item, "quantity", None) or "1")
                ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(item, "pvm_kodas", None) or "")
        else:
            # Если нет line_items — одна строка
            i07 = ET.SubElement(i06, "I07")
            kodas = getattr(doc, "prekes_kodas", None) or "PREKE002"
            ET.SubElement(i07, "I07_KODAS").text = kodas
            ET.SubElement(i07, "I07_TIPAS").text = "3"
            if currency.upper() == "EUR":
                ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
                ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(doc, "vat_amount", None))
                ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
            else:
                ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
                ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(doc, "vat_amount", None))
                ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
            ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
            ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(doc, "vat_percent", None))
            ET.SubElement(i07, "T_KIEKIS").text       = "1"
            ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(doc, "pvm_kodas", None) or "")

        elements.append(i06)

    xml = b""
    for el in elements:
        xml += prettify_no_header(el) + b"\n"
    return expand_empty_tags(xml)


