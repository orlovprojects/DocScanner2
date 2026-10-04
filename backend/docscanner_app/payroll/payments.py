"""
DU išmokėjimai: įsipareigojimai (PayrollPayment), jų apmokėjimas (PaymentAllocation kind="payroll")
iš banko išrašo arba rankiniu būdu, DK įrašai.

DK (mokėjimas):
    darbuotojui   D 4480 / 4484 (su darbuotoju)  K 271x / 2720 / kita
    VMI (GPM)     D 4481                         K 271x
    Sodra         D 4482 + 4486 (pagal dalis)    K 271x
    išskaita      D 4494                         K 271x
"""
import logging
from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from .journal import EMPLOYEE_ACCOUNTS, employee_credit
from .payment_matching import Obligation, Txn, gpm_due_date, match_all, split_proportionally

logger = logging.getLogger("docscanner_app")

ZERO = Decimal("0")
VMI_NAME, VMI_CODE = "Valstybinė mokesčių inspekcija", "188659752"
SODRA_NAME = "Valstybinio socialinio draudimo fondo valdyba"
DEDUCTION_CODES = ("ANT", "PRF", "III", "ISK")          # išskaitos, mokamos kitam gavėjui (4494)
DEFAULT_ACCOUNT = {"employee": "4480", "advance": "4480", "gpm": "4481", "sodra": "4482", "deduction": "4494"}
REF_LETTER = {"employee": "E", "advance": "A", "gpm": "G", "sodra": "S", "deduction": "I"}
ACTIVE = ("auto", "confirmed", "manual")


def _clip(y, m, day):
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return min(date(y, m, 1) + timedelta(days=max(day, 1) - 1), nxt - timedelta(days=1))


def _next(y, m):
    return (y + (m == 12), m % 12 + 1)


def _q2(v):
    return Decimal(v).quantize(Decimal("0.01"))


# ============================================================
# Įsipareigojimai
# ============================================================

def _create(company, run, kind, y, m, amount, **kw):
    from docscanner_app.models import PayrollPayment
    p = PayrollPayment.objects.create(company=company, run=run, kind=kind, year=y, month=m, amount=_q2(amount), **kw)
    p.reference = f"DU{y}{m:02d}-{REF_LETTER[kind]}{p.id}"
    p.save(update_fields=["reference"])
    return p


@transaction.atomic
def create_obligations_for_run(run):
    """Patvirtintas DU -> kam, kiek ir iki kada sumokėti."""
    from docscanner_app.models import PayrollPayment
    from .services import _settings, employee_journals

    if run.kind not in ("regular", "final_settlement", "correction"):
        return []
    PayrollPayment.objects.filter(run=run, allocations__isnull=True).delete()
    st = _settings(run.company)
    y, m = run.year, run.month
    ny, nm = _next(y, m)
    pay_date = _clip(ny, nm, st.salary_day or 10)
    journals = dict(employee_journals(run))
    gpm = s4482 = s4486 = ZERO
    out = []

    first, last = date(y, m, 1), _clip(y, m, 31)
    from docscanner_app.models import EmploymentContract
    terminated = dict(EmploymentContract.objects.filter(
        employee__company=run.company, termination_date__gte=first, termination_date__lte=last,
    ).values_list("employee_id", "termination_date"))
    pay_dates = []

    for res in run.results.select_related("employee"):
        e = res.employee
        emp_pay_date = terminated.get(e.id) or pay_date      # atleidžiamam - atsiskaitymo diena
        pay_dates.append(emp_pay_date)
        gpm += res.gpm + res.gpm15
        s4486 += res.psd + res.grindys_psd
        s4482 += res.vsd + res.kaupimas + res.employer_vsd + res.gar + res.ilg + res.grindys_vsd
        if res.payable > 0:
            c4484 = min(employee_credit(journals.get(e.id, []), "4484"), res.payable)
            br = {"4480": str(res.payable - c4484), "4484": str(c4484)}
            out.append(_create(
                run.company, run, "employee", y, m, res.payable, employee=e,
                recipient_name=e.full_name, recipient_iban=(e.iban or "").replace(" ", ""),
                purpose=f"Darbo užmokestis už {y}-{m:02d}",
                breakdown={k: v for k, v in br.items() if Decimal(v)}, due_date=emp_pay_date,
            ))
        for l in run.lines.filter(employee=e, pay_code__code__in=DEDUCTION_CODES).select_related("pay_code"):
            out.append(_create(
                run.company, run, "deduction", y, m, l.amount, employee=e,
                recipient_name=(l.comment or l.pay_code.name)[:255],
                purpose=f"{l.pay_code.name}: {e.full_name}"[:140],
                breakdown={"4494": str(l.amount)}, due_date=emp_pay_date,
            ))

    if gpm > 0:
        out.append(_create(
            run.company, run, "gpm", y, m, gpm, recipient_name=VMI_NAME, recipient_code=VMI_CODE,
            imokos_kodas="1311", purpose=f"GPM už {y}-{m:02d}", breakdown={"4481": str(gpm)},
            due_date=min(gpm_due_date(d) for d in pay_dates) if pay_dates else gpm_due_date(pay_date),
        ))
    if s4482 + s4486 > 0:
        out.append(_create(
            run.company, run, "sodra", y, m, s4482 + s4486, recipient_name=SODRA_NAME, imokos_kodas="252",
            purpose=f"VSD ir PSD įmokos už {y}-{m:02d}",
            breakdown={k: str(v) for k, v in (("4482", s4482), ("4486", s4486)) if v},
            due_date=date(ny, nm, 15),
        ))
    logger.info("DU įsipareigojimai: run=%s, sukurta %s", run.id, len(out))
    return out


def delete_obligations_for_run(run):
    from docscanner_app.models import PaymentAllocation, PayrollPayment
    if PaymentAllocation.objects.filter(payroll_payment__run=run).exists():
        raise ValueError("Šiam DU jau yra užregistruotų mokėjimų - pirmiausia pašalinkite juos skiltyje „Išmokėjimai“")
    PayrollPayment.objects.filter(run=run).delete()


def _estimate_advance(employee, y, m, percent):
    from docscanner_app.models import ContractTerms, PayrollEmployeeResult
    last = (PayrollEmployeeResult.objects
            .filter(employee=employee, run__kind="regular", run__status__in=("approved", "paid", "closed"))
            .order_by("-run__year", "-run__month").first())
    base = last.net if last and last.net else None
    if base is None:
        t = (ContractTerms.objects.filter(contract__employee=employee, valid_from__lte=date(y, m, 15),
                                          pay_form="monthly")
             .order_by("-valid_from").first())
        base = t.base_amount * Decimal("0.6") if t else ZERO      # apytikslis grynasis
    return (base * Decimal(percent) / 100).quantize(Decimal("1"), ROUND_DOWN)


@transaction.atomic
def create_advances(company, y, m):
    """Mėnesio avansai visiems dirbantiems (išskyrus prašiusius mokėti kartą per mėnesį)."""
    from docscanner_app.models import Employee, PayrollPayment, PayrollRun
    from .services import _settings
    st = _settings(company)
    if not st.advance_enabled:
        raise ValueError("DU nustatymuose avansas neįjungtas")
    if PayrollRun.objects.filter(company=company, year=y, month=m, kind="regular",
                                 status__in=("approved", "paid", "closed")).exists():
        raise ValueError("Šio mėnesio DU jau patvirtintas - avansus kurkite prieš tvirtinimą")
    first, last = date(y, m, 1), _clip(y, m, 31)
    done = set(PayrollPayment.objects.filter(company=company, kind="advance", year=y, month=m)
               .exclude(status="cancelled").values_list("employee_id", flat=True))
    out, skipped = [], []
    emps = (Employee.objects.filter(company=company, status="active", pay_once_a_month=False)
            .filter(Q(contracts__start_date__lte=first) & (Q(contracts__termination_date__isnull=True)
                                                         | Q(contracts__termination_date__gte=last)))
            .distinct())
    for e in emps:
        if e.id in done:
            continue
        amount = e.advance_amount or _estimate_advance(e, y, m, st.advance_percent or 50)
        if amount <= 0:
            skipped.append(e.full_name)
            continue
        out.append(_create(
            company, None, "advance", y, m, amount, employee=e, recipient_name=e.full_name,
            recipient_iban=(e.iban or "").replace(" ", ""), purpose=f"Avansas už {y}-{m:02d}",
            breakdown={"4480": str(amount)}, due_date=_clip(y, m, st.advance_day or 20),
        ))
    return out, skipped


def _sync_run(p):
    run = p.run
    if not run or run.status not in ("approved", "paid"):
        return
    pending = run.payments.exclude(status__in=("paid", "cancelled")).exists()
    new = "approved" if pending else "paid"
    if run.status != new:
        run.status = new
        run.save(update_fields=["status", "updated_at"])


def _recalc(p):
    p.recalc()
    _sync_run(p)


# ============================================================
# DK
# ============================================================

def _bank_account(cp, txn):
    bs = txn.bank_statement
    info = cp.get_bank_chart_account(bs.account_iban or "", bs.bank_name, currency=(txn.currency or "EUR"))
    return (info.get("account") if isinstance(info, dict) else info) or "2711"


def create_je(alloc):
    """PaymentAllocation(kind="payroll") -> DK įrašas."""
    from docscanner_app.models import JournalEntry, JournalEntryLine
    from docscanner_app.utils.journal_generators import finalize_journal_entry
    from .services import ACCOUNT_NAMES

    if alloc.status == "proposed" or alloc.journal_entry_id:
        return alloc.journal_entry
    p = alloc.payroll_payment
    cp = p.company
    txn = alloc.outgoing_transaction
    if txn and txn.bank_statement_id:
        bank = _bank_account(cp, txn)
    elif alloc.needs_account or not alloc.payment_account:
        return None
    else:
        bank = alloc.payment_account

    amount = alloc.amount
    parts = split_proportionally(amount, p.breakdown or {DEFAULT_ACCOUNT[p.kind]: str(p.amount)})
    fee = ZERO
    if txn and not txn.allocations.filter(journal_entry__isnull=False).exclude(id=alloc.id).exists():
        if (txn.currency or "EUR").upper() == "EUR":
            fee = Decimal(str(txn.fee_amount or 0))
        fee += Decimal(str(txn.exchange_fee or 0))

    pay_date = alloc.effective_payment_date or timezone.localdate()
    desc = f"{p.get_kind_display()} {p.year}-{p.month:02d}: {p.recipient_name}"[:255]
    with transaction.atomic():
        je = JournalEntry.objects.create(
            user=cp.user, company_profile=cp, source_type=JournalEntry.SOURCE_BANK,
            entry_date=pay_date, period=pay_date.replace(day=1),
            document_number=p.reference or f"DU-{p.id}",
            counterparty_name=p.recipient_name, counterparty_code=p.recipient_code,
            description=desc, currency="EUR", status=JournalEntry.STATUS_POSTED,
        )
        lines, i = [], 0
        for acc, amt in parts.items():
            lines.append(JournalEntryLine(
                entry=je, side="D", account_code=acc, account_name=ACCOUNT_NAMES.get(acc, ""), amount=amt,
                description=desc, sort_order=i, employee_id=p.employee_id if acc in EMPLOYEE_ACCOUNTS else None,
            ))
            i += 1
        if fee > 0:
            lines.append(JournalEntryLine(
                entry=je, side="D", account_code="6810",
                account_name="Kitos finansinės ir investicinės veiklos sąnaudos", amount=fee,
                description=f"Banko mokestis: {desc}"[:255], sort_order=i,
            ))
            i += 1
        lines.append(JournalEntryLine(
            entry=je, side="K", account_code=bank, account_name="Pinigai", amount=amount + fee,
            description=desc, sort_order=i,
        ))
        JournalEntryLine.objects.bulk_create(lines)
        finalize_journal_entry(je)
        alloc.journal_entry = je
        alloc.save(update_fields=["journal_entry"])
    return je


def _drop_je(alloc):
    from docscanner_app.services.accounting_transfer import delete_je_for_allocation
    delete_je_for_allocation(alloc)


# ============================================================
# Rankinis apmokėjimas / patvirtinimas / pašalinimas
# ============================================================

@transaction.atomic
def mark_paid(p, user, payment_date, payment_account="", amount=None, note=""):
    from docscanner_app.models import PaymentAllocation
    amount = _q2(amount if amount not in (None, "") else p.open_amount)
    if amount <= 0:
        raise ValueError("Šis mokėjimas jau sumokėtas")
    acc = (payment_account or "").strip()
    alloc = PaymentAllocation.objects.create(
        kind="payroll", payroll_payment=p, source="manual", status="manual",
        amount=amount, amount_txn=amount, amount_eur=amount, payment_date=payment_date,
        payment_account=acc, needs_account=not acc, confidence=Decimal("1.00"),
        match_reasons={"manual": True}, note=note[:500],
        counterparty_name=p.recipient_name[:255], confirmed_at=timezone.now(), confirmed_by=user,
    )
    _recalc(p)
    create_je(alloc)
    return alloc


@transaction.atomic
def set_account(alloc, payment_account):
    alloc.payment_account = payment_account.strip()
    alloc.needs_account = not alloc.payment_account
    alloc.save(update_fields=["payment_account", "needs_account"])
    return create_je(alloc)


def _refresh_txn(txn):
    if not txn:
        return
    txn.recalc_allocation_state(save=False)
    fields = ["allocated_amount", "updated_at"]
    if not txn.allocations.exists():
        txn.match_status, txn.match_confidence, txn.matched_document_number = "unmatched", Decimal("0"), ""
        fields += ["match_status", "match_confidence", "matched_document_number"]
    elif not txn.allocations.filter(status="proposed").exists() and txn.match_status == "likely_matched":
        txn.match_status = "confirmed"
        fields.append("match_status")
    txn.save(update_fields=fields)
    if txn.bank_statement_id:
        txn.bank_statement.refresh_stats()


@transaction.atomic
def confirm(alloc, user):
    alloc.status = "confirmed"
    alloc.confirmed_at, alloc.confirmed_by = timezone.now(), user
    alloc.save(update_fields=["status", "confirmed_at", "confirmed_by"])
    _recalc(alloc.payroll_payment)
    _refresh_txn(alloc.outgoing_transaction)
    create_je(alloc)
    return alloc


@transaction.atomic
def remove(alloc):
    """Atmesti pasiūlymą arba pašalinti mokėjimą (DK ištrinamas)."""
    p, txn = alloc.payroll_payment, alloc.outgoing_transaction
    _drop_je(alloc)
    alloc.delete()
    _recalc(p)
    _refresh_txn(txn)


@transaction.atomic
def link_transaction(p, txn, user, amount=None):
    """Rankinis banko išlaidos susiejimas su DU mokėjimu."""
    from docscanner_app.models import PaymentAllocation
    amount = _q2(amount if amount not in (None, "") else min(txn.unallocated_amount, p.open_amount))
    if amount <= 0:
        raise ValueError("Nėra ką susieti - operacija arba mokėjimas jau padengti")
    alloc = PaymentAllocation.objects.create(
        kind="payroll", payroll_payment=p, outgoing_transaction=txn, source="bank_import", status="manual",
        amount=amount, amount_txn=amount, amount_eur=amount, payment_date=txn.transaction_date,
        confidence=Decimal("1.00"), match_reasons={"manual_match": True},
        counterparty_name=p.recipient_name[:255], confirmed_at=timezone.now(), confirmed_by=user,
    )
    txn.match_status = "manually_matched"
    txn.transaction_category = {"gpm": "tax_vmi", "sodra": "tax_sodra"}.get(p.kind, "salary")
    txn.matched_document_number = p.reference
    txn.save(update_fields=["match_status", "transaction_category", "matched_document_number", "updated_at"])
    _recalc(p)
    _refresh_txn(txn)
    create_je(alloc)
    return alloc


# ============================================================
# Banko išrašas
# ============================================================

def _reserved(p):
    """Kiek jau padengta banku (įskaitant pasiūlymus) - rankiniai be banko čia neįskaičiuojami."""
    return (p.allocations.filter(outgoing_transaction__isnull=False, status__in=ACTIVE + ("proposed",))
            .aggregate(s=Sum("amount"))["s"] or ZERO)


def match_transactions(user, company, txns):
    from docscanner_app.models import PayrollPayment
    if not txns:
        return {"auto": 0, "proposed": 0}
    payments = {p.id: p for p in PayrollPayment.objects.filter(company=company).exclude(status="cancelled")
                .select_related("employee")}
    obligations = []
    for p in payments.values():
        left = p.amount - _reserved(p)
        if left > Decimal("0.01"):
            obligations.append(Obligation(p.id, p.kind, left, p.due_date, p.recipient_name, p.recipient_iban,
                                          p.reference))
    data = [Txn(t.id, Decimal(str(t.amount_eur or t.amount)), t.transaction_date, t.counterparty_name or "",
                t.counterparty_account or "", t.counterparty_code or "", t.payment_purpose or "",
                t.reference_number or "") for t in txns]
    by_id = {t.id: t for t in txns}
    stats = {"auto": 0, "proposed": 0}
    for r in match_all(data, obligations):
        txn = by_id[r.txn_id]
        if r.status == "none":
            _apply_hint(txn, r)
            continue
        _apply(txn, r, payments)
        stats[r.status] += 1
    return stats


def match_statement(user, company, statement):
    if not company:
        return {"auto": 0, "proposed": 0}
    txns = list(statement.outgoing_transactions.filter(
        journal_entry__isnull=True, match_status__in=("unmatched", "classified"),
    ).select_related("bank_statement"))
    return match_transactions(user, company, txns)


def _apply_hint(txn, r):
    if "1001" not in (r.hint.get("codes") or []) or txn.transaction_category != "tax_vmi":
        return
    # 1001 - PVM / pelno mokestis: ne GPM, automatiškai į 4481 nekeliame
    details = dict(txn.match_details or {})
    details["payroll_hint"] = {"codes": r.hint["codes"], "suggested_account": "4492",
                               "note": "Įmokos kodas 1001 - PVM arba pelno mokestis, ne GPM"}
    txn.transaction_category = ""
    txn.match_details = details
    txn.save(update_fields=["transaction_category", "match_details", "updated_at"])


@transaction.atomic
def _apply(txn, r, payments):
    from docscanner_app.models import PaymentAllocation
    status = "auto" if r.status == "auto" else "proposed"
    labels = []
    for m in r.matches:
        p = payments[m.obligation_id]
        labels.append(p.reference)
        reasons = dict(m.reasons, warnings=r.warnings)
        manual = (p.allocations.filter(source="manual", outgoing_transaction__isnull=True, status="manual",
                                       amount__gte=m.amount - Decimal("0.01"), amount__lte=m.amount + Decimal("0.01"))
                  .first())
        if manual:
            # Jau pažymėta rankiniu būdu -> tik pririšam banko operaciją (antro DK nebus)
            _drop_je(manual)
            manual.match_reasons = dict(manual.match_reasons or {}, converted_from_manual=True,
                                        manual_payment_account=manual.payment_account, **reasons)
            manual.outgoing_transaction, manual.source = txn, "bank_import"
            manual.payment_date, manual.payment_account, manual.needs_account = txn.transaction_date, "", False
            manual.save()
            create_je(manual)
        else:
            alloc = PaymentAllocation.objects.create(
                kind="payroll", payroll_payment=p, outgoing_transaction=txn, source="bank_import", status=status,
                amount=m.amount, amount_txn=m.amount, amount_eur=m.amount, payment_date=txn.transaction_date,
                confidence=m.confidence, match_reasons=reasons, counterparty_name=p.recipient_name[:255],
            )
            create_je(alloc)
        _recalc(p)

    details = dict(txn.match_details or {})
    details["payroll"] = {"warnings": r.warnings, "references": labels}
    txn.match_status = "auto_matched" if status == "auto" else "likely_matched"
    txn.match_confidence = r.confidence
    txn.transaction_category = r.category
    txn.matched_document_number = ", ".join(labels)[:100]
    txn.match_details = details
    txn.recalc_allocation_state(save=False)
    txn.save(update_fields=["match_status", "match_confidence", "transaction_category",
                            "matched_document_number", "match_details", "allocated_amount", "updated_at"])


@transaction.atomic
def detach_statement(statement):
    """Prieš pakartotinį susiejimą / išrašo trynimą: banko DU mokėjimai pašalinami, rankiniai grąžinami."""
    from docscanner_app.models import PaymentAllocation
    touched = set()
    allocs = PaymentAllocation.objects.filter(kind="payroll", outgoing_transaction__bank_statement=statement)
    for a in allocs.select_related("payroll_payment"):
        touched.add(a.payroll_payment_id)
        _drop_je(a)
        reasons = dict(a.match_reasons or {})
        if reasons.pop("converted_from_manual", False):
            acc = reasons.pop("manual_payment_account", "")
            a.outgoing_transaction, a.source = None, "manual"
            a.payment_account, a.needs_account, a.match_reasons = acc, not acc, {"manual": True}
            a.save()
            create_je(a)
        else:
            a.delete()
    from docscanner_app.models import PayrollPayment
    for p in PayrollPayment.objects.filter(id__in=touched):
        _recalc(p)
    return len(touched)


# ============================================================
# Sąrašas (UI)
# ============================================================

def payments_overview(company, y, m):
    from docscanner_app.models import PayrollPayment
    qs = (PayrollPayment.objects.filter(company=company, year=y, month=m).exclude(status="cancelled")
          .select_related("employee").prefetch_related("allocations__outgoing_transaction__bank_statement"))
    items = []
    for p in qs:
        allocs = []
        for a in p.allocations.all():
            t = a.outgoing_transaction
            allocs.append({
                "id": a.id, "status": a.status, "source": a.source, "amount": str(a.amount),
                "payment_date": a.effective_payment_date, "payment_account": a.payment_account,
                "needs_account": a.needs_account, "journal_entry_id": a.journal_entry_id,
                "confidence": str(a.confidence), "warnings": (a.match_reasons or {}).get("warnings", []),
                "reason": (a.match_reasons or {}).get("reason", ""),
                "transaction": {"id": t.id, "date": t.transaction_date, "amount": str(t.amount),
                                "counterparty_name": t.counterparty_name, "purpose": t.payment_purpose,
                                "bank": t.bank_statement.get_bank_name_display() if t.bank_statement_id else ""}
                if t else None,
            })
        items.append({
            "id": p.id, "kind": p.kind, "kind_display": p.get_kind_display(), "employee_id": p.employee_id,
            "recipient_name": p.recipient_name, "recipient_iban": p.recipient_iban, "imokos_kodas": p.imokos_kodas,
            "reference": p.reference, "purpose": p.purpose, "amount": str(p.amount),
            "paid_amount": str(p.paid_amount), "open_amount": str(p.open_amount), "due_date": p.due_date,
            "status": p.status, "status_display": p.get_status_display(), "allocations": allocs,
            "sent_at": p.sent_at, "batch_id": p.batch_id,
            "overdue": bool(p.due_date and p.due_date < timezone.localdate() and p.status != "paid"),
        })
    total = sum((Decimal(i["amount"]) for i in items), ZERO)
    paid = sum((Decimal(i["paid_amount"]) for i in items), ZERO)
    return {"year": y, "month": m, "items": items,
            "totals": {"amount": str(total), "paid": str(paid), "open": str(total - paid)}}


# ============================================================
# Mokėjimų failas bankui (pain.001)
# ============================================================

@transaction.atomic
def create_batch(company, user, ids, execution_date, debtor_iban):
    """Pasirinkti mokėjimai -> pain.001 failas. Grąžina (batch, klaidos)."""
    from docscanner_app.models import PayrollPayment, PayrollPaymentBatch
    from . import pain001

    debtor_iban = pain001.clean_iban(debtor_iban)
    entry = (company.bank_accounts_mapping or {}).get(debtor_iban)
    if not entry or not pain001.iban_valid(debtor_iban):
        raise ValueError("Pasirinkite įmonės banko sąskaitą su IBAN")
    if not company.company_code and company.entity_type != "iv":
        raise ValueError("Įmonės profilyje trūksta įmonės kodo")

    payments = list(PayrollPayment.objects.filter(company=company, id__in=ids)
                    .exclude(status__in=("paid", "cancelled")).select_related("employee"))
    items, errors, used = [], [], []
    for p in payments:
        amount = p.open_amount
        if amount <= 0:
            continue
        if p.kind in ("gpm", "sodra"):
            iban = pain001.authority_iban(p.kind, debtor_iban)
            code = pain001.VMI_CODE if p.kind == "gpm" else pain001.SODRA_CODE
        else:
            iban, code = p.recipient_iban or (p.employee.iban if p.employee_id else ""), ""
        if not pain001.iban_valid(iban):
            errors.append(f"{p.recipient_name}: {'nenurodyta' if not iban else 'neteisinga'} banko sąskaita (IBAN)")
            continue
        items.append({"end_to_end": p.reference, "amount": amount, "name": p.recipient_name, "iban": iban,
                      "kind": p.kind, "purpose": p.purpose, "imokos_kodas": p.imokos_kodas, "code": code})
        used.append((p, iban))
    if not items:
        raise ValueError("; ".join(errors) or "Nėra ką mokėti - pasirinkti mokėjimai jau sumokėti")

    now = timezone.now()
    msg_id = f"DU{company.id}-{now:%Y%m%d%H%M%S}"
    xml = pain001.build(msg_id, {"name": company.name, "iban": debtor_iban,
                                 "company_code": company.company_code or ""},
                        execution_date, items, created=timezone.localtime(now))
    batch = PayrollPaymentBatch.objects.create(
        company=company, created_by=user, msg_id=msg_id, debtor_iban=debtor_iban,
        debtor_account=entry.get("account", ""), execution_date=execution_date, count=len(items),
        total=sum((i["amount"] for i in items), ZERO), xml=xml,
    )
    for p, iban in used:
        p.batch, p.sent_at, p.recipient_iban = batch, now, iban
        if p.status == "open":
            p.status = "sent"
        p.save(update_fields=["batch", "sent_at", "recipient_iban", "status", "updated_at"])
    return batch, errors
