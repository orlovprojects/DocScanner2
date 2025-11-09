from __future__ import annotations 

import re
import random
import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import Iterable, Optional, Tuple
from io import BytesIO
import zipfile
from decimal import Decimal, ROUND_HALF_UP

from django.utils.encoding import smart_str
from django.utils.timezone import localdate

from .formatters import format_date_iso, get_price_or_zero, expand_empty_tags
from ..models import CurrencyRate

FNS = {"xsi": "http://www.w3.org/2001/XMLSchema-instance"}

# =========================
# Helpers
# =========================

ALNUM_RE = re.compile(r'[^A-Za-z0-9]+')
DIGITS_RE = re.compile(r'[^0-9]+')


def _pretty_bytes(elem: ET.Element) -> bytes:
    """
    Возвращает красивый XML (bytes) с декларацией, без пустых строк.
    """
    rough = ET.tostring(elem, encoding="utf-8")
    parsed = minidom.parseString(rough)
    xml = parsed.toprettyxml(indent="  ", encoding="utf-8")
    lines = [l for l in xml.decode("utf-8").split("\n") if l.strip()]
    return "\n".join(lines).encode("utf-8")


def _nz(v) -> bool:
    """Есть ли непустая строка после strip()."""
    return bool((str(v).strip() if v is not None else ""))


def _infer_direction(document, direction_hint: Optional[str]) -> str:
    """
    Возвращает 'pirkimas' или 'pardavimas' на основе:
      1) явного direction_hint ('pirkimas'/'pardavimas')
      2) эвристики по заполненности buyer/seller ID/VAT
      3) дефолт — 'pirkimas'
    """
    dir_ = (direction_hint or getattr(document, 'pirkimas_pardavimas', '') or '').strip().lower()
    if dir_ not in ('pirkimas', 'pardavimas'):
        if _nz(getattr(document, 'buyer_id', None)) or _nz(getattr(document, 'buyer_vat_code', None)):
            dir_ = 'pardavimas'
        elif _nz(getattr(document, 'seller_id', None)) or _nz(getattr(document, 'seller_vat_code', None)):
            dir_ = 'pirkimas'
        else:
            dir_ = 'pirkimas'
    return dir_


def _alnum(s: str) -> str:
    """Оставляет только буквы и цифры (A-Z0-9), убирает любые пробелы/символы."""
    return ALNUM_RE.sub('', smart_str(s or ''))


def _digits(s: str) -> str:
    """Оставляет только цифры."""
    return DIGITS_RE.sub('', smart_str(s or ''))


def _norm_series(series: str, *, default_if_empty: Optional[str] = None) -> str:
    """
    Очищает серию до [A-Z0-9]. Если пусто и задан default_if_empty — подставляет его.
    """
    s = _alnum(series).upper()
    if not s and default_if_empty is not None:
        return default_if_empty
    return s


def _norm_docnum_pardavimas(series_clean: str, number_raw: str) -> str:
    """
    Правила для продаж:
      1) если number_raw начинается с series_clean — убираем префикс серии;
      2) оставляем только цифры;
      3) если цифр > 9 — берём правые 9;
      4) если пусто — '111111'.
    """
    nr = smart_str(number_raw or '')
    if series_clean and nr.upper().startswith(series_clean.upper()):
        nr = nr[len(series_clean):]
    only_digits = _digits(nr)
    if len(only_digits) > 9:
        only_digits = only_digits[-9:]
    return only_digits or '111111'


def _norm_docnum_pirkimas(number_raw: str) -> str:
    """
    Правила для покупок:
      - очищаем до [A-Z0-9] (буквы+цифры), убираем пробелы/символы;
      - если пусто — '111111'.
    """
    n = _alnum(number_raw).upper()
    return n or '111111'


def _compose_id(series_clean: str, number_clean: str) -> str:
    """
    ID — серия+номер, если номер не начинается с серии; иначе — номер.
    Если серии нет — просто номер. Fallback — 'NERANUMERIO'.
    """
    s = (series_clean or '')
    n = (number_clean or '')
    if s and n and not n.startswith(s):
        return f"{s}{n}"
    return n or 'NERANUMERIO'


def _today_str_iso() -> str:
    """YYYY-MM-DD для имён файлов."""
    return localdate().strftime("%Y-%m-%d")


def _get_currency_rate(currency_code: str, date_obj) -> float:
    """
    Курс к EUR: EUR -> 1.0; иначе из CurrencyRate на дату или последнюю < даты; если не нашли — 1.0.
    """
    code = (currency_code or '').upper() or 'EUR'
    if code == 'EUR':
        return 1.0
    obj = CurrencyRate.objects.filter(currency=code, date=date_obj).first()
    if obj and getattr(obj, 'rate', None):
        try:
            return float(obj.rate) if obj.rate else 1.0
        except Exception:
            return 1.0
    obj = CurrencyRate.objects.filter(currency=code, date__lt=date_obj).order_by('-date').first()
    if obj and getattr(obj, 'rate', None):
        try:
            return float(obj.rate) if obj.rate else 1.0
        except Exception:
            return 1.0
    return 1.0


def _party_code_from_id(raw_id: Optional[str]) -> str:
    """
    Используем только *_id. Если пусто — NERAKODO#### (4 случайные цифры).
    """
    s = smart_str(raw_id or '').strip()
    if s:
        return s
    return f"NERAKODO{random.randint(0, 9999):04d}"


def _party_name_or_random(raw_name: Optional[str]) -> str:
    """
    Возвращает имя стороны. Если пусто — 'NERAVARDO####' (4 случайные цифры).
    """
    s = smart_str(raw_name or '').strip()
    if s:
        return s
    return f"NERAVARDO{random.randint(0, 9999):04d}"


def _set_child_text(parent: ET.Element, tag: str, text: str) -> None:
    """
    Безопасно устанавливает текст дочернего узла: создаёт элемент, если его нет.
    """
    el = parent.find(tag)
    if el is None:
        el = ET.SubElement(parent, tag)
    el.text = smart_str(text or "")


# =========================
# Финализация сумм для Apskaita5
# =========================

def _finalize_document_for_apskaita5(doc) -> dict:
    """
    Финальная подгонка сумм документа для экспорта в Apskaita5.
    
    ВАЖНО: Если есть invoice_discount_wo_vat - вычитаем из amount_wo_vat,
    чтобы получить финальную сумму БЕЗ НДС (уже после скидки).
    
    Tolerance = 0.00 (идеальное совпадение для адаптера).
    
    Логика:
    - Вычитаем скидку: amount_wo_vat -= invoice_discount_wo_vat
    - Якорь: amount_with_vat (главное поле)
    - Формула: amount_wo_vat + vat_amount = amount_with_vat
    - Корректируем vat_amount для идеального совпадения
    
    Returns:
        dict с финализированными суммами (после вычета скидки)
    """
    # Исходные данные
    wo = Decimal(str(getattr(doc, "amount_wo_vat", None) or 0))
    vat = Decimal(str(getattr(doc, "vat_amount", None) or 0))
    with_vat = Decimal(str(getattr(doc, "amount_with_vat", None) or 0))
    vp = Decimal(str(getattr(doc, "vat_percent", None) or 0))
    
    # Скидка документа
    discount_wo = Decimal(str(getattr(doc, "invoice_discount_wo_vat", None) or 0))
    discount_with = Decimal(str(getattr(doc, "invoice_discount_with_vat", None) or 0))
    
    # Если есть discount_with, но нет discount_wo - переносим
    if discount_with > 0 and discount_wo == 0:
        discount_wo = discount_with
    
    # КЛЮЧЕВОЙ МОМЕНТ: Вычитаем скидку из amount_wo_vat!
    wo = wo - discount_wo
    
    # Округление до 2 знаков
    wo = round(wo, 2)
    vat = round(vat, 2)
    with_vat = round(with_vat, 2)
    vp = round(vp, 2)
    
    # Формула: wo + vat = with (после вычета скидки)
    expected_with = wo + vat
    delta = abs(expected_with - with_vat)
    
    if delta > Decimal("0.00"):
        # Корректируем vat для идеального совпадения
        vat = with_vat - wo
        vat = round(vat, 2)
    
    # Финальная проверка формулы
    check_with = wo + vat
    if abs(check_with - with_vat) > Decimal("0.00"):
        # Последняя коррекция vat
        vat = with_vat - wo
        vat = round(vat, 2)
    
    return {
        "amount_wo_vat": float(wo),      # УЖЕ после скидки
        "vat_amount": float(vat),
        "amount_with_vat": float(with_vat),
        "vat_percent": float(vp),
    }


def _finalize_line_items_for_apskaita5(doc) -> list:
    """
    Финализация строк документа.
    
    Логика:
    - Округление до 2 знаков (денежные суммы)
    - Идеальный subtotal от price × qty
    - Идеальный VAT от subtotal × vat_percent / 100
    - Идеальный total = subtotal + vat
    - Распределение остатков на самую большую строку
    
    Returns:
        list финализированных строк
    """
    line_items = _iter_line_items(doc)
    if not line_items:
        return []
    
    finalized_lines = []
    
    for li in line_items:
        price = Decimal(str(getattr(li, "price", None) or 0))
        qty = Decimal(str(getattr(li, "quantity", None) or 0))
        vat_percent = Decimal(str(getattr(li, "vat_percent", None) or 0))
        
        # Округление
        price = round(price, 4)  # price - 4 знака
        qty = round(qty, 4)      # quantity - 4 знака
        vat_percent = round(vat_percent, 2)
        
        # Идеальный subtotal от price × qty
        if price > 0 and qty > 0:
            subtotal = round(price * qty, 2)
        else:
            subtotal = round(Decimal(str(getattr(li, "subtotal", None) or 0)), 2)
        
        # Идеальный VAT от subtotal × vat_percent
        if vat_percent > 0 and subtotal > 0:
            vat = round(subtotal * vat_percent / Decimal("100"), 2)
        else:
            vat = round(Decimal(str(getattr(li, "vat", None) or 0)), 2)
        
        # Идеальный total
        total = round(subtotal + vat, 2)
        
        finalized_lines.append({
            "id": getattr(li, "id", None),
            "price": float(price),
            "quantity": float(qty),
            "subtotal": float(subtotal),
            "vat": float(vat),
            "vat_percent": float(vat_percent),
            "total": float(total),
            # Остальные поля без изменений
            "prekes_kodas": getattr(li, "prekes_kodas", "") or "",
            "prekes_barkodas": getattr(li, "prekes_barkodas", "") or "",
            "prekes_pavadinimas": getattr(li, "prekes_pavadinimas", "") or "",
            "unit": getattr(li, "unit", "") or "vnt",
            "pvm_kodas": getattr(li, "pvm_kodas", None),
            "sandelio_kodas": getattr(li, "sandelio_kodas", "") or "",
        })
    
    # Распределение остатков (если Σlines ≠ doc)
    _distribute_remainders_to_lines(finalized_lines, doc)
    
    return finalized_lines


def _distribute_remainders_to_lines(finalized_lines: list, doc) -> None:
    """
    Распределяет скидку ДОКУМЕНТА на строки пропорционально.
    
    ЛОГИКА:
    1. Если в документе есть invoice_discount_wo_vat - вычитаем из строк
    2. Распределение пропорционально subtotal каждой строки
    3. ПЕРЕСЧИТЫВАЕМ НДС от нового subtotal (важно для НДС ≠ 0!)
    4. Пересчитываем total = subtotal + vat после вычета скидки
    5. Корректируем малые дельты (≤0.02)
    
    РЕЗУЛЬТАТ: Σ(line.subtotal) + Σ(line.vat) = doc.amount_with_vat
    
    Модифицирует finalized_lines in-place.
    """
    if not finalized_lines:
        return
    
    # Получаем скидку документа (если есть)
    discount_wo = Decimal(str(getattr(doc, "invoice_discount_wo_vat", None) or 0))
    discount_with = Decimal(str(getattr(doc, "invoice_discount_with_vat", None) or 0))
    
    # Если есть discount_with, но нет discount_wo - переносим
    if discount_with > 0 and discount_wo == 0:
        discount_wo = discount_with
    
    discount_wo = round(discount_wo, 2)
    
    # === ШАГ 1: Распределить скидку документа на subtotal строк ===
    if discount_wo > 0:
        # Сумма subtotal ДО скидки
        sum_subtotal_before = sum(Decimal(str(li["subtotal"])) for li in finalized_lines)
        
        if sum_subtotal_before > 0:
            discount_distributed = Decimal("0")
            
            for i, li in enumerate(finalized_lines):
                line_subtotal = Decimal(str(li["subtotal"]))
                line_vat_percent = Decimal(str(li["vat_percent"]))
                line_quantity = Decimal(str(li["quantity"]))
                
                # Последняя строка получает остаток (защита от округления)
                if i == len(finalized_lines) - 1:
                    line_discount = discount_wo - discount_distributed
                else:
                    # Доля этой строки в общей сумме
                    share = line_subtotal / sum_subtotal_before
                    # Скидка для этой строки
                    line_discount = round(discount_wo * share, 2)
                    discount_distributed += line_discount
                
                # Корректируем subtotal
                new_subtotal = line_subtotal - line_discount
                li["subtotal"] = float(round(new_subtotal, 2))
                
                # ПЕРЕСЧИТЫВАЕМ PRICE: price × qty = subtotal
                if line_quantity > 0:
                    new_price = round(new_subtotal / line_quantity, 4)  # 4 знака для price
                    li["price"] = float(new_price)
                
                # КЛЮЧЕВОЙ МОМЕНТ: Пересчитываем НДС от НОВОГО subtotal!
                if line_vat_percent > 0:
                    new_vat = round(new_subtotal * line_vat_percent / Decimal("100"), 2)
                    li["vat"] = float(new_vat)
                else:
                    new_vat = Decimal("0")
                
                # Пересчитываем total = subtotal + vat
                li["total"] = float(round(new_subtotal + new_vat, 2))
    
    # === ШАГ 2: Коррекция малых дельт (≤0.02) для совпадения с документом ===
    # Суммы документа (финализированные, УЖЕ после вычета скидки)
    doc_finalized = _finalize_document_for_apskaita5(doc)
    doc_wo = Decimal(str(doc_finalized["amount_wo_vat"]))
    doc_vat = Decimal(str(doc_finalized["vat_amount"]))
    doc_with = Decimal(str(doc_finalized["amount_with_vat"]))
    
    # Суммы строк (после распределения скидки и пересчёта НДС)
    sum_subtotal = sum(Decimal(str(li["subtotal"])) for li in finalized_lines)
    sum_vat = sum(Decimal(str(li["vat"])) for li in finalized_lines)
    sum_total = sum(Decimal(str(li["total"])) for li in finalized_lines)
    
    delta_wo = doc_wo - sum_subtotal
    delta_vat = doc_vat - sum_vat
    delta_with = doc_with - sum_total
    
    TOLERANCE = Decimal("0.02")
    
    if abs(delta_wo) > 0 and abs(delta_wo) <= TOLERANCE:
        max_line = max(finalized_lines, key=lambda x: abs(x["subtotal"]))
        new_subtotal = Decimal(str(max_line["subtotal"])) + delta_wo
        max_line["subtotal"] = float(round(new_subtotal, 2))
        # Пересчитываем total
        max_line["total"] = float(round(new_subtotal + Decimal(str(max_line["vat"])), 2))
    
    if abs(delta_vat) > 0 and abs(delta_vat) <= TOLERANCE:
        max_line = max(finalized_lines, key=lambda x: abs(x["subtotal"]))
        new_vat = Decimal(str(max_line["vat"])) + delta_vat
        max_line["vat"] = float(round(new_vat, 2))
        # Пересчитываем total
        max_line["total"] = float(round(Decimal(str(max_line["subtotal"])) + new_vat, 2))
    
    if abs(delta_with) > 0 and abs(delta_with) <= TOLERANCE:
        max_line = max(finalized_lines, key=lambda x: abs(x["subtotal"]))
        max_line["total"] = float(round(Decimal(str(max_line["total"])) + delta_with, 2))


# =========================
# Внутренний билдер одного XML
# =========================

def _build_apskaita5_xml_for_documents(
    documents: Iterable,
    site_url: str,
    company_code: Optional[str],
    direction_hint: Optional[str],
) -> bytes:
    """
    Собирает один XML <documents> из переданных документов, выставляя:
    - <optype> ('pirkimas'/'pardavimas') на каждый <document>
    - buyercode/sellercode = код нашей компании (если company_code не задан — из *_id с fallback NERAKODO####)
    - docser/docnum/id по заданным правилам
    - <currencyrate>
    - <nuolaida> / <nuolaidapvm> (скидки документа)
    
    ВАЖНО: Все суммы финализируются для идеального совпадения (tolerance 0.00).
    """
    root = ET.Element("documents", {
        "xmlns:xsi": FNS["xsi"],
    })

    for doc in documents:
        dir_ = _infer_direction(doc, direction_hint)

        # --- даты ---
        inv_date = getattr(doc, "invoice_date", None) or localdate()

        # --- серия/номер по правилам ---
        raw_series = getattr(doc, "document_series", "") or ""
        raw_number = getattr(doc, "document_number", "") or ""

        if dir_ == 'pardavimas':
            series_clean = _norm_series(raw_series, default_if_empty="SF")  # серия обязательна
            number_clean = _norm_docnum_pardavimas(series_clean, raw_number)
        else:
            series_clean = _norm_series(raw_series, default_if_empty=None)  # серия опциональна
            number_clean = _norm_docnum_pirkimas(raw_number)

        # --- id/docnum/optype/docser ---
        dok_id = _compose_id(series_clean, number_clean)

        doc_el = ET.SubElement(root, "document")
        _set_child_text(doc_el, "optype", dir_)
        _set_child_text(doc_el, "id", dok_id)
        _set_child_text(doc_el, "docnum", number_clean)
        if dir_ == 'pardavimas' or series_clean:
            _set_child_text(doc_el, "docser", series_clean)

        # --- даты ---
        _set_child_text(doc_el, "date", format_date_iso(inv_date))

        op_date = getattr(doc, "operation_date", None)
        if op_date:
            _set_child_text(doc_el, "operationdate", format_date_iso(op_date))

        due_date = getattr(doc, "due_date", None)
        if due_date:
            _set_child_text(doc_el, "duedate", format_date_iso(due_date))

        # ===== ФИНАЛИЗАЦИЯ СУММ ДОКУМЕНТА =====
        doc_finalized = _finalize_document_for_apskaita5(doc)
        
        _set_child_text(doc_el, "subtotal", get_price_or_zero(doc_finalized["amount_wo_vat"]))
        _set_child_text(doc_el, "vat", get_price_or_zero(doc_finalized["vat_amount"]))
        _set_child_text(doc_el, "total", get_price_or_zero(doc_finalized["amount_with_vat"]))
        
        # ПРИМЕЧАНИЕ: nuolaida/nuolaidapvm НЕ экспортируются
        # Скидка уже распределена на строки через _distribute_remainders_to_lines

        # --- валюта + курс ---
        currency = smart_str((getattr(doc, "currency", "") or "EUR").upper())
        _set_child_text(doc_el, "currency", currency)
        rate_val = _get_currency_rate(currency, inv_date)
        _set_child_text(doc_el, "currencyrate", ("%f" % rate_val).rstrip('0').rstrip('.') or "1")

        # --- ссылка/файл ---
        _set_child_text(doc_el, "url", smart_str(getattr(doc, "preview_url", "") or ""))
        _set_child_text(doc_el, "filename", smart_str(getattr(doc, "original_filename", "") or f"{dok_id}.pdf"))

        # --- флаги ---
        report2isaf = True if getattr(doc, "report_to_isaf", None) is None else bool(getattr(doc, "report_to_isaf"))
        separatevat = True if getattr(doc, "separate_vat", None) is None else bool(getattr(doc, "separate_vat"))
        _set_child_text(doc_el, "report2isaf", "true" if report2isaf else "false")
        _set_child_text(doc_el, "separatevat", "true" if separatevat else "false")

        # --- стороны (seller*/buyer*) — используем ТОЛЬКО *_id,
        #     НО дублируем их в sellercode/buyercode для плагина ---
        seller_id_val = _party_code_from_id(getattr(doc, "seller_id", None))
        _set_child_text(doc_el, "sellerid", seller_id_val)
        _set_child_text(doc_el, "sellercode", seller_id_val)  # важно для фильтра плагина
        _set_child_text(doc_el, "sellervat", smart_str(getattr(doc, "seller_vat_code", "") or ""))
        _set_child_text(doc_el, "sellername", _party_name_or_random(getattr(doc, "seller_name", None)))
        _set_child_text(doc_el, "selleraddress", smart_str(getattr(doc, "seller_address", "") or ""))
        _set_child_text(doc_el, "sellerisperson", "true" if getattr(doc, "seller_is_person", False) else "false")
        _set_child_text(doc_el, "sellercountry", smart_str((getattr(doc, "seller_country_iso", "") or "LT").lower()))
        _set_child_text(doc_el, "selleriban", smart_str(getattr(doc, "seller_iban", "") or ""))

        buyer_id_val = _party_code_from_id(getattr(doc, "buyer_id", None))
        _set_child_text(doc_el, "buyerid", buyer_id_val)
        _set_child_text(doc_el, "buyercode", buyer_id_val)  # важно для фильтра плагина
        _set_child_text(doc_el, "buyervat", smart_str(getattr(doc, "buyer_vat_code", "") or ""))
        _set_child_text(doc_el, "buyername", _party_name_or_random(getattr(doc, "buyer_name", None)))
        _set_child_text(doc_el, "buyeraddress", smart_str(getattr(doc, "buyer_address", "") or ""))
        _set_child_text(doc_el, "buyerisperson", "true" if getattr(doc, "buyer_is_person", False) else "false")
        _set_child_text(doc_el, "buyercountry", smart_str((getattr(doc, "buyer_country_iso", "") or "LT").lower()))

        # --- company_code → нужное поле (buyercode/sellercode) ---
        if dir_ == 'pirkimas':
            derived_cc = buyer_id_val
            final_cc = smart_str(company_code or derived_cc)
            if final_cc:
                _set_child_text(doc_el, "buyercode", final_cc)
        else:
            derived_cc = seller_id_val
            final_cc = smart_str(company_code or derived_cc)
            if final_cc:
                _set_child_text(doc_el, "sellercode", final_cc)

        # --- receipt ---
        _set_child_text(doc_el, "hasreceipt", "true" if getattr(doc, "with_receipt", False) else "false")

        # ===== СТРОКИ (ФИНАЛИЗИРОВАННЫЕ) =====
        finalized_lines = _finalize_line_items_for_apskaita5(doc)
        line_map = getattr(doc, "_pvm_line_map", None)

        if finalized_lines:
            for idx, li in enumerate(finalized_lines):
                line_el = ET.SubElement(doc_el, "line")
                _set_child_text(line_el, "lineid", str(idx))

                _set_child_text(line_el, "price", get_price_or_zero(li["price"]))
                _set_child_text(line_el, "subtotal", get_price_or_zero(li["subtotal"]))
                _set_child_text(line_el, "vat", get_price_or_zero(li["vat"]))
                _set_child_text(line_el, "vatpercent", get_price_or_zero(li["vat_percent"]))
                _set_child_text(line_el, "total", get_price_or_zero(li["total"]))

                code_val = smart_str(li["prekes_kodas"] or li["prekes_barkodas"] or "neraPrekesKodo")
                _set_child_text(line_el, "code", code_val)

                _set_child_text(line_el, "name", smart_str(li["prekes_pavadinimas"] or ""))
                _set_child_text(line_el, "unit", smart_str(li["unit"] or "vnt"))
                _set_child_text(line_el, "quantity", get_price_or_zero(li["quantity"]))

                # vatclass
                if line_map is not None:  # multi
                    vatclass = (line_map or {}).get(li["id"])
                else:  # single
                    vatclass = li["pvm_kodas"]
                _set_child_text(line_el, "vatclass", smart_str(vatclass or ""))

                _set_child_text(line_el, "warehouse", smart_str(li["sandelio_kodas"] or ""))
                _set_child_text(line_el, "object", "")
        else:
            # Документ без строк (sumiškai)
            line_el = ET.SubElement(doc_el, "line")
            _set_child_text(line_el, "lineid", "0")
            _set_child_text(line_el, "price", get_price_or_zero(doc_finalized["amount_wo_vat"]))
            _set_child_text(line_el, "subtotal", get_price_or_zero(doc_finalized["amount_wo_vat"]))
            _set_child_text(line_el, "vat", get_price_or_zero(doc_finalized["vat_amount"]))
            _set_child_text(line_el, "vatpercent", get_price_or_zero(doc_finalized["vat_percent"]) or "0")
            _set_child_text(line_el, "total", get_price_or_zero(doc_finalized["amount_with_vat"]))
            _set_child_text(line_el, "code", "neraPrekesKodo")
            _set_child_text(line_el, "name", smart_str(getattr(doc, "prekes_pavadinimas", "") or ""))
            _set_child_text(line_el, "unit", "vnt")
            _set_child_text(line_el, "quantity", "1")
            _set_child_text(line_el, "vatclass", smart_str(getattr(doc, "pvm_kodas", "") or ""))
            _set_child_text(line_el, "warehouse", smart_str(getattr(doc, "sandelio_kodas", "") or ""))
            _set_child_text(line_el, "object", "")

    xml_bytes = _pretty_bytes(root)
    return expand_empty_tags(xml_bytes)


# =========================
# Доп. хелперы (частично для совместимости)
# =========================

def _docnum_and_id(doc) -> str:
    """
    (Не используется больше для docser/docnum; оставлен для совместимости.)
    Собирает docnum/id из серии и номера:
    - если number не начинается с series -> series+number
    - иначе -> number
    """
    series = smart_str(getattr(doc, "document_series", "") or "")
    number = smart_str(getattr(doc, "document_number", "") or "")
    if series and not number.startswith(series):
        return f"{series}{number}"
    return number or "NERANUMERIO"


def _iter_line_items(doc) -> list:
    """
    Безопасно получаем список LineItem:
    - RelatedManager -> .all() (и .exists() если есть)
    - список/кортеж -> как есть
    - иначе -> []
    """
    li = getattr(doc, "line_items", None)
    if li is None:
        return []
    if hasattr(li, "all"):
        qs = li.all()
        try:
            if hasattr(qs, "exists") and not qs.exists():
                return []
        except Exception:
            pass
        return list(qs)
    if isinstance(li, (list, tuple)):
        return list(li)
    return []


# =========================
# Публичные функции экспорта
# =========================

def export_documents_group_to_apskaita5_files(
    documents: Iterable,
    site_url: str,
    company_code: Optional[str] = None,
    direction: Optional[str] = None,  # если указать, все документы сначала классифицируются, потом фильтруются
) -> Tuple[bytes, str, str]:
    """
    Возвращает (content_bytes, filename, content_type).

    Правила:
      - если в выборке только pirkimas → один XML: YYYY-MM-DD_pirkimai_apskaita5.xml
      - если только pardavimas        → один XML: YYYY-MM-DD_pardavimai_apskaita5.xml
      - если оба типа                 → ZIP:      YYYY-MM-DD_apskaita5.zip, внутри два XML

    company_code:
      - если None, вычисляется из документа (теперь только buyer_id/seller_id с fallback NERAKODO####)
    """
    docs = list(documents)  # чтобы можно было итерироваться несколько раз
    pirkimai = []
    pardavimai = []
    for d in docs:
        if _infer_direction(d, direction) == 'pirkimas':
            pirkimai.append(d)
        else:
            pardavimai.append(d)

    today = _today_str_iso()

    if pirkimai and not pardavimai:
        xml_bytes = _build_apskaita5_xml_for_documents(pirkimai, site_url, company_code, 'pirkimas')
        return xml_bytes, f"{today}_pirkimai_apskaita5.xml", "application/xml"

    if pardavimai and not pirkimai:
        xml_bytes = _build_apskaita5_xml_for_documents(pardavimai, site_url, company_code, 'pardavimas')
        return xml_bytes, f"{today}_pardavimai_apskaita5.xml", "application/xml"

    # оба типа → ZIP
    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        if pirkimai:
            p_bytes = _build_apskaita5_xml_for_documents(pirkimai, site_url, company_code, 'pirkimas')
            zf.writestr(f"{today}_pirkimai_apskaita5.xml", p_bytes)
        if pardavimai:
            s_bytes = _build_apskaita5_xml_for_documents(pardavimai, site_url, company_code, 'pardavimas')
            zf.writestr(f"{today}_pardavimai_apskaita5.xml", s_bytes)

    return zip_buf.getvalue(), f"{today}_apskaita5.zip", "application/zip"


# Обратная совместимость: старая функция, возвращающая только bytes.
# Если типов два, вернёт ZIP-байты; если один — XML-байты.
def export_documents_group_to_apskaita5(
    documents: Iterable,
    site_url: str,
    company_code: Optional[str] = None,
    direction: Optional[str] = None,
) -> bytes:
    content, _filename, _ctype = export_documents_group_to_apskaita5_files(
        documents=documents,
        site_url=site_url,
        company_code=company_code,
        direction=direction,
    )
    return content



# from __future__ import annotations 

# import re
# import random
# import xml.etree.ElementTree as ET
# from xml.dom import minidom
# from typing import Iterable, Optional, Tuple
# from io import BytesIO
# import zipfile

# from django.utils.encoding import smart_str
# from django.utils.timezone import localdate

# from .formatters import format_date_iso, get_price_or_zero, expand_empty_tags
# from ..models import CurrencyRate

# FNS = {"xsi": "http://www.w3.org/2001/XMLSchema-instance"}

# # =========================
# # Helpers
# # =========================

# ALNUM_RE = re.compile(r'[^A-Za-z0-9]+')
# DIGITS_RE = re.compile(r'[^0-9]+')


# def _pretty_bytes(elem: ET.Element) -> bytes:
#     """
#     Возвращает красивый XML (bytes) с декларацией, без пустых строк.
#     """
#     rough = ET.tostring(elem, encoding="utf-8")
#     parsed = minidom.parseString(rough)
#     xml = parsed.toprettyxml(indent="  ", encoding="utf-8")
#     lines = [l for l in xml.decode("utf-8").split("\n") if l.strip()]
#     return "\n".join(lines).encode("utf-8")


# def _nz(v) -> bool:
#     """Есть ли непустая строка после strip()."""
#     return bool((str(v).strip() if v is not None else ""))


# def _infer_direction(document, direction_hint: Optional[str]) -> str:
#     """
#     Возвращает 'pirkimas' или 'pardavimas' на основе:
#       1) явного direction_hint ('pirkimas'/'pardavimas')
#       2) эвристики по заполненности buyer/seller ID/VAT
#       3) дефолт — 'pirkimas'
#     """
#     dir_ = (direction_hint or getattr(document, 'pirkimas_pardavimas', '') or '').strip().lower()
#     if dir_ not in ('pirkimas', 'pardavimas'):
#         if _nz(getattr(document, 'buyer_id', None)) or _nz(getattr(document, 'buyer_vat_code', None)):
#             dir_ = 'pardavimas'
#         elif _nz(getattr(document, 'seller_id', None)) or _nz(getattr(document, 'seller_vat_code', None)):
#             dir_ = 'pirkimas'
#         else:
#             dir_ = 'pirkimas'
#     return dir_


# def _alnum(s: str) -> str:
#     """Оставляет только буквы и цифры (A-Z0-9), убирает любые пробелы/символы."""
#     return ALNUM_RE.sub('', smart_str(s or ''))


# def _digits(s: str) -> str:
#     """Оставляет только цифры."""
#     return DIGITS_RE.sub('', smart_str(s or ''))


# def _norm_series(series: str, *, default_if_empty: Optional[str] = None) -> str:
#     """
#     Очищает серию до [A-Z0-9]. Если пусто и задан default_if_empty — подставляет его.
#     """
#     s = _alnum(series).upper()
#     if not s and default_if_empty is not None:
#         return default_if_empty
#     return s


# def _norm_docnum_pardavimas(series_clean: str, number_raw: str) -> str:
#     """
#     Правила для продаж:
#       1) если number_raw начинается с series_clean — убираем префикс серии;
#       2) оставляем только цифры;
#       3) если цифр > 9 — берём правые 9;
#       4) если пусто — '111111'.
#     """
#     nr = smart_str(number_raw or '')
#     if series_clean and nr.upper().startswith(series_clean.upper()):
#         nr = nr[len(series_clean):]
#     only_digits = _digits(nr)
#     if len(only_digits) > 9:
#         only_digits = only_digits[-9:]
#     return only_digits or '111111'


# def _norm_docnum_pirkimas(number_raw: str) -> str:
#     """
#     Правила для покупок:
#       - очищаем до [A-Z0-9] (буквы+цифры), убираем пробелы/символы;
#       - если пусто — '111111'.
#     """
#     n = _alnum(number_raw).upper()
#     return n or '111111'


# def _compose_id(series_clean: str, number_clean: str) -> str:
#     """
#     ID — серия+номер, если номер не начинается с серии; иначе — номер.
#     Если серии нет — просто номер. Fallback — 'NERANUMERIO'.
#     """
#     s = (series_clean or '')
#     n = (number_clean or '')
#     if s and n and not n.startswith(s):
#         return f"{s}{n}"
#     return n or 'NERANUMERIO'


# def _today_str_iso() -> str:
#     """YYYY-MM-DD для имён файлов."""
#     return localdate().strftime("%Y-%m-%d")


# def _get_currency_rate(currency_code: str, date_obj) -> float:
#     """
#     Курс к EUR: EUR -> 1.0; иначе из CurrencyRate на дату или последнюю < даты; если не нашли — 1.0.
#     """
#     code = (currency_code or '').upper() or 'EUR'
#     if code == 'EUR':
#         return 1.0
#     obj = CurrencyRate.objects.filter(currency=code, date=date_obj).first()
#     if obj and getattr(obj, 'rate', None):
#         try:
#             return float(obj.rate) if obj.rate else 1.0
#         except Exception:
#             return 1.0
#     obj = CurrencyRate.objects.filter(currency=code, date__lt=date_obj).order_by('-date').first()
#     if obj and getattr(obj, 'rate', None):
#         try:
#             return float(obj.rate) if obj.rate else 1.0
#         except Exception:
#             return 1.0
#     return 1.0


# def _party_code_from_id(raw_id: Optional[str]) -> str:
#     """
#     Используем только *_id. Если пусто — NERAKODO#### (4 случайные цифры).
#     """
#     s = smart_str(raw_id or '').strip()
#     if s:
#         return s
#     return f"NERAKODO{random.randint(0, 9999):04d}"


# def _party_name_or_random(raw_name: Optional[str]) -> str:
#     """
#     Возвращает имя стороны. Если пусто — 'NERAVARDO####' (4 случайные цифры).
#     """
#     s = smart_str(raw_name or '').strip()
#     if s:
#         return s
#     return f"NERAVARDO{random.randint(0, 9999):04d}"


# def _set_child_text(parent: ET.Element, tag: str, text: str) -> None:
#     """
#     Безопасно устанавливает текст дочернего узла: создаёт элемент, если его нет.
#     """
#     el = parent.find(tag)
#     if el is None:
#         el = ET.SubElement(parent, tag)
#     el.text = smart_str(text or "")


# # =========================
# # Внутренний билдер одного XML
# # =========================

# def _build_apskaita5_xml_for_documents(
#     documents: Iterable,
#     site_url: str,
#     company_code: Optional[str],
#     direction_hint: Optional[str],
# ) -> bytes:
#     """
#     Собирает один XML <documents> из переданных документов, выставляя:
#     - <optype> ('pirkimas'/'pardavimas') на каждый <document>
#     - buyercode/sellercode = код нашей компании (если company_code не задан — из *_id с fallback NERAKODO####)
#     - docser/docnum/id по заданным правилам
#     - <currencyrate>
#     """
#     root = ET.Element("documents", {
#         "xmlns:xsi": FNS["xsi"],
#     })

#     for doc in documents:
#         dir_ = _infer_direction(doc, direction_hint)

#         # --- даты ---
#         inv_date = getattr(doc, "invoice_date", None) or localdate()

#         # --- серия/номер по правилам ---
#         raw_series = getattr(doc, "document_series", "") or ""
#         raw_number = getattr(doc, "document_number", "") or ""

#         if dir_ == 'pardavimas':
#             series_clean = _norm_series(raw_series, default_if_empty="SF")  # серия обязательна
#             number_clean = _norm_docnum_pardavimas(series_clean, raw_number)
#         else:
#             series_clean = _norm_series(raw_series, default_if_empty=None)  # серия опциональна
#             number_clean = _norm_docnum_pirkimas(raw_number)

#         # --- id/docnum/optype/docser ---
#         dok_id = _compose_id(series_clean, number_clean)

#         doc_el = ET.SubElement(root, "document")
#         _set_child_text(doc_el, "optype", dir_)
#         _set_child_text(doc_el, "id", dok_id)
#         _set_child_text(doc_el, "docnum", number_clean)
#         if dir_ == 'pardavimas' or series_clean:
#             _set_child_text(doc_el, "docser", series_clean)

#         # --- даты ---
#         _set_child_text(doc_el, "date", format_date_iso(inv_date))

#         op_date = getattr(doc, "operation_date", None)
#         if op_date:
#             _set_child_text(doc_el, "operationdate", format_date_iso(op_date))

#         due_date = getattr(doc, "due_date", None)
#         if due_date:
#             _set_child_text(doc_el, "duedate", format_date_iso(due_date))

#         # --- суммы документа ---
#         _set_child_text(doc_el, "subtotal", get_price_or_zero(getattr(doc, "amount_wo_vat", None)))
#         _set_child_text(doc_el, "vat",      get_price_or_zero(getattr(doc, "vat_amount", None)))
#         _set_child_text(doc_el, "total",    get_price_or_zero(getattr(doc, "amount_with_vat", None)))

#         # --- валюта + курс ---
#         currency = smart_str((getattr(doc, "currency", "") or "EUR").upper())
#         _set_child_text(doc_el, "currency", currency)
#         rate_val = _get_currency_rate(currency, inv_date)
#         _set_child_text(doc_el, "currencyrate", ("%f" % rate_val).rstrip('0').rstrip('.') or "1")

#         # --- ссылка/файл ---
#         _set_child_text(doc_el, "url", smart_str(getattr(doc, "preview_url", "") or ""))
#         _set_child_text(doc_el, "filename", smart_str(getattr(doc, "original_filename", "") or f"{dok_id}.pdf"))

#         # --- флаги ---
#         report2isaf = True if getattr(doc, "report_to_isaf", None) is None else bool(getattr(doc, "report_to_isaf"))
#         separatevat = True if getattr(doc, "separate_vat", None) is None else bool(getattr(doc, "separate_vat"))
#         _set_child_text(doc_el, "report2isaf", "true" if report2isaf else "false")
#         _set_child_text(doc_el, "separatevat", "true" if separatevat else "false")

#         # --- стороны (seller*/buyer*) — используем ТОЛЬКО *_id,
#         #     НО дублируем их в sellercode/buyercode для плагина ---
#         seller_id_val = _party_code_from_id(getattr(doc, "seller_id", None))
#         _set_child_text(doc_el, "sellerid", seller_id_val)
#         _set_child_text(doc_el, "sellercode", seller_id_val)  # важно для фильтра плагина
#         _set_child_text(doc_el, "sellervat", smart_str(getattr(doc, "seller_vat_code", "") or ""))
#         _set_child_text(doc_el, "sellername", _party_name_or_random(getattr(doc, "seller_name", None)))
#         _set_child_text(doc_el, "selleraddress", smart_str(getattr(doc, "seller_address", "") or ""))
#         _set_child_text(doc_el, "sellerisperson", "true" if getattr(doc, "seller_is_person", False) else "false")
#         _set_child_text(doc_el, "sellercountry", smart_str((getattr(doc, "seller_country_iso", "") or "LT").lower()))
#         _set_child_text(doc_el, "selleriban", smart_str(getattr(doc, "seller_iban", "") or ""))

#         buyer_id_val = _party_code_from_id(getattr(doc, "buyer_id", None))
#         _set_child_text(doc_el, "buyerid", buyer_id_val)
#         _set_child_text(doc_el, "buyercode", buyer_id_val)  # важно для фильтра плагина
#         _set_child_text(doc_el, "buyervat", smart_str(getattr(doc, "buyer_vat_code", "") or ""))
#         _set_child_text(doc_el, "buyername", _party_name_or_random(getattr(doc, "buyer_name", None)))
#         _set_child_text(doc_el, "buyeraddress", smart_str(getattr(doc, "buyer_address", "") or ""))
#         _set_child_text(doc_el, "buyerisperson", "true" if getattr(doc, "buyer_is_person", False) else "false")
#         _set_child_text(doc_el, "buyercountry", smart_str((getattr(doc, "buyer_country_iso", "") or "LT").lower()))

#         # --- company_code → нужное поле (buyercode/sellercode) ---
#         if dir_ == 'pirkimas':
#             derived_cc = buyer_id_val
#             final_cc = smart_str(company_code or derived_cc)
#             if final_cc:
#                 _set_child_text(doc_el, "buyercode", final_cc)
#         else:
#             derived_cc = seller_id_val
#             final_cc = smart_str(company_code or derived_cc)
#             if final_cc:
#                 _set_child_text(doc_el, "sellercode", final_cc)

#         # --- receipt ---
#         _set_child_text(doc_el, "hasreceipt", "true" if getattr(doc, "with_receipt", False) else "false")

#         # --- строки ---
#         line_items = _iter_line_items(doc)
#         # источник pvm-кодов: multi (map) / single (из строки)
#         line_map = getattr(doc, "_pvm_line_map", None)

#         if line_items:
#             for idx, li in enumerate(line_items):
#                 line_el = ET.SubElement(doc_el, "line")
#                 _set_child_text(line_el, "lineid", str(idx))

#                 _set_child_text(line_el, "price",      get_price_or_zero(getattr(li, "price", None)))
#                 _set_child_text(line_el, "subtotal",   get_price_or_zero(getattr(li, "subtotal", None)))
#                 _set_child_text(line_el, "vat",        get_price_or_zero(getattr(li, "vat", None)))
#                 _set_child_text(line_el, "vatpercent", get_price_or_zero(getattr(li, "vat_percent", None)))
#                 _set_child_text(line_el, "total",      get_price_or_zero(getattr(li, "total", None)))

#                 code_val = smart_str(
#                     getattr(li, "prekes_kodas", "") or getattr(li, "prekes_barkodas", "") or "neraPrekesKodo"
#                 )
#                 _set_child_text(line_el, "code", code_val)

#                 _set_child_text(line_el, "name",      smart_str(getattr(li, "prekes_pavadinimas", "") or ""))
#                 _set_child_text(line_el, "unit",      smart_str(getattr(li, "unit", "") or "vnt"))
#                 _set_child_text(line_el, "quantity",  get_price_or_zero(getattr(li, "quantity", None)))

#                 # >>> важный момент: vatclass
#                 if line_map is not None:  # multi
#                     vatclass = (line_map or {}).get(getattr(li, "id", None))
#                 else:  # single
#                     vatclass = getattr(li, "pvm_kodas", None)
#                 _set_child_text(line_el, "vatclass", smart_str(vatclass or ""))
#                 # <<<

#                 _set_child_text(line_el, "warehouse", smart_str(getattr(li, "sandelio_kodas", "") or ""))
#                 _set_child_text(line_el, "object",    "")
#         else:
#             line_el = ET.SubElement(doc_el, "line")
#             _set_child_text(line_el, "lineid", "0")
#             _set_child_text(line_el, "price",      get_price_or_zero(getattr(doc, "amount_wo_vat", None)))
#             _set_child_text(line_el, "subtotal",   get_price_or_zero(getattr(doc, "amount_wo_vat", None)))
#             _set_child_text(line_el, "vat",        get_price_or_zero(getattr(doc, "vat_amount", None)))
#             _set_child_text(line_el, "vatpercent", get_price_or_zero(getattr(doc, "vat_percent", None)) or "0")
#             _set_child_text(line_el, "total",      get_price_or_zero(getattr(doc, "amount_with_vat", None)))
#             _set_child_text(line_el, "code",       "neraPrekesKodo")
#             _set_child_text(line_el, "name",       smart_str(getattr(doc, "prekes_pavadinimas", "") or ""))
#             _set_child_text(line_el, "unit",       "vnt")
#             _set_child_text(line_el, "quantity",   "1")
#             _set_child_text(line_el, "vatclass",   smart_str(getattr(doc, "pvm_kodas", "") or ""))
#             _set_child_text(line_el, "warehouse",  smart_str(getattr(doc, "sandelio_kodas", "") or ""))
#             _set_child_text(line_el, "object",     "")

#     xml_bytes = _pretty_bytes(root)
#     return expand_empty_tags(xml_bytes)


# # =========================
# # Доп. хелперы (частично для совместимости)
# # =========================

# def _docnum_and_id(doc) -> str:
#     """
#     (Не используется больше для docser/docnum; оставлен для совместимости.)
#     Собирает docnum/id из серии и номера:
#     - если number не начинается с series -> series+number
#     - иначе -> number
#     """
#     series = smart_str(getattr(doc, "document_series", "") or "")
#     number = smart_str(getattr(doc, "document_number", "") or "")
#     if series and not number.startswith(series):
#         return f"{series}{number}"
#     return number or "NERANUMERIO"


# def _iter_line_items(doc) -> list:
#     """
#     Безопасно получаем список LineItem:
#     - RelatedManager -> .all() (и .exists() если есть)
#     - список/кортеж -> как есть
#     - иначе -> []
#     """
#     li = getattr(doc, "line_items", None)
#     if li is None:
#         return []
#     if hasattr(li, "all"):
#         qs = li.all()
#         try:
#             if hasattr(qs, "exists") and not qs.exists():
#                 return []
#         except Exception:
#             pass
#         return list(qs)
#     if isinstance(li, (list, tuple)):
#         return list(li)
#     return []


# # =========================
# # Публичные функции экспорта
# # =========================

# def export_documents_group_to_apskaita5_files(
#     documents: Iterable,
#     site_url: str,
#     company_code: Optional[str] = None,
#     direction: Optional[str] = None,  # если указать, все документы сначала классифицируются, потом фильтруются
# ) -> Tuple[bytes, str, str]:
#     """
#     Возвращает (content_bytes, filename, content_type).

#     Правила:
#       - если в выборке только pirkimas → один XML: YYYY-MM-DD_pirkimai_apskaita5.xml
#       - если только pardavimas        → один XML: YYYY-MM-DD_pardavimai_apskaita5.xml
#       - если оба типа                 → ZIP:      YYYY-MM-DD_apskaita5.zip, внутри два XML

#     company_code:
#       - если None, вычисляется из документа (теперь только buyer_id/seller_id с fallback NERAKODO####)
#     """
#     docs = list(documents)  # чтобы можно было итерироваться несколько раз
#     pirkimai = []
#     pardavimai = []
#     for d in docs:
#         if _infer_direction(d, direction) == 'pirkimas':
#             pirkimai.append(d)
#         else:
#             pardavimai.append(d)

#     today = _today_str_iso()

#     if pirkimai and not pardavimai:
#         xml_bytes = _build_apskaita5_xml_for_documents(pirkimai, site_url, company_code, 'pirkimas')
#         return xml_bytes, f"{today}_pirkimai_apskaita5.xml", "application/xml"

#     if pardavimai and not pirkimai:
#         xml_bytes = _build_apskaita5_xml_for_documents(pardavimai, site_url, company_code, 'pardavimas')
#         return xml_bytes, f"{today}_pardavimai_apskaita5.xml", "application/xml"

#     # оба типа → ZIP
#     zip_buf = BytesIO()
#     with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
#         if pirkimai:
#             p_bytes = _build_apskaita5_xml_for_documents(pirkimai, site_url, company_code, 'pirkimas')
#             zf.writestr(f"{today}_pirkimai_apskaita5.xml", p_bytes)
#         if pardavimai:
#             s_bytes = _build_apskaita5_xml_for_documents(pardavimai, site_url, company_code, 'pardavimas')
#             zf.writestr(f"{today}_pardavimai_apskaita5.xml", s_bytes)

#     return zip_buf.getvalue(), f"{today}_apskaita5.zip", "application/zip"


# # Обратная совместимость: старая функция, возвращающая только bytes.
# # Если типов два, вернёт ZIP-байты; если один — XML-байты.
# def export_documents_group_to_apskaita5(
#     documents: Iterable,
#     site_url: str,
#     company_code: Optional[str] = None,
#     direction: Optional[str] = None,
# ) -> bytes:
#     content, _filename, _ctype = export_documents_group_to_apskaita5_files(
#         documents=documents,
#         site_url=site_url,
#         company_code=company_code,
#         direction=direction,
#     )
#     return content