from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.averages import (
    BonusRecord, ChildInfo, VduMonth, calc_daily_vdu, downtime_pay,
    parent_day_entitlement, pay_by_days, sick_pay_employer,
)
from docscanner_app.payroll.taxes import q2

OCT = date(2026, 10, 1)
STD_MONTHS = [
    VduMonth(2026, 7, D("1500"), 22, D("176"), 22),
    VduMonth(2026, 8, D("1500"), 21, D("168"), 21),
    VduMonth(2026, 9, D("1500"), 22, D("176"), 22),
]


class VduTests(TestCase):

    def test_standard(self):
        r = calc_daily_vdu(OCT, STD_MONTHS)
        self.assertEqual(q2(r.daily), D("69.23"))
        self.assertEqual(r.source, "history")

    def test_payments_from_reference_cases(self):
        daily = calc_daily_vdu(OCT, STD_MONTHS).daily
        self.assertEqual(pay_by_days(daily, 5), D("346.15"))                   # atostoginiai
        self.assertEqual(pay_by_days(daily, 8), D("553.85"))                   # kompensacija
        self.assertEqual(sick_pay_employer(daily, 3, D("62.06")), D("85.93"))  # tik 2 d.

    def test_absence_excluded_from_denominator(self):
        months = STD_MONTHS[:2] + [VduMonth(2026, 9, D("1295.45"), 19, D("152"), 22)]
        r = calc_daily_vdu(OCT, months)
        self.assertEqual(q2(r.daily), q2(D("4295.45") / 62))

    def test_bonuses(self):
        bonuses = [
            BonusRecord(date(2026, 8, 1), D("900"), "quarterly"),
            BonusRecord(date(2026, 7, 1), D("700"), "quarterly"),     # senesnė - neimama
            BonusRecord(date(2025, 12, 1), D("2000"), "annual"),      # per 12 mėn. -> 1/4
            BonusRecord(date(2025, 9, 1), D("5000"), "annual"),       # už 12 mėn. ribos
        ]
        r = calc_daily_vdu(OCT, STD_MONTHS, bonuses)
        self.assertEqual(q2(r.bonus_part), q2(D("1400") / 65))
        self.assertEqual(q2(r.daily), D("90.77"))

    def test_fallback_new_employee(self):
        r = calc_daily_vdu(OCT, [], fallback_monthly=D("1500"), fallback_days=22)
        self.assertEqual((q2(r.daily), r.source), (D("68.18"), "fallback"))

    def test_floor(self):
        low = [VduMonth(2026, m, D("300"), 22, D("176"), 22) for m in (7, 8, 9)]
        r = calc_daily_vdu(OCT, low, floor_mma=D("1153"), floor_days=22)
        self.assertEqual((q2(r.daily), r.source), (D("52.41"), "floor"))


class DowntimeTests(TestCase):

    def test_steps(self):
        daily = D("4500") / 65
        self.assertEqual(downtime_pay(daily, 1), D("69.23"))
        self.assertEqual(downtime_pay(daily, 5), D("216.92"))  # 1 + 2x2/3 + 2x0,4


class ParentDaysTests(TestCase):
    on = date(2026, 10, 1)

    def test_rules(self):
        self.assertEqual(parent_day_entitlement([], self.on), (0, 0))
        self.assertEqual(parent_day_entitlement([ChildInfo(date(2020, 1, 1))], self.on), (1, 3))
        two = [ChildInfo(date(2020, 1, 1)), ChildInfo(date(2018, 5, 5))]
        self.assertEqual(parent_day_entitlement(two, self.on), (1, 1))
        three = two + [ChildInfo(date(2023, 3, 3))]
        self.assertEqual(parent_day_entitlement(three, self.on), (2, 1))
        disabled_teen = [ChildInfo(date(2012, 1, 1), has_disability=True)]
        self.assertEqual(parent_day_entitlement(disabled_teen, self.on), (1, 1))

    def test_child_turns_12(self):
        kid = [ChildInfo(date(2014, 10, 2))]
        self.assertEqual(parent_day_entitlement(kid, date(2026, 10, 1)), (1, 3))
        self.assertEqual(parent_day_entitlement(kid, date(2026, 10, 2)), (0, 0))


class ParentDaysChatGptCases(TestCase):

    def test_two_young_one_disabled(self):
        kids = [ChildInfo(date(2018, 1, 1), True), ChildInfo(date(2016, 1, 1))]
        self.assertEqual(parent_day_entitlement(kids, date(2026, 10, 1)), (2, 1))

    def test_two_disabled_teens_only_one_day(self):
        kids = [ChildInfo(date(2013, 1, 1), True), ChildInfo(date(2011, 1, 1), True)]
        self.assertEqual(parent_day_entitlement(kids, date(2026, 10, 1)), (1, 1))

    def test_2027_age_limit_14(self):
        kid = [ChildInfo(date(2013, 6, 1))]  # 2027-03 jam 13 m.
        self.assertEqual(parent_day_entitlement(kid, date(2026, 10, 1)), (0, 0))
        self.assertEqual(parent_day_entitlement(kid, date(2027, 3, 1)), (1, 3))
