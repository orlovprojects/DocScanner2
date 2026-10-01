from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.averages import VduMonth
from docscanner_app.payroll.gross import TermsSegment
from docscanner_app.payroll.parameters import params_from_seed
from docscanner_app.payroll.run import EmployeeMonthInput, Line, calculate_employee_month, max_deduction
from docscanner_app.payroll.timesheet import Event, employer_sick_days, generate

P = params_from_seed(date(2026, 10, 1))
VDU3 = [VduMonth(2026, 7, D("1500"), 22, D("176"), 22),
        VduMonth(2026, 8, D("1500"), 21, D("168"), 21),
        VduMonth(2026, 9, D("1500"), 22, D("176"), 22)]


def inp(**kw):
    kw.setdefault("segments", [TermsSegment(date(2026, 1, 1), date(2099, 12, 31), "monthly", D("1500"))])
    kw.setdefault("vdu_months", VDU3)
    return EmployeeMonthInput(2026, 10, **kw)


def amounts(res):
    return {l.code: l.amount for l in res.lines}


class TimesheetTests(TestCase):

    def test_generate_october(self):
        ts = generate(2026, 10)
        self.assertEqual((ts.worked_days, ts.worked_hours), (22, D("176")))

    def test_sick_friday_start(self):
        # 2026-10-09 penktadienis: penkt. apmokamas, šešt. - ne darbo diena
        self.assertEqual(employer_sick_days(Event("sick", date(2026, 10, 9), date(2026, 10, 14))), 1)
        self.assertEqual(employer_sick_days(Event("sick", date(2026, 10, 12), date(2026, 10, 14))), 2)
        self.assertEqual(employer_sick_days(Event("sick", date(2026, 10, 12), date(2026, 10, 20), True)), 0)


class RunTests(TestCase):

    def test_standard(self):
        r = calculate_employee_month(P, inp())
        self.assertEqual(r.taxes.net, D("1022.89"))
        self.assertEqual(r.payable, D("1022.89"))

    def test_sick_3_days(self):
        r = calculate_employee_month(P, inp(events=[Event("sick", date(2026, 10, 12), date(2026, 10, 14))]))
        self.assertEqual(amounts(r), {"ALG": D("1295.45"), "LIG": D("85.93")})
        self.assertEqual(r.taxes.net, D("981.84"))

    def test_vacation_5_days(self):
        r = calculate_employee_month(P, inp(events=[Event("vacation", date(2026, 10, 19), date(2026, 10, 23))]))
        self.assertEqual(amounts(r), {"ALG": D("1159.09"), "ATO": D("346.15")})
        # Sodra nuo bendro 19,5 % (1505,24 -> 293,52), todėl 1025,55 (ne 1025,54 kaip seną lentelėje)
        self.assertEqual(r.taxes.net, D("1025.55"))

    def test_overtime(self):
        r = calculate_employee_month(P, inp(overrides={date(2026, 10, 5): {"extra": {"overtime": 10}}}))
        self.assertEqual(amounts(r)["VRS"], D("127.84"))
        self.assertEqual(r.taxes.net, D("1087.71"))

    def test_parent_day(self):
        r = calculate_employee_month(P, inp(events=[Event("parent_day", date(2026, 10, 16), date(2026, 10, 16))]))
        self.assertEqual(amounts(r), {"ALG": D("1431.82"), "MAM": D("69.23")})

    def test_unpaid_leave(self):
        r = calculate_employee_month(P, inp(events=[Event("unpaid", date(2026, 10, 26), date(2026, 10, 30))]))
        self.assertEqual(amounts(r), {"ALG": D("1159.09")})

    def test_gift_over_limit(self):
        r = calculate_employee_month(P, inp(extra_lines=[Line("DOV", D("250"))]))
        # 200 neapmokestinama, 50 - kaip DU, bet neišmokama pinigais
        self.assertEqual(r.taxes.gross, D("1750"))
        self.assertEqual(r.limits_used["DOV"], D("250"))
        # į rankas: 1500 - mokesčiai nuo 1550 (natūra neišmokama)
        self.assertEqual(r.taxes.net, D("1500") - r.taxes.gpm_total - r.taxes.employee_sodra)

    def test_dienpinigiai_low_salary(self):
        r = calculate_employee_month(P, inp(extra_lines=[Line("DPN", D("900"))]))
        # DU 1500 < 1,65 MMA -> neapmokestinama iki 750, 150 apmokestinama
        self.assertEqual(r.taxes.gross, D("2400"))
        base = calculate_employee_month(P, inp())
        self.assertGreater(r.taxes.gpm, base.taxes.gpm)

    def test_advance_and_deduction(self):
        r = calculate_employee_month(P, inp(advance_paid=D("500"), deductions=[Line("ANT", D("100"))]))
        self.assertEqual(r.payable, D("422.89"))

    def test_hired_mid_month_uses_fallback_vdu(self):
        r = calculate_employee_month(P, inp(vdu_months=[], employed_from=date(2026, 10, 15)))
        self.assertEqual(amounts(r)["ALG"], D("818.18"))
        self.assertTrue(any("sutartinę algą" in w for w in r.warnings))


class DeductionLimitTests(TestCase):

    def test_ordinary(self):
        # 1000 < MMA -> 10 %
        self.assertEqual(max_deduction(D("1000"), P), D("100.00"))
        # 2000: 1153x10 % + 847x30 %
        self.assertEqual(max_deduction(D("2000"), P), D("369.40"))

    def test_maintenance(self):
        self.assertEqual(max_deduction(D("1000"), P, "maintenance"), D("300.00"))


class VacationSettlementTests(TestCase):

    def test_compensation_on_dismissal(self):
        r = calculate_employee_month(P, inp(vacation_settlement_days=D("8")))
        self.assertEqual(amounts(r)["KMP"], D("553.85"))

    def test_overused_deduction(self):
        base = calculate_employee_month(P, inp())
        r = calculate_employee_month(P, inp(vacation_settlement_days=D("-2")))
        self.assertEqual(amounts(r)["ATG"], D("138.46"))
        self.assertEqual(r.payable, base.payable - D("138.46"))
