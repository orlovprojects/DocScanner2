from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.averages import VduMonth
from docscanner_app.payroll.gross import TermsSegment
from docscanner_app.payroll.parameters import params_from_seed
from docscanner_app.payroll.run import EmployeeMonthInput, Line, calculate_employee_month
from docscanner_app.payroll.sdup import SdupRow, build_sdup, fmt, gender_from_code
from docscanner_app.payroll.seed_data import SYSTEM_PAY_CODES
from docscanner_app.payroll.timesheet import Event

P = params_from_seed(date(2026, 10, 1))
CODES = {c["code"]: c for c in SYSTEM_PAY_CODES}
VDU3 = [VduMonth(2026, m, D("1500"), 22, D("176"), 22) for m in (7, 8, 9)]


def run(**kw):
    kw.setdefault("segments", [TermsSegment(date(2026, 1, 1), date(2099, 12, 31), "monthly", D("1500"))])
    kw.setdefault("vdu_months", VDU3)
    return calculate_employee_month(P, EmployeeMonthInput(2026, 10, **kw))


def sdup_sums(res):
    total = sum((l.sodra_part or 0 for l in res.lines if CODES[l.code]["sdup_total"]), D("0"))
    extra = sum((l.sodra_part or 0 for l in res.lines if CODES[l.code]["sdup_extra"]), D("0"))
    return total, extra


class SdupHoursTests(TestCase):

    def test_full_month(self):
        self.assertEqual(run().sdup_hours, D("176"))

    def test_sick_not_counted(self):
        r = run(events=[Event("sick", date(2026, 10, 12), date(2026, 10, 14))])
        self.assertEqual(r.sdup_hours, D("152"))

    def test_vacation_counted(self):
        r = run(events=[Event("vacation", date(2026, 10, 19), date(2026, 10, 23))])
        self.assertEqual(r.sdup_hours, D("176"))

    def test_overtime_real_hours_night_not_added(self):
        r = run(overrides={date(2026, 10, 5): {"extra": {"overtime": 2, "night": 8}}})
        self.assertEqual(r.sdup_hours, D("178"))


class SdupAmountsTests(TestCase):

    def test_sick_excluded_bonus_extra(self):
        r = run(events=[Event("sick", date(2026, 10, 12), date(2026, 10, 14))],
                extra_lines=[Line("PRM", D("200"))])
        total, extra = sdup_sums(r)
        self.assertEqual((total, extra), (D("1495.45"), D("200")))  # 1295,45 + 200, liga neįeina

    def test_gift_only_taxable_part(self):
        total, extra = sdup_sums(run(extra_lines=[Line("DOV", D("250"))]))
        self.assertEqual((total, extra), (D("1550"), D("50")))

    def test_night_premium_half(self):
        r = run(overrides={date(2026, 10, 5): {"extra": {"night": 8}}})
        self.assertEqual({l.code: l.amount for l in r.lines}["NAK"], D("34.09"))


class SdupJsonTests(TestCase):

    def test_format_and_gender(self):
        self.assertEqual(fmt(D("1500")), "1500,00")
        self.assertEqual(gender_from_code("38501010000"), "M")
        self.assertEqual(gender_from_code("48501010000"), "F")

    def test_build_ok(self):
        data, errors = build_sdup("166337", 2027, 1, [SdupRow(
            "Ona", "Onaitė-Jonaitienė", person_code="48501010000", group_code="FIN-02",
            brutto=D("1500"), extra=D("200"), paid_hours=D("168"))])
        self.assertEqual(errors, [])
        e = data["entries"][0]
        self.assertEqual(data["yearMonth"], "2027-01")
        self.assertEqual(e["employeeInfo"]["gender"], "F")
        self.assertNotIn("personSSN", e["employeeInfo"])
        self.assertEqual(e["salaryInfo"][0]["workTimeRate"], "40,00")
        self.assertEqual(e["salaryInfo"][0]["paidWorkHours"], "168,00")

    def test_errors(self):
        _, errors = build_sdup("", 2027, 1, [SdupRow("Jon4s", "X", group_code="", extra=D("5"))])
        self.assertTrue(any("draudėjo kodas" in e for e in errors))
        self.assertTrue(any("pareigybių grupė" in e for e in errors))
        self.assertTrue(any("asmens kodo" in e for e in errors))
        self.assertTrue(any("papildomas DU" in e for e in errors))


class SdupSplitTests(TestCase):

    def test_split_two_groups(self):
        from docscanner_app.payroll.sdup import split_by_groups
        sal = split_by_groups([("G001", D("750"), D("88")), ("G002", D("900"), D("88"))], "G002",
                              total_brutto=D("1850"), total_extra=D("200"), total_hours=D("176"))
        by = {s.group_code: s for s in sal}
        self.assertEqual((by["G001"].brutto, by["G001"].extra, by["G001"].paid_hours), (D("750"), D("0"), D("88")))
        self.assertEqual((by["G002"].brutto, by["G002"].extra, by["G002"].paid_hours), (D("1100"), D("200"), D("88")))

    def test_single_group_no_split(self):
        from docscanner_app.payroll.sdup import split_by_groups
        self.assertIsNone(split_by_groups([("G001", D("1500"), D("176"))], "G001", D("1500"), D("0"), D("176")))

    def test_json_two_rows(self):
        from docscanner_app.payroll.sdup import SdupSalary
        data, errors = build_sdup("166337", 2027, 1, [SdupRow(
            "Ona", "Onaitė", person_code="48501010000",
            salaries=[SdupSalary("G001", brutto=D("750"), paid_hours=D("88")),
                      SdupSalary("G002", brutto=D("1100"), extra=D("200"), paid_hours=D("88"))])])
        self.assertEqual(errors, [])
        self.assertEqual([s["profGroupNum"] for s in data["entries"][0]["salaryInfo"]], ["G001", "G002"])
