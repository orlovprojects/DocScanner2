# utils/duplicates.py
import re
from django.db.models import Q

_ALNUM_RE = re.compile(r'[\W_]+', flags=re.UNICODE)  # удаляем всё, что НЕ буквы/цифры (и подчёркивания тоже)

def _canon(s: str | None) -> str:
    """
    Очищает строку: приводит к нижнему регистру и удаляет все символы, кроме букв и цифр.
    Поддерживает Unicode-буквы (литовские, кириллица и т.п.).
    """
    s = (s or "").casefold()
    # \w в Unicode включает буквы/цифры/подчёркивание; убираем всё НЕ \w и подчёркивания
    # Эквивалент: оставить только буквы и цифры любой локали.
    return _ALNUM_RE.sub("", s)

def is_duplicate_by_series_number(user, number: str | None, series: str | None, exclude_doc_id=None) -> bool:
    """
    Дубликат, если:
      - series НЕ пустая -> совпадает (canon(number) И canon(series))
      - series пустая    -> совпадает canon(number), серия игнорируется

    Сравнение ведётся по канонизированным значениям (только буквы+цифры, без пробелов, дефисов, '/' и т.д.).
    Документы со статусом 'rejected' не считаем источником дублей (при необходимости уберите это ограничение).
    """
    from ..models import ScannedDocument  # локальный импорт, чтобы избежать циклов

    in_num = _canon(number)
    in_ser = _canon(series)

    if not in_num:
        return False

    qs = ScannedDocument.objects.filter(user=user).exclude(status='rejected')
    if exclude_doc_id:
        qs = qs.exclude(pk=exclude_doc_id)

    # Тянем только нужные поля, чтобы не тащить всё подряд
    for row in qs.values_list('document_number', 'document_series'):
        db_num = _canon(row[0])
        db_ser = _canon(row[1])
        if db_num != in_num:
            continue
        if in_ser:
            # если у входного есть серия — сравниваем обе
            if db_ser == in_ser:
                return True
        else:
            # если у входного серии нет — достаточно равенства номера
            return True

    return False
