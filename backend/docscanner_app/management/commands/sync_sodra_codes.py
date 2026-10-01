"""
Sodros draudėjų kodai -> Company.sodra_kodas (failas arba URL, .json arba .zip).

    python manage.py sync_sodra_codes "C:\\Users\\dorlo\\Downloads\\daily-2026-08.json.zip"
"""
import requests
from django.core.management.base import BaseCommand, CommandError

from docscanner_app.services.sync_lt_companies import sync_sodra_codes


class Command(BaseCommand):
    help = "Užpildo Company.sodra_kodas iš atvira.sodra.lt duomenų rinkinio"

    def add_arguments(self, parser):
        parser.add_argument("source", help="Kelias iki .json/.zip arba URL")

    def handle(self, *args, **o):
        src = o["source"]
        try:
            if src.startswith("http"):
                r = requests.get(src, timeout=300)
                r.raise_for_status()
                raw = r.content
            else:
                with open(src, "rb") as f:
                    raw = f.read()
            msg, _ = sync_sodra_codes(raw)
            self.stdout.write(self.style.SUCCESS(msg))
        except (OSError, ValueError, requests.RequestException) as e:
            raise CommandError(f"Nepavyko: {e}")