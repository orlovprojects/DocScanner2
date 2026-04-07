"""
enhanced_ocr.py — Enhanced OCR через Gemini для документов с плохой геометрией или сложными таблицами.
"""
import base64
import logging

logger = logging.getLogger("docscanner_app")

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


def get_enhanced_ocr_text(data: bytes, filename: str = None, logger=None) -> tuple:
    """
    Enhanced OCR через Gemini Flash Lite — для документов с плохой геометрией
    или сложными таблицами (высокий line_collision_ratio).

    Args:
        data: байты файла (PNG/JPEG после нормализации)
        filename: имя файла для определения mime type
        logger: логгер

    Returns:
        (text: str|None, error: str|None)
    """
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return None, "google-genai not installed. pip install google-genai"

    import os
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None, "GEMINI_API_KEY not set"

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

    try:
        client = genai.Client(api_key=api_key)

        if logger:
            logger.info(
                "[ENHANCED-OCR] Sending %s (%d bytes, mime=%s) to gemini-flash-lite-latest",
                filename or "unknown", len(data), mime_type,
            )

        response = client.models.generate_content(
            model="gemini-flash-lite-latest",
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(data=data, mime_type=mime_type),
                        types.Part.from_text(text=ENHANCED_OCR_PROMPT),
                    ],
                )
            ],
        )

        text = response.text or ""

        if not text.strip():
            return None, "Gemini enhanced OCR returned empty text"

        if logger:
            logger.info(
                "[ENHANCED-OCR] OK for %s: %d chars",
                filename or "unknown", len(text),
            )

        return text, None

    except Exception as e:
        if logger:
            logger.error("[ENHANCED-OCR] Error for %s: %s", filename or "unknown", e)
        return None, str(e)