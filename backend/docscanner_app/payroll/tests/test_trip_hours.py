from datetime import date, datetime
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.trip_hours import PlannedShift, day_plan, plan_totals


def ryt(d):
    return PlannedShift(datetime(2026, 11, d, 7), datetime(2026, 11, d, 19), D("11"), "RYT")


class TripHoursTests(TestCase):

    def test_example(self):
        # št 11-14 (poilsio diena) išvyksta 10:00, kelionė 5 val.; pr-an pamainos; an grįžta 19:00, kelionė 4 val. (15-19 - pamainos metu)
        rows = day_plan(datetime(2026, 11, 14, 10), datetime(2026, 11, 17, 19), 5, 4,
                        {date(2026, 11, 16): ryt(16), date(2026, 11, 17): ryt(17)}, True, lambda d: D("0"))
        by = {r["date"]: r for r in rows}
        self.assertEqual((by["2026-11-14"]["travel"], by["2026-11-14"]["comp_rest"]), ("5", "5"))
        self.assertEqual(by["2026-11-15"]["total"], "0")
        self.assertEqual(by["2026-11-16"]["work"], "11")
        self.assertEqual((by["2026-11-17"]["travel"], by["2026-11-17"]["work"], by["2026-11-17"]["comp_rest"]), ("4", "7", "0"))
        self.assertEqual(plan_totals(rows), {"travel": "9", "work": "18", "total": "27", "comp_rest": "5"})

    def test_no_roster_workdays(self):
        rows = day_plan(datetime(2026, 11, 16, 6), datetime(2026, 11, 16, 20), 2, 2, {}, False,
                        lambda d: D("8") if d.weekday() < 5 else D("0"))
        r = rows[0]
        # kelionės 06-08 (už darbo dienos 08-17) ir 18-20 -> visa kelionė už darbo laiko
        self.assertEqual((r["travel"], r["work"], r["comp_rest"]), ("4", "8", "4"))

    def test_edits_and_rest_day_work(self):
        rows = day_plan(datetime(2026, 11, 14, 10), datetime(2026, 11, 15, 18), 3, 3, {}, True, lambda d: D("0"),
                        edits={"2026-11-15": {"travel": 3, "work": 4}})
        sun = rows[1]
        self.assertEqual((sun["work"], sun["rest_day_work"], sun["comp_rest"], sun["edited"]), ("4", "4", "3", True))
