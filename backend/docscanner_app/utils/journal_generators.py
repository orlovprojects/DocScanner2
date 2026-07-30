from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Sum, Q
from django.db.models.functions import Coalesce

from ..models import JournalEntry, JournalEntryLine, Purchase, Invoice


BALANCE_TOLERANCE = Decimal("0.009")


def _get_account_name(code):
    """Возвращает название sąskaitos по коду для денормализации."""
    ACCOUNTS = {
        # Turtas
        "1130": "Programinės įrangos įsigijimo savikaina",
        "1220": "Mašinų ir įrangos įsigijimo savikaina",
        "1230": "Transporto priemonių įsigijimo savikaina",
        "1240": "Kitų įrenginių, prietaisų įsigijimo savikaina",
        "2010": "Žaliavos, medžiagos",
        "2040": "Prekės perpardavimui",
        "2080": "Avansai tiekėjams",
        "2410": "Pirkėjų skolos",
        "2441": "Gautinas PVM",
        "271": "Sąskaitos bankuose",
        "272": "Kasa",
        "291": "Ateinančių laikotarpių sąnaudos",

        # Nuosavas kapitalas
        "3010": "Įstatinis kapitalas",

        # Įsipareigojimai
        "4430": "Skolos tiekėjams",
        "4480": "Kitos mokėtinos sumos",
        "4481": "Mokėtini mokesčiai",
        "4492": "Mokėtinas PVM",

        # Pajamos
        "5000": "Parduotų prekių pajamos",
        "5001": "Suteiktų paslaugų pajamos",
        "509": "Nuolaidos, grąžinimas",
        "5009": "Apvalinimas",
        "5400": "Ilgalaikio turto perleidimo pelnas",
        "5401": "Kitos veiklos pajamos",

        # Sąnaudos
        "6000": "Parduotų prekių savikaina",
        "6001": "Suteiktų paslaugų savikaina",
        "6002": "Įsigytų prekių ir paslaugų savikaina",
        "6003": "Tiesioginės gamybos išlaidos",
        "6004": "Netiesioginės gamybos išlaidos",
        "6200": "Komisiniai mokesčiai",
        "6202": "Reklamos sąnaudos",
        "6208": "Kitos pardavimo sąnaudos",
        "6300": "Nuomos sąnaudos",
        "6301": "Remonto ir eksploatacijos sąnaudos",
        "6302": "Išmokos tretiesiems asmenims",
        "6303": "Draudimo sąnaudos",
        "6304": "Darbuotojų darbo užmokestis",
        "6308": "Veiklos mokesčių sąnaudos",
        "6311": "Baudos ir delspinigiai",
        "6312": "Kitos bendrosios sąnaudos",
        "6401": "Kitos sąnaudos",
        "6802": "Palūkanų sąnaudos",
        "6803": "Valiutų kursų nuostoliai",
        "6810": "Kitos finansinės sąnaudos",
    }
    return ACCOUNTS.get(str(code or ""), "")


def _to_decimal(value):
    """Saugi konversija į Decimal."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))

JE_AMOUNT_QUANT = Decimal("0.0001")


def _allocate_groups_to_total(raw_groups, target_total):
    """
    Proporcingai paskirsto dokumento galutinę sumą tarp sąskaitų.

    raw_groups naudojami tik kaip proporcijos.
    target_total yra galutinė suma jau po dokumento nuolaidos.

    Kreditinei target_total bus neigiamas, todėl _add_line()
    automatiškai apvers D/K pusę.
    """
    target_total = _to_decimal(target_total).quantize(
        JE_AMOUNT_QUANT,
        rounding=ROUND_HALF_UP,
    )

    weights = {}

    for code, value in raw_groups.items():
        code = str(code or "").strip()
        weight = abs(_to_decimal(value))

        if not code or weight == Decimal("0"):
            continue

        if code not in weights:
            weights[code] = Decimal("0")

        weights[code] += weight

    if not weights or target_total == Decimal("0"):
        return {}

    total_weight = sum(
        weights.values(),
        Decimal("0"),
    )

    if total_weight == Decimal("0"):
        return {}

    codes = sorted(weights.keys())
    result = {}
    allocated = Decimal("0")

    for code in codes[:-1]:
        amount = (
            target_total *
            weights[code] /
            total_weight
        ).quantize(
            JE_AMOUNT_QUANT,
            rounding=ROUND_HALF_UP,
        )

        result[code] = amount
        allocated += amount

    # Paskutinė sąskaita gauna likutį, kad nebūtų
    # apvalinimo skirtumo.
    last_code = codes[-1]
    result[last_code] = target_total - allocated

    return result


def recalculate_invoice_totals(invoice):
    """
    Vienintelis Invoice sumų perskaičiavimas prieš DK sukūrimą.

    Skaičiavimo tvarka:
    1. Sudedami eilučių subtotal.
    2. Pritaikoma bendra dokumento nuolaida.
    3. Nuolaida proporcingai paskirstoma pagal PVM tarifus.
    4. Išsaugomos galutinės Invoice sumos.
    """
    MONEY = Decimal("0.01")
    ZERO = Decimal("0")

    def round_money(value):
        return _to_decimal(value).quantize(
            MONEY,
            rounding=ROUND_HALF_UP,
        )

    invoice_lines = list(
        invoice.line_items.order_by("sort_order", "id")
    )

    if not invoice_lines:
        return invoice

    # Subtotal jau yra suma po eilutės nuolaidos,
    # bet prieš bendrą visos sąskaitos nuolaidą.
    sum_net = sum(
        (
            abs(_to_decimal(line.subtotal))
            for line in invoice_lines
        ),
        ZERO,
    )

    invoice_discount = min(
        abs(_to_decimal(invoice.invoice_discount_wo_vat)),
        sum_net,
    )

    amount_wo_vat = round_money(
        sum_net - invoice_discount
    )

    vat_groups = {}

    for line in invoice_lines:
        line_net = abs(
            _to_decimal(line.subtotal)
        )

        if invoice.pvm_tipas == "taikoma":
            vat_percent = abs(
                _to_decimal(
                    line.vat_percent
                    if line.vat_percent is not None
                    else invoice.vat_percent or 0
                )
            )
        else:
            vat_percent = ZERO

        if vat_percent not in vat_groups:
            vat_groups[vat_percent] = ZERO

        vat_groups[vat_percent] += line_net

    vat_amount = ZERO

    if (
        invoice.pvm_tipas == "taikoma"
        and sum_net > ZERO
    ):
        for vat_percent, group_net in vat_groups.items():
            ratio = group_net / sum_net

            discounted_group_net = round_money(
                group_net -
                invoice_discount * ratio
            )

            group_vat = round_money(
                discounted_group_net *
                vat_percent /
                Decimal("100")
            )

            vat_amount += group_vat

    vat_amount = round_money(vat_amount)

    amount_with_vat = round_money(
        amount_wo_vat + vat_amount
    )

    # Išrašyta kreditinė saugoma su minusais.
    is_issued_credit = (
        invoice.invoice_type == "kreditine"
        and invoice.status != "draft"
    )

    sign = (
        Decimal("-1")
        if is_issued_credit
        else Decimal("1")
    )

    invoice.amount_wo_vat = (
        amount_wo_vat * sign
    )
    invoice.vat_amount = (
        vat_amount * sign
    )
    invoice.amount_with_vat = (
        amount_with_vat * sign
    )
    invoice.invoice_discount_wo_vat = (
        invoice_discount * sign
    )

    # QuerySet.update() не вызывает Invoice.save() и post_save signal,
    # поэтому DK generator не запускает сам себя рекурсивно.
    Invoice.objects.filter(pk=invoice.pk).update(
        amount_wo_vat=invoice.amount_wo_vat,
        vat_amount=invoice.vat_amount,
        amount_with_vat=invoice.amount_with_vat,
        invoice_discount_wo_vat=invoice.invoice_discount_wo_vat,
    )

    return invoice


def _period_from_date(dt):
    """Возвращает первый день месяца для periodo."""
    if not dt:
        return None
    return dt.replace(day=1)


def finalize_journal_entry(entry):
    """
    Пересчитывает total_debit / total_credit / difference
    и ставит правильный status.

    Правила:
    - balanced + все sąskaitos заполнены -> posted / Užregistruotas
    - нет строк или нет account_code -> needs_review / Reikia peržiūros
    - D != K -> unbalanced / Nesubalansuotas
    """
    lines = entry.lines.all()

    debit = lines.filter(side="D").aggregate(
        s=Coalesce(Sum("amount"), Decimal("0"))
    )["s"]

    credit = lines.filter(side="K").aggregate(
        s=Coalesce(Sum("amount"), Decimal("0"))
    )["s"]

    difference = debit - credit

    has_lines = lines.exists()
    has_missing_account = lines.filter(
        Q(account_code__isnull=True) | Q(account_code="")
    ).exists()

    entry.total_debit = debit
    entry.total_credit = credit
    entry.difference = difference

    if not has_lines:
        entry.status = JournalEntry.STATUS_NEEDS_REVIEW

    elif has_missing_account:
        entry.status = JournalEntry.STATUS_NEEDS_REVIEW

    elif abs(difference) <= BALANCE_TOLERANCE:
        entry.status = JournalEntry.STATUS_POSTED
        entry.difference = Decimal("0")

    else:
        entry.status = JournalEntry.STATUS_UNBALANCED

    entry.save(update_fields=[
        "total_debit",
        "total_credit",
        "difference",
        "status",
        "updated_at",
    ])

    return entry


def _add_line(lines, *, entry, side, account_code, amount, description, sort_order):
    amount = _to_decimal(amount)

    if amount == Decimal("0"):
        return sort_order

    # Kreditinė SF / grąžinimas: neigiama suma → apverčiame pusę
    if amount < Decimal("0"):
        amount = abs(amount)
        side = "K" if side == "D" else "D"

    account_code = str(account_code or "").strip()

    lines.append(JournalEntryLine(
        entry=entry,
        side=side,
        account_code=account_code,
        account_name=_get_account_name(account_code),
        amount=amount,
        description=description or "",
        sort_order=sort_order,
    ))

    return sort_order + 1


# ═══════════════════════════════════════════════════════════
# PIRKIMO DK įrašas
# ═══════════════════════════════════════════════════════════

@transaction.atomic
def generate_purchase_journal_entry(purchase):
    """
    Sukuria arba atnaujina DK įrašą Purchase dokumentui.

    Sumiškai:
      D purchase.debeto_saskaita = amount_wo_vat
      D 2441 = vat_amount, jei > 0
      K 4430 = amount_with_vat

    Detaliai:
      D grupuoti pagal PurchaseLine.effective_debeto
      D 2441 = total vat_amount, jei > 0
      K 4430 = amount_with_vat
    """
    if not purchase or not purchase.company_profile_id:
        return None

    JournalEntry.objects.filter(
        purchase=purchase,
        source_type=JournalEntry.SOURCE_PURCHASE,
    ).delete()

    entry_date = (
        purchase.operation_date
        or purchase.invoice_date
        or purchase.created_at.date()
    )
    period = _period_from_date(entry_date)

    document_number = f"{purchase.document_series or ''}{purchase.document_number or ''}".strip()

    entry = JournalEntry.objects.create(
        user=purchase.user,
        company_profile=purchase.company_profile,
        source_type=JournalEntry.SOURCE_PURCHASE,
        purchase=purchase,
        entry_date=entry_date,
        period=period,
        document_number=document_number,
        counterparty_name=purchase.seller_name or "",
        counterparty_code=purchase.seller_id or "",
        description=f"Pirkimas: {purchase.seller_name or ''}".strip(),
        currency=purchase.currency or "EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    lines = []
    sort_order = 0

    amount_wo_vat = _to_decimal(purchase.amount_wo_vat)
    vat_amount = _to_decimal(purchase.vat_amount)
    amount_with_vat = _to_decimal(purchase.amount_with_vat)

    kredito_code = purchase.kredito_saskaita or "4430"
    pvm_code = purchase.pvm_saskaita or "2441"

    has_lines = purchase.line_items.exists()

    if has_lines:
        groups = {}

        for pl in purchase.line_items.all():
            code = pl.effective_debeto or "6312"
            subtotal = _to_decimal(pl.subtotal)

            if subtotal == Decimal("0"):
                continue

            if code not in groups:
                groups[code] = Decimal("0")

            groups[code] += subtotal

        for code in sorted(groups.keys()):
            sort_order = _add_line(
                lines,
                entry=entry,
                side="D",
                account_code=code,
                amount=groups[code],
                description=f"Pirkimas {purchase.seller_name or ''}".strip(),
                sort_order=sort_order,
            )

    else:
        debeto_code = purchase.debeto_saskaita or "6312"

        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=debeto_code,
            amount=amount_wo_vat,
            description=f"Pirkimas {purchase.seller_name or ''}".strip(),
            sort_order=sort_order,
        )

    if abs(vat_amount) > Decimal("0.001"):
        sort_order = _add_line(
            lines,
            entry=entry,
            side="D",
            account_code=pvm_code,
            amount=vat_amount,
            description="PVM",
            sort_order=sort_order,
        )

    sort_order = _add_line(
        lines,
        entry=entry,
        side="K",
        account_code=kredito_code,
        amount=amount_with_vat,
        description=f"Skola tiekėjui {purchase.seller_name or ''}".strip(),
        sort_order=sort_order,
    )

    JournalEntryLine.objects.bulk_create(lines)

    # Auto-generated pirkimas не должен оставаться Juodraštis.
    finalize_journal_entry(entry)

    return entry


# ═══════════════════════════════════════════════════════════
# PARDAVIMO DK įrašas iš Invoice
# ═══════════════════════════════════════════════════════════

@transaction.atomic
def generate_invoice_journal_entry(invoice):
    """
    Sukuria arba atnaujina DK įrašą Invoice dokumentui.

    Sumiškai:
      D 2410 Pirkėjų skolos = amount_with_vat
      K 5000 / 5001 Pajamos = amount_wo_vat
      K 4492 Mokėtinas PVM = vat_amount, jei > 0

    Detaliai:
      K pajamos grupuoti pagal line kredito_saskaita arba invoice.kredito_saskaita.
    """
    if not invoice or not invoice.company_profile_id:
        return None

    # Pirmiausia perskaičiuojame ir išsaugome Invoice sumas.
    # Tik tada kuriame DK įrašą.
    recalculate_invoice_totals(invoice)

    JournalEntry.objects.filter(
        invoice=invoice,
        source_type=JournalEntry.SOURCE_SALE,
    ).delete()

    entry_date = (
        invoice.operation_date
        or invoice.invoice_date
        or invoice.created_at.date()
    )
    period = _period_from_date(entry_date)

    document_number = invoice.full_number

    entry = JournalEntry.objects.create(
        user=invoice.user,
        company_profile=invoice.company_profile,
        source_type=JournalEntry.SOURCE_SALE,
        invoice=invoice,
        entry_date=entry_date,
        period=period,
        document_number=document_number,
        counterparty_name=invoice.buyer_name or "",
        counterparty_code=invoice.buyer_id or "",
        description=f"Pardavimas: {invoice.buyer_name or ''}".strip(),
        currency=invoice.currency or "EUR",
        status=JournalEntry.STATUS_DRAFT,
    )

    lines = []
    sort_order = 0

    amount_wo_vat = _to_decimal(invoice.amount_wo_vat)
    vat_amount = _to_decimal(invoice.vat_amount)
    amount_with_vat = _to_decimal(invoice.amount_with_vat)

    debeto_code = invoice.debeto_saskaita or "2410"
    pvm_code = invoice.pvm_saskaita or "4492"

    sort_order = _add_line(
        lines,
        entry=entry,
        side="D",
        account_code=debeto_code,
        amount=amount_with_vat,
        description=f"Pardavimas {invoice.buyer_name or ''}".strip(),
        sort_order=sort_order,
    )

    has_lines = invoice.line_items.exists()

    if has_lines:
        raw_income_groups = {}

        for il in invoice.line_items.all():
            code = (
                getattr(il, "kredito_saskaita", None)
                or (
                    "5000"
                    if getattr(il, "preke_paslauga", None) == "preke"
                    else "5001"
                )
            )

            subtotal = abs(_to_decimal(il.subtotal))

            if subtotal == Decimal("0"):
                continue

            if code not in raw_income_groups:
                raw_income_groups[code] = Decimal("0")

            raw_income_groups[code] += subtotal

        income_groups = _allocate_groups_to_total(
            raw_income_groups,
            amount_wo_vat,
        )

        if income_groups:
            for code in sorted(income_groups.keys()):
                sort_order = _add_line(
                    lines,
                    entry=entry,
                    side="K",
                    account_code=code,
                    amount=income_groups[code],
                    description=(
                        f"Pardavimas {invoice.buyer_name or ''}"
                    ).strip(),
                    sort_order=sort_order,
                )
        else:
            kredito_code = (
                invoice.kredito_saskaita or "5001"
            )

            sort_order = _add_line(
                lines,
                entry=entry,
                side="K",
                account_code=kredito_code,
                amount=amount_wo_vat,
                description=(
                    f"Pardavimas {invoice.buyer_name or ''}"
                ).strip(),
                sort_order=sort_order,
            )

    else:
        kredito_code = invoice.kredito_saskaita or "5001"

        sort_order = _add_line(
            lines,
            entry=entry,
            side="K",
            account_code=kredito_code,
            amount=amount_wo_vat,
            description=(
                f"Pardavimas {invoice.buyer_name or ''}"
            ).strip(),
            sort_order=sort_order,
        )

    if has_lines:
        raw_pvm_groups = {}

        for il in invoice.line_items.all():
            code = (
                getattr(il, "pvm_saskaita", None)
                or invoice.pvm_saskaita
                or "4492"
            )

            vat_weight = abs(_to_decimal(il.vat))

            # Jeigu eilutės vat laukas neužpildytas,
            # naudojame apskaičiuotą svorį.
            if vat_weight <= Decimal("0.001"):
                subtotal = abs(_to_decimal(il.subtotal))

                vat_percent = _to_decimal(
                    il.vat_percent
                    if il.vat_percent is not None
                    else invoice.vat_percent or 0
                )

                vat_weight = (
                    subtotal *
                    abs(vat_percent) /
                    Decimal("100")
                )

            if vat_weight <= Decimal("0.001"):
                continue

            if code not in raw_pvm_groups:
                raw_pvm_groups[code] = Decimal("0")

            raw_pvm_groups[code] += vat_weight

        pvm_groups = _allocate_groups_to_total(
            raw_pvm_groups,
            vat_amount,
        )

        if not pvm_groups and abs(vat_amount) > Decimal("0.001"):
            pvm_groups = {
                pvm_code: vat_amount,
            }

        for code in sorted(pvm_groups.keys()):
            sort_order = _add_line(
                lines,
                entry=entry,
                side="K",
                account_code=code,
                amount=pvm_groups[code],
                description="PVM",
                sort_order=sort_order,
            )

    else:
        if abs(vat_amount) > Decimal("0.001"):
            sort_order = _add_line(
                lines,
                entry=entry,
                side="K",
                account_code=pvm_code,
                amount=vat_amount,
                description="PVM",
                sort_order=sort_order,
            )

    JournalEntryLine.objects.bulk_create(lines)

    # Auto-generated pardavimas не должен оставаться Juodraštis.
    finalize_journal_entry(entry)

    return entry


# ═══════════════════════════════════════════════════════════
# DK sync helpers
# ═══════════════════════════════════════════════════════════

def can_post_to_dk(obj):
    if isinstance(obj, Invoice):
        if obj.invoice_type == "isankstine":
            return False

        if obj.status in ("draft", "cancelled"):
            return False

        # Išrašyta/perkelta SF jau validuota išrašymo metu — DK kuriamas visada.
        return True

    if isinstance(obj, Purchase):
        if getattr(obj, "status", None) in ("cancelled", "annulled"):
            return False

        return (
            getattr(obj, "ready_for_export", False) is True
            and getattr(obj, "math_validation_passed", False) is True
            and getattr(obj, "kor_balanced", False) is True
        )

    return False


def delete_purchase_journal_entry(purchase):
    if not purchase:
        return 0

    deleted, _ = JournalEntry.objects.filter(
        purchase=purchase,
        source_type=JournalEntry.SOURCE_PURCHASE,
    ).delete()

    return deleted


def delete_invoice_journal_entry(invoice):
    if not invoice:
        return 0

    deleted, _ = JournalEntry.objects.filter(
        invoice=invoice,
        source_type=JournalEntry.SOURCE_SALE,
    ).delete()

    return deleted


def sync_purchase_journal_entry(purchase):
    if not purchase:
        return None

    if can_post_to_dk(purchase):
        return generate_purchase_journal_entry(purchase)

    delete_purchase_journal_entry(purchase)
    return None


def sync_invoice_journal_entry(invoice):
    if not invoice:
        return None

    if can_post_to_dk(invoice):
        return generate_invoice_journal_entry(invoice)

    delete_invoice_journal_entry(invoice)
    return None