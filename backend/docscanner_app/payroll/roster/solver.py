"""
Automatinis pamainų grafiko sudarymas (Google OR-Tools CP-SAT).

Prioritetai (tikslo funkcijoje):
  įstatymas, nebuvimai, užrakintos pamainos, ciklai  -> griežtai (neįmanoma pažeisti)
  „būtinos“ taisyklės                                 -> labai didelė bauda (jei neįvykdoma - pranešama kuri ir kada)
  laikotarpio norma (be viršvalandžių / trūkumo)       -> didelė bauda už kiekvieną valandą
  „pageidautinos“ taisyklės (svarba 1-5)               -> vidutinė bauda
  darbo kaina (naktys, šventės)                        -> maža bauda
  darbuotojų pageidavimai                              -> mažiausia bauda
"""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from ortools.sat.python import cp_model

from ..work_calendar import is_holiday
from .law import MAX_7D_H, MIN_DAILY_REST_H
from .shifts import holiday_hours, make_shift, night_hours

H = 100                      # valandos -> šimtosios (CP-SAT dirba su sveikaisiais)
BIG = 1_000_000              # „būtina“ taisyklė
W_OVER, W_UNDER = 3_000, 2_000   # už valandą virš / žemiau normos
W_SOFT = 20_000              # „pageidautina“ (x svarba)
W_PREF = 2_000               # darbuotojo pageidavimas
W_FAIR = 5_000


@dataclass
class ShiftDef:
    id: int
    code: str
    start: time
    end: time
    break_minutes: int = 0

    def instance(self, emp, d):
        return make_shift(emp, d, self.start, self.end, self.break_minutes, self.id)


@dataclass
class Emp:
    id: int
    name: str
    target_hours: Decimal                     # mėnesio tikslas (norma + laikotarpio korekcija)
    hourly_rate: Decimal = Decimal("0")
    position_id: int = None
    position_group_id: int = None
    tags: set = field(default_factory=set)
    unavailable: set = field(default_factory=set)   # datos (atostogos, liga, mamadieniai...)
    max_over_hours: Decimal = Decimal("12")         # kiek daugiausia virš tikslo leidžiama


@dataclass
class Rule:
    id: int
    kind: str
    target: set = field(default_factory=set)        # darbuotojų id (jau išskleista)
    target2: set = field(default_factory=set)
    params: dict = field(default_factory=dict)
    hard: bool = True
    weight: int = 3
    label: str = ""


@dataclass
class Pref:
    employee_id: int
    day: date
    kind: str                                       # avoid / want / day_off
    shift_id: int = None


@dataclass
class Result:
    status: str
    assignments: list                               # [(emp_id, date, shift_id)]
    unmet: list                                     # [{"rule_id","label","dates"}]
    hours: dict                                     # emp_id -> Decimal
    cost: Decimal
    objective: float


class Problem:
    def __init__(self, days, shifts, emps, rules=(), prefs=(), locked=(), history=(), slots=None):
        """slots: {(data, shift_id): (min, max)} - pamainų planas; jei nurodytas, pamainos statomos tik į jį."""
        self.slots = slots
        self.days, self.shifts, self.emps = list(days), list(shifts), list(emps)
        self.rules, self.prefs, self.locked = list(rules), list(prefs), list(locked)
        self.history = list(history)               # ankstesnio mėn. pabaigos Shift (poilsiui tikrinti)
        self.m = cp_model.CpModel()
        self.x = {}
        self.penalties = []                        # (koef., kintamasis)
        self.slacks = []                           # (rule, var, date)
        self._build()

    # ---------- pagalbinės ----------
    def S(self, sid):
        return next(s for s in self.shifts if s.id == sid)

    def inst(self, e, d, s):
        return s.instance(e.id, d)

    def hours(self, s):
        return int(round(float(s.instance(0, self.days[0]).hours) * H))

    def work(self, e, d):
        return sum(self.x[e.id, d, s.id] for s in self.shifts if (e.id, d, s.id) in self.x)

    def _slack(self, rule, d, ub=50):
        v = self.m.NewIntVar(0, ub, f"sl_{rule.id}_{d}_{len(self.slacks)}")
        self.slacks.append((rule, v, d))
        self.penalties.append((BIG if rule.hard else W_SOFT * rule.weight, v))
        return v

    def _shift_ids(self, rule, key="shifts"):
        ids = rule.params.get(key)
        return set(ids) if ids else {s.id for s in self.shifts}

    def _days(self, rule):
        wd = rule.params.get("weekdays")
        return [d for d in self.days if not wd or d.weekday() in wd]

    def _is_night(self, s):
        return night_hours(s.instance(0, self.days[0])) >= Decimal("3")

    # ---------- modelis ----------
    def _build(self):
        m = self.m
        for e in self.emps:
            for d in self.days:
                for s in self.shifts:
                    self.x[e.id, d, s.id] = m.NewBoolVar(f"x_{e.id}_{d}_{s.id}")
                m.Add(self.work(e, d) <= 1)
                if d in e.unavailable:
                    m.Add(self.work(e, d) == 0)
        for (eid, d, sid) in self.locked:
            if (eid, d, sid) in self.x:
                m.Add(self.x[eid, d, sid] == 1)
        self._law()
        if self.slots is not None:
            self._plan()
        for r in self.rules:
            if self.slots is not None and r.kind == "min_max_staff":
                continue            # poreikį nusako planas; taisyklė naudojama tik planui užpildyti
            getattr(self, f"_r_{r.kind}", self._r_unknown)(r)
        self._norm()
        self._prefs()
        self._cost()

    def _plan(self):
        plan_rule = Rule(0, "plan", label="Pamainų planas")
        for e in self.emps:
            for d in self.days:
                for sh in self.shifts:
                    if (d, sh.id) not in self.slots:
                        self.m.Add(self.x[e.id, d, sh.id] == 0)
        for (d, sid), (mn, mx) in self.slots.items():
            if d not in self.days or not any(sh.id == sid for sh in self.shifts):
                continue
            if mn:
                self.m.Add(self._staff(d, sid) + self._slack(plan_rule, d) >= int(mn))
            if mx not in (None, ""):
                self.m.Add(self._staff(d, sid) - self._slack(plan_rule, d) <= int(mx))

    def _law(self):
        m = self.m
        # 11 val. poilsis tarp pamainų (ir su praėjusio mėn. paskutinėmis pamainomis)
        for s1 in self.shifts:
            for s2 in self.shifts:
                a = s1.instance(0, self.days[0])
                b = s2.instance(0, self.days[0] + timedelta(days=1))
                if (b.start - a.end).total_seconds() / 3600 < MIN_DAILY_REST_H:
                    for e in self.emps:
                        for d1, d2 in zip(self.days, self.days[1:]):
                            m.Add(self.x[e.id, d1, s1.id] + self.x[e.id, d2, s2.id] <= 1)
        for h in self.history:
            for s in self.shifts:
                b = s.instance(h.employee_id, self.days[0])
                if b.start < h.end + timedelta(hours=MIN_DAILY_REST_H) and (h.employee_id, self.days[0], s.id) in self.x:
                    m.Add(self.x[h.employee_id, self.days[0], s.id] == 0)
        # 52 val. per bet kurias 7 dienas; bent viena laisva diena per 7 dienas (≈35 val. poilsio)
        hist = defaultdict(int)
        for h in self.history:
            hist[h.employee_id, h.day] += int(round(float(h.hours) * H))
        for e in self.emps:
            for i in range(-6, len(self.days) - 6):
                win = [self.days[0] + timedelta(days=i + k) for k in range(7)]
                inside = [d for d in win if d in self.days]
                if len(inside) < 1:
                    continue
                prev = sum(hist[e.id, d] for d in win if d not in self.days)
                m.Add(sum(self.x[e.id, d, s.id] * self.hours(s) for d in inside for s in self.shifts) + prev
                      <= int(MAX_7D_H * H))
                if len(inside) == 7:
                    m.Add(sum(self.work(e, d) for d in inside) <= 6)

    def _norm(self):
        m = self.m
        self.total = {}
        for e in self.emps:
            tot = sum(self.x[e.id, d, s.id] * self.hours(s) for d in self.days for s in self.shifts)
            self.total[e.id] = tot
            target = int(round(float(e.target_hours) * H))
            over = m.NewIntVar(0, 400 * H, f"over_{e.id}")
            under = m.NewIntVar(0, 400 * H, f"under_{e.id}")
            m.Add(tot - target == over - under)
            m.Add(over <= int(float(e.max_over_hours) * H))
            self.penalties.append((W_OVER // H, over))
            self.penalties.append((W_UNDER // H, under))

    def _prefs(self):
        for p in self.prefs:
            if p.kind in ("avoid", "day_off"):
                ids = [p.shift_id] if p.shift_id else [s.id for s in self.shifts]
                for sid in ids:
                    if (p.employee_id, p.day, sid) in self.x:
                        self.penalties.append((W_PREF * (2 if p.kind == "day_off" else 1), self.x[p.employee_id, p.day, sid]))
            elif p.kind == "want":
                ids = [p.shift_id] if p.shift_id else [s.id for s in self.shifts]
                v = self.m.NewBoolVar("")
                vars_ = [self.x[p.employee_id, p.day, sid] for sid in ids if (p.employee_id, p.day, sid) in self.x]
                if vars_:
                    self.m.Add(sum(vars_) >= 1).OnlyEnforceIf(v.Not())   # v = 1 - pageidavimas neįvykdytas
                    self.m.Add(sum(vars_) == 0).OnlyEnforceIf(v)
                    self.penalties.append((W_PREF, v))

    def _cost(self):
        self.cost_terms = []
        for e in self.emps:
            for d in self.days:
                for s in self.shifts:
                    sh = s.instance(e.id, d)
                    eur = e.hourly_rate * (sh.hours + night_hours(sh) * Decimal("0.5") + holiday_hours(sh))
                    c = int(round(float(eur)))
                    if c:
                        self.cost_terms.append((c, self.x[e.id, d, s.id]))
                        self.penalties.append((c, self.x[e.id, d, s.id]))

    # ---------- taisyklės ----------
    def _r_unknown(self, r):
        pass

    def _staff(self, d, sid, emps=None):
        ids = emps if emps is not None else [e.id for e in self.emps]
        return sum(self.x[i, d, sid] for i in ids if (i, d, sid) in self.x)

    def _r_min_max_staff(self, r):
        for d in self._days(r):
            if not r.params.get("holidays", True) and is_holiday(d):
                continue
            for sid in self._shift_ids(r):
                if r.params.get("min"):
                    self.m.Add(self._staff(d, sid) + self._slack(r, d) >= int(r.params["min"]))
                if r.params.get("max") not in (None, ""):
                    self.m.Add(self._staff(d, sid) - self._slack(r, d) <= int(r.params["max"]))

    def _r_at_least_of(self, r):
        for d in self._days(r):
            for sid in self._shift_ids(r):
                self.m.Add(self._staff(d, sid, r.target) + self._slack(r, d) >= int(r.params.get("n", 1)))

    def _r_at_most_of(self, r):
        for d in self._days(r):
            for sid in self._shift_ids(r):
                self.m.Add(self._staff(d, sid, r.target) - self._slack(r, d) <= int(r.params.get("n", 1)))

    def _r_not_all_of(self, r):
        for d in self.days:
            for sid in self._shift_ids(r):
                self.m.Add(self._staff(d, sid, r.target) - self._slack(r, d) <= max(len(r.target) - 1, 0))

    def _r_no_two_of(self, r):
        for d in self.days:
            for sid in self._shift_ids(r):
                self.m.Add(self._staff(d, sid, r.target) - self._slack(r, d) <= 1)

    def _r_never_together(self, r):
        for d in self.days:
            for sid in self._shift_ids(r):
                for a in r.target:
                    for b in r.target2:
                        if a != b and (a, d, sid) in self.x and (b, d, sid) in self.x:
                            self.m.Add(self.x[a, d, sid] + self.x[b, d, sid] - self._slack(r, d, 1) <= 1)

    def _r_only_with_one_of(self, r):
        for d in self.days:
            for sid in self._shift_ids(r):
                for a in r.target:
                    if (a, d, sid) in self.x:
                        others = [b for b in r.target2 if b != a]
                        self.m.Add(self.x[a, d, sid] <= self._staff(d, sid, others) + self._slack(r, d, 1))

    def _r_always_together(self, r):
        self._r_only_with_one_of(r)
        self._r_only_with_one_of(Rule(r.id, r.kind, r.target2, r.target, r.params, r.hard, r.weight, r.label))

    def _forbid(self, r, cond):
        for e in self.emps:
            if e.id not in r.target:
                continue
            for d in self.days:
                for s in self.shifts:
                    if cond(d, s):
                        if r.hard:
                            self.m.Add(self.x[e.id, d, s.id] == 0)
                        else:
                            self.penalties.append((W_SOFT * r.weight, self.x[e.id, d, s.id]))

    def _r_only_shifts(self, r):
        allowed = self._shift_ids(r)
        self._forbid(r, lambda d, s: s.id not in allowed)

    def _r_never_shifts(self, r):
        banned = self._shift_ids(r)
        self._forbid(r, lambda d, s: s.id in banned)

    def _r_not_on_weekdays(self, r):
        wd = set(r.params.get("weekdays") or [])
        self._forbid(r, lambda d, s: d.weekday() in wd)

    def _r_only_on_weekdays(self, r):
        wd = set(r.params.get("weekdays") or [])
        self._forbid(r, lambda d, s: d.weekday() not in wd)

    def _r_unavailable(self, r):
        a = date.fromisoformat(r.params["date_from"])
        b = date.fromisoformat(r.params.get("date_to") or r.params["date_from"])
        self._forbid(r, lambda d, s: a <= d <= b)

    def _r_cycle(self, r):
        work, rest = int(r.params.get("work", 2)), int(r.params.get("rest", 2))
        start = date.fromisoformat(r.params["date_from"])
        allowed = self._shift_ids(r)
        for e in self.emps:
            if e.id not in r.target:
                continue
            for d in self.days:
                on = (d - start).days % (work + rest) < work
                ws = sum(self.x[e.id, d, sid] for sid in allowed)
                if on and d not in e.unavailable:
                    self.m.Add(ws + self._slack(r, d, 1) >= 1)
                elif not on:
                    self.m.Add(self.work(e, d) - self._slack(r, d, 1) <= 0)

    def _r_fixed_shift(self, r):
        allowed = self._shift_ids(r)
        for e in self.emps:
            if e.id not in r.target:
                continue
            for d in self._days(r):
                if d not in e.unavailable:
                    self.m.Add(sum(self.x[e.id, d, sid] for sid in allowed) + self._slack(r, d, 1) >= 1)

    def _r_max_consecutive_days(self, r):
        n = int(r.params.get("n", 5))
        for e in self.emps:
            if e.id in r.target:
                for i in range(len(self.days) - n):
                    win = self.days[i:i + n + 1]
                    self.m.Add(sum(self.work(e, d) for d in win) - self._slack(r, win[0], 1) <= n)

    def _nights(self, r):
        ids = r.params.get("shifts")
        return set(ids) if ids else {s.id for s in self.shifts if self._is_night(s)}

    def _r_max_consecutive_nights(self, r):
        n, rest = int(r.params.get("n", 2)), int(r.params.get("rest", 0))
        nights = self._nights(r)
        for e in self.emps:
            if e.id not in r.target:
                continue
            nt = {d: sum(self.x[e.id, d, sid] for sid in nights) for d in self.days}
            for i in range(len(self.days) - n):
                win = self.days[i:i + n + 1]
                self.m.Add(sum(nt[d] for d in win) - self._slack(r, win[0], 1) <= n)
            for i, d in enumerate(self.days[:-1]):
                for k in range(1, rest + 1):
                    if i + k < len(self.days):
                        nxt = self.days[i + 1]
                        self.m.Add(nt[d] - nt[nxt] + self.work(e, self.days[i + k]) - self._slack(r, d, 1) <= 1)

    def _r_no_day_after_night(self, r):
        nights = self._nights(r)
        days_ = {s.id for s in self.shifts} - nights
        for e in self.emps:
            if e.id in r.target:
                for d1, d2 in zip(self.days, self.days[1:]):
                    self.m.Add(sum(self.x[e.id, d1, a] for a in nights) + sum(self.x[e.id, d2, b] for b in days_)
                               - self._slack(r, d1, 1) <= 1)

    def _r_shifts_per_period(self, r):
        per = r.params.get("per", "week")
        groups = defaultdict(list)
        for d in self.days:
            groups[d.isocalendar()[:2] if per == "week" else (d.year, d.month)].append(d)
        for e in self.emps:
            if e.id not in r.target:
                continue
            for key, ds in groups.items():
                cnt = sum(self.work(e, d) for d in ds)
                if r.params.get("max") not in (None, ""):
                    self.m.Add(cnt - self._slack(r, ds[0]) <= int(r.params["max"]))
                if r.params.get("min") not in (None, "") and len(ds) == (7 if per == "week" else len(ds)):
                    self.m.Add(cnt + self._slack(r, ds[0]) >= int(r.params["min"]))

    def _r_free_weekends(self, r):
        n = int(r.params.get("n", 1))
        sats = [d for d in self.days if d.weekday() == 5 and d + timedelta(days=1) in self.days]
        for e in self.emps:
            if e.id not in r.target:
                continue
            frees = []
            for sat in sats:
                f = self.m.NewBoolVar("")
                self.m.Add(self.work(e, sat) + self.work(e, sat + timedelta(days=1)) == 0).OnlyEnforceIf(f)
                frees.append(f)
            self.m.Add(sum(frees) + self._slack(r, self.days[0]) >= min(n, len(sats)))

    def _r_min_days_off_block(self, r):
        n = int(r.params.get("n", 2))
        for e in self.emps:
            if e.id not in r.target:
                continue
            w = [self.work(e, d) for d in self.days]
            for L in range(1, n):
                for i in range(len(w) - L - 1):
                    self.m.Add(w[i] + sum(1 - w[i + k] for k in range(1, L + 1)) + w[i + L + 1]
                               - self._slack(r, self.days[i], 1) <= L + 1)

    def _r_balance_shifts(self, r):
        sids = self._shift_ids(r)
        counts = []
        for e in self.emps:
            if e.id in r.target:
                c = self.m.NewIntVar(0, len(self.days), "")
                self.m.Add(c == sum(self.x[e.id, d, sid] for d in self.days for sid in sids))
                counts.append(c)
        if len(counts) > 1:
            hi, lo = self.m.NewIntVar(0, len(self.days), ""), self.m.NewIntVar(0, len(self.days), "")
            self.m.AddMaxEquality(hi, counts)
            self.m.AddMinEquality(lo, counts)
            self.penalties.append((W_FAIR * r.weight, hi - lo))

    def _r_prefer_shifts(self, r):
        sids = self._shift_ids(r)
        for e in self.emps:
            if e.id in r.target:
                for d in self.days:
                    for s in self.shifts:
                        if s.id not in sids:
                            self.penalties.append((W_PREF * r.weight // 3 or 1, self.x[e.id, d, s.id]))

    # ---------- sprendimas ----------
    def solve(self, seconds=20, seed=0, exclude=(), hint=None, feasibility_only=False):
        """feasibility_only - tik „būtinų“ taisyklių įvykdymas (greitas pradinis sprendinys užuominai)."""
        m = self.m
        if hint:
            hs = set(hint)
            for k, v in self.x.items():
                m.AddHint(v, 1 if k in hs else 0)
        for prev in exclude:     # kitas variantas: bent 10 % pamainų kitokių
            k = max(1, len(prev) // 10)
            m.Add(sum(self.x[a] for a in prev if a in self.x) <= len(prev) - k)
        if feasibility_only:
            m.Minimize(sum(v for r, v, _ in self.slacks if r.hard))
        else:
            m.Minimize(sum(c * v for c, v in self.penalties))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = seconds
        solver.parameters.num_search_workers = 8
        solver.parameters.random_seed = seed
        st = solver.Solve(m)
        if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return Result("infeasible", [], [], {}, Decimal("0"), 0)
        assign = [k for k, v in self.x.items() if solver.Value(v)]
        unmet = defaultdict(set)
        for rule, var, d in self.slacks:
            if rule.hard and solver.Value(var) > 0:
                unmet[(rule.id, rule.label or rule.kind)].add(d)
        hours = {e.id: Decimal(solver.Value(self.total[e.id])) / H for e in self.emps}
        cost = sum((Decimal(c) for c, v in self.cost_terms if solver.Value(v)), Decimal("0"))
        return Result("optimal" if st == cp_model.OPTIMAL else "feasible", assign,
                      [{"rule_id": rid, "label": lbl, "dates": sorted(ds)} for (rid, lbl), ds in unmet.items()],
                      hours, cost, solver.ObjectiveValue())


def solve_variants(build, n=3, seconds=30):
    """
    build() -> naujas Problem (CP-SAT modelis po sprendimo nekeičiamas, todėl kuriamas iš naujo).
    1) greitai randamas sprendinys, tenkinantis „būtinas“ taisykles; 2) jis - užuomina pilnam optimizavimui;
    3) kiti variantai privalo skirtis bent 10 % pamainų.
    """
    warm = build().solve(seconds=max(5, seconds // 3), feasibility_only=True)
    out, seen = [], []
    for i in range(n):
        r = build().solve(seconds=seconds, seed=i, exclude=seen, hint=(seen[-1] if seen else warm.assignments))
        if r.status == "infeasible":
            break
        seen.append(r.assignments)
        # variantas, kuris neįvykdo daugiau „būtinų“ taisyklių nei pirmasis, nerodomas
        if out and _unmet_count(r) > _unmet_count(out[0]):
            continue
        out.append(r)
    return out


def _unmet_count(r):
    return sum(len(u["dates"]) for u in r.unmet)
