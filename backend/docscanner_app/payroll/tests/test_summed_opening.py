from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace as N
from unittest import TestCase

from docscanner_app.payroll.roster.period import PeriodMonth, settle
from docscanner_app.payroll.roster.services import _opening


class SummedOpeningTests(TestCase):

    def test_opening_parsed_only_for_its_period(self):
        c = N(summed_opening={"start": "2026-08-01", "until": "2026-10-01", "worked": "330", "absence": "24", "paid_ot": "6"})
        self.assertEqual(_opening(c, 2026, 8)["until"], (2026, 10))
        self.assertIsNone(_opening(c, 2026, 11))
        self.assertIsNone(_opening(N(summed_opening=None), 2026, 8))

    def test_settlement_with_opening_balance(self):
        # rugpjūtis-rugsėjis senoje programoje (norma 168+176, dirbta 330, nebuvimai 24, jau apmokėta 6 val. viršvalandžių),
        # spalis DokSkenas: norma 176, dirbta 190
        items = [PeriodMonth(2026, 8, D("168"), D("0")), PeriodMonth(2026, 9, D("176"), D("0")),
                 PeriodMonth(2026, 10, D("176"), D("190")), PeriodMonth(2026, 8, D("-24"), D("330") - D("6"))]
        st = settle(items, D("10"))
        self.assertEqual((st.norm, st.worked, st.excess), (D("496"), D("514"), D("18")))
