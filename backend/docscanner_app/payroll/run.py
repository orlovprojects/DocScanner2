"""
Vieno darbuotojo mėnesio DU skaičiavimas: tabelis -> priskaitymai -> mokesčiai -> išmokėti.

Grynas modulis (be DB). DB adapteris (services) surenka EmployeeMonthInput iš modelių
ir išsaugo EmployeeMonthResult į PayrollRun / PayrollLine / PayrollEmployeeResult.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .averages import VduMonth, calc_daily_vdu, downtime_pay, pay_by_days
from .gross import TermsSegment, calc_base_pay, monthly_hourly_rate, multiplier_pay
from .seed_data import SYSTEM_PAY_CODES
from .taxes import HUNDRED, ZERO, TaxInput, calculate, q2
from .timesheet import Event, employer_sick_days, generate
from .work_calendar import month_norm

CODES = {c["code"]: c for c in SYSTEM_PAY_CODES}

HOUR_TYPE_CODES = {
    "overtime": "VRS", "night": "NAK", "rest_day": "POI", "holiday": "SVN",
    "ot_rest": "VRP", "ot_night": "VRN", "ot_holiday": "VRF",
}


@dataclass
class Line:
    code: str
    amount: Decimal
    quantity: Decimal = ZERO
    rate: Decimal = ZERO
    note: str = ""
    sodra_part: Decimal = None   # kiek sumos apmokestinama Sodra (užpildo _tax_input)


@dataclass
class EmployeeMonthInput:
    year: int
    month: int
    segments: list                           # TermsSegment
    events: list = field(default_factory=list)       # timesheet.Event
    overrides: dict = field(default_factory=dict)    # tabelio rankiniai pakeitimai
    employed_from: date = None
    employed_to: date = None

    vdu_months: list = field(default_factory=list)   # VduMonth x3
    bonuses: list = field(default_factory=list)      # BonusRecord
    extra_lines: list = field(default_factory=list)  # Line (premijos, dovanos, DPN...)
    deductions: list = field(default_factory=list)   # Line (ANT, PRF, ISK...) - teigiamos sumos
    advance_paid: Decimal = ZERO

    # darbuotojas / sutartis / įmonė
    npd_mode: str = "standard"
    pension_accumulation: bool = False
    progressive_request: bool = False
    fixed_term: bool = False
    na_rate: Decimal = Decimal("0.14")
    pays_gar_ilg: bool = True
    sick_pay_pct: Decimal = Decimal("62.06")
    grindys_applies: bool = False
    insured_fraction: Decimal = Decimal("1")          # grindims: draustų dienų dalis mėnesyje
    study_paid: bool = False                          # stažas > 5 m.
    vacation_settlement_days: Decimal = ZERO          # atleidžiant: >0 kompensacija (KMP), <0 pereikvota (ATG)

    # metų kaupiniai
    gpm_taxable_ytd: Decimal = ZERO
    vsd_base_ytd: Decimal = ZERO
    limits_used_ytd: dict = field(default_factory=dict)   # {"DOV": 50, "SVD": 0}


@dataclass
class EmployeeMonthResult:
    lines: list
    taxes: object
    timesheet: object
    daily_vdu: Decimal
    payable: Decimal
    limits_used: dict
    tax_input: object = None
    sdup_hours: Decimal = ZERO
    warnings: list = field(default_factory=list)

    @property
    def gross(self):
        return self.taxes.gross


def _vdu(inp, P, primary):
    norm = month_norm(inp.year, inp.month, primary.week, primary.workload)
    r = calc_daily_vdu(
        date(inp.year, inp.month, 1), inp.vdu_months, inp.bonuses,
        fallback_monthly=primary.base_amount if primary.pay_form == "monthly" else primary.base_amount * norm.hours,
        fallback_days=norm.work_days,
        floor_mma=P.mma, floor_workload=primary.workload, floor_days=norm.work_days,
    )
    return r


def _build_lines(inp, P, ts, primary, daily_vdu, warnings):
    lines = []

    # 1. Alga / valandinis
    base = calc_base_pay(inp.year, inp.month, inp.segments, ts.absent_dates(),
                         inp.employed_from, inp.employed_to, P)
    warnings.extend(base.warnings)
    for gl in base.lines:
        line = Line(gl.code, gl.amount, gl.hours, gl.rate)
        line.date_from = gl.date_from   # SDUP: grupė pagal laikotarpį
        lines.append(line)

    # 2. Pagal VDU
    for kind, code, pct in (("vacation", "ATO", HUNDRED), ("parent_day", "MAM", HUNDRED)):
        n = len(ts.event_workdays(kind))
        if n:
            lines.append(Line(code, pay_by_days(daily_vdu, n, pct), Decimal(n), q2(daily_vdu)))

    if inp.study_paid:
        n = len(ts.event_workdays("study"))
        if n:
            lines.append(Line("MOK", pay_by_days(daily_vdu, n, CODES["MOK"]["vdu_pct"]), Decimal(n), q2(daily_vdu)))

    n = len(ts.event_workdays("downtime"))
    if n:
        lines.append(Line("PRS", downtime_pay(daily_vdu, n), Decimal(n), q2(daily_vdu)))

    for ev in {id(e): e for e in inp.events if e.kind == "sick"}.values():
        if ev.start.year == inp.year and ev.start.month == inp.month:
            n = employer_sick_days(ev, primary.week, primary.workload)
            if n:
                lines.append(Line("LIG", pay_by_days(daily_vdu, n, inp.sick_pay_pct), Decimal(n), q2(daily_vdu)))

    # 2b. Kompensacija už nepanaudotas atostogas (atleidimo mėnesį)
    if inp.vacation_settlement_days > 0:
        days = inp.vacation_settlement_days
        lines.append(Line("KMP", pay_by_days(daily_vdu, days), days, q2(daily_vdu),
                          f"Nepanaudotos atostogos: {days} d."))

    # 3. Viršvalandžiai / naktis / šventės
    rate = (primary.base_amount if primary.pay_form == "hourly"
            else monthly_hourly_rate(primary.base_amount, inp.year, inp.month, primary.week, primary.workload))
    for hour_type, code in HOUR_TYPE_CODES.items():
        hours = ts.extra_hours(hour_type)
        if hours:
            mult = CODES[code]["multiplier"]
            lines.append(Line(code, multiplier_pay(rate, hours, mult), hours, q2(rate)))

    # 4. Papildomos eilutės
    lines.extend(inp.extra_lines)
    return lines


def _salary_for_dpn(lines):
    return sum((l.amount for l in lines if CODES.get(l.code, {}).get("category") == "earning"
                and CODES[l.code]["gpm_mode"] == "standard"), ZERO)


def _tax_input(inp, P, lines, warnings):
    ti = TaxInput(
        npd_mode=inp.npd_mode, pension_accumulation=inp.pension_accumulation,
        progressive_request=inp.progressive_request, gpm_taxable_ytd=inp.gpm_taxable_ytd,
        vsd_base_ytd=inp.vsd_base_ytd, fixed_term=inp.fixed_term, na_rate=inp.na_rate,
        pays_gar_ilg=inp.pays_gar_ilg, grindys_applies=inp.grindys_applies,
        insured_fraction=inp.insured_fraction,
    )
    used = dict(inp.limits_used_ytd)
    salary = _salary_for_dpn(lines)

    for l in lines:
        c = CODES.get(l.code)
        if c is None:
            warnings.append(f"Nežinomas DU kodas {l.code}")
            continue
        amount = l.amount
        taxable = amount
        exempt = ZERO

        if c["gpm_mode"] == "exempt":
            taxable, exempt = ZERO, amount
        elif c["gpm_mode"] == "limit":
            key = c["annual_limit_key"]
            limit = {"DOV": P.dov_limit, "SVD": P.svd_limit}.get(key)
            if limit is None:
                warnings.append(f"{l.code}: 25 % limitas dar neįgyvendintas - laikoma neapmokestinama")
                taxable, exempt = ZERO, amount
            else:
                free = max(limit - used.get(key, ZERO), ZERO)
                exempt = min(amount, free)
                taxable = amount - exempt
                used[key] = used.get(key, ZERO) + amount
        elif c["gpm_mode"] == "dpn_rule":
            if salary >= q2(P.mma * P.dpn_threshold_mma):
                taxable, exempt = ZERO, amount
            else:
                free = max(q2(salary / 2) - used.get("DPN_MONTH", ZERO), ZERO)
                exempt = min(amount, free)
                taxable = amount - exempt
                used["DPN_MONTH"] = used.get("DPN_MONTH", ZERO) + exempt

        # GPM
        if c["gpm_mode"] == "sick_15":
            ti.income_sick += taxable
        elif c["in_monthly_npd_base"] or c["gpm_mode"] in ("limit", "dpn_rule"):
            ti.income_standard += taxable
        else:
            ti.income_standard_no_npd += taxable
        ti.income_exempt += exempt

        # Sodra
        mode = c["sodra_mode"]
        if mode == "yes":
            part = amount
        elif mode == "limit" or (c["gpm_mode"] == "dpn_rule" and taxable):
            part = taxable
        elif mode == "aid_5mma":
            part = max(amount - q2(P.mma * P.aid_sodra_mma), ZERO)  # ⚠ per išmoką
        else:
            part = ZERO
        l.sodra_part = part
        ti.sodra_base += part

        # natūra
        if c["category"] == "in_kind":
            ti.in_kind += amount   # visa natūra neišmokama pinigais (ir apmokestinama, ir ne)

    used.pop("DPN_MONTH", None)
    return ti, used


SDUP_PAID_ABSENCES = {"vacation", "parent_day", "downtime"}
SDUP_EXTRA_HOUR_TYPES = ("overtime", "rest_day", "holiday", "ot_night", "ot_rest", "ot_holiday")


def sdup_paid_hours(ts, study_paid=False):
    """
    SDUP apmokėtas darbo laikas (A1-433 4.6 p.): dirbtos val. (su komandiruotėmis)
    + apmokamos neatvykimo valandos pagal grafiką + faktinės viršvalandžių / poilsio / švenčių val.
    Liga neįskaitoma. Naktinės valandos jau yra dirbtose. Koeficientai valandų nedidina.
    """
    kinds = SDUP_PAID_ABSENCES | ({"study"} if study_paid else set())
    hours = ts.worked_hours
    hours += sum((d.scheduled_hours for d in ts.days if d.event and d.event.kind in kinds), ZERO)
    hours += sum((ts.extra_hours(t) for t in SDUP_EXTRA_HOUR_TYPES), ZERO)
    return hours


def calculate_employee_month(P, inp):
    warnings = []
    primary = sorted(inp.segments, key=lambda s: s.valid_from)[-1]
    ts = generate(inp.year, inp.month, week=primary.week, workload=primary.workload,
                  employed_from=inp.employed_from, employed_to=inp.employed_to,
                  events=inp.events, overrides=inp.overrides)

    vdu = _vdu(inp, P, primary)
    warnings.extend(vdu.notes)

    lines = _build_lines(inp, P, ts, primary, vdu.daily, warnings)
    ti, used = _tax_input(inp, P, lines, warnings)
    taxes = calculate(P, ti)
    warnings.extend(taxes.notes)

    auto_deductions = []
    if inp.vacation_settlement_days < 0:
        days = -inp.vacation_settlement_days
        atg = Line("ATG", pay_by_days(vdu.daily, days), days, q2(vdu.daily), f"Pereikvotos atostogos: {days} d.")
        auto_deductions.append(atg)
        lines.append(atg)
        warnings.append(f"Pereikvota {days} d. atostogų - išskaičiuojama {atg.amount} (patikrinkite DK 150 str. ribas)")

    deductions = sum((d.amount for d in list(inp.deductions) + auto_deductions), ZERO)
    payable = taxes.net - deductions - inp.advance_paid
    if payable < 0:
        warnings.append(f"Išmokėti lieka neigiama suma {payable}")

    return EmployeeMonthResult(lines=lines, taxes=taxes, timesheet=ts, daily_vdu=vdu.daily,
                               payable=payable, limits_used=used, tax_input=ti,
                               sdup_hours=sdup_paid_hours(ts, inp.study_paid), warnings=warnings)


# ============================================================
# IŠSKAITOS PAGAL CPK (antstolis, alimentai) ⚠ bazė - DU po mokesčių
# ============================================================

def max_deduction(net, P, kind="ordinary"):
    """Didžiausia leistina išskaita: pakopos pagal MMA dalis."""
    tiers = {"ordinary": (10, 30, 50), "maintenance": (30, 50, 50)}[kind]
    m = P.mma
    parts = (min(net, m), max(min(net, 2 * m) - m, ZERO), max(net - 2 * m, ZERO))
    return q2(sum(p * Decimal(t) / HUNDRED for p, t in zip(parts, tiers)))
