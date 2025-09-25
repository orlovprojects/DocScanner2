import json
import logging
logger = logging.getLogger("docscanner_app")

TRUTHY = {"1", "true", "yes", "on", "taip", "y"}

def _to_bool(val):
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    s = str(val).strip().lower()
    return s in TRUTHY

def _parse_extra_settings(raw):
    """
    user.extra_settings может быть dict / list / JSON-строка / None.
    Возвращаем dict.
    """
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return data
        except Exception as e:
            logger.warning("Failed to parse user.extra_settings JSON: %s", e)
    return {}

def apply_user_extra_settings(doc_struct: dict, user) -> dict:
    """
    Применяет правила из user.extra_settings к doc_struct (in-place friendly).
    Сейчас поддерживаем:
      - {"operation_date=document_date": 1} → operation_date берём из invoice_date
    Возвращает doc_struct (на всякий случай).
    """
    settings = _parse_extra_settings(getattr(user, "extra_settings", None))

    # Ключ задуман как "operation_date=document_date", но сами данные у нас invoice_date.
    # Делаем маппинг source aliases → фактическое поле.
    source_field_map = {
        "document_date": "invoice_date",  # алиас → поле в doc_struct
    }

    key = "operation_date=document_date"
    if _to_bool(settings.get(key)):
        src_alias = "document_date"
        src_field = source_field_map.get(src_alias, src_alias)
        src_val = doc_struct.get(src_field)
        if src_val:  # только если есть что копировать
            doc_struct["operation_date"] = src_val

    return doc_struct