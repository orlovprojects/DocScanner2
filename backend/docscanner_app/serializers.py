from rest_framework import serializers
from .models import CustomUser
from .models import ScannedDocument, LineItem, ProductAutocomplete, ClientAutocomplete, AdClick, GuideCategoryPage, GuidePage, MobileAccessKey, MobileInboxDocument
import json
from typing import Optional
from django.db.models import IntegerField, Value
from django.db.models.functions import Cast
from django.db.models import Case, When
from .utils.password_encryption import encrypt_password
from django.urls import reverse
from datetime import date
from decimal import Decimal
from django.utils import timezone

from .models import Payments, MeasurementUnit, InvoiceSeries, Product, RecurringInvoice, RecurringInvoiceLineItem, Invoice, InvoiceEmail, InvoiceSettings, RivileGamaAPIKey

from .utils.lineitem_rules import normalize_lineitem_rules


class LineItemSerializer(serializers.ModelSerializer):
    pvm_kodas_label = serializers.CharField(read_only=True, required=False)
    class Meta:
        model = LineItem
        fields = [
            'id',
            'line_id',
            'prekes_kodas',
            'prekes_barkodas',
            'prekes_pavadinimas',
            'prekes_tipas',
            'unit',
            'quantity',
            'price',
            'subtotal',
            'vat',
            'vat_percent',
            'total',
            'discount_wo_vat',
            'discount_with_vat',
            "pvm_kodas_label",

            # product autocomplete fields
            'sandelio_kodas',
            'sandelio_pavadinimas',
            'objekto_kodas',
            'objekto_pavadinimas',
            'padalinio_kodas',
            'padalinio_pavadinimas',
            'mokescio_kodas',
            'mokescio_pavadinimas',
            'atsakingo_asmens_kodas',
            'atsakingo_asmens_pavadinimas',
            'operacijos_kodas',
            'operacijos_pavadinimas',
            'islaidu_straipsnio_kodas',
            'islaidu_straipsnio_pavadinimas',
            'pvm_kodas',
            'pvm_pavadinimas',
            'tipo_kodas',
            'tipo_pavadinimas',
            'zurnalo_kodas',
            'zurnalo_pavadinimas',
            'projekto_kodas',
            'projekto_pavadinimas',
            'projekto_vadovo_kodas',
            'projekto_vadovo_pavadinimas',
            'skyrio_kodas',
            'skyrio_pavadinimas',
            'partijos_nr_kodas',
            'partijos_nr_pavadinimas',
            'korespondencijos_kodas',
            'korespondencijos_pavadinimas',
            'serijos_kodas',
            'serijos_pavadinimas',
            'centro_kodas',
            'centro_pavadinimas',
        ]

class ScannedDocumentSerializer(serializers.ModelSerializer):
    line_items = LineItemSerializer(many=True, read_only=True)

    class Meta:
        model = ScannedDocument
        fields = [
            'id',
            'original_filename',
            'status',
            'uploaded_at',
            'preview_url',
            'error_message',
            'similarity_percent',
            'scan_type',

            'document_type',
            'document_type_code',
            'seller_id_programoje',
            'seller_id',
            'seller_name',
            'seller_vat_code',
            'seller_address',
            'seller_country',
            'seller_country_iso',
            'seller_iban',
            'seller_is_person',
            'seller_vat_val',
            'buyer_id_programoje',
            'buyer_id',
            'buyer_name',
            'buyer_vat_code',
            'buyer_address',
            'buyer_country',
            'buyer_country_iso',
            'buyer_iban',
            'buyer_is_person',
            'buyer_vat_val',
            'invoice_date',
            'due_date',
            'operation_date',
            'document_series',
            'document_number',
            'order_number',
            'amount_wo_vat',
            'vat_amount',
            'vat_percent',
            'invoice_discount_with_vat',
            'invoice_discount_wo_vat',
            'amount_with_vat',
            'separate_vat',
            'currency',
            'with_receipt',
            'paid_by_cash',
            'note',
            'report_to_isaf',
            'xml_source',
            'pirkimas_pardavimas',
            'preke_paslauga',

            # product autocomplete fields
            'prekes_kodas',
            'prekes_barkodas',
            'prekes_pavadinimas',
            'prekes_tipas',
            'sandelio_kodas',
            'sandelio_pavadinimas',
            'objekto_kodas',
            'objekto_pavadinimas',
            'padalinio_kodas',
            'padalinio_pavadinimas',
            'mokescio_kodas',
            'mokescio_pavadinimas',
            'atsakingo_asmens_kodas',
            'atsakingo_asmens_pavadinimas',
            'operacijos_kodas',
            'operacijos_pavadinimas',
            'islaidu_straipsnio_kodas',
            'islaidu_straipsnio_pavadinimas',
            'pvm_kodas',
            'pvm_pavadinimas',
            'tipo_kodas',
            'tipo_pavadinimas',
            'zurnalo_kodas',
            'zurnalo_pavadinimas',
            'projekto_kodas',
            'projekto_pavadinimas',
            'projekto_vadovo_kodas',
            'projekto_vadovo_pavadinimas',
            'skyrio_kodas',
            'skyrio_pavadinimas',
            'partijos_nr_kodas',
            'partijos_nr_pavadinimas',
            'korespondencijos_kodas',
            'korespondencijos_pavadinimas',
            'serijos_kodas',
            'serijos_pavadinimas',
            'centro_kodas',
            'centro_pavadinimas',

            # lines
            'line_items',
        ]

#Dlia dashboarda - limited info
class ScannedDocumentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScannedDocument
        fields = [
            'id',
            'original_filename',
            'status',
            'uploaded_at',
            'preview_url',
            # Добавь, если нужно для фильтрации или отрисовки:
            'document_number',
            # 'amount_with_vat',
            'seller_name',
            'seller_id',
            'seller_vat_code',
            'seller_vat_val',
            'buyer_name',
            'buyer_id',
            'buyer_vat_code',
            'buyer_vat_val',
            'separate_vat',
            # 'val_ar_sutapo',
            # 'val_subtotal_match',
            # 'val_vat_match',
            # 'val_total_match',
            'pirkimas_pardavimas',
            'scan_type',
            'ready_for_export',
            'math_validation_passed',
            'optimum_api_status',
            'optimum_last_try_date',
            'dineta_api_status',
            'dineta_last_try_date',
            # ...и т.п., без тяжелых полей и line_items
        ]


# class ScannedDocumentDetailSerializer(serializers.ModelSerializer):
#     line_items = LineItemSerializer(many=True, read_only=True)

#     class Meta:
#         model = ScannedDocument
#         fields = "__all__"
#         extra_kwargs = {
#             "file": {"write_only": True},
#             "gpt_raw_json": {"write_only": True},
#             "raw_text": {"write_only": True},
#             "structured_json": {"write_only": True},
#             "glued_raw_text": {"write_only": True},
#         }

# class ScannedDocumentDetailSerializer(serializers.ModelSerializer):
#     line_items = serializers.SerializerMethodField()

#     class Meta:
#         model = ScannedDocument
#         fields = "__all__"
#         extra_kwargs = {
#             "file": {"write_only": True},
#             "gpt_raw_json": {"write_only": True},
#             "raw_text": {"write_only": True},
#             "structured_json": {"write_only": True},
#             "glued_raw_text": {"write_only": True},
#         }

#     def get_line_items(self, obj):
#         qs = obj.line_items.order_by("id")
#         return LineItemSerializer(qs, many=True).data



# class ScannedDocumentAdminDetailSerializer(serializers.ModelSerializer):
#     line_items = LineItemSerializer(many=True, read_only=True)

#     class Meta:
#         model = ScannedDocument
#         fields = "__all__"
#         extra_kwargs = {
#             "file": {"write_only": True},
#             # "gpt_raw_json": {"write_only": True},
#             "raw_text": {"write_only": True},
#             # ВАЖНО: НЕ помечаем как write_only, чтобы суперюзер их видел:
#             # "structured_json": {"write_only": True},   # ← не ставим
#             # "glued_raw_text": {"write_only": True},    # ← не ставим
#         }


class ScannedDocumentDetailSerializer(serializers.ModelSerializer):
    line_items_count = serializers.SerializerMethodField()

    class Meta:
        model = ScannedDocument
        exclude = ("file", "gpt_raw_json", "raw_text", "structured_json", "glued_raw_text")

    def get_line_items_count(self, obj):
        return obj.line_items.count()


class ScannedDocumentAdminDetailSerializer(serializers.ModelSerializer):
    line_items_count = serializers.SerializerMethodField()

    class Meta:
        model = ScannedDocument
        exclude = ("file", "raw_text")

    def get_line_items_count(self, obj):
        return obj.line_items.count()









# Autocomplete serializers

class AutocompleteProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductAutocomplete
        fields = [
            "id",
            "prekes_kodas",
            "prekes_barkodas",
            "prekes_pavadinimas",
            "prekes_tipas",
            "sandelio_kodas",
            "sandelio_pavadinimas",
            "objekto_kodas",
            "objekto_pavadinimas",
            "padalinio_kodas",
            "padalinio_pavadinimas",
            "mokescio_kodas",
            "mokescio_pavadinimas",
            "atsakingo_asmens_kodas",
            "atsakingo_asmens_pavadinimas",
            "operacijos_kodas",
            "operacijos_pavadinimas",
            "islaidu_straipsnio_kodas",
            "islaidu_straipsnio_pavadinimas",
            "pvm_kodas",
            "pvm_pavadinimas",
            "tipo_kodas",
            "tipo_pavadinimas",
            "zurnalo_kodas",
            "zurnalo_pavadinimas",
            "projekto_kodas",
            "projekto_pavadinimas",
            "projekto_vadovo_kodas",
            "projekto_vadovo_pavadinimas",
            "skyrio_kodas",
            "skyrio_pavadinimas",
            "partijos_nr_kodas",
            "partijos_nr_pavadinimas",
            "korespondencijos_kodas",
            "korespondencijos_pavadinimas",
            "serijos_kodas",
            "serijos_pavadinimas",
            "centro_kodas",
            "centro_pavadinimas",
        ]

class AutocompleteClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientAutocomplete
        fields = [
            "id",
            "kodas_programoje",
            "imones_kodas",
            "pavadinimas",
            "pvm_kodas",
            "ibans",
            "address",
            "country_iso",
        ]








































# Serializer dlia registracii, logina i xranenija zapisej o podpiskax
class DefaultsSerializer(serializers.Serializer):
    # --- Данные фирмы ---
    imones_pavadinimas = serializers.CharField(allow_blank=True, required=False)
    imones_kodas = serializers.CharField(allow_blank=True, required=False)
    imones_pvm_kodas = serializers.CharField(allow_blank=True, required=False)

    # --- Товарные дефолты ---
    pavadinimas = serializers.CharField(allow_blank=True, required=False)
    kodas = serializers.CharField(allow_blank=True, required=False)
    barkodas = serializers.CharField(allow_blank=True, required=False)

    # tipas может приходить как 1/2/3/4 или как "Preke"/"Paslauga"/"Kodas"
    tipas = serializers.CharField(required=False)

    def to_internal_value(self, data):
        d = super().to_internal_value(data)

        tipas = d.get("tipas", None)
        if tipas is not None:
            if isinstance(tipas, str):
                t = tipas.strip().lower()
                # строковые ярлыки по-прежнему мапим на 1/2/3
                mapping = {"preke": 1, "paslauga": 2, "kodas": 3}
                if t in mapping:
                    d["tipas"] = mapping[t]
                elif t.isdigit() and int(t) in (1, 2, 3, 4):
                    d["tipas"] = int(t)
                else:
                    raise serializers.ValidationError(
                        {"tipas": "Use 1/2/3/4 or 'Preke'/'Paslauga'/'Kodas'."}
                    )
            elif isinstance(tipas, int) and tipas in (1, 2, 3, 4):
                # уже валидное число (включая 4)
                pass
            else:
                raise serializers.ValidationError(
                    {"tipas": "Use 1/2/3/4 or 'Preke'/'Paslauga'/'Kodas'."}
                )
        return d


# Ваш основной сериализатор, дополненный полями дефолтов
from rest_framework import serializers
import json

FIRM_KEYS = ("imones_kodas", "imones_pvm_kodas", "imones_pavadinimas")

def _norm(s): return (str(s or "")).strip().upper()
def _firm_key_tuple(d): return tuple(_norm(d.get(k)) for k in FIRM_KEYS)

class CustomUserSerializer(serializers.ModelSerializer):
    credits = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)

    is_superuser = serializers.BooleanField(read_only=True)
    is_staff     = serializers.BooleanField(read_only=True)

    inbox_email_address = serializers.SerializerMethodField()

    # ВАЖНО: JSONField вместо many=True, чтобы принимать и dict (delete-команды), и list
    purchase_defaults = serializers.JSONField(required=False)
    sales_defaults    = serializers.JSONField(required=False)

    lineitem_rules    = serializers.JSONField(required=False)

    extra_settings    = serializers.JSONField(required=False, allow_null=True)

    rivile_erp_extra_fields = serializers.JSONField(required=False, allow_null=True)
    rivile_gama_extra_fields = serializers.JSONField(required=False, allow_null=True)
    butent_extra_fields      = serializers.JSONField(required=False, allow_null=True)
    finvalda_extra_fields    = serializers.JSONField(required=False, allow_null=True)
    centas_extra_fields      = serializers.JSONField(required=False, allow_null=True)
    agnum_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    optimum_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    dineta_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    debetas_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    site_pro_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    pragma3_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    pragma4_extra_fields       = serializers.JSONField(required=False, allow_null=True)

    class Meta:
        model = CustomUser
        fields = [
            'id','email','password','first_name','last_name',
            'stripe_customer_id','subscription_status','subscription_plan',
            'subscription_start_date','subscription_end_date',
            'credits','default_accounting_program',
            'company_name','company_code','vat_code',
            'company_iban','company_address','company_country_iso',
            'purchase_defaults','sales_defaults','view_mode',
            'extra_settings', 'is_superuser','is_staff', 'lineitem_rules',
            'rivile_erp_extra_fields', 'rivile_gama_extra_fields', 'butent_extra_fields','finvalda_extra_fields',
            'centas_extra_fields','agnum_extra_fields','debetas_extra_fields','site_pro_extra_fields',
            'pragma3_extra_fields', 'pragma4_extra_fields', 'optimum_extra_fields', 'dineta_extra_fields',
            'inbox_email_address'
        ]
        read_only_fields = ('credits',)
        extra_kwargs = {
            'password': {'write_only': True, 'required': True},
            'email':    {'required': True},
            'company_name': {'required': False},
            'company_code': {'required': False},
            'company_country_iso': {'required': False},
            'view_mode': {'required': False},
        }

    # --------- validators ----------
    def validate_view_mode(self, value):
        if value is None: return value
        v = str(value).lower()
        allowed = {CustomUser.VIEW_MODE_SINGLE, CustomUser.VIEW_MODE_MULTI}
        if v not in allowed:
            raise serializers.ValidationError("view_mode must be 'single' or 'multi'.")
        return v
    
    def get_inbox_email_address(self, obj):
        if obj.email_inbox_token:
            return f"{obj.email_inbox_token}@in.atlyginimoskaiciuokle.com"
        return None

    def validate_extra_settings(self, value):
        if value in (None, ""): return None
        if isinstance(value, str):
            try: value = json.loads(value)
            except Exception: raise serializers.ValidationError("extra_settings must be valid JSON")
        if not isinstance(value, dict):
            raise serializers.ValidationError("extra_settings must be a JSON object")
        return value

    def _validate_extra_dict(self, value, field_name):
        if value in (None, ""):
            return {}
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except Exception:
                raise serializers.ValidationError(f"{field_name} must be valid JSON")
        if not isinstance(value, dict):
            raise serializers.ValidationError(f"{field_name} must be a JSON object")
    
        # ── Защита nested структуры ──
        # Если пришёл плоский dict (старый фронтенд), а на сервере уже nested —
        # оборачиваем в __all__, сохраняя остальные per-company профили.
        incoming_is_flat = (
            "__all__" not in value
            and any("_" in k and not k.startswith("__") for k in value)
        )
    
        if incoming_is_flat and self.instance:
            current = getattr(self.instance, field_name, None)
            if isinstance(current, dict) and "__all__" in current:
                # Сервер уже nested, а фронтенд шлёт плоский → wrap в __all__
                merged = dict(current)  # копия со всеми per-company профилями
                merged["__all__"] = value  # обновляем только __all__
                return merged
    
        return value


    def validate_rivile_erp_extra_fields(self, value):
        return self._validate_extra_dict(value, "rivile_erp_extra_fields")

    def validate_rivile_gama_extra_fields(self, value):
        return self._validate_extra_dict(value, "rivile_gama_extra_fields")

    def validate_butent_extra_fields(self, value):
        return self._validate_extra_dict(value, "butent_extra_fields")

    def validate_finvalda_extra_fields(self, value):
        return self._validate_extra_dict(value, "finvalda_extra_fields")

    def validate_centas_extra_fields(self, value):
        return self._validate_extra_dict(value, "centas_extra_fields")

    def validate_agnum_extra_fields(self, value):
        return self._validate_extra_dict(value, "agnum_extra_fields")
    
    def validate_optimum_extra_fields(self, value):
        return self._validate_extra_dict(value, "optimum_extra_fields")
    
    def validate_dineta_extra_fields(self, value):
        return self._validate_extra_dict(value, "dineta_extra_fields")
    
    def validate_debetas_extra_fields(self, value):
        return self._validate_extra_dict(value, "debetas_extra_fields")
    
    def validate_site_pro_extra_fields(self, value):
        return self._validate_extra_dict(value, "site_pro_extra_fields")
    
    def validate_pragma3_extra_fields(self, value):
        return self._validate_extra_dict(value, "pragma3_extra_fields")
    
    def validate_pragma4_extra_fields(self, value):
        return self._validate_extra_dict(value, "pragma4_extra_fields")



    # --------- helpers ----------
    def _coerce_defaults_input(self, incoming, field_name):
        """
        Принимает то, что пришло в purchase_defaults / sales_defaults:
        - строка JSON -> парсим
        - dict c командами удаления -> вернём (None, delete_index, delete_match)
        - обычный dict -> завернём в список
        - список -> как есть
        """
        if incoming is None:
            return (None, None, None)

        if isinstance(incoming, str):
            try:
                incoming = json.loads(incoming)
            except Exception:
                raise serializers.ValidationError({field_name: "must be valid JSON"})

        # delete по индексу
        if isinstance(incoming, dict) and "__delete_index__" in incoming:
            di = incoming["__delete_index__"]
            if not isinstance(di, int) or di < 0:
                raise serializers.ValidationError({field_name: {"__delete_index__": "must be non-negative integer"}})
            return (None, di, None)

        # delete по совпадению фирмы
        if isinstance(incoming, dict) and "__delete_match__" in incoming:
            dm = incoming["__delete_match__"]
            if not isinstance(dm, dict):
                raise serializers.ValidationError({field_name: {"__delete_match__": "must be object"}})
            dm = {k: dm.get(k) for k in FIRM_KEYS if dm.get(k)}
            if not dm:
                raise serializers.ValidationError({field_name: {"__delete_match__": f"provide at least one of {FIRM_KEYS}"}})
            return (None, None, dm)

        # обычные данные
        if isinstance(incoming, dict):
            return ([incoming], None, None)
        if isinstance(incoming, list):
            return (incoming, None, None)

        raise serializers.ValidationError({field_name: "must be an object or an array"})

    def _validate_profile_list(self, lst, field_name):
        """
        Валидируем каждый профиль через DefaultsSerializer (нормализует tipas и пр.).
        """
        out = []
        for i, item in enumerate(lst or []):
            ser = DefaultsSerializer(data=item)
            ser.is_valid(raise_exception=True)
            out.append(ser.validated_data)
        return out

    def _apply_delete_to_list(self, cur_list, delete_index=None, delete_match=None):
        if delete_index is not None:
            if delete_index >= len(cur_list):
                raise serializers.ValidationError({"__delete_index__": "index out of range"})
            del cur_list[delete_index]
            return
        if delete_match is not None:
            goal = {k: _norm(v) for k, v in delete_match.items()}
            def _matches(item): return all(_norm(item.get(k)) == v for k, v in goal.items())
            cur_list[:] = [it for it in cur_list if not _matches(it)]

    def _merge_defaults_list(self, instance_list, incoming_list):
        """
        PATCH-мердж по фирме: если совпал ключ (имя/код/PVM-код) — обновляем, иначе добавляем.
        """
        index = {_firm_key_tuple(it): i for i, it in enumerate(instance_list)}
        for item in incoming_list:
            k = _firm_key_tuple(item)
            if any(k):
                if k in index:
                    instance_list[index[k]].update(item)
                else:
                    instance_list.append(item)
            else:
                instance_list.append(item)




    def create(self, validated_data):
        password = validated_data.pop('password')

        # забираем «сырые» payload (могут содержать команды удаления)
        raw_pd = self.initial_data.get('purchase_defaults', None)
        raw_sd = self.initial_data.get('sales_defaults', None)

        # 🔹 НОВОЕ: сырые правила по строкам
        raw_lr = self.initial_data.get('lineitem_rules', None)

        # extra_settings уже провалидирован
        extra   = validated_data.pop('extra_settings', None)

        rivile_extra = validated_data.pop('rivile_erp_extra_fields', None)
        rivile_gama_extra = validated_data.pop('rivile_gama_extra_fields', None)
        butent_extra   = validated_data.pop('butent_extra_fields', None)
        finvalda_extra = validated_data.pop('finvalda_extra_fields', None)
        centas_extra   = validated_data.pop('centas_extra_fields', None)
        agnum_extra    = validated_data.pop('agnum_extra_fields', None)
        optimum_extra    = validated_data.pop('optimum_extra_fields', None)
        dineta_extra    = validated_data.pop('dineta_extra_fields', None)
        debetas_extra    = validated_data.pop('debetas_extra_fields', None)
        site_pro_extra    = validated_data.pop('site_pro_extra_fields', None)
        pragma3_extra    = validated_data.pop('pragma3_extra_fields', None)
        pragma4_extra    = validated_data.pop('pragma4_extra_fields', None)

        user = CustomUser.objects.create_user(password=password, **validated_data)
        user.credits = 50

        # стартуем со списков
        user.purchase_defaults = []
        user.sales_defaults = []

        # обработка purchase_defaults
        lst, di, dm = self._coerce_defaults_input(raw_pd, 'purchase_defaults')
        if lst is not None:
            lst = self._validate_profile_list(lst, 'purchase_defaults')
            user.purchase_defaults = lst

        # обработка sales_defaults
        lst, di, dm = self._coerce_defaults_input(raw_sd, 'sales_defaults')
        if lst is not None:
            lst = self._validate_profile_list(lst, 'sales_defaults')
            user.sales_defaults = lst

        # 🔹 НОВОЕ: lineitem_rules — полная замена/установка списка
        if raw_lr is not None:
            user.lineitem_rules = normalize_lineitem_rules(raw_lr)
        else:
            user.lineitem_rules = []

        if extra is not None:
            user.extra_settings = extra   # ПОЛНАЯ ЗАМЕНА

        if rivile_extra is not None:
            user.rivile_erp_extra_fields = rivile_extra

        if rivile_gama_extra is not None:
            user.rivile_gama_extra_fields = rivile_gama_extra

        if butent_extra is not None:
            user.butent_extra_fields = butent_extra

        if finvalda_extra is not None:
            user.finvalda_extra_fields = finvalda_extra

        if centas_extra is not None:
            user.centas_extra_fields = centas_extra

        if agnum_extra is not None:
            user.agnum_extra_fields = agnum_extra

        if optimum_extra is not None:
            user.optimum_extra_fields = optimum_extra

        if dineta_extra is not None:
            user.agnum_dineta_fields = dineta_extra

        if debetas_extra is not None:
            user.debetas_extra_fields = debetas_extra

        if site_pro_extra is not None:
            user.site_pro_extra_fields = site_pro_extra

        if pragma3_extra is not None:
            user.pragma3_extra_fields = pragma3_extra

        if pragma4_extra is not None:
            user.pragma4_extra_fields = pragma4_extra

        user.save(update_fields=[
            'credits','purchase_defaults','sales_defaults',
            'extra_settings','lineitem_rules',
            'rivile_erp_extra_fields', 'rivile_gama_extra_fields',
            'butent_extra_fields','finvalda_extra_fields',
            'centas_extra_fields','agnum_extra_fields', 'debetas_extra_fields',
            'site_pro_extra_fields', 'pragma3_extra_fields', 'pragma4_extra_fields', 'optimum_extra_fields', 'dineta_extra_fields',
        ])
        return user
    




    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)

        # текущие списки
        cur_pd = list(instance.purchase_defaults or [])
        cur_sd = list(instance.sales_defaults or [])

        # сырые входные (могут быть delete-команды) для sumiskai defaults
        raw_pd = self.initial_data.get('purchase_defaults', None)
        raw_sd = self.initial_data.get('sales_defaults', None)

        # 🔹 для lineitem_rules НИКАКИХ спец-команд — только список целиком
        raw_lr = self.initial_data.get('lineitem_rules', None)

        # какой метод
        method = (self.context.get('request').method.upper()
                if self.context.get('request') else 'PATCH')

        # --- purchase_defaults ---
        lst, di, dm = self._coerce_defaults_input(raw_pd, 'purchase_defaults')
        if di is not None or dm is not None:
            self._apply_delete_to_list(cur_pd, di, dm)
        elif lst is not None:
            lst = self._validate_profile_list(lst, 'purchase_defaults')
            if method == 'PATCH':
                self._merge_defaults_list(cur_pd, lst)
            else:
                cur_pd = lst

        # --- sales_defaults ---
        lst, di, dm = self._coerce_defaults_input(raw_sd, 'sales_defaults')
        if di is not None or dm is not None:
            self._apply_delete_to_list(cur_sd, di, dm)
        elif lst is not None:
            lst = self._validate_profile_list(lst, 'sales_defaults')
            if method == 'PATCH':
                self._merge_defaults_list(cur_sd, lst)
            else:
                cur_sd = lst

        # extra_settings — ПОЛНАЯ ЗАМЕНА
        if 'extra_settings' in validated_data:
            instance.extra_settings = validated_data.pop('extra_settings')

        if 'rivile_erp_extra_fields' in validated_data:
            instance.rivile_erp_extra_fields = validated_data.pop('rivile_erp_extra_fields')

        if 'rivile_gama_extra_fields' in validated_data:
            instance.rivile_gama_extra_fields = validated_data.pop('rivile_gama_extra_fields')

        if 'butent_extra_fields' in validated_data:
            instance.butent_extra_fields = validated_data.pop('butent_extra_fields')

        if 'finvalda_extra_fields' in validated_data:
            instance.finvalda_extra_fields = validated_data.pop('finvalda_extra_fields')

        if 'centas_extra_fields' in validated_data:
            instance.centas_extra_fields = validated_data.pop('centas_extra_fields')

        if 'agnum_extra_fields' in validated_data:
            instance.agnum_extra_fields = validated_data.pop('agnum_extra_fields')

        if 'optimum_extra_fields' in validated_data:
            instance.optimum_extra_fields = validated_data.pop('optimum_extra_fields')

        if 'dineta_extra_fields' in validated_data:
            instance.dineta_extra_fields = validated_data.pop('dineta_extra_fields')

        if 'debetas_extra_fields' in validated_data:
            instance.debetas_extra_fields = validated_data.pop('debetas_extra_fields')

        if 'site_pro_extra_fields' in validated_data:
            instance.site_pro_extra_fields = validated_data.pop('site_pro_extra_fields')

        if 'pragma3_extra_fields' in validated_data:
            instance.pragma3_extra_fields = validated_data.pop('pragma3_extra_fields')

        if 'pragma4_extra_fields' in validated_data:
            instance.pragma4_extra_fields = validated_data.pop('pragma4_extra_fields')

        # 🔹 lineitem_rules — ПОЛНАЯ ЗАМЕНА СПИСКА
        # фронт всегда шлёт текущий список (с нужным правилом удалённым/изменённым)
        if raw_lr is not None:
            instance.lineitem_rules = normalize_lineitem_rules(raw_lr)

        # остальные поля
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.purchase_defaults = cur_pd
        instance.sales_defaults = cur_sd

        instance.save()
        return instance



class CustomUserAdminListSerializer(CustomUserSerializer):
    """
    Упрощённый сериалайзер для страницы суперюзера:
    без подписочных и Stripe-полей, без password.
    """
    last_payment_date = serializers.SerializerMethodField()
    inv_subscription_status = serializers.SerializerMethodField()
    total_spent = serializers.SerializerMethodField()

    class Meta(CustomUserSerializer.Meta):
        model = CustomUser
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'is_active', 'is_staff', 'is_superuser',
            'date_joined', 'last_login',
            'credits', 'default_accounting_program',
            'company_name', 'company_code', 'vat_code',
            'company_iban', 'company_address', 'company_country_iso',
            'purchase_defaults', 'sales_defaults',
            'extra_settings', 'lineitem_rules',
            'stripe_customer_id',
            # Новые поля:
            'last_payment_date',
            'inv_subscription_status',
            'total_spent',
        ]
        read_only_fields = getattr(CustomUserSerializer.Meta, 'read_only_fields', ('credits',))

    def get_last_payment_date(self, obj):
        """Дата последнего платежа за credits (skaitmenizavimas)"""
        last = obj.payments.filter(
            payment_status='paid',
            payment_type='credits'
        ).order_by('-paid_at').first()
        return last.paid_at.isoformat() if last else None

    def get_inv_subscription_status(self, obj):
        """Статус подписки Išrašymas"""
        try:
            sub = obj.inv_subscription
        except:
            return None
        
        if sub.status == 'trial':
            return 'trial_active'
        elif sub.status == 'active':
            plan = (sub.plan or '').lower()
            if 'yearly' in plan or 'annual' in plan or 'metinis' in plan:
                return 'yearly'
            return 'monthly'
        elif sub.trial_used:
            return 'trial_expired'
        return None

    def get_total_spent(self, obj):
        """Сколько user всего потратил (EUR)"""
        from django.db.models import Sum
        total = obj.payments.filter(
            payment_status='paid'
        ).aggregate(total=Sum('amount_total'))['total']
        
        if total:
            return round(total / 100, 2)  # cents -> EUR
        return None




# Wagtail serializers
# ---------- helpers ----------
def rendition_url(img, spec="fill-800x450|jpegquality-70") -> str:
    """
    Безопасно вернуть URL рендишна Wagtail Image.
    """
    if not img:
        return ""
    try:
        return img.get_rendition(spec).url
    except Exception:
        try:
            return img.file.url
        except Exception:
            return ""
        


def _get_category_of(obj) -> Optional[GuideCategoryPage]:
    try:
        parent = obj.get_parent().specific
    except Exception:
        return None
    return parent if isinstance(parent, GuideCategoryPage) else None


# ==========================
# 1) СПИСОК КАТЕГОРИЙ
# ==========================
class GuideCategoryListSerializer(serializers.ModelSerializer):
    cat_image_url = serializers.SerializerMethodField()
    articles_count = serializers.SerializerMethodField()

    class Meta:
        model = GuideCategoryPage
        fields = (
            "title",
            "slug",
            "description",
            "order",
            "cat_image_url",
            "articles_count",
        )

    def get_cat_image_url(self, obj):
        return rendition_url(obj.cat_image, spec="fill-800x450|jpegquality-70")

    def get_articles_count(self, obj):
        return GuidePage.objects.child_of(obj).live().public().count()


# ==========================
# 2) СПИСОК СТАТЕЙ (карточки)
# ==========================
class GuideArticleListSerializer(serializers.ModelSerializer):
    main_image_url = serializers.SerializerMethodField()
    # 🔹 ново:
    category_slug = serializers.SerializerMethodField()
    category_title = serializers.SerializerMethodField()

    class Meta:
        model = GuidePage
        fields = (
            "id",
            "title",
            "slug",
            "author_name",
            "first_published_at",
            "last_published_at",
            "main_image_url",
            # 🔹 ново:
            "category_slug",
            "category_title",
        )

    def get_main_image_url(self, obj):
        return rendition_url(obj.main_image, spec="fill-800x450|jpegquality-70")

    # 🔹 ново:
    def get_category_slug(self, obj):
        cat = _get_category_of(obj)
        return cat.slug if cat else None

    def get_category_title(self, obj):
        cat = _get_category_of(obj)
        return cat.title if cat else None



# (опционально) Детальная категория с вшитыми статьями
# Можно использовать для эндпоинта /guide-categories/<slug>/
class GuideCategoryDetailSerializer(GuideCategoryListSerializer):
    articles = serializers.SerializerMethodField()

    class Meta(GuideCategoryListSerializer.Meta):
        fields = GuideCategoryListSerializer.Meta.fields + ("articles",)

    def get_articles(self, obj):
        request = self.context.get("request")
        limit = int(request.query_params.get("limit", 100)) if request else 100
        offset = int(request.query_params.get("offset", 0)) if request else 0

        qs = (
            GuidePage.objects.child_of(obj)
            .live()
            .public()
            .specific()
            .order_by("-first_published_at")
        )
        items = qs[offset : offset + limit]
        return GuideArticleListSerializer(items, many=True, context=self.context).data


# ==========================
# 3) ДЕТАЛЬ СТАТЬИ
# ==========================

def _rendition_url(img, spec="fill-1200x675|jpegquality-70"):
    if not img:
        return ""
    try:
        return img.get_rendition(spec).url
    except Exception:
        try:
            return img.file.url
        except Exception:
            return ""

class GuideArticleDetailSerializer(serializers.ModelSerializer):
    main_image_url = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()
    # 🔹 ново:
    category_slug = serializers.SerializerMethodField()
    category_title = serializers.SerializerMethodField()

    class Meta:
        model = GuidePage
        fields = (
            "id",
            "title",
            "slug",
            "seo_title",
            "search_description",
            "author_name",
            "first_published_at",
            "last_published_at",
            "main_image_url",
            "body",
            # 🔹 ново:
            "category_slug",
            "category_title",
        )

    def get_main_image_url(self, obj):
        return _rendition_url(obj.main_image)

    def get_body(self, obj):
        """
        Возвращаем body как list[{'type': ..., 'value': ...}],
        убирая несериализуемые внутренние объекты Wagtail.
        """
        val = obj.body

        # 1) Обычный StreamValue у Wagtail
        if hasattr(val, "stream_data"):
            try:
                return val.stream_data  # уже список словарей
            except Exception:
                pass
            try:
                # форсируем в prep_value
                return [b.get_prep_value() for b in val]
            except Exception:
                pass

        # 2) Уже list
        if isinstance(val, list):
            return val

        # 3) Обёртка dict ({'stream': [...]} или {'blocks': [...]})
        if isinstance(val, dict):
            stream = val.get("stream")
            blocks = val.get("blocks")
            if isinstance(stream, list):
                return stream
            if isinstance(blocks, list):
                return blocks

        # 4) Бывает RawDataView в raw_data → приводим к dict
        if hasattr(val, "raw_data"):
            try:
                return [dict(item) for item in val.raw_data]
            except Exception:
                try:
                    return [b.get_prep_value() for b in val]
                except Exception:
                    pass

        # 5) Строка → параграф
        if isinstance(val, str) and val.strip():
            return [{"type": "paragraph", "value": val}]

        # 6) Ничего
        return []
    

    def get_category_slug(self, obj):
        cat = _get_category_of(obj)
        return cat.slug if cat else None

    def get_category_title(self, obj):
        cat = _get_category_of(obj)
        return cat.title if cat else None




class DinetaSettingsSerializer(serializers.Serializer):
    # --- Фронт отправляет url, мы парсим в server + client ---
    url = serializers.CharField(
        max_length=200,
        required=False,        # не требуется при GET (to_representation)
        allow_blank=True,
        help_text="Dineta URL, pvz.: https://lt4.dineta.eu/dokskenas/login.php",
    )
    username = serializers.CharField(max_length=100)
    password = serializers.CharField(
        write_only=True,
        required=False,        # при повторном PUT можно не менять пароль
        allow_blank=True,
        style={"input_type": "password"},
    )

    storeid = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True,
    )
    posid = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True,
    )

    def validate_url(self, value):
        """Проверяем что URL содержит .dineta.eu и из него можно извлечь server/client."""
        if not value:
            return value
        from docscanner_app.exports.dineta import parse_dineta_url, DinetaError
        try:
            server, client = parse_dineta_url(value)
        except DinetaError as e:
            raise serializers.ValidationError(str(e))
        # Сохраняем разобранные значения для build_settings_dict
        self._parsed_server = server
        self._parsed_client = client
        return value

    def to_representation(self, instance):
        if instance is None:
            return {}
        data = dict(instance)

        # Password masking
        if data.get("password"):
            data["password"] = "••••••••"
        else:
            data["password"] = ""

        server = data.pop("server", "")
        client = data.pop("client", "")
        if server and client:
            if server.startswith("http"):
                data["url"] = f"{server}/{client}/"
            else:
                data["url"] = f"https://{server}.dineta.eu/{client}/"
        else:
            data["url"] = ""

        return data

    def build_settings_dict(self):
        """
        Вызываем после is_valid().
        Возвращает dict для CustomUser.dineta_settings:
        {
            "server": "lt4",
            "client": "ivesklt",
            "username": "...",
            "password": "<encrypted>",
            "storeid": "",
            "posid": "",
        }
        """
        data = dict(self.validated_data)

        # URL → server + client
        url = data.pop("url", "")
        if url:
            data["server"] = getattr(self, "_parsed_server", "")
            data["client"] = getattr(self, "_parsed_client", "")
        else:
            # Если url не передан (повторный PUT без смены URL) —
            # сохраняем старые server/client из текущих настроек
            raise serializers.ValidationError(
                {"url": "Dineta URL yra privalomas"}
            )

        # Пароль
        raw_password = data.pop("password", None)
        if raw_password and raw_password != "••••••••":
            data["password"] = encrypt_password(raw_password)
        else:
            # Пароль не передан — оставляем старый из текущих настроек
            current = getattr(self, "instance", None)
            if isinstance(current, dict) and current.get("password"):
                data["password"] = current["password"]
            else:
                raise serializers.ValidationError(
                    {"password": "Slaptažodis yra privalomas"}
                )

        return data

    


class OptimumSettingsSerializer(serializers.Serializer):
    key = serializers.CharField(write_only=True)

    # метаданные (возвращаем наружу, key не возвращаем)
    verified_at = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    last_ok = serializers.BooleanField(required=False)
    last_error_at = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    last_error = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def to_representation(self, instance):
        """
        instance — dict из user.optimum_settings.
        key наружу не отдаём.
        """
        if instance is None:
            return None
        data = dict(instance)
        if data.get("password"):
            data["password"] = "••••••••"
        else:
            data["password"] = ""
        return data

    def build_success_settings_dict(self, *, verified_at: str):
        """
        После is_valid(): строим dict для сохранения при SUCCESS.
        """
        raw_key = (self.validated_data.get("key") or "").strip()
        if not raw_key:
            raise serializers.ValidationError({"key": "Key is required"})

        return {
            "key": encrypt_password(raw_key),
            "verified_at": verified_at,
            "last_ok": True,
            # очищаем ошибку
            "last_error_at": None,
            "last_error": "",
        }

    @staticmethod
    def build_error_patch(*, error_at: str, error_msg: str):
        """
        Patch для сохранения при ERROR (key не трогаем!).
        """
        return {
            "last_ok": False,
            "last_error_at": error_at,
            "last_error": (error_msg or "")[:300],  # коротко, чтобы не раздувать JSON
        }
    


class MobileAccessKeySerializer(serializers.ModelSerializer):
    # фронт шлёт "email", а в модели sender_email – мапим через source
    email = serializers.EmailField(source="sender_email")

    class Meta:
        model = MobileAccessKey
        fields = [
            "id",
            "email",        # -> sender_email
            "label",
            "key_last4",
            "is_active",
            "created_at",
            "last_used_at",
            "revoked_at",
        ]
        read_only_fields = [
            "id",
            "key_last4",
            "created_at",
            "last_used_at",
            "revoked_at",
        ]



class MobileInboxDocumentSerializer(serializers.ModelSerializer):
    scanned_document_id = serializers.IntegerField(
        source="processed_document_id",
        read_only=True,
    )
    sender_label = serializers.CharField(
        source="access_key.label",
        read_only=True,
    )

    class Meta:
        model = MobileInboxDocument
        fields = [
            "id",
            "original_filename",
            "size_bytes",
            "page_count",
            "sender_email",
            "sender_label",
            "created_at",
            "preview_url",      
            "is_processed",     
            "scanned_document_id",
            "source",
        ]



class PaymentSerializer(serializers.ModelSerializer):
    invoice_url = serializers.SerializerMethodField()

    class Meta:
        model = Payments
        fields = [
            'id',
            'paid_at',
            'credits_purchased',
            'net_amount',
            'currency',
            'dok_number',
            'invoice_url',
        ]

    def get_invoice_url(self, obj):
        """
        Вернём абсолютный URL до API-эндпоинта PDF/данных для PDF.
        Пока сделаем URL вида /api/payments/<id>/invoice/
        """
        request = self.context.get('request')
        if not request:
            return None

        url = reverse('payments-invoice', kwargs={'pk': obj.pk})
        return request.build_absolute_uri(url)






# class GuideCategorySerializer(serializers.ModelSerializer):
#     cat_image_url = serializers.SerializerMethodField()

#     class Meta:
#         model = GuideCategoryPage
#         fields = ("title", "slug", "description", "order", "cat_image_url")

#     def get_cat_image_url(self, obj):
#         # Если есть картинка — вернём удобный рендишн (быстрее и легче),
#         # иначе пустую строку.
#         if getattr(obj, "cat_image", None):
#             try:
#                 # Подбери размер под карточку (16:9). Можно 800x450.
#                 rendition = obj.cat_image.get_rendition("fill-800x450|jpegquality-70")
#                 return rendition.url
#             except Exception:
#                 # Fallback на оригинал (редко потребуется)
#                 try:
#                     return obj.cat_image.file.url
#                 except Exception:
#                     return ""
#         return ""

# class GuideCategoryViewSet(viewsets.ReadOnlyModelViewSet):
#     """
#     Публичный read-only список категорий гида.
#     Возвращает только опубликованные страницы.
#     """
#     queryset = GuideCategoryPage.objects.live().public().order_by("order", "title")
#     serializer_class = GuideCategorySerializer











# class CustomUserSerializer(serializers.ModelSerializer):
#     credits = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)
#     purchase_defaults = DefaultsSerializer(required=False)
#     sales_defaults = DefaultsSerializer(required=False)
#     extra_settings = serializers.JSONField(required=False, allow_null=True)

#     class Meta:
#         model = CustomUser
#         fields = [
#             'id', 'email', 'password', 'first_name', 'last_name',
#             'stripe_customer_id', 'subscription_status', 'subscription_plan',
#             'subscription_start_date', 'subscription_end_date',
#             'credits', 'default_accounting_program',
#             'company_name', 'company_code', 'vat_code',
#             'company_iban', 'company_address', 'company_country_iso',
#             'purchase_defaults', 'sales_defaults', 'view_mode',
#             'extra_settings',
#         ]
#         read_only_fields = ('credits',)
#         extra_kwargs = {
#             'password': {'write_only': True, 'required': True},
#             'email':    {'required': True},
#             'company_name': {'required': False},
#             'company_code': {'required': False},
#             'company_country_iso': {'required': False},
#             'view_mode': {'required': False},
#         }

#     def validate_extra_settings(self, value):
#         """
#         Принимаем dict или JSON-строку.
#         Храним как dict, где ключи = активные флаги.
#         Пример: {"operation_date=document_date": 1}
#         """
#         if value in (None, ""):
#             return None
#         if isinstance(value, str):
#             import json
#             try:
#                 value = json.loads(value)
#             except Exception:
#                 raise serializers.ValidationError("extra_settings must be valid JSON")
#         if not isinstance(value, dict):
#             raise serializers.ValidationError("extra_settings must be a JSON object")
#         return value

#     def _merge_defaults(self, instance, validated_data, key):
#         if key not in validated_data:
#             return
#         cur = getattr(instance, key, {}) or {}
#         new = validated_data.pop(key) or {}
#         cur.update(new)
#         setattr(instance, key, cur)

#     def _merge_extra_settings(self, instance, validated_data):
#         if 'extra_settings' not in validated_data:
#             return
#         new = validated_data.pop('extra_settings')
#         request = self.context.get('request')
#         method = (request.method.upper() if request else 'PATCH')

#         if method == 'PATCH':
#             cur = instance.extra_settings or {}
#             if isinstance(cur, dict) and isinstance(new, dict):
#                 cur.update(new)
#                 instance.extra_settings = cur
#                 return
#         instance.extra_settings = new

#     def create(self, validated_data):
#         password = validated_data.pop('password')
#         purchase_defaults = validated_data.pop('purchase_defaults', None)
#         sales_defaults    = validated_data.pop('sales_defaults', None)
#         extra_settings    = validated_data.pop('extra_settings', None)

#         user = CustomUser.objects.create_user(password=password, **validated_data)
#         user.credits = 50
#         if purchase_defaults:
#             base = user.purchase_defaults or {}
#             base.update(purchase_defaults)
#             user.purchase_defaults = base
#         if sales_defaults:
#             base = user.sales_defaults or {}
#             base.update(sales_defaults)
#             user.sales_defaults = base
#         if extra_settings is not None:
#             user.extra_settings = extra_settings
#         user.save(update_fields=['credits', 'purchase_defaults', 'sales_defaults', 'extra_settings'])
#         return user

#     def update(self, instance, validated_data):
#         password = validated_data.pop('password', None)
#         self._merge_defaults(instance, validated_data, 'purchase_defaults')
#         self._merge_defaults(instance, validated_data, 'sales_defaults')
#         self._merge_extra_settings(instance, validated_data)
#         for attr, value in validated_data.items():
#             setattr(instance, attr, value)
#         if password:
#             instance.set_password(password)
#         instance.save()
#         return instance



class ViewModeSerializer(serializers.Serializer):
    view_mode = serializers.ChoiceField(choices=[
        (CustomUser.VIEW_MODE_SINGLE, 'single'),
        (CustomUser.VIEW_MODE_MULTI, 'multi'),
    ])





# class CustomUserSerializer(serializers.ModelSerializer):
#     credits = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)
#     purchase_defaults = DefaultsSerializer(required=False)
#     sales_defaults = DefaultsSerializer(required=False)

#     class Meta:
#         model = CustomUser
#         fields = [
#             'id', 'email', 'password', 'first_name', 'last_name',
#             'stripe_customer_id', 'subscription_status', 'subscription_plan',
#             'subscription_start_date', 'subscription_end_date',
#             'credits', 'default_accounting_program',
#             'company_name', 'company_code', 'vat_code',
#             'company_iban', 'company_address', 'company_country_iso',
#             'purchase_defaults', 'sales_defaults', 'view_mode',
#         ]
#         read_only_fields = ('credits',)
#         extra_kwargs = {
#             'password': {'write_only': True, 'required': True},
#             'email':    {'required': True},
#             'company_name': {'required': False},
#             'company_code': {'required': False},
#             'company_country_iso': {'required': False},
#         }

#     # Хелпер: аккуратно мерджим JSON-дефолты, не затирая отсутствующие ключи
#     def _merge_defaults(self, instance, validated_data, key):
#         if key not in validated_data:
#             return
#         cur = getattr(instance, key, {}) or {}
#         new = validated_data.pop(key) or {}
#         cur.update(new)  # обновляем только переданные поля
#         setattr(instance, key, cur)

#     def create(self, validated_data):
#         password = validated_data.pop('password')
#         # вытащим дефолты (если пришли) до create_user
#         purchase_defaults = validated_data.pop('purchase_defaults', None)
#         sales_defaults = validated_data.pop('sales_defaults', None)

#         user = CustomUser.objects.create_user(password=password, **validated_data)

#         # стартовые кредиты (как у вас)
#         user.credits = 50

#         # применим дефолты, если прислали
#         if purchase_defaults:
#             base = user.purchase_defaults or {}
#             base.update(purchase_defaults)
#             user.purchase_defaults = base
#         if sales_defaults:
#             base = user.sales_defaults or {}
#             base.update(sales_defaults)
#             user.sales_defaults = base

#         user.save(update_fields=['credits', 'purchase_defaults', 'sales_defaults'])
#         return user

#     def update(self, instance, validated_data):
#         password = validated_data.pop('password', None)

#         # сначала мерджим JSON-дефолты (если пришли)
#         self._merge_defaults(instance, validated_data, 'purchase_defaults')
#         self._merge_defaults(instance, validated_data, 'sales_defaults')

#         # остальные простые поля
#         for attr, value in validated_data.items():
#             setattr(instance, attr, value)

#         if password:
#             instance.set_password(password)

#         instance.save()
#         return instance

#     def validate(self, attrs):
#         # При PATCH требуем обязательные поля (ваша логика)
#         request = self.context.get('request')
#         if request and request.method == 'PATCH':
#             required = ['company_name', 'company_code', 'company_country_iso']
#             for field in required:
#                 if field in attrs and not attrs[field]:
#                     raise serializers.ValidationError({field: 'This field is required.'})
#         return attrs















# class CustomUserSerializer(serializers.ModelSerializer):
#     credits = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)

#     class Meta:
#         model = CustomUser
#         fields = [
#             'id', 'email', 'password', 'first_name', 'last_name',
#             'stripe_customer_id', 'subscription_status', 'subscription_plan',
#             'subscription_start_date', 'subscription_end_date',
#             'credits', 'default_accounting_program',
#             'company_name', 'company_code', 'vat_code',
#             'company_iban', 'company_address', 'company_country_iso'
#         ]
#         read_only_fields = ('credits',)
#         extra_kwargs = {
#             'password': {'write_only': True, 'required': True},
#             'email':    {'required': True},
#             'company_name': {'required': False},
#             'company_code': {'required': False},
#             'company_country_iso': {'required': False},
#         }

#     def create(self, validated_data):
#         password = validated_data.pop('password')
#         user = CustomUser.objects.create_user(password=password, **validated_data)
#         user.credits = 50
#         user.save(update_fields=['credits'])
#         return user

#     def update(self, instance, validated_data):
#         password = validated_data.pop('password', None)
#         for attr, value in validated_data.items():
#             setattr(instance, attr, value)
#         if password:
#             instance.set_password(password)
#         instance.save()
#         return instance

#     def validate(self, attrs):
#         # При PATCH требуем обязательные поля
#         request = self.context.get('request')
#         if request and request.method == 'PATCH':
#             required = ['company_name', 'company_code', 'company_country_iso']
#             for field in required:
#                 # Если явно приходит None или пустая строка, это ошибка
#                 if field in attrs and not attrs[field]:
#                     raise serializers.ValidationError({field: 'This field is required.'})
#         return attrs
    


class AdClickSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdClick
        fields = "__all__"
        read_only_fields = ("user", "ip_address", "user_agent", "created_at")





# class CustomUserSerializer(serializers.ModelSerializer):
#     credits = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)

#     class Meta:
#         model = CustomUser
#         fields = [
#             'id', 'email', 'password', 'first_name', 'last_name',
#             'stripe_customer_id', 'subscription_status', 'subscription_plan',
#             'subscription_start_date', 'subscription_end_date',
#             'credits', 'default_accounting_program', 'company_name', 'company_code', 'vat_code'
#         ]
#         read_only_fields = ('credits',)
#         extra_kwargs = {
#             'password': {'write_only': True, 'required': True},
#             'email':    {'required': True},
#         }

#     def create(self, validated_data):
#         password = validated_data.pop('password')
#         # 1) Создаём пользователя
#         user = CustomUser.objects.create_user(password=password, **validated_data)
#         # 2) Начисляем ему 300 кредитов
#         user.credits = 300
#         user.save(update_fields=['credits'])
#         return user
    
#     def update(self, instance, validated_data):
#         password = validated_data.pop('password', None)
#         for attr, value in validated_data.items():
#             setattr(instance, attr, value)
#         if password:
#             instance.set_password(password)
#         instance.save()
#         return instance



# Optimizacija skorosti zagruzki

class CounterpartySerializer(serializers.Serializer):
    key = serializers.CharField()
    id = serializers.CharField(allow_null=True, required=False)
    name = serializers.CharField(allow_blank=True, required=False)
    vat = serializers.CharField(allow_blank=True, required=False)
    docs_count = serializers.IntegerField()






#NEW - dlia israsymas
"""
DokSkenas — Sąskaitų išrašymas
Serializers for Counterparty, InvoiceSettings, Invoice, InvoiceLineItem.
"""

from rest_framework import serializers
from django.db import transaction

from .models import Counterparty, InvoiceSettings, Invoice, InvoiceLineItem


# ────────────────────────────────────────────────────────────
# Counterparty
# ────────────────────────────────────────────────────────────

class InvoiceCounterpartySerializer(serializers.ModelSerializer):
    class Meta:
        model = Counterparty
        fields = [
            "id",
            "name",
            "name_normalized",
            "company_code",
            "vat_code",
            "address",
            "country",
            "country_iso",
            "phone",
            "email",
            "bank_name",
            "iban",
            "swift",
            "is_person",
            "default_role",
            "id_programoje",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "name_normalized", "created_at", "updated_at"]


class InvoiceCounterpartyListSerializer(serializers.ModelSerializer):
    """Лёгкая версия для списков и автозаполнения."""

    class Meta:
        model = Counterparty
        fields = [
            "id",
            "name",
            "company_code",
            "vat_code",
            "address",
            "country",
            "country_iso",
            "phone",
            "email",
            "bank_name",
            "iban",
            "swift",
            "is_person",
            "default_role",
            "id_programoje",
            "extra_info",       
            "delivery_address",
        ]


# ────────────────────────────────────────────────────────────
# InvoiceSettings
# ────────────────────────────────────────────────────────────

class InvoiceSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceSettings
        fields = [
            "seller_name", "seller_company_code", "seller_vat_code",
            "seller_address", "seller_phone", "seller_email",
            "seller_bank_name", "seller_iban", "seller_swift",
            "logo", "logo_url",
            "default_currency", "default_vat_percent", "default_payment_days",
            "email_subject_template", "email_body_template",
        ]
        read_only_fields = ["id", "logo_url"]
        extra_kwargs = {
            "logo": {"write_only": True, "required": False},
        }

    def get_logo_url(self, obj):
        if obj.logo and hasattr(obj.logo, "url"):
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None


# ────────────────────────────────────────────────────────────
# InvoiceLineItem
# ────────────────────────────────────────────────────────────

class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            "id",
            "line_id",
            # Продукт
            "prekes_kodas",
            "prekes_barkodas",
            "prekes_pavadinimas",
            "prekes_tipas",
            "preke_paslauga",
            # Количество / цена
            "unit",
            "quantity",
            "price",
            "subtotal",
            "vat",
            "vat_percent",
            "total",
            "discount_with_vat",
            "discount_wo_vat",
            "sort_order",
        ]
        read_only_fields = ["id"]


# ────────────────────────────────────────────────────────────
# Invoice — List (лёгкий, для таблицы)
# ────────────────────────────────────────────────────────────

class InvoiceListSerializer(serializers.ModelSerializer):
    """Для списка счетов — без autocomplete полей, без line items."""

    full_number = serializers.ReadOnlyField()
    line_items_count = serializers.IntegerField(read_only=True)
    buyer_display = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    paid_amount = serializers.DecimalField(
        max_digits=12, decimal_places=4, read_only=True,
    )
    last_payment_date = serializers.DateField(read_only=True)
    has_proposed_payments = serializers.SerializerMethodField()
    email_sent_count = serializers.IntegerField(read_only=True)
    email_last_status = serializers.CharField(read_only=True)

    def get_has_proposed_payments(self, obj):
        if hasattr(obj, '_has_proposed'):
            return obj._has_proposed
        return obj.payment_allocations.filter(status="proposed").exists()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "uuid",
            "invoice_type",
            "status",
            "full_number",
            "document_series",
            "document_number",
            "invoice_date",
            "due_date",
            "buyer_name",
            "buyer_display",
            "currency",
            "amount_wo_vat",
            "vat_amount",
            "amount_with_vat",
            "pvm_tipas",
            "sent_at",
            "paid_at",
            "line_items_count",
            "source_invoice",
            "exported",         
            "exported_at",      
            "is_overdue",
            "can_create_pvm_sf",       
            "created_at",
            "updated_at",
            "paid_amount",
            "last_payment_date",
            "has_proposed_payments",
            "email_sent_count",
            "email_last_status",
        ]

    def get_is_overdue(self, obj):
        if obj.status in ("issued", "sent") and obj.due_date:
            return obj.due_date < date.today()
        return False

    def get_buyer_display(self, obj):
        """Покупатель: имя + код компании."""
        if obj.buyer_id:
            return f"{obj.buyer_name} ({obj.buyer_id})"
        return obj.buyer_name or ""


# ────────────────────────────────────────────────────────────
# Invoice — Detail (полный, с line items)
# ────────────────────────────────────────────────────────────

class InvoiceDetailSerializer(serializers.ModelSerializer):
    """Полный сериализатор для просмотра и редактирования."""

    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    full_number = serializers.ReadOnlyField()
    is_editable = serializers.ReadOnlyField()
    can_be_sent = serializers.ReadOnlyField()
    can_create_pvm_sf = serializers.ReadOnlyField()
    public_url = serializers.ReadOnlyField()
    pdf_url = serializers.SerializerMethodField()
    paid_amount = serializers.DecimalField(
        max_digits=12, decimal_places=4, read_only=True,
    )
    last_payment_date = serializers.DateField(read_only=True)
    has_proposed_payments = serializers.SerializerMethodField()
    payment_link_url = serializers.URLField(read_only=True)
    payment_link_provider = serializers.CharField(read_only=True)
    payment_link_created_at = serializers.DateTimeField(read_only=True)

    def get_has_proposed_payments(self, obj):
        return obj.payment_allocations.filter(status="proposed").exists()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "uuid",
            "invoice_type",
            "status",
            "full_number",
            "is_editable",
            "can_be_sent",
            "can_create_pvm_sf",
            "public_url",
            "pdf_url",
            "source_invoice",
            # Нумерация / даты
            "document_series",
            "document_number",
            "invoice_date",
            "due_date",
            "operation_date",
            "order_number",
            # Seller
            "seller_counterparty",
            "seller_id_programoje",
            "seller_name",
            "seller_id",
            "seller_vat_code",
            "seller_address",
            "seller_country",
            "seller_country_iso",
            "seller_phone",
            "seller_email",
            "seller_bank_name",
            "seller_iban",
            "seller_swift",
            "seller_is_person",
            "seller_vat_val",
            "seller_extra_info",
            # Buyer
            "buyer_counterparty",
            "buyer_id_programoje",
            "buyer_name",
            "buyer_id",
            "buyer_vat_code",
            "buyer_address",
            "buyer_country",
            "buyer_country_iso",
            "buyer_phone",
            "buyer_email",
            "buyer_bank_name",
            "buyer_iban",
            "buyer_swift",
            "buyer_is_person",
            "buyer_vat_val",
            "buyer_extra_info", 
            "buyer_delivery_address",
            # Суммы
            "currency",
            "pvm_tipas",
            "vat_percent",
            "amount_wo_vat",
            "vat_amount",
            "amount_with_vat",
            "invoice_discount_with_vat",
            "invoice_discount_wo_vat",
            "delivery_fee",
            "separate_vat",
            "doc_96_str",
            # Мета
            "document_type",
            "document_type_code",
            "pirkimas_pardavimas",
            "note",
            "report_to_isaf",
            "issued_by",
            "received_by",
            # Autocomplete для экспорта
            "prekes_kodas",
            "prekes_barkodas",
            "prekes_pavadinimas",
            "prekes_tipas",
            "preke_paslauga",
            # Экспорт
            "optimum_api_status",
            "optimum_last_try_date",
            "dineta_api_status",
            "dineta_last_try_date",
            # PDF / отправка
            "pdf_file",
            "sent_at",
            "sent_to_email",
            "paid_at",
            "cancelled_at",
            "public_link_enabled",
            "payment_link_url",
            "payment_link_provider",
            "payment_link_created_at",
            # Line items
            "line_items",
            # Timestamps
            "created_at",
            "updated_at",
            "auto_create_sf_on_paid",
            "auto_sf_series",
            "auto_sf_send",
            "send_payment_reminders",
            "paid_amount",
            "last_payment_date",
            "has_proposed_payments",
        ]
        read_only_fields = [
            "id",
            "uuid",
            "full_number",
            "is_editable",
            "can_be_sent",
            "can_create_pvm_sf",
            "public_url",
            "pdf_url",
            "sent_at",
            "paid_at",
            "cancelled_at",
            "optimum_api_status",
            "optimum_last_try_date",
            "dineta_api_status",
            "dineta_last_try_date",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "pdf_file": {"read_only": True},
        }

    def get_pdf_url(self, obj):
        if obj.pdf_file and hasattr(obj.pdf_file, "url"):
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.pdf_file.url)
            return obj.pdf_file.url
        return None


# ────────────────────────────────────────────────────────────
# Invoice — Create / Update (с nested line items)
# ────────────────────────────────────────────────────────────

class InvoiceWriteSerializer(serializers.ModelSerializer):
    """
    Для создания и обновления Invoice вместе с line items.

    Фронтенд отправляет:
    {
        "invoice_type": "isankstine",
        "buyer_name": "UAB Testas",
        ...
        "line_items": [
            {"prekes_pavadinimas": "Paslauga", "quantity": 1, "price": "100.00", ...},
            ...
        ]
    }
    """

    line_items = InvoiceLineItemSerializer(many=True, required=False)
    seller_type = serializers.CharField(required=False, write_only=True)
    buyer_type = serializers.CharField(required=False, write_only=True)

    class Meta:
        model = Invoice
        fields = [
            "invoice_type",
            "source_invoice",
            # Нумерация
            "document_series",
            "document_number",      
            # Даты
            "invoice_date",
            "due_date",
            "operation_date",
            "order_number",
            # Seller
            "seller_type",
            "seller_counterparty",
            "seller_id_programoje",
            "seller_name",
            "seller_id",
            "seller_vat_code",
            "seller_address",
            "seller_country",       
            "seller_country_iso",   
            "seller_phone",
            "seller_email",
            "seller_bank_name",
            "seller_iban",
            "seller_swift",
            "seller_is_person",
            "seller_vat_val",
            "seller_extra_info",
            # Buyer
            "buyer_type",          
            "buyer_counterparty",
            "buyer_id_programoje",
            "buyer_name",
            "buyer_id",
            "buyer_vat_code",
            "buyer_address",
            "buyer_country",        
            "buyer_country_iso",    
            "buyer_phone",
            "buyer_email",
            "buyer_bank_name",
            "buyer_iban",
            "buyer_swift",
            "buyer_is_person",
            "buyer_vat_val",
            "buyer_extra_info",
            "buyer_delivery_address",
            # Суммы
            "currency",
            "pvm_tipas",
            "vat_percent",
            "amount_wo_vat",
            "vat_amount",
            "amount_with_vat",
            "invoice_discount_with_vat",
            "invoice_discount_wo_vat",
            "delivery_fee",
            "separate_vat",
            "doc_96_str",
            # Мета
            "document_type",
            "document_type_code",
            "note",
            "report_to_isaf",
            "public_link_enabled",
            "issued_by", "received_by",
            # Line items
            "line_items",
            "auto_create_sf_on_paid",
            "auto_sf_series",
            "auto_sf_send",
            "send_payment_reminders",
        ]

    def validate(self, data):
        if self.instance and self.instance.status == 'cancelled':
            raise serializers.ValidationError(
                "Negalima redaguoti anuliuotos sąskaitos."
            )

        # seller_type → seller_is_person
        seller_type = data.pop('seller_type', None)
        if seller_type is not None:
            data['seller_is_person'] = seller_type == 'fizinis'

        # buyer_type → buyer_is_person
        buyer_type = data.pop('buyer_type', None)
        if buyer_type is not None:
            data['buyer_is_person'] = buyer_type == 'fizinis'

        errors = {}

        # ---- Документ ----
        if not data.get('invoice_type'):
            errors['invoice_type'] = 'Privalomas laukas.'
        if not data.get('document_series'):
            errors['document_series'] = 'Privalomas laukas.'
        if not data.get('currency'):
            errors['currency'] = 'Privalomas laukas.'

        # Проверка уникальности номера
        doc_number = data.get('document_number', '')
        doc_series = data.get('document_series', '')
        if doc_number and doc_series:
            qs = Invoice.objects.filter(
                user=self.context["request"].user,
                document_series=doc_series,
                document_number=doc_number,
            ).exclude(status="cancelled")
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                errors['document_number'] = f'Numeris {doc_series}-{doc_number} jau užimtas.'

        # ---- Seller (при update) ----
        if self.instance:
            if not data.get('seller_name', self.instance.seller_name):
                errors['seller_name'] = 'Privalomas laukas.'
            if not data.get('seller_id', self.instance.seller_id):
                errors['seller_id'] = 'Privalomas laukas.'
            if not (data.get('seller_country') or data.get('seller_country_iso') or self.instance.seller_country_iso):
                errors['seller_country'] = 'Privalomas laukas.'
            seller_is_person = data.get('seller_is_person', self.instance.seller_is_person)
            if seller_is_person is None:
                errors['seller_is_person'] = 'Privalomas laukas.'

        # ---- Buyer ----
        if not data.get('buyer_name'):
            errors['buyer_name'] = 'Privalomas laukas.'
        if not data.get('buyer_id'):
            errors['buyer_id'] = 'Privalomas laukas.'
        if not data.get('buyer_country') and not data.get('buyer_country_iso'):
            errors['buyer_country'] = 'Privalomas laukas.'
        if data.get('buyer_is_person') is None:
            errors['buyer_is_person'] = 'Privalomas laukas.'

        # ---- Line items ----
        line_items = data.get('line_items', [])
        if not line_items:
            errors['line_items'] = 'Turi būti bent viena eilutė.'
        else:
            line_errors = []
            for idx, li in enumerate(line_items):
                li_err = {}
                if not li.get('prekes_pavadinimas'):
                    li_err['prekes_pavadinimas'] = 'Privalomas laukas.'
                if not li.get('prekes_kodas'):
                    li_err['prekes_kodas'] = 'Privalomas laukas.'
                if not li.get('quantity') or li['quantity'] <= 0:
                    li_err['quantity'] = 'Turi būti > 0.'
                if li.get('price') is None:
                    li_err['price'] = 'Privalomas laukas.'
                if not li.get('unit'):
                    li_err['unit'] = 'Privalomas laukas.'
                if li_err:
                    line_errors.append({str(idx): li_err})
            if line_errors:
                errors['line_items'] = line_errors

        # ---- PVM ----
        pvm_tipas = data.get('pvm_tipas', 'taikoma')
        if pvm_tipas == 'taikoma':
            separate_vat = data.get('separate_vat', False)
            if separate_vat:
                for idx, li in enumerate(line_items):
                    if li.get('vat_percent') is None:
                        errors.setdefault('line_items_vat', []).append(
                            f'Eilutė {idx + 1}: PVM % privalomas.'
                        )
            else:
                if data.get('vat_percent') is None:
                    errors['vat_percent'] = 'PVM % privalomas.'

        if errors:
            raise serializers.ValidationError(errors)

        return data

    def validate_seller_counterparty(self, value):
        if value and value.user != self.context["request"].user:
            raise serializers.ValidationError("Kontrahento nerastas.")
        return value

    def validate_buyer_counterparty(self, value):
        if value and value.user != self.context["request"].user:
            raise serializers.ValidationError("Kontrahento nerastas.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop("line_items", [])
        user = self.context["request"].user

        # Автозаполнение seller из settings (если не передан)
        if not validated_data.get("seller_name"):
            settings_obj = InvoiceSettings.objects.filter(user=user).first()
            if settings_obj:
                validated_data.setdefault("seller_name", settings_obj.seller_name)
                validated_data.setdefault("seller_id", settings_obj.seller_company_code)
                validated_data.setdefault("seller_vat_code", settings_obj.seller_vat_code)
                validated_data.setdefault("seller_address", settings_obj.seller_address)
                validated_data.setdefault("seller_phone", settings_obj.seller_phone)
                validated_data.setdefault("seller_email", settings_obj.seller_email)
                validated_data.setdefault("seller_bank_name", settings_obj.seller_bank_name)
                validated_data.setdefault("seller_iban", settings_obj.seller_iban)
                validated_data.setdefault("seller_swift", settings_obj.seller_swift)

        # Country defaults
        validated_data.setdefault("seller_country", "Lietuva")
        validated_data.setdefault("seller_country_iso", "LT")
        validated_data.setdefault("buyer_country", "Lietuva")
        validated_data.setdefault("buyer_country_iso", "LT")

        # Проверка seller после автозаполнения
        if not validated_data.get("seller_name"):
            raise serializers.ValidationError({"seller_name": "Pardavėjo vardas privalomas. Užpildykite nustatymuose."})
        if not validated_data.get("seller_id"):
            raise serializers.ValidationError({"seller_id": "Pardavėjo įmonės kodas privalomas."})
        if validated_data.get("seller_is_person") is None:
            raise serializers.ValidationError({"seller_is_person": "Nurodykite pardavėjo tipą."})

        # Автозаполнение buyer из counterparty (если выбран)
        buyer_cp = validated_data.get("buyer_counterparty")
        if buyer_cp and not validated_data.get("buyer_name"):
            validated_data.setdefault("buyer_name", buyer_cp.name)
            validated_data.setdefault("buyer_id", buyer_cp.company_code)
            validated_data.setdefault("buyer_vat_code", buyer_cp.vat_code)
            validated_data.setdefault("buyer_address", buyer_cp.address)
            validated_data.setdefault("buyer_phone", buyer_cp.phone)
            validated_data.setdefault("buyer_email", buyer_cp.email)
            validated_data.setdefault("buyer_bank_name", buyer_cp.bank_name)
            validated_data.setdefault("buyer_iban", buyer_cp.iban)
            validated_data.setdefault("buyer_swift", buyer_cp.swift)
            validated_data.setdefault("buyer_is_person", buyer_cp.is_person)
            validated_data.setdefault("buyer_id_programoje", buyer_cp.id_programoje)

        # Normalized names
        if validated_data.get("seller_name"):
            validated_data["seller_name_normalized"] = validated_data["seller_name"].strip().upper()
        if validated_data.get("buyer_name"):
            validated_data["buyer_name_normalized"] = validated_data["buyer_name"].strip().upper()

        # Defaults
        validated_data.setdefault("pirkimas_pardavimas", "pardavimas")
        validated_data["status"] = "draft"

        invoice = Invoice.objects.create(user=user, **validated_data)

        # Line items
        for idx, li_data in enumerate(line_items_data):
            li_data.pop("id", None)
            li_data.pop("sort_order", None)
            InvoiceLineItem.objects.create(
                invoice=invoice,
                sort_order=idx,
                **li_data,
            )

        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        line_items_data = validated_data.pop("line_items", None)

        # Normalized names
        if validated_data.get("seller_name"):
            validated_data["seller_name_normalized"] = validated_data["seller_name"].strip().upper()
        if validated_data.get("buyer_name"):
            validated_data["buyer_name_normalized"] = validated_data["buyer_name"].strip().upper()

        # Update invoice fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Replace line items (full replace strategy — проще и надёжнее)
        if line_items_data is not None:
            instance.line_items.all().delete()
            for idx, li_data in enumerate(line_items_data):
                li_data.pop("id", None)
                li_data.pop("sort_order", None)
                InvoiceLineItem.objects.create(
                    invoice=instance,
                    sort_order=idx,
                    **li_data,
                )

        return instance

    def to_representation(self, instance):
        """После create/update возвращаем полный detail."""
        return InvoiceDetailSerializer(instance, context=self.context).data


# ────────────────────────────────────────────────────────────
# Invoice — Public (для покупателя по uuid, без лишних полей)
# ────────────────────────────────────────────────────────────

class InvoicePublicSerializer(serializers.ModelSerializer):
    """Для public page /sf/{uuid} — только то что нужно покупателю."""

    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    full_number = serializers.ReadOnlyField()
    logo_url = serializers.SerializerMethodField()

    def get_logo_url(self, obj):
            try:
                inv_settings = obj.user.invoice_settings
                if inv_settings.logo and inv_settings.logo.storage.exists(inv_settings.logo.name):
                    request = self.context.get('request')
                    if request:
                        return request.build_absolute_uri(inv_settings.logo.url)
                    # Fallback: use SITE_URL_BACKEND
                    from django.conf import settings as django_settings
                    backend_url = getattr(django_settings, 'SITE_URL_BACKEND', '')
                    return f"{backend_url}{inv_settings.logo.url}" if backend_url else inv_settings.logo.url
            except Exception:
                pass
            return None

    class Meta:
        model = Invoice
        fields = [
            "uuid",
            "invoice_type",
            "status",
            "full_number",
            "document_series",
            "document_number",
            "invoice_date",
            "due_date",
            # Seller (покупатель видит кто выставил)
            "seller_name",
            "seller_id",
            "seller_vat_code",
            "seller_address",
            "seller_phone",
            "seller_email",
            "seller_bank_name",
            "seller_iban",
            "seller_swift",
            # Buyer
            "buyer_name",
            "buyer_id",
            "buyer_vat_code",
            "buyer_address",
            # Суммы
            "currency",
            "pvm_tipas",
            "vat_percent",
            "amount_wo_vat",
            "vat_amount",
            "amount_with_vat",
            "delivery_fee",
            "invoice_discount_with_vat",
            "note",
            # Line items
            "line_items",

            "logo_url",
            "payment_link_url",
            "payment_link_provider",
            "paid_amount",
            "paid_at",
            "seller_extra_info",
            "seller_is_person",
            "buyer_phone",
            "buyer_email",
            "issued_by",
            "received_by",
        ]







class MeasurementUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementUnit
        fields = ["id", "code", "name", "sort_order", "is_active", "is_default"]


class InvoiceSeriesSerializer(serializers.ModelSerializer):
    preview = serializers.SerializerMethodField()
    invoice_type_display = serializers.CharField(
        source="get_invoice_type_display", read_only=True
    )

    class Meta:
        model = InvoiceSeries
        fields = [
            "id", "invoice_type", "invoice_type_display", "prefix",
            "next_number", "padding", "is_default", "is_active",
            "preview", "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_preview(self, obj):
        return obj.preview()
    



class ProductListSerializer(serializers.ModelSerializer):
    """Лёгкий сериализатор для списка."""
    measurement_unit_code = serializers.CharField(
        source="measurement_unit.code", read_only=True, default=""
    )

    class Meta:
        model = Product
        fields = [
            "id", "preke_paslauga", "pavadinimas", "kodas", "barkodas",
            "measurement_unit", "measurement_unit_code",
            "pardavimo_kaina", "pvm_procentas",
            "created_at",
        ]


class ProductSerializer(serializers.ModelSerializer):
    """Полный сериализатор для CRUD."""
    measurement_unit_code = serializers.CharField(
        source="measurement_unit.code", read_only=True, default=""
    )

    class Meta:
        model = Product
        fields = [
            "id", "preke_paslauga", "pavadinimas", "kodas", "barkodas",
            "measurement_unit", "measurement_unit_code",
            "pardavimo_kaina", "pvm_procentas",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_kodas(self, value):
        user = self.context["request"].user
        qs = Product.objects.filter(user=user, kodas=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Toks kodas jau egzistuoja.")
        return value
    



# ═══════════════════════════════════════════════════════════
# Periodines saskaitos
# ═══════════════════════════════════════════════════════════

class RecurringInvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringInvoiceLineItem
        fields = [
            "prekes_pavadinimas", "prekes_kodas", "prekes_barkodas",
            "preke_paslauga", "unit", "quantity", "price",
            "vat_percent", "discount_wo_vat", "sort_order",
        ]


class RecurringInvoiceListSerializer(serializers.ModelSerializer):
    """Для списка — лёгкий."""
    next_run_date = serializers.SerializerMethodField()
    estimated_amount = serializers.SerializerMethodField()

    class Meta:
        model = RecurringInvoice
        fields = [
            "id", "uuid", "status", "invoice_type", "document_series",
            "currency", "buyer_name", "buyer_id",
            "frequency", "interval", "first_day_of_month", "last_day_of_month",
            "start_date", "end_date", "max_count", "generation_count",
            "next_run_at", "next_run_date", "created_at", "estimated_amount",
        ]

    def get_next_run_date(self, obj):
        if obj.next_run_at:
            return obj.next_run_at.date().isoformat()
        return None

    def get_estimated_amount(self, obj):
        total = Decimal("0")
        for li in obj.line_items.all():
            qty = li.quantity or Decimal("0")
            price = li.price or Decimal("0")
            discount = li.discount_wo_vat or Decimal("0")
            subtotal = qty * price - discount
            vat_pct = li.vat_percent if li.vat_percent is not None else (obj.vat_percent or Decimal("0"))
            if obj.pvm_tipas == "taikoma":
                total += subtotal + subtotal * vat_pct / Decimal("100")
            else:
                total += subtotal
        return str(total.quantize(Decimal("0.01")))


class RecurringInvoiceDetailSerializer(serializers.ModelSerializer):
    line_items = RecurringInvoiceLineItemSerializer(many=True, read_only=True)

    class Meta:
        model = RecurringInvoice
        fields = [
            "id", "uuid", "status",
            # Что создавать
            "invoice_type", "document_series", "currency",
            "pvm_tipas", "vat_percent", "note", "order_number",
            "public_link_enabled",
            # Расписание
            "start_date", "end_date", "frequency", "interval",
            "first_day_of_month", "last_day_of_month",
            "day_of_month", "weekday",
            "payment_term_days", "max_count",
            # Автодействия
            "auto_issue", "auto_send", "send_to_email",
            # Seller
            "seller_counterparty", "seller_name", "seller_id",
            "seller_vat_code", "seller_address",
            "seller_country", "seller_country_iso",
            "seller_phone", "seller_email",
            "seller_bank_name", "seller_iban", "seller_swift",
            "seller_is_person", "seller_extra_info",
            # Buyer
            "buyer_counterparty", "buyer_name", "buyer_id",
            "buyer_vat_code", "buyer_address",
            "buyer_country", "buyer_country_iso",
            "buyer_phone", "buyer_email",
            "buyer_bank_name", "buyer_iban", "buyer_swift",
            "buyer_is_person", "buyer_extra_info",
            "buyer_delivery_address",
            "send_payment_reminders", "auto_create_sf_on_paid", "auto_sf_series", "auto_sf_send",
            # Подписи
            "issued_by", "received_by",
            # Служебные
            "next_run_at", "last_run_at", "generation_count",
            "created_at", "updated_at",
            # Line items
            "line_items",
        ]


class RecurringInvoiceWriteSerializer(serializers.ModelSerializer):
    line_items = RecurringInvoiceLineItemSerializer(many=True, required=False)
    seller_type = serializers.CharField(required=False, write_only=True)
    buyer_type = serializers.CharField(required=False, write_only=True)

    class Meta:
        model = RecurringInvoice
        fields = [
            # Что создавать
            "invoice_type", "document_series", "currency",
            "pvm_tipas", "vat_percent", "note", "order_number",
            "public_link_enabled",
            # Расписание
            "start_date", "end_date", "frequency", "interval",
            "first_day_of_month", "last_day_of_month",
            "payment_term_days", "max_count",
            # Автодействия
            "auto_issue", "auto_send", "send_to_email",
            # Seller
            "seller_type",
            "seller_counterparty", "seller_name", "seller_id",
            "seller_vat_code", "seller_address",
            "seller_country", "seller_country_iso",
            "seller_phone", "seller_email",
            "seller_bank_name", "seller_iban", "seller_swift",
            "seller_extra_info",
            # Buyer
            "buyer_type",
            "buyer_counterparty", "buyer_name", "buyer_id",
            "buyer_vat_code", "buyer_address",
            "buyer_country", "buyer_country_iso",
            "buyer_phone", "buyer_email",
            "buyer_bank_name", "buyer_iban", "buyer_swift",
            "buyer_extra_info", "buyer_delivery_address",
            "send_payment_reminders", "auto_create_sf_on_paid", "auto_sf_series", "auto_sf_send",
            # Подписи
            "issued_by", "received_by",
            # Line items
            "line_items",
        ]

    def validate(self, data):
        # seller_type → seller_is_person
        seller_type = data.pop("seller_type", None)
        if seller_type is not None:
            data["seller_is_person"] = seller_type == "fizinis"

        # buyer_type → buyer_is_person
        buyer_type = data.pop("buyer_type", None)
        if buyer_type is not None:
            data["buyer_is_person"] = buyer_type == "fizinis"

        errors = {}

        # ---- Документ ----
        if not data.get("invoice_type"):
            errors["invoice_type"] = "Privalomas laukas."
        if not data.get("document_series"):
            errors["document_series"] = "Privalomas laukas."
        if not data.get("currency"):
            errors["currency"] = "Privalomas laukas."

        # ---- Расписание ----
        if not data.get("start_date"):
            errors["start_date"] = "Privalomas laukas."
        if not data.get("frequency"):
            errors["frequency"] = "Privalomas laukas."

        end_date = data.get("end_date")
        start_date = data.get("start_date")
        if end_date and start_date and end_date < start_date:
            errors["end_date"] = "Pabaigos data negali būti ankstesnė už pradžios datą."
        
        if start_date and start_date < timezone.localdate():
            errors["start_date"] = "Pradžios data negali būti praeityje."

        interval = data.get("interval", 1)
        if interval is not None and interval < 1:
            errors["interval"] = "Turi būti >= 1."

        # ---- Seller ----
        if self.instance:
            if not data.get("seller_name", self.instance.seller_name):
                errors["seller_name"] = "Privalomas laukas."
            if not data.get("seller_id", self.instance.seller_id):
                errors["seller_id"] = "Privalomas laukas."

        # ---- Buyer ----
        if not data.get("buyer_name"):
            errors["buyer_name"] = "Privalomas laukas."
        if not data.get("buyer_id"):
            errors["buyer_id"] = "Privalomas laukas."
        if not data.get("buyer_country") and not data.get("buyer_country_iso"):
            errors["buyer_country"] = "Privalomas laukas."
        if data.get("buyer_is_person") is None:
            errors["buyer_is_person"] = "Privalomas laukas."

        # ---- auto_send → email ----
        if data.get("auto_send") and not data.get("send_to_email"):
            # fallback на buyer_email
            buyer_email = data.get("buyer_email", "")
            if buyer_email:
                data["send_to_email"] = buyer_email
            else:
                errors["send_to_email"] = "El. paštas privalomas automatiniam siuntimui."

        # ---- Line items ----
        line_items = data.get("line_items", [])
        if not line_items:
            errors["line_items"] = "Turi būti bent viena eilutė."
        else:
            line_errors = []
            for idx, li in enumerate(line_items):
                li_err = {}
                if not li.get("prekes_pavadinimas"):
                    li_err["prekes_pavadinimas"] = "Privalomas laukas."
                if not li.get("quantity") or li["quantity"] <= 0:
                    li_err["quantity"] = "Turi būti > 0."
                if li.get("price") is None:
                    li_err["price"] = "Privalomas laukas."
                if not li.get("unit"):
                    li_err["unit"] = "Privalomas laukas."
                if li_err:
                    line_errors.append({str(idx): li_err})
            if line_errors:
                errors["line_items"] = line_errors

        # ---- PVM ----
        pvm_tipas = data.get("pvm_tipas", "taikoma")
        if pvm_tipas == "taikoma" and data.get("vat_percent") is None:
            errors["vat_percent"] = "PVM % privalomas."

        if errors:
            raise serializers.ValidationError(errors)

        return data

    def _normalize_schedule(self, instance):
        """Установить day_of_month/frequency на основе toggles."""
        if instance.first_day_of_month:
            instance.frequency = "monthly"
            instance.interval = 1
            instance.day_of_month = 1
            instance.weekday = None
        elif instance.last_day_of_month:
            instance.frequency = "monthly"
            instance.interval = 1
            instance.day_of_month = 31  # compute_next_run_after обработает через min(target, last_day)
            instance.weekday = None
        else:
            instance.clean_schedule_fields()

    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop("line_items", [])
        user = self.context["request"].user

        # Country defaults
        validated_data.setdefault("seller_country", "Lietuva")
        validated_data.setdefault("seller_country_iso", "LT")
        validated_data.setdefault("buyer_country", "Lietuva")
        validated_data.setdefault("buyer_country_iso", "LT")

        # Seller из settings если не передан
        if not validated_data.get("seller_name"):
            from .models import InvoiceSettings
            settings_obj = InvoiceSettings.objects.filter(user=user).first()
            if settings_obj:
                validated_data.setdefault("seller_name", settings_obj.seller_name)
                validated_data.setdefault("seller_id", settings_obj.seller_company_code)
                validated_data.setdefault("seller_vat_code", settings_obj.seller_vat_code)
                validated_data.setdefault("seller_address", settings_obj.seller_address)
                validated_data.setdefault("seller_phone", settings_obj.seller_phone)
                validated_data.setdefault("seller_email", settings_obj.seller_email)
                validated_data.setdefault("seller_bank_name", settings_obj.seller_bank_name)
                validated_data.setdefault("seller_iban", settings_obj.seller_iban)
                validated_data.setdefault("seller_swift", settings_obj.seller_swift)

        if not validated_data.get("seller_name"):
            raise serializers.ValidationError(
                {"seller_name": "Pardavėjo vardas privalomas. Užpildykite nustatymuose."}
            )

        validated_data["status"] = "active"
        instance = RecurringInvoice.objects.create(user=user, **validated_data)

        # Line items
        for idx, li_data in enumerate(line_items_data):
            li_data.pop("id", None)
            li_data.pop("sort_order", None)
            RecurringInvoiceLineItem.objects.create(
                recurring_invoice=instance,
                sort_order=idx,
                **li_data,
            )

        # Нормализация расписания + первый запуск
        self._normalize_schedule(instance)
        instance.next_run_at = instance.compute_first_run_at()
        instance.mark_finished_if_needed()
        instance.save(update_fields=[
            "frequency", "interval", "day_of_month", "weekday",
            "next_run_at", "status", "updated_at",
        ])

        # ── Если next_run_at сегодня — генерируем сразу ──
        instance._first_invoice_generated = False
        instance._first_invoice_sent = False
        if instance.status == "active" and instance.next_run_at:
            from django.utils import timezone as tz
            if instance.next_run_at <= tz.now():
                try:
                    from .services.recurring_generator import generate_invoice_from_recurring
                    invoice = generate_invoice_from_recurring(instance)
                    instance._first_invoice_generated = True
                    instance._first_invoice_sent = bool(invoice.sent_at)
                except Exception as e:
                    import logging
                    logging.getLogger("docscanner_app").warning(
                        "Immediate generation failed for recurring %d: %s", instance.id, e
                    )

        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        line_items_data = validated_data.pop("line_items", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        self._normalize_schedule(instance)

        # Пересчитать next_run если расписание менялось
        if instance.status == "active":
            instance.next_run_at = instance.compute_first_run_at()
            instance.mark_finished_if_needed()

        instance.save()

        if line_items_data is not None:
            instance.line_items.all().delete()
            for idx, li_data in enumerate(line_items_data):
                li_data.pop("id", None)
                li_data.pop("sort_order", None)
                RecurringInvoiceLineItem.objects.create(
                    recurring_invoice=instance,
                    sort_order=idx,
                    **li_data,
                )

        return instance

    def to_representation(self, instance):
        data = RecurringInvoiceDetailSerializer(instance, context=self.context).data
        if hasattr(instance, '_first_invoice_generated'):
            data['first_invoice_generated'] = instance._first_invoice_generated
            data['first_invoice_sent'] = getattr(instance, '_first_invoice_sent', False)
        return data
    









"""
DRF Serializers для банковского импорта и платежей.
"""

from decimal import Decimal

from rest_framework import serializers

from .models import BankStatement, IncomingTransaction, PaymentAllocation


# ────────────────────────────────────────────────────────────
# BankStatement
# ────────────────────────────────────────────────────────────


class BankStatementListSerializer(serializers.ModelSerializer):
    bank_display = serializers.CharField(source="get_bank_name_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = BankStatement
        fields = [
            "id", "uuid", "bank_name", "bank_display",
            "original_filename", "file_format",
            "account_iban", "currency",
            "period_from", "period_to",
            "total_entries", "credit_entries", "debit_entries",
            "duplicates_skipped",
            "auto_matched_count", "likely_matched_count", "unmatched_count",
            "status", "status_display", "error_message",
            "created_at",
        ]
        read_only_fields = fields


class BankStatementUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    bank_name = serializers.ChoiceField(
        choices=[("", "Automatinis")] + BankStatement.BANK_CHOICES,
        required=False, default="", allow_blank=True,
    )
    file_format = serializers.ChoiceField(
        choices=[("", "Automatinis")] + BankStatement.FORMAT_CHOICES,
        required=False, default="", allow_blank=True,
    )

    def validate_file(self, value):
        """Validate file extension and size before processing."""
        import os
    
        ALLOWED_EXT = {".csv", ".xml"}
        MAX_SIZE = 20 * 1024 * 1024  # 10 MB
    
        filename = getattr(value, "name", "")
        ext = os.path.splitext(filename)[1].lower()
    
        if ext and ext not in ALLOWED_EXT:
            raise serializers.ValidationError(
                f"Netinkamas failo formatas: {ext}. Priimami tik CSV ir XML failai."
            )
    
        if value.size > MAX_SIZE:
            raise serializers.ValidationError(
                f"Failas per didelis ({value.size // 1024 // 1024} MB). "
                f"Maksimalus dydis: 20 MB."
            )
    
        return value


# ────────────────────────────────────────────────────────────
# Payment Proof (для модалки в InvoiceListPage)
# ────────────────────────────────────────────────────────────


class TransactionInfoSerializer(serializers.Serializer):
    """Данные транзакции внутри allocation — для отображения в модалке."""
    id = serializers.IntegerField()
    transaction_date = serializers.DateField()
    counterparty_name = serializers.CharField()
    counterparty_code = serializers.CharField()
    counterparty_account = serializers.CharField()
    payment_purpose = serializers.CharField()
    bank_operation_code = serializers.CharField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField()
    source = serializers.CharField()
    source_display = serializers.CharField()
    bank_name = serializers.CharField()
    bank_period = serializers.CharField()


class PaymentAllocationDetailSerializer(serializers.Serializer):
    """Одна allocation — один платёж/матч для invoice."""
    id = serializers.IntegerField()
    source = serializers.CharField()
    source_display = serializers.CharField()
    status = serializers.CharField()
    status_display = serializers.CharField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_date = serializers.DateField()
    confidence = serializers.DecimalField(max_digits=3, decimal_places=2)
    match_reasons = serializers.DictField()
    note = serializers.CharField()
    created_at = serializers.DateTimeField()
    transaction = TransactionInfoSerializer(allow_null=True)


class InvoicePaymentDetailsSerializer(serializers.Serializer):
    """
    Полная информация о платежах invoice — для PaymentProofDialog.
    Endpoint: GET /api/bank-import/invoice/{id}/payments/
    """
    invoice_id = serializers.IntegerField()
    invoice_number = serializers.CharField()
    invoice_total = serializers.DecimalField(max_digits=12, decimal_places=4)
    paid_amount = serializers.DecimalField(max_digits=12, decimal_places=4)
    remaining = serializers.DecimalField(max_digits=12, decimal_places=4)
    payment_status = serializers.CharField()
    allocations = PaymentAllocationDetailSerializer(many=True)


# ────────────────────────────────────────────────────────────
# Mark Paid (для диалога ручной пометки)
# ────────────────────────────────────────────────────────────


class MarkPaidSerializer(serializers.Serializer):
    """Данные из MarkPaidDialog."""
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_date = serializers.DateField()
    note = serializers.CharField(required=False, default="", allow_blank=True)


# ────────────────────────────────────────────────────────────
# Actions
# ────────────────────────────────────────────────────────────


class ConfirmAllocationSerializer(serializers.Serializer):
    allocation_id = serializers.IntegerField()


class BulkConfirmSerializer(serializers.Serializer):
    allocation_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1,
    )


class ManualMatchSerializer(serializers.Serializer):
    transaction_id = serializers.IntegerField()
    invoice_id = serializers.IntegerField()
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True,
    )


# ────────────────────────────────────────────────────────────
# Invoice List additions (миксин для существующего serializer)
# ────────────────────────────────────────────────────────────

# Добавить в существующий InvoiceListSerializer / InvoiceDetailSerializer:
#
#   paid_amount = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)
#   last_payment_date = serializers.DateField(read_only=True)
#   has_proposed_payments = serializers.SerializerMethodField()
#
#   def get_has_proposed_payments(self, obj):
#       return obj.payment_allocations.filter(status="proposed").exists()





class InvoiceEmailSerializer(serializers.ModelSerializer):
    email_type_display = serializers.CharField(
        source="get_email_type_display", read_only=True
    )

    class Meta:
        model = InvoiceEmail
        fields = [
            "id",
            "email_type",
            "email_type_display",
            "to_email",
            "subject",
            "sent_at",
            "status",
            "reminder_day",
            "opened_at",
            "open_count",
            "error_text",
        ]
        read_only_fields = fields


class ReminderSettingsSerializer(serializers.Serializer):
    reminder_enabled = serializers.BooleanField(required=False)
    invoice_reminder_days = serializers.ListField(
        child=serializers.IntegerField(), required=False
    )

    def validate_invoice_reminder_days(self, value):
        if not value:
            return [-7, -1, 3]
        if len(value) > 10:
            raise serializers.ValidationError("Per daug priminimų (maks. 10).")
        for d in value:
            if abs(d) > 365:
                raise serializers.ValidationError("Priminimo diena negali viršyti 365.")
            if d == 0:
                raise serializers.ValidationError("Priminimo diena negali būti 0.")
        return sorted(value)
    





# ────────────────────────────────────────────────────────────
# ─── Rivile GAMA API Key Serializers ───
# ────────────────────────────────────────────────────────────
class RivileGamaAPIKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = RivileGamaAPIKey
        fields = [
            "id", "label", "company_code", "key_suffix",
            "is_active", "verified_at", "last_ok", "last_error",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "key_suffix", "verified_at", "last_ok", "last_error",
            "created_at", "updated_at",
        ]


class RivileGamaAPIKeyCreateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=150, required=False, default="", allow_blank=True)
    company_code = serializers.CharField(max_length=50, required=True)
    api_key = serializers.CharField(max_length=500, required=True, write_only=True)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_company_code(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Įmonės kodas yra privalomas.")
        return value

    def validate_api_key(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("API raktas yra privalomas.")
        if len(value) < 10:
            raise serializers.ValidationError("API raktas per trumpas.")
        return value


class RivileGamaAPIKeyUpdateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=150, required=False, allow_blank=True)
    company_code = serializers.CharField(max_length=50, required=False)
    api_key = serializers.CharField(max_length=500, required=False, write_only=True, allow_blank=True)
    is_active = serializers.BooleanField(required=False)

# ────────────────────────────────────────────────────────────
# END ─── Rivile GAMA API Key Serializers ───
# ────────────────────────────────────────────────────────────


# ────────────────────────────────────────────────────────────
# ─── Dlia ADMIN israsymas ───
# ────────────────────────────────────────────────────────────

class InvoiceAdminListSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    owner_email = serializers.EmailField(source="user.email", read_only=True)
    full_number = serializers.CharField(read_only=True)
    can_create_pvm_sf = serializers.BooleanField(read_only=True)
    has_proposed_payments = serializers.BooleanField(read_only=True)
    is_overdue = serializers.SerializerMethodField()
 
    class Meta:
        model = Invoice
        fields = [
            "id",
            "user_id",
            "owner_email",
            "uuid",
            "invoice_type",
            "status",
            "document_series",
            "document_number",
            "full_number",
            "invoice_date",
            "due_date",
            "buyer_name",
            "buyer_email",
            "seller_name",
            "currency",
            "pvm_tipas",
            "amount_wo_vat",
            "vat_amount",
            "amount_with_vat",
            "paid_amount",
            "exported",
            "exported_at",
            "email_sent_count",
            "email_last_status",
            "can_create_pvm_sf",
            "has_proposed_payments",
            "is_overdue",
            "source_invoice",
            "created_at",
        ]
 
    def get_is_overdue(self, obj):
        if obj.status not in ("issued", "sent"):
            return False
        if not obj.due_date:
            return False
        from datetime import date
        return obj.due_date < date.today()


# ────────────────────────────────────────────────────────────
# END ─── Dlia ADMIN israsymas ───
# ────────────────────────────────────────────────────────────