# utils/file_converter.py — упрощённая нормализация «только по размеру/длине стороны»
import io
import os
import uuid
import zipfile
import tempfile
import subprocess
import logging
from typing import List, Dict, Optional, Tuple
import base64
import re

from pdf2image import convert_from_bytes
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger("docscanner_app")

# HEIC/HEIF
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pillow_heif = None

# AVIF
try:
    import pillow_avif  # noqa: F401
except Exception:
    pillow_avif = None

# RAR
try:
    import rarfile
    RARFILE_AVAILABLE = True
except ImportError:
    RARFILE_AVAILABLE = False
# Попробуем задать путь к unrar из окружения (например .env -> RARFILE_UNRAR_TOOL)
if RARFILE_AVAILABLE:
    rar_tool = os.environ.get('RARFILE_UNRAR_TOOL') or os.environ.get('UNRAR_TOOL')
    if rar_tool:
        try:
            rarfile.UNRAR_TOOL = rar_tool
            logger.info(f"rarfile: set UNRAR_TOOL = {rar_tool}")
        except Exception:
            logger.debug("Could not set rarfile.UNRAR_TOOL from env")

# 7Z
try:
    import py7zr
    PY7ZR_AVAILABLE = True
except ImportError:
    PY7ZR_AVAILABLE = False

# TAR
import tarfile

logger = logging.getLogger('docscanner_app.file_converter')

# ============ НАСТРОЙКИ (минималистично) ============
PDF_CONVERT_DPI         = 150       # DPI для рендеринга PDF (DPI не трогаем)
PDF_MAX_PAGES           = 5
TIFF_MAX_PAGES          = 5

# ГЛАВНЫЕ КРИТЕРИИ ДЛЯ НОРМАЛИЗАЦИИ
LIMIT_SIDE_PX           = 7000      # даунскейлим, если max(w,h) > 7000
LIMIT_BYTES             = 8 * 1024 * 1024  # даунскейлим, если размер > 8 MB

# Поведение даунскейла
DOWNSCALE_FACTOR        = 0.85      # во сколько раз уменьшаем за 1 шаг, пока не влезет

# Качество/кодеки (без агрессивной перекодировки)
JPG_QUALITY             = 85
PNG_COMPRESS            = 6  # умеренно

# Ограничения на архивы
MAX_ARCHIVE_FILES       = 200
MAX_ARCHIVE_TOTAL_BYTES = 500 * 1024 * 1024  # 500 MB
MAX_SINGLE_FILE_BYTES   = 50 * 1024 * 1024   # 50 MB на 1 файл

# Пути внешних инструментов (подхватываются из Django settings при наличии)
LIBREOFFICE_PATH        = None
POPPLER_PATH            = None
# =====================================================

# Расширения
BROWSER_SAFE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.avif'}
IMG_EXTS = {
    '.png', '.jpg', '.jpeg', '.jpe', '.webp', '.bmp', '.tif', '.tiff',
    '.heic', '.heif', '.hif', '.heifs', '.avif'
}
OFFICE_EXTS = {'.doc', '.docx', '.xls', '.xlsx'}
ARCHIVE_EXTS = {'.zip', '.rar', '.7z', '.tar', '.tgz', '.tar.gz', '.tar.bz2', '.tar.xz', '.tbz2'}
HTML_EXTS = {'.html', '.htm'}

SUPPORTED_ARCHIVES = {'.zip'}
if RARFILE_AVAILABLE:
    SUPPORTED_ARCHIVES.add('.rar')
if PY7ZR_AVAILABLE:
    SUPPORTED_ARCHIVES.add('.7z')
SUPPORTED_ARCHIVES.update({'.tar', '.tgz', '.tar.gz', '.tar.bz2', '.tar.xz', '.tbz2'})

SUPPORTED_EXTS = IMG_EXTS | OFFICE_EXTS| HTML_EXTS | {'.pdf'} | SUPPORTED_ARCHIVES

logger.info(f"Archive support: ZIP=yes, RAR={RARFILE_AVAILABLE}, 7Z={PY7ZR_AVAILABLE}, TAR=yes")

def _ext(name: str) -> str:
    lower = name.lower()
    if lower.endswith('.tar.gz'):
        return '.tar.gz'
    if lower.endswith('.tar.bz2'):
        return '.tar.bz2'
    if lower.endswith('.tar.xz'):
        return '.tar.xz'
    return os.path.splitext(lower)[1]

def _is_supported_format(filename: str) -> bool:
    return _ext(filename) in SUPPORTED_EXTS

def _is_system_file(filename: str) -> bool:
    basename = os.path.basename(filename)
    return (basename.startswith('.') or
            basename.startswith('__MACOSX') or
            basename in {'Thumbs.db', 'desktop.ini', 'DS_Store'})

def _is_safe_path(filepath: str) -> bool:
    if os.path.isabs(filepath):
        logger.warning(f"Absolute path rejected: {filepath}")
        return False
    normalized = os.path.normpath(filepath)
    if normalized.startswith('..') or normalized.startswith('/'):
        logger.warning(f"Path traversal attempt rejected: {filepath}")
        return False
    if _is_system_file(filepath):
        return False
    return True

# ============ Сохранение без агрессивной перекодировки ============

def _save_same_format(img: Image.Image, prefer_ext: str) -> Tuple[bytes, str]:
    """
    Сохраняем по возможности в исходный (или эквивалентный) формат:
    - PNG -> PNG (compress_level умеренный)
    - JPG/JPEG/JPE -> JPEG(quality=85)
    - WEBP -> WEBP(quality=85)
    - AVIF -> AVIF (если плагин есть, иначе PNG)
    - TIFF/HEIC/HEIF/HIF/HEIFS -> PNG (для браузера и универсальности)
    - BMP -> PNG
    """
    e = prefer_ext.lower()
    buf = io.BytesIO()
    # Нормализуем ориентацию
    out = ImageOps.exif_transpose(img)
    if out.mode not in ('RGB', 'L', 'P'):
        out = out.convert('RGB')

    if e in {'.png'}:
        out.save(buf, format='PNG', optimize=True, compress_level=PNG_COMPRESS)
        return buf.getvalue(), '.png'
    if e in {'.jpg', '.jpeg', '.jpe'}:
        out.save(buf, format='JPEG', quality=JPG_QUALITY, optimize=True)
        return buf.getvalue(), '.jpg'
    if e == '.webp':
        out.save(buf, format='WEBP', quality=JPG_QUALITY, method=6)
        return buf.getvalue(), '.webp'
    if e == '.avif':
        if pillow_avif is not None:
            out.save(buf, format='AVIF')
            return buf.getvalue(), '.avif'
        # нет плагина — уходим в PNG
        out.save(buf, format='PNG', optimize=True, compress_level=PNG_COMPRESS)
        return buf.getvalue(), '.png'
    # Всё остальное — в PNG
    out.save(buf, format='PNG', optimize=True, compress_level=PNG_COMPRESS)
    return buf.getvalue(), '.png'

# ============ Даунскейл «пока не влезет» ============

def _downscale_until_fit(img: Image.Image, original_ext: str) -> Tuple[bytes, str]:
    """
    Уменьшаем изображение шагами, пока:
      - max(w,h) <= LIMIT_SIDE_PX
      - и байты <= LIMIT_BYTES
    Формат сохраняем (по правилам _save_same_format), DPI не трогаем.
    """
    img = ImageOps.exif_transpose(img)
    cur = img
    while True:
        data, out_ext = _save_same_format(cur, original_ext)
        w, h = cur.size
        if max(w, h) <= LIMIT_SIDE_PX and len(data) <= LIMIT_BYTES:
            return data, out_ext
        # ещё велик — уменьшаем
        new_w = max(1, int(cur.width * DOWNSCALE_FACTOR))
        new_h = max(1, int(cur.height * DOWNSCALE_FACTOR))
        if new_w == cur.width and new_h == cur.height:
            # на всякий случай жёстко уменьшим на 1px, чтобы не зациклиться
            new_w = max(1, cur.width - 1)
            new_h = max(1, cur.height - 1)
        cur = cur.resize((new_w, new_h), Image.LANCZOS)

# ============ Рендер PDF/TIFF/Office в картинку ============

def _merge_images_vertically(images: List[Image.Image]) -> Image.Image:
    widths  = [im.width for im in images]
    heights = [im.height for im in images]
    max_w   = max(widths)
    total_h = sum(heights)
    merged  = Image.new('RGB', (max_w, total_h), (255, 255, 255))
    y = 0
    for im in images:
        merged.paste(ImageOps.exif_transpose(im).convert('RGB'), (0, y))
        y += im.height
    return merged

def _pdf_to_image(pdf_bytes: bytes, dpi: int = PDF_CONVERT_DPI, max_pages: int = PDF_MAX_PAGES) -> Image.Image:
    pages = convert_from_bytes(pdf_bytes, dpi=dpi, poppler_path=POPPLER_PATH)
    if max_pages and len(pages) > max_pages:
        pages = pages[:max_pages]
    return _merge_images_vertically(pages)

def _tiff_to_image(raw: bytes, max_pages: int = TIFF_MAX_PAGES) -> Image.Image:
    img = Image.open(io.BytesIO(raw))
    frames = []
    try:
        i = 0
        while True:
            img.seek(i)
            frames.append(img.copy())
            i += 1
            if max_pages and i >= max_pages:
                break
    except EOFError:
        pass
    if not frames:
        frames = [img]
    return _merge_images_vertically(frames)

def _office_to_pdf_bytes(src_bytes: bytes, src_name: str, soffice_path: str) -> bytes:
    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, src_name)
        with open(src_path, 'wb') as f:
            f.write(src_bytes)
        cmd = [soffice_path, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', tmpdir, src_path]
        logger.info(f"LibreOffice cmd: {' '.join(cmd)}")
        res = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            raise RuntimeError(f"LibreOffice failed ({res.returncode}): {res.stderr.decode('utf-8', 'ignore')}")
        pdf_name = os.path.splitext(os.path.basename(src_name))[0] + '.pdf'
        pdf_path = os.path.join(tmpdir, pdf_name)
        if not os.path.exists(pdf_path):
            raise RuntimeError("LibreOffice did not produce PDF")
        with open(pdf_path, 'rb') as f:
            return f.read()

# ============ Конверторы конкретных типов ============

def _from_image_bytes(raw: bytes, name: str) -> Dict:
    ext = _ext(name)
    try:
        if ext in {'.tif', '.tiff'}:
            img = _tiff_to_image(raw, max_pages=TIFF_MAX_PAGES)
        else:
            img = Image.open(io.BytesIO(raw))
    except UnidentifiedImageError:
        raise ValueError(f"Unreadable image: {name}")
    data, out_ext = _downscale_until_fit(img, ext)
    return {
        'data': data,
        'filename': f"{uuid.uuid4().hex}{out_ext}",
        'original_filename': name,
    }

def _from_pdf_bytes(raw: bytes, name: str) -> Dict:
    img = _pdf_to_image(raw, dpi=PDF_CONVERT_DPI, max_pages=PDF_MAX_PAGES)
    data, out_ext = _downscale_until_fit(img, '.png')  # «базовый» ext для сохранения
    if out_ext not in {'.png', '.jpg', '.jpeg', '.webp', '.avif'}:
        out_ext = '.png'
    return {
        'data': data,
        'filename': f"{uuid.uuid4().hex}{out_ext}",
        'original_filename': name,
    }

def _from_office_bytes(raw: bytes, name: str, soffice_path: str) -> Dict:
    pdf = _office_to_pdf_bytes(raw, name, soffice_path)
    return _from_pdf_bytes(pdf, name)

# ============ Архивы (поведение как и прежде, без компрессии) ============

def _process_archive_member(fake_upload, fname: str, processed_count: int) -> Optional[Dict]:
    try:
        result = normalize_any(fake_upload)
        logger.debug(f"Successfully processed from archive: {fname}")
        processed_count += 1
        return result
    except Exception as e:
        logger.warning(f"Failed to normalize file from archive {fname}: {e}")
        return None

def _normalize_zip(raw: bytes, name: str) -> List[Dict]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise ValueError(f"Invalid ZIP archive: {name}")

    infos = zf.infolist()
    logger.info(f"ZIP archive {name} contains {len(infos)} entries")
    if len(infos) > MAX_ARCHIVE_FILES:
        logger.warning(f"ZIP contains {len(infos)} files, limiting to {MAX_ARCHIVE_FILES}")
        infos = infos[:MAX_ARCHIVE_FILES]

    total_bytes = 0
    processed_count = 0
    skipped_unsupported = 0
    skipped_system = 0
    results: List[Dict] = []

    for zi in infos:
        if zi.is_dir():
            continue
        fname = zi.filename
        basename = os.path.basename(fname)
        if not _is_safe_path(fname):
            logger.warning(f"Unsafe path in ZIP, skipping: {fname}")
            continue
        if _is_system_file(fname):
            skipped_system += 1
            continue
        if not _is_supported_format(fname):
            skipped_unsupported += 1
            logger.debug(f"Skip unsupported format in ZIP: {fname}")
            continue
        if zi.file_size > MAX_SINGLE_FILE_BYTES:
            logger.warning(f"File too large in ZIP ({zi.file_size} bytes), skipping: {fname}")
            continue
        try:
            with zf.open(zi, 'r') as f:
                chunk = f.read()
        except Exception as e:
            logger.warning(f"Failed to read file from ZIP {fname}: {e}")
            continue
        total_bytes += len(chunk)
        if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
            logger.warning(f"ZIP total bytes exceeded limit; stopping at {processed_count} files")
            break

        fake_upload = type('TmpUpload', (), {
            'name': basename,
            'content_type': '',
            '_data': chunk,
            'read': lambda self: self._data
        })()
        result = _process_archive_member(fake_upload, fname, processed_count)
        if result:
            if isinstance(result, list):
                results.extend(result)
            else:
                results.append(result)
            processed_count += 1

    logger.info(
        f"ZIP {name} processing complete: processed={processed_count}, "
        f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
    )
    if not results:
        raise ValueError(f"No supported files found in ZIP archive: {name}")
    return results

def _normalize_rar(raw: bytes, name: str) -> List[Dict]:
    """
    Robust RAR processing:
      - ensure rarfile is available
      - try to open from bytes with fileobj=io.BytesIO(raw)
      - fallback: write to temp file and open that (more reliable for some backends)
      - read members via rf.open(ri)
    """
    if not RARFILE_AVAILABLE:
        raise ValueError("RAR support not installed. Install: pip install rarfile && apt-get install unrar")

    rf = None
    tmp_path = None
    
    # 1) Попытка открыть из памяти
    try:
        rf = rarfile.RarFile(io.BytesIO(raw))
    except Exception as e_mem:
        logger.debug(f"Opening RAR from memory failed: {e_mem!r}; will try temporary file fallback.")
        # 2) Fallback — сохраняем во временный файл
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.rar') as tmp:
                tmp.write(raw)
                tmp_path = tmp.name
            rf = rarfile.RarFile(tmp_path)
        except Exception as e_file:
            logger.warning(f"Opening RAR from temp file also failed: {e_file!r}")
            # Удаляем временный файл в случае ошибки
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
            raise ValueError(
                f"Invalid RAR archive or missing backend (unrar/unar). Archive: {name}"
            ) from e_file

    try:
        # Теперь rf должен быть открыт
        infos = rf.infolist()
        logger.info(f"RAR archive {name} contains {len(infos)} entries")
        if len(infos) > MAX_ARCHIVE_FILES:
            logger.warning(f"RAR contains {len(infos)} files, limiting to {MAX_ARCHIVE_FILES}")
            infos = infos[:MAX_ARCHIVE_FILES]

        total_bytes = 0
        processed_count = 0
        skipped_unsupported = 0
        skipped_system = 0
        results: List[Dict] = []

        for ri in infos:
            # безопасная проверка директории
            try:
                is_dir = ri.isdir() if hasattr(ri, 'isdir') else False
            except Exception:
                logger.debug(f"Can't determine isdir for RAR entry: {getattr(ri, 'filename', repr(ri))}, skipping")
                continue
            if is_dir:
                continue

            fname = getattr(ri, 'filename', None) or getattr(ri, 'name', None)
            if not fname:
                logger.debug("RAR entry without filename, skipping")
                continue
            basename = os.path.basename(fname)

            if not _is_safe_path(fname):
                logger.warning(f"Unsafe path in RAR, skipping: {fname}")
                continue
            if _is_system_file(fname):
                skipped_system += 1
                continue
            if not _is_supported_format(fname):
                skipped_unsupported += 1
                logger.debug(f"Skip unsupported format in RAR: {fname}")
                continue

            size = getattr(ri, 'file_size', getattr(ri, 'size', None)) or 0
            if size and size > MAX_SINGLE_FILE_BYTES:
                logger.warning(f"File too large in RAR ({size} bytes), skipping: {fname}")
                continue

            try:
                # Используем rf.open(ri) — обычно надёжнее
                with rf.open(ri) as f:
                    chunk = f.read()
            except Exception as e:
                logger.warning(f"Failed to read from RAR {fname}: {e}")
                continue

            if len(chunk) > MAX_SINGLE_FILE_BYTES:
                logger.warning(f"File too large in RAR ({len(chunk)} bytes), skipping: {fname}")
                continue

            total_bytes += len(chunk)
            if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
                logger.warning("RAR total bytes exceeded limit; stopping")
                break

            fake_upload = type('TmpUpload', (), {
                'name': basename,
                'content_type': '',
                '_data': chunk,
                'read': lambda self: self._data
            })()
            result = _process_archive_member(fake_upload, fname, processed_count)
            if result:
                if isinstance(result, list):
                    results.extend(result)
                else:
                    results.append(result)
                processed_count += 1

        logger.info(
            f"RAR {name} processing complete: processed={processed_count}, "
            f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
        )
        
        if not results:
            raise ValueError(f"No supported files found in RAR archive: {name}")
        
        return results
        
    finally:
        # Закрываем архив и удаляем временный файл
        try:
            if rf:
                rf.close()
        except Exception:
            pass
        
        # Удаляем временный файл только после завершения работы с ним
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
                logger.debug(f"Cleaned up temporary RAR file: {tmp_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup temporary RAR file {tmp_path}: {e}")


                

def _normalize_7z(raw: bytes, name: str) -> List[Dict]:
    if not PY7ZR_AVAILABLE:
        raise ValueError("7Z support not installed. Install: pip install py7zr")
    try:
        with py7zr.SevenZipFile(io.BytesIO(raw), mode='r') as sz:
            all_files = sz.getnames()
    except py7zr.Bad7zFile:
        raise ValueError(f"Invalid 7Z archive: {name}")

    logger.info(f"7Z archive {name} contains {len(all_files)} entries")
    if len(all_files) > MAX_ARCHIVE_FILES:
        logger.warning(f"7Z contains {len(all_files)} files, limiting to {MAX_ARCHIVE_FILES}")
        all_files = all_files[:MAX_ARCHIVE_FILES]

    total_bytes = 0
    processed_count = 0
    skipped_unsupported = 0
    skipped_system = 0
    results: List[Dict] = []

    with py7zr.SevenZipFile(io.BytesIO(raw), mode='r') as sz:
        for fname in all_files:
            basename = os.path.basename(fname)
            if fname.endswith('/'):
                continue
            if not _is_safe_path(fname):
                logger.warning(f"Unsafe path in 7Z, skipping: {fname}")
                continue
            if _is_system_file(fname):
                skipped_system += 1
                continue
            if not _is_supported_format(fname):
                skipped_unsupported += 1
                logger.debug(f"Skip unsupported format in 7Z: {fname}")
                continue
            try:
                extracted = sz.read([fname])
                if fname not in extracted:
                    continue
                chunk = extracted[fname].read()
            except Exception as e:
                logger.warning(f"Failed to read from 7Z {fname}: {e}")
                continue
            if len(chunk) > MAX_SINGLE_FILE_BYTES:
                logger.warning(f"File too large in 7Z ({len(chunk)} bytes), skipping: {fname}")
                continue

            total_bytes += len(chunk)
            if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
                logger.warning("7Z total bytes exceeded limit; stopping")
                break

            fake_upload = type('TmpUpload', (), {
                'name': basename,
                'content_type': '',
                '_data': chunk,
                'read': lambda self: self._data
            })()
            result = _process_archive_member(fake_upload, fname, processed_count)
            if result:
                if isinstance(result, list):
                    results.extend(result)
                else:
                    results.append(result)
                processed_count += 1

    logger.info(
        f"7Z {name} processing complete: processed={processed_count}, "
        f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
    )
    if not results:
        raise ValueError(f"No supported files found in 7Z archive: {name}")
    return results

def _normalize_tar(raw: bytes, name: str) -> List[Dict]:
    try:
        tf = tarfile.open(fileobj=io.BytesIO(raw), mode='r:*')
    except tarfile.TarError:
        raise ValueError(f"Invalid TAR archive: {name}")

    members = tf.getmembers()
    logger.info(f"TAR archive {name} contains {len(members)} entries")
    if len(members) > MAX_ARCHIVE_FILES:
        logger.warning(f"TAR contains {len(members)} files, limiting to {MAX_ARCHIVE_FILES}")
        members = members[:MAX_ARCHIVE_FILES]

    total_bytes = 0
    processed_count = 0
    skipped_unsupported = 0
    skipped_system = 0
    results: List[Dict] = []

    for tm in members:
        if tm.isdir() or tm.issym() or tm.islnk():
            continue
        fname = tm.name
        basename = os.path.basename(fname)
        if not _is_safe_path(fname):
            logger.warning(f"Unsafe path in TAR, skipping: {fname}")
            continue
        if _is_system_file(fname):
            skipped_system += 1
            continue
        if not _is_supported_format(fname):
            skipped_unsupported += 1
            logger.debug(f"Skip unsupported format in TAR: {fname}")
            continue
        if tm.size > MAX_SINGLE_FILE_BYTES:
            logger.warning(f"File too large in TAR ({tm.size} bytes), skipping: {fname}")
            continue
        try:
            f = tf.extractfile(tm)
            if f is None:
                continue
            chunk = f.read()
            f.close()
        except Exception as e:
            logger.warning(f"Failed to read from TAR {fname}: {e}")
            continue

        total_bytes += len(chunk)
        if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
            logger.warning("TAR total bytes exceeded limit; stopping")
            break

        fake_upload = type('TmpUpload', (), {
            'name': basename,
            'content_type': '',
            '_data': chunk,
            'read': lambda self: self._data
        })()
        result = _process_archive_member(fake_upload, fname, processed_count)
        if result:
            if isinstance(result, list):
                results.extend(result)
            else:
                results.append(result)
            processed_count += 1

    tf.close()
    logger.info(
        f"TAR {name} processing complete: processed={processed_count}, "
        f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
    )
    if not results:
        raise ValueError(f"No supported files found in TAR archive: {name}")
    return results



def _normalize_archive(raw: bytes, name: str) -> List[Dict]:
    """
    Маршрутизирует обработку архива к соответствующей функции в зависимости от расширения
    """
    ext = _ext(name)
    
    if ext == '.zip':
        return _normalize_zip(raw, name)
    elif ext == '.rar':
        return _normalize_rar(raw, name)
    elif ext == '.7z':
        return _normalize_7z(raw, name)
    elif ext in {'.tar', '.tgz', '.tar.gz', '.tar.bz2', '.tar.xz', '.tbz2'}:
        return _normalize_tar(raw, name)
    else:
        raise ValueError(f"Unsupported archive format: {ext}")



# ============ Главная точка входа ============

def normalize_any(uploaded_file) -> List[Dict] | Dict:
    """
    Возвращает:
      - dict: один нормализованный файл (картинка для OCR/превью)
      - list[dict]: несколько нормализованных файлов (если пришёл архив)
    НОРМАЛИЗАЦИЯ: только даунскейл по LIMIT_SIDE_PX/LIMIT_BYTES; DPI не меняем.
    """
    try:
        from django.conf import settings
        global LIBREOFFICE_PATH, POPPLER_PATH
        if not LIBREOFFICE_PATH:
            LIBREOFFICE_PATH = getattr(settings, 'LIBREOFFICE_PATH', LIBREOFFICE_PATH)
        if not POPPLER_PATH:
            POPPLER_PATH = getattr(settings, 'POPPLER_PATH', POPPLER_PATH)
    except Exception:
        pass

    name = getattr(uploaded_file, 'name', 'upload.bin')
    ext = _ext(name)
    content_type = getattr(uploaded_file, 'content_type', '') or ''

    # Быстрый отказ по архивам без поддержки
    if ext in ARCHIVE_EXTS and ext not in SUPPORTED_ARCHIVES:
        supported_list = ', '.join(sorted(SUPPORTED_ARCHIVES))
        raise ValueError(
            f"Archive format '{ext}' not supported. Supported archive formats: {supported_list}"
        )

    if not _is_supported_format(name) and not content_type.startswith('image/'):
        supported_list = ', '.join(sorted(SUPPORTED_EXTS - ARCHIVE_EXTS | SUPPORTED_ARCHIVES))
        raise ValueError(
            f"Unsupported file format: {name} (extension: {ext}). "
            f"Supported: images (PNG, JPG, WEBP, TIFF, HEIC, AVIF), PDF, "
            f"Office (DOC/DOCX/XLS/XLSX), HTML (HTML/HTM), "
            f"archives ({supported_list})"
        )

    raw = None
    try:
        # Если объект имеет путь на диске (обычно FileField.file), читаем файл по пути — это самый надёжный вариант
        file_path = getattr(uploaded_file, 'path', None) or getattr(uploaded_file, 'temporary_file_path', None)
        if file_path and os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                raw = f.read()
                logger.debug(f"Read raw bytes from file path: {file_path} ({len(raw)} bytes)")
        else:
            # fallback — читаем через .read()
            raw = uploaded_file.read()
            logger.debug(f"Read raw bytes via uploaded_file.read() ({len(raw)} bytes)")
    except Exception as e:
        logger.exception(f"Failed to read uploaded file bytes: {e}")
        raise

    # Для диагностики — покажем первые байты (hex) если файл очень маленький
    if raw is None:
        raise ValueError("Failed to read file content")
    logger.info(f"normalize_any: {name} (ext={ext}, bytes={len(raw)})")
    if len(raw) < 100:
        logger.debug(f"Content head (hex): {raw[:64].hex()} ; ascii: {raw[:64]!r}")
    logger.info(f"normalize_any: {name} (ext={ext}, bytes={len(raw)})")

    # Архивы
    if ext in ARCHIVE_EXTS:
        return _normalize_archive(raw, name)

    # PDF
    if ext == '.pdf' or content_type == 'application/pdf':
        return _from_pdf_bytes(raw, name)

    # Office
    if ext in HTML_EXTS or content_type in {'text/html', 'application/xhtml+xml'}:
        try:
            html_content = raw.decode('utf-8', errors='ignore')
            
            # Ищем base64 изображения в HTML
            img_match = re.search(r'src="data:image/(jpeg|jpg|png|webp|gif);base64,([^"]+)"', html_content)
            
            if img_match:
                # Нашли embedded изображение - извлекаем его
                img_format = img_match.group(1)
                img_base64 = img_match.group(2)
                
                try:
                    # Декодируем base64
                    img_bytes = base64.b64decode(img_base64)
                    logger.info(f"Extracted embedded {img_format} image from HTML ({len(img_bytes)} bytes)")
                    
                    # Обрабатываем как обычное изображение
                    return _from_image_bytes(img_bytes, f"embedded.{img_format}")
                    
                except Exception as e:
                    logger.warning(f"Failed to decode base64 image from HTML: {e}")
                    # Fallback к LibreOffice ниже
            else:
                logger.info("No embedded image found in HTML, will use LibreOffice")
                
        except Exception as e:
            logger.warning(f"Failed to process HTML for embedded images: {e}")

    # Office и HTML через LibreOffice
    if ext in OFFICE_EXTS | HTML_EXTS or content_type in {'text/html', 'application/xhtml+xml'}:
        soffice = LIBREOFFICE_PATH
        if not soffice:
            raise ValueError(
                "HTML/Office conversion requires LibreOffice. "
                "Set LIBREOFFICE_PATH in settings."
            )
        return _from_office_bytes(raw, name, soffice)

    # Изображения
    if ext in IMG_EXTS or content_type.startswith('image/'):
        return _from_image_bytes(raw, name)

    # Последняя попытка: прочесть как изображение
    try:
        return _from_image_bytes(raw, name)
    except Exception:
        raise ValueError(f"Unsupported or unreadable file: {name} (ext={ext})")











# # utils/file_converter.py - ПОЛНАЯ ВЕРСИЯ с поддержкой RAR/7Z/TAR
# import io
# import os
# import uuid
# import zipfile
# import tempfile
# import subprocess
# import logging
# from typing import List, Dict, Optional

# from pdf2image import convert_from_bytes
# from PIL import Image, ImageOps, UnidentifiedImageError

# # HEIC/HEIF
# try:
#     import pillow_heif
#     pillow_heif.register_heif_opener()
# except Exception:
#     pillow_heif = None

# # AVIF
# try:
#     import pillow_avif  # noqa: F401
# except Exception:
#     pillow_avif = None

# # RAR
# try:
#     import rarfile
#     RARFILE_AVAILABLE = True
# except ImportError:
#     RARFILE_AVAILABLE = False

# # 7Z
# try:
#     import py7zr
#     PY7ZR_AVAILABLE = True
# except ImportError:
#     PY7ZR_AVAILABLE = False

# # TAR - встроен в Python
# import tarfile

# logger = logging.getLogger('docscanner_app.file_converter')

# # ============ НАСТРОЙКИ ============
# PDF_CONVERT_DPI        = 150
# PDF_MAX_PAGES          = 5
# TIFF_MAX_PAGES         = 5
# MAX_SIDE_PX            = 2000
# MAX_BYTES              = 2_000_000
# JPG_QUALITY            = 85
# PNG_COMPRESS           = 9
# TIFF_COMPRESSION       = "tiff_adobe_deflate"
# MAX_ARCHIVE_FILES      = 200
# MAX_ARCHIVE_TOTAL_BYTES = 500 * 1024 * 1024  # 500 MB
# MAX_SINGLE_FILE_BYTES   = 50 * 1024 * 1024   # 50 MB для одного файла
# LIBREOFFICE_PATH       = None
# POPPLER_PATH           = None
# # ===================================

# # Расширения
# BROWSER_SAFE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.avif'}
# IMG_EXTS = {'.png', '.jpg', '.jpeg', '.jpe', '.webp', '.bmp', '.tif', '.tiff', 
#             '.heic', '.heif', '.hif', '.heifs', '.avif'}
# OFFICE_EXTS = {'.doc', '.docx', '.xls', '.xlsx'}
# ARCHIVE_EXTS = {'.zip', '.rar', '.7z', '.tar', '.tgz', '.tar.gz', '.tar.bz2', '.tar.xz', '.tbz2'}

# # Динамически определяем поддерживаемые архивы
# SUPPORTED_ARCHIVES = {'.zip'}  # ZIP всегда поддерживается
# if RARFILE_AVAILABLE:
#     SUPPORTED_ARCHIVES.add('.rar')
# if PY7ZR_AVAILABLE:
#     SUPPORTED_ARCHIVES.add('.7z')
# # TAR всегда поддерживается (встроен)
# SUPPORTED_ARCHIVES.update({'.tar', '.tgz', '.tar.gz', '.tar.bz2', '.tar.xz', '.tbz2'})

# # Все поддерживаемые расширения
# SUPPORTED_EXTS = IMG_EXTS | OFFICE_EXTS | {'.pdf'} | SUPPORTED_ARCHIVES

# # Лог доступности библиотек
# logger.info(f"Archive support: ZIP=yes, RAR={RARFILE_AVAILABLE}, 7Z={PY7ZR_AVAILABLE}, TAR=yes")

# def _ext(name: str) -> str:
#     """Получить расширение файла (с точкой, в нижнем регистре)"""
#     # Обработка двойных расширений (.tar.gz)
#     lower = name.lower()
#     if lower.endswith('.tar.gz'):
#         return '.tar.gz'
#     elif lower.endswith('.tar.bz2'):
#         return '.tar.bz2'
#     elif lower.endswith('.tar.xz'):
#         return '.tar.xz'
#     return os.path.splitext(lower)[1]

# def _is_supported_format(filename: str) -> bool:
#     """Быстрая проверка: поддерживается ли формат файла"""
#     return _ext(filename) in SUPPORTED_EXTS

# def _is_system_file(filename: str) -> bool:
#     """Проверка на системные/скрытые файлы"""
#     basename = os.path.basename(filename)
#     return (basename.startswith('.') or 
#             basename.startswith('__MACOSX') or
#             basename in {'Thumbs.db', 'desktop.ini', 'DS_Store'})

# def _is_safe_path(filepath: str) -> bool:
#     """
#     Проверка безопасности пути файла в архиве.
#     Защита от Path Traversal атак.
#     """
#     # Запрещаем абсолютные пути
#     if os.path.isabs(filepath):
#         logger.warning(f"Absolute path rejected: {filepath}")
#         return False
    
#     # Нормализуем путь и проверяем на выход за пределы
#     normalized = os.path.normpath(filepath)
#     if normalized.startswith('..') or normalized.startswith('/'):
#         logger.warning(f"Path traversal attempt rejected: {filepath}")
#         return False
    
#     # Запрещаем системные файлы
#     if _is_system_file(filepath):
#         return False
    
#     return True

# def _needs_compress(w: int, h: int, size_bytes: int) -> bool:
#     return (max(w, h) > MAX_SIDE_PX) or (size_bytes > MAX_BYTES)

# def _downscale(img: Image.Image, max_side: int = MAX_SIDE_PX) -> Image.Image:
#     img = ImageOps.exif_transpose(img)
#     w, h = img.size
#     longest = max(w, h)
#     if longest <= max_side:
#         return img
#     scale = longest / float(max_side)
#     new_w, new_h = int(round(w / scale)), int(round(h / scale))
#     return img.resize((new_w, new_h), Image.LANCZOS)

# def _save_png(img: Image.Image) -> bytes:
#     buf = io.BytesIO()
#     out = img if img.mode in ('RGB', 'L', 'P') else img.convert('RGB')
#     out.save(buf, format='PNG', optimize=True, compress_level=PNG_COMPRESS)
#     return buf.getvalue()

# def _save_jpeg(img: Image.Image) -> bytes:
#     buf = io.BytesIO()
#     out = img if img.mode in ('RGB', 'L') else img.convert('RGB')
#     out.save(buf, format='JPEG', quality=JPG_QUALITY, optimize=True)
#     return buf.getvalue()

# def _save_webp(img: Image.Image) -> bytes:
#     buf = io.BytesIO()
#     out = img if img.mode in ('RGB', 'L') else img.convert('RGB')
#     out.save(buf, format='WEBP', quality=JPG_QUALITY, method=6)
#     return buf.getvalue()

# def _save_tiff(img: Image.Image) -> bytes:
#     buf = io.BytesIO()
#     out = img if img.mode in ('RGB', 'L') else img.convert('RGB')
#     out.save(buf, format='TIFF', compression=TIFF_COMPRESSION)
#     return buf.getvalue()

# def _merge_images_vertically(images: List[Image.Image]) -> Image.Image:
#     widths  = [im.width for im in images]
#     heights = [im.height for im in images]
#     max_w   = max(widths)
#     total_h = sum(heights)
#     merged  = Image.new('RGB', (max_w, total_h), (255, 255, 255))
#     y = 0
#     for im in images:
#         merged.paste(ImageOps.exif_transpose(im).convert('RGB'), (0, y))
#         y += im.height
#     return merged

# def _pdf_to_image(pdf_bytes: bytes, dpi: int = PDF_CONVERT_DPI, max_pages: int = PDF_MAX_PAGES) -> Image.Image:
#     pages = convert_from_bytes(pdf_bytes, dpi=dpi, poppler_path=POPPLER_PATH)
#     if max_pages and len(pages) > max_pages:
#         pages = pages[:max_pages]
#     return _merge_images_vertically(pages)

# def _tiff_to_image(raw: bytes, max_pages: int = TIFF_MAX_PAGES) -> Image.Image:
#     img = Image.open(io.BytesIO(raw))
#     frames = []
#     try:
#         i = 0
#         while True:
#             img.seek(i)
#             frames.append(img.copy())
#             i += 1
#             if max_pages and i >= max_pages:
#                 break
#     except EOFError:
#         pass
#     if not frames:
#         frames = [img]
#     return _merge_images_vertically(frames)

# def _office_to_pdf_bytes(src_bytes: bytes, src_name: str, soffice_path: str) -> bytes:
#     with tempfile.TemporaryDirectory() as tmpdir:
#         src_path = os.path.join(tmpdir, src_name)
#         with open(src_path, 'wb') as f:
#             f.write(src_bytes)
#         cmd = [soffice_path, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', tmpdir, src_path]
#         logger.info(f"LibreOffice cmd: {' '.join(cmd)}")
#         res = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
#         if res.returncode != 0:
#             raise RuntimeError(f"LibreOffice failed ({res.returncode}): {res.stderr.decode('utf-8', 'ignore')}")
#         pdf_name = os.path.splitext(os.path.basename(src_name))[0] + '.pdf'
#         pdf_path = os.path.join(tmpdir, pdf_name)
#         if not os.path.exists(pdf_path):
#             raise RuntimeError("LibreOffice did not produce PDF")
#         with open(pdf_path, 'rb') as f:
#             return f.read()

# def _browser_safe_output(img: Image.Image, prefer_ext: str) -> (bytes, str):
#     ext = prefer_ext.lower()
#     if ext in {'.tif', '.tiff', '.heic', '.heif', '.hif', '.heifs'}:
#         return _save_png(img), '.png'
#     if ext in {'.png'}:
#         return _save_png(img), '.png'
#     if ext in {'.jpg', '.jpeg', '.jpe'}:
#         return _save_jpeg(img), '.jpg'
#     if ext == '.webp':
#         return _save_webp(img), '.webp'
#     if ext == '.avif':
#         if pillow_avif is not None:
#             buf = io.BytesIO()
#             out = img if img.mode in ('RGB', 'L') else img.convert('RGB')
#             out.save(buf, format='AVIF')
#             return buf.getvalue(), '.avif'
#         else:
#             logger.warning("AVIF plugin not installed; falling back to PNG")
#             return _save_png(img), '.png'
#     return _save_png(img), '.png'

# def _apply_thresholds_and_encode(img: Image.Image, raw_guess_ext: str, raw_guess_size: int) -> (bytes, str):
#     img = ImageOps.exif_transpose(img)
#     w, h = img.size
#     if _needs_compress(w, h, raw_guess_size):
#         img = _downscale(img, MAX_SIDE_PX)
#     data, ext = _browser_safe_output(img, raw_guess_ext)
#     if len(data) > MAX_BYTES:
#         img2 = _downscale(img, max(MAX_SIDE_PX, 1600))
#         if ext in {'.png'}:
#             data2, ext2 = _save_jpeg(img2), '.jpg'
#             if len(data2) < len(data):
#                 data, ext = data2, ext2
#         if len(data) > MAX_BYTES:
#             img3 = _downscale(img2, 1400)
#             data, ext = _browser_safe_output(img3, ext)
#     return data, ext

# def _from_image_bytes(raw: bytes, name: str) -> Dict:
#     ext = _ext(name)
#     try:
#         if ext in {'.tif', '.tiff'}:
#             img = _tiff_to_image(raw, max_pages=TIFF_MAX_PAGES)
#         else:
#             img = Image.open(io.BytesIO(raw))
#     except UnidentifiedImageError:
#         raise ValueError(f"Unreadable image: {name}")
#     data, out_ext = _apply_thresholds_and_encode(img, ext, len(raw))
#     return {
#         'data': data,
#         'filename': f"{uuid.uuid4().hex}{out_ext}",
#         'original_filename': name,
#     }

# def _from_pdf_bytes(raw: bytes, name: str) -> Dict:
#     img = _pdf_to_image(raw, dpi=PDF_CONVERT_DPI, max_pages=PDF_MAX_PAGES)
#     data, out_ext = _apply_thresholds_and_encode(img, '.png', len(raw))
#     if out_ext not in {'.png', '.jpg', '.jpeg', '.webp'}:
#         out_ext = '.png'
#     return {
#         'data': data,
#         'filename': f"{uuid.uuid4().hex}{out_ext}",
#         'original_filename': name,
#     }

# def _from_office_bytes(raw: bytes, name: str, soffice_path: str) -> Dict:
#     pdf = _office_to_pdf_bytes(raw, name, soffice_path)
#     return _from_pdf_bytes(pdf, name)

# def _process_archive_member(fake_upload, fname: str, processed_count: int) -> Optional[Dict]:
#     """
#     Общая функция для обработки одного файла из архива.
#     Возвращает None если файл не удалось обработать.
#     """
#     try:
#         result = normalize_any(fake_upload)
#         logger.debug(f"Successfully processed from archive: {fname}")
#         processed_count += 1
#         return result
#     except Exception as e:
#         logger.warning(f"Failed to normalize file from archive {fname}: {e}")
#         return None

# def _normalize_zip(raw: bytes, name: str) -> List[Dict]:
#     """Обработка ZIP архивов"""
#     try:
#         zf = zipfile.ZipFile(io.BytesIO(raw))
#     except zipfile.BadZipFile:
#         raise ValueError(f"Invalid ZIP archive: {name}")
    
#     infos = zf.infolist()
#     logger.info(f"ZIP archive {name} contains {len(infos)} entries")
    
#     if len(infos) > MAX_ARCHIVE_FILES:
#         logger.warning(f"ZIP contains {len(infos)} files, limiting to {MAX_ARCHIVE_FILES}")
#         infos = infos[:MAX_ARCHIVE_FILES]
    
#     total_bytes = 0
#     processed_count = 0
#     skipped_unsupported = 0
#     skipped_system = 0
#     results: List[Dict] = []
    
#     for zi in infos:
#         if zi.is_dir():
#             continue
        
#         fname = zi.filename
#         basename = os.path.basename(fname)
        
#         if not _is_safe_path(fname):
#             logger.warning(f"Unsafe path in ZIP, skipping: {fname}")
#             continue
        
#         if _is_system_file(fname):
#             skipped_system += 1
#             continue
        
#         if not _is_supported_format(fname):
#             skipped_unsupported += 1
#             logger.debug(f"Skip unsupported format in ZIP: {fname}")
#             continue
        
#         # Проверка размера ДО чтения
#         if zi.file_size > MAX_SINGLE_FILE_BYTES:
#             logger.warning(f"File too large in ZIP ({zi.file_size} bytes), skipping: {fname}")
#             continue
        
#         try:
#             with zf.open(zi, 'r') as f:
#                 chunk = f.read()
#         except Exception as e:
#             logger.warning(f"Failed to read file from ZIP {fname}: {e}")
#             continue
        
#         total_bytes += len(chunk)
#         if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
#             logger.warning(f"ZIP total bytes exceeded limit; stopping at {processed_count} files")
#             break
        
#         fake_upload = type('TmpUpload', (), {
#             'name': basename,
#             'content_type': '',
#             '_data': chunk,
#             'read': lambda self: self._data
#         })()
        
#         result = _process_archive_member(fake_upload, fname, processed_count)
#         if result:
#             if isinstance(result, list):
#                 results.extend(result)
#             else:
#                 results.append(result)
#             processed_count += 1
    
#     logger.info(
#         f"ZIP {name} processing complete: processed={processed_count}, "
#         f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
#     )
    
#     if not results:
#         raise ValueError(f"No supported files found in ZIP archive: {name}")
    
#     return results

# def _normalize_rar(raw: bytes, name: str) -> List[Dict]:
#     """Обработка RAR архивов"""
#     if not RARFILE_AVAILABLE:
#         raise ValueError("RAR support not installed. Install: pip install rarfile && apt-get install unrar")
    
#     try:
#         rf = rarfile.RarFile(io.BytesIO(raw))
#     except (rarfile.BadRarFile, rarfile.NotRarFile):
#         raise ValueError(f"Invalid RAR archive: {name}")
    
#     infos = rf.infolist()
#     logger.info(f"RAR archive {name} contains {len(infos)} entries")
    
#     if len(infos) > MAX_ARCHIVE_FILES:
#         logger.warning(f"RAR contains {len(infos)} files, limiting to {MAX_ARCHIVE_FILES}")
#         infos = infos[:MAX_ARCHIVE_FILES]
    
#     total_bytes = 0
#     processed_count = 0
#     skipped_unsupported = 0
#     skipped_system = 0
#     results: List[Dict] = []
    
#     for ri in infos:
#         if ri.isdir():
#             continue
        
#         fname = ri.filename
#         basename = os.path.basename(fname)
        
#         if not _is_safe_path(fname):
#             logger.warning(f"Unsafe path in RAR, skipping: {fname}")
#             continue
        
#         if _is_system_file(fname):
#             skipped_system += 1
#             continue
        
#         if not _is_supported_format(fname):
#             skipped_unsupported += 1
#             logger.debug(f"Skip unsupported format in RAR: {fname}")
#             continue
        
#         # Проверка размера
#         if ri.file_size > MAX_SINGLE_FILE_BYTES:
#             logger.warning(f"File too large in RAR ({ri.file_size} bytes), skipping: {fname}")
#             continue
        
#         try:
#             chunk = rf.read(ri.filename)
#         except Exception as e:
#             logger.warning(f"Failed to read from RAR {fname}: {e}")
#             continue
        
#         total_bytes += len(chunk)
#         if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
#             logger.warning(f"RAR total bytes exceeded limit; stopping")
#             break
        
#         fake_upload = type('TmpUpload', (), {
#             'name': basename,
#             'content_type': '',
#             '_data': chunk,
#             'read': lambda self: self._data
#         })()
        
#         result = _process_archive_member(fake_upload, fname, processed_count)
#         if result:
#             if isinstance(result, list):
#                 results.extend(result)
#             else:
#                 results.append(result)
#             processed_count += 1
    
#     logger.info(
#         f"RAR {name} processing complete: processed={processed_count}, "
#         f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
#     )
    
#     if not results:
#         raise ValueError(f"No supported files found in RAR archive: {name}")
    
#     return results

# def _normalize_7z(raw: bytes, name: str) -> List[Dict]:
#     """Обработка 7Z архивов"""
#     if not PY7ZR_AVAILABLE:
#         raise ValueError("7Z support not installed. Install: pip install py7zr")
    
#     try:
#         with py7zr.SevenZipFile(io.BytesIO(raw), mode='r') as sz:
#             all_files = sz.getnames()
#     except py7zr.Bad7zFile:
#         raise ValueError(f"Invalid 7Z archive: {name}")
    
#     logger.info(f"7Z archive {name} contains {len(all_files)} entries")
    
#     if len(all_files) > MAX_ARCHIVE_FILES:
#         logger.warning(f"7Z contains {len(all_files)} files, limiting to {MAX_ARCHIVE_FILES}")
#         all_files = all_files[:MAX_ARCHIVE_FILES]
    
#     total_bytes = 0
#     processed_count = 0
#     skipped_unsupported = 0
#     skipped_system = 0
#     results: List[Dict] = []
    
#     with py7zr.SevenZipFile(io.BytesIO(raw), mode='r') as sz:
#         for fname in all_files:
#             basename = os.path.basename(fname)
            
#             # py7zr не имеет is_dir(), проверяем по имени
#             if fname.endswith('/'):
#                 continue
            
#             if not _is_safe_path(fname):
#                 logger.warning(f"Unsafe path in 7Z, skipping: {fname}")
#                 continue
            
#             if _is_system_file(fname):
#                 skipped_system += 1
#                 continue
            
#             if not _is_supported_format(fname):
#                 skipped_unsupported += 1
#                 logger.debug(f"Skip unsupported format in 7Z: {fname}")
#                 continue
            
#             try:
#                 # py7zr извлекает в dict: {filename: BytesIO}
#                 extracted = sz.read([fname])
#                 if fname not in extracted:
#                     continue
#                 chunk = extracted[fname].read()
#             except Exception as e:
#                 logger.warning(f"Failed to read from 7Z {fname}: {e}")
#                 continue
            
#             if len(chunk) > MAX_SINGLE_FILE_BYTES:
#                 logger.warning(f"File too large in 7Z ({len(chunk)} bytes), skipping: {fname}")
#                 continue
            
#             total_bytes += len(chunk)
#             if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
#                 logger.warning(f"7Z total bytes exceeded limit; stopping")
#                 break
            
#             fake_upload = type('TmpUpload', (), {
#                 'name': basename,
#                 'content_type': '',
#                 '_data': chunk,
#                 'read': lambda self: self._data
#             })()
            
#             result = _process_archive_member(fake_upload, fname, processed_count)
#             if result:
#                 if isinstance(result, list):
#                     results.extend(result)
#                 else:
#                     results.append(result)
#                 processed_count += 1
    
#     logger.info(
#         f"7Z {name} processing complete: processed={processed_count}, "
#         f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
#     )
    
#     if not results:
#         raise ValueError(f"No supported files found in 7Z archive: {name}")
    
#     return results

# def _normalize_tar(raw: bytes, name: str) -> List[Dict]:
#     """Обработка TAR/TAR.GZ/TAR.BZ2/TAR.XZ архивов"""
#     try:
#         # mode='r:*' автоматически определяет сжатие
#         tf = tarfile.open(fileobj=io.BytesIO(raw), mode='r:*')
#     except tarfile.TarError:
#         raise ValueError(f"Invalid TAR archive: {name}")
    
#     members = tf.getmembers()
#     logger.info(f"TAR archive {name} contains {len(members)} entries")
    
#     if len(members) > MAX_ARCHIVE_FILES:
#         logger.warning(f"TAR contains {len(members)} files, limiting to {MAX_ARCHIVE_FILES}")
#         members = members[:MAX_ARCHIVE_FILES]
    
#     total_bytes = 0
#     processed_count = 0
#     skipped_unsupported = 0
#     skipped_system = 0
#     results: List[Dict] = []
    
#     for tm in members:
#         if tm.isdir() or tm.issym() or tm.islnk():
#             continue
        
#         fname = tm.name
#         basename = os.path.basename(fname)
        
#         if not _is_safe_path(fname):
#             logger.warning(f"Unsafe path in TAR, skipping: {fname}")
#             continue
        
#         if _is_system_file(fname):
#             skipped_system += 1
#             continue
        
#         if not _is_supported_format(fname):
#             skipped_unsupported += 1
#             logger.debug(f"Skip unsupported format in TAR: {fname}")
#             continue
        
#         if tm.size > MAX_SINGLE_FILE_BYTES:
#             logger.warning(f"File too large in TAR ({tm.size} bytes), skipping: {fname}")
#             continue
        
#         try:
#             f = tf.extractfile(tm)
#             if f is None:
#                 continue
#             chunk = f.read()
#             f.close()
#         except Exception as e:
#             logger.warning(f"Failed to read from TAR {fname}: {e}")
#             continue
        
#         total_bytes += len(chunk)
#         if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
#             logger.warning(f"TAR total bytes exceeded limit; stopping")
#             break
        
#         fake_upload = type('TmpUpload', (), {
#             'name': basename,
#             'content_type': '',
#             '_data': chunk,
#             'read': lambda self: self._data
#         })()
        
#         result = _process_archive_member(fake_upload, fname, processed_count)
#         if result:
#             if isinstance(result, list):
#                 results.extend(result)
#             else:
#                 results.append(result)
#             processed_count += 1
    
#     tf.close()
    
#     logger.info(
#         f"TAR {name} processing complete: processed={processed_count}, "
#         f"skipped_unsupported={skipped_unsupported}, skipped_system={skipped_system}"
#     )
    
#     if not results:
#         raise ValueError(f"No supported files found in TAR archive: {name}")
    
#     return results

# def _normalize_archive(raw: bytes, name: str) -> List[Dict]:
#     """
#     Универсальный обработчик архивов.
#     Определяет тип и вызывает соответствующую функцию.
#     """
#     ext = _ext(name).lower()
    
#     if ext == '.zip':
#         return _normalize_zip(raw, name)
#     elif ext == '.rar':
#         return _normalize_rar(raw, name)
#     elif ext == '.7z':
#         return _normalize_7z(raw, name)
#     elif ext in {'.tar', '.tgz', '.tar.gz', '.tar.bz2', '.tar.xz', '.tbz2'}:
#         return _normalize_tar(raw, name)
#     else:
#         raise ValueError(f"Unsupported archive format: {ext}")

# def normalize_any(uploaded_file) -> List[Dict] or Dict:
#     """
#     Универсальная точка входа.
#     Может вернуть:
#       - dict: один нормализованный файл
#       - list[dict]: несколько нормализованных файлов (из архива)
#     """
#     try:
#         from django.conf import settings
#         global LIBREOFFICE_PATH, POPPLER_PATH
#         if not LIBREOFFICE_PATH:
#             LIBREOFFICE_PATH = getattr(settings, 'LIBREOFFICE_PATH', LIBREOFFICE_PATH)
#         if not POPPLER_PATH:
#             POPPLER_PATH = getattr(settings, 'POPPLER_PATH', POPPLER_PATH)
#     except Exception:
#         pass
    
#     name = getattr(uploaded_file, 'name', 'upload.bin')
#     ext = _ext(name)
#     content_type = getattr(uploaded_file, 'content_type', '') or ''
    
#     # РАННЯЯ ПРОВЕРКА ФОРМАТА
#     if ext in ARCHIVE_EXTS and ext not in SUPPORTED_ARCHIVES:
#         supported_list = ', '.join(sorted(SUPPORTED_ARCHIVES))
#         raise ValueError(
#             f"Archive format '{ext}' not supported. "
#             f"Supported archive formats: {supported_list}"
#         )
    
#     if not _is_supported_format(name) and not content_type.startswith('image/'):
#         supported_list = ', '.join(sorted(SUPPORTED_EXTS - ARCHIVE_EXTS | SUPPORTED_ARCHIVES))
#         raise ValueError(
#             f"Unsupported file format: {name} (extension: {ext}). "
#             f"Supported formats: images (PNG, JPG, WEBP, TIFF, HEIC, AVIF), "
#             f"PDF, Office (DOC, DOCX, XLS, XLSX), archives ({supported_list})"
#         )
    
#     raw = uploaded_file.read()
#     logger.info(f"normalize_any: {name} (ext={ext}, bytes={len(raw)})")
    
#     # Архивы
#     if ext in ARCHIVE_EXTS:
#         return _normalize_archive(raw, name)
    
#     # PDF
#     if ext == '.pdf' or content_type == 'application/pdf':
#         return _from_pdf_bytes(raw, name)
    
#     # Office
#     if ext in OFFICE_EXTS:
#         soffice = LIBREOFFICE_PATH or r"C:\Program Files\LibreOffice\program\soffice.exe"
#         return _from_office_bytes(raw, name, soffice)
    
#     # Изображения
#     if ext in IMG_EXTS or content_type.startswith('image/'):
#         return _from_image_bytes(raw, name)
    
#     # Последняя попытка
#     try:
#         return _from_image_bytes(raw, name)
#     except Exception:
#         raise ValueError(f"Unsupported or unreadable file: {name} (ext={ext})")
















# import io
# import uuid
# import logging

# from django.conf import settings
# from pdf2image import convert_from_bytes
# from PIL import Image

# logger = logging.getLogger('docscanner_app.file_converter')

# ALLOWED_IMAGE_CONTENT_TYPES = {
#     'image/jpeg',
#     'image/jpg',
#     'image/png',
# }

# def merge_images_vertically(images):
#     logger.info(f"merge_images_vertically: {len(images)} images")
#     widths  = [img.width for img in images]
#     heights = [img.height for img in images]
#     max_w   = max(widths)
#     total_h = sum(heights)
#     merged  = Image.new('RGB', (max_w, total_h), (255, 255, 255))
#     y = 0
#     for img in images:
#         merged.paste(img, (0, y))
#         y += img.height
#     logger.info("merge_images_vertically: done")
#     return merged

# def normalize_uploaded_file(uploaded_file):
#     logger.info(f"normalize_uploaded_file: start for {uploaded_file.name} (content_type={uploaded_file.content_type})")
#     content_type = uploaded_file.content_type
#     raw_bytes    = uploaded_file.read()
#     logger.info(f"normalize_uploaded_file: read {len(raw_bytes)} bytes")

#     poppler_path = getattr(settings, "POPPLER_PATH", "") or None

#     if content_type == 'application/pdf':
#         logger.info("normalize_uploaded_file: it's a PDF, converting...")
#         try:
#             pages = convert_from_bytes(
#                 raw_bytes,
#                 dpi=200,
#                 poppler_path=poppler_path  # None если не указано, иначе твой путь
#             )
#             logger.info(f"normalize_uploaded_file: converted PDF to {len(pages)} pages")
#             merged = merge_images_vertically(pages)
#             buf = io.BytesIO()
#             merged.save(buf, format='PNG')
#             logger.info(f"normalize_uploaded_file: PDF merged and saved to PNG, size={buf.tell()} bytes")
#             return {
#                 'data': buf.getvalue(),
#                 'filename': f"{uuid.uuid4().hex}.png",
#                 'original_filename': uploaded_file.name,
#                 'content_type': 'image/png'
#             }
#         except Exception as e:
#             logger.error(f"normalize_uploaded_file: PDF conversion failed: {e}")
#             raise

#     if content_type in ALLOWED_IMAGE_CONTENT_TYPES:
#         logger.info("normalize_uploaded_file: it's an image, returning as is.")
#         return {
#             'data': raw_bytes,
#             'filename': uploaded_file.name,
#             'original_filename': uploaded_file.name,
#             'content_type': content_type
#         }

#     logger.error(f"normalize_uploaded_file: Unsupported file type: {content_type}")
#     raise ValueError(f"Unsupported file type: {content_type}")

# def normalize_uploaded_files(uploaded_files):
#     logger.info(f"normalize_uploaded_files: got {len(uploaded_files)} files")
#     normalized = []
#     for f in uploaded_files:
#         try:
#             normalized.append(normalize_uploaded_file(f))
#         except Exception as ex:
#             logger.error(f"normalize_uploaded_files: failed for {f.name}: {ex}")
#             continue
#     logger.info(f"normalize_uploaded_files: normalized {len(normalized)} files")
#     return normalized



# import io
# import uuid
# import logging

# from django.conf import settings
# from pdf2image import convert_from_bytes
# from PIL import Image

# logger = logging.getLogger('docscanner_app.file_converter')

# ALLOWED_IMAGE_CONTENT_TYPES = {
#     'image/jpeg',
#     'image/jpg',
#     'image/png',
# }

# def merge_images_vertically(images):
#     logger.info(f"merge_images_vertically: {len(images)} images")
#     widths  = [img.width for img in images]
#     heights = [img.height for img in images]
#     max_w   = max(widths)
#     total_h = sum(heights)
#     merged  = Image.new('RGB', (max_w, total_h), (255, 255, 255))
#     y = 0
#     for img in images:
#         merged.paste(img, (0, y))
#         y += img.height
#     logger.info("merge_images_vertically: done")
#     return merged

# def normalize_uploaded_file(uploaded_file):
#     logger.info(f"normalize_uploaded_file: start for {uploaded_file.name} (content_type={uploaded_file.content_type})")
#     content_type = uploaded_file.content_type
#     raw_bytes    = uploaded_file.read()
#     logger.info(f"normalize_uploaded_file: read {len(raw_bytes)} bytes")

#     if content_type == 'application/pdf':
#         logger.info("normalize_uploaded_file: it's a PDF, converting...")
#         try:
#             pages = convert_from_bytes(
#                 raw_bytes,
#                 dpi=200,
#                 poppler_path=getattr(settings, "POPPLER_PATH", None)
#             )
#             logger.info(f"normalize_uploaded_file: converted PDF to {len(pages)} pages")
#             merged = merge_images_vertically(pages)
#             buf = io.BytesIO()
#             merged.save(buf, format='PNG')
#             logger.info(f"normalize_uploaded_file: PDF merged and saved to PNG, size={buf.tell()} bytes")
#             return {
#                 'data': buf.getvalue(),
#                 'filename': f"{uuid.uuid4().hex}.png",
#                 'original_filename': uploaded_file.name,
#                 'content_type': 'image/png'
#             }
#         except Exception as e:
#             logger.error(f"normalize_uploaded_file: PDF conversion failed: {e}")
#             raise

#     if content_type in ALLOWED_IMAGE_CONTENT_TYPES:
#         logger.info("normalize_uploaded_file: it's an image, returning as is.")
#         return {
#             'data': raw_bytes,
#             'filename': uploaded_file.name,
#             'original_filename': uploaded_file.name,
#             'content_type': content_type
#         }

#     logger.error(f"normalize_uploaded_file: Unsupported file type: {content_type}")
#     raise ValueError(f"Unsupported file type: {content_type}")

# def normalize_uploaded_files(uploaded_files):
#     logger.info(f"normalize_uploaded_files: got {len(uploaded_files)} files")
#     normalized = []
#     for f in uploaded_files:
#         try:
#             normalized.append(normalize_uploaded_file(f))
#         except Exception as ex:
#             logger.error(f"normalize_uploaded_files: failed for {f.name}: {ex}")
#             continue
#     logger.info(f"normalize_uploaded_files: normalized {len(normalized)} files")
#     return normalized

