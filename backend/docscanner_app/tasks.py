# tasks.py
from celery import shared_task
from decimal import Decimal
from django.core.files.base import ContentFile
from django.conf import settings

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
from .utils.llm_json import parse_llm_json_robust
from .utils.duplicates import is_duplicate_by_series_number
from .utils.save_document import _apply_sumiskai_defaults_from_user


import os
import logging
import logging.config
import time

logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')


def _t():
    return time.perf_counter()

def _log_t(label: str, t0: float):
    logger.info(f"[TIME] {label}: {time.perf_counter() - t0:.2f}s")


def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
    """
    Сначала пробуем Gemini 2.5 Flash; если упал/пусто — откатываемся на GPT.
    Возвращает (resp_text_or_json, 'gemini'|'gpt').
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
    Полный пайплайн:
    - OCR: Google Vision (компактный JSON параграфов + склеенный текст) → fallback Gemini OCR (только текст)
    - Ранний reject по типу документа
    - Сохранение raw_text (JSON/текст) и glued_raw_text (строчный текст)
    - Подсчёт похожести
    - LLM: Gemini → GPT fallback
    - Парсинг JSON, валидации, сохранение
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

            t0 = _t()
            try:
                normalized = normalize_uploaded_file(fake_file)
                logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
            except Exception:
                logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
                raise
            _log_t("PDF→PNG normalize", t0)

            # удалить исходный PDF
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

            # сохранить PNG
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
        # get_ocr_text_gcv возвращает: raw_json, joined_text, paragraphs, error
        gcv_raw_json, gcv_joined_text, _, gcv_err = get_ocr_text_gcv(data, original_filename, logger)
        _log_t("OCR (Google Vision)", t0)

        if gcv_err or (not gcv_raw_json and not gcv_joined_text):
            logger.warning(f"[TASK] GCV failed or empty ({gcv_err or 'empty'}). Trying Gemini OCR...")
            t1 = _t()
            gemini_text, gemini_err = get_ocr_text_gemini(data, original_filename, logger)  # текст БЕЗ координат
            _log_t("OCR (Gemini OCR fallback)", t1)

            if gemini_err or not gemini_text:
                # финальная ошибка OCR
                t0 = _t()
                doc.status = 'rejected'
                doc.error_message = gemini_err or gcv_err or "OCR returned empty text"
                doc.preview_url = preview_url
                doc.save(update_fields=['status', 'error_message', 'preview_url'])
                _log_t("Save rejected (OCR error)", t0)
                logger.error(f"[TASK] OCR error (GCV+Gemini): {doc.error_message}")
                _log_t("TOTAL", total_start)
                return

            # fallback: координат нет → raw_text кладём сам текст, glued_raw_text тоже текст
            raw_json_for_db = gemini_text
            glued_text_for_db = gemini_text
        else:
            # GCV успех: есть компактный JSON + склеенный текст
            raw_json_for_db = gcv_raw_json
            glued_text_for_db = gcv_joined_text

        logger.info("[TASK] OCR lengths: raw=%s, glued=%s",
                    len(raw_json_for_db or ""), len(glued_text_for_db or ""))

        # 7) Ранний reject по типу документа (по склеенному тексту)
        t0 = _t()
        found_type = detect_doc_type(glued_text_for_db or "")
        _log_t("Detect doc type", t0)
        if found_type:
            t0 = _t()
            doc.status = 'rejected'
            doc.error_message = f"Potenciali {found_type}"
            doc.raw_text = raw_json_for_db
            doc.glued_raw_text = glued_text_for_db
            doc.preview_url = preview_url
            doc.save(update_fields=['status', 'error_message', 'raw_text', 'glued_raw_text', 'preview_url'])
            _log_t("Save rejected (doc type)", t0)
            logger.info(f"[TASK] Rejected due to type: {found_type}")
            _log_t("TOTAL", total_start)
            return

        # 8) Сохранить OCR результаты
        t0 = _t()
        doc.raw_text = raw_json_for_db          # JSON параграфов с bbox ИЛИ plain text (если Gemini fallback)
        doc.glued_raw_text = glued_text_for_db  # построчный «склеенный» текст
        doc.preview_url = preview_url
        doc.save(update_fields=['raw_text', 'glued_raw_text', 'preview_url'])
        _log_t("Save OCR results", t0)

        # 9) Похожесть с другими документами пользователя — по склеенному тексту
        t0 = _t()
        similarity_percent, similar_doc_id = calculate_max_similarity_percent(
            doc.glued_raw_text or "",  # <--- склеенный текст, не raw_json
            user=user,
            exclude_doc_id=doc.pk
        )
        _log_t("Calculate similarity", t0)

        t0 = _t()
        doc.similarity_percent = similarity_percent
        # Если есть поле в модели, можно сохранить и ID:
        # doc.similar_doc_id = similar_doc_id
        doc.save(update_fields=['similarity_percent'])  # , 'similar_doc_id'
        _log_t("Save similarity", t0)

        if similarity_percent > 98:
            t0 = _t()
            if similar_doc_id:
                doc.status = 'rejected'
                doc.error_message = f"Potencialus dublikatas (>98% panašumas) su dokumentu ID {similar_doc_id}"
            else:
                doc.status = 'rejected'
                doc.error_message = "Potencialus dublikatas (>98% panašumas)"
            doc.save(update_fields=['status', 'error_message'])
            _log_t("Save rejected (duplicate)", t0)
            logger.info(f"[TASK] Rejected as duplicate{f' of document {similar_doc_id}' if similar_doc_id else ''}")
            _log_t("TOTAL", total_start)
            return


        # 10) LLM: Gemini → GPT fallback (скармливаем склеенный текст)
        t0 = _t()
        try:
            llm_resp, source_model = ask_llm_with_fallback(glued_text_for_db or "", scan_type, logger)
        except Exception as e:
            logger.warning(f"[TASK] Gemini request failed: {e}")
            llm_resp = None
            source_model = "gemini-error"
        _log_t("LLM wrapper (with fallback)", t0)

        if not llm_resp:
            # Доп. попытка GPT (одна быстрая)
            t1 = _t()
            prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
            llm_resp = ask_gpt_with_retry(glued_text_for_db or "", prompt, max_retries=1, wait_seconds=30)
            source_model = "gpt-4.1"
            _log_t("LLM (GPT final attempt)", t1)

        # 11) Сохранить сырой JSON от LLM
        t0 = _t()
        doc.gpt_raw_json = llm_resp
        doc.save(update_fields=['gpt_raw_json'])
        _log_t("Save gpt_raw_json", t0)

        # 12) Парсинг JSON
        t0 = _t()
        try:
            structured = parse_llm_json_robust(llm_resp)
        except Exception as parse_err:
            _log_t("Parse JSON (failed)", t0)
            logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")
            if source_model != "gpt-4.1":
                t1 = _t()
                prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
                gpt_resp = ask_gpt_with_retry(glued_text_for_db or "", prompt, max_retries=1, wait_seconds=30)
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

        # 13) Проверка количества документов
        t0 = _t()
        docs_count = max(1, int(structured.get("docs", 1)))
        documents = structured.get("documents", [structured])
        _log_t("Check docs count", t0)

        if docs_count != 1:
            t1 = _t()
            doc.status = 'rejected'
            doc.error_message = "Daugiau nei 1 dokumentas faile"
            # оставляем сырые OCR-поля, чтобы юзер видел, что распознано
            doc.save(update_fields=['status', 'error_message'])
            _log_t("Save rejected (multi-docs)", t1)
            logger.info("[TASK] Rejected due to multiple docs")
            _log_t("TOTAL", total_start)
            return
        

        # 13.1) Проверка дублей по номеру/серии (НОВОЕ)
        # Логика:
        #   - если серия НЕ пуста → сравниваем (номер + серия) после очистки
        #   - если серия пуста → сравниваем только номер
        # Очистка: оставляем только буквы и цифры (игнорируем пробелы, дефисы, символы '/')
        # Если найден дубликат → документ помечается как rejected и кредиты НЕ списываются
        doc_struct = documents[0]
        number = doc_struct.get("document_number")
        series = doc_struct.get("document_series")

        t0 = _t()
        if is_duplicate_by_series_number(user, number, series, exclude_doc_id=doc.pk):
            doc.status = 'rejected'
            if (series or "").strip():
                doc.error_message = "Dublikatas: dokumentas su tokia serija ir numeriu jau buvo įkeltas"
            else:
                doc.error_message = "Dublikatas: dokumentas su tokiu numeriu jau buvo įkeltas"
            doc.preview_url = preview_url
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _log_t("Duplicate check (number/series)", t0)  # <-- лог времени
            logger.info("[TASK] Rejected as duplicate by number/series (no credits deducted)")
            _log_t("TOTAL", total_start)
            return
        _log_t("Duplicate check (number/series, passed)", t0)


        # 14) Обновление документа
        doc_struct = documents[0]
        doc_struct["similarity_percent"] = similarity_percent

        t0 = _t()
        update_scanned_document(
            db_doc=doc,
            doc_struct=doc_struct,
            raw_text=raw_json_for_db,         # <-- ВАЖНО: оставляем JSON/текст OCR
            preview_url=preview_url,
            user=user,
            structured=structured,
            glued_raw_text=glued_text_for_db  # <-- и передаём склейку отдельно
        )
        _log_t("update_scanned_document()", t0)

        # 15) Сопоставление продавца/покупателя
        t0 = _t()
        update_seller_buyer_info(doc)
        _log_t("update_seller_buyer_info()", t0)

        t0 = _t()
        update_seller_buyer_info_from_companies(doc)
        _log_t("update_seller_buyer_info_from_companies()", t0)

        # 15.1) Применяем дефолты один раз — теперь, когда контрагенты уточнены
        t0 = _t()
        if _apply_sumiskai_defaults_from_user(doc, user):
            doc.save(update_fields=[
                'prekes_pavadinimas',
                'prekes_kodas',
                'prekes_barkodas',
                'preke_paslauga',
            ])
        _log_t("apply defaults (post party enrichment)", t0)

        # 16) Списание кредитов
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
                doc.save()  # фиксируем ошибку
            _log_t("Save rejected (exception path)", t0)
        finally:
            _log_t("TOTAL (exception path)", total_start)














# tasks.py
# from celery import shared_task
# from .models import ScannedDocument, CustomUser
# from .utils.ocr import get_ocr_text as get_ocr_text_gcv
# from .utils.file_converter import normalize_uploaded_file
# from django.core.files.base import ContentFile
# from django.conf import settings
# import os
# import logging
# import logging.config
# import time

# logging.config.dictConfig(settings.LOGGING)
# logger = logging.getLogger('docscanner_app')


# def _t():
#     return time.perf_counter()

# def _log_t(label: str, t0: float):
#     logger.info(f"[TIME] {label}: {time.perf_counter() - t0:.2f}s")


# @shared_task
# def process_uploaded_file_task(user_id, doc_id, scan_type=None):
#     """
#     Упрощённый пайплайн:
#     - Загружаем файл
#     - Если PDF → конвертируем в PNG
#     - Делаем OCR (Google Vision)
#     - Сохраняем полный JSON-ответ OCR в doc.raw_text
#     """
#     total_start = _t()
#     try:
#         doc = ScannedDocument.objects.get(pk=doc_id)
#         user = CustomUser.objects.get(pk=user_id)

#         file_path = doc.file.path
#         original_filename = doc.original_filename
#         logger.info(f"[TASK] Starting for doc_id={doc_id}, file={original_filename}, path={file_path}")

#         # Читаем файл
#         with open(file_path, 'rb') as f:
#             file_bytes = f.read()

#         # Определяем content_type
#         content_type = getattr(doc.file.file, 'content_type', None)
#         if not content_type:
#             if file_path.lower().endswith('.pdf'):
#                 content_type = 'application/pdf'
#             elif file_path.lower().endswith(('.jpg', '.jpeg')):
#                 content_type = 'image/jpeg'
#             elif file_path.lower().endswith('.png'):
#                 content_type = 'image/png'
#         logger.info(f"[TASK] Detected content_type={content_type}")

#         # Если PDF → конвертируем в PNG
#         data = file_bytes
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
#             normalized = normalize_uploaded_file(fake_file)
#             logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size={len(normalized['data'])}")

#             # Удаляем исходный PDF
#             if doc.file and os.path.exists(file_path):
#                 try:
#                     doc.file.delete(save=False)
#                 except Exception:
#                     pass
#                 if os.path.exists(file_path):
#                     try:
#                         os.remove(file_path)
#                     except Exception:
#                         pass

#             # Сохраняем PNG
#             doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
#             doc.content_type = normalized['content_type']
#             doc.save()
#             doc.refresh_from_db()

#             file_path = doc.file.path
#             original_filename = doc.file.name
#             data = normalized['data']

#         # Строим preview_url
#         preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"

#         # OCR (возвращает 4 значения)
#         raw_json, plain_text, _, ocr_error = get_ocr_text_gcv(data, original_filename, logger)

#         if ocr_error or not raw_json:
#             doc.status = 'rejected'
#             doc.error_message = ocr_error or "OCR returned empty"
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             logger.error(f"[TASK] OCR error: {doc.error_message}")
#             _log_t("TOTAL", total_start)
#             return

#         # Сохраняем JSON от OCR (полный ответ с bbox)
#         doc.raw_text = raw_json
#         doc.preview_url = preview_url
#         doc.status = 'processed'
#         doc.save(update_fields=['raw_text', 'preview_url', 'status'])

#         logger.info(f"[TASK] OCR saved successfully for doc_id={doc_id}")
#         _log_t("TOTAL", total_start)

#     except Exception as e:
#         logger.exception(f"[TASK] Error processing document ID={doc_id}")
#         doc = ScannedDocument.objects.filter(pk=doc_id).first()
#         if doc:
#             doc.status = 'rejected'
#             doc.error_message = str(e)
#             doc.save(update_fields=['status', 'error_message'])
#         _log_t("TOTAL (exception)", total_start)
















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
# import time

# logging.config.dictConfig(settings.LOGGING)
# logger = logging.getLogger('docscanner_app')


# def _t():
#     """Начать отсчёт времени для этапа."""
#     return time.perf_counter()


# def _log_t(label: str, t0: float):
#     """Залогировать длительность этапа."""
#     logger.info(f"[TIME] {label}: {time.perf_counter() - t0:.2f}s")


# def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
#     """
#     Сначала пробуем Gemini 2.5 Flash; если упал/пусто — откатываемся на GPT.
#     Возвращает (resp_text_or_json, 'gemini'|'gpt').
#     Добавлены замеры времени для каждого вызова.
#     """
#     try:
#         try:
#             gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
#         except NameError:
#             gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

#         t0 = _t()
#         resp = ask_gemini_with_retry(
#             text=raw_text,
#             prompt=gemini_prompt,
#             model="gemini-2.5-flash",
#             logger=logger,
#         )
#         _log_t("LLM (Gemini 2.5 Flash)", t0)
#         logger.info("[TASK] Gemini succeeded")
#         return resp, "gemini"
#     except Exception as e:
#         logger.warning(f"[TASK] Gemini failed, falling back to GPT: {e}")

#     gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#     t0 = _t()
#     resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
#     _log_t("LLM (GPT fallback)", t0)
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
#     Добавлены подробные замеры времени по этапам.
#     """
#     total_start = _t()
#     try:
#         # 1) Загрузка пользователя и документа
#         t0 = _t()
#         user = CustomUser.objects.get(pk=user_id)
#         doc = ScannedDocument.objects.get(pk=doc_id)
#         _log_t("Fetch user & doc", t0)

#         file_path = doc.file.path
#         original_filename = doc.original_filename

#         logger.info(f"[TASK] Starting for doc_id={doc_id}, file={original_filename}, path={file_path}")
#         logger.info(f"[TASK] File exists at start? {os.path.exists(file_path)}")

#         # 2) Чтение файла
#         t0 = _t()
#         with open(file_path, 'rb') as f:
#             file_bytes = f.read()
#         _log_t("Read file from disk", t0)

#         # 3) Определить content_type
#         t0 = _t()
#         content_type = getattr(doc.file.file, 'content_type', None)
#         if not content_type:
#             if file_path.lower().endswith('.pdf'):
#                 content_type = 'application/pdf'
#             elif file_path.lower().endswith(('.jpg', '.jpeg')):
#                 content_type = 'image/jpeg'
#             elif file_path.lower().endswith('.png'):
#                 content_type = 'image/png'
#         logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")
#         _log_t("Detect content_type", t0)

#         # 4) Если PDF — конвертация в PNG
#         data = file_bytes
#         if content_type == 'application/pdf':
#             # 4.1 Создать фейковый upload-объект
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

#             # 4.2 Нормализация (PDF→PNG)
#             t0 = _t()
#             try:
#                 normalized = normalize_uploaded_file(fake_file)
#                 logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
#             except Exception:
#                 logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
#                 raise
#             _log_t("PDF→PNG normalize", t0)

#             # 4.3 Удаление исходного PDF
#             t0 = _t()
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
#             _log_t("Delete original PDF", t0)

#             # 4.4 Сохранить PNG в поле file
#             t0 = _t()
#             doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
#             logger.info(f"[TASK] PNG saved: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
#             doc.content_type = normalized['content_type']
#             doc.save()
#             doc.refresh_from_db()
#             logger.info(f"[TASK] After refresh: doc.file.name={doc.file.name}, doc.file.path={doc.file.path}, exists? {os.path.exists(doc.file.path)}")
#             _log_t("Save PNG to model field", t0)

#             file_path = doc.file.path
#             original_filename = doc.file.name
#             data = normalized['data']
#         else:
#             logger.info(f"[TASK] Not a PDF, using as is: {original_filename}")

#         # 5) preview_url
#         t0 = _t()
#         preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
#         _log_t("Build preview_url", t0)

#         # 6) OCR: Google Vision → fallback Gemini OCR
#         t0 = _t()
#         raw_text, ocr_error = get_ocr_text_gcv(data, original_filename, logger)
#         _log_t("OCR (Google Vision)", t0)
#         if ocr_error or not raw_text:
#             logger.warning(f"[TASK] GCV failed or empty ({ocr_error or 'empty'}). Trying Gemini OCR...")
#             t1 = _t()
#             raw_text, ocr_error = get_ocr_text_gemini(data, original_filename, logger)
#             _log_t("OCR (Gemini OCR fallback)", t1)

#         # 7) Проверка результата OCR
#         if ocr_error or not raw_text:
#             t0 = _t()
#             doc.status = 'rejected'
#             doc.error_message = ocr_error or "OCR returned empty text"
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             _log_t("Save rejected (OCR error)", t0)
#             logger.error(f"[TASK] OCR error (GCV+Gemini): {doc.error_message}")
#             _log_t("TOTAL", total_start)
#             return

#         # 8) Ранний reject по типу документа
#         t0 = _t()
#         found_type = detect_doc_type(raw_text)
#         _log_t("Detect doc type", t0)
#         if found_type:
#             t0 = _t()
#             doc.status = 'rejected'
#             doc.error_message = f"Potenciali {found_type}"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'raw_text', 'preview_url'])
#             _log_t("Save rejected (doc type)", t0)
#             logger.info(f"[TASK] Rejected due to type: {found_type}")
#             _log_t("TOTAL", total_start)
#             return

#         # 9) Сохранить результат OCR (raw_text)
#         t0 = _t()
#         doc.raw_text = raw_text
#         doc.preview_url = preview_url
#         doc.save(update_fields=['raw_text', 'preview_url'])
#         _log_t("Save OCR raw_text", t0)

#         # 10) Похожесть с другими документами пользователя
#         t0 = _t()
#         similarity_percent = calculate_max_similarity_percent(raw_text, user, exclude_doc_id=doc.pk)
#         _log_t("Calculate similarity", t0)

#         t0 = _t()
#         doc.similarity_percent = similarity_percent
#         doc.save(update_fields=['similarity_percent'])
#         _log_t("Save similarity", t0)

#         if similarity_percent > 95:
#             t0 = _t()
#             doc.status = 'rejected'
#             doc.error_message = "Potencialus dublikatas (>95% panasumas)"
#             doc.save(update_fields=['status', 'error_message'])
#             _log_t("Save rejected (duplicate)", t0)
#             logger.info("[TASK] Rejected as duplicate")
#             _log_t("TOTAL", total_start)
#             return


#         # 11) LLM: Gemini → GPT fallback
#         t0 = _t()
#         try:
#             llm_resp, source_model = ask_llm_with_fallback(raw_text, scan_type, logger)
#         except Exception as e:
#             logger.warning(f"[TASK] Gemini request failed: {e}")
#             llm_resp = None
#             source_model = "gemini-error"
#         _log_t("LLM wrapper (with fallback)", t0)

#         if not llm_resp:
#             # Доп. попытка GPT (одна быстрая)
#             t1 = _t()
#             prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#             llm_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
#             source_model = "gpt-4.1"
#             _log_t("LLM (GPT final attempt)", t1)

#         # 12) Сохранить сырой JSON от LLM
#         t0 = _t()
#         doc.gpt_raw_json = llm_resp
#         doc.save(update_fields=['gpt_raw_json'])
#         _log_t("Save gpt_raw_json", t0)

#         # 13) Парсинг JSON
#         t0 = _t()
#         try:
#             structured = parse_llm_json_robust(llm_resp)
#         except Exception as parse_err:
#             _log_t("Parse JSON (failed)", t0)
#             logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")
#             if source_model != "gpt-4.1":
#                 t1 = _t()
#                 prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#                 gpt_resp = ask_gpt_with_retry(raw_text, prompt, max_retries=1, wait_seconds=30)
#                 _log_t("LLM (GPT retry after parse fail)", t1)

#                 t2 = _t()
#                 doc.gpt_raw_json = gpt_resp
#                 doc.save(update_fields=['gpt_raw_json'])
#                 _log_t("Save gpt_raw_json (after retry)", t2)

#                 t3 = _t()
#                 structured = parse_llm_json_robust(gpt_resp)
#                 _log_t("Parse JSON (retry GPT)", t3)
#                 source_model = "gpt-4.1"
#             else:
#                 t1 = _t()
#                 doc.status = 'rejected'
#                 doc.error_message = "JSON klaida iš LLM"
#                 doc.preview_url = preview_url
#                 doc.save()
#                 _log_t("Save rejected (JSON parse error)", t1)
#                 _log_t("TOTAL", total_start)
#                 return
#         else:
#             _log_t("Parse JSON", t0)

#         # 14) Проверка количества документов
#         t0 = _t()
#         docs_count = max(1, int(structured.get("docs", 1)))
#         documents = structured.get("documents", [structured])
#         _log_t("Check docs count", t0)

#         if docs_count != 1:
#             t1 = _t()
#             doc.status = 'rejected'
#             doc.error_message = "Daugiau nei 1 dokumentas faile"
#             doc.raw_text = raw_text
#             doc.preview_url = preview_url
#             doc.save()
#             _log_t("Save rejected (multi-docs)", t1)
#             logger.info("[TASK] Rejected due to multiple docs")
#             _log_t("TOTAL", total_start)
#             return

#         # 15) Обновление документа (первый круг)
#         doc_struct = documents[0]
#         doc_struct["similarity_percent"] = similarity_percent

#         t0 = _t()
#         update_scanned_document(
#             db_doc=doc,
#             doc_struct=doc_struct,
#             raw_text=raw_text,
#             preview_url=preview_url,
#             user=user,
#             structured=structured,
#         )
#         _log_t("update_scanned_document()", t0)

#         # 16) Обновление продавца/покупателя
#         t0 = _t()
#         update_seller_buyer_info(doc)
#         _log_t("update_seller_buyer_info()", t0)

#         t0 = _t()
#         update_seller_buyer_info_from_companies(doc)
#         _log_t("update_seller_buyer_info_from_companies()", t0)

#         # 17) Списание кредитов (только в первом круге)
#         t0 = _t()
#         credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
#         user.credits -= credits_per_doc
#         user.save(update_fields=['credits'])
#         _log_t("Deduct credits & save user", t0)

#         _log_t("TOTAL", total_start)

#     except Exception as e:
#         logger.exception(f"[TASK] Error processing document ID: {doc_id}")
#         try:
#             t0 = _t()
#             doc = ScannedDocument.objects.filter(pk=doc_id).first()
#             if doc:
#                 doc.status = 'rejected'
#                 doc.error_message = str(e)
#                 doc.save()  # просто сохраняем; без обрезанных комментариев
#             _log_t("Save rejected (exception path)", t0)
#         finally:
#             _log_t("TOTAL (exception path)", total_start)

