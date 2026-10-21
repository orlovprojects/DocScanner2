"""
Darbo kodekso ribos grafikams (tikrinama realiu laiku ir automatinio sudarymo metu).
⚠ Prieš paleidžiant gamyboje - suderinti formuluotes su DK (114, 115, 122 str.).
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

MAX_SHIFT_H = Decimal("12")       # darbo dienos (pamainos) trukmė
MAX_7D_H = Decimal("52")          # bet kuriomis 7 dienomis (DK 115 str. 4 d., suminė)
MIN_DAILY_REST_H = 11             # tarp pamainų
MIN_WEEKLY_REST_H = 35            # nepertraukiamas poilsis per 7 dienas


@dataclass
class Violation:
    employee_id: int
    day: object
    code: str
    message: str


def check(shifts):
    """shifts: [Shift] (gali būti keli darbuotojai) -> [Violation]"""
    by_emp = defaultdict(list)
    for s in shifts:
        by_emp[s.employee_id].append(s)
    out = []
    for emp, items in by_emp.items():
        items.sort(key=lambda s: s.start)
        out += _check_employee(emp, items)
    return out


def _check_employee(emp, items):
    out = []
    for s in items:
        if s.hours > MAX_SHIFT_H:
            out.append(Violation(emp, s.day, "MAX_SHIFT", f"Pamaina {s.hours} val. - daugiau nei {MAX_SHIFT_H} val."))
    for a, b in zip(items, items[1:]):
        if b.start < a.end:
            out.append(Violation(emp, b.day, "OVERLAP", "Pamainos persidengia"))
        elif real_hours(a.end, b.start) < MIN_DAILY_REST_H:          # ROS-09: realus laikas (laiko keitimas)
            gap = round(real_hours(a.end, b.start), 1)
            out.append(Violation(emp, b.day, "REST_11H",
                                 f"Tarp pamainų tik {gap} val. poilsio (reikia bent {MIN_DAILY_REST_H})"))
    if not items:
        return out
    first, last = items[0].day, items[-1].day
    d = first - timedelta(days=6)
    reported = set()
    while d <= last:
        w1 = d
        w2 = d + timedelta(days=7)
        win = [s for s in items if s.day >= w1 and s.day < w2]
        hours = sum((s.hours for s in win), Decimal("0"))
        if hours > MAX_7D_H and "52" not in reported:
            out.append(Violation(emp, w1, "WEEK_52H", f"{w1}–{w2 - timedelta(days=1)}: {hours} val. (daugiau nei 52)"))
            reported.add("52")
        if "35" not in reported and w1 >= first and w2 - timedelta(days=1) <= last:
            # bent viena „poilsio diena“ 7 dienų lange: diena be pamainos pradžios, o tarp ankstesnės pamainos
            # pabaigos ir kitos pradžios >= 35 val. (ta pati taisyklė kaip sprendiklyje)
            if not any(_rest_day(items, w1 + timedelta(days=k)) for k in range(7)):
                out.append(Violation(emp, w1, "WEEKLY_REST_35H",
                                     f"{w1}–{w2 - timedelta(days=1)}: nėra {MIN_WEEKLY_REST_H} val. nepertraukiamo poilsio"))
                reported.add("35")
        d += timedelta(days=1)
    return out


from .shifts import real_hours  # noqa: E402


def _rest_day(items, d):
    if any(s.day == d for s in items):
        return False
    prev = [s for s in items if s.day < d]
    nxt = [s for s in items if s.day > d]
    if not prev or not nxt:
        return True
    return real_hours(max(x.end for x in prev), min(x.start for x in nxt)) >= MIN_WEEKLY_REST_H


def _dt(d):
    from datetime import datetime, time
    return datetime.combine(d, time(0))
