from __future__ import absolute_import, unicode_literals
import os
from celery import Celery

# 1. Устанавливаем переменную окружения до всего остального!
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# 2. Создаём экземпляр Celery
app = Celery('backend')

# 3. Настраиваем Celery с использованием Django настроек
app.config_from_object('django.conf:settings', namespace='CELERY')

# 4. Автоматически обнаруживаем задачи
app.autodiscover_tasks()





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