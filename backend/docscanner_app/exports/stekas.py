"""
Экспорт документов DokSkenas → Stekas Plius (JSON для десктопного плагина).

Плагин читает JSON, подключается к Firebird БД Stekas и вставляет данные напрямую.
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from typing import Iterable, Optional, Tuple
import zipfile

from django.utils.encoding import smart_str
from django.utils.timezone import localdate

from ..models import CurrencyRate

logger = logging.getLogger(__name__)


# =========================
# Helpers
# =========================

def _s(v) -> str:
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def _nz(v) -> bool:
    """Есть ли непустая строка после strip()."""
    return bool(_s(v))


def _safe_decimal(v) -> Decimal:
    """Безопасный Decimal."""
    try:
        return Decimal(str(v))
    except Exception:
        return Decimal("0")


def _round2(v) -> float:
    """Округление до 2 знаков."""
    return float(_safe_decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _round4(v) -> float:
    """Округление до 4 знаков (для цен)."""
    return float(_safe_decimal(v).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def _round6(v) -> float:
    """Округление до 6 знаков (для цен в Stekas)."""
    return float(_safe_decimal(v).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))


def _round9(v) -> float:
    """Округление до 9 знаков (для количества в Stekas)."""
    return float(_safe_decimal(v).quantize(Decimal("0.000000001"), rounding=ROUND_HALF_UP))


def _format_date(d) -> Optional[str]:
    """Дата → YYYY-MM-DD (ISO). Плагин конвертирует в DD.MM.YYYY для Firebird."""
    if d is None:
        return None
    if hasattr(d, 'strftime'):
        return d.strftime("%Y-%m-%d")
    return _s(d) or None


def _today_str_iso() -> str:
    """YYYY-MM-DD для имён файлов."""
    return localdate().strftime("%Y-%m-%d")


def _infer_direction(document, direction_hint: Optional[str] = None) -> str:
    """
    Возвращает 'pirkimas' или 'pardavimas'.
    """
    dir_ = (direction_hint or _s(getattr(document, 'pirkimas_pardavimas', ''))).lower()
    if dir_ not in ('pirkimas', 'pardavimas'):
        if _nz(getattr(document, 'buyer_id', None)) or _nz(getattr(document, 'buyer_vat_code', None)):
            dir_ = 'pardavimas'
        elif _nz(getattr(document, 'seller_id', None)) or _nz(getattr(document, 'seller_vat_code', None)):
            dir_ = 'pirkimas'
        else:
            dir_ = 'pirkimas'
    return dir_


def _get_currency_rate(currency_code: str, date_obj) -> float:
    """Курс к EUR."""
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


def _iter_line_items(doc) -> list:
    """Безопасно получаем список LineItem."""
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


def _get_pvm_pavadinimas(doc_or_item) -> str:
    """
    Получаем название PVM кода из DokSkenas.
    Это может быть pvm_kodas (название/классификатор) или vat_percent (число).
    Плагин будет резолвить по PAVADINIMAS, потом по PROCENTAS.
    """
    # pvm_kodas может содержать название вроде "21 %", "Be PVM", "PVM1" и т.д.
    pvm_kodas = _s(getattr(doc_or_item, "pvm_kodas", ""))
    if pvm_kodas and pvm_kodas != "Keli skirtingi PVM":
        return pvm_kodas
    return ""


# =========================
# Построение данных одного документа
# =========================

def _build_party_data(doc, role: str) -> dict:
    """
    Строит данные стороны (seller/buyer).
    role: 'seller' или 'buyer'
    """
    prefix = role
    return {
        "name": _s(getattr(doc, f"{prefix}_name", "")),
        "company_code": _s(getattr(doc, f"{prefix}_id", "") or getattr(doc, f"{prefix}_company_code", "")),
        "vat_code": _s(getattr(doc, f"{prefix}_vat_code", "")),
        "address": _s(getattr(doc, f"{prefix}_address", "")),
        "country_iso": _s(getattr(doc, f"{prefix}_country_iso", "") or "LT"),
        "is_person": bool(getattr(doc, f"{prefix}_is_person", False)),
        "phone": _s(getattr(doc, f"{prefix}_phone", "")),
        "email": _s(getattr(doc, f"{prefix}_email", "")),
        "iban": _s(getattr(doc, f"{prefix}_iban", "")),
        # Код клиента в Stekas (если уже сопоставлен)
        "id_programoje": _s(getattr(doc, f"{prefix}_id_programoje", "")),
    }


def _build_line_item_data(item, doc) -> dict:
    """Строит данные одной строки товара."""
    qty = _safe_decimal(getattr(item, "quantity", None) or 1)
    price = _safe_decimal(getattr(item, "price", None) or 0)
    subtotal = _safe_decimal(getattr(item, "subtotal", None) or 0)
    vat = _safe_decimal(getattr(item, "vat", None) or 0)
    total = _safe_decimal(getattr(item, "total", None) or 0)
    vat_percent = _safe_decimal(getattr(item, "vat_percent", None) or 0)

    # Если subtotal не задан — вычисляем
    if subtotal == 0 and price > 0 and qty > 0:
        subtotal = price * qty

    # Если total не задан — вычисляем
    if total == 0:
        total = subtotal + vat

    return {
        "name": _s(getattr(item, "prekes_pavadinimas", "")) or _s(getattr(doc, "prekes_pavadinimas", "")),
        "code": _s(getattr(item, "prekes_kodas", "")) or _s(getattr(item, "prekes_barkodas", "")),
        "barcode": _s(getattr(item, "prekes_barkodas", "")),
        "unit": _s(getattr(item, "unit", "")) or "vnt",
        "quantity": _round9(qty),
        "price_wo_vat": _round6(price),
        "vat_percent": _round2(vat_percent),
        "vat_amount": _round2(vat),
        "total_wo_vat": _round2(subtotal),
        "total_with_vat": _round2(total),
        # PVM название для резолвинга в плагине
        "pvm_pavadinimas": _get_pvm_pavadinimas(item),
        # Тип: prekė/paslauga
        "preke_paslauga": _s(getattr(item, "preke_paslauga", "") or getattr(doc, "preke_paslauga", "")),
    }


def _build_document_data(doc, direction: str) -> dict:
    """Строит JSON-данные одного документа."""
    inv_date = getattr(doc, "invoice_date", None) or localdate()
    op_date = getattr(doc, "operation_date", None) or inv_date
    due_date = getattr(doc, "due_date", None)
    currency = (_s(getattr(doc, "currency", "")) or "EUR").upper()
    currency_rate = _get_currency_rate(currency, inv_date)

    # Суммы документа
    amount_wo_vat = _round2(getattr(doc, "amount_wo_vat", 0) or 0)
    vat_amount = _round2(getattr(doc, "vat_amount", 0) or 0)
    amount_with_vat = _round2(getattr(doc, "amount_with_vat", 0) or 0)
    vat_percent = _round2(getattr(doc, "vat_percent", 0) or 0)

    # Скидка документа
    discount_wo = _round2(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
    discount_with = _round2(getattr(doc, "invoice_discount_with_vat", 0) or 0)

    # Серия и номер
    series = _s(getattr(doc, "document_series", ""))
    number = _s(getattr(doc, "document_number", ""))

    # Номер фактуры: серия + номер
    if series and number and not number.upper().startswith(series.upper()):
        fakturos_nr = f"{series}{number}"
    elif number:
        fakturos_nr = number
    else:
        fakturos_nr = series or ""

    # Контрагент
    if direction == 'pirkimas':
        counterparty = _build_party_data(doc, 'seller')
        counterparty["role"] = "tiekejas"  # поставщик
    else:
        counterparty = _build_party_data(doc, 'buyer')
        counterparty["role"] = "pirkejas"  # покупатель

    # Строки товаров
    line_items_raw = _iter_line_items(doc)
    line_items = []
    if line_items_raw:
        for idx, item in enumerate(line_items_raw):
            li_data = _build_line_item_data(item, doc)
            li_data["line_number"] = idx + 1
            line_items.append(li_data)
    else:
        # Документ без строк — создаём одну строку из шапки
        line_items.append({
            "name": _s(getattr(doc, "prekes_pavadinimas", "")) or "Prekė/paslauga",
            "code": _s(getattr(doc, "prekes_kodas", "")) or _s(getattr(doc, "prekes_barkodas", "")),
            "barcode": _s(getattr(doc, "prekes_barkodas", "")),
            "unit": _s(getattr(doc, "unit", "")) or "vnt",
            "quantity": 1.0,
            "price_wo_vat": amount_wo_vat,
            "vat_percent": vat_percent,
            "vat_amount": vat_amount,
            "total_wo_vat": amount_wo_vat,
            "total_with_vat": amount_with_vat,
            "pvm_pavadinimas": _get_pvm_pavadinimas(doc),
            "preke_paslauga": _s(getattr(doc, "preke_paslauga", "")),
            "line_number": 1,
        })

    result = {
        "type": direction,
        "document_series": series,
        "document_number": number,
        "fakturos_nr": fakturos_nr,
        "invoice_date": _format_date(inv_date),
        "operation_date": _format_date(op_date),
        "due_date": _format_date(due_date),
        "currency": currency,
        "currency_rate": _round6(currency_rate),
        "amount_wo_vat": amount_wo_vat,
        "vat_amount": vat_amount,
        "amount_with_vat": amount_with_vat,
        "vat_percent": vat_percent,
        "discount_wo_vat": discount_wo,
        "discount_with_vat": discount_with,
        "counterparty": counterparty,
        "line_items": line_items,
        "preview_url": _s(getattr(doc, "preview_url", "")),
        "original_filename": _s(getattr(doc, "original_filename", "")),
        "dokskenas_id": getattr(doc, "pk", None),
    }

    logger.info(
        "[STEKAS] doc=%s type=%s fakturos_nr=%s counterparty=%s lines=%d",
        getattr(doc, "pk", None), direction, fakturos_nr,
        counterparty.get("name", "?"), len(line_items),
    )

    return result


# =========================
# Публичные функции экспорта
# =========================

def export_documents_group_to_stekas_json(
    documents: Iterable,
    site_url: str,
    company_code: Optional[str] = None,
    direction: Optional[str] = None,
) -> dict:
    """
    Собирает JSON-объект со всеми документами для плагина Stekas Plius.

    Returns:
        dict с ключами: format_version, exported_at, company_code, documents[]
    """
    docs = list(documents)
    result_docs = []

    for doc in docs:
        dir_ = _infer_direction(doc, direction)
        doc_data = _build_document_data(doc, dir_)
        result_docs.append(doc_data)

    data = {
        "format_version": "1.0",
        "format": "stekas_plius",
        "exported_at": _today_str_iso(),
        "site_url": site_url or "",
        "company_code": _s(company_code),
        "total_documents": len(result_docs),
        "documents": result_docs,
    }

    logger.info(
        "[STEKAS] export done: %d documents (pirkimai=%d, pardavimai=%d)",
        len(result_docs),
        sum(1 for d in result_docs if d["type"] == "pirkimas"),
        sum(1 for d in result_docs if d["type"] == "pardavimas"),
    )

    return data


def export_documents_group_to_stekas_files(
    documents: Iterable,
    site_url: str,
    company_code: Optional[str] = None,
    direction: Optional[str] = None,
) -> Tuple[bytes, str, str]:
    """
    Возвращает (content_bytes, filename, content_type).

    Генерирует ZIP с:
      - data.json — данные документов
      - manifest.json — метаинформация
    """
    data = export_documents_group_to_stekas_json(
        documents=documents,
        site_url=site_url,
        company_code=company_code,
        direction=direction,
    )

    today = _today_str_iso()

    # JSON bytes (UTF-8, pretty)
    json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")

    # Manifest
    manifest = {
        "format": "stekas_plius",
        "format_version": "1.0",
        "exported_at": today,
        "total_documents": data["total_documents"],
        "pirkimai": sum(1 for d in data["documents"] if d["type"] == "pirkimas"),
        "pardavimai": sum(1 for d in data["documents"] if d["type"] == "pardavimas"),
        "plugin_min_version": "1.0.0",
    }
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")

    # ZIP
    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", json_bytes)
        zf.writestr("manifest.json", manifest_bytes)

    filename = f"{today}_stekas_plius.zip"
    return zip_buf.getvalue(), filename, "application/zip"


# Обратная совместимость
def export_documents_group_to_stekas(
    documents: Iterable,
    site_url: str,
    company_code: Optional[str] = None,
    direction: Optional[str] = None,
) -> bytes:
    content, _filename, _ctype = export_documents_group_to_stekas_files(
        documents=documents,
        site_url=site_url,
        company_code=company_code,
        direction=direction,
    )
    return content