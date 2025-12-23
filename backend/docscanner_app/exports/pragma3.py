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

    # ✅ doc_type_filter определён (1=pirkimai, 2=pardavimai)
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
        
        pvm_kodas = _s(getattr(doc, 'pvm_kodas', ''))
        separate_vat = getattr(doc, 'separate_vat', False)
        
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
                    pvm_kodas[:6],          # 16. PVM kodas i.SAF (max 6)
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
                pvm_kodas[:6],          # 16. PVM kodas i.SAF (max 6)
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


# def smart_str(s, encoding='utf-8', errors='strict'):
#     """Простая замена django.utils.encoding.smart_str."""
#     if isinstance(s, bytes):
#         return s.decode(encoding, errors)
#     return str(s) if s is not None else ''


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
#     """Очистка значений для CSV — убираем кавычки и спецсимволы."""
#     s = _s(value)
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
#     return "0"  # По умолчанию товар


# # =========================
# # Определение типа документа
# # =========================

# def _detect_document_type(doc):
#     """
#     Определяет тип документа:
#     1 - pajamavimas (покупка/pirkimas)
#     2 - išlaidavimas (продажа/pardavimas)
    
#     Возвращает (doc_type, return_flag)
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
#                           getattr(doc, "pk", None))
    
#     is_return = getattr(doc, 'is_return', False) or getattr(doc, 'grazinimas', False)
#     return_flag = 0 if is_return else 1
    
#     return doc_type, return_flag


# def _get_company_code(doc, doc_type):
#     """
#     Получает код компании для связи с Imones.txt.
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
#     Получает код товара для связи с Prekes.txt.
#     Приоритет: prekes_kodas -> prekes_barkodas -> PREKE001
#     """
#     code = ""
#     if item:
#         code = _s(getattr(item, 'prekes_kodas', '')) or _s(getattr(item, 'prekes_barkodas', ''))
#     if not code and doc:
#         code = _s(getattr(doc, 'prekes_kodas', '')) or _s(getattr(doc, 'prekes_barkodas', ''))
#     return code or "PREKE001"


# # =========================
# # КОМПАНИИ (Įmonių duomenys)
# # =========================

# def export_companies_to_pragma(documents):
#     """
#     Экспорт компаний в формат Pragma 3.2.
#     Собирает и seller (из pirkimai) и buyer (из pardavimai) в один файл.
    
#     Поля:
#     1. Įmonės ID - code (для связи)
#     2. Trumpas įmonės pavadinimas - code (до 20 симв., уникальный)
#     3. Įmonės kodas - code
#     4. Pavadinimas - название
#     5. Adresas - адрес
#     6. PVM mokėtojo kodas - VAT код
#     7. Banko kodas - (пусто)
#     8. Atsiskaitomoji sąskaita - IBAN
#     9. Šalies kodas - ISO код страны
#     10. Telefonas - телефон
#     11. Kontaktinis asmuo - контакт
#     12. E-mail - email
#     13. Įmonės tipas - 0=юр.лицо, 1=физ.лицо
#     """
#     lines = []
#     seen_codes = set()
    
#     for doc in documents or []:
#         doc_type, _ = _detect_document_type(doc)
        
#         # Определяем префикс полей
#         if doc_type == 1:  # pirkimas - берём seller
#             prefix = 'seller_'
#         else:  # pardavimas - берём buyer
#             prefix = 'buyer_'
        
#         # Получаем code
#         code = (
#             _s(getattr(doc, f'{prefix}id', ''))
#             or _s(getattr(doc, f'{prefix}vat_code', ''))
#             or _s(getattr(doc, f'{prefix}id_programoje', ''))
#         )
        
#         if not code or code in seen_codes:
#             continue
        
#         seen_codes.add(code)
        
#         # Собираем данные и обрезаем под max длину
#         name = _s(getattr(doc, f'{prefix}name', '')) or 'Nežinoma'
#         address = _s(getattr(doc, f'{prefix}address', ''))
#         vat_code = _s(getattr(doc, f'{prefix}vat_code', ''))
#         iban = _s(getattr(doc, f'{prefix}iban', ''))
#         country = _s(getattr(doc, f'{prefix}country_iso', '')).upper()
#         phone = _s(getattr(doc, f'{prefix}phone', ''))
#         contact = _s(getattr(doc, f'{prefix}contact', ''))
#         email = _s(getattr(doc, f'{prefix}email', ''))
#         is_person = "1" if getattr(doc, f'{prefix}is_person', False) else "0"
        
#         line = _build_line(
#             code[:20],      # 1. Įmonės ID (max 20)
#             code[:20],      # 2. Trumpas įmonės pavadinimas (max 20)
#             code[:20],      # 3. Įmonės kodas (max 20)
#             name[:75],      # 4. Pavadinimas (max 75)
#             address[:100],  # 5. Adresas (max 100)
#             vat_code[:250], # 6. PVM mokėtojo kodas (max 250)
#             "",             # 7. Banko kodas
#             iban[:40],      # 8. Atsiskaitomoji sąskaita (max 40)
#             country[:2],    # 9. Šalies kodas (max 2)
#             phone[:40],     # 10. Telefonas (max 40)
#             contact[:255],  # 11. Kontaktinis asmuo (max 255)
#             email[:100],    # 12. E-mail (max 100)
#             is_person       # 13. Įmonės tipas
#         )
        
#         lines.append(line)
#         logger.info("[PRAGMA:COMPANY] exported code=%s name=%s", code, name)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:COMPANY] total companies exported: %d", len(lines))
#     return result


# # =========================
# # ТОВАРЫ (Prekių duomenys)
# # =========================

# def export_products_to_pragma(documents):
#     """
#     Экспорт товаров в формат Pragma 3.2.
#     Собирает товары из всех документов (и pirkimai и pardavimai).
    
#     Поля:
#     1. Prekės ID - code (для связи)
#     2. Prekės kodas (Nom.Nr.) - code (уникальный, max 15)
#     3. Pavadinimas - название (max 50)
#     4. Mato vienetas - единица измерения (max 5)
#     5. Prekė ar paslauga - 0=товар, 1=услуга
#     6. Muitinės kodas - (пусто)
#     7. Svoris - (пусто)
#     8. Kiekis įpakavime - (пусто)
#     9. Įpakavimo rūšis - (пусто)
#     """
#     lines = []
#     seen_codes = set()
    
#     for doc in documents or []:
#         line_items = getattr(doc, 'line_items', None)
#         has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
#         if has_items:
#             for item in line_items.all():
#                 _add_product_line(lines, seen_codes, item, doc)
#         else:
#             _add_product_line(lines, seen_codes, None, doc)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:PRODUCT] total products exported: %d", len(lines))
#     return result


# def _add_product_line(lines, seen_codes, item, doc):
#     """Добавляет строку товара если код ещё не был добавлен."""
#     code = _get_product_code(item, doc)
    
#     if code in seen_codes:
#         return
    
#     seen_codes.add(code)
    
#     # Название
#     if item:
#         name = _s(getattr(item, 'prekes_pavadinimas', ''))
#     else:
#         name = ""
#     if not name:
#         name = _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
    
#     # Единица измерения
#     if item:
#         unit = _s(getattr(item, 'unit', ''))
#     else:
#         unit = ""
#     if not unit:
#         unit = _s(getattr(doc, 'unit', '')) or 'vnt.'
    
#     # Тип: товар/услуга
#     if item:
#         preke_paslauga = getattr(item, 'preke_paslauga', None)
#     else:
#         preke_paslauga = None
#     if preke_paslauga is None:
#         preke_paslauga = getattr(doc, 'preke_paslauga', None)
#     is_service = _get_preke_paslauga(preke_paslauga)
    
#     line = _build_line(
#         code[:15],      # 1. Prekės ID (max 15)
#         code[:15],      # 2. Prekės kodas (max 15)
#         name[:50],      # 3. Pavadinimas (max 50)
#         unit[:5],       # 4. Mato vienetas (max 5)
#         is_service,     # 5. Prekė ar paslauga
#         "",             # 6. Muitinės kodas
#         "",             # 7. Svoris
#         "",             # 8. Kiekis įpakavime
#         ""              # 9. Įpakavimo rūšis
#     )
    
#     lines.append(line)
#     logger.info("[PRAGMA:PRODUCT] exported code=%s name=%s", code, name[:50])


# # =========================
# # ДОКУМЕНТЫ (Dokumento duomenys)
# # =========================

# def _get_document_number(doc) -> str:
#     """
#     Формирует номер документа из series и number.
#     """
#     series = _s(getattr(doc, "document_series", ""))
#     number = _s(getattr(doc, "document_number", ""))

#     series_clean = series.replace(" ", "")
#     number_clean = number.replace(" ", "")

#     if series_clean and number_clean:
#         # Убираем дублирование серии из начала номера
#         while number_clean.startswith(series_clean) and series_clean:
#             number_clean = number_clean[len(series_clean):]
#         return f"{series_clean}{number_clean}"

#     if number_clean:
#         return number_clean

#     return ""


# def export_documents_to_pragma(documents, doc_type_filter=None, user=None):
#     """
#     Экспорт документов в формат Pragma 3.2.
    
#     Args:
#         documents: список документов
#         doc_type_filter: 1=только pirkimai, 2=только pardavimai, None=все
#         user: объект пользователя для получения pragma3_extra_fields
    
#     Поля:
#     1. Dokumento ID - id документа
#     2. Dokumento tipas - 1=pirkimas, 2=pardavimas
#     3. Grąžinimo dok. požymis - всегда 1
#     4. Dokumento data - operation_date или invoice_date
#     5. Sąskaitos išrašymo data - invoice_date
#     6. Dokumento numeris - series + number
#     7. Įmonės kodas - связь с Imones.txt
#     8. (резерв) - пусто
#     9. Sandėlis - из user.pragma3_extra_fields
#     10. Koresp. schema - из user.pragma3_extra_fields
#     11. Valiutos kodas - пусто если EUR
#     12. Valiutos kursas - currency_rate
#     13. Pastaba - preview_url
#     14. Dok. suma - amount_with_vat
#     15. Dok. suma valiuta - amount_with_vat если не EUR, иначе пусто
#     16. PVM suma - vat_amount
#     17. PVM suma valiuta - vat_amount если не EUR, иначе пусто
#     18. Prekių suma - amount_wo_vat
#     19. Prekių suma valiuta - amount_wo_vat если не EUR, иначе пусто
#     20. Transporto išlaidos - 0 для pirkimai, пусто для pardavimai
#     21. Muito išlaidos - 0 для pirkimai, пусто для pardavimai
#     22. Kitos išlaidos - 0 для pirkimai, пусто для pardavimai
#     23. Projekto kodas - из user.pragma3_extra_fields
#     24. FR0564 požymis - пусто
#     25. Apmokėjimo data - due_date
#     """
#     lines = []
    
#     # Получаем настройки пользователя
#     pragma3_fields = {}
#     if user:
#         pragma3_fields = getattr(user, 'pragma3_extra_fields', None) or {}
    
#     for doc in documents or []:
#         doc_id = getattr(doc, 'id', None)
#         if not doc_id:
#             continue
        
#         doc_type, _ = _detect_document_type(doc)
        
#         # Фильтр по типу
#         if doc_type_filter and doc_type != doc_type_filter:
#             continue
        
#         # Grąžinimo požymis - всегда 1
#         return_flag = 1
        
#         # Даты
#         op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
#         inv_date = getattr(doc, 'invoice_date', None)
#         due_date = getattr(doc, 'due_date', None)
        
#         # Номер документа
#         doc_number = _get_document_number(doc)
        
#         # Код компании (для связи с Imones.txt)
#         company_code = _get_company_code(doc, doc_type)
        
#         # Sandėlis и Korespondencija из user.pragma3_extra_fields
#         if doc_type == 1:  # pirkimai
#             warehouse = _s(pragma3_fields.get('pirkimas_sandelis', ''))
#             schema = _s(pragma3_fields.get('pirkimas_korespondencija', ''))
#         else:  # pardavimai
#             warehouse = _s(pragma3_fields.get('pardavimas_sandelis', ''))
#             schema = _s(pragma3_fields.get('pardavimas_korespondencija', ''))
        
#         # Projekto kodas из user.pragma3_extra_fields
#         project_code = _s(pragma3_fields.get('projektas', ''))
        
#         # Валюта
#         currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
#         currency_code = "" if currency == "EUR" else currency
#         currency_rate = ""
#         if currency != "EUR":
#             rate = getattr(doc, 'currency_rate', None) or getattr(doc, 'kursas', None)
#             if rate:
#                 currency_rate = _format_decimal(rate, 4)
        
#         # Pastaba - preview_url
#         note = _s(getattr(doc, 'preview_url', ''))
        
#         # Суммы
#         amount_with_vat = getattr(doc, 'amount_with_vat', None)
#         vat_amount = getattr(doc, 'vat_amount', None)
#         amount_wo_vat = getattr(doc, 'amount_wo_vat', None)
        
#         total_with_vat = _format_decimal(amount_with_vat)
#         vat_sum = _format_decimal(vat_amount)
#         total_without_vat = _format_decimal(amount_wo_vat)
        
#         # Суммы в валюте - если не EUR, дублируем те же суммы
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
        
#         # FR0564 - пусто
#         fr_flag = ""
        
#         line = _build_line(
#             doc_id,                    # 1. Dokumento ID
#             doc_type,                  # 2. Dokumento tipas
#             return_flag,               # 3. Grąžinimo dok. požymis (всегда 1)
#             _format_date(op_date),     # 4. Dokumento data
#             _format_date(inv_date),    # 5. Sąskaitos išrašymo data
#             doc_number[:35],           # 6. Dokumento numeris (max 35)
#             company_code[:20],         # 7. Įmonės kodas (max 20)
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
#             fr_flag,                   # 24. FR0564 požymis
#             _format_date(due_date)     # 25. Vėliausia apmokėjimo data
#         )
        
#         lines.append(line)
#         logger.info("[PRAGMA:DOC] exported doc_id=%s type=%s number=%s", doc_id, doc_type, doc_number)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:DOC] total documents exported: %d", len(lines))
#     return result


# # =========================
# # ТОВАРЫ ДОКУМЕНТА (Dokumento prekių duomenys)
# # =========================

# def export_document_items_to_pragma(documents, doc_type_filter=None):
#     """
#     Экспорт товарных позиций документов в формат Pragma 3.2.
    
#     Args:
#         documents: список документов
#         doc_type_filter: 1=только pirkimai, 2=только pardavimai, None=все
    
#     Поля:
#     1. Dokumento ID
#     2. Prekės kodas (связь с Prekes.txt)
#     3. Kiekis
#     4. Kaina be PVM su nuolaida (за 1 шт)
#     5. PVM tarifas (21 для 21%)
#     6. PVM suma (на всю позицию)
#     7. Nuolaidos suma (на всю позицию, инфо)
#     8. Pridėtinės išlaidos
#     9. Kaina be PVM valiuta (за 1 шт)
#     10. PVM suma valiuta
#     11. Nuolaidos suma valiuta (за 1 шт)
#     12. Sumos deb. sąskaita
#     13. Sumos kred. sąskaita
#     14. Savikainos deb. sąskaita (не для pirkimai)
#     15. Savikainos kred. sąskaita (не для pirkimai)
#     16. PVM kodas (i.SAF)
#     17. Pastaba
#     18. Projekto kodas
#     """
#     lines = []
    
#     for doc in documents or []:
#         doc_id = getattr(doc, 'pk', None) or getattr(doc, 'id', None)
#         if not doc_id:
#             continue
        
#         doc_type, _ = _detect_document_type(doc)
        
#         # Фильтр по типу
#         if doc_type_filter and doc_type != doc_type_filter:
#             continue
        
#         currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
        
#         line_items = getattr(doc, 'line_items', None)
#         has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
#         if has_items:
#             for item in line_items.all():
#                 item_line = _build_item_line(doc_id, doc_type, currency, item, doc)
#                 lines.append(item_line)
#         else:
#             item_line = _build_item_line(doc_id, doc_type, currency, None, doc)
#             lines.append(item_line)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:ITEMS] total items exported: %d", len(lines))
#     return result


# def _build_item_line(doc_id, doc_type, currency, item, doc):
#     """Строит строку для одной позиции товара."""
    
#     # Код товара (для связи с Prekes.txt)
#     product_code = _get_product_code(item, doc)
    
#     # Количество
#     if item:
#         quantity = _format_decimal(getattr(item, 'quantity', 1))
#     else:
#         quantity = "1.00"
    
#     # Цена без НДС
#     if item:
#         price_wo_vat = _format_decimal(getattr(item, 'price', 0))
#     else:
#         price_wo_vat = _format_decimal(getattr(doc, 'amount_wo_vat', 0))
    
#     # Ставка НДС
#     if item:
#         vat_percent = _s(getattr(item, 'vat_percent', 0))
#     else:
#         vat_percent = _s(getattr(doc, 'vat_percent', 0))
#     vat_percent = vat_percent.replace('%', '').strip()
    
#     # Сумма НДС
#     if item:
#         vat_sum = _format_decimal(getattr(item, 'vat', 0))
#     else:
#         vat_sum = _format_decimal(getattr(doc, 'vat_amount', 0))
    
#     # Сумма скидки
#     if item:
#         discount_sum = _format_decimal(getattr(item, 'discount_amount', 0))
#     else:
#         discount_sum = _format_decimal(getattr(doc, 'invoice_discount_wo_vat', 0))
    
#     # Доп. расходы
#     if item:
#         additional_cost = _format_decimal(getattr(item, 'additional_cost', 0))
#     else:
#         additional_cost = ""
    
#     # Валютные поля
#     if currency == "EUR":
#         price_currency = ""
#         vat_sum_currency = ""
#         discount_sum_currency = ""
#     else:
#         if item:
#             price_currency = _format_decimal(getattr(item, 'price_currency', 0))
#             vat_sum_currency = _format_decimal(getattr(item, 'vat_currency', 0))
#             discount_sum_currency = _format_decimal(getattr(item, 'discount_amount_currency', 0))
#         else:
#             price_currency = _format_decimal(getattr(doc, 'amount_wo_vat_currency', 0))
#             vat_sum_currency = _format_decimal(getattr(doc, 'vat_amount_currency', 0))
#             discount_sum_currency = _format_decimal(getattr(doc, 'invoice_discount_wo_vat_currency', 0))
    
#     # Счета
#     if item:
#         debit_account = _s(getattr(item, 'debit_account', ''))
#         credit_account = _s(getattr(item, 'credit_account', ''))
#         cost_debit_account = _s(getattr(item, 'cost_debit_account', ''))
#         cost_credit_account = _s(getattr(item, 'cost_credit_account', ''))
#     else:
#         debit_account = _s(getattr(doc, 'debit_account', ''))
#         credit_account = _s(getattr(doc, 'credit_account', ''))
#         cost_debit_account = ""
#         cost_credit_account = ""
    
#     # Счета себестоимости не для pirkimai
#     if doc_type == 1:
#         cost_debit_account = ""
#         cost_credit_account = ""
    
#     # PVM код для i.SAF
#     if item:
#         line_map = getattr(doc, '_pvm_line_map', None)
#         if line_map is not None:
#             pvm_code = line_map.get(getattr(item, 'id', None), '')
#         else:
#             pvm_code = _s(getattr(item, 'pvm_kodas', ''))
#     else:
#         pvm_code = _s(getattr(doc, 'pvm_kodas', ''))
    
#     # Примечание
#     if item:
#         note = _s(getattr(item, 'note', '')) or _s(getattr(item, 'pastaba', ''))
#     else:
#         note = ""
    
#     # Проект
#     if item:
#         project_code = _s(getattr(item, 'project_code', ''))
#     else:
#         project_code = _s(getattr(doc, 'project_code', ''))
    
#     return _build_line(
#         doc_id,                 # 1. Dokumento ID
#         product_code[:17],      # 2. Prekės kodas (max 17)
#         quantity,               # 3. Kiekis
#         price_wo_vat,           # 4. Kaina be PVM su nuolaida
#         vat_percent,            # 5. PVM tarifas
#         vat_sum,                # 6. PVM suma
#         discount_sum,           # 7. Nuolaidos suma
#         additional_cost,        # 8. Pridėtinės išlaidos
#         price_currency,         # 9. Kaina be PVM valiuta
#         vat_sum_currency,       # 10. PVM suma valiuta
#         discount_sum_currency,  # 11. Nuolaidos suma valiuta
#         debit_account[:10],     # 12. Sumos deb. sąskaita (max 10)
#         credit_account[:10],    # 13. Sumos kred. sąskaita (max 10)
#         cost_debit_account[:10],   # 14. Savikainos deb. sąskaita (max 10)
#         cost_credit_account[:10],  # 15. Savikainos kred. sąskaita (max 10)
#         pvm_code[:6],           # 16. PVM kodas i.SAF (max 6)
#         note[:250],             # 17. Pastaba (max 250)
#         project_code[:12]       # 18. Projekto kodas (max 12)
#     )


# # =========================
# # ГЛАВНАЯ ФУНКЦИЯ ЭКСПОРТА
# # =========================

# def export_to_pragma_full(documents, user=None, include_reference_data=True):
#     """
#     Полный экспорт в формат Pragma 3.2.
    
#     Разделяет документы на pirkimai и pardavimai (по требованию Pragma).
#     Imones и Prekes содержат данные из всех документов.
    
#     Args:
#         documents: список документов для экспорта
#         user: объект пользователя для получения pragma3_extra_fields
#         include_reference_data: если True, добавляются справочники (companies, products)
    
#     Returns:
#         dict с ключами (4 или 6 файлов):
#             - 'pirkimai': документы покупок (или None если нет)
#             - 'pirkimai_det': позиции покупок (или None если нет)
#             - 'pardavimai': документы продаж (или None если нет)
#             - 'pardavimai_det': позиции продаж (или None если нет)
#             - 'companies': справочник компаний (общий, если include_reference_data)
#             - 'products': справочник товаров (общий, если include_reference_data)
#     """
#     result = {}
    
#     # Проверяем наличие документов каждого типа
#     has_pirkimai = any(_detect_document_type(d)[0] == 1 for d in (documents or []))
#     has_pardavimai = any(_detect_document_type(d)[0] == 2 for d in (documents or []))
    
#     # Документы и позиции - разделяем по типу
#     if has_pirkimai:
#         result['pirkimai'] = export_documents_to_pragma(documents, doc_type_filter=1, user=user)
#         result['pirkimai_det'] = export_document_items_to_pragma(documents, doc_type_filter=1)
    
#     if has_pardavimai:
#         result['pardavimai'] = export_documents_to_pragma(documents, doc_type_filter=2, user=user)
#         result['pardavimai_det'] = export_document_items_to_pragma(documents, doc_type_filter=2)
    
#     # Справочники - общие для всех (опционально)
#     if include_reference_data:
#         result['companies'] = export_companies_to_pragma(documents)
#         result['products'] = export_products_to_pragma(documents)
    
#     logger.info("[PRAGMA:EXPORT] full export completed: pirkimai=%s, pardavimai=%s, ref_data=%s",
#                 has_pirkimai, has_pardavimai, include_reference_data)
#     return result


# def save_pragma_export_to_files(export_data, base_path='/mnt/user-data/outputs', prefix='pragma'):
#     """
#     Сохраняет результаты экспорта в файлы.
    
#     Returns:
#         dict с путями к созданным файлам
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





















# """
# Экспорт документов в формат Pragma 3.2
# Форматы файлов: TXT (Tab-delimited), кодировка Windows-1257
# Поддерживаются только покупки (pirkimai) и продажи (pardavimai)
# """
# import logging
# from decimal import Decimal, ROUND_HALF_UP
# from datetime import datetime

# logger = logging.getLogger(__name__)


# def smart_str(s, encoding='utf-8', errors='strict'):
#     """Простая замена django.utils.encoding.smart_str."""
#     if isinstance(s, bytes):
#         return s.decode(encoding, errors)
#     return str(s) if s is not None else ''

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
#     """Форматирование Decimal с учетом системного десятичного разделителя."""
#     if value is None:
#         return ""
#     d = _safe_D(value)
#     # Округляем до нужного количества знаков
#     quantizer = Decimal("0." + "0" * decimals) if decimals > 0 else Decimal("1")
#     d = d.quantize(quantizer, rounding=ROUND_HALF_UP)
#     # Форматируем с точкой (или запятой в зависимости от настроек)
#     result = str(d)
#     # В Pragma обычно используют точку, но можно настроить
#     return result

# def _escape_csv(value):
#     """Экранирование значений для CSV."""
#     s = _s(value)
#     # Если есть табуляция, перевод строки или кавычки - оборачиваем в кавычки
#     if '\t' in s or '\n' in s or '\r' in s or '"' in s:
#         s = '"' + s.replace('"', '""') + '"'
#     return s

# def _build_line(*fields):
#     """Построение строки CSV с табуляцией как разделителем."""
#     line = '\t'.join(_escape_csv(f) for f in fields) + '\r\n'
#     return line.encode('windows-1257', errors='replace')


# # =========================
# # Определение типа документа
# # =========================

# def _detect_document_type(doc):
#     """
#     Определяет тип документа:
#     1 - pajamavimas (покупка)
#     2 - išlaidavimas (продажа)
    
#     Возвращает (doc_type, is_return)
#     """
#     doc_type_str = (_s(getattr(doc, 'pirkimas_pardavimas', ''))).lower()
    
#     if doc_type_str == 'pirkimas':
#         doc_type = 1
#     elif doc_type_str == 'pardavimas':
#         doc_type = 2
#     else:
#         # Определяем по наличию полей
#         if _s(getattr(doc, 'seller_id', '')) or _s(getattr(doc, 'seller_vat_code', '')):
#             doc_type = 1  # покупка
#         elif _s(getattr(doc, 'buyer_id', '')) or _s(getattr(doc, 'buyer_vat_code', '')):
#             doc_type = 2  # продажа
#         else:
#             # По умолчанию продажа
#             doc_type = 2
#             logger.warning("[PRAGMA:TYPE] doc=%s cannot determine type, defaulting to pardavimas", 
#                           getattr(doc, "pk", None))
    
#     # Определяем признак возврата
#     is_return = getattr(doc, 'is_return', False) or getattr(doc, 'grazinimas', False)
#     return_flag = 0 if is_return else 1
    
#     logger.info("[PRAGMA:TYPE] doc=%s type=%s return=%s", getattr(doc, "pk", None), doc_type, is_return)
#     return doc_type, return_flag


# def _get_party_code(doc, doc_type):
#     """
#     Получает код стороны (tiekėjas или pirkėjas) в зависимости от типа документа.
#     Приоритет: *_id -> *_vat_code -> *_id_programoje
    
#     Типы: 1 - покупка (нужен seller), 2 - продажа (нужен buyer)
#     """
#     if doc_type == 1:  # покупка - нужен seller
#         code = (
#             _s(getattr(doc, 'seller_id', ''))
#             or _s(getattr(doc, 'seller_vat_code', ''))
#             or _s(getattr(doc, 'seller_id_programoje', ''))
#         )
#         logger.info("[PRAGMA:PARTY] doc=%s type=pirkimas seller_code=%r", getattr(doc, "pk", None), code)
#     elif doc_type == 2:  # продажа - нужен buyer
#         code = (
#             _s(getattr(doc, 'buyer_id', ''))
#             or _s(getattr(doc, 'buyer_vat_code', ''))
#             or _s(getattr(doc, 'buyer_id_programoje', ''))
#         )
#         logger.info("[PRAGMA:PARTY] doc=%s type=pardavimas buyer_code=%r", getattr(doc, "pk", None), code)
#     else:
#         code = ""
#         logger.warning("[PRAGMA:PARTY] doc=%s unknown type=%s", getattr(doc, "pk", None), doc_type)
    
#     return code


# # =========================
# # 1) ДОКУМЕНТЫ (Dokumentų duomenys)
# # =========================

# def export_documents_to_pragma(documents):
#     """
#     Экспорт документов в формат Pragma 3.2.
    
#     Возвращает bytes в формате TXT (Tab-delimited, Windows-1257).
#     Поддерживаются только покупки (type=1) и продажи (type=2).
    
#     Поля документа:
#     1. Dokumento ID - уникальный идентификатор для связи с prekių duomenys
#     2. Dokumento tipas - 1=pajamavimas, 2=išlaidavimas
#     3. Grąžinimo dok. požymis - 0=возврат, 1=обычный
#     4. Dokumento data - дата документа (операции)
#     5. Sąskaitos išrašymo data - дата выставления счета
#     6. Dokumento numeris - номер документа (series+number)
#     7. Įmonės kodas - код компании (продавец/покупатель)
#     8. (резерв)
#     9. Sandėlis - склад
#     10. Sąsk. korespondavimo schema - схема корреспонденции
#     11. Valiutos kodas - код валюты (пусто для EUR)
#     12. Valiutos kursas - курс валюты
#     13. Pastaba - примечание
#     14. Dok. suma - сумма с НДС
#     15. Dok. suma valiuta - сумма с НДС в валюте
#     16. PVM suma - сумма НДС
#     17. PVM suma valiuta - сумма НДС в валюте
#     18. Prekių suma - сумма товаров без НДС
#     19. Prekių suma valiuta - сумма товаров без НДС в валюте
#     20. Transporto išlaidų suma - транспортные расходы (только для покупок)
#     21. Muito išlaidų suma - таможенные расходы (только для покупок)
#     22. Kitų pridėtinių išlaidų suma - прочие расходы (только для покупок)
#     23. Projekto kodas - код проекта
#     24. FR0564 požymis - признак для i.SAF (13, 14, 18)
#     25. Vėliausia apmokėjimo data - дата оплаты
#     """
#     lines = []
    
#     for doc in documents or []:
#         doc_id = getattr(doc, 'pk', None) or getattr(doc, 'id', None)
#         if not doc_id:
#             logger.warning("[PRAGMA:DOC] skip document without ID")
#             continue
        
#         doc_type, return_flag = _detect_document_type(doc)
        
#         # Даты
#         op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
#         inv_date = getattr(doc, 'invoice_date', None)
        
#         # Номер документа
#         series = _s(getattr(doc, 'document_series', ''))
#         number = _s(getattr(doc, 'document_number', ''))
#         doc_number = f"{series}{number}" if series else number
        
#         # Код стороны
#         party_code = _get_party_code(doc, doc_type)
        
#         # Склад
#         warehouse = _s(getattr(doc, 'warehouse', '')) or _s(getattr(doc, 'sandelis', ''))
        
#         # Схема корреспонденции
#         schema = _s(getattr(doc, 'koresp_schema', ''))
        
#         # Валюта
#         currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
#         currency_code = "" if currency == "EUR" else currency
#         currency_rate = ""
#         if currency != "EUR":
#             rate = getattr(doc, 'currency_rate', None) or getattr(doc, 'kursas', None)
#             if rate:
#                 currency_rate = _format_decimal(rate, 4)
        
#         # Примечание
#         note = _s(getattr(doc, 'note', '')) or _s(getattr(doc, 'pastaba', ''))
        
#         # Суммы
#         # Сумма с НДС
#         total_with_vat_val = _safe_D(getattr(doc, 'amount', None) or getattr(doc, 'suma', None))
#         total_with_vat = _format_decimal(total_with_vat_val)
        
#         # Сумма НДС
#         vat_sum_val = _safe_D(getattr(doc, 'vat_amount', None) or getattr(doc, 'pvm_suma', None))
#         vat_sum = _format_decimal(vat_sum_val)
        
#         # Сумма без НДС
#         total_without_vat_val = _safe_D(getattr(doc, 'amount_wo_vat', None) or getattr(doc, 'suma_be_pvm', None))
#         total_without_vat = _format_decimal(total_without_vat_val)
        
#         # Суммы в валюте
#         if currency != "EUR":
#             total_with_vat_cur = _format_decimal(getattr(doc, 'amount_currency', None))
#             vat_sum_cur = _format_decimal(getattr(doc, 'vat_amount_currency', None))
#             total_without_vat_cur = _format_decimal(getattr(doc, 'amount_wo_vat_currency', None))
#         else:
#             total_with_vat_cur = ""
#             vat_sum_cur = ""
#             total_without_vat_cur = ""
        
#         # Доп. расходы (только для покупок)
#         if doc_type == 1:
#             transport_cost = _format_decimal(getattr(doc, 'transport_cost', None))
#             customs_cost = _format_decimal(getattr(doc, 'customs_cost', None))
#             other_cost = _format_decimal(getattr(doc, 'other_cost', None))
#         else:
#             transport_cost = ""
#             customs_cost = ""
#             other_cost = ""
        
#         # Проект
#         project_code = _s(getattr(doc, 'project_code', '')) or _s(getattr(doc, 'projektas', ''))
        
#         # FR0564 признак (для i.SAF)
#         fr_flag = ""
#         isaf_code = getattr(doc, 'isaf_code', None) or getattr(doc, 'fr0564', None)
#         if isaf_code in (13, 14, 18):
#             fr_flag = str(isaf_code)
        
#         # Дата оплаты
#         pay_date = getattr(doc, 'payment_date', None) or getattr(doc, 'apmokejimo_data', None)
#         payment_date = _format_date(pay_date)
        
#         # Формируем строку
#         line = _build_line(
#             doc_id,                    # 1. Dokumento ID
#             doc_type,                  # 2. Dokumento tipas
#             return_flag,               # 3. Grąžinimo dok. požymis
#             _format_date(op_date),     # 4. Dokumento data
#             _format_date(inv_date),    # 5. Sąskaitos išrašymo data
#             doc_number,                # 6. Dokumento numeris
#             party_code,                # 7. Įmonės kodas
#             "",                        # 8. (rezerv)
#             warehouse,                 # 9. Sandėlis
#             schema,                    # 10. Sąsk. korespondavimo schema
#             currency_code,             # 11. Valiutos kodas
#             currency_rate,             # 12. Valiutos kursas
#             note,                      # 13. Pastaba
#             total_with_vat,            # 14. Dok. suma
#             total_with_vat_cur,        # 15. Dok. suma valiuta
#             vat_sum,                   # 16. PVM suma
#             vat_sum_cur,               # 17. PVM suma valiuta
#             total_without_vat,         # 18. Prekių suma
#             total_without_vat_cur,     # 19. Prekių suma valiuta
#             transport_cost,            # 20. Transporto išlaidų suma
#             customs_cost,              # 21. Muito išlaidų suma
#             other_cost,                # 22. Kitų pridėtinių išlaidų suma
#             project_code,              # 23. Projekto kodas
#             fr_flag,                   # 24. FR0564 požymis
#             payment_date               # 25. Vėliausia apmokėjimo data
#         )
        
#         lines.append(line)
#         logger.info("[PRAGMA:DOC] exported doc_id=%s type=%s number=%s", doc_id, doc_type, doc_number)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:DOC] total documents exported: %d", len(lines))
#     return result


# # =========================
# # 2) ТОВАРЫ ДОКУМЕНТА (Dokumento prekių duomenys)
# # =========================

# def export_document_items_to_pragma(documents):
#     """
#     Экспорт товарных позиций документов в формат Pragma 3.2.
    
#     Поля товара:
#     1. Dokumento ID - связь с документом
#     2. Prekės kodas - код товара
#     3. Kiekis - количество
#     4. Kaina be PVM su nuolaida - цена без НДС с учетом скидки (за 1 шт)
#     5. PVM tarifas - ставка НДС (21 для 21%)
#     6. PVM suma - сумма НДС (на всю позицию)
#     7. Nuolaidos suma - сумма скидки (на всю позицию, только инфо)
#     8. Pridėtinės išlaidos - дополнительные расходы
#     9. Kaina be PVM valiuta - цена без НДС в валюте (за 1 шт)
#     10. PVM suma valiuta - сумма НДС в валюте
#     11. Nuolaidos suma valiuta - сумма скидки в валюте (за 1 шт)
#     12. Sumos deb. sąskaita - счет дебета
#     13. Sumos kred. sąskaita - счет кредита
#     14. Savikainos deb. sąskaita - счет дебета себестоимости (не для покупок)
#     15. Savikainos kred. sąskaita - счет кредита себестоимости (не для покупок)
#     16. PVM kodas (i.SAF) - код НДС для i.SAF
#     17. Pastaba - примечание
#     18. Projekto kodas - код проекта
#     """
#     lines = []
    
#     for doc in documents or []:
#         doc_id = getattr(doc, 'pk', None) or getattr(doc, 'id', None)
#         if not doc_id:
#             continue
        
#         doc_type, _ = _detect_document_type(doc)
#         currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
        
#         # Получаем товарные позиции
#         line_items = getattr(doc, 'line_items', None)
#         has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
#         if has_items:
#             # Обработка документа с позициями
#             for item in line_items.all():
#                 item_line = _export_single_item(
#                     doc_id, doc_type, currency, item, doc, is_from_lines=True
#                 )
#                 if item_line:
#                     lines.append(item_line)
#         else:
#             # Документ без позиций - создаем одну позицию из данных документа
#             item_line = _export_single_item(
#                 doc_id, doc_type, currency, None, doc, is_from_lines=False
#             )
#             if item_line:
#                 lines.append(item_line)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:ITEMS] total items exported: %d", len(lines))
#     return result


# def _export_single_item(doc_id, doc_type, currency, item, doc, is_from_lines=True):
#     """Экспорт одной товарной позиции."""
    
#     # Код товара
#     if is_from_lines:
#         item_code = (
#             _s(getattr(item, 'prekes_kodas', ''))
#             or _s(getattr(item, 'prekes_barkodas', ''))
#             or _s(getattr(doc, 'prekes_kodas', ''))
#             or "PREKE001"
#         )
#     else:
#         item_code = _s(getattr(doc, 'prekes_kodas', '')) or "PREKE001"
    
#     # Количество
#     if is_from_lines:
#         quantity = _format_decimal(getattr(item, 'quantity', 1))
#     else:
#         quantity = "1.00"
    
#     # Цена без НДС (уже с учетом скидки)
#     if is_from_lines:
#         price_wo_vat = _format_decimal(getattr(item, 'price', 0))
#     else:
#         price_wo_vat = _format_decimal(getattr(doc, 'amount_wo_vat', 0))
    
#     # Ставка НДС
#     if is_from_lines:
#         vat_percent = _s(getattr(item, 'vat_percent', 0))
#     else:
#         vat_percent = _s(getattr(doc, 'vat_percent', 0))
#     # Убираем знак % если есть
#     vat_percent = vat_percent.replace('%', '').strip()
    
#     # Сумма НДС (на всю позицию)
#     if is_from_lines:
#         vat_sum = _format_decimal(getattr(item, 'vat', 0))
#     else:
#         vat_sum = _format_decimal(getattr(doc, 'vat_amount', 0))
    
#     # Сумма скидки
#     if is_from_lines:
#         discount_sum = _format_decimal(getattr(item, 'discount_amount', 0))
#     else:
#         discount_sum = _format_decimal(getattr(doc, 'invoice_discount_wo_vat', 0))
    
#     # Дополнительные расходы
#     if is_from_lines:
#         additional_cost = _format_decimal(getattr(item, 'additional_cost', 0))
#     else:
#         additional_cost = ""
    
#     # Валютные поля
#     if currency == "EUR":
#         price_currency = ""
#         vat_sum_currency = ""
#         discount_sum_currency = ""
#     else:
#         if is_from_lines:
#             price_currency = _format_decimal(getattr(item, 'price_currency', 0))
#             vat_sum_currency = _format_decimal(getattr(item, 'vat_currency', 0))
#             discount_sum_currency = _format_decimal(getattr(item, 'discount_amount_currency', 0))
#         else:
#             price_currency = _format_decimal(getattr(doc, 'amount_wo_vat_currency', 0))
#             vat_sum_currency = _format_decimal(getattr(doc, 'vat_amount_currency', 0))
#             discount_sum_currency = _format_decimal(getattr(doc, 'invoice_discount_wo_vat_currency', 0))
    
#     # Счета
#     if is_from_lines:
#         debit_account = _s(getattr(item, 'debit_account', ''))
#         credit_account = _s(getattr(item, 'credit_account', ''))
#         cost_debit_account = _s(getattr(item, 'cost_debit_account', ''))
#         cost_credit_account = _s(getattr(item, 'cost_credit_account', ''))
#     else:
#         debit_account = _s(getattr(doc, 'debit_account', ''))
#         credit_account = _s(getattr(doc, 'credit_account', ''))
#         cost_debit_account = ""
#         cost_credit_account = ""
    
#     # Счета себестоимости не используются для покупок
#     if doc_type == 1:
#         cost_debit_account = ""
#         cost_credit_account = ""
    
#     # PVM код для i.SAF
#     if is_from_lines:
#         # Проверяем наличие маппинга для multi-rate документов
#         line_map = getattr(doc, '_pvm_line_map', None)
#         if line_map is not None:
#             pvm_code = line_map.get(getattr(item, 'id', None), '')
#         else:
#             pvm_code = _s(getattr(item, 'pvm_kodas', ''))
#     else:
#         pvm_code = _s(getattr(doc, 'pvm_kodas', ''))
    
#     # Примечание
#     if is_from_lines:
#         note = _s(getattr(item, 'note', '')) or _s(getattr(item, 'pastaba', ''))
#     else:
#         note = ""
    
#     # Проект
#     if is_from_lines:
#         project_code = _s(getattr(item, 'project_code', ''))
#     else:
#         project_code = _s(getattr(doc, 'project_code', ''))
    
#     # Формируем строку
#     line = _build_line(
#         doc_id,                 # 1. Dokumento ID
#         item_code,              # 2. Prekės kodas
#         quantity,               # 3. Kiekis
#         price_wo_vat,           # 4. Kaina be PVM su nuolaida
#         vat_percent,            # 5. PVM tarifas
#         vat_sum,                # 6. PVM suma
#         discount_sum,           # 7. Nuolaidos suma
#         additional_cost,        # 8. Pridėtinės išlaidos
#         price_currency,         # 9. Kaina be PVM valiuta
#         vat_sum_currency,       # 10. PVM suma valiuta
#         discount_sum_currency,  # 11. Nuolaidos suma valiuta
#         debit_account,          # 12. Sumos deb. sąskaita
#         credit_account,         # 13. Sumos kred. sąskaita
#         cost_debit_account,     # 14. Savikainos deb. sąskaita
#         cost_credit_account,    # 15. Savikainos kred. sąskaita
#         pvm_code,               # 16. PVM kodas (i.SAF)
#         note,                   # 17. Pastaba
#         project_code            # 18. Projekto kodas
#     )
    
#     logger.info("[PRAGMA:ITEM] doc_id=%s item_code=%s qty=%s", doc_id, item_code, quantity)
#     return line


# # =========================
# # 3) КОМПАНИИ (Įmonių duomenys)
# # =========================

# def export_companies_to_pragma(companies=None, documents=None):
#     """
#     Экспорт компаний в формат Pragma 3.2.
    
#     Поля компании:
#     1. Įmonės ID - уникальный идентификатор
#     2. Trumpas įmonės pavadinimas - краткое название (УНИКАЛЬНОЕ!)
#     3. Įmonės kodas - код компании
#     4. Pavadinimas - полное название
#     5. Adresas - адрес
#     6. PVM mokėtojo kodas - код плательщика НДС
#     7. Banko kodas - код банка
#     8. Atsiskaitomoji sąskaita - расчетный счет
#     9. Šalies kodas - код страны (2 буквы)
#     10. Telefonas - телефон
#     11. Kontaktinis asmuo - контактное лицо
#     12. E-mail - email
#     13. Įmonės tipas - тип компании (0=юр.лицо, 1=физ.лицо)
#     """
#     lines = []
#     seen_codes = set()
    
#     # 1) Извлекаем компании из документов
#     if documents:
#         logger.info("[PRAGMA:COMPANY] collect from documents: %d", len(documents))
#         for doc in documents or []:
#             doc_type, _ = _detect_document_type(doc)
            
#             if doc_type == 1:  # покупка - нужен seller
#                 company_data = _extract_company_from_doc(doc, 'seller')
#                 if company_data and company_data['code'] not in seen_codes:
#                     lines.append(_build_company_line(company_data))
#                     seen_codes.add(company_data['code'])
                    
#             elif doc_type == 2:  # продажа - нужен buyer
#                 company_data = _extract_company_from_doc(doc, 'buyer')
#                 if company_data and company_data['code'] not in seen_codes:
#                     lines.append(_build_company_line(company_data))
#                     seen_codes.add(company_data['code'])
    
#     # 2) Компании, переданные вручную
#     if companies:
#         logger.info("[PRAGMA:COMPANY] collect from companies list: %d", len(companies))
#         for company in companies or []:
#             company_code = (
#                 _s(company.get('code'))
#                 or _s(company.get('id'))
#                 or _s(company.get('vat'))
#                 or _s(company.get('id_programoje'))
#             )
            
#             if company_code and company_code not in seen_codes:
#                 lines.append(_build_company_line(company))
#                 seen_codes.add(company_code)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:COMPANY] total companies exported: %d", len(lines))
#     return result


# def _extract_company_from_doc(doc, party_type):
#     """Извлекает данные компании из документа."""
#     if party_type == 'seller':
#         prefix = 'seller_'
#     elif party_type == 'buyer':
#         prefix = 'buyer_'
#     else:
#         return None
    
#     code = (
#         _s(getattr(doc, f'{prefix}id', ''))
#         or _s(getattr(doc, f'{prefix}vat_code', ''))
#         or _s(getattr(doc, f'{prefix}id_programoje', ''))
#     )
    
#     if not code:
#         return None
    
#     name = _s(getattr(doc, f'{prefix}name', '')) or 'Nezinoma'
    
#     return {
#         'id': code,  # используем код как ID
#         'short_name': code,  # короткое название = код
#         'code': _s(getattr(doc, f'{prefix}id', '')),
#         'name': name,
#         'address': _s(getattr(doc, f'{prefix}address', '')),
#         'vat': _s(getattr(doc, f'{prefix}vat_code', '')),
#         'bank_code': '',
#         'account': _s(getattr(doc, f'{prefix}iban', '')),
#         'country': _s(getattr(doc, f'{prefix}country_iso', '')).upper(),
#         'phone': _s(getattr(doc, f'{prefix}phone', '')),
#         'contact': _s(getattr(doc, f'{prefix}contact', '')),
#         'email': _s(getattr(doc, f'{prefix}email', '')),
#         'is_person': 1 if getattr(doc, f'{prefix}is_person', False) else 0
#     }


# def _build_company_line(company):
#     """Формирует строку CSV для одной компании."""
#     company_id = _s(company.get('id', ''))
#     short_name = _s(company.get('short_name', '')) or company_id
#     code = _s(company.get('code', ''))
#     name = _s(company.get('name', '')) or 'Nezinoma'
#     address = _s(company.get('address', ''))
#     vat = _s(company.get('vat', ''))
#     bank_code = _s(company.get('bank_code', ''))
#     account = _s(company.get('account', ''))
#     country = _s(company.get('country', '')).upper()
#     phone = _s(company.get('phone', ''))
#     contact = _s(company.get('contact', ''))
#     email = _s(company.get('email', ''))
#     is_person = str(company.get('is_person', 0))
    
#     line = _build_line(
#         company_id,     # 1. Įmonės ID
#         short_name,     # 2. Trumpas įmonės pavadinimas
#         code,           # 3. Įmonės kodas
#         name,           # 4. Pavadinimas
#         address,        # 5. Adresas
#         vat,            # 6. PVM mokėtojo kodas
#         bank_code,      # 7. Banko kodas
#         account,        # 8. Atsiskaitomoji sąskaita
#         country,        # 9. Šalies kodas
#         phone,          # 10. Telefonas
#         contact,        # 11. Kontaktinis asmuo
#         email,          # 12. E-mail
#         is_person       # 13. Įmonės tipas
#     )
    
#     logger.info("[PRAGMA:COMPANY] exported company_id=%s name=%s", company_id, short_name)
#     return line


# # =========================
# # 4) ТОВАРЫ (Prekių duomenys)
# # =========================

# def export_products_to_pragma(products=None, documents=None):
#     """
#     Экспорт товаров в формат Pragma 3.2.
    
#     Поля товара:
#     1. Prekės ID - уникальный идентификатор
#     2. Prekės kodas - код товара (Nom.Nr., УНИКАЛЬНЫЙ!)
#     3. Pavadinimas - название
#     4. Mato vienetas - единица измерения
#     5. Prekė ar paslauga - 0=товар, 1=услуга
#     6. Muitinės kodas - код таможни
#     7. Svoris - вес
#     8. Kiekis įpakavime - количество в упаковке
#     9. Įpakavimo rūšis - тип упаковки
#     """
#     lines = []
#     seen_codes = set()
    
#     # 1) Извлекаем товары из документов
#     if documents:
#         logger.info("[PRAGMA:PRODUCT] collect from documents: %d", len(documents))
#         for doc in documents or []:
#             line_items = getattr(doc, 'line_items', None)
#             has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
            
#             if has_items:
#                 for item in line_items.all():
#                     product_data = _extract_product_from_item(item, doc)
#                     if product_data and product_data['code'] not in seen_codes:
#                         lines.append(_build_product_line(product_data))
#                         seen_codes.add(product_data['code'])
#             else:
#                 product_data = _extract_product_from_doc(doc)
#                 if product_data and product_data['code'] not in seen_codes:
#                     lines.append(_build_product_line(product_data))
#                     seen_codes.add(product_data['code'])
    
#     # 2) Товары, переданные вручную
#     if products:
#         logger.info("[PRAGMA:PRODUCT] collect from products list: %d", len(products))
#         for product in products or []:
#             product_code = (
#                 _s(product.get('code'))
#                 or _s(product.get('barcode'))
#                 or _s(product.get('id'))
#             )
            
#             if product_code and product_code not in seen_codes:
#                 lines.append(_build_product_line(product))
#                 seen_codes.add(product_code)
    
#     result = b''.join(lines)
#     logger.info("[PRAGMA:PRODUCT] total products exported: %d", len(lines))
#     return result


# def normalize_preke_paslauga_for_pragma(value) -> int:
#     """
#     Нормализует значение preke_paslauga для Pragma 3.2.
    
#     Возвращает:
#     - 0 = товар (prekė)
#     - 1 = услуга (paslauga)
    
#     Маппинг:
#     - 1 → 0 (prekė = товар)
#     - 2 → 1 (paslauga = услуга)
#     - 3 → 0 (kodas = товар)
#     - 4 → 1 (услуга)
    
#     Также поддерживает текстовые значения:
#     - 'preke', 'prekė', 'prekes', 'prekės' → 0
#     - 'paslauga', 'paslaugos' → 1
#     """
#     if value is None:
#         return 0
    
#     s = str(value).strip()
#     if not s:
#         return 0
    
#     # Числовые значения
#     try:
#         n = int(float(s.replace(",", ".")))
#         if n == 1:
#             return 0  # товар
#         elif n == 2:
#             return 1  # услуга
#         elif n == 3:
#             return 0  # код → товар
#         elif n == 4:
#             return 1  # → услуга
#         return 0  # fallback - товар
#     except Exception:
#         pass
    
#     # Текстовые значения
#     low = s.lower()
#     if low in ("preke", "prekė", "prekes", "prekės"):
#         return 0
#     if low in ("paslauga", "paslaugos"):
#         return 1
    
#     return 0  # fallback - товар


# # Использование в _extract_product_from_item():
# def _extract_product_from_item(item, doc):
#     """Извлекает данные товара из позиции документа."""
#     code = (
#         _s(getattr(item, 'prekes_kodas', ''))
#         or _s(getattr(item, 'prekes_barkodas', ''))
#         or _s(getattr(doc, 'prekes_kodas', ''))
#     )
    
#     if not code:
#         return None
    
#     name = _s(getattr(item, 'prekes_pavadinimas', '')) or _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
#     unit = _s(getattr(item, 'unit', '')) or _s(getattr(doc, 'unit', '')) or 'vnt.'
    
#     # Определяем тип: 0=товар, 1=услуга (ИСПРАВЛЕНО)
#     preke_paslauga = getattr(item, 'preke_paslauga', None) or getattr(doc, 'preke_paslauga', None)
#     is_service = normalize_preke_paslauga_for_pragma(preke_paslauga)
    
#     return {
#         'id': code,
#         'code': code,
#         'name': name,
#         'unit': unit,
#         'is_service': is_service,
#         'customs_code': _s(getattr(item, 'customs_code', '')),
#         'weight': _s(getattr(item, 'weight', '')),
#         'pack_qty': _s(getattr(item, 'pack_qty', '')),
#         'pack_type': _s(getattr(item, 'pack_type', ''))
#     }


# # Использование в _extract_product_from_doc():
# def _extract_product_from_doc(doc):
#     """Извлекает данные товара из документа без позиций."""
#     code = _s(getattr(doc, 'prekes_kodas', ''))
    
#     if not code:
#         return None
    
#     name = _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
#     unit = _s(getattr(doc, 'unit', '')) or 'vnt.'
    
#     # Определяем тип: 0=товар, 1=услуга (ИСПРАВЛЕНО)
#     preke_paslauga = getattr(doc, 'preke_paslauga', None)
#     is_service = normalize_preke_paslauga_for_pragma(preke_paslauga)
    
#     return {
#         'id': code,
#         'code': code,
#         'name': name,
#         'unit': unit,
#         'is_service': is_service,
#         'customs_code': '',
#         'weight': '',
#         'pack_qty': '',
#         'pack_type': ''
#     }



# def _build_product_line(product):
#     """Формирует строку CSV для одного товара."""
#     product_id = _s(product.get('id', ''))
#     code = _s(product.get('code', ''))
#     name = _s(product.get('name', '')) or 'Prekė'
#     unit = _s(product.get('unit', '')) or 'vnt.'
#     is_service = str(product.get('is_service', 0))
#     customs_code = _s(product.get('customs_code', ''))
#     weight = _format_decimal(product.get('weight', 0), 3) if product.get('weight') else ""
#     pack_qty = _format_decimal(product.get('pack_qty', 0), 2) if product.get('pack_qty') else ""
#     pack_type = _s(product.get('pack_type', ''))
    
#     line = _build_line(
#         product_id,     # 1. Prekės ID
#         code,           # 2. Prekės kodas
#         name,           # 3. Pavadinimas
#         unit,           # 4. Mato vienetas
#         is_service,     # 5. Prekė ar paslauga
#         customs_code,   # 6. Muitinės kodas
#         weight,         # 7. Svoris
#         pack_qty,       # 8. Kiekis įpakavime
#         pack_type       # 9. Įpakavimo rūšis
#     )
    
#     logger.info("[PRAGMA:PRODUCT] exported product_id=%s code=%s", product_id, code)
#     return line


# # =========================
# # ГЛАВНАЯ ФУНКЦИЯ ЭКСПОРТА
# # =========================

# def export_to_pragma_full(documents, include_reference_data=True):
#     """
#     Полный экспорт в формат Pragma 3.2.
    
#     Args:
#         documents: список документов для экспорта
#         include_reference_data: если True, экспортируются также компании и товары
    
#     Returns:
#         dict с ключами:
#             - 'documents': CSV с документами
#             - 'items': CSV с позициями документов
#             - 'companies': CSV с компаниями (если include_reference_data=True)
#             - 'products': CSV с товарами (если include_reference_data=True)
#     """
#     result = {}
    
#     # Обязательные файлы
#     result['documents'] = export_documents_to_pragma(documents)
#     result['items'] = export_document_items_to_pragma(documents)
    
#     # Справочники (опционально)
#     if include_reference_data:
#         result['companies'] = export_companies_to_pragma(documents=documents)
#         result['products'] = export_products_to_pragma(documents=documents)
    
#     logger.info("[PRAGMA:EXPORT] full export completed")
#     return result


# # =========================
# # СОХРАНЕНИЕ В ФАЙЛЫ
# # =========================

# def save_pragma_export_to_files(export_data, base_filename='pragma_export'):
#     """
#     Сохраняет результаты экспорта в файлы с кодировкой Windows-1257.
    
#     Args:
#         export_data: результат от export_to_pragma_full()
#         base_filename: базовое имя файла
    
#     Returns:
#         dict с путями к созданным файлам
#     """
#     files = {}
    
#     for key, content in export_data.items():
#         if not content:
#             continue
        
#         # Определяем имя файла
#         if key == 'documents':
#             filename = f'{base_filename}_pardavimai.txt'
#         elif key == 'items':
#             filename = f'{base_filename}_pardavimai_det.txt'
#         elif key == 'companies':
#             filename = f'{base_filename}_Imones.txt'
#         elif key == 'products':
#             filename = f'{base_filename}_Prekes.txt'
#         else:
#             filename = f'{base_filename}_{key}.txt'
        
#         # Сохраняем с кодировкой Windows-1257 (контент уже закодирован)
#         try:
#             filepath = f'/mnt/user-data/outputs/{filename}'
#             with open(filepath, 'wb') as f:
#                 f.write(content)
#             files[key] = filepath
#             logger.info("[PRAGMA:SAVE] saved %s -> %s (%d bytes)", key, filepath, len(content))
#         except Exception as e:
#             logger.error("[PRAGMA:SAVE] error saving %s: %s", key, e)
    
#     return files