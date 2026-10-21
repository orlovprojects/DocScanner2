"""Perėjimas: Sodros ataskaitų (S50, S31) ir GPM313 skaitymas, atkūrimas (sintetiniai duomenys)."""
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.migration.ffparse import parse
from docscanner_app.payroll.migration.reconstruct import build

S50 = """<?xml version="1.0" encoding="UTF-8"?><ROWSET><ROW><X><Ataskaita pavadinimas="apdraustuju_imokos_2019" nr="50">
<AntrastesDuomenys><DataNuo>2023-01-01</DataNuo><DataIki>2023-03-31</DataIki></AntrastesDuomenys><Duomenys>
<Asmuo><EilNr>1</EilNr><AsmPavarde>PETRAITIS</AsmPavarde><AsmVardas>PETRAS</AsmVardas><AsmKodas>39001010000</AsmKodas>
<AsmSocDrNr>SD1234567</AsmSocDrNr>
<AsmuoDuom><Metai>2023</Metai><Menuo>1</Menuo><Pran>SAM3SD</Pran><Uzm>1000,00</Uzm><Tarifas>24,27</Tarifas><Imk>242,70</Imk></AsmuoDuom>
<AsmuoDuom><Metai></Metai><Menuo>2</Menuo><Pran>SAM3SD</Pran><Uzm>1000,00</Uzm><Tarifas>24,27</Tarifas><Imk>242,70</Imk></AsmuoDuom>
<AsmuoDuom><Metai></Metai><Menuo>3</Menuo><Pran>2-SD</Pran><Uzm>1500,00</Uzm><Tarifas>24,27</Tarifas><Imk>364,05</Imk></AsmuoDuom>
<AsmuoDuom><Metai>Viso</Metai><Menuo></Menuo><Uzm>3500,00</Uzm></AsmuoDuom>
</Asmuo></Duomenys></Ataskaita></X></ROW></ROWSET>"""

S31 = """<?xml version="1.0" encoding="UTF-8"?><ROWSET><ROW><ELEM><Ataskaita pavadinimas="apdraustuju_laikotarpiai" nr="31">
<AntrastesDuomenys><DataNuo>2023-01-01</DataNuo><DataIki>2023-12-31</DataIki></AntrastesDuomenys><DraudimoLaikotarpiai>
<DrdLaikotarpis><EilNr>1</EilNr><AsmKodas>39001010000</AsmKodas><SdSer>SD</SdSer><SdNum>1234567</SdNum><Vardas>PETRAS</Vardas>
<Pavarde>PETRAITIS</Pavarde><DraudimoPradzia>2019-05-02</DraudimoPradzia><DraudimoPabaiga>2023-03-15</DraudimoPabaiga>
<Priezastis>02 ATLEIDIMAS</Priezastis></DrdLaikotarpis></DraudimoLaikotarpiai></Ataskaita></ELEM></ROW></ROWSET>"""


def gpm313(y, m, g5, gpm):
    return (f'<FFData><Form FormDefId="x"><Pages Count="1"><Page PageDefName="GPM313" PageNumber="1"><Fields Count="5">'
            f'<Field Name="B_ML_Metai">{y}</Field><Field Name="B_ML_Menuo">{m}</Field><Field Name="G5">{g5}</Field>'
            f'<Field Name="G6">{gpm}</Field><Field Name="G7">0,00</Field></Fields></Page></Pages></Form></FFData>')


class MigrationParseTests(TestCase):

    def test_reports_and_lag(self):
        parsed = [parse(S50, "a.xml"), parse(S31, "b.xml"),
                  parse(gpm313(2023, 2, "1000,00", "200,00"), "g2"), parse(gpm313(2023, 3, "1000,00", "200,00"), "g3"),
                  parse(gpm313(2023, 4, "1500,00", "300,00"), "g4")]
        self.assertEqual([p.form for p in parsed], ["S50", "S31", "GPM313", "GPM313", "GPM313"])
        r = build(parsed)
        e = r.employees["39001010000"]
        self.assertEqual((e.first_name, e.sd_series, e.sd_number), ("Petras", "SD", "1234567"))
        self.assertEqual(e.income, {(2023, 1): D("1000.00"), (2023, 2): D("1000.00"), (2023, 3): D("1500.00")})
        self.assertEqual((str(e.start), str(e.end)), ("2019-05-02", "2023-03-15"))
        self.assertTrue(e.pension)
        self.assertFalse(e.fixed_term)
        self.assertEqual(r.lag, 1)
        self.assertTrue(all(c[4] for c in r.checks))
        self.assertTrue(e.npd_none)
        self.assertIn((2023, 2), r.income_months)


class S50NewestWinsTests(TestCase):

    def test_overlapping_s50_not_doubled(self):
        older = S50.replace("<DataIki>2023-03-31</DataIki>", "<DataIki>2023-02-28</DataIki>")
        r = build([parse(older, "old.xml"), parse(S50, "new.xml")])
        e = r.employees["39001010000"]
        self.assertEqual(e.income[(2023, 2)], D("1000.00"))         # ne 2000 - naujesnis failas pakeičia
        self.assertIn((2023, 3), e.sd2_months)
