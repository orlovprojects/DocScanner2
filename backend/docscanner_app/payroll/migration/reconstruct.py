"""
Perėjimo duomenų atkūrimas iš deklaracijų ir Sodros ataskaitų (be Django):
darbuotojai, mėnesio pajamos (S50 arba SAM + 2-SD), datos (S31 / S29 / 1-SD / 2-SD), nebuvimai (S4 / S5 / 9-SD / 12-SD),
išmokėjimo poslinkis ir GPM pagal GPM313.
"""
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

ZERO = Decimal("0")
TOL = Decimal("0.02")
EMPLOYEE_RATE = Decimal("19.50")
EMPLOYER_STD = Decimal("1.77")
FIXED_TERM_EXTRA = Decimal("0.72")               # terminuota sutartis: didesnė nedarbo draudimo įmoka
PENSION = (Decimal("3.00"), Decimal("2.70"), Decimal("1.80"))


def _prev(y, m):
    return (y - (m == 1), (m - 2) % 12 + 1)


def _month_iter(a, b):
    y, m = a.year, a.month
    while (y, m) <= (b.year, b.month):
        yield y, m
        y, m = (y + (m == 12), m % 12 + 1)


@dataclass
class EmpHistory:
    code: str
    first_name: str = ""
    last_name: str = ""
    sd_series: str = ""
    sd_number: str = ""
    start: object = None
    end: object = None
    lpk4: str = ""
    contract_reason: str = ""
    income: dict = field(default_factory=dict)       # (y, m) -> pajamos (Sodros bazė)
    rates: dict = field(default_factory=dict)        # (y, m) -> tarifas
    contrib: dict = field(default_factory=dict)      # (y, m) -> įmokos
    absences: list = field(default_factory=list)     # (forma, pradžia, pabaiga, kodas)
    pension: bool = False
    fixed_term: bool = False
    npd_none: bool = None
    _src: dict = field(default_factory=lambda: {"S50": {}, "SAM": {}, "2SD": {}})
    sd2_months: set = field(default_factory=set)     # mėnesiai su 2-SD (atleidimas - kompensacija už atostogas)


@dataclass
class Reconstruction:
    employees: dict = field(default_factory=dict)
    gpm313: dict = field(default_factory=dict)
    gpm312: dict = field(default_factory=dict)
    lag: int = None
    checks: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    files: list = field(default_factory=list)
    income_months: set = field(default_factory=set)  # mėnesiai, kurių pajamos įkeltos (S50 laikotarpis arba SAM)
    s50_periods: list = field(default_factory=list)
    s29_date: object = None                          # naujausio S29 data
    s29_codes: set = field(default_factory=set)      # kas dirba pagal naujausią S29
    insurer_code: str = ""                           # Sodros draudėjo kodas (SDUP insurerCode)
    s15: list = field(default_factory=list)          # nedarbingumo pažymėjimai (S15)
    sick_suspect: list = field(default_factory=list) # (y, m) pajamų mėnesiai, kai GPM313 rodo darbdavio apmokėtą ligą


def _emp(r, per):
    e = r.employees.setdefault(per.code, EmpHistory(per.code))
    e.first_name = e.first_name or per.first_name
    e.last_name = e.last_name or per.last_name
    e.sd_series = e.sd_series or per.sd_series
    e.sd_number = e.sd_number or per.sd_number
    return e


def _merge_foreign(r):
    """
    Užsienietis gali būti vienuose failuose su LT asmens kodu, kituose - tik su SD numeriu ("SD"+serija+numeris).
    Tokie įrašai sujungiami į vieną - pagal asmens kodą.
    """
    by_sd = {}
    for code, e in r.employees.items():
        if not code.startswith("SD") and e.sd_series and e.sd_number:
            by_sd.setdefault(f"SD{e.sd_series}{e.sd_number}", code)
    for sd_code, code in by_sd.items():
        src = r.employees.pop(sd_code, None)
        if src is None:
            continue
        dst = r.employees[code]
        # tas pats mėnuo abiem identifikatoriais - tai tie patys duomenys iš skirtingų failų, nesumuojama
        for k in ("S50", "SAM", "2SD"):
            for ym, v in src._src[k].items():
                dst._src[k].setdefault(ym, v)
        for ym, v in src.contrib.items():
            dst.contrib.setdefault(ym, v)
        for ym, v in src.rates.items():
            dst.rates.setdefault(ym, v)
        for item in src.absences:
            if item not in dst.absences:
                dst.absences.append(item)
        dst.sd2_months |= src.sd2_months
        dst.start = dst.start or src.start
        if src.end and (not dst.end or src.end > dst.end):
            dst.end = src.end
        dst.first_name = dst.first_name or src.first_name
        dst.last_name = dst.last_name or src.last_name
        dst.lpk4 = dst.lpk4 or src.lpk4
        dst.contract_reason = dst.contract_reason or src.contract_reason
        if sd_code in r.s29_codes:
            r.s29_codes.discard(sd_code)
            r.s29_codes.add(code)
        r.warnings.append(f"{dst.first_name} {dst.last_name}: įrašai su SD numeriu {sd_code[2:]} sujungti su asmens kodu")


def build(parsed_list):
    r = Reconstruction()
    sam_by_month, g313_by_month = defaultdict(list), defaultdict(list)
    # S50: keli failai gali dengti tą patį mėnesį - imamas naujausias (pagal laikotarpio pabaigą), nesumuojama
    parsed_list = sorted([p for p in parsed_list if p is not None],
                         key=lambda p: (p.form == "S50", p.period[1] or date.min) if p.form == "S50" else (False, date.min))
    s50_seen = set()
    for p in parsed_list:
        if p is None:
            continue
        r.files.append((p.file_name, p.form, p.year, p.month))
        if p.form == "SAM":
            sam_by_month[(p.year, p.month)].append(p)
            continue
        if p.form == "S15":
            r.s15 += [row for row in p.rows if not row.get("annulled")]
            continue
        if p.form == "GPM313":
            g313_by_month[(p.year, p.month)].append(p)
            continue
        if p.form == "GPM312":
            r.gpm312.setdefault(p.year, []).extend(p.rows)
            continue
        if p.form == "S50" and p.period[0] and p.period[1]:
            r.s50_periods.append(p.period)
            r.income_months |= set(_month_iter(p.period[0], p.period[1]))
        if (p.header or {}).get("DraudejoKodas"):
            r.insurer_code = re.sub(r"\D", "", p.header["DraudejoKodas"])
        if p.form == "S29" and p.period[1] and (r.s29_date is None or p.period[1] >= r.s29_date):
            r.s29_date = p.period[1]
            r.s29_codes = {row["person"].code for row in p.rows}
        file_s50 = set()
        for row in p.rows:
            e = _emp(r, row["person"])
            f = p.form
            if f == "S50":
                ym = (row["year"], row["month"])
                k = (e.code, ym)
                if k in s50_seen and k not in file_s50:      # senesnio failo duomenys - pakeičiami
                    e._src["S50"][ym] = ZERO
                    e.contrib[ym] = ZERO
                file_s50.add(k)
                e._src["S50"][ym] = e._src["S50"].get(ym, ZERO) + row["income"]
                e.rates[ym], e.contrib[ym] = row["rate"], e.contrib.get(ym, ZERO) + row["contrib"]
                if row.get("pran") == "2-SD":
                    e.sd2_months.add(ym)
            elif f in ("1-SD", "S2", "S29", "S31"):
                if row.get("start") and (not e.start or f in ("1-SD", "S31", "S29")):
                    e.start = row["start"]
                if f == "1-SD":
                    e.lpk4, e.contract_reason = row["lpk4"] or e.lpk4, row["reason"] or e.contract_reason
                if f == "S29":
                    e.lpk4 = e.lpk4 or row.get("lpk4", "")
                if f == "S31" and row.get("end"):
                    e.end = row["end"]
            elif f in ("2-SD", "S3"):
                if row.get("end"):
                    e.end = row["end"]
                    e.sd2_months.add((row["end"].year, row["end"].month))
                if f == "2-SD" and row.get("end"):
                    ym = (row["end"].year, row["end"].month)
                    e._src["2SD"][ym] = e._src["2SD"].get(ym, ZERO) + row["income"]
                    e.rates.setdefault(ym, row["rate"])
                    e.contrib[ym] = e.contrib.get(ym, ZERO) + row["contrib"]
            elif f in ("9-SD", "12-SD", "S4", "S5"):
                kind = "9-SD" if f in ("9-SD", "S4") else "12-SD"
                item = (kind, row["start"], row.get("cancel") or row["end"], row.get("reason", ""))
                if item not in e.absences:
                    e.absences.append(item)
        s50_seen |= file_s50

    # SAM: vienas mėnuo - viena versija
    for ym, items in sorted(sam_by_month.items()):
        items.sort(key=lambda x: (x.revised, x.doc_date or date.min))
        if len(items) > 1:
            r.warnings.append(f"SAM {ym[0]}-{ym[1]:02d}: rastos {len(items)} versijos - naudojama paskutinė")
        r.income_months.add(ym)
        for row in items[-1].rows:
            e = _emp(r, row["person"])
            e._src["SAM"][ym] = e._src["SAM"].get(ym, ZERO) + row["income"]
            e.rates.setdefault(ym, row["rate"])
            e.contrib.setdefault(ym, row["contrib"])

    _merge_foreign(r)

    # pajamos: S50 (apima ir 2-SD mėnesį) > SAM + 2-SD
    for e in r.employees.values():
        months = set(e._src["S50"]) | set(e._src["SAM"]) | set(e._src["2SD"])
        for ym in months:
            if ym in e._src["S50"]:
                e.income[ym] = e._src["S50"][ym]
            else:
                e.income[ym] = e._src["SAM"].get(ym, ZERO) + e._src["2SD"].get(ym, ZERO)
        # pensijų kaupimas / terminuota sutartis - pagal naujausio mėnesio tarifą (kaupimą galima nutraukti)
        for rate in ([e.rates[max(e.rates)]] if e.rates else []):
            rest = rate - EMPLOYEE_RATE - EMPLOYER_STD
            for pen in PENSION:
                if abs(rest - pen) <= TOL or abs(rest - pen - FIXED_TERM_EXTRA) <= TOL:
                    e.pension = True
            if abs(rest - FIXED_TERM_EXTRA) <= TOL or any(abs(rest - pen - FIXED_TERM_EXTRA) <= TOL for pen in PENSION):
                e.fixed_term = True
        if not e.contract_reason:
            e.contract_reason = "02" if e.fixed_term else "01"

    # GPM313
    for ym, items in sorted(g313_by_month.items()):
        vals = {tuple(x.rows[0][k] for k in ("G5", "G6", "G7")) for x in items}
        if len(vals) > 1:
            r.warnings.append(f"GPM313 {ym[0]}-{ym[1]:02d}: kelios versijos su skirtingomis DU sumomis - nurodykite galutinę")
        r.gpm313[ym] = items[-1].rows[0]

    def income_of(ym):
        return sum((e.income.get(ym, ZERO) for e in r.employees.values()), ZERO)

    score = {0: 0, 1: 0}
    for ym, g in r.gpm313.items():
        for lag in (0, 1):
            src = ym if lag == 0 else _prev(*ym)
            if g["G5"] > 0 and abs(income_of(src) - g["G5"]) <= TOL:
                score[lag] += 1
    r.lag = max(score, key=score.get) if any(score.values()) else None

    if r.lag is not None:
        none_months = all_months = 0
        for ym, g in sorted(r.gpm313.items()):
            src = ym if r.lag == 0 else _prev(*ym)
            inc = income_of(src)
            gpm = g["G6"] + g["G7"]
            known = src in r.income_months
            r.checks.append((ym, g["G5"], inc, gpm, known and abs(inc - g["G5"]) <= TOL))
            diff = g["G5"] - inc
            if known and inc > 0 and TOL < diff <= inc * Decimal("0.15"):
                r.sick_suspect.append(src)
                # išmokėta daugiau nei Sodros pajamose - dažniausiai darbdavio apmokėtos 2 ligos dienos (be Sodros įmokų)
                r.warnings.append(f"GPM313 {ym[0]}-{ym[1]:02d}: išmokėta {diff} € daugiau nei Sodros pajamose už "
                                  f"{src[0]}-{src[1]:02d} – tikėtina darbdavio apmokėtos ligos dienos (Sodros įmokomis "
                                  f"neapmokestinamos). Įkelkite S15, kad tiksliau apskaičiuotume VDU")
            if inc > 0:
                all_months += 1
                if abs(gpm - (inc * Decimal("0.20")).quantize(Decimal("0.01"))) <= TOL:
                    none_months += 1
        if all_months and none_months == all_months:
            for e in r.employees.values():
                if any(v > 0 for v in e.income.values()):
                    e.npd_none = True
    return r
