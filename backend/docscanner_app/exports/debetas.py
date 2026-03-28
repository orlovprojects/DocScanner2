import re
import os
import csv
import logging
import zipfile
from io import BytesIO, StringIO
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import date, datetime
from typing import List, Dict, Any

from ..utils.extra_fields import get_extra_for_export

logger = logging.getLogger(__name__)

# =========================
# Константы
# =========================

# Фиксированные типы документов
DOC_TYPE_PIRKIMAS = "865"
DOC_TYPE_PARDAVIMAS = "18"

# Кодировка для Debetas
DEBETAS_ENCODING = "windows-1257"

# Список стран ЕС для i.SAF логики (если понадобится в будущем)
EU_ISO2 = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
}

# Заголовки CSV (порядок колонок)
CSV_HEADERS = [
    "L001",  # Filialas
    "L002",  # Dokumento tipas
    "L003",  # Serija ir Nr.
    "L004",  # Dokumento numeris
    "L005",  # Data
    "L006",  # Kontrahento kodas
    "L007",  # Kontrahento pavadinimas
    "L008",  # Valiuta
    "L009",  # Prekė/paslauga (0/1)
    "L010",  # Prekės kodas
    "L011",  # Prekės pavadinimas
    "L012",  # Mato vienetas
    "L013",  # Ženklas
    "L014",  # Kiekis × 1000
    "L015",  # Suma be PVM × 100
    "L016",  # PVM tarifas × 100
    "L017",  # PVM suma × 100
    "L019",  # Įmonės kodas
    "L020",  # PVM kodas
    "L021",  # Adresas
    "L022",  # Materialiai atsakingas
    "L024",  # Padalinys
    "L026",  # Objektas
    "L059",  # Atskaitingas asmuo
    "L071",  # Pirkėjo banko sąskaita
    "L072",  # Tiekėjo banko sąskaita
    "L075",  # Apmokėti iki
    "L085",  # Nuoroda į dokumentą
]

# =========================
# Конфиг путей шаблонов
# =========================

env_value = os.getenv("DEBETAS_TEMPLATES_DIR")

if not env_value:
    raise ValueError("DEBETAS_TEMPLATES_DIR not set in .env")

DEBETAS_TEMPLATES_DIR = Path(env_value)
DEBETAS_TEMPLATE_CSV = "Debetas_Import_Template.csv"


def get_debetas_template_path() -> Path:
    """
    Возвращает путь к CSV-шаблону Debetas.
    Шаблон должен быть заранее сохранён как Debetas_Import_Template.csv
    в DEBETAS_TEMPLATES_DIR.
    """
    template_path = DEBETAS_TEMPLATES_DIR / DEBETAS_TEMPLATE_CSV
    if not template_path.exists():
        logger.error("[DEBETAS:TEMPLATE] Template not found: %s", template_path)
        raise FileNotFoundError(f"Debetas template not found: {template_path}")
    return template_path


# =========================
# Helpers
# =========================

def _safe_D(x) -> Decimal:
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


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


def _format_date_debetas(dt) -> str:
    """
    Форматирует дату в строку 'yyyymmdd' для Debetas.
    """
    if not dt:
        return ""
    if isinstance(dt, str):
        try:
            dt = datetime.strptime(dt, "%Y-%m-%d").date()
        except ValueError:
            return ""
    if isinstance(dt, (date, datetime)):
        return dt.strftime("%Y%m%d")
    return ""


def _multiply_for_debetas(value, multiplier: int) -> str:
    """
    Умножает значение на multiplier и возвращает как целое число (строка).
    Например: 1.5 × 1000 = "1500", 120.50 × 100 = "12050"
    """
    try:
        d = Decimal(str(value))
        result = (d * multiplier).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        return str(int(result))
    except Exception:
        return "0"


def _get_preke_paslauga(value) -> str:
    """
    Преобразует preke_paslauga в формат Debetas:
    1, 3 -> "0" (prekė/товар)
    2, 4 -> "1" (paslauga/услуга)
    """
    try:
        v = int(value)
        if v in (1, 3):
            return "0"
        elif v in (2, 4):
            return "1"
    except (ValueError, TypeError):
        pass
    return ""


def _is_merge_vat(user) -> bool:
    """
    Проверяет флаг merge_vat из user.extra_settings.
    Логика идентична Rivile ERP экспорту.
    """
    if not user:
        return False
    extra_settings = getattr(user, "extra_settings", None)
    if not extra_settings or not isinstance(extra_settings, dict):
        return False
    return str(extra_settings.get("merge_vat", "0")).strip() == "1"


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
    Если все пусто - вернётся "".
    """
    sid = _s(getattr(doc, id_field, None))
    if sid:
        logger.debug("[DEBETAS:PARTY] %s: %s -> %s", role, id_field, sid)
        return sid

    svat = _s(getattr(doc, vat_field, None))
    if svat:
        logger.debug("[DEBETAS:PARTY] %s: %s -> %s", role, vat_field, svat)
        return svat

    sidp = _s(getattr(doc, id_programoje_field, None))
    if sidp:
        logger.debug("[DEBETAS:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
        return sidp

    logger.debug("[DEBETAS:PARTY] %s: empty id/vat/id_programoje -> ''", role)
    return ""


def _get_client_data_for_debetas(doc) -> Dict[str, Any]:
    """
    Возвращает словарь с данными контрагента.
    Логика:
      - pirkimas -> seller (продавец)
      - pardavimas -> buyer (покупатель)
    """
    doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()

    if doc_type == "pirkimas":
        code = get_party_code(
            doc,
            role="seller",
            id_field="seller_id",
            vat_field="seller_vat_code",
            id_programoje_field="seller_id_programoje",
        )
        return {
            "code": code,
            "name": _s(getattr(doc, "seller_name", "")),
            "vat": _s(getattr(doc, "seller_vat_code", "")),
            "company_id": _s(getattr(doc, "seller_id", "")),
            "address": _s(getattr(doc, "seller_address", "")),
            "iban": _s(getattr(doc, "seller_iban", "")),
        }
    else:
        code = get_party_code(
            doc,
            role="buyer",
            id_field="buyer_id",
            vat_field="buyer_vat_code",
            id_programoje_field="buyer_id_programoje",
        )
        return {
            "code": code,
            "name": _s(getattr(doc, "buyer_name", "")),
            "vat": _s(getattr(doc, "buyer_vat_code", "")),
            "company_id": _s(getattr(doc, "buyer_id", "")),
            "address": _s(getattr(doc, "buyer_address", "")),
            "iban": _s(getattr(doc, "buyer_iban", "")),
        }


def _get_own_company_code_from_doc(doc) -> str:
    """
    Определяет код своей фирмы из документа.

    - pirkimas -> своя фирма buyer
    - pardavimas -> своя фирма seller
    """
    doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()

    if doc_type == "pirkimas":
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


def _get_debetas_extra_for_doc(user, doc, own_company_code=None) -> Dict[str, Any]:
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
    doc_company_code = _get_own_company_code_from_doc(doc)

    extra = {}
    resolved_by = ""

    if requested_code:
        extra = get_extra_for_export(user, "debetas", requested_code)
        if extra:
            resolved_by = requested_code

    if not extra and doc_company_code and doc_company_code != requested_code:
        extra = get_extra_for_export(user, "debetas", doc_company_code)
        if extra:
            resolved_by = doc_company_code

    if not extra:
        extra = get_extra_for_export(user, "debetas", None)
        if extra:
            resolved_by = "__all__/legacy"

    logger.debug(
        "[DEBETAS:EXTRA] doc=%s own_company_code=%r requested_code=%r doc_company_code=%r resolved_by=%r fields=%s",
        getattr(doc, "pk", None),
        own_company_code,
        requested_code,
        doc_company_code,
        resolved_by,
        {k: v for k, v in extra.items() if v} if extra else {},
    )

    return extra or {}


def _get_extra_field_from_profile(extra_fields: Dict[str, Any], doc_type: str, field_name: str, default: str = "") -> str:
    """
    Получает значение из уже резолвленного профиля debetas_extra_fields.
    """
    if not extra_fields:
        return default

    key = f"{doc_type}_{field_name}"
    value = _s(extra_fields.get(key, ""))

    if value:
        logger.debug("[DEBETAS:EXTRA] %s -> %r", key, value)
        return value

    return default


def _get_series_and_number(doc) -> tuple:
    """
    Возвращает (L003, L004) для документа согласно правилам:

    1) Если есть series и number:
        - L003 = series + number (НО: если number уже начинается с series, series из number убираем)
        - L004 = ""
    2) Если series нет, но есть number:
        - если number только цифры и длина 1..7 -> L004 = number, L003 = ""
        - иначе -> L003 = number, L004 = ""
    3) Если ничего нет -> ("", "")

    Ограничения:
      - L003 максимум 15 символов (обрезаем справа, если нужно)
      - L004 максимум 7 цифр (иначе уходит в L003)
    """
    series = _s(getattr(doc, "document_series", ""))
    number = _s(getattr(doc, "document_number", ""))

    series_clean = series.replace(" ", "")
    number_clean = number.replace(" ", "")

    if series_clean and number_clean:
        sc = series_clean
        while number_clean.startswith(sc) and sc:
            number_clean = number_clean[len(sc):]

        l003 = f"{series_clean}{number_clean}"
        if len(l003) > 15:
            logger.warning(
                "[DEBETAS:DOCNO] doc=%s L003 too long (%d), truncating to 15: %r",
                getattr(doc, "pk", None), len(l003), l003
            )
            l003 = l003[:15]
        return (l003, "")

    if not series_clean and number_clean:
        if re.fullmatch(r"\d{1,7}", number_clean):
            return ("", number_clean)

        l003 = number_clean
        if len(l003) > 15:
            logger.warning(
                "[DEBETAS:DOCNO] doc=%s L003 too long (%d), truncating to 15: %r",
                getattr(doc, "pk", None), len(l003), l003
            )
            l003 = l003[:15]
        return (l003, "")

    return ("", "")


def _distribute_discount_to_debetas_lines(doc, items_list: list) -> None:
    """
    Распределяет скидку документа (invoice_discount_wo_vat) на строки товаров.
    Обычный режим: скидка распределяется по subtotal (price × qty).
    """
    if not items_list:
        return

    discount_raw = getattr(doc, "invoice_discount_wo_vat", None)
    if discount_raw in (None, "", 0, "0"):
        return

    try:
        discount_wo = Decimal(str(discount_raw))
    except (ValueError, InvalidOperation):
        logger.warning(
            "[DEBETAS:DISCOUNT] doc=%s invalid discount value: %r",
            getattr(doc, "pk", None), discount_raw
        )
        return

    if discount_wo <= 0:
        return

    logger.info(
        "[DEBETAS:DISCOUNT] doc=%s distributing discount=%.2f across %d lines",
        getattr(doc, "pk", None), discount_wo, len(items_list)
    )

    sum_subtotal_before = Decimal("0")
    for item in items_list:
        price = Decimal(str(getattr(item, "price", 0) or 0))
        qty = Decimal(str(getattr(item, "quantity", 1) or 1))
        sum_subtotal_before += price * qty

    if sum_subtotal_before <= 0:
        logger.warning(
            "[DEBETAS:DISCOUNT] doc=%s sum_subtotal=0, cannot distribute",
            getattr(doc, "pk", None)
        )
        return

    discount_distributed = Decimal("0")

    for i, item in enumerate(items_list):
        qty = Decimal(str(getattr(item, "quantity", 1) or 1))
        price_before = Decimal(str(getattr(item, "price", 0) or 0))
        vat_percent = Decimal(str(getattr(item, "vat_percent", 0) or 0))

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

        if vat_percent > 0 and subtotal_after > 0:
            vat_after = (subtotal_after * vat_percent / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            vat_after = Decimal("0")

        setattr(item, "_debetas_subtotal_after_discount", subtotal_after)
        setattr(item, "_debetas_vat_after_discount", vat_after)

        logger.debug(
            "[DEBETAS:DISCOUNT] line=%d subtotal: %.2f->%.2f vat: %.2f (discount=%.2f)",
            i, float(subtotal_before), float(subtotal_after),
            float(vat_after), float(line_discount)
        )


def _distribute_discount_to_debetas_lines_merge_vat(doc, items_list: list) -> None:
    """
    Распределяет скидку документа при merge_vat=True.
    Логика аналогична Rivile ERP:
      - gross = price × qty + vat (на строку)
      - скидка распределяется пропорционально gross
      - результат: _debetas_gross_after_discount на каждой строке
    """
    if not items_list:
        return

    item_grosses: list[Decimal] = []
    gross_total = Decimal("0")

    for item in items_list:
        price = _safe_D(getattr(item, "price", 0) or 0)
        qty = _safe_D(getattr(item, "quantity", 1) or 1)
        vat_line = _safe_D(getattr(item, "vat", 0) or 0)
        gross = price * qty + vat_line
        item_grosses.append(gross)
        gross_total += gross

    discount_raw = getattr(doc, "invoice_discount_wo_vat", None)
    discount_wo = Decimal("0")
    if discount_raw not in (None, "", 0, "0"):
        try:
            discount_wo = Decimal(str(discount_raw))
        except (ValueError, InvalidOperation):
            discount_wo = Decimal("0")

    if discount_wo <= 0:
        for i, item in enumerate(items_list):
            setattr(item, "_debetas_gross_after_discount", item_grosses[i])
        return

    if gross_total <= 0:
        logger.warning(
            "[DEBETAS:DISCOUNT:MERGE_VAT] doc=%s gross_total=0, cannot distribute",
            getattr(doc, "pk", None)
        )
        for item in items_list:
            setattr(item, "_debetas_gross_after_discount", Decimal("0"))
        return

    logger.info(
        "[DEBETAS:DISCOUNT:MERGE_VAT] doc=%s distributing discount=%.2f across %d lines (by gross)",
        getattr(doc, "pk", None), discount_wo, len(items_list)
    )

    discount_distributed = Decimal("0")

    for i, item in enumerate(items_list):
        if i == len(items_list) - 1:
            line_discount = discount_wo - discount_distributed
        else:
            share = item_grosses[i] / gross_total
            line_discount = (discount_wo * share).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            discount_distributed += line_discount

        gross_after = item_grosses[i] - line_discount
        setattr(item, "_debetas_gross_after_discount", gross_after)

        logger.debug(
            "[DEBETAS:DISCOUNT:MERGE_VAT] line=%d gross: %.2f->%.2f (discount=%.2f)",
            i, float(item_grosses[i]), float(gross_after), float(line_discount)
        )


# =========================
# Основная функция экспорта
# =========================

def export_to_debetas(
    documents: List,
    user=None,
    own_company_code=None,
) -> Dict[str, bytes]:
    """
    Экспортирует документы в формат Debetas CSV.

    Returns:
        Dict[str, bytes]:
            - {"pirkimai": bytes, "pirkimai_filename": ...}
            - {"pardavimai": bytes, "pardavimai_filename": ...}
            - плюс "zip" / "zip_filename", если есть оба типа
    """
    logger.info(
        "[DEBETAS:EXPORT] Starting export, docs=%d own_company_code=%r",
        len(documents), own_company_code
    )

    if not documents:
        logger.warning("[DEBETAS:EXPORT] No documents to export")
        raise ValueError("No documents provided for export")

    docs_pirkimai = []
    docs_pardavimai = []

    for doc in documents:
        doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
        if doc_type == "pirkimas":
            docs_pirkimai.append(doc)
        elif doc_type == "pardavimas":
            docs_pardavimai.append(doc)
        else:
            logger.warning(
                "[DEBETAS:EXPORT] doc=%s unknown type %r, skipping",
                getattr(doc, "pk", None), doc_type
            )

    logger.info(
        "[DEBETAS:EXPORT] Pirkimai=%d, Pardavimai=%d",
        len(docs_pirkimai), len(docs_pardavimai)
    )

    result = {}
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if docs_pirkimai:
        logger.info("[DEBETAS:EXPORT] Generating pirkimai CSV...")
        pirkimai_csv = _generate_debetas_csv(docs_pirkimai, "pirkimas", user, own_company_code)
        result["pirkimai"] = pirkimai_csv
        result["pirkimai_filename"] = f"Debetas_Pirkimai_{timestamp}.csv"

    if docs_pardavimai:
        logger.info("[DEBETAS:EXPORT] Generating pardavimai CSV...")
        pardavimai_csv = _generate_debetas_csv(docs_pardavimai, "pardavimas", user, own_company_code)
        result["pardavimai"] = pardavimai_csv
        result["pardavimai_filename"] = f"Debetas_Pardavimai_{timestamp}.csv"

    if docs_pirkimai and docs_pardavimai:
        logger.info("[DEBETAS:EXPORT] Creating ZIP archive...")
        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(result["pirkimai_filename"], result["pirkimai"])
            zf.writestr(result["pardavimai_filename"], result["pardavimai"])
        zip_buffer.seek(0)
        result["zip"] = zip_buffer.read()
        result["zip_filename"] = f"Debetas_Import_{timestamp}.zip"

    if not result:
        logger.warning("[DEBETAS:EXPORT] No files generated")
        raise ValueError("No documents to export")

    logger.info("[DEBETAS:EXPORT] Export completed, files=%s", list(result.keys()))
    return result


def _generate_debetas_csv(documents: List, doc_type: str, user=None, own_company_code=None) -> bytes:
    """
    Генерирует CSV для Debetas, используя существующий шаблон:
    первая строка берётся из Debetas_Import_Template.csv,
    дальше добавляются строки с данными.
    """
    logger.info(
        "[DEBETAS:CSV] Generating %s CSV for %d docs own_company_code=%r",
        doc_type, len(documents), own_company_code
    )

    merge_vat = _is_merge_vat(user)
    if merge_vat:
        logger.info("[DEBETAS:CSV] merge_vat=True, PVM будет включён в сумму")

    rows = []

    for doc in documents:
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

        l003, l004 = _get_series_and_number(doc)
        client = _get_client_data_for_debetas(doc)
        extra_fields = _get_debetas_extra_for_doc(user, doc, own_company_code)

        filialas = _get_extra_field_from_profile(extra_fields, doc_type, "filialas", "1")
        padalinys = _get_extra_field_from_profile(extra_fields, doc_type, "padalinys", "")
        objektas = _get_extra_field_from_profile(extra_fields, doc_type, "objektas", "")
        mat_atsakingas = _get_extra_field_from_profile(extra_fields, doc_type, "materialiai_atsakingas_asmuo", "")
        atskaitingas = _get_extra_field_from_profile(extra_fields, doc_type, "atskaitingas_asmuo", "")

        l002 = DOC_TYPE_PIRKIMAS if doc_type == "pirkimas" else DOC_TYPE_PARDAVIMAS

        doc_common = {
            "L001": filialas,
            "L002": l002,
            "L003": l003,
            "L004": l004,
            "L005": _format_date_debetas(getattr(doc, "invoice_date", None)),
            "L006": client["code"],
            "L007": client["name"],
            "L008": _s(getattr(doc, "currency", "EUR") or "EUR"),
            "L019": client["company_id"],
            "L020": client["vat"],
            "L021": client["address"],
            "L022": mat_atsakingas,
            "L024": padalinys,
            "L026": objektas,
            "L059": atskaitingas,
            "L071": _s(getattr(doc, "buyer_iban", "")),
            "L072": _s(getattr(doc, "seller_iban", "")),
            "L075": _format_date_debetas(getattr(doc, "due_date", None)),
            "L085": _s(getattr(doc, "preview_url", "")),
        }

        if has_items:
            items_list = list(line_items.all())

            if merge_vat:
                _distribute_discount_to_debetas_lines_merge_vat(doc, items_list)
            else:
                _distribute_discount_to_debetas_lines(doc, items_list)

            for item in items_list:
                prekes_kodas = (
                    _s(getattr(item, "prekes_kodas", ""))
                    or _s(getattr(item, "prekes_barkodas", ""))
                    or _s(getattr(doc, "prekes_kodas", ""))
                    or "PREKE001"
                )

                prekes_pavadinimas = (
                    _s(getattr(item, "prekes_pavadinimas", ""))
                    or _s(getattr(item, "name", ""))
                    or _s(getattr(doc, "prekes_pavadinimas", ""))
                    or ""
                )

                mato_vienetas = _s(getattr(item, "unit", "")) or "vnt"

                preke_paslauga_raw = getattr(item, "preke_paslauga", None)
                if preke_paslauga_raw is None:
                    preke_paslauga_raw = getattr(doc, "preke_paslauga", None)
                l009 = _get_preke_paslauga(preke_paslauga_raw)

                qty = Decimal(str(getattr(item, "quantity", 1) or 1))

                if merge_vat:
                    gross = getattr(item, "_debetas_gross_after_discount", None)
                    if gross is None:
                        price = _safe_D(getattr(item, "price", 0) or 0)
                        vat_line = _safe_D(getattr(item, "vat", 0) or 0)
                        gross = price * qty + vat_line

                    row = {
                        **doc_common,
                        "L009": l009,
                        "L010": prekes_kodas,
                        "L011": prekes_pavadinimas[:35],
                        "L012": mato_vienetas[:4],
                        "L013": "0",
                        "L014": _multiply_for_debetas(qty, 1000),
                        "L015": _multiply_for_debetas(gross, 100),
                        "L016": "0",
                        "L017": "0",
                    }
                else:
                    subtotal = getattr(item, "_debetas_subtotal_after_discount", None)
                    if subtotal is None:
                        price = Decimal(str(getattr(item, "price", 0) or 0))
                        subtotal = price * qty

                    vat_amount = getattr(item, "_debetas_vat_after_discount", None)
                    if vat_amount is None:
                        vat_amount = Decimal(str(getattr(item, "vat", 0) or 0))

                    vat_percent = Decimal(str(getattr(item, "vat_percent", 0) or 0))

                    row = {
                        **doc_common,
                        "L009": l009,
                        "L010": prekes_kodas,
                        "L011": prekes_pavadinimas[:35],
                        "L012": mato_vienetas[:4],
                        "L013": "0",
                        "L014": _multiply_for_debetas(qty, 1000),
                        "L015": _multiply_for_debetas(subtotal, 100),
                        "L016": _multiply_for_debetas(vat_percent, 100),
                        "L017": _multiply_for_debetas(vat_amount, 100),
                    }

                rows.append(row)

            logger.info(
                "[DEBETAS:KIEKINIS] doc=%s items=%d merge_vat=%s",
                getattr(doc, "pk", None), len(items_list), merge_vat
            )
        else:
            prekes_kodas = (
                _s(getattr(doc, "prekes_kodas", ""))
                or _s(getattr(doc, "prekes_barkodas", ""))
                or "PREKE001"
            )

            prekes_pavadinimas = _s(getattr(doc, "prekes_pavadinimas", "")) or ""
            l009 = _get_preke_paslauga(getattr(doc, "preke_paslauga", None))

            if merge_vat:
                amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
                vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
                discount = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)

                gross_after_discount = amount_wo + vat_amount - discount
                if gross_after_discount < 0:
                    gross_after_discount = Decimal("0")

                row = {
                    **doc_common,
                    "L009": l009,
                    "L010": prekes_kodas,
                    "L011": prekes_pavadinimas[:35],
                    "L012": "vnt",
                    "L013": "0",
                    "L014": _multiply_for_debetas(1, 1000),
                    "L015": _multiply_for_debetas(gross_after_discount, 100),
                    "L016": "0",
                    "L017": "0",
                }
            else:
                row = {
                    **doc_common,
                    "L009": l009,
                    "L010": prekes_kodas,
                    "L011": prekes_pavadinimas[:35],
                    "L012": "vnt",
                    "L013": "0",
                    "L014": _multiply_for_debetas(1, 1000),
                    "L015": _multiply_for_debetas(getattr(doc, "amount_wo_vat", 0), 100),
                    "L016": _multiply_for_debetas(getattr(doc, "vat_percent", 0), 100),
                    "L017": _multiply_for_debetas(getattr(doc, "vat_amount", 0), 100),
                }

            rows.append(row)

            logger.info(
                "[DEBETAS:SUMINIS] doc=%s merge_vat=%s",
                getattr(doc, "pk", None), merge_vat
            )

    template_path = get_debetas_template_path()

    output = StringIO()

    with open(template_path, "r", encoding=DEBETAS_ENCODING, newline="") as tf:
        header_line = tf.readline()
    if not header_line:
        header_line = ",".join(CSV_HEADERS) + "\n"

    if not header_line.endswith("\n"):
        header_line += "\n"
    output.write(header_line)

    writer = csv.DictWriter(
        output,
        fieldnames=CSV_HEADERS,
        quoting=csv.QUOTE_ALL,
        quotechar='"',
    )

    for row in rows:
        csv_row = {header: row.get(header, "") for header in CSV_HEADERS}
        writer.writerow(csv_row)

    logger.info("[DEBETAS:CSV] Written %d rows", len(rows))

    csv_content = output.getvalue()

    try:
        csv_bytes = csv_content.encode(DEBETAS_ENCODING)
    except UnicodeEncodeError as e:
        logger.warning(
            "[DEBETAS:CSV] Encoding error, falling back to utf-8: %s", e
        )
        csv_bytes = csv_content.encode("utf-8")

    return csv_bytes







# import re
# import os
# import csv
# import logging
# import zipfile
# from io import BytesIO, StringIO
# from pathlib import Path
# from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
# from datetime import date, datetime
# from typing import List, Dict, Any

# logger = logging.getLogger(__name__)

# # =========================
# # Константы
# # =========================

# # Фиксированные типы документов
# DOC_TYPE_PIRKIMAS = "865"
# DOC_TYPE_PARDAVIMAS = "18"

# # Кодировка для Debetas
# DEBETAS_ENCODING = "windows-1257"

# # Список стран ЕС для i.SAF логики (если понадобится в будущем)
# EU_ISO2 = {
#     "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
#     "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
# }

# # Заголовки CSV (порядок колонок)
# CSV_HEADERS = [
#     "L001",  # Filialas
#     "L002",  # Dokumento tipas
#     "L003",  # Serija ir Nr.
#     "L004",  # Dokumento numeris
#     "L005",  # Data
#     "L006",  # Kontrahento kodas
#     "L007",  # Kontrahento pavadinimas
#     "L008",  # Valiuta
#     "L009",  # Prekė/paslauga (0/1)
#     "L010",  # Prekės kodas
#     "L011",  # Prekės pavadinimas
#     "L012",  # Mato vienetas
#     "L013",  # Ženklas
#     "L014",  # Kiekis × 1000
#     "L015",  # Suma be PVM × 100
#     "L016",  # PVM tarifas × 100
#     "L017",  # PVM suma × 100
#     "L019",  # Įmonės kodas
#     "L020",  # PVM kodas
#     "L021",  # Adresas
#     "L022",  # Materialiai atsakingas
#     "L024",  # Padalinys
#     "L026",  # Objektas
#     "L059",  # Atskaitingas asmuo
#     "L071",  # Pirkėjo banko sąskaita
#     "L072",  # Tiekėjo banko sąskaita
#     "L075",  # Apmokėti iki
#     "L085",  # Nuoroda į dokumentą
# ]

# # =========================
# # Конфиг путей шаблонов
# # =========================

# env_value = os.getenv("DEBETAS_TEMPLATES_DIR")

# if not env_value:
#     raise ValueError("DEBETAS_TEMPLATES_DIR not set in .env")

# DEBETAS_TEMPLATES_DIR = Path(env_value)
# DEBETAS_TEMPLATE_CSV = "Debetas_Import_Template.csv"


# def get_debetas_template_path() -> Path:
#     """
#     Возвращает путь к CSV-шаблону Debetas.
#     Шаблон должен быть заранее сохранён как Debetas_Import_Template.csv
#     в DEBETAS_TEMPLATES_DIR.
#     """
#     template_path = DEBETAS_TEMPLATES_DIR / DEBETAS_TEMPLATE_CSV
#     if not template_path.exists():
#         logger.error("[DEBETAS:TEMPLATE] Template not found: %s", template_path)
#         raise FileNotFoundError(f"Debetas template not found: {template_path}")
#     return template_path


# # =========================
# # Helpers
# # =========================

# def _safe_D(x) -> Decimal:
#     """Безопасное преобразование в Decimal."""
#     try:
#         return Decimal(str(x))
#     except Exception:
#         return Decimal("0")


# def _s(v) -> str:
#     """Безопасная строка с strip()."""
#     return str(v).strip() if v is not None else ""


# def _format_date_debetas(dt) -> str:
#     """
#     Форматирует дату в строку 'yyyymmdd' для Debetas.
#     """
#     if not dt:
#         return ""
#     if isinstance(dt, str):
#         try:
#             dt = datetime.strptime(dt, "%Y-%m-%d").date()
#         except ValueError:
#             return ""
#     if isinstance(dt, (date, datetime)):
#         return dt.strftime("%Y%m%d")
#     return ""


# def _multiply_for_debetas(value, multiplier: int) -> str:
#     """
#     Умножает значение на multiplier и возвращает как целое число (строка).
#     Например: 1.5 × 1000 = "1500", 120.50 × 100 = "12050"
#     """
#     try:
#         d = Decimal(str(value))
#         result = (d * multiplier).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
#         return str(int(result))
#     except Exception:
#         return "0"


# def _get_preke_paslauga(value) -> str:
#     """
#     Преобразует preke_paslauga в формат Debetas:
#     1, 3 -> "0" (prekė/товар)
#     2, 4 -> "1" (paslauga/услуга)
#     """
#     try:
#         v = int(value)
#         if v in (1, 3):
#             return "0"
#         elif v in (2, 4):
#             return "1"
#     except (ValueError, TypeError):
#         pass
#     return ""  # Пустое если не определено


# def _is_merge_vat(user) -> bool:
#     """
#     Проверяет флаг merge_vat из user.extra_settings.
#     Логика идентична Rivile ERP экспорту.
#     """
#     if not user:
#         return False
#     extra_settings = getattr(user, "extra_settings", None)
#     if not extra_settings or not isinstance(extra_settings, dict):
#         return False
#     return str(extra_settings.get("merge_vat", "0")).strip() == "1"


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
#         logger.debug("[DEBETAS:PARTY] %s: %s -> %s", role, id_field, sid)
#         return sid

#     svat = _s(getattr(doc, vat_field, None))
#     if svat:
#         logger.debug("[DEBETAS:PARTY] %s: %s -> %s", role, vat_field, svat)
#         return svat

#     sidp = _s(getattr(doc, id_programoje_field, None))
#     if sidp:
#         logger.debug("[DEBETAS:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
#         return sidp

#     logger.debug("[DEBETAS:PARTY] %s: empty id/vat/id_programoje -> ''", role)
#     return ""


# def _get_client_data_for_debetas(doc) -> Dict[str, Any]:
#     """
#     Возвращает словарь с данными контрагента.
#     Логика:
#       - pirkimas -> seller (продавец)
#       - pardavimas -> buyer (покупатель)
#     """
#     doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()

#     if doc_type == "pirkimas":
#         code = get_party_code(
#             doc,
#             role="seller",
#             id_field="seller_id",
#             vat_field="seller_vat_code",
#             id_programoje_field="seller_id_programoje",
#         )
#         return {
#             "code": code,
#             "name": _s(getattr(doc, "seller_name", "")),
#             "vat": _s(getattr(doc, "seller_vat_code", "")),
#             "company_id": _s(getattr(doc, "seller_id", "")),
#             "address": _s(getattr(doc, "seller_address", "")),
#             "iban": _s(getattr(doc, "seller_iban", "")),
#         }
#     else:
#         code = get_party_code(
#             doc,
#             role="buyer",
#             id_field="buyer_id",
#             vat_field="buyer_vat_code",
#             id_programoje_field="buyer_id_programoje",
#         )
#         return {
#             "code": code,
#             "name": _s(getattr(doc, "buyer_name", "")),
#             "vat": _s(getattr(doc, "buyer_vat_code", "")),
#             "company_id": _s(getattr(doc, "buyer_id", "")),
#             "address": _s(getattr(doc, "buyer_address", "")),
#             "iban": _s(getattr(doc, "buyer_iban", "")),
#         }


# def _get_extra_field(user, doc_type: str, field_name: str, default: str = "") -> str:
#     """
#     Получает значение из user.debetas_extra_fields.
#     """
#     if not user:
#         return default

#     extra_fields = getattr(user, "debetas_extra_fields", None)
#     if not extra_fields:
#         return default

#     key = f"{doc_type}_{field_name}"
#     value = extra_fields.get(key, "").strip()

#     if value:
#         logger.debug("[DEBETAS:EXTRA] %s -> %r", key, value)
#         return value

#     return default


# def _get_series_and_number(doc) -> tuple:
#     """
#     Возвращает (L003, L004) для документа согласно правилам:

#     1) Если есть series и number:
#         - L003 = series + number (НО: если number уже начинается с series, series из number убираем)
#         - L004 = ""
#     2) Если series нет, но есть number:
#         - если number только цифры и длина 1..7 -> L004 = number, L003 = ""
#         - иначе -> L003 = number, L004 = ""
#     3) Если ничего нет -> ("", "")

#     Ограничения:
#       - L003 максимум 15 символов (обрезаем справа, если нужно)
#       - L004 максимум 7 цифр (иначе уходит в L003)
#     """
#     series = _s(getattr(doc, "document_series", ""))
#     number = _s(getattr(doc, "document_number", ""))

#     # Нормализация (на всякий случай убираем пробелы внутри)
#     series_clean = series.replace(" ", "")
#     number_clean = number.replace(" ", "")

#     # --- CASE 1: есть и серия и номер -> только L003 ---
#     if series_clean and number_clean:
#         # Убираем дублирование серии из начала номера (MAK + MAK2829195 => 2829195)
#         # Удаляем серию столько раз, сколько она подряд встречается в начале number
#         sc = series_clean
#         while number_clean.startswith(sc) and sc:
#             number_clean = number_clean[len(sc):]

#         l003 = f"{series_clean}{number_clean}"
#         if len(l003) > 15:
#             logger.warning(
#                 "[DEBETAS:DOCNO] doc=%s L003 too long (%d), truncating to 15: %r",
#                 getattr(doc, "pk", None), len(l003), l003
#             )
#             l003 = l003[:15]
#         return (l003, "")

#     # --- CASE 2: серии нет, но есть номер ---
#     if not series_clean and number_clean:
#         # Если строго цифры и 1..7 -> это L004
#         if re.fullmatch(r"\d{1,7}", number_clean):
#             return ("", number_clean)

#         # Иначе по правилу "во всех других случаях" -> L003, а L004 пустой
#         l003 = number_clean
#         if len(l003) > 15:
#             logger.warning(
#                 "[DEBETAS:DOCNO] doc=%s L003 too long (%d), truncating to 15: %r",
#                 getattr(doc, "pk", None), len(l003), l003
#             )
#             l003 = l003[:15]
#         return (l003, "")

#     # --- CASE 3: номера нет (или всё пусто) ---
#     return ("", "")


# def _distribute_discount_to_debetas_lines(doc, items_list: list) -> None:
#     """
#     Распределяет скидку документа (invoice_discount_wo_vat) на строки товаров.
#     Обычный режим: скидка распределяется по subtotal (price × qty).
#     """
#     if not items_list:
#         return

#     discount_raw = getattr(doc, "invoice_discount_wo_vat", None)
#     if discount_raw in (None, "", 0, "0"):
#         return

#     try:
#         discount_wo = Decimal(str(discount_raw))
#     except (ValueError, InvalidOperation):
#         logger.warning(
#             "[DEBETAS:DISCOUNT] doc=%s invalid discount value: %r",
#             getattr(doc, "pk", None), discount_raw
#         )
#         return

#     if discount_wo <= 0:
#         return

#     logger.info(
#         "[DEBETAS:DISCOUNT] doc=%s distributing discount=%.2f across %d lines",
#         getattr(doc, "pk", None), discount_wo, len(items_list)
#     )

#     # Сумма subtotal ДО скидки
#     sum_subtotal_before = Decimal("0")
#     for item in items_list:
#         price = Decimal(str(getattr(item, "price", 0) or 0))
#         qty = Decimal(str(getattr(item, "quantity", 1) or 1))
#         sum_subtotal_before += price * qty

#     if sum_subtotal_before <= 0:
#         logger.warning(
#             "[DEBETAS:DISCOUNT] doc=%s sum_subtotal=0, cannot distribute",
#             getattr(doc, "pk", None)
#         )
#         return

#     discount_distributed = Decimal("0")

#     for i, item in enumerate(items_list):
#         qty = Decimal(str(getattr(item, "quantity", 1) or 1))
#         price_before = Decimal(str(getattr(item, "price", 0) or 0))
#         vat_percent = Decimal(str(getattr(item, "vat_percent", 0) or 0))

#         subtotal_before = price_before * qty

#         # Последняя строка получает остаток
#         if i == len(items_list) - 1:
#             line_discount = discount_wo - discount_distributed
#         else:
#             share = subtotal_before / sum_subtotal_before
#             line_discount = (discount_wo * share).quantize(
#                 Decimal("0.01"), rounding=ROUND_HALF_UP
#             )
#             discount_distributed += line_discount

#         # Новый subtotal после скидки
#         subtotal_after = subtotal_before - line_discount

#         # ПЕРЕСЧИТЫВАЕМ VAT от НОВОГО subtotal
#         if vat_percent > 0 and subtotal_after > 0:
#             vat_after = (subtotal_after * vat_percent / Decimal("100")).quantize(
#                 Decimal("0.01"), rounding=ROUND_HALF_UP
#             )
#         else:
#             vat_after = Decimal("0")

#         setattr(item, "_debetas_subtotal_after_discount", subtotal_after)
#         setattr(item, "_debetas_vat_after_discount", vat_after)

#         logger.debug(
#             "[DEBETAS:DISCOUNT] line=%d subtotal: %.2f->%.2f vat: %.2f (discount=%.2f)",
#             i, float(subtotal_before), float(subtotal_after),
#             float(vat_after), float(line_discount)
#         )


# def _distribute_discount_to_debetas_lines_merge_vat(doc, items_list: list) -> None:
#     """
#     Распределяет скидку документа при merge_vat=True.
#     Логика аналогична Rivile ERP:
#       - gross = price × qty + vat (на строку)
#       - скидка распределяется пропорционально gross
#       - результат: _debetas_gross_after_discount на каждой строке
#     """
#     if not items_list:
#         return

#     # Считаем gross для каждой строки
#     item_grosses: list[Decimal] = []
#     gross_total = Decimal("0")

#     for item in items_list:
#         price = _safe_D(getattr(item, "price", 0) or 0)
#         qty = _safe_D(getattr(item, "quantity", 1) or 1)
#         vat_line = _safe_D(getattr(item, "vat", 0) or 0)
#         gross = price * qty + vat_line
#         item_grosses.append(gross)
#         gross_total += gross

#     # Скидка документа
#     discount_raw = getattr(doc, "invoice_discount_wo_vat", None)
#     discount_wo = Decimal("0")
#     if discount_raw not in (None, "", 0, "0"):
#         try:
#             discount_wo = Decimal(str(discount_raw))
#         except (ValueError, InvalidOperation):
#             discount_wo = Decimal("0")

#     if discount_wo <= 0:
#         # Нет скидки — просто ставим gross как есть
#         for i, item in enumerate(items_list):
#             setattr(item, "_debetas_gross_after_discount", item_grosses[i])
#         return

#     if gross_total <= 0:
#         logger.warning(
#             "[DEBETAS:DISCOUNT:MERGE_VAT] doc=%s gross_total=0, cannot distribute",
#             getattr(doc, "pk", None)
#         )
#         for item in items_list:
#             setattr(item, "_debetas_gross_after_discount", Decimal("0"))
#         return

#     logger.info(
#         "[DEBETAS:DISCOUNT:MERGE_VAT] doc=%s distributing discount=%.2f across %d lines (by gross)",
#         getattr(doc, "pk", None), discount_wo, len(items_list)
#     )

#     discount_distributed = Decimal("0")

#     for i, item in enumerate(items_list):
#         # Последняя строка получает остаток (избегаем ошибок округления)
#         if i == len(items_list) - 1:
#             line_discount = discount_wo - discount_distributed
#         else:
#             share = item_grosses[i] / gross_total
#             line_discount = (discount_wo * share).quantize(
#                 Decimal("0.01"), rounding=ROUND_HALF_UP
#             )
#             discount_distributed += line_discount

#         gross_after = item_grosses[i] - line_discount
#         setattr(item, "_debetas_gross_after_discount", gross_after)

#         logger.debug(
#             "[DEBETAS:DISCOUNT:MERGE_VAT] line=%d gross: %.2f->%.2f (discount=%.2f)",
#             i, float(item_grosses[i]), float(gross_after), float(line_discount)
#         )


# # =========================
# # Основная функция экспорта
# # =========================

# def export_to_debetas(
#     documents: List,
#     user=None
# ) -> Dict[str, bytes]:
#     """
#     Экспортирует документы в формат Debetas CSV.

#     Returns:
#         Dict[str, bytes]:
#             - {"pirkimai": bytes, "pirkimai_filename": ...}
#             - {"pardavimai": bytes, "pardavimai_filename": ...}
#             - плюс "zip" / "zip_filename", если есть оба типа
#     """
#     logger.info("[DEBETAS:EXPORT] Starting export, docs=%d", len(documents))

#     if not documents:
#         logger.warning("[DEBETAS:EXPORT] No documents to export")
#         raise ValueError("No documents provided for export")

#     docs_pirkimai = []
#     docs_pardavimai = []

#     for doc in documents:
#         doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
#         if doc_type == "pirkimas":
#             docs_pirkimai.append(doc)
#         elif doc_type == "pardavimas":
#             docs_pardavimai.append(doc)
#         else:
#             logger.warning(
#                 "[DEBETAS:EXPORT] doc=%s unknown type %r, skipping",
#                 getattr(doc, "pk", None), doc_type
#             )

#     logger.info(
#         "[DEBETAS:EXPORT] Pirkimai=%d, Pardavimai=%d",
#         len(docs_pirkimai), len(docs_pardavimai)
#     )

#     result = {}
#     timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

#     if docs_pirkimai:
#         logger.info("[DEBETAS:EXPORT] Generating pirkimai CSV...")
#         pirkimai_csv = _generate_debetas_csv(docs_pirkimai, "pirkimas", user)
#         result["pirkimai"] = pirkimai_csv
#         result["pirkimai_filename"] = f"Debetas_Pirkimai_{timestamp}.csv"

#     if docs_pardavimai:
#         logger.info("[DEBETAS:EXPORT] Generating pardavimai CSV...")
#         pardavimai_csv = _generate_debetas_csv(docs_pardavimai, "pardavimas", user)
#         result["pardavimai"] = pardavimai_csv
#         result["pardavimai_filename"] = f"Debetas_Pardavimai_{timestamp}.csv"

#     if docs_pirkimai and docs_pardavimai:
#         logger.info("[DEBETAS:EXPORT] Creating ZIP archive...")
#         zip_buffer = BytesIO()
#         with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
#             zf.writestr(result["pirkimai_filename"], result["pirkimai"])
#             zf.writestr(result["pardavimai_filename"], result["pardavimai"])
#         zip_buffer.seek(0)
#         result["zip"] = zip_buffer.read()
#         result["zip_filename"] = f"Debetas_Import_{timestamp}.zip"

#     if not result:
#         logger.warning("[DEBETAS:EXPORT] No files generated")
#         raise ValueError("No documents to export")

#     logger.info("[DEBETAS:EXPORT] Export completed, files=%s", list(result.keys()))
#     return result


# def _generate_debetas_csv(documents: List, doc_type: str, user=None) -> bytes:
#     """
#     Генерирует CSV для Debetas, используя существующий шаблон:
#     первая строка берётся из Debetas_Import_Template.csv,
#     дальше добавляются строки с данными.
#     """
#     logger.info("[DEBETAS:CSV] Generating %s CSV for %d docs", doc_type, len(documents))

#     merge_vat = _is_merge_vat(user)
#     if merge_vat:
#         logger.info("[DEBETAS:CSV] merge_vat=True, PVM будет включён в сумму")

#     rows = []

#     for doc in documents:
#         line_items = getattr(doc, "line_items", None)
#         has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

#         l003, l004 = _get_series_and_number(doc)
#         client = _get_client_data_for_debetas(doc)

#         filialas = _get_extra_field(user, doc_type, "filialas", "1")
#         padalinys = _get_extra_field(user, doc_type, "padalinys", "")
#         objektas = _get_extra_field(user, doc_type, "objektas", "")
#         mat_atsakingas = _get_extra_field(user, doc_type, "materialiai_atsakingas_asmuo", "")
#         atskaitingas = _get_extra_field(user, doc_type, "atskaitingas_asmuo", "")

#         l002 = DOC_TYPE_PIRKIMAS if doc_type == "pirkimas" else DOC_TYPE_PARDAVIMAS

#         doc_common = {
#             "L001": filialas,
#             "L002": l002,
#             "L003": l003,
#             "L004": l004,
#             "L005": _format_date_debetas(getattr(doc, "invoice_date", None)),
#             "L006": client["code"],
#             "L007": client["name"],
#             "L008": _s(getattr(doc, "currency", "EUR") or "EUR"),
#             "L019": client["company_id"],
#             "L020": client["vat"],
#             "L021": client["address"],
#             "L022": mat_atsakingas,
#             "L024": padalinys,
#             "L026": objektas,
#             "L059": atskaitingas,
#             "L071": _s(getattr(doc, "buyer_iban", "")),
#             "L072": _s(getattr(doc, "seller_iban", "")),
#             "L075": _format_date_debetas(getattr(doc, "due_date", None)),
#             "L085": _s(getattr(doc, "preview_url", "")),
#         }

#         if has_items:
#             # ========== DETALIAI режим ==========
#             items_list = list(line_items.all())

#             if merge_vat:
#                 _distribute_discount_to_debetas_lines_merge_vat(doc, items_list)
#             else:
#                 _distribute_discount_to_debetas_lines(doc, items_list)

#             for item in items_list:
#                 prekes_kodas = (
#                     _s(getattr(item, "prekes_kodas", ""))
#                     or _s(getattr(item, "prekes_barkodas", ""))
#                     or _s(getattr(doc, "prekes_kodas", ""))
#                     or "PREKE001"
#                 )

#                 prekes_pavadinimas = (
#                     _s(getattr(item, "prekes_pavadinimas", ""))
#                     or _s(getattr(item, "name", ""))
#                     or _s(getattr(doc, "prekes_pavadinimas", ""))
#                     or ""
#                 )

#                 mato_vienetas = _s(getattr(item, "unit", "")) or "vnt"

#                 preke_paslauga_raw = getattr(item, "preke_paslauga", None)
#                 if preke_paslauga_raw is None:
#                     preke_paslauga_raw = getattr(doc, "preke_paslauga", None)
#                 l009 = _get_preke_paslauga(preke_paslauga_raw)

#                 qty = Decimal(str(getattr(item, "quantity", 1) or 1))

#                 if merge_vat:
#                     # ---- merge_vat: L015 = gross, L016 = 0, L017 = 0 ----
#                     gross = getattr(item, "_debetas_gross_after_discount", None)
#                     if gross is None:
#                         # Fallback: считаем gross вручную
#                         price = _safe_D(getattr(item, "price", 0) or 0)
#                         vat_line = _safe_D(getattr(item, "vat", 0) or 0)
#                         gross = price * qty + vat_line

#                     row = {
#                         **doc_common,
#                         "L009": l009,
#                         "L010": prekes_kodas,
#                         "L011": prekes_pavadinimas[:35],
#                         "L012": mato_vienetas[:4],
#                         "L013": "0",
#                         "L014": _multiply_for_debetas(qty, 1000),
#                         "L015": _multiply_for_debetas(gross, 100),
#                         "L016": "0",
#                         "L017": "0",
#                     }
#                 else:
#                     # ---- обычный режим (без изменений) ----
#                     subtotal = getattr(item, "_debetas_subtotal_after_discount", None)
#                     if subtotal is None:
#                         price = Decimal(str(getattr(item, "price", 0) or 0))
#                         subtotal = price * qty

#                     vat_amount = getattr(item, "_debetas_vat_after_discount", None)
#                     if vat_amount is None:
#                         vat_amount = Decimal(str(getattr(item, "vat", 0) or 0))

#                     vat_percent = Decimal(str(getattr(item, "vat_percent", 0) or 0))

#                     row = {
#                         **doc_common,
#                         "L009": l009,
#                         "L010": prekes_kodas,
#                         "L011": prekes_pavadinimas[:35],
#                         "L012": mato_vienetas[:4],
#                         "L013": "0",
#                         "L014": _multiply_for_debetas(qty, 1000),
#                         "L015": _multiply_for_debetas(subtotal, 100),
#                         "L016": _multiply_for_debetas(vat_percent, 100),
#                         "L017": _multiply_for_debetas(vat_amount, 100),
#                     }

#                 rows.append(row)

#             logger.info(
#                 "[DEBETAS:KIEKINIS] doc=%s items=%d merge_vat=%s",
#                 getattr(doc, "pk", None), len(items_list), merge_vat
#             )
#         else:
#             # ========== SUMISKAI режим ==========
#             prekes_kodas = (
#                 _s(getattr(doc, "prekes_kodas", ""))
#                 or _s(getattr(doc, "prekes_barkodas", ""))
#                 or "PREKE001"
#             )

#             prekes_pavadinimas = _s(getattr(doc, "prekes_pavadinimas", "")) or ""
#             l009 = _get_preke_paslauga(getattr(doc, "preke_paslauga", None))

#             if merge_vat:
#                 # ---- merge_vat: L015 = gross - скидка, L016 = 0, L017 = 0 ----
#                 amount_wo = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)
#                 vat_amount = _safe_D(getattr(doc, "vat_amount", 0) or 0)
#                 discount = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)

#                 gross_after_discount = amount_wo + vat_amount - discount
#                 if gross_after_discount < 0:
#                     gross_after_discount = Decimal("0")

#                 row = {
#                     **doc_common,
#                     "L009": l009,
#                     "L010": prekes_kodas,
#                     "L011": prekes_pavadinimas[:35],
#                     "L012": "vnt",
#                     "L013": "0",
#                     "L014": _multiply_for_debetas(1, 1000),
#                     "L015": _multiply_for_debetas(gross_after_discount, 100),
#                     "L016": "0",
#                     "L017": "0",
#                 }
#             else:
#                 # ---- обычный режим (без изменений) ----
#                 row = {
#                     **doc_common,
#                     "L009": l009,
#                     "L010": prekes_kodas,
#                     "L011": prekes_pavadinimas[:35],
#                     "L012": "vnt",
#                     "L013": "0",
#                     "L014": _multiply_for_debetas(1, 1000),
#                     "L015": _multiply_for_debetas(getattr(doc, "amount_wo_vat", 0), 100),
#                     "L016": _multiply_for_debetas(getattr(doc, "vat_percent", 0), 100),
#                     "L017": _multiply_for_debetas(getattr(doc, "vat_amount", 0), 100),
#                 }

#             rows.append(row)

#             logger.info(
#                 "[DEBETAS:SUMINIS] doc=%s merge_vat=%s",
#                 getattr(doc, "pk", None), merge_vat
#             )

#     # ==== ГЕНЕРАЦИЯ CSV С ИСПОЛЬЗОВАНИЕМ ШАБЛОНА ====

#     template_path = get_debetas_template_path()

#     output = StringIO()

#     # 1) Переписываем первую строку из шаблона (заголовок)
#     with open(template_path, "r", encoding=DEBETAS_ENCODING, newline="") as tf:
#         header_line = tf.readline()
#     if not header_line:
#         # На всякий случай, если шаблон пустой — подстрахуемся
#         header_line = ",".join(CSV_HEADERS) + "\n"

#     # Гарантируем перевод строки
#     if not header_line.endswith("\n"):
#         header_line += "\n"
#     output.write(header_line)

#     # 2) Пишем данные тем же форматом CSV (разделитель ',')
#     writer = csv.DictWriter(
#         output,
#         fieldnames=CSV_HEADERS,
#         quoting=csv.QUOTE_ALL,
#         quotechar='"',
#         # delimiter по умолчанию ',', совпадает с шаблоном
#     )

#     for row in rows:
#         csv_row = {header: row.get(header, "") for header in CSV_HEADERS}
#         writer.writerow(csv_row)

#     logger.info("[DEBETAS:CSV] Written %d rows", len(rows))

#     csv_content = output.getvalue()

#     try:
#         csv_bytes = csv_content.encode(DEBETAS_ENCODING)
#     except UnicodeEncodeError as e:
#         logger.warning(
#             "[DEBETAS:CSV] Encoding error, falling back to utf-8: %s", e
#         )
#         csv_bytes = csv_content.encode("utf-8")

#     return csv_bytes


