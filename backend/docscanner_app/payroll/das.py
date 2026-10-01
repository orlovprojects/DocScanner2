"""
Darbo apmokėjimo sistemos (DAS) dokumento generavimas (HTML, spausdinimui / PDF).

⚠ Tai šablonas: tekstas bendro pobūdžio, įmonė gali jį papildyti.
Teisinis pagrindas: DK 140 str. (darbo apmokėjimo sistema), DK 23 str., DK 148 str.,
SADM 2026-07-17 įsakymas Nr. A1-433.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from html import escape

CRITERIA = [
    ("skills", "Įgūdžiai ir kompetencijos", "Darbui atlikti reikalingos žinios, gebėjimai ir patirtis"),
    ("qualification", "Kvalifikacija", "Reikalaujamas išsilavinimas, profesinė kvalifikacija, sertifikatai"),
    ("effort", "Pastangos", "Fizinis, protinis ir emocinis krūvis atliekant darbą"),
    ("responsibility", "Atsakomybė", "Atsakomybė už žmones, finansus, turtą, sprendimus ir rezultatus"),
    ("conditions", "Darbo sąlygos", "Darbo aplinka, rizikos veiksniai, darbo laiko ypatumai"),
]
LEVELS = {1: "žemas", 2: "žemesnis nei vidutinis", 3: "vidutinis", 4: "aukštesnis nei vidutinis", 5: "aukštas"}


@dataclass
class DasGroup:
    code: str
    name: str
    positions: list
    scores: dict
    salary_min: Decimal = None
    salary_max: Decimal = None
    description: str = ""


@dataclass
class DasContext:
    company_name: str
    company_code: str
    manager_name: str
    approved_date: date
    groups: list = field(default_factory=list)
    city: str = ""


def _money(v):
    if v is None:
        return "–"
    return f"{Decimal(v):,.2f}".replace(",", " ").replace(".", ",") + " Eur"


def _p(text):
    return f"<p>{text}</p>"


def render_das_html(ctx):
    e = escape
    rows = []
    for g in ctx.groups:
        score = sum(int(g.scores.get(k, 0) or 0) for k, _, _ in CRITERIA)
        rows.append(
            f"<tr><td>{e(g.code)}</td><td>{e(g.name)}</td><td>{e(', '.join(g.positions)) or '–'}</td>"
            + (f"<td class='c'>{score}</td><td class='r' colspan='2'>{_money(g.salary_min)} (fiksuotas)</td></tr>"
               if g.salary_min is not None and g.salary_min == g.salary_max else
               f"<td class='c'>{score}</td><td class='r'>{_money(g.salary_min)}</td><td class='r'>{_money(g.salary_max)}</td></tr>")
        )
    crit_rows = "".join(f"<tr><td>{e(n)}</td><td>{e(d)}</td></tr>" for _, n, d in CRITERIA)
    score_rows = []
    for g in ctx.groups:
        cells = "".join(f"<td class='c'>{int(g.scores.get(k, 0) or 0)}</td>" for k, _, _ in CRITERIA)
        score_rows.append(f"<tr><td>{e(g.code)}</td>{cells}</tr>")
    score_head = "".join(f"<th>{e(n)}</th>" for _, n, _ in CRITERIA)

    body = f"""
<div class="head">
  <div class="cn">{e(ctx.company_name)}</div>
  <div>Įmonės kodas {e(ctx.company_code)}</div>
  <p class="ap">PATVIRTINTA<br>{e(ctx.company_name)} vadovo<br>{ctx.approved_date:%Y-%m-%d} įsakymu</p>
</div>
<h1>DARBO APMOKĖJIMO SISTEMA</h1>
<p class="c">{ctx.approved_date:%Y-%m-%d}{(' ' + e(ctx.city)) if ctx.city else ''}</p>

<h2>I. BENDROSIOS NUOSTATOS</h2>
{_p(f"1. {e(ctx.company_name)} (toliau – Įmonė) darbo apmokėjimo sistema (toliau – Sistema) nustato darbuotojų pareigybių grupes, darbo užmokesčio dydžius, jų nustatymo kriterijus, priedų, priemokų ir premijų skyrimo tvarką.")}
{_p("2. Sistema parengta vadovaujantis Lietuvos Respublikos darbo kodekso 140 straipsniu, 23 ir 148 straipsniais bei vienodo vyrų ir moterų darbo užmokesčio už vienodą arba vienodos vertės darbą principu.")}
{_p("3. Darbo užmokestis nustatomas pagal objektyvius, nediskriminacinius ir lyties požiūriu neutralius kriterijus. Lytis, amžius, šeiminė padėtis ar kitos su darbu nesusijusios aplinkybės darbo užmokesčiui įtakos neturi.")}

<h2>II. PAREIGYBIŲ VERTINIMO KRITERIJAI</h2>
{_p("4. Pareigybės vertinamos pagal šiuos kriterijus (kiekvienas vertinamas nuo 1 – žemas iki 5 – aukštas):")}
<table><tr><th>Kriterijus</th><th>Kas vertinama</th></tr>{crit_rows}</table>
{_p("5. Vertinamos pareigybės (darbo funkcijos), o ne jas einantys asmenys. Tą patį arba vienodos vertės darbą atliekančių darbuotojų pareigybės priskiriamos tai pačiai pareigybių grupei.")}
<table><tr><th>Grupė</th>{score_head}</tr>{''.join(score_rows)}</table>

<h2>III. PAREIGYBIŲ GRUPĖS IR DARBO UŽMOKESČIO RIBOS</h2>
{_p("6. Įmonėje nustatomos šios pareigybių grupės ir kiekvienos grupės pastoviosios darbo užmokesčio dalies (mėnesinės algos, perskaičiuotos visam etatui) ribos:")}
<table><tr><th>Grupės nr.</th><th>Pavadinimas</th><th>Pareigybės</th><th>Balai</th><th>Min.</th><th>Maks.</th></tr>{''.join(rows)}</table>
{_p("7. Konkretus darbuotojo darbo užmokestis grupės ribose nustatomas šalių susitarimu, atsižvelgiant į darbuotojo profesinę patirtį, kompetencijas, darbo sudėtingumą ir darbo rezultatus. Dirbant ne visą darbo laiką, darbo užmokestis mokamas proporcingai dirbtam laikui.")}
{_p("8. Darbo užmokestis negali būti mažesnis už Vyriausybės patvirtintą minimaliąją mėnesinę algą ar minimalųjį valandinį atlygį.")}

<h2>IV. PRIEDAI, PRIEMOKOS IR PREMIJOS</h2>
{_p("9. Už papildomą darbą, papildomas pareigas ar užduotis, pavadavimą gali būti mokamos priemokos, kurių dydis nustatomas šalių susitarimu.")}
{_p("10. Už darbą naktį, viršvalandinį darbą, darbą poilsio ir švenčių dienomis mokama Darbo kodekso 144 straipsnyje nustatyta tvarka.")}
{_p("11. Premijos gali būti skiriamos už gerus darbo rezultatus, Įmonės ar jos padalinio veiklos rezultatus. Premijos skyrimo pagrindai ir dydžiai taikomi vienodai visiems tos pačios pareigybių grupės darbuotojams.")}

<h2>V. DARBO UŽMOKESČIO PERŽIŪRA</h2>
{_p("12. Darbo užmokesčio ribos ir darbuotojų darbo užmokestis peržiūrimi ne rečiau kaip kartą per metus, taip pat pasikeitus minimaliajai mėnesinei algai ar Įmonės veiklos sąlygoms.")}
{_p("13. Nustačius nepagrįstą darbo užmokesčio skirtumą tarp tą patį arba vienodos vertės darbą dirbančių darbuotojų, jis pašalinamas.")}

<h2>VI. DARBUOTOJŲ TEISĖ Į INFORMACIJĄ</h2>
{_p("14. Darbuotojas turi teisę gauti informaciją apie savo darbo užmokestį ir to paties pareigybių grupės darbuotojų vidutinį darbo užmokestį pagal lytį Darbo kodekso 148 straipsnyje nustatyta tvarka. Įmonė kasmet informuoja darbuotojus apie šią teisę.")}
{_p("15. Darbuotojams negali būti draudžiama atskleisti savo darbo užmokesčio dydžio.")}

<h2>VII. BAIGIAMOSIOS NUOSTATOS</h2>
{_p("16. Sistema įsigalioja nuo jos patvirtinimo dienos. Su Sistema supažindinami visi darbuotojai, o naujai priimami – prieš pradedant dirbti.")}
{_p("17. Sistema keičiama ir papildoma Įmonės vadovo sprendimu.")}

<div class="sign">Vadovas&nbsp;&nbsp;______________________&nbsp;&nbsp;{e(ctx.manager_name or '')}</div>
"""
    style = """
<style>
 body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.45;color:#000;max-width:780px;margin:24px auto;padding:0 24px}
 h1{text-align:center;font-size:14pt;margin:28px 0 4px} h2{font-size:12pt;margin:22px 0 8px;text-align:center}
 .head{text-align:center;margin-bottom:12px}.cn{font-weight:bold;text-transform:uppercase}
 .ap{text-align:right;margin-top:16px}.c{text-align:center}.r{text-align:right;white-space:nowrap}
 table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:11pt}
 th,td{border:1px solid #000;padding:4px 6px;vertical-align:top} th{background:#eee}
 p{margin:6px 0;text-align:justify}.sign{margin-top:48px}
 @media print{body{margin:0}}
</style>"""
    return f"<!DOCTYPE html><html lang='lt'><head><meta charset='utf-8'><title>Darbo apmokėjimo sistema</title>{style}</head><body>{body}</body></html>"
