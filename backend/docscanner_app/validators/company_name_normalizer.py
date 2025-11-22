import re
import unicodedata

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




# Dlia poiska id_programoje kogda netu ni id ni vat_code dlia firm i fiz lic

LEGAL_FORMS_ALL = [
    # Литовские
    "uab", "mb", "ab", "iv", "kb", "všį", "vsi", "iį", "ii", "tūb", "tub", "kub", "kūb", "žūb", "zub",
    # Латвийские
    "sia", "as", "ik", "ps", "ks",
    # Эстонские
    "oü", "ou", "tü", "tu",
    # Польские
    "sp z o o", "spzoo", "s a", "sp j", "sp k", "sp p",
    # Общие европейские
    "ltd", "llc", "gmbh", "bv", "nv", "ag", "sarl", "srl", "sl", "sa", "oy", "oyj",
    "inc", "corp", "co", "plc", "lp", "llp",
]

LT_TRANSLIT = {
    'ą': 'a', 'č': 'c', 'ę': 'e', 'ė': 'e', 'į': 'i', 'š': 's',
    'ų': 'u', 'ū': 'u', 'ž': 'z', 'ü': 'u', 'ö': 'o', 'ä': 'a',
}


def normalize_company_name_v2(name: str) -> str:
    """
    Нормализует название компании для поиска дубликатов контрагентов.
    
    Примеры:
        'UAB "Perkūnas"' → 'perkunas'
        'MB Šviesa, UAB' → 'sviesa'
        'VILNIAUS PREKYBA, UAB' → 'vilniausprekyba'
        'Jono Jonaičio IĮ' → 'jonojonaicio'
    """
    if not name:
        return ""
    
    # 1. Lowercase + trim
    name = name.lower().strip()
    
    # 2. Убираем кавычки всех видов
    name = re.sub(r'[\"\'""«»„‟\'\'`´]', '', name)
    
    # 3. Транслитерация литовских символов
    for lt_char, ascii_char in LT_TRANSLIT.items():
        name = name.replace(lt_char, ascii_char)
    
    # 4. NFD нормализация для остальных диакритиков
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    
    # 5. Убираем правовые формы (сначала длинные)
    sorted_forms = sorted(LEGAL_FORMS_ALL, key=len, reverse=True)
    for form in sorted_forms:
        form_pattern = re.escape(form).replace(r'\ ', r'\s*')
        name = re.sub(r'^' + form_pattern + r'[\s,\.]+', '', name)
        name = re.sub(r'[\s,\.]+' + form_pattern + r'$', '', name)
        name = re.sub(r'[\s,\.]+' + form_pattern + r'[\s,\.]+', ' ', name)
    
    # 6. Оставляем только буквы и цифры
    name = re.sub(r'[^a-z0-9]', '', name)
    
    return name