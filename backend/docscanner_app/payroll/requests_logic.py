"""
Darbuotojų prašymai: grynos taisyklės (be DB) ir prašymo / algalapio HTML.
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from html import escape

from .contract_doc import lt_date, money

KIND_TITLES = {
    "vacation": "PRAŠYMAS DĖL KASMETINIŲ ATOSTOGŲ",
    "parent_day": "PRAŠYMAS DĖL PAPILDOMO POILSIO LAIKO",
    "unpaid": "PRAŠYMAS DĖL NEMOKAMŲ ATOSTOGŲ",
    "dismissal": "PRAŠYMAS NUTRAUKTI DARBO SUTARTĮ",
    "pay_info": "PRAŠYMAS PATEIKTI INFORMACIJĄ APIE DARBO UŽMOKESTĮ",
}
DISMISSAL_NOTICE_DAYS = 20  # DK 55 str. 1 d. - įspėjimas prieš 20 kalendorinių dienų


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
    elif d.kind == "pay_info":
        body = ("Vadovaudamasis (-i) teise gauti informaciją apie darbo užmokestį, prašau pateikti informaciją apie "
                "mano darbo užmokesčio dydį ir vidutinį darbo užmokestį pagal lytį mano pareigybių grupėje.")
    else:
        body = (f"Vadovaudamasis (-i) Darbo kodekso 55 straipsniu, prašau nutraukti su manimi sudarytą darbo sutartį "
                f"mano iniciatyva. Paskutinė darbo diena – {lt_date(d.end_date)}.")
    if d.comment:
        body += f"<br><br>Pastaba: {e(d.comment)}"
    style = """<style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;max-width:720px;margin:24px auto;padding:0 24px}
h1{font-size:13pt;text-align:center;margin:40px 0 4px}.c{text-align:center}.meta{margin-top:48px;font-size:10pt;color:#444}</style>"""
    return f"""<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"><title>{e(KIND_TITLES[d.kind])}</title>{style}</head><body>
<p>{e(d.employee_name)}<br>{e(d.position)}</p>
<p>{e(d.company_name)}<br>{e(d.manager_position or "Vadovui")}</p>
<h1>{e(KIND_TITLES[d.kind])}</h1>
<p class="c">{lt_date(d.submitted_at.date())}</p>
<p>{body}</p>
<p style="margin-top:36px">{e(d.employee_name)}</p>
<p class="meta">Prašymas pateiktas elektroniniu būdu per esavitarna.lt {d.submitted_at:%Y-%m-%d %H:%M}{f", IP {e(d.submitted_ip)}" if d.submitted_ip else ""}.</p>
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
