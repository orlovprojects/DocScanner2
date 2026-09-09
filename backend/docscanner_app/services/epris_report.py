"""EPRIS preparation rules and editable defaults derived from invoice data."""
import calendar
import csv
import io
import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import PurePosixPath

from .epris_codes import EU_NO_LT, country_currency, validate_document

CENT = Decimal("0.01")
ATTACHMENT_LIMIT = 5_000_000
ALLOWED_ATTACHMENTS = {".pdf", ".jpg", ".jpeg", ".tif", ".tiff"}
CONVERTIBLE_ATTACHMENTS = {".png", ".webp", ".bmp"}


def money(value):
    try:
        result = Decimal(str(value).replace(",", "."))
        if not result.is_finite():
            raise ValueError("Neteisinga suma")
        return result.quantize(CENT)
    except (InvalidOperation, TypeError):
        raise ValueError("Neteisinga suma")


def company_key(name, vat, code):
    # Same precedence and keys as OSS. Variants must be explicitly selected.
    if (code or "").strip():
        return f"id:{code.strip()}"
    return ((vat or "").strip() or (name or "").strip()).lower()


def direction(doc, keys):
    buyer = company_key(doc.buyer_name, doc.buyer_vat_code, doc.buyer_id) in keys
    seller = company_key(doc.seller_name, doc.seller_vat_code, doc.seller_id) in keys
    return "ambiguous" if buyer and seller else "pirkimas" if buyer else "pardavimas" if seller else "unmatched"


def automatic_country(doc):
    prefix = (doc.seller_vat_code or "").strip().upper()[:2]
    prefix = "GR" if prefix == "EL" else prefix
    return prefix if prefix in EU_NO_LT | {"LT"} else (doc.seller_country_iso or "").strip().upper()


def refund_country(doc):
    return (doc.epris_details or {}).get("refund_country") or automatic_country(doc)


def period_info(start, end, remainder=False, today=None):
    today = today or date.today()
    try:
        start, end = date.fromisoformat(start), date.fromisoformat(end)
    except (ValueError, TypeError):
        raise ValueError("Nurodykite galiojančias laikotarpio datas")
    if start > end or start.year != end.year or start.year < 2009:
        raise ValueError("Laikotarpis turi priklausyti vieniems kalendoriniams metams")
    if start.day != 1 or end.day != calendar.monthrange(end.year, end.month)[1]:
        raise ValueError("Pasirinkite pilnus kalendorinius mėnesius")
    if remainder and (end.month != 12 or start.month == 1):
        raise ValueError("Metų likutis turi baigtis gruodžio 31 d.")
    if end.month - start.month + 1 < 3 and not remainder:
        raise ValueError("Trumpesnis nei 3 mėn. laikotarpis galimas tik metų likučiui")
    threshold = Decimal("50") if remainder or (start.month == 1 and end.month == 12) else Decimal("400")
    errors = []
    if end >= today:
        errors.append("Laikotarpis dar nepasibaigęs")
    deadline = date(end.year + 1, 9, 30)
    # Downloading a preparation file is allowed after the portal submission deadline.
    return {"threshold": str(threshold), "period_errors": errors,
            "deadline": deadline.isoformat(), "deadline_passed": today > deadline}


def claim_values(doc):
    details = doc.epris_details or {}
    rate = details.get("prorata_rate") or "100.00"
    deduction_percent = details.get("deduction_percent") or rate
    deductible = details.get("deductible_vat")
    if deductible in (None, ""):
        deductible = str(money(money(doc.vat_amount or 0) * money(deduction_percent) / 100))
    elif money(doc.vat_amount or 0) > 0:
        try:
            deduction_percent = str(money(money(deductible) / money(doc.vat_amount) * 100))
        except ValueError:
            pass  # review_errors reports malformed saved amounts instead of hiding the list.
    return {
        "refund_country": refund_country(doc),
        "currency": (doc.currency or "").strip().upper(),
        "taxable_amount": str(money(doc.amount_wo_vat or 0)),
        "vat_amount": str(money(doc.vat_amount or 0)),
        "deductible_vat": deductible,
        "prorata_rate": rate,
        "deduction_percent": deduction_percent,
        "simplified_invoice": details.get("simplified_invoice", False),
    }


def review_errors(doc):
    c = claim_values(doc)
    errors = validate_document(c["refund_country"], doc.epris_codes or [])
    if c["refund_country"] not in EU_NO_LT:
        errors.append("PVM grąžinimo šalis turi būti kita ES valstybė")
    if not doc.invoice_date:
        errors.append("Nenurodyta sąskaitos data")
    if not (doc.document_number or "").strip():
        errors.append("Nenurodytas sąskaitos numeris")
    if not (doc.seller_name or "").strip() or not (doc.seller_address or "").strip():
        errors.append("Trūksta tiekėjo pavadinimo arba pilno adreso")
    if len(doc.seller_name or "") > 200 or len(doc.seller_address or "") > 200:
        errors.append("Tiekėjo pavadinimas ir adresas turi tilpti į 200 simbolių")
    if len((doc.seller_country_iso or "").strip()) != 2:
        errors.append("Nenurodytas dviejų raidžių tiekėjo adreso šalies kodas")
    vat = (doc.seller_vat_code or "").replace(" ", "").upper()
    if not vat and not c["simplified_invoice"]:
        errors.append("Trūksta tiekėjo PVM kodo")
    if vat[:2].isalpha() and ("GR" if vat[:2] == "EL" else vat[:2]) != c["refund_country"]:
        errors.append("Tiekėjo PVM kodas neatitinka grąžinimo šalies")
    if c["currency"] != country_currency(c["refund_country"], doc.invoice_date):
        errors.append("Sąskaitos sumos turi būti grąžinančios šalies valiuta; patikslinkite dokumentą")
    if doc.doc_96_str:
        errors.append("Atvirkštinis apmokestinimas – šis PVM negrąžinamas per EPRIS")
    if doc.is_credit_invoice or money(doc.vat_amount or 0) <= 0 or money(doc.amount_wo_vat or 0) <= 0:
        errors.append("Kreditinę / neigiamą sąskaitą reikia įvertinti kaip prašymo koregavimą")
    if getattr(doc, "math_validation_passed", None) is False:
        errors.append("Dokumento sumų patikra nepraeita")
    try:
        deductible, rate = money(c["deductible_vat"]), money(c["prorata_rate"])
        maximum = (money(c["vat_amount"]) * rate / 100).quantize(CENT)
        if not 0 < rate <= 100 or not 0 < deductible <= maximum:
            raise ValueError()
        if rate != rate.to_integral_value():
            errors.append("Veiklos atskaitos koeficientas turi būti sveikasis procentas (1–100)")
    except ValueError:
        errors.append("Nurodykite grąžintiną PVM, neviršijantį PVM × atskaitos procento (0–100)")
    return errors


PURCHASE_HEADER = [
    "PARENT_ID", "VI_SEQUENCENUMBER", "VI_SIMPLIFIEDINVOICE", "VI_REFERENCENUMBER",
    "VI_ISSUINGDATE", "VT_NAMEFREE", "VT_ADDRESSFREE", "VT_COUNTRYCODE",
    "VT_TELEPHONENUMBER", "VT_VATIDENTIFICATIONNUMB", "VT_ISSUEDBY_VATI",
    "VT_TAXREFERENCENUMBER", "VT_ISSUEDBY_REP", "VI_CURRENCY_TAX", "VI_TAXABLEAMOUNT",
    "VI_CURRENCY_VAT", "VI_VATAMOUNT", "VI_DEDUCTIBLEVATAMOUNT", "VI_CURRENCY_DVAT", "VI_PRORATARATE",
]
GOODS_HEADER = ["PARENT_ID", "VG_CODE", "VG_SUBCODE", "VG_LANGUAGE", "VG_FREETEXT"]


def purchase_csv(docs):
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    num = lambda v: str(money(v)).replace(".", ",")
    writer.writerow(["PurchaseInformation"])
    writer.writerow(PURCHASE_HEADER)
    for i, doc in enumerate(docs, 1):
        c = claim_values(doc)
        vat = (doc.seller_vat_code or "").replace(" ", "").upper()
        prefix = c["refund_country"]
        if vat[:2].isalpha():
            vat = vat[2:]
        writer.writerow([
            i, 500000 + i, str(c["simplified_invoice"]).lower(),
            f"{(doc.document_series or '').strip()}{(doc.document_number or '').strip()}",
            doc.invoice_date.isoformat(), doc.seller_name, doc.seller_address,
            doc.seller_country_iso.strip().upper(), "", vat, prefix if vat else "", "", "",
            c["currency"], num(c["taxable_amount"]), c["currency"], num(c["vat_amount"]),
            num(c["deductible_vat"]), c["currency"], "" if money(c["prorata_rate"]) == 100 else str(int(money(c["prorata_rate"]))),
        ])
    writer.writerow([])
    writer.writerow(["PurchaseInformation_GoodsDescription"])
    writer.writerow(GOODS_HEADER)
    for i, doc in enumerate(docs, 1):
        for row in doc.epris_codes or []:
            writer.writerow([i, row["code"], row.get("subcode", ""), row.get("language", ""), row.get("free_text", "")])
    return buf.getvalue().encode("utf-8")


def attachment_name(doc, sequence):
    # Unique flat names, no user-controlled paths. Same sequence as the CSV.
    ext = PurePosixPath(doc.file.name.replace("\\", "/")).suffix.lower()
    if ext in CONVERTIBLE_ATTACHMENTS:
        ext = ".pdf"
    number = f"{(doc.document_series or '').strip()}{(doc.document_number or '').strip()}"
    number = unicodedata.normalize("NFKD", number).encode("ascii", "ignore").decode("ascii")
    number = re.sub(r"[^A-Za-z0-9_-]+", "_", number)[:100].strip("_-") or "saskaita"
    return f"{500000 + sequence}_{number}{ext}" if ext in ALLOWED_ATTACHMENTS else None


def attachment_content(doc):
    from PIL import Image, UnidentifiedImageError

    try:
        with doc.file.open("rb") as source:
            content = source.read(ATTACHMENT_LIMIT + 1)
        if len(content) > ATTACHMENT_LIMIT:
            raise ValueError("Sąskaitos kopija viršija 5 MB; sumažinkite failą")
        ext = PurePosixPath(doc.file.name.replace("\\", "/")).suffix.lower()
        if ext in CONVERTIBLE_ATTACHMENTS:
            with Image.open(io.BytesIO(content)) as image:
                if image.width * image.height > 25_000_000:
                    raise ValueError("Vaizdas per didelis PDF paruošimui; sumažinkite raišką")
                if getattr(image, "n_frames", 1) != 1:
                    raise ValueError("Kelių kadrų vaizdą paruoškite kaip PDF")
                rgba = image.convert("RGBA")
                page = Image.new("RGB", rgba.size, "white")
                page.paste(rgba, mask=rgba.getchannel("A"))
                out = io.BytesIO()
                page.save(out, "PDF", resolution=150.0, quality=95)
                content = out.getvalue()
        return content
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("Nepavyko perskaityti ar paruošti sąskaitos kopijos") from exc


def duplicate_key(doc):
    number = f"{doc.document_series or ''}{doc.document_number or ''}".strip().casefold()
    supplier = company_key(doc.seller_name, doc.seller_vat_code, doc.seller_id)
    return (supplier, number, doc.invoice_date, doc.currency, money(doc.vat_amount or 0)) if number else (doc.id,)
