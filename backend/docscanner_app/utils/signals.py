from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from ..models import Purchase, Invoice, JournalEntry
from .journal_generators import (
    generate_purchase_journal_entry,
    generate_invoice_journal_entry,
)


@receiver(post_save, sender=Purchase)
def _regenerate_purchase_journal(sender, instance, created, **kwargs):
    """При каждом сохранении Purchase — перегенерируем DK įrašą."""
    generate_purchase_journal_entry(instance)


@receiver(post_delete, sender=Purchase)
def _delete_purchase_journal(sender, instance, **kwargs):
    """При удалении Purchase — удаляем связанный DK įrašą."""
    JournalEntry.objects.filter(
        purchase=instance,
        source_type=JournalEntry.SOURCE_PURCHASE,
    ).delete()


@receiver(post_save, sender=Invoice)
def _regenerate_invoice_journal(sender, instance, created, **kwargs):
    generate_invoice_journal_entry(instance)


@receiver(post_delete, sender=Invoice)
def _delete_invoice_journal(sender, instance, **kwargs):
    JournalEntry.objects.filter(
        invoice=instance,
        source_type=JournalEntry.SOURCE_SALE,
    ).delete()