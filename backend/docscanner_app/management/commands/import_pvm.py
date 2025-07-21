from django.core.management.base import BaseCommand
import csv
from docscanner_app.models import PVMKlasifikatoriai

class Command(BaseCommand):
    help = 'Importuoja PVM klasifikatorius iš CSV'

    def handle(self, *args, **kwargs):
        with open('C:/JavaScript/DocScanner/backend/pvm_klasifikatoriai.csv', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                tarifas = row['tarifas'] if row['tarifas'] != '-' else None
                PVMKlasifikatoriai.objects.update_or_create(
                    kodas=row['kodas'],
                    defaults={
                        'aprasymas': row['aprasymas'],
                        'tarifas': tarifas,
                    }
                )
        self.stdout.write(self.style.SUCCESS('✅ Import finished!'))






# import csv
# from docscanner_app.models import PVMKlasifikatoriai

# with open('C:/JavaScript/DocScanner/backend/pvm_klasifikatoriai.csv', encoding='utf-8') as f:
#     reader = csv.DictReader(f, delimiter=';')
#     for row in reader:
#         # Обработка пустых тарифов
#         tarifas = row['tarifas'] if row['tarifas'] != '-' else None
#         PVMKlasifikatoriai.objects.update_or_create(
#             kodas=row['kodas'],
#             defaults={
#                 'aprasymas': row['aprasymas'],
#                 'tarifas': tarifas,
#             }
#         )