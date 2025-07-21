from django.core.management.base import BaseCommand
from docscanner_app.models import LineItem, ScannedDocument

class Command(BaseCommand):
    help = 'Удаляет все записи из LineItem и ScannedDocument'

    def handle(self, *args, **kwargs):
        # Сначала LineItem (если есть FK на ScannedDocument)
        LineItem.objects.all().delete()
        self.stdout.write(self.style.SUCCESS('Все LineItem удалены!'))

        # Теперь ScannedDocument
        ScannedDocument.objects.all().delete()
        self.stdout.write(self.style.SUCCESS('Все ScannedDocument удалены!'))