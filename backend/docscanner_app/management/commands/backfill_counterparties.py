from django.core.management.base import BaseCommand

from docscanner_app.models import Invoice, Purchase, JournalEntry, JournalEntryLine, RecurringInvoice
from docscanner_app.services.counterparties import counterparty_from_party


class Command(BaseCommand):
    help = "Sukuria kontrahentų korteles iš esamų pardavimų / pirkimų ir priskiria FK"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        stats = {"invoices": 0, "purchases": 0, "no_data": 0, "errors": 0}

        inv_qs = (
            Invoice.objects
            .filter(buyer_counterparty__isnull=True, company_profile__isnull=False)
            .exclude(status="draft")
            .select_related("user")
        )
        for inv in inv_qs.iterator():
            if dry:
                stats["invoices"] += 1
                continue
            try:
                cp = counterparty_from_party(
                    inv.company_profile_id, inv.user, inv, "buyer",
                    role="buyer",
                    source="transfer" if inv.scanned_document_id else "israsymas",
                )
            except Exception as e:
                stats["errors"] += 1
                self.stderr.write(f"Invoice {inv.pk}: {e}")
                continue
            if cp is None:
                stats["no_data"] += 1
                continue
            Invoice.objects.filter(pk=inv.pk).update(buyer_counterparty=cp)
            stats["invoices"] += 1

        pur_qs = (
            Purchase.objects
            .filter(seller_counterparty__isnull=True)
            .select_related("user")
        )
        for pur in pur_qs.iterator():
            if dry:
                stats["purchases"] += 1
                continue
            try:
                cp = counterparty_from_party(
                    pur.company_profile_id, pur.user, pur, "seller",
                    role="seller", source="transfer",
                )
            except Exception as e:
                stats["errors"] += 1
                self.stderr.write(f"Purchase {pur.pk}: {e}")
                continue
            if cp is None:
                stats["no_data"] += 1
                continue
            Purchase.objects.filter(pk=pur.pk).update(seller_counterparty=cp)
            stats["purchases"] += 1

        # ── Periodinių sąskaitų šablonai ──
        stats["recurring"] = 0
        for ri in (
            RecurringInvoice.objects
            .filter(buyer_counterparty__isnull=True, company_profile__isnull=False)
            .select_related("user")
            .iterator()
        ):
            if dry:
                stats["recurring"] += 1
                continue
            cp = counterparty_from_party(
                ri.company_profile_id, ri.user, ri, "buyer",
                role="buyer", source="israsymas",
            )
            if cp:
                RecurringInvoice.objects.filter(pk=ri.pk).update(buyer_counterparty=cp)
                stats["recurring"] += 1

        # ── DK eilutės: kontrahentas skolos eilutėms (2410 / 4430) ──
        stats["je_lines"] = 0
        if not dry:
            for je in (
                JournalEntry.objects
                .filter(invoice__isnull=False, invoice__buyer_counterparty__isnull=False)
                .values("id", "invoice__buyer_counterparty_id")
                .iterator()
            ):
                stats["je_lines"] += JournalEntryLine.objects.filter(
                    entry_id=je["id"], account_code="2410", counterparty__isnull=True,
                ).update(counterparty_id=je["invoice__buyer_counterparty_id"])

            for je in (
                JournalEntry.objects
                .filter(purchase__isnull=False, purchase__seller_counterparty__isnull=False)
                .values("id", "purchase__seller_counterparty_id")
                .iterator()
            ):
                stats["je_lines"] += JournalEntryLine.objects.filter(
                    entry_id=je["id"], account_code="4430", counterparty__isnull=True,
                ).update(counterparty_id=je["purchase__seller_counterparty_id"])

        self.stdout.write(self.style.SUCCESS(f"{'DRY RUN ' if dry else ''}{stats}"))