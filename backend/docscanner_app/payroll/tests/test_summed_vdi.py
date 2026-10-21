"""Suminė darbo laiko apskaita pagal VDI atmintinę: normos mažinimas, prastova, atostogos, viršvalandžiai, etato keitimas."""
from datetime import date, timedelta
from decimal import Decimal as D
from types import SimpleNamespace as N
from unittest import TestCase

from docscanner_app.payroll.roster.services import _norm_without_absences, _segment_norms
from docscanner_app.payroll.timesheet import STANDARD_WEEK, Event, generate

Y, M = 2026, 9           # 2026-09: 22 darbo dienos, norma 176 val.


def shifts(*days, hours=D("12")):
    return {date(Y, M, d): hours for d in days}


def ts(events=(), schedule=None, overrides=None, workload=D("1")):
    return generate(Y, M, workload=workload, events=events, daily_schedule=schedule if schedule is not None else {},
                    overrides=overrides)


class SummedVdiTests(TestCase):

    def test_base_norm(self):
        self.assertEqual(_norm_without_absences(ts()), D("176"))

    def test_a_sick_reduces_by_shift_hours(self):
        # liga dviejose 12 val. pamainose (antradienis ir šeštadienis) -> norma mažėja 24 val., ne 8 + 0
        sched = shifts(1, 5, 8)
        t = ts(events=[Event("sick", date(Y, M, 1), date(Y, M, 6))], schedule=sched)
        self.assertEqual(_norm_without_absences(t), D("176") - D("24"))

    def test_a_long_absence_without_schedule_uses_calendar(self):
        t = ts(events=[Event("sick", date(Y, M, 1), date(Y, M, 30))], schedule={})
        self.assertEqual(_norm_without_absences(t), D("0"))

    def test_b_downtime_balance(self):
        # prastova 12 val. pamainoje: norma - 12, dirbta 0 -> balansas toks pat, kaip „norma nemažinama, prastova = dirbta“
        sched = shifts(2, 3)
        t = ts(events=[Event("downtime", date(Y, M, 2), date(Y, M, 2))], schedule=sched)
        self.assertEqual(_norm_without_absences(t) - t.worked_hours, D("176") - D("12") - D("12"))

    def test_c_vacation_by_five_day_week(self):
        # atostogos pirmadienis-penktadienis (5 d. d.), grafike tą savaitę 3 pamainos po 12 val. -> norma mažėja 40 val.
        sched = shifts(14, 16, 19)
        t = ts(events=[Event("vacation", date(Y, M, 14), date(Y, M, 18))], schedule=sched)
        self.assertEqual(_norm_without_absences(t), D("136"))
        # 2 atostogų dienos -> 16 val. (ne pamainų valandos)
        t = ts(events=[Event("vacation", date(Y, M, 14), date(Y, M, 15))], schedule=sched)
        self.assertEqual(_norm_without_absences(t), D("160"))
        # pusė etato -> po 4 val.
        t = ts(events=[Event("vacation", date(Y, M, 14), date(Y, M, 15))], schedule=sched, workload=D("0.5"))
        self.assertEqual(_norm_without_absences(t), D("88") - D("8"))

    def test_d_overtime_in_shift_not_in_period_balance(self):
        # pamaina 6 val., dirbta 8: 2 val. viršvalandžiai apmokami tą mėnesį (VRS), į laikotarpio balansą neįskaitomi
        sched = shifts(1, hours=D("6"))
        t = ts(schedule=sched, overrides={date(Y, M, 1): {"extra": {"overtime": 2}}})
        self.assertEqual(t.worked_hours, D("6"))
        self.assertEqual(t.extra_hours("overtime"), D("2"))

    def test_e_workload_change_mid_month(self):
        # 1,0 iki 15 d., 0,5 nuo 16 d.: 11 d. d. x 8 + 11 d. d. x 4 = 132 val.
        terms = [N(valid_from=date(2020, 1, 1), workload=D("1"), schedule=None, full_time_hours=D("40")),
                 N(valid_from=date(Y, M, 16), workload=D("0.5"), schedule=None, full_time_hours=D("40"))]
        contract = N(terms=N(all=lambda: terms))
        t = _segment_norms(ts(), contract, date(Y, M, 1), date(Y, M, 30), week_fn=lambda _t: STANDARD_WEEK)
        self.assertEqual(_norm_without_absences(t), D("132"))
