from __future__ import annotations

import xml.etree.ElementTree as ET
from xml.dom import minidom
from django.utils.encoding import smart_str
from django.db import models, transaction
import random
from decimal import Decimal, InvalidOperation

from .formatters import format_date, get_price_or_zero, expand_empty_tags

FNS = {"xsi": "http://www.w3.org/2001/XMLSchema-instance"}


# =========================
# Helpers: строки/нормализация
# =========================
def _s(v) -> str:
    """Строка без None, с trim."""
    return str(v).strip() if v is not None else ""

def _upper(v) -> str:
    return _s(v).upper()

def _gen_random_kodas() -> str:
    """NERAPREKESKODO + 4 цифры, ВСЕГДА UPPERCASE."""
    return f"NERAPREKESKODO{random.randint(0, 9999):04d}"


def _d(v, default: Decimal = Decimal("0")) -> Decimal:
    """Безопасное Decimal."""
    try:
        if v is None or v == "":
            return default
        if isinstance(v, Decimal):
            return v
        return Decimal(str(v).replace(",", "."))
    except (InvalidOperation, ValueError):
        return default


def normalize_tip_lineitem(value) -> str:
    """
    Для line item: 'preke' → '1', 'paslauga' → '2', иначе '1'.
    """
    s = _s(value).lower()
    if s in ("preke", "prekė", "prekes", "prekės"):
        return "1"
    if s in ("paslauga", "paslaugos"):
        return "2"
    return "1"


def normalize_tip_doc(value) -> str:
    """
    Для документа (когда нет строк):
      1→'1', 2→'2', 3→'1', 4→'2'. Строковые цифры/слова тоже поддерживаются.
    """
    s = _s(value)
    if not s:
        return "1"
    try:
        n = int(float(s.replace(",", ".")))
        if n == 1:
            return "1"
        if n == 2:
            return "2"
        if n == 3:
            return "1"
        if n == 4:
            return "2"
        return "1"
    except Exception:
        low = s.lower()
        if low in ("preke", "prekė", "prekes", "prekės"):
            return "1"
        if low in ("paslauga", "paslaugos"):
            return "2"
        return "1"


def get_party_code(doc, *, id_field: str, vat_field: str, id_programoje_field: str) -> str:
    """
    Код стороны по приоритету: *_id → *_vat_code → *_id_programoje. Без рандома.
    Если ничего нет — вернёт пустую строку (дальше решим, чем подменять).
    """
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


def _fallback_doc_num(series: str, number: str) -> tuple[str, str]:
    """
    Finvalda хранит <serija> и <dokumentas> раздельно.
    Правила:
      - оба пустые → serija='' , dokumentas='NERANUMERIO#####'
      - есть series, но НЕТ number → serija=series , dokumentas='NERANUMERIO#####'
      - НЕТ series, но есть number → serija='' , dokumentas=number
      - оба есть → serija=series , dokumentas=number
    """
    s = _s(series)
    n = _s(number)
    if not s and not n:
        return "", f"NERANUMERIO{random.randint(0, 99999):05d}"
    if s and not n:
        return s, f"NERANUMERIO{random.randint(0, 99999):05d}"
    if n and not s:
        return "", n
    return s, n


# =========================
# XML helpers
# =========================
def _pretty_bytes(elem: ET.Element) -> bytes:
    rough = ET.tostring(elem, encoding="utf-8")
    parsed = minidom.parseString(rough)
    xml = parsed.toprettyxml(indent=" ", encoding="utf-8")
    lines = [l for l in xml.decode("utf-8").split("\n") if l.strip()]
    return "\n".join(lines).encode("utf-8")


def _root() -> ET.Element:
    """Создаёт корневой <fvsdata> с обязательными секциями в порядке: klientai → prekes → paslaugos → operacijos."""
    root = ET.Element("fvsdata", {"xmlns:xsi": FNS["xsi"]})
    ET.SubElement(root, "klientai")
    ET.SubElement(root, "prekes")
    ET.SubElement(root, "paslaugos")
    ET.SubElement(root, "operacijos")
    return root


def _ensure_client(
    root: ET.Element,
    *,
    code: str,
    name: str,
    address: str = "",
    iban: str = "",
    country_iso: str = "LT",
):
    """
    Добавляет клиента в <klientai>, если его ещё нет (по коду).
    Если code пустой — подставляем 'neraimoneskodo'.
    """
    klientai = root.find("klientai")
    assert klientai is not None

    code = _s(code) or "neraimoneskodo"
    for k in klientai.findall("klientas"):
        k_code = (k.findtext("kodas") or "").strip()
        if k_code == code:
            return

    klientas = ET.SubElement(klientai, "klientas")
    ET.SubElement(klientas, "kodas").text = code
    ET.SubElement(klientas, "pavadinimas").text = smart_str(_s(name))
    ET.SubElement(klientas, "adresas").text = smart_str(_s(address))
    ET.SubElement(klientas, "banko_sas").text = smart_str(_s(iban))
    ET.SubElement(klientas, "im_kodas").text = code
    ET.SubElement(klientas, "salis_kodas").text = smart_str((_s(country_iso) or "LT"))


# ===== Stable code persistence (write once into item's/doc's prekes_kodas) =====

def _get_or_persist_kodas_from_obj(obj) -> str:
    """Возвращает UPPER-код позиции.
    Логика:
    - если obj.prekes_kodas есть → вернуть его (UPPER);
    - иначе если НЕТ ни prekes_kodas, ни prekes_barkodas → сгенерировать NERAPREKESKODO####,
      записать его в obj.prekes_kodas (save update_fields=["prekes_kodas"]) и вернуть;
    - иначе (есть только barkodas) → вернуть barkodas (UPPER), ничего не писать.
    Любые ошибки сохранения — игнорируем (но пытаемся сохранить один раз).
    """
    pk = _s(getattr(obj, "prekes_kodas", None))
    if pk:
        return pk.upper()
    bk = _s(getattr(obj, "prekes_barkodas", None))
    if not bk:
        code = _gen_random_kodas()
        try:
            setattr(obj, "prekes_kodas", code.upper())
            save = getattr(obj, "save", None)
            if callable(save):
                obj.save(update_fields=["prekes_kodas"])  # may raise; ok
        except Exception:
            pass
        return code.upper()
    return bk.upper()

# ===== PREKĖS / PASLAUGOS registry =====

def _ensure_preke(
    root: ET.Element,
    *,
    kodas: str,
    bar_kodas: str = "",
    pavadinimas: str = "",
    kaina1: str | Decimal | float | int = "",
    valiuta: str = "EUR",
    mat_kodas: str = "VNT",
    aktyvi: str = "1",
    sandelis: str = "",
):
    prekes = root.find("prekes")
    assert prekes is not None
    kodas = _upper(kodas) or _gen_random_kodas()
    for p in prekes.findall("preke"):
        if (p.findtext("kodas") or "").strip().upper() == kodas:
            return
    preke = ET.SubElement(prekes, "preke")
    ET.SubElement(preke, "kodas").text = smart_str(kodas)
    if _s(bar_kodas):
        ET.SubElement(preke, "bar_kodas").text = smart_str(_upper(bar_kodas))
    ET.SubElement(preke, "pavadinimas").text = smart_str(_s(pavadinimas) or kodas)
    if kaina1 != "":
        ET.SubElement(preke, "kaina1").text = get_price_or_zero(kaina1)
    ET.SubElement(preke, "valiuta").text = _upper(valiuta) or "EUR"
    ET.SubElement(preke, "aktyvi").text = _s(aktyvi) or "1"
    ET.SubElement(preke, "mat_kodas").text = _upper(mat_kodas) or "VNT"
    if _s(sandelis):
        ET.SubElement(preke, "sandelis").text = _upper(sandelis)


def _ensure_paslauga(
    root: ET.Element,
    *,
    kodas: str,
    bar_kodas: str = "",
    pavadinimas: str = "",
    kaina1: str | Decimal | float | int = "",
    valiuta: str = "EUR",
    mat_kodas: str = "VNT",
    aktyvi: str = "1",
):
    paslaugos = root.find("paslaugos")
    assert paslaugos is not None
    kodas = _upper(kodas) or _gen_random_kodas()
    for p in paslaugos.findall("paslauga"):
        if (p.findtext("kodas") or "").strip().upper() == kodas:
            return
    ps = ET.SubElement(paslaugos, "paslauga")
    ET.SubElement(ps, "kodas").text = smart_str(kodas)
    if _s(bar_kodas):
        ET.SubElement(ps, "bar_kodas").text = smart_str(_upper(bar_kodas))
    ET.SubElement(ps, "pavadinimas").text = smart_str(_s(pavadinimas) or kodas)
    if kaina1 != "":
        ET.SubElement(ps, "kaina1").text = get_price_or_zero(kaina1)
    ET.SubElement(ps, "valiuta").text = _upper(valiuta) or "EUR"
    ET.SubElement(ps, "aktyvi").text = _s(aktyvi) or "1"
    ET.SubElement(ps, "mat_kodas").text = _upper(mat_kodas) or "VNT"


def _ensure_catalog_entry_from_item(root: ET.Element, *, item, currency: str):
    """Обеспечивает запись в реестры: если товар — в <prekes>, если услуга — в <paslaugos>.
    Код: сохраняем один раз в item.prekes_kodas при его отсутствии и отсутствии barkodas.
    """
    tipas = normalize_tip_lineitem(getattr(item, "preke_paslauga", None))
    kodas = _get_or_persist_kodas_from_obj(item)
    bar = _upper(getattr(item, "prekes_barkodas", None)) if _s(getattr(item, "prekes_barkodas", None)) else ""
    name = _s(getattr(item, "prekes_pavadinimas", None)) or kodas

    qty = _d(getattr(item, "quantity", None), Decimal("1"))
    subtotal = _d(getattr(item, "subtotal", None))
    unit_price = subtotal / qty if qty != 0 else Decimal("0")

    explicit_price = getattr(item, "unit_price", None)
    if explicit_price not in (None, ""):
        try:
            unit_price = _d(explicit_price)
        except Exception:
            pass

    mat_kodas = _upper(getattr(item, "mat_kodas", None) or "VNT")
    sandelis = _upper(getattr(item, "sandelio_kodas", None) or "")

    if tipas == "2":
        # Услуга — без <sandelis>
        _ensure_paslauga(
            root,
            kodas=kodas,
            bar_kodas=bar,
            pavadinimas=name,
            kaina1=unit_price,
            valiuta=_upper(currency),
            mat_kodas=mat_kodas,
            aktyvi="1",
        )
    else:
        # Товар — с <sandelis> при наличии
        _ensure_preke(
            root,
            kodas=kodas,
            bar_kodas=bar,
            pavadinimas=name,
            kaina1=unit_price,
            valiuta=_upper(currency),
            mat_kodas=mat_kodas,
            aktyvi="1",
            sandelis=sandelis,
        )


# =========================
# Строки документов
# =========================

def _fill_line(
    parent: ET.Element,
    *,
    is_purchase: bool,  # зарезервировано
    line_obj=None,
    currency: str = "EUR",
    fallback_amount_wo_vat=None,
    fallback_vat_amount=None,
    fallback_name: str = "",
    pvm_kodas_value=None,
    fallback_tip_doc=None,  # тип с уровня документа при отсутствии строк
    sandelio_kodas_value: str = "",
    summary_kodas: str = "",
    fallback_vat_percent=None,  # <— НОВОЕ: для суммарного режима
):
    """
    Добавляет <eilute> в <operacijaDet>.

    - <tipas> (1/2):
        * если есть line_obj → normalize_tip_lineitem(line_obj.preke_paslauga)
        * если line_obj нет → normalize_tip_doc(fallback_tip_doc)
    - <kodas> = из БД (если нет своего), иначе NERAPREKESKODO####
    - <kiekis pirmas_mat="true"> = quantity (по умолчанию 1.00)
    - <sandelis> = item.sandelio_kodas (детально) или sandelio_kodas_value (суммарно)
    - суммы: EUR → заполняем и *_v, и *_l одинаково; не-EUR → только *_v
    - <pvm_proc> = item.vat_percent (детально) или doc.vat_percent (суммарно)
    - <pvm_kodas> = pvm_kodas_value (multi) → line_obj.pvm_kodas (single) → ""
    """
    eilute = ET.SubElement(parent, "eilute")

    # tipas (1/2 товар/услуга)
    if line_obj is not None:
        tipas_val = normalize_tip_lineitem(getattr(line_obj, "preke_paslauga", None))
    else:
        tipas_val = normalize_tip_doc(fallback_tip_doc)
    ET.SubElement(eilute, "tipas").text = tipas_val

    # kodas (persist once into obj.prekes_kodas if both empty)
    if line_obj is not None:
        kodas_val = _get_or_persist_kodas_from_obj(line_obj)
    else:
        # суммарный режим: код берём/сохраняем на уровне doc и сюда передаём
        kodas_val = _s(summary_kodas) or _gen_random_kodas()
    ET.SubElement(eilute, "kodas").text = smart_str(kodas_val.upper())

    # kiekis
    qty = getattr(line_obj, "quantity", None) if line_obj is not None else None
    if qty is None or qty == "":
        qty = 1
    ET.SubElement(eilute, "kiekis", {"pirmas_mat": "true"}).text = f"{float(qty):.2f}"

    # sandelis (from item if detailed; from doc if summary)
    sandelio_kodas = _s(getattr(line_obj, "sandelio_kodas", None)) if line_obj is not None else _s(sandelio_kodas_value)
    if sandelio_kodas:
        ET.SubElement(eilute, "sandelis").text = _upper(sandelio_kodas)

    # pavadinimas
    name = getattr(line_obj, "prekes_pavadinimas", None) if line_obj is not None else None
    ET.SubElement(eilute, "pavadinimas").text = smart_str(_s(name) or _s(fallback_name))

    # суммы
    if line_obj is not None:
        subtotal = getattr(line_obj, "subtotal", None)
        vat_amount = getattr(line_obj, "vat", None)
    else:
        subtotal = fallback_amount_wo_vat
        vat_amount = fallback_vat_amount

    cur = (_s(currency) or "EUR").upper()
    if cur == "EUR":
        # EUR: заполняем и *_v, и *_l одинаковыми значениями
        val_sub = get_price_or_zero(subtotal)
        val_vat = get_price_or_zero(vat_amount)
        ET.SubElement(eilute, "suma_v").text = val_sub
        ET.SubElement(eilute, "suma_l").text = val_sub
        ET.SubElement(eilute, "suma_pvmv").text = val_vat
        ET.SubElement(eilute, "suma_pvml").text = val_vat
    else:
        # не EUR: только *_v и *_pvmv; *_l и *_pvml = 0
        ET.SubElement(eilute, "suma_v").text = get_price_or_zero(subtotal)
        ET.SubElement(eilute, "suma_l").text = "0"
        ET.SubElement(eilute, "suma_pvmv").text = get_price_or_zero(vat_amount)
        ET.SubElement(eilute, "suma_pvml").text = "0"

    # pvm_proc
    if line_obj is not None:
        raw_vat_percent = getattr(line_obj, "vat_percent", None)
    else:
        raw_vat_percent = fallback_vat_percent

    if raw_vat_percent in (None, ""):
        pvm_proc_text = "0.00"
    else:
        try:
            pvm_proc_text = f"{float(raw_vat_percent):.2f}"
        except Exception:
            pvm_proc_text = "0.00"
    ET.SubElement(eilute, "pvm_proc").text = pvm_proc_text

    # pvm_kodas
    if pvm_kodas_value is None:
        pvm_kodas_value = getattr(line_obj, "pvm_kodas", None) if line_obj is not None else ""
    ET.SubElement(eilute, "pvm_kodas").text = smart_str(_s(pvm_kodas_value))


# =========================================================
# Pirkimai
# =========================================================

def export_pirkimai_group_to_finvalda(documents):
    """Экспорт ПРИОБРЕТЕНИЙ (pirkimas) в формат Finvalda. Возвращает bytes.
    Формат: <fvsdata><klientai/><prekes/><paslaugos/><operacijos>...</operacijos></fvsdata>"""
    root = _root()
    operacijos = root.find("operacijos")
    assert operacijos is not None

    for doc in documents:
        currency = _s(getattr(doc, "currency", "EUR") or "EUR").upper()
        series_raw = smart_str(getattr(doc, "document_series", "") or "")
        number_raw = smart_str(getattr(doc, "document_number", "") or "")
        serija, dokumentas = _fallback_doc_num(series_raw, number_raw)

        invoice_date = getattr(doc, "invoice_date", None)
        op_date = getattr(doc, "operation_date", None)
        payment_date = op_date or invoice_date

        # seller: id -> vat -> id_programoje
        seller_code = get_party_code(
            doc,
            id_field="seller_id",
            vat_field="seller_vat_code",
            id_programoje_field="seller_id_programoje",
        )
        seller_name = _s(getattr(doc, "seller_name", ""))
        seller_addr = _s(getattr(doc, "seller_address", ""))
        seller_iban = _s(getattr(doc, "seller_iban", ""))
        seller_country = _s(getattr(doc, "seller_country_iso", "") or "LT")

        _ensure_client(
            root,
            code=seller_code,
            name=seller_name or "No Supplier",
            address=seller_addr,
            iban=seller_iban,
            country_iso=seller_country,
        )

        pirkimas = ET.SubElement(operacijos, "pirkimas")
        ET.SubElement(pirkimas, "serija").text = serija
        ET.SubElement(pirkimas, "dokumentas").text = dokumentas
        ET.SubElement(pirkimas, "data").text = format_date(invoice_date)
        ET.SubElement(pirkimas, "valiuta").text = currency
        ET.SubElement(pirkimas, "mokejimo_data").text = format_date(payment_date)
        ET.SubElement(pirkimas, "reg_data").text = format_date(invoice_date)
        ET.SubElement(pirkimas, "dokumento_data").text = format_date(invoice_date)

        k = ET.SubElement(pirkimas, "klientas", {"kodo_tipas": "im_kodas"})
        k.text = _s(seller_code) or "neraimoneskodo"

        ET.SubElement(pirkimas, "pastaba").text = smart_str(_s(getattr(doc, "preview_url", "")))
        ET.SubElement(pirkimas, "imp_param").text = "VA"
        ET.SubElement(pirkimas, "padalinys").text = "PP"

        # Doc-level extra tags (always from doc)
        if _s(getattr(doc, "zurnalo_kodas", None)):
            ET.SubElement(pirkimas, "zurnalas").text = _upper(getattr(doc, "zurnalo_kodas", ""))
        if _s(getattr(doc, "tipo_kodas", None)):
            ET.SubElement(pirkimas, "tipas").text = _upper(getattr(doc, "tipo_kodas", ""))
        if _s(getattr(doc, "padalinio_kodas", None)):
            ET.SubElement(pirkimas, "padalinys").text = _upper(getattr(doc, "padalinio_kodas", ""))
        if _s(getattr(doc, "atsakingo_asmens_kodas", None)):
            ET.SubElement(pirkimas, "darbuotojas").text = _upper(getattr(doc, "atsakingo_asmens_kodas", ""))

        det = ET.SubElement(pirkimas, "operacijaDet")

        # multi/single источник pvm кодов по строкам
        line_map = getattr(doc, "_pvm_line_map", None)

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            for item in line_items.all():
                # Реестр prekes/paslaugos
                _ensure_catalog_entry_from_item(root, item=item, currency=currency)

                code = (line_map or {}).get(getattr(item, "id", None)) if line_map is not None else getattr(item, "pvm_kodas", None)

                _fill_line(
                    det,
                    is_purchase=True,
                    line_obj=item,
                    currency=currency,
                    pvm_kodas_value=code,
                    sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
                )
        else:
            # синтетическая строка
            _fill_line(
                det,
                is_purchase=False,
                line_obj=None,
                currency=currency,
                fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
                fallback_vat_amount=getattr(doc, "vat_amount", None),
                fallback_name=_s(getattr(doc, "prekes_pavadinimas", "")),
                pvm_kodas_value=getattr(doc, "pvm_kodas", None),
                fallback_tip_doc=getattr(doc, "preke_paslauga", None),
                sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
                summary_kodas=_get_or_persist_kodas_from_obj(doc),
                fallback_vat_percent=getattr(doc, "vat_percent", None),  # <— добавлено
            )

    xml_bytes = _pretty_bytes(root)
    return expand_empty_tags(xml_bytes)


# =========================================================
# Pardavimai
# =========================================================

def export_pardavimai_group_to_finvalda(documents):
    """Экспорт ПРОДАЖ (pardavimas) в формат Finvalda. Возвращает bytes.
    Формат: <fvsdata><klientai/><prekes/><paslaugos/><operacijos>...</operacijos></fvsdata>"""
    root = _root()
    operacijos = root.find("operacijos")
    assert operacijos is not None

    for doc in documents:
        currency = _s(getattr(doc, "currency", "EUR") or "EUR").upper()
        series_raw = smart_str(getattr(doc, "document_series", "") or "")
        number_raw = smart_str(getattr(doc, "document_number", "") or "")
        serija, dokumentas = _fallback_doc_num(series_raw, number_raw)

        invoice_date = getattr(doc, "invoice_date", None)
        op_date = getattr(doc, "operation_date", None)
        payment_date = op_date or invoice_date

        # buyer: id -> vat -> id_programoje
        buyer_code = get_party_code(
            doc,
            id_field="buyer_id",
            vat_field="buyer_vat_code",
            id_programoje_field="buyer_id_programoje",
        )
        buyer_name = _s(getattr(doc, "buyer_name", "") or "No Buyer")
        buyer_addr = _s(getattr(doc, "buyer_address", "") or "")
        buyer_iban = _s(getattr(doc, "buyer_iban", ""))
        buyer_country = _s(getattr(doc, "buyer_country_iso", "") or "")

        _ensure_client(
            root,
            code=buyer_code,
            name=buyer_name,
            address=buyer_addr,
            iban=buyer_iban,
            country_iso=buyer_country,
        )

        pard = ET.SubElement(operacijos, "pardavimas")
        ET.SubElement(pard, "serija").text = serija
        ET.SubElement(pard, "dokumentas").text = dokumentas

        k = ET.SubElement(pard, "klientas", {"kodo_tipas": "im_kodas"})
        k.text = _s(buyer_code) or "neraimoneskodo"

        ET.SubElement(pard, "data").text = format_date(invoice_date)
        ET.SubElement(pard, "valiuta").text = currency
        ET.SubElement(pard, "mokejimo_data").text = format_date(payment_date)
        ET.SubElement(pard, "pastaba").text = smart_str(_s(getattr(doc, "preview_url", "")))
        ET.SubElement(pard, "imp_param").text = "VA"
        ET.SubElement(pard, "padalinys").text = "PP"

        # Doc-level extra tags (always from doc)
        if _s(getattr(doc, "zurnalo_kodas", None)):
            ET.SubElement(pard, "zurnalas").text = _upper(getattr(doc, "zurnalo_kodas", ""))
        if _s(getattr(doc, "tipo_kodas", None)):
            ET.SubElement(pard, "tipas").text = _upper(getattr(doc, "tipo_kodas", ""))
        if _s(getattr(doc, "padalinio_kodas", None)):
            ET.SubElement(pard, "padalinys").text = _upper(getattr(doc, "padalinio_kodas", ""))
        if _s(getattr(doc, "atsakingo_asmens_kodas", None)):
            ET.SubElement(pard, "darbuotojas").text = _upper(getattr(doc, "atsakingo_asmens_kodas", ""))

        det = ET.SubElement(pard, "operacijaDet")

        # multi/single источник pvm кодов по строкам
        line_map = getattr(doc, "_pvm_line_map", None)

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, "all") and line_items.exists():
            for item in line_items.all():
                # Реестр prekes/paslaugos
                _ensure_catalog_entry_from_item(root, item=item, currency=currency)

                code = (line_map or {}).get(getattr(item, "id", None)) if line_map is not None else getattr(item, "pvm_kodas", None)

                _fill_line(
                    det,
                    is_purchase=False,
                    line_obj=item,
                    currency=currency,
                    pvm_kodas_value=code,
                    sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
                )
        else:
            _fill_line(
                det,
                is_purchase=False,
                line_obj=None,
                currency=currency,
                fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
                fallback_vat_amount=getattr(doc, "vat_amount", None),
                fallback_name=_s(getattr(doc, "prekes_pavadinimas", "")),
                pvm_kodas_value=getattr(doc, "pvm_kodas", None),
                fallback_tip_doc=getattr(doc, "preke_paslauga", None),
                sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
                # summary_kodas опционален; если хочешь — можно передать как в pirkimai
                fallback_vat_percent=getattr(doc, "vat_percent", None),  # <— добавлено
            )

    xml_bytes = _pretty_bytes(root)
    return expand_empty_tags(xml_bytes)




# from __future__ import annotations

# import xml.etree.ElementTree as ET
# from xml.dom import minidom
# from django.utils.encoding import smart_str
# from django.db import models, transaction
# import random
# from decimal import Decimal, InvalidOperation

# from .formatters import format_date, get_price_or_zero, expand_empty_tags

# FNS = {"xsi": "http://www.w3.org/2001/XMLSchema-instance"}


# # =========================
# # Helpers: строки/нормализация
# # =========================
# def _s(v) -> str:
#     """Строка без None, с trim."""
#     return str(v).strip() if v is not None else ""

# def _upper(v) -> str:
#     return _s(v).upper()

# def _gen_random_kodas() -> str:
#     """NERAPREKESKODO + 4 цифры, ВСЕГДА UPPERCASE."""
#     return f"NERAPREKESKODO{random.randint(0, 9999):04d}"


# def _d(v, default: Decimal = Decimal("0")) -> Decimal:
#     """Безопасное Decimal."""
#     try:
#         if v is None or v == "":
#             return default
#         if isinstance(v, Decimal):
#             return v
#         return Decimal(str(v).replace(",", "."))
#     except (InvalidOperation, ValueError):
#         return default


# def normalize_tip_lineitem(value) -> str:
#     """
#     Для line item: 'preke' → '1', 'paslauga' → '2', иначе '1'.
#     """
#     s = _s(value).lower()
#     if s in ("preke", "prekė", "prekes", "prekės"):
#         return "1"
#     if s in ("paslauga", "paslaugos"):
#         return "2"
#     return "1"


# def normalize_tip_doc(value) -> str:
#     """
#     Для документа (когда нет строк):
#       1→'1', 2→'2', 3→'1', 4→'2'. Строковые цифры/слова тоже поддерживаются.
#     """
#     s = _s(value)
#     if not s:
#         return "1"
#     try:
#         n = int(float(s.replace(",", ".")))
#         if n == 1:
#             return "1"
#         if n == 2:
#             return "2"
#         if n == 3:
#             return "1"
#         if n == 4:
#             return "2"
#         return "1"
#     except Exception:
#         low = s.lower()
#         if low in ("preke", "prekė", "prekes", "prekės"):
#             return "1"
#         if low in ("paslauga", "paslaugos"):
#             return "2"
#         return "1"


# def get_party_code(doc, *, id_field: str, vat_field: str, id_programoje_field: str) -> str:
#     """
#     Код стороны по приоритету: *_id → *_vat_code → *_id_programoje. Без рандома.
#     Если ничего нет — вернёт пустую строку (дальше решим, чем подменять).
#     """
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


# def _fallback_doc_num(series: str, number: str) -> tuple[str, str]:
#     """
#     Finvalda хранит <serija> и <dokumentas> раздельно.
#     Правила:
#       - оба пустые → serija='' , dokumentas='NERANUMERIO#####'
#       - есть series, но НЕТ number → serija=series , dokumentas='NERANUMERIO#####'
#       - НЕТ series, но есть number → serija='' , dokumentas=number
#       - оба есть → serija=series , dokumentas=number
#     """
#     s = _s(series)
#     n = _s(number)
#     if not s and not n:
#         return "", f"NERANUMERIO{random.randint(0, 99999):05d}"
#     if s and not n:
#         return s, f"NERANUMERIO{random.randint(0, 99999):05d}"
#     if n and not s:
#         return "", n
#     return s, n


# # =========================
# # XML helpers
# # =========================
# def _pretty_bytes(elem: ET.Element) -> bytes:
#     rough = ET.tostring(elem, encoding="utf-8")
#     parsed = minidom.parseString(rough)
#     xml = parsed.toprettyxml(indent=" ", encoding="utf-8")
#     lines = [l for l in xml.decode("utf-8").split("\n") if l.strip()]
#     return "\n".join(lines).encode("utf-8")


# def _root() -> ET.Element:
#     """Создаёт корневой <fvsdata> с обязательными секциями в порядке: klientai → prekes → paslaugos → operacijos."""
#     root = ET.Element("fvsdata", {"xmlns:xsi": FNS["xsi"]})
#     ET.SubElement(root, "klientai")
#     ET.SubElement(root, "prekes")
#     ET.SubElement(root, "paslaugos")
#     ET.SubElement(root, "operacijos")
#     return root


# def _ensure_client(
#     root: ET.Element,
#     *,
#     code: str,
#     name: str,
#     address: str = "",
#     iban: str = "",
#     country_iso: str = "LT",
# ):
#     """
#     Добавляет клиента в <klientai>, если его ещё нет (по коду).
#     Если code пустой — подставляем 'neraimoneskodo'.
#     """
#     klientai = root.find("klientai")
#     assert klientai is not None

#     code = _s(code) or "neraimoneskodo"
#     for k in klientai.findall("klientas"):
#         k_code = (k.findtext("kodas") or "").strip()
#         if k_code == code:
#             return

#     klientas = ET.SubElement(klientai, "klientas")
#     ET.SubElement(klientas, "kodas").text = code
#     ET.SubElement(klientas, "pavadinimas").text = smart_str(_s(name))
#     ET.SubElement(klientas, "adresas").text = smart_str(_s(address))
#     ET.SubElement(klientas, "banko_sas").text = smart_str(_s(iban))
#     ET.SubElement(klientas, "im_kodas").text = code
#     ET.SubElement(klientas, "salis_kodas").text = smart_str((_s(country_iso) or "LT"))


# # ===== Stable code persistence (write once into item's/doc's prekes_kodas) =====

# def _get_or_persist_kodas_from_obj(obj) -> str:
#     """Возвращает UPPER-код позиции.
#     Логика:
#     - если obj.prekes_kodas есть → вернуть его (UPPER);
#     - иначе если НЕТ ни prekes_kodas, ни prekes_barkodas → сгенерировать NERAPREKESKODO####,
#       записать его в obj.prekes_kodas (save update_fields=["prekes_kodas"]) и вернуть;
#     - иначе (есть только barkodas) → вернуть barkodas (UPPER), ничего не писать.
#     Любые ошибки сохранения — игнорируем (но пытаемся сохранить один раз).
#     """
#     pk = _s(getattr(obj, "prekes_kodas", None))
#     if pk:
#         return pk.upper()
#     bk = _s(getattr(obj, "prekes_barkodas", None))
#     if not bk:
#         code = _gen_random_kodas()
#         try:
#             setattr(obj, "prekes_kodas", code.upper())
#             save = getattr(obj, "save", None)
#             if callable(save):
#                 obj.save(update_fields=["prekes_kodas"])  # may raise; ok
#         except Exception:
#             pass
#         return code.upper()
#     return bk.upper()

# # ===== PREKĖS / PASLAUGOS registry =====

# def _ensure_preke(
#     root: ET.Element,
#     *,
#     kodas: str,
#     bar_kodas: str = "",
#     pavadinimas: str = "",
#     kaina1: str | Decimal | float | int = "",
#     valiuta: str = "EUR",
#     mat_kodas: str = "VNT",
#     aktyvi: str = "1",
#     sandelis: str = "",
# ):
#     prekes = root.find("prekes")
#     assert prekes is not None
#     kodas = _upper(kodas) or _gen_random_kodas()
#     for p in prekes.findall("preke"):
#         if (p.findtext("kodas") or "").strip().upper() == kodas:
#             return
#     preke = ET.SubElement(prekes, "preke")
#     ET.SubElement(preke, "kodas").text = smart_str(kodas)
#     if _s(bar_kodas):
#         ET.SubElement(preke, "bar_kodas").text = smart_str(_upper(bar_kodas))
#     ET.SubElement(preke, "pavadinimas").text = smart_str(_s(pavadinimas) or kodas)
#     if kaina1 != "":
#         ET.SubElement(preke, "kaina1").text = get_price_or_zero(kaina1)
#     ET.SubElement(preke, "valiuta").text = _upper(valiuta) or "EUR"
#     ET.SubElement(preke, "aktyvi").text = _s(aktyvi) or "1"
#     ET.SubElement(preke, "mat_kodas").text = _upper(mat_kodas) or "VNT"
#     if _s(sandelis):
#         ET.SubElement(preke, "sandelis").text = _upper(sandelis)


# def _ensure_paslauga(
#     root: ET.Element,
#     *,
#     kodas: str,
#     bar_kodas: str = "",
#     pavadinimas: str = "",
#     kaina1: str | Decimal | float | int = "",
#     valiuta: str = "EUR",
#     mat_kodas: str = "VNT",
#     aktyvi: str = "1",
# ):
#     paslaugos = root.find("paslaugos")
#     assert paslaugos is not None
#     kodas = _upper(kodas) or _gen_random_kodas()
#     for p in paslaugos.findall("paslauga"):
#         if (p.findtext("kodas") or "").strip().upper() == kodas:
#             return
#     ps = ET.SubElement(paslaugos, "paslauga")
#     ET.SubElement(ps, "kodas").text = smart_str(kodas)
#     if _s(bar_kodas):
#         ET.SubElement(ps, "bar_kodas").text = smart_str(_upper(bar_kodas))
#     ET.SubElement(ps, "pavadinimas").text = smart_str(_s(pavadinimas) or kodas)
#     if kaina1 != "":
#         ET.SubElement(ps, "kaina1").text = get_price_or_zero(kaina1)
#     ET.SubElement(ps, "valiuta").text = _upper(valiuta) or "EUR"
#     ET.SubElement(ps, "aktyvi").text = _s(aktyvi) or "1"
#     ET.SubElement(ps, "mat_kodas").text = _upper(mat_kodas) or "VNT"


# def _ensure_catalog_entry_from_item(root: ET.Element, *, item, currency: str):
#     """Обеспечивает запись в реестры: если товар — в <prekes>, если услуга — в <paslaugos>.
#     Код: сохраняем один раз в item.prekes_kodas при его отсутствии и отсутствии barkodas.
#     """
#     tipas = normalize_tip_lineitem(getattr(item, "preke_paslauga", None))
#     kodas = _get_or_persist_kodas_from_obj(item)
#     bar = _upper(getattr(item, "prekes_barkodas", None)) if _s(getattr(item, "prekes_barkodas", None)) else ""
#     name = _s(getattr(item, "prekes_pavadinimas", None)) or kodas

#     qty = _d(getattr(item, "quantity", None), Decimal("1"))
#     subtotal = _d(getattr(item, "subtotal", None))
#     unit_price = subtotal / qty if qty != 0 else Decimal("0")

#     explicit_price = getattr(item, "unit_price", None)
#     if explicit_price not in (None, ""):
#         try:
#             unit_price = _d(explicit_price)
#         except Exception:
#             pass

#     mat_kodas = _upper(getattr(item, "mat_kodas", None) or "VNT")
#     sandelis = _upper(getattr(item, "sandelio_kodas", None) or "")

#     if tipas == "2":
#         # Услуга — без <sandelis>
#         _ensure_paslauga(
#             root,
#             kodas=kodas,
#             bar_kodas=bar,
#             pavadinimas=name,
#             kaina1=unit_price,
#             valiuta=_upper(currency),
#             mat_kodas=mat_kodas,
#             aktyvi="1",
#         )
#     else:
#         # Товар — с <sandelis> при наличии
#         _ensure_preke(
#             root,
#             kodas=kodas,
#             bar_kodas=bar,
#             pavadinimas=name,
#             kaina1=unit_price,
#             valiuta=_upper(currency),
#             mat_kodas=mat_kodas,
#             aktyvi="1",
#             sandelis=sandelis,
#         )


# # =========================
# # Строки документов
# # =========================

# def _fill_line(
#     parent: ET.Element,
#     *,
#     is_purchase: bool,  # зарезервировано
#     line_obj=None,
#     currency: str = "EUR",
#     fallback_amount_wo_vat=None,
#     fallback_vat_amount=None,
#     fallback_name: str = "",
#     pvm_kodas_value=None,
#     fallback_tip_doc=None,  # тип с уровня документа при отсутствии строк
#     sandelio_kodas_value: str = "",
#     summary_kodas: str = "",
# ):
#     """
#     Добавляет <eilute> в <operacijaDet>.

#     - <tipas> (1/2):
#         * если есть line_obj → normalize_tip_lineitem(line_obj.preke_paslauga)
#         * если line_obj нет → normalize_tip_doc(fallback_tip_doc)
#     - <kodas> = из БД (если нет своего), иначе NERAPREKESKODO####
#     - <kiekis pirmas_mat="true"> = quantity (по умолчанию 1.00)
#     - <sandelis> = item.sandelio_kodas (детально) или sandelio_kodas_value (суммарно)
#     - суммы: EUR → *_l, не-EUR → *_v
#     - <pvm_proc> = line_obj.vat_percent (или 0.00)
#     - <pvm_kodas> = pvm_kodas_value (multi) → line_obj.pvm_kodas (single) → ""
#     """
#     eilute = ET.SubElement(parent, "eilute")

#     # tipas (1/2 товар/услуга)
#     if line_obj is not None:
#         tipas_val = normalize_tip_lineitem(getattr(line_obj, "preke_paslauga", None))
#     else:
#         tipas_val = normalize_tip_doc(fallback_tip_doc)
#     ET.SubElement(eilute, "tipas").text = tipas_val

#     # kodas (persist once into obj.prekes_kodas if both empty)
#     if line_obj is not None:
#         kodas_val = _get_or_persist_kodas_from_obj(line_obj)
#     else:
#         # суммарный режим: код берём/сохраняем на уровне doc и сюда передаём
#         kodas_val = _s(summary_kodas) or _gen_random_kodas()
#     ET.SubElement(eilute, "kodas").text = smart_str(kodas_val.upper())

#     # kiekis
#     qty = getattr(line_obj, "quantity", None) if line_obj is not None else None
#     if qty is None or qty == "":
#         qty = 1
#     ET.SubElement(eilute, "kiekis", {"pirmas_mat": "true"}).text = f"{float(qty):.2f}"

#     # sandelis (from item if detailed; from doc if summary)
#     sandelio_kodas = _s(getattr(line_obj, "sandelio_kodas", None)) if line_obj is not None else _s(sandelio_kodas_value)
#     if sandelio_kodas:
#         ET.SubElement(eilute, "sandelis").text = _upper(sandelio_kodas)

#     # pavadinimas
#     name = getattr(line_obj, "prekes_pavadinimas", None) if line_obj is not None else None
#     ET.SubElement(eilute, "pavadinimas").text = smart_str(_s(name) or _s(fallback_name))

#     # суммы
#     if line_obj is not None:
#         subtotal = getattr(line_obj, "subtotal", None)
#         vat_amount = getattr(line_obj, "vat", None)
#     else:
#         subtotal = fallback_amount_wo_vat
#         vat_amount = fallback_vat_amount

#     cur = (_s(currency) or "EUR").upper()
#     if cur == "EUR":
#         ET.SubElement(eilute, "suma_v").text = "0"
#         ET.SubElement(eilute, "suma_l").text = get_price_or_zero(subtotal)
#         ET.SubElement(eilute, "suma_pvmv").text = "0"
#         ET.SubElement(eilute, "suma_pvml").text = get_price_or_zero(vat_amount)
#     else:
#         ET.SubElement(eilute, "suma_v").text = get_price_or_zero(subtotal)
#         ET.SubElement(eilute, "suma_l").text = "0"
#         ET.SubElement(eilute, "suma_pvmv").text = get_price_or_zero(vat_amount)
#         ET.SubElement(eilute, "suma_pvml").text = "0"

#     # pvm_proc
#     vat_percent = getattr(line_obj, "vat_percent", None) if line_obj is not None else None
#     if vat_percent is None or vat_percent == "":
#         pvm_proc_text = "0.00"
#     else:
#         try:
#             pvm_proc_text = f"{float(vat_percent):.2f}"
#         except Exception:
#             pvm_proc_text = "0.00"
#     ET.SubElement(eilute, "pvm_proc").text = pvm_proc_text

#     # pvm_kodas
#     if pvm_kodas_value is None:
#         pvm_kodas_value = getattr(line_obj, "pvm_kodas", None) if line_obj is not None else ""
#     ET.SubElement(eilute, "pvm_kodas").text = smart_str(_s(pvm_kodas_value))


# # =========================================================
# # Pirkimai
# # =========================================================

# def export_pirkimai_group_to_finvalda(documents):
#     """Экспорт ПРИОБРЕТЕНИЙ (pirkimas) в формат Finvalda. Возвращает bytes.
#     Формат: <fvsdata><klientai/><prekes/><paslaugos/><operacijos>...</operacijos></fvsdata>"""
#     root = _root()
#     operacijos = root.find("operacijos")
#     assert operacijos is not None

#     for doc in documents:
#         currency = _s(getattr(doc, "currency", "EUR") or "EUR").upper()
#         series_raw = smart_str(getattr(doc, "document_series", "") or "")
#         number_raw = smart_str(getattr(doc, "document_number", "") or "")
#         serija, dokumentas = _fallback_doc_num(series_raw, number_raw)

#         invoice_date = getattr(doc, "invoice_date", None)
#         op_date = getattr(doc, "operation_date", None)
#         payment_date = op_date or invoice_date

#         # seller: id -> vat -> id_programoje
#         seller_code = get_party_code(
#             doc,
#             id_field="seller_id",
#             vat_field="seller_vat_code",
#             id_programoje_field="seller_id_programoje",
#         )
#         seller_name = _s(getattr(doc, "seller_name", ""))
#         seller_addr = _s(getattr(doc, "seller_address", ""))
#         seller_iban = _s(getattr(doc, "seller_iban", ""))
#         seller_country = _s(getattr(doc, "seller_country_iso", "") or "LT")

#         _ensure_client(
#             root,
#             code=seller_code,
#             name=seller_name or "No Supplier",
#             address=seller_addr,
#             iban=seller_iban,
#             country_iso=seller_country,
#         )

#         pirkimas = ET.SubElement(operacijos, "pirkimas")
#         ET.SubElement(pirkimas, "serija").text = serija
#         ET.SubElement(pirkimas, "dokumentas").text = dokumentas
#         ET.SubElement(pirkimas, "data").text = format_date(invoice_date)
#         ET.SubElement(pirkimas, "valiuta").text = currency
#         ET.SubElement(pirkimas, "mokejimo_data").text = format_date(payment_date)
#         ET.SubElement(pirkimas, "reg_data").text = format_date(invoice_date)
#         ET.SubElement(pirkimas, "dokumento_data").text = format_date(invoice_date)

#         k = ET.SubElement(pirkimas, "klientas", {"kodo_tipas": "im_kodas"})
#         k.text = _s(seller_code) or "neraimoneskodo"

#         ET.SubElement(pirkimas, "pastaba").text = smart_str(_s(getattr(doc, "preview_url", "")))
#         ET.SubElement(pirkimas, "imp_param").text = "VA"
#         ET.SubElement(pirkimas, "padalinys").text = "PP"

#         # Doc-level extra tags (always from doc)
#         if _s(getattr(doc, "zurnalo_kodas", None)):
#             ET.SubElement(pirkimas, "zurnalas").text = _upper(getattr(doc, "zurnalo_kodas", ""))
#         if _s(getattr(doc, "tipo_kodas", None)):
#             ET.SubElement(pirkimas, "tipas").text = _upper(getattr(doc, "tipo_kodas", ""))
#         if _s(getattr(doc, "padalinio_kodas", None)):
#             ET.SubElement(pirkimas, "padalinys").text = _upper(getattr(doc, "padalinio_kodas", ""))
#         if _s(getattr(doc, "atsakingo_asmens_kodas", None)):
#             ET.SubElement(pirkimas, "darbuotojas").text = _upper(getattr(doc, "atsakingo_asmens_kodas", ""))

#         det = ET.SubElement(pirkimas, "operacijaDet")

#         # multi/single источник pvm кодов по строкам
#         line_map = getattr(doc, "_pvm_line_map", None)

#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, "all") and line_items.exists():
#             for item in line_items.all():
#                 # Реестр prekes/paslaugos
#                 _ensure_catalog_entry_from_item(root, item=item, currency=currency)

#                 code = (line_map or {}).get(getattr(item, "id", None)) if line_map is not None else getattr(item, "pvm_kodas", None)

#                 _fill_line(
#                     det,
#                     is_purchase=True,
#                     line_obj=item,
#                     currency=currency,
#                     pvm_kodas_value=code,
#                     sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
#                 )
#         else:
#             # синтетическая строка
#             _fill_line(
#                 det,
#                 is_purchase=False,
#                 line_obj=None,
#                 currency=currency,
#                 fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
#                 fallback_vat_amount=getattr(doc, "vat_amount", None),
#                 fallback_name=_s(getattr(doc, "prekes_pavadinimas", "")),
#                 pvm_kodas_value=getattr(doc, "pvm_kodas", None),
#                 fallback_tip_doc=getattr(doc, "preke_paslauga", None),
#                 sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
#                 summary_kodas=_get_or_persist_kodas_from_obj(doc),
#             )

#     xml_bytes = _pretty_bytes(root)
#     return expand_empty_tags(xml_bytes)


# # =========================================================
# # Pardavimai
# # =========================================================

# def export_pardavimai_group_to_finvalda(documents):
#     """Экспорт ПРОДАЖ (pardavimas) в формат Finvalda. Возвращает bytes.
#     Формат: <fvsdata><klientai/><prekes/><paslaugos/><operacijos>...</operacijos></fvsdata>"""
#     root = _root()
#     operacijos = root.find("operacijos")
#     assert operacijos is not None

#     for doc in documents:
#         currency = _s(getattr(doc, "currency", "EUR") or "EUR").upper()
#         series_raw = smart_str(getattr(doc, "document_series", "") or "")
#         number_raw = smart_str(getattr(doc, "document_number", "") or "")
#         serija, dokumentas = _fallback_doc_num(series_raw, number_raw)

#         invoice_date = getattr(doc, "invoice_date", None)
#         op_date = getattr(doc, "operation_date", None)
#         payment_date = op_date or invoice_date

#         # buyer: id -> vat -> id_programoje
#         buyer_code = get_party_code(
#             doc,
#             id_field="buyer_id",
#             vat_field="buyer_vat_code",
#             id_programoje_field="buyer_id_programoje",
#         )
#         buyer_name = _s(getattr(doc, "buyer_name", "") or "No Buyer")
#         buyer_addr = _s(getattr(doc, "buyer_address", "") or "")
#         buyer_iban = _s(getattr(doc, "buyer_iban", ""))
#         buyer_country = _s(getattr(doc, "buyer_country_iso", "") or "")

#         _ensure_client(
#             root,
#             code=buyer_code,
#             name=buyer_name,
#             address=buyer_addr,
#             iban=buyer_iban,
#             country_iso=buyer_country,
#         )

#         pard = ET.SubElement(operacijos, "pardavimas")
#         ET.SubElement(pard, "serija").text = serija
#         ET.SubElement(pard, "dokumentas").text = dokumentas

#         k = ET.SubElement(pard, "klientas", {"kodo_tipas": "im_kodas"})
#         k.text = _s(buyer_code) or "neraimoneskodo"

#         ET.SubElement(pard, "data").text = format_date(invoice_date)
#         ET.SubElement(pard, "valiuta").text = currency
#         ET.SubElement(pard, "mokejimo_data").text = format_date(payment_date)
#         ET.SubElement(pard, "pastaba").text = smart_str(_s(getattr(doc, "preview_url", "")))
#         ET.SubElement(pard, "imp_param").text = "VA"

#         # Doc-level extra tags (always from doc)
#         if _s(getattr(doc, "zurnalo_kodas", None)):
#             ET.SubElement(pard, "zurnalas").text = _upper(getattr(doc, "zurnalo_kodas", ""))
#         if _s(getattr(doc, "tipo_kodas", None)):
#             ET.SubElement(pard, "tipas").text = _upper(getattr(doc, "tipo_kodas", ""))
#         if _s(getattr(doc, "padalinio_kodas", None)):
#             ET.SubElement(pard, "padalinys").text = _upper(getattr(doc, "padalinio_kodas", ""))
#         if _s(getattr(doc, "atsakingo_asmens_kodas", None)):
#             ET.SubElement(pard, "darbuotojas").text = _upper(getattr(doc, "atsakingo_asmens_kodas", ""))

#         det = ET.SubElement(pard, "operacijaDet")

#         # multi/single источник pvm кодов по строкам
#         line_map = getattr(doc, "_pvm_line_map", None)

#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, "all") and line_items.exists():
#             for item in line_items.all():
#                 # Реестр prekes/paslaugos
#                 _ensure_catalog_entry_from_item(root, item=item, currency=currency)

#                 code = (line_map or {}).get(getattr(item, "id", None)) if line_map is not None else getattr(item, "pvm_kodas", None)

#                 _fill_line(
#                     det,
#                     is_purchase=False,
#                     line_obj=item,
#                     currency=currency,
#                     pvm_kodas_value=code,
#                     sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
#                 )
#         else:
#             _fill_line(
#                 det,
#                 is_purchase=False,
#                 line_obj=None,
#                 currency=currency,
#                 fallback_amount_wo_vat=getattr(doc, "amount_wo_vat", None),
#                 fallback_vat_amount=getattr(doc, "vat_amount", None),
#                 fallback_name=_s(getattr(doc, "prekes_pavadinimas", "")),
#                 pvm_kodas_value=getattr(doc, "pvm_kodas", None),
#                 fallback_tip_doc=getattr(doc, "preke_paslauga", None),
#                 sandelio_kodas_value=_s(getattr(doc, "sandelio_kodas", "")),
#             )

#     xml_bytes = _pretty_bytes(root)
#     return expand_empty_tags(xml_bytes)

