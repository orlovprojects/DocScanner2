"""
Pamainų grafikai (Django dalis): uždavinio surinkimas iš DB, variantai, langelių keitimas, tikrinimas,
paskelbimas, grafikas DU skaičiavime ir suminės apskaitos laikotarpio uždarymas.
"""
import contextvars
import logging
from collections import defaultdict
from contextlib import contextmanager
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
from .planning import norm_color, variant_stats
from .shifts import Shift, holiday_hours, make_shift, night_hours

logger = logging.getLogger("docscanner_app")
ZERO = Decimal("0")

# Sudarant grafiką visam apskaitiniam laikotarpiui: jau sudaryti (dar neskelbti) to laikotarpio mėnesiai laikomi
# „dirbtais pagal juodraštį“ - kad kito mėnesio tikslas įvertintų jų perteklių / trūkumą. {(įmonės id, metai, mėn.)}
_DRAFT_MONTHS = contextvars.ContextVar("roster_draft_months", default=frozenset())


@contextmanager
def use_draft_months(company_id, months):
    token = _DRAFT_MONTHS.set(frozenset((company_id, y, m) for y, m in months))
    try:
        yield
    finally:
        _DRAFT_MONTHS.reset(token)


def _bounds(y, m):
    first = date(y, m, 1)
    return first, date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)


def _shift_obj(rs):
    from .shifts import _break_dt
    st = rs.shift_type if rs.shift_type_id else None
    start = timezone.localtime(rs.start).replace(tzinfo=None) if timezone.is_aware(rs.start) else rs.start
    end = timezone.localtime(rs.end).replace(tzinfo=None) if timezone.is_aware(rs.end) else rs.end
    return Shift(rs.employee_id, rs.date, start, end, rs.break_minutes, rs.shift_type_id, rs.locked,
                 break_start=_break_dt(rs.date, start, getattr(st, "break_start", None)) if st else None,
                 break_paid=bool(getattr(st, "break_paid", False)) if st else False)


def _from_item(it):
    bs = it.get("break_start")
    return Shift(int(it["employee_id"]), date.fromisoformat(it["date"]), datetime.fromisoformat(it["start"]),
                 datetime.fromisoformat(it["end"]), int(it.get("break_minutes") or 0), it.get("shift_type_id"),
                 break_start=datetime.fromisoformat(bs) if bs else None, break_paid=bool(it.get("break_paid")))


def published_shifts(employee, first, last):
    """Iš PASKELBTOS grafiko versijos (keičiant grafiką, kol pakeitimai nepaskelbti, galioja ankstesnė).
    Sudarant visą laikotarpį (use_draft_months) - tų mėnesių juodraščio pamainos."""
    from docscanner_app.models import Roster
    out = []
    drafts = _DRAFT_MONTHS.get()
    qs = Roster.objects.filter(company_id=employee.company_id).filter(
        Q(year__gt=first.year) | Q(year=first.year, month__gte=first.month)).filter(
        Q(year__lt=last.year) | Q(year=last.year, month__lte=last.month))
    for r in qs:
        if (r.company_id, r.year, r.month) in drafts:
            out += [_shift_obj(sh) for sh in r.shifts.filter(employee=employee, date__gte=first, date__lte=last)
                    .select_related("shift_type")]
            continue
        if r.version < 1:
            continue
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
                      "break_start": o.break_start.isoformat(timespec="minutes") if o.break_start else None,
                      "break_paid": o.break_paid,
                      "name": s.shift_type.name if s.shift_type else "", "color": norm_color(s.shift_type.color) if s.shift_type else ""})
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


def period_cfg(contract, settings):
    """Apskaitinis laikotarpis: darbuotojo sutartyje (jei nurodyta), kitaip - įmonės nustatymai."""
    months = getattr(contract, "summed_period_months", None) or settings.summed_period_months or 3
    anchor = getattr(contract, "summed_period_anchor", None) or settings.summed_period_anchor or 1
    return months, anchor


def _opening(contract, y1, m1):
    """
    Perėjimas iš kitos programos laikotarpio viduryje: {until: (y, m), worked, absence, paid_ot} arba None.
    Mėnesiai iki `until` imami iš senos programos (ne iš grafiko).
    """
    o = getattr(contract, "summed_opening", None) or {}
    if not o.get("start") or not o.get("until"):
        return None
    st = date.fromisoformat(o["start"])
    if (st.year, st.month) != (y1, m1):
        return None
    un = date.fromisoformat(o["until"])
    return {"until": (un.year, un.month), "worked": Decimal(str(o.get("worked") or 0)),
            "absence": Decimal(str(o.get("absence") or 0)), "paid_ot": Decimal(str(o.get("paid_ot") or 0))}


def summed_since(contract, on):
    """Nuo kada nepertraukiamai taikoma suminė apskaita (iki `on`) - ROS-08."""
    since = None
    for t in contract.terms.filter(valid_from__lte=on).order_by("-valid_from"):
        if getattr(t, "work_regime", "standard") != "summed":
            break
        since = t.valid_from
    return since


def _period_start(contract, y, m, months, anchor):
    """Apskaitinio laikotarpio pradžia, bet ne anksčiau nei suminės apskaitos pradžia. -> (metai, mėn., nuo datos)"""
    (y1, m1), _ = period_bounds(y, m, months, anchor)
    since = summed_since(contract, _bounds(y, m)[1])
    if since and (since.year, since.month) > (y1, m1):
        return since.year, since.month, since
    return y1, m1, since


def apply_roster(inp, employee, contract, settings):
    """Suminei apskaitai: valandos ir naktinės / šventinės - iš paskelbto grafiko; paskutinį mėnesį - atsiskaitymas."""
    first, last = _bounds(inp.year, inp.month)
    shifts = published_shifts(employee, first, last)
    dh = daily_hours(shifts)
    for sg in inp.segments:
        if sg.summed:
            sg.daily_hours = {d: h for d, h in dh.items() if sg.valid_from <= d <= sg.valid_to}
    inp.roster_extra = daily_extra(shifts)

    months, anchor = period_cfg(contract, settings)
    end = contract.effective_end
    ends_now = bool(end and first <= end <= last)      # ROS-06: atleidžiant - atsiskaitoma už išdirbtą laikotarpio dalį
    if not is_last_month(inp.year, inp.month, months, anchor) and not ends_now:
        return
    st = period_settlement(employee, contract, inp.year, inp.month, months, anchor, current_events=inp.events,
                           current_overrides=inp.overrides,
                           to_vacation=getattr(employee, "summed_overtime_to_vacation", False) and not ends_now)
    if st is None:
        return
    settlement, rate = st
    for code, hours, r, mult in settlement.lines:
        note = (f"Apskaitinis laikotarpis{' (iki atleidimo)' if ends_now else ''}: norma {settlement.norm} val., "
                f"išdirbta {settlement.worked} val.")
        if getattr(settlement, "trip_compensated", ZERO) > 0:
            note += f"; {settlement.trip_compensated} val. kelionių komandiruotėse kompensuota poilsiu"
        inp.extra_lines.append(_line(code, multiplier_pay(r, hours, mult), hours, q2(r), note))


def _line(code, amount, qty, rate, note):
    from ..run import Line
    return Line(code, amount, qty, rate, note)


def _month_timesheet(employee, contract, y, m, events=None, overrides=None, since=None):
    from ..services import _events, _overrides, terms_week
    first, last = _bounds(y, m)
    t = _summed_terms(contract, last)
    shifts = published_shifts(employee, first, last)
    start = max(contract.start_date, since) if since else contract.start_date
    employed_from = start if start > first else None      # suminė nuo mėnesio vidurio - norma tik nuo tos dienos
    end = contract.effective_end
    employed_to = end if end and end < last else None
    ts = generate(y, m, week=terms_week(t), workload=t.workload, employed_from=employed_from, employed_to=employed_to,
                  events=events if events is not None else _events(employee, first, last),
                  overrides=overrides if overrides is not None else _overrides(employee, y, m),
                  daily_schedule=daily_hours(shifts), daily_extra=daily_extra(shifts))
    _segment_norms(ts, contract, first, last)
    return ts, t


VACATION_KINDS = ("vacation", "vacation_prepaid")


def _norm_without_absences(ts):
    """
    Suminės apskaitos mėnesio norma be pateisinamų nebuvimų (VDI atmintinė apie suminę DLA):
      - kasmetinės atostogos skaičiuojamos darbo dienomis pagal 5 d. savaitę -> norma mažinama kalendorine dienos
        norma (visu etatu 8 val./d., savaitė - 40 val.);
      - kiti nebuvimai (liga, mamadieniai, nemokamos ir kt.) - grafiko pamainų valandomis (12 val. pamaina -> -12 val.);
        jei tam nebuvimui grafikas nesudarytas (pvz. ilga liga) - kalendorine norma;
      - komandiruotė - darbo laikas, normos nemažina.
    Prastova: VDI - normos nemažina, bet prastovos valandos nelaikomos nedirbtomis; balansui tai tas pats, kas
    sumažinti normą grafiko valandomis, todėl taikoma ta pati taisyklė kaip ligai.
    """
    total = sum((d.norm_hours for d in ts.days), ZERO)
    by_event = {}
    for d in ts.days:
        if d.event and d.event.kind not in WORKED_EVENTS:
            by_event.setdefault(id(d.event), []).append(d)
    for days in by_event.values():
        if days[0].event.kind in VACATION_KINDS:
            total -= sum((d.norm_hours for d in days), ZERO)
        else:
            sched = sum((d.scheduled_hours for d in days), ZERO)
            total -= sched if sched > 0 else sum((d.norm_hours for d in days), ZERO)
    return max(total, ZERO)


def _segment_norms(ts, contract, first, last, week_fn=None):
    """Sąlygos pasikeitė mėnesio viduryje (pvz. 1,0 -> 0,5 nuo 16 d.): dienos norma pagal tą dieną galiojusias sąlygas."""
    if week_fn is None:
        from ..services import terms_week as week_fn
    from ..timesheet import _scheduled
    terms = sorted(contract.terms.all(), key=lambda x: x.valid_from)
    active = [t for t in terms if t.valid_from <= last]
    if len([t for t in active if t.valid_from > first]) == 0:
        return ts
    from ..timesheet import NE
    for d in ts.days:
        if d.code == NE:
            continue
        tk = next((t for t in reversed(active) if t.valid_from <= d.date), None)
        if tk is not None:
            d.norm_hours = _scheduled(d.date, week_fn(tk), tk.workload)
    return ts


def period_settlement(employee, contract, y, m, months=3, anchor=1, current_events=None, current_overrides=None,
                      to_vacation=False):
    y1, m1, since = _period_start(contract, y, m, months, anchor)
    op = _opening(contract, y1, m1)
    items, cy, cm, t = [], y1, m1, None
    while (cy, cm) <= (y, m):
        cur = (cy, cm) == (y, m)
        if op and (cy, cm) < op["until"]:
            # senos programos mėnesiai: norma pagal kalendorių (grafiko nėra), išdirbta - perkeltas likutis
            ts, t = _month_timesheet(employee, contract, cy, cm, [], {}, since)
            items.append(PeriodMonth(cy, cm, _norm_without_absences(ts), ZERO))
        elif not cur and not _month_in_system(employee.company, cy, cm):
            ts, t = _month_timesheet(employee, contract, cy, cm, [], {}, since)
            nrm = _norm_without_absences(ts)
            items.append(PeriodMonth(cy, cm, nrm, nrm))           # mėnuo ne DokSkenas - subalansuotas
        else:
            ts, t = _month_timesheet(employee, contract, cy, cm,
                                     current_events if cur else None, current_overrides if cur else None, since)
            items.append(PeriodMonth(cy, cm, _norm_without_absences(ts), ts.worked_hours))
        cy, cm = (cy + (cm == 12), cm % 12 + 1)
    if not items or t is None:
        return None
    if op:
        # perkeltas likutis: išdirbtos val. (be jau apmokėtų viršvalandžių), nebuvimai mažina normą
        items.append(PeriodMonth(y1, m1, -op["absence"], op["worked"] - op["paid_ot"]))
    from ..services import terms_week
    rate = t.base_amount if t.pay_form == "hourly" else monthly_hourly_rate(t.base_amount, y, m, terms_week(t), t.workload)
    res = settle(items, rate, to_vacation=to_vacation)
    # Kelionių komandiruotėse valandos (DK 107): už jas jau suteiktas kompensacinis poilsis. Jei dėl jų viršyta
    # laikotarpio norma - pagal pasirinkimą (numatyta „poilsis“) jos neapmokamos dar kartą kaip viršvalandžiai.
    trip = min(res.excess, trip_comp_hours(employee, date(y1, m1, 1), _bounds(y, m)[1])) if res.excess > 0 else ZERO
    res.trip_hours, res.trip_compensated = trip, ZERO
    if trip > 0 and trip_choice(employee, y, m) != "overtime":
        res.trip_compensated = trip
        if to_vacation:
            res.vacation_hours = max(res.vacation_hours - trip * Decimal("1.5"), ZERO)
        res.lines = [(c, h - trip if c == "SAV" else h, r_, k) for c, h, r_, k in res.lines]
        res.lines = [x for x in res.lines if x[1] > 0]
    return res, rate


def trip_comp_hours(employee, d1, d2):
    """Kelionės valandos (komandiruotėse laikotarpyje), už kurias suteiktas kompensacinis poilsis."""
    from django.db.models import Sum
    from docscanner_app.models import BusinessTrip
    return (BusinessTrip.objects.filter(employee=employee, status="approved", start_at__date__gte=d1, start_at__date__lte=d2)
            .aggregate(s=Sum("comp_rest_hours"))["s"] or ZERO)


def trip_choice(employee, y, m):
    """Laikotarpio pabaigos pasirinkimas: "rest" (kompensuota poilsiu, numatyta) arba "overtime" (apmokėti)."""
    from docscanner_app.models import TimesheetMonth
    tm = TimesheetMonth.objects.filter(company_id=employee.company_id, year=y, month=m).first()
    return ((getattr(tm, "period_trip_choices", None) or {}).get(str(employee.id)) or {}).get("choice", "rest")


VAC_REASON = "Suminė apskaita {y1}-{m1:02d}–{y}-{m:02d}: viršyta norma"


def close_period_vacation(run):
    """Tvirtinant paskutinio laikotarpio mėnesio DU: darbuotojo prašymu viršytos val. x1,5 -> prie atostogų."""
    from docscanner_app.models import VacationAdjustment
    from ..services import _active_contract, _settings
    st = _settings(run.company)
    months, anchor = st.summed_period_months or 3, st.summed_period_anchor or 1
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
        if c.effective_end and c.effective_end <= last:      # atleidžiamam - apmokama, ne prie atostogų
            continue
        cm_, ca_ = period_cfg(c, st)
        if not is_last_month(run.year, run.month, cm_, ca_):
            continue
        out = period_settlement(e, c, run.year, run.month, cm_, ca_, to_vacation=True)
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


def fixed_employees(company, first, last):
    """Darbuotojai su standartine apskaita (darbo laikas pagal sutartį): [(employee, contract, terms)].
    Grafike rodomi tik peržiūrai ir nebuvimams žymėti - generatorius, poreikis ir normos jų neliečia."""
    from docscanner_app.models import EmploymentContract
    summed, fixed = set(), {}
    qs = (EmploymentContract.objects.filter(employee__company=company, start_date__lte=last)
          .filter(Q(termination_date__isnull=True) | Q(termination_date__gte=first))
          .exclude(status="draft").select_related("employee").order_by("start_date"))
    for c in qs:
        t = _summed_terms(c, last)
        if t is None:
            continue
        if getattr(t, "work_regime", "standard") == "summed":
            summed.add(c.employee_id)
        else:
            fixed[c.employee_id] = (c.employee, c, t)           # vėlesnė sutartis perrašo ankstesnę
    return [v for k, v in fixed.items() if k not in summed]


def fixed_day_hours(contract, terms, year, month):
    """{data ISO: valandos} - darbo dienos pagal sutarties savaitę ir darbo kalendorių (šventės, prieššventinės)."""
    from ..services import terms_week
    first, last = _bounds(year, month)
    end = contract.effective_end
    ts = generate(year, month, week=terms_week(terms), workload=terms.workload or Decimal("1"),
                  employed_from=contract.start_date if contract.start_date > first else None,
                  employed_to=end if end and end < last else None)
    return {d.date.isoformat(): str(d.scheduled_hours) for d in ts.days if d.scheduled_hours > 0}


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


def _trip_hours(employee, first, last):
    """{data: valandos} patvirtintų komandiruočių dienoms (kelionė + darbas) - užima dieną grafike, įskaitoma į normą."""
    from docscanner_app.models import BusinessTrip
    out = {}
    for t in BusinessTrip.objects.filter(employee=employee, status="approved", start_at__date__lte=last, end_at__date__gte=first):
        for r in t.day_plan or []:
            d = date.fromisoformat(r["date"])
            if first <= d <= last:
                out[d] = out.get(d, ZERO) + Decimal(r["total"])
    return out


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


# Nebuvimai, su kuriais pamaina tą dieną lieka grafike (mamadienis - pamainos dieną, pravaikšta - praleista pamaina,
# prastova - darbuotojas buvo pasirengęs dirbti); kiti nebuvimai pamainą pašalina (juodraštyje) arba žymimi konfliktu
WITH_SHIFT_KINDS = ("parent_day", "truancy", "downtime", "business_trip")

# Grafiko UI žymėjimų tipai (GrafikaiPage: annual, sick, unpaid, family_day, childcare, maternity, truancy, other)
UI_ABSENCE_KIND = {"vacation": "annual", "vacation_prepaid": "annual", "sick": "sick", "unpaid": "unpaid",
                   "parent_day": "family day", "childcare": "childcare", "maternity": "maternity leave",
                   "truancy": "truancy", "business_trip": "trip", "comp_rest": "other"}


def _date_range(a, b):
    while a <= b:
        yield a
        a += timedelta(days=1)


def _absence_details(employee, first, last):
    """Nebuvimai su rūšimi grafiko langeliams (ikonos) ir šalinimui: [{id, kind, label, start_date, end_date}]."""
    from docscanner_app.models import AbsenceEvent
    return [{"id": e.id, "kind": UI_ABSENCE_KIND.get(e.kind, "other"), "raw": e.kind,
             "label": e.comment if e.kind == "business_trip" and e.comment else e.get_kind_display(),
             "start_date": max(e.start_date, first).isoformat(), "end_date": min(e.end_date, last).isoformat()}
            for e in AbsenceEvent.objects.filter(employee=employee, status="approved", start_date__lte=last, end_date__gte=first)
            if e.kind not in WORKED_EVENTS or e.kind == "business_trip"]


def _month_in_system(company, y, m):
    """Ar tas mėnuo jau tvarkytas DokSkenas: paskelbtas grafikas arba DU skaičiavimas. Kitaip (pvz. iki DU pradžios
    DokSkenas, be perkelto likučio) - laikoma, kad norma išdirbta: jokio perkėlimo ir suminės apskaitos atsiskaitymo."""
    from docscanner_app.models import PayrollRun, Roster
    from ..services import CLOSED_STATUSES
    if (company.id, y, m) in _DRAFT_MONTHS.get():                      # sudaromas visas laikotarpis
        return True
    # juodraštinis DU skaičiavimas sukuriamas vos atidarius mėnesį (tabelis, atlyginimai) - jo nepakanka
    return (Roster.objects.filter(company=company, year=y, month=m, version__gte=1).exists()
            or PayrollRun.objects.filter(company=company, year=y, month=m, status__in=CLOSED_STATUSES).exists())


def employee_target_info(employee, contract, terms, y, m, settings):
    """
    Mėnesio valandų tikslas ir iš ko jis susideda (grafiko patarimui):
      tikslas = šio mėnesio norma (be nebuvimų) + ankstesnių laikotarpio mėnesių skirtumas.
    """
    from .period import period_bounds
    months, anchor = period_cfg(contract, settings)
    y1, m1, since = _period_start(contract, y, m, months, anchor)      # ROS-08: tik suminės apskaitos mėnesiai
    op = _opening(contract, y1, m1)
    ts, _ = _month_timesheet(employee, contract, y, m, since=since)
    month_norm = _norm_without_absences(ts)
    cy, cm, carry, worked_before, norm_before = y1, m1, ZERO, ZERO, ZERO
    while (cy, cm) < (y, m):
        pts, _ = _month_timesheet(employee, contract, cy, cm, since=since)
        nrm = _norm_without_absences(pts)
        norm_before += nrm
        if op and (cy, cm) < op["until"]:
            carry += nrm                                              # senos programos mėnuo - tik norma
        elif not _month_in_system(employee.company, cy, cm):
            worked_before += nrm                                      # mėnuo ne DokSkenas - laikomas subalansuotu
        else:
            carry += nrm - pts.worked_hours
            worked_before += pts.worked_hours
        cy, cm = (cy + (cm == 12), cm % 12 + 1)
    if op and (y1, m1) < (y, m):
        carry += -op["absence"] - op["worked"]
        worked_before += op["worked"]
        norm_before -= op["absence"]
    (_, _), (y2, m2) = period_bounds(y, m, months, anchor)
    norm_after, cy, cm = ZERO, y, m
    while (cy, cm) <= (y2, m2):
        if (cy, cm) != (y, m):
            pts, _ = _month_timesheet(employee, contract, cy, cm, since=since)
            norm_after += _norm_without_absences(pts)
        cy, cm = (cy + (cm == 12), cm % 12 + 1)
    return {"target": max(month_norm + carry, ZERO), "month_norm": month_norm, "carry": carry,
            "period_from": f"{y1}-{m1:02d}", "period_to": f"{y2}-{m2:02d}", "period_months": months,
            "period_norm": norm_before + month_norm + norm_after, "worked_before": worked_before}


def employee_target(employee, contract, terms, y, m, settings):
    """Mėnesio valandų tikslas = mėnesio norma (be nebuvimų) + ankstesnių laikotarpio mėnesių skirtumas."""
    return employee_target_info(employee, contract, terms, y, m, settings)["target"]


def build_problem(company, y, m, roster=None, transform=None):
    """transform(args) -> args: taisant grafiką pakeičiamos dienos, tikslai ir pan. (žr. repair.py)."""
    from docscanner_app.models import RosterShift, ScheduleRule, ShiftPreference, ShiftType
    from ..services import _settings, terms_week
    from .solver import Emp, Pref, Problem, Rule, ShiftDef

    st = _settings(company)
    first, last = _bounds(y, m)
    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    shifts = [ShiftDef(s.id, s.code, s.start_time, s.end_time, s.break_minutes,
                       getattr(s, "break_start", None), getattr(s, "break_paid", False))
              for s in ShiftType.objects.filter(company=company, is_active=True)]
    if not shifts:
        raise ValueError("Nėra pamainų tipų - sukurkite bent vieną (pvz. „Diena 7-19“)")
    staff = summed_employees(company, first, last)
    if not staff:
        raise ValueError("Nėra darbuotojų su sumine darbo laiko apskaita šį mėnesį")

    emps = []
    for e, c, t in staff:
        unavailable = _absence_dates(e, first, last) | set(_trip_hours(e, first, last))
        if c.start_date > first:
            unavailable |= {d for d in days if d < c.start_date}
        if c.effective_end and c.effective_end < last:
            unavailable |= {d for d in days if d > c.effective_end}
        rate = t.base_amount if t.pay_form == "hourly" else monthly_hourly_rate(t.base_amount, y, m, terms_week(t), t.workload)
        emps.append(Emp(e.id, e.full_name, max(employee_target(e, c, t, y, m, st) - sum(_trip_hours(e, first, last).values(), ZERO), ZERO), q2(rate),
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
    args = dict(days=days, shifts=shifts, emps=emps, rules=rules, prefs=prefs, locked=locked, history=history,
                slots=plan_slots(roster) if roster else None)
    if transform:
        args = transform(args)
    return Problem(**args)


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
    items = [x for x in roster.slots.values_list("date", "shift_type_id", "min_staff", "max_staff") if x[2] or x[3]]
    if not items:
        return None
    return {(d, sid): (mn, mx) for d, sid, mn, mx in items}


def _month_days(roster):
    first, last = _bounds(roster.year, roster.month)
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


@transaction.atomic
def slot_set(roster, d, shift_type_id, min_staff, max_staff=None):
    from docscanner_app.models import RosterSlot, ShiftType
    st = ShiftType.objects.filter(id=shift_type_id, company=roster.company).first()
    if st is None:
        raise ValueError("Pamaina nerasta")
    mn = int(min_staff or 0)
    if not st.is_active and (mn > 0 or max_staff not in (None, "", 0)) and \
            not RosterSlot.objects.filter(roster=roster, date=d, shift_type_id=shift_type_id).exists():
        raise ValueError(f"Pamaina „{st.name}“ neaktyvi – įjunkite ją skiltyje „Pamainos ir žymos“")
    mx = None if max_staff in (None, "") else int(max_staff)
    if mn <= 0 and not mx:
        # rankiniu būdu pašalinta - išsaugoma 0 (source=manual), kad automatinis planas nepridėtų atgal
        RosterSlot.objects.update_or_create(roster=roster, date=d, shift_type_id=shift_type_id,
                                            defaults={"min_staff": 0, "max_staff": None, "source": "manual"})
        return None
    if mx is not None and mx < mn:
        raise ValueError("„Iki“ negali būti mažiau nei „nuo“")
    obj, _ = RosterSlot.objects.update_or_create(roster=roster, date=d, shift_type_id=shift_type_id,
                                                 defaults={"min_staff": mn, "max_staff": mx, "source": "manual"})
    return obj


@transaction.atomic
def clear_shifts(roster):
    """Išvalyti grafiką (juodraštį): visos pamainos pašalinamos; poreikis ir variantai lieka."""
    _editable(roster)
    n = roster.shifts.count()
    roster.shifts.all().delete()
    return n


@transaction.atomic
def clear_plan(roster):
    """Išvalyti darbuotojų poreikį: visi plano langeliai (ir rankiniai) pašalinami."""
    _editable(roster)
    n = roster.slots.count()
    roster.slots.all().delete()
    return n


@transaction.atomic
def plan_from_rules(roster):
    """
    Užpildo planą: numatytas pamainų poreikis pagal savaitės dienas + taisyklės „Darbuotojų skaičius pamainoje“.
    Rankiniu būdu pakeisti konkrečių dienų nustatymai (source=manual) paliekami.
    """
    from docscanner_app.models import RosterSlot, ScheduleRule, ShiftType
    from .planning import build_plan
    first, last = _bounds(roster.year, roster.month)
    types = [(t.id, t.default_staff_need_by_weekday, getattr(t, "default_staff_max_by_weekday", None))
             for t in ShiftType.objects.filter(company=roster.company, is_active=True)]
    if not types:
        raise ValueError("Nėra aktyvių pamainų – sukurkite arba įjunkite jas skiltyje „Pamainos ir žymos“")
    rules = []                       # poreikis - tik iš pamainų nustatymų ir rankinių dienų pakeitimų
    manual = {(s.date, s.shift_type_id): (s.min_staff, s.max_staff) for s in roster.slots.filter(source="manual")}
    plan = build_plan(_month_days(roster), types, rules, is_holiday, manual)
    roster.slots.exclude(source="manual").delete()
    RosterSlot.objects.bulk_create([RosterSlot(roster=roster, date=d, shift_type_id=sid, min_staff=mn, max_staff=mx,
                                               source="auto")
                                    for (d, sid), (mn, mx) in plan.items() if (d, sid) not in manual])
    if not plan:
        raise ValueError("Plane nėra nė vienos pamainos – nurodykite numatytą darbuotojų poreikį pamainoms")
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
                                       min_staff=it.get("min") or 0, max_staff=it.get("max"), source="manual"))
    RosterSlot.objects.bulk_create(objs, ignore_conflicts=True)
    return len(objs)


@transaction.atomic
def copy_prev_plan(roster, from_year=None, from_month=None):
    """
    Poreikis iš kito mėnesio (pagal nutylėjimą - praėjusio):
      - data paima tą pačią savaitės dieną tuo pačiu eilės numeriu (1-as pirmadienis <- 1-as pirmadienis);
        jei šaltinyje tokios nėra (5-as antradienis) - paskutinė tokia savaitės diena;
      - šaltinio šventės praleidžiamos (imama artimiausia paprasta ta pati savaitės diena);
      - tikslo mėnesio šventės nekopijuojamos - jų poreikis iš pamainų nustatymų (kaip sekmadienį);
      - nukopijuotas poreikis žymimas kaip rankinis (pamainų nustatymai jo neperrašo).
    """
    from docscanner_app.models import Roster, RosterSlot, ShiftType
    from .planning import build_plan
    if from_year and from_month:
        py, pm = int(from_year), int(from_month)
    else:
        py, pm = (roster.year - (roster.month == 1), (roster.month - 2) % 12 + 1)
    if (py, pm) == (roster.year, roster.month):
        raise ValueError("Pasirinkite kitą mėnesį")
    src = Roster.objects.filter(company=roster.company, year=py, month=pm).first()
    if not src or not src.slots.exclude(min_staff=0, max_staff__isnull=True).exists():
        raise ValueError(f"{py}-{pm:02d} poreikio nėra")
    by_day = defaultdict(list)
    for sl in src.slots.all():
        by_day[sl.date].append(sl)
    target = _month_days(roster)
    holiday_defaults = build_plan([d for d in target if is_holiday(d)],
                                  [(t.id, t.default_staff_need_by_weekday, getattr(t, "default_staff_max_by_weekday", None))
                                   for t in ShiftType.objects.filter(company=roster.company, is_active=True)], [], is_holiday)
    roster.slots.all().delete()
    objs = []
    for d in target:
        if is_holiday(d):
            for (hd, sid), (mn, mx) in holiday_defaults.items():
                if hd == d:
                    objs.append(RosterSlot(roster=roster, date=d, shift_type_id=sid, min_staff=mn, max_staff=mx, source="auto"))
            continue
        s_day = copy_source_day(d, py, pm)
        if s_day is None:
            continue
        for sl in by_day.get(s_day, []):
            objs.append(RosterSlot(roster=roster, date=d, shift_type_id=sl.shift_type_id,
                                   min_staff=sl.min_staff, max_staff=sl.max_staff, source="manual"))
    RosterSlot.objects.bulk_create(objs, ignore_conflicts=True)
    return len(objs)


def copy_source_day(d, src_year, src_month):
    """Testams / paaiškinimui: iš kurios šaltinio dienos imamas poreikis tikslo datai d (None - šventė, iš nustatymų)."""
    if is_holiday(d):
        return None
    pf, pl = _bounds(src_year, src_month)
    src_days = [pf + timedelta(days=i) for i in range((pl - pf).days + 1)]
    cands = [x for x in src_days if x.weekday() == d.weekday() and not is_holiday(x)]
    if not cands:
        return None
    nth = (d.day - 1) // 7
    same = [x for x in src_days if x.weekday() == d.weekday() and (x.day - 1) // 7 == nth]
    if same and not is_holiday(same[0]):
        return same[0]
    ref = same[0] if same else cands[-1]
    return min(cands, key=lambda x: (abs((x - ref).days), x))


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


def _days_info(first, last):
    from ..work_calendar import holidays, is_pre_holiday
    names = {**holidays(first.year), **holidays(last.year)}
    out = []
    for i in range((last - first).days + 1):
        d = first + timedelta(days=i)
        out.append({"date": d.isoformat(), "weekday": d.weekday(), "holiday": d in names,
                    "holiday_name": names.get(d, ""), "pre_holiday": is_pre_holiday(d) and d not in names})
    return out


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


def _variant_diff(variants, i, names):
    """Kiek langelių variantas skiriasi nuo 1-ojo: {"cells": n, "people": [{"name", "n"}]} (1-ajam - None)."""
    if i == 0 or not variants:
        return None
    cell = lambda v: {(a[0], a[1]): a[2] for a in v["assignments"]}   # noqa: E731
    a, b = cell(variants[0]), cell(variants[i])
    diff = [k for k in set(a) | set(b) if a.get(k) != b.get(k)]
    per = {}
    for e, _ in diff:
        per[e] = per.get(e, 0) + 1
    return {"cells": len(diff), "people": [{"name": names.get(e, str(e)), "n": n}
                                            for e, n in sorted(per.items(), key=lambda x: -x[1])[:4]]}


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

        variants, uniq = solve_variants(build, n=n, seconds=seconds), []
        for v in variants:                                   # vienodi variantai nerodomi
            key = frozenset(v.assignments)
            if all(key != frozenset(u.assignments) for u in uniq):
                uniq.append(v)
        variants = uniq
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


def period_months(company, y, m):
    """Įmonės apskaitinio laikotarpio, į kurį patenka mėnuo, mėnesiai: [(metai, mėn.)]."""
    from ..services import _settings
    st = _settings(company)
    (y1, m1), (y2, m2) = period_bounds(y, m, st.summed_period_months or 3, st.summed_period_anchor or 1)
    out, cy, cm = [], y1, m1
    while (cy, cm) <= (y2, m2):
        out.append((cy, cm))
        cy, cm = (cy + (cm == 12), cm % 12 + 1)
    return out


def period_plan(company, y, m):
    """
    Apskaitinio laikotarpio mėnesiai ir kas su jais būtų daroma „sudarant visam laikotarpiui“:
      todo      - bus sudarytas (ateities mėnuo, dar neskelbtas);
      published - jau paskelbtas, nekeičiamas (jo valandos įskaitomos į laikotarpio normą);
      started   - einamasis mėnuo jau prasidėjo - nekeičiamas (jei reikia - sudaromas atskirai „šiam mėnesiui“);
      past      - praėjęs mėnuo, nekeičiamas.
    gen - to mėnesio sudarymo būsena (queued / running / done / error) eigai rodyti.
    """
    from docscanner_app.models import Roster
    today = timezone.localdate()
    rosters = {(r.year, r.month): r for r in Roster.objects.filter(company=company)}
    out = []
    for (py, pm) in period_months(company, y, m):
        r = rosters.get((py, pm))
        if r and r.version >= 1:
            state = "published"
        elif (py, pm) < (today.year, today.month):
            state = "past"
        elif (py, pm) == (today.year, today.month):
            state = "started"
        else:
            state = "todo"
        first, _ = _bounds(py, pm)
        summ = (r.summary or {}) if r else {}
        has_shifts = bool(r and r.shifts.exists())
        stale = False
        if r is not None and has_shifts:
            from .repair import stale_info
            stale = bool(stale_info(r))
        out.append({"ym": f"{py}-{pm:02d}", "state": state, "has_shifts": has_shifts, "stale": stale,
                    "locked_shifts": r.shifts.filter(locked=True).count() if r else 0,
                    "publish_deadline": (first - timedelta(days=7)).isoformat(),
                    "gen": summ.get("state") if summ.get("period_chain") else None,
                    "gen_error": summ.get("error") or ""})
    return out


def _best_variant(variants):
    return min(range(len(variants)), key=lambda i: (len(variants[i].get("unmet") or []), Decimal(variants[i]["cost"])))


def generate_period(company, y, m, n=3, seconds=30):
    """
    Grafikas visam apskaitiniam laikotarpiui: neskelbti mėnesiai sudaromi iš eilės, kiekvienam pritaikomas geriausias
    variantas, o kito mėnesio tikslas jau įvertina ankstesnių mėnesių juodraščio valandas (perteklius / trūkumas
    išlyginamas laikotarpio viduje). Paskelbti mėnesiai nekeičiami. Variantus kiekvienam mėnesiui galima perrinkti.
    """
    months = [tuple(map(int, x["ym"].split("-"))) for x in period_plan(company, y, m) if x["state"] == "todo"]
    chain = [f"{a}-{b:02d}" for a, b in months]
    done, failed = [], None
    for (py, pm) in months:
        roster = get_roster(company, py, pm)
        if failed:                                          # be ankstesnio mėnesio kitų tikslai būtų netikslūs
            roster.summary = dict(roster.summary or {}, state="error", period_chain=chain,
                                  error=f"Nesudaryta, nes nepavyko sudaryti {failed}")
            roster.save(update_fields=["summary", "updated_at"])
            continue
        try:
            precheck(company, py, pm)
            if not roster.slots.exclude(min_staff=0, max_staff__isnull=True).exists():
                plan_from_rules(roster)
            with use_draft_months(company.id, done):
                summary = generate_variants(roster, n=n, seconds=seconds)
            if summary.get("state") != "done" or not summary.get("variants"):
                raise ValueError(summary.get("error") or "Grafiko sudaryti nepavyko")
            roster.refresh_from_db()
            idx = _best_variant(summary["variants"])
            apply_variant(roster, idx)
            roster.refresh_from_db()
            roster.summary = dict(roster.summary or {}, auto_applied=idx, period_chain=chain)
            roster.save(update_fields=["summary", "updated_at"])
            done.append((py, pm))
        except ValueError as e:
            roster.refresh_from_db()
            roster.summary = dict(roster.summary or {}, state="error", error=str(e), period_chain=chain)
            roster.save(update_fields=["summary", "updated_at"])
            failed = f"{py}-{pm:02d}"
    return [f"{a}-{b:02d}" for a, b in done]


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
        sh = make_shift(e, d, st.start_time, st.end_time, st.break_minutes, sid,
                        getattr(st, "break_start", None), getattr(st, "break_paid", False))
        objs.append(RosterShift(roster=roster, employee_id=e, date=d, shift_type=st, start=_aware(sh.start),
                                end=_aware(sh.end), break_minutes=st.break_minutes, source="auto"))
    RosterShift.objects.bulk_create(objs)
    roster.cost = Decimal(variants[index]["cost"])
    from .repair import record_inputs
    record_inputs(roster, save=False)                       # nuo ko sudarytas - kad vėliau matytume, kas pasikeitė
    roster.save(update_fields=["cost", "summary", "updated_at"])
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
        from docscanner_app.models import AbsenceEvent
        if not (cur and cur.shift_type_id == st.id) and AbsenceEvent.objects.filter(
                employee_id=employee_id, kind="business_trip", status="approved", start_date__lte=d, end_date__gte=d).exists():
            raise ValueError("Darbuotojas tą dieną komandiruotėje – pamainos skirti negalima")
        if not st.is_active and not (cur and cur.shift_type_id == st.id):
            raise ValueError(f"Pamaina „{st.name}“ neaktyvi – naujai priskirti negalima")
        sh = make_shift(employee_id, d, st.start_time, st.end_time, st.break_minutes, st.id,
                        getattr(st, "break_start", None), getattr(st, "break_paid", False))
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
    from docscanner_app.models import Roster, ShiftType
    from .repair import repair_view, stale_info
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
        info = employee_target_info(e, c, t, roster.year, roster.month, st)    # visada aktualus (ne iš sudarymo metu)
        target = info["target"]
        employees.append({"id": e.id, "name": e.full_name, "position": t.position.name if t.position_id and t.position else "",
                          "hours": str(hours), "target": str(target), "diff": str(hours - target),
                          "target_info": {k: (str(v) if isinstance(v, Decimal) else v) for k, v in info.items()},
                          "absences": sorted(d.isoformat() for d in _absence_dates(e, first, last)),
                          "absence_details": _absence_details(e, first, last)})
    violations = [{"employee_id": v.employee_id, "date": str(v.day), "code": v.code, "message": v.message}
                  for v in check(objs)]

    # planas, taisyklės, patarimai
    from .rulecheck import check_rules, plan_hints
    ids = [x.id for x, _, _ in staff]
    # mamadienis / tėvadienis suminėje apskaitoje - suteikiamas pamainos dieną: pamaina grafike lieka (pagal ją
    # mažinama norma ir mokamas VDU), bet nelaikoma pažeidimu ir neįskaitoma į pamainos darbuotojų skaičių
    parent_days = {(x["id"], dd) for x in employees for a in x.get("absence_details", []) if a.get("raw") in WITH_SHIFT_KINDS
                   for dd in _date_range(date.fromisoformat(a["start_date"]), date.fromisoformat(a["end_date"]))}
    absences = {x["id"]: {date.fromisoformat(d) for d in x["absences"]} - {dd for (eid, dd) in parent_days if eid == x["id"]}
                for x in employees}
    types_all = list(ShiftType.objects.filter(company=roster.company, is_active=True))
    shift_ids = [t.id for t in types_all]
    night_ids = [t.id for t in types_all if night_hours(make_shift(0, first, t.start_time, t.end_time)) >= Decimal("3")]
    rules = load_rules(roster.company, ids, first, last)
    slots = plan_slots(roster)
    assignments = [(s.employee_id, s.date, s.shift_type_id) for s in shifts
                   if s.shift_type_id and (s.employee_id, s.date) not in parent_days]
    rule_viol = check_rules(assignments, shift_ids, rules, slots, absences, night_ids)
    # Pamainos nebuvimo dieną (atostogos, liga, nemokamos ir pan.) - darbuotojas nedirbs: į poreikį neįskaitomos
    names = {x["id"]: x["name"] for x in employees}
    labels = {(x["id"], dd): a["label"] for x in employees for a in x.get("absence_details", [])
              for dd in _date_range(date.fromisoformat(a["start_date"]), date.fromisoformat(a["end_date"]))}
    absence_conflicts = [{"employee_id": e, "name": names.get(e, ""), "date": d.isoformat(), "shift_type_id": sid,
                          "label": labels.get((e, d), "Nebuvimas")}
                         for e, d, sid in assignments if d in absences.get(e, set())]
    counts = defaultdict(int)
    for e, d, sid in assignments:
        if d not in absences.get(e, set()):
            counts[d, sid] += 1
    slots_view = [{"date": d.isoformat(), "shift_type_id": sid, "min": mn, "max": mx, "assigned": counts.get((d, sid), 0)}
                  for (d, sid), (mn, mx) in sorted((slots or {}).items())]
    if slots:
        hours = {t.id: make_shift(0, first, t.start_time, t.end_time, t.break_minutes, None,
                                  getattr(t, "break_start", None), getattr(t, "break_paid", False)).hours
                 for t in ShiftType.objects.filter(company=roster.company)}   # ir neaktyvios - plane gali likti senų slotų
        hints = plan_hints(slots, hours, [(x["id"], x["name"], Decimal(x["target"])) for x in employees],
                           rules, shift_ids, absences)
    elif staff:
        hints = [{"level": "info", "message":
                  "Darbuotojų poreikis bus paimtas iš pamainų nustatymų (reikia / daugiausia pagal savaitės dienas), "
                  "kai sudarysite grafiką."}]
    else:
        hints = []
    # Plano rizikos (netrukdo skelbti): suminėje apskaitoje viršvalandžių planuoti negalima
    for x in employees:
        try:
            over = Decimal(x["hours"]) - Decimal(x["target"])
        except Exception:                                    # noqa: BLE001
            continue
        if over > Decimal("4"):
            hints.append({"level": "warning", "employee_id": x["id"],
                          "message": f"Suplanuota {over:.0f} val. daugiau nei norma – suminėje apskaitoje viršvalandžių "
                                     "grafike planuoti negalima (perkelkite pamainas kitiems)"})
    return {
        "id": roster.id, "year": roster.year, "month": roster.month, "status": roster.status,
        "version": roster.version, "published_at": roster.published_at,
        "publish_deadline": (first - timedelta(days=7)).isoformat(),
        "days": _days_info(first, last),
        "plan_months": [f"{y}-{m:02d}" for y, m in Roster.objects.filter(company=roster.company)
                        .exclude(year=roster.year, month=roster.month)
                        .filter(slots__isnull=False).values_list("year", "month").distinct().order_by("-year", "-month")[:24]],
        "shift_types": [{"id": s.id, "name": s.name, "code": s.code, "start": s.start_time.strftime("%H:%M"),
                         "end": s.end_time.strftime("%H:%M"), "color": norm_color(s.color)}
                        for s in ShiftType.objects.filter(company=roster.company, is_active=True)],
        "employees": employees,
        "period": period_plan(roster.company, roster.year, roster.month),
        # standartinė apskaita - tik peržiūrai ir nebuvimams (rodomi sąrašo apačioje, kai filtre „Standartinė“ / „Visi“)
        "fixed_employees": [{"id": e.id, "name": e.full_name, "fixed": True,
                             "position": t.position.name if t.position_id and t.position else "",
                             "fixed_days": fixed_day_hours(c, t, roster.year, roster.month),
                             "absences": sorted(d.isoformat() for d in _absence_dates(e, first, last)),
                             "absence_details": _absence_details(e, first, last)}
                            for e, c, t in fixed_employees(roster.company, first, last)],
        "shifts": [{"id": s.id, "employee_id": s.employee_id, "date": s.date.isoformat(), "shift_type_id": s.shift_type_id,
                    "locked": s.locked, "hours": str(o.hours), "night": str(night_hours(o)), "holiday": str(holiday_hours(o))}
                   for s, o in zip(shifts, objs)],
        "violations": violations,
        "absence_conflicts": absence_conflicts,
        "slots": slots_view,
        "rule_violations": rule_viol,
        "hints": hints,
        "templates": list(roster.company.roster_week_templates.values("id", "name")),
        "cost": str(roster.cost) if roster.cost is not None else None,
        "stale": stale_info(roster, employees),
        "repair": repair_view(roster),
        "generation": {k: v for k, v in (roster.summary or {}).items() if k not in ("variants", "targets", "inputs", "inputs_published", "repair")} | {
            "variants": [{"index": i, "cost": v["cost"], "unmet": v["unmet"], "status": v["status"],
                          "diff": _variant_diff((roster.summary or {}).get("variants") or [], i,
                                                {x["id"]: x["name"] for x in employees}),
                          "stats": variant_stats([tuple(a) for a in v["assignments"]], v.get("hours"),
                                                 (roster.summary or {}).get("targets") or {}, slots, night_ids,
                                                 {x["id"]: x["name"] for x in employees})}
                         for i, v in enumerate((roster.summary or {}).get("variants") or [])]},
        "acks": list(roster.acks.filter(version=roster.version).values_list("employee_id", flat=True)),
        "pending_reason": roster.pending_reason,
        "reasons": REASONS,
        "history": _history(roster),
    }


class LawViolationsError(Exception):
    def __init__(self, items):
        super().__init__("law")
        self.items = items


class LateChangeError(Exception):
    def __init__(self, items):
        super().__init__("late")
        self.items = items


REASONS = {
    "illness": "Darbuotojo liga ar kitas nebuvimas",
    "unforeseen": "Kita nuo darbdavio nepriklausanti priežastis",
    "employee_request": "Darbuotojo prašymu / šalių susitarimu",
}


def blocking_absence_days(company, employee_ids, first, last):
    """{(darbuotojas, data)} - dienos su nebuvimu, kai pamaina negalima (ne mamadienis, pravaikšta, prastova, komandiruotė)."""
    from docscanner_app.models import AbsenceEvent
    out = set()
    for e in AbsenceEvent.objects.filter(employee__company=company, employee_id__in=employee_ids, status="approved",
                                         start_date__lte=last, end_date__gte=first):
        if e.kind in WORKED_EVENTS or e.kind in WITH_SHIFT_KINDS:
            continue
        for d in _date_range(max(e.start_date, first), min(e.end_date, last)):
            out.add((e.employee_id, d))
    return out


def remove_absence_shifts(roster):
    """
    Niekada neskelbtas grafikas: pamainos, sutampančios su nebuvimais (pvz. likusios iš senesnių duomenų ar
    Sodros importo), pašalinamos ir įsimenamos nebuvime (ištrynus nebuvimą - grąžinamos). -> kiek pašalinta.
    """
    from ..services import sync_roster_absence
    from docscanner_app.models import AbsenceEvent
    _editable(roster)
    if roster.version:
        raise ValueError("Grafikas jau buvo paskelbtas – pamainos lieka perbrauktos, paskirkite pakaitinius")
    first, last = _bounds(roster.year, roster.month)
    before = roster.shifts.count()
    for ev in AbsenceEvent.objects.filter(employee__company=roster.company, status="approved",
                                          start_date__lte=last, end_date__gte=first):
        sync_roster_absence(ev)
    return before - roster.shifts.count()


@transaction.atomic
def unlock(roster, reason, comment=""):
    if roster.status != "published":
        return roster
    if reason not in REASONS:
        raise ValueError("Nurodykite keitimo priežastį")
    roster.status = "editing"
    roster.pending_reason = (REASONS[reason] + (f": {comment}" if comment else ""))[:255]
    summary = dict(roster.summary or {})
    if summary.get("inputs"):                    # panaikinus pakeitimus - grąžinama kartu su paskelbta versija
        summary["inputs_published"] = summary["inputs"]
    roster.summary = summary
    roster.save(update_fields=["status", "pending_reason", "summary", "updated_at"])
    return roster


@transaction.atomic
def discard_changes(roster):
    """
    „Panaikinti pakeitimus“: atrakintas grafikas grąžinamas į paskutinę paskelbtą versiją ir vėl užrakinamas.
    Pamainos atkuriamos iš paskelbtos versijos (užrakinimo žymė paliekama, jei pamaina ta pati).
    """
    from docscanner_app.models import RosterShift, ShiftType
    if roster.status != "editing" or roster.version < 1:
        raise ValueError("Nepaskelbtų pakeitimų nėra")
    types = {s.id: s for s in ShiftType.objects.filter(company=roster.company)}
    locked = set(roster.shifts.filter(locked=True).values_list("employee_id", "date", "shift_type_id"))
    roster.shifts.all().delete()
    objs = []
    for it in roster.published_snapshot or []:
        o = _from_item(it)
        sid = it.get("shift_type_id")
        objs.append(RosterShift(roster=roster, employee_id=o.employee_id, date=o.day, shift_type=types.get(sid),
                                start=_aware(o.start), end=_aware(o.end), break_minutes=o.break_minutes,
                                locked=(o.employee_id, o.day, sid) in locked, source="manual"))
    RosterShift.objects.bulk_create(objs)
    summary = dict(roster.summary or {})
    if "inputs_published" in summary:
        summary["inputs"] = summary.pop("inputs_published")
    summary.pop("repair", None)
    roster.status, roster.pending_reason, roster.summary = "published", "", summary
    roster.save(update_fields=["status", "pending_reason", "summary", "updated_at"])
    return roster


@transaction.atomic
def _prev_month_items(roster):
    from docscanner_app.models import Roster
    py, pm = (roster.year - 1, 12) if roster.month == 1 else (roster.year, roster.month - 1)
    prev = Roster.objects.filter(company=roster.company, year=py, month=pm, version__gte=1).first()
    return list(prev.published_snapshot or []) if prev else []


def _calendar_workdays(today, until):
    """Darbo dienos (pagal kalendorių) nuo rytojaus iki `until` (neįskaitant) - ISO."""
    from ..work_calendar import is_holiday
    out, d = [], today + timedelta(days=1)
    while d < until:
        if d.weekday() < 5 and not is_holiday(d):
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def publish(roster, user, confirm_late=False, confirm_violations=False):
    from docscanner_app.models import Employee, RosterAck, RosterChange
    from ..savitarna_emails import notify_roster
    from .changes import diff, late_changes, lines_for

    if not confirm_violations:              # ROS-01: DK pažeidimai - tik sąmoningai patvirtinus
        viol = check([_shift_obj(x) for x in roster.shifts.all()])
        if viol:
            names = dict(roster.shifts.values_list("employee_id", "employee__first_name"))
            raise LawViolationsError([{"employee_id": v.employee_id, "employee": names.get(v.employee_id, ""),
                                       "date": str(v.day), "message": v.message} for v in viol[:30]])

    first, _ = _bounds(roster.year, roster.month)
    new = snapshot(roster)
    if roster.version == 0:
        late = timezone.localdate() > first - timedelta(days=7)
        if not (roster.summary or {}).get("inputs"):        # sudarytas rankiniu būdu - atskaitos taškas paskelbimas
            from .repair import record_inputs
            record_inputs(roster)
        roster.status, roster.version, roster.published_snapshot = "published", 1, new
        roster.published_at, roster.published_by = timezone.now(), user
        roster.save(update_fields=["status", "version", "published_snapshot", "published_at", "published_by", "updated_at"])
        affected = {int(x["employee_id"]): None for x in new}
        result = {"late": late, "version": 1}
    else:
        changes = diff(roster.published_snapshot or [], new)
        if not changes:
            roster.status, roster.pending_reason = "published", ""
            roster.summary = {k: v for k, v in (roster.summary or {}).items() if k != "inputs_published"}
            roster.save(update_fields=["status", "pending_reason", "summary", "updated_at"])
            return {"version": roster.version, "notified": 0, "no_changes": True}
        late_items = late_changes(changes, timezone.localdate(), _prev_month_items(roster) + (roster.published_snapshot or []),
                                  before=date(roster.year, roster.month, 1).isoformat(),
                                  calendar_days=_calendar_workdays(timezone.localdate(), date(roster.year, roster.month, 1)))
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
        roster.summary = {k: v for k, v in (roster.summary or {}).items() if k != "inputs_published"}
        roster.save(update_fields=["status", "version", "published_snapshot", "pending_reason", "published_at",
                                   "published_by", "summary", "updated_at"])
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
        cand = make_shift(e.id, d, st.start_time, st.end_time, st.break_minutes, st.id,
                          getattr(st, "break_start", None), getattr(st, "break_paid", False))
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
    from ..services import _settings
    st = _settings(employee.company)
    (y1, m1), (y2, m2) = period_bounds(today.year, today.month, st.summed_period_months or 3, st.summed_period_anchor or 1)
    return {"enabled": True, "pending_ack": pending,
            "overtime_to_vacation": bool(getattr(employee, "summed_overtime_to_vacation", False)),
            "period": f"{y1}-{m1:02d} – {y2}-{m2:02d}"}


ABSENCE_SHORT = {"vacation": "Atost.", "sick": "Liga", "unpaid": "Nemok.", "business_trip": "Komand.",
                 "study": "Mokym.", "maternity": "NG", "paternity": "Tėvyst.", "childcare": "VP",
                 "downtime": "Prast.", "donor": "Donor."}


def _parent_label(employee, short=False):
    g = (employee.gender or "").upper()
    if g == "F":
        return "Mamad." if short else "Mamadienis"
    if g == "M":
        return "Tėvad." if short else "Tėvadienis"
    return "Laisva d." if short else "Mamadienis / tėvadienis"


def _absence_info(employee, first, last):
    """{data: {"kind", "short", "label"}} - kas tą dieną (atostogos, mamadienis, liga...)."""
    from docscanner_app.models import AbsenceEvent
    out = {}
    for e in AbsenceEvent.objects.filter(employee=employee, status="approved", start_date__lte=last, end_date__gte=first):
        if e.kind in WORKED_EVENTS:
            continue
        label = _parent_label(employee) if e.kind == "parent_day" else e.get_kind_display()
        short = _parent_label(employee, True) if e.kind == "parent_day" else ABSENCE_SHORT.get(e.kind, "Nėra")
        d = max(e.start_date, first)
        while d <= min(e.end_date, last):
            out[d.isoformat()] = {"kind": e.kind, "short": short, "label": label}
            d += timedelta(days=1)
    return out


def _requested_info(employee, first, last):
    """Laukiantys prašymai (dar nepatvirtinti) - rodomi grafike punktyru."""
    from docscanner_app.models import EmployeeRequest
    out = {}
    for r in EmployeeRequest.objects.filter(employee=employee, status="pending", kind__in=("vacation", "parent_day", "unpaid", "paternity", "childcare", "study"),
                                            start_date__lte=last, end_date__gte=first):
        label = _parent_label(employee) if r.kind == "parent_day" else r.get_kind_display()
        d = max(r.start_date, first)
        while d <= min(r.end_date, last):
            out[d.isoformat()] = {"kind": r.kind, "label": f"{label} (laukia patvirtinimo)"}
            d += timedelta(days=1)
    return out


def published_shift_dates(employee, first, last):
    return {s.day for s in published_shifts(employee, first, last)}


def is_summed_on(employee, d):
    return _is_summed(employee, d, d)


def roster_published_for(employee, d):
    from docscanner_app.models import Roster
    return Roster.objects.filter(company=employee.company, year=d.year, month=d.month, version__gte=1).exists()


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
        "holidays": {x["date"]: x["holiday_name"] for x in _days_info(first, last) if x["holiday"]},
        "absences": sorted(d.isoformat() for d in _absence_dates(employee, first, last)),
        "absence_info": _absence_info(employee, first, last),
        "requested": _requested_info(employee, first, last),
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
