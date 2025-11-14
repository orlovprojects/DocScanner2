import logging
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import date

from django.utils.encoding import smart_str
from .formatters import format_date_agnum, vat_to_int_str, get_price_or_zero, expand_empty_tags
from ..models import CurrencyRate


logger = logging.getLogger(__name__)


# =========================
# HELPERS
# =========================

def _safe_D(x):
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _s(v):
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def _agnum_empty_varchar():
    return ""


def _agnum_empty_date():
    return "1900-01-01"


def _agnum_empty_bool():
    return "N"


def _agnum_pozymiai_100():
    return "0" * 100


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


def get_currency_rate(currency_code, date_obj):
    """Получить курс для валюты на заданную дату (к EUR)."""
    if not currency_code or currency_code.upper() == "EUR":
        logger.info("[AGNUM:RATE] currency=%r -> 1.0", currency_code)
        return 1.0
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date=date_obj).first()
    if obj:
        logger.info("[AGNUM:RATE] currency=%s date=%s -> exact=%s", currency_code, date_obj, obj.rate)
        return obj.rate
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date__lt=date_obj).order_by('-date').first()
    logger.info("[AGNUM:RATE] currency=%s date=%s -> prev=%s", currency_code, date_obj, (obj.rate if obj else None))
    return obj.rate if obj else None


def build_dok_nr(series: str, number: str) -> str:
    """Формирует DOK_NR как конкатенацию 'series' + 'number' (БЕЗ дефиса)."""
    s = (series or "").strip()
    n = (number or "").strip()

    if not s:
        return n
    if not n:
        return s

    if n.startswith(s):
        tail = n[len(s):]
        tail = tail.lstrip("-/ .")
        return f"{s}{tail}"

    return f"{s}{n}"


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
    """
    sid = _s(getattr(doc, id_field, None))
    if sid:
        logger.info("[AGNUM:PARTY] %s: %s -> %s", role, id_field, sid)
        return sid

    svat = _s(getattr(doc, vat_field, None))
    if svat:
        logger.info("[AGNUM:PARTY] %s: %s -> %s", role, vat_field, svat)
        return svat

    sidp = _s(getattr(doc, id_programoje_field, None))
    if sidp:
        logger.info("[AGNUM:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
        return sidp

    logger.info("[AGNUM:PARTY] %s: empty id/vat/id_programoje -> ''", role)
    return ""


def normalize_preke_paslauga_tipas(value: object) -> str:
    """Вернёт '1' | '2' | '3' из любого ввода."""
    if value is None:
        return "1"
    s = str(value).strip().lower()
    if not s:
        return "1"

    try:
        n = int(float(s.replace(",", ".")))
        if n in (1, 2, 3):
            return str(n)
    except ValueError:
        pass

    preke_syn = {"preke", "prekė", "prekes", "prekės"}
    paslauga_syn = {"paslauga", "paslaugos"}
    kodas_syn = {"kodas", "kodai"}

    if s in preke_syn:
        return "1"
    if s in paslauga_syn:
        return "2"
    if s in kodas_syn:
        return "3"
    return "1"


def compute_global_invoice_discount_pct(doc):
    """
    Возвращает Decimal с 2 знаками — процент скидки по документу (0..99.99),
    рассчитанный как invoice_discount_wo_vat / сумма_нетто_по_строкам * 100.
    """
    disc = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
    if disc <= 0:
        return None

    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        base_total = Decimal("0")
        for it in line_items.all():
            qty = _safe_D(getattr(it, "quantity", 1) or 1)
            price = _safe_D(getattr(it, "price", 0) or 0)
            base_total += (price * qty)
    else:
        base_total = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)

    if base_total <= 0:
        return None

    pct = (disc / base_total) * Decimal("100")
    if pct < 0:
        pct = Decimal("0")
    if pct > Decimal("99.99"):
        pct = Decimal("99.99")
    return pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


EU_ISO2 = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
}


def _is_eu_country(iso: object) -> bool:
    """True только для явных ISO2 из списка ЕС."""
    if not iso:
        return False
    return str(iso).strip().upper() in EU_ISO2


def _is_zero(v) -> bool:
    """Нулевая ставка НДС?"""
    try:
        return Decimal(str(v)) == 0
    except Exception:
        return True


def _pick_isaf_for_purchase(doc):
    """
    Возвращает:
      - '12' -> Neformuoti (НЕ включать в i.SAF)
      - None  -> включать по умолчанию
    
    Правило:
      если (seller_country_iso пусто ИЛИ не-ЕС) И ВСЕ ставки vat_percent == 0
      -> '12', иначе None.
    """
    country = getattr(doc, "seller_country_iso", "") or ""
    is_eu = _is_eu_country(country)
    non_eu_or_empty = not is_eu

    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        vat_zero_all = all(_is_zero(getattr(it, "vat_percent", None)) for it in line_items.all())
    else:
        vat_zero_all = _is_zero(getattr(doc, "vat_percent", None))

    if non_eu_or_empty and vat_zero_all:
        return "12"

    return None


# =========================
# AGNUM: PIRKIMAI (Documents Type="2")
# =========================

def _build_agnum_customer_from_doc(doc) -> tuple[str, dict]:
    """Строим один Customers/Item для AGNUM из seller_* полей документа pirkimas."""
    kod = get_party_code(
        doc,
        role="seller",
        id_field="seller_id",
        vat_field="seller_vat_code",
        id_programoje_field="seller_id_programoje",
    )
    if not kod:
        kod = (_s(getattr(doc, "seller_vat_code", "")) or
               _s(getattr(doc, "seller_id", "")) or
               "UNKNOWN_SELLER")

    name = _s(getattr(doc, "seller_name", "")) or kod
    adr = _s(getattr(doc, "seller_address", ""))
    email = _s(getattr(doc, "seller_email", ""))
    country = _s(getattr(doc, "seller_country_iso", "")).upper()
    rkod = _s(getattr(doc, "seller_id", "")) or _s(getattr(doc, "seller_vat_code", ""))
    pvmkod = _s(getattr(doc, "seller_vat_code", ""))
    currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"

    attrs = {
        "KOD": kod,
        "PAVAD": name,
        "CONTACT": _agnum_empty_varchar(),
        "ADR": adr,
        "TLF": _agnum_empty_varchar(),
        "FAX": _agnum_empty_varchar(),
        "RKOD": rkod or _agnum_empty_varchar(),
        "PVMKOD": pvmkod,
        "BKOD": _agnum_empty_varchar(),
        "BPAVAD": _agnum_empty_varchar(),
        "BSASK": _agnum_empty_varchar(),
        "F1": _agnum_empty_varchar(),
        "F2": _agnum_empty_varchar(),
        "F3": _agnum_empty_varchar(),
        "F4": _agnum_empty_varchar(),
        "F5": _agnum_empty_varchar(),
        "INFO": _agnum_empty_varchar(),
        "ACC1": _agnum_empty_varchar(),
        "ACC2": _agnum_empty_varchar(),
        "ACC3": _agnum_empty_varchar(),
        "ACC4": _agnum_empty_varchar(),
        "ACC5": _agnum_empty_varchar(),
        "ACC6": _agnum_empty_varchar(),
        "ACC7": _agnum_empty_varchar(),
        "ACC8": _agnum_empty_varchar(),
        "ACC9": _agnum_empty_varchar(),
        "ACC10": _agnum_empty_varchar(),
        "ACC11": _agnum_empty_varchar(),
        "ACC12": _agnum_empty_varchar(),
        "SALIS_KOD": country or _agnum_empty_varchar(),
        "SALIS": _agnum_empty_varchar(),
        "MIESTAS": _agnum_empty_varchar(),
        "GATVE": _agnum_empty_varchar(),
        "EMAIL": email,
        "PINDEX": _agnum_empty_varchar(),
        "SAVIVKOD": _agnum_empty_varchar(),
        "APSKR": _agnum_empty_varchar(),
        "KRD": "Y",
        "DEB": "N",
        "AKTYVUS": "Y",
        "POZYMIAI": _agnum_pozymiai_100(),
        "KOD_IS": _agnum_empty_varchar(),
        "DEFAULT_CURR": currency or "EUR",
        "FIZ_ASM": "N",
        "VEZEJAS": "N",
        "KNGR": "4",
    }
    return kod, attrs


def _build_agnum_good_from_item(doc, item) -> tuple[str, dict]:
    """Строим один Goods/Item по строке."""
    kod = (_s(getattr(item, "prekes_kodas", "")) or
           _s(getattr(item, "prekes_barkodas", "")) or
           "PREKE001")

    snd_kod = _s(getattr(doc, "agnum_snd_kod", "")) or "**OBJ"
    name = _s(getattr(item, "prekes_pavadinimas", "")) or "Prekė"

    tipas_str = normalize_preke_paslauga_tipas(
        getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
    )
    if tipas_str == "2":
        cls = "1"
    else:
        cls = "0"

    unit = _s(getattr(item, "unit", "")) or "vnt."
    curr = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
    vat_pct = getattr(item, "vat_percent", None)

    attrs = {
        "KOD": kod,
        "SND_KOD": snd_kod,
        "PAVAD": name,
        "CLASS": cls,
        "GRUPE": _agnum_empty_varchar(),
        "POGRUPIS": _agnum_empty_varchar(),
        "KATEG": _agnum_empty_varchar(),
        "PAVAD1": _agnum_empty_varchar(),
        "PAVAD2": _agnum_empty_varchar(),
        "PAVAD3": _agnum_empty_varchar(),
        "PAVAD4": _agnum_empty_varchar(),
        "PAVAD5": _agnum_empty_varchar(),
        "PAVAD6": _agnum_empty_varchar(),
        "PAVAD7": _agnum_empty_varchar(),
        "PAVAD8": _agnum_empty_varchar(),
        "VNT": unit,
        "VNT2": _agnum_empty_varchar(),
        "SVORIS": "0",
        "SVORIS1": "0",
        "TURIS": "0",
        "VIETA": _agnum_empty_varchar(),
        "METOD": "0",
        "IPAK": "0",
        "KN0": get_price_or_zero(getattr(item, "price", None)),
        "KN1": "0",
        "KN2": "0",
        "KN3": "0",
        "KN4": "0",
        "KN5": "0",
        "KNB": "0",
        "KNBVAL": curr,
        "REZ": "0",
        "UZS": "0",
        "APMOKPVM": "Y",
        "PVM0": vat_to_int_str(vat_pct),
        "PVM": vat_to_int_str(vat_pct),
        "PVM2": vat_to_int_str(vat_pct),
        "PVM3": vat_to_int_str(vat_pct),
        "PVM4": vat_to_int_str(vat_pct),
        "PVM5": vat_to_int_str(vat_pct),
        "MOK0": "0",
        "MEMO": _agnum_empty_varchar(),
        "F1": _agnum_empty_varchar(),
        "F2": _agnum_empty_varchar(),
        "F3": _agnum_empty_varchar(),
        "F4": _agnum_empty_varchar(),
        "F5": _agnum_empty_varchar(),
        "F6": "0",
        "F7": "0",
        "F8": "0",
        "ACC1": _agnum_empty_varchar(),
        "ACC2": _agnum_empty_varchar(),
        "ACC3": _agnum_empty_varchar(),
        "ACC4": _agnum_empty_varchar(),
        "ACC5": _agnum_empty_varchar(),
        "PVM_KOD": _s(getattr(item, "pvm_kodas", "")) or "PVM1",
        "POZYMIAI": _agnum_pozymiai_100(),
    }
    return kod, attrs


def _build_agnum_rows_for_pirkimas(doc, line_items):
    """Собирает список row_attrs для одного документа pirkimai."""
    rows = []
    for item in line_items:
        qty = getattr(item, "quantity", None) or 1
        price = getattr(item, "price", None) or 0
        vat = getattr(item, "vat", None) or 0
        vat_pct = getattr(item, "vat_percent", None)

        row = {
            "KOD": (_s(getattr(item, "prekes_kodas", "")) or
                    _s(getattr(item, "prekes_barkodas", "")) or
                    "PREKE001"),
            "KIEKIS": get_price_or_zero(qty),
            "PRKKN": get_price_or_zero(price),
            "MT": "0",
            "AKC": "0",
            "PVM": get_price_or_zero(vat),
            "PVM_PROC": vat_to_int_str(vat_pct),
            "F1": _agnum_empty_varchar(),
            "F2": _agnum_empty_varchar(),
            "F3": _agnum_empty_varchar(),
            "F4": _agnum_empty_varchar(),
            "F5": _agnum_empty_varchar(),
            "D1": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "D2": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "D3": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "KILMESSALIS": _s(getattr(doc, "seller_country_iso", "")).upper(),
            "APSKRITIS": _agnum_empty_varchar(),
            "PART_PARKN": "0",
            "OBJ_KOD": _agnum_empty_varchar(),
            "PVM_KOD": _s(getattr(item, "pvm_kodas", "")) or "PVM1",
        }
        rows.append(row)
    return rows


def export_pirkimai_group_to_agnum(documents, user):
    """
    Экспортирует список документов-pirkimai в один AGNUM XML файл
    (pajamavimo dokumentai, Documents Type="2").
    """
    logger.info("[AGNUM:PIRKIMAI] start, docs=%d", len(documents) if documents else 0)

    agnum = ET.Element("AgnumData", {
        "Version": "25",
        "CreatedByApp": "Docskanas",
        "CreatedByLogin": str(getattr(user, "id", "1")),
        "CreatedOn": format_date_agnum(getattr(user, "agnum_created_on", None)) or format_date_agnum(date.today()),
    })

    customers_by_kod = {}
    goods_by_kod = {}
    barcodes_set = set()
    docs_data = []

    for doc in (documents or []):
        logger.info("[AGNUM:PIRKIMAI] doc=%s", getattr(doc, "pk", None))

        # 1) клиент (seller)
        cust_kod, cust_attrs = _build_agnum_customer_from_doc(doc)
        if cust_kod not in customers_by_kod:
            customers_by_kod[cust_kod] = cust_attrs

        # 2) строки
        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            items = list(line_items.all())
        else:
            items = []

        if not items:
            qty = 1
            price_wo = getattr(doc, "amount_wo_vat", None) or 0
            vat = getattr(doc, "vat_amount", None) or 0
            vat_pct = getattr(doc, "vat_percent", None)

            fake_item = type("FakeItem", (), {})()
            setattr(fake_item, "prekes_kodas",
                    _s(getattr(doc, "prekes_kodas", "")) or "PREKE001")
            setattr(fake_item, "prekes_barkodas", "")
            setattr(fake_item, "prekes_pavadinimas",
                    _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė")
            setattr(fake_item, "preke_paslauga", getattr(doc, "preke_paslauga", None))
            setattr(fake_item, "unit", "vnt.")
            setattr(fake_item, "quantity", qty)
            setattr(fake_item, "price", price_wo)
            setattr(fake_item, "vat", vat)
            setattr(fake_item, "vat_percent", vat_pct)
            setattr(fake_item, "pvm_kodas", getattr(doc, "pvm_kodas", None))

            items = [fake_item]

        rows = _build_agnum_rows_for_pirkimas(doc, items)

        # 3) товары / штрихкоды
        for item in items:
            g_kod, g_attrs = _build_agnum_good_from_item(doc, item)
            if g_kod not in goods_by_kod:
                goods_by_kod[g_kod] = g_attrs

            barkodas = _s(getattr(item, "prekes_barkodas", ""))
            if barkodas:
                key = (g_kod, barkodas, "1")
                if key not in barcodes_set:
                    barcodes_set.add(key)

        # 4) документ (Documents/Item Type=2)
        currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
        op_date = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None)
        rate = get_currency_rate(currency, op_date) if currency != "EUR" else 1

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        doknr = build_dok_nr(series, number)

        amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
        vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
        total_wo = amount_wo
        skola = amount_wo + vat_amount

        # Проверка CH1 (I.SAF)
        code_isaf = _pick_isaf_for_purchase(doc)
        ch1_value = "N" if code_isaf == "12" else "Y"

        doc_attrs = {
            "DATA": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "DATA_G": format_date_agnum(op_date) or _agnum_empty_date(),
            "DOKNR": doknr,
            "DOKNR2": number,
            "KL_KOD": cust_kod,
            "KL_RKOD": cust_attrs.get("RKOD", _agnum_empty_varchar()),
            "SND_KOD": _s(getattr(doc, "agnum_snd_kod", "")) or "**OBJ",
            "VAL": currency,
            "KURS": str(rate if rate else "1"),
            "TR_TIP": "0",
            "NUOL1": "0",
            "NUOL2": "0",
            "SUMA": get_price_or_zero(amount_wo),
            "MT": "0",
            "AKC": "0",
            "PVM": get_price_or_zero(vat_amount),
            "PVM_KL": "0",
            "KT": "0",
            "PR": "0",
            "SUMAP": "0",
            "TRANSP": "0",
            "SUMVISO": get_price_or_zero(total_wo),
            "DRB": _agnum_empty_varchar(),
            "SKOLA": get_price_or_zero(skola),
            "TERM": "0",
            "APMSUM": "0",
            "SANDORIS": _agnum_empty_varchar(),
            "PRISTSAL": _agnum_empty_varchar(),
            "TRANSPORTAS": _agnum_empty_varchar(),
            "SALISSIUNT": _s(getattr(doc, "seller_country_iso", "")).upper(),
            "TR_VVAL": "Y",
            "POZYMIAI": _agnum_pozymiai_100(),
            "CH1": ch1_value,
            "M0": "Y",
            "M1": "Y",
            "M2": "Y",
            "M3": "Y",
            "M4": "Y",
            "M5": "Y",
            "M6": "Y",
            "M7": "Y",
            "M8": "Y",
            "PVM_KOD": _s(getattr(doc, "pvm_kodas", "")),
            "SPEC_TAX": "N",
            "REF_DOK_DATA": _agnum_empty_date(),
            "REF_DOK_NR": _agnum_empty_varchar(),
            "SF_TIP": "SF",
            "MEMO": _s(getattr(doc, "comment", "")),
            "NUM1": "0",
            "NUM2": "0",
            "NUM3": "0",
            "NUM4": "0",
            "NUM5": "0",
            "TXT1": _agnum_empty_varchar(),
            "TXT2": _agnum_empty_varchar(),
            "TXT3": _agnum_empty_varchar(),
            "TXT4": _agnum_empty_varchar(),
            "TXT5": _agnum_empty_varchar(),
            "PR_VIETA": _agnum_empty_varchar(),
            "Count": str(len(rows)),
        }

        docs_data.append({"attrs": doc_attrs, "rows": rows})

    # XML building
    customers_el = ET.SubElement(agnum, "Customers", {
        "Count": str(len(customers_by_kod)),
    })
    for attrs in customers_by_kod.values():
        ET.SubElement(customers_el, "Item", attrs)

    goods_el = ET.SubElement(agnum, "Goods", {
        "Count": str(len(goods_by_kod)),
    })
    for attrs in goods_by_kod.values():
        ET.SubElement(goods_el, "Item", attrs)

    ET.SubElement(agnum, "Objects", {
        "Count": "0",
    })

    docs_el = ET.SubElement(agnum, "Documents", {
        "Type": "2",
        "Count": str(len(docs_data)),
    })
    for d in docs_data:
        item_el = ET.SubElement(docs_el, "Item", d["attrs"])
        for r in d["rows"]:
            ET.SubElement(item_el, "Row", r)

    barcodes_el = ET.SubElement(agnum, "Barcodes", {
        "Count": str(len(barcodes_set)),
    })
    for (kod, bkod, kiekis) in barcodes_set:
        ET.SubElement(barcodes_el, "Item", {
            "KOD": kod,
            "BKOD": bkod,
            "KIEKIS": kiekis,
        })

    _indent(agnum)
    body = ET.tostring(agnum, encoding="utf-8", xml_declaration=False)
    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + body + b"\n"
    return expand_empty_tags(xml)


# =========================
# AGNUM: PARDAVIMAI (Documents Type="4")
# =========================

def _build_agnum_customer_from_buyer(doc) -> tuple[str, dict]:
    """Строим один Customers/Item для AGNUM из buyer_* полей документа pardavimai."""
    kod = get_party_code(
        doc,
        role="buyer",
        id_field="buyer_id",
        vat_field="buyer_vat_code",
        id_programoje_field="buyer_id_programoje",
    )
    if not kod:
        kod = (_s(getattr(doc, "buyer_vat_code", "")) or
               _s(getattr(doc, "buyer_id", "")) or
               "UNKNOWN_BUYER")

    name = _s(getattr(doc, "buyer_name", "")) or kod
    adr = _s(getattr(doc, "buyer_address", ""))
    email = _s(getattr(doc, "buyer_email", ""))
    country = _s(getattr(doc, "buyer_country_iso", "")).upper()
    rkod = _s(getattr(doc, "buyer_id", "")) or _s(getattr(doc, "buyer_vat_code", ""))
    pvmkod = _s(getattr(doc, "buyer_vat_code", ""))
    currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"

    attrs = {
        "KOD": kod,
        "PAVAD": name,
        "CONTACT": _agnum_empty_varchar(),
        "ADR": adr,
        "TLF": _agnum_empty_varchar(),
        "FAX": _agnum_empty_varchar(),
        "RKOD": rkod or _agnum_empty_varchar(),
        "PVMKOD": pvmkod,
        "BKOD": _agnum_empty_varchar(),
        "BPAVAD": _agnum_empty_varchar(),
        "BSASK": _agnum_empty_varchar(),
        "F1": _agnum_empty_varchar(),
        "F2": _agnum_empty_varchar(),
        "F3": _agnum_empty_varchar(),
        "F4": _agnum_empty_varchar(),
        "F5": _agnum_empty_varchar(),
        "INFO": _agnum_empty_varchar(),
        "ACC1": _agnum_empty_varchar(),
        "ACC2": _agnum_empty_varchar(),
        "ACC3": _agnum_empty_varchar(),
        "ACC4": _agnum_empty_varchar(),
        "ACC5": _agnum_empty_varchar(),
        "ACC6": _agnum_empty_varchar(),
        "ACC7": _agnum_empty_varchar(),
        "ACC8": _agnum_empty_varchar(),
        "ACC9": _agnum_empty_varchar(),
        "ACC10": _agnum_empty_varchar(),
        "ACC11": _agnum_empty_varchar(),
        "ACC12": _agnum_empty_varchar(),
        "SALIS_KOD": country or _agnum_empty_varchar(),
        "SALIS": _agnum_empty_varchar(),
        "MIESTAS": _agnum_empty_varchar(),
        "GATVE": _agnum_empty_varchar(),
        "EMAIL": email,
        "PINDEX": _agnum_empty_varchar(),
        "SAVIVKOD": _agnum_empty_varchar(),
        "APSKR": _agnum_empty_varchar(),
        "KRD": "N",
        "DEB": "Y",
        "AKTYVUS": "Y",
        "POZYMIAI": _agnum_pozymiai_100(),
        "KOD_IS": _agnum_empty_varchar(),
        "DEFAULT_CURR": currency or "EUR",
        "FIZ_ASM": "N",
        "VEZEJAS": "N",
        "KNGR": "4",
    }
    return kod, attrs


def _build_agnum_rows_for_pardavimas(doc, line_items, discount_pct=None):
    """
    Собирает список row_attrs для одного документа pardavimai (Documents Type=4).
    Если discount_pct не None, распределяет документную скидку в NUOL2.
    """
    rows = []
    
    # Для распределения документной скидки считаем base_total
    base_total = Decimal("0")
    if discount_pct is not None:
        for item in line_items:
            qty = _safe_D(getattr(item, "quantity", None) or 1)
            price = _safe_D(getattr(item, "price", None) or 0)
            base_total += (price * qty)

    doc_discount_amount = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)

    for item in line_items:
        qty = getattr(item, "quantity", None) or 1
        price = getattr(item, "price", None) or 0
        vat = getattr(item, "vat", None) or 0
        vat_pct = getattr(item, "vat_percent", None)
        orig = getattr(item, "original_price", None) or price

        try:
            qD = _safe_D(qty)
            pD = _safe_D(price)
            oD = _safe_D(orig)
            line_disc = (oD - pD) if oD > pD else Decimal("0")
        except Exception:
            line_disc = Decimal("0")

        # Распределение документной скидки
        nuol2_value = "0"
        if discount_pct is not None and base_total > 0:
            line_base = qD * pD
            nuol2 = (line_base / base_total * doc_discount_amount)
            nuol2_value = get_price_or_zero(nuol2)

        row = {
            "KOD": (_s(getattr(item, "prekes_kodas", "")) or
                    _s(getattr(item, "prekes_barkodas", "")) or
                    "PREKE002"),
            "BKOD": _s(getattr(item, "prekes_barkodas", "")),
            "KIEKIS": get_price_or_zero(qty),
            "PVM": get_price_or_zero(vat),
            "PVM_PROC": vat_to_int_str(vat_pct),
            "MOK0_PROC": "0",
            "MOK0_LT": "0",
            "VNT": _s(getattr(item, "unit", "")) or "vnt",
            "PARKN": get_price_or_zero(price),
            "ORIGPARKN": get_price_or_zero(orig),
            "NUOL": get_price_or_zero(line_disc),
            "NUOL2": nuol2_value,
            "UZS_SHOPNR": _agnum_empty_varchar(),
            "UZS_UZSNR": _agnum_empty_varchar(),
            "UZS_PRKKOD": _s(getattr(item, "uzsakovo_preke_kodas", "")),
            "ZYME": _agnum_empty_varchar(),
            "UZS_PRDATA": format_date_agnum(getattr(doc, "delivery_date", None)) or _agnum_empty_date(),
            "COMMENT": _s(getattr(item, "comment", "")),
            "VSK_F1": _agnum_empty_varchar(),
            "VSK_F2": _agnum_empty_varchar(),
            "VSK_F3": _agnum_empty_varchar(),
            "VSK_F4": _agnum_empty_varchar(),
            "VSK_F5": _agnum_empty_varchar(),
            "ID_PRK1": "0",
            "PVM_KOD": _s(getattr(item, "pvm_kodas", "")) or "PVM1",
            "OKOD": _agnum_empty_varchar(),
        }
        rows.append(row)
    return rows


def _get_agnum_default_account(user):
    """Возвращает attrs для одного Accounts/Item."""
    es = getattr(user, "extra_settings", {}) or {}
    sask = _s(es.get("agnum_saskaita", "")) or "LT000000000000000000"
    bank_kod = _s(es.get("agnum_bank_code", "")) or "00000"
    bank_name = _s(es.get("agnum_bank_name", "")) or "BANKAS"
    adr = _s(es.get("agnum_bank_address", "")) or ""
    tlf = _s(es.get("agnum_bank_phone", "")) or ""
    swift = _s(es.get("agnum_bank_swift", "")) or ""

    return {
        "SASK": sask,
        "KOD": bank_kod,
        "PAVAD": bank_name,
        "ADR": adr,
        "TLF": tlf,
        "SWIFT": swift,
    }


def export_pardavimai_group_to_agnum(documents, user):
    """
    Экспортирует список документов-pardavimai в один AGNUM XML файл
    (pardavimo dokumentai, Documents Type="4").
    """
    logger.info("[AGNUM:PARDAVIMAI] start, docs=%d", len(documents) if documents else 0)

    agnum = ET.Element("AgnumData", {
        "Version": "25",
        "CreatedByApp": "Docskanas",
        "CreatedByLogin": str(getattr(user, "id", "1")),
        "CreatedOn": format_date_agnum(getattr(user, "agnum_created_on", None)) or format_date_agnum(date.today()),
    })

    customers_by_kod = {}
    goods_by_kod = {}
    barcodes_set = set()
    docs_data = []

    account_attrs = _get_agnum_default_account(user)
    sask_number = account_attrs["SASK"]

    for doc in (documents or []):
        logger.info("[AGNUM:PARDAVIMAI] doc=%s", getattr(doc, "pk", None))

        # 1) клиент (buyer)
        cust_kod, cust_attrs = _build_agnum_customer_from_buyer(doc)
        if cust_kod not in customers_by_kod:
            customers_by_kod[cust_kod] = cust_attrs

        # 2) строки
        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            items = list(line_items.all())
        else:
            items = []

        if not items:
            qty = 1
            price_wo = getattr(doc, "amount_wo_vat", None) or 0
            vat = getattr(doc, "vat_amount", None) or 0
            vat_pct = getattr(doc, "vat_percent", None)

            fake_item = type("FakeItem", (), {})()
            setattr(fake_item, "prekes_kodas",
                    _s(getattr(doc, "prekes_kodas", "")) or "PREKE002")
            setattr(fake_item, "prekes_barkodas", "")
            setattr(fake_item, "prekes_pavadinimas",
                    _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė")
            setattr(fake_item, "preke_paslauga", getattr(doc, "preke_paslauga", None))
            setattr(fake_item, "unit", "vnt.")
            setattr(fake_item, "quantity", qty)
            setattr(fake_item, "price", price_wo)
            setattr(fake_item, "vat", vat)
            setattr(fake_item, "vat_percent", vat_pct)
            setattr(fake_item, "pvm_kodas", getattr(doc, "pvm_kodas", None))
            setattr(fake_item, "original_price", price_wo)

            items = [fake_item]

        # Вычисляем документную скидку
        discount_pct = compute_global_invoice_discount_pct(doc)
        
        rows = _build_agnum_rows_for_pardavimas(doc, items, discount_pct)

        # 3) товары / штрихкоды
        for item in items:
            g_kod, g_attrs = _build_agnum_good_from_item(doc, item)
            if g_kod not in goods_by_kod:
                goods_by_kod[g_kod] = g_attrs

            barkodas = _s(getattr(item, "prekes_barkodas", ""))
            if barkodas:
                key = (g_kod, barkodas, "1")
                if key not in barcodes_set:
                    barcodes_set.add(key)

        # 4) документ (Documents/Item Type=4)
        currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
        op_date = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None)
        rate = get_currency_rate(currency, op_date) if currency != "EUR" else 1

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        doknr = build_dok_nr(series, number)

        amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
        vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
        total_wo = amount_wo
        skola = amount_wo + vat_amount

        apm_sal = _s(getattr(doc, "payment_type_code", "")) or "1"
        term = _s(getattr(doc, "payment_term_days", "")) or "0"

        # Документная скидка
        doc_discount_wo_vat = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
        nuolproc_value = f"{discount_pct:.2f}" if discount_pct is not None else "0"
        nuol_value = get_price_or_zero(doc_discount_wo_vat)

        doc_attrs = {
            "DATA": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "DOKNR": doknr,
            "DOKNR2": number,
            "GVNR": _s(getattr(doc, "transport_document_number", "")),
            "KL_KOD": cust_kod,
            "KL_RKOD": cust_attrs.get("RKOD", _agnum_empty_varchar()),
            "PAD_KOD": _agnum_empty_varchar(),
            "SND_KOD": _s(getattr(doc, "agnum_snd_kod", "")) or "**SAN01",
            "VAL": currency,
            "KURS": str(rate if rate else "1"),
            "NUOLPROC": nuolproc_value,
            "NUOL": nuol_value,
            "SUMA": get_price_or_zero(amount_wo),
            "SUMAP": "0",
            "PVMPROC": "0",
            "PVM": get_price_or_zero(vat_amount),
            "MOK0": "0",
            "SUMVISO": get_price_or_zero(total_wo),
            "SKOLA": get_price_or_zero(skola),
            "APMSUM": "0",
            "APM_SAL": apm_sal,
            "TERM": term,
            "KNTIP": "4",
            "PR_VIETA": _s(getattr(doc, "delivery_place", "")),
            "PR_DATA": format_date_agnum(getattr(doc, "delivery_date", None)) or _agnum_empty_date(),
            "KIENO_TR": "0",
            "SUMISR": "N",
            "CHECKNR": _s(getattr(doc, "receipt_number", "")),
            "KSNR": _s(getattr(doc, "cash_register_number", "")),
            "CHECKD": format_date_agnum(getattr(doc, "receipt_date", None)) or _agnum_empty_date(),
            "ADDR1": _agnum_empty_varchar(),
            "ADDR2": _agnum_empty_varchar(),
            "DRBKOD": _s(getattr(doc, "employee_code", "")),
            "DRB": _s(getattr(doc, "employee_name", "")),
            "DRBKOD1": _agnum_empty_varchar(),
            "DRB1": _agnum_empty_varchar(),
            "AG_KOD": _agnum_empty_varchar(),
            "SANDORIS": _agnum_empty_varchar(),
            "PRISTSAL": _agnum_empty_varchar(),
            "TRANSPORTAS": _agnum_empty_varchar(),
            "SALISSIUNT": _s(getattr(doc, "seller_country_iso", "")).upper(),
            "FNUM1": "0",
            "FNUM2": "0",
            "FNUM3": "0",
            "SASK": sask_number,
            "SAVIK": "0",
            "SUMAK": "0",
            "M10": "Y",
            "POZYMIAI": _agnum_pozymiai_100(),
            "PVM_KOD": _s(getattr(doc, "pvm_kodas", "")),
            "SPEC_TAX": "N",
            "REF_DOK_DATA": _agnum_empty_date(),
            "REF_DOK_NR": _agnum_empty_varchar(),
            "SF_TIP": "SF",
            "POINTS_USED": "0",
            "POINTS_ADDED": "0",
            "DOK_USER": _s(getattr(doc, "db_user", "")) or "1",
            "DOK_USER0": _s(getattr(doc, "db_user_created", "")) or "1",
            "DOKMEMO": _s(getattr(doc, "comment", "")),
            "Count": str(len(rows)),
        }

        docs_data.append({"attrs": doc_attrs, "rows": rows})

    # XML building
    customers_el = ET.SubElement(agnum, "Customers", {
        "Count": str(len(customers_by_kod)),
    })
    for attrs in customers_by_kod.values():
        ET.SubElement(customers_el, "Item", attrs)

    ET.SubElement(agnum, "Departments", {
        "Count": "0",
    })

    goods_el = ET.SubElement(agnum, "Goods", {
        "Count": str(len(goods_by_kod)),
    })
    for attrs in goods_by_kod.values():
        ET.SubElement(goods_el, "Item", attrs)

    accounts_el = ET.SubElement(agnum, "Accounts", {
        "Count": "1",
    })
    ET.SubElement(accounts_el, "Item", account_attrs)

    docs_el = ET.SubElement(agnum, "Documents", {
        "Type": "4",
        "Count": str(len(docs_data)),
    })
    for d in docs_data:
        item_el = ET.SubElement(docs_el, "Item", d["attrs"])
        for r in d["rows"]:
            ET.SubElement(item_el, "Row", r)

    barcodes_el = ET.SubElement(agnum, "Barcodes", {
        "Count": str(len(barcodes_set)),
    })
    for (kod, bkod, kiekis) in barcodes_set:
        ET.SubElement(barcodes_el, "Item", {
            "KOD": kod,
            "BKOD": bkod,
            "KIEKIS": kiekis,
        })

    _indent(agnum)
    body = ET.tostring(agnum, encoding="utf-8", xml_declaration=False)
    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + body + b"\n"
    return expand_empty_tags(xml)