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

from .models import Payments

from .utils.lineitem_rules import normalize_lineitem_rules


class LineItemSerializer(serializers.ModelSerializer):
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
            # 'val_ar_sutapo',
            # 'val_subtotal_match',
            # 'val_vat_match',
            # 'val_total_match',
            'pirkimas_pardavimas',
            'scan_type',
            'ready_for_export',
            'math_validation_passed',
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

class ScannedDocumentDetailSerializer(serializers.ModelSerializer):
    line_items = serializers.SerializerMethodField()

    class Meta:
        model = ScannedDocument
        fields = "__all__"
        extra_kwargs = {
            "file": {"write_only": True},
            "gpt_raw_json": {"write_only": True},
            "raw_text": {"write_only": True},
            "structured_json": {"write_only": True},
            "glued_raw_text": {"write_only": True},
        }

    def get_line_items(self, obj):
        # Просто сортируем по id, чтобы порядок всегда был стабильный
        qs = obj.line_items.order_by("id")
        return LineItemSerializer(qs, many=True).data



class ScannedDocumentAdminDetailSerializer(serializers.ModelSerializer):
    line_items = LineItemSerializer(many=True, read_only=True)

    class Meta:
        model = ScannedDocument
        fields = "__all__"
        extra_kwargs = {
            "file": {"write_only": True},
            # "gpt_raw_json": {"write_only": True},
            "raw_text": {"write_only": True},
            # ВАЖНО: НЕ помечаем как write_only, чтобы суперюзер их видел:
            # "structured_json": {"write_only": True},   # ← не ставим
            # "glued_raw_text": {"write_only": True},    # ← не ставим
        }









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
    debetas_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    site_pro_extra_fields       = serializers.JSONField(required=False, allow_null=True)
    pragma3_extra_fields       = serializers.JSONField(required=False, allow_null=True)

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
            'pragma3_extra_fields',
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
    
    def validate_debetas_extra_fields(self, value):
        return self._validate_extra_dict(value, "debetas_extra_fields")
    
    def validate_site_pro_extra_fields(self, value):
        return self._validate_extra_dict(value, "site_pro_extra_fields")
    
    def validate_pragma3_extra_fields(self, value):
        return self._validate_extra_dict(value, "pragma3_extra_fields")



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
        debetas_extra    = validated_data.pop('debetas_extra_fields', None)
        site_pro_extra    = validated_data.pop('site_pro_extra_fields', None)
        pragma3_extra    = validated_data.pop('pragma3_extra_fields', None)

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

        if debetas_extra is not None:
            user.debetas_extra_fields = debetas_extra

        if site_pro_extra is not None:
            user.site_pro_extra_fields = site_pro_extra

        if pragma3_extra is not None:
            user.pragma3_extra_fields = pragma3_extra

        user.save(update_fields=[
            'credits','purchase_defaults','sales_defaults',
            'extra_settings','lineitem_rules',
            'rivile_erp_extra_fields', 'rivile_gama_extra_fields',
            'butent_extra_fields','finvalda_extra_fields',
            'centas_extra_fields','agnum_extra_fields', 'debetas_extra_fields',
            'site_pro_extra_fields', 'pragma3_extra_fields',
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

        if 'debetas_extra_fields' in validated_data:
            instance.debetas_extra_fields = validated_data.pop('debetas_extra_fields')

        if 'site_pro_extra_fields' in validated_data:
            instance.site_pro_extra_fields = validated_data.pop('site_pro_extra_fields')

        if 'pragma3_extra_fields' in validated_data:
            instance.pragma3_extra_fields = validated_data.pop('pragma3_extra_fields')

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
    class Meta(CustomUserSerializer.Meta):
        model = CustomUser
        fields = [
            'id','email','first_name','last_name',
            'is_active','is_staff','is_superuser',
            'date_joined','last_login',
            'credits','default_accounting_program',
            'company_name','company_code','vat_code',
            'company_iban','company_address','company_country_iso',
            'purchase_defaults','sales_defaults','view_mode',
            'extra_settings','lineitem_rules',
        ]
        read_only_fields = getattr(CustomUserSerializer.Meta, 'read_only_fields', ('credits',))




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
    server = serializers.CharField(max_length=50)
    client = serializers.CharField(max_length=50)
    username = serializers.CharField(max_length=100)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    brandid = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True
    )
    storeid = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True
    )
    posid = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True
    )

    def to_representation(self, instance):
        """
        instance — это dict из user.dineta_settings.
        Пароль наружу не отдаем.
        """
        if instance is None:
            return None
        data = dict(instance)
        data.pop("password", None)
        return data

    def build_settings_dict(self):
        """
        Вызываем после is_valid().
        Возвращает dict, который можно положить в CustomUser.dineta_settings.
        """
        data = dict(self.validated_data)
        raw_password = data.pop("password", None)

        if raw_password:
            data["password"] = encrypt_password(raw_password)
        else:
            raise serializers.ValidationError({"password": "Password is required"})

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
        data.pop("key", None)
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



