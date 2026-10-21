"""
Sodros pranešimai SAM (v07), 1-SD (v11), 2-SD (v09), 9-SD (v06), 12-SD (v05) -> FFData.
Grynas modulis: duomenų klasės -> (bytes, klaidos).

Sutikrinta su tikrais priimtais failais (ABBYY / EDAS): žymimieji laukai "1" / "0",
tekstai DIDŽIOSIOMIS raidėmis, sumos "0,00", tęsinio lapų versija = formos versija, DocDate/DocNumber užpildomi.
⚠ U1Group (1-SD v11): 1 - turi LT asmens kodą, 2 - užsienietis be LT asmens kodo - dar nesutikrinta.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .ffdata import build_ffdata, load_spec, num

ZERO = Decimal("0")
CHECKED, UNCHECKED = "1", "0"
CONTRACT_TEXT = {
    "01": "NETERMINUOTA DARBO SUTARTIS", "02": "TERMINUOTA DARBO SUTARTIS", "03": "LAIKINOJO DARBO SUTARTIS",
    "04": "PAMEISTRYSTĖS DARBO SUTARTIS", "05": "PROJEKTINIO DARBO SUTARTIS",
    "06": "DARBO VIETOS DALIJIMOSI DARBO SUTARTIS", "07": "DARBO KELIEMS DARBDAVIAMS SUTARTIS",
    "08": "SEZONINIO DARBO SUTARTIS",
}


def _doc(prefix, d):
    d = d or date.today()
    return {"DocDate": d.isoformat(), "DocNumber": f"{prefix}{d:%Y%m%d}"}


@dataclass
class Insurer:
    name: str
    code: str                 # Sodros draudėjo kodas (iki 7 sk.)
    company_code: str         # juridinio asmens kodas
    phone: str = ""
    address: str = ""
    manager: str = ""
    preparator: str = ""
    manager_position: str = ""


@dataclass
class Person:
    first_name: str
    last_name: str
    person_code: str = ""
    sd_series: str = ""
    sd_number: str = ""
    foreign_code: str = ""
    birth_date: date = None
    is_foreigner: bool = False


def _person_fields(p, n):
    f = {f"PersonFirstName_{n}": p.first_name.upper(), f"PersonLastName_{n}": p.last_name.upper()}
    if p.person_code and not p.is_foreigner:
        f[f"PersonCode_{n}"] = p.person_code
    if p.sd_series and p.sd_number:
        f[f"InsuranceSeries_{n}"] = p.sd_series
        f[f"InsuranceNumber_{n}"] = p.sd_number
    return f


def _insurer_errors(ins):
    e = []
    if not (ins.code or "").isdigit():
        e.append("Nenurodytas Sodros draudėjo kodas (DU nustatymuose)")
    if not ins.name:
        e.append("Nenurodytas įmonės pavadinimas")
    return e


def _person_errors(p):
    who = f"{p.first_name} {p.last_name}"
    if not p.is_foreigner and len(p.person_code or "") != 11:
        return [f"{who}: nėra asmens kodo"]
    if p.is_foreigner and not (p.sd_series and p.sd_number) and not p.birth_date:
        return [f"{who}: užsieniečiui reikia SD numerio arba gimimo datos"]
    return []


# ============================================================
# SAM - mėnesinis pranešimas apie apdraustųjų pajamas ir įmokas
# ============================================================

@dataclass
class SamRow:
    person: Person
    income: Decimal       # A11 - draudžiamosios pajamos
    rate: Decimal         # P3 - bendras tarifas
    payment: Decimal      # A12 - įmokų suma


def build_sam(ins, year, month, rows, doc_date=None):
    spec = load_spec("sodra", "SAM-v07")
    errors = _insurer_errors(ins)
    for r in rows:
        errors += _person_errors(r.person)
    per = spec["pages"]["SAM3SD"]["rows_per_page"]
    chunks = [rows[i:i + per] for i in range(0, len(rows), per)] or []
    tot_inc = sum((r.income for r in rows), ZERO)
    tot_pay = sum((r.payment for r in rows), ZERO)
    doc = {"DocDate": (doc_date or date.today()).isoformat(), "DocNumber": f"SAM{year}{month:02d}"}
    head = {
        "InsurerName": ins.name[:68], "InsurerCode": ins.code, "JuridicalPersonCode": ins.company_code,
        "InsurerPhone": ins.phone[:15], "InsurerAddress": ins.address[:68],
        "CycleYear": str(year), "CycleMonth": str(month), "RevisedDocument": UNCHECKED,
        "Appendixes2": UNCHECKED, "Appendixes3": UNCHECKED,
        "ManagerFullName": ins.manager[:68], "PreparatorDetails": ins.preparator[:68],
        "FormCode": "SAM", "FormVersion": "07", **doc,
    }
    if chunks:
        head.update({
            "Appendixes2": CHECKED, "Apdx2PageCount": str(len(chunks)), "Apdx2PersonCount": str(len(rows)),
            "Apdx2InsIncomeSum": num(tot_inc), "Apdx2PaymentSum": num(tot_pay),
            "ApdxPageCountTotal": str(len(chunks)),
        })
    pages = [("SAM", head)]
    row_no = 0
    for i, chunk in enumerate(chunks, start=1):
        pv = {"InsurerCode": ins.code, "PageNumber": str(i), "PageTotal": str(len(chunks)),
              "InsIncomePage": num(sum((r.income for r in chunk), ZERO)),
              "PaymentPage": num(sum((r.payment for r in chunk), ZERO)),
              "FormCode": "SAM3SD", "FormVersion": "07", **doc}
        for n, r in enumerate(chunk, start=1):
            row_no += 1
            pv.update(_person_fields(r.person, n))
            pv.update({f"RowNumber_{n}": str(row_no), f"InsIncomeSum_{n}": num(r.income),
                       f"TaxRate_{n}": num(r.rate), f"PaymentSum_{n}": num(r.payment)})
        pages.append(("SAM3SD", pv))
    return build_ffdata(spec, pages, created_on=doc_date), errors


# ============================================================
# 1-SD - apdraustojo valstybiniu socialiniu draudimu pradžia
# ============================================================

@dataclass
class HireRow:
    person: Person
    start_date: date
    contract_type: str = "01"
    contract_subtype: str = ""
    lpk_code: str = ""


def build_1sd(ins, rows, doc_date=None):
    spec = load_spec("sodra", "1-SD-v11")
    errors = _insurer_errors(ins)
    first, per = spec["pages"]["1-SD"]["rows_per_page"], spec["pages"]["1-SD-T"]["rows_per_page"]
    chunks = [rows[:first]] + [rows[i:i + per] for i in range(first, len(rows), per)]
    total_pages = len(chunks)
    pages, row_no = [], 0
    for i, chunk in enumerate(chunks, start=1):
        name = "1-SD" if i == 1 else "1-SD-T"
        pv = {"InsurerCode": ins.code, "PageNumber": str(i), "PageTotal": str(total_pages),
              "FormCode": name, "FormVersion": "11", **_doc("PR", doc_date)}
        if i == 1:
            pv.update({"InsurerName": ins.name[:68], "JuridicalPersonCode": ins.company_code,
                       "InsurerPhone": ins.phone[:15], "InsurerAddress": ins.address[:68],
                       "PersonCountTotal": str(len(rows)), "ManagerFullName": ins.manager[:68],
                       "PreparatorDetails": ins.preparator[:68]})
        for n, r in enumerate(chunk, start=1):
            row_no += 1
            p = r.person
            errors += _person_errors(p)
            if len(r.lpk_code or "") < 4:
                errors.append(f"{p.first_name} {p.last_name}: nėra profesijos kodo (LPK)")
            pv.update(_person_fields(p, n))
            pv.update({
                f"RowNumber_{n}": str(row_no), f"InsuranceStartDate_{n}": r.start_date.isoformat(),
                f"U1Group_{n}": "2" if p.is_foreigner and not p.person_code else "1",
                f"ReasonCode_{n}": "01", f"ReasonText_{n}": "PRIĖMIMAS Į DARBĄ (PAGAL DARBO SUTARTĮ)",
                f"ReasonDetCode_{n}": r.contract_type, f"ReasonDetText_{n}": CONTRACT_TEXT.get(r.contract_type, ""),
            })
            if p.is_foreigner and not p.person_code and p.birth_date:
                pv[f"PersonBirthDate_{n}"] = p.birth_date.isoformat()
            if p.foreign_code:
                pv[f"PersonForeignCode_{n}"] = p.foreign_code
            if r.contract_subtype:
                pv[f"ReasonDetTypeCode_{n}"] = r.contract_subtype
                pv[f"ReasonDetTypeText_{n}"] = "TERMINUOTA" if r.contract_subtype.endswith("1") else "NETERMINUOTA"
            for k, digit in enumerate((r.lpk_code or "")[:4], start=1):
                pv[f"PersonProfession_{k}_{n}"] = digit
        pages.append((name, pv))
    return build_ffdata(spec, pages, created_on=doc_date), errors


# ============================================================
# 2-SD - apdraustojo valstybiniu socialiniu draudimu pabaiga
# ============================================================

@dataclass
class DismissalRow:
    person: Person
    end_date: date
    article: str                   # DK straipsnis, pvz. "55"
    part: str = "1"
    point: str = ""
    compensated_months: Decimal = ZERO   # išeitinės išmokos mėnesiai
    income: Decimal = None               # paskutinio mėnesio draudžiamosios pajamos
    rate: Decimal = None
    payment: Decimal = None


def build_2sd(ins, rows, doc_date=None):
    spec = load_spec("sodra", "2-SD-v09")
    errors = _insurer_errors(ins)
    first, per = spec["pages"]["2-SD"]["rows_per_page"], spec["pages"]["2-SD-T"]["rows_per_page"]
    chunks = [rows[:first]] + [rows[i:i + per] for i in range(first, len(rows), per)]
    total_pages = len(chunks)
    tot_inc = sum((r.income or ZERO for r in rows), ZERO)
    tot_pay = sum((r.payment or ZERO for r in rows), ZERO)
    pages, row_no = [], 0
    for i, chunk in enumerate(chunks, start=1):
        name = "2-SD" if i == 1 else "2-SD-T"
        pv = {"InsurerCode": ins.code, "PageNumber": str(i), "PageTotal": str(total_pages),
              "FormCode": name, "FormVersion": "09", **_doc("ATL", doc_date)}
        if i == 1:
            pv.update({"InsurerName": ins.name[:68], "JuridicalPersonCode": ins.company_code,
                       "InsurerPhone": ins.phone[:15], "InsurerAddress": ins.address[:68],
                       "PersonCountTotal": str(len(rows)), "InsIncomeTotal": num(tot_inc),
                       "PaymentTotal": num(tot_pay), "ManagerFullName": ins.manager[:68],
                       "PreparatorDetails": ins.preparator[:68]})
        else:
            pv.update({"InsIncomePage": num(sum((r.income or ZERO for r in chunk), ZERO)),
                       "PaymentPage": num(sum((r.payment or ZERO for r in chunk), ZERO))})
        for n, r in enumerate(chunk, start=1):
            row_no += 1
            errors += _person_errors(r.person)
            if r.income is None:
                errors.append(f"{r.person.first_name} {r.person.last_name}: nepatvirtintas paskutinio mėnesio "
                              "atlyginimas - pajamų ir įmokų sumos neužpildytos")
            pv.update(_person_fields(r.person, n))
            pv.update({
                f"RowNumber_{n}": str(row_no), f"InsuranceEndDate_{n}": r.end_date.isoformat(),
                f"ReasonCode_{n}": "02", f"ReasonText_{n}": "ATLEIDIMAS IŠ DARBO (PAGAL DARBO SUTARTĮ)",
                f"ReasonDetCode_{n}": "K01", f"ReasonDetText_{n}": "DARBO KODEKSAS",
                f"LawActArticle_{n}": r.article, f"LawActPart_{n}": r.part, f"LawActSubsection_{n}": r.point,
                f"CompensatedMonthsCount_{n}": num(r.compensated_months),
                f"InsIncomeSum_{n}": num(r.income) if r.income is not None else "",
                f"TaxRate_{n}": num(r.rate) if r.rate is not None else "",
                f"PaymentSum_{n}": num(r.payment) if r.payment is not None else "",
            })
        pages.append((name, pv))
    return build_ffdata(spec, pages, created_on=doc_date), errors


# ============================================================
# 12-SD - nedraudiminiai laikotarpiai (nemokamos atostogos, pravaikšta, nušalinimas...)
# Sutikrinta su priimtu EDAS failu (2021): keli darbuotojai vienoje formoje, 2 eil. 1 lape, 4 - tęsinio lapuose.
# ============================================================

REASONS_12SD = {
    "01": "NEMOKAMOS ATOSTOGOS",
    "02": "ATOSTOGOS KVALIFIKACIJAI TOBULINTI",
    "03": "KŪRYBINĖS ATOSTOGOS",
    "04": "MOKYMOSI ATOSTOGOS",
    "05": "NEATVYKIMAS ADMINISTRACIJOS LEIDIMU",
    "06": "ATOSTOGOS VAIKUI PRIŽIŪRĖTI (KITIEMS GIMINAIČIAMS)",
    "07": "IŠDUOTA MEDICININĖ PAŽYMA (FORMA NR. 094/A)",
    "08": "NUŠALINIMAS NUO DARBO (PAREIGŲ)",
    "09": "PRAVAIKŠTA",
    "10": "KARO TARNYBA",
}


@dataclass
class SuspendRow:
    person: Person
    start: date
    end: date = None
    reason: str = "01"


def build_12sd(ins, rows, doc_date=None, doc_number=None):
    spec = load_spec("sodra", "12-SD-v05")
    errors = _insurer_errors(ins)
    first, per = spec["pages"]["12-SD"]["rows_per_page"], spec["pages"]["12-SD-T"]["rows_per_page"]
    chunks = [rows[:first]] + [rows[i:i + per] for i in range(first, len(rows), per)]
    doc = _doc("ND", doc_date)
    if doc_number:
        doc["DocNumber"] = doc_number[:16]
    pages, row_no = [], 0
    for i, chunk in enumerate(chunks, start=1):
        name = "12-SD" if i == 1 else "12-SD-T"
        pv = {"InsurerCode": ins.code, "PageNumber": str(i), "PageTotal": str(len(chunks)),
              "FormCode": name, "FormVersion": "05", **doc}
        if i == 1:
            pv.update({"InsurerName": ins.name[:68], "JuridicalPersonCode": ins.company_code,
                       "InsurerPhone": ins.phone[:15], "InsurerAddress": ins.address[:68],
                       "PersonCountTotal": str(len(rows)), "ManagerFullName": ins.manager[:68],
                       "PreparatorDetails": ins.preparator[:68]})
        for n, r in enumerate(chunk, start=1):
            row_no += 1
            errors += _person_errors(r.person)
            if r.reason not in REASONS_12SD:
                errors.append(f"{r.person.first_name} {r.person.last_name}: nežinomas 12-SD priežasties kodas")
            pv.update(_person_fields(r.person, n))
            pv.update({f"RowNumber_{n}": str(row_no), f"InsuranceSuspendStart_{n}": r.start.isoformat(),
                       f"InsuranceSuspendEnd_{n}": r.end.isoformat() if r.end else "",
                       f"ReasonCode_{n}": r.reason, f"ReasonText_{n}": REASONS_12SD.get(r.reason, "")})
        pages.append((name, pv))
    return build_ffdata(spec, pages, created_on=doc_date), errors


# ============================================================
# 9-SD - tėvystės atostogos / atostogos vaikui prižiūrėti (vienas darbuotojas formoje)
# Sutikrinta su priimtu EDAS failu (2023).
# ============================================================

REASONS_9SD = {
    "01": "TĖVYSTĖS ATOSTOGOS",
    "02": "ATOSTOGOS VAIKUI PRIŽIŪRĖTI",
    "06": "TĖVYSTĖS ATOSTOGOS (DK 133 STR. 2D. NUO 2018-01-01)",
    "07": "ATOSTOGOS SENELEI (SENELIUI) VAIKUI PRIŽIŪRĖTI IKI 3 METŲ",
}


@dataclass
class ChildLeave:
    person: Person
    start: date
    end: date
    reason: str = "02"
    child_birth_date: date = None
    child_code: str = ""
    cancel_date: date = None          # atšaukta / grįžo anksčiau - paskutinė atostogų diena


def build_9sd(ins, leave, doc_date=None, doc_number=None):
    spec = load_spec("sodra", "9-SD-v06")
    errors = _insurer_errors(ins) + _person_errors(leave.person)
    p = leave.person
    if leave.reason not in REASONS_9SD:
        errors.append("Nežinomas 9-SD priežasties kodas")
    if not leave.child_birth_date and not leave.child_code:
        errors.append(f"{p.first_name} {p.last_name}: nenurodytas vaikas (gimimo data) - pasirinkite vaiką nebuvime")
    doc = _doc("VP", doc_date)
    if doc_number:
        doc["DocNumber"] = doc_number[:16]
    pv = {"FormCode": "9-SD", "FormVersion": "06", "InsurerName": ins.name[:68], "InsurerCode": ins.code,
          "JuridicalPersonCode": ins.company_code, "InsurerPhone": ins.phone[:15], "InsurerAddress": ins.address[:68],
          **doc, "PersonFirstName": p.first_name.upper(), "PersonLastName": p.last_name.upper(),
          "HolidayStartDate": leave.start.isoformat(), "HolidayEndDate": leave.end.isoformat() if leave.end else "",
          "ManagerFullName": ins.manager[:68], "PreparatorDetails": ins.preparator[:68],
          "ReasonCode_1": leave.reason, "ReasonText_1": REASONS_9SD.get(leave.reason, "")}
    if p.person_code and not p.is_foreigner:
        pv["PersonCode"] = p.person_code
    if p.sd_series and p.sd_number:
        pv["InsuranceSeries"], pv["InsuranceNumber"] = p.sd_series, p.sd_number
    if leave.child_birth_date:
        pv["ChildBirthDate"] = leave.child_birth_date.isoformat()
    if leave.child_code:
        pv["ChildPersonCode"] = leave.child_code
    if leave.cancel_date:
        pv["HolidayCancelDate"] = leave.cancel_date.isoformat()
    return build_ffdata(spec, [("9-SD", pv)], created_on=doc_date), errors


# ============================================================
# NP-SD2 - duomenys ligos (nėštumo ir gimdymo) išmokai skirti; vienas darbuotojas, vienas laikotarpis.
# Laukų pavadinimai - pagal tikrą EDAS eksportą (v01): A5_Start, A6_End, A7.
# Sodros instrukcija: A5/A6 - nedarbingumo laikotarpis (tik praėjęs), A7 - 1 nėštumo ir gimdymo atostogos / 0,
# B1/B2 (iki 3) - dirbo ir gavo DU nedarbingumo metu, B3/B4 - mokamos atostogos, sutampančios su slauga,
# B5/B6 - laikotarpis, už kurį ligos išmoka iš darbdavio lėšų, B7 - jos suma (bruto),
# ReasonCode_1 (B8) - darbdavio išmokos neskyrimo priežastis.
# ============================================================

REASONS_NPSD2 = {
    "02": "DIRBO IR DĖL LAIKINOJO NEDARBINGUMO NEPRARADO PAJAMŲ",
    "03": "NESUTAPO SU DARBO GRAFIKU",
    "04": "PATEIKTAS NEDARBINGUMO PAŽYMĖJIMO TĘSINYS",
    "05": "SUTAPO SU NEDRAUDIMINIU LAIKOTARPIU",
    "06": "",          # kitos priežastys - tekstas įrašomas
}


@dataclass
class SickReport:
    person: Person
    start: date
    end: date
    maternity: bool = False
    worked: list = field(default_factory=list)       # [(nuo, iki)] - iki 3
    vacation: tuple = None                            # (nuo, iki) - tik slaugai
    employer_from: date = None
    employer_to: date = None
    employer_sum: Decimal = None
    reason: str = ""
    reason_text: str = ""
    doc_number: str = ""


def build_npsd2(ins, r, doc_date=None):
    spec = load_spec("sodra", "NP-SD2-v01")
    errors = _insurer_errors(ins) + _person_errors(r.person)
    if r.end < r.start:
        errors.append("Netinkamas nedarbingumo laikotarpis")
    if r.reason and r.reason not in REASONS_NPSD2:
        errors.append("Nežinomas darbdavio išmokos neskyrimo priežasties kodas")
    if r.reason == "06" and not r.reason_text:
        errors.append("Priežasčiai 06 reikia įrašyti tekstą")
    doc = _doc("LIG", doc_date)
    if r.doc_number:
        doc["DocNumber"] = r.doc_number[:16]
    pv = {"PageNumber": "1", "PageTotal": "1", "Currency": "EUR", "FormCode": "NP-SD2", "FormVersion": "01",
          "InsurerName": ins.name.upper()[:68], "InsurerCode": ins.code, "JuridicalPersonCode": ins.company_code,
          "InsurerPhone": ins.phone[:15], "InsurerAddress": (ins.address or "").upper()[:68], **doc,
          "PersonFirstName": r.person.first_name.upper()[:66], "PersonLastName": r.person.last_name.upper()[:66],
          "A5_Start": r.start.isoformat(), "A6_End": r.end.isoformat(), "A7": "1" if r.maternity else "0",
          "ManagerJobPosition": (getattr(ins, "manager_position", "") or "")[:30].upper(),
          "ManagerFullName": (ins.manager or "").upper()[:68], "PreparatorDetails": (ins.preparator or "").upper()[:68],
          "J_group": "-1"}
    if r.person.person_code and not r.person.is_foreigner:
        pv["PersonCode"] = r.person.person_code
    if r.person.sd_series and r.person.sd_number:
        pv["InsuranceSeries"], pv["InsuranceNumber"] = r.person.sd_series, r.person.sd_number
    for n, (a, b) in enumerate(r.worked[:3], start=1):
        pv[f"B1_Start_{n}"], pv[f"B2_End_{n}"] = a.isoformat(), b.isoformat()
    if r.vacation:
        pv["B3_Start"], pv["B4_End"] = r.vacation[0].isoformat(), r.vacation[1].isoformat()
    if r.employer_from:
        pv["B5_Start"] = r.employer_from.isoformat()
        if r.employer_to and r.employer_to != r.employer_from:
            pv["B6_End"] = r.employer_to.isoformat()
        pv["B7_PaymentSum"] = num(r.employer_sum or ZERO)
    if r.reason:
        pv["ReasonCode_1"] = r.reason
        pv["ReasonText_1"] = (r.reason_text or REASONS_NPSD2.get(r.reason, "")).upper()[:41]
    return build_ffdata(spec, [("NP-SD2", pv)], created_on=doc_date), errors
