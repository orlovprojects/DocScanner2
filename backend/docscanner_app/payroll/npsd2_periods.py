"""NP-SD2 pranešimų laikotarpiai ir terminai (Sodros NP-SD2 instrukcijos 57-58 p.). Grynas modulis."""
import calendar
from datetime import date, timedelta

from .work_calendar import is_holiday


def _month_end(d):
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def npsd2_deadline(end):
    """Ne vėliau kaip mėnesio 15 d. arba paskutinę dieną (artimiausia po laikotarpio pabaigos), perkeliant į darbo dieną."""
    d = date(end.year, end.month, 15) if end.day <= 15 else _month_end(end)
    while d.weekday() >= 5 or is_holiday(d):
        d += timedelta(days=1)
    return d


def cut_segments(start, end):
    """Laikotarpiai po ne mažiau kaip 14 d., pjūviai 14 d. arba mėnesio paskutinę dieną; likutis - paskutinis."""
    out, cur = [], start
    while cur <= end:
        if (end - cur).days + 1 <= 14:
            seg_end = end
        else:
            cand = cur + timedelta(days=13)
            while not (cand.day == 14 or cand == _month_end(cand)):
                cand += timedelta(days=1)
            seg_end = min(cand, end)
        out.append((cur, seg_end))
        cur = seg_end + timedelta(days=1)
    return out
