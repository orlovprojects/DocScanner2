# utils/mercury.py
import os
import time
import logging
from openai import OpenAI, RateLimitError, APITimeoutError

logger = logging.getLogger("docscanner_app")

MERCURY_API_KEY = os.getenv("INCEPTION_API_KEY", "")
MERCURY_BASE_URL = "https://api.inceptionlabs.ai/v1"

_mercury_client = None


def _get_client():
    global _mercury_client
    if _mercury_client is None:
        _mercury_client = OpenAI(
            api_key=MERCURY_API_KEY,
            base_url=MERCURY_BASE_URL,
            timeout=300,
        )
    return _mercury_client


def ask_mercury(
    text: str,
    prompt: str,
    model: str = "mercury-2",
    temperature: float = 0.6,
    max_tokens: int = 30000,
    reasoning_effort: str = "low",
    logger_override=None,
) -> str:
    log = logger_override or logger

    combined = prompt + "\n\n" + text

    log.info(
        "[Mercury] Request start model=%s len_text=%d len_prompt=%d total_len=%d temp=%.2f reasoning=%s",
        model, len(text), len(prompt), len(combined), temperature, reasoning_effort,
    )

    t0 = time.perf_counter()
    client = _get_client()

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "user", "content": combined},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
        extra_body={
            "reasoning_effort": reasoning_effort,
            "reasoning_summary": False,
        },
    )
    elapsed = time.perf_counter() - t0

    result = (response.choices[0].message.content or "").strip()
    preview = result[:500].replace("\n", " ")
    log.info(
        "[Mercury] OK model=%s len=%d elapsed=%.2fs preview=%r",
        model, len(result), elapsed, preview,
    )
    return result


def ask_mercury_with_retry(
    text: str,
    prompt: str,
    model: str = "mercury-2",
    max_retries: int = 2,
    wait_seconds: int = 15,     
    temperature: float = 0.6,
    max_tokens: int = 30000,
    reasoning_effort: str = "low",
    logger=None,
) -> str:
    log = logger or globals()["logger"]
    last_exc = None

    for attempt in range(max_retries + 1):
        log.info(
            "[Mercury] Attempt %d/%d model=%s reasoning=%s",
            attempt + 1, max_retries + 1, model, reasoning_effort,
        )
        t0 = time.perf_counter()
        try:
            result = ask_mercury(
                text=text,
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                reasoning_effort=reasoning_effort,
                logger_override=log,
            )
            elapsed = time.perf_counter() - t0
            log.info("[Mercury] Attempt %d succeeded in %.2fs", attempt + 1, elapsed)
            return result

        except (RateLimitError, APITimeoutError) as e:
            elapsed = time.perf_counter() - t0
            log.warning(
                "[Mercury] %s attempt=%d/%d elapsed=%.2fs wait=%ds",
                e.__class__.__name__, attempt + 1, max_retries + 1, elapsed, wait_seconds,
            )
            last_exc = e
            if attempt < max_retries:
                time.sleep(wait_seconds)
                continue
            break

        except Exception as e:
            elapsed = time.perf_counter() - t0
            msg = str(e).lower()
            if "rate limit" in msg or "429" in msg or "too many requests" in msg:
                log.warning("[Mercury] Probable rate limit: %s, waiting %ds", e, wait_seconds)
                last_exc = e
                if attempt < max_retries:
                    time.sleep(wait_seconds)
                    continue
                break
            else:
                log.exception("[Mercury] Unexpected error after %.2fs", elapsed)
                raise

    log.error("[Mercury] Exhausted retries. Raising: %r", last_exc)
    raise last_exc