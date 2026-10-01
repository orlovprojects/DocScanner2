from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.das import DasContext, DasGroup, render_das_html


class DasTests(TestCase):

    def test_render(self):
        html = render_das_html(DasContext(
            "UAB Pavyzdys", "300000000", "Jonas Jonaitis", date(2026, 12, 1),
            [DasGroup("FIN-02", "Finansų specialistai", ["Buhalteris", "Analitikas"],
                      {"skills": 3, "qualification": 3, "effort": 2, "responsibility": 3, "conditions": 1},
                      D("1900"), D("2700"))],
        ))
        self.assertIn("DARBO APMOKĖJIMO SISTEMA", html)
        self.assertIn("FIN-02", html)
        self.assertIn("1 900,00 Eur", html)
        self.assertIn("<td class='c'>12</td>", html)

    def test_escape(self):
        html = render_das_html(DasContext("UAB <X>", "1", "", date(2026, 12, 1), []))
        self.assertIn("UAB &lt;X&gt;", html)
