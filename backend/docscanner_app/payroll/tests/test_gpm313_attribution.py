from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.gpm313_attribution import EmployeeMonth, attribute, gpm_due_date, nth_work_day_after


class Gpm313AttributionTests(TestCase):

    def test_once_a_month_next_month(self):
        out, w = attribute(EmployeeMonth(2026, 8, "J", D("1500"), D("190"), date(2026, 9, 10)))
        self.assertEqual(out, [((2026, 9), D("1500"), D("190"), 10)])
        self.assertEqual(w, [])

    def test_advance_and_rest_same_month(self):
        out, _ = attribute(EmployeeMonth(2026, 8, "J", D("1500"), D("190"), date(2026, 8, 31),
                                         [(date(2026, 8, 20), D("600"))]))
        self.assertEqual(out, [((2026, 8), D("1500"), D("190"), 31)])

    def test_advance_then_rest_within_10_work_days(self):
        out, w = attribute(EmployeeMonth(2026, 8, "J", D("1500"), D("190"), date(2026, 9, 10),
                                         [(date(2026, 8, 20), D("600"))]))
        self.assertEqual(out, [((2026, 8), D("600"), D("0"), 20), ((2026, 9), D("900"), D("190"), 10)])
        self.assertEqual(w, [])

    def test_late_rest_warns(self):
        _, w = attribute(EmployeeMonth(2026, 8, "J", D("1500"), D("190"), date(2026, 9, 25),
                                       [(date(2026, 8, 20), D("600"))]))
        self.assertTrue(w)

    def test_tenth_work_day(self):
        # 2026-09-01 antradienis -> 10-ta darbo diena 09-14
        self.assertEqual(nth_work_day_after(date(2026, 8, 31), 10), date(2026, 9, 14))

    def test_gpm_due(self):
        self.assertEqual(gpm_due_date(date(2026, 9, 10)), date(2026, 9, 15))
        self.assertEqual(gpm_due_date(date(2026, 9, 20)), date(2026, 9, 30))
