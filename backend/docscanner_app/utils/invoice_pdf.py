"""
DokSkenas — Sąskaitų išrašymas
PDF generation via ReportLab — design matches InvoiceA4 React preview.
"""

import io
import os
import platform
from decimal import Decimal
import logging

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import registerFontFamily


from django.core.files.base import ContentFile

logger = logging.getLogger("docscanner_app")

# ════════════════════════════════════════════════════════════
# Fonts
# ════════════════════════════════════════════════════════════

_FONTS_REGISTERED = False


def _register_fonts():
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return

    candidates = [
        # Roboto 
        (
            "/usr/share/fonts/truetype/roboto/hinted/Roboto-Regular.ttf",
            "/usr/share/fonts/truetype/roboto/hinted/Roboto-Bold.ttf",
        ),
        # DejaVu (fallback)
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ),
    ]

    if platform.system() == "Windows":
        win_fonts = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
        candidates = [
            (
                os.path.join(win_fonts, "DejaVuSans.ttf"),
                os.path.join(win_fonts, "DejaVuSans-Bold.ttf"),
            ),
            (
                os.path.join(win_fonts, "arial.ttf"),
                os.path.join(win_fonts, "arialbd.ttf"),
            ),
        ]

    for regular, bold in candidates:
        if os.path.exists(regular):
            pdfmetrics.registerFont(TTFont("InvFont", regular))
            pdfmetrics.registerFont(
                TTFont("InvFontBold", bold if os.path.exists(bold) else regular)
            )
            registerFontFamily("InvFont", normal="InvFont", bold="InvFontBold")
            _FONTS_REGISTERED = True
            return

    raise RuntimeError(
        "Linux: apt-get install fonts-dejavu-core"
    )


# ════════════════════════════════════════════════════════════
# Colors
# ════════════════════════════════════════════════════════════

C_TEXT = colors.HexColor("#222222")
C_TEXT_LIGHT = colors.HexColor("#555555")
C_LABEL = colors.HexColor("#888888")
C_BORDER = colors.HexColor("#e0e0e0")
C_ROW_ALT = colors.HexColor("#fafafa")
C_HEADER_BG = colors.HexColor("#f5f5f5")
C_DIVIDER = colors.HexColor("#333333")
C_FOOTER = colors.HexColor("#aaaaaa")

PAGE_W, PAGE_H = A4
MARGIN_H = 18 * mm
MARGIN_V = 16 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_H


# ════════════════════════════════════════════════════════════
# Styles
# ════════════════════════════════════════════════════════════

def _styles():
    _register_fonts()
    return {
        "doc_type": ParagraphStyle(
            "DocType",
            fontName="InvFontBold",
            fontSize=14,
            textColor=C_TEXT,
            leading=18,
            alignment=TA_CENTER,
        ),
        "doc_type_left": ParagraphStyle(
            "DocTypeLeft",
            fontName="InvFontBold",
            fontSize=14,
            textColor=C_TEXT,
            leading=18,
        ),
        "doc_number": ParagraphStyle(
            "DocNumber",
            fontName="InvFontBold",
            fontSize=10,
            textColor=C_TEXT_LIGHT,
            leading=14,
            alignment=TA_CENTER,
        ),
        "doc_number_left": ParagraphStyle(
            "DocNumberLeft",
            fontName="InvFontBold",
            fontSize=10,
            textColor=C_TEXT_LIGHT,
            leading=14,
        ),
        "order_number": ParagraphStyle(
            "OrderNumber",
            fontName="InvFont",
            fontSize=7.5,
            textColor=C_LABEL,
            leading=10.5,
            alignment=TA_CENTER,
        ),
        "order_number_left": ParagraphStyle(
            "OrderNumberLeft",
            fontName="InvFont",
            fontSize=7.5,
            textColor=C_LABEL,
            leading=10.5,
        ),
        "date_label": ParagraphStyle(
            "DateLabel",
            fontName="InvFont",
            fontSize=7.5,
            textColor=C_TEXT_LIGHT,
            alignment=TA_RIGHT,
            leading=11,
        ),
        "party_name": ParagraphStyle(
            "PartyName",
            fontName="InvFontBold",
            fontSize=10,
            textColor=C_TEXT,
            leading=14,
            spaceAfter=1 * mm,
        ),
        "party_info": ParagraphStyle(
            "PartyInfo",
            fontName="InvFont",
            fontSize=8,
            textColor=C_TEXT,
            leading=12,
        ),
        "th": ParagraphStyle(
            "TH",
            fontName="InvFontBold",
            fontSize=7.5,
            textColor=C_TEXT_LIGHT,
            leading=10,
            alignment=TA_CENTER,
        ),
        "th_left": ParagraphStyle(
            "THLeft",
            fontName="InvFontBold",
            fontSize=7.5,
            textColor=C_TEXT_LIGHT,
            leading=10,
        ),
        "th_right": ParagraphStyle(
            "THRight",
            fontName="InvFontBold",
            fontSize=7.5,
            textColor=C_TEXT_LIGHT,
            leading=10,
            alignment=TA_RIGHT,
        ),
        "td": ParagraphStyle(
            "TD",
            fontName="InvFont",
            fontSize=8,
            textColor=C_TEXT,
            leading=11,
        ),
        "td_right": ParagraphStyle(
            "TDRight",
            fontName="InvFont",
            fontSize=8,
            textColor=C_TEXT,
            leading=11,
            alignment=TA_RIGHT,
        ),
        "td_center": ParagraphStyle(
            "TDCenter",
            fontName="InvFont",
            fontSize=8,
            textColor=C_TEXT,
            leading=11,
            alignment=TA_CENTER,
        ),
        "td_bold": ParagraphStyle(
            "TDBold",
            fontName="InvFontBold",
            fontSize=8,
            textColor=C_TEXT,
            leading=11,
            alignment=TA_RIGHT,
        ),
        "total_label": ParagraphStyle(
            "TotalLabel",
            fontName="InvFont",
            fontSize=8.5,
            textColor=C_TEXT,
            leading=13,
        ),
        "total_value": ParagraphStyle(
            "TotalValue",
            fontName="InvFontBold",
            fontSize=8.5,
            textColor=C_TEXT,
            leading=13,
            alignment=TA_RIGHT,
        ),
        "total_indent_label": ParagraphStyle(
            "TotalIndentLabel",
            fontName="InvFont",
            fontSize=7.5,
            textColor=C_TEXT_LIGHT,
            leading=12,
        ),
        "total_indent_value": ParagraphStyle(
            "TotalIndentValue",
            fontName="InvFont",
            fontSize=7.5,
            textColor=C_TEXT_LIGHT,
            leading=12,
            alignment=TA_RIGHT,
        ),
        "grand_label": ParagraphStyle(
            "GrandLabel",
            fontName="InvFontBold",
            fontSize=9,
            textColor=C_TEXT,
            leading=14,
        ),
        "grand_value": ParagraphStyle(
            "GrandValue",
            fontName="InvFontBold",
            fontSize=9,
            textColor=C_TEXT,
            leading=14,
            alignment=TA_RIGHT,
        ),
        "note_title": ParagraphStyle(
            "NoteTitle",
            fontName="InvFontBold",
            fontSize=7.5,
            textColor=C_LABEL,
            leading=11,
        ),
        "note_text": ParagraphStyle(
            "NoteText",
            fontName="InvFont",
            fontSize=8.5,
            textColor=C_TEXT,
            leading=13,
        ),
        "words": ParagraphStyle(
            "Words",
            fontName="InvFont",
            fontSize=8,
            textColor=C_TEXT_LIGHT,
            leading=12,
        ),
    }


# ════════════════════════════════════════════════════════════
# Formatting
# ════════════════════════════════════════════════════════════

CURRENCY_SYMBOLS = {
    "EUR": "€",
    "USD": "$",
    "GBP": "£",
    "PLN": "zł",
    "CZK": "Kč",
    "SEK": "kr",
    "NOK": "kr",
    "DKK": "kr",
    "CHF": "CHF",
    "UAH": "₴",
    "RUB": "₽",
    "JPY": "¥",
    "CNY": "¥",
}


def _sym(currency):
    return CURRENCY_SYMBOLS.get(currency, currency)


def _fmt(value):
    if value is None:
        return "0,00"
    v = Decimal(str(value)).quantize(Decimal("0.01"))
    sign = "-" if v < 0 else ""
    v = abs(v)
    integer_part = int(v)
    decimal_part = str(v).split(".")[1] if "." in str(v) else "00"
    int_str = f"{integer_part:,}".replace(",", " ")
    return f"{sign}{int_str},{decimal_part}"


def _fmt_price(value):
    if value is None:
        return "0"
    v = Decimal(str(value)).quantize(Decimal("0.0001"))
    s = str(v).replace(".", ",")
    parts = s.split(",")
    if len(parts) == 2:
        dec = parts[1].rstrip("0")
        if len(dec) < 2:
            dec = dec.ljust(2, "0")
        return f"{parts[0]},{dec}"
    return s


def _fmt_qty(value):
    if value is None:
        return "0"
    v = Decimal(str(value))
    s = str(v)
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s.replace(".", ",")


def _format_date(d):
    if not d:
        return ""
    return d.strftime("%Y-%m-%d")


def _parse_num(v):
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    if not v:
        return Decimal("0")
    return Decimal(str(v).replace(",", "."))


def _make_logo(logo_path, max_width_mm=25, max_height_mm=10):
    try:
        img = ImageReader(logo_path)
        iw, ih = img.getSize()
        if not iw or not ih:
            return None

        max_w = max_width_mm * mm
        max_h = max_height_mm * mm

        scale = min(max_w / iw, max_h / ih)
        draw_w = iw * scale
        draw_h = ih * scale

        logo = Image(logo_path, width=draw_w, height=draw_h)
        logo.hAlign = "LEFT"
        return logo
    except Exception:
        return None


# ════════════════════════════════════════════════════════════
# Suma žodžiais
# ════════════════════════════════════════════════════════════

def _sum_in_words_lt(amount, currency="EUR"):
    def ones(n):
        return ["", "vienas", "du", "trys", "keturi", "penki",
                "šeši", "septyni", "aštuoni", "devyni"][n]

    def teens(n):
        return ["dešimt", "vienuolika", "dvylika", "trylika", "keturiolika",
                "penkiolika", "šešiolika", "septyniolika", "aštuoniolika", "devyniolika"][n]

    def tens(n):
        return ["", "dešimt", "dvidešimt", "trisdešimt", "keturiasdešimt",
                "penkiasdešimt", "šešiasdešimt", "septyniasdešimt",
                "aštuoniasdešimt", "devyniasdešimt"][n]

    def hundreds_word(n):
        if n == 1:
            return "šimtas"
        return ["", "šimtas", "du šimtai", "trys šimtai", "keturi šimtai",
                "penki šimtai", "šeši šimtai", "septyni šimtai",
                "aštuoni šimtai", "devyni šimtai"][n]

    def below_thousand(n):
        if n == 0:
            return ""
        parts = []
        if n >= 100:
            parts.append(hundreds_word(n // 100))
            n %= 100
        if 10 <= n <= 19:
            parts.append(teens(n - 10))
            return " ".join(parts)
        if n >= 20:
            parts.append(tens(n // 10))
            n %= 10
        if n > 0:
            parts.append(ones(n))
        return " ".join(parts)

    def thousand_form(n):
        if n % 100 in range(11, 20):
            return "tūkstančių"
        last = n % 10
        if last == 1:
            return "tūkstantis"
        if last == 0:
            return "tūkstančių"
        return "tūkstančiai"

    def million_form(n):
        if n % 100 in range(11, 20):
            return "milijonų"
        last = n % 10
        if last == 1:
            return "milijonas"
        if last == 0:
            return "milijonų"
        return "milijonai"

    def currency_form(n, unit="eur"):
        if unit == "eur":
            if n % 100 in range(11, 20) or n % 10 == 0:
                return "eurų"
            if n % 10 == 1:
                return "euras"
            return "eurai"
        else:
            if n % 100 in range(11, 20) or n % 10 == 0:
                return "centų"
            if n % 10 == 1:
                return "centas"
            return "centai"

    amount = Decimal(str(amount)).quantize(Decimal("0.01"))
    euros = int(amount)
    cents = int(round((amount - euros) * 100))

    parts = []
    if euros == 0:
        parts.append("nulis")
    else:
        e = euros
        if e >= 1_000_000:
            m = e // 1_000_000
            parts.append(f"{below_thousand(m)} {million_form(m)}")
            e %= 1_000_000
        if e >= 1000:
            t = e // 1000
            parts.append(f"{below_thousand(t)} {thousand_form(t)}")
            e %= 1000
        if e > 0:
            parts.append(below_thousand(e))

    parts.append(currency_form(euros))

    if cents > 0:
        parts.append(f"{below_thousand(cents)} {currency_form(cents, 'cent')}")

    text = " ".join(p for p in parts if p).strip()
    return text[0].upper() + text[1:] if text else ""


# ════════════════════════════════════════════════════════════
# Page numbering
# ════════════════════════════════════════════════════════════

class _PageCountCanvas(Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_number(page_count)
            super().showPage()
        super().save()

    def _draw_page_number(self, page_count):
        self.saveState()
        self.setFont("InvFont", 6.5)
        self.setFillColor(C_FOOTER)
        text = f"Puslapis {self._pageNumber}/{page_count}"
        self.drawRightString(PAGE_W - MARGIN_H, 10 * mm, text)
        self.restoreState()

# ════════════════════════════════════════════════════════════
# Watermark for free users
# ════════════════════════════════════════════════════════════

class _WatermarkPageCountCanvas(_PageCountCanvas):
    """Добавляет брендинг DokSkenas внизу каждой страницы (free plan)."""

    def _draw_page_number(self, page_count):
        super()._draw_page_number(page_count)
        self._draw_branding_footer()

    def _draw_branding_footer(self):
        self.saveState()
        y = 10 * mm
        text = "Sąskaita sugeneruota su"
        self.setFont("InvFont", 6.5)
        self.setFillColor(colors.HexColor("#999999"))

        from django.conf import settings as dj_settings
        logo_path = os.path.join(dj_settings.MEDIA_ROOT, "images", "dokskenas_logo_for_pdf.jpg")

        if os.path.exists(logo_path):
            text_w = self.stringWidth(text, "InvFont", 6.5)
            logo_h = 6.5 * mm
            logo_w = 26 * mm
            self.drawString(MARGIN_H, y, text)
            self.drawImage(
                logo_path,
                MARGIN_H + text_w + 1 * mm, y - 1.8 * mm,
                logo_w, logo_h,
                preserveAspectRatio=True,
                anchor='sw',
                mask="auto",
            )
        else:
            fallback = "Sąskaita sugeneruota DokSkenas"
            self.drawString(MARGIN_H, y, fallback)

        self.restoreState()


# ════════════════════════════════════════════════════════════
# Build elements
# ════════════════════════════════════════════════════════════

TYPE_LABELS = {
    "isankstine": "IŠANKSTINĖ SĄSKAITA FAKTŪRA",
    "pvm_saskaita": "PVM SĄSKAITA FAKTŪRA",
    "saskaita": "SĄSKAITA FAKTŪRA",
    "kreditine": "KREDITINĖ SĄSKAITA FAKTŪRA",
}


def _separator():
    sep = Table([["", ""]], colWidths=[CONTENT_W, 0])
    sep.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (0, 0), 1.5, C_DIVIDER),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [sep]


def _build_header(inv, logo_path, s):
    elements = []
    payment_btn = None
    doc_title = TYPE_LABELS.get(inv.invoice_type, "SĄSKAITA FAKTŪRA")
    series_line = f"Serija {inv.document_series or ''} Nr. {inv.document_number or ''}"
 
    right_lines = [f"Data: <b>{_format_date(inv.invoice_date)}</b>"]
    if inv.due_date:
        right_lines.append(f"Apmokėti iki: <b>{_format_date(inv.due_date)}</b>")
    right_content = [Paragraph(line, s["date_label"]) for line in right_lines]
 
    # ── Logo ─────────────────────────────────────────────
    has_logo = False
    logo_el = None
    if logo_path:
        logo_el = _make_logo(logo_path)
        has_logo = logo_el is not None
 
    if has_logo:
        if payment_btn:
            # 3 columns: [Logo] [Button →] [Dates →]
            top_data = [[logo_el, payment_btn, right_content]]
            top_table = Table(
                top_data,
                colWidths=[CONTENT_W * 0.40, CONTENT_W * 0.32, CONTENT_W * 0.28],
            )
        else:
            # 2 columns: [Logo] [Dates →]
            top_data = [[logo_el, right_content]]
            top_table = Table(top_data, colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
 
        top_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("ALIGN", (-1, 0), (-1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(top_table)
        elements.append(Spacer(1, 3 * mm))
 
        elements.extend(_separator())
        elements.append(Spacer(1, 4 * mm))
 
        # Centered title block
        elements.append(Paragraph(doc_title, s["doc_type"]))
        elements.append(Spacer(1, 1 * mm))
        elements.append(Paragraph(series_line, s["doc_number"]))
        if inv.order_number:
            elements.append(Spacer(1, 0.5 * mm))
            elements.append(Paragraph(f"Užsakymo Nr.: {inv.order_number}", s["order_number"]))
        elements.append(Spacer(1, 5 * mm))
    else:
        # No logo layout
        left_content = [
            Paragraph(doc_title, s["doc_type_left"]),
            Spacer(1, 1 * mm),
            Paragraph(series_line, s["doc_number_left"]),
        ]
        if inv.order_number:
            left_content.append(Spacer(1, 0.5 * mm))
            left_content.append(
                Paragraph(f"Užsakymo Nr.: {inv.order_number}", s["order_number_left"])
            )
 
        if payment_btn:
            # 3 columns: [Title] [Button →] [Dates →]
            data = [[left_content, payment_btn, right_content]]
            t = Table(
                data,
                colWidths=[CONTENT_W * 0.40, CONTENT_W * 0.32, CONTENT_W * 0.28],
            )
        else:
            # 2 columns: [Title] [Dates →]
            data = [[left_content, right_content]]
            t = Table(data, colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.4])
 
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("ALIGN", (-1, 0), (-1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 2 * mm))
        elements.extend(_separator())
        elements.append(Spacer(1, 5 * mm))
 
    return elements


def _info_line(label, value, s):
    return Paragraph(
        f'<font color="{C_LABEL.hexval()}" size="7">{label}:</font> {value}',
        s["party_info"],
    )


def _build_parties(inv, s):
    def party_block(title, person_type, name, code, vat, address, phone, email, bank, iban, swift):
        code_label = "Asmens / ind. veiklos kodas" if person_type == "fizinis" else "Įm. kodas"

        lines = [
            Paragraph(
                title,
                ParagraphStyle(
                    "PT",
                    fontName="InvFontBold",
                    fontSize=7,
                    textColor=C_LABEL,
                    leading=10,
                    spaceAfter=0.5 * mm,
                ),
            ),
            Paragraph(f"<b>{name or ''}</b>", s["party_name"]),
        ]
        if code:
            lines.append(_info_line(code_label, code, s))
        if vat:
            lines.append(_info_line("PVM kodas", vat, s))
        if address:
            lines.append(_info_line("Adresas", address, s))
        if phone:
            lines.append(_info_line("Tel.", phone, s))
        if email:
            lines.append(_info_line("El. paštas", email, s))
        if bank:
            lines.append(_info_line("Bankas", bank, s))
        if iban:
            lines.append(_info_line("IBAN", iban, s))
        if swift:
            lines.append(_info_line("SWIFT", swift, s))
        return lines

    seller = party_block(
        "PARDAVĖJAS",
        getattr(inv, "seller_type", "juridinis"),
        inv.seller_name,
        inv.seller_id,
        inv.seller_vat_code,
        inv.seller_address,
        inv.seller_phone,
        inv.seller_email,
        inv.seller_bank_name,
        inv.seller_iban,
        inv.seller_swift,
    )
    buyer = party_block(
        "PIRKĖJAS",
        getattr(inv, "buyer_type", "juridinis"),
        inv.buyer_name,
        inv.buyer_id,
        inv.buyer_vat_code,
        inv.buyer_address,
        inv.buyer_phone,
        inv.buyer_email,
        inv.buyer_bank_name,
        inv.buyer_iban,
        inv.buyer_swift,
    )

    t = Table([[seller, buyer]], colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    return [t, Spacer(1, 12 * mm)]


def _build_line_items(inv, s):
    is_pvm = inv.pvm_tipas == "taikoma"
    currency = inv.currency or "EUR"
    lines = list(inv.line_items.order_by("sort_order", "id"))

    has_code = any(li.prekes_kodas for li in lines)
    has_discount = any((li.discount_wo_vat or 0) > 0 for li in lines)

    price_header = f"Kaina {currency}<br/>be PVM" if is_pvm else f"Kaina {currency}"
    sum_header = f"Suma {currency}<br/>be PVM" if is_pvm else f"Suma {currency}"

    headers = [("Nr.", "th", 8 * mm)]
    headers.append(("Pavadinimas", "th_left", None))
    if has_code:
        headers.append(("Kodas", "th_left", None))
    headers.append(("Kiekis", "th_right", 12 * mm))
    headers.append(("Mato<br/>vnt.", "th", 16 * mm))
    headers.append((price_header, "th_right", 24 * mm))
    if has_discount:
        headers.append(("Nuol.", "th_right", 16 * mm))
    headers.append((sum_header, "th_right", 24 * mm))

    min_name_w = 42 * mm
    min_code_w = 26 * mm if has_code else 0

    fixed_w = sum(h[2] for h in headers if h[2] is not None)
    remaining_w = CONTENT_W - fixed_w

    if has_code:
        code_w = max(min_code_w, remaining_w * 0.38)
        name_w = remaining_w - code_w

        if name_w < min_name_w:
            deficit = min_name_w - name_w
            code_w = max(min_code_w, code_w - deficit)
            name_w = remaining_w - code_w

        if name_w < min_name_w:
            adjusted_headers = []
            for title, style, width in headers:
                if title.startswith("Kaina ") and width is not None:
                    width = 21 * mm
                elif title.startswith("Suma ") and width is not None:
                    width = 21 * mm
                elif title == "Nuol." and width is not None:
                    width = 14 * mm
                elif title == "Kiekis" and width is not None:
                    width = 11 * mm
                adjusted_headers.append((title, style, width))
            headers = adjusted_headers

            fixed_w = sum(h[2] for h in headers if h[2] is not None)
            remaining_w = CONTENT_W - fixed_w
            code_w = max(min_code_w, remaining_w * 0.38)
            name_w = remaining_w - code_w
            if name_w < min_name_w:
                code_w = max(22 * mm, remaining_w - min_name_w)
                name_w = remaining_w - code_w

        col_widths = []
        flex_index = 0
        for _, _, width in headers:
            if width is not None:
                col_widths.append(width)
            else:
                col_widths.append(name_w if flex_index == 0 else code_w)
                flex_index += 1
    else:
        name_w = remaining_w
        col_widths = [h[2] if h[2] is not None else name_w for h in headers]

    header_row = [Paragraph(h[0], s[h[1]]) for h in headers]
    data = [header_row]

    for idx, li in enumerate(lines, 1):
        qty = _parse_num(li.quantity)
        price = _parse_num(li.price)
        discount = _parse_num(li.discount_wo_vat or 0)
        net = max(Decimal("0"), qty * price - discount)

        row = [Paragraph(str(idx), s["td_center"])]

        name_text = li.prekes_pavadinimas or ""
        if li.prekes_barkodas:
            name_text += f'<br/><font size="5.5" color="{C_LABEL.hexval()}">Barkodas: {li.prekes_barkodas}</font>'
        row.append(Paragraph(name_text, s["td"]))

        if has_code:
            row.append(Paragraph(f'<font size="7.2">{li.prekes_kodas or ""}</font>', s["td"]))

        row.append(Paragraph(_fmt_qty(qty), s["td_right"]))
        row.append(Paragraph(li.unit or "", s["td_center"]))
        row.append(Paragraph(_fmt_price(price), s["td_right"]))

        if has_discount:
            row.append(Paragraph(_fmt(discount) if discount > 0 else "", s["td_right"]))

        row.append(Paragraph(f"<b>{_fmt(net)}</b>", s["td_bold"]))
        data.append(row)

    t = Table(data, colWidths=col_widths, repeatRows=1, splitByRow=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), C_HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), C_TEXT_LIGHT),
        ("FONTNAME", (0, 0), (-1, 0), "InvFontBold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, C_DIVIDER),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, C_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
    ]

    for i in range(2, len(data), 2):
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), C_ROW_ALT))

    t.setStyle(TableStyle(style_cmds))
    return [t, Spacer(1, 4 * mm)]


def _build_totals(inv, s):
    is_pvm = inv.pvm_tipas == "taikoma"
    sym = _sym(inv.currency or "EUR")
    lines = list(inv.line_items.order_by("sort_order", "id"))

    sum_net = Decimal("0")
    vat_groups = {}

    for li in lines:
        qty = _parse_num(li.quantity)
        price = _parse_num(li.price)
        discount = _parse_num(li.discount_wo_vat or 0)
        net = max(Decimal("0"), qty * price - discount)
        vat_pct = _parse_num(li.vat_percent) if li.vat_percent is not None else (
            _parse_num(inv.vat_percent or 21) if is_pvm else Decimal("0")
        )
        sum_net += net
        rate = float(vat_pct)
        if rate not in vat_groups:
            vat_groups[rate] = Decimal("0")
        vat_groups[rate] += net

    inv_discount = min(_parse_num(inv.invoice_discount_wo_vat or 0), sum_net)
    base = sum_net - inv_discount

    breakdown = []
    for rate in sorted(vat_groups.keys(), reverse=True):
        group_net = vat_groups[rate]
        ratio = group_net / sum_net if sum_net > 0 else Decimal("0")
        discounted = group_net - inv_discount * ratio
        vat = discounted * Decimal(str(rate)) / 100 if is_pvm else Decimal("0")
        breakdown.append({
            "rate": rate,
            "net": max(Decimal("0"), discounted),
            "vat": max(Decimal("0"), vat),
        })

    vat_total = sum(g["vat"] for g in breakdown)
    grand = base + vat_total
    multi_vat = len(breakdown) > 1

    rows = []
    if inv_discount > 0:
        rows.append(("normal", "Tarpinė suma:", f"{_fmt(sum_net)} {sym}"))
        rows.append(("normal", "Nuolaida:", f"-{_fmt(inv_discount)} {sym}"))

    if is_pvm:
        rows.append(("normal", "Suma be PVM:", f"{_fmt(base)} {sym}"))
        if multi_vat:
            for g in breakdown:
                r = int(g["rate"]) if g["rate"] == int(g["rate"]) else g["rate"]
                rows.append(("indent", f"Apmokestinama PVM {r}%:", f"{_fmt(g['net'])} {sym}"))
            for g in breakdown:
                if g["rate"] > 0:
                    r = int(g["rate"]) if g["rate"] == int(g["rate"]) else g["rate"]
                    rows.append(("normal", f"PVM {r}%:", f"{_fmt(g['vat'])} {sym}"))
        else:
            rate = breakdown[0]["rate"] if breakdown else float(inv.vat_percent or 21)
            r = int(rate) if rate == int(rate) else rate
            rows.append(("normal", f"PVM {r}%:", f"{_fmt(vat_total)} {sym}"))
        rows.append(("grand", "Suma su PVM:", f"{_fmt(grand)} {sym}"))
    else:
        rows.append(("grand", "Bendra suma:", f"{_fmt(base)} {sym}"))

    summary_data = []
    for row_type, label, value in rows:
        if row_type == "indent":
            summary_data.append([
                Paragraph(f"&nbsp;&nbsp;&nbsp;{label}", s["total_indent_label"]),
                Paragraph(value, s["total_indent_value"]),
            ])
        elif row_type == "grand":
            summary_data.append([
                Paragraph(f"<b>{label}</b>", s["grand_label"]),
                Paragraph(f"<b>{value}</b>", s["grand_value"]),
            ])
        else:
            summary_data.append([
                Paragraph(label, s["total_label"]),
                Paragraph(f"<b>{value}</b>", s["total_value"]),
            ])

    summary_table = Table(summary_data, colWidths=[42 * mm, 28 * mm])
    summary_table.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.6 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.6 * mm),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, C_DIVIDER),
    ]))
    summary_table.hAlign = "RIGHT"

    left_parts = []

    if inv.note:
        left_parts.append(Paragraph("PASTABA:", s["note_title"]))
        left_parts.append(Spacer(1, 1 * mm))
        left_parts.append(Paragraph(inv.note, s["note_text"]))

    if is_pvm and grand and (inv.currency or "EUR") == "EUR":
        if left_parts:
            left_parts.append(Spacer(1, 5 * mm))
        left_parts.append(Paragraph("SUMA ŽODŽIAIS:", s["note_title"]))
        left_parts.append(Spacer(1, 1 * mm))
        left_parts.append(Paragraph(_sum_in_words_lt(grand), s["words"]))

    if not left_parts:
        left_parts.append(Spacer(1, 1 * mm))

    layout = Table([[left_parts, summary_table]], colWidths=[CONTENT_W - 75 * mm, 70 * mm])
    layout.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    return [layout, Spacer(1, 6 * mm)]


def _build_note(inv, s):
    return []


def _build_signatures(inv, s):
    issued_by = getattr(inv, "issued_by", "") or ""
    received_by = getattr(inv, "received_by", "") or ""

    value_style = ParagraphStyle(
        "SigValue",
        fontName="InvFont",
        fontSize=8.5,
        textColor=C_TEXT,
        leading=12,
    )

    left = [
        Paragraph("SĄSKAITĄ IŠRAŠĖ:", s["note_title"]),
        Spacer(1, 1 * mm),
        Paragraph(issued_by, value_style),
    ]

    right = [
        Paragraph("SĄSKAITĄ PRIĖMĖ:", s["note_title"]),
        Spacer(1, 1 * mm),
        Paragraph(received_by, value_style),
    ]

    t = Table([[left, right]], colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [t, Spacer(1, 4 * mm)]


def _build_footer(inv, s):
    return []


# ════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════

def generate_invoice_pdf(invoice, logo_path=None, watermark=False):
    _register_fonts()
    s = _styles()
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=MARGIN_V,
        bottomMargin=MARGIN_V + 5 * mm,
        leftMargin=MARGIN_H,
        rightMargin=MARGIN_H,
        title=f"Sąskaita {invoice.document_series}{invoice.document_number}",
        author=invoice.seller_name or "DokSkenas",
    )

    elements = []
    elements.extend(_build_header(invoice, logo_path, s))
    elements.extend(_build_parties(invoice, s))
    elements.extend(_build_line_items(invoice, s))
    elements.extend(_build_totals(invoice, s))
    elements.extend(_build_note(invoice, s))
    elements.extend(_build_signatures(invoice, s))
    elements.extend(_build_footer(invoice, s))

    if watermark:
        doc.build(elements, canvasmaker=_WatermarkPageCountCanvas)
    else:
        doc.build(elements, canvasmaker=_PageCountCanvas)

    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def save_invoice_pdf(invoice):
    logo_path = None
    try:
        settings = invoice.user.invoice_settings
        if settings.logo and settings.logo.storage.exists(settings.logo.name):
            logo_path = settings.logo.path
    except Exception:
        pass

    # --- Watermark for free plan ---
    watermark = False
    try:
        from docscanner_app.models import InvSubscription
        sub = InvSubscription.objects.filter(user=invoice.user).first()
        if sub:
            sub.check_and_expire()
            watermark = sub.status == "free"
            logger.info("[PDF] user=%s inv_sub.status=%s watermark=%s", invoice.user.email, sub.status, watermark)
        else:
            logger.info("[PDF] user=%s no InvSubscription found", invoice.user.email)
    except Exception as e:
        logger.error("[PDF] watermark check failed: %s", e)


























# """
# DokSkenas — Sąskaitų išrašymas
# PDF generation via ReportLab — design matches InvoiceA4 React preview.
# """

# import io
# import os
# import platform
# from decimal import Decimal

# from reportlab.lib import colors
# from reportlab.lib.pagesizes import A4
# from reportlab.lib.units import mm
# from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
# from reportlab.lib.styles import ParagraphStyle
# from reportlab.platypus import (
#     SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
# )
# from reportlab.pdfbase import pdfmetrics
# from reportlab.pdfbase.ttfonts import TTFont
# from reportlab.pdfgen.canvas import Canvas
# from reportlab.lib.utils import ImageReader

# from django.core.files.base import ContentFile


# # ════════════════════════════════════════════════════════════
# # Fonts
# # ════════════════════════════════════════════════════════════

# _FONTS_REGISTERED = False

# def _register_fonts():
#     global _FONTS_REGISTERED
#     if _FONTS_REGISTERED:
#         return

#     candidates = [
#         ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
#          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
#     ]

#     if platform.system() == "Windows":
#         win_fonts = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
#         candidates = [
#             (os.path.join(win_fonts, "DejaVuSans.ttf"),
#              os.path.join(win_fonts, "DejaVuSans-Bold.ttf")),
#             (os.path.join(win_fonts, "arial.ttf"),
#              os.path.join(win_fonts, "arialbd.ttf")),
#         ]

#     for regular, bold in candidates:
#         if os.path.exists(regular):
#             pdfmetrics.registerFont(TTFont("InvFont", regular))
#             pdfmetrics.registerFont(TTFont("InvFontBold",
#                                            bold if os.path.exists(bold) else regular))
#             _FONTS_REGISTERED = True
#             return

#     raise RuntimeError(
#         "TTF šriftas nerastas. "
#         "Windows: C:\\Windows\\Fonts\\arial.ttf. "
#         "Linux: apt-get install fonts-dejavu-core"
#     )


# # ════════════════════════════════════════════════════════════
# # Colors
# # ════════════════════════════════════════════════════════════

# C_TEXT = colors.HexColor("#222222")
# C_TEXT_LIGHT = colors.HexColor("#555555")
# C_LABEL = colors.HexColor("#888888")
# C_BORDER = colors.HexColor("#e0e0e0")
# C_ROW_ALT = colors.HexColor("#fafafa")
# C_HEADER_BG = colors.HexColor("#f5f5f5")
# C_DIVIDER = colors.HexColor("#333333")
# C_FOOTER = colors.HexColor("#aaaaaa")

# PAGE_W, PAGE_H = A4
# MARGIN_H = 18 * mm
# MARGIN_V = 16 * mm
# CONTENT_W = PAGE_W - 2 * MARGIN_H


# # ════════════════════════════════════════════════════════════
# # Styles
# # ════════════════════════════════════════════════════════════

# def _styles():
#     _register_fonts()
#     return {
#         "doc_type": ParagraphStyle("DocType", fontName="InvFontBold", fontSize=14, textColor=C_TEXT, leading=18, alignment=TA_CENTER),
#         "doc_type_left": ParagraphStyle("DocTypeLeft", fontName="InvFontBold", fontSize=14, textColor=C_TEXT, leading=18),
#         "doc_number": ParagraphStyle("DocNumber", fontName="InvFontBold", fontSize=10, textColor=C_TEXT_LIGHT, leading=14, alignment=TA_CENTER),
#         "doc_number_left": ParagraphStyle("DocNumberLeft", fontName="InvFontBold", fontSize=10, textColor=C_TEXT_LIGHT, leading=14),
#         "order_number": ParagraphStyle("OrderNumber", fontName="InvFont", fontSize=7.5, textColor=C_LABEL, leading=10.5, alignment=TA_CENTER),
#         "order_number_left": ParagraphStyle("OrderNumberLeft", fontName="InvFont", fontSize=7.5, textColor=C_LABEL, leading=10.5),
#         "date_label": ParagraphStyle("DateLabel", fontName="InvFont", fontSize=7.5, textColor=C_TEXT_LIGHT, alignment=TA_RIGHT, leading=13),
#         # Party
#         "party_label": ParagraphStyle("PartyLabel", fontName="InvFontBold", fontSize=7, textColor=C_LABEL, leading=10, spaceAfter=0.5*mm),
#         "party_name": ParagraphStyle("PartyName", fontName="InvFontBold", fontSize=10, textColor=C_TEXT, leading=14, spaceAfter=1*mm),
#         "party_info": ParagraphStyle("PartyInfo", fontName="InvFont", fontSize=8, textColor=C_TEXT, leading=12),
#         # Table
#         "th": ParagraphStyle("TH", fontName="InvFontBold", fontSize=7.5, textColor=C_TEXT_LIGHT, leading=10, alignment=TA_CENTER),
#         "th_left": ParagraphStyle("THLeft", fontName="InvFontBold", fontSize=7.5, textColor=C_TEXT_LIGHT, leading=10),
#         "th_right": ParagraphStyle("THRight", fontName="InvFontBold", fontSize=7.5, textColor=C_TEXT_LIGHT, leading=10, alignment=TA_RIGHT),
#         "td": ParagraphStyle("TD", fontName="InvFont", fontSize=8, textColor=C_TEXT, leading=11),
#         "td_right": ParagraphStyle("TDRight", fontName="InvFont", fontSize=8, textColor=C_TEXT, leading=11, alignment=TA_RIGHT),
#         "td_center": ParagraphStyle("TDCenter", fontName="InvFont", fontSize=8, textColor=C_TEXT, leading=11, alignment=TA_CENTER),
#         "td_bold": ParagraphStyle("TDBold", fontName="InvFontBold", fontSize=8, textColor=C_TEXT, leading=11, alignment=TA_RIGHT),
#         # Totals
#         "total_label": ParagraphStyle("TotalLabel", fontName="InvFont", fontSize=8.5, textColor=C_TEXT, leading=13),
#         "total_value": ParagraphStyle("TotalValue", fontName="InvFontBold", fontSize=8.5, textColor=C_TEXT, leading=13, alignment=TA_RIGHT),
#         "total_indent_label": ParagraphStyle("TotalIndentLabel", fontName="InvFont", fontSize=7.5, textColor=C_TEXT_LIGHT, leading=12),
#         "total_indent_value": ParagraphStyle("TotalIndentValue", fontName="InvFont", fontSize=7.5, textColor=C_TEXT_LIGHT, leading=12, alignment=TA_RIGHT),
#         "grand_label": ParagraphStyle("GrandLabel", fontName="InvFontBold", fontSize=9, textColor=C_TEXT, leading=14),
#         "grand_value": ParagraphStyle("GrandValue", fontName="InvFontBold", fontSize=9, textColor=C_TEXT, leading=14, alignment=TA_RIGHT),
#         # Note
#         "note_title": ParagraphStyle("NoteTitle", fontName="InvFontBold", fontSize=7.5, textColor=C_LABEL, leading=11),
#         "note_text": ParagraphStyle("NoteText", fontName="InvFont", fontSize=8.5, textColor=C_TEXT, leading=13),
#         # Signature
#         "sig_label": ParagraphStyle("SigLabel", fontName="InvFont", fontSize=7.5, textColor=C_LABEL, leading=10),
#         "sig_name": ParagraphStyle("SigName", fontName="InvFont", fontSize=7.5, textColor=C_TEXT_LIGHT, leading=10, alignment=TA_CENTER),
#         # Footer
#         "footer": ParagraphStyle("Footer", fontName="InvFont", fontSize=6.5, textColor=C_FOOTER, alignment=TA_CENTER, leading=10),
#         # Words / currency
#         "words": ParagraphStyle("Words", fontName="InvFont", fontSize=8, textColor=C_TEXT_LIGHT, leading=12),
#         "currency": ParagraphStyle("Currency", fontName="InvFont", fontSize=7.5, textColor=C_LABEL, leading=10),
#     }


# # ════════════════════════════════════════════════════════════
# # Formatting
# # ════════════════════════════════════════════════════════════

# CURRENCY_SYMBOLS = {
#     "EUR": "€", "USD": "$", "GBP": "£", "PLN": "zł", "CZK": "Kč",
#     "SEK": "kr", "NOK": "kr", "DKK": "kr", "CHF": "CHF", "UAH": "₴",
#     "RUB": "₽", "JPY": "¥", "CNY": "¥",
# }

# def _sym(currency):
#     return CURRENCY_SYMBOLS.get(currency, currency)

# def _fmt(value):
#     if value is None:
#         return "0,00"
#     v = Decimal(str(value)).quantize(Decimal("0.01"))
#     sign = "-" if v < 0 else ""
#     v = abs(v)
#     integer_part = int(v)
#     decimal_part = str(v).split(".")[1] if "." in str(v) else "00"
#     int_str = f"{integer_part:,}".replace(",", " ")
#     return f"{sign}{int_str},{decimal_part}"

# def _fmt_price(value):
#     if value is None:
#         return "0"
#     v = Decimal(str(value)).quantize(Decimal("0.0001"))
#     s = str(v).replace(".", ",")
#     parts = s.split(",")
#     if len(parts) == 2:
#         dec = parts[1].rstrip("0")
#         if len(dec) < 2:
#             dec = dec.ljust(2, "0")
#         return f"{parts[0]},{dec}"
#     return s

# def _fmt_qty(value):
#     if value is None:
#         return "0"
#     v = Decimal(str(value))
#     s = str(v)
#     if "." in s:
#         s = s.rstrip("0").rstrip(".")
#     return s.replace(".", ",")

# def _format_date(d):
#     if not d:
#         return ""
#     return d.strftime("%Y-%m-%d")

# def _parse_num(v):
#     if isinstance(v, (int, float, Decimal)):
#         return Decimal(str(v))
#     if not v:
#         return Decimal("0")
#     return Decimal(str(v).replace(",", "."))

# def _make_logo(logo_path, max_width_mm=25, max_height_mm=10):
#     """
#     15% меньше прежнего размера:
#     было 35x14 mm
#     стало 29.75x11.9 mm
#     Автоматически сохраняет пропорции для любых логотипов.
#     """
#     try:
#         img = ImageReader(logo_path)
#         iw, ih = img.getSize()
#         if not iw or not ih:
#             return None

#         max_w = max_width_mm * mm
#         max_h = max_height_mm * mm

#         scale = min(max_w / iw, max_h / ih)
#         draw_w = iw * scale
#         draw_h = ih * scale

#         logo = Image(logo_path, width=draw_w, height=draw_h)
#         logo.hAlign = "LEFT"
#         return logo
#     except Exception:
#         return None


# # ════════════════════════════════════════════════════════════
# # Suma žodžiais (Lithuanian)
# # ════════════════════════════════════════════════════════════

# def _sum_in_words_lt(amount, currency="EUR"):
#     def ones(n):
#         return ["", "vienas", "du", "trys", "keturi", "penki",
#                 "šeši", "septyni", "aštuoni", "devyni"][n]
#     def teens(n):
#         return ["dešimt", "vienuolika", "dvylika", "trylika", "keturiolika",
#                 "penkiolika", "šešiolika", "septyniolika", "aštuoniolika", "devyniolika"][n]
#     def tens(n):
#         return ["", "dešimt", "dvidešimt", "trisdešimt", "keturiasdešimt",
#                 "penkiasdešimt", "šešiasdešimt", "septyniasdešimt",
#                 "aštuoniasdešimt", "devyniasdešimt"][n]
#     def hundreds_word(n):
#         if n == 1: return "šimtas"
#         return ["", "šimtas", "du šimtai", "trys šimtai", "keturi šimtai",
#                 "penki šimtai", "šeši šimtai", "septyni šimtai",
#                 "aštuoni šimtai", "devyni šimtai"][n]
#     def below_thousand(n):
#         if n == 0: return ""
#         parts = []
#         if n >= 100:
#             parts.append(hundreds_word(n // 100)); n %= 100
#         if 10 <= n <= 19:
#             parts.append(teens(n - 10)); return " ".join(parts)
#         if n >= 20:
#             parts.append(tens(n // 10)); n %= 10
#         if n > 0:
#             parts.append(ones(n))
#         return " ".join(parts)
#     def thousand_form(n):
#         if n % 100 in range(11, 20): return "tūkstančių"
#         last = n % 10
#         if last == 1: return "tūkstantis"
#         if last == 0: return "tūkstančių"
#         return "tūkstančiai"
#     def million_form(n):
#         if n % 100 in range(11, 20): return "milijonų"
#         last = n % 10
#         if last == 1: return "milijonas"
#         if last == 0: return "milijonų"
#         return "milijonai"
#     def currency_form(n, unit="eur"):
#         if unit == "eur":
#             if n % 100 in range(11, 20) or n % 10 == 0: return "eurų"
#             if n % 10 == 1: return "euras"
#             return "eurai"
#         else:
#             if n % 100 in range(11, 20) or n % 10 == 0: return "centų"
#             if n % 10 == 1: return "centas"
#             return "centai"

#     amount = Decimal(str(amount)).quantize(Decimal("0.01"))
#     euros = int(amount)
#     cents = int(round((amount - euros) * 100))
#     parts = []
#     if euros == 0:
#         parts.append("nulis")
#     else:
#         e = euros
#         if e >= 1_000_000:
#             m = e // 1_000_000
#             parts.append(f"{below_thousand(m)} {million_form(m)}"); e %= 1_000_000
#         if e >= 1000:
#             t = e // 1000
#             parts.append(f"{below_thousand(t)} {thousand_form(t)}"); e %= 1000
#         if e > 0:
#             parts.append(below_thousand(e))
#     parts.append(currency_form(euros))
#     if cents > 0:
#         parts.append(f"{below_thousand(cents)} {currency_form(cents, 'cent')}")
#     text = " ".join(p for p in parts if p).strip()
#     return text[0].upper() + text[1:] if text else ""


# # ════════════════════════════════════════════════════════════
# # Page numbering — fixed: no duplicate pages
# # ════════════════════════════════════════════════════════════

# class _NumberedCanvas(Canvas):
#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         self._page_count = 0

#     def showPage(self):
#         self._page_count += 1
#         super().showPage()

#     def save(self):
#         total = self._page_count
#         # Go through each page and add page number
#         for i in range(total):
#             self._pageNumber = i + 1
#         # We can't easily go back, so we use onPage instead
#         super().save()


# def _add_page_number(canvas, doc):
#     """Called on each page to add page number."""
#     canvas.saveState()
#     canvas.setFont("InvFont", 6.5)
#     canvas.setFillColor(C_FOOTER)
#     text = f"Puslapis {doc.page}"
#     canvas.drawRightString(PAGE_W - MARGIN_H, 10 * mm, text)
#     canvas.restoreState()


# # ════════════════════════════════════════════════════════════
# # Build elements
# # ════════════════════════════════════════════════════════════

# TYPE_LABELS = {
#     "isankstine": "IŠANKSTINĖ SĄSKAITA FAKTŪRA",
#     "pvm_saskaita": "PVM SĄSKAITA FAKTŪRA",
#     "saskaita": "SĄSKAITA FAKTŪRA",
#     "kreditine": "KREDITINĖ SĄSKAITA FAKTŪRA",
# }


# def _build_header(inv, logo_path, s):
#     """
#     With logo: logo top-left, dates top-right, then line, then doc type centered, series centered.
#     Without logo: doc type top-left, series below, dates top-right.
#     """
#     elements = []
#     doc_title = TYPE_LABELS.get(inv.invoice_type, "SĄSKAITA FAKTŪRA")
#     series_line = f"Serija {inv.document_series or ''} Nr. {inv.document_number or ''}"

#     # Date lines (right side)
#     right_lines = [f"Data: <b>{_format_date(inv.invoice_date)}</b>"]
#     if inv.due_date:
#         right_lines.append(f"Apmokėti iki: <b>{_format_date(inv.due_date)}</b>")
#     right_content = [Paragraph(line, s["date_label"]) for line in right_lines]

#     has_logo = False
#     if logo_path:
#         logo_el = _make_logo(logo_path)
#         has_logo = logo_el is not None

#     if has_logo:
#         # ── Layout WITH logo ──
#         # Row 1: logo left, dates right
#         top_data = [[logo_el, right_content]]
#         top_table = Table(top_data, colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
#         top_table.setStyle(TableStyle([
#             ("VALIGN", (0, 0), (-1, -1), "TOP"),
#             ("LEFTPADDING", (0, 0), (-1, -1), 0),
#             ("RIGHTPADDING", (0, 0), (-1, -1), 0),
#             ("TOPPADDING", (0, 0), (-1, -1), 0),
#             ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
#         ]))
#         elements.append(top_table)
#         elements.append(Spacer(1, 3 * mm))

#         # Separator
#         elements.extend(_separator())
#         elements.append(Spacer(1, 4 * mm))

#         # Doc type centered
#         elements.append(Paragraph(doc_title, s["doc_type"]))
#         elements.append(Spacer(1, 1 * mm))
#         elements.append(Paragraph(series_line, s["doc_number"]))
#         if inv.order_number:
#             elements.append(Spacer(1, 0.5 * mm))
#             elements.append(Paragraph(f"Užsakymo Nr.: {inv.order_number}", s["order_number"]))
#         elements.append(Spacer(1, 5 * mm))
#     else:
#         # ── Layout WITHOUT logo ──
#         # Left: doc type + series, Right: dates
#         left_content = [
#             Paragraph(doc_title, s["doc_type_left"]),
#             Spacer(1, 1 * mm),
#             Paragraph(series_line, s["doc_number_left"]),
#         ]
#         if inv.order_number:
#             left_content.append(Spacer(1, 0.5 * mm))
#             left_content.append(Paragraph(f"Užsakymo Nr.: {inv.order_number}", s["order_number_left"]))

#         data = [[left_content, right_content]]
#         t = Table(data, colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.4])
#         t.setStyle(TableStyle([
#             ("VALIGN", (0, 0), (-1, -1), "TOP"),
#             ("LEFTPADDING", (0, 0), (-1, -1), 0),
#             ("RIGHTPADDING", (0, 0), (-1, -1), 0),
#             ("TOPPADDING", (0, 0), (-1, -1), 0),
#             ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
#         ]))
#         elements.append(t)
#         elements.append(Spacer(1, 2 * mm))
#         elements.extend(_separator())
#         elements.append(Spacer(1, 5 * mm))

#     return elements


# def _separator():
#     """Horizontal divider line."""
#     sep = Table([["", ""]], colWidths=[CONTENT_W, 0])
#     sep.setStyle(TableStyle([
#         ("LINEBELOW", (0, 0), (0, 0), 1.5, C_DIVIDER),
#         ("TOPPADDING", (0, 0), (-1, -1), 0),
#         ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
#     ]))
#     return [sep]


# def _info_line(label, value, s):
#     return Paragraph(
#         f'<font color="{C_LABEL.hexval()}" size="7">{label}:</font>  {value}',
#         s["party_info"],
#     )


# def _build_parties(inv, s):
#     def party_block(title, person_type, name, code, vat, address, phone, email, bank, iban, swift):
#         code_label = "Asmens / ind. veiklos kodas" if person_type == "fizinis" else "Įm. kodas"

#         lines = [
#             Paragraph(title, ParagraphStyle("PT", fontName="InvFontBold", fontSize=7,
#                                             textColor=C_LABEL, leading=10, spaceAfter=0.5*mm)),
#             Paragraph(f"<b>{name or ''}</b>", s["party_name"]),
#         ]
#         if code:    lines.append(_info_line(code_label, code, s))
#         if vat:     lines.append(_info_line("PVM kodas", vat, s))
#         if address: lines.append(_info_line("Adresas", address, s))
#         if phone:   lines.append(_info_line("Tel.", phone, s))
#         if email:   lines.append(_info_line("El. paštas", email, s))
#         if bank:    lines.append(_info_line("Bankas", bank, s))
#         if iban:    lines.append(_info_line("IBAN", iban, s))
#         if swift:   lines.append(_info_line("SWIFT", swift, s))
#         return lines

#     seller = party_block(
#         "PARDAVĖJAS", getattr(inv, "seller_type", "juridinis"),
#         inv.seller_name, inv.seller_id, inv.seller_vat_code,
#         inv.seller_address, inv.seller_phone, inv.seller_email,
#         inv.seller_bank_name, inv.seller_iban, inv.seller_swift,
#     )
#     buyer = party_block(
#         "PIRKĖJAS", getattr(inv, "buyer_type", "juridinis"),
#         inv.buyer_name, inv.buyer_id, inv.buyer_vat_code,
#         inv.buyer_address, inv.buyer_phone, inv.buyer_email,
#         inv.buyer_bank_name, inv.buyer_iban, inv.buyer_swift,
#     )

#     t = Table([[seller, buyer]], colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
#     t.setStyle(TableStyle([
#         ("VALIGN", (0, 0), (-1, -1), "TOP"),
#         ("LEFTPADDING", (0, 0), (-1, -1), 0),
#         ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
#         ("TOPPADDING", (0, 0), (-1, -1), 0),
#         ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
#     ]))

#     return [t, Spacer(1, 30 * mm)]  # ← bigger gap before line items


# def _build_line_items(inv, s):
#     is_pvm = inv.pvm_tipas == "taikoma"
#     currency = inv.currency or "EUR"
#     lines = list(inv.line_items.order_by("sort_order", "id"))

#     has_code = any(li.prekes_kodas for li in lines)
#     has_discount = any((li.discount_wo_vat or 0) > 0 for li in lines)

#     # Более компактные заголовки с кодом валюты
#     price_header = f"Kaina {currency}<br/>be PVM" if is_pvm else f"Kaina {currency}"
#     sum_header = f"Suma {currency}<br/>be PVM" if is_pvm else f"Suma {currency}"

#     headers = [("Nr.", "th", 8 * mm)]
#     headers.append(("Pavadinimas", "th_left", None))
#     if has_code:
#         headers.append(("Kodas", "th_left", None))  # ширину посчитаем динамически
#     headers.append(("Kiekis", "th_right", 12 * mm))
#     headers.append(("Mato<br/>vnt.", "th", 16 * mm))
#     headers.append((price_header, "th_right", 24 * mm))
#     if has_discount:
#         headers.append(("Nuol.", "th_right", 16 * mm))
#     headers.append((sum_header, "th_right", 24 * mm))

#     # Минимальные ширины
#     min_name_w = 42 * mm
#     min_code_w = 26 * mm if has_code else 0

#     fixed_w = sum(h[2] for h in headers if h[2] is not None)
#     flexible_cols = 1 + (1 if has_code else 0)  # Pavadinimas + Kodas
#     remaining_w = CONTENT_W - fixed_w

#     if has_code:
#         # Сначала пробуем дать больше места коду
#         code_w = max(min_code_w, remaining_w * 0.38)
#         name_w = remaining_w - code_w

#         # Если названию слишком мало места, чуть уменьшаем код
#         if name_w < min_name_w:
#             deficit = min_name_w - name_w
#             code_w = max(min_code_w, code_w - deficit)
#             name_w = remaining_w - code_w

#         # Если все еще мало места, ужимаем числовые колонки
#         if name_w < min_name_w:
#             adjusted_headers = []
#             for title, style, width in headers:
#                 if title.startswith("Kaina ") and width is not None:
#                     width = 21 * mm
#                 elif title.startswith("Suma ") and width is not None:
#                     width = 21 * mm
#                 elif title == "Nuol." and width is not None:
#                     width = 14 * mm
#                 elif title == "Kiekis" and width is not None:
#                     width = 11 * mm
#                 adjusted_headers.append((title, style, width))
#             headers = adjusted_headers

#             fixed_w = sum(h[2] for h in headers if h[2] is not None)
#             remaining_w = CONTENT_W - fixed_w
#             code_w = max(min_code_w, remaining_w * 0.38)
#             name_w = remaining_w - code_w
#             if name_w < min_name_w:
#                 code_w = max(22 * mm, remaining_w - min_name_w)
#                 name_w = remaining_w - code_w

#         col_widths = []
#         flex_index = 0
#         for title, style, width in headers:
#             if width is not None:
#                 col_widths.append(width)
#             else:
#                 if flex_index == 0:
#                     col_widths.append(name_w)
#                 else:
#                     col_widths.append(code_w)
#                 flex_index += 1
#     else:
#         name_w = remaining_w
#         col_widths = [h[2] if h[2] is not None else name_w for h in headers]

#     header_row = [Paragraph(h[0], s[h[1]]) for h in headers]
#     data = [header_row]

#     for idx, li in enumerate(lines, 1):
#         qty = _parse_num(li.quantity)
#         price = _parse_num(li.price)
#         discount = _parse_num(li.discount_wo_vat or 0)
#         net = max(Decimal("0"), qty * price - discount)

#         row = [Paragraph(str(idx), s["td_center"])]

#         name_text = li.prekes_pavadinimas or ""
#         if li.prekes_barkodas:
#             name_text += f'<br/><font size="5.5" color="{C_LABEL.hexval()}">Barkodas: {li.prekes_barkodas}</font>'
#         row.append(Paragraph(name_text, s["td"]))

#         if has_code:
#             # Для кода чуть меньший шрифт, чтобы чаще влезал в одну строку
#             row.append(Paragraph(
#                 f'<font size="7.2">{li.prekes_kodas or ""}</font>',
#                 s["td"]
#             ))

#         row.append(Paragraph(_fmt_qty(qty), s["td_right"]))
#         row.append(Paragraph(li.unit or "", s["td_center"]))
#         row.append(Paragraph(_fmt_price(price), s["td_right"]))

#         if has_discount:
#             row.append(Paragraph(_fmt(discount) if discount > 0 else "", s["td_right"]))

#         row.append(Paragraph(f"<b>{_fmt(net)}</b>", s["td_bold"]))
#         data.append(row)

#     t = Table(data, colWidths=col_widths, repeatRows=1, splitByRow=1)
#     style_cmds = [
#         ("BACKGROUND", (0, 0), (-1, 0), C_HEADER_BG),
#         ("TEXTCOLOR", (0, 0), (-1, 0), C_TEXT_LIGHT),
#         ("FONTNAME", (0, 0), (-1, 0), "InvFontBold"),
#         ("FONTSIZE", (0, 0), (-1, 0), 7.5),
#         ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
#         ("LINEBELOW", (0, 0), (-1, 0), 1.2, C_DIVIDER),
#         ("LINEBELOW", (0, 1), (-1, -1), 0.5, C_BORDER),
#         ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
#         ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
#         ("LEFTPADDING", (0, 0), (-1, -1), 1.5 * mm),
#         ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
#     ]

#     for i in range(2, len(data), 2):
#         style_cmds.append(("BACKGROUND", (0, i), (-1, i), C_ROW_ALT))

#     t.setStyle(TableStyle(style_cmds))
#     return [t, Spacer(1, 4 * mm)]


# def _build_totals(inv, s):
#     is_pvm = inv.pvm_tipas == "taikoma"
#     sym = _sym(inv.currency or "EUR")
#     lines = list(inv.line_items.order_by("sort_order", "id"))

#     sum_net = Decimal("0")
#     vat_groups = {}
#     for li in lines:
#         qty = _parse_num(li.quantity)
#         price = _parse_num(li.price)
#         discount = _parse_num(li.discount_wo_vat or 0)
#         net = max(Decimal("0"), qty * price - discount)
#         vat_pct = _parse_num(li.vat_percent) if li.vat_percent is not None else (_parse_num(inv.vat_percent or 21) if is_pvm else Decimal("0"))
#         sum_net += net
#         rate = float(vat_pct)
#         if rate not in vat_groups:
#             vat_groups[rate] = Decimal("0")
#         vat_groups[rate] += net

#     inv_discount = min(_parse_num(inv.invoice_discount_wo_vat or 0), sum_net)
#     base = sum_net - inv_discount

#     breakdown = []
#     for rate in sorted(vat_groups.keys(), reverse=True):
#         group_net = vat_groups[rate]
#         ratio = group_net / sum_net if sum_net > 0 else Decimal("0")
#         discounted = group_net - inv_discount * ratio
#         vat = discounted * Decimal(str(rate)) / 100 if is_pvm else Decimal("0")
#         breakdown.append({
#             "rate": rate,
#             "net": max(Decimal("0"), discounted),
#             "vat": max(Decimal("0"), vat)
#         })

#     vat_total = sum(g["vat"] for g in breakdown)
#     grand = base + vat_total
#     multi_vat = len(breakdown) > 1

#     rows = []
#     if inv_discount > 0:
#         rows.append(("normal", "Tarpinė suma:", f"{_fmt(sum_net)} {sym}"))
#         rows.append(("normal", "Nuolaida:", f"-{_fmt(inv_discount)} {sym}"))

#     if is_pvm:
#         rows.append(("normal", "Suma be PVM:", f"{_fmt(base)} {sym}"))
#         if multi_vat:
#             for g in breakdown:
#                 r = int(g["rate"]) if g["rate"] == int(g["rate"]) else g["rate"]
#                 rows.append(("indent", f"Apmokestinama PVM {r}%:", f"{_fmt(g['net'])} {sym}"))
#             for g in breakdown:
#                 if g["rate"] > 0:
#                     r = int(g["rate"]) if g["rate"] == int(g["rate"]) else g["rate"]
#                     rows.append(("normal", f"PVM {r}%:", f"{_fmt(g['vat'])} {sym}"))
#         else:
#             rate = breakdown[0]["rate"] if breakdown else float(inv.vat_percent or 21)
#             r = int(rate) if rate == int(rate) else rate
#             rows.append(("normal", f"PVM {r}%:", f"{_fmt(vat_total)} {sym}"))
#         rows.append(("grand", "Suma su PVM:", f"{_fmt(grand)} {sym}"))
#     else:
#         rows.append(("grand", "Bendra suma:", f"{_fmt(base)} {sym}"))

#     summary_data = []
#     for row_type, label, value in rows:
#         if row_type == "indent":
#             summary_data.append([
#                 Paragraph(f"&nbsp;&nbsp;&nbsp;{label}", s["total_indent_label"]),
#                 Paragraph(value, s["total_indent_value"])
#             ])
#         elif row_type == "grand":
#             summary_data.append([
#                 Paragraph(f"<b>{label}</b>", s["grand_label"]),
#                 Paragraph(f"<b>{value}</b>", s["grand_value"])
#             ])
#         else:
#             summary_data.append([
#                 Paragraph(label, s["total_label"]),
#                 Paragraph(f"<b>{value}</b>", s["total_value"])
#             ])

#     # Более узкая summary-таблица
#     summary_table = Table(summary_data, colWidths=[42 * mm, 28 * mm])
#     summary_table.setStyle(TableStyle([
#         ("ALIGN", (1, 0), (1, -1), "RIGHT"),
#         ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
#         ("LEFTPADDING", (0, 0), (-1, -1), 0),
#         ("RIGHTPADDING", (0, 0), (-1, -1), 0),
#         ("TOPPADDING", (0, 0), (-1, -1), 0.6 * mm),
#         ("BOTTOMPADDING", (0, 0), (-1, -1), 0.6 * mm),
#         ("LINEABOVE", (0, -1), (-1, -1), 1.5, C_DIVIDER),
#     ]))
#     summary_table.hAlign = "RIGHT"

#     left_parts = []

#     if inv.note:
#         left_parts.append(Paragraph("PASTABA:", s["note_title"]))
#         left_parts.append(Spacer(1, 1 * mm))
#         left_parts.append(Paragraph(inv.note, s["note_text"]))

#     if is_pvm and grand and (inv.currency or "EUR") == "EUR":
#         if left_parts:
#             left_parts.append(Spacer(1, 4 * mm))
#         left_parts.append(Paragraph("SUMA ŽODŽIAIS:", s["note_title"]))
#         left_parts.append(Spacer(1, 1 * mm))
#         left_parts.append(Paragraph(_sum_in_words_lt(grand), s["words"]))

#     if not left_parts:
#         left_parts.append(Spacer(1, 1 * mm))

#     layout = Table(
#         [[left_parts, summary_table]],
#         colWidths=[CONTENT_W - 75 * mm, 70 * mm]
#     )
#     layout.setStyle(TableStyle([
#         ("VALIGN", (0, 0), (-1, -1), "TOP"),
#         ("LEFTPADDING", (0, 0), (-1, -1), 0),
#         ("RIGHTPADDING", (0, 0), (-1, -1), 0),
#         ("TOPPADDING", (0, 0), (-1, -1), 0),
#         ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
#     ]))

#     return [layout, Spacer(1, 6 * mm)]


# def _build_note(inv, s):
#     return []


# def _build_signatures(inv, s):
#     issued_by = getattr(inv, "issued_by", "") or ""
#     received_by = getattr(inv, "received_by", "") or ""

#     value_style = ParagraphStyle(
#         "SigValue",
#         fontName="InvFont",
#         fontSize=8.5,
#         textColor=C_TEXT,
#         leading=12,
#     )

#     left = [
#         Paragraph("SĄSKAITĄ IŠRAŠĖ:", s["note_title"]),
#         Spacer(1, 1 * mm),
#         Paragraph(issued_by, value_style),
#     ]

#     right = [
#         Paragraph("SĄSKAITĄ PRIĖMĖ:", s["note_title"]),
#         Spacer(1, 1 * mm),
#         Paragraph(received_by, value_style),
#     ]

#     t = Table([[left, right]], colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
#     t.setStyle(TableStyle([
#         ("VALIGN", (0, 0), (-1, -1), "TOP"),
#         ("LEFTPADDING", (0, 0), (-1, -1), 0),
#         ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
#         ("TOPPADDING", (0, 0), (-1, -1), 0),
#         ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
#     ]))
#     return [t, Spacer(1, 4 * mm)]


# def _build_footer(inv, s):
#     return []


# # ════════════════════════════════════════════════════════════
# # Main
# # ════════════════════════════════════════════════════════════

# def generate_invoice_pdf(invoice, logo_path=None):
#     _register_fonts()
#     s = _styles()
#     buffer = io.BytesIO()

#     doc = SimpleDocTemplate(
#         buffer,
#         pagesize=A4,
#         topMargin=MARGIN_V,
#         bottomMargin=MARGIN_V + 5 * mm,
#         leftMargin=MARGIN_H,
#         rightMargin=MARGIN_H,
#         title=f"Sąskaita {invoice.document_series}{invoice.document_number}",
#         author=invoice.seller_name or "DokSkenas",
#     )

#     elements = []
#     elements.extend(_build_header(invoice, logo_path, s))
#     elements.extend(_build_parties(invoice, s))
#     elements.extend(_build_line_items(invoice, s))
#     elements.extend(_build_totals(invoice, s))
#     elements.extend(_build_note(invoice, s))
#     elements.extend(_build_signatures(invoice, s))
#     elements.extend(_build_footer(invoice, s))

#     # Build with page number callback — NO custom canvasmaker
#     doc.build(elements, onFirstPage=_add_page_number, onLaterPages=_add_page_number)

#     pdf_bytes = buffer.getvalue()
#     buffer.close()
#     return pdf_bytes


# def save_invoice_pdf(invoice):
#     logo_path = None
#     try:
#         settings = invoice.user.invoice_settings
#         if settings.logo and settings.logo.storage.exists(settings.logo.name):
#             logo_path = settings.logo.path
#     except Exception:
#         pass

#     pdf_bytes = generate_invoice_pdf(invoice, logo_path=logo_path)
#     filename = f"saskaita-{invoice.document_series}{invoice.document_number}.pdf"
#     invoice.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
#     return invoice



