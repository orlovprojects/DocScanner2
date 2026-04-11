"""
Management command: создаёт тестовый API ключ Rivile GAMA для mock server.

Использование:
    python manage.py setup_rivile_mock
    python manage.py setup_rivile_mock --user-id 1
    python manage.py setup_rivile_mock --email admin@example.com
    python manage.py setup_rivile_mock --company-code 304401940
    python manage.py setup_rivile_mock --api-key my-custom-key
    python manage.py setup_rivile_mock --verify  # проверить подключение к mock
"""
import requests
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Sukuria testinį Rivile GAMA API raktą mock serveriui testuoti"

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id", type=int, default=None,
            help="User ID (default: first superuser or first user)",
        )
        parser.add_argument(
            "--email", type=str, default=None,
            help="User email (alternative to --user-id)",
        )
        parser.add_argument(
            "--company-code", type=str, default=None,
            help="Įmonės kodas (default: user.company_code or '123456789')",
        )
        parser.add_argument(
            "--api-key", type=str, default="test-mock-api-key-1234567890",
            help="API key value (default: test-mock-api-key-1234567890)",
        )
        parser.add_argument(
            "--label", type=str, default="Test Mock Server",
            help="Label for the key card",
        )
        parser.add_argument(
            "--mock-url", type=str, default="http://localhost:8879/client/v2",
            help="Mock server URL (for --verify)",
        )
        parser.add_argument(
            "--verify", action="store_true",
            help="Also verify connection to mock server",
        )
        parser.add_argument(
            "--delete", action="store_true",
            help="Delete existing test key instead of creating",
        )

    def handle(self, *args, **options):
        from docscanner_app.models import CustomUser, APIProviderKey

        # --- Находим юзера ---
        user = None
        if options["email"]:
            try:
                user = CustomUser.objects.get(email=options["email"])
            except CustomUser.DoesNotExist:
                raise CommandError(f"User with email '{options['email']}' not found")
        elif options["user_id"]:
            try:
                user = CustomUser.objects.get(pk=options["user_id"])
            except CustomUser.DoesNotExist:
                raise CommandError(f"User with id={options['user_id']} not found")
        else:
            user = (
                CustomUser.objects.filter(is_superuser=True).first()
                or CustomUser.objects.first()
            )

        if not user:
            raise CommandError("No users found in database")

        company_code = (
            options["company_code"]
            or (user.company_code if hasattr(user, "company_code") and user.company_code else None)
            or "123456789"
        )
        api_key = options["api_key"]
        label = options["label"]

        self.stdout.write("")
        self.stdout.write("=" * 55)
        self.stdout.write("  Rivile GAMA Mock Server — Setup")
        self.stdout.write("=" * 55)
        self.stdout.write(f"  User:          {user.email} (id={user.pk})")
        self.stdout.write(f"  Company code:  {company_code}")
        self.stdout.write(f"  API key:       {api_key[:8]}...{api_key[-4:]}")
        self.stdout.write(f"  Label:         {label}")

        # --- Delete mode ---
        if options["delete"]:
            deleted, _ = APIProviderKey.objects.filter(
                user=user, provider="rivile_gama_api", company_code=company_code,
            ).delete()
            if deleted:
                self.stdout.write(self.style.SUCCESS(f"\n  ✓ Deleted {deleted} key(s) for {company_code}"))
            else:
                self.stdout.write(self.style.WARNING(f"\n  — No keys found for {company_code}"))
            return

        # --- Создаём или обновляем ---
        obj, created = APIProviderKey.objects.get_or_create(
            user=user,
            provider="rivile_gama_api",
            company_code=company_code,
            defaults={"label": label, "is_active": True},
        )

        obj.set_credentials({"api_key": api_key})
        obj.label = label
        obj.is_active = True
        obj.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(
            f"\n  ✓ {action} key: id={obj.pk} suffix=****{obj.key_suffix}"
        ))

        # --- Verify ---
        if options["verify"]:
            mock_url = options["mock_url"]
            self.stdout.write(f"\n  Verifying connection to {mock_url} ...")

            try:
                resp = requests.post(
                    mock_url,
                    json={"method": "GET_N08_LIST", "params": {"pagenumber": 1}},
                    headers={
                        "ApiKey": api_key,
                        "Content-Type": "application/json",
                    },
                    timeout=10,
                )

                if resp.status_code == 200:
                    self.stdout.write(self.style.SUCCESS(
                        f"  ✓ Mock server OK (HTTP {resp.status_code})"
                    ))
                    obj.mark_verified(success=True)
                else:
                    self.stdout.write(self.style.ERROR(
                        f"  ✗ Mock server returned HTTP {resp.status_code}: {resp.text[:200]}"
                    ))
                    obj.mark_verified(success=False, error=f"HTTP {resp.status_code}")

            except requests.exceptions.ConnectionError:
                self.stdout.write(self.style.ERROR(
                    f"  ✗ Cannot connect to {mock_url}"
                ))
                self.stdout.write(self.style.WARNING(
                    "    Start mock server first: python docscanner_app/utils/rivile_gama_mock_server.py 8879"
                ))
                obj.mark_verified(success=False, error="Connection refused")

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ Error: {e}"))
                obj.mark_verified(success=False, error=str(e))

        # --- Итого ---
        self.stdout.write("")
        self.stdout.write("-" * 55)
        self.stdout.write("  Next steps:")
        self.stdout.write("")
        self.stdout.write("  1. Start mock server:")
        self.stdout.write("     python docscanner_app/utils/rivile_gama_mock_server.py 8879")
        self.stdout.write("")
        self.stdout.write("  2. Make sure RIVILE_API_URL points to mock:")
        self.stdout.write("     RIVILE_API_URL = 'http://localhost:8879/client/v2'")
        self.stdout.write("")
        self.stdout.write("  3. Start Celery worker:")
        self.stdout.write("     celery -A config worker -l info")
        self.stdout.write("")
        self.stdout.write("  4. Start Django dev server:")
        self.stdout.write("     python manage.py runserver")
        self.stdout.write("")
        self.stdout.write("  5. Open Nustatymai → Rivile GAMA API → check key card")
        self.stdout.write("  6. Open Suvestinė → select docs → Eksportuoti")
        self.stdout.write("=" * 55)
        self.stdout.write("")