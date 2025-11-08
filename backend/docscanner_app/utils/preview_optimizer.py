# utils/preview_optimizer.py
"""
Оптимизация preview изображений для быстрой загрузки.
Агрессивное сжатие до ~100KB с сохранением читаемости.
"""

import io
import os
import logging
from PIL import Image, ImageOps
from typing import Tuple

logger = logging.getLogger('docscanner_app.preview_optimizer')

# ============ НАСТРОЙКИ ============
PREVIEW_MAX_WIDTH = 1200      # максимальная ширина для preview
PREVIEW_MAX_HEIGHT = 1600     # максимальная высота для preview
PREVIEW_TARGET_SIZE = 100_000 # целевой размер ~100KB
PREVIEW_MAX_SIZE = 150_000    # абсолютный максимум 150KB
PREVIEW_MIN_QUALITY = 40      # минимальное качество JPEG
PREVIEW_START_QUALITY = 75    # начальное качество
# ===================================


def optimize_preview_image(
    input_path: str,
    output_path: str = None,
    target_size: int = PREVIEW_TARGET_SIZE,
    max_size: int = PREVIEW_MAX_SIZE
) -> Tuple[str, int, int]:
    """
    Агрессивно сжимает изображение для preview.
    
    Args:
        input_path: путь к исходному файлу
        output_path: путь для сохранения (если None - перезаписывает исходный)
        target_size: целевой размер в байтах (~100KB)
        max_size: максимальный размер в байтах (150KB)
    
    Returns:
        (output_path, final_size_bytes, quality_used)
    
    Стратегия:
    1. Уменьшить разрешение (1200x1600 макс)
    2. Конвертировать в JPEG с прогрессивным качеством
    3. Итеративно снижать качество до достижения target_size
    4. Если не помогло - ещё уменьшить разрешение
    """
    
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")
    
    output_path = output_path or input_path
    original_size = os.path.getsize(input_path)
    
    logger.info(f"[PREVIEW] Optimizing: {os.path.basename(input_path)} ({original_size} bytes)")
    
    # Если файл уже маленький - ничего не делаем
    if original_size <= target_size:
        logger.info(f"[PREVIEW] File already small enough: {original_size} bytes")
        if input_path != output_path:
            import shutil
            shutil.copy2(input_path, output_path)
        return output_path, original_size, 100
    
    # Открываем изображение
    try:
        img = Image.open(input_path)
        img = ImageOps.exif_transpose(img)  # исправить ориентацию
    except Exception as e:
        logger.error(f"[PREVIEW] Failed to open image: {e}")
        raise
    
    original_width, original_height = img.size
    logger.info(f"[PREVIEW] Original size: {original_width}x{original_height}")
    
    # ============================================================
    # ШАГ 1: Уменьшить разрешение
    # ============================================================
    
    img_resized = _resize_for_preview(img, PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT)
    new_width, new_height = img_resized.size
    
    if (new_width, new_height) != (original_width, original_height):
        logger.info(f"[PREVIEW] Resized to: {new_width}x{new_height}")
    
    # ============================================================
    # ШАГ 2: Итеративное сжатие JPEG
    # ============================================================
    
    quality = PREVIEW_START_QUALITY
    best_data = None
    best_quality = quality
    
    while quality >= PREVIEW_MIN_QUALITY:
        data = _save_as_jpeg(img_resized, quality)
        size = len(data)
        
        logger.debug(f"[PREVIEW] Quality {quality}: {size} bytes")
        
        # Сохраняем лучший результат
        if size <= max_size:
            best_data = data
            best_quality = quality
            
            # Если достигли целевого размера - отлично!
            if size <= target_size:
                logger.info(f"[PREVIEW] Target achieved! Quality={quality}, Size={size} bytes")
                break
        
        # Понижаем качество
        if size > target_size * 1.5:
            quality -= 15  # большой шаг
        elif size > target_size:
            quality -= 5   # средний шаг
        else:
            break
    
    # Если не получилось достичь target_size - используем лучший результат
    if best_data is None:
        logger.warning(f"[PREVIEW] Could not fit into {max_size} bytes even at min quality")
        best_data = _save_as_jpeg(img_resized, PREVIEW_MIN_QUALITY)
        best_quality = PREVIEW_MIN_QUALITY
    
    current_size = len(best_data)
    
    # ============================================================
    # ШАГ 3: Если всё ещё слишком большой - уменьшить разрешение ещё сильнее
    # ============================================================
    
    if current_size > max_size:
        logger.info(f"[PREVIEW] Still too large ({current_size} bytes), reducing resolution further")
        
        # Уменьшаем до 800x1000
        img_smaller = _resize_for_preview(img, 800, 1000)
        best_data = _save_as_jpeg(img_smaller, PREVIEW_MIN_QUALITY + 10)
        best_quality = PREVIEW_MIN_QUALITY + 10
        current_size = len(best_data)
        
        logger.info(f"[PREVIEW] After aggressive resize: {img_smaller.size}, {current_size} bytes")
    
    # ============================================================
    # ШАГ 4: Сохранить результат
    # ============================================================
    
    with open(output_path, 'wb') as f:
        f.write(best_data)
    
    compression_ratio = (1 - current_size / original_size) * 100
    
    logger.info(
        f"[PREVIEW] Optimized: {original_size} → {current_size} bytes "
        f"({compression_ratio:.1f}% reduction), quality={best_quality}"
    )
    
    return output_path, current_size, best_quality


def _resize_for_preview(img: Image.Image, max_width: int, max_height: int) -> Image.Image:
    """
    Уменьшает изображение с сохранением пропорций.
    """
    width, height = img.size
    
    # Если уже меньше - не трогаем
    if width <= max_width and height <= max_height:
        return img
    
    # Вычисляем scale factor
    width_scale = max_width / width
    height_scale = max_height / height
    scale = min(width_scale, height_scale)
    
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    # Используем LANCZOS для лучшего качества
    return img.resize((new_width, new_height), Image.LANCZOS)


def _save_as_jpeg(img: Image.Image, quality: int) -> bytes:
    """
    Сохраняет изображение в JPEG с заданным качеством.
    """
    buf = io.BytesIO()
    
    # Конвертируем в RGB если нужно
    if img.mode in ('RGBA', 'LA', 'P'):
        # Создаём белый фон
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Сохраняем с оптимизацией и progressive encoding
    img.save(
        buf,
        format='JPEG',
        quality=quality,
        optimize=True,
        progressive=True,  # прогрессивная загрузка
    )
    
    return buf.getvalue()


def optimize_preview_for_document(doc):
    """
    Оптимизирует preview для ScannedDocument после обработки.
    Вызывать в конце tasks.py после всех обработок.
    
    Args:
        doc: ScannedDocument instance
    
    Returns:
        True if optimized, False if skipped
    """
    if not doc.file:
        logger.warning(f"[PREVIEW] Document {doc.id} has no file")
        return False
    
    if not os.path.exists(doc.file.path):
        logger.warning(f"[PREVIEW] File does not exist: {doc.file.path}")
        return False
    
    original_size = os.path.getsize(doc.file.path)
    
    # Если файл уже маленький - пропускаем
    if original_size <= PREVIEW_TARGET_SIZE:
        logger.info(f"[PREVIEW] Document {doc.id} file already small: {original_size} bytes")
        return False
    
    try:
        # Оптимизируем (перезаписываем файл)
        _, final_size, quality = optimize_preview_image(doc.file.path)
        
        logger.info(
            f"[PREVIEW] Document {doc.id} optimized: "
            f"{original_size} → {final_size} bytes (quality={quality})"
        )
        
        return True
        
    except Exception as e:
        logger.error(f"[PREVIEW] Failed to optimize document {doc.id}: {e}")
        return False


# ============================================================================
# BATCH оптимизация (для существующих документов)
# ============================================================================

def optimize_all_previews_batch(user=None, limit=None):
    """
    Оптимизирует preview для всех существующих документов.
    Можно запустить через management command.
    
    Args:
        user: фильтр по пользователю (если None - все)
        limit: максимальное количество документов
    """
    from docscanner_app.models import ScannedDocument
    
    qs = ScannedDocument.objects.filter(status='completed')
    
    if user:
        qs = qs.filter(user=user)
    
    if limit:
        qs = qs[:limit]
    
    total = qs.count()
    logger.info(f"[PREVIEW BATCH] Starting optimization for {total} documents")
    
    optimized = 0
    skipped = 0
    errors = 0
    
    for i, doc in enumerate(qs, 1):
        try:
            logger.info(f"[PREVIEW BATCH] Processing {i}/{total}: doc_id={doc.id}")
            
            if optimize_preview_for_document(doc):
                optimized += 1
            else:
                skipped += 1
                
        except Exception as e:
            logger.error(f"[PREVIEW BATCH] Error processing doc_id={doc.id}: {e}")
            errors += 1
    
    logger.info(
        f"[PREVIEW BATCH] Complete: "
        f"optimized={optimized}, skipped={skipped}, errors={errors}"
    )
    
    return {
        'total': total,
        'optimized': optimized,
        'skipped': skipped,
        'errors': errors,
    }