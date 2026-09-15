import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from ..models import (
    FixedAsset,
    FixedAssetOperation,
    Invoice,
    InvoiceLineItem,
    JournalEntry,
    JournalEntryLine,
)
from ..utils.journal_generators import (
    JE_AMOUNT_QUANT,
    _add_line,
    _period_from_date,
    _to_decimal,
    _to_eur_amount,
    finalize_journal_entry,
)
from .constants import (
    SALE_GAIN_ACCOUNT,
    SALE_LOSS_ACCOUNT,
    WRITE_OFF_LOSS_ACCOUNT,
    DepreciationBook,
    FixedAssetOperationType,
    FixedAssetStatus,
    WriteOffReason,
)
from .depreciation import (
    _annotate_balances,
    _period_amount,
    add_months,
    depreciation_start_period,
    month_start,
)
from .services import FixedAssetError

logger = logging.getLogger("docscanner_app")

ZERO = Decimal("0.00")


def _check_depreciation_before_disposal(asset, disposal_date):
    """
    Nusidėvėjimas turi būti užregistruotas iki mėnesio prieš nurašymą.
    Nurašymo mėnesį nusidėvėjimas neskaičiuojamas.
    """
    disposal_month = month_start(disposal_date)
    start = depreciation_start_period(asset)

    if start is None or not asset.useful_life_months:
        return

    if asset.last_period and asset.last_period >= disposal_month:
        raise FixedAssetError(
            f"Nusidėvėjimas užregistruotas už {asset.last_period:%Y-%m} - "
            f"pirmiausia atšaukite nusidėvėjimą nuo {disposal_month:%Y-%m}"
        )

    expected = add_months(asset.last_period, 1) if asset.last_period else start

    if (
        expected < disposal_month
        and _period_amount(asset, expected, asset.base_cost, asset.accumulated) > ZERO
    ):
        raise FixedAssetError(
            f"Pirmiausia užregistruokite {expected:%Y-%m} nusidėvėjimą"
        )


@transaction.atomic
def write_off_asset(asset, *, disposal_date, reason, comment="", user):
    # Užraktas atskirai: FOR UPDATE negalima su GROUP BY
    FixedAsset.objects.select_for_update().filter(pk=asset.pk).first()

    asset = (
        _annotate_balances(FixedAsset.objects.filter(pk=asset.pk))
        .select_related("group", "company_profile")
        .get()
    )

    if asset.status not in (FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT):
        raise FixedAssetError("Turtas jau nurašytas arba parduotas")

    if reason not in WriteOffReason.values:
        raise FixedAssetError("Neteisinga nurašymo priežastis")

    min_date = asset.operation_start_date or asset.purchase_date
    if min_date and disposal_date < min_date:
        raise FixedAssetError(
            f"Nurašymo data negali būti ankstesnė už {min_date:%Y-%m-%d}"
        )

    from ..opening_balances.services import is_before_cutover
    if is_before_cutover(asset.company_profile_id, disposal_date):
        raise FixedAssetError("Nurašymo data yra iki perėjimo datos")

    group = asset.group
    if not group or not group.asset_account:
        raise FixedAssetError("Turto grupei nenurodyta turto DK sąskaita")

    if asset.accumulated > ZERO and not group.accumulated_depreciation_account:
        raise FixedAssetError("Turto grupei nenurodyta sukaupto nusidėvėjimo DK sąskaita")

    if asset.base_cost <= ZERO:
        raise FixedAssetError("Turtas neturi įsigijimo savikainos")

    _check_depreciation_before_disposal(asset, disposal_date)

    residual = asset.base_cost - asset.accumulated
    reason_label = WriteOffReason(reason).label
    description = f"Nurašymas: {asset.name}"[:255]

    entry = JournalEntry.objects.create(
        user=user,
        company_profile=asset.company_profile,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
        entry_date=disposal_date,
        period=_period_from_date(disposal_date),
        document_number=f"NUR-{asset.inventory_number or asset.pk}",
        description=description,
        currency="EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    lines = []
    sort_order = _add_line(
        lines,
        entry=entry,
        side="D",
        account_code=group.accumulated_depreciation_account,
        amount=asset.accumulated,
        description=description,
        sort_order=0,
    )
    sort_order = _add_line(
        lines,
        entry=entry,
        side="D",
        account_code=WRITE_OFF_LOSS_ACCOUNT,
        amount=residual,
        description=description,
        sort_order=sort_order,
    )
    _add_line(
        lines,
        entry=entry,
        side="K",
        account_code=group.asset_account,
        amount=asset.base_cost,
        description=description,
        sort_order=sort_order,
    )

    JournalEntryLine.objects.bulk_create(lines)
    finalize_journal_entry(entry)

    op = FixedAssetOperation.objects.create(
        asset_id=asset.pk,
        operation_type=FixedAssetOperationType.WRITE_OFF,
        operation_date=disposal_date,
        amount=residual,
        book=DepreciationBook.ACCOUNTING,
        reason=reason,
        journal_entry=entry,
        description=f"{reason_label}: {comment}" if comment else reason_label,
    )

    FixedAsset.objects.filter(pk=asset.pk).update(
        status=FixedAssetStatus.WRITTEN_OFF,
        disposal_date=disposal_date,
    )

    logger.info(
        "Fixed asset %s written off date=%s residual=%s je=%s",
        asset.pk,
        disposal_date,
        residual,
        entry.pk,
    )

    return op


@transaction.atomic
def cancel_write_off(asset):
    asset = FixedAsset.objects.select_for_update().get(pk=asset.pk)

    if asset.status != FixedAssetStatus.WRITTEN_OFF:
        raise FixedAssetError("Turtas nenurašytas")

    ops = asset.operations.filter(operation_type=FixedAssetOperationType.WRITE_OFF)
    entry_ids = list(
        ops.filter(journal_entry__isnull=False)
        .values_list("journal_entry_id", flat=True)
    )

    ops.delete()
    JournalEntry.objects.filter(
        pk__in=entry_ids,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
    ).delete()

    asset.status = (
        FixedAssetStatus.ACTIVE
        if asset.operation_start_date
        else FixedAssetStatus.DRAFT
    )
    asset.disposal_date = None
    asset.save(update_fields=["status", "disposal_date", "updated_at"])

    return asset


# ═══════════════════════════════════════════════════════════
# Pardavimas
# ═══════════════════════════════════════════════════════════

def _invoice_entry_date(invoice):
    # Ta pati logika kaip generate_invoice_journal_entry
    return (
        invoice.operation_date
        or invoice.invoice_date
        or invoice.created_at.date()
    )


def get_invoice_sale_amount(invoice, invoice_line=None):
    """
    Pardavimo suma EUR be PVM.
    Detaliai: eilutės dalis po dokumento nuolaidos. Sumiškai: visa suma.
    """
    currency = (invoice.currency or "EUR").upper()

    if currency == "EUR":
        rate = Decimal("1")
    else:
        from ..services.accounting_transfer import rate_to_eur
        rate = rate_to_eur(currency, _invoice_entry_date(invoice))

    amount_wo_vat = abs(_to_decimal(invoice.amount_wo_vat))

    if invoice_line is None:
        if invoice.line_items.exists():
            raise FixedAssetError("Detaliai sąskaitoje pasirinkite eilutę")
        share = amount_wo_vat
    else:
        lines_total = sum(
            (abs(_to_decimal(il.subtotal)) for il in invoice.line_items.all()),
            ZERO,
        )
        share = (
            amount_wo_vat * abs(_to_decimal(invoice_line.subtotal)) / lines_total
            if lines_total
            else ZERO
        )

    return _to_decimal(_to_eur_amount(share, rate)).quantize(
        JE_AMOUNT_QUANT,
        rounding=ROUND_HALF_UP,
    )


def _set_invoice_income_account(invoice, invoice_line):
    from ..utils.journal_generators import sync_invoice_journal_entry

    if invoice_line is not None:
        InvoiceLineItem.objects.filter(pk=invoice_line.pk).update(
            kredito_saskaita=SALE_GAIN_ACCOUNT
        )
    else:
        Invoice.objects.filter(pk=invoice.pk).update(
            kredito_saskaita=SALE_GAIN_ACCOUNT
        )

    invoice.refresh_from_db()
    sync_invoice_journal_entry(invoice)


@transaction.atomic
def sell_asset(asset, *, invoice, invoice_line=None, user):
    from ..utils.journal_generators import can_post_to_dk

    FixedAsset.objects.select_for_update().filter(pk=asset.pk).first()
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)

    asset = (
        _annotate_balances(FixedAsset.objects.filter(pk=asset.pk))
        .select_related("group", "company_profile")
        .get()
    )

    if asset.status not in (FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT):
        raise FixedAssetError("Turtas jau nurašytas arba parduotas")

    if invoice.company_profile_id != asset.company_profile_id:
        raise FixedAssetError("Sąskaita priklauso kitai įmonei")

    if invoice.invoice_type in ("kreditine", "isankstine"):
        raise FixedAssetError("Turtą galima parduoti tik per PVM sąskaitą faktūrą")

    if not can_post_to_dk(invoice):
        raise FixedAssetError("Sąskaita neišrašyta arba yra iki perėjimo datos")

    if invoice_line is not None:
        if not invoice.line_items.filter(pk=invoice_line.pk).exists():
            raise FixedAssetError("Eilutė nepriklauso šiai sąskaitai")
        if FixedAsset.objects.filter(sale_invoice_line=invoice_line).exists():
            raise FixedAssetError("Pagal šią eilutę jau parduotas kitas turtas")
    elif FixedAsset.objects.filter(
        sale_invoice=invoice,
        sale_invoice_line__isnull=True,
    ).exists():
        raise FixedAssetError("Pagal šią sąskaitą jau parduotas kitas turtas")

    disposal_date = _invoice_entry_date(invoice)

    min_date = asset.operation_start_date or asset.purchase_date
    if min_date and disposal_date < min_date:
        raise FixedAssetError(
            f"Pardavimo data negali būti ankstesnė už {min_date:%Y-%m-%d}"
        )

    group = asset.group
    if not group or not group.asset_account:
        raise FixedAssetError("Turto grupei nenurodyta turto DK sąskaita")

    if asset.accumulated > ZERO and not group.accumulated_depreciation_account:
        raise FixedAssetError("Turto grupei nenurodyta sukaupto nusidėvėjimo DK sąskaita")

    if asset.base_cost <= ZERO:
        raise FixedAssetError("Turtas neturi įsigijimo savikainos")

    _check_depreciation_before_disposal(asset, disposal_date)

    # 1. Eilutė -> 5400 ir perkuriamas pardavimo DK (dar be turto ryšio)
    _set_invoice_income_account(invoice, invoice_line)

    if invoice_line is not None:
        invoice_line = InvoiceLineItem.objects.get(pk=invoice_line.pk)

    sale_amount = get_invoice_sale_amount(invoice, invoice_line)
    residual = asset.base_cost - asset.accumulated

    # 2. Uždarymo DK
    description = f"IT pardavimas: {asset.name}"[:255]

    entry = JournalEntry.objects.create(
        user=user,
        company_profile=asset.company_profile,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
        entry_date=disposal_date,
        period=_period_from_date(disposal_date),
        document_number=invoice.full_number,
        counterparty_name=invoice.buyer_name or "",
        counterparty_code=invoice.buyer_id or "",
        description=description,
        currency="EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    lines = []
    sort_order = _add_line(
        lines,
        entry=entry,
        side="D",
        account_code=group.accumulated_depreciation_account,
        amount=asset.accumulated,
        description=description,
        sort_order=0,
    )

    if sale_amount >= residual:
        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=SALE_GAIN_ACCOUNT,
            amount=residual,
            description=description,
            sort_order=sort_order,
        )
    else:
        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=SALE_GAIN_ACCOUNT,
            amount=sale_amount,
            description=description,
            sort_order=sort_order,
        )
        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=SALE_LOSS_ACCOUNT,
            amount=residual - sale_amount,
            description=description,
            sort_order=sort_order,
        )

    _add_line(
        lines,
        entry=entry,
        side="K",
        account_code=group.asset_account,
        amount=asset.base_cost,
        description=description,
        sort_order=sort_order,
    )

    JournalEntryLine.objects.bulk_create(lines)
    finalize_journal_entry(entry)

    op = FixedAssetOperation.objects.create(
        asset_id=asset.pk,
        operation_type=FixedAssetOperationType.SALE,
        operation_date=disposal_date,
        amount=sale_amount,
        book=DepreciationBook.ACCOUNTING,
        journal_entry=entry,
        description=f"Pardavimas pagal {invoice.full_number}",
    )

    # 3. Ryšys su sąskaita
    FixedAsset.objects.filter(pk=asset.pk).update(
        status=FixedAssetStatus.SOLD,
        disposal_date=disposal_date,
        sale_invoice=invoice,
        sale_invoice_line=invoice_line,
    )

    logger.info(
        "Fixed asset %s sold invoice=%s line=%s sale=%s residual=%s je=%s",
        asset.pk,
        invoice.pk,
        getattr(invoice_line, "pk", None),
        sale_amount,
        residual,
        entry.pk,
    )

    return op


@transaction.atomic
def cancel_sale(asset):
    asset = FixedAsset.objects.select_for_update().get(pk=asset.pk)

    if asset.status != FixedAssetStatus.SOLD:
        raise FixedAssetError("Turtas neparduotas")

    ops = asset.operations.filter(operation_type=FixedAssetOperationType.SALE)
    entry_ids = list(
        ops.filter(journal_entry__isnull=False)
        .values_list("journal_entry_id", flat=True)
    )

    ops.delete()
    JournalEntry.objects.filter(
        pk__in=entry_ids,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
    ).delete()

    asset.status = (
        FixedAssetStatus.ACTIVE
        if asset.operation_start_date
        else FixedAssetStatus.DRAFT
    )
    asset.disposal_date = None
    asset.sale_invoice = None
    asset.sale_invoice_line = None
    asset.save(update_fields=[
        "status",
        "disposal_date",
        "sale_invoice",
        "sale_invoice_line",
        "updated_at",
    ])

    return asset


def validate_invoice_fixed_assets(invoice):
    """Kviečiama iš sync_invoice_journal_entry."""
    assets = list(
        FixedAsset.objects
        .filter(sale_invoice=invoice)
        .select_related("sale_invoice_line")
    )

    if not assets:
        return

    from ..utils.journal_generators import can_post_to_dk

    if not can_post_to_dk(invoice):
        raise FixedAssetError(
            "Pagal šią sąskaitą parduotas ilgalaikis turtas - "
            "sąskaitos negalima anuliuoti ar išregistruoti iš DK"
        )

    entry_date = _invoice_entry_date(invoice)

    for asset in assets:
        line = asset.sale_invoice_line

        if line is None:
            account = invoice.kredito_saskaita
        else:
            account = (
                InvoiceLineItem.objects
                .filter(pk=line.pk)
                .values_list("kredito_saskaita", flat=True)
                .first()
            )

        if str(account or "").strip() != SALE_GAIN_ACCOUNT:
            raise FixedAssetError(
                f"Parduoto turto „{asset.name}“ eilutės sąskaita turi būti {SALE_GAIN_ACCOUNT}"
            )

        try:
            sale_amount = get_invoice_sale_amount(invoice, line)
        except FixedAssetError:
            raise FixedAssetError(
                f"Sąskaitos struktūra pakeista - ji nebeatitinka parduoto turto „{asset.name}“"
            )

        op = (
            asset.operations
            .filter(operation_type=FixedAssetOperationType.SALE)
            .select_related("journal_entry")
            .first()
        )

        if op is None:
            continue

        if op.amount != sale_amount:
            raise FixedAssetError(
                f"Pakeista sąskaitos suma - ji nebeatitinka parduoto turto „{asset.name}“"
            )

        if op.journal_entry and op.journal_entry.entry_date != entry_date:
            raise FixedAssetError(
                f"Pakeista sąskaitos data - ji nebeatitinka parduoto turto „{asset.name}“"
            )