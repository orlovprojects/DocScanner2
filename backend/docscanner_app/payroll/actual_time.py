"""
Tabelis: faktinis darbo laikas „nuo-iki“ -> valandų išskaidymas (grynas modulis).
Naktis 22-06, šventės pagal kalendorines dienas, viršvalandžiai - virš grafiko valandų,
darbas poilsio dieną pagal grafiką (DK 144 str.).
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

from .roster.shifts import make_shift, night_hours, holiday_hours

ZERO = Decimal("0")


def _t(v):
    if v in (None, ""):
        return None
    if isinstance(v, time):
        return v
    h, m = str(v)[:5].split(":")
    return time(int(h), int(m))


def actual_breakdown(day, start, end, break_minutes=0, break_start=None, planned=None, rest_day=False):
    """
    planned: None arba (start, end, break_minutes, break_start) - pamaina pagal grafiką.
    -> {"hours", "night", "holiday", "overtime", "ot_night", "rest_day"} (Decimal)
    """
    bs = _t(break_start)
    if bs is None and planned and int(break_minutes or 0):
        # pertraukos laikas nenurodytas - laikome, kad ji buvo pagal grafiką (arba grafiko pamainos viduryje)
        bs = _t(planned[3])
        if bs is None:
            ps = make_shift(0, day, _t(planned[0]), _t(planned[1]))
            mid = ps.start + (ps.end - ps.start) / 2 - timedelta(minutes=int(break_minutes) // 2)
            bs = mid.time().replace(second=0, microsecond=0)
    sh = make_shift(0, day, _t(start), _t(end), int(break_minutes or 0), None, bs)
    total = sh.hours
    night = night_hours(sh)
    holiday = holiday_hours(sh)
    out = {"hours": total, "night": night, "holiday": holiday, "overtime": ZERO, "ot_night": ZERO, "rest_day": ZERO}
    if rest_day:
        out["rest_day"] = max(total - holiday, ZERO)          # šventės valandos skaičiuojamos atskirai
        return out
    if planned:
        p = make_shift(0, day, _t(planned[0]), _t(planned[1]), int(planned[2] or 0), None, _t(planned[3]))
        over = max(total - p.hours, ZERO)
        if over:
            extra_night = max(night - night_hours(p), ZERO)   # naktinės valandos, kurios atsirado dėl viršvalandžių
            ot_night = min(over, extra_night)
            out.update(overtime=over - ot_night, ot_night=ot_night, night=night - ot_night)
    return out
