# utils/novita.py
import os
import time
import logging
from openai import OpenAI, RateLimitError, APITimeoutError

logger = logging.getLogger("docscanner_app")

NOVITA_API_KEY = os.getenv("NOVITA_API_KEY", "")

_novita_client = None

def _get_client():
    global _novita_client
    if _novita_client is None:
        _novita_client = OpenAI(
            api_key=NOVITA_API_KEY,
            base_url="https://api.novita.ai/openai",
            timeout=300,
        )
    return _novita_client


def ask_novita(
    text: str,
    prompt: str,
    model: str = "openai/gpt-oss-120b",
    temperature: float = 0.1,
    max_tokens: int = 16000,
    reasoning: str = "high",  # low / medium / high
    logger_override=None,
) -> str:
    log = logger_override or logger

    log.info(
        "[Novita] Request start model=%s len_text=%d len_prompt=%d temp=%.2f reasoning=%s",
        model, len(text), len(prompt), temperature, reasoning,
    )

    t0 = time.perf_counter()
    client = _get_client()

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": f"Reasoning: {reasoning}"},
            {"role": "user", "content": prompt + "\n\n" + text},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
    )
    elapsed = time.perf_counter() - t0

    usage = getattr(response, 'usage', None)
    if usage:
        log.info(
            "[Novita] Usage: prompt=%s completion=%s total=%s",
            getattr(usage, 'prompt_tokens', '?'),
            getattr(usage, 'completion_tokens', '?'),
            getattr(usage, 'total_tokens', '?'),
        )

    result = (response.choices[0].message.content or "").strip()
    preview = result[:500].replace("\n", " ")
    log.info("[Novita] OK model=%s len=%d elapsed=%.2fs preview=%r",
             model, len(result), elapsed, preview)
    return result


def ask_novita_with_retry(
    text: str,
    prompt: str,
    model: str = "openai/gpt-oss-120b",
    max_retries: int = 2,
    wait_seconds: int = 15,
    temperature: float = 0.1,
    max_tokens: int = 16000,
    reasoning: str = "high",
    logger=None,
) -> str:
    log = logger or globals()["logger"]
    last_exc = None

    for attempt in range(max_retries + 1):
        log.info("[Novita] Attempt %d/%d model=%s", attempt + 1, max_retries + 1, model)
        t0 = time.perf_counter()
        try:
            result = ask_novita(
                text=text, prompt=prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
                reasoning=reasoning,
                logger_override=log,
            )
            elapsed = time.perf_counter() - t0
            log.info("[Novita] Attempt %d succeeded in %.2fs", attempt + 1, elapsed)
            return result

        except (RateLimitError, APITimeoutError) as e:
            elapsed = time.perf_counter() - t0
            log.warning("[Novita] %s attempt=%d/%d elapsed=%.2fs wait=%ds",
                        e.__class__.__name__, attempt + 1, max_retries + 1, elapsed, wait_seconds)
            last_exc = e
            if attempt < max_retries:
                time.sleep(wait_seconds)
                continue
            break

        except Exception as e:
            elapsed = time.perf_counter() - t0
            msg = str(e).lower()
            if "rate limit" in msg or "429" in msg:
                log.warning("[Novita] Probable rate limit: %s", e)
                last_exc = e
                if attempt < max_retries:
                    time.sleep(wait_seconds)
                    continue
                break
            else:
                log.exception("[Novita] Unexpected error after %.2fs", elapsed)
                raise

    log.error("[Novita] Exhausted retries. Raising: %r", last_exc)
    raise last_exc