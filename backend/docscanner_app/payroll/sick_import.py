"""
Sodros ataskaita S15 „Informacija apie apdraustuosius, kuriems išduoti elektroniniai nedarbingumo pažymėjimai
arba nėštumo ir gimdymo atostogų pažymėjimai“ (XML) -> nebuvimai (liga, slauga, nėštumo ir gimdymo atostogos).

Skaitymas tolerantiškas žymų pavadinimams (EPTS schema: NedarbingumoPazymejimas / NestumoAtostoguPazymejimas,
Asmuo/AsmensKodas, Serija, Numeris, laikotarpio Pradzia / Pabaiga, NedarbingumoPriezastis). Prieš įrašant -
peržiūra, todėl neatpažinti duomenys nepatenka į DU.
"""
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, timedelta

# EPTS nedarbingumo priežastys
REASONS = {"1": "Liga", "2": "Epideminė situacija", "3": "Protezavimas", "4": "Ligonio slaugymas",
           "5": "Profesinė liga", "6": "Nelaimingas atsitikimas darbe / kelyje", "7": "Nelaimingas atsitikimas buityje",
           "8": "Sveiko vaiko priežiūra", "9": "Donorystė"}
# darbdavys moka 2 pirmąsias dienas tik dėl ligos / traumos buityje (ne slaugai, ne profesinei ligai / NA darbe)
EMPLOYER_PAYS = {"1", "2", "3", "7"}


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _date(v):
    m = re.match(r"(\d{4}-\d{2}-\d{2})", v or "")
    return date.fromisoformat(m.group(1)) if m else None


@dataclass
class Certificate:
    kind: str               # NEDP / NESP
    series: str
    number: str
    person_code: str
    name: str
    start: date
    end: date
    reason: str = ""
    annulled: bool = False

    @property
    def doc_no(self):
        return f"{self.series}{self.number}".strip()

    @property
    def reason_label(self):
        return "Nėštumo ir gimdymo atostogos" if self.kind == "NESP" else REASONS.get(self.reason, "Nedarbingumas")


def _flat(el, prefix=""):
    """Elemento medis -> {"Asmuo/AsmensKodas": "...", ...} + atributai."""
    out = {}
    for k, v in el.attrib.items():
        out[f"{prefix}@{_local(k)}"] = v
    for ch in el:
        name = f"{prefix}{_local(ch.tag)}"
        if len(ch):
            for k, v in _flat(ch, name + "/").items():
                out.setdefault(k, v)
        else:
            out.setdefault(name, (ch.text or "").strip())
        for k, v in ch.attrib.items():
            out.setdefault(f"{name}@{_local(k)}", v)
    return out


def _pick(f, *patterns, exclude=()):
    for pat in patterns:
        for k, v in f.items():
            if v and re.search(pat, k, re.I) and not any(re.search(x, k, re.I) for x in exclude):
                return v
    return ""


NOT_MAIN = (r"Slaugom", r"Priziurim", r"Sergant", r"Gydytoj", r"Autorius", r"Registrator", r"Stacionar",
            r"Reabilitac", r"Profesin", r"Nelaiming", r"GKK", r"NDNT", r"Pazeidim", r"Prasym", r"Anuliuot")


def parse(content):
    """bytes|str -> (pažymėjimai, ataskaita_atpažinta)"""
    xml = content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else content
    root = ET.fromstring(xml.encode("utf-8"))
    if _local(root.tag) != "DraudejoAtaskaita" and "epts" not in root.tag:
        return [], False
    out = []
    for el in root.iter():
        name = _local(el.tag)
        if not name.endswith("Pazymejimas") or not len(el):
            continue
        f = _flat(el)
        kind = "NESP" if re.search(r"Nestum|Gimdym", name, re.I) or _pick(f, r"Tipas$") == "NESP" else "NEDP"
        start = _date(_pick(f, r"(Nedarbingumo|Atostogu)?Laikotarp\w*/Pradzi", r"Pradzi\w*Data", r"Pradzi",
                            exclude=NOT_MAIN))
        end = _date(_pick(f, r"(Nedarbingumo|Atostogu)?Laikotarp\w*/Pabaig", r"Pabaig\w*Data", r"Pabaig",
                          exclude=NOT_MAIN))
        code = re.sub(r"\D", "", _pick(f, r"^Asmuo/AsmensKodas", r"^Asmuo/AsmKodas", r"AsmensKodas", exclude=NOT_MAIN))
        if not (start and end and code):
            continue
        out.append(Certificate(
            kind=kind, series=_pick(f, r"(^|/|@)(Dokumento)?Serija$", exclude=NOT_MAIN),
            number=_pick(f, r"(^|/|@)(Dokumento)?Numeris$", exclude=NOT_MAIN + (r"Draudimo", r"SD")),
            person_code=code,
            name=" ".join(x for x in (_pick(f, r"^Asmuo/Vardas", r"Vardas", exclude=NOT_MAIN),
                                      _pick(f, r"^Asmuo/Pavarde", r"Pavarde", exclude=NOT_MAIN)) if x).title(),
            start=start, end=end, reason=_pick(f, r"Priezast", exclude=(r"Anuliav",)),
            annulled=bool(_pick(f, r"Busena$") == "ANULIUOTAS" or _pick(f, r"AnuliavimoData")),
        ))
    out.sort(key=lambda c: (c.person_code, c.start))
    return out, True


def plan(certs, existing, employees):
    """
    certs: [Certificate]; existing: {dok. nr.: (įvykio id, pradžia, pabaiga)}; employees: {asmens kodas: darbuotojas}.
    -> [{cert, action: create / update / same / skip / annul, reason, continuation}]
    annul - Sodroje anuliuotas pažymėjimas, kuris jau įkeltas (nebuvimas bus pašalintas).
    Tęsinys - pažymėjimas, prasidedantis kitą dieną po to paties asmens ankstesnio (darbdavys nemoka).
    """
    rows, last_end = [], {}
    for c in certs:
        row = {"cert": c, "action": "create", "reason": "", "continuation": False}
        if c.annulled:
            if c.doc_no in existing:
                row.update(action="annul", reason="Sodroje anuliuotas – nebuvimas bus pašalintas")
            else:
                row.update(action="skip", reason="Anuliuotas")
        elif c.person_code not in employees:
            row.update(action="skip", reason="Darbuotojas nerastas")
        else:
            prev = last_end.get(c.person_code)
            row["continuation"] = bool(prev and prev[0] == c.kind and c.start <= prev[1] + timedelta(days=1))
            ex = existing.get(c.doc_no)
            if ex:
                row["action"] = "same" if (ex[1], ex[2]) == (c.start, c.end) else "update"
        if not c.annulled:
            prev_end = last_end.get(c.person_code, (None, c.end))[1]
            last_end[c.person_code] = (c.kind, max(c.end, prev_end))
        rows.append(row)
    return rows


# ============================================================
# Django: peržiūra ir įrašymas
# ============================================================

VACATION_KINDS = ("vacation", "vacation_prepaid")


def remaining_ranges(a_start, a_end, cut_start, cut_end):
    """Kas lieka iš laikotarpio [a_start; a_end], išėmus [cut_start; cut_end] -> [(pradžia, pabaiga)] (0-2 dalys)."""
    out = []
    if cut_start > a_start:
        out.append((a_start, min(a_end, cut_start - timedelta(days=1))))
    if cut_end < a_end:
        out.append((max(a_start, cut_end + timedelta(days=1)), a_end))
    return [(x, y) for x, y in out if x <= y]


def _fmt(d1, d2):
    return f"{d1:%m-%d}–{d2:%m-%d}"


def run_import(company, content, apply=False):
    """
    Peržiūra (apply=False) arba įrašymas. Be naujų / atnaujintų pažymėjimų:
      * rankiniu būdu įvesta liga tomis pačiomis dienomis (be pažymėjimo nr.) - sujungiama, o ne dubliuojama (merge);
      * liga kasmetinių atostogų metu - atostogos sutrumpinamos / padalijamos, likusios dienos grįžta į likutį (DK 127);
      * kitas nebuvimas tomis dienomis (nemokamos, vaiko priežiūros ir pan.) - konfliktas, neįrašoma;
      * anuliuotas Sodroje pažymėjimas - nebuvimas pašalinamas;
      * po kiekvieno pakeitimo atnaujinamas grafikas (pamainos pašalinamos / perbraukiamos, kaip ir įvedant ranka).
    """
    from django.db import transaction
    from docscanner_app.models import AbsenceEvent, Employee, PayrollRun
    from .services import release_roster_absence, sync_roster_absence
    from .work_calendar import work_days_between
    certs, ok = parse(content)
    if not ok:
        raise ValueError("Tai ne Sodros S15 ataskaita (nedarbingumo pažymėjimai)")
    employees = {e.personal_code: e for e in Employee.objects.filter(company=company) if e.personal_code}
    existing_qs = AbsenceEvent.objects.filter(employee__company=company).exclude(sick_leave_number="")
    existing = {ev.sick_leave_number: (ev.id, ev.start_date, ev.end_date) for ev in existing_qs}
    rows = plan(certs, existing, employees)
    closed = {(r.year, r.month) for r in PayrollRun.objects.filter(company=company, status__in=("approved", "paid", "closed"))}

    for r in rows:
        c = r["cert"]
        r["merge_id"], r["vacation_ids"] = None, []
        if r["action"] not in ("create", "update"):
            continue
        e = employees[c.person_code]
        overlap = list(AbsenceEvent.objects.filter(employee=e, status="approved", start_date__lte=c.end, end_date__gte=c.start)
                       .exclude(sick_leave_number=c.doc_no))
        manual_sick = [x for x in overlap if x.kind == "sick" and not x.sick_leave_number]
        vacations = [x for x in overlap if x.kind in VACATION_KINDS]
        other = [x for x in overlap if x not in manual_sick and x not in vacations and x.kind not in ("sick", "maternity")]
        if other:
            x = other[0]
            r.update(action="conflict", reason=f"Sutampa su: {x.get_kind_display()} {_fmt(x.start_date, x.end_date)} – pataisykite ranka")
            continue
        notes = []
        if len(manual_sick) > 1:
            r.update(action="conflict", reason="Sutampa su keliais rankiniu būdu įvestais ligos įrašais – sutvarkykite ranka")
            continue
        if manual_sick and r["action"] == "create":
            x = manual_sick[0]
            r.update(action="merge", merge_id=x.id)
            notes.append(f"Bus sujungtas su rankiniu ligos įrašu {_fmt(x.start_date, x.end_date)}")
        for v in vacations:
            r["vacation_ids"].append(v.id)
            left = remaining_ranges(v.start_date, v.end_date, c.start, c.end)
            what = ("bus pašalintos" if not left else "bus padalytos: " + ", ".join(_fmt(a, b) for a, b in left)
                    if len(left) == 2 else f"bus sutrumpintos iki {_fmt(*left[0])}")
            notes.append(f"Liga atostogų metu: atostogos {_fmt(v.start_date, v.end_date)} {what}, "
                         "nepanaudotos dienos grįš į likutį")
        if {(c.start.year, c.start.month), (c.end.year, c.end.month)} & closed:
            notes.append("DU už šį mėnesį jau patvirtintas – atidarykite ir perskaičiuokite")
        r["reason"] = "; ".join(notes)

    summary = {"create": 0, "update": 0, "merge": 0, "annul": 0, "same": 0, "skip": 0, "conflict": 0}
    for r in rows:
        summary[r["action"]] += 1

    if apply:
        with transaction.atomic():
            last_event = {}
            for r in rows:
                c = r["cert"]
                if r["action"] in ("skip", "conflict"):
                    continue
                if r["action"] == "annul":
                    ev = AbsenceEvent.objects.filter(id=existing[c.doc_no][0]).first()
                    if ev:
                        release_roster_absence(ev)
                        ev.delete()
                    continue
                e = employees[c.person_code]
                if r["action"] == "same":
                    last_event[c.person_code] = AbsenceEvent.objects.get(id=existing[c.doc_no][0])
                    continue
                # 1) atostogos, į kurias patenka liga - sutrumpinti / padalyti / pašalinti
                for vid in r["vacation_ids"]:
                    v = AbsenceEvent.objects.filter(id=vid).first()
                    if v is None:
                        continue
                    old = (v.start_date, v.end_date)
                    left = remaining_ranges(v.start_date, v.end_date, c.start, c.end)
                    if not left:
                        release_roster_absence(v)
                        v.delete()
                        continue
                    v.start_date, v.end_date = left[0]
                    v.work_days = work_days_between(*left[0])
                    note = f"Sutrumpinta dėl ligos {c.doc_no}"
                    v.comment = f"{v.comment}; {note}" if v.comment else note
                    v.save()
                    sync_roster_absence(v, old)
                    if len(left) == 2:
                        v2 = AbsenceEvent.objects.get(id=v.id)
                        v2.pk = v2.id = None
                        v2.start_date, v2.end_date = left[1]
                        v2.work_days = work_days_between(*left[1])
                        v2.removed_shifts = []
                        v2.comment = f"{v.comment} (antra dalis)"
                        v2.save()
                        sync_roster_absence(v2)
                # 2) pati liga
                kind = "maternity" if c.kind == "NESP" else "sick"
                parent = last_event.get(c.person_code) if r["continuation"] else None
                vals = dict(kind=kind, start_date=c.start, end_date=c.end,
                            work_days=work_days_between(c.start, c.end), source="sodra_xml", status="approved",
                            employer_pays_first_days=(c.kind == "NEDP" and c.reason in EMPLOYER_PAYS and not parent),
                            parent_event=parent, comment=f"S15: {c.reason_label}")
                if r["action"] in ("update", "merge"):
                    ev = AbsenceEvent.objects.get(id=existing[c.doc_no][0] if r["action"] == "update" else r["merge_id"])
                    old = (ev.start_date, ev.end_date)
                    for k, v in vals.items():
                        setattr(ev, k, v)
                    ev.sick_leave_number = c.doc_no
                    ev.save()
                    sync_roster_absence(ev, old)
                else:
                    ev = AbsenceEvent.objects.create(employee=e, sick_leave_number=c.doc_no, **vals)
                    sync_roster_absence(ev)
                last_event[c.person_code] = ev

    return {"summary": summary, "applied": bool(apply), "rows": [{
        "employee": (employees[r["cert"].person_code].full_name if r["cert"].person_code in employees
                     else (r["cert"].name or r["cert"].person_code[:3] + "…")),
        "document": r["cert"].doc_no, "kind": r["cert"].reason_label,
        "start": r["cert"].start, "end": r["cert"].end, "action": r["action"], "reason": r["reason"],
        "continuation": r["continuation"], "vacation": bool(r.get("vacation_ids")),
    } for r in rows]}
