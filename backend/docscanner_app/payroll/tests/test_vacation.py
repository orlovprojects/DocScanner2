from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.vacation import VacationEvent as E, accrued_days, vacation_balance


class VacationTests(TestCase):

    def test_full_work_year(self):
        acc, _ = accrued_days(date(2026, 1, 1), date(2026, 12, 31), 20)
        self.assertEqual(acc, D("20.00"))

    def test_half_year(self):
        acc, _ = accrued_days(date(2026, 1, 1), date(2026, 6, 30), 20)
        self.assertTrue(D("9.5") < acc < D("10.5"), acc)

    def test_used_and_adjustment(self):
        b = vacation_balance(date(2026, 1, 1), date(2026, 12, 31), 20,
                             events=[E("vacation", date(2026, 7, 13), date(2026, 7, 24))],
                             adjustments=D("3"))
        self.assertEqual(b.used, D("10"))
        self.assertEqual(b.balance, D("13.00"))

    def test_truancy_not_counted(self):
        full, _ = accrued_days(date(2026, 1, 1), date(2026, 12, 31), 20)
        acc, excl = accrued_days(date(2026, 1, 1), date(2026, 12, 31), 20,
                                 [E("truancy", date(2026, 3, 2), date(2026, 3, 6))])
        self.assertEqual(excl, 5)
        self.assertLess(acc, full)

    def test_unpaid_first_10_days_counted(self):
        # 2026-03-02..23 = 15 d.d. (11 d. šventė): 10 įskaitoma, 5 - ne
        _, excl = accrued_days(date(2026, 1, 1), date(2026, 12, 31), 20,
                               [E("unpaid", date(2026, 3, 2), date(2026, 3, 23))])
        self.assertEqual(excl, 5)

    def test_sick_and_parent_days_counted(self):
        _, excl = accrued_days(date(2026, 1, 1), date(2026, 12, 31), 20,
                               [E("sick", date(2026, 3, 2), date(2026, 3, 20)),
                                E("parent_day", date(2026, 4, 3), date(2026, 4, 3))])
        self.assertEqual(excl, 0)

    def test_work_year_from_contract_start(self):
        # priimtas 2025-03-10: iki 2026-03-09 - pilni darbo metai
        acc, _ = accrued_days(date(2025, 3, 10), date(2026, 3, 9), 20)
        self.assertEqual(acc, D("20.00"))

    def test_holiday_inside_vacation_not_used(self):
        # 2026-12-21..31: 9 darbo dienos, iš jų 24 ir 25 - šventės -> 7
        b = vacation_balance(date(2026, 1, 1), date(2026, 12, 31), 20,
                             events=[E("vacation", date(2026, 12, 21), date(2026, 12, 31))])
        self.assertEqual(b.used, D("7"))
