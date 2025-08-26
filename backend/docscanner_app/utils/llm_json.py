import json, re, logging, os, time
from typing import Any

log = logging.getLogger("celery")

_CODE_FENCE_START = re.compile(r'^\s*```(?:json)?\s*', re.IGNORECASE)
_CODE_FENCE_END   = re.compile(r'\s*```\s*$')

def _strip_code_fences(s: str) -> str:
    s = _CODE_FENCE_START.sub('', s)
    s = _CODE_FENCE_END.sub('', s)
    return s.strip()

def _extract_outer_json(s: str) -> str:
    m = re.search(r'[\{\[]', s)
    if not m: return s
    start = m.start()
    open_ch = s[start]; close_ch = '}' if open_ch == '{' else ']'
    depth = 0; ins = False; esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if ins:
            if esc: esc = False
            elif ch == '\\': esc = True
            elif ch == '"': ins = False
        else:
            if ch == '"': ins = True
            elif ch == open_ch: depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0: return s[start:i+1].strip()
    return s[start:].strip()

# ───────────────────────────────────────────────
# Новый фиксатор лишних запятых
# ───────────────────────────────────────────────

def _fix_json_commas(s: str) -> str:
    # Удаляет запятые между } и { (или ] и [) в массивах
    s = re.sub(r'}\s*,\s*{', '},{', s)
    s = re.sub(r'\]\s*,\s*\[', '],[', s)
    # Удаляет запятые перед закрывающей скобкой массива или объекта
    s = re.sub(r',\s*([}\]])', r'\1', s)
    # Удаляет запятые после открытия массива или объекта
    s = re.sub(r'([\[{])\s*,', r'\1', s)
    # Удаляет запятые в начале массива (например, [ , {...} ])
    s = re.sub(r'\[\s*,', '[', s)
    return s

# ───────────────────────────────────────────────
# вспомогалки для логирования ошибок
# ───────────────────────────────────────────────

def _save_payload(raw: str, sub: str = "jsonfail", base_dir: str | None = None) -> str:
    try:
        base = base_dir or os.path.join("media", "llm_errors")
        os.makedirs(base, exist_ok=True)
        ts = time.strftime("%Y%m%d-%H%M%S")
        path = os.path.join(base, f"{sub}_{ts}.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(raw)
        return path
    except Exception:
        log.exception("[LLM-JSON] failed to save payload")
        return ""

def _preview(s: str, n: int = 600) -> str:
    s = (s or "").replace("\n", "\\n")
    return (s[:n] + ("…(truncated)" if len(s) > n else ""))

def _log_decode_error(stage: str, raw: str, candidate: str, err: json.JSONDecodeError):
    ctx_start = max(0, err.pos - 80)
    ctx_end   = min(len(candidate), err.pos + 80)
    ctx = candidate[ctx_start:ctx_end].replace("\n", "\\n")
    saved = _save_payload(raw, sub="jsondecode")
    log.error(
        "[LLM-JSON] %s: JSONDecodeError at pos=%d line=%d col=%d; "
        "preview_raw='%s'; ctx='%s'; saved='%s'",
        stage, err.pos, err.lineno, err.colno, _preview(raw), ctx, saved
    )

def _log_generic_error(stage: str, raw: str, err: Exception):
    saved = _save_payload(raw, sub="jsonerror")
    log.exception(
        "[LLM-JSON] %s: Unexpected parse error: %s; preview_raw='%s'; saved='%s'",
        stage, err.__class__.__name__, _preview(raw), saved
    )

# ───────────────────────────────────────────────
# основной парсер с расширенным фиксатором
# ───────────────────────────────────────────────

def parse_llm_json_robust(raw: Any) -> dict:
    """
    Пытается распарсить популярные форматы ответа LLM.
    При фатальной ошибке:
      • логирует детальную причину,
      • сохраняет полный ответ в файл media/llm_errors/*.txt,
      • пробрасывает исключение дальше.
    """
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise TypeError(f"Expected str/dict, got {type(raw)}")

    txt = _strip_code_fences(raw.strip())
    txt = _fix_json_commas(txt)   # <--- ДОБАВЛЕНА АВТОПОПРАВКА ЗАПЯТЫХ!

    # 1) обычный JSON
    try:
        return json.loads(txt)
    except json.JSONDecodeError as e1:
        last_e = e1
    except Exception as e1:
        _log_generic_error("stage1-loads", raw, e1)
        raise

    # 2) строковый литерал с экранированным JSON
    if len(txt) >= 2 and txt[0] == '"' and txt[-1] == '"':
        try:
            unescaped = json.loads(txt)
            if isinstance(unescaped, str):
                candidate = _extract_outer_json(unescaped)
                candidate = _fix_json_commas(candidate)  # ещё раз, вдруг внутри
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError as e2a:
                    fixed = _fix_json_commas(candidate)
                    try:
                        return json.loads(fixed)
                    except json.JSONDecodeError as e2b:
                        _log_decode_error("stage2-escaped", raw, candidate, e2b)
                        raise
        except Exception as e2:
            _log_generic_error("stage2-escape", raw, e2)
            raise

    # 3) вокруг мусор → вытащим внешний JSON и попробуем снова
    candidate = txt if txt[:1] in '{[' else _extract_outer_json(txt)
    candidate = _fix_json_commas(candidate)  # и тут на всякий случай
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as e3a:
        fixed = _fix_json_commas(candidate)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError as e3b:
            _log_decode_error("stage3-candidate", raw, candidate, e3b)
            raise
    except Exception as e3:
        _log_generic_error("stage3-candidate", raw, e3)
        raise








# import json, re, logging, os, time
# from typing import Any

# log = logging.getLogger("docscanner_app")

# _CODE_FENCE_START = re.compile(r'^\s*```(?:json)?\s*', re.IGNORECASE)
# _CODE_FENCE_END   = re.compile(r'\s*```\s*$')

# def _strip_code_fences(s: str) -> str:
#     s = _CODE_FENCE_START.sub('', s)
#     s = _CODE_FENCE_END.sub('', s)
#     return s.strip()

# def _extract_outer_json(s: str) -> str:
#     # берет самый внешний {...} или [...]
#     m = re.search(r'[\{\[]', s)
#     if not m: return s
#     start = m.start()
#     open_ch = s[start]; close_ch = '}' if open_ch == '{' else ']'
#     depth = 0; ins = False; esc = False
#     for i in range(start, len(s)):
#         ch = s[i]
#         if ins:
#             if esc: esc = False
#             elif ch == '\\': esc = True
#             elif ch == '"': ins = False
#         else:
#             if ch == '"': ins = True
#             elif ch == open_ch: depth += 1
#             elif ch == close_ch:
#                 depth -= 1
#                 if depth == 0: return s[start:i+1].strip()
#     return s[start:].strip()

# # ──────────────────────────────────────────────────────────
# # вспомогалки для логирования ошибок
# # ──────────────────────────────────────────────────────────

# def _save_payload(raw: str, sub: str = "jsonfail", base_dir: str | None = None) -> str:
#     """
#     Сохраняет полный LLM-ответ в файл и возвращает путь.
#     По умолчанию кладем в media/llm_errors/.
#     """
#     try:
#         base = base_dir or os.path.join("media", "llm_errors")
#         os.makedirs(base, exist_ok=True)
#         ts = time.strftime("%Y%m%d-%H%M%S")
#         path = os.path.join(base, f"{sub}_{ts}.txt")
#         with open(path, "w", encoding="utf-8") as f:
#             f.write(raw)
#         return path
#     except Exception:
#         # на всякий случай не падаем из-за проблем с диском
#         log.exception("[LLM-JSON] failed to save payload")
#         return ""

# def _preview(s: str, n: int = 600) -> str:
#     s = (s or "").replace("\n", "\\n")
#     return (s[:n] + ("…(truncated)" if len(s) > n else ""))

# def _log_decode_error(stage: str, raw: str, candidate: str, err: json.JSONDecodeError):
#     ctx_start = max(0, err.pos - 80)
#     ctx_end   = min(len(candidate), err.pos + 80)
#     ctx = candidate[ctx_start:ctx_end].replace("\n", "\\n")
#     saved = _save_payload(raw, sub="jsondecode")
#     log.error(
#         "[LLM-JSON] %s: JSONDecodeError at pos=%d line=%d col=%d; "
#         "preview_raw='%s'; ctx='%s'; saved='%s'",
#         stage, err.pos, err.lineno, err.colno, _preview(raw), ctx, saved
#     )

# def _log_generic_error(stage: str, raw: str, err: Exception):
#     saved = _save_payload(raw, sub="jsonerror")
#     log.exception(
#         "[LLM-JSON] %s: Unexpected parse error: %s; preview_raw='%s'; saved='%s'",
#         stage, err.__class__.__name__, _preview(raw), saved
#     )

# # ──────────────────────────────────────────────────────────
# # основной парсер
# # ──────────────────────────────────────────────────────────

# def parse_llm_json_robust(raw: Any) -> dict:
#     """
#     Пытается распарсить популярные форматы ответа LLM.
#     При фатальной ошибке:
#       • логирует детальную причину,
#       • сохраняет полный ответ в файл media/llm_errors/*.txt,
#       • пробрасывает исключение дальше.
#     """
#     if isinstance(raw, dict):
#         return raw
#     if not isinstance(raw, str):
#         raise TypeError(f"Expected str/dict, got {type(raw)}")

#     txt = _strip_code_fences(raw.strip())

#     # 1) обычный JSON
#     try:
#         return json.loads(txt)
#     except json.JSONDecodeError as e1:
#         # пока не логируем — есть ещё попытки
#         last_e = e1
#     except Exception as e1:
#         _log_generic_error("stage1-loads", raw, e1)
#         raise

#     # 2) строковый литерал с экранированным JSON
#     if len(txt) >= 2 and txt[0] == '"' and txt[-1] == '"':
#         try:
#             unescaped = json.loads(txt)  # превращаем в обычную строку
#             if isinstance(unescaped, str):
#                 candidate = _extract_outer_json(unescaped)
#                 try:
#                     return json.loads(candidate)
#                 except json.JSONDecodeError as e2a:
#                     # попробуем убрать висячие запятые
#                     fixed = re.sub(r',\s*([}\]])', r'\1', candidate)
#                     try:
#                         return json.loads(fixed)
#                     except json.JSONDecodeError as e2b:
#                         _log_decode_error("stage2-escaped", raw, candidate, e2b)
#                         raise
#         except Exception as e2:
#             _log_generic_error("stage2-escape", raw, e2)
#             raise

#     # 3) вокруг мусор → вытащим внешний JSON и попробуем снова
#     candidate = txt if txt[:1] in '{[' else _extract_outer_json(txt)
#     try:
#         return json.loads(candidate)
#     except json.JSONDecodeError as e3a:
#         fixed = re.sub(r',\s*([}\]])', r'\1', candidate)
#         try:
#             return json.loads(fixed)
#         except json.JSONDecodeError as e3b:
#             _log_decode_error("stage3-candidate", raw, candidate, e3b)
#             raise
#     except Exception as e3:
#         _log_generic_error("stage3-candidate", raw, e3)
#         raise













# import json, re, logging
# from typing import Any

# log = logging.getLogger("celery")

# _CODE_FENCE_START = re.compile(r'^\s*```(?:json)?\s*', re.IGNORECASE)
# _CODE_FENCE_END   = re.compile(r'\s*```\s*$')

# def _strip_code_fences(s: str) -> str:
#     s = _CODE_FENCE_START.sub('', s)
#     s = _CODE_FENCE_END.sub('', s)
#     return s.strip()

# def _extract_outer_json(s: str) -> str:
#     # берет самый внешний {...} или [...]
#     m = re.search(r'[\{\[]', s)
#     if not m: return s
#     start = m.start()
#     open_ch = s[start]; close_ch = '}' if open_ch == '{' else ']'
#     depth = 0; ins = False; esc = False
#     for i in range(start, len(s)):
#         ch = s[i]
#         if ins:
#             if esc: esc = False
#             elif ch == '\\': esc = True
#             elif ch == '"': ins = False
#         else:
#             if ch == '"': ins = True
#             elif ch == open_ch: depth += 1
#             elif ch == close_ch:
#                 depth -= 1
#                 if depth == 0: return s[start:i+1].strip()
#     return s[start:].strip()

# def parse_llm_json_robust(raw: Any) -> dict:
#     """
#     Пытается распарсить любые популярные форматы ответа LLM:
#     - чистый JSON (dict/str)
#     - JSON внутри строкового литерала с \\n, \\"
#     - с code fences ```json
#     - с лишним текстом вокруг
#     - лечит висячие запятые перед } ]
#     Бросает json.JSONDecodeError если совсем не получилось.
#     """
#     if isinstance(raw, dict):  # уже dict
#         return raw
#     if not isinstance(raw, str):
#         raise TypeError(f"Expected str/dict, got {type(raw)}")

#     txt = _strip_code_fences(raw.strip())

#     # вариант 1: обычный JSON
#     try:
#         return json.loads(txt)
#     except json.JSONDecodeError:
#         pass

#     # вариант 2: строковый литерал с экранированным JSON (начинается и заканчивается кавычками)
#     if len(txt) >= 2 and txt[0] == '"' and txt[-1] == '"':
#         try:
#             unescaped = json.loads(txt)     # превращаем в обычную строку с { ... }
#             if isinstance(unescaped, str):
#                 candidate = _extract_outer_json(unescaped)
#                 try:
#                     return json.loads(candidate)
#                 except json.JSONDecodeError:
#                     fixed = re.sub(r',\s*([}\]])', r'\1', candidate)  # убрать висячие запятые
#                     return json.loads(fixed)
#         except Exception:
#             pass

#     # вариант 3: вокруг мусор → вытащим внешний JSON и попробуем снова
#     candidate = txt if txt[:1] in '{[' else _extract_outer_json(txt)
#     try:
#         return json.loads(candidate)
#     except json.JSONDecodeError:
#         fixed = re.sub(r',\s*([}\]])', r'\1', candidate)
#         return json.loads(fixed)
