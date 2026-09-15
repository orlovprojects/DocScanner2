import datetime
import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import FixedAsset, FixedAssetGroup, Invoice, Purchase
from .serializers import (
    FixedAssetFromPurchaseSerializer,
    FixedAssetGroupSerializer,
    FixedAssetSaleSerializer,
    FixedAssetSerializer,
    FixedAssetWriteOffSerializer,
)
from .services import (
    FixedAssetError,
    create_fixed_asset_from_purchase,
    delete_fixed_asset,
    ensure_default_groups,
    get_available_amount,
    get_purchase_source,
)
from .depreciation import (
    build_schedule,
    calculate_period,
    cancel_period,
    register_period,
)
from .disposal import cancel_sale, cancel_write_off, sell_asset, write_off_asset

logger = logging.getLogger("docscanner_app")


def _get_company_profile(request):
    cp = getattr(request.user, "active_company_profile", None)
    if cp is None:
        raise FixedAssetError("Nepasirinkta aktyvi įmonė")
    return cp


def _get_purchase_and_line(cp, purchase_id, line_id):
    try:
        purchase = Purchase.objects.get(pk=purchase_id, company_profile=cp)
    except Purchase.DoesNotExist:
        raise FixedAssetError("Pirkimas nerastas")

    line = None
    if line_id:
        line = purchase.line_items.filter(pk=line_id).first()
        if line is None:
            raise FixedAssetError("Pirkimo eilutė nerasta")

    return purchase, line


class FixedAssetGroupListView(APIView):
    """GET /api/fixed-assets/groups/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        groups = ensure_default_groups(cp)
        return Response(FixedAssetGroupSerializer(groups, many=True).data)


class FixedAssetPurchaseSourceView(APIView):
    """
    GET /api/fixed-assets/purchase-source/?purchase_id=1&line_id=2
    Duomenys dialogo užpildymui.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        purchase, line = _get_purchase_and_line(
            cp,
            request.query_params.get("purchase_id"),
            request.query_params.get("line_id"),
        )

        source_amount, source_account = get_purchase_source(purchase, line)

        name = getattr(line if line is not None else purchase, "prekes_pavadinimas", "") or ""

        return Response({
            "purchase_id": purchase.pk,
            "purchase_line_id": getattr(line, "pk", None),
            "name": name,
            "purchase_date": purchase.operation_date or purchase.invoice_date,
            "seller_name": purchase.seller_name or "",
            "source_account": source_account,
            "source_amount": source_amount,
            "available_amount": get_available_amount(purchase, line),
        })


class FixedAssetFromPurchaseView(APIView):
    """POST /api/fixed-assets/from-purchase/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cp = _get_company_profile(request)

        serializer = FixedAssetFromPurchaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        purchase, line = _get_purchase_and_line(
            cp,
            data["purchase_id"],
            data.get("purchase_line_id"),
        )

        try:
            group = FixedAssetGroup.objects.get(pk=data["group_id"], company_profile=cp)
        except FixedAssetGroup.DoesNotExist:
            raise FixedAssetError("Turto grupė nerasta")

        asset = create_fixed_asset_from_purchase(
            purchase=purchase,
            purchase_line=line,
            group=group,
            name=data["name"],
            acquisition_cost=data["acquisition_cost"],
            operation_start_date=data.get("operation_start_date"),
            useful_life_months=data.get("useful_life_months"),
            salvage_value=data.get("salvage_value") or 0,
            inventory_number=data.get("inventory_number", ""),
            description=data.get("description", ""),
        )

        return Response(
            FixedAssetSerializer(asset).data,
            status=status.HTTP_201_CREATED,
        )


class FixedAssetDetailView(APIView):
    """DELETE /api/fixed-assets/<pk>/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        cp = _get_company_profile(request)

        try:
            asset = FixedAsset.objects.get(pk=pk, company_profile=cp)
        except FixedAsset.DoesNotExist:
            raise FixedAssetError("Turtas nerastas")

        delete_fixed_asset(asset)
        return Response(status=status.HTTP_204_NO_CONTENT)



def _parse_period(value):
    try:
        year, month = str(value or "")[:7].split("-")
        return datetime.date(int(year), int(month), 1)
    except (ValueError, TypeError):
        raise FixedAssetError("Neteisingas periodas, formatas YYYY-MM")


class FixedAssetScheduleView(APIView):
    """GET /api/fixed-assets/<pk>/schedule/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        cp = _get_company_profile(request)

        try:
            asset = FixedAsset.objects.get(pk=pk, company_profile=cp)
        except FixedAsset.DoesNotExist:
            raise FixedAssetError("Turtas nerastas")

        return Response(build_schedule(asset))


class FixedAssetDepreciationPreviewView(APIView):
    """GET /api/fixed-assets/depreciation/?period=2026-10"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        period = _parse_period(request.query_params.get("period"))
        return Response(calculate_period(cp, period))


class FixedAssetDepreciationRegisterView(APIView):
    """POST /api/fixed-assets/depreciation/register/  {"period": "2026-10"}"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cp = _get_company_profile(request)
        period = _parse_period(request.data.get("period"))
        entry = register_period(cp, period, request.user)
        return Response(
            {"journal_entry_id": entry.pk, "total": entry.total_debit},
            status=status.HTTP_201_CREATED,
        )


class FixedAssetDepreciationCancelView(APIView):
    """POST /api/fixed-assets/depreciation/cancel/  {"period": "2026-10"}"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cp = _get_company_profile(request)
        period = _parse_period(request.data.get("period"))
        cancel_period(cp, period)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FixedAssetWriteOffView(APIView):
    """POST /api/fixed-assets/<pk>/write-off/  {"disposal_date", "reason", "comment"}"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        cp = _get_company_profile(request)

        try:
            asset = FixedAsset.objects.get(pk=pk, company_profile=cp)
        except FixedAsset.DoesNotExist:
            raise FixedAssetError("Turtas nerastas")

        serializer = FixedAssetWriteOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        op = write_off_asset(
            asset,
            disposal_date=data["disposal_date"],
            reason=data["reason"],
            comment=data.get("comment", ""),
            user=request.user,
        )

        return Response(
            {"journal_entry_id": op.journal_entry_id, "written_off_amount": op.amount},
            status=status.HTTP_201_CREATED,
        )


class FixedAssetWriteOffCancelView(APIView):
    """POST /api/fixed-assets/<pk>/write-off/cancel/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        cp = _get_company_profile(request)

        try:
            asset = FixedAsset.objects.get(pk=pk, company_profile=cp)
        except FixedAsset.DoesNotExist:
            raise FixedAssetError("Turtas nerastas")

        asset = cancel_write_off(asset)
        return Response(FixedAssetSerializer(asset).data)



class FixedAssetSaleView(APIView):
    """POST /api/fixed-assets/<pk>/sell/  {"invoice_id", "invoice_line_id"}"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        cp = _get_company_profile(request)

        try:
            asset = FixedAsset.objects.get(pk=pk, company_profile=cp)
        except FixedAsset.DoesNotExist:
            raise FixedAssetError("Turtas nerastas")

        serializer = FixedAssetSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            invoice = Invoice.objects.get(pk=data["invoice_id"], company_profile=cp)
        except Invoice.DoesNotExist:
            raise FixedAssetError("Sąskaita nerasta")

        line = None
        if data.get("invoice_line_id"):
            line = invoice.line_items.filter(pk=data["invoice_line_id"]).first()
            if line is None:
                raise FixedAssetError("Sąskaitos eilutė nerasta")

        op = sell_asset(asset, invoice=invoice, invoice_line=line, user=request.user)

        return Response(
            {"journal_entry_id": op.journal_entry_id, "sale_amount": op.amount},
            status=status.HTTP_201_CREATED,
        )


class FixedAssetSaleCancelView(APIView):
    """POST /api/fixed-assets/<pk>/sell/cancel/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        cp = _get_company_profile(request)

        try:
            asset = FixedAsset.objects.get(pk=pk, company_profile=cp)
        except FixedAsset.DoesNotExist:
            raise FixedAssetError("Turtas nerastas")

        asset = cancel_sale(asset)
        return Response(FixedAssetSerializer(asset).data)


class FixedAssetListView(APIView):
    """GET /api/fixed-assets/?purchase_id=1"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        qs = FixedAsset.objects.filter(company_profile=cp).select_related("group")

        purchase_id = request.query_params.get("purchase_id")
        if purchase_id:
            qs = qs.filter(purchase_id=purchase_id)

        return Response(FixedAssetSerializer(qs, many=True).data)