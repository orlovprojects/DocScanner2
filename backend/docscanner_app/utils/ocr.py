#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ocr.py — умная склейка OCR с автовыбором режима WORDS vs FULLTEXT

Возвращаемая функция:
    get_ocr_text(data: bytes, filename: str, logger) ->
        (raw_json: str, plain_text: str, words_flat: list[dict], error: str|None)

- Без Tesseract. Используется только Google Vision.
- raw_json включает: pages с words и bbox + метаинформация о режиме и метриках
- plain_text: либо склейка по словам (WORDS), либо full_text_annotation (FULLTEXT)
- Критерии выбора режима (можно настроить):
    angle_std_deg ≤ 8°
    neighbor_p90_deg ≤ 12°
    line_wobble ≤ 1.0
    outlier_share ≤ 0.25

Аутентификация Vision:
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
"""
from __future__ import annotations

import json
import math
from statistics import median
from typing import List, Dict, Any, Optional, Tuple

import numpy as np

try:
    from google.cloud import vision
except Exception:
    vision = None

from sklearn.cluster import DBSCAN
import logging
logger = logging.getLogger("docscanner_app")

# ---------- Константы для склейки по словам ----------

PUNCT_FOLLOW = set(".,:;%)!?»")
PUNCT_PRECEDE = set("([«")


# ---------- Вспомогательные утилиты (из старого кода) ----------

def _edges(b):
    """Центры рёбер bbox: x_left, x_right, y_top, y_bottom"""
    tl, tr, br, bl = b
    x_left = (tl["x"] + bl["x"]) / 2.0
    x_right = (tr["x"] + br["x"]) / 2.0
    y_top = (tl["y"] + tr["y"]) / 2.0
    y_bot = (bl["y"] + br["y"]) / 2.0
    return x_left, x_right, y_top, y_bot


def _angle_deg_of_box(b):
    """Угол наклона верхнего ребра bbox (в градусах)"""
    tl, tr, *_ = b
    dx = tr["x"] - tl["x"]
    dy = tr["y"] - tl["y"]
    if dx == 0:
        return 0.0
    return math.degrees(math.atan2(dy, dx))


def _estimate_skew_deg(items, min_width_px=200):
    """Оценка наклона страницы по широким словам"""
    angles = []
    for it in items:
        x_l, x_r, y_t, y_b = _edges(it["bbox"])
        if (x_r - x_l) >= min_width_px:
            angles.append(_angle_deg_of_box(it["bbox"]))
    return median(angles) if angles else 0.0


def _correct_y_for_skew(y, x, skew_deg):
    """Коррекция Y-координаты с учётом наклона: y' = y - x * tan(theta)"""
    return y - x * math.tan(math.radians(skew_deg))


def _is_alpha_token(t: str) -> bool:
    """Содержит ли токен хотя бы одну букву"""
    return any(ch.isalpha() for ch in t)



def _join_words_to_lines(words_data, y_tol=None, use_skew=True,
                         gap_scale=(0.4, 1.2, 3.0),
                         hard_space_px=(15, 50, 150)):
    """
    Собирает построчный текст из слов с умными пробелами.
    
    Вход: words_data = [{"text": str, "bbox": [{x,y}*4]}, ...]
    Возвращает: (joined_text: str, detected_skew_deg: float)
    """
    if not words_data:
        return "", 0.0

    # 1) Оценка высоты слов и наклона
    heights = []
    for w in words_data:
        x_l, x_r, y_t, y_b = _edges(w["bbox"])
        heights.append(max(1.0, y_b - y_t))
    h_med = median(heights) if heights else 20.0

    skew_deg = _estimate_skew_deg(words_data) if use_skew else 0.0

    # 2) Подготовка элементов с коррекцией Y
    items = []
    for w in words_data:
        txt = (w.get("text") or "").strip()
        if not txt:
            continue
        x_l, x_r, y_t, y_b = _edges(w["bbox"])
        if use_skew and abs(skew_deg) > 0.05:
            y_t = _correct_y_for_skew(y_t, x_l, skew_deg)
            y_b = _correct_y_for_skew(y_b, x_l, skew_deg)
        y_c = (y_t + y_b) / 2.0
        items.append({
            "text": txt,
            "x_l": x_l, "x_r": x_r,
            "y_t": y_t, "y_b": y_b, "y_c": y_c,
        })

    if not items:
        return "", skew_deg

    # 3) Порог по вертикали для группировки в строки
    if y_tol is None:
        y_tol_px = max(10.0, min(40.0, 0.7 * h_med))
    else:
        y_tol_px = y_tol

    # 4) Группировка по Y в строки
    items.sort(key=lambda t: (t["y_c"], t["x_l"]))
    lines = []
    current = []
    current_y = None
    for it in items:
        if current_y is None or abs(it["y_c"] - current_y) <= y_tol_px:
            current.append(it)
            current_y = it["y_c"] if current_y is None else (current_y * 0.7 + it["y_c"] * 0.3)
        else:
            lines.append(current)
            current = [it]
            current_y = it["y_c"]
    if current:
        lines.append(current)

    # 5) Склейка внутри строки по X с умными пробелами
    all_lines = []
    for row in lines:
        row.sort(key=lambda t: t["x_l"])
        gaps = [max(0.0, b["x_l"] - a["x_r"]) for a, b in zip(row, row[1:])]
        gaps_pos = [g for g in gaps if g > 0]
        g_med = median(gaps_pos) if gaps_pos else None

        pieces = [row[0]["text"]]
        for (a, b, g) in zip(row, row[1:], gaps):
            # Определяем количество пробелов по gap
            if g_med and g_med > 0:
                if g < gap_scale[0] * g_med:
                    sp = ""
                elif g < gap_scale[1] * g_med:
                    sp = " "
                elif g < gap_scale[2] * g_med:
                    sp = "  "
                else:
                    sp = "   "
            else:
                if g < hard_space_px[0]:
                    sp = ""
                elif g < hard_space_px[1]:
                    sp = " "
                elif g < hard_space_px[2]:
                    sp = "  "
                else:
                    sp = "   "

            # Пунктуация: убираем пробел
            if b["text"] and b["text"][0] in PUNCT_FOLLOW:
                sp = ""
            if pieces[-1] and pieces[-1][-1] in PUNCT_PRECEDE:
                sp = ""

            # Фикс слипшихся букв (например ZapaLTUAB)
            if _is_alpha_token(a["text"]) and _is_alpha_token(b["text"]):
                if not (a["text"].endswith("-") or b["text"].startswith("-")):
                    if sp == "":
                        sp = " "

            pieces.append(sp + b["text"])

        # Нормализация пробелов и пунктуации
        line = "".join(pieces)
        line = (line
                .replace(" .", ".")
                .replace(" ,", ",")
                .replace(" :", ":")
                .replace("( ", "(")
                .replace(" )", ")")
                .replace(" - ", "-"))
        all_lines.append(line)

    return "\n".join(all_lines), skew_deg


# ---------- Метрики для выбора режима ----------

def normalize_angle(a: float) -> float:
    """Нормализация угла в диапазон [-π, π]"""
    a = math.fmod(a, 2 * math.pi)
    if a <= -math.pi:
        a += 2 * math.pi
    elif a > math.pi:
        a -= 2 * math.pi
    return a


def _median_word_height(words_data) -> float:
    """Медианная высота слов"""
    heights = []
    for w in words_data:
        x_l, x_r, y_t, y_b = _edges(w["bbox"])
        heights.append(max(1.0, y_b - y_t))
    return float(median(heights)) if heights else 0.0


def compute_geometry_metrics(words_data, k_neighbors: int = 6) -> Dict[str, float]:
    """
    Вычисление метрик геометрии для оценки "помятости" документа:
    - angle_std_deg: стандартное отклонение углов слов от глобального
    - neighbor_p90_deg: 90-й перцентиль разницы углов между соседями по строке
    - line_wobble: относительное стандартное отклонение Y внутри строк
    - outlier_share: доля слов с углом отклонения >10°
    """
    if not words_data:
        return {
            "angle_std_deg": 0.0,
            "neighbor_p90_deg": 0.0,
            "line_wobble": 0.0,
            "outlier_share": 0.0,
            "global_angle_deg": 0.0,
            "median_word_height_px": 0.0,
        }

    # Углы всех слов
    word_angles = []
    for w in words_data:
        bbox = w["bbox"]
        tl, tr = bbox[0], bbox[1]
        dx = tr["x"] - tl["x"]
        dy = tr["y"] - tl["y"]
        angle = math.atan2(dy, dx) if dx != 0 else 0.0
        word_angles.append(normalize_angle(angle))
    word_angles = np.array(word_angles, dtype=float)

    # Глобальный угол (медиана)
    ang_wrapped = ((word_angles + math.pi/2) % math.pi) - math.pi/2
    global_angle = float(np.median(ang_wrapped))
    global_angle_deg = float(np.degrees(global_angle))

    # Относительные углы (отклонения от глобального)
    rel_angles = np.vectorize(lambda a: normalize_angle(a - global_angle))(word_angles)
    angle_std_deg = float(np.degrees(np.std(rel_angles)))

    # Центры слов
    centers = []
    for w in words_data:
        bbox = w["bbox"]
        cx = sum(p["x"] for p in bbox) / 4.0
        cy = sum(p["y"] for p in bbox) / 4.0
        centers.append([cx, cy])
    centers = np.array(centers, dtype=float)

    # Поворот в выровненную систему координат
    c, s = math.cos(-global_angle), math.sin(-global_angle)
    R = np.array([[c, -s], [s, c]], dtype=float)
    centers_rot = centers @ R.T
    y_ = centers_rot[:, 1]
    x_ = centers_rot[:, 0]

    # Медианная высота слов
    med_h = _median_word_height(words_data)
    y_band = 0.7 * max(med_h, 1.0)

    # Разница углов с соседями по строке
    diffs = []
    N = len(words_data)
    for i in range(N):
        dy = np.abs(y_ - y_[i])
        mask = (dy <= y_band)
        if np.count_nonzero(mask) <= 1:
            continue
        cand_idx = np.where(mask)[0]
        cand_idx = cand_idx[cand_idx != i]
        order = np.argsort(np.abs(x_[cand_idx] - x_[i]))
        take = cand_idx[order[:k_neighbors]]
        for j in take:
            dtheta = abs(np.degrees(normalize_angle(word_angles[i] - word_angles[j])))
            if dtheta > 90.0:
                dtheta = 180.0 - dtheta
            diffs.append(dtheta)
    neighbor_p90_deg = float(np.percentile(diffs, 90)) if diffs else 0.0

    # Кластеризация строк по Y
    if N >= 2:
        db = DBSCAN(eps=0.7 * max(med_h, 1.0), min_samples=2, metric="euclidean").fit(y_.reshape(-1, 1))
        labels = db.labels_
    else:
        labels = np.array([-1])

    # Wobble: отклонение Y внутри строк
    row_sigmas = []
    for lab in sorted(set(labels)):
        idxs = np.where(labels == lab)[0]
        if lab == -1 or len(idxs) < 2:
            continue
        y_line = y_[idxs]
        sigma = float(np.std(y_line - np.median(y_line)))
        row_sigmas.append(sigma)
    median_row_sigma = float(np.median(row_sigmas)) if row_sigmas else 0.0
    line_wobble = (median_row_sigma / max(med_h, 1e-3)) if med_h > 0 else 0.0

    # Доля outliers (слова с углом >10°)
    bad = np.degrees(np.abs(rel_angles)) > 10.0
    outlier_share = float(np.mean(bad)) if N else 0.0

    return {
        "angle_std_deg": float(angle_std_deg),
        "neighbor_p90_deg": float(neighbor_p90_deg),
        "line_wobble": float(line_wobble),
        "outlier_share": float(outlier_share),
        "global_angle_deg": float(global_angle_deg),
        "median_word_height_px": float(med_h),
    }


def choose_mode_by_metrics(
    metrics: Dict[str, float],
    has_fulltext: bool,
    angle_std_max: float = 8.0,
    neighbor_p90_max: float = 12.0,
    line_wobble_max: float = 1.0,
    outlier_share_max: float = 0.25,
) -> str:
    """
    Выбор режима на основе метрик:
    - WORDS: если все критерии в норме → склейка по словам
    - FULLTEXT: если критерии не прошли, но есть full_text_annotation
    - ERROR: если нет ни слов, ни full_text
    """
    ok = (
        metrics["angle_std_deg"] <= angle_std_max and
        metrics["neighbor_p90_deg"] <= neighbor_p90_max and
        metrics["line_wobble"] <= line_wobble_max and
        metrics["outlier_share"] <= outlier_share_max
    )
    
    if ok:
        return "WORDS"
    if has_fulltext:
        return "FULLTEXT"
    return "ERROR"


# ---------- Главная функция для backend ----------

def get_ocr_text(
    data: bytes,
    filename: Optional[str] = None,
    logger: Optional[Any] = None
) -> Tuple[Optional[str], Optional[str], Optional[List[Dict[str, Any]]], Optional[str]]:
    """
    Главная функция OCR для backend.
    
    Вход:
        data: bytes — сырые байты изображения (PNG/JPG/PDF-страница)
        filename: str — имя файла (для логов)
        logger — логгер
    
    Возвращает:
        raw_json: str — JSON с pages, words, bbox + метаинформация
                       {"pages": [...], "meta": {"mode": "WORDS"|"FULLTEXT", "metrics": {...}}}
        plain_text: str — текст (склейка по словам или full_text_annotation)
        words_flat: list — список слов {"text": str, "bbox": [{x,y}*4]}
        error: str | None
    """
    if vision is None:
        err = "google-cloud-vision не установлен. pip install google-cloud-vision"
        if logger:
            logger.error(f"[OCR] {err}")
        return None, None, None, err

    try:
        # Вызов Google Vision API
        client = vision.ImageAnnotatorClient()
        image = vision.Image(content=data)
        resp = client.document_text_detection(image=image)
    except Exception as e:
        if logger:
            logger.error(f"[OCR] Vision API exception for {filename}: {e}")
        return None, None, None, str(e)

    if resp.error.message:
        if logger:
            logger.error(f"[OCR] Vision API error for {filename}: {resp.error.message}")
        return None, None, None, resp.error.message

    # Извлечение слов с bbox
    pages_out = []
    words_flat = []
    
    for i, page in enumerate(resp.full_text_annotation.pages):
        page_words = []
        for block in page.blocks:
            for paragraph in block.paragraphs:
                for w in paragraph.words:
                    text = "".join(s.text for s in w.symbols).strip()
                    if not text or not w.bounding_box or len(w.bounding_box.vertices) < 4:
                        continue
                    pts = []
                    for v in w.bounding_box.vertices:
                        x = v.x if v.x is not None else 0
                        y = v.y if v.y is not None else 0
                        pts.append({"x": float(x), "y": float(y)})
                    if len(pts) < 4:
                        continue
                    
                    word_dict = {"text": text, "bbox": pts[:4]}
                    page_words.append(word_dict)
                    words_flat.append(word_dict)

        pages_out.append({
            "page_number": i + 1,
            "width_px": page.width,
            "height_px": page.height,
            "words": page_words,
        })

    # Извлечение full_text_annotation
    full_text = getattr(resp.full_text_annotation, "text", "") or ""
    has_fulltext = bool(full_text.strip())

    # Если нет слов и нет full_text → ошибка
    if not words_flat and not has_fulltext:
        err = "No words with bbox and no full_text_annotation"
        if logger:
            logger.error(f"[OCR] {err} for {filename}")
        return None, None, None, err

    # Вычисление метрик геометрии
    if words_flat:
        metrics = compute_geometry_metrics(words_flat, k_neighbors=6)
        mode = choose_mode_by_metrics(
            metrics=metrics,
            has_fulltext=has_fulltext,
            angle_std_max=8.0,
            neighbor_p90_max=12.0,
            line_wobble_max=1.0,
            outlier_share_max=0.25,
        )
    else:
        metrics = {}
        mode = "FULLTEXT" if has_fulltext else "ERROR"

    if logger:
        logger.info(f"[OCR] {filename}: mode={mode}, metrics={metrics}")

    # Выбор текста в зависимости от режима
    if mode == "WORDS":
        try:
            joined_text, skew_deg = _join_words_to_lines(
                words_flat,
                use_skew=True,
                gap_scale=(0.4, 1.2, 3.0),
                hard_space_px=(15, 50, 150),
            )
            # joined_text, skew_deg = _join_words_to_lines(
            #     words_flat,
            #     use_proportional_spaces=True,  # НОВЫЙ ПАРАМЕТР
            #     max_spaces=15                   # НОВЫЙ ПАРАМЕТР
            # )
            plain_text = joined_text
            metrics["detected_skew_deg"] = float(skew_deg)
        except Exception as e:
            if logger:
                logger.warning(f"[OCR] WORDS mode failed for {filename}, fallback to FULLTEXT: {e}")
            plain_text = full_text
            mode = "FULLTEXT"
    elif mode == "FULLTEXT":
        plain_text = full_text
    else:  # ERROR
        err = "Geometry metrics failed and no full_text_annotation available"
        if logger:
            logger.error(f"[OCR] {err} for {filename}")
        return None, None, None, err

    # Формирование итогового JSON с метаинформацией
    result = {
        "pages": pages_out,
        "meta": {
            "mode": mode,
            "metrics": {k: round(v, 3) for k, v in metrics.items()},
        }
    }
    raw_json = json.dumps(result, ensure_ascii=False, separators=(",", ":"))

    return raw_json, plain_text, words_flat, None










# import json
# import math
# from statistics import median
# from google.cloud import vision

# # --- вспомогательные утилиты -----------------------------------------------

# PUNCT_FOLLOW = set(".,:;%)!?»")
# PUNCT_PRECEDE = set("([«")

# def _edges(b):
#     # TL, TR, BR, BL
#     tl, tr, br, bl = b
#     x_left  = (tl["x"] + bl["x"]) / 2.0
#     x_right = (tr["x"] + br["x"]) / 2.0
#     y_top   = (tl["y"] + tr["y"]) / 2.0
#     y_bot   = (bl["y"] + br["y"]) / 2.0
#     return x_left, x_right, y_top, y_bot

# def _angle_deg_of_box(b):
#     tl, tr, *_ = b
#     dx = tr["x"] - tl["x"]
#     dy = tr["y"] - tl["y"]
#     if dx == 0:
#         return 0.0
#     return math.degrees(math.atan2(dy, dx))

# def _estimate_skew_deg(items, min_width_px=200):
#     """Оценка наклона по широким словам"""
#     angles = []
#     for it in items:
#         x_l, x_r, y_t, y_b = _edges(it["bbox"])
#         if (x_r - x_l) >= min_width_px:
#             angles.append(_angle_deg_of_box(it["bbox"]))
#     return median(angles) if angles else 0.0

# def _correct_y_for_skew(y, x, skew_deg):
#     # y' = y - x * tan(theta)
#     return y - x * math.tan(math.radians(skew_deg))

# def _join_words_to_lines(doc_json, y_tol=None, use_skew=True,
#                          gap_scale=(0.4, 1.2, 3.0),
#                          hard_space_px=(15, 50, 150)):
#     """
#     Собирает построчный текст из слов.
#     Возвращает (joined_text, detected_skew_deg)
#     """
#     pages = doc_json.get("pages", [])
#     all_lines = []
#     detected_skew = 0.0

#     def _is_alpha_token(t: str) -> bool:
#         return any(ch.isalpha() for ch in t)

#     for page in pages:
#         words = page.get("words", [])
#         if not words:
#             continue

#         # 1) оценим высоту и наклон
#         heights = []
#         for w in words:
#             x_l, x_r, y_t, y_b = _edges(w["bbox"])
#             heights.append(max(1.0, y_b - y_t))
#         h_med = median(heights) if heights else 20.0

#         skew_deg = _estimate_skew_deg(words) if use_skew else 0.0
#         detected_skew = skew_deg

#         # 2) подготовим элементы (с коррекцией y)
#         items = []
#         for w in words:
#             txt = (w.get("text") or "").strip()
#             if not txt:
#                 continue
#             x_l, x_r, y_t, y_b = _edges(w["bbox"])
#             if use_skew and abs(skew_deg) > 0.05:
#                 y_t = _correct_y_for_skew(y_t, x_l, skew_deg)
#                 y_b = _correct_y_for_skew(y_b, x_l, skew_deg)
#             y_c = (y_t + y_b) / 2.0
#             items.append({
#                 "text": txt,
#                 "x_l": x_l, "x_r": x_r,
#                 "y_t": y_t, "y_b": y_b, "y_c": y_c,
#             })

#         if not items:
#             continue

#         # 3) порог по вертикали
#         if y_tol is None:
#             y_tol_px = max(10.0, min(40.0, 0.7 * h_med))
#         else:
#             y_tol_px = y_tol

#         # 4) группировка по Y в строки
#         items.sort(key=lambda t: (t["y_c"], t["x_l"]))
#         lines = []
#         current = []
#         current_y = None
#         for it in items:
#             if current_y is None or abs(it["y_c"] - current_y) <= y_tol_px:
#                 current.append(it)
#                 current_y = it["y_c"] if current_y is None else (current_y * 0.7 + it["y_c"] * 0.3)
#             else:
#                 lines.append(current)
#                 current = [it]
#                 current_y = it["y_c"]
#         if current:
#             lines.append(current)

#         # 5) склейка внутри строки по X с «умными» пробелами
#         for row in lines:
#             row.sort(key=lambda t: t["x_l"])
#             gaps = [max(0.0, b["x_l"] - a["x_r"]) for a, b in zip(row, row[1:])]
#             gaps_pos = [g for g in gaps if g > 0]
#             g_med = median(gaps_pos) if gaps_pos else None

#             pieces = [row[0]["text"]]
#             for (a, b, g) in zip(row, row[1:], gaps):
#                 # относительные или пиксельные пороги
#                 if g_med and g_med > 0:
#                     if g < gap_scale[0] * g_med:
#                         sp = ""
#                     elif g < gap_scale[1] * g_med:
#                         sp = " "
#                     elif g < gap_scale[2] * g_med:
#                         sp = "  "
#                     else:
#                         sp = "   "
#                 else:
#                     if g < hard_space_px[0]:
#                         sp = ""
#                     elif g < hard_space_px[1]:
#                         sp = " "
#                     elif g < hard_space_px[2]:
#                         sp = "  "
#                     else:
#                         sp = "   "

#                 # пунктуация
#                 if b["text"] and b["text"][0] in PUNCT_FOLLOW:
#                     sp = ""
#                 if pieces[-1] and pieces[-1][-1] in PUNCT_PRECEDE:
#                     sp = ""

#                 # --- фикс: буквы без пробела (например ZapaLTUAB) ---
#                 if _is_alpha_token(a["text"]) and _is_alpha_token(b["text"]):
#                     if not (a["text"].endswith("-") or b["text"].startswith("-")):
#                         if sp == "":
#                             sp = " "

#                 pieces.append(sp + b["text"])

#             # нормализация пробелов и пунктуации
#             line = "".join(pieces)
#             line = (line
#                     .replace(" .", ".")
#                     .replace(" ,", ",")
#                     .replace(" :", ":")
#                     .replace("( ", "(")
#                     .replace(" )", ")")
#                     .replace(" - ", "-"))
#             all_lines.append(line)

#     return "\n".join(all_lines), detected_skew

# # --- основная функция OCR ---------------------------------------------------

# def get_ocr_text(data, filename, logger):
#     """
#     Возвращает:
#       raw_json   : str — компактный JSON со СЛОВАМИ и bbox:
#                    {"pages":[{"page_number","width_px","height_px",
#                               "words":[{"text","bbox":[{x,y}*4]}, ...]}, ...]}
#       plain_text : str — склеенный построчный текст (из слов)
#       words_flat : list — список слов с bbox (Python-структура)
#       error      : str | None
#     """
#     try:
#         client = vision.ImageAnnotatorClient()
#         img = vision.Image(content=data)
#         resp = client.document_text_detection(image=img)
#     except Exception as e:
#         if logger:
#             logger.error(f"OCR exception for {filename}: {e}")
#         return None, None, None, str(e)

#     if resp.error.message:
#         if logger:
#             logger.error(f"OCR error for {filename}: {resp.error.message}")
#         return None, None, None, resp.error.message

#     pages_out = []
#     words_flat = []

#     # Собираем СЛОВА с bbox (можно добавить confidence/locale при необходимости)
#     for i, page in enumerate(resp.full_text_annotation.pages):
#         page_words = []
#         for block in page.blocks:
#             for paragraph in block.paragraphs:
#                 for w in paragraph.words:
#                     text = "".join(s.text for s in w.symbols).strip()
#                     if not text:
#                         continue
#                     bbox = [{"x": v.x or 0, "y": v.y or 0} for v in w.bounding_box.vertices]
#                     item = {"text": text, "bbox": bbox}
#                     page_words.append(item)
#                     words_flat.append(item)

#         pages_out.append({
#             "page_number": i + 1,
#             "width_px": page.width,
#             "height_px": page.height,
#             "words": page_words,
#         })

#     compact_json = {"pages": pages_out}

#     # Склейка в строки (joined) с учётом наклона и «умных» пробелов
#     joined_text, skew_deg = _join_words_to_lines(compact_json)

#     raw_json = json.dumps(compact_json, ensure_ascii=False)

#     return raw_json, joined_text, words_flat, None








# import json
# import math
# from statistics import median
# from google.cloud import vision

# # --- вспомогательные утилиты -----------------------------------------------

# PUNCT_FOLLOW = set(".,:;%)!?»")
# PUNCT_PRECEDE = set("([«")

# def _edges(b):
#     # TL, TR, BR, BL
#     tl, tr, br, bl = b
#     x_left  = (tl["x"] + bl["x"]) / 2.0
#     x_right = (tr["x"] + br["x"]) / 2.0
#     y_top   = (tl["y"] + tr["y"]) / 2.0
#     y_bot   = (bl["y"] + br["y"]) / 2.0
#     return x_left, x_right, y_top, y_bot

# def _angle_deg_of_box(b):
#     tl, tr, *_ = b
#     dx = tr["x"] - tl["x"]
#     dy = tr["y"] - tl["y"]
#     if dx == 0:
#         return 0.0
#     return math.degrees(math.atan2(dy, dx))

# def _estimate_skew_deg(paragraphs, min_width_px=200):
#     angles = []
#     for p in paragraphs:
#         x_l, x_r, y_t, y_b = _edges(p["bbox"])
#         if (x_r - x_l) >= min_width_px:
#             angles.append(_angle_deg_of_box(p["bbox"]))
#     return median(angles) if angles else 0.0

# def _correct_y_for_skew(y, x, skew_deg):
#     # y' = y - x * tan(theta)
#     return y - x * math.tan(math.radians(skew_deg))

# def _join_paragraphs_to_lines(doc_json, y_tol=None, use_skew=True,
#                               gap_scale=(0.4, 1.2, 3.0),
#                               hard_space_px=(15, 50, 150)):
#     """
#     Возвращает (joined_text, detected_skew_deg)
#     """
#     pages = doc_json.get("pages", [])
#     all_lines = []
#     detected_skew = 0.0

#     for page in pages:
#         pars = page.get("paragraphs", [])
#         if not pars:
#             continue

#         # 1) оценим высоту и наклон
#         heights = []
#         for p in pars:
#             x_l, x_r, y_t, y_b = _edges(p["bbox"])
#             heights.append(max(1.0, y_b - y_t))
#         h_med = median(heights) if heights else 20.0

#         skew_deg = _estimate_skew_deg(pars) if use_skew else 0.0
#         detected_skew = skew_deg

#         # 2) подготовим элементы (с коррекцией y)
#         items = []
#         for p in pars:
#             txt = (p.get("text") or "").strip()
#             if not txt:
#                 continue
#             x_l, x_r, y_t, y_b = _edges(p["bbox"])
#             if use_skew and abs(skew_deg) > 0.05:
#                 y_t = _correct_y_for_skew(y_t, x_l, skew_deg)
#                 y_b = _correct_y_for_skew(y_b, x_l, skew_deg)
#             y_c = (y_t + y_b) / 2.0
#             items.append({
#                 "text": txt,
#                 "x_l": x_l, "x_r": x_r,
#                 "y_t": y_t, "y_b": y_b, "y_c": y_c,
#             })

#         if not items:
#             continue

#         # 3) порог по вертикали
#         if y_tol is None:
#             y_tol_px = max(10.0, min(40.0, 0.7 * h_med))
#         else:
#             y_tol_px = y_tol

#         # 4) сортировка и группировка в строки по Y
#         items.sort(key=lambda t: (t["y_c"], t["x_l"]))
#         lines = []
#         current = []
#         current_y = None
#         for it in items:
#             if current_y is None or abs(it["y_c"] - current_y) <= y_tol_px:
#                 current.append(it)
#                 current_y = it["y_c"] if current_y is None else (current_y * 0.7 + it["y_c"] * 0.3)
#             else:
#                 lines.append(current)
#                 current = [it]
#                 current_y = it["y_c"]
#         if current:
#             lines.append(current)

#         # 5) склейка внутри строки по X с «умными» пробелами
#         for row in lines:
#             row.sort(key=lambda t: t["x_l"])
#             gaps = [max(0.0, b["x_l"] - a["x_r"]) for a, b in zip(row, row[1:])]
#             gaps_pos = [g for g in gaps if g > 0]
#             g_med = median(gaps_pos) if gaps_pos else None

#             pieces = [row[0]["text"]]
#             for (a, b, g) in zip(row, row[1:], gaps):
#                 # относительные или пиксельные пороги
#                 if g_med and g_med > 0:
#                     if g < gap_scale[0] * g_med:
#                         sp = ""
#                     elif g < gap_scale[1] * g_med:
#                         sp = " "
#                     elif g < gap_scale[2] * g_med:
#                         sp = "  "
#                     else:
#                         sp = "   "
#                 else:
#                     if g < hard_space_px[0]:
#                         sp = ""
#                     elif g < hard_space_px[1]:
#                         sp = " "
#                     elif g < hard_space_px[2]:
#                         sp = "  "
#                     else:
#                         sp = "   "

#                 # пунктуация
#                 if b["text"] and b["text"][0] in PUNCT_FOLLOW:
#                     sp = ""
#                 if pieces[-1] and pieces[-1][-1] in PUNCT_PRECEDE:
#                     sp = ""

#                 pieces.append(sp + b["text"])

#             all_lines.append("".join(pieces))

#     return "\n".join(all_lines), detected_skew

# # --- основная функция OCR ---------------------------------------------------

# def get_ocr_text(data, filename, logger):
#     """
#     Возвращает:
#       raw_json : str — КОМПАКТНЫЙ JSON только с параграфами и bbox:
#                   {"pages":[{"page_number", "width_px", "height_px",
#                              "paragraphs":[{"text","bbox":[{x,y}*4]}, ...]}, ...]}
#       plain_text : str — склеенный построчный текст (joined)
#       paragraphs : list — тот же контент параграфов как Python-структура
#       error : str | None
#     """
#     try:
#         client = vision.ImageAnnotatorClient()
#         img = vision.Image(content=data)
#         resp = client.document_text_detection(image=img)
#     except Exception as e:
#         if logger:
#             logger.error(f"OCR exception for {filename}: {e}")
#         return None, None, None, str(e)

#     if resp.error.message:
#         if logger:
#             logger.error(f"OCR error for {filename}: {resp.error.message}")
#         return None, None, None, resp.error.message

#     pages_out = []
#     paragraphs_flat = []

#     # Собираем ТОЛЬКО параграфы с bbox (без языков/конфиденсов)
#     for i, page in enumerate(resp.full_text_annotation.pages):
#         page_paras = []
#         for block in page.blocks:
#             for paragraph in block.paragraphs:
#                 words = []
#                 for w in paragraph.words:
#                     words.append("".join(s.text for s in w.symbols))
#                 para_text = " ".join(w for w in words if w).strip()
#                 if not para_text:
#                     continue

#                 bbox = [{"x": v.x or 0, "y": v.y or 0} for v in paragraph.bounding_box.vertices]
#                 item = {"text": para_text, "bbox": bbox}
#                 page_paras.append(item)
#                 paragraphs_flat.append(item)

#         pages_out.append({
#             "page_number": i + 1,
#             "width_px": page.width,
#             "height_px": page.height,
#             "paragraphs": page_paras,
#         })

#     compact_json = {"pages": pages_out}
#     # Склейка в строки (joined) с учётом наклона и «умных» пробелов
#     joined_text, skew_deg = _join_paragraphs_to_lines(compact_json)

#     # raw_json — компактный JSON только с нужными полями
#     raw_json = json.dumps(compact_json, ensure_ascii=False)

#     # Вторым значением возвращаем склеенный текст (joined)
#     return raw_json, joined_text, paragraphs_flat, None







# import json
# from google.cloud import vision

# def get_ocr_text(data, filename, logger):
#     """
#     Возвращает:
#       raw_json    : str — ТОЛЬКО нужное: pages[].paragraphs[].{text,bbox}
#       plain_text  : str — "" (пусто, т.к. ты просил только параграфы)
#       paragraphs  : list — тот же контент, но как python-структура (на всякий)
#       error       : str | None
#     """
#     try:
#         client = vision.ImageAnnotatorClient()
#         img = vision.Image(content=data)
#         resp = client.document_text_detection(image=img)
#     except Exception as e:
#         if logger:
#             logger.error(f"OCR exception for {filename}: {e}")
#         return None, None, None, str(e)

#     if resp.error.message:
#         if logger:
#             logger.error(f"OCR error for {filename}: {resp.error.message}")
#         return None, None, None, resp.error.message

#     pages_out = []
#     paragraphs_flat = []

#     # Собираем ТОЛЬКО параграфы с bbox (без языков, без confidence)
#     for i, page in enumerate(resp.full_text_annotation.pages):
#         page_paras = []
#         for block in page.blocks:
#             for paragraph in block.paragraphs:
#                 # текст параграфа = склейка слов пробелами
#                 words = []
#                 for w in paragraph.words:
#                     words.append("".join(s.text for s in w.symbols))
#                 para_text = " ".join(w for w in words if w).strip()
#                 if not para_text:
#                     continue

#                 bbox = [{"x": v.x or 0, "y": v.y or 0} for v in paragraph.bounding_box.vertices]
#                 item = {"text": para_text, "bbox": bbox}
#                 page_paras.append(item)
#                 paragraphs_flat.append(item)

#         pages_out.append({
#             "page_number": i + 1,
#             "width_px": page.width,
#             "height_px": page.height,
#             "paragraphs": page_paras,
#         })

#     # raw_json — только то, что нужно
#     raw_json = json.dumps({"pages": pages_out}, ensure_ascii=False)

#     # plain_text оставляем пустым по твоей просьбе
#     return raw_json, "", paragraphs_flat, None






#standartnaja ocr bez skleivanija i koordinat

# from google.cloud import vision


# def get_ocr_text(data, filename, logger):
#     client = vision.ImageAnnotatorClient()
#     img = vision.Image(content=data)
#     resp = client.document_text_detection(image=img)

#     if resp.error.message:
#         logger.error(f"OCR error for {filename}: {resp.error.message}")
#         return None, resp.error.message

#     text = (resp.full_text_annotation.text or "").strip()
#     return text, None
