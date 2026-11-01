// ═══════════════════════════════════════════════════════════
// Sąskaitų vertimai (LT / EN / PL / DE) — tie patys kaip backend utils/invoice_i18n.py
// ═══════════════════════════════════════════════════════════

export const INVOICE_LANGUAGES = [
  { value: 'lt', label: 'Lietuvių' },
  { value: 'en', label: 'Anglų' },
  { value: 'pl', label: 'Lenkų' },
  { value: 'de', label: 'Vokiečių' },
];

const DEFAULT_LANG = 'lt';

export const getInvoiceLang = (inv) => {
  const lang = String(inv?.language || DEFAULT_LANG).toLowerCase();
  return TEXTS[lang] ? lang : DEFAULT_LANG;
};

const DOC_TYPES = {
  'lt': {
    'isankstine': 'Išankstinė sąskaita faktūra',
    'pvm_saskaita': 'PVM sąskaita faktūra',
    'saskaita': 'Sąskaita faktūra',
    'kreditine': 'Kreditinė sąskaita faktūra'
  },
  'en': {
    'isankstine': 'Proforma invoice',
    'pvm_saskaita': 'VAT invoice',
    'saskaita': 'Invoice',
    'kreditine': 'Credit note'
  },
  'pl': {
    'isankstine': 'Faktura proforma',
    'pvm_saskaita': 'Faktura VAT',
    'saskaita': 'Faktura',
    'kreditine': 'Faktura korygująca'
  },
  'de': {
    'isankstine': 'Proforma-Rechnung',
    'pvm_saskaita': 'Rechnung',
    'saskaita': 'Rechnung',
    'kreditine': 'Rechnungskorrektur'
  }
};

const TEXTS = {
  'lt': {
    'series_line': 'Serija {series} Nr. {number}',
    'date': 'Data',
    'due': 'Apmokėti iki',
    'order_no': 'Užsakymo Nr.',
    'seller': 'PARDAVĖJAS',
    'buyer': 'PIRKĖJAS',
    'code_company': 'Įm. kodas',
    'code_person': 'Asmens / ind. veiklos kodas',
    'vat_code': 'PVM kodas',
    'address': 'Adresas',
    'phone': 'Tel.',
    'email': 'El. paštas',
    'bank': 'Bankas',
    'delivery_address': 'Pristatymo adresas',
    'barcode': 'Barkodas',
    'th_no': 'Nr.',
    'th_name': 'Pavadinimas',
    'th_code': 'Kodas',
    'th_qty': 'Kiekis',
    'th_unit': 'Mato vnt.',
    'th_price': 'Kaina',
    'th_sum': 'Suma',
    'th_wo_vat': 'be PVM',
    'th_discount': 'Nuol.',
    'th_vat_pct': 'PVM %',
    'subtotal': 'Tarpinė suma',
    'discount': 'Nuolaida',
    'sum_wo_vat': 'Suma be PVM',
    'taxable': 'Apmokestinama PVM {rate}%',
    'vat_rate': 'PVM {rate}%',
    'sum_with_vat': 'Suma su PVM',
    'total': 'Bendra suma',
    'note': 'PASTABA',
    'in_words': 'SUMA ŽODŽIAIS',
    'issued_by': 'SĄSKAITĄ IŠRAŠĖ',
    'received_by': 'SĄSKAITĄ PRIĖMĖ',
    'page': 'Puslapis {n}/{total}',
    'generated_with': 'Sąskaita sugeneruota su',
    'note_payment_ref': 'Apmokėdami paskirtyje būtinai nurodykite'
  },
  'en': {
    'series_line': 'Series {series} No. {number}',
    'date': 'Date',
    'due': 'Due date',
    'order_no': 'Order No.',
    'seller': 'SELLER',
    'buyer': 'BUYER',
    'code_company': 'Company reg. no.',
    'code_person': 'Personal / sole trader ID',
    'vat_code': 'VAT number',
    'address': 'Address',
    'phone': 'Phone',
    'email': 'Email',
    'bank': 'Bank',
    'delivery_address': 'Delivery address',
    'barcode': 'Barcode',
    'th_no': 'No.',
    'th_name': 'Description',
    'th_code': 'Code',
    'th_qty': 'Qty',
    'th_unit': 'Unit',
    'th_price': 'Price',
    'th_sum': 'Amount',
    'th_wo_vat': 'excl. VAT',
    'th_discount': 'Disc.',
    'th_vat_pct': 'VAT %',
    'subtotal': 'Subtotal',
    'discount': 'Discount',
    'sum_wo_vat': 'Total excl. VAT',
    'taxable': 'Amount subject to {rate}% VAT',
    'vat_rate': 'VAT {rate}%',
    'sum_with_vat': 'Total incl. VAT',
    'total': 'Total',
    'note': 'NOTE',
    'in_words': 'AMOUNT IN WORDS',
    'issued_by': 'ISSUED BY',
    'received_by': 'RECEIVED BY',
    'page': 'Page {n}/{total}',
    'generated_with': 'Invoice generated with',
    'note_payment_ref': 'Please include the following payment reference:'
  },
  'pl': {
    'series_line': 'Seria {series} nr {number}',
    'date': 'Data wystawienia',
    'due': 'Termin płatności',
    'order_no': 'Nr zamówienia',
    'seller': 'SPRZEDAWCA',
    'buyer': 'NABYWCA',
    'code_company': 'Nr identyfikacyjny firmy',
    'code_person': 'Nr identyfikacyjny osoby / działalności',
    'vat_code': 'Nr VAT',
    'address': 'Adres',
    'phone': 'Tel.',
    'email': 'E-mail',
    'bank': 'Bank',
    'delivery_address': 'Adres dostawy',
    'barcode': 'Kod kreskowy',
    'th_no': 'Lp.',
    'th_name': 'Nazwa',
    'th_code': 'Kod',
    'th_qty': 'Ilość',
    'th_unit': 'J.m.',
    'th_price': 'Cena',
    'th_sum': 'Wartość',
    'th_wo_vat': 'netto',
    'th_discount': 'Rabat',
    'th_vat_pct': 'VAT %',
    'subtotal': 'Suma częściowa',
    'discount': 'Rabat',
    'sum_wo_vat': 'Razem netto',
    'taxable': 'Podstawa opodatkowania ({rate}% VAT)',
    'vat_rate': 'VAT {rate}%',
    'sum_with_vat': 'Razem brutto',
    'total': 'Razem',
    'note': 'UWAGI',
    'in_words': 'SŁOWNIE',
    'issued_by': 'OSOBA WYSTAWIAJĄCA',
    'received_by': 'OSOBA ODBIERAJĄCA',
    'page': 'Strona {n}/{total}',
    'generated_with': 'Faktura wygenerowana w',
    'note_payment_ref': 'W tytule przelewu prosimy podać'
  },
  'de': {
    'series_line': 'Serie {series} Nr. {number}',
    'date': 'Datum',
    'due': 'Fällig am',
    'order_no': 'Bestellnr.',
    'seller': 'VERKÄUFER',
    'buyer': 'KÄUFER',
    'code_company': 'Registernummer',
    'code_person': 'Personen-/Gewerbenummer',
    'vat_code': 'USt-IdNr.',
    'address': 'Adresse',
    'phone': 'Tel.',
    'email': 'E-Mail',
    'bank': 'Bank',
    'delivery_address': 'Lieferadresse',
    'barcode': 'Barcode',
    'th_no': 'Nr.',
    'th_name': 'Bezeichnung',
    'th_code': 'Code',
    'th_qty': 'Menge',
    'th_unit': 'Einheit',
    'th_price': 'Preis',
    'th_sum': 'Betrag',
    'th_wo_vat': 'netto',
    'th_discount': 'Rabatt',
    'th_vat_pct': 'MwSt. %',
    'subtotal': 'Zwischensumme',
    'discount': 'Rabatt',
    'sum_wo_vat': 'Summe netto',
    'taxable': 'Netto zu {rate}% MwSt.',
    'vat_rate': 'MwSt. {rate}%',
    'sum_with_vat': 'Gesamtbetrag brutto',
    'total': 'Gesamtbetrag',
    'note': 'ANMERKUNG',
    'in_words': 'BETRAG IN WORTEN',
    'issued_by': 'AUSGESTELLT VON',
    'received_by': 'EMPFANGEN VON',
    'page': 'Seite {n}/{total}',
    'generated_with': 'Rechnung erstellt mit',
    'note_payment_ref': 'Bitte geben Sie bei der Überweisung folgenden Verwendungszweck an:'
  }
};

const UNIT_LABELS = {
  'en': {
    'vnt': 'pcs',
    'pak': 'pack',
    'val': 'h',
    'diena': 'day',
    'dėžė': 'box',
    'erdm': 'stere',
    'kompl': 'set',
    'mėn': 'month',
    'pora': 'pair',
    'rul': 'roll'
  },
  'pl': {
    'vnt': 'szt.',
    'pak': 'opak.',
    'val': 'godz.',
    'diena': 'dzień',
    'dėžė': 'karton',
    'erdm': 'mp',
    'kompl': 'kpl.',
    'mėn': 'mies.',
    'pora': 'para',
    'rul': 'rolka'
  },
  'de': {
    'vnt': 'Stk.',
    'pak': 'Pck.',
    'val': 'Std.',
    'diena': 'Tag',
    'dėžė': 'Karton',
    'erdm': 'Rm',
    'kompl': 'Satz',
    'mėn': 'Monat',
    'pora': 'Paar',
    'rul': 'Rolle'
  }
};

// tr('en', 'vat_rate', { rate: 21 }) -> 'VAT 21%'
export const tr = (lang, key, params) => {
  const text = TEXTS[lang]?.[key] ?? TEXTS[DEFAULT_LANG][key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
};

export const docTitle = (lang, invoiceType, upper = false) => {
  const labels = DOC_TYPES[lang] || DOC_TYPES[DEFAULT_LANG];
  const text = labels[invoiceType] || labels.saskaita;
  return upper ? text.toUpperCase() : text;
};

export const unitLabel = (lang, unit) => {
  if (!unit) return '';
  return UNIT_LABELS[lang]?.[String(unit).trim().toLowerCase()] ?? unit;
};

// Tas pats formatas kaip backend payment_ref_note()
export const paymentRefNote = (lang, series, number) => {
  const full = series && number ? `${series}-${number}` : (series || number || '___');
  return `${tr(lang, 'note_payment_ref')} ${full}`;
};
