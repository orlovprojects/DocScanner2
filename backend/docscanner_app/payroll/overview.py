"""
DU apžvalga: „Ką reikia padaryti“, artimiausi terminai, grafiko pageidavimai ir prašymo peržiūra buhalteriui.
Tik svarbiausia - be statistikos.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

MONTH_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo",
             "spalio", "lapkričio", "gruodžio"]
MONTH_NOM = ["Sausio", "Vasario", "Kovo", "Balandžio", "Gegužės", "Birželio", "Liepos", "Rugpjūčio", "Rugsėjo",
             "Spalio", "Lapkričio", "Gruodžio"]
DONE_DECL = ("submitted", "accepted")
ORDER = {"late": 0, "warn": 1, "todo": 2, "done": 3}


def _shift(y, m, d):
    x = y * 12 + (m - 1) + d
    return x // 12, x % 12 + 1


def _ym(y, m):
    return f"{y}-{m:02d}"


def _d(v):
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def employee_position(employee):
    """Dabartinės pareigos (paskutinės sutarties paskutinės sąlygos)."""
    c = employee.contracts.exclude(status="draft").order_by("-start_date").first()
    t = c.terms.order_by("-valid_from").select_related("position").first() if c else None
    return t.position.name if t and t.position_id else ""


def _count(n, one, few, many):
    """1 pamaina, 2 pamainos, 10 pamainų."""
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} {one}"
    if 2 <= n % 10 <= 9 and not 11 <= n % 100 <= 19:
        return f"{n} {few}"
    return f"{n} {many}"


def _item(status, icon, title, sub="", label="", to="", key=None):
    return {"key": key or title, "status": status, "icon": icon, "title": title, "sub": sub,
            "action": {"label": label, "to": to} if label else None}


# ============================================================
# Ką reikia padaryti + terminai
# ============================================================

def _rosters(company, today, todo, deadlines):
    from docscanner_app.models import Roster
    from .roster.services import _bounds, summed_employees
    for y, m in (_shift(today.year, today.month, 0), _shift(today.year, today.month, 1)):
        first, last = _bounds(y, m)
        if not summed_employees(company, first, last):
            continue
        r = Roster.objects.filter(company=company, year=y, month=m).first()
        due = first - timedelta(days=7)
        to = f"/grafikai-ir-tabeliai?m={_ym(y, m)}"
        if r and r.version >= 1:
            todo.append(_item("done", "roster", f"{MONTH_NOM[m - 1]} grafikas paskelbtas", key=f"roster-{y}-{m}"))
            continue
        late = today > due
        todo.append(_item("late" if late else "todo", "roster", f"Paskelbti {MONTH_GEN[m - 1]} grafiką",
                          f"Terminas buvo {due:%m-%d} (DK 115 str.)" if late else f"Iki {due:%m-%d} (DK 115 str.)",
                          "Grafikas", to, key=f"roster-{y}-{m}"))
        deadlines.append({"date": due, "title": f"{MONTH_NOM[m - 1]} grafiko paskelbimas",
                          "sub": "Likus 7 d. iki mėnesio", "authority": "DK", "to": to})
    from .roster.repair import affected_rosters
    for x in affected_rosters(company):
        y, m = int(x["ym"][:4]), int(x["ym"][5:])
        todo.append(_item("warn", "repair", f"{MONTH_NOM[m - 1]} grafikas nebeatitinka duomenų",
                          "Pasikeitė nebuvimai – pataisykite pamainas", "Pataisyti",
                          f"/grafikai-ir-tabeliai?m={x['ym']}", key=f"stale-{x['ym']}"))


def _timesheet(company, py, pm, todo):
    from docscanner_app.models import TimesheetMonth
    tm = TimesheetMonth.objects.filter(company=company, year=py, month=pm).first()
    to = f"/grafikai-ir-tabeliai/tabelis?m={_ym(py, pm)}"
    if tm and tm.status in ("approved", "locked"):
        todo.append(_item("done", "timesheet", f"{MONTH_NOM[pm - 1]} tabelis patvirtintas", key="timesheet"))
    else:
        todo.append(_item("todo", "timesheet", f"Patvirtinti {MONTH_GEN[pm - 1]} tabelį",
                          "Prieš skaičiuojant atlyginimus", "Tabelis", to, key="timesheet"))


def _requests(company, today, todo):
    from docscanner_app.models import EmployeeRequest
    qs = EmployeeRequest.objects.filter(employee__company=company, status="pending").order_by("created_at")
    n = qs.count()
    if not n:
        return
    oldest = qs.first()
    days = (today - timezone.localtime(oldest.created_at).date()).days
    late_info = any(r.kind == "pay_info" and _shift(r.created_at.year, r.created_at.month, 2) < (today.year, today.month)
                    for r in qs)
    sub = "Seniausias – šiandien" if days <= 0 else f"Seniausias – prieš {days} d."
    todo.append(_item("late" if late_info else "todo", "requests", f"Išnagrinėti prašymus ({n})",
                      "Vėluojama atsakyti į prašymą dėl DU informacijos" if late_info else sub,
                      "Prašymai", "#requests", key="requests"))


def _payroll(company, today, py, pm, todo, deadlines):
    from docscanner_app.models import PayrollRun
    from .payments import payments_overview
    run = PayrollRun.objects.filter(company=company, year=py, month=pm, kind="regular").order_by("-created_at").first()
    to = "/darbo-uzmokestis/atlyginimai"
    gen = MONTH_GEN[pm - 1]
    if run is None or run.status in ("draft", "checked"):
        todo.append(_item("todo", "payroll", f"{'Apskaičiuoti' if run is None else 'Patvirtinti'} {gen} atlyginimus",
                          "Po tabelio patvirtinimo" if run is None else "Apskaičiuota – peržiūrėkite ir patvirtinkite",
                          "Atlyginimai", to, key="payroll"))
        return
    if run.status in ("paid", "closed"):
        todo.append(_item("done", "payroll", f"{MONTH_NOM[pm - 1]} atlyginimai išmokėti", key="payroll"))
        return
    pay = payments_overview(company, py, pm)
    open_items = [i for i in pay["items"] if Decimal(i["open_amount"]) > 0]
    if not open_items:
        todo.append(_item("done", "payroll", f"{MONTH_NOM[pm - 1]} atlyginimai išmokėti", key="payroll"))
        return
    due = min((_d(i["due_date"]) for i in open_items if i["due_date"]), default=None)
    late = bool(due and due < today)
    amount = sum((Decimal(i["open_amount"]) for i in open_items), Decimal("0"))
    todo.append(_item("late" if late else "todo", "payments", f"Išmokėti {gen} atlyginimus",
                      f"Liko {amount:,.2f} € · {len(open_items)} mokėj.".replace(",", " ").replace(".", ",")
                      + (f" · terminas buvo {due:%m-%d}" if late else (f" · iki {due:%m-%d}" if due else "")),
                      "Išmokėti", to, key="payments"))
    if due:
        deadlines.append({"date": due, "title": "Atlyginimų išmokėjimas", "sub": f"{MONTH_NOM[pm - 1]} DU",
                          "authority": "Bankas", "to": to})


def _declarations(company, today, months, todo, deadlines):
    from .services import declarations_overview
    seen = set()
    for y, m in months:
        try:
            items = declarations_overview(company, y, m)
        except Exception:                                        # noqa: BLE001  apžvalga neturi lūžti
            continue
        for it in items:
            k = (it.get("form"), it.get("title"))
            if k in seen or it.get("previous_system"):
                continue
            seen.add(k)
            dl = _d(it.get("deadline"))
            st = (it.get("declaration") or {}).get("status")
            if dl is None or st in DONE_DECL:
                continue
            label = (it.get("declaration") or {}).get("status_label") or "Neparuošta"
            deadlines.append({"date": dl, "title": it.get("title"), "sub": label, "authority": it.get("authority", ""),
                              "to": "/deklaravimas"})
            if dl < today:
                todo.append(_item("late", "declaration", f"Pateikti {it.get('title')}", f"Terminas buvo {dl:%m-%d}",
                                  "Pateikti", "/deklaravimas", key=f"decl-{k}"))
            elif (dl - today).days <= 5:
                todo.append(_item("todo", "declaration", f"Pateikti {it.get('title')}", f"Iki {dl:%m-%d} · {label.lower()}",
                                  "Pateikti", "/deklaravimas", key=f"decl-{k}"))


def _preferences(company, today):
    from docscanner_app.models import ShiftPreference
    out, pos = [], {}
    for p in (ShiftPreference.objects.filter(employee__company=company, date__gte=today)
              .select_related("employee", "shift_type").order_by("date")[:200]):
        if p.employee_id not in pos:
            pos[p.employee_id] = employee_position(p.employee)
        out.append({"id": p.id, "employee_id": p.employee_id, "employee_name": p.employee.full_name,
                    "employee_position": pos[p.employee_id],
                    "kind": p.kind, "kind_label": p.get_kind_display(), "date": p.date.isoformat(),
                    "shift": p.shift_type.code if p.shift_type_id else "", "comment": p.comment,
                    "source": p.source, "created_at": p.created_at})
    return out


def overview(company):
    today = timezone.localdate()
    py, pm = _shift(today.year, today.month, -1)
    todo, deadlines = [], []
    for fn in (lambda: _rosters(company, today, todo, deadlines),
               lambda: _timesheet(company, py, pm, todo),
               lambda: _requests(company, today, todo),
               lambda: _payroll(company, today, py, pm, todo, deadlines),
               lambda: _declarations(company, today, [(py, pm), (today.year, today.month)], todo, deadlines)):
        try:
            fn()
        except Exception:                                        # noqa: BLE001  viena dalis neturi sugadinti visos apžvalgos
            import logging
            logging.getLogger("docscanner_app").exception("Payroll overview part failed: company=%s", company.id)
    todo.sort(key=lambda x: ORDER[x["status"]])
    deadlines.sort(key=lambda x: x["date"])
    for x in deadlines:
        x["days_left"] = (x["date"] - today).days
        x["date"] = x["date"].isoformat()
    return {"today": today.isoformat(), "payroll_month": _ym(py, pm), "todo": todo, "deadlines": deadlines[:6],
            "preferences": _preferences(company, today)}


# ============================================================
# Prašymo peržiūra buhalteriui
# ============================================================

def _fmt(a, b):
    return f"{a:%Y-%m-%d}" if a == b else f"{a:%Y-%m-%d} – {b:%m-%d}"


def request_review(req):
    """Faktai ir patikrinimai peržiūros lange: likutis, nebuvimai, grafikas, patvirtinti atlyginimai."""
    from docscanner_app.models import AbsenceEvent, PayrollRun, RosterShift
    from .services import CLOSED_STATUSES, vacation_for
    e = req.employee
    facts, checks = [], []
    wd = Decimal(str(req.work_days or 0))
    if req.kind == "pay_info":
        y, m = _shift(req.created_at.year, req.created_at.month, 2)
        facts.append(["Atsakyti iki", f"{y}-{m:02d}-{min(req.created_at.day, 28):02d}"])
    elif req.kind == "dismissal":
        facts.append(["Paskutinė darbo diena", f"{req.end_date:%Y-%m-%d}"])
        try:
            from .requests_logic import DISMISSAL_NOTICE_DAYS
            notice = (req.end_date - timezone.localtime(req.created_at).date()).days
            if notice < DISMISSAL_NOTICE_DAYS:
                checks.append({"level": "warn", "text": f"Įspėta prieš {notice} d. (DK – {DISMISSAL_NOTICE_DAYS} d.). "
                                                        "Ankstesnė data – tik susitarus."})
        except ImportError:
            pass
        checks.append({"level": "info", "text": "Patvirtinus bus nustatyta sutarties pabaiga – nepamirškite 2-SD ir "
                                                "galutinio atsiskaitymo."})
    else:
        facts.append(["Laikotarpis", _fmt(req.start_date, req.end_date)])
        if wd:
            facts.append(["Darbo dienų", f"{wd.normalize():f}".replace(".", ",")])
    if getattr(req, "child", None):
        c = req.child
        facts.append(["Vaikas", f"{c.first_name or 'Vaikas'} (gim. {c.birth_date:%Y-%m-%d})"])

    if req.kind == "vacation":
        b = vacation_for(e, req.start_date)
        if b is not None:
            before = Decimal(str(b.balance)).quantize(Decimal("0.01"))
            after = before - wd
            facts.append(["Atostogų likutis", f"{before:f} → {after:f} d.".replace(".", ",")])
            checks.append({"level": "ok", "text": "Atostogų likučio pakanka"} if after >= 0 else
                          {"level": "warn", "text": f"Likučio nepakanka – trūksta {(-after):f} d. (avansu)".replace(".", ",")})

    if req.kind not in ("pay_info", "dismissal"):
        for ev in AbsenceEvent.objects.filter(employee=e, status="approved", start_date__lte=req.end_date,
                                              end_date__gte=req.start_date):
            checks.append({"level": "warn", "text": f"Tomis dienomis jau yra: {ev.get_kind_display().lower()} "
                                                    f"{_fmt(ev.start_date, ev.end_date)}"})
        shifts = list(RosterShift.objects.filter(employee=e, date__gte=req.start_date, date__lte=req.end_date)
                      .select_related("roster").order_by("date"))
        if shifts:
            pub = [s for s in shifts if s.roster.version >= 1]
            dates = ", ".join(f"{s.date:%m-%d}" for s in (pub or shifts)[:8])
            if pub:
                checks.append({"level": "warn", "text":
                               f"Šiomis dienomis darbuotojas pagal paskelbtą grafiką turi dirbti: "
                               f"{_count(len(pub), 'pamaina', 'pamainos', 'pamainų')} ({dates}). Patvirtinus prašymą "
                               "šios pamainos liks be darbuotojo – grafike pasiūlysime, kas galėtų jį pakeisti."})
            else:
                checks.append({"level": "info", "text":
                               f"Grafiko juodraštyje šiomis dienomis suplanuota "
                               f"{_count(len(shifts), 'pamaina', 'pamainos', 'pamainų')} ({dates}). Patvirtinus jos bus "
                               "pašalintos automatiškai – grafiko dar niekas nematė."})
        months = {(req.start_date.year, req.start_date.month), (req.end_date.year, req.end_date.month)}
        for y, m in sorted(months):
            if PayrollRun.objects.filter(company=e.company, year=y, month=m, status__in=CLOSED_STATUSES).exists():
                checks.append({"level": "warn", "text": f"{y}-{m:02d} atlyginimai jau patvirtinti – teks perskaičiuoti."})
    return {"id": req.id, "html": req.html or "", "facts": facts, "checks": checks,
            "employee_position": employee_position(e),
            "has_attachment": bool(getattr(req, "attachment", None)), "created_at": req.created_at}
