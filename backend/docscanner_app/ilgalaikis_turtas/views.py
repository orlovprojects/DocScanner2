import datetime
import logging
import re

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import FixedAsset, FixedAssetGroup, FixedAssetOperation, Invoice, Purchase
from .constants import FixedAssetOperationType, FixedAssetStatus
from .depreciation import (
    _annotate_balances,
    build_schedule,
    calculate_period,
    cancel_period,
    register_period,
)
from .disposal import cancel_sale, cancel_write_off, sell_asset, write_off_asset
from .serializers import (
    FixedAssetGroupUpdateSerializer,
    FixedAssetImprovementSerializer,
    FixedAssetManualSerializer,
    FixedAssetFromPurchaseSerializer,
    FixedAssetGroupSerializer,
    FixedAssetOperationSerializer,
    FixedAssetSaleSerializer,
    FixedAssetSerializer,
    FixedAssetUpdateSerializer,
    FixedAssetWriteOffSerializer,
)
from .services import (
    cancel_improvement,
    create_manual_fixed_asset,
    improve_fixed_asset,
    update_fixed_asset_group,
    FixedAssetError,
    create_fixed_assets_from_purchase,
    delete_fixed_asset,
    ensure_default_groups,
    get_available_amount,
    get_purchase_source,
    next_inventory_numbers,
    update_fixed_asset,
)

logger = logging.getLogger("docscanner_app")


# ═══════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════

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


def _get_asset(cp, pk, annotate=False):
    qs = FixedAsset.objects.filter(pk=pk, company_profile=cp).select_related("group", "purchase")
    if annotate:
        qs = _annotate_balances(qs)

    asset = qs.first()
    if asset is None:
        raise FixedAssetError("Turtas nerastas")
    return asset


def _parse_period(value):
    try:
        year, month = str(value or "")[:7].split("-")
        return datetime.date(int(year), int(month), 1)
    except (ValueError, TypeError):
        raise FixedAssetError("Neteisingas periodas, formatas YYYY-MM")


# ═══════════════════════════════════════════════════════════
# Grupės ir sąrašas
# ═══════════════════════════════════════════════════════════

class FixedAssetGroupListView(APIView):
    """GET /api/fixed-assets/groups/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        groups = ensure_default_groups(cp)
        return Response(FixedAssetGroupSerializer(groups, many=True).data)


class FixedAssetListView(APIView):
    """GET /api/fixed-assets/?purchase_id=&status=&group_id=&search="""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        params = request.query_params

        qs = _annotate_balances(
            FixedAsset.objects
            .filter(company_profile=cp)
            .select_related("group", "purchase")
        )

        if params.get("purchase_id"):
            qs = qs.filter(purchase_id=params["purchase_id"])

        if params.get("status"):
            qs = qs.filter(status=params["status"])

        if params.get("active_only"):
            qs = qs.filter(status__in=[FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT])

        if params.get("group_id"):
            qs = qs.filter(group_id=params["group_id"])

        search = (params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(inventory_number__icontains=search))

        qs = qs.order_by("inventory_number", "pk")

        return Response(FixedAssetSerializer(qs, many=True).data)


# ═══════════════════════════════════════════════════════════
# Kūrimas iš pirkimo
# ═══════════════════════════════════════════════════════════

class FixedAssetPurchaseSourceView(APIView):
    """GET /api/fixed-assets/purchase-source/?purchase_id=1&line_id=2"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        purchase, line = _get_purchase_and_line(
            cp,
            request.query_params.get("purchase_id"),
            request.query_params.get("line_id"),
        )

        source_amount, source_account = get_purchase_source(purchase, line)
        name = (getattr(line if line is not None else purchase, "prekes_pavadinimas", "") or "").strip()
        if re.search(r"\.(pdf|jpe?g|png|heic|tiff?|webp|gif|bmp)$", name, re.IGNORECASE):
            name = ""

        quantity = None
        if line is not None and line.quantity is not None:
            quantity = abs(line.quantity)

        return Response({
            "purchase_id": purchase.pk,
            "purchase_line_id": getattr(line, "pk", None),
            "name": name,
            "purchase_date": purchase.operation_date or purchase.invoice_date,
            "seller_name": purchase.seller_name or "",
            "source_account": source_account,
            "source_amount": source_amount,
            "available_amount": get_available_amount(purchase, line),
            "quantity": quantity,
            "next_inventory_number": next_inventory_numbers(cp.pk)[0],
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

        assets = create_fixed_assets_from_purchase(
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
            split_count=data.get("split_count") or 1,
        )

        return Response(
            FixedAssetSerializer(assets, many=True).data,
            status=status.HTTP_201_CREATED,
        )


# ═══════════════════════════════════════════════════════════
# Kortelė
# ═══════════════════════════════════════════════════════════

class FixedAssetDetailView(APIView):
    """GET / PATCH / DELETE /api/fixed-assets/<pk>/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        cp = _get_company_profile(request)
        asset = _get_asset(cp, pk, annotate=True)
        return Response(FixedAssetSerializer(asset).data)

    def patch(self, request, pk):
        cp = _get_company_profile(request)
        asset = _get_asset(cp, pk)

        serializer = FixedAssetUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        update_fixed_asset(asset, dict(serializer.validated_data))

        asset = _get_asset(cp, pk, annotate=True)
        return Response(FixedAssetSerializer(asset).data)

    def delete(self, request, pk):
        cp = _get_company_profile(request)
        asset = _get_asset(cp, pk)
        delete_fixed_asset(asset)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FixedAssetOperationsView(APIView):
    """GET /api/fixed-assets/<pk>/operations/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        cp = _get_company_profile(request)
        asset = _get_asset(cp, pk)
        ops = (
            asset.operations
            .select_related("journal_entry")
            .order_by("operation_date", "period", "created_at")
        )
        return Response(FixedAssetOperationSerializer(ops, many=True).data)


class FixedAssetScheduleView(APIView):
    """GET /api/fixed-assets/<pk>/schedule/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        cp = _get_company_profile(request)
        asset = _get_asset(cp, pk)
        return Response(build_schedule(asset))


# ═══════════════════════════════════════════════════════════
# Nusidėvėjimas
# ═══════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════
# Nurašymas / pardavimas
# ═══════════════════════════════════════════════════════════

class FixedAssetWriteOffView(APIView):
    """POST /api/fixed-assets/<pk>/write-off/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        cp = _get_company_profile(request)
        asset = _get_asset(cp, pk)

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
        cancel_write_off(_get_asset(cp, pk))
        return Response(FixedAssetSerializer(_get_asset(cp, pk, annotate=True)).data)


class FixedAssetSaleView(APIView):
    """POST /api/fixed-assets/<pk>/sell/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        cp = _get_company_profile(request)
        asset = _get_asset(cp, pk)

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
        cancel_sale(_get_asset(cp, pk))
        return Response(FixedAssetSerializer(_get_asset(cp, pk, annotate=True)).data)


# ═══════════════════════════════════════════════════════════
# Grupių nustatymai
# ═══════════════════════════════════════════════════════════

class FixedAssetGroupDetailView(APIView):
    """PATCH /api/fixed-assets/groups/<pk>/"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        cp = _get_company_profile(request)

        group = FixedAssetGroup.objects.filter(pk=pk, company_profile=cp).first()
        if group is None:
            raise FixedAssetError("Turto grupė nerasta")

        serializer = FixedAssetGroupUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        group = update_fixed_asset_group(group, dict(serializer.validated_data))
        return Response(FixedAssetGroupSerializer(group).data)


# ═══════════════════════════════════════════════════════════
# Rankinis kūrimas
# ═══════════════════════════════════════════════════════════

class FixedAssetManualCreateView(APIView):
    """POST /api/fixed-assets/manual/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cp = _get_company_profile(request)

        serializer = FixedAssetManualSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        group = FixedAssetGroup.objects.filter(pk=data["group_id"], company_profile=cp).first()
        if group is None:
            raise FixedAssetError("Turto grupė nerasta")

        asset = create_manual_fixed_asset(
            company_profile=cp,
            user=request.user,
            source=data["source"],
            group=group,
            name=data["name"],
            acquisition_cost=data["acquisition_cost"],
            purchase_date=data["purchase_date"],
            operation_start_date=data.get("operation_start_date"),
            useful_life_months=data.get("useful_life_months"),
            salvage_value=data.get("salvage_value") or 0,
            accumulated_depreciation=data.get("accumulated_depreciation") or 0,
            credit_account=data.get("credit_account", ""),
            inventory_number=data.get("inventory_number", ""),
            description=data.get("description", ""),
        )

        return Response(
            FixedAssetSerializer(_get_asset(cp, asset.pk, annotate=True)).data,
            status=status.HTTP_201_CREATED,
        )


# ═══════════════════════════════════════════════════════════
# Pagerinimai
# ═══════════════════════════════════════════════════════════

class FixedAssetImprovementListCreateView(APIView):
    """GET /api/fixed-assets/improvements/?purchase_id=  |  POST /api/fixed-assets/improvements/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)

        qs = (
            FixedAssetOperation.objects
            .filter(
                asset__company_profile=cp,
                operation_type=FixedAssetOperationType.IMPROVEMENT,
            )
            .select_related("asset", "journal_entry", "purchase")
            .order_by("operation_date", "created_at")
        )

        purchase_id = request.query_params.get("purchase_id")
        if purchase_id:
            qs = qs.filter(purchase_id=purchase_id)

        return Response(FixedAssetOperationSerializer(qs, many=True).data)

    def post(self, request):
        cp = _get_company_profile(request)

        serializer = FixedAssetImprovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        asset = _get_asset(cp, data["asset_id"])
        purchase, line = _get_purchase_and_line(
            cp,
            data["purchase_id"],
            data.get("purchase_line_id"),
        )

        op = improve_fixed_asset(
            asset=asset,
            purchase=purchase,
            purchase_line=line,
            amount=data["amount"],
            extra_months=data.get("extra_months") or 0,
        )

        return Response(
            FixedAssetOperationSerializer(op).data,
            status=status.HTTP_201_CREATED,
        )


class FixedAssetImprovementCancelView(APIView):
    """POST /api/fixed-assets/improvements/<op_id>/cancel/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, op_id):
        cp = _get_company_profile(request)

        op = FixedAssetOperation.objects.filter(
            pk=op_id,
            asset__company_profile=cp,
            operation_type=FixedAssetOperationType.IMPROVEMENT,
        ).first()

        if op is None:
            raise FixedAssetError("Pagerinimas nerastas")

        cancel_improvement(op)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ═══════════════════════════════════════════════════════════
# Pardavimo sąskaitų paieška
# ═══════════════════════════════════════════════════════════

class FixedAssetSaleCandidatesView(APIView):
    """GET /api/fixed-assets/sale-candidates/?search="""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from ..utils.journal_generators import can_post_to_dk

        cp = _get_company_profile(request)
        q = (request.query_params.get("search") or "").strip().lower()

        invoices = (
            Invoice.objects
            .filter(company_profile=cp)
            .exclude(status__in=["draft", "cancelled"])
            .exclude(invoice_type__in=["kreditine", "isankstine"])
            .prefetch_related("line_items")
            .order_by("-invoice_date", "-id")[:200]
        )

        used_lines = set(
            FixedAsset.objects
            .filter(company_profile=cp, sale_invoice_line__isnull=False)
            .values_list("sale_invoice_line_id", flat=True)
        )
        used_invoices = set(
            FixedAsset.objects
            .filter(company_profile=cp, sale_invoice__isnull=False, sale_invoice_line__isnull=True)
            .values_list("sale_invoice_id", flat=True)
        )

        results = []

        for inv in invoices:
            number = inv.full_number or ""
            buyer = inv.buyer_name or ""

            if q and q not in number.lower() and q not in buyer.lower():
                continue

            if not can_post_to_dk(inv):
                continue

            results.append({
                "id": inv.pk,
                "number": number,
                "buyer_name": buyer,
                "invoice_date": inv.invoice_date,
                "currency": inv.currency or "EUR",
                "amount_wo_vat": abs(inv.amount_wo_vat or 0),
                "used": inv.pk in used_invoices,
                "lines": [
                    {
                        "id": il.pk,
                        "name": (
                            getattr(il, "prekes_pavadinimas", "")
                            or getattr(il, "name", "")
                            or ""
                        ),
                        "subtotal": abs(il.subtotal or 0),
                        "used": il.pk in used_lines,
                    }
                    for il in inv.line_items.all()
                ],
            })

            if len(results) >= 30:
                break

        return Response(results)


class FixedAssetPurchaseUsageView(APIView):
    """
    GET /api/fixed-assets/purchase-usage/?purchase_id=
    Likutis eilutėms, iš kurių jau sukurtas IT ar pagerinimas.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cp = _get_company_profile(request)
        purchase, _ = _get_purchase_and_line(cp, request.query_params.get("purchase_id"), None)

        lines = list(purchase.line_items.all())

        if not lines:
            return Response({"doc": get_available_amount(purchase, None)})

        linked = set(
            FixedAsset.objects
            .filter(purchase=purchase)
            .values_list("purchase_line_id", flat=True)
        ) | set(
            FixedAssetOperation.objects
            .filter(operation_type=FixedAssetOperationType.IMPROVEMENT, purchase=purchase)
            .values_list("purchase_line_id", flat=True)
        )

        return Response({
            str(line.pk): get_available_amount(purchase, line)
            for line in lines
            if line.pk in linked
        })