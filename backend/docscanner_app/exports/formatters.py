import re




def format_date(date_obj):
    return date_obj.strftime("%Y.%m.%d") if date_obj else ""


def format_date_iso(date_obj):
    """
    Формат даты для Apskaita5 (xsd:date) -> YYYY-MM-DD
    """
    return date_obj.strftime("%Y-%m-%d") if date_obj else ""


def vat_to_int_str(val):
    try:
        if val is None or str(val).strip() == "":
            return "0"
        if float(val) == 0:
            return "0"
        return str(int(float(val)))
    except Exception:
        return "0"

def get_price_or_zero(val):
    try:
        if val is None or str(val).strip() == "":
            return "0.00"
        val_f = float(val)
        if val_f == 0:
            return "0.00"
        return f"{val_f:.2f}"
    except Exception:
        return "0.00"
    

def expand_empty_tags(xml_bytes: bytes) -> bytes:
    """
    Разворачивает самозакрывающиеся теги <tag .../> -> <tag ...></tag>.
    Работает ПО БАЙТАМ, не декодируя строку, чтобы не зависеть от кодировки
    (UTF-8, Windows-1257 и т.п.).
    """
    # \w в bytes-режиме — ASCII-символы [A-Za-z0-9_], что для имён тегов достаточно
    pattern = re.compile(br"<(\w+)([^/>]*?)\s*/>")
    return pattern.sub(br"<\1\2></\1>", xml_bytes)


# def expand_empty_tags(xml_bytes):
#     if isinstance(xml_bytes, bytes):
#         xml_str = xml_bytes.decode('utf-8')
#     else:
#         xml_str = xml_bytes
#     pattern = r'<([a-zA-Z0-9:_\-]+)([^>]*)\s*/>'
#     repl = r'<\1\2></\1>'
#     xml_str = re.sub(pattern, repl, xml_str)
#     return xml_str.encode('utf-8')