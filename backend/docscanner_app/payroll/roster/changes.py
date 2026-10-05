"""
Paskelbto grafiko keitimai: skirtumai tarp versijų ir DK 115 str. reikalavimas -
paskelbtas grafikas keičiamas tik dėl nuo darbdavio nepriklausančių priežasčių, įspėjus darbuotoją
ne vėliau kaip prieš 2 jo darbo dienas.
"""
from datetime import date


def _key(it):
    return int(it["employee_id"]), it["date"]


def diff(old, new):
    """old/new: [{"employee_id","date","shift_type_id","start","end",...}] -> {emp: [{"date","old","new"}]}"""
    a = {_key(x): x for x in old}
    b = {_key(x): x for x in new}
    out = {}
    for k in sorted(set(a) | set(b), key=lambda k: (k[0], k[1])):
        o, n = a.get(k), b.get(k)
        if o and n and (o.get("shift_type_id"), o.get("start"), o.get("end")) == (n.get("shift_type_id"), n.get("start"), n.get("end")):
            continue
        out.setdefault(k[0], []).append({"date": k[1], "old": o, "new": n})
    return out


def late_changes(changes, today, old_items):
    """
    Pakeitimai, apie kuriuos įspėjama mažiau nei prieš 2 darbuotojo darbo dienas (pagal iki šiol galiojusį grafiką).
    -> [{"employee_id", "date"}]
    """
    work = {}
    for x in old_items:
        work.setdefault(int(x["employee_id"]), set()).add(x["date"])
    out = []
    for emp, items in changes.items():
        days = sorted(work.get(emp, ()))
        for ch in items:
            d = ch["date"]
            if d <= today.isoformat():
                out.append({"employee_id": emp, "date": d})
                continue
            between = [x for x in days if today.isoformat() < x < d]
            if len(between) < 2:
                out.append({"employee_id": emp, "date": d})
    return out


def describe(item):
    if not item:
        return "laisva"
    return f'{item.get("name") or item.get("code") or "pamaina"} {item.get("start", "")[11:16]}–{item.get("end", "")[11:16]}'


def lines_for(changes_of_employee):
    return [f'{c["date"][5:]}: {describe(c["old"])} → {describe(c["new"])}' for c in changes_of_employee]
