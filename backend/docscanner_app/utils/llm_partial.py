# utils/llm_partial.py
# -*- coding: utf-8 -*-
import json
import re
from typing import Optional, Tuple, Dict, Any, List


# =========================
# 1) Парсер "мягкого" JSON
# =========================

def parse_lenient_json(text: str):
    """
    Упрощённый парсер: пытается распарсить строку как JSON; если не выходит —
    ищет ДЛИННЕЙШИЙ СБАЛАНСИРОВАННЫЙ ПРЕФИКС (учитывая строки и экранирование).
    Возвращает (payload, is_full).
    """
    if not isinstance(text, str):
        return None, False
    s = text.strip()

    # Быстрый путь
    try:
        return json.loads(s), True
    except Exception:
        pass

    # Сканер баланса
    in_str = False
    escape = False
    depth = 0
    best = -1  # индекс последнего символа, где depth==0 вне строки
    for i, ch in enumerate(s):
        if in_str:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch in '{[':
                depth += 1
            elif ch in '}]':
                depth = max(0, depth - 1)
                if depth == 0:
                    best = i

    if best >= 0:
        candidate = s[:best + 1]
        try:
            return json.loads(candidate), False
        except Exception:
            pass

    return None, False


# =====================================
# 2) Ремонтник обрезанного JSON ответа
# =====================================

def _looks_like_quoted_json(s: str) -> bool:
    if not s:
        return False
    if not s.lstrip().startswith('"'):
        return False
    head = s[:2000]
    return head.count('\\"') >= 4 and (
        '\\"docs\\"' in head or '\\"documents\\"' in head or '\\"line_items\\"' in head
    )

def _unescape_outer_string(s: str) -> str:
    """
    Снимаем внешние кавычки и простые экранирования, даже если строка оборвана.
    Без ast.literal_eval — чтобы не падать на незакрытой кавычке.
    """
    s = s.strip()
    if s.startswith('"'):
        s = s[1:]
    if s.endswith('"'):
        s = s[:-1]
    s = s.replace(r'\"', '"').replace(r'\n', '\n').replace(r'\t', '\t').replace(r'\r', '\r').replace(r'\\', '\\')
    i = s.find('{')
    return s[i:] if i >= 0 else s

def _safe_prefix_json(s: str) -> Optional[str]:
    """
    Возвращает ДЛИННЕЙШИЙ безопасный префикс JSON:
    - учитывает строки и экранирование;
    - запоминает последний индекс, где depth==0 (полноценная структура);
    - если целиком не получилось — аккуратно дозакрывает незакрытые сущности.
    """
    in_str = False
    escape = False
    stack: List[str] = []  # ожидаемые закрывающие: ['}', ']']
    best_full = -1         # последний индекс, где depth==0 и не внутри строки
    last_safe = -1         # последний индекс вне строки (для подрезки хвоста)

    for i, ch in enumerate(s):
        if in_str:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == '{':
                stack.append('}')
            elif ch == '[':
                stack.append(']')
            elif ch == '}' or ch == ']':
                if stack and stack[-1] == ch:
                    stack.pop()
                else:
                    break  # лишняя закрывающая скобка
            last_safe = i
            if not stack:
                best_full = i

    if best_full >= 0:
        cand = s[:best_full + 1]
        try:
            json.loads(cand)
            return cand
        except Exception:
            pass  # попробуем дозакрыть

    cut = last_safe if last_safe >= 0 else len(s) - 1
    if cut < 0:
        return None
    cand = s[:cut + 1]

    # уберём висячие символы в конце: запятая, двоеточие, пробелы
    cand = re.sub(r'[\s,:\u00A0]+$', '', cand)

    def _unclosed_string_fragment(x: str) -> bool:
        in_s = False
        esc = False
        for ch in x:
            if in_s:
                if esc:
                    esc = False
                elif ch == '\\':
                    esc = True
                elif ch == '"':
                    in_s = False
            else:
                if ch == '"':
                    in_s = True
        return in_s

    if _unclosed_string_fragment(cand):
        cand += '"'

    # дозакрываем скобки
    for closer in reversed(stack):
        cand = re.sub(r'\s*,\s*$', '', cand)
        cand += closer

    # чистим запятую перед } или ]
    cand = re.sub(r',\s*([}\]])', r'\1', cand)

    try:
        json.loads(cand)
        return cand
    except Exception:
        return None

def repair_and_parse_llm_json(text: str) -> Tuple[Optional[Dict[str, Any]], Optional[str], bool, Dict[str, Any]]:
    """
    Возвращает (obj_or_none, fixed_json_or_none, is_full: bool, meta: dict).
    """
    if not isinstance(text, str) or not text.strip():
        return None, None, False, {}

    s = text.strip()

    # Быстрый путь
    try:
        obj = json.loads(s)
        return obj, json.dumps(obj, ensure_ascii=False, separators=(',', ':')), True, {'unquoted': False, 'repaired': False}
    except Exception as e:
        # ДОБАВИТЬ ЛОГ
        import logging
        logger = logging.getLogger('docscanner_app')
        logger.info(f"[repair_and_parse_llm_json] Quick path failed: {e}, trying repair...")

    # JSON внутри строки?
    unquoted = False
    if _looks_like_quoted_json(s):
        s = _unescape_outer_string(s)
        unquoted = True
        logger.info(f"[repair_and_parse_llm_json] Detected quoted JSON, unquoted")

    # Безопасный префикс / дозакрытие
    fixed = _safe_prefix_json(s)
    if not fixed:
        logger.warning(f"[repair_and_parse_llm_json] _safe_prefix_json returned None")
        return None, None, False, {'unquoted': unquoted, 'repaired': False}

    logger.info(f"[repair_and_parse_llm_json] _safe_prefix_json returned {len(fixed)} chars")

    try:
        obj = json.loads(fixed)
        is_full = (fixed.rstrip() == s.rstrip())
        logger.info(f"[repair_and_parse_llm_json] Successfully parsed: is_full={is_full}, keys={list(obj.keys()) if isinstance(obj, dict) else 'not_dict'}")
        return obj, json.dumps(obj, ensure_ascii=False, separators=(',', ':')), is_full, {'unquoted': unquoted, 'repaired': True}
    except Exception as e:
        logger.warning(f"[repair_and_parse_llm_json] Failed to parse fixed JSON: {e}")
        return None, None, False, {'unquoted': unquoted, 'repaired': True}


# =========================================
# 3) Утилиты для анализа/слияния line_items
# =========================================

def _to_int(val) -> Optional[int]:
    try:
        return int(str(val).strip())
    except Exception:
        return None

def _normalize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Приводит JSON к ожидаемой структуре."""
    if not isinstance(doc, dict):
        return {"documents": [{"line_items": []}]}
    doc.setdefault("documents", [{}])
    first = doc["documents"][0]
    if not isinstance(first, dict):
        first = {"line_items": []}
        doc["documents"] = [first]
    first.setdefault("line_items", [])
    if not isinstance(first["line_items"], list):
        first["line_items"] = []
    return doc

def received_ids(doc: Dict[str, Any]) -> List[int]:
    """Возвращает список line_id, которые уже есть."""
    doc = _normalize(doc)
    ids: List[int] = []
    for li in doc["documents"][0]["line_items"]:
        lid = _to_int(li.get("line_id"))
        if lid is not None:
            ids.append(lid)
    return sorted(set(ids))

def missing_start_id(doc: Dict[str, Any]) -> Optional[int]:
    """
    Возвращает ПЕРВЫЙ отсутствующий line_id, если total_lines известен.
    Если total_lines нет или пусто — None.
    """
    doc = _normalize(doc)
    total = doc.get("total_lines")
    ids = received_ids(doc)
    if not isinstance(total, int) or total <= 0:
        return None
    for i in range(1, total + 1):
        if i not in ids:
            return i
    return None

def anchor_item(doc: Dict[str, Any], start_line_id: int) -> Optional[dict]:
    """Находит последний полный item ПЕРЕД start_line_id — для якоря в follow-up."""
    doc = _normalize(doc)
    last_ok = None
    for li in doc["documents"][0]["line_items"]:
        lid = _to_int(li.get("line_id"))
        if lid is not None and lid < start_line_id:
            last_ok = li
    return last_ok

def merge_line_items(base_doc: Dict[str, Any], addon_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Сливает base + addon line_items по line_id.
    Не перезаписывает существующие; добавляет только новые.
    """
    base = _normalize(base_doc)
    add = _normalize(addon_doc)
    by_id: Dict[int, Dict[str, Any]] = {}

    for li in base["documents"][0]["line_items"]:
        lid = _to_int(li.get("line_id"))
        if lid is not None:
            by_id[lid] = li

    for li in add["documents"][0]["line_items"]:
        lid = _to_int(li.get("line_id"))
        if lid is not None and lid not in by_id:
            by_id[lid] = li

    base["documents"][0]["line_items"] = [by_id[k] for k in sorted(by_id)]
    return base


# =======================================
# 4) Конструктор follow-up промпта (EN)
# =======================================

def build_followup_prompt(ocr_text: str, start_line_id: int, anchor_item_dict: Optional[dict]) -> str:
    """
    Короткий follow-up на английском: просим ВОЗВРАТИТЬ ТОЛЬКО недостающие line_items.
    Возвращаем строго {"documents":[{"line_items":[...] }]} — без лишних полей/текста.
    """
    anchor = ""
    if anchor_item_dict:
        anchor = (
            "\nAnchor (do not return this item again): "
            + json.dumps(anchor_item_dict, ensure_ascii=False, separators=(',', ':'))
        )

    return (
        f"Return ONLY the missing line items as a valid JSON object on a SINGLE LINE (compact, no spaces, no line breaks, no markdown, no comments). "
        f"Do NOT include any fields outside the JSON object. "
        f"Do NOT repeat any items already returned earlier (line_id values smaller than {start_line_id} must NOT be returned again). "
        f"Output EXACTLY this structure (and nothing else): "
        f"{{\"documents\":[{{\"line_items\":[/* only the missing items */]}}]}} "
        "Rules for each line item (same as before): "
        "Allowed fields: line_id, type, product_code, product_barcode, product_name, unit, quantity, price, subtotal, discount_wo_vat, vat, vat_percent, discount_with_vat, total, preke_paslauga. "
        "If a field is not found/empty, omit it. Numbers use dot as decimal separator. If no unit found, use vnt. "
        f"Return items for line_id ≥ {start_line_id}. If there are no missing items, return "
        f"{{\"documents\":[{{\"line_items\":[]}}]}}.\n\n"
        "For context, here is the OCR text:\n```\n" + (ocr_text or "") + "\n```\n"
        + anchor
    )

