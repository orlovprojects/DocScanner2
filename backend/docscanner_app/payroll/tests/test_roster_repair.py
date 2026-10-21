"""Grafiko taisymas: bauda už pakeitimus - po nebuvimo keičiasi tik tai, kas būtina."""
from datetime import date, time, timedelta
from decimal import Decimal as D
from unittest import TestCase, skipUnless

try:
    import ortools  # noqa
    HAS_ORTOOLS = True
except ImportError:
    HAS_ORTOOLS = False

if HAS_ORTOOLS:
    from docscanner_app.payroll.roster.solver import Emp, Problem, ShiftDef

DAYS = [date(2026, 11, 2) + timedelta(days=i) for i in range(28)]
SHIFTS = None


def problem(unavailable=None, keep=None, w=(0, 0), target="132"):
    shifts = [ShiftDef(1, "D", time(7), time(19)), ShiftDef(2, "N", time(19), time(7))]
    emps = [Emp(i, f"E{i}", D(target), D("9"), unavailable=set((unavailable or {}).get(i, ()))) for i in range(1, 8)]
    slots = {(d, s): (1, 1) for d in DAYS for s in (1, 2)}
    return Problem(DAYS, shifts, emps, slots=slots, keep=keep, w_change=w[0], w_touch=w[1])


def diff(keep, res, unav):
    old = {(e, d): s for e, d, s in keep if d not in unav.get(e, ())}
    new = {(e, d): s for e, d, s in res.assignments}
    ch = [k for k in set(old) | set(new) if old.get(k) != new.get(k)]
    return ch, {e for e, _ in ch}


@skipUnless(HAS_ORTOOLS, "ortools neįdiegtas")
class RepairTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = problem().solve(seconds=15)
        assert cls.base.status != "infeasible"
        # E1 suserga 3 dienoms, kai turi pamainų
        mine = sorted(d for e, d, s in cls.base.assignments if e == 1)
        d0 = mine[2]
        cls.unav = {1: {d0, d0 + timedelta(days=1), d0 + timedelta(days=2)}}
        cls.lost = sum(1 for e, d, s in cls.base.assignments if e == 1 and d in cls.unav[1])

    def _repair(self, w):
        p = problem(self.unav, keep=set(self.base.assignments), w=w)
        r = p.solve(seconds=15, hint=list(self.base.assignments))
        self.assertNotEqual(r.status, "infeasible")
        return r

    def test_fill_changes_only_holes(self):
        r = self._repair((200_000, 100_000))
        self.assertEqual(r.unmet, [])                                      # visos spragos užpildytos
        ch, people = diff(self.base.assignments, r, self.unav)
        self.assertLessEqual(len(ch), self.lost * 2, ch)                   # tik spragos (+ galimas perstūmimas dėl poilsio)
        self.assertLessEqual(len(people), self.lost + 1, people)
        self.assertNotIn(1, {e for e, d, s in r.assignments if d in self.unav[1]})

    def test_without_stability_changes_a_lot(self):
        p = problem(self.unav)
        r = p.solve(seconds=10, seed=3)
        ch, _ = diff(self.base.assignments, r, self.unav)
        fill = self._repair((200_000, 100_000))
        ch_fill, _ = diff(self.base.assignments, fill, self.unav)
        self.assertGreater(len(ch), len(ch_fill))

    def test_balance_moves_hours_back_to_absent(self):
        r = self._repair((8_000, 8_000))
        self.assertEqual(r.unmet, [])
        # E1 prarado valandas - balansuojant jos bent iš dalies grąžinamos kitomis dienomis
        fill = self._repair((200_000, 100_000))
        self.assertGreaterEqual(r.hours[1], fill.hours[1])
