# utils/data_resolver.py
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple, TypedDict

from django.db.models import Prefetch, QuerySet

# Подстрой путь к приложениям под твой проект
from docscanner_app.models import ScannedDocument, LineItem
from docscanner_app.validators.vat_klas import auto_select_pvm_code


# ---------- Типы/контекст ----------

DirectionCode = Optional[Literal["pirkimas", "pardavimas"]]
ViewMode = Literal["single", "multi"]
Purpose = Literal["preview", "export"]


@dataclass(frozen=True)
class ResolveContext:
    """
    Контекст вычислений для превью/экспорта.
    - user: request.user (нужен для company_* сопоставлений)
    - view_mode: 'single' | 'multi'
        * single -> берём значения из БД, не пересчитываем
        * multi  -> пересчитываем на лету, не записывая в БД
    - purpose: 'preview' | 'export'
        * влияет на спец-правило нормализации PVM ('Keli skirtingi PVM' -> '')
    - overrides: dict[str, 'pirkimas'|'pardavimas'] — переопределения направления по id документа
    - cp_key: ключ выбранного контрагента (используется только в превью при multi)
    """
    user: Any
    view_mode: ViewMode
    purpose: Purpose = "preview"
    overrides: Dict[str, str] = None
    cp_key: Optional[str] = None

    def __post_init__(self):
        object.__setattr__(self, "overrides", self.overrides or {})


# ---------- Вспомогательные нормализаторы ----------

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
    """
    Ожидает одно из {1,2,3,4}; возвращает допустимое значение или None.
    """
    if v is None:
        return None
    try:
        i = int(str(v).strip())
        return i if i in (1, 2, 3, 4) else None
    except Exception:
        return None


def _ps_to_bin(ps: Optional[int]) -> Optional[int]:
    """
    К бинарному виду:
      (1,3) -> 1 (preke)
      (2,4) -> 2 (paslauga)
      None  -> None
    """
    if ps in (1, 3):
        return 1
    if ps in (2, 4):
        return 2
    return None


def _mk_key(id_val: Any, vat_val: Any, name_val: Any) -> str:
    """
    Ключ выбора контрагента:
      если есть id -> "id:<id>"
      иначе VAT (lower) или name (lower)
    """
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


# ---------- Основная логика: направление ----------

def resolve_direction(doc: ScannedDocument, ctx: ResolveContext) -> DirectionCode:
    """
    Возвращает 'pirkimas'/'pardavimas'/None по унифицированным правилам.
    Без fallback к determine_pirkimas_pardavimas. Ничего не пишет в БД.
    """
    # SINGLE — используем сохранённое в БД
    if ctx.view_mode == "single":
        raw = _nz(getattr(doc, "pirkimas_pardavimas", None))
        if raw:
            raw = raw.lower()
        return raw if raw in ("pirkimas", "pardavimas") else None

    # 1) overrides
    ov = (ctx.overrides or {}).get(str(doc.pk))
    if ov in ("pirkimas", "pardavimas"):
        return ov

    # 2) cp_key (для превью — явный выбор пользователя)
    if ctx.cp_key:
        s_key = _mk_key(doc.seller_id, doc.seller_vat_code, doc.seller_name)
        b_key = _mk_key(doc.buyer_id,  doc.buyer_vat_code,  doc.buyer_name)
        if ctx.cp_key == s_key:
            return "pardavimas"
        if ctx.cp_key == b_key:
            return "pirkimas"
        return None  # выбранный контрагент не совпал с реквизитами документа

    # 3) простые правила по наличию сторон
    has_buyer = any((_nz(doc.buyer_id), _nz(doc.buyer_vat_code), _nz(doc.buyer_name)))
    has_seller = any((_nz(doc.seller_id), _nz(doc.seller_vat_code), _nz(doc.seller_name)))

    if not has_buyer and not has_seller:
        return None
    if has_buyer and not has_seller:
        return "pirkimas"
    if has_seller and not has_buyer:
        return "pardavimas"

    # 4) обе стороны есть — сопоставляем пользователя
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

    # 5) иначе неизвестно
    return None


# ---------- Основная логика: PVM ----------

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
    """Нужна ли география для выбора кода (обычно при 0%)."""
    return v == 0.0


def _compute_pvm_detaliai_multi(
    doc: ScannedDocument,
    direction: DirectionCode,
    cp_selected: bool,
    base_vat_percent: Any,
    base_preke_paslauga: Any,
) -> PvmResult:
    """
    Пересчёт PVM для view_mode='multi' при scan_type='detaliai' (есть строки).
    """
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

        # если 0% и нет геоданных/направления — код неопределим
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

    # агрегат по документу
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
    """
    Пересчёт PVM для view_mode='multi' при суммарном уровне (нет строк или scan_type != 'detaliai').
    """
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
        )

    return PvmResult(
        pirkimas_pardavimas_code=direction,
        pirkimas_pardavimas_label=_pp_label(direction, cp_selected),
        pvm_kodas=pvm_doc,
        pvm_kodas_label=_pvm_label(pvm_doc, cp_selected),
        line_items=[],
    )


def compute_pvm(
    doc: ScannedDocument,
    ctx: ResolveContext,
    *,
    base_vat_percent: Any,
    base_preke_paslauga: Any,
    cp_selected: bool,
) -> PvmResult:
    direction = resolve_direction(doc, ctx)

    if ctx.view_mode == "single":
        pvm_doc = _nz(getattr(doc, "pvm_kodas", None))
        # НОВОЕ: применим нормализацию и для экспорта в single
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


    scan_type = (_nz(getattr(doc, "scan_type", None)) or "").lower()
    if scan_type == "detaliai" and LineItem.objects.filter(document=doc).exists():
        result = _compute_pvm_detaliai_multi(
            doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
        )
    else:
        result = _compute_pvm_sumiskai_multi(
            doc, direction, cp_selected, base_vat_percent, base_preke_paslauga
        )

    # Нормализация под цель (export-правило про "Keli skirtingi PVM")
    has_lineitems = bool(result.get("line_items"))
    result["pvm_kodas"] = normalize_for_purpose(
        result.get("pvm_kodas"), has_lineitems=has_lineitems, purpose=ctx.purpose
    )
    result["pvm_kodas_label"] = _pvm_label(result.get("pvm_kodas"), cp_selected)

    # -------- НОВОЕ ПРАВИЛО ДЛЯ PREVIEW БЕЗ ВЫБРАННОГО КОНТРАГЕНТА --------
    if ctx.purpose == "preview" and not cp_selected:
        # На документе — ничего не показываем, только подсказку
        result["pvm_kodas"] = None
        result["pvm_kodas_label"] = "Pasirinkite kontrahentą"
        # По строкам — тоже скрываем коды до выбора контрагента
        if result.get("line_items"):
            li = []
            for item in result["line_items"]:
                li.append({
                    "id": item.get("id"),
                    "pvm_kodas": None,
                    "pvm_kodas_label": "Pasirinkite kontrahentą",
                })
            result["line_items"] = li
    # ----------------------------------------------------------------------

    return result


def normalize_for_purpose(
    pvm_doc: Optional[str], *, has_lineitems: bool, purpose: Purpose
) -> Optional[str]:
    """
    Спец-правило:
      - В preview: ничего не трогаем.
      - В export: если НЕТ line items и pvm_doc == 'Keli skirtingi PVM' → вернуть пустую строку ''.
      - Иначе возвращаем pvm_doc как есть.
    """
    if purpose == "export" and (not has_lineitems) and pvm_doc == "Keli skirtingi PVM":
        return ""
    return pvm_doc


# ---------- Удобные фасады для вьюх/экспортов ----------

def build_preview(
    doc: ScannedDocument,
    user: Any,
    *,
    cp_key: Optional[str],
    view_mode: ViewMode,
    base_vat_percent: Any,
    base_preke_paslauga: Any,
) -> PvmResult:
    """
    Единый фасад для get_document_detail:
    - purpose='preview'
    - cp_selected = bool(cp_key)
    """
    ctx = ResolveContext(
        user=user,
        view_mode=view_mode,
        purpose="preview",
        overrides={},      # превью ориентируется на cp_key; overrides для UI обычно не нужны
        cp_key=cp_key,
    )
    cp_selected = bool(cp_key)
    return compute_pvm(
        doc,
        ctx,
        base_vat_percent=base_vat_percent,
        base_preke_paslauga=base_preke_paslauga,
        cp_selected=cp_selected,
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


def prepare_export_groups(
    documents: Iterable[ScannedDocument],
    *,
    user: Any,
    overrides: Dict[str, str] | None,
    view_mode: ViewMode = "multi",
    base_vat_percent_getter=None,
    base_preke_paslauga_getter=None,
) -> ExportPrepared:
    """
    Фасад для экспортов:
      - purpose='export'
      - по каждому документу вычисляет direction и pvm (с нормализацией под экспорт)
      - раскладывает по группам pirkimai/pardavimai/unknown

    Параметры:
      - base_vat_percent_getter(doc) -> значение "видимого" vat_percent для документа
      - base_preke_paslauga_getter(doc) -> значение "видимого" preke_paslauga для документа

    Если геттеры не переданы — будут взяты прямые поля doc.vat_percent и doc.preke_paslauga.
    """
    ctx = ResolveContext(
        user=user,
        view_mode=view_mode,
        purpose="export",
        overrides=overrides or {},
        cp_key=None,
    )

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
            cp_selected=False,   # в экспорте cp_key не участвует
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
