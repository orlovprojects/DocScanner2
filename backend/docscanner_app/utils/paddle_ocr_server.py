#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PaddleOCR с PP-OCRv5_server моделью для лучшего распознавания (в т.ч. литовских букв).
"""

import sys
import json
import time
from typing import List, Dict, Any, Tuple

import numpy as np
from PIL import Image
from paddleocr import PaddleOCR


def run_paddle_ocr_server(image_path: str) -> Tuple[str, List[Dict[str, Any]], float]:
    """
    Запускает PaddleOCR (PP-OCRv5_server) на картинке.
    Возвращает:
      - plain_text
      - words_flat
      - ocr_seconds: время работы OCR (инициализация + predict + разбор результата).
    """

    start_ocr = time.time()

    ocr = PaddleOCR(
        lang="lt",                     # Литовский язык
        use_textline_orientation=True, # Классификация ориентации строк
        ocr_version="PP-OCRv5",        # Версия OCR (по умолчанию server-модели)
        text_det_thresh=0.3,           # Порог пикселей на карте вероятностей
        text_det_box_thresh=0.5,       # Порог уверенности для боксов
    )

    img = Image.open(image_path)
    img_np = np.array(img)
    img_width, img_height = img.size

    print("Запуск OCR с PP-OCRv5_server (это может занять больше времени)...")

    result = ocr.predict(img_np)

    words_flat: List[Dict[str, Any]] = []
    lines_out: List[str] = []

    if isinstance(result, list):
        for page in result:
            if hasattr(page, "dt_polys"):
                dt_polys = page.dt_polys
                rec_texts = page.rec_texts
                rec_scores = page.rec_scores
            elif isinstance(page, dict):
                dt_polys = page.get("dt_polys", [])
                rec_texts = page.get("rec_texts", [])
                rec_scores = page.get("rec_scores", [])
            else:
                continue

            for box, text, score in zip(dt_polys, rec_texts, rec_scores):
                text = (text or "").strip()
                if not text:
                    continue

                pts = [{"x": float(x), "y": float(y)} for x, y in box]
                if len(pts) < 4:
                    continue

                words_flat.append({
                    "text": text,
                    "bbox": pts[:4],
                    "score": float(score),
                })
                lines_out.append(text)

    elif isinstance(result, dict):
        dt_polys = result.get("dt_polys", [])
        rec_texts = result.get("rec_texts", [])
        rec_scores = result.get("rec_scores", [])

        for box, text, score in zip(dt_polys, rec_texts, rec_scores):
            text = (text or "").strip()
            if not text:
                continue

            pts = [{"x": float(x), "y": float(y)} for x, y in box]
            if len(pts) < 4:
                continue

            words_flat.append({
                "text": text,
                "bbox": pts[:4],
                "score": float(score),
            })
            lines_out.append(text)

    plain_text = "\n".join(lines_out)
    ocr_seconds = time.time() - start_ocr
    return plain_text, words_flat, ocr_seconds


def main():
    # ⏱ полное время работы скрипта (с момента начала main)
    start_total = time.time()

    if len(sys.argv) < 2:
        print("Usage: python paddle_ocr_server.py path/to/image.png")
        sys.exit(1)

    image_path = sys.argv[1]

    plain_text, words_flat, ocr_seconds = run_paddle_ocr_server(image_path)

    total_seconds = time.time() - start_total

    print("=== PLAIN TEXT (PP-OCRv5_server) ===")
    print(plain_text)
    print()

    print("=== СТАТИСТИКА ===")
    print(f"Найдено строк: {len(words_flat)}")
    if words_flat:
        avg_score = sum(w["score"] for w in words_flat) / len(words_flat)
        print(f"Средний score: {avg_score:.4f}")
    print(f"Время OCR (инициализация + predict): {ocr_seconds:.3f} сек")
    print(f"Полное время скрипта (main):       {total_seconds:.3f} сек")
    print()

    print("=== TOP 10 СТРОК С НАИМЕНЬШИМ SCORE ===")
    sorted_words = sorted(words_flat, key=lambda x: x["score"])
    for w in sorted_words[:10]:
        print(f"Score: {w['score']:.4f} | Text: {w['text']}")
    print()

    out_json = {
        "plain_text": plain_text,
        "items": words_flat,
        "model": "PP-OCRv5_server",
        "image_size": {
            "width": words_flat and max(pt["x"] for w in words_flat for pt in w["bbox"]) or None,
            "height": words_flat and max(pt["y"] for w in words_flat for pt in w["bbox"]) or None,
        },
        "timing": {
            "ocr_seconds": ocr_seconds,         # время внутри run_paddle_ocr_server
            "total_seconds": total_seconds,     # время main() (почти всё выполнение скрипта)
        },
    }
    with open("paddle_ocr_server_output.json", "w", encoding="utf-8") as f:
        json.dump(out_json, f, ensure_ascii=False, indent=2)
    print("\nSaved to paddle_ocr_server_output.json")


if __name__ == "__main__":
    main()

