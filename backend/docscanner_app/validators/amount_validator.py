import logging
from decimal import Decimal, ROUND_HALF_UP

logger = logging.getLogger("docscanner_app")


# ===============================
# Утилиты
# ===============================

def to_decimal(x, places=4):
    """
    Преобразует x в Decimal с нужным количеством знаков.
    Пустые значения и ошибки — 0.0000 / 0.00.
    """
    if x is None or x == "" or str(x).lower() == "null":
        return Decimal("0.0000") if places == 4 else Decimal("0.00")
    try:
        return Decimal(str(x)).quantize(Decimal("1." + "0" * places), rounding=ROUND_HALF_UP)
    except Exception as e:
        logger.info(f"[to_decimal] EXCEPTION: {e} (input={x})")
        return Decimal("0.0000") if places == 4 else Decimal("0.00")
    

# ===============================
# Udalit duplicate skidku iz dokumenta jesle jest lineitem skidka
# ===============================

def dedupe_document_discounts(doc_struct, tol=Decimal("0.05")):
    """
    Если сумма скидок по строкам ≈ документной скидке → уменьшает документную скидку на эту сумму.
    - Полное совпадение → документная скидка обнуляется.
    - Частичное совпадение → остаётся только 'остаток'.
    Никогда не делает скидку отрицательной.
    """
    items = doc_struct.get("line_items") or []

    def d(x, p=4):
        try:
            return Decimal(str(x)).quantize(Decimal("1." + "0"*p))
        except Exception:
            return Decimal("0.0000") if p == 4 else Decimal("0.00")

    # Суммы строковых скидок
    sum_line_disc_wo   = sum(d(it.get("discount_wo_vat"), 4)   for it in items)
    sum_line_disc_with = sum(d(it.get("discount_with_vat"), 4) for it in items)

    # Документные скидки
    inv_disc_wo   = d(doc_struct.get("invoice_discount_wo_vat"), 4)
    inv_disc_with = d(doc_struct.get("invoice_discount_with_vat"), 4)

    # --- Дедупликация "без НДС"
    if inv_disc_wo > Decimal("0.0000") and sum_line_disc_wo > Decimal("0.0000"):
        new_wo = inv_disc_wo - sum_line_disc_wo
        if abs(new_wo) <= tol:
            new_wo = Decimal("0.0000")
        if new_wo < Decimal("0.0000"):
            new_wo = Decimal("0.0000")
        if new_wo != inv_disc_wo:
            logger.info(f"[dedupe] invoice_discount_wo_vat {inv_disc_wo} → {new_wo} (line discounts={sum_line_disc_wo})")
            doc_struct["invoice_discount_wo_vat"] = new_wo
            doc_struct["_dedup_invoice_discount_wo_vat"] = True

    # --- Дедупликация "с НДС"
    if inv_disc_with > Decimal("0.0000") and sum_line_disc_with > Decimal("0.0000"):
        new_with = inv_disc_with - sum_line_disc_with
        if abs(new_with) <= tol:
            new_with = Decimal("0.0000")
        if new_with < Decimal("0.0000"):
            new_with = Decimal("0.0000")
        if new_with != inv_disc_with:
            logger.info(f"[dedupe] invoice_discount_with_vat {inv_disc_with} → {new_with} (line discounts with VAT={sum_line_disc_with})")
            doc_struct["invoice_discount_with_vat"] = new_with
            doc_struct["_dedup_invoice_discount_with_vat"] = True

    # Доп. защита: при нулевом VAT по документу не плодим with_vat-скидку
    doc_vat = d(doc_struct.get("vat_amount"), 4)
    if doc_vat == Decimal("0.0000"):
        # если totals уже сходятся без документной скидки 'with', обнулим её
        sum_total = sum(d(it.get("total"), 4) for it in items)
        doc_total = d(doc_struct.get("amount_with_vat"), 4)
        if inv_disc_with > Decimal("0.0000") and abs(doc_total - sum_total) <= tol:
            logger.info("[dedupe] VAT=0 и totals сходятся → invoice_discount_with_vat = 0")
            doc_struct["invoice_discount_with_vat"] = Decimal("0.0000")
            doc_struct["_dedup_invoice_discount_with_vat"] = True

    return doc_struct


# ===============================
# Сверка doc vs line_items (с учётом скидок на документ)
# ===============================

def _deduce_missing_document_discounts(doc_struct, sum_subtotal, sum_total, tol=Decimal("0.05")):
    """
    Пытаемся восстановить отсутствующие скидки документа из итогов,
    но если разница уже объясняется строковыми скидками — НЕ создаём документную скидку.
    Возвращает (inv_disc_wo, inv_disc_with).
    """
    inv_disc_wo = to_decimal(doc_struct.get("invoice_discount_wo_vat"), 4)
    inv_disc_with = to_decimal(doc_struct.get("invoice_discount_with_vat"), 4)

    doc_wo = to_decimal(doc_struct.get("amount_wo_vat"), 4)
    doc_tot = to_decimal(doc_struct.get("amount_with_vat"), 4)
    sum_vat = sum(to_decimal(it.get("vat"), 4) for it in (doc_struct.get("line_items") or []))
    doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)

    # NEW: учтём суммарные строковые скидки (без НДС)
    sum_line_disc_wo = sum(to_decimal(it.get("discount_wo_vat"), 4) for it in (doc_struct.get("line_items") or []))

    # 1) Восстановление скидки без НДС, только если её не покрывают строковые скидки
    if (inv_disc_wo.is_zero() or inv_disc_wo == Decimal("0.0000")) and doc_wo < sum_subtotal:
        diff_wo = (sum_subtotal - doc_wo).quantize(Decimal("1.0000"))
        # если разница примерно равна сумме строковых скидок — НЕ создаём документную скидку
        if abs(diff_wo - sum_line_disc_wo) <= tol:
            # отметим в техлоге, но поле не трогаем
            logger.info(f"[deduce] diff_wo≈line_discounts ({diff_wo}≈{sum_line_disc_wo}) → invoice_discount_wo_vat оставляем 0 (скидка уже в строках)")
        elif Decimal("0.0000") <= diff_wo <= sum_subtotal:
            inv_disc_wo = diff_wo
            doc_struct["invoice_discount_wo_vat"] = inv_disc_wo
            logger.info(f"[deduce] invoice_discount_wo_vat <- {inv_disc_wo}")

    # 2) Восстановление скидки с НДС по total — как было
    if (inv_disc_with.is_zero() or inv_disc_with == Decimal("0.0000")) and doc_tot < sum_total:
        deduced_with = (sum_total - doc_tot).quantize(Decimal("1.0000"))
        if Decimal("0.0000") <= deduced_with <= sum_total:
            inv_disc_with = deduced_with
            doc_struct["invoice_discount_with_vat"] = inv_disc_with
            logger.info(f"[deduce] invoice_discount_with_vat <- {inv_disc_with}")

    # 3) Если VAT=0 в строках и документе → with_vat = wo_vat (как было)
    if sum_vat == Decimal("0.0000") and doc_vat == Decimal("0.0000"):
        if inv_disc_with.is_zero() or inv_disc_with == Decimal("0.0000"):
            inv_disc_with = inv_disc_wo
            doc_struct["invoice_discount_with_vat"] = inv_disc_with
            logger.info("[deduce] VAT=0 → invoice_discount_with_vat = invoice_discount_wo_vat")

    return inv_disc_wo, inv_disc_with


def should_normalize_lineitems(doc_struct) -> bool:
    """
    Возвращает True, если line_items НУЖНО пересчитывать (т.к. суммы не сходятся),
    и False, если всё уже согласовано (пересчёт НЕ требуется).

    Логика сверки (после попытки восстановить скидки документа):
      amount_wo_vat     ≈ Σ(subtotal) - invoice_discount_wo_vat
      vat_amount        ≈ Σ(vat) - (invoice_discount_wo_vat * vat_percent_doc / 100)   ← важно для чеков АЗС
      amount_with_vat   ≈ Σ(total) - invoice_discount_with_vat
    """
    items = doc_struct.get("line_items", []) or []

    sum_subtotal = sum(to_decimal(it.get("subtotal"), 4) for it in items)
    sum_vat = sum(to_decimal(it.get("vat"), 4) for it in items)
    sum_total = sum(to_decimal(it.get("total"), 4) for it in items)

    # Восстанавливаем недостающие скидки (и VAT=0 shortcut)
    inv_disc_wo, inv_disc_with = _deduce_missing_document_discounts(doc_struct, sum_subtotal, sum_total)

    doc_wo = to_decimal(doc_struct.get("amount_wo_vat"), 4)
    doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)
    doc_tot = to_decimal(doc_struct.get("amount_with_vat"), 4)
    vat_percent_doc = to_decimal(doc_struct.get("vat_percent"), 2)

    # Эффективный VAT с учётом скидки на документ (пропорционально ставке документа)
    eff_sum_vat = sum_vat
    if not vat_percent_doc.is_zero() and not inv_disc_wo.is_zero():
        eff_sum_vat = (sum_vat - (inv_disc_wo * vat_percent_doc / Decimal("100"))).quantize(Decimal("1.0000"))
        if eff_sum_vat < Decimal("0.0000"):
            eff_sum_vat = Decimal("0.0000")

    tol = Decimal("0.05")

    ok_wo = abs(doc_wo - (sum_subtotal - inv_disc_wo)) < tol
    ok_vat = abs(doc_vat - eff_sum_vat) < tol
    ok_tot = abs(doc_tot - (sum_total - inv_disc_with)) < tol

    logger.info(
        f"[precheck] line_sums: subtotal={sum_subtotal}, vat={sum_vat}, total={sum_total}; "
        f"doc_sums: wo={doc_wo}, vat={doc_vat}, with={doc_tot}; "
        f"doc_discounts: wo={inv_disc_wo}, with={inv_disc_with}; vat%_doc={vat_percent_doc}; "
        f"eff_sum_vat={eff_sum_vat}; match: wo={ok_wo}, vat={ok_vat}, total={ok_tot}"
    )

    return not (ok_wo and ok_vat and ok_tot)


# ===============================
# Основные суммы документа (без учёта строк)
# ===============================

def validate_and_calculate_main_amounts(data):
    logger.info(f"[validate_main] ISKODNYE: {data}")

    amount_wo_vat = to_decimal(data.get("amount_wo_vat"), 4)
    vat_amount = to_decimal(data.get("vat_amount"), 4)
    vat_percent = to_decimal(data.get("vat_percent"), 2)
    amount_with_vat = to_decimal(data.get("amount_with_vat"), 4)

    logger.info(
        f"[validate_main] DO OBRABOTKI: amount_wo_vat={amount_wo_vat}, "
        f"vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}"
    )

    calc_log = []


    # ---- Новое правило: если нет line_items и заполнен только total ----
    items = data.get("line_items") or []
    if (
        not items
        and not amount_with_vat.is_zero()
        and amount_wo_vat.is_zero()
        and vat_amount.is_zero()
        and vat_percent.is_zero()
    ):
        amount_wo_vat = amount_with_vat
        vat_amount = Decimal("0.0000")
        vat_percent = Decimal("0.00")
        calc_log.append("auto: нет line_items и есть только total → wo_vat=with_vat, vat=0, vat%=0")



    # 1) amount_wo_vat
    if amount_wo_vat.is_zero():
        if not amount_with_vat.is_zero() and not vat_percent.is_zero():
            amount_wo_vat = (amount_with_vat / (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
            calc_log.append("amount_wo_vat из amount_with_vat и vat_percent")
        elif not amount_with_vat.is_zero() and not vat_amount.is_zero():
            amount_wo_vat = (amount_with_vat - vat_amount).quantize(Decimal("1.0000"))
            calc_log.append("amount_wo_vat из amount_with_vat и vat_amount")

    # 2) vat_amount
    if vat_amount.is_zero():
        if not amount_wo_vat.is_zero() and not vat_percent.is_zero():
            vat_amount = (amount_wo_vat * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
            calc_log.append("vat_amount из amount_wo_vat и vat_percent")
        elif not amount_with_vat.is_zero() and not amount_wo_vat.is_zero():
            vat_amount = (amount_with_vat - amount_wo_vat).quantize(Decimal("1.0000"))
            calc_log.append("vat_amount из amount_with_vat и amount_wo_vat")

    # 3) vat_percent
    if vat_percent.is_zero():
        if not amount_wo_vat.is_zero() and not vat_amount.is_zero():
            vat_percent = (vat_amount / amount_wo_vat * Decimal("100")).quantize(Decimal("1.00"))
            calc_log.append("vat_percent из vat_amount и amount_wo_vat")
        elif not amount_wo_vat.is_zero() and not amount_with_vat.is_zero():
            vat_percent = ((amount_with_vat / amount_wo_vat - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
            calc_log.append("vat_percent из amount_with_vat и amount_wo_vat")

    # 4) amount_with_vat
    if amount_with_vat.is_zero():
        if not amount_wo_vat.is_zero() and not vat_percent.is_zero():
            amount_with_vat = (amount_wo_vat * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
            calc_log.append("amount_with_vat из amount_wo_vat и vat_percent")
        elif not amount_wo_vat.is_zero() and not vat_amount.is_zero():
            amount_with_vat = (amount_wo_vat + vat_amount).quantize(Decimal("1.0000"))
            calc_log.append("amount_with_vat из amount_wo_vat и vat_amount")

    logger.info(
        f"[validate_main] POSLE OBRABOTKI: amount_wo_vat={amount_wo_vat}, "
        f"vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}"
    )
    logger.info(f"[validate_main] CALC_LOG: {calc_log}")

    data["amount_wo_vat"] = amount_wo_vat
    data["vat_amount"] = vat_amount
    data["vat_percent"] = vat_percent
    data["amount_with_vat"] = amount_with_vat
    data["_main_amounts_calc_log"] = calc_log
    return data


# ===============================
# Валидация и расчёт строки (line item)
# ===============================

def validate_and_calculate_lineitem_amounts(item):
    logger.info(f"[validate_line] ISKODNYE: {item}")

    calc_log = []

    quantity = to_decimal(item.get("quantity"), 4)
    price = to_decimal(item.get("price"), 4)
    subtotal = to_decimal(item.get("subtotal"), 4)
    vat = to_decimal(item.get("vat"), 4)
    vat_percent = to_decimal(item.get("vat_percent"), 2)
    total = to_decimal(item.get("total"), 4)
    discount_wo_vat = to_decimal(item.get("discount_wo_vat"), 4)

    TOL = Decimal("0.02")
    orig_subtotal = subtotal  # запомним, что пришло

    # === ПРОВЕРКА И КОРРЕКЦИЯ SUBTOTAL по новой логике ===
    # Если есть и price, и quantity, и discount
    if not price.is_zero() and not quantity.is_zero():
        expected_subtotal = (price * quantity - discount_wo_vat).quantize(Decimal("1.0000"))
        if abs(expected_subtotal - subtotal) > TOL:
            calc_log.append(
                f"subtotal ({subtotal}) не совпадает с price*quantity-discount ({expected_subtotal}) — ЗАМЕНЯЕМ"
            )
            subtotal = expected_subtotal
        else:
            calc_log.append("subtotal совпадает с price*quantity-discount — оставляем без изменений")
    else:
        # Если price или quantity нет — просто оставляем subtotal как есть
        calc_log.append("нет price или quantity — subtotal оставлен как есть")

    # --- 1) VAT (если отсутствует) ---
    if vat.is_zero():
        if not subtotal.is_zero() and not vat_percent.is_zero():
            vat = (subtotal * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
            calc_log.append("vat из subtotal и vat_percent")
        elif not total.is_zero() and not subtotal.is_zero():
            v = (total - subtotal).quantize(Decimal("1.0000"))
            if v < Decimal("0.0000"):
                calc_log.append(f"vat был бы отрицательным ({v}), ставим 0")
                vat = Decimal("0.0000")
            else:
                vat = v
                calc_log.append("vat из total и subtotal")

    # --- 2) VAT% (если отсутствует) ---
    if vat_percent.is_zero():
        if not vat.is_zero() and not subtotal.is_zero():
            vat_percent = (vat / subtotal * Decimal("100")).quantize(Decimal("1.00"))
            calc_log.append("vat_percent из vat и subtotal")
        elif not total.is_zero() and not subtotal.is_zero():
            if total >= subtotal:
                vat_percent = ((total / subtotal - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
                calc_log.append("vat_percent из total и subtotal")
            else:
                vat_percent = Decimal("0.00")
                calc_log.append("total < subtotal → vat_percent = 0.00")

    # --- 3) TOTAL (если отсутствует) ---
    if total.is_zero():
        if not subtotal.is_zero() and not vat_percent.is_zero():
            total = (subtotal * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
            calc_log.append("total из subtotal и vat_percent")
        elif not subtotal.is_zero() and not vat.is_zero():
            total = (subtotal + vat).quantize(Decimal("1.0000"))
            calc_log.append("total из subtotal и vat")
        elif not subtotal.is_zero():
            total = subtotal
            calc_log.append("total = subtotal (VAT=0 или нет ставки)")

    # --- 4) PRICE (если отсутствует) ---
    if price.is_zero():
        if quantity.is_zero():
            quantity = Decimal("1.0000")
            calc_log.append("quantity по умолчанию 1.0000")
        if not subtotal.is_zero():
            price = (subtotal / quantity).quantize(Decimal("1.0000"))
            calc_log.append("price из subtotal и quantity")

    # --- 5) QUANTITY (если всё ещё отсутствует) ---
    if quantity.is_zero():
        if not subtotal.is_zero() and not price.is_zero():
            quantity = (subtotal / price).quantize(Decimal("1.0000"))
            calc_log.append("quantity из subtotal и price")
        else:
            quantity = Decimal("1.0000")
            calc_log.append("quantity по умолчанию 1.0000")

    # --- 6) На всякий случай: если price не восстановился, но есть subtotal и quantity
    if price.is_zero() and not subtotal.is_zero() and not quantity.is_zero():
        price = (subtotal / quantity).quantize(Decimal("1.0000"))
        calc_log.append("price доуточнён из subtotal/quantity")

    logger.info(
        f"[validate_line] POSLE OBRABOTKI: quantity={quantity}, price={price}, subtotal={subtotal}, "
        f"vat={vat}, vat_percent={vat_percent}, total={total}"
    )
    logger.info(f"[validate_line] CALC_LOG: {calc_log}")

    item["quantity"] = quantity
    item["price"] = price
    item["subtotal"] = subtotal
    item["vat"] = vat
    item["vat_percent"] = vat_percent
    item["total"] = total
    item["_lineitem_calc_log"] = calc_log
    return item




# ===============================
# Глобальная валидация документа
# ===============================

def global_validate_and_correct(doc_struct):
    """
    Глобальная валидация и коррекция документа и line_items.
    ВАЖНО: если суммы уже совпадают (с учётом invoice_discount_*), ничего не меняем.
    При замене итогов документа учитываем скидки на документ:
      amount_wo_vat     <- Σ(subtotal) - invoice_discount_wo_vat
      vat_amount        <- Σ(vat) - (invoice_discount_wo_vat * vat_percent_doc / 100)   ← ключевая правка
      amount_with_vat   <- Σ(total) - invoice_discount_with_vat
    """
    logs = []
    doc_changed = False

    doc_struct["_subtotal_replaced"] = False
    doc_struct["_vat_replaced"] = False
    doc_struct["_total_replaced"] = False

    line_items = doc_struct.get("line_items", [])
    if not line_items:
        logs.append("Нет line_items для проверки.")
        doc_struct["_global_validation_log"] = logs
        return doc_struct

    # --- 0) Быстрый выход, если всё сходится с учётом скидок на документ ---
    if not should_normalize_lineitems(doc_struct):
        logs.append("✔ Суммы line_items уже совпадают с итогами документа (с учётом invoice_discount_*). Изменения не требуются.")
        doc_struct["_global_validation_log"] = logs
        logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
        return doc_struct

    # --- 1) Суммы по строкам ---
    sum_subtotal = sum(Decimal(str(item.get("subtotal") or "0")) for item in line_items)
    sum_vat = sum(Decimal(str(item.get("vat") or "0")) for item in line_items)
    sum_total = sum(Decimal(str(item.get("total") or "0")) for item in line_items)

    # --- 2) Скидки на документ (включая восстановление недостающих) ---
    inv_disc_wo, inv_disc_with = _deduce_missing_document_discounts(doc_struct, sum_subtotal, sum_total)
    vat_percent_doc = to_decimal(doc_struct.get("vat_percent"), 2)

    # --- 3) Эталоны "после скидок" ---
    eff_doc_wo = (sum_subtotal - inv_disc_wo).quantize(Decimal("1.0000"))
    if eff_doc_wo < Decimal("0"):
        eff_doc_wo = Decimal("0.0000")

    eff_doc_with = (sum_total - inv_disc_with).quantize(Decimal("1.0000"))
    if eff_doc_with < Decimal("0"):
        eff_doc_with = Decimal("0.0000")

    # VAT с учётом скидки на документ (пропорционально ставке документа)
    eff_vat = sum_vat
    if not vat_percent_doc.is_zero() and not inv_disc_wo.is_zero():
        eff_vat = (sum_vat - (inv_disc_wo * vat_percent_doc / Decimal("100"))).quantize(Decimal("1.0000"))
        if eff_vat < Decimal("0.0000"):
            eff_vat = Decimal("0.0000")

    # --- 4) Текущие значения документа ---
    doc_subtotal = to_decimal(doc_struct.get("amount_wo_vat"), 4)
    doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)
    doc_total = to_decimal(doc_struct.get("amount_with_vat"), 4)

    TOL = Decimal("0.05")

    # --- 5) Проверяем/заменяем amount_wo_vat ---
    diff_subtotal = (eff_doc_wo - doc_subtotal).quantize(Decimal("1.0000"))
    logs.append(f"Subtotal (после скидки на документ): эталон={eff_doc_wo}, doc={doc_subtotal}, diff={diff_subtotal}")
    if abs(diff_subtotal) > TOL:
        logs.append("❗amount_wo_vat документа отличается. Заменяем на Σ(subtotal) - invoice_discount_wo_vat.")
        doc_struct["amount_wo_vat"] = eff_doc_wo
        doc_struct["_subtotal_replaced"] = True
        doc_changed = True
    else:
        logs.append("✔ amount_wo_vat совпадает или отличается незначительно.")

    # --- 6) Проверяем/заменяем vat_amount (с учётом документной скидки) ---
    diff_vat = (eff_vat - doc_vat).quantize(Decimal("1.0000"))
    logs.append(f"VAT (с учётом скидки на документ): эталон={eff_vat}, doc={doc_vat}, diff={diff_vat}")
    if abs(diff_vat) > TOL:
        logs.append("❗vat_amount документа отличается. Заменяем на Σ(vat) − invoice_discount_wo_vat * vat_percent_doc/100.")
        doc_struct["vat_amount"] = eff_vat
        doc_struct["_vat_replaced"] = True
        doc_changed = True
    else:
        logs.append("✔ vat_amount совпадает или отличается незначительно.")

    # --- 7) Проверяем/заменяем amount_with_vat ---
    diff_total = (eff_doc_with - doc_total).quantize(Decimal("1.0000"))
    logs.append(f"Total (после скидки на документ): эталон={eff_doc_with}, doc={doc_total}, diff={diff_total}")
    if abs(diff_total) > TOL:
        logs.append("❗amount_with_vat документа отличается. Заменяем на Σ(total) - invoice_discount_with_vat.")
        doc_struct["amount_with_vat"] = eff_doc_with
        doc_struct["_total_replaced"] = True
        doc_changed = True
    else:
        logs.append("✔ amount_with_vat совпадает или отличается незначительно.")

    # --- 8) Финал ---
    if doc_changed:
        logs.append("Документ был скорректирован для соответствия lineitems (учтены скидки на документ).")
    else:
        logs.append("Документ уже был согласован с lineitems (учтены скидки на документ).")

    doc_struct["_doc_totals_replaced_by_lineitems"] = bool(doc_changed)
    doc_struct["_global_validation_log"] = logs
    logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
    return doc_struct


# ===============================
# Сверка (современная): effective_base и т.д.
# ===============================


def subtotal_already_discounted(item):
    """
    Возвращает True, если subtotal уже учтён С УЧЁТОМ discount_wo_vat (то есть discount не надо вычитать ещё раз).
    """
    try:
        subtotal = Decimal(str(item.get("subtotal") or "0")).quantize(Decimal("1.0000"))
        discount = Decimal(str(item.get("discount_wo_vat") or "0")).quantize(Decimal("1.0000"))
        price    = Decimal(str(item.get("price") or "0")).quantize(Decimal("1.0000"))
        qty      = Decimal(str(item.get("quantity") or "0")).quantize(Decimal("1.0000"))
        base = (price * qty).quantize(Decimal("1.0000"))
        # Сравниваем subtotal+discount и price*qty (разброс — 0.02)
        return abs((subtotal + discount) - base) <= Decimal("0.02")
    except Exception:
        return False



def compare_lineitems_with_main_totals(doc_struct):
    """
    Современная сверка с учётом скидок:
      expected_wo   = Σ(subtotal - line.discount_wo_vat) - eff_invoice_discount_wo_vat
      expected_vat  = Σ(line.vat) - eff_invoice_discount_wo_vat * vat_percent_doc/100
      expected_with = Σ(total) - eff_invoice_discount_with_vat

    Где eff_invoice_discount_* — это документные скидки за вычетом тех случаев,
    когда LLM уже разложил ту же скидку по строкам (чтобы не вычитать дважды).
    """
    TOL = Decimal("0.0500")

    def d(x, p=4):
        if x is None or x == "" or str(x).lower() == "null":
            return Decimal("0.0000") if p == 4 else Decimal("0.00")
        try:
            return Decimal(str(x)).quantize(Decimal("1." + "0"*p), rounding=ROUND_HALF_UP)
        except Exception:
            return Decimal("0.0000") if p == 4 else Decimal("0.00")

    items = doc_struct.get("line_items", []) or []

    # Суммы по строкам
    sum_line_subtotal = Decimal("0.0000")
    sum_line_discount_wo = Decimal("0.0000")
    sum_line_vat = Decimal("0.0000")
    sum_line_total = Decimal("0.0000")

    for it in items:
        subtotal = d(it.get("subtotal"), 4)
        disc_wo  = d(it.get("discount_wo_vat"), 4)
        vat      = d(it.get("vat"), 4)
        total    = d(it.get("total"), 4)

        # --- Ключ: если subtotal уже NET (минус скидка) — discount не вычитаем второй раз!
        if subtotal_already_discounted(it):
            sum_line_subtotal += subtotal
            # discount НЕ добавляем, он уже учтён
        else:
            sum_line_subtotal += subtotal
            sum_line_discount_wo += disc_wo

        sum_line_vat   += vat
        sum_line_total += total

    # Текущие итоги документа
    doc_wo  = d(doc_struct.get("amount_wo_vat"), 4)
    doc_vat = d(doc_struct.get("vat_amount"), 4)
    doc_tot = d(doc_struct.get("amount_with_vat"), 4)
    vat_percent_doc = d(doc_struct.get("vat_percent"), 2)

    # ВОССТАНОВИМ недостающие скидки документа (точно так же, как в should_normalize_lineitems)
    inv_disc_wo, inv_disc_with = _deduce_missing_document_discounts(
        doc_struct, sum_line_subtotal, sum_line_total
    )

    # ЭФФЕКТИВНЫЕ документные скидки (чтобы не вычитать дважды, если LLM уже размазал скидку по строкам)
    eff_inv_disc_wo = inv_disc_wo
    if abs(inv_disc_wo - sum_line_discount_wo) <= TOL:
        eff_inv_disc_wo = Decimal("0.0000")

    # По with-VAT обычно по строкам скидок нет; оставим симметрию
    sum_line_discount_with = Decimal("0.0000")
    eff_inv_disc_with = inv_disc_with
    if abs(inv_disc_with - sum_line_discount_with) <= TOL:
        eff_inv_disc_with = Decimal("0.0000")

    # Эффективная база строк без НДС (учёт строковых скидок)
    line_effective_wo = (sum_line_subtotal - sum_line_discount_wo)

    # ОЖИДАЕМЫЕ значения документа
    expected_wo  = (line_effective_wo - eff_inv_disc_wo).quantize(Decimal("1.0000"))
    if expected_wo < 0:
        expected_wo = Decimal("0.0000")

    # VAT: как у тебя в global_validate_and_correct
    expected_vat = sum_line_vat
    if not vat_percent_doc.is_zero() and not eff_inv_disc_wo.is_zero():
        expected_vat = (sum_line_vat - (eff_inv_disc_wo * vat_percent_doc / Decimal("100"))).quantize(Decimal("1.0000"))
        if expected_vat < Decimal("0.0000"):
            expected_vat = Decimal("0.0000")
    else:
        expected_vat = sum_line_vat.quantize(Decimal("1.0000"))

    expected_tot = (sum_line_total - eff_inv_disc_with).quantize(Decimal("1.0000"))
    if expected_tot < 0:
        expected_tot = Decimal("0.0000")

    result = {
        "subtotal_match": abs(expected_wo  - doc_wo ) <= TOL,
        "vat_match":      abs(expected_vat - doc_vat) <= TOL,
        "total_match":    abs(expected_tot - doc_tot) <= TOL,

        "subtotal_diff":  (expected_wo  - doc_wo ).quantize(Decimal("1.0000")),
        "vat_diff":       (expected_vat - doc_vat).quantize(Decimal("1.0000")),
        "total_diff":     (expected_tot - doc_tot).quantize(Decimal("1.0000")),

        "expected_amount_wo_vat":   expected_wo,
        "expected_vat_amount":      expected_vat,
        "expected_amount_with_vat": expected_tot,

        "line_sum_subtotal":        sum_line_subtotal.quantize(Decimal("1.0000")),
        "line_sum_discount_wo_vat": sum_line_discount_wo.quantize(Decimal("1.0000")),
        "line_effective_wo_vat":    line_effective_wo.quantize(Decimal("1.0000")),
        "line_sum_vat":             sum_line_vat.quantize(Decimal("1.0000")),
        "line_sum_with_vat":        sum_line_total.quantize(Decimal("1.0000")),

        "_eff_inv_disc_wo":         eff_inv_disc_wo,
        "_eff_inv_disc_with":       eff_inv_disc_with,
        "_vat_percent_doc":         vat_percent_doc,
    }
    logger.info(f"[compare_lineitems] RESULT: {result}")
    return result


# ===============================
# Помощник: нормализовать строки, только если нужно
# ===============================

def normalize_line_items_if_needed(doc_struct):
    """
    Если суммы line_items совпадают с итогами документа (учитывая invoice_discount_* и влияние скидки на VAT),
    НИЧЕГО не делаем. Иначе — пересчитываем строки.
    """
    if not should_normalize_lineitems(doc_struct):
        logger.info("[normalize_line_items] Суммы согласованы — пересчёт строк не требуется.")
        return doc_struct

    logger.info("[normalize_line_items] Обнаружены расхождения — пересчитываем строки.")
    for item in doc_struct.get("line_items", []) or []:
        validate_and_calculate_lineitem_amounts(item)
    return doc_struct































# import logging
# from decimal import Decimal, ROUND_HALF_UP

# logger = logging.getLogger("docscanner_app")


# # ===============================
# # Утилиты
# # ===============================

# def to_decimal(x, places=4):
#     """
#     Преобразует x в Decimal с нужным количеством знаков.
#     Пустые значения и ошибки — 0.0000 / 0.00.
#     """
#     if x is None or x == "" or str(x).lower() == "null":
#         return Decimal("0.0000") if places == 4 else Decimal("0.00")
#     try:
#         return Decimal(str(x)).quantize(Decimal("1." + "0" * places), rounding=ROUND_HALF_UP)
#     except Exception as e:
#         logger.info(f"[to_decimal] EXCEPTION: {e} (input={x})")
#         return Decimal("0.0000") if places == 4 else Decimal("0.00")


# # ===============================
# # Сверка doc vs line_items (с учётом скидок на документ)
# # ===============================

# def should_normalize_lineitems(doc_struct) -> bool:
#     """
#     Возвращает True, если line_items НУЖНО пересчитывать (т.к. суммы не сходятся),
#     и False, если всё уже согласовано (пересчёт НЕ требуется).

#     Логика сверки:
#       amount_wo_vat ≈ Σ(subtotal по строкам) - invoice_discount_wo_vat
#       vat_amount    ≈ Σ(vat по строкам)
#       amount_with_vat ≈ Σ(total по строкам) - invoice_discount_with_vat
#     """
#     items = doc_struct.get("line_items", []) or []

#     sum_subtotal = sum(to_decimal(it.get("subtotal"), 4) for it in items)
#     sum_vat = sum(to_decimal(it.get("vat"), 4) for it in items)
#     sum_total = sum(to_decimal(it.get("total"), 4) for it in items)

#     inv_disc_wo = to_decimal(doc_struct.get("invoice_discount_wo_vat"), 4)
#     inv_disc_with = to_decimal(doc_struct.get("invoice_discount_with_vat"), 4)

#     doc_wo = to_decimal(doc_struct.get("amount_wo_vat"), 4)
#     doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)
#     doc_tot = to_decimal(doc_struct.get("amount_with_vat"), 4)

#     tol = Decimal("0.05")

#     ok_wo = abs(doc_wo - (sum_subtotal - inv_disc_wo)) < tol
#     ok_vat = abs(doc_vat - sum_vat) < tol
#     ok_tot = abs(doc_tot - (sum_total - inv_disc_with)) < tol

#     logger.info(
#         f"[precheck] line_sums: subtotal={sum_subtotal}, vat={sum_vat}, total={sum_total}; "
#         f"doc_sums: wo={doc_wo}, vat={doc_vat}, with={doc_tot}; "
#         f"doc_discounts: wo={inv_disc_wo}, with={inv_disc_with}; "
#         f"match: wo={ok_wo}, vat={ok_vat}, total={ok_tot}"
#     )

#     return not (ok_wo and ok_vat and ok_tot)


# # ===============================
# # Основные суммы документа (без учёта строк)
# # ===============================

# def validate_and_calculate_main_amounts(data):
#     logger.info(f"[validate_main] ISKODNYE: {data}")

#     amount_wo_vat = to_decimal(data.get("amount_wo_vat"), 4)
#     vat_amount = to_decimal(data.get("vat_amount"), 4)
#     vat_percent = to_decimal(data.get("vat_percent"), 2)
#     amount_with_vat = to_decimal(data.get("amount_with_vat"), 4)

#     logger.info(
#         f"[validate_main] DO OBRABOTKI: amount_wo_vat={amount_wo_vat}, "
#         f"vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}"
#     )

#     calc_log = []

#     # 1) amount_wo_vat
#     if amount_wo_vat.is_zero():
#         if not amount_with_vat.is_zero() and not vat_percent.is_zero():
#             amount_wo_vat = (amount_with_vat / (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_percent")
#         elif not amount_with_vat.is_zero() and not vat_amount.is_zero():
#             amount_wo_vat = (amount_with_vat - vat_amount).quantize(Decimal("1.0000"))
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_amount")

#     # 2) vat_amount
#     if vat_amount.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_percent.is_zero():
#             vat_amount = (amount_wo_vat * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
#             calc_log.append("vat_amount из amount_wo_vat и vat_percent")
#         elif not amount_with_vat.is_zero() and not amount_wo_vat.is_zero():
#             vat_amount = (amount_with_vat - amount_wo_vat).quantize(Decimal("1.0000"))
#             calc_log.append("vat_amount из amount_with_vat и amount_wo_vat")

#     # 3) vat_percent
#     if vat_percent.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_amount.is_zero():
#             vat_percent = (vat_amount / amount_wo_vat * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из vat_amount и amount_wo_vat")
#         elif not amount_wo_vat.is_zero() and not amount_with_vat.is_zero():
#             vat_percent = ((amount_with_vat / amount_wo_vat - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из amount_with_vat и amount_wo_vat")

#     # 4) amount_with_vat
#     if amount_with_vat.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_percent.is_zero():
#             amount_with_vat = (amount_wo_vat * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("amount_with_vat из amount_wo_vat и vat_percent")
#         elif not amount_wo_vat.is_zero() and not vat_amount.is_zero():
#             amount_with_vat = (amount_wo_vat + vat_amount).quantize(Decimal("1.0000"))
#             calc_log.append("amount_with_vat из amount_wo_vat и vat_amount")

#     logger.info(
#         f"[validate_main] POSLE OBRABOTKI: amount_wo_vat={amount_wo_vat}, "
#         f"vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}"
#     )
#     logger.info(f"[validate_main] CALC_LOG: {calc_log}")

#     data["amount_wo_vat"] = amount_wo_vat
#     data["vat_amount"] = vat_amount
#     data["vat_percent"] = vat_percent
#     data["amount_with_vat"] = amount_with_vat
#     data["_main_amounts_calc_log"] = calc_log
#     return data


# # ===============================
# # Валидация и расчёт строки (line item)
# # ===============================

# def validate_and_calculate_lineitem_amounts(item):
#     """
#     ВАЖНО: перед вызовом этой функции рекомендуется выполнить should_normalize_lineitems(doc),
#     и пересчитывать строки только если суммы не сходятся.
#     """
#     logger.info(f"[validate_line] ISKODNYE: {item}")

#     calc_log = []

#     quantity = to_decimal(item.get("quantity"), 4)
#     price = to_decimal(item.get("price"), 4)
#     subtotal = to_decimal(item.get("subtotal"), 4)
#     vat = to_decimal(item.get("vat"), 4)
#     vat_percent = to_decimal(item.get("vat_percent"), 2)
#     total = to_decimal(item.get("total"), 4)
#     discount_wo_vat = to_decimal(item.get("discount_wo_vat"), 4)

#     # --- 0) Коррекция SUBTOTAL по формуле (quantity * price - discount_wo_vat) ---
#     subtotal_calc = (quantity * price - discount_wo_vat).quantize(Decimal("1.0000"))
#     if subtotal_calc < Decimal("0.0000"):
#         subtotal_calc = Decimal("0.0000")
#     if abs(subtotal - subtotal_calc) > Decimal("0.01"):
#         calc_log.append(f"subtotal скорректирован с {subtotal} → {subtotal_calc} (quantity*price - discount_wo_vat)")
#         subtotal = subtotal_calc
#     else:
#         calc_log.append("subtotal совпадает с quantity*price - discount_wo_vat")

#     # --- 1) VAT (если отсутствует) ---
#     if vat.is_zero():
#         if not subtotal.is_zero() and not vat_percent.is_zero():
#             vat = (subtotal * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
#             calc_log.append("vat из subtotal и vat_percent")
#         elif not total.is_zero() and not subtotal.is_zero():
#             vat = (total - subtotal).quantize(Decimal("1.0000"))
#             calc_log.append("vat из total и subtotal")

#     # --- 2) VAT% (если отсутствует) ---
#     if vat_percent.is_zero():
#         if not vat.is_zero() and not subtotal.is_zero():
#             vat_percent = (vat / subtotal * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из vat и subtotal")
#         elif not total.is_zero() and not subtotal.is_zero():
#             vat_percent = ((total / subtotal - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из total и subtotal")

#     # --- 3) TOTAL (если отсутствует) ---
#     if total.is_zero():
#         if not subtotal.is_zero() and not vat_percent.is_zero():
#             total = (subtotal * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("total из subtotal и vat_percent")
#         elif not subtotal.is_zero() and not vat.is_zero():
#             total = (subtotal + vat).quantize(Decimal("1.0000"))
#             calc_log.append("total из subtotal и vat")
#         elif not subtotal.is_zero():
#             # VAT=0% и vat=0 → total = subtotal
#             total = subtotal
#             calc_log.append("total = subtotal (VAT=0)")

#     # --- 4) PRICE (если отсутствует) ---
#     if price.is_zero():
#         if not subtotal.is_zero() and not quantity.is_zero():
#             price = (subtotal / quantity).quantize(Decimal("1.0000"))
#             calc_log.append("price из subtotal и quantity")
#         elif not total.is_zero() and not quantity.is_zero() and not vat_percent.is_zero():
#             price = ((total / (Decimal("1") + vat_percent / Decimal("100"))) / quantity).quantize(Decimal("1.0000"))
#             calc_log.append("price из total, vat_percent, quantity")

#     # --- 5) QUANTITY (если отсутствует) ---
#     if quantity.is_zero():
#         if not subtotal.is_zero() and not price.is_zero():
#             quantity = (subtotal / price).quantize(Decimal("1.0000"))
#             calc_log.append("quantity из subtotal и price")
#         elif not total.is_zero() and not price.is_zero() and not vat_percent.is_zero():
#             quantity = ((total / (Decimal("1") + vat_percent / Decimal("100"))) / price).quantize(Decimal("1.0000"))
#             calc_log.append("quantity из total, vat_percent, price")

#     # --- 6) Значения по умолчанию ---
#     if quantity.is_zero():
#         quantity = Decimal("1.0000")
#         calc_log.append("quantity по умолчанию 1.0000")
#     if price.is_zero() and not subtotal.is_zero():
#         price = subtotal
#         calc_log.append("price по умолчанию = subtotal")

#     logger.info(
#         f"[validate_line] POSLE OBRABOTKI: quantity={quantity}, price={price}, subtotal={subtotal}, "
#         f"vat={vat}, vat_percent={vat_percent}, total={total}"
#     )
#     logger.info(f"[validate_line] CALC_LOG: {calc_log}")

#     item["quantity"] = quantity
#     item["price"] = price
#     item["subtotal"] = subtotal
#     item["vat"] = vat
#     item["vat_percent"] = vat_percent
#     item["total"] = total
#     item["_lineitem_calc_log"] = calc_log
#     return item


# # ===============================
# # Глобальная валидация документа
# # ===============================

# def global_validate_and_correct(doc_struct):
#     """
#     Глобальная валидация и коррекция документа и line_items.
#     ВАЖНО: если суммы уже совпадают (с учётом invoice_discount_*), ничего не меняем.
#     При замене итогов документа учитываем скидки на документ:
#       amount_wo_vat   <- Σ(subtotal) - invoice_discount_wo_vat
#       vat_amount      <- Σ(vat)
#       amount_with_vat <- Σ(total) - invoice_discount_with_vat
#     """
#     from decimal import Decimal

#     logs = []
#     doc_changed = False

#     doc_struct["_subtotal_replaced"] = False
#     doc_struct["_vat_replaced"] = False
#     doc_struct["_total_replaced"] = False

#     line_items = doc_struct.get("line_items", [])
#     if not line_items:
#         logs.append("Нет line_items для проверки.")
#         doc_struct["_global_validation_log"] = logs
#         return doc_struct

#     # --- 0) Быстрый выход, если всё сходится с учётом скидок на документ ---
#     if not should_normalize_lineitems(doc_struct):
#         logs.append("✔ Суммы line_items уже совпадают с итогами документа (с учётом invoice_discount_*). Изменения не требуются.")
#         doc_struct["_global_validation_log"] = logs
#         logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
#         return doc_struct

#     # --- 1) Суммы по строкам ---
#     sum_subtotal = sum(Decimal(str(item.get("subtotal") or "0")) for item in line_items)
#     sum_vat = sum(Decimal(str(item.get("vat") or "0")) for item in line_items)
#     sum_total = sum(Decimal(str(item.get("total") or "0")) for item in line_items)

#     # Скидки на документ (если нет — 0)
#     inv_disc_wo = to_decimal(doc_struct.get("invoice_discount_wo_vat"), 4)
#     inv_disc_with = to_decimal(doc_struct.get("invoice_discount_with_vat"), 4)

#     # «После-скидочные» эталоны для документа
#     eff_doc_wo = (sum_subtotal - inv_disc_wo).quantize(Decimal("1.0000"))
#     if eff_doc_wo < Decimal("0"): 
#         eff_doc_wo = Decimal("0.0000")

#     eff_doc_with = (sum_total - inv_disc_with).quantize(Decimal("1.0000"))
#     if eff_doc_with < Decimal("0"):
#         eff_doc_with = Decimal("0.0000")

#     # Текущие значения документа
#     doc_subtotal = to_decimal(doc_struct.get("amount_wo_vat"), 4)
#     doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)
#     doc_total = to_decimal(doc_struct.get("amount_with_vat"), 4)

#     TOL = Decimal("0.05")

#     # --- 2) Проверяем/заменяем amount_wo_vat (с учётом скидки на документ) ---
#     diff_subtotal = (eff_doc_wo - doc_subtotal).quantize(Decimal("1.0000"))
#     logs.append(f"Subtotal (после скидки на документ): эталон={eff_doc_wo}, doc={doc_subtotal}, diff={diff_subtotal}")
#     if abs(diff_subtotal) > TOL:
#         logs.append("❗amount_wo_vat документа отличается. Заменяем на Σ(subtotal) - invoice_discount_wo_vat.")
#         doc_struct["amount_wo_vat"] = eff_doc_wo
#         doc_struct["_subtotal_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ amount_wo_vat совпадает или отличается незначительно.")

#     # --- 3) Проверяем/заменяем vat_amount (= Σ(vat)) ---
#     diff_vat = (sum_vat - doc_vat).quantize(Decimal("1.0000"))
#     logs.append(f"VAT: lineitems={sum_vat}, doc={doc_vat}, diff={diff_vat}")
#     if abs(diff_vat) > TOL:
#         logs.append("❗vat_amount документа отличается. Заменяем на Σ(vat) по lineitems.")
#         doc_struct["vat_amount"] = sum_vat
#         doc_struct["_vat_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ vat_amount совпадает или отличается незначительно.")

#     # --- 4) Проверяем/заменяем amount_with_vat (с учётом скидки на документ) ---
#     diff_total = (eff_doc_with - doc_total).quantize(Decimal("1.0000"))
#     logs.append(f"Total (после скидки на документ): эталон={eff_doc_with}, doc={doc_total}, diff={diff_total}")
#     if abs(diff_total) > TOL:
#         logs.append("❗amount_with_vat документа отличается. Заменяем на Σ(total) - invoice_discount_with_vat.")
#         doc_struct["amount_with_vat"] = eff_doc_with
#         doc_struct["_total_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ amount_with_vat совпадает или отличается незначительно.")

#     # --- 5) Финал ---
#     if doc_changed:
#         logs.append("Документ был скорректирован для соответствия lineitems (учтены скидки на документ).")
#     else:
#         logs.append("Документ уже был согласован с lineitems (учтены скидки на документ).")

#     doc_struct["_doc_totals_replaced_by_lineitems"] = bool(doc_changed)
#     doc_struct["_global_validation_log"] = logs
#     logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
#     return doc_struct


# # ===============================
# # Сверка (современная): effective_base и т.д.
# # ===============================

# def compare_lineitems_with_main_totals(doc_struct):
#     """
#     Сверка сумм по строкам с основными суммами документа.
#     Теперь сравниваем amount_wo_vat c Σ(effective_base),
#     где effective_base = max(subtotal - discount_wo_vat, 0).
#     Допуск: 0.0500.
#     """
#     TOL = Decimal("0.0500")

#     def to_d(x, places=4):
#         return to_decimal(x, places)

#     items = doc_struct.get("line_items", []) or []

#     sum_effective = Decimal("0.0000")
#     sum_vat = Decimal("0.0000")
#     sum_total = Decimal("0.0000")

#     for it in items:
#         subtotal = to_d(it.get("subtotal"), 4)
#         disc_wo = to_d(it.get("discount_wo_vat"), 4)
#         vat = to_d(it.get("vat"), 4)
#         total = to_d(it.get("total"), 4)

#         eff = subtotal - disc_wo
#         if eff < Decimal("0"):
#             eff = Decimal("0.0000")
#         eff = eff.quantize(Decimal("1.0000"))

#         sum_effective += eff
#         sum_vat += vat
#         sum_total += total

#     main_wo = to_d(doc_struct.get("amount_wo_vat"), 4)
#     main_vat = to_d(doc_struct.get("vat_amount"), 4)
#     main_tot = to_d(doc_struct.get("amount_with_vat"), 4)

#     result = {
#         "subtotal_match": abs(sum_effective - main_wo) <= TOL,
#         "vat_match": abs(sum_vat - main_vat) <= TOL,
#         "total_match": abs(sum_total - main_tot) <= TOL,
#         "subtotal_diff": (sum_effective - main_wo).quantize(Decimal("1.0000")),
#         "vat_diff": (sum_vat - main_vat).quantize(Decimal("1.0000")),
#         "total_diff": (sum_total - main_tot).quantize(Decimal("1.0000")),
#         "line_sum_effective_wo_vat": sum_effective.quantize(Decimal("1.0000")),
#         "line_sum_vat": sum_vat.quantize(Decimal("1.0000")),
#         "line_sum_with_vat": sum_total.quantize(Decimal("1.0000")),
#         "main_wo_vat": main_wo.quantize(Decimal("1.0000")),
#         "main_vat": main_vat.quantize(Decimal("1.0000")),
#         "main_with_vat": main_tot.quantize(Decimal("1.0000")),
#     }

#     logger.info(f"[compare_lineitems] RESULT: {result}")
#     return result


# # ===============================
# # Помощник: нормализовать строки, только если нужно
# # ===============================

# def normalize_line_items_if_needed(doc_struct):
#     """
#     Если суммы line_items совпадают с итогами документа (учитывая invoice_discount_*),
#     НИЧЕГО не делаем. Иначе — пересчитываем строки.
#     """
#     if not should_normalize_lineitems(doc_struct):
#         logger.info("[normalize_line_items] Суммы согласованы — пересчёт строк не требуется.")
#         return doc_struct

#     logger.info("[normalize_line_items] Обнаружены расхождения — пересчитываем строки.")
#     for item in doc_struct.get("line_items", []) or []:
#         validate_and_calculate_lineitem_amounts(item)
#     return doc_struct






































# import logging
# from decimal import Decimal, ROUND_HALF_UP

# logger = logging.getLogger("docscanner_app")


# def to_decimal(x, places=4):
#     """
#     Преобразует x в Decimal с нужным количеством знаков.
#     Пустые значения и ошибки — 0.0000.
#     """
#     if x is None or x == "" or str(x).lower() == "null":
#         return Decimal("0.0000")
#     try:
#         return Decimal(str(x)).quantize(Decimal("1." + "0" * places), rounding=ROUND_HALF_UP)
#     except Exception as e:
#         logger.info(f"[to_decimal] EXCEPTION: {e} (input={x})")
#         return Decimal("0.0000")


# def validate_and_calculate_main_amounts(data):
#     logger.info(f"[validate_main] ISKODNYE: {data}")

#     amount_wo_vat = to_decimal(data.get("amount_wo_vat"), 4)
#     vat_amount = to_decimal(data.get("vat_amount"), 4)
#     vat_percent = to_decimal(data.get("vat_percent"), 2)
#     amount_with_vat = to_decimal(data.get("amount_with_vat"), 4)

#     logger.info(
#         f"[validate_main] DO OBRABOTKI: amount_wo_vat={amount_wo_vat}, "
#         f"vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}"
#     )

#     calc_log = []

#     # 1. amount_wo_vat
#     if amount_wo_vat.is_zero():
#         if not amount_with_vat.is_zero() and not vat_percent.is_zero():
#             amount_wo_vat = (amount_with_vat / (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_percent")
#         elif not amount_with_vat.is_zero() and not vat_amount.is_zero():
#             amount_wo_vat = (amount_with_vat - vat_amount).quantize(Decimal("1.0000"))
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_amount")

#     # 2. vat_amount
#     if vat_amount.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_percent.is_zero():
#             vat_amount = (amount_wo_vat * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
#             calc_log.append("vat_amount из amount_wo_vat и vat_percent")
#         elif not amount_with_vat.is_zero() and not amount_wo_vat.is_zero():
#             vat_amount = (amount_with_vat - amount_wo_vat).quantize(Decimal("1.0000"))
#             calc_log.append("vat_amount из amount_with_vat и amount_wo_vat")

#     # 3. vat_percent
#     if vat_percent.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_amount.is_zero():
#             vat_percent = (vat_amount / amount_wo_vat * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из vat_amount и amount_wo_vat")
#         elif not amount_wo_vat.is_zero() and not amount_with_vat.is_zero():
#             vat_percent = ((amount_with_vat / amount_wo_vat - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из amount_with_vat и amount_wo_vat")

#     # 4. amount_with_vat
#     if amount_with_vat.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_percent.is_zero():
#             amount_with_vat = (amount_wo_vat * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("amount_with_vat из amount_wo_vat и vat_percent")
#         elif not amount_wo_vat.is_zero() and not vat_amount.is_zero():
#             amount_with_vat = (amount_wo_vat + vat_amount).quantize(Decimal("1.0000"))
#             calc_log.append("amount_with_vat из amount_wo_vat и vat_amount")

#     logger.info(
#         f"[validate_main] POSLE OBRABOTKI: amount_wo_vat={amount_wo_vat}, "
#         f"vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}"
#     )
#     logger.info(f"[validate_main] CALC_LOG: {calc_log}")

#     data["amount_wo_vat"] = amount_wo_vat
#     data["vat_amount"] = vat_amount
#     data["vat_percent"] = vat_percent
#     data["amount_with_vat"] = amount_with_vat
#     data["_main_amounts_calc_log"] = calc_log

#     return data





# def validate_and_calculate_lineitem_amounts(item):
#     logger.info(f"[validate_line] ISKODNYE: {item}")

#     calc_log = []

#     quantity = to_decimal(item.get("quantity"), 4)
#     price = to_decimal(item.get("price"), 4)
#     subtotal = to_decimal(item.get("subtotal"), 4)
#     vat = to_decimal(item.get("vat"), 4)
#     vat_percent = to_decimal(item.get("vat_percent"), 2)
#     total = to_decimal(item.get("total"), 4)
#     discount_wo_vat = to_decimal(item.get("discount_wo_vat"), 4)

#     # --- Коррекция subtotal по скидке ---
#     orig_subtotal = subtotal
#     subtotal_calc = (quantity * price - discount_wo_vat).quantize(Decimal("1.0000"))
#     if subtotal_calc < Decimal("0.0000"):
#         subtotal_calc = Decimal("0.0000")
#     if abs(subtotal - subtotal_calc) > Decimal("0.01"):
#         calc_log.append(f"subtotal скорректирован с {subtotal} → {subtotal_calc} по формуле quantity * price - discount_wo_vat")
#         subtotal = subtotal_calc
#     else:
#         calc_log.append("subtotal совпадает с quantity * price - discount_wo_vat")


#     # 2. vat
#     if vat.is_zero():
#         if not subtotal.is_zero() and not vat_percent.is_zero():
#             vat = (subtotal * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
#             calc_log.append("vat из subtotal и vat_percent")
#         elif not total.is_zero() and not subtotal.is_zero():
#             vat = (total - subtotal).quantize(Decimal("1.0000"))
#             calc_log.append("vat из total и subtotal")

#     # 3. vat_percent
#     if vat_percent.is_zero():
#         if not vat.is_zero() and not subtotal.is_zero():
#             vat_percent = (vat / subtotal * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из vat и subtotal")
#         elif not total.is_zero() and not subtotal.is_zero():
#             vat_percent = ((total / subtotal - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из total и subtotal")

#     # 4. total
#     if total.is_zero():
#         if not subtotal.is_zero() and not vat_percent.is_zero():
#             total = (subtotal * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("total из subtotal и vat_percent")
#         elif not subtotal.is_zero() and not vat.is_zero():
#             total = (subtotal + vat).quantize(Decimal("1.0000"))
#             calc_log.append("total из subtotal и vat")

#     # 5. price
#     if price.is_zero():
#         if not subtotal.is_zero() and not quantity.is_zero():
#             price = (subtotal / quantity).quantize(Decimal("1.0000"))
#             calc_log.append("price из subtotal и quantity")
#         elif not total.is_zero() and not quantity.is_zero() and not vat_percent.is_zero():
#             price = ((total / (Decimal("1") + vat_percent / Decimal("100"))) / quantity).quantize(Decimal("1.0000"))
#             calc_log.append("price из total, vat_percent, quantity")

#     # 6. quantity
#     if quantity.is_zero():
#         if not subtotal.is_zero() and not price.is_zero():
#             quantity = (subtotal / price).quantize(Decimal("1.0000"))
#             calc_log.append("quantity из subtotal и price")
#         elif not total.is_zero() and not price.is_zero() and not vat_percent.is_zero():
#             quantity = ((total / (Decimal("1") + vat_percent / Decimal("100"))) / price).quantize(Decimal("1.0000"))
#             calc_log.append("quantity из total, vat_percent, price")

#     # 7. quantity и price по умолчанию, если остались пустыми
#     if quantity.is_zero():
#         quantity = Decimal("1.0000")
#         calc_log.append("quantity по умолчанию 1.0000")

#     if price.is_zero() and not subtotal.is_zero():
#         price = subtotal
#         calc_log.append("price по умолчанию = subtotal")

#     logger.info(
#         f"[validate_line] POSLE OBRABOTKI: quantity={quantity}, price={price}, subtotal={subtotal}, "
#         f"vat={vat}, vat_percent={vat_percent}, total={total}"
#     )
#     logger.info(f"[validate_line] CALC_LOG: {calc_log}")

#     item["quantity"] = quantity
#     item["price"] = price
#     item["subtotal"] = subtotal
#     item["vat"] = vat
#     item["vat_percent"] = vat_percent
#     item["total"] = total
#     item["_lineitem_calc_log"] = calc_log
#     return item


# def global_validate_and_correct(doc_struct):
#     """
#     Глобальная валидация и коррекция документа и lineitems:
#     - Сравнивает суммы между lineitems и документом,
#     - Корректирует vat_percent и vat в lineitems,
#     - Ставит флаги успешности, ведёт подробный лог.
#     """
#     logs = []  # Для накопления этапных логов
#     doc_changed = False

#     doc_struct["_subtotal_replaced"] = False
#     doc_struct["_vat_replaced"] = False
#     doc_struct["_total_replaced"] = False

#     line_items = doc_struct.get("line_items", [])
#     if not line_items:
#         logs.append("Нет line_items для проверки.")
#         doc_struct["_global_validation_log"] = logs
#         return doc_struct

#     # 1. Проверяем subtotal
#     sum_subtotal = sum(Decimal(str(item.get("subtotal") or "0")) for item in line_items)
#     doc_subtotal = Decimal(str(doc_struct.get("amount_wo_vat") or "0"))
#     diff_subtotal = (sum_subtotal - doc_subtotal).quantize(Decimal("1.0000"))
#     logs.append(f"Subtotal: lineitems={sum_subtotal}, doc={doc_subtotal}, diff={diff_subtotal}")
#     if abs(diff_subtotal) > Decimal("0.05"):
#         logs.append(f"❗Subtotal не совпадает. Заменяем subtotal документа на сумму по lineitems.")
#         doc_struct["amount_wo_vat"] = sum_subtotal
#         doc_struct["_subtotal_replaced"] = True   # ← ДОБАВЬ
#         doc_changed = True
#     else:
#         logs.append("✔ Subtotal совпадает или незначительно отличается.")

#     # 2. Проверяем vat_percent во всех lineitems (если не separate_vat)
#     vat_percent_doc = doc_struct.get("vat_percent")
#     if not doc_struct.get("separate_vat", False) and vat_percent_doc not in [None, "", 0, "0"]:
#         vat_percent_doc = Decimal(str(vat_percent_doc))
#         n_updated = 0
#         for item in line_items:
#             vp = Decimal(str(item.get("vat_percent") or "0"))
#             if vp != vat_percent_doc:
#                 item["vat_percent"] = vat_percent_doc
#                 n_updated += 1
#         if n_updated > 0:
#             logs.append(f"Обновили vat_percent в {n_updated} lineitems до {vat_percent_doc}")
#         else:
#             logs.append("✔ Все vat_percent в lineitems уже совпадают с документом.")
#     else:
#         logs.append("skip vat_percent sync (separate_vat=True или нет vat_percent в документе)")

#     # 3. Пересчитываем vat для всех lineitems по формуле (subtotal * vat_percent / 100)
#     n_vat_recalculated = 0
#     for item in line_items:
#         subtotal = Decimal(str(item.get("subtotal") or "0"))
#         vat_percent = Decimal(str(item.get("vat_percent") or "0"))
#         vat_new = (subtotal * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
#         old_vat = Decimal(str(item.get("vat") or "0"))
#         if abs(old_vat - vat_new) > Decimal("0.01"):
#             logs.append(f"Пересчитываем vat: было {old_vat} → стало {vat_new} (subtotal={subtotal}, vat_percent={vat_percent})")
#             item["vat"] = vat_new
#             n_vat_recalculated += 1
#     if n_vat_recalculated == 0:
#         logs.append("✔ Все vat в lineitems актуальны.")
#     else:
#         logs.append(f"Обновлено vat в {n_vat_recalculated} lineitems.")

#     # 4. Проверяем общую сумму vat
#     sum_vat = sum(Decimal(str(item.get("vat") or "0")) for item in line_items)
#     doc_vat = Decimal(str(doc_struct.get("vat_amount") or "0"))
#     diff_vat = (sum_vat - doc_vat).quantize(Decimal("1.0000"))
#     logs.append(f"VAT: lineitems={sum_vat}, doc={doc_vat}, diff={diff_vat}")
#     if abs(diff_vat) > Decimal("0.05"):
#         logs.append(f"❗VAT документа не совпадает с суммой lineitems. Заменяем vat_amount документа на сумму по lineitems.")
#         doc_struct["vat_amount"] = sum_vat
#         doc_struct["_vat_replaced"] = True       # ← ДОБАВЬ
#         doc_changed = True
#     else:
#         logs.append("✔ VAT совпадает или незначительно отличается.")

#     # 5. Пересчитываем total для всех lineitems (subtotal + vat)
#     n_total_recalculated = 0
#     for item in line_items:
#         subtotal = Decimal(str(item.get("subtotal") or "0"))
#         vat = Decimal(str(item.get("vat") or "0"))
#         total_new = (subtotal + vat).quantize(Decimal("1.0000"))
#         old_total = Decimal(str(item.get("total") or "0"))
#         if abs(old_total - total_new) > Decimal("0.01"):
#             logs.append(f"Пересчитываем total: было {old_total} → стало {total_new} (subtotal={subtotal}, vat={vat})")
#             item["total"] = total_new
#             n_total_recalculated += 1
#     if n_total_recalculated == 0:
#         logs.append("✔ Все total в lineitems актуальны.")
#     else:
#         logs.append(f"Обновлено total в {n_total_recalculated} lineitems.")

#     # 6. Проверяем общую сумму total
#     sum_total = sum(Decimal(str(item.get("total") or "0")) for item in line_items)
#     doc_total = Decimal(str(doc_struct.get("amount_with_vat") or "0"))
#     diff_total = (sum_total - doc_total).quantize(Decimal("1.0000"))
#     logs.append(f"Total: lineitems={sum_total}, doc={doc_total}, diff={diff_total}")
#     if abs(diff_total) > Decimal("0.05"):
#         logs.append(f"❗Total документа не совпадает с суммой lineitems. Заменяем amount_with_vat документа на сумму по lineitems.")
#         doc_struct["amount_with_vat"] = sum_total
#         doc_struct["_total_replaced"] = True     # ← ДОБАВЬ
#         doc_changed = True
#     else:
#         logs.append("✔ Total совпадает или незначительно отличается.")

#     # 7. Финальный статус
#     if doc_changed:
#         logs.append("Документ был скорректирован для соответствия lineitems.")
#     else:
#         logs.append("Документ уже был согласован с lineitems.")

#     # Флаг для повторной обработки
#     doc_struct["_doc_totals_replaced_by_lineitems"] = bool(doc_changed)        

#     doc_struct["_global_validation_log"] = logs
#     logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
#     return doc_struct


# def compare_lineitems_with_main_totals(doc_struct):
#     """
#     Сверка сумм по строкам с основными суммами документа.
#     Теперь сравниваем amount_wo_vat с Σ(effective_base), где
#     effective_base = max(subtotal - discount_wo_vat, 0).
#     Допуск: 0.0500.
#     """
#     TOL = Decimal("0.0500")

#     def to_d(x, places=4):
#         if x is None or x == "" or str(x).lower() == "null":
#             return Decimal("0.0000") if places == 4 else Decimal("0.00")
#         try:
#             return Decimal(str(x)).quantize(Decimal("1." + "0"*places), rounding=ROUND_HALF_UP)
#         except Exception:
#             return Decimal("0.0000") if places == 4 else Decimal("0.00")

#     items = doc_struct.get("line_items", []) or []

#     # Суммы по строкам
#     sum_effective = Decimal("0.0000")
#     sum_vat = Decimal("0.0000")
#     sum_total = Decimal("0.0000")

#     for it in items:
#         subtotal = to_d(it.get("subtotal"), 4)
#         disc_wo = to_d(it.get("discount_wo_vat"), 4)
#         vat = to_d(it.get("vat"), 4)
#         total = to_d(it.get("total"), 4)

#         eff = subtotal - disc_wo
#         if eff < Decimal("0"):
#             eff = Decimal("0.0000")
#         eff = eff.quantize(Decimal("1.0000"))

#         sum_effective += eff
#         sum_vat += vat
#         sum_total += total

#     main_wo = to_d(doc_struct.get("amount_wo_vat"), 4)
#     main_vat = to_d(doc_struct.get("vat_amount"), 4)
#     main_tot = to_d(doc_struct.get("amount_with_vat"), 4)

#     result = {
#         "subtotal_match": abs(sum_effective - main_wo) <= TOL,
#         "vat_match": abs(sum_vat - main_vat) <= TOL,
#         "total_match": abs(sum_total - main_tot) <= TOL,
#         "subtotal_diff": (sum_effective - main_wo).quantize(Decimal("1.0000")),
#         "vat_diff": (sum_vat - main_vat).quantize(Decimal("1.0000")),
#         "total_diff": (sum_total - main_tot).quantize(Decimal("1.0000")),
#         "line_sum_effective_wo_vat": sum_effective.quantize(Decimal("1.0000")),
#         "line_sum_vat": sum_vat.quantize(Decimal("1.0000")),
#         "line_sum_with_vat": sum_total.quantize(Decimal("1.0000")),
#         "main_wo_vat": main_wo.quantize(Decimal("1.0000")),
#         "main_vat": main_vat.quantize(Decimal("1.0000")),
#         "main_with_vat": main_tot.quantize(Decimal("1.0000")),
#     }

#     logger.info(f"[compare_lineitems] RESULT: {result}")
#     return result



# def compare_lineitems_with_main_totals(doc_struct):
#     """
#     Проверяет, совпадают ли суммы по line_items с основными суммами документа.
#     Возвращает dict с флагами совпадения и разницей по каждому полю.
#     """

#     def to_decimal_inner(x, places=4):
#         if x is None or x == "" or str(x).lower() == "null":
#             return Decimal("0.0000")
#         try:
#             return Decimal(str(x)).quantize(Decimal("1." + "0" * places), rounding=ROUND_HALF_UP)
#         except Exception as e:
#             logger.info(f"[to_decimal compare] EXCEPTION: {e} (input={x})")
#             return Decimal("0.0000")

#     line_items = doc_struct.get("line_items", [])
#     if not line_items:
#         line_items = []

#     sum_wo_vat = sum(to_decimal_inner(item.get("subtotal"), 4) for item in line_items)
#     sum_vat = sum(to_decimal_inner(item.get("vat"), 4) for item in line_items)
#     sum_with_vat = sum(to_decimal_inner(item.get("total"), 4) for item in line_items)

#     amount_wo_vat = to_decimal_inner(doc_struct.get("amount_wo_vat"), 4)
#     vat_amount = to_decimal_inner(doc_struct.get("vat_amount"), 4)
#     amount_with_vat = to_decimal_inner(doc_struct.get("amount_with_vat"), 4)

#     logger.info(
#         f"[compare_lineitems] SUM_LINE_ITEMS: subtotal={sum_wo_vat}, vat={sum_vat}, total={sum_with_vat}"
#     )
#     logger.info(
#         f"[compare_lineitems] MAIN_TOTALS: amount_wo_vat={amount_wo_vat}, vat_amount={vat_amount}, amount_with_vat={amount_with_vat}"
#     )

#     result = {
#         "subtotal_match": abs(sum_wo_vat - amount_wo_vat) < Decimal("0.0500"),
#         "vat_match": abs(sum_vat - vat_amount) < Decimal("0.0500"),
#         "total_match": abs(sum_with_vat - amount_with_vat) < Decimal("0.0500"),
#         "subtotal_diff": (sum_wo_vat - amount_wo_vat).quantize(Decimal("1.0000")),
#         "vat_diff": (sum_vat - vat_amount).quantize(Decimal("1.0000")),
#         "total_diff": (sum_with_vat - amount_with_vat).quantize(Decimal("1.0000")),
#         "line_sum_wo_vat": sum_wo_vat.quantize(Decimal("1.0000")),
#         "line_sum_vat": sum_vat.quantize(Decimal("1.0000")),
#         "line_sum_with_vat": sum_with_vat.quantize(Decimal("1.0000")),
#         "main_wo_vat": amount_wo_vat.quantize(Decimal("1.0000")),
#         "main_vat": vat_amount.quantize(Decimal("1.0000")),
#         "main_with_vat": amount_with_vat.quantize(Decimal("1.0000")),
#     }

#     logger.info(f"[compare_lineitems] RESULT: {result}")

#     return result















# import logging
# logger = logging.getLogger("docscanner_app.amounts")
# from decimal import Decimal, ROUND_HALF_UP


# def validate_and_calculate_main_amounts(data):
#     """
#     Проверяет и при необходимости вычисляет суммы для суммарного (sumiskai) документа.
#     """

#     def to_decimal(x, places=2):
#         if x is None or x == "" or str(x).lower() == "null":
#             return None
#         try:
#             return Decimal(str(x)).quantize(Decimal("1." + "0" * places), rounding=ROUND_HALF_UP)
#         except (TypeError, ValueError):
#             return None

#     def to_float(x):
#         if x is None or x == "" or str(x).lower() == "null":
#             return None
#         try:
#             return float(x)
#         except (TypeError, ValueError):
#             return None

#     logger.info(f"[validate_main] ISKODNYE: {data}")

#     amount_wo_vat = to_float(data.get("amount_wo_vat"))
#     vat_amount = to_float(data.get("vat_amount"))
#     vat_percent = to_float(data.get("vat_percent"))
#     amount_with_vat = to_float(data.get("amount_with_vat"))

#     logger.info(f"[validate_main] DO OBRABOTKI: amount_wo_vat={amount_wo_vat}, vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}")

#     calc_log = []

#     # 1. amount_wo_vat
#     if amount_wo_vat is None:
#         if amount_with_vat is not None and vat_percent is not None:
#             amount_wo_vat = round(amount_with_vat / (1 + vat_percent / 100), 2)
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_percent")
#         elif amount_with_vat is not None and vat_amount is not None:
#             amount_wo_vat = round(amount_with_vat - vat_amount, 2)
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_amount")

#     # 2. vat_amount
#     if vat_amount is None:
#         if amount_wo_vat is not None and vat_percent is not None:
#             vat_amount = round(amount_wo_vat * vat_percent / 100, 2)
#             calc_log.append("vat_amount из amount_wo_vat и vat_percent")
#         elif amount_with_vat is not None and amount_wo_vat is not None:
#             vat_amount = round(amount_with_vat - amount_wo_vat, 2)
#             calc_log.append("vat_amount из amount_with_vat и amount_wo_vat")

#     # 3. vat_percent
#     if vat_percent is None:
#         if amount_wo_vat and vat_amount is not None and amount_wo_vat != 0:
#             vat_percent = round(vat_amount / amount_wo_vat * 100, 2)
#             calc_log.append("vat_percent из vat_amount и amount_wo_vat")
#         elif amount_wo_vat and amount_with_vat and amount_wo_vat != 0:
#             vat_percent = round((amount_with_vat / amount_wo_vat - 1) * 100, 2)
#             calc_log.append("vat_percent из amount_with_vat и amount_wo_vat")

#     # 4. amount_with_vat
#     if amount_with_vat is None:
#         if amount_wo_vat is not None and vat_percent is not None:
#             amount_with_vat = round(amount_wo_vat * (1 + vat_percent / 100), 2)
#             calc_log.append("amount_with_vat из amount_wo_vat и vat_percent")
#         elif amount_wo_vat is not None and vat_amount is not None:
#             amount_with_vat = round(amount_wo_vat + vat_amount, 2)
#             calc_log.append("amount_with_vat из amount_wo_vat и vat_amount")

#     logger.info(f"[validate_main] POSLE OBRABOTKI: amount_wo_vat={amount_wo_vat}, vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}")
#     logger.info(f"[validate_main] CALC_LOG: {calc_log}")

#     # Вернуть обратно
#     data["amount_wo_vat"] = None if amount_wo_vat is None else round(amount_wo_vat, 2)
#     data["vat_amount"] = None if vat_amount is None else round(vat_amount, 2)
#     data["vat_percent"] = None if vat_percent is None else round(vat_percent, 2)
#     data["amount_with_vat"] = None if amount_with_vat is None else round(amount_with_vat, 2)
#     data["_main_amounts_calc_log"] = calc_log

#     return data



# def validate_and_calculate_lineitem_amounts(item):
#     def to_float(x):
#         if x is None or x == "" or str(x).lower() == "null":
#             return None
#         try:
#             return float(x)
#         except (TypeError, ValueError):
#             return None

#     logger.info(f"[validate_line] ISKODNYE: {item}")

#     calc_log = []

#     quantity = to_float(item.get("quantity"))
#     price = to_float(item.get("price"))
#     subtotal = to_float(item.get("subtotal"))
#     vat = to_float(item.get("vat"))
#     vat_percent = to_float(item.get("vat_percent"))
#     total = to_float(item.get("total"))

#     # 1. subtotal
#     if subtotal is None:
#         if quantity is not None and price is not None:
#             subtotal = round(quantity * price, 2)
#             calc_log.append("subtotal из quantity и price")
#         elif total is not None and vat_percent is not None:
#             subtotal = round(total / (1 + vat_percent / 100), 2)
#             calc_log.append("subtotal из total и vat_percent")
#         elif total is not None and vat is not None:
#             subtotal = round(total - vat, 2)
#             calc_log.append("subtotal из total и vat")

#     # 2. vat
#     if vat is None:
#         if subtotal is not None and vat_percent is not None:
#             vat = round(subtotal * vat_percent / 100, 2)
#             calc_log.append("vat из subtotal и vat_percent")
#         elif total is not None and subtotal is not None:
#             vat = round(total - subtotal, 2)
#             calc_log.append("vat из total и subtotal")

#     # 3. vat_percent
#     if vat_percent is None:
#         if vat is not None and subtotal and subtotal != 0:
#             vat_percent = round(vat / subtotal * 100, 2)
#             calc_log.append("vat_percent из vat и subtotal")
#         elif total is not None and subtotal and subtotal != 0:
#             vat_percent = round((total / subtotal - 1) * 100, 2)
#             calc_log.append("vat_percent из total и subtotal")

#     # 4. total
#     if total is None:
#         if subtotal is not None and vat_percent is not None:
#             total = round(subtotal * (1 + vat_percent / 100), 2)
#             calc_log.append("total из subtotal и vat_percent")
#         elif subtotal is not None and vat is not None:
#             total = round(subtotal + vat, 2)
#             calc_log.append("total из subtotal и vat")

#     # 5. price
#     if price is None:
#         if subtotal is not None and quantity and quantity != 0:
#             price = round(subtotal / quantity, 4)
#             calc_log.append("price из subtotal и quantity")
#         elif total is not None and quantity and quantity != 0 and vat_percent is not None:
#             price = round((total / (1 + vat_percent / 100)) / quantity, 4)
#             calc_log.append("price из total, vat_percent, quantity")

#     # 6. quantity
#     if quantity is None:
#         if subtotal is not None and price and price != 0:
#             quantity = round(subtotal / price, 2)
#             calc_log.append("quantity из subtotal и price")
#         elif total is not None and price and price != 0 and vat_percent is not None:
#             quantity = round((total / (1 + vat_percent / 100)) / price, 2)
#             calc_log.append("quantity из total, vat_percent, price")

#     # 7. quantity и price по умолчанию, если остались пустыми
#     if quantity is None:
#         quantity = 1
#         calc_log.append("quantity по умолчанию 1")

#     if price is None and subtotal is not None:
#         price = subtotal
#         calc_log.append("price по умолчанию = subtotal")
        

#     logger.info(f"[validate_line] POSLE OBRABOTKI: quantity={quantity}, price={price}, subtotal={subtotal}, vat={vat}, vat_percent={vat_percent}, total={total}")
#     logger.info(f"[validate_line] CALC_LOG: {calc_log}")

#     # Собираем результат обратно (или None, если не удалось вычислить)
#     item["quantity"] = None if quantity is None else round(quantity, 2)
#     item["price"] = None if price is None else round(price, 4)
#     item["subtotal"] = None if subtotal is None else round(subtotal, 2)
#     item["vat"] = None if vat is None else round(vat, 2)
#     item["vat_percent"] = None if vat_percent is None else round(vat_percent, 2)
#     item["total"] = None if total is None else round(total, 2)
#     item["_lineitem_calc_log"] = calc_log
#     return item


# def compare_lineitems_with_main_totals(doc_struct):
#     """
#     Проверяет, совпадают ли суммы по line_items с основными суммами документа.
#     Возвращает dict с флагами совпадения и разницей по каждому полю.
#     """
#     def to_float(x):
#         if x is None or x == "" or str(x).lower() == "null":
#             return 0.0
#         try:
#             return float(x)
#         except (TypeError, ValueError):
#             return 0.0

#     line_items = doc_struct.get("line_items", [])

#     sum_wo_vat = sum(to_float(item.get("subtotal")) for item in line_items)
#     sum_vat = sum(to_float(item.get("vat")) for item in line_items)
#     sum_with_vat = sum(to_float(item.get("total")) for item in line_items)

#     amount_wo_vat = to_float(doc_struct.get("amount_wo_vat"))
#     vat_amount = to_float(doc_struct.get("vat_amount"))
#     amount_with_vat = to_float(doc_struct.get("amount_with_vat"))

#     logger.info(f"[compare_lineitems] SUM_LINE_ITEMS: subtotal={sum_wo_vat}, vat={sum_vat}, total={sum_with_vat}")
#     logger.info(f"[compare_lineitems] MAIN_TOTALS: amount_wo_vat={amount_wo_vat}, vat_amount={vat_amount}, amount_with_vat={amount_with_vat}")

#     result = {
#         "subtotal_match": abs(sum_wo_vat - amount_wo_vat) < 0.05,
#         "vat_match": abs(sum_vat - vat_amount) < 0.05,
#         "total_match": abs(sum_with_vat - amount_with_vat) < 0.05,
#         "subtotal_diff": round(sum_wo_vat - amount_wo_vat, 2),
#         "vat_diff": round(sum_vat - vat_amount, 2),
#         "total_diff": round(sum_with_vat - amount_with_vat, 2),
#         "line_sum_wo_vat": round(sum_wo_vat, 2),
#         "line_sum_vat": round(sum_vat, 2),
#         "line_sum_with_vat": round(sum_with_vat, 2),
#         "main_wo_vat": round(amount_wo_vat, 2),
#         "main_vat": round(vat_amount, 2),
#         "main_with_vat": round(amount_with_vat, 2),
#     }

#     logger.info(f"[compare_lineitems] RESULT: {result}")

#     return result




