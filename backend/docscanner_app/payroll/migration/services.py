"""
DU perėjimas iš kitos programos (Django dalis).

Analizė:   įkelti .ffdata -> reconstruct.build -> PayrollMigrationEmployee (išsaugant rankinius pakeitimus)
Tvirtinimas: darbuotojai + sutartys, PayrollHistoryMonth, atostogų likučiai, neišmokėtos sumos (įsipareigojimai),
           DK: tarpiniai mėnesiai (jei apskaita DokSkenas anksčiau), 4480 perskirstymas arba pradinis DU įrašas.
"""
import hashlib
import re
import logging
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from . import ffparse
from .reconstruct import build

logger = logging.getLogger("docscanner_app")
ZERO = Decimal("0")
DK_ENABLED = False                       # DK įrašai perėjimui (tarpiniai mėnesiai, 4480 likučiai) - kai bus pilna apskaita
EMPLOYEE_RATE = Decimal("19.50")         # 2026: VSD 12,52 + PSD 6,98 (darbuotojo dalis)
PENSION_RATE = Decimal("3.00")
EDITABLE = ("lpk_code", "position_name", "base_amount", "vacation_balance", "unpaid_amount", "include",
            "npd_mode", "pension", "start_date", "end_date", "contract_type", "employed", "pay_form", "weekly_hours",
            "annual_leave_days", "work_regime", "single_parent", "iban", "email", "phone", "first_name", "last_name",
            "work_time_mode", "lpk4", "has_disability", "vdu_override", "children", "summed_period_months",
            "summed_period_start", "summed_worked_hours", "summed_absence_hours", "summed_paid_overtime",
            "transition_state", "transition_until", "vacation_prepaid_amount", "pay_once_a_month", "advance_amount",
            "gpm_ytd", "transition_from", "week_hours", "birth_date", "gender")
DECIMAL_FIELDS = ("base_amount", "vacation_balance", "unpaid_amount", "weekly_hours", "vdu_override",
                  "summed_worked_hours", "summed_absence_hours", "summed_paid_overtime", "vacation_prepaid_amount",
                  "advance_amount", "gpm_ytd")
DATE_FIELDS = ("start_date", "end_date", "summed_period_start", "transition_until", "transition_from", "birth_date")
SD_RE = re.compile(r"^([A-Z]{2})\s?(\d{7})$")          # užsieniečio Sodros socialinio draudimo numeris, pvz. AB1234567


def foreign_key(sd):
    """Užsieniečio identifikatorius perėjime (vietoj asmens kodo): „SD“ + SD numeris (11 simbolių)."""
    mm = SD_RE.match(str(sd or "").strip().upper())
    return f"SD{mm.group(1)}{mm.group(2)}" if mm else None


def is_foreign_key(code):
    return str(code or "").startswith("SD")


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def check_email(v):
    v = str(v or "").strip().lower()
    if v and not EMAIL_RE.match(v):
        raise ValueError(f"Neteisingas el. pašto adresas „{v}“")
    return v


def check_phone(v):
    v = re.sub(r"[\s\-()]", "", str(v or ""))
    if v and not re.match(r"^\+?\d{8,15}$", v):
        raise ValueError(f"Neteisingas telefono numeris „{v}“")
    return v


def _clean_week(v):
    """[7 skaičiai] -> [Decimal x7] arba None."""
    if v in (None, "", []):
        return None
    if isinstance(v, str):
        v = re.split(r"[;,\s]+", v.strip())
    vals = [Decimal(str(x).replace(",", ".")) if str(x).strip() not in ("", "None") else Decimal("0") for x in v]
    if len(vals) != 7 or any(x < 0 or x > 24 for x in vals):
        raise ValueError("Savaitės grafikas: 7 dienų valandos (Pr–S), kiekviena 0–24")
    return vals if sum(vals) > 0 else None


def _q(v):
    return Decimal(v).quantize(Decimal("0.01"))


def _month_add(y, m, k):
    i = y * 12 + (m - 1) + k
    return i // 12, i % 12 + 1


def get_or_create(company, user=None):
    from docscanner_app.models import OpeningBalanceBatch, PayrollMigration
    m = PayrollMigration.objects.filter(company=company).first()
    if m:
        return m
    acct = OpeningBalanceBatch.objects.filter(company_profile=company).first()
    start = acct.cutover_date.replace(day=1) if acct else timezone.localdate().replace(day=1)
    return PayrollMigration.objects.create(company=company, du_start=start, created_by=user, mode="full")


def _editable(m):
    if m.status == "confirmed":
        raise ValueError("Perėjimas jau patvirtintas - pirmiausia atšaukite")


def set_mode(m, mode):
    """"sdup" - tik SDUP / DAS pasiruošimas; "full" - pilnas DU perėjimas (duomenys išlieka)."""
    if mode not in ("sdup", "full"):
        raise ValueError("Neteisingas režimas")
    if m.status == "confirmed":
        raise ValueError("Pilnas DU perėjimas jau patvirtintas")
    m.mode = mode
    if m.status == "sdup_ready" and mode == "full":
        m.status = "draft"                       # tęsiama toliau - darbuotojai ir grupės jau sukurti
    m.save(update_fields=["mode", "status", "updated_at"])
    return analyze(m)


@transaction.atomic
def confirm_sdup(m, user):
    """SDUP / DAS pasiruošimas: darbuotojai, sutartys, pareigos, pareigybių grupės ir algų ribos (be istorijos, be DK)."""
    from ..services import auto_create_groups, refresh_auto_ranges
    if m.status == "confirmed":
        raise ValueError("Pilnas DU perėjimas jau patvirtintas")
    people = list(m.people.filter(include=True, employed=True))
    if not people:
        raise ValueError("Nėra dirbančių darbuotojų - įkelkite Sodros S29 ir S50")
    missing = [f"{p.first_name} {p.last_name}" for p in people if not (p.person_code and p.first_name and p.last_name)]
    if missing:
        raise ValueError("Trūksta vardo, pavardės ar asmens kodo: " + ", ".join(missing[:10]))
    if m.mode == "sdup":
        no_prof = [f"{p.first_name} {p.last_name}" for p in people if not p.lpk_code]
        if no_prof:
            raise ValueError("Pasirinkite profesiją: " + ", ".join(no_prof[:10]))
    r = _reconstruct(m)
    added = []
    for p in people:
        is_new = p.employee_id is None
        p.employee = _employee_for(m, p)
        p.save(update_fields=["employee"])
        if is_new:
            added.append(p.employee_id)
    # išėję (nebėra naujausiame S29) - atleidžiami
    gone_on = r.s29_date or timezone.localdate()
    dismissed = []
    for p in m.people.filter(employed=False, employee__isnull=False, employee__status="active").select_related("employee"):
        e = p.employee
        e.status = "dismissed"
        e.save(update_fields=["status", "updated_at"])
        e.contracts.filter(status="active").update(status="terminated", termination_date=p.end_date or gone_on)
        dismissed.append(e.full_name)
    created = auto_create_groups(m.company)
    refresh_auto_ranges(m.company)
    m.status = "sdup_ready"
    summ = dict(m.summary or {})
    summ["last_update"] = {"added": added, "dismissed": dismissed, "at": timezone.now().isoformat()}
    m.summary = summ
    m.save(update_fields=["status", "summary", "updated_at"])
    return created


def sodra_entries(m, only_new=True):
    """Ką įvesti Sodros EDAS SDUP formoje: grupė, darbo laiko norma, režimas (D1-D3)."""
    from docscanner_app.models import Employee
    ids = (m.summary or {}).get("last_update", {}).get("added", []) if only_new else \
        list(m.people.filter(employed=True, employee__isnull=False).values_list("employee_id", flat=True))
    out = []
    for e in Employee.objects.filter(id__in=ids).prefetch_related("contracts__terms__position__group"):
        info = _sdup_terms(e)
        info.pop("contract", None)
        out.append({"employee": e.full_name, **info})
    return sorted(out, key=lambda x: x["employee"])


def _sdup_terms(e, on=None):
    from ..services import terms_week
    c = next((c for c in e.contracts.all() if c.status == "active"), None) or next(iter(e.contracts.all()), None)
    terms = max(list(c.terms.all()), key=lambda t: t.valid_from, default=None) if c else None
    weekly = (sum(terms_week(terms), Decimal("0")) * terms.workload) if terms else Decimal("40")
    group = terms.position.group.code if terms and terms.position and terms.position.group else ""
    mode = (c.work_time_mode if c and c.work_time_mode else "01")
    if terms and terms.work_regime == "summed":
        mode = "02"
    return {"group": group, "weekly_hours": str(weekly.quantize(Decimal("0.01"))), "work_time_mode": mode,
            "contract": c}


# ============================================================
# Tik SDUP: mėnesio SDUP iš S50 (+ S15 / S5) su bukalterio patikrinimu
# ============================================================

def _workdays(a, b):
    from ..work_calendar import is_holiday
    n, d = 0, a
    while d <= b:
        if d.weekday() < 5 and not is_holiday(d):
            n += 1
        d += timedelta(days=1)
    return n


def sdup_month_rows(m, y, mo):
    """Mėnesio eilutės: D4 iš S50, D5 = 0, D6 = norma - liga (S15) - nedraudžiamieji (S5). + įspėjimai"""
    from ..services import month_bounds
    r = _reconstruct(m)
    first, last = month_bounds(y, mo)
    rows = []
    for p in m.people.filter(include=True, employee__isnull=False).select_related("employee"):
        e = p.employee
        end_date = p.end_date
        if m.mode == "sdup" and p.employed:
            end_date = None                     # dirba (pažymėta 2 žingsnyje) - seni atleidimai neįskaitomi
        if m.mode == "sdup" and not p.employed and not (end_date and end_date >= first):
            continue
        start = max(first, p.start_date or first)
        end = min(last, end_date or last)
        if end < start:
            continue
        info = _sdup_terms(e)
        info.pop("contract", None)
        hist = r.employees.get(p.person_code)
        income = hist.income.get((y, mo)) if hist else None
        weekly = Decimal(info["weekly_hours"])
        per_day = weekly / 5
        work = _workdays(start, end)
        off = 0
        for c in r.s15:
            if c["person"].code == p.person_code:
                off += _workdays(max(c["start"], start), min(c["end"], end)) if c["end"] >= start and c["start"] <= end else 0
        for (form, a, b, _) in (hist.absences if hist else []):
            if form == "12-SD" and a and b and b >= start and a <= end:
                off += _workdays(max(a, start), min(b, end))
        hours = max(Decimal("0"), per_day * (work - off)).quantize(Decimal("0.01"))
        flags = []
        if income is None:
            flags.append("Nėra S50 duomenų už šį mėnesį – įkelkite naujesnį S50 arba įveskite bruto")
        if hist and (y, mo) in hist.sd2_months:
            flags.append("Atleidimo mėnuo – iš bruto atimkite kompensaciją už nepanaudotas atostogas ir išeitinę")
        prev = [v for (yy, mm), v in sorted(hist.income.items()) if (yy, mm) < (y, mo) and v > 0][-3:] if hist else []
        if income and prev:
            med = sorted(prev)[len(prev) // 2]
            if med and abs(income - med) / med > Decimal("0.25"):
                flags.append(f"Suma skiriasi nuo įprastos ({med} €) – jei buvo premija ar viršvalandžiai, įrašykite juos į papildomą DU; "
                             "jei materialinė pašalpa ar kompensacija – atimkite iš bruto")
        if off:
            flags.append(f"Atimta {off} d. ligos / nedraudžiamųjų laikotarpių")
        rows.append({
            "employee_id": e.id, "employee": e.full_name, "group": info["group"], "weekly_hours": info["weekly_hours"],
            "work_time_mode": info["work_time_mode"], "brutto": str(income) if income is not None else "",
            "extra": "0.00", "hours": str(hours), "flags": flags,
        })
    return sorted(rows, key=lambda x: x["employee"]), r.insurer_code


@transaction.atomic
def sdup_month_build(m, y, mo):
    """Paruošia (arba perskaičiuoja) mėnesio eilutes ir išsaugo SDUP deklaracijos juodraštyje."""
    from docscanner_app.models import PayrollDeclaration
    from ..services import sdup_deadline
    rows, insurer = sdup_month_rows(m, y, mo)
    d, _ = PayrollDeclaration.objects.update_or_create(
        company=m.company, form="SDUP", year=y, month=mo, contract=None,
        defaults={"status": "draft", "deadline": sdup_deadline(y, mo), "errors": [], "content": "",
                  "meta": {"source": "s50", "rows": rows, "insurer": insurer}})
    return d


def sdup_month_save(m, y, mo, rows_patch):
    """Bukalterio pataisos: [{employee_id, brutto?, extra?, hours?}]"""
    from docscanner_app.models import PayrollDeclaration
    d = PayrollDeclaration.objects.get(company=m.company, form="SDUP", year=y, month=mo)
    meta = dict(d.meta or {})
    by_id = {r["employee_id"]: r for r in meta.get("rows", [])}
    for patch in rows_patch or []:
        row = by_id.get(int(patch.get("employee_id", 0)))
        if row:
            for k in ("brutto", "extra", "hours"):
                if k in patch:
                    row[k] = str(patch[k]).replace(",", ".")
    meta["rows"] = list(by_id.values())
    d.meta, d.status, d.content = meta, "draft", ""
    d.save(update_fields=["meta", "status", "content", "updated_at"])
    return d


def sdup_month_generate(m, y, mo):
    """JSON iš patikrintų eilučių (validuojama pagal Sodros schemą)."""
    import json
    from docscanner_app.models import Employee, PayrollDeclaration
    from ..sdup import SdupRow, build_sdup, ssn
    from ..services import _settings
    d = PayrollDeclaration.objects.get(company=m.company, form="SDUP", year=y, month=mo)
    meta = d.meta or {}
    emps = {e.id: e for e in Employee.objects.filter(id__in=[r["employee_id"] for r in meta.get("rows", [])])}
    rows, errors = [], []
    for r in meta.get("rows", []):
        e = emps.get(r["employee_id"])
        if e is None:
            continue
        if r.get("brutto") in ("", None):
            errors.append(f"{e.full_name}: nenurodytas bruto DU")
            continue
        rows.append(SdupRow(
            first_name=e.first_name, last_name=e.last_name,
            person_code="" if e.is_foreigner else e.personal_code,
            ssn=ssn(e.sd_series, e.sd_number) if e.is_foreigner else "",
            iltu=e.foreign_code if e.is_foreigner else "",
            birth_date=e.birth_date.isoformat() if e.birth_date else "", gender=e.gender,
            group_code=r["group"], weekly_hours=Decimal(r["weekly_hours"]), work_time_mode=r["work_time_mode"],
            brutto=Decimal(r["brutto"]), extra=Decimal(r.get("extra") or "0"), paid_hours=Decimal(r.get("hours") or "0")))
    insurer = _settings(m.company).sodra_insurer_code or meta.get("insurer", "")
    data, errs = build_sdup(insurer, y, mo, rows)
    errors += errs
    blocking = [x for x in errors if not x.startswith("⚠")]
    d.content = "" if blocking else json.dumps(data, ensure_ascii=False, indent=1)
    d.errors = errors
    d.status = "error" if blocking else "ready"
    d.save(update_fields=["content", "errors", "status", "updated_at"])
    return d


def set_start(m, d, gap_mode=None):
    _editable(m)
    m.du_start = d.replace(day=1)
    if gap_mode in ("auto", "manual"):
        m.gap_mode = gap_mode
    m.save(update_fields=["du_start", "gap_mode", "updated_at"])
    return analyze(m)


def add_files(m, uploads):
    """uploads: [(vardas, bytes)] -> (priimta, praleista[vardas, priežastis])"""
    from docscanner_app.models import PayrollMigrationFile
    _editable(m)
    ok, skipped = 0, []
    for name, content in uploads:
        p = ffparse.parse(content, name)
        if p is None:
            text = content[:3000].decode("utf-8", "ignore") if isinstance(content, bytes) else content[:3000]
            reason = ("Šios ataskaitos nereikia" if "<Ataskaita " in text else
                      "Nepalaikoma forma (tinka: Sodros S50, S31, S29, S4, S5; SAM, 1-SD, 2-SD, 9-SD, 12-SD; GPM313, GPM312)")
            skipped.append((name, reason))
            continue
        sha = hashlib.sha1(content if isinstance(content, bytes) else content.encode()).hexdigest()
        _, created = PayrollMigrationFile.objects.get_or_create(
            migration=m, sha1=sha,
            defaults={"file_name": name[:255], "form": p.form, "year": p.year, "month": p.month,
                      "content": content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else content})
        if created:
            ok += 1
        else:
            skipped.append((name, "Toks failas jau įkeltas"))
    return ok, skipped


def remove_file(m, file_id):
    _editable(m)
    m.files.filter(id=file_id).delete()


def _reconstruct(m):
    return build([ffparse.parse(f.content, f.file_name) for f in m.files.all()])


def _required_months(m, company_start=None, mode=None):
    """
    Kurių mėnesių duomenų reikia (iki paskutinio pilno mėnesio):
      pilnas DU - nuo praeitų metų spalio (VDU ir metinės sumos), GPM313 - nuo sausio;
      tik SDUP - paskutiniai 3 pilni mėnesiai (algų riboms ir mėnesio SDUP).
    Įmonė (pirmas darbuotojas) pradėjo vėliau - tik nuo jos pradžios.
    """
    if (mode or m.mode) == "sdup":
        today = timezone.localdate()
        end = (today.year, today.month)                     # neįskaitant einamojo mėnesio
        y, mo = _month_add(today.year, today.month, -3)
    else:
        end = (m.du_start.year, m.du_start.month)
        y, mo = (m.du_start.year - 1, 10)
    if company_start and (company_start.year, company_start.month) > (y, mo):
        y, mo = company_start.year, company_start.month
    sam, g313 = [], []
    cy, cm = y, mo
    while (cy, cm) < end:
        sam.append((cy, cm))
        cy, cm = _month_add(cy, cm, 1)
    gy, gm = max((end[0], 1), (y, mo))
    while (gy, gm) < end:
        g313.append((gy, gm))
        gy, gm = _month_add(gy, gm, 1)
    return sam, g313


def _net_estimate(income, pension, npd_none):
    rate = EMPLOYEE_RATE + (PENSION_RATE if pension else ZERO)
    gpm = _q(income * Decimal("0.20")) if npd_none else None
    sodra = _q(income * rate / 100)
    return (_q(income - sodra - gpm) if gpm is not None else None), gpm


# Profesijos (LPK 4 ženklai), kuriose dažnai taikoma suminė darbo laiko apskaita (pamainos, budėjimai)
SHIFT_LPK = {
    "8322": "lengvųjų automobilių vairuotojai", "8331": "autobusų vairuotojai", "8332": "sunkiasvorių transporto vairuotojai",
    "8311": "mašinistai", "5411": "ugniagesiai", "5413": "pataisos įstaigų prižiūrėtojai", "5414": "apsaugos darbuotojai",
    "2211": "gydytojai", "2212": "gydytojai specialistai", "2221": "slaugytojai", "3221": "slaugytojai",
    "3258": "greitosios pagalbos darbuotojai", "5321": "slaugytojų padėjėjai", "5322": "slaugos darbuotojai namuose",
    "5120": "virėjai", "5131": "padavėjai", "5132": "barmenai", "5111": "kelionių palydovai", "3153": "pilotai",
    "4321": "sandėlio darbuotojai", "9333": "krovikai", "5153": "pastatų prižiūrėtojai", "8160": "maisto pramonės operatoriai",
    "8189": "stacionarių įrenginių operatoriai", "8219": "surinkėjai", "3131": "elektrinių operatoriai",
    "3139": "procesų valdymo technikai", "5152": "namų ūkio prižiūrėtojai", "5329": "sveikatos priežiūros darbuotojai",
}


def _summed_hint(e, s):
    """Užuomina, kad gali būti suminė apskaita: pamaininė profesija ar reguliarūs priedai prie pastovios algos."""
    why = []
    if e.lpk4 in SHIFT_LPK:
        why.append(f"profesija ({SHIFT_LPK[e.lpk4]}) dažnai dirba pamainomis")
    vals = [v for ym, v in sorted(e.income.items()) if ym < (s.year, s.month) and v > 0][-12:]
    if len(vals) >= 6:
        base = sorted(vals)[len(vals) // 2]
        extra = sum(1 for v in vals if base * Decimal("1.03") < v <= base * Decimal("1.30"))
        if extra >= 3:
            why.append(f"{extra} iš {len(vals)} mėn. pajamos šiek tiek didesnės už įprastas – būdinga naktinio, "
                       f"švenčių ar viršvalandžių darbo priedams")
    return "; ".join(why)


@transaction.atomic
def analyze(m):
    """Perskaito visus failus, atnaujina darbuotojų sąrašą (nekeičia rankinių pakeitimų), grąžina suvestinę."""
    from docscanner_app.models import PayrollMigrationEmployee
    r = _reconstruct(m)
    s = m.du_start
    last_y, last_m = _month_add(s.year, s.month, -1)
    existing = {p.person_code: p for p in m.people.all()}
    salary_check = {}                                   # {asmens kodas: {reason, suggested}} - pasiūlyta alga gali būti netiksli
    not_employees = []                                  # S31 be pabaigos, bet nėra S29 ir pajamų (pvz. MB nariai)
    summed_hint = {}                                    # {asmens kodas: priežastis} - galbūt suminė apskaita (tik užuomina)
    for code, e in r.employees.items():
        p = existing.get(code) or PayrollMigrationEmployee(migration=m, person_code=code)
        auto = {
            "first_name": e.first_name, "last_name": e.last_name, "start_date": e.start, "end_date": e.end,
            "sd_series": e.sd_series, "sd_number": e.sd_number, "is_foreigner": is_foreign_key(code),
            "lpk4": e.lpk4, "contract_type": e.contract_reason or "01", "pension": e.pension,
            "npd_mode": "none" if e.npd_none else "standard",
            "include": not (e.end and e.end < date(s.year - (1 if s.month <= 3 else 0), 1, 1)),
            "employed": not (e.end and e.end < s),
        }
        # nebuvimas perėjimo dieną (S4 / S5 / 12-SD / 9-SD): pasiūlymas
        for form, a, b, reason in (e.absences or []):
            if a and b and a < s <= b:
                auto["transition_state"] = "childcare" if form == "9-SD" and reason != "06" else \
                    "paternity" if form == "9-SD" else "unpaid"
                auto["transition_until"] = b
        for c in r.s15:
            if c["person"].code == code and c["start"] < s <= c["end"]:
                auto["transition_state"] = "maternity" if c.get("kind") == "NESP" else "sick"
                auto["transition_until"] = c["end"]
                auto["transition_from"] = c["start"]          # ligos pradžia - 2-os dienos apmokėjimui
        if (m.mode != "sdup" and r.s29_codes and code not in r.s29_codes and not e.end
                and not any(v > 0 for v in e.income.values()) and (not e.start or e.start <= r.s29_date)):
            auto["employed"] = auto["include"] = False
            not_employees.append(f"{e.first_name} {e.last_name}")
        if m.mode == "sdup":
            # tik SDUP: sprendžia bukalteris (2 žingsnis); seni S31 / 2-SD atleidimai sąrašo nekeičia
            if r.s29_codes and code in r.s29_codes:
                auto["employed"], auto["include"] = True, True
            elif p.pk:
                auto.pop("employed", None)               # buvęs darbuotojas, kurio nebėra S29 - pažymima, nekeičiama
            else:
                auto["employed"] = auto["include"] = bool(r.s29_codes and code in r.s29_codes) or not r.s29_codes
        last_income = e.income.get((last_y, last_m))
        recent_items = [(ym, v) for ym, v in sorted(e.income.items()) if ym < (s.year, s.month) and v > 0][-3:]
        recent = [v for _, v in recent_items]
        if recent:
            med = sorted(recent)[len(recent) // 2]          # mediana - vienkartinė premija nepakeičia
            auto["base_amount"] = med
            why = []
            if len(recent) < 3:
                why.append("mažiau nei 3 mėn. duomenų")
            elif med and (max(recent) - min(recent)) / med > Decimal("0.05"):
                why.append("mėnesių sumos skiriasi (premijos, viršvalandžiai, liga ar atostogos)")
            if e.start and e.start.day > 1 and (e.start.year, e.start.month) in [ym for ym, _ in recent_items]:
                why.append("pirmas mėnuo nepilnas")
            if why and not (e.end and e.end < s):
                salary_check[code] = {"reason": "; ".join(why), "suggested": str(med)}
        hint = _summed_hint(e, s)
        if hint and not (e.end and e.end < s):
            summed_hint[code] = hint
        if last_income:
            if r.lag == 1:
                net, _ = _net_estimate(last_income, e.pension, e.npd_none)
                auto["unpaid_amount"] = net
        for k, v in auto.items():
            if k not in (p.edited or []):
                setattr(p, k, v)
        p.save()

    # užsienietis, anksčiau rastas tik su SD numeriu, dabar sujungtas su asmens kodu - senos eilutės nebereikia
    for p in m.people.filter(person_code__startswith="SD", employee__isnull=True).exclude(source__in=("manual", "excel")):
        if p.person_code in r.employees:
            continue
        twin = m.people.filter(sd_series=p.sd_series, sd_number=p.sd_number).exclude(pk=p.pk).first()
        if twin is None:
            continue
        moved = [k for k in (p.edited or []) if k not in (twin.edited or []) and k not in ("person_code", "is_foreigner")]
        for k in moved:
            setattr(twin, k, getattr(p, k))
        if moved:
            twin.edited = list(twin.edited or []) + moved
            twin.save()
        p.delete()

    starts = [e.start for e in r.employees.values() if e.start]
    company_start = min(starts) if starts else None
    sam_need, g313_need = _required_months(m, company_start, "full")      # DU: istorija nuo praeitų metų spalio
    sdup_need, _ = _required_months(m, company_start, "sdup")             # SDUP: paskutiniai 3 pilni mėnesiai
    have_sam = set(r.income_months)
    have_313 = {(f.year, f.month) for f in m.files.filter(form="GPM313")}
    active = [p for p in m.people.all() if p.include and p.employed]
    s29 = m.files.filter(form__in=("S29", "S31", "1-SD")).exists()
    today = timezone.localdate()
    s29_fresh = bool(r.s29_date and (today - r.s29_date).days <= 31)
    sdup_check = {
        "employees_file": s29,
        "s29_date": r.s29_date.isoformat() if r.s29_date else None,
        "s29_fresh": s29_fresh,
        "income_months": sum(1 for x in sdup_need if x in have_sam),
        "income_needed": len(sdup_need),
        "income_from": f"{sdup_need[0][0]}-{sdup_need[0][1]:02d}-01" if sdup_need else None,
        "company_start": company_start.isoformat() if company_start else None,
    }
    # failų laikotarpiai (senų ataskaitų atpažinimui)
    file_periods = {}
    for f in m.files.all():
        fp = ffparse.parse(f.content, f.file_name)
        if fp is not None and fp.period[1]:
            file_periods[f.id] = [fp.period[0].isoformat() if fp.period[0] else None, fp.period[1].isoformat()]
    people_all = list(m.people.all())
    s29_missing = [p.id for p in people_all if r.s29_codes and p.person_code not in r.s29_codes
                   and p.include and p.employed and p.source != "manual"]
    sdup_diff = {
        "new": [f"{p.first_name} {p.last_name}" for p in people_all if p.employed and p.include and not p.employee_id],
        "gone": [f"{p.first_name} {p.last_name}" for p in people_all if not p.employed and p.employee_id
                 and p.employee.status == "active"],
        "s29_date": r.s29_date.isoformat() if r.s29_date else None,
    }
    # GPM pagal darbuotojus iki perėjimo - tik GPM313 sumos padalijimas, jei dirbo keli ir NPD ne visiems netaikytas
    earners = {code for code, e in r.employees.items()
               if any(v > 0 for (y, mo), v in e.income.items() if y == s.year and (y, mo) < (s.year, s.month))}
    gpm_split_estimated = len(earners) > 1 and not all(r.employees[c].npd_none for c in earners)
    summary = {
        "mode": m.mode, "sdup_check": sdup_check, "sdup_diff": sdup_diff, "insurer_code": r.insurer_code,
        "salary_check": salary_check, "gpm_split_estimated": gpm_split_estimated,
        "vdu_inputs": _vdu_inputs(r, m),
        "summed_hint": summed_hint,
        # S15 rekomenduojamas: GPM313 rodo darbdavio apmokėtas ligos dienas, o S15 neįkeltas
        "sick_suspect": [f"{y}-{mo:02d}" for y, mo in r.sick_suspect] if not r.s15 else [],
        "vacation_date": (s - timedelta(days=1)).isoformat(),
        "s29_missing": s29_missing,
        "du_start": s.isoformat(), "gap_mode": m.gap_mode, "lag": r.lag,
        "files": [{"id": f.id, "name": f.file_name, "form": f.form, "year": f.year, "month": f.month,
                   "period": file_periods.get(f.id)} for f in m.files.all()],
        "history_from": f"{sam_need[0][0]}-{sam_need[0][1]:02d}-01" if sam_need else None,
        "checklist": {
            "income": [{"ym": f"{y}-{mo:02d}", "ok": (y, mo) in have_sam} for y, mo in sam_need],
            "gpm313": [{"ym": f"{y}-{mo:02d}", "ok": (y, mo) in have_313} for y, mo in g313_need],
            "start_missing": [f"{p.first_name} {p.last_name}" for p in active if not p.start_date],
            "has_s31": m.files.filter(form__in=("S31", "S29")).exists(),
            "has_absences": m.files.filter(form__in=("S4", "S5", "9-SD", "12-SD")).exists(),
        },
        "checks": [{"ym": f"{y}-{mo:02d}", "gpm313_income": str(g5), "sam_income": str(inc), "gpm": str(gpm), "ok": ok}
                   for (y, mo), g5, inc, gpm, ok in r.checks],
        "warnings": r.warnings + (["Nepavyko nustatyti, kada mokamas DU (trūksta GPM313 arba SAM) - "
                                   "neišmokėtas sumas įveskite patys"] if r.lag is None else [])
                    + ([f"{', '.join(not_employees)}: yra S31, bet nėra S29 ir Sodros pajamų – greičiausiai MB nariai "
                        f"ar nebedirbantys. Į DU neįtraukti (jei dirba – pažymėkite „Dirba“)"] if not_employees else []),
        "gpm312_prev_years": sorted(r.gpm312),
        "other_codes": sorted({row["income_code"] for rows in r.gpm312.values() for row in rows
                               if row["income_code"] not in ("01", "03", "05", "07", "08")}),
        "accounting": _accounting_info(m),
    }
    m.summary = summary
    m.save(update_fields=["summary", "updated_at"])
    return summary


def _accounting_info(m):
    from docscanner_app.models import OpeningBalanceBatch
    acct = OpeningBalanceBatch.objects.filter(company_profile=m.company).first()
    if not acct:
        return {"mode": "none"}
    if acct.cutover_date.replace(day=1) < m.du_start:
        y, mo = acct.cutover_date.year, acct.cutover_date.month
        gap = []
        while (y, mo) < (m.du_start.year, m.du_start.month):
            gap.append(f"{y}-{mo:02d}")
            y, mo = _month_add(y, mo, 1)
        return {"mode": "gap", "cutover": acct.cutover_date.isoformat(), "gap_months": gap,
                "accounting_confirmed": acct.status == "confirmed"}
    return {"mode": "same", "cutover": acct.cutover_date.isoformat(), "accounting_confirmed": acct.status == "confirmed"}


def add_person(m, data):
    """Rankiniu būdu pridėtas darbuotojas."""
    from docscanner_app.models import PayrollMigrationEmployee
    from ..personal_code import parse as parse_code
    _editable(m)
    foreign = bool(data.get("is_foreigner"))
    if foreign:
        code = foreign_key(data.get("sd_number"))
        if not code:
            raise ValueError("Socialinio draudimo numeris: 2 raidės ir 7 skaitmenys, pvz. AB1234567")
        if not data.get("birth_date") or data.get("gender") not in ("M", "F"):
            raise ValueError("Užsieniečiui nurodykite gimimo datą ir lytį")
    else:
        code = re.sub(r"\D", "", str(data.get("person_code") or ""))
        if not parse_code(code).valid:
            raise ValueError("Neteisingas asmens kodas")
    if m.people.filter(person_code=code).exists():
        p = m.people.get(person_code=code)
        p.include, p.employed = True, True
        p.save(update_fields=["include", "employed"])
        return p
    lpk = re.sub(r"\D", "", str(data.get("lpk_code") or ""))
    return PayrollMigrationEmployee.objects.create(
        migration=m, person_code=code, first_name=(data.get("first_name") or "").strip().title(),
        last_name=(data.get("last_name") or "").strip().title(), lpk_code=lpk[:6], lpk4=lpk[:4],
        weekly_hours=Decimal(str(data.get("weekly_hours") or "40").replace(",", ".")),
        work_time_mode=data.get("work_time_mode") or "01", source="manual", include=True, employed=True,
        is_foreigner=foreign, sd_series=code[2:4] if foreign else "", sd_number=code[4:] if foreign else "",
        birth_date=date.fromisoformat(str(data["birth_date"])[:10]) if foreign else None,
        gender=data.get("gender", "") if foreign else "",
        edited=["first_name", "last_name", "lpk_code", "weekly_hours", "work_time_mode", "include", "employed"]
        + (["is_foreigner", "sd_series", "sd_number", "birth_date", "gender"] if foreign else []))


def remove_person(m, pid):
    """Pašalinti iš sąrašo: rankiniu būdu pridėtas - ištrinamas, kitas - nebeįtraukiamas (nedirba)."""
    _editable(m)
    p = m.people.get(id=pid)
    if p.source == "manual" and p.employee_id is None:
        p.delete()
        return None
    p.include, p.employed = False, False
    p.edited = sorted(set(p.edited or []) | {"include", "employed"})
    p.save(update_fields=["include", "employed", "edited"])
    return p


def update_person(m, pid, data):
    _editable(m)
    p = m.people.get(id=pid)
    edited = set(p.edited or [])
    for k in EDITABLE:
        if k in data:
            v = data[k]
            if k in DECIMAL_FIELDS:
                v = Decimal(str(v).replace(",", ".")) if v not in (None, "") else (Decimal("40") if k == "weekly_hours" else None)
            if k in DATE_FIELDS:
                v = date.fromisoformat(str(v)[:10]) if v else None
            if k == "annual_leave_days":
                v = int(v or 20)
            if k == "summed_period_months":
                v = int(v) if v not in (None, "") else None
            if k == "summed_paid_overtime" and v is None:
                v = Decimal("0")
            if k == "week_hours":
                v = _clean_week(v)
                if v:
                    p.weekly_hours = sum(v, ZERO)
                    edited.add("weekly_hours")
                v = [str(x) for x in v] if v else None
            if k == "gender" and v not in ("M", "F"):
                v = ""
            if k == "email":
                v = check_email(v)
            if k == "phone":
                v = check_phone(v)
            setattr(p, k, v)
            edited.add(k)
    if "weekly_hours" in data and "week_hours" not in data and p.week_hours:
        p.week_hours = None                          # pakeista savaitės norma -> tolygiai Pr–Pn
    if p.npd_mode in ("d30_55", "d0_25") and not p.has_disability:   # NPD su dalyvumo lygiu -> dalyvumo lygis nustatytas
        p.has_disability = True
        edited.add("has_disability")
    if "lpk_code" in data and data["lpk_code"] and not data.get("position_name"):
        from ..lpk import get, short_title
        prof = get(data["lpk_code"])
        if prof:
            p.position_name = short_title(prof["name"])
            p.lpk4 = data["lpk_code"][:4]
    p.edited = sorted(edited)
    p.save()
    if p.employee_id:
        sync_employee(m, p, set(data))
    return p


@transaction.atomic
def sync_employee(m, p, fields):
    """Vienas duomenų šaltinis: pakeitimai perėjime iškart įrašomi į darbuotojo kortelę ir sutartį (DU modulis)."""
    from docscanner_app.models import Position
    from ..services import ensure_position_group, refresh_auto_ranges
    e = p.employee
    if fields & {"first_name", "last_name"}:
        e.first_name, e.last_name = p.first_name or e.first_name, p.last_name or e.last_name
        e.save(update_fields=["first_name", "last_name", "updated_at"])
    if "employed" in fields or "include" in fields:
        working = p.employed and p.include
        if not working and e.status == "active":
            e.status = "dismissed"
            e.save(update_fields=["status", "updated_at"])
            e.contracts.filter(status="active").update(status="terminated",
                                                       termination_date=p.end_date or timezone.localdate())
        elif working and e.status != "active":
            e.status = "active"
            e.save(update_fields=["status", "updated_at"])
            c = e.contracts.order_by("-start_date").first()
            if c:
                c.status, c.termination_date = "active", None
                c.save(update_fields=["status", "termination_date"])
    c = e.contracts.filter(status="active").order_by("-start_date").first()
    if c is None:
        return
    t = max(list(c.terms.all()), key=lambda x: x.valid_from, default=None)
    if "work_time_mode" in fields:
        c.work_time_mode = p.work_time_mode or "01"
        c.save(update_fields=["work_time_mode"])
    if t is None:
        return
    changed = []
    if "work_time_mode" in fields:
        t.work_regime = "summed" if p.work_time_mode == "02" else "standard"
        changed.append("work_regime")
    if "weekly_hours" in fields:
        t.workload = ((p.weekly_hours or Decimal("40")) / (t.full_time_hours or Decimal("40"))).quantize(Decimal("0.0001"))
        changed.append("workload")
    if fields & {"lpk_code", "lpk4", "position_name"} and (p.lpk_code or p.position_name):
        pos, _ = Position.objects.get_or_create(company=m.company, name=(p.position_name or p.lpk_code)[:150],
                                                defaults={"lpk_code": (p.lpk_code or p.lpk4)[:6]})
        t.position = pos
        changed.append("position")
    if changed:
        t.save(update_fields=changed)
        ensure_position_group(t)
    if "base_amount" in fields and p.base_amount:
        t.base_amount = p.base_amount
        t.save(update_fields=["base_amount"])
        refresh_auto_ranges(m.company)


@transaction.atomic
def reset(m):
    """Pradėti iš naujo: ataskaitos, sąrašas ir šio perėjimo sukurti darbuotojai be DU skaičiavimų."""
    from docscanner_app.models import (Employee, PayrollDeclaration, PayrollEmployeeResult, PayrollHistoryMonth,
                                       Position, PositionGroup)
    if m.status == "confirmed":
        raise ValueError("Pilnas DU perėjimas patvirtintas - pirmiausia atšaukite")
    ids = [i for i in m.people.values_list("employee_id", flat=True) if i]
    used = set(PayrollEmployeeResult.objects.filter(employee_id__in=ids).values_list("employee_id", flat=True))
    PayrollHistoryMonth.objects.filter(employee_id__in=ids).exclude(employee_id__in=used).delete()
    Employee.objects.filter(id__in=[i for i in ids if i not in used]).delete()
    Position.objects.filter(company=m.company, contractterms__isnull=True).delete()
    PositionGroup.objects.filter(company=m.company, positions__isnull=True).delete()
    PayrollDeclaration.objects.filter(company=m.company, form="SDUP", meta__source="s50").delete()
    m.files.all().delete()
    m.people.all().delete()
    m.other_payments.all().delete()
    m.status, m.summary = "draft", {}
    m.save(update_fields=["status", "summary", "updated_at"])
    return m


# ============================================================
# Patvirtinimas
# ============================================================

# ============================================================
# VDU iš Sodros duomenų (kai VDU iš senos programos neįvestas)
# ============================================================

VDU_HIGH, VDU_LOW = Decimal("1.10"), Decimal("0.90")   # mėnesio pajamos vs alga (pagal dirbtą dalį mėnesio)
VDU_HIGH_NOBASE, VDU_LOW_NOBASE = Decimal("1.15"), Decimal("0.85")   # be algos - lyginama su kitų mėnesių vidurkiu
MONTHS_GEN = ("sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo",
              "spalio", "lapkričio", "gruodžio")


def _vdu_window(m):
    """VDU laikotarpis: 3 kalendoriniai mėnesiai iki DU pradžios DokSkene."""
    s = m.du_start
    y, mo = _month_add(s.year, s.month, -3)
    return date(y, mo, 1), s - timedelta(days=1)


def _vdu_inputs(r, m):
    """Analizės metu: kiekvienam darbuotojui - VDU laikotarpio pajamos (S50/SAM), nebuvimai (S4/9-SD/12-SD), liga (S15)."""
    a, b = _vdu_window(m)
    out = {}
    for code, e in r.employees.items():
        codes = {code}
        if e.sd_series and e.sd_number:
            codes.add(f"SD{e.sd_series}{e.sd_number}")             # užsienietis - S15 gali būti su SD numeriu
        out[code] = {
            "income": {f"{y}-{mo:02d}": str(v) for (y, mo), v in e.income.items() if a <= date(y, mo, 1) <= b},
            "off": [[x[1].isoformat(), x[2].isoformat(), x[0]] for x in (e.absences or [])
                    if x[1] and x[2] and x[2] >= a and x[1] <= b],
            "sick": sorted([c["start"].isoformat(), c["end"].isoformat(), c.get("kind") or "", c.get("reason") or ""]
                           for c in r.s15 if c["person"].code in codes
                           and c["end"] >= a - timedelta(days=31) and c["start"] <= b),
        }
    return out


def _person_week(p):
    """Darbo valandos Pr..Sk: pagal įvestą savaitės grafiką arba tolygiai Pr–Pn."""
    try:
        w = _clean_week(getattr(p, "week_hours", None))
    except ValueError:
        w = None
    if w:
        return w
    per_day = (Decimal(str(p.weekly_hours)) / 5) if p.weekly_hours else Decimal("8")
    return [per_day] * 5 + [ZERO, ZERO]


def _dates(a, b):
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


def vdu_auto(m, p):
    """
    VDU iš Sodros duomenų: pajamos (S50) / darbo dienos (val.) pagal grafiką, neįskaitant ligos (S15) ir
    nebuvimų (S4 / 9-SD / 12-SD). Darbdavio mokama ligos išmoka už 2 d. į S50 nepatenka (Sodros įmokomis
    neapmokestinama) - atimti nereikia.
    Grąžina {value, unit, status: ok|check, months, flags} arba None (VDU nereikia arba nėra duomenų).
    """
    from ..work_calendar import is_holiday, is_pre_holiday
    data = ((m.summary or {}).get("vdu_inputs") or {}).get(p.person_code)
    a, b = _vdu_window(m)
    if data is None or (p.start_date and p.start_date > b) or (p.end_date and p.end_date < m.du_start):
        return None
    hourly = getattr(p, "work_time_mode", "01") == "02" or p.pay_form == "hourly"
    week = _person_week(p)

    def day_units(d):
        h = week[d.weekday()]
        if h <= 0 or is_holiday(d):
            return ZERO
        if is_pre_holiday(d):
            h = max(h - 1, ZERO)
        return h if hourly else Decimal("1")

    off, sick = {}, {}
    for s_, e_, kind in data.get("off") or []:
        for d in _dates(date.fromisoformat(s_), date.fromisoformat(e_)):
            off[d] = "vaiko priežiūros atostogos" if kind == "9-SD" else "nemokamos atostogos / nebuvimas"
    for s_, e_, kind, _reason in data.get("sick") or []:
        for d in _dates(date.fromisoformat(s_), date.fromisoformat(e_)):
            sick[d] = "nėštumo ir gimdymo atostogos" if kind == "NESP" else "liga"

    months, missing = [], []
    y, mo = a.year, a.month
    while date(y, mo, 1) <= b:
        first = date(y, mo, 1)
        last = date(*_month_add(y, mo, 1), 1) - timedelta(days=1)
        lo, hi = max(first, p.start_date or first), min(last, p.end_date or last)
        ym = f"{y}-{mo:02d}"
        if lo <= hi:
            units, norm, excluded, reasons = ZERO, ZERO, 0, {}
            for d in _dates(first, last):
                u = day_units(d)
                if u <= 0:
                    continue
                norm += u
                if not (lo <= d <= hi):
                    continue
                why = sick.get(d) or off.get(d)
                if why:
                    excluded += 1
                    reasons[why] = reasons.get(why, 0) + 1
                    continue
                units += u
            inc = data["income"].get(ym)
            if inc is None and units > 0:                   # dirbo, bet pajamų nėra - trūksta S50 / SAM
                missing.append(ym)
            months.append({"ym": ym, "y": y, "mo": mo, "income": Decimal(inc) if inc is not None else None,
                           "units": units, "norm": norm, "excluded": excluded, "reasons": reasons,
                           "partial": (lo, hi) != (first, last)})
        y, mo = _month_add(y, mo, 1)

    used = [x for x in months if x["income"] is not None and x["units"] > 0]
    total_units = sum((x["units"] for x in used), ZERO)
    for x in used:
        x["adj"] = x["income"]
        x["rate"] = x["adj"] / x["units"]

    base = Decimal(str(p.base_amount)) if p.base_amount not in (None, "") else None
    unit_word = "val." if hourly else "d."
    flags, notes = [], []

    def ratio(x, median):
        """Mėnesio pajamos / tikėtinos pajamos: alga x dirbta mėnesio dalis (val. įkainis x val.) arba kitų mėn. vidurkis."""
        if base and base > 0:
            if p.pay_form == "hourly":
                exp = base * x["units"] if hourly else None
            else:
                exp = base * x["units"] / x["norm"] if x["norm"] else None
            if exp:
                return x["adj"] / exp, VDU_HIGH, VDU_LOW
        return (x["rate"] / median if median else Decimal("1")), VDU_HIGH_NOBASE, VDU_LOW_NOBASE

    if used:
        value = _q(sum((x["adj"] for x in used), ZERO) / total_units)
        rates = sorted(x["rate"] for x in used)
        median = rates[len(rates) // 2]
        for x in used:
            k, hi_k, lo_k = ratio(x, median)
            name = MONTHS_GEN[x["mo"] - 1]
            if k > hi_k:
                flags.append(f"{x['ym']}: pajamos didesnės nei įprastai – galėjo būti premija, priedas, viršvalandžiai "
                             f"ar atostoginiai. Jei taip – įveskite VDU iš senos programos")
            elif k < lo_k:
                flags.append(f"{x['ym']}: pajamos mažesnės nei įprastai – galėjo būti nemokamos atostogos, prastova "
                             f"ar pravaikštos (Sodra jų nemato). Jei taip – įveskite VDU iš senos programos")
            if x["reasons"]:
                notes.append(f"{name.capitalize()} neįskaičiuota: " + ", ".join(f"{k} {v} d." for k, v in x["reasons"].items()))
    else:
        # 3 mėn. nedirbo (liga, vaiko priežiūra) - VDU pagal pareiginę algą
        last_norm = months[-1]["norm"] if months else ZERO
        if base is None:
            return {"value": None, "unit": "hour" if hourly else "day", "status": "check", "months": [],
                    "flags": ["Nėra duomenų VDU apskaičiuoti – įveskite VDU iš senos programos"], "notes": []}
        value = _q(base if p.pay_form == "hourly" else (base / last_norm if last_norm else ZERO))
        notes.append("Per 3 mėnesius nedirbo – VDU apskaičiuotas pagal pareiginę algą")
    last_ym = f"{b.year}-{b.month:02d}"
    for ym in missing:
        if ym == last_ym and used:
            notes.append(f"{ym}: Sodroje dar nėra (SAM teikiamas iki kito mėn. 15 d.) – VDU apskaičiuotas iš ankstesnių "
                         f"mėnesių. Įkėlus naują S50, perskaičiuosime")
        else:
            flags.append(f"{ym}: nėra pajamų duomenų (S50 ar SAM) – mėnuo neįskaičiuotas")
    if hourly and getattr(p, "work_time_mode", "01") == "02":
        flags.append("Suminė apskaita: valandos imtos pagal grafiką, ne faktiškai dirbtos – jei buvo viršvalandžių, "
                     "patikrinkite VDU senoje programoje")
    if p.start_date and p.start_date > a:
        notes.append(f"Dirba nuo {p.start_date} – VDU už dirbtą laiką")
    return {
        "value": str(value), "unit": "hour" if hourly else "day", "status": "check" if flags else "ok",
        "flags": flags, "notes": notes,
        "months": [{"ym": x["ym"], "income": str(x["income"]) if x["income"] is not None else None,
                    "units": str(_q(x["units"]) if hourly else int(x["units"])), "unit": unit_word,
                    "excluded": x["excluded"],
                    "rate": str(_q(x["rate"])) if "rate" in x else None} for x in months],
    }


def _worked(y, mo, workload=Decimal("1")):
    from ..work_calendar import STANDARD_WEEK, month_norm
    n = month_norm(y, mo, STANDARD_WEEK, workload)
    return n.work_days, n.hours


def _worked_from(y, mo, start=None, end=None):
    """Darbo dienos / valandos pagal standartinį kalendorių - tik ta mėnesio dalis, kai darbuotojas dirbo."""
    from ..services import month_bounds
    first, last = month_bounds(y, mo)
    a = max(first, start) if start else first
    b = min(last, end) if end else last
    if (a, b) == (first, last):
        return _worked(y, mo)
    days = _workdays(a, b) if a <= b else 0
    return days, Decimal(days * 8)


def _apply_gpm_ytd(m, p, e):
    """GPM iš senos programos (šių metų mėnesiai iki perėjimo) - paskirstomas pagal pajamas vietoj GPM313 dalijimo."""
    from docscanner_app.models import PayrollHistoryMonth
    total = getattr(p, "gpm_ytd", None)
    if total is None:
        return
    rows = list(PayrollHistoryMonth.objects.filter(employee=e, year=m.du_start.year, month__lt=m.du_start.month)
                .order_by("month"))
    income = sum((h.income for h in rows), ZERO)
    if not income:
        return
    left = Decimal(total)
    for i, h in enumerate(rows):
        g = left if i == len(rows) - 1 else _q(Decimal(total) * h.income / income)
        left -= g
        h.gpm = g
        h.save(update_fields=["gpm"])


def _employee_for(m, p):
    from docscanner_app.models import ContractTerms, Employee, EmploymentContract, Position
    gone = not p.employed
    foreign = is_foreign_key(p.person_code)
    emp_fields = {f.name for f in Employee._meta.get_fields()}
    if foreign:
        e = Employee.objects.filter(company=m.company, sd_series=p.sd_series, sd_number=p.sd_number).first()
    else:
        e = Employee.objects.filter(company=m.company, personal_code=p.person_code).first()
    if e is None:
        extra = {}
        if foreign:
            extra = {k: v for k, v in (("is_foreigner", True), ("birth_date", p.birth_date), ("gender", p.gender))
                     if k in emp_fields}
        e = Employee.objects.create(
            company=m.company, first_name=p.first_name, last_name=p.last_name, personal_code="" if foreign else p.person_code,
            **extra,
            sd_series=p.sd_series, sd_number=p.sd_number, npd_mode=p.npd_mode, pension_accumulation=p.pension,
            single_parent=p.single_parent, iban=p.iban, email=p.email, phone=p.phone,
            has_disability=getattr(p, "has_disability", False), status="dismissed" if gone else "active",
            pay_once_a_month=getattr(p, "pay_once_a_month", False),
            advance_amount=None if getattr(p, "pay_once_a_month", False) else getattr(p, "advance_amount", None))
    _apply_opening(m, p, e)
    if e.contracts.exists() and getattr(p, "work_time_mode", "") and m.mode == "sdup":
        e.contracts.filter(status="active").update(work_time_mode=p.work_time_mode)
    if e.contracts.exists():
        c0 = e.contracts.filter(status="active").order_by("-start_date").first()
        if c0:
            _apply_summed(m, p, c0)
    if not e.contracts.exists():
        start = p.start_date or date(m.du_start.year, 1, 1)
        c = EmploymentContract.objects.create(
            employee=e, start_date=start, signed_date=start, sodra_contract_type=p.contract_type or "01",
            work_time_mode=getattr(p, "work_time_mode", "") or ("02" if p.work_regime == "summed" else "01"),
            annual_leave_days=p.annual_leave_days or 20, status="terminated" if gone else "active",
            termination_date=(p.end_date or m.du_start - timedelta(days=1)) if gone else None)
        pos = None
        code, name = p.lpk_code, p.position_name
        if not (code or name) and p.lpk4:
            # tik profesijų grupė (S29 / 1-SD): pareigos = LPK grupės pavadinimas, kodas 4 skaitmenų
            from ..lpk import all_professions
            code = p.lpk4
            name = next((x["group_name"] for x in all_professions() if x["group_code"] == p.lpk4), p.lpk4)
        if code and not name:
            from ..lpk import get, short_title
            prof = get(code)
            name = short_title(prof["name"]) if prof else code
        if code or name:
            pos, _ = Position.objects.get_or_create(company=m.company, name=name[:150], defaults={"lpk_code": code[:6]})
        hours = p.weekly_hours or Decimal("40")
        _apply_summed(m, p, c)
        summed = getattr(p, "work_time_mode", "") == "02"
        week = {}
        if p.week_hours and not summed and "week_hours" in {f.name for f in ContractTerms._meta.get_fields()}:
            week = {"week_hours": [float(x) for x in p.week_hours]}          # faktinės valandos Pr–S (kaip kortelėje)
        ContractTerms.objects.create(contract=c, valid_from=start, position=pos, pay_form=p.pay_form or "monthly",
                                     base_amount=p.base_amount or ZERO, workload=(hours / Decimal("40")).quantize(Decimal("0.0001")),
                                     full_time_hours=Decimal("40"), **week,
                                     work_regime="summed" if summed else (p.work_regime or "standard"))
    return e


def _apply_opening(m, p, e):
    """VDU iš senos programos, dalyvumas, vaikai (perėjimo metu)."""
    from docscanner_app.models import EmployeeChild
    changed = []
    if getattr(p, "has_disability", False) != e.has_disability:
        e.has_disability = p.has_disability
        changed.append("has_disability")
    vdu = getattr(p, "vdu_override", None)
    if not vdu:                                       # neįvestas - apskaičiuotas iš Sodros duomenų
        auto = vdu_auto(m, p)
        vdu = Decimal(auto["value"]) if auto and auto.get("value") and Decimal(auto["value"]) > 0 else None
    if vdu:
        mode = getattr(p, "work_time_mode", "01")
        e.opening_vdu = vdu
        e.opening_vdu_unit = "hour" if (mode == "02" or p.pay_form == "hourly") else "day"
        y, mo = _month_add(m.du_start.year, m.du_start.month, 3)
        e.opening_vdu_until = date(y, mo, 1)
        changed += ["opening_vdu", "opening_vdu_unit", "opening_vdu_until"]
    if changed:
        e.save(update_fields=changed + ["updated_at"])
    for ch in getattr(p, "children", None) or []:
        try:
            bd = date.fromisoformat(str(ch.get("birth_date"))[:10])
        except (TypeError, ValueError):
            continue
        EmployeeChild.objects.get_or_create(employee=e, birth_date=bd,
                                            defaults={"first_name": (ch.get("first_name") or "")[:68]})


def summed_default_start(m):
    """Įmonės apskaitinio laikotarpio, į kurį patenka DU pradžia, pirmoji diena."""
    from ..roster.period import period_bounds
    from ..services import _settings
    st = _settings(m.company)
    (y, mo), _ = period_bounds(m.du_start.year, m.du_start.month, st.summed_period_months or 3, st.summed_period_anchor or 1)
    return date(y, mo, 1)


TRANSITION_KINDS = {"vacation": "vacation_prepaid", "sick": "sick", "childcare": "childcare", "maternity": "maternity",
                    "paternity": "paternity", "unpaid": "unpaid"}


def _transition_absence(m, p, e):
    """Nebuvimas, kuris tęsiasi perėjimo dieną: įrašomas nuo DU pradžios, jau apmokėtas ankstesnėje programoje."""
    from docscanner_app.models import AbsenceEvent
    kind = TRANSITION_KINDS.get(getattr(p, "transition_state", "work") or "work")
    until = getattr(p, "transition_until", None)
    if not kind or not until or until < m.du_start or not p.employed:
        return
    if AbsenceEvent.objects.filter(employee=e, start_date__lte=until, end_date__gte=m.du_start).exists():
        return
    note = "Perkelta iš ankstesnės programos"
    start, employer = m.du_start, False
    since = getattr(p, "transition_from", None)
    if since:
        note += f"; prasidėjo {since.isoformat()}"
    if kind == "vacation_prepaid" and p.vacation_prepaid_amount:
        note += f"; atostoginiai už šias dienas jau išmokėti ({p.vacation_prepaid_amount} €)"
    if kind == "sick" and since and since <= m.du_start:
        # liga įrašoma nuo tikrosios pradžios: jei 2-a ligos diena = DU pradžia, ją apmoka DokSkenas (LIG),
        # o NP-SD2 pranešime nurodoma ir ankstesnėje programoje išmokėta suma
        start, employer = since, True
        if p.vacation_prepaid_amount:
            note += f"; ligos išmoka iš darbdavio lėšų ankstesnėje programoje {p.vacation_prepaid_amount} €"
    AbsenceEvent.objects.create(
        employee=e, kind=kind, start_date=start, end_date=until, status="approved", source="manual",
        employer_pays_first_days=employer, comment=note[:255],
        prepaid_amount=p.vacation_prepaid_amount if kind in ("vacation_prepaid", "sick") else None)


def _apply_summed(m, p, c):
    """Suminė apskaita: darbuotojo laikotarpis ir perkeltas einamojo laikotarpio likutis."""
    if getattr(p, "work_time_mode", "01") != "02":
        return
    months = p.summed_period_months or None
    start = p.summed_period_start or summed_default_start(m)
    changed = []
    if months:
        c.summed_period_months = months
        changed.append("summed_period_months")
    if p.summed_period_start:
        c.summed_period_anchor = start.month
        changed.append("summed_period_anchor")
    if start and start < m.du_start and (p.summed_worked_hours is not None or p.summed_absence_hours is not None):
        c.summed_opening = {"start": start.isoformat(), "until": m.du_start.isoformat(),
                            "worked": str(p.summed_worked_hours or 0), "absence": str(p.summed_absence_hours or 0),
                            "paid_ot": str(p.summed_paid_overtime or 0)}
        changed.append("summed_opening")
    if changed:
        c.save(update_fields=changed)


def _je(m, user, entry_date, number, desc, lines):
    """lines: [(side, account, amount, employee_id)]"""
    from docscanner_app.models import JournalEntry, JournalEntryLine
    from docscanner_app.utils.journal_generators import finalize_journal_entry
    from ..services import ACCOUNT_NAMES
    lines = [l for l in lines if l[2] and l[2] > 0]
    if not lines:
        return None
    je = JournalEntry.objects.create(
        user=user, company_profile=m.company, source_type=JournalEntry.SOURCE_PAYROLL, entry_date=entry_date,
        period=entry_date.replace(day=1), document_number=number, description=desc, currency="EUR",
        status=JournalEntry.STATUS_POSTED)
    JournalEntryLine.objects.bulk_create([
        JournalEntryLine(entry=je, side=side, account_code=acc, account_name=ACCOUNT_NAMES.get(acc, ""),
                         amount=_q(amt), description=desc[:255], sort_order=i, employee_id=emp)
        for i, (side, acc, amt, emp) in enumerate(lines)])
    finalize_journal_entry(je)
    return je


@transaction.atomic
def confirm(m, user):
    from docscanner_app.models import JournalEntryLine, PayrollHistoryMonth
    from ..payments import _create
    from ..services import _settings, set_vacation_balance
    _editable(m)
    r = _reconstruct(m)
    if not m.people.filter(include=True).exists():
        raise ValueError("Nėra darbuotojų - įkelkite ataskaitas, Excel šabloną arba pridėkite rankiniu būdu")
    problems = []
    for p in m.people.filter(include=True, employed=True):
        mid = (p.work_time_mode == "02" and (p.summed_period_start or summed_default_start(m)) < m.du_start)
        foreign = is_foreign_key(p.person_code)
        miss = [n for n, ok in (("profesija", p.lpk_code), ("darbo pradžia", p.start_date), ("alga", p.base_amount),
                                ("atostogų likutis", p.vacation_balance is not None),
                                ("gimimo data", not foreign or p.birth_date), ("lytis", not foreign or p.gender),
                                ("ligos pradžia", (p.transition_state or "work") != "sick"
                                 or (p.transition_from and p.transition_from <= m.du_start)),
                                ("suminės apskaitos dirbtos val.", not mid or p.summed_worked_hours is not None)) if not ok]
        if miss:
            problems.append(f"{p.first_name} {p.last_name}: {', '.join(miss)}")
    if problems:
        raise ValueError("Trūksta duomenų – " + "; ".join(problems[:8]))
    s = m.du_start
    last_y, last_m = _month_add(s.year, s.month, -1)
    lag = r.lag if r.lag is not None else 1
    st = _settings(m.company)
    m.summary = dict(m.summary or {}, vdu_inputs=_vdu_inputs(r, m))     # VDU įvertinimui - pagal dabartinius failus

    # GPM pagal mėnesius: NPD netaikytas -> 20 %; kitaip - GPM313 suma proporcingai pajamoms
    gpm_by_paid = {ym: g["G6"] + g["G7"] for ym, g in r.gpm313.items()}
    income_by_month = defaultdict(lambda: ZERO)
    for e in r.employees.values():
        for ym, v in e.income.items():
            income_by_month[ym] += v

    people = {p.person_code: p for p in m.people.filter(include=True)}
    emp_objs = {}
    for code, p in people.items():
        e = _employee_for(m, p)
        p.employee = e
        p.save(update_fields=["employee"])
        emp_objs[code] = e
        hist = r.employees.get(code)
        for (y, mo), inc in sorted((hist.income if hist else {}).items()):
            if (y, mo) >= (s.year, s.month):
                continue
            py, pm = _month_add(y, mo, lag)
            if p.npd_mode == "none":
                gpm = _q(inc * Decimal("0.20"))
            else:
                total = income_by_month[(y, mo)]
                gpm = _q(gpm_by_paid.get((py, pm), ZERO) * inc / total) if total else ZERO
            wd, wh = _worked_from(y, mo, p.start_date, p.end_date)
            PayrollHistoryMonth.objects.update_or_create(
                employee=e, year=y, month=mo,
                defaults={"company": m.company, "income": inc, "gpm": gpm, "paid_year": py, "paid_month": pm,
                          "worked_days": wd, "worked_hours": wh, "source": "sam"})
        _apply_gpm_ytd(m, p, e)
        if p.vacation_balance is not None and p.employed:
            set_vacation_balance(e, s - timedelta(days=1), p.vacation_balance, "Perkelta iš ankstesnės programos")
        _transition_absence(m, p, e)

    # neišmokėtos sumos -> įsipareigojimai (bankas susies automatiškai)
    unpaid_total, gpm_total, sodra_total = ZERO, ZERO, ZERO
    obligations = []
    for code, p in people.items():
        if not p.unpaid_amount:
            continue
        e = emp_objs[code]
        due = date(s.year, s.month, min(st.salary_day or 10, 28))
        obligations.append(_create(m.company, None, "employee", last_y, last_m, p.unpaid_amount, employee=e,
                                   recipient_name=e.full_name, recipient_iban=e.iban or "", due_date=due,
                                   purpose=f"Darbo užmokestis už {last_y}-{last_m:02d}",
                                   breakdown={"4480": str(p.unpaid_amount)}))
        unpaid_total += p.unpaid_amount
    if lag == 1 and unpaid_total:
        hist_last = PayrollHistoryMonth.objects.filter(company=m.company, year=last_y, month=last_m)
        gpm_total = sum((h.gpm for h in hist_last), ZERO)
        sam_last = next((f for f in m.files.filter(form="SAM", year=last_y, month=last_m)), None)
        if sam_last:
            sodra_total = sum((row["contrib"] for row in ffparse.parse(sam_last.content).rows), ZERO)
        if gpm_total:
            _create(m.company, None, "gpm", last_y, last_m, gpm_total, recipient_name="Valstybinė mokesčių inspekcija",
                    imokos_kodas="1311", purpose=f"GPM už {last_y}-{last_m:02d}", breakdown={"4481": str(gpm_total)},
                    due_date=date(s.year, s.month, 15))
        if sodra_total:
            _create(m.company, None, "sodra", last_y, last_m, sodra_total, recipient_name="Sodra", imokos_kodas="252",
                    purpose=f"Sodros įmokos už {last_y}-{last_m:02d}", breakdown={"4482": str(sodra_total)},
                    due_date=date(s.year, s.month, 15))

    # DK (kol nėra pilnos apskaitos - neįrašoma)
    acct = _accounting_info(m) if DK_ENABLED else {"mode": "none"}
    je_ids = []
    on = s - timedelta(days=1)
    if acct["mode"] == "gap" and m.gap_mode == "auto":
        for ym in acct["gap_months"]:
            y, mo = map(int, ym.split("-"))
            je = _gap_entry(m, user, y, mo, emp_objs, people, r)
            if je:
                je_ids.append(je.id)
    reclass = (acct["mode"] == "gap" or (acct["mode"] == "same" and acct.get("accounting_confirmed")))
    if reclass and acct.get("accounting_confirmed") and unpaid_total:
        # apskaita jau turi 4480 sumą iš balanso - tik išskaidom pagal darbuotojus
        lines = [("D", "4480", unpaid_total, None)]
        lines += [("K", "4480", p.unpaid_amount, emp_objs[c].id) for c, p in people.items() if p.unpaid_amount]
        je = _je(m, user, on, "DU-PERK", "DU perėjimas: neišmokėtas DU pagal darbuotojus", lines)
        if je:
            je_ids.append(je.id)
    elif acct["mode"] == "same" and not acct.get("accounting_confirmed") and (unpaid_total or gpm_total or sodra_total):
        # apskaitos likučiai dar nepatvirtinti - DU įrašo atlyginimų sąskaitas, apskaita jas tik sutikrins
        lines = [("K", "4480", p.unpaid_amount, emp_objs[c].id) for c, p in people.items() if p.unpaid_amount]
        lines += [("K", "4481", gpm_total, None), ("K", "4482", sodra_total, None)]
        lines.append(("D", "999", unpaid_total + gpm_total + sodra_total, None))
        je = _je(m, user, on, "PRAD-DU", "Pradiniai likučiai: darbo užmokestis", lines)
        if je:
            je_ids.append(je.id)

    from ..services import auto_create_groups
    auto_create_groups(m.company)                 # SDUP: pareigybių grupės ir algų ribos - automatiškai
    m.status, m.confirmed_at, m.journal_entry_ids = "confirmed", timezone.now(), je_ids
    m.save(update_fields=["status", "confirmed_at", "journal_entry_ids", "updated_at"])
    st = _settings(m.company)                 # DU DokSkenas pradžia = perėjimo mėnuo (lieka ir atidarius perėjimą iš naujo)
    st.du_start = m.du_start.replace(day=1)
    st.save(update_fields=["du_start"])
    logger.info("[Payroll migration] company=%s confirmed: %s employees, JE %s", m.company_id, len(people), je_ids)
    return m


def _gap_entry(m, user, y, mo, emp_objs, people, r):
    """Tarpinio mėnesio DU įrašas iš SAM: D 6304 + D 6305 / K 4480 (pagal darbuotojus), 4481, 4482."""
    from ..services import month_bounds
    sam = m.files.filter(form="SAM", year=y, month=mo).first()
    if not sam:
        return None
    rows = ffparse.parse(sam.content).rows
    gross = contrib = employee_part = gpm_sum = ZERO
    lines = []
    for row in rows:
        code = row["person"].code
        if code not in emp_objs:
            continue
        p = people[code]
        inc = row["income"]
        emp_rate = EMPLOYEE_RATE + (PENSION_RATE if p.pension else ZERO)
        e_sodra = _q(inc * emp_rate / 100)
        gpm = _q(inc * Decimal("0.20")) if p.npd_mode == "none" else ZERO
        if p.npd_mode != "none":
            from docscanner_app.models import PayrollHistoryMonth
            h = PayrollHistoryMonth.objects.filter(employee=emp_objs[code], year=y, month=mo).first()
            gpm = h.gpm if h else ZERO
        lines.append(("K", "4480", inc - e_sodra - gpm, emp_objs[code].id))
        gross += inc
        contrib += row["contrib"]
        employee_part += e_sodra
        gpm_sum += gpm
    if not gross:
        return None
    from ..services import _settings
    expense = _settings(m.company).default_expense_account or "6304"
    lines = [("D", expense, gross + contrib - employee_part, None)] + lines
    lines += [("K", "4481", gpm_sum, None), ("K", "4482", contrib, None)]
    _, last = month_bounds(y, mo)
    return _je(m, user, last, f"DU {y}-{mo:02d} (perk.)", f"Darbo užmokestis {y}-{mo:02d} (iš deklaracijų)", lines)


@transaction.atomic
def reopen(m):
    from docscanner_app.models import JournalEntry, PayrollHistoryMonth, PayrollPayment, PayrollRun
    if PayrollRun.objects.filter(company=m.company, status__in=("approved", "paid", "closed")).exists():
        raise ValueError("Jau yra patvirtintų DU DokSkenas - perėjimo atšaukti negalima")
    PayrollPayment.objects.filter(company=m.company, run__isnull=True,
                                  kind__in=("employee", "gpm", "sodra"), allocations__isnull=True).delete()
    PayrollHistoryMonth.objects.filter(company=m.company).delete()
    JournalEntry.objects.filter(id__in=m.journal_entry_ids or []).delete()
    m.status, m.confirmed_at, m.journal_entry_ids = "draft", None, []
    m.save(update_fields=["status", "confirmed_at", "journal_entry_ids", "updated_at"])
    return m


PAYROLL_CONTROL_ACCOUNTS = ("4480", "4484", "4481", "4482", "4486")


def payroll_control_amounts(company):
    """
    Pradiniams likučiams (tą pačią dieną): atlyginimų sąskaitų sumos iš DU perėjimo įrašo (PRAD-DU).
    -> {sąskaita: suma kreditu} arba None, jei DU šių sąskaitų neįrašė.
    """
    from docscanner_app.models import JournalEntryLine, PayrollMigration
    m = PayrollMigration.objects.filter(company=company, status="confirmed").first()
    if not m or not m.journal_entry_ids:
        return None
    out = {}
    for l in JournalEntryLine.objects.filter(entry_id__in=m.journal_entry_ids, entry__document_number="PRAD-DU",
                                             account_code__in=PAYROLL_CONTROL_ACCOUNTS):
        out[l.account_code] = out.get(l.account_code, ZERO) + (l.amount if l.side == "K" else -l.amount)
    return out or None


# ============================================================
# Excel šablonas
# ============================================================

def export_excel(m):
    """Šablone - tik dirbantys (nebedirbantys perkeliami automatiškai iš ataskaitų)."""
    from .excel import export
    people = [p for p in m.people.all() if p.include and p.employed]
    summ = m.summary or {}
    return export(people, m.mode, du_start=m.du_start, salary_check=summ.get("salary_check") or {},
                  summed_start=summed_default_start(m) if m.mode != "sdup" else None)


@transaction.atomic
def import_excel(m, file_obj):
    """Atnaujina esamus (pagal asmens kodą) ir prideda naujus darbuotojus. -> (atnaujinta, pridėta, klaidos)"""
    from docscanner_app.models import PayrollMigrationEmployee
    from .excel import parse
    _editable(m)
    rows, errors = parse(file_obj)
    upd = new = 0
    existing = {p.person_code: p for p in m.people.all()}
    for rec in rows:
        code = rec.pop("person_code")
        p = existing.get(code)
        if p is None and set(rec) <= {"children"}:
            continue                                   # vaikai darbuotojui, kurio sąraše nėra
        if p is None:
            p = PayrollMigrationEmployee(migration=m, person_code=code, source="excel")
            new += 1
        else:
            upd += 1
        edited = set(p.edited or [])
        if rec.get("lpk_code"):
            rec["lpk4"] = rec["lpk_code"][:4]
        for k, v in rec.items():
            setattr(p, k, v)
            edited.add(k)
        p.edited = sorted(edited)
        p.save()
    return upd, new, errors
