"""
Grafiko taisymas, kai po sudarymo pasikeitė duomenys (nauji / atšaukti nebuvimai, pakeisti ankstesni
apskaitinio laikotarpio mėnesiai):

  record_inputs(roster)   - įsimenama, nuo kokių duomenų grafikas sudarytas (sudarant, paskelbiant, pataisius);
  stale_info(roster)      - kas pasikeitė nuo to laiko (baneris „Grafikas nebeatitinka duomenų“);
  repair_preview(...)     - minimaliai pakeistas grafikas šiam ir kitiems laikotarpio mėnesiams (CP-SAT su bauda už
                            kiekvieną pakeitimą ir paliestą darbuotoją). TIK peržiūra - DB lieka nepakeista;
  repair_apply(...)       - pasirinktų mėnesių pakeitimai. Paskelbtas grafikas atrakinamas (priežastis - nebuvimas),
                            darbuotojai informuojami tik paspaudus „Paskelbti pakeitimus“;
  publish_preview(roster) - kam ir kas bus pranešta paskelbus.

Taisyklės:
  * praėjusios dienos ir šiandiena nekeičiamos - tik nuo rytojaus;
  * paskelbtame mėnesyje pamainos nebuvimo dienomis lieka perbrauktos (pagal jas mažinama norma) - netrinamos;
  * paskelbtame mėnesyje režimas pasirenkamas: „fill“ - tik užpildyti trūkstamas pamainas,
    „balance“ - ir išlyginti valandas; juodraščiuose - visada „balance“;
  * užrakintos pamainos ir neaktyvių tipų pamainos nekeičiamos.
"""
import hashlib
import json
import logging
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("docscanner_app")
ZERO = Decimal("0")

# Svoriai (solver.py: plano trūkumas - 1 000 000 už žmogų, valanda virš / po tikslo - 3 000 / 2 000)
WEIGHTS = {
    "fill": (200_000, 100_000),     # keičiama tik tam, kad būtų užpildytos spragos (valandų lyginimas „nepasiteisina“)
    "balance": (8_000, 8_000),      # pridėti 12 val. pamainą trūkstančiam (-24 000) jau apsimoka
}
SKIP_KINDS = ("parent_day", "truancy", "downtime")    # pamaina lieka / pažymima po fakto - grafiko taisyti nereikia


def _ym(y, m):
    return f"{y}-{m:02d}"


def _period_before(company, y, m):
    from .services import period_months
    return [(py, pm) for py, pm in period_months(company, y, m) if (py, pm) < (y, m)]


def _relevant_absences(company, first, last):
    """Suminės apskaitos darbuotojų nebuvimai, dėl kurių keičiasi grafikas: [[darbuotojas, rūšis, pradžia, pabaiga]]."""
    from docscanner_app.models import AbsenceEvent
    from .services import summed_employees
    ids = [e.id for e, _, _ in summed_employees(company, first, last)]
    rows = AbsenceEvent.objects.filter(employee__company=company, employee_id__in=ids, status="approved",
                                       start_date__lte=last, end_date__gte=first).exclude(kind__in=SKIP_KINDS)
    return sorted([e.employee_id, e.kind, e.start_date.isoformat(), e.end_date.isoformat()] for e in rows)


def _month_hours(r):
    """{darbuotojas: val.} - paskelbta versija (ji įskaitoma laikotarpiui), juodraštyje - esamos pamainos."""
    from .services import _from_item, _shift_obj
    out = defaultdict(lambda: ZERO)
    if r.version >= 1:
        for it in r.published_snapshot or []:
            out[int(it["employee_id"])] += _from_item(it).hours
    else:
        for s in r.shifts.select_related("shift_type"):
            out[s.employee_id] += _shift_obj(s).hours
    return {str(k): str(v.quantize(Decimal("0.01"))) for k, v in out.items()}


def _inputs(roster):
    from docscanner_app.models import Roster
    from .services import _bounds
    first, last = _bounds(roster.year, roster.month)
    before = _period_before(roster.company, roster.year, roster.month)
    pstart = _bounds(*before[0])[0] if before else first
    prev = {}
    for r in Roster.objects.filter(company=roster.company):
        if (r.year, r.month) in before:
            prev[_ym(r.year, r.month)] = _month_hours(r)
    return {"abs": _relevant_absences(roster.company, pstart, last), "prev": prev}


def record_inputs(roster, save=True):
    roster.summary = dict(roster.summary or {}, inputs=dict(_inputs(roster), at=timezone.now().isoformat()))
    if save:
        roster.save(update_fields=["summary", "updated_at"])


def _kind_labels():
    from docscanner_app.models import AbsenceEvent
    try:
        return dict(AbsenceEvent._meta.get_field("kind").choices)
    except Exception:                                       # noqa: BLE001
        return {}


def stale_info(roster, employees=None):
    """
    None - grafikas atitinka duomenis. Kitaip:
    {since, new: [...], removed: [...], changed: [...], earlier: [{ym, names}]} - kas pasikeitė nuo sudarymo.
    """
    from docscanner_app.models import Employee
    from .services import _bounds
    old = (roster.summary or {}).get("inputs")
    if not old or not roster.shifts.exists():
        return None
    first, last = _bounds(roster.year, roster.month)
    if last <= timezone.localdate():                         # mėnuo baigiasi - taisyti nebėra ko
        return None
    cur = _inputs(roster)
    today = timezone.localdate().isoformat()
    own = lambda a: a[2] <= last.isoformat() and a[3] >= first.isoformat()          # noqa: E731
    future = lambda a: a[3] > today                         # noqa: E731  praėjusių dienų grafikas nebekeičiamas
    a_old = {tuple(x) for x in old.get("abs") or []}
    a_new = {tuple(x) for x in cur["abs"]}
    added, gone = sorted(a_new - a_old), sorted(a_old - a_new)
    names = {x["id"]: x["name"] for x in (employees or [])}
    need = ({x[0] for x in added + gone} | {int(k) for ym in cur["prev"] for k in cur["prev"][ym]}) - set(names)
    if need:
        names.update({e.id: e.full_name for e in Employee.objects.filter(id__in=need)})
    labels = _kind_labels()

    def item(a):
        return {"employee_id": a[0], "name": names.get(a[0], str(a[0])), "kind": a[1], "label": labels.get(a[1], a[1]),
                "start": max(a[2], first.isoformat()), "end": min(a[3], last.isoformat())}

    new, removed, changed = [], [], []
    gone_own = [g for g in gone if own(g) and future(g)]
    for a in [x for x in added if own(x) and future(x)]:
        twin = next((g for g in gone_own if g[0] == a[0] and g[1] == a[1] and g[2] <= a[3] and a[2] <= g[3]), None)
        if twin:                                             # tas pats nebuvimas pratęstas / sutrumpintas
            gone_own.remove(twin)
            changed.append(dict(item(a), old_start=max(twin[2], first.isoformat()), old_end=min(twin[3], last.isoformat())))
        else:
            new.append(item(a))
    removed = [item(g) for g in gone_own]

    earlier = defaultdict(set)                               # ankstesni laikotarpio mėnesiai
    for a in [x for x in added + gone if not own(x)]:
        earlier[a[3][:7]].add(a[0])                         # visas nebuvimas ankstesniame mėnesyje
    for ym, hours in cur["prev"].items():
        was = (old.get("prev") or {}).get(ym, {})
        for k in set(hours) | set(was):
            if Decimal(hours.get(k, "0")) != Decimal(was.get(k, "0")):
                earlier[ym].add(int(k))
    earlier_list = [{"ym": ym, "names": sorted(names.get(e, str(e)) for e in ids)}
                    for ym, ids in sorted(earlier.items()) if ym < _ym(roster.year, roster.month)]
    if not (new or removed or changed or earlier_list):
        return None
    return {"since": old.get("at"), "new": new, "removed": removed, "changed": changed, "earlier": earlier_list}


def roster_stale_flag(company, y, m):
    """Ar mėnesio grafikas nebeatitinka duomenų (Faktas, mėnesių žymės)."""
    from docscanner_app.models import Roster
    r = Roster.objects.filter(company=company, year=y, month=m).first()
    return bool(r and stale_info(r))


def affected_rosters(company, months_ahead=6):
    """
    Po prašymo patvirtinimo / S15 importo / komandiruotės: kurių mėnesių grafikai nebeatitinka duomenų.
    -> [{"ym", "published"}] (tik dar nesibaigę mėnesiai su pamainomis).
    """
    from docscanner_app.models import Roster
    today = timezone.localdate()
    lo = (today.year, today.month)
    hi_m = today.month + months_ahead
    hi = (today.year + (hi_m - 1) // 12, (hi_m - 1) % 12 + 1)
    out = []
    for r in Roster.objects.filter(company=company).order_by("year", "month"):
        if not (lo <= (r.year, r.month) <= hi):
            continue
        if stale_info(r):
            out.append({"ym": _ym(r.year, r.month), "published": r.version >= 1})
    return out


def repair_view(roster):
    return (roster.summary or {}).get("repair")


# ============================================================
# Peržiūra
# ============================================================

def _base(r):
    """Grafiko būsenos parašas - pritaikant tikrinama, ar po peržiūros niekas nepakeitė pamainų."""
    rows = sorted([s[0], s[1].isoformat(), s[2]] for s in r.shifts.values_list("employee_id", "date", "shift_type_id"))
    return hashlib.sha1(json.dumps(rows).encode()).hexdigest()


def _abs_sig(company, y, m):
    from .services import _bounds, period_months
    months = period_months(company, y, m)
    a, b = _bounds(*months[0])[0], _bounds(*months[-1])[1]
    return hashlib.sha1(json.dumps(_relevant_absences(company, a, b)).encode()).hexdigest()


def _chain(roster, start):
    """Taisomi mėnesiai: šis ir vėlesni to paties laikotarpio, kurie dar nesibaigė ir turi pamainų."""
    from docscanner_app.models import Roster
    from .services import _bounds, period_months
    out = []
    for py, pm in period_months(roster.company, roster.year, roster.month):
        if (py, pm) < (roster.year, roster.month) or _bounds(py, pm)[1] < start:
            continue
        r = Roster.objects.filter(company=roster.company, year=py, month=pm).first()
        if r and r.shifts.exists():
            out.append(r)
    return out


def _write(r, changes):
    """Pakeitimai DB: [{employee_id, date, old, new}] (new=None - pamaina pašalinama)."""
    from docscanner_app.models import RosterShift, ShiftType
    from .services import _aware
    from .shifts import make_shift
    types = {s.id: s for s in ShiftType.objects.filter(company=r.company)}
    objs = []
    for c in changes:
        d = date.fromisoformat(c["date"]) if isinstance(c["date"], str) else c["date"]
        r.shifts.filter(employee_id=c["employee_id"], date=d).delete()
        st = types.get(c["new"]) if c["new"] else None
        if st:
            sh = make_shift(c["employee_id"], d, st.start_time, st.end_time, st.break_minutes, st.id,
                            getattr(st, "break_start", None), getattr(st, "break_paid", False))
            objs.append(RosterShift(roster=r, employee_id=c["employee_id"], date=d, shift_type=st, start=_aware(sh.start),
                                    end=_aware(sh.end), break_minutes=st.break_minutes, source="repair"))
    RosterShift.objects.bulk_create(objs)


def _repair_month(r, mode, start_min, seconds):
    from docscanner_app.models import RosterShift, ShiftType
    from .services import _bounds, _shift_obj, build_problem
    first, last = _bounds(r.year, r.month)
    start = max(first, start_min)
    published = r.version >= 1
    active = set(ShiftType.objects.filter(company=r.company, is_active=True).values_list("id", flat=True))
    cur = list(r.shifts.select_related("shift_type"))
    obj = {(s.employee_id, s.date): _shift_obj(s) for s in cur}
    cells = {(s.employee_id, s.date): s.shift_type_id for s in cur}
    w_change, w_touch = WEIGHTS[mode]
    ctx = {}

    def transform(args):
        unav = {e.id: set(e.unavailable) for e in args["emps"]}
        ctx["unav"], ctx["target"] = unav, {e.id: e.target_hours for e in args["emps"]}
        ctx["names"] = {e.id: e.name for e in args["emps"]}
        fixed_h, fixed_days = defaultdict(lambda: ZERO), defaultdict(set)
        for (eid, d), sid in cells.items():
            if d in unav.get(eid, ()):
                continue                                     # perbraukta (nebuvimas) - nedirbama
            if d < start or sid not in active:               # praeitis / neaktyvus tipas - nekeičiama
                fixed_h[eid] += obj[eid, d].hours
                if d >= start:
                    fixed_days[eid].add(d)
        for e in args["emps"]:
            e.target_hours = max(e.target_hours - fixed_h[e.id], ZERO)
            e.unavailable = set(e.unavailable) | fixed_days[e.id]
        days = [d for d in args["days"] if d >= start]
        ids = [e.id for e in args["emps"]]
        history = [_shift_obj(s) for s in RosterShift.objects.filter(
            employee_id__in=ids, date__gte=start - timedelta(days=7), date__lt=start).select_related("shift_type")
            if s.date not in unav.get(s.employee_id, ())]
        keep = {(eid, d, sid) for (eid, d), sid in cells.items()
                if d >= start and sid in active and d not in unav.get(eid, ())}
        ctx["keep"] = keep
        args.update(days=days, history=history, keep=keep, w_change=w_change, w_touch=w_touch,
                    locked=[x for x in args["locked"] if x[1] >= start],
                    prefs=[p for p in args["prefs"] if p.day >= start],
                    slots={k: v for k, v in args["slots"].items() if k[0] >= start} if args["slots"] is not None else None)
        ctx["slots"] = args["slots"]
        return args

    p = build_problem(r.company, r.year, r.month, r, transform)
    if not p.days:
        return None
    res = p.solve(seconds=seconds, hint=list(ctx["keep"]))
    if res.status == "infeasible":
        raise ValueError(f"{_ym(r.year, r.month)}: pataisymo rasti nepavyko – patikrinkite būtinas taisykles")
    old = {(e, d): s for e, d, s in ctx["keep"]}
    new = {(e, d): s for e, d, s in res.assignments}
    changes = [{"employee_id": e, "date": d.isoformat(), "old": old.get((e, d)), "new": new.get((e, d))}
               for (e, d) in sorted(set(old) | set(new), key=lambda k: (k[1], k[0])) if old.get((e, d)) != new.get((e, d))]
    hrs = {s.id: s for s in p.shifts}
    hours = {}
    for eid, target in ctx["target"].items():
        before = sum((o.hours for (e, d), o in obj.items() if e == eid and d not in ctx["unav"].get(eid, ())), ZERO)
        after = before
        for c in changes:
            if c["employee_id"] != eid:
                continue
            d = date.fromisoformat(c["date"])
            if c["old"]:
                after -= obj[eid, d].hours
            if c["new"]:
                after += hrs[c["new"]].instance(eid, d).hours
        hours[str(eid)] = {"before": str(before), "after": str(after), "target": str(target)}

    def holes(assign):
        if not ctx["slots"]:
            return 0
        cnt = defaultdict(int)
        for (e, d), s in assign.items():
            cnt[d, s] += 1
        return sum(max(int(mn or 0) - cnt[k], 0) for k, (mn, _) in ctx["slots"].items())

    absent = [{"employee_id": e, "date": d.isoformat(), "shift_type_id": s} for (e, d), s in sorted(cells.items(), key=lambda k: (k[0][1], k[0][0]))
              if d >= start and d in ctx["unav"].get(e, ()) and published and s]
    affected = {c["employee_id"] for c in changes} | {a["employee_id"] for a in absent}
    current = defaultdict(dict)                              # peržiūros tinkleliui: paveiktų darbuotojų esamos pamainos
    for (e, d), sid in cells.items():
        if e in affected and d >= start:
            current[str(e)][d.isoformat()] = sid
    return {"ym": _ym(r.year, r.month), "roster_id": r.id, "published": published, "status": r.status,
            "mode": mode, "start": start.isoformat(), "end": last.isoformat(), "base": None, "changes": changes,
            "absent": absent, "current": current,
            "hours": hours, "names": {str(k): v for k, v in ctx["names"].items()},
            "holes_before": holes(old), "holes_after": holes(new),
            "unmet": [{"label": u["label"], "dates": [d.isoformat() for d in u["dates"]]} for u in res.unmet]}


def repair_preview(roster, mode="fill", seconds=20):
    """Pataisymų peržiūra (DB nekeičiama - visi bandomieji įrašai atšaukiami)."""
    from docscanner_app.models import Employee, Roster
    from .changes import late_changes
    from .services import _bounds, _calendar_workdays, _prev_month_items, period_months, use_draft_months
    if mode not in WEIGHTS:
        raise ValueError("Neteisingas taisymo būdas")
    today = timezone.localdate()
    start_min = today + timedelta(days=1)
    chain = _chain(roster, start_min)
    if not chain:
        raise ValueError("Taisyti nėra ko – mėnuo baigėsi arba grafike nėra pamainų")
    bases = {r.id: _base(r) for r in chain}
    pm_all = period_months(roster.company, roster.year, roster.month)
    drafts = [(r.year, r.month) for r in Roster.objects.filter(company=roster.company, version=0) if (r.year, r.month) in pm_all]
    months = []
    with transaction.atomic():
        sp = transaction.savepoint()
        try:
            # kito mėnesio tikslas turi matyti jau pataisytą ankstesnį - todėl pakeitimai laikinai įrašomi
            with use_draft_months(roster.company_id, drafts + [(r.year, r.month) for r in chain]):
                for r in chain:
                    res = _repair_month(r, mode if r.version >= 1 else "balance", start_min, seconds)
                    if res is None:
                        continue
                    res["base"] = bases[r.id]
                    _write(r, res["changes"])
                    months.append(res)
        finally:
            transaction.savepoint_rollback(sp)

    # paveikti darbuotojai ir kam bus pranešta
    emp = {}
    for mm in months:
        r = next(x for x in chain if x.id == mm["roster_id"])
        late = set()
        if mm["published"] and mm["changes"]:
            first, _ = _bounds(r.year, r.month)
            per = defaultdict(list)
            for c in mm["changes"]:
                per[c["employee_id"]].append({"date": c["date"]})
            late = {(x["employee_id"], x["date"]) for x in late_changes(
                per, today, _prev_month_items(r) + (r.published_snapshot or []), before=first.isoformat(),
                calendar_days=_calendar_workdays(today, first))}
        for c in mm["changes"]:
            c["late"] = (c["employee_id"], c["date"]) in late
            x = emp.setdefault(c["employee_id"], {"changes": [], "absent": []})
            x["changes"].append(dict(c, ym=mm["ym"], published=mm["published"]))
        for a in mm["absent"]:
            emp.setdefault(a["employee_id"], {"changes": [], "absent": []})["absent"].append(dict(a, ym=mm["ym"]))
    accounts = {i: bool(a and em) for i, a, em in Employee.objects.filter(id__in=list(emp)).values_list("id", "account_id", "email")}
    names = {}
    for mm in months:
        names.update({int(k): v for k, v in mm.pop("names").items()})
    employees = []
    for eid, x in emp.items():
        pub = [c for c in x["changes"] if c["published"]]
        notify = ("account" if accounts.get(eid) else "no_account") if pub else ("draft" if x["changes"] else "none")
        employees.append({"id": eid, "name": names.get(eid, str(eid)), "notify": notify, "has_account": accounts.get(eid, False),
                          "late": [c["date"] for c in pub if c["late"]], "changes": x["changes"], "absent": x["absent"],
                          "hours": {mm["ym"]: mm["hours"].get(str(eid)) for mm in months if str(eid) in mm["hours"]}})
    employees.sort(key=lambda x: (x["notify"] == "none", x["name"]))
    return {"state": "done", "mode": mode, "created_at": timezone.now().isoformat(),
            "abs_sig": _abs_sig(roster.company, roster.year, roster.month), "months": months, "employees": employees}


# ============================================================
# Pritaikymas
# ============================================================

@transaction.atomic
def repair_apply(roster, months, user=None):
    from docscanner_app.models import Roster
    from .services import unlock
    rep = (roster.summary or {}).get("repair") or {}
    if rep.get("state") != "done":
        raise ValueError("Pataisymų peržiūros nėra – paleiskite taisymą iš naujo")
    sel = [mm for mm in rep.get("months") or [] if mm["ym"] in set(months or [])]
    if not sel:
        raise ValueError("Pasirinkite bent vieną mėnesį")
    if rep.get("abs_sig") != _abs_sig(roster.company, roster.year, roster.month):
        raise ValueError("Po peržiūros pasikeitė nebuvimai – paleiskite taisymą iš naujo")
    touched, unlocked = [], []
    for mm in sel:
        r = Roster.objects.select_for_update().get(id=mm["roster_id"], company=roster.company)
        if _base(r) != mm["base"]:
            raise ValueError(f"{mm['ym']} grafikas pasikeitė po peržiūros – paleiskite taisymą iš naujo")
        if r.status == "published" and mm["changes"]:
            unlock(r, "illness", "grafiko taisymas po nebuvimų")
            unlocked.append(mm["ym"])
        _write(r, mm["changes"])
        touched.append(r)
    for r in touched:                                        # po visų įrašų - kad kitų mėnesių duomenys būtų nauji
        r.refresh_from_db()
        record_inputs(r)
    roster.refresh_from_db()
    summary = dict(roster.summary or {})
    summary.pop("repair", None)
    roster.summary = summary
    roster.save(update_fields=["summary", "updated_at"])
    return {"months": [mm["ym"] for mm in sel], "unlocked": unlocked,
            "changes": sum(len(mm["changes"]) for mm in sel)}


def repair_discard(roster):
    summary = dict(roster.summary or {})
    summary.pop("repair", None)
    roster.summary = summary
    roster.save(update_fields=["summary", "updated_at"])


# ============================================================
# Paskelbimas: kam bus pranešta
# ============================================================

def publish_preview(roster):
    """
    {first, employees: [{id, name, lines, has_account, late}], notify, no_account, late}
    first=True - skelbiama pirmą kartą (pranešama visiems, kurie turi pamainų).
    """
    from docscanner_app.models import Employee
    from .changes import diff, late_changes, lines_for
    from .services import _bounds, _calendar_workdays, _prev_month_items, snapshot
    new = snapshot(roster)
    first, _ = _bounds(roster.year, roster.month)
    if roster.version == 0:
        per = defaultdict(int)
        for it in new:
            per[int(it["employee_id"])] += 1
        lines = {e: [f"Visas mėnesio grafikas ({n} pamainos)"] for e, n in per.items()}
        late = {}
    else:
        changes = diff(roster.published_snapshot or [], new)
        lines = {e: lines_for(items) for e, items in changes.items()}
        late = defaultdict(list)
        today = timezone.localdate()
        for x in late_changes(changes, today, _prev_month_items(roster) + (roster.published_snapshot or []),
                              before=first.isoformat(), calendar_days=_calendar_workdays(today, first)):
            late[x["employee_id"]].append(x["date"])
    emps = {e.id: e for e in Employee.objects.filter(id__in=list(lines))}
    out = sorted([{"id": eid, "name": emps[eid].full_name if eid in emps else str(eid), "lines": ls,
                   "has_account": bool(getattr(emps.get(eid), "account_id", None) and getattr(emps.get(eid), "email", "")),
                   "late": sorted(late.get(eid, []))}
                  for eid, ls in lines.items()], key=lambda x: x["name"])
    return {"first": roster.version == 0, "employees": out,
            "notify": sum(1 for x in out if x["has_account"]), "no_account": sum(1 for x in out if not x["has_account"]),
            "late": sum(1 for x in out if x["late"])}
