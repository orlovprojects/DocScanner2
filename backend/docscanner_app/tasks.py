# tasks.py
from celery import shared_task
from decimal import Decimal
from django.core.files.base import ContentFile
from django.conf import settings
import uuid

from .models import ScannedDocument, CustomUser
from .utils.ocr import get_ocr_text as get_ocr_text_gcv
from .utils.gemini_ocr import get_ocr_text_gemini
from .utils.doc_type import detect_doc_type
from .utils.gpt import ask_gpt_with_retry, DEFAULT_PROMPT, DETAILED_PROMPT
from .utils.gemini import GEMINI_DEFAULT_PROMPT, GEMINI_DETAILED_PROMPT, ask_gemini_with_retry, is_truncated_json, repair_truncated_json_with_gemini_lite, request_full_json_with_gemini_lite
from .utils.similarity import calculate_max_similarity_percent
from .utils.save_document import update_scanned_document
from .validators.company_matcher import update_seller_buyer_info
from .validators.verify_lt_company_match import update_seller_buyer_info_from_companies
# from .utils.file_converter import normalize_uploaded_file
from .utils.llm_json import parse_llm_json_robust
from .utils.duplicates import is_duplicate_by_series_number
from .utils.save_document import _apply_sumiskai_defaults_from_user
from celery.exceptions import SoftTimeLimitExceeded

import os
import logging
import logging.config
import time
from .utils.parsers import normalize_code_field
import json
import re


logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')


def _extract_json_object(s: str) -> dict:
    """
    Достаёт первый JSON-объект из строки:
    - срезает markdown-код-блоки ```...```
    - ищет первой парой фигурных скобок { ... }
    - возвращает dict (или {} если не получилось)
    """
    if not s:
        return {}

    # убираем тройные кавычки кода ```...``` и префиксы типа "```json"
    s = s.strip()
    if s.startswith("```"):
        # срежем обрамление ```...```
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)  # уберём ``` или ```json
        s = re.sub(r"\s*```$", "", s)

    # найдём первый блок {...}
    m = re.search(r"\{.*\}", s, flags=re.DOTALL)
    if not m:
        return {}

    try:
        return json.loads(m.group(0))
    except Exception:
        return {}
    

def _count_line_items(structured: dict) -> int:
    try:
        docs = structured.get("documents") or []
        cnt = 0
        for d in docs:
            li = d.get("line_items") or []
            cnt += sum(1 for it in li if isinstance(it, dict))
        return cnt
    except Exception:
        return 0


def _t():
    return time.perf_counter()

def _log_t(label: str, t0: float):
    logger.info(f"[TIME] {label}: {time.perf_counter() - t0:.2f}s")


def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
    """
    1) Gemini 2.5 Flash
    2) если пусто/ошибка — Gemini 2.5 Flash-Lite
    3) если снова пусто/ошибка — GPT
    """
    try:
        gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
    except NameError:
        gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

    primary_model   = "gemini-2.5-flash"
    secondary_model = "gemini-2.5-flash-lite"   # альтернативно: "gemini-flash-lite-latest"

    # 1) Flash
    try:
        t0 = _t()
        logger.info(f"[LLM] Try Gemini primary model={primary_model}")
        resp = ask_gemini_with_retry(
            text=raw_text,
            prompt=gemini_prompt,
            model=primary_model,
            logger=logger,
        )
        _log_t("LLM (Gemini primary)", t0)
        logger.info(f"[LLM] Gemini primary OK: len={len(resp or '')} preview={repr((resp or '')[:200])}")
        if resp and resp.strip():
            return resp, primary_model
        logger.warning("[LLM] Gemini primary returned empty → try secondary")
    except Exception as e:
        logger.warning(f"[LLM] Gemini primary failed: {e} → try secondary")

    # 2) Flash-Lite
    try:
        t0 = _t()
        logger.info(f"[LLM] Try Gemini secondary model={secondary_model}")
        resp2 = ask_gemini_with_retry(
            text=raw_text,
            prompt=gemini_prompt,
            model=secondary_model,
            logger=logger,
        )
        _log_t("LLM (Gemini secondary)", t0)
        logger.info(f"[LLM] Gemini secondary OK: len={len(resp2 or '')} preview={repr((resp2 or '')[:200])}")
        if resp2 and resp2.strip():
            return resp2, secondary_model
        logger.warning("[LLM] Gemini secondary returned empty → fallback to GPT")
    except Exception as e:
        logger.warning(f"[LLM] Gemini secondary failed: {e} → fallback to GPT")

    # 3) GPT
    gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
    t0 = _t()
    gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
    _log_t("LLM (GPT fallback)", t0)
    logger.info(f"[LLM] GPT fallback OK: len={len(gpt_resp or '')} preview={repr((gpt_resp or '')[:200])}")
    return gpt_resp, "gpt"



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

#         t0 = _t()
#         resp = ask_gemini_with_retry(
#             text=raw_text,
#             prompt=gemini_prompt,
#             model="gemini-flash-lite-latest",
#             logger=logger,
#         )
#         _log_t("LLM (Gemini 2.5 Flash-lite)", t0)
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


@shared_task(bind=True, soft_time_limit=600, time_limit=630, acks_late=True)
def process_uploaded_file_task(self, user_id, doc_id, scan_type):
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
    logger.info(
        "[TASK] Celery limits: soft=%ss hard=%ss",
        getattr(self.request, "soft_time_limit", None),
        getattr(self.request, "time_limit", None),
    )
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


        # 3) content_type (грубое определение по расширению как fallback)
        t0 = _t()
        content_type = getattr(doc.file.file, 'content_type', None)
        if not content_type:
            low = file_path.lower()
            if low.endswith('.pdf'): content_type = 'application/pdf'
            elif low.endswith(('.jpg', '.jpeg')): content_type = 'image/jpeg'
            elif low.endswith('.png'): content_type = 'image/png'
            elif low.endswith('.webp'): content_type = 'image/webp'
            elif low.endswith(('.tif', '.tiff')): content_type = 'image/tiff'
            elif low.endswith(('.doc', '.docx')): content_type = 'application/msword'
            elif low.endswith(('.xls', '.xlsx')): content_type = 'application/vnd.ms-excel'
        logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")
        _log_t("Detect content_type", t0)

        # 4) Нормализация через улучшенный file_converter
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

        fake_file = FakeUpload(original_filename, file_bytes, content_type or "")
        t0 = _t()
        
        try:
            from .utils.file_converter import normalize_any
            normalized_result = normalize_any(fake_file)
            _log_t("Normalize uploaded file", t0)
            
        except ValueError as e:
            # Неподдерживаемый формат
            _log_t("Normalize failed (unsupported format)", t0)
            t1 = _t()
            doc.status = 'rejected'
            doc.error_message = f"Nepalaikomas failo formatas: {str(e)}"
            doc.preview_url = None
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _log_t("Save rejected (unsupported format)", t1)
            logger.info(f"[TASK] Rejected unsupported format: {original_filename} - {str(e)}")
            _log_t("TOTAL", total_start)
            return  # НЕ списываем кредиты!
            
        except Exception as e:
            # Другие ошибки нормализации
            _log_t("Normalize failed (error)", t0)
            logger.exception(f"[TASK] Failed to normalize: {original_filename}")
            t1 = _t()
            doc.status = 'rejected'
            doc.error_message = f"Klaida apdorojant failą: {str(e)}"
            doc.preview_url = None
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _log_t("Save rejected (normalize error)", t1)
            _log_t("TOTAL", total_start)
            return  # НЕ списываем кредиты!

        # 5) Обработка результата нормализации
        if isinstance(normalized_result, list):
            # ============================================================
            # АРХИВ С МНОЖЕСТВЕННЫМИ ФАЙЛАМИ
            # ============================================================
            file_count = len(normalized_result)
            logger.info(f"[TASK] Archive contains {file_count} processable files")
            
            if file_count == 0:
                # Пустой архив
                t1 = _t()
                doc.status = 'rejected'
                doc.error_message = "Archyve nerasta palaikomų failų"
                doc.preview_url = None
                doc.save(update_fields=['status', 'error_message', 'preview_url'])
                _log_t("Save rejected (empty archive)", t1)
                logger.info(f"[TASK] Rejected empty archive: {original_filename}")
                _log_t("TOTAL", total_start)
                return
            
            # УДАЛЯЕМ исходный архив из БД (он больше не нужен)
            t1 = _t()
            if doc.file and os.path.exists(file_path):
                try:
                    doc.file.delete(save=False)
                    logger.info(f"[TASK] Archive file deleted: {file_path}")
                except Exception as e:
                    logger.warning(f"[TASK] Couldn't delete archive: {file_path}: {e}")
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        logger.info(f"[TASK] Archive manually deleted: {file_path}")
                    except Exception as e:
                        logger.warning(f"[TASK] Couldn't manually delete archive: {file_path}: {e}")
            _log_t("Delete archive file", t1)
            
            # Генерируем batch_id для группировки документов из одного архива
            batch_id = uuid.uuid4()
            logger.info(f"[TASK] Created batch_id={batch_id} for {file_count} files from archive")
            
            # УДАЛЯЕМ запись архива из БД (заменим её на реальные документы)
            doc.delete()
            logger.info(f"[TASK] Deleted archive record doc_id={doc_id}")
            
            # Создаём отдельные ScannedDocument для каждого файла
            created_docs = []
            for i, normalized_file in enumerate(normalized_result, start=1):
                try:
                    t2 = _t()
                    
                    # Создаём новый документ
                    new_doc = ScannedDocument.objects.create(
                        user=user,
                        original_filename=normalized_file.get('original_filename', f'file_{i}.bin'),
                        status='processing',
                        scan_type=scan_type,
                        # Если у вас есть поле batch_id в модели:
                        # batch_id=batch_id,
                        # batch_order=i,
                    )
                    
                    # Сохраняем нормализованный файл
                    new_doc.file.save(
                        normalized_file['filename'],
                        ContentFile(normalized_file['data']),
                        save=True
                    )
                    new_doc.save(update_fields=['file'])
                    new_doc.refresh_from_db()
                    
                    created_docs.append(new_doc.id)
                    _log_t(f"Created document {i}/{file_count}", t2)
                    
                    logger.info(
                        f"[TASK] Created doc_id={new_doc.id} for file {i}/{file_count}: "
                        f"{normalized_file.get('original_filename')}"
                    )
                    
                except Exception as e:
                    logger.error(f"[TASK] Failed to create document for file {i}/{file_count}: {e}")
                    continue
            
            if not created_docs:
                logger.error(f"[TASK] Failed to create ANY documents from archive {original_filename}")
                _log_t("TOTAL (archive processing failed)", total_start)
                return
            
            logger.info(
                f"[TASK] Successfully created {len(created_docs)} documents from archive. "
                f"batch_id={batch_id}, doc_ids={created_docs}"
            )
            
            # Запускаем обработку каждого документа асинхронно
            for i, new_doc_id in enumerate(created_docs, start=1):
                try:
                    # Небольшая задержка между запусками для равномерной нагрузки
                    process_uploaded_file_task.apply_async(
                        args=[user_id, new_doc_id, scan_type],
                        countdown=i * 2,  # 2 секунды между запусками
                    )
                    logger.info(f"[TASK] Scheduled processing for doc_id={new_doc_id} (delay={i*2}s)")
                except Exception as e:
                    logger.error(f"[TASK] Failed to schedule processing for doc_id={new_doc_id}: {e}")
            
            _log_t("TOTAL (archive unpacked)", total_start)
            return  # Завершаем обработку архива
        
        else:
            # ОДИНОЧНЫЙ ФАЙЛ
            normalized = normalized_result
            logger.info(f"[TASK] Processing single file: {normalized['filename']}, size: {len(normalized['data'])}")

        # Удалить исходный файл
        t0 = _t()
        if doc.file and os.path.exists(file_path):
            try:
                doc.file.delete(save=False)
                logger.info(f"[TASK] Original deleted via .delete(): {file_path}")
            except Exception as e:
                logger.warning(f"[TASK] Couldn't delete via delete(): {file_path}: {e}")
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logger.info(f"[TASK] Original deleted manually: {file_path}")
                except Exception as e:
                    logger.warning(f"[TASK] Couldn't manually delete original: {file_path}: {e}")
        _log_t("Delete original", t0)

        # Сохранить нормализованный файл
        t0 = _t()
        doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
        doc.save(update_fields=['file'])
        doc.refresh_from_db()
        logger.info(f"[TASK] After save: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
        _log_t("Save normalized to model field", t0)

        file_path = doc.file.path
        original_filename = doc.file.name
        data = normalized['data']

        preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
        logger.info(f"[TASK] Preview URL: {preview_url}")

        # # 3) Определить content_type
        # t0 = _t()
        # content_type = getattr(doc.file.file, 'content_type', None)
        # if not content_type:
        #     if file_path.lower().endswith('.pdf'):
        #         content_type = 'application/pdf'
        #     elif file_path.lower().endswith(('.jpg', '.jpeg')):
        #         content_type = 'image/jpeg'
        #     elif file_path.lower().endswith('.png'):
        #         content_type = 'image/png'
        # logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")
        # _log_t("Detect content_type", t0)

        # # 4) Если PDF — конвертация в PNG
        # data = file_bytes
        # if content_type == 'application/pdf':
        #     class FakeUpload:
        #         def __init__(self, name, content, content_type):
        #             self.name = name
        #             self._content = content
        #             self.content_type = content_type
        #             self._read = False
        #         def read(self):
        #             if not self._read:
        #                 self._read = True
        #                 return self._content
        #             return b''

        #     fake_file = FakeUpload(original_filename, file_bytes, content_type)

        #     t0 = _t()
        #     try:
        #         normalized = normalize_uploaded_file(fake_file)
        #         logger.info(f"[TASK] PDF normalized to PNG: {normalized['filename']}, size: {len(normalized['data'])}")
        #     except Exception:
        #         logger.exception(f"[TASK] Failed to normalize PDF: {original_filename}")
        #         raise
        #     _log_t("PDF→PNG normalize", t0)

        #     # удалить исходный PDF
        #     t0 = _t()
        #     if doc.file and os.path.exists(file_path):
        #         try:
        #             doc.file.delete(save=False)
        #             logger.info(f"[TASK] PDF deleted via .delete(): {file_path}")
        #         except Exception as e:
        #             logger.warning(f"[TASK] Couldn't delete PDF via delete(): {file_path}: {e}")
        #         if os.path.exists(file_path):
        #             try:
        #                 os.remove(file_path)
        #                 logger.info(f"[TASK] PDF deleted manually: {file_path}")
        #             except Exception as e:
        #                 logger.warning(f"[TASK] Couldn't manually delete PDF: {file_path}: {e}")
        #     _log_t("Delete original PDF", t0)

        #     # сохранить PNG
        #     t0 = _t()
        #     doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
        #     logger.info(f"[TASK] PNG saved: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
        #     doc.content_type = normalized['content_type']
        #     doc.save()
        #     doc.refresh_from_db()
        #     logger.info(f"[TASK] After refresh: doc.file.name={doc.file.name}, doc.file.path={doc.file.path}, exists? {os.path.exists(doc.file.path)}")
        #     _log_t("Save PNG to model field", t0)

        #     file_path = doc.file.path
        #     original_filename = doc.file.name
        #     data = normalized['data']
        # else:
        #     logger.info(f"[TASK] Not a PDF, using as is: {original_filename}")

        # # 5) preview_url
        # t0 = _t()
        # preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
        # _log_t("Build preview_url", t0)

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

        # if similarity_percent > 98:
        #     t0 = _t()
        #     if similar_doc_id:
        #         doc.status = 'rejected'
        #         doc.error_message = f"Potencialus dublikatas (>98% panašumas) su dokumentu ID {similar_doc_id}"
        #     else:
        #         doc.status = 'rejected'
        #         doc.error_message = "Potencialus dublikatas (>98% panašumas)"
        #     doc.save(update_fields=['status', 'error_message'])
        #     _log_t("Save rejected (duplicate)", t0)
        #     logger.info(f"[TASK] Rejected as duplicate{f' of document {similar_doc_id}' if similar_doc_id else ''}")
        #     _log_t("TOTAL", total_start)
        #     return

        # Если похожесть высокая (>=95%), пробуем быстро вытащить серию/номер и проверить дубликат
        if similarity_percent >= 95:
            t0 = _t()
            prompt = (
                "You are given OCRed text of a single Lithuanian accounting document (invoice/receipt).\n"
                "Extract two fields ONLY and return STRICT JSON with EXACT keys:\n"
                '{\n  "document_series": string|null,\n  "document_number": string|null\n}\n'
                "Rules:\n"
                "- If series is absent, set document_series to null.\n"
                "- If number is absent, set document_number to null.\n"
                "- Respond with pure JSON. Do NOT use markdown code fences."
            )
            try:
                resp = ask_gemini_with_retry(
                    text=doc.glued_raw_text or "",
                    prompt=prompt,
                    model="gemini-2.5-flash-lite",
                    logger=logger,
                )
                _log_t("Gemini-lite extract (series/number, high-sim)", t0)
                logger.info(f"[DUP-CHECK] gemini-lite extract resp preview={repr((resp or '')[:200])}")

                data = _extract_json_object(resp or "")
                series_ex = normalize_code_field((data.get("document_series") or "")) or None
                number_ex = normalize_code_field((data.get("document_number") or "")) or None

                if not series_ex and not number_ex:
                    logger.info("[DUP-CHECK] gemini-lite returned empty → skip duplicate check")
                else:
                    t1 = _t()
                    if is_duplicate_by_series_number(user, number_ex, series_ex, exclude_doc_id=doc.pk):
                        doc.status = 'rejected'
                        doc.error_message = ("Dublikatas: dokumentas su tokia serija ir numeriu jau buvo įkeltas"
                                            if series_ex else
                                            "Dublikatas: dokumentas su tokiu numeriu jau buvo įkeltas")
                        if not getattr(doc, "preview_url", None):
                            doc.preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
                        doc.save(update_fields=['status', 'error_message', 'preview_url'])
                        _log_t("Duplicate check (series/number @95%+)", t1)
                        logger.info("[TASK] Rejected as duplicate by series/number on high similarity (no credits deducted)")
                        _log_t("TOTAL", total_start)
                        return
                    _log_t("Duplicate check (series/number passed @95%+)", t1)

            except Exception as e:
                logger.warning(f"[DUP-CHECK] gemini-lite extract failed: {e} — skipping duplicate check")


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

        # # 11) Сохранить сырой JSON от LLM
        # t0 = _t()
        # doc.gpt_raw_json = llm_resp
        # doc.save(update_fields=['gpt_raw_json'])
        # _log_t("Save gpt_raw_json", t0)

        # 11) Сохранить сырой JSON от LLM
        t0 = _t()
        doc.gpt_raw_json = llm_resp
        doc.save(update_fields=['gpt_raw_json'])
        logger.info(f"[LLM] Saved gpt_raw_json: source={source_model} len={len(llm_resp or '')} preview={repr((llm_resp or '')[:200])}")
        _log_t("Save gpt_raw_json", t0)

        # 12) Парсинг JSON + ретрай на gemini-2.5-lite при ОБРЫВЕ
        t0 = _t()
        try:
            structured = parse_llm_json_robust(llm_resp)
        except Exception as parse_err:
            _log_t("Parse JSON (failed)", t0)
            logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")

            did_repair = False

            # Если ответ выглядит как ОБРЫВ — пробуем починить через gemini-2.5-lite
            if is_truncated_json(llm_resp or "") and (glued_text_for_db or ""):
                try:
                    t_fix = _t()
                    fixed_json = repair_truncated_json_with_gemini_lite(
                        broken_json=llm_resp or "",
                        glued_raw_text=glued_text_for_db or "",
                        logger=logger,
                    )
                    _log_t("Gemini-2.5-lite repair (retry on truncated)", t_fix)

                    # сохраним отремонтированный сырец
                    t_sv = _t()
                    doc.gpt_raw_json = fixed_json
                    doc.save(update_fields=['gpt_raw_json'])
                    _log_t("Save gpt_raw_json (repaired)", t_sv)

                    # парсим починенный JSON
                    t_px = _t()
                    structured = parse_llm_json_robust(fixed_json)
                    _log_t("Parse JSON (after repair)", t_px)

                    source_model = "gemini-2.5-lite"
                    did_repair = True

                except Exception as fix_err:
                    logger.warning(f"[TASK] Repair with gemini-2.5-lite failed: {fix_err}")

            # Если не обрыв или ремонт не удался — идём по прежнему GPT-фолбэку
            if not did_repair:
                if source_model != "gpt-4.1":
                    t1 = _t()
                    prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
                    gpt_resp = ask_gpt_with_retry(glued_text_for_db or "", prompt, max_retries=1, wait_seconds=30)
                    _log_t("LLM (GPT retry after parse fail)", t1)

                    t2 = _t()
                    doc.gpt_raw_json = gpt_resp
                    doc.save(update_fields=['gpt_raw_json'])
                    _log_t("Save gpt_raw_json (after GPT retry)", t2)

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

        # truncated_json=true lineitems=20 total_lines >20, otsylajem povtorno v gemini 2.5 lite

        # === ДОБАВИТЬ ЗДЕСЬ: авто-достройка при truncated_json ===
        try:
            # безопасно читаем truncated_json (поддержим bool/строку)
            tj = structured.get("truncated_json")
            truncated_flag = (tj is True) or (isinstance(tj, str) and tj.strip().lower() == "true")

            # total_lines может быть str/None → приводим к int
            try:
                total_lines = int(structured.get("total_lines") or 0)
            except Exception:
                total_lines = 0

            # фактическое количество line_items, уже извлечённых в текущем JSON
            current_items_count = _count_line_items(structured)

            # повторим в Lite, если ХОТЯ БЫ ОДНО условие истинно:
            # 1) модель явно поставила truncated_json:true
            # ИЛИ
            # 2) total_lines > фактического числа line_items
            need_full = False
            if truncated_flag:
                need_full = True
            elif total_lines > 0 and total_lines > current_items_count:
                need_full = True

            # (опционально) ограничим абсурдные значения total_lines
            MAX_ALLOWED_LINES = 500
            if total_lines > MAX_ALLOWED_LINES:
                logger.warning("[LLM] total_lines=%s exceeds sanity limit=%s → skip full request",
                            total_lines, MAX_ALLOWED_LINES)
                need_full = False

            if need_full:
                logger.info(
                    "[LLM] Need full JSON via gemini-2.5-flash-lite: truncated=%s items=%s total_lines=%s",
                    truncated_flag, current_items_count, total_lines
                )
                t_full = _t()
                full_json_resp = request_full_json_with_gemini_lite(
                    glued_raw_text=glued_text_for_db or "",
                    previous_json=doc.gpt_raw_json or llm_resp or "",
                    logger=logger,
                )
                _log_t("Gemini-2.5-lite full JSON (follow-up)", t_full)

                if full_json_resp and full_json_resp.strip():
                    # сохраним сырец и перепарсим
                    t_sv = _t()
                    doc.gpt_raw_json = full_json_resp
                    doc.save(update_fields=['gpt_raw_json'])
                    _log_t("Save gpt_raw_json (full)", t_sv)

                    t_px = _t()
                    structured = parse_llm_json_robust(full_json_resp)
                    _log_t("Parse JSON (full)", t_px)

                    # финальный контроль — теперь должно совпадать
                    final_count = _count_line_items(structured)
                    logger.info("[LLM] After full request: items=%s total_lines=%s",
                                final_count, int(structured.get("total_lines") or 0))
                else:
                    logger.warning("[LLM] Empty response from gemini-2.5-lite full JSON request; keep truncated result as-is.")
            else:
                logger.info("[LLM] No full-json re-request: truncated=%s items=%s total_lines=%s",
                            truncated_flag, current_items_count, total_lines)

        except Exception as e:
            logger.warning(f"[LLM] Full JSON re-request skipped due to error: {e}")




        # # 12) Парсинг JSON
        # t0 = _t()
        # try:
        #     structured = parse_llm_json_robust(llm_resp)
        # except Exception as parse_err:
        #     _log_t("Parse JSON (failed)", t0)
        #     logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")
        #     if source_model != "gpt-4.1":
        #         t1 = _t()
        #         prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
        #         gpt_resp = ask_gpt_with_retry(glued_text_for_db or "", prompt, max_retries=1, wait_seconds=30)
        #         _log_t("LLM (GPT retry after parse fail)", t1)

        #         t2 = _t()
        #         doc.gpt_raw_json = gpt_resp
        #         doc.save(update_fields=['gpt_raw_json'])
        #         _log_t("Save gpt_raw_json (after retry)", t2)

        #         t3 = _t()
        #         structured = parse_llm_json_robust(gpt_resp)
        #         _log_t("Parse JSON (retry GPT)", t3)
        #         source_model = "gpt-4.1"
        #     else:
        #         t1 = _t()
        #         doc.status = 'rejected'
        #         doc.error_message = "JSON klaida iš LLM"
        #         doc.preview_url = preview_url
        #         doc.save()
        #         _log_t("Save rejected (JSON parse error)", t1)
        #         _log_t("TOTAL", total_start)
        #         return
        # else:
        #     _log_t("Parse JSON", t0)

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

        # # 13.2) Если отдельный VAT выключен, а у строк VAT пустой — раздать документный VAT по строкам
        # from .validators.amount_validator import distribute_vat_from_document

        # t0 = _t()
        # doc_struct = documents[0]
        # doc_struct = distribute_vat_from_document(doc_struct)
        # _log_t("Distribute VAT from document to line_items", t0)


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

    except SoftTimeLimitExceeded as e:
        logger.error(
            "[TASK] Soft time limit exceeded for doc_id=%s (soft=%ss, hard=%ss): %s",
            doc_id,
            getattr(self.request, "soft_time_limit", None),
            getattr(self.request, "time_limit", None),
            e,
        )
        try:
            t0 = _t()
            doc = ScannedDocument.objects.filter(pk=doc_id).first()
            if doc:
                doc.status = 'rejected'
                doc.error_message = "Operacija nutraukta: viršytas užduoties laiko limitas (soft time limit)."
                if not getattr(doc, "preview_url", None):
                    try:
                        doc.preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
                    except Exception:
                        pass
                doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _log_t("Save rejected (soft time limit)", t0)
        finally:
            _log_t("TOTAL (soft time limit path)", total_start)
        return

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

