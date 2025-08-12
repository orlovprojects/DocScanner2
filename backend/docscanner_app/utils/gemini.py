import os
import time
import openai  # для совместимого RateLimitError
from dotenv import load_dotenv
from google import genai

load_dotenv()

# =========================
# 1) КЛИЕНТ GEMINI
# =========================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("Не найден GEMINI_API_KEY в переменных окружения.")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)

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

All boolean fields (seller_is_person, buyer_is_person, with_receipt, separate_vat) must be returned as true/false, not as strings.

**Return the result as a valid JSON object with this structure:**
```json
{
  "docs": <number_of_documents>,
  "documents": [
    {
      "document_type": "",
      "seller_id": "",
      "seller_name": "",
      "seller_vat_code": "",
      "seller_address": "",
      "seller_country": "",
      "seller_country_iso": "",
      "seller_iban": "",
      "seller_is_person": "",
      "buyer_id": "",
      "buyer_name": "",
      "buyer_vat_code": "",
      "buyer_address": "",
      "buyer_country": "",
      "buyer_country_iso": "",
      "buyer_iban": "",
      "buyer_is_person": "",
      "invoice_date": "",
      "due_date": "",
      "operation_date": "",
      "document_series": "",
      "document_number": "",
      "order_number": "",
      "amount_wo_vat": "",
      "vat_amount": "",
      "vat_percent": "",
      "amount_with_vat": "",
      "separate_vat": "",
      "currency": "",
      "with_receipt": "",
    }
  ]
}
Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code.
If 2 or more different VAT '%' in doc, separate_vat must be True, otherwise False.

If the document is a kasos čekis (cash receipt), for example, a fuel (kuro) receipt, buyer info is often at the bottom as a line with company name, company code, and VAT code—extract these as buyer details. For line items, find the quantity and unit next to price (like “50,01 l” for litres). Product name is usually above this line. document_number is usually next to kvitas, ignore long numer below "kasininkas" at the bottom of document but don't ignore date at the bottom.

Return ONLY a valid JSON object according to the provided structure. Do not include any explanations or extra text outside the JSON.
Do NOT add any markdown formatting (do not use json or ).
If you cannot extract any documents, return exactly:
{
  "docs": 0,
  "documents": []
}

If you identified > 1 documents, no detailed data is needed, return only this:
{
  "docs": <number_of_documents>,
  "documents": []
}
"""

GEMINI_DETAILED_PROMPT = """
You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

1. First, analyze the text and determine **how many separate documents** are present. Return this number as an integer in the field "docs". Then, count the total number of line items (products/services) across all documents and return this number as an integer in the field total_lines.

2. For each document, after extracting all line items, calculate the sum of their subtotal, vat, and total fields. Then compare these sums with the document amount_wo_vat, vat_amount, and amount_with_vat fields. If the absolute difference for each sum is ≤ 0.05 (use four decimals), set "ar_sutapo": true; otherwise, false.

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

All boolean fields (seller_is_person, buyer_is_person, with_receipt, separate_vat) must be returned as true/false, not as strings.

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

- If a discount (“nuolaida”) is present for any line item, first identify whether the discount amount is stated with VAT (“su PVM”) or without VAT (“be PVM”). Extract the discount amount and assign it to the "discount" field of the corresponding line item. If the discount includes VAT, set its value in the "discount_with_vat" field; if the discount excludes VAT, set its value in the "discount_wo_vat" field. Always subtract the discount from the line item's “subtotal” and “total”. If it is not clear to which product or service a discount/credit applies, add it as an **invoice-level discount** (invoice_discount_wo_vat or invoice_discount_with_vat), but do not create a line item for it.

- Do not add discounts as separate line items, always attach them to the relevant product or service.

- If document includes any fees (such as shipping, transaction, payment processing, etc.), each fee must be extracted as a separate line item.

- Do not mix up fees, discounts, or credits with VAT. VAT must be extracted only if it is explicitly and clearly stated with '%' in the document.

- If document doesn't have obvious line items but has a table or list of payments/transactions, use them as line items.

- Do **NOT** treat “Subtotal”, “Total”, “VAT”, “Billing cycle”, “Billed for”, “Payment method”, “Transaction credit”, “Transaction fees”, “Apps”, or any similar summary, heading, or informational lines as separate line items. Only extract as line items actual paid products/services, subscriptions, and app charges, NOT summary rows or section headings.

- If you see “Transaction credit” or any line with a negative amount (such as “-$0.02”), **do not create a separate line item** for it. Instead, treat it as a discount (“nuolaida”).

- If line item doesn't clearly show total, don't use it for that line item. 


**Return the result as a valid JSON object with this structure:**
{
  "docs": <number_of_documents>,
  "total_lines": <total_number_of_lines>,
  "ar_sutapo": "",
  "documents": [
    {
      "document_type": "",
      "seller_id": "",
      "seller_name": "",
      "seller_vat_code": "",
      "seller_address": "",
      "seller_country": "",
      "seller_country_iso": "",
      "seller_iban": "",
      "seller_is_person": "",
      "buyer_id": "",
      "buyer_name": "",
      "buyer_vat_code": "",
      "buyer_address": "",
      "buyer_country": "",
      "buyer_country_iso": "",
      "buyer_iban": "",
      "buyer_is_person": "",
      "invoice_date": "",
      "due_date": "",
      "operation_date": "",
      "document_series": "",
      "document_number": "",
      "order_number": "",
      "invoice_discount_wo_vat": "",
      "invoice_discount_with_vat": "",
      "amount_wo_vat": "",
      "vat_amount": "",
      "vat_percent": "",
      "amount_with_vat": "",
      "separate_vat": "",
      "currency": "",
      "with_receipt": "",
      "line_items": [
        {
          "line_id": "",
          "type": "",
          "product_code": "",
          "product_barcode": "",
          "product_name": "",
          "unit": "",
          "quantity": "",
          "price": "",
          "subtotal": "",
          "discount_wo_vat": "",
          "vat": "",
          "vat_percent": "",
          "discount_with_vat": "",
          "total": "",
          "preke_paslauga": ""
        }
      ]
    }
  ]
}

Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code. 
If 2 or more different VAT '%' in doc, separate_vat must be True, otherwise False.
For unit, try to identify any of these vnt kg g mg kompl t ct m cm mm km l ml m2 cm2 dm2 m3 cm3 dm3 val h min s d sav mėn metai pak kompl or similar. If units is not in Lithuanian, translate it (example: szt should be vnt). If can't identify unit, choose vnt.

If the document is a kasos čekis (cash receipt), for example, a fuel (kuro) receipt, buyer info is often at the bottom as a line with company name, company code, and VAT code—extract these as buyer details. For line items, find the quantity and unit next to price (like “50,01 l” for litres). Product name is usually above this line. document_number is usually next to kvitas, ignore long numer below "kasininkas" at the bottom of document but don't ignore date at the bottom.

Return ONLY a valid JSON object according to the provided structure. Do not include any explanations or extra text outside the JSON.
Do NOT add any markdown formatting (do not use json or ).

If you cannot extract any documents, return exactly:
{
  "docs": 0,
  "documents": []
}

If you identified > 1 documents, no detailed data is needed, return only this:
{
  "docs": <number_of_documents>,
  "documents": []
}
"""

# =========================
# 3) ОСНОВНЫЕ ФУНКЦИИ
# =========================
def ask_gemini(text: str, prompt: str, model: str = "gemini-2.5-flash", temperature: float = 0.3, max_output_tokens: int = 12000) -> str:
    """
    Делает один запрос к Gemini API с промптом и OCR-текстом.
    По умолчанию — модель 'gemini-2.5-flash', можно поменять на 'gemini-2.5-pro'.
    """
    full_prompt = prompt + "\n\n" + text

    response = gemini_client.models.generate_content(
        model=model,
        contents=full_prompt,
        config={
            "temperature": temperature,
            "max_output_tokens": max_output_tokens
        }
    )
    result = response.text.strip()
    print("\n===== Gemini ответ =====\n", result, "\n=====================\n")
    return result


def ask_gemini_with_retry(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    max_retries: int = 2,
    wait_seconds: int = 60,
    temperature: float = 0.3,
    max_output_tokens: int = 12000
) -> str:
    """
    Повторяет запрос при Rate Limit / временных сбоях.
    """
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return ask_gemini(
                text=text,
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_output_tokens=max_output_tokens
            )
        except openai.RateLimitError as e:
            print(f"[Gemini] Rate limit. Попытка {attempt + 1}/{max_retries + 1}. Ждём {wait_seconds} сек...")
            last_exc = e
            if attempt < max_retries:
                time.sleep(wait_seconds)
        except Exception as e:
            msg = str(e).lower()
            if "rate limit" in msg or "429" in msg:
                print(f"[Gemini] Похоже rate limit. Попытка {attempt + 1}/{max_retries + 1}. Ждём {wait_seconds} сек...")
                last_exc = e
                if attempt < max_retries:
                    time.sleep(wait_seconds)
            else:
                raise
    raise last_exc
