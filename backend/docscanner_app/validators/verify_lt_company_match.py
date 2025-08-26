from docscanner_app.models import Company
from .company_name_normalizer import normalize_company_name
import re, time, logging
from difflib import SequenceMatcher

logger = logging.getLogger("docscanner_app")

VAT_CLEAN_RE = re.compile(r"[^A-Za-z0-9]+")

def ensure_lt_prefix(vat_code):
    vat_code = (vat_code or "").strip()
    if vat_code and not vat_code.upper().startswith("LT"):
        return f"LT{vat_code}"
    return vat_code

def shorten_legal_form(name):
    substitutions = [
        ("Uždaroji akcinė bendrovė", "UAB"),
        ("Akcinė bendrovė", "AB"),
        ("Mažoji bendrija", "MB"),
        ("Viešoji įstaiga", "VšĮ"),
        ("Individuali įmonė", "IĮ"),
        ("Tikroji ūkinė bendrija", "TŪB"),
        ("Kooperatinė bendrovė", "KB"),
        ("Žemės ūkio bendrovė", "ŽŪB"),
    ]
    s = name or ""
    for long, short in substitutions:
        s = re.sub(rf"^{long}\s+", f"{short} ", s, flags=re.IGNORECASE)
        s = re.sub(rf"\s+{long}$", f" {short}", s, flags=re.IGNORECASE)
        s = re.sub(rf"\s*{long}\s*", f" {short} ", s, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", s).strip()

# ───────────────────────── helpers ─────────────────────────

def _clean_vat(v: str) -> str:
    v = (v or "").strip().upper()
    return VAT_CLEAN_RE.sub("", v)

def _vat_variants(v: str, country_iso: str | None) -> list[str]:
    v = _clean_vat(v)
    if not v:
        return []
    out = {v}
    if len(v) > 2 and v[:2].isalpha():
        out.add(v[2:])  # без префикса
    if (country_iso or "").upper() == "LT":
        core = v[2:] if (len(v) > 2 and v[:2].isalpha()) else v
        out.add("LT" + core)
        out.add(core)
    return list(out)

def _seq_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio() * 100.0

# ───────────────────────── core ─────────────────────────

def update_seller_buyer_info_from_companies(scanned_doc):
    """
    Быстрый и «неубиваемый» матчинг покупателя/продавца с Company.
    Ограничение по времени: ~1.5s на всю функцию (fuzzy <= 0.7s).
    """
    T_TOTAL_BUDGET = 20     # сек на весь вызов
    T_FUZZY_BUDGET = 10     # сек максимум на fuzzy
    start = time.perf_counter()

    def time_left(limit=T_TOTAL_BUDGET):
        return max(0.0, limit - (time.perf_counter() - start))

    def fuzzy_allowed():
        return time_left() > 0.2  # есть смысл, если есть хотя бы 200мс

    changed = False

    def _match_side(side: str, country_iso: str, company_id: str, vat_code: str, name: str) -> bool:
        nonlocal changed
        sideU = side.upper()
        t_side = time.perf_counter()

        try:
            # 0) Быстрые выходы
            if time_left() <= 0:
                logger.warning(f"[COMP] {sideU} budget exceeded before start; skipping")
                return False

            # 1) VAT (все варианты)
            comp = None
            for v in _vat_variants(vat_code, country_iso):
                if time_left() <= 0:
                    logger.warning(f"[COMP] {sideU} budget exceeded during VAT loop; skipping")
                    return False
                c = Company.objects.filter(pvm_kodas__iexact=v).only("id","pavadinimas","im_kodas","pvm_kodas").first()
                if c:
                    comp = c
                    logger.info(f"[COMP] {sideU} matched by VAT={v}")
                    break

            # 2) im_kodas
            if not comp and company_id:
                c = Company.objects.filter(im_kodas__iexact=company_id.strip()).only("id","pavadinimas","im_kodas","pvm_kodas").first()
                if c:
                    comp = c
                    logger.info(f"[COMP] {sideU} matched by im_kodas")

            # 3) Имя (fuzzy), если есть время и нормальный префикс
            if not comp and name and fuzzy_allowed():
                norm = normalize_company_name(name)
                prefix = (norm.split(" ")[0] if norm else "")[:6]
                if prefix and len(prefix) >= 3:
                    # узкий подселект + лимит кандидатов
                    t_fz = time.perf_counter()
                    limit = 120
                    qs = Company.objects.filter(pavadinimas__icontains=prefix).only("id","pavadinimas","im_kodas","pvm_kodas")[:limit]
                    candidates = list(qs)
                    # если слишком долго читали — выходим
                    if (time.perf_counter() - t_fz) > T_FUZZY_BUDGET:
                        logger.warning(f"[COMP] {sideU} fuzzy prefetch exceeded budget; skipping fuzzy")
                    else:
                        best, best_score = None, -1.0
                        for c in candidates:
                            if (time.perf_counter() - t_fz) > T_FUZZY_BUDGET:
                                logger.warning(f"[COMP] {sideU} fuzzy loop exceeded budget; cut")
                                break
                            s = _seq_ratio(norm, normalize_company_name(c.pavadinimas))
                            if s > best_score:
                                best, best_score = c, s
                        if best and best_score >= 92.0:
                            comp = best
                            logger.info(f"[COMP] {sideU} matched by NAME fuzzy score={best_score:.1f}")
                else:
                    logger.info(f"[COMP] {sideU} fuzzy skipped (short prefix)")

            # 4) Применить
            if comp:
                before = (
                    getattr(scanned_doc, f"{side}_id", None),
                    getattr(scanned_doc, f"{side}_name", None),
                    getattr(scanned_doc, f"{side}_vat_code", None),
                )
                # overwrite (как у тебя было)
                if side == "buyer":
                    scanned_doc.buyer_id = comp.im_kodas or scanned_doc.buyer_id
                    scanned_doc.buyer_name = shorten_legal_form(comp.pavadinimas) or scanned_doc.buyer_name
                    scanned_doc.buyer_vat_code = ensure_lt_prefix(comp.pvm_kodas) or scanned_doc.buyer_vat_code
                else:
                    scanned_doc.seller_id = comp.im_kodas or scanned_doc.seller_id
                    scanned_doc.seller_name = shorten_legal_form(comp.pavadinimas) or scanned_doc.seller_name
                    scanned_doc.seller_vat_code = ensure_lt_prefix(comp.pvm_kodas) or scanned_doc.seller_vat_code
                after = (
                    getattr(scanned_doc, f"{side}_id", None),
                    getattr(scanned_doc, f"{side}_name", None),
                    getattr(scanned_doc, f"{side}_vat_code", None),
                )
                if before != after:
                    changed = True
            else:
                logger.info(f"[COMP] {sideU} no match")

        except Exception as e:
            logger.exception(f"[COMP] {sideU} match error: %s", e)

        finally:
            logger.info(f"[COMP-TIME] {sideU} took {time.perf_counter() - t_side:.2f}s (left {time_left():.2f}s)")
        return changed

    # BUYER: только пустая страна или LT
    buyer_country = (scanned_doc.buyer_country_iso or "").strip().upper()
    if (not buyer_country) or buyer_country == "LT":
        _match_side(
            "buyer",
            buyer_country,
            (scanned_doc.buyer_id or ""),
            (scanned_doc.buyer_vat_code or ""),
            (scanned_doc.buyer_name or "")
        )

    # SELLER: только пустая страна или LT
    seller_country = (scanned_doc.seller_country_iso or "").strip().upper()
    if (not seller_country) or seller_country == "LT":
        _match_side(
            "seller",
            seller_country,
            (scanned_doc.seller_id or ""),
            (scanned_doc.seller_vat_code or ""),
            (scanned_doc.seller_name or "")
        )

    if changed:
        fields = ["buyer_id","buyer_name","buyer_vat_code","seller_id","seller_name","seller_vat_code"]
        scanned_doc.save(update_fields=[f for f in fields if hasattr(scanned_doc, f)])

    logger.info(f"[COMP-TIME] TOTAL company match took {time.perf_counter() - start:.2f}s")
    return scanned_doc























# from docscanner_app.models import Company
# from .company_name_normalizer import normalize_company_name
# import re


# def ensure_lt_prefix(vat_code):
#     vat_code = (vat_code or "").strip()
#     if vat_code and not vat_code.upper().startswith("LT"):
#         return f"LT{vat_code}"
#     return vat_code


# def shorten_legal_form(name):
#     # Уменьшаем юридическую форму в начале или в конце строки
#     substitutions = [
#         ("Uždaroji akcinė bendrovė", "UAB"),
#         ("Akcinė bendrovė", "AB"),
#         ("Mažoji bendrija", "MB"),
#         ("Viešoji įstaiga", "VšĮ"),
#         ("Individuali įmonė", "IĮ"),
#         ("Tikroji ūkinė bendrija", "TŪB"),
#         ("Kooperatinė bendrovė", "KB"),
#         ("Žemės ūkio bendrovė", "ŽŪB"),
#     ]
#     s = name
#     for long, short in substitutions:
#         # В начале строки
#         s = re.sub(rf"^{long}\s+", f"{short} ", s, flags=re.IGNORECASE)
#         # В конце строки
#         s = re.sub(rf"\s+{long}$", f" {short}", s, flags=re.IGNORECASE)
#         # Внутри
#         s = re.sub(rf"\s*{long}\s*", f" {short} ", s, flags=re.IGNORECASE)
#     # Убираем двойные пробелы
#     s = re.sub(r'\s+', ' ', s)
#     return s.strip()


# def update_seller_buyer_info_from_companies(scanned_doc):
#     # === BUYER ===
#     buyer_country = (scanned_doc.buyer_country_iso or "").strip().upper()
#     if not buyer_country or buyer_country == "LT":
#         buyer_fields = {
#             'id': scanned_doc.buyer_id,
#             'vat': scanned_doc.buyer_vat_code,
#             'name': scanned_doc.buyer_name
#         }
#         buyer_company = None

#         # 1. По company_code
#         if buyer_fields['id']:
#             buyer_company = Company.objects.filter(im_kodas__iexact=buyer_fields['id'].strip()).first()
#         # 2. По vat_code
#         if not buyer_company and buyer_fields['vat']:
#             buyer_company = Company.objects.filter(pvm_kodas__iexact=buyer_fields['vat'].strip()).first()
#         # 3. По company_name (нормализация)
#         if not buyer_company and buyer_fields['name']:
#             norm_name = normalize_company_name(buyer_fields['name'])
#             candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
#             for comp in candidates:
#                 if normalize_company_name(comp.pavadinimas) == norm_name:
#                     buyer_company = comp
#                     break

#         # Если нашли — проставляем всё из Company
#         if buyer_company:
#             scanned_doc.buyer_id = buyer_company.im_kodas
#             scanned_doc.buyer_name = shorten_legal_form(buyer_company.pavadinimas)
#             scanned_doc.buyer_vat_code = ensure_lt_prefix(buyer_company.pvm_kodas)
#         # Если есть хотя бы одно, но не всё — заполняем отсутствующее
#         elif any(buyer_fields.values()):
#             comp = None
#             if buyer_fields['id']:
#                 comp = Company.objects.filter(im_kodas__iexact=buyer_fields['id'].strip()).first()
#             elif buyer_fields['vat']:
#                 comp = Company.objects.filter(pvm_kodas__iexact=buyer_fields['vat'].strip()).first()
#             elif buyer_fields['name']:
#                 norm_name = normalize_company_name(buyer_fields['name'])
#                 candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
#                 for c in candidates:
#                     if normalize_company_name(c.pavadinimas) == norm_name:
#                         comp = c
#                         break
#             if comp:
#                 if not scanned_doc.buyer_id:
#                     scanned_doc.buyer_id = comp.im_kodas
#                 if not scanned_doc.buyer_name:
#                     scanned_doc.buyer_name = shorten_legal_form(comp.pavadinimas)
#                 if not scanned_doc.buyer_vat_code:
#                     scanned_doc.buyer_vat_code = ensure_lt_prefix(comp.pvm_kodas)

#     # === SELLER ===
#     seller_country = (scanned_doc.seller_country_iso or "").strip().upper()
#     if not seller_country or seller_country == "LT":
#         seller_fields = {
#             'id': scanned_doc.seller_id,
#             'vat': scanned_doc.seller_vat_code,
#             'name': scanned_doc.seller_name
#         }
#         seller_company = None

#         if seller_fields['id']:
#             seller_company = Company.objects.filter(im_kodas__iexact=seller_fields['id'].strip()).first()
#         if not seller_company and seller_fields['vat']:
#             seller_company = Company.objects.filter(pvm_kodas__iexact=seller_fields['vat'].strip()).first()
#         if not seller_company and seller_fields['name']:
#             norm_name = normalize_company_name(seller_fields['name'])
#             candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
#             for comp in candidates:
#                 if normalize_company_name(comp.pavadinimas) == norm_name:
#                     seller_company = comp
#                     break

#         if seller_company:
#             scanned_doc.seller_id = seller_company.im_kodas
#             scanned_doc.seller_name = shorten_legal_form(seller_company.pavadinimas)
#             scanned_doc.seller_vat_code = ensure_lt_prefix(seller_company.pvm_kodas)
#         elif any(seller_fields.values()):
#             comp = None
#             if seller_fields['id']:
#                 comp = Company.objects.filter(im_kodas__iexact=seller_fields['id'].strip()).first()
#             elif seller_fields['vat']:
#                 comp = Company.objects.filter(pvm_kodas__iexact=seller_fields['vat'].strip()).first()
#             elif seller_fields['name']:
#                 norm_name = normalize_company_name(seller_fields['name'])
#                 candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
#                 for c in candidates:
#                     if normalize_company_name(c.pavadinimas) == norm_name:
#                         comp = c
#                         break
#             if comp:
#                 if not scanned_doc.seller_id:
#                     scanned_doc.seller_id = comp.im_kodas
#                 if not scanned_doc.seller_name:
#                     scanned_doc.seller_name = shorten_legal_form(comp.pavadinimas)
#                 if not scanned_doc.seller_vat_code:
#                     scanned_doc.seller_vat_code = ensure_lt_prefix(comp.pvm_kodas)

#     return scanned_doc
