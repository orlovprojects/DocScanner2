"""
Sodros ir VMI .ffdata failų skaitymas perėjimui iš kitos programos.
Forma atpažįstama pagal turinį (PageDefName), ne pagal failo pavadinimą.
"""
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

SUPPORTED = ("SAM", "1-SD", "2-SD", "9-SD", "12-SD", "GPM313", "GPM312", "S50", "S31", "S29", "S4", "S5", "S2", "S3", "S15")

# Sodros paskyros ataskaitos (XML): <Ataskaita pavadinimas="...">
SODRA_REPORTS = {
    "apdraustuju_imokos_2019": "S50", "apdraustuju_laikotarpiai": "S31", "apdraustuju_sarasas": "S29",
    "vaiko_prieziuros_atostogos": "S4", "nedraudiminiai_laikotarpiai": "S5", "draudimo_pradzios": "S2",
    "draudimo_pabaigos": "S3",
}


def dec(v):
    try:
        return Decimal(str(v or "0").replace("\xa0", "").replace(" ", "").replace(",", "."))
    except InvalidOperation:
        return Decimal("0")


def dt(v):
    try:
        return date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


@dataclass
class Person:
    code: str
    first_name: str = ""
    last_name: str = ""
    sd_series: str = ""
    sd_number: str = ""


@dataclass
class Parsed:
    form: str
    version: str = ""
    year: int = None
    month: int = None
    doc_date: date = None
    revised: bool = False
    rows: list = field(default_factory=list)       # formai būdingi įrašai (dict)
    header: dict = field(default_factory=dict)
    file_name: str = ""
    period: tuple = (None, None)                   # Sodros ataskaitoms - laikotarpis


def _pages(xml):
    out = []
    for m in re.finditer(r'<Page PageDefName="([^"]+)"[^>]*>(.*?)</Page>', xml, re.S):
        f = {}
        for k, v in re.findall(r'<Field Name="([^"]+)">([^<]*)</Field>', m.group(2)):
            f[k] = v.strip()
        for k in re.findall(r'<Field Name="([^"]+)"\s*/>', m.group(2)):
            f.setdefault(k, "")
        out.append((m.group(1), f))
    return out


def _rows(fields, sep="_"):
    """{"PersonCode_1": ..} -> [{"PersonCode": ..}, ...] (VMI L priedui sep="-")."""
    rows = {}
    for k, v in fields.items():
        m = re.match(rf"^(.*?){re.escape(sep)}(\d+)$", k)
        if m:
            rows.setdefault(int(m.group(2)), {})[m.group(1)] = v
    return [rows[n] for n in sorted(rows)]


def _person(r):
    return Person((r.get("PersonCode") or "").strip(), (r.get("PersonFirstName") or "").strip().title(),
                  (r.get("PersonLastName") or "").strip().title(),
                  (r.get("InsuranceSeries") or "").strip(), (r.get("InsuranceNumber") or "").strip())


def detect(pages):
    names = {p for p, _ in pages}
    for form in ("GPM313", "GPM312", "SAM", "1-SD", "2-SD", "9-SD", "12-SD"):
        if form in names:
            return form
    return None


def _tags(block):
    return {k: v.strip() for k, v in re.findall(r"<(\w+)>([^<]*)</\1>", block)}


def _sd(v):
    v = (v or "").replace(" ", "")
    m = re.match(r"^([A-Z]{2})0*(\d+)$", v)
    return (m.group(1), m.group(2)) if m else ("", "")


def _rperson(t):
    code = t.get("AsmensKodas") or t.get("AsmKodas") or ""
    ser, num = (t.get("SdSer", ""), t.get("SdNum", "")) if t.get("SdSer") else _sd(t.get("SDNumeris") or t.get("AsmSocDrNr"))
    return Person(code, (t.get("Vardas") or t.get("AsmVardas") or "").title(),
                  (t.get("Pavarde") or t.get("AsmPavarde") or "").title(), ser, num)


def _parse_report(xml, file_name):
    """Sodros ataskaita (XML) -> Parsed"""
    m = re.search(r'<Ataskaita pavadinimas="([^"]+)"', xml)
    form = SODRA_REPORTS.get(m.group(1)) if m else None
    if form is None:
        return None
    head = _tags(re.search(r"<AntrastesDuomenys>(.*?)</AntrastesDuomenys>", xml, re.S).group(1)) \
        if "<AntrastesDuomenys>" in xml else {}
    p = Parsed(form, file_name=file_name, header=head)
    p.period = (dt(head.get("DataNuo")), dt(head.get("DataIki") or head.get("Data")))
    if form == "S50":
        for block in re.findall(r"<Asmuo>(.*?)</Asmuo>", xml, re.S):
            per = _rperson(_tags(block.split("<AsmuoDuom>")[0]))
            year = None
            for row in re.findall(r"<AsmuoDuom>(.*?)</AsmuoDuom>", block, re.S):
                t = _tags(row)
                if (t.get("Metai") or "").isdigit():
                    year = int(t["Metai"])
                if not (t.get("Menuo") or "").isdigit() or year is None:
                    continue                                    # „Viso“ eilutės
                p.rows.append({"person": per, "year": year, "month": int(t["Menuo"]), "income": dec(t.get("Uzm")),
                               "rate": dec(t.get("Tarifas")), "contrib": dec(t.get("Imk")), "pran": t.get("Pran", "")})
    elif form == "S29":
        for block in re.findall(r"<Tarifas>(.*?)</Tarifas>", xml, re.S):
            rate = dec(_tags(block).get("TarifoReiksme"))
            for d in re.findall(r"<Draudimas>(.*?)</Draudimas>", block, re.S):
                t = _tags(d)
                p.rows.append({"person": _rperson(t), "start": dt(t.get("DraudimoPradzia")),
                               "lpk4": t.get("Profesija", ""), "rate": rate})
    else:
        tag = {"S31": "DrdLaikotarpis", "S4": "VaikoPrieziurosAtostogos", "S5": "NedraudiminisLaikotarpis",
               "S2": "Asmuo", "S3": "Asmuo"}[form]
        for block in re.findall(rf"<{tag}>(.*?)</{tag}>", xml, re.S):
            t = _tags(block)
            row = {"person": _rperson(t)}
            if form == "S31":
                row.update(start=dt(t.get("DraudimoPradzia")), end=dt(t.get("DraudimoPabaiga")),
                           reason=t.get("Priezastis", ""))
            elif form == "S4":
                row.update(start=dt(t.get("AtostoguPradzia")), end=dt(t.get("AtostoguPabaiga")),
                           cancel=dt(t.get("Nutraukimas")), reason="06" if t.get("TevystesAtostogos") == "T" else "02")
            elif form == "S5":
                row.update(start=dt(t.get("LaikotarpioPradzia")), end=dt(t.get("LaikotarpioPabaiga")), reason="")
            elif form == "S2":
                row.update(start=dt(t.get("DraudimoPradzia")))
            else:
                row.update(end=dt(t.get("DraudimoPabaiga")), reason=t.get("Priezastis", ""))
            if row["person"].code:
                p.rows.append(row)
    return p


def parse(content, file_name=""):
    """bytes|str -> Parsed | None (nepalaikoma forma)"""
    xml = content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else content
    if "<Ataskaita " in xml[:3000]:
        return _parse_report(xml, file_name)
    if "DraudejoAtaskaita" in xml[:600] and "epts" in xml[:600]:
        # S15 - nedarbingumo pažymėjimai (skaitoma payroll.sick_import)
        from ..sick_import import parse as parse_s15
        certs, ok = parse_s15(xml)
        if ok:
            p = Parsed("S15", file_name=file_name)
            p.rows = [{"person": Person(c.person_code, c.name), "start": c.start, "end": c.end, "kind": c.kind,
                       "reason": c.reason, "annulled": c.annulled} for c in certs]
            return p
    pages = _pages(xml)
    form = detect(pages)
    if form is None:
        return None
    head = {}
    for _, f in pages:
        for k, v in f.items():
            if not re.search(r"[_-]\d+$", k):
                head.setdefault(k, v)
    p = Parsed(form, head.get("FormVersion") or head.get("B_FormVerNr") or "", file_name=file_name, header=head,
               doc_date=dt(head.get("DocDate")))

    if form == "SAM":
        p.year, p.month = int(head.get("CycleYear") or 0), int(head.get("CycleMonth") or 0)
        p.revised = (head.get("RevisedDocument") or "0") not in ("0", "")
        for pg, f in pages:
            if pg.startswith("SAM") and pg != "SAM":
                for r in _rows(f):
                    if r.get("PersonCode"):
                        p.rows.append({"person": _person(r), "income": dec(r.get("InsIncomeSum")),
                                       "rate": dec(r.get("TaxRate")), "contrib": dec(r.get("PaymentSum"))})
    elif form in ("1-SD", "2-SD", "12-SD"):
        for pg, f in pages:
            for r in _rows(f):
                if not r.get("PersonCode"):
                    continue
                row = {"person": _person(r), "reason": r.get("ReasonCode", ""), "reason_text": r.get("ReasonText", "")}
                if form == "1-SD":
                    prof = "".join(r.get(f"PersonProfession_{i}", "") for i in range(1, 5))
                    row.update({"start": dt(r.get("InsuranceStartDate")), "lpk4": prof})
                elif form == "2-SD":
                    row.update({"end": dt(r.get("InsuranceEndDate")), "income": dec(r.get("InsIncomeSum")),
                                "rate": dec(r.get("TaxRate")), "contrib": dec(r.get("PaymentSum"))})
                else:
                    row.update({"start": dt(r.get("InsuranceSuspendStart")), "end": dt(r.get("InsuranceSuspendEnd"))})
                p.rows.append(row)
    elif form == "9-SD":
        f = pages[0][1]
        p.rows.append({"person": Person(f.get("PersonCode", ""), f.get("PersonFirstName", "").title(),
                                        f.get("PersonLastName", "").title(), f.get("InsuranceSeries", ""),
                                        f.get("InsuranceNumber", "")),
                       "start": dt(f.get("HolidayStartDate")), "end": dt(f.get("HolidayEndDate")),
                       "cancel": dt(f.get("HolidayCancelDate")), "reason": f.get("ReasonCode_1", ""),
                       "child_birth": dt(f.get("ChildBirthDate"))})
    elif form == "GPM313":
        p.year, p.month = int(head.get("B_ML_Metai") or 0), int(head.get("B_ML_Menuo") or 0)
        p.rows.append({k: dec(head.get(k)) for k in ("G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12")})
    elif form == "GPM312":
        p.year = int(head.get("B_ML_Metai") or 0)
        for pg, f in pages:
            if pg == "GPM312L":
                for r in _rows(f, "-"):
                    if r.get("L1"):
                        p.rows.append({"code": r["L1"], "name": r.get("L3", "").title(), "klass": r.get("L4", ""),
                                       "income_code": r.get("L5", ""), "natura": r.get("L6", ""),
                                       "amount": dec(r.get("L8")), "rate": dec(r.get("L9")), "gpm": dec(r.get("L10"))})
    return p
