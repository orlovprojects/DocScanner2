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
    check_parties: bool = True  # ← НОВЫЙ параметр
) -> bool:
    """
    Дубликат, если:
    1. Совпадают серия/номер (по канонизированным значениям)
    2. Если check_parties=True: И совпадает хотя бы одна пара buyer/seller (не пустая)
    3. Если check_parties=False: Проверяем только серию/номер без контрагентов
    
    Сравнение ведётся по канонизированным/нормализованным значениям.
    Документы со статусом 'rejected' не считаются источником дублей.
    
    Параметры:
    - check_parties: если False, проверяется только серия/номер (для ранней проверки)
                     если True, дополнительно проверяются контрагенты (полная проверка)
    """
    from ..models import ScannedDocument
    
    in_num = _canon(number)
    in_ser = _canon(series)
    
    if not in_num:
        return False
    
    qs = ScannedDocument.objects.filter(user=user).exclude(status='rejected')
    if exclude_doc_id:
        qs = qs.exclude(pk=exclude_doc_id)
    
    # Если проверка контрагентов отключена, проверяем только серию/номер
    if not check_parties:
        for row in qs.values_list('document_number', 'document_series'):
            db_num, db_ser = row
            
            db_num_can = _canon(db_num)
            db_ser_can = _canon(db_ser)
            
            if db_num_can != in_num:
                continue
            
            if in_ser and db_ser_can != in_ser:
                continue
                
            return True  # Найден дубликат только по серии/номеру
        
        return False
    
    # Полная проверка с контрагентами
    fields = [
        'document_number', 'document_series',
        'buyer_id', 'seller_id',
        'buyer_name', 'seller_name',
        'buyer_vat_code', 'seller_vat_code'
    ]
    
    for row in qs.values_list(*fields):
        db_num, db_ser, db_buyer_id, db_seller_id, db_buyer_name, db_seller_name, db_buyer_vat_code, db_seller_vat_code = row
        
        # Проверяем совпадение серии/номера
        db_num_can = _canon(db_num)
        db_ser_can = _canon(db_ser)
        
        if db_num_can != in_num:
            continue
        
        if in_ser and db_ser_can != in_ser:
            continue
        
        # Серия/номер совпали, теперь проверяем buyer/seller
        if _check_party_match(
            buyer_id, seller_id, buyer_name, seller_name, buyer_vat_code, seller_vat_code,
            db_buyer_id, db_seller_id, db_buyer_name, db_seller_name, db_buyer_vat_code, db_seller_vat_code
        ):
            return True
    
    return False