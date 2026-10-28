"""
Darbo apmokėjimo sistemos (DAS) dokumentų komplektas (HTML, spausdinimui / PDF):
  1) įsakymas dėl DAS patvirtinimo,
  2) darbo apmokėjimo sistema (DK 140 str. 3 d.: pareigybių grupės, vertinimo kriterijai, DU dydžiai / ribos ir formos,
     priedai / priemokos / premijos, indeksavimas ir didinimas),
  3) 1 priedas - pareigybių grupės ir DU ribos, 2 priedas - pareigybių vertinimas ir grupavimo pagrindimas,
  4) supažindinimo lapas.

Dokumentas prisitaiko prie įmonės: 1 grupė - be lyginamosios matricos; < 50 darbuotojų (vidutiniškai) - DU didinimo
kriterijai nenustatomi; 50+ - visa didinimo tvarka.
⚠ Tai šablonas: tekstas bendro pobūdžio, įmonė gali jį papildyti.
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
BIG_EMPLOYER = 50          # nuo tiek darbuotojų (vidutiniškai) - privalomi DU didinimo kriterijai ir tvarka
PERIODS = {"month": "kiekvieno mėnesio", "quarter": "kiekvieno ketvirčio", "year": "metų"}
SCALE = {   # vertinimo skalė: 1 / 3 / 5 lygių aprašymai (2 ir 4 - tarpiniai)
    "skills": ("Paprastos, greitai išmokstamos užduotys", "Reikia specialių žinių ir kelerių metų patirties",
               "Reikia aukšto lygio ekspertinių žinių, strateginio mąstymo"),
    "qualification": ("Specialaus išsilavinimo nereikia", "Profesinis ar aukštasis koleginis išsilavinimas",
                      "Aukštasis universitetinis išsilavinimas ir papildoma kvalifikacija"),
    "effort": ("Nedidelis fizinis ir protinis krūvis", "Vidutinis krūvis, kartais įtemptas darbas",
               "Nuolatinis didelis fizinis, protinis ar emocinis krūvis"),
    "responsibility": ("Atsako tik už savo darbą", "Atsako už išteklius, klientus ar kelių žmonių darbą",
                       "Atsako už Įmonės veiklą, finansus ar didelę komandą"),
    "conditions": ("Įprasta biuro aplinka", "Darbas su tam tikra rizika, pamainomis ar kelionėmis",
                   "Kenksmingos ar pavojingos sąlygos, naktinis darbas"),
}
AUTO_NOTE = "Vertinimas pasiūlytas automatiškai pagal profesijų klasifikatorių - patikrinkite."


@dataclass
class DasGroup:
    code: str
    name: str
    positions: list
    scores: dict
    salary_min: Decimal = None
    salary_max: Decimal = None
    description: str = ""
    hourly_min: Decimal = None
    hourly_max: Decimal = None
    forms: list = field(default_factory=lambda: ["monthly"])     # monthly / hourly - kokie darbuotojai grupėje
    reasons: dict = field(default_factory=dict)                  # kriterijus -> trumpas pagrindimas


@dataclass
class DasContext:
    company_name: str
    company_code: str
    manager_name: str
    approved_date: date
    groups: list = field(default_factory=list)
    city: str = ""
    manager_title: str = "Direktorius"
    version: int = 1
    previous_date: date = None             # ankstesnės DokSkenas versijos data (netenka galios)
    headcount: int = 0                     # vidutinis darbuotojų skaičius
    hourly: bool = False                   # ar yra valandinį atlygį gaunančių
    monthly: bool = True                   # ar yra mėnesinę algą gaunančių
    employees: list = field(default_factory=list)   # [(vardas pavardė, pareigos)] - supažindinimo lapui
    order_no: str = ""
    bonus: str = "discretionary"           # discretionary - vadovo sprendimu, results - pagal rodiklius, none
    bonus_max_pct: int = 20
    bonus_period: str = "quarter"
    prev_ext_date: date = None             # DAS, patvirtinta ne DokSkene (netenka galios)
    prev_ext_no: str = ""
    reps: bool = False                     # yra darbuotojų atstovai - informuota ir konsultuotasi
    reps_date: date = None


def _money(v, unit="Eur"):
    if v is None:
        return "–"
    return f"{Decimal(v):.2f}".replace(".", ",") + f" {unit}"          # dokumente - be tarpų tarp tūkstančių


def _rng(lo, hi, unit):
    if lo is None and hi is None:
        return "–"
    if lo is not None and lo == hi:
        return f"{_money(lo, unit)} (fiksuotas)"
    return f"{_money(lo, '').strip()} – {_money(hi, unit)}"


def _ranges(g):
    """[(forma, ribos)] grupei: mėnesinė alga ir (ar) valandinis atlygis."""
    out = []
    if "monthly" in g.forms or g.salary_min is not None or g.salary_max is not None:
        out.append(("Mėnesinė alga", _rng(g.salary_min, g.salary_max, "Eur/mėn.")))
    if "hourly" in g.forms or g.hourly_min is not None or g.hourly_max is not None:
        out.append(("Valandinis atlygis", _rng(g.hourly_min, g.hourly_max, "Eur/val.")))
    return out or [("Mėnesinė alga", "–")]


def _score(g):
    return sum(int(g.scores.get(k, 0) or 0) for k, _, _ in CRITERIA)


def _title_gen(title):
    """Direktorius -> direktoriaus (paprasčiausi atvejai; kitaip - „vadovo“)."""
    t = (title or "").strip().lower()
    if t.endswith("ius"):
        return t[:-3] + "iaus"
    if t.endswith("as"):
        return t[:-2] + "o"
    if t.endswith("ė"):
        return t[:-1] + "ės"
    return "vadovo"


class _N:
    """Punktų numeracija per visą dokumentą."""

    def __init__(self):
        self.n = 0

    def p(self, text):
        self.n += 1
        return f"<p>{self.n}. {text}</p>"

    def sub(self, items):
        return "<ul class='sub'>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def _order(ctx):
    e = escape
    co = e(ctx.company_name)
    new = ctx.version > 1 and ctx.previous_date
    points = [f"T v i r t i n u {'naujos redakcijos ' if new or ctx.prev_ext_date else ''}{co} darbo apmokėjimo sistemą (pridedama)."]
    if new:
        points.append(f"P r i p a ž į s t u netekusia galios {ctx.previous_date:%Y-%m-%d} patvirtintą darbo apmokėjimo sistemą.")
    elif ctx.prev_ext_date:
        nr = f" Nr. {e(ctx.prev_ext_no)}" if ctx.prev_ext_no else ""
        points.append(f"P r i p a ž į s t u netekusia galios {ctx.prev_ext_date:%Y-%m-%d} įsakymu{nr} patvirtintą darbo apmokėjimo sistemą.")
    points += [
        f"N u s t a t a u, kad darbo apmokėjimo sistema taikoma nuo {ctx.approved_date:%Y-%m-%d}.",
        "Į p a r e i g o j u su šiuo įsakymu ir darbo apmokėjimo sistema supažindinti visus įmonės darbuotojus, "
        "o naujai priimamus darbuotojus – iki darbo pradžios.",
    ]
    li = "".join(f"<p>{i}. {t}</p>" for i, t in enumerate(points, 1))
    reps = (f" ir atsižvelgdamas (-a) į {ctx.reps_date:%Y-%m-%d} informavimo ir konsultavimo su darbuotojų atstovais rezultatus"
            if ctx.reps and ctx.reps_date else
            " ir atsižvelgdamas (-a) į informavimo ir konsultavimo su darbuotojų atstovais rezultatus" if ctx.reps else "")
    return f"""
<section class="page">
  <div class="head"><div class="cn">{co}</div><div>Įmonės kodas {e(ctx.company_code)}</div></div>
  <h1>ĮSAKYMAS<br>DĖL DARBO APMOKĖJIMO SISTEMOS PATVIRTINIMO</h1>
  <p class="c">{ctx.approved_date:%Y-%m-%d} Nr. {e(ctx.order_no) or '______'}<br>{e(ctx.city) or '__________'}</p>
  <p>Vadovaudamasis (-i) Lietuvos Respublikos darbo kodekso 140 straipsniu{reps}:</p>
  {li}
  <div class="sign"><span>{e(ctx.manager_title or 'Vadovas')}</span><span>______________________</span><span>{e(ctx.manager_name or '')}</span></div>
</section>"""


def _system(ctx):
    e = escape
    co = e(ctx.company_name)
    n = _N()
    forms = ("mėnesinė alga arba valandinis atlygis" if ctx.hourly and ctx.monthly
             else "valandinis atlygis" if ctx.hourly else "mėnesinė alga")
    limits = ("mėnesinė alga, perskaičiuota visam darbo laikui, ir (ar) valandinis atlygis" if ctx.hourly and ctx.monthly
              else "valandinis atlygis" if ctx.hourly else "mėnesinė alga, perskaičiuota visam darbo laikui")
    big = ctx.headcount >= BIG_EMPLOYER

    def bonus():
        if ctx.bonus == "none":
            return n.p("Premijos Įmonėje netaikomos.")
        if ctx.bonus == "results":
            return (n.p(f"Darbuotojui gali būti skiriama premija už darbo rezultatus, įvertinus {PERIODS.get(ctx.bonus_period, 'kiekvieno ketvirčio')} "
                        f"rezultatus. Premijos dydis – iki {int(ctx.bonus_max_pct)} % darbuotojo mėnesinės algos.")
                    + n.p("Vertinama: nustatytų užduočių ar rodiklių įvykdymas, darbo kokybė, papildomai atlikti darbai. "
                          "Premija išmokama kartu su mėnesio, kurį priimtas sprendimas, darbo užmokesčiu."))
        # skatinamosios premijos - darbdavio iniciatyva: kriterijai ir didžiausias dydis nustatyti, skyrimas - neprivalomas
        return (n.p("Darbuotojui gali būti skiriama skatinamoji premija, kai:")
                + n.sub(["darbuotojas pasiekė išskirtinių darbo rezultatų ar atliko svarbią, sudėtingą užduotį;",
                         "darbuotojas reikšmingai prisidėjo prie Įmonės veiklos rezultatų ar naujų klientų pritraukimo;",
                         "Įmonė pasiekė gerų metinių veiklos rezultatų."])
                + n.p(f"Skatinamosios premijos dydis – iki {int(ctx.bonus_max_pct)} % darbuotojo mėnesinės algos (valandinį "
                      "atlygį gaunančiam – nuo jo vidutinio pastoviosios dalies darbo užmokesčio per 3 paskutinius mėnesius, neįskaitant "
                      "premijų, priedų ir priemokų; dirbusiam trumpiau – nuo valandinio atlygio, padauginto iš 168 val.) vienu kartu. Konkretų dydį, atsižvelgdamas į "
                      "rezultatų reikšmingumą ir Įmonės finansines galimybes, nustato Įmonės vadovas.")
                + n.p("Skatinamoji premija skiriama Įmonės iniciatyva, ji nėra garantuota darbo užmokesčio dalis ir neskiriama "
                      "automatiškai įvykdžius kriterijus. Premija išmokama kartu su mėnesio, kurį priimtas sprendimas, darbo "
                      "užmokesčiu."))

    def increase():
        if not big:
            return n.p(f"Įmonėje vidutiniškai dirba mažiau kaip {BIG_EMPLOYER} darbuotojų, todėl darbo užmokesčio didinimo "
                       "kriterijai ir tvarka šioje sistemoje nenustatomi. Darbuotojo darbo užmokestis grupės ribose gali būti "
                       "didinamas šalių susitarimu.")
        return (n.p("Darbuotojų darbo užmokestis peržiūrimas kartą per metus, iki kovo 31 d. Darbo užmokestis grupės ribose "
                    "gali būti didinamas atsižvelgiant į:")
                + n.sub(["darbo rezultatus ir jų kokybę;", "įgytas naujas kompetencijas ir kvalifikaciją;",
                         "padidėjusią atsakomybę ar išplėstas darbo funkcijas;", "profesinės patirties augimą."])
                + n.p("Darbuotojo rezultatus pagal šiuos kriterijus įvertina tiesioginis vadovas. Galutinį sprendimą, "
                      "nurodydamas objektyvius pagrindus, priima Įmonės vadovas; darbo užmokesčio pakeitimas įforminamas "
                      "susitarimu dėl darbo sutarties sąlygų pakeitimo."))

    return f"""
<section class="page">
  <div class="ap">PATVIRTINTA<br>{co}<br>{e(_title_gen(ctx.manager_title))} {ctx.approved_date:%Y-%m-%d}<br>įsakymu Nr. {e(ctx.order_no) or '______'}</div>
  <h1>DARBO APMOKĖJIMO SISTEMA</h1>

  <h2>I. BENDROSIOS NUOSTATOS</h2>
  {n.p(f"{co} (toliau – Įmonė) darbo apmokėjimo sistema (toliau – Sistema) nustato pareigybių grupes, pareigybių vertinimo kriterijus, darbo užmokesčio dydžius ir ribas, priedų, priemokų ir premijų skyrimo pagrindus bei tvarką, darbo užmokesčio indeksavimo{' ir didinimo' if big else ''} tvarką.")}
  {n.p("Sistema parengta vadovaujantis Lietuvos Respublikos darbo kodekso 140 straipsniu ir vienodo darbo užmokesčio už vienodą arba vienodos vertės darbą principu.")}
  {n.p("Sistema taikoma visiems Įmonės darbuotojams, dirbantiems pagal darbo sutartis.")}
  {n.p("Darbo užmokestis nustatomas pagal objektyvius, nediskriminacinius ir lyties požiūriu neutralius kriterijus. Lytis, amžius, šeiminė padėtis ir kitos su darbu nesusijusios aplinkybės darbo užmokesčiui įtakos neturi.")}

  <h2>II. DARBO UŽMOKESČIO SUDĖTIS</h2>
  {n.p(f"Darbo užmokestį sudaro bazinis darbo užmokestis – {forms}. Darbuotojui taip pat gali būti mokami priedai, priemokos ir premijos šios Sistemos V skyriuje nustatyta tvarka.")}
  {n.p("Konkretus darbuotojo darbo užmokesčio dydis nustatomas darbo sutartyje. Dirbant ne visą darbo laiką, mėnesinė alga mokama proporcingai dirbtam laikui.")}
  {n.p("Darbo užmokestis negali būti mažesnis už Lietuvos Respublikos Vyriausybės patvirtintą minimaliąją mėnesinę algą ar minimalųjį valandinį atlygį; jie mokami tik už nekvalifikuotą darbą.")}

  <h2>III. PAREIGYBIŲ VERTINIMO KRITERIJAI</h2>
  {n.p("Pareigybės vertinamos pagal šiuos kriterijus; kiekvienas kriterijus vertinamas balais nuo 1 (žemas) iki 5 (aukštas):")}
  <table><tr><th>Kriterijus</th><th>Kas vertinama</th></tr>{"".join(f"<tr><td>{e(nm)}</td><td>{e(d)}</td></tr>" for _, nm, d in CRITERIA)}</table>
  {n.p("Vertinamos pareigybės (darbo funkcijos), o ne jas einantys asmenys. Pareigybės įvertinimas – visų kriterijų balų suma (nuo 5 iki 25).")}
  {n.p("Tą patį arba vienodos vertės darbą atliekančių darbuotojų pareigybės priskiriamos tai pačiai pareigybių grupei – kai jų bendras įvertinimas ir atskirų kriterijų balai yra vienodi ar artimi. Apmokėjimo forma (mėnesinė alga ar valandinis atlygis) grupavimui įtakos neturi.")}
  {n.p("Vertinimo skalė, pareigybių vertinimas ir kiekvieno kriterijaus pagrindimas pateikti Sistemos 2 priede.")}

  <h2>IV. PAREIGYBIŲ GRUPĖS IR DARBO UŽMOKESČIO RIBOS</h2>
  {n.p(f"Įmonėje nustatytos pareigybių grupės ir kiekvienos grupės pastoviosios darbo užmokesčio dalies ribos ({limits}) pateiktos Sistemos 1 priede.")}
  {n.p("Konkretus darbuotojo darbo užmokestis grupės ribose nustatomas šalių susitarimu, atsižvelgiant į darbuotojo profesinę patirtį, kompetencijas, darbo sudėtingumą ir darbo rezultatus.")}
  {n.p("Jei darbuotojui būtina nustatyti darbo užmokestį, nepatenkantį į grupės ribas, Sistema peržiūrima ir pakeičiama iki tokio darbo užmokesčio nustatymo.")}

  <h2>V. PRIEDAI, PRIEMOKOS IR PREMIJOS</h2>
  {n.p("Už papildomų darbo funkcijų atlikimą, laikinai nesančio darbuotojo pavadavimą ar papildomas užduotis mokama priemoka – iki 50 % darbuotojo mėnesinės algos (valandinio atlygio) už laikotarpį, kurį atliekamas papildomas darbas. Konkretus dydis, atsižvelgiant į papildomo darbo apimtį ir trukmę, nustatomas šalių susitarimu prieš pradedant papildomą darbą.")}
  {n.p("Už darbą naktį, viršvalandinį darbą, darbą poilsio ir švenčių dienomis mokama Lietuvos Respublikos darbo kodekso 144 straipsnyje nustatyta tvarka.")}
  {bonus()}
  {n.p("Padidintas apmokėjimas pagal Lietuvos Respublikos darbo kodekso 144 straipsnį mokamas tiesiogiai pagal įstatymą, be atskiro sprendimo. Kiti priedai, priemokos ir premijos skiriami Įmonės vadovo įsakymu, nurodant jų skyrimo pagrindą ir dydį; skyrimo kriterijai vienodai taikomi visiems tos pačios pareigybių grupės darbuotojams.") if ctx.bonus != "none" else n.p("Padidintas apmokėjimas pagal Lietuvos Respublikos darbo kodekso 144 straipsnį mokamas tiesiogiai pagal įstatymą, be atskiro sprendimo. Kiti priedai ir priemokos skiriami Įmonės vadovo įsakymu, nurodant jų skyrimo pagrindą ir dydį.")}

  <h2>VI. DARBO UŽMOKESČIO INDEKSAVIMAS{' IR DIDINIMAS' if big else ''}</h2>
  {n.p("Kasmet sausio mėn. Įmonės vadovas įvertina praėjusių metų infliaciją, minimaliosios mėnesinės algos ir šalies vidutinio darbo užmokesčio pokytį bei Įmonės finansines galimybes ir nusprendžia, ar indeksuoti darbuotojų darbo užmokestį ir pareigybių grupių ribas. Siūlomas indeksavimo dydis – Valstybės duomenų agentūros skelbiamas praėjusių metų vidutinis metinis vartotojų kainų pokytis (infliacija), suapvalintas iki 0,5 procentinio punkto.")}
  {n.p("Indeksavimas gali būti netaikomas, jei Įmonė praėjusius metus baigė nuostolingai, jos pajamos reikšmingai sumažėjo arba darbuotojo darbo užmokestis per paskutinius 12 mėnesių jau padidintas ne mažiau nei infliacija.")}
  {n.p("Sprendimas dėl indeksavimo įforminamas įsakymu, nurodant indeksavimo dydį ir taikymo datą.")}
  {n.p("Padidėjus minimaliajai mėnesinei algai ar minimaliajam valandiniam atlygiui, mažesnės pareigybių grupių ribos padidinamos nuo jų įsigaliojimo dienos.")}
  {increase()}

  <h2>VII. VIENODAS APMOKĖJIMAS IR DARBUOTOJŲ TEISĖ Į INFORMACIJĄ</h2>
  {n.p("Nuo 2027 m. sausio 1 d. darbuotojas turi teisę raštu ar per darbuotojų savitarną paprašyti informacijos apie savo darbo užmokestį ir tos pačios pareigybių grupės darbuotojų vidutinį darbo užmokestį pagal lytį. Informacija pateikiama per protingą terminą, bet ne vėliau kaip per 2 mėnesius nuo prašymo gavimo.")}
  {n.p("Įmonė kasmet informuoja darbuotojus apie teisę gauti šią informaciją ir kaip ją pateikti.")}
  {n.p("Darbuotojams negali būti draudžiama atskleisti savo darbo užmokesčio dydžio.")}
  {n.p("Nustačius nepagrįstą darbo užmokesčio skirtumą tarp tą patį arba vienodos vertės darbą dirbančių darbuotojų, jis pašalinamas per protingą terminą.")}

  <h2>VIII. BAIGIAMOSIOS NUOSTATOS</h2>
  {n.p(f"Sistema įsigalioja nuo {ctx.approved_date:%Y-%m-%d}.")}
  {n.p("Sistema peržiūrima ne rečiau kaip kartą per metus, taip pat kai atsiranda naujų pareigybių, keičiasi pareigybių grupės ar jų darbo užmokesčio ribos.")}
  {n.p("Sistema keičiama Įmonės vadovo įsakymu. Jei Įmonėje yra darbuotojų atstovai, prieš tvirtinant ar keičiant Sistemą atliekamos informavimo ir konsultavimo procedūros.")}
  {n.p("Su Sistema ir jos pakeitimais supažindinami visi darbuotojai, o naujai priimami – iki darbo pradžios.")}
</section>"""


def _annex1(ctx):
    e = escape
    rows = []
    for g in ctx.groups:
        rr = _ranges(g)
        rows.append(
            f"<tr><td class='c'>{e(g.code)}</td><td>{e(g.name)}</td><td>{e(', '.join(g.positions)) or '–'}</td>"
            f"<td class='c'>{_score(g)}</td><td>{'<br>'.join(f for f, _ in rr)}</td>"
            f"<td class='r'>{'<br>'.join(r for _, r in rr)}</td></tr>")
    return f"""
<section class="page">
  <div class="ap">Darbo apmokėjimo sistemos<br>1 priedas</div>
  <h1>PAREIGYBIŲ GRUPĖS IR DARBO UŽMOKESČIO RIBOS</h1>
  <table><tr><th>Grupės nr.</th><th>Grupė</th><th>Pareigybės</th><th>Balai</th><th>Apmokėjimo forma</th><th>Ribos (bruto)</th></tr>{''.join(rows)}</table>
  <p class="note">Sumos nurodytos neatskaičius mokesčių (bruto); mėnesinė alga – visam darbo laikui. Grupių numeriai nurodomi teikiant skaidraus darbo užmokesčio pranešimus (SDUP) Sodrai.</p>
</section>"""


def _reasons_cell(g):
    e = escape
    lines = "".join(
        f"<div>{e(nm)} – {int(g.scores.get(k, 0) or 0)}: {e(g.reasons.get(k, ''))}</div>" for k, nm, _ in CRITERIA)
    own = (g.description or "").replace(AUTO_NOTE, "").strip()
    if own and not g.description.startswith(AUTO_NOTE):          # vartotojo įrašytas aprašymas
        lines = f"<div><i>{e(own)}</i></div>" + lines
    return lines


def _annex2(ctx):
    e = escape
    head = "".join(f"<th>{e(nm)}</th>" for _, nm, _ in CRITERIA)
    scale = "".join(f"<tr><td>{e(nm)}</td>" + "".join(f"<td>{e(t)}</td>" for t in SCALE[k]) + "</tr>"
                    for k, nm, _ in CRITERIA)
    rows = "".join(
        f"<tr><td class='c'>{e(g.code)}</td><td>{e(g.name)}</td>"
        + "".join(f"<td class='c'>{int(g.scores.get(k, 0) or 0)}</td>" for k, _, _ in CRITERIA)
        + f"<td class='c'><b>{_score(g)}</b></td></tr>" for g in ctx.groups)
    why = "".join(f"<tr><td class='c'>{e(g.code)}</td><td>{e(', '.join(g.positions)) or '–'}</td>"
                  f"<td class='why'>{_reasons_cell(g)}</td></tr>" for g in ctx.groups)
    many = len(ctx.groups) > 1
    results = f"""
  <h2>2. Vertinimo rezultatai</h2>
  <table><tr><th>Nr.</th><th>Grupė</th>{head}<th>Iš viso</th></tr>{rows}</table>""" if many else ""
    return f"""
<section class="page">
  <div class="ap">Darbo apmokėjimo sistemos<br>2 priedas</div>
  <h1>PAREIGYBIŲ VERTINIMAS</h1>
  <h2>1. Vertinimo skalė</h2>
  <p>Kiekvienas kriterijus vertinamas nuo 1 ({LEVELS[1]}) iki 5 ({LEVELS[5]}); 2 ir 4 balai – tarpiniai lygiai.</p>
  <table><tr><th>Kriterijus</th><th>1 balas</th><th>3 balai</th><th>5 balai</th></tr>{scale}</table>
  {results}
  <h2>{'3' if many else '2'}. Vertinimo pagrindimas</h2>
  <table><tr><th>Nr.</th><th>Pareigybės</th><th>Kriterijus – balas: pagrindimas</th></tr>{why}</table>
</section>"""


def _acquaint(ctx):
    e = escape
    people = list(ctx.employees) + [("", "")] * 3                 # + tuščios eilutės naujai priimamiems
    rows = "".join(f"<tr><td class='c'>{i}</td><td>{e(nm)}</td><td>{e(pos)}</td><td></td><td></td></tr>"
                   for i, (nm, pos) in enumerate(people, 1))
    return f"""
<section class="page">
  <h1>SUPAŽINDINIMO LAPAS</h1>
  <p class="c">Su {e(ctx.company_name)} darbo apmokėjimo sistema, patvirtinta {ctx.approved_date:%Y-%m-%d}, susipažinau:</p>
  <table class="sheet"><tr><th>Nr.</th><th>Vardas, pavardė</th><th>Pareigos</th><th>Data</th><th>Parašas</th></tr>{rows}</table>
</section>"""


STYLE = """
<style>
 body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.45;color:#000;margin:0}
 .page{max-width:720px;margin:0 auto;padding:40px 56px;background:#fff}
 h1{text-align:center;font-size:13.5pt;margin:24px 0 10px;line-height:1.35} h2{font-size:12pt;margin:20px 0 8px;text-align:center}
 .head{text-align:center;margin-bottom:8px}.cn{font-weight:bold;text-transform:uppercase}
 .ap{margin-left:auto;width:230px;font-size:11pt;margin-bottom:8px}.c{text-align:center}.r{text-align:right;white-space:nowrap}
 table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:11pt}
 th,td{border:1px solid #000;padding:4px 6px;vertical-align:top} th{background:#eee;font-weight:bold}
 td.why{font-size:10pt;line-height:1.35} td.why div{margin:1px 0}
 table.sheet td{height:26px}
 p{margin:6px 0;text-align:justify} ul.sub{margin:2px 0 6px 18px;padding-left:18px} ul.sub li{margin:2px 0}
 .note{font-size:10.5pt;color:#333}
 .sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:56px;gap:16px}
 @page{size:A4;margin:20mm 20mm 20mm 20mm}
 @media screen{
   html{background:#F2F4F7} body{padding:24px 12px}
   .page{width:210mm;max-width:none;min-height:297mm;box-sizing:border-box;padding:20mm 20mm 20mm 20mm;margin:0 auto 20px;
         box-shadow:0 1px 2px rgba(16,24,40,.06),0 6px 20px rgba(16,24,40,.08)}
 }
 @media print{.page{padding:0;max-width:none;break-after:page}.page:last-child{break-after:auto}}
</style>"""


def render_das_html(ctx):
    body = _order(ctx) + _system(ctx) + _annex1(ctx) + _annex2(ctx) + _acquaint(ctx)
    return (f"<!DOCTYPE html><html lang='lt'><head><meta charset='utf-8'><title>Darbo apmokėjimo sistema</title>"
            f"{STYLE}</head><body>{body}</body></html>")
