"""Celery: pateiktų deklaracijų būsenų tikrinimas (VMI EDS)."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("docscanner_app")


@shared_task
def poll_submitted_declarations():
    """Kas 30 min.: pateiktos (laukiančios patvirtinimo / apdorojimo) GPM313 per paskutines 10 d."""
    from docscanner_app.models import PayrollDeclaration
    from docscanner_app.payroll.services import check_declaration_state
    since = timezone.now() - timedelta(days=10)
    qs = PayrollDeclaration.objects.filter(form="GPM313", status="submitted", submitted_at__gte=since) \
        .exclude(external_id="").select_related("company")
    for d in qs:
        try:
            check_declaration_state(d)
        except Exception:  # noqa: BLE001 - viena įmonė neturi stabdyti kitų
            logger.exception("poll_submitted_declarations: decl=%s", d.id)
