# validators/required_fields_checker.py

import logging
from decimal import Decimal
from typing import Optional, Any

logger = logging.getLogger("docscanner_app")


def check_required_fields_for_export(db_doc) -> bool:
    """
    Проверяет наличие всех обязательных полей для экспорта документа.
    
    Обязательные поля:
    - seller_name
    - buyer_name
    - invoice_date
    - currency
    - document_number
    - amount_wo_vat (не может быть 0)
    - vat_amount (может быть 0)
    - vat_percent (может быть 0)
    - amount_with_vat (не может быть 0)
    
    Если есть line_items (detaliai), дополнительно в каждой строке:
    - price (может быть 0)
    - quantity (может быть 0)
    - subtotal (не может быть 0)
    - vat (может быть 0)
    - total (не может быть 0)
    
    Returns:
        bool: True если все поля заполнены, False если что-то отсутствует
    """
    missing_fields = []
    
    # 1) Проверка базовых полей документа
    # Поля, которые могут быть 0
    fields_can_be_zero = {
        'seller_name': db_doc.seller_name,
        'buyer_name': db_doc.buyer_name,
        'invoice_date': db_doc.invoice_date,
        'currency': db_doc.currency,
        'document_number': db_doc.document_number,
        'vat_amount': db_doc.vat_amount,
        'vat_percent': db_doc.vat_percent,
    }
    
    # Поля, которые НЕ могут быть 0
    fields_cannot_be_zero = {
        'amount_wo_vat': db_doc.amount_wo_vat,
        'amount_with_vat': db_doc.amount_with_vat,
    }
    
    # Проверяем поля, которые могут быть 0
    for field_name, field_value in fields_can_be_zero.items():
        if not _is_field_filled(field_value, allow_zero=True):
            missing_fields.append(field_name)
            logger.debug(f"Missing required field: {field_name}")
    
    # Проверяем поля, которые НЕ могут быть 0
    for field_name, field_value in fields_cannot_be_zero.items():
        if not _is_field_filled(field_value, allow_zero=False):
            missing_fields.append(field_name)
            logger.debug(f"Missing or zero required field: {field_name}")
    
    # 2) Проверка строк (если есть)
    line_items = db_doc.line_items.all()
    if line_items.exists():
        for idx, line in enumerate(line_items, start=1):
            line_missing = []
            
            # Поля строки, которые могут быть 0
            line_fields_can_be_zero = {
                'price': line.price,
                'quantity': line.quantity,
                'vat': line.vat,
            }
            
            # Поля строки, которые НЕ могут быть 0
            line_fields_cannot_be_zero = {
                'subtotal': line.subtotal,
                'total': line.total,
            }
            
            for field_name, field_value in line_fields_can_be_zero.items():
                if not _is_field_filled(field_value, allow_zero=True):
                    line_missing.append(field_name)
            
            for field_name, field_value in line_fields_cannot_be_zero.items():
                if not _is_field_filled(field_value, allow_zero=False):
                    line_missing.append(field_name)
            
            if line_missing:
                missing_fields.append(f"line_item[{idx}]: {', '.join(line_missing)}")
                logger.debug(f"Line {idx} missing fields: {', '.join(line_missing)}")
    
    # 3) Устанавливаем флаг
    is_complete = len(missing_fields) == 0
    
    if is_complete:
        logger.info(f"Document {db_doc.id}: All required fields present for export ✓")
    else:
        logger.warning(f"Document {db_doc.id}: Missing/invalid fields for export: {', '.join(missing_fields)}")
    
    return is_complete


def _is_field_filled(value: Any, allow_zero: bool = True) -> bool:
    """
    Проверяет, заполнено ли поле значением.
    
    Args:
        value: Значение поля любого типа
        allow_zero: Если True, то 0 считается валидным значением.
                    Если False, то 0 считается невалидным (для сумм).
        
    Returns:
        bool: True если поле заполнено валидным значением
    """
    # None -> False
    if value is None:
        return False
    
    # Строка -> проверяем, что не пустая после strip
    if isinstance(value, str):
        return bool(value.strip())
    
    # Decimal/числа -> проверяем на None и опционально на ноль
    if isinstance(value, (Decimal, int, float)):
        if not allow_zero:
            # Для сумм: не должно быть ни None, ни 0
            return value != 0 and value is not None
        else:
            # Для остальных: любое число включая 0 валидно
            return True
    
    # Дата -> считаем валидной если есть
    if hasattr(value, 'year'):  # date, datetime
        return True
    
    # Остальное -> проверяем bool(value)
    return bool(value)