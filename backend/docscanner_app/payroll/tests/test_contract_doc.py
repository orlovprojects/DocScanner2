from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.contract_doc import ContractDocData, lt_date, missing_fields, render_contract_html


def data(**kw):
    base = dict(
        number="1", sign_date=date(2026, 9, 28), city="Vilnius",
        employer_name="UAB Pavyzdys", employer_code="300000000", employer_address="Gedimino pr. 1, Vilnius",
        employer_phone="", employer_email="", manager_name="Jonas Jonaitis", manager_position="direktorius",
        representation_basis="įmonės įstatai",
        employee_name="Ona Onaitė", personal_code="48501010000", birth_date=None,
        employee_address="Vilniaus g. 2, Vilnius", employee_phone="+37060000000", employee_email="",
        workplace="Gedimino pr. 1, Vilnius", position="Apskaitos specialistas", pay_form="monthly",
        base_amount=D("1500"), pay_terms="", contract_type="01", contract_subtype="", end_date=None,
        weekly_hours=D("40"), full_time=True, start_date=date(2026, 10, 1),
    )
    base.update(kw)
    return ContractDocData(**base)


class ContractDocTests(TestCase):

    def test_lt_date(self):
        self.assertEqual(lt_date(date(2026, 10, 1)), "2026 m. spalio 1 d.")

    def test_render(self):
        html = render_contract_html(data(probation_months=3))
        self.assertIn("Mėnesinė alga – 1 500,00 Eur", html)
        self.assertIn("Sudaroma neterminuota darbo sutartis", html)
        self.assertIn("40 val. per savaitę", html)
        self.assertIn("3 mėn. išbandymo terminas", html)
        self.assertIn("2026 m. spalio 1 d.", html)
        self.assertIn("atstovaujamas: Jonas Jonaitis, direktorius", html)

    def test_fixed_term_part_time(self):
        html = render_contract_html(data(contract_type="02", end_date=date(2027, 3, 31),
                                         weekly_hours=D("20"), full_time=False))
        self.assertIn("iki 2027 m. kovo 31 d.", html)
        self.assertIn("20 val. per savaitę (ne visas darbo laikas)", html)

    def test_missing(self):
        m = missing_fields(data(employee_address="", manager_name=""))
        self.assertEqual(len(m), 2)
