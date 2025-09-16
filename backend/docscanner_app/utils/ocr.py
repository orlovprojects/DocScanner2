import json
import math
from statistics import median
from google.cloud import vision

# --- вспомогательные утилиты -----------------------------------------------

PUNCT_FOLLOW = set(".,:;%)!?»")
PUNCT_PRECEDE = set("([«")

def _edges(b):
    # TL, TR, BR, BL
    tl, tr, br, bl = b
    x_left  = (tl["x"] + bl["x"]) / 2.0
    x_right = (tr["x"] + br["x"]) / 2.0
    y_top   = (tl["y"] + tr["y"]) / 2.0
    y_bot   = (bl["y"] + br["y"]) / 2.0
    return x_left, x_right, y_top, y_bot

def _angle_deg_of_box(b):
    tl, tr, *_ = b
    dx = tr["x"] - tl["x"]
    dy = tr["y"] - tl["y"]
    if dx == 0:
        return 0.0
    return math.degrees(math.atan2(dy, dx))

def _estimate_skew_deg(items, min_width_px=200):
    """Оценка наклона по широким словам"""
    angles = []
    for it in items:
        x_l, x_r, y_t, y_b = _edges(it["bbox"])
        if (x_r - x_l) >= min_width_px:
            angles.append(_angle_deg_of_box(it["bbox"]))
    return median(angles) if angles else 0.0

def _correct_y_for_skew(y, x, skew_deg):
    # y' = y - x * tan(theta)
    return y - x * math.tan(math.radians(skew_deg))

def _join_words_to_lines(doc_json, y_tol=None, use_skew=True,
                         gap_scale=(0.4, 1.2, 3.0),
                         hard_space_px=(15, 50, 150)):
    """
    Собирает построчный текст из слов.
    Возвращает (joined_text, detected_skew_deg)
    """
    pages = doc_json.get("pages", [])
    all_lines = []
    detected_skew = 0.0

    def _is_alpha_token(t: str) -> bool:
        return any(ch.isalpha() for ch in t)

    for page in pages:
        words = page.get("words", [])
        if not words:
            continue

        # 1) оценим высоту и наклон
        heights = []
        for w in words:
            x_l, x_r, y_t, y_b = _edges(w["bbox"])
            heights.append(max(1.0, y_b - y_t))
        h_med = median(heights) if heights else 20.0

        skew_deg = _estimate_skew_deg(words) if use_skew else 0.0
        detected_skew = skew_deg

        # 2) подготовим элементы (с коррекцией y)
        items = []
        for w in words:
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
            continue

        # 3) порог по вертикали
        if y_tol is None:
            y_tol_px = max(10.0, min(40.0, 0.7 * h_med))
        else:
            y_tol_px = y_tol

        # 4) группировка по Y в строки
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

        # 5) склейка внутри строки по X с «умными» пробелами
        for row in lines:
            row.sort(key=lambda t: t["x_l"])
            gaps = [max(0.0, b["x_l"] - a["x_r"]) for a, b in zip(row, row[1:])]
            gaps_pos = [g for g in gaps if g > 0]
            g_med = median(gaps_pos) if gaps_pos else None

            pieces = [row[0]["text"]]
            for (a, b, g) in zip(row, row[1:], gaps):
                # относительные или пиксельные пороги
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

                # пунктуация
                if b["text"] and b["text"][0] in PUNCT_FOLLOW:
                    sp = ""
                if pieces[-1] and pieces[-1][-1] in PUNCT_PRECEDE:
                    sp = ""

                # --- фикс: буквы без пробела (например ZapaLTUAB) ---
                if _is_alpha_token(a["text"]) and _is_alpha_token(b["text"]):
                    if not (a["text"].endswith("-") or b["text"].startswith("-")):
                        if sp == "":
                            sp = " "

                pieces.append(sp + b["text"])

            # нормализация пробелов и пунктуации
            line = "".join(pieces)
            line = (line
                    .replace(" .", ".")
                    .replace(" ,", ",")
                    .replace(" :", ":")
                    .replace("( ", "(")
                    .replace(" )", ")")
                    .replace(" - ", "-"))
            all_lines.append(line)

    return "\n".join(all_lines), detected_skew

# --- основная функция OCR ---------------------------------------------------

def get_ocr_text(data, filename, logger):
    """
    Возвращает:
      raw_json   : str — компактный JSON со СЛОВАМИ и bbox:
                   {"pages":[{"page_number","width_px","height_px",
                              "words":[{"text","bbox":[{x,y}*4]}, ...]}, ...]}
      plain_text : str — склеенный построчный текст (из слов)
      words_flat : list — список слов с bbox (Python-структура)
      error      : str | None
    """
    try:
        client = vision.ImageAnnotatorClient()
        img = vision.Image(content=data)
        resp = client.document_text_detection(image=img)
    except Exception as e:
        if logger:
            logger.error(f"OCR exception for {filename}: {e}")
        return None, None, None, str(e)

    if resp.error.message:
        if logger:
            logger.error(f"OCR error for {filename}: {resp.error.message}")
        return None, None, None, resp.error.message

    pages_out = []
    words_flat = []

    # Собираем СЛОВА с bbox (можно добавить confidence/locale при необходимости)
    for i, page in enumerate(resp.full_text_annotation.pages):
        page_words = []
        for block in page.blocks:
            for paragraph in block.paragraphs:
                for w in paragraph.words:
                    text = "".join(s.text for s in w.symbols).strip()
                    if not text:
                        continue
                    bbox = [{"x": v.x or 0, "y": v.y or 0} for v in w.bounding_box.vertices]
                    item = {"text": text, "bbox": bbox}
                    page_words.append(item)
                    words_flat.append(item)

        pages_out.append({
            "page_number": i + 1,
            "width_px": page.width,
            "height_px": page.height,
            "words": page_words,
        })

    compact_json = {"pages": pages_out}

    # Склейка в строки (joined) с учётом наклона и «умных» пробелов
    joined_text, skew_deg = _join_words_to_lines(compact_json)

    raw_json = json.dumps(compact_json, ensure_ascii=False)

    return raw_json, joined_text, words_flat, None








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
