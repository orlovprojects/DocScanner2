import random
import xml.etree.ElementTree as ET
from xml.dom import minidom
import csv
import io
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

from django.utils import timezone
from django.utils.encoding import smart_str

from ..models import ScannedDocument
from ..utils.extra_fields import get_extra_for_export
from .formatters import (
    format_date,
    vat_to_int_str,
    get_price_or_zero,
    get_price_2_or_4,
    expand_empty_tags,
)


# =========================
# Helpers
# =========================

def _is_credit_doc(document) -> bool:
    return (
        getattr(document, "is_credit_invoice", False) is True
        or str(getattr(document, "invoice_type", "") or "").strip().lower() == "kreditine"
    )

def prettify_with_header(elem: ET.Element, encoding: str = "utf-8") -> bytes:
    """
    Возвращает красивый XML (bytes) с XML-декларацией в заданной кодировке.
    Пустые строки удаляются. Ничего не заменяем (например, &quot;), чтобы не ломать экранирование.
    """
    rough = ET.tostring(elem, encoding=encoding)
    reparsed = minidom.parseString(rough)
    xml_bytes = reparsed.toprettyxml(indent="  ", encoding=encoding)
    lines = [line for line in xml_bytes.splitlines() if line.strip()]
    return b"\n".join(lines)


def _nz(v) -> bool:
    """Есть ли непустая строка после strip()."""
    return bool((str(v).strip() if v is not None else ""))


def _s(v) -> str:
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def _parse_cp_key(cp_key):
    if not cp_key:
        return ""

    cp = str(cp_key).strip()
    if cp.lower().startswith("id:"):
        return cp.split(":", 1)[1].strip()
    return cp


def _infer_direction(document: ScannedDocument, direction_hint: str | None) -> tuple[str, str]:
    """
    Возвращает (party_prefix, kontrah_tag) на основе:
      1) явного direction_hint ('pirkimas'/'pardavimas')
      2) эвристики по заполненности buyer/seller ID/VAT
      3) дефолт - 'seller'/'kontrah'
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
    else:
        return 'buyer', 'pirkejas'


def _get_own_company_code_from_doc(document: ScannedDocument, direction_hint: str | None = None) -> str:
    """
    Определяет код своей фирмы из документа.

    - pirkimas -> своя фирма buyer
    - pardavimas -> своя фирма seller
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
        candidates = [
            getattr(document, 'buyer_id', None),
            getattr(document, 'buyer_vat_code', None),
            getattr(document, 'buyer_id_programoje', None),
        ]
    else:
        candidates = [
            getattr(document, 'seller_id', None),
            getattr(document, 'seller_vat_code', None),
            getattr(document, 'seller_id_programoje', None),
        ]

    for value in candidates:
        code = _s(value)
        if code:
            return code
    return ""


def _get_centas_extra_for_doc(user, document: ScannedDocument, own_company_code=None, direction_hint: str | None = None) -> dict:
    """
    Получает extra fields для конкретного документа.

    Приоритет:
    1. Профиль конкретной фирмы по own_company_code
    2. Профиль фирмы, определённой из документа
    3. Глобальный профиль (__all__)
    4. Пустой dict
    """
    if not user:
        return {}

    requested_code = _parse_cp_key(own_company_code)
    doc_company_code = _get_own_company_code_from_doc(document, direction_hint)

    extra = {}
    resolved_by = ""

    if requested_code:
        extra = get_extra_for_export(user, 'centas', requested_code)
        if extra:
            resolved_by = requested_code

    if not extra and doc_company_code and doc_company_code != requested_code:
        extra = get_extra_for_export(user, 'centas', doc_company_code)
        if extra:
            resolved_by = doc_company_code

    if not extra:
        extra = get_extra_for_export(user, 'centas', None)
        if extra:
            resolved_by = '__all__/legacy'

    return extra or {}


def _resolve_party_code(
    document: ScannedDocument,
    id_field: str,
    vat_field: str,
    prog_field: str,
) -> str:
    """
    Код контрагента по приоритету:
      1) *_id
      2) *_vat_code
      3) *_id_programoje
    Если все пусто - 'NERAKODO'.
    """
    def _val(field_name: str) -> str:
        v = getattr(document, field_name, None)
        return (str(v).strip() if v is not None else "")

    v = _val(id_field)
    if v:
        return smart_str(v)
    v = _val(vat_field)
    if v:
        return smart_str(v)
    v = _val(prog_field)
    if v:
        return smart_str(v)
    return "NERAKODO"


def _fallback_doc_num(series: str, number: str) -> str:
    """
    Номер документа:
      - оба пустые -> NERANUMERIO + 5 случайных цифр
      - только number -> number
      - только series -> series
      - оба есть -> series + number (если number не начинается с series)
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


def _fmt_qty(q) -> str:
    """
    Количество: минимум 2, максимум 4 знака.
    Пусто/нечисло -> 1.00
    """
    return get_price_2_or_4(q, default="1.00")


def _distribute_discount_to_centas_lines(document: ScannedDocument, items_list: list) -> None:
    """
    Распределяет скидку документа (invoice_discount_wo_vat) на строки товаров.

    ВАЖНО: Centas не имеет поля для скидки документа, поэтому мы:
      1. ВЫЧИТАЕМ долю скидки из subtotal каждой строки
      2. ПЕРЕСЧИТЫВАЕМ price (kaina) = new_subtotal / quantity

    Args:
        document: документ с полем invoice_discount_wo_vat
        items_list: список объектов LineItem (модифицируется in-place)

    Модифицирует:
        Устанавливает атрибут _centas_price_after_discount
    """
    if not items_list:
        return

    from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

    discount_raw = getattr(document, "invoice_discount_wo_vat", None)
    if discount_raw in (None, "", 0, "0"):
        return

    try:
        discount_wo = Decimal(str(discount_raw))
    except (ValueError, InvalidOperation):
        return

    if discount_wo <= 0:
        return

    sum_subtotal_before = Decimal("0")
    for item in items_list:
        price = Decimal(str(getattr(item, "price", 0) or 0))
        qty = Decimal(str(getattr(item, "quantity", 1) or 1))
        sum_subtotal_before += price * qty

    if sum_subtotal_before <= 0:
        return

    discount_distributed = Decimal("0")

    for i, item in enumerate(items_list):
        qty = Decimal(str(getattr(item, "quantity", 1) or 1))
        price_before = Decimal(str(getattr(item, "price", 0) or 0))

        subtotal_before = price_before * qty

        if i == len(items_list) - 1:
            line_discount = discount_wo - discount_distributed
        else:
            share = subtotal_before / sum_subtotal_before
            line_discount = (discount_wo * share).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            discount_distributed += line_discount

        subtotal_after = subtotal_before - line_discount

        if qty > 0:
            price_after = (subtotal_after / qty).quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            )
        else:
            price_after = Decimal("0")

        setattr(item, "_centas_price_after_discount", str(price_after))

def _ensure_credit_sign(value, document):
    """Для кредитных SF: если сумма положительная — делаем отрицательной."""
    if not _is_credit_doc(document):
        return value
    if value is None:
        return value
    try:
        from decimal import Decimal
        d = Decimal(str(value))
        return -abs(d) if d > 0 else d
    except Exception:
        return value

def _ensure_credit_abs_price(value, document):
    """Для кредитных SF: цена всегда положительная (abs)."""
    if not _is_credit_doc(document):
        return value
    if value is None:
        return value
    try:
        from decimal import Decimal
        return abs(Decimal(str(value)))
    except Exception:
        return value

def _use_matched_catalog(item) -> bool:
    """Есть ли валидный каталог-матч на строке (и юзер его не отключил)."""
    if getattr(item, "catalog_match_user_override", False):
        return False
    matched_code = (getattr(item, "matched_prekes_kodas", None) or "").strip()
    return bool(matched_code) and matched_code.upper() != "UKN0"


def _resolved_field(item, field_name: str) -> str:
    """
    Если у строки есть валидный каталог-матч — берём matched_ поле.
    Если matched_ поле пустое — fallback на оригинальное.
    """
    if _use_matched_catalog(item):
        matched_val = (getattr(item, f"matched_{field_name}", None) or "").strip()
        if matched_val:
            return matched_val
    return (getattr(item, field_name, None) or "").strip()

# =========================
# PVM Kodas helpers
# =========================

def _get_pvm_kodas_for_item(doc, item, line_map=None, default="") -> str:
    """
    Получает PVM kodas для строки с учётом резолвера и separate_vat.

    Приоритет:
    1. line_map[item.id] - от резолвера (если есть)
    2. item.pvm_kodas - из БД
    3. default - fallback

    ВАЖНО: "Keli skirtingi PVM" - это маркер, не реальный код -> возвращаем default
    """
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
    """
    Получает PVM kodas для документа (sumiskai режим).

    ВАЖНО:
    - При separate_vat=True -> пустой (смешанные ставки)
    - "Keli skirtingi PVM" -> пустой (это маркер, не код)
    """
    separate_vat = bool(getattr(doc, "separate_vat", False))
    scan_type = _s(getattr(doc, "scan_type", "")).lower()

    if separate_vat and scan_type in ("sumiskai", "summary", "suminis"):
        return default

    pvm = _s(getattr(doc, "pvm_kodas", ""))

    if pvm == "Keli skirtingi PVM":
        return default

    return pvm or default


# =========================
# Export: single document
# =========================

def export_document_to_centras_xml(
    document: ScannedDocument,
    orig_path: str = "",
    direction: str | None = None,
    user=None,
    own_company_code=None,
) -> bytes:
    """
    Генерирует XML для одного документа Centas (UTF-8).
    ВАЖНО: если используется multi-view с overrides, передавай direction.
    """
    root = ET.Element('root')
    dok = ET.SubElement(root, 'dokumentas')

    party_prefix, kontrah_tag = _infer_direction(document, direction)
    direction_key = 'pirkimas' if party_prefix == 'seller' else 'pardavimas'

    extra_fields = _get_centas_extra_for_doc(user, document, own_company_code, direction)
    sandelis_value = _s(extra_fields.get(f"{direction_key}_sandelis", ""))
    kastu_centras_value = _s(extra_fields.get(f"{direction_key}_kastu_centras", ""))

    kontrah_name = getattr(document, f"{party_prefix}_name", "") or "NERAPAVADINIMO"
    ET.SubElement(dok, kontrah_tag).text = smart_str(kontrah_name)

    party_code = _resolve_party_code(
        document,
        f"{party_prefix}_id",
        f"{party_prefix}_vat_code",
        f"{party_prefix}_id_programoje",
    )
    ET.SubElement(dok, 'kontrah_kodas').text = party_code

    raw_id = getattr(document, f"{party_prefix}_id", None)
    im_kodas_val = (str(raw_id).strip() if raw_id else "")
    ET.SubElement(dok, 'im_kodas').text = smart_str(im_kodas_val)

    ET.SubElement(dok, 'salis').text = smart_str(getattr(document, f"{party_prefix}_country", "") or "")
    ET.SubElement(dok, 'salis_kodas').text = smart_str((getattr(document, f"{party_prefix}_country_iso", "") or "").upper())
    ET.SubElement(dok, 'adresas').text = smart_str(getattr(document, f"{party_prefix}_address", "") or "")
    ET.SubElement(dok, 'pvm_kodas').text = smart_str(getattr(document, f"{party_prefix}_vat_code", "") or "")
    ET.SubElement(dok, 'as_num').text = smart_str(getattr(document, f"{party_prefix}_iban", "") or "")

    invoice_date = getattr(document, "invoice_date", None) or timezone.now().date()
    due_date = getattr(document, "due_date", None) or invoice_date
    reg_data = getattr(document, "operation_date", None) or invoice_date
    apsk_data = getattr(document, "operation_date", None) or invoice_date

    ET.SubElement(dok, 'data').text = format_date(invoice_date)

    ET.SubElement(dok, 'dok_suma').text = get_price_or_zero(_ensure_credit_sign(getattr(document, "amount_with_vat", None), document))
    ET.SubElement(dok, 'pvm_suma').text = get_price_or_zero(_ensure_credit_sign(getattr(document, "vat_amount", None), document))
    ET.SubElement(dok, 'bepvm_suma').text = get_price_or_zero(_ensure_credit_sign(getattr(document, "amount_wo_vat", None), document))

    currency = (getattr(document, "currency", "") or "EUR").upper()
    ET.SubElement(dok, 'dok_val').text = smart_str(currency)

    series = smart_str(getattr(document, "document_series", "") or "")
    number = smart_str(getattr(document, "document_number", "") or "")
    dok_num = _fallback_doc_num(series, number)
    ET.SubElement(dok, 'dok_num').text = smart_str(dok_num)

    ET.SubElement(dok, 'apmok_iki').text = format_date(due_date)
    ET.SubElement(dok, 'orig_nuoroda').text = smart_str(getattr(document, "preview_url", None) or orig_path or "")
    _isaf = getattr(document, "report_to_isaf", None)
    ET.SubElement(dok, 'isaf').text = "ne" if _isaf is False else "taip"
    ET.SubElement(dok, 'reg_data').text = format_date(reg_data)
    ET.SubElement(dok, 'apsk_data').text = format_date(apsk_data)

    if kontrah_tag == 'pirkejas':
        ET.SubElement(dok, 'savikaina').text = "0"

    if kastu_centras_value:
        ET.SubElement(dok, 'kastu_centras').text = smart_str(kastu_centras_value)

    # --- atsak_asmuo (только pirkimas) ---
    if direction_key == 'pirkimas':
        atsak_asmuo_value = _s(extra_fields.get("pirkimas_atsk_asmuo", ""))
        if atsak_asmuo_value:
            apply_atsak = True
            if user:
                es = getattr(user, 'extra_settings', None) or {}
                if str(es.get("centas_atsak_asmuo_only_cash", "0")).strip() == "1":
                    apply_atsak = bool(getattr(document, "paid_by_cash", False))
            if apply_atsak:
                ET.SubElement(dok, 'atsak_asmuo').text = smart_str(atsak_asmuo_value)

    # --- apmok_budas (только pardavimas, если grynais) ---
    if direction_key == 'pardavimas':
        if bool(getattr(document, "paid_by_cash", False)):
            ET.SubElement(dok, 'apmok_budas').text = "kpo"

    line_items = getattr(document, "line_items", None)
    if line_items and hasattr(line_items, 'all') and line_items.exists():
        line_map = getattr(document, "_pvm_line_map", None)
        items_list = list(line_items.all())
        _distribute_discount_to_centas_lines(document, items_list)

        for item in items_list:
            eilute = ET.SubElement(dok, "eilute")
            code_val = (
                _resolved_field(item, "prekes_kodas")
                or _resolved_field(item, "prekes_barkodas")
                or "PREKES"
            )
            ET.SubElement(eilute, "kodas").text = smart_str(code_val)
            ET.SubElement(eilute, "pavadinimas").text = smart_str(_resolved_field(item, "prekes_pavadinimas") or direction_key.upper())
            ET.SubElement(eilute, "matovnt").text = smart_str(_resolved_field(item, "unit") or "vnt")
            q = getattr(item, "quantity", None)
            q = q if q is not None else 1
            ET.SubElement(eilute, "kiekis").text = _fmt_qty(_ensure_credit_sign(q, document))

            price_to_use = getattr(item, "_centas_price_after_discount", None)
            if price_to_use is None:
                price_to_use = getattr(item, "price", None)
            ET.SubElement(eilute, "kaina").text = get_price_2_or_4(
                _ensure_credit_abs_price(price_to_use, document)
            )

            ET.SubElement(eilute, "pvmtar").text = vat_to_int_str(getattr(item, "vat_percent", None))

            mok_code = _get_pvm_kodas_for_item(document, item, line_map, default="")
            ET.SubElement(eilute, "mok_kodas").text = smart_str(mok_code)

            item_sandelis = (getattr(item, "sandelio_kodas", None) or "").strip()
            if not item_sandelis:
                item_sandelis = sandelis_value
            ET.SubElement(eilute, "sandelis").text = smart_str(item_sandelis) if item_sandelis else ""
    else:
        eilute = ET.SubElement(dok, "eilute")
        code_val = (
            (getattr(document, "prekes_kodas", None) or "").strip()
            or (getattr(document, "prekes_barkodas", None) or "").strip()
            or "PREKES"
        )
        ET.SubElement(eilute, "kodas").text = smart_str(code_val)
        ET.SubElement(eilute, "pavadinimas").text = smart_str(getattr(document, "prekes_pavadinimas", None) or direction_key.upper())
        ET.SubElement(eilute, "matovnt").text = "vnt"
        ET.SubElement(eilute, "kiekis").text = _fmt_qty(_ensure_credit_sign(1, document))
        ET.SubElement(eilute, "kaina").text = get_price_or_zero(_ensure_credit_abs_price(getattr(document, "amount_wo_vat", None), document))
        ET.SubElement(eilute, "pvmtar").text = vat_to_int_str(getattr(document, "vat_percent", None))

        mok_code = _get_pvm_kodas_for_doc(document, default="")
        ET.SubElement(eilute, "mok_kodas").text = smart_str(mok_code)

        doc_sandelis = (getattr(document, "sandelio_kodas", None) or "").strip()
        if not doc_sandelis:
            doc_sandelis = sandelis_value
        ET.SubElement(eilute, "sandelis").text = smart_str(doc_sandelis) if doc_sandelis else ""

    return prettify_with_header(root, encoding="utf-8")


# =========================
# Export: group of documents
# =========================

def export_documents_group_to_centras_xml(
    documents: list[ScannedDocument],
    direction: str | None = None,
    user=None,
    own_company_code=None,
) -> bytes:
    """
    Объединяет несколько документов в один <root> и применяет финальную постобработку.
    """
    root = ET.Element('root')
    for doc in documents:
        xml_bytes = export_document_to_centras_xml(
            doc,
            direction=direction,
            user=user,
            own_company_code=own_company_code,
        )
        doc_tree = ET.fromstring(xml_bytes)
        dokumentas = doc_tree.find('dokumentas')
        if dokumentas is not None:
            root.append(dokumentas)

    pretty_bytes = prettify_with_header(root, encoding="utf-8")
    final_bytes = expand_empty_tags(pretty_bytes)
    return final_bytes

# =========================
# CSV: prekės/paslaugos для Centas
# =========================

_CENTAS_CSV_HEADER = [
    "Kodas", "Pavadinimas", "Mato vnt.", "Savikaina", "Kaina",
    "Pard. kaina PVM", "Barkodas", "Aprašymas", "Debetas", "Kreditas",
    "Pajamos", "KN kodas", "KN mato vnt.", "Brutto", "Netto", "Tūris",
    "Serija", "Užsien. pavad.", "Pagr. prekės grupė", "Tiek. kodas",
    "Min. likutis", "Užs. mato vnt.", "Pirm. pak. 1", "Pirm. pak. 2",
    "Pirm. pak. 3", "Paslauga", "Antkainis, %", "Val. kaina (pirk.)",
    "Val. kaina (pard.)",
]


def _is_paslauga(item, document) -> bool:
    val = _resolved_field(item, "preke_paslauga") if hasattr(item, "matched_preke_paslauga") else (getattr(item, "preke_paslauga", None) or "").strip()
    if not val:
        val = (getattr(document, "preke_paslauga", None) or "").strip()
    try:
        return int(val) == 2
    except (ValueError, TypeError):
        return False


def _calc_price_with_vat(price, vat_percent) -> str:
    """Цена с PVM, литовский формат (запятая)."""
    try:
        p = Decimal(str(price or 0))
        vat = Decimal(str(vat_percent or 0))
        result = (p * (1 + vat / 100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return str(result).replace(".", ",")
    except (InvalidOperation, ValueError, TypeError):
        return "0"


def _fmt_decimal_lt(value, default="0") -> str:
    """Число в литовский формат (запятая)."""
    try:
        d = Decimal(str(value or 0))
        result = d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return str(result).replace(".", ",")
    except (InvalidOperation, ValueError, TypeError):
        return default


def generate_prekes_paslaugos_csv(
    pirkimai_docs: list | None = None,
    pardavimai_docs: list | None = None,
    user=None,
    own_company_code=None,
) -> bytes:
    """
    Генерирует CSV с уникальными prekės/paslaugos для импорта в Centas.
    Один файл для обоих направлений, дедупликация по kodas.

    DK sąskaitos (savikainos/sanaudu/pajamu) — общие, не привязаны к направлению.
    Prekės grupė — берётся из extra fields по направлению.

    Суммы:
      - pirkimai: Savikaina = price (закупочная)
      - pardavimai: Kaina = price (продажная be PVM), Pard. kaina PVM = с PVM
      - sumiskai (нет line_items): берём из документа

    Returns:
        bytes в кодировке Windows-1257, разделитель `;`, CRLF.
        Пустой bytes если нет продуктов.
    """
    seen: dict[str, dict] = {}  # kodas -> row dict

    def _base_row(kodas, pavadinimas, unit, barkodas, paslauga_flag, extra):
        return {
            "Kodas": kodas,
            "Pavadinimas": pavadinimas,
            "Mato vnt.": unit,
            "Savikaina": "0",
            "Kaina": "0",
            "Pard. kaina PVM": "0",
            "Barkodas": barkodas,
            "Aprašymas": pavadinimas,
            "Debetas": _s(extra.get("savikainos_saskaita", "")),
            "Kreditas": _s(extra.get("sanaudu_saskaita", "")),
            "Pajamos": _s(extra.get("pajamu_saskaita", "")),
            "KN kodas": "",
            "KN mato vnt.": "",
            "Brutto": "0",
            "Netto": "0",
            "Tūris": "0",
            "Serija": "",
            "Užsien. pavad.": "",
            "Pagr. prekės grupė": "",
            "Tiek. kodas": "",
            "Min. likutis": "0",
            "Užs. mato vnt.": "",
            "Pirm. pak. 1": "0",
            "Pirm. pak. 2": "0",
            "Pirm. pak. 3": "0",
            "Paslauga": paslauga_flag,
            "Antkainis, %": "0",
            "Val. kaina (pirk.)": "0",
            "Val. kaina (pard.)": "0",
        }

    def _resolve_kodas_from_item(item, doc):
        return smart_str(
            _resolved_field(item, "prekes_kodas")
            or _resolved_field(item, "prekes_barkodas")
            or (getattr(doc, "prekes_kodas", None) or "").strip()
            or (getattr(doc, "prekes_barkodas", None) or "").strip()
            or f"neraPrekesKodo{random.randint(0, 9999):04d}"
        )

    def _resolve_kodas_from_doc(doc):
        """
        Код товара для документа (sumiskai).
        doc.prekes_kodas → doc.prekes_barkodas →
        neraPrekesKodo + 4 случайные цифры.
        """
        return smart_str(
            (getattr(doc, "prekes_kodas", None) or "").strip()
            or (getattr(doc, "prekes_barkodas", None) or "").strip()
            or f"neraPrekesKodo{random.randint(0, 9999):04d}"
        )

    def _has_line_items(doc):
        li = getattr(doc, "line_items", None)
        return li and hasattr(li, "all") and li.exists()

    # ── Pirkimai ──
    for document in (pirkimai_docs or []):
        extra = _get_centas_extra_for_doc(user, document, own_company_code, "pirkimas")
        prekes_grupe = _s(extra.get("pirkimas_prekes_grupe", ""))

        if _has_line_items(document):
            for item in document.line_items.all():
                kodas = _resolve_kodas_from_item(item, document)
                if kodas in seen:
                    row = seen[kodas]
                    if row["Savikaina"] == "0":
                        row["Savikaina"] = _fmt_decimal_lt(getattr(item, "price", None))
                    if not row["Pagr. prekės grupė"]:
                        row["Pagr. prekės grupė"] = prekes_grupe
                    continue

                row = _base_row(
                    kodas,
                    _resolved_field(item, "prekes_pavadinimas") or "PIRKIMAS",
                    _resolved_field(item, "unit") or "vnt",
                    _resolved_field(item, "prekes_barkodas"),
                    "T" if _is_paslauga(item, document) else "N",
                    extra,
                )
                row["Savikaina"] = _fmt_decimal_lt(getattr(item, "price", None))
                row["Pagr. prekės grupė"] = prekes_grupe
                seen[kodas] = row
        else:
            # sumiskai
            kodas = _resolve_kodas_from_doc(document)
            if kodas not in seen:
                row = _base_row(
                    kodas,
                    _s(getattr(document, "prekes_pavadinimas", None)) or "PIRKIMAS",
                    "vnt",
                    _s(getattr(document, "prekes_barkodas", None)),
                    "T" if _is_paslauga(document, document) else "N",
                    extra,
                )
                row["Savikaina"] = _fmt_decimal_lt(getattr(document, "amount_wo_vat", None))
                row["Pagr. prekės grupė"] = prekes_grupe
                seen[kodas] = row

    # ── Pardavimai ──
    for document in (pardavimai_docs or []):
        extra = _get_centas_extra_for_doc(user, document, own_company_code, "pardavimas")
        prekes_grupe = _s(extra.get("pardavimas_prekes_grupe", ""))

        if _has_line_items(document):
            for item in document.line_items.all():
                kodas = _resolve_kodas_from_item(item, document)
                price = getattr(item, "price", None) or 0
                vat_pct = getattr(item, "vat_percent", None) or 0

                if kodas in seen:
                    row = seen[kodas]
                    if row["Kaina"] == "0":
                        row["Kaina"] = _fmt_decimal_lt(price)
                        row["Pard. kaina PVM"] = _calc_price_with_vat(price, vat_pct)
                    if not row["Pagr. prekės grupė"]:
                        row["Pagr. prekės grupė"] = prekes_grupe
                    continue

                row = _base_row(
                    kodas,
                    _resolved_field(item, "prekes_pavadinimas") or "PARDAVIMAS",
                    _resolved_field(item, "unit") or "vnt",
                    _resolved_field(item, "prekes_barkodas"),
                    "T" if _is_paslauga(item, document) else "N",
                    extra,
                )
                row["Kaina"] = _fmt_decimal_lt(price)
                row["Pard. kaina PVM"] = _calc_price_with_vat(price, vat_pct)
                row["Pagr. prekės grupė"] = prekes_grupe
                seen[kodas] = row
        else:
            # sumiskai
            kodas = _resolve_kodas_from_doc(document)
            price = getattr(document, "amount_wo_vat", None) or 0
            vat_pct = getattr(document, "vat_percent", None) or 0

            if kodas in seen:
                row = seen[kodas]
                if row["Kaina"] == "0":
                    row["Kaina"] = _fmt_decimal_lt(price)
                    row["Pard. kaina PVM"] = _calc_price_with_vat(price, vat_pct)
                if not row["Pagr. prekės grupė"]:
                    row["Pagr. prekės grupė"] = prekes_grupe
            else:
                row = _base_row(
                    kodas,
                    _s(getattr(document, "prekes_pavadinimas", None)) or "PARDAVIMAS",
                    "vnt",
                    _s(getattr(document, "prekes_barkodas", None)),
                    "T" if _is_paslauga(document, document) else "N",
                    extra,
                )
                row["Kaina"] = _fmt_decimal_lt(price)
                row["Pard. kaina PVM"] = _calc_price_with_vat(price, vat_pct)
                row["Pagr. prekės grupė"] = prekes_grupe
                seen[kodas] = row

    if not seen:
        return b""

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=_CENTAS_CSV_HEADER,
        delimiter=";",
        lineterminator="\r\n",
        quoting=csv.QUOTE_MINIMAL,
    )
    writer.writeheader()
    for row in seen.values():
        writer.writerow(row)

    return buf.getvalue().encode("cp1257", errors="replace")


# =========================
# CSV: pradiniai likučiai для Centas
# =========================

_CENTAS_LIKUCIAI_HEADER = [
    "Kodas", "Pavadinimas", "Matas", "Kiekis", "Kaina",
    "Kitos išl.", "Savikaina", "Suma", "Antkainis", "Pard. kaina",
    "Tipas", "PVM tar.", "PVM suma", "Debetas", "Valst. Nr",
    "Užsakymas", "Užsak. tiek.", "Pirk.kaina PVM", "Aprašymas",
    "KN kodas", "Kilmės šalis", "Tinka vart.", "PVM nuo maržos",
    "Kaštų centras", "PVM Kodas", "Prekės serija",
    "Neatsk.PVM suma", "Kita PVM sąsk.(D)", "Autom. markė",
]


def generate_pradiniai_likuciai_csv(
    pardavimai_docs: list | None = None,
    user=None,
    own_company_code=None,
) -> bytes:
    """
    Генерирует CSV с начальными остатками для импорта в Centas
    через «Įkelti pradinius likučius iš CSV rinkmenos».

    Только для prekės (Paslauga=N) из pardavimai —
    paslaugos не требуют складского учёта.

    Количество = сумма kiekis по всем pardavimai документам для каждого kodas.

    Returns:
        bytes в кодировке Windows-1257, разделитель `;`, CRLF.
        Пустой bytes если нет prekės.
    """
    if not pardavimai_docs:
        return b""

    # kodas -> {pavadinimas, matovnt, kiekis, kaina}
    seen: dict[str, dict] = {}

    def _resolve_kodas_from_item(item, doc):
        return smart_str(
            _resolved_field(item, "prekes_kodas")
            or _resolved_field(item, "prekes_barkodas")
            or (getattr(doc, "prekes_kodas", None) or "").strip()
            or (getattr(doc, "prekes_barkodas", None) or "").strip()
            or f"neraPrekesKodo{random.randint(0, 9999):04d}"
        )

    def _resolve_kodas_from_doc(doc):
        return smart_str(
            (getattr(doc, "prekes_kodas", None) or "").strip()
            or (getattr(doc, "prekes_barkodas", None) or "").strip()
            or f"neraPrekesKodo{random.randint(0, 9999):04d}"
        )

    def _has_line_items(doc):
        li = getattr(doc, "line_items", None)
        return li and hasattr(li, "all") and li.exists()

    for document in pardavimai_docs:
        if _has_line_items(document):
            for item in document.line_items.all():
                # Пропускаем paslaugos — им склад не нужен
                if _is_paslauga(item, document):
                    continue

                kodas = _resolve_kodas_from_item(item, document)
                qty = getattr(item, "quantity", None)
                try:
                    qty = float(qty) if qty is not None else 1.0
                except (ValueError, TypeError):
                    qty = 1.0
                price = getattr(item, "price", None) or 0

                if kodas in seen:
                    seen[kodas]["kiekis"] += qty
                else:
                    seen[kodas] = {
                        "pavadinimas": _resolved_field(item, "prekes_pavadinimas") or "PARDAVIMAS",
                        "matovnt": _resolved_field(item, "unit") or "vnt",
                        "kiekis": qty,
                        "kaina": price,
                    }
        else:
            # sumiskai — пропускаем paslaugos
            if _is_paslauga(document, document):
                continue

            kodas = _resolve_kodas_from_doc(document)
            price = getattr(document, "amount_wo_vat", None) or 0

            if kodas in seen:
                seen[kodas]["kiekis"] += 1.0
            else:
                seen[kodas] = {
                    "pavadinimas": _s(getattr(document, "prekes_pavadinimas", None)) or "PARDAVIMAS",
                    "matovnt": "vnt",
                    "kiekis": 1.0,
                    "kaina": price,
                }

    if not seen:
        return b""

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=_CENTAS_LIKUCIAI_HEADER,
        delimiter=";",
        lineterminator="\r\n",
        quoting=csv.QUOTE_MINIMAL,
    )
    writer.writeheader()

    for kodas, p in seen.items():
        row = {h: "" for h in _CENTAS_LIKUCIAI_HEADER}
        row["Kodas"] = kodas
        row["Pavadinimas"] = p["pavadinimas"]
        row["Matas"] = p["matovnt"]
        row["Kiekis"] = _fmt_decimal_lt(p["kiekis"])
        row["Kaina"] = _fmt_decimal_lt(p["kaina"])
        writer.writerow(row)

    return buf.getvalue().encode("cp1257", errors="replace")


