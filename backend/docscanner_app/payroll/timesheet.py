"""
Tabelio (darbo laiko apskaitos žiniaraščio) generavimas.

Pagal nutylėjimą mėnuo užpildomas iš grafiko ir šventių kalendoriaus,
ant viršaus uždedami įvykiai (atostogos, liga...) ir rankiniai pakeitimai.
⚠ Žymėjimai suderinti su dažniausiai naudojamais VDI žymėjimais, patikrinti prieš spausdinamą formą.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from .taxes import ZERO
from .work_calendar import STANDARD_WEEK, is_holiday, is_pre_holiday

# žymėjimai
FD = "FD"   # faktiškai dirbtas laikas
P = "P"     # poilsio diena
S = "S"     # švenčių diena
NE = "-"    # nedirbo (ne darbo santykių laikotarpis)

EVENT_CODES = {
    "vacation": "A",
    "sick": "L",
    "parent_day": "MD",
    "unpaid": "NA",
    "truancy": "PB",
    "downtime": "PR",
    "study": "MA",
    "donor": "D",
    "civic": "VV",
    "paternity": "TA",
    "childcare": "VP",
    "maternity": "G",
    "suspension": "NS",
    "business_trip": "K",
}

# įvykiai, kurių metu darbuotojas laikomas dirbusiu (skaičiuojama įprasta alga)
WORKED_EVENTS = {"business_trip"}


@dataclass
class Event:
    kind: str
    start: date
    end: date
    is_continuation: bool = False   # ligos tęsinys - darbdavys nemoka
    ref: object = None              # AbsenceEvent id


@dataclass
class Day:
    date: date
    code: str
    hours: Decimal = ZERO                 # darbo valandos
    scheduled_hours: Decimal = ZERO       # pagal grafiką
    event: Event = None
    norm_hours: Decimal = ZERO            # pagal standartinę savaitę (suminei: atostogos skaičiuojamos darbo dienomis)
    extra: dict = field(default_factory=dict)   # {"night": 2, "overtime": 1 ...}


@dataclass
class Timesheet:
    days: list
    summed: bool = False                  # suminė apskaita (dienos iš pamainų grafiko)

    def by_code(self, code):
        return [d for d in self.days if d.code == code]

    @property
    def worked_days(self):
        return sum(1 for d in self.days if d.code in (FD, EVENT_CODES["business_trip"]) and d.hours > 0)

    @property
    def worked_hours(self):
        return sum((d.hours for d in self.days if d.code in (FD, EVENT_CODES["business_trip"])), ZERO)

    @property
    def scheduled_days(self):
        return sum(1 for d in self.days if d.scheduled_hours > 0)

    def absent_dates(self):
        """Darbo dienos, kurios apmokamos ne alga (arba neapmokamos)."""
        return {d.date for d in self.days
                if d.scheduled_hours > 0 and d.event and d.event.kind not in WORKED_EVENTS}

    def event_workdays(self, kind):
        """Grafiko darbo dienos, patenkančios į nurodytos rūšies įvykius.
        Suminei apskaitai kasmetinės atostogos skaičiuojamos darbo dienomis (standartinė savaitė)."""
        if self.summed and kind == "vacation":
            return [d for d in self.days if d.event and d.event.kind == kind and d.norm_hours > 0]
        return [d for d in self.days if d.event and d.event.kind == kind and d.scheduled_hours > 0]

    def extra_hours(self, hour_type):
        return sum((Decimal(d.extra.get(hour_type, 0)) for d in self.days), ZERO)


def _scheduled(d, week, workload):
    h = week[d.weekday()] * workload
    if h <= 0 or is_holiday(d):
        return ZERO
    if is_pre_holiday(d):
        h = max(h - Decimal("1"), ZERO)
    return h


def generate(year, month, *, week=STANDARD_WEEK, workload=Decimal("1"),
             employed_from=None, employed_to=None, events=(), overrides=None,
             daily_schedule=None, daily_extra=None):
    """
    overrides: {date: {"code": ..., "hours": ..., "extra": {...}}} - rankiniai pakeitimai.
    daily_schedule: suminė apskaita - {data: valandos pagal pamainų grafiką} vietoj savaitės šablono.
    daily_extra: {data: {"night": .., "holiday": ..}} iš pamainų (taikoma tik dirbtoms dienoms).
    """
    overrides = overrides or {}
    summed = daily_schedule is not None
    first = date(year, month, 1)
    d = first
    days = []
    while d.month == month:
        employed = (employed_from is None or d >= employed_from) and (employed_to is None or d <= employed_to)
        norm_h = _scheduled(d, week, workload) if employed else ZERO
        if summed:
            sched = daily_schedule.get(d, ZERO) if employed else ZERO
        else:
            sched = norm_h

        if not employed:
            day = Day(d, NE)
        elif sched > 0:
            day = Day(d, FD, hours=sched, scheduled_hours=sched)
        elif is_holiday(d):
            day = Day(d, S)
        else:
            day = Day(d, P)
        day.norm_hours = norm_h

        if employed:
            for ev in events:
                if ev.start <= d <= ev.end:
                    day.event = ev
                    if day.code == FD or (summed and ev.kind == "vacation" and norm_h > 0):
                        code = EVENT_CODES.get(ev.kind, "?")
                        day.code = code
                        if ev.kind not in WORKED_EVENTS:
                            day.hours = ZERO
                    break

        if summed and daily_extra and day.code == FD and d in daily_extra:
            day.extra.update(daily_extra[d])

        ov = overrides.get(d)
        if ov:
            day.code = ov.get("code", day.code)
            if "hours" in ov:
                day.hours = Decimal(ov["hours"])
            day.extra.update(ov.get("extra", {}))

        days.append(day)
        d += timedelta(days=1)
    return Timesheet(days, summed=summed)


def employer_sick_days(event, week=STANDARD_WEEK, workload=Decimal("1"), daily_schedule=None):
    """
    Darbdavys moka už pirmąsias 2 kalendorines nedarbingumo dienas,
    sutampančias su grafiko darbo dienomis (suminei - su pamainų grafiku). Tęsiniui - 0.
    """
    if event.is_continuation:
        return 0

    def works(d):
        if daily_schedule is not None:
            return daily_schedule.get(d, ZERO) > 0
        return _scheduled(d, week, workload) > 0

    return sum(1 for i in range(2)
               if works(event.start + timedelta(days=i)) and event.start + timedelta(days=i) <= event.end)
