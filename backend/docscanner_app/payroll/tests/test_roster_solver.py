from datetime import date, time, timedelta
from decimal import Decimal as D
from unittest import TestCase, skipUnless

try:
    import ortools  # noqa
    HAS_ORTOOLS = True
except ImportError:
    HAS_ORTOOLS = False

if HAS_ORTOOLS:
    from docscanner_app.payroll.roster.law import check
    from docscanner_app.payroll.roster.solver import Emp, Pref, Problem, Rule, ShiftDef, solve_variants

DAYS = [date(2026, 11, 1) + timedelta(days=i) for i in range(30)]


def base(n_emp=8, rules=(), prefs=(), target="168", unavailable=None):
    shifts = [ShiftDef(1, "D", time(7), time(19)), ShiftDef(2, "N", time(19), time(7))]
    emps = [Emp(i, f"E{i}", D(target), D("9"), unavailable=set((unavailable or {}).get(i, ())))
            for i in range(1, n_emp + 1)]
    cover = Rule(100, "min_max_staff", params={"shifts": [1, 2], "min": 2, "max": 2}, label="2 žmonės pamainoje")
    return Problem(DAYS, shifts, emps, [cover, *rules], prefs), shifts


@skipUnless(HAS_ORTOOLS, "ortools neįdiegtas")
class SolverTests(TestCase):

    def test_basic_coverage_and_law(self):
        p, shifts = base()
        r = p.solve(seconds=20)
        self.assertNotEqual(r.status, "infeasible")
        self.assertEqual(r.unmet, [])
        for d in DAYS:
            for sid in (1, 2):
                self.assertEqual(sum(1 for (e, dd, s) in r.assignments if dd == d and s == sid), 2)
        inst = [next(s for s in shifts if s.id == sid).instance(e, d) for e, d, sid in r.assignments]
        self.assertEqual([v for v in check(inst) if v.code != "WEEKLY_REST_35H"], [])
        for h in r.hours.values():
            self.assertLessEqual(abs(h - D("168")), D("24"))

    def test_rules(self):
        rules = [
            Rule(1, "never_together", {1}, {2}, label="1 ne su 2"),
            Rule(2, "never_shifts", {3}, params={"shifts": [2]}, label="3 be naktų"),
            Rule(3, "at_least_of", {4, 5, 6}, params={"shifts": [2], "n": 1}, label="naktį bent 1 iš 4,5,6"),
        ]
        p, _ = base(rules=rules)
        r = p.solve(seconds=20)
        self.assertEqual(r.unmet, [])
        a = set(r.assignments)
        for d in DAYS:
            for s in (1, 2):
                self.assertFalse((1, d, s) in a and (2, d, s) in a)
            self.assertNotIn((3, d, 2), a)
            self.assertGreaterEqual(sum(1 for e in (4, 5, 6) if (e, d, 2) in a), 1)

    def test_unavailable_and_pref(self):
        p, _ = base(prefs=[Pref(1, DAYS[3], "day_off")], unavailable={2: DAYS[:7]})
        r = p.solve(seconds=20)
        a = set(r.assignments)
        self.assertFalse(any(e == 2 and d in DAYS[:7] for e, d, s in a))
        self.assertFalse(any(e == 1 and d == DAYS[3] for e, d, s in a))

    def test_impossible_rule_reported(self):
        rules = [Rule(5, "never_shifts", {1, 2, 3, 4, 5, 6, 7}, params={"shifts": [2]}, label="be naktų")]
        p, _ = base(rules=rules)
        r = p.solve(seconds=20)
        self.assertTrue(any(u["rule_id"] == 100 for u in r.unmet))   # nakčiai trūksta žmonių - pranešama

    def test_variants_differ(self):
        vs = solve_variants(lambda: base()[0], n=2, seconds=10)
        self.assertEqual(len(vs), 2)
        self.assertNotEqual(set(vs[0].assignments), set(vs[1].assignments))


@skipUnless(HAS_ORTOOLS, "ortools neįdiegtas")
class PlanTests(TestCase):

    def test_slots_only(self):
        shifts = [ShiftDef(1, "D", time(7), time(19)), ShiftDef(2, "N", time(19), time(7))]
        emps = [Emp(i, f"E{i}", D("60"), D("9")) for i in range(1, 5)]
        days = DAYS[:14]
        slots = {}
        for d in days:
            if d.weekday() == 0:
                slots[d, 1] = (2, 2)
            if d.weekday() == 2:
                slots[d, 2] = (1, 1)
            if d.weekday() == 3:
                slots[d, 1] = (1, 1); slots[d, 2] = (1, 1)
        r = Problem(days, shifts, emps, [], slots=slots).solve(seconds=10)
        self.assertEqual(r.unmet, [])
        for e, d, s in r.assignments:
            self.assertIn((d, s), slots)
        for (d, s), (mn, mx) in slots.items():
            self.assertEqual(sum(1 for a in r.assignments if a[1] == d and a[2] == s), mn)
