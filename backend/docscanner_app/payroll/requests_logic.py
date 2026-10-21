"""
Darbuotojų prašymai: grynos taisyklės (be DB) ir prašymo / algalapio HTML.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from html import escape

from .contract_doc import lt_date, money

KIND_TITLES = {
    "vacation": "PRAŠYMAS DĖL KASMETINIŲ ATOSTOGŲ",
    "parent_day": "PRAŠYMAS DĖL PAPILDOMO POILSIO LAIKO",
    "unpaid": "PRAŠYMAS DĖL NEMOKAMŲ ATOSTOGŲ",
    "dismissal": "PRAŠYMAS NUTRAUKTI DARBO SUTARTĮ",
    "paternity": "PRAŠYMAS DĖL TĖVYSTĖS ATOSTOGŲ",
    "childcare": "PRAŠYMAS DĖL ATOSTOGŲ VAIKUI PRIŽIŪRĖTI",
    "study": "PRAŠYMAS DĖL MOKYMOSI ATOSTOGŲ",
    "pay_info": "PRAŠYMAS PATEIKTI INFORMACIJĄ APIE DARBO UŽMOKESTĮ",
}
DISMISSAL_NOTICE_DAYS = 20  # DK 55 str. 1 d. - įspėjimas prieš 20 kalendorinių dienų
PATERNITY_DAYS, PATERNITY_PARTS = 30, 2   # DK 133 str.: 30 kal. d., ne daugiau kaip 2 dalys, iki vaikui 1 m.
CHILDCARE_NOTICE_DAYS = 14                # DK 134 str.: įspėti prieš 14 kal. d.
UNPAID_PSD_WARNING_DAYS = 30


def add_years(d, n):
    try:
        return d.replace(year=d.year + n)
    except ValueError:          # vasario 29 d.
        return d.replace(year=d.year + n, day=28)


def paternity_check(child_birth, start, end, taken_parts):
    """
    Tėvystės atostogos (DK 133): 30 kalendorinių d., ne daugiau kaip 2 dalys, nuo gimimo iki vaikui sueis 1 metai.
    taken_parts: [(pradžia, pabaiga)] - jau patvirtintos / laukiančios šiam vaikui.
    -> (klaidos, įspėjimai, info)
    """
    errors, warnings = [], []
    limit = add_years(child_birth, 1) - timedelta(days=1)
    used = sum((e - s).days + 1 for s, e in taken_parts)
    days = (end - start).days + 1
    info = {"used": used, "remaining": max(PATERNITY_DAYS - used, 0), "until": limit.isoformat(),
            "parts_left": max(PATERNITY_PARTS - len(taken_parts), 0)}
    if start < child_birth:
        errors.append("Tėvystės atostogos suteikiamos tik po vaiko gimimo")
    if end > limit:
        errors.append(f"Tėvystės atostogos turi baigtis iki vaikui sueis vieneri metai (iki {limit:%Y-%m-%d})")
    if len(taken_parts) >= PATERNITY_PARTS:
        errors.append("Tėvystės atostogas galima skaidyti ne daugiau kaip į 2 dalis – abi jau panaudotos")
    if used + days > PATERNITY_DAYS:
        errors.append(f"Tėvystės atostogų priklauso {PATERNITY_DAYS} kalendorinių d. – liko {max(PATERNITY_DAYS - used, 0)} d.")
    elif not taken_parts and days < PATERNITY_DAYS:
        warnings.append(f"Likusias {PATERNITY_DAYS - days} d. galėsite paimti dar vieną kartą (iš viso – ne daugiau kaip 2 dalys)")
    return errors, warnings, info


def childcare_check(child_birth, start, end, today):
    """Atostogos vaikui prižiūrėti (DK 134): iki vaikui sueis 3 metai, įspėti prieš 14 d."""
    errors, warnings = [], []
    limit = add_years(child_birth, 3)
    if start < child_birth:
        errors.append("Atostogos vaikui prižiūrėti suteikiamos tik po vaiko gimimo")
    if end > limit:
        errors.append(f"Atostogos vaikui prižiūrėti suteikiamos, kol vaikui sueis treji metai (iki {limit:%Y-%m-%d})")
    if (start - today).days < CHILDCARE_NOTICE_DAYS:
        warnings.append(f"Pagal DK apie atostogas vaikui prižiūrėti darbdavys įspėjamas prieš {CHILDCARE_NOTICE_DAYS} d. "
                        "Anksčiau – tik darbdaviui sutikus.")
    warnings.append("Išmoką skiria ir moka Sodra – prašymą dėl išmokos (18 ar 24 mėn. variantas) pateikite Sodrai.")
    return errors, warnings, {"until": limit.isoformat()}


def _period_key(d, per_months):
    return (d.year, d.month) if per_months == 1 else (d.year, (d.month - 1) // 3)


def parent_day_quota(entitlement, taken_dates, new_dates):
    """
    entitlement: (dienos, laikotarpis mėn.) iš parent_day_entitlement.
    taken_dates: jau patvirtintos / laukiančios mamadienių dienos.
    Grąžina klaidos tekstą arba "".
    Laikotarpis: kalendorinis mėnuo (1 mėn.) arba kalendorinis ketvirtis (3 mėn.).
    """
    days, per = entitlement
    if not days:
        return "Jums papildomas poilsio laikas (mamadienis / tėvadienis) nepriklauso"
    counts = {}
    for d in list(taken_dates) + list(new_dates):
        k = _period_key(d, per)
        counts[k] = counts.get(k, 0) + 1
    for d in new_dates:
        if counts[_period_key(d, per)] > days:
            span = "per mėnesį" if per == 1 else "per 3 mėnesius (ketvirtį)"
            return f"Jums priklauso {days} d. {span} – šiam laikotarpiui jau išnaudota"
    return ""


@dataclass
class RequestDocData:
    kind: str
    company_name: str
    manager_position: str
    employee_name: str
    position: str
    start_date: date
    end_date: date
    work_days: Decimal
    comment: str
    submitted_at: datetime
    submitted_ip: str = ""
    child: str = ""             # "Vardas, gim. 2025-03-01" (tėvystės / vaiko priežiūros atostogoms)




def render_request_html(d):
    e = lambda v: escape(str(v or ""))  # noqa: E731
    if d.kind == "vacation":
        body = (f"Prašau suteikti man kasmetines atostogas nuo {lt_date(d.start_date)} iki {lt_date(d.end_date)} "
                f"({d.work_days.normalize():f} darbo d.).")
    elif d.kind == "parent_day":
        dates = lt_date(d.start_date) if d.start_date == d.end_date else f"nuo {lt_date(d.start_date)} iki {lt_date(d.end_date)}"
        body = (f"Vadovaudamasis (-i) Darbo kodekso 138 straipsnio 3 dalimi, prašau suteikti man papildomą poilsio "
                f"laiką (vaikus auginantiems darbuotojams) {dates}.")
    elif d.kind == "unpaid":
        body = f"Prašau suteikti man nemokamas atostogas nuo {lt_date(d.start_date)} iki {lt_date(d.end_date)}."
    elif d.kind == "paternity":
        body = (f"Vadovaudamasis (-i) Darbo kodekso 133 straipsniu, prašau suteikti man tėvystės atostogas nuo "
                f"{lt_date(d.start_date)} iki {lt_date(d.end_date)} ({e(d.child)}).")
    elif d.kind == "childcare":
        body = (f"Vadovaudamasis (-i) Darbo kodekso 134 straipsniu, prašau suteikti man atostogas vaikui prižiūrėti nuo "
                f"{lt_date(d.start_date)} iki {lt_date(d.end_date)} ({e(d.child)}).")
    elif d.kind == "study":
        body = (f"Vadovaudamasis (-i) Darbo kodekso 136 straipsniu, prašau suteikti man mokymosi atostogas nuo "
                f"{lt_date(d.start_date)} iki {lt_date(d.end_date)}.")
    elif d.kind == "pay_info":
        body = ("Vadovaudamasis (-i) teise gauti informaciją apie darbo užmokestį, prašau pateikti informaciją apie "
                "mano darbo užmokesčio dydį ir vidutinį darbo užmokestį pagal lytį mano pareigybių grupėje.")
    else:
        body = (f"Vadovaudamasis (-i) Darbo kodekso 55 straipsniu, prašau nutraukti su manimi sudarytą darbo sutartį "
                f"mano iniciatyva. Paskutinė darbo diena – {lt_date(d.end_date)}.")
    if d.comment:
        body += f"<br><br>Pastaba: {e(d.comment)}"
    title = KIND_TITLES[d.kind]
    head, _, rest = title.partition(" ")                     # „PRAŠYMAS“ + „DĖL ...“ - dviem eilutėmis
    comment = f"<p>Pastaba: {e(d.comment)}</p>" if d.comment else ""
    body = body.split("<br><br>Pastaba:")[0]
    style = """<style>
@page{size:A4;margin:0}
html,body{margin:0}
body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.55;color:#000;box-sizing:border-box;position:relative;
width:210mm;height:297mm;overflow:hidden;padding:25mm 22mm 30mm 22mm}
.who{text-align:center}.rule{border-top:1px solid #000;width:70%;margin:1pt auto 0}
.hint{text-align:center;font-size:8pt;color:#333;margin-bottom:6pt}
.to{margin-top:30pt}
h1{font-size:12.5pt;font-weight:bold;text-align:center;margin:54pt 0 8pt;line-height:1.45;letter-spacing:.3pt}
.date{text-align:center;margin-bottom:36pt}
.text p{text-indent:12.7mm;text-align:justify;margin:0 0 6pt}
.sign{margin-top:54pt;display:flex;justify-content:space-between;align-items:flex-end}
.sign .l{font-size:10pt;color:#333;font-style:italic}
.meta{position:absolute;left:22mm;right:22mm;bottom:15mm;font-size:8.5pt;color:#555;border-top:1px solid #bbb;padding-top:5pt}
</style>"""
    return f"""<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"><title>{e(title)}</title>{style}</head><body>
<div class="who">{e(d.employee_name)}</div><div class="rule"></div><div class="hint">(vardas, pavardė)</div>
<div class="who">{e(d.position) or "&nbsp;"}</div><div class="rule"></div><div class="hint">(pareigos)</div>
<div class="to">{e(d.company_name)}<br>{e(d.manager_position or "Vadovui")}</div>
<h1>{e(head)}<br>{e(rest)}</h1>
<div class="date">{lt_date(d.submitted_at.date())}</div>
<div class="text"><p>{body}</p>{comment}</div>
<div class="sign"><span class="l">Pasirašyta elektroniniu būdu</span><span>{e(d.employee_name)}</span></div>
<div class="meta">Prašymas pateiktas elektroniniu būdu per esavitarna.lt {d.submitted_at:%Y-%m-%d %H:%M}{f", IP {e(d.submitted_ip)}" if d.submitted_ip else ""}.</div>
</body></html>"""
 
 


@dataclass
class PayslipData:
    company_name: str
    employee_name: str
    position: str
    year: int
    month: int
    earnings: list = field(default_factory=list)     # [(pavadinimas, kiekis, suma)]
    deductions: list = field(default_factory=list)   # [(pavadinimas, suma)]
    gross: Decimal = Decimal("0")
    net: Decimal = Decimal("0")
    payable: Decimal = Decimal("0")
    worked_days: int = 0
    worked_hours: Decimal = Decimal("0")
    employer: Decimal = Decimal("0")


MONTHS_NOM = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa",
              "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"]


def render_payslip_html(d):
    e = lambda v: escape(str(v or ""))  # noqa: E731
    earn = "".join(f"<tr><td>{e(n)}</td><td class='r'>{e(q)}</td><td class='r'>{money(a)}</td></tr>" for n, q, a in d.earnings)
    ded = "".join(f"<tr><td>{e(n)}</td><td></td><td class='r'>−{money(a)}</td></tr>" for n, a in d.deductions)
    style = """<style>body{font-family:Arial,sans-serif;font-size:11pt;max-width:680px;margin:24px auto;padding:0 20px;color:#111}
h1{font-size:15pt;margin:0}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{padding:5px 4px;border-bottom:1px solid #ddd;text-align:left}
.r{text-align:right;white-space:nowrap}.tot td{font-weight:bold;border-top:2px solid #111}.muted{color:#666;font-size:9pt}</style>"""
    return f"""<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"><title>Atsiskaitymo lapelis {d.year}-{d.month:02d}</title>{style}</head><body>
<h1>Atsiskaitymo lapelis</h1>
<p>{e(d.company_name)}<br><b>{e(d.employee_name)}</b>{f", {e(d.position)}" if d.position else ""}<br>
{d.year} m. {MONTHS_NOM[d.month - 1]} · dirbta {d.worked_days} d. / {d.worked_hours.normalize():f} val.</p>
<table><tr><th>Priskaičiuota</th><th class="r">Kiekis</th><th class="r">Suma</th></tr>{earn}
<tr class="tot"><td>Iš viso priskaičiuota</td><td></td><td class="r">{money(d.gross)}</td></tr></table>
<table><tr><th>Išskaičiuota</th><th></th><th class="r">Suma</th></tr>{ded}
<tr class="tot"><td>Į rankas</td><td></td><td class="r">{money(d.net)}</td></tr>
<tr class="tot"><td>Išmokėti</td><td></td><td class="r">{money(d.payable)}</td></tr></table>
<p class="muted">Darbdavio mokamos „Sodros“ įmokos: {money(d.employer)}.</p>
</body></html>"""
