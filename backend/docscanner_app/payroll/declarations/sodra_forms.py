"""
Sodros pranešimai SAM (v07), 1-SD (v11), 2-SD (v09) -> FFData.
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
