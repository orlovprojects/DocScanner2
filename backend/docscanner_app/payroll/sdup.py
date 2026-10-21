"""
Skaidraus darbo užmokesčio pranešimas (SDUP) - JSON pagal Sodros duomenų struktūros aprašą.
Grynas modulis: SdupRow sąrašas -> (dict, klaidos).
"""
import re
from dataclasses import dataclass
from decimal import Decimal

from .taxes import ZERO, q2

NAME_RE = re.compile(r"^[^\W\d_]+([ '-][^\W\d_]+)*$")
GROUP_RE = re.compile(r"^[a-zA-Z0-9.-]{1,15}$")
WORK_TIME_MODES = {"01", "02", "03", "04", "05"}
SSN_RE = re.compile(r"^[A-Z]{2}\d{7}$")


def ssn(series, number):
    """SD numeris pagal schemą: 2 raidės + 7 skaitmenys (SD81498 -> SD0081498)."""
    series, number = (series or "").strip().upper(), re.sub(r"\D", "", number or "")
    return f"{series}{number.zfill(7)}" if series and number else ""


def fmt(value):
    """Decimal -> "1500,00" (be tūkstančių skirtukų)."""
    return f"{q2(value):.2f}".replace(".", ",")


def gender_from_code(personal_code):
    """Lietuvos asmens kodas: 1/3/5 - vyras, 2/4/6 - moteris."""
    if personal_code and personal_code[:1] in "135":
        return "M"
    if personal_code and personal_code[:1] in "246":
        return "F"
    return None


@dataclass
class SdupSalary:
    group_code: str
    weekly_hours: Decimal = Decimal("40")
    work_time_mode: str = "01"
    brutto: Decimal = ZERO
    extra: Decimal = ZERO
    paid_hours: Decimal = ZERO


@dataclass
class SdupRow:
    first_name: str
    last_name: str
    person_code: str = ""
    ssn: str = ""            # pvz. "SD1234567"
    iltu: str = ""
    birth_date: str = ""     # YYYY-MM-DD
    gender: str = ""         # M / F
    group_code: str = ""
    weekly_hours: Decimal = Decimal("40")
    work_time_mode: str = "01"
    brutto: Decimal = ZERO
    extra: Decimal = ZERO
    paid_hours: Decimal = ZERO
    salaries: list = None    # kelios pareigybių grupės per mėnesį -> SdupSalary sąrašas


def _clean_name(value):
    return re.sub(r"\s+", " ", (value or "").strip())


def build_sdup(insurer_code, year, month, rows):
    errors = []
    if not re.fullmatch(r"\d{1,7}", insurer_code or ""):
        errors.append("Nenurodytas arba neteisingas draudėjo kodas (DU nustatymuose)")

    # schema: vienas asmuo - vienas įrašas (x-unique-employees); kelios sutartys -> kelios salaryInfo eilutės
    merged = {}
    for r in rows:
        key = r.person_code or r.ssn or r.iltu or f"{r.first_name} {r.last_name}"
        if key in merged:
            prev = merged[key]
            prev.salaries = (prev.salaries or [SdupSalary(prev.group_code, prev.weekly_hours, prev.work_time_mode,
                                                         prev.brutto, prev.extra, prev.paid_hours)])
            prev.salaries += r.salaries or [SdupSalary(r.group_code, r.weekly_hours, r.work_time_mode,
                                                       r.brutto, r.extra, r.paid_hours)]
        else:
            merged[key] = r
    for r in merged.values():
        if r.salaries:                     # ta pati grupė dviejose eilutėse -> sumuojama (x-unique-prof-groups)
            by_group = {}
            for sal in r.salaries:
                g = by_group.get(sal.group_code)
                if g is None:
                    by_group[sal.group_code] = SdupSalary(sal.group_code, sal.weekly_hours, sal.work_time_mode,
                                                          sal.brutto, sal.extra, sal.paid_hours)
                else:
                    g.weekly_hours = max(g.weekly_hours, sal.weekly_hours)
                    g.brutto += sal.brutto
                    g.extra += sal.extra
                    g.paid_hours += sal.paid_hours
            r.salaries = list(by_group.values())

    entries = []
    for r in merged.values():
        who = f"{r.first_name} {r.last_name}".strip()
        name, surname = _clean_name(r.first_name), _clean_name(r.last_name)
        for label, v in (("Vardas", name), ("Pavardė", surname)):
            if not v or not NAME_RE.match(v) or len(v) > 50:
                errors.append(f"{who}: {label.lower()} gali būti tik iš raidžių (iki 50 simbolių)")

        emp = {"name": name, "surname": surname}
        if r.person_code:
            from .personal_code import parse as parse_code
            if not re.fullmatch(r"\d{11}", r.person_code) or not parse_code(r.person_code).valid:
                errors.append(f"{who}: neteisingas asmens kodas")
            emp["personCode"] = r.person_code
        if r.ssn:
            if not SSN_RE.match(r.ssn):
                errors.append(f"{who}: SD numeris turi būti 2 raidės ir 7 skaitmenys")
            emp["personSSN"] = r.ssn
        if r.iltu:
            emp["personILTU"] = r.iltu
        if not (r.person_code or r.ssn or r.iltu):
            errors.append(f"{who}: reikia asmens kodo, SD numerio arba ILTU kodo")
        if not r.person_code:
            if not r.birth_date:
                errors.append(f"{who}: be asmens kodo būtina gimimo data")
            else:
                emp["birthDate"] = r.birth_date

        coded = gender_from_code(r.person_code)
        gender = coded or r.gender           # schema: lytis turi atitikti asmens kodą (x-match-code-and-gender)
        if coded and r.gender and r.gender != coded:
            errors.append(f"⚠ {who}: kortelėje nurodyta lytis nesutampa su asmens kodu - naudojama pagal kodą")
        if gender not in ("M", "F"):
            errors.append(f"{who}: nenurodyta lytis")
        emp["gender"] = gender or ""

        salaries = r.salaries or [SdupSalary(r.group_code, r.weekly_hours, r.work_time_mode,
                                             r.brutto, r.extra, r.paid_hours)]
        infos, seen = [], set()
        for sal in salaries:
            if not GROUP_RE.match(sal.group_code or ""):
                errors.append(f"{who}: nepriskirta pareigybių grupė (arba netinkamas grupės numeris)")
            if sal.group_code in seen:
                errors.append(f"{who}: grupė {sal.group_code} kartojasi")
            seen.add(sal.group_code)
            if sal.work_time_mode not in WORK_TIME_MODES:
                errors.append(f"{who}: neteisingas darbo laiko režimas")
            if not (ZERO <= sal.weekly_hours < Decimal("100")):
                errors.append(f"{who}: neteisinga savaitinė darbo laiko norma (iki 99,99 val.)")
            if sal.brutto < ZERO or sal.extra < ZERO:
                errors.append(f"{who}: neigiama DU suma - SDUP teikiamos tik teigiamos sumos (patikrinkite korekcijas)")
            if sal.extra > sal.brutto:
                errors.append(f"{who}: papildomas DU negali viršyti bruto DU")
            if sal.paid_hours >= Decimal("1000") or sal.paid_hours < ZERO:
                errors.append(f"{who}: apmokėtos valandos turi būti nuo 0 iki 999,99")
            infos.append({
                "profGroupNum": sal.group_code or "",
                "workTimeRate": fmt(sal.weekly_hours),
                "workTimeMode": sal.work_time_mode,
                "bruttoPayment": fmt(sal.brutto),
                "bruttoExtraPayment": fmt(sal.extra),
                "paidWorkHours": fmt(sal.paid_hours),
            })

        entries.append({"employeeInfo": emp, "salaryInfo": infos})

    if not entries:
        errors.append("Nėra darbuotojų")
    return {"insurerCode": insurer_code or "", "yearMonth": f"{year}-{month:02d}", "entries": entries}, errors


def split_by_groups(segments, latest_group, total_brutto, total_extra, total_hours,
                    weekly_by_group=None, mode="01"):
    """
    Pareigos (grupė) pasikeitė per mėnesį -> kelios salaryInfo eilutės.
    segments: [(group_code, bazinio DU suma, dirbtos val.)] - alga/valandinis pagal sutarties sąlygų laikotarpius.
    Visa kita (premijos, atostoginiai, papildomas DU, kitos valandos) priskiriama paskutinei grupei.
    """
    weekly_by_group = weekly_by_group or {}
    acc = {}
    for group, amount, hours in segments:
        a = acc.setdefault(group, [ZERO, ZERO])
        a[0] += amount
        a[1] += hours
    if len(acc) <= 1:
        return None
    seg_amount = sum((v[0] for v in acc.values()), ZERO)
    seg_hours = sum((v[1] for v in acc.values()), ZERO)
    last = acc.setdefault(latest_group, [ZERO, ZERO])
    last[0] += total_brutto - seg_amount
    last[1] += total_hours - seg_hours
    return [SdupSalary(g, weekly_by_group.get(g, Decimal("40")), mode, q2(v[0]),
                       total_extra if g == latest_group else ZERO, v[1]) for g, v in acc.items()]
