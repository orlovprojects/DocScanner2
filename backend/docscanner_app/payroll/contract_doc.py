"""
Darbo sutarties dokumentas pagal Pavyzdinę darbo sutarties formą
(SADM 2017-06-29 įsakymas Nr. A1-343, suvestinė redakcija nuo 2022-08-01).
HTML spausdinimui / PDF (kaip DAS).
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from html import escape

MONTHS_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos",
              "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"]

CONTRACT_KIND_TEXT = {
    "01": "neterminuota", "02": "terminuota", "03": "laikinojo darbo", "04": "pameistrystės",
    "05": "projektinio darbo", "06": "darbo vietos dalijimosi", "07": "darbo keliems darbdaviams",
    "08": "sezoninio darbo",
}


@dataclass
class ContractDocData:
    number: str
    sign_date: date
    city: str
    # darbdavys
    employer_name: str
    employer_code: str
    employer_address: str
    employer_phone: str
    employer_email: str
    manager_name: str
    manager_position: str
    representation_basis: str
    # darbuotojas
    employee_name: str
    personal_code: str
    birth_date: date
    employee_address: str
    employee_phone: str
    employee_email: str
    # sąlygos
    workplace: str
    position: str
    pay_form: str               # monthly / hourly
    base_amount: Decimal
    pay_terms: str
    contract_type: str
    contract_subtype: str
    end_date: date
    weekly_hours: Decimal
    full_time: bool
    start_date: date
    probation_months: int = 0
    leave_days: int = None      # jei ne pagal DK minimumą - įrašoma
    extra_terms: str = ""
    other_obligations: str = ""


def lt_date(d):
    return f"{d.year} m. {MONTHS_GEN[d.month - 1]} {d.day} d." if d else "________"


def money(v):
    return f"{Decimal(v):,.2f}".replace(",", " ").replace(".", ",") + " Eur"


def num(v):
    s = f"{Decimal(v):.2f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


REQUIRED = [
    ("employer_name", "Įmonės pavadinimas"), ("employer_code", "Įmonės kodas"),
    ("employer_address", "Įmonės buveinės adresas"), ("manager_name", "Vadovo vardas ir pavardė (DU nustatymuose)"),
    ("manager_position", "Vadovo pareigos (DU nustatymuose)"), ("employee_address", "Darbuotojo gyvenamoji vieta"),
    ("workplace", "Darbovietės adresas (DU nustatymuose)"), ("position", "Pareigos"),
]


def missing_fields(d):
    out = [label for attr, label in REQUIRED if not getattr(d, attr)]
    if not d.personal_code and not d.birth_date:
        out.append("Darbuotojo asmens kodas arba gimimo data")
    return out


def render_contract_html(d):
    e = lambda v: escape(str(v or ""))  # noqa: E731
    employer = ", ".join(x for x in [
        e(d.employer_name), f"įmonės kodas {e(d.employer_code)}" if d.employer_code else "",
        f"buveinės adresas {e(d.employer_address)}" if d.employer_address else "",
        f"tel. {e(d.employer_phone)}" if d.employer_phone else "",
        f"el. p. {e(d.employer_email)}" if d.employer_email else "",
    ] if x)
    ident = f"asmens kodas {e(d.personal_code)}" if d.personal_code else f"gimimo data {d.birth_date}"
    employee = ", ".join(x for x in [
        e(d.employee_name), ident,
        f"gyvenamoji vieta {e(d.employee_address)}" if d.employee_address else "",
        f"tel. {e(d.employee_phone)}" if d.employee_phone else "",
        f"el. p. {e(d.employee_email)}" if d.employee_email else "",
    ] if x)

    pay = (f"Mėnesinė alga – {money(d.base_amount)} (neatskaičius mokesčių)." if d.pay_form == "monthly"
           else f"Valandinis atlygis – {money(d.base_amount)} už valandą (neatskaičius mokesčių).")
    pay += " Priedai, priemokos ir premijos skiriami pagal darbdavio darbo apmokėjimo sistemą."
    if d.pay_terms:
        pay += " " + e(d.pay_terms)

    kind = CONTRACT_KIND_TEXT.get(d.contract_type, "")
    if d.contract_subtype:
        kind = ("terminuota " if d.contract_subtype.endswith("1") else "neterminuota ") + kind
    term = f"iki {lt_date(d.end_date)}" if d.end_date else "–"
    hours = f"{num(d.weekly_hours)} val. per savaitę" + ("" if d.full_time else " (ne visas darbo laikas)")

    extra = []
    if d.probation_months:
        extra.append(f"Nustatomas {d.probation_months} mėn. išbandymo terminas.")
    if d.leave_days:
        extra.append(f"Darbuotojui suteikiamos {d.leave_days} darbo dienų kasmetinės atostogos per metus.")
    if d.extra_terms:
        extra.append(e(d.extra_terms))
    extra_text = " ".join(extra) or "–"

    other = ("Darbuotojo valstybinio socialinio draudimo įmokos mokamos Valstybinio socialinio draudimo fondo "
             "valdybai prie Socialinės apsaugos ir darbo ministerijos (Sodrai), gyventojų pajamų mokestis – "
             "Valstybinei mokesčių inspekcijai; darbuotojo duomenys joms teikiami teisės aktų nustatyta tvarka.")
    if d.other_obligations:
        other += " " + e(d.other_obligations)

    body = f"""
<h1>DARBO SUTARTIS</h1>
<p class="c">{lt_date(d.sign_date)} Nr. {e(d.number)}<br>{e(d.city)}</p>

<p>Darbdavys {employer},<br>atstovaujamas: {e(d.manager_name)}, {e(d.manager_position)}, atstovavimo pagrindas – {e(d.representation_basis)},</p>
<p>ir Darbuotojas {employee},</p>
<p>sudarė šią darbo sutartį:</p>

<p>1. Darbuotojas priimamas dirbti šiomis būtinosiomis darbo sutarties sąlygomis:</p>
<p class="i">1.1. Darbovietė: {e(d.workplace)}.</p>
<p class="i">1.2. Darbo funkcija (pareigos): {e(d.position)}.</p>
<p class="i">1.3. Darbo užmokestis: {pay}</p>
<p>2. Sudaroma {e(kind)} darbo sutartis.</p>
<p>3. Nustatomas darbo sutarties terminas: {term}.</p>
<p>4. Nustatoma darbo laiko norma: {hours}.</p>
<p>5. Nustatomos papildomos darbo sutarties sąlygos: {extra_text}</p>
<p>6. Kiti darbuotojo ir darbdavio tarpusavio įsipareigojimai: {other}</p>
<p>7. Darbo sutartis įsigalioja ir darbuotojas pradeda dirbti {lt_date(d.start_date)}</p>
<p>8. Kasmetinių atostogų suteikimo trukmė, suteikimo tvarka ir apmokėjimo sąlygos nustatomos pagal Darbo kodekso 126–130 straipsnių nuostatas. Viršvalandžiai nustatomi ir apmokami pagal Darbo kodekso 119 ir 144 straipsnių ir Darbo laiko ir poilsio laiko ypatumų ekonominės veiklos srityse aprašo, patvirtinto Lietuvos Respublikos Vyriausybės 2017 m. birželio 21 d. nutarimu Nr. 496 „Dėl Lietuvos Respublikos darbo kodekso įgyvendinimo“, nuostatas.</p>
<p>9. Darbuotojas draudžiamas valstybiniu socialiniu draudimu. Valstybinio socialinio draudimo išmokas, paslaugas ir instituciją nustato atitinkamas valstybinio socialinio draudimo rūšis reglamentuojantys teisės aktai.</p>
<p>10. Įspėjimo terminas, kai darbo sutartis nutraukiama darbdavio ar darbuotojo iniciatyva arba kitais atvejais, nustatomas pagal Darbo kodekso 55–57, 59, 61 ir 62 straipsnių nuostatas.</p>
<p>11. Darbdavys darbuotojo asmens duomenis tvarko darbdavio teisinių prievolių bei darbo sutarties vykdymo tikslu ir užtikrina, kad darbdavio vykdomas darbuotojo asmens duomenų tvarkymas atitiktų 2016 m. balandžio 27 d. Europos Parlamento ir Tarybos reglamento (ES) 2016/679 dėl fizinių asmenų apsaugos tvarkant asmens duomenis ir dėl laisvo tokių duomenų judėjimo ir kuriuo panaikinama Direktyva 95/46/EB (Bendrasis duomenų apsaugos reglamentas) bei Lietuvos Respublikos asmens duomenų teisinės apsaugos įstatymo nuostatas.</p>
<p>12. Ši darbo sutartis gali būti pakeista ar papildyta raštišku šalių susitarimu, išskyrus Darbo kodekse numatytus atvejus.</p>
<p>13. Darbo sutarties pasibaigimo tvarka nustatoma pagal Darbo kodekso 53–65 straipsnių nuostatas.</p>
<p>14. Ginčai dėl šios darbo sutarties nagrinėjami Darbo kodekso nustatyta tvarka.</p>
<p>15. Ši darbo sutartis sudaroma dviem egzemplioriais: vienas pateikiamas darbdaviui, kitas – darbuotojui.</p>
<p>16. Sutarties šalių parašai:</p>
<table class="sig">
<tr><td>Darbdavio atstovas</td><td class="line"></td><td>{e(d.manager_name)}</td></tr>
<tr><td></td><td class="cap">(parašas)</td><td class="cap">(vardas ir pavardė)</td></tr>
<tr><td>Darbuotojas</td><td class="line"></td><td>{e(d.employee_name)}</td></tr>
<tr><td></td><td class="cap">(parašas)</td><td class="cap">(vardas ir pavardė)</td></tr>
</table>
"""
    style = """
<style>
 body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.45;color:#000;max-width:780px;margin:24px auto;padding:0 24px}
 h1{text-align:center;font-size:14pt;margin:8px 0 4px}.c{text-align:center}
 p{margin:6px 0;text-align:justify}.i{padding-left:24px}
 table.sig{width:100%;margin-top:28px;border-collapse:collapse}
 table.sig td{padding:14px 6px 0;vertical-align:bottom;width:33%}
 td.line{border-bottom:1px solid #000}td.cap{font-size:9pt;text-align:center;padding-top:2px}
 @media print{body{margin:0}}
</style>"""
    return f"<!DOCTYPE html><html lang='lt'><head><meta charset='utf-8'><title>Darbo sutartis {e(d.number)}</title>{style}</head><body>{body}</body></html>"
