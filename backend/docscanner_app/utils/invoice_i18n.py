"""
DokSkenas — Sąskaitų išrašymas
Vertimai PDF, el. laiškams ir pastaboms (LT / EN / PL / DE).

    from .invoice_i18n import get_lang, tr, doc_title, unit_label
    lang = get_lang(invoice)
    tr(lang, "seller")                     -> "PARDAVĖJAS"
    tr(lang, "vat_rate", rate=21)          -> "PVM 21%"
"""

SUPPORTED_LANGS = ("lt", "en", "pl", "de")
DEFAULT_LANG = "lt"


def get_lang(invoice):
    lang = (getattr(invoice, "language", None) or DEFAULT_LANG).lower()
    return lang if lang in SUPPORTED_LANGS else DEFAULT_LANG


# ════════════════════════════════════════════════════════════
# Dokumentų tipai
# ════════════════════════════════════════════════════════════

DOC_TYPES = {
    "lt": {
        "isankstine": "Išankstinė sąskaita faktūra",
        "pvm_saskaita": "PVM sąskaita faktūra",
        "saskaita": "Sąskaita faktūra",
        "kreditine": "Kreditinė sąskaita faktūra",
    },
    "en": {
        "isankstine": "Proforma invoice",
        "pvm_saskaita": "VAT invoice",
        "saskaita": "Invoice",
        "kreditine": "Credit note",
    },
    "pl": {
        "isankstine": "Faktura proforma",
        "pvm_saskaita": "Faktura VAT",
        "saskaita": "Faktura",
        "kreditine": "Faktura korygująca",
    },
    "de": {
        "isankstine": "Proforma-Rechnung",
        "pvm_saskaita": "Rechnung",
        "saskaita": "Rechnung",
        "kreditine": "Rechnungskorrektur",
    },
}

# Galininkas laiškams ("Siunčiame PVM sąskaitą faktūrą ...")
DOC_TYPES_ACC = {
    "lt": {
        "isankstine": "išankstinę sąskaitą faktūrą",
        "pvm_saskaita": "PVM sąskaitą faktūrą",
        "saskaita": "sąskaitą faktūrą",
        "kreditine": "kreditinę sąskaitą faktūrą",
    },
    "en": {
        "isankstine": "the proforma invoice",
        "pvm_saskaita": "the VAT invoice",
        "saskaita": "the invoice",
        "kreditine": "the credit note",
    },
    "pl": {
        "isankstine": "fakturę proforma",
        "pvm_saskaita": "fakturę VAT",
        "saskaita": "fakturę",
        "kreditine": "fakturę korygującą",
    },
    "de": {
        "isankstine": "die Proforma-Rechnung",
        "pvm_saskaita": "die Rechnung",
        "saskaita": "die Rechnung",
        "kreditine": "die Rechnungskorrektur",
    },
}


def doc_title(lang, invoice_type, upper=False):
    labels = DOC_TYPES.get(lang, DOC_TYPES[DEFAULT_LANG])
    text = labels.get(invoice_type) or labels["saskaita"]
    return text.upper() if upper else text


def doc_title_acc(lang, invoice_type):
    labels = DOC_TYPES_ACC.get(lang, DOC_TYPES_ACC[DEFAULT_LANG])
    return labels.get(invoice_type) or labels["saskaita"]


# ════════════════════════════════════════════════════════════
# Tekstai
# ════════════════════════════════════════════════════════════

TEXTS = {
    "lt": {
        # PDF / peržiūra
        "series_line": "Serija {series} Nr. {number}",
        "date": "Data",
        "due": "Apmokėti iki",
        "order_no": "Užsakymo Nr.",
        "seller": "PARDAVĖJAS",
        "buyer": "PIRKĖJAS",
        "code_company": "Įm. kodas",
        "code_person": "Asmens / ind. veiklos kodas",
        "vat_code": "PVM kodas",
        "address": "Adresas",
        "phone": "Tel.",
        "email": "El. paštas",
        "bank": "Bankas",
        "delivery_address": "Pristatymo adresas",
        "barcode": "Barkodas",
        "th_no": "Nr.",
        "th_name": "Pavadinimas",
        "th_code": "Kodas",
        "th_qty": "Kiekis",
        "th_unit": "Mato vnt.",
        "th_price": "Kaina",
        "th_sum": "Suma",
        "th_wo_vat": "be PVM",
        "th_discount": "Nuol.",
        "th_vat_pct": "PVM %",
        "subtotal": "Tarpinė suma",
        "discount": "Nuolaida",
        "sum_wo_vat": "Suma be PVM",
        "taxable": "Apmokestinama PVM {rate}%",
        "vat_rate": "PVM {rate}%",
        "sum_with_vat": "Suma su PVM",
        "total": "Bendra suma",
        "note": "PASTABA",
        "in_words": "SUMA ŽODŽIAIS",
        "issued_by": "SĄSKAITĄ IŠRAŠĖ",
        "received_by": "SĄSKAITĄ PRIĖMĖ",
        "page": "Puslapis {n}/{total}",
        "generated_with": "Sąskaita sugeneruota su",
        "generated_fallback": "Sąskaita sugeneruota DokSkenas",
        "pdf_title": "Sąskaita",
        "file_prefix": "saskaita",
        # Pastabos
        "note_payment_ref": "Apmokėdami paskirtyje būtinai nurodykite",
        "credit_note_ref": "Kreditinė sąskaita pagal {number}",
        "credit_note_ref_date": " nuo {date}",
        # El. laiškai
        "hello": "Sveiki,",
        "amount": "Suma",
        "due_term": "Apmokėjimo terminas iki",
        "invoice_subject": "Gavote sąskaitą {no} iš {seller}",
        "invoice_text": "Siunčiame sąskaitą Nr. {no} iš {seller}.",
        "paid_status": "Apmokėta",
        "paid_text": "Siunčiame {doc} Nr. {no} iš {seller}, išrašytą po apmokėtos išankstinės sąskaitos.",
        "info_text": "Siunčiame {doc} Nr. {no} iš {seller}.",
        "pdf_attached": "PDF sąskaita prisegta šiame laiške.",
        "no_more_payment": "Papildomo apmokėjimo nereikia.",
        "reminder_last_subject": "Paskutinė diena apmokėti sąskaitą {no}",
        "reminder_last_text": "Pranešame, kad šiandien yra paskutinė diena apmokėti sąskaitą Nr. {no} iš {seller}.",
        "reminder_last_text2": "Prašome atlikti apmokėjimą šiandien.",
        "reminder_subject": "Priminimas apmokėti sąskaitą {no}",
        "reminder_text": "Primename, kad sąskaita Nr. {no} iš {seller} dar neapmokėta.",
        "reminder_title": "Priminimas dėl apmokėjimo",
        "view_and_pay_text": "Sąskaitą galite peržiūrėti ir apmokėti paspaudę žemiau.",
        "overdue_subject": "Turite pradelstą sąskaitą {no}",
        "overdue_title": "Pradelsta sąskaita",
        "overdue_status": "Mokėjimas vėluoja",
        "overdue_text": "Pranešame, kad sąskaitos Nr. {no} iš {seller} apmokėjimo terminas jau yra pasibaigęs.",
        "pay_asap": "Sąskaitą prašome apmokėti kuo greičiau.",
        "manual_status": "Mokėjimas negautas",
        "manual_text": "Primename, kad vis dar negavome apmokėjimo už sąskaitą Nr. {no} iš {seller}.",
        "cancelled_subject": "Sąskaita Nr. {no} atšaukta",
        "cancelled_title": "Sąskaita atšaukta",
        "cancelled_status": "Atšaukta",
        "cancelled_text": "Informuojame, kad sąskaita Nr. {no} iš {seller} yra atšaukta.",
        "cancelled_note": "Prašome šios sąskaitos neapmokėti ir ignoruoti ankstesnius priminimus.",
        "footer_auto": "Tai automatinis pranešimas, prašome į šį laišką neatsakyti.",
        "footer_contact": "Jei turite klausimų, susisiekite su {seller}",
        "seller_fallback": "pardavėju",
        "contact_email": "el. paštu: {v}",
        "contact_phone": "telefonu: {v}",
        "contact_or": " arba ",
        "view_button": "Peržiūrėti sąskaitą",
        "view_pay_button": "Peržiūrėti ir apmokėti sąskaitą",
        "pay_button": "Apmokėti sąskaitą",
    },
    "en": {
        "series_line": "Series {series} No. {number}",
        "date": "Date",
        "due": "Due date",
        "order_no": "Order No.",
        "seller": "SELLER",
        "buyer": "BUYER",
        "code_company": "Company reg. no.",
        "code_person": "Personal / sole trader ID",
        "vat_code": "VAT number",
        "address": "Address",
        "phone": "Phone",
        "email": "Email",
        "bank": "Bank",
        "delivery_address": "Delivery address",
        "barcode": "Barcode",
        "th_no": "No.",
        "th_name": "Description",
        "th_code": "Code",
        "th_qty": "Qty",
        "th_unit": "Unit",
        "th_price": "Price",
        "th_sum": "Amount",
        "th_wo_vat": "excl. VAT",
        "th_discount": "Disc.",
        "th_vat_pct": "VAT %",
        "subtotal": "Subtotal",
        "discount": "Discount",
        "sum_wo_vat": "Total excl. VAT",
        "taxable": "Amount subject to {rate}% VAT",
        "vat_rate": "VAT {rate}%",
        "sum_with_vat": "Total incl. VAT",
        "total": "Total",
        "note": "NOTE",
        "in_words": "AMOUNT IN WORDS",
        "issued_by": "ISSUED BY",
        "received_by": "RECEIVED BY",
        "page": "Page {n}/{total}",
        "generated_with": "Invoice generated with",
        "generated_fallback": "Invoice generated with DokSkenas",
        "pdf_title": "Invoice",
        "file_prefix": "invoice",
        "note_payment_ref": "Please include the following payment reference:",
        "credit_note_ref": "Credit note for invoice {number}",
        "credit_note_ref_date": " dated {date}",
        "hello": "Hello,",
        "amount": "Amount",
        "due_term": "Payment due",
        "invoice_subject": "New invoice {no} from {seller}",
        "invoice_text": "Here is invoice No. {no} from {seller}.",
        "paid_status": "Paid",
        "paid_text": "Here is {doc} No. {no} from {seller}, issued after payment of the proforma invoice.",
        "info_text": "Here is {doc} No. {no} from {seller}.",
        "pdf_attached": "The invoice PDF is attached to this email.",
        "no_more_payment": "No further payment is required.",
        "reminder_last_subject": "Last day to pay invoice {no}",
        "reminder_last_text": "Today is the last day to pay invoice No. {no} from {seller}.",
        "reminder_last_text2": "Please make the payment today.",
        "reminder_subject": "Payment reminder for invoice {no}",
        "reminder_text": "This is a reminder that invoice No. {no} from {seller} has not been paid yet.",
        "reminder_title": "Payment reminder",
        "view_and_pay_text": "You can view and pay the invoice using the button below.",
        "overdue_subject": "Overdue invoice {no}",
        "overdue_title": "Overdue invoice",
        "overdue_status": "Payment overdue",
        "overdue_text": "The payment term for invoice No. {no} from {seller} has expired.",
        "pay_asap": "Please pay the invoice as soon as possible.",
        "manual_status": "Payment not received",
        "manual_text": "We have still not received payment for invoice No. {no} from {seller}.",
        "cancelled_subject": "Invoice No. {no} cancelled",
        "cancelled_title": "Invoice cancelled",
        "cancelled_status": "Cancelled",
        "cancelled_text": "Please note that invoice No. {no} from {seller} has been cancelled.",
        "cancelled_note": "Please do not pay this invoice and disregard any previous reminders.",
        "footer_auto": "This is an automated message. Please do not reply to this email.",
        "footer_contact": "If you have any questions, please contact {seller}",
        "seller_fallback": "the seller",
        "contact_email": "by email: {v}",
        "contact_phone": "by phone: {v}",
        "contact_or": " or ",
        "view_button": "View invoice",
        "view_pay_button": "View and pay invoice",
        "pay_button": "Pay invoice",
    },
    "pl": {
        "series_line": "Seria {series} nr {number}",
        "date": "Data wystawienia",
        "due": "Termin płatności",
        "order_no": "Nr zamówienia",
        "seller": "SPRZEDAWCA",
        "buyer": "NABYWCA",
        "code_company": "Nr identyfikacyjny firmy",
        "code_person": "Nr identyfikacyjny osoby / działalności",
        "vat_code": "Nr VAT",
        "address": "Adres",
        "phone": "Tel.",
        "email": "E-mail",
        "bank": "Bank",
        "delivery_address": "Adres dostawy",
        "barcode": "Kod kreskowy",
        "th_no": "Lp.",
        "th_name": "Nazwa",
        "th_code": "Kod",
        "th_qty": "Ilość",
        "th_unit": "J.m.",
        "th_price": "Cena",
        "th_sum": "Wartość",
        "th_wo_vat": "netto",
        "th_discount": "Rabat",
        "th_vat_pct": "VAT %",
        "subtotal": "Suma częściowa",
        "discount": "Rabat",
        "sum_wo_vat": "Razem netto",
        "taxable": "Podstawa opodatkowania ({rate}% VAT)",
        "vat_rate": "VAT {rate}%",
        "sum_with_vat": "Razem brutto",
        "total": "Razem",
        "note": "UWAGI",
        "in_words": "SŁOWNIE",
        "issued_by": "OSOBA WYSTAWIAJĄCA",
        "received_by": "OSOBA ODBIERAJĄCA",
        "page": "Strona {n}/{total}",
        "generated_with": "Faktura wygenerowana w",
        "generated_fallback": "Faktura wygenerowana w DokSkenas",
        "pdf_title": "Faktura",
        "file_prefix": "faktura",
        "note_payment_ref": "W tytule przelewu prosimy podać",
        "credit_note_ref": "Korekta do faktury {number}",
        "credit_note_ref_date": " z dnia {date}",
        "hello": "Dzień dobry,",
        "amount": "Kwota",
        "due_term": "Termin płatności",
        "invoice_subject": "Nowa faktura {no} — {seller}",
        "invoice_text": "Przesyłamy fakturę nr {no} wystawioną przez firmę {seller}.",
        "paid_status": "Opłacona",
        "paid_text": "Przesyłamy {doc} nr {no} wystawioną przez firmę {seller} po opłaceniu faktury proforma.",
        "info_text": "Przesyłamy {doc} nr {no} wystawioną przez firmę {seller}.",
        "pdf_attached": "Faktura w formacie PDF jest załączona do tej wiadomości.",
        "no_more_payment": "Dodatkowa płatność nie jest wymagana.",
        "reminder_last_subject": "Ostatni dzień na opłacenie faktury {no}",
        "reminder_last_text": "Dziś jest ostatni dzień na opłacenie faktury nr {no} wystawionej przez firmę {seller}.",
        "reminder_last_text2": "Prosimy o dokonanie płatności dzisiaj.",
        "reminder_subject": "Przypomnienie o płatności za fakturę {no}",
        "reminder_text": "Przypominamy, że faktura nr {no} wystawiona przez firmę {seller} nie została jeszcze opłacona.",
        "reminder_title": "Przypomnienie o płatności",
        "view_and_pay_text": "Fakturę można wyświetlić i opłacić za pomocą przycisku poniżej.",
        "overdue_subject": "Zaległa faktura {no}",
        "overdue_title": "Zaległa faktura",
        "overdue_status": "Płatność po terminie",
        "overdue_text": "Termin płatności faktury nr {no} wystawionej przez firmę {seller} już minął.",
        "pay_asap": "Prosimy o jak najszybsze opłacenie faktury.",
        "manual_status": "Nie otrzymano płatności",
        "manual_text": "Przypominamy, że nadal nie otrzymaliśmy płatności za fakturę nr {no} wystawioną przez firmę {seller}.",
        "cancelled_subject": "Faktura nr {no} anulowana",
        "cancelled_title": "Faktura anulowana",
        "cancelled_status": "Anulowana",
        "cancelled_text": "Informujemy, że faktura nr {no} wystawiona przez firmę {seller} została anulowana.",
        "cancelled_note": "Prosimy nie opłacać tej faktury i zignorować wcześniejsze przypomnienia.",
        "footer_auto": "To jest wiadomość automatyczna, prosimy na nią nie odpowiadać.",
        "footer_contact": "W razie pytań prosimy o kontakt z firmą {seller}",
        "seller_fallback": "wystawiającą fakturę",
        "contact_email": "e-mailem na adres {v}",
        "contact_phone": "telefonicznie pod numerem {v}",
        "contact_or": " lub ",
        "view_button": "Zobacz fakturę",
        "view_pay_button": "Zobacz i opłać fakturę",
        "pay_button": "Zapłać fakturę",
    },
    "de": {
        "series_line": "Serie {series} Nr. {number}",
        "date": "Datum",
        "due": "Fällig am",
        "order_no": "Bestellnr.",
        "seller": "VERKÄUFER",
        "buyer": "KÄUFER",
        "code_company": "Registernummer",
        "code_person": "Personen-/Gewerbenummer",
        "vat_code": "USt-IdNr.",
        "address": "Adresse",
        "phone": "Tel.",
        "email": "E-Mail",
        "bank": "Bank",
        "delivery_address": "Lieferadresse",
        "barcode": "Barcode",
        "th_no": "Nr.",
        "th_name": "Bezeichnung",
        "th_code": "Code",
        "th_qty": "Menge",
        "th_unit": "Einheit",
        "th_price": "Preis",
        "th_sum": "Betrag",
        "th_wo_vat": "netto",
        "th_discount": "Rabatt",
        "th_vat_pct": "MwSt. %",
        "subtotal": "Zwischensumme",
        "discount": "Rabatt",
        "sum_wo_vat": "Summe netto",
        "taxable": "Netto zu {rate}% MwSt.",
        "vat_rate": "MwSt. {rate}%",
        "sum_with_vat": "Gesamtbetrag brutto",
        "total": "Gesamtbetrag",
        "note": "ANMERKUNG",
        "in_words": "BETRAG IN WORTEN",
        "issued_by": "AUSGESTELLT VON",
        "received_by": "EMPFANGEN VON",
        "page": "Seite {n}/{total}",
        "generated_with": "Rechnung erstellt mit",
        "generated_fallback": "Rechnung erstellt mit DokSkenas",
        "pdf_title": "Rechnung",
        "file_prefix": "rechnung",
        "note_payment_ref": "Bitte geben Sie bei der Überweisung folgenden Verwendungszweck an:",
        "credit_note_ref": "Korrektur zur Rechnung {number}",
        "credit_note_ref_date": " vom {date}",
        "hello": "Guten Tag,",
        "amount": "Betrag",
        "due_term": "Zahlbar bis",
        "invoice_subject": "Neue Rechnung {no} von {seller}",
        "invoice_text": "Anbei erhalten Sie die Rechnung Nr. {no} von {seller}.",
        "paid_status": "Bezahlt",
        "paid_text": "Anbei erhalten Sie {doc} Nr. {no} von {seller}, ausgestellt nach Zahlung der Proforma-Rechnung.",
        "info_text": "Anbei erhalten Sie {doc} Nr. {no} von {seller}.",
        "pdf_attached": "Die Rechnung im PDF-Format ist dieser E-Mail beigefügt.",
        "no_more_payment": "Eine weitere Zahlung ist nicht erforderlich.",
        "reminder_last_subject": "Letzter Tag zur Zahlung der Rechnung {no}",
        "reminder_last_text": "Heute ist der letzte Tag zur Zahlung der Rechnung Nr. {no} von {seller}.",
        "reminder_last_text2": "Bitte begleichen Sie den Betrag heute.",
        "reminder_subject": "Zahlungserinnerung für Rechnung {no}",
        "reminder_text": "Wir möchten Sie daran erinnern, dass die Rechnung Nr. {no} von {seller} noch nicht bezahlt wurde.",
        "reminder_title": "Zahlungserinnerung",
        "view_and_pay_text": "Sie können die Rechnung über die Schaltfläche unten ansehen und bezahlen.",
        "overdue_subject": "Überfällige Rechnung {no}",
        "overdue_title": "Überfällige Rechnung",
        "overdue_status": "Zahlung überfällig",
        "overdue_text": "Die Zahlungsfrist für die Rechnung Nr. {no} von {seller} ist abgelaufen.",
        "pay_asap": "Bitte begleichen Sie die Rechnung so bald wie möglich.",
        "manual_status": "Zahlung nicht eingegangen",
        "manual_text": "Wir haben bisher keine Zahlung für die Rechnung Nr. {no} von {seller} erhalten.",
        "cancelled_subject": "Rechnung Nr. {no} storniert",
        "cancelled_title": "Rechnung storniert",
        "cancelled_status": "Storniert",
        "cancelled_text": "Wir informieren Sie, dass die Rechnung Nr. {no} von {seller} storniert wurde.",
        "cancelled_note": "Bitte bezahlen Sie diese Rechnung nicht und ignorieren Sie frühere Erinnerungen.",
        "footer_auto": "Dies ist eine automatische Nachricht, bitte antworten Sie nicht auf diese E-Mail.",
        "footer_contact": "Bei Fragen wenden Sie sich bitte an {seller}",
        "seller_fallback": "den Verkäufer",
        "contact_email": "per E-Mail: {v}",
        "contact_phone": "telefonisch: {v}",
        "contact_or": " oder ",
        "view_button": "Rechnung ansehen",
        "view_pay_button": "Rechnung ansehen und bezahlen",
        "pay_button": "Rechnung bezahlen",
    },
}


def tr(lang, key, **kwargs):
    texts = TEXTS.get(lang, TEXTS[DEFAULT_LANG])
    text = texts.get(key) or TEXTS[DEFAULT_LANG].get(key, key)
    return text.format(**kwargs) if kwargs else text


# ════════════════════════════════════════════════════════════
# Matavimo vienetai (tik numatytieji kodai, kiti rodomi kaip įvesti)
# ════════════════════════════════════════════════════════════

UNIT_LABELS = {
    "en": {
        "vnt": "pcs", "pak": "pack", "val": "h", "diena": "day", "dėžė": "box",
        "erdm": "stere", "kompl": "set", "mėn": "month", "pora": "pair", "rul": "roll",
    },
    "pl": {
        "vnt": "szt.", "pak": "opak.", "val": "godz.", "diena": "dzień", "dėžė": "karton",
        "erdm": "mp", "kompl": "kpl.", "mėn": "mies.", "pora": "para", "rul": "rolka",
    },
    "de": {
        "vnt": "Stk.", "pak": "Pck.", "val": "Std.", "diena": "Tag", "dėžė": "Karton",
        "erdm": "Rm", "kompl": "Satz", "mėn": "Monat", "pora": "Paar", "rul": "Rolle",
    },
}


def unit_label(lang, unit):
    if not unit:
        return ""
    return UNIT_LABELS.get(lang, {}).get(unit.strip().lower(), unit)


# ════════════════════════════════════════════════════════════
# Pastabų šablonai
# ════════════════════════════════════════════════════════════

def payment_ref_note(lang, series, number):
    """Tas pats formatas kaip InvoiceEditorPage noteTemplate()."""
    if series and number:
        full = f"{series}-{number}"
    else:
        full = series or number or "___"
    return f"{tr(lang, 'note_payment_ref')} {full}"


def credit_note_text(lang, original_number, original_date=None):
    text = tr(lang, "credit_note_ref", number=original_number)
    if original_date:
        text += tr(lang, "credit_note_ref_date", date=original_date)
    return text
