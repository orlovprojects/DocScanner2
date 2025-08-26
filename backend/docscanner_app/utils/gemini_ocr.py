import base64
import logging
import os
from typing import Tuple
from dotenv import load_dotenv
from google import genai

load_dotenv()

# Попытка использовать общий клиент, если он уже настроен в проекте.
# Если импорта нет — создадим локальный.
try:
    from .gemini import gemini_client as _shared_gemini_client  # общий клиент проекта
    gemini_client = _shared_gemini_client
except Exception:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        raise RuntimeError("Не найден GEMINI_API_KEY в переменных окружения.")
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

def _guess_mime(filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".jpg") or name.endswith(".jpeg"):
        return "image/jpeg"
    if name.endswith(".webp"):
        return "image/webp"
    if name.endswith(".pdf"):
        return "application/pdf"
    return "application/octet-stream"

def get_ocr_text_gemini(
    data: bytes,
    filename: str,
    logger: logging.Logger | None = None,
    model: str = "gemini-2.5-flash",  # vision-способный
    temperature: float = 1.0,
    max_output_tokens: int = 20000,
    prompt: str = """Extract ALL visible textual content from the image EXACTLY line-by-line.
        Rules:
        - Output plain text only.
        - Preserve the original reading order: top→bottom; for multi-column layouts read left column first, then right, etc.
        - For tables or grid-like layouts: treat EACH ROW as ONE output line.
        • Concatenate cells left→right with a single TAB character between cells.
        • Do NOT add or remove columns; do NOT reorder them.
        - Preserve line breaks as real newlines (LF). Do NOT escape them (no "\\n").
        - Keep original characters, accents, punctuation, currency symbols, and decimal separators (do NOT translate or normalize).
        - Keep case as in the image. Normalize only spacing inside a cell to single spaces.
        - If a word is hyphenated at the end of a line, join it without the hyphen (e.g., "pa-" + "vardė" → "pavardė").
        - Ignore non-text graphics (lines, boxes) and watermarks.
        - If a page break is present, insert a line: === PAGE BREAK ===

        Return ONLY the extracted text. No explanations.""",

) -> Tuple[str | None, str | None]:
    """
    OCR через Gemini 2.0 Flash (vision).
    Возвращает (text, error_message). При успехе: (text, None)
    """
    log = logger or logging.getLogger("celery")

    try:
        b64 = base64.b64encode(data).decode("utf-8")
        mime = _guess_mime(filename)

        resp = gemini_client.models.generate_content(
            model=model,
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime,
                                "data": b64,
                            }
                        },
                    ],
                }
            ],
            config={
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
            },
        )

        text = (getattr(resp, "text", "") or "").strip()
        if not text:
            log.warning("[OCR Gemini] Empty text for %s", filename)
            return None, "Gemini vision returned empty text"

        return text, None

    except Exception as e:
        log.exception("[OCR Gemini] Error for %s", filename)
        return None, f"OCR (Gemini) error: {e}"