"""QA ataskaitos scenarijai (CAL-01, CAL-03) - suminė apskaita."""
from datetime import date, timedelta
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.averages import VduMonth
from docscanner_app.payroll.gross import TermsSegment
from docscanner_app.payroll.parameters import params_from_seed
from docscanner_app.payroll.run import EmployeeMonthInput, calculate_employee_month
from docscanner_app.payroll.timesheet import Event


def amounts(res):
    out = {}
    for l in res.lines:
        out[l.code] = out.get(l.code, D("0")) + l.amount
    return out


class SummedHolidayTests(TestCase):

    def test_holiday_shift_paid_double_not_triple(self):
        P = params_from_seed(date(2026, 11, 1))
        seg = TermsSegment(date(2026, 1, 1), date(2099, 12, 31), "hourly", D("10"), summed=True,
                           daily_hours={date(2026, 11, 1): D("8")})
        res = calculate_employee_month(P, EmployeeMonthInput(2026, 11, segments=[seg], npd_mode="none",
                                                             roster_extra={date(2026, 11, 1): {"holiday": D("8")}}))
        a = amounts(res)
        self.assertEqual(a.get("VAL"), D("80.00"))
        self.assertEqual(a.get("SVP"), D("80.00"))
        self.assertNotIn("SVN", a)
        self.assertEqual(res.gross, D("160.00"))


class SummedVacationTests(TestCase):

    def test_vacation_paid_by_hourly_vdu(self):
        P = params_from_seed(date(2026, 10, 1))
        vdu = [VduMonth(2026, m, D("2000"), 15, D("160"), 22) for m in (7, 8, 9)]
        shifts = {}
        for d in (2, 5, 6, 9, 12, 13, 16, 19, 21, 23, 26, 27, 30):
            shifts[date(2026, 10, d)] = D("12")
        seg = TermsSegment(date(2026, 1, 1), date(2099, 12, 31), "monthly", D("2000"), summed=True, daily_hours=shifts)
        res = calculate_employee_month(P, EmployeeMonthInput(
            2026, 10, segments=[seg], vdu_months=vdu,
            events=[Event("vacation", date(2026, 10, 19), date(2026, 10, 23))]))
        a = amounts(res)
        self.assertEqual(a.get("ATO"), D("500.00"))           # 40 val. x 12,50


class PerPaymentProgressiveTests(TestCase):

    def test_large_single_payment_without_request(self):
        from docscanner_app.payroll.taxes import calc_gpm_standard
        P = params_from_seed(date(2026, 10, 1))
        self.assertEqual(calc_gpm_standard(D("100000"), P), D("20838.13"))      # 36 VDU x 20 % + likutis x 25 %
        self.assertEqual(calc_gpm_standard(D("3000"), P), D("600.00"))


class VsdCapTests(TestCase):

    def test_cap_applies_to_employer_and_sam_consistent(self):
        P = params_from_seed(date(2026, 10, 1))
        seg = TermsSegment(date(2026, 1, 1), date(2099, 12, 31), "monthly", D("3000"))
        res = calculate_employee_month(P, EmployeeMonthInput(2026, 10, segments=[seg],
                                                             vsd_base_ytd=P.vsd_cap_amount - D("1000")))
        t = res.taxes
        self.assertTrue(t.cap_reached)
        self.assertEqual(t.vsd_base, D("1000"))
        self.assertEqual(t.employer_vsd, D("14.50"))                      # CAL-06: darbdaviui irgi lubos (1000 x 1,45 %)
        self.assertEqual(t.sam_payment, t.vsd + t.psd + t.kaupimas + t.employer_vsd + t.gar + t.ilg)


class SummedSickPayTests(TestCase):

    def test_first_two_days_paid_by_shift_hours(self):
        P = params_from_seed(date(2026, 10, 1))
        vdu = [VduMonth(2026, m, D("2000"), 15, D("160"), 22) for m in (7, 8, 9)]         # 12,50 €/val.
        shifts = {date(2026, 10, 5): D("11"), date(2026, 10, 6): D("11"), date(2026, 10, 9): D("11")}
        seg = TermsSegment(date(2026, 1, 1), date(2099, 12, 31), "monthly", D("2000"), summed=True, daily_hours=shifts)
        res = calculate_employee_month(P, EmployeeMonthInput(
            2026, 10, segments=[seg], vdu_months=vdu, sick_pay_pct=D("62.06"),
            events=[Event("sick", date(2026, 10, 5), date(2026, 10, 12))]))
        lig = [l for l in res.lines if l.code == "LIG"][0]
        self.assertEqual((lig.quantity, lig.amount), (D("22"), D("170.67")))      # 22 val. x 12,50 x 62,06 %
