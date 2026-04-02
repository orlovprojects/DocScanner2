"""
invoicing/services/payment_link_render.py
=========================================
Payment link rendering for PDF (ReportLab), email (HTML), and React preview.
"""

from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import mm
from reportlab.platypus import Flowable

from django.conf import settings


# ════════════════════════════════════════════════════════════
# PDF — ReportLab Flowable button for header
# ════════════════════════════════════════════════════════════

class PaymentButton(Flowable):
    """
    Clickable "Apmokėti sąskaitą" button as a ReportLab Flowable.
    Fits into the header table — left of dates, same row as logo.

    Usage in _build_header:
        from ..services.payment_link_render import PaymentButton

        if inv.payment_link_url:
            btn = PaymentButton(
                url=inv.payment_link_url,
                amount=inv.amount_with_vat,
                currency=inv.currency or "EUR",
            )
    """

    def __init__(self, url, amount, currency, width=36 * mm, height=11 * mm):
        super().__init__()
        self.url = url
        self.amount = amount
        self.currency = currency
        self.width = width
        self.height = height

    def wrap(self, availWidth, availHeight):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        from ..utils.invoice_pdf import _fmt, _sym

        # ── Blue rounded rect ──
        c.setFillColor(HexColor("#1976d2"))
        c.roundRect(0, 0, self.width, self.height, 2.2 * mm, fill=1, stroke=0)

        # ── "Apmokėti sąskaitą" ──
        c.setFillColor(white)
        c.setFont("InvFontBold", 8.5)
        c.drawCentredString(
            self.width / 2,
            self.height - 4.5 * mm,
            "Apmokėti sąskaitą",
        )

        # ── Amount ──
        c.setFillColor(HexColor("#ffffffcc"))
        c.setFont("InvFont", 7.5)
        sym = _sym(self.currency)
        c.drawCentredString(
            self.width / 2,
            2 * mm,
            f"{_fmt(self.amount)} {sym}",
        )

        # ── Clickable PDF link annotation ──
        c.linkURL(
            self.url,
            (0, 0, self.width, self.height),
            relative=1,
        )


# ════════════════════════════════════════════════════════════
# Email — HTML button
# ════════════════════════════════════════════════════════════

def render_payment_button_html(invoice, payment_url: str = "") -> str:
    """
    Returns HTML block with "Peržiūrėti ir apmokėti" button for email body.
    Links to the PUBLIC invoice page (not directly to payment provider).

    The public page shows invoice details + payment button.

    Usage:
        if invoice.payment_link_url:
            body_html += render_payment_button_html(invoice)
    """
    # Build public invoice URL
    from .invoice_email_service import _frontend_invoice_url
    public_url = _frontend_invoice_url(invoice)

    amount = invoice.amount_with_vat
    currency = getattr(invoice, "currency", "EUR") or "EUR"

    amount_line = ""
    if amount is not None:
        from ..utils.invoice_pdf import _fmt, _sym
        sym = _sym(currency)
        amount_line = f"""
            <span style="display: block; font-size: 13px; font-weight: 400;
                         opacity: 0.85; margin-top: 2px;">
                {_fmt(amount)} {sym}
            </span>"""

    return f"""
    <div style="text-align: center; margin: 28px 0 8px;">
        <p style="color: #666; font-size: 14px; margin: 0 0 16px;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            S&#261;skait&#261; galite per&#382;i&#363;r&#279;ti ir apmok&#279;ti paspaud&#281; mygtuk&#261; &#382;emiau.
        </p>
        <a href="{public_url}"
           target="_blank"
           style="background-color: #1976d2;
                  color: #ffffff;
                  text-decoration: none;
                  padding: 14px 36px;
                  border-radius: 6px;
                  font-size: 16px;
                  font-weight: 600;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: inline-block;
                  ">
            Per&#382;i&#363;r&#279;ti ir apmok&#279;ti s&#261;skait&#261;{amount_line}
        </a>
    </div>
    """