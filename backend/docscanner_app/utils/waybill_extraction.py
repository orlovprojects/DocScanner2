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

OPENROUTER_CHECKBOX_MODEL = "nex-agi/nex-n2-pro"
OPENROUTER_CHECKBOX_FALLBACK = "qwen/qwen3.5-flash-02-23"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _call_openrouter_checkboxes(data_url, prompt, filename=None, image_size=0, model=None):
    """Checkbox verification через OpenRouter."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise Exception("OPENROUTER_API_KEY not set")

    use_model = model or OPENROUTER_CHECKBOX_MODEL

    payload = {
        "model": use_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "reasoning": {"enabled": False},
        "temperature": 0.0,
        "max_tokens": 5000,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    logger.info("[WAYBILL-OR] Sending %s (%d bytes) to %s",
                filename or "unknown", image_size, use_model)

    t0 = time.perf_counter()
    resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=120.0)
    elapsed = time.perf_counter() - t0

    data = resp.json()

    if resp.status_code >= 400:
        msg = data.get("error", {}).get("message", str(data))
        raise Exception(f"OpenRouter HTTP {resp.status_code}: {msg}")

    result = ""
    choices = data.get("choices", [])
    if choices:
        result = choices[0].get("message", {}).get("content", "")

    logger.info("[WAYBILL-OR] %s OK: len=%d elapsed=%.2fs", use_model, len(result), elapsed)

    return result.strip()

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
9. If the image contains MORE THAN ONE waybill document (multiple waybills on one page), return: {"keli_dokumentai":true}"
"""


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

**Definition of CHECKED (must be returned):**
- The box is CHECKED if there is ANY intentional mark INSIDE the borders of the square box: a tick (✓), cross (✗), X, V, filled square, diagonal line, dot, scribble, or any handwritten stroke that overlaps the box interior.
- Even a small, faint, or partial mark counts as CHECKED.
- A simple shadow, smudge from printing, or background noise that does NOT form a deliberate marking inside the box is UNCHECKED.
- If the box is completely empty and clean (no marks), it is UNCHECKED.
- Do NOT confuse text or lines printed outside the box as a mark inside the box.

Ignore checkboxed that are not in my 1-13 list.

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

def extract_waybill_main(image_data, filename=None):
    """Step 1: KIE Gemini 2.5 Flash → vse polja JSON.
    Returns: (structured, raw_main, data_url, error)
    """
    mime_type = _get_mime_type(filename)
    b64 = base64.b64encode(image_data).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    t0 = _t()
    raw_main = None
    source = None

    try:
        raw_main = _call_kie(
            data_url=data_url, prompt=WAYBILL_PROMPT,
            endpoint_key="flash25", filename=filename, image_size=len(image_data),
        )
        source = "kie-gemini-2.5-flash"
    except Exception as e:
        logger.warning("[WAYBILL] KIE 2.5 Flash failed: %s — trying direct Gemini", e)

    if not raw_main:
        try:
            raw_main = _call_direct_gemini(image_data, mime_type, filename)
            source = "direct-gemini-2.5-flash"
        except Exception as e:
            _log_t("All extraction failed", t0)
            return None, None, None, str(e)

    _log_t(f"Step 1: Main extraction ({source})", t0)

    if not raw_main or not raw_main.strip():
        return None, raw_main, None, "Empty response"

    structured = _extract_json_object(raw_main)
    if not structured:
        return None, raw_main, None, "Failed to parse JSON"

    logger.info("[WAYBILL] Step 1 OK: %d fields, number=%s",
                len(structured), structured.get("document_number", "?"))

    return structured, raw_main, data_url, None


def verify_checkboxes(data_url, filename=None, image_size=0):
    """Step 2: Checkbox verification.
    Chain: nex-n2-pro (3 retries) → qwen (3 retries) → KIE 3.1 Pro.
    """
    t0 = _t()
    raw_checkboxes = None
    checked = []

    # ── 1. nex-n2-pro (3 retries) ──
    for attempt in range(1, 4):
        try:
            raw_checkboxes = _call_openrouter_checkboxes(
                data_url=data_url, prompt=CHECKBOX_VERIFICATION_PROMPT,
                filename=filename, image_size=image_size,
                model=OPENROUTER_CHECKBOX_MODEL,
            )
            cb_data = _extract_json_object(raw_checkboxes)
            checked = cb_data.get("checked", [])
            if isinstance(checked, list) and len(checked) > 0:
                logger.info("[WAYBILL] nex-n2-pro attempt %d OK: checked=%s", attempt, checked)
                _log_t("Step 2: Checkbox verification (nex-n2-pro)", t0)
                return checked, raw_checkboxes
            logger.warning("[WAYBILL] nex-n2-pro attempt %d: invalid response", attempt)
        except Exception as e:
            logger.warning("[WAYBILL] nex-n2-pro attempt %d failed: %s", attempt, e)
        if attempt < 3:
            time.sleep(2 * attempt)

    # ── 2. qwen fallback (3 retries) ──
    for attempt in range(1, 4):
        try:
            raw_checkboxes = _call_openrouter_checkboxes(
                data_url=data_url, prompt=CHECKBOX_VERIFICATION_PROMPT,
                filename=filename, image_size=image_size,
                model=OPENROUTER_CHECKBOX_FALLBACK,
            )
            cb_data = _extract_json_object(raw_checkboxes)
            checked = cb_data.get("checked", [])
            if isinstance(checked, list) and len(checked) > 0:
                logger.info("[WAYBILL] qwen attempt %d OK: checked=%s", attempt, checked)
                _log_t("Step 2: Checkbox verification (qwen)", t0)
                return checked, raw_checkboxes
            logger.warning("[WAYBILL] qwen attempt %d: invalid response", attempt)
        except Exception as e:
            logger.warning("[WAYBILL] qwen attempt %d failed: %s", attempt, e)
        if attempt < 3:
            time.sleep(2 * attempt)

    # ── 3. KIE 3.1 Pro fallback ──
    try:
        raw_checkboxes = _call_kie(
            data_url=data_url, prompt=CHECKBOX_VERIFICATION_PROMPT,
            endpoint_key="pro31", filename=filename, image_size=image_size,
        )
        cb_data = _extract_json_object(raw_checkboxes)
        checked = cb_data.get("checked", [])
        if isinstance(checked, list) and len(checked) > 0:
            logger.info("[WAYBILL] KIE 3.1 Pro OK: checked=%s", checked)
            _log_t("Step 2: Checkbox verification (KIE 3.1 Pro)", t0)
            return checked, raw_checkboxes
    except Exception as e:
        logger.warning("[WAYBILL] KIE 3.1 Pro failed: %s", e)

    _log_t("Step 2: Checkbox verification (all failed)", t0)
    return [], raw_checkboxes

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
    

def split_pdf_to_pages(pdf_bytes, base_filename):
    """Razrezajet multi-page PDF na otdelnyje stranicy (JPEG).
    Returns list of dicts ili None jesli PDF <= 1 stranicy.
    """
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        logger.warning("[WAYBILL] pdf2image not installed, cannot split PDF")
        return None

    import io

    try:
        images = convert_from_bytes(pdf_bytes, dpi=200, fmt="jpeg", timeout=60)
    except Exception as e:
        logger.warning("[WAYBILL] PDF split failed: %s", e)
        return None

    if len(images) <= 1:
        return None

    base = os.path.splitext(base_filename)[0]
    pages = []

    for i, img in enumerate(images, start=1):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        pages.append({
            "filename": f"{base}_v{i}.jpg",
            "data": buf.getvalue(),
            "original_filename": f"{base}_v{i}.jpg",
        })

    logger.info("[WAYBILL] PDF split: %s → %d pages", base_filename, len(pages))
    return pages











