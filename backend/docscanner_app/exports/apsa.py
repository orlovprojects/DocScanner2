"""
APSA Export Module for DokSkenas
================================

Экспорт документов в формат i.SAF XML для программы APSA.
i.SAF (i.MAS Standartinė Apskaitos Rinkmena) - стандартный формат VMI Литвы.

СТРУКТУРА i.SAF:
1. Header - информация о файле и периоде
2. MasterFiles - справочники Customers/Suppliers (опционально, не используем)
3. SourceDocuments - PurchaseInvoices / SalesInvoices

ВАЖНО: APSA использует ТОЛЬКО стандартный i.SAF формат.
НЕТ дополнительных полей типа "objektas", "padalinys", "sandelis" и т.д.
(в отличие от Rivile, Būtent и других систем)

LINE ITEMS: i.SAF НЕ содержит отдельных строк товаров!
Вместо этого используется группировка по ставкам НДС в DocumentTotals.
Каждый DocumentTotal содержит сумму всех строк с одинаковой ставкой.
"""

import logging
import re
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import date, datetime
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


# =============================================================================
# КОНСТАНТЫ И ЛИМИТЫ ИЗ XSD
# =============================================================================

ISAF_VERSION = "iSAF1.2"
ISAF_NAMESPACE = "http://www.vmi.lt/cms/imas/isaf"

SOFTWARE_COMPANY = "DokSkenas"
SOFTWARE_NAME = "DokSkenas"
SOFTWARE_VERSION = "1.0"

# DataType для Header
DATA_TYPE_FULL = "F"       # Полный файл (pirkimas + pardavimas)
DATA_TYPE_SALES = "S"      # Только продажи (pardavimas)
DATA_TYPE_PURCHASE = "P"   # Только покупки (pirkimas)

# Страны ЕС (для определения Country в i.SAF)
EU_ISO2 = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
}


# =============================================================================
# XSD ОГРАНИЧЕНИЯ ПОЛЕЙ
# =============================================================================

class ISAFLimits:
    """
    Ограничения полей из isaf_1_2.xsd
    
    Типы:
    - ISAFmiddletextType: max 24
    - ISAFmiddle1textType: max 35
    - ISAFmiddle2textType: max 70
    - ISAFlongtextType: max 256
    - ISAFRegistrationNumberType: max 11 цифр
    - ISAFCountryCodeISO: ровно 2 символа
    - ISAFTaxCodeType: pattern PVM[0-9]*, min 4, max 6 (например PVM1, PVM21, PVM100)
    - ISAFmonetaryType: max 18 цифр, 2 знака после запятой
    - ISAFquantityType: max 5 цифр, 2 знака после запятой (для TaxPercentage)
    """
    
    # Длины строк
    MIDDLE_TEXT = 24           # ISAFmiddletextType (SoftwareVersion)
    MIDDLE1_TEXT = 35          # ISAFmiddle1textType (VATRegistrationNumber, RegistrationNumber)
    MIDDLE2_TEXT = 70          # ISAFmiddle2textType (InvoiceNo, SupplierID, CustomerID)
    LONG_TEXT = 256            # ISAFlongtextType (Name, SoftwareCompanyName, SoftwareName)
    
    # Специальные
    REGISTRATION_NUMBER = 11   # ИНН компании (только цифры)
    COUNTRY_CODE = 2           # ISO код страны
    TAX_CODE_MIN = 4           # PVM код минимум
    TAX_CODE_MAX = 6           # PVM код максимум
    PART_NUMBER = 20           # PartNumber
    
    # Числовые
    MONETARY_DIGITS = 18       # Всего цифр для сумм
    MONETARY_FRACTION = 2      # Знаков после запятой
    QUANTITY_DIGITS = 5        # Всего цифр для TaxPercentage
    QUANTITY_FRACTION = 2      # Знаков после запятой


# =============================================================================
# МАППИНГ ПОЛЕЙ: DokSkenas -> i.SAF
# =============================================================================
"""
ПОЛНЫЙ МАППИНГ ПОЛЕЙ

╔══════════════════════════════════════════════════════════════════════════════╗
║ i.SAF XML TAG              │ DokSkenas поле           │ Лимит  │ Примечание  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ HEADER / FileDescription                                                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ FileVersion                │ "iSAF1.2" (константа)    │ -      │ Фиксировано ║
║ FileDateCreated            │ datetime.now()           │ -      │ ISO datetime║
║ DataType                   │ F/P/S (авто)             │ 1      │ F=оба,P=пок,S=прод║
║ SoftwareCompanyName        │ "DokSkenas" (константа)  │ 256    │             ║
║ SoftwareName               │ "DokSkenas" (константа)  │ 256    │             ║
║ SoftwareVersion            │ "1.0" (константа)        │ 24     │             ║
║ RegistrationNumber         │ user.company_code        │ 11     │ ИНН компании║
║ NumberOfParts              │ 1 (константа)            │ -      │             ║
║ PartNumber                 │ "1" (константа)          │ 20     │             ║
║ SelectionStartDate         │ start_date (параметр)    │ -      │ YYYY-MM-DD  ║
║ SelectionEndDate           │ end_date (параметр)      │ -      │ YYYY-MM-DD  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ PURCHASE INVOICE (pirkimas)                                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ InvoiceNo                  │ build_dok_nr(series,num) │ 70     │ Серия+номер ║
║ SupplierInfo/SupplierID    │ seller_id_programoje     │ 70     │ Опционально ║
║ SupplierInfo/VATRegNumber  │ seller_vat_code или "ND" │ 35     │ Обязательно ║
║ SupplierInfo/RegNumber     │ get_party_code(seller)   │ 35     │ Если VAT=ND ║
║ SupplierInfo/Country       │ seller_country_iso       │ 2      │ Если VAT=ND ║
║ SupplierInfo/Name          │ seller_name или "ND"     │ 256    │ Обязательно ║
║ InvoiceDate                │ invoice_date             │ -      │ YYYY-MM-DD  ║
║ InvoiceType                │ "SF" (только обычные)    │ 2      │ SF/DS/KS/AN ║
║ SpecialTaxation            │ "" (не используем)       │ 1      │ T или пусто ║
║ References                 │ [] (пусто)               │ -      │ Для KS/DS   ║
║ VATPointDate               │ operation_date           │ -      │ Если ≠ inv  ║
║ RegistrationAccountDate    │ registration_date        │ -      │ Опционально ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ SALES INVOICE (pardavimas)                                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ InvoiceNo                  │ build_dok_nr(series,num) │ 70     │ Серия+номер ║
║ CustomerInfo/CustomerID    │ buyer_id_programoje      │ 70     │ Опционально ║
║ CustomerInfo/VATRegNumber  │ buyer_vat_code или "ND"  │ 35     │ Обязательно ║
║ CustomerInfo/RegNumber     │ get_party_code(buyer)    │ 35     │ Если VAT=ND ║
║ CustomerInfo/Country       │ buyer_country_iso        │ 2      │ Если VAT=ND ║
║ CustomerInfo/Name          │ buyer_name или "ND"      │ 256    │ Обязательно ║
║ InvoiceDate                │ invoice_date             │ -      │ YYYY-MM-DD  ║
║ InvoiceType                │ "SF" (только обычные)    │ 2      │             ║
║ SpecialTaxation            │ "" (не используем)       │ 1      │             ║
║ References                 │ [] (пусто)               │ -      │             ║
║ VATPointDate               │ operation_date           │ -      │ Если ≠ inv  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ DOCUMENT TOTALS (группировка по ставкам НДС)                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ TaxableValue               │ Σ(amount_wo_vat) по ставке│ 18,2  │ Сумма без НДС║
║ TaxCode                    │ pvm_kodas (PVM1, PVM2...)│ 4-6    │ Nullable    ║
║ TaxPercentage              │ vat_percent              │ 5,2    │ 0/9/21 и т.д║
║ Amount                     │ Σ(vat_amount) по ставке  │ 18,2   │ Сумма НДС   ║
║ VATPointDate2              │ operation_date (Sales)   │ -      │ Только Sales║
╠══════════════════════════════════════════════════════════════════════════════╣
║ LINE ITEMS                                                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ i.SAF НЕ СОДЕРЖИТ строк товаров!                                             ║
║ Строки используются ТОЛЬКО для группировки сумм по ставкам НДС.              ║
║ Каждый DocumentTotal = сумма всех line_items с одинаковым vat_percent.       ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""


# =============================================================================
# ВАЛИДАТОРЫ И HELPERS (из DokSkenas)
# =============================================================================

def _s(v) -> str:
    """Безопасная строка с strip()."""
    return str(v).strip() if v is not None else ""


def _safe_D(x) -> Decimal:
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def truncate_str(value: str, max_length: int) -> str:
    """
    Обрезает строку до максимальной длины.
    Используется для соблюдения XSD лимитов.
    """
    s = _s(value)
    if len(s) > max_length:
        logger.warning(
            "[APSA:TRUNCATE] Value truncated: '%s...' -> %d chars",
            s[:20], max_length
        )
        return s[:max_length]
    return s


def validate_tax_code(tax_code: str) -> Optional[str]:
    """
    Валидирует PVM код по XSD правилам.
    Pattern: PVM[0-9]*, minLength: 4, maxLength: 6
    
    Примеры валидных: PVM1, PVM2, PVM9, PVM21, PVM100
    """
    if not tax_code:
        return None
    
    code = _s(tax_code).upper()
    
    # Проверяем паттерн
    if not re.match(r'^PVM\d+$', code):
        logger.warning("[APSA:VALIDATE] Invalid tax code format: %s", code)
        return None
    
    # Проверяем длину
    if len(code) < ISAFLimits.TAX_CODE_MIN or len(code) > ISAFLimits.TAX_CODE_MAX:
        logger.warning("[APSA:VALIDATE] Tax code length invalid: %s", code)
        return None
    
    return code


def validate_country_code(country: str) -> str:
    """
    Валидирует ISO код страны (ровно 2 символа).
    """
    code = _s(country).upper()
    if len(code) != ISAFLimits.COUNTRY_CODE:
        return ""
    return code


def validate_registration_number(reg_num: str) -> str:
    """
    Валидирует ИНН компании (до 11 цифр).
    """
    num = _s(reg_num)
    # Убираем всё кроме цифр
    digits = re.sub(r'\D', '', num)
    if len(digits) > ISAFLimits.REGISTRATION_NUMBER:
        digits = digits[:ISAFLimits.REGISTRATION_NUMBER]
    return digits


def build_dok_nr(series: str, number: str) -> str:
    """
    Формирует номер документа из серии и номера.
    Убирает дублирование серии в номере.
    
    Примеры:
        ("AB", "123") -> "AB123"
        ("AB", "AB123") -> "AB123"
        ("AB", "AB-123") -> "AB123"
        ("", "123") -> "123"
        ("AB", "") -> "AB"
    """
    s = _s(series)
    n = _s(number)
    
    if not s:
        return n
    if not n:
        return s
    
    # Если номер начинается с серии - убираем дублирование
    if n.upper().startswith(s.upper()):
        tail = n[len(s):]
        # Убираем разделители в начале
        tail = tail.lstrip("-/ .")
        return f"{s}{tail}"
    
    return f"{s}{n}"


def get_party_code(
    doc,
    *,
    role: str,
    id_field: str,
    vat_field: str,
    id_programoje_field: str,
) -> str:
    """
    Код стороны (seller/buyer) по приоритету:
      1) *_id (ИНН/код компании)
      2) *_vat_code (PVM код)
      3) *_id_programoje (внутренний код в учётной системе)
    
    Если все пусто — вернётся "".
    """
    # Приоритет 1: ID (ИНН)
    sid = _s(getattr(doc, id_field, None))
    if sid:
        logger.debug("[APSA:PARTY] %s: %s -> %s", role, id_field, sid)
        return sid
    
    # Приоритет 2: VAT код
    svat = _s(getattr(doc, vat_field, None))
    if svat:
        logger.debug("[APSA:PARTY] %s: %s -> %s", role, vat_field, svat)
        return svat
    
    # Приоритет 3: ID в программе
    sidp = _s(getattr(doc, id_programoje_field, None))
    if sidp:
        logger.debug("[APSA:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
        return sidp
    
    return ""


def _format_decimal(value, decimals: int = 2) -> str:
    """
    Форматирует Decimal в строку с фиксированным количеством знаков.
    i.SAF требует формат "123.45" (точка как разделитель).
    """
    try:
        d = Decimal(str(value))
        rounded = d.quantize(Decimal(10) ** -decimals, rounding=ROUND_HALF_UP)
        return str(rounded)
    except Exception:
        return "0.00"


def _format_date(dt) -> str:
    """
    Форматирует дату в ISO формат YYYY-MM-DD для i.SAF.
    """
    if not dt:
        return ""
    if isinstance(dt, str):
        # Пробуем разные форматы
        for fmt in ["%Y-%m-%d", "%Y.%m.%d", "%d.%m.%Y", "%d/%m/%Y"]:
            try:
                dt = datetime.strptime(dt, fmt).date()
                break
            except ValueError:
                continue
        else:
            return ""
    if isinstance(dt, (date, datetime)):
        return dt.strftime("%Y-%m-%d")
    return ""


def _format_datetime(dt=None) -> str:
    """
    Форматирует datetime в ISO формат для FileDateCreated.
    """
    if dt is None:
        dt = datetime.now()
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def _is_eu_country(iso: str) -> bool:
    """True только для ISO2 из списка ЕС."""
    if not iso:
        return False
    return _s(iso).upper() in EU_ISO2


# =============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ i.SAF
# =============================================================================

def _get_vat_code(vat_code: str) -> str:
    """
    Возвращает VAT код или "ND" если пусто.
    ND = Nėra duomenų (нет данных).
    """
    v = truncate_str(vat_code, ISAFLimits.MIDDLE1_TEXT)
    return v if v else "ND"


def _get_party_name(doc, role: str) -> str:
    """
    Получает имя контрагента или "ND" если пусто.
    """
    if role == "seller":
        name = _s(getattr(doc, "seller_name", ""))
    else:
        name = _s(getattr(doc, "buyer_name", ""))
    
    name = truncate_str(name, ISAFLimits.LONG_TEXT)
    return name if name else "ND"


def _get_country_iso(doc, role: str) -> str:
    """
    Получает и валидирует ISO код страны.
    """
    if role == "seller":
        country = _s(getattr(doc, "seller_country_iso", ""))
    else:
        country = _s(getattr(doc, "buyer_country_iso", ""))
    
    return validate_country_code(country)


def _get_invoice_number(doc) -> str:
    """
    Формирует номер счёта используя build_dok_nr.
    """
    series = _s(getattr(doc, "document_series", ""))
    number = _s(getattr(doc, "document_number", ""))
    
    result = build_dok_nr(series, number)
    result = truncate_str(result, ISAFLimits.MIDDLE2_TEXT)
    
    return result if result else "ND"


def _should_include_in_isaf(doc) -> bool:
    """
    Проверяет, нужно ли включать документ в i.SAF.
    """
    # Проверяем явный флаг исключения
    if getattr(doc, "isaf_exclude", False):
        return False
    
    # Проверяем isaf_tipas (если есть)
    isaf_tipas = _s(getattr(doc, "isaf_tipas", ""))
    if isaf_tipas == "12":  # Neformuoti
        return False
    
    return True


def _group_vat_totals(doc) -> List[Dict[str, Any]]:
    """
    Группирует суммы документа по ставкам НДС.
    
    i.SAF требует разбивку DocumentTotal по каждой уникальной комбинации
    ставки НДС. Каждый DocumentTotal содержит:
    - TaxableValue: сумма без НДС всех строк с этой ставкой
    - TaxCode: PVM код (PVM1, PVM2, и т.д.)
    - TaxPercentage: ставка %
    - Amount: сумма НДС
    
    LINE ITEMS используются ТОЛЬКО для группировки, 
    они НЕ экспортируются в i.SAF как отдельные записи!
    
    Returns:
        List[Dict] с ключами:
        - taxable_value: Decimal - сумма без НДС
        - tax_code: str|None - PVM код
        - tax_percentage: Decimal - ставка %
        - vat_amount: Decimal - сумма НДС
    """
    line_items = getattr(doc, "line_items", None)
    
    # Если есть line_items - группируем по ним
    if line_items and hasattr(line_items, "all") and line_items.exists():
        # Ключ = (vat_percent, pvm_kodas)
        vat_groups = defaultdict(lambda: {
            "taxable": Decimal("0"),
            "vat": Decimal("0"),
            "percent": Decimal("0"),
            "tax_code": None,
        })
        
        for item in line_items.all():
            vat_percent = _safe_D(getattr(item, "vat_percent", 0))
            pvm_kodas = _s(getattr(item, "pvm_kodas", ""))
            
            # Рассчитываем subtotal для строки
            price = _safe_D(getattr(item, "price", 0))
            qty = _safe_D(getattr(item, "quantity", 1))
            
            # Используем цены после скидки если есть
            price_after = getattr(item, "_butent_price_after_discount", None)
            if price_after is not None:
                subtotal = _safe_D(price_after) * qty
            else:
                subtotal = price * qty
            
            # VAT сумма
            vat_after = getattr(item, "_butent_vat_after_discount", None)
            if vat_after is not None:
                vat_sum = _safe_D(vat_after)
            else:
                vat_sum = _safe_D(getattr(item, "vat", 0))
            
            # Ключ группировки по ставке
            key = str(vat_percent)
            vat_groups[key]["taxable"] += subtotal
            vat_groups[key]["vat"] += vat_sum
            vat_groups[key]["percent"] = vat_percent
            
            # PVM код (берём первый непустой)
            if pvm_kodas and pvm_kodas != "Keli skirtingi PVM" and not vat_groups[key]["tax_code"]:
                vat_groups[key]["tax_code"] = validate_tax_code(pvm_kodas)
        
        result = []
        for key, data in vat_groups.items():
            result.append({
                "taxable_value": data["taxable"],
                "tax_code": data["tax_code"],
                "tax_percentage": data["percent"],
                "vat_amount": data["vat"],
            })
        
        logger.debug(
            "[APSA:VAT_GROUPS] doc=%s groups=%d from %d line_items",
            getattr(doc, "pk", None),
            len(result),
            line_items.count() if hasattr(line_items, "count") else "?"
        )
        return result
    
    # Если нет line_items - берём из документа целиком (одна группа)
    taxable = _safe_D(getattr(doc, "amount_wo_vat", 0))
    vat_amount = _safe_D(getattr(doc, "vat_amount", 0))
    vat_percent = _safe_D(getattr(doc, "vat_percent", 0))
    pvm_kodas = _s(getattr(doc, "pvm_kodas", ""))
    
    # Валидируем PVM код
    tax_code = None
    if pvm_kodas and pvm_kodas != "Keli skirtingi PVM":
        tax_code = validate_tax_code(pvm_kodas)
    
    return [{
        "taxable_value": taxable,
        "tax_code": tax_code,
        "tax_percentage": vat_percent,
        "vat_amount": vat_amount,
    }]


# =============================================================================
# XML BUILDER
# =============================================================================

def _create_element(parent: ET.Element, tag: str, text: str = None, attrib: dict = None) -> ET.Element:
    """Создаёт XML элемент с текстом и атрибутами."""
    elem = ET.SubElement(parent, tag, attrib or {})
    if text is not None:
        elem.text = str(text)
    return elem


def _create_nillable_element(parent: ET.Element, tag: str, value) -> ET.Element:
    """Создаёт элемент с xsi:nil="true" если value пустой."""
    v = _s(value) if value is not None else ""
    elem = ET.SubElement(parent, tag)
    if v:
        elem.text = v
    else:
        elem.set("xsi:nil", "true")
    return elem


def _serialize_xml(elem: ET.Element, level: int = 0) -> str:
    """
    Рекурсивная сериализация XML элемента с форматированием.
    Ручная реализация для обхода потенциальных багов в ET.tostring.
    """
    indent = "  " * level
    tag = elem.tag
    
    # Атрибуты
    attrs = ""
    for key, value in elem.attrib.items():
        # Экранируем значения
        value = (value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))
        attrs += f' {key}="{value}"'
    
    # Текст элемента
    text = elem.text
    if text:
        text = (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))
    
    # Дочерние элементы
    children = list(elem)
    
    if children:
        # Есть дочерние
        result = f"{indent}<{tag}{attrs}>\n"
        for child in children:
            result += _serialize_xml(child, level + 1)
        result += f"{indent}</{tag}>\n"
    elif text:
        # Только текст
        result = f"{indent}<{tag}{attrs}>{text}</{tag}>\n"
    else:
        # Пустой элемент
        result = f"{indent}<{tag}{attrs} />\n"
    
    return result


def _build_header(
    root: ET.Element,
    registration_number: str,
    start_date: date,
    end_date: date,
    data_type: str = DATA_TYPE_FULL,
    part_number: str = "1",
    num_parts: int = 1,
) -> ET.Element:
    """Строит секцию Header i.SAF файла."""
    header = _create_element(root, "Header")
    file_desc = _create_element(header, "FileDescription")
    
    _create_element(file_desc, "FileVersion", ISAF_VERSION)
    _create_element(file_desc, "FileDateCreated", _format_datetime())
    _create_element(file_desc, "DataType", data_type)
    _create_element(file_desc, "SoftwareCompanyName", 
                   truncate_str(SOFTWARE_COMPANY, ISAFLimits.LONG_TEXT))
    _create_element(file_desc, "SoftwareName",
                   truncate_str(SOFTWARE_NAME, ISAFLimits.LONG_TEXT))
    _create_element(file_desc, "SoftwareVersion",
                   truncate_str(SOFTWARE_VERSION, ISAFLimits.MIDDLE_TEXT))
    _create_element(file_desc, "RegistrationNumber",
                   validate_registration_number(registration_number))
    _create_element(file_desc, "NumberOfParts", str(num_parts))
    _create_element(file_desc, "PartNumber",
                   truncate_str(part_number, ISAFLimits.PART_NUMBER))
    
    selection = _create_element(file_desc, "SelectionCriteria")
    _create_element(selection, "SelectionStartDate", _format_date(start_date))
    _create_element(selection, "SelectionEndDate", _format_date(end_date))
    
    return header


def _build_supplier_info(parent: ET.Element, doc) -> ET.Element:
    """
    Строит секцию SupplierInfo для PurchaseInvoice.
    
    Маппинг:
        SupplierID <- seller_id_programoje (опционально)
        VATRegistrationNumber <- seller_vat_code или "ND"
        RegistrationNumber <- get_party_code(seller) (если VAT=ND)
        Country <- seller_country_iso (если VAT=ND или не-ЕС)
        Name <- seller_name или "ND"
    """
    info = _create_element(parent, "SupplierInfo")
    
    # SupplierID (опционально)
    supplier_id = _s(getattr(doc, "seller_id_programoje", ""))
    if supplier_id:
        _create_element(info, "SupplierID",
                       truncate_str(supplier_id, ISAFLimits.MIDDLE2_TEXT))
    
    # VATRegistrationNumber (обязательно)
    vat_code = _get_vat_code(getattr(doc, "seller_vat_code", ""))
    _create_element(info, "VATRegistrationNumber", vat_code)
    
    # RegistrationNumber (если VAT = ND)
    if vat_code == "ND":
        reg_num = get_party_code(
            doc,
            role="seller",
            id_field="seller_id",
            vat_field="seller_vat_code",
            id_programoje_field="seller_id_programoje",
        )
        reg_num = truncate_str(reg_num, ISAFLimits.MIDDLE1_TEXT)
        _create_element(info, "RegistrationNumber", reg_num if reg_num else "ND")
    else:
        _create_element(info, "RegistrationNumber", "")
    
    # Country (если VAT = ND или не-ЕС)
    country = _get_country_iso(doc, "seller")
    if vat_code == "ND" or (country and not _is_eu_country(country)):
        _create_nillable_element(info, "Country", country)
    else:
        _create_nillable_element(info, "Country", "")
    
    # Name (обязательно)
    _create_element(info, "Name", _get_party_name(doc, "seller"))
    
    return info


def _build_customer_info(parent: ET.Element, doc) -> ET.Element:
    """
    Строит секцию CustomerInfo для SalesInvoice.
    
    Маппинг:
        CustomerID <- buyer_id_programoje (опционально)
        VATRegistrationNumber <- buyer_vat_code или "ND"
        RegistrationNumber <- get_party_code(buyer) (если VAT=ND)
        Country <- buyer_country_iso (если VAT=ND или не-ЕС)
        Name <- buyer_name или "ND"
    """
    info = _create_element(parent, "CustomerInfo")
    
    # CustomerID (опционально)
    customer_id = _s(getattr(doc, "buyer_id_programoje", ""))
    if customer_id:
        _create_element(info, "CustomerID",
                       truncate_str(customer_id, ISAFLimits.MIDDLE2_TEXT))
    
    # VATRegistrationNumber (обязательно)
    vat_code = _get_vat_code(getattr(doc, "buyer_vat_code", ""))
    _create_element(info, "VATRegistrationNumber", vat_code)
    
    # RegistrationNumber (если VAT = ND)
    if vat_code == "ND":
        reg_num = get_party_code(
            doc,
            role="buyer",
            id_field="buyer_id",
            vat_field="buyer_vat_code",
            id_programoje_field="buyer_id_programoje",
        )
        reg_num = truncate_str(reg_num, ISAFLimits.MIDDLE1_TEXT)
        _create_element(info, "RegistrationNumber", reg_num if reg_num else "ND")
    else:
        _create_element(info, "RegistrationNumber", "")
    
    # Country
    country = _get_country_iso(doc, "buyer")
    if vat_code == "ND" or (country and not _is_eu_country(country)):
        _create_nillable_element(info, "Country", country)
    else:
        _create_nillable_element(info, "Country", "")
    
    # Name
    _create_element(info, "Name", _get_party_name(doc, "buyer"))
    
    return info


def _build_references(parent: ET.Element, doc) -> ET.Element:
    """
    Строит секцию References.
    
    Используется для кредитных/дебетных счетов со ссылкой на оригинал.
    В DokSkenas пока не используем KS/DS, поэтому всегда пустой.
    """
    refs = _create_element(parent, "References")
    # Пустой - мы используем только SF (обычные счета)
    return refs


def _build_document_totals(parent: ET.Element, doc, is_sales: bool = False) -> ET.Element:
    """
    Строит секцию DocumentTotals.
    
    Группирует line_items по ставкам НДС.
    Каждый DocumentTotal содержит сумму всех строк с одинаковой ставкой.
    """
    totals = _create_element(parent, "DocumentTotals")
    
    vat_groups = _group_vat_totals(doc)
    
    # VATPointDate на уровне документа
    invoice_date = getattr(doc, "invoice_date", None)
    operation_date = getattr(doc, "operation_date", None)
    dates_differ = (operation_date and invoice_date and operation_date != invoice_date)
    
    for group in vat_groups:
        doc_total = _create_element(totals, "DocumentTotal")
        
        # TaxableValue (обязательно)
        _create_element(doc_total, "TaxableValue",
                       _format_decimal(group["taxable_value"]))
        
        # TaxCode (nillable)
        tax_code = group.get("tax_code")
        _create_nillable_element(doc_total, "TaxCode", tax_code)
        
        # TaxPercentage (nillable)
        tax_pct = group.get("tax_percentage")
        if tax_pct is not None and tax_pct > 0:
            _create_nillable_element(doc_total, "TaxPercentage",
                                    _format_decimal(tax_pct, 2))
        else:
            # 0% - явно указываем
            _create_nillable_element(doc_total, "TaxPercentage",
                                    "0" if tax_pct == 0 else "")
        
        # Amount (VAT сумма - nillable)
        _create_nillable_element(doc_total, "Amount",
                                _format_decimal(group["vat_amount"]))
        
        # VATPointDate2 (только для Sales и если даты различаются)
        if is_sales:
            if dates_differ:
                _create_nillable_element(doc_total, "VATPointDate2",
                                        _format_date(operation_date))
            else:
                _create_nillable_element(doc_total, "VATPointDate2", "")
    
    return totals


def _build_purchase_invoice(parent: ET.Element, doc) -> ET.Element:
    """
    Строит один элемент Invoice для PurchaseInvoices.
    
    Структура:
        InvoiceNo
        SupplierInfo
        InvoiceDate
        InvoiceType (всегда SF)
        SpecialTaxation (пусто)
        References (пусто)
        VATPointDate (если != invoice_date)
        RegistrationAccountDate (опционально)
        DocumentTotals
    """
    invoice = _create_element(parent, "Invoice")
    
    # InvoiceNo
    _create_element(invoice, "InvoiceNo", _get_invoice_number(doc))
    
    # SupplierInfo
    _build_supplier_info(invoice, doc)
    
    # InvoiceDate
    _create_element(invoice, "InvoiceDate",
                   _format_date(getattr(doc, "invoice_date", None)))
    
    # InvoiceType - ВСЕГДА SF (обычная сф)
    # DokSkenas пока не использует KS, DS, AN
    _create_element(invoice, "InvoiceType", "SF")
    
    # SpecialTaxation (не используем)
    _create_element(invoice, "SpecialTaxation", "")
    
    # References (пусто - нет KS/DS)
    _build_references(invoice, doc)
    
    # VATPointDate (если operation_date != invoice_date)
    invoice_date = getattr(doc, "invoice_date", None)
    operation_date = getattr(doc, "operation_date", None)
    if operation_date and invoice_date and operation_date != invoice_date:
        _create_nillable_element(invoice, "VATPointDate",
                                _format_date(operation_date))
    else:
        _create_nillable_element(invoice, "VATPointDate", "")
    
    # RegistrationAccountDate (дата регистрации в учёте)
    reg_date = getattr(doc, "registration_date", None)
    _create_nillable_element(invoice, "RegistrationAccountDate",
                            _format_date(reg_date) if reg_date else "")
    
    # DocumentTotals
    _build_document_totals(invoice, doc, is_sales=False)
    
    return invoice


def _build_sales_invoice(parent: ET.Element, doc) -> ET.Element:
    """
    Строит один элемент Invoice для SalesInvoices.
    
    Структура:
        InvoiceNo
        CustomerInfo
        InvoiceDate
        InvoiceType (всегда SF)
        SpecialTaxation (пусто)
        References (пусто)
        VATPointDate (если != invoice_date)
        DocumentTotals (с VATPointDate2)
    """
    invoice = _create_element(parent, "Invoice")
    
    # InvoiceNo
    _create_element(invoice, "InvoiceNo", _get_invoice_number(doc))
    
    # CustomerInfo
    _build_customer_info(invoice, doc)
    
    # InvoiceDate
    _create_element(invoice, "InvoiceDate",
                   _format_date(getattr(doc, "invoice_date", None)))
    
    # InvoiceType - ВСЕГДА SF
    _create_element(invoice, "InvoiceType", "SF")
    
    # SpecialTaxation
    _create_element(invoice, "SpecialTaxation", "")
    
    # References
    _build_references(invoice, doc)
    
    # VATPointDate
    invoice_date = getattr(doc, "invoice_date", None)
    operation_date = getattr(doc, "operation_date", None)
    if operation_date and invoice_date and operation_date != invoice_date:
        _create_nillable_element(invoice, "VATPointDate",
                                _format_date(operation_date))
    else:
        _create_nillable_element(invoice, "VATPointDate", "")
    
    # DocumentTotals (с VATPointDate2)
    _build_document_totals(invoice, doc, is_sales=True)
    
    return invoice


# =============================================================================
# ОСНОВНЫЕ ФУНКЦИИ ЭКСПОРТА
# =============================================================================

def export_to_apsa(
    documents: List,
    registration_number: str,
    start_date: date,
    end_date: date,
    user=None,
) -> Dict[str, bytes]:
    """
    Экспортирует документы в формат i.SAF XML для APSA.

    Args:
        documents: список документов для экспорта
        registration_number: ИНН компании (до 11 цифр)
        start_date: начало налогового периода
        end_date: конец налогового периода
        user: пользователь (для дополнительных настроек, не используется)

    Returns:
        Dict[str, bytes]: {"isaf": bytes} - XML файл в формате i.SAF 1.2
    
    Raises:
        ValueError: если нет документов или неверные параметры
    
    Пример использования:
        >>> from export_apsa import export_to_apsa
        >>> from datetime import date
        >>> 
        >>> result = export_to_apsa(
        ...     documents=docs,
        ...     registration_number="123456789",
        ...     start_date=date(2024, 1, 1),
        ...     end_date=date(2024, 1, 31),
        ... )
        >>> 
        >>> with open("isaf_2024_01.xml", "wb") as f:
        ...     f.write(result["isaf"])
    """
    logger.info(
        "[APSA:EXPORT] Starting export, docs=%d period=%s - %s",
        len(documents), start_date, end_date
    )

    if not documents:
        logger.warning("[APSA:EXPORT] No documents to export")
        raise ValueError("No documents provided for export")

    if not registration_number:
        logger.error("[APSA:EXPORT] Registration number is required")
        raise ValueError("Registration number (ИНН) is required for i.SAF export")

    # Валидируем ИНН
    reg_num = validate_registration_number(registration_number)
    if not reg_num:
        raise ValueError(f"Invalid registration number: {registration_number}")

    # Фильтруем документы
    docs_to_export = [doc for doc in documents if _should_include_in_isaf(doc)]
    
    if not docs_to_export:
        logger.warning("[APSA:EXPORT] All documents excluded from i.SAF")
        raise ValueError("All documents are excluded from i.SAF")

    excluded_count = len(documents) - len(docs_to_export)
    if excluded_count > 0:
        logger.info("[APSA:EXPORT] Excluded %d docs from i.SAF", excluded_count)

    # Разделяем на pirkimas/pardavimas
    purchase_docs = []
    sales_docs = []

    for doc in docs_to_export:
        doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
        if doc_type == "pardavimas":
            sales_docs.append(doc)
        else:
            # pirkimas или неизвестный тип -> покупка
            purchase_docs.append(doc)

    logger.info(
        "[APSA:EXPORT] Split: purchases=%d, sales=%d",
        len(purchase_docs), len(sales_docs)
    )

    # Определяем DataType
    if purchase_docs and sales_docs:
        data_type = DATA_TYPE_FULL  # F
    elif sales_docs:
        data_type = DATA_TYPE_SALES  # S
    else:
        data_type = DATA_TYPE_PURCHASE  # P

    # Создаём корневой элемент
    root = ET.Element("iSAFFile")
    root.set("xmlns", ISAF_NAMESPACE)
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")

    # Header
    _build_header(
        root,
        registration_number=reg_num,
        start_date=start_date,
        end_date=end_date,
        data_type=data_type,
    )

    # SourceDocuments
    source_docs = _create_element(root, "SourceDocuments")

    # PurchaseInvoices
    if purchase_docs:
        purchase_invoices = _create_element(source_docs, "PurchaseInvoices")
        for doc in purchase_docs:
            _build_purchase_invoice(purchase_invoices, doc)
        logger.info("[APSA:EXPORT] Added %d PurchaseInvoices", len(purchase_docs))

    # SalesInvoices
    if sales_docs:
        sales_invoices = _create_element(source_docs, "SalesInvoices")
        for doc in sales_docs:
            _build_sales_invoice(sales_invoices, doc)
        logger.info("[APSA:EXPORT] Added %d SalesInvoices", len(sales_docs))

    # Генерируем XML
    xml_string = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_string += _serialize_xml(root)
    
    xml_bytes = xml_string.encode('utf-8')

    logger.info(
        "[APSA:EXPORT] Export completed, XML size=%d bytes",
        len(xml_bytes)
    )

    return {"isaf": xml_bytes}


def export_to_apsa_split(
    documents: List,
    registration_number: str,
    start_date: date,
    end_date: date,
    user=None,
) -> Dict[str, bytes]:
    """
    Экспортирует документы в два отдельных i.SAF файла:
    - один для покупок (DataType=P)
    - один для продаж (DataType=S)

    Returns:
        Dict[str, bytes]: {
            "purchase_isaf": bytes,  # Если есть покупки
            "sales_isaf": bytes,     # Если есть продажи
        }
    """
    logger.info("[APSA:EXPORT_SPLIT] Starting split export")

    docs_to_export = [doc for doc in documents if _should_include_in_isaf(doc)]
    
    if not docs_to_export:
        raise ValueError("No documents to export")

    reg_num = validate_registration_number(registration_number)
    if not reg_num:
        raise ValueError(f"Invalid registration number: {registration_number}")

    # Разделяем
    purchase_docs = []
    sales_docs = []

    for doc in docs_to_export:
        doc_type = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
        if doc_type == "pardavimas":
            sales_docs.append(doc)
        else:
            purchase_docs.append(doc)

    result = {}

    # Экспортируем покупки
    if purchase_docs:
        result["purchase_isaf"] = _generate_isaf_xml(
            purchase_docs, reg_num, start_date, end_date,
            data_type=DATA_TYPE_PURCHASE, doc_type="purchase"
        )
        logger.info("[APSA:SPLIT] Generated purchase file, %d docs", len(purchase_docs))

    # Экспортируем продажи
    if sales_docs:
        result["sales_isaf"] = _generate_isaf_xml(
            sales_docs, reg_num, start_date, end_date,
            data_type=DATA_TYPE_SALES, doc_type="sales"
        )
        logger.info("[APSA:SPLIT] Generated sales file, %d docs", len(sales_docs))

    return result


def _generate_isaf_xml(
    documents: List,
    registration_number: str,
    start_date: date,
    end_date: date,
    data_type: str,
    doc_type: str,
) -> bytes:
    """Внутренняя функция для генерации i.SAF XML."""
    root = ET.Element("iSAFFile")
    root.set("xmlns", ISAF_NAMESPACE)
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")

    _build_header(root, registration_number, start_date, end_date, data_type)

    source_docs = _create_element(root, "SourceDocuments")

    if doc_type == "purchase":
        invoices = _create_element(source_docs, "PurchaseInvoices")
        for doc in documents:
            _build_purchase_invoice(invoices, doc)
    else:
        invoices = _create_element(source_docs, "SalesInvoices")
        for doc in documents:
            _build_sales_invoice(invoices, doc)

    xml_string = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_string += _serialize_xml(root)

    return xml_string.encode('utf-8')


# =============================================================================
# ВАЛИДАЦИЯ
# =============================================================================

def validate_isaf_xml(xml_bytes: bytes, xsd_path: str = None) -> Tuple[bool, List[str]]:
    """
    Валидирует i.SAF XML против XSD схемы.
    
    Args:
        xml_bytes: XML контент
        xsd_path: путь к XSD файлу (опционально)
    
    Returns:
        Tuple[bool, List[str]]: (is_valid, list_of_errors)
    """
    try:
        from lxml import etree
    except ImportError:
        logger.warning("[APSA:VALIDATE] lxml not installed, skipping XSD validation")
        return True, []

    errors = []
    
    try:
        xml_doc = etree.fromstring(xml_bytes)
        
        if xsd_path:
            with open(xsd_path, 'rb') as f:
                xsd_doc = etree.parse(f)
            schema = etree.XMLSchema(xsd_doc)
            
            if not schema.validate(xml_doc):
                for error in schema.error_log:
                    errors.append(f"Line {error.line}: {error.message}")
                return False, errors
        
        return True, []
        
    except etree.XMLSyntaxError as e:
        errors.append(f"XML Syntax Error: {str(e)}")
        return False, errors
    except Exception as e:
        errors.append(f"Validation Error: {str(e)}")
        return False, errors