from rest_framework import serializers

from ..models import FixedAsset, FixedAssetGroup
from .constants import WriteOffReason


class FixedAssetGroupSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(
        source="get_category_display",
        read_only=True,
    )

    class Meta:
        model = FixedAssetGroup
        fields = [
            "id",
            "category",
            "category_display",
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
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )

    class Meta:
        model = FixedAsset
        fields = [
            "id",
            "inventory_number",
            "name",
            "group",
            "group_display",
            "status",
            "status_display",
            "purchase_date",
            "operation_start_date",
            "disposal_date",
            "acquisition_cost",
            "salvage_value",
            "useful_life_months",
            "description",
            "purchase",
            "purchase_line",
            "sale_invoice",
            "sale_invoice_line",
            "created_at",
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


class FixedAssetWriteOffSerializer(serializers.Serializer):
    disposal_date = serializers.DateField()
    reason = serializers.ChoiceField(choices=WriteOffReason.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class FixedAssetSaleSerializer(serializers.Serializer):
    invoice_id = serializers.IntegerField()
    invoice_line_id = serializers.IntegerField(required=False, allow_null=True)