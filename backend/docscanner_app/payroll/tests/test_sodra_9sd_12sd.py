"""9-SD / 12-SD - laukai sutikrinti su tikrais priimtais EDAS failais (asmens duomenys pakeisti)."""
import re
from datetime import date
from unittest import TestCase

from docscanner_app.payroll.declarations.sodra_forms import (
    ChildLeave, Insurer, Person, SuspendRow, build_12sd, build_9sd,
)

INS = Insurer('UAB "PAVYZDYS"', "1234567", "301234567", "860000000", "GATVĖ G. 1, VILNIUS",
              "JONAS VADOVAS", "JONAS VADOVAS TEL.860000000")


def fields(content):
    xml = content.decode() if isinstance(content, bytes) else content
    out = dict(re.findall(r'<Field Name="([^"]+)">([^<]*)</Field>', xml))
    out.update({k: "" for k in re.findall(r'<Field Name="([^"]+)"\s*/>', xml)})
    return out


class Sodra12SDTests(TestCase):

    def test_two_people_like_accepted_file(self):
        rows = [SuspendRow(Person("Ona", "Onaitė", "48001010000"), date(2021, 11, 3), date(2021, 12, 29), "05"),
                SuspendRow(Person("Rūta", "Rūtaitė", "47601010000"), date(2021, 11, 3), date(2021, 12, 29), "05")]
        content, errors = build_12sd(INS, rows, date(2021, 12, 4), "ND/202111-12")
        self.assertEqual(errors, [])
        f = fields(content)
        expected = {
            "FormCode": "12-SD", "FormVersion": "05", "PageNumber": "1", "PageTotal": "1", "PersonCountTotal": "2",
            "RowNumber_1": "1", "RowNumber_2": "2", "DocDate": "2021-12-04", "DocNumber": "ND/202111-12",
            "PersonCode_1": "48001010000", "InsuranceSeries_1": "", "InsuranceNumber_1": "",
            "InsuranceSuspendStart_1": "2021-11-03", "InsuranceSuspendEnd_1": "2021-12-29",
            "PersonFirstName_1": "ONA", "PersonLastName_1": "ONAITĖ",
            "ReasonCode_2": "05", "ReasonText_2": "NEATVYKIMAS ADMINISTRACIJOS LEIDIMU",
        }
        self.assertEqual({k: f.get(k) for k in expected}, expected)

    def test_continuation_pages(self):
        rows = [SuspendRow(Person("A", f"B{i}", "39001010000"), date(2026, 11, 2), None, "01") for i in range(7)]
        content, _ = build_12sd(INS, rows, date(2026, 11, 2))
        xml = content.decode() if isinstance(content, bytes) else content
        self.assertEqual(xml.count('PageDefName="12-SD-T"'), 2)      # 2 + 4 + 1


class Sodra9SDTests(TestCase):

    def test_like_accepted_file(self):
        leave = ChildLeave(Person("Petras", "Petraitis", "39001010000", "DK", "81498"), date(2023, 6, 16),
                           date(2024, 6, 15), "02", child_birth_date=date(2021, 6, 15))
        content, errors = build_9sd(INS, leave, date(2023, 7, 6), "VP20230706")
        self.assertEqual(errors, [])
        f = fields(content)
        expected = {
            "FormCode": "9-SD", "FormVersion": "06", "DocDate": "2023-07-06", "DocNumber": "VP20230706",
            "PersonCode": "39001010000", "InsuranceSeries": "DK", "InsuranceNumber": "81498",
            "PersonFirstName": "PETRAS", "PersonLastName": "PETRAITIS",
            "HolidayStartDate": "2023-06-16", "HolidayEndDate": "2024-06-15", "HolidayCancelDate": "",
            "ChildBirthDate": "2021-06-15", "ChildPersonCode": "",
            "ReasonCode_1": "02", "ReasonText_1": "ATOSTOGOS VAIKUI PRIŽIŪRĖTI",
        }
        self.assertEqual({k: f.get(k) for k in expected}, expected)

    def test_cancel_and_missing_child(self):
        leave = ChildLeave(Person("P", "P", "39001010000"), date(2026, 1, 1), date(2026, 6, 30), "02",
                           cancel_date=date(2026, 3, 31))
        content, errors = build_9sd(INS, leave, date(2026, 4, 1))
        self.assertEqual(fields(content)["HolidayCancelDate"], "2026-03-31")
        self.assertTrue(any("vaikas" in e for e in errors))
