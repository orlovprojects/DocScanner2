from datetime import date, datetime
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.trips import LT, Leg, calc_trip, tax_split


class TripCalcTests(TestCase):

    def test_poland_three_days(self):
        c = calc_trip([Leg("Lenkijos Respublika", date(2026, 11, 3), date(2026, 11, 5))],
                      datetime(2026, 11, 3, 8), datetime(2026, 11, 5, 18))
        self.assertEqual((len(c.days), c.total), (3, D("144.00")))

    def test_short_last_day_20_pct(self):
        c = calc_trip([Leg("Vokietijos Federacinė Respublika", date(2026, 11, 3), date(2026, 11, 5))],
                      datetime(2026, 11, 3, 8), datetime(2026, 11, 5, 2, 30))
        self.assertEqual(c.days[-1].amount, D("12.40"))                 # 62 x 20 %
        self.assertEqual(c.total, D("136.40"))

    def test_one_day_lithuania_not_paid_from_oct_2026(self):
        c = calc_trip([Leg(LT, date(2026, 11, 3), date(2026, 11, 3))], datetime(2026, 11, 3, 7), datetime(2026, 11, 3, 20))
        self.assertEqual(c.total, D("0"))
        c = calc_trip([Leg(LT, date(2026, 9, 3), date(2026, 9, 3))], datetime(2026, 9, 3, 7), datetime(2026, 9, 3, 20))
        self.assertEqual(c.total, D("28.00"))

    def test_two_countries_and_pct(self):
        c = calc_trip([Leg("Latvijos Respublika", date(2026, 11, 3), date(2026, 11, 4)),
                       Leg("Estijos Respublika", date(2026, 11, 4), date(2026, 11, 6))],
                      datetime(2026, 11, 3, 6), datetime(2026, 11, 6, 22), D("50"))
        self.assertEqual([d.country for d in c.days][:2], ["Latvijos Respublika", "Estijos Respublika"])
        self.assertEqual(c.total, D("22.00") + 3 * D("23.50"))
        self.assertTrue(calc_trip([Leg(LT, date(2026, 11, 3), date(2026, 11, 4))],
                                  datetime(2026, 11, 3, 6), datetime(2026, 11, 4, 22), D("40")).errors)


class TaxSplitTests(TestCase):

    def test_rules(self):
        mma = D("1153")
        self.assertEqual(tax_split(D("420"), D("0"), D("1300"), mma), (D("420"), D("0")))
        self.assertEqual(tax_split(D("728"), D("0"), D("1200"), mma), (D("600.00"), D("128.00")))
        self.assertEqual(tax_split(D("0"), D("900"), D("2000"), mma), (D("900"), D("0")))      # >= MMA x 1,65
        self.assertEqual(tax_split(D("0"), D("900"), D("1500"), mma), (D("750.00"), D("150.00")))
