# grok.py
import os
import time
import json
import random
import logging
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

load_dotenv()
LOGGER = logging.getLogger("docscanner_app")

# =========================
# 1) КЛИЕНТ GROK (xAI) + таймаут
# =========================

GROK_API_KEY = os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY")
if not GROK_API_KEY:
    raise RuntimeError("Не найден GROK_API_KEY (или XAI_API_KEY) в переменных окружения.")

GROK_API_URL = os.getenv("GROK_API_URL", "https://api.x.ai/v1/chat/completions")

GROK_TIMEOUT_SECONDS = float(os.getenv("GROK_TIMEOUT_SECONDS", "300"))  # 5 минут по умолчанию


# =========================
# 2) ПРОМПТЫ (переиспользуй свои)
# =========================

GROK_DEFAULT_PROMPT = """You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

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
When identifying buyer/seller:
- Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
- Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
- "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
- Don't rely on position (left/right/top/bottom) when labels are available

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

Make sure you don't consider receipt or payment confirmation as a separate document. Invoice can come with receipt if it's been paid already.
"""




GROK_DETAILED_PROMPT = """
You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

1. First, analyze the text and determine **how many separate documents** are present. Return this number as an integer in the field "docs". Then, count the total number of line items (products/services) across all documents and return this number as an integer in the field total_lines.

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

*Return ONLY a valid JSON object in a SINGLE LINE (compact form): no newlines, no \n, no \r, no tabs, and no spaces outside string values. Do not use Markdown or code fences. No trailing commas. Do NOT wrap in quotes or escape characters. Do NOT include any explanations, comments, or extra text outside the JSON. The output must be directly parsable by JSON.parse().

Example (structure and field names; values may be empty strings, booleans must be true/false, numbers should be numbers when available):
{"docs":<number_of_documents>,"total_lines":<total_number_of_lines>,"ar_sutapo":<true_or_false>,"documents":[{"document_type":"","seller_id":"","seller_name":"","seller_vat_code":"","seller_address":"","seller_country":"","seller_country_iso":"","seller_iban":"","seller_is_person":false,"buyer_id":"","buyer_name":"","buyer_vat_code":"","buyer_address":"","buyer_country":"","buyer_country_iso":"","buyer_iban":"","buyer_is_person":false,"invoice_date":"","due_date":"","operation_date":"","document_series":"","document_number":"","order_number":"","invoice_discount_wo_vat":"","invoice_discount_with_vat":"","amount_wo_vat":"","vat_amount":"","vat_percent":"","amount_with_vat":"","separate_vat":false,"currency":"","with_receipt":false,"paid_by_cash":false,"doc_96_str":false,"line_items":[{"line_id":"","product_code":"","product_barcode":"","product_name":"","unit":"","quantity":"","price":"","subtotal":"","discount_wo_vat":"","vat":"","vat_percent":"","discount_with_vat":"","total":"","preke_paslauga":""}]}]}

If any of values are empty, don't include them in JSON. For example, if "product_barcode" is empty, omit it from that lineitem in JSON.
Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code.
When identifying buyer/seller:
- Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
- Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
- "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
- Don't rely on position (left/right/top/bottom) when labels are available
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

Make sure you don't consider receipt or payment confirmation as a separate document. Invoice can come with receipt if it's been paid already.
"""





#Dlia dlinyx dokumentax s scan_type=detaliai kogda pervyj otvet imel 20 lineitems no v dokumente lineitems >20

GROK_TRUNCATED_TO_FULL_PROMPT = """
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
- When identifying buyer/seller:
  Look for "pirkėjas" / "paslaugos pirkėjas" label → this is BUYER
  Look for "pardavėjas" / "tiekėjas" label→ this is SELLER
  "Savarankiškas sąskaitų išrašymas" (self-billing) and "Atvirkštinis PVM" (reverse charge) do NOT swap roles: pirkėjas is still buyer, pardavėjas/tiekėjas is still seller
  Don't rely on position (left/right/top/bottom) when labels are available
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
# 3) НИЗКОУРОВНЕВЫЙ ВЫЗОВ xAI Chat Completions
# =========================

def _headers() -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROK_API_KEY}",
    }


def _extract_text(resp_json: Dict[str, Any]) -> str:
    """
    Ожидаемый формат совместим с OpenAI Chat Completions:
    { "choices": [ { "message": { "content": "..." } } ] }
    """
    try:
        return (resp_json.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    except Exception:
        return ""


def ask_grok(
    *,
    text: str,
    prompt: str,
    model: str = "grok-4-1-fast-reasoning",
    temperature: float = 1.0,
    max_tokens: int = 20000,
    timeout_seconds: Optional[float] = None,
    logger: Optional[logging.Logger] = None,
) -> str:
    """
    Один запрос к xAI Grok.
    prompt уходит как system, text как user.
    """
    log = logger or LOGGER
    eff_timeout = float(timeout_seconds if timeout_seconds is not None else GROK_TIMEOUT_SECONDS)

    messages = []
    if prompt:
        messages.append({"role": "system", "content": prompt})
    messages.append({"role": "user", "content": text})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    log.info(
        "[Grok] Request start model=%s len_text=%d len_prompt=%d timeout=%ss",
        model, len(text or ""), len(prompt or ""), eff_timeout
    )

    t0 = time.perf_counter()
    r = requests.post(
        GROK_API_URL,
        headers=_headers(),
        json=payload,
        timeout=eff_timeout,
    )
    elapsed = time.perf_counter() - t0

    # Если не 2xx, попробуем вытащить тело для логов
    if not (200 <= r.status_code < 300):
        body_preview = (r.text or "")[:800].replace("\n", " ")
        log.warning("[Grok] HTTP %s elapsed=%.2fs body_preview=%r", r.status_code, elapsed, body_preview)
        r.raise_for_status()

    resp_json = r.json()
    result = _extract_text(resp_json)
    preview = result[:500].replace("\n", " ")
    log.info("[Grok] OK model=%s len=%d elapsed=%.2fs preview=%r", model, len(result), elapsed, preview)
    return result


def ask_grok_with_retry(
    *,
    text: str,
    prompt: str,
    model: str = "grok-4-1-fast-reasoning",
    max_retries: int = 2,
    base_wait_seconds: float = 2.0,
    max_wait_seconds: float = 60.0,
    temperature: float = 1.0,
    max_tokens: int = 20000,
    timeout_seconds: Optional[float] = None,
    logger: Optional[logging.Logger] = None,
) -> str:
    """
    Повторяет запрос при rate limit и временных сбоях.
    Backoff: экспоненциальный с джиттером.
    """
    log = logger or LOGGER
    last_exc: Optional[Exception] = None

    def _sleep_for(attempt: int) -> float:
        # base * 2^attempt + jitter, capped
        wait = base_wait_seconds * (2 ** attempt)
        wait = min(wait, max_wait_seconds)
        wait = wait + random.uniform(0.0, 0.25 * wait)
        return wait

    for attempt in range(max_retries + 1):
        log.info("[Grok] Attempt %d/%d model=%s timeout=%ss", attempt + 1, max_retries + 1, model, timeout_seconds or GROK_TIMEOUT_SECONDS)
        t_attempt = time.perf_counter()
        try:
            return ask_grok(
                text=text,
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                logger=log,
            )

        except requests.HTTPError as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            status = getattr(e.response, "status_code", None)

            retryable = status in (408, 409, 425, 429, 500, 502, 503, 504)
            msg = ""
            try:
                msg = (e.response.text or "").lower()
            except Exception:
                pass
            if "rate limit" in msg or "too many requests" in msg:
                retryable = True

            log.warning(
                "[Grok] HTTPError status=%s retryable=%s attempt=%d/%d elapsed=%.2fs err=%s",
                status, retryable, attempt + 1, max_retries + 1, elapsed_attempt, e,
                exc_info=True,
            )
            last_exc = e

            if retryable and attempt < max_retries:
                time.sleep(_sleep_for(attempt))
                continue
            raise

        except (requests.Timeout, requests.ConnectionError) as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            log.warning(
                "[Grok] Network/Timeout retryable attempt=%d/%d elapsed=%.2fs err=%s",
                attempt + 1, max_retries + 1, elapsed_attempt, e,
                exc_info=True,
            )
            last_exc = e
            if attempt < max_retries:
                time.sleep(_sleep_for(attempt))
                continue
            raise

        except Exception as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            log.exception("[Grok] Unexpected error after %.2fs", elapsed_attempt)
            last_exc = e
            raise

    # сюда обычно не дойдёт
    raise last_exc or RuntimeError("Unknown Grok retry failure")


# =========================
# 4) DETECT: ОБОРВАННЫЙ JSON
# =========================

END_SUSPECTS = {",", ":", '"', "{", "[", "-", "\\"}

def is_truncated_json(s: str) -> bool:
    if not s:
        return False
    txt = s.strip()
    if txt and txt[-1] in END_SUSPECTS:
        return True

    braces = 0
    brackets = 0
    in_string = False
    escape = False

    for ch in txt:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == "{":
                braces += 1
            elif ch == "}":
                braces -= 1
            elif ch == "[":
                brackets += 1
            elif ch == "]":
                brackets -= 1

    if braces > 0 or brackets > 0 or in_string:
        return True

    try:
        json.loads(txt)
        return False
    except Exception as e:
        m = str(e).lower()
        return any(k in m for k in ("eof while parsing", "unterminated", "expecting value"))


# =========================
# 5) REPAIR: "ОБОРВАННЫЙ JSON" (вторая попытка)
# =========================

def build_repair_prompt(new_prompt: str, glued_raw_text: str, broken_json: str) -> Tuple[str, str]:
    prompt = (
        f"{new_prompt}\n\n"
        "CONTEXT\n"
        "You are extracting structured information from the OCR text of financial documents (invoices, receipts, or similar).\n"
        "The partially extracted JSON in BROKEN_JSON already contains valid values that MUST be preserved as-is.\n\n"
        "YOUR TASK\n"
        "- Continue exactly where BROKEN_JSON was truncated.\n"
        "- Do NOT modify, correct, or re-interpret any existing values (keys, values, types, order) already present in BROKEN_JSON.\n"
        "- Only finish incomplete structures (close objects/arrays/strings) and complete the obviously missing tail.\n"
        "- Use GLUED_RAW_TEXT only to resolve an obviously missing value for an already-started object in BROKEN_JSON.\n"
        "- If unsure about a value, OMIT the field instead of guessing.\n\n"
        "OUTPUT FORMAT (STRICT)\n"
        "- Return ONLY a valid JSON object in ONE SINGLE LINE (compact). No markdown, no comments, no code fences, no extra text.\n"
        "- The result must be directly parsable by JSON.parse().\n"
    )
    text = (
        "GLUED_RAW_TEXT:\n"
        f"{glued_raw_text}\n\n"
        "BROKEN_JSON:\n"
        f"{broken_json}"
    )
    return prompt, text


def repair_truncated_json_with_grok(
    *,
    broken_json: str,
    glued_raw_text: str,
    model: str = "grok-4-1-fast-reasoning",
    logger: Optional[logging.Logger] = None,
) -> str:
    new_retry_prompt = (
        "Second attempt. In the previous response, you tried to extract structured data from the OCR text "
        "of a financial document, but the JSON you returned was truncated. "
        "I'm now providing the same OCR text together with your truncated JSON and updated instructions. "
        "Finish and repair the JSON without altering any information that was already extracted."
    )
    prompt, text = build_repair_prompt(new_retry_prompt, glued_raw_text, broken_json)
    return ask_grok_with_retry(
        text=text,
        prompt=prompt,
        model=model,
        temperature=0.0,
        max_tokens=20000,
        timeout_seconds=300,
        logger=logger,
    )


# =========================
# 6) FOLLOW-UP: truncated_json=true -> полный JSON без лимита (аналог твоего)
# =========================

def build_truncated_followup_prompt(glued_raw_text: str, previous_json: str) -> Tuple[str, str]:
    prompt = (GROK_TRUNCATED_TO_FULL_PROMPT or "").strip()
    if not prompt:
        prompt = (
            'You previously returned a JSON with "truncated_json": true. '
            'Now return the COMPLETE one-line JSON for the same document. '
            'Preserve PREVIOUS_PARTIAL_JSON exactly and only append missing line_items until count==total_lines. '
            'Return ONLY JSON, starting with { and ending with }.'
        )

    text = (
        "GLUED_RAW_TEXT:\n"
        f"{glued_raw_text}\n\n"
        "PREVIOUS_PARTIAL_JSON:\n"
        f"{previous_json}"
    )
    return prompt, text


def request_full_json_with_grok(
    *,
    glued_raw_text: str,
    previous_json: str,
    model: str = "grok-4-1-fast-reasoning",
    logger: Optional[logging.Logger] = None,
) -> str:
    prompt, text = build_truncated_followup_prompt(glued_raw_text, previous_json)

    if logger:
        logger.info("[Grok][FULL] prompt_len=%s text_len=%s prompt_head=%r",
                    len(prompt or ""), len(text or ""), (prompt or "")[:120])

    return ask_grok_with_retry(
        text=text,
        prompt=prompt,
        model=model,
        temperature=0.0,
        max_tokens=30000,
        timeout_seconds=300,
        logger=logger,
    )


# =========================
# 7) ПРИМЕР БЫСТРОГО ТЕСТА
# =========================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Простой тест как в curl, но на нужной модели:
    out = ask_grok_with_retry(
        text="What is the meaning of life, the universe, and everything?",
        prompt="",  # без system-инструкции
        model="grok-4-1-fast-reasoning",
        temperature=0.7,
        max_tokens=512,
        timeout_seconds=60,
    )
    print(out)
