"""
enhanced_ocr.py — Enhanced OCR через Gemini для документов с плохой геометрией или сложными таблицами.

Chain:
1) direct gemini-3.1-flash-lite (flex)
2) OpenRouter gemini-3.1-flash-lite (google-ai-studio/flex)
3) direct gemini-3.1-flash-lite (standard)

Telegram: при фейле шага 1 и при исчерпании всей цепочки.
"""
import os
import time
import base64
import logging

import requests
from celery.exceptions import SoftTimeLimitExceeded

LOGGER = logging.getLogger("docscanner_app")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
OCR_MODEL = "gemini-3.1-flash-lite"
OCR_FLEX_TIMEOUT = 60
OCR_STANDARD_TIMEOUT = 60

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip().strip('"').strip("'")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_OCR_MODEL = "google/gemini-3.1-flash-lite"
OPENROUTER_OCR_PROVIDER = os.getenv("OPENROUTER_LITE_PROVIDER", "google-ai-studio/flex").strip()
OPENROUTER_OCR_TIMEOUT = 60

OCR_ERROR_TELEGRAM = os.getenv("KIE_ERROR_TELEGRAM", "1").strip().lower() in ("1", "true", "yes", "on")

ENHANCED_OCR_PROMPT = (
    "Please perform an accurate OCR-like transcription of the provided document. "
    "Your goal is to convert the visual content into a structured text format that mirrors the document's layout as closely as possible.\n"
    "Follow these rules:\n"
    "1. Layout Preservation: Transcribe the text line-by-line, maintaining the original order and grouping.\n"
    "2. Tables: If the document contains a table, you must use Markdown table syntax to represent it. Ensure all columns and rows are correctly aligned.\n"
    "3. Accuracy: Do not summarize or interpret the data. Transcribe exactly what is written, including numbers, dates, currency symbols, and technical codes.\n"
    "4. Formatting: If a section is clearly a header, footer, or a specific data block (like 'Seller details' or 'Buyer details'), label it clearly using bold text (e.g., **Seller Details**).\n"
    "5. Handwritten notes: If there are handwritten notes or signatures, include them in the transcription, noting that they are handwritten.\n"
    "6. No Hallucinations: Do not add any information that is not present in the image. If a field is empty, leave it empty or indicate it as such.\n"
    "7. Output: Provide the final output in a clean, readable format ready for data extraction by an accounting system.\n"
    "Please start the transcription now."
)


def _notify_ocr(message: str, dedup_key: str, dedup_ttl: int, log) -> None:
    if not OCR_ERROR_TELEGRAM:
        return

    try:
        from ..celery_signals import _send_telegram
        _send_telegram(message, dedup_key=dedup_key, dedup_ttl=dedup_ttl)
    except Exception as tg_err:
        log.warning("[ENHANCED-OCR] Failed to send Telegram notification: %s", tg_err)


_OCR_CLIENTS: dict[int, object] = {}


def _get_ocr_client(timeout_seconds: int):
    """
    Кэш genai.Client по таймауту: создание клиента занимает ~0.7s.
    """
    from google import genai

    timeout_ms = int(timeout_seconds * 1000)
    client = _OCR_CLIENTS.get(timeout_ms)
    if client is None:
        client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options={"timeout": timeout_ms},
        )
        _OCR_CLIENTS[timeout_ms] = client
    return client


def _ask_gemini_ocr(data: bytes, mime_type: str, *, flex: bool, timeout_seconds: int, log) -> str:
    """
    Direct Gemini 3.1 flash-lite, flex или standard, thinking minimal.
    """
    from google.genai import types

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = _get_ocr_client(timeout_seconds)

    config = {
        "max_output_tokens": 20000,
        "thinking_config": {"thinking_level": "minimal"},
    }
    if flex:
        config["service_tier"] = "flex"

    t0 = time.perf_counter()

    response = client.models.generate_content(
        model=OCR_MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=data, mime_type=mime_type),
                    types.Part.from_text(text=ENHANCED_OCR_PROMPT),
                ],
            )
        ],
        config=config,
    )

    elapsed = time.perf_counter() - t0

    tier = None
    try:
        tier = response.sdk_http_response.headers.get("x-gemini-service-tier")
    except Exception:
        pass

    text = (response.text or "").strip()

    log.info(
        "[ENHANCED-OCR] direct %s elapsed=%.2fs tier=%s usage=%s len=%d",
        OCR_MODEL,
        elapsed,
        tier,
        getattr(response, "usage_metadata", None),
        len(text),
    )

    return text


def _ask_openrouter_ocr(data: bytes, mime_type: str, filename: str, log) -> str:
    """
    OpenRouter gemini-3.1-flash-lite (flex), файл через base64, без reasoning.
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    b64 = base64.b64encode(data).decode("ascii")
    data_url = f"data:{mime_type};base64,{b64}"

    if mime_type == "application/pdf":
        file_part = {
            "type": "file",
            "file": {
                "filename": filename or "document.pdf",
                "file_data": data_url,
            },
        }
    else:
        file_part = {
            "type": "image_url",
            "image_url": {
                "url": data_url,
            },
        }

    payload = {
        "model": OPENROUTER_OCR_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    file_part,
                    {
                        "type": "text",
                        "text": ENHANCED_OCR_PROMPT,
                    },
                ],
            }
        ],
        "max_tokens": 20000,
        "provider": {
            "only": [OPENROUTER_OCR_PROVIDER],
            "allow_fallbacks": False,
        },
        "reasoning": {
            "enabled": False,
        },
    }

    t0 = time.perf_counter()

    try:
        resp = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=float(OPENROUTER_OCR_TIMEOUT),
        )
    except requests.exceptions.Timeout as e:
        raise RuntimeError(f"OpenRouter OCR timed out after {OPENROUTER_OCR_TIMEOUT}s") from e
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError("OpenRouter OCR connection error") from e

    elapsed = time.perf_counter() - t0

    try:
        resp_json = resp.json()
    except Exception:
        raise RuntimeError(f"OpenRouter HTTP {resp.status_code} non-JSON response: {resp.text[:500]}")

    err = resp_json.get("error")
    if resp.status_code >= 400 or err:
        msg = err.get("message") if isinstance(err, dict) else str(err or resp_json)
        raise RuntimeError(f"OpenRouter HTTP {resp.status_code}: {msg}")

    choices = resp_json.get("choices") or []
    first = (choices[0] if choices else None) or {}
    message = first.get("message") or {}
    content = message.get("content")

    if isinstance(content, list):
        content = "".join(
            str(part.get("text") or "")
            for part in content
            if isinstance(part, dict)
        )

    text = (content or "").strip() if isinstance(content, str) else ""

    log.info(
        "[ENHANCED-OCR] OpenRouter %s (%s) elapsed=%.2fs finish_reason=%s usage=%s len=%d",
        OPENROUTER_OCR_MODEL,
        OPENROUTER_OCR_PROVIDER,
        elapsed,
        first.get("finish_reason"),
        resp_json.get("usage"),
        len(text),
    )

    return text


def get_enhanced_ocr_text(data: bytes, filename: str = None, logger=None) -> tuple:
    """
    Enhanced OCR — для документов с плохой геометрией
    или сложными таблицами (высокий line_collision_ratio).

    Chain: direct 3.1 flash-lite (flex) → OpenRouter 3.1 flash-lite (flex) → direct 3.1 flash-lite (standard)

    Returns:
        (text: str|None, error: str|None)
    """
    log = logger or LOGGER

    # Определяем mime type
    ext = ""
    if filename:
        ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()

    mime_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "tiff": "image/tiff",
        "tif": "image/tiff",
        "pdf": "application/pdf",
    }
    mime_type = mime_map.get(ext, "image/jpeg")
    fname = filename or "unknown"
    errors = []

    # ── 1) direct gemini-3.1-flash-lite (flex) ──
    try:
        log.info(
            "[ENHANCED-OCR] 1/3 %s (%d bytes, mime=%s) → direct %s (flex)",
            fname, len(data), mime_type, OCR_MODEL,
        )
        text = _ask_gemini_ocr(data, mime_type, flex=True, timeout_seconds=OCR_FLEX_TIMEOUT, log=log)
        if text:
            log.info("[ENHANCED-OCR] OK source=direct-%s-flex for %s: %d chars", OCR_MODEL, fname, len(text))
            return text, None
        err_1 = "empty response"
    except SoftTimeLimitExceeded:
        raise
    except Exception as e:
        err_1 = str(e)

    errors.append(f"direct flex: {err_1}")
    log.warning("[ENHANCED-OCR] direct %s (flex) failed: %s → OpenRouter", OCR_MODEL, err_1)
    _notify_ocr(
        f"⚠️ <b>ENHANCED-OCR: 1-я модель зафейлила</b>\n"
        f"<b>Model:</b> <code>direct {OCR_MODEL} (flex)</code>\n"
        f"<b>File:</b> <code>{fname}</code>\n"
        f"<b>Error:</b> {err_1[:300]}\n\n"
        f"Идем на fallback.",
        dedup_key="enhanced_ocr_first_step_failed",
        dedup_ttl=300,
        log=log,
    )

    # ── 2) OpenRouter gemini-3.1-flash-lite (flex) ──
    try:
        log.info("[ENHANCED-OCR] 2/3 %s → OpenRouter %s (%s)", fname, OPENROUTER_OCR_MODEL, OPENROUTER_OCR_PROVIDER)
        text = _ask_openrouter_ocr(data, mime_type, filename, log)
        if text:
            log.info("[ENHANCED-OCR] OK source=openrouter-%s for %s: %d chars", OPENROUTER_OCR_MODEL, fname, len(text))
            return text, None
        errors.append("openrouter flex: empty response")
        log.warning("[ENHANCED-OCR] OpenRouter returned empty → direct standard")
    except SoftTimeLimitExceeded:
        raise
    except Exception as e:
        errors.append(f"openrouter flex: {e}")
        log.warning("[ENHANCED-OCR] OpenRouter failed: %s → direct standard", e)

    # ── 3) direct gemini-3.1-flash-lite (standard) ──
    try:
        log.info("[ENHANCED-OCR] 3/3 %s → direct %s (standard)", fname, OCR_MODEL)
        text = _ask_gemini_ocr(data, mime_type, flex=False, timeout_seconds=OCR_STANDARD_TIMEOUT, log=log)
        if text:
            log.info("[ENHANCED-OCR] OK source=direct-%s for %s: %d chars", OCR_MODEL, fname, len(text))
            return text, None
        errors.append("direct standard: empty response")
    except SoftTimeLimitExceeded:
        raise
    except Exception as e:
        errors.append(f"direct standard: {e}")
        log.warning("[ENHANCED-OCR] direct %s (standard) failed: %s", OCR_MODEL, e)

    error_msg = "Enhanced OCR: all failed | " + " | ".join(errors)
    log.error("[ENHANCED-OCR] %s for %s", error_msg, fname)

    _notify_ocr(
        f"🚨 <b>ENHANCED-OCR: все попытки исчерпаны</b>\n"
        f"<b>Chain:</b> <code>direct {OCR_MODEL} (flex) → openrouter {OPENROUTER_OCR_MODEL} ({OPENROUTER_OCR_PROVIDER}) → direct {OCR_MODEL} (standard)</code>\n"
        f"<b>File:</b> <code>{fname}</code>\n"
        f"<b>Errors:</b> {error_msg[:500]}",
        dedup_key="enhanced_ocr_chain_exhausted",
        dedup_ttl=600,
        log=log,
    )

    return None, error_msg









# """
# enhanced_ocr.py — Enhanced OCR через Gemini для документов с плохой геометрией или сложными таблицами.

# Chain:
# 1) OpenRouter gemini-3.1-flash-lite (google-ai-studio/flex)
# 2) direct gemini-3.1-flash-lite
# 3) direct gemini-2.5-flash-lite
# """
# import os
# import time
# import base64
# import logging

# import requests
# from celery.exceptions import SoftTimeLimitExceeded

# logger = logging.getLogger("docscanner_app")

# OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip().strip('"').strip("'")
# OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# OPENROUTER_OCR_MODEL = "google/gemini-3.1-flash-lite"
# OPENROUTER_OCR_PROVIDER = "google-ai-studio/flex"
# OPENROUTER_OCR_TIMEOUT = 60

# ENHANCED_OCR_PROMPT = (
#     "Please perform an accurate OCR-like transcription of the provided document. "
#     "Your goal is to convert the visual content into a structured text format that mirrors the document's layout as closely as possible.\n"
#     "Follow these rules:\n"
#     "1. Layout Preservation: Transcribe the text line-by-line, maintaining the original order and grouping.\n"
#     "2. Tables: If the document contains a table, you must use Markdown table syntax to represent it. Ensure all columns and rows are correctly aligned.\n"
#     "3. Accuracy: Do not summarize or interpret the data. Transcribe exactly what is written, including numbers, dates, currency symbols, and technical codes.\n"
#     "4. Formatting: If a section is clearly a header, footer, or a specific data block (like 'Seller details' or 'Buyer details'), label it clearly using bold text (e.g., **Seller Details**).\n"
#     "5. Handwritten notes: If there are handwritten notes or signatures, include them in the transcription, noting that they are handwritten.\n"
#     "6. No Hallucinations: Do not add any information that is not present in the image. If a field is empty, leave it empty or indicate it as such.\n"
#     "7. Output: Provide the final output in a clean, readable format ready for data extraction by an accounting system.\n"
#     "Please start the transcription now."
# )


# def _ask_openrouter_ocr(data: bytes, mime_type: str, filename: str = None, logger=None) -> str:
#     """
#     OpenRouter gemini-3.1-flash-lite (flex), файл через base64.
#     """
#     if not OPENROUTER_API_KEY:
#         raise RuntimeError("OPENROUTER_API_KEY not set")

#     b64 = base64.b64encode(data).decode("ascii")
#     data_url = f"data:{mime_type};base64,{b64}"

#     if mime_type == "application/pdf":
#         file_part = {
#             "type": "file",
#             "file": {
#                 "filename": filename or "document.pdf",
#                 "file_data": data_url,
#             },
#         }
#     else:
#         file_part = {
#             "type": "image_url",
#             "image_url": {
#                 "url": data_url,
#             },
#         }

#     payload = {
#         "model": OPENROUTER_OCR_MODEL,
#         "messages": [
#             {
#                 "role": "user",
#                 "content": [
#                     file_part,
#                     {
#                         "type": "text",
#                         "text": ENHANCED_OCR_PROMPT,
#                     },
#                 ],
#             }
#         ],
#         "max_tokens": 20000,
#         "provider": {
#             "only": [OPENROUTER_OCR_PROVIDER],
#             "allow_fallbacks": False,
#         },
#         "reasoning": {
#             "enabled": False,
#         },
#     }

#     t0 = time.perf_counter()

#     try:
#         resp = requests.post(
#             OPENROUTER_URL,
#             headers={
#                 "Authorization": f"Bearer {OPENROUTER_API_KEY}",
#                 "Content-Type": "application/json",
#             },
#             json=payload,
#             timeout=float(OPENROUTER_OCR_TIMEOUT),
#         )
#     except requests.exceptions.Timeout as e:
#         raise RuntimeError(f"OpenRouter OCR timed out after {OPENROUTER_OCR_TIMEOUT}s") from e
#     except requests.exceptions.ConnectionError as e:
#         raise RuntimeError("OpenRouter OCR connection error") from e

#     elapsed = time.perf_counter() - t0

#     try:
#         resp_json = resp.json()
#     except Exception:
#         raise RuntimeError(f"OpenRouter HTTP {resp.status_code} non-JSON response: {resp.text[:500]}")

#     err = resp_json.get("error")
#     if resp.status_code >= 400 or err:
#         msg = err.get("message") if isinstance(err, dict) else str(err or resp_json)
#         raise RuntimeError(f"OpenRouter HTTP {resp.status_code}: {msg}")

#     choices = resp_json.get("choices") or []
#     first = (choices[0] if choices else None) or {}
#     message = first.get("message") or {}
#     content = message.get("content")

#     if isinstance(content, list):
#         content = "".join(
#             str(part.get("text") or "")
#             for part in content
#             if isinstance(part, dict)
#         )

#     text = (content or "").strip() if isinstance(content, str) else ""

#     if logger:
#         logger.info(
#             "[ENHANCED-OCR] OpenRouter elapsed=%.2fs finish_reason=%s usage=%s len=%d",
#             elapsed,
#             first.get("finish_reason"),
#             resp_json.get("usage"),
#             len(text),
#         )

#     return text


# def get_enhanced_ocr_text(data: bytes, filename: str = None, logger=None) -> tuple:
#     """
#     Enhanced OCR — для документов с плохой геометрией
#     или сложными таблицами (высокий line_collision_ratio).

#     Chain: OpenRouter 3.1 flash-lite (flex) → direct 3.1 flash-lite → direct 2.5 flash-lite

#     Returns:
#         (text: str|None, error: str|None)
#     """
#     # Определяем mime type
#     ext = ""
#     if filename:
#         ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()

#     mime_map = {
#         "jpg": "image/jpeg",
#         "jpeg": "image/jpeg",
#         "png": "image/png",
#         "webp": "image/webp",
#         "tiff": "image/tiff",
#         "tif": "image/tiff",
#         "pdf": "application/pdf",
#     }
#     mime_type = mime_map.get(ext, "image/jpeg")

#     # ── 1) OpenRouter gemini-3.1-flash-lite (flex) ──
#     try:
#         if logger:
#             logger.info(
#                 "[ENHANCED-OCR] Sending %s (%d bytes, mime=%s) to OpenRouter %s (%s)",
#                 filename or "unknown", len(data), mime_type,
#                 OPENROUTER_OCR_MODEL, OPENROUTER_OCR_PROVIDER,
#             )

#         text = _ask_openrouter_ocr(data, mime_type, filename, logger)

#         if text:
#             if logger:
#                 logger.info(
#                     "[ENHANCED-OCR] OK source=openrouter-%s for %s: %d chars",
#                     OPENROUTER_OCR_MODEL, filename or "unknown", len(text),
#                 )
#             return text, None

#         if logger:
#             logger.warning("[ENHANCED-OCR] OpenRouter returned empty → direct Gemini")
#     except SoftTimeLimitExceeded:
#         raise
#     except Exception as e:
#         if logger:
#             logger.warning("[ENHANCED-OCR] OpenRouter failed: %s → direct Gemini", e)

#     # ── 2-3) direct Gemini: 3.1 flash-lite → 2.5 flash-lite ──
#     try:
#         from google import genai
#         from google.genai import types
#     except ImportError:
#         return None, "google-genai not installed. pip install google-genai"

#     api_key = os.environ.get("GEMINI_API_KEY")
#     if not api_key:
#         return None, "GEMINI_API_KEY not set"

#     try:
#         PRIMARY_MODEL = "gemini-3.1-flash-lite"
#         FALLBACK_MODEL = "gemini-2.5-flash-lite"
#         TIMEOUT_MS = 60_000  # 60 секунд

#         client = genai.Client(
#             api_key=api_key,
#             http_options=types.HttpOptions(timeout=TIMEOUT_MS),
#         )

#         contents = [
#             types.Content(
#                 role="user",
#                 parts=[
#                     types.Part.from_bytes(data=data, mime_type=mime_type),
#                     types.Part.from_text(text=ENHANCED_OCR_PROMPT),
#                 ],
#             )
#         ]

#         text = None
#         used_model = None
#         for model in (PRIMARY_MODEL, FALLBACK_MODEL):
#             try:
#                 if logger:
#                     logger.info(
#                         "[ENHANCED-OCR] Sending %s (%d bytes, mime=%s) to direct %s",
#                         filename or "unknown", len(data), mime_type, model,
#                     )

#                 response = client.models.generate_content(
#                     model=model,
#                     contents=contents,
#                 )

#                 text = (response.text or "").strip()
#                 if text:
#                     used_model = model
#                     break
#                 if logger:
#                     logger.warning("[ENHANCED-OCR] %s returned empty → trying fallback", model)
#             except SoftTimeLimitExceeded:
#                 raise
#             except Exception as e:
#                 if logger:
#                     logger.warning("[ENHANCED-OCR] %s failed: %s → trying fallback", model, e)

#         if not text:
#             return None, "Enhanced OCR: OpenRouter + direct Gemini (3.1, 2.5) all failed"

#         if logger:
#             logger.info(
#                 "[ENHANCED-OCR] OK source=direct-%s for %s: %d chars",
#                 used_model, filename or "unknown", len(text),
#             )

#         return text, None

#     except SoftTimeLimitExceeded:
#         raise
#     except Exception as e:
#         if logger:
#             logger.error("[ENHANCED-OCR] Error for %s: %s", filename or "unknown", e)
#         return None, str(e)

