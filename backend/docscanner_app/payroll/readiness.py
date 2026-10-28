"""
DU eiga: grafikas (suminei apskaitai) -> tabelis -> atlyginimai -> patvirtinimas.

Taisyklės:
  * atlyginimai skaičiuojami tik kai mėnesio tabelis bent kartą patvirtintas;
  * tvirtinant tabelį išsaugomas jo „snapshot“ (kiekvieno darbuotojo dienos: kodas, valandos, papildomos val.);
  * jei po patvirtinimo tabelis pasikeitė (nauja liga iš S15, patvirtintas prašymas, grafiko pakeitimas,
    tabelio atidarymas ir taisymas) - DU neperskaičiuojamas, kol pakeitimai nepatvirtinti;
  * suminės apskaitos darbuotojams tabelio patvirtinti negalima be paskelbto mėnesio grafiko;
  * DU patvirtinti galima tik kai tabelis patvirtintas ir po to nepasikeitė.
"""
from django.utils import timezone


# ------------------------------------------------------------
# Snapshot ir pakeitimai
# ------------------------------------------------------------

def _day_sig(d):
    extra = ",".join(f"{k}:{v}" for k, v in sorted((d.get("extra") or {}).items()) if str(v) not in ("0", "0.00"))
    return f"{d.get('code', '')}|{d.get('hours', '')}|{extra}"


def snapshot_rows(rows):
    """timesheet_for() eilutės -> {employee_id: {"name", "days": {data: parašas}}}"""
    return {str(r["employee"]): {"name": r["employee_name"], "days": {d["date"]: _day_sig(d) for d in r["days"]}}
            for r in rows}


def take_snapshot(tm, rows):
    tm.approved_snapshot = snapshot_rows(rows)
    tm.approved_version = (tm.approved_version or 0) + 1


def timesheet_changes(tm, rows):
    """
    Kuo dabartinis tabelis skiriasi nuo paskutinio patvirtinto.
    -> [{employee, name, kind: changed|added|removed, dates: [...]}]
    Seniau (be snapshot) patvirtinti mėnesiai - [] (nėra su kuo lyginti).
    """
    snap = (getattr(tm, "approved_snapshot", None) or {}) if tm else {}
    if not snap:
        return []
    cur = snapshot_rows(rows)
    out = []
    for eid in sorted(set(snap) | set(cur), key=lambda x: (cur.get(x) or snap.get(x))["name"]):
        a, b = snap.get(eid), cur.get(eid)
        if a is None:
            out.append({"employee": int(eid), "name": b["name"], "kind": "added", "dates": []})
        elif b is None:
            out.append({"employee": int(eid), "name": a["name"], "kind": "removed", "dates": []})
        else:
            dates = sorted(k for k in set(a["days"]) | set(b["days"]) if a["days"].get(k) != b["days"].get(k))
            if dates:
                out.append({"employee": int(eid), "name": b["name"], "kind": "changed", "dates": dates})
    return out


# ------------------------------------------------------------
# Mėnesio būsena
# ------------------------------------------------------------

def _names(items, n=3):
    names = [x if isinstance(x, str) else x["name"] for x in items]
    return ", ".join(names[:n]) + (f" ir dar {len(names) - n}" if len(names) > n else "")


def readiness(company, year, month, rows=None):
    """
    -> {
      employees, summed,
      roster: {needed, missing: [vardai], stale},
      timesheet: {status, approved_at, version, approved_once, changes: [...]},
      can_calculate, can_approve, blockers: [tekstai]
    }
    """
    from docscanner_app.models import TimesheetMonth
    from . import services as S
    rows = S.timesheet_for(company, year, month) if rows is None else rows
    tm = TimesheetMonth.objects.filter(company=company, year=year, month=month).first()

    summed = [r for r in rows if r.get("summed")]
    missing = [r["employee_name"] for r in rows if r.get("needs_roster")]
    stale = False
    if summed:
        try:
            from .roster.repair import roster_stale_flag
            stale = bool(roster_stale_flag(company, year, month))
        except Exception:                                   # noqa: BLE001 - informacija nebūtina
            stale = False

    status = tm.status if tm else "draft"
    approved = status in ("approved", "locked")
    approved_once = bool(tm and ((getattr(tm, "approved_version", 0) or 0) > 0 or approved))
    changes = timesheet_changes(tm, rows) if approved_once else []

    open_from = approve_from(year, month)
    too_early = timezone.localdate() < open_from
    blockers = []
    if too_early and not approved_once:
        blockers.append(f"Mėnuo dar nesibaigė – tabelį patvirtinti bus galima nuo {open_from:%Y-%m-%d}")
    if missing:
        blockers.append(f"Nepaskelbtas darbo grafikas (suminė apskaita): {_names(missing)}")
    if not approved_once and not too_early:
        blockers.append("Mėnesio tabelis dar nepatvirtintas")
    elif changes:
        blockers.append(f"Tabelyje yra nepatvirtintų pakeitimų: {_names(changes)}")
    elif not approved:
        blockers.append("Tabelis atidarytas taisymui – patvirtinkite jį iš naujo")

    return {
        "employees": len(rows),
        "summed": len(summed),
        "roster": {"needed": bool(summed), "missing": missing, "stale": stale},
        "timesheet": {
            "status": status,
            "approved_at": tm.approved_at.isoformat() if tm and tm.approved_at else None,
            "version": getattr(tm, "approved_version", 0) if tm else 0,
            "approved_once": approved_once,
            "approve_from": open_from.isoformat(),
            "too_early": too_early,
            "changes": changes,
        },
        "can_calculate": approved_once and not changes,
        "can_approve": approved and not changes and not missing,
        "blockers": blockers,
    }


def calc_state(company, year, month):
    """
    Ar galima (per)skaičiuoti DU:
      ("not_approved", None) - tabelis dar nė karto nepatvirtintas -> rezultatų nėra;
      ("changes", tekstas)   - po patvirtinimo yra pakeitimų -> paliekami ankstesni rezultatai;
      ("ok", None).
    """
    r = readiness(company, year, month)
    if not r["timesheet"]["approved_once"]:
        return "not_approved", None
    if r["timesheet"]["changes"]:
        return "changes", _names(r["timesheet"]["changes"])
    return "ok", None


def approve_from(year, month):
    """
    Nuo kada galima tvirtinti mėnesio tabelį: paskutinė mėnesio darbo diena (ne savaitgalis, ne šventė).
    Anksčiau - ne: darbo laikas dar gali keistis (liga, prašymai, viršvalandžiai).
    Paskutinę darbo dieną leidžiama, nes dalis įmonių moka atlyginimą mėnesio pabaigoje.
    """
    from datetime import date, timedelta
    from .work_calendar import is_holiday
    d = (date(year + (month == 12), month % 12 + 1, 1)) - timedelta(days=1)
    while d.weekday() >= 5 or is_holiday(d):
        d -= timedelta(days=1)
    return d


def check_month_can_close(year, month):
    """Tvirtinant tabelį: mėnuo turi būti pasibaigęs (arba paskutinė jo darbo diena)."""
    d = approve_from(year, month)
    if timezone.localdate() < d:
        raise ValueError(f"Tabelį patvirtinti bus galima nuo {d:%Y-%m-%d} – mėnuo dar nesibaigė, darbo laikas dar gali keistis "
                         f"(liga, prašymai, viršvalandžiai)")


def check_roster_for_timesheet(company, year, month, rows=None):
    """Tvirtinant tabelį: suminės apskaitos darbuotojams būtinas paskelbtas grafikas."""
    from . import services as S
    rows = S.timesheet_for(company, year, month) if rows is None else rows
    missing = [r["employee_name"] for r in rows if r.get("needs_roster")]
    if missing:
        raise ValueError(f"Pirmiausia paskelbkite {year}-{month:02d} darbo grafiką – be jo neaišku, kiek valandų dirbo "
                         f"suminės apskaitos darbuotojai: {_names(missing)}")


# ------------------------------------------------------------
# Nuo kurio mėnesio DU skaičiuojamas DokSkenas
# ------------------------------------------------------------

def _migration_start(company):
    from docscanner_app.models import PayrollMigration
    mg = PayrollMigration.objects.filter(company=company, status="confirmed").only("du_start").first()
    return mg.du_start.replace(day=1) if mg and mg.du_start else None


def _guess_start(company):
    """Mėnuo, kai įvestas pirmasis darbuotojas, bet ne anksčiau nei prasideda pirmoji sutartis."""
    from datetime import date
    from django.db.models import Min
    from docscanner_app.models import Employee, EmploymentContract
    created = Employee.objects.filter(company=company).aggregate(m=Min("created_at"))["m"]
    if created is None:
        return None
    created = timezone.localtime(created).date() if hasattr(created, "tzinfo") else created
    first_contract = (EmploymentContract.objects.filter(employee__company=company).exclude(status="draft")
                      .aggregate(m=Min("start_date"))["m"])
    start = max(created, first_contract) if first_contract else created
    return date(start.year, start.month, 1)


def payroll_start(company, persist=True):
    """
    Pirmasis DU mėnuo DokSkenas (date, 1 d.):
      1) patvirtintas perėjimas iš kitos programos - jo du_start (keičiama tik per perėjimą);
      2) DU nustatymuose įrašyta „DU DokSkenas pradžia“ (PayrollSettings.du_start);
      3) kitaip - mėnuo, kai įvestas pirmasis darbuotojas (ne anksčiau nei pirmoji sutartis). Apskaičiuota reikšmė
         iškart įrašoma į nustatymus, kad vėliau nesikeistų (pvz. ištrynus bandomąjį darbuotoją).
    Skaitmenizavimo / išrašymo naudojimo pradžia čia nesvarbi. None - darbuotojų dar nėra.
    """
    mg = _migration_start(company)
    if mg:
        return mg
    from .services import _settings
    st = _settings(company)
    if getattr(st, "du_start", None):
        return st.du_start.replace(day=1)
    guess = _guess_start(company)
    if guess and persist:
        st.du_start = guess
        st.save(update_fields=["du_start"])
    return guess


def _months_between(a, b):
    """[a, b) mėnesiai kaip (y, m)."""
    out, y, m = [], a.year, a.month
    while (y, m) < (b.year, b.month):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def check_du_start_change(company, new):
    """
    Ar galima pakeisti „DU DokSkenas pradžią“ į `new` (date, bet kuri mėnesio diena).
    -> {"ok", "error", "skipped": [YYYY-MM] (taps „kita programa“), "added": [YYYY-MM] (taps DokSkenas mėnesiais)}
    """
    from docscanner_app.models import PayrollDeclaration, PayrollRun
    from .services import CLOSED_STATUSES
    new = new.replace(day=1)
    out = {"ok": True, "error": "", "skipped": [], "added": []}
    if _migration_start(company):
        out.update(ok=False, error="Pradžia nustatyta perkeliant duomenis iš kitos programos – ją keisti galima tik "
                                   "atidarius „Likučių perkėlimas“ iš naujo")
        return out
    cur = payroll_start(company, persist=False)
    if cur is None or new == cur:
        return out
    if new > cur:                                         # vėliau: ankstesni mėnesiai taps „kita programa“
        months = _months_between(cur, new)
        out["skipped"] = [f"{y}-{m:02d}" for y, m in months]
        closed = sorted({(r.year, r.month) for r in PayrollRun.objects.filter(company=company, status__in=CLOSED_STATUSES)
                         if (r.year, r.month) in set(months)})
        if closed:
            y, m = closed[0]
            out.update(ok=False, error=f"{y}-{m:02d} atlyginimai jau patvirtinti DokSkenas – pirmiausia juos atrakinkite")
            return out
        sent = (PayrollDeclaration.objects.filter(company=company, status__in=("submitted", "accepted"))
                .exclude(year__isnull=True).exclude(month__isnull=True))
        sent = sorted({(d.year, d.month, d.form) for d in sent if (d.year, d.month) in set(months)})
        if sent:
            y, m, f = sent[0]
            out.update(ok=False, error=f"{f} už {y}-{m:02d} jau pateikta iš DokSkenas – pradžios vėlinti negalima")
    else:                                                 # anksčiau: tie mėnesiai atsiras „Ką reikia padaryti“
        out["added"] = [f"{y}-{m:02d}" for y, m in _months_between(new, cur)]
    return out


def default_month(company):
    """
    Kurį mėnesį atidaryti „Atlyginimai“ / „Deklaravimas“: seniausias nuo DU pradžios iki šio mėnesio,
    kurio atlyginimai dar nepatvirtinti; jei visi patvirtinti - šis mėnuo.
    """
    from datetime import date
    from docscanner_app.models import PayrollRun
    from .services import CLOSED_STATUSES
    today = timezone.localdate()
    cur = date(today.year, today.month, 1)
    start = payroll_start(company) or cur
    if start > cur:
        return start
    closed = {(y, m) for y, m in PayrollRun.objects.filter(company=company, kind="regular", status__in=CLOSED_STATUSES)
              .values_list("year", "month")}
    y, m = start.year, start.month
    while (y, m) <= (cur.year, cur.month):
        if (y, m) not in closed:
            return date(y, m, 1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return cur
