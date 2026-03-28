import logging
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import date

from django.utils.encoding import smart_str

from .formatters import format_date_agnum, expand_empty_tags, COUNTRY_NAME_LT
from ..models import CurrencyRate
from ..utils.extra_fields import get_extra_for_export


logger = logging.getLogger(__name__)


# =========================
# AGNUM-SPECIFIC FORMATTERS
# =========================

def _format_decimal_agnum(value, precision=2):
    """
    Форматирует число для AGNUM с запятой как десятичным разделителем.
    AGNUM требует запятую вместо точки: 12.50 -> 12,50
    """
    try:
        d = _safe_D(value)
        if precision > 0:
            quantizer = Decimal("0.1") ** precision
            d = d.quantize(quantizer, rounding=ROUND_HALF_UP)
        return str(d).replace(".", ",")
    except Exception:
        return "0"


def _format_quantity_agnum(value):
    """NUMERIC(14,4) - 4 знака после запятой."""
    return _format_decimal_agnum(value, precision=4)


def _format_price_agnum(value):
    """DOUBLE - 2 знака после запятой."""
    return _format_decimal_agnum(value, precision=2)


def _format_numeric_4_agnum(value):
    """NUMERIC(14,4) - 4 знака после запятой. Для PRKKN, PARKN, ORIGPARKN, NUOL, NUOL2."""
    return _format_decimal_agnum(value, precision=4)


def _format_vat_rate_agnum(value):
    """Ставка НДС - целое число: 21 (не 21.00)"""
    try:
        if value is None:
            return "0"
        v = _safe_D(value)
        return str(int(v))
    except Exception:
        return "0"


# =========================
# HELPERS
# =========================

def _safe_D(x):
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _s(v):
    return str(v).strip() if v is not None else ""


def _agnum_empty_varchar():
    return ""


def _agnum_empty_date():
    return "1900-01-01"


def _agnum_empty_bool():
    return "N"


def _agnum_pozymiai_100():
    return "0" * 100


def country_name_lt(iso2: str) -> str:
    code = (iso2 or "").strip().upper()
    if not code:
        return ""
    return COUNTRY_NAME_LT.get(code, "")


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
    obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date__lt=date_obj).order_by("-date").first()
    logger.info("[AGNUM:RATE] currency=%s date=%s -> prev=%s", currency_code, date_obj, (obj.rate if obj else None))
    return obj.rate if obj else None


def build_dok_nr(series: str, number: str) -> str:
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


def get_party_code(doc, *, role: str, id_field: str, vat_field: str, id_programoje_field: str) -> str:
    sid = _s(getattr(doc, id_field, None))
    if sid:
        return sid
    svat = _s(getattr(doc, vat_field, None))
    if svat:
        return svat
    sidp = _s(getattr(doc, id_programoje_field, None))
    if sidp:
        return sidp
    return ""


def normalize_preke_paslauga_tipas(value: object) -> str:
    """'1' (prekė/kodas) или '2' (paslauga)."""
    if value is None:
        return "1"
    s = str(value).strip().lower()
    if not s:
        return "1"
    try:
        n = int(float(s.replace(",", ".")))
        if n in (1, 3):
            return "1"
        elif n in (2, 4):
            return "2"
    except ValueError:
        pass
    if s in {"preke", "prekė", "prekes", "prekės", "kodas", "kodai"}:
        return "1"
    if s in {"paslauga", "paslaugos"}:
        return "2"
    return "1"


# =========================
# Per-company extra fields helper
# =========================

def _parse_cp_key(cp_key):
    if not cp_key:
        return ""

    cp = str(cp_key).strip()
    if cp.lower().startswith("id:"):
        return cp.split(":", 1)[1].strip()
    return cp


def _get_own_company_code_from_doc(doc, direction):
    """
    Определяет код своей фирмы из документа.

    - pirkimas -> своя фирма buyer
    - pardavimas -> своя фирма seller
    """
    if direction == "pirkimas":
        candidates = [
            getattr(doc, "buyer_id", ""),
            getattr(doc, "buyer_vat_code", ""),
            getattr(doc, "buyer_id_programoje", ""),
        ]
    else:
        candidates = [
            getattr(doc, "seller_id", ""),
            getattr(doc, "seller_vat_code", ""),
            getattr(doc, "seller_id_programoje", ""),
        ]

    for value in candidates:
        code = _s(value)
        if code:
            return code
    return ""


def _get_user_defaults_for_doc(user, doc, own_company_code=None, direction="pirkimas"):
    """
    Получить AGNUM extra fields для конкретного документа.

    Приоритет:
    1. Профиль конкретной фирмы по own_company_code
    2. Профиль фирмы, определённой из документа
    3. Глобальный профиль (__all__)
    4. Пустой dict
    """
    requested_code = _parse_cp_key(own_company_code)
    doc_company_code = _get_own_company_code_from_doc(doc, direction)

    extra = {}
    resolved_by = ""

    if user and requested_code:
        extra = get_extra_for_export(user, "agnum", requested_code)
        if extra:
            resolved_by = requested_code

    if user and not extra and doc_company_code and doc_company_code != requested_code:
        extra = get_extra_for_export(user, "agnum", doc_company_code)
        if extra:
            resolved_by = doc_company_code

    if user and not extra:
        extra = get_extra_for_export(user, "agnum", None)
        if extra:
            resolved_by = "__all__/legacy"

    if direction == "pirkimas":
        defaults = {
            "sandelis": _s(extra.get("pirkimas_sandelis") or ""),
            "grupe": _s(extra.get("pirkimas_grupe") or ""),
            "objektas": _s(extra.get("pirkimas_objektas") or ""),
        }
    else:
        defaults = {
            "sandelis": _s(extra.get("pardavimas_sandelis") or ""),
            "grupe": _s(extra.get("pardavimas_grupe") or ""),
            "objektas": _s(extra.get("pardavimas_objektas") or ""),
        }

    logger.info(
        "[AGNUM:EXTRA] doc=%s direction=%s own_company_code=%r requested_code=%r doc_company_code=%r resolved_by=%r defaults=%s",
        getattr(doc, "pk", None),
        direction,
        own_company_code,
        requested_code,
        doc_company_code,
        resolved_by,
        defaults,
    )

    return defaults


# =========================
# Документная скидка: пропорциональное распределение на строки
# (аналогично Rivile ERP - пересчитываем цены и PVM,
#  нативные поля скидок AGNUM NUOLPROC/NUOL/NUOL1/NUOL2 остаются нулевыми)
# =========================

def _compute_discount_factor(doc):
    """
    factor = 1 - (invoice_discount_wo_vat / base_total_before_discount)
    Если скидки нет -> (None, D("0"))
    """
    disc = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
    if disc <= 0:
        return None, Decimal("0")

    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        base_total = Decimal("0")
        for it in line_items.all():
            qty = _safe_D(getattr(it, "quantity", 1) or 1)
            price = _safe_D(getattr(it, "price", 0) or 0)
            base_total += (price * qty)
    else:
        base_total = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0) + disc

    if base_total <= 0:
        return None, Decimal("0")

    factor = Decimal("1") - disc / base_total
    if factor < Decimal("0"):
        factor = Decimal("0")
    if factor > Decimal("1"):
        factor = Decimal("1")

    logger.info(
        "[AGNUM:DISCOUNT] doc=%s discount=%.2f base_total=%.2f factor=%.6f",
        getattr(doc, "pk", None), disc, base_total, factor,
    )
    return factor, disc


def _apply_line_discount(price, qty, vat, vat_pct, factor):
    """
    Пересчитывает цену и PVM строки с учётом документной скидки.
    Returns: (adj_price, adj_vat)
    """
    p = _safe_D(price)
    v = _safe_D(vat)

    if factor is None:
        return p, v

    adj_price = (p * factor).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    if vat_pct is not None:
        vat_rate = _safe_D(vat_pct)
        q = _safe_D(qty)
        adj_vat = (adj_price * q * vat_rate / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    else:
        adj_vat = (v * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return adj_price, adj_vat


# =========================
# EU / I.SAF
# =========================

EU_ISO2 = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
}


def _is_eu_country(iso: object) -> bool:
    if not iso:
        return False
    return str(iso).strip().upper() in EU_ISO2


def _is_zero(v) -> bool:
    try:
        return Decimal(str(v)) == 0
    except Exception:
        return True


def _pick_isaf_for_purchase(doc):
    country = getattr(doc, "seller_country_iso", "") or ""
    non_eu_or_empty = not _is_eu_country(country)
    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        vat_zero_all = all(_is_zero(getattr(it, "vat_percent", None)) for it in line_items.all())
    else:
        vat_zero_all = _is_zero(getattr(doc, "vat_percent", None))
    if non_eu_or_empty and vat_zero_all:
        return "12"
    return None


# =========================
# PVM Kodas helpers
# =========================

def _get_pvm_kodas_for_item(doc, item, line_map=None, default="PVM1") -> str:
    item_id = getattr(item, "id", None)
    if line_map is not None and item_id is not None and item_id in line_map:
        pvm = _s(line_map.get(item_id, ""))
        if pvm and pvm != "Keli skirtingi PVM":
            return pvm
    pvm = _s(getattr(item, "pvm_kodas", ""))
    if pvm and pvm != "Keli skirtingi PVM":
        return pvm
    return default


def _get_pvm_kodas_for_doc(doc, default="") -> str:
    separate_vat = bool(getattr(doc, "separate_vat", False))
    scan_type = _s(getattr(doc, "scan_type", "")).lower()
    if separate_vat and scan_type in ("sumiskai", "summary", "suminis"):
        return default
    pvm = _s(getattr(doc, "pvm_kodas", ""))
    if pvm == "Keli skirtingi PVM":
        return default
    return pvm or default


# =========================
# Customers builders
# =========================

def _build_agnum_customer_from_doc(doc) -> tuple[str, dict]:
    """Customers/Item из seller_* полей (для pirkimai)."""
    kod = get_party_code(
        doc,
        role="seller",
        id_field="seller_id",
        vat_field="seller_vat_code",
        id_programoje_field="seller_id_programoje",
    )
    if not kod:
        kod = (
            _s(getattr(doc, "seller_vat_code", "")) or
            _s(getattr(doc, "seller_id", "")) or
            "UNKNOWN_SELLER"
        )

    name = _s(getattr(doc, "seller_name", "")) or kod
    adr = _s(getattr(doc, "seller_address", ""))
    email = _s(getattr(doc, "seller_email", ""))
    country = _s(getattr(doc, "seller_country_iso", "")).upper()
    country_name = country_name_lt(country)
    seller_iban = _s(getattr(doc, "seller_iban", ""))
    rkod = _s(getattr(doc, "seller_id", "")) or _s(getattr(doc, "seller_vat_code", ""))
    pvmkod = _s(getattr(doc, "seller_vat_code", ""))
    currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"

    attrs = {
        "KOD": kod, "PAVAD": name, "CONTACT": "", "ADR": adr,
        "TLF": "", "FAX": "",
        "RKOD": rkod or "", "PVMKOD": pvmkod,
        "BKOD": "", "BPAVAD": "", "BSASK": seller_iban or "",
        "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
        "INFO": "",
        "ACC1": "", "ACC2": "", "ACC3": "", "ACC4": "", "ACC5": "",
        "ACC6": "", "ACC7": "", "ACC8": "", "ACC9": "", "ACC10": "",
        "ACC11": "", "ACC12": "",
        "SALIS_KOD": country or "", "SALIS": country_name or "",
        "MIESTAS": "", "GATVE": "", "EMAIL": email,
        "PINDEX": "", "SAVIVKOD": "", "APSKR": "",
        "KRD": "Y", "DEB": "N", "AKTYVUS": "Y",
        "POZYMIAI": _agnum_pozymiai_100(),
        "KOD_IS": "", "DEFAULT_CURR": currency or "EUR",
        "FIZ_ASM": "N", "VEZEJAS": "N", "KNGR": "4",
    }
    return kod, attrs


def _build_agnum_customer_from_buyer(doc) -> tuple[str, dict]:
    """Customers/Item из buyer_* полей (для pardavimai)."""
    kod = get_party_code(
        doc,
        role="buyer",
        id_field="buyer_id",
        vat_field="buyer_vat_code",
        id_programoje_field="buyer_id_programoje",
    )
    if not kod:
        kod = (
            _s(getattr(doc, "buyer_vat_code", "")) or
            _s(getattr(doc, "buyer_id", "")) or
            "UNKNOWN_BUYER"
        )

    name = _s(getattr(doc, "buyer_name", "")) or kod
    adr = _s(getattr(doc, "buyer_address", ""))
    email = _s(getattr(doc, "buyer_email", ""))
    country = _s(getattr(doc, "buyer_country_iso", "")).upper()
    country_name = country_name_lt(country)
    buyer_iban = _s(getattr(doc, "buyer_iban", ""))
    rkod = _s(getattr(doc, "buyer_id", "")) or _s(getattr(doc, "buyer_vat_code", ""))
    pvmkod = _s(getattr(doc, "buyer_vat_code", ""))
    currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"

    attrs = {
        "KOD": kod, "PAVAD": name, "CONTACT": "", "ADR": adr,
        "TLF": "", "FAX": "",
        "RKOD": rkod or "", "PVMKOD": pvmkod,
        "BKOD": "", "BPAVAD": "", "BSASK": buyer_iban or "",
        "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
        "INFO": "",
        "ACC1": "", "ACC2": "", "ACC3": "", "ACC4": "", "ACC5": "",
        "ACC6": "", "ACC7": "", "ACC8": "", "ACC9": "", "ACC10": "",
        "ACC11": "", "ACC12": "",
        "SALIS_KOD": country or "", "SALIS": country_name or "",
        "MIESTAS": "", "GATVE": "", "EMAIL": email,
        "PINDEX": "", "SAVIVKOD": "", "APSKR": "",
        "KRD": "N", "DEB": "Y", "AKTYVUS": "Y",
        "POZYMIAI": _agnum_pozymiai_100(),
        "KOD_IS": "", "DEFAULT_CURR": currency or "EUR",
        "FIZ_ASM": "N", "VEZEJAS": "N", "KNGR": "4",
    }
    return kod, attrs


# =========================
# Goods builder
# =========================

def _build_agnum_good_from_item(doc, item, user_defaults=None, line_map=None, discount_factor=None):
    """
    Goods/Item по строке.
    KN0 (DOUBLE, 2 зн.) = пересчитанная цена с учётом документной скидки.
    """
    user_defaults = user_defaults or {}

    kod = (
        _s(getattr(item, "prekes_kodas", "")) or
        _s(getattr(item, "prekes_barkodas", "")) or
        "PREKE001"
    )

    doc_snd = _s(getattr(doc, "agnum_snd_kod", ""))
    snd_kod = user_defaults.get("sandelis") or doc_snd or "S1"

    item_grupe = _s(getattr(item, "grupe", "") or getattr(item, "preke_grupe", ""))
    doc_grupe = _s(getattr(doc, "grupe", ""))
    grupe = user_defaults.get("grupe") or item_grupe or doc_grupe or ""

    item_okod = _s(getattr(item, "okod", "") or getattr(item, "objekto_kodas", ""))
    doc_okod = _s(getattr(doc, "okod", ""))
    okod = user_defaults.get("objektas") or item_okod or doc_okod or ""

    name = _s(getattr(item, "prekes_pavadinimas", "")) or "Prekė"
    tipas_str = normalize_preke_paslauga_tipas(
        getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
    )
    cls = "1" if tipas_str == "2" else "0"

    unit = _s(getattr(item, "unit", "")) or "vnt."
    curr = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
    vat_pct = getattr(item, "vat_percent", None)
    pvm_kod = _get_pvm_kodas_for_item(doc, item, line_map, default="PVM1")

    raw_price = _safe_D(getattr(item, "price", None) or 0)
    if discount_factor is not None:
        kn0 = (raw_price * discount_factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        kn0 = raw_price

    attrs = {
        "KOD": kod, "SND_KOD": snd_kod, "PAVAD": name,
        "CLASS": cls, "GRUPE": grupe, "POGRUPIS": "", "KATEG": "",
        "PAVAD1": "", "PAVAD2": "", "PAVAD3": "", "PAVAD4": "",
        "PAVAD5": "", "PAVAD6": "", "PAVAD7": "", "PAVAD8": "",
        "VNT": unit, "VNT2": "",
        "SVORIS": "0", "SVORIS1": "0", "TURIS": "0",
        "VIETA": "", "METOD": "0", "IPAK": "0",
        "KN0": _format_price_agnum(kn0),
        "KN1": "0", "KN2": "0", "KN3": "0", "KN4": "0", "KN5": "0",
        "KNB": "0", "KNBVAL": curr,
        "REZ": "0", "UZS": "0", "APMOKPVM": "Y",
        "PVM0": _format_vat_rate_agnum(vat_pct),
        "PVM": _format_vat_rate_agnum(vat_pct),
        "PVM2": _format_vat_rate_agnum(vat_pct),
        "PVM3": _format_vat_rate_agnum(vat_pct),
        "PVM4": _format_vat_rate_agnum(vat_pct),
        "PVM5": _format_vat_rate_agnum(vat_pct),
        "MOK0": "0", "MEMO": "",
        "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
        "F6": "0", "F7": "0", "F8": "0",
        "ACC1": "", "ACC2": "", "ACC3": "", "ACC4": "", "ACC5": "",
        "PVM_KOD": pvm_kod,
        "POZYMIAI": _agnum_pozymiai_100(),
    }
    return kod, attrs, okod


# =========================
# AGNUM: PIRKIMAI (Documents Type="2")
# =========================

def _build_agnum_rows_for_pirkimas(doc, line_items, user_defaults=None, line_map=None, discount_factor=None):
    """
    Row для pirkimai.
    PRKKN = пересчитанная цена (price × factor), NUMERIC(14,4).
    PVM = пересчитанный, DOUBLE.
    """
    user_defaults = user_defaults or {}
    rows = []

    for item in line_items:
        qty = getattr(item, "quantity", None) or 1
        price = getattr(item, "price", None) or 0
        vat = getattr(item, "vat", None) or 0
        vat_pct = getattr(item, "vat_percent", None)

        adj_price, adj_vat = _apply_line_discount(price, qty, vat, vat_pct, discount_factor)

        item_okod = _s(getattr(item, "okod", "") or getattr(item, "objekto_kodas", ""))
        doc_okod = _s(getattr(doc, "okod", ""))
        obj_kod = user_defaults.get("objektas") or item_okod or doc_okod or ""

        pvm_kod = _get_pvm_kodas_for_item(doc, item, line_map, default="PVM1")

        row = {
            "KOD": (
                _s(getattr(item, "prekes_kodas", "")) or
                _s(getattr(item, "prekes_barkodas", "")) or
                "PREKE001"
            ),
            "KIEKIS": _format_quantity_agnum(qty),
            "PRKKN": _format_numeric_4_agnum(adj_price),
            "MT": "0",
            "AKC": "0",
            "PVM": _format_price_agnum(adj_vat),
            "PVM_PROC": _format_vat_rate_agnum(vat_pct),
            "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
            "D1": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "D2": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "D3": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "KILMESSALIS": _s(getattr(doc, "seller_country_iso", "")).upper(),
            "APSKRITIS": "",
            "PART_PARKN": "0",
            "OBJ_KOD": obj_kod,
            "PVM_KOD": pvm_kod,
        }
        rows.append(row)
    return rows


def export_pirkimai_group_to_agnum(documents, user, own_company_code=None):
    """
    Экспорт pirkimai -> AGNUM XML (Documents Type="2").

    Args:
        documents: список документов
        user: объект пользователя
        own_company_code: код своей фирмы для поиска профиля extra_fields
    """
    logger.info(
        "[AGNUM:PIRKIMAI] start, docs=%d, own_company_code=%s",
        len(documents) if documents else 0,
        own_company_code,
    )

    agnum = ET.Element("AgnumData", {
        "Version": "25",
        "CreatedByApp": "DokSkenas",
        "CreatedByLogin": str(getattr(user, "id", "1")),
        "CreatedOn": format_date_agnum(getattr(user, "agnum_created_on", None)) or format_date_agnum(date.today()),
    })

    customers_by_kod = {}
    goods_by_kod = {}
    barcodes_qty = {}
    docs_data = []

    for doc in (documents or []):
        logger.info("[AGNUM:PIRKIMAI] doc=%s", getattr(doc, "pk", None))

        user_defaults = _get_user_defaults_for_doc(
            user=user,
            doc=doc,
            own_company_code=own_company_code,
            direction="pirkimas",
        )

        line_map = getattr(doc, "_pvm_line_map", None)

        cust_kod, cust_attrs = _build_agnum_customer_from_doc(doc)
        if cust_kod not in customers_by_kod:
            customers_by_kod[cust_kod] = cust_attrs

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            items = list(line_items.all())
        else:
            items = []

        if not items:
            fake_item = type("FakeItem", (), {})()
            setattr(fake_item, "id", None)
            setattr(fake_item, "prekes_kodas", _s(getattr(doc, "prekes_kodas", "")) or "PREKE001")
            setattr(fake_item, "prekes_barkodas", _s(getattr(doc, "prekes_barkodas", "")))
            setattr(fake_item, "prekes_pavadinimas", _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė")
            setattr(fake_item, "preke_paslauga", getattr(doc, "preke_paslauga", None))
            setattr(fake_item, "unit", "vnt.")
            setattr(fake_item, "quantity", 1)
            setattr(fake_item, "price", getattr(doc, "amount_wo_vat", None) or 0)
            setattr(fake_item, "vat", getattr(doc, "vat_amount", None) or 0)
            setattr(fake_item, "vat_percent", getattr(doc, "vat_percent", None))
            setattr(fake_item, "pvm_kodas", _get_pvm_kodas_for_doc(doc, default="PVM1"))
            items = [fake_item]

        discount_factor, _ = _compute_discount_factor(doc)

        rows = _build_agnum_rows_for_pirkimas(doc, items, user_defaults, line_map, discount_factor)

        for item in items:
            g_kod, g_attrs, okod = _build_agnum_good_from_item(doc, item, user_defaults, line_map, discount_factor)
            if g_kod not in goods_by_kod:
                goods_by_kod[g_kod] = g_attrs

            barkodas = _s(getattr(item, "prekes_barkodas", "")) or _s(getattr(doc, "prekes_barkodas", ""))
            if barkodas:
                qty = getattr(item, "quantity", None)
                qtyD = _safe_D(qty if qty is not None else 1)
                if qtyD <= 0:
                    qtyD = Decimal("1")
                barcodes_qty[(g_kod, barkodas)] = barcodes_qty.get((g_kod, barkodas), Decimal("0")) + qtyD

        currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
        op_date = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None) or date.today()
        rate = get_currency_rate(currency, op_date) if currency != "EUR" else 1

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        doknr = build_dok_nr(series, number)

        amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
        vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
        skola = amount_wo + vat_amount

        _isaf = getattr(doc, "report_to_isaf", None)
        if _isaf is False:
            ch1_value = "N"
        else:
            code_isaf = _pick_isaf_for_purchase(doc)
            ch1_value = "N" if code_isaf == "12" else "Y"

        doc_snd = _s(getattr(doc, "agnum_snd_kod", ""))
        snd_kod = user_defaults["sandelis"] or doc_snd or "S1"

        doc_pvm_kod = _get_pvm_kodas_for_doc(doc, default="")

        doc_attrs = {
            "DATA": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "DATA_G": format_date_agnum(op_date) or _agnum_empty_date(),
            "DOKNR": doknr,
            "DOKNR2": "",
            "KL_KOD": cust_kod,
            "KL_RKOD": cust_attrs.get("RKOD", ""),
            "SND_KOD": snd_kod,
            "VAL": currency,
            "KURS": _format_decimal_agnum(rate if rate else 1, precision=6),
            "TR_TIP": "0",
            "NUOL1": "0",
            "NUOL2": "0",
            "SUMA": _format_price_agnum(amount_wo),
            "MT": "0", "AKC": "0",
            "PVM": _format_price_agnum(vat_amount),
            "PVM_KL": "0", "KT": "0", "PR": "0",
            "SUMAP": "0", "TRANSP": "0",
            "SUMVISO": _format_price_agnum(amount_wo),
            "DRB": "",
            "SKOLA": _format_price_agnum(skola),
            "TERM": "0", "APMSUM": "0",
            "SANDORIS": "", "PRISTSAL": "", "TRANSPORTAS": "",
            "SALISSIUNT": _s(getattr(doc, "seller_country_iso", "")).upper(),
            "TR_VVAL": "Y",
            "POZYMIAI": _agnum_pozymiai_100(),
            "CH1": ch1_value,
            "M0": "Y", "M1": "Y", "M2": "Y", "M3": "Y", "M4": "Y",
            "M5": "Y", "M6": "Y", "M7": "Y", "M8": "Y",
            "PVM_KOD": doc_pvm_kod,
            "SPEC_TAX": "N",
            "REF_DOK_DATA": _agnum_empty_date(),
            "REF_DOK_NR": "",
            "SF_TIP": "SF",
            "MEMO": _s(getattr(doc, "comment", "")),
            "NUM1": "0", "NUM2": "0", "NUM3": "0", "NUM4": "0", "NUM5": "0",
            "TXT1": "", "TXT2": "", "TXT3": "", "TXT4": "", "TXT5": "",
            "PR_VIETA": "",
            "Count": str(len(rows)),
        }

        docs_data.append({"attrs": doc_attrs, "rows": rows})

    cust_el = ET.SubElement(agnum, "Customers", {"Count": str(len(customers_by_kod))})
    for attrs in customers_by_kod.values():
        ET.SubElement(cust_el, "Item", attrs)

    goods_el = ET.SubElement(agnum, "Goods", {"Count": str(len(goods_by_kod))})
    for attrs in goods_by_kod.values():
        ET.SubElement(goods_el, "Item", attrs)

    ET.SubElement(agnum, "Objects", {"Count": "0"})

    docs_el = ET.SubElement(agnum, "Documents", {"Type": "2", "Count": str(len(docs_data))})
    for d in docs_data:
        item_el = ET.SubElement(docs_el, "Item", d["attrs"])
        for r in d["rows"]:
            ET.SubElement(item_el, "Row", r)

    bc_el = ET.SubElement(agnum, "Barcodes", {"Count": str(len(barcodes_qty))})
    for (kod, bkod), kiekis in barcodes_qty.items():
        ET.SubElement(bc_el, "Item", {
            "KOD": kod,
            "BKOD": bkod,
            "KIEKIS": _format_decimal_agnum(kiekis, precision=2),
        })

    _indent(agnum)
    body = ET.tostring(agnum, encoding="utf-8", xml_declaration=False)
    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + body + b"\n"
    return expand_empty_tags(xml)


# =========================
# AGNUM: PARDAVIMAI (Documents Type="4")
# =========================

def _build_agnum_rows_for_pardavimas(doc, line_items, user_defaults=None, line_map=None, discount_factor=None):
    """
    Row для pardavimai.
    PARKN = пересчитанная цена (price × factor), NUMERIC(14,4).
    ORIGPARKN = PARKN (тоже пересчитанная).
    NUOL = 0, NUOL2 = 0. Скидка тихо в ценах.
    """
    user_defaults = user_defaults or {}
    rows = []

    for item in line_items:
        qty = getattr(item, "quantity", None) or 1
        price = getattr(item, "price", None) or 0
        vat = getattr(item, "vat", None) or 0
        vat_pct = getattr(item, "vat_percent", None)

        adj_price, adj_vat = _apply_line_discount(price, qty, vat, vat_pct, discount_factor)

        item_okod = _s(getattr(item, "okod", "") or getattr(item, "objekto_kodas", ""))
        doc_okod = _s(getattr(doc, "okod", ""))
        okod = user_defaults.get("objektas") or item_okod or doc_okod or ""

        pvm_kod = _get_pvm_kodas_for_item(doc, item, line_map, default="PVM1")

        row = {
            "KOD": (
                _s(getattr(item, "prekes_kodas", "")) or
                _s(getattr(item, "prekes_barkodas", "")) or
                "PREKE002"
            ),
            "BKOD": _s(getattr(item, "prekes_barkodas", "")),
            "KIEKIS": _format_quantity_agnum(qty),
            "PVM": _format_price_agnum(adj_vat),
            "PVM_PROC": _format_vat_rate_agnum(vat_pct),
            "MOK0_PROC": "0", "MOK0_LT": "0",
            "VNT": _s(getattr(item, "unit", "")) or "vnt",
            "PARKN": _format_numeric_4_agnum(adj_price),
            "ORIGPARKN": _format_numeric_4_agnum(adj_price),
            "NUOL": _format_numeric_4_agnum(0),
            "NUOL2": "0",
            "UZS_SHOPNR": "", "UZS_UZSNR": "",
            "UZS_PRKKOD": _s(getattr(item, "uzsakovo_preke_kodas", "")),
            "ZYME": "",
            "UZS_PRDATA": format_date_agnum(getattr(doc, "delivery_date", None)) or _agnum_empty_date(),
            "COMMENT": _s(getattr(item, "comment", "")),
            "VSK_F1": "", "VSK_F2": "", "VSK_F3": "", "VSK_F4": "", "VSK_F5": "",
            "ID_PRK1": "0",
            "PVM_KOD": pvm_kod,
            "OKOD": okod,
        }
        rows.append(row)
    return rows


def _get_agnum_default_account(user):
    es = getattr(user, "extra_settings", {}) or {}
    seller_iban = _s(es.get("seller_iban", ""))
    if seller_iban:
        return {"SASK": seller_iban, "KOD": "", "PAVAD": "", "ADR": "", "TLF": "", "SWIFT": ""}
    return {"SASK": "LT000000000000000000", "KOD": "00000", "PAVAD": "BANKAS", "ADR": "", "TLF": "", "SWIFT": ""}


def export_pardavimai_group_to_agnum(documents, user, own_company_code=None):
    """
    Экспорт pardavimai -> AGNUM XML (Documents Type="4").

    Args:
        documents: список документов
        user: объект пользователя
        own_company_code: код своей фирмы для поиска профиля extra_fields
    """
    logger.info(
        "[AGNUM:PARDAVIMAI] start, docs=%d, own_company_code=%s",
        len(documents) if documents else 0,
        own_company_code,
    )

    agnum = ET.Element("AgnumData", {
        "Version": "25",
        "CreatedByApp": "DokSkenas",
        "CreatedByLogin": str(getattr(user, "id", "1")),
        "CreatedOn": format_date_agnum(getattr(user, "agnum_created_on", None)) or format_date_agnum(date.today()),
    })

    customers_by_kod = {}
    goods_by_kod = {}
    barcodes_qty = {}
    docs_data = []

    account_attrs = _get_agnum_default_account(user)
    sask_number = account_attrs["SASK"]

    for doc in (documents or []):
        logger.info("[AGNUM:PARDAVIMAI] doc=%s", getattr(doc, "pk", None))

        user_defaults = _get_user_defaults_for_doc(
            user=user,
            doc=doc,
            own_company_code=own_company_code,
            direction="pardavimas",
        )

        line_map = getattr(doc, "_pvm_line_map", None)

        cust_kod, cust_attrs = _build_agnum_customer_from_buyer(doc)
        if cust_kod not in customers_by_kod:
            customers_by_kod[cust_kod] = cust_attrs

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            items = list(line_items.all())
        else:
            items = []

        is_sumisr = len(items) == 0
        scan_type = getattr(doc, "scan_type", None)
        if scan_type and str(scan_type).lower() in ["summary", "suminis", "суммарный"]:
            is_sumisr = True

        if not items:
            fake_item = type("FakeItem", (), {})()
            setattr(fake_item, "id", None)
            setattr(fake_item, "prekes_kodas", _s(getattr(doc, "prekes_kodas", "")) or "PREKE002")
            setattr(fake_item, "prekes_barkodas", _s(getattr(doc, "prekes_barkodas", "")))
            setattr(fake_item, "prekes_pavadinimas", _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė")
            setattr(fake_item, "preke_paslauga", getattr(doc, "preke_paslauga", None))
            setattr(fake_item, "unit", "vnt.")
            setattr(fake_item, "quantity", 1)
            setattr(fake_item, "price", getattr(doc, "amount_wo_vat", None) or 0)
            setattr(fake_item, "vat", getattr(doc, "vat_amount", None) or 0)
            setattr(fake_item, "vat_percent", getattr(doc, "vat_percent", None))
            setattr(fake_item, "pvm_kodas", _get_pvm_kodas_for_doc(doc, default="PVM1"))
            setattr(fake_item, "original_price", getattr(doc, "amount_wo_vat", None) or 0)
            items = [fake_item]

        discount_factor, _ = _compute_discount_factor(doc)

        rows = _build_agnum_rows_for_pardavimas(doc, items, user_defaults, line_map, discount_factor)

        for item in items:
            g_kod, g_attrs, okod = _build_agnum_good_from_item(doc, item, user_defaults, line_map, discount_factor)
            if g_kod not in goods_by_kod:
                goods_by_kod[g_kod] = g_attrs

            barkodas = _s(getattr(item, "prekes_barkodas", "")) or _s(getattr(doc, "prekes_barkodas", ""))
            if barkodas:
                qty = getattr(item, "quantity", None)
                qtyD = _safe_D(qty if qty is not None else 1)
                if qtyD <= 0:
                    qtyD = Decimal("1")
                barcodes_qty[(g_kod, barkodas)] = barcodes_qty.get((g_kod, barkodas), Decimal("0")) + qtyD

        currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
        op_date = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None) or date.today()
        rate = get_currency_rate(currency, op_date) if currency != "EUR" else 1

        series = smart_str(getattr(doc, "document_series", "") or "")
        number = smart_str(getattr(doc, "document_number", "") or "")
        doknr = build_dok_nr(series, number)

        amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
        vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
        skola = amount_wo + vat_amount

        apm_sal = _s(getattr(doc, "payment_type_code", "")) or "1"
        term = _s(getattr(doc, "payment_term_days", "")) or "0"

        doc_snd = _s(getattr(doc, "agnum_snd_kod", ""))
        snd_kod = user_defaults["sandelis"] or doc_snd or "S1"

        doc_pvm_kod = _get_pvm_kodas_for_doc(doc, default="")

        doc_attrs = {
            "DATA": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
            "DOKNR": doknr,
            "DOKNR2": "",
            "GVNR": _s(getattr(doc, "transport_document_number", "")),
            "KL_KOD": cust_kod,
            "KL_RKOD": cust_attrs.get("RKOD", ""),
            "PAD_KOD": "",
            "SND_KOD": snd_kod,
            "VAL": currency,
            "KURS": _format_decimal_agnum(rate if rate else 1, precision=6),
            "NUOLPROC": "0",
            "NUOL": "0",
            "SUMA": _format_price_agnum(amount_wo),
            "SUMAP": "0",
            "PVMPROC": "0",
            "PVM": _format_price_agnum(vat_amount),
            "MOK0": "0",
            "SUMVISO": _format_price_agnum(amount_wo),
            "SKOLA": _format_price_agnum(skola),
            "APMSUM": "0",
            "APM_SAL": apm_sal,
            "TERM": term,
            "KNTIP": "4",
            "PR_VIETA": _s(getattr(doc, "delivery_place", "")),
            "PR_DATA": format_date_agnum(getattr(doc, "delivery_date", None)) or _agnum_empty_date(),
            "KIENO_TR": "0",
            "SUMISR": "Y" if is_sumisr else "N",
            "CHECKNR": _s(getattr(doc, "receipt_number", "")),
            "KSNR": _s(getattr(doc, "cash_register_number", "")),
            "CHECKD": format_date_agnum(getattr(doc, "receipt_date", None)) or _agnum_empty_date(),
            "ADDR1": "", "ADDR2": "",
            "DRBKOD": _s(getattr(doc, "employee_code", "")),
            "DRB": _s(getattr(doc, "employee_name", "")),
            "DRBKOD1": "", "DRB1": "",
            "AG_KOD": "",
            "SANDORIS": "", "PRISTSAL": "", "TRANSPORTAS": "",
            "SALISSIUNT": _s(getattr(doc, "seller_country_iso", "")).upper(),
            "FNUM1": "0", "FNUM2": "0", "FNUM3": "0",
            "SASK": sask_number,
            "SAVIK": "0", "SUMAK": "0",
            "M10": "N" if getattr(doc, "report_to_isaf", None) is False else "Y",
            "POZYMIAI": _agnum_pozymiai_100(),
            "PVM_KOD": doc_pvm_kod,
            "SPEC_TAX": "N",
            "REF_DOK_DATA": _agnum_empty_date(),
            "REF_DOK_NR": "",
            "SF_TIP": "SF",
            "POINTS_USED": "0", "POINTS_ADDED": "0",
            "DOK_USER": _s(getattr(doc, "db_user", "")) or "1",
            "DOK_USER0": _s(getattr(doc, "db_user_created", "")) or "1",
            "DOKMEMO": _s(getattr(doc, "comment", "")),
            "Count": str(len(rows)),
        }

        docs_data.append({"attrs": doc_attrs, "rows": rows})

    cust_el = ET.SubElement(agnum, "Customers", {"Count": str(len(customers_by_kod))})
    for attrs in customers_by_kod.values():
        ET.SubElement(cust_el, "Item", attrs)

    ET.SubElement(agnum, "Departments", {"Count": "0"})

    goods_el = ET.SubElement(agnum, "Goods", {"Count": str(len(goods_by_kod))})
    for attrs in goods_by_kod.values():
        ET.SubElement(goods_el, "Item", attrs)

    accounts_el = ET.SubElement(agnum, "Accounts", {"Count": "1"})
    ET.SubElement(accounts_el, "Item", account_attrs)

    docs_el = ET.SubElement(agnum, "Documents", {"Type": "4", "Count": str(len(docs_data))})
    for d in docs_data:
        item_el = ET.SubElement(docs_el, "Item", d["attrs"])
        for r in d["rows"]:
            ET.SubElement(item_el, "Row", r)

    bc_el = ET.SubElement(agnum, "Barcodes", {"Count": str(len(barcodes_qty))})
    for (kod, bkod), kiekis in barcodes_qty.items():
        ET.SubElement(bc_el, "Item", {
            "KOD": kod,
            "BKOD": bkod,
            "KIEKIS": _format_decimal_agnum(kiekis, precision=2),
        })

    _indent(agnum)
    body = ET.tostring(agnum, encoding="utf-8", xml_declaration=False)
    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + body + b"\n"
    return expand_empty_tags(xml)






# import logging
# import xml.etree.ElementTree as ET
# from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
# from datetime import date

# from django.utils.encoding import smart_str
# from .formatters import format_date_agnum, expand_empty_tags, COUNTRY_NAME_LT
# from ..models import CurrencyRate


# logger = logging.getLogger(__name__)


# # =========================
# # AGNUM-SPECIFIC FORMATTERS
# # =========================

# def _format_decimal_agnum(value, precision=2):
#     """
#     Форматирует число для AGNUM с запятой как десятичным разделителем.
#     AGNUM требует запятую вместо точки: 12.50 -> 12,50
#     """
#     try:
#         d = _safe_D(value)
#         if precision > 0:
#             quantizer = Decimal('0.1') ** precision
#             d = d.quantize(quantizer, rounding=ROUND_HALF_UP)
#         return str(d).replace('.', ',')
#     except Exception:
#         return "0"


# def _format_quantity_agnum(value):
#     """NUMERIC(14,4) — 4 знака после запятой."""
#     return _format_decimal_agnum(value, precision=4)


# def _format_price_agnum(value):
#     """DOUBLE — 2 знака после запятой."""
#     return _format_decimal_agnum(value, precision=2)


# def _format_numeric_4_agnum(value):
#     """NUMERIC(14,4) — 4 знака после запятой. Для PRKKN, PARKN, ORIGPARKN, NUOL, NUOL2."""
#     return _format_decimal_agnum(value, precision=4)


# def _format_vat_rate_agnum(value):
#     """Ставка НДС — целое число: 21 (не 21.00)"""
#     try:
#         if value is None:
#             return "0"
#         v = _safe_D(value)
#         return str(int(v))
#     except Exception:
#         return "0"


# # =========================
# # HELPERS
# # =========================

# def _safe_D(x):
#     try:
#         return Decimal(str(x))
#     except Exception:
#         return Decimal("0")


# def _s(v):
#     return str(v).strip() if v is not None else ""


# def _agnum_empty_varchar():
#     return ""


# def _agnum_empty_date():
#     return "1900-01-01"


# def _agnum_empty_bool():
#     return "N"


# def _agnum_pozymiai_100():
#     return "0" * 100


# def country_name_lt(iso2: str) -> str:
#     code = (iso2 or "").strip().upper()
#     if not code:
#         return ""
#     return COUNTRY_NAME_LT.get(code, "")


# def _indent(elem, level=0):
#     i = "\n" + "  " * level
#     if len(elem):
#         if not (elem.text and elem.text.strip()):
#             elem.text = i + "  "
#         for ch in elem:
#             _indent(ch, level + 1)
#         if not (elem.tail and elem.tail.strip()):
#             elem.tail = i
#     else:
#         if not (elem.tail and elem.tail.strip()):
#             elem.tail = i


# def get_currency_rate(currency_code, date_obj):
#     """Получить курс для валюты на заданную дату (к EUR)."""
#     if not currency_code or currency_code.upper() == "EUR":
#         logger.info("[AGNUM:RATE] currency=%r -> 1.0", currency_code)
#         return 1.0
#     obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date=date_obj).first()
#     if obj:
#         logger.info("[AGNUM:RATE] currency=%s date=%s -> exact=%s", currency_code, date_obj, obj.rate)
#         return obj.rate
#     obj = CurrencyRate.objects.filter(currency=currency_code.upper(), date__lt=date_obj).order_by('-date').first()
#     logger.info("[AGNUM:RATE] currency=%s date=%s -> prev=%s", currency_code, date_obj, (obj.rate if obj else None))
#     return obj.rate if obj else None


# def build_dok_nr(series: str, number: str) -> str:
#     s = (series or "").strip()
#     n = (number or "").strip()
#     if not s:
#         return n
#     if not n:
#         return s
#     if n.startswith(s):
#         tail = n[len(s):]
#         tail = tail.lstrip("-/ .")
#         return f"{s}{tail}"
#     return f"{s}{n}"


# def get_party_code(doc, *, role: str, id_field: str, vat_field: str, id_programoje_field: str) -> str:
#     sid = _s(getattr(doc, id_field, None))
#     if sid:
#         return sid
#     svat = _s(getattr(doc, vat_field, None))
#     if svat:
#         return svat
#     sidp = _s(getattr(doc, id_programoje_field, None))
#     if sidp:
#         return sidp
#     return ""


# def normalize_preke_paslauga_tipas(value: object) -> str:
#     """'1' (prekė/kodas) или '2' (paslauga)."""
#     if value is None:
#         return "1"
#     s = str(value).strip().lower()
#     if not s:
#         return "1"
#     try:
#         n = int(float(s.replace(",", ".")))
#         if n in (1, 3):
#             return "1"
#         elif n in (2, 4):
#             return "2"
#     except ValueError:
#         pass
#     if s in {"preke", "prekė", "prekes", "prekės", "kodas", "kodai"}:
#         return "1"
#     if s in {"paslauga", "paslaugos"}:
#         return "2"
#     return "1"


# # =========================
# # Документная скидка: пропорциональное распределение на строки
# # (аналогично Rivile ERP — пересчитываем цены и PVM,
# #  нативные поля скидок AGNUM NUOLPROC/NUOL/NUOL1/NUOL2 остаются нулевыми)
# # =========================

# def _compute_discount_factor(doc):
#     """
#     factor = 1 - (invoice_discount_wo_vat / base_total_before_discount)
#     Если скидки нет → (None, D("0"))
#     """
#     disc = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
#     if disc <= 0:
#         return None, Decimal("0")

#     line_items = getattr(doc, "line_items", None)
#     if line_items and hasattr(line_items, "all") and line_items.exists():
#         base_total = Decimal("0")
#         for it in line_items.all():
#             qty = _safe_D(getattr(it, "quantity", 1) or 1)
#             price = _safe_D(getattr(it, "price", 0) or 0)
#             base_total += (price * qty)
#     else:
#         base_total = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0) + disc

#     if base_total <= 0:
#         return None, Decimal("0")

#     factor = Decimal("1") - disc / base_total
#     if factor < Decimal("0"):
#         factor = Decimal("0")
#     if factor > Decimal("1"):
#         factor = Decimal("1")

#     logger.info(
#         "[AGNUM:DISCOUNT] doc=%s discount=%.2f base_total=%.2f factor=%.6f",
#         getattr(doc, "pk", None), disc, base_total, factor,
#     )
#     return factor, disc


# def _apply_line_discount(price, qty, vat, vat_pct, factor):
#     """
#     Пересчитывает цену и PVM строки с учётом документной скидки.
#     Returns: (adj_price, adj_vat)
#     """
#     p = _safe_D(price)
#     v = _safe_D(vat)

#     if factor is None:
#         return p, v

#     adj_price = (p * factor).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

#     if vat_pct is not None:
#         vat_rate = _safe_D(vat_pct)
#         q = _safe_D(qty)
#         adj_vat = (adj_price * q * vat_rate / Decimal("100")).quantize(
#             Decimal("0.01"), rounding=ROUND_HALF_UP
#         )
#     else:
#         adj_vat = (v * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

#     return adj_price, adj_vat


# # =========================
# # EU / I.SAF
# # =========================

# EU_ISO2 = {
#     "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
#     "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
# }


# def _is_eu_country(iso: object) -> bool:
#     if not iso:
#         return False
#     return str(iso).strip().upper() in EU_ISO2


# def _is_zero(v) -> bool:
#     try:
#         return Decimal(str(v)) == 0
#     except Exception:
#         return True


# def _pick_isaf_for_purchase(doc):
#     country = getattr(doc, "seller_country_iso", "") or ""
#     non_eu_or_empty = not _is_eu_country(country)
#     line_items = getattr(doc, "line_items", None)
#     if line_items and hasattr(line_items, "all") and line_items.exists():
#         vat_zero_all = all(_is_zero(getattr(it, "vat_percent", None)) for it in line_items.all())
#     else:
#         vat_zero_all = _is_zero(getattr(doc, "vat_percent", None))
#     if non_eu_or_empty and vat_zero_all:
#         return "12"
#     return None


# # =========================
# # PVM Kodas helpers
# # =========================

# def _get_pvm_kodas_for_item(doc, item, line_map=None, default="PVM1") -> str:
#     item_id = getattr(item, "id", None)
#     if line_map is not None and item_id is not None and item_id in line_map:
#         pvm = _s(line_map.get(item_id, ""))
#         if pvm and pvm != "Keli skirtingi PVM":
#             return pvm
#     pvm = _s(getattr(item, "pvm_kodas", ""))
#     if pvm and pvm != "Keli skirtingi PVM":
#         return pvm
#     return default


# def _get_pvm_kodas_for_doc(doc, default="") -> str:
#     separate_vat = bool(getattr(doc, "separate_vat", False))
#     scan_type = _s(getattr(doc, "scan_type", "")).lower()
#     if separate_vat and scan_type in ("sumiskai", "summary", "suminis"):
#         return default
#     pvm = _s(getattr(doc, "pvm_kodas", ""))
#     if pvm == "Keli skirtingi PVM":
#         return default
#     return pvm or default


# # =========================
# # Customers builders
# # =========================

# def _build_agnum_customer_from_doc(doc) -> tuple[str, dict]:
#     """Customers/Item из seller_* полей (для pirkimai)."""
#     kod = get_party_code(
#         doc, role="seller",
#         id_field="seller_id", vat_field="seller_vat_code",
#         id_programoje_field="seller_id_programoje",
#     )
#     if not kod:
#         kod = (_s(getattr(doc, "seller_vat_code", "")) or
#                _s(getattr(doc, "seller_id", "")) or "UNKNOWN_SELLER")

#     name = _s(getattr(doc, "seller_name", "")) or kod
#     adr = _s(getattr(doc, "seller_address", ""))
#     email = _s(getattr(doc, "seller_email", ""))
#     country = _s(getattr(doc, "seller_country_iso", "")).upper()
#     country_name = country_name_lt(country)
#     seller_iban = _s(getattr(doc, "seller_iban", ""))
#     rkod = _s(getattr(doc, "seller_id", "")) or _s(getattr(doc, "seller_vat_code", ""))
#     pvmkod = _s(getattr(doc, "seller_vat_code", ""))
#     currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"

#     attrs = {
#         "KOD": kod, "PAVAD": name, "CONTACT": "", "ADR": adr,
#         "TLF": "", "FAX": "",
#         "RKOD": rkod or "", "PVMKOD": pvmkod,
#         "BKOD": "", "BPAVAD": "", "BSASK": seller_iban or "",
#         "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
#         "INFO": "",
#         "ACC1": "", "ACC2": "", "ACC3": "", "ACC4": "", "ACC5": "",
#         "ACC6": "", "ACC7": "", "ACC8": "", "ACC9": "", "ACC10": "",
#         "ACC11": "", "ACC12": "",
#         "SALIS_KOD": country or "", "SALIS": country_name or "",
#         "MIESTAS": "", "GATVE": "", "EMAIL": email,
#         "PINDEX": "", "SAVIVKOD": "", "APSKR": "",
#         "KRD": "Y", "DEB": "N", "AKTYVUS": "Y",
#         "POZYMIAI": _agnum_pozymiai_100(),
#         "KOD_IS": "", "DEFAULT_CURR": currency or "EUR",
#         "FIZ_ASM": "N", "VEZEJAS": "N", "KNGR": "4",
#     }
#     return kod, attrs


# def _build_agnum_customer_from_buyer(doc) -> tuple[str, dict]:
#     """Customers/Item из buyer_* полей (для pardavimai)."""
#     kod = get_party_code(
#         doc, role="buyer",
#         id_field="buyer_id", vat_field="buyer_vat_code",
#         id_programoje_field="buyer_id_programoje",
#     )
#     if not kod:
#         kod = (_s(getattr(doc, "buyer_vat_code", "")) or
#                _s(getattr(doc, "buyer_id", "")) or "UNKNOWN_BUYER")

#     name = _s(getattr(doc, "buyer_name", "")) or kod
#     adr = _s(getattr(doc, "buyer_address", ""))
#     email = _s(getattr(doc, "buyer_email", ""))
#     country = _s(getattr(doc, "buyer_country_iso", "")).upper()
#     country_name = country_name_lt(country)
#     buyer_iban = _s(getattr(doc, "buyer_iban", ""))
#     rkod = _s(getattr(doc, "buyer_id", "")) or _s(getattr(doc, "buyer_vat_code", ""))
#     pvmkod = _s(getattr(doc, "buyer_vat_code", ""))
#     currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"

#     attrs = {
#         "KOD": kod, "PAVAD": name, "CONTACT": "", "ADR": adr,
#         "TLF": "", "FAX": "",
#         "RKOD": rkod or "", "PVMKOD": pvmkod,
#         "BKOD": "", "BPAVAD": "", "BSASK": buyer_iban or "",
#         "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
#         "INFO": "",
#         "ACC1": "", "ACC2": "", "ACC3": "", "ACC4": "", "ACC5": "",
#         "ACC6": "", "ACC7": "", "ACC8": "", "ACC9": "", "ACC10": "",
#         "ACC11": "", "ACC12": "",
#         "SALIS_KOD": country or "", "SALIS": country_name or "",
#         "MIESTAS": "", "GATVE": "", "EMAIL": email,
#         "PINDEX": "", "SAVIVKOD": "", "APSKR": "",
#         "KRD": "N", "DEB": "Y", "AKTYVUS": "Y",
#         "POZYMIAI": _agnum_pozymiai_100(),
#         "KOD_IS": "", "DEFAULT_CURR": currency or "EUR",
#         "FIZ_ASM": "N", "VEZEJAS": "N", "KNGR": "4",
#     }
#     return kod, attrs


# # =========================
# # Goods builder
# # =========================

# def _build_agnum_good_from_item(doc, item, user_defaults=None, line_map=None, discount_factor=None):
#     """
#     Goods/Item по строке.
#     KN0 (DOUBLE, 2 зн.) = пересчитанная цена с учётом документной скидки.
#     """
#     user_defaults = user_defaults or {}

#     kod = (_s(getattr(item, "prekes_kodas", "")) or
#            _s(getattr(item, "prekes_barkodas", "")) or "PREKE001")

#     doc_snd = _s(getattr(doc, "agnum_snd_kod", ""))
#     snd_kod = user_defaults.get("sandelis") or doc_snd or "S1"

#     item_grupe = _s(getattr(item, "grupe", "") or getattr(item, "preke_grupe", ""))
#     doc_grupe = _s(getattr(doc, "grupe", ""))
#     grupe = user_defaults.get("grupe") or item_grupe or doc_grupe or ""

#     item_okod = _s(getattr(item, "okod", "") or getattr(item, "objekto_kodas", ""))
#     doc_okod = _s(getattr(doc, "okod", ""))
#     okod = user_defaults.get("objektas") or item_okod or doc_okod or ""

#     name = _s(getattr(item, "prekes_pavadinimas", "")) or "Prekė"
#     tipas_str = normalize_preke_paslauga_tipas(
#         getattr(item, "preke_paslauga", None) or getattr(doc, "preke_paslauga", None)
#     )
#     cls = "1" if tipas_str == "2" else "0"

#     unit = _s(getattr(item, "unit", "")) or "vnt."
#     curr = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
#     vat_pct = getattr(item, "vat_percent", None)
#     pvm_kod = _get_pvm_kodas_for_item(doc, item, line_map, default="PVM1")

#     # KN0: пересчитываем с учётом документной скидки
#     raw_price = _safe_D(getattr(item, "price", None) or 0)
#     if discount_factor is not None:
#         kn0 = (raw_price * discount_factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
#     else:
#         kn0 = raw_price

#     attrs = {
#         "KOD": kod, "SND_KOD": snd_kod, "PAVAD": name,
#         "CLASS": cls, "GRUPE": grupe, "POGRUPIS": "", "KATEG": "",
#         "PAVAD1": "", "PAVAD2": "", "PAVAD3": "", "PAVAD4": "",
#         "PAVAD5": "", "PAVAD6": "", "PAVAD7": "", "PAVAD8": "",
#         "VNT": unit, "VNT2": "",
#         "SVORIS": "0", "SVORIS1": "0", "TURIS": "0",
#         "VIETA": "", "METOD": "0", "IPAK": "0",
#         "KN0": _format_price_agnum(kn0),                           # DOUBLE, 2 зн.
#         "KN1": "0", "KN2": "0", "KN3": "0", "KN4": "0", "KN5": "0",
#         "KNB": "0", "KNBVAL": curr,
#         "REZ": "0", "UZS": "0", "APMOKPVM": "Y",
#         "PVM0": _format_vat_rate_agnum(vat_pct),
#         "PVM": _format_vat_rate_agnum(vat_pct),
#         "PVM2": _format_vat_rate_agnum(vat_pct),
#         "PVM3": _format_vat_rate_agnum(vat_pct),
#         "PVM4": _format_vat_rate_agnum(vat_pct),
#         "PVM5": _format_vat_rate_agnum(vat_pct),
#         "MOK0": "0", "MEMO": "",
#         "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
#         "F6": "0", "F7": "0", "F8": "0",
#         "ACC1": "", "ACC2": "", "ACC3": "", "ACC4": "", "ACC5": "",
#         "PVM_KOD": pvm_kod,
#         "POZYMIAI": _agnum_pozymiai_100(),
#     }
#     return kod, attrs, okod


# # =========================
# # AGNUM: PIRKIMAI (Documents Type="2")
# # =========================

# def _build_agnum_rows_for_pirkimas(doc, line_items, user_defaults=None, line_map=None, discount_factor=None):
#     """
#     Row для pirkimai.
#     PRKKN = пересчитанная цена (price × factor), NUMERIC(14,4).
#     PVM = пересчитанный, DOUBLE.
#     """
#     user_defaults = user_defaults or {}
#     rows = []

#     for item in line_items:
#         qty = getattr(item, "quantity", None) or 1
#         price = getattr(item, "price", None) or 0
#         vat = getattr(item, "vat", None) or 0
#         vat_pct = getattr(item, "vat_percent", None)

#         adj_price, adj_vat = _apply_line_discount(price, qty, vat, vat_pct, discount_factor)

#         item_okod = _s(getattr(item, "okod", "") or getattr(item, "objekto_kodas", ""))
#         doc_okod = _s(getattr(doc, "okod", ""))
#         obj_kod = user_defaults.get("objektas") or item_okod or doc_okod or ""

#         pvm_kod = _get_pvm_kodas_for_item(doc, item, line_map, default="PVM1")

#         row = {
#             "KOD": (_s(getattr(item, "prekes_kodas", "")) or
#                     _s(getattr(item, "prekes_barkodas", "")) or "PREKE001"),
#             "KIEKIS": _format_quantity_agnum(qty),              # NUMERIC(14,4)
#             "PRKKN": _format_numeric_4_agnum(adj_price),        # NUMERIC(14,4)
#             "MT": "0",
#             "AKC": "0",
#             "PVM": _format_price_agnum(adj_vat),                # DOUBLE
#             "PVM_PROC": _format_vat_rate_agnum(vat_pct),
#             "F1": "", "F2": "", "F3": "", "F4": "", "F5": "",
#             "D1": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
#             "D2": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
#             "D3": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
#             "KILMESSALIS": _s(getattr(doc, "seller_country_iso", "")).upper(),
#             "APSKRITIS": "",
#             "PART_PARKN": "0",
#             "OBJ_KOD": obj_kod,
#             "PVM_KOD": pvm_kod,
#         }
#         rows.append(row)
#     return rows


# def export_pirkimai_group_to_agnum(documents, user):
#     """Экспорт pirkimai → AGNUM XML (Documents Type="2")."""
#     logger.info("[AGNUM:PIRKIMAI] start, docs=%d", len(documents) if documents else 0)

#     extra = getattr(user, "agnum_extra_fields", None) or {}
#     user_defaults = {
#         "sandelis": _s(extra.get("pirkimas_sandelis") or ""),
#         "grupe": _s(extra.get("pirkimas_grupe") or ""),
#         "objektas": _s(extra.get("pirkimas_objektas") or ""),
#     }

#     agnum = ET.Element("AgnumData", {
#         "Version": "25",
#         "CreatedByApp": "DokSkenas",
#         "CreatedByLogin": str(getattr(user, "id", "1")),
#         "CreatedOn": format_date_agnum(getattr(user, "agnum_created_on", None)) or format_date_agnum(date.today()),
#     })

#     customers_by_kod = {}
#     goods_by_kod = {}
#     barcodes_qty = {}
#     docs_data = []

#     for doc in (documents or []):
#         logger.info("[AGNUM:PIRKIMAI] doc=%s", getattr(doc, "pk", None))

#         line_map = getattr(doc, "_pvm_line_map", None)

#         # 1) клиент (seller)
#         cust_kod, cust_attrs = _build_agnum_customer_from_doc(doc)
#         if cust_kod not in customers_by_kod:
#             customers_by_kod[cust_kod] = cust_attrs

#         # 2) строки
#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, "all") and line_items.exists():
#             items = list(line_items.all())
#         else:
#             items = []

#         if not items:
#             fake_item = type("FakeItem", (), {})()
#             setattr(fake_item, "id", None)
#             setattr(fake_item, "prekes_kodas", _s(getattr(doc, "prekes_kodas", "")) or "PREKE001")
#             setattr(fake_item, "prekes_barkodas", _s(getattr(doc, "prekes_barkodas", "")))
#             setattr(fake_item, "prekes_pavadinimas", _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė")
#             setattr(fake_item, "preke_paslauga", getattr(doc, "preke_paslauga", None))
#             setattr(fake_item, "unit", "vnt.")
#             setattr(fake_item, "quantity", 1)
#             setattr(fake_item, "price", getattr(doc, "amount_wo_vat", None) or 0)
#             setattr(fake_item, "vat", getattr(doc, "vat_amount", None) or 0)
#             setattr(fake_item, "vat_percent", getattr(doc, "vat_percent", None))
#             setattr(fake_item, "pvm_kodas", _get_pvm_kodas_for_doc(doc, default="PVM1"))
#             items = [fake_item]

#         # Документная скидка
#         discount_factor, _ = _compute_discount_factor(doc)

#         rows = _build_agnum_rows_for_pirkimas(doc, items, user_defaults, line_map, discount_factor)

#         # 3) товары / штрихкоды
#         for item in items:
#             g_kod, g_attrs, okod = _build_agnum_good_from_item(doc, item, user_defaults, line_map, discount_factor)
#             if g_kod not in goods_by_kod:
#                 goods_by_kod[g_kod] = g_attrs

#             barkodas = _s(getattr(item, "prekes_barkodas", "")) or _s(getattr(doc, "prekes_barkodas", ""))
#             if barkodas:
#                 qty = getattr(item, "quantity", None)
#                 qtyD = _safe_D(qty if qty is not None else 1)
#                 if qtyD <= 0:
#                     qtyD = Decimal("1")
#                 barcodes_qty[(g_kod, barkodas)] = barcodes_qty.get((g_kod, barkodas), Decimal("0")) + qtyD

#         # 4) документ
#         currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
#         op_date = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None) or date.today()
#         rate = get_currency_rate(currency, op_date) if currency != "EUR" else 1

#         series = smart_str(getattr(doc, "document_series", "") or "")
#         number = smart_str(getattr(doc, "document_number", "") or "")
#         doknr = build_dok_nr(series, number)

#         amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
#         vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
#         skola = amount_wo + vat_amount

#         _isaf = getattr(doc, "report_to_isaf", None)
#         if _isaf is False:
#             ch1_value = "N"
#         else:
#             code_isaf = _pick_isaf_for_purchase(doc)
#             ch1_value = "N" if code_isaf == "12" else "Y"

#         doc_snd = _s(getattr(doc, "agnum_snd_kod", ""))
#         snd_kod = user_defaults["sandelis"] or doc_snd or "S1"

#         doc_pvm_kod = _get_pvm_kodas_for_doc(doc, default="")

#         doc_attrs = {
#             "DATA": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
#             "DATA_G": format_date_agnum(op_date) or _agnum_empty_date(),
#             "DOKNR": doknr,
#             "DOKNR2": "",
#             "KL_KOD": cust_kod,
#             "KL_RKOD": cust_attrs.get("RKOD", ""),
#             "SND_KOD": snd_kod,
#             "VAL": currency,
#             "KURS": _format_decimal_agnum(rate if rate else 1, precision=6),
#             "TR_TIP": "0",
#             "NUOL1": "0",                  # скидка уже в ценах строк
#             "NUOL2": "0",                  # скидка уже в ценах строк
#             "SUMA": _format_price_agnum(amount_wo),
#             "MT": "0", "AKC": "0",
#             "PVM": _format_price_agnum(vat_amount),
#             "PVM_KL": "0", "KT": "0", "PR": "0",
#             "SUMAP": "0", "TRANSP": "0",
#             "SUMVISO": _format_price_agnum(amount_wo),
#             "DRB": "",
#             "SKOLA": _format_price_agnum(skola),
#             "TERM": "0", "APMSUM": "0",
#             "SANDORIS": "", "PRISTSAL": "", "TRANSPORTAS": "",
#             "SALISSIUNT": _s(getattr(doc, "seller_country_iso", "")).upper(),
#             "TR_VVAL": "Y",
#             "POZYMIAI": _agnum_pozymiai_100(),
#             "CH1": ch1_value,
#             "M0": "Y", "M1": "Y", "M2": "Y", "M3": "Y", "M4": "Y",
#             "M5": "Y", "M6": "Y", "M7": "Y", "M8": "Y",
#             "PVM_KOD": doc_pvm_kod,
#             "SPEC_TAX": "N",
#             "REF_DOK_DATA": _agnum_empty_date(),
#             "REF_DOK_NR": "",
#             "SF_TIP": "SF",
#             "MEMO": _s(getattr(doc, "comment", "")),
#             "NUM1": "0", "NUM2": "0", "NUM3": "0", "NUM4": "0", "NUM5": "0",
#             "TXT1": "", "TXT2": "", "TXT3": "", "TXT4": "", "TXT5": "",
#             "PR_VIETA": "",
#             "Count": str(len(rows)),
#         }

#         docs_data.append({"attrs": doc_attrs, "rows": rows})

#     # === XML ===
#     cust_el = ET.SubElement(agnum, "Customers", {"Count": str(len(customers_by_kod))})
#     for attrs in customers_by_kod.values():
#         ET.SubElement(cust_el, "Item", attrs)

#     goods_el = ET.SubElement(agnum, "Goods", {"Count": str(len(goods_by_kod))})
#     for attrs in goods_by_kod.values():
#         ET.SubElement(goods_el, "Item", attrs)

#     ET.SubElement(agnum, "Objects", {"Count": "0"})

#     docs_el = ET.SubElement(agnum, "Documents", {"Type": "2", "Count": str(len(docs_data))})
#     for d in docs_data:
#         item_el = ET.SubElement(docs_el, "Item", d["attrs"])
#         for r in d["rows"]:
#             ET.SubElement(item_el, "Row", r)

#     bc_el = ET.SubElement(agnum, "Barcodes", {"Count": str(len(barcodes_qty))})
#     for (kod, bkod), kiekis in barcodes_qty.items():
#         ET.SubElement(bc_el, "Item", {
#             "KOD": kod, "BKOD": bkod,
#             "KIEKIS": _format_decimal_agnum(kiekis, precision=2),   # NUMERIC(12,2)
#         })

#     _indent(agnum)
#     body = ET.tostring(agnum, encoding="utf-8", xml_declaration=False)
#     xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + body + b"\n"
#     return expand_empty_tags(xml)


# # =========================
# # AGNUM: PARDAVIMAI (Documents Type="4")
# # =========================

# def _build_agnum_rows_for_pardavimas(doc, line_items, user_defaults=None, line_map=None, discount_factor=None):
#     """
#     Row для pardavimai.
#     PARKN = пересчитанная цена (price × factor), NUMERIC(14,4).
#     ORIGPARKN = PARKN (тоже пересчитанная).
#     NUOL = 0, NUOL2 = 0. Скидка тихо в ценах.
#     """
#     user_defaults = user_defaults or {}
#     rows = []

#     for item in line_items:
#         qty = getattr(item, "quantity", None) or 1
#         price = getattr(item, "price", None) or 0
#         vat = getattr(item, "vat", None) or 0
#         vat_pct = getattr(item, "vat_percent", None)

#         adj_price, adj_vat = _apply_line_discount(price, qty, vat, vat_pct, discount_factor)

#         item_okod = _s(getattr(item, "okod", "") or getattr(item, "objekto_kodas", ""))
#         doc_okod = _s(getattr(doc, "okod", ""))
#         okod = user_defaults.get("objektas") or item_okod or doc_okod or ""

#         pvm_kod = _get_pvm_kodas_for_item(doc, item, line_map, default="PVM1")

#         row = {
#             "KOD": (_s(getattr(item, "prekes_kodas", "")) or
#                     _s(getattr(item, "prekes_barkodas", "")) or "PREKE002"),
#             "BKOD": _s(getattr(item, "prekes_barkodas", "")),
#             "KIEKIS": _format_quantity_agnum(qty),              # NUMERIC(14,4)
#             "PVM": _format_price_agnum(adj_vat),                # DOUBLE
#             "PVM_PROC": _format_vat_rate_agnum(vat_pct),
#             "MOK0_PROC": "0", "MOK0_LT": "0",
#             "VNT": _s(getattr(item, "unit", "")) or "vnt",
#             "PARKN": _format_numeric_4_agnum(adj_price),        # NUMERIC(14,4) — пересчитанная
#             "ORIGPARKN": _format_numeric_4_agnum(adj_price),    # NUMERIC(14,4) — = PARKN
#             "NUOL": _format_numeric_4_agnum(0),                 # NUMERIC(14,4) — 0
#             "NUOL2": "0",                                       # 0
#             "UZS_SHOPNR": "", "UZS_UZSNR": "",
#             "UZS_PRKKOD": _s(getattr(item, "uzsakovo_preke_kodas", "")),
#             "ZYME": "",
#             "UZS_PRDATA": format_date_agnum(getattr(doc, "delivery_date", None)) or _agnum_empty_date(),
#             "COMMENT": _s(getattr(item, "comment", "")),
#             "VSK_F1": "", "VSK_F2": "", "VSK_F3": "", "VSK_F4": "", "VSK_F5": "",
#             "ID_PRK1": "0",
#             "PVM_KOD": pvm_kod,
#             "OKOD": okod,
#         }
#         rows.append(row)
#     return rows


# def _get_agnum_default_account(user):
#     es = getattr(user, "extra_settings", {}) or {}
#     seller_iban = _s(es.get("seller_iban", ""))
#     if seller_iban:
#         return {"SASK": seller_iban, "KOD": "", "PAVAD": "", "ADR": "", "TLF": "", "SWIFT": ""}
#     return {"SASK": "LT000000000000000000", "KOD": "00000", "PAVAD": "BANKAS", "ADR": "", "TLF": "", "SWIFT": ""}


# def export_pardavimai_group_to_agnum(documents, user):
#     """Экспорт pardavimai → AGNUM XML (Documents Type="4")."""
#     logger.info("[AGNUM:PARDAVIMAI] start, docs=%d", len(documents) if documents else 0)

#     extra = getattr(user, "agnum_extra_fields", None) or {}
#     user_defaults = {
#         "sandelis": _s(extra.get("pardavimas_sandelis") or ""),
#         "grupe": _s(extra.get("pardavimas_grupe") or ""),
#         "objektas": _s(extra.get("pardavimas_objektas") or ""),
#     }

#     agnum = ET.Element("AgnumData", {
#         "Version": "25",
#         "CreatedByApp": "DokSkenas",
#         "CreatedByLogin": str(getattr(user, "id", "1")),
#         "CreatedOn": format_date_agnum(getattr(user, "agnum_created_on", None)) or format_date_agnum(date.today()),
#     })

#     customers_by_kod = {}
#     goods_by_kod = {}
#     barcodes_qty = {}
#     docs_data = []

#     account_attrs = _get_agnum_default_account(user)
#     sask_number = account_attrs["SASK"]

#     for doc in (documents or []):
#         logger.info("[AGNUM:PARDAVIMAI] doc=%s", getattr(doc, "pk", None))

#         line_map = getattr(doc, "_pvm_line_map", None)

#         # 1) клиент (buyer)
#         cust_kod, cust_attrs = _build_agnum_customer_from_buyer(doc)
#         if cust_kod not in customers_by_kod:
#             customers_by_kod[cust_kod] = cust_attrs

#         # 2) строки
#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, "all") and line_items.exists():
#             items = list(line_items.all())
#         else:
#             items = []

#         is_sumisr = len(items) == 0
#         scan_type = getattr(doc, "scan_type", None)
#         if scan_type and str(scan_type).lower() in ["summary", "suminis", "суммарный"]:
#             is_sumisr = True

#         if not items:
#             fake_item = type("FakeItem", (), {})()
#             setattr(fake_item, "id", None)
#             setattr(fake_item, "prekes_kodas", _s(getattr(doc, "prekes_kodas", "")) or "PREKE002")
#             setattr(fake_item, "prekes_barkodas", _s(getattr(doc, "prekes_barkodas", "")))
#             setattr(fake_item, "prekes_pavadinimas", _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė")
#             setattr(fake_item, "preke_paslauga", getattr(doc, "preke_paslauga", None))
#             setattr(fake_item, "unit", "vnt.")
#             setattr(fake_item, "quantity", 1)
#             setattr(fake_item, "price", getattr(doc, "amount_wo_vat", None) or 0)
#             setattr(fake_item, "vat", getattr(doc, "vat_amount", None) or 0)
#             setattr(fake_item, "vat_percent", getattr(doc, "vat_percent", None))
#             setattr(fake_item, "pvm_kodas", _get_pvm_kodas_for_doc(doc, default="PVM1"))
#             setattr(fake_item, "original_price", getattr(doc, "amount_wo_vat", None) or 0)
#             items = [fake_item]

#         # Документная скидка
#         discount_factor, _ = _compute_discount_factor(doc)

#         rows = _build_agnum_rows_for_pardavimas(doc, items, user_defaults, line_map, discount_factor)

#         # 3) товары / штрихкоды
#         for item in items:
#             g_kod, g_attrs, okod = _build_agnum_good_from_item(doc, item, user_defaults, line_map, discount_factor)
#             if g_kod not in goods_by_kod:
#                 goods_by_kod[g_kod] = g_attrs

#             barkodas = _s(getattr(item, "prekes_barkodas", "")) or _s(getattr(doc, "prekes_barkodas", ""))
#             if barkodas:
#                 qty = getattr(item, "quantity", None)
#                 qtyD = _safe_D(qty if qty is not None else 1)
#                 if qtyD <= 0:
#                     qtyD = Decimal("1")
#                 barcodes_qty[(g_kod, barkodas)] = barcodes_qty.get((g_kod, barkodas), Decimal("0")) + qtyD

#         # 4) документ
#         currency = _s(getattr(doc, "currency", "EUR")).upper() or "EUR"
#         op_date = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None) or date.today()
#         rate = get_currency_rate(currency, op_date) if currency != "EUR" else 1

#         series = smart_str(getattr(doc, "document_series", "") or "")
#         number = smart_str(getattr(doc, "document_number", "") or "")
#         doknr = build_dok_nr(series, number)

#         amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
#         vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
#         skola = amount_wo + vat_amount

#         apm_sal = _s(getattr(doc, "payment_type_code", "")) or "1"
#         term = _s(getattr(doc, "payment_term_days", "")) or "0"

#         doc_snd = _s(getattr(doc, "agnum_snd_kod", ""))
#         snd_kod = user_defaults["sandelis"] or doc_snd or "S1"

#         doc_pvm_kod = _get_pvm_kodas_for_doc(doc, default="")

#         doc_attrs = {
#             "DATA": format_date_agnum(getattr(doc, "invoice_date", None)) or _agnum_empty_date(),
#             "DOKNR": doknr,
#             "DOKNR2": "",
#             "GVNR": _s(getattr(doc, "transport_document_number", "")),
#             "KL_KOD": cust_kod,
#             "KL_RKOD": cust_attrs.get("RKOD", ""),
#             "PAD_KOD": "",
#             "SND_KOD": snd_kod,
#             "VAL": currency,
#             "KURS": _format_decimal_agnum(rate if rate else 1, precision=6),
#             "NUOLPROC": "0",               # скидка уже в ценах строк
#             "NUOL": "0",                   # скидка уже в ценах строк
#             "SUMA": _format_price_agnum(amount_wo),
#             "SUMAP": "0",
#             "PVMPROC": "0",
#             "PVM": _format_price_agnum(vat_amount),
#             "MOK0": "0",
#             "SUMVISO": _format_price_agnum(amount_wo),
#             "SKOLA": _format_price_agnum(skola),
#             "APMSUM": "0",
#             "APM_SAL": apm_sal,
#             "TERM": term,
#             "KNTIP": "4",
#             "PR_VIETA": _s(getattr(doc, "delivery_place", "")),
#             "PR_DATA": format_date_agnum(getattr(doc, "delivery_date", None)) or _agnum_empty_date(),
#             "KIENO_TR": "0",
#             "SUMISR": "Y" if is_sumisr else "N",
#             "CHECKNR": _s(getattr(doc, "receipt_number", "")),
#             "KSNR": _s(getattr(doc, "cash_register_number", "")),
#             "CHECKD": format_date_agnum(getattr(doc, "receipt_date", None)) or _agnum_empty_date(),
#             "ADDR1": "", "ADDR2": "",
#             "DRBKOD": _s(getattr(doc, "employee_code", "")),
#             "DRB": _s(getattr(doc, "employee_name", "")),
#             "DRBKOD1": "", "DRB1": "",
#             "AG_KOD": "",
#             "SANDORIS": "", "PRISTSAL": "", "TRANSPORTAS": "",
#             "SALISSIUNT": _s(getattr(doc, "seller_country_iso", "")).upper(),
#             "FNUM1": "0", "FNUM2": "0", "FNUM3": "0",
#             "SASK": sask_number,
#             "SAVIK": "0", "SUMAK": "0",
#             "M10": "N" if getattr(doc, "report_to_isaf", None) is False else "Y",
#             "POZYMIAI": _agnum_pozymiai_100(),
#             "PVM_KOD": doc_pvm_kod,
#             "SPEC_TAX": "N",
#             "REF_DOK_DATA": _agnum_empty_date(),
#             "REF_DOK_NR": "",
#             "SF_TIP": "SF",
#             "POINTS_USED": "0", "POINTS_ADDED": "0",
#             "DOK_USER": _s(getattr(doc, "db_user", "")) or "1",
#             "DOK_USER0": _s(getattr(doc, "db_user_created", "")) or "1",
#             "DOKMEMO": _s(getattr(doc, "comment", "")),
#             "Count": str(len(rows)),
#         }

#         docs_data.append({"attrs": doc_attrs, "rows": rows})

#     # === XML ===
#     cust_el = ET.SubElement(agnum, "Customers", {"Count": str(len(customers_by_kod))})
#     for attrs in customers_by_kod.values():
#         ET.SubElement(cust_el, "Item", attrs)

#     ET.SubElement(agnum, "Departments", {"Count": "0"})

#     goods_el = ET.SubElement(agnum, "Goods", {"Count": str(len(goods_by_kod))})
#     for attrs in goods_by_kod.values():
#         ET.SubElement(goods_el, "Item", attrs)

#     accounts_el = ET.SubElement(agnum, "Accounts", {"Count": "1"})
#     ET.SubElement(accounts_el, "Item", account_attrs)

#     docs_el = ET.SubElement(agnum, "Documents", {"Type": "4", "Count": str(len(docs_data))})
#     for d in docs_data:
#         item_el = ET.SubElement(docs_el, "Item", d["attrs"])
#         for r in d["rows"]:
#             ET.SubElement(item_el, "Row", r)

#     bc_el = ET.SubElement(agnum, "Barcodes", {"Count": str(len(barcodes_qty))})
#     for (kod, bkod), kiekis in barcodes_qty.items():
#         ET.SubElement(bc_el, "Item", {
#             "KOD": kod, "BKOD": bkod,
#             "KIEKIS": _format_decimal_agnum(kiekis, precision=2),   # NUMERIC(12,2)
#         })

#     _indent(agnum)
#     body = ET.tostring(agnum, encoding="utf-8", xml_declaration=False)
#     xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + body + b"\n"
#     return expand_empty_tags(xml)





