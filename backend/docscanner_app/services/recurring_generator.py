import datetime
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from ..models import (
    RecurringInvoice, RecurringInvoiceRun,
    Invoice, InvoiceLineItem, InvoiceSeries,
)
from ..services.invoice_email_service import send_invoice_email


def generate_invoice_from_recurring(recurring: RecurringInvoice) -> Invoice:
    """
    Создаёт Invoice из шаблона RecurringInvoice.
    Вызывается из Celery task.
    """
    with transaction.atomic():
        # 1. Создаём Run запись
        run = RecurringInvoiceRun.objects.create(
            recurring_invoice=recurring,
            scheduled_for=recurring.next_run_at or timezone.now(),
            status="started",
        )

        try:
            # 2. Определяем даты
            invoice_date = timezone.localdate()
            due_date = None
            if recurring.payment_term_days:
                due_date = invoice_date + datetime.timedelta(
                    days=recurring.payment_term_days
                )

            # 3. Создаём Invoice
            invoice = Invoice.objects.create(
                user=recurring.user,
                invoice_type=recurring.invoice_type,
                document_series=recurring.document_series,
                status="draft",
                invoice_date=invoice_date,
                due_date=due_date,
                currency=recurring.currency,
                pvm_tipas=recurring.pvm_tipas,
                vat_percent=recurring.vat_percent,
                note=recurring.note,
                order_number=recurring.order_number,
                public_link_enabled=recurring.public_link_enabled,
                pirkimas_pardavimas="pardavimas",
                # Seller
                seller_counterparty=recurring.seller_counterparty,
                seller_name=recurring.seller_name,
                seller_id=recurring.seller_id,
                seller_vat_code=recurring.seller_vat_code,
                seller_address=recurring.seller_address,
                seller_country=recurring.seller_country,
                seller_country_iso=recurring.seller_country_iso,
                seller_phone=recurring.seller_phone,
                seller_email=recurring.seller_email,
                seller_bank_name=recurring.seller_bank_name,
                seller_iban=recurring.seller_iban,
                seller_swift=recurring.seller_swift,
                seller_is_person=recurring.seller_is_person,
                seller_extra_info=recurring.seller_extra_info,
                seller_name_normalized=(recurring.seller_name or "").strip().upper(),
                # Buyer
                buyer_counterparty=recurring.buyer_counterparty,
                buyer_name=recurring.buyer_name,
                buyer_id=recurring.buyer_id,
                buyer_vat_code=recurring.buyer_vat_code,
                buyer_address=recurring.buyer_address,
                buyer_country=recurring.buyer_country,
                buyer_country_iso=recurring.buyer_country_iso,
                buyer_phone=recurring.buyer_phone,
                buyer_email=recurring.buyer_email,
                buyer_bank_name=recurring.buyer_bank_name,
                buyer_iban=recurring.buyer_iban,
                buyer_swift=recurring.buyer_swift,
                buyer_is_person=recurring.buyer_is_person,
                buyer_extra_info=recurring.buyer_extra_info,
                buyer_delivery_address=recurring.buyer_delivery_address,
                buyer_name_normalized=(recurring.buyer_name or "").strip().upper(),
                # Подписи
                issued_by=recurring.issued_by,
                received_by=recurring.received_by,
                # Связь
                recurring_invoice=recurring,
            )

            # 4. Line items + подсчёт сумм
            total_wo_vat = Decimal("0")
            total_vat = Decimal("0")

            for li in recurring.line_items.all():
                qty = li.quantity or Decimal("0")
                price = li.price or Decimal("0")
                discount = li.discount_wo_vat or Decimal("0")
                subtotal = qty * price - discount
                vat_pct = li.vat_percent if li.vat_percent is not None else (recurring.vat_percent or Decimal("0"))
                vat_amount = subtotal * vat_pct / Decimal("100")

                InvoiceLineItem.objects.create(
                    invoice=invoice,
                    prekes_pavadinimas=li.prekes_pavadinimas,
                    prekes_kodas=li.prekes_kodas,
                    prekes_barkodas=li.prekes_barkodas,
                    preke_paslauga=li.preke_paslauga,
                    unit=li.unit,
                    quantity=li.quantity,
                    price=li.price,
                    subtotal=subtotal,
                    vat_percent=li.vat_percent,
                    vat=vat_amount,
                    total=subtotal + vat_amount,
                    discount_wo_vat=li.discount_wo_vat,
                    sort_order=li.sort_order,
                )
                total_wo_vat += subtotal
                total_vat += vat_amount

            invoice.amount_wo_vat = total_wo_vat
            invoice.vat_amount = total_vat
            invoice.amount_with_vat = total_wo_vat + total_vat
            invoice.save(update_fields=[
                "amount_wo_vat", "vat_amount", "amount_with_vat",
            ])

            # 5. Auto-issue
            if recurring.auto_issue:
                series_obj = InvoiceSeries.objects.select_for_update().filter(
                    user=recurring.user,
                    prefix=recurring.document_series,
                    invoice_type=recurring.invoice_type,
                    is_active=True,
                ).first()

                if series_obj:
                    prefix, number_str, _ = series_obj.allocate_number()
                    invoice.document_series = prefix
                    invoice.document_number = number_str
                    invoice.status = "issued"
                    invoice.assign_pvm_codes()
                    invoice.save(update_fields=[
                        "document_series", "document_number",
                        "status", "pvm_kodas",
                    ])

            # 6. Auto-send
            if recurring.auto_send and recurring.send_to_email and invoice.status == "issued":
                try:
                    send_invoice_email(invoice.id, "recurring", recipient_email=recurring.send_to_email)
                    invoice.status = "sent"
                    invoice.sent_at = timezone.now()
                    invoice.sent_to_email = recurring.send_to_email
                    invoice.save(update_fields=["status", "sent_at", "sent_to_email"])
                except Exception:
                    pass  # не ломаем генерацию из-за отправки

            # 7. Обновляем recurring
            recurring.last_run_at = timezone.now()
            recurring.last_invoice = invoice
            recurring.generation_count += 1
            recurring.refresh_next_run_at(from_dt=recurring.next_run_at)
            recurring.mark_finished_if_needed()
            recurring.save(update_fields=[
                "last_run_at", "last_invoice", "generation_count",
                "next_run_at", "status", "updated_at",
            ])

            # 8. Успех
            run.status = "success"
            run.invoice = invoice
            run.save(update_fields=["status", "invoice"])

            return invoice

        except Exception as e:
            run.status = "failed"
            run.error_text = str(e)[:2000]
            run.save(update_fields=["status", "error_text"])
            raise