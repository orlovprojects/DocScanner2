# management/commands/backfill_invoice_defaults.py
"""
Backfill MeasurementUnit, InvoiceSeries, InvSubscription for existing users.

PowerShell:
    python manage.py backfill_invoice_defaults --dry-run
    python manage.py backfill_invoice_defaults
"""

from django.core.management.base import BaseCommand
from docscanner_app.models import CustomUser, MeasurementUnit, InvoiceSeries, InvSubscription


class Command(BaseCommand):
    help = "Create default MeasurementUnits, InvoiceSeries, and InvSubscription for users who don't have them"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without actually creating anything',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING("🔍 DRY RUN — ничего не будет создано\n"))

        users = CustomUser.objects.all()
        
        stats = {'units': 0, 'series': 0, 'subs': 0}

        for user in users.iterator():
            # MeasurementUnit
            if not MeasurementUnit.objects.filter(user=user).exists():
                if not dry_run:
                    MeasurementUnit.create_defaults_for_user(user)
                stats['units'] += 1

            # InvoiceSeries
            if not InvoiceSeries.objects.filter(user=user).exists():
                if not dry_run:
                    InvoiceSeries.create_defaults_for_user(user)
                stats['series'] += 1

            # InvSubscription
            if not InvSubscription.objects.filter(user=user).exists():
                if not dry_run:
                    InvSubscription.objects.create(user=user)
                stats['subs'] += 1

        action = "Will create" if dry_run else "Created"
        style = self.style.WARNING if dry_run else self.style.SUCCESS
        
        self.stdout.write(style(
            f"{action}: MeasurementUnits for {stats['units']} users, "
            f"InvoiceSeries for {stats['series']} users, "
            f"InvSubscription for {stats['subs']} users"
        ))
        
        if dry_run and any(stats.values()):
            self.stdout.write("\n👉 Запусти без --dry-run чтобы применить")