from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.compliance import EmpFacts, check_facts

F, L = date(2026, 11, 1), date(2026, 11, 30)


def day(h, ot=0, night=0):
    return {"hours": D(str(h)), "extra": {"overtime": D(str(ot)), "night": D(str(night))}}


class ComplianceTests(TestCase):

    def codes(self, e):
        return {(i.level, i.code) for i in check_facts(e, F, L)}

    def test_clean(self):
        e = EmpFacts(1, "Jonas", {date(2026, 11, d): day(8) for d in range(2, 7)})
        self.assertEqual(self.codes(e), set())

    def test_day_and_data_error(self):
        e = EmpFacts(1, "Jonas", {date(2026, 11, 3): day(11, ot=3), date(2026, 11, 4): day(26)})
        self.assertEqual(self.codes(e), {("violation", "DAY_12"), ("error", "DAY_24")})

    def test_overtime_two_days_and_year(self):
        e = EmpFacts(1, "Jonas", {date(2026, 11, 3): day(8, ot=4), date(2026, 11, 4): day(8, ot=5)}, ot_before_year=D("175"))
        c = self.codes(e)
        self.assertIn(("violation", "OT_2D"), c)
        self.assertIn(("violation", "OT_YEAR"), c)

    def test_avg_48(self):
        e = EmpFacts(1, "Jonas", {date(2026, 11, d): day(12) for d in range(1, 31) if d % 7 not in (0,)})
        self.assertIn(("warning", "AVG_48"), self.codes(e))

    def test_minor(self):
        e = EmpFacts(1, "Ona", {date(2026, 11, 3): day(9, night=2)}, birth_date=date(2009, 5, 1))
        self.assertTrue({("violation", "MINOR_DAY"), ("violation", "MINOR_NIGHT")} <= self.codes(e))
