"""
VAT Code Sanitizer

Очищает и валидирует VAT коды:
- Убирает пробелы и спецсимволы (-, /, ., и т.д.)
- Проверяет минимальную длину (6 символов)
- Проверяет наличие цифр (только буквы - невалидно)
"""

import re
from typing import Optional


def sanitize_vat_code(raw_code: Optional[str], min_length: int = 6) -> Optional[str]:
    """
    Очищает и валидирует VAT код.
    
    Правила:
    1. Убирает пробелы и спецсимволы (-, /, ., и т.д.)
    2. Минимальная длина после очистки - 6 символов
    3. Должны быть цифры (только буквы - невалидно)
    4. Только цифры или буквы+цифры - валидно
    
    Args:
        raw_code: Исходный VAT код от LLM
        min_length: Минимальная длина (по умолчанию 6)
    
    Returns:
        Очищенный VAT код или None если невалиден
    
    Examples:
        >>> sanitize_vat_code("LT 123-456-789")
        'LT123456789'
        >>> sanitize_vat_code("DE/123.456.789")
        'DE123456789'
        >>> sanitize_vat_code("ABCDEF")  # только буквы
        None
        >>> sanitize_vat_code("12345")  # слишком короткий
        None
        >>> sanitize_vat_code("123456")  # только цифры - OK
        '123456'
        >>> sanitize_vat_code("LT123456")  # буквы + цифры - OK
        'LT123456'
    """
    if not raw_code:
        return None
    
    # Приводим к строке
    code = str(raw_code).strip()
    if not code:
        return None
    
    # Убираем все кроме букв и цифр
    cleaned = re.sub(r'[^A-Za-z0-9]', '', code)
    
    # Приводим к верхнему регистру
    cleaned = cleaned.upper()
    
    # Проверяем минимальную длину
    if len(cleaned) < min_length:
        return None
    
    # Проверяем наличие хотя бы одной цифры
    if not re.search(r'\d', cleaned):
        return None
    
    return cleaned


def sanitize_company_id(raw_id: Optional[str], min_length: int = 6) -> Optional[str]:
    """
    Очищает и валидирует код компании (įmonės kodas).
    
    Те же правила что и для VAT code.
    """
    return sanitize_vat_code(raw_id, min_length=min_length)


# Для обратной совместимости
clean_vat_code = sanitize_vat_code