"""Pradinių likučių tikrinimas, patvirtinimas ir atšaukimas."""

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from ..models import (
    JournalEntry,
    JournalEntryLine,
    OpeningBalanceBatch,
    OpeningBalanceLine,
    OpeningBalanceSection,
)
from ..services.accounting_transfer import rate_to_eur
from ..services.counterparties import add_counterparty_iban, get_or_create_counterparty
from ..utils.chart_of_accounts import get_account_name
from ..utils.journal_generators import finalize_journal_entry
from .enrich import enrich_counterparty_data
from .matching import save_mapping

COUNTERPARTY_SECTIONS = (OpeningBalanceSection.BUYER, OpeningBalanceSection.SUPPLIER)

logger = logging.getLogger("docscanner_app")

ZERO = Decimal("0")
TOLERANCE = Decimal("0.01")

# Sąskaitos, kurių sumos imamos iš kontrahentų failo, o balanse tik tikrinamos
CONTROL_ACCOUNTS = {
    "2410": "customer",
    "4420": "customer",
    "4430": "supplier",
    "2080": "supplier",
}

# Techninė sąskaita likučiams subalansuoti
TECHNICAL_ACCOUNT = "999"
TECHNICAL_ACCOUNT_NAME = "Pradinių likučių tarpinė sąskaita"


def get_batch(company_profile):
    return OpeningBalanceBatch.objects.filter(company_profile=company_profile).first()


def to_eur(amount, currency, on_date):
    """Suma valiuta → EUR pagal LB kursą likučių datai."""
    from decimal import ROUND_HALF_UP

    amount = Decimal(str(amount or "0"))
    code = (currency or "EUR").upper()
    if code == "EUR" or amount == ZERO:
        return amount
    rate = rate_to_eur(code, on_date) or Decimal("1")
    if rate <= ZERO:
        return amount
    return (amount / rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def line_eur_balance(line, on_date):
    """Eilutės likutis EUR. Teigiamas = debetas."""
    if line.currency and line.currency.upper() != "EUR":
        debit = to_eur(line.debit, line.currency, on_date)
        credit = to_eur(line.credit, line.currency, on_date)
        return debit - credit
    return (line.debit or ZERO) - (line.credit or ZERO)


def _control_key(account_code):
    """2410 / 24101 → 2410."""
    code = str(account_code or "").strip()
    for control in CONTROL_ACCOUNTS:
        if code.startswith(control):
            return control
    return None


# ────────────────────────────────────────────────────────────
# Tikrinimas
# ────────────────────────────────────────────────────────────

def reconcile(batch):
    """
    Grąžina patikrinimo suvestinę — naudojama ir ekrane, ir prieš patvirtinimą.
    """
    lines = list(batch.lines.all())

    by_section = {}
    for line in lines:
        by_section.setdefault(line.section, []).append(line)

    unmapped = [
        {
            "id": line.id,
            "section": line.section,
            "account_code": line.account_code,
            "account_name": line.account_name,
            "row_number": line.row_number,
        }
        for line in lines
        if line.section not in COUNTERPARTY_SECTIONS and not line.mapped_account
    ]

    entry_date = batch.entry_date

    # Balanse nurodytos kontrolinių sąskaitų sumos
    balance_control = {}
    for line in by_section.get(OpeningBalanceSection.BALANCE, []):
        key = _control_key(line.mapped_account)
        if key:
            balance_control[key] = balance_control.get(key, ZERO) + line_eur_balance(line, entry_date)

    # Kontrahentų failų sumos
    cp_control = {}
    for section in COUNTERPARTY_SECTIONS:
        for line in by_section.get(section, []):
            key = _control_key(line.account_code)
            if key:
                cp_control[key] = cp_control.get(key, ZERO) + line_eur_balance(line, entry_date)

    control_rows = []
    total_diff = ZERO
    for account in sorted(set(balance_control) | set(cp_control)):
        in_balance = balance_control.get(account, ZERO)
        in_cp = cp_control.get(account, ZERO)
        diff = in_balance - in_cp
        total_diff += diff
        control_rows.append({
            "account_code": account,
            "account_name": get_account_name(account) or "",
            "in_balance": str(in_balance),
            "in_counterparties": str(in_cp),
            "difference": str(diff),
            "matches": abs(diff) <= TOLERANCE,
        })

    # Bendras D = K: balansas ir bankai kaip faile, skolos — iš kontrahentų failų
    total_debit = ZERO
    total_credit = ZERO
    for line in lines:
        if line.section == OpeningBalanceSection.BALANCE and _control_key(line.mapped_account):
            continue  # kontrolinės sąskaitos imamos iš kontrahentų failų
        eur = line_eur_balance(line, entry_date)
        if eur > ZERO:
            total_debit += eur
        else:
            total_credit += -eur
    balance_diff = total_debit - total_credit

    counterparty_count = sum(len(by_section.get(s, [])) for s in COUNTERPARTY_SECTIONS)
    bank_count = len(by_section.get(OpeningBalanceSection.BANK, []))

    # Nesubalansuotus likučius leidžiam patvirtinti — skirtumas nukeliauja
    # į techninę sąskaitą 999, kurią vartotojas ištaiso rankiniu DK įrašu.
    can_confirm = bool(lines) and not unmapped

    return {
        "cutover_date": batch.cutover_date.isoformat(),
        "entry_date": batch.entry_date.isoformat(),
        "status": batch.status,
        "diff_policy": batch.diff_policy,
        "line_count": len(lines),
        "counterparty_count": counterparty_count,
        "bank_count": bank_count,
        "unmapped": unmapped,
        "control_accounts": control_rows,
        "total_debit": str(total_debit),
        "total_credit": str(total_credit),
        "balance_difference": str(balance_diff),
        "balanced": abs(balance_diff) <= TOLERANCE,
        "technical_account": TECHNICAL_ACCOUNT,
        "can_confirm": can_confirm,
    }


# ────────────────────────────────────────────────────────────
# Patvirtinimas
# ────────────────────────────────────────────────────────────

def _ensure_counterparties(batch, user):
    """Sukuria korteles kontrahentų eilutėms, papildo duomenis iš registro."""
    for line in batch.lines.filter(section__in=COUNTERPARTY_SECTIONS):
        if line.counterparty_id:
            continue

        extra = line.extra or {}
        data = enrich_counterparty_data(
            name=line.counterparty_name,
            code=line.counterparty_code,
            vat_code=line.counterparty_vat_code,
            address=extra.get("address", ""),
            country=extra.get("country", ""),
            person_type=extra.get("person_type", ""),
        )

        role = "buyer" if line.section == OpeningBalanceSection.BUYER else "seller"
        cp, _ = get_or_create_counterparty(
            batch.company_profile_id,
            user,
            name=data["name"],
            company_code=data["company_code"],
            vat_code=data["vat_code"],
            address=data["address"],
            country=data["country"],
            country_iso=data["country_iso"],
            iban=(extra.get("ibans") or [""])[0],
            is_person=data["is_person"],
            role=role,
            source="opening",
        )
        if cp:
            for iban in extra.get("ibans") or []:
                add_counterparty_iban(cp, iban)
            OpeningBalanceLine.objects.filter(pk=line.pk).update(counterparty=cp)
            line.counterparty = cp


def _je_line(entry, side, code, amount, description, sort_order, counterparty_id=None):
    return JournalEntryLine(
        entry=entry,
        side=side,
        account_code=code,
        account_name=get_account_name(code) or "",
        amount=abs(amount),
        description=description[:255],
        sort_order=sort_order,
        counterparty_id=counterparty_id,
    )


@transaction.atomic
def confirm(batch, user):
    """
    Sukuria vieną opening JournalEntry ir užrakina partiją.
    Grąžina (entry, summary) arba (None, summary) jei tikrinimas nepraėjo.
    """
    summary = reconcile(batch)
    if not summary["can_confirm"]:
        return None, summary

    _ensure_counterparties(batch, user)

    JournalEntry.objects.filter(
        company_profile=batch.company_profile,
        source_type=JournalEntry.SOURCE_OPENING,
    ).delete()

    entry_date = batch.entry_date
    entry = JournalEntry.objects.create(
        user=user,
        company_profile=batch.company_profile,
        source_type=JournalEntry.SOURCE_OPENING,
        entry_date=entry_date,
        period=entry_date.replace(day=1),
        document_number="PRAD-001",
        description=f"Pradiniai likučiai {entry_date}",
        currency="EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    je_lines = []
    order = 0

    # 1. Balansas — be kontrolinių sąskaitų (jos ateina iš kontrahentų failų)
    for line in batch.lines.filter(section=OpeningBalanceSection.BALANCE):
        if _control_key(line.mapped_account):
            continue
        amount = line_eur_balance(line, entry_date)
        if amount == ZERO:
            continue
        je_lines.append(_je_line(
            entry, "D" if amount > 0 else "K", line.mapped_account,
            amount, line.account_name or "Pradinis likutis", order,
        ))
        order += 1

    # 2. Banko sąskaitos
    for line in batch.lines.filter(section=OpeningBalanceSection.BANK):
        amount = line_eur_balance(line, entry_date)
        if amount == ZERO:
            continue
        iban = (line.extra or {}).get("iban", "")
        desc = f"Pradinis likutis {iban}".strip()
        je_lines.append(_je_line(
            entry, "D" if amount > 0 else "K", line.mapped_account, amount, desc, order,
        ))
        order += 1

    # 3. Kontrahentai
    for line in batch.lines.filter(
        section__in=COUNTERPARTY_SECTIONS,
    ).select_related("counterparty"):
        amount = line_eur_balance(line, entry_date)
        if amount == ZERO:
            continue
        code = _control_key(line.account_code) or "2410"
        je_lines.append(_je_line(
            entry, "D" if amount > 0 else "K", code, amount,
            f"Pradinis likutis: {line.counterparty_name}", order,
            counterparty_id=line.counterparty_id,
        ))
        order += 1

    # 4. Skirtumas tarp balanso ir kontrahentų — priskiriam be kontrahento
    if batch.diff_policy == OpeningBalanceBatch.DIFF_UNASSIGNED:
        for row in summary["control_accounts"]:
            diff = Decimal(row["difference"])
            if abs(diff) <= TOLERANCE:
                continue
            je_lines.append(_je_line(
                entry, "D" if diff > 0 else "K", row["account_code"], diff,
                "Nepriskirta kontrahentui", order,
            ))
            order += 1

    # 5. Likutinis nesutapimas → techninė sąskaita
    total_d = sum((l.amount for l in je_lines if l.side == "D"), ZERO)
    total_k = sum((l.amount for l in je_lines if l.side == "K"), ZERO)
    residual = total_d - total_k
    if abs(residual) > TOLERANCE:
        je_lines.append(JournalEntryLine(
            entry=entry,
            side="K" if residual > 0 else "D",
            account_code=TECHNICAL_ACCOUNT,
            account_name=TECHNICAL_ACCOUNT_NAME,
            amount=abs(residual),
            description="Nesubalansuotas pradinių likučių skirtumas",
            sort_order=order,
        ))

    JournalEntryLine.objects.bulk_create(je_lines)
    finalize_journal_entry(entry)

    # Įsimenam susiejimus kitam kartui
    for line in batch.lines.exclude(section__in=COUNTERPARTY_SECTIONS):
        if line.mapped_account and line.account_code:
            save_mapping(
                batch.company_profile_id,
                line.account_code,
                line.account_name,
                line.mapped_account,
            )

    batch.status = OpeningBalanceBatch.STATUS_CONFIRMED
    batch.journal_entry = entry
    batch.confirmed_at = timezone.now()
    batch.save(update_fields=["status", "journal_entry", "confirmed_at", "updated_at"])

    logger.info(
        "[Opening] Confirmed batch %s: %s lines, JE #%s",
        batch.id, len(je_lines), entry.id,
    )
    return entry, reconcile(batch)


@transaction.atomic
def reopen(batch):
    """Grąžina partiją į juodraštį ir ištrina opening JE."""
    blocking = JournalEntryLine.objects.filter(
        entry=batch.journal_entry,
        counterparty__payment_allocations__isnull=False,
    ).exists() if batch.journal_entry_id else False

    if blocking:
        return False, "Prie pradinių likučių jau priskirti mokėjimai. Pirmiausia juos atšaukite."

    if batch.journal_entry_id:
        JournalEntry.objects.filter(pk=batch.journal_entry_id).delete()

    batch.status = OpeningBalanceBatch.STATUS_DRAFT
    batch.journal_entry = None
    batch.confirmed_at = None
    batch.save(update_fields=["status", "journal_entry", "confirmed_at", "updated_at"])
    return True, ""


# ────────────────────────────────────────────────────────────
# Guard: dokumentai iki perėjimo datos
# ────────────────────────────────────────────────────────────

def is_before_cutover(company_profile_id, doc_date):
    """
    True, jei dokumento data ankstesnė už perėjimo datą ir likučiai patvirtinti.
    Tokiems dokumentams DK įrašas nekuriamas — sumos jau yra likučiuose.
    """
    if not company_profile_id or not doc_date:
        return False
    batch = OpeningBalanceBatch.objects.filter(
        company_profile_id=company_profile_id,
        status=OpeningBalanceBatch.STATUS_CONFIRMED,
    ).only("cutover_date").first()
    return bool(batch and doc_date < batch.cutover_date)