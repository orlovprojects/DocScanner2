"""
DU admin (tik superuser): įmonių apžvalga, klaidos, įkelti failai, „Žiūrėti kaip“ vartotojų paieška.
Keliai /admin/du/... visada vykdomi tikru vartotoju (view_as.EXEMPT).
"""
import io
import json
import logging
from datetime import timedelta

from django.db.models import F, Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .admin_tools import archive_content

logger = logging.getLogger("docscanner_app")

PAGE = 50
SUBMITTED = ("submitted", "accepted")


def _forbidden():
    return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)


def _dt(v):
    return v.isoformat() if v else None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_du_whoami(request):
    """Tikras vartotojas (ir „Žiūrėti kaip“ metu) - ar rodyti Admin meniu."""
    u = request.user
    return Response({"id": u.id, "email": u.email, "is_superuser": bool(u.is_superuser)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_du_users(request):
    """?q= el. paštas, įmonės pavadinimas ar kodas -> vartotojai su įmonėmis."""
    if not request.user.is_superuser:
        return _forbidden()
    from docscanner_app.models import CustomUser
    q = (request.GET.get("q") or "").strip()
    qs = CustomUser.objects.all()
    if q:
        qs = qs.filter(Q(email__icontains=q) | Q(company_profiles__name__icontains=q)
                       | Q(company_profiles__company_code__icontains=q)).distinct()
    qs = qs.order_by(F("last_login").desc(nulls_last=True)).prefetch_related("company_profiles")[:20]
    return Response([{
        "id": u.id, "email": u.email, "name": f"{u.first_name or ''} {u.last_name or ''}".strip(),
        "last_login": _dt(u.last_login),
        "profiles": [{"id": p.id, "name": p.name, "company_code": p.company_code or "",
                      "accounting_program": p.accounting_program or ""} for p in u.company_profiles.all()],
    } for u in qs])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_du_companies(request):
    """Visos įmonės su DokSkenas ERP: darbuotojai, perėjimas, DU, deklaracijos, klaidos, failai."""
    if not request.user.is_superuser:
        return _forbidden()
    from django.db.models import Exists, OuterRef
    from docscanner_app.models import (CompanyProfile, Employee, PayrollDeclaration, PayrollErrorLog,
                                       PayrollMigration, PayrollRun, PayrollUploadArchive, Roster, RosterShift,
                                       TimesheetEntry, TimesheetMonth)
    q = (request.GET.get("q") or "").strip()
    cps = CompanyProfile.objects.filter(accounting_program="dokskenas_erp").select_related("user")
    if q:
        cps = cps.filter(Q(name__icontains=q) | Q(company_code__icontains=q) | Q(user__email__icontains=q))
    today = timezone.localdate()
    week = timezone.now() - timedelta(days=7)
    rows = []
    for cp in cps.order_by("-id")[:300]:
        emps = Employee.objects.filter(company=cp)
        m = PayrollMigration.objects.filter(company=cp).first()
        runs = PayrollRun.objects.filter(company=cp, kind="regular")
        run = runs.order_by("-year", "-month", "-id").first()
        # grafikas - tik mėnesiai su pamainomis; tabelis - patvirtinti arba su rankiniais įrašais
        rosters = Roster.objects.filter(company=cp).filter(Exists(RosterShift.objects.filter(roster=OuterRef("pk"))))
        sheets = TimesheetMonth.objects.filter(company=cp).filter(
            Q(status__in=("approved", "locked")) | Exists(TimesheetEntry.objects.filter(timesheet=OuterRef("pk"))))
        roster = _month_state(rosters, ("published",))
        sheet = _month_state(sheets, ("approved", "locked"))
        payroll = _month_state(runs, ("approved", "paid", "closed"))
        if payroll:
            payroll["warnings"] = len(run.warnings or [])
        decl = PayrollDeclaration.objects.filter(company=cp).exclude(status__in=SUBMITTED)
        errs = PayrollErrorLog.objects.filter(company=cp)
        ups = PayrollUploadArchive.objects.filter(company=cp)
        last_err = errs.order_by("-created_at").values_list("created_at", flat=True).first()
        last_up = ups.order_by("-last_uploaded_at").values_list("last_uploaded_at", flat=True).first()
        last_roster = rosters.order_by("-updated_at").values_list("updated_at", flat=True).first()
        activity = max([d for d in (run and run.updated_at, m and m.updated_at, last_err, last_up, last_roster) if d],
                       default=None)
        rows.append({
            "company_id": cp.id, "company_name": cp.name, "company_code": cp.company_code or "",
            "user_id": cp.user_id, "user_email": cp.user.email,
            "employees": emps.count(), "employees_active": emps.filter(status="active").count(),
            "migration": None if m is None else {
                "status": m.status, "mode": getattr(m, "mode", ""), "du_start": _dt(m.du_start),
                "files": m.files.count(), "people": m.people.count(), "updated_at": _dt(m.updated_at)},
            "roster": roster, "timesheet": sheet, "payroll": payroll,
            "plan": _plan(cp),
            "declarations_errors": decl.exclude(errors=[]).count(),
            "declarations_overdue": decl.filter(deadline__lt=today).count(),
            "errors_7d": errs.filter(created_at__gte=week).count(),
            "errors_500_7d": errs.filter(created_at__gte=week, status__gte=500).count(),
            "uploads": ups.count(), "uploads_failed": ups.filter(parsed=False).count(),
            "last_activity": _dt(activity),
        })
    rows.sort(key=lambda r: r["last_activity"] or "", reverse=True)
    return Response(rows)


def _plan(cp):
    try:
        from .billing import payroll_access
        a = payroll_access(cp)
        return {k: _dt(v) if hasattr(v, "isoformat") else v for k, v in a.items()
                if k in ("state", "days_left", "trial_ends_at", "current_period_end", "employees", "price",
                         "billed_employees", "cancel_at_period_end")}
    except Exception:
        return None


def _ym(o):
    return f"{o.year}-{o.month:02d}" if o else None


def _month_state(qs, done_statuses):
    """Paskutinis mėnuo (su būsena) ir iki kurio mėnesio patvirtinta / paskelbta."""
    last = qs.order_by("-year", "-month").first()
    if last is None:
        return None
    done = qs.filter(status__in=done_statuses).order_by("-year", "-month").first()
    return {"ym": _ym(last), "status": last.status, "done_until": _ym(done),
            "updated_at": _dt(getattr(last, "updated_at", None) or getattr(last, "approved_at", None))}


def _reach(qs, company="company"):
    """Kiek įrašų, įmonių (profilių) ir vartotojų."""
    return {"count": qs.count(), "profiles": qs.values(company).distinct().count(),
            "users": qs.values(f"{company}__user").distinct().count()}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_du_stats(request):
    """Admin skydelis: DU modulio aktyvumas ir prenumeratos (visos įmonės)."""
    if not request.user.is_superuser:
        return _forbidden()
    from django.db.models import Exists, OuterRef
    from docscanner_app.models import (DasDocument, EmploymentContract, PayrollMigration, PayrollRun,
                                       PayrollSubscription, Roster, RosterShift, TimesheetMonth)
    from .billing import price_for
    today = timezone.localdate()
    now = timezone.now()

    rosters = Roster.objects.filter(Exists(RosterShift.objects.filter(roster=OuterRef("pk"))))
    sheets = TimesheetMonth.objects.filter(status__in=("approved", "locked"))
    runs = PayrollRun.objects.filter(kind="regular", status__in=("approved", "paid", "closed"))
    mig_started = PayrollMigration.objects.filter(Q(files__isnull=False) | Q(people__isnull=False)).distinct()
    mig_done = PayrollMigration.objects.filter(status="confirmed")
    contracts = (EmploymentContract.objects.exclude(status="draft").filter(start_date__lte=today)
                 .filter(Q(termination_date__isnull=True) | Q(termination_date__gte=today))
                 .filter(Q(end_date__isnull=True) | Q(end_date__gte=today)))
    active = {"count": contracts.values("employee").distinct().count(),
              "profiles": contracts.values("employee__company").distinct().count(),
              "users": contracts.values("employee__company__user").distinct().count()}

    subs = PayrollSubscription.objects.all()
    paid = subs.filter(status__in=("active", "past_due")).exclude(stripe_subscription_id="")
    mrr = sum(price_for(n) for n in paid.values_list("billed_employees", flat=True))
    return Response({
        "activity": {
            "rosters": _reach(rosters), "timesheets": _reach(sheets), "payroll_runs": _reach(runs),
            "migrations_started": _reach(mig_started), "migrations_done": _reach(mig_done),
            "das_approved": _reach(DasDocument.objects.all()), "active_employees": active,
        },
        "subscriptions": {
            "trial_active": subs.filter(status="trial", trial_ends_at__gt=now).count(),
            "trial_expired": subs.filter(status="trial", trial_ends_at__lte=now).count(),
            "paid_monthly": paid.count(),
            "canceling": paid.filter(cancel_at_period_end=True).count(),
            "past_due": subs.filter(status="past_due").count(),
            "canceled": subs.filter(status="canceled").count(),
            "mrr": mrr,
        },
    })


def _cursor(qs, request):
    before = request.GET.get("before")
    if before:
        qs = qs.filter(id__lt=int(before))
    items = list(qs.order_by("-id")[:PAGE + 1])
    return items[:PAGE], (items[PAGE - 1].id if len(items) > PAGE else None)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_du_errors(request):
    """?company= &kind=4xx|5xx &q= &before=<id>"""
    if not request.user.is_superuser:
        return _forbidden()
    from docscanner_app.models import PayrollErrorLog
    qs = PayrollErrorLog.objects.select_related("user", "impersonator", "company")
    if request.GET.get("company"):
        qs = qs.filter(company_id=request.GET["company"])
    kind = request.GET.get("kind")
    if kind == "5xx":
        qs = qs.filter(status__gte=500)
    elif kind == "4xx":
        qs = qs.filter(status__lt=500)
    q = (request.GET.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(path__icontains=q) | Q(message__icontains=q))
    items, nxt = _cursor(qs, request)
    return Response({"next": nxt, "items": [{
        "id": e.id, "created_at": _dt(e.created_at), "status": e.status, "method": e.method, "path": e.path,
        "error_type": e.error_type, "message": e.message, "traceback": e.traceback, "payload": e.payload,
        "company_id": e.company_id, "company_name": e.company.name if e.company else "",
        "user_email": e.user.email if e.user else "", "user_id": e.user_id,
        "impersonator_email": e.impersonator.email if e.impersonator else "",
    } for e in items]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_du_uploads(request):
    """?company= &source= &failed=1 &q= &before=<id>"""
    if not request.user.is_superuser:
        return _forbidden()
    from docscanner_app.models import PayrollUploadArchive
    qs = PayrollUploadArchive.objects.select_related("user", "company")
    if request.GET.get("company"):
        qs = qs.filter(company_id=request.GET["company"])
    if request.GET.get("source"):
        qs = qs.filter(source=request.GET["source"])
    if request.GET.get("failed") == "1":
        qs = qs.filter(parsed=False)
    q = (request.GET.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(file_name__icontains=q) | Q(form__icontains=q))
    items, nxt = _cursor(qs, request)
    return Response({"next": nxt, "items": [{
        "id": a.id, "created_at": _dt(a.created_at), "last_uploaded_at": _dt(a.last_uploaded_at),
        "source": a.source, "source_label": a.get_source_display(), "file_name": a.file_name, "form": a.form,
        "size": a.size, "parsed": a.parsed, "error": a.error, "meta": a.meta, "times": a.times,
        "company_id": a.company_id, "company_name": a.company.name if a.company else "",
        "user_id": a.user_id, "user_email": a.user.email if a.user else "",
    } for a in items]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_du_upload_download(request, pk):
    if not request.user.is_superuser:
        return _forbidden()
    from docscanner_app.models import PayrollUploadArchive
    a = PayrollUploadArchive.objects.filter(pk=pk).first()
    if a is None:
        return Response({"detail": "Nerasta"}, status=404)
    return FileResponse(io.BytesIO(archive_content(a)), as_attachment=True, filename=a.file_name or f"{a.sha1}.bin")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_du_upload_reparse(request, pk):
    """Perskaityti archyvo failą dabartine parserio versija (nieko nekeičia vartotojo duomenyse)."""
    if not request.user.is_superuser:
        return _forbidden()
    from docscanner_app.models import PayrollUploadArchive
    a = PayrollUploadArchive.objects.filter(pk=pk).first()
    if a is None:
        return Response({"detail": "Nerasta"}, status=404)
    raw = archive_content(a)
    safe = lambda v: json.loads(json.dumps(v, default=str, ensure_ascii=False))   # noqa: E731
    try:
        if a.source == "excel":
            from .migration.excel import parse
            rows, errors = parse(io.BytesIO(raw))
            result = {"form": "Excel šablonas", "rows": len(rows), "errors": errors[:30], "sample": safe(rows[:5])}
        elif a.source in ("sick_import", "s47"):
            from . import sick_import, sodra_tariffs
            rows = sodra_tariffs.parse(raw)
            if rows is not None:
                result = {"form": "S47", "rows": len(rows), "sample": safe(rows[:5])}
            else:
                certs, ok = sick_import.parse(raw)          # tik skaitymas, be DB
                result = {"form": "S15" if ok else None, "rows": len(certs or []), "sample": safe(list(certs or [])[:5]),
                          **({} if ok else {"error": "Ne S15 ataskaita"})}
        else:
            from .migration import ffparse
            p = ffparse.parse(raw, a.file_name)
            result = {"form": None, "error": "Neatpažinta forma"} if p is None else {
                "form": p.form, "version": p.version, "year": p.year, "month": p.month,
                "period": [str(x) if x else None for x in (p.period or (None, None))],
                "header": safe(p.header), "rows": len(p.rows), "sample": safe(p.rows[:5])}
    except Exception as e:
        logger.exception("reparse %s", pk)
        result = {"error": f"{type(e).__name__}: {e}"}
    return Response(result)
