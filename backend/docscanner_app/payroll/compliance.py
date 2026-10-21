"""
Darbo laiko teisėtumo patikros pagal FAKTĄ (tabelis) - grynas modulis.
Lygiai:  "error"     - duomenų klaida (blokuoja: pvz. > 24 val. per parą);
         "violation" - DK pažeidimas (tvirtinti galima tik sąmoningai, su paaiškinimu);
         "warning"   - rizika / priminimas (netrukdo).
Grafiko (plano) patikros - roster/law.py (12 val., 11 val. poilsis, 52 val./7 d., 35 val. poilsis).
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

ZERO = Decimal("0")
MAX_DAY_H = Decimal("12")             # DK 114 str. 1 d. 1 p. - darbo diena su viršvalandžiais
MAX_7D_H = Decimal("60")              # DK 114 str. 1 d. 2 p. - 7 d. su viršvalandžiais
MAX_OT_2D = Decimal("8")              # DK 119 str. 3 d. - viršvalandžiai per 2 dienas iš eilės
OT_YEAR_DEFAULT = Decimal("180")      # DK 119 str. 3 d. (kolektyvine sutartimi iki 260)
AVG_WEEK_H = Decimal("48")            # DK 114 str. 2 d. - vidutiniškai per laikotarpį
MINOR_DAY_H, MINOR_WEEK_H = Decimal("8"), Decimal("40")   # DK 114 str. 3 d. (16-18 m.)
OT_TYPES = ("overtime", "ot_night", "ot_rest", "ot_holiday")


@dataclass
class Issue:
    level: str
    code: str
    employee_id: int
    employee: str
    dates: list
    message: str

    def as_dict(self):
        return {"level": self.level, "code": self.code, "employee_id": self.employee_id, "employee": self.employee,
                "dates": [d.isoformat() for d in self.dates], "message": self.message}


@dataclass
class EmpFacts:
    employee_id: int
    name: str
    days: dict                                  # {date: {"hours": D, "extra": {type: D}}}
    birth_date: date = None
    ot_before_year: Decimal = ZERO              # šių metų viršvalandžiai iki šio mėnesio
    ot_year_limit: Decimal = OT_YEAR_DEFAULT
    period_hours_before: Decimal = ZERO         # suminė: išdirbta ankstesniais laikotarpio mėnesiais
    period_days_before: int = 0
    notes: list = field(default_factory=list)


def _fmt(v):
    t = f"{Decimal(str(v)):f}"
    return (t.rstrip("0").rstrip(".") if "." in t else t).replace(".", ",")


def _ot(day):
    return sum((Decimal(str(day.get("extra", {}).get(k, 0) or 0)) for k in OT_TYPES), ZERO)


def _total(day):
    return Decimal(str(day.get("hours") or 0)) + _ot(day)


def check_facts(e, first, last):
    out = []
    add = lambda lvl, code, dates, msg: out.append(Issue(lvl, code, e.employee_id, e.name, dates, msg))   # noqa: E731
    days = sorted(e.days)
    # 1) parą - duomenų klaida; daugiau 12 val. - pažeidimas
    for d in days:
        t = _total(e.days[d])
        if t > 24:
            add("error", "DAY_24", [d], f"{d:%m-%d}: {_fmt(t)} val. per parą – patikrinkite įvestas valandas")
        elif t > MAX_DAY_H:
            add("violation", "DAY_12", [d], f"{d:%m-%d}: dirbta {_fmt(t)} val. (daugiausia 12 val. per dieną)")
    # 2) 60 val. per bet kurias 7 d.
    seen = False
    d = first
    while d <= last - timedelta(days=6) and not seen:
        win = [x for x in days if d <= x <= d + timedelta(days=6)]
        h = sum((_total(e.days[x]) for x in win), ZERO)
        if h > MAX_7D_H:
            add("violation", "WEEK_60", win, f"{d:%m-%d}–{d + timedelta(days=6):%m-%d}: {_fmt(h)} val. per 7 d. (daugiausia 60)")
            seen = True
        d += timedelta(days=1)
    # 3) viršvalandžiai: 8 val. per 2 dienas iš eilės, metinis limitas
    for a in days:
        b = a + timedelta(days=1)
        two = _ot(e.days[a]) + (_ot(e.days[b]) if b in e.days else ZERO)
        if two > MAX_OT_2D:
            add("violation", "OT_2D", [a, b], f"{a:%m-%d}–{b:%m-%d}: {_fmt(two)} val. viršvalandžių per 2 dienas (daugiausia 8)")
            break
    month_ot = sum((_ot(e.days[x]) for x in days), ZERO)
    year_ot = e.ot_before_year + month_ot
    if year_ot > e.ot_year_limit:
        add("violation", "OT_YEAR", [], f"Viršvalandžių per metus {_fmt(year_ot)} val. – daugiau nei {_fmt(e.ot_year_limit)} val.")
    elif year_ot > e.ot_year_limit * Decimal("0.8"):
        add("warning", "OT_YEAR_NEAR", [], f"Viršvalandžių per metus jau {_fmt(year_ot)} val. iš {_fmt(e.ot_year_limit)}")
    # 4) vidutiniškai 48 val. per savaitę (laikotarpio pradžia + šis mėnuo)
    n_days = (last - first).days + 1 + e.period_days_before
    hours = e.period_hours_before + sum((_total(e.days[x]) for x in days), ZERO)
    if n_days >= 7:
        avg = (hours / Decimal(n_days) * 7).quantize(Decimal("0.1"))
        if avg > AVG_WEEK_H:
            # tik vieno mėnesio duomenys - įspėjimas (riba taikoma vidurkiui per visą apskaitinį laikotarpį)
            add("violation" if e.period_days_before else "warning", "AVG_48", [],
                f"Vidutiniškai {_fmt(avg)} val. per savaitę (riba – 48 val. vidutiniškai per apskaitinį laikotarpį)")
    # 5) nepilnamečiai (16-18 m.): iki 8 val. per dieną, 40 per savaitę, be naktinio darbo
    if e.birth_date:
        for x in days:
            age = x.year - e.birth_date.year - ((x.month, x.day) < (e.birth_date.month, e.birth_date.day))
            if age >= 18:
                continue
            t = _total(e.days[x])
            night = Decimal(str(e.days[x].get("extra", {}).get("night", 0) or 0)) + \
                Decimal(str(e.days[x].get("extra", {}).get("ot_night", 0) or 0))
            if t > MINOR_DAY_H:
                add("violation", "MINOR_DAY", [x], f"{x:%m-%d}: nepilnametis dirbo {_fmt(t)} val. (daugiausia 8)")
            if night > 0:
                add("violation", "MINOR_NIGHT", [x], f"{x:%m-%d}: nepilnametis dirbo naktį")
    return out


def summary(issues):
    lv = {"error": 0, "violation": 0, "warning": 0}
    for i in issues:
        lv[i.level] += 1
    return lv
