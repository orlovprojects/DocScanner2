import re

LEGAL_FORMS = [
    "uab", "mb", "ab", "iv", "kb", "všį", "vsi", "iį", "ii", "tūb", "kub", "kūb", "žūb"
]

def normalize_company_name(name):
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r'[\"\'“”«»]', '', name)
    for form in LEGAL_FORMS:
        # Начало строки
        name = re.sub(r'^' + re.escape(form) + r'\s+', '', name)
        # Конец строки
        name = re.sub(r'\s+' + re.escape(form) + r'$', '', name)
        # Перед запятой в конце: "trembina, mb,"
        name = re.sub(r'\s+' + re.escape(form) + r'[, ]*$', '', name)
        # После запятой в начале: ", mb trembina"
        name = re.sub(r'^[, ]*' + re.escape(form) + r'\s+', '', name)
        # Формы, окруженные запятыми или пробелами: ", mb, "
        name = re.sub(r'[, ]+' + re.escape(form) + r'[, ]+', ' ', name)
    name = re.sub(r'[^\w]', '', name)
    name = name.strip()
    return name