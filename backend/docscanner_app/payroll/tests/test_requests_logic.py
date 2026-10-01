from datetime import date, datetime
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.requests_logic import (
    PayslipData, RequestDocData, parent_day_quota, render_payslip_html, render_request_html,
)


class ParentDayQuotaTests(TestCase):

    def test_no_entitlement(self):
        self.assertTrue(parent_day_quota((0, 0), [], [date(2026, 10, 5)]))

    def test_monthly(self):
        self.assertEqual(parent_day_quota((1, 1), [], [date(2026, 10, 5)]), "")
        self.assertTrue(parent_day_quota((1, 1), [date(2026, 10, 2)], [date(2026, 10, 5)]))
        self.assertEqual(parent_day_quota((1, 1), [date(2026, 9, 2)], [date(2026, 10, 5)]), "")
        self.assertEqual(parent_day_quota((2, 1), [date(2026, 10, 2)], [date(2026, 10, 5)]), "")

    def test_quarter(self):
        self.assertTrue(parent_day_quota((1, 3), [date(2026, 10, 2)], [date(2026, 12, 5)]))
        self.assertEqual(parent_day_quota((1, 3), [date(2026, 9, 2)], [date(2026, 10, 5)]), "")


class RenderTests(TestCase):

    def test_vacation_request(self):
        html = render_request_html(RequestDocData(
            "vacation", "UAB Pavyzdys", "Direktoriui", "Ona Onaitė", "Apskaitos specialistas",
            date(2026, 11, 2), date(2026, 11, 6), D("5"), "", datetime(2026, 10, 1, 10, 30), "1.2.3.4"))
        self.assertIn("PRAŠYMAS DĖL KASMETINIŲ ATOSTOGŲ", html)
        self.assertIn("nuo 2026 m. lapkričio 2 d. iki 2026 m. lapkričio 6 d. (5 darbo d.)", html)
        self.assertIn("IP 1.2.3.4", html)

    def test_payslip(self):
        html = render_payslip_html(PayslipData(
            "UAB Pavyzdys", "Ona Onaitė", "Apskaitos specialistas", 2026, 10,
            earnings=[("Mėnesinė alga", "176 val.", D("1500"))], deductions=[("Pajamų mokestis", D("184.61"))],
            gross=D("1500"), net=D("1022.89"), payable=D("1022.89"), worked_days=22, worked_hours=D("176")))
        self.assertIn("2026 m. spalis", html)
        self.assertIn("1 022,89 Eur", html)
