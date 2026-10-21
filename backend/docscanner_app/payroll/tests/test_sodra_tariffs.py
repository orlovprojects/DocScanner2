from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.sodra_tariffs import compare, parse

XML = """<?xml version="1.0" encoding="UTF-8"?><ROWSET><ROW><X><Ataskaita pavadinimas="apdraustuju_tarifai_2019" nr="47">
<AntrastesDuomenys><Laikotarpis>2026 m. spalio mėn.</Laikotarpis></AntrastesDuomenys><Duomenys>
<Asmuo><AsmPavarde>PETRAITIS</AsmPavarde><AsmVardas>PETRAS</AsmVardas><AsmKodas>39001010000</AsmKodas>
<AsmDataNuo>2026-10-01</AsmDataNuo><AsmDataIki>2026-10-31</AsmDataIki><BendrTrf>24,27</BendrTrf><DrdTrf>1,77</DrdTrf>
<ApdrTrf>19,50</ApdrTrf><ApdrPkTrf>3,00</ApdrPkTrf><ApdrPkb>UAB "FONDAS"</ApdrPkb></Asmuo>
<Asmuo><AsmPavarde>ONAITE</AsmPavarde><AsmVardas>ONA</AsmVardas><AsmKodas>48001010000</AsmKodas>
<AsmDataNuo>2026-10-01</AsmDataNuo><AsmDataIki>2026-10-31</AsmDataIki><BendrTrf>21,99</BendrTrf><DrdTrf>2,49</DrdTrf>
<ApdrTrf>19,50</ApdrTrf><ApdrPkTrf>0,00</ApdrPkTrf><ApdrPkb></ApdrPkb></Asmuo>
</Duomenys></Ataskaita></X></ROW></ROWSET>"""


class S47Tests(TestCase):

    def test_parse_and_compare(self):
        rows = parse(XML)
        self.assertEqual([(r.person_code, r.pension, r.fixed_term) for r in rows],
                         [("39001010000", D("3.00"), False), ("48001010000", D("0.00"), True)])
        self.assertIsNone(parse("<x/>"))
        ours = {"39001010000": {"name": "Petras", "pension": False, "fixed_term": False, "employee_id": 1},
                "48001010000": {"name": "Ona", "pension": False, "fixed_term": True, "employee_id": 2},
                "37001010000": {"name": "Jonas", "pension": False, "fixed_term": False, "employee_id": 3}}
        issues, n = compare(rows, ours)
        self.assertEqual(n, 2)
        self.assertEqual([(i["employee"], i["issue"], bool(i["fix"])) for i in issues], [
            ("Petras", "Pensijų kaupimas", True), ("Jonas", "DokSkenas dirba, Sodroje šį mėnesį nėra", False)])
