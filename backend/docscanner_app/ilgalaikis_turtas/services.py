import logging
import re
from datetime import timedelta
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.db.models import F, Sum

from ..models import (
    FixedAsset,
    FixedAssetGroup,
    FixedAssetOperation,
    JournalEntry,
    JournalEntryLine,
    Purchase,
)
from ..utils.chart_of_accounts import is_valid_account
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
    INVENTORY_NUMBER_DIGITS,
    INVENTORY_NUMBER_PREFIX,
    MAX_SPLIT_COUNT,
    CONTROL_ACCOUNT_PREFIXES,
    OPENING_REASON,
    ManualAssetSource,
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

    improved = (
        FixedAssetOperation.objects
        .filter(
            operation_type=FixedAssetOperationType.IMPROVEMENT,
            purchase=purchase,
            purchase_line=purchase_line,
        )
        .aggregate(total=Sum("amount"))["total"]
        or ZERO
    )

    return source_amount - used - improved


# ═══════════════════════════════════════════════════════════
# Reklasifikacija
# ═══════════════════════════════════════════════════════════

def _purchase_document_number(purchase):
    return f"{purchase.document_series or ''}{purchase.document_number or ''}".strip()


def _create_reclass_entry(*, purchase, group, source_account, amount, description):
    """
    D group.asset_account  (pvz. 1240)
    K source_account       (pvz. 6312)
    """
    entry_date = _purchase_entry_date(purchase)

    entry = JournalEntry.objects.create(
        user=purchase.user,
        company_profile=purchase.company_profile,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
        entry_date=entry_date,
        period=_period_from_date(entry_date),
        document_number=_purchase_document_number(purchase),
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
        account_code=group.asset_account,
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
# Inventoriniai numeriai
# ═══════════════════════════════════════════════════════════

_INVENTORY_RE = re.compile(r"^" + re.escape(INVENTORY_NUMBER_PREFIX) + r"(\d+)$")


def next_inventory_numbers(company_profile_id, count=1):
    last = 0
    values = (
        FixedAsset.objects
        .filter(
            company_profile_id=company_profile_id,
            inventory_number__startswith=INVENTORY_NUMBER_PREFIX,
        )
        .values_list("inventory_number", flat=True)
    )

    for value in values:
        match = _INVENTORY_RE.match(value or "")
        if match:
            last = max(last, int(match.group(1)))

    return [
        f"{INVENTORY_NUMBER_PREFIX}{last + i:0{INVENTORY_NUMBER_DIGITS}d}"
        for i in range(1, count + 1)
    ]


def _split_amount(total, count):
    if count == 1:
        return [total]

    base = (total / count).quantize(MONEY, rounding=ROUND_DOWN)
    if base <= ZERO:
        raise FixedAssetError("Suma per maža padalinti į tiek kortelių")

    return [base] * (count - 1) + [total - base * (count - 1)]


# ═══════════════════════════════════════════════════════════
# IT kūrimas / redagavimas / šalinimas
# ═══════════════════════════════════════════════════════════

@transaction.atomic
def create_fixed_assets_from_purchase(
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
    split_count=1,
):
    # Užrakinam pirkimą, kad dvi lygiagrečios užklausos neviršytų sumos
    purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)

    if group.company_profile_id != purchase.company_profile_id:
        raise FixedAssetError("Turto grupė priklauso kitai įmonei")

    if not group.asset_account:
        raise FixedAssetError("Turto grupei nenurodyta turto DK sąskaita")

    purchase_date = _purchase_entry_date(purchase)

    from ..opening_balances.services import is_before_cutover
    if is_before_cutover(purchase.company_profile_id, purchase_date):
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

    if purchase.is_credit_invoice:
        raise FixedAssetError("Iš kreditinės sąskaitos ilgalaikio turto sukurti negalima")

    split_count = int(split_count or 1)
    if split_count < 1 or split_count > MAX_SPLIT_COUNT:
        raise FixedAssetError(f"Kortelių skaičius turi būti nuo 1 iki {MAX_SPLIT_COUNT}")

    if purchase_line is not None and purchase_line.quantity is not None:
        line_qty = abs(_to_decimal(purchase_line.quantity))
        if line_qty >= 1 and Decimal(split_count) > line_qty:
            raise FixedAssetError(f"Kiekis negali viršyti eilutės kiekio ({line_qty.normalize()})")

    cost = _to_decimal(acquisition_cost).quantize(MONEY, rounding=ROUND_HALF_UP)
    if cost <= ZERO:
        raise FixedAssetError("Įsigijimo savikaina turi būti didesnė už 0")

    available = get_available_amount(purchase, purchase_line)
    if cost > available:
        raise FixedAssetError(f"Viršyta galima suma. Galima: {available} EUR")

    if operation_start_date and operation_start_date < purchase_date:
        raise FixedAssetError(
            f"Eksploatacijos pradžia negali būti ankstesnė už įsigijimo datą {purchase_date:%Y-%m-%d}"
        )

    amounts = _split_amount(cost, split_count)

    salvage = _to_decimal(salvage_value).quantize(MONEY, rounding=ROUND_HALF_UP)
    if salvage < ZERO or salvage >= min(amounts):
        raise FixedAssetError("Likvidacinė vertė turi būti mažesnė už kortelės savikainą")

    inventory_number = (inventory_number or "").strip()
    if split_count == 1 and inventory_number:
        if FixedAsset.objects.filter(
            company_profile_id=purchase.company_profile_id,
            inventory_number=inventory_number,
        ).exists():
            raise FixedAssetError(f"Inventorinis nr. {inventory_number} jau naudojamas")
        numbers = [inventory_number]
    else:
        numbers = next_inventory_numbers(purchase.company_profile_id, split_count)

    _, source_account = get_purchase_source(purchase, purchase_line)

    base_name = (name or "").strip()
    if not base_name:
        raise FixedAssetError("Nurodykite pavadinimą")

    status = FixedAssetStatus.ACTIVE if operation_start_date else FixedAssetStatus.DRAFT
    life = useful_life_months or group.useful_life_months

    try:
        assets = FixedAsset.objects.bulk_create([
            FixedAsset(
                company_profile=purchase.company_profile,
                group=group,
                inventory_number=numbers[i],
                name=base_name[:255] if split_count == 1 else f"{base_name[:245]} #{i + 1}",
                status=status,
                purchase_date=purchase_date,
                operation_start_date=operation_start_date,
                acquisition_cost=amounts[i],
                salvage_value=salvage,
                useful_life_months=life,
                description=description or "",
                purchase=purchase,
                purchase_line=purchase_line,
            )
            for i in range(split_count)
        ])
    except IntegrityError:
        raise FixedAssetError("Inventorinis nr. jau naudojamas - bandykite dar kartą")

    entry = None
    if source_account != group.asset_account:
        suffix = f" ({split_count} vnt.)" if split_count > 1 else ""
        entry = _create_reclass_entry(
            purchase=purchase,
            group=group,
            source_account=source_account,
            amount=cost,
            description=f"IT pripažinimas: {base_name}{suffix}"[:255],
        )

    document_number = _purchase_document_number(purchase)

    FixedAssetOperation.objects.bulk_create([
        FixedAssetOperation(
            asset=asset,
            operation_type=FixedAssetOperationType.ACQUISITION,
            operation_date=purchase_date,
            amount=amount,
            book=DepreciationBook.ACCOUNTING,
            journal_entry=entry,
            description=f"Įsigijimas iš pirkimo {document_number}".strip(),
        )
        for asset, amount in zip(assets, amounts)
    ])

    logger.info(
        "Fixed assets created from purchase=%s line=%s count=%s cost=%s reclass_je=%s",
        purchase.pk,
        getattr(purchase_line, "pk", None),
        split_count,
        cost,
        getattr(entry, "pk", None),
    )

    return assets


LOCKED_AFTER_DEPRECIATION = {"operation_start_date", "useful_life_months", "salvage_value"}


@transaction.atomic
def update_fixed_asset(asset, data):
    asset = FixedAsset.objects.select_for_update().get(pk=asset.pk)

    if asset.status in (FixedAssetStatus.SOLD, FixedAssetStatus.WRITTEN_OFF):
        raise FixedAssetError("Nurašyto ar parduoto turto keisti negalima")

    if LOCKED_AFTER_DEPRECIATION & set(data) and asset.operations.filter(
        operation_type=FixedAssetOperationType.DEPRECIATION
    ).exclude(reason=OPENING_REASON).exists():
        raise FixedAssetError(
            "Turtas jau nudėvimas - eksploatacijos pradžios, naudingo tarnavimo laiko "
            "ir likvidacinės vertės keisti negalima"
        )

    if "name" in data:
        data["name"] = (data["name"] or "").strip()
        if not data["name"]:
            raise FixedAssetError("Nurodykite pavadinimą")

    if "inventory_number" in data:
        data["inventory_number"] = (data["inventory_number"] or "").strip()
        if data["inventory_number"] and FixedAsset.objects.filter(
            company_profile_id=asset.company_profile_id,
            inventory_number=data["inventory_number"],
        ).exclude(pk=asset.pk).exists():
            raise FixedAssetError(f"Inventorinis nr. {data['inventory_number']} jau naudojamas")

    start = data.get("operation_start_date")
    if start and asset.purchase_date and start < asset.purchase_date:
        raise FixedAssetError(
            f"Eksploatacijos pradžia negali būti ankstesnė už įsigijimo datą {asset.purchase_date:%Y-%m-%d}"
        )

    if "salvage_value" in data and data["salvage_value"] >= asset.acquisition_cost:
        raise FixedAssetError("Likvidacinė vertė turi būti mažesnė už savikainą")

    for field, value in data.items():
        setattr(asset, field, value)

    asset.status = (
        FixedAssetStatus.ACTIVE
        if asset.operation_start_date
        else FixedAssetStatus.DRAFT
    )
    asset.save()

    return asset


@transaction.atomic
def delete_fixed_asset(asset):
    asset = FixedAsset.objects.select_for_update().get(pk=asset.pk)

    if asset.operations.exclude(
        operation_type=FixedAssetOperationType.ACQUISITION
    ).exclude(reason=OPENING_REASON).exists():
        raise FixedAssetError(
            "Turtas turi nusidėvėjimo ar kitų operacijų - ištrinti negalima"
        )

    acquisition = (
        asset.operations
        .filter(operation_type=FixedAssetOperationType.ACQUISITION)
        .select_related("journal_entry")
        .first()
    )
    entry = getattr(acquisition, "journal_entry", None)
    cost = acquisition.amount if acquisition else ZERO

    shared = bool(
        entry
        and FixedAssetOperation.objects
        .filter(journal_entry=entry)
        .exclude(asset_id=asset.pk)
        .exists()
    )

    asset.delete()

    if entry is None:
        return

    if not shared:
        entry.delete()
        return

    # Bendras reklasifikacijos DK kelioms kortelėms: mažinam sumą
    JournalEntryLine.objects.filter(entry=entry).update(amount=F("amount") - cost)
    JournalEntryLine.objects.filter(entry=entry, amount__lte=0).delete()
    finalize_journal_entry(entry)

# ═══════════════════════════════════════════════════════════
# Pirkimo apsauga
# ═══════════════════════════════════════════════════════════

def _purchase_links(purchase):
    """(pavadinimas, eilutė, reklasifikacijos DK, turto sąskaita) visiems ryšiams su pirkimu."""
    links = []

    assets = FixedAsset.objects.filter(purchase=purchase).select_related("group", "purchase_line")
    for asset in assets:
        acquisition = (
            asset.operations
            .filter(operation_type=FixedAssetOperationType.ACQUISITION)
            .select_related("journal_entry")
            .first()
        )
        links.append((
            asset.name,
            asset.purchase_line,
            getattr(acquisition, "journal_entry", None),
            getattr(asset.group, "asset_account", ""),
        ))

    improvements = (
        FixedAssetOperation.objects
        .filter(operation_type=FixedAssetOperationType.IMPROVEMENT, purchase=purchase)
        .select_related("asset", "asset__group", "purchase_line", "journal_entry")
    )
    for op in improvements:
        links.append((
            f"{op.asset.name} (pagerinimas)",
            op.purchase_line,
            op.journal_entry,
            getattr(op.asset.group, "asset_account", ""),
        ))

    return links


def validate_purchase_fixed_assets(purchase):
    """
    Tikrina, ar pirkimas vis dar atitinka iš jo sukurtą IT ir pagerinimus.
    Kviečiama prieš perkuriant / šalinant pirkimo DK įrašą.
    """
    links = _purchase_links(purchase)
    if not links:
        return

    from ..utils.journal_generators import can_post_to_dk

    if not can_post_to_dk(purchase):
        raise FixedAssetError(
            "Iš šio pirkimo sukurtas ilgalaikis turtas - "
            "pirkimo negalima anuliuoti ar išregistruoti iš DK"
        )

    entry_date = _purchase_entry_date(purchase)
    checked_lines = set()

    for name, line, entry, asset_account in links:
        try:
            _, source_account = get_purchase_source(purchase, line)
        except FixedAssetError:
            raise FixedAssetError(
                f"Pirkimo struktūra pakeista - ji nebeatitinka ilgalaikio turto „{name}“"
            )

        line_key = getattr(line, "pk", None)
        if line_key not in checked_lines:
            checked_lines.add(line_key)

            if get_available_amount(purchase, line) < ZERO:
                raise FixedAssetError(
                    f"Pirkimo suma tapo mažesnė už ilgalaikio turto „{name}“ savikainą"
                )

        if entry is None:
            if source_account != asset_account:
                raise FixedAssetError(
                    f"Pakeista pirkimo DK sąskaita - ji nebeatitinka ilgalaikio turto „{name}“"
                )
            continue

        credited = set(
            entry.lines
            .filter(side="K")
            .values_list("account_code", flat=True)
        )

        if source_account not in credited:
            raise FixedAssetError(
                f"Pakeista pirkimo DK sąskaita - ji nebeatitinka ilgalaikio turto „{name}“"
            )

        if entry.entry_date != entry_date:
            raise FixedAssetError(
                f"Pakeista pirkimo data - ji nebeatitinka ilgalaikio turto „{name}“"
            )



# ═══════════════════════════════════════════════════════════
# Rankinis kūrimas
# ═══════════════════════════════════════════════════════════

def _get_cutover_date(company_profile_id):
    from ..models import OpeningBalanceBatch

    batch = (
        OpeningBalanceBatch.objects
        .filter(company_profile_id=company_profile_id)
        .only("cutover_date")
        .first()
    )
    return getattr(batch, "cutover_date", None)


@transaction.atomic
def create_manual_fixed_asset(
    *,
    company_profile,
    user,
    source,
    group,
    name,
    acquisition_cost,
    purchase_date,
    operation_start_date=None,
    useful_life_months=None,
    salvage_value=ZERO,
    accumulated_depreciation=ZERO,
    credit_account="",
    inventory_number="",
    description="",
):
    from .depreciation import add_months, depreciation_start_period, month_start

    if group.company_profile_id != company_profile.pk:
        raise FixedAssetError("Turto grupė priklauso kitai įmonei")

    if not group.asset_account:
        raise FixedAssetError("Turto grupei nenurodyta turto DK sąskaita")

    name = (name or "").strip()
    if not name:
        raise FixedAssetError("Nurodykite pavadinimą")

    cost = _to_decimal(acquisition_cost).quantize(MONEY, rounding=ROUND_HALF_UP)
    if cost <= ZERO:
        raise FixedAssetError("Įsigijimo savikaina turi būti didesnė už 0")

    salvage = _to_decimal(salvage_value).quantize(MONEY, rounding=ROUND_HALF_UP)
    if salvage < ZERO or salvage >= cost:
        raise FixedAssetError("Likvidacinė vertė turi būti mažesnė už savikainą")

    life = useful_life_months or group.useful_life_months
    if not life:
        raise FixedAssetError("Nurodykite naudingo tarnavimo laiką")

    if operation_start_date and operation_start_date < purchase_date:
        raise FixedAssetError("Eksploatacijos pradžia negali būti ankstesnė už įsigijimo datą")

    accumulated = _to_decimal(accumulated_depreciation).quantize(MONEY, rounding=ROUND_HALF_UP)
    cutover = _get_cutover_date(company_profile.pk)
    opening_period = None

    if source == ManualAssetSource.OPENING:
        if not cutover:
            raise FixedAssetError("Pirmiausia Pradiniuose likučiuose nurodykite perėjimo datą")

        if purchase_date >= cutover:
            raise FixedAssetError(
                f"Įsigijimo data turi būti ankstesnė už perėjimo datą {cutover:%Y-%m-%d}"
            )

        if accumulated < ZERO or accumulated > cost - salvage:
            raise FixedAssetError("Sukauptas nusidėvėjimas negali viršyti nudėvimos vertės")

        if accumulated > ZERO:
            if not operation_start_date:
                raise FixedAssetError("Nurodykite eksploatacijos pradžią")

            opening_period = add_months(month_start(cutover), -1)
            start = depreciation_start_period(FixedAsset(operation_start_date=operation_start_date))

            if start > opening_period:
                raise FixedAssetError(
                    f"Nusidėvėjimas prasideda {start:%Y-%m} - iki perėjimo datos jo sukaupti negalėjo"
                )

    elif source == ManualAssetSource.OTHER:
        if cutover and purchase_date < cutover:
            raise FixedAssetError("Turtą, įsigytą iki perėjimo datos, įveskite kaip pradinius likučius")

        accumulated = ZERO
        credit_account = (credit_account or "").strip()

        if not is_valid_account(credit_account):
            raise FixedAssetError("Nurodykite teisingą kredito sąskaitą")

        if credit_account == group.asset_account:
            raise FixedAssetError("Kredito sąskaita negali sutapti su turto sąskaita")

        if credit_account.startswith(CONTROL_ACCOUNT_PREFIXES):
            raise FixedAssetError(
                "Skolai tiekėjui ar avansui naudokite pirkimo sąskaitą - turtą kurkite iš Pirkimų"
            )

    else:
        raise FixedAssetError("Neteisingas šaltinis")

    inventory_number = (inventory_number or "").strip()
    if inventory_number:
        if FixedAsset.objects.filter(
            company_profile=company_profile,
            inventory_number=inventory_number,
        ).exists():
            raise FixedAssetError(f"Inventorinis nr. {inventory_number} jau naudojamas")
    else:
        inventory_number = next_inventory_numbers(company_profile.pk)[0]

    try:
        asset = FixedAsset.objects.create(
            company_profile=company_profile,
            group=group,
            inventory_number=inventory_number,
            name=name[:255],
            status=FixedAssetStatus.ACTIVE if operation_start_date else FixedAssetStatus.DRAFT,
            purchase_date=purchase_date,
            operation_start_date=operation_start_date,
            acquisition_cost=cost,
            salvage_value=salvage,
            useful_life_months=life,
            description=description or "",
        )
    except IntegrityError:
        raise FixedAssetError("Inventorinis nr. jau naudojamas - bandykite dar kartą")

    entry = None
    is_opening = source == ManualAssetSource.OPENING

    if not is_opening:
        je_description = f"IT pripažinimas: {name}"[:255]

        entry = JournalEntry.objects.create(
            user=user,
            company_profile=company_profile,
            source_type=JournalEntry.SOURCE_FIXED_ASSET,
            entry_date=purchase_date,
            period=_period_from_date(purchase_date),
            document_number=inventory_number,
            description=je_description,
            currency="EUR",
            status=JournalEntry.STATUS_DRAFT,
        )

        lines = []
        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=group.asset_account,
            amount=cost,
            description=je_description,
            sort_order=0,
        )
        _add_line(
            lines,
            entry=entry,
            side="K",
            account_code=credit_account,
            amount=cost,
            description=je_description,
            sort_order=sort_order,
        )

        JournalEntryLine.objects.bulk_create(lines)
        finalize_journal_entry(entry)

    FixedAssetOperation.objects.create(
        asset=asset,
        operation_type=FixedAssetOperationType.ACQUISITION,
        operation_date=purchase_date,
        amount=cost,
        book=DepreciationBook.ACCOUNTING,
        journal_entry=entry,
        reason=OPENING_REASON if is_opening else "",
        description="Pradiniai likučiai" if is_opening else "Rankinis įvedimas",
    )

    if opening_period and accumulated > ZERO:
        FixedAssetOperation.objects.create(
            asset=asset,
            operation_type=FixedAssetOperationType.DEPRECIATION,
            operation_date=cutover - timedelta(days=1),
            amount=accumulated,
            book=DepreciationBook.ACCOUNTING,
            period=opening_period,
            reason=OPENING_REASON,
            description=f"Sukauptas nusidėvėjimas iki {cutover:%Y-%m-%d}",
        )

    logger.info(
        "Manual fixed asset %s created source=%s cost=%s accumulated=%s je=%s",
        asset.pk,
        source,
        cost,
        accumulated,
        getattr(entry, "pk", None),
    )

    return asset


# ═══════════════════════════════════════════════════════════
# Pagerinimas
# ═══════════════════════════════════════════════════════════

@transaction.atomic
def improve_fixed_asset(*, asset, purchase, purchase_line=None, amount, extra_months=0):
    purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
    asset = FixedAsset.objects.select_for_update().select_related("group").get(pk=asset.pk)

    if asset.company_profile_id != purchase.company_profile_id:
        raise FixedAssetError("Turtas priklauso kitai įmonei")

    if asset.status not in (FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT):
        raise FixedAssetError("Pagerinti galima tik naudojamą turtą")

    group = asset.group
    if not group or not group.asset_account:
        raise FixedAssetError("Turto grupei nenurodyta turto DK sąskaita")

    if purchase.is_credit_invoice:
        raise FixedAssetError("Kreditinė sąskaita negali būti pagerinimo šaltinis")

    purchase_date = _purchase_entry_date(purchase)

    from ..opening_balances.services import is_before_cutover
    if is_before_cutover(purchase.company_profile_id, purchase_date):
        raise FixedAssetError("Pirkimas yra iki perėjimo datos")

    if not JournalEntry.objects.filter(
        purchase=purchase,
        source_type=JournalEntry.SOURCE_PURCHASE,
        status=JournalEntry.STATUS_POSTED,
    ).exists():
        raise FixedAssetError("Pirkimas dar neužregistruotas DK")

    if asset.purchase_date and purchase_date < asset.purchase_date:
        raise FixedAssetError("Pagerinimo data negali būti ankstesnė už turto įsigijimą")

    cost = _to_decimal(amount).quantize(MONEY, rounding=ROUND_HALF_UP)
    if cost <= ZERO:
        raise FixedAssetError("Pagerinimo suma turi būti didesnė už 0")

    available = get_available_amount(purchase, purchase_line)
    if cost > available:
        raise FixedAssetError(f"Viršyta galima suma. Galima: {available} EUR")

    extra_months = int(extra_months or 0)
    if extra_months < 0:
        raise FixedAssetError("Neteisingas pailginimas")

    if extra_months and not asset.useful_life_months:
        raise FixedAssetError("Turtui nenurodytas naudingo tarnavimo laikas")

    _, source_account = get_purchase_source(purchase, purchase_line)

    entry = None
    if source_account != group.asset_account:
        entry = _create_reclass_entry(
            purchase=purchase,
            group=group,
            source_account=source_account,
            amount=cost,
            description=f"IT pagerinimas: {asset.name}"[:255],
        )

    op = FixedAssetOperation.objects.create(
        asset=asset,
        operation_type=FixedAssetOperationType.IMPROVEMENT,
        operation_date=purchase_date,
        amount=cost,
        book=DepreciationBook.ACCOUNTING,
        journal_entry=entry,
        purchase=purchase,
        purchase_line=purchase_line,
        extra_months=extra_months,
        description=f"Pagerinimas pagal pirkimą {_purchase_document_number(purchase)}".strip(),
    )

    if extra_months:
        FixedAsset.objects.filter(pk=asset.pk).update(
            useful_life_months=F("useful_life_months") + extra_months
        )

    logger.info(
        "Fixed asset %s improved purchase=%s line=%s amount=%s extra_months=%s je=%s",
        asset.pk,
        purchase.pk,
        getattr(purchase_line, "pk", None),
        cost,
        extra_months,
        getattr(entry, "pk", None),
    )

    return op


@transaction.atomic
def cancel_improvement(op):
    op = (
        FixedAssetOperation.objects
        .select_for_update()
        .select_related("asset")
        .get(pk=op.pk)
    )

    if op.operation_type != FixedAssetOperationType.IMPROVEMENT:
        raise FixedAssetError("Tai ne pagerinimo operacija")

    asset = op.asset

    if asset.status not in (FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT):
        raise FixedAssetError("Nurašyto ar parduoto turto pagerinimo atšaukti negalima")

    if asset.operations.filter(
        operation_type=FixedAssetOperationType.DEPRECIATION,
        created_at__gt=op.created_at,
    ).exclude(reason=OPENING_REASON).exists():
        raise FixedAssetError(
            "Po pagerinimo jau užregistruotas nusidėvėjimas - pirmiausia jį atšaukite"
        )

    entry_id = op.journal_entry_id
    extra_months = op.extra_months

    op.delete()

    if entry_id:
        JournalEntry.objects.filter(
            pk=entry_id,
            source_type=JournalEntry.SOURCE_FIXED_ASSET,
        ).delete()

    if extra_months:
        FixedAsset.objects.filter(pk=asset.pk).update(
            useful_life_months=F("useful_life_months") - extra_months
        )


# ═══════════════════════════════════════════════════════════
# Turto grupių nustatymai
# ═══════════════════════════════════════════════════════════

GROUP_ACCOUNT_RULES = {
    "asset_account": ("1", "Turto sąskaita turi būti 1 klasės"),
    "accumulated_depreciation_account": ("1", "Sukaupto nusidėvėjimo sąskaita turi būti 1 klasės"),
    "depreciation_expense_account": ("6", "Nusidėvėjimo sąnaudų sąskaita turi būti 6 klasės"),
}


@transaction.atomic
def update_fixed_asset_group(group, data):
    group = FixedAssetGroup.objects.select_for_update().get(pk=group.pk)

    for field, (prefix, message) in GROUP_ACCOUNT_RULES.items():
        if field not in data:
            continue

        code = (data[field] or "").strip()
        data[field] = code

        if not code:
            continue

        if not is_valid_account(code):
            raise FixedAssetError(f"Sąskaitos {code} nėra sąskaitų plane")

        if not code.startswith(prefix):
            raise FixedAssetError(message)

    in_use = group.assets.filter(
        status__in=[FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT]
    ).exists()

    for field in ("asset_account", "accumulated_depreciation_account"):
        if field in data and data[field] != getattr(group, field) and in_use:
            raise FixedAssetError(
                "Grupėje yra naudojamo turto - turto ir sukaupto nusidėvėjimo sąskaitų keisti negalima"
            )

    for field, value in data.items():
        setattr(group, field, value)

    group.save()
    return group