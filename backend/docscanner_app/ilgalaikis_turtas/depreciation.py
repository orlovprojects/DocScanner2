import calendar
import logging
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from ..models import (
    CompanyProfile,
    FixedAsset,
    FixedAssetOperation,
    JournalEntry,
    JournalEntryLine,
    OpeningBalanceBatch,
)
from ..utils.journal_generators import _add_line, finalize_journal_entry
from .constants import (
    DEFAULT_DEPRECIATION_START_RULE,
    NUS_DOCUMENT_PREFIX,
    OPENING_REASON,
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


def nus_document_number(period):
    return f"{NUS_DOCUMENT_PREFIX}{period:%Y-%m}"


def first_allowed_period(company_profile_id):
    batch = (
        OpeningBalanceBatch.objects
        .filter(
            company_profile_id=company_profile_id,
            status=OpeningBalanceBatch.STATUS_CONFIRMED,
        )
        .only("cutover_date")
        .first()
    )
    return month_start(batch.cutover_date) if batch else None


def last_registered_period(company_profile):
    return (
        FixedAssetOperation.objects
        .filter(
            asset__company_profile=company_profile,
            operation_type=DEP,
            book=ACC,
            journal_entry__document_number__startswith=NUS_DOCUMENT_PREFIX,
        )
        .aggregate(p=Max("journal_entry__period"))["p"]
    )


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


def pending_depreciation(asset, until_period, min_period=None):
    """
    Neužregistruotas nusidėvėjimas nuo kito mėnesio po paskutinio
    užregistruoto iki until_period imtinai. Grąžina [(period, amount), ...].
    asset turi būti su _annotate_balances.
    """
    start = depreciation_start_period(asset)
    if start is None or not asset.useful_life_months:
        return []

    period = add_months(asset.last_period, 1) if asset.last_period else start
    if min_period and period < min_period:
        period = min_period

    accumulated = asset.accumulated
    rows = []

    while period <= until_period:
        amount = _period_amount(asset, period, asset.base_cost, accumulated)
        if amount <= ZERO:
            break

        rows.append((period, amount))
        accumulated += amount
        period = add_months(period, 1)

    return rows


# ═══════════════════════════════════════════════════════════
# Kortelės grafikas
# ═══════════════════════════════════════════════════════════

def build_schedule(asset):
    asset = _annotate_balances(FixedAsset.objects.filter(pk=asset.pk)).get()
    start = depreciation_start_period(asset)

    if start is None or not asset.useful_life_months:
        return []

    ops = list(
        FixedAssetOperation.objects
        .filter(asset_id=asset.pk, operation_type=DEP, book=ACC)
        .values_list("period", "amount", "reason")
    )
    registered = {p: a for p, a, r in ops if r != OPENING_REASON}
    opening = [(p, a) for p, a, r in ops if r == OPENING_REASON]

    rows = []
    accumulated = ZERO
    period = start

    if opening:
        opening_period, opening_amount = opening[0]
        accumulated = opening_amount
        rows.append({
            "period": opening_period,
            "amount": opening_amount,
            "accumulated": opening_amount,
            "residual": asset.base_cost - opening_amount,
            "registered": True,
            "opening": True,
        })
        period = add_months(opening_period, 1)
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

def _registered_rows(company_profile, period):
    ops = (
        FixedAssetOperation.objects
        .filter(
            asset__company_profile=company_profile,
            operation_type=DEP,
            book=ACC,
            journal_entry__document_number=nus_document_number(period),
        )
        .select_related("asset", "asset__group")
        .order_by("asset__inventory_number", "asset_id", "period")
    )

    grouped = {}
    for op in ops:
        row = grouped.get(op.asset_id)
        if row is None:
            asset = op.asset
            row = grouped[op.asset_id] = {
                "asset_id": asset.pk,
                "inventory_number": asset.inventory_number,
                "name": asset.name,
                "group": asset.group.get_category_display() if asset.group else "",
                "amount": ZERO,
                "months": [],
                "catch_up_months": 0,
                "journal_entry_id": op.journal_entry_id,
            }
        row["amount"] += op.amount
        row["months"].append({"period": op.period, "amount": op.amount})

    rows = list(grouped.values())
    for row in rows:
        row["catch_up_months"] = len([m for m in row["months"] if m["period"] != period])

    return rows


def calculate_period(company_profile, period):
    period = month_start(period)
    last = last_registered_period(company_profile)

    result = {
        "period": period,
        "rows": [],
        "total": ZERO,
        "errors": [],
        "warnings": [],
        "registered": False,
        "last_registered": last,
    }

    min_period = first_allowed_period(company_profile.pk)
    if min_period and period < min_period:
        result["errors"].append(f"Periodas yra iki perėjimo datos ({min_period:%Y-%m})")
        return result

    if last and period <= last:
        rows = _registered_rows(company_profile, period)
        result["rows"] = rows
        result["total"] = sum((r["amount"] for r in rows), ZERO)
        result["registered"] = bool(rows)
        if not rows:
            result["errors"].append(
                f"Nusidėvėjimas užregistruotas iki {last:%Y-%m} - ankstesnio periodo skaičiuoti negalima"
            )
        return result

    assets = _annotate_balances(
        FixedAsset.objects
        .filter(
            company_profile=company_profile,
            status=FixedAssetStatus.ACTIVE,
            operation_start_date__isnull=False,
        )
        .select_related("group")
    ).order_by("inventory_number", "pk")

    rows = []
    errors = []

    for asset in assets:
        pending = pending_depreciation(asset, period, min_period)
        if not pending:
            continue

        group = asset.group
        if (
            not group
            or not group.depreciation_expense_account
            or not group.accumulated_depreciation_account
        ):
            errors.append(f"„{asset}“: turto grupei nenurodytos nusidėvėjimo DK sąskaitos")
            continue

        amount = sum((a for _, a in pending), ZERO)

        rows.append({
            "asset_id": asset.pk,
            "inventory_number": asset.inventory_number,
            "name": asset.name,
            "group": group.get_category_display(),
            "amount": amount,
            "months": [{"period": p, "amount": a} for p, a in pending],
            "catch_up_months": len([p for p, _ in pending if p != period]),
            "accumulated_after": asset.accumulated + amount,
            "residual_after": asset.base_cost - asset.accumulated - amount,
            "expense_account": group.depreciation_expense_account,
            "accumulated_account": group.accumulated_depreciation_account,
        })

    warnings = []

    catch_up_count = len([r for r in rows if r["catch_up_months"] > 0])
    if catch_up_count:
        warnings.append(
            f"{catch_up_count} turto vnt. bus priskaičiuotas praleistų mėnesių nusidėvėjimas"
        )

    prior_years = sorted({
        m["period"].year
        for r in rows
        for m in r["months"]
        if m["period"].year < period.year
    })
    if prior_years:
        warnings.append(
            f"Dalis nusidėvėjimo priklauso {', '.join(map(str, prior_years))} m. - "
            "tai ankstesnių metų klaidos taisymas, suderinkite su buhalteriu"
        )

    result.update(
        rows=rows,
        total=sum((r["amount"] for r in rows), ZERO),
        errors=errors,
        warnings=warnings,
    )
    return result


@transaction.atomic
def register_period(company_profile, period, user):
    # Užraktas: du lygiagretūs registravimai
    CompanyProfile.objects.select_for_update().filter(pk=company_profile.pk).first()

    period = month_start(period)

    if period > month_start(timezone.localdate()):
        raise FixedAssetError("Negalima registruoti būsimo periodo nusidėvėjimo")

    result = calculate_period(company_profile, period)

    if result["registered"]:
        raise FixedAssetError("Šis periodas jau užregistruotas")

    if result["errors"]:
        raise FixedAssetError(result["errors"][0])

    if not result["rows"]:
        raise FixedAssetError("Nėra turto, kuriam reikia skaičiuoti nusidėvėjimą")

    entry_date = month_end(period)
    description = f"Ilgalaikio turto nusidėvėjimas {period:%Y-%m}"

    entry = JournalEntry.objects.create(
        user=user,
        company_profile=company_profile,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
        entry_date=entry_date,
        period=period,
        document_number=nus_document_number(period),
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
            amount=m["amount"],
            book=ACC,
            period=m["period"],
            journal_entry=entry,
            description=(
                description
                if m["period"] == period
                else f"{description} (už {m['period']:%Y-%m})"
            ),
        )
        for r in result["rows"]
        for m in r["months"]
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
        journal_entry__document_number=nus_document_number(period),
    )

    if not ops.exists():
        raise FixedAssetError("Šis periodas neužregistruotas")

    last = last_registered_period(company_profile)
    if last and last > period:
        raise FixedAssetError("Pirmiausia atšaukite vėlesnių periodų nusidėvėjimą")

    if FixedAssetOperation.objects.filter(
        asset_id__in=ops.values("asset_id"),
        operation_type__in=[
            FixedAssetOperationType.WRITE_OFF,
            FixedAssetOperationType.SALE,
        ],
    ).exists():
        raise FixedAssetError(
            "Dalis šio periodo turto jau nurašyta ar parduota - "
            "pirmiausia atšaukite nurašymą ar pardavimą"
        )

    entry_ids = set(ops.values_list("journal_entry_id", flat=True))

    ops.delete()
    JournalEntry.objects.filter(
        pk__in=entry_ids,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
    ).delete()