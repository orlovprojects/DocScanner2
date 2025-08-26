import base64
import logging
import os
from typing import Tuple
from openai import OpenAI

# Инициализация OpenAI клиента
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

gpt_client = OpenAI(api_key=OPENAI_API_KEY)


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


def get_ocr_text_gpt(
    data: bytes,
    filename: str,
    logger: logging.Logger | None = None,
    model: str = "gpt-4.1-mini",  # vision-способный
    prompt: str = """Read the document provided and extract all content from the document line-by-line, left-to-right. For layouts with multi-column, still read lines ignoring columns.""",

#     prompt: str = """Extract ALL visible textual content from the image EXACTLY line-by-line.
# Rules:
# - Output plain text only.
# - Preserve the original reading order: top→bottom; for multi-column layouts read left column first, then right, etc.
# - For tables or grid-like layouts: treat EACH ROW as ONE output line.
#   • Concatenate cells left→right with a single TAB character between cells.
#   • Do NOT add or remove columns; do NOT reorder them.
# - Preserve line breaks as real newlines (LF). Do NOT escape them (no "\\n").
# - Keep original characters, accents, punctuation, currency symbols, and decimal separators (do NOT translate or normalize).
# - Keep case as in the image. Normalize only spacing inside a cell to single spaces.
# - If a word is hyphenated at the end of a line, join it without the hyphen (e.g., "pa-" + "vardė" → "pavardė").
# - Ignore non-text graphics (lines, boxes) and watermarks.
# - If a page break is present, insert a line: === PAGE BREAK ===

# Return ONLY the extracted text. No explanations.""",
) -> Tuple[str | None, str | None]:
    """
    OCR через GPT-4.1-mini (vision).
    Возвращает (text, error_message). При успехе: (text, None)
    """
    log = logger or logging.getLogger("celery")

    try:
        mime = _guess_mime(filename)
        b64 = base64.b64encode(data).decode("utf-8")

        resp = gpt_client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{b64}"
                            },
                        },
                    ],
                }
            ],
            temperature=0.0,  # лучше 0.0 для OCR (максимально детерминированный вывод)
            max_tokens=16000,
        )

        text = (resp.choices[0].message.content or "").strip()
        if not text:
            log.warning("[OCR GPT] Empty text for %s", filename)
            return None, "GPT OCR returned empty text"

        return text, None

    except Exception as e:
        log.exception("[OCR GPT] Error for %s", filename)
        return None, f"OCR (GPT) error: {e}"