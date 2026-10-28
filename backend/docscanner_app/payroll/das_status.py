"""
Darbo apmokėjimo sistemos (DAS) būsena: kas pasikeitė po paskutinės patvirtintos versijos,
ar reikia metinės peržiūros, ar sistema dar nepatvirtinta. Naudoja DAS puslapis ir Apžvalga („Ką reikia padaryti“).

Kada reikia naujos DAS versijos (keičiasi tai, kas įrašyta dokumente):
  - nauja pareigybių grupė / grupė panaikinta / pervadinta;
  - pareigos pridėtos į grupę, išimtos ar perkeltos į kitą grupę (pvz. naujas darbuotojas su naujomis pareigomis);
  - pasikeitė grupės algų ribos (pvz. alga nustatyta virš ribos - automatinės ribos prasiplėtė; pakilo MMA);
  - pakeistas pareigybių vertinimas ar aprašymas.
Nereikia: naujas darbuotojas esamose pareigose, alga pakeista grupės ribose.
"""
from datetime import date, timedelta
from decimal import Decimal

DAS_DEADLINE = date(2026, 12, 31)       # visi darbdaviai - patvirtinta DAS (DK 140 str.)
REVIEW_DAYS = 365                      # „peržiūrima ne rečiau kaip kartą per metus“ (DAS VIII sk.)
BIG_EMPLOYER = 50                      # nuo tiek (vidutiniškai) - privalomi DU didinimo kriterijai ir tvarka


def _eur(v):
    if v in (None, ""):
        return "–"
    return f"{Decimal(v):,.0f}".replace(",", " ") + " €"


def _rng(g, a="min", b="max", unit=""):
    lo, hi = g.get(a) or None, g.get(b) or None
    if lo is None and hi is None:
        return "nenustatyta"
    f = (lambda v: _eur(v)) if not unit else (lambda v: f"{Decimal(v):.2f}".replace(".", ",") + unit)
    return f(lo) if lo == hi else f"{f(lo)}–{f(hi)}"


def _diff(old_list, cur_list):
    old = {g["code"]: g for g in old_list or []}
    cur = {g["code"]: g for g in cur_list or []}
    out = []
    where_old = {p: c for c, g in old.items() for p in g.get("positions", [])}
    where_cur = {p: c for c, g in cur.items() for p in g.get("positions", [])}
    moved = {p for p in where_old.keys() & where_cur.keys() if where_old[p] != where_cur[p]}
    for code in sorted(cur.keys() - old.keys()):
        g = cur[code]
        pos = [p for p in g.get("positions", []) if p not in moved]
        out.append(f"Nauja grupė {code} „{g['name']}“" + (f" – {', '.join(pos)}" if pos else ""))
    for code in sorted(old.keys() - cur.keys()):
        out.append(f"Panaikinta grupė {code} „{old[code]['name']}“")
    for p in sorted(moved):
        out.append(f"{p}: perkelta iš {where_old[p]} į {where_cur[p]}")
    for code in sorted(cur.keys() & old.keys()):
        a, b = old[code], cur[code]
        if a.get("name") != b.get("name"):
            out.append(f"{code} pervadinta: „{a.get('name')}“ → „{b.get('name')}“")
        added = sorted(set(b.get("positions", [])) - set(a.get("positions", [])) - moved)
        removed = sorted(set(a.get("positions", [])) - set(b.get("positions", [])) - moved)
        if added:
            out.append(f"{code}: pridėtos pareigos – {', '.join(added)}")
        if removed:
            out.append(f"{code}: išimtos pareigos – {', '.join(removed)}")
        if (str(a.get("min") or ""), str(a.get("max") or "")) != (str(b.get("min") or ""), str(b.get("max") or "")):
            out.append(f"{code}: algų ribos {_rng(a)} → {_rng(b)}")
        if (str(a.get("hmin") or ""), str(a.get("hmax") or "")) != (str(b.get("hmin") or ""), str(b.get("hmax") or "")):
            out.append(f"{code}: valandinio atlygio ribos {_rng(a, 'hmin', 'hmax', ' €/val.')} → {_rng(b, 'hmin', 'hmax', ' €/val.')}")
        if "scores" in a and a.get("scores") != b.get("scores"):
            out.append(f"{code}: pakeistas pareigybių vertinimas ({sum(a['scores'])} → {sum(b['scores'])} balų)")
        if "description" in a and (a.get("description") or "") != (b.get("description") or ""):
            out.append(f"{code}: pakeistas grupės aprašymas")
    return out


def das_changes(company):
    """Žmogui suprantami pakeitimai nuo paskutinės patvirtintos versijos ([] - nėra arba DAS dar nepatvirtinta)."""
    from docscanner_app.models import DasDocument
    from .das_groups import _groups_snapshot
    last = DasDocument.objects.filter(company=company).order_by("-version").first()
    if last is None:
        return []
    out = _diff(last.groups_snapshot, _groups_snapshot(company))
    # vidutinis darbuotojų skaičius pasiekė 50 - DAS reikia papildyti DU didinimo kriterijais ir tvarka (DK 140 str.)
    old = (last.settings or {}).get("headcount") if hasattr(last, "settings") else None
    if old is not None and int(old) < BIG_EMPLOYER:
        from .das_groups import _avg_headcount
        now = _avg_headcount(company, date.today())
        if now >= BIG_EMPLOYER:
            out.append(f"Vidutinis darbuotojų skaičius pasiekė {now} (≥ {BIG_EMPLOYER}) – reikia papildyti DU didinimo tvarka")
    return out


def das_state(company, today=None):
    """{has_staff, approved, version, approved_date, changes, review_due, deadline}"""
    from docscanner_app.models import DasDocument, Employee
    from .das_groups import ensure_mma_minimums
    today = today or date.today()
    has_staff = Employee.objects.filter(company=company, status="active").exists()
    if has_staff:
        ensure_mma_minimums(company)          # pakilus MMA - grupių minimumai pakeliami (tai irgi DAS pakeitimas)
    last = DasDocument.objects.filter(company=company).order_by("-version").first()
    return {
        "has_staff": has_staff,
        "approved": last is not None,
        "version": last.version if last else 0,
        "approved_date": last.approved_date if last else None,
        "changes": das_changes(company) if last else [],
        "review_due": bool(last and today - last.approved_date > timedelta(days=REVIEW_DAYS)),
        "deadline": DAS_DEADLINE,
    }
