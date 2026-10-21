from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.actual_time import actual_breakdown


class ActualTimeTests(TestCase):

    def test_as_planned(self):
        r = actual_breakdown(date(2026, 11, 10), "07:00", "19:00", 60, None, ("07:00", "19:00", 60, None))
        self.assertEqual((r["hours"], r["overtime"], r["night"]), (D("11.00"), 0, D("0.00")))

    def test_stayed_longer_into_night(self):
        # pagal grafiką 07-19, dirbo 07-23 -> 4 val. viršvalandžių, iš jų 1 naktį (22-23)
        r = actual_breakdown(date(2026, 11, 10), "07:00", "23:00", 60, None, ("07:00", "19:00", 60, None))
        self.assertEqual((r["hours"], r["overtime"], r["ot_night"], r["night"]), (D("15.00"), D("3.00"), D("1.00"), D("0.00")))

    def test_night_shift(self):
        r = actual_breakdown(date(2026, 11, 10), "19:00", "02:00", 0, None, ("19:00", "02:00", 0, None))
        self.assertEqual((r["hours"], r["night"]), (D("7.00"), D("4.00")))

    def test_rest_day_and_holiday(self):
        r = actual_breakdown(date(2026, 11, 14), "08:00", "14:00", 0, None, None, rest_day=True)
        self.assertEqual((r["hours"], r["rest_day"]), (D("6.00"), D("6.00")))
        r = actual_breakdown(date(2026, 12, 24), "08:00", "14:00", 0, None, None, rest_day=True)
        self.assertEqual((r["holiday"], r["rest_day"]), (D("6.00"), 0))
