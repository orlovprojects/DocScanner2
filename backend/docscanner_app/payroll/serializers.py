from decimal import Decimal
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

    LIMITS = {   # CFG-02: leistinos reikšmės
        "salary_day": (1, 31, "Atlyginimo mokėjimo diena"), "advance_day": (1, 31, "Avanso mokėjimo diena"),
        "advance_percent": (0, 100, "Avanso dydis, %"), "summed_period_months": (1, 3, "Apskaitinis laikotarpis (mėn.)"),
        "summed_period_anchor": (1, 12, "Apskaitinio laikotarpio pradžios mėnuo"),
        "roster_publish_days": (7, 31, "Grafiko juodraštis likus dienų"),
        "sick_pay_pct": (Decimal("62.06"), 100, "Ligos išmoka, %"),
    }

    def validate(self, attrs):
        errors = {}
        for f, (lo, hi, label) in self.LIMITS.items():
            if f in attrs and attrs[f] is not None and not (lo <= attrs[f] <= hi):
                errors[f] = f"{label}: leistina nuo {lo} iki {hi}"
        if attrs.get("du_start"):
            attrs["du_start"] = attrs["du_start"].replace(day=1)
            if self.instance and attrs["du_start"] != self.instance.du_start:
                from .readiness import check_du_start_change
                r = check_du_start_change(self.instance.company, attrs["du_start"])
                if not r["ok"]:
                    errors["du_start"] = r["error"]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

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
    group_code = serializers.CharField(source="position.group.code", read_only=True, default="")
    group_name = serializers.CharField(source="position.group.name", read_only=True, default="")

    class Meta:
        model = ContractTerms
        fields = ["id", "contract", "valid_from", "position", "position_name", "group_code", "group_name", "pay_form",
                  "base_amount", "workload", "full_time_hours", "schedule", "work_regime", "week_hours"]

    def validate_week_hours(self, v):
        if not v:
            return None
        try:
            hrs = [Decimal(str(h)) for h in v]
        except Exception:
            raise serializers.ValidationError("Netinkamos valandos")
        if len(hrs) != 7 or any(h < 0 or h > 12 for h in hrs) or not any(hrs):
            raise serializers.ValidationError("7 dienų valandos, kiekviena nuo 0 iki 12")
        return [float(h) for h in hrs]


class EmploymentContractSerializer(serializers.ModelSerializer):
    terms = ContractTermsSerializer(many=True, read_only=True)
    is_fixed_term = serializers.BooleanField(read_only=True)

    class Meta:
        model = EmploymentContract
        fields = ["id", "employee", "number", "signed_date", "start_date", "end_date",
                  "sodra_contract_type", "sodra_contract_subtype", "probation_months", "annual_leave_days",
                  "work_time_mode", "extra_leave_days", "extended_leave_days", "seniority_since", "extra_terms",
                  "termination_date", "termination_basis", "status", "is_fixed_term", "terms", "is_company_head",
                  "summed_period_months", "summed_period_anchor", "summed_opening"]
        read_only_fields = ["summed_opening"]

    def validate(self, attrs):
        ctype = attrs.get("sodra_contract_type", getattr(self.instance, "sodra_contract_type", "01"))
        subtype = attrs.get("sodra_contract_subtype", getattr(self.instance, "sodra_contract_subtype", ""))
        if ctype in EmploymentContract.SUBTYPE_REQUIRED and not subtype:
            raise serializers.ValidationError({"sodra_contract_subtype": "Nurodykite potipį (terminuota / neterminuota)"})
        if ctype == "02" and not attrs.get("end_date", getattr(self.instance, "end_date", None)):
            raise serializers.ValidationError({"end_date": "Terminuotai sutarčiai būtina pabaigos data"})
        pm = attrs.get("summed_period_months")
        if pm is not None and not 1 <= pm <= 3:
            raise serializers.ValidationError({"summed_period_months": "Apskaitinis laikotarpis – nuo 1 iki 3 mėn. (DK 113 str.)"})
        pa = attrs.get("summed_period_anchor")
        if pa is not None and not 1 <= pa <= 12:
            raise serializers.ValidationError({"summed_period_anchor": "Mėnuo nuo 1 iki 12"})
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
        """PERF-01: iš prefetch'into duomenų, vieną kartą darbuotojui (be papildomų SQL)."""
        if not hasattr(obj, "_current_terms"):
            cs = [c for c in obj.contracts.all() if c.status != "draft"]
            c = max(cs, key=lambda x: x.start_date, default=None)
            obj._current_terms = max(list(c.terms.all()), key=lambda t: t.valid_from, default=None) if c else None
        return obj._current_terms

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
                  "parent_event", "child", "comment", "created_at", "sodra_reason"]
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
    work = serializers.SerializerMethodField()

    class Meta:
        model = PayrollEmployeeResult
        exclude = ["calc_snapshot"]

    def get_work(self, obj):
        s = obj.calc_snapshot or {}
        return {k: s.get(k) for k in ("worked_days", "worked_hours", "scheduled_days")}


class PayrollRunSerializer(serializers.ModelSerializer):
    employees_count = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    timesheet_status = serializers.SerializerMethodField()

    class Meta:
        model = PayrollRun
        fields = ["id", "year", "month", "kind", "status", "warnings", "journal_entry",
                  "approved_at", "created_at", "employees_count", "totals", "timesheet_status"]

    def get_timesheet_status(self, obj):
        from .services import timesheet_status
        return timesheet_status(obj.company, obj.year, obj.month)

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
    employees = serializers.SerializerMethodField()
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

    def get_employees(self, obj):
        from docscanner_app.models import Employee
        return sorted({e.full_name for e in Employee.objects.filter(
            status="active", contracts__status="active", contracts__terms__position__group=obj)})

    def get_positions(self, obj):
        return [{"id": p.id, "name": p.name, "lpk_code": p.lpk_code} for p in obj.positions.all()]

    def validate(self, attrs):
        for k in ("skills", "qualification", "effort", "responsibility", "conditions"):
            if k in attrs and not 1 <= attrs[k] <= 5:
                raise serializers.ValidationError({k: "Vertinimas nuo 1 iki 5"})
        lo = attrs.get("salary_min", getattr(self.instance, "salary_min", None))
        hi = attrs.get("salary_max", getattr(self.instance, "salary_max", None))
        if lo is not None and hi is not None and lo > hi:
            raise serializers.ValidationError({"salary_max": "Maksimali alga negali būti mažesnė už minimalią"})
        hlo = attrs.get("hourly_min", getattr(self.instance, "hourly_min", None))
        hhi = attrs.get("hourly_max", getattr(self.instance, "hourly_max", None))
        if hlo is not None and hhi is not None and hlo > hhi:
            raise serializers.ValidationError({"hourly_max": "Maksimalus valandinis atlygis negali būti mažesnis už minimalų"})        
        return attrs


class DasDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DasDocument
        fields = ["id", "version", "approved_date", "manager_name", "manager_title", "city", "changes", "settings", "created_at"]


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
    child_label = serializers.SerializerMethodField()
    has_attachment = serializers.SerializerMethodField()
    employee_position = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeRequest
        fields = ["id", "employee", "employee_name", "kind", "kind_label", "start_date", "end_date", "work_days",
                  "comment", "answer", "status", "status_label", "reject_reason", "decided_at", "created_at",
                  "child_label", "has_attachment", "employee_position"]

    def get_child_label(self, obj):
        c = getattr(obj, "child", None)
        return f"{c.first_name or 'Vaikas'} (gim. {c.birth_date:%Y-%m-%d})" if c else ""

    def get_has_attachment(self, obj):
        return bool(getattr(obj, "attachment", None))
        read_only_fields = fields

    def get_employee_position(self, obj):
        from .overview import employee_position
        return employee_position(obj.employee)


# ============================================================
# Pamainų grafikai
# ============================================================

from docscanner_app.models import EmployeeTag, ScheduleRule, ShiftPreference, ShiftType  # noqa: E402


class EmployeeTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeTag
        exclude = ["company"]

    def validate_name(self, value):
        from .roster.planning import validate_tag_name
        err = validate_tag_name(value)
        if err:
            raise serializers.ValidationError(err)
        return value.strip()


class ShiftTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftType
        exclude = ["company"]

    SHAPE_FIELDS = ("name", "code", "start_time", "end_time", "break_minutes", "color", "default_staff_need_by_weekday",
                    "default_staff_max_by_weekday", "break_start", "break_paid")

    def to_representation(self, obj):
        from .roster.planning import norm_color
        data = super().to_representation(obj)
        if data.get("color"):
            data["color"] = norm_color(data["color"])          # sena paletė -> nauja
        return data

    def validate(self, attrs):
        from datetime import date as _d, datetime as _dt, timedelta as _td
        from .roster.planning import normalize_need, validate_shift_type
        inst = getattr(self, "instance", None)       # ROS-02: dalinis PATCH - tikrinamas galutinis objektas
        # Aktyvi / Neaktyvi: jei keičiamas tik is_active - kiti laukai nekeičiami ir netikrinami (senos pamainos
        # su ne paletės spalva ar ilgu pavadinimu irgi turi būti išjungiamos / įjungiamos)
        if inst is not None and all(getattr(inst, k) == v for k, v in attrs.items() if k != "is_active"):
            return {k: v for k, v in attrs.items() if k == "is_active"} or attrs
        full = {k: attrs.get(k, getattr(inst, k, None)) for k in self.SHAPE_FIELDS}
        view = self.context.get("view")
        company = view.get_company() if view is not None and hasattr(view, "get_company") else getattr(inst, "company", None)
        used = []
        if company is not None:
            qs = ShiftType.objects.filter(company=company)
            if inst is not None:
                qs = qs.exclude(id=inst.id)
            used = list(qs.values_list("color", flat=True))
        errors = validate_shift_type(full, used)
        if errors:
            raise serializers.ValidationError(errors)
        if "default_staff_need_by_weekday" in attrs or inst is None:
            attrs = {**attrs, "default_staff_need_by_weekday": normalize_need(full["default_staff_need_by_weekday"])}
        if "default_staff_max_by_weekday" in attrs or inst is None:
            from .roster.planning import normalize_max
            attrs = {**attrs, "default_staff_max_by_weekday": normalize_max(full["default_staff_max_by_weekday"])}
        if "color" in attrs:
            from .roster.planning import norm_color
            attrs = {**attrs, "color": norm_color(attrs["color"])}
        for k in ("name", "code"):
            if k in attrs:
                attrs = {**attrs, k: attrs[k].strip()}
        start = attrs.get("start_time", getattr(inst, "start_time", None))
        end = attrs.get("end_time", getattr(inst, "end_time", None))
        if "break_minutes" not in attrs and inst is not None:
            attrs = {**attrs}
            brk = inst.break_minutes
        else:
            brk = attrs.get("break_minutes") or 0
        if start and end:
            a, b = _dt.combine(_d.today(), start), _dt.combine(_d.today(), end)
            if b <= a:
                b += _td(days=1)
            span = (b - a).total_seconds() / 60
            if brk < 0 or brk >= span:
                raise serializers.ValidationError("Neteisinga pertraukos trukmė")
            if span - brk > 12 * 60:
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


# ============================================================
# Komandiruotės
# ============================================================

from docscanner_app.models import BusinessTrip  # noqa: E402


class BusinessTripSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    advance_status = serializers.SerializerMethodField()

    class Meta:
        model = BusinessTrip
        exclude = ["company"]
        read_only_fields = ["total", "calc", "status", "absence_event", "advance_payment", "approved_by", "approved_at",
                            "order_number"]

    def get_advance_status(self, obj):
        p = obj.advance_payment
        return {"amount": str(p.amount), "paid": str(p.paid_amount), "status": p.status} if p else None

    def validate(self, attrs):
        from .trips import MIN_PCT, NORMS
        if self.instance is not None and self.instance.status != "draft":
            raise serializers.ValidationError("Patvirtintos komandiruotės keisti negalima - atšaukite ir sukurkite naują")
        for l in attrs.get("legs") or []:
            if l.get("country") not in NORMS:
                raise serializers.ValidationError(f"Nežinoma valstybė: {l.get('country')}")
        pct = attrs.get("per_diem_pct")
        if pct is not None and not (MIN_PCT <= pct <= 100):
            raise serializers.ValidationError("Dienpinigių dydis - nuo 50 iki 100 % normos")
        adv = attrs.get("advance_pct")
        if adv is not None and not (0 <= adv <= 100):
            raise serializers.ValidationError("Avansas - nuo 0 iki 100 %")
        return attrs



class GarnishmentOrderSerializer(serializers.ModelSerializer):
    paid = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        from docscanner_app.models import GarnishmentOrder
        model = GarnishmentOrder
        fields = "__all__"

    def _bal(self, obj):
        if not hasattr(obj, "_bal"):
            from .services import garnishment_balance
            obj._bal = garnishment_balance(obj)
        return obj._bal

    def get_paid(self, obj):
        return str(self._bal(obj)[0])

    def get_remaining(self, obj):
        r = self._bal(obj)[1]
        return None if r is None else str(r)

    def validate(self, data):
        method = data.get("method", getattr(self.instance, "method", "max"))
        if method == "percent" and not data.get("percent", getattr(self.instance, "percent", None)):
            raise serializers.ValidationError({"percent": "Nurodykite procentą"})
        if method == "fixed" and not data.get("amount", getattr(self.instance, "amount", None)):
            raise serializers.ValidationError({"amount": "Nurodykite sumą"})
        return data


class RecurringPayItemSerializer(serializers.ModelSerializer):
    pay_code_name = serializers.CharField(source="pay_code.name", read_only=True)
    pay_code_code = serializers.CharField(source="pay_code.code", read_only=True)

    class Meta:
        from docscanner_app.models import RecurringPayItem
        model = RecurringPayItem
        fields = "__all__"

    def validate(self, data):
        amount = data.get("amount", getattr(self.instance, "amount", None))
        percent = data.get("percent", getattr(self.instance, "percent", None))
        if bool(amount) == bool(percent):
            raise serializers.ValidationError("Nurodykite arba sumą, arba procentą")
        pc = data.get("pay_code", getattr(self.instance, "pay_code", None))
        if pc is not None and pc.category not in ("earning",):
            raise serializers.ValidationError({"pay_code": "Pasirinkite priedo / priemokos kodą"})
        return data
