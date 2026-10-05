"""
Suminė darbo laiko apskaita: apskaitinis laikotarpis ir galutinis atsiskaitymas (DK 115 str.).
 - viršyta norma -> apmokama kaip viršvalandžiai (x1,5) arba, darbuotojo prašymu, val. x 1,5 pridedamos prie atostogų
 - neįvykdyta norma dėl grafiko -> sumokama pusė DU už neišdirbtas valandas
Mokėjimo būdas "actual" (pagal faktines val. kas mėnesį): x1 jau sumokėta, laikotarpio gale +0,5 / +0,5.
"""
from dataclasses import dataclass
from decimal import Decimal

ZERO = Decimal("0")
HALF = Decimal("0.5")


def period_bounds(year, month, months=3, anchor_month=1):
    """-> ((y1, m1), (y2, m2)) laikotarpis, į kurį patenka mėnuo; anchor_month - nuo kurio mėnesio skaičiuojama."""
    idx = (year * 12 + month - 1) - (anchor_month - 1)
    start = idx - idx % months + (anchor_month - 1)
    end = start + months - 1
    return (start // 12, start % 12 + 1), (end // 12, end % 12 + 1)


def is_last_month(year, month, months=3, anchor_month=1):
    return period_bounds(year, month, months, anchor_month)[1] == (year, month)


@dataclass
class PeriodMonth:
    year: int
    month: int
    norm_hours: Decimal          # mėnesio norma pagal etatą (be atostogų / ligos ir kt.)
    worked_hours: Decimal        # išdirbta pagal grafiką + nukrypimai


@dataclass
class Settlement:
    norm: Decimal
    worked: Decimal
    excess: Decimal
    deficit: Decimal
    lines: list                  # [(kodas, valandos, tarifas, koeficientas)]
    vacation_hours: Decimal = ZERO


def settle(months, hourly_rate, to_vacation=False):
    """Galutinis atsiskaitymas paskutinį laikotarpio mėnesį (mokėjimo būdas - pagal faktines valandas)."""
    norm = sum((m.norm_hours for m in months), ZERO)
    worked = sum((m.worked_hours for m in months), ZERO)
    diff = worked - norm
    lines, vac = [], ZERO
    excess = diff if diff > 0 else ZERO
    deficit = -diff if diff < 0 else ZERO
    if excess:
        if to_vacation:
            vac = excess * Decimal("1.5")
        else:
            lines.append(("SAV", excess, hourly_rate, HALF))
    if deficit:
        lines.append(("SAN", deficit, hourly_rate, HALF))
    return Settlement(norm, worked, excess, deficit, lines, vac)
