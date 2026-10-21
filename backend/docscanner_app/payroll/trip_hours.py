"""
Komandiruotės darbo laikas pagal dienas (DK 107 str. 4-5 d., VDI išaiškinimai):
  - kelionės ir darbo valandos komandiruotėje - darbo laikas (be persidengimų), apmokama 1x;
  - kelionė ne darbo laiku pagal grafiką / poilsio dieną -> tokios pat trukmės kompensacinis poilsis;
  - darbas poilsio dieną pagal grafiką -> 2x (DK 144 str.);
  - be grafiko (dar nesudarytas) darbo dienomis - įprasta darbo diena (patvirtina buhalteris), poilsio dienomis - 0.
Grynas modulis.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

ZERO = Decimal("0")
DEFAULT_START = time(8, 0)                 # be grafiko: įprastos darbo dienos pradžia


def nstr(v):
    t = f"{Decimal(str(v)):f}"
    return t.rstrip("0").rstrip(".") if "." in t else t


def _h(td):
    return Decimal(str(round(td.total_seconds() / 3600, 2)))


def _overlap(a1, a2, b1, b2):
    s, e = max(a1, b1), min(a2, b2)
    return _h(e - s) if e > s else ZERO


@dataclass
class PlannedShift:
    start: datetime
    end: datetime
    hours: Decimal
    code: str = ""


def day_plan(start_dt, end_dt, travel_out, travel_back, shifts, roster_exists, workday_hours, edits=None):
    """
    shifts: {date: PlannedShift}; workday_hours(d) -> valandos (be grafiko, 0 - poilsio diena);
    edits: {"YYYY-MM-DD": {"travel": x, "work": y}} - buhalterio pataisymai.
    -> [{date, planned, off, travel, work, total, comp_rest, rest_day_work, edited}]
    """
    travel_out, travel_back = Decimal(str(travel_out or 0)), Decimal(str(travel_back or 0))
    out_iv = (start_dt, start_dt + timedelta(hours=float(travel_out))) if travel_out else None
    back_iv = (end_dt - timedelta(hours=float(travel_back)), end_dt) if travel_back else None
    edits = edits or {}
    rows, d = [], start_dt.date()
    while d <= end_dt.date():
        sh = shifts.get(d)
        if sh is not None:
            base, s1, s2, off = sh.hours, sh.start, sh.end, False
            planned = {"code": sh.code, "time": f"{sh.start:%H:%M}–{sh.end:%H:%M}", "hours": nstr(sh.hours)}
        elif not roster_exists and workday_hours(d) > 0:
            base = workday_hours(d)
            s1 = datetime.combine(d, DEFAULT_START)
            s2 = s1 + timedelta(hours=float(base) + (1 if base >= 6 else 0))     # su pietų pertrauka
            off, planned = False, {"code": "", "time": "darbo diena", "hours": nstr(base)}
        else:
            base, s1, s2, off, planned = ZERO, None, None, True, None
        travel, inside = ZERO, ZERO
        for iv in (out_iv if d == start_dt.date() else None, back_iv if d == end_dt.date() else None):
            if iv is None:
                continue
            a = max(iv[0], datetime.combine(d, time.min))
            b = min(iv[1], datetime.combine(d + timedelta(days=1), time.min))
            if b <= a:
                continue
            travel += _h(b - a)
            if s1 is not None:
                inside += _overlap(a, b, s1, s2)
        work = max(base - inside, ZERO)
        e = edits.get(d.isoformat())
        if e:
            travel = Decimal(str(e.get("travel", travel) or 0))
            work = Decimal(str(e.get("work", work) or 0))
        total = travel + work
        if off:
            comp, rest_work = travel, work
        else:
            comp = min(travel, max(total - base, ZERO))      # kelionė, kuri išėjo už grafiko valandų
            rest_work = ZERO
        rows.append({"date": d.isoformat(), "planned": planned, "off": off, "travel": nstr(travel), "work": nstr(work),
                     "total": nstr(total), "comp_rest": nstr(comp), "rest_day_work": nstr(rest_work), "edited": bool(e)})
        d += timedelta(days=1)
    return rows


def plan_totals(rows):
    s = lambda k: sum((Decimal(r[k]) for r in rows), ZERO)   # noqa: E731
    return {"travel": nstr(s("travel")), "work": nstr(s("work")), "total": nstr(s("total")), "comp_rest": nstr(s("comp_rest"))}
