from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Ištrina senus DU admin duomenis: įkeltų failų archyvą ir klaidų žurnalą (BDAR)"

    def add_arguments(self, parser):
        parser.add_argument("--uploads-days", type=int, default=365)
        parser.add_argument("--errors-days", type=int, default=180)

    def handle(self, *args, **opts):
        from docscanner_app.payroll.admin_tools import purge
        files, errors = purge(opts["uploads_days"], opts["errors_days"])
        self.stdout.write(f"Ištrinta: failų {files}, klaidų {errors}")
