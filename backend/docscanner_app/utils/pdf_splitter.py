"""
pdf_splitter.py — Разбиение PDF с несколькими документами на отдельные файлы.

Два уровня:
  1. Native text extraction + regex (бесплатно, мгновенно)
  2. Gemini Flash Lite vision (для сканов и неоднозначных случаев)

Поддержка:
  - PDF с 2+ страницами → батчи по 10 + верификация стыков
  - Не-PDF / PDF 1 стр. с несколькими документами → Gemini OCR с разделением
"""
import base64
import json
import logging
import re
import time
from typing import Optional

import fitz  # PyMuPDF

logger = logging.getLogger("docscanner_app")

DEBUG_GEMINI_RAW_LOGS = True
DEBUG_GEMINI_RAW_LOG_LIMIT = 8000


def _log_gemini_raw(label: str, raw: str, **ctx):
    """
    TEMP DEBUG.
    Логирует сырой ответ Gemini с контекстом.
    Потом поставить DEBUG_GEMINI_RAW_LOGS = False или удалить.
    """
    if not DEBUG_GEMINI_RAW_LOGS:
        return

    text = raw or ""
    preview = text.replace("\r", "\\r").replace("\n", "\\n")

    if len(preview) > DEBUG_GEMINI_RAW_LOG_LIMIT:
        preview = preview[:DEBUG_GEMINI_RAW_LOG_LIMIT] + "...<truncated>"

    logger.warning(
        "[GEMINI-RAW] %s ctx=%s len=%d raw=%s",
        label,
        ctx,
        len(text),
        preview,
    )

# ═══════════════════════════════════════════════════════════════════════════════
# PDF UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_pdf_page_count(pdf_path: str) -> int:
    doc = fitz.open(pdf_path)
    count = len(doc)
    doc.close()
    return count


def extract_pages_as_pdf_bytes(pdf_path: str, page_numbers: list[int]) -> bytes:
    """Вырезает указанные страницы (0-based) в отдельный PDF, возвращает bytes."""
    src = fitz.open(pdf_path)
    dst = fitz.open()
    for pn in page_numbers:
        if 0 <= pn < len(src):
            dst.insert_pdf(src, from_page=pn, to_page=pn)
    pdf_bytes = dst.tobytes()
    dst.close()
    src.close()
    return pdf_bytes


def is_pdf_file(file_path: str) -> bool:
    try:
        doc = fitz.open(file_path)
        ok = doc.is_pdf
        doc.close()
        return ok
    except Exception:
        return False
    
def _count_pages_in_bytes(pdf_bytes: bytes) -> int:
    """Считает страницы в PDF-байтах."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        count = len(doc)
        doc.close()
        return count
    except Exception:
        return 0


def _maybe_compress_pdf_bytes(pdf_bytes: bytes) -> bytes:
    """
    Если PDF-батч слишком большой для Gemini inline (>20MB),
    рендерим страницы в пониженном DPI и пересобираем в новый PDF.
    Пробуем 150 → 100 → 72 DPI пока не влезет.
    """
    if len(pdf_bytes) <= MAX_GEMINI_BATCH_BYTES:
        return pdf_bytes

    page_count = _count_pages_in_bytes(pdf_bytes)

    for dpi in (150, 100, 72):
        logger.info(
            "[PDF-SPLIT] Batch too large (%d bytes, %d pages), compressing to %d DPI",
            len(pdf_bytes), page_count, dpi,
        )

        try:
            src = fitz.open(stream=pdf_bytes, filetype="pdf")
            dst = fitz.open()

            zoom = dpi / 72
            mat = fitz.Matrix(zoom, zoom)

            for page in src:
                pix = page.get_pixmap(matrix=mat, alpha=False)

                img_pdf = fitz.open()
                img_page = img_pdf.new_page(
                    width=pix.width * 72 / dpi,
                    height=pix.height * 72 / dpi,
                )
                img_page.insert_image(img_page.rect, pixmap=pix)

                dst.insert_pdf(img_pdf)
                img_pdf.close()

            compressed = dst.tobytes(deflate=True)
            dst.close()
            src.close()

            logger.info(
                "[PDF-SPLIT] Compressed at %d DPI: %d → %d bytes (%.0f%% reduction)",
                dpi, len(pdf_bytes), len(compressed),
                (1 - len(compressed) / len(pdf_bytes)) * 100,
            )

            if len(compressed) <= MAX_GEMINI_BATCH_BYTES:
                return compressed

            # Не влезло — пробуем ещё ниже
            logger.warning(
                "[PDF-SPLIT] Still too large at %d DPI (%d bytes), trying lower",
                dpi, len(compressed),
            )

        except Exception as e:
            logger.warning("[PDF-SPLIT] Compression at %d DPI failed: %s", dpi, e)
            break

    logger.warning("[PDF-SPLIT] Could not compress below %d bytes, using last result", MAX_GEMINI_BATCH_BYTES)
    return compressed


# ═══════════════════════════════════════════════════════════════════════════════
# LEVEL 1: NATIVE TEXT + REGEX (бесплатно)
# ═══════════════════════════════════════════════════════════════════════════════

FIRST_PAGE_RE = re.compile(
    r'(?i)'
    r'(PVM\s+s[aą]skaita|s[aą]skaita[\s\-]*fakt[uū]ra|'
    r'INVOICE\s*(No|Nr|Number)|'
    r'Serija\s+[A-Z]+\s+Nr|'
    r'Krediti[nė]+\s+s[aą]skaita|'
    r'Debeti[nė]+\s+s[aą]skaita|'
    r'I[sš]ankstin[eė]\s+s[aą]skaita)',
)


def try_native_split(pdf_path: str) -> Optional[list[list[int]]]:
    """
    Пробует разбить PDF по нативному тексту.
    Возвращает список групп страниц (0-based) или None если PDF — скан / неоднозначно.
    """
    try:
        doc = fitz.open(pdf_path)
    except Exception:
        return None

    total = len(doc)
    if total < 2:
        doc.close()
        return None

    pages_text = []
    for page in doc:
        text = page.get_text().strip()
        pages_text.append(text)
    doc.close()

    # Если >30% страниц почти без текста — это скан
    empty_count = sum(1 for t in pages_text if len(t) < 50)
    if empty_count / total > 0.3:
        return None

    # Ищем маркеры первой страницы (только в верхних 500 символах)
    boundaries = [0]
    for i in range(1, total):
        header = pages_text[i][:500]
        if FIRST_PAGE_RE.search(header):
            boundaries.append(i)

    # Если нашли только начало — regex не помог, пусть LLM разбирается
    if len(boundaries) <= 1 and total > 3:
        return None

    # Проверка: осмысленный ли текст
    all_text = " ".join(pages_text)
    readable = sum(1 for c in all_text if c.isalnum() or c.isspace() or c in '.,;:-/()€$%')
    if readable / max(len(all_text), 1) < 0.6:
        return None

    # Группируем
    groups = []
    for idx, start in enumerate(boundaries):
        end = boundaries[idx + 1] if idx + 1 < len(boundaries) else total
        groups.append(list(range(start, end)))

    return groups



def _gemini_client():
    """Lazy import чтобы не ломать тесты без API key."""
    from .gemini import gemini_client
    return gemini_client


def _ask_gemini_pdf(pdf_bytes: bytes, prompt: str, model: str = "gemini-flash-lite-latest") -> str:
    """Отправляет PDF + текстовый промпт в Gemini с retry при rate limit."""
    from google.genai import types
    import time as _time

    pdf_bytes = _maybe_compress_pdf_bytes(pdf_bytes)

    client = _gemini_client()
    max_retries = 2
    last_exc = None

    for attempt in range(max_retries + 1):
        try:
            t0 = _time.perf_counter()
            response = client.models.generate_content(
                model=model,
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                            types.Part.from_text(text=prompt),
                        ],
                    )
                ],
                config={"temperature": 0, "max_output_tokens": 4096},
            )
            elapsed = _time.perf_counter() - t0
            result = (getattr(response, "text", "") or "").strip()
            logger.info(
                "[PDF-SPLIT] Gemini response: model=%s attempt=%d elapsed=%.2fs len=%d",
                model, attempt + 1, elapsed, len(result),
            )
            return result

        except Exception as e:
            last_exc = e
            msg = str(e).lower()
            is_rate_limit = any(k in msg for k in ("429", "resource_exhausted", "rate limit", "too many"))

            if is_rate_limit and attempt < max_retries:
                wait = 30 * (attempt + 1)
                logger.warning(
                    "[PDF-SPLIT] Rate limit (attempt %d/%d), waiting %ds: %s",
                    attempt + 1, max_retries + 1, wait, e,
                )
                _time.sleep(wait)
                continue

            logger.error("[PDF-SPLIT] Gemini failed (attempt %d/%d): %s", attempt + 1, max_retries + 1, e)
            raise

    raise last_exc


def _ask_gemini_image(file_bytes: bytes, mime_type: str, prompt: str,
                      model: str = "gemini-flash-lite-latest") -> str:
    """Отправляет изображение/PDF + промпт в Gemini для OCR-разделения."""
    from google.genai import types

    client = _gemini_client()

    t0 = time.perf_counter()
    response = client.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
                    types.Part.from_text(text=prompt),
                ],
            )
        ],
        config={"temperature": 0, "max_output_tokens": 16000},
    )
    elapsed = time.perf_counter() - t0
    result = (getattr(response, "text", "") or "").strip()
    logger.info(
        "[PDF-SPLIT] Gemini OCR separate: model=%s elapsed=%.2fs len=%d",
        model, elapsed, len(result),
    )
    return result


def _parse_split_json(raw: str) -> dict:
    """Парсит JSON-ответ от Gemini, убирая markdown-обёртки."""
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    m = re.search(r"\{.*\}", s, flags=re.DOTALL)
    if not m:
        raise ValueError(f"No JSON found in Gemini response: {raw[:300]}")
    return json.loads(m.group(0))


BATCH_SIZE = 25
BOUNDARY_CONTEXT_RADIUS = 2
MAX_BOUNDARY_VERIFY_PASSES = 5

MAX_GEMINI_BATCH_BYTES = 20 * 1024 * 1024  # 20 MB
DOWNSCALE_DPI = 150


def _norm_code(value) -> str:
    if value is None:
        return ""
    return re.sub(r"[^0-9A-Za-zА-Яа-яĄČĘĖĮŠŲŪŽąčęėįšųūž]+", "", str(value)).upper()


def _normalize_confidence(value) -> str:
    v = (value or "").strip().lower()
    if v in ("high", "medium", "low"):
        return v
    return "medium"

def _as_bool(value, default=False) -> bool:
    if isinstance(value, bool):
        return value

    if value is None:
        return default

    if isinstance(value, (int, float)):
        return bool(value)

    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("true", "1", "yes", "y", "taip"):
            return True
        if v in ("false", "0", "no", "n", "ne"):
            return False

    return default


def _safe_int(value, default=0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _normalize_batch_pages(raw_pages: list, page_start: int, page_end: int) -> list[int]:
    """
    Gemini иногда возвращает страницы как:
    - original 1-based: [11, 12, 13]
    - relative 1-based внутри batch-а: [1, 2, 3]

    Возвращаем 0-based страницы оригинального PDF строго внутри page_start/page_end.
    """
    if not raw_pages:
        return []

    nums = []
    for p in raw_pages:
        try:
            nums.append(int(p))
        except Exception:
            continue

    if not nums:
        return []

    original_pages = [n - 1 for n in nums]
    relative_pages = [page_start + n - 1 for n in nums]

    original_hits = sum(1 for p in original_pages if page_start <= p < page_end)
    relative_hits = sum(1 for p in relative_pages if page_start <= p < page_end)

    if page_start > 0 and relative_hits > original_hits:
        chosen = relative_pages
    else:
        chosen = original_pages

    cleaned = []
    seen = set()

    for p in chosen:
        if page_start <= p < page_end and p not in seen:
            cleaned.append(p)
            seen.add(p)

    return cleaned


def _clean_group(group: dict) -> dict:
    pages = []

    for p in group.get("pages", []) or []:
        try:
            pages.append(int(p))
        except Exception:
            continue

    pages = sorted(set(pages))

    # Нормализуем numbers массив
    raw_numbers = group.get("numbers") or []
    numbers = []
    for item in raw_numbers:
        if isinstance(item, dict) and item.get("number"):
            numbers.append({
                "number": item["number"],
                "series": item.get("series"),
            })

    return {
        "pages": pages,
        "number": group.get("number"),
        "series": group.get("series"),
        "numbers": numbers,
        "multiple_on_page": _as_bool(group.get("multiple_on_page"), False),
        "documents_on_page": _safe_int(group.get("documents_on_page"), 0),
        "complete": _as_bool(group.get("complete"), True),
        "continues_previous": _as_bool(group.get("continues_previous"), False),
        "confidence": _normalize_confidence(group.get("confidence")),
        "method": group.get("method", "gemini"),
    }


def _group_sort_key(group: dict) -> int:
    pages = group.get("pages") or []
    return min(pages) if pages else 10**9

def _logical_doc_count(groups: list[dict]) -> int:
    """
    Считает реальное количество документов по нормализованным группам.
    Не доверяем total_docs от Gemini.
    """
    total = 0

    for group in groups:
        if _as_bool(group.get("multiple_on_page"), False):
            total += max(_safe_int(group.get("documents_on_page"), 0), 1)
        else:
            total += 1

    return max(total, 1)


def _collapse_same_page_multi_docs(groups: list[dict]) -> list[dict]:
    """
    Gemini иногда возвращает несколько документов на одной странице так:

    [
      {"pages": [3], "number": "A", "multiple_on_page": true},
      {"pages": [3], "number": "B", "multiple_on_page": true},
      {"pages": [3], "number": "C", "multiple_on_page": true}
    ]

    Для downstream это надо превратить в одну группу:
    {"pages": [3], "multiple_on_page": true, "documents_on_page": 3}

    Иначе одна и та же страница будет обрабатываться несколько раз.
    """
    cleaned = []

    for group in groups:
        cg = _clean_group(group)
        if cg["pages"]:
            cleaned.append(cg)

    single_page_buckets = {}
    result = []

    for group in cleaned:
        pages = group.get("pages") or []

        if len(pages) == 1:
            page = pages[0]
            single_page_buckets.setdefault(page, []).append(group)
        else:
            result.append(group)

    for page, items in single_page_buckets.items():
        has_multi_signal = (
            len(items) > 1
            or any(_as_bool(item.get("multiple_on_page"), False) for item in items)
        )

        if not has_multi_signal:
            result.append(items[0])
            continue

        declared_counts = [
            _safe_int(item.get("documents_on_page"), 0)
            for item in items
        ]

        documents_on_page = max(
            len(items),
            max(declared_counts) if declared_counts else 0,
            1,
        )

        collected_numbers = []
        for item in items:
            # Если у записи уже есть numbers массив (Gemini вернул правильно)
            existing_numbers = item.get("numbers") or []
            if existing_numbers:
                for n in existing_numbers:
                    if isinstance(n, dict) and n.get("number"):
                        collected_numbers.append({
                            "number": n["number"],
                            "series": n.get("series"),
                        })
            elif item.get("number"):
                collected_numbers.append({
                    "number": item["number"],
                    "series": item.get("series"),
                })

        collapsed = {
            "pages": [page],
            "number": None,
            "series": None,
            "numbers": collected_numbers,
            "multiple_on_page": documents_on_page > 1,
            "documents_on_page": documents_on_page,
            "complete": all(_as_bool(item.get("complete"), True) for item in items),
            "continues_previous": any(_as_bool(item.get("continues_previous"), False) for item in items),
            "confidence": "medium",
            "method": "gemini_same_page_collapsed",
        }

        logger.warning(
            "[PDF-SPLIT] Collapsed same-page docs: page=%d entries=%d documents_on_page=%d numbers=%s",
            page + 1,
            len(items),
            documents_on_page,
            collected_numbers,
        )

        result.append(collapsed)

    result.sort(key=_group_sort_key)
    return result


def _merge_group_meta(left: dict, right: dict) -> dict:
    merged_pages = sorted(set((left.get("pages") or []) + (right.get("pages") or [])))

    # Merge numbers arrays
    merged_numbers = list(left.get("numbers") or []) + list(right.get("numbers") or [])

    return {
        "pages": merged_pages,
        "number": left.get("number") or right.get("number"),
        "series": left.get("series") or right.get("series"),
        "numbers": merged_numbers,
        "multiple_on_page": (
            _as_bool(left.get("multiple_on_page"), False)
            or _as_bool(right.get("multiple_on_page"), False)
        ),
        "documents_on_page": max(
            _safe_int(left.get("documents_on_page"), 0),
            _safe_int(right.get("documents_on_page"), 0),
        ),
        "complete": _as_bool(right.get("complete"), True),
        "continues_previous": _as_bool(left.get("continues_previous"), False),
        "confidence": (
            "high"
            if left.get("confidence") == "high" and right.get("confidence") == "high"
            else "medium"
        ),
        "method": "gemini_verified",
    }


def _same_identity(left: dict, right: dict) -> bool:
    left_number = _norm_code(left.get("number"))
    right_number = _norm_code(right.get("number"))
    left_series = _norm_code(left.get("series"))
    right_series = _norm_code(right.get("series"))

    if left_number and right_number and left_number == right_number:
        if left_series and right_series:
            return left_series == right_series
        return True

    return False


def _find_suspicious_boundaries(groups: list[dict]) -> list[dict]:
    """
    Возвращает только те стыки, которые надо перепроверить verifier-ом.
    """
    cleaned = [_clean_group(g) for g in groups if g.get("pages")]
    cleaned.sort(key=_group_sort_key)

    boundaries = []

    for idx in range(len(cleaned) - 1):
        left = cleaned[idx]
        right = cleaned[idx + 1]

        left_end = max(left["pages"])
        right_start = min(right["pages"])

        reasons = []

        if right_start != left_end + 1:
            reasons.append("gap_or_overlap")

        if left.get("complete") is False:
            reasons.append("left_incomplete")

        if right.get("continues_previous") is True:
            reasons.append("right_continues_previous")

        if _same_identity(left, right):
            reasons.append("same_number_series")

        if left.get("confidence") == "low" or right.get("confidence") == "low":
            reasons.append("low_confidence")

        if reasons:
            boundaries.append({
                "index": idx,
                "left_page": left_end,
                "right_page": right_start,
                "reasons": reasons,
            })

    return boundaries


def _verify_boundary_context(
    pdf_path: str,
    left_page: int,
    right_page: int,
    total_pages: int,
) -> dict:
    """
    Проверяет локальный стык.
    left_page/right_page: 0-based страницы вокруг границы.

    Возвращает:
    {
        "ok": True,
        "confidence": "high|medium|low",
        "same_document_across_boundary": bool,
        "context_pages": [0-based pages],
        "boundary_pages": [0-based pages],
        "documents_in_context": [...],
        "reason": "..."
    }
    """
    context_start = max(0, left_page - (BOUNDARY_CONTEXT_RADIUS - 1))
    context_end = min(total_pages, right_page + BOUNDARY_CONTEXT_RADIUS)

    context_pages = list(range(context_start, context_end))
    pdf_bytes = extract_pages_as_pdf_bytes(pdf_path, context_pages)

    prompt = BOUNDARY_VERIFY_PROMPT_TEMPLATE.format(
        context_start=context_start + 1,
        context_end=context_end,
        left_page=left_page + 1,
        right_page=right_page + 1,
    )

    raw = _ask_gemini_pdf(pdf_bytes, prompt)

    _log_gemini_raw(
        "boundary_verify",
        raw,
        left_page=left_page + 1,
        right_page=right_page + 1,
        context=f"{context_start + 1}-{context_end}",
    )

    logger.info("[PDF-SPLIT] Boundary verifier raw response: %s", raw[:2000])

    result = _parse_split_json(raw)

    confidence = _normalize_confidence(result.get("confidence"))
    docs_in_context = result.get("documents_in_context") or []

    normalized_docs = []

    for item in docs_in_context:
        pages = _normalize_batch_pages(
            item.get("pages") or [],
            context_start,
            context_end,
        )

        if not pages:
            continue

        relation = (item.get("relation") or "").strip().lower()

        if relation not in (
            "previous_document",
            "boundary_document",
            "next_document",
            "unknown",
        ):
            relation = "unknown"

        normalized_docs.append({
            "pages": pages,
            "relation": relation,
        })

    explicit_same = result.get("same_document_across_boundary")

    if isinstance(explicit_same, bool):
        same_document = explicit_same
    else:
        same_document = any(
            left_page in d["pages"] and right_page in d["pages"]
            for d in normalized_docs
        )

    boundary_pages = []

    for d in normalized_docs:
        touches_both_sides = (
            left_page in d["pages"]
            and right_page in d["pages"]
        )

        if d["relation"] == "boundary_document" or touches_both_sides:
            boundary_pages.extend(d["pages"])

    boundary_pages = sorted(set(boundary_pages))

    return {
        "ok": True,
        "confidence": confidence,
        "same_document_across_boundary": same_document,
        "context_pages": context_pages,
        "boundary_pages": boundary_pages,
        "documents_in_context": normalized_docs,
        "reason": result.get("reason") or "",
    }


def _merge_boundary_groups(
    groups: list[dict],
    boundary_index: int,
    verification: dict,
) -> tuple[list[dict], bool]:
    """
    Если verifier подтвердил, что стык это один документ,
    мержим две группы вокруг стыка.

    Если verifier сказал, что boundary document захватывает соседнюю страницу
    из контекста, тоже переносим её в merged group.
    """
    if boundary_index < 0 or boundary_index >= len(groups) - 1:
        return groups, False

    left = _clean_group(groups[boundary_index])
    right = _clean_group(groups[boundary_index + 1])

    same_document = verification.get("same_document_across_boundary")
    confidence = verification.get("confidence", "medium")

    should_merge = False

    if same_document is True and confidence in ("high", "medium"):
        should_merge = True

    if same_document is None:
        if left.get("complete") is False and right.get("continues_previous") is True:
            should_merge = True

    if not should_merge:
        return groups, False

    target_pages = set(left["pages"]) | set(right["pages"])

    context_pages = set(verification.get("context_pages") or [])
    boundary_pages = set(verification.get("boundary_pages") or [])

    for p in boundary_pages:
        if p in context_pages:
            target_pages.add(p)

    merged = _merge_group_meta(left, right)
    merged["pages"] = sorted(target_pages)
    merged["method"] = "gemini_boundary_verified"

    new_groups = []

    for idx, group in enumerate(groups):
        cleaned = _clean_group(group)
        remaining = [p for p in cleaned["pages"] if p not in target_pages]

        if not remaining:
            continue

        cleaned["pages"] = sorted(remaining)
        new_groups.append(cleaned)

    new_groups.append(merged)
    new_groups.sort(key=_group_sort_key)

    return new_groups, True


def _finalize_groups_or_raise(groups: list[dict], total_pages: int) -> list[dict]:
    """
    Финальная строгая проверка карты страниц.
    """
    cleaned = []

    for g in groups:
        cg = _clean_group(g)
        if cg["pages"]:
            cleaned.append(cg)

    cleaned.sort(key=_group_sort_key)

    if not cleaned:
        raise ValueError("PDF split produced empty page map")

    ownership = {}

    for idx, group in enumerate(cleaned):
        for p in group["pages"]:
            if p < 0 or p >= total_pages:
                raise ValueError(f"Page out of range in split map: {p + 1}")

            ownership.setdefault(p, []).append(idx)

    missing = [p for p in range(total_pages) if p not in ownership]
    overlaps = {
        p: owners
        for p, owners in ownership.items()
        if len(owners) > 1
    }

    if overlaps:
        bad = [p + 1 for p in sorted(overlaps.keys())[:10]]
        raise ValueError(f"Overlapping pages in split map: {bad}")

    if missing:
        logger.warning(
            "[PDF-SPLIT] Missing pages in final map, attaching to nearest groups: %s",
            [p + 1 for p in missing],
        )

        if len(missing) > 3:
            raise ValueError(f"Too many missing pages in split map: {[p + 1 for p in missing[:10]]}")

        for p in missing:
            nearest = min(
                cleaned,
                key=lambda g: min(abs(p - x) for x in g["pages"]),
            )
            nearest["pages"].append(p)
            nearest["pages"] = sorted(set(nearest["pages"]))

    for group in cleaned:
        pages = sorted(group["pages"])

        if len(pages) > 1:
            expected = list(range(pages[0], pages[-1] + 1))
            if pages != expected:
                raise ValueError(
                    f"Non-contiguous document pages in split map: {[p + 1 for p in pages]}"
                )

        group["pages"] = pages

    return cleaned

# ─── Classify batch ───────────────────────────────────────────────────────────

def _classify_batch(
    pdf_path: str,
    page_start: int,
    page_end: int,
    total_pages: int,
    is_first_batch: bool,
) -> dict:
    """
    Отправляет batch страниц в Gemini и возвращает JSON с группировкой.
    page_start/page_end: 0-based.
    """
    pages = list(range(page_start, page_end))
    pdf_bytes = extract_pages_as_pdf_bytes(pdf_path, pages)

    prompt = SPLIT_PROMPT_TEMPLATE.format(
        total=total_pages,
        start=page_start + 1,
        end=page_end,
        continuation_note=CONTINUATION_NOTE_FIRST if is_first_batch else CONTINUATION_NOTE_MIDDLE,
    )

    raw = _ask_gemini_pdf(pdf_bytes, prompt)

    _log_gemini_raw(
        "split_batch",
        raw,
        pages=f"{page_start + 1}-{page_end}",
        total_pages=total_pages,
        is_first_batch=is_first_batch,
    )

    logger.info("[PDF-SPLIT] Raw batch response: %s", raw[:2000])

    result = _parse_split_json(raw)
    docs = result.get("documents", [])

    normalized_docs = []

    for item in docs:
        raw_pages = item.get("pages", [])
        pages = _normalize_batch_pages(raw_pages, page_start, page_end)

        if not pages:
            continue

        normalized_docs.append({
            "pages": pages,
            "continues_previous": _as_bool(item.get("continues_previous"), False),
            "complete": _as_bool(item.get("complete"), True),
            "number": item.get("number"),
            "series": item.get("series"),
            "numbers": item.get("numbers") or [],
            "multiple_on_page": _as_bool(item.get("multiple_on_page"), False),
            "documents_on_page": _safe_int(item.get("documents_on_page"), 0),
            "confidence": _normalize_confidence(item.get("confidence")),
            "method": "gemini_batch",
        })

    normalized_docs = _collapse_same_page_multi_docs(normalized_docs)
    result["documents"] = normalized_docs

    logger.info(
        "[PDF-SPLIT] Batch pages %d-%d: groups=%d logical_docs=%d",
        page_start + 1,
        page_end,
        len(normalized_docs),
        _logical_doc_count(normalized_docs),
    )

    return result


# ─── Main split logic ─────────────────────────────────────────────────────────


def classify_pdf_pages(pdf_path: str, total_pages: int) -> list[dict]:
    """
    Определяет группировку страниц PDF по документам.

    Pipeline:
    1. Batch pass по 10 страниц
    2. Draft page map
    3. Boundary verifier только на подозрительных стыках
    4. Final validation
    """
    if total_pages < 1:
        return []

    if total_pages == 1:
        return [{
            "pages": [0],
            "number": None,
            "series": None,
            "multiple_on_page": False,
            "documents_on_page": 0,
            "method": "single_page",
        }]

    groups = []

    for batch_index, page_start in enumerate(range(0, total_pages, BATCH_SIZE), start=1):
        page_end = min(page_start + BATCH_SIZE, total_pages)

        logger.info(
            "[PDF-SPLIT] Batch %d: pages %d-%d of %d",
            batch_index,
            page_start + 1,
            page_end,
            total_pages,
        )

        try:
            result = _classify_batch(
                pdf_path=pdf_path,
                page_start=page_start,
                page_end=page_end,
                total_pages=total_pages,
                is_first_batch=(batch_index == 1),
            )
            batch_docs = result.get("documents", [])
        except Exception as e:
            logger.warning(
                "[PDF-SPLIT] Batch classification failed for pages %d-%d: %s",
                page_start + 1,
                page_end,
                e,
            )
            batch_docs = []

        if not batch_docs:
            fallback_group = {
                "pages": list(range(page_start, page_end)),
                "number": None,
                "series": None,
                "multiple_on_page": False,
                "documents_on_page": 0,
                "complete": True,
                "continues_previous": False,
                "confidence": "low",
                "method": "batch_fallback",
            }
            groups.append(fallback_group)
            continue

        for item in batch_docs:
            groups.append(_clean_group(item))

    groups.sort(key=_group_sort_key)

    logger.info(
        "[PDF-SPLIT] Draft groups before verification: %s",
        [
            {
                "pages": [p + 1 for p in g.get("pages", [])],
                "number": g.get("number"),
                "series": g.get("series"),
                "complete": g.get("complete"),
                "continues_previous": g.get("continues_previous"),
            }
            for g in groups
        ],
    )

    verified_boundaries = set()

    for verify_pass in range(1, MAX_BOUNDARY_VERIFY_PASSES + 1):
        groups.sort(key=_group_sort_key)
        boundaries = _find_suspicious_boundaries(groups)

        pending = [
            b for b in boundaries
            if (b["left_page"], b["right_page"]) not in verified_boundaries
        ]

        if not pending:
            break

        changed = False

        for boundary in pending:
            key = (boundary["left_page"], boundary["right_page"])
            verified_boundaries.add(key)

            logger.info(
                "[PDF-SPLIT] Verify boundary pass=%d pages %d-%d reasons=%s",
                verify_pass,
                boundary["left_page"] + 1,
                boundary["right_page"] + 1,
                boundary["reasons"],
            )

            try:
                verification = _verify_boundary_context(
                    pdf_path=pdf_path,
                    left_page=boundary["left_page"],
                    right_page=boundary["right_page"],
                    total_pages=total_pages,
                )
            except Exception as e:
                logger.warning(
                    "[PDF-SPLIT] Boundary verification failed pages %d-%d: %s",
                    boundary["left_page"] + 1,
                    boundary["right_page"] + 1,
                    e,
                )

                verification = {
                    "ok": False,
                    "confidence": "low",
                    "same_document_across_boundary": None,
                    "context_pages": [],
                    "boundary_pages": [],
                    "reason": str(e),
                }

            groups, did_merge = _merge_boundary_groups(
                groups=groups,
                boundary_index=boundary["index"],
                verification=verification,
            )

            if did_merge:
                changed = True
                logger.info(
                    "[PDF-SPLIT] Boundary merged pages %d-%d, reason=%s",
                    boundary["left_page"] + 1,
                    boundary["right_page"] + 1,
                    verification.get("reason") or "",
                )
                break

        if not changed:
            break

    final_groups = _finalize_groups_or_raise(groups, total_pages)

    for group in final_groups:
        group.pop("complete", None)
        group.pop("continues_previous", None)
        group.pop("confidence", None)
        group["method"] = group.get("method") or "gemini_verified"

    logger.info(
        "[PDF-SPLIT] Final result: %d document groups: %s",
        len(final_groups),
        [
            {
                "pages": [p + 1 for p in g["pages"]],
                "number": g.get("number"),
                "series": g.get("series"),
                "multiple_on_page": g.get("multiple_on_page"),
            }
            for g in final_groups
        ],
    )

    return final_groups
 


# ═══════════════════════════════════════════════════════════════════════════════
# SINGLE-PAGE / NON-PDF: GEMINI OCR С РАЗДЕЛЕНИЕМ ДОКУМЕНТОВ
# ═══════════════════════════════════════════════════════════════════════════════

def separate_docs_on_single_page(
    file_bytes: bytes,
    mime_type: str,
    expected_count: int = 2,
) -> list[str]:
    """
    Отправляет файл (изображение или 1-страничный PDF) в Gemini OCR
    с промптом на разделение документов.

    Возвращает список OCR-текстов для каждого документа.
    Если разделение не удалось — возвращает список из одного элемента.
    """
    prompt = SEPARATE_DOCS_OCR_PROMPT.format(expected_count=expected_count)

    try:
        raw = _ask_gemini_image(file_bytes, mime_type, prompt)

        _log_gemini_raw(
            "separate_docs_on_single_page",
            raw,
            mime_type=mime_type,
            expected_count=expected_count,
        )
    except Exception as e:
        logger.error("[PDF-SPLIT] OCR separate failed: %s", e)
        return []

    # Парсим ответ по маркерам ---DOC_N---
    parts = re.split(r'---DOC_\d+---', raw)
    texts = [p.strip() for p in parts if p.strip()]

    if not texts:
        logger.warning("[PDF-SPLIT] OCR separate returned no docs, raw=%s", raw[:500])
        return []

    logger.info(
        "[PDF-SPLIT] OCR separate: expected=%d, got=%d docs",
        expected_count, len(texts),
    )
    return texts


# ═══════════════════════════════════════════════════════════════════════════════
# HIGH-LEVEL ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════


def split_pdf_document(pdf_path: str) -> list[dict]:
    total_pages = get_pdf_page_count(pdf_path)

    if total_pages < 1:
        return []

    if total_pages == 1:
        return [{
            "pages": [0],
            "number": None,
            "series": None,
            "multiple_on_page": False,
            "documents_on_page": 0,
            "method": "single_page",
        }]

    logger.info("[PDF-SPLIT] Using Gemini for %d pages", total_pages)

    groups = classify_pdf_pages(pdf_path, total_pages)

    if not groups:
        return [{
            "pages": list(range(total_pages)),
            "number": None,
            "series": None,
            "multiple_on_page": False,
            "documents_on_page": 0,
            "method": "gemini_fallback",
        }]

    for group in groups:
        group.setdefault("method", "gemini")

    return groups




# ═══════════════════════════════════════════════════════════════════════════════
# PRE-CLASSIFICATION: один дешёвый запрос для PDF 2+ стр
# ═══════════════════════════════════════════════════════════════════════════════
 
PRE_CLASSIFY_PROMPT = """You are seeing pages 1-{visible} of a PDF that has {total} pages in total.
It may contain one or multiple accounting documents
(VAT invoices, invoices, credit notes, receipts, etc.).

Determine only from the visible pages:
1. How many separate documents are visible in these pages
2. Which visible pages belong to which document
3. The document number and series of each visible document, if visible

IMPORTANT RULES:
- A receipt (kasos čekis, pinigų priėmimo kvitas, payment confirmation) paired with an invoice on the same or adjacent page is NOT a separate document. Group them together as one document.
- A standalone receipt without an accompanying invoice IS a separate document.
- total_docs MUST equal the number of entries in the documents array.
- If one page contains multiple separate invoices, use multiple_on_page: true and return ONE entry for that page with documents_on_page and a numbers array listing each document's number and series.

Respond ONLY in JSON format, no extra text, no markdown:
{{
  "total_docs": <number>,
  "needs_full_split": <true_or_false>,
  "documents": [
    {{
      "pages": [1, 2],
      "number": "SAN-001",
      "series": "VV",
      "multiple_on_page": false,
      "documents_on_page": 0,
      "numbers": []
    }},
    {{
      "pages": [3],
      "number": null,
      "series": null,
      "multiple_on_page": true,
      "documents_on_page": 3,
      "numbers": [
        {{"number": "00220357", "series": null}},
        {{"number": "01442796", "series": null}},
        {{"number": "118127", "series": "SF"}}
      ]
    }}
  ]
}}

Rules:
- pages: visible page numbers starting from 1
- number: document number (use only when multiple_on_page is false), or null
- series: document series (use only when multiple_on_page is false), or null
- multiple_on_page: true ONLY if one page contains multiple separate invoices (NOT invoice + receipt)
- documents_on_page: count of separate documents, use only when multiple_on_page is true, otherwise 0
- numbers: array of {{number, series}} for each document on the page, use only when multiple_on_page is true, otherwise empty array
- When multiple_on_page is true, return ONE entry for that page, not separate entries
- If visible pages are less than total PDF pages, set needs_full_split: true
- Do not guess pages that are not visible
- If you cannot determine, return total_docs: 1
"""


SPLIT_PROMPT_TEMPLATE = """This PDF has {total} pages in total. Pages shown: {start}-{end}.
It may contain multiple accounting documents (VAT invoices, invoices, credit notes, receipts, etc.).

IMPORTANT:
Return ORIGINAL PDF page numbers between {start} and {end}.
Do NOT restart numbering from 1 for this fragment.

Group visible pages by document.

IMPORTANT RULES:
- A receipt (kasos čekis, pinigų priėmimo kvitas, payment confirmation) paired with an invoice on the same or adjacent page is NOT a separate document. Group them together.
- A standalone receipt without an accompanying invoice IS a separate document.
- When multiple separate invoices exist on one page, return ONE entry with multiple_on_page: true, documents_on_page set to the count, and a numbers array with each document's number and series.

Possible cases:
1. A document spans 1 or more pages
2. A single page contains multiple separate documents
3. The first visible page may continue a document from previous pages
4. The last visible page may continue into later pages

{continuation_note}

Respond ONLY in JSON format, no extra text, no markdown:
{{
  "documents": [
    {{
      "pages": [1, 2],
      "continues_previous": false,
      "complete": true,
      "number": "SAN-001",
      "series": "VV",
      "multiple_on_page": false,
      "documents_on_page": 0,
      "numbers": [],
      "confidence": "high"
    }},
    {{
      "pages": [3],
      "continues_previous": false,
      "complete": true,
      "number": null,
      "series": null,
      "multiple_on_page": true,
      "documents_on_page": 3,
      "numbers": [
        {{"number": "00220357", "series": null}},
        {{"number": "01442796", "series": null}},
        {{"number": "118127", "series": "SF"}}
      ],
      "confidence": "medium"
    }}
  ]
}}

Field rules:
- pages: ORIGINAL PDF page numbers between {start} and {end}
- continues_previous: true only if the first document continues from previous pages
- complete: false only if the last document continues after page {end}
- number: document number (only when multiple_on_page is false), otherwise null
- series: document series (only when multiple_on_page is false), otherwise null
- multiple_on_page: true ONLY if one page has multiple separate invoices (NOT invoice + receipt paired together)
- documents_on_page: count of separate documents on that page, use only when multiple_on_page is true, otherwise 0
- numbers: array of {{number, series}} for each document, use only when multiple_on_page is true, otherwise empty array
- When multiple_on_page is true, return ONE entry for that page with the count and numbers
- confidence: high, medium, or low
- A receipt/payment confirmation attached to an invoice is part of that invoice, not a separate document
"""

CONTINUATION_NOTE_FIRST = (
    "This is the FIRST fragment — the first page always starts a new document."
)
CONTINUATION_NOTE_MIDDLE = (
    "IMPORTANT: The first page of this fragment may be a CONTINUATION of a document "
    "from previous pages (which you cannot see). If it does not contain a new document "
    "header/title — mark continues_previous: true."
)

VERIFY_PROMPT_TEMPLATE = """This PDF fragment shows 4 pages from a larger document.
Pages {p1}, {p2} belong to one document, and page {p3} is potentially a new document.

Respond ONLY in JSON format:
{{"boundary_correct": true}}
or
{{"boundary_correct": false, "reason": "brief explanation"}}

"boundary_correct": true means page {p3} truly starts a NEW document.
"boundary_correct": false means page {p3} is a CONTINUATION of the previous document.
"""

BOUNDARY_VERIFY_PROMPT_TEMPLATE = """You are checking a document boundary in a larger PDF.

Visible pages: {context_start}-{context_end}.
The suspicious boundary is between page {left_page} and page {right_page}.

Task:
Decide whether page {right_page} continues the same accounting document from page {left_page},
or starts a new separate accounting document.

Also identify only the local document structure inside the visible context.

Respond ONLY in JSON format, no markdown:
{{
  "same_document_across_boundary": true,
  "confidence": "high",
  "documents_in_context": [
    {{
      "pages": [9, 10, 11, 12],
      "relation": "boundary_document"
    }},
    {{
      "pages": [13],
      "relation": "next_document"
    }}
  ],
  "reason": "Pages 9-12 continue the same invoice table; page 13 starts a new invoice."
}}

Rules:
- pages must be ORIGINAL PDF page numbers between {context_start} and {context_end}
- relation must be one of:
  - "previous_document"
  - "boundary_document"
  - "next_document"
  - "unknown"
- Use "boundary_document" for the document that touches the suspicious boundary
- If the boundary document also includes a neighboring page in the context, include that page
- Do not mention pages outside the visible context
- confidence must be high, medium, or low
"""

SEPARATE_DOCS_OCR_PROMPT = """This document (single page or single file) contains multiple separate accounting documents (e.g. receipts, invoices).

Provide the text of each document SEPARATELY in this format:

---DOC_1---
<first document text>
---DOC_2---
<second document text>
---DOC_3---
<third document text>

Rules:
- Transcribe each document accurately without modifying data.
- If there is a table — use Markdown table format.
- Do not merge multiple documents into one.
- If you see only {expected_count} documents, return as many as you see.
"""
 
 
def pre_classify_pdf(pdf_path: str) -> dict:
    """
    Дешёвый предварительный запрос к Gemini Lite для PDF 2+ стр.

    Важно:
    - Для PDF <=10 страниц результат можно использовать как финальную pre-classify карту.
    - Для PDF >10 страниц результат только предварительный, needs_full_split=True всегда.
    - Страницы в результате возвращаются 0-based.
    """
    import time as _time

    total_pages = get_pdf_page_count(pdf_path)

    if total_pages < 2:
        return {
            "total_docs": 1,
            "documents": [],
            "needs_full_split": False,
        }

    pages_to_send = min(total_pages, BATCH_SIZE)

    prompt = PRE_CLASSIFY_PROMPT.format(
        total=total_pages,
        visible=pages_to_send,
    )

    pdf_bytes = extract_pages_as_pdf_bytes(
        pdf_path,
        list(range(pages_to_send)),
    )

    try:
        t0 = _time.perf_counter()
        raw = _ask_gemini_pdf(pdf_bytes, prompt)
        elapsed = _time.perf_counter() - t0

        _log_gemini_raw(
            "pre_classify_pdf",
            raw,
            total_pages=total_pages,
            visible_pages=pages_to_send,
        )

        result = _parse_split_json(raw)

        model_total_docs = _safe_int(result.get("total_docs"), 1)
        docs = result.get("documents") or []

        normalized_docs = []

        for item in docs:
            pages = _normalize_batch_pages(
                item.get("pages") or [],
                0,
                pages_to_send,
            )

            if not pages:
                continue

            normalized_docs.append({
                "pages": pages,
                "number": item.get("number"),
                "series": item.get("series"),
                "numbers": item.get("numbers") or [],
                "multiple_on_page": _as_bool(item.get("multiple_on_page"), False),
                "documents_on_page": _safe_int(item.get("documents_on_page"), 0),
            })

        normalized_docs = _collapse_same_page_multi_docs(normalized_docs)
        total_docs = _logical_doc_count(normalized_docs)

        if model_total_docs != total_docs:
            logger.warning(
                "[PDF-PRE] Gemini total_docs mismatch: model_total_docs=%d recalculated_total_docs=%d groups=%d",
                model_total_docs,
                total_docs,
                len(normalized_docs),
            )

        # Если видели не весь PDF, нельзя считать результат финальным.
        needs_full_split = _as_bool(result.get("needs_full_split"), False)

        if total_pages > pages_to_send:
            needs_full_split = True

        logger.info(
            "[PDF-PRE] pre_classify: total_pages=%d visible_pages=%d groups=%d logical_docs=%d needs_full_split=%s elapsed=%.2fs",
            total_pages,
            pages_to_send,
            len(normalized_docs),
            total_docs,
            needs_full_split,
            elapsed,
        )

        return {
            "total_docs": max(total_docs, 1),
            "documents": normalized_docs,
            "needs_full_split": needs_full_split,
        }

    except Exception as e:
        logger.warning("[PDF-PRE] pre_classify failed: %s", e)

        return {
            "total_docs": 1,
            "documents": [],
            "needs_full_split": total_pages > BATCH_SIZE,
            "error": str(e),
        }