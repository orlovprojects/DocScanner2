import calendar
import logging
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce

from ..models import (
    CompanyProfile,
    FixedAsset,
    FixedAssetOperation,
    JournalEntry,
    JournalEntryLine,
)
from ..utils.journal_generators import _add_line, finalize_journal_entry
from .constants import (
    DEFAULT_DEPRECIATION_START_RULE,
    DepreciationBook,
    DepreciationStartRule,
    FixedAssetOperationType,
    FixedAssetStatus,
)
from .services import FixedAssetError

logger = logging.getLogger("docscanner_app")

MONEY = Decimal("0.01")
ZERO = Decimal("0.00")
DEC = DecimalField(max_digits=14, decimal_places=2)

DEP = FixedAssetOperationType.DEPRECIATION
ACC = DepreciationBook.ACCOUNTING


# ═══════════════════════════════════════════════════════════
# Datos
# ═══════════════════════════════════════════════════════════

def month_start(d):
    return d.replace(day=1)


def month_end(d):
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def add_months(d, n):
    m = d.month - 1 + n
    return d.replace(year=d.year + m // 12, month=m % 12 + 1, day=1)


def months_between(a, b):
    return (b.year - a.year) * 12 + (b.month - a.month)


def depreciation_start_period(asset, rule=DEFAULT_DEPRECIATION_START_RULE):
    if not asset.operation_start_date:
        return None

    start = month_start(asset.operation_start_date)

    if rule == DepreciationStartRule.NEXT_MONTH:
        return add_months(start, 1)

    return start


# ═══════════════════════════════════════════════════════════
# Likučiai iš operacijų
# ═══════════════════════════════════════════════════════════

def _annotate_balances(qs, book=ACC):
    cost_types = [
        FixedAssetOperationType.ACQUISITION,
        FixedAssetOperationType.IMPROVEMENT,
    ]

    return qs.annotate(
        base_cost=Coalesce(
            Sum("operations__amount", filter=Q(operations__operation_type__in=cost_types)),
            Value(ZERO),
            output_field=DEC,
        ),
        accumulated=Coalesce(
            Sum("operations__amount", filter=Q(operations__operation_type=DEP, operations__book=book)),
            Value(ZERO),
            output_field=DEC,
        ),
        last_period=Max(
            "operations__period",
            filter=Q(operations__operation_type=DEP, operations__book=book),
        ),
    )


def _period_amount(asset, period, base_cost, accumulated):
    start = depreciation_start_period(asset)

    if start is None or period < start or not asset.useful_life_months:
        return ZERO

    remaining = base_cost - (asset.salvage_value or ZERO) - accumulated
    if remaining <= ZERO:
        return ZERO

    remaining_months = asset.useful_life_months - months_between(start, period)
    if remaining_months <= 1:
        return remaining

    amount = (remaining / remaining_months).quantize(MONEY, rounding=ROUND_HALF_UP)
    return min(amount, remaining)


# ═══════════════════════════════════════════════════════════
# Kortelės grafikas
# ═══════════════════════════════════════════════════════════

def build_schedule(asset):
    asset = _annotate_balances(FixedAsset.objects.filter(pk=asset.pk)).get()
    start = depreciation_start_period(asset)

    if start is None or not asset.useful_life_months:
        return []

    registered = dict(
        FixedAssetOperation.objects
        .filter(asset_id=asset.pk, operation_type=DEP, book=ACC)
        .values_list("period", "amount")
    )

    rows = []
    accumulated = ZERO
    period = start
    limit = asset.useful_life_months + 120

    while len(rows) < limit:
        is_registered = period in registered

        if is_registered:
            amount = registered[period]
        else:
            amount = _period_amount(asset, period, asset.base_cost, accumulated)

        if amount <= ZERO:
            break

        accumulated += amount
        rows.append({
            "period": period,
            "amount": amount,
            "accumulated": accumulated,
            "residual": asset.base_cost - accumulated,
            "registered": is_registered,
        })
        period = add_months(period, 1)

    return rows


# ═══════════════════════════════════════════════════════════
# Mėnesinis skaičiavimas
# ═══════════════════════════════════════════════════════════

def calculate_period(company_profile, period):
    period = month_start(period)
    rows = []
    errors = []

    from ..opening_balances.services import is_before_cutover

    if is_before_cutover(company_profile.pk, month_end(period)):
        return {
            "period": period,
            "rows": [],
            "total": ZERO,
            "errors": ["Periodas yra iki perėjimo datos"],
            "registered": False,
        }

    registered = FixedAssetOperation.objects.filter(
        asset__company_profile=company_profile,
        operation_type=DEP,
        book=ACC,
        period=period,
    ).exists()

    assets = _annotate_balances(
        FixedAsset.objects
        .filter(
            company_profile=company_profile,
            status=FixedAssetStatus.ACTIVE,
            operation_start_date__isnull=False,
        )
        .select_related("group")
    ).order_by("inventory_number", "pk")

    missing_periods = set()

    for asset in assets:
        start = depreciation_start_period(asset)

        if start is None or start > period or not asset.useful_life_months:
            continue

        expected = add_months(asset.last_period, 1) if asset.last_period else start

        if expected > period:
            continue

        if expected < period:
            missing_periods.add(expected)
            continue

        amount = _period_amount(asset, period, asset.base_cost, asset.accumulated)
        if amount <= ZERO:
            continue

        group = asset.group
        if (
            not group
            or not group.depreciation_expense_account
            or not group.accumulated_depreciation_account
        ):
            errors.append(f"„{asset}“: turto grupei nenurodytos nusidėvėjimo DK sąskaitos")
            continue

        rows.append({
            "asset_id": asset.pk,
            "inventory_number": asset.inventory_number,
            "name": asset.name,
            "group": group.get_category_display(),
            "amount": amount,
            "accumulated_after": asset.accumulated + amount,
            "residual_after": asset.base_cost - asset.accumulated - amount,
            "expense_account": group.depreciation_expense_account,
            "accumulated_account": group.accumulated_depreciation_account,
        })

    if missing_periods:
        errors.insert(
            0,
            f"Pirmiausia užregistruokite {min(missing_periods):%Y-%m} nusidėvėjimą",
        )

    return {
        "period": period,
        "rows": rows,
        "total": sum((r["amount"] for r in rows), ZERO),
        "errors": errors,
        "registered": registered,
    }


@transaction.atomic
def register_period(company_profile, period, user):
    # Užraktas: du lygiagretūs registravimai tam pačiam periodui
    CompanyProfile.objects.select_for_update().filter(pk=company_profile.pk).first()

    result = calculate_period(company_profile, period)

    if result["errors"]:
        raise FixedAssetError(result["errors"][0])

    if not result["rows"]:
        raise FixedAssetError("Nėra turto, kuriam reikia skaičiuoti nusidėvėjimą")

    period = result["period"]
    entry_date = month_end(period)
    description = f"Ilgalaikio turto nusidėvėjimas {period:%Y-%m}"

    entry = JournalEntry.objects.create(
        user=user,
        company_profile=company_profile,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
        entry_date=entry_date,
        period=period,
        document_number=f"NUS-{period:%Y-%m}",
        description=description,
        currency="EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    debit = defaultdict(lambda: ZERO)
    credit = defaultdict(lambda: ZERO)

    for r in result["rows"]:
        debit[r["expense_account"]] += r["amount"]
        credit[r["accumulated_account"]] += r["amount"]

    lines = []
    sort_order = 0

    for code in sorted(debit):
        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=code,
            amount=debit[code],
            description=description,
            sort_order=sort_order,
        )

    for code in sorted(credit):
        sort_order = _add_line(
            lines,
            entry=entry,
            side="K",
            account_code=code,
            amount=credit[code],
            description=description,
            sort_order=sort_order,
        )

    JournalEntryLine.objects.bulk_create(lines)
    finalize_journal_entry(entry)

    FixedAssetOperation.objects.bulk_create([
        FixedAssetOperation(
            asset_id=r["asset_id"],
            operation_type=DEP,
            operation_date=entry_date,
            amount=r["amount"],
            book=ACC,
            period=period,
            journal_entry=entry,
            description=description,
        )
        for r in result["rows"]
    ])

    logger.info(
        "Depreciation registered company_profile=%s period=%s assets=%s total=%s je=%s",
        company_profile.pk,
        period,
        len(result["rows"]),
        result["total"],
        entry.pk,
    )

    return entry


@transaction.atomic
def cancel_period(company_profile, period):
    period = month_start(period)

    ops = FixedAssetOperation.objects.filter(
        asset__company_profile=company_profile,
        operation_type=DEP,
        book=ACC,
    )

    if not ops.filter(period=period).exists():
        raise FixedAssetError("Šis periodas neužregistruotas")

    if ops.filter(period__gt=period).exists():
        raise FixedAssetError("Pirmiausia atšaukite vėlesnių periodų nusidėvėjimą")

    period_asset_ids = ops.filter(period=period).values("asset_id")
    if FixedAssetOperation.objects.filter(
        asset_id__in=period_asset_ids,
        operation_type__in=[
            FixedAssetOperationType.WRITE_OFF,
            FixedAssetOperationType.SALE,
        ],
    ).exists():
        raise FixedAssetError(
            "Dalis šio periodo turto jau nurašyta ar parduota - "
            "pirmiausia atšaukite nurašymą"
        )

    entry_ids = set(
        ops.filter(period=period, journal_entry__isnull=False)
        .values_list("journal_entry_id", flat=True)
    )

    ops.filter(period=period).delete()
    JournalEntry.objects.filter(
        pk__in=entry_ids,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
    ).delete()