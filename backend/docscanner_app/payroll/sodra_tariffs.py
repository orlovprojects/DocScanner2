"""
Sodros ataskaita S47 „Apdraustiesiems asmenims nustatyti įmokų tarifai“ (vienam mėnesiui, XML) ->
sutikrinimas su DokSkenas kortelėmis prieš teikiant SAM (nebūtinas, bukalterio pasirinkimu).

Tikrinama: pensijų kaupimas (ApdrPkTrf > 0), terminuota sutartis (darbdavio tarifas DrdTrf > 1,77),
ar darbuotojas yra abiejose pusėse.
"""
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

EMPLOYER_STD = Decimal("1.77")


def _dec(v):
    try:
        return Decimal(str(v or "0").replace(",", ".").strip() or "0")
    except InvalidOperation:
        return Decimal("0")


def _tags(block):
    return {k: v.strip() for k, v in re.findall(r"<(\w+)>([^<]*)</\1>", block)}


@dataclass
class TariffRow:
    person_code: str
    name: str
    date_from: date
    date_to: date
    total: Decimal
    employer: Decimal
    pension: Decimal
    fund: str = ""

    @property
    def fixed_term(self):
        return self.employer > EMPLOYER_STD + Decimal("0.01")


def parse(content):
    """bytes|str -> [TariffRow] arba None, jei tai ne S47"""
    xml = content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else content
    if 'pavadinimas="apdraustuju_tarifai_2019"' not in xml[:4000]:
        return None
    out = []
    for block in re.findall(r"<Asmuo>(.*?)</Asmuo>", xml, re.S):
        t = _tags(block)
        code = re.sub(r"\D", "", t.get("AsmKodas", ""))
        if not code:
            continue
        out.append(TariffRow(
            code, f"{t.get('AsmVardas', '').title()} {t.get('AsmPavarde', '').title()}".strip(),
            date.fromisoformat(t["AsmDataNuo"]) if t.get("AsmDataNuo") else None,
            date.fromisoformat(t["AsmDataIki"]) if t.get("AsmDataIki") else None,
            _dec(t.get("BendrTrf")), _dec(t.get("DrdTrf")), _dec(t.get("ApdrPkTrf")),
            t.get("ApdrPkb", "").replace("&quot;", '"')))
    return out


def compare(rows, ours):
    """
    rows: [TariffRow]; ours: {asmens kodas: {"name", "pension", "fixed_term", "employee_id"}} - aktyvūs tą mėnesį.
    -> [{"employee", "employee_id", "issue", "sodra", "ours", "fix"}]
    """
    issues, seen = [], set()
    by_code = {}
    for r in rows:                                    # vienam asmeniui - paskutinis laikotarpis mėnesyje
        if r.person_code not in by_code or (r.date_from or date.min) >= (by_code[r.person_code].date_from or date.min):
            by_code[r.person_code] = r
    for code, r in by_code.items():
        seen.add(code)
        o = ours.get(code)
        if o is None:
            issues.append({"employee": r.name, "employee_id": None, "issue": "Sodroje yra, DokSkenas – nėra (arba nedirba)",
                           "sodra": f"{r.total} %", "ours": "–", "fix": None})
            continue
        if (r.pension > 0) != bool(o["pension"]):
            issues.append({
                "employee": o["name"], "employee_id": o["employee_id"], "issue": "Pensijų kaupimas",
                "sodra": f"kaupia (+{r.pension} %)" + (f", {r.fund}" if r.fund else "") if r.pension > 0 else "nekaupia",
                "ours": "kaupia" if o["pension"] else "nekaupia",
                "fix": {"field": "pension_accumulation", "value": r.pension > 0}})
        if r.fixed_term != bool(o["fixed_term"]):
            issues.append({
                "employee": o["name"], "employee_id": o["employee_id"], "issue": "Sutarties rūšis (darbdavio tarifas)",
                "sodra": f"{'terminuota' if r.fixed_term else 'neterminuota'} ({r.employer} %)",
                "ours": "terminuota" if o["fixed_term"] else "neterminuota", "fix": None})
    for code, o in ours.items():
        if code not in seen:
            issues.append({"employee": o["name"], "employee_id": o["employee_id"],
                           "issue": "DokSkenas dirba, Sodroje šį mėnesį nėra", "sodra": "–", "ours": "dirba", "fix": None})
    return issues, len(by_code)


# ============================================================
# Django
# ============================================================

def run_check(company, rows):
    from docscanner_app.models import Employee
    from .services import _active_contract, month_bounds
    if not rows:
        return {"month": None, "checked": 0, "issues": []}
    d = rows[0].date_from or date.today()
    first, last = month_bounds(d.year, d.month)
    ours = {}
    for e in Employee.objects.filter(company=company).exclude(personal_code=""):
        c = _active_contract(e, first, last)
        if c is None:
            continue
        ours[e.personal_code] = {"name": e.full_name, "pension": e.pension_accumulation, "employee_id": e.id,
                                 "fixed_term": (c.sodra_contract_type or "01") != "01"}
    issues, checked = compare(rows, ours)
    return {"month": f"{d.year}-{d.month:02d}", "checked": checked, "issues": issues}


def apply_fix(company, employee_id, field, value):
    from docscanner_app.models import Employee
    if field != "pension_accumulation":
        raise ValueError("Šio lauko automatiškai keisti negalima")
    e = Employee.objects.get(id=employee_id, company=company)
    e.pension_accumulation = bool(value)
    e.save(update_fields=["pension_accumulation", "updated_at"])
    return e
