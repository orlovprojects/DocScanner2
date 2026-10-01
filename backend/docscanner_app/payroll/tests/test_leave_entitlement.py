from datetime import date
from unittest import TestCase

from docscanner_app.payroll.vacation import annual_entitlement

ON = date(2026, 10, 1)


class LeaveEntitlementTests(TestCase):

    def test_standard(self):
        self.assertEqual(annual_entitlement(ON).total, 20)
        self.assertEqual(annual_entitlement(ON, work_days_per_week=6).total, 24)

    def test_minor(self):
        self.assertEqual(annual_entitlement(ON, birth_date=date(2010, 1, 1)).total, 25)

    def test_single_parent_child_under_14(self):
        e = annual_entitlement(ON, single_parent=True, children=[(date(2015, 1, 1), False)])
        self.assertEqual(e.total, 25)
        # vaikas 15 m. be negalios - nebepriklauso
        e = annual_entitlement(ON, single_parent=True, children=[(date(2011, 1, 1), False)])
        self.assertEqual(e.total, 20)
        # vaikas 15 m. su negalia - priklauso
        e = annual_entitlement(ON, single_parent=True, children=[(date(2011, 1, 1), True)])
        self.assertEqual(e.total, 25)

    def test_seniority(self):
        self.assertEqual(annual_entitlement(ON, seniority_since=date(2016, 9, 1)).total, 23)   # 10 m.
        self.assertEqual(annual_entitlement(ON, seniority_since=date(2011, 9, 1)).total, 24)   # 15 m.

    def test_extended_vs_seniority_better_one(self):
        # neįgalus (25) vs 20 + 4 už 15 m. stažą (24) -> 25
        e = annual_entitlement(ON, has_disability=True, seniority_since=date(2011, 9, 1))
        self.assertEqual(e.total, 25)
        # 20 + 6 už 25 m. stažą (26) > 25 -> kasmetinės + papildomos
        e = annual_entitlement(ON, has_disability=True, seniority_since=date(2001, 9, 1))
        self.assertEqual(e.total, 26)
        self.assertEqual(len(e.parts), 2)

    def test_profession_and_extra(self):
        e = annual_entitlement(ON, profession_days=40, extra_days=5)
        self.assertEqual(e.total, 45)
        self.assertEqual(len(e.parts), 2)

    def test_part_week(self):
        self.assertEqual(annual_entitlement(ON, work_days_per_week=3).total, 12)
