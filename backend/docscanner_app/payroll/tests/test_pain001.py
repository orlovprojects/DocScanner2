from datetime import date, datetime
from decimal import Decimal as D
from unittest import TestCase
from xml.etree import ElementTree as ET

from docscanner_app.payroll.pain001 import NS, authority_iban, bic_for, build, iban_valid

N = {"p": NS}
DEBTOR = {"name": "UAB „Auksinis inkaras“", "iban": "LT12 7300 0101 2345 6789", "company_code": "305123456"}


class Pain001Tests(TestCase):

    def test_iban(self):
        self.assertTrue(iban_valid("LT24 7300 0101 1239 4300"))
        self.assertFalse(iban_valid("LT24 7300 0101 1239 4301"))
        self.assertEqual(bic_for("LT247300010112394300"), "HABALT22")

    def test_authority_by_debtor_bank(self):
        self.assertEqual(authority_iban("gpm", "LT057044060007887175"), "LT057044060007887175")
        self.assertEqual(authority_iban("sodra", "LT999999900000000000"), "LT777300010129002656")

    def test_build(self):
        xml = build("DU1-20261005", DEBTOR, date(2026, 10, 9), [
            {"end_to_end": "DU202609-E12", "amount": D("1210.55"), "name": "Jonas Jonaitis",
             "iban": "LT127300010123456789", "kind": "employee", "purpose": "Darbo užmokestis už 2026-09"},
            {"end_to_end": "DU202609-G15", "amount": D("312.40"), "name": "Valstybinė mokesčių inspekcija",
             "iban": "LT247300010112394300", "kind": "gpm", "purpose": "GPM už 2026-09", "imokos_kodas": "1311",
             "code": "188659752"},
        ], created=datetime(2026, 10, 5, 12, 0))
        root = ET.fromstring(xml.split("\n", 1)[1])
        self.assertEqual(root.find("p:CstmrCdtTrfInitn/p:GrpHdr/p:CtrlSum", N).text, "1522.95")
        txs = root.findall(".//p:CdtTrfTxInf", N)
        self.assertEqual(txs[0].find("p:PmtTpInf/p:CtgyPurp/p:Cd", N).text, "SALA")
        self.assertIn("DU202609-E12", txs[0].find("p:RmtInf/p:Ustrd", N).text)
        self.assertEqual(txs[1].find("p:RmtInf/p:Strd/p:CdtrRefInf/p:Ref", N).text, "1311")
        self.assertEqual(root.find(".//p:Dbtr/p:Id/p:OrgId/p:Othr/p:Id", N).text, "305123456")
        self.assertEqual(root.find(".//p:DbtrAgt/p:FinInstnId/p:BIC", N).text, "HABALT22")
