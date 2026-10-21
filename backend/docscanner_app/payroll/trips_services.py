"""Komandiruotės (Django dalis): skaičiavimas, tvirtinimas, avansas, tabelis, DU eilutės, įsakymas."""
from datetime import date, datetime, timedelta
from decimal import Decimal
from html import escape

from django.db import transaction
from django.utils import timezone

from .trips import Leg, calc_trip, q2, tax_split

ZERO = Decimal("0")


def _naive(dt):
    return timezone.localtime(dt).replace(tzinfo=None) if timezone.is_aware(dt) else dt


def _legs(trip):
    from datetime import date
    return [Leg(l["country"], date.fromisoformat(str(l["date_from"])), date.fromisoformat(str(l["date_to"])))
            for l in (trip.legs or [])]


def calculate(trip):
    return calc_trip(_legs(trip), _naive(trip.start_at), _naive(trip.end_at), trip.per_diem_pct)


def _workday_hours_fn(employee, start):
    """Be grafiko: įprasta darbo diena pagal etatą (8 val. x etatas, prieššventinę -1 val.), poilsio dienomis 0."""
    from .services import _active_contract, _latest_terms
    from .work_calendar import is_holiday, is_pre_holiday
    c = _active_contract(employee, start, start)
    t = _latest_terms(c, start) if c else None
    wl = Decimal(str(t.workload)) if t else Decimal("1")

    def fn(d):
        if d.weekday() >= 5 or is_holiday(d):
            return ZERO
        return Decimal("8") * wl - (Decimal("1") if is_pre_holiday(d) else ZERO)
    return fn


def planning_inputs(employee, start, end):
    """Grafiko pamainos (paskelbtos arba juodraštis) komandiruotės dienoms ir ar grafikas apskritai sudarytas."""
    from docscanner_app.models import RosterShift
    from .roster.services import _shift_obj
    from .trip_hours import PlannedShift
    qs = RosterShift.objects.filter(employee=employee, date__gte=start, date__lte=end).select_related("shift_type")
    shifts = {}
    for s in qs:
        o = _shift_obj(s)
        shifts[s.date] = PlannedShift(_naive(o.start), _naive(o.end), Decimal(str(o.hours)),
                                      s.shift_type.code if s.shift_type else "")
    # „poilsio diena pagal grafiką“ - tik kai grafikas PASKELBTAS; juodraštis dar ne grafikas
    from docscanner_app.models import Roster
    months, d = set(), start.replace(day=1)
    while d <= end:
        months.add((d.year, d.month))
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    roster_exists = all(Roster.objects.filter(company=employee.company, year=y, month=m, version__gte=1).exists()
                        for y, m in months)
    return shifts, roster_exists


def compute_plan(employee, start_at, end_at, travel_out, travel_back, edits=None):
    from .trip_hours import day_plan, plan_totals
    s, e = _naive(start_at), _naive(end_at)
    shifts, roster_exists = planning_inputs(employee, s.date(), e.date())
    rows = day_plan(s, e, travel_out, travel_back, shifts, roster_exists, _workday_hours_fn(employee, s.date()), edits)
    return rows, plan_totals(rows), roster_exists


def refresh_calc(trip, save=True):
    c = calculate(trip)
    trip.calc = [{"date": d.day.isoformat(), "country": d.country, "norm": str(d.norm), "pct": str(d.pct),
                  "amount": str(d.amount), "note": d.note} for d in c.days]
    trip.total = c.total
    fields = ["calc", "total", "updated_at"]
    if trip.employee_id:
        rows, tot, _ = compute_plan(trip.employee, trip.start_at, trip.end_at, trip.travel_out_hours,
                                    trip.travel_back_hours, trip.day_edits)
        trip.day_plan, trip.comp_rest_hours = rows, Decimal(tot["comp_rest"])
        fields += ["day_plan", "comp_rest_hours"]
    if save:
        trip.save(update_fields=fields)
    return c


# Nebuvimai komandiruotės dienomis:
#   BLOCKING - patvirtinti negalima (darbuotojas serga, vaiko priežiūros atostogose, kitoje komandiruotėje ir pan.);
#   kiti (atostogos, poilsio dienos, mamadieniai...) - galima, jei darbuotojas sutinka: nebuvimas sutrumpinamas / padalijamas /
#   atšaukiamas tomis dienomis (atšaukimas iš kasmetinių atostogų - tik darbuotojo sutikimu).
BLOCKING_KINDS = {"sick": "darbuotojas serga", "maternity": "nėštumo ir gimdymo atostogos",
                  "paternity": "tėvystės atostogos", "childcare": "vaiko priežiūros atostogos",
                  "care": "slaugos atostogos", "suspension": "darbuotojas nušalintas", "donor": "donorystės diena",
                  "civic": "valstybinės pareigos", "business_trip": "kita komandiruotė"}
REQUEST_KINDS = ("vacation", "parent_day", "unpaid", "paternity", "childcare", "study")


def _fmt(d1, d2):
    return f"{d1:%m-%d}" if d1 == d2 else f"{d1:%m-%d}–{d2:%m-%d}"


def absence_conflicts(employee, start, end):
    """
    Nebuvimai, sutampantys su komandiruote (pagal datas):
    {"block": [...], "resolve": [...], "pending": [...]}; kiekvienas - {id, kind, label, start, end, reason|result}.
    """
    from docscanner_app.models import AbsenceEvent
    from .sick_import import remaining_ranges
    out = {"block": [], "resolve": [], "pending": []}
    for e in AbsenceEvent.objects.filter(employee=employee, status="approved", start_date__lte=end,
                                         end_date__gte=start).order_by("start_date"):
        x = {"id": e.id, "kind": e.kind, "label": e.get_kind_display() if e.kind != "business_trip" else (e.comment or "Komandiruotė"),
             "start": e.start_date.isoformat(), "end": e.end_date.isoformat()}
        if e.kind in BLOCKING_KINDS:
            out["block"].append(dict(x, reason=BLOCKING_KINDS[e.kind]))
            continue
        left = remaining_ranges(e.start_date, e.end_date, start, end)
        if not left:
            result = "bus atšauktas visas"
        elif len(left) == 1:
            result = f"liks {_fmt(*left[0])}"
        else:
            result = f"bus padalytas: {_fmt(*left[0])} ir {_fmt(*left[1])}"
        note = " Atostoginiai jau išmokėti – patikrinkite DU perskaičiavimą." if e.kind == "vacation_prepaid" else ""
        out["resolve"].append(dict(x, result=result, note=note.strip()))
    try:
        from docscanner_app.models import EmployeeRequest
        for r in EmployeeRequest.objects.filter(employee=employee, status="pending", kind__in=REQUEST_KINDS,
                                                start_date__lte=end, end_date__gte=start):
            out["pending"].append({"id": r.id, "kind": r.kind, "label": r.get_kind_display(),
                                   "start": r.start_date.isoformat(), "end": r.end_date.isoformat()})
    except Exception:                                           # noqa: BLE001  savitarnos modulio gali nebūti
        pass
    return out


def _dump(ev):
    """Nebuvimo laukai JSON pavidalu (atkūrimui atšaukus komandiruotę)."""
    out = {}
    for f in ev._meta.concrete_fields:
        if f.name in ("id", "created_at", "updated_at", "removed_shifts"):     # grafiko atmintis - tvarko sync
            continue
        v = getattr(ev, f.attname)
        out[f.attname] = v.isoformat() if hasattr(v, "isoformat") else (str(v) if isinstance(v, Decimal) else v)
    return out


def _load(data):
    from docscanner_app.models import AbsenceEvent
    vals = {}
    for f in AbsenceEvent._meta.concrete_fields:
        if f.attname in data:
            vals[f.attname] = f.to_python(data[f.attname]) if data[f.attname] is not None else None
    return vals


def _cut_absences(employee, ids, start, end, note):
    """
    Patvirtinant komandiruotę: nebuvimai sutrumpinami / padalijami / pašalinami komandiruotės dienomis (+ grafikas).
    -> [{"id", "orig", "split_id"}] - kas pakeista (atšaukus komandiruotę atkuriama).
    """
    from docscanner_app.models import AbsenceEvent
    from .services import release_roster_absence, sync_roster_absence
    from .sick_import import remaining_ranges
    from .work_calendar import work_days_between
    cuts = []
    for v in AbsenceEvent.objects.filter(id__in=ids, employee=employee):
        cut = {"id": v.id, "orig": _dump(v), "split_id": None}
        cuts.append(cut)
        old = (v.start_date, v.end_date)
        total = work_days_between(*old) or Decimal("1")
        hours = getattr(v, "hours", None)
        left = remaining_ranges(v.start_date, v.end_date, start, end)
        if not left:
            release_roster_absence(v)
            v.delete()
            continue
        v.start_date, v.end_date = left[0]
        v.work_days = work_days_between(*left[0])
        if hours:                                               # pvz. poilsio diena už komandiruotę - valandos proporcingai
            v.hours = (Decimal(hours) * Decimal(v.work_days) / Decimal(total)).quantize(Decimal("0.01"))
        v.comment = f"{v.comment}; {note}" if v.comment else note
        v.save()
        sync_roster_absence(v, old)
        if len(left) == 2:
            v2 = AbsenceEvent.objects.get(id=v.id)
            v2.pk = v2.id = None
            v2.start_date, v2.end_date = left[1]
            v2.work_days = work_days_between(*left[1])
            if hours:
                v2.hours = (Decimal(hours) * Decimal(v2.work_days) / Decimal(total)).quantize(Decimal("0.01"))
            if hasattr(v2, "removed_shifts"):
                v2.removed_shifts = []
            v2.comment = f"{v.comment} (antra dalis)"
            v2.save()
            sync_roster_absence(v2)
            cut["split_id"] = v2.id
    return cuts


def _restore_absences(trip):
    """
    Komandiruotė atšaukiama: patvirtinant sutrumpinti / atšaukti nebuvimai atkuriami. Jei tomis dienomis jau yra kitas
    nebuvimas (pvz. liga) - neatkuriama, grąžinamas įspėjimas.
    """
    from docscanner_app.models import AbsenceEvent
    from .services import release_roster_absence, sync_roster_absence
    warnings = []
    for cut in getattr(trip, "absence_cuts", None) or []:
        vals = _load(cut["orig"])
        mine = {cut["id"], cut.get("split_id")}
        busy = AbsenceEvent.objects.filter(employee=trip.employee, status="approved", start_date__lte=vals["end_date"],
                                           end_date__gte=vals["start_date"]).exclude(id__in=[x for x in mine if x])
        label = dict(AbsenceEvent._meta.get_field("kind").choices).get(vals.get("kind"), vals.get("kind"))
        if busy.exists():
            warnings.append(f"{label} {_fmt(vals['start_date'], vals['end_date'])} neatkurta – tomis dienomis jau yra kitas nebuvimas")
            continue
        if cut.get("split_id"):
            v2 = AbsenceEvent.objects.filter(id=cut["split_id"]).first()
            if v2:
                release_roster_absence(v2)
                v2.delete()
        v = AbsenceEvent.objects.filter(id=cut["id"]).first()
        if v is None:                                           # buvo visas atšauktas - sukuriamas iš naujo
            v = AbsenceEvent.objects.create(**vals)
            sync_roster_absence(v)
        else:
            old = (v.start_date, v.end_date)
            for k, val in vals.items():
                setattr(v, k, val)
            v.save()
            sync_roster_absence(v, old)
    return warnings


def _next_order_number(company, d):
    from docscanner_app.models import BusinessTrip
    n = BusinessTrip.objects.filter(company=company, order_date__year=d.year).exclude(order_number="").count() + 1
    return f"K-{d.year}-{n:03d}"


@transaction.atomic
def approve(trip, user, resolve_absences=False):
    """resolve_absences - darbuotojas sutinka: atostogos ir kt. nebuvimai komandiruotės dienomis sutrumpinami / atšaukiami."""
    from docscanner_app.models import AbsenceEvent
    from .payments import _create
    from .services import prev_work_day
    from .work_calendar import work_days_between
    if trip.status == "approved":
        return trip
    c = refresh_calc(trip, save=False)
    if not trip.day_plan:
        raise ValueError("Nepavyko apskaičiuoti darbo laiko komandiruotėje")
    if c.errors:
        raise ValueError("; ".join(c.errors))
    start, end = _naive(trip.start_at).date(), _naive(trip.end_at).date()
    conf = absence_conflicts(trip.employee, start, end)
    if conf["block"]:
        raise ValueError("Patvirtinti negalima – " + "; ".join(
            f"{x['label']} {_fmt(date.fromisoformat(x['start']), date.fromisoformat(x['end']))} ({x['reason']})" for x in conf["block"]))
    if conf["resolve"] and not resolve_absences:
        raise ValueError("Komandiruotės dienomis darbuotojas turi: " + "; ".join(
            f"{x['label'].lower()} {_fmt(date.fromisoformat(x['start']), date.fromisoformat(x['end']))}" for x in conf["resolve"])
            + ". Atidarykite komandiruotę ir pažymėkite, kad darbuotojas sutinka jas sutrumpinti.")
    today = timezone.localdate()
    trip.order_date = trip.order_date or today
    trip.order_number = trip.order_number or _next_order_number(trip.company, trip.order_date)
    trip.absence_cuts = []
    if conf["resolve"]:
        trip.absence_cuts = _cut_absences(trip.employee, [x["id"] for x in conf["resolve"]], start, end,
                                          f"Sutrumpinta dėl komandiruotės {trip.order_number}")
    trip.absence_event = AbsenceEvent.objects.create(
        employee=trip.employee, kind="business_trip", start_date=start, end_date=end,
        work_days=work_days_between(start, end), source="manual", status="approved",
        comment=f"Komandiruotė {trip.order_number}")
    adv = q2(trip.total * trip.advance_pct / 100) if trip.advance_pct else ZERO
    if adv > 0:
        due = max(prev_work_day(start), today)
        e = trip.employee
        trip.advance_payment = _create(
            trip.company, None, "trip_advance", start.year, start.month, adv, employee=e,
            recipient_name=e.full_name, recipient_iban=e.iban or "", due_date=due,
            purpose=f"Komandiruotės {trip.order_number} dienpinigių avansas", breakdown={"4484": str(adv)})
    # juodraštiniame (dar neskelbtame) grafike komandiruotės dienų pamainos pašalinamos - grafikas persidėlios
    from docscanner_app.models import Roster, VacationAdjustment
    d = start.replace(day=1)
    while d <= end:
        r = Roster.objects.filter(company=trip.company, year=d.year, month=d.month).first()
        if r is not None and r.status == "draft" and not r.version:
            r.shifts.filter(employee=trip.employee, date__gte=start, date__lte=end).delete()
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    # kompensacinis poilsis: prijungti prie kasmetinių atostogų (valandos -> dienos pagal dienos normą)
    if trip.comp_rest_hours and trip.comp_rest_mode == "vacation":
        wl = _workday_hours_fn(trip.employee, start)(start) or Decimal("8")
        VacationAdjustment.objects.create(
            employee=trip.employee, date=end, days=(trip.comp_rest_hours / (wl if wl > 0 else Decimal("8"))).quantize(Decimal("0.01")),
            reason=f"Kompensacinis poilsis už kelionę ({trip.order_number})")
    trip.status, trip.approved_by, trip.approved_at = "approved", user, timezone.now()
    trip.save()
    return trip


@transaction.atomic
def cancel(trip):
    p = trip.advance_payment
    if p is not None and p.paid_amount > 0:
        raise ValueError("Avansas jau išmokėtas - pirmiausia pašalinkite mokėjimą skiltyje „Išmokėjimai“")
    if p is not None:
        p.delete()
    if trip.absence_event_id:
        trip.absence_event.delete()
    from docscanner_app.models import VacationAdjustment
    VacationAdjustment.objects.filter(employee=trip.employee, reason__contains=f"({trip.order_number})").delete()
    trip.restore_warnings = _restore_absences(trip)            # atostogos ir kt., sutrumpinti patvirtinant
    trip.absence_cuts = []
    trip.status, trip.absence_event, trip.advance_payment = "cancelled", None, None
    trip.save()
    return trip


def month_lines(employee, year, month, monthly_salary, mma):
    """DU eilutės (DPN / DPA) už mėnesio komandiruočių dienas + sumokėtas avansas (išskaičiuojamas)."""
    from docscanner_app.models import BusinessTrip
    from .run import Line
    lt = foreign = ZERO
    numbers, advance = [], ZERO
    for t in BusinessTrip.objects.filter(employee=employee, status="approved"):
        part = calculate(t).by_month().get((year, month))
        if not part:
            continue
        lt += part["lt"]
        foreign += part["foreign"]
        numbers.append(t.order_number)
        s = _naive(t.start_at)
        if t.advance_payment_id and (s.year, s.month) == (year, month):
            advance += t.advance_payment.paid_amount
    if not (lt or foreign):
        return [], ZERO
    free, taxable = tax_split(lt, foreign, monthly_salary, mma)
    note = "Komandiruotės " + ", ".join(numbers)
    lines = []
    if free:
        lines.append(Line("DPN", q2(free), ZERO, ZERO, note))
    if taxable:
        lines.append(Line("DPA", q2(taxable), ZERO, ZERO, note + " - dalis virš neapmokestinamos ribos"))
    return lines, advance


def order_html(trip):
    e = trip.employee
    company = getattr(trip.company, "name", "")
    rows = "".join(f"<tr><td>{d['date']}</td><td>{escape(d['country'])}</td><td>{d['norm']}</td>"
                   f"<td>{d['pct']} %</td><td>{d['amount']}</td></tr>" for d in trip.calc or [])
    s, en = _naive(trip.start_at), _naive(trip.end_at)
    return f"""<html><head><meta charset="utf-8"><title>Įsakymas {escape(trip.order_number)}</title>
<style>body{{font-family:Arial;max-width:760px;margin:40px auto;font-size:14px}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #999;padding:4px 6px}}</style></head><body>
<p style="text-align:center"><b>{escape(company)}</b></p>
<p style="text-align:center"><b>ĮSAKYMAS DĖL SIUNTIMO Į KOMANDIRUOTĘ</b><br>{trip.order_date} Nr. {escape(trip.order_number)}</p>
<p>Siunčiu {escape(e.full_name)} į komandiruotę: {escape(trip.destination or ', '.join(l['country'] for l in trip.legs))}.</p>
<p>Laikotarpis: {s:%Y-%m-%d %H:%M} – {en:%Y-%m-%d %H:%M}.<br>Tikslas: {escape(trip.purpose)}.</p>
<p>Dienpinigiai mokami {trip.per_diem_pct} % Lietuvos Respublikos Vyriausybės 2004 m. balandžio 29 d. nutarimu Nr. 526
nustatytų maksimalių dydžių. Iki komandiruotės pradžios išmokamas {trip.advance_pct} % dienpinigių avansas,
likusi dalis – kartu su darbo užmokesčiu.</p>
<table><tr><th>Data</th><th>Valstybė</th><th>Norma, €</th><th>Dydis</th><th>Suma, €</th></tr>{rows}
<tr><td colspan="4"><b>Iš viso</b></td><td><b>{trip.total}</b></td></tr></table>
<p>Komandiruotės išlaidos (kelionė, nakvynė ir kt.) apmokamos pagal pateiktus dokumentus.</p>
<p style="margin-top:50px">Vadovas ____________________</p>
<p>Susipažinau: ____________________ {escape(e.full_name)}</p></body></html>"""


def comp_rest_balance(employee):
    """Kompensacinio poilsio likutis (val.): sukaupta iš patvirtintų komandiruočių - panaudota (poilsio dienos)."""
    from django.db.models import Sum
    from docscanner_app.models import AbsenceEvent, BusinessTrip
    got = (BusinessTrip.objects.filter(employee=employee, status="approved", comp_rest_mode="accrue")
           .aggregate(s=Sum("comp_rest_hours"))["s"] or ZERO)
    used = (AbsenceEvent.objects.filter(employee=employee, kind="comp_rest", status="approved")
            .aggregate(s=Sum("hours"))["s"] or ZERO)
    # laikotarpio pabaigoje pasirinkta kelionių valandas apmokėti kaip viršvalandžius - poilsio už jas nebelieka
    from docscanner_app.models import TimesheetMonth
    paid = ZERO
    for ch in TimesheetMonth.objects.filter(company_id=employee.company_id).values_list("period_trip_choices", flat=True):
        x = (ch or {}).get(str(employee.id)) or {}
        if x.get("choice") == "overtime":
            paid += Decimal(str(x.get("hours") or 0))
    return max(got - used - paid, ZERO)


def trip_overrides(employee, year, month):
    """Tabeliui: komandiruotės dienų valandos {date: {"code", "hours", "extra"}} iš patvirtintų komandiruočių."""
    import calendar
    from datetime import date as _d
    from docscanner_app.models import BusinessTrip
    first, last = _d(year, month, 1), _d(year, month, calendar.monthrange(year, month)[1])
    out = {}
    for t in BusinessTrip.objects.filter(employee=employee, status="approved", start_at__date__lte=last, end_at__date__gte=first):
        for r in t.day_plan or []:
            d = _d.fromisoformat(r["date"])
            if not (first <= d <= last):
                continue
            total = Decimal(r["total"])
            if total <= 0:
                continue
            extra = {}
            if Decimal(r.get("rest_day_work") or 0) > 0:
                extra["rest_day"] = Decimal(r["rest_day_work"])
            out[d] = {"code": "FD", "hours": total, "extra": extra}
    return out
