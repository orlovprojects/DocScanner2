from django.core.management.base import BaseCommand
from docscanner_app.models import CustomUser


class Command(BaseCommand):
    help = "Generate email inbox tokens for all users who don't have one"

    def handle(self, *args, **options):
        users = CustomUser.objects.filter(email_inbox_token__isnull=True)
        count = 0
        for user in users.iterator():
            user.ensure_inbox_token(save=True)
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Generated tokens for {count} users"))