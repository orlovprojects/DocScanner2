from __future__ import annotations

import os
import random
import logging
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import Any, Iterable, Optional

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet


logger = logging.getLogger(__name__)

# =========================
# Конфиг путей
# =========================
env_value = os.getenv("RIVILE_ERP_TEMPLATES_DIR")

TEMPLATES_DIR = Path(env_value)

PREKES_TEMPLATE_FILE = "Prekės, paslaugos.xlsx"
CLIENTS_TEMPLATE_FILE = "Klientai.xlsx"
PIRK_TEMPLATE_FILE = "Pirkimai.xlsx"
PARD_TEMPLATE_FILE = "Pardavimai.xlsx"


# =========================
# Константы/форматы Excel
# =========================
DATE_FMT = "yyyy-mm-dd"
MONEY_FMT = "0.00"       # для сумм VAT (2 знака)
PRICE_FMT = "0.00##"     # для цены (2-4 знака)
QTY_FMT = "0.#####"      # для количества (до 5 знаков)

EXCEL_BAD_PREFIXES = ("=", "+", "-", "@", "\t")
DEFAULT_UNIT = "VNT"
DEFAULT_CURRENCY = "EUR"
DEFAULT_DEPT = "01"


# =========================
# Колонки (1-based)
# =========================
class PrekesCols:
    REF_ID = 1
    TYPE = 2
    CODE = 3
    NAME = 4
    BASE_UOM = 5


class ClientCols:
    REF_ID = 1        # A - ##refId##
    NAME = 2          # B - Name
    CODE = 3          # C - Code
    TYPE_ID = 4       # D - 1=физ лицо, 0=юр лицо
    REG_CODE = 7      # G - RegCode
    VAT = 8           # H - VatNumber
    ADDRESS = 9       # I - Address
    IS_CUSTOMER = 21  # U
    IS_SUPPLIER = 27  # AA


class HeaderCols:
    REF_ID = 1        # A - ##refId##
    CLIENT_CODE = 2   # B - ClientCode
    OP_DATE = 3       # C - OpDate
    INV_DATE = 4      # D - DocDate
    DOC_NO = 5        # E - DocumentNo
    DOC_TYPE = 6      # F - IsTaxIncluded
    JOURNAL = 7       # G - JournalCode
    CURRENCY = 9      # I - CurrencyCode


class LineCols:
    REF_ID = 1        # A - ##refId##
    ITEM_CODE = 2     # B - ItemCode
    UOM = 3           # C - UOM
    BARCODE = 4       # D - Barcode
    DEPT = 5          # E - DepartmentCode (Padalinio kodas)
    QTY = 6           # F - Quantity
    PRICE = 7         # G - Price
    DISCOUNT_PCT = 8  # H - DiscountPerc (Nuolaidos procentas)
    VAT_CODE = 9      # I - TaxCode
    VAT_AMOUNT = 10   # J - TaxAmount
    NAME = 11         # K - ItemName
    OBJECT_CODE = 12  # L - ObjectCode (Objekto kodas)


# =========================
# Хелперы нормализации/форматирования
# =========================
def _s(v: Any) -> str:
    """Строка без None, с strip()."""
    return str(v).strip() if v is not None else ""


def _safe_D(x: Any) -> Decimal:
    """Безопасное преобразование в Decimal."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal("0")


def safe_excel_text(value: Optional[str]) -> str:
    """Строка, безопасная для Excel (отключает формулы)."""
    s = _s(value)
    if not s:
        return ""
    if s.startswith(EXCEL_BAD_PREFIXES):
        return "'" + s
    return s


def normalize_code(code: Optional[str]) -> str:
    """Нормализация кодов: trim + upper + Excel-safe."""
    return safe_excel_text(_s(code).upper())


def to_decimal(x: Any, q: str = "0.01") -> Decimal:
    """Decimal с округлением до 2 знаков по умолчанию."""
    if x is None or x == "":
        d = Decimal("0")
    elif isinstance(x, Decimal):
        d = x
    else:
        d = Decimal(str(x).replace(",", "."))
    return d.quantize(Decimal(q), rounding=ROUND_HALF_UP)


def set_cell_money(ws: Worksheet, row: int, col: int, amount: Any):
    c = ws.cell(row=row, column=col, value=float(to_decimal(amount, q="0.01")))
    c.number_format = MONEY_FMT


def set_cell_price(ws: Worksheet, row: int, col: int, price: Any):
    c = ws.cell(row=row, column=col, value=float(to_decimal(price, q="0.0001")))
    c.number_format = PRICE_FMT


# def set_cell_qty(ws: Worksheet, row: int, col: int, qty: Any):
#     try:
#         val = float(qty if qty is not None and qty != "" else 0)
#     except Exception:
#         val = 0.0
#     c = ws.cell(row=row, column=col, value=val)
#     c.number_format = QTY_FMT

def set_cell_qty(ws: Worksheet, row: int, col: int, qty: Any):
    # 1) нормализуем вход
    s = _s(qty)
    if s:
        s = s.strip()
        # убираем хвостовой разделитель если есть: "1," -> "1"
        if s.endswith((",", ".")):
            s = s[:-1]
        # литовский/русский разделитель в точку
        s = s.replace(",", ".")
    try:
        d = Decimal(s) if s else Decimal("0")
    except Exception:
        d = Decimal("0")

    # 2) ограничиваем до 5 знаков после запятой
    d = d.quantize(Decimal("0.00001"), rounding=ROUND_HALF_UP)

    # 3) выбираем формат: целые без запятой
    if d == d.to_integral_value():
        fmt = "0"
    else:
        fmt = QTY_FMT  # "0.#####"

    c = ws.cell(row=row, column=col, value=float(d))
    c.number_format = fmt



def to_excel_date(d: Any) -> Optional[date]:
    if not d:
        return None
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    try:
        return datetime.fromisoformat(str(d)).date()
    except Exception:
        return None


def set_cell_date(ws: Worksheet, row: int, col: int, d: Any):
    dt = to_excel_date(d)
    if dt:
        c = ws.cell(row=row, column=col, value=dt)
        c.number_format = DATE_FMT
    else:
        ws.cell(row=row, column=col, value="")


# =========================
# Расчёт процента скидки документа
# =========================
def compute_global_invoice_discount_pct(doc: Any) -> Optional[Decimal]:
    """
    Процент скидки: invoice_discount_wo_vat / сумма_нетто_по_строкам * 100.
    Возвращает Decimal (0..99.99) или None если скидки нет.
    """
    disc = _safe_D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
    if disc <= 0:
        return None

    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        base_total = Decimal("0")
        for it in line_items.all():
            qty = _safe_D(getattr(it, "quantity", 1) or 1)
            price = _safe_D(getattr(it, "price", 0) or 0)
            base_total += (price * qty)
    else:
        base_total = _safe_D(getattr(doc, "amount_wo_vat", 0) or 0)

    if base_total <= 0:
        return None

    pct = (disc / base_total) * Decimal("100")
    if pct < 0:
        pct = Decimal("0")
    if pct > Decimal("99.99"):
        pct = Decimal("99.99")
    return pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# =========================
# Документ: номер/рефы
# =========================
def build_dok_nr(series: str, number: str) -> str:
    """
    Формирует DOK_NR как конкатенацию 'series' + 'number' (БЕЗ дефиса).
    Правила:
    - Если series пустая -> вернуть number.
    - Если number пустой -> вернуть series.
    - Если number начинается с series (с дефисом/пробелом/слэшем или без) -> убираем повтор и разделитель.
      Примеры:
        series='AB', number='AB-123'  -> 'AB123'
        series='AB', number='AB123'   -> 'AB123'
        series='AB', number='123'     -> 'AB123'
        series=''  , number='123'     -> '123'
    """
    s = (series or "").strip()
    n = (number or "").strip()

    if not s:
        res = n
        logger.info("[ERP:DOK_NR] s='', n=%r -> %r", n, res)
        return res
    if not n:
        logger.info("[ERP:DOK_NR] n='', s=%r -> %r", s, s)
        return s

    if n.startswith(s):
        tail = n[len(s):]
        tail = tail.lstrip("-/ .")
        res = f"{s}{tail}"
        logger.info("[ERP:DOK_NR] n startswith s: s=%r n=%r -> %r", s, n, res)
        return res

    res = f"{s}{n}"
    logger.info("[ERP:DOK_NR] s=%r n=%r -> %r", s, n, res)
    return res


def _fallback_doc_num(series: str, number: str) -> str:
    """
    Номер документа (fallback):
      - оба пустые  -> NERANUMERIO + 5 случайных цифр
      - только number -> number
      - только series -> series
      - оба есть      -> series + number (если number не начинается с series)
    """
    s = _s(series)
    n = _s(number)
    if not s and not n:
        return f"NERANUMERIO{random.randint(0, 99999):05d}"
    if s and not n:
        return s
    if n and not s:
        return n
    return n if n.startswith(s) else f"{s}{n}"


def build_ref_id(series: str, number: str) -> str:
    """
    REF_ID для связки Headers/Lines.
    Пытаемся сделать аккуратный 'series+number'. Если в итоге пусто — используем fallback.
    """
    ref = build_dok_nr(series, number)
    if not _s(ref):
        ref = _fallback_doc_num(series, number)
        logger.info("[ERP:REF_ID] using fallback -> %r", ref)
    return ref


# =========================
# Код контрагента (без заглушек)
# =========================
def get_party_code(doc: Any, *, id_field: str, vat_field: str, id_programoje_field: str) -> str:
    """
    Код стороны по приоритету:
      1) *_id
      2) *_vat_code
      3) *_id_programoje
    НИКАКИХ '111111111' — если пусто, значит пусто.
    """
    sid = _s(getattr(doc, id_field, None))
    if sid:
        return sid
    svat = _s(getattr(doc, vat_field, None))
    if svat:
        return svat
    sidp = _s(getattr(doc, id_programoje_field, None))
    if sidp:
        return sidp
    return ""


# =========================
# Нормализация типа позиции
# =========================
def normalize_tip_lineitem(value: Any) -> str:
    """
    Для line item: 'preke' -> '1', 'paslauga' -> '2', всё остальное -> '1'.
    """
    s = _s(value).lower()
    if s in ("preke", "prekė", "prekes", "prekės"):
        return "1"
    if s in ("paslauga", "paslaugos"):
        return "2"
    return "1"


def normalize_tip_doc(value: Any) -> str:
    """
    Для документа (если нет line items):
      1 -> '1', 2 -> '2', 3 -> '1', 4 -> '2'.
      Строковые цифры тоже поддерживаются.
    """
    s = _s(value)
    if not s:
        return "1"
    try:
        n = int(float(s.replace(",", ".")))
    except Exception:
        low = s.lower()
        if low in ("preke", "prekė", "prekes", "prekės"):
            return "1"
        if low in ("paslauga", "paslaugos"):
            return "2"
        return "1"
    if n == 1:
        return "1"
    if n == 2:
        return "2"
    if n == 3:
        return "1"
    if n == 4:
        return "2"
    return "1"


# =========================
# Загрузка шаблона с проверкой
# =========================
def _load_template(filename: str):
    path = TEMPLATES_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Не найден шаблон: {path}")
    wb = load_workbook(path)
    return wb


# =========================================================
# 1) PREKĖS / PASLAUGOS
# =========================================================
def export_prekes_and_paslaugos_to_rivile_erp_xlsx(documents: Iterable[Any], output_path: str | Path) -> Path:
    wb = _load_template(PREKES_TEMPLATE_FILE)
    ws = wb.active

    prekes_rows: list[list[str]] = []
    seen: set[str] = set()

    for doc in documents or []:
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

        if has_items:
            for item in line_items.all():
                kodas_raw = getattr(item, "prekes_kodas", None) or getattr(item, "prekes_barkodas", None)
                kodas = normalize_code(kodas_raw)
                if not kodas or kodas in seen:
                    continue

                tipas = normalize_tip_lineitem(getattr(item, "preke_paslauga", None))
                unit = normalize_code(getattr(item, "unit", None) or DEFAULT_UNIT)
                pavadinimas = safe_excel_text(getattr(item, "prekes_pavadinimas", None) or "Prekė")

                prekes_rows.append([kodas, tipas, kodas, pavadinimas, unit])
                seen.add(kodas)
        else:
            kodas_raw = getattr(doc, "prekes_kodas", None) or getattr(doc, "prekes_barkodas", None)
            kodas = normalize_code(kodas_raw)
            if not kodas or kodas in seen:
                continue

            tipas = normalize_tip_doc(getattr(doc, "preke_paslauga", None))
            unit = normalize_code(getattr(doc, "unit", None) or DEFAULT_UNIT)
            pavadinimas = safe_excel_text(getattr(doc, "prekes_pavadinimas", None) or "Prekė")

            prekes_rows.append([kodas, tipas, kodas, pavadinimas, unit])
            seen.add(kodas)

    start_row = 6
    for i, row_data in enumerate(prekes_rows):
        r = start_row + i
        ws.cell(row=r, column=PrekesCols.REF_ID, value=row_data[0])
        ws.cell(row=r, column=PrekesCols.TYPE, value=row_data[1])
        ws.cell(row=r, column=PrekesCols.CODE, value=row_data[2])
        ws.cell(row=r, column=PrekesCols.NAME, value=row_data[3])
        ws.cell(row=r, column=PrekesCols.BASE_UOM, value=row_data[4])

    wb.save(output_path)
    return Path(output_path)


# =========================================================
# 2) KLIENTAI
# =========================================================
def export_clients_to_rivile_erp_xlsx(clients: Iterable[dict], output_path: str | Path) -> Path:
    wb = _load_template(CLIENTS_TEMPLATE_FILE)
    ws = wb.active

    start_row = 6
    for i, client in enumerate(clients or []):
        row = start_row + i

        doc_type = (_s(client.get("type")) or "pirkimas").lower()
        is_person = bool(client.get("is_person", False))

        cid = normalize_code(client.get("id"))
        code = cid
        name = safe_excel_text(client.get("name"))
        vat = normalize_code(client.get("vat"))
        adr = safe_excel_text(client.get("address"))

        ws.cell(row=row, column=ClientCols.REF_ID, value=cid)
        ws.cell(row=row, column=ClientCols.NAME, value=name)
        ws.cell(row=row, column=ClientCols.CODE, value=code)
        ws.cell(row=row, column=ClientCols.TYPE_ID, value=1 if is_person else 0)
        ws.cell(row=row, column=ClientCols.REG_CODE, value=cid)
        ws.cell(row=row, column=ClientCols.VAT, value=vat)
        ws.cell(row=row, column=ClientCols.ADDRESS, value=adr)

        ws.cell(row=row, column=ClientCols.IS_CUSTOMER, value=1 if doc_type == "pardavimas" else "")
        ws.cell(row=row, column=ClientCols.IS_SUPPLIER, value=1 if doc_type == "pirkimas" else "")

    wb.save(output_path)
    return Path(output_path)


# =========================================================
# 3) PIRKIMAI/PARDAVIMAI (Headers/Lines)
# =========================================================
def export_documents_to_rivile_erp_xlsx(
    documents: Iterable[Any],
    output_path: str | Path,
    doc_type: str = "pirkimai",
) -> Path:
    """
    Экспорт документов в XLSX-шаблоны Rivile ERP.
    doc_type: 'pirkimai' или 'pardavimai'
    """
    if doc_type == "pirkimai":
        wb = _load_template(PIRK_TEMPLATE_FILE)
        client_id_field = "seller_id"
        client_vat_field = "seller_vat_code"
        client_id_programoje_field = "seller_id_programoje"
        default_journal = "0201"
    elif doc_type == "pardavimai":
        wb = _load_template(PARD_TEMPLATE_FILE)
        client_id_field = "buyer_id"
        client_vat_field = "buyer_vat_code"
        client_id_programoje_field = "buyer_id_programoje"
        default_journal = "0101"
    else:
        raise ValueError("doc_type должен быть 'pirkimai' или 'pardavimai'")

    if "Headers" not in wb.sheetnames or "Lines" not in wb.sheetnames:
        raise ValueError("Шаблон должен содержать листы 'Headers' и 'Lines'")

    ws_headers = wb["Headers"]
    ws_lines = wb["Lines"]

    header_idx = 6
    line_idx = 3

    for doc in documents or []:
        dok_nr = _s(getattr(doc, "document_number", "") or "")
        series = _s(getattr(doc, "document_series", "") or "")
        ref_id = build_ref_id(series, dok_nr)

        client_code = get_party_code(
            doc,
            id_field=client_id_field,
            vat_field=client_vat_field,
            id_programoje_field=client_id_programoje_field,
        )

        discount_pct = compute_global_invoice_discount_pct(doc)

        # === Headers ===
        ws_headers.cell(row=header_idx, column=HeaderCols.REF_ID, value=safe_excel_text(ref_id))
        ws_headers.cell(row=header_idx, column=HeaderCols.CLIENT_CODE, value=safe_excel_text(client_code))
        set_cell_date(ws_headers, header_idx, HeaderCols.OP_DATE, getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None))
        set_cell_date(ws_headers, header_idx, HeaderCols.INV_DATE, getattr(doc, "invoice_date", None))
        ws_headers.cell(row=header_idx, column=HeaderCols.DOC_NO, value=safe_excel_text(ref_id))
        ws_headers.cell(row=header_idx, column=HeaderCols.DOC_TYPE, value=0)

        zurnalo_kodas = _s(getattr(doc, "zurnalo_kodas", "")) or default_journal
        ws_headers.cell(row=header_idx, column=HeaderCols.JOURNAL, value=safe_excel_text(zurnalo_kodas))

        currency = _s(getattr(doc, "currency", "") or DEFAULT_CURRENCY) or DEFAULT_CURRENCY
        ws_headers.cell(row=header_idx, column=HeaderCols.CURRENCY, value=currency)

        header_idx += 1

        # === Lines ===
        line_map = getattr(doc, "_pvm_line_map", None)
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

        if has_items:
            for item in line_items.all():
                ws_lines.cell(row=line_idx, column=LineCols.REF_ID, value=safe_excel_text(ref_id))
                ws_lines.cell(row=line_idx, column=LineCols.ITEM_CODE, value=normalize_code(getattr(item, "prekes_kodas", None) or ""))
                ws_lines.cell(row=line_idx, column=LineCols.UOM, value=normalize_code(getattr(item, "unit", None) or DEFAULT_UNIT))
                ws_lines.cell(row=line_idx, column=LineCols.BARCODE, value=normalize_code(getattr(item, "prekes_barkodas", None) or ""))

                padalinio_kodas = _s(getattr(item, "padalinio_kodas", None) or "") or DEFAULT_DEPT
                ws_lines.cell(row=line_idx, column=LineCols.DEPT, value=safe_excel_text(padalinio_kodas))

                set_cell_qty(ws_lines, line_idx, LineCols.QTY, getattr(item, "quantity", None) or 1)
                set_cell_price(ws_lines, line_idx, LineCols.PRICE, getattr(item, "price", None) or 0)

                if discount_pct is not None:
                    ws_lines.cell(row=line_idx, column=LineCols.DISCOUNT_PCT, value=float(discount_pct))
                else:
                    set_cell_money(ws_lines, line_idx, LineCols.VAT_AMOUNT, getattr(item, "vat", None) or 0)

                if line_map is not None:
                    pvm_code = (line_map or {}).get(getattr(item, "id", None))
                else:
                    pvm_code = getattr(item, "pvm_kodas", None)
                ws_lines.cell(row=line_idx, column=LineCols.VAT_CODE, value=safe_excel_text(_s(pvm_code)))

                name = safe_excel_text(getattr(item, "prekes_pavadinimas", None) or "")
                ws_lines.cell(row=line_idx, column=LineCols.NAME, value=name)

                objekto_kodas = _s(getattr(item, "objekto_kodas", None) or "")
                if objekto_kodas:
                    ws_lines.cell(row=line_idx, column=LineCols.OBJECT_CODE, value=safe_excel_text(objekto_kodas))

                line_idx += 1
        else:
            ws_lines.cell(row=line_idx, column=LineCols.REF_ID, value=safe_excel_text(ref_id))
            ws_lines.cell(row=line_idx, column=LineCols.ITEM_CODE, value=normalize_code(getattr(doc, "prekes_kodas", None) or ""))
            ws_lines.cell(row=line_idx, column=LineCols.UOM, value=normalize_code(getattr(doc, "unit", None) or DEFAULT_UNIT))
            ws_lines.cell(row=line_idx, column=LineCols.BARCODE, value=normalize_code(getattr(doc, "prekes_barkodas", None) or ""))

            padalinio_kodas = _s(getattr(doc, "padalinio_kodas", None) or "") or DEFAULT_DEPT
            ws_lines.cell(row=line_idx, column=LineCols.DEPT, value=safe_excel_text(padalinio_kodas))

            set_cell_qty(ws_lines, line_idx, LineCols.QTY, getattr(doc, "quantity", None) or 1)

            price = getattr(doc, "amount_wo_vat", None)
            set_cell_money(ws_lines, line_idx, LineCols.PRICE, price if price is not None else 0)

            if discount_pct is not None:
                ws_lines.cell(row=line_idx, column=LineCols.DISCOUNT_PCT, value=float(discount_pct))
            else:
                vat_amount = getattr(doc, "vat_amount", None)
                set_cell_money(ws_lines, line_idx, LineCols.VAT_AMOUNT, vat_amount if vat_amount is not None else 0)

            pvm = getattr(doc, "pvm_kodas", None)
            ws_lines.cell(row=line_idx, column=LineCols.VAT_CODE, value=safe_excel_text(_s(pvm)))

            name = safe_excel_text(getattr(doc, "prekes_pavadinimas", None) or "")
            ws_lines.cell(row=line_idx, column=LineCols.NAME, value=name)

            objekto_kodas = _s(getattr(doc, "objekto_kodas", None) or "")
            if objekto_kodas:
                ws_lines.cell(row=line_idx, column=LineCols.OBJECT_CODE, value=safe_excel_text(objekto_kodas))

            line_idx += 1

    wb.save(output_path)
    return Path(output_path)




















# from __future__ import annotations

# import os
# import random
# import logging
# from pathlib import Path
# from decimal import Decimal, ROUND_HALF_UP
# from datetime import date, datetime
# from typing import Any, Iterable, Optional

# from openpyxl import load_workbook
# from openpyxl.worksheet.worksheet import Worksheet


# logger = logging.getLogger(__name__)

# # =========================
# # Конфиг путей
# # =========================
# # Берём путь строго из .env
# env_value = os.getenv("RIVILE_ERP_TEMPLATES_DIR")


# TEMPLATES_DIR = Path(env_value)

# PREKES_TEMPLATE_FILE = "Prekės, paslaugos.xlsx"
# CLIENTS_TEMPLATE_FILE = "Klientai.xlsx"
# PIRK_TEMPLATE_FILE = "Pirkimai.xlsx"
# PARD_TEMPLATE_FILE = "Pardavimai.xlsx"


# # =========================
# # Константы/форматы Excel
# # =========================
# DATE_FMT = "yyyy-mm-dd"
# MONEY_FMT = "#,##0.00"
# QTY_FMT = "#,##0.######"   # если нужны дробные количества

# EXCEL_BAD_PREFIXES = ("=", "+", "-", "@", "\t")
# DEFAULT_UNIT = "VNT"
# DEFAULT_CURRENCY = "EUR"
# DEFAULT_DEPT = "01"

# # =========================
# # Колонки (1-based)
# # =========================
# class PrekesCols:
#     REF_ID = 1
#     TYPE = 2
#     CODE = 3
#     NAME = 4
#     BASE_UOM = 5

# class ClientCols:
#     REF_ID = 1     # ##refId##
#     NAME = 2       # Name
#     CODE = 3       # Code
#     TYPE_ID = 4    # 1 - физ лицо, 0 - юр лицо
#     REG_CODE = 7   # RegCode
#     VAT = 8        # VatNumber
#     ADDRESS = 9    # Address
#     IS_CUSTOMER = 21  # U
#     IS_SUPPLIER = 27  # AA

# class HeaderCols:
#     REF_ID = 1
#     CLIENT_CODE = 2
#     OP_DATE = 3
#     INV_DATE = 4
#     DOC_NO = 5
#     DOC_TYPE = 6
#     JOURNAL = 7
#     CURRENCY = 9

# class LineCols:
#     REF_ID = 1
#     ITEM_CODE = 2
#     UOM = 3
#     BARCODE = 4
#     DEPT = 5
#     QTY = 6
#     PRICE = 7
#     VAT_CODE = 9
#     VAT_AMOUNT = 10
#     NAME = 11
#     OBJECT_CODE = 12

# # =========================
# # Хелперы нормализации/форматирования
# # =========================
# def _s(v: Any) -> str:
#     """Строка без None, с strip()."""
#     return str(v).strip() if v is not None else ""

# def safe_excel_text(value: Optional[str]) -> str:
#     """Строка, безопасная для Excel (отключает формулы)."""
#     s = (_s(value))
#     if not s:
#         return ""
#     if s.startswith(EXCEL_BAD_PREFIXES):
#         return "'" + s
#     return s

# def normalize_code(code: Optional[str]) -> str:
#     """Нормализация кодов: trim + upper + Excel-safe."""
#     return safe_excel_text((_s(code)).upper())

# def to_decimal(x: Any, q: str = "0.01") -> Decimal:
#     """Decimal с округлением до 2 знаков по умолчанию."""
#     if x is None or x == "":
#         d = Decimal("0")
#     elif isinstance(x, Decimal):
#         d = x
#     else:
#         d = Decimal(str(x).replace(",", "."))
#     return d.quantize(Decimal(q), rounding=ROUND_HALF_UP)

# def set_cell_money(ws: Worksheet, row: int, col: int, amount: Any):
#     c = ws.cell(row=row, column=col, value=float(to_decimal(amount)))
#     c.number_format = MONEY_FMT

# def set_cell_qty(ws: Worksheet, row: int, col: int, qty: Any):
#     # если количества могут быть дробными — используем QTY_FMT
#     try:
#         val = float(qty if qty is not None and qty != "" else 0)
#     except Exception:
#         val = 0.0
#     c = ws.cell(row=row, column=col, value=val)
#     c.number_format = QTY_FMT

# def to_excel_date(d: Any) -> Optional[date]:
#     if not d:
#         return None
#     if isinstance(d, datetime):
#         return d.date()
#     if isinstance(d, date):
#         return d
#     try:
#         return datetime.fromisoformat(str(d)).date()
#     except Exception:
#         return None

# def set_cell_date(ws: Worksheet, row: int, col: int, d: Any):
#     dt = to_excel_date(d)
#     if dt:
#         c = ws.cell(row=row, column=col, value=dt)
#         c.number_format = DATE_FMT
#     else:
#         ws.cell(row=row, column=col, value="")

# # =========================
# # Документ: номер/рефы
# # =========================
# def build_dok_nr(series: str, number: str) -> str:
#     """
#     Формирует DOK_NR как конкатенацию 'series' + 'number' (БЕЗ дефиса).
#     Правила:
#     - Если series пустая -> вернуть number.
#     - Если number пустой -> вернуть series.
#     - Если number начинается с series (с дефисом/пробелом/слэшем или без) -> убираем повтор и разделитель.
#       Примеры:
#         series='AB', number='AB-123'  -> 'AB123'
#         series='AB', number='AB123'   -> 'AB123'
#         series='AB', number='123'     -> 'AB123'
#         series=''  , number='123'     -> '123'
#     """
#     s = (series or "").strip()
#     n = (number or "").strip()

#     if not s:
#         res = n
#         logger.info("[ERP:DOK_NR] s='', n=%r -> %r", n, res)
#         return res
#     if not n:
#         logger.info("[ERP:DOK_NR] n='', s=%r -> %r", s, s)
#         return s

#     # если номер начинается с серии — убираем повтор и ведущие разделители
#     if n.startswith(s):
#         tail = n[len(s):]
#         tail = tail.lstrip("-/ .")
#         res = f"{s}{tail}"
#         logger.info("[ERP:DOK_NR] n startswith s: s=%r n=%r -> %r", s, n, res)
#         return res

#     res = f"{s}{n}"
#     logger.info("[ERP:DOK_NR] s=%r n=%r -> %r", s, n, res)
#     return res



# def _fallback_doc_num(series: str, number: str) -> str:
#     """
#     Номер документа (fallback):
#       - оба пустые  -> NERANUMERIO + 5 случайных цифр
#       - только number -> number
#       - только series -> series
#       - оба есть      -> series + number (если number не начинается с series)
#     """
#     s = _s(series)
#     n = _s(number)
#     if not s and not n:
#         return f"NERANUMERIO{random.randint(0, 99999):05d}"
#     if s and not n:
#         return s
#     if n and not s:
#         return n
#     return n if n.startswith(s) else f"{s}{n}"

# def build_ref_id(series: str, number: str) -> str:
#     """
#     REF_ID для связки Headers/Lines.
#     Пытаемся сделать аккуратный 'series-number'. Если в итоге пусто — используем fallback.
#     """
#     ref = build_dok_nr(series, number)
#     if not _s(ref):
#         ref = _fallback_doc_num(series, number)
#         logger.info("[ERP:REF_ID] using fallback -> %r", ref)
#     return ref

# # =========================
# # Код контрагента (без заглушек)
# # =========================
# def get_party_code(doc: Any, *, id_field: str, vat_field: str, id_programoje_field: str) -> str:
#     """
#     Код стороны по приоритету:
#       1) *_id
#       2) *_vat_code
#       3) *_id_programoje
#     НИКАКИХ '111111111' — если пусто, значит пусто.
#     """
#     sid = _s(getattr(doc, id_field, None))
#     if sid:
#         return sid
#     svat = _s(getattr(doc, vat_field, None))
#     if svat:
#         return svat
#     sidp = _s(getattr(doc, id_programoje_field, None))
#     if sidp:
#         return sidp
#     return ""

# # =========================
# # Нормализация типа позиции
# # =========================
# def normalize_tip_lineitem(value: Any) -> str:
#     """
#     Для line item: 'preke' -> '1', 'paslauga' -> '2', всё остальное -> '1'.
#     """
#     s = _s(value).lower()
#     if s in ("preke", "prekė", "prekes", "prekės"):
#         return "1"
#     if s in ("paslauga", "paslaugos"):
#         return "2"
#     return "1"

# def normalize_tip_doc(value: Any) -> str:
#     """
#     Для документа (если нет line items):
#       1 -> '1', 2 -> '2', 3 -> '1', 4 -> '2'.
#       Строковые цифры тоже поддерживаются.
#     """
#     s = _s(value)
#     if not s:
#         return "1"
#     try:
#         n = int(float(s.replace(",", ".")))
#     except Exception:
#         # если явно строка типа 'preke/paslauga' — тоже маппим
#         low = s.lower()
#         if low in ("preke", "prekė", "prekes", "prekės"):
#             return "1"
#         if low in ("paslauga", "paslaugos"):
#             return "2"
#         return "1"
#     if n == 1:
#         return "1"
#     if n == 2:
#         return "2"
#     if n == 3:
#         return "1"
#     if n == 4:
#         return "2"
#     return "1"

# # =========================
# # Загрузка шаблона с проверкой
# # =========================
# def _load_template(filename: str):
#     path = TEMPLATES_DIR / filename
#     if not path.exists():
#         raise FileNotFoundError(f"Не найден шаблон: {path}")
#     wb = load_workbook(path)
#     return wb

# # =========================================================
# # 1) PREKĖS / PASLAUGOS
# # =========================================================
# def export_prekes_and_paslaugos_to_rivile_erp_xlsx(documents: Iterable[Any], output_path: str | Path) -> Path:
#     wb = _load_template(PREKES_TEMPLATE_FILE)
#     ws = wb.active

#     prekes_rows: list[list[str]] = []
#     seen: set[str] = set()

#     for doc in documents or []:
#         line_items = getattr(doc, "line_items", None)
#         has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

#         if has_items:
#             for item in line_items.all():
#                 kodas_raw = getattr(item, "prekes_kodas", None) or getattr(item, "prekes_barkodas", None)
#                 kodas = normalize_code(kodas_raw)
#                 if not kodas or kodas in seen:
#                     continue

#                 tipas = normalize_tip_lineitem(getattr(item, "preke_paslauga", None))
#                 unit = normalize_code(getattr(item, "unit", None) or DEFAULT_UNIT)
#                 pavadinimas = safe_excel_text(getattr(item, "prekes_pavadinimas", None) or "Prekė")

#                 prekes_rows.append([kodas, tipas, kodas, pavadinimas, unit])
#                 seen.add(kodas)
#         else:
#             kodas_raw = getattr(doc, "prekes_kodas", None) or getattr(doc, "prekes_barkodas", None)
#             kodas = normalize_code(kodas_raw)
#             if not kodas or kodas in seen:
#                 continue

#             tipas = normalize_tip_doc(getattr(doc, "preke_paslauga", None))
#             unit = normalize_code(getattr(doc, "unit", None) or DEFAULT_UNIT)
#             pavadinimas = safe_excel_text(getattr(doc, "prekes_pavadinimas", None) or "Prekė")

#             prekes_rows.append([kodas, tipas, kodas, pavadinimas, unit])
#             seen.add(kodas)

#     # Записываем с 6-й строки
#     start_row = 6
#     for i, row_data in enumerate(prekes_rows):
#         r = start_row + i
#         ws.cell(row=r, column=PrekesCols.REF_ID, value=row_data[0])
#         ws.cell(row=r, column=PrekesCols.TYPE, value=row_data[1])
#         ws.cell(row=r, column=PrekesCols.CODE, value=row_data[2])
#         ws.cell(row=r, column=PrekesCols.NAME, value=row_data[3])
#         ws.cell(row=r, column=PrekesCols.BASE_UOM, value=row_data[4])

#     wb.save(output_path)
#     return Path(output_path)

# # =========================================================
# # 2) KLIENTAI
# # =========================================================
# def export_clients_to_rivile_erp_xlsx(clients: Iterable[dict], output_path: str | Path) -> Path:
#     wb = _load_template(CLIENTS_TEMPLATE_FILE)
#     ws = wb.active

#     start_row = 6
#     for i, client in enumerate(clients or []):
#         row = start_row + i

#         doc_type = (_s(client.get("type")) or "pirkimas").lower()
#         is_person = bool(client.get("is_person", False))

#         cid = normalize_code(client.get("id"))
#         code = cid  # в ERP-шаблоне Code = id (по вашей исходной логике)
#         name = safe_excel_text(client.get("name"))
#         vat = normalize_code(client.get("vat"))
#         adr = safe_excel_text(client.get("address"))

#         ws.cell(row=row, column=ClientCols.REF_ID, value=cid)
#         ws.cell(row=row, column=ClientCols.NAME, value=name)
#         ws.cell(row=row, column=ClientCols.CODE, value=code)
#         ws.cell(row=row, column=ClientCols.TYPE_ID, value=1 if is_person else 0)
#         ws.cell(row=row, column=ClientCols.REG_CODE, value=cid)
#         ws.cell(row=row, column=ClientCols.VAT, value=vat)
#         ws.cell(row=row, column=ClientCols.ADDRESS, value=adr)

#         # роли
#         ws.cell(row=row, column=ClientCols.IS_CUSTOMER, value=1 if doc_type == "pardavimas" else "")
#         ws.cell(row=row, column=ClientCols.IS_SUPPLIER, value=1 if doc_type == "pirkimas" else "")

#     wb.save(output_path)
#     return Path(output_path)

# # =========================================================
# # 3) PIRKIMAI/PARDAVIMAI (Headers/Lines)
# # =========================================================
# def export_documents_to_rivile_erp_xlsx(
#     documents: Iterable[Any],
#     output_path: str | Path,
#     doc_type: str = "pirkimai",
# ) -> Path:
#     """
#     Экспорт документов в XLSX-шаблоны Rivile ERP.
#     doc_type: 'pirkimai' или 'pardavimai'
#     """
#     if doc_type == "pirkimai":
#         wb = _load_template(PIRK_TEMPLATE_FILE)
#         client_id_field = "seller_id"
#         client_vat_field = "seller_vat_code"
#         client_id_programoje_field = "seller_id_programoje"
#         default_journal = "0201"
#     elif doc_type == "pardavimai":
#         wb = _load_template(PARD_TEMPLATE_FILE)
#         client_id_field = "buyer_id"
#         client_vat_field = "buyer_vat_code"
#         client_id_programoje_field = "buyer_id_programoje"
#         default_journal = "0101"
#     else:
#         raise ValueError("doc_type должен быть 'pirkimai' или 'pardavimai'")

#     if "Headers" not in wb.sheetnames or "Lines" not in wb.sheetnames:
#         raise ValueError("Шаблон должен содержать листы 'Headers' и 'Lines'")

#     ws_headers = wb["Headers"]
#     ws_lines = wb["Lines"]

#     header_idx = 6  # первая строка записи шапок
#     line_idx = 3    # первая строка записи строк

#     for doc in documents or []:
#         dok_nr = _s(getattr(doc, "document_number", "") or "")
#         series = _s(getattr(doc, "document_series", "") or "")
#         ref_id = build_ref_id(series, dok_nr)

#         # Единый код контрагента (без заглушек)
#         client_code = get_party_code(
#             doc,
#             id_field=client_id_field,
#             vat_field=client_vat_field,
#             id_programoje_field=client_id_programoje_field,
#         )

#         # Headers
#         ws_headers.cell(row=header_idx, column=HeaderCols.REF_ID, value=safe_excel_text(ref_id))
#         ws_headers.cell(row=header_idx, column=HeaderCols.CLIENT_CODE, value=safe_excel_text(client_code))
#         set_cell_date(ws_headers, header_idx, HeaderCols.OP_DATE, getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None))
#         set_cell_date(ws_headers, header_idx, HeaderCols.INV_DATE, getattr(doc, "invoice_date", None))
#         ws_headers.cell(row=header_idx, column=HeaderCols.DOC_NO, value=safe_excel_text(ref_id))
#         ws_headers.cell(row=header_idx, column=HeaderCols.DOC_TYPE, value=0)

#         zurnalo_kodas = _s(getattr(doc, "zurnalo_kodas", "")) or default_journal
#         ws_headers.cell(row=header_idx, column=HeaderCols.JOURNAL, value=safe_excel_text(zurnalo_kodas))

#         currency = _s(getattr(doc, "currency", "") or DEFAULT_CURRENCY) or DEFAULT_CURRENCY
#         ws_headers.cell(row=header_idx, column=HeaderCols.CURRENCY, value=currency)

#         header_idx += 1

#         # Строки
#         line_map = getattr(doc, "_pvm_line_map", None)  # multi (dict id->code) или None -> single
#         line_items = getattr(doc, "line_items", None)
#         has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

#         if has_items:
#             for item in line_items.all():
#                 ws_lines.cell(row=line_idx, column=LineCols.REF_ID, value=safe_excel_text(ref_id))
#                 ws_lines.cell(row=line_idx, column=LineCols.ITEM_CODE, value=normalize_code(getattr(item, "prekes_kodas", None) or ""))
#                 ws_lines.cell(row=line_idx, column=LineCols.UOM, value=normalize_code(getattr(item, "unit", None) or DEFAULT_UNIT))
#                 ws_lines.cell(row=line_idx, column=LineCols.BARCODE, value=normalize_code(getattr(item, "prekes_barkodas", None) or ""))
#                 ws_lines.cell(row=line_idx, column=LineCols.DEPT, value=normalize_code(getattr(item, "padalinio_kodas", None) or DEFAULT_DEPT))

#                 set_cell_qty(ws_lines, line_idx, LineCols.QTY, getattr(item, "quantity", None) or 1)
#                 set_cell_money(ws_lines, line_idx, LineCols.PRICE, getattr(item, "price", None) or 0)

#                 if line_map is not None:
#                     pvm_code = (line_map or {}).get(getattr(item, "id", None))
#                 else:
#                     pvm_code = getattr(item, "pvm_kodas", None)
#                 ws_lines.cell(row=line_idx, column=LineCols.VAT_CODE, value=safe_excel_text(_s(pvm_code)))

#                 set_cell_money(ws_lines, line_idx, LineCols.VAT_AMOUNT, getattr(item, "vat", None) or 0)

#                 name = safe_excel_text(getattr(item, "prekes_pavadinimas", None) or "")
#                 ws_lines.cell(row=line_idx, column=LineCols.NAME, value=name)

#                 line_idx += 1
#         else:
#             ws_lines.cell(row=line_idx, column=LineCols.REF_ID, value=safe_excel_text(ref_id))
#             ws_lines.cell(row=line_idx, column=LineCols.ITEM_CODE, value=normalize_code(getattr(doc, "prekes_kodas", None) or ""))
#             ws_lines.cell(row=line_idx, column=LineCols.UOM, value=normalize_code(getattr(doc, "unit", None) or DEFAULT_UNIT))
#             ws_lines.cell(row=line_idx, column=LineCols.BARCODE, value=normalize_code(getattr(doc, "prekes_barkodas", None) or ""))
#             ws_lines.cell(row=line_idx, column=LineCols.DEPT, value=normalize_code(getattr(doc, "padalinio_kodas", None) or ""))

#             set_cell_qty(ws_lines, line_idx, LineCols.QTY, getattr(doc, "quantity", None) or 1)

#             price = getattr(doc, "amount_wo_vat", None)
#             set_cell_money(ws_lines, line_idx, LineCols.PRICE, price if price is not None else 0)

#             pvm = getattr(doc, "pvm_kodas", None)
#             ws_lines.cell(row=line_idx, column=LineCols.VAT_CODE, value=safe_excel_text(_s(pvm)))

#             vat_amount = getattr(doc, "vat_amount", None)
#             set_cell_money(ws_lines, line_idx, LineCols.VAT_AMOUNT, vat_amount if vat_amount is not None else 0)

#             name = safe_excel_text(getattr(doc, "prekes_pavadinimas", None) or "")
#             ws_lines.cell(row=line_idx, column=LineCols.NAME, value=name)

#             line_idx += 1

#     wb.save(output_path)
#     return Path(output_path)


