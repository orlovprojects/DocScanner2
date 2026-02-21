import os
import time
import logging
import openai  # для совместимого RateLimitError
from dotenv import load_dotenv
from google import genai
from google.genai import types  # для HttpOptions(timeout=...)

# Попытка импортировать типовые исключения rate limit от Google SDK (если доступно)
try:
    from google.api_core.exceptions import ResourceExhausted, TooManyRequests
    GEMINI_RATE_EXCS = (ResourceExhausted, TooManyRequests)
except Exception:
    GEMINI_RATE_EXCS = tuple()

load_dotenv()
LOGGER = logging.getLogger("docscanner_app")

# =========================
# 1) КЛИЕНТ GEMINI c таймаутом
# =========================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("Не найден GEMINI_API_KEY в переменных окружения.")

# таймаут по умолчанию 300 секунд (5 минут); для нового SDK — в миллисекундах
GEMINI_TIMEOUT_SECONDS = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "300"))
GEMINI_TIMEOUT_MS = int(GEMINI_TIMEOUT_SECONDS * 1000)

gemini_client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS)  # глобальный таймаут
)


# =========================
# 2) ПРОМПТЫ ДЛЯ GEMINI
# =========================

GEMINI_DEFAULT_PROMPT = """You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

1. First, analyze the text and determine **how many separate documents** are present. Return this number as an integer in the field "docs".

2. For each document, determine its type. The possible document types (Galimi tipai) are:
- PVM sąskaita faktūra
- Sąskaita faktūra
- Kreditinė sąskaita faktūra
- Debetinė sąskaita faktūra
- Išankstinė sąskaita faktūra
- Kasos čekis
- ES PVM sąskaita faktūra
- ES sąskaita faktūra
- Užsienietiška sąskaita faktūra
- Kitas

Assign the detected type to the field "document_type".

3. For each document, extract the following fields (leave empty if not found):
- seller_id
- seller_name
- seller_vat_code
- seller_address
- seller_country
- seller_country_iso
- seller_iban
- seller_is_person
- buyer_id
- buyer_name
- buyer_vat_code
- buyer_address
- buyer_country
- buyer_country_iso
- buyer_iban
- buyer_is_person
- invoice_date
- due_date
- operation_date
- document_series
- document_number
- order_number
- amount_wo_vat
- vat_amount
- vat_percent
- amount_with_vat
- separate_vat
- currency
- with_receipt
- paid_by_cash
- doc_96_str

All boolean fields (seller_is_person, buyer_is_person, with_receipt, separate_vat, paid_by_cash, doc_96_str) must be returned as true/false, not as strings.

*Return ONLY a valid JSON object in a SINGLE LINE (compact form): no newlines, no \n, no \r, no tabs, and no spaces outside string values. Do not use Markdown or code fences. No trailing commas. Do NOT wrap in quotes or escape characters. Do NOT include any explanations, comments, or extra text outside the JSON. The output must be directly parsable by JSON.parse().

Example (structure and field names; values may be empty strings, booleans must be true/false, numbers should be numbers when available):
{"docs":<number_of_documents>,"documents":[{"document_type":"","seller_id":"","seller_name":"","seller_vat_code":"","seller_address":"","seller_country":"","seller_country_iso":"","seller_iban":"","seller_is_person":false,"buyer_id":"","buyer_name":"","buyer_vat_code":"","buyer_address":"","buyer_country":"","buyer_country_iso":"","buyer_iban":"","buyer_is_person":false,"invoice_date":"","due_date":"","operation_date":"","document_series":"","document_number":"","order_number":"","amount_wo_vat":"","vat_amount":"","vat_percent":"","amount_with_vat":"","separate_vat":false,"currency":"","with_receipt":false,"paid_by_cash":false}]}

Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code.
In lithuanian documents dates are usually displayed in yyyy-mm-dd or dd/mm/yyyy formats. For example, when parsing 12/01/2026, it's 12th January, not 1st December.
When identifying buyer/seller:
- Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
- Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
- "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
- Don't rely on position (left/right/top/bottom) when labels are available
- When no pirkejas/pardavejas/tiekejas labels and can not identify sides by other criteria, check a footer. Seller is usually mentioned in a footer.

When extracting company codes and VAT codes:
- "Įm. kodas" or "Įmonės kodas" → this is company registration code → put in seller_id / buyer_id (usually 9-digit code)
- "PVM kodas" or "PVM mokėtojo kodas" → this is VAT code → put in seller_vat_code / buyer_vat_code (usually starts with country prefix like "LT" + 9-12 digits)
- Buyer and seller must not be identical by default; if buyer_id == seller_id or buyer_vat_code == seller_vat_code, re-scan for a second party block (Seller: Pardavėjas/Tiekėjas/Išrašė/Seller/Supplier; Buyer: Pirkėjas/Gavėjas/Užsakovas/Buyer/Customer) and only allow identical parties if self-billing/self-invoicing is explicitly stated.

If the buyer/seller block contains indicators of Lithuanian “individuali veikla” (e.g., “individuali veikla”, “pagal individualios veiklos pažymą”, “IV/IDV”, “Individualios veiklos Nr.” / “IV pažymos Nr.”), then set buyer_is_person=true / seller_is_person=true.

If due_date is not stated in the document, but invoice date and payment terms like number of days for payment are mentioned, calculate the due date by adding the payment period to the invoice date.
Set "separate_vat": true ONLY when the document has 2 or more different VAT rates, AND each rate's taxable base > 0. A 0% VAT rate counts if its taxable base > 0, even though VAT amount = 0 (e.g., 21% on 100 EUR + 0% on 50 EUR = separate_vat: true).
To decide this, you MUST check line items and VAT summary - if lines have different vat_percent (e.g., some 0%, some 21%) with subtotal > 0, set separate_vat: true.
When separate_vat is true, omit document-level "vat_percent" (do NOT put a single rate like "21").



Set "doc_96_str": true only if the document explicitly mentions Lietuvos PVM įstatymo 96 straipsnis, e.g. “PVM įstatymo 96 straipsnis”, “96 straipsnis”, “96 str.”, “taikomas 96 straipsnis”, “pagal PVMĮ 96 str.”. Otherwise set "doc_96_str": false.

If there are any signs of cash payment, for example, 'gryni', 'grąža' or similar, return paid_by_cash as True.

If the document is a kasos čekis (cash receipt), for example, a fuel (kuro) receipt, buyer info is often at the bottom as a line with company name, company code, and VAT code—extract these as buyer details. For line items, find the quantity and unit next to price (like “50,01 l” for litres). Product name is usually above this line. document_number is usually next to kvitas, ignore long numer below "kasininkas" at the bottom of document but don't ignore date at the bottom.
Extract all lineitems in kuro cekis, if item has units, it must be extracted as lineitem. For lineitems in kuro cekis, prices are usually stated including VAT, while discounts are usually including VAT but with minus symbol (don't extract discounts them as separate lineitems).

If you cannot extract any documents, return exactly (one line):
{"docs":0,"documents":[]}

If you identified more than 1 document, return only the count (one line):
{"docs":<number_of_documents>,"documents":[]}

If you are very confident the document type is one of: Kreditinė sąskaita, Debetinė sąskaita, Išankstinė sąskaita, Pavedimo kopija, Delivery note / Važtaraštis / Packing slip (or closely related forms), then return ONLY this one-line JSON:
{"docs":1,"netinkamas_dokumentas": true,"documents":[]}

Make sure you don't consider receipt or payment confirmation as a separate document. Invoice can come with receipt if it's been paid already.
"""




GEMINI_DETAILED_PROMPT = """
You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

1. First, analyze the text and determine **how many separate documents** are present. Return this number as an integer in the field "docs". Then, count the total number of line items (products/services) in the document and return this number as an integer in the field total_lines.

3. For each document, determine its type. The possible document types (Galimi tipai) are:
- PVM sąskaita faktūra
- Sąskaita faktūra
- Kreditinė sąskaita faktūra
- Debetinė sąskaita faktūra
- Išankstinė sąskaita faktūra
- Kasos čekis
- ES PVM sąskaita faktūra
- ES sąskaita faktūra
- Užsienietiška sąskaita faktūra
- Pavedimo kopija
- Receipt
- Kitas

Assign the detected type to the field "document_type".

4. For each document, extract the following fields (leave empty if not found):
- seller_id
- seller_name
- seller_vat_code
- seller_address
- seller_country
- seller_country_iso
- seller_iban
- seller_is_person
- buyer_id
- buyer_name
- buyer_vat_code
- buyer_address
- buyer_country
- buyer_country_iso
- buyer_iban
- buyer_is_person
- invoice_date
- due_date
- operation_date
- document_series
- document_number
- order_number
- amount_wo_vat
- invoice_discount_wo_vat
- invoice_discount_with_vat
- vat_amount
- vat_percent
- amount_with_vat
- separate_vat
- currency
- with_receipt
- paid_by_cash
- doc_96_str

All boolean fields (seller_is_person, buyer_is_person, with_receipt, separate_vat, paid_by_cash, doc_96_str) must be returned as true/false, not as strings.
If there are any signs of cash payment, for example, 'gryni', 'grąža' or similar, return paid_by_cash as True.

5. For each document, also extract an array of line items (products or services) if present. For each line item, extract the following fields (leave empty if not found):

- line_id
- type
- product_code
- product_barcode
- product_name
- unit
- quantity
- price
- subtotal
- discount without VAT (discount_wo_vat)
- vat
- vat_percent
- discount with VAT (discount_with_vat)
- total
- preke_paslauga (if lineitem is product, return preke; if lineitem is service, return paslauga)

**IMPORTANT:**
- Each document must have a "line_items" field containing an array of line items (may be empty if not found).

- Firstly, properly identify how many lineitems (products/services/fees/shipping, etc) exist in the document. Don't count document's subtotal, vat, total lines as lineitems. If product/service is mentioned with zero subtotal, vat and total for example free shipping, don't include it as lineitem. But shipping fee if it's > 0, it must be added as lineitem and counted towards total_lines.

LINE ITEMS RULE (STRICT):
- First COUNT the real total number of billable line items in the document and return it as integer "total_lines" at ROOT level.
- Then OUTPUT only the FIRST 20 line items in "line_items". Never output more than 20.
- If total_lines > 20: set root "truncated_json": true and line_items must contain exactly 20 items.
- If total_lines <= 20: omit "truncated_json" (or set false) and line_items must contain exactly total_lines items.

- If a discount (“nuolaida”) is present for any line item, first determine whether the discount amount is stated with VAT (“su PVM”) or without VAT (“be PVM”).
    Extract the discount amount and assign it to the corresponding line item.
    If the discount includes VAT, return it in the “discount_with_vat” field; if it excludes VAT, return it in the “discount_wo_vat” field.
    If there is a line item with negative amount and you can not assign it as a discount of another line item, add a separate line item with negative amounts for it.
    If document contains a clear document-level discount that applies to whole document, add it as invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat).
    Invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat) must be used only as a last resort, and only when the discount clearly exists but cannot be logically linked to any specific product or service. Never apply the same discount to a few places, for example, corresponding line item discount, separate line item with negative amounts, invoice-level discount. 

- For lineitems, always try to take price after discount (without VAT) if such price is provided in the document. Use up to 4 decimal places for prices if needed. Do not round numbers.

- If document includes any fees (such as shipping, transaction, payment processing, etc.), each fee (if it's value >0) must be extracted as a separate line item.

- Do not mix up fees, discounts, or credits with VAT. VAT must be extracted only if it is explicitly and clearly stated with '%' in the document.

- If document doesn't have obvious line items but has a table or list of payments/transactions, use them as line items.

- Do **NOT** treat “Subtotal”, “Total”, “VAT”, “Billing cycle”, “Billed for”, “Payment method”, “Transaction fees”, “Apps”, or any similar summary, heading, or informational lines as separate line items. Only extract as line items actual paid products/services, subscriptions, and app charges, NOT summary rows or section headings.

- If you find any line item with a negative amount (such as “-$0.02”), for example "Nuolaida", "Credit", "Refund", etc., create a separate line item with negative amounts for it. Or you can add it as discount to another line item it belongs to, but never do both.

- If line item doesn't clearly show total, don't use it for that line item. 

- You MUST include "vat_percent" for EACH line item, even if not explicitly shown in the row. Use VAT summary section to deduce rates: match line item subtotals to taxable bases in summary. Hint: packaging/deposit items ("skardinė", "tara", "užstatas") are usually 0% VAT; make sure you add them as separate lineitems.

*Return ONLY a valid JSON object in a SINGLE LINE (compact form): no newlines, no \n, no \r, no tabs, and no spaces outside string values. Do not use Markdown or code fences. No trailing commas. Do NOT wrap in quotes or escape characters. Do NOT include any explanations, comments, or extra text outside the JSON. The output must be directly parsable by JSON.parse().

Example (structure and field names; values may be empty strings, booleans must be true/false, numbers should be numbers when available):
{"docs":<number_of_documents>,"total_lines":<total_number_of_lines>,"ar_sutapo":<true_or_false>,"documents":[{"document_type":"","seller_id":"","seller_name":"","seller_vat_code":"","seller_address":"","seller_country":"","seller_country_iso":"","seller_iban":"","seller_is_person":false,"buyer_id":"","buyer_name":"","buyer_vat_code":"","buyer_address":"","buyer_country":"","buyer_country_iso":"","buyer_iban":"","buyer_is_person":false,"invoice_date":"","due_date":"","operation_date":"","document_series":"","document_number":"","order_number":"","invoice_discount_wo_vat":"","invoice_discount_with_vat":"","amount_wo_vat":"","vat_amount":"","vat_percent":"","amount_with_vat":"","separate_vat":false,"currency":"","with_receipt":false,"paid_by_cash":false,"doc_96_str":false,"line_items":[{"line_id":"","product_code":"","product_barcode":"","product_name":"","unit":"","quantity":"","price":"","subtotal":"","discount_wo_vat":"","vat":"","vat_percent":"","discount_with_vat":"","total":"","preke_paslauga":""}]}]}

If any of values are empty, don't include them in JSON. For example, if "product_barcode" is empty, omit it from that lineitem in JSON.

Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code.
In lithuanian documents dates are usually displayed in yyyy-mm-dd or dd/mm/yyyy formats. For example, when parsing 12/01/2026, it's 12th January, not 1st December.
When identifying buyer/seller:
- Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
- Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
- "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
- Don't rely on position (left/right/top/bottom) when labels are available
- When no pirkejas/pardavejas/tiekejas labels and can not identify sides by other criteria, check a footer. Seller is usually mentioned in a footer.

When extracting company codes and VAT codes:
- "Įm. kodas" or "Įmonės kodas" → this is company registration code → put in seller_id / buyer_id (usually 9-digit code)
- "PVM kodas" or "PVM mokėtojo kodas" → this is VAT code → put in seller_vat_code / buyer_vat_code (usually starts with country prefix like "LT" + 9-12 digits)
- Buyer and seller must not be identical by default; if buyer_id == seller_id or buyer_vat_code == seller_vat_code, re-scan for a second party block (Seller: Pardavėjas/Tiekėjas/Išrašė/Seller/Supplier; Buyer: Pirkėjas/Gavėjas/Užsakovas/Buyer/Customer) and only allow identical parties if self-billing/self-invoicing is explicitly stated.

If the buyer/seller block contains indicators of Lithuanian “individuali veikla” (e.g., “individuali veikla”, “pagal individualios veiklos pažymą”, “IV/IDV”, “Individualios veiklos Nr.” / “IV pažymos Nr.”), then set buyer_is_person=true / seller_is_person=true.

If due_date is not stated in the document, but invoice date and payment terms like number of days for payment are mentioned, calculate the due date by adding the payment period to the invoice date.
Set "separate_vat": true ONLY when the document has 2 or more different VAT rates, AND each rate's taxable base > 0. A 0% VAT rate counts if its taxable base > 0, even though VAT amount = 0 (e.g., 21% on 100 EUR + 0% on 50 EUR = separate_vat: true).
To decide this, you MUST check line items and VAT summary - if lines have different vat_percent (e.g., some 0%, some 21%) with subtotal > 0, set separate_vat: true.
When separate_vat is true, omit document-level "vat_percent" (do NOT put a single rate like "21").
You MUST include "vat_percent" for EACH line item, even if not explicitly shown in the row. Use VAT summary section to deduce rates: match line item subtotals to taxable bases in summary. Hint: packaging/deposit items ("skardinė", "tara", "užstatas") are usually 0% VAT; make sure you add them as separate lineitems.
Set "doc_96_str": true only if the document explicitly mentions Lietuvos PVM įstatymo 96 straipsnis, e.g. “PVM įstatymo 96 straipsnis”, “96 straipsnis”, “96 str.”, “taikomas 96 straipsnis”, “pagal PVMĮ 96 str.”. Otherwise set "doc_96_str": false.
For unit, try to identify any of these vnt kg g mg kompl t ct m cm mm km l ml m2 cm2 dm2 m3 cm3 dm3 val h min s d sav mėn metai pak kompl or similar. If units is not in Lithuanian, translate it (example: szt should be vnt). If can't identify unit, choose vnt.

If the document is a kasos čekis (cash receipt), for example, a fuel (kuro) receipt, buyer info is often at the bottom as a line with company name, company code, and VAT code—extract these as buyer details. For line items, find the quantity and unit next to price (like “50,01 l” for litres). Product name is usually above this line. document_number is usually next to kvitas, ignore long numer below "kasininkas" at the bottom of document but don't ignore date at the bottom.

If you cannot extract any documents, return exactly (one line):
{"docs":0,"documents":[]}

If you identified more than 1 document, return only the count (one line):
{"docs":<number_of_documents>,"documents":[]}

If you are very confident the document type is one of: Kreditinė sąskaita, Debetinė sąskaita, Išankstinė sąskaita, Pavedimo kopija, Delivery note / Važtaraštis / Packing slip (or closely related forms), then return ONLY this one-line JSON:
{"docs":1,"netinkamas_dokumentas": true,"documents":[]}

Make sure you don't consider receipt or payment confirmation as a separate document. Invoice can come with receipt if it's been paid already.
"""





#Dlia dlinyx dokumentax s scan_type=detaliai kogda pervyj otvet imel 20 lineitems no v dokumente lineitems >20

GEMINI_TRUNCATED_TO_FULL_PROMPT = """
You previously returned a JSON with "truncated_json": true because of a 20 line items cap. Now produce the COMPLETE JSON for the same document.

ABSOLUTE OUTPUT REQUIREMENT (START/END)
- Your output MUST begin with the very first character "{" and MUST end with the very last character "}".
- Do NOT output anything before the opening "{" (no BOM, no whitespace, no quotes, no backticks, no commentary).
- Do NOT output anything after the closing "}" (no whitespace, no trailing text).
- If you are about to output anything that does not start with "{", STOP and output the JSON again from the beginning.

INPUTS YOU WILL RECEIVE
- GLUED_RAW_TEXT: the full OCR text of the document.
- PREVIOUS_PARTIAL_JSON: your earlier partial JSON (already contains valid extracted values).

GOAL (MERGE — CRITICAL)
- Treat PREVIOUS_PARTIAL_JSON as the AUTHORITATIVE PREFIX of the final answer. You MUST reuse it.
- Your final output MUST be PREVIOUS_PARTIAL_JSON with ONLY additional missing content appended/filled in.
- Do NOT create a new JSON from scratch. Do NOT drop any keys/objects already present in PREVIOUS_PARTIAL_JSON.
- The final JSON MUST contain everything that is already present in PREVIOUS_PARTIAL_JSON, exactly unchanged, plus the missing tail.

LINE ITEMS COMPLETION (CRITICAL)
- Preserve the entire PREVIOUS_PARTIAL_JSON line_items array EXACTLY as-is (same objects, same order, same values, same line_id).
- Only APPEND the missing line items after the last existing item until the total number of line_items equals "total_lines" from PREVIOUS_PARTIAL_JSON.
- Do NOT renumber or rewrite existing line_id values. Continue line_id numbering only for newly appended items.

COUNT LOCK (CRITICAL)
- Read "total_lines" from PREVIOUS_PARTIAL_JSON.
- You MUST return exactly that many line items in the final JSON.
- Copy "total_lines" from PREVIOUS_PARTIAL_JSON into the final JSON without change.
- Do NOT recompute or change "total_lines".

OTHER FIELDS
- Keep all existing keys/values/data types/precision/booleans/strings and ORDER from PREVIOUS_PARTIAL_JSON exactly unchanged.
- You may only ADD missing per-document fields if clearly present in GLUED_RAW_TEXT.
- If a value is unclear, OMIT that field (do not guess).

Omit "truncated_json" in the final JSON.

LINE ITEMS COUNT LOCK (CRITICAL)
- Read "total_lines" from PREVIOUS_PARTIAL_JSON.
- You MUST return exactly that many line items in total in the document.
- Do NOT recalculate or change "total_lines". Set "total_lines" in the final JSON equal to the same value.
- Preserve all already returned line items exactly as they appear in PREVIOUS_PARTIAL_JSON (including their line_id values); only append the missing tail.
- Continue line_id numbering from the last existing line_id without renumbering existing items.
  If line_id sequencing is unclear, keep existing IDs unchanged and assign consecutive integers to newly added items.

WHAT TO ADD
- Add all missing line items until their total count equals "total_lines" (no 20-item limit).
- Add missing per-document fields if clearly present in GLUED_RAW_TEXT.
- If a value is unclear, OMIT that field (do not guess).
  It is acceptable for some newly added line items to contain only the fields that are confidently identified.

FIELDS PER DOCUMENT (if present; otherwise omit):
- seller_id, seller_name, seller_vat_code, seller_address, seller_country, seller_country_iso, seller_iban, seller_is_person
- buyer_id, buyer_name, buyer_vat_code, buyer_address, buyer_country, buyer_country_iso, buyer_iban, buyer_is_person
- invoice_date, due_date, operation_date
- document_series, document_number, order_number
- invoice_discount_wo_vat, invoice_discount_with_vat
- amount_wo_vat, vat_amount, vat_percent, amount_with_vat, separate_vat
- currency, with_receipt, paid_by_cash, doc_96_str
Booleans must be true/false. Dates yyyy-mm-dd. Use dot as decimal separator.

LINE ITEMS (array per document; include ALL that are actually charged):
For each line item (omit empty fields):
- line_id, type, product_code, product_barcode, product_name, unit, quantity, price, subtotal,
  discount_wo_vat, vat, vat_percent, discount_with_vat, total, preke_paslauga

Rules:
- Count only real products/services/fees (shipping/payment-processing/etc. if >0). Do NOT count totals/subtotals/VAT summary rows or section headings.
- Negative amounts like "Transaction credit" are DISCOUNTS — attach to the relevant item if clear;
  otherwise use invoice-level discount (do not create a separate line item).
- If a discount (“nuolaida”) is present for any line item, first determine whether the discount amount is stated with VAT (“su PVM”) or without VAT (“be PVM”).
    Extract the discount amount and assign it to the corresponding line item.
    If the discount includes VAT, return it in the “discount_with_vat” field; if it excludes VAT, return it in the “discount_wo_vat” field.
    If there is a line item with negative amount and you can not assign it as a discount of another line item, add a separate line item with negative amounts for it.
    If document contains a clear document-level discount that applies to whole document, add it as invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat).
    Invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat) must be used only as a last resort, and only when the discount clearly exists but cannot be logically linked to any specific product or service. Never apply the same discount to a few places, for example, corresponding line item discount, separate line item with negative amounts, invoice-level discount. 
- If document includes any fees (such as shipping, transaction, payment processing, etc.), each fee (if its value >0) must be extracted as a separate line item.
- Do not mix up fees, discounts, or credits with VAT. VAT must be extracted only if it is explicitly and clearly stated with '%' in the document.
- If document doesn't have obvious line items but has a table or list of payments/transactions, use them as line items.
- Do NOT treat “Subtotal”, “Total”, “VAT”, “Billing cycle”, “Billed for”, “Payment method”, “Transaction fees”, “Apps”,
  or any similar summary, heading, or informational lines as separate line items.
  Only extract as line items actual paid products/services, subscriptions, and app charges, NOT summary rows or section headings.
- If you find any line item with a negative amount (such as “-$0.02”), for example "Nuolaida", "Credit", "Refund", etc., create a separate line item with negative amounts for it. Or you can add it as discount to another line item it belongs to, but never do both.
- If line item doesn't clearly show total, don't use it for that line item.
- For unit, try to identify any of these:
  vnt kg g mg kompl t ct m cm mm km l ml m2 cm2 dm2 m3 cm3 dm3 val h min s d sav mėn metai pak kompl or similar.
  If units is not in Lithuanian, translate it (example: szt should be vnt). If can't identify unit, choose vnt.
- If paid in cash indicators appear (e.g., "gryni", "grąža") → paid_by_cash=true.

TOTAL LINES
- Copy "total_lines" from PREVIOUS_PARTIAL_JSON into the final JSON without change.
  The total number of returned line items must equal this value.

ADDITIONAL RULES
- If any of values are empty, don't include them in JSON.
  For example, if "product_barcode" is empty, omit it from that lineitem in JSON.
- Format dates as yyyy-mm-dd.
  In lithuanian documents dates are usually displayed in yyyy-mm-dd or dd/mm/yyyy formats. For example, when parsing 12/01/2026, it's 12th January, not 1st December.
- When identifying buyer/seller:
  Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
  Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
  "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
  Don't rely on position (left/right/top/bottom) when labels are available
  When no pirkejas/pardavejas/tiekejas labels and can not identify sides by other criteria, check a footer. Seller is usually mentioned in a footer.
- If due_date is not stated in the document, but invoice date and payment terms like number of days for payment are mentioned, calculate the due date by adding the payment period to the invoice date.
- In line items, always always try to take price after discount (without VAT) if such price is provided in the document. Use up to 4 decimal places for prices if needed. Do not round numbers.
- Delete country names from addresses.
- seller_country and buyer_country must be full country names in the language of the address provided.
- country_iso must be a 2-letter code.
- Set "separate_vat": true ONLY when the document has 2 or more different VAT rates, AND each rate's taxable base > 0. A 0% VAT rate counts if its taxable base > 0, even though VAT amount = 0 (e.g., 21% on 100 EUR + 0% on 50 EUR = separate_vat: true).
  To decide this, you MUST check line items and VAT summary - if lines have different vat_percent (e.g., some 0%, some 21%) with subtotal > 0, set separate_vat: true.
  When separate_vat is true, omit document-level "vat_percent" (do NOT put a single rate like "21").
  You MUST include "vat_percent" for EACH line item, even if not explicitly shown in the row. Use VAT summary section to deduce rates: match line item subtotals to taxable bases in summary. Hint: packaging/deposit items ("skardinė", "tara", "užstatas") are usually 0% VAT; make sure you add them as separate lineitems.
- Set "doc_96_str": true only if the document explicitly mentions Lietuvos PVM įstatymo 96 straipsnis, e.g. “PVM įstatymo 96 straipsnis”, “96 straipsnis”, “96 str.”, “taikomas 96 straipsnis”, “pagal PVMĮ 96 str.”. Otherwise set "doc_96_str": false.
- If the document is a kasos čekis (cash receipt), e.g. a fuel (kuro) receipt, buyer info is often at the bottom as a line
  with company name, company code, and VAT code — extract these as buyer details.
  For line items, find the quantity and unit next to the price (like “50,01 l” for litres).
  Product name is usually above this line.
  document_number is usually next to "kvitas".
  Ignore long number below "kasininkas" at the bottom of the document but don't ignore the date there.
- Make sure you don't consider a receipt or payment confirmation as a separate document.
  An invoice can include a receipt if it has already been paid.

OUTPUT FORMAT (STRICT)
- Return ONLY a valid JSON object in ONE SINGLE LINE (compact form): no newlines, no \n, no \r, no tabs,
  and no spaces outside string values.
- Do not use Markdown or code fences.
- No trailing commas.
- Do NOT wrap in quotes or escape characters.
- Do NOT include any explanations, comments, or extra text outside the JSON.
- The output must be directly parsable by JSON.parse().

DATA TO USE
- Prefer values already present in PREVIOUS_PARTIAL_JSON (do NOT alter them).
- Use GLUED_RAW_TEXT ONLY to add the missing tail (additional line items, missing fields)
  and to resolve fields not present in PREVIOUS_PARTIAL_JSON.
"""






# =========================
# 3) ОСНОВНЫЕ ФУНКЦИИ
# =========================

def _client_with_timeout(timeout_seconds: float | int | None) -> genai.Client:
    """
    Возвращает глобальный клиент, либо создаёт временный клиент с другим таймаутом.
    """
    if timeout_seconds is None:
        return gemini_client
    return genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=int(float(timeout_seconds) * 1000))
    )

def ask_gemini(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int | None = None,  # локальный override
    logger: logging.Logger | None = None,
) -> str:
    """
    Один запрос к Gemini API.
    timeout_seconds — локальный таймаут в секундах (если None, берём глобальный из клиента).
    """
    log = logger or LOGGER
    full_prompt = prompt + "\n\n" + text
    eff_timeout = timeout_seconds if timeout_seconds is not None else GEMINI_TIMEOUT_SECONDS
    log.info(
        "[Gemini] Request start model=%s len_text=%d len_prompt=%d total_len=%d timeout=%ss",
        model, len(text), len(prompt), len(full_prompt), eff_timeout
    )

    client = _client_with_timeout(timeout_seconds)

    t0 = time.perf_counter()
    response = client.models.generate_content(
        model=model,
        contents=full_prompt,
        config={
            "temperature": temperature,
            "max_output_tokens": max_output_tokens
        }
    )
    elapsed = time.perf_counter() - t0

    result = (getattr(response, "text", "") or "").strip()
    preview = result[:500].replace("\n", " ")
    log.info("[Gemini] OK model=%s len=%d elapsed=%.2fs preview=%r",
             model, len(result), elapsed, preview)
    return result


def ask_gemini_with_retry(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash-lite",
    max_retries: int = 2,
    wait_seconds: int = 60,
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int = 300,  # по умолчанию 5 минут
    logger: logging.Logger | None = None,
) -> str:
    """
    Повторяет запрос при Rate Limit / временных сбоях и логирует события.
    """
    log = logger or LOGGER
    last_exc = None

    for attempt in range(max_retries + 1):
        log.info("[Gemini] Attempt %d/%d model=%s timeout=%ss",
                 attempt + 1, max_retries + 1, model, timeout_seconds)
        t_attempt = time.perf_counter()
        try:
            result = ask_gemini(
                text=text,
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                timeout_seconds=timeout_seconds,  # проброс локального таймаута
                logger=log,
            )
            elapsed_attempt = time.perf_counter() - t_attempt
            log.info("[Gemini] Attempt %d succeeded in %.2fs",
                     attempt + 1, elapsed_attempt)
            return result

        except GEMINI_RATE_EXCS as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            log.warning(
                "[Gemini] Rate limit (%s). attempt=%d/%d elapsed=%.2fs wait=%ds",
                e.__class__.__name__, attempt + 1, max_retries + 1, elapsed_attempt, wait_seconds,
                exc_info=True,
            )
            last_exc = e
            if attempt < max_retries:
                time.sleep(wait_seconds)
                continue
            break

        except openai.RateLimitError as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            log.warning(
                "[Gemini/OpenAI] Rate limit (%s). attempt=%d/%d elapsed=%.2fs wait=%ds",
                e.__class__.__name__, attempt + 1, max_retries + 1, elapsed_attempt, wait_seconds,
                exc_info=True,
            )
            last_exc = e
            if attempt < max_retries:
                time.sleep(wait_seconds)
                continue
            break

        except Exception as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            msg = str(e).lower()
            if "rate limit" in msg or "429" in msg or "too many requests" in msg:
                log.warning(
                    "[Gemini] Probable rate limit. attempt=%d/%d elapsed=%.2fs wait=%ds err=%s",
                    attempt + 1, max_retries + 1, elapsed_attempt, wait_seconds, e,
                    exc_info=True,
                )
                last_exc = e
                if attempt < max_retries:
                    time.sleep(wait_seconds)
                    continue
                break
            else:
                log.exception("[Gemini] Unexpected error after %.2fs", elapsed_attempt)
                raise

    log.error("[Gemini] Exhausted retries. Raising last exception: %r", last_exc)
    raise last_exc




# =========================
# 3) POVTORNYJ REQUEST V GEMINI LITE JESLE OBORVAN JSON
# =========================

# --- Truncation detection -----------------------------------------------------

END_SUSPECTS = {',', ':', '"', '{', '[', '-', '\\'}

def is_truncated_json(s: str) -> bool:
    if not s:
        return False
    txt = s.strip()
    # 1) подозрительный финальный символ
    if txt and txt[-1] in END_SUSPECTS:
        return True
    # 2) незакрытые скобки / строки
    braces = brackets = 0
    in_string = False
    escape = False
    for ch in txt:
        if in_string:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == '{':
                braces += 1
            elif ch == '}':
                braces -= 1
            elif ch == '[':
                brackets += 1
            elif ch == ']':
                brackets -= 1
    if braces > 0 or brackets > 0 or in_string:
        return True
    # 3) типичные EOF-ошибки парсера
    try:
        import json
        json.loads(txt)
        return False
    except Exception as e:
        m = str(e).lower()
        return any(k in m for k in ("eof while parsing", "unterminated", "expecting value"))


# --- Retry prompt builder -----------------------------------------------------

def build_repair_prompt(new_prompt: str, glued_raw_text: str, broken_json: str) -> tuple[str, str]:
    """
    Склеивает high-level "вторая попытка" сообщение с правилами:
    - контекст (финансовые документы),
    - что именно можно/нельзя делать,
    - строгий формат вывода.
    Возвращает (prompt, text) для ask_gemini_with_retry (он сам делает prompt + "\n\n" + text).
    """
    prompt = (
        f"{new_prompt}\n\n"
        "CONTEXT\n"
        "You are extracting structured information from the OCR text of financial documents (invoices, receipts, or similar).\n"
        "The partially extracted JSON in BROKEN_JSON already contains valid values that MUST be preserved as-is.\n\n"
        "YOUR TASK\n"
        "- Continue exactly where BROKEN_JSON was truncated.\n"
        "- Do NOT modify, correct, or re-interpret any existing values (keys, values, types, order) already present in BROKEN_JSON.\n"
        "- Only finish incomplete structures (close objects/arrays/strings) and complete the obviously missing tail (e.g., last line item).\n"
        "- Use GLUED_RAW_TEXT only to resolve an obviously missing value for an already-started object in BROKEN_JSON.\n"
        "- If unsure about a value, OMIT the field instead of guessing.\n\n"
        "ALLOWED ACTIONS\n"
        "- Close any unfinished objects/arrays/strings.\n"
        "- Add only the fields/items required to make the JSON syntactically valid and structurally complete.\n"
        "- Keep field naming and typing consistent with what is already present (e.g., keep numbers as numbers if they are already numeric, keep strings as strings, keep boolean as true/false).\n\n"
        "RESTRICTIONS\n"
        "- Do NOT change, delete, normalize, or translate any existing values in BROKEN_JSON.\n"
        "- Do NOT re-extract everything from scratch; only complete what was started and cut off.\n"
        "- Do NOT invent new top-level keys/documents/items that were not begun in BROKEN_JSON.\n\n"
        "DATA RULES (from the original instruction)\n"
        "- Booleans must be true/false (not strings).\n"
        "- Dates you add should be yyyy-mm-dd if obvious; otherwise omit.\n"
        "- Use dot as decimal separator and do NOT change precision of existing numbers/number-strings.\n"
        "- Each document object contains seller/buyer fields, monetary amounts (amount_wo_vat, vat_amount, amount_with_vat, vat_percent), currency, and line_items[].\n"
        "- If multiple VAT rates exist in BROKEN_JSON, do NOT recompute or alter them.\n"
        "- Units should remain as in BROKEN_JSON; if you must add a unit and it is unclear, use 'vnt'.\n\n"
        "OUTPUT FORMAT (STRICT)\n"
        "- Return ONLY a valid JSON object in ONE SINGLE LINE (compact). No markdown, no comments, no code fences, no extra text.\n"
        "- The result must be directly parsable by JSON.parse().\n"
    )

    # Вторая часть уходит в "text": исходный контекст и обрывок
    text = (
        "GLUED_RAW_TEXT:\n"
        f"{glued_raw_text}\n\n"
        "BROKEN_JSON:\n"
        f"{broken_json}"
    )
    return prompt, text


# --- Gemini-lite repair wrapper ----------------------------------------------

def repair_truncated_json_with_gemini_lite(*, broken_json: str, glued_raw_text: str, logger=None) -> str:
    """
    Делает повторный запрос к Gemini 2.5 Lite с обновлённым промптом:
    - объясняем, что это вторая попытка и JSON был обрезан,
    - просим аккуратно завершить начатый JSON, не меняя уже извлечённые значения.
    Возвращает строку с ОДНОЛИНЕЙНЫМ валидным JSON.
    """
    new_retry_prompt = (
        "Second attempt. In the previous response, you tried to extract structured data from the OCR text "
        "of a financial document (invoice, receipt, or similar), but the JSON you returned was truncated. "
        "I'm now providing you with the same OCR text together with your truncated JSON and updated instructions. "
        "Your task is to carefully finish, extract missing data and repair the JSON without altering any information that was already extracted."
    )
    prompt, text = build_repair_prompt(new_retry_prompt, glued_raw_text, broken_json)
    return ask_gemini_with_retry(
        text=text,
        prompt=prompt,
        model="gemini-2.5-flash-lite",   # оставил твой вариант; поменяй при необходимости
        temperature=0.0,
        max_output_tokens=20000,
        timeout_seconds=300,
        logger=logger,
    )




# =========================
# 4) POVTORNYJ REQUEST V GEMINI LITE PRI DETALIAI I LINEITEMS 20 XOT V DOKUMENTE IX BOLSHE (truncated_json=true)
# =========================

def build_truncated_followup_prompt(glued_raw_text: str, previous_json: str) -> tuple[str, str]:
    """
    Собирает (prompt, text) для запроса в gemini-2.5-flash-lite,
    чтобы достроить усечённый JSON до полного.
    """
    prompt = GEMINI_TRUNCATED_TO_FULL_PROMPT
    text = (
        "GLUED_RAW_TEXT:\n"
        f"{glued_raw_text}\n\n"
        "PREVIOUS_PARTIAL_JSON:\n"
        f"{previous_json}"
    )
    return prompt, text


def request_full_json_with_gemini_lite(
    *,
    glued_raw_text: str,
    previous_json: str,
    logger: logging.Logger | None = None,
) -> str:
    """
    Один удобный вызов: берём новый follow-up промпт и шлём в gemini-2.5-flash-lite.
    Возвращает строку с ОДНОЛИНЕЙНЫМ валидным JSON (как модель ответит).
    """
    prompt, text = build_truncated_followup_prompt(glued_raw_text, previous_json)
    return ask_gemini_with_retry(
        text=text,
        prompt=prompt,
        model="gemini-2.5-flash-lite",
        temperature=0.2,
        max_output_tokens=30000,
        timeout_seconds=300,
        logger=logger,
    )









# import os
# import time
# import logging
# import openai  # для совместимого RateLimitError
# from dotenv import load_dotenv
# from google import genai
# from google.genai import types  # для HttpOptions(timeout=...)

# # Попытка импортировать типовые исключения rate limit от Google SDK (если доступно)
# try:
#     from google.api_core.exceptions import ResourceExhausted, TooManyRequests
#     GEMINI_RATE_EXCS = (ResourceExhausted, TooManyRequests)
# except Exception:
#     GEMINI_RATE_EXCS = tuple()

# load_dotenv()
# LOGGER = logging.getLogger("docscanner_app")

# def _log_big(logger, title: str, s: str, chunk: int = 4000):
#     if not logger:
#         return
#     if s is None:
#         logger.info("%s: <None>", title)
#         return
#     s = str(s)
#     logger.info("%s: len=%s", title, len(s))
#     for i in range(0, len(s), chunk):
#         logger.info("%s[%s:%s]=%r", title, i, min(i + chunk, len(s)), s[i:i + chunk])

# # =========================
# # 1) КЛИЕНТ GEMINI c таймаутом
# # =========================
# GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# if not GEMINI_API_KEY:
#     raise RuntimeError("Не найден GEMINI_API_KEY в переменных окружения.")

# # таймаут по умолчанию 300 секунд (5 минут); для нового SDK — в миллисекундах
# GEMINI_TIMEOUT_SECONDS = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "300"))
# GEMINI_TIMEOUT_MS = int(GEMINI_TIMEOUT_SECONDS * 1000)

# gemini_client = genai.Client(
#     api_key=GEMINI_API_KEY,
#     http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS)  # глобальный таймаут
# )


# # =========================
# # 2) ПРОМПТЫ ДЛЯ GEMINI
# # =========================

# GEMINI_DEFAULT_PROMPT = """You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

# 1. First, analyze the text and determine **how many separate documents** are present. Return this number as an integer in the field "docs".

# 2. For each document, determine its type. The possible document types (Galimi tipai) are:
# - PVM sąskaita faktūra
# - Sąskaita faktūra
# - Kreditinė sąskaita faktūra
# - Debetinė sąskaita faktūra
# - Išankstinė sąskaita faktūra
# - Kasos čekis
# - ES PVM sąskaita faktūra
# - ES sąskaita faktūra
# - Užsienietiška sąskaita faktūra
# - Kitas

# Assign the detected type to the field "document_type".

# 3. For each document, extract the following fields (leave empty if not found):
# - seller_id
# - seller_name
# - seller_vat_code
# - seller_address
# - seller_country
# - seller_country_iso
# - seller_iban
# - seller_is_person
# - buyer_id
# - buyer_name
# - buyer_vat_code
# - buyer_address
# - buyer_country
# - buyer_country_iso
# - buyer_iban
# - buyer_is_person
# - invoice_date
# - due_date
# - operation_date
# - document_series
# - document_number
# - order_number
# - amount_wo_vat
# - vat_amount
# - vat_percent
# - amount_with_vat
# - separate_vat
# - currency
# - with_receipt
# - paid_by_cash
# - doc_96_str

# All boolean fields (seller_is_person, buyer_is_person, with_receipt, separate_vat, paid_by_cash, doc_96_str) must be returned as true/false, not as strings.

# *Return ONLY a valid JSON object in a SINGLE LINE (compact form): no newlines, no \n, no \r, no tabs, and no spaces outside string values. Do not use Markdown or code fences. No trailing commas. Do NOT wrap in quotes or escape characters. Do NOT include any explanations, comments, or extra text outside the JSON. The output must be directly parsable by JSON.parse().

# Example (structure and field names; values may be empty strings, booleans must be true/false, numbers should be numbers when available):
# {"docs":<number_of_documents>,"documents":[{"document_type":"","seller_id":"","seller_name":"","seller_vat_code":"","seller_address":"","seller_country":"","seller_country_iso":"","seller_iban":"","seller_is_person":false,"buyer_id":"","buyer_name":"","buyer_vat_code":"","buyer_address":"","buyer_country":"","buyer_country_iso":"","buyer_iban":"","buyer_is_person":false,"invoice_date":"","due_date":"","operation_date":"","document_series":"","document_number":"","order_number":"","amount_wo_vat":"","vat_amount":"","vat_percent":"","amount_with_vat":"","separate_vat":false,"currency":"","with_receipt":false,"paid_by_cash":false}]}

# Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code.
# When identifying buyer/seller:
# - Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
# - Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
# - "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
# - Don't rely on position (left/right/top/bottom) when labels are available

# When extracting company codes and VAT codes:
# - "Įm. kodas" or "Įmonės kodas" → this is company registration code → put in seller_id / buyer_id (usually 9-digit code)
# - "PVM kodas" or "PVM mokėtojo kodas" → this is VAT code → put in seller_vat_code / buyer_vat_code (usually starts with country prefix like "LT" + 9-12 digits)

# If the buyer/seller block contains indicators of Lithuanian “individuali veikla” (e.g., “individuali veikla”, “pagal individualios veiklos pažymą”, “IV/IDV”, “Individualios veiklos Nr.” / “IV pažymos Nr.”), then set buyer_is_person=true / seller_is_person=true.

# If due_date is not stated in the document, but invoice date and payment terms like number of days for payment are mentioned, calculate the due date by adding the payment period to the invoice date.
# Set "separate_vat": true ONLY when the document has 2 or more different VAT rates, AND each rate's taxable base > 0. A 0% VAT rate counts if its taxable base > 0, even though VAT amount = 0 (e.g., 21% on 100 EUR + 0% on 50 EUR = separate_vat: true).
# To decide this, you MUST check line items and VAT summary - if lines have different vat_percent (e.g., some 0%, some 21%) with subtotal > 0, set separate_vat: true.
# When separate_vat is true, omit document-level "vat_percent" (do NOT put a single rate like "21").



# Set "doc_96_str": true only if the document explicitly mentions Lietuvos PVM įstatymo 96 straipsnis, e.g. “PVM įstatymo 96 straipsnis”, “96 straipsnis”, “96 str.”, “taikomas 96 straipsnis”, “pagal PVMĮ 96 str.”. Otherwise set "doc_96_str": false.

# If there are any signs of cash payment, for example, 'gryni', 'grąža' or similar, return paid_by_cash as True.

# If the document is a kasos čekis (cash receipt), for example, a fuel (kuro) receipt, buyer info is often at the bottom as a line with company name, company code, and VAT code—extract these as buyer details. For line items, find the quantity and unit next to price (like “50,01 l” for litres). Product name is usually above this line. document_number is usually next to kvitas, ignore long numer below "kasininkas" at the bottom of document but don't ignore date at the bottom.
# Extract all lineitems in kuro cekis, if item has units, it must be extracted as lineitem. For lineitems in kuro cekis, prices are usually stated including VAT, while discounts are usually including VAT but with minus symbol (don't extract discounts them as separate lineitems).

# If you cannot extract any documents, return exactly (one line):
# {"docs":0,"documents":[]}

# If you identified more than 1 document, return only the count (one line):
# {"docs":<number_of_documents>,"documents":[]}

# Make sure you don't consider receipt or payment confirmation as a separate document. Invoice can come with receipt if it's been paid already.
# """




# GEMINI_DETAILED_PROMPT = """
# You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

# 1. First, analyze the text and determine **how many separate documents** are present. Return this number as an integer in the field "docs". Then, count the total number of line items (products/services) across all documents and return this number as an integer in the field total_lines.

# 3. For each document, determine its type. The possible document types (Galimi tipai) are:
# - PVM sąskaita faktūra
# - Sąskaita faktūra
# - Kreditinė sąskaita faktūra
# - Debetinė sąskaita faktūra
# - Išankstinė sąskaita faktūra
# - Kasos čekis
# - ES PVM sąskaita faktūra
# - ES sąskaita faktūra
# - Užsienietiška sąskaita faktūra
# - Pavedimo kopija
# - Receipt
# - Kitas

# Assign the detected type to the field "document_type".

# 4. For each document, extract the following fields (leave empty if not found):
# - seller_id
# - seller_name
# - seller_vat_code
# - seller_address
# - seller_country
# - seller_country_iso
# - seller_iban
# - seller_is_person
# - buyer_id
# - buyer_name
# - buyer_vat_code
# - buyer_address
# - buyer_country
# - buyer_country_iso
# - buyer_iban
# - buyer_is_person
# - invoice_date
# - due_date
# - operation_date
# - document_series
# - document_number
# - order_number
# - amount_wo_vat
# - invoice_discount_wo_vat
# - invoice_discount_with_vat
# - vat_amount
# - vat_percent
# - amount_with_vat
# - separate_vat
# - currency
# - with_receipt
# - paid_by_cash
# - doc_96_str

# All boolean fields (seller_is_person, buyer_is_person, with_receipt, separate_vat, paid_by_cash, doc_96_str) must be returned as true/false, not as strings.
# If there are any signs of cash payment, for example, 'gryni', 'grąža' or similar, return paid_by_cash as True.

# 5. For each document, also extract an array of line items (products or services) if present. For each line item, extract the following fields (leave empty if not found):

# - line_id
# - type
# - product_code
# - product_barcode
# - product_name
# - unit
# - quantity
# - price
# - subtotal
# - discount without VAT (discount_wo_vat)
# - vat
# - vat_percent
# - discount with VAT (discount_with_vat)
# - total
# - preke_paslauga (if lineitem is product, return preke; if lineitem is service, return paslauga)

# **IMPORTANT:**
# - Each document must have a "line_items" field containing an array of line items (may be empty if not found).

# - Firstly, properly identify how many lineitems (products/services/fees/shipping, etc) exist in the document. Don't count document's subtotal, vat, total lines as lineitems. If product/service is mentioned with zero subtotal, vat and total for example free shipping, don't include it as lineitem. But shipping fee if it's > 0, it must be added as lineitem and counted towards total_lines.

# LINE ITEMS RULE (STRICT):
# - First COUNT the real total number of billable line items in the document and return it as integer "total_lines" at ROOT level.
# - Then OUTPUT only the FIRST 20 line items in "line_items". Never output more than 20.
# - If total_lines > 20: set root "truncated_json": true and line_items must contain exactly 20 items.
# - If total_lines <= 20: omit "truncated_json" (or set false) and line_items must contain exactly total_lines items.

# - If a discount (“nuolaida”) is present for any line item, first determine whether the discount amount is stated with VAT (“su PVM”) or without VAT (“be PVM”).
#     Extract the discount amount and assign it to the corresponding line item.
#     If the discount includes VAT, return it in the “discount_with_vat” field; if it excludes VAT, return it in the “discount_wo_vat” field.
#     If there is a line item with negative amount and you can not assign it as a discount of another line item, add a separate line item with negative amounts for it.
#     If document contains a clear document-level discount that applies to whole document, add it as invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat).
#     Invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat) must be used only as a last resort, and only when the discount clearly exists but cannot be logically linked to any specific product or service. Never apply the same discount to a few places, for example, corresponding line item discount, separate line item with negative amounts, invoice-level discount. 

# - For lineitems, always try to take price after discount (without VAT) if such price is provided in the document. Use up to 4 decimal places for prices if needed. Do not round numbers.

# - If document includes any fees (such as shipping, transaction, payment processing, etc.), each fee (if it's value >0) must be extracted as a separate line item.

# - Do not mix up fees, discounts, or credits with VAT. VAT must be extracted only if it is explicitly and clearly stated with '%' in the document.

# - If document doesn't have obvious line items but has a table or list of payments/transactions, use them as line items.

# - Do **NOT** treat “Subtotal”, “Total”, “VAT”, “Billing cycle”, “Billed for”, “Payment method”, “Transaction fees”, “Apps”, or any similar summary, heading, or informational lines as separate line items. Only extract as line items actual paid products/services, subscriptions, and app charges, NOT summary rows or section headings.

# - If you find any line item with a negative amount (such as “-$0.02”), for example "Nuolaida", "Credit", "Refund", etc., create a separate line item with negative amounts for it. Or you can add it as discount to another line item it belongs to, but never do both.

# - If line item doesn't clearly show total, don't use it for that line item. 

# - You MUST include "vat_percent" for EACH line item, even if not explicitly shown in the row. Use VAT summary section to deduce rates: match line item subtotals to taxable bases in summary. Hint: packaging/deposit items ("skardinė", "tara", "užstatas") are usually 0% VAT; make sure you add them as separate lineitems.

# *Return ONLY a valid JSON object in a SINGLE LINE (compact form): no newlines, no \n, no \r, no tabs, and no spaces outside string values. Do not use Markdown or code fences. No trailing commas. Do NOT wrap in quotes or escape characters. Do NOT include any explanations, comments, or extra text outside the JSON. The output must be directly parsable by JSON.parse().

# Example (structure and field names; values may be empty strings, booleans must be true/false, numbers should be numbers when available):
# {"docs":<number_of_documents>,"total_lines":<total_number_of_lines>,"ar_sutapo":<true_or_false>,"documents":[{"document_type":"","seller_id":"","seller_name":"","seller_vat_code":"","seller_address":"","seller_country":"","seller_country_iso":"","seller_iban":"","seller_is_person":false,"buyer_id":"","buyer_name":"","buyer_vat_code":"","buyer_address":"","buyer_country":"","buyer_country_iso":"","buyer_iban":"","buyer_is_person":false,"invoice_date":"","due_date":"","operation_date":"","document_series":"","document_number":"","order_number":"","invoice_discount_wo_vat":"","invoice_discount_with_vat":"","amount_wo_vat":"","vat_amount":"","vat_percent":"","amount_with_vat":"","separate_vat":false,"currency":"","with_receipt":false,"paid_by_cash":false,"doc_96_str":false,"line_items":[{"line_id":"","product_code":"","product_barcode":"","product_name":"","unit":"","quantity":"","price":"","subtotal":"","discount_wo_vat":"","vat":"","vat_percent":"","discount_with_vat":"","total":"","preke_paslauga":""}]}]}

# If any of values are empty, don't include them in JSON. For example, if "product_barcode" is empty, omit it from that lineitem in JSON.

# Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code.
# When identifying buyer/seller:
# - Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
# - Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
# - "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
# - Don't rely on position (left/right/top/bottom) when labels are available

# When extracting company codes and VAT codes:
# - "Įm. kodas" or "Įmonės kodas" → this is company registration code → put in seller_id / buyer_id (usually 9-digit code)
# - "PVM kodas" or "PVM mokėtojo kodas" → this is VAT code → put in seller_vat_code / buyer_vat_code (usually starts with country prefix like "LT" + 9-12 digits)

# If the buyer/seller block contains indicators of Lithuanian “individuali veikla” (e.g., “individuali veikla”, “pagal individualios veiklos pažymą”, “IV/IDV”, “Individualios veiklos Nr.” / “IV pažymos Nr.”), then set buyer_is_person=true / seller_is_person=true.

# If due_date is not stated in the document, but invoice date and payment terms like number of days for payment are mentioned, calculate the due date by adding the payment period to the invoice date.
# Set "separate_vat": true ONLY when the document has 2 or more different VAT rates, AND each rate's taxable base > 0. A 0% VAT rate counts if its taxable base > 0, even though VAT amount = 0 (e.g., 21% on 100 EUR + 0% on 50 EUR = separate_vat: true).
# To decide this, you MUST check line items and VAT summary - if lines have different vat_percent (e.g., some 0%, some 21%) with subtotal > 0, set separate_vat: true.
# When separate_vat is true, omit document-level "vat_percent" (do NOT put a single rate like "21").
# You MUST include "vat_percent" for EACH line item, even if not explicitly shown in the row. Use VAT summary section to deduce rates: match line item subtotals to taxable bases in summary. Hint: packaging/deposit items ("skardinė", "tara", "užstatas") are usually 0% VAT; make sure you add them as separate lineitems.
# Set "doc_96_str": true only if the document explicitly mentions Lietuvos PVM įstatymo 96 straipsnis, e.g. “PVM įstatymo 96 straipsnis”, “96 straipsnis”, “96 str.”, “taikomas 96 straipsnis”, “pagal PVMĮ 96 str.”. Otherwise set "doc_96_str": false.
# For unit, try to identify any of these vnt kg g mg kompl t ct m cm mm km l ml m2 cm2 dm2 m3 cm3 dm3 val h min s d sav mėn metai pak kompl or similar. If units is not in Lithuanian, translate it (example: szt should be vnt). If can't identify unit, choose vnt.

# If the document is a kasos čekis (cash receipt), for example, a fuel (kuro) receipt, buyer info is often at the bottom as a line with company name, company code, and VAT code—extract these as buyer details. For line items, find the quantity and unit next to price (like “50,01 l” for litres). Product name is usually above this line. document_number is usually next to kvitas, ignore long numer below "kasininkas" at the bottom of document but don't ignore date at the bottom.

# If you cannot extract any documents, return exactly (one line):
# {"docs":0,"documents":[]}

# If you identified more than 1 document, return only the count (one line):
# {"docs":<number_of_documents>,"documents":[]}

# Make sure you don't consider receipt or payment confirmation as a separate document. Invoice can come with receipt if it's been paid already.
# """





# #Dlia dlinyx dokumentax s scan_type=detaliai kogda pervyj otvet imel 20 lineitems no v dokumente lineitems >20

# GEMINI_TRUNCATED_TO_FULL_PROMPT = """
# You previously returned a JSON with "truncated_json": true because of a 20 line items cap. Now produce the COMPLETE JSON for the same document.

# ABSOLUTE OUTPUT REQUIREMENT (START/END)
# - Your output MUST begin with the very first character "{" and MUST end with the very last character "}".
# - Do NOT output anything before the opening "{" (no BOM, no whitespace, no quotes, no backticks, no commentary).
# - Do NOT output anything after the closing "}" (no whitespace, no trailing text).
# - If you are about to output anything that does not start with "{", STOP and output the JSON again from the beginning.

# INPUTS YOU WILL RECEIVE
# - GLUED_RAW_TEXT: the full OCR text of the document.
# - PREVIOUS_PARTIAL_JSON: your earlier partial JSON (already contains valid extracted values).

# GOAL (MERGE — CRITICAL)
# - Treat PREVIOUS_PARTIAL_JSON as the AUTHORITATIVE PREFIX of the final answer. You MUST reuse it.
# - Your final output MUST be PREVIOUS_PARTIAL_JSON with ONLY additional missing content appended/filled in.
# - Do NOT create a new JSON from scratch. Do NOT drop any keys/objects already present in PREVIOUS_PARTIAL_JSON.
# - The final JSON MUST contain everything that is already present in PREVIOUS_PARTIAL_JSON, exactly unchanged, plus the missing tail.

# LINE ITEMS COMPLETION (CRITICAL)
# - Preserve the entire PREVIOUS_PARTIAL_JSON line_items array EXACTLY as-is (same objects, same order, same values, same line_id).
# - Only APPEND the missing line items after the last existing item until the total number of line_items equals "total_lines" from PREVIOUS_PARTIAL_JSON.
# - Do NOT renumber or rewrite existing line_id values. Continue line_id numbering only for newly appended items.

# COUNT LOCK (CRITICAL)
# - Read "total_lines" from PREVIOUS_PARTIAL_JSON.
# - You MUST return exactly that many line items in the final JSON.
# - Copy "total_lines" from PREVIOUS_PARTIAL_JSON into the final JSON without change.
# - Do NOT recompute or change "total_lines".

# OTHER FIELDS
# - Keep all existing keys/values/data types/precision/booleans/strings and ORDER from PREVIOUS_PARTIAL_JSON exactly unchanged.
# - You may only ADD missing per-document fields if clearly present in GLUED_RAW_TEXT.
# - If a value is unclear, OMIT that field (do not guess).

# Omit "truncated_json" in the final JSON.

# LINE ITEMS COUNT LOCK (CRITICAL)
# - Read "total_lines" from PREVIOUS_PARTIAL_JSON.
# - You MUST return exactly that many line items in total in the document.
# - Do NOT recalculate or change "total_lines". Set "total_lines" in the final JSON equal to the same value.
# - Preserve all already returned line items exactly as they appear in PREVIOUS_PARTIAL_JSON (including their line_id values); only append the missing tail.
# - Continue line_id numbering from the last existing line_id without renumbering existing items.
#   If line_id sequencing is unclear, keep existing IDs unchanged and assign consecutive integers to newly added items.

# WHAT TO ADD
# - Add all missing line items until their total count equals "total_lines" (no 20-item limit).
# - Add missing per-document fields if clearly present in GLUED_RAW_TEXT.
# - If a value is unclear, OMIT that field (do not guess).
#   It is acceptable for some newly added line items to contain only the fields that are confidently identified.

# FIELDS PER DOCUMENT (if present; otherwise omit):
# - seller_id, seller_name, seller_vat_code, seller_address, seller_country, seller_country_iso, seller_iban, seller_is_person
# - buyer_id, buyer_name, buyer_vat_code, buyer_address, buyer_country, buyer_country_iso, buyer_iban, buyer_is_person
# - invoice_date, due_date, operation_date
# - document_series, document_number, order_number
# - invoice_discount_wo_vat, invoice_discount_with_vat
# - amount_wo_vat, vat_amount, vat_percent, amount_with_vat, separate_vat
# - currency, with_receipt, paid_by_cash, doc_96_str
# Booleans must be true/false. Dates yyyy-mm-dd. Use dot as decimal separator.

# LINE ITEMS (array per document; include ALL that are actually charged):
# For each line item (omit empty fields):
# - line_id, type, product_code, product_barcode, product_name, unit, quantity, price, subtotal,
#   discount_wo_vat, vat, vat_percent, discount_with_vat, total, preke_paslauga

# Rules:
# - Count only real products/services/fees (shipping/payment-processing/etc. if >0). Do NOT count totals/subtotals/VAT summary rows or section headings.
# - Negative amounts like "Transaction credit" are DISCOUNTS — attach to the relevant item if clear;
#   otherwise use invoice-level discount (do not create a separate line item).
# - If a discount (“nuolaida”) is present for any line item, first determine whether the discount amount is stated with VAT (“su PVM”) or without VAT (“be PVM”).
#     Extract the discount amount and assign it to the corresponding line item.
#     If the discount includes VAT, return it in the “discount_with_vat” field; if it excludes VAT, return it in the “discount_wo_vat” field.
#     If there is a line item with negative amount and you can not assign it as a discount of another line item, add a separate line item with negative amounts for it.
#     If document contains a clear document-level discount that applies to whole document, add it as invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat).
#     Invoice-level discounts (invoice_discount_wo_vat or invoice_discount_with_vat) must be used only as a last resort, and only when the discount clearly exists but cannot be logically linked to any specific product or service. Never apply the same discount to a few places, for example, corresponding line item discount, separate line item with negative amounts, invoice-level discount. 
# - If document includes any fees (such as shipping, transaction, payment processing, etc.), each fee (if its value >0) must be extracted as a separate line item.
# - Do not mix up fees, discounts, or credits with VAT. VAT must be extracted only if it is explicitly and clearly stated with '%' in the document.
# - If document doesn't have obvious line items but has a table or list of payments/transactions, use them as line items.
# - Do NOT treat “Subtotal”, “Total”, “VAT”, “Billing cycle”, “Billed for”, “Payment method”, “Transaction fees”, “Apps”,
#   or any similar summary, heading, or informational lines as separate line items.
#   Only extract as line items actual paid products/services, subscriptions, and app charges, NOT summary rows or section headings.
# - If you find any line item with a negative amount (such as “-$0.02”), for example "Nuolaida", "Credit", "Refund", etc., create a separate line item with negative amounts for it. Or you can add it as discount to another line item it belongs to, but never do both.
# - If line item doesn't clearly show total, don't use it for that line item.
# - For unit, try to identify any of these:
#   vnt kg g mg kompl t ct m cm mm km l ml m2 cm2 dm2 m3 cm3 dm3 val h min s d sav mėn metai pak kompl or similar.
#   If units is not in Lithuanian, translate it (example: szt should be vnt). If can't identify unit, choose vnt.
# - If paid in cash indicators appear (e.g., "gryni", "grąža") → paid_by_cash=true.

# TOTAL LINES
# - Copy "total_lines" from PREVIOUS_PARTIAL_JSON into the final JSON without change.
#   The total number of returned line items must equal this value.

# ADDITIONAL RULES
# - If any of values are empty, don't include them in JSON.
#   For example, if "product_barcode" is empty, omit it from that lineitem in JSON.
# - Format dates as yyyy-mm-dd.
# - When identifying buyer/seller:
#   Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
#   Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
#   "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
#   Don't rely on position (left/right/top/bottom) when labels are available
# - If due_date is not stated in the document, but invoice date and payment terms like number of days for payment are mentioned, calculate the due date by adding the payment period to the invoice date.
# - In line items, always always try to take price after discount (without VAT) if such price is provided in the document. Use up to 4 decimal places for prices if needed. Do not round numbers.
# - Delete country names from addresses.
# - seller_country and buyer_country must be full country names in the language of the address provided.
# - country_iso must be a 2-letter code.
# - Set "separate_vat": true ONLY when the document has 2 or more different VAT rates, AND each rate's taxable base > 0. A 0% VAT rate counts if its taxable base > 0, even though VAT amount = 0 (e.g., 21% on 100 EUR + 0% on 50 EUR = separate_vat: true).
#   To decide this, you MUST check line items and VAT summary - if lines have different vat_percent (e.g., some 0%, some 21%) with subtotal > 0, set separate_vat: true.
#   When separate_vat is true, omit document-level "vat_percent" (do NOT put a single rate like "21").
#   You MUST include "vat_percent" for EACH line item, even if not explicitly shown in the row. Use VAT summary section to deduce rates: match line item subtotals to taxable bases in summary. Hint: packaging/deposit items ("skardinė", "tara", "užstatas") are usually 0% VAT; make sure you add them as separate lineitems.
# - Set "doc_96_str": true only if the document explicitly mentions Lietuvos PVM įstatymo 96 straipsnis, e.g. “PVM įstatymo 96 straipsnis”, “96 straipsnis”, “96 str.”, “taikomas 96 straipsnis”, “pagal PVMĮ 96 str.”. Otherwise set "doc_96_str": false.
# - If the document is a kasos čekis (cash receipt), e.g. a fuel (kuro) receipt, buyer info is often at the bottom as a line
#   with company name, company code, and VAT code — extract these as buyer details.
#   For line items, find the quantity and unit next to the price (like “50,01 l” for litres).
#   Product name is usually above this line.
#   document_number is usually next to "kvitas".
#   Ignore long number below "kasininkas" at the bottom of the document but don't ignore the date there.
# - Make sure you don't consider a receipt or payment confirmation as a separate document.
#   An invoice can include a receipt if it has already been paid.

# OUTPUT FORMAT (STRICT)
# - Return ONLY a valid JSON object in ONE SINGLE LINE (compact form): no newlines, no \n, no \r, no tabs,
#   and no spaces outside string values.
# - Do not use Markdown or code fences.
# - No trailing commas.
# - Do NOT wrap in quotes or escape characters.
# - Do NOT include any explanations, comments, or extra text outside the JSON.
# - The output must be directly parsable by JSON.parse().

# DATA TO USE
# - Prefer values already present in PREVIOUS_PARTIAL_JSON (do NOT alter them).
# - Use GLUED_RAW_TEXT ONLY to add the missing tail (additional line items, missing fields)
#   and to resolve fields not present in PREVIOUS_PARTIAL_JSON.

# Do NOT use thousands separators. Numbers must contain at most one "." or ",". If you are unsure about a number, output it as a string, not a number.
# """






# # =========================
# # 3) ОСНОВНЫЕ ФУНКЦИИ
# # =========================

# def _client_with_timeout(timeout_seconds: float | int | None) -> genai.Client:
#     """
#     Возвращает глобальный клиент, либо создаёт временный клиент с другим таймаутом.
#     """
#     if timeout_seconds is None:
#         return gemini_client
#     return genai.Client(
#         api_key=GEMINI_API_KEY,
#         http_options=types.HttpOptions(timeout=int(float(timeout_seconds) * 1000))
#     )

# def ask_gemini(
#     text: str,
#     prompt: str,
#     model: str = "gemini-2.5-flash",
#     temperature: float = 1.0,
#     max_output_tokens: int = 20000,
#     timeout_seconds: float | int | None = None,  # локальный override
#     logger: logging.Logger | None = None,
# ) -> str:
#     """
#     Один запрос к Gemini API.
#     timeout_seconds — локальный таймаут в секундах (если None, берём глобальный из клиента).
#     """
#     log = logger or LOGGER
#     full_prompt = prompt + "\n\n" + text
#     eff_timeout = timeout_seconds if timeout_seconds is not None else GEMINI_TIMEOUT_SECONDS
#     log.info(
#         "[Gemini] Request start model=%s len_text=%d len_prompt=%d total_len=%d timeout=%ss",
#         model, len(text), len(prompt), len(full_prompt), eff_timeout
#     )

#     client = _client_with_timeout(timeout_seconds)

#     t0 = time.perf_counter()
#     response = client.models.generate_content(
#         model=model,
#         contents=full_prompt,
#         config={
#             "temperature": temperature,
#             "max_output_tokens": max_output_tokens
#         }
#     )
#     elapsed = time.perf_counter() - t0

#     result = (getattr(response, "text", "") or "").strip()
#     preview = result[:500].replace("\n", " ")
#     log.info("[Gemini] OK model=%s len=%d elapsed=%.2fs preview=%r",
#              model, len(result), elapsed, preview)
#     return result


# def ask_gemini_with_retry(
#     text: str,
#     prompt: str,
#     model: str = "gemini-2.5-flash-lite",
#     max_retries: int = 2,
#     wait_seconds: int = 60,
#     temperature: float = 1.0,
#     max_output_tokens: int = 20000,
#     timeout_seconds: float | int = 300,  # по умолчанию 5 минут
#     logger: logging.Logger | None = None,
# ) -> str:
#     """
#     Повторяет запрос при Rate Limit / временных сбоях и логирует события.
#     """
#     log = logger or LOGGER
#     last_exc = None

#     for attempt in range(max_retries + 1):
#         log.info("[Gemini] Attempt %d/%d model=%s timeout=%ss",
#                  attempt + 1, max_retries + 1, model, timeout_seconds)
#         t_attempt = time.perf_counter()
#         try:
#             result = ask_gemini(
#                 text=text,
#                 prompt=prompt,
#                 model=model,
#                 temperature=temperature,
#                 max_output_tokens=max_output_tokens,
#                 timeout_seconds=timeout_seconds,  # проброс локального таймаута
#                 logger=log,
#             )
#             elapsed_attempt = time.perf_counter() - t_attempt
#             log.info("[Gemini] Attempt %d succeeded in %.2fs",
#                      attempt + 1, elapsed_attempt)
#             return result

#         except GEMINI_RATE_EXCS as e:
#             elapsed_attempt = time.perf_counter() - t_attempt
#             log.warning(
#                 "[Gemini] Rate limit (%s). attempt=%d/%d elapsed=%.2fs wait=%ds",
#                 e.__class__.__name__, attempt + 1, max_retries + 1, elapsed_attempt, wait_seconds,
#                 exc_info=True,
#             )
#             last_exc = e
#             if attempt < max_retries:
#                 time.sleep(wait_seconds)
#                 continue
#             break

#         except openai.RateLimitError as e:
#             elapsed_attempt = time.perf_counter() - t_attempt
#             log.warning(
#                 "[Gemini/OpenAI] Rate limit (%s). attempt=%d/%d elapsed=%.2fs wait=%ds",
#                 e.__class__.__name__, attempt + 1, max_retries + 1, elapsed_attempt, wait_seconds,
#                 exc_info=True,
#             )
#             last_exc = e
#             if attempt < max_retries:
#                 time.sleep(wait_seconds)
#                 continue
#             break

#         except Exception as e:
#             elapsed_attempt = time.perf_counter() - t_attempt
#             msg = str(e).lower()
#             if "rate limit" in msg or "429" in msg or "too many requests" in msg:
#                 log.warning(
#                     "[Gemini] Probable rate limit. attempt=%d/%d elapsed=%.2fs wait=%ds err=%s",
#                     attempt + 1, max_retries + 1, elapsed_attempt, wait_seconds, e,
#                     exc_info=True,
#                 )
#                 last_exc = e
#                 if attempt < max_retries:
#                     time.sleep(wait_seconds)
#                     continue
#                 break
#             else:
#                 log.exception("[Gemini] Unexpected error after %.2fs", elapsed_attempt)
#                 raise

#     log.error("[Gemini] Exhausted retries. Raising last exception: %r", last_exc)
#     raise last_exc




# # =========================
# # 3) POVTORNYJ REQUEST V GEMINI LITE JESLE OBORVAN JSON
# # =========================

# # --- Truncation detection -----------------------------------------------------

# END_SUSPECTS = {',', ':', '"', '{', '[', '-', '\\'}

# def is_truncated_json(s: str) -> bool:
#     if not s:
#         return False
#     txt = s.strip()
#     # 1) подозрительный финальный символ
#     if txt and txt[-1] in END_SUSPECTS:
#         return True
#     # 2) незакрытые скобки / строки
#     braces = brackets = 0
#     in_string = False
#     escape = False
#     for ch in txt:
#         if in_string:
#             if escape:
#                 escape = False
#             elif ch == '\\':
#                 escape = True
#             elif ch == '"':
#                 in_string = False
#         else:
#             if ch == '"':
#                 in_string = True
#             elif ch == '{':
#                 braces += 1
#             elif ch == '}':
#                 braces -= 1
#             elif ch == '[':
#                 brackets += 1
#             elif ch == ']':
#                 brackets -= 1
#     if braces > 0 or brackets > 0 or in_string:
#         return True
#     # 3) типичные EOF-ошибки парсера
#     try:
#         import json
#         json.loads(txt)
#         return False
#     except Exception as e:
#         m = str(e).lower()
#         return any(k in m for k in ("eof while parsing", "unterminated", "expecting value"))


# # --- Retry prompt builder -----------------------------------------------------

# def build_repair_prompt(new_prompt: str, glued_raw_text: str, broken_json: str) -> tuple[str, str]:
#     """
#     Склеивает high-level "вторая попытка" сообщение с правилами:
#     - контекст (финансовые документы),
#     - что именно можно/нельзя делать,
#     - строгий формат вывода.
#     Возвращает (prompt, text) для ask_gemini_with_retry (он сам делает prompt + "\n\n" + text).
#     """
#     prompt = (
#         f"{new_prompt}\n\n"
#         "CONTEXT\n"
#         "You are extracting structured information from the OCR text of financial documents (invoices, receipts, or similar).\n"
#         "The partially extracted JSON in BROKEN_JSON already contains valid values that MUST be preserved as-is.\n\n"
#         "YOUR TASK\n"
#         "- Continue exactly where BROKEN_JSON was truncated.\n"
#         "- Do NOT modify, correct, or re-interpret any existing values (keys, values, types, order) already present in BROKEN_JSON.\n"
#         "- Only finish incomplete structures (close objects/arrays/strings) and complete the obviously missing tail (e.g., last line item).\n"
#         "- Use GLUED_RAW_TEXT only to resolve an obviously missing value for an already-started object in BROKEN_JSON.\n"
#         "- If unsure about a value, OMIT the field instead of guessing.\n\n"
#         "ALLOWED ACTIONS\n"
#         "- Close any unfinished objects/arrays/strings.\n"
#         "- Add only the fields/items required to make the JSON syntactically valid and structurally complete.\n"
#         "- Keep field naming and typing consistent with what is already present (e.g., keep numbers as numbers if they are already numeric, keep strings as strings, keep boolean as true/false).\n\n"
#         "RESTRICTIONS\n"
#         "- Do NOT change, delete, normalize, or translate any existing values in BROKEN_JSON.\n"
#         "- Do NOT re-extract everything from scratch; only complete what was started and cut off.\n"
#         "- Do NOT invent new top-level keys/documents/items that were not begun in BROKEN_JSON.\n\n"
#         "DATA RULES (from the original instruction)\n"
#         "- Booleans must be true/false (not strings).\n"
#         "- Dates you add should be yyyy-mm-dd if obvious; otherwise omit.\n"
#         "- Use dot as decimal separator and do NOT change precision of existing numbers/number-strings.\n"
#         "- Each document object contains seller/buyer fields, monetary amounts (amount_wo_vat, vat_amount, amount_with_vat, vat_percent), currency, and line_items[].\n"
#         "- If multiple VAT rates exist in BROKEN_JSON, do NOT recompute or alter them.\n"
#         "- Units should remain as in BROKEN_JSON; if you must add a unit and it is unclear, use 'vnt'.\n\n"
#         "OUTPUT FORMAT (STRICT)\n"
#         "- Return ONLY a valid JSON object in ONE SINGLE LINE (compact). No markdown, no comments, no code fences, no extra text.\n"
#         "- The result must be directly parsable by JSON.parse().\n"
#     )

#     # Вторая часть уходит в "text": исходный контекст и обрывок
#     text = (
#         "GLUED_RAW_TEXT:\n"
#         f"{glued_raw_text}\n\n"
#         "BROKEN_JSON:\n"
#         f"{broken_json}"
#     )
#     return prompt, text


# # --- Gemini-lite repair wrapper ----------------------------------------------

# def repair_truncated_json_with_gemini_lite(*, broken_json: str, glued_raw_text: str, logger=None) -> str:
#     """
#     Делает повторный запрос к Gemini 2.5 Lite с обновлённым промптом:
#     - объясняем, что это вторая попытка и JSON был обрезан,
#     - просим аккуратно завершить начатый JSON, не меняя уже извлечённые значения.
#     Возвращает строку с ОДНОЛИНЕЙНЫМ валидным JSON.
#     """
#     new_retry_prompt = (
#         "Second attempt. In the previous response, you tried to extract structured data from the OCR text "
#         "of a financial document (invoice, receipt, or similar), but the JSON you returned was truncated. "
#         "I'm now providing you with the same OCR text together with your truncated JSON and updated instructions. "
#         "Your task is to carefully finish, extract missing data and repair the JSON without altering any information that was already extracted."
#     )
#     prompt, text = build_repair_prompt(new_retry_prompt, glued_raw_text, broken_json)
#     return ask_gemini_with_retry(
#         text=text,
#         prompt=prompt,
#         model="gemini-2.5-flash-lite",   # оставил твой вариант; поменяй при необходимости
#         temperature=0.0,
#         max_output_tokens=20000,
#         timeout_seconds=300,
#         logger=logger,
#     )




# # =========================
# # 4) POVTORNYJ REQUEST V GEMINI LITE PRI DETALIAI I LINEITEMS 20 XOT V DOKUMENTE IX BOLSHE (truncated_json=true)
# # =========================

# def build_truncated_followup_prompt(glued_raw_text: str, previous_json: str) -> tuple[str, str]:
#     """
#     Собирает (prompt, text) для запроса в gemini-2.5-flash-lite,
#     чтобы достроить усечённый JSON до полного.
#     """
#     prompt = GEMINI_TRUNCATED_TO_FULL_PROMPT
#     text = (
#         "GLUED_RAW_TEXT:\n"
#         f"{glued_raw_text}\n\n"
#         "PREVIOUS_PARTIAL_JSON:\n"
#         f"{previous_json}"
#     )
#     return prompt, text


# def request_full_json_with_gemini_lite(*, glued_raw_text: str, previous_json: str, logger=None) -> str:
#     prompt = GEMINI_TRUNCATED_TO_FULL_PROMPT  # ili kak u tebya tam nazyvaetsya
#     text = (
#         "GLUED_RAW_TEXT:\n"
#         f"{glued_raw_text}\n\n"
#         "PREVIOUS_PARTIAL_JSON:\n"
#         f"{previous_json}"
#     )

#     # POLNYJ ZAPROS V LOG
#     _log_big(logger, "[GEMINI][FULL] PROMPT", prompt)
#     _log_big(logger, "[GEMINI][FULL] TEXT", text)

#     resp = ask_gemini_with_retry(
#         text=text,
#         prompt=prompt,
#         model="gemini-2.5-flash-lite",
#         logger=logger,
#     )

#     # POLNYJ OTVET V LOG
#     _log_big(logger, "[GEMINI][FULL] RESPONSE", resp)

#     return resp
