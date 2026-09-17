from rest_framework import serializers

from ..models import FixedAsset, FixedAssetGroup, FixedAssetOperation
from ..utils.chart_of_accounts import get_account_name
from .constants import MAX_SPLIT_COUNT, ManualAssetSource, WriteOffReason
from .depreciation import depreciation_start_period


class FixedAssetGroupSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(
        source="get_category_display",
        read_only=True,
    )
    asset_account_name = serializers.SerializerMethodField()
    accumulated_depreciation_account_name = serializers.SerializerMethodField()
    depreciation_expense_account_name = serializers.SerializerMethodField()

    def get_asset_account_name(self, obj):
        return get_account_name(obj.asset_account)

    def get_accumulated_depreciation_account_name(self, obj):
        return get_account_name(obj.accumulated_depreciation_account)

    def get_depreciation_expense_account_name(self, obj):
        return get_account_name(obj.depreciation_expense_account)

    class Meta:
        model = FixedAssetGroup
        fields = [
            "id",
            "category",
            "category_display",
            "asset_account_name",
            "accumulated_depreciation_account_name",
            "depreciation_expense_account_name",
            "useful_life_months",
            "asset_account",
            "accumulated_depreciation_account",
            "depreciation_expense_account",
        ]


class FixedAssetSerializer(serializers.ModelSerializer):
    group_display = serializers.CharField(
        source="group.get_category_display",
        read_only=True,
        default="",
    )
    category = serializers.CharField(
        source="group.category",
        read_only=True,
        default="",
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    base_cost = serializers.SerializerMethodField()
    accumulated = serializers.SerializerMethodField()
    residual = serializers.SerializerMethodField()
    depreciation_start = serializers.SerializerMethodField()
    purchase_document = serializers.SerializerMethodField()

    def get_base_cost(self, obj):
        value = getattr(obj, "base_cost", None)
        return obj.acquisition_cost if value is None else value

    def get_accumulated(self, obj):
        return getattr(obj, "accumulated", None)

    def get_residual(self, obj):
        accumulated = getattr(obj, "accumulated", None)
        if accumulated is None:
            return None
        return self.get_base_cost(obj) - accumulated

    def get_depreciation_start(self, obj):
        return depreciation_start_period(obj)

    def get_purchase_document(self, obj):
        purchase = obj.purchase
        if purchase is None:
            return ""
        return f"{purchase.document_series or ''}{purchase.document_number or ''}".strip()

    class Meta:
        model = FixedAsset
        fields = [
            "id",
            "inventory_number",
            "name",
            "group",
            "group_display",
            "category",
            "status",
            "status_display",
            "purchase_date",
            "operation_start_date",
            "disposal_date",
            "depreciation_start",
            "acquisition_cost",
            "salvage_value",
            "useful_life_months",
            "base_cost",
            "accumulated",
            "residual",
            "description",
            "purchase",
            "purchase_line",
            "purchase_document",
            "sale_invoice",
            "sale_invoice_line",
            "created_at",
        ]


class FixedAssetOperationSerializer(serializers.ModelSerializer):
    operation_type_display = serializers.CharField(
        source="get_operation_type_display",
        read_only=True,
    )
    journal_entry_number = serializers.CharField(
        source="journal_entry.document_number",
        read_only=True,
        default="",
    )
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    asset_inventory_number = serializers.CharField(source="asset.inventory_number", read_only=True)
    purchase_document = serializers.SerializerMethodField()

    def get_purchase_document(self, obj):
        purchase = obj.purchase
        if purchase is None:
            return ""
        return f"{purchase.document_series or ''}{purchase.document_number or ''}".strip()

    class Meta:
        model = FixedAssetOperation
        fields = [
            "id",
            "operation_type",
            "operation_type_display",
            "operation_date",
            "period",
            "amount",
            "book",
            "reason",
            "description",
            "journal_entry",
            "journal_entry_number",
            "asset",
            "asset_name",
            "asset_inventory_number",
            "purchase",
            "purchase_line",
            "purchase_document",
            "extra_months",
        ]


class FixedAssetFromPurchaseSerializer(serializers.Serializer):
    purchase_id = serializers.IntegerField()
    purchase_line_id = serializers.IntegerField(required=False, allow_null=True)
    group_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    acquisition_cost = serializers.DecimalField(max_digits=14, decimal_places=2)
    operation_start_date = serializers.DateField(required=False, allow_null=True)
    useful_life_months = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    salvage_value = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    inventory_number = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    split_count = serializers.IntegerField(required=False, default=1, min_value=1, max_value=MAX_SPLIT_COUNT)


class FixedAssetUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    inventory_number = serializers.CharField(max_length=64, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    operation_start_date = serializers.DateField(required=False, allow_null=True)
    useful_life_months = serializers.IntegerField(required=False, min_value=1)
    salvage_value = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, min_value=0)


class FixedAssetWriteOffSerializer(serializers.Serializer):
    disposal_date = serializers.DateField()
    reason = serializers.ChoiceField(choices=WriteOffReason.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class FixedAssetSaleSerializer(serializers.Serializer):
    invoice_id = serializers.IntegerField()
    invoice_line_id = serializers.IntegerField(required=False, allow_null=True)


class FixedAssetGroupUpdateSerializer(serializers.Serializer):
    useful_life_months = serializers.IntegerField(required=False, min_value=1)
    asset_account = serializers.CharField(max_length=32, required=False, allow_blank=True)
    accumulated_depreciation_account = serializers.CharField(max_length=32, required=False, allow_blank=True)
    depreciation_expense_account = serializers.CharField(max_length=32, required=False, allow_blank=True)


class FixedAssetManualSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=ManualAssetSource.choices)
    group_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    acquisition_cost = serializers.DecimalField(max_digits=14, decimal_places=2)
    purchase_date = serializers.DateField()
    operation_start_date = serializers.DateField(required=False, allow_null=True)
    useful_life_months = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    salvage_value = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    accumulated_depreciation = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    credit_account = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    inventory_number = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")


class FixedAssetImprovementSerializer(serializers.Serializer):
    asset_id = serializers.IntegerField()
    purchase_id = serializers.IntegerField()
    purchase_line_id = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    extra_months = serializers.IntegerField(required=False, default=0, min_value=0, max_value=600)