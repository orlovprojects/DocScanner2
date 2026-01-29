#kod nenuznyj jesle vsio rabotajet. Mozno udalit celyj fail!





# import logging
# from decimal import Decimal, ROUND_HALF_UP
# from typing import Dict, Any, List, Tuple

# logger = logging.getLogger("docscanner_app")

# # =============================================================
# # МОДУЛЬ ВАЛИДАЦИИ/НОРМАЛИЗАЦИИ ДАННЫХ ДОКУМЕНТА (v3)
# # -------------------------------------------------------------
# # Изменения v3:
# # - Добавлена константа AGGREGATE_TOLERANCE = 0.20
# # - Функция _deduce_missing_document_discounts теперь НЕ кладёт
# #   дельту в скидку если она <= 0.20
# # - При fix_delta=True подгоняет суммы документа под строки
# # - При fix_delta=False просто пропускает (не создаёт фейковую скидку)
# # =============================================================

# # -----------------
# # Утилиты/константы
# # -----------------

# AGGREGATE_TOLERANCE = Decimal("0.20")  # максимальная дельта для подгонки (не скидка)

# REASON = {
#     "OK": "Итоги согласованы",
#     "DOC_MISSING_FIELDS_FILLED": "Заполнены недостающие поля документа",
#     "LINE_VAT_DERIVED_FROM_DOC": "НДС строк выведен из ставки документа",
#     "DOUBLE_DISCOUNT_NET": "Двойное вычитание net-скидки устранено",
#     "GROSS_DISCOUNT_DETECTED": "Обнаружена скидка с НДС (gross)",
#     "PRICE_ALREADY_NET": "Цена/сабтотал уже нетто, скидка не вычитается повторно",
#     "ROUNDING_REALLOCATION": "Перераспределены копейки округления",
#     "DOC_TOTALS_INCONSISTENT": "Итоги документа противоречат суммам строк",
#     "DOC_TOTALS_ADJUSTED": "Итоги документа подогнаны под суммы строк",
#     "MIXED_VAT_RATES_NEED_SEPARATE_VAT": "Смешанные ставки, требуется separate_vat",
#     "NEEDS_MANUAL_REVIEW": "Требуется ручная проверка",
#     "DOC_DISCOUNT_DUPLICATES_LINE_DISCOUNTS": "Скидка документа дублирует суммарные строковые",
# }


# def dynamic_tol(amount_with_vat: Decimal) -> Decimal:
#     """Динамический допуск для сверок: max(0.02, min(0.5, total * 0.0005))."""
#     try:
#         base = (amount_with_vat or Decimal("0")) * Decimal("0.0005")
#         return max(Decimal("0.02"), min(Decimal("0.50"), base.quantize(Decimal("1.00"), rounding=ROUND_HALF_UP)))
#     except Exception:
#         return Decimal("0.05")


# # ===============================
# # Утилиты
# # ===============================

# def to_decimal(x, places=4) -> Decimal:
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


# def _is_fix_delta_enabled(customer_user) -> bool:
#     """
#     Проверяет, включена ли опция fix_delta в extra_settings пользователя.
#     """
#     if customer_user is None:
#         return False
    
#     extra_settings = getattr(customer_user, "extra_settings", None)
#     if extra_settings is None:
#         return False
    
#     if isinstance(extra_settings, dict):
#         return extra_settings.get("fix_delta") == 1
    
#     return False


# # ===============================
# # Дубликаты скидок документа vs строк
# # ===============================

# def dedupe_document_discounts(doc_struct: Dict[str, Any], tol: Decimal = Decimal("0.05")) -> Dict[str, Any]:
#     """
#     Назначение: если сумма скидок по строкам ≈ документной скидке, уменьшаем
#     документную скидку на эту сумму (не даём двойного вычитания).
#     """
#     items = doc_struct.get("line_items") or []

#     def d(x, p=4):
#         try:
#             return Decimal(str(x)).quantize(Decimal("1." + "0" * p))
#         except Exception:
#             return Decimal("0.0000") if p == 4 else Decimal("0.00")

#     sum_line_disc_wo = sum(d(it.get("discount_wo_vat"), 4) for it in items)
#     sum_line_disc_with = sum(d(it.get("discount_with_vat"), 4) for it in items)

#     inv_disc_wo = d(doc_struct.get("invoice_discount_wo_vat"), 4)
#     inv_disc_with = d(doc_struct.get("invoice_discount_with_vat"), 4)

#     # Без НДС
#     if inv_disc_wo > 0 and sum_line_disc_wo > 0:
#         new_wo = inv_disc_wo - sum_line_disc_wo
#         if abs(new_wo) <= tol or new_wo < 0:
#             new_wo = Decimal("0.0000")
#         if new_wo != inv_disc_wo:
#             logger.info(f"[dedupe] invoice_discount_wo_vat {inv_disc_wo} → {new_wo} (line discounts={sum_line_disc_wo})")
#             doc_struct["invoice_discount_wo_vat"] = new_wo
#             doc_struct["_dedup_invoice_discount_wo_vat"] = True
#             doc_struct.setdefault("_global_validation_log", []).append(REASON["DOC_DISCOUNT_DUPLICATES_LINE_DISCOUNTS"])

#     # С НДС
#     if inv_disc_with > 0 and sum_line_disc_with > 0:
#         new_with = inv_disc_with - sum_line_disc_with
#         if abs(new_with) <= tol or new_with < 0:
#             new_with = Decimal("0.0000")
#         if new_with != inv_disc_with:
#             logger.info(f"[dedupe] invoice_discount_with_vat {inv_disc_with} → {new_with} (line discounts with VAT={sum_line_disc_with})")
#             doc_struct["invoice_discount_with_vat"] = new_with
#             doc_struct["_dedup_invoice_discount_with_vat"] = True
#             doc_struct.setdefault("_global_validation_log", []).append(REASON["DOC_DISCOUNT_DUPLICATES_LINE_DISCOUNTS"])

#     # Защита: при doc.vat_amount==0 не плодим with_vat-скидку
#     doc_vat = d(doc_struct.get("vat_amount"), 4)
#     if doc_vat == 0:
#         sum_total = sum(d(it.get("total"), 4) for it in items)
#         doc_total = d(doc_struct.get("amount_with_vat"), 4)
#         if inv_disc_with > 0 and abs(doc_total - sum_total) <= tol:
#             logger.info("[dedupe] VAT=0 и totals сходятся → invoice_discount_with_vat = 0")
#             doc_struct["invoice_discount_with_vat"] = Decimal("0.0000")
#             doc_struct["_dedup_invoice_discount_with_vat"] = True

#     return doc_struct


# # ===============================
# # Восстановление недостающих скидок документа (v3)
# # ===============================

# def _deduce_missing_document_discounts(
#     doc_struct: Dict[str, Any],
#     sum_subtotal: Decimal,
#     sum_total: Decimal,
#     tol: Decimal = Decimal("0.05"),
#     fix_delta: bool = False,
# ) -> Tuple[Decimal, Decimal]:
#     """
#     Пытаемся восстановить отсутствующие скидки документа из итогов.
    
#     ЛОГИКА v3:
#     - Если дельта <= AGGREGATE_TOLERANCE (0.20):
#       - fix_delta=True → подгоняем суммы документа под строки
#       - fix_delta=False → пропускаем (не создаём фейковую скидку)
#     - Если дельта > AGGREGATE_TOLERANCE → это реальная скидка, создаём invoice_discount_*
    
#     Возвращает (inv_disc_wo, inv_disc_with).
#     """
#     inv_disc_wo = to_decimal(doc_struct.get("invoice_discount_wo_vat"), 4)
#     inv_disc_with = to_decimal(doc_struct.get("invoice_discount_with_vat"), 4)

#     doc_wo = to_decimal(doc_struct.get("amount_wo_vat"), 4)
#     doc_tot = to_decimal(doc_struct.get("amount_with_vat"), 4)
#     doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)
    
#     items = doc_struct.get("line_items") or []
#     sum_vat = sum(to_decimal(it.get("vat"), 4) for it in items)
#     sum_line_disc_wo = sum(to_decimal(it.get("discount_wo_vat"), 4) for it in items)

#     adjustments_made = []

#     # 1) WO: строки > документа (sum_subtotal > doc_wo)
#     if inv_disc_wo.is_zero() and doc_wo < sum_subtotal:
#         diff_wo = (sum_subtotal - doc_wo).quantize(Decimal("1.0000"))
        
#         # Если разница покрывается строковыми скидками — не создаём doc скидку
#         if abs(diff_wo - sum_line_disc_wo) <= tol:
#             logger.info(f"[deduce] diff_wo≈line_discounts ({diff_wo}≈{sum_line_disc_wo}) → doc WO скидку не создаём")
        
#         # Дельта маленькая (<=0.20) — подгоняем или пропускаем
#         elif diff_wo <= AGGREGATE_TOLERANCE:
#             if fix_delta:
#                 old_val = doc_wo
#                 doc_struct["amount_wo_vat"] = sum_subtotal
#                 adjustments_made.append(f"amount_wo_vat: {old_val} → {sum_subtotal} (Δ={diff_wo})")
#                 logger.info(f"[deduce] diff_wo={diff_wo} <= {AGGREGATE_TOLERANCE} → подгоняем amount_wo_vat: {old_val} → {sum_subtotal}")
#             else:
#                 logger.info(f"[deduce] diff_wo={diff_wo} <= {AGGREGATE_TOLERANCE} → пропускаем (fix_delta=False)")
        
#         # Дельта большая — это реальная скидка
#         elif Decimal("0.0000") < diff_wo <= sum_subtotal:
#             inv_disc_wo = diff_wo
#             doc_struct["invoice_discount_wo_vat"] = inv_disc_wo
#             logger.info(f"[deduce] invoice_discount_wo_vat <- {inv_disc_wo} (реальная скидка, diff > {AGGREGATE_TOLERANCE})")

#     # 2) VAT: строки ≠ документа
#     if fix_delta and sum_vat != doc_vat:
#         diff_vat = (sum_vat - doc_vat).copy_abs()
#         if diff_vat <= AGGREGATE_TOLERANCE:
#             old_val = doc_vat
#             doc_struct["vat_amount"] = sum_vat
#             adjustments_made.append(f"vat_amount: {old_val} → {sum_vat} (Δ={diff_vat})")
#             logger.info(f"[deduce] diff_vat={diff_vat} <= {AGGREGATE_TOLERANCE} → подгоняем vat_amount: {old_val} → {sum_vat}")

#     # 3) WITH: строки > документа (sum_total > doc_tot)
#     if inv_disc_with.is_zero() and doc_tot < sum_total:
#         diff_with = (sum_total - doc_tot).quantize(Decimal("1.0000"))
        
#         # Дельта маленькая (<=0.20) — подгоняем или пропускаем
#         if diff_with <= AGGREGATE_TOLERANCE:
#             if fix_delta:
#                 old_val = doc_tot
#                 doc_struct["amount_with_vat"] = sum_total
#                 adjustments_made.append(f"amount_with_vat: {old_val} → {sum_total} (Δ={diff_with})")
#                 logger.info(f"[deduce] diff_with={diff_with} <= {AGGREGATE_TOLERANCE} → подгоняем amount_with_vat: {old_val} → {sum_total}")
#             else:
#                 logger.info(f"[deduce] diff_with={diff_with} <= {AGGREGATE_TOLERANCE} → пропускаем (fix_delta=False)")
        
#         # Дельта большая — реальная скидка
#         elif Decimal("0.0000") < diff_with <= sum_total:
#             inv_disc_with = diff_with
#             doc_struct["invoice_discount_with_vat"] = inv_disc_with
#             logger.info(f"[deduce] invoice_discount_with_vat <- {inv_disc_with} (реальная скидка, diff > {AGGREGATE_TOLERANCE})")

#     # 4) Обратный случай: документ > строк (doc_wo > sum_subtotal)
#     # Тоже подгоняем если дельта маленькая
#     if fix_delta and doc_wo > sum_subtotal:
#         diff_wo = (doc_wo - sum_subtotal).quantize(Decimal("1.0000"))
#         if diff_wo <= AGGREGATE_TOLERANCE:
#             old_val = doc_wo
#             doc_struct["amount_wo_vat"] = sum_subtotal
#             adjustments_made.append(f"amount_wo_vat: {old_val} → {sum_subtotal} (Δ=-{diff_wo})")
#             logger.info(f"[deduce] doc_wo > sum_subtotal, diff={diff_wo} <= {AGGREGATE_TOLERANCE} → подгоняем: {old_val} → {sum_subtotal}")

#     if fix_delta and doc_tot > sum_total:
#         diff_with = (doc_tot - sum_total).quantize(Decimal("1.0000"))
#         if diff_with <= AGGREGATE_TOLERANCE:
#             old_val = doc_tot
#             doc_struct["amount_with_vat"] = sum_total
#             adjustments_made.append(f"amount_with_vat: {old_val} → {sum_total} (Δ=-{diff_with})")
#             logger.info(f"[deduce] doc_tot > sum_total, diff={diff_with} <= {AGGREGATE_TOLERANCE} → подгоняем: {old_val} → {sum_total}")

#     # 5) VAT=0 → with_vat скидка = wo_vat скидка
#     if sum_vat == Decimal("0.0000") and doc_vat == Decimal("0.0000"):
#         if inv_disc_with.is_zero() and not inv_disc_wo.is_zero():
#             inv_disc_with = inv_disc_wo
#             doc_struct["invoice_discount_with_vat"] = inv_disc_with
#             logger.info("[deduce] VAT=0 → invoice_discount_with_vat = invoice_discount_wo_vat")

#     # Логируем все подгонки
#     if adjustments_made:
#         doc_struct.setdefault("_global_validation_log", []).append(
#             f"doc totals adjusted (fix_delta=True): {'; '.join(adjustments_made)}"
#         )
#         doc_struct["_doc_totals_adjusted"] = True

#     return inv_disc_wo, inv_disc_with


# # ===============================
# # Нужно ли нормализовать строки
# # ===============================

# def should_normalize_lineitems(doc_struct: Dict[str, Any], fix_delta: bool = False) -> bool:
#     """
#     Возвращает True, если line_items нужно пересчитать (суммы не сходятся),
#     и False, если всё согласовано (пересчёт не требуется).
#     """
#     items = doc_struct.get("line_items", []) or []
#     sum_subtotal = sum(to_decimal(it.get("subtotal"), 4) for it in items)
#     sum_vat = sum(to_decimal(it.get("vat"), 4) for it in items)
#     sum_total = sum(to_decimal(it.get("total"), 4) for it in items)

#     inv_disc_wo, inv_disc_with = _deduce_missing_document_discounts(
#         doc_struct, sum_subtotal, sum_total, fix_delta=fix_delta
#     )

#     doc_wo = to_decimal(doc_struct.get("amount_wo_vat"), 4)
#     doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)
#     doc_tot = to_decimal(doc_struct.get("amount_with_vat"), 4)
#     vat_percent_doc = to_decimal(doc_struct.get("vat_percent"), 2)

#     eff_sum_vat = sum_vat
#     if not vat_percent_doc.is_zero() and not inv_disc_wo.is_zero():
#         eff_sum_vat = (sum_vat - (inv_disc_wo * vat_percent_doc / Decimal("100"))).quantize(Decimal("1.0000"))
#         if eff_sum_vat < Decimal("0.0000"):
#             eff_sum_vat = Decimal("0.0000")

#     tol = dynamic_tol(doc_tot)

#     ok_wo = abs(doc_wo - (sum_subtotal - inv_disc_wo)) < tol
#     ok_vat = abs(doc_vat - eff_sum_vat) < tol
#     ok_tot = abs(doc_tot - (sum_total - inv_disc_with)) < tol

#     logger.info(
#         f"[precheck] line_sums: subtotal={sum_subtotal}, vat={sum_vat}, total={sum_total}; "
#         f"doc_sums: wo={doc_wo}, vat={doc_vat}, with={doc_tot}; "
#         f"doc_discounts: wo={inv_disc_wo}, with={inv_disc_with}; vat%_doc={vat_percent_doc}; "
#         f"eff_sum_vat={eff_sum_vat}; match: wo={ok_wo}, vat={ok_vat}, total={ok_tot}"
#     )

#     return not (ok_wo and ok_vat and ok_tot)


# # ===============================
# # Основные суммы документа (без учёта строк)
# # ===============================

# def validate_and_calculate_main_amounts(data: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Назначение: нормализовать «якоря» документа.
#     """
#     logger.info(f"[validate_main] ISKODNYE: {data}")

#     amount_wo_vat = to_decimal(data.get("amount_wo_vat"), 4)
#     vat_amount = to_decimal(data.get("vat_amount"), 4)
#     vat_percent = to_decimal(data.get("vat_percent"), 2)
#     amount_with_vat = to_decimal(data.get("amount_with_vat"), 4)

#     logger.info(
#         f"[validate_main] DO OBRABOTKI: amount_wo_vat={amount_wo_vat}, "
#         f"vat_amount={vat_amount}, vat_percent={vat_percent}, amount_with_vat={amount_with_vat}"
#     )

#     calc_log: List[str] = []

#     items = data.get("line_items") or []
#     if (
#         not items
#         and not amount_with_vat.is_zero()
#         and amount_wo_vat.is_zero()
#         and vat_amount.is_zero()
#         and vat_percent.is_zero()
#     ):
#         amount_wo_vat = amount_with_vat
#         vat_amount = Decimal("0.0000")
#         vat_percent = Decimal("0.00")
#         calc_log.append("auto: нет line_items и есть только total → wo_vat=with_vat, vat=0, vat%=0")

#     if amount_wo_vat.is_zero():
#         if not amount_with_vat.is_zero() and not vat_percent.is_zero():
#             amount_wo_vat = (amount_with_vat / (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_percent")
#         elif not amount_with_vat.is_zero() and not vat_amount.is_zero():
#             amount_wo_vat = (amount_with_vat - vat_amount).quantize(Decimal("1.0000"))
#             calc_log.append("amount_wo_vat из amount_with_vat и vat_amount")

#     if vat_amount.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_percent.is_zero():
#             vat_amount = (amount_wo_vat * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
#             calc_log.append("vat_amount из amount_wo_vat и vat_percent")
#         elif not amount_with_vat.is_zero() and not amount_wo_vat.is_zero():
#             vat_amount = (amount_with_vat - amount_wo_vat).quantize(Decimal("1.0000"))
#             calc_log.append("vat_amount из amount_with_vat и amount_wo_vat")

#     if vat_percent.is_zero():
#         if not amount_wo_vat.is_zero() and not vat_amount.is_zero():
#             vat_percent = (vat_amount / amount_wo_vat * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из vat_amount и amount_wo_vat")
#         elif not amount_wo_vat.is_zero() and not amount_with_vat.is_zero():
#             vat_percent = ((amount_with_vat / amount_wo_vat - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из amount_with_vat и amount_wo_vat")

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
#     data.setdefault("_main_amounts_calc_log", []).extend(calc_log)
#     return data


# # ===============================
# # Валидация/расчёт строки (line item)
# # ===============================

# def validate_and_calculate_lineitem_amounts(item: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Назначение: привести строку к самосогласованному виду.
#     """
#     logger.info(f"[validate_line] ISKODNYE: {item}")

#     calc_log: List[str] = []

#     quantity = to_decimal(item.get("quantity"), 4)
#     price = to_decimal(item.get("price"), 4)
#     subtotal = to_decimal(item.get("subtotal"), 4)
#     vat = to_decimal(item.get("vat"), 4)
#     vat_percent = to_decimal(item.get("vat_percent"), 2)
#     total = to_decimal(item.get("total"), 4)
#     discount_wo_vat = to_decimal(item.get("discount_wo_vat"), 4)

#     TOL = Decimal("0.02")

#     # Проверка/коррекция SUBTOTAL против price*qty - discount
#     if not price.is_zero() and not quantity.is_zero():
#         expected_subtotal = (price * quantity - discount_wo_vat).quantize(Decimal("1.0000"))
#         if abs(expected_subtotal - subtotal) > TOL:
#             calc_log.append(
#                 f"subtotal ({subtotal}) != price*qty-discount ({expected_subtotal}) — ЗАМЕНЯЕМ"
#             )
#             subtotal = expected_subtotal
#         else:
#             calc_log.append("subtotal совпадает с price*qty-discount — оставляем")
#     else:
#         calc_log.append("нет price или quantity — subtotal оставлен как есть")

#     # 1) VAT (если отсутствует)
#     if vat.is_zero():
#         if not subtotal.is_zero() and not vat_percent.is_zero():
#             vat = (subtotal * vat_percent / Decimal("100")).quantize(Decimal("1.0000"))
#             calc_log.append("vat из subtotal и vat_percent")
#         elif not total.is_zero() and not subtotal.is_zero():
#             v = (total - subtotal).quantize(Decimal("1.0000"))
#             if v < 0:
#                 calc_log.append(f"vat был бы отрицательным ({v}), ставим 0")
#                 vat = Decimal("0.0000")
#             else:
#                 vat = v
#                 calc_log.append("vat из total и subtotal")

#     # 2) VAT% (если отсутствует)
#     if vat_percent.is_zero():
#         if not vat.is_zero() and not subtotal.is_zero():
#             vat_percent = (vat / subtotal * Decimal("100")).quantize(Decimal("1.00"))
#             calc_log.append("vat_percent из vat и subtotal")
#         elif not total.is_zero() and not subtotal.is_zero():
#             if total >= subtotal:
#                 vat_percent = ((total / subtotal - Decimal("1")) * Decimal("100")).quantize(Decimal("1.00"))
#                 calc_log.append("vat_percent из total и subtotal")
#             else:
#                 vat_percent = Decimal("0.00")
#                 calc_log.append("total < subtotal → vat_percent = 0.00")

#     # 3) TOTAL (если отсутствует)
#     if total.is_zero():
#         if not subtotal.is_zero() and not vat_percent.is_zero():
#             total = (subtotal * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Decimal("1.0000"))
#             calc_log.append("total из subtotal и vat_percent")
#         elif not subtotal.is_zero() and not vat.is_zero():
#             total = (subtotal + vat).quantize(Decimal("1.0000"))
#             calc_log.append("total из subtotal и vat")
#         elif not subtotal.is_zero():
#             total = subtotal
#             calc_log.append("total = subtotal (VAT=0 или нет ставки)")

#     # 4) PRICE (если отсутствует)
#     if price.is_zero():
#         if quantity.is_zero():
#             quantity = Decimal("1.0000")
#             calc_log.append("quantity по умолчанию 1.0000")
#         if not subtotal.is_zero():
#             price = (subtotal / quantity).quantize(Decimal("1.0000"))
#             calc_log.append("price из subtotal и quantity")

#     # 5) QUANTITY (если отсутствует)
#     if quantity.is_zero():
#         if not subtotal.is_zero() and not price.is_zero():
#             quantity = (subtotal / price).quantize(Decimal("1.0000"))
#             calc_log.append("quantity из subtotal и price")
#         else:
#             quantity = Decimal("1.0000")
#             calc_log.append("quantity по умолчанию 1.0000")

#     # 6) Доп. страхующая доуточнёнка
#     if price.is_zero() and not subtotal.is_zero() and not quantity.is_zero():
#         price = (subtotal / quantity).quantize(Decimal("1.0000"))
#         calc_log.append("price доуточнён из subtotal/quantity")

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
#     item.setdefault("_lineitem_calc_log", []).extend(calc_log)
#     return item


# # ===============================
# # Глобальная валидация документа (v3)
# # ===============================

# def global_validate_and_correct(doc_struct: Dict[str, Any], customer_user=None) -> Dict[str, Any]:
#     """
#     Назначение: сверить документ и строки.
    
#     v3: Если fix_delta=True в extra_settings и дельта <= 0.20:
#         → подгоняем суммы документа под строки
#     """
#     logs: List[str] = []
#     doc_changed = False

#     # Проверяем fix_delta
#     fix_delta = _is_fix_delta_enabled(customer_user)
#     logs.append(f"fix_delta={fix_delta}")

#     doc_struct.setdefault("_subtotal_replaced", False)
#     doc_struct.setdefault("_vat_replaced", False)
#     doc_struct.setdefault("_total_replaced", False)

#     line_items = doc_struct.get("line_items", [])
#     if not line_items:
#         logs.append("Нет line_items для проверки.")
#         doc_struct.setdefault("_global_validation_log", []).extend(logs)
#         doc_struct["ar_sutapo"] = False
#         doc_struct["reason_code"] = "DOC_TOTALS_INCONSISTENT"
#         return doc_struct

#     # Быстрый выход, если всё сходится
#     if not should_normalize_lineitems(doc_struct, fix_delta=fix_delta):
#         logs.append("✔ Суммы line_items уже совпадают с итогами документа. Изменения не требуются.")
#         doc_struct.setdefault("_global_validation_log", []).extend(logs)
#         doc_struct["ar_sutapo"] = True
#         doc_struct["reason_code"] = "OK"
#         logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
#         return doc_struct

#     # 1) Суммы по строкам
#     sum_subtotal = sum(Decimal(str(item.get("subtotal") or "0")) for item in line_items)
#     sum_vat = sum(Decimal(str(item.get("vat") or "0")) for item in line_items)
#     sum_total = sum(Decimal(str(item.get("total") or "0")) for item in line_items)

#     # 2) Скидки документа (с возможной подгонкой если fix_delta=True)
#     inv_disc_wo, inv_disc_with = _deduce_missing_document_discounts(
#         doc_struct, sum_subtotal, sum_total, fix_delta=fix_delta
#     )
#     vat_percent_doc = to_decimal(doc_struct.get("vat_percent"), 2)

#     # Проверяем, была ли уже выполнена подгонка
#     if doc_struct.get("_doc_totals_adjusted"):
#         logs.append("✔ Суммы документа подогнаны под строки (fix_delta=True).")
#         doc_struct.setdefault("_global_validation_log", []).extend(logs)
#         doc_struct["ar_sutapo"] = True
#         doc_struct["reason_code"] = "DOC_TOTALS_ADJUSTED"
#         logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
#         return doc_struct

#     # 3) Эталоны «после скидок» (если есть реальные скидки)
#     eff_doc_wo = (sum_subtotal - inv_disc_wo).quantize(Decimal("1.0000"))
#     if eff_doc_wo < 0:
#         eff_doc_wo = Decimal("0.0000")

#     eff_doc_with = (sum_total - inv_disc_with).quantize(Decimal("1.0000"))
#     if eff_doc_with < 0:
#         eff_doc_with = Decimal("0.0000")

#     eff_vat = sum_vat
#     if not vat_percent_doc.is_zero() and not inv_disc_wo.is_zero():
#         eff_vat = (sum_vat - (inv_disc_wo * vat_percent_doc / Decimal("100"))).quantize(Decimal("1.0000"))
#         if eff_vat < Decimal("0.0000"):
#             eff_vat = Decimal("0.0000")

#     doc_subtotal = to_decimal(doc_struct.get("amount_wo_vat"), 4)
#     doc_vat = to_decimal(doc_struct.get("vat_amount"), 4)
#     doc_total = to_decimal(doc_struct.get("amount_with_vat"), 4)

#     TOL = dynamic_tol(doc_total)

#     diff_subtotal = (eff_doc_wo - doc_subtotal).quantize(Decimal("1.0000"))
#     logs.append(f"Subtotal: эталон={eff_doc_wo}, doc={doc_subtotal}, diff={diff_subtotal}")
#     if abs(diff_subtotal) > TOL:
#         logs.append("❗amount_wo_vat документа отличается. Заменяем.")
#         doc_struct["amount_wo_vat"] = eff_doc_wo
#         doc_struct["_subtotal_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ amount_wo_vat совпадает.")

#     diff_vat = (eff_vat - doc_vat).quantize(Decimal("1.0000"))
#     logs.append(f"VAT: эталон={eff_vat}, doc={doc_vat}, diff={diff_vat}")
#     if abs(diff_vat) > TOL:
#         logs.append("❗vat_amount документа отличается. Заменяем.")
#         doc_struct["vat_amount"] = eff_vat
#         doc_struct["_vat_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ vat_amount совпадает.")

#     diff_total = (eff_doc_with - doc_total).quantize(Decimal("1.0000"))
#     logs.append(f"Total: эталон={eff_doc_with}, doc={doc_total}, diff={diff_total}")
#     if abs(diff_total) > TOL:
#         logs.append("❗amount_with_vat документа отличается. Заменяем.")
#         doc_struct["amount_with_vat"] = eff_doc_with
#         doc_struct["_total_replaced"] = True
#         doc_changed = True
#     else:
#         logs.append("✔ amount_with_vat совпадает.")

#     if doc_changed:
#         logs.append("Документ был скорректирован для соответствия lineitems.")
#         doc_struct["reason_code"] = "DOC_TOTALS_INCONSISTENT"
#         doc_struct["ar_sutapo"] = False
#     else:
#         logs.append("Документ уже был согласован с lineitems.")
#         doc_struct["reason_code"] = "OK"
#         doc_struct["ar_sutapo"] = True

#     doc_struct["_doc_totals_replaced_by_lineitems"] = bool(doc_changed)
#     doc_struct.setdefault("_global_validation_log", []).extend(logs)
#     logger.info("\n".join([f"[global_validator] {line}" for line in logs]))
#     return doc_struct


# # ===============================
# # Современная сверка expected vs doc
# # ===============================

# def subtotal_already_discounted(item: Dict[str, Any]) -> bool:
#     """
#     Возвращает True, если subtotal уже учтён с учётом discount_wo_vat.
#     """
#     try:
#         subtotal = Decimal(str(item.get("subtotal") or "0")).quantize(Decimal("1.0000"))
#         discount = Decimal(str(item.get("discount_wo_vat") or "0")).quantize(Decimal("1.0000"))
#         price = Decimal(str(item.get("price") or "0")).quantize(Decimal("1.0000"))
#         qty = Decimal(str(item.get("quantity") or "0")).quantize(Decimal("1.0000"))
#         base = (price * qty).quantize(Decimal("1.0000"))
#         return abs((subtotal + discount) - base) <= Decimal("0.02")
#     except Exception:
#         return False


# def compare_lineitems_with_main_totals(doc_struct: Dict[str, Any], customer_user=None) -> Dict[str, Decimal]:
#     """
#     Современная сверка с учётом скидок.
#     """
#     TOL = Decimal("0.0500")
#     fix_delta = _is_fix_delta_enabled(customer_user)

#     def d(x, p=4):
#         if x is None or x == "" or str(x).lower() == "null":
#             return Decimal("0.0000") if p == 4 else Decimal("0.00")
#         try:
#             return Decimal(str(x)).quantize(Decimal("1." + "0" * p), rounding=ROUND_HALF_UP)
#         except Exception:
#             return Decimal("0.0000") if p == 4 else Decimal("0.00")

#     items = doc_struct.get("line_items", []) or []

#     sum_line_subtotal = Decimal("0.0000")
#     sum_line_discount_wo_eff = Decimal("0.0000")
#     sum_line_vat = Decimal("0.0000")
#     sum_line_total = Decimal("0.0000")

#     for it in items:
#         subtotal = d(it.get("subtotal"), 4)
#         disc_wo = d(it.get("discount_wo_vat"), 4)
#         vat = d(it.get("vat"), 4)
#         total = d(it.get("total"), 4)

#         if subtotal_already_discounted(it):
#             sum_line_subtotal += subtotal
#         else:
#             sum_line_subtotal += subtotal
#             sum_line_discount_wo_eff += disc_wo

#         sum_line_vat += vat
#         sum_line_total += total

#     doc_wo = d(doc_struct.get("amount_wo_vat"), 4)
#     doc_vat = d(doc_struct.get("vat_amount"), 4)
#     doc_tot = d(doc_struct.get("amount_with_vat"), 4)
#     vat_percent_doc = d(doc_struct.get("vat_percent"), 2)

#     inv_disc_wo, inv_disc_with = _deduce_missing_document_discounts(
#         doc_struct, sum_line_subtotal, sum_line_total, fix_delta=fix_delta
#     )

#     eff_inv_disc_wo = inv_disc_wo
#     if abs(inv_disc_wo - sum_line_discount_wo_eff) <= TOL:
#         eff_inv_disc_wo = Decimal("0.0000")

#     eff_inv_disc_with = inv_disc_with

#     line_effective_wo = (sum_line_subtotal - sum_line_discount_wo_eff)

#     expected_wo = (line_effective_wo - eff_inv_disc_wo).quantize(Decimal("1.0000"))
#     if expected_wo < 0:
#         expected_wo = Decimal("0.0000")

#     expected_vat = sum_line_vat
#     if not vat_percent_doc.is_zero() and not eff_inv_disc_wo.is_zero():
#         expected_vat = (sum_line_vat - (eff_inv_disc_wo * vat_percent_doc / Decimal("100"))).quantize(Decimal("1.0000"))
#         if expected_vat < 0:
#             expected_vat = Decimal("0.0000")
#     else:
#         expected_vat = sum_line_vat.quantize(Decimal("1.0000"))

#     expected_tot = (sum_line_total - eff_inv_disc_with).quantize(Decimal("1.0000"))
#     if expected_tot < 0:
#         expected_tot = Decimal("0.0000")

#     result = {
#         "subtotal_match": abs(expected_wo - doc_wo) <= TOL,
#         "vat_match": abs(expected_vat - doc_vat) <= TOL,
#         "total_match": abs(expected_tot - doc_tot) <= TOL,
#         "subtotal_diff": (expected_wo - doc_wo).quantize(Decimal("1.0000")),
#         "vat_diff": (expected_vat - doc_vat).quantize(Decimal("1.0000")),
#         "total_diff": (expected_tot - doc_tot).quantize(Decimal("1.0000")),
#         "expected_amount_wo_vat": expected_wo,
#         "expected_vat_amount": expected_vat,
#         "expected_amount_with_vat": expected_tot,
#         "line_sum_subtotal": sum_line_subtotal.quantize(Decimal("1.0000")),
#         "line_sum_discount_wo_vat": sum_line_discount_wo_eff.quantize(Decimal("1.0000")),
#         "line_effective_wo_vat": line_effective_wo.quantize(Decimal("1.0000")),
#         "line_sum_vat": sum_line_vat.quantize(Decimal("1.0000")),
#         "line_sum_with_vat": sum_line_total.quantize(Decimal("1.0000")),
#         "_eff_inv_disc_wo": eff_inv_disc_wo,
#         "_eff_inv_disc_with": eff_inv_disc_with,
#         "_vat_percent_doc": vat_percent_doc,
#     }
#     logger.info(f"[compare_lineitems] RESULT: {result}")
#     return result


# # ===============================
# # Вспомогательное: нормализовать строки, только если нужно
# # ===============================

# def normalize_line_items_if_needed(doc_struct: Dict[str, Any], customer_user=None) -> Dict[str, Any]:
#     """
#     Если суммы line_items совпадают с итогами документа — ничего не делаем.
#     Иначе — прогоняем строки через validate_and_calculate_lineitem_amounts.
#     """
#     fix_delta = _is_fix_delta_enabled(customer_user)
    
#     if not should_normalize_lineitems(doc_struct, fix_delta=fix_delta):
#         logger.info("[normalize_line_items] Суммы согласованы — пересчёт строк не требуется.")
#         return doc_struct

#     logger.info("[normalize_line_items] Обнаружены расхождения — пересчитываем строки.")
#     for item in doc_struct.get("line_items", []) or []:
#         validate_and_calculate_lineitem_amounts(item)
#     return doc_struct


# # ===============================
# # Раздача VAT из документа по строкам (единая ставка)
# # ===============================

# def _q4(x: Decimal) -> Decimal:
#     return Decimal(str(x)).quantize(Decimal("1.0000"), rounding=ROUND_HALF_UP)


# def _q2(x: Decimal) -> Decimal:
#     return Decimal(str(x)).quantize(Decimal("1.00"), rounding=ROUND_HALF_UP)


# def distribute_vat_from_document(doc_struct: Dict[str, Any], tol: Decimal = Decimal("0.05")) -> Dict[str, Any]:
#     """
#     Назначение: когда в документе одна ставка (separate_vat=False), doc.vat_amount>0,
#     а у строк НДС не проставлен — раздать doc.vat_percent по строкам.
#     """
#     try:
#         separate_vat = bool(doc_struct.get("separate_vat"))
#         doc_vat_amt = Decimal(str(doc_struct.get("vat_amount") or "0"))
#         doc_vat_pct = Decimal(str(doc_struct.get("vat_percent") or "0"))
#     except Exception:
#         return doc_struct

#     if separate_vat or doc_vat_amt <= 0 or doc_vat_pct <= 0:
#         return doc_struct

#     items = doc_struct.get("line_items") or []
#     if not items:
#         return doc_struct

#     bases: List[Decimal] = []
#     current_vats: List[Decimal] = []

#     for it in items:
#         q = Decimal(str(it.get("quantity") or "0"))
#         p = Decimal(str(it.get("price") or "0"))
#         dsc = Decimal(str(it.get("discount_wo_vat") or "0"))
#         sub = Decimal(str(it.get("subtotal") or "0"))
#         if sub <= 0 and q > 0 and p > 0:
#             sub = q * p - dsc
#         sub = _q4(sub)

#         v = _q4(Decimal(str(it.get("vat") or "0")))
#         vp = _q2(Decimal(str(it.get("vat_percent") or "0")))

#         it.setdefault("_vat_inferred_from_doc", False)

#         if v == 0 and vp == 0 and sub > 0:
#             vp = _q2(doc_vat_pct)
#             raw_v = sub * vp / Decimal("100")
#             bases.append(sub)
#             current_vats.append(_q4(raw_v))
#             it["vat_percent"] = vp
#             it["vat"] = _q4(raw_v)
#             tot = Decimal(str(it.get("total") or "0"))
#             if tot == 0:
#                 it["total"] = _q4(sub + _q4(raw_v))
#             it["_vat_inferred_from_doc"] = True
#         else:
#             bases.append(sub)
#             current_vats.append(v)

#     try:
#         current_sum = _q4(sum(current_vats))
#         diff = _q4(doc_vat_amt - current_sum)
#         if abs(diff) > tol:
#             ideal_vats = [(_q4(b * _q2(doc_vat_pct) / Decimal("100"))) for b in bases]
#             remainders = [ideal - cur for ideal, cur in zip(ideal_vats, current_vats)]
#             order = sorted(range(len(remainders)), key=lambda i: remainders[i], reverse=True)
#             step = Decimal("0.0100")
#             sign = Decimal("1.0000") if diff > 0 else Decimal("-1.0000")
#             for i in order:
#                 if diff == 0:
#                     break
#                 adj = min(abs(diff), step) * sign
#                 new_v = current_vats[i] + adj
#                 if new_v >= Decimal("0.0000"):
#                     current_vats[i] = new_v
#                     diff -= adj
#             for idx, it in enumerate(items):
#                 old_v = _q4(Decimal(str(it.get("vat") or "0")))
#                 if current_vats[idx] != old_v:
#                     it["vat"] = _q4(current_vats[idx])
#                     sub = _q4(Decimal(str(it.get("subtotal") or "0")))
#                     it["total"] = _q4(sub + it["vat"]) if sub > 0 else it.get("total")
#             logger.info("[distribute_vat] ROUNDING_REALLOCATION applied")
#             doc_struct.setdefault("_global_validation_log", []).append(REASON["ROUNDING_REALLOCATION"])
#     except Exception:
#         pass

#     return doc_struct




