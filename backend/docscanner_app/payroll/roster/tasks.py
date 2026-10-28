from celery import shared_task
from .. import admin_tools  # noqa: F401 - Celery klaidos -> PayrollErrorLog (Klaidos skirtukas)

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


@shared_task(soft_time_limit=1800)
def generate_period_task(company_id, year, month, n=3, seconds=30):
    """Grafikas visam apskaitiniam laikotarpiui: neskelbti mėnesiai iš eilės (žr. services.generate_period)."""
    from docscanner_app.models import CompanyProfile
    from .services import generate_period
    company = CompanyProfile.objects.get(id=company_id)
    return generate_period(company, year, month, n=n, seconds=seconds)


@shared_task(soft_time_limit=900)
def repair_roster_task(roster_id, mode="fill", seconds=20):
    """Grafiko pataisymų peržiūra po nebuvimų (šis ir vėlesni laikotarpio mėnesiai). Rezultatas - roster.summary["repair"]."""
    import logging
    from django.utils import timezone
    from docscanner_app.models import Roster
    from .repair import repair_preview
    roster = Roster.objects.select_related("company").get(id=roster_id)
    roster.summary = dict(roster.summary or {}, repair={"state": "running", "mode": mode,
                                                        "started_at": timezone.now().isoformat()})
    roster.save(update_fields=["summary", "updated_at"])
    try:
        rep = repair_preview(roster, mode, seconds=seconds)
    except ValueError as e:
        rep = {"state": "error", "mode": mode, "error": str(e)}
    except Exception as e:  # noqa: BLE001
        logging.getLogger("docscanner_app").exception("Roster repair failed: roster=%s", roster_id)
        admin_tools.log_task_error("payroll.roster.repair_roster_task", e, company_id=roster.company_id,
                                   args=[roster_id, mode])
        rep = {"state": "error", "mode": mode, "error": "Vidinė klaida ieškant pataisymų"}
    roster.refresh_from_db()
    roster.summary = dict(roster.summary or {}, repair=rep)
    roster.save(update_fields=["summary", "updated_at"])
    return rep.get("state")