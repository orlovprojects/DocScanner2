"""
docscanner_app/services/invoice_email_service.py

Сервис отправки email для счетов через Mailgun API.

Поддерживаемые типы писем:
  - invoice          : отправка нового счёта
  - invoice_paid     : PVM SF / SF после оплаченной išankstinė
  - invoice_info     : информационная отправка PDF счёта
  - reminder_before  : напоминание до срока оплаты
  - reminder_overdue : напоминание после срока оплаты
  - manual_reminder  : ручное напоминание
  - cancelled        : уведомление об отмене счёта
"""

import logging
from decimal import Decimal

import requests
from django.conf import settings
from django.db import models
from django.utils import timezone

from ..models import Invoice, InvoiceEmail
from ..utils.invoice_i18n import get_lang, tr, doc_title, doc_title_acc

logger = logging.getLogger("docscanner_app")


# ════════════════════════════════════════════════════════════
#  Mailgun transport
# ════════════════════════════════════════════════════════════

def _mailgun_send(*, to, subject, html, reply_to=None, pdf_bytes=None, pdf_filename=None):
    """
    Отправка одного письма через Mailgun API.
    Возвращает (success: bool, mailgun_message_id: str, error: str).
    """
    api_url = getattr(settings, "MAILGUN_INVOICE_API_URL", "https://api.eu.mailgun.net/v3")
    domain = getattr(settings, "MAILGUN_INVOICE_DOMAIN", "m.saskaituisrasymas.lt")
    api_key = getattr(settings, "MAILGUN_INVOICE_API_KEY", "")
    from_name = getattr(settings, "MAILGUN_INVOICE_FROM_NAME", "DokSkenas")
    from_email = getattr(settings, "MAILGUN_INVOICE_FROM_EMAIL", f"noreply@{domain}")

    if not api_key:
        logger.error("MAILGUN_INVOICE_API_KEY is not configured")
        return False, "", "API key not configured"

    data = {
        "from": f"{from_name} <{from_email}>",
        "to": to,
        "subject": subject,
        "html": html,
        "o:tracking-opens": "yes",
        "o:tracking-clicks": "yes",
    }

    if reply_to:
        data["h:Reply-To"] = reply_to

    files = None
    if pdf_bytes and pdf_filename:
        files = [("attachment", (pdf_filename, pdf_bytes, "application/pdf"))]

    try:
        resp = requests.post(
            f"{api_url}/{domain}/messages",
            auth=("api", api_key),
            data=data,
            files=files,
            timeout=30,
        )

        if resp.status_code == 200:
            result = resp.json()
            msg_id = result.get("id", "").strip("<>")
            logger.info(f"Mailgun sent to {to}: {msg_id}")
            return True, msg_id, ""

        error = f"Mailgun {resp.status_code}: {resp.text[:500]}"
        logger.error(error)
        return False, "", error

    except requests.RequestException as e:
        error = f"Mailgun request failed: {str(e)[:500]}"
        logger.error(error)
        return False, "", error


# ════════════════════════════════════════════════════════════
#  PDF helper
# ════════════════════════════════════════════════════════════

def _get_invoice_pdf(invoice):
    """
    Возвращает (pdf_bytes, filename) для вложения в email.
    Генерирует PDF в памяти, не сохраняет на диск.
    """
    from ..utils.invoice_pdf import generate_invoice_pdf, get_invoice_logo_path

    # Логотип
    logo_path = get_invoice_logo_path(invoice)

    # Watermark для free
    watermark = False
    try:
        from ..inv_plan import inv_sub_for_invoice
        sub = inv_sub_for_invoice(invoice)
        if sub:
            sub.check_and_expire()
            watermark = sub.status == "free"
    except Exception:
        pass

    try:
        pdf_bytes = generate_invoice_pdf(invoice, logo_path=logo_path, watermark=watermark)
        prefix = tr(get_lang(invoice), "file_prefix")
        filename = f"{prefix}-{invoice.document_series}{invoice.document_number}.pdf"
        return pdf_bytes, filename
    except Exception:
        return None, None


# ════════════════════════════════════════════════════════════
#  Formatting helpers
# ════════════════════════════════════════════════════════════

_CURRENCY_SYMBOLS = {
    "EUR": "€", "USD": "$", "GBP": "£", "PLN": "zł", "CZK": "Kč",
    "SEK": "kr", "NOK": "kr", "DKK": "kr", "CHF": "CHF", "UAH": "₴",
    "RUB": "₽", "JPY": "¥", "CNY": "¥",
}


def _fmt_amount(value, currency="EUR"):
    """12345.67 -> '12 345,67 €'"""
    sym = _CURRENCY_SYMBOLS.get(currency, currency)
    if value is None:
        return f"0,00 {sym}"

    v = Decimal(str(value)).quantize(Decimal("0.01"))
    sign = "-" if v < 0 else ""
    v = abs(v)

    integer_part = int(v)
    decimal_part = str(v).split(".")[1] if "." in str(v) else "00"
    int_str = f"{integer_part:,}".replace(",", " ")
    return f"{sign}{int_str},{decimal_part} {sym}"


def _fmt_date(d):
    if not d:
        return ""
    return d.strftime("%Y-%m-%d")


def _invoice_no(invoice):
    return f"{invoice.document_series}-{invoice.document_number}"


def _seller(invoice):
    return invoice.seller_name or "DokSkenas"


def _frontend_invoice_url(invoice):
    base = getattr(settings, "INVOICE_PUBLIC_URL", "https://saskaituisrasymas.lt").rstrip("/")
    return f"{base}/sf/{invoice.uuid}"


# ════════════════════════════════════════════════════════════
#  HTML email templates
# ════════════════════════════════════════════════════════════

_BASE_STYLE = """
    body {
        margin: 0;
        padding: 0;
        background: #f5f7fa;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: #1f2937;
    }
    .outer {
        padding: 24px 12px;
    }
    .wrapper {
        max-width: 600px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        overflow: hidden;
    }
    .content {
        padding: 32px 28px 24px;
    }
    .title {
        margin: 0 0 20px;
        font-size: 20px;
        line-height: 1.3;
        font-weight: 600;
        color: #111827;
    }
    .text {
        margin: 0 0 14px;
        font-size: 15px;
        line-height: 1.6;
        color: #374151;
    }
    .meta {
        margin: 20px 0;
        padding: 16px 18px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
    }
    .meta-row {
        margin: 0 0 10px;
        font-size: 15px;
        line-height: 1.5;
        color: #111827;
    }
    .meta-row:last-child {
        margin-bottom: 0;
    }
    .label {
        color: #6b7280;
    }
    .button-wrap {
        margin: 20px 0 0;
    }
    .button {
        display: inline-block;
        padding: 12px 20px;
        background: #2563eb;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
    }
    .note {
        margin: 0 0 16px;
        font-size: 14px;
        line-height: 1.6;
        color: #4b5563;
    }
    .footer {
        padding: 18px 28px 24px;
        border-top: 1px solid #e5e7eb;
        font-size: 12px;
        line-height: 1.6;
        color: #6b7280;
        background: #ffffff;
    }
    .footer p {
        margin: 0 0 8px;
    }
    .footer p:last-child {
        margin-bottom: 0;
    }
    .status {
        display: inline-block;
        margin: 0 0 18px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
    }
    .status-paid {
        background: #ecfdf3;
        color: #027a48;
    }
    .status-overdue {
        background: #fef3f2;
        color: #b42318;
    }
    .status-cancelled {
        background: #f3f4f6;
        color: #374151;
    }
"""


def _wrap_html(body_content, title="", lang="lt"):
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>{_BASE_STYLE}</style>
</head>
<body>
    <div class="outer">
        <div class="wrapper">
            {body_content}
        </div>
    </div>
</body>
</html>"""


def _render_meta_block(lines):
    rows = []
    for label, value in lines:
        if value:
            rows.append(f'<p class="meta-row"><span class="label">{label}:</span> {value}</p>')
    return f'<div class="meta">{"".join(rows)}</div>'


def _render_footer(invoice, lang):
    seller_name = invoice.seller_name or tr(lang, "seller_fallback")

    contact_parts = []
    if invoice.seller_email:
        contact_parts.append(tr(lang, "contact_email", v=invoice.seller_email))
    if invoice.seller_phone:
        contact_parts.append(tr(lang, "contact_phone", v=invoice.seller_phone))

    contact_line = tr(lang, "footer_contact", seller=seller_name)
    if contact_parts:
        contact_line += " " + tr(lang, "contact_or").join(contact_parts)
    contact_line += "."

    return f"""
    <div class="footer">
        <p>{tr(lang, "footer_auto")}</p>
        <p>{contact_line}</p>
    </div>
    """


def _render_view_button(invoice, lang, text=None):
    url = _frontend_invoice_url(invoice)
    label = text or tr(lang, "view_button")
    return f"""
    <div class="button-wrap">
        <a href="{url}" target="_blank" class="button">{label}</a>
    </div>
    """


def _render_payment_button(invoice, lang):
    if not invoice.payment_link_url:
        return _render_view_button(invoice, lang, tr(lang, "view_pay_button"))

    from .payment_link_render import render_payment_button_html

    return render_payment_button_html(invoice)


def _amount_meta(invoice, lang, due_key="due"):
    return [
        (tr(lang, "amount"), _fmt_amount(invoice.amount_with_vat, invoice.currency or "EUR")),
        (tr(lang, due_key), _fmt_date(invoice.due_date)),
    ]


# ────────────────────────────────────────────────
#  1. invoice
# ────────────────────────────────────────────────

def _render_invoice_sent(invoice):
    lang = get_lang(invoice)
    no, seller = _invoice_no(invoice), _seller(invoice)

    subject = tr(lang, "invoice_subject", no=no, seller=seller)

    body = f"""
    <div class="content">
        <h1 class="title">{doc_title(lang, invoice.invoice_type)}</h1>

        <p class="text">{tr(lang, "hello")}</p>
        <p class="text">{tr(lang, "invoice_text", no=no, seller=seller)}</p>

        {_render_meta_block(_amount_meta(invoice, lang))}
        {_render_payment_button(invoice, lang)}
    </div>
    {_render_footer(invoice, lang)}
    """

    return subject, _wrap_html(body, title=subject, lang=lang)


# ────────────────────────────────────────────────
#  2. invoice_paid
# ────────────────────────────────────────────────

def _render_invoice_paid(invoice):
    lang = get_lang(invoice)
    no, seller = _invoice_no(invoice), _seller(invoice)
    doc_label = doc_title(lang, "pvm_saskaita" if invoice.invoice_type == "pvm_saskaita" else "saskaita")

    subject = f"{doc_label} {no}"

    body = f"""
    <div class="content">
        <h1 class="title">{doc_label}</h1>

        <span class="status status-paid">{tr(lang, "paid_status")}</span>

        <p class="text">{tr(lang, "hello")}</p>
        <p class="text">
            {tr(lang, "paid_text", doc=doc_title_acc(lang, invoice.invoice_type), no=no, seller=seller)}
        </p>

        <p class="note">{tr(lang, "pdf_attached")}</p>
        <p class="note">{tr(lang, "no_more_payment")}</p>
    </div>
    {_render_footer(invoice, lang)}
    """

    return subject, _wrap_html(body, title=subject, lang=lang)


# ────────────────────────────────────────────────
#  3. invoice_info
# ────────────────────────────────────────────────

def _render_invoice_info(invoice):
    lang = get_lang(invoice)
    no, seller = _invoice_no(invoice), _seller(invoice)
    doc_label = doc_title(lang, invoice.invoice_type)

    subject = f"{doc_label} {no}"

    body = f"""
    <div class="content">
        <h1 class="title">{doc_label}</h1>

        <p class="text">{tr(lang, "hello")}</p>
        <p class="text">{tr(lang, "info_text", doc=doc_title_acc(lang, invoice.invoice_type), no=no, seller=seller)}</p>

        <p class="note">{tr(lang, "pdf_attached")}</p>
        {_render_view_button(invoice, lang)}
    </div>
    {_render_footer(invoice, lang)}
    """

    return subject, _wrap_html(body, title=subject, lang=lang)


# ────────────────────────────────────────────────
#  4. reminder_before
# ────────────────────────────────────────────────

def _render_reminder_before(invoice, days_until_due):
    lang = get_lang(invoice)
    no, seller = _invoice_no(invoice), _seller(invoice)

    if days_until_due == 0:
        subject = tr(lang, "reminder_last_subject", no=no)
        first_text = tr(lang, "reminder_last_text", no=no, seller=seller)
        second_text = tr(lang, "reminder_last_text2")
    else:
        subject = tr(lang, "reminder_subject", no=no)
        first_text = tr(lang, "reminder_text", no=no, seller=seller)
        second_text = None

    second_paragraph = f'<p class="note">{second_text}</p>' if second_text else ""

    body = f"""
    <div class="content">
        <h1 class="title">{tr(lang, "reminder_title")}</h1>

        <p class="text">{tr(lang, "hello")}</p>
        <p class="text">{first_text}</p>

        {_render_meta_block(_amount_meta(invoice, lang))}
        {second_paragraph}
        <p class="note">{tr(lang, "view_and_pay_text")}</p>
        {_render_payment_button(invoice, lang)}
    </div>
    {_render_footer(invoice, lang)}
    """

    return subject, _wrap_html(body, title=subject, lang=lang)


# ────────────────────────────────────────────────
#  5. reminder_overdue
# ────────────────────────────────────────────────

def _render_reminder_overdue(invoice, days_overdue):
    lang = get_lang(invoice)
    no, seller = _invoice_no(invoice), _seller(invoice)

    subject = tr(lang, "overdue_subject", no=no)

    body = f"""
    <div class="content">
        <h1 class="title">{tr(lang, "overdue_title")}</h1>

        <span class="status status-overdue">{tr(lang, "overdue_status")}</span>

        <p class="text">{tr(lang, "hello")}</p>
        <p class="text">{tr(lang, "overdue_text", no=no, seller=seller)}</p>

        {_render_meta_block(_amount_meta(invoice, lang, "due_term"))}
        <p class="note">{tr(lang, "pay_asap")}</p>
        <p class="note">{tr(lang, "view_and_pay_text")}</p>
        {_render_payment_button(invoice, lang)}
    </div>
    {_render_footer(invoice, lang)}
    """

    return subject, _wrap_html(body, title=subject, lang=lang)


# ────────────────────────────────────────────────
#  6. manual_reminder
# ────────────────────────────────────────────────

def _render_manual_reminder(invoice):
    lang = get_lang(invoice)
    no, seller = _invoice_no(invoice), _seller(invoice)

    subject = tr(lang, "overdue_subject", no=no)

    body = f"""
    <div class="content">
        <h1 class="title">{tr(lang, "reminder_title")}</h1>

        <span class="status status-overdue">{tr(lang, "manual_status")}</span>

        <p class="text">{tr(lang, "hello")}</p>
        <p class="text">{tr(lang, "manual_text", no=no, seller=seller)}</p>

        {_render_meta_block(_amount_meta(invoice, lang, "due_term"))}
        <p class="note">{tr(lang, "pay_asap")}</p>
        <p class="note">{tr(lang, "view_and_pay_text")}</p>
        {_render_payment_button(invoice, lang)}
    </div>
    {_render_footer(invoice, lang)}
    """

    return subject, _wrap_html(body, title=subject, lang=lang)


# ────────────────────────────────────────────────
#  7. cancelled
# ────────────────────────────────────────────────

def _render_cancelled(invoice):
    lang = get_lang(invoice)
    no, seller = _invoice_no(invoice), _seller(invoice)

    subject = tr(lang, "cancelled_subject", no=no)

    body = f"""
    <div class="content">
        <h1 class="title">{tr(lang, "cancelled_title")}</h1>

        <span class="status status-cancelled">{tr(lang, "cancelled_status")}</span>

        <p class="text">{tr(lang, "hello")}</p>
        <p class="text">{tr(lang, "cancelled_text", no=no, seller=seller)}</p>

        <p class="note">{tr(lang, "cancelled_note")}</p>
    </div>
    {_render_footer(invoice, lang)}
    """

    return subject, _wrap_html(body, title=subject, lang=lang)


# ════════════════════════════════════════════════════════════
#  Template router
# ════════════════════════════════════════════════════════════

_TEMPLATE_RENDERERS = {
    "invoice": _render_invoice_sent,
    "invoice_paid": _render_invoice_paid,
    "invoice_info": _render_invoice_info,
    "reminder_before": _render_reminder_before,
    "reminder_overdue": _render_reminder_overdue,
    "manual_reminder": _render_manual_reminder,
    "cancelled": _render_cancelled,
}


# ════════════════════════════════════════════════════════════
#  Main send function
# ════════════════════════════════════════════════════════════

def send_invoice_email(
    invoice_id,
    email_type,
    recipient_email=None,
    reminder_day=None,
    days_context=None,
    skip_counter=False,
):
    try:
        invoice = Invoice.objects.select_related("user").get(id=invoice_id)
    except Invoice.DoesNotExist:
        logger.error(f"Invoice {invoice_id} not found")
        return None

    # --- Inv subscription: email limit check ---
    from ..views import check_inv_email_limit
    allowed, err = check_inv_email_limit(invoice.user, invoice.id)
    if not allowed:
        logger.warning(
            f"Invoice {invoice_id}: email blocked by inv subscription limit: {err}"
        )
        return err  # вызывающий код проверит что вернулся dict а не InvoiceEmail

    to_email = recipient_email or invoice.buyer_email or invoice.sent_to_email

    to_email = recipient_email or invoice.buyer_email or invoice.sent_to_email
    if not to_email:
        logger.warning(f"Invoice {invoice_id}: no recipient email")
        return None

    if reminder_day is not None:
        already_sent = InvoiceEmail.objects.filter(
            invoice=invoice,
            reminder_day=reminder_day,
            status="sent",
        ).exists()
        if already_sent:
            logger.info(f"Invoice {invoice_id}: reminder_day={reminder_day} already sent, skipping")
            return None

    renderer = _TEMPLATE_RENDERERS.get(email_type)
    if not renderer:
        logger.error(f"Unknown email_type: {email_type}")
        return None

    if email_type == "reminder_before":
        subject, html = renderer(invoice, days_until_due=days_context or 0)
    elif email_type == "reminder_overdue":
        subject, html = renderer(invoice, days_overdue=days_context or 0)
    else:
        subject, html = renderer(invoice)

    pdf_bytes, pdf_filename = None, None
    if email_type in ("invoice_paid", "invoice_info"):
        pdf_bytes, pdf_filename = _get_invoice_pdf(invoice)

    reply_to = invoice.seller_email or None

    email_log = InvoiceEmail.objects.create(
        invoice=invoice,
        email_type=email_type,
        to_email=to_email,
        subject=subject,
        status="pending",
        reminder_day=reminder_day,
    )

    success, msg_id, error = _mailgun_send(
        to=to_email,
        subject=subject,
        html=html,
        reply_to=reply_to,
        pdf_bytes=pdf_bytes,
        pdf_filename=pdf_filename,
    )

    if success:
        email_log.status = "sent"
        email_log.mailgun_message_id = msg_id
        email_log.save(update_fields=["status", "mailgun_message_id"])

        if not skip_counter:
            Invoice.objects.filter(id=invoice.id).update(
                email_sent_count=models.F("email_sent_count") + 1,
                email_last_status="sent",
            )

        # --- Record inv email usage ---
        try:
            from ..inv_plan import inv_sub_for_invoice, inv_usage
            sub = inv_sub_for_invoice(invoice)
            if sub and sub.status == "free":
                usage = inv_usage(invoice.user, invoice.company_profile_id)
                usage.record_email(invoice.id)
        except Exception as e:
            logger.warning(f"Failed to record inv email usage: {e}")

        if email_type in ("invoice", "auto_sf") and not invoice.sent_at:
            Invoice.objects.filter(id=invoice.id).update(
                sent_at=timezone.now(),
                sent_to_email=to_email,
                status="sent" if invoice.status == "issued" else invoice.status,
            )
    else:
        email_log.status = "failed"
        email_log.error_text = error
        email_log.save(update_fields=["status", "error_text"])

        if skip_counter:
            Invoice.objects.filter(id=invoice.id).update(
                email_last_status="failed",
                email_sent_count=models.F("email_sent_count") - 1,
            )
        else:
            if invoice.email_sent_count == 0:
                Invoice.objects.filter(id=invoice.id).update(
                    email_last_status="failed",
                )

        logger.error(f"Failed to send {email_type} for invoice {invoice_id}: {error}")

    return email_log