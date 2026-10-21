"""
Pamainų planas (kiek darbuotojų reikia kiekvienai dienai ir pamainai) ir pamainos tipo validacija.
Gryni moduliai - be Django, kad būtų lengva testuoti.
"""
import re

# Tos pačios 10 spalvų kaip frontende (GrafikaiPage PALETTE)
PALETTE = ("#7DB4FF", "#5FD39A", "#FFA762", "#B69CFF", "#FF8DC3", "#4DD4E8", "#FFD255", "#FF8A8A", "#B8E06A", "#D9A77E")
# Ankstesnės paletės -> nauja (seni įrašai rodomi ir tikrinami pagal naują)
LEGACY_COLORS = {
    "#4C8BF5": "#7DB4FF", "#7C3AED": "#B69CFF", "#12A594": "#5FD39A", "#F76B15": "#FFA762", "#E5484D": "#FF8A8A",
    "#B08A3E": "#D9A77E", "#0284C7": "#4DD4E8", "#C026D3": "#FF8DC3", "#65A30D": "#B8E06A", "#475569": "#7DB4FF",
    "#2563EB": "#7DB4FF", "#059669": "#5FD39A", "#EA580C": "#FFA762", "#E11D48": "#FF8A8A", "#0891B2": "#4DD4E8",
    "#A16207": "#FFD255", "#4D7C0F": "#B8E06A", "#334155": "#D9A77E",
}
DEFAULT_WEEKDAY_NEED = [1, 1, 1, 1, 1, 0, 0]          # Pr-Pn po 1, Št-Sk - 0


def default_weekday_need():
    return list(DEFAULT_WEEKDAY_NEED)


def normalize_need(value):
    """7 sveikųjų skaičių ≥ 0 (Pr..Sk). Netinkama reikšmė -> ValueError."""
    if value is None:
        return default_weekday_need()
    if not isinstance(value, (list, tuple)) or len(value) != 7:
        raise ValueError("Numatytas darbuotojų poreikis – 7 skaičiai (Pr–Sk)")
    out = []
    for v in value:
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Darbuotojų poreikis turi būti sveikas skaičius")
        if n < 0 or n > 99 or (isinstance(v, float) and v != n):
            raise ValueError("Darbuotojų poreikis – sveikas skaičius nuo 0 iki 99")
        out.append(n)
    return out


def default_weekday_max():
    return [None] * 7                                  # be ribos (kaip iki šiol)


def normalize_max(value, need=None):
    """7 reikšmės: sveikas skaičius ≥ 0 arba None (be ribos). Daugiausia ne mažiau nei reikia."""
    if value is None:
        return default_weekday_max()
    if not isinstance(value, (list, tuple)) or len(value) != 7:
        raise ValueError("Daugiausia darbuotojų – 7 reikšmės (Pr–Sk)")
    out = []
    for i, v in enumerate(value):
        if v in (None, ""):
            out.append(None)
            continue
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Daugiausia darbuotojų turi būti sveikas skaičius")
        if n < 0 or n > 99:
            raise ValueError("Daugiausia darbuotojų – nuo 0 iki 99")
        if need is not None and n < need[i]:
            raise ValueError(f"{['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'][i]}: daugiausia negali būti mažiau nei reikia")
        out.append(n)
    return out


def norm_color(c):
    c = (c or "").strip().upper()
    return LEGACY_COLORS.get(c, c)


def validate_shift_type(data, used_colors=()):
    """
    data: name, code, start_time, end_time, break_minutes, color, default_staff_need_by_weekday.
    used_colors - kitų tos įmonės pamainų spalvos. -> {laukas: klaida}
    """
    err = {}
    name = (data.get("name") or "").strip()
    if not 2 <= len(name) <= 40:
        err["name"] = "Pavadinimas – nuo 2 iki 40 simbolių"
    code = (data.get("code") or "").strip()
    if not (1 <= len(code) <= 3 and all(ch.isalnum() for ch in code)):
        err["code"] = "Kodas – 1–3 raidės arba skaičiai"
    for f in ("start_time", "end_time"):
        if data.get(f) is None:
            err[f] = "Nurodykite laiką (24 val. formatu)"
    b = data.get("break_minutes")
    if b is not None and (not isinstance(b, int) or not 0 <= b <= 1440):
        err["break_minutes"] = "Pertrauka – sveikas skaičius nuo 0 iki 1440 min."
    bs = data.get("break_start")
    if bs is not None and data.get("start_time") is not None and data.get("end_time") is not None:
        from datetime import datetime as _dt, date as _d, timedelta as _td
        s0 = _dt.combine(_d(2026, 1, 5), data["start_time"])
        e0 = _dt.combine(_d(2026, 1, 5), data["end_time"])
        e0 += _td(days=1) if e0 <= s0 else _td(0)
        b0 = _dt.combine(_d(2026, 1, 5), bs)
        b0 += _td(days=1) if b0 < s0 else _td(0)
        if not (data.get("break_minutes") or 0):
            err["break_start"] = "Nurodykite pertraukos trukmę"
        elif b0 + _td(minutes=int(data["break_minutes"])) > e0:
            err["break_start"] = "Pertrauka turi būti pamainos laiku"
        elif (b0 - s0) > _td(hours=5):
            err["break_start"] = "Pertrauka suteikiama ne vėliau kaip po 5 val. darbo (DK 122 str.)"
    color = norm_color(data.get("color"))
    if color not in PALETTE:
        err["color"] = "Pasirinkite vieną iš 10 spalvų"
    elif color in {norm_color(c) for c in used_colors}:
        err["color"] = "Ši spalva jau naudojama kitai pamainai"
    need = None
    try:
        need = normalize_need(data.get("default_staff_need_by_weekday"))
    except ValueError as e:
        err["default_staff_need_by_weekday"] = str(e)
    try:
        normalize_max(data.get("default_staff_max_by_weekday"), need)
    except ValueError as e:
        err["default_staff_max_by_weekday"] = str(e)
    return err


def validate_tag_name(name):
    n = (name or "").strip()
    if not 2 <= len(n) <= 24:
        return "Žymos pavadinimas – nuo 2 iki 24 simbolių"
    return None


def build_plan(days, shift_types, rules=(), is_holiday=lambda d: False, manual=None):
    """
    Pamainų planas mėnesiui -> {(data, shift_id): (min, max)}.
      1) pamainos nustatymai pagal savaitės dieną: reikia (min) ir daugiausia (max, None - be ribos);
         švenčių dieną - kaip sekmadienį;
      2) rankiniai konkrečios dienos nustatymai (manual) - aukščiausias prioritetas, neperrašomi.
    shift_types: [(id, [7 min]) arba (id, [7 min], [7 max])] - tik aktyvios.
    rules - nebenaudojama (taisyklė „Darbuotojų skaičius pamainoje“ pakeista pamainų nustatymais).
    """
    plan = {}
    for d in days:
        wd = 6 if is_holiday(d) else d.weekday()
        for st in shift_types:
            sid, need = st[0], normalize_need(st[1])
            mx = normalize_max(st[2] if len(st) > 2 else None)
            mn, top = need[wd], mx[wd]
            if mn or top:
                plan[d, sid] = (mn, top)
    for key, val in (manual or {}).items():
        plan[key] = val
    return {k: v for k, v in plan.items() if v[0] or v[1]}


def variant_stats(assignments, hours, targets, slots, night_ids=(), names=None, tolerance=4):
    """
    Grafiko varianto santrauka palyginimui:
      poreikio padengimas, valandų nuokrypiai nuo normos, savaitgaliai ir naktys per darbuotoją.
    assignments: [(emp, date, sid)] (date - date arba ISO); hours / targets: {emp: valandos}; slots: {(date, sid): (min, max)}.
    """
    from datetime import date as _date
    names = names or {}
    as_date = lambda d: d if isinstance(d, _date) else _date.fromisoformat(str(d))   # noqa: E731
    cnt, weekends, nights = {}, {}, {}
    for e, d, sid in assignments:
        d = as_date(d)
        cnt[d, sid] = cnt.get((d, sid), 0) + 1
        if d.weekday() >= 5:
            weekends[e] = weekends.get(e, 0) + 1
        if sid in night_ids:
            nights[e] = nights.get(e, 0) + 1
    needed = filled = 0
    short = {}
    over_max = 0
    for (d, sid), (mn, mx) in (slots or {}).items():
        d = as_date(d)
        have = cnt.get((d, sid), 0)
        needed += mn or 0
        filled += min(have, mn or 0)
        if mn and have < mn:
            short[d] = short.get(d, 0) + (mn - have)
        if mx and have > mx:
            over_max += 1
    devs = []
    for e, t in (targets or {}).items():
        h = float((hours or {}).get(str(e), (hours or {}).get(e, 0)) or 0)
        devs.append((round(h - float(t), 1), e))
    over = [x for x in devs if x[0] > tolerance]
    under = [x for x in devs if x[0] < -tolerance]
    people = list(targets or {})
    wk = [weekends.get(int(e) if str(e).isdigit() else e, weekends.get(e, 0)) for e in people] or [0]
    worst = sorted(devs, key=lambda x: -abs(x[0]))[:5]
    return {
        "coverage": {"needed": needed, "filled": filled, "short_days": [d.isoformat() for d in sorted(short)],
                     "short_total": sum(short.values()), "over_max": over_max},
        "hours": {"over": len(over), "under": len(under),
                  "max_over": max([x[0] for x in over], default=0), "max_under": min([x[0] for x in under], default=0),
                  "worst": [{"employee": names.get(int(e) if str(e).isdigit() else e, str(e)), "diff": dv} for dv, e in worst if abs(dv) > tolerance]},
        "weekends": {"min": min(wk), "max": max(wk)},
        "nights_max": max(nights.values(), default=0),
    }
