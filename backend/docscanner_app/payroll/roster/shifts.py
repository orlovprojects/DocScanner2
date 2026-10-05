"""Pamainos: trukmė, naktinės (22-6 val.) ir šventinės valandos."""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from ..work_calendar import is_holiday

ZERO = Decimal("0")
NIGHT_START, NIGHT_END = time(22, 0), time(6, 0)


@dataclass
class Shift:
    employee_id: int
    day: date                 # pamainos pradžios diena (naktinė priklauso pradžios dienai)
    start: datetime
    end: datetime
    break_minutes: int = 0
    shift_type_id: int = None
    locked: bool = False

    @property
    def hours(self):
        mins = (self.end - self.start).total_seconds() / 60 - self.break_minutes
        return (Decimal(str(mins)) / 60).quantize(Decimal("0.01"))


def make_shift(employee_id, day, start, end, break_minutes=0, shift_type_id=None):
    """start/end - time; jei end <= start, pamaina baigiasi kitą dieną."""
    s = datetime.combine(day, start)
    e = datetime.combine(day, end)
    if e <= s:
        e += timedelta(days=1)
    return Shift(employee_id, day, s, e, break_minutes, shift_type_id)


def _overlap(a1, a2, b1, b2):
    lo, hi = max(a1, b1), min(a2, b2)
    return max((hi - lo).total_seconds(), 0) / 3600


def night_hours(sh):
    """Valandos tarp 22:00 ir 6:00 (pertrauka nenukeliama - konservatyviai)."""
    total, d = 0.0, sh.start.date() - timedelta(days=1)
    while d <= sh.end.date():
        n1 = datetime.combine(d, NIGHT_START)
        n2 = datetime.combine(d + timedelta(days=1), NIGHT_END)
        total += _overlap(sh.start, sh.end, n1, n2)
        d += timedelta(days=1)
    return Decimal(str(total)).quantize(Decimal("0.01"))


def holiday_hours(sh):
    """Valandos, patenkančios į švenčių dienas (pagal kalendorines dienas)."""
    total, d = 0.0, sh.start.date()
    while d <= sh.end.date():
        if is_holiday(d):
            total += _overlap(sh.start, sh.end, datetime.combine(d, time(0)), datetime.combine(d + timedelta(days=1), time(0)))
        d += timedelta(days=1)
    h = Decimal(str(total)).quantize(Decimal("0.01"))
    return min(h, sh.hours)
