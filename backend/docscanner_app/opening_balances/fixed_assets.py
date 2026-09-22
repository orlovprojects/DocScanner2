"""Ilgalaikio turto registro įkėlimas į pradinius likučius."""

import logging
import unicodedata
from decimal import Decimal

from django.db import transaction

from ..ilgalaikis_turtas.constants import (
    ILT_MONTHS,
    FixedAssetCategory,
    ManualAssetSource,
)
from ..ilgalaikis_turtas.services import (
    FixedAssetError,
    create_manual_fixed_asset,
    ensure_default_groups,
)
from ..models import FixedAsset, FixedAssetGroup, OpeningBalanceLine, OpeningBalanceSection

logger = logging.getLogger("docscanner_app")

ZERO = Decimal("0")

# Turto sąskaitų prefiksai, kuriuos tikrinam su balansu
ASSET_ACCOUNT_PREFIXES = ("11", "12")


def _norm(text):
    normalized = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(c for c in normalized if not unicodedata.combining(c)).strip().lower()


def category_lookup():
    """{normalizuotas pavadinimas: kategorijos kodas} - atpažinimui iš failo."""
    lookup = {}
    for value, label in FixedAssetCategory.choices:
        lookup[_norm(value)] = value
        lookup[_norm(label)] = value
    return lookup


def category_options():
    return [
        {
            "value": value,
            "label": label,
            "months": ILT_MONTHS.get(value),
        }
        for value, label in FixedAssetCategory.choices
    ]


def summarize(batch):
    """Suvestinė ekranui: sumos pagal DK sąskaitas ir palyginimas su balansu."""
    lines = list(batch.lines.filter(section=OpeningBalanceSection.FIXED_ASSET))
    if not lines:
        return None

    groups = {
        g.category: g
        for g in ensure_default_groups(batch.company_profile)
    }

    by_account = {}
    unmapped = 0

    for line in lines:
        category = (line.extra or {}).get("category") or ""
        if not category:
            unmapped += 1
            continue

        group = groups.get(category)
        if not group:
            unmapped += 1
            continue

        asset_acc = group.asset_account or ""
        accum_acc = group.accumulated_depreciation_account or ""

        row = by_account.setdefault(
            (asset_acc, accum_acc),
            {"asset_account": asset_acc, "accumulated_account": accum_acc, "cost": ZERO, "accumulated": ZERO, "count": 0},
        )
        row["cost"] += line.debit or ZERO
        row["accumulated"] += line.credit or ZERO
        row["count"] += 1

    # Balanse nurodytos turto sąskaitų sumos
    balance = {}
    for line in batch.lines.filter(section=OpeningBalanceSection.BALANCE):
        code = str(line.mapped_account or "")
        if code.startswith(ASSET_ACCOUNT_PREFIXES):
            balance[code] = balance.get(code, ZERO) + (line.debit or ZERO) - (line.credit or ZERO)

    rows = []
    for row in sorted(by_account.values(), key=lambda r: r["asset_account"]):
        in_balance_cost = balance.get(row["asset_account"], ZERO)
        in_balance_accum = -balance.get(row["accumulated_account"], ZERO)

        rows.append({
            "asset_account": row["asset_account"],
            "accumulated_account": row["accumulated_account"],
            "count": row["count"],
            "cost": str(row["cost"]),
            "accumulated": str(row["accumulated"]),
            "residual": str(row["cost"] - row["accumulated"]),
            "balance_cost": str(in_balance_cost),
            "balance_accumulated": str(in_balance_accum),
            "cost_matches": abs(row["cost"] - in_balance_cost) <= Decimal("0.01"),
            "accumulated_matches": abs(row["accumulated"] - in_balance_accum) <= Decimal("0.01"),
        })

    total_cost = sum((Decimal(r["cost"]) for r in rows), ZERO)
    total_accumulated = sum((Decimal(r["accumulated"]) for r in rows), ZERO)

    return {
        "count": len(lines),
        "unmapped": unmapped,
        "total_cost": str(total_cost),
        "total_accumulated": str(total_accumulated),
        "total_residual": str(total_cost - total_accumulated),
        "accounts": rows,
        "created": FixedAsset.objects.filter(
            company_profile=batch.company_profile,
            operations__reason="pradiniai_likuciai",
        ).distinct().count(),
    }


@transaction.atomic
def create_assets(batch, user):
    """
    Sukuria IT korteles iš įkeltų eilučių. Kviečiama patvirtinant likučius.
    Grąžina (sukurta, klaidos).
    """
    lines = list(batch.lines.filter(section=OpeningBalanceSection.FIXED_ASSET))
    if not lines:
        return 0, []

    groups = {g.category: g for g in ensure_default_groups(batch.company_profile)}

    created = 0
    errors = []

    for line in lines:
        extra = line.extra or {}

        if extra.get("asset_id"):
            continue

        category = extra.get("category") or ""
        group = groups.get(category)

        if not group:
            errors.append(f"{line.row_number} eilutė ({line.account_name}): nenurodyta turto grupė.")
            continue

        try:
            asset = create_manual_fixed_asset(
                company_profile=batch.company_profile,
                user=user,
                source=ManualAssetSource.OPENING,
                group=group,
                name=line.account_name,
                acquisition_cost=line.debit or ZERO,
                purchase_date=_date(extra.get("purchase_date")),
                operation_start_date=_date(extra.get("operation_start_date")),
                useful_life_months=extra.get("useful_life_months") or None,
                salvage_value=Decimal(extra.get("salvage_value") or "0"),
                accumulated_depreciation=line.credit or ZERO,
                inventory_number=extra.get("inventory_number") or "",
                description="Pradiniai likučiai",
            )
        except FixedAssetError as e:
            errors.append(f"{line.row_number} eilutė ({line.account_name}): {e.detail}")
            continue

        extra["asset_id"] = asset.pk
        OpeningBalanceLine.objects.filter(pk=line.pk).update(extra=extra)
        created += 1

    logger.info(
        "[Opening] Fixed assets created: %s, errors: %s (batch %s)",
        created, len(errors), batch.id,
    )
    return created, errors


def _date(value):
    import datetime

    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


@transaction.atomic
def delete_assets(batch):
    """Ištrina iš likučių sukurtas korteles - kviečiama atšaukiant likučius."""
    ids = [
        (line.extra or {}).get("asset_id")
        for line in batch.lines.filter(section=OpeningBalanceSection.FIXED_ASSET)
    ]
    ids = [i for i in ids if i]

    if not ids:
        return 0

    blocked = FixedAsset.objects.filter(pk__in=ids).exclude(
        operations__reason="pradiniai_likuciai"
    ).distinct()

    if blocked.exists():
        raise FixedAssetError(
            "Dalis turto jau turi operacijų (nusidėvėjimą, pardavimą) - "
            "pirmiausia jas atšaukite"
        )

    deleted = FixedAsset.objects.filter(pk__in=ids).delete()[0]

    for line in batch.lines.filter(section=OpeningBalanceSection.FIXED_ASSET):
        extra = line.extra or {}
        extra.pop("asset_id", None)
        OpeningBalanceLine.objects.filter(pk=line.pk).update(extra=extra)

    return deleted