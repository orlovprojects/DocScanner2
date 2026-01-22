from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple, TypedDict
import logging
from django.db.models import Prefetch, QuerySet

# Project imports
from docscanner_app.models import ScannedDocument, LineItem
from docscanner_app.validators.vat_klas import auto_select_pvm_code
from decimal import Decimal
_TOL = Decimal("0.02")

logger = logging.getLogger("docscanner_app")



# ==============================
# Direction/PVM UI types (kept from original data_resolver)
# ==============================

DirectionCode = Optional[Literal["pirkimas", "pardavimas"]]
ViewMode = Literal["single", "multi"]
Purpose = Literal["preview", "export"]


@dataclass(frozen=True)
class ResolveContext:
    """
    Context for preview/export.
    - view_mode: 'single' | 'multi'
    - purpose: 'preview' | 'export'
    - overrides: mapping of doc.id -> direction override
    - cp_key: chosen counterparty key (for preview)
    """
    user: Any
    view_mode: ViewMode
    purpose: Purpose = "preview"
    overrides: Dict[str, str] = None
    cp_key: Optional[str] = None

    def __post_init__(self):
        object.__setattr__(self, "overrides", self.overrides or {})


# ==============================
# Small normalizers (kept)
# ==============================

def _nz(x: Any) -> Optional[str]:
    if x is None:
        return None
    s = str(x).strip()
    return s if s else None


def _normalize_vat_percent(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        if isinstance(v, Decimal):
            return float(v)
        s = str(v).strip().replace(",", ".")
        if not s:
            return None
        if s.endswith("%"):
            s = s[:-1]
        return float(Decimal(s))
    except Exception:
        return None


def _normalize_ps(v: Any) -> Optional[int]:
    """Expect one of {1,2,3,4}; return None if invalid."""
    if v is None:
        return None
    try:
        i = int(str(v).strip())
        return i if i in (1, 2, 3, 4) else None
    except Exception:
        return None


def _ps_to_bin(ps: Optional[int]) -> Optional[int]:
    """(1,3)->1 (preke); (2,4)->2 (paslauga)."""
    if ps in (1, 3):
        return 1
    if ps in (2, 4):
        return 2
    return None


def _mk_key(id_val: Any, vat_val: Any, name_val: Any) -> str:
    id_s = "" if id_val is None else str(id_val).strip()
    if id_s:
        return f"id:{id_s}"
    vat_s = (vat_val or "").strip().lower()
    name_s = (name_val or "").strip().lower()
    return vat_s or name_s


def _pp_label(code: DirectionCode, cp_selected: bool) -> str:
    if code == "pirkimas":
        return "Pirkimas"
    if code == "pardavimas":
        return "Pardavimas"
    return "Pasirinkite kontrahentą" if not cp_selected else ""


def _pvm_label(code: Optional[str], cp_selected: bool) -> str:
    if code:
        return code
    return "Pasirinkite kontrahentą" if not cp_selected else ""








##### Proverka i rasciot/popravka doc. polej

# ---------- helpers ----------
Q4 = lambda x: Decimal(str(x)).quantize(Decimal("1.0000"), rounding=ROUND_HALF_UP)  # для price, quantity
Q2 = lambda x: Decimal(str(x)).quantize(Decimal("1.00"),   rounding=ROUND_HALF_UP)  # для денежных сумм

def d(x: Any, p: int = 4) -> Decimal:
    """
    Конвертирует значение в Decimal с нужной точностью.
    p=4 для price/quantity
    p=2 для денежных сумм
    """
    if x is None or x == "" or str(x).lower() == "null":
        return Decimal("0.0000") if p == 4 else Decimal("0.00")
    try:
        return Decimal(str(x)).quantize(Decimal("1." + "0"*p), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.0000") if p == 4 else Decimal("0.00")

def append_log(doc: Dict[str, Any], msg: str) -> None:
    logs = doc.get("_global_validation_log") or []
    logs.append(msg)
    doc["_global_validation_log"] = logs

def _approx(a: Decimal, b: Decimal, tol: Decimal = Decimal("0.02")) -> bool:
    # 0.02 — денежная толерантность (2 евроцента)
    return (a - b).copy_abs() <= tol






def _has_negative_line_items(doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Найти все строки с отрицательными суммами"""
    items = doc.get("line_items") or []
    negative_items = []
    for li in items:
        subtotal = d(li.get("subtotal"), 2)
        total = d(li.get("total"), 2)
        if subtotal < 0 or total < 0:
            negative_items.append(li)
    return negative_items



def _find_donor_line(items: List[Dict], negative_idx: int, negative_amount: Decimal) -> Optional[int]:
    """
    Найти позитивную строку для поглощения скидки.
    Возвращает индекс строки-донора или None.
    """
    # Приоритет 1: ближайшая ВЫШЕ
    if negative_idx > 0:
        for i in range(negative_idx - 1, -1, -1):
            subtotal = d(items[i].get("subtotal"), 2)
            if subtotal > 0 and subtotal >= negative_amount.copy_abs():
                return i
    
    # Приоритет 2: ближайшая НИЖЕ
    if negative_idx < len(items) - 1:
        for i in range(negative_idx + 1, len(items)):
            subtotal = d(items[i].get("subtotal"), 2)
            if subtotal > 0 and subtotal >= negative_amount.copy_abs():
                return i
    
    # Приоритет 3: любая с достаточной суммой
    for i, li in enumerate(items):
        if i == negative_idx:
            continue
        subtotal = d(li.get("subtotal"), 2)
        if subtotal > 0 and subtotal >= negative_amount.copy_abs():
            return i
    
    # Приоритет 4: самая большая
    max_idx = None
    max_amount = Decimal("0.00")
    for i, li in enumerate(items):
        if i == negative_idx:
            continue
        subtotal = d(li.get("subtotal"), 2)
        if subtotal > max_amount:
            max_amount = subtotal
            max_idx = i
    
    return max_idx


def _apply_discount_to_donor(donor: Dict, discount_li: Dict, doc: Dict) -> None:
    """
    Применить скидку к строке-донору.
    
    Логика:
    - donor.subtotal := donor.subtotal + discount.subtotal (т.е. вычитаем)
    - donor.vat := donor.vat + discount.vat
    - donor.total := donor.total + discount.total
    - Пересчитать price := subtotal / qty
    """
    disc_sub = d(discount_li.get("subtotal"), 2)
    disc_vat = d(discount_li.get("vat"), 2)
    disc_tot = d(discount_li.get("total"), 2)
    
    donor_sub = d(donor.get("subtotal"), 2)
    donor_vat = d(donor.get("vat"), 2)
    donor_tot = d(donor.get("total"), 2)
    donor_qty = d(donor.get("quantity"), 4)
    
    # Применяем скидку
    new_sub = Q2(donor_sub + disc_sub)  # disc_sub отрицательный!
    new_vat = Q2(donor_vat + disc_vat)
    new_tot = Q2(donor_tot + disc_tot)
    
    donor["subtotal"] = new_sub
    donor["vat"] = new_vat
    donor["total"] = new_tot
    
    # Пересчитываем price
    if donor_qty != 0:
        donor["_orig_price"] = float(d(donor.get("price"), 4))
        donor["price"] = Q4(new_sub / donor_qty)
        donor["_price_adjusted"] = True
    
    # Логирование
    disc_name = discount_li.get("product_name", "?")
    (donor.setdefault("_li_calc_log", [])).append(
        f"absorbed discount from '{disc_name}': sub{disc_sub}, vat{disc_vat}, tot{disc_tot}"
    )
    
    (discount_li.setdefault("_li_calc_log", [])).append(
        f"removed: merged into line '{donor.get('product_name', '?')}'"
    )



def _merge_negative_line_items(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    ПОСЛЕ всех базовых reconcile, но ПЕРЕД финальной валидацией:
    - Найти все негативные line items
    - Для каждого найти донора
    - Применить скидку к донору
    - Удалить негативную строку
    - Пересчитать агрегаты
    """
    items = doc.get("line_items") or []
    if not items:
        return doc
    
    negative_items = _has_negative_line_items(doc)
    if not negative_items:
        return doc
    
    append_log(doc, f"negative-lines: found {len(negative_items)} negative line item(s)")
    
    # Обрабатываем каждую негативную строку
    items_to_remove = []
    
    for neg_li in negative_items:
        neg_idx = items.index(neg_li)
        neg_sub = d(neg_li.get("subtotal"), 2)
        
        # Найти донора
        donor_idx = _find_donor_line(items, neg_idx, neg_sub)
        
        if donor_idx is None:
            append_log(doc, f"negative-lines: WARNING - no donor found for line '{neg_li.get('product_name', '?')}'")
            continue
        
        donor = items[donor_idx]
        
        # Применить скидку
        _apply_discount_to_donor(donor, neg_li, doc)
        items_to_remove.append(neg_li)
        
        append_log(
            doc, 
            f"negative-lines: merged '{neg_li.get('product_name', '?')}' into '{donor.get('product_name', '?')}'"
        )
    
    # Удалить негативные строки
    if items_to_remove:
        new_items = [li for li in items if li not in items_to_remove]
        doc["line_items"] = new_items
        append_log(doc, f"negative-lines: removed {len(items_to_remove)} negative line(s)")
    
    return doc




# ==== Infer missing doc anchors from line items (safe defaults) ====

def _canon_line_from_partial(li: Dict[str, Any]) -> None:
    """
    Аккуратно дополняем строку из частичных данных:
      - если есть subtotal и total → vat := total - subtotal (>=0 с толерантностью)
      - если есть только total → net := total; vat := 0; vp := 0
      - если есть только subtotal → total := subtotal; vat := 0; vp := 0
      - если есть vp и subtotal → vat := round(subtotal*vp/100); total := net+vat
    Ничего не «ломает», только заполняет пропуски.
    """
    net = d(li.get("subtotal"), 2)      # ← 2 знака (денежная сумма)
    tot = d(li.get("total"), 2)         # ← 2 знака
    vat = d(li.get("vat"), 2)           # ← 2 знака
    vp  = d(li.get("vat_percent"), 2)   # ← 2 знака

    if net != 0 and tot != 0:
        vat_calc = Q2(tot - net)  # ← Q2 вместо Q4
        if vat == 0:
            li["vat"] = vat_calc if vat_calc >= Decimal("0.00") else Decimal("0.00")  # ← 0.00 вместо 0.0000
        li["total"] = Q2(tot)      # ← Q2 вместо Q4
        li["subtotal"] = Q2(net)   # ← Q2 вместо Q4
        if d(li.get("vat"), 2) == 0 and vp != 0:  # ← d(..., 2) вместо d(..., 4)
            li["vat_percent"] = Decimal("0.00")
        elif d(li.get("vat"), 2) > 0 and net > 0 and vp == 0:  # ← d(..., 2)
            li["vat_percent"] = Q2(d(li.get("vat"), 2) / net * Decimal("100"))  # ← d(..., 2)

    elif net == 0 and tot != 0:
        li["subtotal"] = Q2(tot)   # ← Q2 вместо Q4
        li["vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
        li["vat_percent"] = Decimal("0.00")

    elif net != 0 and tot == 0:
        li["total"] = Q2(net)      # ← Q2 вместо Q4
        li["vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
        li["vat_percent"] = Decimal("0.00")

    elif vp != 0 and net != 0:
        li["vat"] = Q2(net * vp / Decimal("100"))  # ← Q2 вместо Q4
        li["total"] = Q2(net + li["vat"])          # ← Q2 вместо Q4
    # иначе — оставляем как есть (совсем пустая строка)


def _infer_doc_from_lines_when_missing(doc: Dict[str, Any]) -> None:
    """
    Если у документа нет amount_wo_vat / vat_amount / amount_with_vat
    и их нельзя получить из самих полей документа — пытаемся вывести из строк.
    Для строк применяем _canon_line_from_partial (с безопасным фолбэком vat=0).
    """
    if bool(doc.get("separate_vat")):
        return  # для раздельного НДС не склеиваем якоря

    items = doc.get("line_items") or []
    if not items:
        return

    # 1) мягкая канонизация строк
    for li in items:
        _canon_line_from_partial(li)

    # 2) суммы по строкам (все денежные суммы - 2 знака)
    sum_net   = Q2(sum(d((li or {}).get("subtotal"), 2) for li in items))  # ← d(..., 2) и Q2
    sum_vat   = Q2(sum(d((li or {}).get("vat"), 2)      for li in items))  # ← d(..., 2) и Q2
    sum_gross = Q2(sum(d((li or {}).get("total"), 2)    for li in items))  # ← d(..., 2) и Q2

    # 3) реально отсутствующие поля дока
    wo_missing  = ("amount_wo_vat"   not in doc) or (doc.get("amount_wo_vat")   is None)
    vat_missing = ("vat_amount"      not in doc) or (doc.get("vat_amount")      is None)
    w_missing   = ("amount_with_vat" not in doc) or (doc.get("amount_with_vat") is None)

    changed = False

    if w_missing:
        doc["amount_with_vat"] = sum_gross; changed = True
    if vat_missing:
        doc["vat_amount"] = sum_vat; changed = True
    if wo_missing:
        # робастно к странным subtotal: wo := with - vat
        doc["amount_wo_vat"] = Q2(doc.get("amount_with_vat", sum_gross) - doc.get("vat_amount", sum_vat))  # ← Q2 вместо Q4
        changed = True

    if changed:
        append_log(doc, f"infer-doc: anchors inferred from lines → wo={doc['amount_wo_vat']}, vat={doc['vat_amount']}, with={doc['amount_with_vat']}")

    # 4) попытаться вывести doc.vat_percent, если ставка единая по строкам
    try:
        vp_set = set()
        for li in items:
            vp = d(li.get("vat_percent"), 2)
            if vp != 0:
                vp_set.add(vp)
        if len(vp_set) == 1:
            doc["vat_percent"] = next(iter(vp_set))
        elif len(vp_set) == 0 and Q2(doc.get("vat_amount", Decimal("0"))) == Decimal("0.00"):  # ← Q2 и 0.00
            doc["vat_percent"] = Decimal("0.00")
    except Exception:
        pass



def _infer_missing_sumiskai_anchors(doc: Dict[str, Any]) -> None:
    """
    ФИНАЛЬНАЯ эвристика для суммишкай-документов (БЕЗ line_items).
    Вызывается ПОСЛЕ всех основных проверок в конце resolve_document_amounts.
    
    Заполняет недостающие якоря (amount_wo_vat, vat_amount, vat_percent, amount_with_vat)
    используя безопасные предположения, когда данных очень мало.
    
    ПРИМЕНЯЕТСЯ ТОЛЬКО ЕСЛИ:
    - НЕТ line_items (иначе используется _infer_doc_from_lines_when_missing)
    - separate_vat=False (иначе не трогаем якоря)
    - Заполнено МЕНЬШЕ 2 из 3 главных полей (wo/vat/with)
    
    ПРИМЕРЫ:
    - Только WITH=100 → предполагаем zero-VAT → wo=100, vat=0, vp=0
    - WITH=121, vp=21 → wo=100, vat=21
    - WO=100, vp=19 → vat=19, with=119
    """
    items = doc.get("line_items") or []
    if items:
        return  # есть строки → используем другую логику
    
    if bool(doc.get("separate_vat")):
        return  # раздельный НДС → не трогаем
    
    wo = d(doc.get("amount_wo_vat"), 2)
    vat = d(doc.get("vat_amount"), 2)
    vp = d(doc.get("vat_percent"), 2)
    with_vat = d(doc.get("amount_with_vat"), 2)
    
    # Подсчёт заполненных полей
    filled = sum([wo != 0, vat != 0, with_vat != 0])
    
    # Если уже есть 2+ поля → основная логика справилась, не трогаем
    if filled >= 2:
        return
    
    # === СЛУЧАЙ 1: есть ТОЛЬКО amount_with_vat ===
    if with_vat != 0 and wo == 0 and vat == 0 and vp == 0:
        doc["vat_percent"] = Decimal("0.00")
        doc["vat_amount"] = Decimal("0.00")
        doc["amount_wo_vat"] = Q2(with_vat)
        append_log(
            doc,
            f"infer-sumiskai: only WITH given ({with_vat}), separate_vat=False "
            f"→ assumed zero-VAT → wo=with={with_vat}, vat=0, vp=0"
        )
        # Обновляем флаги консистентности
        doc["_check_minimum_anchors_ok"] = True
        doc["_check_core_wo_plus_vat_eq_with"] = True  # wo + vat == with
        doc["_check_core_vat_eq_wo_times_vp"] = True   # vat == wo * vp
        doc["_doc_amounts_consistent"] = True
        return
    
    # === СЛУЧАЙ 2: есть ТОЛЬКО amount_wo_vat ===
    if wo != 0 and with_vat == 0 and vat == 0 and vp == 0:
        doc["vat_percent"] = Decimal("0.00")
        doc["vat_amount"] = Decimal("0.00")
        doc["amount_with_vat"] = Q2(wo)
        append_log(
            doc,
            f"infer-sumiskai: only WO given ({wo}), separate_vat=False "
            f"→ assumed zero-VAT → with=wo={wo}, vat=0, vp=0"
        )
        doc["_check_minimum_anchors_ok"] = True
        doc["_check_core_wo_plus_vat_eq_with"] = True
        doc["_check_core_vat_eq_wo_times_vp"] = True
        doc["_doc_amounts_consistent"] = True
        return
    
    # === СЛУЧАЙ 3: есть amount_with_vat + vat_percent (но нет wo/vat) ===
    if with_vat != 0 and vp != 0 and wo == 0 and vat == 0:
        calc_wo = Q2(with_vat / (Decimal("1") + vp / Decimal("100")))
        calc_vat = Q2(with_vat - calc_wo)
        doc["amount_wo_vat"] = calc_wo
        doc["vat_amount"] = calc_vat
        append_log(
            doc,
            f"infer-sumiskai: WITH={with_vat}, vp={vp} given "
            f"→ calculated wo={calc_wo}, vat={calc_vat}"
        )
        doc["_check_minimum_anchors_ok"] = True
        return
    
    # === СЛУЧАЙ 4: есть amount_wo_vat + vat_percent (но нет with/vat) ===
    if wo != 0 and vp != 0 and with_vat == 0 and vat == 0:
        calc_vat = Q2(wo * vp / Decimal("100"))
        calc_with = Q2(wo + calc_vat)
        doc["vat_amount"] = calc_vat
        doc["amount_with_vat"] = calc_with
        append_log(
            doc,
            f"infer-sumiskai: WO={wo}, vp={vp} given "
            f"→ calculated vat={calc_vat}, with={calc_with}"
        )
        doc["_check_minimum_anchors_ok"] = True
        return
    
    # === СЛУЧАЙ 5: есть amount_with_vat + vat_amount (но нет wo/vp) ===
    if with_vat != 0 and vat != 0 and wo == 0:
        calc_wo = Q2(with_vat - vat)
        doc["amount_wo_vat"] = calc_wo
        if calc_wo > 0:
            calc_vp = Q2(vat / calc_wo * Decimal("100"))
            doc["vat_percent"] = calc_vp
            append_log(
                doc,
                f"infer-sumiskai: WITH={with_vat}, vat={vat} given "
                f"→ calculated wo={calc_wo}, vp={calc_vp}"
            )
        else:
            append_log(
                doc,
                f"infer-sumiskai: WITH={with_vat}, vat={vat} given "
                f"→ calculated wo={calc_wo} (cannot calc vp from zero wo)"
            )
        doc["_check_minimum_anchors_ok"] = True
        return
    
    # Если ничего не подошло — логируем для диагностики
    append_log(
        doc,
        f"infer-sumiskai: insufficient data to infer anchors "
        f"(wo={wo}, vat={vat}, vp={vp}, with={with_vat})"
    )


def resolve_document_amounts(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    ЕДИНАЯ функция для документа (line_items НЕ трогаем):
      • детектит скидки (document/line/none) и пишет _effective_discount_*
      • примиряет скидки и НДС (в т.ч. zero-VAT по схеме A)
      • discount-aware досчитывает 4 якоря: amount_wo_vat, vat_amount, vat_percent, amount_with_vat
      • выполняет финальные консистент-проверки и пишет *_check_* флаги
    """
    _infer_doc_from_lines_when_missing(doc)
    # --- 0) детект режима скидок (только лог/флаги) ---
    items = doc.get("line_items") or []
    inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)    # ← 2 знака (денежная сумма)
    inv_w  = d(doc.get("invoice_discount_with_vat"), 2)  # ← 2 знака
    line_wo  = sum(d((li or {}).get("discount_wo_vat"), 2)   for li in items)  # ← d(..., 2)
    line_w   = sum(d((li or {}).get("discount_with_vat"), 2) for li in items)  # ← d(..., 2)
    line_vat = sum(d((li or {}).get("vat"), 2)               for li in items)  # ← d(..., 2)

    if inv_wo > 0 or inv_w > 0:
        mode = "document"
    elif line_wo > 0 or line_w > 0:
        mode = "line"
    else:
        mode = "none"

    doc["_effective_discount_mode"] = mode
    doc["_effective_discount_values"] = {
        "document": {"wo": float(inv_wo), "with": float(inv_w), "vat": 0.0},
        "line":     {"wo": float(line_wo), "with": float(line_w), "vat": float(line_vat)},
    }
    append_log(doc, f"discounts: mode={mode}, inv(wo={inv_wo}, with={inv_w}); line(wo={line_wo}, with={line_w})")

    # --- 1) ранние варнинги ---
    wo  = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака
    w   = d(doc.get("amount_with_vat"), 2)    # ← 2 знака
    v   = d(doc.get("vat_amount"), 2)         # ← 2 знака
    vp  = d(doc.get("vat_percent"), 2)

    append_log(doc, f"check#0 discounts: invoice_discount_wo_vat={inv_wo}, invoice_discount_with_vat={inv_w}")
    if v < 0 or vp < 0:
        append_log(doc, f"warn: negative VAT values (vat_amount={v}, vat_percent={vp})")
    if inv_wo < 0 or inv_w < 0:
        append_log(doc, f"warn: negative discounts (inv_wo={inv_wo}, inv_with={inv_w})")
    if inv_wo > 0 and wo > 0 and inv_wo > wo:
        append_log(doc, f"warn: invoice_discount_wo_vat({inv_wo}) > amount_wo_vat({wo})")
    if inv_w > 0 and w > 0 and inv_w > w:
        append_log(doc, f"warn: invoice_discount_with_vat({inv_w}) > amount_with_vat({w})")

    # separate_vat → никаких скидочных эвристик, только якоря "как есть"
    if bool(doc.get("separate_vat")):
        append_log(doc, "skip: separate_vat=True → anchors only, no discount reconciliation")
        return _calc_anchors_discount_aware(doc, allow_discount_from_with=False)

    # --- 2) если без скидок уже wo+vat≈with → скидки информационные (обнулим) ---
    if _approx(Q2(wo + v), w):  # ← Q2 вместо Q4
        if inv_wo != 0 or inv_w != 0:
            append_log(doc, "info: wo+vat≈with → document-level discounts treated as informational; zeroed")
            doc["invoice_discount_wo_vat"] = Decimal("0.00")    # ← 0.00 вместо 0.0000
            doc["invoice_discount_with_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
            inv_wo, inv_w = Decimal("0.00"), Decimal("0.00")    # ← 0.00 вместо 0.0000
        return _final_checks(_calc_anchors_discount_aware(doc, allow_discount_from_with=False))

    # --- 3) если есть скидки, а НДС неполон — безопасно досчитаем из wo ---
    if (inv_wo != 0 or inv_w != 0):
        if v == 0 and vp != 0 and wo != 0:
            v = Q2(wo * vp / Decimal("100"))  # ← Q2 вместо Q4
            doc["vat_amount"] = v
            append_log(doc, f"calc: vat_amount := wo*vp = {v}")
        elif vp == 0 and v != 0 and wo != 0:
            vp = Q2(v / wo * Decimal("100"))
            doc["vat_percent"] = vp
            append_log(doc, f"calc: vat_percent := vat/wo*100 = {vp}")

    # обновим локальные копии (все денежные - 2 знака)
    wo  = d(doc.get("amount_wo_vat"), 2)              # ← 2 знака
    w   = d(doc.get("amount_with_vat"), 2)            # ← 2 знака
    v   = d(doc.get("vat_amount"), 2)                 # ← 2 знака
    vp  = d(doc.get("vat_percent"), 2)
    inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)     # ← 2 знака
    inv_w  = d(doc.get("invoice_discount_with_vat"), 2)   # ← 2 знака

    v_eff = v  # 0 — ок

    # --- 4) проверка расположения скидок (A, B) ---
    coreA = _approx(Q2(wo - inv_wo + v_eff), w) if (inv_wo != 0 or v_eff != 0) else False  # ← Q2
    coreB = _approx(Q2(wo + v_eff), Q2(w - inv_w)) if (inv_w  != 0 or v_eff != 0) else False  # ← Q2

    # после расчёта coreA/coreB
    if coreA is True and (v == 0 or v is None) and (vp == 0 or vp is None):
        doc["vat_amount"]  = Decimal("0.00")   # ← 0.00 вместо 0.0000
        doc["vat_percent"] = Decimal("0.00")
        append_log(doc, "set: zero-VAT scenario confirmed by discounts (A) → vat=0, vp=0")

    if coreB is True and (v == 0 or v is None) and (vp == 0 or vp is None):
        doc["vat_amount"]  = Decimal("0.00")   # ← 0.00 вместо 0.0000
        doc["vat_percent"] = Decimal("0.00")
        append_log(doc, "set: zero-VAT scenario confirmed by discounts (B) → vat=0, vp=0")

    if coreA or coreB:
        append_log(doc, f"ok: discounts position consistent (A={coreA}, B={coreB})")
        return _final_checks(_calc_anchors_discount_aware(doc, allow_discount_from_with=True))

    # --- 5) попробуем «свап» скидок (если перепутали поля) ---
    swapA = _approx(Q2(wo - inv_w + v_eff), w) if inv_w != 0 else None    # ← Q2, WITH → WO
    swapB = _approx(Q2(wo + v_eff), Q2(w - inv_wo)) if inv_wo != 0 else None  # ← Q2, WO → WITH

    moved = False
    if swapA is True:
        doc["invoice_discount_wo_vat"]   = Q2(inv_wo + inv_w)  # ← Q2 вместо Q4
        doc["invoice_discount_with_vat"] = Decimal("0.00")     # ← 0.00 вместо 0.0000
        moved = True
        append_log(doc, "fix: moved discount_with_vat → discount_wo_vat (A')")

    elif swapB is True:
        doc["invoice_discount_with_vat"] = Q2(inv_w + inv_wo)  # ← Q2 вместо Q4
        doc["invoice_discount_wo_vat"]   = Decimal("0.00")     # ← 0.00 вместо 0.0000
        moved = True
        append_log(doc, "fix: moved discount_wo_vat → discount_with_vat (B')")

    if moved:
        inv_wo2 = d(doc.get("invoice_discount_wo_vat"), 2)     # ← 2 знака
        inv_w2  = d(doc.get("invoice_discount_with_vat"), 2)   # ← 2 знака
        coreA2 = _approx(Q2(wo - inv_wo2 + v_eff), w)  # ← Q2
        coreB2 = _approx(Q2(wo + v_eff), Q2(w - inv_w2))  # ← Q2
        append_log(doc, f"recheck after move: A={coreA2}, B={coreB2}")

    else:
        append_log(doc, "warn: discounts position inconsistent; no move performed")

    result = _final_checks(_calc_anchors_discount_aware(doc, allow_discount_from_with=True))
    
    # ✅ НОВОЕ: Для суммишкай-документов с недостающими данными
    _infer_missing_sumiskai_anchors(result)
    
    return result


def _calc_anchors_discount_aware(doc: Dict[str, Any], *, allow_discount_from_with: bool) -> Dict[str, Any]:
    """Досчёт 4 якорей с учётом скидок."""
    log: List[str] = []

    wo  = d(doc.get("amount_wo_vat"), 2)         # ← 2 знака
    v   = d(doc.get("vat_amount"), 2)            # ← 2 знака
    vp  = d(doc.get("vat_percent"), 2)           # ← 2 знака
    w   = d(doc.get("amount_with_vat"), 2)       # ← 2 знака

    inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)     # ← 2 знака
    inv_w  = d(doc.get("invoice_discount_with_vat"), 2)   # ← 2 знака
    has_disc = (inv_wo != 0 or inv_w != 0)

    pres = {"wo": wo != 0, "vat": v != 0, "vp": vp != 0, "with": w != 0}
    ok_min = (sum(pres.values()) >= 2) and (pres["wo"] or pres["with"])
    doc["_check_minimum_anchors_ok"] = bool(ok_min)
    append_log(doc, f"_check_minimum_anchors_ok={ok_min}")

    if not ok_min:
        doc["_main_amounts_calc_log"] = log
        return doc

    # 1) wo — при скидках НЕ выводим из (with - vat) и (with/vp)
    if wo == 0:
        if not has_disc and w != 0 and v != 0:
            wo = Q2(w - v); log.append("wo from with & vat (no-disc)")
        elif not has_disc and w != 0 and vp != 0:
            wo = Q2(w / (Decimal("1") + vp / Decimal("100"))); log.append("wo from with & vat% (no-disc)")

    # 2) vat — при скидках НЕ выводим из (with - wo)
    if v == 0:
        if wo != 0 and vp != 0:
            v = Q2(wo * vp / Decimal("100")); log.append("vat from wo & vat%")
        elif not has_disc and w != 0 and wo != 0:
            v = Q2(w - wo); log.append("vat from with & wo (no-disc)")

    # 3) vp — при скидках НЕ выводим из (with & wo)
    if vp == 0:
        if wo != 0 and v != 0:
            vp = Q2(v / wo * Decimal("100")); log.append("vat% from vat & wo")
        elif not has_disc and w != 0 and wo != 0:
            vp = Q2((w / wo - Decimal("1")) * Decimal("100")); log.append("vat% from with & wo (no-disc)")

    # 4) with — при скидках учитываем скидки
    if w == 0 and wo != 0:
        v_eff = v if v != 0 else (Q2(wo * vp / Decimal("100")) if vp != 0 else Decimal("0.00"))
        if has_disc and allow_discount_from_with:
            if inv_wo != 0:
                w = Q2(wo - inv_wo + v_eff); log.append("with from wo & vat & inv_disc_wo (disc-aware)")
            elif inv_w != 0:
                w = Q2(wo + v_eff - inv_w);  log.append("with from wo & vat & inv_disc_with (disc-aware)")
            else:
                w = Q2(wo + v_eff);          log.append("with from wo & vat (disc-aware, no explicit inv_disc)")
        else:
            if vp != 0:
                w = Q2(wo * (Decimal("1") + vp / Decimal("100"))); log.append("with from wo & vat%")
            elif v != 0:
                w = Q2(wo + v); log.append("with from wo & vat")

    # сохранить с округлением до 2 знаков
    doc["amount_wo_vat"]   = Q2(wo)
    doc["vat_amount"]      = Q2(v)
    doc["vat_percent"]     = Q2(vp)
    doc["amount_with_vat"] = Q2(w)
    doc["_main_amounts_calc_log"] = log
    return doc


def _final_checks(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Финальные консистент-проверки и флаги (только лог, без подмен)."""
    wo = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака (денежная сумма)
    v  = d(doc.get("vat_amount"), 2)         # ← 2 знака
    vp = d(doc.get("vat_percent"), 2)
    w  = d(doc.get("amount_with_vat"), 2)    # ← 2 знака

    # Базовые ядра
    core1 = (Q2(wo + v) == w)  # ← Q2 вместо Q4
    vat_from_rate = Q2(wo * vp / Decimal("100"))  # ← Q2 вместо Q4
    core2 = (wo == 0 and v == 0 and vp == 0) or _approx(vat_from_rate, v)  # tol=0.02 по умолчанию
    append_log(doc, f"core: wo+vat==with -> {core1}; vat≈wo*vp -> {core2} (vat_from_rate={vat_from_rate}, v={v})")

    doc["_check_core_wo_plus_vat_eq_with"] = bool(core1)
    doc["_check_core_vat_eq_wo_times_vp"]  = bool(core2)
    append_log(doc, f"core: wo+vat==with -> {core1}; vat==wo*vp -> {core2}")

    # Сценарии со скидками (A/B)
    scenA = None
    scenB = None
    inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)     # ← 2 знака
    inv_w  = d(doc.get("invoice_discount_with_vat"), 2)   # ← 2 знака

    if not core1:
        scenA = (Q2(wo - inv_wo + v) == w) if inv_wo != 0 else None  # ← Q2 вместо Q4
        scenB = (Q2(wo + v) == Q2(w - inv_w)) if inv_w != 0 else None  # ← Q2 вместо Q4
        if scenA is not None:
            append_log(doc, f"check: (wo - inv_disc_wo + vat == with) -> {scenA}")
        if scenB is not None:
            append_log(doc, f"check: (wo + vat == with - inv_disc_with) -> {scenB}")

    # Явная проверка тождеств со скидками (всегда логируем)
    identity_A_calc = Q2(wo - inv_wo + v)  # ← Q2 вместо Q4
    identity_A_ok = _approx(identity_A_calc, w)
    doc["_check_doc_discount_identity"] = bool(identity_A_ok)
    append_log(doc, f"identity(A): wo - disc_wo + vat ≈ with -> {identity_A_ok} (calc={identity_A_calc}, with={w})")

    identity_B_left  = Q2(wo + v)          # ← Q2 вместо Q4
    identity_B_right = Q2(w - inv_w)       # ← Q2 вместо Q4
    identity_B_ok = _approx(identity_B_left, identity_B_right)
    doc["_check_doc_discount_identity_B"] = bool(identity_B_ok)
    append_log(doc, f"identity(B): wo + vat ≈ with - disc_with -> {identity_B_ok} (left={identity_B_left}, right={identity_B_right})")

    # Итоговая консистентность документа
    ok = bool(core1 and core2) or bool(scenA) or bool(scenB) or bool(identity_A_ok) or bool(identity_B_ok)
    doc["_doc_amounts_consistent"] = ok
    append_log(doc, f"document consistency: {ok}")
    return doc











# ==============================
# Direction resolution (kept from original)
# ==============================

def resolve_direction(doc: ScannedDocument, ctx: ResolveContext) -> DirectionCode:
    if ctx.view_mode == "single":
        raw = _nz(getattr(doc, "pirkimas_pardavimas", None))
        if raw:
            raw = raw.lower()
        return raw if raw in ("pirkimas", "pardavimas") else None

    ov = (ctx.overrides or {}).get(str(doc.pk))
    if ov in ("pirkimas", "pardavimas"):
        return ov

    if ctx.cp_key:
        s_key = _mk_key(doc.seller_id, doc.seller_vat_code, doc.seller_name)
        b_key = _mk_key(doc.buyer_id,  doc.buyer_vat_code,  doc.buyer_name)
        if ctx.cp_key == s_key:
            return "pardavimas"
        if ctx.cp_key == b_key:
            return "pirkimas"
        return None

    has_buyer = any((_nz(doc.buyer_id), _nz(doc.buyer_vat_code), _nz(doc.buyer_name)))
    has_seller = any((_nz(doc.seller_id), _nz(doc.seller_vat_code), _nz(doc.seller_name)))

    if not has_buyer and not has_seller:
        return None
    if has_buyer and not has_seller:
        return "pirkimas"
    if has_seller and not has_buyer:
        return "pardavimas"

    user_code = _nz(getattr(ctx.user, "company_code", None))
    user_vat  = _nz(getattr(ctx.user, "company_vat_code", None))
    user_name = _nz(getattr(ctx.user, "company_name", None))

    def _matches_user(prefix: str) -> bool:
        pid  = _nz(getattr(doc, f"{prefix}_id", None))
        pvat = _nz(getattr(doc, f"{prefix}_vat_code", None))
        pname= _nz(getattr(doc, f"{prefix}_name", None))
        return (
            (user_code and pid  and user_code == pid) or
            (user_vat  and pvat and user_vat.lower() == pvat.lower()) or
            (user_name and pname and user_name.lower() == pname.lower())
        )

    if _matches_user("buyer"):
        return "pirkimas"
    if _matches_user("seller"):
        return "pardavimas"
    return None


# ==============================
# PVM computation (kept, with small export normalization)
# ==============================

class LineItemPreview(TypedDict, total=False):
    id: int
    pvm_kodas: Optional[str]
    pvm_kodas_label: str


class PvmResult(TypedDict, total=False):
    pirkimas_pardavimas_code: DirectionCode
    pirkimas_pardavimas_label: str
    pvm_kodas: Optional[str]
    pvm_kodas_label: str
    line_items: List[LineItemPreview]


def _need_geo(v: Optional[float]) -> bool:
    return v == 0.0


def _compute_pvm_detaliai_multi(
    doc: ScannedDocument,
    direction: DirectionCode,
    cp_selected: bool,
    base_vat_percent: Any,
    base_preke_paslauga: Any,
) -> PvmResult:
    buyer_iso  = _nz(doc.buyer_country_iso)
    seller_iso = _nz(doc.seller_country_iso)
    buyer_has_v  = bool(_nz(doc.buyer_vat_code))
    seller_has_v = bool(_nz(doc.seller_vat_code))

    li_qs = LineItem.objects.filter(document=doc).only("id", "vat_percent", "preke_paslauga")

    li_preview: List[LineItemPreview] = []
    pvm_set, vat_set = set(), set()

    vat_doc = _normalize_vat_percent(base_vat_percent)
    ps_doc  = _normalize_ps(base_preke_paslauga)
    ps_doc_bin = _ps_to_bin(ps_doc)

    for li in li_qs:
        li_vat = _normalize_vat_percent(li.vat_percent if li.vat_percent is not None else base_vat_percent)
        li_ps  = _normalize_ps(li.preke_paslauga if li.preke_paslauga is not None else ps_doc)
        li_ps_bin = _ps_to_bin(li_ps)

        if _need_geo(li_vat) and (direction is None or not (buyer_iso and seller_iso)):
            li_code = None
        else:
            li_code = auto_select_pvm_code(
                pirkimas_pardavimas=direction,
                buyer_country_iso=buyer_iso,
                seller_country_iso=seller_iso,
                preke_paslauga=li_ps_bin,
                vat_percent=li_vat,
                separate_vat=bool(doc.separate_vat),
                buyer_has_vat_code=buyer_has_v,
                seller_has_vat_code=seller_has_v,
                doc_96_str=bool(getattr(doc, "doc_96_str", False)),
            )

        if li_code is not None:
            pvm_set.add(li_code)
        if li_vat is not None:
            vat_set.add(li_vat)

        li_preview.append({
            "id": li.id,
            "pvm_kodas": li_code,
            "pvm_kodas_label": _pvm_label(li_code, cp_selected),
        })

    if bool(doc.separate_vat):
        pvm_doc = "Keli skirtingi PVM"
    else:
        if len(pvm_set) == 1 and len(vat_set) == 1:
            pvm_doc = next(iter(pvm_set))
        elif len(pvm_set) == 0:
            pvm_doc = None
        else:
            pvm_doc = ""

    return PvmResult(
        pirkimas_pardavimas_code=direction,
        pirkimas_pardavimas_label=_pp_label(direction, cp_selected),
        pvm_kodas=pvm_doc,
        pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
        line_items=li_preview,
    )


def _compute_pvm_sumiskai_multi(
    doc: ScannedDocument,
    direction: DirectionCode,
    cp_selected: bool,
    base_vat_percent: Any,
    base_preke_paslauga: Any,
) -> PvmResult:
    buyer_iso  = _nz(doc.buyer_country_iso)
    seller_iso = _nz(doc.seller_country_iso)
    buyer_has_v  = bool(_nz(doc.buyer_vat_code))
    seller_has_v = bool(_nz(doc.seller_vat_code))

    vat_doc = _normalize_vat_percent(base_vat_percent)
    ps_doc  = _normalize_ps(base_preke_paslauga)
    ps_bin  = _ps_to_bin(ps_doc)

    if _need_geo(vat_doc) and (direction is None or not (buyer_iso and seller_iso)):
        pvm_doc = None
    else:
        pvm_doc = auto_select_pvm_code(
            pirkimas_pardavimas=direction,
            buyer_country_iso=buyer_iso,
            seller_country_iso=seller_iso,
            preke_paslauga=ps_bin,
            vat_percent=vat_doc,
            separate_vat=bool(doc.separate_vat),
            buyer_has_vat_code=buyer_has_v,
            seller_has_vat_code=seller_has_v,
            doc_96_str=bool(getattr(doc, "doc_96_str", False)),
        )

    return PvmResult(
        pirkimas_pardavimas_code=direction,
        pirkimas_pardavimas_label=_pp_label(direction, cp_selected),
        pvm_kodas=pvm_doc,
        pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
        line_items=[],
    )


# def compute_pvm(
#     doc: ScannedDocument,
#     ctx: ResolveContext,
#     *,
#     base_vat_percent: Any,
#     base_preke_paslauga: Any,
#     cp_selected: bool,
# ) -> PvmResult:
#     direction = resolve_direction(doc, ctx)

#     if ctx.view_mode == "single":
#         pvm_doc = _nz(getattr(doc, "pvm_kodas", None))
#         if ctx.purpose == "export":
#             has_lineitems = LineItem.objects.filter(document=doc).exists()
#             pvm_doc = normalize_for_purpose(pvm_doc, has_lineitems=has_lineitems, purpose=ctx.purpose)

#         return PvmResult(
#             pirkimas_pardavimas_code=_nz(getattr(doc, "pirkimas_pardavimas", None)),
#             pirkimas_pardavimas_label=_pp_label(_nz(getattr(doc, "pirkimas_pardavimas", None)), cp_selected),
#             pvm_kodas=pvm_doc,
#             pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
#             line_items=[],
#         )

#     scan_type = (_nz(getattr(doc, "scan_type", None)) or "").lower()
#     if scan_type == "detaliai" and LineItem.objects.filter(document=doc).exists():
#         result = _compute_pvm_detaliai_multi(
#             doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
#         )
#     else:
#         result = _compute_pvm_sumiskai_multi(
#             doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
#         )

#     has_lineitems = bool(result.get("line_items"))
#     result["pvm_kodas"] = normalize_for_purpose(
#         result.get("pvm_kodas"), has_lineitems=has_lineitems, purpose=ctx.purpose
#     )
#     result["pvm_kodas_label"] = _pvm_label(result.get("pvm_kodas"), cp_selected)

#     if ctx.purpose == "preview" and not cp_selected:
#         result["pvm_kodas"] = None
#         result["pvm_kodas_label"] = "Pasirinkite kontrahentą"
#         if result.get("line_items"):
#             li = []
#             for item in result["line_items"]:
#                 li.append({
#                     "id": item.get("id"),
#                     "pvm_kodas": None,
#                     "pvm_kodas_label": "Pasirinkite kontrahentą",
#                 })
#             result["line_items"] = li

#     return result


def compute_pvm(
    doc: ScannedDocument,
    ctx: ResolveContext,
    *,
    base_vat_percent: Any,
    base_preke_paslauga: Any,
    cp_selected: bool,
    skip_line_items: bool = False,  # <-- новый параметр
) -> PvmResult:
    direction = resolve_direction(doc, ctx)

    if ctx.view_mode == "single":
        pvm_doc = _nz(getattr(doc, "pvm_kodas", None))
        if ctx.purpose == "export":
            has_lineitems = LineItem.objects.filter(document=doc).exists()
            pvm_doc = normalize_for_purpose(pvm_doc, has_lineitems=has_lineitems, purpose=ctx.purpose)

        return PvmResult(
            pirkimas_pardavimas_code=_nz(getattr(doc, "pirkimas_pardavimas", None)),
            pirkimas_pardavimas_label=_pp_label(_nz(getattr(doc, "pirkimas_pardavimas", None)), cp_selected),
            pvm_kodas=pvm_doc,
            pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
            line_items=[],
        )

    # Для preview с skip_line_items — не грузим line items вообще
    if skip_line_items:
        return _compute_pvm_sumiskai_multi(
            doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
        )

    scan_type = (_nz(getattr(doc, "scan_type", None)) or "").lower()
    if scan_type == "detaliai" and LineItem.objects.filter(document=doc).exists():
        result = _compute_pvm_detaliai_multi(
            doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
        )
    else:
        result = _compute_pvm_sumiskai_multi(
            doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
        )

    has_lineitems = bool(result.get("line_items"))
    result["pvm_kodas"] = normalize_for_purpose(
        result.get("pvm_kodas"), has_lineitems=has_lineitems, purpose=ctx.purpose
    )
    result["pvm_kodas_label"] = _pvm_label(result.get("pvm_kodas"), cp_selected)

    if ctx.purpose == "preview" and not cp_selected:
        result["pvm_kodas"] = None
        result["pvm_kodas_label"] = "Pasirinkite kontrahentą"
        if result.get("line_items"):
            li = []
            for item in result["line_items"]:
                li.append({
                    "id": item.get("id"),
                    "pvm_kodas": None,
                    "pvm_kodas_label": "Pasirinkite kontrahentą",
                })
            result["line_items"] = li

    return result


def normalize_for_purpose(
    pvm_doc: Optional[str], *, has_lineitems: bool, purpose: Purpose
) -> Optional[str]:
    if purpose == "export" and (not has_lineitems) and pvm_doc == "Keli skirtingi PVM":
        return ""
    return pvm_doc


# ==============================
# Facades for views/exports (kept)
# ==============================

# def build_preview(
#     doc: ScannedDocument,
#     user: Any,
#     *,
#     cp_key: Optional[str],
#     view_mode: ViewMode,
#     base_vat_percent: Any,
#     base_preke_paslauga: Any,
# ) -> PvmResult:
#     ctx = ResolveContext(
#         user=user,
#         view_mode=view_mode,
#         purpose="preview",
#         overrides={},
#         cp_key=cp_key,
#     )
#     cp_selected = bool(cp_key)
#     return compute_pvm(
#         doc,
#         ctx,
#         base_vat_percent=base_vat_percent,
#         base_preke_paslauga=base_preke_paslauga,
#         cp_selected=cp_selected,
#     )

def build_preview(
    doc: ScannedDocument,
    user: Any,
    *,
    cp_key: Optional[str],
    view_mode: ViewMode,
    base_vat_percent: Any,
    base_preke_paslauga: Any,
) -> PvmResult:
    ctx = ResolveContext(
        user=user,
        view_mode=view_mode,
        purpose="preview",
        overrides={},
        cp_key=cp_key,
    )
    cp_selected = bool(cp_key)
    return compute_pvm(
        doc,
        ctx,
        base_vat_percent=base_vat_percent,
        base_preke_paslauga=base_preke_paslauga,
        cp_selected=cp_selected,
        skip_line_items=True,  # передаём в compute_pvm, НЕ в ResolveContext
    )


class ExportResolvedDoc(TypedDict, total=False):
    doc: ScannedDocument
    direction: DirectionCode
    pvm_kodas: Optional[str]
    line_items: List[LineItemPreview]


class ExportPrepared(TypedDict, total=False):
    pirkimai: List[ExportResolvedDoc]
    pardavimai: List[ExportResolvedDoc]
    unknown: List[ExportResolvedDoc]


# def prepare_export_groups(
#     documents: Iterable[ScannedDocument],
#     *,
#     user: Any,
#     overrides: Dict[str, str] | None,
#     view_mode: ViewMode = "multi",
#     base_vat_percent_getter=None,
#     base_preke_paslauga_getter=None,
# ) -> ExportPrepared:
#     ctx = ResolveContext(
#         user=user,
#         view_mode=view_mode,
#         purpose="export",
#         overrides=overrides or {},
#         cp_key=None,
#     )

#     def _get_base(doc: ScannedDocument) -> Tuple[Any, Any]:
#         vat = base_vat_percent_getter(doc) if base_vat_percent_getter else getattr(doc, "vat_percent", None)
#         ps  = base_preke_paslauga_getter(doc) if base_preke_paslauga_getter else getattr(doc, "preke_paslauga", None)
#         return vat, ps

#     out: ExportPrepared = {"pirkimai": [], "pardavimai": [], "unknown": []}

#     for doc in documents:
#         base_vat, base_ps = _get_base(doc)
#         res = compute_pvm(
#             doc,
#             ctx,
#             base_vat_percent=base_vat,
#             base_preke_paslauga=base_ps,
#             cp_selected=False,
#         )
#         pack: ExportResolvedDoc = {
#             "doc": doc,
#             "direction": res.get("pirkimas_pardavimas_code"),
#             "pvm_kodas": res.get("pvm_kodas"),
#             "line_items": res.get("line_items") or [],
#         }
#         if pack["direction"] == "pirkimas":
#             out["pirkimai"].append(pack)
#         elif pack["direction"] == "pardavimas":
#             out["pardavimai"].append(pack)
#         else:
#             out["unknown"].append(pack)

#     return out



def prepare_export_groups(
    documents: Iterable[ScannedDocument],
    *,
    user: Any,
    overrides: Dict[str, str] | None,
    view_mode: ViewMode = "multi",
    cp_key: Optional[str] = None,              # ✅ NEW
    base_vat_percent_getter=None,
    base_preke_paslauga_getter=None,
) -> ExportPrepared:
    ctx = ResolveContext(
        user=user,
        view_mode=view_mode,
        purpose="export",
        overrides=overrides or {},
        cp_key=cp_key,                          # ✅ NEW
    )

    # ✅ NEW: в multi export считаем, что контрагент выбран, если cp_key есть
    cp_selected = bool(cp_key) and view_mode == "multi"

    def _get_base(doc: ScannedDocument) -> Tuple[Any, Any]:
        vat = base_vat_percent_getter(doc) if base_vat_percent_getter else getattr(doc, "vat_percent", None)
        ps  = base_preke_paslauga_getter(doc) if base_preke_paslauga_getter else getattr(doc, "preke_paslauga", None)
        return vat, ps

    out: ExportPrepared = {"pirkimai": [], "pardavimai": [], "unknown": []}

    for doc in documents:
        base_vat, base_ps = _get_base(doc)

        res = compute_pvm(
            doc,
            ctx,
            base_vat_percent=base_vat,
            base_preke_paslauga=base_ps,
            cp_selected=cp_selected,             # ✅ CHANGED (was False)
        )

        pack: ExportResolvedDoc = {
            "doc": doc,
            "direction": res.get("pirkimas_pardavimas_code"),
            "pvm_kodas": res.get("pvm_kodas"),
            "line_items": res.get("line_items") or [],
        }

        if pack["direction"] == "pirkimas":
            out["pirkimai"].append(pack)
        elif pack["direction"] == "pardavimas":
            out["pardavimai"].append(pack)
        else:
            out["unknown"].append(pack)

    return out


























# =========================================================
# Line Items Resolution
# =========================================================

# Ожидается, что в модуле уже есть:
# - функции d(x, p), Q4, Q2, _approx, append_log

def _li_get_vp(li: Dict[str, Any], doc: Dict[str, Any]) -> Decimal:
    """Выбираем VAT% позиции: если separate_vat=False — наследуем из документа при необходимости."""
    separate_vat = bool(doc.get("separate_vat"))
    vp_li = d(li.get("vat_percent"), 2)
    if separate_vat:
        return vp_li  # в разрыве: допускаем нули, агрегаты сверим снизу
    # иначе берём из документа, если в строке нет
    if vp_li == 0:
        vp_doc = d(doc.get("vat_percent"), 2)
        if vp_doc != 0:
            li["_used_doc_vat_percent"] = float(vp_doc)
        return vp_doc
    return vp_li


def _coalesce_li_field(li: Dict[str, Any], key_main: str, key_alt: str, p: int = 4) -> Decimal:
    """Берём основное поле (например 'subtotal'), при его отсутствии пробуем альтернативу ('amount_wo_vat')."""
    val = li.get(key_main, None)
    if val is None:
        val = li.get(key_alt, None)
    return d(val, p)


def _detect_line_discount_mode(li: Dict[str, Any], vp_eff: Decimal) -> Tuple[Decimal, Decimal, Dict[str, Any]]:
    """Эвристики скидок."""
    flags: Dict[str, Any] = {}

    price = d(li.get("price"), 4)     # ← 4 знака (price/quantity)
    qty   = d(li.get("quantity"), 4)  # ← 4 знака
    pq    = Q2(price * qty) if (price != 0 and qty != 0) else Decimal("0.00")  # ← Q2 правильно (округляем до 2)

    subtotal_in = d(li.get("subtotal") or li.get("amount_wo_vat"), 2)  # ← 2 знака
    total_in    = d(li.get("total") or li.get("amount_with_vat"), 2)   # ← 2 знака

    disc_wo   = d(li.get("discount_wo_vat"), 2)    # ← 2 знака
    disc_with = d(li.get("discount_with_vat"), 2)  # ← 2 знака

    eff_wo   = disc_wo
    eff_with = disc_with

    # 1) дубликат скидки без НДС (цена уже со скидкой нетто)
    if pq != 0 and subtotal_in != 0 and disc_wo != 0:
        if _approx(pq, subtotal_in):
            flags["_dup_discount_wo"] = True
            eff_wo = Decimal("0.00")  # ← 0.00 вместо 0.0000

    # 2) дубликат скидки с НДС (цена уже со скидкой брутто)
    if pq != 0 and total_in != 0 and disc_with != 0:
        if vp_eff != 0:
            gross0 = Q2(pq * (Decimal("1") + vp_eff / Decimal("100")))  # ← Q2 вместо Q4 (денежная сумма)
            if _approx(gross0, total_in):
                flags["_dup_discount_with"] = True
                eff_with = Decimal("0.00")  # ← 0.00 вместо 0.0000

    # 3) при vp=0 обе суммы скидок должны совпадать (если обе заданы)
    if vp_eff == 0 and disc_wo != 0 and disc_with != 0:
        if not _approx(disc_wo, disc_with, tol=Decimal("0.01")):
            flags["_conflict_zero_vat_discount"] = True
            # Предпочитаем net-скидку
            eff_with = Decimal("0.00")  # ← 0.00 вместо 0.0000

    return eff_wo, eff_with, flags


def _reconcile_li_subtotal(li: Dict[str, Any]) -> Dict[str, Any]:
    """
    Правила пользователя для subtotal:
      0) ✅ НОВОЕ: если price*qty ≈ subtotal И subtotal задан → всё ОК
      1) price*qty ?= subtotal
      2) price*qty - discount_wo_vat ?= subtotal
      3) price*qty - discount_with_vat ?= subtotal  → перенос WITH → WO
      4) если subtotal пуст, пытаемся вывести из pq или pq-disc_wo
      5) иначе помечаем несостыковку (_price_mismatch)
    """
    price = d(li.get("price"), 4)       # ← 4 знака (price/quantity)
    qty   = d(li.get("quantity"), 4)    # ← 4 знака
    pq    = Q4(price * qty) if (price != 0 and qty != 0) else Decimal("0.0000")  # ← Q4 правильно (промежуточный расчёт)

    subtotal_in = _coalesce_li_field(li, "subtotal", "amount_wo_vat", 2)  # ← 2 знака (денежная сумма)
    disc_wo   = d(li.get("discount_wo_vat"), 2)     # ← 2 знака
    disc_with = d(li.get("discount_with_vat"), 2)   # ← 2 знака

    if pq == 0:
        return li

    # ✅ 0) СНАЧАЛА: если price*qty ≈ subtotal И subtotal УЖЕ задан → всё OK
    if subtotal_in != 0 and _approx(pq, subtotal_in, tol=_ADJ_TOL):
        li["_subtotal_rule"] = "pq-matches-subtotal"
        return li

    # 1) price*qty == subtotal (без скидок)?
    if subtotal_in != 0 and _approx(pq, subtotal_in):
        li["_subtotal_rule"] = "pq"
        return li

    # 2) price*qty - discount_wo_vat == subtotal ?
    if disc_wo != 0 and subtotal_in != 0 and _approx(Q2(pq - disc_wo), subtotal_in):  # ← Q2 (результат - денежная сумма)
        li["_subtotal_rule"] = "pq-disc_wo"
        return li

    # 3) price*qty - discount_with_vat == subtotal ? → перенос WITH → WO
    if disc_with != 0 and subtotal_in != 0 and _approx(Q2(pq - disc_with), subtotal_in):  # ← Q2
        li["_subtotal_rule"] = "pq-disc_with→wo"
        li["discount_wo_vat"] = Q2(disc_wo + disc_with)  # ← Q2 вместо Q4
        li["discount_with_vat"] = Decimal("0.00")        # ← 0.00 вместо 0.0000
        li["_moved_discount"] = "with→wo"
        return li

    # 4) Если subtotal не задан — выводим из pq (с учётом disc_wo)
    if subtotal_in == 0:
        guess = Q2(pq - disc_wo) if disc_wo != 0 else Q2(pq)  # ← Q2 (результат - денежная сумма)
        li["subtotal"] = guess
        li["_subtotal_rule"] = "derived"
        return li

    # 5) Ничего не сошлось — помечаем
    li["_price_mismatch"] = True
    li["_subtotal_rule"] = "as-is-mismatch"
    return li


def _calc_line_anchors(li: Dict[str, Any], vp_eff: Decimal) -> Dict[str, Any]:
    """
    Считает канонические поля строки.
    ВАЖНО: денежные суммы округляем до 2 знаков!
    """
    log: List[str] = []

    price = d(li.get("price"), 4)      # ← 4 знака
    qty   = d(li.get("quantity"), 4)   # ← 4 знака
    pq    = Q4(price * qty) if (price != 0 and qty != 0) else Decimal("0.0000")

    # входные представления (денежные суммы читаем как есть)
    subtotal_in = d(li.get("subtotal") or li.get("amount_wo_vat"), 2)  # ← 2 знака
    vat_in      = d(li.get("vat"), 2)                                   # ← 2 знака
    total_in    = d(li.get("total") or li.get("amount_with_vat"), 2)   # ← 2 знака

    # ✅ сначала приводим subtotal по правилам пользователя
    _reconcile_li_subtotal(li)
    subtotal_in = d(li.get("subtotal") or li.get("amount_wo_vat"), 2)  # ← 2 знака

    # детект и нормализация скидок
    eff_disc_wo, eff_disc_with, flags = _detect_line_discount_mode(li, vp_eff)
    li.update(flags)

    # --- каноника ---
    net  = Decimal("0.00")
    vat  = Decimal("0.00")
    gross = Decimal("0.00")

    # 1) нетто (до НДС)
    if subtotal_in != 0:
        net = subtotal_in
        log.append("net := provided/derived subtotal")
    elif pq != 0:
        net = Q2(pq)  # ← округляем price×qty до 2 знаков!
        log.append("net := price * quantity (rounded to 2 decimals)")

    # 2) VAT
    if vat_in != 0:
        vat = vat_in
        log.append("vat := provided")
    else:
        if vp_eff != 0 and net != 0:
            vat = Q2(net * vp_eff / Decimal("100"))  # ← округляем до 2 знаков!
            log.append("vat := net * vp/100 (rounded to 2 decimals)")
        else:
            vat = Decimal("0.00")
            log.append("vat := 0 (vp=0 or net=0)")

    # 3) Gross (total)
    if total_in != 0:
        gross = total_in
        log.append("gross := provided total/amount_with_vat")

        # total выглядит как нетто, а VAT>0 и disc_with=0 → поправим на net+vat
        if _approx(gross, net) and vat != 0 and eff_disc_with == 0:
            gross = Q2(net + vat)  # ← округляем до 2 знаков!
            log.append("fix: provided total looked net-like -> total := net + vat (rounded to 2 decimals)")

        # total уже ~ net+vat, но discount_with_vat > 0 → скидка по брутто информ., зануляем
        if _approx(gross, Q2(net + vat)) and eff_disc_with != 0:
            li["_dup_discount_with"] = True
            li["discount_with_vat"] = Decimal("0.00")
            log.append("fix: discount_with_vat looked informational -> zeroed")
    else:
        # считаем total сами: net + vat - discount_with_vat
        gross = Q2(net + vat)  # ← округляем до 2 знаков!
        if eff_disc_with != 0:
            gross = Q2(gross - eff_disc_with)  # ← округляем до 2 знаков!
            log.append("gross := net + vat - discount_with_vat (rounded to 2 decimals)")
        else:
            log.append("gross := net + vat (rounded to 2 decimals)")

    # 4) сохранить (vp_eff остаётся с 2 знаками, остальное тоже)
    li["vat_percent"] = Q2(vp_eff)        # ← 2 знака
    li["subtotal"]    = Q2(net)           # ← 2 знака
    li["vat"]         = Q2(vat)           # ← 2 знака
    li["total"]       = Q2(gross)         # ← 2 знака
    li["_li_calc_log"] = (li.get("_li_calc_log") or []) + log
    return li






# ==============================
# Decision-tree reconcile vs document (basic)
# ==============================
def _sum_decimals(vals):
    """Суммирует значения и округляет до 2 знаков."""
    s = Decimal("0.00")
    for v in vals:
        s += d(v, 2)  # ← 2 знака
    return Q2(s)      # ← округляем итог до 2 знаков

def _recompute_from_net(li: Dict[str, Any], *, keep_total_if_given: bool = True) -> None:
    """Пересчитать VAT/total от li['subtotal'] и li['vat_percent'] (или li['vat'] если нет ставки)."""
    net = d(li.get("subtotal"), 2)      # ← 2 знака (денежная сумма)
    vp  = d(li.get("vat_percent"), 2)
    vat = d(li.get("vat"), 2)           # ← 2 знака
    tot_in = d(li.get("total"), 2)      # ← 2 знака

    if vp != 0 and net != 0:
        vat = Q2(net * vp / Decimal("100"))  # ← Q2 вместо Q4
    # иначе, если ставки нет, оставляем имеющийся vat (или 0)
    li["vat"] = vat

    # total = net + vat (если total не был явно задан или явно просим пересчитать)
    if not keep_total_if_given or tot_in == 0:
        li["total"] = Q2(net + vat)  # ← Q2 вместо Q4

def _recompute_from_total_and_vat(li: Dict[str, Any]) -> None:
    """Нетто из total - vat (скидки уже учтены)."""
    tot = d(li.get("total"), 2)      # ← 2 знака (денежная сумма)
    vat = d(li.get("vat"), 2)        # ← 2 знака
    li["subtotal"] = Q2(tot - vat)   # ← Q2 вместо Q4
    # VAT уже задан; total уже задан
    # vat_percent оставляем как есть, если есть ставка — не трогаем
    # при необходимости можно вычислить ставку из net/vat (но не делаем это тут)

def reconcile_lines_against_doc_basic_decision_tree(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Реализует укороченный decision-tree:
      (1) Σsubtotal ?= doc.wo → скидки инфо → занулить
      (2) Σ(subtotal - disc_wo) ?= doc.wo → скидки по нетто валидны → оставить
      (3) Σ(subtotal - disc_with) ?= doc.wo → поля скидок перепутаны → with→wo
      (4) Σ(total - vat) ?= doc.wo → нетто из total-vat (скидки инфо)
    При совпадении сценария — приводит строки к канонике и добавляет диагностический лог.
    """
    items = doc.get("line_items") or []
    if not items:
        return doc

    # Документные якоря
    doc_wo   = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака (денежная сумма)
    doc_vat  = d(doc.get("vat_amount"), 2)         # ← 2 знака
    doc_with = d(doc.get("amount_with_vat"), 2)    # ← 2 знака

    # Предварительные суммы по текущим данным (_sum_decimals уже использует Q2)
    sum_subtotal  = _sum_decimals(li.get("subtotal") for li in items)
    sum_disc_wo   = _sum_decimals(li.get("discount_wo_vat") for li in items)
    sum_disc_with = _sum_decimals(li.get("discount_with_vat") for li in items)
    sum_total     = _sum_decimals(li.get("total") for li in items)
    sum_vat       = _sum_decimals(li.get("vat") for li in items)

    # ---- (1) Σsubtotal ?= doc.amount_wo_vat  → line-скидки информационные
    if _approx(sum_subtotal, doc_wo):
        for li in items:
            if d(li.get("discount_wo_vat"), 2) != 0 or d(li.get("discount_with_vat"), 2) != 0:  # ← d(..., 2)
                li["discount_wo_vat"] = Decimal("0.00")    # ← 0.00 вместо 0.0000
                li["discount_with_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
                (li.setdefault("_li_calc_log", [])).append(
                    "decision#1: subtotal matches doc.net → line discounts are informational → zeroed"
                )
            # гарантируем total = net + vat
            _recompute_from_net(li, keep_total_if_given=False)

        append_log(doc, "decision#1 selected: Σsubtotal ≈ doc.amount_wo_vat → zero line discounts")
        # обновим флаги сверкой ниже в основном пайплайне
        return doc

    # ---- (2) Σ(subtotal - disc_wo) ?= doc.amount_wo_vat  → скидки по нетто валидны
    sum_net_2 = Q2(sum_subtotal - sum_disc_wo)  # ← Q2 вместо Q4
    if _approx(sum_net_2, doc_wo):
        for li in items:
            disc_wo   = d(li.get("discount_wo_vat"), 2)    # ← d(..., 2)
            disc_with = d(li.get("discount_with_vat"), 2)  # ← d(..., 2)

            # net := subtotal - discount_wo_vat
            if disc_wo != 0:
                li["subtotal"] = Q2(d(li.get("subtotal"), 2) - disc_wo)  # ← Q2 и d(..., 2)
                (li.setdefault("_li_calc_log", [])).append(
                    "decision#2: applied discount_wo_vat into net (subtotal := subtotal - disc_wo)"
                )
                li["discount_wo_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000, переносим в нетто
            # скидка с НДС, если была, трактуем как инфо (не применяем дважды)
            if disc_with != 0:
                li["discount_with_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
                (li.setdefault("_li_calc_log", [])).append(
                    "decision#2: discount_with_vat treated informational → zeroed"
                )

            _recompute_from_net(li, keep_total_if_given=False)

        append_log(doc, "decision#2 selected: Σ(subtotal - disc_wo) ≈ doc.amount_wo_vat → WO discounts applied into net")
        return doc

    # ---- (3) Σ(subtotal - disc_with) ?= doc.amount_wo_vat → перепутаны поля скидок (with→wo)
    sum_net_3 = Q2(sum_subtotal - sum_disc_with)  # ← Q2 вместо Q4
    if _approx(sum_net_3, doc_wo):
        for li in items:
            disc_wo   = d(li.get("discount_wo_vat"), 2)    # ← d(..., 2)
            disc_with = d(li.get("discount_with_vat"), 2)  # ← d(..., 2)

            if disc_with != 0:
                # перенести WITH → WO и применить к нетто
                li["subtotal"] = Q2(d(li.get("subtotal"), 2) - disc_with)  # ← Q2 и d(..., 2)
                li["discount_wo_vat"] = Q2(disc_wo + disc_with)  # ← Q2 вместо Q4
                li["discount_with_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
                li["_moved_discount"] = "with→wo"
                (li.setdefault("_li_calc_log", [])).append(
                    "decision#3: moved discount_with_vat → discount_wo_vat and applied into net"
                )

            _recompute_from_net(li, keep_total_if_given=False)

        append_log(doc, "decision#3 selected: Σ(subtotal - disc_with) ≈ doc.amount_wo_vat → moved WITH→WO and applied")
        return doc

    # ---- (4) Σ(total - vat) ?= doc.amount_wo_vat → нетто берём из total - vat (скидки инфо)
    sum_net_4 = Q2(sum_total - sum_vat)  # ← Q2 вместо Q4
    if _approx(sum_net_4, doc_wo):
        for li in items:
            # скидки считаем информационными
            if d(li.get("discount_wo_vat"), 2) != 0 or d(li.get("discount_with_vat"), 2) != 0:  # ← d(..., 2)
                li["discount_wo_vat"] = Decimal("0.00")    # ← 0.00 вместо 0.0000
                li["discount_with_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
                (li.setdefault("_li_calc_log", [])).append(
                    "decision#4: net := total - vat → line discounts treated informational → zeroed"
                )
            _recompute_from_total_and_vat(li)

        append_log(doc, "decision#4 selected: Σ(total - vat) ≈ doc.amount_wo_vat → net from total - vat")
        return doc

    # ---- Если ничего не подошло — ничего не меняем, даём лог-наводку
    append_log(
        doc,
        "decision: none matched (Σsubtotal, Σsub-disc_wo, Σsub-disc_with, Σ(total-vat) vs doc.net) → fallback to generic reconcile"
    )
    return doc




















# def _normalize_unit_price_from_net(doc: Dict[str, Any]) -> None:
#     items = doc.get("line_items") or []
#     for li in items:
#         qty = d(li.get("quantity"), 4)
#         if qty == 0:
#             continue
#         net = d(li.get("subtotal"), 4)
#         price = d(li.get("price"), 4)
#         # если price*qty не ≈ net → подгоняем unit price до net/qty
#         if not _approx(Q4(price * qty), net, tol=Decimal("0.02")):
#             li["_orig_price"] = float(price)
#             li["price"] = Q4(net / qty)
#             li["_price_adjusted"] = True
#             (li.setdefault("_li_calc_log", [])).append(
#                 "normalize-price: price := subtotal/quantity (list price looked pre-discount/informational)"
#             )

def _normalize_unit_price_from_net(doc: Dict[str, Any]) -> None:
    items = doc.get("line_items") or []
    for li in items:
        qty = d(li.get("quantity"), 4)  # ← 4 знака (quantity)
        if qty == 0:
            continue
        net = d(li.get("subtotal"), 2)      # ← 2 знака (денежная сумма)
        price = d(li.get("price"), 4)       # ← 4 знака (price)
        disc_wo = d(li.get("discount_wo_vat"), 2)  # ← 2 знака (денежная сумма)
        
        pq = Q2(price * qty)  # ← Q4 правильно (промежуточный расчёт price×qty)
        
        # ✅ Вариант A: price × qty - discount ≈ subtotal?
        if disc_wo != 0 and _approx(Q2(pq - disc_wo), net, tol=Decimal("0.02")):  # ← Q2 для результата
            # Price правильный (полная цена), subtotal уже после скидки
            (li.setdefault("_li_calc_log", [])).append(
                f"price-check: price×qty - discount ≈ subtotal ({pq} - {disc_wo} ≈ {net}) → price is full price (pre-discount)"
            )
            continue
        
        # ✅ Вариант B: price × qty ≈ subtotal? (без скидок)
        if _approx(pq, net, tol=Decimal("0.02")):
            # Price правильный (нетто), скидка информационная или уже учтена
            (li.setdefault("_li_calc_log", [])).append(
                f"price-check: price×qty ≈ subtotal ({pq} ≈ {net}) → price is net price"
            )
            continue
        
        # ❌ Если ничего не сошлось — пересчитываем price из subtotal
        li["_orig_price"] = float(price)
        li["price"] = Q4(net / qty)  # ← Q4 правильно (price всегда 4 знака)
        li["_price_adjusted"] = True
        (li.setdefault("_li_calc_log", [])).append(
            f"normalize-price: price := subtotal/quantity (was {price}, now {li['price']})"
        )


def _aggregate_lines(doc: Dict[str, Any]) -> Tuple[Decimal, Decimal, Decimal]:
    """Суммирует строки и округляет до 2 знаков."""
    items = doc.get("line_items") or []
    sum_wo   = Decimal("0.00")
    sum_vat  = Decimal("0.00")
    sum_with = Decimal("0.00")
    for li in items:
        sum_wo   += d(li.get("subtotal"), 2)    # ← 2 знака
        sum_vat  += d(li.get("vat"), 2)         # ← 2 знака
        sum_with += d(li.get("total"), 2)       # ← 2 знака
    return Q2(sum_wo), Q2(sum_vat), Q2(sum_with)  # ← округляем итоги до 2 знаков


def _zero_out_informational_doc_discounts_if_unused(doc: Dict[str, Any]) -> None:
    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)  # ← уже возвращает Q2
    doc_wo   = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака (денежная сумма)
    doc_vat  = d(doc.get("vat_amount"), 2)         # ← 2 знака
    doc_with = d(doc.get("amount_with_vat"), 2)    # ← 2 знака

    if _approx(sum_wo, doc_wo, tol=_TOL) and _approx(sum_with, doc_with, tol=_TOL) and _approx(sum_vat, doc_vat, tol=_TOL):
        inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)     # ← 2 знака
        inv_w  = d(doc.get("invoice_discount_with_vat"), 2)   # ← 2 знака
        if inv_wo != 0 or inv_w != 0:
            doc["_orig_invoice_discount_wo_vat"] = inv_wo
            doc["_orig_invoice_discount_with_vat"] = inv_w
            doc["invoice_discount_wo_vat"] = Decimal("0.00")    # ← 0.00 вместо 0.0000
            doc["invoice_discount_with_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
            append_log(doc, "doc-discount: zeroed as informational (no residual deltas)")



_ADJ_TOL = Decimal("0.02")  # денежный допуск

def _prepass_fix_price_from_total(doc: Dict[str, Any]) -> None:
    """
    Исправляет OCR-ошибки, когда модель перепутала price и total.
    
    ПРАВИЛА:
    1. Если price*qty ≈ subtotal → price УЖЕ корректный (нетто), ничего не делаем
    2. Если price ≈ total И есть vat_percent → восстанавливаем нетто из total
    3. Если price=0 но есть total и vat_percent → вычисляем price из total
    """
    if bool(doc.get("separate_vat")):
        return

    vp_doc = d(doc.get("vat_percent"), 2)
    if vp_doc == 0:
        return

    items = doc.get("line_items") or []
    for li in items:
        qty = d(li.get("quantity"), 4)  # ← 4 знака (quantity)
        if qty == 0:
            qty = Decimal("1.0000")
            
        price = d(li.get("price"), 4)       # ← 4 знака (price)
        subtotal = d(li.get("subtotal"), 2)  # ← 2 знака (денежная сумма)
        total = d(li.get("total"), 2)        # ← 2 знака (денежная сумма)
        vp_li = d(li.get("vat_percent"), 2) or vp_doc

        # ✅ СНАЧАЛА: проверяем, корректен ли уже price (price*qty ≈ subtotal?)
        if price != 0 and subtotal != 0:
            pq = Q4(price * qty)  # ← Q4 правильно (промежуточный расчёт)
            if _approx(pq, subtotal, tol=_ADJ_TOL):
                # Price уже корректный нетто, ничего не делаем
                (li.setdefault("_li_calc_log", [])).append(
                    f"price-check: price*qty ≈ subtotal ({pq}≈{subtotal}) → price is already net, no fix needed"
                )
                continue

        # ✅ ТОЛЬКО ЕСЛИ price выглядит как брутто или =0
        needs_fix = False
        if price == 0 and total != 0:
            needs_fix = True
        elif total != 0 and _approx(price, total, tol=_ADJ_TOL):
            needs_fix = True
        elif price != 0 and subtotal != 0 and _approx(Q4(price * qty), total, tol=_ADJ_TOL):  # ← Q4 для price×qty
            # price*qty ≈ total → price это брутто
            needs_fix = True

        if needs_fix:
            # Восстанавливаем нетто из total
            net = Q2(total / (Decimal("1") + vp_li / Decimal("100")))  # ← Q2 (денежная сумма)
            vat = Q2(total - net)  # ← Q2 (денежная сумма)
            new_price = Q4(net / qty)  # ← Q4 (price всегда 4 знака)

            li["vat_percent"] = vp_li
            li["subtotal"] = net
            li["vat"] = vat
            li["total"] = total
            li["price"] = new_price
            li["_price_adjusted_from_total"] = True
            (li.setdefault("_li_calc_log", [])).append(
                f"price-fix: subtotal := total/(1+vp), price := subtotal/qty (vp={vp_li}, total={total}→net={net})"
            )

def _reactivate_document_discount_if_matches_delta(doc: Dict[str, Any]) -> None:
    """
    Если дельта между Σстрок и документом совпадает с документной скидкой (или со swap),
    добавляем синтетическую строку-скидку и пересчитываем агрегаты.
    """
    items = doc.get("line_items") or []
    if not items:
        return

    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)  # ← уже возвращает Q2
    doc_wo   = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака (денежная сумма)
    doc_vat  = d(doc.get("vat_amount"), 2)         # ← 2 знака
    doc_with = d(doc.get("amount_with_vat"), 2)    # ← 2 знака

    delta_with = Q2(sum_with - doc_with)  # ← Q2 вместо Q4
    delta_wo   = Q2(sum_wo - doc_wo)      # ← Q2 вместо Q4

    # взять значения скидок (актуальные поля > effective-слепок)
    inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)     # ← 2 знака
    inv_w  = d(doc.get("invoice_discount_with_vat"), 2)   # ← 2 знака
    if inv_wo == 0 and inv_w == 0:
        eff = (doc.get("_effective_discount_values") or {}).get("document") or {}
        inv_wo = Q2(Decimal(str(eff.get("wo") or 0)))   # ← Q2 вместо Q4
        inv_w  = Q2(Decimal(str(eff.get("with") or 0))) # ← Q2 вместо Q4

    def _add_discount_line(amount: Decimal, label: str) -> None:
        li = {
            "id": None,
            "line_id": f"doc-disc-{label}",
            "product_name": f"Invoice-level discount ({label})",
            "unit": "unit",
            "quantity": Decimal("1.0000"),
            "price": Q4(-amount),        # ← Q4 правильно (price всегда 4 знака)
            "subtotal": Q2(-amount),     # ← Q2 (денежная сумма)
            "vat": Decimal("0.00"),      # ← 0.00 вместо 0.0000
            "vat_percent": Decimal("0.00"),
            "total": Q2(-amount),        # ← Q2 (денежная сумма)
            "_li_calc_log": [f"reactivated doc discount: -{amount} applied as synthetic line ({label})"],
        }
        items.append(li)
        doc["line_items"] = items
        append_log(doc, f"doc-discount-reactivated: inserted synthetic line -{amount} ({label})")

    # 1) прямое совпадение по WITH
    if delta_with > 0 and _approx(delta_with, inv_w, tol=_ADJ_TOL):
        _add_discount_line(delta_with, "with")
    # 2) прямое совпадение по WO (формула A)
    elif delta_wo > 0 and _approx(delta_wo, inv_wo, tol=_ADJ_TOL):
        _add_discount_line(delta_wo, "wo")
    # 3) swap: модель могла перепутать поля
    elif delta_with > 0 and _approx(delta_with, inv_wo, tol=_ADJ_TOL):
        _add_discount_line(delta_with, "wo→with")
    elif delta_wo > 0 and _approx(delta_wo, inv_w, tol=_ADJ_TOL):
        _add_discount_line(delta_wo, "with→wo")
    else:
        return  # нечего вставлять

    # пересчёт агрегатов и флагов
    s_wo, s_vat, s_with = _aggregate_lines(doc)
    _check_against_doc(doc, s_wo, s_vat, s_with)

    # подчистим устаревшие mismatch-хинты, если теперь всё ок
    if doc.get("ar_sutapo", False):
        prev = doc.get("_lines_structured_hints") or []
        doc["_lines_structured_hints"] = [h for h in prev if not h.startswith("DOC-LINES-NOT-MATCHING-")]
        append_log(doc, "cleanup: removed mismatch hints after doc-discount reactivation")


_DISC_TOL = Decimal("0.02")  # 2 eurocents

def _reconcile_doc_discounts_from_line_sums(doc: Dict[str, Any]) -> None:
    """Вывести и проставить документные скидки из агрегатов строк (без создания синтетических строк)."""
    items = doc.get("line_items") or []
    if not items:
        return

    # Агрегаты строк
    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)  # ← уже возвращает Q2

    # Якоря документа
    doc_wo   = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака (денежная сумма)
    doc_vat  = d(doc.get("vat_amount"), 2)         # ← 2 знака
    doc_with = d(doc.get("amount_with_vat"), 2)    # ← 2 знака

    # Кандидаты скидок, которые "объясняют" разницу строк и документа
    cand_with = Q2(sum_with - doc_with) if sum_with > doc_with else Decimal("0.00")  # ← Q2 и 0.00
    cand_wo   = Q2(sum_wo   - doc_wo)   if sum_wo   > doc_wo   else Decimal("0.00")  # ← Q2 и 0.00

    # округление к финансовому формату перед записью (уже Q2, но оставим явно)
    cand_with = Q2(cand_with)
    cand_wo   = Q2(cand_wo)

    # Проверка согласованности с НДС: ΣVAT - (disc_with - disc_wo) ≈ doc_vat
    # (интуитивно: если скидка по with больше, чем по wo, НДС строки тоже уменьшается на их разницу)
    vat_expected = Q2(sum_vat - (cand_with - cand_wo))  # ← Q2 вместо Q4

    if not _approx(vat_expected, doc_vat, tol=_DISC_TOL):
        # не можем надёжно восстановить скидки — выходим, ничего не меняем
        return

    # Если уже стоят какие-то значения, проверим перепутаны ли поля
    inv_wo_orig = d(doc.get("invoice_discount_wo_vat"), 2)     # ← 2 знака
    inv_w_orig  = d(doc.get("invoice_discount_with_vat"), 2)   # ← 2 знака

    # Сохраним оригиналы для трассировки
    if "_orig_invoice_discount_wo_vat" not in doc:
        doc["_orig_invoice_discount_wo_vat"] = inv_wo_orig
    if "_orig_invoice_discount_with_vat" not in doc:
        doc["_orig_invoice_discount_with_vat"] = inv_w_orig

    # Если старые значения не соответствуют, проставим вычисленные кандидаты
    need_update = (not _approx(inv_w_orig, cand_with, tol=_DISC_TOL)) or (not _approx(inv_wo_orig, cand_wo, tol=_DISC_TOL))

    if need_update:
        doc["invoice_discount_with_vat"] = cand_with
        doc["invoice_discount_wo_vat"]   = cand_wo
        append_log(
            doc,
            f"doc-discount: reconciled from line sums → inv_with={cand_with}, inv_wo={cand_wo}; "
            f"check VAT: Σvat({sum_vat})-(with-wo)={vat_expected}≈doc.vat({doc_vat})"
        )

    # Переустановим «информационный» режим: скидки считаем активными
    doc["_effective_discount_mode"] = "document"


def _is_empty_line_strict(li: Dict[str, Any]) -> bool:
    return (
        d(li.get("price"), 4) == 0 and       # ← price остаётся 4 знака
        d(li.get("subtotal"), 2) == 0 and    # ← 2 знака (денежная сумма)
        d(li.get("total"), 2) == 0           # ← 2 знака (денежная сумма)
    )

def _purge_zero_lines(doc: Dict[str, Any]) -> None:
    items = doc.get("line_items") or []
    if not items:
        return
    kept, removed = [], 0
    for li in items:
        if _is_empty_line_strict(li):
            removed += 1
            (li.setdefault("_li_calc_log", [])).append(
                "removed: empty line (price=subtotal=total=0/None)"
            )
        else:
            kept.append(li)
    if removed:
        doc["line_items"] = kept
        append_log(doc, f"cleanup: removed {removed} empty line(s)")



def _try_drop_suspect_header_line(doc: Dict[str, Any]) -> None:
    """
    Если суммы строк ПОСЛЕ всех базовых правок превышают документ — ищем ровно ОДНУ строку,
    у которой total (или subtotal — по выбранному ключу) ≈ дельте. Без учёта названий.
    Удаляем её ТОЛЬКО если после удаления агрегаты сходятся (ar_sutapo=True).
    """
    items = doc.get("line_items") or []
    if not items:
        return

    separate_vat = bool(doc.get("separate_vat"))

    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)  # ← уже возвращает Q2
    doc_wo   = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака (денежная сумма)
    doc_vat  = d(doc.get("vat_amount"), 2)         # ← 2 знака
    doc_with = d(doc.get("amount_with_vat"), 2)    # ← 2 знака

    # Выбираем ключ сравнения: если обе пары (Σwo+Σvat≈Σwith и doc.wo+doc.vat≈doc.with) соблюдены — сравниваем по total
    prefer_with = (
        not separate_vat
        and _approx(Q2(sum_wo + sum_vat), sum_with, tol=_TOL)   # ← Q2 вместо Q4
        and _approx(Q2(doc_wo + doc_vat), doc_with, tol=_TOL)   # ← Q2 вместо Q4
    )
    key = "total" if prefer_with else "subtotal"
    delta = Q2((sum_with - doc_with) if prefer_with else (sum_wo - doc_wo))  # ← Q2 вместо Q4

    # Нужна положительная дельта, иначе нечего удалять
    if delta <= _TOL:
        return

    def _amt(li): return d(li.get(key), 2)  # ← 2 знака (денежная сумма)

    # Ищем РОВНО ОДНУ строку, у которой сумма ≈ дельте
    exact = [li for li in items if _approx(_amt(li), delta, tol=_TOL)]
    if len(exact) != 1:
        return  # или нет кандидатов, или их несколько — не трогаем

    # Пробуем удалить и проверяем, что всё сошлось
    candidate = exact[0]
    new_items = [li for li in items if li is not candidate]
    old_items = doc["line_items"]
    doc["line_items"] = new_items

    sum_wo2, sum_vat2, sum_with2 = _aggregate_lines(doc)
    _check_against_doc(doc, sum_wo2, sum_vat2, sum_with2)

    if doc.get("ar_sutapo", False):
        rid = candidate.get("id") or candidate.get("line_id") or "?"
        (candidate.setdefault("_li_calc_log", [])).append(
            f"removed: matched document delta by {key}≈{delta}"
        )
        append_log(doc, f"cleanup: removed suspect line id={rid} (matched Δ={delta} by {key})")
        return

    # Если не сошлось — откатываем
    doc["line_items"] = old_items



def _check_against_doc(doc: Dict[str, Any], sum_wo: Decimal, sum_vat: Decimal, sum_with: Decimal) -> Dict[str, Any]:
    """Сверка агрегатов строк с документом. Сначала 'как есть';
    если не сошлось и есть документные скидки — проверяем сценарии A/B и сравниваем с восстановленными 'доскидочными' якорями."""
    doc_wo   = d(doc.get("amount_wo_vat"), 2)              # ← 2 знака (денежная сумма)
    doc_vat  = d(doc.get("vat_amount"), 2)                 # ← 2 знака
    doc_with = d(doc.get("amount_with_vat"), 2)            # ← 2 знака
    separate_vat = bool(doc.get("separate_vat"))

    inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)
    inv_w  = d(doc.get("invoice_discount_with_vat"), 2)

    # 1) Базовые сравнения "как есть"
    match_wo   = _approx(sum_wo,   doc_wo)
    match_with = _approx(sum_with, doc_with)
    match_vat  = (None if separate_vat else _approx(sum_vat, doc_vat))

    # 2) Если есть документные скидки — пробуем скидочную сверку
    if (inv_wo != 0 or inv_w != 0) and (not match_wo or not match_with or (match_vat is False)):
        # Документные тождества
        coreA = _approx(Q2(doc_wo - inv_wo + doc_vat), doc_with) if inv_wo != 0 else False
        coreB = _approx(Q2(doc_wo + doc_vat), Q2(doc_with - inv_w)) if inv_w != 0 else False

        if coreA or coreB:
            # Ожидаемые суммы строк (строки "до скидок документа")
            exp_with = Q2(doc_with + (inv_wo if coreA else inv_w))
            # ВАЖНО: при сценарии A нетто строк должны быть на inv_wo БОЛЬШЕ документа
            exp_wo   = Q2(doc_wo + (inv_wo if coreA else Decimal("0.00")))
            # VAT строк «до скидок» отличается на (with - wo)
            exp_vat  = Q2(doc_vat + (inv_w - inv_wo))

            match_with = _approx(sum_with, exp_with)
            match_wo   = _approx(sum_wo,   exp_wo)
            if not separate_vat:
                match_vat = _approx(sum_vat, exp_vat)

            append_log(doc, f"lines discount-aware check: scenario {'A' if coreA else 'B'} applied "
                            f"(exp_wo={exp_wo}, exp_vat={exp_vat}, exp_with={exp_with})")

    # inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)      # ← 2 знака
    # inv_w  = d(doc.get("invoice_discount_with_vat"), 2)    # ← 2 знака

    # # 1) Базовые сравнения "как есть" (без каких-либо поправок)
    # match_wo   = _approx(sum_wo,   doc_wo)
    # match_with = _approx(sum_with, doc_with)
    # match_vat  = (None if separate_vat else _approx(sum_vat, doc_vat))

    # # 2) Если есть документные скидки и базовые сравнения не прошли — пробуем скидочную сверку
    # if (inv_wo != 0 or inv_w != 0) and (not match_wo or not match_with or (match_vat is False)):
    #     # Проверяем тождества документа (как в _final_checks):
    #     # A: wo - inv_wo + vat ≈ with  (скидка по нетто)
    #     coreA = _approx(Q2(doc_wo - inv_wo + doc_vat), doc_with) if inv_wo != 0 else False  # ← Q2 вместо Q4
    #     # B: wo + vat ≈ with - inv_w   (скидка по брутто)
    #     coreB = _approx(Q2(doc_wo + doc_vat), Q2(doc_with - inv_w)) if inv_w != 0 else False  # ← Q2 вместо Q4

    #     if coreA:
    #         # Строки, скорее всего, "доскидочные" по нетто:
    #         # тогда with для строк должен совпасть с (док.with + inv_wo)
    #         exp_wo, exp_with, exp_vat = doc_wo, Q2(doc_with + inv_wo), doc_vat  # ← Q2 вместо Q4
    #         match_wo   = _approx(sum_wo,   exp_wo)
    #         match_with = _approx(sum_with, exp_with)
    #         if not separate_vat:
    #             match_vat = _approx(sum_vat, exp_vat)
    #         append_log(doc, "lines discount-aware check: scenario A (doc-level WO discount) applied")
        elif coreB:
            # Строки "доскидочные" по брутто:
            # тогда with для строк должен совпасть с (док.with + inv_w)
            exp_wo, exp_with, exp_vat = doc_wo, Q2(doc_with + inv_w), doc_vat  # ← Q2 вместо Q4
            match_wo   = _approx(sum_wo,   exp_wo)
            match_with = _approx(sum_with, exp_with)
            if not separate_vat:
                match_vat = _approx(sum_vat, exp_vat)
            append_log(doc, "lines discount-aware check: scenario B (doc-level WITH discount) applied")
        # иначе — оставляем базовые сравнения, ничего не корректируем

    # 3) Записываем флаги
    doc["_lines_sum_matches_wo"]   = bool(match_wo)
    doc["_lines_sum_matches_with"] = bool(match_with)
    doc["_lines_sum_matches_vat"]  = (None if separate_vat else bool(match_vat))

    # Дополнительно: агрегатное sanity-проверка Σwo+Σvat ≈ Σwith (по строкам как есть)
    doc["_lines_core_wo_plus_vat_eq_with"] = bool(_approx(Q2(sum_wo + sum_vat), sum_with))  # ← Q2 вместо Q4

    # 4) Итоговый флаг
    if separate_vat:
        ok = bool(doc["_lines_sum_matches_wo"]) and bool(doc["_lines_sum_matches_with"])
    else:
        ok = bool(doc["_lines_sum_matches_wo"]) and bool(doc["_lines_sum_matches_with"]) and bool(doc["_lines_sum_matches_vat"])
    doc["ar_sutapo"] = bool(ok)

    # Лог
    append_log(doc, f"lines aggregate: sum_wo={sum_wo}, sum_vat={sum_vat}, sum_with={sum_with}")
    append_log(
        doc,
        f"lines vs doc: wo={doc['_lines_sum_matches_wo']}, "
        f"vat={doc.get('_lines_sum_matches_vat')}, "
        f"with={doc['_lines_sum_matches_with']}, "
        f"core={doc['_lines_core_wo_plus_vat_eq_with']}, "
        f"ar_sutapo={doc['ar_sutapo']}"
    )
    return doc


# def _check_against_doc(doc: Dict[str, Any], sum_wo: Decimal, sum_vat: Decimal, sum_with: Decimal) -> Dict[str, Any]:
#     """Сверка агрегатов строк с документом (без документных скидок). Ставит флаги в doc."""
#     doc_wo   = d(doc.get("amount_wo_vat"), 4)
#     doc_vat  = d(doc.get("vat_amount"), 4)
#     doc_with = d(doc.get("amount_with_vat"), 4)
#     separate_vat = bool(doc.get("separate_vat"))
#     inv_wo = d(doc.get("invoice_discount_wo_vat"), 4)
#     inv_w  = d(doc.get("invoice_discount_with_vat"), 4)

#     # Сравнения с учётом документных скидок (если они > 0)
#     adj_sum_wo   = Q4(sum_wo   - inv_wo) if inv_wo != 0 else sum_wo
#     adj_sum_with = Q4(sum_with - inv_w ) if inv_w  != 0 else sum_with
#     adj_sum_vat  = Q4(sum_vat  - (inv_w - inv_wo)) if (inv_w != 0 or inv_wo != 0) else sum_vat


#     # Базовые проверки
#     doc["_lines_sum_matches_wo"]   = bool(_approx(adj_sum_wo,   doc_wo))
#     doc["_lines_sum_matches_with"] = bool(_approx(adj_sum_with, doc_with))
#     doc["_lines_sum_matches_vat"]  = bool(_approx(adj_sum_vat,  doc_vat)) if not separate_vat else None

#     # Дополнительно: wo+vat == with (агрегатно), только как sanity
#     doc["_lines_core_wo_plus_vat_eq_with"] = bool(_approx(Q4(sum_wo + sum_vat), sum_with))

#     # Итог
#     if separate_vat:
#         ok = bool(doc["_lines_sum_matches_wo"]) and bool(doc["_lines_sum_matches_with"])
#     else:
#         ok = bool(doc["_lines_sum_matches_wo"]) and bool(doc["_lines_sum_matches_vat"]) and bool(doc["_lines_sum_matches_with"])

#     doc["ar_sutapo"] = bool(ok)
#     append_log(doc, f"lines aggregate: sum_wo={sum_wo}, sum_vat={sum_vat}, sum_with={sum_with}")
#     append_log(doc, f"lines vs doc: wo={doc['_lines_sum_matches_wo']}, vat={doc.get('_lines_sum_matches_vat')}, with={doc['_lines_sum_matches_with']}, core={doc['_lines_core_wo_plus_vat_eq_with']}, ar_sutapo={doc['ar_sutapo']}")
#     return doc


def _try_single_pass_reconciliation(doc: Dict[str, Any]) -> None:
    """
    Одношаговая попытка улучшить совпадение: для строк с единственной скидкой with/wo пробуем swap
    и оставляем изменение, если оно уменьшает суммарное несоответствие к документу.
    """
    items = doc.get("line_items") or []
    if not items:
        return

    def aggregates_distance(a_wo, a_vat, a_with, doc_wo, doc_vat, doc_with, separate_vat):
        # L1-норма по доступным якорям
        dist = (a_wo - doc_wo).copy_abs() + (a_with - doc_with).copy_abs()
        if not separate_vat:
            dist += (a_vat - doc_vat).copy_abs()
        return dist

    separate_vat = bool(doc.get("separate_vat"))
    doc_wo   = d(doc.get("amount_wo_vat"), 2)      # ← 2 знака (денежная сумма)
    doc_vat  = d(doc.get("vat_amount"), 2)         # ← 2 знака
    doc_with = d(doc.get("amount_with_vat"), 2)    # ← 2 знака

    base_wo, base_vat, base_with = _aggregate_lines(doc)  # ← уже возвращает Q2
    base_dist = aggregates_distance(base_wo, base_vat, base_with, doc_wo, doc_vat, doc_with, separate_vat)

    improved = False

    for li in items:
        vp_eff = _li_get_vp(li, doc)

        # кандидаты для swap: есть только один вид скидки
        disc_wo   = d(li.get("discount_wo_vat"), 2)    # ← 2 знака (денежная сумма)
        disc_with = d(li.get("discount_with_vat"), 2)  # ← 2 знака

        only_with = (disc_with != 0 and disc_wo == 0)
        only_wo   = (disc_wo != 0 and disc_with == 0)

        if not (only_with or only_wo):
            continue

        # snapshot
        backup = {k: li.get(k) for k in ("discount_wo_vat", "discount_with_vat", "subtotal", "vat", "total", "_li_calc_log", "_moved_discount")}

        if only_with:
            # Попробуем переложить WITH -> WO
            li["discount_wo_vat"] = disc_with
            li["discount_with_vat"] = Decimal("0.00")  # ← 0.00 вместо 0.0000
            li["_moved_discount"] = "with→wo"
        else:
            # Попробуем переложить WO -> WITH
            li["discount_with_vat"] = disc_wo
            li["discount_wo_vat"] = Decimal("0.00")    # ← 0.00 вместо 0.0000
            li["_moved_discount"] = "wo→with"

        # пересчитать якоря строки
        _calc_line_anchors(li, vp_eff)

        # пересчитать агрегаты и дистанцию
        tmp_wo, tmp_vat, tmp_with = _aggregate_lines(doc)
        tmp_dist = aggregates_distance(tmp_wo, tmp_vat, tmp_with, doc_wo, doc_vat, doc_with, separate_vat)

        if tmp_dist < base_dist:
            append_log(doc, f"reconcile: improved by swapping discount in line (id={li.get('id','?')}): {backup.get('discount_wo_vat')}|{backup.get('discount_with_vat')} -> {li.get('discount_wo_vat')}|{li.get('discount_with_vat')}")
            base_dist = tmp_dist
            base_wo, base_vat, base_with = tmp_wo, tmp_vat, tmp_with
            improved = True
        else:
            # откатываем
            for k, v in backup.items():
                li[k] = v

    if improved:
        append_log(doc, "reconcile: aggregates improved after single-pass swap")
    else:
        append_log(doc, "reconcile: no improvement from single-pass swap")






def _try_zero_informational_line_discounts(doc: Dict[str, Any]) -> None:
    """
    Правила округления:
    - price, quantity: до 4 знаков
    - subtotal, vat, total, discount_wo_vat, discount_with_vat и суммы документа:
      при расчётах и сравнениях приводим к 2 знакам.

    Если Σ(subtotal) ≈ doc.amount_wo_vat (без учёта скидок строк),
    то скидки строк информационные → обнуляем их.

    КРИТЕРИИ ИНФОРМАЦИОННОЙ СКИДКИ:
    1) Q2(price*qty) ≈ subtotal
    2) Q2(price*qty) - discount_wo_vat ≈ subtotal

    После обнуления скидок пересчитываем price := Q4(subtotal/qty), чтобы Q2(price*qty)=subtotal.
    """
    items = doc.get("line_items") or []
    if not items:
        return

    # 1) Агрегаты БЕЗ учёта скидок строк (всё к 2 знакам!)
    sum_wo_raw   = _sum_decimals(d(li.get("subtotal"), 2) for li in items)
    sum_vat_raw  = _sum_decimals(d(li.get("vat"), 2)      for li in items)
    sum_with_raw = _sum_decimals(d(li.get("total"), 2)    for li in items)

    doc_wo   = d(doc.get("amount_wo_vat"),   2)
    doc_vat  = d(doc.get("vat_amount"),      2)
    doc_with = d(doc.get("amount_with_vat"), 2)
    separate_vat = bool(doc.get("separate_vat"))

    # Толеранс: 20 центов или 0.5% от суммы документа (2 знака)
    tol = max(Decimal("0.20"), Q2(doc_with * Decimal("0.005")))

    match_wo   = _approx(sum_wo_raw,   doc_wo,   tol=tol)
    match_vat  = _approx(sum_vat_raw,  doc_vat,  tol=tol) if not separate_vat else True
    match_with = _approx(sum_with_raw, doc_with, tol=tol)

    if not (match_wo and match_vat and match_with):
        return  # суммы не сходятся даже без скидок → выходим

    # 2) Подсчёт "информационных" скидок (все ден. значения к 2 знакам)
    informational_count = 0
    total_with_discounts = 0

    for li in items:
        disc_wo   = d(li.get("discount_wo_vat"),   2)
        disc_with = d(li.get("discount_with_vat"), 2)

        if disc_wo == 0 and disc_with == 0:
            continue

        total_with_discounts += 1

        price    = d(li.get("price"),    4)
        qty      = d(li.get("quantity"), 4)
        subtotal = d(li.get("subtotal"), 2)

        is_informational = False

        # ✅ Критерий 1: Q2(price*qty) ≈ subtotal
        if price != 0 and qty != 0:
            pq2 = Q2(price * qty)
            if _approx(pq2, subtotal, tol=Decimal("0.05")):  # 5 центов
                is_informational = True
                (li.setdefault("_li_calc_log", [])).append(
                    f"discount-check: Q2(price*qty) ≈ subtotal ({pq2}≈{subtotal}) → informational (case 1)"
                )

        # ✅ Критерий 2: Q2(price*qty) - discount_wo_vat ≈ subtotal
        if not is_informational and price != 0 and qty != 0 and disc_wo != 0:
            pq2 = Q2(price * qty)
            pq_minus_disc2 = Q2(pq2 - disc_wo)
            if _approx(pq_minus_disc2, subtotal, tol=Decimal("0.05")):
                is_informational = True
                (li.setdefault("_li_calc_log", [])).append(
                    f"discount-check: Q2(price*qty) - discount ≈ subtotal ({pq2} - {disc_wo} ≈ {subtotal}) → informational (case 2)"
                )

        # ✅ Критерий 3: уже помечено флагом _dup_discount_*
        if not is_informational and (li.get("_dup_discount_wo") or li.get("_dup_discount_with")):
            is_informational = True

        if is_informational:
            informational_count += 1

    # 3) Если нет строк со скидками — выходим
    if total_with_discounts == 0:
        return

    # 4) Если >75% строк со скидками — информационные → обнуляем ВСЕ (ден. поля в 2 знака)
    threshold = 0.75
    if informational_count / total_with_discounts >= threshold:
        zeroed_count = 0
        for li in items:
            disc_wo   = d(li.get("discount_wo_vat"),   2)
            disc_with = d(li.get("discount_with_vat"), 2)

            if disc_wo != 0 or disc_with != 0:
                li["discount_wo_vat"]   = Decimal("0.00")
                li["discount_with_vat"] = Decimal("0.00")
                (li.setdefault("_li_calc_log", [])).append(
                    f"global-cleanup: line discounts informational → zeroed (wo={disc_wo}, with={disc_with})"
                )
                zeroed_count += 1

        # ✅ Пересчитать price так, чтобы Q2(price*qty) == subtotal
        for li in items:
            qty = d(li.get("quantity"), 4)
            if qty == 0:
                continue

            subtotal2 = d(li.get("subtotal"), 2)
            price_old4 = d(li.get("price"), 4)
            price_new4 = Q4(subtotal2 / qty)  # price хранится/ведётся с 4 знаками

            pq_old2 = Q2(price_old4 * qty)
            if not _approx(pq_old2, subtotal2, tol=Decimal("0.02")):
                li["_orig_price"] = float(price_old4)
                li["price"] = price_new4
                li["_price_adjusted"] = True
                (li.setdefault("_li_calc_log", [])).append(
                    f"global-cleanup: recalc price from subtotal/qty ({price_old4} → {price_new4})"
                )

        append_log(
            doc,
            f"global-cleanup: zeroed informational line discounts in {zeroed_count} lines "
            f"({informational_count}/{total_with_discounts} matched criteria, >={threshold*100}% threshold)"
        )

        # Обновить режим скидок в документе
        doc["_effective_discount_mode"] = "none"
        doc["_effective_discount_values"]["line"]["wo"] = 0.0
        doc["_effective_discount_values"]["line"]["with"] = 0.0






def _final_math_validation(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Финальная проверка математических тождеств для строк и документа.
    Проверяет:
    1. price × quantity = subtotal (для каждой строки)
    2. subtotal + vat = total (для каждой строки)
    3. subtotal × vat_percent/100 = vat (для каждой строки)
    4. Σsubtotal = doc.amount_wo_vat
    5. Σvat = doc.vat_amount
    6. Σtotal = doc.amount_with_vat (С УЧЁТОМ ДОКУМЕНТНЫХ СКИДОК!)
    7. Ошибки округления
    """
    items = doc.get("line_items") or []
    separate_vat = bool(doc.get("separate_vat"))
    
    # ========== НАСТРОЙКА ТОЛЕРАНТНОСТИ ==========
    TOLERANCE = Decimal("0.02")
    
    validation_report = {
        "line_checks": [],
        "aggregate_checks": {},
        "rounding_errors": {},
        "summary": {}
    }
    
    line_errors = 0
    max_rounding_error = Decimal("0.0000")
    
    # ========== ПРОВЕРКА КАЖДОЙ СТРОКИ ==========
    for idx, li in enumerate(items):
        line_id = li.get("id") or li.get("line_id") or f"#{idx+1}"
        
        price = d(li.get("price"), 4)
        qty = d(li.get("quantity"), 4)
        subtotal = d(li.get("subtotal"), 2)
        vat = d(li.get("vat"), 2)
        vp = d(li.get("vat_percent"), 2)
        total = d(li.get("total"), 2)
        
        line_check = {
            "line_id": line_id,
            "checks": {},
            "errors": []
        }
        
        # CHECK 1: price × quantity = subtotal
        if price != 0 and qty != 0:
            pq = Q2(price * qty)
            delta_pq = Q2(pq - subtotal)
            match_pq = _approx(pq, subtotal, tol=TOLERANCE)
            
            line_check["checks"]["price_x_qty"] = {
                "expected": float(pq),
                "actual": float(subtotal),
                "delta": float(delta_pq),
                "match": match_pq
            }
            
            if not match_pq:
                line_check["errors"].append(
                    f"price×qty mismatch: {pq} ≠ {subtotal} (Δ={delta_pq})"
                )
                line_errors += 1
            
            if delta_pq.copy_abs() > max_rounding_error:
                max_rounding_error = delta_pq.copy_abs()
        
        # CHECK 2: subtotal + vat = total
        if subtotal != 0 or vat != 0:
            sum_sv = Q2(subtotal + vat)
            delta_sv = Q2(sum_sv - total)
            match_sv = _approx(sum_sv, total, tol=TOLERANCE)
            
            line_check["checks"]["subtotal_plus_vat"] = {
                "expected": float(sum_sv),
                "actual": float(total),
                "delta": float(delta_sv),
                "match": match_sv
            }
            
            if not match_sv:
                line_check["errors"].append(
                    f"subtotal+vat mismatch: {sum_sv} ≠ {total} (Δ={delta_sv})"
                )
                line_errors += 1
            
            if delta_sv.copy_abs() > max_rounding_error:
                max_rounding_error = delta_sv.copy_abs()
        
        # CHECK 3: subtotal × vat_percent/100 = vat
        if not separate_vat and subtotal != 0 and vp != 0:
            vat_calc = Q2(subtotal * vp / Decimal("100"))
            delta_vp = Q2(vat_calc - vat)
            match_vp = _approx(vat_calc, vat, tol=TOLERANCE)
            
            line_check["checks"]["vat_from_percent"] = {
                "expected": float(vat_calc),
                "actual": float(vat),
                "delta": float(delta_vp),
                "match": match_vp
            }
            
            if not match_vp:
                line_check["errors"].append(
                    f"vat % mismatch: {subtotal}×{vp}%={vat_calc} ≠ {vat} (Δ={delta_vp})"
                )
                line_errors += 1
            
            if delta_vp.copy_abs() > max_rounding_error:
                max_rounding_error = delta_vp.copy_abs()
        
        if line_check["errors"]:
            line_check["status"] = "FAIL"
        else:
            line_check["status"] = "PASS"
        
        validation_report["line_checks"].append(line_check)
    
    # ========== ПРОВЕРКА АГРЕГАТОВ С УЧЁТОМ ДОКУМЕНТНЫХ СКИДОК ==========
    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
    
    doc_wo = d(doc.get("amount_wo_vat"), 2)
    doc_vat = d(doc.get("vat_amount"), 2)
    doc_with = d(doc.get("amount_with_vat"), 2)
    
    # ✅ НОВОЕ: Получаем документные скидки
    inv_wo = d(doc.get("invoice_discount_wo_vat"), 2)
    inv_w  = d(doc.get("invoice_discount_with_vat"), 2)
    has_doc_discount = (inv_wo != 0 or inv_w != 0)

    # --- Определяем сценарии A/B по самим полям документа ---
    scenario_A_valid = (inv_wo != 0) and _approx(Q2(doc_wo - inv_wo + doc_vat), doc_with, tol=TOLERANCE)
    scenario_B_valid = (inv_w  != 0) and _approx(Q2(doc_wo + doc_vat), Q2(doc_with - inv_w), tol=TOLERANCE)

    # ===== CHECK 4: Σsubtotal vs doc.amount_wo_vat (discount-aware) =====
    expected_wo = doc_wo
    note_wo = "no doc-level discounts"
    if has_doc_discount:
        if scenario_A_valid:
            expected_wo = Q2(doc_wo + inv_wo)  # строки до скидки по нетто
            note_wo = f"doc-level WO discount ({inv_wo}): Σwo should be {expected_wo} (before discount)"
        elif scenario_B_valid:
            expected_wo = doc_wo  # при B нетто не меняется
            note_wo = f"doc-level WITH discount ({inv_w})"
        else:
            # если обе заданы/неясно — выберем ближний вариант
            cand_A = Q2(doc_wo + inv_wo)
            dist_A = (sum_wo - cand_A).copy_abs()
            dist_B = (sum_wo - doc_wo).copy_abs()
            if dist_A < dist_B:
                expected_wo = cand_A
                note_wo = f"picked WO discount by proximity ({inv_wo})"
    delta_wo = Q2(sum_wo - expected_wo)
    match_wo = _approx(sum_wo, expected_wo, tol=TOLERANCE)
    validation_report["aggregate_checks"]["sum_wo_vat"] = {
        "sum_lines": float(sum_wo),
        "doc_value": float(expected_wo),
        "delta": float(delta_wo),
        "match": match_wo,
        "status": "PASS" if match_wo else "FAIL",
        "note": note_wo,
    }

    # ===== CHECK 5: Σvat vs doc.vat_amount (discount-aware) =====
    if not separate_vat:
        # строки «до скидок»: Σvat должен равняться doc.vat + (with - wo)
        expected_vat = Q2(doc_vat + (inv_w - inv_wo)) if has_doc_discount else doc_vat
        delta_vat = Q2(sum_vat - expected_vat)
        match_vat = _approx(sum_vat, expected_vat, tol=TOLERANCE)
        validation_report["aggregate_checks"]["sum_vat"] = {
            "sum_lines": float(sum_vat),
            "doc_value": float(expected_vat),
            "delta": float(delta_vat),
            "match": match_vat,
            "status": "PASS" if match_vat else "FAIL",
            "note": "adjusted by (with - wo)" if has_doc_discount else "no doc-level discounts",
        }
    else:
        validation_report["aggregate_checks"]["sum_vat"] = {"status": "SKIP", "reason": "separate_vat=True"}

    # ===== CHECK 6: Σtotal vs doc.amount_with_vat (discount-aware) =====
    expected_with = doc_with
    note_with = "no doc-level discounts"
    if has_doc_discount:
        if scenario_A_valid:
            expected_with = Q2(doc_with + inv_wo)  # строки до скидки по нетто
            note_with = f"doc-level WO discount ({inv_wo}): Σwith should be {expected_with} (before discount)"
        elif scenario_B_valid:
            expected_with = Q2(doc_with + inv_w)   # строки до скидки по брутто
            note_with = f"doc-level WITH discount ({inv_w}): Σwith should be {expected_with} (before discount)"
        else:
            # неясно — выберем ближайший к линиям вариант
            cand_A = Q2(doc_with + inv_wo)
            cand_B = Q2(doc_with + inv_w)
            dist_A = (sum_with - cand_A).copy_abs()
            dist_B = (sum_with - cand_B).copy_abs()
            if dist_A <= dist_B:
                expected_with, note_with = cand_A, f"picked WO discount by proximity ({inv_wo})"
            else:
                expected_with, note_with = cand_B, f"picked WITH discount by proximity ({inv_w})"

    delta_with = Q2(sum_with - expected_with)
    match_with = _approx(sum_with, expected_with, tol=TOLERANCE)
    validation_report["aggregate_checks"]["sum_with_vat"] = {
        "sum_lines": float(sum_with),
        "doc_value": float(expected_with),
        "delta": float(delta_with),
        "match": match_with,
        "status": "PASS" if match_with else "FAIL",
        "note": note_with,
        "doc_discount_wo": float(inv_wo) if has_doc_discount else None,
        "doc_discount_with": float(inv_w) if has_doc_discount else None,
    }

    
    if delta_with.copy_abs() > max_rounding_error:
        max_rounding_error = delta_with.copy_abs()
    
    # ========== АНАЛИЗ ОКРУГЛЕНИЙ ==========
    validation_report["rounding_errors"] = {
        "max_error": float(max_rounding_error),
        "tolerance": float(TOLERANCE),
        "within_tolerance": bool(max_rounding_error <= TOLERANCE),
        "precision_ok": bool(max_rounding_error <= Decimal("0.01"))
    }
    
    # ========== ИТОГОВЫЙ СТАТУС ==========
    aggregate_pass = (
        validation_report["aggregate_checks"]["sum_wo_vat"]["status"] == "PASS" and
        validation_report["aggregate_checks"]["sum_with_vat"]["status"] == "PASS" and
        (separate_vat or validation_report["aggregate_checks"]["sum_vat"]["status"] == "PASS")
    )
    
    validation_report["summary"] = {
        "total_lines": len(items),
        "lines_with_errors": line_errors,
        "lines_pass": len(items) - line_errors,
        "aggregates_pass": aggregate_pass,
        "overall_status": "PASS" if (line_errors == 0 and aggregate_pass) else "FAIL"
    }
    
    # ========== СОХРАНЕНИЕ В ДОКУМЕНТ ==========
    doc["_final_math_validation"] = validation_report
    
    # ========== ЛОГИРОВАНИЕ ==========
    append_log(doc, "=" * 60)
    append_log(doc, "FINAL MATH VALIDATION")
    append_log(doc, "=" * 60)
    
    # Логи по строкам
    if line_errors > 0:
        append_log(doc, f"LINE ITEMS: {line_errors}/{len(items)} lines with errors")
        for lc in validation_report["line_checks"]:
            if lc["status"] == "FAIL":
                append_log(doc, f"  Line {lc['line_id']}: {'; '.join(lc['errors'])}")
    else:
        append_log(doc, f"LINE ITEMS: All {len(items)} lines PASS ✓")
    
    # Логи по агрегатам
    append_log(doc, "")
    append_log(doc, "AGGREGATES:")
    for key, check in validation_report["aggregate_checks"].items():
        if check.get("status") == "SKIP":
            append_log(doc, f"  {key}: SKIP ({check['reason']})")
        else:
            status_icon = "✓" if check["status"] == "PASS" else "✗"
            note_str = f" [{check.get('note', '')}]" if check.get("note") else ""
            append_log(
                doc,
                f"  {key}: {check['status']} {status_icon} "
                f"(Σ={check['sum_lines']:.4f}, doc={check['doc_value']:.4f}, Δ={check['delta']:.4f}){note_str}"
            )
    
    # Логи по округлениям
    append_log(doc, "")
    append_log(doc, "ROUNDING:")
    r = validation_report["rounding_errors"]
    append_log(doc, f"  Max error: {r['max_error']:.4f} (tolerance: {r['tolerance']:.4f})")
    if r["precision_ok"]:
        append_log(doc, "  Precision: EXCELLENT (≤0.01) ✓")
    elif r["within_tolerance"]:
        append_log(doc, f"  Precision: ACCEPTABLE (≤{r['tolerance']:.4f}) ✓")
    else:
        append_log(doc, f"  Precision: POOR (>{r['tolerance']:.4f}) ✗")
    
    # Итоговый статус
    append_log(doc, "")
    append_log(doc, "=" * 60)
    status = validation_report["summary"]["overall_status"]
    icon = "✅✅✅" if status == "PASS" else "❗❗❗"
    append_log(doc, f"OVERALL STATUS: {status} {icon}")
    append_log(doc, "=" * 60)
    
    return doc



def _final_math_validation_sumiskai(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Упрощённая финальная проверка для суммишкай-документов (без line_items).

    Проверяем:
      1) amount_wo_vat + vat_amount ≈ amount_with_vat  (TOLERANCE = 0.02)
      2) если separate_vat=False и vat_percent задан → 
         vat_amount ≈ amount_wo_vat * vat_percent / 100

    Пишем компактный FINAL MATH VALIDATION лог.
    """
    items = doc.get("line_items") or []
    # Если строки вдруг есть – не трогаем, эта функция только для sumiskai
    if items:
        return doc

    TOLERANCE = Decimal("0.02")
    separate_vat = bool(doc.get("separate_vat"))

    wo   = d(doc.get("amount_wo_vat"), 2)
    vat  = d(doc.get("vat_amount"), 2)
    w    = d(doc.get("amount_with_vat"), 2)
    vp   = d(doc.get("vat_percent"), 2)

    # --- CHECK 1: wo + vat ≈ with ---
    core_sum = Q2(wo + vat)
    diff_core = Q2(core_sum - w)
    doc_ok = _approx(core_sum, w, tol=TOLERANCE)

    # --- CHECK 2: vat_percent корректен? ---
    vat_ok = None
    diff_vp = Decimal("0.00")
    if not separate_vat and wo != 0 and vp != 0:
        vat_calc = Q2(wo * vp / Decimal("100"))
        diff_vp = Q2(vat_calc - vat)
        vat_ok = _approx(vat_calc, vat, tol=TOLERANCE)
    # если separate_vat=True или vp==0 — считаем "не проверяем"

    # --- ROUNDING / max_error ---
    candidates = [diff_core.copy_abs()]
    if vat_ok is not None:
        candidates.append(diff_vp.copy_abs())
    max_error = max(candidates) if candidates else Decimal("0.00")

    within_tolerance = (max_error <= TOLERANCE)
    overall_pass = bool(doc_ok and (separate_vat or vat_ok is None or vat_ok) and within_tolerance)

    # можно сохранить мини-отчёт, если хочешь где-то использовать
    doc["_final_math_validation_sumiskai"] = {
        "doc_core_ok": bool(doc_ok),
        "vat_percent_ok": (None if separate_vat else vat_ok),
        "separate_vat": separate_vat,
        "max_error": float(max_error),
        "tolerance": float(TOLERANCE),
        "overall_status": "PASS" if overall_pass else "FAIL",
    }

    # --- ЛОГИРОВАНИЕ в формате, который ты хочешь ---
    append_log(doc, "=" * 60)
    append_log(doc, "FINAL MATH VALIDATION")
    append_log(doc, "=" * 60)

    # doc-level check
    doc_status_icon = "✓" if doc_ok else "✗"
    append_log(
        doc,
        f"SUMISKAI DOC CHECK: {'PASS' if doc_ok else 'FAIL'} {doc_status_icon} "
        f"(wo+vat={core_sum:.2f}, with={w:.2f}, Δ={diff_core:.4f})"
    )

    append_log(doc, "")

    # VAT percent check
    if separate_vat:
        append_log(doc, "VAT PERCENT CHECK: SEPARATE VAT (skipped)")
    elif vat_ok is None:
        append_log(doc, "VAT PERCENT CHECK: NOT APPLICABLE (wo=0 or vp=0)")
    else:
        vp_status_icon = "✓" if vat_ok else "✗"
        append_log(
            doc,
            f"VAT PERCENT CHECK: {'PASS' if vat_ok else 'FAIL'} {vp_status_icon} "
            f"(wo={wo:.2f}, vp={vp:.2f}%, vat_calc={Q2(wo * vp / Decimal('100')):.2f}, "
            f"vat_doc={vat:.2f}, Δ={diff_vp:.4f})"
        )

    append_log(doc, "")
    append_log(doc, "ROUNDING:")
    append_log(
        doc,
        f"  Max error: {max_error:.4f} (tolerance: {TOLERANCE:.4f})"
    )

    append_log(doc, "")
    append_log(doc, "=" * 60)
    status = "PASS" if overall_pass else "FAIL"
    icon = "✅✅✅" if overall_pass else "❗❗❗"
    append_log(doc, f"OVERALL STATUS: {status} {icon}")
    append_log(doc, "=" * 60)

    return doc




def resolve_line_items(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Основной этап для line items.
    Требование: документ уже прошёл resolve_document_amounts.
    Документ НЕ МЕНЯЕМ. Исправляем только строки.
    """
    items = doc.get("line_items") or []
    if not items:
        append_log(doc, "lines: no items")
        sum_wo, sum_vat, sum_with = Decimal("0.0000"), Decimal("0.0000"), Decimal("0.0000")
        _check_against_doc(doc, sum_wo, sum_vat, sum_with)
        # ========== ФИНАЛЬНАЯ МАТЕМАТИЧЕСКАЯ ВАЛИДАЦИЯ (для sumiskai) ==========
        _final_math_validation_sumiskai(doc)
        return doc
    
    # 0) Пред-пасс: восстановить net/price из total при vp>0 и price≈total
    _prepass_fix_price_from_total(doc)

    # 1) Нормализация VAT% и расчёт каноники по каждой строке
    for idx, li in enumerate(items):
        if "subtotal" not in li and "amount_wo_vat" in li:
            li["subtotal"] = d(li.get("amount_wo_vat"), 2)
        if "total" not in li and "amount_with_vat" in li:
            li["total"] = d(li.get("amount_with_vat"), 2)

        vp_eff = _li_get_vp(li, doc)
        li["_calc_confidence"] = "low"
        _calc_line_anchors(li, vp_eff)

        # confidence
        price = d(li.get("price"), 4)
        qty   = d(li.get("quantity"), 4)
        subtotal_in = _coalesce_li_field(li, "subtotal", "amount_wo_vat", 2)
        total_in    = _coalesce_li_field(li, "total", "amount_with_vat", 2)
        if (price != 0 and qty != 0) or subtotal_in != 0 or total_in != 0:
            li["_calc_confidence"] = "medium" if (price == 0 or qty == 0) and subtotal_in == 0 and total_in != 0 else "high"

    # 2) Агрегация и первичная сверка
    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
    _check_against_doc(doc, sum_wo, sum_vat, sum_with)

    reconcile_lines_against_doc_basic_decision_tree(doc)

    _normalize_unit_price_from_net(doc)

    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
    _check_against_doc(doc, sum_wo, sum_vat, sum_with)

    # 2a) Глобальная починка: тоталы выглядят как нетто (Σwith≈Σwo), а VAT есть → total := net + vat
    if (not doc.get("ar_sutapo", False)
        and _approx(sum_with, sum_wo)
        and sum_vat != Decimal("0.0000")
        and _approx(Q4(d(doc.get("amount_wo_vat"),2) + d(doc.get("vat_amount"),2)), d(doc.get("amount_with_vat"),2))):
        for li in items:
            net = d(li.get("subtotal"), 2)
            vat = d(li.get("vat"), 2)
            tot = d(li.get("total"), 2)
            if _approx(tot, net) and vat != 0:
                li["total"] = Q4(net + vat)
                (li.setdefault("_li_calc_log", [])).append("fix(global): total looked net-like -> total := net + vat")
        # пересчитать агрегаты и флаги
        sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
        _check_against_doc(doc, sum_wo, sum_vat, sum_with)

    # 2b) Если Σsubtotal совпал с документом, а в строках есть скидки — они информационные, зануляем
    if doc.get("_lines_sum_matches_wo") and any(
        d(li.get("discount_wo_vat"),2) != 0 or d(li.get("discount_with_vat"),2) != 0
        for li in items
    ):
        for li in items:
            if d(li.get("discount_wo_vat"),2) != 0 or d(li.get("discount_with_vat"),2) != 0:
                li["discount_wo_vat"] = Decimal("0.00")
                li["discount_with_vat"] = Decimal("0.00")
                (li.setdefault("_li_calc_log", [])).append("fix(global): informational line discounts (Σsub==doc.wo) -> zeroed")
                # пересчёт total на net+vat
                net = d(li.get("subtotal"), 2)
                vp  = d(li.get("vat_percent"), 2)
                vat = d(li.get("vat"), 2)
                if vat == 0 and vp != 0 and net != 0:
                    vat = Q2(net * vp / Decimal("100"))
                    li["vat"] = vat
                li["total"] = Q2(net + vat)

        # пересчитать агрегаты и флаги
        sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
        _check_against_doc(doc, sum_wo, sum_vat, sum_with)
        append_log(doc, "reconcile: informational line discounts were zeroed (Σsub==doc.wo)")

    # 3) Если не сошлось — одношаговый swap...
    if not doc.get("ar_sutapo", False):
        _try_single_pass_reconciliation(doc)
        sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
        _check_against_doc(doc, sum_wo, sum_vat, sum_with)

    # 3a) СПЕРВА: попытка удалить «лишнюю» строку (заголовок/fee)
    if not doc.get("ar_sutapo", False):
        _try_drop_suspect_header_line(doc)
        sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
        _check_against_doc(doc, sum_wo, sum_vat, sum_with)

    # 3b) ПОТОМ: аккуратно восстановить document-level скидки из агрегатов строк
    if not doc.get("ar_sutapo", False):
        _reconcile_doc_discounts_from_line_sums(doc)
        sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
        _check_against_doc(doc, sum_wo, sum_vat, sum_with)
        # обновить финальные core/identity после смены скидок
        _final_checks(doc)    

    # 3c) удалить пустые строки (как раньше)
    _purge_zero_lines(doc)
    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
    _check_against_doc(doc, sum_wo, sum_vat, sum_with)

    # ✅ 3d) если после всех шагов дельт нет — документные скидки были «информационные» → зануляем
    _zero_out_informational_doc_discounts_if_unused(doc)
    sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
    _check_against_doc(doc, sum_wo, sum_vat, sum_with)


    # ✅ 3e) НОВОЕ: Глобальная проверка информационных скидок строк
    if not doc.get("ar_sutapo", False):
        _try_zero_informational_line_discounts(doc)
        sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
        _check_against_doc(doc, sum_wo, sum_vat, sum_with)


    # 3f) ========== ✨ НОВОЕ: Объединение негативных line items ==========
    _merge_negative_line_items(doc)



    # 4) Хинты
    items = doc.get("line_items") or []
    hints: List[str] = []
    if not doc.get("ar_sutapo", False):
        if not doc.get("_lines_sum_matches_wo", True):
            hints.append("DOC-LINES-NOT-MATCHING-WO: сумма нетто строк не совпадает с документом.")
        if (doc.get("_lines_sum_matches_vat") is False):
            hints.append("DOC-LINES-NOT-MATCHING-VAT: сумма НДС строк не совпадает с документом.")
        if not doc.get("_lines_sum_matches_with", True):
            hints.append("DOC-LINES-NOT-MATCHING-WITH: сумма брутто строк не совпадает с документом.")
    for li in items:
        if li.get("_dup_discount_wo"):
            hints.append(f"LI-PRICE-INCLUDES-DISCOUNT: строка id={li.get('id','?')} — discount_wo_vat продублирован.")
        if li.get("_dup_discount_with"):
            hints.append(f"LI-PRICE-INCLUDES-DISCOUNT: строка id={li.get('id','?')} — discount_with_vat продублирован.")
        if li.get("_conflict_zero_vat_discount"):
            hints.append(f"LI-ZERO-VAT-DISCOUNTS-MISMATCH: строка id={li.get('id','?')} — при vp=0 скидки wo/with различаются.")
        if li.get("_moved_discount"):
            hints.append(f"LI-DISCOUNT-FIELD-MISMATCH: строка id={li.get('id','?')} — скидка переставлена {li['_moved_discount']}.")
        if li.get("_price_mismatch"):
            hints.append(f"LI-PRICE-MISMATCH: строка id={li.get('id','?')} — subtotal не согласуется с price×qty (+/- скидки).")

    if hints:
        doc["_lines_structured_hints"] = hints
        append_log(doc, f"hints: {len(hints)} issues noted")


    # ========== ФИНАЛЬНАЯ МАТЕМАТИЧЕСКАЯ ВАЛИДАЦИЯ ==========
    _final_math_validation(doc)

    return doc












































































































































































# # # ------------------------------------------------------------------------------------------------------------------------
# # ==============================
# # Direction/PVM UI types (kept from original data_resolver)
# # ==============================

# DirectionCode = Optional[Literal["pirkimas", "pardavimas"]]
# ViewMode = Literal["single", "multi"]
# Purpose = Literal["preview", "export"]


# @dataclass(frozen=True)
# class ResolveContext:
#     """
#     Context for preview/export.
#     - view_mode: 'single' | 'multi'
#     - purpose: 'preview' | 'export'
#     - overrides: mapping of doc.id -> direction override
#     - cp_key: chosen counterparty key (for preview)
#     """
#     user: Any
#     view_mode: ViewMode
#     purpose: Purpose = "preview"
#     overrides: Dict[str, str] = None
#     cp_key: Optional[str] = None

#     def __post_init__(self):
#         object.__setattr__(self, "overrides", self.overrides or {})


# # ==============================
# # Small normalizers (kept)
# # ==============================

# def _nz(x: Any) -> Optional[str]:
#     if x is None:
#         return None
#     s = str(x).strip()
#     return s if s else None


# def _normalize_vat_percent(v: Any) -> Optional[float]:
#     if v is None:
#         return None
#     try:
#         if isinstance(v, Decimal):
#             return float(v)
#         s = str(v).strip().replace(",", ".")
#         if not s:
#             return None
#         if s.endswith("%"):
#             s = s[:-1]
#         return float(Decimal(s))
#     except Exception:
#         return None


# def _normalize_ps(v: Any) -> Optional[int]:
#     """Expect one of {1,2,3,4}; return None if invalid."""
#     if v is None:
#         return None
#     try:
#         i = int(str(v).strip())
#         return i if i in (1, 2, 3, 4) else None
#     except Exception:
#         return None


# def _ps_to_bin(ps: Optional[int]) -> Optional[int]:
#     """(1,3)->1 (preke); (2,4)->2 (paslauga)."""
#     if ps in (1, 3):
#         return 1
#     if ps in (2, 4):
#         return 2
#     return None


# def _mk_key(id_val: Any, vat_val: Any, name_val: Any) -> str:
#     id_s = "" if id_val is None else str(id_val).strip()
#     if id_s:
#         return f"id:{id_s}"
#     vat_s = (vat_val or "").strip().lower()
#     name_s = (name_val or "").strip().lower()
#     return vat_s or name_s


# def _pp_label(code: DirectionCode, cp_selected: bool) -> str:
#     if code == "pirkimas":
#         return "Pirkimas"
#     if code == "pardavimas":
#         return "Pardavimas"
#     return "Pasirinkite kontrahentą" if not cp_selected else ""


# def _pvm_label(code: Optional[str], cp_selected: bool) -> str:
#     if code:
#         return code
#     return "Pasirinkite kontrahentą" if not cp_selected else ""








# ##### Proverka i rasciot/popravka doc. polej

# # ---------- helpers ----------
# Q4 = lambda x: Decimal(str(x)).quantize(Decimal("1.0000"), rounding=ROUND_HALF_UP)
# Q2 = lambda x: Decimal(str(x)).quantize(Decimal("1.00"),   rounding=ROUND_HALF_UP)

# def d(x: Any, p: int = 4) -> Decimal:
#     if x is None or x == "" or str(x).lower() == "null":
#         return Decimal("0.0000") if p == 4 else Decimal("0.00")
#     try:
#         return Decimal(str(x)).quantize(Decimal("1." + "0"*p), rounding=ROUND_HALF_UP)
#     except Exception:
#         return Decimal("0.0000") if p == 4 else Decimal("0.00")

# def append_log(doc: Dict[str, Any], msg: str) -> None:
#     logs = doc.get("_global_validation_log") or []
#     logs.append(msg)
#     doc["_global_validation_log"] = logs

# def _approx(a: Decimal, b: Decimal, tol: Decimal = Decimal("0.02")) -> bool:
#     # 0.02 — денежная толерантность (2 евроцента)
#     return (a - b).copy_abs() <= tol





# # ==== Infer missing doc anchors from line items (safe defaults) ====

# def _canon_line_from_partial(li: Dict[str, Any]) -> None:
#     """
#     Аккуратно дополняем строку из частичных данных:
#       - если есть subtotal и total → vat := total - subtotal (>=0 с толерантностью)
#       - если есть только total → net := total; vat := 0; vp := 0
#       - если есть только subtotal → total := subtotal; vat := 0; vp := 0
#       - если есть vp и subtotal → vat := round(subtotal*vp/100); total := net+vat
#     Ничего не «ломает», только заполняет пропуски.
#     """
#     net = d(li.get("subtotal"), 4)
#     tot = d(li.get("total"), 4)
#     vat = d(li.get("vat"), 4)
#     vp  = d(li.get("vat_percent"), 2)

#     if net != 0 and tot != 0:
#         vat_calc = Q4(tot - net)
#         if vat == 0:
#             li["vat"] = vat_calc if vat_calc >= Decimal("0.00") else Decimal("0.0000")
#         li["total"] = Q4(tot)
#         li["subtotal"] = Q4(net)
#         if d(li.get("vat"),4) == 0 and vp != 0:
#             li["vat_percent"] = Decimal("0.00")
#         elif d(li.get("vat"),4) > 0 and net > 0 and vp == 0:
#             li["vat_percent"] = Q2(d(li.get("vat"),4) / net * Decimal("100"))

#     elif net == 0 and tot != 0:
#         li["subtotal"] = Q4(tot)
#         li["vat"] = Decimal("0.0000")
#         li["vat_percent"] = Decimal("0.00")

#     elif net != 0 and tot == 0:
#         li["total"] = Q4(net)
#         li["vat"] = Decimal("0.0000")
#         li["vat_percent"] = Decimal("0.00")

#     elif vp != 0 and net != 0:
#         li["vat"] = Q4(net * vp / Decimal("100"))
#         li["total"] = Q4(net + li["vat"])
#     # иначе — оставляем как есть (совсем пустая строка)


# def _infer_doc_from_lines_when_missing(doc: Dict[str, Any]) -> None:
#     """
#     Если у документа нет amount_wo_vat / vat_amount / amount_with_vat
#     и их нельзя получить из самих полей документа — пытаемся вывести из строк.
#     Для строк применяем _canon_line_from_partial (с безопасным фолбэком vat=0).
#     """
#     if bool(doc.get("separate_vat")):
#         return  # для раздельного НДС не склеиваем якоря

#     items = doc.get("line_items") or []
#     if not items:
#         return

#     # 1) мягкая канонизация строк
#     for li in items:
#         _canon_line_from_partial(li)

#     # 2) суммы по строкам
#     sum_net   = Q4(sum(d((li or {}).get("subtotal"), 4) for li in items))
#     sum_vat   = Q4(sum(d((li or {}).get("vat"), 4)      for li in items))
#     sum_gross = Q4(sum(d((li or {}).get("total"), 4)    for li in items))

#     # 3) реально отсутствующие поля дока
#     wo_missing  = ("amount_wo_vat"   not in doc) or (doc.get("amount_wo_vat")   is None)
#     vat_missing = ("vat_amount"      not in doc) or (doc.get("vat_amount")      is None)
#     w_missing   = ("amount_with_vat" not in doc) or (doc.get("amount_with_vat") is None)

#     changed = False

#     if w_missing:
#         doc["amount_with_vat"] = sum_gross; changed = True
#     if vat_missing:
#         doc["vat_amount"] = sum_vat; changed = True
#     if wo_missing:
#         # робастно к странным subtotal: wo := with - vat
#         doc["amount_wo_vat"] = Q4(doc.get("amount_with_vat", sum_gross) - doc.get("vat_amount", sum_vat))
#         changed = True

#     if changed:
#         append_log(doc, f"infer-doc: anchors inferred from lines → wo={doc['amount_wo_vat']}, vat={doc['vat_amount']}, with={doc['amount_with_vat']}")

#     # 4) попытаться вывести doc.vat_percent, если ставка единая по строкам
#     try:
#         vp_set = set()
#         for li in items:
#             vp = d(li.get("vat_percent"), 2)
#             if vp != 0:
#                 vp_set.add(vp)
#         if len(vp_set) == 1:
#             doc["vat_percent"] = next(iter(vp_set))
#         elif len(vp_set) == 0 and Q4(doc.get("vat_amount", Decimal("0"))) == Decimal("0.0000"):
#             doc["vat_percent"] = Decimal("0.00")
#     except Exception:
#         pass










# # ---------- единая стадия ----------
# def resolve_document_amounts(doc: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     ЕДИНАЯ функция для документа (line_items НЕ трогаем):
#       • детектит скидки (document/line/none) и пишет _effective_discount_*
#       • примиряет скидки и НДС (в т.ч. zero-VAT по схеме A)
#       • discount-aware досчитывает 4 якоря: amount_wo_vat, vat_amount, vat_percent, amount_with_vat
#       • выполняет финальные консистент-проверки и пишет *_check_* флаги
#     """
#     _infer_doc_from_lines_when_missing(doc)
#     # --- 0) детект режима скидок (только лог/флаги) ---
#     items = doc.get("line_items") or []
#     inv_wo = d(doc.get("invoice_discount_wo_vat"), 4)
#     inv_w  = d(doc.get("invoice_discount_with_vat"), 4)
#     line_wo  = sum(d((li or {}).get("discount_wo_vat"), 4)   for li in items)
#     line_w   = sum(d((li or {}).get("discount_with_vat"), 4) for li in items)
#     line_vat = sum(d((li or {}).get("vat"), 4)               for li in items)

#     if inv_wo > 0 or inv_w > 0:
#         mode = "document"
#     elif line_wo > 0 or line_w > 0:
#         mode = "line"
#     else:
#         mode = "none"

#     doc["_effective_discount_mode"] = mode
#     doc["_effective_discount_values"] = {
#         "document": {"wo": float(inv_wo), "with": float(inv_w), "vat": 0.0},
#         "line":     {"wo": float(line_wo), "with": float(line_w), "vat": float(line_vat)},
#     }
#     append_log(doc, f"discounts: mode={mode}, inv(wo={inv_wo}, with={inv_w}); line(wo={line_wo}, with={line_w})")

#     # --- 1) ранние варнинги ---
#     wo  = d(doc.get("amount_wo_vat"), 4)
#     w   = d(doc.get("amount_with_vat"), 4)
#     v   = d(doc.get("vat_amount"), 4)
#     vp  = d(doc.get("vat_percent"), 2)

#     append_log(doc, f"check#0 discounts: invoice_discount_wo_vat={inv_wo}, invoice_discount_with_vat={inv_w}")
#     if v < 0 or vp < 0:
#         append_log(doc, f"warn: negative VAT values (vat_amount={v}, vat_percent={vp})")
#     if inv_wo < 0 or inv_w < 0:
#         append_log(doc, f"warn: negative discounts (inv_wo={inv_wo}, inv_with={inv_w})")
#     if inv_wo > 0 and wo > 0 and inv_wo > wo:
#         append_log(doc, f"warn: invoice_discount_wo_vat({inv_wo}) > amount_wo_vat({wo})")
#     if inv_w > 0 and w > 0 and inv_w > w:
#         append_log(doc, f"warn: invoice_discount_with_vat({inv_w}) > amount_with_vat({w})")

#     # separate_vat → никаких скидочных эвристик, только якоря "как есть"
#     if bool(doc.get("separate_vat")):
#         append_log(doc, "skip: separate_vat=True → anchors only, no discount reconciliation")
#         return _calc_anchors_discount_aware(doc, allow_discount_from_with=False)

#     # --- 2) если без скидок уже wo+vat≈with → скидки информационные (обнулим) ---
#     if _approx(Q4(wo + v), w):
#         if inv_wo != 0 or inv_w != 0:
#             append_log(doc, "info: wo+vat≈with → document-level discounts treated as informational; zeroed")
#             doc["invoice_discount_wo_vat"] = Decimal("0.0000")
#             doc["invoice_discount_with_vat"] = Decimal("0.0000")
#             inv_wo, inv_w = Decimal("0.0000"), Decimal("0.0000")
#         return _final_checks(_calc_anchors_discount_aware(doc, allow_discount_from_with=False))

#     # --- 3) если есть скидки, а НДС неполон — безопасно досчитаем из wo ---
#     if (inv_wo != 0 or inv_w != 0):
#         if v == 0 and vp != 0 and wo != 0:
#             v = Q4(wo * vp / Decimal("100"))
#             doc["vat_amount"] = v
#             append_log(doc, f"calc: vat_amount := wo*vp = {v}")
#         elif vp == 0 and v != 0 and wo != 0:
#             vp = Q2(v / wo * Decimal("100"))
#             doc["vat_percent"] = vp
#             append_log(doc, f"calc: vat_percent := vat/wo*100 = {vp}")

#     # обновим локальные копии
#     wo  = d(doc.get("amount_wo_vat"), 4)
#     w   = d(doc.get("amount_with_vat"), 4)
#     v   = d(doc.get("vat_amount"), 4)
#     vp  = d(doc.get("vat_percent"), 2)
#     inv_wo = d(doc.get("invoice_discount_wo_vat"), 4)
#     inv_w  = d(doc.get("invoice_discount_with_vat"), 4)

#     v_eff = v  # 0 — ок

#     # --- 4) проверка расположения скидок (A, B) ---
#     coreA = _approx(Q4(wo - inv_wo + v_eff), w) if (inv_wo != 0 or v_eff != 0) else False
#     coreB = _approx(Q4(wo + v_eff), Q4(w - inv_w)) if (inv_w  != 0 or v_eff != 0) else False

#     # после расчёта coreA/coreB
#     if coreA is True and (v == 0 or v is None) and (vp == 0 or vp is None):
#         doc["vat_amount"]  = Decimal("0.0000")
#         doc["vat_percent"] = Decimal("0.00")
#         append_log(doc, "set: zero-VAT scenario confirmed by discounts (A) → vat=0, vp=0")

#     if coreB is True and (v == 0 or v is None) and (vp == 0 or vp is None):
#         doc["vat_amount"]  = Decimal("0.0000")
#         doc["vat_percent"] = Decimal("0.00")
#         append_log(doc, "set: zero-VAT scenario confirmed by discounts (B) → vat=0, vp=0")

#     if coreA or coreB:
#         append_log(doc, f"ok: discounts position consistent (A={coreA}, B={coreB})")
#         return _final_checks(_calc_anchors_discount_aware(doc, allow_discount_from_with=True))

#     # --- 5) попробуем «свап» скидок (если перепутали поля) ---
#     swapA = _approx(Q4(wo - inv_w + v_eff), w) if inv_w != 0 else None   # WITH → WO
#     swapB = _approx(Q4(wo + v_eff), Q4(w - inv_wo)) if inv_wo != 0 else None  # WO → WITH

#     moved = False
#     if swapA is True:
#         doc["invoice_discount_wo_vat"]   = Q4(inv_wo + inv_w)
#         doc["invoice_discount_with_vat"] = Decimal("0.0000")
#         moved = True
#         append_log(doc, "fix: moved discount_with_vat → discount_wo_vat (A')")

#     elif swapB is True:
#         doc["invoice_discount_with_vat"] = Q4(inv_w + inv_wo)
#         doc["invoice_discount_wo_vat"]   = Decimal("0.0000")
#         moved = True
#         append_log(doc, "fix: moved discount_wo_vat → discount_with_vat (B')")

#     if moved:
#         inv_wo2 = d(doc.get("invoice_discount_wo_vat"), 4)
#         inv_w2  = d(doc.get("invoice_discount_with_vat"), 4)
#         coreA2 = _approx(Q4(wo - inv_wo2 + v_eff), w)
#         coreB2 = _approx(Q4(wo + v_eff), Q4(w - inv_w2))
#         append_log(doc, f"recheck after move: A={coreA2}, B={coreB2}")

#     else:
#         append_log(doc, "warn: discounts position inconsistent; no move performed")

#     return _final_checks(_calc_anchors_discount_aware(doc, allow_discount_from_with=True))


# def _calc_anchors_discount_aware(doc: Dict[str, Any], *, allow_discount_from_with: bool) -> Dict[str, Any]:
#     """Досчёт 4 якорей с учётом скидок; with при скидках считаем из wo/vat/vp + скидки."""
#     log: List[str] = []

#     wo  = d(doc.get("amount_wo_vat"), 4)
#     v   = d(doc.get("vat_amount"), 4)
#     vp  = d(doc.get("vat_percent"), 2)
#     w   = d(doc.get("amount_with_vat"), 4)

#     inv_wo = d(doc.get("invoice_discount_wo_vat"), 4)
#     inv_w  = d(doc.get("invoice_discount_with_vat"), 4)
#     has_disc = (inv_wo != 0 or inv_w != 0)

#     pres = {"wo": wo != 0, "vat": v != 0, "vp": vp != 0, "with": w != 0}
#     ok_min = (sum(pres.values()) >= 2) and (pres["wo"] or pres["with"])
#     doc["_check_minimum_anchors_ok"] = bool(ok_min)
#     append_log(doc, f"_check_minimum_anchors_ok={ok_min}")

#     if not ok_min:
#         doc["_main_amounts_calc_log"] = log
#         return doc

#     # 1) wo — при скидках НЕ выводим из (with - vat) и (with/vp)
#     if wo == 0:
#         if not has_disc and w != 0 and v != 0:
#             wo = Q4(w - v); log.append("wo from with & vat (no-disc)")
#         elif not has_disc and w != 0 and vp != 0:
#             wo = Q4(w / (Decimal("1") + vp / Decimal("100"))); log.append("wo from with & vat% (no-disc)")

#     # 2) vat — при скидках НЕ выводим из (with - wo)
#     if v == 0:
#         if wo != 0 and vp != 0:
#             v = Q4(wo * vp / Decimal("100")); log.append("vat from wo & vat%")
#         elif not has_disc and w != 0 and wo != 0:
#             v = Q4(w - wo); log.append("vat from with & wo (no-disc)")

#     # 3) vp — при скидках НЕ выводим из (with & wo)
#     if vp == 0:
#         if wo != 0 and v != 0:
#             vp = Q2(v / wo * Decimal("100")); log.append("vat% from vat & wo")
#         elif not has_disc and w != 0 and wo != 0:
#             vp = Q2((w / wo - Decimal("1")) * Decimal("100")); log.append("vat% from with & wo (no-disc)")

#     # 4) with — при скидках учитываем скидки
#     if w == 0 and wo != 0:
#         v_eff = v if v != 0 else (Q4(wo * vp / Decimal("100")) if vp != 0 else Decimal("0.0000"))
#         if has_disc and allow_discount_from_with:
#             if inv_wo != 0:
#                 w = Q4(wo - inv_wo + v_eff); log.append("with from wo & vat & inv_disc_wo (disc-aware)")
#             elif inv_w != 0:
#                 w = Q4(wo + v_eff - inv_w);  log.append("with from wo & vat & inv_disc_with (disc-aware)")
#             else:
#                 w = Q4(wo + v_eff);          log.append("with from wo & vat (disc-aware, no explicit inv_disc)")
#         else:
#             if vp != 0:
#                 w = Q4(wo * (Decimal("1") + vp / Decimal("100"))); log.append("with from wo & vat%")
#             elif v != 0:
#                 w = Q4(wo + v); log.append("with from wo & vat")

#     # сохранить
#     doc["amount_wo_vat"]   = wo
#     doc["vat_amount"]      = v
#     doc["vat_percent"]     = vp
#     doc["amount_with_vat"] = w
#     doc["_main_amounts_calc_log"] = log
#     return doc


# def _final_checks(doc: Dict[str, Any]) -> Dict[str, Any]:
#     """Финальные консистент-проверки и флаги (только лог, без подмен)."""
#     wo = d(doc.get("amount_wo_vat"), 4)
#     v  = d(doc.get("vat_amount"), 4)
#     vp = d(doc.get("vat_percent"), 2)
#     w  = d(doc.get("amount_with_vat"), 4)

#     core1 = (Q4(wo + v) == w)
#     vat_from_rate = Q4(wo * vp / Decimal("100"))
#     core2 = (wo == 0 and v == 0 and vp == 0) or _approx(vat_from_rate, v)  # tol=0.02 по умолчанию
#     append_log(doc, f"core: wo+vat==with -> {core1}; vat≈wo*vp -> {core2} (vat_from_rate={vat_from_rate}, v={v})")

#     doc["_check_core_wo_plus_vat_eq_with"] = bool(core1)
#     doc["_check_core_vat_eq_wo_times_vp"]  = bool(core2)
#     append_log(doc, f"core: wo+vat==with -> {core1}; vat==wo*vp -> {core2}")

#     scenA = None
#     scenB = None
#     inv_wo = d(doc.get("invoice_discount_wo_vat"), 4)
#     inv_w  = d(doc.get("invoice_discount_with_vat"), 4)

#     if not core1:
#         scenA = (Q4(wo - inv_wo + v) == w) if inv_wo != 0 else None
#         scenB = (Q4(wo + v) == Q4(w - inv_w)) if inv_w != 0 else None
#         if scenA is not None:
#             append_log(doc, f"check: (wo - inv_disc_wo + vat == with) -> {scenA}")
#         if scenB is not None:
#             append_log(doc, f"check: (wo + vat == with - inv_disc_with) -> {scenB}")

#     ok = bool(core1 and core2) or bool(scenA) or bool(scenB)
#     doc["_doc_amounts_consistent"] = ok
#     append_log(doc, f"document consistency: {ok}")
#     return doc










# # ==============================
# # Direction resolution (kept from original)
# # ==============================

# def resolve_direction(doc: ScannedDocument, ctx: ResolveContext) -> DirectionCode:
#     if ctx.view_mode == "single":
#         raw = _nz(getattr(doc, "pirkimas_pardavimas", None))
#         if raw:
#             raw = raw.lower()
#         return raw if raw in ("pirkimas", "pardavimas") else None

#     ov = (ctx.overrides or {}).get(str(doc.pk))
#     if ov in ("pirkimas", "pardavimas"):
#         return ov

#     if ctx.cp_key:
#         s_key = _mk_key(doc.seller_id, doc.seller_vat_code, doc.seller_name)
#         b_key = _mk_key(doc.buyer_id,  doc.buyer_vat_code,  doc.buyer_name)
#         if ctx.cp_key == s_key:
#             return "pardavimas"
#         if ctx.cp_key == b_key:
#             return "pirkimas"
#         return None

#     has_buyer = any((_nz(doc.buyer_id), _nz(doc.buyer_vat_code), _nz(doc.buyer_name)))
#     has_seller = any((_nz(doc.seller_id), _nz(doc.seller_vat_code), _nz(doc.seller_name)))

#     if not has_buyer and not has_seller:
#         return None
#     if has_buyer and not has_seller:
#         return "pirkimas"
#     if has_seller and not has_buyer:
#         return "pardavimas"

#     user_code = _nz(getattr(ctx.user, "company_code", None))
#     user_vat  = _nz(getattr(ctx.user, "company_vat_code", None))
#     user_name = _nz(getattr(ctx.user, "company_name", None))

#     def _matches_user(prefix: str) -> bool:
#         pid  = _nz(getattr(doc, f"{prefix}_id", None))
#         pvat = _nz(getattr(doc, f"{prefix}_vat_code", None))
#         pname= _nz(getattr(doc, f"{prefix}_name", None))
#         return (
#             (user_code and pid  and user_code == pid) or
#             (user_vat  and pvat and user_vat.lower() == pvat.lower()) or
#             (user_name and pname and user_name.lower() == pname.lower())
#         )

#     if _matches_user("buyer"):
#         return "pirkimas"
#     if _matches_user("seller"):
#         return "pardavimas"
#     return None


# # ==============================
# # PVM computation (kept, with small export normalization)
# # ==============================

# class LineItemPreview(TypedDict, total=False):
#     id: int
#     pvm_kodas: Optional[str]
#     pvm_kodas_label: str


# class PvmResult(TypedDict, total=False):
#     pirkimas_pardavimas_code: DirectionCode
#     pirkimas_pardavimas_label: str
#     pvm_kodas: Optional[str]
#     pvm_kodas_label: str
#     line_items: List[LineItemPreview]


# def _need_geo(v: Optional[float]) -> bool:
#     return v == 0.0


# def _compute_pvm_detaliai_multi(
#     doc: ScannedDocument,
#     direction: DirectionCode,
#     cp_selected: bool,
#     base_vat_percent: Any,
#     base_preke_paslauga: Any,
# ) -> PvmResult:
#     buyer_iso  = _nz(doc.buyer_country_iso)
#     seller_iso = _nz(doc.seller_country_iso)
#     buyer_has_v  = bool(_nz(doc.buyer_vat_code))
#     seller_has_v = bool(_nz(doc.seller_vat_code))

#     li_qs = LineItem.objects.filter(document=doc).only("id", "vat_percent", "preke_paslauga")

#     li_preview: List[LineItemPreview] = []
#     pvm_set, vat_set = set(), set()

#     vat_doc = _normalize_vat_percent(base_vat_percent)
#     ps_doc  = _normalize_ps(base_preke_paslauga)
#     ps_doc_bin = _ps_to_bin(ps_doc)

#     for li in li_qs:
#         li_vat = _normalize_vat_percent(li.vat_percent if li.vat_percent is not None else base_vat_percent)
#         li_ps  = _normalize_ps(li.preke_paslauga if li.preke_paslauga is not None else ps_doc)
#         li_ps_bin = _ps_to_bin(li_ps)

#         if _need_geo(li_vat) and (direction is None or not (buyer_iso and seller_iso)):
#             li_code = None
#         else:
#             li_code = auto_select_pvm_code(
#                 pirkimas_pardavimas=direction,
#                 buyer_country_iso=buyer_iso,
#                 seller_country_iso=seller_iso,
#                 preke_paslauga=li_ps_bin,
#                 vat_percent=li_vat,
#                 separate_vat=bool(doc.separate_vat),
#                 buyer_has_vat_code=buyer_has_v,
#                 seller_has_vat_code=seller_has_v,
#             )

#         if li_code is not None:
#             pvm_set.add(li_code)
#         if li_vat is not None:
#             vat_set.add(li_vat)

#         li_preview.append({
#             "id": li.id,
#             "pvm_kodas": li_code,
#             "pvm_kodas_label": _pvm_label(li_code, cp_selected),
#         })

#     if bool(doc.separate_vat):
#         pvm_doc = "Keli skirtingi PVM"
#     else:
#         if len(pvm_set) == 1 and len(vat_set) == 1:
#             pvm_doc = next(iter(pvm_set))
#         elif len(pvm_set) == 0:
#             pvm_doc = None
#         else:
#             pvm_doc = ""

#     return PvmResult(
#         pirkimas_pardavimas_code=direction,
#         pirkimas_pardavimas_label=_pp_label(direction, cp_selected),
#         pvm_kodas=pvm_doc,
#         pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
#         line_items=li_preview,
#     )


# def _compute_pvm_sumiskai_multi(
#     doc: ScannedDocument,
#     direction: DirectionCode,
#     cp_selected: bool,
#     base_vat_percent: Any,
#     base_preke_paslauga: Any,
# ) -> PvmResult:
#     buyer_iso  = _nz(doc.buyer_country_iso)
#     seller_iso = _nz(doc.seller_country_iso)
#     buyer_has_v  = bool(_nz(doc.buyer_vat_code))
#     seller_has_v = bool(_nz(doc.seller_vat_code))

#     vat_doc = _normalize_vat_percent(base_vat_percent)
#     ps_doc  = _normalize_ps(base_preke_paslauga)
#     ps_bin  = _ps_to_bin(ps_doc)

#     if _need_geo(vat_doc) and (direction is None or not (buyer_iso and seller_iso)):
#         pvm_doc = None
#     else:
#         pvm_doc = auto_select_pvm_code(
#             pirkimas_pardavimas=direction,
#             buyer_country_iso=buyer_iso,
#             seller_country_iso=seller_iso,
#             preke_paslauga=ps_bin,
#             vat_percent=vat_doc,
#             separate_vat=bool(doc.separate_vat),
#             buyer_has_vat_code=buyer_has_v,
#             seller_has_vat_code=seller_has_v,
#         )

#     return PvmResult(
#         pirkimas_pardavimas_code=direction,
#         pirkimas_pardavimas_label=_pp_label(direction, cp_selected),
#         pvm_kodas=pvm_doc,
#         pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
#         line_items=[],
#     )


# def compute_pvm(
#     doc: ScannedDocument,
#     ctx: ResolveContext,
#     *,
#     base_vat_percent: Any,
#     base_preke_paslauga: Any,
#     cp_selected: bool,
# ) -> PvmResult:
#     direction = resolve_direction(doc, ctx)

#     if ctx.view_mode == "single":
#         pvm_doc = _nz(getattr(doc, "pvm_kodas", None))
#         if ctx.purpose == "export":
#             has_lineitems = LineItem.objects.filter(document=doc).exists()
#             pvm_doc = normalize_for_purpose(pvm_doc, has_lineitems=has_lineitems, purpose=ctx.purpose)

#         return PvmResult(
#             pirkimas_pardavimas_code=_nz(getattr(doc, "pirkimas_pardavimas", None)),
#             pirkimas_pardavimas_label=_pp_label(_nz(getattr(doc, "pirkimas_pardavimas", None)), cp_selected),
#             pvm_kodas=pvm_doc,
#             pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
#             line_items=[],
#         )

#     scan_type = (_nz(getattr(doc, "scan_type", None)) or "").lower()
#     if scan_type == "detaliai" and LineItem.objects.filter(document=doc).exists():
#         result = _compute_pvm_detaliai_multi(
#             doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
#         )
#     else:
#         result = _compute_pvm_sumiskai_multi(
#             doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
#         )

#     has_lineitems = bool(result.get("line_items"))
#     result["pvm_kodas"] = normalize_for_purpose(
#         result.get("pvm_kodas"), has_lineitems=has_lineitems, purpose=ctx.purpose
#     )
#     result["pvm_kodas_label"] = _pvm_label(result.get("pvm_kodas"), cp_selected)

#     if ctx.purpose == "preview" and not cp_selected:
#         result["pvm_kodas"] = None
#         result["pvm_kodas_label"] = "Pasirinkite kontrahentą"
#         if result.get("line_items"):
#             li = []
#             for item in result["line_items"]:
#                 li.append({
#                     "id": item.get("id"),
#                     "pvm_kodas": None,
#                     "pvm_kodas_label": "Pasirinkite kontrahentą",
#                 })
#             result["line_items"] = li

#     return result


# def normalize_for_purpose(
#     pvm_doc: Optional[str], *, has_lineitems: bool, purpose: Purpose
# ) -> Optional[str]:
#     if purpose == "export" and (not has_lineitems) and pvm_doc == "Keli skirtingi PVM":
#         return ""
#     return pvm_doc


# # ==============================
# # Facades for views/exports (kept)
# # ==============================

# def build_preview(
#     doc: ScannedDocument,
#     user: Any,
#     *,
#     cp_key: Optional[str],
#     view_mode: ViewMode,
#     base_vat_percent: Any,
#     base_preke_paslauga: Any,
# ) -> PvmResult:
#     ctx = ResolveContext(
#         user=user,
#         view_mode=view_mode,
#         purpose="preview",
#         overrides={},
#         cp_key=cp_key,
#     )
#     cp_selected = bool(cp_key)
#     return compute_pvm(
#         doc,
#         ctx,
#         base_vat_percent=base_vat_percent,
#         base_preke_paslauga=base_preke_paslauga,
#         cp_selected=cp_selected,
#     )


# class ExportResolvedDoc(TypedDict, total=False):
#     doc: ScannedDocument
#     direction: DirectionCode
#     pvm_kodas: Optional[str]
#     line_items: List[LineItemPreview]


# class ExportPrepared(TypedDict, total=False):
#     pirkimai: List[ExportResolvedDoc]
#     pardavimai: List[ExportResolvedDoc]
#     unknown: List[ExportResolvedDoc]


# def prepare_export_groups(
#     documents: Iterable[ScannedDocument],
#     *,
#     user: Any,
#     overrides: Dict[str, str] | None,
#     view_mode: ViewMode = "multi",
#     base_vat_percent_getter=None,
#     base_preke_paslauga_getter=None,
# ) -> ExportPrepared:
#     ctx = ResolveContext(
#         user=user,
#         view_mode=view_mode,
#         purpose="export",
#         overrides=overrides or {},
#         cp_key=None,
#     )

#     def _get_base(doc: ScannedDocument) -> Tuple[Any, Any]:
#         vat = base_vat_percent_getter(doc) if base_vat_percent_getter else getattr(doc, "vat_percent", None)
#         ps  = base_preke_paslauga_getter(doc) if base_preke_paslauga_getter else getattr(doc, "preke_paslauga", None)
#         return vat, ps

#     out: ExportPrepared = {"pirkimai": [], "pardavimai": [], "unknown": []}

#     for doc in documents:
#         base_vat, base_ps = _get_base(doc)
#         res = compute_pvm(
#             doc,
#             ctx,
#             base_vat_percent=base_vat,
#             base_preke_paslauga=base_ps,
#             cp_selected=False,
#         )
#         pack: ExportResolvedDoc = {
#             "doc": doc,
#             "direction": res.get("pirkimas_pardavimas_code"),
#             "pvm_kodas": res.get("pvm_kodas"),
#             "line_items": res.get("line_items") or [],
#         }
#         if pack["direction"] == "pirkimas":
#             out["pirkimai"].append(pack)
#         elif pack["direction"] == "pardavimas":
#             out["pardavimai"].append(pack)
#         else:
#             out["unknown"].append(pack)

#     return out


























# # =========================================================
# # Line Items Resolution
# # =========================================================

# # Ожидается, что в модуле уже есть:
# # - функции d(x, p), Q4, Q2, _approx, append_log

# def _li_get_vp(li: Dict[str, Any], doc: Dict[str, Any]) -> Decimal:
#     """Выбираем VAT% позиции: если separate_vat=False — наследуем из документа при необходимости."""
#     separate_vat = bool(doc.get("separate_vat"))
#     vp_li = d(li.get("vat_percent"), 2)
#     if separate_vat:
#         return vp_li  # в разрыве: допускаем нули, агрегаты сверим снизу
#     # иначе берём из документа, если в строке нет
#     if vp_li == 0:
#         vp_doc = d(doc.get("vat_percent"), 2)
#         if vp_doc != 0:
#             li["_used_doc_vat_percent"] = float(vp_doc)
#         return vp_doc
#     return vp_li


# def _coalesce_li_field(li: Dict[str, Any], key_main: str, key_alt: str, p: int = 4) -> Decimal:
#     """Берём основное поле (например 'subtotal'), при его отсутствии пробуем альтернативу ('amount_wo_vat')."""
#     val = li.get(key_main, None)
#     if val is None:
#         val = li.get(key_alt, None)
#     return d(val, p)


# def _detect_line_discount_mode(li: Dict[str, Any], vp_eff: Decimal) -> Tuple[Decimal, Decimal, Dict[str, Any]]:
#     """
#     Эвристики «цена уже со скидкой» и конфликтов скидок.
#     Возвращает (eff_disc_wo, eff_disc_with, flags)
#     """
#     flags: Dict[str, Any] = {}

#     price = d(li.get("price"), 4)
#     qty   = d(li.get("quantity"), 4)
#     pq    = Q4(price * qty) if (price != 0 and qty != 0) else Decimal("0.0000")

#     subtotal_in = _coalesce_li_field(li, "subtotal", "amount_wo_vat", 4)
#     total_in    = _coalesce_li_field(li, "total", "amount_with_vat", 4)

#     disc_wo   = d(li.get("discount_wo_vat"), 4)
#     disc_with = d(li.get("discount_with_vat"), 4)

#     eff_wo   = disc_wo
#     eff_with = disc_with

#     # 1) дубликат скидки без НДС (цена уже со скидкой нетто)
#     if pq != 0 and subtotal_in != 0 and disc_wo != 0:
#         if _approx(pq, subtotal_in):
#             flags["_dup_discount_wo"] = True
#             eff_wo = Decimal("0.0000")

#     # 2) дубликат скидки с НДС (цена уже со скидкой брутто)
#     if pq != 0 and total_in != 0 and disc_with != 0:
#         if vp_eff != 0:
#             gross0 = Q4(pq * (Decimal("1") + vp_eff / Decimal("100")))
#             if _approx(gross0, total_in):
#                 flags["_dup_discount_with"] = True
#                 eff_with = Decimal("0.0000")

#     # 3) при vp=0 обе суммы скидок должны совпадать (если обе заданы)
#     if vp_eff == 0 and disc_wo != 0 and disc_with != 0:
#         if not _approx(disc_wo, disc_with, tol=Decimal("0.01")):
#             flags["_conflict_zero_vat_discount"] = True
#             # Предпочитаем net-скидку
#             eff_with = Decimal("0.0000")

#     return eff_wo, eff_with, flags


# def _reconcile_li_subtotal(li: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Правила пользователя для subtotal:
#       1) price*qty ?= subtotal
#       2) price*qty - discount_wo_vat ?= subtotal
#       3) price*qty - discount_with_vat ?= subtotal  → перенос WITH → WO
#       4) если subtotal пуст, пытаемся вывести из pq или pq-disc_wo
#       5) иначе помечаем несостыковку (_price_mismatch)
#     """
#     price = d(li.get("price"), 4)
#     qty   = d(li.get("quantity"), 4)
#     pq    = Q4(price * qty) if (price != 0 and qty != 0) else Decimal("0.0000")

#     subtotal_in = _coalesce_li_field(li, "subtotal", "amount_wo_vat", 4)
#     disc_wo   = d(li.get("discount_wo_vat"), 4)
#     disc_with = d(li.get("discount_with_vat"), 4)

#     if pq == 0:
#         return li  # нечего сверять

#     # 1) price*qty == subtotal ?
#     if subtotal_in != 0 and _approx(pq, subtotal_in):
#         li["_subtotal_rule"] = "pq"
#         return li

#     # 2) price*qty - discount_wo_vat == subtotal ?
#     if disc_wo != 0 and subtotal_in != 0 and _approx(Q4(pq - disc_wo), subtotal_in):
#         li["_subtotal_rule"] = "pq-disc_wo"
#         return li

#     # 3) price*qty - discount_with_vat == subtotal ? → перенос WITH → WO
#     if disc_with != 0 and subtotal_in != 0 and _approx(Q4(pq - disc_with), subtotal_in):
#         li["_subtotal_rule"] = "pq-disc_with→wo"
#         li["discount_wo_vat"] = Q4(disc_wo + disc_with)
#         li["discount_with_vat"] = Decimal("0.0000")
#         li["_moved_discount"] = "with→wo"
#         return li

#     # 4) Если subtotal не задан — выводим из pq (с учётом disc_wo)
#     if subtotal_in == 0:
#         guess = Q4(pq - disc_wo) if disc_wo != 0 else pq
#         li["subtotal"] = guess
#         li["_subtotal_rule"] = "derived"
#         return li

#     # 5) Ничего не сошлось — помечаем
#     li["_price_mismatch"] = True
#     li["_subtotal_rule"] = "as-is-mismatch"
#     return li


# def _calc_line_anchors(li: Dict[str, Any], vp_eff: Decimal) -> Dict[str, Any]:
#     """
#     Считает канонические поля строки:
#       li["subtotal"], li["vat"], li["vat_percent"], li["total"]
#     Учитывает скидки и эвристики «цена уже со скидкой».
#     Складывает детали в li["_li_calc_log"].
#     """
#     log: List[str] = []

#     price = d(li.get("price"), 4)
#     qty   = d(li.get("quantity"), 4)
#     pq    = Q4(price * qty) if (price != 0 and qty != 0) else Decimal("0.0000")

#     # входные представления
#     subtotal_in = _coalesce_li_field(li, "subtotal", "amount_wo_vat", 4)
#     vat_in      = d(li.get("vat"), 4)
#     total_in    = _coalesce_li_field(li, "total", "amount_with_vat", 4)

#     # ✅ сначала приводим subtotal по правилам пользователя
#     _reconcile_li_subtotal(li)
#     subtotal_in = _coalesce_li_field(li, "subtotal", "amount_wo_vat", 4)

#     # детект и нормализация скидок
#     eff_disc_wo, eff_disc_with, flags = _detect_line_discount_mode(li, vp_eff)
#     li.update(flags)

#     # --- каноника ---
#     net  = Decimal("0.0000")
#     vat  = Decimal("0.0000")
#     gross = Decimal("0.0000")

#     # 1) нетто (до НДС), скидка по нетто уже учтена в subtotal_rule при необходимости
#     if subtotal_in != 0:
#         net = subtotal_in
#         log.append("net := provided/derived subtotal")
#     elif pq != 0:
#         net = pq
#         log.append("net := price * quantity")

#     # 2) VAT
#     if vat_in != 0:
#         vat = vat_in
#         log.append("vat := provided")
#     else:
#         if vp_eff != 0 and net != 0:
#             vat = Q4(net * vp_eff / Decimal("100"))
#             log.append("vat := net * vp/100")
#         else:
#             vat = Decimal("0.0000")
#             log.append("vat := 0 (vp=0 or net=0)")

#     # 3) Gross (total), учитывая скидку по брутто
#     if total_in != 0:
#         gross = total_in
#         log.append("gross := provided total/amount_with_vat")

#         # total выглядит как нетто, а VAT>0 и disc_with=0 → поправим на net+vat
#         if _approx(gross, net) and vat != 0 and eff_disc_with == 0:
#             gross = Q4(net + vat)
#             log.append("fix: provided total looked net-like -> total := net + vat")

#         # total уже ~ net+vat, но discount_with_vat > 0 → скидка по брутто информ., зануляем
#         if _approx(gross, Q4(net + vat)) and eff_disc_with != 0:
#             li["_dup_discount_with"] = True
#             li["discount_with_vat"] = Decimal("0.0000")
#             log.append("fix: discount_with_vat looked informational -> zeroed")
#     else:
#         # считаем total сами: net + vat - discount_with_vat
#         gross = Q4(net + vat)
#         if eff_disc_with != 0:
#             gross = Q4(gross - eff_disc_with)
#             log.append("gross := net + vat - discount_with_vat")
#         else:
#             log.append("gross := net + vat")

#     # 4) сохранить
#     li["vat_percent"] = vp_eff
#     li["subtotal"]    = net
#     li["vat"]         = vat
#     li["total"]       = gross
#     li["_li_calc_log"] = (li.get("_li_calc_log") or []) + log
#     return li






# # ==============================
# # Decision-tree reconcile vs document (basic)
# # ==============================
# def _sum_decimals(vals):
#     s = Decimal("0.0000")
#     for v in vals:
#         s += d(v, 4)
#     return Q4(s)

# def _recompute_from_net(li: Dict[str, Any], *, keep_total_if_given: bool = True) -> None:
#     """Пересчитать VAT/total от li['subtotal'] и li['vat_percent'] (или li['vat'] если нет ставки)."""
#     net = d(li.get("subtotal"), 4)
#     vp  = d(li.get("vat_percent"), 2)
#     vat = d(li.get("vat"), 4)
#     tot_in = d(li.get("total"), 4)

#     if vp != 0 and net != 0:
#         vat = Q4(net * vp / Decimal("100"))
#     # иначе, если ставки нет, оставляем имеющийся vat (или 0)
#     li["vat"] = vat

#     # total = net + vat (если total не был явно задан или явно просим пересчитать)
#     if not keep_total_if_given or tot_in == 0:
#         li["total"] = Q4(net + vat)

# def _recompute_from_total_and_vat(li: Dict[str, Any]) -> None:
#     """Нетто из total - vat (скидки уже учтены)."""
#     tot = d(li.get("total"), 4)
#     vat = d(li.get("vat"), 4)
#     li["subtotal"] = Q4(tot - vat)
#     # VAT уже задан; total уже задан
#     # vat_percent оставляем как есть, если есть ставка — не трогаем
#     # при необходимости можно вычислить ставку из net/vat (но не делаем это тут)

# def reconcile_lines_against_doc_basic_decision_tree(doc: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Реализует укороченный decision-tree:
#       (1) Σsubtotal ?= doc.wo → скидки инфо → занулить
#       (2) Σ(subtotal - disc_wo) ?= doc.wo → скидки по нетто валидны → оставить
#       (3) Σ(subtotal - disc_with) ?= doc.wo → поля скидок перепутаны → with→wo
#       (4) Σ(total - vat) ?= doc.wo → нетто из total-vat (скидки инфо)
#     При совпадении сценария — приводит строки к канонике и добавляет диагностический лог.
#     """
#     items = doc.get("line_items") or []
#     if not items:
#         return doc

#     # Документные якоря
#     doc_wo   = d(doc.get("amount_wo_vat"), 4)
#     doc_vat  = d(doc.get("vat_amount"), 4)
#     doc_with = d(doc.get("amount_with_vat"), 4)

#     # Предварительные суммы по текущим данным
#     sum_subtotal  = _sum_decimals(li.get("subtotal") for li in items)
#     sum_disc_wo   = _sum_decimals(li.get("discount_wo_vat") for li in items)
#     sum_disc_with = _sum_decimals(li.get("discount_with_vat") for li in items)
#     sum_total     = _sum_decimals(li.get("total") for li in items)
#     sum_vat       = _sum_decimals(li.get("vat") for li in items)

#     # ---- (1) Σsubtotal ?= doc.amount_wo_vat  → line-скидки информационные
#     if _approx(sum_subtotal, doc_wo):
#         for li in items:
#             if d(li.get("discount_wo_vat"), 4) != 0 or d(li.get("discount_with_vat"), 4) != 0:
#                 li["discount_wo_vat"] = Decimal("0.0000")
#                 li["discount_with_vat"] = Decimal("0.0000")
#                 (li.setdefault("_li_calc_log", [])).append(
#                     "decision#1: subtotal matches doc.net → line discounts are informational → zeroed"
#                 )
#             # гарантируем total = net + vat
#             _recompute_from_net(li, keep_total_if_given=False)

#         append_log(doc, "decision#1 selected: Σsubtotal ≈ doc.amount_wo_vat → zero line discounts")
#         # обновим флаги сверкой ниже в основном пайплайне
#         return doc

#     # ---- (2) Σ(subtotal - disc_wo) ?= doc.amount_wo_vat  → скидки по нетто валидны
#     sum_net_2 = Q4(sum_subtotal - sum_disc_wo)
#     if _approx(sum_net_2, doc_wo):
#         for li in items:
#             disc_wo   = d(li.get("discount_wo_vat"), 4)
#             disc_with = d(li.get("discount_with_vat"), 4)

#             # net := subtotal - discount_wo_vat
#             if disc_wo != 0:
#                 li["subtotal"] = Q4(d(li.get("subtotal"), 4) - disc_wo)
#                 (li.setdefault("_li_calc_log", [])).append(
#                     "decision#2: applied discount_wo_vat into net (subtotal := subtotal - disc_wo)"
#                 )
#                 li["discount_wo_vat"] = Decimal("0.0000")  # переносим в нетто
#             # скидка с НДС, если была, трактуем как инфо (не применяем дважды)
#             if disc_with != 0:
#                 li["discount_with_vat"] = Decimal("0.0000")
#                 (li.setdefault("_li_calc_log", [])).append(
#                     "decision#2: discount_with_vat treated informational → zeroed"
#                 )

#             _recompute_from_net(li, keep_total_if_given=False)

#         append_log(doc, "decision#2 selected: Σ(subtotal - disc_wo) ≈ doc.amount_wo_vat → WO discounts applied into net")
#         return doc

#     # ---- (3) Σ(subtotal - disc_with) ?= doc.amount_wo_vat → перепутаны поля скидок (with→wo)
#     sum_net_3 = Q4(sum_subtotal - sum_disc_with)
#     if _approx(sum_net_3, doc_wo):
#         for li in items:
#             disc_wo   = d(li.get("discount_wo_vat"), 4)
#             disc_with = d(li.get("discount_with_vat"), 4)

#             if disc_with != 0:
#                 # перенести WITH → WO и применить к нетто
#                 li["subtotal"] = Q4(d(li.get("subtotal"), 4) - disc_with)
#                 li["discount_wo_vat"] = Q4(disc_wo + disc_with)
#                 li["discount_with_vat"] = Decimal("0.0000")
#                 li["_moved_discount"] = "with→wo"
#                 (li.setdefault("_li_calc_log", [])).append(
#                     "decision#3: moved discount_with_vat → discount_wo_vat and applied into net"
#                 )

#             _recompute_from_net(li, keep_total_if_given=False)

#         append_log(doc, "decision#3 selected: Σ(subtotal - disc_with) ≈ doc.amount_wo_vat → moved WITH→WO and applied")
#         return doc

#     # ---- (4) Σ(total - vat) ?= doc.amount_wo_vat → нетто берём из total - vat (скидки инфо)
#     sum_net_4 = Q4(sum_total - sum_vat)
#     if _approx(sum_net_4, doc_wo):
#         for li in items:
#             # скидки считаем информационными
#             if d(li.get("discount_wo_vat"), 4) != 0 or d(li.get("discount_with_vat"), 4) != 0:
#                 li["discount_wo_vat"] = Decimal("0.0000")
#                 li["discount_with_vat"] = Decimal("0.0000")
#                 (li.setdefault("_li_calc_log", [])).append(
#                     "decision#4: net := total - vat → line discounts treated informational → zeroed"
#                 )
#             _recompute_from_total_and_vat(li)

#         append_log(doc, "decision#4 selected: Σ(total - vat) ≈ doc.amount_wo_vat → net from total - vat")
#         return doc

#     # ---- Если ничего не подошло — ничего не меняем, даём лог-наводку
#     append_log(
#         doc,
#         "decision: none matched (Σsubtotal, Σsub-disc_wo, Σsub-disc_with, Σ(total-vat) vs doc.net) → fallback to generic reconcile"
#     )
#     return doc




















# def _normalize_unit_price_from_net(doc: Dict[str, Any]) -> None:
#     items = doc.get("line_items") or []
#     for li in items:
#         qty = d(li.get("quantity"), 4)
#         if qty == 0:
#             continue
#         net = d(li.get("subtotal"), 4)
#         price = d(li.get("price"), 4)
#         # если price*qty не ≈ net → подгоняем unit price до net/qty
#         if not _approx(Q4(price * qty), net, tol=Decimal("0.02")):
#             li["_orig_price"] = float(price)
#             li["price"] = Q4(net / qty)
#             li["_price_adjusted"] = True
#             (li.setdefault("_li_calc_log", [])).append(
#                 "normalize-price: price := subtotal/quantity (list price looked pre-discount/informational)"
#             )


# def _aggregate_lines(doc: Dict[str, Any]) -> Tuple[Decimal, Decimal, Decimal]:
#     items = doc.get("line_items") or []
#     sum_wo   = Decimal("0.0000")
#     sum_vat  = Decimal("0.0000")
#     sum_with = Decimal("0.0000")
#     for li in items:
#         sum_wo   += d(li.get("subtotal"), 4)
#         sum_vat  += d(li.get("vat"), 4)
#         sum_with += d(li.get("total"), 4)
#     return Q4(sum_wo), Q4(sum_vat), Q4(sum_with)


# def _is_empty_line_strict(li: Dict[str, Any]) -> bool:
#     return (
#         d(li.get("price"), 4) == 0 and
#         d(li.get("subtotal"), 4) == 0 and
#         d(li.get("total"), 4) == 0
#     )

# def _purge_zero_lines(doc: Dict[str, Any]) -> None:
#     items = doc.get("line_items") or []
#     if not items:
#         return
#     kept, removed = [], 0
#     for li in items:
#         if _is_empty_line_strict(li):
#             removed += 1
#             (li.setdefault("_li_calc_log", [])).append(
#                 "removed: empty line (price=subtotal=total=0/None)"
#             )
#         else:
#             kept.append(li)
#     if removed:
#         doc["line_items"] = kept
#         append_log(doc, f"cleanup: removed {removed} empty line(s)")



# def _try_drop_suspect_header_line(doc: Dict[str, Any]) -> None:
#     """
#     Если суммы строк ПОСЛЕ всех базовых правок превышают документ —
#     ищем одиночную строку с total/subtotal ≈ дельте и удаляем её.
#     Приоритет: сравнение по total (если core совпадает), иначе по subtotal.
#     """
#     items = doc.get("line_items") or []
#     if not items:
#         return

#     separate_vat = bool(doc.get("separate_vat"))
#     sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
#     doc_wo   = d(doc.get("amount_wo_vat"), 4)
#     doc_vat  = d(doc.get("vat_amount"), 4)
#     doc_with = d(doc.get("amount_with_vat"), 4)

#     prefer_with = (
#         not separate_vat
#         and _approx(Q4(sum_wo + sum_vat), sum_with, tol=_TOL)
#         and _approx(Q4(doc_wo + doc_vat), doc_with, tol=_TOL)
#     )
#     if prefer_with:
#         delta = Q4(sum_with - doc_with)
#         key = "total"
#     else:
#         delta = Q4(sum_wo - doc_wo)
#         key = "subtotal"

#     if delta <= _TOL:
#         return  # нет положительной дельты → выходим

#     def _amount(li): return d(li.get(key), 4)

#     # Ищем одиночное совпадение по дельте
#     exact = [li for li in items if _approx(_amount(li), delta, tol=_TOL)]
#     if not exact:
#         return

#     # Предпочтение "fee-like" строкам
#     def _is_fee_like(li):
#         name = (li.get("product_name") or li.get("name") or "").lower()
#         return any(k in name for k in (
#             "transaction fee", "transaction fees", "processing fee",
#             "service fee", "adjustment", "balance", "header"
#         ))
#     exact.sort(key=lambda li: (not _is_fee_like(li), float(_amount(li))))
#     chosen = exact[0]

#     rid = chosen.get("id") or chosen.get("line_id") or "?"
#     chosen.setdefault("_li_calc_log", []).append(
#         f"removed: matched document delta ({key}≈{delta}) as header/fee"
#     )
#     doc["line_items"] = [li for li in items if li is not chosen]
#     append_log(doc, f"cleanup: removed suspect header line id={rid} (matched Δ={delta} by {key})")

#     # Пересчёт агрегатов и обновление флагов
#     sum_wo2, sum_vat2, sum_with2 = _aggregate_lines(doc)
#     _check_against_doc(doc, sum_wo2, sum_vat2, sum_with2)

#     # Если теперь всё сошлось — подчистим устаревшие mismatch-хинты
#     if doc.get("ar_sutapo", False):
#         prev_hints = doc.get("_lines_structured_hints") or []
#         new_hints = [h for h in prev_hints if not h.startswith("DOC-LINES-NOT-MATCHING-")]
#         if len(new_hints) != len(prev_hints):
#             doc["_lines_structured_hints"] = new_hints
#             append_log(doc, "cleanup: removed outdated mismatch hints after header-line removal")





# def _check_against_doc(doc: Dict[str, Any], sum_wo: Decimal, sum_vat: Decimal, sum_with: Decimal) -> Dict[str, Any]:
#     """Сверка агрегатов строк с документом (без документных скидок). Ставит флаги в doc."""
#     doc_wo   = d(doc.get("amount_wo_vat"), 4)
#     doc_vat  = d(doc.get("vat_amount"), 4)
#     doc_with = d(doc.get("amount_with_vat"), 4)
#     separate_vat = bool(doc.get("separate_vat"))

#     # Базовые проверки
#     doc["_lines_sum_matches_wo"]   = bool(_approx(sum_wo, doc_wo))
#     doc["_lines_sum_matches_vat"]  = bool(_approx(sum_vat, doc_vat)) if not separate_vat else None
#     doc["_lines_sum_matches_with"] = bool(_approx(sum_with, doc_with))

#     # Дополнительно: wo+vat == with (агрегатно), только как sanity
#     doc["_lines_core_wo_plus_vat_eq_with"] = bool(_approx(Q4(sum_wo + sum_vat), sum_with))

#     # Итог
#     if separate_vat:
#         ok = bool(doc["_lines_sum_matches_wo"]) and bool(doc["_lines_sum_matches_with"])
#     else:
#         ok = bool(doc["_lines_sum_matches_wo"]) and bool(doc["_lines_sum_matches_vat"]) and bool(doc["_lines_sum_matches_with"])

#     doc["ar_sutapo"] = bool(ok)
#     append_log(doc, f"lines aggregate: sum_wo={sum_wo}, sum_vat={sum_vat}, sum_with={sum_with}")
#     append_log(doc, f"lines vs doc: wo={doc['_lines_sum_matches_wo']}, vat={doc.get('_lines_sum_matches_vat')}, with={doc['_lines_sum_matches_with']}, core={doc['_lines_core_wo_plus_vat_eq_with']}, ar_sutapo={doc['ar_sutapo']}")
#     return doc


# def _try_single_pass_reconciliation(doc: Dict[str, Any]) -> None:
#     """
#     Одношаговая попытка улучшить совпадение: для строк с единственной скидкой with/wo пробуем swap
#     и оставляем изменение, если оно уменьшает суммарное несоответствие к документу.
#     """
#     items = doc.get("line_items") or []
#     if not items:
#         return

#     def aggregates_distance(a_wo, a_vat, a_with, doc_wo, doc_vat, doc_with, separate_vat):
#         # L1-норма по доступным якорям
#         dist = (a_wo - doc_wo).copy_abs() + (a_with - doc_with).copy_abs()
#         if not separate_vat:
#             dist += (a_vat - doc_vat).copy_abs()
#         return dist

#     separate_vat = bool(doc.get("separate_vat"))
#     doc_wo   = d(doc.get("amount_wo_vat"), 4)
#     doc_vat  = d(doc.get("vat_amount"), 4)
#     doc_with = d(doc.get("amount_with_vat"), 4)

#     base_wo, base_vat, base_with = _aggregate_lines(doc)
#     base_dist = aggregates_distance(base_wo, base_vat, base_with, doc_wo, doc_vat, doc_with, separate_vat)

#     improved = False

#     for li in items:
#         vp_eff = _li_get_vp(li, doc)

#         # кандидаты для swap: есть только один вид скидки
#         disc_wo   = d(li.get("discount_wo_vat"), 4)
#         disc_with = d(li.get("discount_with_vat"), 4)

#         only_with = (disc_with != 0 and disc_wo == 0)
#         only_wo   = (disc_wo != 0 and disc_with == 0)

#         if not (only_with or only_wo):
#             continue

#         # snapshot
#         backup = {k: li.get(k) for k in ("discount_wo_vat", "discount_with_vat", "subtotal", "vat", "total", "_li_calc_log", "_moved_discount")}

#         if only_with:
#             # Попробуем переложить WITH -> WO
#             li["discount_wo_vat"] = disc_with
#             li["discount_with_vat"] = Decimal("0.0000")
#             li["_moved_discount"] = "with→wo"
#         else:
#             # Попробуем переложить WO -> WITH
#             li["discount_with_vat"] = disc_wo
#             li["discount_wo_vat"] = Decimal("0.0000")
#             li["_moved_discount"] = "wo→with"

#         # пересчитать якоря строки
#         _calc_line_anchors(li, vp_eff)

#         # пересчитать агрегаты и дистанцию
#         tmp_wo, tmp_vat, tmp_with = _aggregate_lines(doc)
#         tmp_dist = aggregates_distance(tmp_wo, tmp_vat, tmp_with, doc_wo, doc_vat, doc_with, separate_vat)

#         if tmp_dist < base_dist:
#             append_log(doc, f"reconcile: improved by swapping discount in line (id={li.get('id','?')}): {backup.get('discount_wo_vat')}|{backup.get('discount_with_vat')} -> {li.get('discount_wo_vat')}|{li.get('discount_with_vat')}")
#             base_dist = tmp_dist
#             base_wo, base_vat, base_with = tmp_wo, tmp_vat, tmp_with
#             improved = True
#         else:
#             # откатываем
#             for k, v in backup.items():
#                 li[k] = v

#     if improved:
#         append_log(doc, "reconcile: aggregates improved after single-pass swap")
#     else:
#         append_log(doc, "reconcile: no improvement from single-pass swap")


# def resolve_line_items(doc: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Основной этап для line items.
#     Требование: документ уже прошёл resolve_document_amounts.
#     Документ НЕ МЕНЯЕМ. Исправляем только строки.
#     """
#     items = doc.get("line_items") or []
#     if not items:
#         append_log(doc, "lines: no items")
#         sum_wo, sum_vat, sum_with = Decimal("0.0000"), Decimal("0.0000"), Decimal("0.0000")
#         _check_against_doc(doc, sum_wo, sum_vat, sum_with)
#         return doc

#     # 1) Нормализация VAT% и расчёт каноники по каждой строке
#     for idx, li in enumerate(items):
#         if "subtotal" not in li and "amount_wo_vat" in li:
#             li["subtotal"] = d(li.get("amount_wo_vat"), 4)
#         if "total" not in li and "amount_with_vat" in li:
#             li["total"] = d(li.get("amount_with_vat"), 4)

#         vp_eff = _li_get_vp(li, doc)
#         li["_calc_confidence"] = "low"
#         _calc_line_anchors(li, vp_eff)

#         # confidence
#         price = d(li.get("price"), 4)
#         qty   = d(li.get("quantity"), 4)
#         subtotal_in = _coalesce_li_field(li, "subtotal", "amount_wo_vat", 4)
#         total_in    = _coalesce_li_field(li, "total", "amount_with_vat", 4)
#         if (price != 0 and qty != 0) or subtotal_in != 0 or total_in != 0:
#             li["_calc_confidence"] = "medium" if (price == 0 or qty == 0) and subtotal_in == 0 and total_in != 0 else "high"

#     # 2) Агрегация и первичная сверка
#     sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
#     _check_against_doc(doc, sum_wo, sum_vat, sum_with)

#     reconcile_lines_against_doc_basic_decision_tree(doc)

#     _normalize_unit_price_from_net(doc)

#     # 2a) Глобальная починка: тоталы выглядят как нетто (Σwith≈Σwo), а VAT есть → total := net + vat
#     if (not doc.get("ar_sutapo", False)
#         and _approx(sum_with, sum_wo)
#         and sum_vat != Decimal("0.0000")
#         and _approx(Q4(d(doc.get("amount_wo_vat"),4) + d(doc.get("vat_amount"),4)), d(doc.get("amount_with_vat"),4))):
#         for li in items:
#             net = d(li.get("subtotal"), 4)
#             vat = d(li.get("vat"), 4)
#             tot = d(li.get("total"), 4)
#             if _approx(tot, net) and vat != 0:
#                 li["total"] = Q4(net + vat)
#                 (li.setdefault("_li_calc_log", [])).append("fix(global): total looked net-like -> total := net + vat")
#         # пересчитать агрегаты и флаги
#         sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
#         _check_against_doc(doc, sum_wo, sum_vat, sum_with)

#     # 2b) Если Σsubtotal совпал с документом, а в строках есть скидки — они информационные, зануляем
#     if doc.get("_lines_sum_matches_wo") and any(
#         d(li.get("discount_wo_vat"),4) != 0 or d(li.get("discount_with_vat"),4) != 0
#         for li in items
#     ):
#         for li in items:
#             if d(li.get("discount_wo_vat"),4) != 0 or d(li.get("discount_with_vat"),4) != 0:
#                 li["discount_wo_vat"] = Decimal("0.0000")
#                 li["discount_with_vat"] = Decimal("0.0000")
#                 (li.setdefault("_li_calc_log", [])).append("fix(global): informational line discounts (Σsub==doc.wo) -> zeroed")
#                 # пересчёт total на net+vat
#                 net = d(li.get("subtotal"), 4)
#                 vp  = d(li.get("vat_percent"), 2)
#                 vat = d(li.get("vat"), 4)
#                 if vat == 0 and vp != 0 and net != 0:
#                     vat = Q4(net * vp / Decimal("100"))
#                     li["vat"] = vat
#                 li["total"] = Q4(net + vat)

#         # пересчитать агрегаты и флаги
#         sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
#         _check_against_doc(doc, sum_wo, sum_vat, sum_with)
#         append_log(doc, "reconcile: informational line discounts were zeroed (Σsub==doc.wo)")

#     # 3) Если не сошлось — одношаговый swap скидок (локальная оптимизация)
#     if not doc.get("ar_sutapo", False):
#         _try_single_pass_reconciliation(doc)
#         sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
#         _check_against_doc(doc, sum_wo, sum_vat, sum_with)


#     # 3a) если суммы строк всё ещё БОЛЬШЕ документа — попробуем удалить «лишнюю» строку (заголовок/fee)
#     if not doc.get("ar_sutapo", False):
#         _try_drop_suspect_header_line(doc)
#         sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
#         _check_against_doc(doc, sum_wo, sum_vat, sum_with)

#     # 3b) удалить полностью пустые строки (строго: price=subtotal=total=0/None)
#     _purge_zero_lines(doc)
#     sum_wo, sum_vat, sum_with = _aggregate_lines(doc)
#     _check_against_doc(doc, sum_wo, sum_vat, sum_with)



#     # 4) Хинты
#     hints: List[str] = []
#     if not doc.get("ar_sutapo", False):
#         if not doc.get("_lines_sum_matches_wo", True):
#             hints.append("DOC-LINES-NOT-MATCHING-WO: сумма нетто строк не совпадает с документом.")
#         if (doc.get("_lines_sum_matches_vat") is False):
#             hints.append("DOC-LINES-NOT-MATCHING-VAT: сумма НДС строк не совпадает с документом.")
#         if not doc.get("_lines_sum_matches_with", True):
#             hints.append("DOC-LINES-NOT-MATCHING-WITH: сумма брутто строк не совпадает с документом.")
#     for li in items:
#         if li.get("_dup_discount_wo"):
#             hints.append(f"LI-PRICE-INCLUDES-DISCOUNT: строка id={li.get('id','?')} — discount_wo_vat продублирован.")
#         if li.get("_dup_discount_with"):
#             hints.append(f"LI-PRICE-INCLUDES-DISCOUNT: строка id={li.get('id','?')} — discount_with_vat продублирован.")
#         if li.get("_conflict_zero_vat_discount"):
#             hints.append(f"LI-ZERO-VAT-DISCOUNTS-MISMATCH: строка id={li.get('id','?')} — при vp=0 скидки wo/with различаются.")
#         if li.get("_moved_discount"):
#             hints.append(f"LI-DISCOUNT-FIELD-MISMATCH: строка id={li.get('id','?')} — скидка переставлена {li['_moved_discount']}.")
#         if li.get("_price_mismatch"):
#             hints.append(f"LI-PRICE-MISMATCH: строка id={li.get('id','?')} — subtotal не согласуется с price×qty (+/- скидки).")

#     if hints:
#         doc["_lines_structured_hints"] = hints
#         append_log(doc, f"hints: {len(hints)} issues noted")

#     return doc









# # # ------------------------------------------------------------------------------------------------------------------------------


# # ==============================
# # Universal document consistency checks (sumiskai + detaliai)
# # Pure logging (no mutation of business fields)
# # ==============================

# from decimal import Decimal
# from typing import Any, Dict, Tuple

# def _eq(a: Decimal, b: Decimal, tol: Decimal) -> bool:
#     return abs(Q4(a) - Q4(b)) <= tol


# def _anchors_present(doc_struct: Dict[str, Any]) -> Tuple[bool, str]:
#     """
#     Должно быть минимум 2 заполненных якоря И хотя бы один из них — amount_wo_vat или amount_with_vat.
#     """
#     wo_raw   = doc_struct.get("amount_wo_vat")
#     w_raw    = doc_struct.get("amount_with_vat")
#     vat_raw  = doc_struct.get("vat_amount")
#     vp_raw   = doc_struct.get("vat_percent")

#     have = {
#         "amount_wo_vat": not (wo_raw is None or str(wo_raw).strip().lower() in ("", "null")),
#         "amount_with_vat": not (w_raw is None or str(w_raw).strip().lower() in ("", "null")),
#         "vat_amount": not (vat_raw is None or str(vat_raw).strip().lower() in ("", "null")),
#         "vat_percent": not (vp_raw is None or str(vp_raw).strip().lower() in ("", "null")),
#     }
#     cnt = sum(1 for v in have.values() if v)
#     need_wo_or_w = have["amount_wo_vat"] or have["amount_with_vat"]
#     ok = (cnt >= 2) and need_wo_or_w
#     msg = f"check#1 anchors: have={have}, count={cnt}, need(>=2 & one of wo/with) → {ok}"
#     return ok, msg


# def _pick_vat_for_checks(doc_struct: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Подготавливает значения для сверок:
#       - vat_provided: как пришло/лежит в doc
#       - vat_from_rate: из amount_wo_vat * vat_percent/100 (если оба есть)
#     """
#     wo = d(doc_struct.get("amount_wo_vat"), 4)
#     w  = d(doc_struct.get("amount_with_vat"), 4)
#     v  = d(doc_struct.get("vat_amount"), 4)
#     vp = d(doc_struct.get("vat_percent"), 2)

#     vat_from_rate = None
#     if wo > 0 and vp > 0:
#         vat_from_rate = Q4(wo * vp / Decimal("100"))

#     return {"wo": wo, "with": w, "vat_provided": v, "vat_from_rate": vat_from_rate, "vp": vp}


# def run_document_consistency_checks(doc_struct: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Универсальные проверки для документов:
#       0) логируем наличие скидок на документе
#       1) проверка якорей (>=2, один из wo/with)
#       2) базовые равенства на уровне документа:
#          - wo + VAT ≈ with (используя vat_provided и, отдельно, vat_from_rate)
#          - VAT ≈ wo * vp/100
#       2b) если есть строки: сравниваем документ с суммами по строкам (учитывая invoice скидки)
#           - Σsub - inv_disc_wo ≈ doc.amount_wo_vat
#           - Σvat (скорректированный, если задана ставка и есть inv_disc_wo) ≈ doc.vat_amount
#           - Σtot - inv_disc_with ≈ doc.amount_with_vat
#           - считаем «залоченные» строки: total≈subtotal+vat
#       3) если базовые равенства не сошлись — проверяем сценарии со скидкой:
#          A) (wo - inv_disc_wo) + VAT ≈ with
#          B) wo + VAT ≈ (with - inv_disc_with)
#     НИЧЕГО не меняет — только пишет в _global_validation_log и выставляет флаги _check_*.
#     """
#     # 0) скидки
#     inv_disc_wo   = d(doc_struct.get("invoice_discount_wo_vat"), 4)
#     inv_disc_with = d(doc_struct.get("invoice_discount_with_vat"), 4)
#     append_log(doc_struct, f"check#0 discounts: invoice_discount_wo_vat={Q4(inv_disc_wo)}, invoice_discount_with_vat={Q4(inv_disc_with)}")

#     # 1) якоря
#     ok1, msg1 = _anchors_present(doc_struct)
#     append_log(doc_struct, msg1)
#     doc_struct["_check_minimum_anchors_ok"] = bool(ok1)

#     # подсобные значения и толеранс
#     picks = _pick_vat_for_checks(doc_struct)
#     wo, w, vat_provided, vat_from_rate, vp_doc = picks["wo"], picks["with"], picks["vat_provided"], picks["vat_from_rate"], picks["vp"]

#     gross_for_tol = w if w > 0 else (wo + (vat_provided or Decimal("0")))
#     TOL = tol_doc(gross_for_tol if gross_for_tol > 0 else Decimal("0.00"))

#     # 2) базовые равенства документа
#     eq2a = (_eq(wo + vat_provided, w, TOL) if (wo > 0 and vat_provided is not None and w > 0) else None)
#     eq2b = (_eq(vat_provided, Q4(wo * vp_doc / Decimal("100")), TOL) if (wo > 0 and vp_doc > 0 and vat_provided is not None) else None)
#     append_log(doc_struct, f"check#2 core: wo+vat_provided≈with → {eq2a}; vat_provided≈wo*vp → {eq2b} (wo={Q4(wo)}, with={Q4(w)}, vat={Q4(vat_provided)}, vp={Q2(vp_doc)}%, tol={Q4(TOL)})")

#     eq2a_rate = None
#     if vat_from_rate is not None and wo > 0 and w > 0:
#         eq2a_rate = _eq(wo + vat_from_rate, w, TOL)
#         append_log(doc_struct, f"check#2b core(using rate): wo+vat_from_rate≈with → {eq2a_rate} (vat_from_rate={Q4(vat_from_rate)})")

#     doc_struct["_check_core_wo_plus_vat_eq_with"] = bool(eq2a) if eq2a is not None else None
#     doc_struct["_check_core_vat_eq_wo_times_vp"]  = bool(eq2b) if eq2b is not None else None
#     doc_struct["_check_core_wo_plus_vatRate_eq_with"] = bool(eq2a_rate) if eq2a_rate is not None else None

#     # 2b) сравнение с суммами строк (если есть detaliai)
#     items = doc_struct.get("line_items") or []
#     if items:
#         sum_sub = sum(d(it.get("subtotal"), 4) for it in items)
#         sum_vat = sum(d(it.get("vat"), 4) for it in items)
#         sum_tot = sum(d(it.get("total"), 4) for it in items)

#         # корректируем VAT lines на скидку без НДС, если известна ставка документа
#         eff_sum_vat = Q4(sum_vat)
#         if vp_doc > 0 and inv_disc_wo > 0:
#             eff_sum_vat = Q4(sum_vat - (inv_disc_wo * vp_doc / Decimal("100")))
#             if eff_sum_vat < 0:
#                 eff_sum_vat = Decimal("0.0000")

#         # ожидаемые документные суммы из строк
#         expected_doc_wo = Q4(sum_sub - inv_disc_wo)
#         expected_doc_w  = Q4(sum_tot - inv_disc_with)

#         ok_wo  = _eq(expected_doc_wo, wo, TOL)
#         ok_vat = _eq(eff_sum_vat, d(doc_struct.get("vat_amount"), 4), TOL)
#         ok_w   = _eq(expected_doc_w,  w,  TOL)

#         append_log(doc_struct, f"check#2c lines→doc: Σsub-inv_disc_wo≈doc.wo → {ok_wo}; Σvat(eff)≈doc.vat → {ok_vat}; Σtot-inv_disc_with≈doc.with → {ok_w} "
#                                f"(Σsub={Q4(sum_sub)}, Σvat={Q4(sum_vat)}, Σtot={Q4(sum_tot)}, eff_Σvat={Q4(eff_sum_vat)}, tol={Q4(TOL)})")

#         # лочим строки по total≈subtotal+vat
#         locked = 0
#         for li in items:
#             sub = d(li.get("subtotal"), 4)
#             v   = d(li.get("vat"), 4)
#             tot = d(li.get("total"), 4)
#             if sub > 0 or v > 0 or tot > 0:
#                 if _eq(sub + v, tot, Decimal("0.02")):
#                     locked += 1
#         append_log(doc_struct, f"check#2d line-locks: {locked}/{len(items)} lines with total≈subtotal+vat (tol=0.02)")
#         doc_struct["_lines_sum_wo"] = Q4(sum_sub)
#         doc_struct["_lines_sum_vat"] = Q4(sum_vat)
#         doc_struct["_lines_sum_with"] = Q4(sum_tot)
#         doc_struct["_lines_vs_doc_subtotal_ok"] = bool(ok_wo)
#         doc_struct["_lines_vs_doc_vat_ok"] = bool(ok_vat)
#         doc_struct["_lines_vs_doc_total_ok"] = bool(ok_w)
#         doc_struct["_lines_locked_count"] = locked
#         doc_struct["_lines_count"] = len(items)

#     # 3) сценарии со скидкой (если базовое равенство не прошло)
#     need_discount_path = not (bool(eq2a) or bool(eq2a_rate))
#     if need_discount_path:
#         resA = resB = None
#         usedA = usedB = None

#         # A) (wo - inv_disc_wo) + VAT ≈ with
#         if inv_disc_wo > 0 and wo > 0 and w > 0:
#             if vat_provided is not None and vat_provided > 0:
#                 resA, usedA = _eq((wo - inv_disc_wo) + vat_provided, w, TOL), "vat_provided"
#             if not resA and vat_from_rate is not None and vat_from_rate > 0:
#                 resA, usedA = _eq((wo - inv_disc_wo) + vat_from_rate, w, TOL), "vat_from_rate"
#             append_log(doc_struct, f"check#3A discounts: (wo - disc_wo) + VAT ≈ with → {resA} (disc_wo={Q4(inv_disc_wo)}, VAT_used={usedA})")

#         # B) wo + VAT ≈ (with - inv_disc_with)
#         if inv_disc_with > 0 and wo > 0 and w > 0:
#             if vat_provided is not None and vat_provided > 0:
#                 resB, usedB = _eq(wo + vat_provided, (w - inv_disc_with), TOL), "vat_provided"
#             if not resB and vat_from_rate is not None and vat_from_rate > 0:
#                 resB, usedB = _eq(wo + vat_from_rate, (w - inv_disc_with), TOL), "vat_from_rate"
#             append_log(doc_struct, f"check#3B discounts: wo + VAT ≈ (with - disc_with) → {resB} (disc_with={Q4(inv_disc_with)}, VAT_used={usedB})")

#         doc_struct["_check_discount_scenario_A"] = bool(resA) if resA is not None else None
#         doc_struct["_check_discount_scenario_B"] = bool(resB) if resB is not None else None

#         if (resA or resB):
#             which = "A" if resA else "B"
#             append_log(doc_struct, f"check#3 result: document discounts look informational (matched scenario {which})")
#             doc_struct["_discounts_look_informational"] = True
#         else:
#             doc_struct["_discounts_look_informational"] = False
#     else:
#         append_log(doc_struct, "check#3 skipped: core equality already holds (no need to apply invoice discounts)")
#         doc_struct["_discounts_look_informational"] = None

#     return doc_struct


# # ==============================
# # Helpers / Quantizers / Coerce
# # ==============================

# Q4 = lambda x: Decimal(str(x)).quantize(Decimal("1.0000"), rounding=ROUND_HALF_UP)
# Q2 = lambda x: Decimal(str(x)).quantize(Decimal("1.00"),   rounding=ROUND_HALF_UP)


# def d(x: Any, p: int = 4) -> Decimal:
#     """Safe decimal coercion with quantization; empty/null → 0."""
#     if x is None or x == "" or str(x).lower() == "null":
#         return Decimal("0.0000") if p == 4 else Decimal("0.00")
#     try:
#         return Decimal(str(x)).quantize(Decimal("1." + "0" * p), rounding=ROUND_HALF_UP)
#     except Exception as e:
#         logger.info(f"[d] EXCEPTION: {e} (input={x})")
#         return Decimal("0.0000") if p == 4 else Decimal("0.00")


# def tol_doc(gross: Decimal) -> Decimal:
#     """Dynamic tolerance for document-level comparisons."""
#     try:
#         base = max(Decimal("0.02"), min(Decimal("0.50"), Q4(gross * Decimal("0.0005"))))
#         return Q4(base)
#     except Exception:
#         return Decimal("0.05")



# # ==============================
# # VALIDATORS (inline, non-DB mutating helpers)
# # ==============================

# def append_log(doc_struct: Dict[str, Any], msg: str) -> None:
#     logs = doc_struct.get("_global_validation_log") or []
#     logs.append(msg)
#     doc_struct["_global_validation_log"] = logs


# def subtotal_already_discounted(item: Dict[str, Any]) -> bool:
#     """True if subtotal already includes discount_wo_vat (i.e., price*qty ≈ subtotal+discount)."""
#     try:
#         subtotal = d(item.get("subtotal"), 4)
#         discount = d(item.get("discount_wo_vat"), 4)
#         price    = d(item.get("price"), 4)
#         qty      = d(item.get("quantity"), 4)
#         base = Q4(price * qty)
#         return abs((subtotal + discount) - base) <= Decimal("0.02")
#     except Exception:
#         return False


# # def validate_and_calculate_main_amounts(data: Dict[str, Any]) -> Dict[str, Any]:
# #     """
# #     Reconstruct anchors: amount_wo_vat, vat_amount, vat_percent, amount_with_vat.
# #     Special: if no line_items and only total present -> treat as VAT 0.
# #     """
# #     amount_wo_vat = d(data.get("amount_wo_vat"), 4)
# #     vat_amount    = d(data.get("vat_amount"), 4)
# #     vat_percent   = d(data.get("vat_percent"), 2)
# #     with_vat      = d(data.get("amount_with_vat"), 4)

# #     items = data.get("line_items") or []
# #     calc_log: List[str] = []

# #     if (not items) and (not with_vat.is_zero()) and amount_wo_vat.is_zero() and vat_amount.is_zero() and vat_percent.is_zero():
# #         amount_wo_vat = with_vat
# #         vat_amount = Decimal("0.0000")
# #         vat_percent = Decimal("0.00")
# #         calc_log.append("auto: no line_items & only total -> VAT=0, wo=with")

# #     # amount_wo_vat
# #     if amount_wo_vat.is_zero():
# #         if (not with_vat.is_zero()) and (not vat_percent.is_zero()):
# #             amount_wo_vat = Q4(with_vat / (Decimal("1") + vat_percent / Decimal("100")))
# #             calc_log.append("wo from with & vat%")
# #         elif (not with_vat.is_zero()) and (not vat_amount.is_zero()):
# #             amount_wo_vat = Q4(with_vat - vat_amount)
# #             calc_log.append("wo from with & vat")

# #     # vat_amount
# #     if vat_amount.is_zero():
# #         if (not amount_wo_vat.is_zero()) and (not vat_percent.is_zero()):
# #             vat_amount = Q4(amount_wo_vat * vat_percent / Decimal("100"))
# #             calc_log.append("vat from wo & vat%")
# #         elif (not with_vat.is_zero()) and (not amount_wo_vat.is_zero()):
# #             vat_amount = Q4(with_vat - amount_wo_vat)
# #             calc_log.append("vat from with & wo")

# #     # vat_percent
# #     if vat_percent.is_zero():
# #         if (not amount_wo_vat.is_zero()) and (not vat_amount.is_zero()):
# #             vat_percent = Q2(vat_amount / amount_wo_vat * Decimal("100"))
# #             calc_log.append("vat% from vat & wo")
# #         elif (not amount_wo_vat.is_zero()) and (not with_vat.is_zero()):
# #             vat_percent = Q2((with_vat / amount_wo_vat - Decimal("1")) * Decimal("100"))
# #             calc_log.append("vat% from with & wo")

# #     # amount_with_vat
# #     if with_vat.is_zero():
# #         if (not amount_wo_vat.is_zero()) and (not vat_percent.is_zero()):
# #             with_vat = Q4(amount_wo_vat * (Decimal("1") + vat_percent / Decimal("100")))
# #             calc_log.append("with from wo & vat%")
# #         elif (not amount_wo_vat.is_zero()) and (not vat_amount.is_zero()):
# #             with_vat = Q4(amount_wo_vat + vat_amount)
# #             calc_log.append("with from wo & vat")

# #     data["amount_wo_vat"] = amount_wo_vat
# #     data["vat_amount"] = vat_amount
# #     data["vat_percent"] = vat_percent
# #     data["amount_with_vat"] = with_vat
# #     data["_main_amounts_calc_log"] = calc_log
# #     return data


# def dedupe_document_discounts(doc_struct: Dict[str, Any], tol: Decimal = Decimal("0.05")) -> Dict[str, Any]:
#     """
#     Если документ уже сходится без применения скидок — трактуем скидку как информационную и обнуляем.
#     Плюс прежняя логика дедупликации: если сумма построчных скидок ≈ скидке документа — уменьшаем/обнуляем,
#     а также обнуляем invoice_discount_with_vat при VAT=0 и совпадающих тоталах.
#     """
#     items = doc_struct.get("line_items") or []

#     # --- NEW: быстрый тест «скидка только для справки» (совпадение без применения скидок) ---
#     doc_wo = d(doc_struct.get("amount_wo_vat"), 4)
#     doc_v  = d(doc_struct.get("vat_amount"), 4)
#     doc_w  = d(doc_struct.get("amount_with_vat"), 4)

#     # идентичность на уровне документа: wo + vat ≈ with
#     doc_id_ok = abs((doc_wo + doc_v) - doc_w) <= tol

#     if items:
#         sum_sub = sum(d(it.get("subtotal"), 4) for it in items)
#         sum_vat = sum(d(it.get("vat"), 4) for it in items)
#         sum_tot = sum(d(it.get("total"), 4) for it in items)

#         lines_match_doc_wo  = abs(sum_sub - doc_wo) <= tol
#         lines_match_doc_vat = abs(sum_vat - doc_v)  <= tol
#         lines_match_doc_w   = abs(sum_tot - doc_w)  <= tol

#         already_in_prices = (doc_id_ok and lines_match_doc_wo and lines_match_doc_vat and lines_match_doc_w)
#     else:
#         already_in_prices = doc_id_ok

#     if already_in_prices:
#         if d(doc_struct.get("invoice_discount_wo_vat"), 4) != 0 or d(doc_struct.get("invoice_discount_with_vat"), 4) != 0:
#             doc_struct["invoice_discount_wo_vat"] = Decimal("0.0000")
#             doc_struct["invoice_discount_with_vat"] = Decimal("0.0000")
#             append_log(doc_struct, "dedupe: document already matches without discounts → invoice_discount_* treated as informational (set to 0)")
#         return doc_struct
#     # --- /NEW ---

#     # Существующая логика дедупликации
#     sum_line_disc_wo   = sum(d(it.get("discount_wo_vat"), 4)   for it in items)
#     sum_line_disc_with = sum(d(it.get("discount_with_vat"), 4) for it in items)

#     inv_disc_wo   = d(doc_struct.get("invoice_discount_wo_vat"), 4)
#     inv_disc_with = d(doc_struct.get("invoice_discount_with_vat"), 4)

#     # wo_vat
#     if inv_disc_wo > 0 and sum_line_disc_wo > 0:
#         new_wo = inv_disc_wo - sum_line_disc_wo
#         if abs(new_wo) <= tol or new_wo < 0:
#             new_wo = Decimal("0.0000")
#         if new_wo != inv_disc_wo:
#             doc_struct["invoice_discount_wo_vat"] = new_wo
#             doc_struct["_dedup_invoice_discount_wo_vat"] = True
#             append_log(doc_struct, f"dedupe: invoice_discount_wo_vat {inv_disc_wo} -> {new_wo} (line sum={sum_line_disc_wo})")

#     # with_vat
#     if inv_disc_with > 0 and sum_line_disc_with > 0:
#         new_with = inv_disc_with - sum_line_disc_with
#         if abs(new_with) <= tol or new_with < 0:
#             new_with = Decimal("0.0000")
#         if new_with != inv_disc_with:
#             doc_struct["invoice_discount_with_vat"] = new_with
#             doc_struct["_dedup_invoice_discount_with_vat"] = True
#             append_log(doc_struct, f"dedupe: invoice_discount_with_vat {inv_disc_with} -> {new_with} (line sum with VAT={sum_line_disc_with})")

#     # extra: если VAT=0 и Σ(total)==amount_with_vat → invoice_discount_with_vat=0
#     doc_vat = d(doc_struct.get("vat_amount"), 4)
#     if doc_vat == 0:
#         sum_total = sum(d(it.get("total"), 4) for it in items)
#         doc_total = d(doc_struct.get("amount_with_vat"), 4)
#         if inv_disc_with > 0 and abs(doc_total - sum_total) <= tol:
#             doc_struct["invoice_discount_with_vat"] = Decimal("0.0000")
#             doc_struct["_dedup_invoice_discount_with_vat"] = True
#             append_log(doc_struct, "dedupe: VAT=0 and totals match → invoice_discount_with_vat=0")

#     return doc_struct



# def enforce_discounts_and_vat_rules(doc_struct: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     (1) If Σ(line subtotal) ≈ doc.amount_wo_vat → ignore extra line discounts (set to 0 to avoid double subtract).
#     (2) Each line: enforce subtotal ≈ price*qty (fix if > 0.02).
#     (3) If separate_vat=False and a doc VAT rate can be derived, push it into lines: line.vat=sub*rate, total=sub+vat.
#     """
#     items = doc_struct.get("line_items") or []
#     if not items:
#         append_log(doc_struct, "enforce: no line_items → skip")
#         return doc_struct

#     TOL_LINE = Decimal("0.02")
#     TOL_DOC  = Decimal("0.05")

#     # Step 2: make subtotal = price*qty if necessary
#     sum_before = Decimal("0.0000")
#     sum_after  = Decimal("0.0000")
#     fixed = 0

#     for it in items:
#         qty   = d(it.get("quantity"), 4)
#         price = d(it.get("price"), 4)
#         sub   = d(it.get("subtotal"), 4)
#         pq    = Q4(price * qty)
#         sum_before += sub

#         if sub.is_zero() and (not price.is_zero() and not qty.is_zero()):
#             it["subtotal"] = pq
#             sub = pq
#             fixed += 1
#             append_log(doc_struct, f"line[{it.get('line_id')}] subtotal empty → set price*qty={pq}")

#         if (not price.is_zero() and not qty.is_zero()) and abs(sub - pq) > TOL_LINE:
#             it["subtotal"] = pq
#             sub = pq
#             fixed += 1
#             append_log(doc_struct, f"line[{it.get('line_id')}] subtotal {sub}≠price*qty {pq} → replaced by {pq}")
#         else:
#             if not sub.is_zero() and not price.is_zero() and not qty.is_zero():
#                 append_log(doc_struct, f"line[{it.get('line_id')}] subtotal≈price*qty — ok")

#         sum_after += sub

#     if fixed:
#         append_log(doc_struct, f"enforce: corrected line subtotals count={fixed}")
#     append_log(doc_struct, f"enforce: Σsubtotal before={Q4(sum_before)}, after={Q4(sum_after)}")

#     # Step 1: ignore line discounts if Σsubtotals≈doc wo
#     doc_subtotal = d(doc_struct.get("amount_wo_vat"), 4)
#     if doc_subtotal > 0 and abs(sum_after - doc_subtotal) <= TOL_DOC:
#         discounted = 0
#         for it in items:
#             if d(it.get("discount_wo_vat"), 4) != 0 or d(it.get("discount_with_vat"), 4) != 0:
#                 it["discount_wo_vat"] = Decimal("0.0000")
#                 it["discount_with_vat"] = Decimal("0.0000")
#                 it["_line_discount_ignored_as_already_in_price"] = True
#                 discounted += 1
#         if discounted:
#             append_log(doc_struct, f"enforce: Σsub≈doc.wo → zeroed line discounts in {discounted} lines (avoid double-discount)")
#     else:
#         append_log(doc_struct, "enforce: Σsub != doc.wo (or doc wo=0) — line discounts kept")

#     # Step 3: propagate doc VAT% when separate_vat=False
#     sep = bool(doc_struct.get("separate_vat"))
#     vp  = d(doc_struct.get("vat_percent"), 2)
#     vat = d(doc_struct.get("vat_amount"), 4)

#     if vp.is_zero() and (vat > 0 and doc_subtotal > 0):
#         vp = Q2(vat / doc_subtotal * Decimal("100"))
#         doc_struct["vat_percent"] = vp
#         append_log(doc_struct, f"enforce: derived doc vat% from vat/wo: {vp}%")

#     if not sep and vp > 0:
#         applied = 0
#         for it in items:
#             sub = d(it.get("subtotal"), 4)
#             if sub.is_zero():
#                 continue
#             vat_line = Q4(sub * vp / Decimal("100"))
#             total_line = Q4(sub + vat_line)
#             it["vat_percent"] = vp
#             it["vat"] = vat_line
#             it["total"] = total_line
#             it["_vat_from_document_percent"] = True
#             append_log(doc_struct, f"line[{it.get('line_id')}] vat%={vp} from doc → vat={vat_line}, total={total_line}")
#             applied += 1
#         if applied:
#             append_log(doc_struct, f"enforce: applied doc vat% to {applied} lines")
#     else:
#         if sep:
#             append_log(doc_struct, "enforce: separate_vat=True — skip VAT propagation")
#         else:
#             append_log(doc_struct, "enforce: doc vat% absent — skip VAT propagation")

#     return doc_struct


# def distribute_vat_from_document(doc_struct: Dict[str, Any], tol: Decimal = Decimal("0.05")) -> Dict[str, Any]:
#     """
#     Distribute doc-level VAT% to lines that have zero VAT, then adjust the last touched line by rounding diff.
#     Preconditions: separate_vat=False, doc.vat_amount>0, doc.vat_percent>0.
#     """
#     try:
#         separate_vat = bool(doc_struct.get("separate_vat"))
#         doc_vat_amt  = Decimal(str(doc_struct.get("vat_amount") or "0"))
#         doc_vat_pct  = Decimal(str(doc_struct.get("vat_percent") or "0"))
#     except Exception:
#         return doc_struct

#     if separate_vat or doc_vat_amt <= 0 or doc_vat_pct <= 0:
#         return doc_struct

#     items = doc_struct.get("line_items") or []
#     if not items:
#         return doc_struct

#     sum_vat = Decimal("0.0000")
#     last_idx = None

#     for idx, it in enumerate(items):
#         sub = d(it.get("subtotal"), 4)
#         if sub <= 0:
#             q = d(it.get("quantity"), 4)
#             p = d(it.get("price"), 4)
#             disc = d(it.get("discount_wo_vat"), 4)
#             if q > 0 and p > 0:
#                 sub = Q4(q * p - disc)
#         v  = d(it.get("vat"), 4)
#         vp = d(it.get("vat_percent"), 2)

#         if v == 0 and vp == 0 and sub > 0:
#             vp = Q2(doc_vat_pct)
#             v  = Q4(sub * vp / Decimal("100"))
#             it["vat_percent"] = vp
#             it["vat"] = v
#             if d(it.get("total"), 4) == 0:
#                 it["total"] = Q4(sub + v)
#             last_idx = idx
#             sum_vat += v
#         else:
#             sum_vat += Q4(v)

#     try:
#         diff = Q4(doc_vat_amt - sum_vat)
#         if last_idx is not None and abs(diff) > tol:
#             li = items[last_idx]
#             current_v = Q4(d(li.get("vat"), 4))
#             new_v = current_v + diff
#             if new_v >= 0:
#                 li["vat"] = Q4(new_v)
#                 sub = d(li.get("subtotal"), 4)
#                 li["total"] = Q4(sub + li["vat"])
#                 append_log(doc_struct, f"distribute_vat: adjusted last line by {diff} to match doc.vat_amount")
#     except Exception:
#         pass

#     return doc_struct


# def validate_and_calculate_lineitem_amounts(item: Dict[str, Any]) -> Dict[str, Any]:
#     """Strict, local line rebuild with discount/net logic and safe guards."""
#     calc_log: List[str] = []
#     quantity = d(item.get("quantity"), 4)
#     price    = d(item.get("price"), 4)
#     subtotal = d(item.get("subtotal"), 4)
#     vat      = d(item.get("vat"), 4)
#     vat_pct  = d(item.get("vat_percent"), 2)
#     total    = d(item.get("total"), 4)
#     disc_wo  = d(item.get("discount_wo_vat"), 4)

#     TOL = Decimal("0.02")

#     # subtotal from price*qty - discount_wo
#     if not price.is_zero() and not quantity.is_zero():
#         expected_sub = Q4(price * quantity - disc_wo)
#         if abs(expected_sub - subtotal) > TOL:
#             calc_log.append(f"subtotal {subtotal} != price*qty-discount {expected_sub} → replace")
#             subtotal = expected_sub
#         else:
#             calc_log.append("subtotal matches price*qty-discount — ok")
#     else:
#         calc_log.append("missing price or qty — keep subtotal as is")

#     # VAT if absent
#     if vat.is_zero():
#         if not subtotal.is_zero() and not vat_pct.is_zero():
#             vat = Q4(subtotal * vat_pct / Decimal("100"))
#             calc_log.append("vat from subtotal & vat%")
#         elif not total.is_zero() and not subtotal.is_zero():
#             v = Q4(total - subtotal)
#             vat = max(v, Decimal("0.0000"))
#             calc_log.append("vat from total - subtotal")

#     # VAT% if absent
#     if vat_pct.is_zero():
#         if not vat.is_zero() and not subtotal.is_zero():
#             vat_pct = Q2(vat / subtotal * Decimal("100"))
#             calc_log.append("vat% from vat & subtotal")
#         elif not total.is_zero() and not subtotal.is_zero():
#             if total >= subtotal:
#                 vat_pct = Q2((total / subtotal - Decimal("1")) * Decimal("100"))
#                 calc_log.append("vat% from total/subtotal")
#             else:
#                 vat_pct = Decimal("0.00")
#                 calc_log.append("total < subtotal → vat%=0")

#     # total if absent
#     if total.is_zero():
#         if not subtotal.is_zero() and not vat_pct.is_zero():
#             total = Q4(subtotal * (Decimal("1") + vat_pct / Decimal("100")))
#             calc_log.append("total from subtotal & vat%")
#         elif not subtotal.is_zero() and not vat.is_zero():
#             total = Q4(subtotal + vat)
#             calc_log.append("total from subtotal + vat")
#         elif not subtotal.is_zero():
#             total = subtotal
#             calc_log.append("total=subtotal (VAT=0 or missing)")

#     # price if absent
#     if price.is_zero():
#         if quantity.is_zero():
#             quantity = Decimal("1.0000")
#             calc_log.append("quantity default 1.0000")
#         if not subtotal.is_zero():
#             price = Q4(subtotal / quantity)
#             calc_log.append("price from subtotal/qty")

#     # quantity if absent
#     if quantity.is_zero():
#         if not subtotal.is_zero() and not price.is_zero():
#             quantity = Q4(subtotal / price)
#             calc_log.append("quantity from subtotal/price")
#         else:
#             quantity = Decimal("1.0000")
#             calc_log.append("quantity default 1.0000")

#     # final coercion
#     item.update({
#         "quantity": quantity,
#         "price": price,
#         "subtotal": subtotal,
#         "vat": vat,
#         "vat_percent": vat_pct,
#         "total": total,
#         "_lineitem_calc_log": calc_log,
#     })
#     return item


# def _derive_missing_doc_discounts(doc_struct: Dict[str, Any], sum_sub: Decimal, sum_tot: Decimal, tol: Decimal = Decimal("0.05")) -> Tuple[Decimal, Decimal]:
#     """Create doc discounts only if they reduce mismatch and are not duplicates of line discounts."""
#     inv_wo = d(doc_struct.get("invoice_discount_wo_vat"), 4)
#     inv_w  = d(doc_struct.get("invoice_discount_with_vat"), 4)

#     doc_wo = d(doc_struct.get("amount_wo_vat"), 4)
#     doc_w  = d(doc_struct.get("amount_with_vat"), 4)

#     # sum of line discounts
#     sum_line_disc_wo = sum(d(it.get("discount_wo_vat"), 4) for it in (doc_struct.get("line_items") or []))

#     # Only deduce if difference is meaningful and not equal to line discounts
#     if (inv_wo == 0) and (doc_wo < sum_sub):
#         diff_wo = Q4(sum_sub - doc_wo)
#         if abs(diff_wo - sum_line_disc_wo) > tol and (Decimal("0.0000") <= diff_wo <= sum_sub):
#             inv_wo = diff_wo
#             doc_struct["invoice_discount_wo_vat"] = inv_wo
#             append_log(doc_struct, f"deduce: invoice_discount_wo_vat <- {inv_wo}")

#     if (inv_w == 0) and (doc_w < sum_tot):
#         deduced_w = Q4(sum_tot - doc_w)
#         if Decimal("0.0000") <= deduced_w <= sum_tot:
#             inv_w = deduced_w
#             doc_struct["invoice_discount_with_vat"] = inv_w
#             append_log(doc_struct, f"deduce: invoice_discount_with_vat <- {inv_w}")

#     # If both VAT=0 in lines and doc, sync with_wo
#     sum_vat = sum(d(it.get("vat"), 4) for it in (doc_struct.get("line_items") or []))
#     doc_vat = d(doc_struct.get("vat_amount"), 4)
#     if sum_vat == 0 and doc_vat == 0 and inv_w == 0:
#         inv_w = inv_wo
#         doc_struct["invoice_discount_with_vat"] = inv_w
#         append_log(doc_struct, "deduce: VAT=0 → invoice_discount_with_vat = invoice_discount_wo_vat")

#     return inv_wo, inv_w


# def should_normalize_lineitems(doc_struct: Dict[str, Any]) -> bool:
#     """
#     True, если строки надо пересчитать из-за рассинхрона. Сравниваем две гипотезы:
#     H1 — скидки документа применять; H2 — скидки информационные (игнорировать).
#     Выбираем ту, что лучше совпадает с документом; если это H2 — считаем скидки инфо.
#     """
#     items = doc_struct.get("line_items") or []

#     sum_sub = sum(d(it.get("subtotal"), 4) for it in items)
#     sum_vat = sum(d(it.get("vat"), 4) for it in items)
#     sum_tot = sum(d(it.get("total"), 4) for it in items)

#     inv_wo, inv_w = _derive_missing_doc_discounts(doc_struct, sum_sub, sum_tot)

#     doc_wo = d(doc_struct.get("amount_wo_vat"), 4)
#     doc_v  = d(doc_struct.get("vat_amount"), 4)
#     doc_w  = d(doc_struct.get("amount_with_vat"), 4)
#     vp_doc = d(doc_struct.get("vat_percent"), 2)

#     # --- NEW: две гипотезы ---
#     # H1: применять скидки документа
#     eff_vat_h1 = Q4(sum_vat - (inv_wo * vp_doc / Decimal("100"))) if (vp_doc != 0 and inv_wo != 0) else Q4(sum_vat)
#     wo_h1 = Q4(sum_sub - inv_wo)
#     w_h1  = Q4(sum_tot - inv_w)

#     # H2: скидки информационные (игнорировать)
#     eff_vat_h2 = Q4(sum_vat)
#     wo_h2 = Q4(sum_sub)
#     w_h2  = Q4(sum_tot)

#     tol = Decimal("0.05")

#     err_h1 = abs(doc_wo - wo_h1) + abs(doc_v - eff_vat_h1) + abs(doc_w - w_h1)
#     err_h2 = abs(doc_wo - wo_h2) + abs(doc_v - eff_vat_h2) + abs(doc_w - w_h2)

#     use_discounts = err_h1 + Decimal("0.0000") < err_h2 - Decimal("0.0000")
#     if not use_discounts:
#         # считаем скидки информационными
#         inv_wo = Decimal("0.0000")
#         inv_w  = Decimal("0.0000")
#         eff_vat_h1 = eff_vat_h2
#         wo_h1, w_h1 = wo_h2, w_h2
#         append_log(doc_struct, "precheck: treating invoice discounts as informational (better match without them)")
#     # --- /NEW ---

#     ok_wo  = abs(doc_wo - wo_h1)  < tol
#     ok_vat = abs(doc_v  - eff_vat_h1) < tol
#     ok_w   = abs(doc_w  - w_h1)   < tol

#     append_log(
#         doc_struct,
#         f"precheck: sum(sub)={Q4(sum_sub)}, sum(vat)={Q4(sum_vat)}, sum(tot)={Q4(sum_tot)}; "
#         f"doc wo={doc_wo}, vat={doc_v}, with={doc_w}; inv wo={inv_wo}, with={inv_w}; vp_doc={vp_doc}; "
#         f"match wo={ok_wo}, vat={ok_vat}, total={ok_w}"
#     )

#     return not (ok_wo and ok_vat and ok_w)



# def compare_lineitems_with_main_totals(doc_struct: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Сравнение сумм строк с документом с учётом возможной «информационности» скидки.
#     Строим два прогноза (с/без скидки), выбираем лучший и его публикуем как expected_*.
#     """
#     TOL = Decimal("0.0500")
#     items = doc_struct.get("line_items") or []

#     sum_line_sub = Decimal("0.0000")
#     sum_line_disc_wo = Decimal("0.0000")
#     sum_line_vat = Decimal("0.0000")
#     sum_line_tot = Decimal("0.0000")

#     for it in items:
#         sub  = d(it.get("subtotal"), 4)
#         disc = d(it.get("discount_wo_vat"), 4)
#         vat  = d(it.get("vat"), 4)
#         tot  = d(it.get("total"), 4)
#         if subtotal_already_discounted(it):
#             sum_line_sub += sub
#         else:
#             sum_line_sub += sub
#             sum_line_disc_wo += disc
#         sum_line_vat += vat
#         sum_line_tot += tot

#     doc_wo = d(doc_struct.get("amount_wo_vat"), 4)
#     doc_v  = d(doc_struct.get("vat_amount"), 4)
#     doc_w  = d(doc_struct.get("amount_with_vat"), 4)
#     vp_doc = d(doc_struct.get("vat_percent"), 2)

#     inv_wo, inv_w = _derive_missing_doc_discounts(doc_struct, sum_line_sub, sum_line_tot)

#     line_eff_wo = (sum_line_sub - sum_line_disc_wo)

#     # --- NEW: две гипотезы ---
#     # A) применять скидки
#     eff_inv_wo_A = inv_wo
#     eff_inv_w_A  = inv_w

#     expected_wo_A  = Q4(line_eff_wo - eff_inv_wo_A)
#     expected_vat_A = Q4(sum_line_vat - (eff_inv_wo_A * vp_doc / Decimal("100"))) if (vp_doc != 0 and eff_inv_wo_A != 0) else Q4(sum_line_vat)
#     expected_w_A   = Q4(sum_line_tot - eff_inv_w_A)

#     # B) скидки информационные
#     expected_wo_B  = Q4(line_eff_wo)
#     expected_vat_B = Q4(sum_line_vat)
#     expected_w_B   = Q4(sum_line_tot)

#     err_A = abs(expected_wo_A - doc_wo) + abs(expected_vat_A - doc_v) + abs(expected_w_A - doc_w)
#     err_B = abs(expected_wo_B - doc_wo) + abs(expected_vat_B - doc_v) + abs(expected_w_B - doc_w)

#     if err_B + Decimal("0.0000") < err_A - Decimal("0.0000"):
#         # лучше без скидок — трактуем как информационные
#         expected_wo   = expected_wo_B
#         expected_vat  = expected_vat_B
#         expected_w    = expected_w_B
#         eff_inv_wo    = Decimal("0.0000")
#         eff_inv_w     = Decimal("0.0000")
#         append_log(doc_struct, "compare: invoice discounts treated as informational (better match without them)")
#     else:
#         expected_wo   = expected_wo_A
#         expected_vat  = expected_vat_A
#         expected_w    = expected_w_A
#         eff_inv_wo    = eff_inv_wo_A
#         eff_inv_w     = eff_inv_w_A
#     # --- /NEW ---

#     result = {
#         "subtotal_match": abs(expected_wo - doc_wo)   <= TOL,
#         "vat_match":      abs(expected_vat - doc_v)   <= TOL,
#         "total_match":    abs(expected_w - doc_w)     <= TOL,
#         "subtotal_diff":  Q4(expected_wo - doc_wo),
#         "vat_diff":       Q4(expected_vat - doc_v),
#         "total_diff":     Q4(expected_w - doc_w),
#         "expected_amount_wo_vat":   expected_wo,
#         "expected_vat_amount":      expected_vat,
#         "expected_amount_with_vat": expected_w,
#         "line_sum_subtotal":        Q4(sum_line_sub),
#         "line_sum_discount_wo_vat": Q4(sum_line_disc_wo),
#         "line_effective_wo_vat":    Q4(line_eff_wo),
#         "line_sum_vat":             Q4(sum_line_vat),
#         "line_sum_with_vat":        Q4(sum_line_tot),
#         "_eff_inv_disc_wo":         eff_inv_wo,
#         "_eff_inv_disc_with":       eff_inv_w,
#         "_vat_percent_doc":         vp_doc,
#     }
#     logger.info(f"[compare_lineitems] RESULT: {result}")
#     return result



# def normalize_line_items_if_needed(doc_struct: Dict[str, Any]) -> Dict[str, Any]:
#     """Recompute lines iff doc/lines don't match."""
#     if not should_normalize_lineitems(doc_struct):
#         append_log(doc_struct, "normalize: sums already consistent — skip line recalculation")
#         return doc_struct
#     append_log(doc_struct, "normalize: mismatch detected — revalidating each line")
#     for item in doc_struct.get("line_items") or []:
#         validate_and_calculate_lineitem_amounts(item)
#     return doc_struct


# def global_validate_and_correct(doc_struct: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Global validation → if mismatch stays, replace document totals with effective sums from lines (respecting discounts).
#     amount_wo_vat  <- Σ(subtotal) - invoice_discount_wo_vat
#     vat_amount     <- Σ(vat) - (invoice_discount_wo_vat * vat_percent_doc / 100)
#     amount_with_vat<- Σ(total) - invoice_discount_with_vat
#     """
#     logs: List[str] = []
#     doc_changed = False

#     doc_struct.setdefault("_subtotal_replaced", False)
#     doc_struct.setdefault("_vat_replaced", False)
#     doc_struct.setdefault("_total_replaced", False)

#     line_items = doc_struct.get("line_items") or []
#     if not line_items:
#         logs.append("no line_items to validate")
#         doc_struct["_global_validation_log"] = logs
#         return doc_struct

#     if not should_normalize_lineitems(doc_struct):
#         logs.append("✔ line sums already match document (with invoice discounts). no changes")
#         doc_struct["_global_validation_log"] = (doc_struct.get("_global_validation_log") or []) + logs
#         return doc_struct

#     sum_sub = sum(d(item.get("subtotal"), 4) for item in line_items)
#     sum_vat = sum(d(item.get("vat"), 4) for item in line_items)
#     sum_tot = sum(d(item.get("total"), 4) for item in line_items)

#     inv_wo, inv_w = _derive_missing_doc_discounts(doc_struct, sum_sub, sum_tot)
#     vp_doc = d(doc_struct.get("vat_percent"), 2)

#     eff_doc_wo = Q4(sum_sub - inv_wo)
#     eff_doc_wo = max(eff_doc_wo, Decimal("0.0000"))

#     eff_doc_w = Q4(sum_tot - inv_w)
#     eff_doc_w = max(eff_doc_w, Decimal("0.0000"))

#     eff_vat = sum_vat
#     if vp_doc != 0 and inv_wo != 0:
#         eff_vat = Q4(sum_vat - (inv_wo * vp_doc / Decimal("100")))
#         eff_vat = max(eff_vat, Decimal("0.0000"))
#     else:
#         eff_vat = Q4(sum_vat)

#     doc_sub = d(doc_struct.get("amount_wo_vat"), 4)
#     doc_vat = d(doc_struct.get("vat_amount"), 4)
#     doc_w   = d(doc_struct.get("amount_with_vat"), 4)

#     TOL = Decimal("0.05")

#     diff_sub = Q4(eff_doc_wo - doc_sub)
#     logs.append(f"Subtotal (after doc discount): expected={eff_doc_wo}, doc={doc_sub}, diff={diff_sub}")
#     if abs(diff_sub) > TOL:
#         logs.append("❗amount_wo_vat differs → set Σsub - inv_disc_wo")
#         doc_struct["amount_wo_vat"] = eff_doc_wo
#         doc_struct["_subtotal_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ amount_wo_vat ok")

#     diff_vat = Q4(eff_vat - doc_vat)
#     logs.append(f"VAT (after doc discount): expected={eff_vat}, doc={doc_vat}, diff={diff_vat}")
#     if abs(diff_vat) > TOL:
#         logs.append("❗vat_amount differs → set Σvat − inv_disc_wo * vat%/100")
#         doc_struct["vat_amount"] = eff_vat
#         doc_struct["_vat_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ vat_amount ok")

#     diff_tot = Q4(eff_doc_w - doc_w)
#     logs.append(f"Total (after doc discount): expected={eff_doc_w}, doc={doc_w}, diff={diff_tot}")
#     if abs(diff_tot) > TOL:
#         logs.append("❗amount_with_vat differs → set Σtotal - inv_disc_with")
#         doc_struct["amount_with_vat"] = eff_doc_w
#         doc_struct["_total_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ amount_with_vat ok")

#     if doc_changed:
#         logs.append("document corrected to match line items (invoice discounts respected)")
#     else:
#         logs.append("document already aligned with line items")

#     doc_struct["_doc_totals_replaced_by_lineitems"] = bool(doc_changed)
#     doc_struct["_global_validation_log"] = (doc_struct.get("_global_validation_log") or []) + logs
#     for line in logs:
#         logger.info(f"[global_validator] {line}")
#     return doc_struct


