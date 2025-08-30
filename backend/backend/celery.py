from __future__ import absolute_import, unicode_literals
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

app = Celery('backend')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Важно! Таймзона должна быть явно задана:
app.conf.timezone = 'Europe/Vilnius'
app.conf.enable_utc = False

app.conf.beat_schedule = {
    'fetch-currency-rates-every-morning': {
        'task': 'docscanner_app.tasks.fetch_daily_currency_rates',
        'schedule': crontab(hour=10, minute=0),  # Каждый день в 13:00 по Вильнюсу
    },
}




# from __future__ import absolute_import, unicode_literals
# import os
# from celery import Celery
# import django

# # 1. Устанавливаем переменную окружения до всего остального!
# os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# # 2. (Важно!) Инициализируем Django вручную для подгрузки настроек ДО логирования
# django.setup()

# # 3. Только теперь можно брать LOGGING из настроек Django
# from django.conf import settings
# import logging.config

# # 4. Настроим логирование (это подтянет file/console/handlers из settings)
# logging.config.dictConfig(settings.LOGGING)

# # 5. Создаём экземпляр Celery
# app = Celery('backend')

# # 6. Настраиваем Celery с использованием Django настроек
# app.config_from_object('django.conf:settings', namespace='CELERY')

# # 7. Автоматически обнаруживаем задачи
# app.autodiscover_tasks()