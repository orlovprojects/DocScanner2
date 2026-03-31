from django.apps import AppConfig

class DocscannerAppConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "docscanner_app"

    def ready(self):
        import docscanner_app.celery_signals  # noqa