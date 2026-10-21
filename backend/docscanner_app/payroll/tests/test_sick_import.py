from datetime import date
from unittest import TestCase

from docscanner_app.payroll.sick_import import Certificate, parse, plan, remaining_ranges

XML = """<DraudejoAtaskaita xmlns="http://www.sodra.lt/insurance/xml/xsd/sodra-epts-rep">
 <SuformavimoData>2026-10-08T13:06:16</SuformavimoData>
 <Pazymejimai>
  <NedarbingumoPazymejimas><Serija>EA</Serija><Numeris>1234567</Numeris>
   <Asmuo><AsmensKodas>39001010000</AsmensKodas><Vardas>PETRAS</Vardas><Pavarde>PETRAITIS</Pavarde></Asmuo>
   <SlaugomasAsmuo><AsmensKodas>51501010000</AsmensKodas></SlaugomasAsmuo>
   <NedarbingumoPriezastis>1</NedarbingumoPriezastis>
   <NedarbingumoLaikotarpis><Pradzia>2026-09-07</Pradzia><Pabaiga>2026-09-11</Pabaiga></NedarbingumoLaikotarpis>
  </NedarbingumoPazymejimas>
  <NedarbingumoPazymejimas><Serija>EA</Serija><Numeris>1234999</Numeris>
   <Asmuo><AsmensKodas>39001010000</AsmensKodas></Asmuo><NedarbingumoPriezastis>1</NedarbingumoPriezastis>
   <NedarbingumoLaikotarpis><Pradzia>2026-09-12</Pradzia><Pabaiga>2026-09-18</Pabaiga></NedarbingumoLaikotarpis>
  </NedarbingumoPazymejimas>
  <NestumoAtostoguPazymejimas><Serija>NA</Serija><Numeris>55</Numeris>
   <Asmuo><AsmensKodas>48801010000</AsmensKodas></Asmuo>
   <AtostoguLaikotarpis><Pradzia>2026-10-01</Pradzia><Pabaiga>2027-02-03</Pabaiga></AtostoguLaikotarpis>
  </NestumoAtostoguPazymejimas>
 </Pazymejimai>
</DraudejoAtaskaita>"""


class SickImportTests(TestCase):

    def test_parse_and_continuation(self):
        certs, ok = parse(XML)
        self.assertTrue(ok)
        self.assertEqual([(c.kind, c.doc_no, c.person_code, str(c.start), c.reason) for c in certs], [
            ("NEDP", "EA1234567", "39001010000", "2026-09-07", "1"),
            ("NEDP", "EA1234999", "39001010000", "2026-09-12", "1"),
            ("NESP", "NA55", "48801010000", "2026-10-01", ""),
        ])
        rows = plan(certs, {"EA1234567": (1, date(2026, 9, 7), date(2026, 9, 10))}, {"39001010000": 1})
        self.assertEqual([(r["action"], r["continuation"]) for r in rows],
                         [("update", False), ("create", True), ("skip", False)])

    def test_empty_report(self):
        certs, ok = parse('<DraudejoAtaskaita xmlns="http://www.sodra.lt/insurance/xml/xsd/sodra-epts-rep">'
                          '<SuformavimoData>2026-10-08T13:06:16</SuformavimoData></DraudejoAtaskaita>')
        self.assertEqual((certs, ok), ([], True))

    def test_annulled_existing_is_removed(self):
        c = Certificate("NEDP", "EA", "1", "39001010000", "", date(2026, 9, 7), date(2026, 9, 9), "1", annulled=True)
        rows = plan([c], {"EA1": (5, date(2026, 9, 7), date(2026, 9, 9))}, {"39001010000": 1})
        self.assertEqual(rows[0]["action"], "annul")
        rows = plan([c], {}, {"39001010000": 1})
        self.assertEqual(rows[0]["action"], "skip")

    def test_vacation_split_by_sick_leave(self):
        d = lambda x: date(2026, 11, x)        # noqa: E731
        # liga atostogų viduryje - dvi dalys
        self.assertEqual(remaining_ranges(d(2), d(13), d(5), d(7)), [(d(2), d(4)), (d(8), d(13))])
        # liga atostogų pradžioje / pabaigoje - sutrumpinama
        self.assertEqual(remaining_ranges(d(2), d(13), d(1), d(4)), [(d(5), d(13))])
        self.assertEqual(remaining_ranges(d(2), d(13), d(10), d(20)), [(d(2), d(9))])
        # liga apima visas atostogas - nieko nelieka
        self.assertEqual(remaining_ranges(d(2), d(13), d(1), d(30)), [])
