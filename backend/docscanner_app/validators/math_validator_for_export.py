# validators/math_validator_for_export.py

from __future__ import annotations

from decimal import Decimal
import logging
from typing import Tuple, Dict, Any

logger = logging.getLogger("docscanner_app")

# Толерантности
DOC_TOLERANCE = Decimal("0.02")    # для документа и агрегатов
LINE_TOLERANCE = Decimal("0.02")   # для строк


def validate_document_math_for_export(db_doc) -> Tuple[bool, Dict[str, Any]]:
    """
    Математическая валидация документа для экспорта.

    Проверки документа:
      1) amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat
      2) (amount_wo_vat - invoice_discount_wo_vat) × vat_percent/100 ≈ vat_amount
         (если separate_vat=False и задан vat_percent)

    Проверки строк (если есть):
      1) price × quantity = subtotal
      2) subtotal + vat = total
      3) subtotal × vat_percent/100 = vat (если separate_vat=False и задан vat_percent)

    Проверки агрегатов (если есть строки):
      1) Σ(subtotal) = amount_wo_vat - invoice_discount_wo_vat
      2) Σ(vat) = vat_amount                (если separate_vat=False)
      3) Σ(total) со скидками документа:
         - если скидка по нетто (A): Σ(total) ≈ amount_with_vat + invoice_discount_wo_vat
         - если скидка по брутто (B): Σ(total) ≈ amount_with_vat + invoice_discount_with_vat
         - иначе: Σ(total) ≈ amount_with_vat

    Возвращает: (is_valid: bool, report: dict)
    """
    logger.info(f"=== Starting math validation for document {getattr(db_doc, 'id', '?')} ===")
    
    validation_report: Dict[str, Any] = {
        "document_checks": {},
        "line_checks": [],
        "aggregate_checks": {},
        "overall_status": "PASS",
        "errors": [],
    }

    separate_vat = bool(getattr(db_doc, "separate_vat", False))
    logger.info(f"Doc {getattr(db_doc, 'id', '?')}: separate_vat={separate_vat}")

    # 1) Проверки документа
    doc_checks_passed = _validate_document_totals(
        db_doc=db_doc,
        separate_vat=separate_vat,
        report=validation_report,
    )
    logger.info(f"Doc {getattr(db_doc, 'id', '?')}: document_checks passed={doc_checks_passed}")

    # 2) Проверки строк
    line_items = db_doc.line_items.all()
    if line_items.exists():
        logger.info(f"Doc {getattr(db_doc, 'id', '?')}: validating {line_items.count()} line items")
        lines_passed = _validate_line_items(
            line_items=line_items,
            separate_vat=separate_vat,
            report=validation_report,
        )
        logger.info(f"Doc {getattr(db_doc, 'id', '?')}: line_checks passed={lines_passed}")

        # 3) Проверки агрегатов
        aggregates_passed = _validate_aggregates(
            db_doc=db_doc,
            line_items=line_items,
            separate_vat=separate_vat,
            report=validation_report,
        )
        logger.info(f"Doc {getattr(db_doc, 'id', '?')}: aggregate_checks passed={aggregates_passed}")
    else:
        logger.info(f"Doc {getattr(db_doc, 'id', '?')}: no line items, skipping line and aggregate checks")
        lines_passed = True
        aggregates_passed = True

    is_valid = bool(doc_checks_passed and lines_passed and aggregates_passed)
    validation_report["overall_status"] = "PASS" if is_valid else "FAIL"

    if is_valid:
        logger.info("Document %s: Math validation PASSED ✓", getattr(db_doc, "id", "?"))
    else:
        logger.warning(
            "Document %s: Math validation FAILED. Errors: %d - %s",
            getattr(db_doc, "id", "?"),
            len(validation_report["errors"]),
            validation_report["errors"]
        )

    return is_valid, validation_report


# ===================== helpers =====================

def _d(value) -> Decimal:
    """Конвертирует в Decimal, None -> 0"""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


# ===================== document checks =====================

def _validate_document_totals(db_doc, separate_vat: bool, report: Dict[str, Any]) -> bool:
    """
    CHECK 1: amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat
    CHECK 2: (amount_wo_vat - invoice_discount_wo_vat) × vat_percent/100 ≈ vat_amount  (если separate_vat=False)
    """
    amount_wo     = _d(getattr(db_doc, "amount_wo_vat", 0))
    discount_wo   = _d(getattr(db_doc, "invoice_discount_wo_vat", 0))
    discount_with = _d(getattr(db_doc, "invoice_discount_with_vat", 0))
    vat_amount    = _d(getattr(db_doc, "vat_amount", 0))
    amount_with   = _d(getattr(db_doc, "amount_with_vat", 0))
    vat_percent   = _d(getattr(db_doc, "vat_percent", 0))

    logger.info(
        f"Doc {getattr(db_doc, 'id', '?')}: amount_wo={amount_wo}, discount_wo={discount_wo}, "
        f"discount_with={discount_with}, vat_amount={vat_amount}, amount_with={amount_with}, vat_percent={vat_percent}"
    )

    errors = []

    # CHECK 1 — базовое уравнение документа
    expected_with_vat = amount_wo - discount_wo + vat_amount
    delta = (expected_with_vat - amount_with).copy_abs()
    match = delta <= DOC_TOLERANCE

    logger.info(
        f"Doc {getattr(db_doc, 'id', '?')} CHECK 1: expected_with_vat={expected_with_vat}, "
        f"amount_with={amount_with}, delta={delta}, match={match}"
    )

    report["document_checks"]["basic_equation"] = {
        "formula": "amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat",
        "expected": float(expected_with_vat),
        "actual": float(amount_with),
        "delta": float(delta),
        "match": match,
        "tolerance": float(DOC_TOLERANCE),
    }
    if not match:
        errors.append(
            f"Doc equation: {expected_with_vat:.2f} ≠ {amount_with:.2f} (Δ={delta:.4f})"
        )

    # CHECK 2 — НДС через процент от NO-VAT базы с учётом скидки по нетто
    if not separate_vat and vat_percent is not None and amount_wo != 0:
        expected_vat = (amount_wo - discount_wo) * vat_percent / Decimal("100")
        delta_vat = (expected_vat - vat_amount).copy_abs()
        match_vat = delta_vat <= DOC_TOLERANCE

        logger.info(
            f"Doc {getattr(db_doc, 'id', '?')} CHECK 2: expected_vat={expected_vat}, "
            f"vat_amount={vat_amount}, delta_vat={delta_vat}, match_vat={match_vat}"
        )

        report["document_checks"]["vat_percent_check"] = {
            "formula": "(amount_wo_vat - invoice_discount_wo_vat) × vat_percent / 100",
            "expected": float(expected_vat),
            "actual": float(vat_amount),
            "delta": float(delta_vat),
            "match": match_vat,
            "tolerance": float(DOC_TOLERANCE),
        }
        if not match_vat:
            errors.append(
                f"Doc VAT %: {expected_vat:.2f} ≠ {vat_amount:.2f} (Δ={delta_vat:.4f})"
            )
    else:
        logger.info(f"Doc {getattr(db_doc, 'id', '?')} CHECK 2: SKIP (separate_vat={separate_vat}, vat_percent={vat_percent})")
        report["document_checks"]["vat_percent_check"] = {
            "status": "SKIP",
            "reason": "separate_vat=True" if separate_vat else "vat_percent not set",
        }

    if errors:
        report["errors"].extend(errors)
        logger.warning(f"Doc {getattr(db_doc, 'id', '?')}: document totals validation FAILED - {errors}")
        return False
    
    logger.info(f"Doc {getattr(db_doc, 'id', '?')}: document totals validation PASSED")
    return True


# ===================== line checks =====================

def _validate_line_items(line_items, separate_vat: bool, report: Dict[str, Any]) -> bool:
    """
    Для каждой строки:
      CHECK 1: price × quantity = subtotal
      CHECK 2: subtotal + vat = total
      CHECK 3: subtotal × vat_percent/100 = vat (если separate_vat=False)
    """
    errors = []

    for idx, line in enumerate(line_items, start=1):
        line_check: Dict[str, Any] = {
            "line_number": idx,
            "line_id": getattr(line, "line_id", None),
            "checks": {},
            "errors": [],
        }

        price       = _d(getattr(line, "price", 0))
        qty         = _d(getattr(line, "quantity", 0))
        subtotal    = _d(getattr(line, "subtotal", 0))
        vat         = _d(getattr(line, "vat", 0))
        vat_percent = _d(getattr(line, "vat_percent", 0))
        total       = _d(getattr(line, "total", 0))

        logger.info(
            f"Line {idx} (id={getattr(line, 'line_id', '?')}): price={price}, qty={qty}, "
            f"subtotal={subtotal}, vat={vat}, vat_percent={vat_percent}, total={total}"
        )

        # CHECK 1
        if price != 0 and qty != 0:
            expected_subtotal = price * qty
            delta = (expected_subtotal - subtotal).copy_abs()
            match = delta <= LINE_TOLERANCE
            line_check["checks"]["price_x_qty"] = {
                "expected": float(expected_subtotal),
                "actual": float(subtotal),
                "delta": float(delta),
                "match": match,
            }
            if not match:
                line_check["errors"].append(
                    f"price×qty: {expected_subtotal:.2f} ≠ {subtotal:.2f} (Δ={delta:.4f})"
                )
                logger.warning(f"Line {idx}: price×qty check FAILED")

        # CHECK 2
        if subtotal != 0 or vat != 0:
            expected_total = subtotal + vat
            delta = (expected_total - total).copy_abs()
            match = delta <= LINE_TOLERANCE
            line_check["checks"]["subtotal_plus_vat"] = {
                "expected": float(expected_total),
                "actual": float(total),
                "delta": float(delta),
                "match": match,
            }
            if not match:
                line_check["errors"].append(
                    f"subtotal+vat: {expected_total:.2f} ≠ {total:.2f} (Δ={delta:.4f})"
                )
                logger.warning(f"Line {idx}: subtotal+vat check FAILED")

        # CHECK 3
        if not separate_vat and subtotal != 0 and (vat_percent is not None):
            expected_vat = subtotal * vat_percent / Decimal("100")
            delta = (expected_vat - vat).copy_abs()
            match = delta <= LINE_TOLERANCE
            line_check["checks"]["vat_from_percent"] = {
                "expected": float(expected_vat),
                "actual": float(vat),
                "delta": float(delta),
                "match": match,
            }
            if not match:
                line_check["errors"].append(
                    f"vat%: {expected_vat:.2f} ≠ {vat:.2f} (Δ={delta:.4f})"
                )
                logger.warning(f"Line {idx}: vat% check FAILED")

        if line_check["errors"]:
            errors.extend([f"Line {idx}: {e}" for e in line_check["errors"]])
        else:
            logger.info(f"Line {idx}: all checks PASSED")

        report["line_checks"].append(line_check)

    if errors:
        report["errors"].extend(errors)
        logger.warning(f"Line items validation FAILED - {errors}")
        return False
    
    logger.info("Line items validation PASSED")
    return True


# ===================== aggregate checks =====================

def _validate_aggregates(db_doc, line_items, separate_vat: bool, report: Dict[str, Any]) -> bool:
    """
    CHECK 1: Σ(subtotal) = amount_wo_vat - invoice_discount_wo_vat
    CHECK 2: Σ(vat)      = vat_amount                 (если separate_vat=False)
    CHECK 3: Σ(total)    = amount_with_vat (+ скидка документа, если строки «до скидки»)

    Логика скидок для CHECK 3:
      A) Скидка по нетто (WO):  wo - disc_wo + vat ≈ with
         → строки обычно «до скидки», значит Σ(total) ≈ with + disc_wo
      B) Скидка по брутто (WITH): wo + vat ≈ with - disc_with
         → строки «до скидки», значит Σ(total) ≈ with + disc_with
      Если ни A ни B не подтверждены — сравниваем Σ(total) с with напрямую.
    """
    # Агрегаты строк
    sum_subtotal = sum(_d(getattr(li, "subtotal", 0)) for li in line_items)
    sum_vat      = sum(_d(getattr(li, "vat", 0))      for li in line_items)
    sum_total    = sum(_d(getattr(li, "total", 0))    for li in line_items)

    # Поля документа
    amount_wo     = _d(getattr(db_doc, "amount_wo_vat", 0))
    discount_wo   = _d(getattr(db_doc, "invoice_discount_wo_vat", 0))
    discount_with = _d(getattr(db_doc, "invoice_discount_with_vat", 0))
    vat_amount    = _d(getattr(db_doc, "vat_amount", 0))
    amount_with   = _d(getattr(db_doc, "amount_with_vat", 0))

    logger.info(
        f"Doc {getattr(db_doc, 'id', '?')} aggregates: sum_subtotal={sum_subtotal}, "
        f"sum_vat={sum_vat}, sum_total={sum_total}"
    )
    logger.info(
        f"Doc {getattr(db_doc, 'id', '?')}: discount_wo={discount_wo}, discount_with={discount_with}"
    )

    errors = []
    has_doc_discount = (discount_wo != 0 or discount_with != 0)
    
    logger.info(f"Doc {getattr(db_doc, 'id', '?')}: has_doc_discount={has_doc_discount}")

    # CHECK 1 — Σ(subtotal) vs (amount_wo_vat - discount_wo_vat)
    expected_wo_sum = amount_wo - discount_wo
    delta_wo = (sum_subtotal - expected_wo_sum).copy_abs()
    match_wo = delta_wo <= DOC_TOLERANCE
    
    logger.info(
        f"Doc {getattr(db_doc, 'id', '?')} AGG CHECK 1: sum_subtotal={sum_subtotal}, "
        f"expected_wo_sum={expected_wo_sum}, delta_wo={delta_wo}, match_wo={match_wo}"
    )
    
    report["aggregate_checks"]["sum_wo_vat"] = {
        "sum_lines": float(sum_subtotal),
        "doc_value": float(expected_wo_sum),
        "delta": float(delta_wo),
        "match": match_wo,
        "status": "PASS" if match_wo else "FAIL",
        "note": "includes doc-level WO discount",
    }
    if not match_wo:
        errors.append(
            f"Σsubtotal: {sum_subtotal:.2f} ≠ (doc.wo - disc_wo) {expected_wo_sum:.2f} (Δ={delta_wo:.4f})"
        )

    # CHECK 2 — Σ(vat) vs vat_amount
    if not separate_vat:
        delta_vat = (sum_vat - vat_amount).copy_abs()
        match_vat = delta_vat <= DOC_TOLERANCE
        
        logger.info(
            f"Doc {getattr(db_doc, 'id', '?')} AGG CHECK 2: sum_vat={sum_vat}, "
            f"vat_amount={vat_amount}, delta_vat={delta_vat}, match_vat={match_vat}"
        )
        
        report["aggregate_checks"]["sum_vat"] = {
            "sum_lines": float(sum_vat),
            "doc_value": float(vat_amount),
            "delta": float(delta_vat),
            "match": match_vat,
            "status": "PASS" if match_vat else "FAIL",
        }
        if not match_vat:
            errors.append(
                f"Σvat: {sum_vat:.2f} ≠ doc.vat {vat_amount:.2f} (Δ={delta_vat:.4f})"
            )
    else:
        logger.info(f"Doc {getattr(db_doc, 'id', '?')} AGG CHECK 2: SKIP (separate_vat=True)")
        report["aggregate_checks"]["sum_vat"] = {
            "status": "SKIP",
            "reason": "separate_vat=True",
        }

    # CHECK 3 — Σ(total) vs amount_with_vat c учётом скидок документа
    delta_with_direct = (sum_total - amount_with).copy_abs()
    match_with = False
    note = None

    logger.info(f"Doc {getattr(db_doc, 'id', '?')} AGG CHECK 3: starting...")

    if has_doc_discount:
        logger.info(f"Doc {getattr(db_doc, 'id', '?')}: has discount, analyzing scenarios...")
        
        # Сценарий A: скидка по нетто (A): wo - disc_wo + vat ≈ with
        expected_with_A = amount_wo - discount_wo + vat_amount
        scenario_A_valid = (expected_with_A - amount_with).copy_abs() <= DOC_TOLERANCE

        # Сценарий B: скидка по брутто (B): wo + vat ≈ with - disc_with
        expected_left_B  = amount_wo + vat_amount
        expected_right_B = amount_with + discount_with
        scenario_B_valid = (expected_left_B - expected_right_B).copy_abs() <= DOC_TOLERANCE

        logger.info(
            f"Doc {getattr(db_doc, 'id', '?')}: scenario_A_valid={scenario_A_valid}, "
            f"scenario_B_valid={scenario_B_valid}"
        )

        if scenario_A_valid:
            expected_sum_total = amount_with + discount_wo
            delta_with = (sum_total - expected_sum_total).copy_abs()
            match_with = delta_with <= DOC_TOLERANCE
            note = f"doc-level WO discount ({discount_wo:.2f}): Σtotal should be {expected_sum_total:.2f} (before discount)"
            logger.info(f"Doc {getattr(db_doc, 'id', '?')}: using scenario A - {note}")
        elif scenario_B_valid:
            expected_sum_total = amount_with + discount_with
            delta_with = (sum_total - expected_sum_total).copy_abs()
            match_with = delta_with <= DOC_TOLERANCE
            note = f"doc-level WITH discount ({discount_with:.2f}): Σtotal should be {expected_sum_total:.2f} (before discount)"
            logger.info(f"Doc {getattr(db_doc, 'id', '?')}: using scenario B - {note}")
        else:
            # скидка есть, но не можем явно классифицировать A/B
            match_with = delta_with_direct <= DOC_TOLERANCE
            delta_with = delta_with_direct
            note = f"doc-level discount exists but position unclear (wo={discount_wo:.2f}, with={discount_with:.2f})"
            logger.warning(f"Doc {getattr(db_doc, 'id', '?')}: {note}")
    else:
        # без скидок — прямое сравнение
        match_with = delta_with_direct <= DOC_TOLERANCE
        delta_with = delta_with_direct
        note = "no doc-level discounts"
        logger.info(f"Doc {getattr(db_doc, 'id', '?')}: no discounts, direct comparison")

    logger.info(
        f"Doc {getattr(db_doc, 'id', '?')} AGG CHECK 3: sum_total={sum_total}, "
        f"amount_with={amount_with}, delta_with={delta_with}, match_with={match_with}"
    )

    report["aggregate_checks"]["sum_with_vat"] = {
        "sum_lines": float(sum_total),
        "doc_value": float(amount_with),
        "delta": float(delta_with),
        "match": match_with,
        "status": "PASS" if match_with else "FAIL",
        "note": note,
        "doc_discount_wo": float(discount_wo) if has_doc_discount else None,
        "doc_discount_with": float(discount_with) if has_doc_discount else None,
    }
    if not match_with:
        errors.append(
            f"Σtotal: {sum_total:.2f} ≠ doc.with {amount_with:.2f} (considering discounts) (Δ={delta_with:.4f})"
        )

    if errors:
        report["errors"].extend(errors)
        logger.warning(f"Doc {getattr(db_doc, 'id', '?')}: aggregates validation FAILED - {errors}")
        return False
    
    logger.info(f"Doc {getattr(db_doc, 'id', '?')}: aggregates validation PASSED")
    return True













# # validators/math_validator_for_export.py

# from decimal import Decimal
# import logging

# logger = logging.getLogger("docscanner_app")

# # Толерантности
# DOC_TOLERANCE = Decimal("0.02")    # для документа
# LINE_TOLERANCE = Decimal("0.02")   # для строк


# def validate_document_math_for_export(db_doc) -> tuple[bool, dict]:
#     """
#     Математическая валидация документа для экспорта.
    
#     Проверки документа:
#     1. amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat
#     2. amount_wo_vat × vat_percent/100 ≈ vat_amount (если separate_vat=False)
    
#     Проверки строк (если есть):
#     1. price × quantity = subtotal
#     2. subtotal + vat = total
#     3. subtotal × vat_percent/100 = vat (если separate_vat=False)
    
#     Проверки агрегатов (если есть строки):
#     1. Σ(subtotal) = amount_wo_vat - invoice_discount_wo_vat
#     2. Σ(vat) = vat_amount (если separate_vat=False)
#     3. Σ(total) = amount_with_vat
    
#     Returns:
#         (is_valid: bool, report: dict)
#     """
#     validation_report = {
#         "document_checks": {},
#         "line_checks": [],
#         "aggregate_checks": {},
#         "overall_status": "PASS",
#         "errors": []
#     }
    
#     separate_vat = db_doc.separate_vat or False
    
#     # ========== 1. ПРОВЕРКИ ДОКУМЕНТА ==========
#     doc_checks_passed = _validate_document_totals(
#         db_doc, 
#         separate_vat, 
#         validation_report
#     )
    
#     # ========== 2. ПРОВЕРКИ СТРОК ==========
#     line_items = db_doc.line_items.all()
    
#     if line_items.exists():
#         lines_passed = _validate_line_items(
#             line_items,
#             separate_vat,
#             validation_report
#         )
        
#         # ========== 3. ПРОВЕРКИ АГРЕГАТОВ ==========
#         aggregates_passed = _validate_aggregates(
#             db_doc,
#             line_items,
#             separate_vat,
#             validation_report
#         )
#     else:
#         lines_passed = True
#         aggregates_passed = True
    
#     # ========== ИТОГ ==========
#     is_valid = doc_checks_passed and lines_passed and aggregates_passed
#     validation_report["overall_status"] = "PASS" if is_valid else "FAIL"
    
#     if is_valid:
#         logger.info(f"Document {db_doc.id}: Math validation PASSED ✓")
#     else:
#         logger.warning(
#             f"Document {db_doc.id}: Math validation FAILED. "
#             f"Errors: {len(validation_report['errors'])}"
#         )
    
#     return is_valid, validation_report




# def _validate_document_totals(db_doc, separate_vat, report):
#     """
#     CHECK 1: amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat
#     CHECK 2: amount_wo_vat × vat_percent/100 ≈ vat_amount (если separate_vat=False)
#     """
#     amount_wo = _d(db_doc.amount_wo_vat)
#     discount_wo = _d(db_doc.invoice_discount_wo_vat)
#     vat_amount = _d(db_doc.vat_amount)
#     amount_with = _d(db_doc.amount_with_vat)
#     vat_percent = _d(db_doc.vat_percent)
    
#     errors = []
    
#     # CHECK 1: Базовое уравнение
#     expected_with_vat = amount_wo - discount_wo + vat_amount
#     delta = abs(expected_with_vat - amount_with)
#     match = delta <= DOC_TOLERANCE
    
#     report["document_checks"]["basic_equation"] = {
#         "formula": "amount_wo_vat - discount_wo_vat + vat_amount = amount_with_vat",
#         "expected": float(expected_with_vat),
#         "actual": float(amount_with),
#         "delta": float(delta),
#         "match": match,
#         "tolerance": float(DOC_TOLERANCE)
#     }
    
#     if not match:
#         errors.append(
#             f"Doc equation: {expected_with_vat:.2f} ≠ {amount_with:.2f} (Δ={delta:.4f})"
#         )
    
#     # CHECK 2: Проверка НДС через процент (только если separate_vat=False)
#     if not separate_vat and vat_percent is not None and amount_wo != 0:
#         expected_vat = (amount_wo - discount_wo) * vat_percent / Decimal("100")
#         delta_vat = abs(expected_vat - vat_amount)
#         match_vat = delta_vat <= DOC_TOLERANCE
        
#         report["document_checks"]["vat_percent_check"] = {
#             "formula": "(amount_wo_vat - discount_wo_vat) × vat_percent / 100",
#             "expected": float(expected_vat),
#             "actual": float(vat_amount),
#             "delta": float(delta_vat),
#             "match": match_vat,
#             "tolerance": float(DOC_TOLERANCE)
#         }
        
#         if not match_vat:
#             errors.append(
#                 f"Doc VAT %: {expected_vat:.2f} ≠ {vat_amount:.2f} (Δ={delta_vat:.4f})"
#             )
#     else:
#         report["document_checks"]["vat_percent_check"] = {
#             "status": "SKIP",
#             "reason": "separate_vat=True" if separate_vat else "vat_percent not set"
#         }
    
#     if errors:
#         report["errors"].extend(errors)
#         return False
    
#     return True





# def _validate_line_items(line_items, separate_vat, report):
#     """
#     Для каждой строки:
#     CHECK 1: price × quantity = subtotal
#     CHECK 2: subtotal + vat = total
#     CHECK 3: subtotal × vat_percent/100 = vat (если separate_vat=False)
#     """
#     errors = []
    
#     for idx, line in enumerate(line_items, start=1):
#         line_check = {
#             "line_number": idx,
#             "line_id": line.line_id,
#             "checks": {},
#             "errors": []
#         }
        
#         price = _d(line.price)
#         qty = _d(line.quantity)
#         subtotal = _d(line.subtotal)
#         vat = _d(line.vat)
#         vat_percent = _d(line.vat_percent)
#         total = _d(line.total)
        
#         # CHECK 1: price × quantity = subtotal
#         if price != 0 and qty != 0:
#             expected_subtotal = price * qty
#             delta = abs(expected_subtotal - subtotal)
#             match = delta <= LINE_TOLERANCE
            
#             line_check["checks"]["price_x_qty"] = {
#                 "expected": float(expected_subtotal),
#                 "actual": float(subtotal),
#                 "delta": float(delta),
#                 "match": match
#             }
            
#             if not match:
#                 line_check["errors"].append(
#                     f"price×qty: {expected_subtotal:.2f} ≠ {subtotal:.2f} (Δ={delta:.4f})"
#                 )
        
#         # CHECK 2: subtotal + vat = total
#         if subtotal != 0 or vat != 0:
#             expected_total = subtotal + vat
#             delta = abs(expected_total - total)
#             match = delta <= LINE_TOLERANCE
            
#             line_check["checks"]["subtotal_plus_vat"] = {
#                 "expected": float(expected_total),
#                 "actual": float(total),
#                 "delta": float(delta),
#                 "match": match
#             }
            
#             if not match:
#                 line_check["errors"].append(
#                     f"subtotal+vat: {expected_total:.2f} ≠ {total:.2f} (Δ={delta:.4f})"
#                 )
        
#         # CHECK 3: subtotal × vat_percent/100 = vat (только если separate_vat=False)
#         if not separate_vat and subtotal != 0 and vat_percent is not None:
#             expected_vat = subtotal * vat_percent / Decimal("100")
#             delta = abs(expected_vat - vat)
#             match = delta <= LINE_TOLERANCE
            
#             line_check["checks"]["vat_from_percent"] = {
#                 "expected": float(expected_vat),
#                 "actual": float(vat),
#                 "delta": float(delta),
#                 "match": match
#             }
            
#             if not match:
#                 line_check["errors"].append(
#                     f"vat%: {expected_vat:.2f} ≠ {vat:.2f} (Δ={delta:.4f})"
#                 )
        
#         if line_check["errors"]:
#             errors.extend([f"Line {idx}: {e}" for e in line_check["errors"]])
        
#         report["line_checks"].append(line_check)
    
#     if errors:
#         report["errors"].extend(errors)
#         return False
    
#     return True




# def _validate_aggregates(db_doc, line_items, separate_vat, report):
#     """
#     CHECK 1: Σ(subtotal) = amount_wo_vat
#     CHECK 2: Σ(vat) = vat_amount (если separate_vat=False)
#     CHECK 3: Σ(total) С УЧЁТОМ invoice_discount_wo_vat = amount_with_vat
#     """
#     # Суммы из строк
#     sum_subtotal = sum(_d(li.subtotal) for li in line_items)
#     sum_vat = sum(_d(li.vat) for li in line_items)
#     sum_total = sum(_d(li.total) for li in line_items)
    
#     # Суммы из документа
#     amount_wo = _d(db_doc.amount_wo_vat)
#     discount_wo = _d(db_doc.invoice_discount_wo_vat)
#     discount_with = _d(db_doc.invoice_discount_with_vat)
#     vat_amount = _d(db_doc.vat_amount)
#     amount_with = _d(db_doc.amount_with_vat)
    
#     errors = []
#     has_doc_discount = (discount_wo != 0 or discount_with != 0)
    
#     # CHECK 1: Σ(subtotal) = amount_wo_vat
#     delta_wo = abs(sum_subtotal - amount_wo)
#     match_wo = delta_wo <= DOC_TOLERANCE
    
#     report["aggregate_checks"]["sum_wo_vat"] = {
#         "sum_lines": float(sum_subtotal),
#         "doc_value": float(amount_wo),
#         "delta": float(delta_wo),
#         "match": match_wo,
#         "status": "PASS" if match_wo else "FAIL"
#     }
    
#     if not match_wo:
#         errors.append(
#             f"Σsubtotal: {sum_subtotal:.2f} ≠ doc {amount_wo:.2f} (Δ={delta_wo:.4f})"
#         )
    
#     # CHECK 2: Σ(vat) = vat_amount (только если separate_vat=False)
#     if not separate_vat:
#         delta_vat = abs(sum_vat - vat_amount)
#         match_vat = delta_vat <= DOC_TOLERANCE
        
#         report["aggregate_checks"]["sum_vat"] = {
#             "sum_lines": float(sum_vat),
#             "doc_value": float(vat_amount),
#             "delta": float(delta_vat),
#             "match": match_vat,
#             "status": "PASS" if match_vat else "FAIL"
#         }
        
#         if not match_vat:
#             errors.append(
#                 f"Σvat: {sum_vat:.2f} ≠ doc {vat_amount:.2f} (Δ={delta_vat:.4f})"
#             )
#     else:
#         report["aggregate_checks"]["sum_vat"] = {
#             "status": "SKIP",
#             "reason": "separate_vat=True"
#         }
    
#     # ✅ CHECK 3: Σ(total) С УЧЁТОМ ДОКУМЕНТНЫХ СКИДОК
#     delta_with = abs(sum_total - amount_with)
#     match_with = False
#     validation_note = None
    
#     if has_doc_discount:
#         # Проверяем сценарии A и B
#         # Сценарий A: wo - discount_wo + vat ≈ with (скидка по нетто)
#         expected_with_A = amount_wo - discount_wo + vat_amount
#         scenario_A_valid = abs(expected_with_A - amount_with) <= DOC_TOLERANCE
        
#         # Сценарий B: wo + vat ≈ with + discount_with (скидка по брутто)
#         expected_left_B = amount_wo + vat_amount
#         expected_right_B = amount_with + discount_with
#         scenario_B_valid = abs(expected_left_B - expected_right_B) <= DOC_TOLERANCE
        
#         if scenario_A_valid:
#             # Строки должны быть "до скидки по нетто"
#             # Ожидаемая сумма строк = amount_with + discount_wo
#             expected_sum_with = amount_with + discount_wo
#             match_with = abs(sum_total - expected_sum_with) <= DOC_TOLERANCE
#             validation_note = f"doc-level WO discount ({discount_wo:.2f}): Σtotal should be {expected_sum_with:.2f} (before discount)"
            
#         elif scenario_B_valid:
#             # Строки должны быть "до скидки по брутто"
#             # Ожидаемая сумма строк = amount_with + discount_with
#             expected_sum_with = amount_with + discount_with
#             match_with = abs(sum_total - expected_sum_with) <= DOC_TOLERANCE
#             validation_note = f"doc-level WITH discount ({discount_with:.2f}): Σtotal should be {expected_sum_with:.2f} (before discount)"
            
#         else:
#             # Скидки есть, но не согласуются с документом — прямое сравнение
#             match_with = delta_with <= DOC_TOLERANCE
#             validation_note = f"doc-level discount exists but position unclear (wo={discount_wo:.2f}, with={discount_with:.2f})"
#     else:
#         # Нет документных скидок — прямое сравнение
#         match_with = delta_with <= DOC_TOLERANCE
#         validation_note = "no doc-level discounts"
    
#     report["aggregate_checks"]["sum_with_vat"] = {
#         "sum_lines": float(sum_total),
#         "doc_value": float(amount_with),
#         "delta": float(delta_with),
#         "match": match_with,
#         "status": "PASS" if match_with else "FAIL",
#         "note": validation_note,
#         "doc_discount_wo": float(discount_wo) if has_doc_discount else None,
#         "doc_discount_with": float(discount_with) if has_doc_discount else None
#     }
    
#     if not match_with:
#         errors.append(
#             f"Σtotal: {sum_total:.2f} ≠ doc {amount_with:.2f} (with discounts) (Δ={delta_with:.4f})"
#         )
    
#     if errors:
#         report["errors"].extend(errors)
#         return False
    
#     return True


# def _d(value):
#     """Конвертирует в Decimal, None -> 0"""
#     if value is None:
#         return Decimal("0")
#     return Decimal(str(value))





