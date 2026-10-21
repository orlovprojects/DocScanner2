"""
GPM312 - metinė gyventojams išmokėtų išmokų deklaracija (VMI). L priedas - nuolatiniai LT gyventojai.
Eilutė = gyventojas x išmokos kodas x natūra x GPM tarifas (VMI: skirtingų rūšių / tarifų išmokos - atskiros eilutės).
  L8  - išmokų suma (neatėmus NPD, GPM, VSD, PSD);  L9 - tarifas (0, jei pritaikius NPD GPM = 0);
  L10 - išskaičiuotas GPM;  L11 - išmokėjusio asmens lėšomis sumokėtas GPM.
Pateikiama iki kitų metų vasario 15 d.
"""
from dataclasses import dataclass
from decimal import Decimal

from .ffdata import build_ffdata, load_spec, num

ZERO = Decimal("0")
ROWS_PER_PAGE = 10


@dataclass
class Gpm312Row:
    code: str              # L1 - asmens kodas
    id_type: str           # L2 - 1: asmens kodas
    name: str              # L3
    income_code: str       # L5 - 01, 03, 05, 07, 08, 73, 74...
    amount: Decimal        # L8
    rate: Decimal          # L9
    gpm: Decimal = ZERO    # L10
    natura: str = ""       # L6 - "N" / "A"
    klass: str = "A"       # L4
    employer_paid_gpm: Decimal = ZERO   # L11


def validate(company_code, company_name, rows):
    errors = []
    if not company_code:
        errors.append("Nenurodytas įmonės kodas")
    if not company_name:
        errors.append("Nenurodytas įmonės pavadinimas")
    for r in rows:
        if not r.code:
            errors.append(f"{r.name}: nėra asmens kodo")
        if r.gpm > r.amount:
            errors.append(f"{r.name}: GPM didesnis už išmokų sumą (kodas {r.income_code})")
    return errors


def to_ffdata(company_code, company_name, year, rows, **kw):
    spec = load_spec("vmi", "GPM312-v1")
    code = "".join(ch for ch in (company_code or "") if ch.isdigit())
    head = {
        "B_MM_ID": code, "B_MM_Pavad": (company_name or "").upper()[:58], "B_ML_Metai": str(year),
        "G4": num(sum((r.amount for r in rows), ZERO)), "G5": num(sum((r.gpm for r in rows), ZERO)),
        "G6": num(sum((r.employer_paid_gpm for r in rows), ZERO)), "G7": num(ZERO),
        "B_FormNr": "", "B_FormVerNr": "",
    }
    pages = [("GPM312", head)]
    for p, i in enumerate(range(0, len(rows), ROWS_PER_PAGE), start=1):
        vals = {"B_MM_ID": code, "B_ML_Metai": str(year), "B_FormNr": "", "B_FormVerNr": "", "LapoNr": str(p)}
        for n, r in enumerate(rows[i:i + ROWS_PER_PAGE], start=1):
            vals.update({
                f"L1-{n}": r.code, f"L2-{n}": r.id_type, f"L3-{n}": r.name.upper()[:34], f"L4-{n}": r.klass,
                f"L5-{n}": r.income_code, f"L6-{n}": r.natura, f"L8-{n}": num(r.amount), f"L9-{n}": num(r.rate),
                f"L10-{n}": num(r.gpm) if r.gpm or not r.natura else "",
                f"L11-{n}": num(r.employer_paid_gpm) if r.employer_paid_gpm else "",
            })
        pages.append(("GPM312L", vals))
    return build_ffdata(spec, pages, document_pages=False, **kw)
