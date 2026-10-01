from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.gross import TermsSegment, calc_base_pay, monthly_hourly_rate, multiplier_pay
from docscanner_app.payroll.parameters import params_from_seed

OCT_FROM, OCT_TO = date(2026, 10, 1), date(2026, 10, 31)
P26 = params_from_seed(date(2026, 10, 1))


def seg(amount, pay_form="monthly", valid_from=OCT_FROM, valid_to=OCT_TO, workload=D("1")):
    return TermsSegment(valid_from, valid_to, pay_form, D(amount), workload)


class GrossTests(TestCase):

    def test_full_month(self):
        r = calc_base_pay(2026, 10, [seg("1500")])
        self.assertEqual((r.amount, r.worked_days, r.worked_hours), (D("1500.00"), 22, D("176")))

    def test_full_month_december_short_days(self):
        r = calc_base_pay(2026, 12, [seg("1500", valid_from=date(2026, 12, 1), valid_to=date(2026, 12, 31))])
        self.assertEqual(r.amount, D("1500.00"))

    def test_sick_3_days(self):
        absent = {date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14)}
        r = calc_base_pay(2026, 10, [seg("1500")], absent)
        self.assertEqual(r.amount, D("1295.45"))

    def test_hired_mid_month(self):
        r = calc_base_pay(2026, 10, [seg("1500")], employed_from=date(2026, 10, 15))
        self.assertEqual((r.amount, r.worked_days), (D("818.18"), 12))

    def test_salary_change_mid_month(self):
        r = calc_base_pay(2026, 10, [
            seg("1500", valid_to=date(2026, 10, 15)),
            seg("1800", valid_from=date(2026, 10, 16)),
        ])
        self.assertEqual([l.amount for l in r.lines], [D("750.00"), D("900.00")])
        self.assertEqual(r.amount, D("1650.00"))

    def test_hourly(self):
        r = calc_base_pay(2026, 10, [seg("9", pay_form="hourly")])
        self.assertEqual(r.amount, D("1584.00"))

    def test_part_time(self):
        r = calc_base_pay(2026, 10, [seg("800", workload=D("0.5"))], P=P26)
        self.assertEqual(r.amount, D("800.00"))
        self.assertEqual(r.warnings, [])

    def test_min_wage_warnings(self):
        r = calc_base_pay(2026, 10, [seg("1000")], P=P26)
        self.assertTrue(any("MMA" in w for w in r.warnings))
        r = calc_base_pay(2026, 10, [seg("6.50", pay_form="hourly")], P=P26)
        self.assertTrue(any("MVA" in w for w in r.warnings))

    def test_overtime(self):
        rate = monthly_hourly_rate(D("1500"), 2026, 10)
        self.assertEqual(multiplier_pay(rate, D("10"), D("1.5")), D("127.84"))
