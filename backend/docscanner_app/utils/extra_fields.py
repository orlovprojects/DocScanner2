"""
Утилиты для работы с per-company extra fields.

Файл: docscanner_app/utils/extra_fields.py
(создать utils/__init__.py если нет)
"""

import logging

logger = logging.getLogger("docscanner_app")

# ──── Маппинг: program (Select value на фронте) → имя поля на CustomUser ────
PROGRAM_TO_FIELD = {
    "rivile":          "rivile_gama_extra_fields",
    "rivile_erp":      "rivile_erp_extra_fields",
    "rivile_gama_api": "rivile_gama_extra_fields",
    "butent":          "butent_extra_fields",
    "finvalda":        "finvalda_extra_fields",
    "centas":          "centas_extra_fields",
    "pragma4":         "pragma4_extra_fields",
    "dineta":          "dineta_extra_fields",
    "optimum":         "optimum_extra_fields",
    "debetas":         "debetas_extra_fields",
    "pragma3":         "pragma3_extra_fields",
    "site_pro":        "site_pro_extra_fields",
    "agnum":           "agnum_extra_fields",
}

# Допустимые program_key значения для endpoint'а
# (используем имена полей без _extra_fields как ключи)
VALID_PROGRAM_KEYS = set(PROGRAM_TO_FIELD.keys())


def get_field_name(program_key):
    """Получить имя поля модели по program_key."""
    return PROGRAM_TO_FIELD.get(program_key)


def get_extra_for_export(user, program_key, imones_kodas=None):
    """
    Получить extra fields для экспорта.

    Приоритет:
      1. Профиль конкретной фирмы (по imones_kodas)
      2. Глобальный профиль (__all__)
      3. Пустой dict

    Поддерживает и старый плоский формат (для не-мигрированных юзеров),
    и новый nested формат.

    Возвращает: dict с полями.
    """
    field_name = get_field_name(program_key)
    if not field_name:
        return {}

    data = getattr(user, field_name, None)
    if not data or not isinstance(data, dict):
        return {}

    # Определяем формат: nested или плоский (legacy)
    if "__all__" in data or _looks_nested(data):
        # Nested формат
        if imones_kodas:
            company_code = str(imones_kodas).strip()
            profile = data.get(company_code)
            if profile and isinstance(profile, dict):
                # Убираем служебные ключи
                return {k: v for k, v in profile.items() if not k.startswith("__")}

        # Fallback на __all__
        all_profile = data.get("__all__")
        if all_profile and isinstance(all_profile, dict):
            return {k: v for k, v in all_profile.items() if not k.startswith("__")}

        return {}
    else:
        # Старый плоский формат (legacy, до миграции)
        return data


def _looks_nested(data):
    """
    Эвристика: если все ключи верхнего уровня НЕ содержат "_"
    (кроме __спец__), значит это nested формат с company codes как ключами.
    """
    if not data:
        return False
    for key in data:
        if key.startswith("__"):
            continue
        if "_" in key:
            return False
    return True


def get_profiles_summary(data):
    """
    Из nested dict получить лёгкий список профилей (без полных полей).

    Возвращает list of dicts:
    [
      {"company_code": "__all__", "company_name": "", "fields_count": 3, "updated_at": None},
      {"company_code": "123456", "company_name": "UAB Firma", "fields_count": 2, "updated_at": None},
      ...
    ]

    Отсортировано: __all__ первым, остальные по company_name.
    """
    if not data or not isinstance(data, dict):
        return []

    # Если плоский (legacy) — возвращаем один __all__ профиль
    if not _looks_nested(data) and "__all__" not in data:
        count = sum(1 for v in data.values() if v not in (None, ""))
        if count == 0:
            return []
        return [{
            "company_code": "__all__",
            "company_name": "",
            "fields_count": count,
        }]

    result = []
    for key, profile in data.items():
        if not isinstance(profile, dict):
            continue
        fields_count = sum(
            1 for k, v in profile.items()
            if not k.startswith("__") and v not in (None, "")
        )
        result.append({
            "company_code": key,
            "company_name": profile.get("__name__", ""),
            "fields_count": fields_count,
        })

    # Сортировка: __all__ первый, остальные по имени
    def sort_key(item):
        if item["company_code"] == "__all__":
            return (0, "")
        return (1, (item["company_name"] or "").lower())

    result.sort(key=sort_key)
    return result


def count_non_empty_fields(profile):
    """Количество непустых полей в профиле (исключая служебные __)."""
    if not profile or not isinstance(profile, dict):
        return 0
    return sum(
        1 for k, v in profile.items()
        if not k.startswith("__") and v not in (None, "")
    )


def get_non_empty_field_keys(profile):
    """Список ключей с непустыми значениями (для предупреждения при перезаписи)."""
    if not profile or not isinstance(profile, dict):
        return []
    return [
        k for k, v in profile.items()
        if not k.startswith("__") and v not in (None, "")
    ]
