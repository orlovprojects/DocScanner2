"""Grafikas -> tabelis ir bazinis DU (suminei apskaitai darbo dienos imamos iš grafiko, ne iš savaitės šablono)."""
from decimal import Decimal

from ..timesheet import FD
from .shifts import holiday_hours, night_hours

NO_WEEK = (Decimal("0"),) * 7


def daily_extra(shifts):
    """{data: {"night": .., "holiday": ..}} - naktinės ir šventinės valandos iš pamainų."""
    out = {}
    for s in shifts:
        n, h = night_hours(s), holiday_hours(s)
        cur = out.setdefault(s.day, {})
        if n:
            cur["night"] = cur.get("night", Decimal("0")) + n
        if h:
            cur["holiday"] = cur.get("holiday", Decimal("0")) + h
    return {d: v for d, v in out.items() if v}


def timesheet_overrides(shifts, manual=None):
    """{data: {"code","hours","extra"}} timesheet.generate'ui; rankiniai pakeitimai (nukrypimai) - viršuje."""
    out = {}
    for s in shifts:
        cur = out.setdefault(s.day, {"code": FD, "hours": Decimal("0"), "extra": {}})
        cur["hours"] += s.hours
        n, h = night_hours(s), holiday_hours(s)
        if n:
            cur["extra"]["night"] = cur["extra"].get("night", Decimal("0")) + n
        if h:
            cur["extra"]["holiday"] = cur["extra"].get("holiday", Decimal("0")) + h
    for d, ov in (manual or {}).items():
        base = out.setdefault(d, {"code": FD, "hours": Decimal("0"), "extra": {}})
        base.update({k: v for k, v in ov.items() if k != "extra"})
        base["extra"].update(ov.get("extra", {}))
    return out


def daily_hours(shifts):
    out = {}
    for s in shifts:
        out[s.day] = out.get(s.day, Decimal("0")) + s.hours
    return out
