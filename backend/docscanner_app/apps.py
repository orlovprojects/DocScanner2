# from django.apps import AppConfig

# class DocscannerAppConfig(AppConfig):
#     default_auto_field = "django.db.models.BigAutoField"
#     name = "docscanner_app"

#     def ready(self):
#         import docscanner_app.celery_signals  # noqa
#         import docscanner_app.utils.signals  # noqa



from django.apps import AppConfig

class DocscannerAppConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "docscanner_app"

    def ready(self):
        # Фикс django-tasks 0.9.0 на Python 3.11: TaskResult[T](...) падает на __orig_class__
        from django_tasks.backends import immediate
        immediate.TaskResult.__class_getitem__ = classmethod(lambda cls, item: cls)

        import docscanner_app.celery_signals  # noqa
        import docscanner_app.utils.signals  # noqa
        import docscanner_app.signals.wagtail_publish  # noqa