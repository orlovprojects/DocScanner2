"""
Lietuvos darbo kalendorius: šventės, prieššventinės dienos, mėnesio darbo laiko norma.

DK 112 str.: prieš švenčių dieną darbo dienos trukmė trumpinama 1 valanda.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from functools import lru_cache

# Standartinis grafikas: Pr-Pn po 8 val. (indeksas = weekday(), 0 = pirmadienis)
STANDARD_WEEK = (Decimal("8"), Decimal("8"), Decimal("8"), Decimal("8"), Decimal("8"), Decimal("0"), Decimal("0"))

FIXED_HOLIDAYS = {
    (1, 1): "Naujieji metai",
    (2, 16): "Lietuvos valstybės atkūrimo diena",
    (3, 11): "Lietuvos nepriklausomybės atkūrimo diena",
    (5, 1): "Tarptautinė darbo diena",
    (6, 24): "Rasos ir Joninių diena",
    (7, 6): "Valstybės (Karaliaus Mindaugo karūnavimo) diena",
    (8, 15): "Žolinė",
    (11, 1): "Visų šventųjų diena",
    (11, 2): "Mirusiųjų atminimo (Vėlinių) diena",
    (12, 24): "Kūčios",
    (12, 25): "Kalėdos",
    (12, 26): "Kalėdos (antroji diena)",
}


def easter_sunday(year):
    """Velykos (Grigaliaus kalendorius, anoniminis algoritmas)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _first_sunday(year, month):
    d = date(year, month, 1)
    return d + timedelta(days=(6 - d.weekday()) % 7)


@lru_cache(maxsize=64)
def holidays(year):
    """{date: pavadinimas} visoms metų šventėms."""
    result = {date(year, m, d): name for (m, d), name in FIXED_HOLIDAYS.items()}
    easter = easter_sunday(year)
    result[easter] = "Velykos"
    result[easter + timedelta(days=1)] = "Velykų antroji diena"
    result[_first_sunday(year, 5)] = "Motinos diena"
    result[_first_sunday(year, 6)] = "Tėvo diena"
    return result


def is_holiday(d):
    return d in holidays(d.year)


def is_pre_holiday(d):
    """Diena prieš šventę (tikrinama pati diena, ne ar ji darbo)."""
    return is_holiday(d + timedelta(days=1))


@dataclass(frozen=True)
class MonthNorm:
    year: int
    month: int
    work_days: int
    hours: Decimal
    workdays_list: tuple


def _month_days(year, month):
    d = date(year, month, 1)
    while d.month == month:
        yield d
        d += timedelta(days=1)


def month_norm(year, month, week=STANDARD_WEEK, workload=Decimal("1")):
    """
    Mėnesio darbo laiko norma pagal savaitės grafiką.
    week: 7 reikšmės (val. per dieną Pr..Sk); workload: etato dalis (1 / 0,5 ...).
    Prieššventinė darbo diena trumpinama 1 val. (ne daugiau nei tos dienos trukmė).
    """
    days = []
    hours = Decimal("0")
    for d in _month_days(year, month):
        day_hours = week[d.weekday()] * workload
        if day_hours <= 0 or is_holiday(d):
            continue
        if is_pre_holiday(d):
            day_hours = max(day_hours - Decimal("1"), Decimal("0"))
        days.append(d)
        hours += day_hours
    return MonthNorm(year, month, len(days), hours, tuple(days))


def work_days_between(start, end, week=STANDARD_WEEK):
    """Darbo dienų skaičius tarp datų imtinai (šventės neįskaitomos)."""
    count = 0
    d = start
    while d <= end:
        if week[d.weekday()] > 0 and not is_holiday(d):
            count += 1
        d += timedelta(days=1)
    return count
