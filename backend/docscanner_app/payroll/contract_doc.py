"""
Darbo sutartis + Pranešimas apie darbo sąlygas (HTML spausdinimui / PDF).

Sutartis - pagal Pavyzdinę darbo sutarties formą (SADM 2017-06-29 įsak. Nr. A1-343, red. nuo 2022-08-01),
trumpa: būtinosios sąlygos (DK 34 str.) ir tai, dėl ko šalys susitarė. Neaktualūs punktai nespausdinami.
Pranešimas apie darbo sąlygas (DK 44 str.) - atskiras lapas tame pačiame dokumente, su gavimo patvirtinimu.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from html import escape

MONTHS_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos",
              "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"]
DAYS = ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"]

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
    leave_days: int = None      # kasmetinių atostogų trukmė (d. d. per metus)
    extra_terms: str = ""
    other_obligations: str = ""
    # pranešimui apie darbo sąlygas (DK 44 str.)
    leave_parts: list = field(default_factory=list)     # [(dienos, priežastis)]
    summed: bool = False                                 # suminė darbo laiko apskaita
    summed_months: int = 3
    day_hours: list = field(default_factory=list)       # 7 dienų valandos (standartinė apskaita)
    pay_once: bool = False                               # DU - kartą per mėnesį (tik pažymėjus darbuotojo prašymą)
    collective_agreement: str = ""                       # taikoma kolektyvinė sutartis (jei yra)
    pay_items: list = field(default_factory=list)       # garantuoti nuolatiniai priedai: [(pavadinimas, suma tekstu)]
    training: str = ""                                   # darbdavio suteikiami mokymai (DK 44 str. 1 d.), jei yra
    social_protection: str = ""                          # papildoma socialinė apsauga, jei yra


BLANK = "______________"


def lt_date(d):
    return f"{d.year} m. {MONTHS_GEN[d.month - 1]} {d.day} d." if d else "________"


def money(v):
    return f"{Decimal(v):.2f}".replace(".", ",") + " Eur"


def num(v):
    s = f"{Decimal(v):.2f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


REQUIRED = [
    ("employer_name", "Įmonės pavadinimas"), ("employer_code", "Įmonės kodas"),
    ("employer_address", "Įmonės buveinės adresas"),
    ("manager_name", "Darbdavio atstovo vardas ir pavardė (DU nustatymuose)"),
    ("manager_position", "Darbdavio atstovo pareigos (DU nustatymuose)"),
    ("representation_basis", "Atstovavimo pagrindas, pvz. „įstatai“ (DU nustatymuose)"),
    ("employee_address", "Darbuotojo gyvenamoji vieta"),
    ("workplace", "Darbovietės adresas (DU nustatymuose)"), ("position", "Pareigos"),
]


def missing_fields(d):
    out = [label for attr, label in REQUIRED if not getattr(d, attr)]
    if not d.personal_code and not d.birth_date:
        out.append("Darbuotojo asmens kodas arba gimimo data")
    return out


def _days_text(day_hours):
    """[8,8,8,8,8,0,0] -> 'Pr–Pn po 8 val.'; nevienodos - 'Pr–Kt po 8 val., Pn – 6 val.'"""
    on = [(i, h) for i, h in enumerate(day_hours) if Decimal(h or 0) > 0]
    if not on:
        return ""
    idx = [i for i, _ in on]
    same = len({Decimal(h) for _, h in on}) == 1
    consecutive = idx == list(range(idx[0], idx[-1] + 1))
    if same:
        span = f"{DAYS[idx[0]]}–{DAYS[idx[-1]]}" if consecutive and len(idx) > 1 else ", ".join(DAYS[i] for i in idx)
        return f"{span} po {num(on[0][1])} val."
    return ", ".join(f"{DAYS[i]} – {num(h)} val." for i, h in on)


def _lower1(s):
    return s[:1].lower() + s[1:] if s else s


def _acting(d):
    """„, veikianti pagal įmonės įstatus“ - kai aišku giminė (pareigos) ir pagrindo galininkas; kitaip skliaustuose."""
    pos = (d.manager_position or "").strip().lower()
    basis = (d.representation_basis or "").strip()
    acc = next((basis[:-len(a)] + z for a, z in (("įstatai", "įstatus"), ("įgaliojimas", "įgaliojimą"),
                                                  ("nuostatai", "nuostatus")) if basis.lower().endswith(a)), None)
    part = "veikianti" if pos.endswith("ė") else "veikiantis" if pos.endswith(("as", "is", "us", "ys")) else None
    if acc and part:
        return f", {part} pagal {escape(acc)}"
    return f" (atstovavimo pagrindas – {escape(basis) or BLANK})"


def _rep(d):
    """„Direktorė Svetlana Orlova“ - pareigos (vardininku, kaip įvesta nustatymuose) ir vardas."""
    pos = escape(d.manager_position or "")
    return f"{pos[:1].upper() + pos[1:]} {escape(d.manager_name or '')}".strip() or BLANK


def _signatures(left, right):
    """Dvi parašų skiltys greta: antraštė, vardas, linija, (parašas)."""
    def col(c):
        title, name, cap = (c + ("(parašas)",))[:3]
        return f"<td><div class='who'>{title}</div><div>{name}</div><div class='ln'></div><div class='cap'>{cap}</div></td>"
    return f"<table class='sig'><tr>{col(left)}{col(right)}</tr></table>"


def _kind(d):
    kind = CONTRACT_KIND_TEXT.get(d.contract_type, "")
    if d.contract_subtype:
        kind = ("terminuota " if d.contract_subtype.endswith("1") else "neterminuota ") + kind
    return kind.strip()


def _pay(d, e):
    base = (f"Mėnesinė alga – {money(d.base_amount)} (neatskaičius mokesčių)." if d.pay_form == "monthly"
            else f"Valandinis atlygis – {money(d.base_amount)} už valandą (neatskaičius mokesčių).")
    if d.pay_items:
        base += " Nuolat mokama: " + "; ".join(f"{e(n)} – {e(v)}" for n, v in d.pay_items) + "."
    return base + " Kiti priedai, priemokos ir premijos gali būti skiriami darbo apmokėjimo sistemoje nustatyta tvarka."


def _contract(d):
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
    fixed = bool(d.end_date) and (d.contract_type == "02" or (d.contract_subtype or "").endswith("1"))
    hours = f"{num(d.weekly_hours)} val. per savaitę" + ("" if d.full_time else " (ne visas darbo laikas)")
    if d.summed:
        hours += f"; taikoma suminė darbo laiko apskaita, apskaitinis laikotarpis – {d.summed_months} mėn."

    pts = [
        "Darbuotojas priimamas dirbti šiomis būtinosiomis darbo sutarties sąlygomis:"
        f"<p class='i'>1.1. Darbovietė: {e(d.workplace)}.</p>"
        f"<p class='i'>1.2. Darbo funkcija (pareigos): {e(d.position)}.</p>"
        f"<p class='i'>1.3. Darbo užmokestis: {_pay(d, e)}</p>",
        f"Sudaroma {e(_kind(d))} darbo sutartis" + (f", kurios terminas – iki {lt_date(d.end_date)}" if fixed else "."),
        f"Nustatoma darbo laiko norma: {hours}" + ("" if hours.endswith(".") else "."),
    ]
    if d.probation_months:
        pts.append(f"Nustatomas {d.probation_months} mėn. išbandymo laikotarpis.")
    if d.leave_days:
        pts.append(f"Kasmetinių atostogų trukmė – {d.leave_days} darbo dienų per metus. Atostogų suteikimo tvarka ir "
                   "apmokėjimas – pagal Darbo kodekso 126–130 straipsnius.")
    pts.append(("Darbuotojo prašymu, kurį jis patvirtina pasirašydamas šią sutartį, darbo užmokestis mokamas vieną kartą per mėnesį. "
                if d.pay_once else "") + f"{e(d.pay_terms)} Darbo užmokestis pervedamas į darbuotojo nurodytą sąskaitą banke.")
    if d.extra_terms:
        pts.append(f"Papildomos darbo sutarties sąlygos: {e(d.extra_terms)}")
    pts += [
        f"Darbo sutartis įsigalioja ir darbuotojas pradeda dirbti {lt_date(d.start_date)}",
        "Darbuotojas draudžiamas valstybiniu socialiniu draudimu. Socialinio draudimo įmokos mokamos Valstybinio socialinio "
        "draudimo fondo valdybai (Sodrai), gyventojų pajamų mokestis – Valstybinei mokesčių inspekcijai."
        + (f" {e(d.other_obligations)}" if d.other_obligations else ""),
        "Įspėjimo terminai ir darbo sutarties pasibaigimo tvarka nustatomi pagal Darbo kodekso 53–65 straipsnius, "
        "ginčai nagrinėjami Darbo kodekso nustatyta tvarka.",
        "Darbdavys darbuotojo asmens duomenis tvarko darbo sutarties ir teisinių prievolių vykdymo tikslais pagal "
        "Bendrąjį duomenų apsaugos reglamentą ir Asmens duomenų teisinės apsaugos įstatymą.",
        "Sutartis gali būti pakeista ar papildyta raštišku šalių susitarimu, išskyrus Darbo kodekse numatytus atvejus. "
        "Sutartis sudaroma dviem egzemplioriais – po vieną kiekvienai šaliai; kartu darbuotojui įteikiamas pranešimas apie "
        "darbo sąlygas (Darbo kodekso 44 straipsnis).",
    ]
    n = len(pts)
    keep = ' class="keep"'                      # paskutinis punktas nekeliauja į kitą lapą be parašų
    body = "".join(f"<p{keep if i == n else ''}>{i}. {t}</p>" for i, t in enumerate(pts, 1))
    return f"""
<section class="page">
<h1>DARBO SUTARTIS</h1>
<p class="c">{lt_date(d.sign_date)} Nr. {e(d.number)}<br>{e(d.city)}</p>
<p>Darbdavys {employer}, kuriai atstovauja {_lower1(e(d.manager_position)) or BLANK} {e(d.manager_name) or BLANK}{_acting(d)},</p>
<p>ir Darbuotojas {employee},</p>
<p>sudarė šią darbo sutartį:</p>
{body}
{_signatures(("Darbdavys", _rep(d)), ("Darbuotojas", e(d.employee_name)))}
</section>"""


def _notice(d):
    """Pranešimas apie darbo sąlygas - DK 44 str. 1 d. informacija viename dokumente."""
    e = lambda v: escape(str(v or ""))  # noqa: E731
    fixed = bool(d.end_date) and (d.contract_type == "02" or (d.contract_subtype or "").endswith("1"))
    leave = f"{d.leave_days} darbo dienų per metus" if d.leave_days else "pagal Darbo kodekso 126 straipsnį"
    if d.leave_parts and len(d.leave_parts) > 1:
        leave += " (" + "; ".join(f"{p} d. d. – {e(r)}" for p, r in d.leave_parts) + ")"
    if d.summed:
        regime = (f"suminė darbo laiko apskaita, apskaitinis laikotarpis – {d.summed_months} mėn.; dirbama pagal darbdavio "
                  "patvirtintus darbo (pamainų) grafikus, su kuriais supažindinama ne vėliau kaip prieš 7 dienas")
    else:
        days = _days_text(d.day_hours)
        regime = f"nekintanti darbo dienos trukmė{': ' + days if days else ''}".rstrip(".")
    rows = [
        ("Šalys", f"Darbdavys – {e(d.employer_name)}, įm. k. {e(d.employer_code)}, registruotos buveinės adresas "
                  f"{e(d.employer_address) or BLANK}. Darbuotojas – {e(d.employee_name)}"),
        ("Darbovietė", e(d.workplace)),
        ("Pareigos ir darbo pradžia", f"{e(d.position)}; darbas pradedamas {lt_date(d.start_date)}"),
        ("Darbo sutarties rūšis", e(_kind(d)) + (f", terminas – iki {lt_date(d.end_date)}" if fixed else "")),
        ("Išbandymas", f"{d.probation_months} mėn." if d.probation_months else "Netaikomas"),
        ("Kasmetinės atostogos", leave + ". Suteikimo tvarka ir apmokėjimas – DK 126–130 str."),
        *([("Mokymai", e(d.training))] if d.training else []),
        ("Darbo sutarties nutraukimas",
         "Darbuotojas savo iniciatyva be svarbių priežasčių gali nutraukti sutartį raštu įspėjęs darbdavį prieš 20 kalendorinių "
         "dienų (DK 55 str.). Darbdavys savo iniciatyva be darbuotojo kaltės – įspėjęs prieš 1 mėnesį, o jei darbuotojas dirba "
         "trumpiau nei metus – prieš 2 savaites; kai kurioms darbuotojų grupėms terminai du ar tris kartus ilgesni (DK 57 str.). "
         "Kiti pagrindai ir tvarka – DK 53–65 str."),
        ("Darbo užmokestis", _pay(d, e) + " Padidintas apmokėjimas už viršvalandžius, darbą naktį, poilsio ir švenčių dienomis – "
         "DK 144 str."),
        ("Mokėjimo periodiškumas ir būdas", ("Darbuotojo prašymu – kartą per mėnesį. " if d.pay_once else "") + e(d.pay_terms)
         + " Pervedama į darbuotojo nurodytą sąskaitą banke."),
        ("Darbo laikas", f"Norma – {num(d.weekly_hours)} val. per savaitę" + ("" if d.full_time else " (ne visas darbo laikas)")
         + f". Režimas – {regime}. Viršvalandinis darbas – tik DK 119 str. nustatytais atvejais."),
        ("Kolektyvinės sutartys", e(d.collective_agreement) or "Darbdaviui taikomų kolektyvinių sutarčių nėra."),
        ("Socialinis draudimas", "Valstybinio socialinio draudimo įmokos mokamos Valstybinio socialinio draudimo fondo "
         "valdybai (Sodrai), gyventojų pajamų mokestis – Valstybinei mokesčių inspekcijai."),
        *([("Papildoma socialinė apsauga", e(d.social_protection))] if d.social_protection else []),
    ]
    trs = "".join(f"<tr><td class='k'>{k}</td><td>{v}</td></tr>" for k, v in rows)
    return f"""
<section class="page">
<h1>PRANEŠIMAS APIE DARBO SĄLYGAS</h1>
<p class="c">Prie {lt_date(d.sign_date)} darbo sutarties Nr. {e(d.number)} (Darbo kodekso 44 straipsnis)</p>
<table class="info">{trs}</table>
<p class="keep">Pasikeitus Darbo kodekso 44 straipsnyje nurodytoms darbo sąlygoms, darbuotojui informacija apie pakeitimus pateikiama raštu prieš jiems įsigaliojant.</p>
{_signatures(("Pranešimą įteikė", _rep(d)), ("Pranešimą gavau", e(d.employee_name), "(parašas, data)"))}
</section>"""


STYLE = """
<style>
 body{font-family:'Times New Roman',serif;font-size:11.5pt;line-height:1.38;color:#000;max-width:780px;margin:24px auto;padding:0 24px}
 h1{text-align:center;font-size:14pt;margin:8px 0 4px}.c{text-align:center}
 p{margin:4px 0;text-align:justify}.i{padding-left:24px;margin:4px 0}
 table.sig{width:100%;margin-top:22px;border-collapse:collapse;table-layout:fixed}
 table.sig td{width:50%;vertical-align:top;padding:0 16px 0 0}
 table.sig .who{font-weight:bold}.sig .ln{border-bottom:1px solid #000;height:34px;width:85%}
 .cap{font-size:9pt;color:#000}
 table.info{width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt;line-height:1.3}
 table.info td{border:1px solid #000;padding:4px 6px;vertical-align:top} table.info td.k{width:30%;font-weight:bold;background:#f2f2f2}
 @page{size:A4;margin:20mm}
 @media print{body{margin:0;max-width:none;padding:0} section.page{break-after:page} section.page:last-child{break-after:auto}}
</style>"""


def file_title(d):
    """Failo pavadinimas saugant PDF: „Darbo sutartis tarp Vardas Pavardė ir UAB X - 2026-10-26“."""
    when = d.sign_date.isoformat() if d.sign_date else ""
    return f"Darbo sutartis tarp {d.employee_name} ir {d.employer_name}" + (f" - {when}" if when else "")


def render_contract_html(d):
    e = escape(file_title(d))
    return (f"<!DOCTYPE html><html lang='lt'><head><meta charset='utf-8'><title>{e}</title>{STYLE}</head>"
            f"<body>{_contract(d)}{_notice(d)}</body></html>")
