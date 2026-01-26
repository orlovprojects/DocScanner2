"""
Экспорт документов в формат Pragma 3.2
Форматы файлов: TXT (Tab-delimited), кодировка Windows-1257
Поддерживаются покупки (pirkimai) и продажи (pardavimai)
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime

logger = logging.getLogger(__name__)


# =========================
# Символы, которых нет в windows-1257 -> замена
# =========================

NON_CP1257_MAP = {
    # Чешские / Словацкие
    'á': 'a', 'Á': 'A',
    'ď': 'd', 'Ď': 'D',
    'ě': 'e', 'Ě': 'E',
    'í': 'i', 'Í': 'I',
    'ĺ': 'l', 'Ĺ': 'L',
    'ľ': 'l', 'Ľ': 'L',
    'ň': 'n', 'Ň': 'N',
    'ř': 'r', 'Ř': 'R',
    'ť': 't', 'Ť': 'T',
    'ú': 'u', 'Ú': 'U',
    'ů': 'u', 'Ů': 'U',
    'ý': 'y', 'Ý': 'Y',

    # Венгерские
    'ő': 'o', 'Ő': 'O',
    'ű': 'u', 'Ű': 'U',

    # Румынские
    'ă': 'a', 'Ă': 'A',
    'â': 'a', 'Â': 'A',
    'î': 'i', 'Î': 'I',
    'ș': 's', 'Ș': 'S',
    'ț': 't', 'Ț': 'T',

    # Хорватский
    'đ': 'd', 'Đ': 'D',

    # Французский
    'à': 'a', 'À': 'A',
    'ç': 'c', 'Ç': 'C',
    'è': 'e', 'È': 'E',
    'ê': 'e', 'Ê': 'E',
    'ë': 'e', 'Ë': 'E',
    'ï': 'i', 'Ï': 'I',
    'ô': 'o', 'Ô': 'O',
    'œ': 'oe', 'Œ': 'OE',
    'ù': 'u', 'Ù': 'U',
    'û': 'u', 'Û': 'U',
    'ÿ': 'y', 'Ÿ': 'Y',

    # Испанский
    'ñ': 'n', 'Ñ': 'N',
    '¿': '?', '¡': '!',

    # Португальский
    'ã': 'a', 'Ã': 'A',

    # Итальянский
    'ì': 'i', 'Ì': 'I',
    'ò': 'o', 'Ò': 'O',

    # Турецкий
    'ğ': 'g', 'Ğ': 'G',
    'ı': 'i',
    'ş': 's', 'Ş': 'S',
    'İ': 'I',

    # Редкие латинские с диакритиками
    'ȳ': 'y', 'Ȳ': 'Y',
    'ḩ': 'h', 'Ḩ': 'H',
    'ƶ': 'z', 'Ƶ': 'Z',
    'ɇ': 'e', 'Ɇ': 'E',

    # Исландские
    'þ': 'th', 'Þ': 'Th',
    'ð': 'd',  'Ð': 'D',

    # Вьетнамские
    'ơ': 'o', 'Ơ': 'O',
    'ư': 'u', 'Ư': 'U',

    # Немецкая заглавная ß
    'ẞ': 'SS',
}


def _normalize_for_cp1257(value):
    """
    Нормализует строку для кодировки windows-1257:
    - заменяет символы из NON_CP1257_MAP
    - кириллицу заменяет на '?'
    - остальные некодируемые символы заменяет на '?'
    """
    if value is None:
        return ""

    s = str(value)

    # Сначала прогоняем через маппинг нестандартных латинских букв
    s = "".join(NON_CP1257_MAP.get(ch, ch) for ch in s)

    result_chars = []
    for ch in s:
        code = ord(ch)

        # Кириллица -> '?'
        if 0x0400 <= code <= 0x04FF or 0x0500 <= code <= 0x052F:
            result_chars.append('?')
            continue

        # Пробуем закодировать в cp1257
        try:
            ch.encode("cp1257")
            result_chars.append(ch)
        except UnicodeEncodeError:
            # Экзотический символ (эмодзи, азиатский и т.п.)
            result_chars.append('?')

    return "".join(result_chars)


# =========================
# Helpers
# =========================

def _safe_D(x):
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def _s(v):
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def _format_date(date_obj):
    """Форматирование даты в YYYY.MM.DD для Pragma 3.2."""
    if not date_obj:
        return ""
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.strptime(date_obj, "%Y-%m-%d").date()
        except ValueError:
            return ""
    return date_obj.strftime("%Y.%m.%d")


def _format_decimal(value, decimals=2):
    """Форматирование Decimal."""
    if value is None:
        return ""
    d = _safe_D(value)
    quantizer = Decimal("0." + "0" * decimals) if decimals > 0 else Decimal("1")
    d = d.quantize(quantizer, rounding=ROUND_HALF_UP)
    return str(d)


def _escape_csv(value):
    """Очистка значений для CSV — убираем кавычки и спецсимволы, нормализуем для cp1257."""
    s = _s(value)
    # Нормализуем для windows-1257
    s = _normalize_for_cp1257(s)
    # Убираем кавычки
    s = s.replace('"', '').replace("'", '')
    # Заменяем табуляцию и переводы строк на пробелы
    s = s.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')
    return s


def _build_line(*fields):
    """Построение строки CSV с табуляцией как разделителем."""
    line = '\t'.join(_escape_csv(f) for f in fields) + '\r\n'
    return line.encode('windows-1257', errors='replace')


def _get_preke_paslauga(value) -> str:
    """
    Преобразует preke_paslauga в формат Pragma:
    1, 3 -> "0" (prekė/товар)
    2, 4 -> "1" (paslauga/услуга)
    """
    try:
        v = int(value)
        if v in (1, 3):
            return "0"
        elif v in (2, 4):
            return "1"
    except (ValueError, TypeError):
        pass
    return "0"


# =========================
# PVM Kodas helpers
# =========================

def _get_pvm_kodas_for_item(doc, item, line_map=None, default="") -> str:
    """
    Получает PVM kodas для строки с учётом резолвера и separate_vat.
    
    Приоритет:
    1. line_map[item.id] — от резолвера (если есть)
    2. item.pvm_kodas — из БД
    3. default — fallback
    
    ВАЖНО: "Keli skirtingi PVM" — это маркер, не реальный код -> возвращаем default
    """
    item_id = getattr(item, "id", None)
    
    # Пробуем взять из line_map (от резолвера)
    if line_map is not None and item_id is not None and item_id in line_map:
        pvm = _s(line_map.get(item_id, ""))
        if pvm and pvm != "Keli skirtingi PVM":
            return pvm
    
    # Fallback на item.pvm_kodas
    pvm = _s(getattr(item, "pvm_kodas", ""))
    if pvm and pvm != "Keli skirtingi PVM":
        return pvm
    
    return default


def _get_pvm_kodas_for_doc(doc, default="") -> str:
    """
    Получает PVM kodas для документа (sumiskai режим).
    
    ВАЖНО: 
    - При separate_vat=True -> пустой (смешанные ставки)
    - "Keli skirtingi PVM" -> пустой (это маркер, не код)
    """
    separate_vat = bool(getattr(doc, "separate_vat", False))
    scan_type = _s(getattr(doc, "scan_type", "")).lower()
    
    # sumiskai + separate_vat=True -> пустой
    if separate_vat and scan_type in ("sumiskai", "summary", "suminis"):
        return default
    
    pvm = _s(getattr(doc, "pvm_kodas", ""))
    
    # Фильтруем маркер
    if pvm == "Keli skirtingi PVM":
        return default
    
    return pvm or default


# =========================
# Определение типа документа
# =========================

def _detect_document_type(doc):
    """
    Определяет тип документа:
    1 - pajamavimas (покупка/pirkimas)
    2 - išlaidavimas (продажа/pardavimas)
    """
    doc_type_str = (_s(getattr(doc, 'pirkimas_pardavimas', ''))).lower()
    
    if doc_type_str == 'pirkimas':
        doc_type = 1
    elif doc_type_str == 'pardavimas':
        doc_type = 2
    else:
        if _s(getattr(doc, 'seller_id', '')) or _s(getattr(doc, 'seller_vat_code', '')):
            doc_type = 1
        elif _s(getattr(doc, 'buyer_id', '')) or _s(getattr(doc, 'buyer_vat_code', '')):
            doc_type = 2
        else:
            doc_type = 2
            logger.warning("[PRAGMA:TYPE] doc=%s cannot determine type, defaulting to pardavimas",
                          getattr(doc, "id", None))
    
    return doc_type


def _get_company_code(doc, doc_type):
    """
    Получает код компании.
    Приоритет: *_id -> *_vat_code -> *_id_programoje
    """
    if doc_type == 1:  # pirkimas - seller
        code = (
            _s(getattr(doc, 'seller_id', ''))
            or _s(getattr(doc, 'seller_vat_code', ''))
            or _s(getattr(doc, 'seller_id_programoje', ''))
        )
    else:  # pardavimas - buyer
        code = (
            _s(getattr(doc, 'buyer_id', ''))
            or _s(getattr(doc, 'buyer_vat_code', ''))
            or _s(getattr(doc, 'buyer_id_programoje', ''))
        )
    return code


def _get_product_code(item=None, doc=None):
    """
    Получает код товара.
    Приоритет: item.prekes_kodas -> item.prekes_barkodas -> doc.prekes_kodas -> doc.prekes_barkodas -> PREKE001
    """
    if item:
        code = _s(getattr(item, 'prekes_kodas', '')) or _s(getattr(item, 'prekes_barkodas', ''))
        if code:
            return code
    if doc:
        code = _s(getattr(doc, 'prekes_kodas', '')) or _s(getattr(doc, 'prekes_barkodas', ''))
        if code:
            return code
    return "PREKE001"


def _get_document_number(doc) -> str:
    """Формирует номер документа из series и number."""
    series = _s(getattr(doc, "document_series", "")).replace(" ", "")
    number = _s(getattr(doc, "document_number", "")).replace(" ", "")

    if series and number:
        while number.startswith(series) and series:
            number = number[len(series):]
        return f"{series}{number}"

    return number or ""


# =========================
# Сбор уникальных кодов и создание маппингов
# =========================

def _build_id_mappings(documents):
    """
    Проходит по всем документам и собирает уникальные коды компаний и товаров.
    Возвращает (company_id_map, product_id_map, company_data_map, product_data_map)
    
    company_id_map: {code: numeric_id}
    product_id_map: {code: numeric_id}
    company_data_map: {code: {name, address, vat, ...}}
    product_data_map: {code: {name, unit, is_service}}
    """
    company_data_map = {}  # code -> данные компании
    product_data_map = {}  # code -> данные товара
    
    for doc in documents or []:
        doc_type = _detect_document_type(doc)
        
        # === Компания ===
        if doc_type == 1:
            prefix = 'seller_'
        else:
            prefix = 'buyer_'
        
        company_code = (
            _s(getattr(doc, f'{prefix}id', ''))
            or _s(getattr(doc, f'{prefix}vat_code', ''))
            or _s(getattr(doc, f'{prefix}id_programoje', ''))
        )
        
        if company_code and company_code not in company_data_map:
            company_data_map[company_code] = {
                'code': company_code,
                'name': _s(getattr(doc, f'{prefix}name', '')) or 'Nežinoma',
                'address': _s(getattr(doc, f'{prefix}address', '')),
                'vat_code': _s(getattr(doc, f'{prefix}vat_code', '')),
                'iban': _s(getattr(doc, f'{prefix}iban', '')),
                'country': _s(getattr(doc, f'{prefix}country_iso', '')).upper(),
                'phone': _s(getattr(doc, f'{prefix}phone', '')),
                'contact': _s(getattr(doc, f'{prefix}contact', '')),
                'email': _s(getattr(doc, f'{prefix}email', '')),
                'is_person': "1" if getattr(doc, f'{prefix}is_person', False) else "0",
            }
        
        # === Товары ===
        line_items = getattr(doc, 'line_items', None)
        has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
        if has_items:
            for item in line_items.all():
                product_code = _get_product_code(item, doc)
                if product_code not in product_data_map:
                    name = (
                        _s(getattr(item, 'prekes_pavadinimas', ''))
                        or _s(getattr(doc, 'prekes_pavadinimas', ''))
                        or 'Prekė'
                    )
                    unit = _s(getattr(item, 'unit', '')) or _s(getattr(doc, 'unit', '')) or 'vnt.'
                    preke_paslauga = getattr(item, 'preke_paslauga', None) or getattr(doc, 'preke_paslauga', None)
                    
                    product_data_map[product_code] = {
                        'code': product_code,
                        'name': name,
                        'unit': unit,
                        'is_service': _get_preke_paslauga(preke_paslauga),
                    }
        else:
            product_code = _get_product_code(None, doc)
            if product_code not in product_data_map:
                name = _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
                unit = _s(getattr(doc, 'unit', '')) or 'vnt.'
                preke_paslauga = getattr(doc, 'preke_paslauga', None)
                
                product_data_map[product_code] = {
                    'code': product_code,
                    'name': name,
                    'unit': unit,
                    'is_service': _get_preke_paslauga(preke_paslauga),
                }
    
    # Создаём числовые ID (начиная с 1)
    company_id_map = {code: idx + 1 for idx, code in enumerate(sorted(company_data_map.keys()))}
    product_id_map = {code: idx + 1 for idx, code in enumerate(sorted(product_data_map.keys()))}
    
    logger.info("[PRAGMA:MAPPING] companies=%d, products=%d", len(company_id_map), len(product_id_map))
    
    return company_id_map, product_id_map, company_data_map, product_data_map


# =========================
# КОМПАНИИ (Įmonių duomenys)
# =========================

def _export_companies(company_id_map, company_data_map):
    """
    Экспорт компаний в формат Pragma 3.2.
    
    Поля:
    1. Įmonės ID - числовой ID для связи
    2. Trumpas įmonės pavadinimas - code (до 20 симв., уникальный)
    3. Įmonės kodas - code
    4-13. остальные поля
    """
    lines = []
    
    for code, numeric_id in sorted(company_id_map.items(), key=lambda x: x[1]):
        data = company_data_map[code]
        
        line = _build_line(
            numeric_id,             # 1. Įmonės ID (числовой!)
            code[:20],              # 2. Trumpas įmonės pavadinimas (max 20)
            code[:20],              # 3. Įmonės kodas (max 20)
            data['name'][:75],      # 4. Pavadinimas (max 75)
            data['address'][:100],  # 5. Adresas (max 100)
            data['vat_code'][:250], # 6. PVM mokėtojo kodas (max 250)
            "",                     # 7. Banko kodas
            data['iban'][:40],      # 8. Atsiskaitomoji sąskaita (max 40)
            data['country'][:2],    # 9. Šalies kodas (max 2)
            data['phone'][:40],     # 10. Telefonas (max 40)
            data['contact'][:255],  # 11. Kontaktinis asmuo (max 255)
            data['email'][:100],    # 12. E-mail (max 100)
            data['is_person']       # 13. Įmonės tipas
        )
        
        lines.append(line)
        logger.info("[PRAGMA:COMPANY] id=%d code=%s", numeric_id, code)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:COMPANY] total exported: %d", len(lines))
    return result


# =========================
# ТОВАРЫ (Prekių duomenys)
# =========================

def _export_products(product_id_map, product_data_map):
    """
    Экспорт товаров в формат Pragma 3.2.
    
    Поля:
    1. Prekės ID - числовой ID для связи
    2. Prekės kodas (Nom.Nr.) - code (max 15)
    3-9. остальные поля
    """
    lines = []
    
    for code, numeric_id in sorted(product_id_map.items(), key=lambda x: x[1]):
        data = product_data_map[code]
        
        line = _build_line(
            numeric_id,             # 1. Prekės ID (числовой!)
            code[:15],              # 2. Prekės kodas (max 15)
            data['name'][:50],      # 3. Pavadinimas (max 50)
            data['unit'][:5],       # 4. Mato vienetas (max 5)
            data['is_service'],     # 5. Prekė ar paslauga
            "",                     # 6. Muitinės kodas
            "",                     # 7. Svoris
            "",                     # 8. Kiekis įpakavime
            ""                      # 9. Įpakavimo rūšis
        )
        
        lines.append(line)
        logger.info("[PRAGMA:PRODUCT] id=%d code=%s", numeric_id, code)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:PRODUCT] total exported: %d", len(lines))
    return result


# =========================
# ДОКУМЕНТЫ (Dokumento duomenys)
# =========================

def _export_documents(documents, doc_type_filter, user, company_id_map):
    """
    Экспорт документов в формат Pragma 3.2.
    """
    lines = []
    
    pragma3_fields = {}
    if user:
        pragma3_fields = getattr(user, 'pragma3_extra_fields', None) or {}
    
    for doc in documents or []:
        doc_id = getattr(doc, 'id', None)
        if not doc_id:
            continue
        
        doc_type = _detect_document_type(doc)
        
        if doc_type_filter and doc_type != doc_type_filter:
            continue
        
        # Даты
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
        inv_date = getattr(doc, 'invoice_date', None)
        due_date = getattr(doc, 'due_date', None)
        
        # Номер документа
        doc_number = _get_document_number(doc)
        
        # Код компании -> числовой ID
        company_code = _get_company_code(doc, doc_type)
        company_numeric_id = company_id_map.get(company_code, "")
        
        # Sandėlis и Korespondencija из user.pragma3_extra_fields
        if doc_type == 1:
            warehouse = _s(pragma3_fields.get('pirkimas_sandelis', ''))
            schema = _s(pragma3_fields.get('pirkimas_korespondencija', ''))
        else:
            warehouse = _s(pragma3_fields.get('pardavimas_sandelis', ''))
            schema = _s(pragma3_fields.get('pardavimas_korespondencija', ''))
        
        if doc_type == 1:
            project_code = _s(pragma3_fields.get('pirkimas_projektas', ''))
        else:
            project_code = _s(pragma3_fields.get('pardavimas_projektas', ''))
        
        # Валюта
        currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
        currency_code = "" if currency == "EUR" else currency
        currency_rate = ""
        if currency != "EUR":
            rate = getattr(doc, 'currency_rate', None) or getattr(doc, 'kursas', None)
            if rate:
                currency_rate = _format_decimal(rate, 4)
        
        # Pastaba = preview_url
        note = _s(getattr(doc, 'preview_url', ''))
        
        # Суммы
        amount_with_vat = getattr(doc, 'amount_with_vat', None)
        vat_amount = getattr(doc, 'vat_amount', None)
        amount_wo_vat = getattr(doc, 'amount_wo_vat', None)
        
        total_with_vat = _format_decimal(amount_with_vat)
        vat_sum = _format_decimal(vat_amount)
        total_without_vat = _format_decimal(amount_wo_vat)
        
        # Суммы в валюте
        if currency != "EUR":
            total_with_vat_cur = total_with_vat
            vat_sum_cur = vat_sum
            total_without_vat_cur = total_without_vat
        else:
            total_with_vat_cur = ""
            vat_sum_cur = ""
            total_without_vat_cur = ""
        
        # Доп. расходы: 0 для pirkimai, пусто для pardavimai
        if doc_type == 1:
            transport_cost = "0"
            customs_cost = "0"
            other_cost = "0"
        else:
            transport_cost = ""
            customs_cost = ""
            other_cost = ""
        
        line = _build_line(
            doc_id,                    # 1. Dokumento ID
            doc_type,                  # 2. Dokumento tipas
            1,                         # 3. Grąžinimo dok. požymis (всегда 1)
            _format_date(op_date),     # 4. Dokumento data
            _format_date(inv_date),    # 5. Sąskaitos išrašymo data
            doc_number[:35],           # 6. Dokumento numeris (max 35)
            company_numeric_id,        # 7. Įmonės kodas (числовой ID!)
            "",                        # 8. (rezerv)
            warehouse[:75],            # 9. Sandėlis (max 75)
            schema[:40],               # 10. Sąsk. korespondavimo schema (max 40)
            currency_code[:3],         # 11. Valiutos kodas (max 3)
            currency_rate,             # 12. Valiutos kursas
            note[:250],                # 13. Pastaba (max 250)
            total_with_vat,            # 14. Dok. suma
            total_with_vat_cur,        # 15. Dok. suma valiuta
            vat_sum,                   # 16. PVM suma
            vat_sum_cur,               # 17. PVM suma valiuta
            total_without_vat,         # 18. Prekių suma
            total_without_vat_cur,     # 19. Prekių suma valiuta
            transport_cost,            # 20. Transporto išlaidų suma
            customs_cost,              # 21. Muito išlaidų suma
            other_cost,                # 22. Kitų pridėtinių išlaidų suma
            project_code[:12],         # 23. Projekto kodas (max 12)
            "",                        # 24. FR0564 požymis (пусто)
            _format_date(due_date)     # 25. Vėliausia apmokėjimo data
        )
        
        lines.append(line)
        logger.info("[PRAGMA:DOC] doc_id=%s type=%s company_id=%s", doc_id, doc_type, company_numeric_id)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:DOC] total exported: %d", len(lines))
    return result


# =========================
# ТОВАРЫ ДОКУМЕНТА (Dokumento prekių duomenys)
# =========================

def _export_document_items(documents, doc_type_filter, user, product_id_map):
    lines = []

    pragma3_fields = {}
    if user:
        pragma3_fields = getattr(user, 'pragma3_extra_fields', None) or {}

    # doc_type_filter определён (1=pirkimai, 2=pardavimai)
    if doc_type_filter == 1:
        project_code = _s(pragma3_fields.get('pirkimas_projektas', ''))
    else:
        project_code = _s(pragma3_fields.get('pardavimas_projektas', ''))

    for doc in documents or []:
        doc_id = getattr(doc, 'id', None)
        if not doc_id:
            continue

        doc_type = _detect_document_type(doc)

        if doc_type_filter and doc_type != doc_type_filter:
            continue
        
        currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
        is_foreign_currency = currency != "EUR"
        
        separate_vat = getattr(doc, 'separate_vat', False)
        
        # ====== ИСПРАВЛЕНИЕ: Получаем line_map от резолвера ======
        line_map = getattr(doc, "_pvm_line_map", None)
        
        line_items = getattr(doc, 'line_items', None)
        has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
        if has_items:
            for item in line_items.all():
                product_code = _get_product_code(item, doc)
                product_numeric_id = product_id_map.get(product_code, "")
                
                quantity = _format_decimal(getattr(item, 'quantity', 1))
                price = _format_decimal(getattr(item, 'price', 0))
                vat_percent = _s(getattr(item, 'vat_percent', 0)).replace('%', '').strip()
                vat_sum = _format_decimal(getattr(item, 'vat', 0))
                
                if is_foreign_currency:
                    price_currency = price
                    vat_sum_currency = vat_sum
                else:
                    price_currency = ""
                    vat_sum_currency = ""
                
                # ====== ИСПРАВЛЕНИЕ: Используем helper для PVM кода ======
                pvm_kodas = _get_pvm_kodas_for_item(doc, item, line_map, default="")
                
                line = _build_line(
                    doc_id,                 # 1. Dokumento ID
                    product_numeric_id,     # 2. Prekės kodas (числовой ID!)
                    quantity,               # 3. Kiekis
                    price,                  # 4. Kaina be PVM su nuolaida
                    vat_percent,            # 5. PVM tarifas
                    vat_sum,                # 6. PVM suma
                    "0",                    # 7. Nuolaidos suma
                    "0",                    # 8. Pridėtinės išlaidos
                    price_currency,         # 9. Kaina be PVM valiuta
                    vat_sum_currency,       # 10. PVM suma valiuta
                    "0",                    # 11. Nuolaidos suma valiuta
                    "",                     # 12. Sumos deb. sąskaita
                    "",                     # 13. Sumos kred. sąskaita
                    "",                     # 14. Savikainos deb. sąskaita
                    "",                     # 15. Savikainos kred. sąskaita
                    pvm_kodas[:6],          # 16. PVM kodas i.SAF (max 6) ← ИСПРАВЛЕНО
                    "",                     # 17. Pastaba
                    project_code[:12]       # 18. Projekto kodas (max 12)
                )
                lines.append(line)
            
            logger.info("[PRAGMA:ITEMS] doc_id=%s exported %d line_items", doc_id, line_items.count())
        else:
            product_code = _get_product_code(None, doc)
            product_numeric_id = product_id_map.get(product_code, "")
            
            quantity = "1.00"
            price = _format_decimal(getattr(doc, 'amount_wo_vat', 0))
            
            if separate_vat:
                vat_percent = ""
            else:
                vat_percent = _s(getattr(doc, 'vat_percent', 0)).replace('%', '').strip()
            
            vat_sum = _format_decimal(getattr(doc, 'vat_amount', 0))
            
            if is_foreign_currency:
                price_currency = price
                vat_sum_currency = vat_sum
            else:
                price_currency = ""
                vat_sum_currency = ""
            
            # ====== ИСПРАВЛЕНИЕ: Используем helper для PVM кода документа ======
            pvm_kodas = _get_pvm_kodas_for_doc(doc, default="")
            
            line = _build_line(
                doc_id,                 # 1. Dokumento ID
                product_numeric_id,     # 2. Prekės kodas (числовой ID!)
                quantity,               # 3. Kiekis
                price,                  # 4. Kaina be PVM su nuolaida
                vat_percent,            # 5. PVM tarifas
                vat_sum,                # 6. PVM suma
                "0",                    # 7. Nuolaidos suma
                "0",                    # 8. Pridėtinės išlaidos
                price_currency,         # 9. Kaina be PVM valiuta
                vat_sum_currency,       # 10. PVM suma valiuta
                "0",                    # 11. Nuolaidos suma valiuta
                "",                     # 12. Sumos deb. sąskaita
                "",                     # 13. Sumos kred. sąskaita
                "",                     # 14. Savikainos deb. sąskaita
                "",                     # 15. Savikainos kred. sąskaita
                pvm_kodas[:6],          # 16. PVM kodas i.SAF (max 6) ← ИСПРАВЛЕНО
                "",                     # 17. Pastaba
                project_code[:12]       # 18. Projekto kodas (max 12)
            )
            lines.append(line)
            
            logger.info("[PRAGMA:ITEMS] doc_id=%s exported as single line", doc_id)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:ITEMS] total exported: %d", len(lines))
    return result


# =========================
# ГЛАВНАЯ ФУНКЦИЯ ЭКСПОРТА
# =========================

def export_to_pragma_full(documents, user=None, include_reference_data=True):
    """
    Полный экспорт в формат Pragma 3.2.
    
    Сначала собирает уникальные компании и товары, создаёт числовые ID для связи,
    затем экспортирует все файлы с правильными связями.
    
    Args:
        documents: список документов для экспорта
        user: объект пользователя для получения pragma3_extra_fields
        include_reference_data: если True, добавляются справочники (companies, products)
    
    Returns:
        dict с ключами (4 или 6 файлов):
            - 'pirkimai': документы покупок
            - 'pirkimai_det': позиции покупок
            - 'pardavimai': документы продаж
            - 'pardavimai_det': позиции продаж
            - 'companies': справочник компаний
            - 'products': справочник товаров
    """
    result = {}
    
    if not documents:
        logger.warning("[PRAGMA:EXPORT] no documents to export")
        return result
    
    # 1) Сначала собираем все уникальные коды и создаём маппинги
    company_id_map, product_id_map, company_data_map, product_data_map = _build_id_mappings(documents)
    
    # 2) Проверяем наличие документов каждого типа
    has_pirkimai = any(_detect_document_type(d) == 1 for d in documents)
    has_pardavimai = any(_detect_document_type(d) == 2 for d in documents)
    
    # 3) Экспортируем документы и позиции с использованием маппингов
    if has_pirkimai:
        result['pirkimai'] = _export_documents(documents, doc_type_filter=1, user=user, company_id_map=company_id_map)
        result['pirkimai_det'] = _export_document_items(documents, doc_type_filter=1, user=user, product_id_map=product_id_map)
    
    if has_pardavimai:
        result['pardavimai'] = _export_documents(documents, doc_type_filter=2, user=user, company_id_map=company_id_map)
        result['pardavimai_det'] = _export_document_items(documents, doc_type_filter=2, user=user, product_id_map=product_id_map)
    
    # 4) Экспортируем справочники
    if include_reference_data:
        result['companies'] = _export_companies(company_id_map, company_data_map)
        result['products'] = _export_products(product_id_map, product_data_map)
    
    logger.info("[PRAGMA:EXPORT] completed: pirkimai=%s, pardavimai=%s, companies=%d, products=%d",
                has_pirkimai, has_pardavimai, len(company_id_map), len(product_id_map))
    
    return result


def save_pragma_export_to_files(export_data, base_path='/mnt/user-data/outputs', prefix='pragma'):
    """
    Сохраняет результаты экспорта в файлы.
    """
    files = {}
    
    file_mapping = {
        'pirkimai': f'{prefix}_pirkimai.txt',
        'pirkimai_det': f'{prefix}_pirkimai_det.txt',
        'pardavimai': f'{prefix}_pardavimai.txt',
        'pardavimai_det': f'{prefix}_pardavimai_det.txt',
        'companies': f'{prefix}_Imones.txt',
        'products': f'{prefix}_Prekes.txt',
    }
    
    for key, filename in file_mapping.items():
        content = export_data.get(key)
        if not content:
            continue
        
        filepath = f'{base_path}/{filename}'
        try:
            with open(filepath, 'wb') as f:
                f.write(content)
            files[key] = filepath
            logger.info("[PRAGMA:SAVE] %s -> %s (%d bytes)", key, filepath, len(content))
        except Exception as e:
            logger.error("[PRAGMA:SAVE] error saving %s: %s", key, e)
    
    return files

















# """
# Экспорт документов в формат Pragma 3.2
# Форматы файлов: TXT (Tab-delimited), кодировка Windows-1257
# Поддерживаются покупки (pirkimai) и продажи (pardavimai)
# """
# import logging
# from decimal import Decimal, ROUND_HALF_UP
# from datetime import datetime

# logger = logging.getLogger(__name__)


# # =========================
# # Символы, которых нет в windows-1257 -> замена
# # =========================

# NON_CP1257_MAP = {
#     # Чешские / Словацкие
#     'á': 'a', 'Á': 'A',
#     'ď': 'd', 'Ď': 'D',
#     'ě': 'e', 'Ě': 'E',
#     'í': 'i', 'Í': 'I',
#     'ĺ': 'l', 'Ĺ': 'L',
#     'ľ': 'l', 'Ľ': 'L',
#     'ň': 'n', 'Ň': 'N',
#     'ř': 'r', 'Ř': 'R',
#     'ť': 't', 'Ť': 'T',
#     'ú': 'u', 'Ú': 'U',
#     'ů': 'u', 'Ů': 'U',
#     'ý': 'y', 'Ý': 'Y',

#     # Венгерские
#     'ő': 'o', 'Ő': 'O',
#     'ű': 'u', 'Ű': 'U',

#     # Румынские
#     'ă': 'a', 'Ă': 'A',
#     'â': 'a', 'Â': 'A',
#     'î': 'i', 'Î': 'I',
#     'ș': 's', 'Ș': 'S',
#     'ț': 't', 'Ț': 'T',

#     # Хорватский
#     'đ': 'd', 'Đ': 'D',

#     # Французский
#     'à': 'a', 'À': 'A',
#     'ç': 'c', 'Ç': 'C',
#     'è': 'e', 'È': 'E',
#     'ê': 'e', 'Ê': 'E',
#     'ë': 'e', 'Ë': 'E',
#     'ï': 'i', 'Ï': 'I',
#     'ô': 'o', 'Ô': 'O',
#     'œ': 'oe', 'Œ': 'OE',
#     'ù': 'u', 'Ù': 'U',
#     'û': 'u', 'Û': 'U',
#     'ÿ': 'y', 'Ÿ': 'Y',

#     # Испанский
#     'ñ': 'n', 'Ñ': 'N',
#     '¿': '?', '¡': '!',

#     # Португальский
#     'ã': 'a', 'Ã': 'A',

#     # Итальянский
#     'ì': 'i', 'Ì': 'I',
#     'ò': 'o', 'Ò': 'O',

#     # Турецкий
#     'ğ': 'g', 'Ğ': 'G',
#     'ı': 'i',
#     'ş': 's', 'Ş': 'S',
#     'İ': 'I',

#     # Редкие латинские с диакритиками
#     'ȳ': 'y', 'Ȳ': 'Y',
#     'ḩ': 'h', 'Ḩ': 'H',
#     'ƶ': 'z', 'Ƶ': 'Z',
#     'ɇ': 'e', 'Ɇ': 'E',

#     # Исландские
#     'þ': 'th', 'Þ': 'Th',
#     'ð': 'd',  'Ð': 'D',

#     # Вьетнамские
#     'ơ': 'o', 'Ơ': 'O',
#     'ư': 'u', 'Ư': 'U',

#     # Немецкая заглавная ß
#     'ẞ': 'SS',
# }


# def _normalize_for_cp1257(value):
#     """
#     Нормализует строку для кодировки windows-1257:
#     - заменяет символы из NON_CP1257_MAP
#     - кириллицу заменяет на '?'
#     - остальные некодируемые символы заменяет на '?'
#     """
#     if value is None:
#         return ""

#     s = str(value)

#     # Сначала прогоняем через маппинг нестандартных латинских букв
#     s = "".join(NON_CP1257_MAP.get(ch, ch) for ch in s)

#     result_chars = []
#     for ch in s:
#         code = ord(ch)

#         # Кириллица -> '?'
#         if 0x0400 <= code <= 0x04FF or 0x0500 <= code <= 0x052F:
#             result_chars.append('?')
#             continue

#         # Пробуем закодировать в cp1257
#         try:
#             ch.encode("cp1257")
#             result_chars.append(ch)
#         except UnicodeEncodeError:
#             # Экзотический символ (эмодзи, азиатский и т.п.)
#             result_chars.append('?')

#     return "".join(result_chars)


# # =========================
# # Helpers
# # =========================

# def _safe_D(x):
#     """Безопасное преобразование в Decimal."""
#     try:
#         return Decimal(str(x))
#     except Exception:
#         return Decimal("0")


# def _s(v):
#     """Безопасная строка с strip()."""
#     return str(v).strip() if v is not None else ""


# def _format_date(date_obj):
#     """Форматирование даты в YYYY.MM.DD для Pragma 3.2."""
#     if not date_obj:
#         return ""
#     if isinstance(date_obj, str):
#         try:
#             date_obj = datetime.strptime(date_obj, "%Y-%m-%d").date()
#         except ValueError:
#             return ""
#     return date_obj.strftime("%Y.%m.%d")


# def _format_decimal(value, decimals=2):
#     """Форматирование Decimal."""
#     if value is None:
#         return ""
#     d = _safe_D(value)
#     quantizer = Decimal("0." + "0" * decimals) if decimals > 0 else Decimal("1")
#     d = d.quantize(quantizer, rounding=ROUND_HALF_UP)
#     return str(d)


# def _escape_csv(value):
#     """Очистка значений для CSV — убираем кавычки и спецсимволы, нормализуем для cp1257."""
#     s = _s(value)
#     # Нормализуем для windows-1257
#     s = _normalize_for_cp1257(s)
#     # Убираем кавычки
#     s = s.replace('"', '').replace("'", '')
#     # Заменяем табуляцию и переводы строк на пробелы
#     s = s.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')
#     return s


# def _build_line(*fields):
#     """Построение строки CSV с табуляцией как разделителем."""
#     line = '\t'.join(_escape_csv(f) for f in fields) + '\r\n'
#     return line.encode('windows-1257', errors='replace')


# def _get_preke_paslauga(value) -> str:
#     """
#     Преобразует preke_paslauga в формат Pragma:
#     1, 3 -> "0" (prekė/товар)
#     2, 4 -> "1" (paslauga/услуга)
#     """
#     try:
#         v = int(value)
#         if v in (1, 3):
#             return "0"
#         elif v in (2, 4):
#             return "1"
#     except (ValueError, TypeError):
#         pass
#     return "0"


# # =========================
# # Определение типа документа
# # =========================

# def _detect_document_type(doc):
#     """
#     Определяет тип документа:
#     1 - pajamavimas (покупка/pirkimas)
#     2 - išlaidavimas (продажа/pardavimas)
#     """
#     doc_type_str = (_s(getattr(doc, 'pirkimas_pardavimas', ''))).lower()
    
#     if doc_type_str == 'pirkimas':
#         doc_type = 1
#     elif doc_type_str == 'pardavimas':
#         doc_type = 2
#     else:
#         if _s(getattr(doc, 'seller_id', '')) or _s(getattr(doc, 'seller_vat_code', '')):
#             doc_type = 1
#         elif _s(getattr(doc, 'buyer_id', '')) or _s(getattr(doc, 'buyer_vat_code', '')):
#             doc_type = 2
#         else:
#             doc_type = 2
#             logger.warning("[PRAGMA:TYPE] doc=%s cannot determine type, defaulting to pardavimas",
#                           getattr(doc, "id", None))
    
#     return doc_type


# def _get_company_code(doc, doc_type):
#     """
#     Получает код компании.
#     Приоритет: *_id -> *_vat_code -> *_id_programoje
#     """
#     if doc_type == 1:  # pirkimas - seller
#         code = (
#             _s(getattr(doc, 'seller_id', ''))
#             or _s(getattr(doc, 'seller_vat_code', ''))
#             or _s(getattr(doc, 'seller_id_programoje', ''))
#         )
#     else:  # pardavimas - buyer
#         code = (
#             _s(getattr(doc, 'buyer_id', ''))
#             or _s(getattr(doc, 'buyer_vat_code', ''))
#             or _s(getattr(doc, 'buyer_id_programoje', ''))
#         )
#     return code


# def _get_product_code(item=None, doc=None):
#     """
#     Получает код товара.
#     Приоритет: item.prekes_kodas -> item.prekes_barkodas -> doc.prekes_kodas -> doc.prekes_barkodas -> PREKE001
#     """
#     if item:
#         code = _s(getattr(item, 'prekes_kodas', '')) or _s(getattr(item, 'prekes_barkodas', ''))
#         if code:
#             return code
#     if doc:
#         code = _s(getattr(doc, 'prekes_kodas', '')) or _s(getattr(doc, 'prekes_barkodas', ''))
#         if code:
#             return code
#     return "PREKE001"


# def _get_document_number(doc) -> str:
#     """Формирует номер документа из series и number."""
#     series = _s(getattr(doc, "document_series", "")).replace(" ", "")
#     number = _s(getattr(doc, "document_number", "")).replace(" ", "")

#     if series and number:
#         while number.startswith(series) and series:
#             number = number[len(series):]
#         return f"{series}{number}"

#     return number or ""


# # =========================
# # Сбор уникальных кодов и создание маппингов
# # =========================

# def _build_id_mappings(documents):
#     """
#     Проходит по всем документам и собирает уникальные коды компаний и товаров.
#     Возвращает (company_id_map, product_id_map, company_data_map, product_data_map)
    
#     company_id_map: {code: numeric_id}
#     product_id_map: {code: numeric_id}
#     company_data_map: {code: {name, address, vat, ...}}
#     product_data_map: {code: {name, unit, is_service}}
#     """
#     company_data_map = {}  # code -> данные компании
#     product_data_map = {}  # code -> данные товара
    
#     for doc in documents or []:
#         doc_type = _detect_document_type(doc)
        
#         # === Компания ===
#         if doc_type == 1:
#             prefix = 'seller_'
#         else:
#             prefix = 'buyer_'
        
#         company_code = (
#             _s(getattr(doc, f'{prefix}id', ''))
#             or _s(getattr(doc, f'{prefix}vat_code', ''))
#             or _s(getattr(doc, f'{prefix}id_programoje', ''))
#         )
        
#         if company_code and company_code not in company_data_map:
#             company_data_map[company_code] = {
#                 'code': company_code,
#                 'name': _s(getattr(doc, f'{prefix}name', '')) or 'Nežinoma',
#                 'address': _s(getattr(doc, f'{prefix}address', '')),
#                 'vat_code': _s(getattr(doc, f'{prefix}vat_code', '')),
#                 'iban': _s(getattr(doc, f'{prefix}iban', '')),
#                 'country': _s(getattr(doc, f'{prefix}country_iso', '')).upper(),
#                 'phone': _s(getattr(doc, f'{prefix}phone', '')),
#                 'contact': _s(getattr(doc, f'{prefix}contact', '')),
#                 'email': _s(getattr(doc, f'{prefix}email', '')),
#                 'is_person': "1" if getattr(doc, f'{prefix}is_person', False) else "0",
#             }
        
#         # === Товары ===
#         line_items = getattr(doc, 'line_items', None)
#         has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
#         if has_items:
#             for item in line_items.all():
#                 product_code = _get_product_code(item, doc)
#                 if product_code not in product_data_map:
#                     name = (
#                         _s(getattr(item, 'prekes_pavadinimas', ''))
#                         or _s(getattr(doc, 'prekes_pavadinimas', ''))
#                         or 'Prekė'
#                     )
#                     unit = _s(getattr(item, 'unit', '')) or _s(getattr(doc, 'unit', '')) or 'vnt.'
#                     preke_paslauga = getattr(item, 'preke_paslauga', None) or getattr(doc, 'preke_paslauga', None)
                    
#                     product_data_map[product_code] = {
#                         'code': product_code,
#                         'name': name,
#                         'unit': unit,
#                         'is_service': _get_preke_paslauga(preke_paslauga),
#                     }
#         else:
#             product_code = _get_product_code(None, doc)
#             if product_code not in product_data_map:
#                 name = _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
#                 unit = _s(getattr(doc, 'unit', '')) or 'vnt.'
#                 preke_paslauga = getattr(doc, 'preke_paslauga', None)
                
#                 product_data_map[product_code] = {
#                     'code': product_code,
#                     'name': name,
#                     'unit': unit,
#                     'is_service': _get_preke_paslauga(preke_paslauga),
#                 }
    
#     # Создаём числовые ID (начиная с 1)
#     company_id_map = {code: idx + 1 for idx, code in enumerate(sorted(company_data_map.keys()))}
#     product_id_map = {code: idx + 1 for idx, code in enumerate(sorted(product_data_map.keys()))}
    
#     logger.info("[PRAGMA:MAPPING] companies=%d, products=%d", len(company_id_map), len(product_id_map))
    
#     return company_id_map, product_id_map, company_data_map, product_data_map


# # =========================
# # КОМПАНИИ (Įmonių duomenys)
# # =========================

# def _export_companies(company_id_map, company_data_map):
#     """
#     Экспорт компаний в формат Pragma 3.2.
    
#     Поля:
#     1. Įmonės ID - числовой ID для связи
#     2. Trumpas įmonės pavadinimas - code (до 20 симв., уникальный)
#     3. Įmonės kodas - code
#     4-13. остальные поля
#     """
#     lines = []
    
#     for code, numeric_id in sorted(company_id_map.items(), key=lambda x: x[1]):
#         data = company_data_map[code]
        
#         line = _build_line(
#             numeric_id,             # 1. Įmonės ID (числовой!)
#             code[:20],              # 2. Trumpas įmonės pavadinimas (max 20)
#             code[:20],              # 3. Įmonės kodas (max 20)
#             data['name'][:75],      # 4. Pavadinimas (max 75)
#             data['address'][:100],  # 5. Adresas (max 100)
#             data['vat_code'][:250], # 6. PVM mokėtojo kodas (max 250)
#             "",                     # 7. Banko kodas
#             data['iban'][:40],      # 8. Atsiskaitomoji sąskaita (max 40)
#             data['country'][:2],    # 9. Šalies kodas (max 2)
#             data['phone'][:40],     # 10. Telefonas (max 40)
#             data['contact'][:255],  # 11. Kontaktinis asmuo (max 255)
#             data['email'][:100],    # 12. E-mail (max 100)
#             data['is_person']       # 13. Įmonės tipas
#         )
        
#         lines.append(line)
#         logger.info("[PRAGMA:COMPANY] id=%d code=%s", numeric_id, code)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:COMPANY] total exported: %d", len(lines))
#     return result


# # =========================
# # ТОВАРЫ (Prekių duomenys)
# # =========================

# def _export_products(product_id_map, product_data_map):
#     """
#     Экспорт товаров в формат Pragma 3.2.
    
#     Поля:
#     1. Prekės ID - числовой ID для связи
#     2. Prekės kodas (Nom.Nr.) - code (max 15)
#     3-9. остальные поля
#     """
#     lines = []
    
#     for code, numeric_id in sorted(product_id_map.items(), key=lambda x: x[1]):
#         data = product_data_map[code]
        
#         line = _build_line(
#             numeric_id,             # 1. Prekės ID (числовой!)
#             code[:15],              # 2. Prekės kodas (max 15)
#             data['name'][:50],      # 3. Pavadinimas (max 50)
#             data['unit'][:5],       # 4. Mato vienetas (max 5)
#             data['is_service'],     # 5. Prekė ar paslauga
#             "",                     # 6. Muitinės kodas
#             "",                     # 7. Svoris
#             "",                     # 8. Kiekis įpakavime
#             ""                      # 9. Įpakavimo rūšis
#         )
        
#         lines.append(line)
#         logger.info("[PRAGMA:PRODUCT] id=%d code=%s", numeric_id, code)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:PRODUCT] total exported: %d", len(lines))
#     return result


# # =========================
# # ДОКУМЕНТЫ (Dokumento duomenys)
# # =========================

# def _export_documents(documents, doc_type_filter, user, company_id_map):
#     """
#     Экспорт документов в формат Pragma 3.2.
#     """
#     lines = []
    
#     pragma3_fields = {}
#     if user:
#         pragma3_fields = getattr(user, 'pragma3_extra_fields', None) or {}
    
#     for doc in documents or []:
#         doc_id = getattr(doc, 'id', None)
#         if not doc_id:
#             continue
        
#         doc_type = _detect_document_type(doc)
        
#         if doc_type_filter and doc_type != doc_type_filter:
#             continue
        
#         # Даты
#         op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
#         inv_date = getattr(doc, 'invoice_date', None)
#         due_date = getattr(doc, 'due_date', None)
        
#         # Номер документа
#         doc_number = _get_document_number(doc)
        
#         # Код компании -> числовой ID
#         company_code = _get_company_code(doc, doc_type)
#         company_numeric_id = company_id_map.get(company_code, "")
        
#         # Sandėlis и Korespondencija из user.pragma3_extra_fields
#         if doc_type == 1:
#             warehouse = _s(pragma3_fields.get('pirkimas_sandelis', ''))
#             schema = _s(pragma3_fields.get('pirkimas_korespondencija', ''))
#         else:
#             warehouse = _s(pragma3_fields.get('pardavimas_sandelis', ''))
#             schema = _s(pragma3_fields.get('pardavimas_korespondencija', ''))
        
#         if doc_type == 1:
#             project_code = _s(pragma3_fields.get('pirkimas_projektas', ''))
#         else:
#             project_code = _s(pragma3_fields.get('pardavimas_projektas', ''))
        
#         # Валюта
#         currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
#         currency_code = "" if currency == "EUR" else currency
#         currency_rate = ""
#         if currency != "EUR":
#             rate = getattr(doc, 'currency_rate', None) or getattr(doc, 'kursas', None)
#             if rate:
#                 currency_rate = _format_decimal(rate, 4)
        
#         # Pastaba = preview_url
#         note = _s(getattr(doc, 'preview_url', ''))
        
#         # Суммы
#         amount_with_vat = getattr(doc, 'amount_with_vat', None)
#         vat_amount = getattr(doc, 'vat_amount', None)
#         amount_wo_vat = getattr(doc, 'amount_wo_vat', None)
        
#         total_with_vat = _format_decimal(amount_with_vat)
#         vat_sum = _format_decimal(vat_amount)
#         total_without_vat = _format_decimal(amount_wo_vat)
        
#         # Суммы в валюте
#         if currency != "EUR":
#             total_with_vat_cur = total_with_vat
#             vat_sum_cur = vat_sum
#             total_without_vat_cur = total_without_vat
#         else:
#             total_with_vat_cur = ""
#             vat_sum_cur = ""
#             total_without_vat_cur = ""
        
#         # Доп. расходы: 0 для pirkimai, пусто для pardavimai
#         if doc_type == 1:
#             transport_cost = "0"
#             customs_cost = "0"
#             other_cost = "0"
#         else:
#             transport_cost = ""
#             customs_cost = ""
#             other_cost = ""
        
#         line = _build_line(
#             doc_id,                    # 1. Dokumento ID
#             doc_type,                  # 2. Dokumento tipas
#             1,                         # 3. Grąžinimo dok. požymis (всегда 1)
#             _format_date(op_date),     # 4. Dokumento data
#             _format_date(inv_date),    # 5. Sąskaitos išrašymo data
#             doc_number[:35],           # 6. Dokumento numeris (max 35)
#             company_numeric_id,        # 7. Įmonės kodas (числовой ID!)
#             "",                        # 8. (rezerv)
#             warehouse[:75],            # 9. Sandėlis (max 75)
#             schema[:40],               # 10. Sąsk. korespondavimo schema (max 40)
#             currency_code[:3],         # 11. Valiutos kodas (max 3)
#             currency_rate,             # 12. Valiutos kursas
#             note[:250],                # 13. Pastaba (max 250)
#             total_with_vat,            # 14. Dok. suma
#             total_with_vat_cur,        # 15. Dok. suma valiuta
#             vat_sum,                   # 16. PVM suma
#             vat_sum_cur,               # 17. PVM suma valiuta
#             total_without_vat,         # 18. Prekių suma
#             total_without_vat_cur,     # 19. Prekių suma valiuta
#             transport_cost,            # 20. Transporto išlaidų suma
#             customs_cost,              # 21. Muito išlaidų suma
#             other_cost,                # 22. Kitų pridėtinių išlaidų suma
#             project_code[:12],         # 23. Projekto kodas (max 12)
#             "",                        # 24. FR0564 požymis (пусто)
#             _format_date(due_date)     # 25. Vėliausia apmokėjimo data
#         )
        
#         lines.append(line)
#         logger.info("[PRAGMA:DOC] doc_id=%s type=%s company_id=%s", doc_id, doc_type, company_numeric_id)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:DOC] total exported: %d", len(lines))
#     return result


# # =========================
# # ТОВАРЫ ДОКУМЕНТА (Dokumento prekių duomenys)
# # =========================

# def _export_document_items(documents, doc_type_filter, user, product_id_map):
#     lines = []

#     pragma3_fields = {}
#     if user:
#         pragma3_fields = getattr(user, 'pragma3_extra_fields', None) or {}

#     # ✅ doc_type_filter определён (1=pirkimai, 2=pardavimai)
#     if doc_type_filter == 1:
#         project_code = _s(pragma3_fields.get('pirkimas_projektas', ''))
#     else:
#         project_code = _s(pragma3_fields.get('pardavimas_projektas', ''))

#     for doc in documents or []:
#         doc_id = getattr(doc, 'id', None)
#         if not doc_id:
#             continue

#         doc_type = _detect_document_type(doc)

#         if doc_type_filter and doc_type != doc_type_filter:
#             continue
        
#         currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
#         is_foreign_currency = currency != "EUR"
        
#         pvm_kodas = _s(getattr(doc, 'pvm_kodas', ''))
#         separate_vat = getattr(doc, 'separate_vat', False)
        
#         line_items = getattr(doc, 'line_items', None)
#         has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
#         if has_items:
#             for item in line_items.all():
#                 product_code = _get_product_code(item, doc)
#                 product_numeric_id = product_id_map.get(product_code, "")
                
#                 quantity = _format_decimal(getattr(item, 'quantity', 1))
#                 price = _format_decimal(getattr(item, 'price', 0))
#                 vat_percent = _s(getattr(item, 'vat_percent', 0)).replace('%', '').strip()
#                 vat_sum = _format_decimal(getattr(item, 'vat', 0))
                
#                 if is_foreign_currency:
#                     price_currency = price
#                     vat_sum_currency = vat_sum
#                 else:
#                     price_currency = ""
#                     vat_sum_currency = ""
                
#                 line = _build_line(
#                     doc_id,                 # 1. Dokumento ID
#                     product_numeric_id,     # 2. Prekės kodas (числовой ID!)
#                     quantity,               # 3. Kiekis
#                     price,                  # 4. Kaina be PVM su nuolaida
#                     vat_percent,            # 5. PVM tarifas
#                     vat_sum,                # 6. PVM suma
#                     "0",                    # 7. Nuolaidos suma
#                     "0",                    # 8. Pridėtinės išlaidos
#                     price_currency,         # 9. Kaina be PVM valiuta
#                     vat_sum_currency,       # 10. PVM suma valiuta
#                     "0",                    # 11. Nuolaidos suma valiuta
#                     "",                     # 12. Sumos deb. sąskaita
#                     "",                     # 13. Sumos kred. sąskaita
#                     "",                     # 14. Savikainos deb. sąskaita
#                     "",                     # 15. Savikainos kred. sąskaita
#                     pvm_kodas[:6],          # 16. PVM kodas i.SAF (max 6)
#                     "",                     # 17. Pastaba
#                     project_code[:12]       # 18. Projekto kodas (max 12)
#                 )
#                 lines.append(line)
            
#             logger.info("[PRAGMA:ITEMS] doc_id=%s exported %d line_items", doc_id, line_items.count())
#         else:
#             product_code = _get_product_code(None, doc)
#             product_numeric_id = product_id_map.get(product_code, "")
            
#             quantity = "1.00"
#             price = _format_decimal(getattr(doc, 'amount_wo_vat', 0))
            
#             if separate_vat:
#                 vat_percent = ""
#             else:
#                 vat_percent = _s(getattr(doc, 'vat_percent', 0)).replace('%', '').strip()
            
#             vat_sum = _format_decimal(getattr(doc, 'vat_amount', 0))
            
#             if is_foreign_currency:
#                 price_currency = price
#                 vat_sum_currency = vat_sum
#             else:
#                 price_currency = ""
#                 vat_sum_currency = ""
            
#             line = _build_line(
#                 doc_id,                 # 1. Dokumento ID
#                 product_numeric_id,     # 2. Prekės kodas (числовой ID!)
#                 quantity,               # 3. Kiekis
#                 price,                  # 4. Kaina be PVM su nuolaida
#                 vat_percent,            # 5. PVM tarifas
#                 vat_sum,                # 6. PVM suma
#                 "0",                    # 7. Nuolaidos suma
#                 "0",                    # 8. Pridėtinės išlaidos
#                 price_currency,         # 9. Kaina be PVM valiuta
#                 vat_sum_currency,       # 10. PVM suma valiuta
#                 "0",                    # 11. Nuolaidos suma valiuta
#                 "",                     # 12. Sumos deb. sąskaita
#                 "",                     # 13. Sumos kred. sąskaita
#                 "",                     # 14. Savikainos deb. sąskaita
#                 "",                     # 15. Savikainos kred. sąskaita
#                 pvm_kodas[:6],          # 16. PVM kodas i.SAF (max 6)
#                 "",                     # 17. Pastaba
#                 project_code[:12]       # 18. Projekto kodas (max 12)
#             )
#             lines.append(line)
            
#             logger.info("[PRAGMA:ITEMS] doc_id=%s exported as single line", doc_id)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:ITEMS] total exported: %d", len(lines))
#     return result


# # =========================
# # ГЛАВНАЯ ФУНКЦИЯ ЭКСПОРТА
# # =========================

# def export_to_pragma_full(documents, user=None, include_reference_data=True):
#     """
#     Полный экспорт в формат Pragma 3.2.
    
#     Сначала собирает уникальные компании и товары, создаёт числовые ID для связи,
#     затем экспортирует все файлы с правильными связями.
    
#     Args:
#         documents: список документов для экспорта
#         user: объект пользователя для получения pragma3_extra_fields
#         include_reference_data: если True, добавляются справочники (companies, products)
    
#     Returns:
#         dict с ключами (4 или 6 файлов):
#             - 'pirkimai': документы покупок
#             - 'pirkimai_det': позиции покупок
#             - 'pardavimai': документы продаж
#             - 'pardavimai_det': позиции продаж
#             - 'companies': справочник компаний
#             - 'products': справочник товаров
#     """
#     result = {}
    
#     if not documents:
#         logger.warning("[PRAGMA:EXPORT] no documents to export")
#         return result
    
#     # 1) Сначала собираем все уникальные коды и создаём маппинги
#     company_id_map, product_id_map, company_data_map, product_data_map = _build_id_mappings(documents)
    
#     # 2) Проверяем наличие документов каждого типа
#     has_pirkimai = any(_detect_document_type(d) == 1 for d in documents)
#     has_pardavimai = any(_detect_document_type(d) == 2 for d in documents)
    
#     # 3) Экспортируем документы и позиции с использованием маппингов
#     if has_pirkimai:
#         result['pirkimai'] = _export_documents(documents, doc_type_filter=1, user=user, company_id_map=company_id_map)
#         result['pirkimai_det'] = _export_document_items(documents, doc_type_filter=1, user=user, product_id_map=product_id_map)
    
#     if has_pardavimai:
#         result['pardavimai'] = _export_documents(documents, doc_type_filter=2, user=user, company_id_map=company_id_map)
#         result['pardavimai_det'] = _export_document_items(documents, doc_type_filter=2, user=user, product_id_map=product_id_map)
    
#     # 4) Экспортируем справочники
#     if include_reference_data:
#         result['companies'] = _export_companies(company_id_map, company_data_map)
#         result['products'] = _export_products(product_id_map, product_data_map)
    
#     logger.info("[PRAGMA:EXPORT] completed: pirkimai=%s, pardavimai=%s, companies=%d, products=%d",
#                 has_pirkimai, has_pardavimai, len(company_id_map), len(product_id_map))
    
#     return result


# def save_pragma_export_to_files(export_data, base_path='/mnt/user-data/outputs', prefix='pragma'):
#     """
#     Сохраняет результаты экспорта в файлы.
#     """
#     files = {}
    
#     file_mapping = {
#         'pirkimai': f'{prefix}_pirkimai.txt',
#         'pirkimai_det': f'{prefix}_pirkimai_det.txt',
#         'pardavimai': f'{prefix}_pardavimai.txt',
#         'pardavimai_det': f'{prefix}_pardavimai_det.txt',
#         'companies': f'{prefix}_Imones.txt',
#         'products': f'{prefix}_Prekes.txt',
#     }
    
#     for key, filename in file_mapping.items():
#         content = export_data.get(key)
#         if not content:
#             continue
        
#         filepath = f'{base_path}/{filename}'
#         try:
#             with open(filepath, 'wb') as f:
#                 f.write(content)
#             files[key] = filepath
#             logger.info("[PRAGMA:SAVE] %s -> %s (%d bytes)", key, filepath, len(content))
#         except Exception as e:
#             logger.error("[PRAGMA:SAVE] error saving %s: %s", key, e)
    
#     return files
