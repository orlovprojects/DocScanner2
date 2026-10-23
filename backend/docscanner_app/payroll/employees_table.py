"""
Darbuotojų sąrašo lentelei: sutartis, darbo laikas, atlyginimas, atostogų likutis, kas šiandien,
eSavitarna ir ko trūksta. Skaičiuojama vienu kartu visam sąrašui (be N užklausų kiekvienam laukui).
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

ENDING_DAYS = 45          # terminuota sutartis baigiasi per tiek dienų - žymima
MANY_VACATION = Decimal("40")   # tiek ir daugiau nepanaudotų dienų - įspėjimas (DK: nepanaudotos - iki 3 metų)


def _years(since, today):
    days = (today - since).days
    if days < 365:
        m = max(days // 30, 0)
        return f"{m} mėn." if m else "naujas"
    return f"{days // 365} m."


def _terms_on(contract, d):
    ts = sorted(contract.terms.all(), key=lambda t: t.valid_from)
    cur = [t for t in ts if t.valid_from <= d]
    return cur[-1] if cur else (ts[0] if ts else None)


def _contract_for(employee, today):
    cs = [c for c in employee.contracts.all() if c.status != "draft"]
    active = [c for c in cs if c.start_date <= today and not (c.termination_date and c.termination_date < today)]
    pool = active or cs
    return max(pool, key=lambda c: c.start_date) if pool else None


def employees_table(company, employees):
    """{employee_id: {...}} - papildomi laukai lentelei."""
    from docscanner_app.models import AbsenceEvent, BusinessTrip, EmployeeAccountToken
    from .services import vacation_for
    today = timezone.localdate()
    ids = [e.id for e in employees]
    now_abs = {}
    for ev in (AbsenceEvent.objects.filter(employee_id__in=ids, status="approved", start_date__lte=today, end_date__gte=today)
               .order_by("start_date")):
        now_abs.setdefault(ev.employee_id, ev)
    invites = {}
    for t in (EmployeeAccountToken.objects.filter(employee_id__in=ids, kind="invite").order_by("created_at")):
        invites[t.employee_id] = t                                   # paskutinis kvietimas
    out = {}
    for e in employees:
        c = _contract_for(e, today)
        t = _terms_on(c, today) if c else None
        warn = []
        row = {"contract": None, "work": None, "pay": None, "vacation": None, "position_group": "", "today": None}

        # --- pareigos ir SDUP grupė
        pos = t.position if t and t.position_id else None
        grp = getattr(pos, "group", None) if pos else None
        row["position_group"] = (getattr(grp, "code", "") or getattr(grp, "name", "")) if grp else ""
        if pos and not grp:
            warn.append("Pareigybei nepriskirta SDUP grupė")

        # --- sutartis
        if c:
            fixed = bool(getattr(c, "is_fixed_term", False))
            end = c.termination_date or (c.end_date if fixed else None)
            ending = bool(end and today <= end <= today + timedelta(days=ENDING_DAYS))
            since = getattr(c, "seniority_since", None) or c.start_date
            row["contract"] = {"type": c.get_sodra_contract_type_display() if hasattr(c, "get_sodra_contract_type_display") else "",
                               "fixed": fixed, "end": end.isoformat() if end else None, "ending": ending,
                               "terminated": bool(c.termination_date and c.termination_date < today),
                               "start": c.start_date.isoformat(), "seniority": _years(since, today)}
            if ending:
                warn.append(f"Sutartis baigiasi {end:%Y-%m-%d}")
        else:
            warn.append("Nėra darbo sutarties")

        # --- darbo laikas ir atlyginimas
        if t:
            row["work"] = {"workload": str(t.workload.normalize() if isinstance(t.workload, Decimal) else t.workload),
                           "regime": "summed" if getattr(t, "work_regime", "standard") == "summed" else "standard"}
            row["pay"] = {"amount": str(t.base_amount), "form": t.pay_form}

        # --- atostogų likutis
        try:
            b = vacation_for(e, today, c) if c else None
        except Exception:                                            # noqa: BLE001  sąrašas neturi lūžti
            b = None
        if b is not None:
            bal = Decimal(str(b.balance)).quantize(Decimal("0.01"))
            row["vacation"] = {"balance": str(bal), "level": "neg" if bal < 0 else "many" if bal >= MANY_VACATION else "ok"}

        # --- šiandien
        ev = now_abs.get(e.id)
        if ev:
            note = ""
            if ev.kind == "business_trip":                      # kur išvykęs - iš komandiruotės valstybių
                trip = BusinessTrip.objects.filter(absence_event=ev).first()
                if trip:
                    note = trip.destination or ", ".join(dict.fromkeys(
                        str(l.get("country", "")).replace(" Respublika", "").replace(" Federacinė", "")
                        for l in (trip.legs or []) if l.get("country") and l.get("country") != "Lietuvos Respublika"))
            row["today"] = {"kind": ev.kind, "label": ev.get_kind_display(), "until": ev.end_date.isoformat(), "note": note}
        elif e.status == "active" and c and c.start_date > today:
            row["today"] = {"kind": "starts", "label": "Pradės dirbti", "until": c.start_date.isoformat(), "note": ""}

        # --- eSavitarna
        acc = getattr(e, "account", None)
        inv = invites.get(e.id)
        if acc is not None and acc.password and acc.last_login:
            row["savitarna"] = {"status": "active", "last_login": acc.last_login}
        elif inv is not None or acc is not None:
            expired = bool(inv and inv.expires_at < timezone.now() and not inv.used_at)
            row["savitarna"] = {"status": "expired" if expired else "invited",
                                "invited_at": inv.created_at if inv else None, "expires_at": inv.expires_at if inv else None}
        else:
            row["savitarna"] = {"status": "none"}

        # --- ko trūksta
        if not (getattr(e, "iban", "") or "").strip():
            warn.append("Nenurodyta banko sąskaita (IBAN)")
        if getattr(e, "data_status", "") == "awaiting_employee":
            warn.append("Laukiama darbuotojo duomenų")
        if not (e.personal_code or getattr(e, "foreign_code", "")):
            warn.append("Nenurodytas asmens kodas")
        row["warnings"] = warn
        out[e.id] = row
    return out


# ============================================================
# Kur darbuotojo duomenys jau pateikti (keičiant asmens kodą reikės tikslinti)
# ============================================================
DONE = ("submitted", "accepted")
FORM_LABELS = {"1-SD": "1-SD (priėmimas)", "2-SD": "2-SD (atleidimas)", "SAM": "SAM", "GPM313": "GPM313"}


def reported_forms(employee):
    """
    -> [{form, label, period, submitted_at}] - pateiktos (submitted / accepted) Sodros ir VMI ataskaitos,
    kuriose yra šis darbuotojas: 1-SD / 2-SD pagal sutartį, SAM / GPM313 - mėnesiai, kai jis dirbo.
    """
    from docscanner_app.models import PayrollDeclaration
    contracts = [c for c in employee.contracts.all() if c.status != "draft"]
    if not contracts:
        return []
    out = []

    def add(d, period):
        out.append({"form": d.form, "label": FORM_LABELS.get(d.form, d.form), "period": period,
                    "submitted_at": d.submitted_at.date().isoformat() if d.submitted_at else ""})

    for d in PayrollDeclaration.objects.filter(contract__in=contracts, status__in=DONE).order_by("submitted_at"):
        add(d, d.submitted_at.date().isoformat() if d.submitted_at else "")

    start = min(c.start_date for c in contracts)
    ends = [c.termination_date or c.end_date for c in contracts]
    end = None if any(e is None for e in ends) else max(ends)
    monthly = (PayrollDeclaration.objects
               .filter(company=employee.company, form__in=("SAM", "GPM313"), status__in=DONE, contract__isnull=True)
               .exclude(year__isnull=True).exclude(month__isnull=True).order_by("year", "month", "form"))
    for d in monthly:
        if (d.year, d.month) < (start.year, start.month) or (end and (d.year, d.month) > (end.year, end.month)):
            continue
        add(d, f"{d.year}-{d.month:02d}")
    return out
