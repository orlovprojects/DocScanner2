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
        segs.append(TermsSegment(t.valid_from, valid_to, t.pay_form, t.base_amount, t.workload, week))
    return segs


def _events(employee, first, last):
    qs = AbsenceEvent.objects.filter(employee=employee, status="approved",
                                     start_date__lte=last, end_date__gte=first)
    return [Event(e.kind, e.start_date, e.end_date,
                  is_continuation=e.parent_event_id is not None or not e.employer_pays_first_days,
                  ref=e.id) for e in qs]


def _overrides(employee, year, month):
    out = {}
    qs = TimesheetEntry.objects.filter(employee=employee, timesheet__year=year, timesheet__month=month,
                                       is_manual=True)
    for e in qs:
        o = out.setdefault(e.date, {"extra": {}})
        if e.hour_type == "normal":
            o["code"] = e.code
            o["hours"] = e.hours
        else:
            o["extra"][e.hour_type] = o["extra"].get(e.hour_type, 0) + e.hours
    return out


def _closed_results(employee):
    return PayrollEmployeeResult.objects.filter(employee=employee, run__status__in=CLOSED_STATUSES,
                                                run__kind="regular")


def _vdu_months(employee, first):
    months = []
    for y, m in _months_back(first, 3):
        res = _closed_results(employee).filter(run__year=y, run__month=m).first()
        if not res:
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
    return agg["vsd"] or Decimal("0"), gpm_taxable, limits


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
    planned = (PayrollPayment.objects
               .filter(company=run.company, employee=employee, kind="advance", year=run.year, month=run.month)
               .exclude(status="cancelled").aggregate(s=Sum("amount"))["s"] or Decimal("0"))
    return extra, deductions, advance + planned


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
    extra, deductions, advance = _manual_lines(run, employee)
    tenure_years = (first - contract.start_date).days / 365.25

    inp = EmployeeMonthInput(
        year=run.year, month=run.month, segments=segments, events=events,
        overrides=_overrides(employee, run.year, run.month),
        employed_from=employed_from, employed_to=employed_to,
        vdu_months=_vdu_months(employee, first), bonuses=_bonuses(employee, first),
        extra_lines=extra, deductions=deductions, advance_paid=advance,
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
    if run.status in CLOSED_STATUSES:
        raise ValueError("Patvirtinto DU perskaičiuoti negalima")

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

        auto_lines = [l for l in res.lines if all(l is not e for e in inp.extra_lines)] + tax_lines(res.taxes)
        new = []
        for l in auto_lines:
            pc = codes.get(l.code)
            if pc is None:
                res.warnings.append(f"DU kodas {l.code} nerastas DB (paleisk payroll_seed)")
                continue
            new.append(PayrollLine(run=run, employee=emp, contract=contract, pay_code=pc,
                                   quantity=l.quantity, rate=l.rate, amount=l.amount,
                                   sodra_amount=l.sodra_part, accrual_month=first, comment=l.note))
        PayrollLine.objects.bulk_create(new)
        for e in inp.extra_lines:  # rankinėms eilutėms - Sodra apmokestinama dalis (SDUP)
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
def approve_run(run, user):
    if run.status in CLOSED_STATUSES:
        return run
    if not run.results.exists():
        raise ValueError("Nėra ką tvirtinti - šį mėnesį nėra apskaičiuotų atlyginimų")
    journal = run_journal(run)
    je = write_journal_entry(run, journal, user)
    run.journal_entry = je
    run.status = "approved"
    run.approved_by = user
    run.approved_at = timezone.now()
    run.save(update_fields=["journal_entry", "status", "approved_by", "approved_at", "updated_at"])
    from .payments import create_obligations_for_run
    create_obligations_for_run(run)
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
    je_id = run.journal_entry_id
    run.journal_entry = None
    run.status = "draft"
    run.approved_by = None
    run.approved_at = None
    run.save(update_fields=["journal_entry", "status", "approved_by", "approved_at", "updated_at"])
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


def timesheet_for(company, year, month):
    """Sugeneruotas tabelis visiems darbuotojams (su įvykiais ir rankiniais pakeitimais)."""
    first, last = month_bounds(year, month)
    out = []
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
        ts = generate(
            year, month, week=primary.week, workload=primary.workload,
            employed_from=contract.start_date if contract.start_date > first else None,
            employed_to=end if end and end < last else None,
            events=_events(emp, first, last), overrides=_overrides(emp, year, month),
        )
        out.append({
            "employee": emp.id,
            "employee_name": emp.full_name,
            "worked_days": ts.worked_days,
            "worked_hours": str(ts.worked_hours),
            "days": [{
                "date": d.date.isoformat(),
                "code": d.code,
                "hours": str(d.hours),
                "scheduled_hours": str(d.scheduled_hours),
                "event_kind": d.event.kind if d.event else None,
                "event_id": d.event.ref if d.event else None,
                "extra": {k: str(v) for k, v in d.extra.items()},
            } for d in ts.days],
        })
    return out


# ============================================================
# SDUP
# ============================================================

def _latest_terms(contract, on_date):
    return (contract.terms.select_related("position__group", "schedule")
            .filter(valid_from__lte=on_date).order_by("-valid_from").first()
            or contract.terms.select_related("position__group", "schedule").order_by("valid_from").first())


def sdup_for_run(run):
    """(SDUP dict, klaidų sąrašas) patvirtintam arba juodraštiniam mėnesiui."""
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
            ssn=f"{emp.sd_series}{emp.sd_number}" if emp.is_foreigner and emp.sd_series and emp.sd_number else "",
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
            # valandinis -> mėnesio atitikmuo visam etatui: įkainis x sav. valandos x 52 / 12
            week = terms_week(t)
            out.append((t.contract.employee, t.base_amount * sum(week, Decimal("0")) * 52 / 12))
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
          "min": str(g.salary_min or ""), "max": str(g.salary_max or "")}
         for g in PositionGroup.objects.filter(company=company).prefetch_related("positions")],
        key=lambda x: x["code"])


def das_outdated(company):
    """Ar grupės pasikeitė po paskutinės patvirtintos DAS versijos."""
    last = DasDocument.objects.filter(company=company).order_by("-version").first()
    if last is None:
        return False
    old = sorted([{**g, "positions": sorted(g.get("positions", []))} for g in last.groups_snapshot],
                 key=lambda x: x["code"])
    return old != _groups_snapshot(company)


# Pradinis vertinimas: pagal 4 lygio LPK grupę (data/lpk_scores.json),
# jei nėra - pagal pagrindinę grupę (pirmas kodo skaitmuo, ISCO-08 kvalifikacijos lygis).
SUGGESTED_SCORES = {
    "1": (4, 4, 3, 5, 2), "2": (4, 5, 3, 4, 2), "3": (3, 3, 3, 3, 2), "4": (2, 2, 2, 2, 1),
    "5": (2, 2, 3, 2, 3), "6": (2, 2, 4, 2, 4), "7": (3, 2, 4, 2, 4), "8": (2, 2, 4, 3, 4),
    "9": (1, 1, 4, 1, 4), "0": (3, 3, 4, 4, 5),
}
SCORE_KEYS = ("skills", "qualification", "effort", "responsibility", "conditions")


def suggested_scores(lpk_code):
    """(vertinimas, paaiškinimas) pareigybių grupei pagal LPK kodą."""
    from .lpk import all_scores
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
    by_name = {normalize(g.name).strip(): g for g in PositionGroup.objects.filter(company=company)}
    buckets = {}
    for pos in Position.objects.filter(company=company, group__isnull=True).order_by("name"):
        buckets.setdefault(pos.lpk_code or f"id-{pos.id}", []).append(pos)
    created = 0
    for positions in buckets.values():
        name = positions[0].name
        g = by_name.get(normalize(name).strip())
        if g is None:
            salaries = [s for pos in positions for _, s in _full_time_salaries(pos)]
            rng_min, rng_max = _range_from_salaries(salaries, get_params(date.today()).mma)
            scores, note = suggested_scores(positions[0].lpk_code)
            g = PositionGroup.objects.create(
                company=company, code=next_group_code(company), name=name,
                description=("Vertinimas pasiūlytas automatiškai pagal profesijų klasifikatorių - patikrinkite. " + note).strip(),
                **scores,
                salary_min=rng_min, salary_max=rng_max,
            )
            by_name[normalize(name).strip()] = g
            created += 1
        Position.objects.filter(id__in=[p.id for p in positions]).update(group=g)
    return created


def groups_check(company):
    """Darbuotojai už grupės ribų, pareigybės be grupės, MMA pakeitimai, pasenusi DAS."""
    issues = ensure_mma_minimums(company)
    for pos in Position.objects.filter(company=company).select_related("group"):
        people = _full_time_salaries(pos)
        if pos.group is None:
            if people:
                issues.append({"type": "no_group", "position": pos.name, "employees": len(people)})
            continue
        g = pos.group
        for emp, sal in people:
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
        groups_snapshot=[{"code": g.code, "name": g.name, "positions": g.positions,
                          "min": str(g.salary_min or ""), "max": str(g.salary_max or "")} for g in ctx.groups],
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

REQUEST_EVENT_KIND = {"vacation": "vacation", "parent_day": "parent_day", "unpaid": "unpaid"}


def request_preview(employee, kind, start, end):
    """Patikra prieš pateikiant: darbo dienos, likutis, klaidos (blokuoja) ir įspėjimai (ne)."""
    from .averages import ChildInfo, parent_day_entitlement
    from .requests_logic import DISMISSAL_NOTICE_DAYS, parent_day_quota
    from .work_calendar import work_days_between
    errors, warnings, out = [], [], {}
    today = timezone.localdate()
    if kind not in ("vacation", "parent_day", "unpaid", "dismissal", "pay_info"):
        return {"errors": ["Nežinomas prašymo tipas"]}
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
    out.update(errors=errors, warnings=warnings)
    return out


def _company_name(company):
    return _company_attr(company, "name", "company_name") or str(company)


@transaction.atomic
def create_request(employee, kind, start, end, comment="", ip=None, user_agent=""):
    from .requests_logic import RequestDocData, render_request_html
    from .savitarna_emails import notify_new_request
    pre = request_preview(employee, kind, start, end)
    if pre.get("errors"):
        raise ValueError(" ".join(pre["errors"]))
    if kind == "dismissal":
        start = end
    if kind == "pay_info":
        start = end = timezone.localdate()
    contract = _active_contract(employee, start, end) or employee.contracts.order_by("-start_date").first()
    terms = _latest_terms(contract, start) if contract else None
    now = timezone.now()
    req = EmployeeRequest.objects.create(
        employee=employee, kind=kind, start_date=start, end_date=end,
        work_days=Decimal(pre.get("work_days", "0")), comment=(comment or "")[:500],
        submitted_ip=ip, submitted_user_agent=(user_agent or "")[:255],
    )
    req.html = render_request_html(RequestDocData(
        kind, _company_name(employee.company), "Vadovui",
        employee.full_name, terms.position.name if terms and terms.position else "",
        start, end, req.work_days, req.comment, timezone.localtime(now), ip or "",
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
        )
        req.absence_event = ev
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
    )


def _person(emp):
    from .declarations.sodra_forms import Person
    return Person(emp.first_name, emp.last_name, person_code="" if emp.is_foreigner else emp.personal_code,
                  sd_series=emp.sd_series, sd_number=emp.sd_number, foreign_code=emp.foreign_code,
                  birth_date=emp.birth_date, is_foreigner=emp.is_foreigner)


def _next_month_15(year, month):
    return date(year + (month == 12), month % 12 + 1, 15)


def _closed_run(company, year, month):
    return PayrollRun.objects.filter(company=company, year=year, month=month, kind="regular",
                                     status__in=CLOSED_STATUSES).first()


def _dismissed_in(run):
    first, last = month_bounds(run.year, run.month)
    return set(EmploymentContract.objects.filter(employee__company=run.company, termination_date__gte=first,
                                                 termination_date__lte=last).values_list("employee_id", flat=True))


def build_sam_declaration(company, year, month):
    from .declarations.sodra_forms import SamRow, build_sam
    run = _closed_run(company, year, month)
    if run is None:
        return b"", [f"{year}-{month:02d} atlyginimai dar nepatvirtinti"]
    gone = _dismissed_in(run)
    rows = [SamRow(_person(r.employee), r.sodra_base, r.sam_tax_rate, r.sam_payment)
            for r in run.results.select_related("employee").order_by("employee__last_name")
            if r.employee_id not in gone]
    # atleistieji šį mėnesį teikiami 2-SD, ne SAM
    return build_sam(_insurer(company), year, month, rows)


def gpm313_totals(company, year, month):
    """Sumos pagal IŠMOKĖJIMO mėnesį: praeito mėnesio DU (mokama salary_day) + atleistųjų šio mėnesio galutinis."""
    st = _settings(company)
    warnings = []
    g5 = g6 = g7 = Decimal("0")

    def add(res, day):
        nonlocal g5, g6, g7
        exempt = Decimal(str((res.calc_snapshot or {}).get("income_exempt", "0")))
        g5 += res.gross - exempt
        if day <= 15:
            g6 += res.gpm + res.gpm15
        else:
            g7 += res.gpm + res.gpm15

    py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
    prev = _closed_run(company, py, pm)
    if prev:
        gone = _dismissed_in(prev)
        for res in prev.results.all():
            if res.employee_id not in gone:
                add(res, st.salary_day)
    else:
        warnings.append(f"{py}-{pm:02d} atlyginimai nepatvirtinti - jų išmokos neįtrauktos")
    cur = _closed_run(company, year, month)
    if cur:
        for c in EmploymentContract.objects.filter(employee__company=company, termination_date__year=year,
                                                   termination_date__month=month):
            res = cur.results.filter(employee=c.employee).first()
            if res:
                add(res, c.termination_date.day)
    if st.advance_enabled:
        warnings.append("Mokamas avansas - patikrinkite 5-7 laukelius (avanso išmokos priskiriamos jų išmokėjimo mėnesiui)")
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


def _generate_declaration(company, form, year=None, month=None, contract=None, manual=None):
    if form == "SAM":
        content, errors = build_sam_declaration(company, year, month)
        deadline, key = _next_month_15(year, month), dict(year=year, month=month, contract=None)
    elif form == "GPM313":
        content, errors = build_gpm313_declaration(company, year, month, manual)
        deadline, key = _next_month_15(year, month), dict(year=year, month=month, contract=None)
    elif form == "1-SD":
        content, errors = build_1sd_declaration(contract)
        deadline = contract.start_date - timedelta(days=1)
        key = dict(year=contract.start_date.year, month=contract.start_date.month, contract=contract)
    elif form == "2-SD":
        content, errors = build_2sd_declaration(contract)
        deadline = contract.termination_date
        d = contract.termination_date or timezone.localdate()
        key = dict(year=d.year, month=d.month, contract=contract)
    else:
        raise ValueError("Nežinoma forma")
    blocking = [e for e in errors if not e.startswith("Mokamas avansas")]
    obj, _ = PayrollDeclaration.objects.update_or_create(
        company=company, form=form, **key,
        defaults={"content": content.decode("utf-8") if content else "", "errors": errors,
                  "manual_values": {k: str(v) for k, v in (manual or {}).items()},
                  "status": "error" if (blocking or not content) else "ready", "deadline": deadline},
    )
    return obj


def generate_declaration(company, form, year=None, month=None, contract=None, manual=None):
    """Netikėta klaida -> būsena „Yra klaidų“ + Telegram pranešimas administratoriui."""
    try:
        return _generate_declaration(company, form, year, month, contract, manual)
    except ValueError:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("Deklaracijos %s klaida (company=%s)", form, company.id)
        from .notify import notify_admin
        notify_admin(f"❌ DokSkenas: deklaracijos {form} klaida\nĮmonė: {company} (id {company.id})\n"
                     f"Laikotarpis: {year}-{month}, sutartis: {getattr(contract, 'id', '-')}\n"
                     f"{type(e).__name__}: {e}")
        key = dict(year=year, month=month, contract=None)
        if contract is not None:
            d = contract.start_date if form == "1-SD" else (contract.termination_date or timezone.localdate())
            key = dict(year=d.year, month=d.month, contract=contract)
        obj, _ = PayrollDeclaration.objects.update_or_create(
            company=company, form=form, **key,
            defaults={"status": "error", "content": "", "errors": [
                "Vidinė klaida ruošiant deklaraciją. Administratorius jau informuotas – pabandykite vėliau."]},
        )
        return obj


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
                      "contract": c.id, "deadline": c.start_date - timedelta(days=1)})
    for c in (EmploymentContract.objects.filter(employee__company=company, termination_date__gte=first,
                                                termination_date__lte=last).select_related("employee")):
        items.append({"form": "2-SD", "authority": "Sodra",
                      "title": f"2-SD: {c.employee.full_name} (paskutinė diena {c.termination_date})",
                      "contract": c.id, "deadline": c.termination_date})
    for it in items:
        d = existing.get((it["form"], it.get("contract")))
        it["declaration"] = None if d is None else {
            "id": d.id, "status": d.status, "status_label": d.get_status_display(), "errors": d.errors,
            "manual_values": d.manual_values, "updated_at": d.updated_at, "submitted_at": d.submitted_at,
            "external_status": d.external_status, "external_message": d.external_message,
        }
    return items


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
