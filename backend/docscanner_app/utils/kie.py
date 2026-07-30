import os
import json
import time
import logging
import requests
from dotenv import load_dotenv

from ..celery_signals import _send_telegram
from . import gemini as direct_gemini
from .gemini import (
    GEMINI_DEFAULT_PROMPT,
    GEMINI_DETAILED_PROMPT,
    GEMINI_TRUNCATED_TO_FULL_PROMPT,
    is_truncated_json,
    build_repair_prompt,
    build_truncated_followup_prompt,
)

load_dotenv()

LOGGER = logging.getLogger("docscanner_app")

KIE_API_KEY = os.getenv("KIE_API_KEY", "").strip().strip('"').strip("'")
if KIE_API_KEY.lower().startswith("bearer "):
    KIE_API_KEY = KIE_API_KEY[7:].strip()

KIE_GEMINI_FLASH_URL = "https://api.kie.ai/gemini-2.5-flash/v1/chat/completions"
KIE_GEMINI_3_FLASH_URL = "https://api.kie.ai/gemini-3-flash/v1/chat/completions"
KIE_GEMINI_35_FLASH_URL = "https://api.kie.ai/gemini-3-5-flash-openai/v1/chat/completions"
KIE_GEMINI_31_PRO_URL = "https://api.kie.ai/gemini-3.1-pro/v1/chat/completions"



KIE_TIMEOUT_SECONDS = float(os.getenv("KIE_TIMEOUT_SECONDS", "300"))

LLM_PRIMARY = os.getenv("LLM_PRIMARY", "kie").strip().lower()
LLM_DIRECT_GEMINI_FALLBACK = os.getenv("LLM_DIRECT_GEMINI_FALLBACK", "1").strip().lower() in ("1", "true", "yes", "on")
KIE_ERROR_TELEGRAM = os.getenv("KIE_ERROR_TELEGRAM", "1").strip().lower() in ("1", "true", "yes", "on")

DIRECT_GEMINI_MAIN_MODEL = os.getenv("DIRECT_GEMINI_MAIN_MODEL", "gemini-2.5-flash").strip()
DIRECT_GEMINI_LITE_MODEL = os.getenv("DIRECT_GEMINI_LITE_MODEL", "gemini-3.1-flash-lite").strip()

KIE_RETRY_CODES = {408, 429, 455, 500, 501}
KIE_NO_RETRY_CODES = {400, 401, 402, 404, 422, 433, 505}


class KieAPIError(Exception):
    def __init__(self, message, code=None, status_code=None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code

def _direct_gemini_model_name(requested_model: str) -> str:
    model = (requested_model or "").strip()

    if "flash-lite" in model or model in ("gemini-flash-lite-latest", "gemini-3.1-flash-lite-preview"):
        return DIRECT_GEMINI_LITE_MODEL

    if model in ("gemini-2.5-flash", "gemini-2.5-pro"):
        return model

    if not model:
        return DIRECT_GEMINI_MAIN_MODEL

    return model

def _kie_headers() -> dict:
    if not KIE_API_KEY:
        raise RuntimeError("KIE_API_KEY not set in .env")

    return {
        "Authorization": f"Bearer {KIE_API_KEY}",
        "Content-Type": "application/json",
    }


def _extract_content_from_kie_response(data: dict) -> str:
    choices = data.get("choices")

    if not choices and isinstance(data.get("data"), dict):
        choices = data["data"].get("choices")

    if choices and isinstance(choices, list):
        first = choices[0] or {}

        message = first.get("message") or {}
        if isinstance(message, dict):
            content = message.get("content")

            if isinstance(content, str):
                return content.strip()

            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict):
                        if item.get("type") == "text" and item.get("text"):
                            parts.append(str(item["text"]))
                        elif item.get("text"):
                            parts.append(str(item["text"]))
                    elif isinstance(item, str):
                        parts.append(item)
                return "".join(parts).strip()

        if isinstance(first.get("text"), str):
            return first["text"].strip()

        delta = first.get("delta") or {}
        if isinstance(delta, dict) and isinstance(delta.get("content"), str):
            return delta["content"].strip()

    data_obj = data.get("data")
    if isinstance(data_obj, dict):
        for key in ("content", "text", "response", "result"):
            if isinstance(data_obj.get(key), str):
                return data_obj[key].strip()

        message = data_obj.get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return message["content"].strip()

    for key in ("content", "text", "response", "result"):
        if isinstance(data.get(key), str):
            return data[key].strip()

    raise KieAPIError(f"KIE returned no readable content: {str(data)[:1000]}")


def _raise_if_kie_error(data: dict, status_code: int):
    code = data.get("code")

    if code is None:
        return

    code_str = str(code)

    if code_str in ("200", "0"):
        return

    msg = data.get("msg") or data.get("message") or str(data)
    try:
        code_int = int(code)
    except Exception:
        code_int = None

    raise KieAPIError(
        f"KIE API error code={code_str}: {msg}",
        code=code_int,
        status_code=status_code,
    )


def ask_kie(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int | None = None,
    endpoint_url: str | None = None,
    logger: logging.Logger | None = None,
) -> str:
    """
    Один запрос к KIE Gemini OpenAI-compatible endpoint.
    """
    log = logger or LOGGER

    full_prompt = prompt + "\n\n" + text
    eff_timeout = timeout_seconds if timeout_seconds is not None else KIE_TIMEOUT_SECONDS
    eff_url = endpoint_url or KIE_GEMINI_FLASH_URL

    log.info(
        "[KIE Gemini] Request start endpoint=%s requested_model=%s len_text=%d len_prompt=%d total_len=%d timeout=%ss",
        eff_url.split("/api.kie.ai/")[-1].split("/v1")[0] if "api.kie.ai" in eff_url else eff_url,
        model,
        len(text or ""),
        len(prompt or ""),
        len(full_prompt or ""),
        eff_timeout,
    )

    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": full_prompt,
                    }
                ],
            }
        ],
        "stream": False,
        "include_thoughts": False,
        "temperature": temperature,
        "max_tokens": max_output_tokens,
    }

    t0 = time.perf_counter()

    try:
        resp = requests.post(
            eff_url,
            headers=_kie_headers(),
            json=payload,
            timeout=float(eff_timeout),
        )
    except requests.exceptions.Timeout as e:
        raise KieAPIError(f"KIE request timed out after {eff_timeout}s") from e
    except requests.exceptions.ConnectionError as e:
        raise KieAPIError("KIE connection error") from e

    elapsed = time.perf_counter() - t0

    try:
        data = resp.json()
    except Exception:
        resp.raise_for_status()
        raise KieAPIError(f"KIE returned non-JSON response: {resp.text[:1000]}")

    if resp.status_code >= 400:
        msg = data.get("msg") or data.get("message") or str(data)
        raise KieAPIError(
            f"KIE HTTP {resp.status_code}: {msg}",
            status_code=resp.status_code,
        )

    _raise_if_kie_error(data, resp.status_code)

    result = _extract_content_from_kie_response(data)
    preview = result[:500].replace("\n", " ")

    log.info(
        "[KIE Gemini] OK len=%d elapsed=%.2fs preview=%r",
        len(result),
        elapsed,
        preview,
    )

    return result


CATALOG_MATCHING_PROMPT = """
You match invoice line items to products from the user's product catalog.

The input contains:

1. "catalog":
   Products available for matching.
   Each product contains:
   - prekes_kodas
   - prekes_pavadinimas
   - optional prekes_barkodas
   - optional unit

2. "line_items":
   Invoice line items that must be matched.
   Each line contains:
   - line_item_id
   - prekes_pavadinimas
   - prekes_kodas
   - optional prekes_barkodas
   - unit

Rules:

1. Return exactly one result for every line_item_id from line_items.

2. prekes_kodas in the response must be:
   - an exact prekes_kodas value from catalog
   - or the exact string "UKN0" when absolutely no match exists

3. Never invent, modify, translate, shorten or normalize a catalog code.

4. Preserve leading zeroes in codes.
   Example: return "000409", never 409 or "409".

5. Matching priority:
   a) exact barcode match
   b) exact or clearly corresponding product code
   c) semantic product-name match (see rule 9)
   d) compatible unit (see rule 7)

6. The product code on an invoice can be the supplier's internal code,
   so it may be different from the user's catalog code.

7. Unit differences alone are NOT a reason to skip a match.
   Invoice units (vnt, pak, dėž) often differ from catalog units (kg, l).
   A package of 50 g sold as "vnt" can match a catalog product stored in "kg".
   Only reject on unit mismatch when the product categories are clearly different.

8. Prefer the actual raw product category when the invoice describes
   purchased food, materials or ingredients.

9. ALWAYS pick the closest matching catalog product. Be aggressive:
   - Partial name overlap is enough. "Ridikėlių (Daikon) daigai" matches
     "Ridikėliai" because the root product is the same.
   - Variants, sizes, flavors, and packaging differences are NOT reasons
     to return UKN0. Match to the base product.
   - Synonyms and related forms count: "Ridikas baltas" and "Ridikėliai"
     are the same vegetable family.
   - When multiple catalog products are plausible, pick the one whose name
     shares the most words or the closest semantic meaning with the invoice
     line item. Do NOT return UKN0 just because there are several options.

10. Return "UKN0" ONLY when there is genuinely no catalog product that
    could reasonably correspond to the invoice line item — not even
    partially or by category. UKN0 is a last resort, not a safe default.

11. Do not return explanations, confidence scores, product names,
    markdown or any additional text.

Return only valid JSON in this exact structure:

{
  "matches": [
    {
      "line_item_id": 123,
      "prekes_kodas": "000409"
    },
    {
      "line_item_id": 124,
      "prekes_kodas": "UKN0"
    }
  ]
}
""".strip()


def ask_catalog_matching_kie(
    *,
    catalog: list[dict],
    line_items: list[dict],
    logger: logging.Logger | None = None,
) -> str:
    """
    Catalog matching: KIE 2.5 Flash (3 попытки) → direct Gemini 3.1 Flash Lite.
    """
    log = logger or LOGGER

    request_data = {
        "catalog": catalog,
        "line_items": line_items,
    }

    request_text = json.dumps(
        request_data,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    max_output_tokens = min(
        12000,
        max(2000, len(line_items) * 80),
    )

    log.info(
        "[CATALOG MATCH] Request: catalog=%d line_items=%d input_chars=%d",
        len(catalog),
        len(line_items),
        len(request_text),
    )

    # 1) KIE Gemini 2.5 Flash — 3 попытки
    last_kie_err = None
    for attempt in range(1, 4):
        try:
            log.info("[CATALOG MATCH] KIE attempt %d/3", attempt)
            result = ask_kie(
                text=request_text,
                prompt=CATALOG_MATCHING_PROMPT,
                model="gemini-2.5-flash",
                temperature=0.0,
                max_output_tokens=max_output_tokens,
                timeout_seconds=90,
                endpoint_url=KIE_GEMINI_FLASH_URL,
                logger=log,
            )
            if result and result.strip():
                return result
            log.warning("[CATALOG MATCH] KIE attempt %d returned empty", attempt)
        except Exception as e:
            last_kie_err = e
            log.warning("[CATALOG MATCH] KIE attempt %d failed: %s", attempt, e)

        if attempt < 3:
            time.sleep(3)

    log.warning(
        "[CATALOG MATCH] KIE exhausted 3 attempts (last_err=%s) → direct Gemini fallback",
        last_kie_err,
    )

    # 2) Direct Gemini 3.1 Flash Lite fallback
    try:
        result = direct_gemini.ask_gemini_with_retry(
            text=request_text,
            prompt=CATALOG_MATCHING_PROMPT,
            model="gemini-3.1-flash-lite",
            max_retries=0,
            wait_seconds=0,
            temperature=0.0,
            max_output_tokens=max_output_tokens,
            timeout_seconds=90,
            logger=log,
        )
        if result and result.strip():
            log.info("[CATALOG MATCH] Direct Gemini fallback OK len=%d", len(result))
            return result
        log.warning("[CATALOG MATCH] Direct Gemini fallback also empty")
    except Exception as e:
        log.warning("[CATALOG MATCH] Direct Gemini fallback failed: %s", e)

    raise ValueError("Catalog matching: KIE (3 attempts) and direct Gemini both failed")


def ask_kie_with_retry(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    max_retries: int = 2,
    wait_seconds: int = 3,
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int = 90,
    slow_error_threshold: float = 30,
    logger: logging.Logger | None = None,
) -> str:
    """
    slow_error_threshold: если ошибка пришла дольше чем за N секунд,
    не ретраим — сразу выбрасываем для перехода на fallback.

    Стратегия:
    - attempt 0..max_retries-1: KIE gemini-2.5-flash
    - attempt max_retries (последний): KIE gemini-3-flash
    """
    log = logger or LOGGER
    last_exc = None

    for attempt in range(max_retries + 1):
        is_last_attempt = attempt == max_retries
        eff_endpoint = KIE_GEMINI_3_FLASH_URL if is_last_attempt else KIE_GEMINI_FLASH_URL
        eff_model_label = "gemini-3-flash" if is_last_attempt else model

        log.info(
            "[KIE Gemini] Attempt %d/%d endpoint=%s timeout=%ss",
            attempt + 1,
            max_retries + 1,
            eff_model_label,
            timeout_seconds,
        )

        t_attempt = time.perf_counter()

        try:
            result = ask_kie(
                text=text,
                prompt=prompt,
                model=eff_model_label,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                timeout_seconds=timeout_seconds,
                endpoint_url=eff_endpoint,
                logger=log,
            )

            elapsed_attempt = time.perf_counter() - t_attempt
            log.info("[KIE Gemini] Attempt %d succeeded in %.2fs (endpoint=%s)", attempt + 1, elapsed_attempt, eff_model_label)

            return result

        except KieAPIError as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            last_exc = e

            code = getattr(e, "code", None)
            status_code = getattr(e, "status_code", None)

            log.warning(
                "[KIE Gemini] Error attempt=%d/%d endpoint=%s elapsed=%.2fs code=%s http=%s err=%s",
                attempt + 1,
                max_retries + 1,
                eff_model_label,
                elapsed_attempt,
                code,
                status_code,
                e,
                exc_info=True,
            )

            if attempt >= 1:
                _notify_kie_api_error(e, eff_model_label, log, attempt=attempt + 1)

            if elapsed_attempt > slow_error_threshold:
                log.warning(
                    "[KIE Gemini] Slow error (%.1fs > %ds), skip retries → fallback",
                    elapsed_attempt, slow_error_threshold,
                )
                break

            retryable = (
                code in KIE_RETRY_CODES
                or status_code in (408, 429, 500, 502, 503, 504)
                or "timed out" in str(e).lower()
                or "connection error" in str(e).lower()
            )

            non_retryable = code in KIE_NO_RETRY_CODES or status_code in (400, 401, 402, 403, 404, 422)

            if retryable and not non_retryable and attempt < max_retries:
                time.sleep(wait_seconds)
                continue

            break

        except Exception as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            last_exc = e

            if elapsed_attempt > slow_error_threshold:
                log.warning(
                    "[KIE Gemini] Slow error (%.1fs > %ds), skip retries → fallback",
                    elapsed_attempt, slow_error_threshold,
                )
                break

            msg = str(e).lower()
            retryable = (
                "rate limit" in msg
                or "429" in msg
                or "timeout" in msg
                or "temporarily" in msg
                or "connection" in msg
            )

            log.warning(
                "[KIE Gemini] Unexpected error attempt=%d/%d endpoint=%s elapsed=%.2fs retryable=%s err=%s",
                attempt + 1,
                max_retries + 1,
                eff_model_label,
                elapsed_attempt,
                retryable,
                e,
                exc_info=True,
            )

            if retryable and attempt < max_retries:
                time.sleep(wait_seconds)
                continue

            break

    log.error("[KIE Gemini] Exhausted retries. Raising last exception: %r", last_exc)

    if KIE_ERROR_TELEGRAM:
        try:
            _send_telegram(
                f"🚨 <b>KIE Gemini: все retry исчерпаны</b>\n"
                f"<b>Endpoint:</b> <code>gemini-2.5-flash → gemini-3-flash</code>\n"
                f"<b>Requested model:</b> <code>{model}</code>\n"
                f"<b>Attempts:</b> {max_retries + 1}\n"
                f"<b>Last error:</b> {str(last_exc)[:300]}",
                dedup_key="kie_gemini_retries_exhausted",
                dedup_ttl=600,
            )
        except Exception:
            pass

    raise last_exc


def ask_llm_provider_with_retry(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    max_retries: int = 2,
    wait_seconds: int = 60,
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int = 300,
    logger: logging.Logger | None = None,
) -> tuple[str, str]:
    """
    Unified LLM route:
    1. KIE Gemini
    2. Direct Gemini fallback
    Returns: (response_text, source_model)
    """
    log = logger or LOGGER
    last_exc = None

    if LLM_PRIMARY == "kie":
        try:
            result = ask_kie_with_retry(
                text=text,
                prompt=prompt,
                model=model,
                max_retries=max_retries,
                wait_seconds=wait_seconds,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                timeout_seconds=timeout_seconds,
                logger=log,
            )
            return result, "kie-gemini"
        except Exception as e:
            last_exc = e
            log.warning("[LLM] KIE failed, will try direct Gemini fallback: %s", e, exc_info=True)

    if LLM_DIRECT_GEMINI_FALLBACK:
        direct_model = _direct_gemini_model_name(model)

        try:
            result = direct_gemini.ask_gemini_with_retry(
                text=text,
                prompt=prompt,
                model=direct_model,
                max_retries=0,
                wait_seconds=0,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                timeout_seconds=timeout_seconds,
                logger=log,
            )
            return result, f"direct-{direct_model}"
        except Exception as e:
            log.warning("[LLM] Direct Gemini fallback failed: %s", e, exc_info=True)
            last_exc = e

    raise last_exc or RuntimeError("No LLM provider succeeded")


def _notify_kie_api_error(exc: Exception, model: str, log, *, attempt: int | None = None) -> None:
    if not KIE_ERROR_TELEGRAM:
        return

    code = getattr(exc, "code", None)
    status_code = getattr(exc, "status_code", None)

    try:
        _send_telegram(
            f"🚨 <b>KIE API error</b>\n"
            f"<b>Endpoint:</b> <code>{model}</code>\n"
            f"<b>Requested model:</b> <code>{model}</code>\n"
            f"<b>Attempt:</b> {attempt if attempt is not None else '-'}\n"
            f"<b>Code:</b> <code>{code}</code>\n"
            f"<b>HTTP:</b> <code>{status_code}</code>\n"
            f"<b>Error:</b> {str(exc)[:500]}\n\n"
            f"Fallback to direct Gemini will be attempted if enabled.",
            dedup_key=f"kie_api_error_{code}_{status_code}",
            dedup_ttl=120,
        )
    except Exception as tg_err:
        log.warning("[KIE Gemini] Failed to send Telegram notification: %s", tg_err)


def ask_llm_with_fallback(text: str, scan_type: str, user=None, logger: logging.Logger | None = None):

    """
    Primary: KIE Gemini.
    Fallback: direct Gemini.
    GPT fallback остается в process_uploaded_file_task.
    """
    log = logger or LOGGER
    prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT

    # ── Ilgalaikis turtas: подставляем порог ──
    ilt_min = str(int(user.min_ilgalaikis_turtas_amount)) if user and hasattr(user, "min_ilgalaikis_turtas_amount") else "500"
    prompt = prompt.replace("{long_term_asset_min_value}", ilt_min)

    log.info("[LLM] Try primary provider=%s model=gemini-2.5-flash", LLM_PRIMARY)

    result, source_model = ask_llm_provider_with_retry(
        text=text,
        prompt=prompt,
        model=DIRECT_GEMINI_MAIN_MODEL,
        max_retries=2,
        wait_seconds=3,
        temperature=1.0,
        max_output_tokens=30000 if scan_type == "detaliai" else 20000,
        timeout_seconds=180 if scan_type == "detaliai" else 90,
        logger=log,
    )

    log.info("[LLM] OK source=%s len=%d preview=%r", source_model, len(result), result[:200].replace("\n", " "))
    return result, source_model


def repair_truncated_json_with_gemini_lite(*, broken_json, glued_raw_text, logger=None):
    """
    Drop-in replacement. Сначала KIE, fallback на direct Gemini.
    """
    new_retry_prompt = (
        "Second attempt. In the previous response, you tried to extract structured data from the OCR text "
        "of a financial document (invoice, receipt, or similar), but the JSON you returned was truncated. "
        "I'm now providing you with the same OCR text together with your truncated JSON and updated instructions. "
        "Your task is to carefully finish, extract missing data and repair the JSON without altering any information that was already extracted."
    )

    prompt, text = build_repair_prompt(new_retry_prompt, glued_raw_text, broken_json)

    return direct_gemini.ask_gemini_lite_with_model_fallback(
        text=text,
        prompt=prompt,
        primary_model="gemini-2.5-flash-lite",
        fallback_model="gemini-3.1-flash-lite",
        temperature=0.0,
        max_output_tokens=20000,
        timeout_seconds=60,
        logger=logger,
    )


def request_full_json_with_gemini_lite(
    *,
    glued_raw_text: str,
    previous_json: str,
    logger: logging.Logger | None = None,
) -> str:
    """
    Drop-in replacement. Сначала KIE, fallback на direct Gemini.
    """
    prompt, text = build_truncated_followup_prompt(glued_raw_text, previous_json)

    return direct_gemini.ask_gemini_lite_with_model_fallback(
        text=text,
        prompt=prompt,
        primary_model="gemini-2.5-flash-lite",
        fallback_model="gemini-3.1-flash-lite",
        temperature=0.2,
        max_output_tokens=30000,
        timeout_seconds=90,
        logger=logger,
    )


# Backward-compatible aliases.
# Можно импортировать эти имена вместо старых Gemini-функций.
def ask_gemini(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int | None = None,
    logger: logging.Logger | None = None,
) -> str:
    result, _source = ask_llm_provider_with_retry(
        text=text,
        prompt=prompt,
        model=model,
        max_retries=0,
        wait_seconds=0,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        timeout_seconds=timeout_seconds or 90,
        logger=logger,
    )
    return result


def ask_gemini_with_retry(
    text: str,
    prompt: str,
    model: str = "gemini-3.1-flash-lite",
    max_retries: int = 2,
    wait_seconds: int = 10,
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int = 90,
    logger: logging.Logger | None = None,
) -> str:
    result, _source = ask_llm_provider_with_retry(
        text=text,
        prompt=prompt,
        model=model,
        max_retries=max_retries,
        wait_seconds=wait_seconds,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        timeout_seconds=timeout_seconds,
        logger=logger,
    )
    return result