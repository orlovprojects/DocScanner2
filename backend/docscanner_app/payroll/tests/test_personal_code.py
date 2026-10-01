from datetime import date
from unittest import TestCase

from docscanner_app.payroll.personal_code import control_digit, parse


def valid(first10):
    return first10 + str(control_digit(first10))


class PersonalCodeTests(TestCase):

    def test_valid_male(self):
        info = parse(valid("3850101000"))
        self.assertTrue(info.valid)
        self.assertEqual((info.birth_date, info.gender), (date(1985, 1, 1), "M"))

    def test_valid_female_2000s(self):
        info = parse(valid("6050315123"))
        self.assertEqual((info.birth_date, info.gender), (date(2005, 3, 15), "F"))

    def test_wrong_checksum(self):
        code = valid("3850101000")
        bad = code[:10] + str((int(code[10]) + 1) % 10)
        self.assertFalse(parse(bad).valid)

    def test_length(self):
        self.assertFalse(parse("385010100").valid)
