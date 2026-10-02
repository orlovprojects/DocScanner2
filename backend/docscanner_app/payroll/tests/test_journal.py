from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.journal import build_journal, is_balanced, merge_journals, tax_lines
from docscanner_app.payroll.parameters import params_from_seed
from docscanner_app.payroll.run import Line
from docscanner_app.payroll.taxes import TaxInput, calculate

P = params_from_seed(date(2026, 10, 1))


def journal_for(du, extra=(), expense="6304", **kw):
    t = calculate(P, TaxInput(income_standard=D(du), sodra_base=D(du), **kw))
    lines = [Line("ALG", D(du)), *extra, *tax_lines(t)]
    return build_journal(lines, expense), t


def as_dict(j):
    return {x.account: (x.debit, x.credit) for x in j}


class JournalTests(TestCase):

    def test_standard_1500(self):
        j, t = journal_for("1500")
        self.assertTrue(is_balanced(j))
        self.assertEqual(as_dict(j), {
            "6304": (D("1526.55"), D("0")),
            "4480": (D("0"), D("1022.89")),
            "4481": (D("0"), D("184.61")),
            "4482": (D("0"), D("214.35")),
            "4486": (D("0"), D("104.70")),
        })

    def test_expense_account_override(self):
        j, _ = journal_for("1500", expense="6203")
        self.assertIn("6203", as_dict(j))
        self.assertNotIn("6304", as_dict(j))

    def test_sodra_total_matches_sam(self):
        j, t = journal_for("1500", pension_accumulation=True)
        d = as_dict(j)
        self.assertEqual(d["4482"][1] + d["4486"][1], t.sam_payment)

    def test_deduction_to_bailiff(self):
        j, _ = journal_for("1500", extra=[Line("ANT", D("100"))])
        d = as_dict(j)
        self.assertEqual(d["4494"], (D("0"), D("100")))
        self.assertEqual(d["4480"], (D("0"), D("922.89")))

    def test_merge(self):
        a, _ = journal_for("1500")
        b, _ = journal_for("2000")
        m = merge_journals([a, b])
        self.assertTrue(is_balanced(m))
        self.assertEqual(len(m), 5)


class EmployeeJournalTests(TestCase):

    def test_employee_accounts_kept_separate(self):
        from docscanner_app.payroll.journal import JournalLine, is_balanced, merge_journals_by_employee
        a = [JournalLine("6304", debit=D("100")), JournalLine("4480", credit=D("80")), JournalLine("4481", credit=D("20"))]
        b = [JournalLine("6304", debit=D("50")), JournalLine("4480", credit=D("40")), JournalLine("4481", credit=D("10"))]
        j = merge_journals_by_employee([(1, a), (2, b)])
        self.assertTrue(is_balanced(j))
        self.assertEqual(sorted((l.account, l.employee_id, l.credit) for l in j if l.account == "4480"),
                         [("4480", 1, D("80")), ("4480", 2, D("40"))])
        self.assertEqual([(l.account, l.credit) for l in j if l.account == "4481"], [("4481", D("30"))])
