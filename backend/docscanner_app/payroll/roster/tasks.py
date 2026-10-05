from celery import shared_task


@shared_task(soft_time_limit=600)
def generate_roster_task(roster_id, n=3, seconds=30):
    from docscanner_app.models import Roster
    from .services import generate_variants
    roster = Roster.objects.select_related("company").get(id=roster_id)
    return generate_variants(roster, n=n, seconds=seconds).get("state")


@shared_task
def auto_draft_rosters():
    """Kasdien: likus N d. (DU nustatymai) iki kito mėnesio - automatiškai sudaromas grafiko juodraštis."""
    from datetime import date, timedelta
    from django.utils import timezone
    from docscanner_app.models import PayrollSettings, Roster
    from .services import _bounds, summed_employees

    today = timezone.localdate()
    ny, nm = (today.year + (today.month == 12), today.month % 12 + 1)
    first, last = _bounds(ny, nm)
    for st in PayrollSettings.objects.select_related("company"):
        if (first - today).days > (st.roster_publish_days or 10):
            continue
        roster = Roster.objects.filter(company=st.company, year=ny, month=nm).first()
        if roster and (roster.generated_at or roster.shifts.exists() or roster.status == "published"):
            continue
        if not summed_employees(st.company, first, last):
            continue
        roster = roster or Roster.objects.create(company=st.company, year=ny, month=nm)
        generate_roster_task.delay(roster.id)
