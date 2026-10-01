"""
GPM313 - Mėnesinė pajamų mokesčio deklaracija (VMI, v.1). Tik suvestinės sumos, pagal IŠMOKĖJIMO mėnesį.
  G5  - su darbo santykiais susijusių apmokestinamų išmokų suma (bruto, su ligos 1-2 d.)
  G6  - GPM nuo išmokų, išmokėtų 1-15 d.;  G7 - po 15 d.
  G8-G10 - nesusijusios su darbo santykiais A kl. išmokos (pvz. dividendai) ir jų GPM
  G11-G12 - B kl. išmokos, nuo kurių išskaičiuotas GPM
"""
from dataclasses import dataclass
from decimal import Decimal

from .ffdata import build_ffdata, load_spec, num

ZERO = Decimal("0")


@dataclass
class Gpm313Data:
    company_code: str
    company_name: str
    year: int
    month: int
    g5: Decimal = ZERO
    g6: Decimal = ZERO
    g7: Decimal = ZERO
    g8: Decimal = ZERO
    g9: Decimal = ZERO
    g10: Decimal = ZERO
    g11: Decimal = ZERO
    g12: Decimal = ZERO


def validate(d):
    errors = []
    code = "".join(ch for ch in (d.company_code or "") if ch.isdigit())
    if len(code) not in (9, 10, 11):
        errors.append("Įmonės kodas turi būti 9–11 skaitmenų")
    if not d.company_name:
        errors.append("Nenurodytas įmonės pavadinimas")
    if not 1 <= d.month <= 12:
        errors.append("Neteisingas mėnuo")
    if d.g6 + d.g7 > d.g5:
        errors.append("Išskaičiuotas GPM (6+7) negali viršyti išmokų sumos (5)")
    if d.g9 + d.g10 > d.g8:
        errors.append("GPM (9+10) negali viršyti išmokų sumos (8)")
    return errors


def to_ffdata(d, **kw):
    spec = load_spec("vmi", "GPM313-v1")
    values = {
        "B_MM_ID": "".join(ch for ch in d.company_code if ch.isdigit()),
        "B_MM_Pavadinimas": d.company_name,
        "B_ML_Metai": str(d.year), "B_ML_Menuo": str(d.month),
        "G5": num(d.g5), "G6": num(d.g6), "G7": num(d.g7), "G8": num(d.g8), "G9": num(d.g9),
        "G10": num(d.g10), "G11": num(d.g11), "G12": num(d.g12),
        "B_FormNr": "", "B_FormVerNr": "",   # VMI eksporte palieka tuščius (užpildo šablonas)
    }
    return build_ffdata(spec, [("GPM313", values)], document_pages=False, **kw)
