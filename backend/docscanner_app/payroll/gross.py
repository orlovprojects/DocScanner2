"""
Bruto DU už mėnesį: mėnesinė alga proporcingai dirbtam laikui / valandinis atlygis.

Grynos funkcijos. Įvestis - sąlygų segmentai (ContractTerms per mėnesį)
ir nedirbtos dienos (atostogos, liga ir pan. - jos apmokamos kitais kodais).
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from .taxes import ZERO, q2
from .work_calendar import STANDARD_WEEK, is_holiday, is_pre_holiday, month_norm


@dataclass
class TermsSegment:
    valid_from: date
    valid_to: date            # imtinai
    pay_form: str             # "monthly" / "hourly"
    base_amount: Decimal      # alga arba valandinis įkainis
    workload: Decimal = Decimal("1")
    week: tuple = STANDARD_WEEK


@dataclass
class GrossLine:
    code: str                 # ALG / VAL
    date_from: date
    date_to: date
    days: int
    hours: Decimal
    rate: Decimal
    amount: Decimal


@dataclass
class GrossResult:
    lines: list = field(default_factory=list)
    worked_days: int = 0
    worked_hours: Decimal = ZERO
    warnings: list = field(default_factory=list)

    @property
    def amount(self):
        return sum((l.amount for l in self.lines), ZERO)


def _day_hours(d, week, workload):
    h = week[d.weekday()] * workload
    if h <= 0 or is_holiday(d):
        return ZERO
    if is_pre_holiday(d):
        h = max(h - Decimal("1"), ZERO)
    return h


def _worked(d_from, d_to, week, workload, absent):
    days, hours = 0, ZERO
    d = d_from
    while d <= d_to:
        if d not in absent:
            h = _day_hours(d, week, workload)
            if h > 0:
                days += 1
                hours += h
        d += timedelta(days=1)
    return days, hours


def monthly_hourly_rate(base_amount, year, month, week=STANDARD_WEEK, workload=Decimal("1")):
    """Valandos įkainis mėnesinei algai (viršvalandžiams, naktiniams): alga / mėnesio norma."""
    norm = month_norm(year, month, week, workload)
    return base_amount / norm.hours if norm.hours else ZERO


def calc_base_pay(year, month, segments, absent_dates=frozenset(), employed_from=None, employed_to=None, P=None):
    """
    segments: TermsSegment sąrašas (gali keistis mėnesio viduryje).
    absent_dates: nedirbtos darbo dienos (apmokamos kitais kodais arba neapmokamos).
    employed_from / employed_to: priėmimo / atleidimo datos, jei patenka į mėnesį.
    P: TaxParams - jei perduotas, tikrinama MMA / MVA.
    """
    month_start = date(year, month, 1)
    month_end = (date(year + (month == 12), month % 12 + 1, 1)) - timedelta(days=1)
    lo = max(month_start, employed_from or month_start)
    hi = min(month_end, employed_to or month_end)
    absent = frozenset(absent_dates)

    res = GrossResult()
    for seg in sorted(segments, key=lambda s: s.valid_from):
        s_from, s_to = max(seg.valid_from, lo), min(seg.valid_to, hi)
        if s_from > s_to:
            continue
        days, hours = _worked(s_from, s_to, seg.week, seg.workload, absent)
        res.worked_days += days
        res.worked_hours += hours

        if seg.pay_form == "hourly":
            amount = q2(seg.base_amount * hours)
            res.lines.append(GrossLine("VAL", s_from, s_to, days, hours, seg.base_amount, amount))
            if P and seg.base_amount < P.mva:
                res.warnings.append(f"Valandinis įkainis {seg.base_amount} < MVA {P.mva}")
        else:
            norm = month_norm(year, month, seg.week, seg.workload)
            amount = q2(seg.base_amount * hours / norm.hours) if norm.hours else ZERO
            rate = seg.base_amount / norm.hours if norm.hours else ZERO
            res.lines.append(GrossLine("ALG", s_from, s_to, days, hours, q2(rate), amount))
            if P and seg.base_amount < q2(P.mma * seg.workload):
                res.warnings.append(f"Alga {seg.base_amount} < MMA x etatas {q2(P.mma * seg.workload)}")
    return res


def multiplier_pay(hourly_rate, hours, multiplier):
    """Viršvalandžiai / naktis / šventės: įkainis x val. x koeficientas."""
    return q2(hourly_rate * hours * multiplier)
