"""
Kasmetinių atostogų likutis (DK 126-127 str.).

Teisė kaupiasi proporcingai darbo metams tenkančioms darbo dienoms:
  per darbo metus = annual_days (20 d.d. dirbant 5 d./sav., 24 - dirbant 6 d./sav., pailgintos - 25/30...)
  už kiekvieną įskaitomą darbo dieną = annual_days / darbo metų darbo dienų skaičius.
Darbo metai prasideda nuo darbo pagal sutartį pradžios (DK 127 str. 3 d.).

Į darbo metus NEĮSKAITOMA (DK 127 str. 4 d. sąraše jų nėra):
  pravaikšta, vaiko priežiūros atostogos, nušalinimas,
  nemokamos atostogos darbuotojo prašymu - viršijusios 10 d.d. per darbo metus.
Įskaitoma: faktinis darbas, komandiruotės, liga, kasmetinės/papildomos/mokymosi atostogos,
  nėštumo ir gimdymo, tėvystės atostogos, mamadieniai, valstybinės pareigos ir kt.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from .taxes import ZERO, q2
from .work_calendar import STANDARD_WEEK, is_holiday

NOT_COUNTED_KINDS = {"truancy", "childcare", "suspension"}
UNPAID_FREE_DAYS = 10


@dataclass
class VacationEvent:
    kind: str
    start: date
    end: date


@dataclass
class VacationBalance:
    on_date: date
    accrued: Decimal
    used: Decimal
    adjustments: Decimal
    excluded_days: int

    @property
    def balance(self):
        return q2(self.accrued - self.used + self.adjustments)


def _is_workday(d, week):
    return week[d.weekday()] > 0 and not is_holiday(d)


def _add_years(d, n):
    try:
        return d.replace(year=d.year + n)
    except ValueError:  # vasario 29
        return d.replace(year=d.year + n, day=28)


def _work_years(start, until):
    """(darbo metų pradžia, pabaiga) iki until imtinai."""
    y = 0
    while True:
        ws = _add_years(start, y)
        if ws > until:
            return
        yield ws, _add_years(start, y + 1) - timedelta(days=1)
        y += 1


def _event_kind_on(d, events):
    for ev in events:
        if ev.start <= d <= ev.end:
            return ev.kind
    return None


def accrued_days(start, on_date, annual_days, events=(), week=STANDARD_WEEK, end=None):
    """Sukauptos atostogų dienos nuo sutarties pradžios iki on_date (imtinai)."""
    last = min(on_date, end) if end else on_date
    total = Decimal("0")
    excluded = 0
    for ws, we in _work_years(start, last):
        year_workdays = 0
        counted = 0
        unpaid_used = 0
        d = ws
        while d <= we:
            if _is_workday(d, week):
                year_workdays += 1
                if d <= last:
                    kind = _event_kind_on(d, events)
                    if kind in NOT_COUNTED_KINDS:
                        excluded += 1
                    elif kind == "unpaid":
                        unpaid_used += 1
                        if unpaid_used <= UNPAID_FREE_DAYS:
                            counted += 1
                        else:
                            excluded += 1
                    else:
                        counted += 1
            d += timedelta(days=1)
        if year_workdays:
            total += Decimal(annual_days) * counted / year_workdays
    return q2(total), excluded


def used_days(events, week=STANDARD_WEEK, until=None):
    """Panaudotos kasmetinių atostogų darbo dienos (šventės neįskaitomos)."""
    n = 0
    for ev in events:
        if ev.kind != "vacation":
            continue
        d = ev.start
        stop = min(ev.end, until) if until else ev.end
        while d <= stop:
            if _is_workday(d, week):
                n += 1
            d += timedelta(days=1)
    return Decimal(n)


def vacation_balance(start, on_date, annual_days=20, events=(), adjustments=ZERO,
                     week=STANDARD_WEEK, end=None, used_until=None):
    """
    Likutis on_date dieną.
    used_until=None - skaičiuojamos visos patvirtintos atostogos (ir suplanuotos ateityje).
    """
    acc, excl = accrued_days(start, on_date, annual_days, events, week, end)
    used = used_days(events, week, used_until)
    return VacationBalance(on_date=on_date, accrued=acc, used=used,
                           adjustments=Decimal(adjustments), excluded_days=excl)


# ============================================================
# Kasmetinių atostogų trukmė (DK 126, 138 str.; papildomos už stažą - LRV nutarimas)
# ============================================================

@dataclass
class LeaveEntitlement:
    total: int
    parts: list   # [(dienos, paaiškinimas)]


def _full_years(since, on_date):
    return on_date.year - since.year - ((on_date.month, on_date.day) < (since.month, since.day))


def annual_entitlement(on_date, *, work_days_per_week=5, birth_date=None, has_disability=False,
                       single_parent=False, children=(), profession_days=None,
                       seniority_since=None, extra_days=0):
    """
    children: [(gimimo data, su negalia)].
    Pailgintos (DK 126 str. 3 d.) ir papildomos už stažą nesumuojamos - taikoma palankesnė.
    """
    wd = int(work_days_per_week) or 5
    if wd >= 6:
        base, ext_status, week_note = 24, 30, "dirba 6 d. per savaitę"
    elif wd == 5:
        base, ext_status, week_note = 20, 25, "dirba 5 d. per savaitę"
    else:  # mažiau arba skirtingas dienų skaičius - 4 / 5 savaitės
        base, ext_status, week_note = 4 * wd, 5 * wd, f"dirba {wd} d. per savaitę (4 savaitės)"

    reasons = []
    if birth_date and _full_years(birth_date, on_date) < 18:
        reasons.append("jaunesnis nei 18 m.")
    if has_disability:
        reasons.append("nustatytas dalyvumo lygis")
    if single_parent and any(
        _full_years(b, on_date) < 14 or (dis and _full_years(b, on_date) < 18) for b, dis in children
    ):
        reasons.append("vienas (-a) augina vaiką")

    extended, ext_note = 0, ""
    if reasons:
        extended, ext_note = ext_status, "pailgintos: " + ", ".join(reasons)
    if profession_days and profession_days > extended:
        extended, ext_note = int(profession_days), "pailgintos pagal profesiją"

    seniority = 0
    if seniority_since:
        years = _full_years(seniority_since, on_date)
        if years >= 10:
            seniority = 3 + (years - 10) // 5

    if extended and extended >= base + seniority:
        parts = [(extended, ext_note)]
    else:
        parts = [(base, week_note)]
        if seniority:
            parts.append((seniority, "daugiau nei 10 m. nepertraukiamas stažas įmonėje"))
    if extra_days:
        parts.append((int(extra_days), "papildomai pagal darbo sutartį"))
    return LeaveEntitlement(sum(d for d, _ in parts), parts)
