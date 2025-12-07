import os
import logging
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import date, datetime
from typing import List, Dict, Any

from openpyxl import load_workbook
from openpyxl.styles import Font, Alignment

logger = logging.getLogger(__name__)

# =========================
# Конфиг путей
# =========================
env_value = os.getenv("BUTENT_TEMPLATES_DIR")

if not env_value:
    raise ValueError("BUTENT_TEMPLATES_DIR not set in .env")

TEMPLATES_DIR = Path(env_value)

# Единый шаблон для обоих режимов (suminis и kiekinis)
BUTENT_TEMPLATE_FILE = "Butent_Import_Template.xlsx"

# =========================
# Helpers
# =========================

def _safe_D(x):
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _s(v):
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def _is_zero(v) -> bool:
    """Нулевая ставка НДС? None/'' считаем как 0."""
    try:
        return Decimal(str(v)) == 0
    except Exception:
        return True


EU_ISO2 = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
}


def _is_eu_country(iso: object) -> bool:
    """True только для явных ISO2 из списка ЕС. Пустое значение -> False."""
    if not iso:
        return False
    return str(iso).strip().upper() in EU_ISO2


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


def _get_butent_isaf_flag(doc) -> int:
    """
    Для Būtent возвращает 1 или 0:
      - 0 -> НЕ включать в i.SAF (Neformuoti)
      - 1 -> включать в i.SAF (по умолчанию)
    """
    rivile_code = _pick_isaf_for_purchase(doc)
    return 0 if rivile_code == "12" else 1


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
    Если все пусто — вернётся "".
    """
    sid = _s(getattr(doc, id_field, None))
    if sid:
        logger.info("[BUTENT:PARTY] %s: %s -> %s", role, id_field, sid)
        return sid

    svat = _s(getattr(doc, vat_field, None))
    if svat:
        logger.info("[BUTENT:PARTY] %s: %s -> %s", role, vat_field, svat)
        return svat

    sidp = _s(getattr(doc, id_programoje_field, None))
    if sidp:
        logger.info("[BUTENT:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
        return sidp

    logger.info("[BUTENT:PARTY] %s: empty id/vat/id_programoje -> ''", role)
    return ""


def _get_client_data_for_butent(doc) -> Dict[str, Any]:
    """
    Возвращает словарь с данными клиента для колонок K-Q.
    Логика:
      - pirkimas -> seller (продавец)
      - pardavimas -> buyer (покупатель)
    """
    doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()

    if doc_type == "pirkimas":
        # Продавец
        code = get_party_code(
            doc,
            role="seller",
            id_field="seller_id",
            vat_field="seller_vat_code",
            id_programoje_field="seller_id_programoje",
        )
        return {
            "code": code,
            "fizinis": 1 if getattr(doc, "seller_is_person", False) else 0,
            "vat": _s(getattr(doc, "seller_vat_code", "")),
            "name": _s(getattr(doc, "seller_name", "")),
            "address": _s(getattr(doc, "seller_address", "")),
            "country": _s(getattr(doc, "seller_country_iso", "")),
            "iban": _s(getattr(doc, "seller_iban", "")),
        }
    else:
        # Покупатель
        code = get_party_code(
            doc,
            role="buyer",
            id_field="buyer_id",
            vat_field="buyer_vat_code",
            id_programoje_field="buyer_id_programoje",
        )
        return {
            "code": code,
            "fizinis": 1 if getattr(doc, "buyer_is_person", False) else 0,
            "vat": _s(getattr(doc, "buyer_vat_code", "")),
            "name": _s(getattr(doc, "buyer_name", "")),
            "address": _s(getattr(doc, "buyer_address", "")),
            "country": _s(getattr(doc, "buyer_country_iso", "")),
            "iban": _s(getattr(doc, "buyer_iban", "")),
        }


def _format_date_for_butent(dt) -> str:
    """
    Форматирует дату в строку 'YYYY.MM.DD' для Būtent.
    """
    if not dt:
        return ""
    if isinstance(dt, str):
        # Попытка парсинга строки
        try:
            dt = datetime.strptime(dt, "%Y-%m-%d").date()
        except ValueError:
            return ""
    if isinstance(dt, (date, datetime)):
        return dt.strftime("%Y.%m.%d")
    return ""


def _get_operacija(doc, user=None) -> str:
    """
    Определяет операцию для колонки H:
      - pirkimas -> "Pajamavimas" (или из user.butent_extra_fields['pirkimas_operacija'])
      - pardavimas -> "Pardavimas" (или из user.butent_extra_fields['pardavimas_operacija'])
    """
    doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
    
    # Пытаемся взять из user.butent_extra_fields
    if user and hasattr(user, "butent_extra_fields") and user.butent_extra_fields:
        extra_fields = user.butent_extra_fields
        
        if doc_type == "pirkimas":
            custom_op = extra_fields.get("pirkimas_operacija", "").strip()
            if custom_op:
                logger.info(
                    "[BUTENT:OPERACIJA] doc=%s using custom pirkimas_operacija=%r",
                    getattr(doc, "pk", None), custom_op
                )
                return custom_op
        elif doc_type == "pardavimas":
            custom_op = extra_fields.get("pardavimas_operacija", "").strip()
            if custom_op:
                logger.info(
                    "[BUTENT:OPERACIJA] doc=%s using custom pardavimas_operacija=%r",
                    getattr(doc, "pk", None), custom_op
                )
                return custom_op
    
    # Дефолтные значения
    if doc_type == "pirkimas":
        return "Pajamavimas"
    elif doc_type == "pardavimas":
        return "Pardavimas"
    else:
        logger.warning("[BUTENT] Unknown pirkimas_pardavimas=%r, defaulting to Pajamavimas", doc_type)
        return "Pajamavimas"


def _get_sandelis(doc, user=None) -> str:
    """
    Определяет склад для колонки I:
      - doc.sandelio_kodas если есть
      - иначе из user.butent_extra_fields (pirkimas_sandelis/pardavimas_sandelis)
      - иначе "S1"
    """
    # Приоритет 1: значение из документа
    sandelis = _s(getattr(doc, "sandelio_kodas", ""))
    if sandelis:
        return sandelis
    
    # Приоритет 2: значение из user.butent_extra_fields
    if user and hasattr(user, "butent_extra_fields") and user.butent_extra_fields:
        extra_fields = user.butent_extra_fields
        doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
        
        if doc_type == "pirkimas":
            custom_sandelis = extra_fields.get("pirkimas_sandelis", "").strip()
            if custom_sandelis:
                logger.info(
                    "[BUTENT:SANDELIS] doc=%s using custom pirkimas_sandelis=%r",
                    getattr(doc, "pk", None), custom_sandelis
                )
                return custom_sandelis
        elif doc_type == "pardavimas":
            custom_sandelis = extra_fields.get("pardavimas_sandelis", "").strip()
            if custom_sandelis:
                logger.info(
                    "[BUTENT:SANDELIS] doc=%s using custom pardavimas_sandelis=%r",
                    getattr(doc, "pk", None), custom_sandelis
                )
                return custom_sandelis
    
    # Приоритет 3: дефолтное значение
    return "S1"


def _format_decimal(value, decimals=2) -> float:
    """
    Преобразует значение в float с округлением.
    ✅ Возвращает ЧИСЛО (float), не строку!
    """
    try:
        d = Decimal(str(value))
        rounded = d.quantize(Decimal(10) ** -decimals, rounding=ROUND_HALF_UP)
        return float(rounded)
    except Exception:
        return 0.0


def _distribute_discount_to_butent_lines(doc, items_list: list) -> None:
    """
    Распределяет скидку документа (invoice_discount_wo_vat) на строки товаров.
    
    ВАЖНО: Būtent не имеет поля для скидки документа, поэтому мы:
      1. ВЫЧИТАЕМ долю скидки из subtotal каждой строки
      2. ПЕРЕСЧИТЫВАЕМ price = new_subtotal / quantity
      3. ПЕРЕСЧИТЫВАЕМ vat = new_subtotal × vat_percent / 100
    
    Args:
        doc: документ с полем invoice_discount_wo_vat
        items_list: список объектов LineItem (модифицируется in-place)
    
    Модифицирует:
        Устанавливает атрибуты _butent_price_after_discount и _butent_vat_after_discount
    """
    if not items_list:
        return
    
    # Безопасное получение скидки (может быть None, пустая строка, 0)
    discount_raw = getattr(doc, "invoice_discount_wo_vat", None)
    if discount_raw in (None, "", 0, "0"):
        return  # Нет скидки — ничего не делаем
    
    try:
        discount_wo = Decimal(str(discount_raw))
    except (ValueError, InvalidOperation):
        logger.warning(
            "[BUTENT:DISCOUNT] doc=%s invalid discount value: %r",
            getattr(doc, "pk", None), discount_raw
        )
        return
    
    if discount_wo <= 0:
        return  # Нет скидки — ничего не делаем
    
    logger.info(
        "[BUTENT:DISCOUNT] doc=%s distributing discount=%.2f across %d lines",
        getattr(doc, "pk", None), discount_wo, len(items_list)
    )
    
    # Сумма subtotal ДО скидки (price × quantity для каждой строки)
    sum_subtotal_before = Decimal("0")
    for item in items_list:
        price = Decimal(str(getattr(item, "price", 0) or 0))
        qty = Decimal(str(getattr(item, "quantity", 1) or 1))
        sum_subtotal_before += price * qty
    
    if sum_subtotal_before <= 0:
        logger.warning(
            "[BUTENT:DISCOUNT] doc=%s sum_subtotal=0, cannot distribute",
            getattr(doc, "pk", None)
        )
        return
    
    discount_distributed = Decimal("0")
    
    for i, item in enumerate(items_list):
        qty = Decimal(str(getattr(item, "quantity", 1) or 1))
        price_before = Decimal(str(getattr(item, "price", 0) or 0))
        vat_percent = Decimal(str(getattr(item, "vat_percent", 0) or 0))
        
        subtotal_before = price_before * qty
        
        # Последняя строка получает остаток (защита от округления)
        if i == len(items_list) - 1:
            line_discount = discount_wo - discount_distributed
        else:
            # Доля этой строки в общей сумме
            share = subtotal_before / sum_subtotal_before
            line_discount = (discount_wo * share).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            discount_distributed += line_discount
        
        # Новый subtotal после скидки
        subtotal_after = subtotal_before - line_discount
        
        # ПЕРЕСЧИТЫВАЕМ PRICE: price = subtotal_after / qty
        if qty > 0:
            price_after = (subtotal_after / qty).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            price_after = Decimal("0")
        
        # КЛЮЧЕВОЙ МОМЕНТ: ПЕРЕСЧИТЫВАЕМ VAT от НОВОГО subtotal
        if vat_percent > 0 and subtotal_after > 0:
            vat_after = (subtotal_after * vat_percent / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            vat_after = Decimal("0")
        
        # Сохраняем финальные значения (после скидки)
        setattr(item, "_butent_price_after_discount", float(price_after))
        setattr(item, "_butent_vat_after_discount", float(vat_after))
        
        logger.debug(
            "[BUTENT:DISCOUNT] line=%d qty=%.2f price: %.2f->%.2f vat: %.2f->%.2f (discount=%.2f)",
            i, 
            float(qty), 
            float(price_before), 
            float(price_after),
            float(Decimal(str(getattr(item, "vat", 0) or 0))),
            float(vat_after),
            float(line_discount)
        )


# =========================
# Основная функция экспорта
# =========================

def export_to_butent(
    documents: List,
    mode: str = "auto",
    user=None
) -> Dict[str, bytes]:
    """
    Экспортирует документы в формат Būtent Excel.

    Args:
        documents: список документов для экспорта
        mode: 'auto' | 'suminis' | 'kiekinis'
              'auto' - автоматически разделяет документы на два файла
              'suminis' - принудительно все в один файл (suminis режим)
              'kiekinis' - принудительно все в один файл (kiekinis режим)
        user: пользователь (для получения butent_extra_fields)

    Returns:
        Dict[str, bytes]: словарь вида {"suminis": bytes, "kiekinis": bytes}
                         где ключи присутствуют только если есть соответствующие документы
    """
    logger.info("[BUTENT:EXPORT] Starting export, docs=%d mode=%s", len(documents), mode)

    if not documents:
        logger.warning("[BUTENT:EXPORT] No documents to export")
        raise ValueError("No documents provided for export")

    # Разделяем документы на две группы
    docs_suminis = []
    docs_kiekinis = []

    if mode == "auto":
        for doc in documents:
            line_items = getattr(doc, "line_items", None)
            has_items = False
            if line_items and hasattr(line_items, "all"):
                has_items = line_items.exists()
            
            if has_items:
                docs_kiekinis.append(doc)
            else:
                docs_suminis.append(doc)
        
        logger.info(
            "[BUTENT:EXPORT] Auto mode: suminis=%d kiekinis=%d",
            len(docs_suminis),
            len(docs_kiekinis)
        )
    elif mode == "suminis":
        docs_suminis = documents
        logger.info("[BUTENT:EXPORT] Force suminis mode: %d docs", len(docs_suminis))
    elif mode == "kiekinis":
        docs_kiekinis = documents
        logger.info("[BUTENT:EXPORT] Force kiekinis mode: %d docs", len(docs_kiekinis))
    else:
        logger.error("[BUTENT:EXPORT] Unknown mode: %s", mode)
        raise ValueError(f"Unknown mode: {mode}")

    result = {}

    # Экспортируем suminis, если есть документы
    if docs_suminis:
        logger.info("[BUTENT:EXPORT] Generating suminis file...")
        result["suminis"] = _generate_butent_file(docs_suminis, "suminis", user)
    
    # Экспортируем kiekinis, если есть документы
    if docs_kiekinis:
        logger.info("[BUTENT:EXPORT] Generating kiekinis file...")
        result["kiekinis"] = _generate_butent_file(docs_kiekinis, "kiekinis", user)

    if not result:
        logger.warning("[BUTENT:EXPORT] No files generated")
        raise ValueError("No documents to export")

    logger.info("[BUTENT:EXPORT] Export completed, files=%s", list(result.keys()))
    return result


def _generate_butent_file(documents: List, mode: str, user=None) -> bytes:
    """
    Генерирует один Excel-файл для Būtent.

    Args:
        documents: список документов для экспорта
        mode: 'suminis' | 'kiekinis'
        user: пользователь (для получения butent_extra_fields)

    Returns:
        bytes: содержимое Excel-файла
    """
    logger.info("[BUTENT:FILE] Generating %s file for %d docs", mode, len(documents))

    # Загружаем шаблон
    template_path = TEMPLATES_DIR / BUTENT_TEMPLATE_FILE
    if not template_path.exists():
        logger.error("[BUTENT:FILE] Template not found: %s", template_path)
        raise FileNotFoundError(f"Būtent template not found: {template_path}")

    wb = load_workbook(template_path)
    ws = wb.active

    # Собираем строки данных
    rows = []

    for doc in documents:
        # Общие данные документа (колонки A-Q)
        operacija = _get_operacija(doc, user)  # ✅ Передаём user
        sandelis = _get_sandelis(doc, user)    # ✅ Передаём user
        isaf = _get_butent_isaf_flag(doc)
        client = _get_client_data_for_butent(doc)

        doc_common = [
            _format_date_for_butent(getattr(doc, "invoice_date", None)),      # A: Data
            _format_date_for_butent(getattr(doc, "operation_date", None)),    # B: Kita data
            _format_date_for_butent(getattr(doc, "due_date", None)),          # C: Terminas
            isaf,                                                              # D: iSAF požymis
            _s(getattr(doc, "document_series", "")),                          # E: Serija
            _s(getattr(doc, "document_number", "")),                          # F: Kiti dok. Nr.
            _s(getattr(doc, "order_number", "")),                             # G: Kiti dok. Nr.2
            operacija,                                                         # H: Operacija
            sandelis,                                                          # I: Sandėlis
            _s(getattr(doc, "preview_url", "")),                              # J: Pastabos
            client["code"],                                                    # K: Kliento kodas
            client["fizinis"],                                                 # L: Požymis jei fizinis
            client["vat"],                                                     # M: PVM mokėtojo kodas
            client["name"],                                                    # N: Pavadinimas
            client["address"],                                                 # O: Adresas
            client["country"],                                                 # P: Šalis
            client["iban"],                                                    # Q: Atsiskaitomoji sąskaita
        ]

        if mode == "suminis":
            # Одна строка на документ (колонки R-Z из документа)
            preke_kodas = (
                _s(getattr(doc, "prekes_kodas", ""))
                or _s(getattr(doc, "prekes_barkodas", ""))
                or "PREKE001"
            )

            row = doc_common + [
                preke_kodas,                                                   # R: Prekės kodas
                1,                                                             # S: Kiekis
                _format_decimal(getattr(doc, "amount_wo_vat", 0)),            # T: Kaina
                _s(getattr(doc, "currency", "EUR") or "EUR"),                 # U: Valiuta
                _format_decimal(getattr(doc, "vat_amount", 0)),               # V: PVM suma
                0,                                                             # W: Atv. PVM taikymas
                _s(getattr(doc, "pvm_kodas", "")),                            # X: PVM kodas
                _s(getattr(doc, "prekes_barkodas", "")),                      # Y: Prekės barkodas
                _s(getattr(doc, "prekes_pavadinimas", "")),                   # Z: Prekės pavadinimas
            ]
            rows.append(row)
            logger.info("[BUTENT:SUMINIS] doc=%s row added", getattr(doc, "pk", None))

        else:  # kiekinis
            # Несколько строк на документ (по одной на товар)
            line_items = getattr(doc, "line_items", None)
            if not line_items or not hasattr(line_items, "all"):
                logger.warning(
                    "[BUTENT:KIEKINIS] doc=%s has no line_items, skipping",
                    getattr(doc, "pk", None)
                )
                continue
            
            items_list = list(line_items.all())
            
            # КЛЮЧЕВОЙ МОМЕНТ: Распределяем скидку документа на строки
            # (если есть invoice_discount_wo_vat)
            _distribute_discount_to_butent_lines(doc, items_list)
            
            items_added = 0
            for item in items_list:
                preke_kodas = (
                    _s(getattr(item, "prekes_kodas", ""))
                    or _s(getattr(item, "prekes_barkodas", ""))
                    or _s(getattr(doc, "prekes_kodas", ""))
                    or "PREKE001"
                )

                # Используем цены ПОСЛЕ распределения скидки (если была скидка)
                price_to_use = getattr(item, "_butent_price_after_discount", None)
                if price_to_use is None:
                    price_to_use = getattr(item, "price", 0)
                
                vat_to_use = getattr(item, "_butent_vat_after_discount", None)
                if vat_to_use is None:
                    vat_to_use = getattr(item, "vat", 0)

                row = doc_common + [
                    preke_kodas,                                               # R: Prekės kodas
                    getattr(item, "quantity", 1),                              # S: Kiekis
                    _format_decimal(price_to_use),                            # T: Kaina (после скидки)
                    _s(getattr(doc, "currency", "EUR") or "EUR"),             # U: Valiuta
                    _format_decimal(vat_to_use),                              # V: PVM suma (после скидки)
                    0,                                                         # W: Atv. PVM taikymas
                    _s(getattr(item, "pvm_kodas", "")),                       # X: PVM kodas
                    _s(getattr(item, "prekes_barkodas", "")),                 # Y: Prekės barkodas
                    _s(getattr(item, "prekes_pavadinimas", "")),              # Z: Prekės pavadinimas
                ]
                rows.append(row)
                items_added += 1

            # Проверка сумм после распределения скидки
            discount_val = getattr(doc, "invoice_discount_wo_vat", None)
            if discount_val is not None and discount_val > 0:
                sum_price_qty = sum(
                    Decimal(str(getattr(item, "_butent_price_after_discount", None) 
                                or getattr(item, "price", 0))) * 
                    Decimal(str(getattr(item, "quantity", 1)))
                    for item in items_list
                )
                sum_vat = sum(
                    Decimal(str(getattr(item, "_butent_vat_after_discount", None) 
                                or getattr(item, "vat", 0)))
                    for item in items_list
                )
                logger.info(
                    "[BUTENT:KIEKINIS] doc=%s after discount: Σ(price×qty)=%.2f Σ(vat)=%.2f",
                    getattr(doc, "pk", None),
                    float(sum_price_qty),
                    float(sum_vat)
                )

            logger.info(
                "[BUTENT:KIEKINIS] doc=%s items=%d",
                getattr(doc, "pk", None),
                items_added,
            )

    # Записываем данные в шаблон (начиная со 2-й строки, если 1-я = заголовок)
    start_row = 2
    for idx, row_data in enumerate(rows, start=start_row):
        for col_idx, value in enumerate(row_data, start=1):
            cell = ws.cell(row=idx, column=col_idx)
            
            # Числовые столбцы: D, L, S, T, V, W
            # D=4 (iSAF), L=12 (fizinis), S=19 (Kiekis), T=20 (Kaina), V=22 (PVM suma), W=23 (Atv. PVM)
            if col_idx in [4, 12, 19, 20, 22, 23]:
                # ✅ КРИТИЧНО: СНАЧАЛА устанавливаем data_type, ПОТОМ value
                if isinstance(value, (int, float)):
                    cell.data_type = 'n'  # Явно "число"
                    cell.value = value
                    
                    # Логируем первую строку
                    if idx == start_row and col_idx in [19, 20, 22]:
                        logger.debug(
                            "[BUTENT:CELL] row=%d col=%d value=%r type=%s data_type=%s",
                            idx, col_idx, value, type(value).__name__, cell.data_type
                        )
                elif isinstance(value, str):
                    # Пробуем преобразовать строку в число
                    try:
                        num_value = float(value)
                        cell.data_type = 'n'
                        cell.value = num_value
                        logger.warning(
                            "[BUTENT:CELL] Converted string to float: row=%d col=%d '%s'->%f",
                            idx, col_idx, value, num_value
                        )
                    except (ValueError, TypeError):
                        # Не число - записываем как есть
                        cell.value = value
                else:
                    cell.value = value
                
                # Форматирование для S, T, V (два десятичных знака)
                if col_idx in [19, 20, 22]:
                    cell.number_format = "0.00"
            else:
                cell.value = value

    logger.info("[BUTENT:FILE] Written %d rows to Excel", len(rows))

    # Сохраняем в BytesIO
    from io import BytesIO

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    logger.info("[BUTENT:FILE] File generation completed")
    return output.read()


# =========================
# Вспомогательная функция для создания шаблона
# =========================

def create_butent_template():
    """
    Создаёт пустой шаблон Excel для импорта в Būtent.
    Используется для первоначальной настройки.
    """
    from openpyxl import Workbook
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Import"

    # Заголовки
    headers = [
        "Data",                      # A
        "Kita data",                 # B
        "Terminas",                  # C
        "iSAF požymis",              # D
        "Serija",                    # E
        "Kiti dok. Nr.",             # F
        "Kiti dok. Nr.2",            # G
        "Operacija",                 # H
        "Sandėlis",                  # I
        "Pastabos",                  # J
        "Kliento kodas",             # K
        "Požymis jei fizinis",       # L
        "PVM mokėtojo kodas",        # M
        "Pavadinimas",               # N
        "Adresas",                   # O
        "Šalis",                     # P
        "Atsiskaitomoji sąskaita",   # Q
        "Prekės kodas",              # R
        "Kiekis",                    # S
        "Kaina",                     # T
        "Valiuta",                   # U
        "PVM suma",                  # V
        "Atv. PVM taikymas",         # W
        "PVM kodas",                 # X
        "Prekės barkodas",           # Y
        "Prekės pavadinimas",        # Z
    ]

    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.value = header
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")

    # Устанавливаем ширину колонок
    ws.column_dimensions["A"].width = 12
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 10
    ws.column_dimensions["F"].width = 15
    ws.column_dimensions["G"].width = 15
    ws.column_dimensions["H"].width = 15
    ws.column_dimensions["I"].width = 12
    ws.column_dimensions["J"].width = 30
    ws.column_dimensions["K"].width = 15
    ws.column_dimensions["L"].width = 12
    ws.column_dimensions["M"].width = 18
    ws.column_dimensions["N"].width = 25
    ws.column_dimensions["O"].width = 30
    ws.column_dimensions["P"].width = 8
    ws.column_dimensions["Q"].width = 25
    ws.column_dimensions["R"].width = 15
    ws.column_dimensions["S"].width = 10
    ws.column_dimensions["T"].width = 12
    ws.column_dimensions["U"].width = 10
    ws.column_dimensions["V"].width = 12
    ws.column_dimensions["W"].width = 12
    ws.column_dimensions["X"].width = 12
    ws.column_dimensions["Y"].width = 15
    ws.column_dimensions["Z"].width = 25

    # Сохраняем
    template_path = TEMPLATES_DIR / BUTENT_TEMPLATE_FILE
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    wb.save(template_path)

    logger.info("[BUTENT:TEMPLATE] Created template: %s", template_path)
    return template_path












# import os
# import logging
# from pathlib import Path
# from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
# from datetime import date, datetime
# from typing import List, Dict, Any

# from openpyxl import load_workbook
# from openpyxl.styles import Font, Alignment

# logger = logging.getLogger(__name__)

# # =========================
# # Конфиг путей
# # =========================
# env_value = os.getenv("BUTENT_TEMPLATES_DIR")

# if not env_value:
#     raise ValueError("BUTENT_TEMPLATES_DIR not set in .env")

# TEMPLATES_DIR = Path(env_value)

# # Единый шаблон для обоих режимов (suminis и kiekinis)
# BUTENT_TEMPLATE_FILE = "Butent_Import_Template.xlsx"

# # =========================
# # Helpers
# # =========================

# def _safe_D(x):
#     """Безопасное преобразование в Decimal."""
#     try:
#         return Decimal(str(x))
#     except Exception:
#         return Decimal("0")


# def _s(v):
#     """Безопасная строка с strip()."""
#     return str(v).strip() if v is not None else ""


# def _is_zero(v) -> bool:
#     """Нулевая ставка НДС? None/'' считаем как 0."""
#     try:
#         return Decimal(str(v)) == 0
#     except Exception:
#         return True


# EU_ISO2 = {
#     "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
#     "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
# }


# def _is_eu_country(iso: object) -> bool:
#     """True только для явных ISO2 из списка ЕС. Пустое значение -> False."""
#     if not iso:
#         return False
#     return str(iso).strip().upper() in EU_ISO2


# def _pick_isaf_for_purchase(doc):
#     """
#     Возвращает:
#       - '12' -> Neformuoti (НЕ включать в i.SAF)
#       - None  -> не ставить тег вовсе (включать по умолчанию)

#     Правило:
#       если (seller_country_iso пусто ИЛИ не-ЕС) И ВСЕ ставки vat_percent по строкам == 0
#       -> '12', иначе None.
#     """
#     country = getattr(doc, "seller_country_iso", "") or ""
#     is_eu = _is_eu_country(country)
#     non_eu_or_empty = not is_eu

#     line_items = getattr(doc, "line_items", None)
#     if line_items and hasattr(line_items, "all") and line_items.exists():
#         vat_zero_all = all(_is_zero(getattr(it, "vat_percent", None)) for it in line_items.all())
#     else:
#         vat_zero_all = _is_zero(getattr(doc, "vat_percent", None))

#     if non_eu_or_empty and vat_zero_all:
#         return "12"

#     return None


# def _get_butent_isaf_flag(doc) -> int:
#     """
#     Для Būtent возвращает 1 или 0:
#       - 0 -> НЕ включать в i.SAF (Neformuoti)
#       - 1 -> включать в i.SAF (по умолчанию)
#     """
#     rivile_code = _pick_isaf_for_purchase(doc)
#     return 0 if rivile_code == "12" else 1


# def get_party_code(
#     doc,
#     *,
#     role: str,
#     id_field: str,
#     vat_field: str,
#     id_programoje_field: str,
# ) -> str:
#     """
#     Код стороны (seller/buyer) по приоритету:
#       1) *_id
#       2) *_vat_code
#       3) *_id_programoje
#     Если все пусто — вернётся "".
#     """
#     sid = _s(getattr(doc, id_field, None))
#     if sid:
#         logger.info("[BUTENT:PARTY] %s: %s -> %s", role, id_field, sid)
#         return sid

#     svat = _s(getattr(doc, vat_field, None))
#     if svat:
#         logger.info("[BUTENT:PARTY] %s: %s -> %s", role, vat_field, svat)
#         return svat

#     sidp = _s(getattr(doc, id_programoje_field, None))
#     if sidp:
#         logger.info("[BUTENT:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
#         return sidp

#     logger.info("[BUTENT:PARTY] %s: empty id/vat/id_programoje -> ''", role)
#     return ""


# def _get_client_data_for_butent(doc) -> Dict[str, Any]:
#     """
#     Возвращает словарь с данными клиента для колонок K-Q.
#     Логика:
#       - pirkimas -> seller (продавец)
#       - pardavimas -> buyer (покупатель)
#     """
#     doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()

#     if doc_type == "pirkimas":
#         # Продавец
#         code = get_party_code(
#             doc,
#             role="seller",
#             id_field="seller_id",
#             vat_field="seller_vat_code",
#             id_programoje_field="seller_id_programoje",
#         )
#         return {
#             "code": code,
#             "fizinis": 1 if getattr(doc, "seller_is_person", False) else 0,
#             "vat": _s(getattr(doc, "seller_vat_code", "")),
#             "name": _s(getattr(doc, "seller_name", "")),
#             "address": _s(getattr(doc, "seller_address", "")),
#             "country": _s(getattr(doc, "seller_country_iso", "")),
#             "iban": _s(getattr(doc, "seller_iban", "")),
#         }
#     else:
#         # Покупатель
#         code = get_party_code(
#             doc,
#             role="buyer",
#             id_field="buyer_id",
#             vat_field="buyer_vat_code",
#             id_programoje_field="buyer_id_programoje",
#         )
#         return {
#             "code": code,
#             "fizinis": 1 if getattr(doc, "buyer_is_person", False) else 0,
#             "vat": _s(getattr(doc, "buyer_vat_code", "")),
#             "name": _s(getattr(doc, "buyer_name", "")),
#             "address": _s(getattr(doc, "buyer_address", "")),
#             "country": _s(getattr(doc, "buyer_country_iso", "")),
#             "iban": _s(getattr(doc, "buyer_iban", "")),
#         }


# def _format_date_for_butent(dt) -> str:
#     """
#     Форматирует дату в строку 'YYYY.MM.DD' для Būtent.
#     """
#     if not dt:
#         return ""
#     if isinstance(dt, str):
#         # Попытка парсинга строки
#         try:
#             dt = datetime.strptime(dt, "%Y-%m-%d").date()
#         except ValueError:
#             return ""
#     if isinstance(dt, (date, datetime)):
#         return dt.strftime("%Y.%m.%d")
#     return ""


# def _get_operacija(doc) -> str:
#     """
#     Определяет операцию для колонки H:
#       - pirkimas -> "Pajamavimas"
#       - pardavimas -> "Pardavimas"
#     """
#     doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
#     if doc_type == "pirkimas":
#         return "Pajamavimas"
#     elif doc_type == "pardavimas":
#         return "Pardavimas"
#     else:
#         logger.warning("[BUTENT] Unknown pirkimas_pardavimas=%r, defaulting to Pajamavimas", doc_type)
#         return "Pajamavimas"


# def _get_sandelis(doc) -> str:
#     """
#     Определяет склад для колонки I:
#       - doc.sandelio_kodas если есть
#       - иначе "S1"
#     """
#     sandelis = _s(getattr(doc, "sandelio_kodas", ""))
#     return sandelis if sandelis else "S1"


# def _format_decimal(value, decimals=2) -> float:
#     """
#     Преобразует значение в float с округлением.
#     ✅ Возвращает ЧИСЛО (float), не строку!
#     """
#     try:
#         d = Decimal(str(value))
#         rounded = d.quantize(Decimal(10) ** -decimals, rounding=ROUND_HALF_UP)
#         return float(rounded)
#     except Exception:
#         return 0.0


# def _distribute_discount_to_butent_lines(doc, items_list: list) -> None:
#     """
#     Распределяет скидку документа (invoice_discount_wo_vat) на строки товаров.
    
#     ВАЖНО: Būtent не имеет поля для скидки документа, поэтому мы:
#       1. ВЫЧИТАЕМ долю скидки из subtotal каждой строки
#       2. ПЕРЕСЧИТЫВАЕМ price = new_subtotal / quantity
#       3. ПЕРЕСЧИТЫВАЕМ vat = new_subtotal × vat_percent / 100
    
#     Args:
#         doc: документ с полем invoice_discount_wo_vat
#         items_list: список объектов LineItem (модифицируется in-place)
    
#     Модифицирует:
#         Устанавливает атрибуты _butent_price_after_discount и _butent_vat_after_discount
#     """
#     if not items_list:
#         return
    
#     # Безопасное получение скидки (может быть None, пустая строка, 0)
#     discount_raw = getattr(doc, "invoice_discount_wo_vat", None)
#     if discount_raw in (None, "", 0, "0"):
#         return  # Нет скидки — ничего не делаем
    
#     try:
#         discount_wo = Decimal(str(discount_raw))
#     except (ValueError, InvalidOperation):
#         logger.warning(
#             "[BUTENT:DISCOUNT] doc=%s invalid discount value: %r",
#             getattr(doc, "pk", None), discount_raw
#         )
#         return
    
#     if discount_wo <= 0:
#         return  # Нет скидки — ничего не делаем
    
#     logger.info(
#         "[BUTENT:DISCOUNT] doc=%s distributing discount=%.2f across %d lines",
#         getattr(doc, "pk", None), discount_wo, len(items_list)
#     )
    
#     # Сумма subtotal ДО скидки (price × quantity для каждой строки)
#     sum_subtotal_before = Decimal("0")
#     for item in items_list:
#         price = Decimal(str(getattr(item, "price", 0) or 0))
#         qty = Decimal(str(getattr(item, "quantity", 1) or 1))
#         sum_subtotal_before += price * qty
    
#     if sum_subtotal_before <= 0:
#         logger.warning(
#             "[BUTENT:DISCOUNT] doc=%s sum_subtotal=0, cannot distribute",
#             getattr(doc, "pk", None)
#         )
#         return
    
#     discount_distributed = Decimal("0")
    
#     for i, item in enumerate(items_list):
#         qty = Decimal(str(getattr(item, "quantity", 1) or 1))
#         price_before = Decimal(str(getattr(item, "price", 0) or 0))
#         vat_percent = Decimal(str(getattr(item, "vat_percent", 0) or 0))
        
#         subtotal_before = price_before * qty
        
#         # Последняя строка получает остаток (защита от округления)
#         if i == len(items_list) - 1:
#             line_discount = discount_wo - discount_distributed
#         else:
#             # Доля этой строки в общей сумме
#             share = subtotal_before / sum_subtotal_before
#             line_discount = (discount_wo * share).quantize(
#                 Decimal("0.01"), rounding=ROUND_HALF_UP
#             )
#             discount_distributed += line_discount
        
#         # Новый subtotal после скидки
#         subtotal_after = subtotal_before - line_discount
        
#         # ПЕРЕСЧИТЫВАЕМ PRICE: price = subtotal_after / qty
#         if qty > 0:
#             price_after = (subtotal_after / qty).quantize(
#                 Decimal("0.01"), rounding=ROUND_HALF_UP
#             )
#         else:
#             price_after = Decimal("0")
        
#         # КЛЮЧЕВОЙ МОМЕНТ: ПЕРЕСЧИТЫВАЕМ VAT от НОВОГО subtotal
#         if vat_percent > 0 and subtotal_after > 0:
#             vat_after = (subtotal_after * vat_percent / Decimal("100")).quantize(
#                 Decimal("0.01"), rounding=ROUND_HALF_UP
#             )
#         else:
#             vat_after = Decimal("0")
        
#         # Сохраняем финальные значения (после скидки)
#         setattr(item, "_butent_price_after_discount", float(price_after))
#         setattr(item, "_butent_vat_after_discount", float(vat_after))
        
#         logger.debug(
#             "[BUTENT:DISCOUNT] line=%d qty=%.2f price: %.2f->%.2f vat: %.2f->%.2f (discount=%.2f)",
#             i, 
#             float(qty), 
#             float(price_before), 
#             float(price_after),
#             float(Decimal(str(getattr(item, "vat", 0) or 0))),
#             float(vat_after),
#             float(line_discount)
#         )


# # =========================
# # Основная функция экспорта
# # =========================

# def export_to_butent(
#     documents: List,
#     mode: str = "auto",
#     user=None
# ) -> Dict[str, bytes]:
#     """
#     Экспортирует документы в формат Būtent Excel.

#     Args:
#         documents: список документов для экспорта
#         mode: 'auto' | 'suminis' | 'kiekinis'
#               'auto' - автоматически разделяет документы на два файла
#               'suminis' - принудительно все в один файл (suminis режим)
#               'kiekinis' - принудительно все в один файл (kiekinis режим)
#         user: пользователь (не используется, но оставлен для совместимости с Rivile)

#     Returns:
#         Dict[str, bytes]: словарь вида {"suminis": bytes, "kiekinis": bytes}
#                          где ключи присутствуют только если есть соответствующие документы
#     """
#     logger.info("[BUTENT:EXPORT] Starting export, docs=%d mode=%s", len(documents), mode)

#     if not documents:
#         logger.warning("[BUTENT:EXPORT] No documents to export")
#         raise ValueError("No documents provided for export")

#     # Разделяем документы на две группы
#     docs_suminis = []
#     docs_kiekinis = []

#     if mode == "auto":
#         for doc in documents:
#             line_items = getattr(doc, "line_items", None)
#             has_items = False
#             if line_items and hasattr(line_items, "all"):
#                 has_items = line_items.exists()
            
#             if has_items:
#                 docs_kiekinis.append(doc)
#             else:
#                 docs_suminis.append(doc)
        
#         logger.info(
#             "[BUTENT:EXPORT] Auto mode: suminis=%d kiekinis=%d",
#             len(docs_suminis),
#             len(docs_kiekinis)
#         )
#     elif mode == "suminis":
#         docs_suminis = documents
#         logger.info("[BUTENT:EXPORT] Force suminis mode: %d docs", len(docs_suminis))
#     elif mode == "kiekinis":
#         docs_kiekinis = documents
#         logger.info("[BUTENT:EXPORT] Force kiekinis mode: %d docs", len(docs_kiekinis))
#     else:
#         logger.error("[BUTENT:EXPORT] Unknown mode: %s", mode)
#         raise ValueError(f"Unknown mode: {mode}")

#     result = {}

#     # Экспортируем suminis, если есть документы
#     if docs_suminis:
#         logger.info("[BUTENT:EXPORT] Generating suminis file...")
#         result["suminis"] = _generate_butent_file(docs_suminis, "suminis")
    
#     # Экспортируем kiekinis, если есть документы
#     if docs_kiekinis:
#         logger.info("[BUTENT:EXPORT] Generating kiekinis file...")
#         result["kiekinis"] = _generate_butent_file(docs_kiekinis, "kiekinis")

#     if not result:
#         logger.warning("[BUTENT:EXPORT] No files generated")
#         raise ValueError("No documents to export")

#     logger.info("[BUTENT:EXPORT] Export completed, files=%s", list(result.keys()))
#     return result


# def _generate_butent_file(documents: List, mode: str) -> bytes:
#     """
#     Генерирует один Excel-файл для Būtent.

#     Args:
#         documents: список документов для экспорта
#         mode: 'suminis' | 'kiekinis'

#     Returns:
#         bytes: содержимое Excel-файла
#     """
#     logger.info("[BUTENT:FILE] Generating %s file for %d docs", mode, len(documents))

#     # Загружаем шаблон
#     template_path = TEMPLATES_DIR / BUTENT_TEMPLATE_FILE
#     if not template_path.exists():
#         logger.error("[BUTENT:FILE] Template not found: %s", template_path)
#         raise FileNotFoundError(f"Būtent template not found: {template_path}")

#     wb = load_workbook(template_path)
#     ws = wb.active

#     # Собираем строки данных
#     rows = []

#     for doc in documents:
#         # Общие данные документа (колонки A-Q)
#         operacija = _get_operacija(doc)
#         sandelis = _get_sandelis(doc)
#         isaf = _get_butent_isaf_flag(doc)
#         client = _get_client_data_for_butent(doc)

#         doc_common = [
#             _format_date_for_butent(getattr(doc, "invoice_date", None)),      # A: Data
#             _format_date_for_butent(getattr(doc, "operation_date", None)),    # B: Kita data
#             _format_date_for_butent(getattr(doc, "due_date", None)),          # C: Terminas
#             isaf,                                                              # D: iSAF požymis
#             _s(getattr(doc, "document_series", "")),                          # E: Serija
#             _s(getattr(doc, "document_number", "")),                          # F: Kiti dok. Nr.
#             _s(getattr(doc, "order_number", "")),                             # G: Kiti dok. Nr.2
#             operacija,                                                         # H: Operacija
#             sandelis,                                                          # I: Sandėlis
#             _s(getattr(doc, "preview_url", "")),                              # J: Pastabos
#             client["code"],                                                    # K: Kliento kodas
#             client["fizinis"],                                                 # L: Požymis jei fizinis
#             client["vat"],                                                     # M: PVM mokėtojo kodas
#             client["name"],                                                    # N: Pavadinimas
#             client["address"],                                                 # O: Adresas
#             client["country"],                                                 # P: Šalis
#             client["iban"],                                                    # Q: Atsiskaitomoji sąskaita
#         ]

#         if mode == "suminis":
#             # Одна строка на документ (колонки R-Z из документа)
#             preke_kodas = (
#                 _s(getattr(doc, "prekes_kodas", ""))
#                 or _s(getattr(doc, "prekes_barkodas", ""))
#                 or "PREKE001"
#             )

#             row = doc_common + [
#                 preke_kodas,                                                   # R: Prekės kodas
#                 1,                                                             # S: Kiekis
#                 _format_decimal(getattr(doc, "amount_wo_vat", 0)),            # T: Kaina
#                 _s(getattr(doc, "currency", "EUR") or "EUR"),                 # U: Valiuta
#                 _format_decimal(getattr(doc, "vat_amount", 0)),               # V: PVM suma
#                 0,                                                             # W: Atv. PVM taikymas
#                 _s(getattr(doc, "pvm_kodas", "")),                            # X: PVM kodas
#                 _s(getattr(doc, "prekes_barkodas", "")),                      # Y: Prekės barkodas
#                 _s(getattr(doc, "prekes_pavadinimas", "")),                   # Z: Prekės pavadinimas
#             ]
#             rows.append(row)
#             logger.info("[BUTENT:SUMINIS] doc=%s row added", getattr(doc, "pk", None))

#         else:  # kiekinis
#             # Несколько строк на документ (по одной на товар)
#             line_items = getattr(doc, "line_items", None)
#             if not line_items or not hasattr(line_items, "all"):
#                 logger.warning(
#                     "[BUTENT:KIEKINIS] doc=%s has no line_items, skipping",
#                     getattr(doc, "pk", None)
#                 )
#                 continue
            
#             items_list = list(line_items.all())
            
#             # КЛЮЧЕВОЙ МОМЕНТ: Распределяем скидку документа на строки
#             # (если есть invoice_discount_wo_vat)
#             _distribute_discount_to_butent_lines(doc, items_list)
            
#             items_added = 0
#             for item in items_list:
#                 preke_kodas = (
#                     _s(getattr(item, "prekes_kodas", ""))
#                     or _s(getattr(item, "prekes_barkodas", ""))
#                     or _s(getattr(doc, "prekes_kodas", ""))
#                     or "PREKE001"
#                 )

#                 # Используем цены ПОСЛЕ распределения скидки (если была скидка)
#                 price_to_use = getattr(item, "_butent_price_after_discount", None)
#                 if price_to_use is None:
#                     price_to_use = getattr(item, "price", 0)
                
#                 vat_to_use = getattr(item, "_butent_vat_after_discount", None)
#                 if vat_to_use is None:
#                     vat_to_use = getattr(item, "vat", 0)

#                 row = doc_common + [
#                     preke_kodas,                                               # R: Prekės kodas
#                     getattr(item, "quantity", 1),                              # S: Kiekis
#                     _format_decimal(price_to_use),                            # T: Kaina (после скидки)
#                     _s(getattr(doc, "currency", "EUR") or "EUR"),             # U: Valiuta
#                     _format_decimal(vat_to_use),                              # V: PVM suma (после скидки)
#                     0,                                                         # W: Atv. PVM taikymas
#                     _s(getattr(item, "pvm_kodas", "")),                       # X: PVM kodas
#                     _s(getattr(item, "prekes_barkodas", "")),                 # Y: Prekės barkodas
#                     _s(getattr(item, "prekes_pavadinimas", "")),              # Z: Prekės pavadinimas
#                 ]
#                 rows.append(row)
#                 items_added += 1

#             # Проверка сумм после распределения скидки
#             discount_val = getattr(doc, "invoice_discount_wo_vat", None)
#             if discount_val is not None and discount_val > 0:
#                 sum_price_qty = sum(
#                     Decimal(str(getattr(item, "_butent_price_after_discount", None) 
#                                 or getattr(item, "price", 0))) * 
#                     Decimal(str(getattr(item, "quantity", 1)))
#                     for item in items_list
#                 )
#                 sum_vat = sum(
#                     Decimal(str(getattr(item, "_butent_vat_after_discount", None) 
#                                 or getattr(item, "vat", 0)))
#                     for item in items_list
#                 )
#                 logger.info(
#                     "[BUTENT:KIEKINIS] doc=%s after discount: Σ(price×qty)=%.2f Σ(vat)=%.2f",
#                     getattr(doc, "pk", None),
#                     float(sum_price_qty),
#                     float(sum_vat)
#                 )

#             logger.info(
#                 "[BUTENT:KIEKINIS] doc=%s items=%d",
#                 getattr(doc, "pk", None),
#                 items_added,
#             )

#     # Записываем данные в шаблон (начиная со 2-й строки, если 1-я = заголовок)
#     start_row = 2
#     for idx, row_data in enumerate(rows, start=start_row):
#         for col_idx, value in enumerate(row_data, start=1):
#             cell = ws.cell(row=idx, column=col_idx)
            
#             # Числовые столбцы: D, L, S, T, V, W
#             # D=4 (iSAF), L=12 (fizinis), S=19 (Kiekis), T=20 (Kaina), V=22 (PVM suma), W=23 (Atv. PVM)
#             if col_idx in [4, 12, 19, 20, 22, 23]:
#                 # ✅ КРИТИЧНО: СНАЧАЛА устанавливаем data_type, ПОТОМ value
#                 if isinstance(value, (int, float)):
#                     cell.data_type = 'n'  # Явно "число"
#                     cell.value = value
                    
#                     # Логируем первую строку
#                     if idx == start_row and col_idx in [19, 20, 22]:
#                         logger.debug(
#                             "[BUTENT:CELL] row=%d col=%d value=%r type=%s data_type=%s",
#                             idx, col_idx, value, type(value).__name__, cell.data_type
#                         )
#                 elif isinstance(value, str):
#                     # Пробуем преобразовать строку в число
#                     try:
#                         num_value = float(value)
#                         cell.data_type = 'n'
#                         cell.value = num_value
#                         logger.warning(
#                             "[BUTENT:CELL] Converted string to float: row=%d col=%d '%s'->%f",
#                             idx, col_idx, value, num_value
#                         )
#                     except (ValueError, TypeError):
#                         # Не число - записываем как есть
#                         cell.value = value
#                 else:
#                     cell.value = value
                
#                 # Форматирование для S, T, V (два десятичных знака)
#                 if col_idx in [19, 20, 22]:
#                     cell.number_format = "0.00"
#             else:
#                 cell.value = value

#     logger.info("[BUTENT:FILE] Written %d rows to Excel", len(rows))

#     # Сохраняем в BytesIO
#     from io import BytesIO

#     output = BytesIO()
#     wb.save(output)
#     output.seek(0)

#     logger.info("[BUTENT:FILE] File generation completed")
#     return output.read()


# # =========================
# # Вспомогательная функция для создания шаблона
# # =========================

# def create_butent_template():
#     """
#     Создаёт пустой шаблон Excel для импорта в Būtent.
#     Используется для первоначальной настройки.
#     """
#     from openpyxl import Workbook
    
#     wb = Workbook()
#     ws = wb.active
#     ws.title = "Import"

#     # Заголовки
#     headers = [
#         "Data",                      # A
#         "Kita data",                 # B
#         "Terminas",                  # C
#         "iSAF požymis",              # D
#         "Serija",                    # E
#         "Kiti dok. Nr.",             # F
#         "Kiti dok. Nr.2",            # G
#         "Operacija",                 # H
#         "Sandėlis",                  # I
#         "Pastabos",                  # J
#         "Kliento kodas",             # K
#         "Požymis jei fizinis",       # L
#         "PVM mokėtojo kodas",        # M
#         "Pavadinimas",               # N
#         "Adresas",                   # O
#         "Šalis",                     # P
#         "Atsiskaitomoji sąskaita",   # Q
#         "Prekės kodas",              # R
#         "Kiekis",                    # S
#         "Kaina",                     # T
#         "Valiuta",                   # U
#         "PVM suma",                  # V
#         "Atv. PVM taikymas",         # W
#         "PVM kodas",                 # X
#         "Prekės barkodas",           # Y
#         "Prekės pavadinimas",        # Z
#     ]

#     for col_idx, header in enumerate(headers, start=1):
#         cell = ws.cell(row=1, column=col_idx)
#         cell.value = header
#         cell.font = Font(bold=True)
#         cell.alignment = Alignment(horizontal="center")

#     # Устанавливаем ширину колонок
#     ws.column_dimensions["A"].width = 12
#     ws.column_dimensions["B"].width = 12
#     ws.column_dimensions["C"].width = 12
#     ws.column_dimensions["D"].width = 12
#     ws.column_dimensions["E"].width = 10
#     ws.column_dimensions["F"].width = 15
#     ws.column_dimensions["G"].width = 15
#     ws.column_dimensions["H"].width = 15
#     ws.column_dimensions["I"].width = 12
#     ws.column_dimensions["J"].width = 30
#     ws.column_dimensions["K"].width = 15
#     ws.column_dimensions["L"].width = 12
#     ws.column_dimensions["M"].width = 18
#     ws.column_dimensions["N"].width = 25
#     ws.column_dimensions["O"].width = 30
#     ws.column_dimensions["P"].width = 8
#     ws.column_dimensions["Q"].width = 25
#     ws.column_dimensions["R"].width = 15
#     ws.column_dimensions["S"].width = 10
#     ws.column_dimensions["T"].width = 12
#     ws.column_dimensions["U"].width = 10
#     ws.column_dimensions["V"].width = 12
#     ws.column_dimensions["W"].width = 12
#     ws.column_dimensions["X"].width = 12
#     ws.column_dimensions["Y"].width = 15
#     ws.column_dimensions["Z"].width = 25

#     # Сохраняем
#     template_path = TEMPLATES_DIR / BUTENT_TEMPLATE_FILE
#     TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
#     wb.save(template_path)

#     logger.info("[BUTENT:TEMPLATE] Created template: %s", template_path)
#     return template_path
