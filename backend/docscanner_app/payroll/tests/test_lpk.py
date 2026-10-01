from unittest import TestCase

from docscanner_app.payroll.lpk import normalize, search, short_title

ITEMS = [
    {"code": "241101", "name": "Apskaitos specialistas (buhalteris)"},
    {"code": "121102", "name": "Vyriausiasis apskaitos specialistas (vyriausiasis buhalteris)"},
    {"code": "431190", "name": "Kiti apskaitos ir buhalterijos tarnautojai"},
    {"code": "522101", "name": "Parduotuvės vedėjas"},
]


class LpkTests(TestCase):

    def test_normalize(self):
        self.assertEqual(normalize("Buhalterė Šaltinis"), "buhaltere saltinis")

    def test_short_title(self):
        self.assertEqual(short_title("Apskaitos specialistas (buhalteris)"), "Apskaitos specialistas")
        self.assertEqual(short_title("Politikas (išskyrus Seimo narius)"), "Politikas")
        self.assertEqual(short_title("Parduotuvės vedėjas"), "Parduotuvės vedėjas")

    def test_search_without_diacritics(self):
        codes = [i["code"] for i in search("buhalt", ITEMS)]
        self.assertEqual(codes[:2], ["241101", "121102"])
        self.assertEqual(search("parduotuves", ITEMS)[0]["code"], "522101")

    def test_search_by_code(self):
        self.assertEqual(search("2411", ITEMS)[0]["code"], "241101")

    def test_short_query(self):
        self.assertEqual(search("b", ITEMS), [])
