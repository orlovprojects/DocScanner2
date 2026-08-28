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
    'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'ø': 'o', 'å': 'a', 'æ': 'a', 'ß': 'ss', 'đ': 'd', 'ł': 'l',
}

import difflib

PERSON_NOISE = {
    "ukininkas", "ukininke", "individuali", "veikla", "verslo", "liudijimas",
    "fizinis", "asmuo", "pvm", "moketojas", "gyv", "pvz",
}

# падежные окончания LT (порядок: длинные первыми)
_PERSON_ENDINGS = (
    "aiciui", "aicio", "aitis", "aites", "aitei", "aite", "aiti",
    "ienes", "ienei", "iene",
    "iaus", "ius", "ios", "ies", "ais", "iui",
    "aus", "ams", "ose",
    "as", "is", "ys", "us", "os", "es", "ei", "ui", "ai",
    "a", "e", "o", "u", "i",
)


def _translit_ascii(s: str) -> str:
    for lt_char, ascii_char in LT_TRANSLIT.items():
        s = s.replace(lt_char, ascii_char)
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def _person_stem(token: str) -> str:
    """'jonaitis'/'jonaicio' -> 'jon', 'petrauskas'/'petrauskiene' -> 'petrausk', 'ona'/'onos' -> 'on'"""
    min_len = 2 if len(token) <= 4 else 3
    for suf in _PERSON_ENDINGS:
        if token.endswith(suf) and len(token) - len(suf) >= min_len:
            return token[:-len(suf)]
    return token


def person_tokens(name: str) -> list[str]:
    if not name:
        return []
    s = _translit_ascii(name.lower())
    s = re.sub(r'[^a-z0-9]', ' ', s)
    parts = [p for p in s.split() if p]
    return [p for p in parts
            if p not in PERSON_NOISE
            and p not in LEGAL_FORMS_ALL
            and not p.isdigit()]


def looks_like_person(name: str) -> bool:
    """Похоже на ФИО, а не на компанию."""
    if not name:
        return False
    low = _translit_ascii(name.lower())
    if any(re.search(r'(^|[\s,\.])' + re.escape(_translit_ascii(f)) + r'([\s,\.]|$)', low)
           for f in LEGAL_FORMS_ALL):
        return False
    toks = person_tokens(name)
    return 2 <= len(toks) <= 4 and all(t.isalpha() for t in toks)


def normalize_person_name(name: str) -> str:
    """Ключ, не зависящий от порядка слов: 'Jonas Jonaitis' == 'Jonaitis Jonas' -> 'jon|jon'"""
    toks = [_person_stem(t) for t in person_tokens(name) if len(t) > 1]
    return "|".join(sorted(set(toks)))

LT_LEGAL_FORMS = {"uab", "mb", "iv", "kb", "vsi", "vss", "ii", "tub", "kub", "zub", "ue"}

COMPANY_NOISE = {"ir", "ko", "and", "the", "of"}

COMPANY_ALIASES = {
    "limited": "ltd", "incorporated": "inc", "corporation": "corp",
    "company": "co", "aktiengesellschaft": "ag", "spolka": "sp",
    "zoo": "spzoo", "sarl": "sarl", "societe": "sa", "holdings": "holding",
    "international": "intl", "technologies": "tech", "technology": "tech",
    "services": "service", "solutions": "solution", "group": "grp",
}


def has_lt_legal_form(name: str) -> bool:
    toks = set(re.split(r'[^a-z0-9]+', _translit_ascii((name or "").lower())))
    return bool(toks & LT_LEGAL_FORMS)


def looks_like_lt_code(reg_code=None, vat_code=None) -> bool:
    """Похоже на литовский įmonės kodas / PVM kodas."""
    vat = re.sub(r'[^A-Za-z0-9]', '', str(vat_code or "")).upper()
    if vat.startswith("LT"):
        return True
    reg = re.sub(r'\D', '', str(reg_code or ""))
    return len(reg) == 9 and reg[0] in "123"


def company_tokens(name: str) -> list[str]:
    if not name:
        return []
    s = _translit_ascii(name.lower())
    s = s.replace("&", " and ")
    s = re.sub(r'[^a-z0-9]', ' ', s)
    out = []
    for p in s.split():
        p = COMPANY_ALIASES.get(p, p)
        if p in COMPANY_NOISE or p in LEGAL_FORMS_ALL:
            continue
        out.append(p)
    return out


def _company_stem(token: str) -> str:
    if token.isdigit():
        return token
    for suf in ("iaus", "aus", "ies", "ios", "ius", "as", "is", "ys", "us", "os", "es", "o", "a", "e", "u"):
        if token.endswith(suf) and len(token) - len(suf) >= 4:
            return token[:-len(suf)]
    return token


def company_names_match(a: str, b: str, fuzzy: float = 0.92) -> bool:
    ta, tb = company_tokens(a), company_tokens(b)
    if not ta or not tb:
        return False

    # цифры должны совпадать точно: "Trade 24" != "Trade 25"
    if {t for t in ta if t.isdigit()} != {t for t in tb if t.isdigit()}:
        return False

    if sorted(ta) == sorted(tb):                       # другой порядок слов
        return True

    sa = sorted(_company_stem(t) for t in ta)
    sb = sorted(_company_stem(t) for t in tb)
    if sa == sb:                                        # падежи / формы слов
        return True

    # одно название — подмножество другого ("Baltic Trade" vs "Baltic Trade Europe")
    if set(sa) < set(sb) or set(sb) < set(sa):
        core = min(sa, sb, key=len)
        if len("".join(core)) >= 8:
            return True

    ja, jb = "".join(sa), "".join(sb)                   # опечатки OCR
    if min(len(ja), len(jb)) < 8:
        return False
    return difflib.SequenceMatcher(None, ja, jb).ratio() >= fuzzy

def person_names_match(a: str, b: str, fuzzy: float = 0.86) -> bool:
    ta, tb = person_tokens(a), person_tokens(b)
    if len(ta) < 2 or len(tb) < 2:
        return False
    short, pool = (ta, list(tb)) if len(ta) <= len(tb) else (tb, list(ta))
    matched = 0
    for t in short:
        found = None
        for c in pool:
            if len(t) == 1 or len(c) == 1:      # инициал
                if t[0] == c[0]:
                    found = c
                    break
                continue
            st, sc = _person_stem(t), _person_stem(c)
            if st == sc or difflib.SequenceMatcher(None, st, sc).ratio() >= fuzzy:
                found = c
                break
        if found:
            pool.remove(found)
            matched += 1
    return matched == len(short)

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