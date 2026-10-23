"""
DU skaičiavimo DB sluoksnis: modeliai -> EmployeeMonthInput -> run.py -> PayrollRun / Line / Result.

Pagrindinės funkcijos:
    get_or_create_run(company, year, month)
    recalculate_run(run)          - perskaičiuoja visus darbuotojus (rankinės eilutės išlieka)
    approve_run(run, user)        - patvirtina ir sukuria DK įrašą
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
import re

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from docscanner_app.models import (
    AbsenceEvent, Employee, EmploymentContract, PayCode, PayrollEmployeeResult,
    ContractTerms, DasDocument, EmployeeDocument, EmployeeRequest, PayrollDeclaration, PayrollLine, PayrollRun, PayrollSettings, Position, PositionGroup, TimesheetEntry,
    VacationAdjustment,
)

from .averages import BonusRecord, VduMonth
from .gross import TermsSegment
from .journal import build_journal, is_balanced, merge_journals, merge_journals_by_employee, tax_lines
from .parameters import get_params
from .run import EmployeeMonthInput, Line, calculate_employee_month
from .timesheet import Event, generate
from .vacation import VacationEvent, annual_entitlement, used_days, vacation_balance
from .das import DasContext, DasGroup, render_das_html  # noqa: F401 (render_das_html naudoja views)
from .sdup import SdupRow, build_sdup, split_by_groups
from .sdup import ssn as sdup_ssn
from .work_calendar import STANDARD_WEEK

logger = logging.getLogger("docscanner_app")

FAR_FUTURE = date(2999, 12, 31)
UNINSURED_KINDS = {"unpaid", "truancy", "childcare", "maternity", "paternity", "suspension"}
CLOSED_STATUSES = ("approved", "paid", "closed")


# ============================================================
# Pagalbinės
# ============================================================

def month_bounds(year, month):
    first = date(year, month, 1)
    last = date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)
    return first, last


def _months_back(first, n):
    y, m = first.year, first.month
    for _ in range(n):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        yield y, m


def _settings(company):
    s, _ = PayrollSettings.objects.get_or_create(company=company)
    return s


def _pay_codes(company):
    """{code: PayCode} - įmonės kodai perrašo sisteminius."""
    out = {}
    for pc in PayCode.objects.filter(Q(company__isnull=True) | Q(company=company), active=True).order_by("company_id"):
        if pc.code not in out or pc.company_id:
            out[pc.code] = pc
    return out


def terms_week(t):
    """Savaitės grafikas: sutarties grafikas arba standartinis 5x8, perskaičiuotas sutrumpintai normai."""
    if t is None:
        return STANDARD_WEEK
    wh = getattr(t, "week_hours", None)
    if wh and len(wh) == 7 and t.workload:
        # week_hours - faktinės valandos; skaičiavimai (timesheet, norma) daugina iš workload, todėl grąžinam visam etatui
        return tuple(Decimal(str(h)) / Decimal(str(t.workload)) for h in wh)
    if t.schedule:
        return t.schedule.week()
    k = (t.full_time_hours or Decimal("40")) / Decimal("40")
    return tuple(h * k for h in STANDARD_WEEK)


def _active_contract(employee, first, last):
    return (EmploymentContract.objects
            .filter(employee=employee, start_date__lte=last)
            .exclude(status="draft")
            .filter(Q(termination_date__isnull=True) | Q(termination_date__gte=first))
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=first) | Q(termination_date__gte=first))
            .order_by("-start_date").first())


def _segments(contract):
    terms = list(contract.terms.select_related("schedule").order_by("valid_from"))
    end = contract.effective_end or FAR_FUTURE
    segs = []
    for i, t in enumerate(terms):
        valid_to = terms[i + 1].valid_from - timedelta(days=1) if i + 1 < len(terms) else end
        week = terms_week(t)
        segs.append(TermsSegment(t.valid_from, valid_to, t.pay_form, t.base_amount, t.workload, week,
                                 summed=getattr(t, "work_regime", "standard") == "summed"))
    return segs


def _events(employee, first, last):
    qs = AbsenceEvent.objects.filter(employee=employee, status="approved",
                                     start_date__lte=last, end_date__gte=first)
    return [Event(e.kind, e.start_date, e.end_date,
                  is_continuation=e.parent_event_id is not None or not e.employer_pays_first_days,
                  ref=e.id) for e in qs]


def _overrides(employee, year, month):
    """Tabelio pakeitimai: komandiruotės valandos (iš patvirtintų komandiruočių), virš jų - rankiniai įrašai."""
    from .trips_services import trip_overrides
    out = {d: {"code": v["code"], "hours": v["hours"], "extra": dict(v["extra"])}
           for d, v in trip_overrides(employee, year, month).items()}
    qs = TimesheetEntry.objects.filter(employee=employee, timesheet__year=year, timesheet__month=month,
                                       is_manual=True)
    manual_extra = set()
    for e in qs:
        o = out.setdefault(e.date, {"extra": {}})
        if e.hour_type == "normal":
            o["code"] = e.code
            o["hours"] = e.hours
        else:
            if (e.date, e.hour_type) not in manual_extra:          # rankinis pakeičia komandiruotės reikšmę
                o["extra"][e.hour_type] = 0
                manual_extra.add((e.date, e.hour_type))
            o["extra"][e.hour_type] = o["extra"].get(e.hour_type, 0) + e.hours
    return out


def _manual_dates(employee, year, month):
    return set(TimesheetEntry.objects.filter(employee=employee, timesheet__year=year, timesheet__month=month,
                                             is_manual=True).values_list("date", flat=True))


def _closed_results(employee):
    return PayrollEmployeeResult.objects.filter(employee=employee, run__status__in=CLOSED_STATUSES,
                                                run__kind="regular")


def _vdu_months(employee, first):
    # perėjimas iš kitos programos: VDU iš senos programos pirmus 3 mėnesius (kol nėra savų skaičiavimų)
    ov = getattr(employee, "opening_vdu", None)
    until = getattr(employee, "opening_vdu_until", None)
    if ov and until and first < until:
        days, hours = Decimal("21"), Decimal("168")
        earnings = ov * (hours if getattr(employee, "opening_vdu_unit", "day") == "hour" else days)
        return [VduMonth(first.year, first.month, earnings.quantize(Decimal("0.01")), int(days), hours, int(days))]
    from docscanner_app.models import PayrollHistoryMonth
    months = []
    for y, m in _months_back(first, 3):
        res = _closed_results(employee).filter(run__year=y, run__month=m).first()
        if not res:
            h = PayrollHistoryMonth.objects.filter(employee=employee, year=y, month=m).first()
            if h:            # perkelta iš ankstesnės programos
                months.append(VduMonth(y, m, h.income, h.worked_days, h.worked_hours, h.worked_days))
            continue
        earnings = (PayrollLine.objects
                    .filter(run=res.run, employee=employee, pay_code__vdu_treatment="regular",
                            pay_code__category="earning")
                    .aggregate(s=Sum("amount"))["s"] or Decimal("0"))
        snap = res.calc_snapshot or {}
        months.append(VduMonth(y, m, earnings, int(snap.get("worked_days", 0)),
                               Decimal(str(snap.get("worked_hours", 0))), int(snap.get("scheduled_days", 0))))
    return months


def _bonuses(employee, first):
    since_y, since_m = list(_months_back(first, 12))[-1]
    qs = (PayrollLine.objects
          .filter(employee=employee, run__status__in=CLOSED_STATUSES,
                  pay_code__vdu_treatment__in=("quarterly_bonus", "annual_bonus"),
                  accrual_month__gte=date(since_y, since_m, 1), accrual_month__lt=first)
          .select_related("pay_code"))
    kind = {"quarterly_bonus": "quarterly", "annual_bonus": "annual"}
    return [BonusRecord(l.accrual_month.replace(day=1), l.amount, kind[l.pay_code.vdu_treatment]) for l in qs]


def _ytd(employee, year, month):
    agg = (_closed_results(employee).filter(run__year=year, run__month__lt=month)
           .aggregate(vsd=Sum("sodra_base"), gross=Sum("gross"), npd=Sum("npd_applied")))
    limits = {}
    qs = (PayrollLine.objects
          .filter(employee=employee, run__status__in=CLOSED_STATUSES, run__year=year, run__month__lt=month,
                  pay_code__annual_limit_key__isnull=False)
          .values("pay_code__annual_limit_key").annotate(s=Sum("amount")))
    for row in qs:
        limits[row["pay_code__annual_limit_key"]] = row["s"]
    gpm_taxable = (agg["gross"] or Decimal("0")) - (agg["npd"] or Decimal("0"))  # ⚠ apytiksliai
    from docscanner_app.models import PayrollHistoryMonth
    hist = (PayrollHistoryMonth.objects.filter(employee=employee, year=year, month__lt=month)
            .aggregate(s=Sum("income")))["s"] or Decimal("0")       # perkelta iš ankstesnės programos
    return (agg["vsd"] or Decimal("0")) + hist, gpm_taxable + hist, limits


def _insured_fraction(events, first, last, employed_from, employed_to):
    """Draustų kalendorinių dienų dalis grindims (be Sodros ligos, nemokamų atostogų ir pan.)."""
    days_in_month = (last - first).days + 1
    lo, hi = max(first, employed_from or first), min(last, employed_to or last)
    uninsured = set()
    for ev in events:
        if ev.kind in UNINSURED_KINDS:
            s, e = max(ev.start, lo), min(ev.end, hi)
            uninsured |= {s + timedelta(days=i) for i in range((e - s).days + 1)} if s <= e else set()
        elif ev.kind == "sick":
            # nuo 3 d. moka Sodra - draudžiamųjų pajamų negauna
            s, e = max(ev.start + timedelta(days=2), lo), min(ev.end, hi)
            uninsured |= {s + timedelta(days=i) for i in range((e - s).days + 1)} if s <= e else set()
    insured = (hi - lo).days + 1 - len(uninsured)
    return Decimal(max(insured, 0)) / Decimal(days_in_month)


def _manual_lines(run, employee):
    extra, deductions, advance = _manual_lines_base(run, employee)
    from docscanner_app.models import PayrollPayment
    # PAY-03: išskaičiuojamas tik FAKTIŠKAI sumokėtas avansas (banko išrašas / rankinė žyma)
    paid = (PayrollPayment.objects
            .filter(company=run.company, employee=employee, kind="advance", year=run.year, month=run.month)
            .exclude(status="cancelled").aggregate(s=Sum("paid_amount"))["s"] or Decimal("0"))
    return extra, deductions, advance + paid


class AdvanceDecisionRequired(Exception):
    """Tvirtinant DU: yra nepažymėtų kaip sumokėti avansų - reikia buhalterio sprendimo."""
    def __init__(self, items):
        super().__init__("advances")
        self.items = items


def unpaid_advances(run):
    from docscanner_app.models import PayrollPayment
    ids = list(run.results.values_list("employee_id", flat=True))
    out = []
    for p in (PayrollPayment.objects.filter(company=run.company, kind="advance", year=run.year, month=run.month,
                                            employee_id__in=ids)
              .exclude(status__in=("cancelled", "paid")).select_related("employee")):
        if p.open_amount > Decimal("0.01"):
            out.append({"id": p.id, "employee": p.employee.full_name, "amount": str(p.amount),
                        "paid": str(p.paid_amount), "open": str(p.open_amount),
                        "due_date": p.due_date.isoformat() if p.due_date else None})
    return out


@transaction.atomic
def apply_advance_decisions(run, user, decisions):
    """decisions: {payment_id: {"action": "paid"|"unpaid", "date": "YYYY-MM-DD"}} -> įspėjimai"""
    from docscanner_app.models import PayrollPayment
    from .payments import _recalc, mark_paid
    st = _settings(run.company)
    warnings = []
    for pid, dec in (decisions or {}).items():
        p = PayrollPayment.objects.filter(id=int(pid), company=run.company, kind="advance").first()
        if p is None or p.open_amount <= Decimal("0.01"):
            continue
        if dec.get("action") == "paid":
            d = date.fromisoformat(dec.get("date")) if dec.get("date") else (p.due_date or timezone.localdate())
            mark_paid(p, user, d, st.payout_account or "", note="Pažymėta tvirtinant DU")
        else:
            if p.paid_amount > 0:                     # dalis sumokėta - avansas sumažinamas iki sumokėtos dalies
                p.amount = p.paid_amount
                p.save(update_fields=["amount", "updated_at"])
                _recalc(p)
            else:
                p.status = "cancelled"
                p.save(update_fields=["status", "updated_at"])
            warnings.append(f"{p.employee.full_name}: avansas nesumokėtas – visa suma išmokama su atlyginimu. "
                            "Pagal DK DU mokamas ne rečiau kaip 2 kartus per mėnesį, nebent darbuotojas prašė kartą "
                            "(tada pažymėkite tai jo kortelėje).")
    return warnings


def recurring_lines(employee, contract, first, last, manual):
    """
    Nuolatiniai priedai (fiksuota suma arba % nuo pareiginės algos) - automatiškai kiekvieną mėnesį.
    Jei šį mėnesį tas pats kodas įvestas rankiniu būdu - nuolatinis nededamas (rankinis turi pirmenybę).
    """
    from docscanner_app.models import RecurringPayItem
    have = {l.code for l in manual}
    out = []
    terms = _latest_terms(contract, last)
    for it in RecurringPayItem.objects.filter(employee=employee, valid_from__lte=last).select_related("pay_code"):
        if it.valid_to and it.valid_to < first:
            continue
        code = it.pay_code.code
        if code in have:
            continue
        if it.percent:
            base = terms.base_amount if terms and terms.pay_form == "monthly" else Decimal("0")
            amount = (base * it.percent / Decimal("100")).quantize(Decimal("0.01"))
            note = f"{it.percent} % nuo pareiginės algos"
        else:
            amount, note = it.amount or Decimal("0"), ""
        if amount > 0:
            out.append(Line(code, amount, Decimal("0"), Decimal("0"), (it.comment or note)[:255]))
    return out


def garnishment_inputs(employee, first, last, run=None):
    """Galiojantys išskaitų dokumentai -> skaičiavimo įvestis (su skolos likučiu)."""
    from django.db.models import Sum
    from docscanner_app.models import GarnishmentOrder, PayrollLine
    out = []
    for g in GarnishmentOrder.objects.filter(employee=employee, status="active", valid_from__lte=last):
        if g.valid_to and g.valid_to < first:
            continue
        remaining = None
        if g.total_debt is not None:
            paid = PayrollLine.objects.filter(garnishment=g, run__status__in=CLOSED_STATUSES)
            if run is not None:
                paid = paid.exclude(run=run)
            done = (paid.aggregate(s=Sum("amount"))["s"] or Decimal("0")) + (g.paid_before or Decimal("0"))
            remaining = max(g.total_debt - done, Decimal("0"))
            if remaining <= 0:
                continue
        out.append({"id": g.id, "kind": g.kind, "method": g.method, "percent": g.percent, "amount": g.amount,
                    "remaining": remaining, "doc": f"{g.get_kind_display()} {g.document_no}".strip()})
    return out


def garnishment_balance(g):
    from django.db.models import Sum
    from docscanner_app.models import PayrollLine
    paid = (PayrollLine.objects.filter(garnishment=g, run__status__in=CLOSED_STATUSES)
            .aggregate(s=Sum("amount"))["s"] or Decimal("0")) + (g.paid_before or Decimal("0"))
    return paid, (max(g.total_debt - paid, Decimal("0")) if g.total_debt is not None else None)


def _manual_lines_base(run, employee):
    extra, deductions, advance = [], [], Decimal("0")
    for l in run.lines.filter(employee=employee, is_manual=True).select_related("pay_code"):
        line = Line(l.pay_code.code, l.amount, l.quantity, l.rate, l.comment)
        line.db_id = l.id
        if l.pay_code.code == "AVN":
            advance += l.amount
        elif l.pay_code.category == "deduction":
            deductions.append(line)
        else:
            extra.append(line)
    return extra, deductions, advance


# ============================================================
# Atostogų likutis
# ============================================================

def _vacation_events(employee):
    qs = AbsenceEvent.objects.filter(employee=employee, status="approved")
    return [VacationEvent(e.kind, e.start_date, e.end_date) for e in qs]


def _week_on(contract, on_date):
    t = (contract.terms.select_related("schedule").filter(valid_from__lte=on_date)
         .order_by("-valid_from").first()) or contract.terms.select_related("schedule").order_by("valid_from").first()
    return terms_week(t)


def vacation_for(employee, on_date, contract=None):
    """VacationBalance darbuotojui konkrečiai dienai (arba None, jei nėra sutarties)."""
    contract = contract or _active_contract(employee, on_date, on_date) or \
        employee.contracts.exclude(status="draft").order_by("-start_date").first()
    if contract is None:
        return None
    adj = (VacationAdjustment.objects.filter(employee=employee, date__lte=on_date)
           .aggregate(s=Sum("days"))["s"] or Decimal("0"))
    week = _week_on(contract, on_date)
    ent = leave_entitlement(employee, contract, on_date, week)
    return vacation_balance(contract.start_date, on_date, ent.total,
                            _vacation_events(employee), adj, week, contract.effective_end)


def leave_entitlement(employee, contract, on_date, week=None):
    """Kiek kasmetinių atostogų dienų per metus priklauso (su paaiškinimu)."""
    week = week or _week_on(contract, on_date)
    return annual_entitlement(
        on_date,
        work_days_per_week=sum(1 for h in week if h > 0),
        birth_date=employee.birth_date,
        has_disability=employee.has_disability or employee.npd_mode in ("d30_55", "d0_25"),
        single_parent=employee.single_parent,
        children=[(c.birth_date, c.has_disability) for c in employee.children.all()],
        profession_days=contract.extended_leave_days,
        seniority_since=contract.seniority_since or contract.start_date,
        extra_days=contract.extra_leave_days,
    )


def set_vacation_balance(employee, on_date, balance, reason="Likučio nustatymas"):
    """Įrašo korekciją taip, kad likutis on_date dieną būtų lygus balance."""
    current = vacation_for(employee, on_date)
    if current is None:
        raise ValueError("Darbuotojas neturi darbo sutarties")
    diff = Decimal(str(balance)) - current.balance
    if diff:
        VacationAdjustment.objects.create(employee=employee, date=on_date, days=diff, reason=reason)
    return vacation_for(employee, on_date)


def requested_vacation_days(employee, date_from, date_to):
    contract = _active_contract(employee, date_from, date_to)
    week = _week_on(contract, date_from) if contract else STANDARD_WEEK
    return used_days([VacationEvent("vacation", date_from, date_to)], week)


def _vacation_settlement(employee, contract, employed_to):
    """Atleidimo mėnesį: likutis -> kompensacija (+) arba pereikvota (-)."""
    if not employed_to:
        return Decimal("0")
    b = vacation_for(employee, employed_to, contract)
    return b.balance if b else Decimal("0")


# ============================================================
# Įvestis vienam darbuotojui
# ============================================================

def build_employee_input(run, employee, settings):
    first, last = month_bounds(run.year, run.month)
    contract = _active_contract(employee, first, last)
    if contract is None:
        return None, None
    segments = _segments(contract)
    if not segments:
        return None, contract

    employed_from = contract.start_date if contract.start_date > first else None
    end = contract.effective_end
    employed_to = end if end and end < last else None

    events = _events(employee, first, last)
    vsd_ytd, gpm_ytd, limits = _ytd(employee, run.year, run.month)
    if getattr(employee, "vsd_cap_year", None) == run.year:      # Sodra (S47): lubos pasiektos (su kitais darbdaviais)
        vsd_ytd = max(vsd_ytd, get_params(first).vsd_cap_amount)
    extra, deductions, advance = _manual_lines(run, employee)
    extra = extra + recurring_lines(employee, contract, first, last, extra)
    garnishments = garnishment_inputs(employee, first, last, run)
    tenure_years = (first - contract.start_date).days / 365.25

    inp = EmployeeMonthInput(
        year=run.year, month=run.month, segments=segments, events=events,
        overrides=_overrides(employee, run.year, run.month),
        employed_from=employed_from, employed_to=employed_to,
        vdu_months=_vdu_months(employee, first), bonuses=_bonuses(employee, first),
        extra_lines=extra, deductions=deductions, advance_paid=advance, garnishments=garnishments,
        npd_mode=employee.npd_mode, pension_accumulation=employee.pension_accumulation,
        progressive_request=employee.progressive_gpm_request,
        fixed_term=contract.is_fixed_term, na_rate=settings.na_rate,
        pays_gar_ilg=settings.pays_gar_ilg, sick_pay_pct=settings.sick_pay_pct,
        grindys_applies=employee.grindys_exempt_reason is None,
        insured_fraction=_insured_fraction(events, first, last, employed_from, employed_to),
        study_paid=tenure_years > 5,
        vacation_settlement_days=_vacation_settlement(employee, contract, employed_to),
        gpm_taxable_ytd=gpm_ytd, vsd_base_ytd=vsd_ytd, limits_used_ytd=limits,
    )
    if any(sg.summed for sg in segments):
        from .roster.services import apply_roster
        apply_roster(inp, employee, contract, settings)
    # komandiruotės: dienpinigiai (neapmokestinama / apmokestinama dalis) + sumokėtas avansas
    from .trips_services import month_lines
    from .work_calendar import month_norm
    primary = segments[-1]
    monthly_salary = (primary.base_amount if primary.pay_form == "monthly"
                      else primary.base_amount * month_norm(run.year, run.month, primary.week, primary.workload).hours)
    trip_lines, trip_adv = month_lines(employee, run.year, run.month, monthly_salary, get_params(first).mma)
    if trip_lines:
        inp.extra_lines.extend(trip_lines)
        inp.advance_paid += trip_adv
    return inp, contract


# ============================================================
# Run
# ============================================================

def get_or_create_run(company, year, month, kind="regular"):
    run, _ = PayrollRun.objects.get_or_create(company=company, year=year, month=month, kind=kind,
                                              defaults={"status": "draft"})
    return run


def _expense_account(contract, settings):
    t = contract.terms.select_related("position").order_by("-valid_from").first()
    if t and t.position and t.position.expense_account:
        return t.position.expense_account
    return settings.default_expense_account or "6304"


@transaction.atomic
def recalculate_run(run):
    """Vienu metu - tik vienas to paties DU perskaičiavimas (kitaip eilutės dubliuojasi)."""
    from django.db import transaction
    with transaction.atomic():
        PayrollRun.objects.select_for_update().filter(pk=run.pk).first()
        run.refresh_from_db(fields=["status"])
        return _recalculate_run(run)


def _recalculate_run(run):
    if run.status in CLOSED_STATUSES:
        raise ValueError("Patvirtinto DU perskaičiuoti negalima")

    from .readiness import calc_state
    state, who = calc_state(run.company, run.year, run.month)
    if state == "not_approved":                 # be patvirtinto tabelio atlyginimai neskaičiuojami
        run.lines.filter(is_manual=False).delete()
        run.results.all().delete()
        run.warnings = []
        run.status = "draft"
        run.save(update_fields=["warnings", "status", "updated_at"])
        return run
    if state == "changes":
        raise ValueError(f"Tabelyje yra nepatvirtintų pakeitimų ({who}) – patvirtinkite tabelį, tada atlyginimai bus perskaičiuoti")

    first, last = month_bounds(run.year, run.month)
    P = get_params(first)
    settings = _settings(run.company)
    codes = _pay_codes(run.company)

    run.lines.filter(is_manual=False).delete()
    run.results.all().delete()

    run_warnings = []
    if P.has_preliminary:
        run_warnings.append(f"Laikini parametrai: {', '.join(sorted(P.preliminary_keys))}")

    employees = Employee.objects.filter(company=run.company).filter(
        contracts__start_date__lte=last).distinct()

    for emp in employees:
        inp, contract = build_employee_input(run, emp, settings)
        if inp is None:
            continue
        res = calculate_employee_month(P, inp)

        manual = [e for e in inp.extra_lines if getattr(e, "db_id", None)]
        auto_lines = [l for l in res.lines if all(l is not e for e in manual)] + tax_lines(res.taxes)
        new = []
        for l in auto_lines:
            pc = codes.get(l.code)
            if pc is None:
                res.warnings.append(f"DU kodas {l.code} nerastas DB (paleisk payroll_seed)")
                continue
            new.append(PayrollLine(run=run, employee=emp, contract=contract, pay_code=pc,
                                   quantity=l.quantity, rate=l.rate, amount=l.amount,
                                   sodra_amount=l.sodra_part, accrual_month=first, comment=l.note,
                                   garnishment_id=getattr(l, "garnishment_id", None)))
        PayrollLine.objects.bulk_create(new)
        for e in manual:  # rankinėms eilutėms - Sodra apmokestinama dalis (SDUP)
            PayrollLine.objects.filter(id=getattr(e, "db_id", None)).update(sodra_amount=e.sodra_part)

        t = res.taxes
        ts = res.timesheet
        PayrollEmployeeResult.objects.create(
            run=run, employee=emp,
            gross=t.gross, sodra_base=res.tax_input.sodra_base,
            npd_applied=t.npd_total, npd_sick_part=t.npd_sick,
            gpm=t.gpm, gpm15=t.gpm_sick, vsd=t.vsd, psd=t.psd, kaupimas=t.kaupimas,
            employer_vsd=t.employer_vsd, gar=t.gar, ilg=t.ilg,
            grindys_vsd=t.grindys_vsd, grindys_psd=t.grindys_psd,
            in_kind=res.tax_input.in_kind,
            deductions=sum((d.amount for d in inp.deductions), Decimal("0")),
            advance_paid=inp.advance_paid, net=t.net, payable=res.payable,
            daily_vdu=res.daily_vdu, sam_tax_rate=t.sam_tax_rate, sam_payment=t.sam_payment,
            warnings=res.warnings,
            calc_snapshot={
                "worked_days": ts.worked_days, "worked_hours": str(ts.worked_hours),
                "scheduled_days": ts.scheduled_days, "limits_used": {k: str(v) for k, v in res.limits_used.items()},
                "params_date": str(first), "insured_fraction": str(inp.insured_fraction),
                "vsd_base": str(t.vsd_base), "cap_reached": t.cap_reached,
                "sdup_hours": str(res.sdup_hours),
                "income_exempt": str(res.tax_input.income_exempt),
                "segments": [{"from": str(l.date_from), "amount": str(l.amount), "hours": str(l.quantity)}
                             for l in res.lines if hasattr(l, "date_from")],
                "expense_account": _expense_account(contract, settings),
            },
        )
        run_warnings.extend(f"{emp.full_name}: {w}" for w in res.warnings)

    try:
        for i in timesheet_issues(run.company, run.year, run.month):
            if i["level"] in ("violation", "error"):
                run_warnings.append(f"{i['employee']}: {i['message']} – darbo laiko pažeidimas (VDI rizika)")
    except Exception:                                     # noqa: BLE001 - patikra neturi trukdyti skaičiuoti
        pass
    run.warnings = run_warnings
    run.status = "draft"
    run.save(update_fields=["warnings", "status", "updated_at"])
    logger.info("DU perskaičiuotas: run=%s, darbuotojų=%s", run.id, run.results.count())
    return run


# ============================================================
# Patvirtinimas + DK
# ============================================================

def employee_journals(run):
    """[(employee_id, darbuotojo DK eilutės)] - sąnaudų sąskaita pagal darbuotoją."""
    out = []
    for res in run.results.select_related("employee"):
        lines = [Line(l.pay_code.code, l.amount)
                 for l in run.lines.filter(employee=res.employee).select_related("pay_code")]
        expense = (res.calc_snapshot or {}).get("expense_account", "6304")
        out.append((res.employee_id, build_journal(lines, expense)))
    return out


def run_journal(run):
    """Visų darbuotojų DK eilutės: 4480 / 4484 - kiekvienam darbuotojui atskirai, kitos - suvestinės."""
    journal = merge_journals_by_employee(employee_journals(run))
    if not is_balanced(journal):
        raise ValueError("DU DK įrašas nesubalansuotas")
    return journal


@transaction.atomic
def timesheet_status(company, year, month):
    from docscanner_app.models import TimesheetMonth
    tm = TimesheetMonth.objects.filter(company=company, year=year, month=month).first()
    return tm.status if tm else "draft"


def approve_run(run, user, advance_decisions=None):
    if run.status in CLOSED_STATUSES:
        return run
    if not run.results.exists():
        raise ValueError("Nėra ką tvirtinti - šį mėnesį nėra apskaičiuotų atlyginimų")
    if getattr(run, "kind", "regular") in ("regular", "monthly"):
        from .readiness import readiness
        r = readiness(run.company, run.year, run.month)
        if not r["can_approve"]:
            raise ValueError(f"{r['blockers'][0] if r['blockers'] else 'Tabelis nepatvirtintas'} (Grafikai ir tabeliai → Tabelis)")
    pending = unpaid_advances(run)
    if pending:
        if not advance_decisions or any(str(x["id"]) not in {str(k) for k in advance_decisions} for x in pending):
            raise AdvanceDecisionRequired(pending)
        run._approve_warnings = apply_advance_decisions(run, user, advance_decisions)
        recalculate_run(run)          # išmokėtina suma pasikeitė
        run.refresh_from_db()
    journal = run_journal(run)
    je = write_journal_entry(run, journal, user)
    run.journal_entry = je
    run.status = "approved"
    run.approved_by = user
    run.approved_at = timezone.now()
    run.save(update_fields=["journal_entry", "status", "approved_by", "approved_at", "updated_at"])
    from .payments import create_obligations_for_run
    create_obligations_for_run(run)
    from .roster.services import close_period_vacation
    close_period_vacation(run)
    logger.info("DU patvirtintas: run=%s, JE #%s", run.id, je.id)
    if run.kind == "regular":
        from .savitarna_emails import notify_payslip
        for res in run.results.select_related("employee__account"):
            e = res.employee
            if e.email and e.account_id and e.account.last_login:
                transaction.on_commit(lambda e=e: notify_payslip(e, run.year, run.month))
    return run


@transaction.atomic
def reopen_run(run):
    """Atšaukti patvirtinimą: ištrinamas DK įrašas, statusas -> draft."""
    if run.status in ("paid", "closed"):
        raise ValueError("Išmokėto / uždaryto DU atidaryti negalima")
    from .payments import delete_obligations_for_run
    delete_obligations_for_run(run)
    from .roster.services import undo_period_vacation
    undo_period_vacation(run)
    je_id = run.journal_entry_id
    run.journal_entry = None
    run.status = "draft"
    run.approved_by = None
    run.approved_at = None
    run.save(update_fields=["journal_entry", "status", "approved_by", "approved_at", "updated_at"])
    # DU atidarytas taisymui -> atidaromas ir tabelis (po pataisymų tvirtinamas iš naujo)
    from docscanner_app.models import TimesheetMonth
    TimesheetMonth.objects.filter(company=run.company, year=run.year, month=run.month,
                                  status__in=("approved", "locked")).update(status="draft", approved_at=None)
    if je_id:
        from docscanner_app.models import JournalEntry
        JournalEntry.objects.filter(id=je_id).delete()
        logger.info("DU atidarytas: run=%s, ištrintas JE #%s", run.id, je_id)
    return run


ACCOUNT_NAMES = {
    "6003": "Tiesioginės gamybos išlaidos",
    "6203": "Darbuotojų darbo užmokestis ir su juo susijusios sąnaudos",
    "6304": "Darbuotojų darbo užmokestis ir su juo susijusios sąnaudos",
    "6312": "Kitos bendrosios ir administracinės sąnaudos",
    "4480": "Mokėtinas darbo užmokestis",
    "4481": "Mokėtinas gyventojų pajamų mokestis",
    "4482": "Mokėtinos socialinio draudimo įmokos",
    "4484": "Kitos išmokos darbuotojams",
    "4486": "Mokėtinos privalomojo sveikatos draudimo įmokos",
    "4494": "Kitos mokėtinos sumos",
    "24460": "Kitų gautinų skolų vertė",
}


def write_journal_entry(run, journal, user):
    """PayrollRun -> JournalEntry + JournalEntryLine (vienas suvestinis įrašas už mėnesį)."""
    from docscanner_app.models import JournalEntry, JournalEntryLine
    from docscanner_app.utils.journal_generators import finalize_journal_entry

    first, last = month_bounds(run.year, run.month)
    number = f"DU {run.year}-{run.month:02d}"
    desc = f"Darbo užmokestis {run.year}-{run.month:02d}"

    je = JournalEntry.objects.create(
        user=user,
        company_profile=run.company,
        source_type=JournalEntry.SOURCE_PAYROLL,
        entry_date=last,
        period=first,
        document_number=number,
        description=desc,
        currency="EUR",
        status=JournalEntry.STATUS_POSTED,
    )
    lines = []
    for i, jl in enumerate(sorted(journal, key=lambda x: (x.credit > 0, x.account, x.employee_id or 0))):
        side = "D" if jl.debit > 0 else "K"
        lines.append(JournalEntryLine(
            entry=je, side=side,
            account_code=jl.account,
            account_name=ACCOUNT_NAMES.get(jl.account, ""),
            amount=jl.debit if side == "D" else jl.credit,
            description=desc,
            sort_order=i,
            employee_id=jl.employee_id,
        ))
    JournalEntryLine.objects.bulk_create(lines)
    finalize_journal_entry(je)
    return je


def timesheet_for(company, year, month, with_meta=False):
    """
    Sugeneruotas tabelis visiems darbuotojams (su įvykiais ir rankiniais pakeitimais).
    Suminė apskaita - tik iš PASKELBTO grafiko (juodraštis į tabelį nepatenka).
    with_meta=True -> {"rows": [...], "meta": {...}} (tabelio puslapiui).
    """
    from docscanner_app.models import Roster, TimesheetMonth
    from .roster.planning import norm_color as _norm_color
    first, last = month_bounds(year, month)
    out = []
    from docscanner_app.models import ShiftType
    published = Roster.objects.filter(company=company, year=year, month=month, version__gte=1).first()
    codes = dict(ShiftType.objects.filter(company=company).values_list("id", "code"))
    employees = Employee.objects.filter(company=company, contracts__start_date__lte=last).distinct()
    for emp in employees:
        contract = _active_contract(emp, first, last)
        if contract is None:
            continue
        segments = _segments(contract)
        if not segments:
            continue
        primary = segments[-1]
        end = contract.effective_end
        daily_schedule = daily_extra = None
        planned = {}
        if primary.summed:            # ROS-05: tas pats šaltinis kaip DU skaičiavime - paskelbtas grafikas
            from .roster.bridge import daily_extra as _dx, daily_hours as _dh
            from .roster.services import published_shifts
            shifts = published_shifts(emp, first, last)
            daily_schedule, daily_extra = _dh(shifts), _dx(shifts)
            for sh in shifts:
                planned[sh.day.isoformat()] = {"code": codes.get(sh.shift_type_id, ""), "shift_type_id": sh.shift_type_id,
                                               "hours": str(sh.hours),
                                               "time": f"{sh.start:%H:%M}–{sh.end:%H:%M}",
                                               "start": f"{sh.start:%H:%M}", "end": f"{sh.end:%H:%M}",
                                               "break": sh.break_minutes or 0,
                                               "break_start": f"{sh.break_start:%H:%M}" if getattr(sh, "break_start", None) else None}
        overrides = _overrides(emp, year, month)
        manual_dates = _manual_dates(emp, year, month)
        actual = {e.date.isoformat(): e.detail for e in TimesheetEntry.objects.filter(
            employee=emp, timesheet__year=year, timesheet__month=month, hour_type="normal", is_manual=True)
            if getattr(e, "detail", None)}
        ts = generate(
            year, month, week=primary.week, workload=primary.workload,
            employed_from=contract.start_date if contract.start_date > first else None,
            employed_to=end if end and end < last else None,
            events=_events(emp, first, last), overrides=overrides,
            daily_schedule=daily_schedule, daily_extra=daily_extra,
        )
        terms = _latest_terms(contract, last)
        period = None
        if primary.summed and with_meta:              # apskaitinis laikotarpis: norma ir kiek jau dirbta iki šio mėnesio
            try:
                from .roster.services import employee_target_info
                info = employee_target_info(emp, contract, terms, year, month, _settings(company))
                period = {k: (str(v) if isinstance(v, Decimal) else v) for k, v in info.items()}
                if period.get("period_to") == f"{year}-{month:02d}":          # paskutinis mėnuo - kelionių valandos
                    from .roster.services import trip_comp_hours, trip_choice
                    y1, m1 = map(int, period["period_from"].split("-"))
                    period["trip_hours"] = str(trip_comp_hours(emp, date(y1, m1, 1), last))
                    period["trip_choice"] = trip_choice(emp, year, month)
            except Exception:                            # noqa: BLE001 - laikotarpio informacija nebūtina tabeliui
                logger.exception("timesheet period info failed for employee %s", emp.id)
        totals = {}
        norm, absent = Decimal("0"), {}
        from .timesheet import WORKED_EVENTS as _WE
        for d in ts.days:
            for k, v in d.extra.items():
                totals[k] = totals.get(k, Decimal("0")) + Decimal(str(v))
            if d.event and d.event.kind not in _WE:
                absent[d.event.kind] = absent.get(d.event.kind, 0) + 1
            else:
                norm += Decimal(str(d.norm_hours or 0))
        out.append({
            "employee": emp.id,
            "employee_name": emp.full_name,
            "position": terms.position.name if terms and terms.position_id else "",
            "summed": bool(primary.summed),
            "needs_roster": bool(primary.summed and published is None),
            "pay_form": primary.pay_form,
            "worked_days": ts.worked_days,
            "worked_hours": str(ts.worked_hours),
            "totals": {k: str(v) for k, v in totals.items()},
            "norm_hours": str(norm),                 # mėnesio norma be nebuvimų (kalendorinė)
            "absence_days": absent,                  # {rūšis: kalendorinių dienų skaičius}
            "period": period,                        # suminei: {period_from, period_to, period_norm, worked_before, ...}
            "days": [{
                "date": d.date.isoformat(),
                "code": d.code,
                "hours": str(d.hours),
                "scheduled_hours": str(d.scheduled_hours),
                "event_kind": d.event.kind if d.event else None,
                "event_id": d.event.ref if d.event else None,
                "extra": {k: str(v) for k, v in d.extra.items()},
                "manual": d.date in manual_dates,
                "planned": planned.get(d.date.isoformat()),
                "actual": actual.get(d.date.isoformat()),
            } for d in ts.days],
        })
    if not with_meta:
        return out
    tm = TimesheetMonth.objects.filter(company=company, year=year, month=month).first()
    return {"rows": out, "meta": {
        "status": tm.status if tm else "draft",
        "approved_at": tm.approved_at.isoformat() if tm and tm.approved_at else None,
        "roster_version": published.version if published else 0,
        "roster_editing": bool(published and published.status != "published"),
        "payroll_closed": PayrollRun.objects.filter(company=company, year=year, month=month,
                                                    status__in=CLOSED_STATUSES).exists(),
        "today": timezone.localdate().isoformat(),
        "days": _roster_days_info(first, last),
        "issues": timesheet_issues(company, year, month, out),
        "approval_note": getattr(tm, "approval_note", "") if tm else "",
        # pamainų spalvos - kaip grafike (aktyvios ta pačia tvarka, neaktyvios gale)
        "shift_types": [{"id": t.id, "code": t.code, "color": _norm_color(t.color), "active": t.is_active}
                        for t in sorted(ShiftType.objects.filter(company=company), key=lambda t: not t.is_active)],
    }}


def timesheet_issues(company, year, month, rows=None):
    """Tabelio (fakto) patikros pagal DK: [Issue.as_dict()]"""
    from django.db.models import Sum
    from .compliance import OT_YEAR_DEFAULT, EmpFacts, check_facts
    from .personal_code import parse as parse_code
    from .run import HOUR_TYPE_CODES
    first, last = month_bounds(year, month)
    rows = rows if rows is not None else timesheet_for(company, year, month)
    st = _settings(company)
    limit = Decimal(str(getattr(st, "overtime_year_limit", None) or OT_YEAR_DEFAULT))
    ot_codes = [HOUR_TYPE_CODES[k] for k in ("overtime", "ot_night", "ot_rest", "ot_holiday") if k in HOUR_TYPE_CODES] + ["SAV"]
    out = []
    for r in rows:
        emp = Employee.objects.filter(id=r["employee"]).first()
        if emp is None:
            continue
        bd = emp.birth_date
        if not bd and emp.personal_code:
            info = parse_code(emp.personal_code)
            bd = info.birth_date if info.valid else None
        before = (PayrollLine.objects.filter(employee=emp, run__company=company, run__year=year, run__month__lt=month,
                                             run__status__in=CLOSED_STATUSES, pay_code__code__in=ot_codes)
                  .aggregate(s=Sum("quantity"))["s"] or Decimal("0"))
        days = {}
        for d in r["days"]:
            if d["code"] == "-":
                continue
            days[date.fromisoformat(d["date"])] = {"hours": Decimal(d["hours"]),
                                                   "extra": {k: Decimal(v) for k, v in (d.get("extra") or {}).items()}}
        facts = EmpFacts(emp.id, emp.full_name, days, birth_date=bd, ot_before_year=before, ot_year_limit=limit)
        out += [i.as_dict() for i in check_facts(facts, first, last)]
    return out


def actual_day_context(employee, d):
    """Fakto įvedimui: (planned, rest_day). planned - (pradžia, pabaiga, pertrauka, pertraukos pradžia) arba None."""
    from .work_calendar import is_holiday
    contract = _active_contract(employee, d, d)
    if contract is None:
        raise ValueError("Šią dieną darbuotojas neturi galiojančios sutarties")
    seg = _segments(contract)[-1]
    if seg.summed:
        from .roster.services import published_shifts
        sh = next(iter(published_shifts(employee, d, d)), None)
        if sh is None:
            return None, True                                         # poilsio diena pagal grafiką
        return (f"{sh.start:%H:%M}", f"{sh.end:%H:%M}", sh.break_minutes or 0,
                f"{sh.break_start:%H:%M}" if getattr(sh, "break_start", None) else None), False
    if d.weekday() >= 5 or is_holiday(d):
        return None, True
    return "standard", False


def actual_hours(employee, d, start, end, break_minutes=0, break_start=None):
    """-> išskaidymas pagal faktinį laiką (žr. actual_time.actual_breakdown)."""
    from datetime import datetime as _dt, timedelta as _td
    from .actual_time import actual_breakdown
    planned, rest = actual_day_context(employee, d)
    if planned == "standard":                                         # standartinė: diena pagal etatą nuo pradžios
        seg = _segments(_active_contract(employee, d, d))[-1]
        h = Decimal("8") * Decimal(str(seg.workload or 1))
        st = _dt.combine(d, _dt.strptime(str(start)[:5], "%H:%M").time())
        en = st + _td(hours=float(h), minutes=int(break_minutes or 0))
        planned = (f"{st:%H:%M}", f"{en:%H:%M}", int(break_minutes or 0), break_start)
    r = actual_breakdown(d, start, end, break_minutes, break_start, planned, rest)
    return r, rest


def _roster_days_info(first, last):
    from .roster.services import _days_info
    return _days_info(first, last)


class TimesheetIssuesError(ValueError):
    def __init__(self, issues, need_note):
        super().__init__("Tabelyje yra darbo laiko pažeidimų")
        self.issues, self.need_note = issues, need_note


def timesheet_set_status(company, year, month, approve, note=""):
    from docscanner_app.models import TimesheetMonth
    tm, _ = TimesheetMonth.objects.get_or_create(company=company, year=year, month=month)
    issues = []
    rows = None
    if approve:
        from .readiness import check_month_can_close, check_roster_for_timesheet
        check_month_can_close(year, month)                         # mėnuo dar nesibaigęs - netvirtinama
        rows = timesheet_for(company, year, month)
        check_roster_for_timesheet(company, year, month, rows)      # suminė apskaita - be paskelbto grafiko netvirtinama
        issues = timesheet_issues(company, year, month, rows)
        errors = [i for i in issues if i["level"] == "error"]
        violations = [i for i in issues if i["level"] == "violation"]
        if errors:
            raise TimesheetIssuesError(errors, False)                 # duomenų klaidos - pirmiausia pataisyti
        if violations and not (note or "").strip():
            raise TimesheetIssuesError(violations, True)             # DK pažeidimai - tik su paaiškinimu
    if not approve and PayrollRun.objects.filter(company=company, year=year, month=month,
                                                 status__in=CLOSED_STATUSES).exists():
        raise ValueError("Šio mėnesio DU jau patvirtintas – pirmiausia atidarykite DU taisymui")
    tm.status = "approved" if approve else "draft"
    tm.approved_at = timezone.now() if approve else None
    tm.approval_note = (note or "").strip()[:500] if approve else ""
    tm.approval_issues = [i for i in issues if i["level"] == "violation"] if approve else []
    fields = ["status", "approved_at", "approval_note", "approval_issues"]
    if approve:                       # patvirtinto tabelio kopija - vėliau rodoma, kas pasikeitė
        from .readiness import take_snapshot
        take_snapshot(tm, rows)
        fields += ["approved_snapshot", "approved_version"]
    tm.save(update_fields=fields)
    if approve:                       # patvirtinus tabelį - DU juodraštis perskaičiuojamas pagal galutinį tabelį
        for run in PayrollRun.objects.filter(company=company, year=year, month=month, status="draft"):
            try:
                recalculate_run(run)
            except Exception:         # noqa: BLE001 - perskaičiavimo klaida neturi trukdyti tvirtinti tabelio
                pass
    return tm


# ============================================================
# SDUP
# ============================================================

def _latest_terms(contract, on_date):
    return (contract.terms.select_related("position__group", "schedule")
            .filter(valid_from__lte=on_date).order_by("-valid_from").first()
            or contract.terms.select_related("position__group", "schedule").order_by("valid_from").first())


def sdup_for_run(run):
    """(SDUP dict, klaidų sąrašas) patvirtintam arba juodraštiniam mėnesiui."""
    auto_create_groups(run.company)          # pareigos be grupės (pvz. naujas darbuotojas) - priskiriamos automatiškai
    settings = _settings(run.company)
    first, last = month_bounds(run.year, run.month)
    rows = []
    for res in run.results.select_related("employee"):
        emp = res.employee
        lines = list(run.lines.filter(employee=emp).select_related("pay_code", "contract"))
        contract = next((l.contract for l in lines if l.contract_id), None) or _active_contract(emp, first, last)
        terms = _latest_terms(contract, last) if contract else None
        week = terms_week(terms)
        weekly = sum(week, Decimal("0")) * (terms.workload if terms else Decimal("1"))
        group = terms.position.group.code if terms and terms.position and terms.position.group else ""
        brutto = sum((l.sodra_amount or Decimal("0") for l in lines if l.pay_code.sdup_total), Decimal("0"))
        extra = sum((l.sodra_amount or Decimal("0") for l in lines if l.pay_code.sdup_extra), Decimal("0"))
        snap = res.calc_snapshot or {}
        hours = Decimal(str(snap.get("sdup_hours", "0")))
        salaries = None
        if contract and len(snap.get("segments", [])) > 1:
            segs, weekly_by = [], {}
            for sg in snap["segments"]:
                t = _latest_terms(contract, date.fromisoformat(sg["from"]))
                gc = t.position.group.code if t and t.position and t.position.group else ""
                wk = terms_week(t)
                weekly_by[gc] = sum(wk, Decimal("0")) * t.workload if t else Decimal("40")
                segs.append((gc, Decimal(sg["amount"]), Decimal(sg["hours"])))
            salaries = split_by_groups(segs, group, brutto, extra, hours, weekly_by,
                                       contract.work_time_mode)
        rows.append(SdupRow(
            first_name=emp.first_name, last_name=emp.last_name,
            person_code="" if emp.is_foreigner else emp.personal_code,
            ssn=sdup_ssn(emp.sd_series, emp.sd_number) if emp.is_foreigner else "",
            iltu=emp.foreign_code if emp.is_foreigner else "",
            birth_date=emp.birth_date.isoformat() if emp.birth_date else "",
            gender=emp.gender, group_code=group, weekly_hours=weekly,
            work_time_mode=contract.work_time_mode if contract else "01",
            brutto=brutto, extra=extra, paid_hours=hours, salaries=salaries,
        ))
    return build_sdup(settings.sodra_insurer_code, run.year, run.month, rows)


# ============================================================
# Pareigybių grupės ir DAS
# ============================================================

def _full_time_salaries(position):
    """Darbuotojų, einančių šias pareigas, algos, perskaičiuotos visam etatui."""
    out = []
    terms = (ContractTerms.objects.filter(position=position, contract__status="active")
             .select_related("contract__employee", "schedule"))
    for t in terms:
        latest = t.contract.terms.order_by("-valid_from").first()
        if not (latest and latest.id == t.id and t.workload):
            continue
        if t.pay_form == "hourly":
            # valandinis -> mėnesio atitikmuo VISAM etatui: įkainis x pilna norma (40 val.) x 52 / 12
            # (ne darbuotojo grafiko valandos - antraip ne visu etatu dirbančiam alga sumažėtų)
            full = t.full_time_hours or Decimal("40")
            out.append((t.contract.employee, (t.base_amount * full * 52 / 12).quantize(Decimal("0.01"))))
        else:
            out.append((t.contract.employee, t.base_amount / t.workload))
    return out


def _range_from_salaries(salaries, mma=None):
    """Grupės ribos iš esamų algų; jei visos vienodos - ±10 %, suapvalinta iki 50 EUR, ne mažiau MMA."""
    if not salaries:
        return None, None
    lo, hi = min(salaries), max(salaries)
    if lo == hi:
        lo = (lo * Decimal("0.9") / 50).to_integral_value(rounding="ROUND_FLOOR") * 50
        hi = (hi * Decimal("1.1") / 50).to_integral_value(rounding="ROUND_CEILING") * 50
    if mma and lo < mma:
        lo = mma
    return lo.quantize(Decimal("1")), max(hi, lo).quantize(Decimal("1"))


def ensure_mma_minimums(company, on_date=None):
    """Pakilus MMA: grupių minimumas (ir maksimumas) pakeliamas iki MMA. Grąžina pakeitimus."""
    P = get_params(on_date or date.today())
    changes = []
    for g in PositionGroup.objects.filter(company=company, salary_min__lt=P.mma):
        old = g.salary_min
        g.salary_min = P.mma
        if g.salary_max is not None and g.salary_max < P.mma:
            g.salary_max = P.mma
        g.save(update_fields=["salary_min", "salary_max"])
        changes.append({"type": "mma_updated", "group": g.code, "old": str(old), "new": str(P.mma)})
    return changes


def _groups_snapshot(company):
    return sorted(
        [{"code": g.code, "name": g.name, "positions": sorted(p.name for p in g.positions.all()),
          "min": str(g.salary_min or ""), "max": str(g.salary_max or ""),
          "scores": [g.skills, g.qualification, g.effort, g.responsibility, g.conditions],
          "description": g.description}
         for g in PositionGroup.objects.filter(company=company).prefetch_related("positions")],
        key=lambda x: x["code"])


def das_outdated(company):
    """Ar grupės pasikeitė po paskutinės patvirtintos DAS versijos."""
    last = DasDocument.objects.filter(company=company).order_by("-version").first()
    if last is None:
        return False
    cur = _groups_snapshot(company)
    if last.groups_snapshot and "scores" not in last.groups_snapshot[0]:
        # senesnė DAS versija (be vertinimų) - lyginam tik tai, kas buvo išsaugota
        cur = [{k: g[k] for k in ("code", "name", "positions", "min", "max")} for g in cur]
    old = sorted([{**g, "positions": sorted(g.get("positions", []))} for g in last.groups_snapshot],
                 key=lambda x: x["code"])
    return old != cur


# Pradinis vertinimas: pagal 4 lygio LPK grupę (data/lpk_scores.json),
# jei nėra - pagal pagrindinę grupę (pirmas kodo skaitmuo, ISCO-08 kvalifikacijos lygis).
SUGGESTED_SCORES = {
    "1": (4, 4, 3, 5, 2), "2": (4, 5, 3, 4, 2), "3": (3, 3, 3, 3, 2), "4": (2, 2, 2, 2, 1),
    "5": (2, 2, 3, 2, 3), "6": (2, 2, 4, 2, 4), "7": (3, 2, 4, 2, 4), "8": (2, 2, 4, 3, 4),
    "9": (1, 1, 4, 1, 4), "0": (3, 3, 4, 4, 5),
}
SCORE_KEYS = ("skills", "qualification", "effort", "responsibility", "conditions")


def suggested_scores(lpk_code):
    """(vertinimas, paaiškinimas) pareigybių grupei pagal LPK kodą (lygiaverčių profesijų klasteris)."""
    from .lpk import all_scores, cluster_for, scores_of
    c = cluster_for(lpk_code)
    if c:
        return scores_of(c), c.get("note", "")
    s = all_scores().get((lpk_code or "")[:4])
    if s:
        return {k: s[k] for k in SCORE_KEYS}, s.get("note", "")
    values = SUGGESTED_SCORES.get((lpk_code or "")[:1], (3, 3, 3, 3, 3))
    return dict(zip(SCORE_KEYS, values)), ""


def next_group_code(company):
    nums = [int(m.group(1)) for c in PositionGroup.objects.filter(company=company).values_list("code", flat=True)
            if (m := re.match(r"^G(\d+)$", c))]
    return f"G{(max(nums) if nums else 0) + 1:03d}"


@transaction.atomic
def auto_create_groups(company):
    """
    Pareigos su tuo pačiu LPK kodu -> viena grupė; be kodo - kiekviena atskirai.
    Jei grupė tokiu pavadinimu jau yra - pareigos priskiriamos jai (dublikatų nekuriama).
    """
    from .lpk import normalize
    from .lpk import all_clusters, cluster_for
    by_name = {normalize(g.name).strip(): g for g in PositionGroup.objects.filter(company=company)}
    by_cluster = {g.cluster_key: g for g in PositionGroup.objects.filter(company=company).exclude(cluster_key="")}
    # rankiniu būdu sukurtos grupės: klasteris pagal jose esančias pareigas
    for g in PositionGroup.objects.filter(company=company).prefetch_related("positions"):
        for p in g.positions.all():
            c = cluster_for(p.lpk_code)
            if c and c.get("exact"):
                by_cluster.setdefault(c["key"], g)
    buckets = {}
    for pos in Position.objects.filter(company=company, group__isnull=True).order_by("name"):
        c = cluster_for(pos.lpk_code)
        # lygiavertės profesijos (agento klasteriai) - į vieną grupę; be kodo - kiekviena atskirai
        buckets.setdefault(c["key"] if c else f"id-{pos.id}", []).append(pos)
    created = 0
    for key, positions in buckets.items():
        g = by_cluster.get(key)
        if g is None:
            if len(positions) == 1:
                name = positions[0].name
            else:
                gcode = key.split("-")[0]
                lpk_name = next((p["group_name"] for p in all_professions_cached() if p["group_code"] == gcode), "")
                homogeneous = all_clusters().get(gcode, {}).get("homogeneous", True)
                name = lpk_name if homogeneous and lpk_name else " / ".join(p.name for p in positions[:2])
            g = by_name.get(normalize(name).strip())
        if g is None:
            scores, note = suggested_scores(positions[0].lpk_code)
            g = PositionGroup.objects.create(
                company=company, code=next_group_code(company), name=name[:150],
                cluster_key="" if key.startswith("id-") else key, auto_range=True,
                description=("Vertinimas pasiūlytas automatiškai pagal profesijų klasifikatorių - patikrinkite. " + note).strip(),
                **scores,
            )
            by_name[normalize(name).strip()] = g
            if g.cluster_key:
                by_cluster[g.cluster_key] = g
            created += 1
        Position.objects.filter(id__in=[p.id for p in positions]).update(group=g)
    refresh_auto_ranges(company)
    return created


def ensure_position_group(terms):
    """
    Naujas darbuotojas / naujos pareigos: jei pareigos dar be grupės - priskiriama lygiaverčių pareigų grupei
    (arba sukuriama nauja), automatinės algų ribos išplečiamos. Taip SDUP visada turi grupės numerį.
    """
    pos = getattr(terms, "position", None)
    company = terms.contract.employee.company
    if pos is not None and pos.group_id is None:
        auto_create_groups(company)
    else:
        refresh_auto_ranges(company)


def all_professions_cached():
    from .lpk import all_professions
    return all_professions()


def refresh_auto_ranges(company):
    """
    Automatinės algų ribos: grupės min-max = faktinės algos visam etatui (aktyvūs darbuotojai).
    Ribos tik plečiasi (išėjus darbuotojui nesusiaurėja). -> pakeistų grupių sąrašas
    """
    changed = []
    mma = get_params(date.today()).mma
    for g in PositionGroup.objects.filter(company=company, auto_range=True).prefetch_related("positions"):
        salaries = [s for pos in g.positions.all() for _, s in _full_time_salaries(pos)]
        if not salaries:
            continue
        # min - žemyn, max - aukštyn iki eurų, kad faktinė alga visada būtų ribose (3 813,33 -> 3 814)
        # minimumas - ne mažesnis už MMA (alga visam etatui žemiau MMA - klaida duomenyse, rodoma įspėjimu)
        lo = max(min(salaries).to_integral_value(rounding="ROUND_FLOOR"), mma)
        hi = max(max(salaries).to_integral_value(rounding="ROUND_CEILING"), lo)
        new_min = max(min(lo, g.salary_min) if g.salary_min is not None else lo, mma)
        new_max = max(hi, g.salary_max) if g.salary_max is not None else hi
        if (new_min, new_max) != (g.salary_min, g.salary_max):
            g.salary_min, g.salary_max = new_min, new_max
            g.save(update_fields=["salary_min", "salary_max"])
            changed.append(g.code)
    return changed


@transaction.atomic
def merge_groups(company, source_id, target_id):
    """Sujungti: visos šaltinio grupės pareigos -> tikslinė grupė, šaltinis ištrinamas. -> įspėjimas arba None"""
    from .lpk import scores_differ
    src = PositionGroup.objects.get(company=company, id=source_id)
    dst = PositionGroup.objects.get(company=company, id=target_id)
    if src.id == dst.id:
        raise ValueError("Pasirinkite kitą grupę")
    keys = ("skills", "qualification", "effort", "responsibility", "conditions")
    warn = None
    if scores_differ({k: getattr(src, k) for k in keys}, {k: getattr(dst, k) for k in keys}):
        warn = (f"Grupių {src.code} ir {dst.code} vertinimai skiriasi - patikrinkite, ar darbas tikrai lygiavertis")
    Position.objects.filter(group=src).update(group=dst)
    if src.salary_min is not None:
        dst.salary_min = min(dst.salary_min, src.salary_min) if dst.salary_min is not None else src.salary_min
    if src.salary_max is not None:
        dst.salary_max = max(dst.salary_max, src.salary_max) if dst.salary_max is not None else src.salary_max
    dst.cluster_key = "" if dst.cluster_key != src.cluster_key else dst.cluster_key
    dst.save()
    src.delete()
    return warn


@transaction.atomic
def split_position(company, position_id):
    """Išskirti pareigas į atskirą grupę su joms siūlomu vertinimu ir ribomis."""
    from .lpk import cluster_for
    pos = Position.objects.get(company=company, id=position_id)
    if pos.group and pos.group.positions.count() <= 1:
        raise ValueError("Šios pareigos jau atskiroje grupėje")
    scores, note = suggested_scores(pos.lpk_code)
    c = cluster_for(pos.lpk_code)
    g = PositionGroup.objects.create(
        company=company, code=next_group_code(company), name=pos.name[:150], auto_range=True,
        cluster_key=c["key"] if c and c.get("exact") else "",
        description=("Vertinimas pasiūlytas automatiškai pagal profesijų klasifikatorių - patikrinkite. " + note).strip(),
        **scores)
    pos.group = g
    pos.save(update_fields=["group"])
    refresh_auto_ranges(company)
    return g


def groups_check(company):
    """Darbuotojai už grupės ribų, pareigybės be grupės, MMA pakeitimai, pasenusi DAS."""
    issues = ensure_mma_minimums(company)
    refresh_auto_ranges(company)
    from .lpk import cluster_for, scores_differ
    keys = ("skills", "qualification", "effort", "responsibility", "conditions")
    for g in PositionGroup.objects.filter(company=company).prefetch_related("positions"):
        gs = {k: getattr(g, k) for k in keys}
        odd = [p.name for p in g.positions.all()
               if (c := cluster_for(p.lpk_code)) and c.get("exact") and scores_differ(c, gs)]
        if odd and g.positions.count() > 1:
            issues.append({"type": "mixed_group", "group": g.code, "positions": odd})
    for pos in Position.objects.filter(company=company).select_related("group"):
        people = _full_time_salaries(pos)
        if pos.group is None:
            if people:
                issues.append({"type": "no_group", "position": pos.name, "employees": len(people)})
            continue
        g = pos.group
        mma = get_params(date.today()).mma
        for emp, sal in people:
            if sal < mma:
                issues.append({"type": "below_mma", "employee": emp.full_name, "position": pos.name, "group": g.code,
                               "salary": str(sal.quantize(Decimal("0.01"))), "mma": str(mma)})
                continue
            if (g.salary_min and sal < g.salary_min) or (g.salary_max and sal > g.salary_max):
                issues.append({"type": "out_of_range", "employee": emp.full_name, "position": pos.name,
                               "group": g.code, "salary": str(sal.quantize(Decimal("0.01"))),
                               "min": str(g.salary_min or ""), "max": str(g.salary_max or "")})
    if das_outdated(company):
        issues.append({"type": "das_outdated"})
    return issues


def das_context(company, approved_date, manager_name=""):
    groups = []
    for g in PositionGroup.objects.filter(company=company).prefetch_related("positions"):
        groups.append(DasGroup(
            code=g.code, name=g.name, positions=[p.name for p in g.positions.all()],
            scores={"skills": g.skills, "qualification": g.qualification, "effort": g.effort,
                    "responsibility": g.responsibility, "conditions": g.conditions},
            salary_min=g.salary_min, salary_max=g.salary_max, description=g.description,
        ))
    name = getattr(company, "name", "") or getattr(company, "company_name", "") or str(company)
    code = getattr(company, "company_code", "") or getattr(company, "code", "") or ""
    return DasContext(name, code, manager_name, approved_date, groups)


@transaction.atomic
def approve_das(company, approved_date, manager_name=""):
    ctx = das_context(company, approved_date, manager_name)
    if not ctx.groups:
        raise ValueError("Pirmiausia sukurkite pareigybių grupes")
    last = DasDocument.objects.filter(company=company).order_by("-version").first()
    return DasDocument.objects.create(
        company=company, version=(last.version + 1) if last else 1, approved_date=approved_date,
        manager_name=manager_name, html=render_das_html(ctx),
        groups_snapshot=_groups_snapshot(company),
    )


# ============================================================
# Darbo sutarties dokumentas
# ============================================================

def _company_attr(company, *names):
    for n in names:
        v = getattr(company, n, None)
        if v:
            return str(v)
    return ""


def contract_doc_data(contract):
    from .contract_doc import ContractDocData
    emp = contract.employee
    company = emp.company
    st = _settings(company)
    terms = _latest_terms(contract, contract.start_date)
    week = terms_week(terms)
    weekly = sum(week, Decimal("0")) * (terms.workload if terms else Decimal("1"))
    ent = leave_entitlement(emp, contract, contract.start_date, week)
    workdays = sum(1 for h in week if h > 0)
    statutory = 24 if workdays >= 6 else 20 if workdays == 5 else 4 * workdays
    if st.advance_enabled:
        pay_terms = (f"Darbo užmokestis mokamas du kartus per mėnesį: avansas – iki einamojo mėnesio "
                     f"{st.advance_day} d., likusi dalis – iki kito mėnesio {st.salary_day} d.")
    else:
        pay_terms = (f"Darbo užmokestis mokamas vieną kartą per mėnesį darbuotojo prašymu, "
                     f"ne vėliau kaip iki kito mėnesio {st.salary_day} d.")
    company_address = _company_attr(company, "address", "company_address", "registered_address")
    return ContractDocData(
        number=contract.number or str(contract.id),
        sign_date=contract.signed_date or date.today(),
        city=st.contract_city,
        employer_name=_company_attr(company, "name", "company_name"),
        employer_code=_company_attr(company, "company_code", "code"),
        employer_address=company_address,
        employer_phone=_company_attr(company, "phone", "company_phone"),
        employer_email=_company_attr(company, "email", "company_email"),
        manager_name=st.manager_name, manager_position=st.manager_position,
        representation_basis=st.representation_basis,
        employee_name=emp.full_name, personal_code="" if emp.is_foreigner else emp.personal_code,
        birth_date=emp.birth_date, employee_address=emp.address,
        employee_phone=emp.phone, employee_email=emp.email,
        workplace=st.workplace_address or company_address,
        position=terms.position.name if terms and terms.position else "",
        pay_form=terms.pay_form if terms else "monthly",
        base_amount=terms.base_amount if terms else Decimal("0"),
        pay_terms=pay_terms,
        contract_type=contract.sodra_contract_type, contract_subtype=contract.sodra_contract_subtype,
        end_date=contract.end_date, weekly_hours=weekly,
        full_time=bool(terms and terms.workload >= 1),
        start_date=contract.start_date, probation_months=contract.probation_months,
        leave_days=ent.total if ent.total != statutory else None,
        extra_terms=contract.extra_terms,
    )


@transaction.atomic
def generate_contract_document(contract, user=None):
    """Sukuria / atnaujina nepasirašytą sutarties dokumentą. Grąžina (dokumentas, trūkstami laukai)."""
    from .contract_doc import missing_fields, render_contract_html
    data = contract_doc_data(contract)
    html = render_contract_html(data)
    doc = (EmployeeDocument.objects.filter(contract=contract, kind="contract",
                                           employee_signed=False, employer_signed=False)
           .filter(Q(file="") | Q(file__isnull=True))
           .order_by("-created_at").first())
    if doc is None:
        doc = EmployeeDocument(employee=contract.employee, contract=contract, kind="contract", created_by=user)
    doc.title = f"Darbo sutartis Nr. {data.number}"
    doc.number = data.number
    doc.html = html
    doc.save()
    return doc, missing_fields(data)


def mark_document_signed(doc):
    """Kai pasirašė abi šalys - sutarties pasirašymo data ir statusas."""
    if doc.kind == "contract" and doc.contract_id and doc.employee_signed and doc.employer_signed:
        c = doc.contract
        changed = []
        if doc.signed_date and c.signed_date != doc.signed_date:
            c.signed_date = doc.signed_date
            changed.append("signed_date")
        if c.status == "draft":
            c.status = "active"
            changed.append("status")
        if changed:
            c.save(update_fields=changed)


# ============================================================
# esavitarna.lt kvietimas
# ============================================================

def savitarna_status(employee):
    acc = employee.account
    if acc is None:
        return "none"
    if acc.password and acc.last_login:
        return "active"
    return "invited"


@transaction.atomic
def invite_employee(employee, user=None):
    """Sukuria (arba susieja) EmployeeAccount, išduoda 7 d. kvietimą, siunčia laišką. Grąžina (nuoroda, išsiųsta)."""
    from docscanner_app.models import EmployeeAccount, EmployeeAccountToken
    from .savitarna_auth import INVITE_DAYS, base_url, new_token, normalize_login
    from .savitarna_emails import send_invite
    login = normalize_login(employee.email or employee.phone)
    if not login:
        raise ValueError("Nurodykite darbuotojo el. paštą")
    acc = employee.account or EmployeeAccount.objects.filter(login=login).first()
    if acc is None:
        acc = EmployeeAccount.objects.create(login=login)
    if employee.account_id != acc.id:
        employee.account = acc
        employee.save(update_fields=["account"])
    EmployeeAccountToken.objects.filter(employee=employee, kind="invite", used_at__isnull=True) \
        .update(used_at=timezone.now())
    raw, h = new_token()
    EmployeeAccountToken.objects.create(account=acc, employee=employee, kind="invite", token_hash=h,
                                        expires_at=timezone.now() + timedelta(days=INVITE_DAYS), created_by=user)
    url = f"{base_url()}/pakvietimas/{raw}"
    sent = send_invite(employee, url) if employee.email else False
    logger.info("esavitarna kvietimas: employee=%s sent=%s", employee.id, sent)
    return url, sent


# ============================================================
# Darbuotojų prašymai
# ============================================================

REQUEST_EVENT_KIND = {"vacation": "vacation", "parent_day": "parent_day", "unpaid": "unpaid",
                      "paternity": "paternity", "childcare": "childcare", "study": "study"}
FAMILY_KINDS = ("paternity", "childcare")


def request_preview(employee, kind, start, end, child_id=None):
    """Patikra prieš pateikiant: darbo dienos, likutis, klaidos (blokuoja) ir įspėjimai (ne)."""
    from .averages import ChildInfo, parent_day_entitlement
    from .requests_logic import (DISMISSAL_NOTICE_DAYS, UNPAID_PSD_WARNING_DAYS, childcare_check, parent_day_quota,
                                 paternity_check)
    from .work_calendar import work_days_between
    errors, warnings, out = [], [], {}
    today = timezone.localdate()
    if kind not in ("vacation", "parent_day", "unpaid", "dismissal", "pay_info", "paternity", "childcare", "study"):
        return {"errors": ["Nežinomas prašymo tipas"]}
    if kind in FAMILY_KINDS:
        child = employee.children.filter(id=child_id).first() if child_id else None
        if child is None:
            return {"errors": ["Pasirinkite vaiką (jei jo nėra sąraše – pridėkite skiltyje „Mano duomenys“)"],
                    "warnings": [], "work_days": "0"}
        if end < start:
            return {"errors": ["Pabaiga negali būti ankstesnė už pradžią"]}
        if kind == "paternity":
            parts = [(ev.start_date, ev.end_date) for ev in AbsenceEvent.objects.filter(
                employee=employee, kind="paternity", status="approved", child=child)]
            parts += [(r.start_date, r.end_date) for r in EmployeeRequest.objects.filter(
                employee=employee, kind="paternity", status="pending", child=child)]
            errors, warnings, info = paternity_check(child.birth_date, start, end, parts)
        else:
            errors, warnings, info = childcare_check(child.birth_date, start, end, today)
        overlap = (AbsenceEvent.objects.filter(employee=employee, status="approved", start_date__lte=end, end_date__gte=start)
                   .exclude(kind="sick").exists()
                   or EmployeeRequest.objects.filter(employee=employee, status="pending", kind__in=REQUEST_EVENT_KIND,
                                                     start_date__lte=end, end_date__gte=start).exists())
        if overlap:
            errors.append("Šioms dienoms jau yra atostogos ar kitas prašymas")
        return {"errors": errors, "warnings": warnings, "work_days": str((end - start).days + 1),
                "calendar_days": True, "info": info}
    if kind == "pay_info":
        if EmployeeRequest.objects.filter(employee=employee, kind="pay_info", status="pending").exists():
            return {"errors": ["Toks prašymas jau pateiktas – laukiama atsakymo"], "warnings": [], "work_days": "0"}
        return {"errors": [], "warnings": [], "work_days": "0"}
    if kind == "dismissal":
        start = end
        if (end - today).days < DISMISSAL_NOTICE_DAYS:
            warnings.append(f"Pagal DK darbuotojas apie išėjimą įspėja prieš {DISMISSAL_NOTICE_DAYS} kalendorinių dienų. "
                            "Ankstesnė data – tik susitarus su darbdaviu.")
        return {"errors": errors, "warnings": warnings, "work_days": "0"}
    if end < start:
        return {"errors": ["Pabaiga negali būti ankstesnė už pradžią"]}
    if start < today:
        errors.append("Negalima teikti prašymo praeities datoms")

    contract = _active_contract(employee, start, end)
    week = _week_on(contract, start) if contract else STANDARD_WEEK
    wd = requested_vacation_days(employee, start, end) if kind == "vacation" else \
        Decimal(work_days_between(start, end, week))
    out["work_days"] = str(wd)
    if wd == 0:
        errors.append("Pasirinktame laikotarpyje nėra darbo dienų")

    overlap = (AbsenceEvent.objects.filter(employee=employee, status="approved", start_date__lte=end, end_date__gte=start)
               .exists() or EmployeeRequest.objects.filter(employee=employee, status="pending", kind__in=REQUEST_EVENT_KIND,
                                                           start_date__lte=end, end_date__gte=start).exists())
    if overlap:
        errors.append("Šioms dienoms jau yra atostogos ar kitas prašymas")

    if kind == "vacation":
        b = vacation_for(employee, start)
        if b:
            pending = sum((r.work_days for r in EmployeeRequest.objects.filter(
                employee=employee, status="pending", kind="vacation")), Decimal("0"))
            balance = b.balance - pending
            out.update(balance=str(balance), remaining=str(balance - wd))
            if balance - wd < 0:
                warnings.append("Prašoma daugiau dienų, nei sukaupta. Darbdavys gali nesutikti.")
    if kind == "unpaid" and (end - start).days + 1 > UNPAID_PSD_WARNING_DAYS:
        warnings.append("Nemokamos atostogos ilgesnės nei mėnuo: šiuo laikotarpiu darbdavys nemoka už jus Sodros "
                        "įmokų – privalomojo sveikatos draudimo (PSD) įmokas teks mokėti patiems, nekaupiamas stažas.")
    if kind == "study":
        warnings.append("Prie prašymo pridėkite mokymo įstaigos pažymą (galite įkelti nuotrauką).")
    if kind == "parent_day":
        ent = parent_day_entitlement([ChildInfo(c.birth_date, c.has_disability) for c in employee.children.all()], start)
        taken = [ev.start_date + timedelta(days=i)
                 for ev in AbsenceEvent.objects.filter(employee=employee, kind="parent_day", status="approved")
                 for i in range((ev.end_date - ev.start_date).days + 1)]
        taken += [r.start_date + timedelta(days=i)
                  for r in EmployeeRequest.objects.filter(employee=employee, kind="parent_day", status="pending")
                  for i in range((r.end_date - r.start_date).days + 1)]
        new = [start + timedelta(days=i) for i in range((end - start).days + 1)
               if (start + timedelta(days=i)).weekday() < 5]
        problem = parent_day_quota(ent, taken, new)
        if problem:
            errors.append(problem)
        # suminė apskaita: jei grafikas paskelbtas - mamadienis tik tą dieną, kai pagal grafiką dirbama
        from .roster.services import is_summed_on, published_shift_dates, roster_published_for
        if is_summed_on(employee, start) and roster_published_for(employee, start):
            shifts = published_shift_dates(employee, start, end)
            off = [d for d in new if d not in shifts]
            if off:
                errors.append("Pagal paskelbtą grafiką " + ", ".join(d.strftime("%m-%d") for d in off) +
                              " nedirbate – mamadienis / tėvadienis suteikiamas tik darbo dieną (pamainai)")
            elif new:
                warnings.append("Patvirtinus prašymą, jūsų pamaina bus pakeista – vadovas paskirs pakaitinį darbuotoją")
    out.update(errors=errors, warnings=warnings)
    return out


def validate_absence(employee, kind, start, end, exclude_id=None):
    """
    Rankiniu būdu (grafike, tabelyje, kortelėje) žymimo nebuvimo patikra -> klaidų sąrašas (blokuoja).
    Sutartis, persidengimai, mamadienių kvota ir „tik darbo dieną / pamainą“.
    """
    from .averages import ChildInfo, parent_day_entitlement
    from .requests_logic import parent_day_quota
    errors = []
    if end < start:
        return ["Pabaiga negali būti ankstesnė už pradžią"]
    if _active_contract(employee, start, end) is None:
        errors.append("Šiomis dienomis darbuotojas neturi galiojančios darbo sutarties")
    others = (AbsenceEvent.objects.filter(employee=employee, status="approved", start_date__lte=end, end_date__gte=start)
              .exclude(id=exclude_id))
    if kind == "sick":
        others = others.exclude(kind__in=("vacation", "vacation_prepaid"))   # liga atostogų metu - atostogos pratęsiamos
    clash = others.first()
    if clash and clash.kind == "business_trip":
        errors.append(f"Darbuotojas komandiruotėje ({clash.start_date:%m-%d}–{clash.end_date:%m-%d}). "
                      "Jei planai pasikeitė, pirmiausia pakeiskite ar atšaukite komandiruotę skiltyje „Komandiruotės“.")
    elif clash:
        errors.append(f"Šioms dienoms jau pažymėta: {clash.get_kind_display().lower()} "
                      f"({clash.start_date:%m-%d}–{clash.end_date:%m-%d})")
    if kind == "parent_day":
        ent = parent_day_entitlement([ChildInfo(c.birth_date, c.has_disability) for c in employee.children.all()], start)
        taken = [ev.start_date + timedelta(days=i)
                 for ev in AbsenceEvent.objects.filter(employee=employee, kind="parent_day", status="approved").exclude(id=exclude_id)
                 for i in range((ev.end_date - ev.start_date).days + 1)]
        taken += [r.start_date + timedelta(days=i)
                  for r in EmployeeRequest.objects.filter(employee=employee, kind="parent_day", status="pending")
                  for i in range((r.end_date - r.start_date).days + 1)]
        days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        from .roster.services import is_summed_on
        if is_summed_on(employee, start):
            from docscanner_app.models import RosterShift
            planned = set(RosterShift.objects.filter(employee=employee, date__gte=start.replace(day=1),
                                                     date__lte=month_bounds(start.year, start.month)[1])
                          .values_list("date", flat=True))
            off = [d for d in days if planned and d not in planned]
            if off:
                errors.append("Pagal grafiką " + ", ".join(d.strftime("%m-%d") for d in off) +
                              " darbuotojas nedirba – mamadienis / tėvadienis suteikiamas tik pamainos dieną")
            new = days
        else:
            from .work_calendar import is_holiday
            new = [d for d in days if d.weekday() < 5 and not is_holiday(d)]
            if not new:
                errors.append("Mamadienis / tėvadienis suteikiamas tik darbo dieną")
        problem = parent_day_quota(ent, taken, new)
        if problem:
            errors.append(problem.replace("Jums ", "Darbuotojui "))
    return errors


def _absence_blocks_shift(ev):
    from .roster.services import WITH_SHIFT_KINDS, WORKED_EVENTS
    return ev.status == "approved" and ev.kind not in WORKED_EVENTS and ev.kind not in WITH_SHIFT_KINDS


def _rosters_between(company, first, last):
    from docscanner_app.models import Roster
    out, d = [], first.replace(day=1)
    while d <= last:
        r = Roster.objects.filter(company=company, year=d.year, month=d.month).first()
        if r is not None:
            out.append(r)
        d = month_bounds(d.year, d.month)[1] + timedelta(days=1)
    return out


def _restore_shifts(ev, items):
    """Grąžinti nebuvimo pašalintas pamainas, jei grafikas dar keičiamas ir langelis tuščias. -> negrąžintos datos."""
    from datetime import datetime as _dt
    from docscanner_app.models import Roster, RosterShift, ShiftType
    skipped = []
    for it in items:
        d = date.fromisoformat(it["date"])
        r = Roster.objects.filter(id=it["roster"]).first()
        st = ShiftType.objects.filter(id=it.get("shift_type_id"), company=ev.employee.company).first()
        if r is None or st is None or r.status == "published":
            skipped.append(d)
            continue
        if r.shifts.filter(employee=ev.employee, date=d).exists():
            continue                                             # langelis jau užimtas (pvz. paskirta kita pamaina)
        if any(_absence_blocks_shift(o) for o in AbsenceEvent.objects.filter(
                employee=ev.employee, start_date__lte=d, end_date__gte=d).exclude(id=ev.id)):
            continue                                             # tą dieną yra kitas nebuvimas
        RosterShift.objects.create(roster=r, employee=ev.employee, date=d, shift_type=st,
                                   start=_dt.fromisoformat(it["start"]), end=_dt.fromisoformat(it["end"]),
                                   break_minutes=it.get("break_minutes") or 0, locked=bool(it.get("locked")),
                                   source=it.get("source") or "manual")
    return skipped


def sync_roster_absence(ev, old_range=None):
    """
    Nebuvimas -> grafikas (nebuvimai, su kuriais dirbti negalima - ne mamadienis, pravaikšta, prastova, komandiruotė):
      * grafikas dar NIEKADA neskelbtas - pamainos tomis dienomis pašalinamos (įsimenamos nebuvime: pašalinus ar
        sutrumpinus nebuvimą - grąžinamos);
      * grafikas bent kartą paskelbtas - pamainos lieka perbrauktos (darbuotojai jau matė grafiką), į poreikį
        neįskaitomos; pašalinus nebuvimą - vėl galioja. Pakaitinį vadovas paskiria pats.
    old_range: (pradžia, pabaiga) prieš redagavimą - kad būtų grąžintos nebeaprėptos dienos.
    -> paskelbtų grafikų datos, kuriose pamaina perbraukta
    """
    blocks = _absence_blocks_shift(ev)
    first = min(ev.start_date, old_range[0]) if old_range else ev.start_date
    last = max(ev.end_date, old_range[1]) if old_range else ev.end_date
    stash = list(ev.removed_shifts or [])
    covered = lambda d: blocks and ev.start_date <= d <= ev.end_date          # noqa: E731
    # 1) nebeaprėptos dienos - grąžinti
    back = [it for it in stash if not covered(date.fromisoformat(it["date"]))]
    if back:
        _restore_shifts(ev, back)
        stash = [it for it in stash if it not in back]
    # 2) naujos dienos - pašalinti (tik niekada neskelbtame grafike)
    conflicts = []
    if blocks:
        for r in _rosters_between(ev.employee.company, first, last):
            qs = r.shifts.filter(employee=ev.employee, date__gte=ev.start_date, date__lte=ev.end_date)
            if r.version == 0 and r.status == "draft":
                for sh in qs:
                    stash.append({"roster": r.id, "date": sh.date.isoformat(), "shift_type_id": sh.shift_type_id,
                                  "start": sh.start.isoformat(), "end": sh.end.isoformat(),
                                  "break_minutes": sh.break_minutes, "locked": sh.locked,
                                  "source": getattr(sh, "source", "manual")})
                qs.delete()
            else:
                conflicts += sorted(qs.values_list("date", flat=True))
    if stash != list(ev.removed_shifts or []):
        ev.removed_shifts = stash
        ev.save(update_fields=["removed_shifts"])
    return conflicts


def release_roster_absence(ev):
    """Nebuvimas ištrinamas -> grąžinti jo pašalintas pamainas. -> datos, kurių grąžinti nepavyko (grafikas paskelbtas)."""
    return _restore_shifts(ev, list(ev.removed_shifts or []))


def parent_day_status(employee, on=None):
    """Savitarnai: kiek mamadienių priklauso, kiek jau panaudota / laukia šį laikotarpį, kada kitas laikotarpis."""
    from .averages import ChildInfo, parent_day_entitlement
    on = on or timezone.localdate()
    days, per = parent_day_entitlement([ChildInfo(c.birth_date, c.has_disability) for c in employee.children.all()], on)
    if not days:
        return {"days": 0, "period_months": 0}
    if per == 1:
        p_start = on.replace(day=1)
        label = "šį mėnesį"
    else:
        p_start = date(on.year, (on.month - 1) // 3 * 3 + 1, 1)
        label = "šį ketvirtį"
    p_end = month_bounds(*(((p_start.year, p_start.month + per - 1) if p_start.month + per - 1 <= 12
                            else (p_start.year + 1, p_start.month + per - 13))))[1]
    taken = []
    for ev in AbsenceEvent.objects.filter(employee=employee, kind="parent_day", status="approved",
                                          start_date__lte=p_end, end_date__gte=p_start):
        taken += [ev.start_date + timedelta(days=i) for i in range((ev.end_date - ev.start_date).days + 1)
                  if p_start <= ev.start_date + timedelta(days=i) <= p_end and (ev.start_date + timedelta(days=i)).weekday() < 5]
    pending = []
    for r in EmployeeRequest.objects.filter(employee=employee, kind="parent_day", status="pending",
                                            start_date__lte=p_end, end_date__gte=p_start):
        pending += [r.start_date + timedelta(days=i) for i in range((r.end_date - r.start_date).days + 1)
                    if p_start <= r.start_date + timedelta(days=i) <= p_end and (r.start_date + timedelta(days=i)).weekday() < 5]
    remaining = max(days - len(taken) - len(pending), 0)
    return {"days": days, "period_months": per, "period_label": label,
            "period_start": p_start.isoformat(), "period_end": p_end.isoformat(),
            "used": [d.isoformat() for d in sorted(taken)], "pending": [d.isoformat() for d in sorted(pending)],
            "remaining": remaining, "next_period_start": (p_end + timedelta(days=1)).isoformat()}


def _company_name(company):
    return _company_attr(company, "name", "company_name") or str(company)


@transaction.atomic
def create_request(employee, kind, start, end, comment="", ip=None, user_agent="", child_id=None, attachment=None):
    from .requests_logic import RequestDocData, render_request_html
    from .savitarna_emails import notify_new_request
    pre = request_preview(employee, kind, start, end, child_id)
    if pre.get("errors"):
        raise ValueError(" ".join(pre["errors"]))
    if kind == "dismissal":
        start = end
    if kind == "pay_info":
        start = end = timezone.localdate()
    contract = _active_contract(employee, start, end) or employee.contracts.order_by("-start_date").first()
    terms = _latest_terms(contract, start) if contract else None
    now = timezone.now()
    child = employee.children.filter(id=child_id).first() if (child_id and kind in FAMILY_KINDS) else None
    req = EmployeeRequest.objects.create(
        employee=employee, kind=kind, start_date=start, end_date=end,
        work_days=Decimal(pre.get("work_days", "0")), comment=(comment or "")[:500],
        submitted_ip=ip, submitted_user_agent=(user_agent or "")[:255], child=child,
    )
    if attachment is not None:
        req.attachment = attachment
        req.save(update_fields=["attachment"])
    req.html = render_request_html(RequestDocData(
        kind, _company_name(employee.company), "Vadovui",
        employee.full_name, terms.position.name if terms and terms.position else "",
        start, end, req.work_days, req.comment, timezone.localtime(now), ip or "",
        child=f"vaikas {child.first_name or ''}, gim. {child.birth_date:%Y-%m-%d}".replace("  ", " ") if child else "",
    ))
    req.save(update_fields=["html"])
    notify_new_request(req)
    return req


@transaction.atomic
def approve_request(req, user, answer=None):
    from .savitarna_emails import send_decision
    if req.status != "pending":
        raise ValueError("Prašymas jau išnagrinėtas")
    warnings = []
    if req.kind == "pay_info":
        req.answer = (answer or pay_info_answer(req.employee)).strip()
        req.save(update_fields=["answer"])
    elif req.kind in REQUEST_EVENT_KIND:
        ev = AbsenceEvent.objects.create(
            employee=req.employee, kind=REQUEST_EVENT_KIND[req.kind], start_date=req.start_date, end_date=req.end_date,
            work_days=req.work_days, source="request", status="approved", comment="Prašymas esavitarna.lt",
            child=getattr(req, "child", None),
            sodra_reason="04" if req.kind == "study" else "",
        )
        if req.kind == "study":
            warnings.append("Mokymosi atostogos pažymėtos kaip neapmokamos – paruoštas 12-SD (kodas 04). "
                            "Jei jas apmokate, nebuvime pašalinkite 12-SD priežastį.")
        req.absence_event = ev
        sync_absence_declarations(ev)
        sync_roster_absence(ev)
        from .roster.services import is_summed_on, published_shift_dates, roster_published_for
        if is_summed_on(req.employee, req.start_date) and roster_published_for(req.employee, req.start_date):
            hit = published_shift_dates(req.employee, req.start_date, req.end_date)
            if hit:
                warnings.append("Darbuotojas tomis dienomis turi pamainas pagal paskelbtą grafiką (" +
                                ", ".join(d.strftime("%m-%d") for d in sorted(hit)) +
                                "). Atrakinkite grafiką ir paskirkite pakaitinį darbuotoją („Siūlyti pakaitinį“).")
    else:  # nutraukimas DK 55
        c = _active_contract(req.employee, req.end_date, req.end_date) or \
            req.employee.contracts.exclude(status="draft").order_by("-start_date").first()
        if c:
            c.termination_date = req.end_date
            c.termination_basis = {"article": "55"}
            c.save(update_fields=["termination_date", "termination_basis"])
        warnings.append("Sutartyje nustatyta pabaigos data. Nepamirškite 2-SD ir galutinio atsiskaitymo.")
    for d in ({req.start_date.replace(day=1), req.end_date.replace(day=1)} if req.kind != "pay_info" else set()):
        if PayrollRun.objects.filter(company=req.employee.company, year=d.year, month=d.month,
                                     status__in=CLOSED_STATUSES).exists():
            warnings.append(f"{d:%Y-%m} atlyginimai jau patvirtinti – atidarykite taisymui ir perskaičiuokite.")
    req.status = "approved"
    req.decided_by = user
    req.decided_at = timezone.now()
    req.save(update_fields=["status", "decided_by", "decided_at", "absence_event"])
    send_decision(req)
    return warnings


@transaction.atomic
def reject_request(req, user, reason=""):
    from .savitarna_emails import send_decision
    if req.status != "pending":
        raise ValueError("Prašymas jau išnagrinėtas")
    req.status = "rejected"
    req.reject_reason = (reason or "")[:500]
    req.decided_by = user
    req.decided_at = timezone.now()
    req.save(update_fields=["status", "reject_reason", "decided_by", "decided_at"])
    send_decision(req)


# ============================================================
# Atsiskaitymo lapeliai
# ============================================================

def payslip_data(run, employee):
    from .requests_logic import PayslipData
    res = run.results.filter(employee=employee).first()
    if res is None:
        return None
    lines = list(run.lines.filter(employee=employee).select_related("pay_code"))
    hour_codes = {"ALG", "VAL", "VRS", "NAK", "POI", "SVN", "VRP", "VRN", "VRF"}
    earnings, deductions = [], []
    for l in lines:
        cat = l.pay_code.category
        if cat in ("earning", "compensation", "in_kind"):
            qty = ""
            if l.quantity:
                qty = f"{l.quantity.normalize():f} {'val.' if l.pay_code.code in hour_codes else 'd.'}"
            earnings.append((l.pay_code.name, qty, l.amount))
        elif cat == "deduction" and l.pay_code.code != "AVN":
            deductions.append((l.pay_code.name, l.amount))
    if res.advance_paid:
        deductions.append(("Avansas", res.advance_paid))
    snap = res.calc_snapshot or {}
    contract = next((l.contract for l in lines if l.contract_id), None)
    terms = _latest_terms(contract, date(run.year, run.month, 1)) if contract else None
    return PayslipData(
        company_name=_company_name(run.company), employee_name=employee.full_name,
        position=terms.position.name if terms and terms.position else "",
        year=run.year, month=run.month, earnings=earnings, deductions=deductions,
        gross=res.gross, net=res.net, payable=res.payable,
        worked_days=int(snap.get("worked_days", 0)), worked_hours=Decimal(str(snap.get("worked_hours", "0"))),
        employer=res.employer_vsd + res.gar + res.ilg + res.grindys_vsd + res.grindys_psd,
    )


def pay_info_answer(employee, months=12):
    """
    Atsakymo projektas į prašymą dėl informacijos apie DU: darbuotojo ir jo pareigybių grupės
    vidutinis valandinis bruto DU pagal lytį per paskutinius 12 mėn. (duomenys - kaip SDUP).
    """
    today = timezone.localdate()
    y, m = today.year, today.month
    for _ in range(months):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    since = (y, m)

    def group_of(emp):
        c = emp.contracts.exclude(status="draft").order_by("-start_date").first()
        t = _latest_terms(c, today) if c else None
        return t.position.group if t and t.position and t.position.group else None

    my_group = group_of(employee)
    runs = (PayrollRun.objects.filter(company=employee.company, kind="regular", status__in=CLOSED_STATUSES)
            .filter(Q(year__gt=since[0]) | Q(year=since[0], month__gte=since[1])))
    totals = {}  # (employee_id) -> [brutto, hours]
    for res in PayrollEmployeeResult.objects.filter(run__in=runs).select_related("employee"):
        brutto = sum((l.sodra_amount or Decimal("0")) for l in res.run.lines.filter(
            employee=res.employee, pay_code__sdup_total=True))
        hours = Decimal(str((res.calc_snapshot or {}).get("sdup_hours", "0")))
        t = totals.setdefault(res.employee_id, [Decimal("0"), Decimal("0"), res.employee])
        t[0] += brutto
        t[1] += hours

    def rate(b, h):
        return (b / h).quantize(Decimal("0.01")) if h else None

    def eur(v):
        return f"{v:.2f}".replace(".", ",") + " Eur" if v is not None else "nėra duomenų"

    mine = totals.get(employee.id)
    lines = [f"Jūsų vidutinis valandinis darbo užmokestis (bruto) per paskutinius {months} mėn.: "
             f"{eur(rate(mine[0], mine[1]) if mine else None)}."]
    if my_group:
        # [bruto, valandos, darbuotojų skaičius]
        by_gender = {"M": [Decimal("0"), Decimal("0"), 0], "F": [Decimal("0"), Decimal("0"), 0]}
        for b, h, emp in totals.values():
            if emp.gender in by_gender and h and group_of(emp) == my_group:
                g = by_gender[emp.gender]
                g[0] += b
                g[1] += h
                g[2] += 1

        def group_avg(key):
            g = by_gender[key]
            me_inside = 1 if (employee.gender == key and mine and mine[1]) else 0
            if g[2] - me_inside < 2:  # kitaip būtų galima nustatyti konkretaus kolegos DU
                return ("informacija neteikiama – grupėje per mažai darbuotojų, "
                        "būtų galima nustatyti konkretaus kolegos atlyginimą")
            return eur(rate(g[0], g[1]))

        lines += [
            f"Jūsų pareigybių grupė: {my_group.code} „{my_group.name}“.",
            f"Vyrų vidutinis valandinis darbo užmokestis šioje grupėje: {group_avg('M')}.",
            f"Moterų vidutinis valandinis darbo užmokestis šioje grupėje: {group_avg('F')}.",
        ]
    else:
        lines.append("Jūsų pareigybė dar nepriskirta pareigybių grupei.")
    lines.append("Skaičiuota iš bruto darbo užmokesčio ir apmokėtų valandų, kaip teikiama „Sodrai“ "
                 "(be ligos išmokų, kompensacijų už nepanaudotas atostogas ir išeitinių išmokų).")
    return "\n".join(lines)


# ============================================================
# Deklaracijos: SAM, GPM313, 1-SD, 2-SD
# ============================================================

def fill_sodra_code(company, st=None):
    """Jei DU nustatymuose nėra draudėjo kodo - paima iš Company (Sodros atviri duomenys)."""
    from docscanner_app.models import Company
    st = st or _settings(company)
    if not st.sodra_insurer_code:
        code = _company_attr(company, "company_code", "code")
        found = (Company.objects.filter(im_kodas=code).exclude(sodra_kodas__isnull=True)
                 .exclude(sodra_kodas="").values_list("sodra_kodas", flat=True).first()) if code else None
        if found:
            st.sodra_insurer_code = found
            st.save(update_fields=["sodra_insurer_code"])
    return st.sodra_insurer_code


def _insurer(company):
    from .declarations.sodra_forms import Insurer
    st = _settings(company)
    fill_sodra_code(company, st)
    return Insurer(
        name=_company_name(company), code=st.sodra_insurer_code,
        company_code=_company_attr(company, "company_code", "code"),
        phone=_company_attr(company, "phone", "company_phone"),
        address=_company_attr(company, "address", "company_address", "registered_address"),
        manager=st.manager_name, preparator=st.preparator_details,
        manager_position=getattr(st, "manager_position", "") or "",
    )


def _person(emp):
    from .declarations.sodra_forms import Person
    return Person(emp.first_name, emp.last_name, person_code="" if emp.is_foreigner else emp.personal_code,
                  sd_series=emp.sd_series, sd_number=emp.sd_number, foreign_code=emp.foreign_code,
                  birth_date=emp.birth_date, is_foreigner=emp.is_foreigner)


def _next_month_15(year, month):
    """Kito mėnesio 15 d.; jei poilsio / šventės diena - kita darbo diena (LEG-03)."""
    d = date(year + (month == 12), month % 12 + 1, 15)
    return d if _is_work_day(d) else next_work_day(d)


def _is_work_day(d):
    from .work_calendar import is_holiday
    return d.weekday() < 5 and not is_holiday(d)


def _closed_run(company, year, month):
    return PayrollRun.objects.filter(company=company, year=year, month=month, kind="regular",
                                     status__in=CLOSED_STATUSES).first()


def _dismissed_in(run):
    first, last = month_bounds(run.year, run.month)
    return set(EmploymentContract.objects.filter(employee__company=run.company, termination_date__gte=first,
                                                 termination_date__lte=last).values_list("employee_id", flat=True))


def prepaid_vacation_sodra(company, year, month):
    """
    Atostoginiai, išmokėti ankstesnėje programoje už dienas po perėjimo: SAM priskiriami pagal kalendorinę
    priklausomybę (Sodros SAM taisyklių 51.4 p.). Suma paskirstoma mėnesiams pagal darbo dienas. -> {employee_id: suma}
    """
    from docscanner_app.models import AbsenceEvent
    from .work_calendar import is_holiday
    first, last = month_bounds(year, month)

    def workdays(a, b):
        n, d = 0, a
        while d <= b:
            n += d.weekday() < 5 and not is_holiday(d)
            d += timedelta(days=1)
        return n

    out = {}
    for ev in AbsenceEvent.objects.filter(employee__company=company, kind="vacation_prepaid", prepaid_amount__gt=0,
                                          start_date__lte=last, end_date__gte=first):
        total = workdays(ev.start_date, ev.end_date)
        part = workdays(max(ev.start_date, first), min(ev.end_date, last))
        if total and part:
            out[ev.employee_id] = out.get(ev.employee_id, Decimal("0")) + \
                (ev.prepaid_amount * part / total).quantize(Decimal("0.01"))
    return out


def build_sam_declaration(company, year, month):
    from .declarations.sodra_forms import SamRow, build_sam
    run = _closed_run(company, year, month)
    if run is None:
        return b"", [f"{year}-{month:02d} atlyginimai dar nepatvirtinti"]
    gone = _dismissed_in(run)
    prepaid = prepaid_vacation_sodra(company, year, month)      # perėjimas: atostoginiai, išmokėti ankstesnėje programoje
    rows = []
    for r in run.results.select_related("employee").order_by("employee__last_name"):
        if r.employee_id in gone:
            continue
        extra = prepaid.get(r.employee_id, Decimal("0"))
        pay = r.sam_payment + (extra * r.sam_tax_rate / Decimal("100")).quantize(Decimal("0.01"))
        rows.append(SamRow(_person(r.employee), r.sodra_base + extra, r.sam_tax_rate, pay))
    # atleistieji šį mėnesį teikiami 2-SD, ne SAM
    return build_sam(_insurer(company), year, month, rows)


def _payment_dates(payment):
    """[(data, suma)] - faktiniai mokėjimai; jei jų nėra - planinė data. Grąžina (sąrašas, planinė?)."""
    allocs = [(a.effective_payment_date, a.amount)
              for a in payment.allocations.filter(status__in=("auto", "confirmed", "manual"))
              if a.effective_payment_date]
    if not allocs:
        return [(payment.due_date, payment.amount)], True
    paid = sum((amt for _, amt in allocs), Decimal("0"))
    if paid < payment.amount - Decimal("0.01"):
        # DEC-01: sumokėta tik dalis - galutinė išmokėjimo data dar nežinoma, likutis - planinė data
        rest_date = max(payment.due_date or allocs[-1][0], max(d for d, _ in allocs))
        return sorted(allocs) + [(rest_date, payment.amount - paid)], True
    return sorted(allocs), False


def _employee_months(company, run, st):
    """Patvirtintas DU -> EmployeeMonth kiekvienam darbuotojui (su faktinėmis išmokėjimo datomis)."""
    from docscanner_app.models import PayrollPayment
    from .gpm313_attribution import EmployeeMonth

    first, last = month_bounds(run.year, run.month)
    ny, nm = (run.year + (run.month == 12), run.month % 12 + 1)
    planned_salary = date(ny, nm, min(st.salary_day or 10, 28))
    terminated = dict(EmploymentContract.objects.filter(
        employee__company=company, termination_date__gte=first, termination_date__lte=last,
    ).values_list("employee_id", "termination_date"))

    out = []
    for res in run.results.select_related("employee"):
        e = res.employee
        exempt = Decimal(str((res.calc_snapshot or {}).get("income_exempt", "0")))
        planned = False

        advances = []
        for p in PayrollPayment.objects.filter(company=company, employee=e, kind="advance", year=run.year,
                                               month=run.month).exclude(status="cancelled"):
            dates, pl = _payment_dates(p)
            advances += dates
            planned = planned or pl

        main = run.payments.filter(employee=e, kind="employee").first()
        if main:
            dates, pl = _payment_dates(main)
            final = dates[-1][0]
            planned = planned or pl
        elif advances:
            final = max(d for d, _ in advances)
        else:   # DU patvirtintas prieš išmokėjimų modulį
            final = terminated.get(e.id) or planned_salary
            planned = True
        out.append(EmployeeMonth(run.year, run.month, e.full_name, res.gross - exempt, res.gpm + res.gpm15,
                                 final, advances, planned, employee_id=e.id))
    return out


def gpm313_totals(company, year, month):
    """
    5-7 laukeliai pagal FAKTINES išmokėjimo datas (banko išrašas / rankinė žyma), jei jų nėra - pagal planines.
    Avansas, kai likutis išmokamas kitą mėnesį per 10 d. d., deklaruojamas jo išmokėjimo mėnesį (GPM 0),
    visas GPM - paskutinės dalies mėnesį.
    """
    from .gpm313_attribution import attribute

    st = _settings(company)
    warnings, planned_names = [], []
    g5 = g6 = g7 = Decimal("0")

    # DEC-02: ne tik 3 paskutinių mėnesių DU, bet ir senesni, kurių išmokos (ar jų dalis) sumokėtos šį mėnesį
    from docscanner_app.models import PaymentAllocation
    first, last = month_bounds(year, month)
    months = []
    for back in (0, 1, 2):
        y, m = year, month - back
        while m < 1:
            y, m = y - 1, m + 12
        months.append((back, y, m))
    older = set(PaymentAllocation.objects.filter(
        kind="payroll", payroll_payment__company=company, payroll_payment__run__isnull=False,
        status__in=("auto", "confirmed", "manual"), payment_date__gte=first, payment_date__lte=last,
    ).values_list("payroll_payment__run__year", "payroll_payment__run__month"))
    for y, m in sorted(older):
        if (y, m) < months[-1][1:]:
            months.append((99, y, m))
    for back, y, m in months:
        run = _closed_run(company, y, m)
        if not run:
            if back == 1:
                warnings.append(f"{y}-{m:02d} atlyginimai nepatvirtinti - jų išmokos neįtrauktos")
            continue
        for em in _employee_months(company, run, st):
            parts, warns = attribute(em)
            hit = False
            for (py, pm), income, gpm, day in parts:
                if (py, pm) != (year, month):
                    continue
                hit = True
                g5 += income
                if day <= 15:
                    g6 += gpm
                else:
                    g7 += gpm
            if hit:
                warnings += warns
                if em.planned:
                    planned_names.append(em.name)

    # perkelta iš ankstesnės programos: DU, priskaičiuotas senoje programoje, bet išmokėtas šį mėnesį
    from docscanner_app.models import PayrollHistoryMonth, PayrollPayment
    for h in PayrollHistoryMonth.objects.filter(company=company, paid_year=year, paid_month=month).select_related("employee"):
        p = PayrollPayment.objects.filter(company=company, run__isnull=True, kind="employee", employee=h.employee,
                                          year=h.year, month=h.month).first()
        day = st.salary_day or 10
        if p is not None:
            dates, planned = _payment_dates(p)
            day = dates[-1][0].day
            if planned:
                planned_names.append(h.employee.full_name)
        g5 += h.income
        if day <= 15:
            g6 += h.gpm
        else:
            g7 += h.gpm

    if planned_names:
        warnings.append("Ne visi mokėjimai pažymėti (banko išrašas neįkeltas) - naudojamos planinės datos: "
                        + ", ".join(sorted(set(planned_names))[:10]))
    return {"g5": g5, "g6": g6, "g7": g7}, warnings


def build_gpm313_declaration(company, year, month, manual=None):
    from .declarations.gpm313 import Gpm313Data, to_ffdata, validate
    sums, warnings = gpm313_totals(company, year, month)
    m = {k: Decimal(str(v or "0")) for k, v in (manual or {}).items() if k in ("g8", "g9", "g10", "g11", "g12")}
    d = Gpm313Data(_company_attr(company, "company_code", "code"), _company_name(company), year, month, **sums, **m)
    return to_ffdata(d), validate(d) + warnings


def _compensated_months(contract):
    basis = (contract.termination_basis or {}).get("article")
    if basis != "57":
        return Decimal("0")
    years = (contract.termination_date - contract.start_date).days / 365.25
    return Decimal("2") if years >= 1 else Decimal("0.5")


def build_1sd_declaration(contract):
    from .declarations.sodra_forms import HireRow, build_1sd
    terms = _latest_terms(contract, contract.start_date)
    row = HireRow(_person(contract.employee), contract.start_date, contract.sodra_contract_type,
                  contract.sodra_contract_subtype, terms.position.lpk_code if terms and terms.position else "")
    return build_1sd(_insurer(contract.employee.company), [row])


def build_2sd_declaration(contract):
    from .declarations.sodra_forms import DismissalRow, build_2sd
    if not contract.termination_date:
        return b"", ["Sutartyje nenurodyta nutraukimo data"]
    basis = contract.termination_basis or {}
    run = _closed_run(contract.employee.company, contract.termination_date.year, contract.termination_date.month)
    res = run.results.filter(employee=contract.employee).first() if run else None
    row = DismissalRow(
        _person(contract.employee), contract.termination_date, str(basis.get("article") or ""),
        str(basis.get("part") or ("-" if basis.get("article") == "53" else "1")), str(basis.get("point") or ""),
        _compensated_months(contract),
        income=res.sodra_base if res else None, rate=res.sam_tax_rate if res else None,
        payment=res.sam_payment if res else None,
    )
    errors = [] if basis.get("article") else ["Nenurodytas nutraukimo pagrindas (DK straipsnis)"]
    content, e2 = build_2sd(_insurer(contract.employee.company), [row])
    return content, errors + e2


# ============================================================
# 9-SD / 12-SD - iš nebuvimų (AbsenceEvent)
# ============================================================

SD12_DEFAULT = {"unpaid": "01", "truancy": "09", "suspension": "08"}
SD9_DEFAULT = {"paternity": "06", "childcare": "02"}
AFTER_END_KINDS = {"truancy", "suspension"}       # sužinoma po fakto - terminas nuo pabaigos


def absence_form(ev):
    """-> (forma, priežasties kodas) arba (None, None)"""
    from .declarations.sodra_forms import REASONS_12SD, REASONS_9SD
    if ev.kind in SD9_DEFAULT:
        code = ev.sodra_reason if ev.sodra_reason in REASONS_9SD else SD9_DEFAULT[ev.kind]
        return "9-SD", code
    if ev.kind in SD12_DEFAULT:
        return "12-SD", ev.sodra_reason if ev.sodra_reason in REASONS_12SD else SD12_DEFAULT[ev.kind]
    if ev.sodra_reason in REASONS_12SD:            # pvz. mokymosi / kūrybinės atostogos be DU, karo tarnyba
        return "12-SD", ev.sodra_reason
    return None, None


def next_work_day(d):
    from .work_calendar import is_holiday
    d += timedelta(days=1)
    while d.weekday() >= 5 or is_holiday(d):
        d += timedelta(days=1)
    return d


def prev_work_day(d):
    from .work_calendar import is_holiday
    d -= timedelta(days=1)
    while d.weekday() >= 5 or is_holiday(d):
        d -= timedelta(days=1)
    return d


def absence_deadline(ev, form, variant=""):
    if variant:
        return next_work_day(timezone.localdate())
    if form == "12-SD":   # nuo nedraudiminio laikotarpio pradžios (pravaikštai / nušalinimui - nuo pabaigos)
        return next_work_day(ev.end_date if ev.kind in AFTER_END_KINDS else ev.start_date)
    created = getattr(ev, "created_at", None)
    base = min(ev.start_date, timezone.localtime(created).date()) if created else ev.start_date
    return next_work_day(base)


# ============================================================
# NP-SD2 - duomenys ligos / nėštumo ir gimdymo išmokai skirti
# ============================================================

from .npsd2_periods import cut_segments, npsd2_deadline  # noqa: E402

NPSD2_KINDS = ("sick", "maternity")


def npsd2_episode(ev):
    """Nepertraukiamas nedarbingumas: pradinis įvykis + tęsiniai (parent_event grandinė). -> (pradinis, [įvykiai])"""
    root = ev
    while root.parent_event_id and root.parent_event and root.parent_event.kind == root.kind:
        root = root.parent_event
    chain, todo = [root], [root]
    while todo:
        cur = todo.pop()
        for c in cur.continuations.filter(status="approved"):
            if c.kind == root.kind and c not in chain:
                chain.append(c)
                todo.append(c)
    return root, sorted(chain, key=lambda e: e.start_date)


def npsd2_segments(root, chain, today=None):
    """
    Pranešimų laikotarpiai (Sodros instrukcijos 57-58 p.): trumpas nedarbingumas - vienas po pabaigos;
    ilgas - tarpiniai už praėjusius ne trumpesnius kaip 14 d. laikotarpius (pjūviai 14 d. ir mėnesio gale).
    Nėštumo ir gimdymo atostogos - vienas pranešimas visam laikotarpiui (per 5 d. d. nuo kreipimosi).
    Tik iki atleidimo dienos (71 p.) ir ne anksčiau nei darbo pradžia. -> [(nuo, iki, terminas)]
    """
    today = today or timezone.localdate()
    start, end = root.start_date, max(e.end_date for e in chain)
    c = _active_contract(root.employee, start, end)
    if c is not None:
        start = max(start, c.start_date)
        if c.effective_end:
            end = min(end, c.effective_end)
    if end < start:
        return []
    if root.kind == "maternity":
        dl = start
        for _ in range(5):
            dl = next_work_day(dl)
        return [(start, end, dl)]
    return [(a, b, npsd2_deadline(b)) for a, b in cut_segments(start, end) if b < today]


def _employer_sick_dates(ev):
    """Pirmosios 2 kalendorinės dienos, sutampančios su darbo grafiku, už kurias moka darbdavys."""
    from .work_calendar import is_holiday
    from .roster.services import daily_hours, published_shifts
    days = [ev.start_date, ev.start_date + timedelta(days=1)]
    shifts = daily_hours(published_shifts(ev.employee, days[0], days[1]))
    if shifts:
        return [d for d in days if shifts.get(d, 0) > 0]
    return [d for d in days if d.weekday() < 5 and not is_holiday(d)]


def build_npsd2_declaration(root, chain, seg_start, seg_end):
    from django.db.models import Sum
    from .declarations.sodra_forms import SickReport, build_npsd2
    first_seg = seg_start <= root.start_date
    r = SickReport(person=_person(root.employee), start=seg_start, end=seg_end, maternity=root.kind == "maternity",
                   doc_number=f"LIG{seg_start:%y%m%d}{root.id}"[-16:])
    warnings = []
    if root.kind == "sick" and first_seg:
        if root.employer_pays_first_days:
            dates = _employer_sick_dates(root)
            paid = (PayrollLine.objects.filter(event=root, pay_code__code="LIG", run__status__in=CLOSED_STATUSES)
                    .aggregate(s=Sum("amount"))["s"])
            if dates and paid:
                r.employer_from, r.employer_to, r.employer_sum = dates[0], dates[-1], paid
                if len(dates) == 1:
                    r.reason = "03"                     # kita iš 2 dienų nesutapo su grafiku (65.2 p.)
            elif not dates:
                r.reason = "03"
            else:
                warnings.append("⚠ Ligos išmoka iš darbdavio lėšų dar neapskaičiuota (patvirtinkite to mėnesio DU)")
        elif root.parent_event_id:
            r.reason = "04"
        else:
            # slauga, sveiko vaiko priežiūra ir kt. - darbdavys nemoka (⚠ LEGAL-CHECK: B8 slaugai)
            r.reason, r.reason_text = "06", (root.comment or "").replace("S15:", "").strip().upper()[:41] or "KITA PRIEŽASTIS"
            slauga = "slaug" in (root.comment or "").lower()
            if slauga:
                vac = AbsenceEvent.objects.filter(employee=root.employee, kind__in=("vacation", "vacation_prepaid"),
                                                  status="approved", start_date__lte=seg_end, end_date__gte=seg_start).first()
                if vac:
                    r.vacation = (max(vac.start_date, seg_start), min(vac.end_date, seg_end))
    content, errors = build_npsd2(_insurer(root.employee.company), r, timezone.localdate())
    return content, errors + warnings


def _npsd2_overview_items(company, first, last):
    """NP-SD2: laikotarpiai, kurių terminas šį mėnesį, ir visi vėluojantys nepateikti."""
    items = []
    since = first - timedelta(days=120)
    evs = (AbsenceEvent.objects.filter(employee__company=company, status="approved", kind__in=NPSD2_KINDS,
                                       end_date__gte=since, start_date__lte=last)
           .select_related("employee", "parent_event"))
    seen = set()
    for ev in evs:
        root, chain = npsd2_episode(ev)
        if root.id in seen:
            continue
        seen.add(root.id)
        decls = {d.variant: d for d in PayrollDeclaration.objects.filter(form="NP-SD2", absence_event=root)}
        what = "nėštumo ir gimdymo atostogos" if root.kind == "maternity" else "nedarbingumas"
        for a, b, dl in npsd2_segments(root, chain):
            v = a.isoformat()
            d = decls.get(v)
            submitted = d is not None and d.status in SUBMITTED
            if not (first <= dl <= last or (dl < first and not submitted)):
                continue
            items.append({"form": "NP-SD2", "authority": "Sodra", "absence_event": root.id, "variant": v,
                          "title": f"NP-SD2: {root.employee.full_name} – {what} {a:%m-%d}–{b:%m-%d}",
                          "deadline": dl, "declaration": _decl_json(d)})
    return items


def build_absence_declaration(ev, variant=""):
    from .declarations.sodra_forms import ChildLeave, SuspendRow, build_12sd, build_9sd
    form, code = absence_form(ev)
    ins = _insurer(ev.employee.company)
    today = timezone.localdate()
    if form == "12-SD":
        content, errors = build_12sd(ins, [SuspendRow(_person(ev.employee), ev.start_date, ev.end_date, code)], today,
                                     f"12SD{today:%y%m%d}-{ev.id}")
    else:
        cancel = None
        if variant:
            base = PayrollDeclaration.objects.filter(absence_event=ev, variant="").first()
            declared_end = (base.meta or {}).get("end") if base else None
            if declared_end and ev.end_date.isoformat() < declared_end:
                cancel = ev.end_date          # grįžo anksčiau - paskutinė atostogų diena
        child = getattr(ev, "child", None)
        content, errors = build_9sd(ins, ChildLeave(_person(ev.employee), ev.start_date, ev.end_date, code,
                                                    child.birth_date if child else None,
                                                    (child.personal_code or "") if child else "", cancel),
                                    today, f"9SD{today:%y%m%d}-{ev.id}")
    return form, content, errors, {"start": ev.start_date.isoformat(), "end": ev.end_date.isoformat(), "reason": code}


SUBMITTED = ("submitted", "accepted")


def sync_absence_declarations(ev):
    """Po nebuvimo sukūrimo / pakeitimo: paruošia 9-SD / 12-SD juodraštį arba patikslinimą."""
    form, _ = absence_form(ev)
    if not form or ev.status != "approved":
        return None
    decls = list(PayrollDeclaration.objects.filter(absence_event=ev).order_by("id"))
    base = next((d for d in decls if not d.variant), None)
    if base is None or base.status not in SUBMITTED:
        return generate_declaration(ev.employee.company, form, absence_event=ev)
    last_sent = [d for d in decls if d.status in SUBMITTED]
    current = {"start": ev.start_date.isoformat(), "end": ev.end_date.isoformat()}
    if last_sent and {k: (last_sent[-1].meta or {}).get(k) for k in current} == current:
        PayrollDeclaration.objects.filter(absence_event=ev, variant__startswith="change").exclude(status__in=SUBMITTED).delete()
        return None
    pending = next((d for d in decls if d.variant and d.status not in SUBMITTED), None)
    variant = pending.variant if pending else f"change-{sum(1 for d in decls if d.variant) + 1}"
    return generate_declaration(ev.employee.company, form, absence_event=ev, variant=variant)


def _generate_declaration(company, form, year=None, month=None, contract=None, manual=None,
                          absence_event=None, variant=""):
    if form in ("SAM", "GPM313") and _before_du_start(company, year, month):
        raise ValueError("Šis mėnuo deklaruotas ankstesnėje programoje (DU DokSkenas pradėtas vėliau)")
    if form == "SAM":
        content, errors = build_sam_declaration(company, year, month)
        deadline, key = _next_month_15(year, month), dict(year=year, month=month, contract=None)
    elif form == "GPM313":
        content, errors = build_gpm313_declaration(company, year, month, manual)
        deadline, key = _next_month_15(year, month), dict(year=year, month=month, contract=None)
    elif form == "GPM312":
        content, errors = build_gpm312_declaration(company, year)
        deadline, key = gpm312_deadline(year), dict(year=year, month=None, contract=None)
    elif form == "SDUP":
        return _generate_sdup(company, year, month)
    elif form == "1-SD":
        content, errors = build_1sd_declaration(contract)
        # LEG-01: prieš 1 darbo dieną; juridinio asmens vienasmeniam valdymo organui - prieš 1 darbo valandą (V-477)
        deadline = contract.start_date if getattr(contract, "is_company_head", False) else prev_work_day(contract.start_date)
        key = dict(year=contract.start_date.year, month=contract.start_date.month, contract=contract)
    elif form == "2-SD":
        content, errors = build_2sd_declaration(contract)
        deadline = next_work_day(contract.termination_date) if contract.termination_date else None   # LEG-01
        d = contract.termination_date or timezone.localdate()
        key = dict(year=d.year, month=d.month, contract=contract)
    elif form == "NP-SD2":
        if absence_event is None or not variant:
            raise ValueError("Nenurodytas nedarbingumo laikotarpis")
        root, chain = npsd2_episode(absence_event)
        seg = next(((a, b, dl) for a, b, dl in npsd2_segments(root, chain) if a.isoformat() == variant), None)
        if seg is None:
            raise ValueError("Šis nedarbingumo laikotarpis dar nesibaigė arba nebeegzistuoja")
        content, errors = build_npsd2_declaration(root, chain, seg[0], seg[1])
        blocking = [e for e in errors if not e.startswith("⚠")]
        obj, _ = PayrollDeclaration.objects.update_or_create(
            company=company, form="NP-SD2", year=seg[0].year, month=seg[0].month, contract=None,
            absence_event=root, variant=variant,
            defaults={"content": content.decode("utf-8") if content else "", "errors": errors,
                      "status": "error" if (blocking or not content) else "ready", "deadline": seg[2]})
        return obj
    elif form in ("9-SD", "12-SD"):
        if absence_event is None:
            raise ValueError("Nenurodytas nebuvimas")
        f2, content, errors, meta = build_absence_declaration(absence_event, variant)
        if f2 != form:
            raise ValueError("Šiam nebuvimui ši forma netaikoma")
        deadline = absence_deadline(absence_event, form, variant)
        key = dict(year=absence_event.start_date.year, month=absence_event.start_date.month, contract=None,
                   absence_event=absence_event, variant=variant)
        obj, _ = PayrollDeclaration.objects.update_or_create(
            company=company, form=form, **key,
            defaults={"content": content.decode("utf-8") if isinstance(content, bytes) else (content or ""),
                      "errors": errors, "meta": meta, "status": "error" if (errors or not content) else "ready",
                      "deadline": deadline})
        return obj
    else:
        raise ValueError("Nežinoma forma")
    blocking = [e for e in errors if not e.startswith("Mokamas avansas") and not e.startswith("⚠")]
    obj, _ = PayrollDeclaration.objects.update_or_create(
        company=company, form=form, **key,
        defaults={"content": content.decode("utf-8") if content else "", "errors": errors,
                  "manual_values": {k: str(v) for k, v in (manual or {}).items()},
                  "status": "error" if (blocking or not content) else "ready", "deadline": deadline},
    )
    return obj


SDUP_FROM = (2027, 1)


def sdup_deadline(year, month):
    """Kito mėnesio paskutinė diena (V-500, 5 p.)."""
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    return month_bounds(ny, nm)[1]


def _generate_sdup(company, year, month):
    """SDUP (JSON) iš patvirtinto mėnesio DU. Jau pateiktas - senoji versija saugoma meta.history."""
    import json
    run = _closed_run(company, year, month)
    if run is None:
        raise ValueError("Pirmiausia patvirtinkite šio mėnesio DU")
    data, errors = sdup_for_run(run)
    content = json.dumps(data, ensure_ascii=False, indent=1)
    blocking = [e for e in errors if not e.startswith("⚠")]
    d = PayrollDeclaration.objects.filter(company=company, form="SDUP", year=year, month=month).first()
    meta = dict(d.meta or {}) if d else {}
    if d and d.status in ("submitted", "accepted") and d.content and d.content != content:
        meta.setdefault("history", []).append({"submitted_at": d.submitted_at.isoformat() if d.submitted_at else None,
                                               "content": d.content})
        meta["correction"] = True
    obj, _ = PayrollDeclaration.objects.update_or_create(
        company=company, form="SDUP", year=year, month=month, contract=None,
        defaults={"content": content, "errors": errors, "meta": meta,
                  "status": "error" if blocking else ("ready" if not d or d.content != content or d.status not in
                                                      ("submitted", "accepted") else d.status),
                  "deadline": sdup_deadline(year, month)})
    return obj


def sdup_overview_item(company, year, month):
    """„Deklaracijos“ eilutė SDUP; jei DU patvirtintas iš naujo po pateikimo - patikslinti per 2 darbo dienas."""
    if (year, month) < SDUP_FROM:
        return None
    d = PayrollDeclaration.objects.filter(company=company, form="SDUP", year=year, month=month).first()
    run = _closed_run(company, year, month)
    item = {"form": "SDUP", "authority": "Sodra", "title": f"SDUP už {year}-{month:02d} (skaidrus DU)",
            "deadline": sdup_deadline(year, month), "declaration": _decl_json(d), "format": "json",
            # DU DokSkenas neskaičiuojamas (ar mėnuo nepatvirtintas) - pildoma rankiniu būdu / iš S50, SAM
            "manual": run is None}
    if d and d.status in ("submitted", "accepted") and run and run.approved_at and d.submitted_at \
            and run.approved_at > d.submitted_at:
        approved = timezone.localtime(run.approved_at).date()
        item.update(correction=True, deadline=next_work_day(next_work_day(approved)),
                    title=item["title"] + " – PATIKSLINTI (DU pakeistas po pateikimo)")
    return item


def generate_declaration(company, form, year=None, month=None, contract=None, manual=None,
                         absence_event=None, variant=""):
    """Netikėta klaida -> būsena „Yra klaidų“ + Telegram pranešimas administratoriui."""
    try:
        return _generate_declaration(company, form, year, month, contract, manual, absence_event, variant)
    except ValueError:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("Deklaracijos %s klaida (company=%s)", form, company.id)
        from .notify import notify_admin
        notify_admin(f"❌ DokSkenas: deklaracijos {form} klaida\nĮmonė: {company} (id {company.id})\n"
                     f"Laikotarpis: {year}-{month}, sutartis: {getattr(contract, 'id', '-')}\n"
                     f"{type(e).__name__}: {e}")
        key = dict(year=year, month=month, contract=None)
        if absence_event is not None:
            key = dict(year=absence_event.start_date.year, month=absence_event.start_date.month, contract=None,
                       absence_event=absence_event, variant=variant)
        elif contract is not None:
            d = contract.start_date if form == "1-SD" else (contract.termination_date or timezone.localdate())
            key = dict(year=d.year, month=d.month, contract=contract)
        obj, _ = PayrollDeclaration.objects.update_or_create(
            company=company, form=form, **key,
            defaults={"status": "error", "content": "", "errors": [
                "Vidinė klaida ruošiant deklaraciją. Administratorius jau informuotas – pabandykite vėliau."]},
        )
        return obj


# ============================================================
# GPM312 - metinė
# ============================================================

GPM312_LIMIT_CODES = {"DOV": "07", "SVD": "73", "GYV": "74"}     # neapmokestinama dalis -> šis kodas, viršijanti -> 01
GPM312_NATURA = {"AUT": "A", "NAT": "N", "DOV": "N", "SVD": "N", "GYV": "N"}
GPM312_ZERO_RATE = {"05", "07", "08", "73", "74"}


def _before_du_start(company, year, month):
    from .readiness import payroll_start
    s = payroll_start(company)
    return bool(s and year and month and (year, month) < (s.year, s.month))


def gpm312_deadline(year):
    d = date(year + 1, 2, 15)
    return d if d.weekday() < 5 else next_work_day(d)


def gpm312_rows(company, year):
    """
    Metų eilutės pagal IŠMOKĖJIMO datas (tas pats priskyrimas kaip GPM313): darbuotojas x kodas x natūra x tarifas.
    -> (eilutės, įspėjimai, mėnesių sumos GPM313 sutikrinimui {mėn: [išmokos, gpm]})
    """
    from collections import defaultdict
    from .declarations.gpm312 import Gpm312Row
    st = _settings(company)
    acc = defaultdict(lambda: {"amount": Decimal("0"), "gpm": Decimal("0")})
    people, used, monthly = {}, defaultdict(lambda: defaultdict(Decimal)), defaultdict(lambda: [Decimal("0"), Decimal("0")])
    warnings, planned, progressive = [], set(), set()
    runs = (PayrollRun.objects.filter(company=company, kind="regular", status__in=CLOSED_STATUSES)
            .filter(Q(year=year) | Q(year=year - 1, month=12)).order_by("year", "month"))
    for run in runs:
        ems = {em.employee_id: em for em in _employee_months(company, run, st)}
        P = get_params(date(run.year, run.month, 1))
        for res in run.results.select_related("employee"):
            em = ems.get(res.employee_id)
            if em is None or em.final_date.year != year:
                if em is not None and em.advances and any(d.year == year for d, _ in em.advances):
                    warnings.append(f"{em.name}: {run.year}-{run.month:02d} avansas ir likutis išmokėti skirtingais metais - "
                                    "patikrinkite eilutes")
                continue
            e = res.employee
            people[e.id] = e
            if em.planned:
                planned.add(e.full_name)
            if res.gross - Decimal(str((res.calc_snapshot or {}).get("income_exempt", "0"))) > P.gpm_threshold_1_amount:
                progressive.add(e.full_name)
            for l in run.lines.filter(employee=e).select_related("pay_code"):
                c = l.pay_code
                if c.category in ("deduction", "employer") or l.amount <= 0:
                    continue
                if c.code in GPM312_LIMIT_CODES:
                    limit = {"DOV": P.dov_limit, "SVD": P.svd_limit}.get(c.code)
                    free = l.amount if limit is None else max(min(l.amount, limit - used[e.id][c.code]), Decimal("0"))
                    used[e.id][c.code] += l.amount
                    if free:
                        acc[(e.id, GPM312_LIMIT_CODES[c.code], "N")]["amount"] += free
                    if l.amount - free:
                        acc[(e.id, "01", "N")]["amount"] += l.amount - free
                    continue
                if not c.vmi_income_code:
                    continue                      # Taisyklių 1 priedas - nedeklaruojama
                acc[(e.id, c.vmi_income_code, GPM312_NATURA.get(c.code, ""))]["amount"] += l.amount
            acc[(e.id, "01", "")]["gpm"] += res.gpm
            if res.gpm15:
                acc[(e.id, "03", "")]["gpm"] += res.gpm15
            m = em.final_date.month
            monthly[m][0] += res.gross - Decimal(str((res.calc_snapshot or {}).get("income_exempt", "0")))
            monthly[m][1] += res.gpm + res.gpm15

    # perkelta iš ankstesnės programos (išmokėta šiais metais)
    from docscanner_app.models import PayrollHistoryMonth, PayrollMigrationOtherPayment
    for h in PayrollHistoryMonth.objects.filter(company=company, paid_year=year).select_related("employee"):
        people[h.employee_id] = h.employee
        acc[(h.employee_id, "01", "")]["amount"] += h.income
        acc[(h.employee_id, "01", "")]["gpm"] += h.gpm
        monthly[h.paid_month][0] += h.income
        monthly[h.paid_month][1] += h.gpm

    rows = []
    for (eid, code, nat), v in sorted(acc.items(), key=lambda kv: (people[kv[0][0]].last_name, kv[0][1], kv[0][2])):
        if v["amount"] <= 0 and v["gpm"] <= 0:
            continue
        e = people[eid]
        cash_gpm = acc.get((eid, "01", ""), {}).get("gpm", Decimal("0"))
        if code in GPM312_ZERO_RATE:
            rate = Decimal("0")
        elif code == "03":
            rate = Decimal("15") if v["gpm"] > 0 else Decimal("0")
        else:
            rate = Decimal("20") if cash_gpm > 0 else Decimal("0")      # VMI: pritaikius NPD GPM = 0 -> 0 %
        if not e.personal_code:
            warnings.append(f"{e.full_name}: nėra asmens kodo - eilutė praleista (gali reikėti U priedo nenuolatiniams)")
            continue
        if e.is_foreigner:
            warnings.append(f"{e.full_name}: užsienietis - patikrinkite, ar jis nuolatinis Lietuvos gyventojas (L priedas)")
        rows.append(Gpm312Row(e.personal_code, "1", e.full_name, code, v["amount"], rate,
                              v["gpm"] if not nat else Decimal("0"), nat))
    for o in PayrollMigrationOtherPayment.objects.filter(migration__company=company, year=year):
        rows.append(Gpm312Row(o.person_code, "1", o.name, o.income_code, o.amount, o.rate, o.gpm))
    if planned:
        warnings.append("Ne visi mokėjimai pažymėti (banko išrašas neįkeltas) - naudojamos planinės datos: "
                        + ", ".join(sorted(planned)[:10]))
    if progressive:
        warnings.append("Didelės išmokos (viršija 36 VDU) - patikrinkite, ar reikia atskirų eilučių 25 / 32 % tarifu: "
                        + ", ".join(sorted(progressive)))
    return rows, warnings, monthly


def gpm312_reconcile(company, year, monthly):
    """Sutikrinimas su pateiktomis GPM313: jei DU buvo taisytas po pateikimo - parodo, kur skiriasi."""
    import re
    out = []
    for d in PayrollDeclaration.objects.filter(company=company, form="GPM313", year=year).order_by("month"):
        f = dict(re.findall(r'<Field Name="(G\d+)">([^<]*)</Field>', d.content or ""))
        if not f:
            continue
        g5 = Decimal(f.get("G5", "0").replace(",", ".") or "0")
        gpm = sum((Decimal((f.get(k) or "0").replace(",", ".")) for k in ("G6", "G7")), Decimal("0"))
        mine = monthly.get(d.month, [Decimal("0"), Decimal("0")])
        if abs(g5 - mine[0]) > Decimal("0.02") or abs(gpm - mine[1]) > Decimal("0.02"):
            out.append(f"GPM313 už {year}-{d.month:02d}: deklaracijoje išmokos {g5} / GPM {gpm}, pagal DU - "
                       f"{mine[0]} / {mine[1]}. Jei DU taisytas po pateikimo - patikslinkite GPM313.")
    return out


def build_gpm312_declaration(company, year):
    from .declarations import gpm312
    rows, warnings, monthly = gpm312_rows(company, year)
    if not rows:
        return None, ["Šiais metais išmokėtų išmokų nerasta (patvirtintų DU su išmokėjimais nėra)"]
    errors = gpm312.validate(company.company_code, company.name, rows)
    content = gpm312.to_ffdata(company.company_code, company.name, year, rows)
    return content, errors + [f"⚠ {w}" for w in warnings + gpm312_reconcile(company, year, monthly)]


def declarations_overview(company, year, month):
    """Ką reikia pateikti už / per mėnesį."""
    first, last = month_bounds(year, month)
    existing = {(d.form, d.contract_id): d for d in PayrollDeclaration.objects.filter(company=company, year=year, month=month)}
    items = [
        {"form": "SAM", "authority": "Sodra", "title": f"SAM už {year}-{month:02d}", "deadline": _next_month_15(year, month)},
        {"form": "GPM313", "authority": "VMI", "title": f"GPM313 už {year}-{month:02d}", "deadline": _next_month_15(year, month)},
    ]
    for c in (EmploymentContract.objects.filter(employee__company=company, start_date__gte=first, start_date__lte=last)
              .exclude(status="draft").select_related("employee")):
        items.append({"form": "1-SD", "authority": "Sodra",
                      "title": f"1-SD: {c.employee.full_name} (pradeda {c.start_date})",
                      "contract": c.id,
                      "deadline": c.start_date if getattr(c, "is_company_head", False) else prev_work_day(c.start_date)})
    for c in (EmploymentContract.objects.filter(employee__company=company, termination_date__gte=first,
                                                termination_date__lte=last).select_related("employee")):
        items.append({"form": "2-SD", "authority": "Sodra",
                      "title": f"2-SD: {c.employee.full_name} (paskutinė diena {c.termination_date})",
                      "contract": c.id, "deadline": next_work_day(c.termination_date)})
    before = _before_du_start(company, year, month)
    absence_items = _absence_overview_items(company, first, last) + _npsd2_overview_items(company, first, last)
    sdup_item = sdup_overview_item(company, year, month)
    if month in (1, 2):
        g = PayrollDeclaration.objects.filter(company=company, form="GPM312", year=year - 1, month__isnull=True).first()
        if g:
            existing[("GPM312", None)] = g
        items.append({"form": "GPM312", "authority": "VMI", "title": f"GPM312 už {year - 1} m. (metinė)",
                      "year": year - 1, "deadline": gpm312_deadline(year - 1)})
    for it in items:
        d = existing.get((it["form"], it.get("contract")))
        it["declaration"] = None if d is None else {
            "id": d.id, "status": d.status, "status_label": d.get_status_display(), "errors": d.errors,
            "manual_values": d.manual_values, "updated_at": d.updated_at, "submitted_at": d.submitted_at,
            "external_status": d.external_status, "external_message": d.external_message,
        }
    out = items + ([sdup_item] if sdup_item else []) + absence_items
    if before:                        # iki DU pradžios DokSkenas - viskas teikta kitoje programoje
        for it in out:
            it["previous_system"] = True
    return out


ABSENCE_TITLE = {"unpaid": "nemokamos atostogos", "truancy": "pravaikšta", "suspension": "nušalinimas nuo darbo",
                 "paternity": "tėvystės atostogos", "childcare": "atostogos vaikui prižiūrėti"}


def _decl_json(d):
    return None if d is None else {
        "id": d.id, "status": d.status, "status_label": d.get_status_display(), "errors": d.errors,
        "manual_values": d.manual_values, "updated_at": d.updated_at, "submitted_at": d.submitted_at,
        "external_status": d.external_status, "external_message": d.external_message,
    }


def _absence_overview_items(company, first, last):
    """9-SD / 12-SD: nebuvimai, prasidėję šį mėnesį, ir visi neišsiųsti patikslinimai."""
    items = []
    evs = (AbsenceEvent.objects.filter(employee__company=company, status="approved", start_date__gte=first,
                                       start_date__lte=last).select_related("employee"))
    pending_changes = (PayrollDeclaration.objects.filter(company=company, form__in=("9-SD", "12-SD"))
                       .exclude(variant="").exclude(status__in=SUBMITTED).select_related("absence_event__employee"))
    seen = set()
    for ev in list(evs) + [d.absence_event for d in pending_changes if d.absence_event_id]:
        if ev is None or ev.id in seen:
            continue
        seen.add(ev.id)
        form, _ = absence_form(ev)
        if not form:
            continue
        decls = {d.variant: d for d in PayrollDeclaration.objects.filter(absence_event=ev)}
        what = ABSENCE_TITLE.get(ev.kind) or ev.get_kind_display().lower()
        base_title = f"{form}: {ev.employee.full_name} – {what} {ev.start_date:%m-%d}–{ev.end_date:%m-%d}"
        variants = [""] + sorted(v for v in decls if v)
        for v in variants:
            if v == "" and first <= ev.start_date <= last or v:
                d = decls.get(v)
                items.append({"form": form, "authority": "Sodra", "absence_event": ev.id, "variant": v,
                              "title": base_title + (" (patikslinimas)" if v else ""),
                              "deadline": d.deadline if d and d.deadline else absence_deadline(ev, form, v),
                              "declaration": _decl_json(d)})
    return items


def declarations_due_reminders():
    """Kasdien: neišsiųsti 9-SD / 12-SD / 1-SD / 2-SD, kurių terminas šiandien ar praėjo -> laiškas buhalteriui."""
    from .savitarna_emails import _send
    today = timezone.localdate()
    qs = (PayrollDeclaration.objects.filter(form__in=("1-SD", "2-SD", "9-SD", "12-SD", "NP-SD2", "GPM312", "SDUP"), deadline__lte=today)
          .exclude(status__in=SUBMITTED).select_related("company"))
    by_company = {}
    for d in qs:
        by_company.setdefault(d.company, []).append(d)
    for company, decls in by_company.items():
        user = getattr(company, "user", None)
        lines = "\n".join(f"• {d.form} – terminas {d.deadline}" + (" (PRAĖJO)" if d.deadline < today else " (šiandien)")
                           for d in decls[:20])
        _send(getattr(user, "email", ""), f"Sodros pranešimai: {len(decls)} laukia pateikimo",
              f"Šiuos pranešimus reikia pateikti Sodrai:\n{lines}\n\nAtsisiųskite juos DokSkenas skiltyje „Deklaracijos“.")
    return len(qs)


# ============================================================
# Tiesioginis teikimas: VMI EDS (GPM313)
# ============================================================

def _vmi_credentials(company):
    from .crypto import decrypt
    st = _settings(company)
    user, pw = (st.vmi_ws_username or "").strip(), decrypt(st.vmi_ws_password)
    if not user or not pw:
        raise ValueError("DU nustatymuose įveskite VMI EDS žiniatinklio paslaugos prisijungimą")
    return user, pw


def submit_declaration(decl):
    """GPM313 -> VMI EDS. Failas lieka nepatvirtintas, kol jo nepatvirtina EDS portale."""
    import requests
    from .declarations.vmi_ws import VmiError, submit_file
    if decl.form != "GPM313":
        raise ValueError("Šios formos tiesioginis teikimas dar neįjungtas - atsisiųskite .ffdata")
    if decl.status != "ready" or not decl.content:
        raise ValueError("Pirmiausia paruoškite deklaraciją be klaidų")
    user, pw = _vmi_credentials(decl.company)
    code = _company_attr(decl.company, "company_code", "code")
    try:
        file_id, msg = submit_file(decl.content.encode("utf-8"), f"GPM313_{decl.year}-{decl.month:02d}.ffdata",
                                   user, pw, code, f"DokSkenas GPM313 {decl.year}-{decl.month:02d}")
    except VmiError as e:
        hint = " Patikrinkite VMI prisijungimą DU nustatymuose." if e.is_auth else ""
        raise ValueError(f"VMI: {e.message or e.code}.{hint}")
    except requests.RequestException:
        raise ValueError("VMI paslauga šiuo metu nepasiekiama - pabandykite vėliau")
    decl.external_id = file_id
    decl.status = "submitted"
    decl.submitted_at = timezone.now()
    decl.external_status = "Laukia patvirtinimo EDS"
    decl.external_message = msg
    decl.save(update_fields=["external_id", "status", "submitted_at", "external_status", "external_message", "updated_at"])
    return decl


def check_declaration_state(decl):
    """VMI būsena -> deklaracija. Atmesta -> Telegram (gal mūsų failo klaida)."""
    from .declarations.vmi_ws import DECL_ACCEPTED, DECL_REJECTED, check_file_state
    from .notify import notify_admin
    if decl.form != "GPM313" or not decl.external_id:
        return decl
    user, pw = _vmi_credentials(decl.company)
    s = check_file_state(decl.external_id, user, pw)
    decl.external_status = s.decl_state_name or s.file_state_name
    decl.last_checked_at = timezone.now()
    if s.decl_state in DECL_ACCEPTED:
        decl.status = "accepted"
        if s.decl_state == 22:
            decl.errors = list(decl.errors or []) + ["VMI: priimta su klaidomis - patikrinkite EDS"]
    elif s.decl_state in DECL_REJECTED:
        decl.status = "rejected"
        decl.errors = list(decl.errors or []) + [f"VMI: {s.decl_state_name}"]
        notify_admin(f"⚠ DokSkenas: GPM313 {decl.year}-{decl.month:02d} - VMI būsena „{s.decl_state_name}“\n"
                     f"Įmonė: {decl.company} (id {decl.company_id}), deklaracija {decl.id}")
    elif s.file_state in (30, 40):
        decl.status = "error"
        decl.errors = ["Failas nebuvo patvirtintas EDS laiku. Paruoškite ir pateikite iš naujo."]
    decl.save(update_fields=["external_status", "last_checked_at", "status", "errors", "updated_at"])
    return decl
