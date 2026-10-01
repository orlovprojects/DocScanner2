from datetime import date
from decimal import Decimal as D
from pathlib import Path
from unittest import TestCase
import xml.etree.ElementTree as ET

from docscanner_app.payroll.declarations.ffdata import num
from docscanner_app.payroll.declarations.gpm313 import Gpm313Data, to_ffdata, validate

FIXTURE = Path(__file__).parent / "fixtures" / "ffdata" / "GPM313_2023-10_sample.ffdata"


def fields(xml_bytes):
    root = ET.fromstring(xml_bytes)
    form = root.find("Form")
    page = form.find("Pages/Page")
    return form.get("FormDefId"), page.get("PageDefName"), {f.get("Name"): (f.text or "") for f in page.find("Fields")}


class FfdataTests(TestCase):

    def test_num(self):
        self.assertEqual(num(D("841")), "841,00")
        self.assertEqual(num(D("10740")), "10740,00")
        self.assertEqual(num(D("0.005")), "0,01")

    def test_gpm313_matches_vmi_export(self):
        """Mūsų failas = tikras iš EDS atsisiųstas GPM313 (UAB „Auksinis inkaras“, 2023-10)."""
        d = Gpm313Data("304401940", 'UAB "AUKSINIS INKARAS"', 2023, 10,
                       g5=D("841"), g6=D("168.20"), g8=D("71600"), g10=D("10740"))
        ours = fields(to_ffdata(d, created_on=date(2026, 9, 30)))
        theirs = fields(FIXTURE.read_bytes().split(b"-->", 1)[1])
        self.assertEqual(ours, theirs)

    def test_validate(self):
        self.assertEqual(validate(Gpm313Data("304401940", "UAB X", 2026, 10, g5=D("1500"), g6=D("184.61"))), [])
        self.assertTrue(validate(Gpm313Data("123", "", 2026, 13, g5=D("10"), g6=D("20"))))
