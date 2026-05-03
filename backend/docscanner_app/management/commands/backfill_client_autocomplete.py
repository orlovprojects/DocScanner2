from django.core.management.base import BaseCommand
from django.db.models import Q
from docscanner_app.models import ScannedDocument, ClientAutocomplete, CustomUser
from docscanner_app.utils.client_autocomplete_upsert import upsert_client_from_document, normalize_name


class Command(BaseCommand):
    help = "Backfill ClientAutocomplete from existing ScannedDocuments"

    def add_arguments(self, parser):
        parser.add_argument("--user-id", type=int, help="Only for specific user")
        parser.add_argument("--update-normalized", action="store_true",
                            help="Update name_normalized for existing records")

    def handle(self, *args, **options):
        if options["update_normalized"]:
            updated = 0
            for c in ClientAutocomplete.objects.filter(
                Q(name_normalized="") | Q(name_normalized__isnull=True)
            ).iterator():
                norm = normalize_name(c.pavadinimas or "")
                if norm:
                    c.name_normalized = norm
                    c.save(update_fields=["name_normalized"])
                    updated += 1
            self.stdout.write(f"Updated name_normalized for {updated} records")

        users_qs = CustomUser.objects.all()
        if options["user_id"]:
            users_qs = users_qs.filter(id=options["user_id"])

        for user in users_qs:
            docs = ScannedDocument.objects.filter(
                user=user,
                status__in=("completed", "exported"),
                is_archive_container=False,
                is_multi_doc_container=False,
            )

            count = 0
            for doc in docs.iterator():
                if doc.seller_name or doc.seller_id:
                    upsert_client_from_document(user, {
                        "name": doc.seller_name,
                        "company_code": doc.seller_id,
                        "vat_code": doc.seller_vat_code,
                        "address": doc.seller_address,
                        "country_iso": doc.seller_country_iso,
                        "iban": doc.seller_iban,
                        "is_person": doc.seller_is_person,
                    })
                    count += 1

                if doc.buyer_name or doc.buyer_id:
                    upsert_client_from_document(user, {
                        "name": doc.buyer_name,
                        "company_code": doc.buyer_id,
                        "vat_code": doc.buyer_vat_code,
                        "address": doc.buyer_address,
                        "country_iso": doc.buyer_country_iso,
                        "iban": doc.buyer_iban,
                        "is_person": doc.buyer_is_person,
                    })
                    count += 1

            self.stdout.write(f"User {user.id} ({user.email}): processed {count} sides")

        self.stdout.write(self.style.SUCCESS("Done"))