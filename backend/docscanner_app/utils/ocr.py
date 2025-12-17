#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ocr.py — умная склейка OCR с автовыбором режима WORDS vs FULLTEXT

Вариант 3: Нормализация по ширине страницы.
Все X-координаты приводятся к фиксированной ширине строки в символах.

Улучшения:
- Обработка пунктуации (точки, запятые прилипают к словам)
- Склейка URL (https://, параметры ?key=value&)
- Обработка процентов и валют
"""
from __future__ import annotations

import json
import math
import re
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

# ---------- Константы ----------

# Пунктуация, которая прилипает к ПРЕДЫДУЩЕМУ слову (без пробела перед)
PUNCT_FOLLOW = set('.,:;%)!?»"\'')

# Пунктуация, которая прилипает к СЛЕДУЮЩЕМУ слову (без пробела после)
PUNCT_PRECEDE = set('([«"\'\u20ac$\u00a3\u00a5\u20bd#@')  # €$£¥₽

# Символы, которые могут быть частью числа/валюты и не требуют пробела
NUMBER_CHARS = set("0123456789.,%-€$£¥₽")


# ---------- Вспомогательные утилиты ----------

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
    """Коррекция Y-координаты с учётом наклона"""
    return y - x * math.tan(math.radians(skew_deg))


def _is_alpha_token(t: str) -> bool:
    """Содержит ли токен хотя бы одну букву"""
    return any(ch.isalpha() for ch in t)


def _is_number_like(t: str) -> bool:
    """Похоже ли на число/сумму (21.0, €25,00, 21.0%)"""
    if not t:
        return False
    # Убираем валюту и процент для проверки
    cleaned = t.strip("€$£¥₽%")
    if not cleaned:
        return False
    # Должно содержать цифры
    has_digit = any(c.isdigit() for c in cleaned)
    # Все символы — цифры, точки, запятые, минус
    all_number = all(c in "0123456789.,-" for c in cleaned)
    return has_digit and all_number


def _should_glue_tokens(prev_text: str, curr_text: str, gap_chars: int) -> bool:
    """
    Определяет, нужно ли склеить два токена без пробела.
    
    Возвращает True если токены должны быть склеены.
    """
    if not prev_text or not curr_text:
        return False
    
    prev_last = prev_text[-1]
    curr_first = curr_text[0]
    
    # 1. Пунктуация после слова: точка, запятая и т.д.
    if curr_first in PUNCT_FOLLOW:
        return True
    
    # 2. Пунктуация перед словом: открывающие скобки
    if prev_last in PUNCT_PRECEDE:
        return True
    
    # 3. Процент после числа: 21.0 + % = 21.0%
    if curr_text == "%" and _is_number_like(prev_text):
        return True
    
    # 4. Валюта перед числом: € + 25,00 = €25,00
    if prev_text in "€$£¥₽" and _is_number_like(curr_text):
        return True
    
    # 5. Число + валюта без пробела в оригинале (gap_chars <= 0)
    if gap_chars <= 0 and _is_number_like(prev_text) and curr_text in "€$£¥₽":
        return True
    
    # 6. URL части: склеиваем если очень близко и похоже на URL
    if gap_chars <= 1:
        # https + : или http + :
        if prev_text.lower() in ("http", "https") and curr_text == ":":
            return True
        # : + //
        if prev_text == ":" and curr_text == "//":
            return True
        # // + www или // + domain
        if prev_text == "//" and curr_text.replace(".", "").isalnum():
            return True
    
    return False


def _postprocess_text(text: str) -> str:
    """
    Постобработка текста: исправление типичных артефактов OCR.
    """
    # URL: https : //www.example.com -> https://www.example.com
    text = re.sub(r'(https?)\s*:\s*//', r'\1://', text, flags=re.IGNORECASE)
    
    # URL параметры: ? key = value & foo = bar -> ?key=value&foo=bar
    # Но только если похоже на URL (есть :// перед этим)
    def fix_url_params(match):
        url_part = match.group(0)
        # Убираем пробелы вокруг = и &
        url_part = re.sub(r'\s*=\s*', '=', url_part)
        url_part = re.sub(r'\s*&\s*', '&', url_part)
        url_part = re.sub(r'\s*\?\s*', '?', url_part)
        return url_part
    
    # Находим URL-подобные части и исправляем
    text = re.sub(
        r'https?://[^\s]+',
        fix_url_params,
        text,
        flags=re.IGNORECASE
    )
    
    # Проценты: 21.0 % -> 21.0%
    text = re.sub(r'(\d)\s+%', r'\1%', text)
    
    # Валюта перед числом: € 25,00 -> €25,00
    text = re.sub(r'([€$£¥₽])\s+(\d)', r'\1\2', text)
    
    # Валюта после числа (если без пробела в оригинале): 25,00€
    # Не трогаем, т.к. может быть намеренный пробел
    
    # Инициалы: S . -> S.
    text = re.sub(r'\b([A-ZА-ЯĄČĘĖĮŠŲŪŽa-zа-яąčęėįšųūž])\s+\.', r'\1.', text)
    
    # g . 25 -> g. 25 (сокращения)
    text = re.sub(r'\b(g|str|al|pr|kt)\s+\.', r'\1.', text, flags=re.IGNORECASE)
    
    # Tel . -> Tel.
    text = re.sub(r'\b(Tel|Mob|Fax|Nr|PVM|UAB|AB|IĮ|VĮ|MB)\s+\.', r'\1.', text, flags=re.IGNORECASE)
    
    # Номер дома/квартиры: 25 , Vilnius -> 25, Vilnius
    text = re.sub(r'(\d)\s+,', r'\1,', text)
    
    # Двойные пробелы -> одинарный (но сохраняем отступы в начале строки)
    lines = text.split('\n')
    fixed_lines = []
    for line in lines:
        # Считаем ведущие пробелы
        stripped = line.lstrip(' ')
        leading = len(line) - len(stripped)
        # Убираем множественные пробелы внутри строки, но не в начале
        # Сохраняем двойные+ пробелы для колонок (если > 3 пробелов подряд)
        # Только сворачиваем 2 пробела в 1
        fixed = re.sub(r'(?<! ) {2}(?! )', ' ', stripped)
        fixed_lines.append(' ' * leading + fixed)
    text = '\n'.join(fixed_lines)
    
    return text


def _join_words_to_lines(
    words_data: List[Dict],
    y_tol: Optional[float] = None,
    use_skew: bool = True,
    line_width_chars: int = 120,
    # Legacy параметры (для совместимости)
    use_proportional_spaces: bool = True,
    max_spaces: int = 100,
    gap_scale: Tuple[float, float, float] = (0.4, 1.2, 3.0),
    hard_space_px: Tuple[int, int, int] = (15, 50, 150),
) -> Tuple[str, float]:
    """
    Склейка слов в строки с нормализацией по ширине страницы.
    
    Все X-координаты приводятся к фиксированной сетке символов.
    Это даёт стабильное выравнивание колонок независимо от размера шрифта.
    
    Улучшения:
    - Пунктуация (. , : ;) прилипает к предыдущему слову
    - Открывающие скобки прилипают к следующему слову
    - Проценты прилипают к числам
    - Валюта (€) прилипает к числам
    
    Args:
        words_data: список слов [{"text": str, "bbox": [{x,y}*4]}, ...]
        y_tol: порог по Y для группировки в строки
        use_skew: корректировать наклон страницы
        line_width_chars: ширина строки в символах (по умолчанию 120)
    
    Returns:
        (joined_text, detected_skew_deg)
    """
    if not words_data:
        return "", 0.0

    # -------- 1. Определяем границы страницы --------
    all_x = []
    all_y = []
    heights = []
    
    for w in words_data:
        x_l, x_r, y_t, y_b = _edges(w["bbox"])
        all_x.extend([x_l, x_r])
        all_y.extend([y_t, y_b])
        heights.append(max(1.0, y_b - y_t))

    page_x_min = min(all_x)
    page_x_max = max(all_x)
    page_width = max(1.0, page_x_max - page_x_min)
    
    h_med = median(heights) if heights else 20.0
    
    # Ширина одного символа в пикселях (фиксированная сетка)
    char_width_px = page_width / line_width_chars

    # Оценка наклона
    skew_deg = _estimate_skew_deg(words_data) if use_skew else 0.0

    # -------- 2. Подготовка элементов с коррекцией Y --------
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
        
        # Позиция в символах (от левого края страницы)
        char_pos = int(round((x_l - page_x_min) / char_width_px))
        char_end = int(round((x_r - page_x_min) / char_width_px))
        
        items.append({
            "text": txt,
            "x_l": x_l,
            "x_r": x_r,
            "y_c": y_c,
            "char_pos": char_pos,
            "char_end": char_end,
        })

    if not items:
        return "", skew_deg

    # -------- 3. Группировка по Y в строки --------
    if y_tol is None:
        y_tol_px = max(8.0, min(30.0, 0.5 * h_med))
    else:
        y_tol_px = y_tol

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

    # -------- 4. Сборка строк по позициям символов --------
    all_lines_text = []

    for row in lines:
        row.sort(key=lambda t: t["char_pos"])
        
        # Собираем строку посимвольно
        line_chars = []
        cursor = 0  # текущая позиция курсора
        
        for idx, item in enumerate(row):
            target_pos = item["char_pos"]
            text = item["text"]
            
            if idx == 0:
                # Первое слово — просто отступ от левого края
                if target_pos > 0:
                    line_chars.append(" " * target_pos)
                    cursor = target_pos
                line_chars.append(text)
                cursor += len(text)
            else:
                prev_item = row[idx - 1]
                gap_chars = target_pos - prev_item["char_end"]
                
                # === Проверяем, нужно ли склеить без пробела ===
                if _should_glue_tokens(prev_item["text"], text, gap_chars):
                    # Склеиваем без пробела
                    spaces = 0
                else:
                    # Обычный случай — пробелы по координатам
                    # Гарантируем минимум 1 пробел между обычными словами
                    spaces = max(1, gap_chars)
                
                if spaces > 0:
                    line_chars.append(" " * spaces)
                    cursor += spaces
                
                line_chars.append(text)
                cursor += len(text)
        
        line_str = "".join(line_chars)
        line_str = line_str.rstrip()
        
        all_lines_text.append(line_str)

    joined_text = "\n".join(all_lines_text)
    
    # Постобработка
    joined_text = _postprocess_text(joined_text)
    
    return joined_text, skew_deg


def _join_words_simple(
    words_data: List[Dict],
    y_tol: Optional[float] = None,
    use_skew: bool = True,
) -> Tuple[str, float]:
    """
    Простая склейка слов в строки с одинарными пробелами.
    
    Используется для документов со средним качеством геометрии,
    где пропорциональные пробелы могут давать артефакты.
    
    Args:
        words_data: список слов [{"text": str, "bbox": [{x,y}*4]}, ...]
        y_tol: порог по Y для группировки в строки
        use_skew: корректировать наклон страницы
    
    Returns:
        (joined_text, detected_skew_deg)
    """
    if not words_data:
        return "", 0.0

    # Определяем высоты слов
    heights = []
    for w in words_data:
        x_l, x_r, y_t, y_b = _edges(w["bbox"])
        heights.append(max(1.0, y_b - y_t))
    h_med = median(heights) if heights else 20.0

    # Оценка наклона
    skew_deg = _estimate_skew_deg(words_data) if use_skew else 0.0

    # Подготовка элементов с коррекцией Y
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
            "x_l": x_l,
            "x_r": x_r,
            "y_c": y_c,
        })

    if not items:
        return "", skew_deg

    # Порог по Y для группировки
    if y_tol is None:
        y_tol_px = max(8.0, min(30.0, 0.5 * h_med))
    else:
        y_tol_px = y_tol

    # Группировка по Y
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

    # Сборка строк с умной склейкой
    all_lines_text = []
    for row in lines:
        row.sort(key=lambda t: t["x_l"])
        
        line_parts = []
        for idx, item in enumerate(row):
            text = item["text"]
            
            if idx == 0:
                line_parts.append(text)
            else:
                prev_text = row[idx - 1]["text"]
                
                # Проверяем нужно ли склеить без пробела
                if _should_glue_tokens(prev_text, text, gap_chars=1):
                    line_parts.append(text)
                else:
                    line_parts.append(" " + text)
        
        line_str = "".join(line_parts)
        all_lines_text.append(line_str)

    joined_text = "\n".join(all_lines_text)
    
    # Постобработка
    joined_text = _postprocess_text(joined_text)
    
    return joined_text, skew_deg


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
    Вычисление метрик геометрии для оценки "помятости" документа.
    
    Метрики:
    - angle_std_deg: стандартное отклонение углов слов
    - neighbor_p90_deg: 90-й перцентиль разницы углов между соседями
    - line_wobble: относительное отклонение Y внутри строк
    - outlier_share: доля слов с большим отклонением угла
    - line_collision_ratio: доля слов, которые "конфликтуют" по Y с соседними строками
    """
    if not words_data:
        return {
            "angle_std_deg": 0.0,
            "neighbor_p90_deg": 0.0,
            "line_wobble": 0.0,
            "outlier_share": 0.0,
            "global_angle_deg": 0.0,
            "median_word_height_px": 0.0,
            "line_collision_ratio": 0.0,
        }

    word_angles = []
    for w in words_data:
        bbox = w["bbox"]
        tl, tr = bbox[0], bbox[1]
        dx = tr["x"] - tl["x"]
        dy = tr["y"] - tl["y"]
        angle = math.atan2(dy, dx) if dx != 0 else 0.0
        word_angles.append(normalize_angle(angle))
    word_angles = np.array(word_angles, dtype=float)

    ang_wrapped = ((word_angles + math.pi/2) % math.pi) - math.pi/2
    global_angle = float(np.median(ang_wrapped))
    global_angle_deg = float(np.degrees(global_angle))

    rel_angles = np.vectorize(lambda a: normalize_angle(a - global_angle))(word_angles)
    angle_std_deg = float(np.degrees(np.std(rel_angles)))

    centers = []
    for w in words_data:
        bbox = w["bbox"]
        cx = sum(p["x"] for p in bbox) / 4.0
        cy = sum(p["y"] for p in bbox) / 4.0
        centers.append([cx, cy])
    centers = np.array(centers, dtype=float)

    c, s = math.cos(-global_angle), math.sin(-global_angle)
    R = np.array([[c, -s], [s, c]], dtype=float)
    centers_rot = centers @ R.T
    y_ = centers_rot[:, 1]
    x_ = centers_rot[:, 0]

    med_h = _median_word_height(words_data)
    y_band = 0.7 * max(med_h, 1.0)

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

    if N >= 2:
        db = DBSCAN(eps=0.7 * max(med_h, 1.0), min_samples=2, metric="euclidean").fit(y_.reshape(-1, 1))
        labels = db.labels_
    else:
        labels = np.array([-1])

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

    bad = np.degrees(np.abs(rel_angles)) > 10.0
    outlier_share = float(np.mean(bad)) if N else 0.0

    # --- Новая метрика: line_collision_ratio ---
    y_centers = []
    for w in words_data:
        bbox = w["bbox"]
        y_top = (bbox[0]["y"] + bbox[1]["y"]) / 2.0
        y_bot = (bbox[2]["y"] + bbox[3]["y"]) / 2.0
        y_centers.append((y_top + y_bot) / 2.0)
    y_centers = np.array(y_centers)
    
    collision_count = 0
    tolerance = 0.5 * med_h
    
    for i in range(N):
        y_i = y_centers[i]
        x_i = centers[i, 0]
        
        for j in range(i + 1, N):
            y_j = y_centers[j]
            x_j = centers[j, 0]
            
            x_dist = abs(x_i - x_j)
            y_dist = abs(y_i - y_j)
            
            if x_dist > 300 and 0 < y_dist < tolerance:
                collision_count += 1
    
    line_collision_ratio = float(collision_count / max(N, 1)) * 10.0

    return {
        "angle_std_deg": float(angle_std_deg),
        "neighbor_p90_deg": float(neighbor_p90_deg),
        "line_wobble": float(line_wobble),
        "outlier_share": float(outlier_share),
        "global_angle_deg": float(global_angle_deg),
        "median_word_height_px": float(med_h),
        "line_collision_ratio": float(line_collision_ratio),
    }


def choose_mode_by_metrics(
    metrics: Dict[str, float],
    has_fulltext: bool,
) -> str:
    """
    Выбор режима на основе метрик геометрии документа.
    
    Три режима:
    - WORDS_SPACES: идеальный документ → склейка с пропорциональными пробелами по координатам
    - WORDS: средний документ → склейка с простыми пробелами
    - FULLTEXT: помятый/кривой → берём full_text_annotation от Google
    """
    angle_std = metrics.get("angle_std_deg", 0.0)
    neighbor_p90 = metrics.get("neighbor_p90_deg", 0.0)
    line_wobble = metrics.get("line_wobble", 0.0)
    outlier_share = metrics.get("outlier_share", 0.0)
    
    # WORDS_SPACES: идеальная геометрия
    if (angle_std <= 1.5 and 
        neighbor_p90 <= 2.0 and 
        line_wobble <= 0.08 and 
        outlier_share <= 0.02):
        return "WORDS_SPACES"
    
    # WORDS: хорошая геометрия
    if (angle_std <= 4.0 and 
        neighbor_p90 <= 6.0 and 
        line_wobble <= 0.2 and 
        outlier_share <= 0.05):
        return "WORDS"
    
    # FULLTEXT: плохая геометрия
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
    """
    if vision is None:
        err = "google-cloud-vision не установлен. pip install google-cloud-vision"
        if logger:
            logger.error(f"[OCR] {err}")
        return None, None, None, err

    try:
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

    full_text = getattr(resp.full_text_annotation, "text", "") or ""
    has_fulltext = bool(full_text.strip())

    if not words_flat and not has_fulltext:
        err = "No words with bbox and no full_text_annotation"
        if logger:
            logger.error(f"[OCR] {err} for {filename}")
        return None, None, None, err

    if words_flat:
        metrics = compute_geometry_metrics(words_flat, k_neighbors=6)
        mode = choose_mode_by_metrics(
            metrics=metrics,
            has_fulltext=has_fulltext,
        )
    else:
        metrics = {}
        mode = "FULLTEXT" if has_fulltext else "ERROR"

    if logger:
        logger.info(f"[OCR] {filename}: mode={mode}, metrics={metrics}")

    if mode == "WORDS_SPACES":
        try:
            joined_text, skew_deg = _join_words_to_lines(
                words_flat,
                use_skew=True,
                line_width_chars=120,
            )
            plain_text = joined_text
            metrics["detected_skew_deg"] = float(skew_deg)
        except Exception as e:
            if logger:
                logger.warning(f"[OCR] WORDS_SPACES failed for {filename}, fallback to FULLTEXT: {e}")
            plain_text = full_text
            mode = "FULLTEXT"
    elif mode == "WORDS":
        try:
            joined_text, skew_deg = _join_words_simple(words_flat, use_skew=True)
            plain_text = joined_text
            metrics["detected_skew_deg"] = float(skew_deg)
        except Exception as e:
            if logger:
                logger.warning(f"[OCR] WORDS failed for {filename}, fallback to FULLTEXT: {e}")
            plain_text = full_text
            mode = "FULLTEXT"
    elif mode == "FULLTEXT":
        plain_text = full_text
    else:
        err = "Geometry metrics failed and no full_text_annotation available"
        if logger:
            logger.error(f"[OCR] {err} for {filename}")
        return None, None, None, err

    result = {
        "pages": pages_out,
        "meta": {
            "mode": mode,
            "metrics": {k: round(v, 3) for k, v in metrics.items()},
        }
    }
    raw_json = json.dumps(result, ensure_ascii=False, separators=(",", ":"))

    return raw_json, plain_text, words_flat, None















# #!/usr/bin/env python3
# # -*- coding: utf-8 -*-
# """
# ocr.py — умная склейка OCR с автовыбором режима WORDS vs FULLTEXT

# Вариант 3: Нормализация по ширине страницы.
# Все X-координаты приводятся к фиксированной ширине строки в символах.
# """
# from __future__ import annotations

# import json
# import math
# from statistics import median
# from typing import List, Dict, Any, Optional, Tuple

# import numpy as np

# try:
#     from google.cloud import vision
# except Exception:
#     vision = None

# from sklearn.cluster import DBSCAN
# import logging
# logger = logging.getLogger("docscanner_app")

# # ---------- Константы ----------

# PUNCT_FOLLOW = set(".,:;%)!?»")
# PUNCT_PRECEDE = set("([«")


# # ---------- Вспомогательные утилиты ----------

# def _edges(b):
#     """Центры рёбер bbox: x_left, x_right, y_top, y_bottom"""
#     tl, tr, br, bl = b
#     x_left = (tl["x"] + bl["x"]) / 2.0
#     x_right = (tr["x"] + br["x"]) / 2.0
#     y_top = (tl["y"] + tr["y"]) / 2.0
#     y_bot = (bl["y"] + br["y"]) / 2.0
#     return x_left, x_right, y_top, y_bot


# def _angle_deg_of_box(b):
#     """Угол наклона верхнего ребра bbox (в градусах)"""
#     tl, tr, *_ = b
#     dx = tr["x"] - tl["x"]
#     dy = tr["y"] - tl["y"]
#     if dx == 0:
#         return 0.0
#     return math.degrees(math.atan2(dy, dx))


# def _estimate_skew_deg(items, min_width_px=200):
#     """Оценка наклона страницы по широким словам"""
#     angles = []
#     for it in items:
#         x_l, x_r, y_t, y_b = _edges(it["bbox"])
#         if (x_r - x_l) >= min_width_px:
#             angles.append(_angle_deg_of_box(it["bbox"]))
#     return median(angles) if angles else 0.0


# def _correct_y_for_skew(y, x, skew_deg):
#     """Коррекция Y-координаты с учётом наклона"""
#     return y - x * math.tan(math.radians(skew_deg))


# def _is_alpha_token(t: str) -> bool:
#     """Содержит ли токен хотя бы одну букву"""
#     return any(ch.isalpha() for ch in t)


# def _join_words_to_lines(
#     words_data: List[Dict],
#     y_tol: Optional[float] = None,
#     use_skew: bool = True,
#     line_width_chars: int = 120,  # Фиксированная ширина строки в символах
#     # Legacy параметры (для совместимости)
#     use_proportional_spaces: bool = True,
#     max_spaces: int = 100,
#     gap_scale: Tuple[float, float, float] = (0.4, 1.2, 3.0),
#     hard_space_px: Tuple[int, int, int] = (15, 50, 150),
# ) -> Tuple[str, float]:
#     """
#     Склейка слов в строки с нормализацией по ширине страницы.
    
#     Все X-координаты приводятся к фиксированной сетке символов.
#     Это даёт стабильное выравнивание колонок независимо от размера шрифта.
    
#     Args:
#         words_data: список слов [{"text": str, "bbox": [{x,y}*4]}, ...]
#         y_tol: порог по Y для группировки в строки
#         use_skew: корректировать наклон страницы
#         line_width_chars: ширина строки в символах (по умолчанию 120)
    
#     Returns:
#         (joined_text, detected_skew_deg)
#     """
#     if not words_data:
#         return "", 0.0

#     # -------- 1. Определяем границы страницы --------
#     all_x = []
#     all_y = []
#     heights = []
    
#     for w in words_data:
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         all_x.extend([x_l, x_r])
#         all_y.extend([y_t, y_b])
#         heights.append(max(1.0, y_b - y_t))

#     page_x_min = min(all_x)
#     page_x_max = max(all_x)
#     page_width = max(1.0, page_x_max - page_x_min)
    
#     h_med = median(heights) if heights else 20.0
    
#     # Ширина одного символа в пикселях (фиксированная сетка)
#     char_width_px = page_width / line_width_chars

#     # Оценка наклона
#     skew_deg = _estimate_skew_deg(words_data) if use_skew else 0.0

#     # -------- 2. Подготовка элементов с коррекцией Y --------
#     items = []
#     for w in words_data:
#         txt = (w.get("text") or "").strip()
#         if not txt:
#             continue
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         if use_skew and abs(skew_deg) > 0.05:
#             y_t = _correct_y_for_skew(y_t, x_l, skew_deg)
#             y_b = _correct_y_for_skew(y_b, x_l, skew_deg)
#         y_c = (y_t + y_b) / 2.0
        
#         # Позиция в символах (от левого края страницы)
#         char_pos = int(round((x_l - page_x_min) / char_width_px))
#         char_end = int(round((x_r - page_x_min) / char_width_px))
        
#         items.append({
#             "text": txt,
#             "x_l": x_l,
#             "x_r": x_r,
#             "y_c": y_c,
#             "char_pos": char_pos,
#             "char_end": char_end,
#         })

#     if not items:
#         return "", skew_deg

#     # -------- 3. Группировка по Y в строки --------
#     if y_tol is None:
#         # Коэффициент 0.5 — компромисс между склейкой и разделением
#         # Для h_med=17px даёт y_tol=8.5px (разброс внутри строки ~8px, между строками ~14px)
#         y_tol_px = max(8.0, min(30.0, 0.5 * h_med))
#     else:
#         y_tol_px = y_tol

#     items.sort(key=lambda t: (t["y_c"], t["x_l"]))

#     lines = []
#     current = []
#     current_y = None

#     for it in items:
#         if current_y is None or abs(it["y_c"] - current_y) <= y_tol_px:
#             current.append(it)
#             current_y = it["y_c"] if current_y is None else (current_y * 0.7 + it["y_c"] * 0.3)
#         else:
#             lines.append(current)
#             current = [it]
#             current_y = it["y_c"]

#     if current:
#         lines.append(current)

#     # -------- 4. Сборка строк по позициям символов --------
#     all_lines_text = []

#     for row in lines:
#         row.sort(key=lambda t: t["char_pos"])
        
#         # Собираем строку посимвольно
#         line_chars = []
#         cursor = 0  # текущая позиция курсора
        
#         for idx, item in enumerate(row):
#             target_pos = item["char_pos"]
#             text = item["text"]
            
#             if idx == 0:
#                 # Первое слово — просто отступ от левого края
#                 if target_pos > 0:
#                     line_chars.append(" " * target_pos)
#                     cursor = target_pos
#             else:
#                 # Последующие слова — считаем пробелы от предыдущего
#                 prev_item = row[idx - 1]
#                 # Разница между началом текущего и концом предыдущего (в char-позициях)
#                 gap_chars = target_pos - prev_item["char_end"]
                
#                 # Гарантируем минимум 1 пробел между словами
#                 spaces = max(1, gap_chars)
#                 line_chars.append(" " * spaces)
#                 cursor += spaces
            
#             # Добавляем само слово
#             line_chars.append(text)
#             cursor += len(text)
        
#         line_str = "".join(line_chars)
#         line_str = line_str.rstrip()
        
#         all_lines_text.append(line_str)

#     return "\n".join(all_lines_text), skew_deg


# def _join_words_simple(
#     words_data: List[Dict],
#     y_tol: Optional[float] = None,
#     use_skew: bool = True,
# ) -> Tuple[str, float]:
#     """
#     Простая склейка слов в строки с одинарными пробелами.
    
#     Используется для документов со средним качеством геометрии,
#     где пропорциональные пробелы могут давать артефакты.
    
#     Args:
#         words_data: список слов [{"text": str, "bbox": [{x,y}*4]}, ...]
#         y_tol: порог по Y для группировки в строки
#         use_skew: корректировать наклон страницы
    
#     Returns:
#         (joined_text, detected_skew_deg)
#     """
#     if not words_data:
#         return "", 0.0

#     # Определяем высоты слов
#     heights = []
#     for w in words_data:
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         heights.append(max(1.0, y_b - y_t))
#     h_med = median(heights) if heights else 20.0

#     # Оценка наклона
#     skew_deg = _estimate_skew_deg(words_data) if use_skew else 0.0

#     # Подготовка элементов с коррекцией Y
#     items = []
#     for w in words_data:
#         txt = (w.get("text") or "").strip()
#         if not txt:
#             continue
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         if use_skew and abs(skew_deg) > 0.05:
#             y_t = _correct_y_for_skew(y_t, x_l, skew_deg)
#             y_b = _correct_y_for_skew(y_b, x_l, skew_deg)
#         y_c = (y_t + y_b) / 2.0
#         items.append({
#             "text": txt,
#             "x_l": x_l,
#             "x_r": x_r,
#             "y_c": y_c,
#         })

#     if not items:
#         return "", skew_deg

#     # Порог по Y для группировки
#     if y_tol is None:
#         y_tol_px = max(8.0, min(30.0, 0.5 * h_med))
#     else:
#         y_tol_px = y_tol

#     # Группировка по Y
#     items.sort(key=lambda t: (t["y_c"], t["x_l"]))
    
#     lines = []
#     current = []
#     current_y = None

#     for it in items:
#         if current_y is None or abs(it["y_c"] - current_y) <= y_tol_px:
#             current.append(it)
#             current_y = it["y_c"] if current_y is None else (current_y * 0.7 + it["y_c"] * 0.3)
#         else:
#             lines.append(current)
#             current = [it]
#             current_y = it["y_c"]

#     if current:
#         lines.append(current)

#     # Сборка строк с простыми пробелами
#     all_lines_text = []
#     for row in lines:
#         row.sort(key=lambda t: t["x_l"])
#         line_str = " ".join(item["text"] for item in row)
#         all_lines_text.append(line_str)

#     return "\n".join(all_lines_text), skew_deg


# # ---------- Метрики для выбора режима ----------

# def normalize_angle(a: float) -> float:
#     """Нормализация угла в диапазон [-π, π]"""
#     a = math.fmod(a, 2 * math.pi)
#     if a <= -math.pi:
#         a += 2 * math.pi
#     elif a > math.pi:
#         a -= 2 * math.pi
#     return a


# def _median_word_height(words_data) -> float:
#     """Медианная высота слов"""
#     heights = []
#     for w in words_data:
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         heights.append(max(1.0, y_b - y_t))
#     return float(median(heights)) if heights else 0.0


# def compute_geometry_metrics(words_data, k_neighbors: int = 6) -> Dict[str, float]:
#     """
#     Вычисление метрик геометрии для оценки "помятости" документа.
    
#     Метрики:
#     - angle_std_deg: стандартное отклонение углов слов
#     - neighbor_p90_deg: 90-й перцентиль разницы углов между соседями
#     - line_wobble: относительное отклонение Y внутри строк
#     - outlier_share: доля слов с большим отклонением угла
#     - line_collision_ratio: доля слов, которые "конфликтуют" по Y с соседними строками
#     """
#     if not words_data:
#         return {
#             "angle_std_deg": 0.0,
#             "neighbor_p90_deg": 0.0,
#             "line_wobble": 0.0,
#             "outlier_share": 0.0,
#             "global_angle_deg": 0.0,
#             "median_word_height_px": 0.0,
#             "line_collision_ratio": 0.0,
#         }

#     word_angles = []
#     for w in words_data:
#         bbox = w["bbox"]
#         tl, tr = bbox[0], bbox[1]
#         dx = tr["x"] - tl["x"]
#         dy = tr["y"] - tl["y"]
#         angle = math.atan2(dy, dx) if dx != 0 else 0.0
#         word_angles.append(normalize_angle(angle))
#     word_angles = np.array(word_angles, dtype=float)

#     ang_wrapped = ((word_angles + math.pi/2) % math.pi) - math.pi/2
#     global_angle = float(np.median(ang_wrapped))
#     global_angle_deg = float(np.degrees(global_angle))

#     rel_angles = np.vectorize(lambda a: normalize_angle(a - global_angle))(word_angles)
#     angle_std_deg = float(np.degrees(np.std(rel_angles)))

#     centers = []
#     for w in words_data:
#         bbox = w["bbox"]
#         cx = sum(p["x"] for p in bbox) / 4.0
#         cy = sum(p["y"] for p in bbox) / 4.0
#         centers.append([cx, cy])
#     centers = np.array(centers, dtype=float)

#     c, s = math.cos(-global_angle), math.sin(-global_angle)
#     R = np.array([[c, -s], [s, c]], dtype=float)
#     centers_rot = centers @ R.T
#     y_ = centers_rot[:, 1]
#     x_ = centers_rot[:, 0]

#     med_h = _median_word_height(words_data)
#     y_band = 0.7 * max(med_h, 1.0)

#     diffs = []
#     N = len(words_data)
#     for i in range(N):
#         dy = np.abs(y_ - y_[i])
#         mask = (dy <= y_band)
#         if np.count_nonzero(mask) <= 1:
#             continue
#         cand_idx = np.where(mask)[0]
#         cand_idx = cand_idx[cand_idx != i]
#         order = np.argsort(np.abs(x_[cand_idx] - x_[i]))
#         take = cand_idx[order[:k_neighbors]]
#         for j in take:
#             dtheta = abs(np.degrees(normalize_angle(word_angles[i] - word_angles[j])))
#             if dtheta > 90.0:
#                 dtheta = 180.0 - dtheta
#             diffs.append(dtheta)
#     neighbor_p90_deg = float(np.percentile(diffs, 90)) if diffs else 0.0

#     if N >= 2:
#         db = DBSCAN(eps=0.7 * max(med_h, 1.0), min_samples=2, metric="euclidean").fit(y_.reshape(-1, 1))
#         labels = db.labels_
#     else:
#         labels = np.array([-1])

#     row_sigmas = []
#     for lab in sorted(set(labels)):
#         idxs = np.where(labels == lab)[0]
#         if lab == -1 or len(idxs) < 2:
#             continue
#         y_line = y_[idxs]
#         sigma = float(np.std(y_line - np.median(y_line)))
#         row_sigmas.append(sigma)
#     median_row_sigma = float(np.median(row_sigmas)) if row_sigmas else 0.0
#     line_wobble = (median_row_sigma / max(med_h, 1e-3)) if med_h > 0 else 0.0

#     bad = np.degrees(np.abs(rel_angles)) > 10.0
#     outlier_share = float(np.mean(bad)) if N else 0.0

#     # --- Новая метрика: line_collision_ratio ---
#     # Детектирует помятые документы, где слова из разных колонок
#     # имеют слишком близкие Y-координаты (строки "плывут")
    
#     y_centers = []
#     for w in words_data:
#         bbox = w["bbox"]
#         y_top = (bbox[0]["y"] + bbox[1]["y"]) / 2.0
#         y_bot = (bbox[2]["y"] + bbox[3]["y"]) / 2.0
#         y_centers.append((y_top + y_bot) / 2.0)
#     y_centers = np.array(y_centers)
    
#     collision_count = 0
#     tolerance = 0.5 * med_h  # Половина высоты слова
    
#     # Проверяем пары слов: если X далеко (разные колонки), но Y близко — коллизия
#     for i in range(N):
#         y_i = y_centers[i]
#         x_i = centers[i, 0]
        
#         for j in range(i + 1, N):
#             y_j = y_centers[j]
#             x_j = centers[j, 0]
            
#             x_dist = abs(x_i - x_j)
#             y_dist = abs(y_i - y_j)
            
#             # Слова в разных колонках (X > 300px) но Y слишком близко
#             if x_dist > 300 and 0 < y_dist < tolerance:
#                 collision_count += 1
    
#     # Нормализуем — сколько коллизий на 100 слов
#     line_collision_ratio = float(collision_count / max(N, 1)) * 10.0

#     return {
#         "angle_std_deg": float(angle_std_deg),
#         "neighbor_p90_deg": float(neighbor_p90_deg),
#         "line_wobble": float(line_wobble),
#         "outlier_share": float(outlier_share),
#         "global_angle_deg": float(global_angle_deg),
#         "median_word_height_px": float(med_h),
#         "line_collision_ratio": float(line_collision_ratio),
#     }


# def choose_mode_by_metrics(
#     metrics: Dict[str, float],
#     has_fulltext: bool,
# ) -> str:
#     """
#     Выбор режима на основе метрик геометрии документа.
    
#     Три режима:
#     - WORDS_SPACES: идеальный документ → склейка с пропорциональными пробелами по координатам
#     - WORDS: средний документ → склейка с простыми пробелами
#     - FULLTEXT: помятый/кривой → берём full_text_annotation от Google
#     """
#     angle_std = metrics.get("angle_std_deg", 0.0)
#     neighbor_p90 = metrics.get("neighbor_p90_deg", 0.0)
#     line_wobble = metrics.get("line_wobble", 0.0)
#     outlier_share = metrics.get("outlier_share", 0.0)
    
#     # WORDS_SPACES: идеальная геометрия
#     if (angle_std <= 1.5 and 
#         neighbor_p90 <= 2.0 and 
#         line_wobble <= 0.08 and 
#         outlier_share <= 0.02):
#         return "WORDS_SPACES"
    
#     # WORDS: хорошая геометрия
#     if (angle_std <= 3.0 and 
#         neighbor_p90 <= 6.0 and 
#         line_wobble <= 0.18 and 
#         outlier_share <= 0.05):
#         return "WORDS"
    
#     # FULLTEXT: плохая геометрия
#     if has_fulltext:
#         return "FULLTEXT"
    
#     return "ERROR"


# # ---------- Главная функция для backend ----------

# def get_ocr_text(
#     data: bytes,
#     filename: Optional[str] = None,
#     logger: Optional[Any] = None
# ) -> Tuple[Optional[str], Optional[str], Optional[List[Dict[str, Any]]], Optional[str]]:
#     """
#     Главная функция OCR для backend.
#     """
#     if vision is None:
#         err = "google-cloud-vision не установлен. pip install google-cloud-vision"
#         if logger:
#             logger.error(f"[OCR] {err}")
#         return None, None, None, err

#     try:
#         client = vision.ImageAnnotatorClient()
#         image = vision.Image(content=data)
#         resp = client.document_text_detection(image=image)
#     except Exception as e:
#         if logger:
#             logger.error(f"[OCR] Vision API exception for {filename}: {e}")
#         return None, None, None, str(e)

#     if resp.error.message:
#         if logger:
#             logger.error(f"[OCR] Vision API error for {filename}: {resp.error.message}")
#         return None, None, None, resp.error.message

#     pages_out = []
#     words_flat = []

#     for i, page in enumerate(resp.full_text_annotation.pages):
#         page_words = []
#         for block in page.blocks:
#             for paragraph in block.paragraphs:
#                 for w in paragraph.words:
#                     text = "".join(s.text for s in w.symbols).strip()
#                     if not text or not w.bounding_box or len(w.bounding_box.vertices) < 4:
#                         continue
#                     pts = []
#                     for v in w.bounding_box.vertices:
#                         x = v.x if v.x is not None else 0
#                         y = v.y if v.y is not None else 0
#                         pts.append({"x": float(x), "y": float(y)})
#                     if len(pts) < 4:
#                         continue

#                     word_dict = {"text": text, "bbox": pts[:4]}
#                     page_words.append(word_dict)
#                     words_flat.append(word_dict)

#         pages_out.append({
#             "page_number": i + 1,
#             "width_px": page.width,
#             "height_px": page.height,
#             "words": page_words,
#         })

#     full_text = getattr(resp.full_text_annotation, "text", "") or ""
#     has_fulltext = bool(full_text.strip())

#     if not words_flat and not has_fulltext:
#         err = "No words with bbox and no full_text_annotation"
#         if logger:
#             logger.error(f"[OCR] {err} for {filename}")
#         return None, None, None, err

#     if words_flat:
#         metrics = compute_geometry_metrics(words_flat, k_neighbors=6)
#         mode = choose_mode_by_metrics(
#             metrics=metrics,
#             has_fulltext=has_fulltext,
#         )
#     else:
#         metrics = {}
#         mode = "FULLTEXT" if has_fulltext else "ERROR"

#     if logger:
#         logger.info(f"[OCR] {filename}: mode={mode}, metrics={metrics}")

#     if mode == "WORDS_SPACES":
#         # Идеальный документ — склейка с пропорциональными пробелами
#         try:
#             joined_text, skew_deg = _join_words_to_lines(
#                 words_flat,
#                 use_skew=True,
#                 line_width_chars=120,
#             )
#             plain_text = joined_text
#             metrics["detected_skew_deg"] = float(skew_deg)
#         except Exception as e:
#             if logger:
#                 logger.warning(f"[OCR] WORDS_SPACES failed for {filename}, fallback to FULLTEXT: {e}")
#             plain_text = full_text
#             mode = "FULLTEXT"
#     elif mode == "WORDS":
#         # Средний документ — склейка с простыми одинарными пробелами
#         try:
#             joined_text, skew_deg = _join_words_simple(words_flat, use_skew=True)
#             plain_text = joined_text
#             metrics["detected_skew_deg"] = float(skew_deg)
#         except Exception as e:
#             if logger:
#                 logger.warning(f"[OCR] WORDS failed for {filename}, fallback to FULLTEXT: {e}")
#             plain_text = full_text
#             mode = "FULLTEXT"
#     elif mode == "FULLTEXT":
#         plain_text = full_text
#     else:
#         err = "Geometry metrics failed and no full_text_annotation available"
#         if logger:
#             logger.error(f"[OCR] {err} for {filename}")
#         return None, None, None, err

#     result = {
#         "pages": pages_out,
#         "meta": {
#             "mode": mode,
#             "metrics": {k: round(v, 3) for k, v in metrics.items()},
#         }
#     }
#     raw_json = json.dumps(result, ensure_ascii=False, separators=(",", ":"))

#     return raw_json, plain_text, words_flat, None















#OLD with 2 modes

# #!/usr/bin/env python3
# # -*- coding: utf-8 -*-
# """
# ocr.py — умная склейка OCR с автовыбором режима WORDS vs FULLTEXT

# Вариант 3: Нормализация по ширине страницы.
# Все X-координаты приводятся к фиксированной ширине строки в символах.
# """
# from __future__ import annotations

# import json
# import math
# from statistics import median
# from typing import List, Dict, Any, Optional, Tuple

# import numpy as np

# try:
#     from google.cloud import vision
# except Exception:
#     vision = None

# from sklearn.cluster import DBSCAN
# import logging
# logger = logging.getLogger("docscanner_app")

# # ---------- Константы ----------

# PUNCT_FOLLOW = set(".,:;%)!?»")
# PUNCT_PRECEDE = set("([«")


# # ---------- Вспомогательные утилиты ----------

# def _edges(b):
#     """Центры рёбер bbox: x_left, x_right, y_top, y_bottom"""
#     tl, tr, br, bl = b
#     x_left = (tl["x"] + bl["x"]) / 2.0
#     x_right = (tr["x"] + br["x"]) / 2.0
#     y_top = (tl["y"] + tr["y"]) / 2.0
#     y_bot = (bl["y"] + br["y"]) / 2.0
#     return x_left, x_right, y_top, y_bot


# def _angle_deg_of_box(b):
#     """Угол наклона верхнего ребра bbox (в градусах)"""
#     tl, tr, *_ = b
#     dx = tr["x"] - tl["x"]
#     dy = tr["y"] - tl["y"]
#     if dx == 0:
#         return 0.0
#     return math.degrees(math.atan2(dy, dx))


# def _estimate_skew_deg(items, min_width_px=200):
#     """Оценка наклона страницы по широким словам"""
#     angles = []
#     for it in items:
#         x_l, x_r, y_t, y_b = _edges(it["bbox"])
#         if (x_r - x_l) >= min_width_px:
#             angles.append(_angle_deg_of_box(it["bbox"]))
#     return median(angles) if angles else 0.0


# def _correct_y_for_skew(y, x, skew_deg):
#     """Коррекция Y-координаты с учётом наклона"""
#     return y - x * math.tan(math.radians(skew_deg))


# def _is_alpha_token(t: str) -> bool:
#     """Содержит ли токен хотя бы одну букву"""
#     return any(ch.isalpha() for ch in t)


# def _join_words_to_lines(
#     words_data: List[Dict],
#     y_tol: Optional[float] = None,
#     use_skew: bool = True,
#     line_width_chars: int = 120,  # Фиксированная ширина строки в символах
#     # Legacy параметры (для совместимости)
#     use_proportional_spaces: bool = True,
#     max_spaces: int = 100,
#     gap_scale: Tuple[float, float, float] = (0.4, 1.2, 3.0),
#     hard_space_px: Tuple[int, int, int] = (15, 50, 150),
# ) -> Tuple[str, float]:
#     """
#     Склейка слов в строки с нормализацией по ширине страницы.
    
#     Все X-координаты приводятся к фиксированной сетке символов.
#     Это даёт стабильное выравнивание колонок независимо от размера шрифта.
    
#     Args:
#         words_data: список слов [{"text": str, "bbox": [{x,y}*4]}, ...]
#         y_tol: порог по Y для группировки в строки
#         use_skew: корректировать наклон страницы
#         line_width_chars: ширина строки в символах (по умолчанию 120)
    
#     Returns:
#         (joined_text, detected_skew_deg)
#     """
#     if not words_data:
#         return "", 0.0

#     # -------- 1. Определяем границы страницы --------
#     all_x = []
#     all_y = []
#     heights = []
    
#     for w in words_data:
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         all_x.extend([x_l, x_r])
#         all_y.extend([y_t, y_b])
#         heights.append(max(1.0, y_b - y_t))

#     page_x_min = min(all_x)
#     page_x_max = max(all_x)
#     page_width = max(1.0, page_x_max - page_x_min)
    
#     h_med = median(heights) if heights else 20.0
    
#     # Ширина одного символа в пикселях (фиксированная сетка)
#     char_width_px = page_width / line_width_chars

#     # Оценка наклона
#     skew_deg = _estimate_skew_deg(words_data) if use_skew else 0.0

#     # -------- 2. Подготовка элементов с коррекцией Y --------
#     items = []
#     for w in words_data:
#         txt = (w.get("text") or "").strip()
#         if not txt:
#             continue
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         if use_skew and abs(skew_deg) > 0.05:
#             y_t = _correct_y_for_skew(y_t, x_l, skew_deg)
#             y_b = _correct_y_for_skew(y_b, x_l, skew_deg)
#         y_c = (y_t + y_b) / 2.0
        
#         # Позиция в символах (от левого края страницы)
#         char_pos = int(round((x_l - page_x_min) / char_width_px))
#         char_end = int(round((x_r - page_x_min) / char_width_px))
        
#         items.append({
#             "text": txt,
#             "x_l": x_l,
#             "x_r": x_r,
#             "y_c": y_c,
#             "char_pos": char_pos,
#             "char_end": char_end,
#         })

#     if not items:
#         return "", skew_deg

#     # -------- 3. Группировка по Y в строки --------
#     if y_tol is None:
#         y_tol_px = max(10.0, min(40.0, 0.7 * h_med))
#     else:
#         y_tol_px = y_tol

#     items.sort(key=lambda t: (t["y_c"], t["x_l"]))

#     lines = []
#     current = []
#     current_y = None

#     for it in items:
#         if current_y is None or abs(it["y_c"] - current_y) <= y_tol_px:
#             current.append(it)
#             current_y = it["y_c"] if current_y is None else (current_y * 0.7 + it["y_c"] * 0.3)
#         else:
#             lines.append(current)
#             current = [it]
#             current_y = it["y_c"]

#     if current:
#         lines.append(current)

#     # -------- 4. Сборка строк по позициям символов --------
#     all_lines_text = []

#     for row in lines:
#         row.sort(key=lambda t: t["char_pos"])
        
#         # Собираем строку посимвольно
#         line_chars = []
#         cursor = 0  # текущая позиция курсора
        
#         for idx, item in enumerate(row):
#             target_pos = item["char_pos"]
#             text = item["text"]
            
#             if idx == 0:
#                 # Первое слово — просто отступ от левого края
#                 if target_pos > 0:
#                     line_chars.append(" " * target_pos)
#                     cursor = target_pos
#             else:
#                 # Последующие слова — считаем пробелы от предыдущего
#                 prev_item = row[idx - 1]
#                 # Разница между началом текущего и концом предыдущего (в char-позициях)
#                 gap_chars = target_pos - prev_item["char_end"]
                
#                 # Гарантируем минимум 1 пробел между словами
#                 spaces = max(1, gap_chars)
#                 line_chars.append(" " * spaces)
#                 cursor += spaces
            
#             # Добавляем само слово
#             line_chars.append(text)
#             cursor += len(text)
        
#         line_str = "".join(line_chars)
#         line_str = line_str.rstrip()
        
#         all_lines_text.append(line_str)

#     return "\n".join(all_lines_text), skew_deg


# # ---------- Метрики для выбора режима ----------

# def normalize_angle(a: float) -> float:
#     """Нормализация угла в диапазон [-π, π]"""
#     a = math.fmod(a, 2 * math.pi)
#     if a <= -math.pi:
#         a += 2 * math.pi
#     elif a > math.pi:
#         a -= 2 * math.pi
#     return a


# def _median_word_height(words_data) -> float:
#     """Медианная высота слов"""
#     heights = []
#     for w in words_data:
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         heights.append(max(1.0, y_b - y_t))
#     return float(median(heights)) if heights else 0.0


# def compute_geometry_metrics(words_data, k_neighbors: int = 6) -> Dict[str, float]:
#     """
#     Вычисление метрик геометрии для оценки "помятости" документа.
#     """
#     if not words_data:
#         return {
#             "angle_std_deg": 0.0,
#             "neighbor_p90_deg": 0.0,
#             "line_wobble": 0.0,
#             "outlier_share": 0.0,
#             "global_angle_deg": 0.0,
#             "median_word_height_px": 0.0,
#         }

#     word_angles = []
#     for w in words_data:
#         bbox = w["bbox"]
#         tl, tr = bbox[0], bbox[1]
#         dx = tr["x"] - tl["x"]
#         dy = tr["y"] - tl["y"]
#         angle = math.atan2(dy, dx) if dx != 0 else 0.0
#         word_angles.append(normalize_angle(angle))
#     word_angles = np.array(word_angles, dtype=float)

#     ang_wrapped = ((word_angles + math.pi/2) % math.pi) - math.pi/2
#     global_angle = float(np.median(ang_wrapped))
#     global_angle_deg = float(np.degrees(global_angle))

#     rel_angles = np.vectorize(lambda a: normalize_angle(a - global_angle))(word_angles)
#     angle_std_deg = float(np.degrees(np.std(rel_angles)))

#     centers = []
#     for w in words_data:
#         bbox = w["bbox"]
#         cx = sum(p["x"] for p in bbox) / 4.0
#         cy = sum(p["y"] for p in bbox) / 4.0
#         centers.append([cx, cy])
#     centers = np.array(centers, dtype=float)

#     c, s = math.cos(-global_angle), math.sin(-global_angle)
#     R = np.array([[c, -s], [s, c]], dtype=float)
#     centers_rot = centers @ R.T
#     y_ = centers_rot[:, 1]
#     x_ = centers_rot[:, 0]

#     med_h = _median_word_height(words_data)
#     y_band = 0.7 * max(med_h, 1.0)

#     diffs = []
#     N = len(words_data)
#     for i in range(N):
#         dy = np.abs(y_ - y_[i])
#         mask = (dy <= y_band)
#         if np.count_nonzero(mask) <= 1:
#             continue
#         cand_idx = np.where(mask)[0]
#         cand_idx = cand_idx[cand_idx != i]
#         order = np.argsort(np.abs(x_[cand_idx] - x_[i]))
#         take = cand_idx[order[:k_neighbors]]
#         for j in take:
#             dtheta = abs(np.degrees(normalize_angle(word_angles[i] - word_angles[j])))
#             if dtheta > 90.0:
#                 dtheta = 180.0 - dtheta
#             diffs.append(dtheta)
#     neighbor_p90_deg = float(np.percentile(diffs, 90)) if diffs else 0.0

#     if N >= 2:
#         db = DBSCAN(eps=0.7 * max(med_h, 1.0), min_samples=2, metric="euclidean").fit(y_.reshape(-1, 1))
#         labels = db.labels_
#     else:
#         labels = np.array([-1])

#     row_sigmas = []
#     for lab in sorted(set(labels)):
#         idxs = np.where(labels == lab)[0]
#         if lab == -1 or len(idxs) < 2:
#             continue
#         y_line = y_[idxs]
#         sigma = float(np.std(y_line - np.median(y_line)))
#         row_sigmas.append(sigma)
#     median_row_sigma = float(np.median(row_sigmas)) if row_sigmas else 0.0
#     line_wobble = (median_row_sigma / max(med_h, 1e-3)) if med_h > 0 else 0.0

#     bad = np.degrees(np.abs(rel_angles)) > 10.0
#     outlier_share = float(np.mean(bad)) if N else 0.0

#     return {
#         "angle_std_deg": float(angle_std_deg),
#         "neighbor_p90_deg": float(neighbor_p90_deg),
#         "line_wobble": float(line_wobble),
#         "outlier_share": float(outlier_share),
#         "global_angle_deg": float(global_angle_deg),
#         "median_word_height_px": float(med_h),
#     }


# def choose_mode_by_metrics(
#     metrics: Dict[str, float],
#     has_fulltext: bool,
#     angle_std_max: float = 8.0,
#     neighbor_p90_max: float = 12.0,
#     line_wobble_max: float = 1.0,
#     outlier_share_max: float = 0.25,
# ) -> str:
#     """Выбор режима на основе метрик."""
#     ok = (
#         metrics["angle_std_deg"] <= angle_std_max and
#         metrics["neighbor_p90_deg"] <= neighbor_p90_max and
#         metrics["line_wobble"] <= line_wobble_max and
#         metrics["outlier_share"] <= outlier_share_max
#     )

#     if ok:
#         return "WORDS"
#     if has_fulltext:
#         return "FULLTEXT"
#     return "ERROR"


# # ---------- Главная функция для backend ----------

# def get_ocr_text(
#     data: bytes,
#     filename: Optional[str] = None,
#     logger: Optional[Any] = None
# ) -> Tuple[Optional[str], Optional[str], Optional[List[Dict[str, Any]]], Optional[str]]:
#     """
#     Главная функция OCR для backend.
#     """
#     if vision is None:
#         err = "google-cloud-vision не установлен. pip install google-cloud-vision"
#         if logger:
#             logger.error(f"[OCR] {err}")
#         return None, None, None, err

#     try:
#         client = vision.ImageAnnotatorClient()
#         image = vision.Image(content=data)
#         resp = client.document_text_detection(image=image)
#     except Exception as e:
#         if logger:
#             logger.error(f"[OCR] Vision API exception for {filename}: {e}")
#         return None, None, None, str(e)

#     if resp.error.message:
#         if logger:
#             logger.error(f"[OCR] Vision API error for {filename}: {resp.error.message}")
#         return None, None, None, resp.error.message

#     pages_out = []
#     words_flat = []

#     for i, page in enumerate(resp.full_text_annotation.pages):
#         page_words = []
#         for block in page.blocks:
#             for paragraph in block.paragraphs:
#                 for w in paragraph.words:
#                     text = "".join(s.text for s in w.symbols).strip()
#                     if not text or not w.bounding_box or len(w.bounding_box.vertices) < 4:
#                         continue
#                     pts = []
#                     for v in w.bounding_box.vertices:
#                         x = v.x if v.x is not None else 0
#                         y = v.y if v.y is not None else 0
#                         pts.append({"x": float(x), "y": float(y)})
#                     if len(pts) < 4:
#                         continue

#                     word_dict = {"text": text, "bbox": pts[:4]}
#                     page_words.append(word_dict)
#                     words_flat.append(word_dict)

#         pages_out.append({
#             "page_number": i + 1,
#             "width_px": page.width,
#             "height_px": page.height,
#             "words": page_words,
#         })

#     full_text = getattr(resp.full_text_annotation, "text", "") or ""
#     has_fulltext = bool(full_text.strip())

#     if not words_flat and not has_fulltext:
#         err = "No words with bbox and no full_text_annotation"
#         if logger:
#             logger.error(f"[OCR] {err} for {filename}")
#         return None, None, None, err

#     if words_flat:
#         metrics = compute_geometry_metrics(words_flat, k_neighbors=6)
#         mode = choose_mode_by_metrics(
#             metrics=metrics,
#             has_fulltext=has_fulltext,
#         )
#     else:
#         metrics = {}
#         mode = "FULLTEXT" if has_fulltext else "ERROR"

#     if logger:
#         logger.info(f"[OCR] {filename}: mode={mode}, metrics={metrics}")

#     if mode == "WORDS":
#         try:
#             joined_text, skew_deg = _join_words_to_lines(
#                 words_flat,
#                 use_skew=True,
#                 line_width_chars=120,  # Настраиваемый параметр
#             )
#             plain_text = joined_text
#             metrics["detected_skew_deg"] = float(skew_deg)
#         except Exception as e:
#             if logger:
#                 logger.warning(f"[OCR] WORDS mode failed for {filename}, fallback to FULLTEXT: {e}")
#             plain_text = full_text
#             mode = "FULLTEXT"
#     elif mode == "FULLTEXT":
#         plain_text = full_text
#     else:
#         err = "Geometry metrics failed and no full_text_annotation available"
#         if logger:
#             logger.error(f"[OCR] {err} for {filename}")
#         return None, None, None, err

#     result = {
#         "pages": pages_out,
#         "meta": {
#             "mode": mode,
#             "metrics": {k: round(v, 3) for k, v in metrics.items()},
#         }
#     }
#     raw_json = json.dumps(result, ensure_ascii=False, separators=(",", ":"))

#     return raw_json, plain_text, words_flat, None














### OLD VERSION

# #!/usr/bin/env python3
# # -*- coding: utf-8 -*-
# """
# ocr.py — умная склейка OCR с автовыбором режима WORDS vs FULLTEXT

# Возвращаемая функция:
#     get_ocr_text(data: bytes, filename: str, logger) ->
#         (raw_json: str, plain_text: str, words_flat: list[dict], error: str|None)

# - Без Tesseract. Используется только Google Vision.
# - raw_json включает: pages с words и bbox + метаинформация о режиме и метриках
# - plain_text: либо склейка по словам (WORDS), либо full_text_annotation (FULLTEXT)
# - Критерии выбора режима (можно настроить):
#     angle_std_deg ≤ 8°
#     neighbor_p90_deg ≤ 12°
#     line_wobble ≤ 1.0
#     outlier_share ≤ 0.25

# Аутентификация Vision:
#   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
# """
# from __future__ import annotations

# import json
# import math
# from statistics import median
# from typing import List, Dict, Any, Optional, Tuple

# import numpy as np

# try:
#     from google.cloud import vision
# except Exception:
#     vision = None

# from sklearn.cluster import DBSCAN
# import logging
# logger = logging.getLogger("docscanner_app")

# # ---------- Константы для склейки по словам ----------

# PUNCT_FOLLOW = set(".,:;%)!?»")
# PUNCT_PRECEDE = set("([«")


# # ---------- Вспомогательные утилиты (из старого кода) ----------

# def _edges(b):
#     """Центры рёбер bbox: x_left, x_right, y_top, y_bottom"""
#     tl, tr, br, bl = b
#     x_left = (tl["x"] + bl["x"]) / 2.0
#     x_right = (tr["x"] + br["x"]) / 2.0
#     y_top = (tl["y"] + tr["y"]) / 2.0
#     y_bot = (bl["y"] + br["y"]) / 2.0
#     return x_left, x_right, y_top, y_bot


# def _angle_deg_of_box(b):
#     """Угол наклона верхнего ребра bbox (в градусах)"""
#     tl, tr, *_ = b
#     dx = tr["x"] - tl["x"]
#     dy = tr["y"] - tl["y"]
#     if dx == 0:
#         return 0.0
#     return math.degrees(math.atan2(dy, dx))


# def _estimate_skew_deg(items, min_width_px=200):
#     """Оценка наклона страницы по широким словам"""
#     angles = []
#     for it in items:
#         x_l, x_r, y_t, y_b = _edges(it["bbox"])
#         if (x_r - x_l) >= min_width_px:
#             angles.append(_angle_deg_of_box(it["bbox"]))
#     return median(angles) if angles else 0.0


# def _correct_y_for_skew(y, x, skew_deg):
#     """Коррекция Y-координаты с учётом наклона: y' = y - x * tan(theta)"""
#     return y - x * math.tan(math.radians(skew_deg))


# def _is_alpha_token(t: str) -> bool:
#     """Содержит ли токен хотя бы одну букву"""
#     return any(ch.isalpha() for ch in t)



# def _join_words_to_lines(words_data, y_tol=None, use_skew=True,
#                          gap_scale=(0.4, 1.2, 3.0),
#                          hard_space_px=(15, 50, 150)):
#     """
#     Собирает построчный текст из слов с умными пробелами.
    
#     Вход: words_data = [{"text": str, "bbox": [{x,y}*4]}, ...]
#     Возвращает: (joined_text: str, detected_skew_deg: float)
#     """
#     if not words_data:
#         return "", 0.0

#     # 1) Оценка высоты слов и наклона
#     heights = []
#     for w in words_data:
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         heights.append(max(1.0, y_b - y_t))
#     h_med = median(heights) if heights else 20.0

#     skew_deg = _estimate_skew_deg(words_data) if use_skew else 0.0

#     # 2) Подготовка элементов с коррекцией Y
#     items = []
#     for w in words_data:
#         txt = (w.get("text") or "").strip()
#         if not txt:
#             continue
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         if use_skew and abs(skew_deg) > 0.05:
#             y_t = _correct_y_for_skew(y_t, x_l, skew_deg)
#             y_b = _correct_y_for_skew(y_b, x_l, skew_deg)
#         y_c = (y_t + y_b) / 2.0
#         items.append({
#             "text": txt,
#             "x_l": x_l, "x_r": x_r,
#             "y_t": y_t, "y_b": y_b, "y_c": y_c,
#         })

#     if not items:
#         return "", skew_deg

#     # 3) Порог по вертикали для группировки в строки
#     if y_tol is None:
#         y_tol_px = max(10.0, min(40.0, 0.7 * h_med))
#     else:
#         y_tol_px = y_tol

#     # 4) Группировка по Y в строки
#     items.sort(key=lambda t: (t["y_c"], t["x_l"]))
#     lines = []
#     current = []
#     current_y = None
#     for it in items:
#         if current_y is None or abs(it["y_c"] - current_y) <= y_tol_px:
#             current.append(it)
#             current_y = it["y_c"] if current_y is None else (current_y * 0.7 + it["y_c"] * 0.3)
#         else:
#             lines.append(current)
#             current = [it]
#             current_y = it["y_c"]
#     if current:
#         lines.append(current)

#     # 5) Склейка внутри строки по X с умными пробелами
#     all_lines = []
#     for row in lines:
#         row.sort(key=lambda t: t["x_l"])
#         gaps = [max(0.0, b["x_l"] - a["x_r"]) for a, b in zip(row, row[1:])]
#         gaps_pos = [g for g in gaps if g > 0]
#         g_med = median(gaps_pos) if gaps_pos else None

#         pieces = [row[0]["text"]]
#         for (a, b, g) in zip(row, row[1:], gaps):
#             # Определяем количество пробелов по gap
#             if g_med and g_med > 0:
#                 if g < gap_scale[0] * g_med:
#                     sp = ""
#                 elif g < gap_scale[1] * g_med:
#                     sp = " "
#                 elif g < gap_scale[2] * g_med:
#                     sp = "  "
#                 else:
#                     sp = "   "
#             else:
#                 if g < hard_space_px[0]:
#                     sp = ""
#                 elif g < hard_space_px[1]:
#                     sp = " "
#                 elif g < hard_space_px[2]:
#                     sp = "  "
#                 else:
#                     sp = "   "

#             # Пунктуация: убираем пробел
#             if b["text"] and b["text"][0] in PUNCT_FOLLOW:
#                 sp = ""
#             if pieces[-1] and pieces[-1][-1] in PUNCT_PRECEDE:
#                 sp = ""

#             # Фикс слипшихся букв (например ZapaLTUAB)
#             if _is_alpha_token(a["text"]) and _is_alpha_token(b["text"]):
#                 if not (a["text"].endswith("-") or b["text"].startswith("-")):
#                     if sp == "":
#                         sp = " "

#             pieces.append(sp + b["text"])

#         # Нормализация пробелов и пунктуации
#         line = "".join(pieces)
#         line = (line
#                 .replace(" .", ".")
#                 .replace(" ,", ",")
#                 .replace(" :", ":")
#                 .replace("( ", "(")
#                 .replace(" )", ")")
#                 .replace(" - ", "-"))
#         all_lines.append(line)

#     return "\n".join(all_lines), skew_deg


# # ---------- Метрики для выбора режима ----------

# def normalize_angle(a: float) -> float:
#     """Нормализация угла в диапазон [-π, π]"""
#     a = math.fmod(a, 2 * math.pi)
#     if a <= -math.pi:
#         a += 2 * math.pi
#     elif a > math.pi:
#         a -= 2 * math.pi
#     return a


# def _median_word_height(words_data) -> float:
#     """Медианная высота слов"""
#     heights = []
#     for w in words_data:
#         x_l, x_r, y_t, y_b = _edges(w["bbox"])
#         heights.append(max(1.0, y_b - y_t))
#     return float(median(heights)) if heights else 0.0


# def compute_geometry_metrics(words_data, k_neighbors: int = 6) -> Dict[str, float]:
#     """
#     Вычисление метрик геометрии для оценки "помятости" документа:
#     - angle_std_deg: стандартное отклонение углов слов от глобального
#     - neighbor_p90_deg: 90-й перцентиль разницы углов между соседями по строке
#     - line_wobble: относительное стандартное отклонение Y внутри строк
#     - outlier_share: доля слов с углом отклонения >10°
#     """
#     if not words_data:
#         return {
#             "angle_std_deg": 0.0,
#             "neighbor_p90_deg": 0.0,
#             "line_wobble": 0.0,
#             "outlier_share": 0.0,
#             "global_angle_deg": 0.0,
#             "median_word_height_px": 0.0,
#         }

#     # Углы всех слов
#     word_angles = []
#     for w in words_data:
#         bbox = w["bbox"]
#         tl, tr = bbox[0], bbox[1]
#         dx = tr["x"] - tl["x"]
#         dy = tr["y"] - tl["y"]
#         angle = math.atan2(dy, dx) if dx != 0 else 0.0
#         word_angles.append(normalize_angle(angle))
#     word_angles = np.array(word_angles, dtype=float)

#     # Глобальный угол (медиана)
#     ang_wrapped = ((word_angles + math.pi/2) % math.pi) - math.pi/2
#     global_angle = float(np.median(ang_wrapped))
#     global_angle_deg = float(np.degrees(global_angle))

#     # Относительные углы (отклонения от глобального)
#     rel_angles = np.vectorize(lambda a: normalize_angle(a - global_angle))(word_angles)
#     angle_std_deg = float(np.degrees(np.std(rel_angles)))

#     # Центры слов
#     centers = []
#     for w in words_data:
#         bbox = w["bbox"]
#         cx = sum(p["x"] for p in bbox) / 4.0
#         cy = sum(p["y"] for p in bbox) / 4.0
#         centers.append([cx, cy])
#     centers = np.array(centers, dtype=float)

#     # Поворот в выровненную систему координат
#     c, s = math.cos(-global_angle), math.sin(-global_angle)
#     R = np.array([[c, -s], [s, c]], dtype=float)
#     centers_rot = centers @ R.T
#     y_ = centers_rot[:, 1]
#     x_ = centers_rot[:, 0]

#     # Медианная высота слов
#     med_h = _median_word_height(words_data)
#     y_band = 0.7 * max(med_h, 1.0)

#     # Разница углов с соседями по строке
#     diffs = []
#     N = len(words_data)
#     for i in range(N):
#         dy = np.abs(y_ - y_[i])
#         mask = (dy <= y_band)
#         if np.count_nonzero(mask) <= 1:
#             continue
#         cand_idx = np.where(mask)[0]
#         cand_idx = cand_idx[cand_idx != i]
#         order = np.argsort(np.abs(x_[cand_idx] - x_[i]))
#         take = cand_idx[order[:k_neighbors]]
#         for j in take:
#             dtheta = abs(np.degrees(normalize_angle(word_angles[i] - word_angles[j])))
#             if dtheta > 90.0:
#                 dtheta = 180.0 - dtheta
#             diffs.append(dtheta)
#     neighbor_p90_deg = float(np.percentile(diffs, 90)) if diffs else 0.0

#     # Кластеризация строк по Y
#     if N >= 2:
#         db = DBSCAN(eps=0.7 * max(med_h, 1.0), min_samples=2, metric="euclidean").fit(y_.reshape(-1, 1))
#         labels = db.labels_
#     else:
#         labels = np.array([-1])

#     # Wobble: отклонение Y внутри строк
#     row_sigmas = []
#     for lab in sorted(set(labels)):
#         idxs = np.where(labels == lab)[0]
#         if lab == -1 or len(idxs) < 2:
#             continue
#         y_line = y_[idxs]
#         sigma = float(np.std(y_line - np.median(y_line)))
#         row_sigmas.append(sigma)
#     median_row_sigma = float(np.median(row_sigmas)) if row_sigmas else 0.0
#     line_wobble = (median_row_sigma / max(med_h, 1e-3)) if med_h > 0 else 0.0

#     # Доля outliers (слова с углом >10°)
#     bad = np.degrees(np.abs(rel_angles)) > 10.0
#     outlier_share = float(np.mean(bad)) if N else 0.0

#     return {
#         "angle_std_deg": float(angle_std_deg),
#         "neighbor_p90_deg": float(neighbor_p90_deg),
#         "line_wobble": float(line_wobble),
#         "outlier_share": float(outlier_share),
#         "global_angle_deg": float(global_angle_deg),
#         "median_word_height_px": float(med_h),
#     }


# def choose_mode_by_metrics(
#     metrics: Dict[str, float],
#     has_fulltext: bool,
#     angle_std_max: float = 8.0,
#     neighbor_p90_max: float = 12.0,
#     line_wobble_max: float = 1.0,
#     outlier_share_max: float = 0.25,
# ) -> str:
#     """
#     Выбор режима на основе метрик:
#     - WORDS: если все критерии в норме → склейка по словам
#     - FULLTEXT: если критерии не прошли, но есть full_text_annotation
#     - ERROR: если нет ни слов, ни full_text
#     """
#     ok = (
#         metrics["angle_std_deg"] <= angle_std_max and
#         metrics["neighbor_p90_deg"] <= neighbor_p90_max and
#         metrics["line_wobble"] <= line_wobble_max and
#         metrics["outlier_share"] <= outlier_share_max
#     )
    
#     if ok:
#         return "WORDS"
#     if has_fulltext:
#         return "FULLTEXT"
#     return "ERROR"


# # ---------- Главная функция для backend ----------

# def get_ocr_text(
#     data: bytes,
#     filename: Optional[str] = None,
#     logger: Optional[Any] = None
# ) -> Tuple[Optional[str], Optional[str], Optional[List[Dict[str, Any]]], Optional[str]]:
#     """
#     Главная функция OCR для backend.
    
#     Вход:
#         data: bytes — сырые байты изображения (PNG/JPG/PDF-страница)
#         filename: str — имя файла (для логов)
#         logger — логгер
    
#     Возвращает:
#         raw_json: str — JSON с pages, words, bbox + метаинформация
#                        {"pages": [...], "meta": {"mode": "WORDS"|"FULLTEXT", "metrics": {...}}}
#         plain_text: str — текст (склейка по словам или full_text_annotation)
#         words_flat: list — список слов {"text": str, "bbox": [{x,y}*4]}
#         error: str | None
#     """
#     if vision is None:
#         err = "google-cloud-vision не установлен. pip install google-cloud-vision"
#         if logger:
#             logger.error(f"[OCR] {err}")
#         return None, None, None, err

#     try:
#         # Вызов Google Vision API
#         client = vision.ImageAnnotatorClient()
#         image = vision.Image(content=data)
#         resp = client.document_text_detection(image=image)
#     except Exception as e:
#         if logger:
#             logger.error(f"[OCR] Vision API exception for {filename}: {e}")
#         return None, None, None, str(e)

#     if resp.error.message:
#         if logger:
#             logger.error(f"[OCR] Vision API error for {filename}: {resp.error.message}")
#         return None, None, None, resp.error.message

#     # Извлечение слов с bbox
#     pages_out = []
#     words_flat = []
    
#     for i, page in enumerate(resp.full_text_annotation.pages):
#         page_words = []
#         for block in page.blocks:
#             for paragraph in block.paragraphs:
#                 for w in paragraph.words:
#                     text = "".join(s.text for s in w.symbols).strip()
#                     if not text or not w.bounding_box or len(w.bounding_box.vertices) < 4:
#                         continue
#                     pts = []
#                     for v in w.bounding_box.vertices:
#                         x = v.x if v.x is not None else 0
#                         y = v.y if v.y is not None else 0
#                         pts.append({"x": float(x), "y": float(y)})
#                     if len(pts) < 4:
#                         continue
                    
#                     word_dict = {"text": text, "bbox": pts[:4]}
#                     page_words.append(word_dict)
#                     words_flat.append(word_dict)

#         pages_out.append({
#             "page_number": i + 1,
#             "width_px": page.width,
#             "height_px": page.height,
#             "words": page_words,
#         })

#     # Извлечение full_text_annotation
#     full_text = getattr(resp.full_text_annotation, "text", "") or ""
#     has_fulltext = bool(full_text.strip())

#     # Если нет слов и нет full_text → ошибка
#     if not words_flat and not has_fulltext:
#         err = "No words with bbox and no full_text_annotation"
#         if logger:
#             logger.error(f"[OCR] {err} for {filename}")
#         return None, None, None, err

#     # Вычисление метрик геометрии
#     if words_flat:
#         metrics = compute_geometry_metrics(words_flat, k_neighbors=6)
#         mode = choose_mode_by_metrics(
#             metrics=metrics,
#             has_fulltext=has_fulltext,
#             angle_std_max=8.0,
#             neighbor_p90_max=12.0,
#             line_wobble_max=1.0,
#             outlier_share_max=0.25,
#         )
#     else:
#         metrics = {}
#         mode = "FULLTEXT" if has_fulltext else "ERROR"

#     if logger:
#         logger.info(f"[OCR] {filename}: mode={mode}, metrics={metrics}")

#     # Выбор текста в зависимости от режима
#     if mode == "WORDS":
#         try:
#             joined_text, skew_deg = _join_words_to_lines(
#                 words_flat,
#                 use_skew=True,
#                 gap_scale=(0.4, 1.2, 3.0),
#                 hard_space_px=(15, 50, 150),
#             )
#             # joined_text, skew_deg = _join_words_to_lines(
#             #     words_flat,
#             #     use_proportional_spaces=True,  # НОВЫЙ ПАРАМЕТР
#             #     max_spaces=15                   # НОВЫЙ ПАРАМЕТР
#             # )
#             plain_text = joined_text
#             metrics["detected_skew_deg"] = float(skew_deg)
#         except Exception as e:
#             if logger:
#                 logger.warning(f"[OCR] WORDS mode failed for {filename}, fallback to FULLTEXT: {e}")
#             plain_text = full_text
#             mode = "FULLTEXT"
#     elif mode == "FULLTEXT":
#         plain_text = full_text
#     else:  # ERROR
#         err = "Geometry metrics failed and no full_text_annotation available"
#         if logger:
#             logger.error(f"[OCR] {err} for {filename}")
#         return None, None, None, err

#     # Формирование итогового JSON с метаинформацией
#     result = {
#         "pages": pages_out,
#         "meta": {
#             "mode": mode,
#             "metrics": {k: round(v, 3) for k, v in metrics.items()},
#         }
#     }
#     raw_json = json.dumps(result, ensure_ascii=False, separators=(",", ":"))

#     return raw_json, plain_text, words_flat, None

