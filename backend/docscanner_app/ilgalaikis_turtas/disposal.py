import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Q

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
    add_months,
    first_allowed_period,
    month_start,
    pending_depreciation,
)
from .services import FixedAssetError

logger = logging.getLogger("docscanner_app")

ZERO = Decimal("0.00")
DEP = FixedAssetOperationType.DEPRECIATION
ACC = DepreciationBook.ACCOUNTING


# ═══════════════════════════════════════════════════════════
# Bendra
# ═══════════════════════════════════════════════════════════

def _load_asset(pk):
    return (
        _annotate_balances(FixedAsset.objects.filter(pk=pk))
        .select_related("group", "company_profile")
        .get()
    )


def _disposal_catch_up(asset, disposal_date):
    """
    Neužregistruotas nusidėvėjimas iki perleidimo mėnesio imtinai.
    Baigiamas skaičiuoti nuo kito mėnesio po perleidimo pirmos dienos.
    Grąžina [(period, amount), ...].
    """
    disposal_month = month_start(disposal_date)

    if asset.last_period and asset.last_period > disposal_month:
        raise FixedAssetError(
            f"Nusidėvėjimas užregistruotas už {asset.last_period:%Y-%m} - "
            f"pirmiausia atšaukite nusidėvėjimą nuo {add_months(disposal_month, 1):%Y-%m}"
        )

    return pending_depreciation(
        asset,
        disposal_month,
        first_allowed_period(asset.company_profile_id),
    )


def _validate_disposal(asset, disposal_date, catch_up_total):
    min_date = asset.operation_start_date or asset.purchase_date
    if min_date and disposal_date < min_date:
        raise FixedAssetError(
            f"Perleidimo data negali būti ankstesnė už {min_date:%Y-%m-%d}"
        )

    group = asset.group
    if not group or not group.asset_account:
        raise FixedAssetError("Turto grupei nenurodyta turto DK sąskaita")

    if asset.accumulated + catch_up_total > ZERO and not group.accumulated_depreciation_account:
        raise FixedAssetError("Turto grupei nenurodyta sukaupto nusidėvėjimo DK sąskaita")

    if catch_up_total > ZERO and not group.depreciation_expense_account:
        raise FixedAssetError("Turto grupei nenurodyta nusidėvėjimo sąnaudų DK sąskaita")

    if asset.base_cost <= ZERO:
        raise FixedAssetError("Turtas neturi įsigijimo savikainos")

    return group


def _create_disposal_entry(
    *,
    asset,
    user,
    entry_date,
    document_number,
    description,
    catch_up_total,
    close_lines,
    counterparty_name="",
    counterparty_code="",
):
    entry = JournalEntry.objects.create(
        user=user,
        company_profile=asset.company_profile,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
        entry_date=entry_date,
        period=_period_from_date(entry_date),
        document_number=document_number,
        counterparty_name=counterparty_name,
        counterparty_code=counterparty_code,
        description=description,
        currency="EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    group = asset.group
    lines = []
    sort_order = 0

    # Priskaičiuotas nusidėvėjimas iškart uždaromas, todėl 1247 jo nerodom:
    # D sąnaudos, o likęs K turto sąskaita padengiama uždarymo eilutėse
    if catch_up_total > ZERO:
        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=group.depreciation_expense_account,
            amount=catch_up_total,
            description=f"Nusidėvėjimas iki perleidimo: {asset.name}"[:255],
            sort_order=sort_order,
        )

    for side, code, amount in close_lines:
        if amount <= ZERO:
            continue
        sort_order = _add_line(
            lines,
            entry=entry,
            side=side,
            account_code=code,
            amount=amount,
            description=description,
            sort_order=sort_order,
        )

    JournalEntryLine.objects.bulk_create(lines)
    finalize_journal_entry(entry)

    return entry


def _create_catch_up_ops(asset, catch_up, entry, disposal_date):
    if not catch_up:
        return

    FixedAssetOperation.objects.bulk_create([
        FixedAssetOperation(
            asset_id=asset.pk,
            operation_type=DEP,
            operation_date=disposal_date,
            amount=amount,
            book=ACC,
            period=period,
            journal_entry=entry,
            description=f"Nusidėvėjimas už {period:%Y-%m} (perleidimo DK)",
        )
        for period, amount in catch_up
    ])


def _delete_disposal_operations(asset_id, operation_type):
    """Perleidimo operacija + tame pačiame DK priskaičiuotas nusidėvėjimas."""
    entry_ids = list(
        FixedAssetOperation.objects
        .filter(
            asset_id=asset_id,
            operation_type=operation_type,
            journal_entry__isnull=False,
        )
        .values_list("journal_entry_id", flat=True)
    )

    FixedAssetOperation.objects.filter(
        Q(asset_id=asset_id, operation_type=operation_type)
        | Q(asset_id=asset_id, journal_entry_id__in=entry_ids)
    ).delete()

    JournalEntry.objects.filter(
        pk__in=entry_ids,
        source_type=JournalEntry.SOURCE_FIXED_ASSET,
    ).delete()


def _restore_status(asset):
    return (
        FixedAssetStatus.ACTIVE
        if asset.operation_start_date
        else FixedAssetStatus.DRAFT
    )


# ═══════════════════════════════════════════════════════════
# Nurašymas
# ═══════════════════════════════════════════════════════════

@transaction.atomic
def write_off_asset(asset, *, disposal_date, reason, comment="", user):
    # Užraktas atskirai: FOR UPDATE negalima su GROUP BY
    FixedAsset.objects.select_for_update().filter(pk=asset.pk).first()
    asset = _load_asset(asset.pk)

    if asset.status not in (FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT):
        raise FixedAssetError("Turtas jau nurašytas arba parduotas")

    if reason not in WriteOffReason.values:
        raise FixedAssetError("Neteisinga nurašymo priežastis")

    from ..opening_balances.services import is_before_cutover
    if is_before_cutover(asset.company_profile_id, disposal_date):
        raise FixedAssetError("Nurašymo data yra iki perėjimo datos")

    catch_up = _disposal_catch_up(asset, disposal_date)
    catch_up_total = sum((a for _, a in catch_up), ZERO)
    group = _validate_disposal(asset, disposal_date, catch_up_total)

    accumulated = asset.accumulated + catch_up_total
    residual = asset.base_cost - accumulated
    reason_label = WriteOffReason(reason).label
    description = f"Nurašymas: {asset.name}"[:255]

    entry = _create_disposal_entry(
        asset=asset,
        user=user,
        entry_date=disposal_date,
        document_number=f"NUR-{asset.inventory_number or asset.pk}",
        description=description,
        catch_up_total=catch_up_total,
        close_lines=[
            ("D", group.accumulated_depreciation_account, asset.accumulated),
            ("D", WRITE_OFF_LOSS_ACCOUNT, residual),
            ("K", group.asset_account, asset.base_cost),
        ],
    )

    _create_catch_up_ops(asset, catch_up, entry, disposal_date)

    op = FixedAssetOperation.objects.create(
        asset_id=asset.pk,
        operation_type=FixedAssetOperationType.WRITE_OFF,
        operation_date=disposal_date,
        amount=residual,
        book=ACC,
        reason=reason,
        journal_entry=entry,
        description=f"{reason_label}: {comment}" if comment else reason_label,
    )

    FixedAsset.objects.filter(pk=asset.pk).update(
        status=FixedAssetStatus.WRITTEN_OFF,
        disposal_date=disposal_date,
    )

    logger.info(
        "Fixed asset %s written off date=%s residual=%s catch_up=%s je=%s",
        asset.pk,
        disposal_date,
        residual,
        catch_up_total,
        entry.pk,
    )

    return op


@transaction.atomic
def cancel_write_off(asset):
    asset = FixedAsset.objects.select_for_update().get(pk=asset.pk)

    if asset.status != FixedAssetStatus.WRITTEN_OFF:
        raise FixedAssetError("Turtas nenurašytas")

    _delete_disposal_operations(asset.pk, FixedAssetOperationType.WRITE_OFF)

    asset.status = _restore_status(asset)
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
    asset = _load_asset(asset.pk)

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

    catch_up = _disposal_catch_up(asset, disposal_date)
    catch_up_total = sum((a for _, a in catch_up), ZERO)
    group = _validate_disposal(asset, disposal_date, catch_up_total)

    # 1. Eilutė -> 5400 ir perkuriamas pardavimo DK (dar be turto ryšio)
    _set_invoice_income_account(invoice, invoice_line)

    if invoice_line is not None:
        invoice_line = InvoiceLineItem.objects.get(pk=invoice_line.pk)

    sale_amount = get_invoice_sale_amount(invoice, invoice_line)
    accumulated = asset.accumulated + catch_up_total
    residual = asset.base_cost - accumulated

    # 2. Uždarymo DK (su priskaičiuotu nusidėvėjimu)
    # 1247 uždarom tik anksčiau užregistruotą sumą - priskaičiuota
    # šiame DK iškart nurašoma per sąnaudas
    if sale_amount >= residual:
        close_lines = [
            ("D", group.accumulated_depreciation_account, asset.accumulated),
            ("D", SALE_GAIN_ACCOUNT, residual),
            ("K", group.asset_account, asset.base_cost),
        ]
    else:
        close_lines = [
            ("D", group.accumulated_depreciation_account, asset.accumulated),
            ("D", SALE_GAIN_ACCOUNT, sale_amount),
            ("D", SALE_LOSS_ACCOUNT, residual - sale_amount),
            ("K", group.asset_account, asset.base_cost),
        ]

    entry = _create_disposal_entry(
        asset=asset,
        user=user,
        entry_date=disposal_date,
        document_number=invoice.full_number,
        description=f"IT pardavimas: {asset.name}"[:255],
        catch_up_total=catch_up_total,
        close_lines=close_lines,
        counterparty_name=invoice.buyer_name or "",
        counterparty_code=invoice.buyer_id or "",
    )

    _create_catch_up_ops(asset, catch_up, entry, disposal_date)

    op = FixedAssetOperation.objects.create(
        asset_id=asset.pk,
        operation_type=FixedAssetOperationType.SALE,
        operation_date=disposal_date,
        amount=sale_amount,
        book=ACC,
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
        "Fixed asset %s sold invoice=%s line=%s sale=%s residual=%s catch_up=%s je=%s",
        asset.pk,
        invoice.pk,
        getattr(invoice_line, "pk", None),
        sale_amount,
        residual,
        catch_up_total,
        entry.pk,
    )

    return op


def _default_income_account(kind):
    kind = str(kind or "").strip().lower()
    return "5000" if kind in ("preke", "prekes", "1", "3") else "5001"


def _revert_invoice_income_account(invoice, invoice_line):
    """Atsiejus turtą, eilutei grąžinama įprasta pajamų sąskaita."""
    from ..utils.journal_generators import sync_invoice_journal_entry

    if invoice_line is not None:
        line = InvoiceLineItem.objects.get(pk=invoice_line.pk)
        InvoiceLineItem.objects.filter(pk=line.pk).update(
            kredito_saskaita=_default_income_account(line.preke_paslauga or invoice.preke_paslauga)
        )
    else:
        Invoice.objects.filter(pk=invoice.pk).update(
            kredito_saskaita=_default_income_account(invoice.preke_paslauga)
        )

    invoice.refresh_from_db()
    sync_invoice_journal_entry(invoice)


@transaction.atomic
def cancel_sale(asset, *, revert_income=True):
    asset = FixedAsset.objects.select_for_update().get(pk=asset.pk)

    if asset.status != FixedAssetStatus.SOLD:
        raise FixedAssetError("Turtas neparduotas")

    invoice = (
        Invoice.objects.filter(pk=asset.sale_invoice_id).first()
        if asset.sale_invoice_id else None
    )
    line = (
        InvoiceLineItem.objects.filter(pk=asset.sale_invoice_line_id).first()
        if asset.sale_invoice_line_id else None
    )

    _delete_disposal_operations(asset.pk, FixedAssetOperationType.SALE)

    asset.status = _restore_status(asset)
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

    if revert_income and invoice is not None and invoice.status != "cancelled":
        _revert_invoice_income_account(invoice, line)

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


# ═══════════════════════════════════════════════════════════
# Patikra prieš išrašant sąskaitą
# ═══════════════════════════════════════════════════════════

def check_sale(asset, *, invoice_date=None, amount=None, invoice_type="", currency="EUR"):
    """Patikra prieš išrašant sąskaitą. Nieko nekuria."""
    errors = []
    warnings = []

    asset = _load_asset(asset.pk)

    if asset.status not in (FixedAssetStatus.ACTIVE, FixedAssetStatus.DRAFT):
        errors.append(f"„{asset.name}“ jau nurašytas arba parduotas")

    if invoice_type in ("kreditine", "isankstine"):
        errors.append("Ilgalaikį turtą galima parduoti tik sąskaita faktūra arba PVM sąskaita faktūra")

    group = asset.group
    if not group or not group.asset_account:
        errors.append("Turto grupei nenurodyta turto DK sąskaita")

    catch_up_total = ZERO

    if invoice_date:
        from ..opening_balances.services import is_before_cutover

        if is_before_cutover(asset.company_profile_id, invoice_date):
            errors.append("Sąskaitos data yra iki perėjimo datos")

        min_date = asset.operation_start_date or asset.purchase_date
        if min_date and invoice_date < min_date:
            errors.append(
                f"Sąskaitos data negali būti ankstesnė už turto įsigijimą ({min_date:%Y-%m-%d})"
            )

        try:
            catch_up = _disposal_catch_up(asset, invoice_date)
            catch_up_total = sum((a for _, a in catch_up), ZERO)
        except FixedAssetError as e:
            errors.append(str(e.detail))

    currency = (currency or "EUR").upper()
    if currency != "EUR" and invoice_date:
        from ..services.accounting_transfer import rate_to_eur

        rate = rate_to_eur(currency, invoice_date)
        if not rate or rate <= ZERO:
            errors.append(f"Nėra {currency} kurso {invoice_date:%Y-%m-%d} dienai")

    residual = asset.base_cost - asset.accumulated - catch_up_total

    if amount is not None:
        amount = _to_decimal(amount)
        if amount <= ZERO:
            errors.append("Pardavimo kaina turi būti didesnė už 0")
        elif currency == "EUR" and amount < residual * Decimal("0.5"):
            warnings.append(
                f"Kaina gerokai mažesnė už likutinę vertę ({residual} EUR). "
                "Įsitikinkite, kad ji atitinka rinkos kainą"
            )

    if catch_up_total > ZERO:
        warnings.append(
            f"Bus priskaičiuotas nusidėvėjimas iki pardavimo mėnesio imtinai: {catch_up_total} EUR"
        )

    return {
        "errors": errors,
        "warnings": warnings,
        "residual": str(residual),
        "catch_up": str(catch_up_total),
    }