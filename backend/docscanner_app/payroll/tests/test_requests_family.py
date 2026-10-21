from datetime import date
from unittest import TestCase

from docscanner_app.payroll.requests_logic import childcare_check, paternity_check


class PaternityTests(TestCase):

    def test_two_parts_and_limits(self):
        b = date(2026, 3, 10)
        e, w, info = paternity_check(b, date(2026, 3, 11), date(2026, 3, 24), [])      # 14 d.
        self.assertEqual(e, [])
        self.assertTrue(w)                                                              # liks 16 d.
        e, _, info = paternity_check(b, date(2026, 8, 1), date(2026, 8, 16), [(date(2026, 3, 11), date(2026, 3, 24))])
        self.assertEqual((e, info["remaining"]), ([], 16))
        e, _, _ = paternity_check(b, date(2026, 9, 1), date(2026, 9, 3),
                                  [(date(2026, 3, 11), date(2026, 3, 24)), (date(2026, 8, 1), date(2026, 8, 16))])
        self.assertTrue(any("2 dalis" in x for x in e))
        e, _, _ = paternity_check(b, date(2027, 3, 1), date(2027, 3, 15), [])          # po 1 m.
        self.assertTrue(any("vieneri metai" in x for x in e))
        e, _, _ = paternity_check(b, date(2026, 4, 1), date(2026, 5, 5), [])            # 35 d.
        self.assertTrue(any("liko 30" in x for x in e))


class ChildcareTests(TestCase):

    def test_until_three_and_notice(self):
        b = date(2025, 6, 15)
        e, w, info = childcare_check(b, date(2026, 11, 1), date(2028, 6, 15), date(2026, 10, 7))
        self.assertEqual((e, info["until"]), ([], "2028-06-15"))
        self.assertFalse(any("14 d." in x for x in w))
        e, w, _ = childcare_check(b, date(2026, 10, 10), date(2028, 6, 16), date(2026, 10, 7))
        self.assertTrue(any("treji metai" in x for x in e))
        self.assertTrue(any("14 d." in x for x in w))
