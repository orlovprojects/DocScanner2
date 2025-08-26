from celery import shared_task
from .models import ScannedDocument, CustomUser
from .utils.ocr import get_ocr_text as get_ocr_text_gcv
from .utils.gemini_ocr import get_ocr_text_gemini
from .utils.doc_type import detect_doc_type
from .utils.gpt import ask_gpt_with_retry, DEFAULT_PROMPT, DETAILED_PROMPT
from .utils.gemini import GEMINI_DEFAULT_PROMPT, GEMINI_DETAILED_PROMPT, ask_gemini_with_retry

from .utils.similarity import calculate_max_similarity_percent
from .utils.save_document import update_scanned_document
from .validators.company_matcher import update_seller_buyer_info
from .validators.verify_lt_company_match import update_seller_buyer_info_from_companies
from .utils.file_converter import normalize_uploaded_file
from .utils.update_currency_rates import update_currency_rates
from django.core.files.base import ContentFile
from decimal import Decimal
import os
import logging
import logging.config
from django.conf import settings
from datetime import date
from .utils.llm_json import parse_llm_json_robust
import time

logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')


def _t():
    """Начать отсчёт времени для этапа."""
    return time.perf_counter()


def _log_t(label: str, t0: float):
    """Залогировать длительность этапа."""
    logger.info(f"[TIME] {label}: {time.perf_counter() - t0:.2f}s")


def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
    """
    Сначала пробуем Gemini 2.5 Flash; если упал/пусто — откатываемся на GPT.
    Возвращает (resp_text_or_json, 'gemini'|'gpt').
    Добавлены замеры времени для каждого вызова.
    """
    try:
        try:
            gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
        except NameError:
            gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

        t0 = _t()
        resp = ask_gemini_with_retry(
            text=raw_text,
            prompt=gemini_prompt,
            model="gemini-2.5-flash",
            logger=logger,
        )
        _log_t("LLM (Gemini 2.5 Flash)", t0)
        logger.info("[TASK] Gemini succeeded")
        return resp, "gemini"
    except Exception as e:
        logger.warning(f"[TASK] Gemini failed, falling back to GPT: {e}")

    gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
    t0 = _t()
    resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
    _log_t("LLM (GPT fallback)", t0)
    logger.info("[TASK] GPT used as fallback")
    return resp, "gpt"


@shared_task
def process_uploaded_file_task(user_id, doc_id, scan_type):
    """
    Первый круг обработки:
    - OCR: Google Vision → fallback Gemini OCR
    - LLM: Gemini 2.5 Flash → fallback GPT-4.1
    - Парсинг JSON, валидации, сохранение
    Если валидатор заменил документные суммы суммами строк — второй круг запустит reprocess_with_gemini (внутри save_document).
    Добавлены подробные замеры времени по этапам.
    """
    total_start = _t()
    try:
        # 1) Загрузка пользователя и документа
        t0 = _t()
        user = CustomUser.objects.get(pk=user_id)
        doc = ScannedDocument.objects.get(pk=doc_id)
        _log_t("Fetch user & doc", t0)

        file_path = doc.file.path
        original_filename = doc.original_filename

        logger.info(f"[TASK] Starting for doc_id={doc_id}, file={original_filename}, path={file_path}")
        logger.info(f"[TASK] File exists at start? {os.path.exists(file_path)}")

        # 2) Чтение файла
        t0 = _t()
        with open(file_path, 'rb') as f:
            file_bytes = f.read()
        _log_t("Read file from disk", t0)

        # 3) Определить content_type
        t0 = _t()
        content_type = getattr(doc.file.file, 'content_type', None)
        if not content_type:
            if file_path.lower().endswith('.pdf'):
                content_type = 'application/pdf'
            elif file_path.lower().endswith(('.jpg', '.jpeg')):
                content_type = 'image/jpeg'
            elif file_path.lower().endswith('.png'):
                content_type = 'image/png'
        logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")
        _log_t("Detect content_type", t0)

        # 4) Если PDF — конвертация в PNG
        data = file_bytes
        if content_type == 'application/pdf':
            # 4.1 Создать фейковый upload-объект
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

            # 4.2 Нормализация (PDF→PNG)
            t0 = _t()
            try:
                normalized = normalize_uploaded_file(fake_file)
                logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
            except Exception:
                logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
                raise
            _log_t("PDF→PNG normalize", t0)

            # 4.3 Удаление исходного PDF
            t0 = _t()
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
            _log_t("Delete original PDF", t0)

            # 4.4 Сохранить PNG в поле file
            t0 = _t()
            doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
            logger.info(f"[TASK] PNG saved: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
            doc.content_type = normalized['content_type']
            doc.save()
            doc.refresh_from_db()
            logger.info(f"[TASK] After refresh: doc.file.name={doc.file.name}, doc.file.path={doc.file.path}, exists? {os.path.exists(doc.file.path)}")
            _log_t("Save PNG to model field", t0)

            file_path = doc.file.path
            original_filename = doc.file.name
            data = normalized['data']
        else:
            logger.info(f"[TASK] Not a PDF, using as is: {original_filename}")

        # 5) preview_url
        t0 = _t()
        preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
        _log_t("Build preview_url", t0)

        # 6) OCR: Google Vision → fallback Gemini OCR
        t0 = _t()
        raw_text, ocr_error = get_ocr_text_gcv(data, original_filename, logger)
        _log_t("OCR (Google Vision)", t0)
        if ocr_error or not raw_text:
            logger.warning(f"[TASK] GCV failed or empty ({ocr_error or 'empty'}). Trying Gemini OCR...")
            t1 = _t()
            raw_text, ocr_error = get_ocr_text_gemini(data, original_filename, logger)
            _log_t("OCR (Gemini OCR fallback)", t1)

        # 7) Проверка результата OCR
        if ocr_error or not raw_text:
            t0 = _t()
            doc.status = 'rejected'
            doc.error_message = ocr_error or "OCR returned empty text"
            doc.preview_url = preview_url
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _log_t("Save rejected (OCR error)", t0)
            logger.error(f"[TASK] OCR error (GCV+Gemini): {doc.error_message}")
            _log_t("TOTAL", total_start)
            return

        # 8) Ранний reject по типу документа
        t0 = _t()
        found_type = detect_doc_type(raw_text)
        _log_t("Detect doc type", t0)
        if found_type:
            t0 = _t()
            doc.status = 'rejected'
            doc.error_message = f"Potenciali {found_type}"
            doc.raw_text = raw_text
            doc.preview_url = preview_url
            doc.save(update_fields=['status', 'error_message', 'raw_text', 'preview_url'])
            _log_t("Save rejected (doc type)", t0)
            logger.info(f"[TASK] Rejected due to type: {found_type}")
            _log_t("TOTAL", total_start)
            return

        # 9) Сохранить результат OCR (raw_text)
        t0 = _t()
        doc.raw_text = raw_text
        doc.preview_url = preview_url
        doc.save(update_fields=['raw_text', 'preview_url'])
        _log_t("Save OCR raw_text", t0)

        # 10) Похожесть с другими документами пользователя
        t0 = _t()
        similarity_percent = calculate_max_similarity_percent(raw_text, user, exclude_doc_id=doc.pk)
        _log_t("Calculate similarity", t0)

        t0 = _t()
        doc.similarity_percent = similarity_percent
        doc.save(update_fields=['similarity_percent'])
        _log_t("Save similarity", t0)

        if similarity_percent > 95:
            t0 = _t()
            doc.status = 'rejected'
            doc.error_message = "Potencialus dublikatas (>95% panasumas)"
            doc.save(update_fields=['status', 'error_message'])
            _log_t("Save rejected (duplicate)", t0)
            logger.info("[TASK] Rejected as duplicate")
            _log_t("TOTAL", total_start)
            return


        # 11) LLM: Gemini → GPT fallback
        t0 = _t()
        try:
            llm_resp, source_model = ask_llm_with_fallback(raw_text, scan_type, logger)
        except Exception as e:
            logger.warning(f"[TASK] Gemini request failed: {e}")
            llm_resp = None
            source_model = "gemini-error"
        _log_t("LLM wrapper (with fallback)", t0)

        if not llm_resp:
            # Доп. попытка GPT (одна быстрая)
            t1 = _t()
            prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
            llm_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
            source_model = "gpt-4.1"
            _log_t("LLM (GPT final attempt)", t1)

        # 12) Сохранить сырой JSON от LLM
        t0 = _t()
        doc.gpt_raw_json = llm_resp
        doc.save(update_fields=['gpt_raw_json'])
        _log_t("Save gpt_raw_json", t0)

        # 13) Парсинг JSON
        t0 = _t()
        try:
            structured = parse_llm_json_robust(llm_resp)
        except Exception as parse_err:
            _log_t("Parse JSON (failed)", t0)
            logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")
            if source_model != "gpt-4.1":
                t1 = _t()
                prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
                gpt_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
                _log_t("LLM (GPT retry after parse fail)", t1)

                t2 = _t()
                doc.gpt_raw_json = gpt_resp
                doc.save(update_fields=['gpt_raw_json'])
                _log_t("Save gpt_raw_json (after retry)", t2)

                t3 = _t()
                structured = parse_llm_json_robust(gpt_resp)
                _log_t("Parse JSON (retry GPT)", t3)
                source_model = "gpt-4.1"
            else:
                t1 = _t()
                doc.status = 'rejected'
                doc.error_message = "JSON klaida iš LLM"
                doc.preview_url = preview_url
                doc.save()
                _log_t("Save rejected (JSON parse error)", t1)
                _log_t("TOTAL", total_start)
                return
        else:
            _log_t("Parse JSON", t0)

        # 14) Проверка количества документов
        t0 = _t()
        docs_count = max(1, int(structured.get("docs", 1)))
        documents = structured.get("documents", [structured])
        _log_t("Check docs count", t0)

        if docs_count != 1:
            t1 = _t()
            doc.status = 'rejected'
            doc.error_message = "Daugiau nei 1 dokumentas faile"
            doc.raw_text = raw_text
            doc.preview_url = preview_url
            doc.save()
            _log_t("Save rejected (multi-docs)", t1)
            logger.info("[TASK] Rejected due to multiple docs")
            _log_t("TOTAL", total_start)
            return

        # 15) Обновление документа (первый круг)
        doc_struct = documents[0]
        doc_struct["similarity_percent"] = similarity_percent

        t0 = _t()
        update_scanned_document(
            db_doc=doc,
            doc_struct=doc_struct,
            raw_text=raw_text,
            preview_url=preview_url,
            user=user,
            structured=structured,
        )
        _log_t("update_scanned_document()", t0)

        # 16) Обновление продавца/покупателя
        t0 = _t()
        update_seller_buyer_info(doc)
        _log_t("update_seller_buyer_info()", t0)

        t0 = _t()
        update_seller_buyer_info_from_companies(doc)
        _log_t("update_seller_buyer_info_from_companies()", t0)

        # 17) Списание кредитов (только в первом круге)
        t0 = _t()
        credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
        user.credits -= credits_per_doc
        user.save(update_fields=['credits'])
        _log_t("Deduct credits & save user", t0)

        _log_t("TOTAL", total_start)

    except Exception as e:
        logger.exception(f"[TASK] Error processing document ID: {doc_id}")
        try:
            t0 = _t()
            doc = ScannedDocument.objects.filter(pk=doc_id).first()
            if doc:
                doc.status = 'rejected'
                doc.error_message = str(e)
                doc.save()  # просто сохраняем; без обрезанных комментариев
            _log_t("Save rejected (exception path)", t0)
        finally:
            _log_t("TOTAL (exception path)", total_start)












# from celery import shared_task
# from .models import ScannedDocument, CustomUser
# from .utils.ocr import get_ocr_text as get_ocr_text_gcv
# from .utils.gemini_ocr import get_ocr_text_gemini
# from .utils.doc_type import detect_doc_type
# from .utils.gpt import ask_gpt_with_retry, DEFAULT_PROMPT, DETAILED_PROMPT
# from .utils.gemini import GEMINI_DEFAULT_PROMPT, GEMINI_DETAILED_PROMPT, ask_gemini_with_retry

# from .utils.similarity import calculate_max_similarity_percent
# from .utils.save_document import update_scanned_document
# from .validators.company_matcher import update_seller_buyer_info
# from .validators.verify_lt_company_match import update_seller_buyer_info_from_companies
# from .utils.file_converter import normalize_uploaded_file
# from .utils.update_currency_rates import update_currency_rates
# from django.core.files.base import ContentFile
# from decimal import Decimal
# import os
# import logging
# import logging.config
# from django.conf import settings
# from datetime import date
# from .utils.llm_json import parse_llm_json_robust

# logging.config.dictConfig(settings.LOGGING)
# logger = logging.getLogger('celery')


# def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
#     """
#     Сначала пробуем Gemini 2.5 Flash; если упал/пусто — откатываемся на GPT.
#     Возвращает (resp_text_or_json, 'gemini'|'gpt').
#     """
#     try:
#         try:
#             gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
#         except NameError:
#             gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

#         resp = ask_gemini_with_retry(
#             text=raw_text,
#             prompt=gemini_prompt,
#             model="gemini-2.5-flash",
#             logger=logger,
#         )
#         logger.info("[TASK] Gemini succeeded")
#         return resp, "gemini"
#     except Exception as e:
#         logger.warning(f"[TASK] Gemini failed, falling back to GPT: {e}")

#     gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#     resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
#     logger.info("[TASK] GPT used as fallback")
#     return resp, "gpt"


# @shared_task
# def process_uploaded_file_task(user_id, doc_id, scan_type):
#     """
#     Первый круг обработки:
#     - OCR: Google Vision → fallback Gemini OCR
#     - LLM: Gemini 2.5 Flash → fallback GPT-4.1
#     - Парсинг JSON, валидации, сохранение
#     Если валидатор заменил документные суммы суммами строк — второй круг запустит reprocess_with_gemini (внутри save_document).
#     """
#     try:
#         user = CustomUser.objects.get(pk=user_id)
#         doc = ScannedDocument.objects.get(pk=doc_id)

#         file_path = doc.file.path
#         original_filename = doc.original_filename

#         logger.info(f"[TASK] Starting for doc_id={doc_id}, file={original_filename}, path={file_path}")
#         logger.info(f"[TASK] File exists at start? {os.path.exists(file_path)}")

#         with open(file_path, 'rb') as f:
#             file_bytes = f.read()

#         # Определяем тип файла
#         content_type = getattr(doc.file.file, 'content_type', None)
#         if not content_type:
#             if file_path.lower().endswith('.pdf'):
#                 content_type = 'application/pdf'
#             elif file_path.lower().endswith(('.jpg', '.jpeg')):
#                 content_type = 'image/jpeg'
#             elif file_path.lower().endswith('.png'):
#                 content_type = 'image/png'
#         logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")

#         # --- Если PDF — конвертируем в PNG ---
#         if content_type == 'application/pdf':
#             class FakeUpload:
#                 def __init__(self, name, content, content_type):
#                     self.name = name
#                     self._content = content
#                     self.content_type = content_type
#                     self._read = False
#                 def read(self):
#                     if not self._read:
#                         self._read = True
#                         return self._content
#                     return b''

#             fake_file = FakeUpload(original_filename, file_bytes, content_type)
#             try:
#                 normalized = normalize_uploaded_file(fake_file)
#                 logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
#             except Exception:
#                 logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
#                 raise

#             # Удаляем PDF
#             if doc.file and os.path.exists(file_path):
#                 try:
#                     doc.file.delete(save=False)
#                     logger.info(f"[TASK] PDF deleted via .delete(): {file_path}")
#                 except Exception as e:
#                     logger.warning(f"[TASK] Couldn't delete PDF via delete(): {file_path}: {e}")
#                 if os.path.exists(file_path):
#                     try:
#                         os.remove(file_path)
#                         logger.info(f"[TASK] PDF deleted manually: {file_path}")
#                     except Exception as e:
#                         logger.warning(f"[TASK] Couldn't manually delete PDF: {file_path}: {e}")

#             # Сохраняем PNG
#             doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
#             logger.info(f"[TASK] PNG saved: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
#             doc.content_type = normalized['content_type']
#             doc.save()
#             doc.refresh_from_db()
#             logger.info(f"[TASK] After refresh: doc.file.name={doc.file.name}, doc.file.path={doc.file.path}, exists? {os.path.exists(doc.file.path)}")

#             file_path = doc.file.path
#             original_filename = doc.file.name
#             data = normalized['data']
#         else:
#             data = file_bytes
#             logger.info(f"[TASK] Not a PDF, using as is: {original_filename}")

#         preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"

#         # --- OCR: Google Vision → fallback Gemini OCR ---
#         raw_text, ocr_error = get_ocr_text_gcv(data, original_filename, logger)
#         if ocr_error or not raw_text:
#             logger.warning(f"[TASK] GCV failed or empty ({ocr_error or 'empty'}). Trying Gemini OCR...")
#             raw_text, ocr_error = get_ocr_text_gemini(data, original_filename, logger)

#         if ocr_error or not raw_text:
#             doc.status = 'rejected'
#             doc.error_message = ocr_error or "OCR returned empty text"
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             logger.error(f"[TASK] OCR error (GCV+Gemini): {doc.error_message}")
#             return

#         # --- Ранний reject по типу документа ---
#         found_type = detect_doc_type(raw_text)
#         if found_type:
#             doc.status = 'rejected'
#             doc.error_message = f"Potenciali {found_type}"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'raw_text', 'preview_url'])
#             logger.info(f"[TASK] Rejected due to type: {found_type}")
#             return

#         # --- Сохраняем OCR результат ---
#         doc.raw_text = raw_text
#         doc.preview_url = preview_url
#         doc.save(update_fields=['raw_text', 'preview_url'])

#         # --- Похожесть с другими документами пользователя ---
#         similarity_percent = calculate_max_similarity_percent(raw_text, user, exclude_doc_id=doc.pk)
#         doc.similarity_percent = similarity_percent
#         doc.save(update_fields=['similarity_percent'])

#         if similarity_percent > 95:
#             doc.status = 'rejected'
#             doc.error_message = "Potencialus dublikatas (>95% panasumas)"
#             doc.save(update_fields=['status', 'error_message'])
#             logger.info("[TASK] Rejected as duplicate")
#             return

#         # --- LLM: Gemini 2.5 Flash → fallback GPT-4.1 ---
#         try:
#             llm_resp, source_model = ask_llm_with_fallback(raw_text, scan_type, logger)
#         except Exception as e:
#             logger.warning(f"[TASK] Gemini request failed: {e}")
#             llm_resp = None
#             source_model = "gemini-error"

#         if not llm_resp:
#             prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#             llm_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
#             source_model = "gpt-4.1"

#         doc.gpt_raw_json = llm_resp
#         doc.save(update_fields=['gpt_raw_json'])

#         # --- Парсинг JSON ---
#         try:
#             structured = parse_llm_json_robust(llm_resp)
#         except Exception as parse_err:
#             logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")
#             if source_model != "gpt-4.1":
#                 prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#                 gpt_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
#                 doc.gpt_raw_json = gpt_resp
#                 doc.save(update_fields=['gpt_raw_json'])
#                 structured = parse_llm_json_robust(gpt_resp)
#                 source_model = "gpt-4.1"
#             else:
#                 doc.status = 'rejected'
#                 doc.error_message = "JSON klaida iš LLM"
#                 doc.preview_url = preview_url
#                 doc.save()
#                 return

#         # --- Проверка количества документов ---
#         docs_count = max(1, int(structured.get("docs", 1)))
#         documents = structured.get("documents", [structured])
#         if docs_count != 1:
#             doc.status = 'rejected'
#             doc.error_message = "Daugiau nei 1 dokumentas faile"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save()
#             logger.info("[TASK] Rejected due to multiple docs")
#             return

#         # --- Обновление документа (первый круг) ---
#         doc_struct = documents[0]
#         doc_struct["similarity_percent"] = similarity_percent

#         update_scanned_document(
#             db_doc=doc,
#             doc_struct=doc_struct,
#             raw_text=raw_text,
#             preview_url=preview_url,
#             user=user,
#             structured=structured,
#         )

#         # Обновление продавца/покупателя
#         update_seller_buyer_info(doc)
#         update_seller_buyer_info_from_companies(doc)

#         # Кредиты списываем ТОЛЬКО в первом круге
#         credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
#         user.credits -= credits_per_doc
#         user.save(update_fields=['credits'])

#     except Exception as e:
#         logger.exception(f"[TASK] Error processing document ID: {doc_id}")
#         doc = ScannedDocument.objects.filter(pk=doc_id).first()
#         if doc:
#             doc.status = 'rejected'
#             doc.error_message = str(e)
#             doc.save()  # просто сохраняем; без обрезанных комментариев
































# from celery import shared_task
# from .models import ScannedDocument, CustomUser
# from .utils.ocr import get_ocr_text as get_ocr_text_gcv
# from .utils.gemini_ocr import get_ocr_text_gemini
# from .utils.doc_type import detect_doc_type
# from .utils.gpt import ask_gpt_with_retry, DEFAULT_PROMPT, DETAILED_PROMPT
# # from .utils.deepseek import (
# #     DEEPSEEK_DEFAULT_PROMPT,
# #     DEEPSEEK_DETAILED_PROMPT,
# #     ask_deepseek_with_retry
# # )
# from .utils.gemini import GEMINI_DEFAULT_PROMPT, GEMINI_DETAILED_PROMPT, ask_gemini_with_retry

# from .utils.similarity import calculate_max_similarity_percent
# from .utils.save_document import update_scanned_document
# from .validators.company_matcher import update_seller_buyer_info
# from .validators.verify_lt_company_match import update_seller_buyer_info_from_companies
# from .utils.parsers import parse_date_lit, parse_decimal_lit, parse_percent_int
# from .utils.file_converter import normalize_uploaded_file
# from .utils.update_currency_rates import update_currency_rates
# from django.core.files.base import ContentFile
# from decimal import Decimal
# import os
# import re
# import json
# import logging
# import logging.config
# from django.conf import settings
# from datetime import date
# from .utils.llm_json import parse_llm_json_robust


# logging.config.dictConfig(settings.LOGGING)

# logger = logging.getLogger('celery')


# def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
#     """
#     Всегда сначала пробуем Gemini; если он бросает исключение (после всех ретраев) — используем GPT.
#     Возвращает (resp_text, source_model_str).
#     """
#     try:
#         # если есть отдельные промпты для Gemini — используем их; иначе — общие
#         try:
#             gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
#         except NameError:
#             gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

#         resp = ask_gemini_with_retry(
#             text=raw_text,
#             prompt=gemini_prompt,
#             model="gemini-2.5-flash",
#             logger=logger,
#         )
#         logger.info("[TASK] Gemini succeeded")
#         return resp, "gemini"
#     except Exception as e:
#         logger.warning(f"[TASK] Gemini failed, falling back to GPT: {e}")

#     gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#     resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
#     logger.info("[TASK] GPT used as fallback")
#     return resp, "gpt"


# # --- твой таск с встройкой фолбэка ---
# @shared_task
# def process_uploaded_file_task(user_id, doc_id, scan_type):
#     try:
#         user = CustomUser.objects.get(pk=user_id)
#         doc = ScannedDocument.objects.get(pk=doc_id)

#         file_path = doc.file.path
#         original_filename = doc.original_filename

#         logger.info(f"[TASK] Starting for doc_id={doc_id}, file={original_filename}, path={file_path}")
#         logger.info(f"[TASK] File exists at start? {os.path.exists(file_path)}")

#         with open(file_path, 'rb') as f:
#             file_bytes = f.read()

#         # Определяем тип файла
#         content_type = getattr(doc.file.file, 'content_type', None)
#         if not content_type:
#             if file_path.lower().endswith('.pdf'):
#                 content_type = 'application/pdf'
#             elif file_path.lower().endswith('.jpg') or file_path.lower().endswith('.jpeg'):
#                 content_type = 'image/jpeg'
#             elif file_path.lower().endswith('.png'):
#                 content_type = 'image/png'
#         logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")

#         # --- Если PDF — конвертируем ---
#         if content_type == 'application/pdf':
#             class FakeUpload:
#                 def __init__(self, name, content, content_type):
#                     self.name = name
#                     self._content = content
#                     self.content_type = content_type
#                     self._read = False
#                 def read(self):
#                     if not self._read:
#                         self._read = True
#                         return self._content
#                     return b''

#             fake_file = FakeUpload(original_filename, file_bytes, content_type)
#             try:
#                 normalized = normalize_uploaded_file(fake_file)
#                 logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
#             except Exception:
#                 logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
#                 raise

#             # --- Удаляем PDF! ---
#             if doc.file and os.path.exists(file_path):
#                 try:
#                     doc.file.delete(save=False)
#                     logger.info(f"[TASK] PDF deleted via .delete(): {file_path}")
#                 except Exception as e:
#                     logger.warning(f"[TASK] Couldn't delete PDF via delete(): {file_path}: {e}")
#                 if os.path.exists(file_path):
#                     try:
#                         os.remove(file_path)
#                         logger.info(f"[TASK] PDF deleted manually: {file_path}")
#                     except Exception as e:
#                         logger.warning(f"[TASK] Couldn't manually delete PDF: {file_path}: {e}")

#             # --- Сохраняем PNG! ---
#             doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
#             logger.info(f"[TASK] PNG saved: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
#             doc.content_type = normalized['content_type']
#             doc.save()
#             doc.refresh_from_db()
#             logger.info(f"[TASK] After refresh: doc.file.name={doc.file.name}, doc.file.path={doc.file.path}, exists? {os.path.exists(doc.file.path)}")

#             file_path = doc.file.path
#             original_filename = doc.file.name
#             data = normalized['data']
#         else:
#             data = file_bytes
#             logger.info(f"[TASK] Not a PDF, using as is: {original_filename}")

#         preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"



#         # --- OCR: Google Vision -> fallback Gemini OCR ---
#         raw_text, ocr_error = get_ocr_text_gcv(data, original_filename, logger)
#         if ocr_error or not raw_text:
#             logger.warning(f"[TASK] GCV failed or empty ({ocr_error or 'empty'}). Trying Gemini OCR...")
#             raw_text, ocr_error = get_ocr_text_gemini(data, original_filename, logger)

#         if ocr_error or not raw_text:
#             doc.status = 'rejected'
#             doc.error_message = ocr_error or "OCR returned empty text"
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             logger.error(f"[TASK] OCR error (GCV+Gemini): {doc.error_message}")
#             return

#         # --- Тип документа (ранний reject) ---
#         found_type = detect_doc_type(raw_text)
#         if found_type:
#             doc.status = 'rejected'
#             doc.error_message = f"Potenciali {found_type}"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'raw_text', 'preview_url'])
#             logger.info(f"[TASK] Rejected due to type: {found_type}")
#             return

#         # --- Сохраняем OCR результат ---
#         doc.raw_text = raw_text
#         doc.save(update_fields=['raw_text'])

#         similarity_percent = calculate_max_similarity_percent(raw_text, user, exclude_doc_id=doc.pk)
#         doc.similarity_percent = similarity_percent
#         doc.save(update_fields=['similarity_percent'])

#         if similarity_percent > 95:
#             doc.status = 'rejected'
#             doc.error_message = "Potencialus dublikatas (>95% panasumas)"
#             doc.save(update_fields=['status', 'error_message'])
#             logger.info("[TASK] Rejected as duplicate")
#             return

#         # --- LLM: Gemini 2.5 Flash с fallback на GPT-4.1 ---
#         try:
#             llm_resp, source_model = ask_llm_with_fallback(raw_text, scan_type, logger)  # Gemini
#         except Exception as e:
#             logger.warning(f"[TASK] Gemini request failed: {e}")
#             llm_resp = None
#             source_model = "gemini-error"

#         # Если Gemini упал или вернул пусто — сразу GPT
#         if not llm_resp:
#             prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#             llm_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
#             source_model = "gpt-4.1"

#         doc.gpt_raw_json = llm_resp
#         doc.save(update_fields=['gpt_raw_json'])

#         # --- Парсинг JSON ---
#         try:
#             structured = parse_llm_json_robust(llm_resp)
#         except Exception as parse_err:
#             logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")
#             if source_model != "gpt-4.1":
#                 # Пробуем GPT
#                 prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#                 gpt_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
#                 doc.gpt_raw_json = gpt_resp
#                 doc.save(update_fields=['gpt_raw_json'])
#                 structured = parse_llm_json_robust(gpt_resp)
#                 source_model = "gpt-4.1"
#             else:
#                 # GPT тоже не смог
#                 doc.status = 'rejected'
#                 doc.error_message = "JSON klaida iš LLM"
#                 doc.preview_url = preview_url
#                 doc.save()
#                 return

#         # --- Проверка количества документов ---
#         docs_count = max(1, int(structured.get("docs", 1)))
#         documents = structured.get("documents", [structured])
#         if docs_count != 1:
#             doc.status = 'rejected'
#             doc.error_message = "Daugiau nei 1 dokumentas faile"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save()
#             logger.info("[TASK] Rejected due to multiple docs")
#             return

#         # --- Обновление документа ---
#         doc_struct = documents[0]
#         doc_struct["similarity_percent"] = similarity_percent
#         update_scanned_document(
#             doc, doc_struct, raw_text, preview_url,
#             parse_date_lit, parse_decimal_lit, parse_percent_int, user, structured
#         )
#         update_seller_buyer_info(doc)
#         update_seller_buyer_info_from_companies(doc)

#         doc.status = 'completed'
#         doc.save()

#         credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
#         user.credits -= credits_per_doc
#         user.save(update_fields=['credits'])
    
#     except Exception as e:
#         logger.exception(f"[TASK] Error processing document ID: {doc_id}")
#         doc = ScannedDocument.objects.filter(pk=doc_id).first()
#         if doc:
#             doc.status = 'rejected'
#             doc.error_message = str(e)
#             doc.save()






@shared_task
def fetch_daily_currency_rates():
    count = update_currency_rates(date.today())
    print(f"Updated {count} currency rates for {date.today()}")
    return count




# from celery import shared_task
# from .models import ScannedDocument, CustomUser
# from .utils.ocr import get_ocr_text
# from .utils.doc_type import detect_doc_type
# from .utils.gpt import ask_gpt_with_retry, DEFAULT_PROMPT, DETAILED_PROMPT
# from .utils.similarity import calculate_max_similarity_percent
# from .utils.save_document import update_scanned_document
# from .validators.company_matcher import update_seller_buyer_info
# from .utils.parsers import parse_date_lit, parse_decimal_lit, parse_percent_int
# from .utils.file_converter import normalize_uploaded_file
# from django.core.files.base import ContentFile
# from decimal import Decimal
# import os
# import re
# import json
# import logging
# import logging.config
# from django.conf import settings

# logging.config.dictConfig(settings.LOGGING)

# logger = logging.getLogger('celery')

# @shared_task
# def process_uploaded_file_task(user_id, doc_id, scan_type):
#     try:
#         user = CustomUser.objects.get(pk=user_id)
#         doc = ScannedDocument.objects.get(pk=doc_id)

#         file_path = doc.file.path
#         original_filename = doc.original_filename

#         logger.info(f"[TASK] Starting for doc_id={doc_id}, file={original_filename}, path={file_path}")
#         logger.info(f"[TASK] File exists at start? {os.path.exists(file_path)}")

#         with open(file_path, 'rb') as f:
#             file_bytes = f.read()

#         # Определяем тип файла
#         content_type = getattr(doc.file.file, 'content_type', None)
#         if not content_type:
#             if file_path.lower().endswith('.pdf'):
#                 content_type = 'application/pdf'
#             elif file_path.lower().endswith('.jpg') or file_path.lower().endswith('.jpeg'):
#                 content_type = 'image/jpeg'
#             elif file_path.lower().endswith('.png'):
#                 content_type = 'image/png'
#         logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")

#         # --- Если PDF — конвертируем ---
#         if content_type == 'application/pdf':
#             class FakeUpload:
#                 def __init__(self, name, content, content_type):
#                     self.name = name
#                     self._content = content
#                     self.content_type = content_type
#                     self._read = False
#                 def read(self):
#                     if not self._read:
#                         self._read = True
#                         return self._content
#                     return b''

#             fake_file = FakeUpload(original_filename, file_bytes, content_type)
#             try:
#                 normalized = normalize_uploaded_file(fake_file)
#                 logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
#             except Exception as e:
#                 logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
#                 raise

#             # --- Удаляем PDF! ---
#             if doc.file and os.path.exists(file_path):
#                 try:
#                     doc.file.delete(save=False)
#                     logger.info(f"[TASK] PDF deleted via .delete(): {file_path}")
#                 except Exception as e:
#                     logger.warning(f"[TASK] Couldn't delete PDF via delete(): {file_path}: {e}")
#                 if os.path.exists(file_path):
#                     try:
#                         os.remove(file_path)
#                         logger.info(f"[TASK] PDF deleted manually: {file_path}")
#                     except Exception as e:
#                         logger.warning(f"[TASK] Couldn't manually delete PDF: {file_path}: {e}")

#             # --- Сохраняем PNG! ---
#             doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
#             logger.info(f"[TASK] PNG saved: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
#             doc.content_type = normalized['content_type']
#             doc.save()
#             doc.refresh_from_db()
#             logger.info(f"[TASK] After refresh: doc.file.name={doc.file.name}, doc.file.path={doc.file.path}, exists? {os.path.exists(doc.file.path)}")

#             file_path = doc.file.path
#             original_filename = doc.file.name
#             data = normalized['data']
#         else:
#             data = file_bytes
#             logger.info(f"[TASK] Not a PDF, using as is: {original_filename}")

#         preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"

#         # --- OCR ---
#         raw_text, ocr_error = get_ocr_text(data, original_filename, logger)
#         if ocr_error:
#             doc.status = 'rejected'
#             doc.error_message = ocr_error
#             doc.preview_url = preview_url
#             doc.save()
#             logger.error(f"[TASK] OCR error: {ocr_error}")
#             return

#         found_type = detect_doc_type(raw_text)
#         if found_type:
#             doc.status = 'rejected'
#             doc.error_message = f"Potenciali {found_type}"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save()
#             logger.info(f"[TASK] Rejected due to type: {found_type}")
#             return

#         similarity_percent = calculate_max_similarity_percent(raw_text, user, exclude_doc_id=doc.pk)
#         doc.similarity_percent = similarity_percent
#         logger.info(f"[TASK] Similarity: {similarity_percent}% for {original_filename}")

#         if similarity_percent > 95:
#             doc.status = 'rejected'
#             doc.error_message = "Potencialus dublikatas (>95% panasumas)"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save()
#             logger.info(f"[TASK] Rejected as duplicate")
#             return

#         # --- GPT ---
#         gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#         gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
#         logger.info(f"[TASK] GPT response for {original_filename}: {gpt_resp[:500]}...")  # log first 500 chars

#         gpt_resp_clean = re.sub(r"^```json\s*|^```\s*|```$", "", gpt_resp.strip(), flags=re.MULTILINE)
#         try:
#             structured = json.loads(gpt_resp_clean) if isinstance(gpt_resp_clean, str) else gpt_resp_clean or {}
#         except json.JSONDecodeError as je:
#             logger.error(f"[TASK] JSON decode error: {je}")
#             doc.status = 'rejected'
#             doc.error_message = "JSON klaida iš GPT"
#             doc.preview_url = preview_url
#             doc.save()
#             return

#         docs_count = max(1, int(structured.get("docs", 1)))
#         documents = structured.get("documents", [structured])

#         if docs_count != 1:
#             doc.status = 'rejected'
#             doc.error_message = "Daugiau nei 1 dokumentas faile"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save()
#             logger.info("[TASK] Rejected due to multiple docs")
#             return

#         doc_struct = documents[0]
#         doc_struct["similarity_percent"] = similarity_percent

#         update_scanned_document(
#             doc, doc_struct, raw_text, preview_url,
#             parse_date_lit, parse_decimal_lit, parse_percent_int, user, structured
#         )
#         update_seller_buyer_info(doc)

#         doc.status = 'completed'
#         doc.save()
#         logger.info(f"[TASK] Document {doc.id} completed")

#         credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
#         user.credits -= credits_per_doc
#         user.save(update_fields=['credits'])

#         logger.info(f"[TASK] Credits updated for user {user.id}: {user.credits}")

#     except Exception as e:
#         logger.exception(f"[TASK] Error processing document ID: {doc_id}")
#         doc = ScannedDocument.objects.filter(pk=doc_id).first()
#         if doc:
#             doc.status = 'rejected'
#             doc.error_message = str(e)
#             doc.save()
