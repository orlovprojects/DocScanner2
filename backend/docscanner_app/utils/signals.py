from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from ..models import Purchase, Invoice, JournalEntry
from .journal_generators import (
    sync_purchase_journal_entry,
    sync_invoice_journal_entry,
)


# Laukai, kurių pakeitimas DK įrašo nekeičia (mokėjimai, siuntimas, eksportas).
_INVOICE_NON_DK_FIELDS = {
    "status", "paid_amount", "last_payment_date", "paid_at",
    "sent_at", "sent_to_email", "pdf_file",
    "email_sent_count", "email_last_status",
    "exported", "exported_at",
    "optimum_api_status", "optimum_last_try_date",
    "dineta_api_status", "dineta_last_try_date",
    "site_pro_api_status", "site_pro_last_try_date",
    "rivile_api_status", "rivile_api_last_try", "rivile_api_kodas_po",
    "payment_link_url", "payment_link_provider",
    "payment_link_provider_id", "payment_link_created_at",
    "public_link_enabled", "updated_at",
}

_PURCHASE_NON_DK_FIELDS = {
    "payment_status", "paid_amount", "last_payment_date",
    "exported", "exported_at", "updated_at",
}


@receiver(post_save, sender=Purchase)
def _regenerate_purchase_journal(sender, instance, created, update_fields=None, **kwargs):
    """Perkuriame DK tik kai pasikeitė apskaitai svarbūs laukai."""
    if update_fields and set(update_fields) <= _PURCHASE_NON_DK_FIELDS:
        return
    sync_purchase_journal_entry(instance)


@receiver(post_delete, sender=Purchase)
def _delete_purchase_journal(sender, instance, **kwargs):
    """При удалении Purchase — удаляем связанный DK įrašą."""
    JournalEntry.objects.filter(
        purchase=instance,
        source_type=JournalEntry.SOURCE_PURCHASE,
    ).delete()


@receiver(post_save, sender=Invoice)
def _regenerate_invoice_journal(sender, instance, created, update_fields=None, **kwargs):
    """
    Perkuriame DK tik kai pasikeitė apskaitai svarbūs laukai.
    Statuso keitimas į sent/partially_paid/paid DK nekeičia —
    draft/issued/cancelled perduodami sync, jis pats nuspręs.
    """
    if update_fields and set(update_fields) <= _INVOICE_NON_DK_FIELDS:
        if "status" not in update_fields or instance.status in ("sent", "partially_paid", "paid"):
            return
    sync_invoice_journal_entry(instance)


@receiver(post_delete, sender=Invoice)
def _delete_invoice_journal(sender, instance, **kwargs):
    JournalEntry.objects.filter(
        invoice=instance,
        source_type=JournalEntry.SOURCE_SALE,
    ).delete()