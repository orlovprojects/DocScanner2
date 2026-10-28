"""
Darbo apmokėjimo sistema (DAS): pareigybių grupių algų ribos, patikros, dokumento kontekstas ir tvirtinimas.

Importuojama services.py GALE - perrašo to paties pavadinimo senesnes funkcijas
(refresh_auto_ranges, ensure_mma_minimums, groups_check, _groups_snapshot, das_context, approve_das ...).

Automatinės ribos:
  - siūloma: min = mažiausia alga -10 % (žemyn iki 50 €), max = didžiausia +15 % (aukštyn iki 50 €),
    bet ne platesnė nei x1,5 (~±20 %, VDI rekomendacija); jei algos jau skiriasi >= 1,5 karto - be atsargos;
  - minimumas ne mažesnis už MMA; kvalifikuotam darbui - didesnis už MMA (DK 141 str.);
  - valandiniam atlygiui - tas pats, apvalinant iki 0,50 €, žemiausia riba - MVA;
  - kol DAS nepatvirtinta - ribos seka algas; patvirtinus - nekeičiamos, tik plečiamos, jei alga išeina už ribų;
    susiaurinamos tik metinės peržiūros metu (approve_das su recompute).
"""
import json
from datetime import date
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from functools import lru_cache
from pathlib import Path

from django.db import transaction

MARGIN_LO = Decimal("0.90")
MARGIN_HI = Decimal("1.15")
MAX_RATIO = Decimal("1.5")          # platesnė riba - įspėjimas (VDI: ~±15-20 % nuo vidurio)
INVERSION = Decimal("1.25")         # nelogiška: mažiau balų turinčios grupės maksimumas >25 % didesnis ...
INVERSION_SCORE = 3                 # ... ir balų skirtumas ne mažesnis kaip 3 (tik akivaizdūs atvejai)
HOURS_MONTH = Decimal("168")        # mėnesinės algos ir valandinio atlygio palyginimui (vid. darbo valandos per mėn.)
FORM_GAP = Decimal("0.20")          # valandinio atlygio mėnesio atitikmuo skiriasi nuo mėnesinės algos >20 % - įspėjimas
STEP = {"monthly": Decimal("50"), "hourly": Decimal("0.5")}
FIELDS = {"monthly": ("salary_min", "salary_max"), "hourly": ("hourly_min", "hourly_max")}
UNIT = {"monthly": "€", "hourly": "€/val."}
KEYS = ("skills", "qualification", "effort", "responsibility", "conditions")
REASONS_FILE = Path(__file__).parent / "data" / "lpk_reasons.json"

# vertinimo skalė 1-5 (kai profesijų klasifikatoriaus pagrindimas netinka - pvz. balas pakeistas rankiniu būdu)
SCALE5 = {
    "skills": {1: "paprastos, greitai išmokstamos užduotys", 2: "nesudėtingos užduotys, pakanka trumpo apmokymo",
               3: "reikia specialių žinių ir patirties", 4: "sudėtingos užduotys, reikia gilių žinių ir ilgos patirties",
               5: "aukšto lygio ekspertinės žinios ir strateginis mąstymas"},
    "qualification": {1: "specialaus išsilavinimo nereikia", 2: "pakanka trumpo profesinio mokymo",
                      3: "profesinis ar aukštasis koleginis išsilavinimas", 4: "aukštasis išsilavinimas",
                      5: "aukštasis universitetinis išsilavinimas ir papildoma kvalifikacija"},
    "effort": {1: "nedidelis fizinis ir protinis krūvis", 2: "nedidelis krūvis, kartais įtampa",
               3: "vidutinis krūvis, kartais įtemptas darbas", 4: "didelis fizinis, protinis ar emocinis krūvis",
               5: "nuolatinis labai didelis krūvis"},
    "responsibility": {1: "atsakomybė tik už savo darbą", 2: "atsakomybė už savo darbą ir paskirtas priemones",
                       3: "atsakomybė už išteklius, klientus ar kelių žmonių darbą",
                       4: "atsakomybė už svarbius sprendimus, finansus ar komandą",
                       5: "atsakomybė už Įmonės veiklą, finansus ar didelę komandą"},
    "conditions": {1: "įprasta biuro aplinka", 2: "dažniausiai saugi aplinka, retos išvykos",
                   3: "darbas su tam tikra rizika, pamainomis ar kelionėmis",
                   4: "sunkios sąlygos: lauke, naktį ar su rizika", 5: "kenksmingos ar pavojingos sąlygos"},
}


# ============================================================
# Pagalbinės
# ============================================================

def _rnd(v, step, up):
    q = (Decimal(v) / step).to_integral_value(rounding=ROUND_CEILING if up else ROUND_FLOOR)
    return (q * step).quantize(Decimal("0.01"))


def _params():
    from .parameters import get_params
    P = get_params(date.today())
    return Decimal(P.mma), Decimal(P.mva)


def position_pay(position):
    """[(darbuotojas, 'monthly'|'hourly', suma)] - mėnesinė alga perskaičiuota visam etatui arba valandinis įkainis."""
    from docscanner_app.models import ContractTerms
    out = []
    for t in (ContractTerms.objects.filter(position=position, contract__status="active")
              .select_related("contract__employee")):
        latest = t.contract.terms.order_by("-valid_from").first()
        if not (latest and latest.id == t.id and t.workload and t.base_amount):
            continue
        if t.pay_form == "hourly":
            out.append((t.contract.employee, "hourly", Decimal(t.base_amount).quantize(Decimal("0.01"))))
        else:
            out.append((t.contract.employee, "monthly", (Decimal(t.base_amount) / Decimal(t.workload)).quantize(Decimal("0.01"))))
    return out


def group_pay(g):
    return [x for p in g.positions.all() for x in position_pay(p)]


def _group_has_staff(g):
    return bool(group_pay(g))


def unskilled(g):
    """Nekvalifikuotas darbas: kvalifikacija 1 balas arba visos pareigos - LPK 9 grupė."""
    pos = list(g.positions.all())
    return (g.qualification or 0) <= 1 or bool(pos and all((p.lpk_code or "").startswith("9") for p in pos))


def floors(g, mma=None, mva=None):
    """Žemiausia leistina ribos apačia: MMA / MVA; kvalifikuotam darbui - didesnė už jas."""
    if mma is None:
        mma, mva = _params()
    if unskilled(g):
        return {"monthly": mma, "hourly": mva}
    return {"monthly": _rnd(mma + Decimal("0.01"), STEP["monthly"], True),
            "hourly": _rnd(mva + Decimal("0.01"), STEP["hourly"], True)}


def propose(amounts, floor, step):
    """Siūlomos ribos (min, max) pagal algas."""
    lo_s, hi_s = min(amounts), max(amounts)
    if hi_s >= lo_s * MAX_RATIO:                                  # algos jau labai skiriasi - be atsargos
        lo, hi = _rnd(lo_s, step, False), _rnd(hi_s, step, True)
        lo = max(lo, floor)
    else:
        lo = max(_rnd(lo_s * MARGIN_LO, step, False), floor)
        hi = max(_rnd(hi_s, step, True), min(_rnd(hi_s * MARGIN_HI, step, True), _rnd(lo * MAX_RATIO, step, False)))
    return lo, max(hi, lo)


def _widen(cur_lo, cur_hi, amounts, floor, step):
    """Patvirtintos ribos: plečiamos tik tiek, kad algos tilptų (su atsarga, ne platesnė nei x1,5)."""
    lo, hi = cur_lo, cur_hi
    mn, mx = min(amounts), max(amounts)
    if mn < lo:
        lo = max(floor, min(_rnd(mn, step, False), max(floor, _rnd(mn * MARGIN_LO, step, False))))
    if mx > hi:
        hi = max(_rnd(mx, step, True), min(_rnd(mx * MARGIN_HI, step, True), _rnd(lo * MAX_RATIO, step, False)))
    return lo, hi


def proposed_ranges(g, pay=None, fl=None):
    """{'salary_min':..., 'salary_max':..., 'hourly_min':..., 'hourly_max':...} pagal dabartines algas."""
    pay = group_pay(g) if pay is None else pay
    fl = fl or floors(g)
    out = {}
    for form, (fmin, fmax) in FIELDS.items():
        amounts = [a for _, f, a in pay if f == form]
        out[fmin], out[fmax] = propose(amounts, fl[form], STEP[form]) if amounts else (None, None)
    return out


# ============================================================
# Ribų atnaujinimas
# ============================================================

def ensure_mma_minimums(company, on_date=None):
    """Pakilus MMA / MVA: ribų apačia pakeliama iki leistinos (kvalifikuotam darbui - virš MMA)."""
    from docscanner_app.models import PositionGroup
    mma, mva = _params()
    changes = []
    for g in PositionGroup.objects.filter(company=company).prefetch_related("positions"):
        fl = floors(g, mma, mva)
        upd = []
        for form, (fmin, fmax) in FIELDS.items():
            lo, hi = getattr(g, fmin), getattr(g, fmax)
            if lo is not None and lo < fl[form]:
                changes.append({"type": "mma_updated", "group": g.code, "old": str(lo), "new": str(fl[form])})
                setattr(g, fmin, fl[form])
                upd.append(fmin)
                if hi is not None and hi < fl[form]:
                    setattr(g, fmax, fl[form])
                    upd.append(fmax)
        if upd:
            g.save(update_fields=upd)
    return changes


def refresh_auto_ranges(company, recompute=False):
    """
    Automatinės ribos (auto_range). Kol DAS nepatvirtinta (arba recompute - metinė peržiūra) - pagal dabartines algas;
    patvirtinus - tik plečiamos, jei alga išeina už ribų. -> pakeistų grupių kodai
    """
    from docscanner_app.models import DasDocument, PositionGroup
    approved = DasDocument.objects.filter(company=company).exists() and not recompute
    mma, mva = _params()
    changed = []
    for g in PositionGroup.objects.filter(company=company, auto_range=True).prefetch_related("positions"):
        pay = group_pay(g)
        if not pay:
            continue
        fl = floors(g, mma, mva)
        new = {}
        for form, (fmin, fmax) in FIELDS.items():
            amounts = [a for _, f, a in pay if f == form]
            cur_lo, cur_hi = getattr(g, fmin), getattr(g, fmax)
            if not amounts:
                # šios formos darbuotojų nebėra: kol nepatvirtinta - išvaloma; senos versijos (valandiniai buvo
                # perskaičiuoti į mėnesinę algą) - išvaloma pirmą kartą atsiradus valandinėms riboms
                legacy = form == "monthly" and g.hourly_min is None and any(f == "hourly" for _, f, _ in pay)
                new[fmin], new[fmax] = (None, None) if (not approved or legacy) else (cur_lo, cur_hi)
            elif not approved or cur_lo is None or cur_hi is None:
                new[fmin], new[fmax] = propose(amounts, fl[form], STEP[form])
            else:
                new[fmin], new[fmax] = _widen(cur_lo, cur_hi, amounts, fl[form], STEP[form])
        upd = [k for k, v in new.items() if getattr(g, k) != v]
        if upd:
            for k in upd:
                setattr(g, k, new[k])
            g.save(update_fields=upd)
            changed.append(g.code)
    return changed


# ============================================================
# Patikros (DAS puslapis)
# ============================================================

def groups_check(company):
    """Įspėjimai: be grupės, žemiau MMA, MMA kvalifikuotam darbui, už ribų, be ribų, per platu, nelogiška, pasenusi DAS."""
    from docscanner_app.models import Position, PositionGroup
    from .lpk import cluster_for, scores_differ
    issues = ensure_mma_minimums(company)
    refresh_auto_ranges(company)
    mma, mva = _params()
    staffed = []
    for g in PositionGroup.objects.filter(company=company).prefetch_related("positions"):
        gs = {k: getattr(g, k) for k in KEYS}
        odd = [p.name for p in g.positions.all()
               if (c := cluster_for(p.lpk_code)) and c.get("exact") and scores_differ(c, gs)]
        if odd and g.positions.count() > 1:
            issues.append({"type": "mixed_group", "group": g.code, "positions": odd})
        pay = group_pay(g)
        if not pay:
            continue
        staffed.append((g, pay))
        for form, (fmin, fmax) in FIELDS.items():
            amounts = [(e, a) for e, f, a in pay if f == form]
            lo, hi = getattr(g, fmin), getattr(g, fmax)
            if amounts and lo is None and hi is None:
                issues.append({"type": "no_salary", "group": g.code, "unit": UNIT[form]})
            elif lo and hi and hi > lo * MAX_RATIO:
                top = max(amounts, key=lambda x: x[1]) if amounts else None
                issues.append({"type": "wide_range", "group": g.code, "unit": UNIT[form], "min": str(lo), "max": str(hi),
                               "employee": top[0].full_name if top else "", "salary": str(top[1]) if top else ""})
        # ta pati grupė, dvi apmokėjimo formos - ar ribos palyginamos (valandinis x 168 val.)
        if g.salary_min and g.salary_max and g.hourly_min and g.hourly_max:
            mid_m = (g.salary_min + g.salary_max) / 2
            eq_lo, eq_hi = g.hourly_min * HOURS_MONTH, g.hourly_max * HOURS_MONTH
            if abs((eq_lo + eq_hi) / 2 - mid_m) > mid_m * FORM_GAP:
                issues.append({"type": "form_mismatch", "group": g.code, "min": str(g.salary_min), "max": str(g.salary_max),
                               "eq_min": str(eq_lo.quantize(Decimal("1"))), "eq_max": str(eq_hi.quantize(Decimal("1")))})
    # nelogiška: mažiau balų, bet maksimumas gerokai didesnis (mėnesinės algos)
    # (tik akivaizdūs atvejai, kiekvienai grupei - vienas ryškiausias palyginimas)
    ranked = [(g.total_score, g) for g, _ in staffed if g.salary_max]
    for sa, a in ranked:
        worse = [(b.salary_max, sb, b) for sb, b in ranked
                 if sb - sa >= INVERSION_SCORE and a.salary_max > b.salary_max * INVERSION]
        if worse:
            _, sb, b = min(worse, key=lambda x: x[0])
            issues.append({"type": "inversion", "group": a.code, "score": sa, "max": str(a.salary_max),
                           "other": b.code, "other_score": sb, "other_max": str(b.salary_max)})
    for pos in Position.objects.filter(company=company).select_related("group"):
        pay = position_pay(pos)
        if pos.group is None:
            if pay:
                issues.append({"type": "no_group", "position": pos.name, "employees": len(pay)})
            continue
        g = pos.group
        low = unskilled(g)
        for emp, form, a in pay:
            minimum = mma if form == "monthly" else mva
            fmin, fmax = FIELDS[form]
            lo, hi = getattr(g, fmin), getattr(g, fmax)
            base = {"employee": emp.full_name, "position": pos.name, "group": g.code, "salary": str(a), "unit": UNIT[form]}
            if a < minimum:
                issues.append({**base, "type": "below_mma", "mma": str(minimum)})
                continue
            if not low and a - minimum < Decimal("0.5"):
                issues.append({**base, "type": "mma_qualified"})
            if (lo and a < lo) or (hi and a > hi):
                issues.append({**base, "type": "out_of_range", "min": str(lo or ""), "max": str(hi or "")})
    from .das_status import das_changes
    changes = das_changes(company)
    if changes:
        issues.append({"type": "das_outdated", "changes": changes})
    return issues


# ============================================================
# DAS dokumentas
# ============================================================

def _groups_snapshot(company):
    """Grupės, kurios patenka į DAS (tik su darbuotojais) - pakeitimų palyginimui."""
    from docscanner_app.models import PositionGroup
    out = []
    for g in PositionGroup.objects.filter(company=company).prefetch_related("positions"):
        if not _group_has_staff(g):
            continue
        out.append({"code": g.code, "name": g.name, "positions": sorted(p.name for p in g.positions.all()),
                    "min": str(g.salary_min or ""), "max": str(g.salary_max or ""),
                    "hmin": str(g.hourly_min or ""), "hmax": str(g.hourly_max or ""),
                    "scores": [g.skills, g.qualification, g.effort, g.responsibility, g.conditions],
                    "description": g.description})
    return sorted(out, key=lambda x: x["code"])


@lru_cache(maxsize=1)
def _reasons_data():
    try:
        with open(REASONS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def group_reasons(g):
    """
    Kiekvieno kriterijaus pagrindimas: iš profesijų klasifikatoriaus (jei grupėje yra pareigos su tokiu pačiu
    balu), kitaip - pagal vertinimo skalę (rankinė grupė, sujungtos grupės, pakeistas balas).
    """
    from .lpk import cluster_for
    data = _reasons_data()
    clusters = [c for p in g.positions.all() if (c := cluster_for(p.lpk_code))]
    out = {}
    for k in KEYS:
        v = int(getattr(g, k) or 3)
        phrases = []
        for c in clusters:
            ph = (data.get(c.get("key")) or {}).get(k)
            if ph and int(c.get(k, 0)) == v and ph not in phrases:
                phrases.append(ph)
        out[k] = "; ".join(phrases[:2]) if phrases else SCALE5[k][max(1, min(5, v))]
    return out


def _avg_headcount(company, today):
    """Vidutinis darbuotojų skaičius per paskutinius 12 mėn. (kiekvieno mėnesio 15 d.), nuo pirmosios sutarties."""
    from docscanner_app.models import Employee
    spans = []
    for e in Employee.objects.filter(company=company).prefetch_related("contracts"):
        for c in e.contracts.all():
            if c.status == "draft":
                continue
            end = getattr(c, "termination_date", None) or getattr(c, "end_date", None)
            spans.append((e.id, c.start_date, end))
    if not spans:
        return 0
    first = min(s for _, s, _ in spans)
    counts = []
    y, m = today.year, today.month
    for _ in range(12):
        d = date(y, m, 15)
        if d < first.replace(day=1):
            break
        counts.append(len({eid for eid, s, end in spans if s <= d and (end is None or end >= d)}))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return round(sum(counts) / len(counts)) if counts else 0


def _settings(st):
    st = dict(st or {})
    try:
        pct = max(0, min(100, int(st.get("bonus_max_pct") or 20)))
    except (TypeError, ValueError):
        pct = 20

    def d(v):
        try:
            return date.fromisoformat(str(v)[:10]) if v else None
        except ValueError:
            return None
    return {
        "order_no": str(st.get("order_no") or "")[:30],
        "bonus": st.get("bonus") if st.get("bonus") in ("discretionary", "results", "none") else "discretionary",
        "bonus_max_pct": pct,
        "bonus_period": st.get("bonus_period") if st.get("bonus_period") in ("month", "quarter", "year") else "quarter",
        "prev_ext_date": d(st.get("prev_ext_date")) if st.get("prev_ext") else None,
        "prev_ext_no": str(st.get("prev_ext_no") or "")[:30] if st.get("prev_ext") else "",
        "reps_date": d(st.get("reps_date")) if st.get("reps") else None,
        "reps": bool(st.get("reps")),
        "recompute": bool(st.get("recompute")),
    }


def das_context(company, approved_date, manager_name="", manager_title="", city="", settings=None):
    from docscanner_app.models import DasDocument, Employee, PositionGroup
    from .das import DasContext, DasGroup
    st = _settings(settings)
    mma, mva = _params()
    groups, forms_all = [], set()
    for g in PositionGroup.objects.filter(company=company).prefetch_related("positions"):
        pay = group_pay(g)
        if not pay:                                               # grupė be darbuotojų į dokumentą neįtraukiama
            continue
        rng = {k: getattr(g, k) for f in FIELDS.values() for k in f}
        if st["recompute"] and g.auto_range:                      # metinė peržiūra - ribos pagal dabartines algas
            rng = proposed_ranges(g, pay, floors(g, mma, mva))
        forms = sorted({f for _, f, _ in pay})
        forms_all.update(forms)
        groups.append(DasGroup(
            code=g.code, name=g.name, positions=[p.name for p in g.positions.all()],
            scores={k: getattr(g, k) for k in KEYS},
            salary_min=rng["salary_min"], salary_max=rng["salary_max"],
            hourly_min=rng["hourly_min"], hourly_max=rng["hourly_max"],
            description=g.description, forms=forms, reasons=group_reasons(g),
        ))
    name = getattr(company, "name", "") or getattr(company, "company_name", "") or str(company)
    code = getattr(company, "company_code", "") or getattr(company, "code", "") or ""
    last = DasDocument.objects.filter(company=company).order_by("-version").first()
    employees = []
    for e in Employee.objects.filter(company=company, status="active").order_by("last_name", "first_name"):
        c = e.contracts.filter(status="active").order_by("-start_date").first()
        t = c.terms.order_by("-valid_from").select_related("position").first() if c else None
        employees.append((e.full_name, t.position.name if t and t.position_id else ""))
    return DasContext(
        name, code, manager_name, approved_date, groups, city=city, manager_title=manager_title or "Direktorius",
        version=(last.version + 1) if last else 1, previous_date=last.approved_date if last else None,
        headcount=_avg_headcount(company, approved_date) or len(employees), employees=employees,
        hourly="hourly" in forms_all, monthly="monthly" in forms_all,
        order_no=st["order_no"], bonus=st["bonus"], bonus_max_pct=st["bonus_max_pct"], bonus_period=st["bonus_period"],
        prev_ext_date=st["prev_ext_date"], prev_ext_no=st["prev_ext_no"], reps_date=st["reps_date"], reps=st["reps"],
    )


@transaction.atomic
def approve_das(company, approved_date, manager_name="", manager_title="", city="", settings=None):
    from docscanner_app.models import DasDocument
    from .das import render_das_html
    from .das_status import das_changes
    st = dict(settings or {})
    if st.get("recompute"):
        refresh_auto_ranges(company, recompute=True)               # metinė peržiūra: ribos pagal dabartines algas
        st["recompute"] = False
    ctx = das_context(company, approved_date, manager_name, manager_title, city, st)
    if not ctx.groups:
        raise ValueError("Pirmiausia sukurkite pareigybių grupes")
    missing = [g.code for g in ctx.groups
               if ("monthly" in g.forms and g.salary_min is None and g.salary_max is None)
               or ("hourly" in g.forms and g.hourly_min is None and g.hourly_max is None)]
    if missing:
        raise ValueError(f"Nenurodytos algos ribos: {', '.join(missing)} - atidarykite grupę ir nurodykite")
    last = DasDocument.objects.filter(company=company).order_by("-version").first()
    if last and approved_date < last.approved_date:
        raise ValueError(f"Data negali būti ankstesnė nei v{last.version} patvirtinimo ({last.approved_date:%Y-%m-%d})")
    return DasDocument.objects.create(
        company=company, version=ctx.version, approved_date=approved_date,
        manager_name=manager_name, manager_title=ctx.manager_title, city=city, html=render_das_html(ctx),
        groups_snapshot=_groups_snapshot(company), changes=das_changes(company) if last else [],
        settings={**{k: v for k, v in (settings or {}).items() if k != "recompute"},
                  "headcount": ctx.headcount},                     # vidutinis darbuotojų sk. - 50+ slenksčiui stebėti
    )
