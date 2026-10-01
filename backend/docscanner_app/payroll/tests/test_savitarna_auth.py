from unittest import TestCase

from docscanner_app.payroll.savitarna_utils import hash_token, iban_ok, new_token, normalize_login, password_problem


class SavitarnaAuthTests(TestCase):

    def test_tokens(self):
        raw, h = new_token()
        self.assertEqual(hash_token(raw), h)
        self.assertGreater(len(raw), 30)

    def test_normalize_login(self):
        self.assertEqual(normalize_login(" Ona@Gmail.COM "), "ona@gmail.com")
        self.assertEqual(normalize_login("+370 612 34567"), "+37061234567")
        self.assertEqual(normalize_login("861234567"), "+37061234567")

    def test_password_rules(self):
        self.assertTrue(password_problem("abc"))
        self.assertTrue(password_problem("12345678"))
        self.assertTrue(password_problem("aaaaaaaa"))
        self.assertEqual(password_problem("Vasara2026"), "")

    def test_iban(self):
        self.assertTrue(iban_ok("LT121000011101001000"))
        self.assertFalse(iban_ok("LT121000011101001001"))
