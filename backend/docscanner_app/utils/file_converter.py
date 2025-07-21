import io
import uuid
import logging

from django.conf import settings
from pdf2image import convert_from_bytes
from PIL import Image

logger = logging.getLogger('docscanner_app.file_converter')

ALLOWED_IMAGE_CONTENT_TYPES = {
    'image/jpeg',
    'image/jpg',
    'image/png',
}

def merge_images_vertically(images):
    logger.info(f"merge_images_vertically: {len(images)} images")
    widths  = [img.width for img in images]
    heights = [img.height for img in images]
    max_w   = max(widths)
    total_h = sum(heights)
    merged  = Image.new('RGB', (max_w, total_h), (255, 255, 255))
    y = 0
    for img in images:
        merged.paste(img, (0, y))
        y += img.height
    logger.info("merge_images_vertically: done")
    return merged

def normalize_uploaded_file(uploaded_file):
    logger.info(f"normalize_uploaded_file: start for {uploaded_file.name} (content_type={uploaded_file.content_type})")
    content_type = uploaded_file.content_type
    raw_bytes    = uploaded_file.read()
    logger.info(f"normalize_uploaded_file: read {len(raw_bytes)} bytes")

    poppler_path = getattr(settings, "POPPLER_PATH", "") or None

    if content_type == 'application/pdf':
        logger.info("normalize_uploaded_file: it's a PDF, converting...")
        try:
            pages = convert_from_bytes(
                raw_bytes,
                dpi=200,
                poppler_path=poppler_path  # None если не указано, иначе твой путь
            )
            logger.info(f"normalize_uploaded_file: converted PDF to {len(pages)} pages")
            merged = merge_images_vertically(pages)
            buf = io.BytesIO()
            merged.save(buf, format='PNG')
            logger.info(f"normalize_uploaded_file: PDF merged and saved to PNG, size={buf.tell()} bytes")
            return {
                'data': buf.getvalue(),
                'filename': f"{uuid.uuid4().hex}.png",
                'original_filename': uploaded_file.name,
                'content_type': 'image/png'
            }
        except Exception as e:
            logger.error(f"normalize_uploaded_file: PDF conversion failed: {e}")
            raise

    if content_type in ALLOWED_IMAGE_CONTENT_TYPES:
        logger.info("normalize_uploaded_file: it's an image, returning as is.")
        return {
            'data': raw_bytes,
            'filename': uploaded_file.name,
            'original_filename': uploaded_file.name,
            'content_type': content_type
        }

    logger.error(f"normalize_uploaded_file: Unsupported file type: {content_type}")
    raise ValueError(f"Unsupported file type: {content_type}")

def normalize_uploaded_files(uploaded_files):
    logger.info(f"normalize_uploaded_files: got {len(uploaded_files)} files")
    normalized = []
    for f in uploaded_files:
        try:
            normalized.append(normalize_uploaded_file(f))
        except Exception as ex:
            logger.error(f"normalize_uploaded_files: failed for {f.name}: {ex}")
            continue
    logger.info(f"normalize_uploaded_files: normalized {len(normalized)} files")
    return normalized



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

