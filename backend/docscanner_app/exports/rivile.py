import xml.etree.ElementTree as ET
from django.utils.encoding import smart_str
from .formatters import format_date, vat_to_int_str, get_price_or_zero, expand_empty_tags
from ..models import CurrencyRate


# =========================
# Helpers
# =========================
def get_currency_rate(currency_code, date_obj):
    """
    Получить курс для валюты на заданную дату (к EUR).
    """
    if not currency_code or currency_code.upper() == "EUR":
        return 1.0
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date=date_obj).first()
    if obj:
        return obj.rate
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date__lt=date_obj).order_by('-date').first()
    return obj.rate if obj else None


def prettify_no_header(elem):
    """
    Возвращает pretty-XML без заголовка <?xml ...?> (bytes).
    """
    from xml.dom import minidom
    rough_string = ET.tostring(elem, encoding="utf-8")
    reparsed = minidom.parseString(rough_string)
    pretty_xml = reparsed.toprettyxml(indent="  ")
    pretty_xml = '\n'.join(pretty_xml.split('\n')[1:])
    pretty_xml = '\n'.join([line for line in pretty_xml.split('\n') if line.strip()])
    return pretty_xml.encode("utf-8")


def resolve_party_code(doc, id_field, vat_field):
    """
    Возвращает код контрагента для Rivile:
    1) doc.<id_field> если непустой
    2) иначе doc.<vat_field> если непустой
    3) иначе '111111111'
    """
    val = getattr(doc, id_field, None)
    if val is not None and str(val).strip():
        return str(val).strip()
    val = getattr(doc, vat_field, None)
    if val is not None and str(val).strip():
        return str(val).strip()
    return "111111111"


# =========================================================
# 1) PREKĖS / PASLAUGOS / KODAI (N25) — ПО ТВОЕЙ ЛОГИКЕ
# =========================================================
def export_prekes_paslaugos_kodai_group_to_rivile(documents):
    """
    Возвращает три XML-потока БЕЗ <root>:
      - prekes_xml (N17)  — только товары
      - paslaugos_xml (N17) — только услуги
      - kodai_xml (N25)  — если doc.preke_paslauga == '3', формируем блоки <N25> по заданному шаблону
    """
    prekes_dict = {}      # key: kodas -> Element("N17")
    paslaugos_dict = {}   # key: kodas -> Element("N17")
    kodai_dict = {}       # key: kodas -> Element("N25")

    def normalize_tipas(value):
        """
        Приводит doc/item.preke_paslauga к '1'/'2'/'3'.
        Поддерживает int, str, синонимы и лишние пробелы.
        """
        if value is None:
            return None
        if isinstance(value, (int, float)):
            value = str(int(value))
        s = str(value).strip().lower()
        if s in {"1", "preke", "prekė", "prekė"}:
            return "1"
        if s in {"2", "paslauga"}:
            return "2"
        if s in {"3", "komplektavimas", "komplektavimu", "komplektavimų"}:
            return "3"
        return None

    def add_n17_record(target_dict, kodas, tipas, unit, pavadinimas, kodas_ds="PR001"):
        if not kodas or kodas in target_dict:
            return
        n17 = ET.Element("N17")
        ET.SubElement(n17, "N17_KODAS_PS").text = smart_str(kodas)
        ET.SubElement(n17, "N17_TIPAS").text    = smart_str(tipas or '1')
        ET.SubElement(n17, "N17_KODAS_US").text = smart_str(unit or "VNT")
        ET.SubElement(n17, "N17_PAV").text      = smart_str(pavadinimas or "Prekė")
        ET.SubElement(n17, "N17_KODAS_DS").text = smart_str(kodas_ds or "PR001")
        target_dict[kodas] = n17

    def add_n25_record(kodai_dict, doc):
        kodas = getattr(doc, "prekes_kodas", None)
        if not kodas or kodas in kodai_dict:
            return

        pavadinimas = getattr(doc, "prekes_pavadinimas", None) or "Prekė"

        # <-- ВАЖНО: TIPAS зависит от doc.pirkimas_pardavimas
        pirk_pard = getattr(doc, "pirkimas_pardavimas", "").strip().lower()
        if pirk_pard == "pirkimas":
            tipas = "1"
        elif pirk_pard == "pardavimas":
            tipas = "2"
        else:
            tipas = "1"  # дефолт – пускай будет как закупка

        saskaita    = getattr(doc, "N25_KODAS_SS", None) or getattr(doc, "saskaita", None) or "5001"
        kodas_ds    = getattr(doc, "N25_KODAS_DS", None) or getattr(doc, "kodas_ds", None) or "PR001"
        unit        = getattr(doc, "unit", None) or getattr(doc, "N25_KODAS_US", None) or "VNT"
        frakcija    = getattr(doc, "N25_FRAKCIJA", None) or "100"
        suma        = getattr(doc, "N25_SUMA", None) or "0.00"
        tax         = getattr(doc, "N25_TAX", None) or "1"
        mokestis    = getattr(doc, "N25_MOKESTIS", None) or "1"
        poz_date    = getattr(doc, "N25_POZ_DATE", None) or "0"

        n25 = ET.Element("N25")
        ET.SubElement(n25, "N25_KODAS_BS").text = smart_str(kodas)
        ET.SubElement(n25, "N25_PAV").text      = smart_str(pavadinimas)
        ET.SubElement(n25, "N25_TIPAS").text    = tipas
        ET.SubElement(n25, "N25_KODAS_SS").text = smart_str(saskaita)
        ET.SubElement(n25, "N25_KODAS_DS").text = smart_str(kodas_ds)
        ET.SubElement(n25, "N25_KODAS_US").text = smart_str(unit)
        ET.SubElement(n25, "N25_FRAKCIJA").text = smart_str(str(frakcija))
        ET.SubElement(n25, "N25_SUMA").text     = smart_str(str(suma))
        ET.SubElement(n25, "N25_TAX").text      = smart_str(str(tax))
        ET.SubElement(n25, "N25_MOKESTIS").text = smart_str(str(mokestis))
        ET.SubElement(n25, "N25_POZ_DATE").text = smart_str(str(poz_date))
        kodai_dict[kodas] = n25

    for doc in documents:
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())

        if not has_items:
            tipas = normalize_tipas(getattr(doc, "preke_paslauga", None))
            kodas = (getattr(doc, "prekes_kodas", None) or getattr(doc, "prekes_barkodas", None) or "").strip()
            if not kodas:
                continue
            unit  = (getattr(doc, "unit", None) or "VNT").strip()
            pavadinimas = (getattr(doc, "prekes_pavadinimas", None) or "Prekė").strip()
            kodas_ds = (getattr(doc, "kodas_ds", None) or "PR001").strip()

            if tipas == '1':
                add_n17_record(prekes_dict, kodas, '1', unit, pavadinimas, kodas_ds)
            elif tipas == '2':
                add_n17_record(paslaugos_dict, kodas, '2', unit, pavadinimas, kodas_ds)
            elif tipas == '3':
                add_n25_record(kodai_dict, doc)
        else:
            for item in line_items.all():
                tipas = normalize_tipas(getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None) or '1')
                kodas = (getattr(item, "prekes_kodas", None) or getattr(item, "prekes_barkodas", None) or "").strip()
                if not kodas:
                    continue
                unit  = (getattr(item, "unit", None) or "VNT").strip()
                pavadinimas = (getattr(item, "prekes_pavadinimas", None) or "Prekė").strip()
                kodas_ds = (getattr(item, "kodas_ds", None) or "PR001").strip()

                if tipas == '1':
                    add_n17_record(prekes_dict, kodas, '1', unit, pavadinimas, kodas_ds)
                elif tipas == '2':
                    add_n17_record(paslaugos_dict, kodas, '2', unit, pavadinimas, kodas_ds)
                elif tipas == '3':
                    add_n25_record(kodai_dict, doc)

    # Склеиваем XML
    prekes_xml = b"".join(prettify_no_header(el) + b"\n" for el in prekes_dict.values())
    paslaugos_xml = b"".join(prettify_no_header(el) + b"\n" for el in paslaugos_dict.values())
    kodai_xml = b"".join(prettify_no_header(el) + b"\n" for el in kodai_dict.values())

    if prekes_xml.strip():
        prekes_xml = expand_empty_tags(prekes_xml)
    if paslaugos_xml.strip():
        paslaugos_xml = expand_empty_tags(paslaugos_xml)
    if kodai_xml.strip():
        kodai_xml = expand_empty_tags(kodai_xml)

    return prekes_xml, paslaugos_xml, kodai_xml



# =========================================================
# 2) PIRKIMAI (I06/I07) — ВСЕГДА ПРАВИЛЬНЫЙ I07_KODAS
# =========================================================
def export_pirkimai_group_to_rivile(documents):
    elements = []
    for doc in documents:
        i06 = ET.Element("I06")
        currency = getattr(doc, 'currency', 'EUR') or 'EUR'
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
        ET.SubElement(i06, "I06_OP_TIP").text = "1"

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        dok_num = f"{series}{number}" if series and not number.startswith(series) else number

        if currency.upper() != "EUR":
            ET.SubElement(i06, "I06_VAL_POZ").text = "1"
            ET.SubElement(i06, "I06_KODAS_VL").text = currency.upper()
            rate = get_currency_rate(currency, op_date)
            ET.SubElement(i06, "I06_KURSAS").text = str(rate if rate else "1")
        else:
            ET.SubElement(i06, "I06_VAL_POZ").text = "0"

        ET.SubElement(i06, "I06_DOK_NR").text     = dok_num
        ET.SubElement(i06, "I06_OP_DATA").text    = format_date(op_date)
        ET.SubElement(i06, "I06_DOK_DATA").text   = format_date(getattr(doc, 'invoice_date', None))
        seller_code = resolve_party_code(doc, 'seller_id', 'seller_vat_code')
        ET.SubElement(i06, "I06_KODAS_KS").text = smart_str(seller_code)
        ET.SubElement(i06, "I06_DOK_REG").text    = smart_str(getattr(doc, 'document_number', '') or '')
        ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            for item in line_items.all():
                i07 = ET.SubElement(i06, "I07")
                # I07_KODAS: item -> doc -> fallback
                kodas = getattr(item, "prekes_kodas", None) or getattr(doc, "prekes_kodas", None) or "PREKE001"
                ET.SubElement(i07, "I07_KODAS").text = kodas

                tipas_val = '1'
                preke_paslauga = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
                if preke_paslauga:
                    pls = str(preke_paslauga).lower()
                    if pls == "paslauga":
                        tipas_val = "2"
                    elif pls == "preke":
                        tipas_val = "1"
                    elif pls == "3":
                        tipas_val = "3"
                ET.SubElement(i07, "I07_TIPAS").text = tipas_val

                if currency.upper() == "EUR":
                    ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(item, "subtotal", None))
                else:
                    ET.SubElement(i07, "I07_VAL_KAINA").text = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM_VAL").text   = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA_VAL").text  = get_price_or_zero(getattr(item, "subtotal", None))

                ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
                ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(item, "vat_percent", None))
                ET.SubElement(i07, "T_KIEKIS").text       = str(getattr(item, "quantity", None) or "1")
                ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(item, "pvm_kodas", None) or "")
        else:
            # Одна строка на документ
            i07 = ET.SubElement(i06, "I07")
            kodas = getattr(doc, "prekes_kodas", None) or "PREKE001"
            ET.SubElement(i07, "I07_KODAS").text = kodas

            tipas_val = '1'
            preke_paslauga = getattr(doc, "preke_paslauga", None)
            if preke_paslauga:
                pls = str(preke_paslauga).lower()
                if pls == "paslauga":
                    tipas_val = "2"
                elif pls == "preke":
                    tipas_val = "1"
                elif pls == "3":
                    tipas_val = "3"
            ET.SubElement(i07, "I07_TIPAS").text = tipas_val

            if currency.upper() == "EUR":
                ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
                ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(doc, "vat_amount", None))
                ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
            else:
                ET.SubElement(i07, "I07_VAL_KAINA").text = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
                ET.SubElement(i07, "I07_PVM_VAL").text   = get_price_or_zero(getattr(doc, "vat_amount", None))
                ET.SubElement(i07, "I07_SUMA_VAL").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))

            ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
            ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(doc, "vat_percent", None))
            ET.SubElement(i07, "T_KIEKIS").text       = "1"
            ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(doc, "pvm_kodas", None) or "")

        elements.append(i06)

    xml = b""
    for el in elements:
        xml += prettify_no_header(el) + b"\n"
    return expand_empty_tags(xml)


# =========================================================
# 3) PARDAVIMAI (I06/I07) — ВСЕГДА ПРАВИЛЬНЫЙ I07_KODAS
# =========================================================
def export_pardavimai_group_to_rivile(documents):
    elements = []
    for doc in documents:
        i06 = ET.Element("I06")
        currency = getattr(doc, 'currency', 'EUR') or 'EUR'
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        dok_num = f"{series}{number}" if series and not number.startswith(series) else number

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
        buyer_code = resolve_party_code(doc, 'buyer_id', 'buyer_vat_code')
        ET.SubElement(i06, "I06_KODAS_KS").text = smart_str(buyer_code)
        ET.SubElement(i06, "I06_DOK_REG").text    = smart_str(getattr(doc, 'document_number', '') or '')
        ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            for item in line_items.all():
                i07 = ET.SubElement(i06, "I07")
                # I07_KODAS: item -> doc -> fallback
                kodas = getattr(item, "prekes_kodas", None) or getattr(doc, "prekes_kodas", None) or "PREKE002"
                ET.SubElement(i07, "I07_KODAS").text = kodas

                tipas_val = '1'
                preke_paslauga = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
                if preke_paslauga:
                    pls = str(preke_paslauga).lower()
                    if pls == "paslauga":
                        tipas_val = "2"
                    elif pls == "preke":
                        tipas_val = "1"
                    elif pls == "3":
                        tipas_val = "3"
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
            # Одна строка
            i07 = ET.SubElement(i06, "I07")
            kodas = getattr(doc, "prekes_kodas", None) or "PREKE002"
            ET.SubElement(i07, "I07_KODAS").text = kodas

            tipas_val = '1'
            preke_paslauga = getattr(doc, "preke_paslauga", None)
            if preke_paslauga:
                pls = str(preke_paslauga).lower()
                if pls == "paslauga":
                    tipas_val = "2"
                elif pls == "preke":
                    tipas_val = "1"
                elif pls == "3":
                    tipas_val = "3"
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


# =========================================================
# 4) KLIENTAI (N08 + N33)
# =========================================================
def export_clients_group_to_rivile(clients=None, documents=None):
    """
    Экспортирует клиентов для Rivile в формате N08 (БЕЗ <root>).
    
    Если передан параметр documents, автоматически извлекает клиентов из документов.
    Если передан параметр clients, использует его.
    """
    elements = []
    client_codes_seen = set()  # чтобы избежать дубликатов
    
    # Если переданы документы, автоматически извлекаем из них клиентов
    if documents:
        for doc in documents:
            # Определяем тип документа
            doc_type = getattr(doc, 'pirkimas_pardavimas', '').strip().lower()
            if not doc_type:
                # Пытаемся определить тип по наличию полей
                if hasattr(doc, 'seller_id') or hasattr(doc, 'seller_vat_code'):
                    doc_type = 'pirkimas'
                elif hasattr(doc, 'buyer_id') or hasattr(doc, 'buyer_vat_code'):
                    doc_type = 'pardavimas'
            
            # Извлекаем данные клиента в зависимости от типа
            if doc_type == 'pirkimas':
                client_code = resolve_party_code(doc, 'seller_id', 'seller_vat_code')
                if client_code not in client_codes_seen:
                    client_data = {
                        'type': 'pirkimas',
                        'seller_id': getattr(doc, 'seller_id', None),
                        'seller_vat_code': getattr(doc, 'seller_vat_code', None),
                        'seller_is_person': getattr(doc, 'seller_is_person', False),
                        'name': getattr(doc, 'seller_name', '') or '',
                        'address': getattr(doc, 'seller_address', '') or '',
                        'country_iso': getattr(doc, 'seller_country_iso', '') or '',
                        'currency': getattr(doc, 'currency', 'EUR'),
                        'kodas_ds': getattr(doc, 'kodas_ds', 'PT001'),
                        'iban': getattr(doc, 'seller_iban', '') or ''
                    }
                    _add_client_n08(elements, client_data)
                    client_codes_seen.add(client_code)
            
            elif doc_type == 'pardavimas':
                client_code = resolve_party_code(doc, 'buyer_id', 'buyer_vat_code')
                if client_code not in client_codes_seen:
                    client_data = {
                        'type': 'pardavimas',
                        'buyer_id': getattr(doc, 'buyer_id', None),
                        'buyer_vat_code': getattr(doc, 'buyer_vat_code', None),
                        'buyer_is_person': getattr(doc, 'buyer_is_person', False),
                        'name': getattr(doc, 'buyer_name', '') or '',
                        'address': getattr(doc, 'buyer_address', '') or '',
                        'country_iso': getattr(doc, 'buyer_country_iso', '') or '',
                        'currency': getattr(doc, 'currency', 'EUR'),
                        'kodas_ds': getattr(doc, 'kodas_ds', 'PT001'),
                        'iban': getattr(doc, 'buyer_iban', '') or ''
                    }
                    _add_client_n08(elements, client_data)
                    client_codes_seen.add(client_code)
    
    # Если переданы клиенты напрямую, обрабатываем их
    if clients:
        for client in clients:
            # Определяем код клиента для проверки дубликатов
            doc_type = (client.get('type') or '').strip().lower()
            if doc_type == 'pirkimas':
                client_code = smart_str(
                    client.get('seller_id') or client.get('seller_vat_code') or "111111111"
                )
            elif doc_type == 'pardavimas':
                client_code = smart_str(
                    client.get('buyer_id') or client.get('buyer_vat_code') or "111111111"
                )
            else:
                client_code = smart_str(
                    client.get('id')
                    or client.get('vat')
                    or client.get('seller_id')
                    or client.get('seller_vat_code')
                    or client.get('buyer_id')
                    or client.get('buyer_vat_code')
                    or "111111111"
                )
            
            if client_code not in client_codes_seen:
                _add_client_n08(elements, client)
                client_codes_seen.add(client_code)
    
    xml = b""
    for el in elements:
        xml += prettify_no_header(el) + b"\n"
    return expand_empty_tags(xml)


def _add_client_n08(elements, client):
    """
    Вспомогательная функция для добавления N08 элемента клиента
    """
    doc_type = (client.get('type') or '').strip().lower()

    if doc_type == 'pirkimas':
        # только поставщик
        client_code = smart_str(
            client.get('seller_id') or client.get('seller_vat_code') or "111111111"
        )
        tipas = "2" if client.get('seller_is_person') else "1"
        tipas_pirk = "0"
        tipas_tiek = "1"
        rusis = "2"
        # Для PVM кода берем VAT код без префикса LT
        vat_raw = client.get('seller_vat_code') or ''
        vat_code = smart_str(vat_raw.replace('LT', '').replace(' ', '').upper()) if vat_raw else ''
    elif doc_type == 'pardavimas':
        # только покупатель  
        client_code = smart_str(
            client.get('buyer_id') or client.get('buyer_vat_code') or "111111111"
        )
        tipas = "2" if client.get('buyer_is_person') else "1"
        tipas_pirk = "1"
        tipas_tiek = "0"
        rusis = "1"
        # Для PVM кода берем VAT код без префикса LT
        vat_raw = client.get('buyer_vat_code') or ''
        vat_code = smart_str(vat_raw.replace('LT', '').replace(' ', '').upper()) if vat_raw else ''
    else:
        # тип неизвестен — берём наиболее вероятный код
        client_code = smart_str(
            client.get('id')
            or client.get('vat')
            or client.get('seller_id')
            or client.get('seller_vat_code')
            or client.get('buyer_id')
            or client.get('buyer_vat_code')
            or "111111111"
        )
        tipas = "2" if client.get('is_person') else "1"
        tipas_pirk = "1"
        tipas_tiek = "1"
        rusis = "1"
        vat_raw = client.get('vat') or ''
        vat_code = smart_str(vat_raw.replace('LT', '').replace(' ', '').upper()) if vat_raw else ''

    currency = smart_str((client.get('currency') or 'EUR')).upper()
    val_poz = "0" if currency == "EUR" else "1"

    n08 = ET.Element("N08")
    ET.SubElement(n08, "N08_KODAS_KS").text    = client_code
    ET.SubElement(n08, "N08_RUSIS").text       = rusis
    ET.SubElement(n08, "N08_PVM_KODAS").text   = vat_code
    ET.SubElement(n08, "N08_IM_KODAS").text    = client_code
    ET.SubElement(n08, "N08_PAV").text         = smart_str(client.get('name', '') or '')
    ET.SubElement(n08, "N08_ADR").text         = smart_str(client.get('address', '') or '')
    ET.SubElement(n08, "N08_TIPAS_PIRK").text  = tipas_pirk
    ET.SubElement(n08, "N08_TIPAS_TIEK").text  = tipas_tiek
    ET.SubElement(n08, "N08_KODAS_DS").text    = smart_str(client.get('kodas_ds', 'PT001'))
    ET.SubElement(n08, "N08_KODAS_XS_T").text  = "PVM"
    ET.SubElement(n08, "N08_KODAS_XS_P").text  = "PVM"
    ET.SubElement(n08, "N08_VAL_POZ").text     = val_poz
    ET.SubElement(n08, "N08_KODAS_VL_1").text  = currency
    ET.SubElement(n08, "N08_BUSENA").text      = "1"
    ET.SubElement(n08, "N08_TIPAS").text       = tipas

    # Банковские реквизиты (N33)
    n33 = ET.SubElement(n08, "N33")
    ET.SubElement(n33, "N33_NUTYL").text       = "1"
    ET.SubElement(n33, "N33_KODAS_KS").text    = client_code
    ET.SubElement(n33, "N33_S_KODAS").text     = smart_str(client.get('iban', '') or '')
    ET.SubElement(n33, "N33_SALIES_K").text    = smart_str((client.get('country_iso') or '').upper())

    elements.append(n08)


# def export_clients_group_to_rivile(clients):
#     """
#     Экспортирует клиентов для Rivile в формате N08 (БЕЗ <root>).

#     Каждый client — dict с ключами:
#       name, address, country_iso, currency, kodas_ds, iban
#     Доп. поля (если есть):
#       type: 'pirkimas' | 'pardavimas'
#       seller_id, seller_vat_code, seller_is_person
#       buyer_id,  buyer_vat_code,  buyer_is_person
#       id, vat, is_person
#     """
#     elements = []

#     for client in clients:
#         doc_type = (client.get('type') or '').strip().lower()

#         # Определяем тип документа, если не задан
#         if not doc_type:
#             if client.get('seller_id') or client.get('seller_vat_code'):
#                 doc_type = 'pirkimas'
#             elif client.get('buyer_id') or client.get('buyer_vat_code'):
#                 doc_type = 'pardavimas'
#             else:
#                 doc_type = ''  # оставляем пустым — значит неизвестно

#         if doc_type == 'pirkimas':
#             # только поставщик
#             client_code = smart_str(
#                 client.get('seller_id') or client.get('seller_vat_code') or "111111111"
#             )
#             tipas = "2" if client.get('seller_is_person') else "1"
#             tipas_pirk = "0"
#             tipas_tiek = "1"
#             rusis = "2"
#         elif doc_type == 'pardavimas':
#             # только покупатель
#             client_code = smart_str(
#                 client.get('buyer_id') or client.get('buyer_vat_code') or "111111111"
#             )
#             tipas = "2" if client.get('buyer_is_person') else "1"
#             tipas_pirk = "1"
#             tipas_tiek = "0"
#             rusis = "1"
#         else:
#             # тип неизвестен — берём наиболее вероятный код (чтобы точно совпал с I06_KODAS_KS)
#             client_code = smart_str(
#                 client.get('id')
#                 or client.get('vat')
#                 or client.get('seller_id')
#                 or client.get('seller_vat_code')
#                 or client.get('buyer_id')
#                 or client.get('buyer_vat_code')
#                 or "111111111"
#             )
#             tipas = "2" if client.get('is_person') else "1"
#             tipas_pirk = "1"   # ставим обе роли, чтобы запись точно подошла
#             tipas_tiek = "1"
#             rusis = "1"        # не принципиально; можно оставить "1"

#         currency = smart_str((client.get('currency') or 'EUR')).upper()
#         val_poz = "0" if currency == "EUR" else "1"

#         vat_code = smart_str((client.get('vat') or '').replace(' ', '').upper())

#         n08 = ET.Element("N08")
#         ET.SubElement(n08, "N08_KODAS_KS").text    = client_code
#         ET.SubElement(n08, "N08_RUSIS").text       = rusis
#         ET.SubElement(n08, "N08_PVM_KODAS").text   = vat_code
#         ET.SubElement(n08, "N08_IM_KODAS").text    = client_code
#         ET.SubElement(n08, "N08_PAV").text         = smart_str(client.get('name', '') or '')
#         ET.SubElement(n08, "N08_ADR").text         = smart_str(client.get('address', '') or '')
#         ET.SubElement(n08, "N08_TIPAS_PIRK").text  = tipas_pirk
#         ET.SubElement(n08, "N08_TIPAS_TIEK").text  = tipas_tiek
#         ET.SubElement(n08, "N08_KODAS_DS").text    = smart_str(client.get('kodas_ds', 'PT001'))
#         ET.SubElement(n08, "N08_KODAS_XS_T").text  = "PVM"
#         ET.SubElement(n08, "N08_KODAS_XS_P").text  = "PVM"
#         ET.SubElement(n08, "N08_VAL_POZ").text     = val_poz
#         ET.SubElement(n08, "N08_KODAS_VL_1").text  = currency
#         ET.SubElement(n08, "N08_BUSENA").text      = "1"
#         ET.SubElement(n08, "N08_TIPAS").text       = tipas

#         # Банковские реквизиты (N33)
#         n33 = ET.SubElement(n08, "N33")
#         ET.SubElement(n33, "N33_NUTYL").text       = "1"
#         ET.SubElement(n33, "N33_KODAS_KS").text    = client_code
#         ET.SubElement(n33, "N33_S_KODAS").text     = smart_str(client.get('iban', '') or '')
#         ET.SubElement(n33, "N33_SALIES_K").text    = smart_str((client.get('country_iso') or '').upper())

#         elements.append(n08)

#     xml = b""
#     for el in elements:
#         xml += prettify_no_header(el) + b"\n"
#     return expand_empty_tags(xml)





















# import xml.etree.ElementTree as ET
# import random
# import string
# from django.utils.encoding import smart_str
# from .formatters import format_date, vat_to_int_str, get_price_or_zero, expand_empty_tags
# from ..models import CurrencyRate


# def get_currency_rate(currency_code, date_obj):
#     """
#     Получить курс для валюты на заданную дату (по отношению к EUR).
#     currency_code: 'USD', 'RUB', ...
#     date_obj: datetime.date (например, дата документа)
#     """
#     if not currency_code or currency_code.upper() == "EUR":
#         return 1.0
#     obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date=date_obj).first()
#     if obj:
#         return obj.rate
#     # fallback: ближайшая предыдущая дата
#     obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date__lt=date_obj).order_by('-date').first()
#     return obj.rate if obj else None




# def prettify_no_header(elem):
#     # Преобразует ET.Element в красивый XML без <?xml...> и без <root>
#     from xml.dom import minidom
#     rough_string = ET.tostring(elem, encoding="utf-8")
#     reparsed = minidom.parseString(rough_string)
#     pretty_xml = reparsed.toprettyxml(indent="  ")
#     # Убираем первую строку с <?xml ... ?>
#     pretty_xml = '\n'.join(pretty_xml.split('\n')[1:])
#     # Убираем пустые строки и приводим к байтам
#     pretty_xml = '\n'.join([line for line in pretty_xml.split('\n') if line.strip()])
#     return pretty_xml.encode("utf-8")




# def export_prekes_and_paslaugos_group_to_rivile(documents):
#     """
#     Возвращает 2 xml:
#       - prekes_xml: только товары (preke)
#       - paslaugos_xml: только услуги (paslauga)
#     """
#     prekes_dict = {}
#     paslaugos_dict = {}

#     for doc in documents:
#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, 'all') and line_items.exists():
#             for item in line_items.all():
#                 kodas = getattr(item, "prekes_kodas", None) or getattr(item, "prekes_barkodas", None)
#                 tipas_val = getattr(item, "preke_paslauga", "preke")
#                 tipas = "1" if tipas_val == "preke" else "2"
#                 unit = getattr(item, "unit", None) or "VNT"
#                 pavadinimas = getattr(item, "prekes_pavadinimas", None) or "Prekė"

#                 target_dict = prekes_dict if tipas == "1" else paslaugos_dict

#                 if kodas and kodas not in target_dict:
#                     n17 = ET.Element("N17")
#                     ET.SubElement(n17, "N17_KODAS_PS").text = kodas
#                     ET.SubElement(n17, "N17_TIPAS").text = tipas
#                     ET.SubElement(n17, "N17_KODAS_US").text = unit
#                     ET.SubElement(n17, "N17_PAV").text = smart_str(pavadinimas)
#                     ET.SubElement(n17, "N17_KODAS_DS").text = "PR001"
#                     target_dict[kodas] = n17
#         else:
#             kodas = getattr(doc, "prekes_kodas", None) or getattr(doc, "prekes_barkodas", None)
#             tipas_val = getattr(doc, "preke_paslauga", "preke")
#             tipas = "1" if tipas_val == "preke" else "2"
#             unit = "VNT"
#             pavadinimas = getattr(doc, "prekes_pavadinimas", None) or "Prekė"

#             target_dict = prekes_dict if tipas == "1" else paslaugos_dict

#             if kodas and kodas not in target_dict:
#                 n17 = ET.Element("N17")
#                 ET.SubElement(n17, "N17_KODAS_PS").text = kodas
#                 ET.SubElement(n17, "N17_TIPAS").text = tipas
#                 ET.SubElement(n17, "N17_KODAS_US").text = unit
#                 ET.SubElement(n17, "N17_PAV").text = smart_str(pavadinimas)
#                 ET.SubElement(n17, "N17_KODAS_DS").text = "PR001"
#                 target_dict[kodas] = n17

#     # Склеиваем XML по отдельности
#     prekes_xml = b""
#     paslaugos_xml = b""
#     for el in prekes_dict.values():
#         prekes_xml += prettify_no_header(el) + b"\n"
#     for el in paslaugos_dict.values():
#         paslaugos_xml += prettify_no_header(el) + b"\n"
#     return prekes_xml, paslaugos_xml





# def export_clients_group_to_rivile(clients):
#     """
#     Экспортирует клиентов для Rivile в формате N08 (БЕЗ <root>).
#     Каждый client — dict с ключами: id, vat, name, address, country_iso, currency, kodas_ds, type, is_person, iban
#     """
#     elements = []
#     for client in clients:
#         # 1) Логика выбора кода клиента
#         client_code = smart_str(client.get('id') or client.get('vat') or "111111111")

#         # 2) Прочее — как было
#         doc_type = client.get('type', 'pirkimas')
#         rusis = "2" if doc_type == 'pirkimas' else "1"
#         tipas = "2" if client.get('is_person') else "1"

#         currency = smart_str(client.get('currency', 'EUR')).upper()
#         val_poz = "0" if currency == "EUR" else "1"

#         vat_code = smart_str(client.get('vat', ''))

#         n08 = ET.Element("N08")
#         ET.SubElement(n08, "N08_KODAS_KS").text    = client_code
#         ET.SubElement(n08, "N08_RUSIS").text       = rusis
#         ET.SubElement(n08, "N08_PVM_KODAS").text   = vat_code
#         ET.SubElement(n08, "N08_IM_KODAS").text    = client_code
#         ET.SubElement(n08, "N08_PAV").text         = smart_str(client.get('name', ''))
#         ET.SubElement(n08, "N08_ADR").text         = smart_str(client.get('address', ''))
#         ET.SubElement(n08, "N08_TIPAS_PIRK").text  = "1"
#         ET.SubElement(n08, "N08_TIPAS_TIEK").text  = "1"
#         ET.SubElement(n08, "N08_KODAS_DS").text    = smart_str(client.get('kodas_ds', 'PT001'))
#         ET.SubElement(n08, "N08_KODAS_XS_T").text  = "PVM"
#         ET.SubElement(n08, "N08_KODAS_XS_P").text  = "PVM"
#         ET.SubElement(n08, "N08_VAL_POZ").text     = val_poz
#         ET.SubElement(n08, "N08_KODAS_VL_1").text  = currency
#         ET.SubElement(n08, "N08_BUSENA").text      = "1"
#         ET.SubElement(n08, "N08_TIPAS").text       = tipas

#         n33 = ET.SubElement(n08, "N33")
#         ET.SubElement(n33, "N33_NUTYL").text       = "1"
#         ET.SubElement(n33, "N33_KODAS_KS").text    = client_code
#         ET.SubElement(n33, "N33_S_KODAS").text     = smart_str(client.get('iban', ''))
#         ET.SubElement(n33, "N33_SALIES_K").text    = smart_str(client.get('country_iso', ''))

#         elements.append(n08)

#     # Объединяем все N08 без <root>
#     xml = b""
#     for el in elements:
#         xml += prettify_no_header(el) + b"\n"

#     # ВАЖНО: прогоняем результат через expand_empty_tags!
#     return expand_empty_tags(xml)






# def export_pirkimai_group_to_rivile(documents):
#     elements = []
#     for doc in documents:
#         i06 = ET.Element("I06")
#         currency = getattr(doc, 'currency', 'EUR') or 'EUR'
#         op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
#         ET.SubElement(i06, "I06_OP_TIP").text = "1"
#         series = smart_str(getattr(doc, "document_series", "") or "")
#         number = smart_str(getattr(doc, "document_number", "") or "")
#         if series and not number.startswith(series):
#             dok_num = f"{series}{number}"
#         else:
#             dok_num = number
#         if currency.upper() != "EUR":
#             ET.SubElement(i06, "I06_VAL_POZ").text = "1"
#             ET.SubElement(i06, "I06_KODAS_VL").text = currency.upper()
#             rate = get_currency_rate(currency, op_date)
#             ET.SubElement(i06, "I06_KURSAS").text = str(rate if rate else "")
#         else:
#             ET.SubElement(i06, "I06_VAL_POZ").text = "0"

#         ET.SubElement(i06, "I06_DOK_NR").text     = dok_num
#         ET.SubElement(i06, "I06_OP_DATA").text    = format_date(op_date)
#         ET.SubElement(i06, "I06_DOK_DATA").text   = format_date(getattr(doc, 'invoice_date', None))
#         ET.SubElement(i06, "I06_KODAS_KS").text   = smart_str(getattr(doc, 'seller_id', '') or '')
#         ET.SubElement(i06, "I06_DOK_REG").text    = smart_str(getattr(doc, 'document_number', '') or '')
#         ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, 'all') and line_items.exists():
#             for item in line_items.all():
#                 i07 = ET.SubElement(i06, "I07")
#                 kodas = getattr(item, "prekes_kodas", None) or "PREKE001"
#                 tipas_val = "1"  # по умолчанию товар
#                 preke_paslauga = getattr(item, "preke_paslauga", None)
#                 if preke_paslauga:
#                     if preke_paslauga.lower() == "paslauga":
#                         tipas_val = "2"
#                     elif preke_paslauga.lower() == "preke":
#                         tipas_val = "1"
#                 ET.SubElement(i07, "I07_KODAS").text = kodas
#                 ET.SubElement(i07, "I07_TIPAS").text = tipas_val
#                 if currency.upper() == "EUR":
#                     ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(item, "price", None))
#                     ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(item, "vat", None))
#                     ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(item, "subtotal", None))
#                 else:
#                     ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(item, "price", None))
#                     ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(item, "vat", None))
#                     ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(item, "subtotal", None))
#                 ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
#                 ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(item, "vat_percent", None))
#                 ET.SubElement(i07, "T_KIEKIS").text       = str(getattr(item, "quantity", None) or "1")
#                 ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(item, "pvm_kodas", None) or "")
            
#         else:
#         # Если нет line_items — одна строка (можно по аналогии с EUR/неEUR)
#             i07 = ET.SubElement(i06, "I07")
#             kodas = getattr(doc, "prekes_kodas", None) or "PREKE001"
#             tipas_val = "1"  # по умолчанию товар
#             preke_paslauga = getattr(doc, "preke_paslauga", None)
#             if preke_paslauga:
#                 if preke_paslauga.lower() == "paslauga":
#                     tipas_val = "2"
#                 elif preke_paslauga.lower() == "preke":
#                     tipas_val = "1"
#             ET.SubElement(i07, "I07_TIPAS").text = tipas_val
#             if currency.upper() == "EUR":
#                 ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#                 ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(doc, "vat_amount", None))
#                 ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#             else:
#                 ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#                 ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(doc, "vat_amount", None))
#                 ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#             ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
#             ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(doc, "vat_percent", None))
#             ET.SubElement(i07, "T_KIEKIS").text       = "1"
#             ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(doc, "pvm_kodas", None) or "")

#         elements.append(i06)
#     xml = b""
#     for el in elements:
#         xml += prettify_no_header(el) + b"\n"
#     return expand_empty_tags(xml)



# def export_pardavimai_group_to_rivile(documents):
#     """
#     Экспортирует "Pardavimai" (продажи) для Rivile в формате I06/I07 (БЕЗ <root>).
#     """
#     elements = []
#     for doc in documents:
#         i06 = ET.Element("I06")
#         currency = getattr(doc, 'currency', 'EUR') or 'EUR'
#         op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
#         series = smart_str(getattr(doc, "document_series", "") or "")
#         number = smart_str(getattr(doc, "document_number", "") or "")
#         if series and not number.startswith(series):
#             dok_num = f"{series}{number}"
#         else:
#             dok_num = number
#         ET.SubElement(i06, "I06_OP_TIP").text = "51"
#         if currency.upper() != "EUR":
#             ET.SubElement(i06, "I06_VAL_POZ").text = "1"
#             ET.SubElement(i06, "I06_KODAS_VL").text = currency.upper()
#             rate = get_currency_rate(currency, op_date)
#             ET.SubElement(i06, "I06_KURSAS").text = str(rate if rate else "")
#         else:
#             ET.SubElement(i06, "I06_VAL_POZ").text = "0"

#         ET.SubElement(i06, "I06_DOK_NR").text     = dok_num
#         ET.SubElement(i06, "I06_OP_DATA").text    = format_date(op_date)
#         ET.SubElement(i06, "I06_DOK_DATA").text   = format_date(getattr(doc, 'invoice_date', None))
#         ET.SubElement(i06, "I06_KODAS_KS").text   = smart_str(getattr(doc, 'buyer_id', '') or '')
#         ET.SubElement(i06, "I06_DOK_REG").text    = smart_str(getattr(doc, 'document_number', '') or '')
#         ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

#         # --- Строки документа (I07) ---
#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, 'all') and line_items.exists():
#             for item in line_items.all():
#                 i07 = ET.SubElement(i06, "I07")
#                 kodas = getattr(item, "prekes_kodas", None) or "PREKE002"
#                 ET.SubElement(i07, "I07_KODAS").text = kodas
#                 ET.SubElement(i07, "I07_TIPAS").text = "3"
#                 if currency.upper() == "EUR":
#                     ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(item, "price", None))
#                     ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(item, "vat", None))
#                     ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(item, "subtotal", None))
#                 else:
#                     ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(item, "price", None))
#                     ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(item, "vat", None))
#                     ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(item, "subtotal", None))
#                 ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
#                 ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(item, "vat_percent", None))
#                 ET.SubElement(i07, "T_KIEKIS").text       = str(getattr(item, "quantity", None) or "1")
#                 ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(item, "pvm_kodas", None) or "")
#         else:
#             # Если нет line_items — одна строка
#             i07 = ET.SubElement(i06, "I07")
#             kodas = getattr(doc, "prekes_kodas", None) or "PREKE002"
#             ET.SubElement(i07, "I07_KODAS").text = kodas
#             ET.SubElement(i07, "I07_TIPAS").text = "3"
#             if currency.upper() == "EUR":
#                 ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#                 ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(doc, "vat_amount", None))
#                 ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#             else:
#                 ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#                 ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(doc, "vat_amount", None))
#                 ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(doc, "amount_wo_vat", None))
#             ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
#             ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(doc, "vat_percent", None))
#             ET.SubElement(i07, "T_KIEKIS").text       = "1"
#             ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(doc, "pvm_kodas", None) or "")

#         elements.append(i06)

#     xml = b""
#     for el in elements:
#         xml += prettify_no_header(el) + b"\n"
#     return expand_empty_tags(xml)


