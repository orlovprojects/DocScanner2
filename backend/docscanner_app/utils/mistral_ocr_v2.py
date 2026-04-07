"""
mistral_ocr_v2.py — Mistral OCR 3 для документов с плохой геометрией.

Вызывается когда Google Vision OCR даёт mode=FULLTEXT (помятые, фото, кривые).
Возвращает markdown-текст.
"""
import base64
import os
import logging

logger = logging.getLogger("docscanner_app")


def get_ocr_text_mistral(data: bytes, filename: str = None, logger=None) -> tuple:
    """
    Mistral OCR 3 — для документов с плохой геометрией.

    Args:
        data: байты файла (PNG/JPEG после нормализации)
        filename: имя файла для определения типа
        logger: логгер

    Returns:
        (markdown_text: str|None, error: str|None)
    """
    try:
        from mistralai.client import Mistral
    except ImportError:
        try:
            from mistralai import Mistral
        except ImportError:
            return None, "mistralai not installed. pip install mistralai"

    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        return None, "MISTRAL_API_KEY not set"

    try:
        client = Mistral(api_key=api_key)

        base64_data = base64.b64encode(data).decode()

        # Определяем тип по расширению
        ext = ""
        if filename:
            ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()

        if ext == "pdf":
            document = {
                "type": "base64",
                "data": base64_data,
                "media_type": "application/pdf",
            }
        else:
            mime_map = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp",
                "tiff": "image/tiff",
                "tif": "image/tiff",
            }
            mime = mime_map.get(ext, "image/jpeg")
            document = {
                "type": "image_url",
                "image_url": f"data:{mime};base64,{base64_data}",
            }

        if logger:
            logger.info(
                "[MISTRAL-OCR] Sending %s (%d bytes, ext=%s)",
                filename or "unknown", len(data), ext,
            )

        response = client.ocr.process(
            model="mistral-ocr-latest",
            document=document,
        )

        # Собираем markdown со всех страниц
        pages_text = []
        for page in response.pages:
            if page.markdown:
                pages_text.append(page.markdown)

        full_text = "\n\n".join(pages_text)

        if not full_text.strip():
            return None, "Mistral OCR returned empty text"

        if logger:
            logger.info(
                "[MISTRAL-OCR] OK for %s: %d chars, %d pages",
                filename or "unknown", len(full_text), len(response.pages),
            )

        return full_text, None

    except Exception as e:
        if logger:
            logger.error("[MISTRAL-OCR] Error for %s: %s", filename or "unknown", e)
        return None, str(e)