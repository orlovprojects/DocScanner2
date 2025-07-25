from celery import shared_task
from .models import ScannedDocument, CustomUser
from .utils.ocr import get_ocr_text
from .utils.doc_type import detect_doc_type
from .utils.gpt import ask_gpt, DEFAULT_PROMPT, DETAILED_PROMPT
from .utils.similarity import calculate_max_similarity_percent
from .utils.save_document import update_scanned_document
from .validators.company_matcher import update_seller_buyer_info
from .utils.parsers import parse_date_lit, parse_decimal_lit, parse_percent_int
from .utils.file_converter import normalize_uploaded_file
from django.core.files.base import ContentFile
from decimal import Decimal
import os
import re
import json
import logging
from django.conf import settings

logger = logging.getLogger('celery')

@shared_task
def process_uploaded_file_task(user_id, doc_id, scan_type):
    try:
        user = CustomUser.objects.get(pk=user_id)
        doc = ScannedDocument.objects.get(pk=doc_id)

        file_path = doc.file.path
        original_filename = doc.original_filename

        with open("C:\\Temp\\celery-task-start.txt", "a") as f:
            f.write(f"STARTED: {original_filename}\n")

        logger.info(f"[TASK] Starting for doc_id={doc_id}, file={original_filename}, path={file_path}")
        logger.info(f"[TASK] File exists at start? {os.path.exists(file_path)}")

        with open(file_path, 'rb') as f:
            file_bytes = f.read()

        # Определяем тип файла
        content_type = getattr(doc.file.file, 'content_type', None)
        if not content_type:
            if file_path.lower().endswith('.pdf'):
                content_type = 'application/pdf'
            elif file_path.lower().endswith('.jpg') or file_path.lower().endswith('.jpeg'):
                content_type = 'image/jpeg'
            elif file_path.lower().endswith('.png'):
                content_type = 'image/png'
        logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")

        # --- Если PDF — конвертируем ---
        if content_type == 'application/pdf':
            class FakeUpload:
                def __init__(self, name, content, content_type):
                    self.name = name
                    self._content = content
                    self.content_type = content_type
                    self._read = False
                def read(self):
                    if not self._read:
                        self._read = True
                        return self._content
                    return b''

            fake_file = FakeUpload(original_filename, file_bytes, content_type)
            try:
                normalized = normalize_uploaded_file(fake_file)
                logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
            except Exception as e:
                logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
                raise

            # --- Удаляем PDF! ---
            if doc.file and os.path.exists(file_path):
                try:
                    doc.file.delete(save=False)
                    logger.info(f"[TASK] PDF deleted via .delete(): {file_path}")
                except Exception as e:
                    logger.warning(f"[TASK] Couldn't delete PDF via delete(): {file_path}: {e}")
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        logger.info(f"[TASK] PDF deleted manually: {file_path}")
                    except Exception as e:
                        logger.warning(f"[TASK] Couldn't manually delete PDF: {file_path}: {e}")

            # --- Сохраняем PNG! ---
            doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
            logger.info(f"[TASK] PNG saved: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
            doc.content_type = normalized['content_type']
            doc.save()
            doc.refresh_from_db()
            logger.info(f"[TASK] After refresh: doc.file.name={doc.file.name}, doc.file.path={doc.file.path}, exists? {os.path.exists(doc.file.path)}")

            file_path = doc.file.path
            original_filename = doc.file.name
            data = normalized['data']
        else:
            data = file_bytes
            logger.info(f"[TASK] Not a PDF, using as is: {original_filename}")

        preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"

        # --- OCR ---
        raw_text, ocr_error = get_ocr_text(data, original_filename, logger)
        if ocr_error:
            doc.status = 'rejected'
            doc.error_message = ocr_error
            doc.preview_url = preview_url
            doc.save()
            logger.error(f"[TASK] OCR error: {ocr_error}")
            return

        found_type = detect_doc_type(raw_text)
        if found_type:
            doc.status = 'rejected'
            doc.error_message = f"Potenciali {found_type}"
            doc.raw_text = raw_text
            doc.preview_url = preview_url
            doc.save()
            logger.info(f"[TASK] Rejected due to type: {found_type}")
            return

        similarity_percent = calculate_max_similarity_percent(raw_text, user, exclude_doc_id=doc.pk)
        doc.similarity_percent = similarity_percent
        logger.info(f"[TASK] Similarity: {similarity_percent}% for {original_filename}")

        if similarity_percent > 95:
            doc.status = 'rejected'
            doc.error_message = "Potencialus dublikatas (>95% panasumas)"
            doc.raw_text = raw_text
            doc.preview_url = preview_url
            doc.save()
            logger.info(f"[TASK] Rejected as duplicate")
            return

        # --- GPT ---
        gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
        gpt_resp = ask_gpt(raw_text, prompt=gpt_prompt)
        gpt_resp_clean = re.sub(r"^```json\s*|^```\s*|```$", "", gpt_resp.strip(), flags=re.MULTILINE)
        try:
            structured = json.loads(gpt_resp_clean) if isinstance(gpt_resp_clean, str) else gpt_resp_clean or {}
        except json.JSONDecodeError as je:
            logger.error(f"[TASK] JSON decode error: {je}")
            doc.status = 'rejected'
            doc.error_message = "JSON klaida iš GPT"
            doc.preview_url = preview_url
            doc.save()
            return

        docs_count = max(1, int(structured.get("docs", 1)))
        documents = structured.get("documents", [structured])

        if docs_count != 1:
            doc.status = 'rejected'
            doc.error_message = "Daugiau nei 1 dokumentas faile"
            doc.raw_text = raw_text
            doc.preview_url = preview_url
            doc.save()
            logger.info("[TASK] Rejected due to multiple docs")
            return

        doc_struct = documents[0]
        doc_struct["similarity_percent"] = similarity_percent

        update_scanned_document(
            doc, doc_struct, raw_text, preview_url,
            parse_date_lit, parse_decimal_lit, parse_percent_int, user, structured
        )
        update_seller_buyer_info(doc)

        doc.status = 'completed'
        doc.save()
        logger.info(f"[TASK] Document {doc.id} completed")

        credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
        user.credits -= credits_per_doc
        user.save(update_fields=['credits'])

        logger.info(f"[TASK] Credits updated for user {user.id}: {user.credits}")

    except Exception as e:
        logger.exception(f"[TASK] Error processing document ID: {doc_id}")
        doc = ScannedDocument.objects.filter(pk=doc_id).first()
        if doc:
            doc.status = 'rejected'
            doc.error_message = str(e)
            doc.save()
