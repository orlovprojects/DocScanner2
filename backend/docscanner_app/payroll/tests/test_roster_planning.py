from decimal import Decimal
from datetime import date, timedelta, time
from unittest import TestCase

from docscanner_app.payroll.roster.planning import (
    PALETTE, build_plan, normalize_need, validate_shift_type, validate_tag_name,
)
from docscanner_app.payroll.work_calendar import is_holiday

DAYS = [date(2026, 12, 21) + timedelta(days=i) for i in range(7)]      # Pr 12-21 ... Sk 12-27; 24-26 - šventės
D, N = 1, 2


class PlanTests(TestCase):

    def test_weekday_defaults_and_zero(self):
        plan = build_plan(DAYS, [(D, [2, 2, 2, 2, 2, 1, 0])], [], lambda d: False)
        self.assertEqual(plan[date(2026, 12, 21), D], (2, None))     # pirmadienis
        self.assertEqual(plan[date(2026, 12, 26), D], (1, None))     # šeštadienis
        self.assertNotIn((date(2026, 12, 27), D), plan)              # sekmadienis 0 - nereikia

    def test_holiday_uses_sunday_value(self):
        plan = build_plan(DAYS, [(D, [2, 2, 2, 2, 2, 2, 1])], [], is_holiday)
        self.assertEqual(plan[date(2026, 12, 24), D], (1, None))     # Kūčios - kaip sekmadienis
        self.assertEqual(plan[date(2026, 12, 23), D], (2, None))

    def test_min_max_by_weekday(self):
        plan = build_plan(DAYS, [(D, [2, 2, 2, 2, 2, 1, 0], [3, 3, 3, 3, 3, 1, 1])], [], lambda d: False)
        self.assertEqual(plan[date(2026, 12, 21), D], (2, 3))
        self.assertEqual(plan[date(2026, 12, 26), D], (1, 1))
        self.assertEqual(plan[date(2026, 12, 27), D], (0, 1))        # nereikia, bet galima iki 1
        plan = build_plan(DAYS, [(D, [1] * 7, [None] * 7)], [], lambda d: False)
        self.assertEqual(plan[date(2026, 12, 21), D], (1, None))     # be ribos

    def test_manual_has_priority(self):
        manual = {(date(2026, 12, 21), D): (5, 6), (date(2026, 12, 22), D): (0, None)}
        plan = build_plan(DAYS, [(D, [2] * 7)], [], lambda d: False, manual)
        self.assertEqual(plan[date(2026, 12, 21), D], (5, 6))
        self.assertNotIn((date(2026, 12, 22), D), plan)              # rankiniu būdu pašalinta - neatgaivinama
        self.assertEqual(plan[date(2026, 12, 23), D], (2, None))

    def test_inactive_shift_types_not_planned(self):
        # į build_plan paduodamos tik aktyvios pamainos
        plan = build_plan(DAYS, [(D, [1] * 7)], [], lambda d: False)
        self.assertFalse(any(sid == N for (_, sid) in plan))

    def test_max_validation(self):
        from docscanner_app.payroll.roster.planning import normalize_max
        self.assertEqual(normalize_max(["", 2, None, 1, 1, 0, 0]), [None, 2, None, 1, 1, 0, 0])
        with self.assertRaises(ValueError):
            normalize_max([1] * 7, need=[2] * 7)

    def test_normalize_need(self):
        self.assertEqual(normalize_need(None), [1, 1, 1, 1, 1, 0, 0])
        self.assertEqual(normalize_need(["2", 0, 1, 1, 1, 0, 0]), [2, 0, 1, 1, 1, 0, 0])
        for bad in ([1] * 6, [1, 1, 1, 1, 1, 1, -1], [1.5] + [1] * 6, "1111100"):
            with self.assertRaises(ValueError):
                normalize_need(bad)


class ValidationTests(TestCase):
    ok = {"name": "Diena", "code": "D1", "start_time": time(7), "end_time": time(19), "break_minutes": 30,
          "color": PALETTE[0], "default_staff_need_by_weekday": [1, 1, 1, 1, 1, 0, 0]}

    def test_valid(self):
        self.assertEqual(validate_shift_type(self.ok, used_colors=[PALETTE[1]]), {})

    def test_invalid_fields(self):
        bad = dict(self.ok, name="D", code="DIEN", break_minutes=1500, color="#123456",
                   default_staff_need_by_weekday=[1, 1])
        err = validate_shift_type(bad)
        self.assertEqual(set(err), {"name", "code", "break_minutes", "color", "default_staff_need_by_weekday"})
        self.assertIn("code", validate_shift_type(dict(self.ok, code="D-")))
        self.assertIn("start_time", validate_shift_type(dict(self.ok, start_time=None)))

    def test_color_unique_case_insensitive(self):
        err = validate_shift_type(dict(self.ok, color=PALETTE[0].lower()), used_colors=[PALETTE[0]])
        self.assertIn("color", err)

    def test_tag_names(self):
        self.assertIsNone(validate_tag_name("Naujokai"))
        self.assertIsNotNone(validate_tag_name("N"))
        self.assertIsNotNone(validate_tag_name("x" * 25))


class VariantStatsTests(TestCase):

    def test_stats(self):
        from docscanner_app.payroll.roster.planning import variant_stats
        a = [(1, "2026-12-21", D), (2, "2026-12-21", D), (1, "2026-12-26", N)]
        slots = {(date(2026, 12, 21), D): (2, None), (date(2026, 12, 22), D): (1, None), (date(2026, 12, 26), N): (1, 1)}
        st = variant_stats(a, {"1": "180", "2": "150"}, {"1": "168", "2": "168"}, slots, night_ids=(N,), names={1: "Jonas", 2: "Ona"})
        self.assertEqual((st["coverage"]["needed"], st["coverage"]["filled"]), (4, 3))
        self.assertEqual(st["coverage"]["short_days"], ["2026-12-22"])
        self.assertEqual((st["hours"]["over"], st["hours"]["under"]), (1, 1))
        self.assertEqual(st["hours"]["worst"][0], {"employee": "Ona", "diff": -18.0})
        self.assertEqual(st["weekends"], {"min": 0, "max": 1})
        self.assertEqual(st["nights_max"], 1)


class CopyPlanTests(TestCase):

    def test_source_day_mapping(self):
        from docscanner_app.payroll.roster.services import copy_source_day
        self.assertEqual(copy_source_day(date(2026, 12, 1), 2026, 10), date(2026, 10, 6))    # 1-as antradienis
        self.assertEqual(copy_source_day(date(2026, 12, 3), 2026, 10), date(2026, 10, 1))    # 1-as ketvirtadienis
        self.assertEqual(copy_source_day(date(2026, 12, 29), 2026, 10), date(2026, 10, 27))  # 5-o antradienio nėra -> paskutinis
        self.assertIsNone(copy_source_day(date(2026, 12, 24), 2026, 10))                     # šventė - iš nustatymų
        self.assertEqual(copy_source_day(date(2026, 12, 7), 2026, 11), date(2026, 11, 9))    # 11-02 Vėlinės praleidžiamos


class BreakTests(TestCase):

    def test_night_with_exact_break(self):
        from docscanner_app.payroll.roster.shifts import make_shift, night_hours
        d = date(2026, 11, 10)
        # 19:00-07:00, pertrauka 60 min: be laiko - proporcingai; 20:00 (ne naktį) -> 8 naktinės; 02:00 (naktį) -> 7
        prop = night_hours(make_shift(1, d, time(19), time(7), 60))
        self.assertEqual(night_hours(make_shift(1, d, time(19), time(7), 60, None, time(20))), Decimal("8.00"))
        self.assertEqual(night_hours(make_shift(1, d, time(19), time(7), 60, None, time(2))), Decimal("7.00"))
        self.assertTrue(Decimal("7") < prop < Decimal("8"))

    def test_paid_break(self):
        from docscanner_app.payroll.roster.shifts import make_shift, night_hours
        sh = make_shift(1, date(2026, 11, 10), time(19), time(7), 60, None, time(2), True)
        self.assertEqual((sh.hours, night_hours(sh)), (Decimal("12.00"), Decimal("8.00")))

    def test_break_validation(self):
        base = dict(ValidationTests.ok, start_time=time(7), end_time=time(19), break_minutes=60)
        self.assertEqual(validate_shift_type(dict(base, break_start=time(11))), {})
        self.assertIn("break_start", validate_shift_type(dict(base, break_start=time(13))))   # > 5 val.
        self.assertIn("break_start", validate_shift_type(dict(base, break_start=time(18, 30))))
