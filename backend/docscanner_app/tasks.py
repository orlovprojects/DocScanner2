# tasks.py
import os
import time
import uuid
import json
import re
import logging
import logging.config
from django.db.models import F
from decimal import Decimal

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from .models import ScannedDocument, CustomUser, UploadSession, CreditUsageLog

from .utils.ocr import get_ocr_text as get_ocr_text_gcv
from .utils.gemini_ocr import get_ocr_text_gemini
from .utils.doc_type import detect_doc_type

from .utils.gpt import ask_gpt_with_retry, DEFAULT_PROMPT, DETAILED_PROMPT
from .utils.gemini import (
    GEMINI_DEFAULT_PROMPT,
    GEMINI_DETAILED_PROMPT,
    ask_gemini_with_retry,
    is_truncated_json,
    repair_truncated_json_with_gemini_lite,
    request_full_json_with_gemini_lite,
)
from .utils.mercury import ask_mercury_with_retry

from .utils.grok import (
    ask_grok_with_retry,
    repair_truncated_json_with_grok,
    request_full_json_with_grok,
)
from .utils.mimo import (
    ask_mimo_with_retry,
)
from .utils.novita import ask_novita_with_retry

from .utils.similarity import calculate_max_similarity_percent
from .utils.save_document import update_scanned_document, _apply_sumiskai_defaults_from_user
from .utils.llm_json import parse_llm_json_robust
from .utils.duplicates import is_duplicate_by_series_number
from .utils.parsers import normalize_code_field
from .utils.file_converter import normalize_any, ArchiveLimitError, MAX_SINGLE_FILE_BYTES

from .validators.company_matcher import update_seller_buyer_info
from .validators.verify_lt_company_match import update_seller_buyer_info_from_companies




logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')


COST = {
    "sumiskai": Decimal("1.00"),
    "detaliai": Decimal("1.30"),
}

def _doc_cost(scan_type: str) -> Decimal:
    return COST.get((scan_type or "").strip(), Decimal("1.00"))

@transaction.atomic
def settle_session_for_doc(doc_id: int):
    # Сначала получаем doc БЕЗ select_for_update на связанных таблицах
    doc = ScannedDocument.objects.select_for_update().get(id=doc_id)

    if not doc.upload_session_id:
        return
    if doc.counted_in_session:
        return

    # Отдельно блокируем session и user
    s = UploadSession.objects.select_for_update().get(id=doc.upload_session_id)
    u = CustomUser.objects.select_for_update().get(id=doc.user_id)

    cost = _doc_cost(doc.scan_type)

    # === 1) архив-контейнер ===
    if doc.is_archive_container:
        s.pending_archives = max((s.pending_archives or 0) - 1, 0)

        if doc.status in ("rejected", "failed"):
            actual_children = ScannedDocument.objects.filter(
                parent_document=doc,
            ).count()

            unrealized = max((doc.archive_file_count or 0) - actual_children, 0)
            release = _doc_cost(doc.scan_type) * Decimal(unrealized)

            if release > 0:
                u.credits_reserved = max(
                    (u.credits_reserved or Decimal("0")) - release,
                    Decimal("0")
                )
                s.reserved_credits = max(
                    (s.reserved_credits or Decimal("0")) - release,
                    Decimal("0")
                )
                u.save(update_fields=["credits_reserved"])

        doc.counted_in_session = True
        s.save(update_fields=["pending_archives", "reserved_credits", "updated_at"])
        doc.save(update_fields=["counted_in_session"])
        return

    # === 2) обычный документ (включая распакованные из архива) ===
    s.processed_items = (s.processed_items or 0) + 1

    # Успех = статус completed/exported И прошла валидация И готов к экспорту
    success = (
        doc.status in ("completed", "exported")
        and getattr(doc, 'math_validation_passed', None) is True
        and getattr(doc, 'ready_for_export', None) is True
    )
    
    if success:
        s.done_items = (s.done_items or 0) + 1
        u.credits = (u.credits or Decimal("0")) - cost
        # --- audit log ---
        CreditUsageLog.objects.create(
            user=u,
            scanned_document=doc,
            credits_used=cost,
            document_filename=doc.original_filename or '',
        )
    else:
        s.failed_items = (s.failed_items or 0) + 1

    u.credits_reserved = max((u.credits_reserved or Decimal("0")) - cost, Decimal("0"))
    s.reserved_credits = max((s.reserved_credits or Decimal("0")) - cost, Decimal("0"))

    doc.counted_in_session = True

    u.save(update_fields=["credits", "credits_reserved"])
    s.save(update_fields=["processed_items", "done_items", "failed_items", "reserved_credits", "updated_at"])
    doc.save(update_fields=["counted_in_session"])






def maybe_finish_session_async(session_id):
    if not session_id:
        return
    finish_session_task.delay(str(session_id))

@shared_task
def finish_session_task(session_id: str):
    _maybe_finish_session(session_id)

@transaction.atomic
def _maybe_finish_session(session_id: str):
    s = UploadSession.objects.select_for_update().get(id=session_id)

    if s.stage != "processing":
        return

    pending = s.pending_archives or 0
    actual = s.actual_items or 0
    processed = s.processed_items or 0

    normal_done = (pending == 0 and actual > 0 and processed >= actual)
    empty_done = (pending == 0 and actual == 0)

    if normal_done or empty_done:
        s.stage = "done" if normal_done else "failed"
        s.finished_at = timezone.now()

        if s.reserved_credits > 0:
            u = CustomUser.objects.select_for_update().get(id=s.user_id)
            u.credits_reserved = max(
                (u.credits_reserved or Decimal("0")) - s.reserved_credits,
                Decimal("0")
            )
            u.save(update_fields=["credits_reserved"])
            s.reserved_credits = Decimal("0")

        s.save(update_fields=[
            "stage", "finished_at", "reserved_credits", "updated_at"
        ])
        kick_next_session_task.delay(s.user_id)

@shared_task
def kick_next_session_task(user_id: int):
    maybe_start_next_session(user_id)

@transaction.atomic
def maybe_start_next_session(user_id: int):
    # если уже есть processing — ничего не делаем
    if UploadSession.objects.filter(user_id=user_id, stage="processing").exists():
        return

    nxt = (
        UploadSession.objects
        .select_for_update()
        .filter(user_id=user_id, stage="queued")
        .order_by("created_at")
        .first()
    )
    if not nxt:
        return

    nxt.stage = "processing"
    if not nxt.started_at:
        nxt.started_at = timezone.now()
    nxt.save(update_fields=["stage", "started_at", "updated_at"])

    # запускаем обработку
    start_session_processing.delay(str(nxt.id))


def _settle_and_finish_if_session(doc: ScannedDocument):
    if not doc:
        return
    if not getattr(doc, "upload_session_id", None):
        return
    try:
        settle_session_for_doc(doc.id)
    finally:
        maybe_finish_session_async(doc.upload_session_id)






















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
    Routing:
    - Если detaliai И текст > 5000 chars → primary: gemini-3.1-flash-lite-preview
    - Иначе → primary: gemini-2.5-flash
    - Secondary всегда: gemini-3.1-flash-lite-preview (кроме случая когда он уже primary, тогда gemini-2.5-flash-lite)
    - Final fallback: GPT
    """
    try:
        gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
    except NameError:
        gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

    text_len = len(raw_text or "")
    use_31_as_primary = (scan_type == "detaliai" and text_len > 5000)

    if use_31_as_primary:
        primary_model   = "gemini-3.1-flash-lite-preview"
        secondary_model = "gemini-2.5-flash-lite"
    else:
        primary_model   = "gemini-2.5-flash"
        secondary_model = "gemini-3.1-flash-lite-preview"

    logger.info(
        "[LLM] Routing: scan_type=%s text_len=%d → primary=%s secondary=%s",
        scan_type, text_len, primary_model, secondary_model,
    )

    # 1) Primary
    try:
        t0 = _t()
        logger.info(f"[LLM] Try primary model={primary_model}")
        resp = ask_gemini_with_retry(
            text=raw_text,
            prompt=gemini_prompt,
            model=primary_model,
            logger=logger,
        )
        _log_t("LLM (primary)", t0)
        logger.info(f"[LLM] Primary OK: len={len(resp or '')} preview={repr((resp or '')[:200])}")
        if resp and resp.strip():
            return resp, primary_model
        logger.warning("[LLM] Primary returned empty → try secondary")
    except Exception as e:
        logger.warning(f"[LLM] Primary failed: {e} → try secondary")

    # 2) Secondary
    try:
        t0 = _t()
        logger.info(f"[LLM] Try secondary model={secondary_model}")
        resp2 = ask_gemini_with_retry(
            text=raw_text,
            prompt=gemini_prompt,
            model=secondary_model,
            logger=logger,
        )
        _log_t("LLM (secondary)", t0)
        logger.info(f"[LLM] Secondary OK: len={len(resp2 or '')} preview={repr((resp2 or '')[:200])}")
        if resp2 and resp2.strip():
            return resp2, secondary_model
        logger.warning("[LLM] Secondary returned empty → fallback to GPT")
    except Exception as e:
        logger.warning(f"[LLM] Secondary failed: {e} → fallback to GPT")

    # 3) GPT
    gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
    t0 = _t()
    gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
    _log_t("LLM (GPT fallback)", t0)
    logger.info(f"[LLM] GPT fallback OK: len={len(gpt_resp or '')} preview={repr((gpt_resp or '')[:200])}")
    return gpt_resp, "gpt"


@shared_task
def start_session_processing(session_id: str):
    to_process = []
    scan_type = None

    with transaction.atomic():
        s = UploadSession.objects.select_for_update().get(id=session_id)
        scan_type = s.scan_type

        qs = (
            ScannedDocument.objects
            .select_for_update()
            .filter(upload_session=s, status="pending")
            .only("id", "user_id")
        )
        docs = list(qs)

        if not docs:
            return

        doc_ids = [d.id for d in docs]

        total_cnt = len(doc_ids)
        arch_cnt = ScannedDocument.objects.filter(id__in=doc_ids, is_archive_container=True).count()
        normal_cnt = total_cnt - arch_cnt

        # чтобы не запустить повторно
        ScannedDocument.objects.filter(id__in=doc_ids).update(status="processing")

        if arch_cnt:
            UploadSession.objects.filter(id=s.id).update(pending_archives=F("pending_archives") + arch_cnt)

        if normal_cnt:
            UploadSession.objects.filter(id=s.id).update(actual_items=F("actual_items") + normal_cnt)


        to_process = [(d.user_id, d.id) for d in docs]

    # вне транзакции
    for user_id, doc_id in to_process:
        process_uploaded_file_task.delay(user_id, doc_id, scan_type)





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
            from .utils.file_converter import normalize_any, ArchiveLimitError
            normalized_result = normalize_any(fake_file)
            _log_t("Normalize uploaded file", t0)
            
        except ArchiveLimitError as e:
            # НОВОЕ: Слишком много файлов в архиве — критическая ошибка
            _log_t("Normalize failed (archive limit)", t0)
            t1 = _t()
            doc.status = 'rejected'
            doc.error_message = str(e)  # "Per daug failų archyve: 2500 (max 2000)"
            doc.preview_url = None
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _settle_and_finish_if_session(doc)
            _log_t("Save rejected (archive limit)", t1)
            logger.info(f"[TASK] Rejected archive limit exceeded: {original_filename} - {str(e)}")
            _log_t("TOTAL", total_start)
            return
            
        except ValueError as e:
            # Неподдерживаемый формат
            _log_t("Normalize failed (unsupported format)", t0)
            t1 = _t()
            doc.status = 'rejected'
            doc.error_message = f"Nepalaikomas failo formatas: {str(e)}"
            doc.preview_url = None
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _settle_and_finish_if_session(doc)
            _log_t("Save rejected (unsupported format)", t1)
            logger.info(f"[TASK] Rejected unsupported format: {original_filename} - {str(e)}")
            _log_t("TOTAL", total_start)
            return
            
        except Exception as e:
            # Другие ошибки нормализации
            _log_t("Normalize failed (error)", t0)
            logger.exception(f"[TASK] Failed to normalize: {original_filename}")
            t1 = _t()
            doc.status = 'rejected'
            doc.error_message = f"Klaida apdorojant failą: {str(e)}"
            doc.preview_url = None
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _settle_and_finish_if_session(doc)
            _log_t("Save rejected (normalize error)", t1)
            _log_t("TOTAL", total_start)
            return

        # 5) Обработка результата нормализации
        if isinstance(normalized_result, list):
            # ============================================================
            # АРХИВ С МНОЖЕСТВЕННЫМИ ФАЙЛАМИ
            # ============================================================
            file_count = len(normalized_result)
            logger.info(f"[TASK] Archive contains {file_count} processable files")
            archive_skipped_data = {}
            if normalized_result and '_archive_skipped' in normalized_result[0]:
                archive_skipped_data = normalized_result[0].pop('_archive_skipped', {})

            skipped_too_large = archive_skipped_data.get('too_large', [])
            skipped_unsupported = archive_skipped_data.get('unsupported', [])

            has_skipped = len(skipped_too_large) > 0 or len(skipped_unsupported) > 0

            if has_skipped:
                logger.info(f"[TASK] Archive skipped: {len(skipped_too_large)} too large, {len(skipped_unsupported)} unsupported")
            
            if file_count == 0:
                # Пустой архив
                t1 = _t()
                doc.status = 'rejected'
                doc.error_message = "Archyve nerasta palaikomų failų"
                doc.preview_url = None
                doc.save(update_fields=['status', 'error_message', 'preview_url'])
                _settle_and_finish_if_session(doc)
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
            
            doc.is_archive_container = True

            if has_skipped:
                doc.status = "rejected"
                
                # Формируем сообщение об ошибках
                error_parts = []
                
                if skipped_too_large:
                    count = len(skipped_too_large)
                    names = [f['name'] for f in skipped_too_large[:3]]
                    names_str = ', '.join(names)
                    if count > 3:
                        names_str += f" ir dar {count - 3}..."
                    error_parts.append(f"{count} per didelių failų (>{MAX_SINGLE_FILE_BYTES // (1024*1024)} MB): {names_str}")
                
                if skipped_unsupported:
                    count = len(skipped_unsupported)
                    names = [f['name'] for f in skipped_unsupported[:3]]
                    names_str = ', '.join(names)
                    if count > 3:
                        names_str += f" ir dar {count - 3}..."
                    error_parts.append(f"{count} nepalaikomų failų: {names_str}")
                
                doc.error_message = "Praleista: " + "; ".join(error_parts)
            else:
                doc.status = "completed"
                doc.error_message = None

            doc.preview_url = None
            doc.save(update_fields=["is_archive_container", "status", "error_message", "preview_url"])
            
            # Создаём отдельные ScannedDocument для каждого файла
            created_docs = []
            for i, normalized_file in enumerate(normalized_result, start=1):
                try:
                    t2 = _t()
                    
                    # Исправляем расширение: PDF→PNG после нормализации
                    orig_name = normalized_file.get('original_filename', f'file_{i}.bin')
                    new_ext = os.path.splitext(normalized_file['filename'])[1]
                    base_name = os.path.splitext(orig_name)[0]
                    corrected_filename = f"{base_name}{new_ext}"

                    # Создаём новый документ
                    new_doc = ScannedDocument.objects.create(
                        user=user,
                        original_filename=corrected_filename,  # ← ЗДЕСЬ используем corrected_filename
                        status='processing',
                        scan_type=scan_type,
                        upload_session=doc.upload_session,       
                        parent_document=doc,                     
                        is_archive_container=False,              
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
                        f"{corrected_filename} (original: {orig_name})"
                    )
                    
                except Exception as e:
                    logger.error(f"[TASK] Failed to create document for file {i}/{file_count}: {e}")
                    continue
            
            if not created_docs:
                logger.error(f"[TASK] Failed to create ANY documents from archive {original_filename}")
                _log_t("TOTAL (archive processing failed)", total_start)
                return
            
            if doc.upload_session_id:
                UploadSession.objects.filter(id=doc.upload_session_id).update(
                    actual_items=F("actual_items") + len(created_docs)
                )

            _settle_and_finish_if_session(doc)

            
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


        # 6) OCR: Google Vision → fallback Gemini OCR
        # t0 = _t()
        # # get_ocr_text_gcv возвращает: raw_json, joined_text, paragraphs, error
        # gcv_raw_json, gcv_joined_text, _, gcv_err = get_ocr_text_gcv(data, original_filename, logger)
        # _log_t("OCR (Google Vision)", t0)
        # logger.info("[TASK] GCV result: err=%s, raw_len=%s, text_len=%s",
        #     gcv_err, len(gcv_raw_json or ''), len(gcv_joined_text or ''))

        # if gcv_err or (not gcv_raw_json and not gcv_joined_text):
        #     logger.warning(f"[TASK] GCV failed or empty ({gcv_err or 'empty'}). Trying Gemini OCR...")
        #     t1 = _t()
        #     gemini_text, gemini_err = get_ocr_text_gemini(data, original_filename, logger)  # текст БЕЗ координат
        #     _log_t("OCR (Gemini OCR fallback)", t1)

        #     if gemini_err or not gemini_text:
        #         # финальная ошибка OCR
        #         t0 = _t()
        #         doc.status = 'rejected'
        #         doc.error_message = gemini_err or gcv_err or "OCR returned empty text"
        #         doc.preview_url = preview_url
        #         doc.save(update_fields=['status', 'error_message', 'preview_url'])
        #         _settle_and_finish_if_session(doc)
        #         _log_t("Save rejected (OCR error)", t0)
        #         logger.error(f"[TASK] OCR error (GCV+Gemini): {doc.error_message}")
        #         _log_t("TOTAL", total_start)
        #         return

        #     # fallback: координат нет → raw_text кладём сам текст, glued_raw_text тоже текст
        #     raw_json_for_db = gemini_text
        #     glued_text_for_db = gemini_text
        # else:
        #     # GCV успех: есть компактный JSON + склеенный текст
        #     raw_json_for_db = gcv_raw_json
        #     glued_text_for_db = gcv_joined_text

        # logger.info("[TASK] OCR lengths: raw=%s, glued=%s",
        #             len(raw_json_for_db or ""), len(glued_text_for_db or ""))

        t0 = _t()
        # get_ocr_text_gcv возвращает: raw_json, joined_text, paragraphs, error
        gcv_raw_json, gcv_joined_text, _, gcv_err = get_ocr_text_gcv(data, original_filename, logger)
        _log_t("OCR (Google Vision)", t0)
        logger.info("[TASK] GCV result: err=%s, raw_len=%s, text_len=%s",
            gcv_err, len(gcv_raw_json or ''), len(gcv_joined_text or ''))

        if gcv_err or (not gcv_raw_json and not gcv_joined_text):
            # ВРЕМЕННО: без fallback, чтобы увидеть ошибку GCV
            t0 = _t()
            doc.status = 'rejected'
            doc.error_message = f"GCV error: {gcv_err or 'empty result'}"
            doc.preview_url = preview_url
            doc.save(update_fields=['status', 'error_message', 'preview_url'])
            _settle_and_finish_if_session(doc)
            _log_t("Save rejected (GCV error, no fallback)", t0)
            logger.error("[TASK] GCV FAILED: err=%s, raw=%s, text=%s",
                gcv_err, len(gcv_raw_json or ''), len(gcv_joined_text or ''))
            _log_t("TOTAL", total_start)
            return

        raw_json_for_db = gcv_raw_json
        glued_text_for_db = gcv_joined_text

        logger.info("[TASK] OCR lengths: raw=%s, glued=%s",
                    len(raw_json_for_db or ""), len(glued_text_for_db or ""))

        ocr_mode = "UNKNOWN"
        line_collision = 0.0
        try:
            _meta = json.loads(gcv_raw_json or "{}").get("meta", {})
            ocr_mode = _meta.get("mode", "UNKNOWN")
            line_collision = float(_meta.get("metrics", {}).get("line_collision_ratio", 0))
        except Exception:
            pass
        logger.info("[TASK] GCV OCR mode=%s, line_collision=%.1f", ocr_mode, line_collision)

        need_enhanced_ocr = (ocr_mode == "FULLTEXT") or (line_collision > 22)

        if need_enhanced_ocr and data:
            t_m = _t()
            try:
                from .utils.enhanced_ocr import get_enhanced_ocr_text
                enhanced_text, enhanced_err = get_enhanced_ocr_text(
                    data, original_filename, logger
                )
                _log_t("OCR (Enhanced Gemini)", t_m)

                if enhanced_text and not enhanced_err:
                    doc.enhanced_ocr_text = enhanced_text
                    doc.enhanced_ocr_source = "gemini-flash-lite-latest"
                    doc.save(update_fields=["enhanced_ocr_text", "enhanced_ocr_source"])

                    glued_text_for_db = enhanced_text
                    logger.info(
                        "[TASK] Using enhanced OCR (gemini-flash-lite) for LLM (len=%d)",
                        len(enhanced_text),
                    )
                else:
                    logger.warning(
                        "[TASK] Enhanced OCR failed: %s — using GCV text",
                        enhanced_err,
                    )
            except Exception as e:
                _log_t("OCR (Enhanced Gemini, failed)", t_m)
                logger.warning("[TASK] Enhanced OCR exception: %s", e)
        else:
            logger.info("[TASK] No enhanced OCR needed: mode=%s collision=%.1f", ocr_mode, line_collision)

        # 7) Ранний reject по типу документа (по склеенному тексту)
        t0 = _t()
        found_type = detect_doc_type(glued_text_for_db or "")
        _log_t("Detect doc type", t0)
        if found_type:
            t0 = _t()
            doc.status = 'rejected'
            doc.error_message = f"Potenciali {found_type}"
            doc.raw_text = raw_json_for_db
            doc.glued_raw_text = gcv_joined_text
            doc.preview_url = preview_url
            doc.save(update_fields=['status', 'error_message', 'raw_text', 'glued_raw_text', 'preview_url'])
            _settle_and_finish_if_session(doc)
            _log_t("Save rejected (doc type)", t0)
            logger.info(f"[TASK] Rejected due to type: {found_type}")
            _log_t("TOTAL", total_start)
            return

        # 8) Сохранить OCR результаты
        t0 = _t()
        doc.raw_text = raw_json_for_db
        doc.glued_raw_text = gcv_joined_text   
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
                
                logger.info(f"[DUP-CHECK] Extracted: series={repr(series_ex)}, number={repr(number_ex)}")

                if not series_ex and not number_ex:
                    logger.info("[DUP-CHECK] gemini-lite returned empty → skip duplicate check")
                else:
                    t1 = _t()
                    # Проверяем только серию/номер без контрагентов (они еще не распознаны)
                    is_dup = is_duplicate_by_series_number(
                        user, 
                        number_ex, 
                        series_ex, 
                        exclude_doc_id=doc.pk,
                        check_parties=False  # ← КЛЮЧЕВОЕ ИЗМЕНЕНИЕ
                    )
                    logger.info(f"[DUP-CHECK] is_duplicate_by_series_number(check_parties=False) returned: {is_dup}")
                    
                    if is_dup:
                        doc.status = 'rejected'
                        doc.error_message = ("Dublikatas: dokumentas su tokia serija ir numeriu jau buvo įkeltas"
                                            if series_ex else
                                            "Dublikatas: dokumentas su tokiu numeriu jau buvo įkeltas")
                        if not getattr(doc, "preview_url", None):
                            doc.preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
                        doc.save(update_fields=['status', 'error_message', 'preview_url'])
                        _settle_and_finish_if_session(doc)
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

                    source_model = "gemini-2.5-flash-lite"
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
                    doc.save(update_fields=["status", "error_message", "preview_url"])
                    _settle_and_finish_if_session(doc)
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
            _settle_and_finish_if_session(doc)
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
            _settle_and_finish_if_session(doc)
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

        # 16) НОВОЕ: Оптимизация preview
        t0 = _t()
        try:
            from .utils.preview_optimizer import optimize_preview_for_document
            
            if doc.file and os.path.exists(doc.file.path):
                file_size = os.path.getsize(doc.file.path)
                if file_size > 150_000:  # > 150KB
                    logger.info(f"[TASK] Optimizing preview: {file_size} bytes")
                    optimize_preview_for_document(doc)
                    # ВАЖНО: обновляем preview_url после оптимизации
                    preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
                    doc.preview_url = preview_url
                    doc.save(update_fields=['preview_url'])
                    logger.info(f"[TASK] Updated preview_url after optimization: {preview_url}")
        except Exception as e:
            logger.warning(f"[TASK] Preview optimization failed: {e}")
        _log_t("Optimize preview", t0)                          

        # 17) Списание/освобождение резервов + финализация сессии
        t0 = _t()
        doc.refresh_from_db(fields=["id", "status", "upload_session_id"])  # чтобы видеть финальный статус
        if doc.upload_session_id:
            _settle_and_finish_if_session(doc)
        else:
            # legacy режим без upload_session
            credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
            user.credits -= credits_per_doc
            user.save(update_fields=["credits"])
            CreditUsageLog.objects.create(
                user=user,
                scanned_document=doc,
                credits_used=credits_per_doc,
                document_filename=doc.original_filename or '',
            )
        _log_t("Finalize credits/session", t0)

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
                _settle_and_finish_if_session(doc)
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
                doc.save(update_fields=["status", "error_message"])  # фиксируем ошибку
                _settle_and_finish_if_session(doc)
            _log_t("Save rejected (exception path)", t0)
        finally:
            _log_t("TOTAL (exception path)", total_start)

















# logging.config.dictConfig(settings.LOGGING)
# logger = logging.getLogger('docscanner_app')


# COST = {
#     "sumiskai": Decimal("1.00"),
#     "detaliai": Decimal("1.30"),
# }

# def _doc_cost(scan_type: str) -> Decimal:
#     return COST.get((scan_type or "").strip(), Decimal("1.00"))

# @transaction.atomic
# def settle_session_for_doc(doc_id: int):
#     # Сначала получаем doc БЕЗ select_for_update на связанных таблицах
#     doc = ScannedDocument.objects.select_for_update().get(id=doc_id)

#     if not doc.upload_session_id:
#         return
#     if doc.counted_in_session:
#         return

#     # Отдельно блокируем session и user
#     s = UploadSession.objects.select_for_update().get(id=doc.upload_session_id)
#     u = CustomUser.objects.select_for_update().get(id=doc.user_id)

#     cost = _doc_cost(doc.scan_type)

#     # === 1) архив-контейнер ===
#     if doc.is_archive_container:
#         # НЕ трогаем credits_reserved и reserved_credits!
#         # Кредиты резервировались за файлы ВНУТРИ архива, не за сам контейнер.
#         # Освобождение кредитов произойдёт когда обработаются распакованные файлы.
#         s.pending_archives = max((s.pending_archives or 0) - 1, 0)

#         doc.counted_in_session = True

#         s.save(update_fields=["pending_archives", "updated_at"])
#         doc.save(update_fields=["counted_in_session"])
#         return

#     # === 2) обычный документ (включая распакованные из архива) ===
#     s.processed_items = (s.processed_items or 0) + 1

#     # Успех = статус completed/exported И прошла валидация И готов к экспорту
#     success = (
#         doc.status in ("completed", "exported")
#         and getattr(doc, 'math_validation_passed', None) is True
#         and getattr(doc, 'ready_for_export', None) is True
#     )
    
#     if success:
#         s.done_items = (s.done_items or 0) + 1
#         u.credits = (u.credits or Decimal("0")) - cost
#     else:
#         s.failed_items = (s.failed_items or 0) + 1

#     u.credits_reserved = max((u.credits_reserved or Decimal("0")) - cost, Decimal("0"))
#     s.reserved_credits = max((s.reserved_credits or Decimal("0")) - cost, Decimal("0"))

#     doc.counted_in_session = True

#     u.save(update_fields=["credits", "credits_reserved"])
#     s.save(update_fields=["processed_items", "done_items", "failed_items", "reserved_credits", "updated_at"])
#     doc.save(update_fields=["counted_in_session"])






# def maybe_finish_session_async(session_id):
#     if not session_id:
#         return
#     finish_session_task.delay(str(session_id))

# @shared_task
# def finish_session_task(session_id: str):
#     _maybe_finish_session(session_id)

# @transaction.atomic
# def _maybe_finish_session(session_id: str):
#     s = UploadSession.objects.select_for_update().get(id=session_id)

#     if s.stage != "processing":
#         return

#     # критерий завершения:
#     # - всё что поставили в работу (actual_items) обработано (processed_items)
#     # - и нет “висящих” архивов в распаковке
#     if (s.pending_archives or 0) == 0 and (s.actual_items or 0) > 0 and (s.processed_items or 0) >= (s.actual_items or 0):
#         s.stage = "done"
#         s.finished_at = timezone.now()
#         s.save(update_fields=["stage", "finished_at", "updated_at"])

#         kick_next_session_task.delay(s.user_id)

# @shared_task
# def kick_next_session_task(user_id: int):
#     maybe_start_next_session(user_id)

# @transaction.atomic
# def maybe_start_next_session(user_id: int):
#     # если уже есть processing — ничего не делаем
#     if UploadSession.objects.filter(user_id=user_id, stage="processing").exists():
#         return

#     nxt = (
#         UploadSession.objects
#         .select_for_update()
#         .filter(user_id=user_id, stage="queued")
#         .order_by("created_at")
#         .first()
#     )
#     if not nxt:
#         return

#     nxt.stage = "processing"
#     if not nxt.started_at:
#         nxt.started_at = timezone.now()
#     nxt.save(update_fields=["stage", "started_at", "updated_at"])

#     # запускаем обработку
#     start_session_processing.delay(str(nxt.id))


# def _settle_and_finish_if_session(doc: ScannedDocument):
#     if not doc:
#         return
#     if not getattr(doc, "upload_session_id", None):
#         return
#     try:
#         settle_session_for_doc(doc.id)
#     finally:
#         maybe_finish_session_async(doc.upload_session_id)






















# def _extract_json_object(s: str) -> dict:
#     """
#     Достаёт первый JSON-объект из строки:
#     - срезает markdown-код-блоки ```...```
#     - ищет первой парой фигурных скобок { ... }
#     - возвращает dict (или {} если не получилось)
#     """
#     if not s:
#         return {}

#     # убираем тройные кавычки кода ```...``` и префиксы типа "```json"
#     s = s.strip()
#     if s.startswith("```"):
#         # срежем обрамление ```...```
#         s = re.sub(r"^```[a-zA-Z]*\s*", "", s)  # уберём ``` или ```json
#         s = re.sub(r"\s*```$", "", s)

#     # найдём первый блок {...}
#     m = re.search(r"\{.*\}", s, flags=re.DOTALL)
#     if not m:
#         return {}

#     try:
#         return json.loads(m.group(0))
#     except Exception:
#         return {}
    

# def _count_line_items(structured: dict) -> int:
#     try:
#         docs = structured.get("documents") or []
#         cnt = 0
#         for d in docs:
#             li = d.get("line_items") or []
#             cnt += sum(1 for it in li if isinstance(it, dict))
#         return cnt
#     except Exception:
#         return 0
    
# def _count_chars_no_spaces(text: str) -> int:
#     # ignoriruem lyuboj whitespace: пробелы, \n, \t, etc.
#     if not text:
#         return 0
#     return len(re.sub(r"\s+", "", text))


# def _t():
#     return time.perf_counter()

# def _log_t(label: str, t0: float):
#     logger.info(f"[TIME] {label}: {time.perf_counter() - t0:.2f}s")


# def ask_llm_with_fallback_5000(raw_text: str, scan_type: str, logger):
#     """
#     Routing logic:
#       - detaliai + >5000 chars: Grok reasoning → GPT fallback
#       - detaliai + <=5000 chars: MiMo (thinking=True) → Grok → GPT
#       - sumiskai: MiMo (thinking=False) → Grok → GPT
#     """
#     text_length = len(raw_text)
#     is_detaliai = (scan_type == "detaliai")
    
#     # Import modules
#     try:
#         from .utils.mimo import MIMO_DEFAULT_PROMPT, MIMO_DETAILED_PROMPT, ask_mimo_with_retry
#     except Exception as e:
#         logger.warning(f"[LLM] Failed to import MiMo: {e}")
#         ask_mimo_with_retry = None

#     try:
#         from .utils.grok import GROK_DEFAULT_PROMPT, GROK_DETAILED_PROMPT, ask_grok_with_retry
#     except Exception as e:
#         logger.warning(f"[LLM] Failed to import Grok: {e}")
#         ask_grok_with_retry = None

#     # Prompts
#     mimo_prompt = MIMO_DETAILED_PROMPT if is_detaliai else MIMO_DEFAULT_PROMPT
#     grok_prompt = GROK_DETAILED_PROMPT if is_detaliai else GROK_DEFAULT_PROMPT
#     gpt_prompt = DETAILED_PROMPT if is_detaliai else DEFAULT_PROMPT

#     # Routing decision
#     use_grok_primary = (is_detaliai and text_length > 5000)
#     use_mimo_thinking = is_detaliai  # thinking только для detaliai
    
#     logger.info(
#         "[LLM] Router: scan_type=%s, len=%d, grok_primary=%s, mimo_thinking=%s",
#         scan_type, text_length, use_grok_primary, use_mimo_thinking
#     )

#     # === ROUTE A: detaliai + >5000 → Grok primary ===
#     if use_grok_primary:
#         if ask_grok_with_retry is not None:
#             try:
#                 t0 = _t()
#                 logger.info(f"[LLM] Grok primary (detaliai, len={text_length})")
#                 resp = ask_grok_with_retry(
#                     text=raw_text,
#                     prompt=grok_prompt,
#                     model="grok-4-1-fast-reasoning",
#                     temperature=0.3,
#                     max_tokens=30000,
#                     timeout_seconds=300,
#                     logger=logger,
#                 )
#                 _log_t("LLM (Grok primary)", t0)
#                 if resp and resp.strip():
#                     return resp, "grok-4-1-fast-reasoning"
#                 logger.warning("[LLM] Grok empty -> GPT fallback")
#             except Exception as e:
#                 logger.warning(f"[LLM] Grok failed: {e} -> GPT fallback")
#         else:
#             logger.warning("[LLM] Grok unavailable -> GPT fallback")

#         # GPT fallback
#         t0 = _t()
#         logger.info("[LLM] GPT fallback")
#         gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
#         _log_t("LLM (GPT fallback)", t0)
#         return gpt_resp, "gpt"

#     # === ROUTE B: sumiskai OR (detaliai + <=5000) → MiMo primary ===
#     else:
#         # 1) MiMo
#         if ask_mimo_with_retry is not None:
#             try:
#                 t0 = _t()
#                 logger.info(f"[LLM] MiMo primary (thinking={use_mimo_thinking}, len={text_length})")
#                 resp = ask_mimo_with_retry(
#                     text=raw_text,
#                     prompt=mimo_prompt,
#                     model="mimo-v2-flash",
#                     temperature=0.3,
#                     max_tokens=30000,
#                     timeout_seconds=300,
#                     enable_thinking=use_mimo_thinking,  # ← ВОТ ТУТ
#                     logger=logger,
#                 )
#                 _log_t("LLM (MiMo primary)", t0)
#                 if resp and resp.strip():
#                     return resp, "mimo-v2-flash"
#                 logger.warning("[LLM] MiMo empty -> Grok secondary")
#             except Exception as e:
#                 logger.warning(f"[LLM] MiMo failed: {e} -> Grok secondary")
#         else:
#             logger.warning("[LLM] MiMo unavailable -> Grok secondary")

#         # 2) Grok secondary
#         if ask_grok_with_retry is not None:
#             try:
#                 t0 = _t()
#                 logger.info("[LLM] Grok secondary")
#                 resp2 = ask_grok_with_retry(
#                     text=raw_text,
#                     prompt=grok_prompt,
#                     model="grok-4-1-fast-reasoning",
#                     temperature=0.3,
#                     max_tokens=30000,
#                     timeout_seconds=300,
#                     logger=logger,
#                 )
#                 _log_t("LLM (Grok secondary)", t0)
#                 if resp2 and resp2.strip():
#                     return resp2, "grok-4-1-fast-reasoning"
#                 logger.warning("[LLM] Grok empty -> GPT fallback")
#             except Exception as e:
#                 logger.warning(f"[LLM] Grok failed: {e} -> GPT fallback")
#         else:
#             logger.warning("[LLM] Grok unavailable -> GPT fallback")

#         # 3) GPT fallback
#         t0 = _t()
#         logger.info("[LLM] GPT fallback")
#         gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
#         _log_t("LLM (GPT fallback)", t0)
#         return gpt_resp, "gpt"
    


# # def ask_llm_with_fallback_5000(raw_text: str, scan_type: str, logger):
# #     """
# #     detaliai:
# #       - esli chars(bez whitespace) > 5000 -> primary Grok reasoning (grok-4-1-fast-reasoning)
# #       - inache -> primary Gemini (gemini-2.5-flash)
# #       - secondary: gemini-2.5-flash-lite
# #       - fallback: GPT
# #     sumiskai:
# #       - vsegda gemini-2.5-flash
# #     """
# #     # prompts
# #     try:
# #         from .utils.grok import GROK_DEFAULT_PROMPT, GROK_DETAILED_PROMPT
# #         grok_prompt = GROK_DETAILED_PROMPT if scan_type == "detaliai" else GROK_DEFAULT_PROMPT
# #     except Exception:
# #         grok_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

# #     try:
# #         gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
# #     except Exception:
# #         gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

# #     gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

# #     # sumiskai: prosto gemini-2.5-flash
# #     if scan_type != "detaliai":
# #         t0 = _t()
# #         logger.info("[LLM] sumiskai: using gemini-2.5-flash")
# #         resp = ask_gemini_with_retry(
# #             text=raw_text,
# #             prompt=gemini_prompt,
# #             model="gemini-2.5-flash",
# #             logger=logger,
# #         )
# #         _log_t("LLM (Gemini sumiskai)", t0)
# #         return resp, "gemini-2.5-flash"

# #     cnt = _count_chars_no_spaces(raw_text or "")
# #     use_grok_primary = cnt > 5000

# #     primary_model = "grok-4-1-fast-reasoning" if use_grok_primary else "gemini-2.5-flash"
# #     secondary_model = "gemini-2.5-flash-lite"

# #     logger.info(
# #         "[LLM] detaliai Router5000: chars_no_ws=%s -> primary=%s, secondary=%s",
# #         cnt, primary_model, secondary_model
# #     )

# #     # 1) PRIMARY
# #     if use_grok_primary:
# #         try:
# #             t0 = _t()
# #             logger.info(f"[LLM] Try Grok primary model={primary_model}")
# #             resp = ask_grok_with_retry(
# #                 text=raw_text,
# #                 prompt=grok_prompt,
# #                 model=primary_model,
# #                 temperature=0.1,
# #                 max_tokens=30000,
# #                 timeout_seconds=300,
# #                 logger=logger,
# #             )
# #             _log_t("LLM (Grok primary)", t0)
# #             if resp and resp.strip():
# #                 return resp, primary_model
# #             logger.warning("[LLM] Grok primary returned empty -> try secondary")
# #         except Exception as e:
# #             logger.warning(f"[LLM] Grok primary failed: {e} -> try secondary")

# #     else:
# #         try:
# #             t0 = _t()
# #             logger.info(f"[LLM] Try Gemini primary model={primary_model}")
# #             resp = ask_gemini_with_retry(
# #                 text=raw_text,
# #                 prompt=gemini_prompt,
# #                 model=primary_model,
# #                 logger=logger,
# #             )
# #             _log_t("LLM (Gemini primary)", t0)
# #             if resp and resp.strip():
# #                 return resp, primary_model
# #             logger.warning("[LLM] Gemini primary returned empty -> try secondary")
# #         except Exception as e:
# #             logger.warning(f"[LLM] Gemini primary failed: {e} -> try secondary")

# #     # 2) SECONDARY (Gemini Flash-Lite)
# #     try:
# #         t0 = _t()
# #         logger.info(f"[LLM] Try Gemini secondary model={secondary_model}")
# #         resp2 = ask_gemini_with_retry(
# #             text=raw_text,
# #             prompt=gemini_prompt,
# #             model=secondary_model,
# #             logger=logger,
# #         )
# #         _log_t("LLM (Gemini secondary)", t0)
# #         if resp2 and resp2.strip():
# #             return resp2, secondary_model
# #         logger.warning("[LLM] Gemini secondary returned empty -> fallback to GPT")
# #     except Exception as e:
# #         logger.warning(f"[LLM] Gemini secondary failed: {e} -> fallback to GPT")

# #     # 3) GPT FINAL
# #     t0 = _t()
# #     gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
# #     _log_t("LLM (GPT fallback)", t0)
# #     return gpt_resp, "gpt"




# # Grok integration

# def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
#     """
#     1) Grok (grok-4-1-fast-reasoning)
#     2) если пусто/ошибка — Gemini 2.5 Flash-Lite
#     3) если снова пусто/ошибка — GPT
#     """
#     # Берём промпты уже из grok.py (GROK_*), без GEMINI_*
#     try:
#         from .utils.grok import GROK_DEFAULT_PROMPT, GROK_DETAILED_PROMPT
#         grok_prompt = GROK_DETAILED_PROMPT if scan_type == "detaliai" else GROK_DEFAULT_PROMPT
#     except Exception:
#         # fallback на старые (если вдруг grok.py не подхватился)
#         grok_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

#     primary_model = "grok-4-1-fast-non-reasoning"
#     secondary_model = "gemini-2.5-flash-lite"

#     # 1) Grok
#     try:
#         t0 = _t()
#         logger.info(f"[LLM] Try Grok primary model={primary_model}")
#         resp = ask_grok_with_retry(
#             text=raw_text,
#             prompt=grok_prompt,
#             model=primary_model,
#             temperature=0.2 if scan_type == "detaliai" else 0.1,
#             max_tokens=30000,
#             timeout_seconds=300,
#             logger=logger,
#         )
#         _log_t("LLM (Grok primary)", t0)
#         logger.info(f"[LLM] Grok primary OK: len={len(resp or '')} preview={repr((resp or '')[:200])}")
#         if resp and resp.strip():
#             return resp, primary_model
#         logger.warning("[LLM] Grok primary returned empty → try secondary")
#     except Exception as e:
#         logger.warning(f"[LLM] Grok primary failed: {e} → try secondary")

#     # 2) Gemini Flash-Lite (запасной)
#     try:
#         t0 = _t()
#         logger.info(f"[LLM] Try Gemini secondary model={secondary_model}")

#         # Для Gemini используем твои GEMINI_* если они есть, иначе DEFAULT/DETAILED
#         try:
#             gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
#         except NameError:
#             gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

#         resp2 = ask_gemini_with_retry(
#             text=raw_text,
#             prompt=gemini_prompt,
#             model=secondary_model,
#             logger=logger,
#         )
#         _log_t("LLM (Gemini secondary)", t0)
#         logger.info(f"[LLM] Gemini secondary OK: len={len(resp2 or '')} preview={repr((resp2 or '')[:200])}")
#         if resp2 and resp2.strip():
#             return resp2, secondary_model
#         logger.warning("[LLM] Gemini secondary returned empty → fallback to GPT")
#     except Exception as e:
#         logger.warning(f"[LLM] Gemini secondary failed: {e} → fallback to GPT")

#     # 3) GPT
#     gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#     t0 = _t()
#     gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
#     _log_t("LLM (GPT fallback)", t0)
#     logger.info(f"[LLM] GPT fallback OK: len={len(gpt_resp or '')} preview={repr((gpt_resp or '')[:200])}")
#     return gpt_resp, "gpt"


# # def ask_llm_with_fallback(raw_text: str, scan_type: str, logger):
# #     """
# #     1) Gemini 2.5 Flash
# #     2) если пусто/ошибка — Gemini 2.5 Flash-Lite
# #     3) если снова пусто/ошибка — GPT
# #     """
# #     try:
# #         gemini_prompt = GEMINI_DETAILED_PROMPT if scan_type == "detaliai" else GEMINI_DEFAULT_PROMPT
# #     except NameError:
# #         gemini_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT

# #     primary_model   = "gemini-2.5-flash"
# #     # primary_model   = "gemini-2.5-flash"
# #     secondary_model = "gemini-2.5-flash-lite"   # альтернативно: "gemini-flash-lite-latest"

# #     # 1) Flash
# #     try:
# #         t0 = _t()
# #         logger.info(f"[LLM] Try Gemini primary model={primary_model}")
# #         resp = ask_gemini_with_retry(
# #             text=raw_text,
# #             prompt=gemini_prompt,
# #             model=primary_model,
# #             logger=logger,
# #         )
# #         _log_t("LLM (Gemini primary)", t0)
# #         logger.info(f"[LLM] Gemini primary OK: len={len(resp or '')} preview={repr((resp or '')[:200])}")
# #         if resp and resp.strip():
# #             return resp, primary_model
# #         logger.warning("[LLM] Gemini primary returned empty → try secondary")
# #     except Exception as e:
# #         logger.warning(f"[LLM] Gemini primary failed: {e} → try secondary")

# #     # 2) Flash-Lite
# #     try:
# #         t0 = _t()
# #         logger.info(f"[LLM] Try Gemini secondary model={secondary_model}")
# #         resp2 = ask_gemini_with_retry(
# #             text=raw_text,
# #             prompt=gemini_prompt,
# #             model=secondary_model,
# #             logger=logger,
# #         )
# #         _log_t("LLM (Gemini secondary)", t0)
# #         logger.info(f"[LLM] Gemini secondary OK: len={len(resp2 or '')} preview={repr((resp2 or '')[:200])}")
# #         if resp2 and resp2.strip():
# #             return resp2, secondary_model
# #         logger.warning("[LLM] Gemini secondary returned empty → fallback to GPT")
# #     except Exception as e:
# #         logger.warning(f"[LLM] Gemini secondary failed: {e} → fallback to GPT")

# #     # 3) GPT
# #     gpt_prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
# #     t0 = _t()
# #     gpt_resp = ask_gpt_with_retry(raw_text, prompt=gpt_prompt)
# #     _log_t("LLM (GPT fallback)", t0)
# #     logger.info(f"[LLM] GPT fallback OK: len={len(gpt_resp or '')} preview={repr((gpt_resp or '')[:200])}")
# #     return gpt_resp, "gpt"


# @shared_task
# def start_session_processing(session_id: str):
#     to_process = []
#     scan_type = None

#     with transaction.atomic():
#         s = UploadSession.objects.select_for_update().get(id=session_id)
#         scan_type = s.scan_type

#         qs = (
#             ScannedDocument.objects
#             .select_for_update()
#             .filter(upload_session=s, status="pending")
#             .only("id", "user_id")
#         )
#         docs = list(qs)

#         if not docs:
#             return

#         doc_ids = [d.id for d in docs]

#         total_cnt = len(doc_ids)
#         arch_cnt = ScannedDocument.objects.filter(id__in=doc_ids, is_archive_container=True).count()
#         normal_cnt = total_cnt - arch_cnt

#         # чтобы не запустить повторно
#         ScannedDocument.objects.filter(id__in=doc_ids).update(status="processing")

#         if arch_cnt:
#             UploadSession.objects.filter(id=s.id).update(pending_archives=F("pending_archives") + arch_cnt)

#         if normal_cnt:
#             UploadSession.objects.filter(id=s.id).update(actual_items=F("actual_items") + normal_cnt)


#         to_process = [(d.user_id, d.id) for d in docs]

#     # вне транзакции
#     for user_id, doc_id in to_process:
#         process_uploaded_file_task.delay(user_id, doc_id, scan_type)





# @shared_task(bind=True, soft_time_limit=600, time_limit=630, acks_late=True)
# def process_uploaded_file_task(self, user_id, doc_id, scan_type):
#     """
#     Полный пайплайн:
#     - OCR: Google Vision (компактный JSON параграфов + склеенный текст) → fallback Gemini OCR (только текст)
#     - Ранний reject по типу документа
#     - Сохранение raw_text (JSON/текст) и glued_raw_text (строчный текст)
#     - Подсчёт похожести
#     - LLM: Gemini → GPT fallback
#     - Парсинг JSON, валидации, сохранение
#     """
#     total_start = _t()
#     logger.info(
#         "[TASK] Celery limits: soft=%ss hard=%ss",
#         getattr(self.request, "soft_time_limit", None),
#         getattr(self.request, "time_limit", None),
#     )
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


#         # 3) content_type (грубое определение по расширению как fallback)
#         t0 = _t()
#         content_type = getattr(doc.file.file, 'content_type', None)
#         if not content_type:
#             low = file_path.lower()
#             if low.endswith('.pdf'): content_type = 'application/pdf'
#             elif low.endswith(('.jpg', '.jpeg')): content_type = 'image/jpeg'
#             elif low.endswith('.png'): content_type = 'image/png'
#             elif low.endswith('.webp'): content_type = 'image/webp'
#             elif low.endswith(('.tif', '.tiff')): content_type = 'image/tiff'
#             elif low.endswith(('.doc', '.docx')): content_type = 'application/msword'
#             elif low.endswith(('.xls', '.xlsx')): content_type = 'application/vnd.ms-excel'
#         logger.info(f"[TASK] Detected content_type={content_type} for {original_filename}")
#         _log_t("Detect content_type", t0)

#         # 4) Нормализация через улучшенный file_converter
#         class FakeUpload:
#             def __init__(self, name, content, content_type):
#                 self.name = name
#                 self._content = content
#                 self.content_type = content_type
#                 self._read = False
#             def read(self):
#                 if not self._read:
#                     self._read = True
#                     return self._content
#                 return b''

#         fake_file = FakeUpload(original_filename, file_bytes, content_type or "")
#         t0 = _t()
        
#         try:
#             from .utils.file_converter import normalize_any, ArchiveLimitError
#             normalized_result = normalize_any(fake_file)
#             _log_t("Normalize uploaded file", t0)
            
#         except ArchiveLimitError as e:
#             # НОВОЕ: Слишком много файлов в архиве — критическая ошибка
#             _log_t("Normalize failed (archive limit)", t0)
#             t1 = _t()
#             doc.status = 'rejected'
#             doc.error_message = str(e)  # "Per daug failų archyve: 2500 (max 2000)"
#             doc.preview_url = None
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             _settle_and_finish_if_session(doc)
#             _log_t("Save rejected (archive limit)", t1)
#             logger.info(f"[TASK] Rejected archive limit exceeded: {original_filename} - {str(e)}")
#             _log_t("TOTAL", total_start)
#             return
            
#         except ValueError as e:
#             # Неподдерживаемый формат
#             _log_t("Normalize failed (unsupported format)", t0)
#             t1 = _t()
#             doc.status = 'rejected'
#             doc.error_message = f"Nepalaikomas failo formatas: {str(e)}"
#             doc.preview_url = None
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             _settle_and_finish_if_session(doc)
#             _log_t("Save rejected (unsupported format)", t1)
#             logger.info(f"[TASK] Rejected unsupported format: {original_filename} - {str(e)}")
#             _log_t("TOTAL", total_start)
#             return
            
#         except Exception as e:
#             # Другие ошибки нормализации
#             _log_t("Normalize failed (error)", t0)
#             logger.exception(f"[TASK] Failed to normalize: {original_filename}")
#             t1 = _t()
#             doc.status = 'rejected'
#             doc.error_message = f"Klaida apdorojant failą: {str(e)}"
#             doc.preview_url = None
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             _settle_and_finish_if_session(doc)
#             _log_t("Save rejected (normalize error)", t1)
#             _log_t("TOTAL", total_start)
#             return

#         # 5) Обработка результата нормализации
#         if isinstance(normalized_result, list):
#             # ============================================================
#             # АРХИВ С МНОЖЕСТВЕННЫМИ ФАЙЛАМИ
#             # ============================================================
#             file_count = len(normalized_result)
#             logger.info(f"[TASK] Archive contains {file_count} processable files")
#             archive_skipped_data = {}
#             if normalized_result and '_archive_skipped' in normalized_result[0]:
#                 archive_skipped_data = normalized_result[0].pop('_archive_skipped', {})

#             skipped_too_large = archive_skipped_data.get('too_large', [])
#             skipped_unsupported = archive_skipped_data.get('unsupported', [])

#             has_skipped = len(skipped_too_large) > 0 or len(skipped_unsupported) > 0

#             if has_skipped:
#                 logger.info(f"[TASK] Archive skipped: {len(skipped_too_large)} too large, {len(skipped_unsupported)} unsupported")
            
#             if file_count == 0:
#                 # Пустой архив
#                 t1 = _t()
#                 doc.status = 'rejected'
#                 doc.error_message = "Archyve nerasta palaikomų failų"
#                 doc.preview_url = None
#                 doc.save(update_fields=['status', 'error_message', 'preview_url'])
#                 _settle_and_finish_if_session(doc)
#                 _log_t("Save rejected (empty archive)", t1)
#                 logger.info(f"[TASK] Rejected empty archive: {original_filename}")
#                 _log_t("TOTAL", total_start)
#                 return
            
#             # УДАЛЯЕМ исходный архив из БД (он больше не нужен)
#             t1 = _t()
#             if doc.file and os.path.exists(file_path):
#                 try:
#                     doc.file.delete(save=False)
#                     logger.info(f"[TASK] Archive file deleted: {file_path}")
#                 except Exception as e:
#                     logger.warning(f"[TASK] Couldn't delete archive: {file_path}: {e}")
#                 if os.path.exists(file_path):
#                     try:
#                         os.remove(file_path)
#                         logger.info(f"[TASK] Archive manually deleted: {file_path}")
#                     except Exception as e:
#                         logger.warning(f"[TASK] Couldn't manually delete archive: {file_path}: {e}")
#             _log_t("Delete archive file", t1)
            
#             # Генерируем batch_id для группировки документов из одного архива
#             batch_id = uuid.uuid4()
#             logger.info(f"[TASK] Created batch_id={batch_id} for {file_count} files from archive")
            
#             doc.is_archive_container = True

#             if has_skipped:
#                 doc.status = "rejected"
                
#                 # Формируем сообщение об ошибках
#                 error_parts = []
                
#                 if skipped_too_large:
#                     count = len(skipped_too_large)
#                     names = [f['name'] for f in skipped_too_large[:3]]
#                     names_str = ', '.join(names)
#                     if count > 3:
#                         names_str += f" ir dar {count - 3}..."
#                     error_parts.append(f"{count} per didelių failų (>{MAX_SINGLE_FILE_BYTES // (1024*1024)} MB): {names_str}")
                
#                 if skipped_unsupported:
#                     count = len(skipped_unsupported)
#                     names = [f['name'] for f in skipped_unsupported[:3]]
#                     names_str = ', '.join(names)
#                     if count > 3:
#                         names_str += f" ir dar {count - 3}..."
#                     error_parts.append(f"{count} nepalaikomų failų: {names_str}")
                
#                 doc.error_message = "Praleista: " + "; ".join(error_parts)
#             else:
#                 doc.status = "completed"
#                 doc.error_message = None

#             doc.preview_url = None
#             doc.save(update_fields=["is_archive_container", "status", "error_message", "preview_url"])
            
#             # Создаём отдельные ScannedDocument для каждого файла
#             created_docs = []
#             for i, normalized_file in enumerate(normalized_result, start=1):
#                 try:
#                     t2 = _t()
                    
#                     # Исправляем расширение: PDF→PNG после нормализации
#                     orig_name = normalized_file.get('original_filename', f'file_{i}.bin')
#                     new_ext = os.path.splitext(normalized_file['filename'])[1]
#                     base_name = os.path.splitext(orig_name)[0]
#                     corrected_filename = f"{base_name}{new_ext}"

#                     # Создаём новый документ
#                     new_doc = ScannedDocument.objects.create(
#                         user=user,
#                         original_filename=corrected_filename,  # ← ЗДЕСЬ используем corrected_filename
#                         status='processing',
#                         scan_type=scan_type,
#                         upload_session=doc.upload_session,       
#                         parent_document=doc,                     
#                         is_archive_container=False,              
#                     )
                    
#                     # Сохраняем нормализованный файл
#                     new_doc.file.save(
#                         normalized_file['filename'],
#                         ContentFile(normalized_file['data']),
#                         save=True
#                     )
#                     new_doc.save(update_fields=['file'])
#                     new_doc.refresh_from_db()
                    
#                     created_docs.append(new_doc.id)
#                     _log_t(f"Created document {i}/{file_count}", t2)
                    
#                     logger.info(
#                         f"[TASK] Created doc_id={new_doc.id} for file {i}/{file_count}: "
#                         f"{corrected_filename} (original: {orig_name})"
#                     )
                    
#                 except Exception as e:
#                     logger.error(f"[TASK] Failed to create document for file {i}/{file_count}: {e}")
#                     continue
            
#             if not created_docs:
#                 logger.error(f"[TASK] Failed to create ANY documents from archive {original_filename}")
#                 _log_t("TOTAL (archive processing failed)", total_start)
#                 return
            
#             if doc.upload_session_id:
#                 UploadSession.objects.filter(id=doc.upload_session_id).update(
#                     actual_items=F("actual_items") + len(created_docs)
#                 )

#             _settle_and_finish_if_session(doc)

            
#             logger.info(
#                 f"[TASK] Successfully created {len(created_docs)} documents from archive. "
#                 f"batch_id={batch_id}, doc_ids={created_docs}"
#             )
            
#             # Запускаем обработку каждого документа асинхронно
#             for i, new_doc_id in enumerate(created_docs, start=1):
#                 try:
#                     # Небольшая задержка между запусками для равномерной нагрузки
#                     process_uploaded_file_task.apply_async(
#                         args=[user_id, new_doc_id, scan_type],
#                         countdown=i * 2,  # 2 секунды между запусками
#                     )
#                     logger.info(f"[TASK] Scheduled processing for doc_id={new_doc_id} (delay={i*2}s)")
#                 except Exception as e:
#                     logger.error(f"[TASK] Failed to schedule processing for doc_id={new_doc_id}: {e}")
            
#             _log_t("TOTAL (archive unpacked)", total_start)
#             return  # Завершаем обработку архива
        
#         else:
#             # ОДИНОЧНЫЙ ФАЙЛ
#             normalized = normalized_result
#             logger.info(f"[TASK] Processing single file: {normalized['filename']}, size: {len(normalized['data'])}")

#         # Удалить исходный файл
#         t0 = _t()
#         if doc.file and os.path.exists(file_path):
#             try:
#                 doc.file.delete(save=False)
#                 logger.info(f"[TASK] Original deleted via .delete(): {file_path}")
#             except Exception as e:
#                 logger.warning(f"[TASK] Couldn't delete via delete(): {file_path}: {e}")
#             if os.path.exists(file_path):
#                 try:
#                     os.remove(file_path)
#                     logger.info(f"[TASK] Original deleted manually: {file_path}")
#                 except Exception as e:
#                     logger.warning(f"[TASK] Couldn't manually delete original: {file_path}: {e}")
#         _log_t("Delete original", t0)

#         # Сохранить нормализованный файл
#         t0 = _t()
#         doc.file.save(normalized['filename'], ContentFile(normalized['data']), save=True)
#         doc.save(update_fields=['file'])
#         doc.refresh_from_db()
#         logger.info(f"[TASK] After save: {doc.file.name}, exists? {os.path.exists(doc.file.path)}")
#         _log_t("Save normalized to model field", t0)

#         file_path = doc.file.path
#         original_filename = doc.file.name
#         data = normalized['data']

#         preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
#         logger.info(f"[TASK] Preview URL: {preview_url}")


#         # 6) OCR: Google Vision → fallback Gemini OCR
#         t0 = _t()
#         # get_ocr_text_gcv возвращает: raw_json, joined_text, paragraphs, error
#         gcv_raw_json, gcv_joined_text, _, gcv_err = get_ocr_text_gcv(data, original_filename, logger)
#         _log_t("OCR (Google Vision)", t0)

#         if gcv_err or (not gcv_raw_json and not gcv_joined_text):
#             logger.warning(f"[TASK] GCV failed or empty ({gcv_err or 'empty'}). Trying Gemini OCR...")
#             t1 = _t()
#             gemini_text, gemini_err = get_ocr_text_gemini(data, original_filename, logger)  # текст БЕЗ координат
#             _log_t("OCR (Gemini OCR fallback)", t1)

#             if gemini_err or not gemini_text:
#                 # финальная ошибка OCR
#                 t0 = _t()
#                 doc.status = 'rejected'
#                 doc.error_message = gemini_err or gcv_err or "OCR returned empty text"
#                 doc.preview_url = preview_url
#                 doc.save(update_fields=['status', 'error_message', 'preview_url'])
#                 _settle_and_finish_if_session(doc)
#                 _log_t("Save rejected (OCR error)", t0)
#                 logger.error(f"[TASK] OCR error (GCV+Gemini): {doc.error_message}")
#                 _log_t("TOTAL", total_start)
#                 return

#             # fallback: координат нет → raw_text кладём сам текст, glued_raw_text тоже текст
#             raw_json_for_db = gemini_text
#             glued_text_for_db = gemini_text
#         else:
#             # GCV успех: есть компактный JSON + склеенный текст
#             raw_json_for_db = gcv_raw_json
#             glued_text_for_db = gcv_joined_text

#         logger.info("[TASK] OCR lengths: raw=%s, glued=%s",
#                     len(raw_json_for_db or ""), len(glued_text_for_db or ""))

#         # 7) Ранний reject по типу документа (по склеенному тексту)
#         t0 = _t()
#         found_type = detect_doc_type(glued_text_for_db or "")
#         _log_t("Detect doc type", t0)
#         if found_type:
#             t0 = _t()
#             doc.status = 'rejected'
#             doc.error_message = f"Potenciali {found_type}"
#             doc.raw_text = raw_json_for_db
#             doc.glued_raw_text = glued_text_for_db
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'raw_text', 'glued_raw_text', 'preview_url'])
#             _settle_and_finish_if_session(doc)
#             _log_t("Save rejected (doc type)", t0)
#             logger.info(f"[TASK] Rejected due to type: {found_type}")
#             _log_t("TOTAL", total_start)
#             return

#         # 8) Сохранить OCR результаты
#         t0 = _t()
#         doc.raw_text = raw_json_for_db          # JSON параграфов с bbox ИЛИ plain text (если Gemini fallback)
#         doc.glued_raw_text = glued_text_for_db  # построчный «склеенный» текст
#         doc.preview_url = preview_url
#         doc.save(update_fields=['raw_text', 'glued_raw_text', 'preview_url'])
#         _log_t("Save OCR results", t0)

#         # 9) Похожесть с другими документами пользователя — по склеенному тексту
#         t0 = _t()
#         similarity_percent, similar_doc_id = calculate_max_similarity_percent(
#             doc.glued_raw_text or "",  # <--- склеенный текст, не raw_json
#             user=user,
#             exclude_doc_id=doc.pk
#         )
#         _log_t("Calculate similarity", t0)

#         t0 = _t()
#         doc.similarity_percent = similarity_percent
#         # Если есть поле в модели, можно сохранить и ID:
#         # doc.similar_doc_id = similar_doc_id
#         doc.save(update_fields=['similarity_percent'])  # , 'similar_doc_id'
#         _log_t("Save similarity", t0)


#         # Если похожесть высокая (>=95%), пробуем быстро вытащить серию/номер и проверить дубликат
#         if similarity_percent >= 95:
#             t0 = _t()
#             prompt = (
#                 "You are given OCRed text of a single Lithuanian accounting document (invoice/receipt).\n"
#                 "Extract two fields ONLY and return STRICT JSON with EXACT keys:\n"
#                 '{\n  "document_series": string|null,\n  "document_number": string|null\n}\n'
#                 "Rules:\n"
#                 "- If series is absent, set document_series to null.\n"
#                 "- If number is absent, set document_number to null.\n"
#                 "- Respond with pure JSON. Do NOT use markdown code fences."
#             )
#             try:
#                 resp = ask_gemini_with_retry(
#                     text=doc.glued_raw_text or "",
#                     prompt=prompt,
#                     model="gemini-2.5-flash-lite",
#                     logger=logger,
#                 )
#                 _log_t("Gemini-lite extract (series/number, high-sim)", t0)
#                 logger.info(f"[DUP-CHECK] gemini-lite extract resp preview={repr((resp or '')[:200])}")

#                 data = _extract_json_object(resp or "")
#                 series_ex = normalize_code_field((data.get("document_series") or "")) or None
#                 number_ex = normalize_code_field((data.get("document_number") or "")) or None
                
#                 logger.info(f"[DUP-CHECK] Extracted: series={repr(series_ex)}, number={repr(number_ex)}")

#                 if not series_ex and not number_ex:
#                     logger.info("[DUP-CHECK] gemini-lite returned empty → skip duplicate check")
#                 else:
#                     t1 = _t()
#                     # Проверяем только серию/номер без контрагентов (они еще не распознаны)
#                     is_dup = is_duplicate_by_series_number(
#                         user, 
#                         number_ex, 
#                         series_ex, 
#                         exclude_doc_id=doc.pk,
#                         check_parties=False  # ← КЛЮЧЕВОЕ ИЗМЕНЕНИЕ
#                     )
#                     logger.info(f"[DUP-CHECK] is_duplicate_by_series_number(check_parties=False) returned: {is_dup}")
                    
#                     if is_dup:
#                         doc.status = 'rejected'
#                         doc.error_message = ("Dublikatas: dokumentas su tokia serija ir numeriu jau buvo įkeltas"
#                                             if series_ex else
#                                             "Dublikatas: dokumentas su tokiu numeriu jau buvo įkeltas")
#                         if not getattr(doc, "preview_url", None):
#                             doc.preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
#                         doc.save(update_fields=['status', 'error_message', 'preview_url'])
#                         _settle_and_finish_if_session(doc)
#                         _log_t("Duplicate check (series/number @95%+)", t1)
#                         logger.info("[TASK] Rejected as duplicate by series/number on high similarity (no credits deducted)")
#                         _log_t("TOTAL", total_start)
#                         return
#                     _log_t("Duplicate check (series/number passed @95%+)", t1)

#             except Exception as e:
#                 logger.warning(f"[DUP-CHECK] gemini-lite extract failed: {e} — skipping duplicate check")


#         # 10) LLM: Gemini → GPT fallback (скармливаем склеенный текст)
#         t0 = _t()
#         try:
#             llm_resp, source_model = ask_llm_with_fallback_5000(glued_text_for_db or "", scan_type, logger)

#             # llm_resp, source_model = ask_llm_with_fallback(glued_text_for_db or "", scan_type, logger)
#         except Exception as e:
#             logger.warning(f"[TASK] Gemini request failed: {e}")
#             llm_resp = None
#             source_model = "gemini-error"
#         _log_t("LLM wrapper (with fallback)", t0)

#         if not llm_resp:
#             # Доп. попытка GPT (одна быстрая)
#             t1 = _t()
#             prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#             llm_resp = ask_gpt_with_retry(glued_text_for_db or "", prompt, max_retries=1, wait_seconds=30)
#             source_model = "gpt-4.1"
#             _log_t("LLM (GPT final attempt)", t1)

#         # # 11) Сохранить сырой JSON от LLM
#         # t0 = _t()
#         # doc.gpt_raw_json = llm_resp
#         # doc.save(update_fields=['gpt_raw_json'])
#         # _log_t("Save gpt_raw_json", t0)

#         # 11) Сохранить сырой JSON от LLM
#         t0 = _t()
#         doc.gpt_raw_json = llm_resp
#         doc.save(update_fields=['gpt_raw_json'])
#         logger.info(f"[LLM] Saved gpt_raw_json: source={source_model} len={len(llm_resp or '')} preview={repr((llm_resp or '')[:200])}")
#         _log_t("Save gpt_raw_json", t0)

#         # 12) Парсинг JSON + ретрай на gemini-2.5-lite при ОБРЫВЕ
#         t0 = _t()
#         try:
#             structured = parse_llm_json_robust(llm_resp)
#         except Exception as parse_err:
#             _log_t("Parse JSON (failed)", t0)
#             logger.warning(f"[TASK] JSON parse failed from {source_model}: {parse_err}")

#             did_repair = False

#             # Если ответ выглядит как ОБРЫВ — пробуем починить через gemini-2.5-lite
#             if is_truncated_json(llm_resp or "") and (glued_text_for_db or ""):
#                 try:
#                     t_fix = _t()
#                     fixed_json = repair_truncated_json_with_gemini_lite(
#                         broken_json=llm_resp or "",
#                         glued_raw_text=glued_text_for_db or "",
#                         logger=logger,
#                     )
#                     _log_t("Gemini-2.5-lite repair (retry on truncated)", t_fix)

#                     # сохраним отремонтированный сырец
#                     t_sv = _t()
#                     doc.gpt_raw_json = fixed_json
#                     doc.save(update_fields=['gpt_raw_json'])
#                     _log_t("Save gpt_raw_json (repaired)", t_sv)

#                     # парсим починенный JSON
#                     t_px = _t()
#                     structured = parse_llm_json_robust(fixed_json)
#                     _log_t("Parse JSON (after repair)", t_px)

#                     source_model = "gemini-2.5-flash-lite"
#                     did_repair = True

#                 except Exception as fix_err:
#                     logger.warning(f"[TASK] Repair with gemini-2.5-lite failed: {fix_err}")

#             # Если не обрыв или ремонт не удался — идём по прежнему GPT-фолбэку
#             if not did_repair:
#                 if source_model != "gpt-4.1":
#                     t1 = _t()
#                     prompt = DETAILED_PROMPT if scan_type == "detaliai" else DEFAULT_PROMPT
#                     gpt_resp = ask_gpt_with_retry(glued_text_for_db or "", prompt, max_retries=1, wait_seconds=30)
#                     _log_t("LLM (GPT retry after parse fail)", t1)

#                     t2 = _t()
#                     doc.gpt_raw_json = gpt_resp
#                     doc.save(update_fields=['gpt_raw_json'])
#                     _log_t("Save gpt_raw_json (after GPT retry)", t2)

#                     t3 = _t()
#                     structured = parse_llm_json_robust(gpt_resp)
#                     _log_t("Parse JSON (retry GPT)", t3)
#                     source_model = "gpt-4.1"
#                 else:
#                     t1 = _t()
#                     doc.status = 'rejected'
#                     doc.error_message = "JSON klaida iš LLM"
#                     doc.preview_url = preview_url
#                     doc.save(update_fields=["status", "error_message", "preview_url"])
#                     _settle_and_finish_if_session(doc)
#                     _log_t("Save rejected (JSON parse error)", t1)
#                     _log_t("TOTAL", total_start)
#                     return
#         else:
#             _log_t("Parse JSON", t0)

#         # truncated_json=true lineitems=20 total_lines >20, otsylajem povtorno v gemini 2.5 lite

#         # === ДОБАВИТЬ ЗДЕСЬ: авто-достройка при truncated_json ===
#         try:
#             # безопасно читаем truncated_json (поддержим bool/строку)
#             tj = structured.get("truncated_json")
#             truncated_flag = (tj is True) or (isinstance(tj, str) and tj.strip().lower() == "true")

#             # total_lines может быть str/None → приводим к int
#             try:
#                 total_lines = int(structured.get("total_lines") or 0)
#             except Exception:
#                 total_lines = 0

#             # фактическое количество line_items, уже извлечённых в текущем JSON
#             current_items_count = _count_line_items(structured)

#             # повторим в Lite, если ХОТЯ БЫ ОДНО условие истинно:
#             # 1) модель явно поставила truncated_json:true
#             # ИЛИ
#             # 2) total_lines > фактического числа line_items
#             need_full = False
#             if truncated_flag:
#                 need_full = True
#             elif total_lines > 0 and total_lines > current_items_count:
#                 need_full = True

#             # (опционально) ограничим абсурдные значения total_lines
#             MAX_ALLOWED_LINES = 500
#             if total_lines > MAX_ALLOWED_LINES:
#                 logger.warning("[LLM] total_lines=%s exceeds sanity limit=%s → skip full request",
#                             total_lines, MAX_ALLOWED_LINES)
#                 need_full = False

#             if need_full:
#                 # logger.info(
#                 #     "[LLM] Need full JSON via gemini-2.5-flash-lite: truncated=%s items=%s total_lines=%s",
#                 #     truncated_flag, current_items_count, total_lines
#                 # )
#                 logger.info(
#                     "[LLM] Need full JSON via gemini-2.5-flash-lite: truncated=%s items=%s total_lines=%s",
#                     truncated_flag, current_items_count, total_lines
#                 )
#                 t_full = _t()
#                 full_json_resp = request_full_json_with_gemini_lite(
#                     glued_raw_text=glued_text_for_db or "",
#                     previous_json=doc.gpt_raw_json or llm_resp or "",
#                     logger=logger,
#                 )
#                 _log_t("Gemini-2.5-flash-lite full JSON (follow-up)", t_full)

#                 if full_json_resp and full_json_resp.strip():
#                     # сохраним сырец и перепарсим
#                     t_sv = _t()
#                     doc.gpt_raw_json = full_json_resp
#                     doc.save(update_fields=['gpt_raw_json'])
#                     _log_t("Save gpt_raw_json (full)", t_sv)

#                     t_px = _t()
#                     structured = parse_llm_json_robust(full_json_resp)
#                     _log_t("Parse JSON (full)", t_px)

#                     # финальный контроль — теперь должно совпадать
#                     final_count = _count_line_items(structured)
#                     logger.info("[LLM] After full request: items=%s total_lines=%s",
#                                 final_count, int(structured.get("total_lines") or 0))
#                 else:
#                     logger.warning("[LLM] Empty response from gemini-2.5-lite full JSON request; keep truncated result as-is.")
#             else:
#                 logger.info("[LLM] No full-json re-request: truncated=%s items=%s total_lines=%s",
#                             truncated_flag, current_items_count, total_lines)

#         except Exception as e:
#             logger.warning(f"[LLM] Full JSON re-request skipped due to error: {e}")



#         # 13) Проверка количества документов
#         t0 = _t()
#         docs_count = max(1, int(structured.get("docs", 1)))
#         documents = structured.get("documents", [structured])
#         _log_t("Check docs count", t0)

#         if docs_count != 1:
#             t1 = _t()
#             doc.status = 'rejected'
#             doc.error_message = "Daugiau nei 1 dokumentas faile"
#             # оставляем сырые OCR-поля, чтобы юзер видел, что распознано
#             doc.save(update_fields=['status', 'error_message'])
#             _settle_and_finish_if_session(doc)
#             _log_t("Save rejected (multi-docs)", t1)
#             logger.info("[TASK] Rejected due to multiple docs")
#             _log_t("TOTAL", total_start)
#             return
        

#         # 13.1) Проверка дублей по номеру/серии (НОВОЕ)
#         # Логика:
#         #   - если серия НЕ пуста → сравниваем (номер + серия) после очистки
#         #   - если серия пуста → сравниваем только номер
#         # Очистка: оставляем только буквы и цифры (игнорируем пробелы, дефисы, символы '/')
#         # Если найден дубликат → документ помечается как rejected и кредиты НЕ списываются
#         doc_struct = documents[0]
#         number = doc_struct.get("document_number")
#         series = doc_struct.get("document_series")

#         t0 = _t()
#         if is_duplicate_by_series_number(user, number, series, exclude_doc_id=doc.pk):
#             doc.status = 'rejected'
#             if (series or "").strip():
#                 doc.error_message = "Dublikatas: dokumentas su tokia serija ir numeriu jau buvo įkeltas"
#             else:
#                 doc.error_message = "Dublikatas: dokumentas su tokiu numeriu jau buvo įkeltas"
#             doc.preview_url = preview_url
#             doc.save(update_fields=['status', 'error_message', 'preview_url'])
#             _settle_and_finish_if_session(doc)
#             _log_t("Duplicate check (number/series)", t0)  # <-- лог времени
#             logger.info("[TASK] Rejected as duplicate by number/series (no credits deducted)")
#             _log_t("TOTAL", total_start)
#             return
#         _log_t("Duplicate check (number/series, passed)", t0)

#         # # 13.2) Если отдельный VAT выключен, а у строк VAT пустой — раздать документный VAT по строкам
#         # from .validators.amount_validator import distribute_vat_from_document

#         # t0 = _t()
#         # doc_struct = documents[0]
#         # doc_struct = distribute_vat_from_document(doc_struct)
#         # _log_t("Distribute VAT from document to line_items", t0)


#         # 14) Обновление документа
#         doc_struct = documents[0]
#         doc_struct["similarity_percent"] = similarity_percent

#         t0 = _t()
#         update_scanned_document(
#             db_doc=doc,
#             doc_struct=doc_struct,
#             raw_text=raw_json_for_db,         # <-- ВАЖНО: оставляем JSON/текст OCR
#             preview_url=preview_url,
#             user=user,
#             structured=structured,
#             glued_raw_text=glued_text_for_db  # <-- и передаём склейку отдельно
#         )
#         _log_t("update_scanned_document()", t0)

#         # 15) Сопоставление продавца/покупателя
#         t0 = _t()
#         update_seller_buyer_info(doc)
#         _log_t("update_seller_buyer_info()", t0)

#         t0 = _t()
#         update_seller_buyer_info_from_companies(doc)
#         _log_t("update_seller_buyer_info_from_companies()", t0)

#         # 15.1) Применяем дефолты один раз — теперь, когда контрагенты уточнены
#         t0 = _t()
#         if _apply_sumiskai_defaults_from_user(doc, user):
#             doc.save(update_fields=[
#                 'prekes_pavadinimas',
#                 'prekes_kodas',
#                 'prekes_barkodas',
#                 'preke_paslauga',
#             ])
#         _log_t("apply defaults (post party enrichment)", t0)

#         # 16) НОВОЕ: Оптимизация preview
#         t0 = _t()
#         try:
#             from .utils.preview_optimizer import optimize_preview_for_document
            
#             if doc.file and os.path.exists(doc.file.path):
#                 file_size = os.path.getsize(doc.file.path)
#                 if file_size > 150_000:  # > 150KB
#                     logger.info(f"[TASK] Optimizing preview: {file_size} bytes")
#                     optimize_preview_for_document(doc)
#                     # ВАЖНО: обновляем preview_url после оптимизации
#                     preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
#                     doc.preview_url = preview_url
#                     doc.save(update_fields=['preview_url'])
#                     logger.info(f"[TASK] Updated preview_url after optimization: {preview_url}")
#         except Exception as e:
#             logger.warning(f"[TASK] Preview optimization failed: {e}")
#         _log_t("Optimize preview", t0)                          

#         # 17) Списание/освобождение резервов + финализация сессии
#         t0 = _t()
#         doc.refresh_from_db(fields=["id", "status", "upload_session_id"])  # чтобы видеть финальный статус
#         if doc.upload_session_id:
#             _settle_and_finish_if_session(doc)
#         else:
#             # legacy режим без upload_session
#             credits_per_doc = Decimal("1.3") if scan_type == "detaliai" else Decimal("1")
#             user.credits -= credits_per_doc
#             user.save(update_fields=["credits"])
#         _log_t("Finalize credits/session", t0)

#         _log_t("TOTAL", total_start)

#     except SoftTimeLimitExceeded as e:
#         logger.error(
#             "[TASK] Soft time limit exceeded for doc_id=%s (soft=%ss, hard=%ss): %s",
#             doc_id,
#             getattr(self.request, "soft_time_limit", None),
#             getattr(self.request, "time_limit", None),
#             e,
#         )
#         try:
#             t0 = _t()
#             doc = ScannedDocument.objects.filter(pk=doc_id).first()
#             if doc:
#                 doc.status = 'rejected'
#                 doc.error_message = "Operacija nutraukta: viršytas užduoties laiko limitas (soft time limit)."
#                 if not getattr(doc, "preview_url", None):
#                     try:
#                         doc.preview_url = f"{settings.SITE_URL_BACKEND}/media/{doc.file.name}"
#                     except Exception:
#                         pass
#                 doc.save(update_fields=['status', 'error_message', 'preview_url'])
#                 _settle_and_finish_if_session(doc)
#             _log_t("Save rejected (soft time limit)", t0)
#         finally:
#             _log_t("TOTAL (soft time limit path)", total_start)
#         return

#     except Exception as e:
#         logger.exception(f"[TASK] Error processing document ID: {doc_id}")
#         try:
#             t0 = _t()
#             doc = ScannedDocument.objects.filter(pk=doc_id).first()
#             if doc:
#                 doc.status = 'rejected'
#                 doc.error_message = str(e)
#                 doc.save(update_fields=["status", "error_message"])  # фиксируем ошибку
#                 _settle_and_finish_if_session(doc)
#             _log_t("Save rejected (exception path)", t0)
#         finally:
#             _log_t("TOTAL (exception path)", total_start)







#FUNKICII dlia exporta cerez API

@shared_task(bind=True, max_retries=0)
def export_to_optimum_task(self, session_id: int):
    """
    Экспортирует все документы из ExportSession в Optimum API.
    """
    from docscanner_app.models import ExportSession, ScannedDocument
    from docscanner_app.exports.optimum import export_document_to_optimum, save_export_result
    from docscanner_app.utils.password_encryption import decrypt_password

    try:
        session = ExportSession.objects.get(pk=session_id)
    except ExportSession.DoesNotExist:
        logger.error("[OPTIMUM_TASK] ExportSession %s not found", session_id)
        return

    # Стартуем
    session.stage = ExportSession.Stage.PROCESSING
    session.started_at = timezone.now()
    session.save(update_fields=["stage", "started_at"])

    # Получаем API ключ
    user = session.user
    opt_settings = getattr(user, "optimum_settings", {}) or {}
    enc_key = opt_settings.get("key") or ""
    key = decrypt_password(enc_key) if enc_key else ""

    if not key:
        logger.error("[OPTIMUM_TASK] session=%s Optimum API key missing", session_id)
        session.stage = ExportSession.Stage.DONE
        session.finished_at = timezone.now()
        session.save(update_fields=["stage", "finished_at"])
        return

    # Получаем документы
    documents = list(session.documents.all())
    session.total_documents = len(documents)
    session.save(update_fields=["total_documents"])

    start_time = time.time()

    success_count = 0
    partial_count = 0
    error_count = 0

    for doc in documents:
        doc_id = doc.pk

        try:
            result = export_document_to_optimum(
                doc=doc,
                key=key,
                customuser=user,
            )

            save_export_result(
                export_result=result,
                user=user,
                session=session,
                program=session.program,
            )

            if result.overall_status == "success":
                success_count += 1
            elif result.overall_status == "partial_success":
                partial_count += 1
            else:
                error_count += 1

            if result.overall_status in ("success", "partial_success"):
                ScannedDocument.objects.filter(pk=doc_id).update(status="exported")

        except Exception as e:
            logger.exception(
                "[OPTIMUM_TASK] session=%s doc=%s error: %s",
                session_id, doc_id, e,
            )
            error_count += 1

            ScannedDocument.objects.filter(pk=doc_id).update(
                optimum_api_status="error",
                optimum_last_try_date=timezone.now(),
            )

        # Обновляем счётчики после каждого документа (для progress bar)
        session.processed_documents += 1
        session.success_count = success_count
        session.partial_count = partial_count
        session.error_count = error_count
        session.save(update_fields=[
            "processed_documents",
            "success_count",
            "partial_count",
            "error_count",
        ])

    # Финиш
    total_time = time.time() - start_time
    session.stage = ExportSession.Stage.DONE
    session.finished_at = timezone.now()
    session.save(update_fields=["stage", "finished_at"])

    logger.info(
        "[OPTIMUM_TASK] session=%s DONE total_docs=%d time=%.1fs "
        "success=%d partial=%d error=%d",
        session_id, len(documents), total_time,
        success_count, partial_count, error_count,
    )




@shared_task(bind=True, max_retries=0)
def export_to_dineta_task(self, session_id: int):
    """
    Экспортирует все документы из ExportSession в Dineta API.
    Поток на каждый документ:
      1. Partner  → v1/partner/
      2. Stock    → v1/stock/  (chunks по 50)
      3. setOperation → v1/setOperation/
    """
    from docscanner_app.models import ExportSession, ScannedDocument
    from docscanner_app.exports.dineta import (
        export_document_to_dineta,
        save_dineta_export_result,
        parse_dineta_url,
        build_api_base_url,
        build_auth_header,
        DinetaError,
    )
    from docscanner_app.utils.password_encryption import decrypt_password

    try:
        session = ExportSession.objects.get(pk=session_id)
    except ExportSession.DoesNotExist:
        logger.error("[DINETA_TASK] ExportSession %s not found", session_id)
        return

    # Стартуем
    session.stage = ExportSession.Stage.PROCESSING
    session.started_at = timezone.now()
    session.save(update_fields=["stage", "started_at"])

    # Получаем настройки Dineta
    user = session.user
    dineta_settings = getattr(user, "dineta_settings", {}) or {}

    server = dineta_settings.get("server", "")
    client = dineta_settings.get("client", "")
    username = dineta_settings.get("username", "")
    enc_password = dineta_settings.get("password", "")

    if not all([server, client, username, enc_password]):
        logger.error(
            "[DINETA_TASK] session=%s Dineta nustatymai neužpildyti "
            "(server=%s, client=%s, username=%s, password=%s)",
            session_id, bool(server), bool(client),
            bool(username), bool(enc_password),
        )
        session.stage = ExportSession.Stage.DONE
        session.finished_at = timezone.now()
        session.save(update_fields=["stage", "finished_at"])
        return

    password = decrypt_password(enc_password) if enc_password else ""
    if not password:
        logger.error(
            "[DINETA_TASK] session=%s Nepavyko iššifruoti slaptažodžio",
            session_id,
        )
        session.stage = ExportSession.Stage.DONE
        session.finished_at = timezone.now()
        session.save(update_fields=["stage", "finished_at"])
        return

    base_url = build_api_base_url(server, client)
    headers = build_auth_header(username, password)

    # Получаем документы
    documents = list(session.documents.all())
    session.total_documents = len(documents)
    session.save(update_fields=["total_documents"])

    start_time = time.time()

    success_count = 0
    partial_count = 0
    error_count = 0

    # Множество использованных operation ID (для дедупликации blankNo)
    used_ids: set = set()

    for doc in documents:
        doc_id = doc.pk

        try:
            result = export_document_to_dineta(
                doc=doc,
                base_url=base_url,
                headers=headers,
                customuser=user,
                used_ids=used_ids,
            )

            save_dineta_export_result(
                export_result=result,
                user=user,
                session=session,
                program=session.program,
            )

            if result.overall_status == "success":
                success_count += 1
            elif result.overall_status == "partial_success":
                partial_count += 1
            else:
                error_count += 1

            if result.overall_status in ("success", "partial_success"):
                ScannedDocument.objects.filter(pk=doc_id).update(
                    status="exported",
                )

        except Exception as e:
            logger.exception(
                "[DINETA_TASK] session=%s doc=%s klaida: %s",
                session_id, doc_id, e,
            )
            error_count += 1

            ScannedDocument.objects.filter(pk=doc_id).update(
                dineta_api_status="error",
                dineta_last_try_date=timezone.now(),
            )

        # Обновляем счётчики после каждого документа (для progress bar)
        session.processed_documents += 1
        session.success_count = success_count
        session.partial_count = partial_count
        session.error_count = error_count
        session.save(update_fields=[
            "processed_documents",
            "success_count",
            "partial_count",
            "error_count",
        ])

    # Финиш
    total_time = time.time() - start_time
    session.stage = ExportSession.Stage.DONE
    session.finished_at = timezone.now()
    session.save(update_fields=["stage", "finished_at"])

    logger.info(
        "[DINETA_TASK] session=%s BAIGTA total_docs=%d time=%.1fs "
        "success=%d partial=%d error=%d",
        session_id, len(documents), total_time,
        success_count, partial_count, error_count,
    )


@shared_task(bind=True, max_retries=0)
def export_to_rivile_gama_api_task(self, session_id: int, api_key_id: int, own_company_code: str):
    """
    Экспортирует документы из ExportSession в Rivile GAMA через REST API.
    Workflow: N08 (контрагенты) → N17 (товары) → N25 (коды) → I06 (документы).
    """
    from docscanner_app.models import ExportSession, ScannedDocument, RivileGamaAPIKey
    from docscanner_app.exports.rivile_gama_api import (
        export_documents_to_rivile_api,
        save_export_results,
    )

    try:
        session = ExportSession.objects.get(pk=session_id)
    except ExportSession.DoesNotExist:
        logger.error("[RIVILE_API_TASK] ExportSession %s not found", session_id)
        return

    # --- Стартуем ---
    session.stage = ExportSession.Stage.PROCESSING
    session.started_at = timezone.now()
    session.save(update_fields=["stage", "started_at"])

    # --- API ключ ---
    try:
        api_key_obj = RivileGamaAPIKey.objects.get(pk=api_key_id)
    except RivileGamaAPIKey.DoesNotExist:
        logger.error("[RIVILE_API_TASK] session=%s API key %s not found", session_id, api_key_id)
        session.stage = ExportSession.Stage.DONE
        session.finished_at = timezone.now()
        session.save(update_fields=["stage", "finished_at"])
        return

    user = session.user

    # --- Документы ---
    documents = list(
        session.documents.all().prefetch_related("line_items")
    )
    session.total_documents = len(documents)
    session.save(update_fields=["total_documents"])

    if not documents:
        logger.warning("[RIVILE_API_TASK] session=%s no documents", session_id)
        session.stage = ExportSession.Stage.DONE
        session.finished_at = timezone.now()
        session.save(update_fields=["stage", "finished_at"])
        return

    start_time = time.time()

    # --- Экспорт пачки ---
    try:
        rivile_session = export_documents_to_rivile_api(
            documents=documents,
            user=user,
            api_key_obj=api_key_obj,
            own_company_code=own_company_code,
        )
    except Exception as e:
        logger.exception("[RIVILE_API_TASK] session=%s export failed: %s", session_id, e)
        session.stage = ExportSession.Stage.DONE
        session.finished_at = timezone.now()
        session.error_count = len(documents)
        session.processed_documents = len(documents)
        session.save(update_fields=[
            "stage", "finished_at", "error_count", "processed_documents",
        ])
        return

    # --- Сохраняем логи (APIExportLog, APIExportArticleLog, rivile_api_status) ---
    try:
        save_export_results(rivile_session, user, api_key_obj, export_session=session)
    except Exception as e:
        logger.exception("[RIVILE_API_TASK] session=%s save_export_results failed: %s", session_id, e)

    # --- Считаем результаты и помечаем exported ---
    success_count = 0
    partial_count = 0
    error_count = 0

    for doc_result in rivile_session.i06_results:
        if doc_result.overall_status == "success":
            success_count += 1
            ScannedDocument.objects.filter(pk=doc_result.doc_id).update(status="exported")
        elif doc_result.overall_status == "partial_success":
            partial_count += 1
            ScannedDocument.objects.filter(pk=doc_result.doc_id).update(status="exported")
        else:
            error_count += 1

    # --- Финализация сессии ---
    total_time = time.time() - start_time

    session.stage = ExportSession.Stage.DONE
    session.finished_at = timezone.now()
    session.processed_documents = len(rivile_session.i06_results)
    session.success_count = success_count
    session.partial_count = partial_count
    session.error_count = error_count
    session.save(update_fields=[
        "stage", "finished_at", "processed_documents",
        "success_count", "partial_count", "error_count",
    ])

    logger.info(
        "[RIVILE_API_TASK] session=%s DONE total_docs=%d time=%.1fs "
        "requests=%d success=%d partial=%d error=%d infra=%r",
        session_id, len(documents), total_time,
        rivile_session.total_requests,
        success_count, partial_count, error_count,
        rivile_session.infra_error or "",
    )





#Integracii s Google Drive i DropBox

# ════════════════════════════════════════════════
#  Cloud sync limits
# ════════════════════════════════════════════════

CLOUD_MAX_SINGLE_FILE_BYTES    = 50 * 1024 * 1024      # 50 MB
CLOUD_MAX_FILES_PER_SYNC       = 500
CLOUD_MAX_TOTAL_BYTES_PER_SYNC = 1 * 1024 * 1024 * 1024  # 1 GB
CLOUD_RETRY_DELAY_SECONDS      = 300                      # 5 min

# Поддерживаемые форматы (всё что умеет normalize_any, БЕЗ архивов)
CLOUD_ALLOWED_EXT = {
    ".pdf",
    ".jpg", ".jpeg", ".jpe", ".png", ".tiff", ".tif",
    ".webp", ".bmp", ".heic", ".heif", ".avif", ".gif",
    ".doc", ".docx", ".xls", ".xlsx",
}

CLOUD_ARCHIVE_EXT = {
    ".zip", ".rar", ".7z", ".tar", ".tgz",
    ".tar.gz", ".tar.bz2", ".tar.xz", ".tbz2",
}


def _cloud_ext(name: str) -> str:
    """Расширение файла (с поддержкой .tar.gz и т.п.)."""
    n = (name or "").lower()
    if n.endswith(".tar.gz"):  return ".tar.gz"
    if n.endswith(".tar.bz2"): return ".tar.bz2"
    if n.endswith(".tar.xz"):  return ".tar.xz"
    import os
    return os.path.splitext(n)[1]


def _safe_rename(service, connection, file_id, new_name, logger):
    """Rename с обрезкой до 250 символов."""
    if len(new_name) > 250:
        base, fext = (new_name.rsplit(".", 1) if "." in new_name else (new_name, ""))
        new_name = f"{base[:250 - len(fext) - 1]}.{fext}" if fext else base[:250]
    try:
        service.rename_file(connection, file_id, new_name)
    except Exception as e:
        logger.warning("Rename failed for %s: %s", file_id, e)


@shared_task(bind=True, max_retries=3, default_retry_delay=60,
             soft_time_limit=900, time_limit=960)
def sync_cloud_folder(self, cloud_folder_id, event_type="webhook"):
    from .models import CloudClientFolder, MobileInboxDocument
    from .cloud_services import get_cloud_service

    try:
        folder = CloudClientFolder.objects.select_related(
            "connection", "connection__user", "cloud_client"
        ).get(id=cloud_folder_id, is_active=True)
    except CloudClientFolder.DoesNotExist:
        logger.warning("CloudClientFolder %s not found", cloud_folder_id)
        return

    connection = folder.connection
    if not connection.is_active:
        return

    user = connection.user
    service = get_cloud_service(connection.provider)

    has_remaining = False  # True если остались файлы (лимиты/время)

    try:
        service.refresh_token_if_needed(connection)
        new_files = service.list_new_files(connection, folder.remote_folder_id)

        logger.info(
            "Folder %s (%s): %d new files",
            folder.cloud_client.name, connection.provider, len(new_files),
        )

        downloaded_count = 0
        total_downloaded_bytes = 0
        date_str = timezone.now().strftime("%Y%m%d")

        for cloud_file in new_files:
            try:
                # ── Лимит количества файлов ──
                if downloaded_count >= CLOUD_MAX_FILES_PER_SYNC:
                    logger.info(
                        "Sync file limit reached (%d). Remaining files will be picked up next sync.",
                        CLOUD_MAX_FILES_PER_SYNC,
                    )
                    has_remaining = True
                    break

                # ── Дедупликация ──
                if MobileInboxDocument.objects.filter(
                    user=user, remote_file_id=cloud_file.file_id,
                ).exists():
                    continue

                # ── Проверка расширения ──
                ext = _cloud_ext(cloud_file.name)

                if ext in CLOUD_ARCHIVE_EXT:
                    # Архив → не поддерживается в sync
                    logger.info("Skipping archive: %s", cloud_file.name)
                    _safe_rename(
                        service, connection, cloud_file.file_id,
                        f"KLAIDA_BLOGAS_FORMATAS_{date_str}_{cloud_file.name}",
                        logger,
                    )
                    continue

                if ext not in CLOUD_ALLOWED_EXT:
                    # Неподдерживаемый формат
                    logger.info("Skipping unsupported format: %s", cloud_file.name)
                    _safe_rename(
                        service, connection, cloud_file.file_id,
                        f"KLAIDA_BLOGAS_FORMATAS_{date_str}_{cloud_file.name}",
                        logger,
                    )
                    continue

                # ── Проверка размера до скачивания ──
                file_size = cloud_file.size or 0

                if file_size > CLOUD_MAX_SINGLE_FILE_BYTES:
                    logger.warning(
                        "File too large: %s (%d bytes, limit %d)",
                        cloud_file.name, file_size, CLOUD_MAX_SINGLE_FILE_BYTES,
                    )
                    _safe_rename(
                        service, connection, cloud_file.file_id,
                        f"KLAIDA_PER_DIDELIS_{date_str}_{cloud_file.name}",
                        logger,
                    )
                    continue

                # ── Лимит суммарного объёма (проверка до скачивания) ──
                if file_size > 0 and (total_downloaded_bytes + file_size) > CLOUD_MAX_TOTAL_BYTES_PER_SYNC:
                    logger.info(
                        "Sync bytes limit would be exceeded (%d + %d > %d). Stopping.",
                        total_downloaded_bytes, file_size, CLOUD_MAX_TOTAL_BYTES_PER_SYNC,
                    )
                    has_remaining = True
                    break

                # ── Скачиваем ──
                content_bytes, filename = service.download_file(
                    connection, cloud_file.file_id
                )
                actual_size = len(content_bytes)

                # Перепроверка размера после скачивания (на случай если size был 0 в метаданных)
                if actual_size > CLOUD_MAX_SINGLE_FILE_BYTES:
                    logger.warning(
                        "Downloaded file too large: %s (%d bytes). Discarding.",
                        cloud_file.name, actual_size,
                    )
                    _safe_rename(
                        service, connection, cloud_file.file_id,
                        f"KLAIDA_PER_DIDELIS_{date_str}_{cloud_file.name}",
                        logger,
                    )
                    continue

                # Перепроверка суммарного объёма после скачивания
                if (total_downloaded_bytes + actual_size) > CLOUD_MAX_TOTAL_BYTES_PER_SYNC:
                    logger.info(
                        "Sync bytes limit exceeded after download (%d + %d > %d). Stopping.",
                        total_downloaded_bytes, actual_size, CLOUD_MAX_TOTAL_BYTES_PER_SYNC,
                    )
                    # Файл уже скачан но не сохраним — переименуем обратно? Нет.
                    # Лучше сохраним, раз уже скачали. Но пометим has_remaining.
                    # (не break'аем — сохраняем этот файл, потом break)

                # ── Сохраняем в MobileInboxDocument ──
                doc = MobileInboxDocument(
                    user=user,
                    original_filename=filename,
                    size_bytes=actual_size,
                    source=connection.provider,
                    cloud_client=folder.cloud_client,
                    remote_file_id=cloud_file.file_id,
                    rename_status="pending",
                )
                doc.uploaded_file.save(filename, ContentFile(content_bytes), save=False)
                doc.save()

                downloaded_count += 1
                total_downloaded_bytes += actual_size

                # ── Rename в облаке → ISSIUSTA_ ──
                new_name = f"ISSIUSTA_{date_str}_{filename}"
                try:
                    ok = service.rename_file(connection, cloud_file.file_id, new_name)
                    doc.rename_status = "done" if ok else "failed"
                    doc.save(update_fields=["rename_status"])
                except Exception as rename_err:
                    logger.warning("Rename failed for %s: %s", filename, rename_err)
                    doc.rename_status = "failed"
                    doc.save(update_fields=["rename_status"])

                logger.info(
                    "Downloaded + renamed: %s -> doc %d (%d/%d, %d bytes total)",
                    filename, doc.id, downloaded_count, CLOUD_MAX_FILES_PER_SYNC,
                    total_downloaded_bytes,
                )

                # Проверяем суммарный лимит после сохранения
                if total_downloaded_bytes >= CLOUD_MAX_TOTAL_BYTES_PER_SYNC:
                    logger.info("Sync bytes limit reached after save. Stopping.")
                    has_remaining = True
                    break

            except Exception as e:
                # Скачивание не удалось → KLAIDA_ в облаке
                try:
                    _safe_rename(
                        service, connection, cloud_file.file_id,
                        f"KLAIDA_{date_str}_{cloud_file.name}",
                        logger,
                    )
                except Exception:
                    pass
                logger.error("Error downloading %s: %s", cloud_file.name, e, exc_info=True)

        # ── Обновляем timestamps ──
        folder.last_polled_at = timezone.now()
        folder.save(update_fields=["last_polled_at"])
        connection.last_synced_at = timezone.now()
        connection.save(update_fields=["last_synced_at"])

        logger.info(
            "Sync complete: folder=%s, downloaded=%d, bytes=%d, has_remaining=%s",
            folder.cloud_client.name, downloaded_count, total_downloaded_bytes, has_remaining,
        )

    except SoftTimeLimitExceeded:
        logger.warning(
            "Sync soft time limit (15min) for folder %s. "
            "Already downloaded files are saved. Scheduling retry in %ds.",
            cloud_folder_id, CLOUD_RETRY_DELAY_SECONDS,
        )
        has_remaining = True

    except Exception as e:
        logger.error("Sync failed for folder %s: %s", cloud_folder_id, e, exc_info=True)
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)
        return

    # ── Если остались файлы — повторный sync через 5 минут ──
    if has_remaining:
        logger.info(
            "Scheduling follow-up sync for folder %s in %ds",
            cloud_folder_id, CLOUD_RETRY_DELAY_SECONDS,
        )
        sync_cloud_folder.apply_async(
            args=[cloud_folder_id, "follow_up"],
            countdown=CLOUD_RETRY_DELAY_SECONDS,
        )



"""
Cloud Sync Tasks (Celery)
Файлы сохраняются в MobileInboxDocument с source="google_drive"/"dropbox".

CELERY_BEAT_SCHEDULE:
    "cloud-fallback-poll": {
        "task": "docscanner_app.tasks.fallback_poll_all",
        "schedule": crontab(minute=0, hour="*/2"),
    },
    "cloud-renew-gdrive-watches": {
        "task": "docscanner_app.tasks.renew_gdrive_watches",
        "schedule": crontab(minute=0, hour="*/12"),
    },
"""


WEBHOOK_DEBOUNCE_SECONDS = 5 * 60


# ════════════════════════════════════════════════
#  Webhook debounce — 5 мин после последнего webhook
# ════════════════════════════════════════════════

@shared_task
def schedule_sync_after_webhook(connection_id):
    from django.core.cache import cache
    from .models import CloudClientFolder

    folders = CloudClientFolder.objects.filter(
        connection_id=connection_id, is_active=True,
    ).values_list("id", flat=True)

    for folder_id in folders:
        debounce_key = f"cloud_sync:{connection_id}:{folder_id}"

        prev_task_id = cache.get(debounce_key)
        if prev_task_id:
            try:
                from celery.result import AsyncResult
                AsyncResult(prev_task_id).revoke()
            except Exception:
                pass

        task = sync_cloud_folder.apply_async(
            args=[folder_id, "webhook"],
            countdown=WEBHOOK_DEBOUNCE_SECONDS,
        )
        cache.set(debounce_key, task.id, timeout=WEBHOOK_DEBOUNCE_SECONDS + 60)

    logger.info(
        "Webhook debounce: %d folders, connection %s, sync in %ds",
        len(folders), connection_id, WEBHOOK_DEBOUNCE_SECONDS,
    )


# ════════════════════════════════════════════════
#  Fallback polling — каждые 2 часа
# ════════════════════════════════════════════════

@shared_task
def fallback_poll_all():
    from .models import CloudClientFolder

    folders = CloudClientFolder.objects.filter(
        is_active=True, connection__is_active=True,
    )
    count = 0
    for folder in folders:
        if folder.last_polled_at and (timezone.now() - folder.last_polled_at) < timedelta(hours=1):
            continue
        sync_cloud_folder.delay(folder.id, event_type="poll")
        count += 1

    logger.info("Fallback poll: %d folders", count)


# ════════════════════════════════════════════════
#  Google Drive watch renewal — каждые 12 часов
# ════════════════════════════════════════════════

@shared_task
def renew_gdrive_watches():
    from .models import CloudConnection, CloudClientFolder
    from .cloud_services import GoogleDriveService

    service = GoogleDriveService()
    connections = CloudConnection.objects.filter(provider="google_drive", is_active=True)

    for conn in connections:
        if (conn.gdrive_channel_expiration and
                conn.gdrive_channel_expiration > timezone.now() + timedelta(hours=6)):
            continue

        folders = CloudClientFolder.objects.filter(connection=conn, is_active=True)
        for folder in folders:
            try:
                webhook_url = f"{settings.CLOUD_WEBHOOK_BASE_URL}/api/cloud/webhook/google/"
                service.setup_push_notifications(conn, folder.remote_folder_id, webhook_url)
            except Exception as e:
                logger.error("Failed to renew watch folder %s: %s", folder.id, e)


# # ════════════════════════════════════════════════
# #  Recurring invoices
# # ════════════════════════════════════════════════


@shared_task(name="process_recurring_invoices")
def process_recurring_invoices():
    """
    Запускается каждый день в 8:55.
    Находит все active recurring где next_run_at <= сегодня 23:59
    и генерирует из них инвойсы.
    """
    from .models import RecurringInvoice, InvSubscription
    from .services.recurring_generator import generate_invoice_from_recurring
    from django.db import transaction

    today_end = timezone.now().replace(hour=23, minute=59, second=59)

    count = 0
    errors = 0
    paused = 0

    with transaction.atomic():
        recurring_qs = RecurringInvoice.objects.filter(
            status="active",
            next_run_at__isnull=False,
            next_run_at__lte=today_end,
        ).select_for_update(skip_locked=True)

        for recurring in recurring_qs:
            # --- Inv subscription: check if recurring is allowed ---
            try:
                sub = InvSubscription.objects.filter(user=recurring.user).first()
                if sub:
                    sub.check_and_expire()
                    if sub.status == "free":
                        recurring.status = "paused"
                        recurring.save(update_fields=["status"])
                        paused += 1
                        logger.info(
                            "[Recurring] Paused recurring %d for user %s (free plan)",
                            recurring.id, recurring.user.email,
                        )
                        continue
            except Exception as e:
                logger.warning("[Recurring] Subscription check failed for %d: %s", recurring.id, e)

            try:
                generate_invoice_from_recurring(recurring)
                count += 1
                logger.info(f"Generated invoice for recurring {recurring.id}")
            except Exception as e:
                errors += 1
                logger.error(f"Failed recurring {recurring.id}: {e}")

    logger.info(
        "Recurring invoices: %d generated, %d paused (free), %d failed",
        count, paused, errors,
    )
    return {"generated": count, "paused": paused, "errors": errors}


# ════════════════════════════════════════════════════════════
#  Invoice email tasks
# ════════════════════════════════════════════════════════════

@shared_task(name="send_invoice_email_task", bind=True, max_retries=3)
def send_invoice_email_task(self, invoice_id, email_type, recipient_email=None, reminder_day=None, days_context=None):
    """Универсальная задача отправки email для счёта."""
    try:
        from .services.invoice_email_service import send_invoice_email
        from .models import Invoice

        # --- Inv subscription: email limit check for free users ---
        try:
            inv = Invoice.objects.select_related("user").get(id=invoice_id)
            from .views import check_inv_email_limit, record_inv_email
            allowed, err = check_inv_email_limit(inv.user, invoice_id)
            if not allowed:
                logger.warning(
                    "[EmailTask] Blocked by inv limit: invoice=%s, %s",
                    invoice_id, err.get("message", ""),
                )
                return {"invoice_id": invoice_id, "status": "limit_reached"}
        except Exception as e:
            logger.warning("[EmailTask] Subscription check failed: %s", e)

        result = send_invoice_email(
            invoice_id=invoice_id,
            email_type=email_type,
            recipient_email=recipient_email,
            reminder_day=reminder_day,
            days_context=days_context,
        )

        if result and result.status == "failed":
            raise self.retry(countdown=300)

        # --- Record inv email usage ---
        if result and result.status == "sent":
            try:
                record_inv_email(inv.user, invoice_id)
            except Exception as e:
                logger.warning("[EmailTask] Failed to record usage: %s", e)

        return {
            "invoice_id": invoice_id,
            "email_type": email_type,
            "status": result.status if result else "skipped",
        }
    except self.MaxRetriesExceededError:
        logger.error(f"Max retries for invoice {invoice_id} email_type={email_type}")

        from .celery_signals import _send_telegram
        _send_telegram(
            f"📧 <b>Email max retries exceeded</b>\n"
            f"Invoice: {invoice_id}\n"
            f"Type: {email_type}"
        )

        return {"invoice_id": invoice_id, "status": "max_retries_exceeded"}
    except Exception as e:
        logger.error(f"send_invoice_email_task error: {e}")
        raise self.retry(countdown=300, exc=e)
    



@shared_task(name="send_payment_reminders")
def send_payment_reminders():
    """Ежедневная проверка — автоматические напоминания по invoice_reminder_days."""
    from .models import Invoice, InvoiceSettings, InvSubscription, InvoiceEmail

    today = timezone.localdate()
    count = 0
    errors = 0
    skipped_free = 0

    invoices = Invoice.objects.filter(
        send_payment_reminders=True,
        status__in=["issued", "sent", "partially_paid"],
        due_date__isnull=False,
        buyer_email__gt="",
    ).select_related("user")

    user_settings_cache = {}
    user_sub_cache = {}

    for inv in invoices:
        try:
            user_id = inv.user_id

            # --- Inv subscription check (cached per user) ---
            if user_id not in user_sub_cache:
                sub = InvSubscription.objects.filter(user_id=user_id).first()
                if sub:
                    sub.check_and_expire()
                    user_sub_cache[user_id] = sub.status
                else:
                    user_sub_cache[user_id] = None

            if user_sub_cache[user_id] == "free":
                Invoice.objects.filter(id=inv.id).update(send_payment_reminders=False)
                skipped_free += 1
                continue

            if user_id not in user_settings_cache:
                try:
                    inv_settings = InvoiceSettings.objects.get(user_id=user_id)
                    days_list = inv_settings.invoice_reminder_days or [-7, -1, 3]
                except InvoiceSettings.DoesNotExist:
                    days_list = [-7, -1, 3]
                user_settings_cache[user_id] = days_list

            reminder_days = user_settings_cache[user_id]
            diff = (inv.due_date - today).days

            for rd in reminder_days:
                if diff != -rd:
                    continue

                if rd < 0:
                    email_type = "reminder_before"
                    days_context = abs(rd)
                else:
                    email_type = "reminder_overdue"
                    days_context = rd

                send_invoice_email_task.delay(
                    invoice_id=inv.id,
                    email_type=email_type,
                    reminder_day=rd,
                    days_context=days_context,
                )
                count += 1

        except Exception as e:
            errors += 1
            logger.error(f"Reminder check error for invoice {inv.id}: {e}")

    sent_today = InvoiceEmail.objects.filter(
        email_type__in=["reminder_before", "reminder_overdue"],
        status="sent",
        sent_at__date=today,
    ).count()

    logger.info(
        "Payment reminders: %d queued, %d skipped (free), %d errors, %d sent today",
        count, skipped_free, errors, sent_today,
    )
    return {"queued": count, "skipped_free": skipped_free, "errors": errors, "sent_today": sent_today}


# ════════════════════════════════════════════════════════════
#  Get daily currency rates
# ════════════════════════════════════════════════════════════

@shared_task(name="docscanner_app.tasks.fetch_daily_currency_rates")
def fetch_daily_currency_rates():
    """Ежедневное обновление курсов валют с Lietuvos Bankas."""
    from .utils.update_currency_rates import update_currency_rates
    result = update_currency_rates()
    logger.info("Currency rates: %s", result)
    return result







# ════════════════════════════════════════════════════════════
#  HEALTH MONITORING
# ════════════════════════════════════════════════════════════

@shared_task
def monitor_stuck_sessions():
    """
    Мониторинг + авто-починка зависших сессий и документов.
    Запускается каждые 10 минут через Celery Beat.
    """
    now = timezone.now()
    alerts = []
    fixes = []

    # ─── 1. uploading > 1 час ───
    stuck_uploading = UploadSession.objects.filter(
        stage="uploading",
        updated_at__lt=now - timedelta(hours=1),
    )
    if stuck_uploading.exists():
        ids = list(stuck_uploading.values_list("id", flat=True)[:5])
        alerts.append(
            f"📤 Stuck uploading: {stuck_uploading.count()}\n"
            f"{ids}"
        )

    # ─── 2. processing > 30 мин — WATCHDOG ───
    stuck_processing = UploadSession.objects.filter(
        stage="processing",
        updated_at__lt=now - timedelta(minutes=30),
    )
    for s in stuck_processing:
        pending_docs = ScannedDocument.objects.filter(
            upload_session=s,
            status__in=["processing", "pending"],
        )
        pending_count = pending_docs.count()

        if pending_count == 0:
            # Все доки обработаны — закрываем сессию
            try:
                with transaction.atomic():
                    ss = UploadSession.objects.select_for_update().get(id=s.id)
                    if ss.stage != "processing":
                        continue

                    released = Decimal("0")
                    if ss.reserved_credits > 0:
                        released = ss.reserved_credits
                        u = CustomUser.objects.select_for_update().get(id=ss.user_id)
                        u.credits_reserved = max(
                            (u.credits_reserved or Decimal("0")) - ss.reserved_credits,
                            Decimal("0"),
                        )
                        u.save(update_fields=["credits_reserved"])
                        ss.reserved_credits = Decimal("0")

                    ss.stage = "done"
                    ss.finished_at = now
                    ss.save(update_fields=[
                        "stage", "finished_at", "reserved_credits", "updated_at",
                    ])

                kick_next_session_task.delay(s.user_id)
                fixes.append(
                    f"✅ Session <code>{str(s.id)[:8]}</code> → done\n"
                    f"   done={s.done_items}/{s.actual_items}"
                    + (f", released {released} credits" if released > 0 else "")
                )
            except Exception as e:
                alerts.append(
                    f"⚙️ Session <code>{str(s.id)[:8]}</code> stuck, 0 pending\n"
                    f"   fix failed: {str(e)[:200]}"
                )
        else:
            # Есть зависшие доки — перезапускаем (только unsettled)
            stale_docs = pending_docs.filter(
                uploaded_at__lt=now - timedelta(minutes=20),
                counted_in_session=False,
            )
            requeued = 0
            for d in stale_docs:
                try:
                    process_uploaded_file_task.delay(d.user_id, d.id, s.scan_type)
                    requeued += 1
                except Exception as e:
                    logger.error("[WATCHDOG] Re-queue failed doc %s: %s", d.id, e)

            if requeued:
                fixes.append(
                    f"🔄 Session <code>{str(s.id)[:8]}</code>: "
                    f"re-queued {requeued}/{pending_count} docs"
                )
            else:
                alerts.append(
                    f"⚙️ Session <code>{str(s.id)[:8]}</code> stuck\n"
                    f"   {pending_count} pending, "
                    f"items={s.processed_items}/{s.actual_items}"
                )

    # ─── 3. Сиротские доки (processing > 20 мин, сессия не active) ───
    orphan_docs = ScannedDocument.objects.filter(
        status="processing",
        uploaded_at__lt=now - timedelta(minutes=20),
    ).exclude(
        upload_session__stage="processing",
    )
    if orphan_docs.exists():
        doc_ids = list(orphan_docs.values_list("id", flat=True)[:10])
        alerts.append(
            f"📄 Orphan docs (session not active): "
            f"{orphan_docs.count()}\n{doc_ids}"
        )

    # ─── 4. Утечка credits_reserved ───
    leaked = CustomUser.objects.filter(
        credits_reserved__gt=0,
    ).exclude(
        upload_sessions__stage__in=[
            "processing", "queued", "blocked",
            "credit_check", "uploading",
        ],
    ).distinct()
    if leaked.exists():
        for u in leaked[:5]:
            alerts.append(
                f"💰 Leaked credits: {u.email}\n"
                f"   reserved={u.credits_reserved}"
            )

    # ─── 5. queued > 10 мин без processing у юзера ───
    stuck_queued = UploadSession.objects.filter(
        stage="queued",
        updated_at__lt=now - timedelta(minutes=10),
    )
    for sq in stuck_queued:
        has_active = UploadSession.objects.filter(
            user_id=sq.user_id,
            stage="processing",
        ).exists()
        if not has_active:
            try:
                kick_next_session_task.delay(sq.user_id)
                wait_min = (now - sq.updated_at).seconds // 60
                fixes.append(
                    f"🚀 Kicked queued session <code>{str(sq.id)[:8]}</code>\n"
                    f"   waiting {wait_min}m, user_id={sq.user_id}"
                )
            except Exception as e:
                alerts.append(
                    f"📋 Queued session <code>{str(sq.id)[:8]}</code> stuck\n"
                    f"   kick failed: {str(e)[:200]}"
                )

    # ─── Telegram ───
    from .celery_signals import _send_telegram

    if fixes and not alerts:
        msg = (
            f"🔧 <b>Watchdog auto-fix</b>\n\n"
            + "\n\n".join(fixes)
            + "\n\n✅ <i>Action not needed — all issues resolved automatically</i>"
        )
        _send_telegram(msg)
        logger.info("[WATCHDOG] %d fixes applied, 0 alerts", len(fixes))

    elif fixes and alerts:
        msg = (
            f"🔧 <b>Watchdog auto-fix</b>\n\n"
            + "\n\n".join(fixes)
            + "\n\n✅ <i>Action not needed — resolved automatically</i>"
        )
        _send_telegram(msg)

        msg = (
            f"⚠️ <b>System health alert</b>\n\n"
            + "\n\n".join(alerts)
            + "\n\n🚨 <i>Manual action needed — check pgAdmin / shell</i>"
        )
        _send_telegram(msg)
        logger.warning("[MONITOR] %d fixes, %d alerts", len(fixes), len(alerts))

    elif alerts:
        msg = (
            f"⚠️ <b>System health alert</b>\n\n"
            + "\n\n".join(alerts)
            + "\n\n🚨 <i>Manual action needed — check pgAdmin / shell</i>"
        )
        _send_telegram(msg)
        logger.warning("[MONITOR] %d alerts", len(alerts))

    return {"alerts": len(alerts), "fixes": len(fixes)}



# ══════════════════════════════════════════════════════════
#  Fetch LT companies + addresses -> import to Company model
# ══════════════════════════════════════════════════════════

@shared_task
def sync_lt_companies_weekly():
    """Weekly sync: companies (incremental) + addresses."""
    logger.info("sync_lt_companies_weekly: start")
    results = []
    errors = []

    try:
        result1 = sync_companies_from_vmi(full=False)
        results.append(result1)
    except Exception as e:
        logger.error(f"sync_lt_companies_weekly: companies error: {e}")
        errors.append(f"Companies: {e}")

    try:
        result2 = sync_addresses_from_jar()
        results.append(result2)
    except Exception as e:
        logger.error(f"sync_lt_companies_weekly: addresses error: {e}")
        errors.append(f"Addresses: {e}")

    # Telegram notification
    if errors:
        msg = (
            "<b>LT Companies Sync FAILED</b>\n\n"
            + "\n".join(f"✅ {r}" for r in results)
            + ("\n" if results else "")
            + "\n".join(f"❌ {e}" for e in errors)
        )
    else:
        msg = (
            "<b>LT Companies Sync OK</b>\n\n"
            + "\n".join(f"✅ {r}" for r in results)
        )

    _send_telegram(msg)
    logger.info("sync_lt_companies_weekly: done")








# # ════════════════════════════════════════════════
# #  Синхронизация одной папки
# # ════════════════════════════════════════════════

# @shared_task(bind=True, max_retries=3, default_retry_delay=60)
# def sync_cloud_folder(self, cloud_folder_id, event_type="webhook"):
#     from .models import CloudClientFolder, MobileInboxDocument
#     from .cloud_services import get_cloud_service

#     try:
#         folder = CloudClientFolder.objects.select_related(
#             "connection", "connection__user", "cloud_client"
#         ).get(id=cloud_folder_id, is_active=True)
#     except CloudClientFolder.DoesNotExist:
#         logger.warning("CloudClientFolder %s not found", cloud_folder_id)
#         return

#     connection = folder.connection
#     if not connection.is_active:
#         return

#     user = connection.user
#     service = get_cloud_service(connection.provider)

#     ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"}

#     try:
#         service.refresh_token_if_needed(connection)
#         new_files = service.list_new_files(connection, folder.remote_folder_id)

#         logger.info(
#             "Folder %s (%s): %d new files",
#             folder.cloud_client.name, connection.provider, len(new_files),
#         )

#         for cloud_file in new_files:
#             try:
#                 # Дедупликация
#                 if MobileInboxDocument.objects.filter(
#                     user=user, remote_file_id=cloud_file.file_id,
#                 ).exists():
#                     continue

#                 # Проверка расширения
#                 ext = ""
#                 if "." in cloud_file.name:
#                     ext = "." + cloud_file.name.rsplit(".", 1)[-1].lower()
#                 if ext not in ALLOWED_EXT:
#                     continue

#                 # Скачиваем
#                 content_bytes, filename = service.download_file(
#                     connection, cloud_file.file_id
#                 )

#                 # Сохраняем в MobileInboxDocument
#                 doc = MobileInboxDocument(
#                     user=user,
#                     original_filename=filename,
#                     size_bytes=len(content_bytes),
#                     source=connection.provider,
#                     cloud_client=folder.cloud_client,
#                     remote_file_id=cloud_file.file_id,
#                     rename_status="pending",
#                 )
#                 doc.uploaded_file.save(filename, ContentFile(content_bytes), save=False)
#                 doc.save()

#                 # Сразу ренеймим в облаке → ISSIUSTA_ = файл доставлен в DokSkenas
#                 date_str = timezone.now().strftime("%Y%m%d")
#                 new_name = f"ISSIUSTA_{date_str}_{filename}"
#                 if len(new_name) > 250:
#                     base, fext = (new_name.rsplit(".", 1) if "." in new_name else (new_name, ""))
#                     new_name = f"{base[:250 - len(fext) - 1]}.{fext}" if fext else base[:250]

#                 try:
#                     ok = service.rename_file(connection, cloud_file.file_id, new_name)
#                     doc.rename_status = "done" if ok else "failed"
#                     doc.save(update_fields=["rename_status"])
#                 except Exception as rename_err:
#                     logger.warning("Rename failed for %s: %s", filename, rename_err)
#                     doc.rename_status = "failed"
#                     doc.save(update_fields=["rename_status"])

#                 logger.info("Downloaded + renamed: %s -> doc %d", filename, doc.id)

#             except Exception as e:
#                 # Скачивание не удалось → помечаем файл как KLAIDA_ в облаке
#                 try:
#                     date_str = timezone.now().strftime("%Y%m%d")
#                     err_name = f"KLAIDA_{date_str}_{cloud_file.name}"
#                     if len(err_name) > 250:
#                         base, fext = (err_name.rsplit(".", 1) if "." in err_name else (err_name, ""))
#                         err_name = f"{base[:250 - len(fext) - 1]}.{fext}" if fext else base[:250]
#                     service.rename_file(connection, cloud_file.file_id, err_name)
#                 except Exception:
#                     pass
#                 logger.error("Error downloading %s: %s", cloud_file.name, e, exc_info=True)

#         folder.last_polled_at = timezone.now()
#         folder.save(update_fields=["last_polled_at"])
#         connection.last_synced_at = timezone.now()
#         connection.save(update_fields=["last_synced_at"])

#     except Exception as e:
#         logger.error("Sync failed for folder %s: %s", cloud_folder_id, e, exc_info=True)
#         if self.request.retries < self.max_retries:
#             raise self.retry(exc=e)

