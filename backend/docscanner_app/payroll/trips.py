"""
Komandiruotės: dienpinigiai pagal LRV nutarimą Nr. 526 ir jų apmokestinimas (GPMĮ 17 str., nutarimas Nr. 99).

 - Norma - pagal valstybę, kurioje darbuotojas yra tą kalendorinę dieną (paskutinė apimanti kelionės dalis).
 - Mokama pasirinktu % nuo normos (ne mažiau 50 %).
 - Nuo 2026-10-01: vienos dienos komandiruotė Lietuvoje - dienpinigiai nemokami; jei pirma ar paskutinė
   diena trumpesnė nei 4 val. - mokama 20 % tos dienos dienpinigių.
 - Neapmokestinama dalis (per mėnesį, Lietuvos ir užsienio skaičiuojama atskirai):
     Lietuva   - iki 50 % darbuotojui nustatyto DU;
     užsienis  - visa (pagal normas), jei DU >= MMA x 1,65; kitaip - iki 50 % DU.
   Viršijanti dalis - su darbo santykiais susijusios pajamos (GPM + Sodra), GPM312 kodas 01;
   neapmokestinama - GPM312 kodas 05, Sodros įmokomis neapmokestinama.
"""
import json
import os
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
LT = "Lietuvos Respublika"
OTHER = "Kitos valstybės"
NEW_RULES_FROM = date(2026, 10, 1)
SHORT_DAY_HOURS = 4
SHORT_DAY_PCT = Decimal("20")
MIN_PCT = Decimal("50")

_DATA = os.path.join(os.path.dirname(__file__), "data", "dienpinigiai_2023.json")


def q2(v):
    return Decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def load_norms():
    with open(_DATA, encoding="utf-8") as f:
        d = json.load(f)
    return {n["name"]: Decimal(n["amount"]) for n in d["norms"]}


NORMS = load_norms()


@dataclass
class Leg:
    country: str
    date_from: date
    date_to: date


@dataclass
class TripDay:
    day: date
    country: str
    norm: Decimal
    pct: Decimal
    amount: Decimal
    note: str = ""


@dataclass
class TripCalc:
    days: list = field(default_factory=list)
    errors: list = field(default_factory=list)

    @property
    def total(self):
        return sum((d.amount for d in self.days), ZERO)

    def by_month(self):
        """{(metai, mėn): {"lt": suma, "foreign": suma}}"""
        out = {}
        for d in self.days:
            k = (d.day.year, d.day.month)
            cur = out.setdefault(k, {"lt": ZERO, "foreign": ZERO})
            cur["lt" if d.country == LT else "foreign"] += d.amount
        return out


def norm_for(country):
    return NORMS.get(country, NORMS[OTHER])


def calc_trip(legs, start_dt, end_dt, pct=Decimal("100")):
    """
    legs: [Leg] - kelionės dalys (pvz. Lietuva -> Lenkija -> Vokietija); start_dt / end_dt - išvykimas ir grįžimas.
    """
    c = TripCalc()
    pct = Decimal(pct)
    if pct < MIN_PCT or pct > 100:
        c.errors.append("Dienpinigių dydis turi būti nuo 50 iki 100 % normos")
    if end_dt <= start_dt:
        c.errors.append("Grįžimas turi būti vėliau nei išvykimas")
        return c
    if not legs:
        c.errors.append("Nurodykite bent vieną šalį")
        return c
    for leg in legs:
        if leg.country not in NORMS:
            c.errors.append(f"Nežinoma valstybė: {leg.country}")
    if c.errors:
        return c

    first, last = start_dt.date(), end_dt.date()
    new_rules = first >= NEW_RULES_FROM
    all_lt = all(l.country == LT for l in legs)
    if new_rules and all_lt and first == last:
        c.days.append(TripDay(first, LT, norm_for(LT), ZERO, ZERO,
                              "Vienos dienos komandiruotė Lietuvoje - dienpinigiai nemokami (nuo 2026-10-01)"))
        return c

    d = first
    while d <= last:
        covering = [l for l in legs if l.date_from <= d <= l.date_to]
        leg = covering[-1] if covering else (legs[-1] if d > legs[-1].date_to else legs[0])
        norm = norm_for(leg.country)
        day_pct, note = pct, ""
        if new_rules:
            hours = None
            if d == first and d != last:
                hours = (datetime.combine(d + timedelta(days=1), time(0)) - start_dt).total_seconds() / 3600
            elif d == last and d != first:
                hours = (end_dt - datetime.combine(d, time(0))).total_seconds() / 3600
            if hours is not None and hours < SHORT_DAY_HOURS:
                day_pct = pct * SHORT_DAY_PCT / 100
                note = f"Diena trumpesnė nei {SHORT_DAY_HOURS} val. - 20 %"
        c.days.append(TripDay(d, leg.country, norm, day_pct, q2(norm * day_pct / 100), note))
        d += timedelta(days=1)
    return c


def tax_split(lt_amount, foreign_amount, monthly_salary, mma, foreign_threshold_mma=Decimal("1.65")):
    """
    Mėnesio dienpinigių apmokestinimas -> (neapmokestinama, apmokestinama).
    monthly_salary - darbuotojui nustatytas DU (mėnesinė alga arba valandinis x mėnesio norma).
    """
    half = q2(Decimal(monthly_salary) / 2)
    lt_free = min(lt_amount, half)
    if Decimal(monthly_salary) >= q2(Decimal(mma) * foreign_threshold_mma):
        foreign_free = foreign_amount
    else:
        foreign_free = min(foreign_amount, half)
    free = lt_free + foreign_free
    return free, (lt_amount + foreign_amount) - free
