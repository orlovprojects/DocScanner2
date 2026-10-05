"""
Esamo grafiko (rankinio ar automatinio) tikrinimas pagal pamainų planą ir taisykles - be sprendiklio.
Rodoma tinklelyje: oranžinis langelio kontūras + paaiškinimas, kokia taisyklė pažeista.
"""
from collections import defaultdict
from datetime import date, timedelta

AVAIL_KINDS = ("only_shifts", "never_shifts", "not_on_weekdays", "only_on_weekdays", "unavailable")


def _sid_set(rule, all_ids):
    ids = rule.params.get("shifts")
    return set(ids) if ids else set(all_ids)


def _days_ok(rule, d):
    wd = rule.params.get("weekdays")
    return not wd or d.weekday() in wd


def blocked(rule, d, sid, all_ids):
    """Ar prieinamumo taisyklė draudžia darbuotojui (iš rule.target) pamainą sid dieną d."""
    k, p = rule.kind, rule.params
    if k == "only_shifts":
        return sid not in _sid_set(rule, all_ids)
    if k == "never_shifts":
        return sid in _sid_set(rule, all_ids)
    if k == "not_on_weekdays":
        return d.weekday() in set(p.get("weekdays") or [])
    if k == "only_on_weekdays":
        return d.weekday() not in set(p.get("weekdays") or [])
    if k == "unavailable":
        a = date.fromisoformat(p["date_from"])
        b = date.fromisoformat(p.get("date_to") or p["date_from"])
        return a <= d <= b
    return False


def check_rules(assignments, shift_ids, rules, slots=None, absences=None, night_ids=()):
    """
    assignments: [(emp, date, sid)]; slots: {(date, sid): (min, max)} arba None; absences: {emp: set(datos)}
    -> [{"rule_id", "label", "employee_id", "date", "message", "hard"}]
    """
    out = []
    absences = absences or {}
    by_cell = defaultdict(set)          # (date, sid) -> {emp}
    by_emp = defaultdict(dict)          # emp -> {date: sid}
    for e, d, s in assignments:
        by_cell[d, s].add(e)
        by_emp[e][d] = s

    def add(r, emp, d, msg):
        out.append({"rule_id": r.id if r else None, "label": (r.label if r else "Pamainų planas"),
                    "employee_id": emp, "date": d.isoformat() if d else None, "message": msg,
                    "hard": r.hard if r else True})

    # nebuvimai
    for e, d, s in assignments:
        if d in absences.get(e, ()):
            add(None, e, d, "Darbuotojas tą dieną nedirba (atostogos, liga ar kt.)")

    # planas
    if slots is not None:
        for (d, s), emps in by_cell.items():
            if (d, s) not in slots:
                for e in emps:
                    add(None, e, d, "Šios pamainos tą dieną plane nėra")
        for (d, s), (mn, mx) in slots.items():
            n = len(by_cell.get((d, s), ()))
            if n < (mn or 0):
                add(None, None, d, f"Trūksta {mn - n} darbuotojo(-ų) pamainai")
            if mx not in (None, "") and n > mx:
                add(None, None, d, f"Pamainoje {n} darbuotojai - daugiau nei {mx}")

    for r in rules:
        k = r.kind
        if k in AVAIL_KINDS:
            for e in r.target:
                for d, s in by_emp.get(e, {}).items():
                    if blocked(r, d, s, shift_ids):
                        add(r, e, d, f"Pažeidžiama taisyklė: {r.label}")
        elif k in ("at_least_of", "at_most_of", "no_two_of", "not_all_of"):
            sids = _sid_set(r, shift_ids)
            n_need = int(r.params.get("n", 1))
            for (d, s), emps in by_cell.items():
                if s not in sids or not _days_ok(r, d):
                    continue
                cnt = len(emps & r.target)
                if (k == "at_least_of" and cnt < n_need) or (k == "at_most_of" and cnt > n_need) \
                        or (k == "no_two_of" and cnt > 1) or (k == "not_all_of" and r.target and cnt >= len(r.target)):
                    add(r, None, d, f"Pažeidžiama taisyklė: {r.label}")
        elif k == "never_together":
            for (d, s), emps in by_cell.items():
                if emps & r.target and emps & r.target2 and (len(emps & (r.target | r.target2)) > 1):
                    add(r, None, d, f"Pažeidžiama taisyklė: {r.label}")
        elif k in ("only_with_one_of", "always_together"):
            for (d, s), emps in by_cell.items():
                for e in emps & r.target:
                    if not (emps - {e}) & r.target2:
                        add(r, e, d, f"Pažeidžiama taisyklė: {r.label}")
        elif k == "max_consecutive_days":
            n = int(r.params.get("n", 5))
            for e in r.target:
                run, prev = 0, None
                for d in sorted(by_emp.get(e, {})):
                    run = run + 1 if prev and d - prev == timedelta(days=1) else 1
                    prev = d
                    if run == n + 1:
                        add(r, e, d, f"Pažeidžiama taisyklė: {r.label} ({run} d. iš eilės)")
        elif k in ("max_consecutive_nights", "no_day_after_night"):
            nights = set(r.params.get("shifts") or night_ids)
            for e in r.target:
                days = by_emp.get(e, {})
                run, prev = 0, None
                for d in sorted(days):
                    is_n = days[d] in nights
                    if k == "no_day_after_night" and prev and d - prev == timedelta(days=1) \
                            and days[prev] in nights and not is_n:
                        add(r, e, d, f"Pažeidžiama taisyklė: {r.label}")
                    if k == "max_consecutive_nights":
                        run = run + 1 if is_n and prev and d - prev == timedelta(days=1) and days[prev] in nights else (1 if is_n else 0)
                        if run == int(r.params.get("n", 2)) + 1:
                            add(r, e, d, f"Pažeidžiama taisyklė: {r.label}")
                    prev = d
    return out


def plan_hints(slots, shift_hours, emps, rules, shift_ids, absences=None):
    """
    Prieš sudarant grafiką: ar planas įgyvendinamas su šiais žmonėmis ir taisyklėmis.
    slots {(date, sid): (min, max)}, shift_hours {sid: Decimal}, emps [(id, name, target_hours)]
    -> [{"level": "error"|"warning"|"info", "message"}]
    """
    absences = absences or {}
    hints = []
    need = sum((shift_hours[s] * (mn or 0) for (d, s), (mn, mx) in slots.items()), 0)
    norm = sum((t for _, _, t in emps), 0)
    if slots and norm:
        diff = need - norm
        if diff < -8:
            hints.append({"level": "warning", "message":
                          f"Plane {need:.0f} val., darbuotojų normos {norm:.0f} val. - trūksta ~{-diff:.0f} val. "
                          f"(susidarys nedirbtas laikas, už kurį mokama pusė)"})
        elif diff > 8:
            hints.append({"level": "warning", "message":
                          f"Plane {need:.0f} val., darbuotojų normos {norm:.0f} val. - reikės ~{diff:.0f} val. "
                          f"viršvalandžių arba papildomo darbuotojo"})
    avail_rules = [r for r in rules if r.kind in AVAIL_KINDS and r.hard]
    short = []
    for (d, s), (mn, mx) in sorted(slots.items()):
        ok = []
        for eid, _, _ in emps:
            if d in absences.get(eid, ()):
                continue
            if any(eid in r.target and blocked(r, d, s, shift_ids) for r in avail_rules):
                continue
            ok.append(eid)
        if len(ok) < (mn or 0):
            short.append(f"{d.isoformat()[5:]} ({len(ok)}/{mn})")
        for r in rules:
            if r.kind == "at_least_of" and r.hard and s in _sid_set(r, shift_ids) and _days_ok(r, d):
                if len(set(ok) & r.target) < int(r.params.get("n", 1)):
                    hints.append({"level": "error", "message":
                                  f"{d.isoformat()} - taisyklės „{r.label}“ neįmanoma įvykdyti: "
                                  f"iš nurodytų darbuotojų laisvi tik {len(set(ok) & r.target)}"})
    if short:
        hints.append({"level": "error", "message":
                      "Šioms pamainoms trūksta laisvų darbuotojų (dėl atostogų, ligų ar taisyklių): " + ", ".join(short[:12])
                      + ("…" if len(short) > 12 else "")})
    for r in rules:
        p = r.params or {}
        if p.get("min") not in (None, "") and p.get("max") not in (None, "") and int(p["min"]) > int(p["max"]):
            hints.append({"level": "error", "message": f"Taisyklėje „{r.label}“ „nuo“ didesnis už „iki“"})
    return hints
