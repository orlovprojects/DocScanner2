"""
Экспорт документов в формат Pragma 3.2
Форматы файлов: TXT (Tab-delimited), кодировка Windows-1257
Поддерживаются только покупки (pirkimai) и продажи (pardavimai)
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime

logger = logging.getLogger(__name__)


def smart_str(s, encoding='utf-8', errors='strict'):
    """Простая замена django.utils.encoding.smart_str."""
    if isinstance(s, bytes):
        return s.decode(encoding, errors)
    return str(s) if s is not None else ''

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
    """Форматирование Decimal с учетом системного десятичного разделителя."""
    if value is None:
        return ""
    d = _safe_D(value)
    # Округляем до нужного количества знаков
    quantizer = Decimal("0." + "0" * decimals) if decimals > 0 else Decimal("1")
    d = d.quantize(quantizer, rounding=ROUND_HALF_UP)
    # Форматируем с точкой (или запятой в зависимости от настроек)
    result = str(d)
    # В Pragma обычно используют точку, но можно настроить
    return result

def _escape_csv(value):
    """Экранирование значений для CSV."""
    s = _s(value)
    # Если есть табуляция, перевод строки или кавычки - оборачиваем в кавычки
    if '\t' in s or '\n' in s or '\r' in s or '"' in s:
        s = '"' + s.replace('"', '""') + '"'
    return s

def _build_line(*fields):
    """Построение строки CSV с табуляцией как разделителем."""
    line = '\t'.join(_escape_csv(f) for f in fields) + '\r\n'
    return line.encode('windows-1257', errors='replace')


# =========================
# Определение типа документа
# =========================

def _detect_document_type(doc):
    """
    Определяет тип документа:
    1 - pajamavimas (покупка)
    2 - išlaidavimas (продажа)
    
    Возвращает (doc_type, is_return)
    """
    doc_type_str = (_s(getattr(doc, 'pirkimas_pardavimas', ''))).lower()
    
    if doc_type_str == 'pirkimas':
        doc_type = 1
    elif doc_type_str == 'pardavimas':
        doc_type = 2
    else:
        # Определяем по наличию полей
        if _s(getattr(doc, 'seller_id', '')) or _s(getattr(doc, 'seller_vat_code', '')):
            doc_type = 1  # покупка
        elif _s(getattr(doc, 'buyer_id', '')) or _s(getattr(doc, 'buyer_vat_code', '')):
            doc_type = 2  # продажа
        else:
            # По умолчанию продажа
            doc_type = 2
            logger.warning("[PRAGMA:TYPE] doc=%s cannot determine type, defaulting to pardavimas", 
                          getattr(doc, "pk", None))
    
    # Определяем признак возврата
    is_return = getattr(doc, 'is_return', False) or getattr(doc, 'grazinimas', False)
    return_flag = 0 if is_return else 1
    
    logger.info("[PRAGMA:TYPE] doc=%s type=%s return=%s", getattr(doc, "pk", None), doc_type, is_return)
    return doc_type, return_flag


def _get_party_code(doc, doc_type):
    """
    Получает код стороны (tiekėjas или pirkėjas) в зависимости от типа документа.
    Приоритет: *_id -> *_vat_code -> *_id_programoje
    
    Типы: 1 - покупка (нужен seller), 2 - продажа (нужен buyer)
    """
    if doc_type == 1:  # покупка - нужен seller
        code = (
            _s(getattr(doc, 'seller_id', ''))
            or _s(getattr(doc, 'seller_vat_code', ''))
            or _s(getattr(doc, 'seller_id_programoje', ''))
        )
        logger.info("[PRAGMA:PARTY] doc=%s type=pirkimas seller_code=%r", getattr(doc, "pk", None), code)
    elif doc_type == 2:  # продажа - нужен buyer
        code = (
            _s(getattr(doc, 'buyer_id', ''))
            or _s(getattr(doc, 'buyer_vat_code', ''))
            or _s(getattr(doc, 'buyer_id_programoje', ''))
        )
        logger.info("[PRAGMA:PARTY] doc=%s type=pardavimas buyer_code=%r", getattr(doc, "pk", None), code)
    else:
        code = ""
        logger.warning("[PRAGMA:PARTY] doc=%s unknown type=%s", getattr(doc, "pk", None), doc_type)
    
    return code


# =========================
# 1) ДОКУМЕНТЫ (Dokumentų duomenys)
# =========================

def export_documents_to_pragma(documents):
    """
    Экспорт документов в формат Pragma 3.2.
    
    Возвращает bytes в формате TXT (Tab-delimited, Windows-1257).
    Поддерживаются только покупки (type=1) и продажи (type=2).
    
    Поля документа:
    1. Dokumento ID - уникальный идентификатор для связи с prekių duomenys
    2. Dokumento tipas - 1=pajamavimas, 2=išlaidavimas
    3. Grąžinimo dok. požymis - 0=возврат, 1=обычный
    4. Dokumento data - дата документа (операции)
    5. Sąskaitos išrašymo data - дата выставления счета
    6. Dokumento numeris - номер документа (series+number)
    7. Įmonės kodas - код компании (продавец/покупатель)
    8. (резерв)
    9. Sandėlis - склад
    10. Sąsk. korespondavimo schema - схема корреспонденции
    11. Valiutos kodas - код валюты (пусто для EUR)
    12. Valiutos kursas - курс валюты
    13. Pastaba - примечание
    14. Dok. suma - сумма с НДС
    15. Dok. suma valiuta - сумма с НДС в валюте
    16. PVM suma - сумма НДС
    17. PVM suma valiuta - сумма НДС в валюте
    18. Prekių suma - сумма товаров без НДС
    19. Prekių suma valiuta - сумма товаров без НДС в валюте
    20. Transporto išlaidų suma - транспортные расходы (только для покупок)
    21. Muito išlaidų suma - таможенные расходы (только для покупок)
    22. Kitų pridėtinių išlaidų suma - прочие расходы (только для покупок)
    23. Projekto kodas - код проекта
    24. FR0564 požymis - признак для i.SAF (13, 14, 18)
    25. Vėliausia apmokėjimo data - дата оплаты
    """
    lines = []
    
    for doc in documents or []:
        doc_id = getattr(doc, 'pk', None) or getattr(doc, 'id', None)
        if not doc_id:
            logger.warning("[PRAGMA:DOC] skip document without ID")
            continue
        
        doc_type, return_flag = _detect_document_type(doc)
        
        # Даты
        op_date = getattr(doc, 'operation_date', None) or getattr(doc, 'invoice_date', None)
        inv_date = getattr(doc, 'invoice_date', None)
        
        # Номер документа
        series = _s(getattr(doc, 'document_series', ''))
        number = _s(getattr(doc, 'document_number', ''))
        doc_number = f"{series}{number}" if series else number
        
        # Код стороны
        party_code = _get_party_code(doc, doc_type)
        
        # Склад
        warehouse = _s(getattr(doc, 'warehouse', '')) or _s(getattr(doc, 'sandelis', ''))
        
        # Схема корреспонденции
        schema = _s(getattr(doc, 'koresp_schema', ''))
        
        # Валюта
        currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
        currency_code = "" if currency == "EUR" else currency
        currency_rate = ""
        if currency != "EUR":
            rate = getattr(doc, 'currency_rate', None) or getattr(doc, 'kursas', None)
            if rate:
                currency_rate = _format_decimal(rate, 4)
        
        # Примечание
        note = _s(getattr(doc, 'note', '')) or _s(getattr(doc, 'pastaba', ''))
        
        # Суммы
        # Сумма с НДС
        total_with_vat_val = _safe_D(getattr(doc, 'amount', None) or getattr(doc, 'suma', None))
        total_with_vat = _format_decimal(total_with_vat_val)
        
        # Сумма НДС
        vat_sum_val = _safe_D(getattr(doc, 'vat_amount', None) or getattr(doc, 'pvm_suma', None))
        vat_sum = _format_decimal(vat_sum_val)
        
        # Сумма без НДС
        total_without_vat_val = _safe_D(getattr(doc, 'amount_wo_vat', None) or getattr(doc, 'suma_be_pvm', None))
        total_without_vat = _format_decimal(total_without_vat_val)
        
        # Суммы в валюте
        if currency != "EUR":
            total_with_vat_cur = _format_decimal(getattr(doc, 'amount_currency', None))
            vat_sum_cur = _format_decimal(getattr(doc, 'vat_amount_currency', None))
            total_without_vat_cur = _format_decimal(getattr(doc, 'amount_wo_vat_currency', None))
        else:
            total_with_vat_cur = ""
            vat_sum_cur = ""
            total_without_vat_cur = ""
        
        # Доп. расходы (только для покупок)
        if doc_type == 1:
            transport_cost = _format_decimal(getattr(doc, 'transport_cost', None))
            customs_cost = _format_decimal(getattr(doc, 'customs_cost', None))
            other_cost = _format_decimal(getattr(doc, 'other_cost', None))
        else:
            transport_cost = ""
            customs_cost = ""
            other_cost = ""
        
        # Проект
        project_code = _s(getattr(doc, 'project_code', '')) or _s(getattr(doc, 'projektas', ''))
        
        # FR0564 признак (для i.SAF)
        fr_flag = ""
        isaf_code = getattr(doc, 'isaf_code', None) or getattr(doc, 'fr0564', None)
        if isaf_code in (13, 14, 18):
            fr_flag = str(isaf_code)
        
        # Дата оплаты
        pay_date = getattr(doc, 'payment_date', None) or getattr(doc, 'apmokejimo_data', None)
        payment_date = _format_date(pay_date)
        
        # Формируем строку
        line = _build_line(
            doc_id,                    # 1. Dokumento ID
            doc_type,                  # 2. Dokumento tipas
            return_flag,               # 3. Grąžinimo dok. požymis
            _format_date(op_date),     # 4. Dokumento data
            _format_date(inv_date),    # 5. Sąskaitos išrašymo data
            doc_number,                # 6. Dokumento numeris
            party_code,                # 7. Įmonės kodas
            "",                        # 8. (rezerv)
            warehouse,                 # 9. Sandėlis
            schema,                    # 10. Sąsk. korespondavimo schema
            currency_code,             # 11. Valiutos kodas
            currency_rate,             # 12. Valiutos kursas
            note,                      # 13. Pastaba
            total_with_vat,            # 14. Dok. suma
            total_with_vat_cur,        # 15. Dok. suma valiuta
            vat_sum,                   # 16. PVM suma
            vat_sum_cur,               # 17. PVM suma valiuta
            total_without_vat,         # 18. Prekių suma
            total_without_vat_cur,     # 19. Prekių suma valiuta
            transport_cost,            # 20. Transporto išlaidų suma
            customs_cost,              # 21. Muito išlaidų suma
            other_cost,                # 22. Kitų pridėtinių išlaidų suma
            project_code,              # 23. Projekto kodas
            fr_flag,                   # 24. FR0564 požymis
            payment_date               # 25. Vėliausia apmokėjimo data
        )
        
        lines.append(line)
        logger.info("[PRAGMA:DOC] exported doc_id=%s type=%s number=%s", doc_id, doc_type, doc_number)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:DOC] total documents exported: %d", len(lines))
    return result


# =========================
# 2) ТОВАРЫ ДОКУМЕНТА (Dokumento prekių duomenys)
# =========================

def export_document_items_to_pragma(documents):
    """
    Экспорт товарных позиций документов в формат Pragma 3.2.
    
    Поля товара:
    1. Dokumento ID - связь с документом
    2. Prekės kodas - код товара
    3. Kiekis - количество
    4. Kaina be PVM su nuolaida - цена без НДС с учетом скидки (за 1 шт)
    5. PVM tarifas - ставка НДС (21 для 21%)
    6. PVM suma - сумма НДС (на всю позицию)
    7. Nuolaidos suma - сумма скидки (на всю позицию, только инфо)
    8. Pridėtinės išlaidos - дополнительные расходы
    9. Kaina be PVM valiuta - цена без НДС в валюте (за 1 шт)
    10. PVM suma valiuta - сумма НДС в валюте
    11. Nuolaidos suma valiuta - сумма скидки в валюте (за 1 шт)
    12. Sumos deb. sąskaita - счет дебета
    13. Sumos kred. sąskaita - счет кредита
    14. Savikainos deb. sąskaita - счет дебета себестоимости (не для покупок)
    15. Savikainos kred. sąskaita - счет кредита себестоимости (не для покупок)
    16. PVM kodas (i.SAF) - код НДС для i.SAF
    17. Pastaba - примечание
    18. Projekto kodas - код проекта
    """
    lines = []
    
    for doc in documents or []:
        doc_id = getattr(doc, 'pk', None) or getattr(doc, 'id', None)
        if not doc_id:
            continue
        
        doc_type, _ = _detect_document_type(doc)
        currency = (_s(getattr(doc, 'currency', '')) or 'EUR').upper()
        
        # Получаем товарные позиции
        line_items = getattr(doc, 'line_items', None)
        has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
        
        if has_items:
            # Обработка документа с позициями
            for item in line_items.all():
                item_line = _export_single_item(
                    doc_id, doc_type, currency, item, doc, is_from_lines=True
                )
                if item_line:
                    lines.append(item_line)
        else:
            # Документ без позиций - создаем одну позицию из данных документа
            item_line = _export_single_item(
                doc_id, doc_type, currency, None, doc, is_from_lines=False
            )
            if item_line:
                lines.append(item_line)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:ITEMS] total items exported: %d", len(lines))
    return result


def _export_single_item(doc_id, doc_type, currency, item, doc, is_from_lines=True):
    """Экспорт одной товарной позиции."""
    
    # Код товара
    if is_from_lines:
        item_code = (
            _s(getattr(item, 'prekes_kodas', ''))
            or _s(getattr(item, 'prekes_barkodas', ''))
            or _s(getattr(doc, 'prekes_kodas', ''))
            or "PREKE001"
        )
    else:
        item_code = _s(getattr(doc, 'prekes_kodas', '')) or "PREKE001"
    
    # Количество
    if is_from_lines:
        quantity = _format_decimal(getattr(item, 'quantity', 1))
    else:
        quantity = "1.00"
    
    # Цена без НДС (уже с учетом скидки)
    if is_from_lines:
        price_wo_vat = _format_decimal(getattr(item, 'price', 0))
    else:
        price_wo_vat = _format_decimal(getattr(doc, 'amount_wo_vat', 0))
    
    # Ставка НДС
    if is_from_lines:
        vat_percent = _s(getattr(item, 'vat_percent', 0))
    else:
        vat_percent = _s(getattr(doc, 'vat_percent', 0))
    # Убираем знак % если есть
    vat_percent = vat_percent.replace('%', '').strip()
    
    # Сумма НДС (на всю позицию)
    if is_from_lines:
        vat_sum = _format_decimal(getattr(item, 'vat', 0))
    else:
        vat_sum = _format_decimal(getattr(doc, 'vat_amount', 0))
    
    # Сумма скидки
    if is_from_lines:
        discount_sum = _format_decimal(getattr(item, 'discount_amount', 0))
    else:
        discount_sum = _format_decimal(getattr(doc, 'invoice_discount_wo_vat', 0))
    
    # Дополнительные расходы
    if is_from_lines:
        additional_cost = _format_decimal(getattr(item, 'additional_cost', 0))
    else:
        additional_cost = ""
    
    # Валютные поля
    if currency == "EUR":
        price_currency = ""
        vat_sum_currency = ""
        discount_sum_currency = ""
    else:
        if is_from_lines:
            price_currency = _format_decimal(getattr(item, 'price_currency', 0))
            vat_sum_currency = _format_decimal(getattr(item, 'vat_currency', 0))
            discount_sum_currency = _format_decimal(getattr(item, 'discount_amount_currency', 0))
        else:
            price_currency = _format_decimal(getattr(doc, 'amount_wo_vat_currency', 0))
            vat_sum_currency = _format_decimal(getattr(doc, 'vat_amount_currency', 0))
            discount_sum_currency = _format_decimal(getattr(doc, 'invoice_discount_wo_vat_currency', 0))
    
    # Счета
    if is_from_lines:
        debit_account = _s(getattr(item, 'debit_account', ''))
        credit_account = _s(getattr(item, 'credit_account', ''))
        cost_debit_account = _s(getattr(item, 'cost_debit_account', ''))
        cost_credit_account = _s(getattr(item, 'cost_credit_account', ''))
    else:
        debit_account = _s(getattr(doc, 'debit_account', ''))
        credit_account = _s(getattr(doc, 'credit_account', ''))
        cost_debit_account = ""
        cost_credit_account = ""
    
    # Счета себестоимости не используются для покупок
    if doc_type == 1:
        cost_debit_account = ""
        cost_credit_account = ""
    
    # PVM код для i.SAF
    if is_from_lines:
        # Проверяем наличие маппинга для multi-rate документов
        line_map = getattr(doc, '_pvm_line_map', None)
        if line_map is not None:
            pvm_code = line_map.get(getattr(item, 'id', None), '')
        else:
            pvm_code = _s(getattr(item, 'pvm_kodas', ''))
    else:
        pvm_code = _s(getattr(doc, 'pvm_kodas', ''))
    
    # Примечание
    if is_from_lines:
        note = _s(getattr(item, 'note', '')) or _s(getattr(item, 'pastaba', ''))
    else:
        note = ""
    
    # Проект
    if is_from_lines:
        project_code = _s(getattr(item, 'project_code', ''))
    else:
        project_code = _s(getattr(doc, 'project_code', ''))
    
    # Формируем строку
    line = _build_line(
        doc_id,                 # 1. Dokumento ID
        item_code,              # 2. Prekės kodas
        quantity,               # 3. Kiekis
        price_wo_vat,           # 4. Kaina be PVM su nuolaida
        vat_percent,            # 5. PVM tarifas
        vat_sum,                # 6. PVM suma
        discount_sum,           # 7. Nuolaidos suma
        additional_cost,        # 8. Pridėtinės išlaidos
        price_currency,         # 9. Kaina be PVM valiuta
        vat_sum_currency,       # 10. PVM suma valiuta
        discount_sum_currency,  # 11. Nuolaidos suma valiuta
        debit_account,          # 12. Sumos deb. sąskaita
        credit_account,         # 13. Sumos kred. sąskaita
        cost_debit_account,     # 14. Savikainos deb. sąskaita
        cost_credit_account,    # 15. Savikainos kred. sąskaita
        pvm_code,               # 16. PVM kodas (i.SAF)
        note,                   # 17. Pastaba
        project_code            # 18. Projekto kodas
    )
    
    logger.info("[PRAGMA:ITEM] doc_id=%s item_code=%s qty=%s", doc_id, item_code, quantity)
    return line


# =========================
# 3) КОМПАНИИ (Įmonių duomenys)
# =========================

def export_companies_to_pragma(companies=None, documents=None):
    """
    Экспорт компаний в формат Pragma 3.2.
    
    Поля компании:
    1. Įmonės ID - уникальный идентификатор
    2. Trumpas įmonės pavadinimas - краткое название (УНИКАЛЬНОЕ!)
    3. Įmonės kodas - код компании
    4. Pavadinimas - полное название
    5. Adresas - адрес
    6. PVM mokėtojo kodas - код плательщика НДС
    7. Banko kodas - код банка
    8. Atsiskaitomoji sąskaita - расчетный счет
    9. Šalies kodas - код страны (2 буквы)
    10. Telefonas - телефон
    11. Kontaktinis asmuo - контактное лицо
    12. E-mail - email
    13. Įmonės tipas - тип компании (0=юр.лицо, 1=физ.лицо)
    """
    lines = []
    seen_codes = set()
    
    # 1) Извлекаем компании из документов
    if documents:
        logger.info("[PRAGMA:COMPANY] collect from documents: %d", len(documents))
        for doc in documents or []:
            doc_type, _ = _detect_document_type(doc)
            
            if doc_type == 1:  # покупка - нужен seller
                company_data = _extract_company_from_doc(doc, 'seller')
                if company_data and company_data['code'] not in seen_codes:
                    lines.append(_build_company_line(company_data))
                    seen_codes.add(company_data['code'])
                    
            elif doc_type == 2:  # продажа - нужен buyer
                company_data = _extract_company_from_doc(doc, 'buyer')
                if company_data and company_data['code'] not in seen_codes:
                    lines.append(_build_company_line(company_data))
                    seen_codes.add(company_data['code'])
    
    # 2) Компании, переданные вручную
    if companies:
        logger.info("[PRAGMA:COMPANY] collect from companies list: %d", len(companies))
        for company in companies or []:
            company_code = (
                _s(company.get('code'))
                or _s(company.get('id'))
                or _s(company.get('vat'))
                or _s(company.get('id_programoje'))
            )
            
            if company_code and company_code not in seen_codes:
                lines.append(_build_company_line(company))
                seen_codes.add(company_code)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:COMPANY] total companies exported: %d", len(lines))
    return result


def _extract_company_from_doc(doc, party_type):
    """Извлекает данные компании из документа."""
    if party_type == 'seller':
        prefix = 'seller_'
    elif party_type == 'buyer':
        prefix = 'buyer_'
    else:
        return None
    
    code = (
        _s(getattr(doc, f'{prefix}id', ''))
        or _s(getattr(doc, f'{prefix}vat_code', ''))
        or _s(getattr(doc, f'{prefix}id_programoje', ''))
    )
    
    if not code:
        return None
    
    name = _s(getattr(doc, f'{prefix}name', '')) or 'Nezinoma'
    
    return {
        'id': code,  # используем код как ID
        'short_name': code,  # короткое название = код
        'code': _s(getattr(doc, f'{prefix}id', '')),
        'name': name,
        'address': _s(getattr(doc, f'{prefix}address', '')),
        'vat': _s(getattr(doc, f'{prefix}vat_code', '')),
        'bank_code': '',
        'account': _s(getattr(doc, f'{prefix}iban', '')),
        'country': _s(getattr(doc, f'{prefix}country_iso', '')).upper(),
        'phone': _s(getattr(doc, f'{prefix}phone', '')),
        'contact': _s(getattr(doc, f'{prefix}contact', '')),
        'email': _s(getattr(doc, f'{prefix}email', '')),
        'is_person': 1 if getattr(doc, f'{prefix}is_person', False) else 0
    }


def _build_company_line(company):
    """Формирует строку CSV для одной компании."""
    company_id = _s(company.get('id', ''))
    short_name = _s(company.get('short_name', '')) or company_id
    code = _s(company.get('code', ''))
    name = _s(company.get('name', '')) or 'Nezinoma'
    address = _s(company.get('address', ''))
    vat = _s(company.get('vat', ''))
    bank_code = _s(company.get('bank_code', ''))
    account = _s(company.get('account', ''))
    country = _s(company.get('country', '')).upper()
    phone = _s(company.get('phone', ''))
    contact = _s(company.get('contact', ''))
    email = _s(company.get('email', ''))
    is_person = str(company.get('is_person', 0))
    
    line = _build_line(
        company_id,     # 1. Įmonės ID
        short_name,     # 2. Trumpas įmonės pavadinimas
        code,           # 3. Įmonės kodas
        name,           # 4. Pavadinimas
        address,        # 5. Adresas
        vat,            # 6. PVM mokėtojo kodas
        bank_code,      # 7. Banko kodas
        account,        # 8. Atsiskaitomoji sąskaita
        country,        # 9. Šalies kodas
        phone,          # 10. Telefonas
        contact,        # 11. Kontaktinis asmuo
        email,          # 12. E-mail
        is_person       # 13. Įmonės tipas
    )
    
    logger.info("[PRAGMA:COMPANY] exported company_id=%s name=%s", company_id, short_name)
    return line


# =========================
# 4) ТОВАРЫ (Prekių duomenys)
# =========================

def export_products_to_pragma(products=None, documents=None):
    """
    Экспорт товаров в формат Pragma 3.2.
    
    Поля товара:
    1. Prekės ID - уникальный идентификатор
    2. Prekės kodas - код товара (Nom.Nr., УНИКАЛЬНЫЙ!)
    3. Pavadinimas - название
    4. Mato vienetas - единица измерения
    5. Prekė ar paslauga - 0=товар, 1=услуга
    6. Muitinės kodas - код таможни
    7. Svoris - вес
    8. Kiekis įpakavime - количество в упаковке
    9. Įpakavimo rūšis - тип упаковки
    """
    lines = []
    seen_codes = set()
    
    # 1) Извлекаем товары из документов
    if documents:
        logger.info("[PRAGMA:PRODUCT] collect from documents: %d", len(documents))
        for doc in documents or []:
            line_items = getattr(doc, 'line_items', None)
            has_items = bool(line_items and hasattr(line_items, 'all') and line_items.exists())
            
            if has_items:
                for item in line_items.all():
                    product_data = _extract_product_from_item(item, doc)
                    if product_data and product_data['code'] not in seen_codes:
                        lines.append(_build_product_line(product_data))
                        seen_codes.add(product_data['code'])
            else:
                product_data = _extract_product_from_doc(doc)
                if product_data and product_data['code'] not in seen_codes:
                    lines.append(_build_product_line(product_data))
                    seen_codes.add(product_data['code'])
    
    # 2) Товары, переданные вручную
    if products:
        logger.info("[PRAGMA:PRODUCT] collect from products list: %d", len(products))
        for product in products or []:
            product_code = (
                _s(product.get('code'))
                or _s(product.get('barcode'))
                or _s(product.get('id'))
            )
            
            if product_code and product_code not in seen_codes:
                lines.append(_build_product_line(product))
                seen_codes.add(product_code)
    
    result = b''.join(lines)
    logger.info("[PRAGMA:PRODUCT] total products exported: %d", len(lines))
    return result


def _extract_product_from_item(item, doc):
    """Извлекает данные товара из позиции документа."""
    code = (
        _s(getattr(item, 'prekes_kodas', ''))
        or _s(getattr(item, 'prekes_barkodas', ''))
        or _s(getattr(doc, 'prekes_kodas', ''))
    )
    
    if not code:
        return None
    
    name = _s(getattr(item, 'prekes_pavadinimas', '')) or _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
    unit = _s(getattr(item, 'unit', '')) or _s(getattr(doc, 'unit', '')) or 'vnt.'
    
    # Определяем тип: 0=товар, 1=услуга
    preke_paslauga = getattr(item, 'preke_paslauga', None) or getattr(doc, 'preke_paslauga', None)
    if preke_paslauga in ('2', 2, 'paslauga'):
        is_service = 1
    else:
        is_service = 0
    
    return {
        'id': code,
        'code': code,
        'name': name,
        'unit': unit,
        'is_service': is_service,
        'customs_code': _s(getattr(item, 'customs_code', '')),
        'weight': _s(getattr(item, 'weight', '')),
        'pack_qty': _s(getattr(item, 'pack_qty', '')),
        'pack_type': _s(getattr(item, 'pack_type', ''))
    }


def _extract_product_from_doc(doc):
    """Извлекает данные товара из документа без позиций."""
    code = _s(getattr(doc, 'prekes_kodas', ''))
    
    if not code:
        return None
    
    name = _s(getattr(doc, 'prekes_pavadinimas', '')) or 'Prekė'
    unit = _s(getattr(doc, 'unit', '')) or 'vnt.'
    
    preke_paslauga = getattr(doc, 'preke_paslauga', None)
    if preke_paslauga in ('2', 2, 'paslauga'):
        is_service = 1
    else:
        is_service = 0
    
    return {
        'id': code,
        'code': code,
        'name': name,
        'unit': unit,
        'is_service': is_service,
        'customs_code': '',
        'weight': '',
        'pack_qty': '',
        'pack_type': ''
    }


def _build_product_line(product):
    """Формирует строку CSV для одного товара."""
    product_id = _s(product.get('id', ''))
    code = _s(product.get('code', ''))
    name = _s(product.get('name', '')) or 'Prekė'
    unit = _s(product.get('unit', '')) or 'vnt.'
    is_service = str(product.get('is_service', 0))
    customs_code = _s(product.get('customs_code', ''))
    weight = _format_decimal(product.get('weight', 0), 3) if product.get('weight') else ""
    pack_qty = _format_decimal(product.get('pack_qty', 0), 2) if product.get('pack_qty') else ""
    pack_type = _s(product.get('pack_type', ''))
    
    line = _build_line(
        product_id,     # 1. Prekės ID
        code,           # 2. Prekės kodas
        name,           # 3. Pavadinimas
        unit,           # 4. Mato vienetas
        is_service,     # 5. Prekė ar paslauga
        customs_code,   # 6. Muitinės kodas
        weight,         # 7. Svoris
        pack_qty,       # 8. Kiekis įpakavime
        pack_type       # 9. Įpakavimo rūšis
    )
    
    logger.info("[PRAGMA:PRODUCT] exported product_id=%s code=%s", product_id, code)
    return line


# =========================
# ГЛАВНАЯ ФУНКЦИЯ ЭКСПОРТА
# =========================

def export_to_pragma_full(documents, include_reference_data=True):
    """
    Полный экспорт в формат Pragma 3.2.
    
    Args:
        documents: список документов для экспорта
        include_reference_data: если True, экспортируются также компании и товары
    
    Returns:
        dict с ключами:
            - 'documents': CSV с документами
            - 'items': CSV с позициями документов
            - 'companies': CSV с компаниями (если include_reference_data=True)
            - 'products': CSV с товарами (если include_reference_data=True)
    """
    result = {}
    
    # Обязательные файлы
    result['documents'] = export_documents_to_pragma(documents)
    result['items'] = export_document_items_to_pragma(documents)
    
    # Справочники (опционально)
    if include_reference_data:
        result['companies'] = export_companies_to_pragma(documents=documents)
        result['products'] = export_products_to_pragma(documents=documents)
    
    logger.info("[PRAGMA:EXPORT] full export completed")
    return result


# =========================
# СОХРАНЕНИЕ В ФАЙЛЫ
# =========================

def save_pragma_export_to_files(export_data, base_filename='pragma_export'):
    """
    Сохраняет результаты экспорта в файлы с кодировкой Windows-1257.
    
    Args:
        export_data: результат от export_to_pragma_full()
        base_filename: базовое имя файла
    
    Returns:
        dict с путями к созданным файлам
    """
    files = {}
    
    for key, content in export_data.items():
        if not content:
            continue
        
        # Определяем имя файла
        if key == 'documents':
            filename = f'{base_filename}_pardavimai.txt'
        elif key == 'items':
            filename = f'{base_filename}_pardavimai_det.txt'
        elif key == 'companies':
            filename = f'{base_filename}_Imones.txt'
        elif key == 'products':
            filename = f'{base_filename}_Prekes.txt'
        else:
            filename = f'{base_filename}_{key}.txt'
        
        # Сохраняем с кодировкой Windows-1257 (контент уже закодирован)
        try:
            filepath = f'/mnt/user-data/outputs/{filename}'
            with open(filepath, 'wb') as f:
                f.write(content)
            files[key] = filepath
            logger.info("[PRAGMA:SAVE] saved %s -> %s (%d bytes)", key, filepath, len(content))
        except Exception as e:
            logger.error("[PRAGMA:SAVE] error saving %s: %s", key, e)
    
    return files