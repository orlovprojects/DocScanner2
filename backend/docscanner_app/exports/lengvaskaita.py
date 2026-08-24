import io, os, logging, datetime
from pathlib import Path
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import xlrd
import xlwt
from xlutils.copy import copy as xl_copy

logger = logging.getLogger("docscanner_app")

LS_ENCODING = "windows-1257"

# =========================
# Конфиг путей шаблонов
# =========================

env_value = os.getenv("LENGVASKAITA_TEMPLATES_DIR")

if not env_value:
    raise ValueError("LENGVASKAITA_TEMPLATES_DIR not set in .env")

LENGVASKAITA_TEMPLATES_DIR = Path(env_value)
LENGVASKAITA_TEMPLATE_XLS = "LengvaSkaita_Import_Template.xls"

# Первая строка с данными (0-based): 0 пустая, 1 группы, 2 заголовки
LS_FIRST_DATA_ROW = 3


def get_lengvaskaita_template_path() -> Path:
    """
    Возвращает путь к XLS-шаблону LengvaSkaita.
    Шаблон должен лежать как LengvaSkaita_Import_Template.xls
    в LENGVASKAITA_TEMPLATES_DIR.
    """
    template_path = LENGVASKAITA_TEMPLATES_DIR / LENGVASKAITA_TEMPLATE_XLS
    if not template_path.exists():
        logger.error("[LENGVASKAITA:TEMPLATE] Template not found: %s", template_path)
        raise FileNotFoundError(f"LengvaSkaita template not found: {template_path}")
    return template_path

NON_CP1257_MAP = {
    'á': 'a', 'Á': 'A', 'ď': 'd', 'Ď': 'D', 'ě': 'e', 'Ě': 'E',
    'í': 'i', 'Í': 'I', 'ň': 'n', 'Ň': 'N', 'ř': 'r', 'Ř': 'R',
    'ť': 't', 'Ť': 'T', 'ú': 'u', 'Ú': 'U', 'ý': 'y', 'Ý': 'Y',
    'ő': 'o', 'Ő': 'O', 'ű': 'u', 'Ű': 'U', 'ă': 'a', 'Ă': 'A',
    'â': 'a', 'Â': 'A', 'î': 'i', 'Î': 'I', 'ș': 's', 'Ș': 'S',
    'ț': 't', 'Ț': 'T', 'đ': 'd', 'Đ': 'D', 'à': 'a', 'À': 'A',
    'ç': 'c', 'Ç': 'C', 'è': 'e', 'È': 'E', 'ê': 'e', 'Ê': 'E',
    'ë': 'e', 'Ë': 'E', 'ï': 'i', 'Ï': 'I', 'ô': 'o', 'Ô': 'O',
    'ù': 'u', 'Ù': 'U', 'û': 'u', 'Û': 'U', 'ñ': 'n', 'Ñ': 'N',
    'ã': 'a', 'Ã': 'A', 'ì': 'i', 'Ì': 'I', 'ò': 'o', 'Ò': 'O',
    'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'ş': 's', 'Ş': 'S', 'İ': 'I',
    'þ': 'th', 'Þ': 'Th', 'ð': 'd', 'Ð': 'D', 'ẞ': 'SS',
}


def _ls_str(value) -> str:
    if value is None:
        return ""
    s = "".join(NON_CP1257_MAP.get(ch, ch) for ch in str(value))
    out = []
    for ch in s:
        try:
            ch.encode("cp1257")
            out.append(ch)
        except UnicodeEncodeError:
            out.append("?")
    return "".join(out)


def _s(v):
    return str(v).strip() if v is not None else ""


def _D(x):
    try:
        return Decimal(str(x))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def _q2(x):
    return _D(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _nz(v):
    return bool(_s(v))


def _is_merge_vat(user) -> bool:
    """PVM включён в цену (user.extra_settings['merge_vat'] == '1')."""
    if not user:
        return False
    extra_settings = getattr(user, "extra_settings", None)
    if not isinstance(extra_settings, dict):
        return False
    return str(extra_settings.get("merge_vat", "0")).strip() == "1"


def build_dok_nr(series: str, number: str) -> str:
    s = (series or "").strip()
    n = (number or "").strip()
    if not s:
        return n
    if not n:
        return s
    if n.startswith(s):
        return f"{s}{n[len(s):].lstrip('-/ .')}"
    return f"{s}{n}"


def get_party_code(doc, *, id_field, vat_field, id_programoje_field) -> str:
    for f in (id_field, vat_field, id_programoje_field):
        v = _s(getattr(doc, f, None))
        if v:
            return v
    return ""


def _get_pvm_kodas_for_item(doc, item, line_map=None, default="") -> str:
    item_id = getattr(item, "id", None)
    if line_map is not None and item_id is not None and item_id in line_map:
        pvm = _s(line_map.get(item_id, ""))
        if pvm and pvm != "Keli skirtingi PVM":
            return pvm
    pvm = _s(getattr(item, "pvm_kodas", ""))
    if pvm and pvm != "Keli skirtingi PVM":
        return pvm
    return default


def _get_pvm_kodas_for_doc(doc, default="") -> str:
    separate_vat = bool(getattr(doc, "separate_vat", False))
    scan_type = _s(getattr(doc, "scan_type", "")).lower()
    if separate_vat and scan_type in ("sumiskai", "summary", "suminis"):
        return default
    pvm = _s(getattr(doc, "pvm_kodas", ""))
    if pvm == "Keli skirtingi PVM":
        return default
    return pvm or default


def _get_rate(doc):
    from ..models import CurrencyRate
    currency = (getattr(doc, "currency", "EUR") or "EUR").upper()
    if currency == "EUR":
        return Decimal("1")
    date_obj = getattr(doc, "operation_date", None) or getattr(doc, "invoice_date", None)
    obj = CurrencyRate.objects.filter(currency=currency, date=date_obj).first()
    if not obj and date_obj:
        obj = CurrencyRate.objects.filter(currency=currency, date__lt=date_obj).order_by("-date").first()
    if obj and _D(obj.rate) > 0:
        return _D(obj.rate)
    logger.warning("[LENGVASKAITA] no rate for %s date=%s -> 1.0", currency, date_obj)
    return Decimal("1")


def _collect_doc(doc, merge_vat: bool = False):
    """Возвращает (head_dict, [line_dicts]) для одного документа или None."""
    dok_nr = build_dok_nr(_s(getattr(doc, "document_series", "")),
                          _s(getattr(doc, "document_number", "")))
    if not dok_nr:
        logger.warning("[LENGVASKAITA] doc=%s skipped: no document number", getattr(doc, "pk", None))
        return None

    direction = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
    if direction == "pirkimas":
        company_code = get_party_code(doc, id_field="seller_id", vat_field="seller_vat_code",
                                      id_programoje_field="seller_id_programoje")
    else:
        company_code = get_party_code(doc, id_field="buyer_id", vat_field="buyer_vat_code",
                                      id_programoje_field="buyer_id_programoje")

    rate = _get_rate(doc)
    is_credit = getattr(doc, "is_credit_invoice", None) is True
    sign = Decimal("-1") if is_credit else Decimal("1")

    amount_wo = abs(_D(getattr(doc, "amount_wo_vat", 0) or 0)) / rate
    amount_vat = abs(_D(getattr(doc, "vat_amount", 0) or 0)) / rate

    if merge_vat:
        # PVM включён в цену: всё уходит в "Be PVM", "PVM suma" = 0
        total_wo = amount_wo + amount_vat
        total_vat = Decimal("0")
    else:
        total_wo = amount_wo
        total_vat = amount_vat

    # --- группировка по PVM kodas ---
    groups = []           # [[kodas, base_wo, base_vat]]
    index = {}
    line_items = getattr(doc, "line_items", None)
    line_map = getattr(doc, "_pvm_line_map", None)

    if line_items and hasattr(line_items, "all") and line_items.exists():
        for item in line_items.all():
            # merge_vat: PVM klasifikatorius пустой -> все строки схлопываются в одну
            kodas = "" if merge_vat else _get_pvm_kodas_for_item(doc, item, line_map, default="")
            qty = _D(getattr(item, "quantity", 1) or 1)
            wo = abs(_D(getattr(item, "price", 0) or 0) * qty)
            vat = abs(_D(getattr(item, "vat", 0) or 0))
            if merge_vat:
                wo = wo + vat
                vat = Decimal("0")
            if kodas not in index:
                index[kodas] = len(groups)
                groups.append([kodas, Decimal("0"), Decimal("0")])
            g = groups[index[kodas]]
            g[1] += wo
            g[2] += vat
    if not groups:
        doc_kodas = "" if merge_vat else _get_pvm_kodas_for_doc(doc, default="")
        groups.append([doc_kodas, total_wo, total_vat])

    # --- масштабируем к документным тоталам (скидки/округления) ---
    base_wo_sum = sum(g[1] for g in groups)
    base_vat_sum = sum(g[2] for g in groups)
    k_wo = (total_wo / base_wo_sum) if base_wo_sum > 0 else Decimal("1")
    k_vat = (total_vat / base_vat_sum) if base_vat_sum > 0 else Decimal("1")

    lines = []
    acc_wo = Decimal("0")
    acc_vat = Decimal("0")
    for i, (kodas, b_wo, b_vat) in enumerate(groups):
        wo = _q2(b_wo * k_wo)
        vat = _q2(b_vat * k_vat)
        if i == len(groups) - 1:
            wo = _q2(total_wo) - acc_wo
            vat = _q2(total_vat) - acc_vat
        acc_wo += wo
        acc_vat += vat
        lines.append({
            "dok_nr": dok_nr,
            "pvm_kodas": kodas,
            "wo": wo * sign,
            "vat": vat * sign,
            "total": (wo + vat) * sign,
        })

    head = {
        "date": getattr(doc, "invoice_date", None),
        "dok_nr": dok_nr,
        "company_code": company_code,
    }
    return head, lines


def _build_xls(heads, lines) -> bytes:
    """Заполняет копию шаблона LengvaSkaita_Import_Template.xls."""
    template_path = get_lengvaskaita_template_path()

    rb = xlrd.open_workbook(str(template_path), formatting_info=True)
    rs = rb.sheet_by_index(0)
    wb = xl_copy(rb)
    ws = wb.get_sheet(0)
    ws._cell_overwrite_ok = True

    st_date = xlwt.easyxf("", num_format_str="M/D/YY")
    st_text = xlwt.easyxf("", num_format_str="@")
    st_num = xlwt.easyxf("", num_format_str="0.00")
    st_blank = xlwt.easyxf("")

    # чистим остатки данных в шаблоне, если они там есть
    for r in range(LS_FIRST_DATA_ROW, rs.nrows):
        for c in range(rs.ncols):
            ws.write(r, c, "", st_blank)

    row = LS_FIRST_DATA_ROW
    for h in heads:
        d = h["date"]
        if isinstance(d, datetime.datetime):
            d = d.date()
        if isinstance(d, datetime.date):
            ws.write(row, 0, d, st_date)
        else:
            ws.write(row, 0, _ls_str(d), st_text)
        ws.write(row, 1, _ls_str(h["dok_nr"]), st_text)
        ws.write(row, 2, _ls_str(h["company_code"]), st_text)
        row += 1

    row = LS_FIRST_DATA_ROW
    for ln in lines:
        ws.write(row, 4, _ls_str(ln["dok_nr"]), st_text)
        ws.write(row, 5, _ls_str(ln["pvm_kodas"]), st_text)
        ws.write(row, 6, float(ln["wo"]), st_num)
        ws.write(row, 7, float(ln["vat"]), st_num)
        ws.write(row, 8, float(ln["total"]), st_num)
        row += 1

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def export_to_lengvaskaita(documents, user=None, own_company_code=None) -> dict:
    """
    Возвращает {"pirkimai": bytes, "pardavimai": bytes} — только непустые ключи.
    Направление берётся из doc.pirkimas_pardavimas (проставлено резолвером).
    """
    merge_vat = _is_merge_vat(user)
    if merge_vat:
        logger.info("[LENGVASKAITA] merge_vat=True, PVM iskaiciuotas i kaina")

    buckets = {"pirkimai": {"heads": [], "lines": [], "seen": {}},
               "pardavimai": {"heads": [], "lines": [], "seen": {}}}

    for doc in documents or []:
        direction = _s(getattr(doc, "pirkimas_pardavimas", "")).lower()
        if direction == "pirkimas":
            key = "pirkimai"
        elif direction == "pardavimas":
            key = "pardavimai"
        else:
            logger.warning("[LENGVASKAITA] doc=%s skipped: unknown direction %r",
                           getattr(doc, "pk", None), direction)
            continue

        collected = _collect_doc(doc, merge_vat=merge_vat)
        if not collected:
            continue
        head, lines = collected

        # уникальность номера внутри файла (связь галва<->turinys только по номеру)
        seen = buckets[key]["seen"]
        base_nr = head["dok_nr"]
        if base_nr in seen:
            seen[base_nr] += 1
            new_nr = f"{base_nr}-{seen[base_nr]}"
            logger.warning("[LENGVASKAITA] duplicate dok_nr=%r -> %r (doc=%s)",
                           base_nr, new_nr, getattr(doc, "pk", None))
            head["dok_nr"] = new_nr
            for ln in lines:
                ln["dok_nr"] = new_nr
        else:
            seen[base_nr] = 1

        buckets[key]["heads"].append(head)
        buckets[key]["lines"].extend(lines)

    result = {}
    for key, data in buckets.items():
        if data["heads"]:
            result[key] = _build_xls(data["heads"], data["lines"])
            logger.info("[LENGVASKAITA] %s: docs=%d lines=%d",
                        key, len(data["heads"]), len(data["lines"]))
    return result