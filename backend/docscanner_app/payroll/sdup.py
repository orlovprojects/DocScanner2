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

    entries = []
    for r in rows:
        who = f"{r.first_name} {r.last_name}".strip()
        name, surname = _clean_name(r.first_name), _clean_name(r.last_name)
        for label, v in (("Vardas", name), ("Pavardė", surname)):
            if not v or not NAME_RE.match(v) or len(v) > 50:
                errors.append(f"{who}: {label.lower()} gali būti tik iš raidžių (iki 50 simbolių)")

        emp = {"name": name, "surname": surname}
        if r.person_code:
            if not re.fullmatch(r"\d{11}", r.person_code):
                errors.append(f"{who}: neteisingas asmens kodas")
            emp["personCode"] = r.person_code
        if r.ssn:
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

        gender = r.gender or gender_from_code(r.person_code)
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
                errors.append(f"{who}: neteisinga savaitinė darbo laiko norma")
            if sal.extra > sal.brutto:
                errors.append(f"{who}: papildomas DU negali viršyti bruto DU")
            if sal.paid_hours >= Decimal("1000"):
                errors.append(f"{who}: per daug apmokėtų valandų")
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
