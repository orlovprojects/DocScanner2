from rest_framework import serializers
from .models import CustomUser
from .models import ScannedDocument, LineItem, ProductAutocomplete, ClientAutocomplete, AdClick



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
            'buyer_id_programoje',
            'buyer_id',
            'buyer_name',
            'buyer_vat_code',
            'buyer_address',
            'buyer_country',
            'buyer_country_iso',
            'buyer_iban',
            'buyer_is_person',
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
            'amount_with_vat',
            'seller_name',
            'buyer_name',
            'val_ar_sutapo',
            'val_subtotal_match',
            'val_vat_match',
            'val_total_match',
            'pirkimas_pardavimas',
            # ...и т.п., без тяжелых полей и line_items
        ]


class ScannedDocumentDetailSerializer(serializers.ModelSerializer):
    line_items = LineItemSerializer(many=True, read_only=True)

    class Meta:
        model = ScannedDocument
        fields = "__all__"
        extra_kwargs = {
            "file": {"write_only": True},
            "gpt_raw_json": {"write_only": True},
            "raw_text": {"write_only": True},
            "structured_json": {"write_only": True},
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
class CustomUserSerializer(serializers.ModelSerializer):
    credits = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)

    class Meta:
        model = CustomUser
        fields = [
            'id', 'email', 'password', 'first_name', 'last_name',
            'stripe_customer_id', 'subscription_status', 'subscription_plan',
            'subscription_start_date', 'subscription_end_date',
            'credits', 'default_accounting_program',
            'company_name', 'company_code', 'vat_code',
            'company_iban', 'company_address', 'company_country_iso'
        ]
        read_only_fields = ('credits',)
        extra_kwargs = {
            'password': {'write_only': True, 'required': True},
            'email':    {'required': True},
            'company_name': {'required': False},
            'company_code': {'required': False},
            'company_country_iso': {'required': False},
        }

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = CustomUser.objects.create_user(password=password, **validated_data)
        user.credits = 50
        user.save(update_fields=['credits'])
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

    def validate(self, attrs):
        # При PATCH требуем обязательные поля
        request = self.context.get('request')
        if request and request.method == 'PATCH':
            required = ['company_name', 'company_code', 'company_country_iso']
            for field in required:
                # Если явно приходит None или пустая строка, это ошибка
                if field in attrs and not attrs[field]:
                    raise serializers.ValidationError({field: 'This field is required.'})
        return attrs
    


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



