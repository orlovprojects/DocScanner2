"""
esavitarna.lt API (/api/savitarna/...). Autentifikacija - tik EmployeeSessionAuthentication.
"""
import logging
from datetime import date, timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from django.http import HttpResponse

from ..models import EmployeeAccount, EmployeeAccountToken, EmployeeChild, EmployeeRequest, EmployeeSession, PayrollRun
from . import services as payroll_services
from .averages import ChildInfo, parent_day_entitlement
from .savitarna_auth import (
    COOKIE_NAME, LOCK_MINUTES, MAX_FAILED, EmployeeSessionAuthentication, HasActiveEmployee, IsEmployee,
    base_url, create_session, employee_access_allowed, hash_token, normalize_login, password_problem,
)
from .savitarna_emails import notify_accountant, send_password_reset
from .savitarna_utils import iban_ok

logger = logging.getLogger("docscanner_app")


class SavitarnaView(APIView):
    authentication_classes = [EmployeeSessionAuthentication]
    permission_classes = [IsEmployee]


class PublicView(APIView):
    authentication_classes = [EmployeeSessionAuthentication]
    permission_classes = [AllowAny]

    def initial(self, request, *args, **kwargs):
        # CSRF: rašymo užklausos tik iš mūsų programėlės (kitos svetainės negali siųsti šios antraštės)
        if request.method not in ("GET", "HEAD", "OPTIONS") and \
                request.META.get("HTTP_X_REQUESTED_WITH") != "esavitarna":
            raise ValidationError("Neteisinga užklausa")
        super().initial(request, *args, **kwargs)


def _company_name(company):
    for n in ("name", "company_name"):
        v = getattr(company, n, None)
        if v:
            return str(v)
    return str(company)


def _valid_token(raw, kind):
    t = (EmployeeAccountToken.objects.select_related("account", "employee__company")
         .filter(token_hash=hash_token(raw or ""), kind=kind, used_at__isnull=True,
                 expires_at__gt=timezone.now()).first())
    if t is None:
        raise ValidationError({"token": "Nuoroda nebegalioja. Paprašykite naujos."})
    return t


# ============================================================
# Prisijungimas
# ============================================================

class InviteCheckView(PublicView):
    def post(self, request):
        t = _valid_token(request.data.get("token"), "invite")
        return Response({
            "first_name": t.employee.first_name if t.employee else "",
            "company": _company_name(t.employee.company) if t.employee else "",
            "login": t.account.login,
            "has_password": bool(t.account.password),
        })


class InviteAcceptView(PublicView):
    @transaction.atomic
    def post(self, request):
        t = _valid_token(request.data.get("token"), "invite")
        acc = t.account
        pw = request.data.get("password", "")
        if acc.password:
            if not check_password(pw, acc.password):
                raise ValidationError({"password": "Neteisingas slaptažodis"})
        else:
            problem = password_problem(pw)
            if problem:
                raise ValidationError({"password": problem})
            acc.password = make_password(pw)
            acc.save(update_fields=["password"])
        t.used_at = timezone.now()
        t.save(update_fields=["used_at"])
        resp = Response(_me(acc, t.employee))
        create_session(resp, acc, request, t.employee)
        return resp


class LoginView(PublicView):
    def post(self, request):
        login = normalize_login(request.data.get("login"))
        pw = request.data.get("password", "")
        acc = EmployeeAccount.objects.filter(login=login, is_active=True).first()
        generic = ValidationError({"detail": "Neteisingas prisijungimas arba slaptažodis"})
        if acc is None or not acc.password:
            raise generic
        if acc.locked_until and acc.locked_until > timezone.now():
            raise ValidationError({"detail": f"Per daug bandymų. Pabandykite po {LOCK_MINUTES} min."})
        if not check_password(pw, acc.password):
            acc.failed_attempts += 1
            if acc.failed_attempts >= MAX_FAILED:
                acc.locked_until = timezone.now() + timedelta(minutes=LOCK_MINUTES)
                acc.failed_attempts = 0
            acc.save(update_fields=["failed_attempts", "locked_until"])
            raise generic
        employees = [e for e in acc.employees.select_related("company") if employee_access_allowed(e)]
        emp = employees[0] if len(employees) == 1 else None
        resp = Response(_me(acc, emp))
        create_session(resp, acc, request, emp)
        return resp


class LogoutView(SavitarnaView):
    def post(self, request):
        request.auth.revoked = True
        request.auth.save(update_fields=["revoked"])
        resp = Response(status=status.HTTP_204_NO_CONTENT)
        resp.delete_cookie(COOKIE_NAME, path="/")
        return resp


class PasswordResetRequestView(PublicView):
    def post(self, request):
        acc = EmployeeAccount.objects.filter(login=normalize_login(request.data.get("login")), is_active=True).first()
        if acc and "@" in acc.login:
            from .savitarna_auth import RESET_HOURS
            from .savitarna_utils import new_token
            raw, h = new_token()
            EmployeeAccountToken.objects.create(account=acc, kind="reset", token_hash=h,
                                                expires_at=timezone.now() + timedelta(hours=RESET_HOURS))
            send_password_reset(acc, f"{base_url()}/slaptazodis/{raw}")
        # visada tas pats atsakymas - neatskleidžiam, ar toks prisijungimas yra
        return Response({"detail": "Jei toks prisijungimas yra, išsiuntėme laišką su nuoroda."})


class PasswordResetConfirmView(PublicView):
    @transaction.atomic
    def post(self, request):
        t = _valid_token(request.data.get("token"), "reset")
        problem = password_problem(request.data.get("password"))
        if problem:
            raise ValidationError({"password": problem})
        acc = t.account
        acc.password = make_password(request.data["password"])
        acc.failed_attempts = 0
        acc.locked_until = None
        acc.save(update_fields=["password", "failed_attempts", "locked_until"])
        t.used_at = timezone.now()
        t.save(update_fields=["used_at"])
        EmployeeSession.objects.filter(account=acc).update(revoked=True)  # atsijungti visur
        employees = list(acc.employees.all())
        resp = Response(_me(acc, employees[0] if len(employees) == 1 else None))
        create_session(resp, acc, request, employees[0] if len(employees) == 1 else None)
        return resp


# ============================================================
# Aš / įmonės pasirinkimas
# ============================================================

def _me(acc, emp):
    employments = [{"id": e.id, "company": _company_name(e.company), "status": e.status,
                    "read_only": e.status == "dismissed"}
                   for e in acc.employees.select_related("company") if employee_access_allowed(e)]
    data = {"login": acc.login, "employments": employments, "employee": None}
    if emp:
        data["employee"] = {
            "id": emp.id, "first_name": emp.first_name, "last_name": emp.last_name,
            "company": _company_name(emp.company), "data_status": emp.data_status,
            "read_only": emp.status == "dismissed",
        }
    return data


class MeView(SavitarnaView):
    def get(self, request):
        return Response(_me(request.user.account, request.user.employee))


class SelectCompanyView(SavitarnaView):
    def post(self, request):
        acc = request.user.account
        emp = acc.employees.filter(id=request.data.get("employee")).first()
        if emp is None or not employee_access_allowed(emp):
            raise ValidationError({"employee": "Įmonė nerasta"})
        request.auth.active_employee = emp
        request.auth.save(update_fields=["active_employee"])
        return Response(_me(acc, emp))


class HomeView(SavitarnaView):
    permission_classes = [HasActiveEmployee]

    def get(self, request):
        emp = request.user.employee
        today = timezone.localdate()
        vac = payroll_services.vacation_for(emp, today)
        days, per = parent_day_entitlement(
            [ChildInfo(c.birth_date, c.has_disability) for c in emp.children.all()], today)
        return Response({
            "vacation_balance": str(vac.balance) if vac else None,
            "parent_days": {"days": days, "period_months": per},
            "data_status": emp.data_status,
        })


# ============================================================
# Anketa
# ============================================================

class ChildSerializer(serializers.Serializer):
    first_name = serializers.CharField(allow_blank=True, required=False, default="")
    birth_date = serializers.DateField()
    has_disability = serializers.BooleanField(required=False, default=False)


class AnketaSerializer(serializers.Serializer):
    address = serializers.CharField(max_length=255)
    iban = serializers.CharField(max_length=34)
    phone = serializers.CharField(max_length=30, allow_blank=True, required=False, default="")
    email = serializers.EmailField(allow_blank=True, required=False, default="")
    works_elsewhere_with_npd = serializers.BooleanField()
    participation_level = serializers.ChoiceField(choices=["none", "30_55", "0_25"], default="none")
    pension_accumulation = serializers.BooleanField()
    single_parent = serializers.BooleanField(required=False, default=False)
    children = ChildSerializer(many=True, required=False, default=list)

    def validate_iban(self, v):
        v = v.replace(" ", "").upper()
        if not (len(v) <= 34 and iban_ok(v)):
            raise serializers.ValidationError("Patikrinkite banko sąskaitos numerį")
        return v


class AnketaView(SavitarnaView):
    permission_classes = [HasActiveEmployee]

    def get(self, request):
        e = request.user.employee
        level = "30_55" if e.npd_mode == "d30_55" else "0_25" if e.npd_mode == "d0_25" else "none"
        return Response({
            "address": e.address, "iban": e.iban, "phone": e.phone, "email": e.email,
            "works_elsewhere_with_npd": e.npd_mode == "none", "participation_level": level,
            "pension_accumulation": e.pension_accumulation, "single_parent": e.single_parent,
            "children": [{"first_name": c.first_name, "birth_date": c.birth_date, "has_disability": c.has_disability}
                         for c in e.children.all()],
            "data_status": e.data_status,
        })

    @transaction.atomic
    def put(self, request):
        e = request.user.employee
        if e.status == "dismissed":
            raise ValidationError("Duomenų keisti nebegalima")
        ser = AnketaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        level = d["participation_level"]
        e.address, e.iban = d["address"].strip(), d["iban"]
        e.phone = d["phone"] or e.phone
        e.email = d["email"] or e.email
        e.npd_mode = ("none" if d["works_elsewhere_with_npd"]
                      else "d30_55" if level == "30_55" else "d0_25" if level == "0_25" else "standard")
        e.has_disability = level != "none"
        e.pension_accumulation = d["pension_accumulation"]
        e.single_parent = d["single_parent"]
        e.npd_request_date = e.npd_request_date or date.today()
        first_time = e.data_status != "complete"
        e.data_status = "complete"
        e.save()
        e.children.all().delete()
        EmployeeChild.objects.bulk_create([EmployeeChild(employee=e, **c) for c in d["children"]])
        notify_accountant(
            e, f"{e.full_name}: " + ("užpildyta anketa" if first_time else "pakeisti duomenys"),
            f"{e.full_name} {'užpildė savo anketą' if first_time else 'pakeitė savo duomenis'} esavitarna.lt.\n"
            "Duomenys jau matomi darbuotojo kortelėje DokSkenas.",
        )
        return Response({"ok": True, "data_status": e.data_status})


# ============================================================
# Prašymai
# ============================================================

def _req_json(r):
    return {"id": r.id, "kind": r.kind, "kind_label": r.get_kind_display(), "start_date": r.start_date,
            "end_date": r.end_date, "work_days": str(r.work_days), "status": r.status,
            "status_label": r.get_status_display(), "reject_reason": r.reject_reason,
            "comment": r.comment, "answer": r.answer, "created_at": r.created_at}


def _parse_dates(data):
    try:
        end = date.fromisoformat(data.get("end_date") or data.get("start_date"))
        start = date.fromisoformat(data.get("start_date") or data.get("end_date"))
    except (TypeError, ValueError):
        raise ValidationError("Nurodykite datas")
    return start, end


class RequestPreviewView(SavitarnaView):
    permission_classes = [HasActiveEmployee]

    def post(self, request):
        start, end = _parse_dates(request.data)
        return Response(payroll_services.request_preview(request.user.employee, request.data.get("kind"), start, end))


class RequestListView(SavitarnaView):
    permission_classes = [HasActiveEmployee]

    def get(self, request):
        qs = EmployeeRequest.objects.filter(employee=request.user.employee)[:50]
        return Response([_req_json(r) for r in qs])

    def post(self, request):
        emp = request.user.employee
        if emp.status == "dismissed":
            raise ValidationError("Prašymų teikti nebegalima")
        start, end = _parse_dates(request.data)
        from .savitarna_auth import _ip
        try:
            r = payroll_services.create_request(emp, request.data.get("kind"), start, end,
                                                request.data.get("comment", ""), _ip(request),
                                                request.META.get("HTTP_USER_AGENT", ""))
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(_req_json(r), status=status.HTTP_201_CREATED)


class RequestCancelView(SavitarnaView):
    permission_classes = [HasActiveEmployee]

    def post(self, request, pk):
        r = EmployeeRequest.objects.filter(id=pk, employee=request.user.employee).first()
        if r is None or r.status != "pending":
            raise ValidationError("Atšaukti galima tik dar nepatvirtintą prašymą")
        r.status = "cancelled"
        r.save(update_fields=["status"])
        return Response(_req_json(r))


# ============================================================
# Atsiskaitymo lapeliai
# ============================================================

def _closed_runs_for(emp):
    return (PayrollRun.objects.filter(company=emp.company, kind="regular", status__in=("approved", "paid", "closed"),
                                      results__employee=emp).order_by("-year", "-month").distinct())


class PayslipListView(SavitarnaView):
    permission_classes = [HasActiveEmployee]

    def get(self, request):
        emp = request.user.employee
        out = []
        for run in _closed_runs_for(emp)[:36]:
            res = run.results.filter(employee=emp).first()
            out.append({"run": run.id, "year": run.year, "month": run.month,
                        "net": str(res.net), "payable": str(res.payable), "gross": str(res.gross)})
        return Response(out)


class PayslipDetailView(SavitarnaView):
    permission_classes = [HasActiveEmployee]

    def _data(self, request, run_id):
        emp = request.user.employee
        run = _closed_runs_for(emp).filter(id=run_id).first()
        data = payroll_services.payslip_data(run, emp) if run else None
        if data is None:
            raise ValidationError("Lapelis nerastas")
        return data

    def get(self, request, run_id):
        d = self._data(request, run_id)
        if request.query_params.get("html"):
            from .requests_logic import render_payslip_html
            return HttpResponse(render_payslip_html(d), content_type="text/html; charset=utf-8")
        return Response({
            "year": d.year, "month": d.month, "position": d.position,
            "earnings": [{"name": n, "qty": q, "amount": str(a)} for n, q, a in d.earnings],
            "deductions": [{"name": n, "amount": str(a)} for n, a in d.deductions],
            "gross": str(d.gross), "net": str(d.net), "payable": str(d.payable),
            "worked_days": d.worked_days, "worked_hours": str(d.worked_hours),
        })
