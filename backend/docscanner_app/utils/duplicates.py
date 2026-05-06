# utils/duplicates.py
import re
from django.db.models import Q
from ..validators.company_name_normalizer import normalize_company_name

_ALNUM_RE = re.compile(r'[\W_]+', flags=re.UNICODE)

def _canon(s: str | None) -> str:
    """
    Очищает строку: приводит к нижнему регистру и удаляет все символы,
    кроме букв и цифр. Поддерживает Unicode-буквы (литовские, кириллица и т.п.).
    """
    s = (s or "").casefold()
    return _ALNUM_RE.sub("", s)

def _date_key(value) -> str:
    if not value:
        return ""

    if hasattr(value, "date"):
        value = value.date()

    return str(value).strip()[:10]


def _series_matches(in_ser: str, db_ser: str) -> bool:
    # Если у входящего документа серии нет, дублем считаем только документ без серии.
    # Если серия есть, она должна совпадать.
    if not in_ser:
        return not db_ser

    return db_ser == in_ser


def _check_party_match(
    in_buyer_id: str, in_seller_id: str,
    in_buyer_name: str, in_seller_name: str,
    in_buyer_vat_code: str, in_seller_vat_code: str,
    db_buyer_id: str, db_seller_id: str,
    db_buyer_name: str, db_seller_name: str,
    db_buyer_vat_code: str, db_seller_vat_code: str
) -> bool:
    """
    Проверяет, совпадает ли хотя бы одна пара buyer/seller между входными 
    данными и данными из БД (исключая пустые значения).
    
    Возвращает True, если найдено совпадение.
    """
    # Нормализуем имена компаний
    in_buyer_name_norm = normalize_company_name(in_buyer_name)
    in_seller_name_norm = normalize_company_name(in_seller_name)
    db_buyer_name_norm = normalize_company_name(db_buyer_name)
    db_seller_name_norm = normalize_company_name(db_seller_name)
    
    # Канонизируем остальные поля
    in_buyer_id_can = _canon(in_buyer_id)
    in_seller_id_can = _canon(in_seller_id)
    in_buyer_vat_code_can = _canon(in_buyer_vat_code)
    in_seller_vat_code_can = _canon(in_seller_vat_code)
    
    db_buyer_id_can = _canon(db_buyer_id)
    db_seller_id_can = _canon(db_seller_id)
    db_buyer_vat_code_can = _canon(db_buyer_vat_code)
    db_seller_vat_code_can = _canon(db_seller_vat_code)
    
    # Проверяем все возможные пары (прямые и перекрёстные)
    checks = [
        # Прямые пары buyer-buyer, seller-seller
        (in_buyer_id_can, db_buyer_id_can, in_seller_id_can, db_seller_id_can),
        (in_buyer_name_norm, db_buyer_name_norm, in_seller_name_norm, db_seller_name_norm),
        (in_buyer_vat_code_can, db_buyer_vat_code_can, in_seller_vat_code_can, db_seller_vat_code_can),
        
        # Перекрёстные пары (mix)
        (in_buyer_id_can, db_buyer_id_can, in_seller_name_norm, db_seller_name_norm),
        (in_buyer_id_can, db_buyer_id_can, in_seller_vat_code_can, db_seller_vat_code_can),
        (in_buyer_name_norm, db_buyer_name_norm, in_seller_id_can, db_seller_id_can),
        (in_buyer_name_norm, db_buyer_name_norm, in_seller_vat_code_can, db_seller_vat_code_can),
        (in_buyer_vat_code_can, db_buyer_vat_code_can, in_seller_id_can, db_seller_id_can),
        (in_buyer_vat_code_can, db_buyer_vat_code_can, in_seller_name_norm, db_seller_name_norm),
    ]
    
    for buyer_in, buyer_db, seller_in, seller_db in checks:
        # Оба поля должны быть непустыми и совпадать
        if (buyer_in and buyer_db and buyer_in == buyer_db and
            seller_in and seller_db and seller_in == seller_db):
            return True
    
    return False


def is_duplicate_by_series_number(
    user,
    number: str | None,
    series: str | None,
    exclude_doc_id=None,
    buyer_id: str | None = None,
    seller_id: str | None = None,
    buyer_name: str | None = None,
    seller_name: str | None = None,
    buyer_vat_code: str | None = None,
    seller_vat_code: str | None = None,
    check_parties: bool = True,
    invoice_date: str | None = None
) -> bool:
    """
    Дубликат, если:
    1. Совпадает номер
    2. Совпадает серия, включая случай пустая серия == пустая серия
    3. Совпадает invoice_date

    Если check_parties=True, дополнительно дубликат может быть найден по совпадающим
    buyer/seller данным, но только после совпадения номер/серия.
    """
    from ..models import ScannedDocument

    in_num = _canon(number)
    in_ser = _canon(series)
    in_invoice_date = _date_key(invoice_date)

    if not in_num:
        return False

    qs = ScannedDocument.objects.filter(user=user).exclude(status="rejected")

    if exclude_doc_id:
        qs = qs.exclude(pk=exclude_doc_id)

    fields = [
        "document_number",
        "document_series",
        "buyer_id",
        "seller_id",
        "buyer_name",
        "seller_name",
        "buyer_vat_code",
        "seller_vat_code",
        "invoice_date",
    ]

    for row in qs.values_list(*fields):
        (
            db_num,
            db_ser,
            db_buyer_id,
            db_seller_id,
            db_buyer_name,
            db_seller_name,
            db_buyer_vat_code,
            db_seller_vat_code,
            db_invoice_date,
        ) = row

        db_num_can = _canon(db_num)
        db_ser_can = _canon(db_ser)
        db_invoice_date_str = _date_key(db_invoice_date)

        if db_num_can != in_num:
            continue

        if not _series_matches(in_ser, db_ser_can):
            continue

        if not in_invoice_date or not db_invoice_date_str:
            continue

        if in_invoice_date != db_invoice_date_str:
            continue

        if not check_parties:
            return True

        if _check_party_match(
            buyer_id,
            seller_id,
            buyer_name,
            seller_name,
            buyer_vat_code,
            seller_vat_code,
            db_buyer_id,
            db_seller_id,
            db_buyer_name,
            db_seller_name,
            db_buyer_vat_code,
            db_seller_vat_code,
        ):
            return True

        return True

    return False