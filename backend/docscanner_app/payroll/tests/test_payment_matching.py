from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.payment_matching import (
    Obligation, Txn, extract_codes, gpm_due_date, match_all, match_txn, split_proportionally,
)

VMI = "Valstybinė mokesčių inspekcija prie LR FM"
SODRA = "Valstybinio socialinio draudimo fondo valdyba"


def obl():
    return [
        Obligation(1, "gpm", D("312.40"), date(2026, 10, 31), reference="DU202609-G1"),
        Obligation(2, "sodra", D("421.15"), date(2026, 10, 15)),
        Obligation(3, "employee", D("1210.55"), date(2026, 10, 10), "Jonas Jonaitis", "LT12 7300 0101 2345 6789"),
        Obligation(4, "employee", D("980.00"), date(2026, 10, 10), "Ona Onaitė", "LT987044060000000001"),
        Obligation(5, "advance", D("500.00"), date(2026, 9, 20), "Jonas Jonaitis", "LT127300010123456789"),
    ]


def t(amount, name="", iban="", purpose="", ref="", code=""):
    return Txn(1, D(amount), date(2026, 10, 9), name, iban, code, purpose, ref)


class PaymentMatchingTests(TestCase):

    def test_codes(self):
        self.assertEqual(extract_codes("Įmokos kodas 1311, DU 2026-09"), {"1311"})
        self.assertEqual(extract_codes("252", "sask 12520"), {"252"})

    def test_gpm_code_and_amount_auto(self):
        r = match_txn(t("312.40", VMI, purpose="1311 GPM rugsėjis"), obl())
        self.assertEqual((r.status, r.matches[0].obligation_id, r.category), ("auto", 1, "tax_vmi"))

    def test_gpm_wrong_code_but_amount_proposed(self):
        r = match_txn(t("312.40", VMI, purpose="įmokos kodas 1001"), obl())
        self.assertEqual(r.status, "proposed")
        self.assertIn("1001", r.warnings[0])

    def test_gpm_no_code_amount_auto(self):
        self.assertEqual(match_txn(t("312.40", VMI), obl()).status, "auto")

    def test_gpm_code_partial_amount_proposed(self):
        r = match_txn(t("200.00", VMI, purpose="1311"), obl())
        self.assertEqual((r.status, r.matches[0].amount), ("proposed", D("200.00")))

    def test_pvm_payment_not_gpm(self):
        r = match_txn(t("1543.00", VMI, purpose="Įmokos kodas 1001 PVM"), obl())
        self.assertEqual((r.status, r.hint), ("none", {"codes": ["1001"]}))

    def test_sodra_two_months_sum(self):
        o = obl() + [Obligation(6, "sodra", D("400.00"), date(2026, 9, 15))]
        r = match_txn(t("821.15", SODRA, purpose="252"), o)
        self.assertEqual((r.status, sorted(m.obligation_id for m in r.matches)), ("auto", [2, 6]))

    def test_employee_iban_amount_auto(self):
        r = match_txn(t("1210.55", "JONAS JONAITIS", "LT127300010123456789"), obl())
        self.assertEqual((r.status, r.matches[0].obligation_id), ("auto", 3))

    def test_employee_advance_by_amount(self):
        r = match_txn(t("500.00", "Jonas Jonaitis", "LT127300010123456789", "Avansas"), obl())
        self.assertEqual(r.matches[0].obligation_id, 5)

    def test_employee_name_amount_proposed(self):
        r = match_txn(t("980.00", "Onaitė Ona"), obl())
        self.assertEqual((r.status, r.matches[0].obligation_id), ("proposed", 4))

    def test_unknown_none(self):
        self.assertEqual(match_txn(t("980.00", "UAB Kažkas"), obl()).status, "none")

    def test_reference(self):
        r = match_txn(t("312.40", "Bankas", purpose="DU202609-G1"), obl())
        self.assertEqual((r.status, r.matches[0].confidence), ("auto", D("1.00")))

    def test_two_payments_do_not_double_cover(self):
        o = [Obligation(1, "gpm", D("300.00"), date(2026, 10, 31))]
        a, b = Txn(1, D("300.00"), date(2026, 10, 1), VMI, purpose="1311"), Txn(2, D("300.00"), date(2026, 10, 2), VMI, purpose="1311")
        r = match_all([a, b], o)
        self.assertEqual([x.status for x in r], ["auto", "none"])

    def test_gpm_due_date(self):
        self.assertEqual(gpm_due_date(date(2026, 10, 10)), date(2026, 10, 15))
        self.assertEqual(gpm_due_date(date(2026, 10, 20)), date(2026, 10, 31))
        self.assertEqual(gpm_due_date(date(2026, 12, 20)), date(2026, 12, 31))

    def test_split(self):
        self.assertEqual(split_proportionally(D("100.00"), {"4482": "300", "4486": "100"}),
                         {"4482": D("75.00"), "4486": D("25.00")})


class AuthorityByIbanTests(TestCase):

    def test_sodra_by_iban_without_name(self):
        r = match_txn(Txn(1, D("421.15"), date(2026, 10, 9), "", "LT777300010129002656", "", "252", ""), obl())
        self.assertEqual((r.status, r.category), ("auto", "tax_sodra"))
