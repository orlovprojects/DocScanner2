"""
Perėjimo darbuotojų Excel šablonas: atsisiųsti su rastais duomenimis -> papildyti -> įkelti atgal.

Stulpeliai grupėmis (kairėje - būtini, dešinėje - nebūtini), spalvota grupės juosta 1 eilutėje, antraštės 2 eilutėje,
paaiškinimai - antraštės komentare. Tušti būtini langeliai raudoni, nereikalingi (pvz. suminės - standartinei) pilki.
Šablone tik dirbantys darbuotojai; nebedirbantys perkeliami automatiškai iš ataskaitų.
"""
import io
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

YES, NO = "Taip", "Ne"
TRANSITION = {"work": "Dirba", "vacation": "Kasmetinės atostogos", "sick": "Liga", "childcare": "Vaiko priežiūros atostogos",
              "maternity": "Nėštumo ir gimdymo atostogos", "paternity": "Tėvystės atostogos", "unpaid": "Nemokamos atostogos"}
NPD = {"standard": "Taikomas", "none": "Netaikomas", "d30_55": "30-55 % dalyvumo lygis", "d0_25": "0-25 % dalyvumo lygis"}
CONTRACT = {"01": "Neterminuota", "02": "Terminuota"}
PAY = {"monthly": "Mėnesinis", "hourly": "Valandinis"}
REGIME = {"standard": "Standartinė", "summed": "Suminė"}
SDUP_MODES = ("01", "03", "04", "05")
MODES = ("01", "02", "03", "04", "05")
ROWS = 500

# (grupė, juostos spalva, antraštės spalva, [(antraštė, laukas, plotis, paaiškinimas)])
GROUPS = [
    ("DARBUOTOJAS", "7F7F7F", "EDEDED", [
        ("Asmens kodas", "person_code", 14, "Darbuotojas atpažįstamas pagal asmens kodą – jo nekeiskite. Naują darbuotoją "
                                            "pridėkite naujoje eilutėje. Užsieniečiui be Lietuvos asmens kodo – Sodros socialinio "
                                            "draudimo numeris (pvz. AB1234567) ir užpildykite „Tik užsieniečiams“."),
        ("Vardas", "first_name", 14, ""),
        ("Pavardė", "last_name", 16, ""),
        ("Dirba", "employed", 8, "Ne – darbuotojas nebedirba: perkeliamas tik metinei GPM312, pildyti nieko nereikia."),
    ]),
    ("BŪTINA", "C0392B", "FADBD8", [
        ("Darbo pradžia", "start_date", 12, "Iš Sodros – keiskite tik jei neteisinga."),
        ("Sutarties rūšis", "contract_type", 13, ""),
        ("Apmokėjimas", "pay_form", 12, "Mėnesinis (alga per mėnesį) arba valandinis (įkainis už valandą)."),
        ("Alga arba įkainis, €", "base_amount", 12, "Pareiginė alga per mėnesį (bruto, be premijų) arba įkainis už valandą. "
                                                    "Pasiūlyta pagal Sodrą – patikrinkite."),
        ("Norma, val./sav.", "weekly_hours", 10, "Visu etatu – 40, puse etato – 20."),
        ("Apskaita", "work_regime", 12, "Standartinė arba suminė darbo laiko apskaita. Suminei pildykite mėlynus stulpelius."),
        ("Atostogų likutis, d.", "vacation_balance", 11, "Kiek kasmetinių atostogų dienų liko dieną prieš perėjimą, pvz. 12,5."),
    ]),
    ("TIK UŽSIENIEČIAMS", "0E7C86", "D5F0F2", [
        ("Gimimo data", "birth_date", 12, "Tik jei vietoj asmens kodo įrašytas socialinio draudimo numeris."),
        ("Lytis", "gender", 9, "Vyras arba Moteris – reikalinga SDUP ataskaitai."),
    ]),
    ("TIK SUMINEI", "2E75B6", "DDEBF7", [
        ("Laikotarpis, mėn.", "summed_period_months", 10, "Apskaitinis laikotarpis 1–3 mėn. Tuščia – kaip įmonėje."),
        ("Laikotarpis prasidėjo", "summed_period_start", 11, "Dabartinio apskaitinio laikotarpio pradžia, MMMM-MM (pvz. 2026-07)."),
        ("Dirbta, val.", "summed_worked_hours", 10, "Tik jei laikotarpis prasidėjo iki perėjimo: visos faktiškai dirbtos valandos "
                                                   "to laikotarpio mėnesiais iki perėjimo (ir viršvalandžiai, naktis, šventės)."),
        ("Nebuvimai, val.", "summed_absence_hours", 10, "Atostogos, liga, mamadieniai ir kt. pagal grafiko valandas. Prastova neįskaitoma."),
        ("Apmokėti viršval., val.", "summed_paid_overtime", 10, "Tik jei sena programa šiame laikotarpyje jau sumokėjo viršvalandžius."),
    ]),
    ("JEI PERĖJIMO DIENĄ NE DARBE", "7030A0", "E4DFEC", [
        ("Perėjimo dieną", "transition_state", 15, "Kur darbuotojas yra pirmą DU dieną DokSkene. Dažniausiai – Dirba."),
        ("Liga nuo", "transition_from", 11, "Tik ligai: kada prasidėjo nedarbingumas. Darbdavys moka už 2 pirmąsias dienas – "
                                           "jei antra diena patenka į DU pradžią, DokSkenas ją apmokės automatiškai."),
        ("Iki", "transition_until", 11, "Iki kada tęsiasi atostogos, liga ar kt. (MMMM-MM-DD)."),
        ("Jau išmokėta, €", "vacation_prepaid_amount", 12, "Atostogos: atostoginiai už DU mėnesio dienas, kuriuos jau išmokėjo "
                                                           "sena programa – DokSkenas jų nemokės dar kartą. Liga: ligos išmoka "
                                                           "iš darbdavio lėšų už dienas iki DU pradžios (reikia NP-SD2 pranešimui)."),
    ]),
    ("REKOMENDUOJAMA", "BF8F00", "FFF2CC", [
        ("VDU, € per d. / val.", "vdu_override", 11, "Vidutinis darbo užmokestis iš senos programos (atostoginių skaičiavime arba VDU "
                                                     "pažymoje). Standartinei – už dieną, suminei ar valandiniam – už valandą. "
                                                     "Neįvedus – skaičiuosime iš Sodros duomenų, pirmų 3 mėn. atostoginiai ir ligos "
                                                     "išmoka gali būti netikslūs."),
        ("GPM nuo sausio iki perėjimo, €", "gpm_ytd", 12, "Išskaičiuotas GPM už šių metų mėnesius iki perėjimo (iš senos programos). "
                                                          "Reikia metinei GPM312, kai keliems darbuotojams NPD taikomas skirtingai."),
    ]),
    ("NEBŪTINA – galima ir vėliau kortelėje", "7F7F7F", "EDEDED", [
        ("NPD", "npd_mode", 13, "Nustatyta pagal GPM313. Dalyvumo lygiui – atitinkamas NPD."),
        ("Dalyvumo lygis nustatytas", "has_disability", 10, "Ar nustatytas 0–55 % dalyvumo lygis (neįgalumas) – nuo jo priklauso "
                                                            "atostogų trukmė."),
        ("Pensijų kaupimas", "pension", 9, "Nustatyta pagal Sodros įmokų tarifą."),
        ("Vienas augina vaiką", "single_parent", 9, ""),
        ("DU kartą per mėn.", "pay_once_a_month", 9, "Darbuotojo prašymu – be avanso."),
        ("Avanso suma, €", "advance_amount", 10, "Tuščia – pagal įmonės nustatymus."),
        ("Neišmokėta suma, €", "unpaid_amount", 11, "Kiek DU (į rankas) perėjimo dienai dar neišmokėta, pvz. praėjusio mėnesio "
                                                   "atlyginimas. Pasiūlyta automatiškai."),
        ("Atostogų d. per metus", "annual_leave_days", 9, "Tik jei sutartyje daugiau nei įstatymo minimumas (20 d. d.)."),
        ("Valandos Pr–S", "week_hours", 14, "Tik standartinei, jei ne Pr–Pn po lygiai: 7 skaičiai per kabliataškį, "
                                           "pvz. 8;8;8;8;6;0;0. Norma bus jų suma."),
        ("Režimas SDUP (01, 03-05)", "work_time_mode", 10, "Tik standartinei apskaitai, jei ne 01: 03 lankstus grafikas, "
                                                           "04 suskaidyta darbo diena, 05 individualus režimas."),
        ("IBAN", "iban", 22, ""),
        ("El. paštas", "email", 22, "Reikalingas kvietimui į eSavitarną."),
        ("Telefonas", "phone", 13, ""),
        ("Profesijos kodas (LPK)", "lpk_code", 12, "Nebūtina – profesiją patogiau pasirinkti programoje iš sąrašo (pagal "
                                                   "Sodroje nurodytą grupę). Jei žinote 6 skaitmenų kodą, pvz. 243106 – įrašykite."),
        ("Profesijų grupė (informacija)", "lpk4", 11, "Sodroje nurodyta 4 skaitmenų profesijų grupė – tik informacija."),
    ]),
]
COLUMNS = [c for _, _, _, cols in GROUPS for c in cols]
REQUIRED = [c[1] for c in GROUPS[1][3]]

# Tik SDUP šablonas (paprastas)
SDUP_COLUMNS = [
    ("Asmens kodas", "person_code", 14, ""), ("Vardas", "first_name", 16, ""), ("Pavardė", "last_name", 18, ""),
    ("Dirba (Taip/Ne)", "employed", 10, ""), ("Profesijos kodas (LPK, 6 skaitmenys)", "lpk_code", 16, ""),
    ("Darbo laiko norma, val. per savaitę", "weekly_hours", 14, ""), ("Darbo laiko režimas (01-05)", "work_time_mode", 12, ""),
    ("Profesijų grupė (tik informacija)", "lpk4", 12, ""),
]

# senų šablonų antraštės (įkeliant anksčiau atsisiųstą failą)
LEGACY = {
    "Dirba (Taip/Ne)": "employed", "Profesijos kodas (LPK, 6 skaitmenys)": "lpk_code", "Atleidimo data": "end_date",
    "Alga arba valandinis įkainis, €": "base_amount", "Darbo laiko norma, val. per savaitę": "weekly_hours",
    "Darbo laiko režimas (01-05)": "work_time_mode", "Kasmetinių atostogų d. per metus": "annual_leave_days",
    "DU kartą per mėnesį (Taip/Ne)": "pay_once_a_month", "Nebuvimas iki (YYYY-MM-DD)": "transition_until",
    "Jau išmokėti atostoginiai už DU mėnesio dienas, €": "vacation_prepaid_amount",
    "Jau išmokėti atostoginiai, €": "vacation_prepaid_amount",
    "Dalyvumo lygis nustatytas (Taip/Ne)": "has_disability", "VDU iš senos programos (nebūtina)": "vdu_override",
    "Suminė: laikotarpis, mėn. (1-3)": "summed_period_months", "Suminė: laikotarpis prasidėjo (YYYY-MM)": "summed_period_start",
    "Suminė: dirbta iki perėjimo, val.": "summed_worked_hours", "Suminė: nebuvimai iki perėjimo, val.": "summed_absence_hours",
    "Suminė: jau apmokėta viršvalandžių, val.": "summed_paid_overtime", "IBAN (nebūtina)": "iban",
    "El. paštas (nebūtina)": "email", "Telefonas (nebūtina)": "phone", "Profesijų grupė (tik informacija)": "lpk4",
    "Profesija (LPK, 6 sk.)": "lpk_code",
}

BOOL = {YES: True, NO: False}
GENDER = {"M": "Vyras", "F": "Moteris"}
SD_RE = re.compile(r"^([A-Z]{2})\s?(\d{7})$")
MAPS = {"employed": BOOL, "pension": BOOL, "single_parent": BOOL, "has_disability": BOOL, "pay_once_a_month": BOOL,
        "transition_state": {v: k for k, v in TRANSITION.items()},
        "npd_mode": {v: k for k, v in NPD.items()}, "contract_type": {v: k for k, v in CONTRACT.items()},
        "pay_form": {**{v: k for k, v in PAY.items()}, "Mėnesinė": "monthly", "Valandinė": "hourly",
                     "Mėnesinė alga": "monthly", "Valandinis įkainis": "hourly"},
        "work_regime": {v: k for k, v in REGIME.items()}, "gender": {v: k for k, v in GENDER.items()}}
LISTS = {"employed": [YES, NO], "pension": [YES, NO], "single_parent": [YES, NO], "has_disability": [YES, NO],
         "pay_once_a_month": [YES, NO], "transition_state": list(TRANSITION.values()), "npd_mode": list(NPD.values()),
         "contract_type": list(CONTRACT.values()), "pay_form": list(PAY.values()), "work_regime": list(REGIME.values()),
         "work_time_mode": list(SDUP_MODES), "gender": list(GENDER.values())}
MONEY = {"base_amount", "vacation_prepaid_amount", "vdu_override", "gpm_ytd", "advance_amount", "unpaid_amount"}
DATES = {"start_date", "transition_until", "transition_from", "birth_date"}
DECIMALS = {"vdu_override", "summed_worked_hours", "summed_absence_hours", "summed_paid_overtime", "vacation_prepaid_amount",
            "advance_amount", "gpm_ytd", "base_amount", "vacation_balance", "unpaid_amount", "weekly_hours"}


def _out(field, p, ctx):
    v = getattr(p, field, None)
    if field == "person_code" and str(v or "").startswith("SD"):
        return str(v)[2:]                                   # užsienietis - SD numeris
    if field == "gender":
        return GENDER.get(v) if v else None
    if field == "week_hours":
        return ";".join(f"{Decimal(str(x)).normalize():f}".replace(".", ",") for x in v) if v else None
    summed = getattr(p, "work_time_mode", "") == "02"
    if field == "work_regime":
        return REGIME["summed" if summed else "standard"]
    if field == "work_time_mode":
        return v if v and v != "02" else None
    if field == "summed_period_start":
        if not summed:
            return None
        v = v or ctx.get("summed_start")
        return v.strftime("%Y-%m") if v else None
    if field == "transition_state":
        return TRANSITION.get(v or "work", "Dirba")
    if field in ("employed", "pension", "single_parent", "has_disability", "pay_once_a_month"):
        return YES if v else NO
    if field == "npd_mode":
        return NPD.get(v, NPD["standard"])
    if field == "contract_type":
        return CONTRACT.get(v, CONTRACT["01"])
    if field == "pay_form":
        return PAY.get(v or "monthly", PAY["monthly"])
    if field == "annual_leave_days" and v in (None, 20):
        return None
    if v is None or v == "":
        return None
    if isinstance(v, Decimal):
        return float(v)
    return v


def _comment(text):
    c = Comment(text, "DokSkenas")
    c.width, c.height = 300, 40 + 15 * (len(text) // 45)
    return c


def export(people, mode="full", du_start=None, salary_check=None, summed_start=None):
    if mode == "sdup":
        return _export_sdup(people)
    ctx = {"summed_start": summed_start}
    salary_check = salary_check or {}
    vac_day = (du_start.replace(day=1) - timedelta(days=1)).isoformat() if du_start else ""
    wb = Workbook()
    ws = wb.active
    ws.title = "Darbuotojai"
    col = 1
    letters = {}
    for gtitle, gcolor, hcolor, cols in GROUPS:
        start = col
        for title, field, width, tip in cols:
            letter = get_column_letter(col)
            letters[field] = letter
            if field == "vacation_balance" and vac_day:
                title = f"Atostogų likutis {vac_day}, d."
            h = ws.cell(row=2, column=col, value=title)
            h.font = Font(bold=True, color="1F2937", size=10)
            h.fill = PatternFill("solid", fgColor=hcolor)
            h.alignment = Alignment(wrap_text=True, vertical="bottom")
            if tip:
                h.comment = _comment(tip)
            ws.column_dimensions[letter].width = width
            col += 1
        for c in range(start, col):
            ws.cell(row=1, column=c).fill = PatternFill("solid", fgColor=gcolor)
        g = ws.cell(row=1, column=start, value=gtitle)
        g.font = Font(bold=True, color="FFFFFF", size=10)
        g.alignment = Alignment(horizontal="center", vertical="center")
        if col - 1 > start:
            ws.merge_cells(start_row=1, start_column=start, end_row=1, end_column=col - 1)
    ws.row_dimensions[1].height = 20
    ws.row_dimensions[2].height = 44
    ws.freeze_panes = "E3"
    ws.page_setup.orientation = "landscape"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0

    warn_fill = PatternFill("solid", fgColor="FFF4E5")
    for r, p in enumerate(people, start=3):
        for c, (_, field, _, _) in enumerate(COLUMNS, start=1):
            cell = ws.cell(row=r, column=c, value=_out(field, p, ctx))
            if field in MONEY:
                cell.number_format = "0.00"
            elif field in DATES:
                cell.number_format = "yyyy-mm-dd"
            elif field == "person_code":
                cell.number_format = "@"
            if field in ("person_code", "first_name", "last_name", "lpk4"):
                cell.font = Font(color="595959")
        chk = salary_check.get(p.person_code)
        if chk and p.base_amount is not None and Decimal(str(p.base_amount)) == Decimal(chk["suggested"]):
            cell = ws[f"{letters['base_amount']}{r}"]
            cell.fill = warn_fill
            cell.comment = _comment(f"Pasiūlyta pagal Sodrą – patikrinkite: {chk['reason']}.")

    last = ROWS
    a, emp = letters["person_code"], letters["employed"]
    red = PatternFill("solid", fgColor="FDECEA")
    grey = PatternFill("solid", fgColor="F2F2F2")
    # tušti būtini - raudoni (dirbantiems)
    for field in REQUIRED:
        L = letters[field]
        ws.conditional_formatting.add(f"{L}3:{L}{last}", FormulaRule(
            formula=[f'AND(${a}3<>"",${emp}3<>"{NO}",ISBLANK({L}3))'], fill=red, stopIfTrue=True))
    # suminė: standartinei pilka; dirbtos val. būtinos, jei laikotarpis prasidėjo iki perėjimo
    reg, st = letters["work_regime"], letters["summed_period_start"]
    du_ym = du_start.strftime("%Y-%m") if du_start else "9999-12"
    for _, field, _, _ in GROUPS[2][3]:
        L = letters[field]
        if field == "summed_worked_hours":
            ws.conditional_formatting.add(f"{L}3:{L}{last}", FormulaRule(
                formula=[f'AND(${reg}3="{REGIME["summed"]}",${st}3<"{du_ym}",ISBLANK({L}3))'], fill=red, stopIfTrue=True))
        ws.conditional_formatting.add(f"{L}3:{L}{last}", FormulaRule(
            formula=[f'AND(${a}3<>"",${reg}3<>"{REGIME["summed"]}")'], fill=grey))
    # užsieniečiai (vietoj asmens kodo - SD numeris): gimimo data ir lytis būtinos, kitiems - pilka
    for field in ("birth_date", "gender"):
        L = letters[field]
        ws.conditional_formatting.add(f"{L}3:{L}{last}", FormulaRule(
            formula=[f'AND(${a}3<>"",LEN(${a}3)<>11,ISBLANK({L}3))'], fill=red, stopIfTrue=True))
        ws.conditional_formatting.add(f"{L}3:{L}{last}", FormulaRule(formula=[f'AND(${a}3<>"",LEN(${a}3)=11)'], fill=grey))
    # perėjimo dieną dirba - nebuvimo laukai pilki; „Iki“ būtina, jei ne darbe
    tr, until = letters["transition_state"], letters["transition_until"]
    ws.conditional_formatting.add(f"{until}3:{until}{last}", FormulaRule(
        formula=[f'AND(${tr}3<>"",${tr}3<>"Dirba",ISBLANK({until}3))'], fill=red, stopIfTrue=True))
    for field in ("transition_until", "vacation_prepaid_amount"):
        L = letters[field]
        ws.conditional_formatting.add(f"{L}3:{L}{last}", FormulaRule(
            formula=[f'AND(${a}3<>"",OR(${tr}3="Dirba",${tr}3=""))'], fill=grey))
    sick, frm = TRANSITION["sick"], letters["transition_from"]
    ws.conditional_formatting.add(f"{frm}3:{frm}{last}", FormulaRule(
        formula=[f'AND(${tr}3="{sick}",ISBLANK({frm}3))'], fill=red, stopIfTrue=True))
    ws.conditional_formatting.add(f"{frm}3:{frm}{last}", FormulaRule(formula=[f'AND(${a}3<>"",${tr}3<>"{sick}")'], fill=grey))
    vac, pre = TRANSITION["vacation"], letters["vacation_prepaid_amount"]
    ws.conditional_formatting.add(f"{pre}3:{pre}{last}", FormulaRule(
        formula=[f'AND(${a}3<>"",${tr}3<>"{vac}",${tr}3<>"{sick}")'], fill=grey))
    # išskleidžiami sąrašai
    for field, values in LISTS.items():
        L = letters[field]
        dv = DataValidation(type="list", formula1='"' + ",".join(values) + '"', allow_blank=True)
        dv.add(f"{L}3:{L}{last}")
        ws.add_data_validation(dv)

    kids = wb.create_sheet("Vaikai")
    kids.append(["Darbuotojo asmens kodas (ar SD numeris)", "Vaiko vardas", "Gimimo data (MMMM-MM-DD)"])
    for i, w in enumerate((22, 20, 24), start=1):
        kids.column_dimensions[get_column_letter(i)].width = w
        kids.cell(row=1, column=i).font = Font(bold=True)
        kids.cell(row=1, column=i).fill = PatternFill("solid", fgColor="EDEDED")
    for p in people:
        for ch in getattr(p, "children", None) or []:
            code = p.person_code[2:] if str(p.person_code).startswith("SD") else p.person_code
            kids.append([code, ch.get("first_name", ""), ch.get("birth_date", "")])

    info = wb.create_sheet("Paaiškinimai")
    for row in [
        ["Kaip pildyti"],
        ["Eilutės jau užpildytos pagal įkeltas Sodros ir VMI ataskaitas – patikrinkite ir papildykite tuščius laukus."],
        ["Raudona grupė – būtina. Tušti būtini langeliai pažymėti raudonai."],
        ["Mėlyna – tik suminei apskaitai (standartinei – pilka, nepildykite). Dirbtos valandos būtinos, jei apskaitinis "
         "laikotarpis prasidėjo iki perėjimo."],
        ["Violetinė – tik jei pirmą DU dieną darbuotojas ne darbe (atostogos, liga ir kt.)."],
        ["Geltona – rekomenduojama: VDU iš senos programos ir išskaičiuotas GPM."],
        ["Pilka – nebūtina, galite papildyti ir vėliau darbuotojo kortelėje."],
        ["Užveskite pelę ant stulpelio antraštės – pamatysite paaiškinimą. Oranžinė alga – pasiūlyta pagal Sodrą, patikrinkite."],
        ["Naują darbuotoją (pvz. priimtą šį mėnesį) pridėkite naujoje eilutėje. Darbuotojas atpažįstamas pagal asmens kodą."],
        ["Nebedirbantys į šabloną neįtraukiami – jie perkeliami automatiškai iš ataskaitų."],
        ["Vaikai – lape „Vaikai“: darbuotojo asmens kodas, vaiko vardas, gimimo data."],
    ]:
        info.append(row)
    info.column_dimensions["A"].width = 120
    info["A1"].font = Font(bold=True)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _export_sdup(people):
    wb = Workbook()
    ws = wb.active
    ws.title = "Darbuotojai"
    ws.append([c[0] for c in SDUP_COLUMNS])
    for i, (_, _, width, _) in enumerate(SDUP_COLUMNS, start=1):
        ws.cell(row=1, column=i).font = Font(bold=True)
        ws.column_dimensions[get_column_letter(i)].width = width
    for p in people:
        row = []
        for _, field, _, _ in SDUP_COLUMNS:
            v = getattr(p, field, None)
            row.append((YES if v else NO) if field == "employed" else float(v) if isinstance(v, Decimal) else v)
        ws.append(row)
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


def _field_of(title, titles):
    if title in titles:
        return titles[title]
    if title.startswith("Atostogų likutis"):          # „Atostogų likutis 2026-09-30, d.“
        return "vacation_balance"
    return None


def parse(file_obj):
    """-> ([{laukas: reikšmė}], [klaidos])"""
    wb = load_workbook(file_obj, data_only=True, read_only=True)
    ws = wb["Darbuotojai"] if "Darbuotojai" in wb.sheetnames else wb.active
    rows = list(ws.iter_rows(values_only=True))
    kid_rows = list(wb["Vaikai"].iter_rows(values_only=True))[1:] if "Vaikai" in wb.sheetnames else []
    wb.close()
    head_i = next((i for i, r in enumerate(rows[:4]) if r and str(r[0] or "").strip() == "Asmens kodas"), None)
    if head_i is None:
        return [], ["Nerastas stulpelis „Asmens kodas“ – naudokite atsisiųstą šabloną"]
    titles = {t: f for t, f, _, _ in COLUMNS + SDUP_COLUMNS}
    titles.update(LEGACY)
    idx = {}
    for i, c in enumerate(rows[head_i]):
        f = _field_of(str(c or "").strip(), titles)
        if f and f not in idx:
            idx[f] = i
    label = {f: str(rows[head_i][i] or "") for f, i in idx.items()}
    out, errors = [], []
    for n, row in enumerate(rows[head_i + 1:], start=head_i + 2):
        if not row or not any(c not in (None, "") for c in row):
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
                        raise ValueError(f"„{v}“ – galimos reikšmės: {', '.join(LISTS.get(field) or MAPS[field])}")
                    v = MAPS[field][v]
                elif field in ("start_date", "end_date", "transition_until", "transition_from", "birth_date"):
                    v = _date(v)
                elif field == "week_hours":
                    if v in (None, ""):
                        continue
                    parts = [x for x in re.split(r"[;\s]+", str(v).strip()) if x != ""]
                    try:
                        vals = [Decimal(x.replace(",", ".")) for x in parts]
                    except InvalidOperation:
                        raise ValueError("7 skaičiai per kabliataškį, pvz. 8;8;8;8;8;0;0")
                    if len(vals) != 7 or any(x < 0 or x > 24 for x in vals) or not sum(vals):
                        raise ValueError("7 skaičiai per kabliataškį (Pr–S), pvz. 8;8;8;8;8;0;0")
                    rec["weekly_hours"] = sum(vals)
                    v = [str(x) for x in vals]
                elif field == "summed_period_start":
                    if v in (None, ""):
                        continue
                    if isinstance(v, (date, datetime)):
                        v = date(v.year, v.month, 1)
                    else:
                        mm = re.match(r"^(\d{4})-(\d{1,2})", str(v).strip())
                        if not mm:
                            raise ValueError("nurodykite MMMM-MM, pvz. 2026-07")
                        v = date(int(mm.group(1)), int(mm.group(2)), 1)
                elif field == "summed_period_months":
                    if v in (None, ""):
                        continue
                    v = int(_dec(v))
                    if v not in (1, 2, 3):
                        raise ValueError("laikotarpis 1–3 mėn.")
                elif field in DECIMALS:
                    v = _dec(v)
                elif field == "annual_leave_days":
                    v = int(_dec(v)) if v not in (None, "") else None
                elif field == "person_code":
                    raw = str(v or "").strip().upper()
                    sd = SD_RE.match(raw)
                    if sd:                                  # užsienietis - Sodros socialinio draudimo numeris
                        v = f"SD{sd.group(1)}{sd.group(2)}"
                        rec.update(is_foreigner=True, sd_series=sd.group(1), sd_number=sd.group(2))
                    else:
                        v = re.sub(r"\D", "", raw)
                        if len(v) != 11:
                            raise ValueError("asmens kodas – 11 skaitmenų; užsieniečiui – SD numeris, pvz. AB1234567")
                elif field == "lpk4":
                    continue
                elif field == "email":
                    v = str(v or "").strip().lower()
                    if v and not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", v):
                        raise ValueError(f"neteisingas el. pašto adresas „{v}“")
                elif field == "phone":
                    v = re.sub(r"[\s\-()]", "", str(v or ""))
                    if v and not re.match(r"^\+?\d{8,15}$", v):
                        raise ValueError(f"neteisingas telefono numeris „{v}“")
                elif field == "lpk_code":
                    v = re.sub(r"\D", "", str(v or ""))
                    if v and len(v) != 6:
                        raise ValueError("profesijos kodas turi būti 6 skaitmenys")
                    if not v:
                        continue
                elif field == "work_time_mode":
                    v = str(v or "").strip().zfill(2) if v not in (None, "") else ""
                    if v and v not in MODES:
                        raise ValueError("režimo kodas: 01, 03, 04 arba 05")
                    if not v:
                        continue
                else:
                    v = str(v or "")
            except ValueError as e:
                problems.append(f"{n} eilutė, {label.get(field, field)}: {e}")
                continue
            if v is not None:
                rec[field] = v
        # Apskaita -> režimo kodas: suminė - 02, standartinė - SDUP stulpelis arba 01
        if "work_regime" in rec:
            if rec["work_regime"] == "summed":
                rec["work_time_mode"] = "02"
            elif rec.get("work_time_mode") in (None, "", "02"):
                rec["work_time_mode"] = "01"
        elif rec.get("work_time_mode"):
            rec["work_regime"] = "summed" if rec["work_time_mode"] == "02" else "standard"
        if rec.get("npd_mode") in ("d30_55", "d0_25"):          # NPD su dalyvumo lygiu -> dalyvumo lygis nustatytas
            rec["has_disability"] = True
        errors += problems
        if rec.get("person_code"):
            out.append(rec)
    kids = {}
    for n, row in enumerate(kid_rows, start=2):
        if not row or not any(c not in (None, "") for c in row):
            continue
        raw = str(row[0] or "").strip().upper()
        sd = SD_RE.match(raw)
        code = f"SD{sd.group(1)}{sd.group(2)}" if sd else re.sub(r"\D", "", raw)
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
