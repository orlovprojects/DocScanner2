"""
Etaloniniai DU skaičiavimai (2026-09 aptarti ir patikrinti).
"""
from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.parameters import params_from_seed
from docscanner_app.payroll.taxes import (
    NPD_NONE, TaxInput, calc_npd, calculate, sam_tax_rate,
)

P26 = params_from_seed(date(2026, 10, 1))
P27 = params_from_seed(date(2027, 1, 1))


def run(P, du, **kw):
    kw.setdefault("sodra_base", du)
    return calculate(P, TaxInput(income_standard=du, **kw))


class ParamsTests(TestCase):

    def test_2026_2027(self):
        self.assertEqual(P26.mma, D("1153"))
        self.assertEqual(P27.mma, D("1245"))
        self.assertEqual(P27.mva, D("7.61"))
        self.assertIn("VDU", P27.preliminary_keys)
        self.assertFalse(P26.has_preliminary)

    def test_npd_zero_point(self):
        self.assertEqual(calc_npd(D("2677.49"), P26), D("0"))
        self.assertEqual(calc_npd(D("2769.48"), P27), D("0.00"))


class Taxes2026Tests(TestCase):

    def assertMoney(self, r, **expected):
        for k, v in expected.items():
            self.assertEqual(getattr(r, k), D(v), k)

    def test_1_mma(self):
        r = run(P26, D("1153"))
        self.assertMoney(r, npd_total="747", gpm="81.20", net="846.96")
        self.assertEqual(r.employee_sodra, D("224.84"))

    def test_2_standard_1500(self):
        r = run(P26, D("1500"))
        self.assertMoney(r, npd_total="576.97", gpm="184.61", vsd="187.80", psd="104.70", net="1022.89")
        self.assertEqual(r.employer_total, D("26.55"))
        self.assertEqual(r.sam_tax_rate, D("21.27"))
        self.assertEqual(r.sam_payment, D("319.05"))

    def test_3_sick_proportional_npd(self):
        r = calculate(P26, TaxInput(income_standard=D("1295.45"), income_sick=D("85.93"),
                                    sodra_base=D("1295.45")))
        self.assertMoney(r, npd_total="635.09", npd_standard="595.58", npd_sick="39.51",
                         gpm="139.97", gpm_sick="6.96", vsd="162.19", psd="90.42", net="981.84")
        # SAM: 1295,45 x 21,27 % = 275,54 -> darbdavio VSD +0,01
        self.assertEqual(r.sam_payment, D("275.54"))
        self.assertEqual(r.employer_total, D("22.93"))

    def test_4_pension_accumulation(self):
        r = run(P26, D("1500"), pension_accumulation=True)
        self.assertMoney(r, kaupimas="45.00", net="977.89", sam_tax_rate="24.27")

    def test_5_no_npd(self):
        r = run(P26, D("1500"), npd_mode=NPD_NONE)
        self.assertMoney(r, gpm="300.00", net="907.50")

    def test_6_high_salary_no_npd(self):
        r = run(P26, D("3000"))
        self.assertMoney(r, npd_total="0", gpm="600.00", net="1815.00")

    def test_9_partial_month(self):
        r = run(P26, D("818.18"))
        self.assertMoney(r, npd_total="747", gpm="14.24", net="644.39")

    def test_12_fixed_term(self):
        r = run(P26, D("1500"), fixed_term=True)
        self.assertEqual(r.employer_total, D("37.35"))
        self.assertEqual(r.sam_tax_rate, D("21.99"))

    def test_13_bonus_in_npd_base(self):
        r = run(P26, D("2500"))
        self.assertMoney(r, npd_total="86.97", gpm="482.61", net="1529.89")

    def test_14_vsd_cap(self):
        r = run(P26, D("12000"), vsd_base_ytd=D("132000"))
        self.assertTrue(r.cap_reached)
        self.assertMoney(r, vsd_base="6729", vsd="842.47", psd="837.60", net="7919.93")
        # darbdavio VSD tik nuo 6729, GAR/ILG nuo visos sumos
        self.assertMoney(r, employer_vsd="97.57", gar="19.20", ilg="19.20")

    def test_grindys_part_time(self):
        r = run(P26, D("700"), grindys_applies=True)
        self.assertMoney(r, gpm="0", net="563.50", grindys_diff="453")
        self.assertEqual(r.grindys_vsd + r.grindys_psd, D("95.63"))
        self.assertEqual(r.sam_payment, D("148.89"))

    def test_severance_not_in_npd_base(self):
        r = calculate(P26, TaxInput(income_standard=D("1500"), income_standard_no_npd=D("3000"),
                                    sodra_base=D("4500")))
        self.assertEqual(r.npd_total, D("576.97"))
        self.assertEqual(r.gpm, D("784.61"))

    def test_in_kind_not_paid_out(self):
        r = run(P26, D("1600"), in_kind=D("100"))
        self.assertEqual(r.net, r.gross - D("100") - r.gpm_total - r.employee_sodra)


class Taxes2027Tests(TestCase):

    def test_1500(self):
        r = run(P27, D("1500"))
        self.assertEqual((r.npd_total, r.gpm, r.net), (D("622.05"), D("175.59"), D("1031.91")))

    def test_mma(self):
        r = run(P27, D("1245"))
        self.assertEqual(r.net, D("902.62"))  # SADM: ~902 EUR į rankas
