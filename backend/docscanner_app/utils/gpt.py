import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)

DEFAULT_PROMPT = """You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

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

DETAILED_PROMPT = """
You will receive raw OCR text from one or more scanned financial documents, which may include invoices, receipts, or similar forms.

1. First, analyze the text and determine **how many separate documents** are present. Return this number as an integer in the field "docs". Then, count the total number of line items (products/services) across all documents and return this number as an integer in the field total_lines.

2. For each document, after extracting all line items, calculate the sum of their subtotal, vat, and total fields. Then compare these sums with the document amount_wo_vat, vat_amount, and amount_with_vat fields. If all three sums match exactly (use two decimal places for comparison), set the field "ar_sutapo" to true. If any of the sums differ, set "ar_sutapo" to false.

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
- vat
- vat_percent
- total
- vat_class
- warehouse
- object

Each document must have a "line_items" field containing an array of line items (may be empty if not found).
If document includes any fees (such as shipping, transaction, payment processing, etc.), each fee must be extracted as a separate line item.
Do not mix up fees, discounts, or credits with VAT. VAT must be extracted only if it is explicitly and clearly stated in the document.
If document doesn't have obvious line items but has a table or list of payments/transactions, use them as line items.


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
          "vat": "",
          "vat_percent": "",
          "total": "",
          "vat_class": "",
          "warehouse": "",
          "object": ""
        }
      ]
    }
  ]
}

Format dates as yyyy-mm-dd. Delete country from addresses. seller_country and buyer_country must be full country name in language of address provided. country_iso must be 2-letter code. 
If 2 or more different VAT '%' in doc, separate_vat must be True, otherwise False.
For unit, try to identify any of these vnt kg g mg t ct m cm mm km l ml m2 cm2 dm2 m3 cm3 dm3 val h min s d sav mėn metai pak kompl or similar. If units is not in Lithuanian, translate it (example: szt should be vnt). If can't identify unit, choose vnt.

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

def ask_gpt(text: str, prompt: str) -> str:
    full_prompt = prompt + "\n\n" + text

    response = client.chat.completions.create(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that extracts and structures data from documents. The input text contains positional coordinates for each text block in the format [x1,y1; x2,y2; x3,y3; x4,y4]. Use these coordinates to accurately identify and extract fields, especially when similar fields appear more than once."},
            {"role": "user", "content": full_prompt}
        ],
        temperature=0.3,
        max_tokens=5048
    )
    result = response.choices[0].message.content.strip()
    print("\n===== GPT ответ =====\n", result, "\n=====================\n")
    return result