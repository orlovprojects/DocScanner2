from decimal import Decimal as D
from types import SimpleNamespace as N
from unittest import TestCase

from docscanner_app.payroll.run import Line, garnishment_lines, max_deduction

P = N(mma=D("1153"))


def go(orders, net="1174.99", gross="1800", lines=None):
    inp = N(garnishments=orders)
    w = []
    out = garnishment_lines(inp, P, lines or [Line("ALG", D(gross))], N(net=D(net), gross=D(gross)), w)
    return out, w


class GarnishmentTests(TestCase):

    def test_example_ordinary_debt(self):
        # bruto 1 800, į rankas 1 174,99 -> 1 153 x 10 % + 21,99 x 30 % = 121,90
        self.assertEqual(max_deduction(D("1174.99"), P), D("121.90"))
        out, _ = go([{"id": 1, "kind": "ordinary", "method": "max", "remaining": None, "doc": "A-1"}])
        self.assertEqual([(l.code, l.amount) for l in out], [("ANT", D("121.90"))])

    def test_remaining_debt_and_fixed(self):
        out, _ = go([{"id": 1, "kind": "ordinary", "method": "max", "remaining": D("50"), "doc": ""}])
        self.assertEqual(out[0].amount, D("50"))
        out, _ = go([{"id": 1, "kind": "ordinary", "method": "fixed", "amount": D("300"), "remaining": None, "doc": ""}])
        self.assertEqual(out[0].amount, D("121.90"))            # fiksuota suma viršija ribą -> apkarpoma

    def test_maintenance_first_limits_not_summed(self):
        orders = [{"id": 1, "kind": "maintenance", "method": "fixed", "amount": D("300"), "remaining": None, "doc": ""},
                  {"id": 2, "kind": "ordinary", "method": "max", "remaining": None, "doc": ""}]
        out, _ = go(orders)
        cap = max_deduction(D("1174.99"), P, "maintenance")    # 1 153 x 30 % + 21,99 x 50 % = 356,90
        self.assertEqual(cap, D("356.90"))
        self.assertEqual([l.amount for l in out], [D("300.00"), D("56.90")])   # bendra riba 356,90, ne 356,90 + 121,90

    def test_voluntary_not_with_other_orders(self):
        out, w = go([{"id": 1, "kind": "ordinary", "method": "max", "remaining": None, "doc": ""},
                     {"id": 2, "kind": "voluntary", "method": "fixed", "amount": D("100"), "remaining": None, "doc": ""}])
        self.assertEqual(len(out), 1)
        self.assertTrue(any("742" in x for x in w))

    def test_severance_excluded_for_ordinary(self):
        lines = [Line("ALG", D("1000")), Line("ISE", D("1000"))]
        out, _ = go([{"id": 1, "kind": "ordinary", "method": "max", "remaining": None, "doc": ""}],
                    net="1400", gross="2000", lines=lines)
        self.assertEqual(out[0].amount, D("70.00"))             # bazė 700 (tik ALG dalis) x 10 %
