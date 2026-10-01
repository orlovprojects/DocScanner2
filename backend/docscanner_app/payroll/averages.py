"""
Vidutinis darbo užmokestis (VDU) - LRV nutarimas Nr. 496.

Dienos VDU = paprastoji dalis + premijų dalis:
  paprastoji = DU per 3 mėn. (be išmokų pagal VDU) / FAKTIŠKAI dirbtos dienos
  premijos   = (paskutinė ketvirtinė premija, priskaičiuota per 3 mėn.
                + 1/4 metinių / >3 mėn. premijų, priskaičiuotų per 12 mėn.)
               / darbo dienos pagal GRAFIKĄ per 3 mėn.
Nuo 2025-10-31 premijos imamos pagal priskaičiavimo (ne išmokėjimo) mėnesį.

Taip pat: atostoginiai, liga 1-2 d., mamadieniai, prastova, teisė į mamadienius.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .taxes import ZERO, q2

TWO_THIRDS = Decimal("2") / Decimal("3")
DOWNTIME_LONG_PCT = Decimal("40")


@dataclass
class VduMonth:
    year: int
    month: int
    earnings: Decimal            # tik vdu_treatment=regular kodai
    worked_days: int             # faktiškai dirbtos
    worked_hours: Decimal = ZERO
    scheduled_days: int = 0      # pagal grafiką (premijų daliai)


@dataclass
class BonusRecord:
    accrual_month: date          # priskaičiavimo mėnuo (1 d.)
    amount: Decimal
    kind: str                    # "quarterly" / "annual"


@dataclass
class VduResult:
    daily: Decimal
    hourly: Decimal
    regular_part: Decimal
    bonus_part: Decimal
    source: str                  # "history" / "fallback" / "floor"
    notes: list = field(default_factory=list)


def _months_back(event_month, n):
    """n mėnesių prieš event_month (be jo), naujausias pirmas."""
    y, m = event_month.year, event_month.month
    out = []
    for _ in range(n):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        out.append(date(y, m, 1))
    return out


def calc_daily_vdu(event_month, months, bonuses=(), *,
                   fallback_monthly=None, fallback_days=None,
                   floor_mma=None, floor_workload=Decimal("1"), floor_days=None):
    """
    event_month: mėnesio, kuriam reikia VDU, 1 diena.
    months: VduMonth už 3 ankstesnius mėnesius.
    fallback_*: kai nėra dirbtų dienų (naujas darbuotojas) - alga / darbo dienos.
    floor_*: minimalus VDU = MMA x etatas / darbo dienos. ⚠ patikrinti formulę.
    """
    notes = []
    period = set(_months_back(event_month, 3))
    period12 = set(_months_back(event_month, 12))

    earnings = sum((m.earnings for m in months), ZERO)
    worked_days = sum(m.worked_days for m in months)
    worked_hours = sum((m.worked_hours for m in months), ZERO)
    scheduled_days = sum(m.scheduled_days for m in months)

    # --- premijos ---
    quarterly = [b for b in bonuses if b.kind == "quarterly" and b.accrual_month in period]
    last_q = max(quarterly, key=lambda b: b.accrual_month).amount if quarterly else ZERO
    annual = sum((b.amount for b in bonuses if b.kind == "annual" and b.accrual_month in period12), ZERO)
    bonus_total = last_q + annual / Decimal("4")
    bonus_part = bonus_total / scheduled_days if (bonus_total and scheduled_days) else ZERO
    if bonus_total and not scheduled_days:
        notes.append("Premijos neįskaičiuotos: nežinomas grafiko dienų skaičius")

    # --- paprastoji dalis ---
    if worked_days > 0:
        regular_part = earnings / worked_days
        hourly = earnings / worked_hours if worked_hours else ZERO
        source = "history"
    elif fallback_monthly is not None and fallback_days:
        regular_part = Decimal(fallback_monthly) / fallback_days
        hourly = ZERO
        source = "fallback"
        notes.append("Nėra dirbtų dienų per 3 mėn. - VDU pagal sutartinę algą")
    else:
        regular_part = ZERO
        hourly = ZERO
        source = "history"
        notes.append("Nepavyko apskaičiuoti VDU - nėra duomenų")

    daily = regular_part + bonus_part

    if floor_mma is not None and floor_days:
        floor = Decimal(floor_mma) * floor_workload / floor_days
        if daily < floor:
            notes.append(f"VDU {q2(daily)} < minimalaus {q2(floor)} - taikomas minimalus")
            daily, source = floor, "floor"

    return VduResult(daily=daily, hourly=hourly, regular_part=regular_part,
                     bonus_part=bonus_part, source=source, notes=notes)


# ============================================================
# IŠMOKOS PAGAL VDU
# ============================================================

def pay_by_days(daily_vdu, days, pct=Decimal("100")):
    """Atostoginiai (ATO), kompensacija (KMP), mamadieniai (MAM) ir kt."""
    return q2(daily_vdu * Decimal(days) * pct / Decimal("100"))


def sick_pay_employer(daily_vdu, sick_workdays, pct):
    """Liga: darbdavys moka už pirmas 2 d., sutampančias su darbo dienomis."""
    return pay_by_days(daily_vdu, min(int(sick_workdays), 2), pct)


def downtime_pay(daily_vdu, days):
    """Prastova: 1 d. - 100 %, 2-3 d. - 2/3, nuo 4 d. - 40 % VDU."""
    days = int(days)
    factor = Decimal(min(days, 1))
    factor += TWO_THIRDS * max(min(days, 3) - 1, 0)
    factor += DOWNTIME_LONG_PCT / Decimal("100") * max(days - 3, 0)
    return q2(daily_vdu * factor)


# ============================================================
# MAMADIENIAI / TĖVADIENIAI (DK 138 str. 3 d.)
# ============================================================

# Nuo 2027-01-01 vaiko amžiaus riba 12 -> 14 m. (įstatymas priimtas)
AGE_LIMIT_CHANGE = date(2027, 1, 1)


@dataclass
class ChildInfo:
    birth_date: date
    has_disability: bool = False


def _age(birth, on_date):
    return on_date.year - birth.year - ((on_date.month, on_date.day) < (birth.month, birth.day))


def child_age_limit(on_date):
    return 14 if on_date >= AGE_LIMIT_CHANGE else 12


def parent_day_entitlement(children, on_date, age_limit=None):
    """
    Grąžina (dienų skaičius, laikotarpis mėnesiais):
      3+ vaikai < riba                              -> (2, 1)
      2 vaikai < riba, bent vienas su negalia       -> (2, 1)
      vaikas su negalia < 18                        -> (1, 1)
      2 vaikai < riba                               -> (1, 1)
      1 vaikas < riba                               -> (1, 3)  1 d. per 3 mėn.
    Riba: 12 m. (2026), 14 m. (nuo 2027-01-01). Nepanaudotos dienos nekaupiamos.
    """
    limit = age_limit or child_age_limit(on_date)
    young = [c for c in children if _age(c.birth_date, on_date) < limit]
    young_disabled = sum(1 for c in young if c.has_disability)
    disabled_18 = sum(1 for c in children if c.has_disability and _age(c.birth_date, on_date) < 18)

    if len(young) >= 3:
        return 2, 1
    if len(young) >= 2 and young_disabled >= 1:
        return 2, 1
    if disabled_18 >= 1 or len(young) >= 2:
        return 1, 1
    if len(young) >= 1:
        return 1, 3
    return 0, 0
