"""
Pradiniai DU modulio duomenys: parametrai pagal datas + sisteminiai DU kodai.

Grynas Python (be Django) - naudojama ir seed komandoje, ir testuose.
Reikšmės su is_preliminary=True turi būti patikslintos, kai bus patvirtintos.
"""
from datetime import date
from decimal import Decimal as D


# ============================================================
# PARAMETRAI
# (key, value, valid_from, valid_to, is_preliminary, source)
# ============================================================

Y2026 = date(2026, 1, 1)
Y2026_END = date(2026, 12, 31)
Y2027 = date(2027, 1, 1)

PARAMETERS = [
    # --- MMA / MVA / VDU (keičiasi kasmet) ---
    ("MMA", D("1153"), Y2026, Y2026_END, False, "LRV nutarimas, MMA 2026"),
    ("MMA", D("1245"), Y2027, None, False, "LRV nutarimas Nr. 509 (2026-07-01)"),
    ("MVA", D("7.05"), Y2026, Y2026_END, False, "LRV nutarimas, MVA 2026"),
    ("MVA", D("7.61"), Y2027, None, False, "LRV nutarimas Nr. 509 (2026-07-01)"),
    ("VDU", D("2312.15"), Y2026, Y2026_END, False, "Draudžiamųjų pajamų dydis 2026"),
    # LAIKINA: 2027 VDU bus patvirtintas gruodį su Sodros biudžetu
    ("VDU", D("2312.15"), Y2027, None, True, "LAIKINA - pakeisti patvirtinus 2027 VDU"),

    # --- NPD ---
    ("NPD_MAX", D("747"), Y2026, None, False, "GPMĮ 20 str."),
    ("NPD_COEF", D("0.49"), Y2026, None, False, "GPMĮ 20 str."),
    ("NPD_30_55", D("1057"), Y2026, None, False, "GPMĮ 20 str. (30-55 % dalyvumo lygis)"),
    ("NPD_0_25", D("1127"), Y2026, None, False, "GPMĮ 20 str. (0-25 % dalyvumo lygis)"),

    # --- GPM ---
    ("GPM_RATE_1", D("20"), Y2026, None, False, "GPMĮ 6 str."),
    ("GPM_RATE_2", D("25"), Y2026, None, False, "GPMĮ 6 str."),
    ("GPM_RATE_3", D("32"), Y2026, None, False, "GPMĮ 6 str."),
    ("GPM_THRESHOLD_1_VDU", D("36"), Y2026, None, False, "GPMĮ 6 str. (36 VDU)"),
    ("GPM_THRESHOLD_2_VDU", D("60"), Y2026, None, False, "GPMĮ 6 str. (60 VDU)"),
    ("GPM_SICK", D("15"), Y2026, None, False, "GPMĮ 6 str. (ligos išmokos)"),

    # --- Sodra darbuotojo ---
    ("VSD_EMP", D("12.52"), Y2026, None, False, "VSDĮ"),
    ("PSD_EMP", D("6.98"), Y2026, None, False, "SDĮ"),
    ("KAUPIMAS", D("3"), Y2026, None, False, "Pensijų kaupimo įstatymas"),
    ("VSD_CAP_VDU", D("60"), Y2026, None, False, "VSDĮ - lubos 60 VDU per metus"),

    # --- Sodra darbdavio ---
    ("EMPL_UNEMP", D("1.31"), Y2026, None, False, "Nedarbo draudimas (neterminuota)"),
    ("EMPL_UNEMP_TERM", D("2.03"), Y2026, None, False, "Nedarbo draudimas (terminuota)"),
    ("GAR", D("0.16"), Y2026, None, False, "Garantinis fondas"),
    ("ILG", D("0.16"), Y2026, None, False, "Ilgalaikio darbo išmokų fondas"),

    # --- Kiti ---
    ("SICK_MIN_PCT", D("62.06"), Y2026, None, False, "Ligos išmoka 1-2 d., min. % VDU"),
    ("DPN_THRESHOLD_MMA", D("1.65"), Y2026, None, False, "Dienpinigiai neapmokestinami, jei DU >= 1,65 MMA"),
    ("DOV_LIMIT", D("200"), Y2026, None, False, "Dovanos neapmokestinamos iki 200 EUR/metus"),
    ("SVD_LIMIT", D("350"), Y2026, None, False, "Papildomas sveikatos draudimas iki 350 EUR/metus"),
    ("BENEFITS_PCT", D("25"), Y2026, None, False, "Gyvybės dr. + pensijų fondai + SVD <= 25 % metinių pajamų"),
    ("AID_SODRA_MMA", D("5"), Y2026, None, False, "Pašalpos (mirtis, nelaimė) Sodrai neapmokestinamos iki 5 MMA"),
    ("CAR_PCT_FUEL", D("0.75"), Y2026, None, False, "Automobilis asm. tikslams, su kuru, % rinkos vertės per mėn."),
    ("CAR_PCT_NOFUEL", D("0.70"), Y2026, None, False, "Automobilis asm. tikslams, be kuro"),
]


# ============================================================
# SISTEMINIAI DU KODAI
# ============================================================
# category:       earning / compensation / in_kind / deduction / employer
# calc_method:    fixed / hourly / multiplier / vdu_pct / percent / manual
# gpm_mode:       standard (20/25/32) / sick_15 / exempt / limit (neapmok. iki metinio limito) / dpn_rule
# sodra_mode:     yes / no / limit / aid_5mma
# vdu_treatment:  regular / quarterly_bonus / annual_bonus / excluded

# SDUP (SADM 2026-07-17 Nr. A1-433, 4.4-4.6 p.):
#   sdup_total - įeina į bruto DU (tik Sodra apmokestinama dalis)
#   sdup_extra - įeina į papildomą DU
#   sdup_hours - worked / scheduled / actual / none (informacinis; valandos skaičiuojamos iš tabelio)
SDUP = {
    "ALG": (True, False, "worked"), "VAL": (True, False, "worked"),
    "VRS": (True, True, "actual"), "POI": (True, True, "actual"), "SVN": (True, True, "actual"),
    "VRP": (True, True, "actual"), "VRN": (True, True, "actual"), "VRF": (True, True, "actual"),
    "NAK": (True, True, "none"),  # naktinės valandos jau įeina į dirbtas
    "ATO": (True, False, "scheduled"), "MAM": (True, False, "scheduled"),
    "PRS": (True, False, "scheduled"), "MOK": (True, False, "scheduled"), "VPR": (True, False, "scheduled"),
    "BUD": (True, True, "none"),  # ⚠ pasyvus budėjimas - patikslinti
    "PRD": (True, True, "none"), "PRV": (True, True, "none"), "PRM": (True, True, "none"),
    "PRK": (True, True, "none"), "PRT": (True, True, "none"),
    "DOV": (True, True, "none"), "SVD": (True, True, "none"), "GYV": (True, True, "none"),
    "AUT": (True, True, "none"), "NAT": (True, True, "none"),
}


def _code(code, name, category, *, calc="manual", mult=None, vdu_pct=None,
          gpm="standard", vmi="01", npd=True, sodra="yes", vdu="regular",
          limit=None, gpm313=True, debit="6304", credit="4480", order=0):
    total, extra, hours = SDUP.get(code, (False, False, "none"))
    return {
        "sdup_total": total, "sdup_extra": extra, "sdup_hours": hours,
        "code": code, "name": name, "category": category,
        "calc_method": calc, "multiplier": mult, "vdu_pct": vdu_pct,
        "gpm_mode": gpm, "vmi_income_code": vmi, "in_monthly_npd_base": npd,
        "sodra_mode": sodra, "vdu_treatment": vdu, "annual_limit_key": limit,
        "declared_gpm313": gpm313, "debit_account": debit, "credit_account": credit,
        "sort_order": order,
    }


SYSTEM_PAY_CODES = [
    # --- A. Dirbtas laikas ---
    _code("ALG", "Mėnesinė alga", "earning", calc="fixed", order=10),
    _code("VAL", "Valandinis atlygis", "earning", calc="hourly", order=11),
    _code("VRS", "Viršvalandžiai", "earning", calc="multiplier", mult=D("1.5"), order=20),
    # naktinės valandos jau apmokėtos alga -> mokama tik priemoka +50 % (iš viso 1,5x)
    _code("NAK", "Priemoka už darbą naktį (+50 %)", "earning", calc="multiplier", mult=D("0.5"), order=21),
    _code("POI", "Darbas poilsio dieną", "earning", calc="multiplier", mult=D("2"), order=22),
    _code("SVN", "Darbas švenčių dieną", "earning", calc="multiplier", mult=D("2"), order=23),
    _code("VRP", "Viršvalandžiai poilsio dieną", "earning", calc="multiplier", mult=D("2"), order=24),
    _code("VRN", "Viršvalandžiai naktį", "earning", calc="multiplier", mult=D("2"), order=25),
    _code("VRF", "Viršvalandžiai švenčių dieną", "earning", calc="multiplier", mult=D("2.5"), order=26),
    _code("SAV", "Suminė apskaita: viršyta laikotarpio norma (+50 %)", "earning", calc="multiplier",
          mult=D("0.5"), order=27),
    _code("SAN", "Suminė apskaita: neįvykdyta norma dėl grafiko (50 %)", "earning", calc="multiplier",
          mult=D("0.5"), order=28),

    # --- B. Pagal VDU (į VDU neįtraukiama) ---
    _code("ATO", "Atostoginiai", "earning", calc="vdu_pct", vdu_pct=D("100"), vdu="excluded", order=30),
    _code("KMP", "Kompensacija už nepanaudotas atostogas", "earning", calc="vdu_pct", vdu_pct=D("100"), vdu="excluded", order=31),
    _code("LIG", "Ligos išmoka (1-2 d.)", "earning", calc="vdu_pct", vdu_pct=D("62.06"),
          gpm="sick_15", vmi="03", sodra="no", vdu="excluded", order=32),
    _code("MAM", "Papildomas poilsio laikas (mamadieniai / tėvadieniai)", "earning",
          calc="vdu_pct", vdu_pct=D("100"), vdu="excluded", order=33),
    _code("PRS", "Prastova", "earning", calc="vdu_pct", vdu="excluded", order=34),
    _code("MOK", "Mokymosi atostogos", "earning", calc="vdu_pct", vdu_pct=D("50"), vdu="excluded", order=35),
    _code("VPR", "Valstybinės pareigos / donorystė", "earning", calc="vdu_pct", vdu="excluded", order=36),
    _code("BUD", "Pasyvus budėjimas namuose", "earning", calc="vdu_pct", vdu_pct=D("20"), vdu="excluded", order=37),
    _code("ISE", "Išeitinė išmoka", "earning", calc="vdu_pct", npd=False, vdu="excluded", order=38),

    # --- C. Priedai ir premijos ---
    _code("PRD", "Pastovus priedas", "earning", calc="fixed", order=40),
    _code("PRV", "Vienkartinis priedas / priemoka / skatinamoji išmoka", "earning", order=41),
    _code("PRM", "Mėnesio premija", "earning", order=42),
    _code("PRK", "Ketvirčio premija", "earning", vdu="quarterly_bonus", order=43),
    _code("PRT", "Metinė premija", "earning", vdu="annual_bonus", order=44),

    # --- D. Pajamos natūra (nedidina išmokėtinos sumos) ---
    _code("DOV", "Dovanos, prizai", "in_kind", gpm="limit", sodra="limit", vdu="excluded",
          limit="DOV", debit=None, credit=None, order=50),
    _code("SVD", "Papildomas sveikatos draudimas", "in_kind", gpm="limit", sodra="limit", vdu="excluded",
          limit="SVD", debit=None, credit=None, order=51),
    _code("GYV", "Gyvybės draudimas / III pakopa (darbdavio)", "in_kind", gpm="limit", sodra="limit",
          vdu="excluded", limit="BENEFITS25", debit=None, credit=None, order=52),
    _code("AUT", "Automobilis asmeniniams tikslams", "in_kind", calc="percent", vdu="excluded",
          debit=None, credit=None, order=53),
    _code("NAT", "Kitos pajamos natūra", "in_kind", vdu="excluded", debit=None, credit=None, order=54),

    # --- E. Kompensacijos ---
    _code("DPN", "Dienpinigiai", "compensation", gpm="dpn_rule", sodra="no", vdu="excluded",
          debit="6312", credit="4484", order=60),
    _code("AUK", "Kompensacija už asmeninio automobilio naudojimą", "compensation", gpm="exempt",
          vmi=None, npd=False, sodra="no", vdu="excluded", gpm313=False, debit="6312", credit="4484", order=61),
    _code("NUO", "Nuotolinio darbo priemonių kompensacija", "compensation", gpm="exempt",
          vmi=None, npd=False, sodra="no", vdu="excluded", gpm313=False, debit="6312", credit="4484", order=62),

    # --- F. Pašalpos ---
    _code("PSM", "Pašalpa dėl šeimos nario mirties", "compensation", gpm="exempt", vmi=None, npd=False,
          sodra="aid_5mma", vdu="excluded", gpm313=False, credit="4484", order=70),
    _code("PSN", "Pašalpa dėl stichinės nelaimės", "compensation", npd=False,
          sodra="aid_5mma", vdu="excluded", credit="4484", order=71),
    _code("PSK", "Kita materialinė pašalpa", "compensation", npd=False, vdu="excluded", credit="4484", order=72),

    # --- G. Išskaitos ---
    _code("GPM", "Pajamų mokestis", "deduction", vmi=None, debit="4480", credit="4481", order=100),
    _code("G15", "Pajamų mokestis 15 %", "deduction", vmi=None, debit="4480", credit="4481", order=101),
    _code("VSD", "VSD įmokos (darbuotojo)", "deduction", vmi=None, debit="4480", credit="4482", order=102),
    _code("PSD", "PSD įmokos (darbuotojo)", "deduction", vmi=None, debit="4480", credit="4486", order=103),
    _code("KAU", "Pensijų kaupimas 3 %", "deduction", vmi=None, debit="4480", credit="4482", order=104),
    _code("AVN", "Avansas", "deduction", vmi=None, debit=None, credit=None, order=110),  # DK per mokėjimą
    _code("ANT", "Išskaita pagal antstolio patvarkymą", "deduction", vmi=None, debit="4480", credit="4494", order=111),
    _code("PRF", "Profsąjungos nario mokestis", "deduction", vmi=None, debit="4480", credit="4494", order=112),
    _code("III", "III pakopos pensijų įmoka iš DU", "deduction", vmi=None, debit="4480", credit="4494", order=113),
    _code("ZAL", "Žalos atlyginimas darbdaviui", "deduction", vmi=None, debit="4480", credit="24460", order=114),
    _code("ATG", "Grąžinimas už pereikvotas atostogas", "deduction", vmi=None, debit="4480", credit="6304", order=115),
    _code("ISK", "Kita išskaita", "deduction", vmi=None, debit="4480", credit="4494", order=119),

    # --- H. Darbdavio ---
    _code("DVS", "Darbdavio VSD (nedarbo + NA)", "employer", vmi=None, debit="6304", credit="4482", order=200),
    _code("GAR", "Garantinis fondas", "employer", vmi=None, debit="6304", credit="4482", order=201),
    _code("ILG", "Ilgalaikio darbo išmokų fondas", "employer", vmi=None, debit="6304", credit="4482", order=202),
    _code("GRD", "Įmokų priemoka iki MMA (VSD dalis)", "employer", vmi=None, debit="6304", credit="4482", order=203),
    _code("GRP", "Įmokų priemoka iki MMA (PSD dalis)", "employer", vmi=None, debit="6304", credit="4486", order=204),
]
