"""
DU modulio serializeriai.
"""
from django.db.models import Sum
from rest_framework import serializers

from ..models import (
    DasDocument, EmployeeDocument, EmployeeRequest, PositionGroup,
    AbsenceEvent, ContractTerms, Employee, EmployeeChild, EmploymentContract, PayCode,
    PayrollEmployeeResult, PayrollLine, PayrollRun, PayrollSettings, Position, WorkSchedule,
)


class PayrollSettingsSerializer(serializers.ModelSerializer):
    """Web service slaptažodžiai: tik įrašomi (šifruojami), atgal grąžinama tik žymė *_set."""
    edas_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    vmi_ws_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    edas_password_set = serializers.SerializerMethodField()
    vmi_ws_password_set = serializers.SerializerMethodField()

    class Meta:
        model = PayrollSettings
        exclude = ["company"]

    def get_edas_password_set(self, obj):
        return bool(obj.edas_password)

    def get_vmi_ws_password_set(self, obj):
        return bool(obj.vmi_ws_password)

    def update(self, instance, data):
        from .crypto import encrypt
        for f in ("edas_password", "vmi_ws_password"):
            pw = data.pop(f, None)
            if pw:
                setattr(instance, f, encrypt(pw))
        return super().update(instance, data)


class WorkScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkSchedule
        exclude = ["company"]


class PositionSerializer(serializers.ModelSerializer):
    group_code = serializers.CharField(source="group.code", read_only=True, default="")
    lpk_name = serializers.SerializerMethodField()

    class Meta:
        model = Position
        exclude = ["company"]

    def get_lpk_name(self, obj):
        from .lpk import get
        p = get(obj.lpk_code) if obj.lpk_code else None
        return p["name"] if p else ""

    def validate_lpk_code(self, value):
        from .lpk import codes
        if value and value not in codes():
            raise serializers.ValidationError("Tokio kodo profesijų klasifikatoriuje (LPK 2023) nėra")
        return value


class PayCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayCode
        exclude = ["company"]


class EmployeeChildSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeChild
        fields = ["id", "employee", "first_name", "birth_date", "personal_code", "has_disability"]


class ContractTermsSerializer(serializers.ModelSerializer):
    position_name = serializers.CharField(source="position.name", read_only=True, default="")

    class Meta:
        model = ContractTerms
        fields = ["id", "contract", "valid_from", "position", "position_name", "pay_form",
                  "base_amount", "workload", "full_time_hours", "schedule", "work_regime"]


class EmploymentContractSerializer(serializers.ModelSerializer):
    terms = ContractTermsSerializer(many=True, read_only=True)
    is_fixed_term = serializers.BooleanField(read_only=True)

    class Meta:
        model = EmploymentContract
        fields = ["id", "employee", "number", "signed_date", "start_date", "end_date",
                  "sodra_contract_type", "sodra_contract_subtype", "probation_months", "annual_leave_days",
                  "work_time_mode", "extra_leave_days", "extended_leave_days", "seniority_since", "extra_terms",
                  "termination_date", "termination_basis", "status", "is_fixed_term", "terms"]

    def validate(self, attrs):
        ctype = attrs.get("sodra_contract_type", getattr(self.instance, "sodra_contract_type", "01"))
        subtype = attrs.get("sodra_contract_subtype", getattr(self.instance, "sodra_contract_subtype", ""))
        if ctype in EmploymentContract.SUBTYPE_REQUIRED and not subtype:
            raise serializers.ValidationError({"sodra_contract_subtype": "Nurodykite potipį (terminuota / neterminuota)"})
        if ctype == "02" and not attrs.get("end_date", getattr(self.instance, "end_date", None)):
            raise serializers.ValidationError({"end_date": "Terminuotai sutarčiai būtina pabaigos data"})
        return attrs


class EmployeeListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    savitarna_status = serializers.SerializerMethodField()
    personal_code_masked = serializers.SerializerMethodField()
    position = serializers.SerializerMethodField()
    base_amount = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = ["id", "full_name", "first_name", "last_name", "personal_code_masked",
                  "status", "data_status", "savitarna_status", "position", "base_amount", "email"]

    def get_savitarna_status(self, obj):
        from .services import savitarna_status
        return savitarna_status(obj)

    def get_personal_code_masked(self, obj):
        pc = obj.personal_code or ""
        return f"{pc[:1]}******{pc[-4:]}" if len(pc) == 11 else ""

    def _terms(self, obj):
        c = obj.contracts.exclude(status="draft").order_by("-start_date").first()
        return c.terms.order_by("-valid_from").select_related("position").first() if c else None

    def get_position(self, obj):
        t = self._terms(obj)
        return t.position.name if t and t.position else ""

    def get_base_amount(self, obj):
        t = self._terms(obj)
        return str(t.base_amount) if t else None


class EmployeeDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    savitarna_status = serializers.SerializerMethodField()

    def get_savitarna_status(self, obj):
        from .services import savitarna_status
        return savitarna_status(obj)
    children = EmployeeChildSerializer(many=True, read_only=True)
    contracts = EmploymentContractSerializer(many=True, read_only=True)

    class Meta:
        model = Employee
        exclude = ["company", "account"]
        read_only_fields = ["onboarding_token", "created_at", "updated_at"]

    def validate(self, attrs):
        from .personal_code import parse
        foreigner = attrs.get("is_foreigner", getattr(self.instance, "is_foreigner", False))
        pc = attrs.get("personal_code", getattr(self.instance, "personal_code", "")) or ""
        if not foreigner:
            info = parse(pc)
            if not info.valid:
                raise serializers.ValidationError({"personal_code": info.error})
            attrs["gender"] = info.gender
            if info.birth_date:
                attrs["birth_date"] = info.birth_date
        return attrs


class AbsenceEventSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = AbsenceEvent
        fields = ["id", "employee", "employee_name", "kind", "start_date", "end_date", "work_days",
                  "source", "status", "sick_leave_number", "employer_pays_first_days",
                  "parent_event", "child", "comment", "created_at"]
        read_only_fields = ["work_days", "created_at"]

    def validate(self, attrs):
        s = attrs.get("start_date", getattr(self.instance, "start_date", None))
        e = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if s and e and e < s:
            raise serializers.ValidationError({"end_date": "Pabaiga negali būti ankstesnė už pradžią"})
        return attrs


class PayrollLineSerializer(serializers.ModelSerializer):
    code = serializers.CharField(source="pay_code.code", read_only=True)
    code_name = serializers.CharField(source="pay_code.name", read_only=True)
    category = serializers.CharField(source="pay_code.category", read_only=True)

    class Meta:
        model = PayrollLine
        fields = ["id", "run", "employee", "pay_code", "code", "code_name", "category",
                  "quantity", "rate", "amount", "is_manual", "comment"]
        read_only_fields = ["is_manual"]


class PayrollEmployeeResultSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = PayrollEmployeeResult
        exclude = ["calc_snapshot"]


class PayrollRunSerializer(serializers.ModelSerializer):
    employees_count = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()

    class Meta:
        model = PayrollRun
        fields = ["id", "year", "month", "kind", "status", "warnings", "journal_entry",
                  "approved_at", "created_at", "employees_count", "totals"]

    def get_employees_count(self, obj):
        return obj.results.count()

    def get_totals(self, obj):
        agg = obj.results.aggregate(
            gross=Sum("gross"), net=Sum("net"), payable=Sum("payable"), gpm=Sum("gpm"),
            gpm15=Sum("gpm15"), sam=Sum("sam_payment"),
        )
        return {k: str(v or 0) for k, v in agg.items()}



class PositionGroupSerializer(serializers.ModelSerializer):
    positions = serializers.SerializerMethodField()
    position_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    total_score = serializers.IntegerField(read_only=True)

    class Meta:
        model = PositionGroup
        exclude = ["company"]
        read_only_fields = ["code"]

    def validate_name(self, value):
        from .lpk import normalize
        company = self.context["request"].user.active_company_profile
        qs = PositionGroup.objects.filter(company=company)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if any(normalize(g.name).strip() == normalize(value).strip() for g in qs):
            raise serializers.ValidationError("Grupė tokiu pavadinimu jau yra")
        return value.strip()

    def get_positions(self, obj):
        return [{"id": p.id, "name": p.name} for p in obj.positions.all()]

    def validate(self, attrs):
        for k in ("skills", "qualification", "effort", "responsibility", "conditions"):
            if k in attrs and not 1 <= attrs[k] <= 5:
                raise serializers.ValidationError({k: "Vertinimas nuo 1 iki 5"})
        lo = attrs.get("salary_min", getattr(self.instance, "salary_min", None))
        hi = attrs.get("salary_max", getattr(self.instance, "salary_max", None))
        if lo is not None and hi is not None and lo > hi:
            raise serializers.ValidationError({"salary_max": "Maksimali alga negali būti mažesnė už minimalią"})
        return attrs


class DasDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DasDocument
        fields = ["id", "version", "approved_date", "manager_name", "groups_snapshot", "created_at"]


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    has_html = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    file = serializers.FileField(write_only=True, required=False)

    class Meta:
        model = EmployeeDocument
        fields = ["id", "employee", "contract", "kind", "title", "number", "sign_method",
                  "employee_signed", "employer_signed", "signed_date", "status",
                  "has_html", "has_file", "file", "file_name", "created_at"]
        read_only_fields = ["file_name", "created_at"]

    def get_has_html(self, obj):
        return bool(obj.html)

    def get_has_file(self, obj):
        return bool(obj.file)

    def validate_file(self, f):
        allowed = (".pdf", ".jpg", ".jpeg", ".png")
        if not f.name.lower().endswith(allowed):
            raise serializers.ValidationError("Galima įkelti PDF, JPG arba PNG")
        if f.size > 20 * 1024 * 1024:
            raise serializers.ValidationError("Failas per didelis (daugiausia 20 MB)")
        return f


class EmployeeRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = EmployeeRequest
        fields = ["id", "employee", "employee_name", "kind", "kind_label", "start_date", "end_date", "work_days",
                  "comment", "answer", "status", "status_label", "reject_reason", "decided_at", "created_at"]
        read_only_fields = fields


# ============================================================
# Pamainų grafikai
# ============================================================

from docscanner_app.models import EmployeeTag, ScheduleRule, ShiftPreference, ShiftType  # noqa: E402


class EmployeeTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeTag
        exclude = ["company"]


class ShiftTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftType
        exclude = ["company"]

    def validate(self, attrs):
        from datetime import date as _d, datetime as _dt, timedelta as _td
        start, end = attrs.get("start_time"), attrs.get("end_time")
        if start and end:
            a, b = _dt.combine(_d.today(), start), _dt.combine(_d.today(), end)
            if b <= a:
                b += _td(days=1)
            mins = (b - a).total_seconds() / 60 - (attrs.get("break_minutes") or 0)
            if mins > 12 * 60:
                raise serializers.ValidationError("Pamaina negali būti ilgesnė nei 12 val. (be pertraukos)")
        return attrs


class ScheduleRuleSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleRule
        exclude = ["company"]

    def get_label(self, obj):
        from .roster.services import rule_label
        return rule_label(obj)

    def validate_kind(self, v):
        from .roster.catalog import RULES
        if v not in RULES:
            raise serializers.ValidationError("Nežinoma taisyklė")
        return v


class ShiftPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftPreference
        fields = "__all__"
