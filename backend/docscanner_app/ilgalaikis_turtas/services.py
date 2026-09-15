import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum

from ..models import (
    FixedAsset,
    FixedAssetGroup,
    FixedAssetOperation,
    JournalEntry,
    JournalEntryLine,
    Purchase,
)
from ..utils.journal_generators import (
    _add_line,
    _period_from_date,
    _to_decimal,
    _to_eur_amount,
    finalize_journal_entry,
)
from .constants import (
    DEFAULT_GROUP_ACCOUNTS,
    DepreciationBook,
    FixedAssetCategory,
    FixedAssetOperationType,
    FixedAssetStatus,
    ILT_MONTHS,
)

logger = logging.getLogger("docscanner_app")

MONEY = Decimal("0.01")
ZERO = Decimal("0")
DEFAULT_EXPENSE_ACCOUNT = "6312"


from rest_framework import status
from rest_framework.exceptions import APIException


class FixedAssetError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Ilgalaikio turto klaida"
    default_code = "fixed_asset_error"

# ═══════════════════════════════════════════════════════════
# Turto grupės
# ═══════════════════════════════════════════════════════════

@transaction.atomic
def ensure_default_groups(company_profile):
    existing = set(
        FixedAssetGroup.objects
        .filter(company_profile=company_profile)
        .values_list("category", flat=True)
    )

    to_create = []
    for category in FixedAssetCategory.values:
        if category in existing:
            continue

        asset_acc, accum_acc, expense_acc = DEFAULT_GROUP_ACCOUNTS.get(
            category, ("", "", "")
        )

        to_create.append(
            FixedAssetGroup(
                company_profile=company_profile,
                category=category,
                useful_life_months=ILT_MONTHS.get(category),
                asset_account=asset_acc,
                accumulated_depreciation_account=accum_acc,
                depreciation_expense_account=expense_acc,
            )
        )

    if to_create:
        FixedAssetGroup.objects.bulk_create(
            to_create,
            ignore_conflicts=True,
        )
        logger.info(
            "Created %s default fixed asset groups for company_profile=%s",
            len(to_create),
            company_profile.pk,
        )

    return FixedAssetGroup.objects.filter(company_profile=company_profile)


# ═══════════════════════════════════════════════════════════
# Pirkimo šaltinis
# ═══════════════════════════════════════════════════════════

def _purchase_entry_date(purchase):
    # Ta pati logika kaip generate_purchase_journal_entry
    return (
        purchase.operation_date
        or purchase.invoice_date
        or purchase.created_at.date()
    )


def _purchase_rate(purchase):
    currency = (purchase.currency or "EUR").upper()
    if currency == "EUR":
        return Decimal("1")

    from ..services.accounting_transfer import rate_to_eur
    return rate_to_eur(currency, _purchase_entry_date(purchase))


def get_purchase_source(purchase, purchase_line=None):
    """
    Grąžina (suma_eur_be_pvm, sąnaudų_sąskaita), iš kurios kuriamas IT.

    Detaliai: eilutės dalis po dokumento nuolaidos (proporcingai,
    kaip _allocate_groups_to_total), sąskaita = effective_debeto.
    Sumiškai: visa amount_wo_vat, sąskaita = debeto_saskaita.
    """
    rate = _purchase_rate(purchase)
    amount_wo_vat = _to_decimal(purchase.amount_wo_vat)

    if purchase_line is None:
        if purchase.line_items.exists():
            raise FixedAssetError(
                "Detaliai sąskaitoje ilgalaikį turtą kurkite iš eilutės"
            )

        amount_eur = _to_eur_amount(amount_wo_vat, rate)
        account = purchase.debeto_saskaita or DEFAULT_EXPENSE_ACCOUNT

    else:
        if purchase_line.purchase_id != purchase.pk:
            raise FixedAssetError("Eilutė nepriklauso šiam pirkimui")

        lines_total = sum(
            (_to_decimal(pl.subtotal) for pl in purchase.line_items.all()),
            ZERO,
        )

        if lines_total == ZERO:
            share = ZERO
        else:
            share = amount_wo_vat * _to_decimal(purchase_line.subtotal) / lines_total

        amount_eur = _to_eur_amount(share, rate)
        account = purchase_line.effective_debeto or DEFAULT_EXPENSE_ACCOUNT

    return (
        _to_decimal(amount_eur).quantize(MONEY, rounding=ROUND_HALF_UP),
        str(account).strip(),
    )


def get_available_amount(purchase, purchase_line=None, exclude_asset_id=None):
    source_amount, _ = get_purchase_source(purchase, purchase_line)

    qs = FixedAsset.objects.filter(
        purchase=purchase,
        purchase_line=purchase_line,
    )

    if exclude_asset_id:
        qs = qs.exclude(pk=exclude_asset_id)

    used = qs.aggregate(total=Sum("acquisition_cost"))["total"] or ZERO

    return source_amount - used


# ═══════════════════════════════════════════════════════════
# Reklasifikacija
# ═══════════════════════════════════════════════════════════

def _create_reclass_entry(asset, purchase, source_account, amount):
    """
    D group.asset_account  (pvz. 1240)
    K source_account       (pvz. 6312)
    """
    entry_date = _purchase_entry_date(purchase)
    document_number = (
        f"{purchase.document_series or ''}{purchase.document_number or ''}"
    ).strip()
    description = f"IT pripažinimas: {asset.name}"[:255]

    entry = JournalEntry.objects.create(
        user=purchase.user,
        company_profile=purchase.company_profile,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
        entry_date=entry_date,
        period=_period_from_date(entry_date),
        document_number=document_number,
        counterparty_name=purchase.seller_name or "",
        counterparty_code=purchase.seller_id or "",
        description=description,
        currency="EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    lines = []
    sort_order = _add_line(
        lines,
        entry=entry,
        side="D",
        account_code=asset.group.asset_account,
        amount=amount,
        description=description,
        sort_order=0,
    )
    _add_line(
        lines,
        entry=entry,
        side="K",
        account_code=source_account,
        amount=amount,
        description=description,
        sort_order=sort_order,
    )

    JournalEntryLine.objects.bulk_create(lines)
    finalize_journal_entry(entry)

    return entry


# ═══════════════════════════════════════════════════════════
# IT kūrimas / šalinimas
# ═══════════════════════════════════════════════════════════

@transaction.atomic
def create_fixed_asset_from_purchase(
    *,
    purchase,
    group,
    name,
    acquisition_cost,
    purchase_line=None,
    operation_start_date=None,
    useful_life_months=None,
    salvage_value=ZERO,
    inventory_number="",
    description="",
):
    # Užrakinam pirkimą, kad dvi lygiagrečios užklausos neviršytų sumos
    purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)

    if group.company_profile_id != purchase.company_profile_id:
        raise FixedAssetError("Turto grupė priklauso kitai įmonei")

    if not group.asset_account:
        raise FixedAssetError("Turto grupei nenurodyta turto DK sąskaita")

    from ..opening_balances.services import is_before_cutover
    if is_before_cutover(purchase.company_profile_id, _purchase_entry_date(purchase)):
        raise FixedAssetError(
            "Pirkimas yra iki perėjimo datos - turtą įveskite per pradinius likučius"
        )

    has_purchase_je = JournalEntry.objects.filter(
        purchase=purchase,
        source_type=JournalEntry.SOURCE_PURCHASE,
        status=JournalEntry.STATUS_POSTED,
    ).exists()

    if not has_purchase_je:
        raise FixedAssetError("Pirkimas dar neužregistruotas DK")

    cost = _to_decimal(acquisition_cost).quantize(MONEY, rounding=ROUND_HALF_UP)

    if cost <= ZERO:
        raise FixedAssetError("Įsigijimo savikaina turi būti didesnė už 0")

    available = get_available_amount(purchase, purchase_line)
    if cost > available:
        raise FixedAssetError(
            f"Viršyta galima suma. Galima: {available} EUR"
        )

    _, source_account = get_purchase_source(purchase, purchase_line)

    asset = FixedAsset.objects.create(
        company_profile=purchase.company_profile,
        group=group,
        inventory_number=inventory_number or "",
        name=name,
        status=(
            FixedAssetStatus.ACTIVE
            if operation_start_date
            else FixedAssetStatus.DRAFT
        ),
        purchase_date=_purchase_entry_date(purchase),
        operation_start_date=operation_start_date,
        acquisition_cost=cost,
        salvage_value=_to_decimal(salvage_value).quantize(MONEY, rounding=ROUND_HALF_UP),
        useful_life_months=useful_life_months or group.useful_life_months,
        description=description or "",
        purchase=purchase,
        purchase_line=purchase_line,
    )

    entry = None
    if source_account != group.asset_account:
        entry = _create_reclass_entry(asset, purchase, source_account, cost)

    FixedAssetOperation.objects.create(
        asset=asset,
        operation_type=FixedAssetOperationType.ACQUISITION,
        operation_date=asset.purchase_date,
        amount=cost,
        book=DepreciationBook.ACCOUNTING,
        journal_entry=entry,
        description=f"Įsigijimas iš pirkimo {entry.document_number if entry else ''}".strip(),
    )

    logger.info(
        "Fixed asset %s created from purchase=%s line=%s, reclass_je=%s",
        asset.pk,
        purchase.pk,
        getattr(purchase_line, "pk", None),
        getattr(entry, "pk", None),
    )

    return asset


@transaction.atomic
def delete_fixed_asset(asset):
    has_other_ops = asset.operations.exclude(
        operation_type=FixedAssetOperationType.ACQUISITION
    ).exists()

    if has_other_ops:
        raise FixedAssetError(
            "Turtas turi nusidėvėjimo ar kitų operacijų - ištrinti negalima"
        )

    entry_ids = list(
        asset.operations
        .filter(journal_entry__isnull=False)
        .values_list("journal_entry_id", flat=True)
    )

    JournalEntry.objects.filter(pk__in=entry_ids).delete()
    asset.delete()


# ═══════════════════════════════════════════════════════════
# Pirkimo apsauga
# ═══════════════════════════════════════════════════════════

def validate_purchase_fixed_assets(purchase):
    """
    Tikrina, ar pirkimas vis dar atitinka iš jo sukurtą IT.
    Kviečiama prieš perkuriant / šalinant pirkimo DK įrašą.
    """
    assets = list(
        FixedAsset.objects
        .filter(purchase=purchase)
        .select_related("group", "purchase_line")
    )

    if not assets:
        return

    from ..utils.journal_generators import can_post_to_dk

    if not can_post_to_dk(purchase):
        raise FixedAssetError(
            "Iš šio pirkimo sukurtas ilgalaikis turtas - "
            "pirkimo negalima anuliuoti ar išregistruoti iš DK"
        )

    entry_date = _purchase_entry_date(purchase)
    checked_lines = set()

    for asset in assets:
        line = asset.purchase_line

        try:
            _, source_account = get_purchase_source(purchase, line)
        except FixedAssetError:
            raise FixedAssetError(
                f"Pirkimo struktūra pakeista - ji nebeatitinka "
                f"ilgalaikio turto „{asset.name}“"
            )

        line_key = getattr(line, "pk", None)
        if line_key not in checked_lines:
            checked_lines.add(line_key)

            if get_available_amount(purchase, line) < ZERO:
                raise FixedAssetError(
                    f"Pirkimo suma tapo mažesnė už ilgalaikio turto "
                    f"„{asset.name}“ savikainą"
                )

        acquisition = (
            asset.operations
            .filter(operation_type=FixedAssetOperationType.ACQUISITION)
            .select_related("journal_entry")
            .first()
        )
        entry = getattr(acquisition, "journal_entry", None)

        if entry is None:
            if source_account != asset.group.asset_account:
                raise FixedAssetError(
                    f"Pakeista pirkimo DK sąskaita - ji nebeatitinka "
                    f"ilgalaikio turto „{asset.name}“"
                )
            continue

        credited = set(
            entry.lines
            .filter(side="K")
            .values_list("account_code", flat=True)
        )

        if source_account not in credited:
            raise FixedAssetError(
                f"Pakeista pirkimo DK sąskaita - ji nebeatitinka "
                f"ilgalaikio turto „{asset.name}“"
            )

        if entry.entry_date != entry_date:
            raise FixedAssetError(
                f"Pakeista pirkimo data - ji nebeatitinka "
                f"ilgalaikio turto „{asset.name}“"
            )