from datetime import date
from unittest import TestCase

from docscanner_app.payroll.roster.changes import diff, late_changes, lines_for


def it(e, d, sid, start="07:00", end="19:00", name="Diena"):
    return {"employee_id": e, "date": d, "shift_type_id": sid, "start": f"{d}T{start}:00", "end": f"{d}T{end}:00", "name": name}


class ChangesTests(TestCase):

    def test_diff_and_late(self):
        old = [it(1, "2026-11-05", 1), it(1, "2026-11-06", 1), it(1, "2026-11-12", 1), it(2, "2026-11-12", 1)]
        new = [it(1, "2026-11-05", 1), it(1, "2026-11-06", 1), it(1, "2026-11-12", 2, "19:00", "07:00", "Naktis"),
               it(3, "2026-11-12", 1)]
        ch = diff(old, new)
        self.assertEqual(set(ch), {1, 2, 3})
        self.assertEqual(lines_for(ch[1]), ["11-12: Diena 07:00–19:00 → Naktis 19:00–07:00"])
        late = late_changes(ch, date(2026, 11, 4), old)
        # 1-am darbuotojui iki 11-12 dar 2 darbo dienos (5, 6) - laiku; 2-am ir 3-iam - ne
        self.assertEqual(sorted(x["employee_id"] for x in late), [2, 3])
