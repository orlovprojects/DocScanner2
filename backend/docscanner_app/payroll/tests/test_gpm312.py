import re
from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.declarations.gpm312 import Gpm312Row, to_ffdata


def fields(content):
    xml = content.decode() if isinstance(content, bytes) else content
    return xml, dict(re.findall(r'<Field Name="([^"]+)">([^<]*)</Field>', xml))


class Gpm312Tests(TestCase):

    def test_like_accepted_file(self):
        rows = [Gpm312Row("39001010000", "1", "Petras Petraitis", "01", D("11899.70"), D("20"), D("2379.94")),
                Gpm312Row("39001010000", "1", "Petras Petraitis", "23", D("70000"), D("15"), D("10500")),
                Gpm312Row("39001010000", "1", "Petras Petraitis", "24", D("31600"), D("15"), D("4740"))]
        xml, f = fields(to_ffdata("304401940", 'UAB "Pavyzdys"', 2023, rows, created_on=date(2026, 9, 30)))
        self.assertIn('FormDefId="{DD0F88DD-A858-4595-AF2F-3643D0069A39}"', xml)
        self.assertEqual((f["G4"], f["G5"], f["G6"], f["G7"]), ("113499,70", "17619,94", "0,00", "0,00"))
        self.assertEqual((f["L3-1"], f["L5-2"], f["L8-2"], f["L9-2"], f["L10-3"]),
                         ("PETRAS PETRAITIS", "23", "70000,00", "15,00", "4740,00"))
        page = xml[xml.find('PageDefName="GPM312L"'):]
        names = re.findall(r'<Field Name="([^"]+)"', page)
        self.assertEqual((names[0], names[-1], len(names)), ("L1-1", "LapoNr", 135))

    def test_pages_of_ten(self):
        rows = [Gpm312Row(f"3900101{i:04d}", "1", f"A{i}", "01", D("100"), D("20"), D("20")) for i in range(23)]
        xml, f = fields(to_ffdata("304401940", "X", 2026, rows))
        self.assertEqual(xml.count('PageDefName="GPM312L"'), 3)
