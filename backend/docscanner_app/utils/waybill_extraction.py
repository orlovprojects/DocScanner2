# """
# waybill_extraction.py - Izvlechenije polej iz oro vaztarastis.

# Pipeline:
#   1. Kartinka → KIE Gemini 2.5 Flash (thinking) → structured JSON (vse polja)
#   2. Kartinka → KIE Gemini 3.5 Flash (reasoning_effort=high) → checkbox verification
#   3. Merge: checkbox results iz 3.5 Flash perezapisyvajut checkbox polja iz 2.5 Flash
  
# Fallback: Direct Gemini 2.5 Flash (thinking)
# """
# import base64
# import json
# import logging
# import os
# import re
# import time
# import requests
# from datetime import date
# from decimal import Decimal, InvalidOperation

# logger = logging.getLogger("docscanner_app")


# def _t():
#     return time.perf_counter()

# def _log_t(label, t0):
#     logger.info("[WAYBILL-TIME] %s: %.2fs", label, time.perf_counter() - t0)

# def _extract_json_object(s):
#     if not s:
#         return {}
#     s = s.strip()
#     if s.startswith("```"):
#         s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
#         s = re.sub(r"\s*```$", "", s)
#     m = re.search(r"\{.*\}", s, flags=re.DOTALL)
#     if not m:
#         return {}
#     try:
#         return json.loads(m.group(0))
#     except Exception:
#         return {}

# def _get_mime_type(filename):
#     ext = ""
#     if filename:
#         ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
#     mime_map = {
#         "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
#         "webp": "image/webp", "tiff": "image/tiff", "tif": "image/tiff",
#         "pdf": "application/pdf",
#     }
#     return mime_map.get(ext, "image/jpeg")


# # ============================================================
# # Prompts
# # ============================================================

# WAYBILL_PROMPT = """You are analyzing a scanned aviation fuel delivery waybill (oro važtaraštis).
# Perform accurate OCR on the image and extract all data into a single JSON object.

# === CHECKBOX RECOGNITION ===
# This document has checkbox fields. A checkbox is CHECKED if it contains ANY mark inside: ✓, X, V, tick, cross, filled square, or any handwritten mark. UNCHECKED = completely empty box.

# Checkbox groups and their locations on the document:
# - TOP RIGHT: 'Važtaraštis kurui užpilti / Delivery receipt' and 'Važtaraštis kurui išpilti / Defuelling receipt'
# - LEFT SIDE Payment method: 'pavedimu/Invoice', 'kuro užpylimo kortelė/Fuelling card', 'grynais/cash', 'kortelė/credit card'
# - MIDDLE: 'Aviakompanija, daugiau kaip pusę pajamų...' / 'Airline earning more than half of its annual income from transportation...'
# - RIGHT SIDE Nature of flight: 'komercinis/commercial', 'privatus/private', 'kita/other'
# - RIGHT SIDE: 'už ES ribų / outside the EU'
# - BOTTOM Product: 'JET A-1', 'AVGAS 100LL'
# - BOTTOM Currency: 'EUR', 'USD'
# - BOTTOM Free of: 'vandens/water', 'purvo/dirt'

# A handwritten tick (✓) or check mark INSIDE or NEXT TO a box = CHECKED.

# === FIELDS TO EXTRACT ===

# Document:
# - airport: airport code and name, format "CODE / Name" (e.g. "KUN / Kaunas", "VNO / Vilnius")
# - document_number: Nr. field
# - document_date: yyyy-mm-dd
# - payment_type: one of "pavedimu", "kuro užpylimo kortelė", "grynais", "kreditinė kortelė", "kitas" — based on which payment checkbox is checked
# - delivery_receipt: true/false based on checkbox
# - defuelling_receipt: true/false based on checkbox (only one can be true)

# Buyer / Customer (pirkėjas):
# - buyer_iata_code: IATA code
# - buyer_name: company name
# - buyer_address: address/country
# - buyer_vat_code: V.A.T. code
# - buyer_remark_half_income: true/false based on the airline income checkbox
# - buyer_remark_other: text from "Kita/Other" field

# Aircraft and flight:
# - aircraft_type: e.g. "C25A", "B738", "A320"
# - flight_type: the "tipas/type" number (e.g. "1") — NOT the nature of flight
# - outside_eu: true/false based on "už ES ribų" checkbox
# - flight_nature: one of "komercinis", "privatus", "kita" — based on Nature of flight checkboxes

# Timing (as HH:MM 24h strings):
# - time_departure, time_arrival, time_start, time_finish, time_return

# Flight route:
# - from_city, from_airport_code, from_country_iso (2-letter ISO)
# - to_city, to_airport_code, to_country_iso (2-letter ISO)

# Readings:
# - refueller_number, reading_before (number), reading_after (number), reading_difference (number)

# Operator:
# - company_representative: name of operator/driver

# Fuel measurements — observed (actual):
# - density_observed, temperature_observed, quantity_liters_observed, quantity_kg_observed (all numbers)

# Fuel measurements — standard (+15°C):
# - density_standard, temperature_standard, quantity_liters_standard (all numbers)

# === RULES ===
# 1. Return ONLY valid JSON, compact single-line. No markdown, no code fences.
# 2. Dates as yyyy-mm-dd. Times as HH:MM.
# 3. Numbers = JSON numbers. Codes/identifiers = strings. Booleans = true/false.
# 4. Omit empty/null fields.
# 5. Do NOT extract the fuel provider (NAFTELF etc.) — only the customer/buyer.
# 6. Two measurement rows: first = observed, second = standard at +15°C.
# 7. Output must be parsable by JSON.parse().
# 8. If not an aviation fuel waybill: {"netinkamas_dokumentas":true}
# """

# # CHECKBOX_VERIFICATION_PROMPT = """Look at this scanned aviation fuel delivery waybill document.

# # Here is a list of ALL checkboxes in this document and their exact positions:
# # 1. Delivery receipt (Važtaraštis kurui užpilti) — checkbox to the RIGHT of label text
# # 2. Defuelling receipt (Važtaraštis kurui išpilti) — checkbox to the RIGHT of label text
# # 3. pavedimu / Invoice — checkbox to the RIGHT of label text
# # 4. kuro užpylimo kortelė / Fuelling card — checkbox to the RIGHT of label text
# # 5. grynais / cash — checkbox to the RIGHT of label text
# # 6. kortelė / credit card — checkbox to the RIGHT of label text
# # 7. Airline earning more than half of its annual income from transportation of passengers and/or cargo — checkbox to the LEFT of label text
# # 8. komercinis / commercial — checkbox to the LEFT of label text, Nature of flight section
# # 9. privatus / private — checkbox to the LEFT of label text, Nature of flight section
# # 10. kita / other — checkbox to the LEFT of label text, Nature of flight section
# # 11. už ES ribų / outside the EU — checkbox to the RIGHT of label text
# # 12. JET A-1 — checkbox to the RIGHT of label text
# # 13. AVGAS 100LL — checkbox to the RIGHT of label text
# # 14. vandens / water — checkbox to the RIGHT of label text
# # 15. purvo / dirt — checkbox to the RIGHT of label text
# # 16. EUR — checkbox to the LEFT of label text, currency section
# # 17. USD — checkbox to the LEFT of label text, currency section

# # A checkbox is CHECKED if it contains ANY visible mark inside the box: a tick ✓, X, V, cross, filled area, or any handwritten mark. A checkbox is UNCHECKED only if the box is completely empty with no marks.
# # Think properly, I need accurate identifications.

# # Return ONLY a JSON object with the checkbox numbers that are CHECKED. Example of response:
# # {"checked": [1, 3, 8, 12, 14, 15]}

# # Return ONLY the JSON. No markdown, no explanation."""

# CHECKBOX_VERIFICATION_PROMPT = """You are a meticulous visual inspector analyzing a scanned aviation fuel delivery waybill. Your task is to determine exactly which checkboxes are CHECKED.

# Below is the numbered list of all checkboxes, with their position relative to the accompanying text. The checkbox itself is a small square; it may be empty or contain a mark.

# 1. Delivery receipt (Važtaraštis kurui užpilti) — checkbox to the RIGHT of label text
# 2. Defuelling receipt (Važtaraštis kurui išpilti) — checkbox to the RIGHT of label text
# 3. pavedimu / Invoice — checkbox to the RIGHT of label text
# 4. kuro užpildymo kortelė / Fuelling card — checkbox to the RIGHT of label text
# 5. grynais / cash — checkbox to the RIGHT of label text
# 6. kortelė / credit card — checkbox to the RIGHT of label text
# 7. Airline earning more than half of its annual income from transportation... — checkbox to the LEFT of label text
# 8. komercinis / commercial — checkbox to the LEFT of label text (Nature of flight)
# 9. privatus / private — checkbox to the LEFT of label text (Nature of flight)
# 10. kita / other — checkbox to the LEFT of label text (Nature of flight)
# 11. už ES ribų / outside the EU — checkbox to the RIGHT of label text
# 12. JET A-1 — checkbox to the RIGHT of label text
# 13. AVGAS 100LL — checkbox to the RIGHT of label text
# 14. vandens / water — checkbox to the RIGHT of label text
# 15. purvo / dirt — checkbox to the RIGHT of label text
# 16. EUR — checkbox to the LEFT of label text (currency section)
# 17. USD — checkbox to the LEFT of label text (currency section)

# **Definition of CHECKED (must be returned):**
# - The box is CHECKED if there is ANY intentional mark INSIDE the borders of the square box: a tick (✓), cross (✗), X, V, filled square, diagonal line, dot, scribble, or any handwritten stroke that overlaps the box interior.
# - Even a small, faint, or partial mark counts as CHECKED.
# - A simple shadow, smudge from printing, or background noise that does NOT form a deliberate marking inside the box is UNCHECKED.
# - If the box is completely empty and clean (no marks), it is UNCHECKED.
# - Do NOT confuse text or lines printed outside the box as a mark inside the box.

# **Procedure:**
# 1. Zoom in your mental view on each checkbox region. Identify the square box precisely, not the surrounding text.
# 2. For each box, ask: "Is there any pixel that differs from the paper background inside this square and looks like a deliberate stroke, tick, cross, X, V, dot, or filled area?"
# 3. List the numbers of boxes that satisfy the CHECKED condition.
# 4. Double-check your list: re-examine any borderline box. Only include if you are certain there is a mark inside.

# **Final output:**
# Return ONLY a compact JSON object with the key "checked" and an array of those checkbox numbers that are checked. Example: {"checked": [1, 3, 8, 12, 14, 15]}

# You may briefly explain your observations before the JSON, but the very last line of your response must be the JSON object and nothing else. No markdown fences, no extra text after the JSON.
# """


# # ============================================================
# # Checkbox number → field mapping
# # ============================================================

# CHECKBOX_MAP = {
#     1: ("delivery_receipt", True),
#     2: ("defuelling_receipt", True),
#     3: ("payment_type", "pavedimu"),
#     4: ("payment_type", "kuro užpylimo kortelė"),
#     5: ("payment_type", "grynais"),
#     6: ("payment_type", "kreditinė kortelė"),
#     7: ("buyer_remark_half_income", True),
#     8: ("flight_nature", "komercinis"),
#     9: ("flight_nature", "privatus"),
#     10: ("flight_nature", "kita"),
#     11: ("outside_eu", True),
# }

# # Polja kotoryje nado resetnut pered primenenijem checkbox rezultatov
# CHECKBOX_RESET = {
#     "delivery_receipt": False,
#     "defuelling_receipt": False,
#     "payment_type": None,
#     "buyer_remark_half_income": False,
#     "flight_nature": None,
#     "outside_eu": False,
# }


# def _apply_checkbox_results(structured, checked_numbers):
#     """Primenijaet rezultaty proverki checkboxov na structured JSON."""
#     # Reset vse checkbox polja
#     for field, default in CHECKBOX_RESET.items():
#         structured[field] = default

#     # Primenijaem checked
#     for num in checked_numbers:
#         if num in CHECKBOX_MAP:
#             field, value = CHECKBOX_MAP[num]
#             structured[field] = value

#     return structured


# # ============================================================
# # Main extraction function
# # ============================================================

# def extract_waybill_from_image(image_data, filename=None):
#     """
#     1. KIE Gemini 2.5 Flash (thinking) → vse polja JSON
#     2. KIE Gemini 3.5 Flash (reasoning_effort=high) → checkbox verification
#     3. Merge checkbox results

#     Returns: (structured, raw_response_main, raw_response_checkboxes, error)
#     """
#     mime_type = _get_mime_type(filename)
#     b64 = base64.b64encode(image_data).decode("utf-8")
#     data_url = f"data:{mime_type};base64,{b64}"

#     # ── Step 1: Main extraction (Gemini 2.5 Flash) ──
#     t0 = _t()
#     raw_main = None
#     source = None

#     try:
#         raw_main = _call_kie(
#             data_url=data_url,
#             prompt=WAYBILL_PROMPT,
#             endpoint_key="flash25",
#             filename=filename,
#             image_size=len(image_data),
#         )
#         source = "kie-gemini-2.5-flash"
#     except Exception as e:
#         logger.warning("[WAYBILL] KIE 2.5 Flash failed: %s — trying direct Gemini", e)

#     # Fallback: Direct Gemini
#     if not raw_main:
#         try:
#             raw_main = _call_direct_gemini(image_data, mime_type, filename)
#             source = "direct-gemini-2.5-flash"
#         except Exception as e:
#             _log_t("All extraction failed", t0)
#             return None, None, None, str(e)

#     _log_t(f"Step 1: Main extraction ({source})", t0)

#     if not raw_main or not raw_main.strip():
#         return None, raw_main, None, "Empty response from main extraction"

#     structured = _extract_json_object(raw_main)
#     if not structured:
#         return None, raw_main, None, "Failed to parse main JSON"

#     if structured.get("netinkamas_dokumentas"):
#         return structured, raw_main, None, None

#     logger.info("[WAYBILL] Step 1 OK: %d fields, number=%s",
#                 len(structured), structured.get("document_number", "?"))

#     # ── Step 2: Checkbox verification (Gemini 3.5 Flash) ──
#     t1 = _t()
#     raw_checkboxes = None

#     try:
#         raw_checkboxes = _call_kie(
#             data_url=data_url,
#             prompt=CHECKBOX_VERIFICATION_PROMPT,
#             endpoint_key="flash35",          # <--- заменено с pro31 на flash35
#             filename=filename,
#             image_size=len(image_data),
#         )
#     except Exception as e:
#         logger.warning("[WAYBILL] KIE 3.5 Flash checkbox verification failed: %s — using 2.5 Flash results", e)

#     if raw_checkboxes:
#         _log_t("Step 2: Checkbox verification (3.5 Flash)", t1)

#         cb_data = _extract_json_object(raw_checkboxes)
#         checked = cb_data.get("checked", [])

#         if isinstance(checked, list) and len(checked) > 0:
#             logger.info("[WAYBILL] Checkbox verification: checked=%s", checked)
#             structured = _apply_checkbox_results(structured, checked)
#         else:
#             logger.warning("[WAYBILL] Checkbox verification returned no/invalid data: %r", raw_checkboxes[:300])
#     else:
#         logger.warning("[WAYBILL] Checkbox verification skipped — using 2.5 Flash results")
#         _log_t("Step 2: Checkbox verification (skipped)", t1)

#     return structured, raw_main, raw_checkboxes, None


# # ============================================================
# # KIE API call (universal)
# # ============================================================

# KIE_ENDPOINTS = {
#     "flash25": {
#         "url_attr": "KIE_GEMINI_FLASH_URL",
#         "label": "kie-gemini-2.5-flash",
#         "extra": {"include_thoughts": True, "temperature": 0.2},
#     },
#     "flash35": {
#         "url_attr": "KIE_GEMINI_35_FLASH_URL",
#         "label": "kie-gemini-3.5-flash",
#         "extra": {"include_thoughts": True, "reasoning_effort": "high", "temperature": 0.0},
#     },
#     "pro31": {
#         "url_attr": "KIE_GEMINI_31_PRO_URL",
#         "label": "kie-gemini-3.1-pro",
#         "extra": {"include_thoughts": True, "reasoning_effort": "high", "temperature": 0.3},
#     },
# }

# def _call_kie(data_url, prompt, endpoint_key, filename=None, image_size=0):
#     """Universal KIE call s kartinkoj."""
#     from .kie import (
#         _kie_headers,
#         _extract_content_from_kie_response,
#         _raise_if_kie_error,
#         KieAPIError,
#     )
#     import importlib
#     kie_module = importlib.import_module('.kie', package=__package__)

#     ep_config = KIE_ENDPOINTS[endpoint_key]
#     url = getattr(kie_module, ep_config["url_attr"])
#     label = ep_config["label"]
#     extra = ep_config["extra"]

#     payload = {
#         "messages": [
#             {
#                 "role": "user",
#                 "content": [
#                     {"type": "image_url", "image_url": {"url": data_url}},
#                     {"type": "text", "text": prompt},
#                 ],
#             }
#         ],
#         "stream": False,
#         "max_tokens": 15000,
#         **extra,
#     }

#     logger.info("[WAYBILL-KIE] Sending %s (%d bytes) to %s",
#                 filename or "unknown", image_size, label)

#     t0 = time.perf_counter()

#     resp = requests.post(url, headers=_kie_headers(), json=payload, timeout=120.0)
#     elapsed = time.perf_counter() - t0

#     try:
#         data = resp.json()
#     except Exception:
#         resp.raise_for_status()
#         raise KieAPIError(f"KIE non-JSON: {resp.text[:500]}")

#     if resp.status_code >= 400:
#         msg = data.get("msg") or data.get("message") or str(data)
#         raise KieAPIError(f"KIE HTTP {resp.status_code}: {msg}", status_code=resp.status_code)

#     _raise_if_kie_error(data, resp.status_code)
#     result = _extract_content_from_kie_response(data)

#     logger.info("[WAYBILL-KIE] %s OK: len=%d elapsed=%.2fs", label, len(result), elapsed)

#     return result.strip() if result else ""


# # ============================================================
# # Direct Gemini 2.5 Flash — fallback s thinking
# # ============================================================

# def _call_direct_gemini(image_data, mime_type, filename=None):
#     try:
#         from google import genai
#         from google.genai import types
#     except ImportError:
#         raise Exception("google-genai not installed")

#     api_key = os.environ.get("GEMINI_API_KEY")
#     if not api_key:
#         raise Exception("GEMINI_API_KEY not set")

#     client = genai.Client(
#         api_key=api_key,
#         http_options=types.HttpOptions(timeout=120_000),
#     )

#     contents = [
#         types.Content(
#             role="user",
#             parts=[
#                 types.Part.from_bytes(data=image_data, mime_type=mime_type),
#                 types.Part.from_text(text=WAYBILL_PROMPT),
#             ],
#         )
#     ]

#     config = types.GenerateContentConfig(
#         thinking_config=types.ThinkingConfig(thinking_budget=4096),
#     )

#     logger.info("[WAYBILL-DIRECT] Sending %s (%d bytes) to gemini-2.5-flash (thinking=4096)",
#                 filename or "unknown", len(image_data))

#     response = client.models.generate_content(
#         model="gemini-2.5-flash", contents=contents, config=config,
#     )

#     text_parts = []
#     if response.candidates:
#         for part in response.candidates[0].content.parts:
#             if part.text and not getattr(part, 'thought', False):
#                 text_parts.append(part.text)

#     return "".join(text_parts).strip()


# # ============================================================
# # Duplicate check
# # ============================================================

# def is_waybill_duplicate(user, document_number, exclude_doc_id=None):
#     if not document_number or not str(document_number).strip():
#         return False

#     from ..models import ScannedWaybill

#     qs = ScannedWaybill.objects.filter(
#         user=user,
#         document_number=str(document_number).strip(),
#         status__in=("completed", "exported"),
#     )
#     if exclude_doc_id:
#         qs = qs.exclude(pk=exclude_doc_id)

#     return qs.exists()


# # ============================================================
# # Mapping JSON → ScannedWaybill
# # ============================================================

# DIRECT_FIELD_MAP = {
#     "airport": "airport",
#     "document_number": "document_number",
#     "document_date": "document_date",
#     "payment_type": "payment_type",
#     "delivery_receipt": "delivery_receipt",
#     "defuelling_receipt": "defuelling_receipt",
#     "buyer_iata_code": "buyer_iata_code",
#     "buyer_name": "buyer_name",
#     "buyer_address": "buyer_address",
#     "buyer_vat_code": "buyer_vat_code",
#     "buyer_remark_half_income": "buyer_remark_half_income",
#     "buyer_remark_other": "buyer_remark_other",
#     "aircraft_type": "aircraft_type",
#     "flight_type": "flight_type",
#     "outside_eu": "outside_eu",
#     "flight_nature": "flight_nature",
#     "time_departure": "time_departure",
#     "time_arrival": "time_arrival",
#     "time_start": "time_start",
#     "time_finish": "time_finish",
#     "time_return": "time_return",
#     "from_city": "from_city",
#     "from_airport_code": "from_airport_code",
#     "from_country_iso": "from_country_iso",
#     "to_city": "to_city",
#     "to_airport_code": "to_airport_code",
#     "to_country_iso": "to_country_iso",
#     "refueller_number": "refueller_number",
#     "reading_before": "reading_before",
#     "reading_after": "reading_after",
#     "reading_difference": "reading_difference",
#     "company_representative": "company_representative",
#     "density_observed": "density_observed",
#     "temperature_observed": "temperature_observed",
#     "quantity_liters_observed": "quantity_liters_observed",
#     "quantity_kg_observed": "quantity_kg_observed",
#     "density_standard": "density_standard",
#     "temperature_standard": "temperature_standard",
#     "quantity_liters_standard": "quantity_liters_standard",
# }

# DATE_FIELDS = {"document_date"}
# BOOL_FIELDS = {"delivery_receipt", "defuelling_receipt", "buyer_remark_half_income", "outside_eu"}
# DECIMAL_FIELDS = {
#     "reading_before", "reading_after", "reading_difference",
#     "density_observed", "temperature_observed", "quantity_liters_observed", "quantity_kg_observed",
#     "density_standard", "temperature_standard", "quantity_liters_standard",
# }


# def _parse_date(val):
#     if not val:
#         return None
#     try:
#         return date.fromisoformat(str(val).strip()[:10])
#     except (ValueError, TypeError):
#         return None

# def _parse_decimal(val):
#     if val is None:
#         return None
#     try:
#         return Decimal(str(val))
#     except (InvalidOperation, TypeError, ValueError):
#         return None

# def _parse_bool(val):
#     if val is None:
#         return None
#     if isinstance(val, bool):
#         return val
#     s = str(val).strip().lower()
#     if s in ("true", "1", "yes", "taip"):
#         return True
#     if s in ("false", "0", "no", "ne"):
#         return False
#     return None


# def update_scanned_waybill(db_waybill, structured, raw_main, raw_checkboxes, preview_url):
#     """Mappit structured JSON na polia ScannedWaybill i soxraniajet."""
#     update_fields = []

#     # Soxraniajem oba raw otveta
#     db_waybill.gpt_raw_json = raw_main
#     db_waybill.structured_json = structured
#     db_waybill.preview_url = preview_url
#     update_fields.extend(["gpt_raw_json", "structured_json", "preview_url"])

#     # raw_text = main response, glued_raw_text = checkbox verification response
#     db_waybill.raw_text = raw_main
#     if raw_checkboxes:
#         db_waybill.glued_raw_text = raw_checkboxes
#     update_fields.extend(["raw_text", "glued_raw_text"])

#     for json_key, model_field in DIRECT_FIELD_MAP.items():
#         val = structured.get(json_key)
#         if val is None:
#             continue

#         if model_field in DATE_FIELDS:
#             val = _parse_date(val)
#         elif model_field in BOOL_FIELDS:
#             val = _parse_bool(val)
#         elif model_field in DECIMAL_FIELDS:
#             val = _parse_decimal(val)
#         else:
#             val = str(val).strip() if val else None

#         if val is not None:
#             setattr(db_waybill, model_field, val)
#             update_fields.append(model_field)

#     db_waybill.status = "completed"
#     update_fields.append("status")

#     db_waybill.save(update_fields=list(set(update_fields)))

#     logger.info(
#         "[WAYBILL] Updated id=%s: %d fields, number=%s",
#         db_waybill.pk, len(update_fields), db_waybill.document_number,
#     )
























"""
waybill_extraction.py - Izvlechenije polej iz oro vaztarastis.

Pipeline:
  1. Kartinka → KIE Gemini 2.5 Flash (thinking) → structured JSON (vse polja)
  2. Kartinka → KIE Gemini 3.1 Pro (reasoning_effort=high) → checkbox verification
  3. Merge: checkbox results iz 3.1 Pro perezapisyvajut checkbox polja iz 2.5 Flash
  
Fallback: Direct Gemini 2.5 Flash (thinking)
"""
import base64
import json
import logging
import os
import re
import time
import requests
from datetime import date
from decimal import Decimal, InvalidOperation

logger = logging.getLogger("docscanner_app")


def _t():
    return time.perf_counter()

def _log_t(label, t0):
    logger.info("[WAYBILL-TIME] %s: %.2fs", label, time.perf_counter() - t0)

def _extract_json_object(s):
    if not s:
        return {}
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    m = re.search(r"\{.*\}", s, flags=re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}

def _get_mime_type(filename):
    ext = ""
    if filename:
        ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    mime_map = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "webp": "image/webp", "tiff": "image/tiff", "tif": "image/tiff",
        "pdf": "application/pdf",
    }
    return mime_map.get(ext, "image/jpeg")


# ============================================================
# Prompts
# ============================================================

WAYBILL_PROMPT = """You are analyzing a scanned aviation fuel delivery waybill (oro važtaraštis).
Perform accurate OCR on the image and extract all data into a single JSON object.

=== CHECKBOX RECOGNITION ===
This document has checkbox fields. A checkbox is CHECKED if it contains ANY mark inside: ✓, X, V, tick, cross, filled square, or any handwritten mark. UNCHECKED = completely empty box.

Checkbox groups and their locations on the document:
- TOP RIGHT: 'Važtaraštis kurui užpilti / Delivery receipt' and 'Važtaraštis kurui išpilti / Defuelling receipt'
- LEFT SIDE Payment method: 'pavedimu/Invoice', 'kuro užpylimo kortelė/Fuelling card', 'grynais/cash', 'kortelė/credit card'
- MIDDLE: 'Aviakompanija, daugiau kaip pusę pajamų...' / 'Airline earning more than half of its annual income from transportation...'
- RIGHT SIDE Nature of flight: 'komercinis/commercial', 'privatus/private', 'kita/other'
- RIGHT SIDE: 'už ES ribų / outside the EU'
- BOTTOM Product: 'JET A-1', 'AVGAS 100LL'
- BOTTOM Currency: 'EUR', 'USD'
- BOTTOM Free of: 'vandens/water', 'purvo/dirt'

A handwritten tick (✓) or check mark INSIDE or NEXT TO a box = CHECKED.

=== FIELDS TO EXTRACT ===

Document:
- airport: airport code and name, format "CODE / Name" (e.g. "KUN / Kaunas", "VNO / Vilnius")
- document_number: Nr. field
- document_date: yyyy-mm-dd
- payment_type: one of "pavedimu", "kuro užpylimo kortelė", "grynais", "kreditinė kortelė", "kitas" — based on which payment checkbox is checked
- delivery_receipt: true/false based on checkbox
- defuelling_receipt: true/false based on checkbox (only one can be true)

Buyer / Customer (pirkėjas):
- buyer_iata_code: IATA code
- buyer_name: company name
- buyer_address: address/country
- buyer_vat_code: V.A.T. code
- buyer_remark_half_income: true/false based on the airline income checkbox
- buyer_remark_other: text from "Kita/Other" field

Aircraft and flight:
- aircraft_type: e.g. "C25A", "B738", "A320"
- flight_type: the "tipas/type" number (e.g. "1") — NOT the nature of flight
- outside_eu: true/false based on "už ES ribų" checkbox
- flight_nature: one of "komercinis", "privatus", "kita" — based on Nature of flight checkboxes

Timing (as HH:MM 24h strings):
- time_departure, time_arrival, time_start, time_finish, time_return

Flight route:
- from_city, from_airport_code, from_country_iso (2-letter ISO)
- to_city, to_airport_code, to_country_iso (2-letter ISO)

Readings:
- refueller_number, reading_before (number), reading_after (number), reading_difference (number)

Operator:
- company_representative: name of operator/driver

Fuel measurements — observed (actual):
- density_observed, temperature_observed, quantity_liters_observed, quantity_kg_observed (all numbers)

Fuel measurements — standard (+15°C):
- density_standard, temperature_standard, quantity_liters_standard (all numbers)

=== RULES ===
1. Return ONLY valid JSON, compact single-line. No markdown, no code fences.
2. Dates as yyyy-mm-dd. Times as HH:MM.
3. Numbers = JSON numbers. Codes/identifiers = strings. Booleans = true/false.
4. Omit empty/null fields.
5. Do NOT extract the fuel provider (NAFTELF etc.) — only the customer/buyer.
6. Two measurement rows: first = observed, second = standard at +15°C.
7. Output must be parsable by JSON.parse().
8. If not an aviation fuel waybill: {"netinkamas_dokumentas":true}
"""

# CHECKBOX_VERIFICATION_PROMPT = """Look at this scanned aviation fuel delivery waybill document.

# Here is a list of ALL checkboxes in this document and their exact positions:
# 1. Delivery receipt (Važtaraštis kurui užpilti) — checkbox to the RIGHT of label text
# 2. Defuelling receipt (Važtaraštis kurui išpilti) — checkbox to the RIGHT of label text
# 3. pavedimu / Invoice — checkbox to the RIGHT of label text
# 4. kuro užpildymo kortelė / Fuelling card — checkbox to the RIGHT of label text
# 5. grynais / cash — checkbox to the RIGHT of label text
# 6. kortelė / credit card — checkbox to the RIGHT of label text
# 7. Airline earning more than half of its annual income from transportation of passengers and/or cargo — checkbox to the LEFT of label text
# 8. komercinis / commercial — checkbox to the LEFT of label text, Nature of flight section
# 9. privatus / private — checkbox to the LEFT of label text, Nature of flight section
# 10. kita / other — checkbox to the LEFT of label text, Nature of flight section
# 11. už ES ribų / outside the EU — checkbox to the RIGHT of label text
# 12. JET A-1 — checkbox to the RIGHT of label text
# 13. AVGAS 100LL — checkbox to the RIGHT of label text
# 14. vandens / water — checkbox to the RIGHT of label text
# 15. purvo / dirt — checkbox to the RIGHT of label text
# 16. EUR — checkbox to the LEFT of label text, currency section
# 17. USD — checkbox to the LEFT of label text, currency section

# A checkbox is CHECKED if it contains ANY visible mark inside the box: a tick ✓, X, V, cross, filled area, or any handwritten mark. A checkbox is UNCHECKED only if the box is completely empty with no marks.

# Return ONLY a JSON object with the checkbox numbers that are CHECKED. Format:
# {"checked": [3, 8, 12, 14, 15]}

# Return ONLY the JSON. No markdown, no explanation."""
CHECKBOX_VERIFICATION_PROMPT = """You are a meticulous visual inspector analyzing a scanned aviation fuel delivery waybill. Your task is to determine exactly which checkboxes are CHECKED.

Below is the numbered list of all checkboxes, with their position relative to the accompanying text. The checkbox itself is a small square; it may be empty or contain a mark.

1. Delivery receipt (Važtaraštis kurui užpilti) — checkbox to the RIGHT of label text
2. Defuelling receipt (Važtaraštis kurui išpilti) — checkbox to the RIGHT of label text
3. pavedimu / Invoice — checkbox to the RIGHT of label text
4. kuro užpylimo kortelė / Fuelling card — checkbox to the RIGHT of label text
5. grynais / cash — checkbox to the RIGHT of label text
6. kortelė / credit card — checkbox to the RIGHT of label text
7. Airline earning more than half of its annual income from transportation... — checkbox to the LEFT of label text
8. komercinis / commercial — checkbox to the LEFT of label text (Nature of flight)
9. privatus / private — checkbox to the LEFT of label text (Nature of flight)
10. kita / other — checkbox to the LEFT of label text (Nature of flight)
11. už ES ribų / outside the EU — checkbox to the RIGHT of label text
12. JET A-1 — checkbox to the RIGHT of label text
13. AVGAS 100LL — checkbox to the RIGHT of label text
14. vandens / water — checkbox to the RIGHT of label text
15. purvo / dirt — checkbox to the RIGHT of label text
16. EUR — checkbox to the LEFT of label text (currency section)
17. USD — checkbox to the LEFT of label text (currency section)

**Definition of CHECKED (must be returned):**
- The box is CHECKED if there is ANY intentional mark INSIDE the borders of the square box: a tick (✓), cross (✗), X, V, filled square, diagonal line, dot, scribble, or any handwritten stroke that overlaps the box interior.
- Even a small, faint, or partial mark counts as CHECKED.
- A simple shadow, smudge from printing, or background noise that does NOT form a deliberate marking inside the box is UNCHECKED.
- If the box is completely empty and clean (no marks), it is UNCHECKED.
- Do NOT confuse text or lines printed outside the box as a mark inside the box.

**Procedure:**
1. Zoom in your mental view on each checkbox region. Identify the square box precisely, not the surrounding text.
2. For each box, ask: "Is there any pixel that differs from the paper background inside this square and looks like a deliberate stroke, tick, cross, X, V, dot, or filled area?"
3. List the numbers of boxes that satisfy the CHECKED condition.
4. Double-check your list: re-examine any borderline box. Only include if you are certain there is a mark inside.

**Final output:**
Return ONLY a compact JSON object with the key "checked" and an array of those checkbox numbers that are checked. Example: {"checked": [1, 3, 8, 12, 14, 15]}

You may briefly explain your observations before the JSON, but the very last line of your response must be the JSON object and nothing else. No markdown fences, no extra text after the JSON.
"""

# ============================================================
# Checkbox number → field mapping
# ============================================================

CHECKBOX_MAP = {
    1: ("delivery_receipt", True),
    2: ("defuelling_receipt", True),
    3: ("payment_type", "pavedimu"),
    4: ("payment_type", "kuro užpylimo kortelė"),
    5: ("payment_type", "grynais"),
    6: ("payment_type", "kreditinė kortelė"),
    7: ("buyer_remark_half_income", True),
    8: ("flight_nature", "komercinis"),
    9: ("flight_nature", "privatus"),
    10: ("flight_nature", "kita"),
    11: ("outside_eu", True),
}

# Polja kotoryje nado resetnut pered primenenijem checkbox rezultatov
CHECKBOX_RESET = {
    "delivery_receipt": False,
    "defuelling_receipt": False,
    "payment_type": None,
    "buyer_remark_half_income": False,
    "flight_nature": None,
    "outside_eu": False,
}


def _apply_checkbox_results(structured, checked_numbers):
    """Primenijaet rezultaty proverki checkboxov na structured JSON."""
    # Reset vse checkbox polja
    for field, default in CHECKBOX_RESET.items():
        structured[field] = default

    # Primenijaem checked
    for num in checked_numbers:
        if num in CHECKBOX_MAP:
            field, value = CHECKBOX_MAP[num]
            structured[field] = value

    return structured


# ============================================================
# Main extraction function
# ============================================================

def extract_waybill_from_image(image_data, filename=None):
    """
    1. KIE Gemini 2.5 Flash (thinking) → vse polja JSON
    2. KIE Gemini 3.1 Pro (reasoning_effort=high) → checkbox verification
    3. Merge checkbox results

    Returns: (structured, raw_response_main, raw_response_checkboxes, error)
    """
    mime_type = _get_mime_type(filename)
    b64 = base64.b64encode(image_data).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    # ── Step 1: Main extraction (Gemini 2.5 Flash) ──
    t0 = _t()
    raw_main = None
    source = None

    try:
        raw_main = _call_kie(
            data_url=data_url,
            prompt=WAYBILL_PROMPT,
            endpoint_key="flash25",
            filename=filename,
            image_size=len(image_data),
        )
        source = "kie-gemini-2.5-flash"
    except Exception as e:
        logger.warning("[WAYBILL] KIE 2.5 Flash failed: %s — trying direct Gemini", e)

    # Fallback: Direct Gemini
    if not raw_main:
        try:
            raw_main = _call_direct_gemini(image_data, mime_type, filename)
            source = "direct-gemini-2.5-flash"
        except Exception as e:
            _log_t("All extraction failed", t0)
            return None, None, None, str(e)

    _log_t(f"Step 1: Main extraction ({source})", t0)

    if not raw_main or not raw_main.strip():
        return None, raw_main, None, "Empty response from main extraction"

    structured = _extract_json_object(raw_main)
    if not structured:
        return None, raw_main, None, "Failed to parse main JSON"

    if structured.get("netinkamas_dokumentas"):
        return structured, raw_main, None, None

    logger.info("[WAYBILL] Step 1 OK: %d fields, number=%s",
                len(structured), structured.get("document_number", "?"))

    # ── Step 2: Checkbox verification (Gemini 3.1 Pro) ──
    t1 = _t()
    raw_checkboxes = None

    try:
        raw_checkboxes = _call_kie(
            data_url=data_url,
            prompt=CHECKBOX_VERIFICATION_PROMPT,
            endpoint_key="pro31",
            filename=filename,
            image_size=len(image_data),
        )
    except Exception as e:
        logger.warning("[WAYBILL] KIE 3.1 Pro checkbox verification failed: %s — using 2.5 Flash results", e)

    if raw_checkboxes:
        _log_t("Step 2: Checkbox verification (3.1 Pro)", t1)

        cb_data = _extract_json_object(raw_checkboxes)
        checked = cb_data.get("checked", [])

        if isinstance(checked, list) and len(checked) > 0:
            logger.info("[WAYBILL] Checkbox verification: checked=%s", checked)
            structured = _apply_checkbox_results(structured, checked)
        else:
            logger.warning("[WAYBILL] Checkbox verification returned no/invalid data: %r", raw_checkboxes[:300])
    else:
        logger.warning("[WAYBILL] Checkbox verification skipped — using 2.5 Flash results")
        _log_t("Step 2: Checkbox verification (skipped)", t1)

    return structured, raw_main, raw_checkboxes, None


# ============================================================
# KIE API call (universal)
# ============================================================

KIE_ENDPOINTS = {
    "flash25": {
        "url_attr": "KIE_GEMINI_FLASH_URL",
        "label": "kie-gemini-2.5-flash",
        "extra": {"include_thoughts": True, "temperature": 0.5},
    },
    "flash35": {
        "url_attr": "KIE_GEMINI_35_FLASH_URL",
        "label": "kie-gemini-3.5-flash",
        "extra": {"include_thoughts": True, "reasoning_effort": "high", "temperature": 0.0},
    },
    "pro31": {
        "url_attr": "KIE_GEMINI_31_PRO_URL",
        "label": "kie-gemini-3.1-pro",
        "extra": {"include_thoughts": True, "reasoning_effort": "high", "temperature": 0.0},
    },
}

def _call_kie(data_url, prompt, endpoint_key, filename=None, image_size=0):
    """Universal KIE call s kartinkoj."""
    from .kie import (
        _kie_headers,
        _extract_content_from_kie_response,
        _raise_if_kie_error,
        KieAPIError,
    )
    import importlib
    kie_module = importlib.import_module('.kie', package=__package__)

    ep_config = KIE_ENDPOINTS[endpoint_key]
    url = getattr(kie_module, ep_config["url_attr"])
    label = ep_config["label"]
    extra = ep_config["extra"]

    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "stream": False,
        "max_tokens": 15000,
        **extra,
    }

    logger.info("[WAYBILL-KIE] Sending %s (%d bytes) to %s",
                filename or "unknown", image_size, label)

    t0 = time.perf_counter()

    resp = requests.post(url, headers=_kie_headers(), json=payload, timeout=120.0)
    elapsed = time.perf_counter() - t0

    try:
        data = resp.json()
    except Exception:
        resp.raise_for_status()
        raise KieAPIError(f"KIE non-JSON: {resp.text[:500]}")

    if resp.status_code >= 400:
        msg = data.get("msg") or data.get("message") or str(data)
        raise KieAPIError(f"KIE HTTP {resp.status_code}: {msg}", status_code=resp.status_code)

    _raise_if_kie_error(data, resp.status_code)
    result = _extract_content_from_kie_response(data)

    logger.info("[WAYBILL-KIE] %s OK: len=%d elapsed=%.2fs", label, len(result), elapsed)

    return result.strip() if result else ""


# ============================================================
# Direct Gemini 2.5 Flash — fallback s thinking
# ============================================================

def _call_direct_gemini(image_data, mime_type, filename=None):
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise Exception("google-genai not installed")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise Exception("GEMINI_API_KEY not set")

    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=120_000),
    )

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=image_data, mime_type=mime_type),
                types.Part.from_text(text=WAYBILL_PROMPT),
            ],
        )
    ]

    config = types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=4096),
    )

    logger.info("[WAYBILL-DIRECT] Sending %s (%d bytes) to gemini-2.5-flash (thinking=4096)",
                filename or "unknown", len(image_data))

    response = client.models.generate_content(
        model="gemini-2.5-flash", contents=contents, config=config,
    )

    text_parts = []
    if response.candidates:
        for part in response.candidates[0].content.parts:
            if part.text and not getattr(part, 'thought', False):
                text_parts.append(part.text)

    return "".join(text_parts).strip()


# ============================================================
# Duplicate check
# ============================================================

def is_waybill_duplicate(user, document_number, exclude_doc_id=None):
    if not document_number or not str(document_number).strip():
        return False

    from ..models import ScannedWaybill

    qs = ScannedWaybill.objects.filter(
        user=user,
        document_number=str(document_number).strip(),
        status__in=("completed", "exported"),
    )
    if exclude_doc_id:
        qs = qs.exclude(pk=exclude_doc_id)

    return qs.exists()


# ============================================================
# Mapping JSON → ScannedWaybill
# ============================================================

DIRECT_FIELD_MAP = {
    "airport": "airport",
    "document_number": "document_number",
    "document_date": "document_date",
    "payment_type": "payment_type",
    "delivery_receipt": "delivery_receipt",
    "defuelling_receipt": "defuelling_receipt",
    "buyer_iata_code": "buyer_iata_code",
    "buyer_name": "buyer_name",
    "buyer_address": "buyer_address",
    "buyer_vat_code": "buyer_vat_code",
    "buyer_remark_half_income": "buyer_remark_half_income",
    "buyer_remark_other": "buyer_remark_other",
    "aircraft_type": "aircraft_type",
    "flight_type": "flight_type",
    "outside_eu": "outside_eu",
    "flight_nature": "flight_nature",
    "time_departure": "time_departure",
    "time_arrival": "time_arrival",
    "time_start": "time_start",
    "time_finish": "time_finish",
    "time_return": "time_return",
    "from_city": "from_city",
    "from_airport_code": "from_airport_code",
    "from_country_iso": "from_country_iso",
    "to_city": "to_city",
    "to_airport_code": "to_airport_code",
    "to_country_iso": "to_country_iso",
    "refueller_number": "refueller_number",
    "reading_before": "reading_before",
    "reading_after": "reading_after",
    "reading_difference": "reading_difference",
    "company_representative": "company_representative",
    "density_observed": "density_observed",
    "temperature_observed": "temperature_observed",
    "quantity_liters_observed": "quantity_liters_observed",
    "quantity_kg_observed": "quantity_kg_observed",
    "density_standard": "density_standard",
    "temperature_standard": "temperature_standard",
    "quantity_liters_standard": "quantity_liters_standard",
}

DATE_FIELDS = {"document_date"}
BOOL_FIELDS = {"delivery_receipt", "defuelling_receipt", "buyer_remark_half_income", "outside_eu"}
DECIMAL_FIELDS = {
    "reading_before", "reading_after", "reading_difference",
    "density_observed", "temperature_observed", "quantity_liters_observed", "quantity_kg_observed",
    "density_standard", "temperature_standard", "quantity_liters_standard",
}


def _parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(str(val).strip()[:10])
    except (ValueError, TypeError):
        return None

def _parse_decimal(val):
    if val is None:
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        return None

def _parse_bool(val):
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ("true", "1", "yes", "taip"):
        return True
    if s in ("false", "0", "no", "ne"):
        return False
    return None


def update_scanned_waybill(db_waybill, structured, raw_main, raw_checkboxes, preview_url):
    """Mappit structured JSON na polia ScannedWaybill i soxraniajet."""
    update_fields = []

    # Soxraniajem oba raw otveta
    db_waybill.gpt_raw_json = raw_main
    db_waybill.structured_json = structured
    db_waybill.preview_url = preview_url
    update_fields.extend(["gpt_raw_json", "structured_json", "preview_url"])

    # raw_text = main response, glued_raw_text = checkbox verification response
    db_waybill.raw_text = raw_main
    if raw_checkboxes:
        db_waybill.glued_raw_text = raw_checkboxes
    update_fields.extend(["raw_text", "glued_raw_text"])

    for json_key, model_field in DIRECT_FIELD_MAP.items():
        val = structured.get(json_key)
        if val is None:
            continue

        if model_field in DATE_FIELDS:
            val = _parse_date(val)
        elif model_field in BOOL_FIELDS:
            val = _parse_bool(val)
        elif model_field in DECIMAL_FIELDS:
            val = _parse_decimal(val)
        else:
            val = str(val).strip() if val else None

        if val is not None:
            setattr(db_waybill, model_field, val)
            update_fields.append(model_field)

    db_waybill.status = "completed"
    update_fields.append("status")

    db_waybill.save(update_fields=list(set(update_fields)))

    logger.info(
        "[WAYBILL] Updated id=%s: %d fields, number=%s",
        db_waybill.pk, len(update_fields), db_waybill.document_number,
    )





























# """
# waybill_extraction.py - Izvlechenije polej iz oro vaztarastis.

# Pipeline (1 shag):
#   Kartinka → KIE Gemini 2.5 Flash (s thinking) → structured JSON
#   Fallback: Direct Gemini 2.5 Flash (s thinking) → structured JSON
# """
# import base64
# import json
# import logging
# import os
# import re
# import time
# import requests
# from datetime import date
# from decimal import Decimal, InvalidOperation

# logger = logging.getLogger("docscanner_app")


# def _t():
#     return time.perf_counter()

# def _log_t(label, t0):
#     logger.info("[WAYBILL-TIME] %s: %.2fs", label, time.perf_counter() - t0)

# def _extract_json_object(s):
#     if not s:
#         return {}
#     s = s.strip()
#     if s.startswith("```"):
#         s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
#         s = re.sub(r"\s*```$", "", s)
#     m = re.search(r"\{.*\}", s, flags=re.DOTALL)
#     if not m:
#         return {}
#     try:
#         return json.loads(m.group(0))
#     except Exception:
#         return {}


# # ============================================================
# # Prompt
# # ============================================================

# WAYBILL_PROMPT = """You are analyzing a scanned aviation fuel delivery waybill (oro važtaraštis).
# Perform accurate OCR on the image and extract all data into a single JSON object.

# === CHECKBOX RECOGNITION ===
# This document has checkbox fields. A checkbox is CHECKED if it contains ANY mark inside: ✓, X, V, tick, cross, filled square, or any handwritten mark. UNCHECKED = completely empty box.

# Checkbox groups and their locations on the document:
# - TOP RIGHT: 'Važtaraštis kurui užpilti / Delivery receipt' and 'Važtaraštis kurui išpilti / Defuelling receipt'
# - LEFT SIDE Payment method: 'pavedimu/Invoice', 'kuro užpildymo kortelė/Fuelling card', 'grynais/cash', 'kortelė/credit card'
# - MIDDLE: 'Aviakompanija, daugiau kaip pusę pajamų...' / 'Airline earning more than half of its annual income from transportation...'
# - RIGHT SIDE Nature of flight: 'komercinis/commercial', 'privatus/private', 'kita/other'
# - RIGHT SIDE: 'už ES ribų / outside the EU'
# - BOTTOM Product: 'JET A-1', 'AVGAS 100LL'
# - BOTTOM Currency: 'EUR', 'USD'
# - BOTTOM Free of: 'vandens/water', 'purvo/dirt'

# A handwritten tick (✓) or check mark INSIDE  a box = CHECKED.
# Think longer while identifying what checkboxes are CHECKED. Make no mistakes here. Double check if needed.


# === FIELDS TO EXTRACT ===

# Document:
# - airport: airport code and name, format "CODE / Name" (e.g. "KUN / Kaunas", "VNO / Vilnius")
# - document_number: Nr. field
# - document_date: yyyy-mm-dd
# - payment_type: one of "pavedimu", "kuro užpildymo kortelė", "grynais", "kreditinė kortelė", "kitas" — based on which payment checkbox is checked
# - delivery_receipt: true/false based on checkbox
# - defuelling_receipt: true/false based on checkbox (only one can be true)

# Buyer / Customer (pirkėjas):
# - buyer_iata_code: IATA code
# - buyer_name: company name
# - buyer_address: address/country
# - buyer_vat_code: V.A.T. code
# - buyer_remark_half_income: true/false based on the airline income checkbox
# - buyer_remark_other: text from "Kita/Other" field

# Aircraft and flight:
# - aircraft_type: e.g. "C25A", "B738", "A320"
# - flight_type: the "tipas/type" number (e.g. "1") — NOT the nature of flight
# - outside_eu: true/false based on "už ES ribų" checkbox
# - flight_nature: one of "komercinis", "privatus", "kita" — based on Nature of flight checkboxes

# Timing (as HH:MM 24h strings):
# - time_departure (išvykimas/departure)
# - time_arrival (atvykimas/arrival)
# - time_start (pradžia/start)
# - time_finish (pabaiga/finish)
# - time_return (grįžimas/return)

# Flight route:
# - from_city, from_airport_code, from_country_iso (2-letter ISO)
# - to_city, to_airport_code, to_country_iso (2-letter ISO)

# Readings:
# - refueller_number: autocistern number
# - reading_before: meter before fuelling (number)
# - reading_after: meter after fuelling (number)
# - reading_difference: difference (number)

# Operator:
# - company_representative: name of operator/driver (įmonės įgaliotas asmuo)

# Fuel measurements — observed (actual temperature):
# - density_observed: kg/l (number, e.g. 0.810)
# - temperature_observed: °C (number, e.g. -1)
# - quantity_liters_observed: liters (number)
# - quantity_kg_observed: kilograms (number)

# Fuel measurements — standard (+15°C):
# - density_standard: kg/l at +15°C (number)
# - temperature_standard: usually 15 (number)
# - quantity_liters_standard: liters at +15°C (number)

# === RULES ===
# 1. Return ONLY valid JSON, compact single-line. No markdown, no code fences, no explanations.
# 2. Dates as yyyy-mm-dd. Times as HH:MM.
# 3. Numbers = JSON numbers. Codes/identifiers = strings.
# 4. Booleans = true/false.
# 5. Omit empty/null fields.
# 6. Do NOT extract the fuel provider (NAFTELF etc.) — only the customer/buyer.
# 7. Two measurement rows: first = observed, second = standard at +15°C.
# 8. Output must be parsable by JSON.parse().
# 9. If not an aviation fuel waybill: {"netinkamas_dokumentas":true}

# Example:
# {"airport":"VNO / Vilnius","document_number":"0059529","document_date":"2016-01-17","payment_type":"pavedimu","delivery_receipt":true,"buyer_iata_code":"PNN","buyer_name":"AIR PANNONIA d.o.o","buyer_address":"CROATIA","flight_nature":"komercinis","aircraft_type":"C25A","flight_type":"1","outside_eu":true,"time_departure":"13:25","time_arrival":"13:30","time_start":"13:25","time_finish":"13:50","time_return":"13:55","from_city":"VILNIUS","from_airport_code":"VNO","from_country_iso":"LT","to_city":"ZURICH","to_airport_code":"ZRH","to_country_iso":"CH","refueller_number":"10321","reading_before":7494185,"reading_after":7495485,"reading_difference":1300,"company_representative":"Artur Karpovic","density_observed":0.810,"temperature_observed":-1,"quantity_liters_observed":1300,"quantity_kg_observed":1055,"density_standard":0.799,"temperature_standard":15,"quantity_liters_standard":1317.897}
# """


# # ============================================================
# # Main extraction function
# # ============================================================

# def extract_waybill_from_image(image_data, filename=None):
#     """
#     Kartinka → KIE Gemini 2.5 Flash (thinking) → JSON.
#     Fallback: Direct Gemini 2.5 Flash (thinking) → JSON.

#     Returns: (structured: dict | None, raw_response: str | None, error: str | None)
#     """
#     ext = ""
#     if filename:
#         ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()

#     mime_map = {
#         "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
#         "webp": "image/webp", "tiff": "image/tiff", "tif": "image/tiff",
#         "pdf": "application/pdf",
#     }
#     mime_type = mime_map.get(ext, "image/jpeg")

#     t0 = _t()
#     raw_response = None
#     source = None

#     # ── 1. KIE Gemini 2.5 Flash (s kartinkoj + thinking) ──
#     try:
#         raw_response = _call_kie_with_image(image_data, mime_type, filename)
#         source = "kie-gemini-2.5-flash"
#     except Exception as e:
#         logger.warning("[WAYBILL] KIE failed: %s — trying direct Gemini", e)

#     # ── 2. Fallback: Direct Gemini 2.5 Flash (thinking) ──
#     if not raw_response:
#         try:
#             raw_response = _call_direct_gemini(image_data, mime_type, filename)
#             source = "direct-gemini-2.5-flash"
#         except Exception as e:
#             _log_t("All extraction failed", t0)
#             logger.error("[WAYBILL] Direct Gemini also failed: %s", e)
#             return None, None, str(e)

#     _log_t(f"Extraction ({source})", t0)

#     if not raw_response or not raw_response.strip():
#         return None, raw_response, "Empty response from all models"

#     logger.info(
#         "[WAYBILL] %s OK: %d chars, preview=%r",
#         source, len(raw_response), raw_response[:300],
#     )

#     # ── Parse JSON ──
#     structured = _extract_json_object(raw_response)
#     if not structured:
#         logger.warning("[WAYBILL] JSON parse failed: %r", raw_response[:500])
#         return None, raw_response, "Failed to parse JSON"

#     logger.info(
#         "[WAYBILL] Parsed %d fields, number=%s",
#         len(structured), structured.get("document_number", "?"),
#     )

#     return structured, raw_response, None


# # ============================================================
# # KIE Gemini 2.5 Flash — multimodal (image + text)
# # ============================================================

# def _call_kie_with_image(image_data, mime_type, filename=None):
#     from .kie import (
#         _kie_headers,
#         _extract_content_from_kie_response,
#         _raise_if_kie_error,
#         KIE_GEMINI_35_FLASH_URL,
#         KIE_GEMINI_FLASH_URL,
#         KieAPIError,
#     )

#     b64 = base64.b64encode(image_data).decode("utf-8")
#     data_url = f"data:{mime_type};base64,{b64}"

#     # Gemini 3.5 Flash: s reasoning_effort
#     # Gemini 2.5 Flash: fallback
#     ENDPOINTS = [
#         (KIE_GEMINI_35_FLASH_URL, "kie-gemini-3.5-flash", {
#             "include_thoughts": True,
#             "reasoning_effort": "high",
#         }),
#         (KIE_GEMINI_FLASH_URL, "kie-gemini-2.5-flash", {
#             "include_thoughts": True,
#         }),
#     ]

#     for endpoint, label, extra_params in ENDPOINTS:
#         try:
#             payload = {
#                 "messages": [
#                     {
#                         "role": "user",
#                         "content": [
#                             {"type": "image_url", "image_url": {"url": data_url}},
#                             {"type": "text", "text": WAYBILL_PROMPT},
#                         ],
#                     }
#                 ],
#                 "stream": False,
#                 "temperature": 0.0,
#                 "max_tokens": 15000,
#                 **extra_params,
#             }

#             logger.info(
#                 "[WAYBILL-KIE] Sending %s (%d bytes) to %s",
#                 filename or "unknown", len(image_data), label,
#             )

#             t0 = time.perf_counter()

#             resp = requests.post(
#                 endpoint,
#                 headers=_kie_headers(),
#                 json=payload,
#                 timeout=120.0,
#             )

#             elapsed = time.perf_counter() - t0

#             data = resp.json()

#             if resp.status_code >= 400:
#                 msg = data.get("msg") or data.get("message") or str(data)
#                 raise KieAPIError(f"KIE HTTP {resp.status_code}: {msg}", status_code=resp.status_code)

#             _raise_if_kie_error(data, resp.status_code)
#             result = _extract_content_from_kie_response(data)

#             logger.info("[WAYBILL-KIE] %s OK: len=%d elapsed=%.2fs", label, len(result), elapsed)

#             if result and result.strip():
#                 return result.strip()

#             logger.warning("[WAYBILL-KIE] %s returned empty, trying next", label)

#         except Exception as e:
#             logger.warning("[WAYBILL-KIE] %s failed: %s, trying next", label, e)

#     raise Exception("KIE: all endpoints failed")

# # def _call_kie_with_image(image_data, mime_type, filename=None):
# #     """Shliom kartinku + prompt v KIE cerez OpenAI-compatible multimodal API."""
# #     from .kie import (
# #         _kie_headers,
# #         _extract_content_from_kie_response,
# #         _raise_if_kie_error,
# #         KIE_GEMINI_FLASH_URL,
# #         KIE_GEMINI_3_FLASH_URL,
# #         KieAPIError,
# #     )

# #     b64 = base64.b64encode(image_data).decode("utf-8")
# #     data_url = f"data:{mime_type};base64,{b64}"

# #     payload = {
# #         "messages": [
# #             {
# #                 "role": "user",
# #                 "content": [
# #                     {
# #                         "type": "image_url",
# #                         "image_url": {"url": data_url},
# #                     },
# #                     {
# #                         "type": "text",
# #                         "text": WAYBILL_PROMPT,
# #                     },
# #                 ],
# #             }
# #         ],
# #         "stream": False,
# #         "include_thoughts": True,
# #         "temperature": 0.0,
# #         "max_tokens": 15000,
# #     }

# #     # Retry: gemini-2.5-flash → gemini-3-flash
# #     for endpoint, label in [
# #         (KIE_GEMINI_FLASH_URL, "kie-gemini-2.5-flash"),
# #         (KIE_GEMINI_3_FLASH_URL, "kie-gemini-3-flash"),
# #     ]:
# #         try:
# #             logger.info(
# #                 "[WAYBILL-KIE] Sending %s (%d bytes, mime=%s) to %s",
# #                 filename or "unknown", len(image_data), mime_type, label,
# #             )

# #             t0 = time.perf_counter()

# #             resp = requests.post(
# #                 endpoint,
# #                 headers=_kie_headers(),
# #                 json=payload,
# #                 timeout=120.0,
# #             )

# #             elapsed = time.perf_counter() - t0

# #             try:
# #                 data = resp.json()
# #             except Exception:
# #                 resp.raise_for_status()
# #                 raise KieAPIError(f"KIE non-JSON response: {resp.text[:500]}")

# #             if resp.status_code >= 400:
# #                 msg = data.get("msg") or data.get("message") or str(data)
# #                 raise KieAPIError(f"KIE HTTP {resp.status_code}: {msg}", status_code=resp.status_code)

# #             _raise_if_kie_error(data, resp.status_code)

# #             result = _extract_content_from_kie_response(data)

# #             logger.info("[WAYBILL-KIE] %s OK: len=%d elapsed=%.2fs", label, len(result), elapsed)

# #             if result and result.strip():
# #                 return result.strip()

# #             logger.warning("[WAYBILL-KIE] %s returned empty, trying next", label)

# #         except Exception as e:
# #             logger.warning("[WAYBILL-KIE] %s failed: %s, trying next", label, e)

# #     raise Exception("KIE: all endpoints failed for waybill image extraction")


# # ============================================================
# # Direct Gemini 2.5 Flash — fallback s thinking
# # ============================================================

# def _call_direct_gemini(image_data, mime_type, filename=None):
#     """Fallback: direct Gemini 2.5 Flash s thinking."""
#     try:
#         from google import genai
#         from google.genai import types
#     except ImportError:
#         raise Exception("google-genai not installed")

#     api_key = os.environ.get("GEMINI_API_KEY")
#     if not api_key:
#         raise Exception("GEMINI_API_KEY not set")

#     client = genai.Client(
#         api_key=api_key,
#         http_options=types.HttpOptions(timeout=120_000),
#     )

#     contents = [
#         types.Content(
#             role="user",
#             parts=[
#                 types.Part.from_bytes(data=image_data, mime_type=mime_type),
#                 types.Part.from_text(text=WAYBILL_PROMPT),
#             ],
#         )
#     ]

#     config = types.GenerateContentConfig(
#         thinking_config=types.ThinkingConfig(thinking_budget=4096),
#     )

#     logger.info(
#         "[WAYBILL-DIRECT] Sending %s (%d bytes) to gemini-2.5-flash (thinking=4096)",
#         filename or "unknown", len(image_data),
#     )

#     response = client.models.generate_content(
#         model="gemini-2.5-flash",
#         contents=contents,
#         config=config,
#     )

#     # Izvlekajem tolko text parts (ne thinking parts)
#     text_parts = []
#     if response.candidates:
#         for part in response.candidates[0].content.parts:
#             if part.text and not getattr(part, 'thought', False):
#                 text_parts.append(part.text)

#     result = "".join(text_parts).strip()

#     logger.info("[WAYBILL-DIRECT] OK: %d chars", len(result))

#     return result


# # ============================================================
# # Duplicate check
# # ============================================================

# def is_waybill_duplicate(user, document_number, exclude_doc_id=None):
#     if not document_number or not str(document_number).strip():
#         return False

#     from ..models import ScannedWaybill

#     qs = ScannedWaybill.objects.filter(
#         user=user,
#         document_number=str(document_number).strip(),
#         status__in=("completed", "exported"),
#     )
#     if exclude_doc_id:
#         qs = qs.exclude(pk=exclude_doc_id)

#     return qs.exists()


# # ============================================================
# # Mapping JSON → ScannedWaybill
# # ============================================================

# DIRECT_FIELD_MAP = {
#     "airport": "airport",
#     "document_number": "document_number",
#     "document_date": "document_date",
#     "payment_type": "payment_type",
#     "delivery_receipt": "delivery_receipt",
#     "defuelling_receipt": "defuelling_receipt",
#     "buyer_iata_code": "buyer_iata_code",
#     "buyer_name": "buyer_name",
#     "buyer_address": "buyer_address",
#     "buyer_vat_code": "buyer_vat_code",
#     "buyer_remark_half_income": "buyer_remark_half_income",
#     "buyer_remark_other": "buyer_remark_other",
#     "aircraft_type": "aircraft_type",
#     "flight_type": "flight_type",
#     "outside_eu": "outside_eu",
#     "flight_nature": "flight_nature",
#     "time_departure": "time_departure",
#     "time_arrival": "time_arrival",
#     "time_start": "time_start",
#     "time_finish": "time_finish",
#     "time_return": "time_return",
#     "from_city": "from_city",
#     "from_airport_code": "from_airport_code",
#     "from_country_iso": "from_country_iso",
#     "to_city": "to_city",
#     "to_airport_code": "to_airport_code",
#     "to_country_iso": "to_country_iso",
#     "refueller_number": "refueller_number",
#     "reading_before": "reading_before",
#     "reading_after": "reading_after",
#     "reading_difference": "reading_difference",
#     "company_representative": "company_representative",
#     "density_observed": "density_observed",
#     "temperature_observed": "temperature_observed",
#     "quantity_liters_observed": "quantity_liters_observed",
#     "quantity_kg_observed": "quantity_kg_observed",
#     "density_standard": "density_standard",
#     "temperature_standard": "temperature_standard",
#     "quantity_liters_standard": "quantity_liters_standard",
# }

# DATE_FIELDS = {"document_date"}
# BOOL_FIELDS = {"delivery_receipt", "defuelling_receipt", "buyer_remark_half_income", "outside_eu"}
# DECIMAL_FIELDS = {
#     "reading_before", "reading_after", "reading_difference",
#     "density_observed", "temperature_observed", "quantity_liters_observed", "quantity_kg_observed",
#     "density_standard", "temperature_standard", "quantity_liters_standard",
# }


# def _parse_date(val):
#     if not val:
#         return None
#     try:
#         return date.fromisoformat(str(val).strip()[:10])
#     except (ValueError, TypeError):
#         return None


# def _parse_decimal(val):
#     if val is None:
#         return None
#     try:
#         return Decimal(str(val))
#     except (InvalidOperation, TypeError, ValueError):
#         return None


# def _parse_bool(val):
#     if val is None:
#         return None
#     if isinstance(val, bool):
#         return val
#     s = str(val).strip().lower()
#     if s in ("true", "1", "yes", "taip"):
#         return True
#     if s in ("false", "0", "no", "ne"):
#         return False
#     return None


# def update_scanned_waybill(db_waybill, structured, raw_response, preview_url):
#     """Mappit structured JSON na polia ScannedWaybill i soxraniajet."""
#     update_fields = []

#     db_waybill.gpt_raw_json = raw_response
#     db_waybill.structured_json = structured
#     db_waybill.preview_url = preview_url
#     update_fields.extend(["gpt_raw_json", "structured_json", "preview_url"])

#     for json_key, model_field in DIRECT_FIELD_MAP.items():
#         val = structured.get(json_key)
#         if val is None:
#             continue

#         if model_field in DATE_FIELDS:
#             val = _parse_date(val)
#         elif model_field in BOOL_FIELDS:
#             val = _parse_bool(val)
#         elif model_field in DECIMAL_FIELDS:
#             val = _parse_decimal(val)
#         else:
#             val = str(val).strip() if val else None

#         if val is not None:
#             setattr(db_waybill, model_field, val)
#             update_fields.append(model_field)

#     db_waybill.status = "completed"
#     update_fields.append("status")

#     db_waybill.save(update_fields=list(set(update_fields)))

#     logger.info(
#         "[WAYBILL] Updated id=%s: %d fields, number=%s",
#         db_waybill.pk, len(update_fields), db_waybill.document_number,
#     )






























# """
# waybill_extraction.py - OCR + izvlecenie polej vaztarastisa.

# Pipeline (2 shaga):
#   1. OCR: kartinka -> Gemini 3.1 Flash Lite -> tekst (enhanced_ocr.py)
#   2. Extraction: tekst -> KIE Gemini 2.5 Flash -> structured JSON
# """
# import json
# import logging
# import re
# import time
# from datetime import date
# from decimal import Decimal, InvalidOperation

# logger = logging.getLogger("docscanner_app")


# # ============================================================
# # Prompt dlia KIE Gemini 2.5 Flash
# # ============================================================

# WAYBILL_EXTRACTION_PROMPT = """You will receive raw OCR text from a scanned aviation fuel delivery waybill (oro važtaraštis).

# Extract all visible fields into a structured JSON. Omit fields that are empty or not found.

# **FIELDS TO EXTRACT:**

# Document:
# - airport: airport name with code, e.g. "KUN / Kaunas", "VNO / Vilnius". Use such format "Code / Name" for example "KUN / Kaunas".
# - document_number: document number (Nr.)
# - document_date: date in yyyy-mm-dd format
# - payment_type: one of "pavedimu", "kuro užpildymo kortelė", "grynais", "kreditinė kortelė", "kitas". Look for checkboxes: "pavedimu/invoice", "kuro užpildymo kortelė/fueling card", "grynais/cash", "kreditinė kortelė/credit card"
# - delivery_receipt: true if "Važtaraštis kurui užpilti / Delivery receipt" is checked/marked
# - defuelling_receipt: true if "Važtaraštis kurui išpilti / Defuelling receipt" is checked/marked
#   (only one of delivery_receipt / defuelling_receipt can be true, or neither)

# Buyer / Customer (pirkėjas):
# - buyer_iata_code: IATA code of the customer
# - buyer_name: company name (pavadinimas)
# - buyer_address: address / country
# - buyer_vat_code: V.A.T. code if present
# - buyer_remark_half_income: true if the checkbox about "airline earning more than half of its annual income from transportation of passengers and (or) cargo" is checked/marked
# - buyer_remark_other: any text in the "Kita/ Other" remarks field

# Aircraft and flight:
# - aircraft_type: aircraft type code (e.g. "C25A", "B738")
# - flight_type: the "tipas/ type" number if present (e.g. "1")
# - outside_eu: true if "už ES ribų" (outside EU borders) is checked/indicated
# - flight_nature: one of "komercinis", "privatus", "kita" based on checkboxes. Look for checkboxes: "komercinis/commercial", "privatus/private", "kita/other"

# Timing (extract as HH:MM strings):
# - time_departure: departure time (išvykimas)
# - time_arrival: arrival time (atvykimas)
# - time_start: start time (pradžia)
# - time_finish: finish time (pabaiga)
# - time_return: return time (grįžimas)

# Flight route:
# - from_city: departure city name (e.g. "VILNIUS")
# - from_airport_code: departure airport IATA/ICAO code (e.g. "VNO")
# - from_country_iso: departure country 2-letter ISO (e.g. "LT")
# - to_city: destination city name (e.g. "ZURICH")
# - to_airport_code: destination airport code (e.g. "ZRH")
# - to_country_iso: destination country ISO (e.g. "CH")

# Readings (meter/counter):
# - refueller_number: autocistern/refueller number
# - reading_before: meter reading before fuelling (number)
# - reading_after: meter reading after fuelling (number)
# - reading_difference: difference (number)

# Operator:
# - company_representative: name of the operator/driver (Operatorius-vairuotojas)

# Fuel measurements - observed (actual):
# - density_observed: density in kg/l at actual temperature (number, e.g. 0.810)
# - temperature_observed: actual temperature in Celsius (number, e.g. -1)
# - quantity_liters_observed: quantity in liters at actual temperature (number)
# - quantity_kg_observed: quantity in kilograms (number)

# Fuel measurements - standard (+15°C):
# - density_standard: density at +15°C (number, e.g. 0.799)
# - temperature_standard: always or near +15 (number)
# - quantity_liters_standard: quantity in liters at +15°C (number)

# **RULES:**
# 1. Return ONLY valid JSON, compact single-line. No markdown, no code fences.
# 2. Dates as yyyy-mm-dd. Times as HH:MM (24h format).
# 3. Numbers must be JSON numbers, NOT strings. Codes/identifiers stay as strings.
# 4. Booleans must be true/false, not strings.
# 5. Omit fields with null/empty values - do NOT include them.
# 6. The fuel provider company (NAFTELF, Orlen Aviation, etc.) is NOT extracted - only the customer/buyer.
# 7. There are usually two rows of density/temperature/quantity: first is observed (actual), second is standard at +15C. Extract both.
# 8. The output must be directly parsable by JSON.parse().
# 9. If document is clearly not an aviation fuel waybill: {"netinkamas_dokumentas":true}

# Example:
# {"airport":"VNO / Vilnius","document_number":"0059529","document_date":"2016-01-17","payment_type":"pavedimu","delivery_receipt":true,"defuelling_receipt":false,"buyer_iata_code":"PNN","buyer_name":"AIR PANNONIA d.o.o","buyer_address":"CROATIA","flight_nature":"komercinis","aircraft_type":"C25A","flight_type":"1","outside_eu":true,"time_departure":"13:25","time_arrival":"13:30","time_start":"13:25","time_finish":"13:50","time_return":"13:55","from_city":"VILNIUS","from_airport_code":"VNO","from_country_iso":"LT","to_city":"ZURICH","to_airport_code":"ZRH","to_country_iso":"CH","refueller_number":"10321","reading_before":7494185,"reading_after":7495485,"reading_difference":1300,"company_representative":"Artur Karpovic","density_observed":0.810,"temperature_observed":-1,"quantity_liters_observed":1300,"quantity_kg_observed":1055,"density_standard":0.799,"temperature_standard":15,"quantity_liters_standard":1317.897}
# """


# # ============================================================
# # Helpers
# # ============================================================

# def _extract_json_object(s):
#     if not s:
#         return {}
#     s = s.strip()
#     if s.startswith("```"):
#         s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
#         s = re.sub(r"\s*```$", "", s)
#     m = re.search(r"\{.*\}", s, flags=re.DOTALL)
#     if not m:
#         return {}
#     try:
#         return json.loads(m.group(0))
#     except Exception:
#         return {}


# def _t():
#     return time.perf_counter()


# def _log_t(label, t0):
#     logger.info("[WAYBILL-TIME] %s: %.2fs", label, time.perf_counter() - t0)


# # ============================================================
# # Step 1: OCR
# # ============================================================

# # WAYBILL_OCR_PROMPT = (
# #     "You are performing OCR on a scanned aviation fuel delivery waybill (oro važtaraštis). "
# #     "Transcribe ALL visible text accurately, preserving the document structure.\n\n"
# #     "CRITICAL RULES:\n"
# #     "1. CHECKBOXES: For every checkbox, radio button, or tickable option in the document, "
# #     "clearly indicate its state:\n"
# #     "Checkboxes are usually handwritten with X inside so consider such checkboxes as checked and return [X].\n"
# #     "   - [X] if the box is checked, ticked, marked, or filled\n"
# #     "   - [ ] if the box is empty, unchecked, or blank\n"
# #     "   Example: '[X] Invoice / [ ] Credit Card / [ ] Fueling card'\n"
# #     "   Example: '[X] Commercial / [ ] Private / [ ] Other'\n"
# #     "   Example: '[X] Delivery receipt / [ ] Defuelling receipt'\n"
# #     "   Example: '[ ] Airline earning more than half of its annual income from transportation...'\n\n"
# #     "2. HANDWRITTEN TEXT: Transcribe handwritten entries as accurately as possible. "
# #     "Mark them with (Handwritten) after the value.\n"
# #     "   Example: 'Customer: LUFTHANSA (Handwritten)'\n\n"
# #     "3. TABLES: Use Markdown table syntax for tabular data like fuel measurements, prices.\n\n"
# #     "4. FORM FIELDS: Transcribe label and value pairs clearly.\n"
# #     "   Example: 'IATA code: PNN'\n"
# #     "   Example: 'Aircraft type: A320 (Handwritten)'\n\n"
# #     "5. EMPTY FIELDS: If a field exists but has no value, write '(Empty)' next to it.\n\n"
# #     "6. SECTIONS: Group related fields under clear section headers using bold text:\n"
# #     "   **Payment Method**, **Customer Details**, **Flight Timing**, "
# #     "   **Refueling Data**, **Fuel Details**, **Signatures**, etc.\n\n"
# #     "7. ACCURACY: Do not summarize, interpret, or add information not present in the image. "
# #     "Transcribe numbers, dates, codes, and names exactly as written.\n\n"
# #     "8. METER READINGS: Pay special attention to large numbers in meter/counter readings "
# #     "(before fuelling, after fuelling, difference).\n\n"
# #     "9. TWO MEASUREMENT ROWS: The fuel details section usually has two rows:\n"
# #     "   - Row 1: observed/actual density, temperature, liters, kilograms\n"
# #     "   - Row 2: standard at +15°C density, temperature (+15), liters\n"
# #     "   Transcribe both rows clearly.\n\n"
# #     "10. Don't mix up tipas/type with Skrydzio pobudis/nature of flight. Tipas/type usually has a number like 1, 2, 3... while nature of flight 3 checkboxes (commercial, private and other).\n"
# #     "Start the transcription now."
# # )

# WAYBILL_OCR_PROMPT = (
#     "You are performing OCR on a scanned aviation fuel delivery waybill (oro važtaraštis). "
#     "Transcribe ALL visible text accurately, preserving the document structure.\n\n"
#     "CRITICAL RULES:\n\n"
#     "1. CHECKBOXES: This document contains multiple checkbox fields. "
#     "A checkbox is CHECKED if it contains ANY mark inside: ✓, X, V, a tick, a cross, a filled square, or any handwritten mark. "
#     "A checkbox is UNCHECKED only if the box is completely empty.\n"
#     "   - Use [X] for checked boxes\n"
#     "   - Use [ ] for unchecked/empty boxes\n\n"
#     "   Here is the EXACT LIST of checkbox groups in this document:\n\n"
#     "   TOP RIGHT area - Document type (one of two):\n"
#     "   - 'Važtaraštis kurui užpilti / Delivery receipt' — checkbox to the LEFT of text\n"
#     "   - 'Važtaraštis kurui išpilti / Defuelling receipt' — checkbox to the LEFT of text\n\n"
#     "   LEFT SIDE - Payment method (Mokėjimo būdas) — checkboxes to the LEFT of each option:\n"
#     "   - 'pavedimu / Invoice'\n"
#     "   - 'kuro užpildymo kortelė / Fuelling card'\n"
#     "   - 'grynais / cash'\n"
#     "   - 'kortelė / credit card'\n"
#     "   - 'kreditinė kortelė / credit card'\n\n"
#     "   MIDDLE area - Remarks about airline income:\n"
#     "   - 'Aviakompanija, daugiau kaip pusę pajamų...' / 'Airline earning more than half...' — one checkbox\n\n"
#     "   RIGHT SIDE - Flight nature (Skrydžio pobūdis) — checkboxes to the LEFT of each option:\n"
#     "   - 'komercinis / commercial'\n"
#     "   - 'privatus / private'\n"
#     "   - 'kita / other'\n\n"
#     "   RIGHT SIDE - Outside EU:\n"
#     "   - 'už ES ribų / outside the EU' — one checkbox\n\n"
#     "   BOTTOM - Product type:\n"
#     "   - 'JET A-1'\n"
#     "   - 'AVGAS 100LL'\n\n"
#     "   BOTTOM - Delivered product is free of:\n"
#     "   - 'vandens / water'\n"
#     "   - 'purvo / dirt'\n\n"
#     "   BOTTOM - Currency:\n"
#     "   - 'EUR'\n"
#     "   - 'USD'\n\n"
#     "   Look VERY carefully at each checkbox. A handwritten tick mark (✓) or check mark "
#     "INSIDE or NEXT TO the box means it is CHECKED [X].\n\n"
#     "2. HANDWRITTEN TEXT: Transcribe handwritten entries accurately. "
#     "Mark them with (Handwritten) after the value.\n\n"
#     "3. TABLES: Use Markdown table syntax for tabular data.\n\n"
#     "4. FORM FIELDS: Transcribe label-value pairs clearly.\n\n"
#     "5. EMPTY FIELDS: Write '(Empty)' for fields with no value.\n\n"
#     "6. SECTIONS: Group under bold headers: "
#     "**Document Info**, **Payment Method**, **Customer Details**, **Aircraft and Flight**, "
#     "**Flight Timing**, **Flight Route**, **Refueling Data**, **Fuel Measurements**, "
#     "**Product**, **Signatures**\n\n"
#     "7. ACCURACY: Do not add information not present. Transcribe exactly.\n\n"
#     "8. METER READINGS: Large counter numbers — transcribe carefully.\n\n"
#     "9. TWO MEASUREMENT ROWS: Row 1 = observed (actual temp), Row 2 = standard (+15°C).\n\n"
#     "10. tipas/type (number like 1,2,3) is DIFFERENT from Skrydžio pobūdis/Nature of flight (commercial/private/other).\n\n"
#     "Start the transcription now."
# )


# def get_waybill_ocr_text(image_data, filename=None):
#     """OCR важтарашчиса через Gemini 3.1 Flash Lite с waybill-специфичным промптом."""
#     try:
#         from google import genai
#         from google.genai import types
#     except ImportError:
#         return None, "google-genai not installed"

#     import os
#     api_key = os.environ.get("GEMINI_API_KEY")
#     if not api_key:
#         return None, "GEMINI_API_KEY not set"

#     ext = ""
#     if filename:
#         ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()

#     mime_map = {
#         "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
#         "webp": "image/webp", "tiff": "image/tiff", "tif": "image/tiff",
#         "pdf": "application/pdf",
#     }
#     mime_type = mime_map.get(ext, "image/jpeg")

#     PRIMARY_MODEL = "gemini-3.1-flash-lite"
#     FALLBACK_MODEL = "gemini-2.5-flash-lite"
#     TIMEOUT_MS = 60_000

#     client = genai.Client(
#         api_key=api_key,
#         http_options=types.HttpOptions(timeout=TIMEOUT_MS),
#     )

#     contents = [
#         types.Content(
#             role="user",
#             parts=[
#                 types.Part.from_bytes(data=image_data, mime_type=mime_type),
#                 types.Part.from_text(text=WAYBILL_OCR_PROMPT),
#             ],
#         )
#     ]

#     t0 = _t()
#     text = None
#     for model in (PRIMARY_MODEL, FALLBACK_MODEL):
#         try:
#             logger.info(
#                 "[WAYBILL-OCR] Sending %s (%d bytes, mime=%s) to %s",
#                 filename or "unknown", len(image_data), mime_type, model,
#             )
#             response = client.models.generate_content(model=model, contents=contents)
#             text = (response.text or "").strip()
#             if text:
#                 break
#             logger.warning("[WAYBILL-OCR] %s returned empty, trying fallback", model)
#         except Exception as e:
#             logger.warning("[WAYBILL-OCR] %s failed: %s, trying fallback", model, e)

#     _log_t("OCR (waybill-specific)", t0)

#     if not text:
#         return None, "All OCR models failed"

#     logger.info("[WAYBILL-OCR] OK: %d chars", len(text))
#     return text, None


# # ============================================================
# # Step 2: Extraction
# # ============================================================

# def extract_waybill_fields(ocr_text):
#     from .kie import ask_llm_provider_with_retry

#     t0 = _t()
#     try:
#         raw_response, source_model = ask_llm_provider_with_retry(
#             text=ocr_text,
#             prompt=WAYBILL_EXTRACTION_PROMPT,
#             model="gemini-2.5-flash",
#             max_retries=2,
#             wait_seconds=3,
#             temperature=0.5,
#             max_output_tokens=15000,
#             timeout_seconds=120,
#             logger=logger,
#         )
#     except Exception as e:
#         _log_t("KIE extraction (failed)", t0)
#         logger.error("[WAYBILL-EXTRACT] KIE failed: %s", e)
#         return None, None, str(e)

#     _log_t(f"KIE extraction ({source_model})", t0)

#     if not raw_response or not raw_response.strip():
#         return None, raw_response, "KIE returned empty response"

#     structured = _extract_json_object(raw_response)
#     if not structured:
#         return None, raw_response, "Failed to parse JSON"

#     logger.info(
#         "[WAYBILL-EXTRACT] Parsed %d fields, number=%s",
#         len(structured), structured.get("document_number", "?"),
#     )
#     return structured, raw_response, None


# # ============================================================
# # Duplicate check
# # ============================================================

# def is_waybill_duplicate(user, document_number, exclude_doc_id=None):
#     """Proverka dublikata po document_number (jesli nepustoj)."""
#     if not document_number or not str(document_number).strip():
#         return False

#     from ..models import ScannedWaybill

#     qs = ScannedWaybill.objects.filter(
#         user=user,
#         document_number=str(document_number).strip(),
#         status__in=("completed", "exported"),
#     )
#     if exclude_doc_id:
#         qs = qs.exclude(pk=exclude_doc_id)

#     return qs.exists()


# # ============================================================
# # Mapping JSON -> ScannedWaybill
# # ============================================================

# DIRECT_FIELD_MAP = {
#     # Dokumentas
#     "airport": "airport",
#     "document_number": "document_number",
#     "document_date": "document_date",
#     "payment_type": "payment_type",
#     "delivery_receipt": "delivery_receipt",
#     "defuelling_receipt": "defuelling_receipt",
#     # Pirkejas
#     "buyer_iata_code": "buyer_iata_code",
#     "buyer_name": "buyer_name",
#     "buyer_address": "buyer_address",
#     "buyer_vat_code": "buyer_vat_code",
#     "buyer_remark_half_income": "buyer_remark_half_income",
#     "buyer_remark_other": "buyer_remark_other",
#     # Orlaivis
#     "aircraft_type": "aircraft_type",
#     "flight_type": "flight_type",
#     "outside_eu": "outside_eu",
#     "flight_nature": "flight_nature",
#     # Laikas
#     "time_departure": "time_departure",
#     "time_arrival": "time_arrival",
#     "time_start": "time_start",
#     "time_finish": "time_finish",
#     "time_return": "time_return",
#     # Marsrutas
#     "from_city": "from_city",
#     "from_airport_code": "from_airport_code",
#     "from_country_iso": "from_country_iso",
#     "to_city": "to_city",
#     "to_airport_code": "to_airport_code",
#     "to_country_iso": "to_country_iso",
#     # Skaitikliai
#     "refueller_number": "refueller_number",
#     "reading_before": "reading_before",
#     "reading_after": "reading_after",
#     "reading_difference": "reading_difference",
#     # Operatorius
#     "company_representative": "company_representative",
#     # Matavimai - faktinis
#     "density_observed": "density_observed",
#     "temperature_observed": "temperature_observed",
#     "quantity_liters_observed": "quantity_liters_observed",
#     "quantity_kg_observed": "quantity_kg_observed",
#     # Matavimai - standartinis
#     "density_standard": "density_standard",
#     "temperature_standard": "temperature_standard",
#     "quantity_liters_standard": "quantity_liters_standard",
# }

# DATE_FIELDS = {"document_date"}
# BOOL_FIELDS = {"delivery_receipt", "defuelling_receipt", "buyer_remark_half_income", "outside_eu"}
# DECIMAL_FIELDS = {
#     "reading_before", "reading_after", "reading_difference",
#     "density_observed", "temperature_observed", "quantity_liters_observed", "quantity_kg_observed",
#     "density_standard", "temperature_standard", "quantity_liters_standard",
# }


# def _parse_date(val):
#     if not val:
#         return None
#     try:
#         return date.fromisoformat(str(val).strip()[:10])
#     except (ValueError, TypeError):
#         return None


# def _parse_decimal(val):
#     if val is None:
#         return None
#     try:
#         return Decimal(str(val))
#     except (InvalidOperation, TypeError, ValueError):
#         return None


# def _parse_bool(val):
#     if val is None:
#         return None
#     if isinstance(val, bool):
#         return val
#     s = str(val).strip().lower()
#     if s in ("true", "1", "yes", "taip"):
#         return True
#     if s in ("false", "0", "no", "ne"):
#         return False
#     return None


# def update_scanned_waybill(db_waybill, structured, raw_response, preview_url):
#     """Mappit structured JSON na polia ScannedWaybill i soxraniajet."""
#     update_fields = []

#     db_waybill.gpt_raw_json = raw_response
#     db_waybill.structured_json = structured
#     db_waybill.preview_url = preview_url
#     update_fields.extend(["gpt_raw_json", "structured_json", "preview_url"])

#     for json_key, model_field in DIRECT_FIELD_MAP.items():
#         val = structured.get(json_key)
#         if val is None:
#             continue

#         if model_field in DATE_FIELDS:
#             val = _parse_date(val)
#         elif model_field in BOOL_FIELDS:
#             val = _parse_bool(val)
#         elif model_field in DECIMAL_FIELDS:
#             val = _parse_decimal(val)
#         else:
#             val = str(val).strip() if val else None

#         if val is not None:
#             setattr(db_waybill, model_field, val)
#             update_fields.append(model_field)

#     db_waybill.status = "completed"
#     update_fields.append("status")

#     db_waybill.save(update_fields=list(set(update_fields)))

#     logger.info(
#         "[WAYBILL] Updated id=%s: %d fields, number=%s",
#         db_waybill.pk, len(update_fields), db_waybill.document_number,
#     )