from datetime import date
from decimal import Decimal as D
from unittest import TestCase
import xml.etree.ElementTree as ET

from docscanner_app.payroll.declarations.sodra_forms import (
    DismissalRow, HireRow, Insurer, Person, SamRow, build_1sd, build_2sd, build_sam,
)

INS = Insurer("UAB PAVYZDYS", "1234567", "300000000", manager="Jonas Jonaitis")


def pages(xml):
    root = ET.fromstring(xml)
    return [(p.get("PageDefName"), {f.get("Name"): (f.text or "") for f in p.find("Fields")})
            for p in root.find("Form/Pages")]


def person(i=1):
    return Person(f"Ona{chr(64 + i)}", "Onaitė", person_code="48501010000")


class SamTests(TestCase):

    def test_two_pages_and_totals(self):
        rows = [SamRow(person(i), D("1500"), D("21.27"), D("319.05")) for i in range(1, 8)]
        xml, errors = build_sam(INS, 2026, 10, rows)
        self.assertEqual(errors, [])
        p = pages(xml)
        self.assertEqual([x[0] for x in p], ["SAM", "SAM3SD", "SAM3SD"])
        head = p[0][1]
        self.assertEqual((head["CycleYear"], head["CycleMonth"], head["Apdx2PersonCount"]), ("2026", "10", "7"))
        self.assertEqual(head["Apdx2InsIncomeSum"], "10500,00")
        self.assertEqual(p[1][1]["TaxRate_1"], "21,27")
        self.assertEqual(p[2][1]["RowNumber_1"], "7")
        self.assertEqual(p[2][1]["PersonCode_2"], "")      # tuščia eilutė
        self.assertEqual(p[1][1]["PaymentPage"], "1914,30")
        self.assertEqual((head["Appendixes2"], head["Appendixes3"], head["RevisedDocument"]), ("1", "0", "0"))
        self.assertEqual(head["DocNumber"], "SAM202610")

    def test_missing_insurer_code(self):
        _, errors = build_sam(Insurer("UAB X", "", "300000000"), 2026, 10, [])
        self.assertTrue(errors)


class OneSdTests(TestCase):

    def test_fields(self):
        xml, errors = build_1sd(INS, [HireRow(person(), date(2026, 10, 1), "01", "", "241101")])
        self.assertEqual(errors, [])
        f = pages(xml)[0][1]
        self.assertEqual((f["ReasonCode_1"], f["ReasonDetCode_1"], f["U1Group_1"]), ("01", "01", "1"))
        self.assertEqual([f[f"PersonProfession_{k}_1"] for k in range(1, 5)], ["2", "4", "1", "1"])
        self.assertEqual(f["InsuranceStartDate_1"], "2026-10-01")

    def test_three_people_two_pages(self):
        xml, _ = build_1sd(INS, [HireRow(person(i), date(2026, 10, 1), lpk_code="241101") for i in range(1, 4)])
        self.assertEqual([p[0] for p in pages(xml)], ["1-SD", "1-SD-T"])


class TwoSdTests(TestCase):

    def test_dk55(self):
        xml, errors = build_2sd(INS, [DismissalRow(person(), date(2026, 10, 31), "55", "1",
                                                   income=D("2053.85"), rate=D("21.27"), payment=D("436.85"))])
        self.assertEqual(errors, [])
        f = pages(xml)[0][1]
        self.assertEqual((f["ReasonCode_1"], f["ReasonDetCode_1"], f["LawActArticle_1"]), ("02", "K01", "55"))
        self.assertEqual(f["CompensatedMonthsCount_1"], "0,00")
        self.assertEqual(f["ReasonText_1"], "ATLEIDIMAS IŠ DARBO (PAGAL DARBO SUTARTĮ)")
        self.assertEqual(f["InsIncomeTotal"], "2053,85")

    def test_income_missing_warns(self):
        _, errors = build_2sd(INS, [DismissalRow(person(), date(2026, 10, 31), "57", compensated_months=D("2"))])
        self.assertTrue(any("nepatvirtintas" in e for e in errors))


class FormatLikeRealFilesTests(TestCase):
    """Formatas kaip tikruose priimtuose failuose (be DocumentPages, su Id)."""

    def test_no_document_pages(self):
        xml, _ = build_sam(INS, 2026, 10, [SamRow(person(), D("1500"), D("21.27"), D("319.05"))])
        root = ET.fromstring(xml)
        self.assertIsNone(root.find("Form/DocumentPages"))
        self.assertEqual(root.get("Id"), "FFData_Elem_0")

    def test_2sd_continuation_version(self):
        rows = [DismissalRow(person(i), date(2026, 10, 31), "55", income=D("0"), rate=D("21.27"), payment=D("0"))
                for i in (1, 2)]
        xml, _ = build_2sd(INS, rows)
        p = pages(xml)
        self.assertEqual([x[1]["FormVersion"] for x in p], ["09", "09"])
