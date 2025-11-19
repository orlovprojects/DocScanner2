#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Простой тест PaddleOCR для латинских языков (lt + en и вообще вся латиница).

Запуск:
    python paddle_ocr_text.py path/to/image.png

Вывод:
    - для каждой найденной строки: текст + bbox (4 точки)
    - в конце простой plain_text (все строки подряд)
"""

import sys
import json
from typing import List, Dict, Any, Tuple

import numpy as np
from PIL import Image
from paddleocr import PaddleOCR


def run_paddle_ocr_latin(image_path: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Запускает PaddleOCR на картинке, возвращает:
        plain_text: str
        words_flat: list[{"text": str, "bbox": [{"x": float, "y": float} * 4]}]

    Здесь "слова" на самом деле строки (line-level),
    т.к. PaddleOCR по умолчанию даёт строки.
    """

    ocr = PaddleOCR(
        lang="lt",
        use_textline_orientation=True,
    )

    # Читаем картинку
    img = Image.open(image_path)
    img_np = np.array(img)

    # Запуск OCR через predict()
    result = ocr.predict(img_np)

    words_flat: List[Dict[str, Any]] = []
    lines_out = []

    # result это список OCRResult объектов
    if isinstance(result, list):
        for page in result:
            # У каждого page есть атрибуты или dict-like доступ
            if hasattr(page, 'dt_polys'):
                dt_polys = page.dt_polys
                rec_texts = page.rec_texts
                rec_scores = page.rec_scores
            elif isinstance(page, dict):
                dt_polys = page.get("dt_polys", [])
                rec_texts = page.get("rec_texts", [])
                rec_scores = page.get("rec_scores", [])
            else:
                continue
            
            # Обрабатываем каждую распознанную строку
            for box, text, score in zip(dt_polys, rec_texts, rec_scores):
                text = (text or "").strip()
                if not text:
                    continue

                pts = []
                for x, y in box:
                    pts.append({"x": float(x), "y": float(y)})

                if len(pts) < 4:
                    continue

                words_flat.append({
                    "text": text,
                    "bbox": pts[:4],
                    "score": float(score),
                })
                lines_out.append(text)
    
    elif isinstance(result, dict):
        # Если вдруг вернулся один dict (одна страница)
        dt_polys = result.get("dt_polys", [])
        rec_texts = result.get("rec_texts", [])
        rec_scores = result.get("rec_scores", [])
        
        for box, text, score in zip(dt_polys, rec_texts, rec_scores):
            text = (text or "").strip()
            if not text:
                continue

            pts = []
            for x, y in box:
                pts.append({"x": float(x), "y": float(y)})

            if len(pts) < 4:
                continue

            words_flat.append({
                "text": text,
                "bbox": pts[:4],
                "score": float(score),
            })
            lines_out.append(text)

    plain_text = "\n".join(lines_out)
    return plain_text, words_flat


def main():
    if len(sys.argv) < 2:
        print("Usage: python paddle_ocr_text.py path/to/image.png")
        sys.exit(1)

    image_path = sys.argv[1]
    plain_text, words_flat = run_paddle_ocr_latin(image_path)

    print("=== PLAIN TEXT ===")
    print(plain_text)
    print()

    print("=== WORDS WITH BBOX ===")
    for w in words_flat:
        print(json.dumps(w, ensure_ascii=False))

    out_json = {
        "plain_text": plain_text,
        "items": words_flat,
    }
    with open("paddle_ocr_output.json", "w", encoding="utf-8") as f:
        json.dump(out_json, f, ensure_ascii=False, indent=2)
    print("\nSaved to paddle_ocr_output.json")


if __name__ == "__main__":
    main()