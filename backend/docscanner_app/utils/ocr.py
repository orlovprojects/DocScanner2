from google.cloud import vision


def get_ocr_text(data, filename, logger):
    client = vision.ImageAnnotatorClient()
    img = vision.Image(content=data)
    ocr_resp = client.document_text_detection(image=img)
    if ocr_resp.error.message:
        logger.error(f"OCR error for {filename}: {ocr_resp.error.message}")
        return None, ocr_resp.error.message

    raw_text_with_coords = ""
    for page in ocr_resp.full_text_annotation.pages:
        for block in page.blocks:
            block_text = ""
            for paragraph in block.paragraphs:
                for word in paragraph.words:
                    word_text = "".join([symbol.text for symbol in word.symbols])
                    block_text += word_text + " "
            block_box = [(v.x, v.y) for v in block.bounding_box.vertices]
            coords_str = f"[{'; '.join([f'{x},{y}' for x, y in block_box])}]"
            raw_text_with_coords += f"{block_text.strip()} {coords_str}\n"

    return raw_text_with_coords, None

# def get_ocr_text(data, filename, logger):
#     client = vision.ImageAnnotatorClient()
#     img = vision.Image(content=data)
#     ocr_resp = client.text_detection(image=img)
#     if ocr_resp.error.message:
#         logger.error(f"OCR error for {filename}: {ocr_resp.error.message}")
#         return None, ocr_resp.error.message
#     raw_text = (ocr_resp.text_annotations[0].description if ocr_resp.text_annotations else '')
#     return raw_text, None