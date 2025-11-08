import xml.etree.ElementTree as ET
import logging
from django.utils.encoding import smart_str
from .formatters import format_date, vat_to_int_str, get_price_or_zero, expand_empty_tags
from ..models import CurrencyRate
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import xml.etree.ElementTree as ET


logger = logging.getLogger(__name__)

# =========================
# Helpers
# =========================

def _safe_D(x):
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")
    
def compute_global_invoice_discount_pct(doc):
    """
    Возвращает Decimal с 2 знаками — процент скидки по документу (0..99.99),
    рассчитанный как invoice_discount_wo_vat / сумма_нетто_по_строкам * 100.
    Если нечего применять — вернёт None.
    Предполагается, что item.price — цена БЕЗ НДС и УЖЕ с учётом всех построчных скидок,
    но БЕЗ учёта документной скидки.
    """
    disc = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
    if disc <= 0:
        return None

    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        base_total = Decimal("0")
        for it in line_items.all():
            qty   = _safe_D(getattr(it, "quantity", 1) or 1)
            price = _safe_D(getattr(it, "price", 0) or 0)  # нетто, уже после всех line скидок
            base_total += (price * qty)
    else:
        # документ без строк: берём сумму нетто по документу
        base_total = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)

    if base_total <= 0:
        return None

    pct = (disc / base_total) * Decimal("100")
    if pct < 0: pct = Decimal("0")
    if pct > Decimal("99.99"): pct = Decimal("99.99")
    return pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    

def get_rivile_fraction(user):
    """
    Берём фракцию только из user.extra_settings['rivile_fraction'].
    Разрешены: 1, 10, 100, 1000. Иначе -> 1.
    """
    try:
        es = getattr(user, "extra_settings", {}) or {}
        val = int(es.get("rivile_fraction", 1))
        return val if val in (1, 10, 100, 1000) else 1
    except Exception:
        return 1

def _scale_qty(qty, frac):
    """qty (None/str/Decimal/float) * frac -> str без экспоненты, без лишних нулей."""
    if qty in (None, ""):
        qty = "1"
    try:
        q = Decimal(str(qty))
    except (InvalidOperation, ValueError):
        q = Decimal("1")
    v = q * Decimal(frac)
    # безопасный вывод без экспоненты:
    s = format(v, "f")            # '1234.0000'
    s = s.rstrip('0').rstrip('.') # '1234'
    return s or "0"


def _s(v):
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def get_currency_rate(currency_code, date_obj):
    """
    Получить курс для валюты на заданную дату (к EUR).
    """
    if not currency_code or currency_code.upper() == "EUR":
        logger.info("[RIVILE:RATE] currency=%r -> 1.0", currency_code)
        return 1.0
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date=date_obj).first()
    if obj:
        logger.info("[RIVILE:RATE] currency=%s date=%s -> exact=%s", currency_code, date_obj, obj.rate)
        return obj.rate
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date__lt=date_obj).order_by('-date').first()
    logger.info("[RIVILE:RATE] currency=%s date=%s -> prev=%s", currency_code, date_obj, (obj.rate if obj else None))
    return obj.rate if obj else None


def prettify_no_header(elem):
    """
    Возвращает pretty-XML без заголовка <?xml ...?> (bytes),
    при этом &quot; заменяется на ".
    """
    from xml.dom import minidom

    rough_string = ET.tostring(elem, encoding="utf-8")
    reparsed = minidom.parseString(rough_string)
    pretty_xml = reparsed.toprettyxml(indent="  ")
    # убираем заголовок <?xml ...?>
    pretty_xml = '\n'.join(pretty_xml.split('\n')[1:])
    # убираем пустые строки
    pretty_xml = '\n'.join([line for line in pretty_xml.split('\n') if line.strip()])
    # ВАЖНО: заменяем только &quot;
    pretty_xml = pretty_xml.replace("&quot;", '"')
    return pretty_xml.encode("utf-8")


def _indent(elem, level=0):
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

def elem_to_bytes_utf8(elem) -> bytes:
    """Один элемент → bytes UTF-8 (без BOM, без заголовка)."""
    _indent(elem)
    return ET.tostring(elem, encoding="utf-8", xml_declaration=False)

def join_records_utf8(elements) -> bytes:
    """Склеить элементы в один файл с ОДНИМ заголовком UTF-8 (без BOM)."""
    header = b'<?xml version="1.0" encoding="UTF-8"?>\n'
    body = b"\n".join(elem_to_bytes_utf8(el) for el in elements)
    return header + body + b"\n"


# def build_dok_nr(series: str, number: str) -> str:
#     """
#     Формирует DOK_NR строго как 'series-number', если series не пустая.
#     - Пустая series -> number
#     - Если number начинается с series (с дефисом или без) -> нормализует в 'series-number'
#     """
#     s = (series or "").strip()
#     n = (number or "").strip()

#     if not s:
#         res = n
#         logger.info("[RIVILE:DOK_NR] s='', n=%r -> %r", n, res)
#         return res
#     if not n:
#         logger.info("[RIVILE:DOK_NR] n='', s=%r -> %r", s, s)
#         return s

#     if n.startswith(s):
#         tail = n[len(s):]
#         if tail.startswith("-"):
#             tail = tail[1:]
#         res = f"{s}-{tail}"
#         logger.info("[RIVILE:DOK_NR] n startswith s: s=%r n=%r -> %r", s, n, res)
#         return res

#     res = f"{s}-{n}"
#     logger.info("[RIVILE:DOK_NR] s=%r n=%r -> %r", s, n, res)
#     return res

def build_dok_nr(series: str, number: str) -> str:
    """
    Формирует DOK_NR как конкатенацию 'series' + 'number' (БЕЗ дефиса).
    Правила:
    - Если series пустая -> вернуть number.
    - Если number пустой -> вернуть series.
    - Если number начинается с series (с дефисом/пробелом/слэшем или без) -> убираем повтор и разделитель.
      Примеры:
        series='AB', number='AB-123'  -> 'AB123'
        series='AB', number='AB123'   -> 'AB123'
        series='AB', number='123'     -> 'AB123'
        series=''  , number='123'     -> '123'
    """
    s = (series or "").strip()
    n = (number or "").strip()

    if not s:
        res = n
        logger.info("[RIVILE:DOK_NR] s='', n=%r -> %r", n, res)
        return res
    if not n:
        logger.info("[RIVILE:DOK_NR] n='', s=%r -> %r", s, s)
        return s

    # если номер начинается с серии — убираем повтор и ведущие разделители
    if n.startswith(s):
        tail = n[len(s):]
        tail = tail.lstrip("-/ .")  # любые типичные разделители после серии
        res = f"{s}{tail}"
        logger.info("[RIVILE:DOK_NR] n startswith s: s=%r n=%r -> %r", s, n, res)
        return res

    res = f"{s}{n}"
    logger.info("[RIVILE:DOK_NR] s=%r n=%r -> %r", s, n, res)
    return res



# ===== ЕДИНЫЙ РЕЗОЛВЕР КОДА КЛИЕНТА/ПОСТАВЩИКА БЕЗ КЭША И РАНДОМА =====
def get_party_code(
    doc,
    *,
    role: str,
    id_field: str,
    vat_field: str,
    id_programoje_field: str,
) -> str:
    """
    Код стороны (seller/buyer) по приоритету:
      1) *_id
      2) *_vat_code
      3) *_id_programoje
    Если все пусто — вернётся "" (ничего не генерируем).
    Генерацию 7-значного *_id_programoje переносим в save_document.
    """
    sid = _s(getattr(doc, id_field, None))
    if sid:
        logger.info("[RIVILE:PARTY] %s: %s -> %s", role, id_field, sid)
        return sid

    svat = _s(getattr(doc, vat_field, None))
    if svat:
        logger.info("[RIVILE:PARTY] %s: %s -> %s", role, vat_field, svat)
        return svat

    sidp = _s(getattr(doc, id_programoje_field, None))
    if sidp:
        logger.info("[RIVILE:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
        return sidp

    logger.info("[RIVILE:PARTY] %s: empty id/vat/id_programoje -> ''", role)
    return ""


def normalize_preke_paslauga_tipas(value: object) -> str:
    """
    Вернёт '1' | '2' | '3' из любого ввода.
    Поддерживает: 1/2/3, 'preke/prekė/prekes/prekės', 'paslauga/paslaugos',
    'kodas/kodai', пробелы, запятые/точки. Пусто/непонятно -> '1'.
    """
    if value is None:
        logger.info("[RIVILE:TIPAS] value=None -> '1'")
        return "1"
    s = str(value).strip().lower()
    if not s:
        logger.info("[RIVILE:TIPAS] value='' -> '1'")
        return "1"

    try:
        n = int(float(s.replace(",", ".")))
        if n in (1, 2, 3):
            logger.info("[RIVILE:TIPAS] numeric %r -> %r", s, n)
            return str(n)
    except ValueError:
        pass

    preke_syn    = {"preke", "prekė", "prekes", "prekės"}
    paslauga_syn = {"paslauga", "paslaugos"}
    kodas_syn    = {"kodas", "kodai"}

    if s in preke_syn:
        logger.info("[RIVILE:TIPAS] word %r -> '1'", s)
        return "1"
    if s in paslauga_syn:
        logger.info("[RIVILE:TIPAS] word %r -> '2'", s)
        return "2"
    if s in kodas_syn:
        logger.info("[RIVILE:TIPAS] word %r -> '3'", s)
        return "3"
    logger.info("[RIVILE:TIPAS] fallback for %r -> '1'", s)
    return "1"


EU_ISO2 = {
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE",
    "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"
}

def _is_eu_country(iso: object) -> bool:
    """True только для явных ISO2 из списка ЕС. Пустое значение -> False."""
    if not iso:
        return False
    return str(iso).strip().upper() in EU_ISO2

def _is_zero(v) -> bool:
    """Нулевая ставка НДС? None/'' считаем как 0 для этого правила."""
    try:
        return Decimal(str(v)) == 0
    except Exception:
        return True
    
def _pick_isaf_for_purchase(doc):
    """
    Возвращает:
      - '12' -> Neformuoti (НЕ включать в i.SAF)
      - None  -> не ставить тег вовсе (включать по умолчанию)

    Правило:
      если (seller_country_iso пусто ИЛИ не-ЕС) И ВСЕ ставки vat_percent по строкам == 0
      -> '12', иначе None.
    """
    country = getattr(doc, "seller_country_iso", "") or ""
    is_eu = _is_eu_country(country)          # пусто даст False
    non_eu_or_empty = not is_eu

    # определяем "все строки 0%"
    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        vat_zero_all = all(_is_zero(getattr(it, "vat_percent", None)) for it in line_items.all())
    else:
        vat_zero_all = _is_zero(getattr(doc, "vat_percent", None))

    if non_eu_or_empty and vat_zero_all:
        return "12"

    return None



# =========================================================
# 1) PREKĖS / PASLAУGOS / KODAI (N25)
# =========================================================
def export_prekes_paslaugos_kodai_group_to_rivile(documents):
    """
    Возвращает три XML-потока БЕЗ <root>:
      - prekes_xml (N17)  — только товары
      - paslaugos_xml (N17) — только услуги
      - kodai_xml (N25)  — если doc.preke_paslauga == '3', формируем блоки <N25> по заданному шаблону
    """
    logger.info("[RIVILE:N17/N25] start, docs=%d", len(documents) if documents is not None else 0)
    prekes_dict = {}      # key: kodas -> Element("N17")
    paslaugos_dict = {}   # key: kodas -> Element("N17")
    kodai_dict = {}       # key: kodas -> Element("N25")

    def add_n17_record(target_dict, kodas, tipas, unit, pavadinimas, kodas_ds="PR001"):
        if not kodas:
            return
        if kodas in target_dict:
            return
        n17 = ET.Element("N17")
        ET.SubElement(n17, "N17_KODAS_PS").text = smart_str(kodas)
        ET.SubElement(n17, "N17_TIPAS").text    = smart_str(tipas or '1')
        ET.SubElement(n17, "N17_KODAS_US").text = smart_str(unit or "VNT")
        ET.SubElement(n17, "N17_PAV").text      = smart_str(pavadinimas or "Prekė")
        ET.SubElement(n17, "N17_KODAS_DS").text = smart_str(kodas_ds or "PR001")
        target_dict[kodas] = n17
        logger.info("[RIVILE:N17] added kodas=%r tipas=%r unit=%r", kodas, tipas, unit)

    def add_n25_record(kodai_dict, doc):
        kodas = getattr(doc, "prekes_kodas", None)
        if not kodas or kodas in kodai_dict:
            return

        pavadinimas = getattr(doc, "prekes_pavadinimas", None) or "Prekė"

        # TIPAS для N25 зависит от pirkimas/pardavimas
        pirk_pard = (getattr(doc, "pirkimas_pardavimas", "") or "").strip().lower()
        if pirk_pard == "pirkimas":
            tipas = "1"
        elif pirk_pard == "pardavimas":
            tipas = "2"
        else:
            tipas = "1"  # дефолт

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
        logger.info("[RIVILE:N25] added kodas=%r tipas=%r saskaita=%r", kodas, tipas, saskaita)

    for doc in documents or []:
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        logger.info("[RIVILE:N17/N25] doc=%s has_items=%s", getattr(doc, "pk", None), has_items)

        if not has_items:
            tipas = normalize_preke_paslauga_tipas(getattr(doc, "preke_paslauga", None))
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
                tipas = normalize_preke_paslauga_tipas(
                    getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
                )
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

    # prekes_xml = b"".join(prettify_no_header(el) + b"\n" for el in prekes_dict.values())
    # paslaugos_xml = b"".join(prettify_no_header(el) + b"\n" for el in paslaugos_dict.values())
    # kodai_xml = b"".join(prettify_no_header(el) + b"\n" for el in kodai_dict.values())
    prekes_xml    = join_records_utf8(list(prekes_dict.values()))    if prekes_dict    else b""
    paslaugos_xml = join_records_utf8(list(paslaugos_dict.values())) if paslaugos_dict else b""
    kodai_xml     = join_records_utf8(list(kodai_dict.values()))     if kodai_dict     else b""

    if prekes_xml.strip():
        prekes_xml = expand_empty_tags(prekes_xml)
    if paslaugos_xml.strip():
        paslaugos_xml = expand_empty_tags(paslaugos_xml)
    if kodai_xml.strip():
        kodai_xml = expand_empty_tags(kodai_xml)

    logger.info("[RIVILE:N17/N25] done prekes=%d paslaugos=%d kodai=%d",
                len(prekes_dict), len(paslaugos_dict), len(kodai_dict))
    return prekes_xml, paslaugos_xml, kodai_xml


# =========================================================
# 2) PIRKIMAI (I06/I07)
# =========================================================
def export_pirkimai_group_to_rivile(documents, user):
    elements = []
    for doc in documents or []:
        frac = get_rivile_fraction(user)
        use_frac = (frac != 1)

        i06 = ET.Element("I06")
        currency = getattr(doc, 'currency', 'EUR') or 'EUR'
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
        ET.SubElement(i06, "I06_OP_TIP").text = "1"

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        dok_num = build_dok_nr(series, number)

        discount_pct = compute_global_invoice_discount_pct(doc)  # Decimal('x.xx') или None

        if currency.upper() != "EUR":
            ET.SubElement(i06, "I06_VAL_POZ").text = "1"
            ET.SubElement(i06, "I06_KODAS_VL").text = currency.upper()
            rate = get_currency_rate(currency, op_date)
            ET.SubElement(i06, "I06_KURSAS").text = str(rate if rate else "1")
        else:
            ET.SubElement(i06, "I06_VAL_POZ").text = "0"

        ET.SubElement(i06, "I06_DOK_NR").text   = dok_num
        ET.SubElement(i06, "I06_OP_DATA").text  = format_date(op_date)
        ET.SubElement(i06, "I06_DOK_DATA").text = format_date(getattr(doc, 'invoice_date', None))

        # ЕДИНЫЙ КОД ПРОДАВЦА (seller): id -> vat -> id_programoje
        seller_code = get_party_code(
            doc,
            role="seller",
            id_field="seller_id",
            vat_field="seller_vat_code",
            id_programoje_field="seller_id_programoje",
        )
        ET.SubElement(i06, "I06_KODAS_KS").text = smart_str(seller_code)
        logger.info("[RIVILE:I06] doc=%s dir=pirkimas KODAS_KS=%r DOK_NR=%r CUR=%s",
                    getattr(doc, "pk", None), seller_code, dok_num, currency)
        

        ET.SubElement(i06, "I06_DOK_REG").text    = dok_num
        code_isaf = _pick_isaf_for_purchase(doc)
        if code_isaf == "12":
            ET.SubElement(i06, "I06_ISAF").text = "12"

        ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

        line_items = getattr(doc, "line_items", None)
        added = 0
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            line_map = getattr(doc, "_pvm_line_map", None)  # есть -> multi; нет -> single
            for item in line_items.all():
                i07 = ET.SubElement(i06, "I07")

                kodas = getattr(item, "prekes_kodas", None) or getattr(doc, "prekes_kodas", None) or "PREKE001"
                ET.SubElement(i07, "I07_KODAS").text = kodas

                preke_paslauga_src = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
                tipas = normalize_preke_paslauga_tipas(preke_paslauga_src)
                ET.SubElement(i07, "I07_TIPAS").text = tipas

                if currency.upper() == "EUR":
                    ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(item, "subtotal", None))
                else:
                    ET.SubElement(i07, "I07_VAL_KAINA").text = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM_VAL").text   = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA_VAL").text  = get_price_or_zero(getattr(item, "subtotal", None))

                if discount_pct is not None:
                    ET.SubElement(i07, "I07_NUOLAIDA").text = f"{discount_pct:.2f}"
                ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
                ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(item, "vat_percent", None))
                # ET.SubElement(i07, "T_KIEKIS").text       = str(getattr(item, "quantity", None) or "1")
                qty_scaled = _scale_qty(getattr(item, "quantity", None), frac) if use_frac else str(getattr(item, "quantity", None) or "1")
                ET.SubElement(i07, "T_KIEKIS").text = qty_scaled
                if use_frac:
                    ET.SubElement(i07, "I07_FRAKCIJA").text = str(frac)

                # источники кода без fallback’ов
                if line_map is not None:  # multi
                    code = (line_map or {}).get(getattr(item, "id", None))
                else:                      # single
                    code = getattr(item, "pvm_kodas", None)
                ET.SubElement(i07, "I07_KODAS_KL").text = smart_str(code or "")

                added += 1
        else:
            i07 = ET.SubElement(i06, "I07")
            kodas = getattr(doc, "prekes_kodas", None) or "PREKE001"
            ET.SubElement(i07, "I07_KODAS").text = kodas
            ET.SubElement(i07, "I07_TIPAS").text = normalize_preke_paslauga_tipas(getattr(doc, "preke_paslauga", None))

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
            # ET.SubElement(i07, "T_KIEKIS").text       = "1"
            qty_scaled = _scale_qty(1, frac) if use_frac else "1"
            ET.SubElement(i07, "T_KIEKIS").text = qty_scaled
            if use_frac:
                ET.SubElement(i07, "I07_FRAKCIJA").text = str(frac)
            ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(doc, "pvm_kodas", None) or "")
            added = 1

        logger.info("[RIVILE:I07] doc=%s lines=%d", getattr(doc, "pk", None), added)
        elements.append(i06)

    # xml = b""
    # for el in elements:
    #     xml += prettify_ansi(el) + b"\n"
    # return expand_empty_tags(xml)
    xml = join_records_utf8(elements) if elements else b""
    return expand_empty_tags(xml)


# =========================================================
# 3) PARDAVIMAI (I06/I07)
# =========================================================
def export_pardavimai_group_to_rivile(documents, user):
    elements = []
    for doc in documents or []:
        frac = get_rivile_fraction(user)
        use_frac = (frac != 1)

        i06 = ET.Element("I06")
        currency = getattr(doc, 'currency', 'EUR') or 'EUR'
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        dok_num = build_dok_nr(series, number)

        discount_pct = compute_global_invoice_discount_pct(doc)  # Decimal('x.xx') или None

        ET.SubElement(i06, "I06_OP_TIP").text = "51"
        if currency.upper() != "EUR":
            ET.SubElement(i06, "I06_VAL_POZ").text = "1"
            ET.SubElement(i06, "I06_KODAS_VL").text = currency.upper()
            rate = get_currency_rate(currency, op_date)
            ET.SubElement(i06, "I06_KURSAS").text = str(rate if rate else "")
        else:
            ET.SubElement(i06, "I06_VAL_POZ").text = "0"

        ET.SubElement(i06, "I06_DOK_NR").text   = dok_num
        ET.SubElement(i06, "I06_OP_DATA").text  = format_date(op_date)
        ET.SubElement(i06, "I06_DOK_DATA").text = format_date(getattr(doc, 'invoice_date', None))

        # ЕДИНЫЙ КОД ПОКУПАТЕЛЯ (buyer): id -> vat -> id_programoje
        buyer_code = get_party_code(
            doc,
            role="buyer",
            id_field="buyer_id",
            vat_field="buyer_vat_code",
            id_programoje_field="buyer_id_programoje",
        )
        ET.SubElement(i06, "I06_KODAS_KS").text = smart_str(buyer_code)
        logger.info("[RIVILE:I06] doc=%s dir=pardavimas KODAS_KS=%r DOK_NR=%r CUR=%s",
                    getattr(doc, "pk", None), buyer_code, dok_num, currency)

        ET.SubElement(i06, "I06_DOK_REG").text    = smart_str(getattr(doc, 'document_number', '') or '')
        ET.SubElement(i06, "I06_APRASYMAS1").text = smart_str(getattr(doc, 'preview_url', '') or '')

        line_items = getattr(doc, "line_items", None)
        added = 0
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            line_map = getattr(doc, "_pvm_line_map", None)  # есть -> multi; нет -> single
            for item in line_items.all():
                i07 = ET.SubElement(i06, "I07")

                kodas = getattr(item, "prekes_kodas", None) or getattr(doc, "prekes_kodas", None) or "PREKE002"
                ET.SubElement(i07, "I07_KODAS").text = kodas

                preke_paslauga_src = getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
                tipas = normalize_preke_paslauga_tipas(preke_paslauga_src)
                ET.SubElement(i07, "I07_TIPAS").text = tipas

                if currency.upper() == "EUR":
                    ET.SubElement(i07, "I07_KAINA_BE").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM").text       = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA").text      = get_price_or_zero(getattr(item, "subtotal", None))
                else:
                    ET.SubElement(i07, "I07_VAL_KAINA").text  = get_price_or_zero(getattr(item, "price", None))
                    ET.SubElement(i07, "I07_PVM_VAL").text    = get_price_or_zero(getattr(item, "vat", None))
                    ET.SubElement(i07, "I07_SUMA_VAL").text   = get_price_or_zero(getattr(item, "subtotal", None))

                if discount_pct is not None:
                    ET.SubElement(i07, "I07_NUOLAIDA").text = f"{discount_pct:.2f}"

                ET.SubElement(i07, "I07_MOKESTIS").text   = "1"
                ET.SubElement(i07, "I07_MOKESTIS_P").text = vat_to_int_str(getattr(item, "vat_percent", None))
                # ET.SubElement(i07, "T_KIEKIS").text       = str(getattr(item, "quantity", None) or "1")
                qty_scaled = _scale_qty(getattr(item, "quantity", None), frac) if use_frac else str(getattr(item, "quantity", None) or "1")
                ET.SubElement(i07, "T_KIEKIS").text = qty_scaled
                if use_frac:
                    ET.SubElement(i07, "I07_FRAKCIJA").text = str(frac)

                # источники кода без fallback’ов
                if line_map is not None:  # multi
                    code = (line_map or {}).get(getattr(item, "id", None))
                else:                      # single
                    code = getattr(item, "pvm_kodas", None)
                ET.SubElement(i07, "I07_KODAS_KL").text = smart_str(code or "")

                added += 1
        else:
            i07 = ET.SubElement(i06, "I07")
            kodas = getattr(doc, "prekes_kodas", None) or "PREKE002"
            ET.SubElement(i07, "I07_KODAS").text = kodas
            ET.SubElement(i07, "I07_TIPAS").text = normalize_preke_paslauga_tipas(getattr(doc, "preke_paslauga", None))

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
            # ET.SubElement(i07, "T_KIEKIS").text       = "1"
            qty_scaled = _scale_qty(1, frac) if use_frac else "1"
            ET.SubElement(i07, "T_KIEKIS").text = qty_scaled
            if use_frac:
                ET.SubElement(i07, "I07_FRAKCIJA").text = str(frac)
            ET.SubElement(i07, "I07_KODAS_KL").text   = smart_str(getattr(doc, "pvm_kodas", None) or "")
            added = 1

        logger.info("[RIVILE:I07] doc=%s lines=%d", getattr(doc, "pk", None), added)
        elements.append(i06)

    # xml = b""
    # for el in elements:
    #     xml += prettify_ansi(el) + b"\n"
    # return expand_empty_tags(xml)
    xml = join_records_utf8(elements) if elements else b""
    return expand_empty_tags(xml)


# =========================================================
# 4) KLIENTAI (N08 + N33)
# =========================================================
def _nz(v):
    """True, если есть непустая строка после strip()."""
    return bool((str(v).strip() if v is not None else ""))


def export_clients_group_to_rivile(clients=None, documents=None):
    """
    Возвращает XML (N08 с вложенным N33) без <root>.
    Берёт клиентов из documents (автовытягивание seller/buyer) и/или из clients.
    """
    elements = []
    client_codes_seen = set()

    # --- 1) Извлекаем из документов ---
    if documents:
        logger.info("[RIVILE:N08] collect from documents: %d", len(documents))
        for doc in documents:
            # корректно определяем сторону
            doc_type = (_s(getattr(doc, 'pirkimas_pardavimas', ''))).lower()
            if doc_type not in ('pirkimas', 'pardavimas'):
                if _nz(getattr(doc, 'seller_id', None)) or _nz(getattr(doc, 'seller_vat_code', None)) or _nz(getattr(doc, 'seller_id_programoje', None)):
                    doc_type = 'pirkimas'
                elif _nz(getattr(doc, 'buyer_id', None)) or _nz(getattr(doc, 'buyer_vat_code', None)) or _nz(getattr(doc, 'buyer_id_programoje', None)):
                    doc_type = 'pardavimas'
                else:
                    logger.info("[RIVILE:N08] doc=%s skipped (no side nor ids)", getattr(doc, "pk", None))
                    continue

            if doc_type == 'pirkimas':
                # ЕДИНЫЙ КОД: как и в I06 (seller)
                client_code = get_party_code(
                    doc,
                    role="seller",
                    id_field="seller_id",
                    vat_field="seller_vat_code",
                    id_programoje_field="seller_id_programoje",
                )
                if client_code not in client_codes_seen:
                    client_data = {
                        'type': 'pirkimas',
                        'client_code': client_code,
                        'seller_id': _s(getattr(doc, 'seller_id', '') or ''),
                        'seller_vat_code': _s(getattr(doc, 'seller_vat_code', '') or ''),
                        'seller_id_programoje': _s(getattr(doc, 'seller_id_programoje', '') or ''),
                        'seller_is_person': bool(getattr(doc, 'seller_is_person', False)),
                        'name': _s(getattr(doc, 'seller_name', '') or ''),
                        'address': _s(getattr(doc, 'seller_address', '') or ''),
                        'country_iso': _s(getattr(doc, 'seller_country_iso', '') or ''),
                        'currency': (getattr(doc, 'currency', 'EUR') or 'EUR').upper(),
                        'kodas_ds': _s(getattr(doc, 'kodas_ds', 'PT001') or 'PT001'),
                        'iban': _s(getattr(doc, 'seller_iban', '') or ''),
                    }
                    logger.info("[RIVILE:N08] add from doc=%s type=pirkimas client_code=%r", getattr(doc, "pk", None), client_code)
                    _add_client_n08(elements, client_data)
                    client_codes_seen.add(client_code)
                else:
                    logger.info("[RIVILE:N08] skip duplicate client_code=%r (doc=%s)", client_code, getattr(doc, "pk", None))

            elif doc_type == 'pardavimas':
                # ЕДИНЫЙ КОД: как и в I06 (buyer)
                client_code = get_party_code(
                    doc,
                    role="buyer",
                    id_field="buyer_id",
                    vat_field="buyer_vat_code",
                    id_programoje_field="buyer_id_programoje",
                )
                if client_code not in client_codes_seen:
                    client_data = {
                        'type': 'pardavimas',
                        'client_code': client_code,
                        'buyer_id': _s(getattr(doc, 'buyer_id', '') or ''),
                        'buyer_vat_code': _s(getattr(doc, 'buyer_vat_code', '') or ''),
                        'buyer_id_programoje': _s(getattr(doc, 'buyer_id_programoje', '') or ''),
                        'buyer_is_person': bool(getattr(doc, 'buyer_is_person', False)),
                        'name': _s(getattr(doc, 'buyer_name', '') or ''),
                        'address': _s(getattr(doc, 'buyer_address', '') or ''),
                        'country_iso': _s(getattr(doc, 'buyer_country_iso', '') or ''),
                        'currency': (getattr(doc, 'currency', 'EUR') or 'EUR').upper(),
                        'kodas_ds': _s(getattr(doc, 'kodas_ds', 'PT001') or 'PT001'),
                        'iban': _s(getattr(doc, 'buyer_iban', '') or ''),
                    }
                    logger.info("[RIVILE:N08] add from doc=%s type=pardavimas client_code=%r", getattr(doc, "pk", None), client_code)
                    _add_client_n08(elements, client_data)
                    client_codes_seen.add(client_code)
                else:
                    logger.info("[RIVILE:N08] skip duplicate client_code=%r (doc=%s)", client_code, getattr(doc, "pk", None))

    # --- 2) Клиенты, переданные вручную ---
    if clients:
        logger.info("[RIVILE:N08] collect from clients dicts: %d", len(clients))
        for client in clients:
            doc_type = _s(client.get('type')).lower()

            if doc_type == 'pirkimas':
                client_code = (
                    _s(client.get('client_code'))
                    or _s(client.get('seller_id'))
                    or _s(client.get('seller_vat_code'))
                    or _s(client.get('seller_id_programoje'))
                )
            elif doc_type == 'pardavimas':
                client_code = (
                    _s(client.get('client_code'))
                    or _s(client.get('buyer_id'))
                    or _s(client.get('buyer_vat_code'))
                    or _s(client.get('buyer_id_programoje'))
                )
            else:
                client_code = (
                    _s(client.get('client_code'))
                    or _s(client.get('id'))
                    or _s(client.get('vat'))
                    or _s(client.get('id_programoje'))
                )

            if client_code and client_code not in client_codes_seen:
                logger.info("[RIVILE:N08] add from clients type=%s client_code=%r raw=%s", doc_type, client_code, client)
                client = {**client, 'client_code': client_code}
                _add_client_n08(elements, client)
                client_codes_seen.add(client_code)
            else:
                logger.info("[RIVILE:N08] skip duplicate/empty client_code=%r (manual)", client_code)

    # --- 3) Склеиваем и возвращаем XML ---
    logger.info("[RIVILE:N08] total unique clients: %d", len(elements))
    # xml = b""
    # for el in elements:
    #     xml += prettify_ansi(el) + b"\n"
    # return expand_empty_tags(xml)
    xml = join_records_utf8(elements) if elements else b""
    return expand_empty_tags(xml)


def _add_client_n08(elements, client):
    """
    Правила:
      - N08_IM_KODAS: только seller_id/buyer_id (или id в else); если пусто — оставляем пустым.
      - N08_PVM_KODAS: только seller_vat_code/buyer_vat_code (или vat в else).
      - N08_KODAS_KS и N33_KODAS_KS: client_code собран по цепочке *_id -> *_vat_code -> *_id_programoje (без рандома).
    """
    doc_type = _s(client.get('type')).lower()

    if doc_type == 'pirkimas':
        client_code = (
            _s(client.get('client_code'))
            or _s(client.get('seller_id'))
            or _s(client.get('seller_vat_code'))
            or _s(client.get('seller_id_programoje'))
        )
        vat_code    = _s(client.get('seller_vat_code'))      # только VAT-код продавца
        im_code     = _s(client.get('seller_id'))            # только ID продавца
        tipas       = "2" if client.get('seller_is_person') else "1"
        tipas_pirk, tipas_tiek, rusis = "0", "1", "2"
    elif doc_type == 'pardavimas':
        client_code = (
            _s(client.get('client_code'))
            or _s(client.get('buyer_id'))
            or _s(client.get('buyer_vat_code'))
            or _s(client.get('buyer_id_programoje'))
        )
        vat_code    = _s(client.get('buyer_vat_code'))       # только VAT-код покупателя
        im_code     = _s(client.get('buyer_id'))             # только ID покупателя
        tipas       = "2" if client.get('buyer_is_person') else "1"
        tipas_pirk, tipas_tiek, rusis = "1", "0", "1"
    else:
        client_code = (
            _s(client.get('client_code'))
            or _s(client.get('id'))
            or _s(client.get('vat'))
            or _s(client.get('id_programoje'))
        )
        vat_code    = _s(client.get('vat'))
        im_code     = _s(client.get('id'))
        tipas       = "2" if client.get('is_person') else "1"
        tipas_pirk, tipas_tiek, rusis = "1", "1", "1"

    name = _s(client.get('name')) or 'Nezinoma'
    currency = smart_str((_s(client.get('currency')) or 'EUR')).upper()
    val_poz = "0" if currency == "EUR" else "1"

    logger.info("[RIVILE:N08->] type=%s name=%r KODAS_KS=%r IM_KODAS=%r PVM_KODAS=%r VL=%s",
                doc_type, name, client_code, im_code, vat_code, currency)

    n08 = ET.Element("N08")
    ET.SubElement(n08, "N08_KODAS_KS").text    = smart_str(client_code)
    ET.SubElement(n08, "N08_RUSIS").text       = rusis
    ET.SubElement(n08, "N08_PVM_KODAS").text   = smart_str(vat_code)
    ET.SubElement(n08, "N08_IM_KODAS").text    = smart_str(im_code)
    ET.SubElement(n08, "N08_PAV").text         = smart_str(name or 'Nezinoma')
    ET.SubElement(n08, "N08_ADR").text         = smart_str(_s(client.get('address')))
    ET.SubElement(n08, "N08_TIPAS_PIRK").text  = tipas_pirk
    ET.SubElement(n08, "N08_TIPAS_TIEK").text  = tipas_tiek
    ET.SubElement(n08, "N08_KODAS_DS").text    = smart_str(client.get('kodas_ds', 'PT001'))
    ET.SubElement(n08, "N08_KODAS_XS_T").text  = "PVM"
    ET.SubElement(n08, "N08_KODAS_XS_P").text  = "PVM"
    ET.SubElement(n08, "N08_VAL_POZ").text     = val_poz
    ET.SubElement(n08, "N08_KODAS_VL_1").text  = currency
    ET.SubElement(n08, "N08_BUSENA").text      = "1"
    ET.SubElement(n08, "N08_TIPAS").text       = tipas

    n33 = ET.SubElement(n08, "N33")
    ET.SubElement(n33, "N33_NUTYL").text       = "1"
    ET.SubElement(n33, "N33_KODAS_KS").text    = smart_str(client_code)   # тот же код, что и в N08_KODAS_KS
    ET.SubElement(n33, "N33_S_KODAS").text     = smart_str(_s(client.get('iban')))
    ET.SubElement(n33, "N33_SALIES_K").text    = smart_str(_s(client.get('country_iso')).upper())

    elements.append(n08)
