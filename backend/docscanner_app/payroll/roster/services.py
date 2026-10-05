"""
Pamainų grafikai (Django dalis): uždavinio surinkimas iš DB, variantai, langelių keitimas, tikrinimas,
paskelbimas, grafikas DU skaičiavime ir suminės apskaitos laikotarpio uždarymas.
"""
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from ..gross import monthly_hourly_rate, multiplier_pay
from ..taxes import q2
from ..timesheet import WORKED_EVENTS, Event, generate
from ..work_calendar import STANDARD_WEEK, is_holiday
from .bridge import daily_extra, daily_hours
from .catalog import RULES
from .law import check
from .period import PeriodMonth, is_last_month, period_bounds, settle
from .shifts import Shift, holiday_hours, make_shift, night_hours

logger = logging.getLogger("docscanner_app")
ZERO = Decimal("0")


def _bounds(y, m):
    first = date(y, m, 1)
    return first, date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)


def _shift_obj(rs):
    return Shift(rs.employee_id, rs.date, timezone.localtime(rs.start).replace(tzinfo=None) if timezone.is_aware(rs.start) else rs.start,
                 timezone.localtime(rs.end).replace(tzinfo=None) if timezone.is_aware(rs.end) else rs.end,
                 rs.break_minutes, rs.shift_type_id, rs.locked)


def _from_item(it):
    return Shift(int(it["employee_id"]), date.fromisoformat(it["date"]), datetime.fromisoformat(it["start"]),
                 datetime.fromisoformat(it["end"]), int(it.get("break_minutes") or 0), it.get("shift_type_id"))


def published_shifts(employee, first, last):
    """Iš PASKELBTOS grafiko versijos (keičiant grafiką, kol pakeitimai nepaskelbti, galioja ankstesnė)."""
    from docscanner_app.models import Roster
    out = []
    for r in Roster.objects.filter(company_id=employee.company_id, version__gte=1).filter(
            Q(year__gt=first.year) | Q(year=first.year, month__gte=first.month)).filter(
            Q(year__lt=last.year) | Q(year=last.year, month__lte=last.month)):
        for it in r.published_snapshot or []:
            if int(it["employee_id"]) == employee.id and first.isoformat() <= it["date"] <= last.isoformat():
                out.append(_from_item(it))
    return out


def snapshot(roster):
    items = []
    for s in roster.shifts.select_related("shift_type"):
        o = _shift_obj(s)
        items.append({"employee_id": s.employee_id, "date": s.date.isoformat(), "shift_type_id": s.shift_type_id,
                      "start": o.start.isoformat(timespec="minutes"), "end": o.end.isoformat(timespec="minutes"),
                      "break_minutes": s.break_minutes, "code": s.shift_type.code if s.shift_type else "",
                      "name": s.shift_type.name if s.shift_type else "", "color": s.shift_type.color if s.shift_type else ""})
    return items


LOCKED_MSG = "Grafikas paskelbtas ir užrakintas - norėdami keisti, spauskite „Atrakinti“"


def _editable(roster):
    if roster.status == "published":
        raise ValueError(LOCKED_MSG)


# ============================================================
# DU skaičiavimas
# ============================================================

def _summed_terms(contract, on):
    return (contract.terms.filter(valid_from__lte=on).order_by("-valid_from").first()
            or contract.terms.order_by("valid_from").first())


def apply_roster(inp, employee, contract, settings):
    """Suminei apskaitai: valandos ir naktinės / šventinės - iš paskelbto grafiko; paskutinį mėnesį - atsiskaitymas."""
    first, last = _bounds(inp.year, inp.month)
    shifts = published_shifts(employee, first, last)
    dh = daily_hours(shifts)
    for sg in inp.segments:
        if sg.summed:
            sg.daily_hours = {d: h for d, h in dh.items() if sg.valid_from <= d <= sg.valid_to}
    inp.roster_extra = daily_extra(shifts)

    months = settings.summed_period_months or 3
    anchor = settings.summed_period_anchor or 1
    if not is_last_month(inp.year, inp.month, months, anchor):
        return
    st = period_settlement(employee, contract, inp.year, inp.month, months, anchor, current_events=inp.events,
                           current_overrides=inp.overrides,
                           to_vacation=getattr(employee, "summed_overtime_to_vacation", False))
    if st is None:
        return
    settlement, rate = st
    for code, hours, r, mult in settlement.lines:
        note = f"Apskaitinis laikotarpis: norma {settlement.norm} val., išdirbta {settlement.worked} val."
        inp.extra_lines.append(_line(code, multiplier_pay(r, hours, mult), hours, q2(r), note))


def _line(code, amount, qty, rate, note):
    from ..run import Line
    return Line(code, amount, qty, rate, note)


def _month_timesheet(employee, contract, y, m, events=None, overrides=None):
    from ..services import _events, _overrides, terms_week
    first, last = _bounds(y, m)
    t = _summed_terms(contract, last)
    shifts = published_shifts(employee, first, last)
    employed_from = contract.start_date if contract.start_date > first else None
    end = contract.effective_end
    employed_to = end if end and end < last else None
    ts = generate(y, m, week=terms_week(t), workload=t.workload, employed_from=employed_from, employed_to=employed_to,
                  events=events if events is not None else _events(employee, first, last),
                  overrides=overrides if overrides is not None else _overrides(employee, y, m),
                  daily_schedule=daily_hours(shifts), daily_extra=daily_extra(shifts))
    return ts, t


def _norm_without_absences(ts):
    return sum((d.norm_hours for d in ts.days
                if not (d.event and d.event.kind not in WORKED_EVENTS)), ZERO)


def period_settlement(employee, contract, y, m, months=3, anchor=1, current_events=None, current_overrides=None,
                      to_vacation=False):
    (y1, m1), _ = period_bounds(y, m, months, anchor)
    items, cy, cm, t = [], y1, m1, None
    while (cy, cm) <= (y, m):
        cur = (cy, cm) == (y, m)
        ts, t = _month_timesheet(employee, contract, cy, cm,
                                 current_events if cur else None, current_overrides if cur else None)
        items.append(PeriodMonth(cy, cm, _norm_without_absences(ts), ts.worked_hours))
        cy, cm = (cy + (cm == 12), cm % 12 + 1)
    if not items or t is None:
        return None
    from ..services import terms_week
    rate = t.base_amount if t.pay_form == "hourly" else monthly_hourly_rate(t.base_amount, y, m, terms_week(t), t.workload)
    return settle(items, rate, to_vacation=to_vacation), rate


VAC_REASON = "Suminė apskaita {y1}-{m1:02d}–{y}-{m:02d}: viršyta norma"


def close_period_vacation(run):
    """Tvirtinant paskutinio laikotarpio mėnesio DU: darbuotojo prašymu viršytos val. x1,5 -> prie atostogų."""
    from docscanner_app.models import VacationAdjustment
    from ..services import _active_contract, _settings
    st = _settings(run.company)
    months, anchor = st.summed_period_months or 3, st.summed_period_anchor or 1
    if not is_last_month(run.year, run.month, months, anchor):
        return 0
    (y1, m1), _ = period_bounds(run.year, run.month, months, anchor)
    first, last = _bounds(run.year, run.month)
    reason = VAC_REASON.format(y1=y1, m1=m1, y=run.year, m=run.month)
    n = 0
    for res in run.results.select_related("employee"):
        e = res.employee
        if not getattr(e, "summed_overtime_to_vacation", False):
            continue
        c = _active_contract(e, first, last)
        t = c and _summed_terms(c, last)
        if not t or getattr(t, "work_regime", "standard") != "summed":
            continue
        out = period_settlement(e, c, run.year, run.month, months, anchor, to_vacation=True)
        if not out or not out[0].vacation_hours:
            continue
        day_h = Decimal("8") * (t.workload or Decimal("1"))
        days = (out[0].vacation_hours / day_h).quantize(Decimal("0.01"))
        VacationAdjustment.objects.filter(employee=e, reason=reason).delete()
        VacationAdjustment.objects.create(employee=e, date=last, days=days,
                                          reason=f"{reason} {out[0].excess} val. x 1,5")
        n += 1
    return n


def undo_period_vacation(run):
    from docscanner_app.models import VacationAdjustment
    from ..services import _settings
    st = _settings(run.company)
    (y1, m1), _ = period_bounds(run.year, run.month, st.summed_period_months or 3, st.summed_period_anchor or 1)
    VacationAdjustment.objects.filter(employee__company=run.company,
                                      reason__startswith=VAC_REASON.format(y1=y1, m1=m1, y=run.year, m=run.month)).delete()


# ============================================================
# Uždavinio surinkimas
# ============================================================

def summed_employees(company, first, last):
    """Darbuotojai, kurių sutartyje mėnesį taikoma suminė apskaita: [(employee, contract, terms)]."""
    from docscanner_app.models import EmploymentContract
    out = []
    qs = (EmploymentContract.objects.filter(employee__company=company, start_date__lte=last)
          .filter(Q(termination_date__isnull=True) | Q(termination_date__gte=first))
          .exclude(status="draft").select_related("employee"))
    for c in qs:
        t = _summed_terms(c, last)
        if t and getattr(t, "work_regime", "standard") == "summed":
            out.append((c.employee, c, t))
    return out


def expand_target(company, target, allowed_ids, on):
    """{"employees","positions","position_groups","tags"} -> darbuotojų id."""
    from docscanner_app.models import ContractTerms, Employee
    target = target or {}
    ids = set(target.get("employees") or [])
    pos, groups = target.get("positions") or [], target.get("position_groups") or []
    if pos or groups:
        for t in (ContractTerms.objects.filter(contract__employee__company=company, valid_from__lte=on)
                  .select_related("position").order_by("contract__employee_id", "-valid_from")):
            if t.position_id and (t.position_id in pos or (t.position and t.position.group_id in groups)):
                ids.add(t.contract.employee_id)
    if target.get("tags"):
        ids |= set(Employee.objects.filter(company=company, tags__in=target["tags"]).values_list("id", flat=True))
    return ids & set(allowed_ids)


def _absence_dates(employee, first, last):
    from docscanner_app.models import AbsenceEvent
    out = set()
    for e in AbsenceEvent.objects.filter(employee=employee, status="approved", start_date__lte=last, end_date__gte=first):
        if e.kind in WORKED_EVENTS:
            continue
        d = max(e.start_date, first)
        while d <= min(e.end_date, last):
            out.add(d)
            d += timedelta(days=1)
    return out


def employee_target(employee, contract, terms, y, m, settings):
    """Mėnesio valandų tikslas = mėnesio norma (be nebuvimų) + ankstesnių laikotarpio mėnesių skirtumas."""
    ts, _ = _month_timesheet(employee, contract, y, m)
    target = _norm_without_absences(ts)
    months, anchor = settings.summed_period_months or 3, settings.summed_period_anchor or 1
    (y1, m1), _ = period_bounds(y, m, months, anchor)
    cy, cm, carry = y1, m1, ZERO
    while (cy, cm) < (y, m):
        pts, _ = _month_timesheet(employee, contract, cy, cm)
        carry += _norm_without_absences(pts) - pts.worked_hours
        cy, cm = (cy + (cm == 12), cm % 12 + 1)
    return max(target + carry, ZERO)


def build_problem(company, y, m, roster=None):
    from docscanner_app.models import RosterShift, ScheduleRule, ShiftPreference, ShiftType
    from ..services import _settings, terms_week
    from .solver import Emp, Pref, Problem, Rule, ShiftDef

    st = _settings(company)
    first, last = _bounds(y, m)
    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    shifts = [ShiftDef(s.id, s.code, s.start_time, s.end_time, s.break_minutes)
              for s in ShiftType.objects.filter(company=company, is_active=True)]
    if not shifts:
        raise ValueError("Nėra pamainų tipų - sukurkite bent vieną (pvz. „Diena 7-19“)")
    staff = summed_employees(company, first, last)
    if not staff:
        raise ValueError("Nėra darbuotojų su sumine darbo laiko apskaita šį mėnesį")

    emps = []
    for e, c, t in staff:
        unavailable = _absence_dates(e, first, last)
        if c.start_date > first:
            unavailable |= {d for d in days if d < c.start_date}
        if c.effective_end and c.effective_end < last:
            unavailable |= {d for d in days if d > c.effective_end}
        rate = t.base_amount if t.pay_form == "hourly" else monthly_hourly_rate(t.base_amount, y, m, terms_week(t), t.workload)
        emps.append(Emp(e.id, e.full_name, employee_target(e, c, t, y, m, st), q2(rate),
                        t.position_id, t.position.group_id if t.position_id and t.position else None,
                        set(e.tags.values_list("id", flat=True)), unavailable))
    ids = [e.id for e in emps]

    rules = load_rules(company, ids, first, last)

    prefs = [Pref(p.employee_id, p.date, p.kind, p.shift_type_id)
             for p in ShiftPreference.objects.filter(employee_id__in=ids, date__gte=first, date__lte=last)]
    locked = []
    if roster:
        locked = [(s.employee_id, s.date, s.shift_type_id)
                  for s in roster.shifts.filter(locked=True, shift_type__isnull=False)]
    history = [_shift_obj(s) for s in RosterShift.objects.filter(
        employee_id__in=ids, date__gte=first - timedelta(days=7), date__lt=first)]
    return Problem(days, shifts, emps, rules, prefs, locked, history, slots=plan_slots(roster) if roster else None)


def load_rules(company, ids, first, last):
    from docscanner_app.models import ScheduleRule
    from .solver import Rule
    out = []
    for r in ScheduleRule.objects.filter(company=company, is_active=True):
        if (r.valid_from and r.valid_from > last) or (r.valid_to and r.valid_to < first):
            continue
        out.append(Rule(r.id, r.kind, expand_target(company, r.target, ids, last),
                        expand_target(company, r.target2, ids, last), dict(r.params or {}),
                        r.hard, r.weight, rule_label(r)))
    return out


# ============================================================
# Pamainų planas
# ============================================================

def plan_slots(roster):
    """{(data, shift_id): (min, max)} arba None, jei planas tuščias."""
    items = list(roster.slots.values_list("date", "shift_type_id", "min_staff", "max_staff"))
    if not items:
        return None
    return {(d, sid): (mn, mx) for d, sid, mn, mx in items}


def _month_days(roster):
    first, last = _bounds(roster.year, roster.month)
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


@transaction.atomic
def slot_set(roster, d, shift_type_id, min_staff, max_staff=None):
    from docscanner_app.models import RosterSlot, ShiftType
    if not ShiftType.objects.filter(id=shift_type_id, company=roster.company).exists():
        raise ValueError("Pamaina nerasta")
    mn = int(min_staff or 0)
    mx = None if max_staff in (None, "") else int(max_staff)
    if mn <= 0 and not mx:
        RosterSlot.objects.filter(roster=roster, date=d, shift_type_id=shift_type_id).delete()
        return None
    if mx is not None and mx < mn:
        raise ValueError("„Iki“ negali būti mažiau nei „nuo“")
    obj, _ = RosterSlot.objects.update_or_create(roster=roster, date=d, shift_type_id=shift_type_id,
                                                 defaults={"min_staff": mn, "max_staff": mx})
    return obj


@transaction.atomic
def plan_from_rules(roster):
    """Užpildo planą pagal taisykles „Darbuotojų skaičius pamainoje“ (savaitės dienos, šventės)."""
    from docscanner_app.models import RosterSlot, ScheduleRule, ShiftType
    first, last = _bounds(roster.year, roster.month)
    all_ids = list(ShiftType.objects.filter(company=roster.company, is_active=True).values_list("id", flat=True))
    rules = [r for r in ScheduleRule.objects.filter(company=roster.company, is_active=True, kind="min_max_staff")
             if not ((r.valid_from and r.valid_from > last) or (r.valid_to and r.valid_to < first))]
    if not rules:
        raise ValueError("Nėra taisyklių „Darbuotojų skaičius pamainoje“ - įveskite planą rankiniu būdu arba sukurkite taisyklę")
    roster.slots.all().delete()
    plan = {}
    for r in rules:
        p = r.params or {}
        for d in _month_days(roster):
            if p.get("weekdays") and d.weekday() not in p["weekdays"]:
                continue
            if p.get("holidays") is False and is_holiday(d):
                continue
            for sid in (p.get("shifts") or all_ids):
                plan[d, sid] = (int(p.get("min") or 0), None if p.get("max") in (None, "") else int(p["max"]))
    RosterSlot.objects.bulk_create([RosterSlot(roster=roster, date=d, shift_type_id=sid, min_staff=mn, max_staff=mx)
                                    for (d, sid), (mn, mx) in plan.items() if mn or mx])
    return len(plan)


@transaction.atomic
def template_save(roster, name, week_start):
    from docscanner_app.models import RosterWeekTemplate
    days = {week_start + timedelta(days=i) for i in range(7)}
    items = [{"weekday": s.date.weekday(), "shift_type_id": s.shift_type_id, "min": s.min_staff, "max": s.max_staff}
             for s in roster.slots.filter(date__in=days)]
    if not items:
        raise ValueError("Pasirinktoje savaitėje plane pamainų nėra")
    return RosterWeekTemplate.objects.create(company=roster.company, name=name[:80] or f"Savaitė nuo {week_start}",
                                             items=items)


@transaction.atomic
def template_apply(roster, template_id, dates=None):
    """Šabloną pritaikyti visam mėnesiui arba nurodytoms dienoms (pvz. vienai savaitei)."""
    from docscanner_app.models import RosterSlot, RosterWeekTemplate
    t = RosterWeekTemplate.objects.get(id=template_id, company=roster.company)
    targets = [d for d in _month_days(roster) if not dates or d in dates]
    roster.slots.filter(date__in=targets).delete()
    objs = []
    for d in targets:
        for it in t.items:
            if it["weekday"] == d.weekday():
                objs.append(RosterSlot(roster=roster, date=d, shift_type_id=it["shift_type_id"],
                                       min_staff=it.get("min") or 0, max_staff=it.get("max")))
    RosterSlot.objects.bulk_create(objs, ignore_conflicts=True)
    return len(objs)


@transaction.atomic
def copy_prev_plan(roster):
    """Ankstesnio mėnesio planas: n-tasis savaitės dienos pasikartojimas -> tas pats (1-as pirmadienis -> 1-as pirmadienis)."""
    from docscanner_app.models import Roster, RosterSlot
    py, pm = (roster.year - (roster.month == 1), (roster.month - 2) % 12 + 1)
    prev = Roster.objects.filter(company=roster.company, year=py, month=pm).first()
    if not prev or not prev.slots.exists():
        raise ValueError("Praėjusio mėnesio plano nėra")
    pf, pl = _bounds(py, pm)
    by_key = defaultdict(list)
    for s in prev.slots.all():
        by_key[s.date.weekday(), (s.date.day - 1) // 7].append(s)
    roster.slots.all().delete()
    objs = []
    for d in _month_days(roster):
        k = (d.weekday(), (d.day - 1) // 7)
        src = by_key.get(k) or by_key.get((d.weekday(), 3)) or []
        for s in src:
            objs.append(RosterSlot(roster=roster, date=d, shift_type_id=s.shift_type_id,
                                   min_staff=s.min_staff, max_staff=s.max_staff))
    RosterSlot.objects.bulk_create(objs, ignore_conflicts=True)
    return len(objs)



def rule_label(r):
    meta = RULES.get(r.kind)
    return f"#{r.id} {meta[1] if meta else r.kind}" + (f" – {r.note}" if r.note else "")


# ============================================================
# Grafikas: sudarymas, variantai, langeliai, paskelbimas
# ============================================================

def _history(roster):
    from .changes import describe
    out = {}
    for c in roster.changes.select_related("employee", "changed_by"):
        v = out.setdefault(c.version, {"version": c.version, "at": c.changed_at, "reason": c.reason,
                                       "by": getattr(c.changed_by, "email", ""), "items": []})
        v["items"].append({"employee": c.employee.full_name, "date": c.date.isoformat(), "late": c.late,
                           "change": f"{describe(c.old)} → {describe(c.new)}"})
    return sorted(out.values(), key=lambda x: -x["version"])


def get_roster(company, y, m):
    from docscanner_app.models import Roster
    roster, _ = Roster.objects.get_or_create(company=company, year=y, month=m)
    return roster


def precheck(company, y, m):
    """Greitas patikrinimas prieš paleidžiant sprendiklį - klaida rodoma iš karto, ne po kelių minučių."""
    from docscanner_app.models import ShiftType
    first, last = _bounds(y, m)
    if not ShiftType.objects.filter(company=company, is_active=True).exists():
        raise ValueError("Nėra pamainų tipų - sukurkite juos skiltyje „Pamainos ir žymos“")
    if not summed_employees(company, first, last):
        raise ValueError("Nėra darbuotojų su sumine darbo laiko apskaita šį mėnesį - "
                         "nustatykite ją darbuotojo kortelėje („Keisti sąlygas“ → „Darbo laiko apskaita“)")


def generate_variants(roster, n=3, seconds=30):
    """Ilgas darbas - kviečiamas iš Celery užduoties."""
    from .solver import solve_variants
    summary = dict(roster.summary or {})
    summary.update({"state": "running", "started_at": timezone.now().isoformat(), "error": ""})
    roster.summary = summary
    roster.save(update_fields=["summary", "updated_at"])
    try:
        targets = {}

        def build():
            p = build_problem(roster.company, roster.year, roster.month, roster)
            targets.update({e.id: str(e.target_hours) for e in p.emps})
            return p

        variants = solve_variants(build, n=n, seconds=seconds)
        summary["variants"] = [{
            "assignments": [[e, d.isoformat(), s] for e, d, s in v.assignments],
            "cost": str(v.cost), "unmet": [dict(u, dates=[d.isoformat() for d in u["dates"]]) for u in v.unmet],
            "hours": {str(k): str(h) for k, h in v.hours.items()}, "status": v.status,
        } for v in variants]
        summary["targets"] = targets
        summary["state"] = "done" if variants else "error"
        if not variants:
            summary["error"] = "Grafiko sudaryti nepavyko - patikrinkite būtinas taisykles"
    except ValueError as e:
        summary.update({"state": "error", "error": str(e)})
    except Exception as e:  # noqa: BLE001
        logger.exception("Roster generation failed: roster=%s", roster.id)
        summary.update({"state": "error", "error": "Vidinė klaida sudarant grafiką"})
    roster.summary = summary
    roster.generated_at = timezone.now()
    roster.save(update_fields=["summary", "generated_at", "updated_at"])
    return summary


def _aware(dt):
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt


@transaction.atomic
def apply_variant(roster, index):
    from docscanner_app.models import RosterShift, ShiftType
    _editable(roster)
    variants = (roster.summary or {}).get("variants") or []
    if not (0 <= index < len(variants)):
        raise ValueError("Variantas nerastas")
    types = {s.id: s for s in ShiftType.objects.filter(company=roster.company)}
    roster.shifts.filter(locked=False).delete()
    kept = set(roster.shifts.values_list("employee_id", "date"))
    objs = []
    for e, d, sid in variants[index]["assignments"]:
        d = date.fromisoformat(d)
        if (e, d) in kept or sid not in types:
            continue
        st = types[sid]
        sh = make_shift(e, d, st.start_time, st.end_time, st.break_minutes, sid)
        objs.append(RosterShift(roster=roster, employee_id=e, date=d, shift_type=st, start=_aware(sh.start),
                                end=_aware(sh.end), break_minutes=st.break_minutes, source="auto"))
    RosterShift.objects.bulk_create(objs)
    roster.cost = Decimal(variants[index]["cost"])
    roster.save(update_fields=["cost", "updated_at"])
    return roster


@transaction.atomic
def set_cell(roster, employee_id, d, shift_type_id=None, locked=None):
    """Langelis: pamaina arba laisva diena (shift_type_id=None). locked - užrakinti / atrakinti."""
    from docscanner_app.models import RosterShift, ShiftType
    if locked is None or shift_type_id is not None:
        _editable(roster)
    qs = roster.shifts.filter(employee_id=employee_id, date=d)
    if shift_type_id is None and locked is None:
        qs.delete()
        return None
    cur = qs.first()
    if shift_type_id is not None:
        st = ShiftType.objects.get(id=shift_type_id, company=roster.company)
        sh = make_shift(employee_id, d, st.start_time, st.end_time, st.break_minutes, st.id)
        if cur:
            cur.shift_type, cur.start, cur.end, cur.break_minutes, cur.source = st, _aware(sh.start), _aware(sh.end), st.break_minutes, "manual"
        else:
            cur = RosterShift(roster=roster, employee_id=employee_id, date=d, shift_type=st, start=_aware(sh.start),
                              end=_aware(sh.end), break_minutes=st.break_minutes, source="manual")
    if cur is None:
        return None
    if locked is not None:
        cur.locked = locked
    cur.save()
    return cur


def roster_view(roster):
    """Tinklelis UI: darbuotojai, dienos, pamainos, pažeidimai, balansai, kaina."""
    from docscanner_app.models import ShiftType
    from ..services import _settings
    st = _settings(roster.company)
    first, last = _bounds(roster.year, roster.month)
    staff = summed_employees(roster.company, first, last)
    shifts = list(roster.shifts.select_related("shift_type"))
    objs = [_shift_obj(s) for s in shifts]
    by_emp = defaultdict(list)
    for o in objs:
        by_emp[o.employee_id].append(o)
    targets = (roster.summary or {}).get("targets") or {}
    employees = []
    cost = ZERO
    for e, c, t in staff:
        hours = sum((o.hours for o in by_emp.get(e.id, [])), ZERO)
        target = Decimal(targets[str(e.id)]) if str(e.id) in targets else employee_target(e, c, t, roster.year, roster.month, st)
        employees.append({"id": e.id, "name": e.full_name, "position": t.position.name if t.position_id and t.position else "",
                          "hours": str(hours), "target": str(target), "diff": str(hours - target),
                          "absences": sorted(d.isoformat() for d in _absence_dates(e, first, last))})
    violations = [{"employee_id": v.employee_id, "date": str(v.day), "code": v.code, "message": v.message}
                  for v in check(objs)]

    # planas, taisyklės, patarimai
    from .rulecheck import check_rules, plan_hints
    ids = [x.id for x, _, _ in staff]
    absences = {x["id"]: {date.fromisoformat(d) for d in x["absences"]} for x in employees}
    types_all = list(ShiftType.objects.filter(company=roster.company, is_active=True))
    shift_ids = [t.id for t in types_all]
    night_ids = [t.id for t in types_all if night_hours(make_shift(0, first, t.start_time, t.end_time)) >= Decimal("3")]
    rules = load_rules(roster.company, ids, first, last)
    slots = plan_slots(roster)
    assignments = [(s.employee_id, s.date, s.shift_type_id) for s in shifts if s.shift_type_id]
    rule_viol = check_rules(assignments, shift_ids, rules, slots, absences, night_ids)
    counts = defaultdict(int)
    for _, d, sid in assignments:
        counts[d, sid] += 1
    slots_view = [{"date": d.isoformat(), "shift_type_id": sid, "min": mn, "max": mx, "assigned": counts.get((d, sid), 0)}
                  for (d, sid), (mn, mx) in sorted((slots or {}).items())]
    if slots:
        hours = {t.id: make_shift(0, first, t.start_time, t.end_time, t.break_minutes).hours for t in types_all}
        hints = plan_hints(slots, hours, [(x["id"], x["name"], Decimal(x["target"])) for x in employees],
                           rules, shift_ids, absences)
    elif staff:
        has_cov = any(r.kind == "min_max_staff" for r in rules)
        hints = [{"level": "info" if has_cov else "warning", "message":
                  "Pamainų planas tuščias - sudarant grafiką bus naudojamos taisyklės „Darbuotojų skaičius pamainoje“."
                  if has_cov else
                  "Pamainų planas tuščias ir nėra taisyklių „Darbuotojų skaičius pamainoje“ - "
                  "pamainos bus statomos bet kuriomis dienomis. Užpildykite planą."}]
    else:
        hints = []
    return {
        "id": roster.id, "year": roster.year, "month": roster.month, "status": roster.status,
        "version": roster.version, "published_at": roster.published_at,
        "publish_deadline": (first - timedelta(days=7)).isoformat(),
        "days": [{"date": (first + timedelta(days=i)).isoformat(), "weekday": (first + timedelta(days=i)).weekday(),
                  "holiday": is_holiday(first + timedelta(days=i))} for i in range((last - first).days + 1)],
        "shift_types": [{"id": s.id, "name": s.name, "code": s.code, "start": s.start_time.strftime("%H:%M"),
                         "end": s.end_time.strftime("%H:%M"), "color": s.color}
                        for s in ShiftType.objects.filter(company=roster.company, is_active=True)],
        "employees": employees,
        "shifts": [{"id": s.id, "employee_id": s.employee_id, "date": s.date.isoformat(), "shift_type_id": s.shift_type_id,
                    "locked": s.locked, "hours": str(o.hours), "night": str(night_hours(o)), "holiday": str(holiday_hours(o))}
                   for s, o in zip(shifts, objs)],
        "violations": violations,
        "slots": slots_view,
        "rule_violations": rule_viol,
        "hints": hints,
        "templates": list(roster.company.roster_week_templates.values("id", "name")),
        "cost": str(roster.cost) if roster.cost is not None else None,
        "generation": {k: v for k, v in (roster.summary or {}).items() if k != "variants"} | {
            "variants": [{"index": i, "cost": v["cost"], "unmet": v["unmet"], "status": v["status"]}
                         for i, v in enumerate((roster.summary or {}).get("variants") or [])]},
        "acks": list(roster.acks.filter(version=roster.version).values_list("employee_id", flat=True)),
        "pending_reason": roster.pending_reason,
        "reasons": REASONS,
        "history": _history(roster),
    }


class LateChangeError(Exception):
    def __init__(self, items):
        super().__init__("late")
        self.items = items


REASONS = {
    "illness": "Darbuotojo liga ar kitas nebuvimas",
    "unforeseen": "Kita nuo darbdavio nepriklausanti priežastis",
    "employee_request": "Darbuotojo prašymu / šalių susitarimu",
}


@transaction.atomic
def unlock(roster, reason, comment=""):
    if roster.status != "published":
        return roster
    if reason not in REASONS:
        raise ValueError("Nurodykite keitimo priežastį")
    roster.status = "editing"
    roster.pending_reason = (REASONS[reason] + (f": {comment}" if comment else ""))[:255]
    roster.save(update_fields=["status", "pending_reason", "updated_at"])
    return roster


@transaction.atomic
def publish(roster, user, confirm_late=False):
    from docscanner_app.models import Employee, RosterAck, RosterChange
    from ..savitarna_emails import notify_roster
    from .changes import diff, late_changes, lines_for

    first, _ = _bounds(roster.year, roster.month)
    new = snapshot(roster)
    if roster.version == 0:
        late = timezone.localdate() > first - timedelta(days=7)
        roster.status, roster.version, roster.published_snapshot = "published", 1, new
        roster.published_at, roster.published_by = timezone.now(), user
        roster.save(update_fields=["status", "version", "published_snapshot", "published_at", "published_by", "updated_at"])
        affected = {int(x["employee_id"]): None for x in new}
        result = {"late": late, "version": 1}
    else:
        changes = diff(roster.published_snapshot or [], new)
        if not changes:
            roster.status, roster.pending_reason = "published", ""
            roster.save(update_fields=["status", "pending_reason", "updated_at"])
            return {"version": roster.version, "notified": 0, "no_changes": True}
        late_items = late_changes(changes, timezone.localdate(), roster.published_snapshot or [])
        if late_items and not confirm_late:
            raise LateChangeError(late_items)
        late_set = {(x["employee_id"], x["date"]) for x in late_items}
        prev_version = roster.version
        roster.version += 1
        RosterChange.objects.bulk_create([
            RosterChange(roster=roster, version=roster.version, employee_id=emp, date=date.fromisoformat(c["date"]),
                         old=c["old"], new=c["new"], reason=roster.pending_reason, changed_by=user,
                         late=(emp, c["date"]) in late_set)
            for emp, items in changes.items() for c in items])
        # nepakeistiems darbuotojams patvirtinimas galioja ir naujai versijai
        acked = set(roster.acks.filter(version=prev_version).values_list("employee_id", flat=True)) - set(changes)
        RosterAck.objects.bulk_create([RosterAck(roster=roster, employee_id=e, version=roster.version) for e in acked],
                                      ignore_conflicts=True)
        roster.status, roster.published_snapshot, roster.pending_reason = "published", new, ""
        roster.published_at, roster.published_by = timezone.now(), user
        roster.save(update_fields=["status", "version", "published_snapshot", "pending_reason", "published_at",
                                   "published_by", "updated_at"])
        affected = {emp: lines_for(items) for emp, items in changes.items()}
        result = {"version": roster.version, "changed_employees": len(changes), "late_count": len(late_items)}

    sent = 0
    for e in Employee.objects.filter(id__in=list(affected)):
        if e.account_id and notify_roster(e, roster.year, roster.month, changed=roster.version > 1,
                                          lines=affected.get(e.id)):
            sent += 1
    result["notified"] = sent
    return result


# ============================================================
# Pakaitinis darbuotojas (liga, nebuvimas, trūkstama pamaina)
# ============================================================

def suggest(roster, d, shift_type_id, exclude_employee_id=None, limit=8):
    from docscanner_app.models import ShiftType
    from .rulecheck import blocked
    first, last = _bounds(roster.year, roster.month)
    st = ShiftType.objects.get(id=shift_type_id, company=roster.company)
    staff = summed_employees(roster.company, first, last)
    ids = [e.id for e, _, _ in staff]
    rules = [r for r in load_rules(roster.company, ids, first, last) if r.hard]
    all_ids = list(ShiftType.objects.filter(company=roster.company).values_list("id", flat=True))
    shifts = list(roster.shifts.all())
    by_emp = defaultdict(list)
    for s in shifts:
        by_emp[s.employee_id].append(_shift_obj(s))
    same_cell = {s.employee_id for s in shifts if s.date == d and s.shift_type_id == shift_type_id}
    targets = (roster.summary or {}).get("targets") or {}
    from ..services import _settings
    sett = _settings(roster.company)
    out = []
    for e, c, t in staff:
        if e.id == exclude_employee_id or d in _absence_dates(e, d, d):
            continue
        mine = by_emp.get(e.id, [])
        if any(x.day == d for x in mine):
            continue
        if any(e.id in r.target and r.kind in ("only_shifts", "never_shifts", "not_on_weekdays", "only_on_weekdays",
                                               "unavailable") and blocked(r, d, shift_type_id, all_ids) for r in rules):
            continue
        cand = make_shift(e.id, d, st.start_time, st.end_time, st.break_minutes, st.id)
        if [v for v in check(mine + [cand]) if abs((v.day - d).days) <= 7]:
            continue
        warnings = []
        for r in rules:
            if r.kind == "never_together" and ((e.id in r.target and same_cell & r.target2) or
                                               (e.id in r.target2 and same_cell & r.target)):
                warnings.append(f"Pažeistų taisyklę: {r.label}")
        hours = sum((x.hours for x in mine), ZERO)
        target = Decimal(targets[str(e.id)]) if str(e.id) in targets else employee_target(e, c, t, roster.year, roster.month, sett)
        after = hours + cand.hours - target
        out.append({"employee_id": e.id, "name": e.full_name, "hours": str(hours), "target": str(target),
                    "after_diff": str(after), "warnings": warnings,
                    "_score": (len(warnings), max(after, ZERO), -(target - hours))})
    out.sort(key=lambda x: x["_score"])
    for x in out:
        x.pop("_score")
    return out[:limit]


@transaction.atomic
def replace(roster, d, shift_type_id, to_employee_id, from_employee_id=None):
    _editable(roster)
    if from_employee_id:
        roster.shifts.filter(employee_id=from_employee_id, date=d).delete()
    return set_cell(roster, int(to_employee_id), d, int(shift_type_id))


# ============================================================
# Savitarna
# ============================================================

def _is_summed(employee, first, last):
    from ..services import _active_contract
    c = _active_contract(employee, first, last)
    t = c and _summed_terms(c, last)
    return bool(t and getattr(t, "work_regime", "standard") == "summed")


def my_roster_flags(employee):
    """Pagrindiniam savitarnos ekranui: ar rodyti „Mano grafikas“ ir ar yra nepatvirtintų grafikų."""
    from docscanner_app.models import Roster
    today = timezone.localdate()
    first, last = _bounds(today.year, today.month)
    nf, nl = _bounds(*((today.year + (today.month == 12), today.month % 12 + 1)))
    if not (_is_summed(employee, first, last) or _is_summed(employee, nf, nl)):
        return None
    pending = []
    for r in Roster.objects.filter(company=employee.company, version__gte=1, year__gte=today.year - (today.month == 1)):
        if (r.year, r.month) < (today.year, today.month):
            continue
        mine = any(int(x["employee_id"]) == employee.id for x in (r.published_snapshot or [])) \
            or r.changes.filter(employee=employee, version=r.version).exists()
        if mine and not r.acks.filter(employee=employee, version=r.version).exists():
            pending.append({"year": r.year, "month": r.month})
    return {"enabled": True, "pending_ack": pending}


def my_roster(employee, y, m):
    from docscanner_app.models import Roster, ShiftPreference, ShiftType
    from ..services import _settings
    first, last = _bounds(y, m)
    roster = Roster.objects.filter(company=employee.company, year=y, month=m, version__gte=1).first()
    shifts = []
    total = ZERO
    changes = []
    if roster:
        for it in roster.published_snapshot or []:
            if int(it["employee_id"]) != employee.id:
                continue
            o = _from_item(it)
            total += o.hours
            shifts.append({"date": it["date"], "code": it.get("code", ""), "name": it.get("name", ""),
                           "color": it.get("color", ""), "start": o.start.strftime("%H:%M"),
                           "end": o.end.strftime("%H:%M"), "hours": str(o.hours)})
        from .changes import describe
        changes = [{"date": c.date.isoformat(), "change": f"{describe(c.old)} → {describe(c.new)}", "reason": c.reason}
                   for c in roster.changes.filter(employee=employee, version=roster.version)]
    st = _settings(employee.company)
    (y1, m1), (y2, m2) = period_bounds(y, m, st.summed_period_months or 3, st.summed_period_anchor or 1)
    prefs = ShiftPreference.objects.filter(employee=employee, date__gte=first, date__lte=last).select_related("shift_type")
    today = timezone.localdate()
    return {
        "year": y, "month": m,
        "published": bool(roster), "roster_id": roster.id if roster else None,
        "version": roster.version if roster else None,
        "acknowledged": bool(roster and roster.acks.filter(employee=employee, version=roster.version).exists()),
        "shifts": shifts, "total_hours": str(total), "changes": changes,
        "absences": sorted(d.isoformat() for d in _absence_dates(employee, first, last)),
        "period": f"{y1}-{m1:02d} – {y2}-{m2:02d}",
        "overtime_to_vacation": bool(getattr(employee, "summed_overtime_to_vacation", False)),
        "shift_types": [{"id": t.id, "name": t.name, "code": t.code} for t in ShiftType.objects.filter(company=employee.company, is_active=True)],
        "preferences": [{"id": p.id, "date": p.date.isoformat(), "kind": p.kind, "kind_label": p.get_kind_display(),
                         "shift": p.shift_type.name if p.shift_type else "", "comment": p.comment} for p in prefs],
        "can_add_preferences": last >= today and not roster,
    }


def acknowledge(employee, roster_id):
    from docscanner_app.models import Roster, RosterAck
    r = Roster.objects.get(id=roster_id, company=employee.company, version__gte=1)
    RosterAck.objects.get_or_create(roster=r, employee=employee, version=r.version)


def add_preference(employee, d, kind, shift_type_id=None, comment=""):
    from docscanner_app.models import Roster, ShiftPreference, ShiftType
    if d < timezone.localdate():
        raise ValueError("Pageidavimą galima pateikti tik ateities dienoms")
    if Roster.objects.filter(company=employee.company, year=d.year, month=d.month, version__gte=1).exists():
        raise ValueError("Šio mėnesio grafikas jau paskelbtas - dėl pakeitimų kreipkitės į vadovą")
    st = ShiftType.objects.filter(id=shift_type_id, company=employee.company).first() if shift_type_id else None
    ShiftPreference.objects.filter(employee=employee, date=d).delete()
    return ShiftPreference.objects.create(employee=employee, date=d, kind=kind, shift_type=st,
                                          comment=comment[:255], source="savitarna")


def delete_preference(employee, pk):
    from docscanner_app.models import ShiftPreference
    ShiftPreference.objects.filter(id=pk, employee=employee).delete()
