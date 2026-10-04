"""
GPM313: kuriam mėnesiui ir į kurį laukelį (6 / 7) priskiriamos DU išmokos - pagal FAKTINES išmokėjimo datas.

VMI (GPMĮ) taisyklės:
 1) Mokama kartą per mėnesį: GPM nuo išmokų iki 15 d. - iki to mėnesio 15 d., po 15 d. - iki mėnesio pabaigos.
 2) Mokama dalimis (avansas) ir visa išmokėta per tą patį mėnesį: GPM nuo visos sumos, išskaičiuojamas
    išmokant paskutinę dalį; terminas pagal paskutinės dalies datą (iki 15 d. / iki mėn. pabaigos).
 3) Paskutinė dalis išmokėta per 10 darbo dienų po mėnesio pabaigos: GPM nuo visos sumos išskaičiuojamas
    išmokant paskutinę dalį, sumokamas iki to mėnesio 15 d. Avansas deklaruojamas jo išmokėjimo mėnesį (GPM 0).
 4) Paskutinė dalis vėliau nei per 10 darbo dienų: GPM skaičiuojamas nuo kiekvienos dalies atskirai -
    automatiškai neskaidome, tik įspėjame.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from .work_calendar import is_holiday

ZERO = Decimal("0")


@dataclass
class EmployeeMonth:
    year: int
    month: int
    name: str
    taxable: Decimal                    # su darbo santykiais susijusios apmokestinamos išmokos (bruto - neapmokestinama)
    gpm: Decimal
    final_date: date                    # paskutinės dalies (atlyginimo) išmokėjimo data
    advances: list = field(default_factory=list)   # [(date, suma)]
    planned: bool = False               # bent viena data - planinė (mokėjimas dar nepažymėtas)


def month_end(y, m):
    return date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)


def nth_work_day_after(d, n):
    """n-oji darbo diena po datos d (šventės ir savaitgaliai neskaičiuojami)."""
    cur, left = d, n
    while left:
        cur += timedelta(days=1)
        if cur.weekday() < 5 and not is_holiday(cur):
            left -= 1
    return cur


def attribute(em):
    """-> ([((metai, mėn.), pajamos, gpm, diena)], įspėjimai)"""
    end = month_end(em.year, em.month)
    adv_total = sum((a for _, a in em.advances), ZERO)
    out, warns = [], []
    if em.final_date <= end:
        out.append(((em.final_date.year, em.final_date.month), em.taxable, em.gpm, em.final_date.day))
        return out, warns

    for d, a in em.advances:
        out.append(((d.year, d.month), a, ZERO, d.day))
    out.append(((em.final_date.year, em.final_date.month), em.taxable - adv_total, em.gpm, em.final_date.day))
    if adv_total and em.final_date > nth_work_day_after(end, 10):
        warns.append(f"{em.name}: {em.year}-{em.month:02d} atlyginimo likutis išmokėtas vėliau nei per 10 darbo dienų - "
                     f"GPM turi būti skaičiuojamas nuo kiekvienos dalies atskirai, patikrinkite 5-7 laukelius")
    if adv_total and em.month == 12:
        warns.append(f"{em.name}: gruodžio avansas - GPM nuo gruodį išmokėtų dalių turi būti sumokėtas iki gruodžio 31 d.")
    return out, warns


def gpm_due_date(pay_date):
    """GPM terminas pagal (paskutinės dalies) išmokėjimo datą: iki 15 d. -> 15 d., po 15 d. -> mėnesio pabaiga."""
    if pay_date.day <= 15:
        return date(pay_date.year, pay_date.month, 15)
    return month_end(pay_date.year, pay_date.month)
