import os
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
    logger: logging.Logger | None = None,
) -> str:
    """
    Один запрос к KIE Gemini 2.5 Flash OpenAI-compatible endpoint.

    model оставлен для совместимости со старым ask_gemini().
    KIE модель выбирается endpoint-ом: /gemini-2.5-flash/v1/chat/completions
    """
    log = logger or LOGGER

    full_prompt = prompt + "\n\n" + text
    eff_timeout = timeout_seconds if timeout_seconds is not None else KIE_TIMEOUT_SECONDS

    log.info(
        "[KIE Gemini] Request start endpoint=gemini-2.5-flash requested_model=%s len_text=%d len_prompt=%d total_len=%d timeout=%ss",
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
            KIE_GEMINI_FLASH_URL,
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


def ask_kie_with_retry(
    text: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    max_retries: int = 2,
    wait_seconds: int = 60,
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int = 300,
    logger: logging.Logger | None = None,
) -> str:
    log = logger or LOGGER
    last_exc = None

    for attempt in range(max_retries + 1):
        log.info(
            "[KIE Gemini] Attempt %d/%d requested_model=%s timeout=%ss",
            attempt + 1,
            max_retries + 1,
            model,
            timeout_seconds,
        )

        t_attempt = time.perf_counter()

        try:
            result = ask_kie(
                text=text,
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                timeout_seconds=timeout_seconds,
                logger=log,
            )

            elapsed_attempt = time.perf_counter() - t_attempt
            log.info("[KIE Gemini] Attempt %d succeeded in %.2fs", attempt + 1, elapsed_attempt)

            return result

        except KieAPIError as e:
            elapsed_attempt = time.perf_counter() - t_attempt
            last_exc = e

            code = getattr(e, "code", None)
            status_code = getattr(e, "status_code", None)

            log.warning(
                "[KIE Gemini] Error attempt=%d/%d elapsed=%.2fs code=%s http=%s err=%s",
                attempt + 1,
                max_retries + 1,
                elapsed_attempt,
                code,
                status_code,
                e,
                exc_info=True,
            )

            _notify_kie_api_error(e, model, log, attempt=attempt + 1)

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

            msg = str(e).lower()
            retryable = (
                "rate limit" in msg
                or "429" in msg
                or "timeout" in msg
                or "temporarily" in msg
                or "connection" in msg
            )

            log.warning(
                "[KIE Gemini] Unexpected error attempt=%d/%d elapsed=%.2fs retryable=%s err=%s",
                attempt + 1,
                max_retries + 1,
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

    try:
        _send_telegram(
            f"🚨 <b>KIE Gemini: все retry исчерпаны</b>\n"
            f"<b>Endpoint:</b> <code>gemini-2.5-flash</code>\n"
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
            return result, "kie-gemini-2.5-flash"
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
                max_retries=max_retries,
                wait_seconds=wait_seconds,
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
            f"<b>Endpoint:</b> <code>gemini-2.5-flash</code>\n"
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


def ask_llm_with_fallback(text: str, scan_type: str, logger: logging.Logger | None = None):
    """
    Primary: KIE Gemini.
    Fallback: direct Gemini.
    GPT fallback остается в process_uploaded_file_task.
    """
    log = logger or LOGGER
    prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT

    log.info("[LLM] Try primary provider=%s model=gemini-2.5-flash", LLM_PRIMARY)

    result, source_model = ask_llm_provider_with_retry(
        text=text,
        prompt=prompt,
        model=DIRECT_GEMINI_MAIN_MODEL,
        max_retries=2,
        wait_seconds=60,
        temperature=1.0,
        max_output_tokens=30000 if scan_type == "detaliai" else 20000,
        timeout_seconds=300,
        logger=log,
    )

    log.info("[LLM] OK source=%s len=%d preview=%r", source_model, len(result), result[:200].replace("\n", " "))
    return result, source_model


def repair_truncated_json_with_gemini_lite(*, broken_json: str, glued_raw_text: str, logger=None) -> str:
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

    return ask_gemini_with_retry(
        text=text,
        prompt=prompt,
        model=DIRECT_GEMINI_LITE_MODEL,
        temperature=0.0,
        max_output_tokens=30000,
        timeout_seconds=300,
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

    return ask_gemini_with_retry(
        text=text,
        prompt=prompt,
        model=DIRECT_GEMINI_LITE_MODEL,
        temperature=0.2,
        max_output_tokens=30000,
        timeout_seconds=300,
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
        timeout_seconds=timeout_seconds or 300,
        logger=logger,
    )
    return result


def ask_gemini_with_retry(
    text: str,
    prompt: str,
    model: str = "gemini-3.1-flash-lite",
    max_retries: int = 2,
    wait_seconds: int = 60,
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    timeout_seconds: float | int = 300,
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