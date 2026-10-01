from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.work_calendar import easter_sunday, holidays, month_norm, work_days_between


class WorkCalendarTests(TestCase):

    def test_easter(self):
        self.assertEqual(easter_sunday(2026), date(2026, 4, 5))
        self.assertEqual(easter_sunday(2027), date(2027, 3, 28))

    def test_holidays_2026(self):
        h = holidays(2026)
        self.assertIn(date(2026, 4, 6), h)    # Velykų antroji diena
        self.assertIn(date(2026, 11, 2), h)   # Vėlinės
        self.assertIn(date(2026, 12, 24), h)  # Kūčios

    def test_month_norms_2026(self):
        cases = {
            (2026, 2): (19, D("152")),   # 16 d. pirmadienis - šventė
            (2026, 3): (21, D("167")),   # 11 d. šventė, 10 d. trumpinama
            (2026, 10): (22, D("176")),
            (2026, 11): (20, D("160")),  # 2 d. pirmadienis - šventė
            (2026, 12): (21, D("166")),  # 23 d. ir 31 d. trumpinamos
        }
        for (y, m), (days, hours) in cases.items():
            n = month_norm(y, m)
            self.assertEqual((n.work_days, n.hours), (days, hours), f"{y}-{m}")

    def test_part_time(self):
        n = month_norm(2026, 10, workload=D("0.5"))
        self.assertEqual(n.hours, D("88"))

    def test_work_days_between(self):
        # VDU laikotarpis liepa-rugsėjis 2026 = 22 + 21 + 22
        self.assertEqual(work_days_between(date(2026, 7, 1), date(2026, 9, 30)), 65)
