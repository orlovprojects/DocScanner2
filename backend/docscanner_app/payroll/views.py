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
from django.utils import timezone
from decimal import Decimal
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

    def handle_exception(self, exc):
        from .admin_tools import log_error
        log_error(self.request, exc)
        return super().handle_exception(exc)

    def check_employee(self, employee):
        if employee is not None and employee.company_id != self.get_company().id:
            raise PermissionDenied("Darbuotojas priklauso kitai įmonei")

    def assert_company_relations(self, data):
        """Visi susiję objektai (FK / M2M) naujuose duomenyse turi priklausyti aktyviai įmonei (SEC-01)."""
        company_id = self.get_company().id
        for key, value in (data or {}).items():
            items = value if isinstance(value, (list, tuple, set)) else [value]
            for obj in items:
                owner = _owner_company_id(obj)
                if owner is _SKIP or owner is None:      # ne įmonės objektas arba bendras (pvz. sisteminis DU kodas)
                    continue
                if owner != company_id:
                    raise PermissionDenied("Susietas įrašas priklauso kitai įmonei")

    def get_serializer(self, *args, **kwargs):
        ser = super().get_serializer(*args, **kwargs)
        original_save, view = ser.save, self

        def save(**extra):
            view.assert_company_relations({**getattr(ser, "validated_data", {}), **extra})
            return original_save(**extra)

        ser.save = save
        return ser


_SKIP = object()


def _owner_company_id(obj, depth=0):
    """Kuriai įmonei priklauso objektas: tiesiai (company) arba per darbuotoją / sutartį / DU / grafiką."""
    from django.db.models import Model
    from docscanner_app.models import CompanyProfile
    if not isinstance(obj, Model) or depth > 4:
        return _SKIP
    if isinstance(obj, CompanyProfile):
        return obj.id
    if hasattr(obj, "company_id"):
        return obj.company_id
    for attr in ("employee", "contract", "run", "roster"):
        if hasattr(obj, f"{attr}_id"):
            rel = getattr(obj, attr, None)
            return _owner_company_id(rel, depth + 1) if rel is not None else _SKIP
    return _SKIP


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
        return qs.select_related("account").prefetch_related("contracts__terms__position", "children")  # PERF-01

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())

    def list(self, request, *args, **kwargs):
        """Sąrašas + lentelės laukai (sutartis, darbo laikas, atostogos, šiandien, eSavitarna, ko trūksta)."""
        from .employees_table import employees_table
        qs = list(self.filter_queryset(self.get_queryset()).prefetch_related("contracts__terms__position__group"))
        data = self.get_serializer(qs, many=True).data
        extra = employees_table(self.get_company(), qs)
        return Response([dict(row, table=extra.get(row["id"], {})) for row in data])

    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        """Pakviesti į esavitarna.lt (laiškas + nuoroda, kurią galima nusiųsti ir rankiniu būdu)."""
        emp = self.get_object()
        try:
            url, sent = payroll_services.invite_employee(emp, request.user)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"link": url, "sent": sent, "savitarna_status": payroll_services.savitarna_status(emp)})

    @action(detail=True, methods=["get"])
    def reported(self, request, pk=None):
        """Pateiktos Sodros / VMI ataskaitos su šiuo darbuotoju (keičiant asmens kodą reikės tikslinti)."""
        from .employees_table import reported_forms
        return Response(reported_forms(self.get_object()))

    @action(detail=True, methods=["get", "post"])
    def vacation(self, request, pk=None):
        """
        GET  ?date=YYYY-MM-DD[&from=..&to=..] -> likutis (+ prašomų dienų skaičius)
        POST {date, balance}                  -> nustatyti likutį (sukuria korekciją)
        POST {date, days, reason}             -> korekcija +/- dienomis
        """
        emp = self.get_object()
        try:
            if request.method == "POST" and request.data.get("days") not in (None, ""):
                b = payroll_services.adjust_vacation(
                    emp, _date.fromisoformat(request.data["date"]), request.data["days"], request.data.get("reason", ""))
            elif request.method == "POST":
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
                "adjustments": str(b.adjustments), "balance": str(b.balance), "excluded_days": b.excluded_days,
                "history": payroll_services.vacation_history(emp)}
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
        contract = self.get_object()
        doc, missing = payroll_services.generate_contract_document(contract, request.user)
        return Response({"document": EmployeeDocumentSerializer(doc).data, "missing": missing,
                         "warnings": payroll_services.contract_warnings(contract)})


class ContractTermsViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    serializer_class = ContractTermsSerializer

    def get_queryset(self):
        qs = ContractTerms.objects.filter(contract__employee__company=self.get_company())
        c = self.request.query_params.get("contract")
        return qs.filter(contract_id=c) if c else qs

    def perform_create(self, serializer):
        self.check_employee(serializer.validated_data["contract"].employee)
        payroll_services.ensure_position_group(serializer.save())

    def perform_update(self, serializer):
        payroll_services.ensure_position_group(serializer.save())


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
        emp = serializer.validated_data.get("employee", getattr(serializer.instance, "employee", None))
        self.check_employee(emp)
        v, inst = serializer.validated_data, serializer.instance
        kind = v.get("kind", getattr(inst, "kind", None))
        start = v.get("start_date", getattr(inst, "start_date", None))
        end = v.get("end_date", getattr(inst, "end_date", None))
        if kind == "business_trip" or getattr(inst, "kind", None) == "business_trip":
            raise ValidationError("Komandiruotės kuriamos ir keičiamos skiltyje „Komandiruotės“.")
        if v.get("status", getattr(inst, "status", "approved")) == "approved" and kind != "vacation_prepaid":
            errors = payroll_services.validate_absence(emp, kind, start, end, exclude_id=getattr(inst, "id", None))
            if errors:
                raise ValidationError(errors)
        old_range = (inst.start_date, inst.end_date) if inst is not None else None
        obj = serializer.save()
        obj.work_days = work_days_between(obj.start_date, obj.end_date)
        obj.save(update_fields=["work_days"])
        payroll_services.sync_absence_declarations(obj)
        payroll_services.sync_roster_absence(obj, old_range)

    perform_create = _save
    perform_update = _save

    def perform_destroy(self, instance):
        if instance.kind == "business_trip":
            raise ValidationError("Tai komandiruotė – ją atšaukite skiltyje „Komandiruotės“ "
                                  "(kartu bus pašalintas avansas ir įsakymas).")
        if instance.declarations.filter(status__in=("submitted", "accepted")).exists():
            raise ValidationError("Apie šį nebuvimą jau pranešta Sodrai. Vietoj ištrynimo pakeiskite pabaigos datą - "
                                  "bus paruoštas patikslinimas.")
        payroll_services.release_roster_absence(instance)        # pašalintos pamainos grąžinamos į grafiką
        instance.delete()


# ---------- Tabelis ----------

class TimesheetView(PayrollCompanyMixin, APIView):
    """
    GET  ?year=2026&month=10                    -> sugeneruotas tabelis
    POST {employee, date, code, hours, hour_type} -> rankinis pakeitimas
    DELETE {employee, date, hour_type}          -> pašalinti pakeitimą
    """

    def _month(self, d):
        tm, _ = TimesheetMonth.objects.get_or_create(company=self.get_company(), year=d.year, month=d.month)
        if tm.status in ("approved", "locked"):
            raise ValidationError("Tabelis patvirtintas – norėdami keisti, atšaukite patvirtinimą")
        return tm

    def get(self, request):
        try:
            year, month = int(request.query_params["year"]), int(request.query_params["month"])
        except (KeyError, ValueError):
            raise ValidationError("Nurodykite year ir month")
        data = payroll_services.timesheet_for(self.get_company(), year, month,
                                              with_meta=request.query_params.get("meta") == "1")
        if isinstance(data, dict) and isinstance(data.get("meta"), dict):
            from .roster.repair import roster_stale_flag
            from .readiness import timesheet_changes
            data["meta"]["roster_stale"] = roster_stale_flag(self.get_company(), year, month)   # Faktas: „grafikas nebeatitinka“
            tm = TimesheetMonth.objects.filter(company=self.get_company(), year=year, month=month).first()
            data["meta"]["changes"] = timesheet_changes(tm, data.get("rows") or [])          # pakeista po patvirtinimo
            from .readiness import approve_from
            af = approve_from(year, month)
            data["meta"]["approve_from"] = af.isoformat()                                   # anksčiau tvirtinti negalima
            data["meta"]["too_early"] = timezone.localdate() < af
        return Response(data)

    def post(self, request):
        act = request.data.get("action")
        if act == "trip_choice":                      # laikotarpio pabaiga: kelionių valandos - poilsiu ar viršvalandžiais
            from .roster.services import period_cfg, period_settlement
            from .roster.period import is_last_month
            emp = Employee.objects.filter(id=request.data.get("employee"), company=self.get_company()).first()
            choice = request.data.get("choice")
            if emp is None or choice not in ("rest", "overtime"):
                raise ValidationError("Neteisingi duomenys")
            y, m = int(request.data["year"]), int(request.data["month"])
            first, last = _date(y, m, 1), payroll_services.month_bounds(y, m)[1]
            contract = payroll_services._active_contract(emp, first, last)
            if contract is None:
                raise ValidationError("Darbuotojas neturi sutarties")
            months, anchor = period_cfg(contract, payroll_services._settings(self.get_company()))
            if not is_last_month(y, m, months, anchor):
                raise ValidationError("Pasirinkti galima tik paskutinį apskaitinio laikotarpio mėnesį")
            tm = self._month(first)
            choices = dict(getattr(tm, "period_trip_choices", None) or {})
            out = period_settlement(emp, contract, y, m, months, anchor)      # trip_hours nepriklauso nuo pasirinkimo
            hours = out[0].trip_hours if out else 0
            choices[str(emp.id)] = {"choice": choice, "hours": str(hours)}
            tm.period_trip_choices = choices
            tm.save(update_fields=["period_trip_choices"])
            return Response({"ok": True, "hours": str(hours)})
        if act in ("approve", "reopen"):
            try:
                payroll_services.timesheet_set_status(self.get_company(), int(request.data["year"]),
                                                      int(request.data["month"]), act == "approve",
                                                      note=request.data.get("note") or "")
            except payroll_services.TimesheetIssuesError as e:
                return Response({"detail": str(e), "issues": e.issues, "need_note": e.need_note}, status=409)
            except ValueError as e:
                raise ValidationError(str(e))
            return Response({"ok": True})
        if act in ("preview_actual", "set_actual"):    # faktinis laikas „nuo-iki“ -> valandos
            emp = Employee.objects.filter(id=request.data.get("employee"), company=self.get_company()).first()
            if emp is None:
                raise ValidationError("Darbuotojas nerastas")
            d = _date.fromisoformat(request.data["date"])
            try:
                r, rest = payroll_services.actual_hours(emp, d, request.data["start"], request.data["end"],
                                                        request.data.get("break_minutes") or 0, request.data.get("break_start"))
            except (ValueError, KeyError) as e:
                raise ValidationError(str(e) or "Patikrinkite laiką")
            if r["hours"] > 24 or r["hours"] <= 0:
                raise ValidationError("Patikrinkite laiką (0–24 val.)")
            if act == "set_actual":
                tm = self._month(d)
                detail = {"start": str(request.data["start"])[:5], "end": str(request.data["end"])[:5],
                          "break": int(request.data.get("break_minutes") or 0),
                          "break_start": str(request.data.get("break_start") or "")[:5] or None}
                TimesheetEntry.objects.update_or_create(timesheet=tm, employee=emp, date=d, hour_type="normal",
                                                        defaults={"code": "FD", "hours": r["hours"], "is_manual": True,
                                                                  "detail": detail})
                for k in ("night", "holiday", "overtime", "ot_night", "rest_day"):
                    if r[k] > 0:
                        TimesheetEntry.objects.update_or_create(timesheet=tm, employee=emp, date=d, hour_type=k,
                                                                defaults={"code": "FD", "hours": r[k], "is_manual": True})
                    else:
                        TimesheetEntry.objects.filter(timesheet=tm, employee=emp, date=d, hour_type=k).delete()
            return Response({"rest_day": rest, **{k: str(v) for k, v in r.items()}})
        if act == "reset_day":                         # grąžinti dieną pagal grafiką / kalendorių
            d = _date.fromisoformat(request.data["date"])
            tm = self._month(d)
            TimesheetEntry.objects.filter(timesheet=tm, employee_id=request.data.get("employee"), date=d,
                                          employee__company=self.get_company(), is_manual=True).delete()
            return Response({"ok": True})
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
            try:
                payroll_services.recalculate_run(run)
            except ValueError:            # tabelyje nepatvirtinti pakeitimai - paliekami ankstesni rezultatai
                pass
        return Response(PayrollRunSerializer(run).data)

    @action(detail=False, methods=["get"])
    def readiness(self, request):
        """?year=&month= -> ar galima skaičiuoti / tvirtinti DU (grafikas, tabelis, pakeitimai po patvirtinimo)."""
        from .readiness import readiness as _readiness
        try:
            year, month = int(request.query_params["year"]), int(request.query_params["month"])
        except (KeyError, ValueError):
            raise ValidationError("Nurodykite year ir month")
        return Response(_readiness(self.get_company(), year, month))

    @action(detail=False, methods=["get"])
    def period(self, request):
        """
        Nuo kurio mėnesio DU skaičiuojamas DokSkenas ir kurį mėnesį atidaryti pagal nutylėjimą.
        ?check=YYYY-MM - ar galima pradžią pakeisti (ką tai pakeis).
        """
        from .readiness import _migration_start, check_du_start_change, default_month, payroll_start
        company = self.get_company()
        if request.query_params.get("check"):
            try:
                new = _date.fromisoformat(f"{request.query_params['check'][:7]}-01")
            except ValueError:
                raise ValidationError("Neteisingas mėnuo")
            return Response(check_du_start_change(company, new))
        start, dflt = payroll_start(company), default_month(company)
        return Response({"start": f"{start:%Y-%m}" if start else None, "default": f"{dflt:%Y-%m}",
                         "from_migration": bool(_migration_start(company))})

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
            payroll_services.approve_run(run, request.user, request.data.get("advance_decisions"))
        except payroll_services.AdvanceDecisionRequired as e:
            return Response({"advances": e.items}, status=409)
        except ValueError as e:
            raise ValidationError(str(e))
        data = PayrollRunSerializer(run).data
        data["warnings"] = getattr(run, "_approve_warnings", [])
        return Response(data)

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
        # perkeliant į kitą DU / darbuotoją - tikrinamas ir naujasis
        self._check(serializer.validated_data.get("run", serializer.instance.run),
                    serializer.validated_data.get("employee", serializer.instance.employee))
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

    def list(self, request, *args, **kwargs):
        payroll_services.refresh_auto_ranges(self.get_company())      # automatinės ribos - visada aktualios
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def merge(self, request, pk=None):
        """POST {target: id} - šios grupės pareigos perkeliamos į tikslinę grupę."""
        try:
            warn = payroll_services.merge_groups(self.get_company(), int(pk), int(request.data["target"]))
        except (KeyError, ValueError, PositionGroup.DoesNotExist) as e:
            raise ValidationError(str(e) or "Grupė nerasta")
        return Response({"ok": True, "warning": warn})

    @action(detail=False, methods=["post"])
    def split(self, request):
        """POST {position: id} - pareigos į atskirą grupę."""
        try:
            g = payroll_services.split_position(self.get_company(), int(request.data["position"]))
        except (KeyError, ValueError, Position.DoesNotExist) as e:
            raise ValidationError(str(e) or "Pareigos nerastos")
        return Response(PositionGroupSerializer(g, context={"request": request}).data)


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
            import json
            qp = request.query_params
            try:
                opts = json.loads(qp.get("opts") or "{}")
            except ValueError:
                opts = {}
            ctx = payroll_services.das_context(company, _date.fromisoformat(d) if d else _date.today(),
                                               qp.get("manager", ""), qp.get("title", ""), qp.get("city", ""), opts)
            return HttpResponse(payroll_services.render_das_html(ctx), content_type="text/html; charset=utf-8")
        docs = DasDocument.objects.filter(company=company)
        return Response(DasDocumentSerializer(docs, many=True).data)

    def post(self, request):
        try:
            doc = payroll_services.approve_das(
                self.get_company(), _date.fromisoformat(request.data["approved_date"]),
                request.data.get("manager_name", ""), request.data.get("manager_title", ""),
                request.data.get("city", ""), request.data.get("settings") or {})
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
        from .roster.repair import affected_rosters
        return Response({"ok": True, "warnings": warnings, "rosters": affected_rosters(self.get_company())})

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
    def attachment(self, request, pk=None):
        from django.http import FileResponse
        r = self.get_object()
        if not r.attachment:
            raise ValidationError("Priedo nėra")
        return FileResponse(r.attachment.open("rb"), as_attachment=False, filename=r.attachment.name.rsplit("/", 1)[-1])

    @action(detail=True, methods=["get"])
    def review(self, request, pk=None):
        """Peržiūros langui: prašymo tekstas + faktai (likutis ir pan.) + patikrinimai (grafikas, nebuvimai)."""
        from .overview import request_review
        return Response(request_review(self.get_object()))

    @action(detail=True, methods=["get"])
    def answer_preview(self, request, pk=None):
        """Atsakymo projektas prašymui dėl informacijos apie DU."""
        return Response({"answer": payroll_services.pay_info_answer(self.get_object().employee)})


# ---------- Apžvalga ----------

class PayrollOverviewView(PayrollCompanyMixin, APIView):
    """GET -> {todo, deadlines, preferences} - DU apžvalgai (ką reikia padaryti, terminai, grafiko pageidavimai)."""

    def get(self, request):
        from .overview import overview
        return Response(overview(self.get_company()))


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
        ev = None
        if d.get("absence_event"):
            ev = AbsenceEvent.objects.filter(id=d["absence_event"], employee__company=company).select_related("employee").first()
            if ev is None:
                raise ValidationError("Nebuvimas nerastas")
        try:
            obj = payroll_services.generate_declaration(
                company, d.get("form"), int(d["year"]) if d.get("year") else None,
                int(d["month"]) if d.get("month") else None, contract, d.get("manual"),
                absence_event=ev, variant=d.get("variant") or "")
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"id": obj.id, "status": obj.status, "status_label": obj.get_status_display(),
                         "errors": obj.errors})


class DeclarationFileView(PayrollCompanyMixin, APIView):
    def get(self, request, pk):
        d = PayrollDeclaration.objects.filter(id=pk, company=self.get_company()).first()
        if d is None or not d.content:
            raise ValidationError("Deklaracija nerasta")
        who = d.contract.employee.last_name if d.contract_id else (d.absence_event.employee.last_name if d.absence_event_id else "")
        name = (f"{d.form}_{d.year}" + (f"-{d.month:02d}" if d.month else "") + (f"_{who}" if who else "")
                + (f"_{d.variant}" if d.variant else ""))
        is_json = d.form == "SDUP"
        resp = HttpResponse(d.content.encode("utf-8"),
                            content_type="application/json; charset=utf-8" if is_json else "application/xml; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{name}.{"json" if is_json else "ffdata"}"'
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


# ============================================================
# Išmokėjimai
# ============================================================

def _payment_or_404(company, pk):
    from docscanner_app.models import PayrollPayment
    p = PayrollPayment.objects.filter(id=pk, company=company).first()
    if p is None:
        raise ValidationError("Mokėjimas nerastas")
    return p


def _payroll_alloc_or_404(company, pk):
    from docscanner_app.models import PaymentAllocation
    a = (PaymentAllocation.objects.filter(id=pk, kind="payroll", payroll_payment__company=company)
         .select_related("payroll_payment", "outgoing_transaction").first())
    if a is None:
        raise ValidationError("Mokėjimo įrašas nerastas")
    return a


def _date_param(value, default=None):
    try:
        return _date.fromisoformat(str(value)) if value else default
    except ValueError:
        raise ValidationError("Neteisinga data")


class PayrollPaymentsView(PayrollCompanyMixin, APIView):
    """GET ?year=&month= - mėnesio išmokėjimai (darbuotojai, VMI, Sodra, išskaitos)."""

    def get(self, request):
        from .payments import payments_overview
        today = _date.today()
        y = int(request.query_params.get("year") or today.year)
        m = int(request.query_params.get("month") or today.month)
        return Response(payments_overview(self.get_company(), y, m))


class PayrollPaymentMarkPaidView(PayrollCompanyMixin, APIView):
    """POST {ids: [..] | id, payment_date, payment_account, amount?} - pažymėti sumokėta."""

    def post(self, request):
        from .payments import mark_paid
        company = self.get_company()
        ids = request.data.get("ids") or [request.data.get("id")]
        pay_date = _date_param(request.data.get("payment_date"), _date.today())
        account = request.data.get("payment_account") or ""
        amount = request.data.get("amount") if len(ids) == 1 else None
        done, errors = [], []
        for pk in ids:
            p = _payment_or_404(company, pk)
            try:
                mark_paid(p, request.user, pay_date, account, amount, request.data.get("note") or "")
                done.append(p.id)
            except ValueError as e:
                errors.append({"id": p.id, "detail": str(e)})
        return Response({"done": done, "errors": errors})


class PayrollAllocationView(PayrollCompanyMixin, APIView):
    """POST action=confirm | account (payment_account) ; DELETE - atmesti / pašalinti."""

    def post(self, request, pk):
        from .payments import confirm, set_account
        a = _payroll_alloc_or_404(self.get_company(), pk)
        action_ = request.data.get("action")
        if action_ == "confirm":
            confirm(a, request.user)
        elif action_ == "account":
            if not (request.data.get("payment_account") or "").strip():
                raise ValidationError("Pasirinkite pinigų sąskaitą")
            set_account(a, request.data["payment_account"])
        else:
            raise ValidationError("Neteisingas veiksmas")
        return Response({"status": "ok"})

    def delete(self, request, pk):
        from .payments import remove
        remove(_payroll_alloc_or_404(self.get_company(), pk))
        return Response(status=drf_status.HTTP_204_NO_CONTENT)


class PayrollAdvancesView(PayrollCompanyMixin, APIView):
    """POST {year, month} - sukurti mėnesio avansus."""

    def post(self, request):
        from .payments import create_advances
        try:
            created, skipped = create_advances(self.get_company(), int(request.data["year"]), int(request.data["month"]))
        except (KeyError, TypeError, ValueError) as e:
            raise ValidationError(str(e) if isinstance(e, ValueError) else "Nurodykite metus ir mėnesį")
        return Response({"created": len(created), "skipped": skipped})


class PayrollPaymentLinkView(PayrollCompanyMixin, APIView):
    """POST {transaction_id, amount?} - susieti banko išlaidą su DU mokėjimu rankiniu būdu."""

    def post(self, request, pk):
        from docscanner_app.models import OutgoingTransaction
        from .payments import link_transaction
        company = self.get_company()
        p = _payment_or_404(company, pk)
        txn = OutgoingTransaction.objects.filter(id=request.data.get("transaction_id"), company_profile=company).first()
        if txn is None:
            raise ValidationError("Banko operacija nerasta")
        try:
            a = link_transaction(p, txn, request.user, request.data.get("amount"))
        except ValueError as e:
            raise ValidationError(str(e))
        return Response({"allocation_id": a.id})


class PayrollPaymentFileView(PayrollCompanyMixin, APIView):
    """POST {ids, execution_date, debtor_iban} -> pain.001 XML (atsisiuntimas). Klaidos - antraštėje X-Errors."""

    def post(self, request):
        from urllib.parse import quote
        from .payments import create_batch
        company = self.get_company()
        try:
            batch, errors = create_batch(company, request.user, request.data.get("ids") or [],
                                         _date_param(request.data.get("execution_date"), _date.today()),
                                         request.data.get("debtor_iban") or "")
        except ValueError as e:
            raise ValidationError(str(e))
        resp = HttpResponse(batch.xml, content_type="application/xml; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="DU_mokejimai_{batch.execution_date}.xml"'
        resp["X-Batch-Id"] = str(batch.id)
        resp["X-Errors"] = quote(" | ".join(errors))
        resp["Access-Control-Expose-Headers"] = "X-Batch-Id, X-Errors, Content-Disposition"
        return resp


# ============================================================
# Pamainų grafikai
# ============================================================

class _CompanyCrud(PayrollCompanyMixin, viewsets.ModelViewSet):
    model = None

    def get_queryset(self):
        return self.model.objects.filter(company=self.get_company())

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())


class EmployeeTagViewSet(_CompanyCrud):
    from docscanner_app.models import EmployeeTag as model  # noqa
    from .serializers import EmployeeTagSerializer as serializer_class  # noqa


class ShiftTypeViewSet(_CompanyCrud):
    from docscanner_app.models import ShiftType as model  # noqa
    from .serializers import ShiftTypeSerializer as serializer_class  # noqa

    def perform_destroy(self, instance):
        """Naudojamos grafikuose pamainos neištrinamos (istorija, valandos) - siūloma išjungti."""
        from docscanner_app.models import RosterShift, RosterSlot, ShiftPreference
        used = (RosterShift.objects.filter(shift_type=instance).exists()
                or RosterSlot.objects.filter(shift_type=instance).exclude(min_staff=0, max_staff__isnull=True).exists()
                or ShiftPreference.objects.filter(shift_type=instance).exists())
        if used:
            raise ValidationError({"detail": f"Pamaina „{instance.name}“ naudojama grafikuose – jos ištrinti negalima. "
                                             "Išjunkite ją (Neaktyvi): naujuose grafikuose ji nebus naudojama, "
                                             "o esami grafikai liks nepakitę."})
        instance.delete()


class ScheduleRuleViewSet(_CompanyCrud):
    from docscanner_app.models import ScheduleRule as model  # noqa
    from .serializers import ScheduleRuleSerializer as serializer_class  # noqa


class ShiftPreferenceViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    from .serializers import ShiftPreferenceSerializer as serializer_class  # noqa

    def get_queryset(self):
        from docscanner_app.models import ShiftPreference
        qs = ShiftPreference.objects.filter(employee__company=self.get_company())
        if self.request.query_params.get("year"):
            qs = qs.filter(date__year=self.request.query_params["year"], date__month=self.request.query_params.get("month"))
        return qs

    def perform_create(self, serializer):
        if serializer.validated_data["employee"].company_id != self.get_company().id:
            raise ValidationError("Darbuotojas nerastas")
        serializer.save(source="manual")


class RosterCatalogView(APIView):
    def get(self, request):
        from .roster.catalog import GROUPS, LAW, RULES
        return Response({
            "groups": [{"key": k, "label": l} for k, l in GROUPS],
            "rules": [{"kind": k, "group": g, "label": l, "template": t, "params": p}
                      for k, (g, l, t, p) in RULES.items()],
            "law": LAW,
        })


class RosterView(PayrollCompanyMixin, APIView):
    """GET ?year=&month= - mėnesio grafikas (tinklelis, pažeidimai, balansai, variantai)."""

    def get(self, request):
        from .roster.services import get_roster, roster_view
        y, m = int(request.query_params["year"]), int(request.query_params["month"])
        return Response(roster_view(get_roster(self.get_company(), y, m)))


class RosterActionView(PayrollCompanyMixin, APIView):
    """
    POST {year, month, action}:
      generate            - sudaryti variantus (fone)
      apply   {index}     - pritaikyti variantą
      cell    {employee_id, date, shift_type_id|null, locked?}
      publish             - paskelbti darbuotojams (savitarna)
    """

    def post(self, request):
        from .roster import services as rs
        from .roster.tasks import generate_roster_task
        roster = rs.get_roster(self.get_company(), int(request.data["year"]), int(request.data["month"]))
        action_ = request.data.get("action")
        try:
            if action_ == "generate":
                rs.precheck(roster.company, roster.year, roster.month)
                if not roster.slots.exclude(min_staff=0, max_staff__isnull=True).exists():
                    rs.plan_from_rules(roster)     # planas iš numatyto poreikio ir taisyklių, jei dar nesudarytas
                summary = dict(roster.summary or {}, state="queued", error="", queued_at=timezone.now().isoformat())
                summary.pop("period_chain", None)               # vieno mėnesio sudarymas - ne laikotarpio grandinė
                summary.pop("auto_applied", None)
                roster.summary = summary
                roster.save(update_fields=["summary", "updated_at"])
                generate_roster_task.delay(roster.id)
                return Response({"state": "queued"})
            if action_ == "generate_period":               # visam apskaitiniam laikotarpiui (neskelbti mėnesiai iš eilės)
                from .roster.tasks import generate_period_task
                todo = [x["ym"] for x in rs.period_plan(roster.company, roster.year, roster.month) if x["state"] == "todo"]
                if not todo:
                    raise ValueError("Visi šio apskaitinio laikotarpio mėnesiai jau paskelbti – sudaryti nėra ką")
                rs.precheck(roster.company, roster.year, roster.month)
                now = timezone.now().isoformat()
                for ym in todo:
                    r = rs.get_roster(roster.company, int(ym[:4]), int(ym[5:]))
                    r.summary = dict(r.summary or {}, state="queued", error="", queued_at=now, period_chain=todo)
                    r.summary.pop("auto_applied", None)
                    r.save(update_fields=["summary", "updated_at"])
                generate_period_task.delay(roster.company_id, roster.year, roster.month)
                return Response({"state": "queued", "months": todo})
            if action_ == "repair_start":                  # pataisymų peržiūra po nebuvimų (fone)
                from .roster.tasks import repair_roster_task
                mode = request.data.get("mode") or "fill"
                if mode not in ("fill", "balance"):
                    raise ValueError("Neteisingas taisymo būdas")
                if ((roster.summary or {}).get("repair") or {}).get("state") in ("queued", "running"):
                    raise ValueError("Taisymas jau vykdomas")
                roster.summary = dict(roster.summary or {}, repair={"state": "queued", "mode": mode,
                                                                    "queued_at": timezone.now().isoformat()})
                roster.save(update_fields=["summary", "updated_at"])
                repair_roster_task.delay(roster.id, mode)
                return Response({"state": "queued"})
            if action_ == "repair_apply":
                from .roster.repair import repair_apply
                res = repair_apply(roster, request.data.get("months") or [], request.user)
                roster.refresh_from_db()
                return Response(dict(res, roster=rs.roster_view(roster)))
            if action_ == "publish_preview":
                from .roster.repair import publish_preview
                return Response(publish_preview(roster))
            if action_ == "repair_discard":
                from .roster.repair import repair_discard
                repair_discard(roster)
            elif action_ == "stale_ignore":                # „Jau sutvarkyta“ - dabartiniai duomenys tampa atskaitos tašku
                from .roster.repair import record_inputs
                record_inputs(roster)
            elif action_ == "apply":
                rs.apply_variant(roster, int(request.data.get("index", 0)))
            elif action_ == "cell":
                rs.set_cell(roster, int(request.data["employee_id"]), _date.fromisoformat(request.data["date"]),
                            request.data.get("shift_type_id"), request.data.get("locked"))
            elif action_ == "slot":
                rs.slot_set(roster, _date.fromisoformat(request.data["date"]), int(request.data["shift_type_id"]),
                            request.data.get("min"), request.data.get("max"))
            elif action_ == "clear_shifts":
                rs.clear_shifts(roster)
            elif action_ == "remove_absence_shifts":
                rs.remove_absence_shifts(roster)
            elif action_ == "clear_plan":
                rs.clear_plan(roster)
            elif action_ == "plan_from_rules":
                rs.plan_from_rules(roster)
            elif action_ == "copy_prev_plan":
                src = str(request.data.get("from") or "")          # "YYYY-MM"; tuščia - praėjęs mėnuo
                fy, fm = (src.split("-") + [None])[:2] if src else (None, None)
                rs.copy_prev_plan(roster, fy, fm)
            elif action_ == "template_save":
                rs.template_save(roster, request.data.get("name") or "", _date.fromisoformat(request.data["week_start"]))
            elif action_ == "template_apply":
                dates = request.data.get("dates")
                rs.template_apply(roster, int(request.data["template_id"]),
                                  {_date.fromisoformat(x) for x in dates} if dates else None)
            elif action_ == "publish":
                try:
                    res = rs.publish(roster, request.user, confirm_late=bool(request.data.get("confirm_late")),
                                     confirm_violations=bool(request.data.get("confirm_violations")))
                except rs.LawViolationsError as e:
                    return Response({"law_violations": e.items, "roster": rs.roster_view(roster)}, status=409)
                except rs.LateChangeError as e:
                    return Response({"late_changes": e.items, "roster": rs.roster_view(roster)}, status=409)
                return Response(dict(res, roster=rs.roster_view(roster)))
            elif action_ == "unlock":
                rs.unlock(roster, request.data.get("reason"), request.data.get("comment") or "")
            elif action_ == "discard_changes":          # grąžinti paskelbtą versiją ir vėl užrakinti
                rs.discard_changes(roster)
            elif action_ == "suggest":
                return Response({"candidates": rs.suggest(roster, _date.fromisoformat(request.data["date"]),
                                                          int(request.data["shift_type_id"]),
                                                          request.data.get("exclude_employee_id"))})
            elif action_ == "replace":
                rs.replace(roster, _date.fromisoformat(request.data["date"]), int(request.data["shift_type_id"]),
                           int(request.data["to_employee_id"]), request.data.get("from_employee_id"))
            else:
                raise ValidationError("Neteisingas veiksmas")
        except (ValueError, KeyError) as e:
            raise ValidationError(str(e))
        return Response(rs.roster_view(roster))


# ============================================================
# Komandiruotės
# ============================================================

class BusinessTripViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    from .serializers import BusinessTripSerializer as serializer_class  # noqa

    def get_queryset(self):
        from docscanner_app.models import BusinessTrip
        qs = BusinessTrip.objects.filter(company=self.get_company()).select_related("employee", "advance_payment")
        p = self.request.query_params
        if p.get("year") and p.get("month"):
            from calendar import monthrange
            y, m = int(p["year"]), int(p["month"])
            qs = qs.filter(start_at__date__lte=_date(y, m, monthrange(y, m)[1]), end_at__date__gte=_date(y, m, 1))
        if p.get("employee"):
            qs = qs.filter(employee_id=p["employee"])
        return qs

    def _save(self, serializer, **extra):
        from .readiness import payroll_start
        from .trips_services import refresh_calc
        start = payroll_start(self.get_company())
        end = serializer.validated_data.get("end_at") or getattr(serializer.instance, "end_at", None)
        if start and end and end.date() < start:
            raise ValidationError(f"Komandiruotė baigėsi anksčiau, nei DU pradėtas vesti DokSkene ({start:%Y-%m}) – ją įforminkite ankstesnėje programoje")
        trip = serializer.save(**extra)
        refresh_calc(trip)

    def perform_create(self, serializer):
        self._save(serializer, company=self.get_company())

    def perform_update(self, serializer):
        self._save(serializer)

    def perform_destroy(self, instance):
        if instance.status == "approved":
            raise ValidationError("Patvirtintą komandiruotę pirmiausia atšaukite")
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        from .trips_services import approve
        try:
            trip = approve(self.get_object(), request.user, resolve_absences=bool(request.data.get("resolve_absences")))
        except ValueError as e:
            raise ValidationError(str(e))
        from .roster.repair import affected_rosters
        return Response(dict(self.get_serializer(trip).data, rosters=affected_rosters(trip.company)))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        from .trips_services import cancel
        try:
            trip = cancel(self.get_object())
        except ValueError as e:
            raise ValidationError(str(e))
        from .roster.repair import affected_rosters
        return Response(dict(self.get_serializer(trip).data, warnings=getattr(trip, "restore_warnings", []),
                             rosters=affected_rosters(trip.company)))

    @action(detail=True, methods=["get"])
    def order(self, request, pk=None):
        from .trips_services import order_html
        return HttpResponse(order_html(self.get_object()), content_type="text/html; charset=utf-8")


class TripPreviewView(PayrollCompanyMixin, APIView):
    """POST {legs, start_at, end_at, per_diem_pct} -> dienpinigių skaičiavimas be išsaugojimo; GET - valstybių normos."""

    def get(self, request):
        from .trips import NORMS
        return Response([{"name": k, "amount": str(v)} for k, v in NORMS.items()])

    def post(self, request):
        from datetime import datetime
        from .trips import Leg, calc_trip
        d = request.data
        try:
            legs = [Leg(l["country"], _date.fromisoformat(l["date_from"]), _date.fromisoformat(l["date_to"]))
                    for l in d.get("legs") or []]
            c = calc_trip(legs, datetime.fromisoformat(d["start_at"]), datetime.fromisoformat(d["end_at"]),
                          Decimal(str(d.get("per_diem_pct") or 100)))
        except (KeyError, ValueError) as e:
            raise ValidationError(f"Neteisingi duomenys: {e}")
        plan = totals = conflicts = None
        roster_exists = True
        emp = Employee.objects.filter(id=d.get("employee"), company=self.get_company()).first() if d.get("employee") else None
        if emp is not None:
            from .trips_services import absence_conflicts, compute_plan
            conflicts = absence_conflicts(emp, datetime.fromisoformat(d["start_at"]).date(), datetime.fromisoformat(d["end_at"]).date())
            plan, totals, roster_exists = compute_plan(emp, datetime.fromisoformat(d["start_at"]), datetime.fromisoformat(d["end_at"]),
                                                       d.get("travel_out_hours") or 0, d.get("travel_back_hours") or 0,
                                                       d.get("day_edits") or {})
        return Response({"errors": c.errors, "total": str(c.total),
                         "days": [{"date": x.day.isoformat(), "country": x.country, "norm": str(x.norm),
                                   "pct": str(x.pct), "amount": str(x.amount), "note": x.note} for x in c.days],
                         "plan": plan, "plan_totals": totals, "roster_exists": roster_exists, "conflicts": conflicts})


# ============================================================
# Perėjimas iš kitos programos (DU)
# ============================================================

def _summed_default(m):
    from .roster.period import period_bounds
    st = payroll_services._settings(m.company)
    (py, pm), _ = period_bounds(m.du_start.year, m.du_start.month, st.summed_period_months or 3, st.summed_period_anchor or 1)
    return {"months": st.summed_period_months or 3, "start": f"{py}-{pm:02d}-01"}


def _migration_payload(m):
    from .lpk import all_clusters, all_professions
    people = []
    for p in m.people.all():
        people.append({
            "id": p.id, "person_code": p.person_code, "first_name": p.first_name, "last_name": p.last_name,
            "start_date": p.start_date, "end_date": p.end_date, "lpk4": p.lpk4, "lpk_code": p.lpk_code,
            "position_name": p.position_name, "contract_type": p.contract_type, "pension": p.pension,
            "npd_mode": p.npd_mode, "base_amount": p.base_amount, "vacation_balance": p.vacation_balance,
            "unpaid_amount": p.unpaid_amount, "include": p.include, "employee": p.employee_id,
            "employed": p.employed, "pay_form": p.pay_form, "weekly_hours": p.weekly_hours,
            "work_time_mode": getattr(p, "work_time_mode", "01"),
            "has_disability": getattr(p, "has_disability", False), "vdu_override": getattr(p, "vdu_override", None),
            "children": getattr(p, "children", []) or [],
            "summed_period_months": getattr(p, "summed_period_months", None),
            "summed_period_start": getattr(p, "summed_period_start", None),
            "summed_worked_hours": getattr(p, "summed_worked_hours", None),
            "summed_absence_hours": getattr(p, "summed_absence_hours", None),
            "summed_paid_overtime": getattr(p, "summed_paid_overtime", 0),
            "transition_state": getattr(p, "transition_state", "work") or "work",
            "transition_until": getattr(p, "transition_until", None),
            "vacation_prepaid_amount": getattr(p, "vacation_prepaid_amount", None),
            "pay_once_a_month": getattr(p, "pay_once_a_month", False),
            "advance_amount": getattr(p, "advance_amount", None),
            "gpm_ytd": getattr(p, "gpm_ytd", None),
            "transition_from": getattr(p, "transition_from", None),
            "week_hours": getattr(p, "week_hours", None),
            "is_foreigner": getattr(p, "is_foreigner", False),
            "birth_date": getattr(p, "birth_date", None),
            "gender": getattr(p, "gender", ""),
            "summed_mid_period": bool(getattr(p, "work_time_mode", "01") == "02" and
                                      str(getattr(p, "summed_period_start", None) or _summed_default(m)["start"]) < m.du_start.isoformat()),
            "lpk_name": next((x["name"] for x in all_professions() if p.lpk_code and x["code"] == p.lpk_code), ""),
            "is_new": bool(m.status == "sdup_ready" and not p.employee_id and p.include and p.employed),
            "s29_missing": p.id in ((m.summary or {}).get("s29_missing") or []),
            "annual_leave_days": p.annual_leave_days, "work_regime": p.work_regime, "single_parent": p.single_parent,
            "iban": p.iban, "email": p.email, "phone": p.phone, "source": p.source,
            "dismissed_before": not p.employed,
            "lpk_options": [{"code": x["code"], "name": x["name"]} for x in all_professions()
                            if p.lpk4 and x["code"].startswith(p.lpk4)][:40],
            "lpk_group": next((x["group_name"] for x in all_professions() if p.lpk4 and x["group_code"] == p.lpk4), ""),
            "lpk_needs_choice": bool(p.lpk4 and not p.lpk_code
                                     and not all_clusters().get(p.lpk4, {}).get("homogeneous", True)),
        })
    from docscanner_app.models import PayrollDeclaration
    from .migration.services import sodra_entries
    sdup_months = [{"id": d.id, "year": d.year, "month": d.month, "status": d.status,
                    "status_label": d.get_status_display(), "deadline": d.deadline, "errors": d.errors,
                    "rows": (d.meta or {}).get("rows", []), "has_file": bool(d.content)}
                   for d in PayrollDeclaration.objects.filter(company=m.company, form="SDUP")
                   .order_by("-year", "-month")[:6]] if m.mode == "sdup" else []
    from docscanner_app.models import DasDocument, PositionGroup
    das = None
    if m.status in ("sdup_ready", "confirmed"):
        last = DasDocument.objects.filter(company=m.company).order_by("-version").first()
        das = {"approved": bool(last), "approved_date": last.approved_date if last else None,
               "outdated": payroll_services.das_outdated(m.company) if last else False,
               "groups": PositionGroup.objects.filter(company=m.company).count()}
    summed_default = _summed_default(m)
    return {"id": m.id, "du_start": m.du_start, "status": m.status, "gap_mode": m.gap_mode, "mode": m.mode,
            "summed_default": summed_default,
            "sdup_months": sdup_months, "das": das,
            "sodra_entries": sodra_entries(m) if m.status == "sdup_ready" else [],
            "sodra_entries_all": sodra_entries(m, only_new=False) if m.status == "sdup_ready" else [],
            "summary": m.summary or {}, "people": people,
            "other_payments": list(m.other_payments.values("id", "person_code", "name", "year", "income_code",
                                                          "amount", "rate", "gpm"))}


class PayrollMigrationExcelView(PayrollCompanyMixin, APIView):
    """GET - Excel šablonas su rastais darbuotojais."""
    def get(self, request):
        from .migration import services as ms
        m = ms.get_or_create(self.get_company(), request.user)
        resp = HttpResponse(ms.export_excel(m),
                            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        resp["Content-Disposition"] = 'attachment; filename="du_perejimas_darbuotojai.xlsx"'
        return resp


class PayrollMigrationView(PayrollCompanyMixin, APIView):
    """
    GET  - būsena;  POST multipart files[] - įkelti .ffdata;
    POST {action: start|analyze|person|remove_file|confirm|reopen|other_add|other_delete}
    """
    def get(self, request):
        from .migration import services as ms
        m = ms.get_or_create(self.get_company(), request.user)
        if not m.summary and m.files.exists():
            ms.analyze(m)
        return Response(_migration_payload(m))

    def post(self, request):
        from docscanner_app.models import PayrollMigrationOtherPayment
        from .migration import services as ms
        m = ms.get_or_create(self.get_company(), request.user)
        try:
            if request.FILES.get("excel"):
                from .admin_tools import archive_upload
                f = request.FILES["excel"]
                raw = f.read()
                f.seek(0)
                try:
                    upd, new, errors = ms.import_excel(m, f)
                except ValueError as e:
                    archive_upload(m.company, request.user, "excel", f.name, raw, form="Excel", ok=False, error=str(e))
                    raise
                archive_upload(m.company, request.user, "excel", f.name, raw, form="Excel",
                               error="; ".join(map(str, errors[:10])), meta={"updated": upd, "added": new})
                return Response(dict(_migration_payload(m), excel={"updated": upd, "added": new, "errors": errors}))
            if request.FILES:
                import zipfile
                items = []
                for f in request.FILES.getlist("files"):
                    if f.size > 20 * 1024 * 1024:
                        continue
                    if f.name.lower().endswith(".zip"):
                        with zipfile.ZipFile(f) as z:          # pvz. kelios ataskaitos viename ZIP
                            items += [(n.rsplit("/", 1)[-1], z.read(n)) for n in z.namelist()
                                      if n.lower().endswith((".xml", ".ffdata")) and z.getinfo(n).file_size < 5 * 1024 * 1024]
                    else:
                        items.append((f.name, f.read()))
                ok, skipped = ms.add_files(m, items)
                from .admin_tools import archive_upload
                why = dict(skipped)
                for n, content in items:
                    r = why.get(n, "")
                    dup = r == "Toks failas jau įkeltas"
                    archive_upload(m.company, request.user, "migration", n, content,
                                   ok=not r or dup, error="" if dup else r)
                ms.analyze(m)
                return Response(dict(_migration_payload(m), uploaded=ok,
                                     skipped=[{"name": n, "reason": r} for n, r in skipped]))
            a = request.data.get("action")
            if a == "start":
                ms.set_start(m, _date.fromisoformat(request.data["du_start"]), request.data.get("gap_mode"))
            elif a == "analyze":
                ms.analyze(m)
            elif a == "add_person":
                ms.add_person(m, request.data.get("data") or {})
            elif a == "reset":
                ms.reset(m)
            elif a == "remove_person":
                ms.remove_person(m, int(request.data["id"]))
            elif a == "person":
                ms.update_person(m, int(request.data["id"]), request.data.get("data") or {})
            elif a == "remove_file":
                ms.remove_file(m, int(request.data["id"]))
                ms.analyze(m)
            elif a == "other_add":
                d = request.data.get("data") or {}
                PayrollMigrationOtherPayment.objects.create(
                    migration=m, person_code=d["person_code"], name=d.get("name", "")[:68], year=int(d["year"]),
                    income_code=d["income_code"], amount=Decimal(str(d["amount"])), rate=Decimal(str(d.get("rate") or 0)),
                    gpm=Decimal(str(d.get("gpm") or 0)))
            elif a == "other_delete":
                m.other_payments.filter(id=int(request.data["id"])).delete()
            elif a == "mode":
                ms.set_mode(m, request.data.get("mode"))
            elif a == "confirm_sdup":
                ms.confirm_sdup(m, request.user)
            elif a == "sdup_month_build":
                ms.sdup_month_build(m, int(request.data["year"]), int(request.data["month"]))
            elif a == "sdup_month_save":
                ms.sdup_month_save(m, int(request.data["year"]), int(request.data["month"]), request.data.get("rows"))
            elif a == "sdup_month_generate":
                ms.sdup_month_generate(m, int(request.data["year"]), int(request.data["month"]))
            elif a == "confirm":
                ms.confirm(m, request.user)
            elif a == "reopen":
                ms.reopen(m)
            else:
                raise ValidationError("Neteisingas veiksmas")
        except (ValueError, KeyError) as e:
            raise ValidationError(str(e))
        m.refresh_from_db()
        return Response(_migration_payload(m))


# ============================================================
# Sodros ataskaitos: S15 (ligos pažymėjimai) ir S47 (tarifų sutikrinimas) - nebūtinos
# ============================================================

class SodraReportsView(PayrollCompanyMixin, APIView):
    """
    POST multipart files[] (S15 ir / arba S47 XML), apply=0|1 -> S15 peržiūra / įrašymas + S47 sutikrinimas.
    POST JSON {action: "fix", employee_id, field, value} -> pritaikyti S47 pataisymą kortelėje.
    """
    def post(self, request):
        import xml.etree.ElementTree as ET
        from . import sick_import, sodra_tariffs
        company = self.get_company()
        if request.data.get("action") == "fix":
            try:
                sodra_tariffs.apply_fix(company, int(request.data["employee_id"]), request.data.get("field"),
                                        request.data.get("value"))
            except (ValueError, KeyError) as e:
                raise ValidationError(str(e))
            return Response({"ok": True})
        files = request.FILES.getlist("files") or ([request.FILES["file"]] if request.FILES.get("file") else [])
        if not files:
            raise ValidationError("Pasirinkite Sodros ataskaitas (.xml)")
        out = {"s15": None, "s47": None, "unknown": []}
        apply = str(request.data.get("apply")) == "1"
        for f in files:
            content = f.read()
            from .admin_tools import archive_upload
            rows = sodra_tariffs.parse(content)
            if rows is not None:
                out["s47"] = sodra_tariffs.run_check(company, rows)
                archive_upload(company, request.user, "s47", f.name, content, form="S47", meta={"rows": len(rows)})
                continue
            try:
                out["s15"] = sick_import.run_import(company, content, apply=apply)
                archive_upload(company, request.user, "sick_import", f.name, content, form="S15")
            except (ValueError, ET.ParseError) as e:
                out["unknown"].append(f.name)
                archive_upload(company, request.user, "sick_import", f.name, content, ok=False, error=str(e))
        if apply and out["s15"]:
            from .roster.repair import affected_rosters
            out["rosters"] = affected_rosters(company)
        return Response(out)



# ---------- Išskaitos ir nuolatiniai priedai ----------

class GarnishmentOrderViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    """?employee= ; išskaitų dokumentai (antstoliai, alimentai)."""

    def get_serializer_class(self):
        from .serializers import GarnishmentOrderSerializer
        return GarnishmentOrderSerializer

    def get_queryset(self):
        from docscanner_app.models import GarnishmentOrder
        qs = GarnishmentOrder.objects.filter(employee__company=self.get_company())
        e = self.request.query_params.get("employee")
        return qs.filter(employee_id=e) if e else qs

    def perform_create(self, serializer):
        self.check_employee(serializer.validated_data["employee"])
        serializer.save()

    @action(detail=False, methods=["get"])
    def journal(self, request):
        """Vykdomų antstolių patvarkymų apskaitos knyga (CPK 741) - visi dokumentai su išskaitomis."""
        from docscanner_app.models import GarnishmentOrder, PayrollLine
        out = []
        for g in GarnishmentOrder.objects.filter(employee__company=self.get_company()).select_related("employee"):
            lines = PayrollLine.objects.filter(garnishment=g, run__status__in=("approved", "paid", "closed")) \
                .select_related("run").order_by("run__year", "run__month")
            out.append({"id": g.id, "employee": g.employee.full_name, "kind": g.get_kind_display(), "document_no": g.document_no,
                        "received_date": g.received_date, "bailiff": g.bailiff, "case_no": g.case_no,
                        "total_debt": g.total_debt, "paid_before": g.paid_before,
                        "entries": [{"month": f"{l.run.year}-{l.run.month:02d}", "amount": str(l.amount)} for l in lines]})
        return Response(out)


class RecurringPayItemViewSet(PayrollCompanyMixin, viewsets.ModelViewSet):
    """?employee= ; nuolatiniai priedai."""

    def get_serializer_class(self):
        from .serializers import RecurringPayItemSerializer
        return RecurringPayItemSerializer

    def get_queryset(self):
        from docscanner_app.models import RecurringPayItem
        qs = RecurringPayItem.objects.filter(employee__company=self.get_company()).select_related("pay_code")
        e = self.request.query_params.get("employee")
        return qs.filter(employee_id=e) if e else qs

    def perform_create(self, serializer):
        self.check_employee(serializer.validated_data["employee"])
        serializer.save()
