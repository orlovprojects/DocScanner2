"""Pamainos: trukmė, naktinės (22-6 val.) ir šventinės valandos."""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone as _tz
from decimal import Decimal

from ..work_calendar import is_holiday

ZERO = Decimal("0")

try:                                   # LEG-02: faktinė trukmė per laiko keitimą (spalio pabaigoje +1 val.)
    from zoneinfo import ZoneInfo
    LOCAL_TZ = ZoneInfo("Europe/Vilnius")
except Exception:  # noqa: BLE001
    LOCAL_TZ = None


def real_hours(a, b):
    """Kiek realiai praėjo valandų tarp dviejų vietinio laiko momentų (be tz)."""
    if LOCAL_TZ is None:
        return (b - a).total_seconds() / 3600
    ua = a.replace(tzinfo=LOCAL_TZ).astimezone(_tz.utc)
    ub = b.replace(tzinfo=LOCAL_TZ).astimezone(_tz.utc)
    return (ub - ua).total_seconds() / 3600
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
    break_start: datetime = None      # pertraukos pradžia (jei nurodyta - naktinės / šventinės skaičiuojamos tiksliai)
    break_paid: bool = False          # apmokama pertrauka (negali palikti darbo vietos / specialioji) - į darbo laiką

    @property
    def unpaid_break(self):
        return 0 if self.break_paid else (self.break_minutes or 0)

    @property
    def break_interval(self):
        if self.break_start is None or not self.unpaid_break:
            return None
        return self.break_start, self.break_start + timedelta(minutes=self.unpaid_break)

    @property
    def hours(self):
        h = real_hours(self.start, self.end) - self.unpaid_break / 60
        return Decimal(str(round(h, 4))).quantize(Decimal("0.01"))


def _break_dt(day, start_dt, bt):
    """Pertraukos pradžia: ta pati diena arba kita (naktinei pamainai), bet ne anksčiau pamainos pradžios."""
    if bt is None:
        return None
    b = datetime.combine(day, bt)
    if b < start_dt:
        b += timedelta(days=1)
    return b


def make_shift(employee_id, day, start, end, break_minutes=0, shift_type_id=None, break_start=None, break_paid=False):
    """start/end - time; jei end <= start, pamaina baigiasi kitą dieną."""
    s = datetime.combine(day, start)
    e = datetime.combine(day, end)
    if e <= s:
        e += timedelta(days=1)
    return Shift(employee_id, day, s, e, break_minutes, shift_type_id, break_start=_break_dt(day, s, break_start),
                 break_paid=bool(break_paid))


def _overlap(a1, a2, b1, b2):
    lo, hi = max(a1, b1), min(a2, b2)
    return max(real_hours(lo, hi), 0) if hi > lo else 0.0


def _windows_overlap(sh, windows):
    """Pamainos ir langų persidengimas, atėmus neapmokamą pertrauką:
    jei pertraukos laikas žinomas - tiksliai, jei ne - proporcingai (ROS-04)."""
    total = sum(_overlap(sh.start, sh.end, a, b) for a, b in windows)
    bi = sh.break_interval
    if bi is not None:
        total -= sum(_overlap(bi[0], bi[1], a, b) for a, b in windows)
    elif sh.unpaid_break:
        span = real_hours(sh.start, sh.end)
        if span > 0:
            total *= max(span - sh.unpaid_break / 60, 0) / span
    return max(total, 0.0)


def night_hours(sh):
    """
    Apmokamos valandos tarp 22:00 ir 6:00. Neapmokama pertrauka: jei nurodyta jos pradžia - atimama tiksliai
    (pertrauka 23:00-24:00 -> -1 naktinė val.), jei ne - proporcingai (22-6 su 1 val. pertrauka -> 7 naktinės).
    Apmokama pertrauka neatimama.
    """
    wins, d = [], sh.start.date() - timedelta(days=1)
    while d <= sh.end.date():
        wins.append((datetime.combine(d, NIGHT_START), datetime.combine(d + timedelta(days=1), NIGHT_END)))
        d += timedelta(days=1)
    return min(Decimal(str(_windows_overlap(sh, wins))).quantize(Decimal("0.01")), sh.hours)


def holiday_hours(sh):
    """Valandos, patenkančios į švenčių dienas (pagal kalendorines dienas), be neapmokamos pertraukos."""
    wins, d = [], sh.start.date()
    while d <= sh.end.date():
        if is_holiday(d):
            wins.append((datetime.combine(d, time(0)), datetime.combine(d + timedelta(days=1), time(0))))
        d += timedelta(days=1)
    if not wins:
        return ZERO
    return min(Decimal(str(_windows_overlap(sh, wins))).quantize(Decimal("0.01")), sh.hours)
