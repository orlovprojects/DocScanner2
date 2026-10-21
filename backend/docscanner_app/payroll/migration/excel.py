"""Perėjimo darbuotojų Excel šablonas: atsisiųsti su rastais duomenimis -> papildyti -> įkelti atgal."""
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

YES, NO = "Taip", "Ne"
TRANSITION = {"work": "Dirba", "vacation": "Kasmetinės atostogos", "sick": "Liga", "childcare": "Vaiko priežiūros atostogos",
              "maternity": "Nėštumo ir gimdymo atostogos", "paternity": "Tėvystės atostogos", "unpaid": "Nemokamos atostogos"}
NPD = {"standard": "Taikomas", "none": "Netaikomas", "d30_55": "30-55 % dalyvumo lygis", "d0_25": "0-25 % dalyvumo lygis"}
CONTRACT = {"01": "Neterminuota", "02": "Terminuota"}
PAY = {"monthly": "Mėnesinė alga", "hourly": "Valandinis įkainis"}
REGIME = {"standard": "Standartinė", "summed": "Suminė"}

# (antraštė, laukas, privaloma, plotis)
COLUMNS = [
    ("Asmens kodas", "person_code", True, 14),
    ("Vardas", "first_name", True, 16),
    ("Pavardė", "last_name", True, 18),
    ("Dirba (Taip/Ne)", "employed", True, 10),
    ("Profesijos kodas (LPK, 6 skaitmenys)", "lpk_code", True, 16),
    ("Darbo pradžia", "start_date", True, 13),
    ("Atleidimo data", "end_date", False, 13),
    ("Sutarties rūšis", "contract_type", True, 15),
    ("Apmokėjimas", "pay_form", True, 17),
    ("Alga arba valandinis įkainis, €", "base_amount", True, 16),
    ("Darbo laiko norma, val. per savaitę", "weekly_hours", True, 14),
    ("Darbo laiko režimas (01-05)", "work_time_mode", True, 12),
    ("Kasmetinių atostogų d. per metus", "annual_leave_days", True, 13),
    ("Atostogų likutis, d.", "vacation_balance", True, 12),
    ("Neišmokėta suma, €", "unpaid_amount", False, 13),
    ("DU kartą per mėnesį (Taip/Ne)", "pay_once_a_month", False, 11),
    ("Avanso suma, €", "advance_amount", False, 11),
    ("Perėjimo dieną", "transition_state", False, 18),
    ("Nebuvimas iki (YYYY-MM-DD)", "transition_until", False, 14),
    ("Jau išmokėti atostoginiai už DU mėnesio dienas, €", "vacation_prepaid_amount", False, 16),
    ("Dalyvumo lygis nustatytas (Taip/Ne)", "has_disability", False, 12),
    ("VDU iš senos programos (nebūtina)", "vdu_override", False, 14),
    ("Suminė: laikotarpis, mėn. (1-3)", "summed_period_months", False, 12),
    ("Suminė: laikotarpis prasidėjo (YYYY-MM)", "summed_period_start", False, 14),
    ("Suminė: dirbta iki perėjimo, val.", "summed_worked_hours", False, 13),
    ("Suminė: nebuvimai iki perėjimo, val.", "summed_absence_hours", False, 13),
    ("Suminė: jau apmokėta viršvalandžių, val.", "summed_paid_overtime", False, 14),
    ("NPD", "npd_mode", True, 20),
    ("Pensijų kaupimas", "pension", True, 10),
    ("Vienas augina vaiką", "single_parent", False, 11),
    ("IBAN (nebūtina)", "iban", False, 24),
    ("El. paštas (nebūtina)", "email", False, 24),
    ("Telefonas (nebūtina)", "phone", False, 15),
    ("Profesijų grupė (tik informacija)", "lpk4", False, 12),
]
MODES = ("01", "02", "03", "04", "05")

# Tik SDUP šablonas: tik tai, ko reikia SDUP (režimas - Sodros kodas)
SDUP_COLUMNS = [
    ("Asmens kodas", "person_code", True, 14),
    ("Vardas", "first_name", True, 16),
    ("Pavardė", "last_name", True, 18),
    ("Dirba (Taip/Ne)", "employed", True, 10),
    ("Profesijos kodas (LPK, 6 skaitmenys)", "lpk_code", False, 16),
    ("Darbo laiko norma, val. per savaitę", "weekly_hours", True, 14),
    ("Darbo laiko režimas (01-05)", "work_time_mode", True, 12),
    ("Profesijų grupė (tik informacija)", "lpk4", False, 12),
]

MAPS = {"employed": {YES: True, NO: False}, "pension": {YES: True, NO: False}, "single_parent": {YES: True, NO: False},
        "has_disability": {YES: True, NO: False}, "pay_once_a_month": {YES: True, NO: False},
        "transition_state": {v: k for k, v in TRANSITION.items()},
        "npd_mode": {v: k for k, v in NPD.items()}, "contract_type": {v: k for k, v in CONTRACT.items()},
        "pay_form": {v: k for k, v in PAY.items()}, "work_regime": {v: k for k, v in REGIME.items()}}


def _out(field, v):
    if v is None:
        return None
    if field == "summed_period_start":
        return v.strftime("%Y-%m") if v else None
    if field == "transition_state":
        return TRANSITION.get(v or "work", "Dirba")
    if field in ("employed", "pension", "single_parent", "has_disability", "pay_once_a_month"):
        return YES if v else NO
    if field == "npd_mode":
        return NPD.get(v, v)
    if field == "contract_type":
        return CONTRACT.get(v, CONTRACT["01"])
    if field == "pay_form":
        return PAY.get(v, v)
    if field == "work_regime":
        return REGIME.get(v, v)
    if isinstance(v, Decimal):
        return float(v)
    return v


def export(people, mode="full"):
    wb = Workbook()
    ws = wb.active
    ws.title = "Darbuotojai"
    columns = SDUP_COLUMNS if mode == "sdup" else COLUMNS
    ws.append([c[0] for c in columns])
    req = (Font(bold=True, color="1F2937"), PatternFill("solid", fgColor="EFF6FF"))
    opt = (Font(italic=True, color="6B7280"), PatternFill("solid", fgColor="F9FAFB"))
    for i, (title, field, required, width) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=i)
        cell.font, cell.fill = req if required else opt
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[cell.column_letter].width = width
    ws.row_dimensions[1].height = 42
    ws.freeze_panes = "D2"
    for p in people:
        ws.append([_out(f, getattr(p, f, None)) for _, f, _, _ in columns])
    for idx, (_, field, _, _) in enumerate(columns, start=1):
        if field in MAPS:
            letter = ws.cell(row=1, column=idx).column_letter
            dv = DataValidation(type="list", formula1='"' + ",".join(MAPS[field]) + '"', allow_blank=True)
            dv.add(f"{letter}2:{letter}500")
            ws.add_data_validation(dv)
        if field == "work_time_mode":
            letter = ws.cell(row=1, column=idx).column_letter
            dv = DataValidation(type="list", formula1='"' + ",".join(MODES) + '"', allow_blank=True)
            dv.add(f"{letter}2:{letter}500")
            ws.add_data_validation(dv)
    kids = wb.create_sheet("Vaikai")
    kids.append(["Darbuotojo asmens kodas", "Vaiko vardas", "Gimimo data (YYYY-MM-DD)"])
    for i, w in enumerate((22, 20, 22), start=1):
        kids.column_dimensions[kids.cell(row=1, column=i).column_letter].width = w
        kids.cell(row=1, column=i).font, kids.cell(row=1, column=i).fill = req
    for p in people:
        for ch in getattr(p, "children", None) or []:
            kids.append([p.person_code, ch.get("first_name", ""), ch.get("birth_date", "")])
    info = wb.create_sheet("Paaiškinimai")
    for row in [
        ["Kaip pildyti"],
        ["Eilutės jau užpildytos pagal įkeltas Sodros ir VMI ataskaitas - patikrinkite ir papildykite tuščius laukus."],
        ["Galite pridėti naujų darbuotojų (pvz. priimtų šį mėnesį) - tiesiog naujoje eilutėje."],
        ["Darbuotojas atpažįstamas pagal asmens kodą - jo nekeiskite."],
        ["„Dirba“ = Ne - darbuotojas perkeliamas kaip atleistas (tik metinei GPM312)."],
        ["Atostogų likutis - kiek kasmetinių atostogų dienų liko dieną prieš perėjimą (pvz. 12,5)."],
        ["Darbo laiko norma - vidutinė savaitės norma iš darbo sutarties (visu etatu 40, puse etato 20). Jei sutartyje nurodyta "
         "per mėnesį ar apskaitinį laikotarpį - padalinkite valandas iš to laikotarpio savaičių skaičiaus."],
        ["Darbo laiko režimas (Sodros kodas): 01 nekintanti darbo dienos (pamainos) trukmė, 02 suminė darbo laiko apskaita, "
         "03 lankstus darbo grafikas, 04 suskaidytos darbo dienos laiko režimas, 05 individualus darbo laiko režimas."],
        ["Profesijos kodas - 6 skaitmenų LPK kodas (pvz. 832202). Galite palikti tuščią ir pasirinkti programoje."],
        ["Dalyvumo lygis - ar darbuotojui nustatytas 0-55 % dalyvumo lygis (neįgalumas). Nepriklauso nuo NPD taikymo."],
        ["VDU iš senos programos - nebūtina. Standartiniam režimui - dienos VDU, suminei apskaitai ar valandiniam - valandos VDU. "
         "Naudojamas pirmus 3 mėnesius."],
        ["Suminė apskaita - pildykite tik darbuotojams su režimu 02, jei pereinate apskaitinio laikotarpio viduryje: "
         "dirbta - visos faktiškai dirbtos valandos (ir viršvalandžiai, naktis, šventės), nebuvimai - atostogos, liga ir kt. pagal "
         "grafiko valandas (prastova neįskaitoma), jau apmokėta viršvalandžių - tik jei sena programa juos jau sumokėjo."],
        ["Vaikai - lape „Vaikai“: darbuotojo asmens kodas, vaiko vardas, gimimo data."],
        ["Neišmokėta suma - kiek DU (į rankas) perėjimo dienai dar neišmokėta (pvz. praėjusio mėnesio atlyginimas)."],
    ]:
        info.append(row)
    info.column_dimensions["A"].width = 110
    info["A1"].font = Font(bold=True)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _dec(v):
    if v in (None, ""):
        return None
    try:
        return Decimal(str(v).replace(" ", "").replace(",", ".")).quantize(Decimal("0.01"))
    except InvalidOperation:
        raise ValueError(f"neteisingas skaičius „{v}“")


def _date(v):
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    raw = str(v).strip()[:10]
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"neteisinga data „{v}“")


def parse(file_obj):
    """-> ([{laukas: reikšmė}], [klaidos])"""
    wb = load_workbook(file_obj, data_only=True, read_only=True)
    ws = wb["Darbuotojai"] if "Darbuotojai" in wb.sheetnames else wb.active
    rows = list(ws.iter_rows(values_only=True))
    kid_rows = list(wb["Vaikai"].iter_rows(values_only=True))[1:] if "Vaikai" in wb.sheetnames else []
    wb.close()
    if not rows:
        return [], ["Failas tuščias"]
    head = [str(c or "").strip() for c in rows[0]]
    idx = {f: head.index(t) for t, f, _, _ in COLUMNS + SDUP_COLUMNS if t in head}
    if "person_code" not in idx:
        return [], ["Nerastas stulpelis „Asmens kodas“ - naudokite atsisiųstą šabloną"]
    out, errors = [], []
    for n, row in enumerate(rows[1:], start=2):
        if not any(c not in (None, "") for c in row):
            continue
        rec, problems = {}, []
        for field, i in idx.items():
            v = row[i] if i < len(row) else None
            if isinstance(v, str):
                v = v.strip()
            try:
                if field in MAPS:
                    if v in (None, ""):
                        continue
                    if v not in MAPS[field]:
                        raise ValueError(f"„{v}“ - galimos reikšmės: {', '.join(MAPS[field])}")
                    v = MAPS[field][v]
                elif field in ("start_date", "end_date", "transition_until"):
                    v = _date(v)
                elif field == "summed_period_start":
                    if v in (None, ""):
                        continue
                    if isinstance(v, (date, datetime)):
                        v = date(v.year, v.month, 1)
                    else:
                        mm = re.match(r"^(\d{4})-(\d{1,2})", str(v).strip())
                        if not mm:
                            raise ValueError("nurodykite YYYY-MM")
                        v = date(int(mm.group(1)), int(mm.group(2)), 1)
                elif field == "summed_period_months":
                    if v in (None, ""):
                        continue
                    v = int(_dec(v))
                    if v not in (1, 2, 3):
                        raise ValueError("laikotarpis 1-3 mėn.")
                elif field in ("vdu_override", "summed_worked_hours", "summed_absence_hours", "summed_paid_overtime",
                               "vacation_prepaid_amount", "advance_amount"):
                    v = _dec(v)
                elif field in ("base_amount", "vacation_balance", "unpaid_amount", "weekly_hours"):
                    v = _dec(v)
                elif field == "annual_leave_days":
                    v = int(_dec(v)) if v not in (None, "") else None
                elif field == "person_code":
                    v = re.sub(r"\D", "", str(v or ""))
                    if len(v) != 11:
                        raise ValueError("asmens kodas turi būti 11 skaitmenų")
                elif field == "lpk4":
                    continue
                elif field == "lpk_code":
                    v = re.sub(r"\D", "", str(v or ""))
                    if v and len(v) != 6:
                        raise ValueError("profesijos kodas turi būti 6 skaitmenys")
                    if not v:
                        continue
                elif field == "work_time_mode":
                    v = str(v or "").strip().zfill(2) if v not in (None, "") else ""
                    if v and v not in MODES:
                        raise ValueError("režimo kodas turi būti 01-05")
                    if not v:
                        continue
                else:
                    v = str(v or "")
            except ValueError as e:
                problems.append(f"{n} eilutė, {[t for t, f, _, _ in COLUMNS + SDUP_COLUMNS if f == field][0]}: {e}")
                continue
            if v is not None:
                rec[field] = v
        errors += problems
        if rec.get("person_code"):
            out.append(rec)
    kids = {}
    for n, row in enumerate(kid_rows, start=2):
        if not row or not any(c not in (None, "") for c in row):
            continue
        code = re.sub(r"\D", "", str(row[0] or ""))
        try:
            bd = _date(row[2] if len(row) > 2 else None)
        except ValueError as e:
            errors.append(f"Vaikai, {n} eilutė: {e}")
            continue
        if len(code) != 11 or not bd:
            errors.append(f"Vaikai, {n} eilutė: nurodykite darbuotojo asmens kodą ir gimimo datą")
            continue
        kids.setdefault(code, []).append({"first_name": str(row[1] or "").strip(), "birth_date": bd.isoformat()})
    for rec in out:
        if rec["person_code"] in kids:
            rec["children"] = kids.pop(rec["person_code"])
    for code, ch in kids.items():
        out.append({"person_code": code, "children": ch})
    return out, errors
