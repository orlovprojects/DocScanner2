"""
invoicing/services/auto_sf.py
==============================
Auto-creation of SF/PVM SF from išankstinė on payment.
"""

from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
import logging

logger = logging.getLogger("docscanner_app")


def create_sf_from_isankstine(source, user, series_prefix=None):
    """
    Create SF/PVM SF from išankstinė.
    Called from:
    - invoice_create_pvm_sf (manual)
    - maybe_auto_create_sf (auto on payment)

    Returns new Invoice or None.
    """
    from ..models import (
        Invoice, InvoiceLineItem, InvoiceSeries,
        InvoiceSettings, PaymentAllocation,
    )

    # Check — SF not already created
    if source.derived_invoices.filter(
        invoice_type__in=["pvm_saskaita", "saskaita"]
    ).exists():
        return None

    target_type = "saskaita" if source.pvm_tipas == "netaikoma" else "pvm_saskaita"

    skip_fields = {
        "id", "uuid", "status", "invoice_type", "document_series",
        "document_number", "source_invoice_id", "pdf_file",
        "sent_at", "sent_to_email", "paid_at", "cancelled_at",
        "optimum_api_status", "optimum_last_try_date",
        "dineta_api_status", "dineta_last_try_date",
        "auto_create_sf_on_paid", "auto_sf_series", "auto_sf_send",
        "send_payment_reminders",
        "recurring_invoice_id",
        "created_at", "updated_at",
    }

    new_data = {}
    for field in Invoice._meta.get_fields():
        if not hasattr(field, "attname"):
            continue
        name = field.attname
        if name in skip_fields:
            continue
        new_data[name] = getattr(source, name)

    new_data["invoice_type"] = target_type
    new_data["source_invoice_id"] = source.pk
    new_data["invoice_date"] = timezone.now().date()
    new_data["status"] = source.status
    if source.paid_at:
        new_data["paid_at"] = source.paid_at
    if source.sent_at:
        new_data["sent_at"] = source.sent_at

    with transaction.atomic():
        # ── Series ──────────────────────────────────────────
        series_obj = None
        if series_prefix:
            series_obj = InvoiceSeries.objects.select_for_update().filter(
                user=user, prefix=series_prefix,
                invoice_type=target_type, is_active=True,
            ).first()

        if not series_obj:
            series_obj = InvoiceSeries.objects.select_for_update().filter(
                user=user, invoice_type=target_type,
                is_active=True, is_default=True,
            ).first()

        if not series_obj:
            series_obj = InvoiceSeries.objects.select_for_update().filter(
                user=user, invoice_type=target_type, is_active=True,
            ).first()

        if not series_obj:
            raise ValueError(f"Nėra sukurtos serijos tipui '{target_type}'.")

        prefix, number_str, _ = series_obj.allocate_number()
        new_data["document_series"] = prefix
        new_data["document_number"] = number_str

        # ── Due date ────────────────────────────────────────
        try:
            settings_obj = InvoiceSettings.objects.get(user=user)
            if settings_obj.default_payment_days:
                new_data["due_date"] = new_data["invoice_date"] + timedelta(
                    days=settings_obj.default_payment_days
                )
        except InvoiceSettings.DoesNotExist:
            pass

        # ── Create invoice ──────────────────────────────────
        new_invoice = Invoice.objects.create(**new_data)

        # ── Line items ──────────────────────────────────────
        for li in source.line_items.order_by("sort_order", "id"):
            li_data = {}
            for field in InvoiceLineItem._meta.get_fields():
                if not hasattr(field, "attname"):
                    continue
                if field.attname in ("id", "invoice_id"):
                    continue
                li_data[field.attname] = getattr(li, field.attname)
            InvoiceLineItem.objects.create(invoice=new_invoice, **li_data)

        # ── PVM codes ───────────────────────────────────────
        new_invoice.assign_pvm_codes()
        new_invoice.save(update_fields=["pvm_kodas"])

        # ── Payment allocation from source išankstinė ───────
        if source.status == "paid" or source.paid_at:
            source_allocations = source.payment_allocations.filter(
                status__in=["confirmed", "auto", "manual"],
            )

            if source_allocations.exists():
                for src_alloc in source_allocations:
                    PaymentAllocation.objects.create(
                        incoming_transaction=src_alloc.incoming_transaction,
                        invoice=new_invoice,
                        source=src_alloc.source,
                        status=src_alloc.status,
                        amount=src_alloc.amount,
                        payment_date=src_alloc.effective_payment_date,
                        confidence=Decimal("1.00"),
                        match_reasons={
                            "Apmokėta pagal išankstinę sąskaitą": source.full_number,
                            **src_alloc.match_reasons,
                        },
                        confirmed_at=src_alloc.confirmed_at or timezone.now(),
                        confirmed_by=src_alloc.confirmed_by,
                    )
            else:
                paid_amount = new_invoice.amount_with_vat or Decimal("0")
                PaymentAllocation.objects.create(
                    incoming_transaction=None,
                    invoice=new_invoice,
                    source="manual",
                    status="auto",
                    amount=paid_amount,
                    payment_date=source.paid_at or timezone.now().date(),
                    confidence=Decimal("1.00"),
                    match_reasons={
                        "Apmokėta pagal išankstinę sąskaitą": source.full_number,
                    },
                    confirmed_at=timezone.now(),
                )

        new_invoice.recalc_payment_status()

    logger.info(
        "[AutoSF] Created %s %s from išankstinė %s (allocations: %d)",
        target_type, new_invoice.full_number, source.full_number,
        new_invoice.payment_allocations.count(),
    )

    return new_invoice


def maybe_auto_create_sf(invoice):
    """
    Called on any payment event for išankstinė.
    Checks auto_create_sf_on_paid and creates + sends SF.
    """
    if invoice.invoice_type != "isankstine":
        return None
    if not invoice.auto_create_sf_on_paid:
        return None

    try:
        sf = create_sf_from_isankstine(
            source=invoice,
            user=invoice.user,
            series_prefix=invoice.auto_sf_series or None,
        )
    except ValueError as e:
        logger.error("[AutoSF] Creation failed for invoice %s: %s", invoice.id, e)
        return None

    if not sf:
        return None

    logger.info(
        "[AutoSF] sf=%s, auto_sf_send=%s, sf.status=%s, buyer_email=%s",
        sf.full_number, invoice.auto_sf_send,
        sf.status, invoice.buyer_email or invoice.sent_to_email,
    )

    # Auto-send
    if invoice.auto_sf_send and sf.status in ("issued", "sent", "paid"):
        send_email = invoice.buyer_email or invoice.sent_to_email
        if send_email:
            # --- Inv subscription: email limit check ---
            from ..views import check_inv_email_limit, record_inv_email
            allowed, err = check_inv_email_limit(invoice.user, sf.id)
            if not allowed:
                logger.warning(
                    "[AutoSF] Email blocked by inv limit for %s: %s",
                    sf.full_number, err.get("message", ""),
                )
            else:
                try:
                    from ..services.invoice_email_service import send_invoice_email
                    result = send_invoice_email(
                        invoice_id=sf.id,
                        email_type="invoice_paid",
                        recipient_email=send_email,
                    )
                    if result and result.status == "sent":
                        logger.info("[AutoSF] Sent %s to %s", sf.full_number, send_email)
                        try:
                            record_inv_email(invoice.user, sf.id)
                        except Exception as e:
                            logger.warning("[AutoSF] Failed to record inv email usage: %s", e)
                    else:
                        logger.warning("[AutoSF] Send returned non-sent status for %s", sf.id)
                except Exception as e:
                    logger.error("[AutoSF] Send failed for %s: %s", sf.id, e)