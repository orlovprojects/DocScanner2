"""
DU mokesčių skaičiavimas vienam darbuotojui už vieną mėnesį.

Grynos funkcijos: jokios DB, tik TaxParams + TaxInput -> TaxResult.
Visos sumos Decimal, apvalinama iki cento ROUND_HALF_UP.

Taisyklės (patikrinta 2026-09):
- NPD skaičiuojamas nuo mėnesio pajamų (DU + ligos 1-2 d.), taikoma ne daugiau nei pajamos.
- NPD paskirstomas proporcingai tarp 20 % pajamų ir 15 % ligos išmokos.
- Išeitinė į mėnesio NPD bazę neįeina, bet apmokestinama 20 %.
- Darbuotojo Sodra: suma = round(bazė x 19,5 %), PSD = round(bazė x 6,98 %), VSD = suma - PSD.
  Pasiekus lubas VSD ir PSD skaičiuojami atskirai (PSD lubų neturi).
- Lubos 60 VDU taikomos VSD, kaupimui ir darbdavio VSD (nedarbo + NA), bet ne PSD, GAR, ILG.
- SAM: A12 = round(A11 x P3). Darbdavio VSD koreguojamas centu, kad komponentų suma = SAM.
- Grindys (MMA): priemoka iš darbdavio lėšų: 19,5 % + darbdavio VSD + ILG. GAR ir kaupimas - ne.
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")
CENT = Decimal("0.01")

NPD_STANDARD = "standard"
NPD_NONE = "none"
NPD_30_55 = "d30_55"
NPD_0_25 = "d0_25"


def q2(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def pct(amount, rate):
    """amount x rate % -> centais."""
    return q2(amount * rate / HUNDRED)


# ============================================================
# ĮVESTIS / REZULTATAS
# ============================================================

@dataclass
class TaxInput:
    # Pajamos pagal apmokestinimą (jau sugrupuotos pagal DU kodų vėliavas)
    income_standard: Decimal = ZERO          # GPM 20 %, įeina į NPD bazę (DU, premijos, atostoginiai, natūra...)
    income_standard_no_npd: Decimal = ZERO   # GPM 20 %, į mėnesio NPD bazę neįeina (išeitinė)
    income_sick: Decimal = ZERO              # GPM 15 %, įeina į NPD bazę (liga 1-2 d.)
    income_exempt: Decimal = ZERO            # neapmokestinama (kompensacijos, pašalpos iki limito)
    in_kind: Decimal = ZERO                  # dalis income_standard, kuri neišmokama pinigais (natūra)
    sodra_base: Decimal = ZERO               # pajamos, nuo kurių skaičiuojamos Sodra įmokos (SAM A11)

    # Darbuotojas
    npd_mode: str = NPD_STANDARD
    pension_accumulation: bool = False
    progressive_request: bool = False        # prašymas taikyti progresinį GPM per metus
    gpm_taxable_ytd: Decimal = ZERO          # apmokestinamų pajamų suma nuo metų pradžios (progresiniam)
    vsd_base_ytd: Decimal = ZERO             # VSD bazė nuo metų pradžios (lubos)

    # Darbdavys / sutartis
    fixed_term: bool = False
    na_rate: Decimal = Decimal("0.14")
    pays_gar_ilg: bool = True

    # Grindys (minimali įmokų bazė)
    grindys_applies: bool = False
    insured_fraction: Decimal = ONE          # draustojo mėnesio dalis (nepilnas mėnuo)


@dataclass
class TaxResult:
    npd_total: Decimal = ZERO
    npd_standard: Decimal = ZERO
    npd_sick: Decimal = ZERO

    gpm: Decimal = ZERO
    gpm_sick: Decimal = ZERO

    vsd_base: Decimal = ZERO
    vsd: Decimal = ZERO
    psd: Decimal = ZERO
    kaupimas: Decimal = ZERO

    employer_vsd: Decimal = ZERO
    gar: Decimal = ZERO
    ilg: Decimal = ZERO

    grindys_diff: Decimal = ZERO
    grindys_vsd: Decimal = ZERO   # darbuotojo VSD dalis + darbdavio VSD + ILG (į 4482)
    grindys_psd: Decimal = ZERO   # darbuotojo PSD dalis (į 4486)

    sam_tax_rate: Decimal = ZERO
    sam_payment: Decimal = ZERO
    cap_reached: bool = False

    gross: Decimal = ZERO
    net: Decimal = ZERO
    notes: list = field(default_factory=list)

    @property
    def employee_sodra(self):
        return self.vsd + self.psd + self.kaupimas

    @property
    def employer_total(self):
        return self.employer_vsd + self.gar + self.ilg + self.grindys_vsd + self.grindys_psd

    @property
    def gpm_total(self):
        return self.gpm + self.gpm_sick


# ============================================================
# NPD
# ============================================================

def calc_npd(income, P, mode=NPD_STANDARD):
    """Apskaičiuotas mėnesio NPD (dar neapribotas pajamomis)."""
    if mode == NPD_NONE or income <= ZERO:
        return ZERO
    if mode == NPD_30_55:
        return P.npd_30_55
    if mode == NPD_0_25:
        return P.npd_0_25
    if income <= P.mma:
        return P.npd_max
    return max(q2(P.npd_max - P.npd_coef * (income - P.mma)), ZERO)


def split_npd(npd_applied, income_standard, income_sick):
    """NPD proporcingai: ligos dalis apvalinama, DU dalis = likutis (be +-0,01)."""
    base = income_standard + income_sick
    if npd_applied <= ZERO or base <= ZERO or income_sick <= ZERO:
        return npd_applied, ZERO
    npd_sick = q2(npd_applied * income_sick / base)
    return npd_applied - npd_sick, npd_sick


# ============================================================
# GPM
# ============================================================

def calc_gpm_standard(taxable, P, progressive=False, taxable_ytd=ZERO):
    """
    GPM nuo 20 % pajamų.
    Pagal nutylėjimą 20 % (darbdavys vertina konkrečią išmoką).
    progressive=True - pagal darbuotojo prašymą, kaupiant nuo metų pradžios.
    ⚠ Progresinio slenksčio bazė (pajamos po NPD) - patikrinti su VMI.
    """
    if taxable <= ZERO:
        return ZERO
    if not progressive:
        return pct(taxable, P.gpm_rate_1)

    t1, t2 = P.gpm_threshold_1_amount, P.gpm_threshold_2_amount
    start, end = taxable_ytd, taxable_ytd + taxable
    parts = (
        (max(min(end, t1) - start, ZERO), P.gpm_rate_1),
        (max(min(end, t2) - max(start, t1), ZERO), P.gpm_rate_2),
        (max(end - max(start, t2), ZERO), P.gpm_rate_3),
    )
    return q2(sum(amount * rate / HUNDRED for amount, rate in parts))


# ============================================================
# SODRA
# ============================================================

def employer_unemp_rate(P, fixed_term):
    return P.empl_unemp_term if fixed_term else P.empl_unemp


def sam_tax_rate(P, inp):
    """SAM P3: darbuotojo + darbdavio bendras tarifas (pvz. 21,27 / 24,27 / 21,99 / 24,99)."""
    rate = P.employee_sodra_rate + employer_unemp_rate(P, inp.fixed_term) + inp.na_rate
    if inp.pays_gar_ilg:
        rate += P.gar + P.ilg
    if inp.pension_accumulation:
        rate += P.kaupimas
    return rate


def calc_sodra(P, inp, r):
    base = inp.sodra_base
    if base <= ZERO:
        return

    remaining_cap = max(P.vsd_cap_amount - inp.vsd_base_ytd, ZERO)
    vsd_base = min(base, remaining_cap)
    r.vsd_base = vsd_base
    r.cap_reached = vsd_base < base

    unemp_na = employer_unemp_rate(P, inp.fixed_term) + inp.na_rate

    if not r.cap_reached:
        total = pct(base, P.employee_sodra_rate)
        r.psd = pct(base, P.psd_emp)
        r.vsd = total - r.psd
    else:
        r.vsd = pct(vsd_base, P.vsd_emp)
        r.psd = pct(base, P.psd_emp)
        r.notes.append(f"Pasiektos VSD lubos: VSD bazė {vsd_base} iš {base}")

    if inp.pension_accumulation:
        r.kaupimas = pct(vsd_base, P.kaupimas)

    r.employer_vsd = pct(vsd_base, unemp_na)
    if inp.pays_gar_ilg:
        r.gar = pct(base, P.gar)
        r.ilg = pct(base, P.ilg)

    # SAM derinimas: A12 = round(A11 x P3), skirtumą (±0,01) priskiriam darbdavio VSD
    r.sam_tax_rate = sam_tax_rate(P, inp)
    r.sam_payment = pct(base, r.sam_tax_rate)
    if not r.cap_reached:
        diff = r.sam_payment - (r.vsd + r.psd + r.kaupimas + r.employer_vsd + r.gar + r.ilg)
        if diff != ZERO:
            r.employer_vsd += diff
            r.notes.append(f"SAM apvalinimo korekcija darbdavio VSD: {diff}")


def calc_grindys(P, inp, r):
    """Priemoka iki minimalios bazės (MMA) - moka darbdavys, iš DU neišskaitoma."""
    if not inp.grindys_applies:
        return
    target = q2(P.mma * inp.insured_fraction)
    diff = target - inp.sodra_base
    if diff <= ZERO:
        return
    r.grindys_diff = diff
    emp_total = pct(diff, P.employee_sodra_rate)
    emp_psd = pct(diff, P.psd_emp)
    emp_vsd = emp_total - emp_psd
    empl_vsd = pct(diff, employer_unemp_rate(P, inp.fixed_term) + inp.na_rate)
    ilg = pct(diff, P.ilg) if inp.pays_gar_ilg else ZERO
    r.grindys_vsd = emp_vsd + empl_vsd + ilg
    r.grindys_psd = emp_psd


# ============================================================
# PAGRINDINĖ FUNKCIJA
# ============================================================

def calculate(P, inp):
    r = TaxResult()

    # NPD
    npd_base = inp.income_standard + inp.income_sick
    npd_calc = calc_npd(npd_base, P, inp.npd_mode)
    r.npd_total = min(npd_calc, npd_base)
    r.npd_standard, r.npd_sick = split_npd(r.npd_total, inp.income_standard, inp.income_sick)

    # GPM
    taxable = max(inp.income_standard - r.npd_standard, ZERO) + inp.income_standard_no_npd
    r.gpm = calc_gpm_standard(taxable, P, inp.progressive_request, inp.gpm_taxable_ytd)
    r.gpm_sick = pct(max(inp.income_sick - r.npd_sick, ZERO), P.gpm_sick)

    # Sodra
    calc_sodra(P, inp, r)
    calc_grindys(P, inp, r)

    # Suvestinė
    r.gross = inp.income_standard + inp.income_standard_no_npd + inp.income_sick + inp.income_exempt
    r.net = r.gross - inp.in_kind - r.gpm_total - r.employee_sodra
    return r
