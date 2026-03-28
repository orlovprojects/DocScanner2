"""
Data migration: конвертация плоских *_extra_fields → nested с __all__.

Файл: docscanner_app/management/commands/migrate_extra_fields_nested.py
Создайте management/ и management/commands/ с __init__.py если их нет.

Использование:
  python manage.py migrate_extra_fields_nested --dry-run
  python manage.py migrate_extra_fields_nested
"""

import logging
from django.core.management.base import BaseCommand

logger = logging.getLogger("docscanner_app")

EXTRA_FIELD_NAMES = [
    "rivile_erp_extra_fields",
    "rivile_gama_extra_fields",
    "butent_extra_fields",
    "finvalda_extra_fields",
    "centas_extra_fields",
    "agnum_extra_fields",
    "debetas_extra_fields",
    "site_pro_extra_fields",
    "pragma3_extra_fields",
    "pragma4_extra_fields",
    "optimum_extra_fields",
    "dineta_extra_fields",
]


def is_already_nested(data):
    """
    Проверяем, конвертирован ли уже dict в nested формат.
    Nested = есть ключ "__all__" ИЛИ все ключи верхнего уровня
    выглядят как company codes (цифровые строки) или спец-ключи (__all__).
    Плоский = ключи вроде "pirkimas_sandelis", "pardavimas_tipas" и т.д.
    """
    if not data or not isinstance(data, dict):
        return False
    if "__all__" in data:
        return True
    # Если хоть один ключ содержит "_" — это плоский формат
    for key in data:
        if "_" in key and not key.startswith("__"):
            return False
    # Если все ключи — цифры или __спец__ — считаем nested
    return True


def has_non_empty_values(d):
    """Есть ли хоть одно непустое значение в dict."""
    if not d or not isinstance(d, dict):
        return False
    return any(v not in (None, "") for v in d.values())


class Command(BaseCommand):
    help = (
        "Конвертирует плоские *_extra_fields в nested формат с ключом __all__. "
        "Существующие данные становятся глобальным профилем (для всех фирм)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Показать что будет сделано без записи в БД.",
        )

    def handle(self, *args, **options):
        from docscanner_app.models import CustomUser

        dry_run = options["dry_run"]
        converted = 0
        skipped_empty = 0
        skipped_nested = 0
        total_users = CustomUser.objects.count()

        self.stdout.write(f"Обрабатываю {total_users} пользователей...")

        for user in CustomUser.objects.iterator(chunk_size=200):
            fields_to_update = []

            for field_name in EXTRA_FIELD_NAMES:
                data = getattr(user, field_name, None)

                # Пустое / None / не dict — пропускаем
                if not data or not isinstance(data, dict):
                    skipped_empty += 1
                    continue

                # Уже nested — пропускаем
                if is_already_nested(data):
                    skipped_nested += 1
                    continue

                # Нет непустых значений — оставляем пустым nested
                if not has_non_empty_values(data):
                    new_data = {}
                    skipped_empty += 1
                else:
                    # Конвертируем: плоский dict → {"__all__": {плоский dict}}
                    new_data = {"__all__": dict(data)}
                    converted += 1

                    if dry_run:
                        non_empty = sum(
                            1 for v in data.values() if v not in (None, "")
                        )
                        self.stdout.write(
                            f"  CONVERT: user={user.pk} ({user.email}), "
                            f"field={field_name}, "
                            f"non_empty_values={non_empty}"
                        )

                if not dry_run:
                    setattr(user, field_name, new_data)
                    fields_to_update.append(field_name)

            if fields_to_update and not dry_run:
                user.save(update_fields=fields_to_update)

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{prefix}"
                f"Конвертировано: {converted}, "
                f"Пропущено (пустые): {skipped_empty}, "
                f"Пропущено (уже nested): {skipped_nested}"
            )
        )