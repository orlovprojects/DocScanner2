"""
DU modulio API (views). Maršrutai registruojami docscanner_app/urls.py.
"""
import logging
from datetime import date as _date

from django.db.models import Q
from rest_framework import status as drf_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import FileResponse, HttpResponse, JsonResponse
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from ..models import (
    DasDocument, EmployeeDocument, EmployeeRequest, PayrollDeclaration, PositionGroup,
    AbsenceEvent, ContractTerms, Employee, EmployeeChild, EmploymentContract, PayCode,
    PayrollLine, PayrollRun, PayrollSettings, Position, TimesheetEntry, TimesheetMonth, WorkSchedule,
)
from . import services as payroll_services
from .work_calendar import work_days_between
from .serializers import (
    DasDocumentSerializer, EmployeeDocumentSerializer, EmployeeRequestSerializer, PositionGroupSerializer,
    AbsenceEventSerializer, ContractTermsSerializer, EmployeeChildSerializer, EmployeeDetailSerializer,
    EmployeeListSerializer, EmploymentContractSerializer, PayCodeSerializer,
    PayrollEmployeeResultSerializer, PayrollLineSerializer, PayrollRunSerializer,
    PayrollSettingsSerializer, PositionSerializer, WorkScheduleSerializer,
)

logger = logging.getLogger("docscanner_app")


class PayrollCompanyMixin:
    """Visi DU duomenys - tik aktyvaus CompanyProfile."""
    permission_classes = [IsAuthenticated]

    def get_company(self):
        cp = getattr(self.request.user, "active_company_profile", None)
        if cp is None:
            raise ValidationError("Nepasirinkta aktyvi įmonė")
        return cp

    def check_employee(self, employee):
        if employee is not None and employee.company_id != self.get_company().id:
            raise PermissionDenied("Darbuotojas priklauso kitai įmonei")


# ---------- Nustatymai / žinynai ----------

class PayrollSettingsView(PayrollCompanyMixin, APIView):
    def get(self, request):
        company = self.get_company()
        obj, _ = PayrollSettings.objects.get_or_create(company=company)
        payroll_services.fill_sodra_code(company, obj)
        return Response(PayrollSettingsSerializer(obj).data)

    def put(self, request):
        obj, _ = PayrollSettings.objects.get_or_create(company=self.get_company())
        ser = PayrollSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class WorkScheduleViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = WorkScheduleSerializer

    def get_queryset(self):
        return WorkSchedule.objects.filter(company=self.get_company())

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())


class PositionViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = PositionSerializer

    def get_queryset(self):
        return Position.objects.filter(company=self.get_company())

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())


class PayCodeViewSet(PayrollCompanyMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = PayCodeSerializer

    def get_queryset(self):
        qs = PayCode.objects.filter(Q(company__isnull=True) | Q(company=self.get_company()), active=True)
        category = self.request.query_params.get("category")
        return qs.filter(category=category) if category else qs


# ---------- Darbuotojai ----------

class EmployeeViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):

    def get_serializer_class(self):
        return EmployeeListSerializer if self.action == "list" else EmployeeDetailSerializer

    def get_queryset(self):
        qs = Employee.objects.filter(company=self.get_company())
        p = self.request.query_params
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("q"):
            qs = qs.filter(Q(first_name__icontains=p["q"]) | Q(last_name__icontains=p["q"]))
        return qs.prefetch_related("contracts__terms__position", "children")

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())

    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        """Pakviesti į esavitarna.lt (laiškas + nuoroda, kurią galima nusiųsti ir rankiniu būdu)."""
        emp = self.get_object()
        try:
            url, sent = payroll_services.invite_employee(emp, request.user)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"link": url, "sent": sent, "savitarna_status": payroll_services.savitarna_status(emp)})

    @action(detail=True, methods=["get", "post"])
    def vacation(self, request, pk=None):
        """
        GET  ?date=YYYY-MM-DD[&from=..&to=..] -> likutis (+ prašomų dienų skaičius)
        POST {date, balance}                  -> nustatyti likutį (sukuria korekciją)
        """
        emp = self.get_object()
        try:
            if request.method == "POST":
                b = payroll_services.set_vacation_balance(
                    emp, _date.fromisoformat(request.data["date"]), request.data["balance"])
            else:
                d = request.query_params.get("date")
                b = payroll_services.vacation_for(emp, _date.fromisoformat(d) if d else _date.today())
        except (KeyError, ValueError) as e:
            raise ValidationError(str(e))
        if b is None:
            return Response({"balance": None})
        data = {"date": b.on_date.isoformat(), "accrued": str(b.accrued), "used": str(b.used),
                "adjustments": str(b.adjustments), "balance": str(b.balance), "excluded_days": b.excluded_days}
        contract = emp.contracts.exclude(status="draft").order_by("-start_date").first()
        if contract:
            ent = payroll_services.leave_entitlement(emp, contract, b.on_date)
            data["entitlement"] = {"total": ent.total, "parts": [{"days": d, "reason": r} for d, r in ent.parts]}
        f, t = request.query_params.get("from"), request.query_params.get("to")
        if f and t:
            data["requested"] = str(payroll_services.requested_vacation_days(
                emp, _date.fromisoformat(f), _date.fromisoformat(t)))
        return Response(data)


class EmployeeChildViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = EmployeeChildSerializer

    def get_queryset(self):
        qs = EmployeeChild.objects.filter(employee__company=self.get_company())
        emp = self.request.query_params.get("employee")
        return qs.filter(employee_id=emp) if emp else qs

    def perform_create(self, serializer):
        self.check_employee(serializer.validated_data.get("employee"))
        serializer.save()


class EmploymentContractViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = EmploymentContractSerializer

    def get_queryset(self):
        qs = EmploymentContract.objects.filter(employee__company=self.get_company()).prefetch_related("terms")
        emp = self.request.query_params.get("employee")
        return qs.filter(employee_id=emp) if emp else qs

    def perform_create(self, serializer):
        self.check_employee(serializer.validated_data.get("employee"))
        serializer.save()

    def perform_update(self, serializer):
        self.check_employee(serializer.validated_data.get("employee", serializer.instance.employee))
        serializer.save()


    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """Sugeneruoti darbo sutarties dokumentą iš kortelės duomenų."""
        doc, missing = payroll_services.generate_contract_document(self.get_object(), request.user)
        return Response({"document": EmployeeDocumentSerializer(doc).data, "missing": missing})


class ContractTermsViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = ContractTermsSerializer

    def get_queryset(self):
        qs = ContractTerms.objects.filter(contract__employee__company=self.get_company())
        c = self.request.query_params.get("contract")
        return qs.filter(contract_id=c) if c else qs

    def perform_create(self, serializer):
        self.check_employee(serializer.validated_data["contract"].employee)
        serializer.save()


# ---------- Įvykiai ----------

class AbsenceEventViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = AbsenceEventSerializer

    def get_queryset(self):
        qs = AbsenceEvent.objects.filter(employee__company=self.get_company()).select_related("employee")
        p = self.request.query_params
        if p.get("employee"):
            qs = qs.filter(employee_id=p["employee"])
        if p.get("kind"):
            qs = qs.filter(kind=p["kind"])
        if p.get("year") and p.get("month"):
            first, last = payroll_services.month_bounds(int(p["year"]), int(p["month"]))
            qs = qs.filter(start_date__lte=last, end_date__gte=first)
        return qs

    def _save(self, serializer):
        self.check_employee(serializer.validated_data.get("employee", getattr(serializer.instance, "employee", None)))
        obj = serializer.save()
        obj.work_days = work_days_between(obj.start_date, obj.end_date)
        obj.save(update_fields=["work_days"])

    perform_create = _save
    perform_update = _save


# ---------- Tabelis ----------

class TimesheetView(PayrollCompanyMixin, APIView):
    """
    GET  ?year=2026&month=10                    -> sugeneruotas tabelis
    POST {employee, date, code, hours, hour_type} -> rankinis pakeitimas
    DELETE {employee, date, hour_type}          -> pašalinti pakeitimą
    """

    def _month(self, d):
        tm, _ = TimesheetMonth.objects.get_or_create(company=self.get_company(), year=d.year, month=d.month)
        if tm.status == "locked":
            raise ValidationError("Tabelis užrakintas")
        return tm

    def get(self, request):
        try:
            year, month = int(request.query_params["year"]), int(request.query_params["month"])
        except (KeyError, ValueError):
            raise ValidationError("Nurodykite year ir month")
        return Response(payroll_services.timesheet_for(self.get_company(), year, month))

    def post(self, request):
        emp = Employee.objects.filter(id=request.data.get("employee"), company=self.get_company()).first()
        if emp is None:
            raise ValidationError("Darbuotojas nerastas")
        d = _date.fromisoformat(request.data["date"])
        tm = self._month(d)
        hour_type = request.data.get("hour_type", "normal")
        entry, _ = TimesheetEntry.objects.update_or_create(
            timesheet=tm, employee=emp, date=d, hour_type=hour_type,
            defaults={"code": request.data.get("code", "FD"), "hours": request.data.get("hours", 0),
                      "is_manual": True},
        )
        return Response({"id": entry.id}, status=drf_status.HTTP_201_CREATED)

    def delete(self, request):
        d = _date.fromisoformat(request.data["date"])
        tm = self._month(d)
        TimesheetEntry.objects.filter(
            timesheet=tm, employee_id=request.data.get("employee"), date=d,
            hour_type=request.data.get("hour_type", "normal"), employee__company=self.get_company(),
        ).delete()
        return Response(status=drf_status.HTTP_204_NO_CONTENT)


# ---------- Mėnesio DU ----------

class PayrollRunViewSet(PayrollCompanyMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = PayrollRunSerializer

    def get_queryset(self):
        return PayrollRun.objects.filter(company=self.get_company())

    @action(detail=False, methods=["post"])
    def prepare(self, request):
        """Sukurti (arba paimti) mėnesio DU ir perskaičiuoti."""
        try:
            year, month = int(request.data["year"]), int(request.data["month"])
        except (KeyError, ValueError):
            raise ValidationError("Nurodykite year ir month")
        run = payroll_services.get_or_create_run(self.get_company(), year, month)
        if run.status == "draft":
            payroll_services.recalculate_run(run)
        return Response(PayrollRunSerializer(run).data)

    @action(detail=True, methods=["post"])
    def recalculate(self, request, pk=None):
        run = self.get_object()
        try:
            payroll_services.recalculate_run(run)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(PayrollRunSerializer(run).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        run = self.get_object()
        try:
            payroll_services.approve_run(run, request.user)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(PayrollRunSerializer(run).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        run = self.get_object()
        try:
            payroll_services.reopen_run(run)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(PayrollRunSerializer(run).data)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        run = self.get_object()
        qs = run.results.select_related("employee").order_by("employee__last_name")
        return Response(PayrollEmployeeResultSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def sdup(self, request, pk=None):
        """SDUP JSON: ?download=1 - failas, kitaip {data, errors} peržiūrai."""
        run = self.get_object()
        data, errors = payroll_services.sdup_for_run(run)
        if request.query_params.get("download"):
            if errors:
                raise ValidationError({"errors": errors})
            resp = JsonResponse(data, json_dumps_params={"ensure_ascii": False, "indent": 1})
            resp["Content-Disposition"] = f'attachment; filename="SDUP_{run.year}-{run.month:02d}.json"'
            return resp
        return Response({"data": data, "errors": errors})

    @action(detail=True, methods=["get"])
    def lines(self, request, pk=None):
        run = self.get_object()
        qs = run.lines.select_related("pay_code")
        emp = request.query_params.get("employee")
        if emp:
            qs = qs.filter(employee_id=emp)
        return Response(PayrollLineSerializer(qs, many=True).data)


class PayrollLineViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    """Tik rankinės eilutės (premijos, dovanos, išskaitos, avansas) juodraščio DU."""
    serializer_class = PayrollLineSerializer
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        return PayrollLine.objects.filter(run__company=self.get_company(), is_manual=True).select_related("pay_code")

    def _check(self, run, employee):
        if run.company_id != self.get_company().id:
            raise PermissionDenied("Svetimas DU")
        if run.status != "draft":
            raise ValidationError("DU jau patvirtintas - pirmiausia atidarykite")
        self.check_employee(employee)

    def perform_create(self, serializer):
        run, emp = serializer.validated_data["run"], serializer.validated_data["employee"]
        self._check(run, emp)
        serializer.save(is_manual=True, accrual_month=_date(run.year, run.month, 1))

    def perform_update(self, serializer):
        self._check(serializer.instance.run, serializer.instance.employee)
        serializer.save()

    def perform_destroy(self, instance):
        self._check(instance.run, instance.employee)
        instance.delete()



# ---------- Darbo apmokėjimo sistema ----------

class PositionGroupViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = PositionGroupSerializer

    def get_queryset(self):
        return PositionGroup.objects.filter(company=self.get_company()).prefetch_related("positions")

    def _assign(self, group, ids):
        if ids is None:
            return
        Position.objects.filter(company=self.get_company(), group=group).exclude(id__in=ids).update(group=None)
        Position.objects.filter(company=self.get_company(), id__in=ids).update(group=group)

    def perform_create(self, serializer):
        ids = serializer.validated_data.pop("position_ids", None)
        company = self.get_company()
        self._assign(serializer.save(company=company, code=payroll_services.next_group_code(company)), ids)

    def perform_update(self, serializer):
        ids = serializer.validated_data.pop("position_ids", None)
        self._assign(serializer.save(), ids)

    @action(detail=False, methods=["post"])
    def auto_create(self, request):
        n = payroll_services.auto_create_groups(self.get_company())
        return Response({"created": n})

    @action(detail=False, methods=["get"])
    def check(self, request):
        return Response(payroll_services.groups_check(self.get_company()))


class DasView(PayrollCompanyMixin, APIView):
    """
    GET  ?preview=1&date=&manager=  -> HTML peržiūra
    GET                            -> patvirtintų versijų sąrašas
    POST {approved_date, manager_name} -> patvirtinti naują versiją
    """

    def get(self, request):
        company = self.get_company()
        if request.query_params.get("preview"):
            d = request.query_params.get("date")
            ctx = payroll_services.das_context(company, _date.fromisoformat(d) if d else _date.today(),
                                               request.query_params.get("manager", ""))
            return HttpResponse(payroll_services.render_das_html(ctx), content_type="text/html; charset=utf-8")
        docs = DasDocument.objects.filter(company=company)
        return Response(DasDocumentSerializer(docs, many=True).data)

    def post(self, request):
        try:
            doc = payroll_services.approve_das(
                self.get_company(), _date.fromisoformat(request.data["approved_date"]),
                request.data.get("manager_name", ""))
        except (KeyError, ValueError) as e:
            raise ValidationError(str(e))
        return Response(DasDocumentSerializer(doc).data, status=drf_status.HTTP_201_CREATED)


class DasDocumentHtmlView(PayrollCompanyMixin, APIView):
    def get(self, request, pk):
        doc = DasDocument.objects.filter(company=self.get_company(), id=pk).first()
        if doc is None:
            raise ValidationError("Dokumentas nerastas")
        return HttpResponse(doc.html, content_type="text/html; charset=utf-8")


class LpkSearchView(PayrollCompanyMixin, APIView):
    """GET ?q=buhalt -> {positions: įmonės pareigos, lpk: profesijų klasifikatorius}"""

    def get(self, request):
        from .lpk import all_professions, normalize, search, short_title
        q = request.query_params.get("q", "").strip()
        nq = normalize(q)
        def sug(code):
            scores, note = payroll_services.suggested_scores(code)
            return {**scores, "note": note}

        positions = [
            {"id": p.id, "name": p.name, "lpk_code": p.lpk_code, "group_code": p.group.code if p.group else "",
             "suggested": sug(p.lpk_code)}
            for p in Position.objects.filter(company=self.get_company()).select_related("group")
            if not nq or nq in normalize(p.name) or (q.isdigit() and p.lpk_code.startswith(q))
        ][:10]
        lpk = [{"code": i["code"], "name": i["name"], "title": short_title(i["name"]),
                "group_name": i["group_name"], "suggested": sug(i["code"])} for i in search(q, all_professions())]
        return Response({"positions": positions, "lpk": lpk})


class LeavePreviewView(PayrollCompanyMixin, APIView):
    """
    POST {personal_code?, birth_date?, start_date, weekly_days?, has_disability?, single_parent?,
          extended_leave_days?, extra_leave_days?, seniority_since?}
    -> {total, parts} - naujo darbuotojo formai (dar neišsaugojus).
    """

    def post(self, request):
        from .personal_code import parse
        from .vacation import annual_entitlement
        d = request.data
        on = _date.fromisoformat(d.get("start_date") or _date.today().isoformat())
        bd = None
        if d.get("personal_code"):
            info = parse(d["personal_code"])
            bd = info.birth_date if info.valid else None
        if d.get("birth_date"):
            bd = _date.fromisoformat(d["birth_date"])
        since = d.get("seniority_since")
        ent = annual_entitlement(
            on, work_days_per_week=int(d.get("weekly_days") or 5), birth_date=bd,
            has_disability=bool(d.get("has_disability")), single_parent=bool(d.get("single_parent")),
            profession_days=int(d["extended_leave_days"]) if d.get("extended_leave_days") else None,
            seniority_since=_date.fromisoformat(since) if since else on,
            extra_days=int(d.get("extra_leave_days") or 0),
        )
        return Response({"total": ent.total, "parts": [{"days": x, "reason": r} for x, r in ent.parts]})


class PersonalCodeCheckView(PayrollCompanyMixin, APIView):
    """GET ?code= -> {valid, error, birth_date, gender}"""

    def get(self, request):
        from .personal_code import parse
        info = parse(request.query_params.get("code", ""))
        return Response({"valid": info.valid, "error": info.error,
                         "birth_date": info.birth_date.isoformat() if info.birth_date else None,
                         "gender": info.gender})


class EmployeeDocumentViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    """
    Darbuotojo dokumentai. Sąrašas: ?employee=&contract=&kind=
    Įkelti pasirašytą: POST {id}/upload/ (multipart: file). Peržiūra: GET {id}/html/, GET {id}/file/.
    """
    serializer_class = EmployeeDocumentSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        qs = EmployeeDocument.objects.filter(employee__company=self.get_company())
        p = self.request.query_params
        for key in ("employee", "contract", "kind"):
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        return qs

    def perform_create(self, serializer):
        self.check_employee(serializer.validated_data.get("employee"))
        f = serializer.validated_data.get("file")
        doc = serializer.save(created_by=self.request.user, file_name=f.name if f else "")
        payroll_services.mark_document_signed(doc)

    def perform_update(self, serializer):
        doc = serializer.save()
        payroll_services.mark_document_signed(doc)

    @action(detail=True, methods=["post"])
    def upload(self, request, pk=None):
        doc = self.get_object()
        ser = EmployeeDocumentSerializer(doc, data={"file": request.data.get("file")}, partial=True)
        ser.is_valid(raise_exception=True)
        f = ser.validated_data["file"]
        if doc.file:
            doc.file.delete(save=False)
        doc.file = f
        doc.file_name = f.name
        doc.save(update_fields=["file", "file_name", "updated_at"])
        return Response(EmployeeDocumentSerializer(doc).data)

    @action(detail=True, methods=["get"])
    def html(self, request, pk=None):
        doc = self.get_object()
        if not doc.html:
            raise ValidationError("Dokumentas nesugeneruotas")
        return HttpResponse(doc.html, content_type="text/html; charset=utf-8")

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        doc = self.get_object()
        if not doc.file:
            raise ValidationError("Failas neįkeltas")
        return FileResponse(doc.file.open("rb"), filename=doc.file_name or "dokumentas", as_attachment=False)


class EmployeeRequestViewSet(PayrollCompanyMixin, viewsets.ReadOnlyModelViewSet):
    """Darbuotojų prašymai iš esavitarna.lt. ?status=pending"""
    serializer_class = EmployeeRequestSerializer

    def get_queryset(self):
        qs = EmployeeRequest.objects.filter(employee__company=self.get_company()).select_related("employee")
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        try:
            warnings = payroll_services.approve_request(self.get_object(), request.user, request.data.get("answer"))
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"ok": True, "warnings": warnings})

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        try:
            payroll_services.reject_request(self.get_object(), request.user, request.data.get("reason", ""))
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"ok": True})

    @action(detail=True, methods=["get"])
    def html(self, request, pk=None):
        return HttpResponse(self.get_object().html, content_type="text/html; charset=utf-8")

    @action(detail=True, methods=["get"])
    def answer_preview(self, request, pk=None):
        """Atsakymo projektas prašymui dėl informacijos apie DU."""
        return Response({"answer": payroll_services.pay_info_answer(self.get_object().employee)})


# ---------- Deklaracijos ----------

class DeclarationsView(PayrollCompanyMixin, APIView):
    """
    GET  ?year=&month=  -> ką reikia pateikti (SAM, GPM313, 1-SD, 2-SD) ir būsenos
    POST {form, year, month, contract?, manual?} -> paruošti deklaraciją
    """

    def get(self, request):
        try:
            y, m = int(request.query_params["year"]), int(request.query_params["month"])
        except (KeyError, ValueError):
            raise ValidationError("Nurodykite year ir month")
        return Response(payroll_services.declarations_overview(self.get_company(), y, m))

    def post(self, request):
        company = self.get_company()
        d = request.data
        contract = None
        if d.get("contract"):
            contract = EmploymentContract.objects.filter(id=d["contract"], employee__company=company).first()
            if contract is None:
                raise ValidationError("Sutartis nerasta")
        try:
            obj = payroll_services.generate_declaration(
                company, d.get("form"), int(d["year"]) if d.get("year") else None,
                int(d["month"]) if d.get("month") else None, contract, d.get("manual"))
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"id": obj.id, "status": obj.status, "status_label": obj.get_status_display(),
                         "errors": obj.errors})


class DeclarationFileView(PayrollCompanyMixin, APIView):
    def get(self, request, pk):
        d = PayrollDeclaration.objects.filter(id=pk, company=self.get_company()).first()
        if d is None or not d.content:
            raise ValidationError("Deklaracija nerasta")
        name = f"{d.form}_{d.year}-{(d.month or 0):02d}" + (f"_{d.contract.employee.last_name}" if d.contract_id else "")
        resp = HttpResponse(d.content.encode("utf-8"), content_type="application/xml; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{name}.ffdata"'
        return resp


class DeclarationStatusView(PayrollCompanyMixin, APIView):
    """POST {status: submitted|accepted|rejected} - pažymėti rankiniu būdu."""

    def post(self, request, pk):
        d = PayrollDeclaration.objects.filter(id=pk, company=self.get_company()).first()
        st = request.data.get("status")
        if d is None or st not in ("submitted", "accepted", "rejected", "ready"):
            raise ValidationError("Neteisinga užklausa")
        if st == "rejected":
            reason = (request.data.get("reason") or "").strip()
            d.errors = list(d.errors or []) + [f"Atmesta: {reason or 'priežastis nenurodyta'}"]
            d.save(update_fields=["errors"])
            from .notify import notify_admin
            notify_admin(f"⚠ DokSkenas: {d.form} atmesta ({self.get_company()}, {d.year}-{d.month})\n"
                         f"Priežastis: {reason or '-'}\nDeklaracijos id: {d.id}")
        d.status = st
        if st == "submitted" and not d.submitted_at:
            from django.utils import timezone as _tz
            d.submitted_at = _tz.now()
        d.save(update_fields=["status", "submitted_at", "updated_at"])
        return Response({"id": d.id, "status": d.status, "status_label": d.get_status_display()})


class DeclarationSubmitView(PayrollCompanyMixin, APIView):
    """POST - pateikti tiesiogiai (dabar: GPM313 -> VMI EDS)."""

    def post(self, request, pk):
        d = PayrollDeclaration.objects.filter(id=pk, company=self.get_company()).first()
        if d is None:
            raise ValidationError("Deklaracija nerasta")
        try:
            payroll_services.submit_declaration(d)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"id": d.id, "status": d.status, "external_status": d.external_status,
                         "external_message": d.external_message})


class DeclarationCheckView(PayrollCompanyMixin, APIView):
    """POST - patikrinti būseną dabar."""

    def post(self, request, pk):
        from .declarations.vmi_ws import VmiError
        d = PayrollDeclaration.objects.filter(id=pk, company=self.get_company()).first()
        if d is None:
            raise ValidationError("Deklaracija nerasta")
        try:
            payroll_services.check_declaration_state(d)
        except (ValueError, VmiError) as e:
            raise ValidationError(str(e))
        return Response({"id": d.id, "status": d.status, "external_status": d.external_status})


class VmiConnectionTestView(PayrollCompanyMixin, APIView):
    """POST - patikrinti VMI EDS prisijungimą (išsaugotą)."""

    def post(self, request):
        from .declarations.vmi_ws import test_connection
        try:
            user, pw = payroll_services._vmi_credentials(self.get_company())
            ok, msg = test_connection(user, pw)
        except ValueError as e:
            ok, msg = False, str(e)
        except Exception:  # noqa: BLE001
            ok, msg = False, "VMI paslauga nepasiekiama"
        return Response({"ok": ok, "message": msg})
