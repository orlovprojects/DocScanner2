from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.declarations.sodra_forms import Insurer, Person, SickReport, build_npsd2
from docscanner_app.payroll.npsd2_periods import cut_segments, npsd2_deadline

INS = Insurer("UAB Auksinis inkaras", "2822020", "304401940", "867259080", "Švendubrės g. 9, Vilnius",
              "Svetlana Jurgelaitienė", "Svetlana Jurgelaitienė tel. 864575312", "Direktorė")


class NpSd2Tests(TestCase):

    def test_deadlines(self):
        self.assertEqual(npsd2_deadline(date(2026, 9, 8)), date(2026, 9, 15))
        self.assertEqual(npsd2_deadline(date(2026, 9, 12)), date(2026, 9, 15))
        self.assertEqual(npsd2_deadline(date(2026, 9, 20)), date(2026, 9, 30))
        self.assertEqual(npsd2_deadline(date(2026, 11, 3)), date(2026, 11, 16))     # 15 d. - sekmadienis

    def test_long_sickness_segments(self):
        self.assertEqual(cut_segments(date(2026, 10, 1), date(2026, 11, 10)),
                         [(date(2026, 10, 1), date(2026, 10, 14)), (date(2026, 10, 15), date(2026, 10, 31)),
                          (date(2026, 11, 1), date(2026, 11, 10))])
        self.assertEqual(cut_segments(date(2026, 9, 8), date(2026, 9, 12)), [(date(2026, 9, 8), date(2026, 9, 12))])

    def test_ffdata_like_edas_sample(self):
        r = SickReport(Person("Ana", "Semaško", person_code="48001010003", sd_series="SD", sd_number="1379507"),
                       date(2019, 12, 4), date(2019, 12, 9), reason="06", reason_text="Ligonio slauga")
        xml, errors = build_npsd2(INS, r, date(2020, 1, 6))
        x = xml.decode()
        self.assertEqual(errors, [])
        for frag in ('FormDefId="{7647E6BD-342A-42CD-A1CD-AE1E4DBC8295}"', '<Field Name="A5_Start">2019-12-04</Field>',
                     '<Field Name="A6_End">2019-12-09</Field>', '<Field Name="A7">0</Field>',
                     '<Field Name="ReasonCode_1">06</Field>', '<Field Name="ReasonText_1">LIGONIO SLAUGA</Field>',
                     '<Field Name="J_group">-1</Field>', '<Field Name="B5_Start" />', 'Fields Count="37"'):
            self.assertIn(frag, x)

    def test_employer_days_and_sum(self):
        r = SickReport(Person("Jonas", "Jonaitis", person_code="39001010000"), date(2026, 10, 5), date(2026, 10, 10),
                       employer_from=date(2026, 10, 5), employer_to=date(2026, 10, 6), employer_sum=D("85.6"))
        x = build_npsd2(INS, r, date(2026, 10, 12))[0].decode()
        self.assertIn('<Field Name="B5_Start">2026-10-05</Field>', x)
        self.assertIn('<Field Name="B6_End">2026-10-06</Field>', x)
        self.assertIn('<Field Name="B7_PaymentSum">85,60</Field>', x)
