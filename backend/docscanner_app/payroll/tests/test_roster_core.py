from datetime import date, time
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.gross import TermsSegment, calc_base_pay
from docscanner_app.payroll.roster.bridge import daily_hours, timesheet_overrides
from docscanner_app.payroll.roster.law import check
from docscanner_app.payroll.roster.period import PeriodMonth, period_bounds, settle
from docscanner_app.payroll.roster.shifts import holiday_hours, make_shift, night_hours

DAY, NIGHT = (time(7), time(19)), (time(19), time(7))


def sh(d, kind=DAY, emp=1):
    return make_shift(emp, d, kind[0], kind[1])


class ShiftTests(TestCase):

    def test_hours_and_night(self):
        n = sh(date(2026, 10, 5), NIGHT)
        self.assertEqual((n.hours, night_hours(n)), (D("12.00"), D("8.00")))
        self.assertEqual(night_hours(sh(date(2026, 10, 5))), D("0.00"))

    def test_holiday_hours_cross_midnight(self):
        # 10-31 naktis -> lapkričio 1 (šventė) 0-7 val.
        self.assertEqual(holiday_hours(sh(date(2026, 10, 31), NIGHT)), D("7.00"))


class LawTests(TestCase):

    def test_rest_11h(self):
        v = check([sh(date(2026, 10, 5), NIGHT), sh(date(2026, 10, 6), (time(15), time(23)))])
        self.assertIn("REST_11H", [x.code for x in v])

    def test_52h(self):
        v = check([sh(date(2026, 10, d)) for d in range(5, 10)])   # 5 x 12 = 60 val.
        self.assertIn("WEEK_52H", [x.code for x in v])

    def test_two_two_ok(self):
        days = [5, 6, 9, 10, 13, 14, 17, 18]
        self.assertEqual(check([sh(date(2026, 10, d)) for d in days]), [])


class PeriodTests(TestCase):

    def test_bounds(self):
        self.assertEqual(period_bounds(2026, 11), ((2026, 10), (2026, 12)))
        self.assertEqual(period_bounds(2026, 2, months=3, anchor_month=2), ((2026, 2), (2026, 4)))

    def test_settle_overtime_and_deficit(self):
        m = [PeriodMonth(2026, 10, D("176"), D("180")), PeriodMonth(2026, 11, D("160"), D("168")),
             PeriodMonth(2026, 12, D("168"), D("168"))]
        s = settle(m, D("8"))
        self.assertEqual((s.excess, s.lines), (D("12"), [("SAV", D("12"), D("8"), D("0.5"))]))
        s = settle([PeriodMonth(2026, 10, D("504"), D("480"))], D("8"))
        self.assertEqual(s.lines, [("SAN", D("24"), D("8"), D("0.5"))])
        self.assertEqual(settle(m, D("8"), to_vacation=True).vacation_hours, D("18.0"))


class BridgeTests(TestCase):

    def test_roster_to_base_pay(self):
        shifts = [sh(date(2026, 10, d)) for d in (5, 6, 9, 10, 13, 14, 17, 18, 21, 22, 25, 26)]  # 144 val.
        seg = TermsSegment(date(2026, 10, 1), date(2026, 10, 31), "monthly", D("1760"), daily_hours=daily_hours(shifts))
        r = calc_base_pay(2026, 10, [seg])
        self.assertEqual((r.worked_hours, r.amount), (D("144.00"), D("1440.00")))   # 1760 / 176 x 144

    def test_overrides(self):
        ov = timesheet_overrides([sh(date(2026, 10, 31), NIGHT)])
        self.assertEqual(ov[date(2026, 10, 31)]["extra"], {"night": D("8.00"), "holiday": D("7.00")})


class SummedTimesheetTests(TestCase):

    def test_summed_month_through_engine_pieces(self):
        from docscanner_app.payroll.roster.bridge import daily_extra
        from docscanner_app.payroll.timesheet import Event, employer_sick_days, generate
        shifts = [sh(date(2026, 10, d)) for d in (5, 6, 9, 10)] + [sh(date(2026, 10, 31), NIGHT)]
        ts = generate(2026, 10, daily_schedule=daily_hours(shifts), daily_extra=daily_extra(shifts),
                      events=[Event("vacation", date(2026, 10, 19), date(2026, 10, 23))])
        self.assertEqual(ts.worked_hours, D("60.00"))
        self.assertEqual(len(ts.event_workdays("vacation")), 5)          # atostogos - darbo dienomis
        self.assertEqual(ts.extra_hours("night"), D("8.00"))
        self.assertEqual(ts.extra_hours("holiday"), D("7.00"))
        sick = Event("sick", date(2026, 10, 9), date(2026, 10, 12))
        self.assertEqual(employer_sick_days(sick, daily_schedule=daily_hours(shifts)), 2)   # 9 ir 10 - pamainos
