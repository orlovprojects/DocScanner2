# validators/math_validator_for_export.py
# validators/math_validator_for_export.py

from __future__ import annotations

from decimal import Decimal
import logging
from typing import Tuple, Dict, Any

logger = logging.getLogger("docscanner_app")

# Толерантности
DOC_TOLERANCE = Decimal("0.02")        # для точного совпадения
LINE_TOLERANCE = Decimal("0.02")       # для строк
AGGREGATE_TOLERANCE = Decimal("0.20")  # для агрегатов (допустимая дельта)


def validate_document_math_for_export(db_doc) -> Tuple[bool, Dict[str, Any]]:
    """
    Математическая валидация документа для экспорта.

    Логика толерансов:
      - delta ≤ 0.02: PASS (exact match)
      - 0.02 < delta ≤ 0.20: PASS (within tolerance)
      - delta > 0.20: FAIL

    Возвращает: (is_valid: bool, report: dict)
    """
    logger.info(f"=== Starting math validation for document {getattr(db_doc, 'id', '?')} ===")
    
    validation_report: Dict[str, Any] = {
        "document_checks": {},
        "line_checks": [],
        "aggregate_checks": {},
        "overall_status": "PASS",
        "errors": [],
        "warnings": [],
    }

    separate_vat = bool(getattr(db_doc, "separate_vat", False))
    logger.info(f"Doc {getattr(db_doc, 'id', '?')}: separate_vat={separate_vat}")

    # 1) Проверки документа
    doc_checks_passed = _validate_document_totals(
        db_doc=db_doc,
        separate_vat=separate_vat,
        report=validation_report,
    )

    # 2) Проверки строк
    line_items = list(db_doc.line_items.all())
    if line_items:
        lines_passed = _validate_line_items(
            line_items=line_items,
            separate_vat=separate_vat,
            report=validation_report,
        )

        # 3) Проверки агрегатов
        aggregates_passed = _validate_aggregates(
            db_doc=db_doc,
            line_items=line_items,
            separate_vat=separate_vat,
            report=validation_report,
        )
    else:
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
    CHECK 2: (amount_wo_vat - invoice_discount_wo_vat) × vat_percent/100 ≈ vat_amount
    """
    amount_wo     = _d(getattr(db_doc, "amount_wo_vat", 0))
    discount_wo   = _d(getattr(db_doc, "invoice_discount_wo_vat", 0))
    vat_amount    = _d(getattr(db_doc, "vat_amount", 0))
    amount_with   = _d(getattr(db_doc, "amount_with_vat", 0))
    vat_percent   = _d(getattr(db_doc, "vat_percent", 0))

    errors = []

    # CHECK 1 — базовое уравнение документа
    expected_with_vat = amount_wo - discount_wo + vat_amount
    delta = (expected_with_vat - amount_with).copy_abs()
    match = delta <= DOC_TOLERANCE

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

    # CHECK 2 — НДС через процент
    vat_percent_valid = vat_percent is not None and vat_percent != 0
    if not separate_vat and vat_percent_valid and amount_wo != 0:
        expected_vat = (amount_wo - discount_wo) * vat_percent / Decimal("100")
        delta_vat = (expected_vat - vat_amount).copy_abs()
        match_vat = delta_vat <= DOC_TOLERANCE

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
        skip_reason = "separate_vat=True" if separate_vat else "vat_percent not set or zero"
        report["document_checks"]["vat_percent_check"] = {
            "status": "SKIP",
            "reason": skip_reason,
        }

    if errors:
        report["errors"].extend(errors)
        return False
    
    return True


# ===================== line checks =====================

def _validate_line_items(line_items, separate_vat: bool, report: Dict[str, Any]) -> bool:
    """
    Для каждой строки:
      CHECK 1: price × quantity = subtotal
      CHECK 2: subtotal + vat = total
      CHECK 3: subtotal × vat_percent/100 = vat
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

        # CHECK 3
        if not separate_vat and subtotal != 0 and vat_percent is not None:
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

        if line_check["errors"]:
            errors.extend([f"Line {idx}: {e}" for e in line_check["errors"]])

        report["line_checks"].append(line_check)

    if errors:
        report["errors"].extend(errors)
        return False
    
    return True


# ===================== aggregate checks =====================

def _validate_aggregates(
    db_doc, 
    line_items, 
    separate_vat: bool, 
    report: Dict[str, Any],
) -> bool:
    """
    Проверки агрегатов:
    
    - delta ≤ 0.02: PASS (exact match)
    - 0.02 < delta ≤ 0.20: PASS (within tolerance)
    - delta > 0.20: FAIL
    """
    # Агрегаты строк
    sum_subtotal = sum(_d(getattr(li, "subtotal", 0)) for li in line_items)
    sum_vat = sum(_d(getattr(li, "vat", 0)) for li in line_items)
    sum_total = sum(_d(getattr(li, "total", 0)) for li in line_items)

    # Поля документа
    amount_wo = _d(getattr(db_doc, "amount_wo_vat", 0))
    vat_amount = _d(getattr(db_doc, "vat_amount", 0))
    amount_with = _d(getattr(db_doc, "amount_with_vat", 0))

    # Вычисляем дельты
    delta_wo = (sum_subtotal - amount_wo).copy_abs()
    delta_vat = (sum_vat - vat_amount).copy_abs()
    delta_with = (sum_total - amount_with).copy_abs()

    errors = []
    warnings = []

    # === CHECK 1: Σ(subtotal) vs amount_wo_vat ===
    status_wo, note_wo = _check_aggregate_tolerance(delta_wo)
    report["aggregate_checks"]["sum_wo_vat"] = {
        "sum_lines": float(sum_subtotal),
        "doc_value": float(amount_wo),
        "delta": float(delta_wo),
        "status": status_wo,
        "note": note_wo,
    }
    if status_wo == "FAIL":
        errors.append(f"Σsubtotal: {sum_subtotal:.2f} ≠ doc.wo {amount_wo:.2f} (Δ={delta_wo:.4f})")
    elif status_wo == "WARN":
        warnings.append(f"Σsubtotal: Δ={delta_wo:.4f} within tolerance")

    # === CHECK 2: Σ(vat) vs vat_amount ===
    if not separate_vat:
        status_vat, note_vat = _check_aggregate_tolerance(delta_vat)
        report["aggregate_checks"]["sum_vat"] = {
            "sum_lines": float(sum_vat),
            "doc_value": float(vat_amount),
            "delta": float(delta_vat),
            "status": status_vat,
            "note": note_vat,
        }
        if status_vat == "FAIL":
            errors.append(f"Σvat: {sum_vat:.2f} ≠ doc.vat {vat_amount:.2f} (Δ={delta_vat:.4f})")
        elif status_vat == "WARN":
            warnings.append(f"Σvat: Δ={delta_vat:.4f} within tolerance")
    else:
        report["aggregate_checks"]["sum_vat"] = {
            "status": "SKIP",
            "reason": "separate_vat=True",
        }

    # === CHECK 3: Σ(total) vs amount_with_vat ===
    status_with, note_with = _check_aggregate_tolerance(delta_with)
    report["aggregate_checks"]["sum_with_vat"] = {
        "sum_lines": float(sum_total),
        "doc_value": float(amount_with),
        "delta": float(delta_with),
        "status": status_with,
        "note": note_with,
    }
    if status_with == "FAIL":
        errors.append(f"Σtotal: {sum_total:.2f} ≠ doc.with {amount_with:.2f} (Δ={delta_with:.4f})")
    elif status_with == "WARN":
        warnings.append(f"Σtotal: Δ={delta_with:.4f} within tolerance")

    # Сохраняем warnings
    if warnings:
        report["warnings"].extend(warnings)

    if errors:
        report["errors"].extend(errors)
        return False
    
    return True


def _check_aggregate_tolerance(delta: Decimal) -> tuple:
    """
    Проверяет дельту с учётом толерансов.
    
    Возвращает: (status, note)
    status: "PASS" | "WARN" | "FAIL"
    """
    # Exact match
    if delta <= DOC_TOLERANCE:
        return "PASS", "exact match"
    
    # Within tolerance
    if delta <= AGGREGATE_TOLERANCE:
        return "WARN", f"within tolerance (Δ={delta:.4f} ≤ {AGGREGATE_TOLERANCE})"
    
    # Too large
    return "FAIL", f"delta {delta:.4f} > tolerance {AGGREGATE_TOLERANCE}"




# from __future__ import annotations

# from decimal import Decimal
# import logging
# from typing import Tuple, Dict, Any

# logger = logging.getLogger("docscanner_app")

# # Толерантности
# DOC_TOLERANCE = Decimal("0.02")        # для точного совпадения
# LINE_TOLERANCE = Decimal("0.02")       # для строк
# AGGREGATE_TOLERANCE = Decimal("0.20")  # для агрегатов (допустимая дельта)


# def validate_document_math_for_export(db_doc, customer_user=None) -> Tuple[bool, Dict[str, Any]]:
#     """
#     Математическая валидация документа для экспорта.

#     Логика толерансов:
#       - delta ≤ 0.02: PASS (exact match)
#       - 0.02 < delta ≤ 0.20: PASS (within tolerance), если fix_delta=True — подгоняем
#       - delta > 0.20: FAIL

#     Возвращает: (is_valid: bool, report: dict)
#     """
#     logger.info(f"=== Starting math validation for document {getattr(db_doc, 'id', '?')} ===")
    
#     validation_report: Dict[str, Any] = {
#         "document_checks": {},
#         "line_checks": [],
#         "aggregate_checks": {},
#         "overall_status": "PASS",
#         "errors": [],
#         "warnings": [],
#         "adjustments": {},
#     }

#     # Проверяем fix_delta в extra_settings
#     fix_delta_enabled = _is_fix_delta_enabled(customer_user)
#     validation_report["fix_delta_enabled"] = fix_delta_enabled
#     logger.info(f"Doc {getattr(db_doc, 'id', '?')}: fix_delta_enabled={fix_delta_enabled}")

#     separate_vat = bool(getattr(db_doc, "separate_vat", False))
#     logger.info(f"Doc {getattr(db_doc, 'id', '?')}: separate_vat={separate_vat}")

#     # 1) Проверки документа
#     doc_checks_passed = _validate_document_totals(
#         db_doc=db_doc,
#         separate_vat=separate_vat,
#         report=validation_report,
#     )
#     logger.info(f"Doc {getattr(db_doc, 'id', '?')}: document_checks passed={doc_checks_passed}")

#     # 2) Проверки строк
#     line_items = list(db_doc.line_items.all())
#     if line_items:
#         logger.info(f"Doc {getattr(db_doc, 'id', '?')}: validating {len(line_items)} line items")
#         lines_passed = _validate_line_items(
#             line_items=line_items,
#             separate_vat=separate_vat,
#             report=validation_report,
#         )
#         logger.info(f"Doc {getattr(db_doc, 'id', '?')}: line_checks passed={lines_passed}")

#         # 3) Проверки агрегатов с возможной подгонкой
#         aggregates_passed = _validate_aggregates_with_adjustment(
#             db_doc=db_doc,
#             line_items=line_items,
#             separate_vat=separate_vat,
#             report=validation_report,
#             fix_delta_enabled=fix_delta_enabled,
#         )
#         logger.info(f"Doc {getattr(db_doc, 'id', '?')}: aggregate_checks passed={aggregates_passed}")
#     else:
#         logger.info(f"Doc {getattr(db_doc, 'id', '?')}: no line items, skipping line and aggregate checks")
#         lines_passed = True
#         aggregates_passed = True

#     is_valid = bool(doc_checks_passed and lines_passed and aggregates_passed)
#     validation_report["overall_status"] = "PASS" if is_valid else "FAIL"

#     if is_valid:
#         logger.info("Document %s: Math validation PASSED ✓", getattr(db_doc, "id", "?"))
#     else:
#         logger.warning(
#             "Document %s: Math validation FAILED. Errors: %d - %s",
#             getattr(db_doc, "id", "?"),
#             len(validation_report["errors"]),
#             validation_report["errors"]
#         )

#     return is_valid, validation_report


# # ===================== helpers =====================

# def _d(value) -> Decimal:
#     """Конвертирует в Decimal, None -> 0"""
#     if value is None:
#         return Decimal("0")
#     return Decimal(str(value))


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


# # ===================== document checks =====================

# def _validate_document_totals(db_doc, separate_vat: bool, report: Dict[str, Any]) -> bool:
#     """
#     CHECK 1: amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat
#     CHECK 2: (amount_wo_vat - invoice_discount_wo_vat) × vat_percent/100 ≈ vat_amount
#     """
#     amount_wo     = _d(getattr(db_doc, "amount_wo_vat", 0))
#     discount_wo   = _d(getattr(db_doc, "invoice_discount_wo_vat", 0))
#     discount_with = _d(getattr(db_doc, "invoice_discount_with_vat", 0))
#     vat_amount    = _d(getattr(db_doc, "vat_amount", 0))
#     amount_with   = _d(getattr(db_doc, "amount_with_vat", 0))
#     vat_percent   = _d(getattr(db_doc, "vat_percent", 0))

#     logger.info(
#         f"Doc {getattr(db_doc, 'id', '?')}: amount_wo={amount_wo}, discount_wo={discount_wo}, "
#         f"discount_with={discount_with}, vat_amount={vat_amount}, amount_with={amount_with}, vat_percent={vat_percent}"
#     )

#     errors = []

#     # CHECK 1 — базовое уравнение документа
#     expected_with_vat = amount_wo - discount_wo + vat_amount
#     delta = (expected_with_vat - amount_with).copy_abs()
#     match = delta <= DOC_TOLERANCE

#     logger.info(
#         f"Doc {getattr(db_doc, 'id', '?')} CHECK 1: expected_with_vat={expected_with_vat}, "
#         f"amount_with={amount_with}, delta={delta}, match={match}"
#     )

#     report["document_checks"]["basic_equation"] = {
#         "formula": "amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat",
#         "expected": float(expected_with_vat),
#         "actual": float(amount_with),
#         "delta": float(delta),
#         "match": match,
#         "tolerance": float(DOC_TOLERANCE),
#     }
#     if not match:
#         errors.append(
#             f"Doc equation: {expected_with_vat:.2f} ≠ {amount_with:.2f} (Δ={delta:.4f})"
#         )

#     # CHECK 2 — НДС через процент
#     # Пропускаем если: separate_vat=True ИЛИ vat_percent не задан/пустой/ноль
#     vat_percent_valid = vat_percent is not None and vat_percent != 0
#     if not separate_vat and vat_percent_valid and amount_wo != 0:
#         expected_vat = (amount_wo - discount_wo) * vat_percent / Decimal("100")
#         delta_vat = (expected_vat - vat_amount).copy_abs()
#         match_vat = delta_vat <= DOC_TOLERANCE

#         logger.info(
#             f"Doc {getattr(db_doc, 'id', '?')} CHECK 2: expected_vat={expected_vat}, "
#             f"vat_amount={vat_amount}, delta_vat={delta_vat}, match_vat={match_vat}"
#         )

#         report["document_checks"]["vat_percent_check"] = {
#             "formula": "(amount_wo_vat - invoice_discount_wo_vat) × vat_percent / 100",
#             "expected": float(expected_vat),
#             "actual": float(vat_amount),
#             "delta": float(delta_vat),
#             "match": match_vat,
#             "tolerance": float(DOC_TOLERANCE),
#         }
#         if not match_vat:
#             errors.append(
#                 f"Doc VAT %: {expected_vat:.2f} ≠ {vat_amount:.2f} (Δ={delta_vat:.4f})"
#             )
#     else:
#         skip_reason = "separate_vat=True" if separate_vat else "vat_percent not set or zero"
#         logger.info(f"Doc {getattr(db_doc, 'id', '?')} CHECK 2: SKIP ({skip_reason})")
#         report["document_checks"]["vat_percent_check"] = {
#             "status": "SKIP",
#             "reason": skip_reason,
#         }

#     if errors:
#         report["errors"].extend(errors)
#         logger.warning(f"Doc {getattr(db_doc, 'id', '?')}: document totals validation FAILED - {errors}")
#         return False
    
#     logger.info(f"Doc {getattr(db_doc, 'id', '?')}: document totals validation PASSED")
#     return True


# # ===================== line checks =====================

# def _validate_line_items(line_items, separate_vat: bool, report: Dict[str, Any]) -> bool:
#     """
#     Для каждой строки:
#       CHECK 1: price × quantity = subtotal
#       CHECK 2: subtotal + vat = total
#       CHECK 3: subtotal × vat_percent/100 = vat
#     """
#     errors = []

#     for idx, line in enumerate(line_items, start=1):
#         line_check: Dict[str, Any] = {
#             "line_number": idx,
#             "line_id": getattr(line, "line_id", None),
#             "checks": {},
#             "errors": [],
#         }

#         price       = _d(getattr(line, "price", 0))
#         qty         = _d(getattr(line, "quantity", 0))
#         subtotal    = _d(getattr(line, "subtotal", 0))
#         vat         = _d(getattr(line, "vat", 0))
#         vat_percent = _d(getattr(line, "vat_percent", 0))
#         total       = _d(getattr(line, "total", 0))

#         # CHECK 1
#         if price != 0 and qty != 0:
#             expected_subtotal = price * qty
#             delta = (expected_subtotal - subtotal).copy_abs()
#             match = delta <= LINE_TOLERANCE
#             line_check["checks"]["price_x_qty"] = {
#                 "expected": float(expected_subtotal),
#                 "actual": float(subtotal),
#                 "delta": float(delta),
#                 "match": match,
#             }
#             if not match:
#                 line_check["errors"].append(
#                     f"price×qty: {expected_subtotal:.2f} ≠ {subtotal:.2f} (Δ={delta:.4f})"
#                 )

#         # CHECK 2
#         if subtotal != 0 or vat != 0:
#             expected_total = subtotal + vat
#             delta = (expected_total - total).copy_abs()
#             match = delta <= LINE_TOLERANCE
#             line_check["checks"]["subtotal_plus_vat"] = {
#                 "expected": float(expected_total),
#                 "actual": float(total),
#                 "delta": float(delta),
#                 "match": match,
#             }
#             if not match:
#                 line_check["errors"].append(
#                     f"subtotal+vat: {expected_total:.2f} ≠ {total:.2f} (Δ={delta:.4f})"
#                 )

#         # CHECK 3
#         if not separate_vat and subtotal != 0 and vat_percent is not None:
#             expected_vat = subtotal * vat_percent / Decimal("100")
#             delta = (expected_vat - vat).copy_abs()
#             match = delta <= LINE_TOLERANCE
#             line_check["checks"]["vat_from_percent"] = {
#                 "expected": float(expected_vat),
#                 "actual": float(vat),
#                 "delta": float(delta),
#                 "match": match,
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
#         logger.warning(f"Line items validation FAILED - {errors}")
#         return False
    
#     logger.info("Line items validation PASSED")
#     return True


# # ===================== aggregate checks with adjustment =====================

# def _validate_aggregates_with_adjustment(
#     db_doc, 
#     line_items, 
#     separate_vat: bool, 
#     report: Dict[str, Any],
#     fix_delta_enabled: bool,
# ) -> bool:
#     """
#     Проверки агрегатов с Вариантом B:
    
#     - delta ≤ 0.02: PASS (exact match)
#     - 0.02 < delta ≤ 0.20: PASS + warning (если fix_delta=True — подгоняем)
#     - delta > 0.20: FAIL
#     """
#     # Агрегаты строк
#     sum_subtotal = sum(_d(getattr(li, "subtotal", 0)) for li in line_items)
#     sum_vat = sum(_d(getattr(li, "vat", 0)) for li in line_items)
#     sum_total = sum(_d(getattr(li, "total", 0)) for li in line_items)

#     # Поля документа
#     amount_wo = _d(getattr(db_doc, "amount_wo_vat", 0))
#     vat_amount = _d(getattr(db_doc, "vat_amount", 0))
#     amount_with = _d(getattr(db_doc, "amount_with_vat", 0))

#     logger.info(
#         f"Doc {getattr(db_doc, 'id', '?')} aggregates: "
#         f"sum_subtotal={sum_subtotal}, sum_vat={sum_vat}, sum_total={sum_total}"
#     )
#     logger.info(
#         f"Doc {getattr(db_doc, 'id', '?')} doc values: "
#         f"amount_wo={amount_wo}, vat_amount={vat_amount}, amount_with={amount_with}"
#     )

#     # Вычисляем дельты
#     delta_wo = (sum_subtotal - amount_wo).copy_abs()
#     delta_vat = (sum_vat - vat_amount).copy_abs()
#     delta_with = (sum_total - amount_with).copy_abs()

#     logger.info(
#         f"Doc {getattr(db_doc, 'id', '?')} deltas: "
#         f"delta_wo={delta_wo}, delta_vat={delta_vat}, delta_with={delta_with}"
#     )

#     errors = []
#     warnings = []
#     adjustments = {}
#     all_passed = True

#     # === CHECK 1: Σ(subtotal) vs amount_wo_vat ===
#     status_wo, note_wo, adj_wo = _check_aggregate_with_tolerance(
#         field_name="amount_wo_vat",
#         sum_value=sum_subtotal,
#         doc_value=amount_wo,
#         delta=delta_wo,
#         fix_delta_enabled=fix_delta_enabled,
#         db_doc=db_doc,
#     )
    
#     report["aggregate_checks"]["sum_wo_vat"] = {
#         "sum_lines": float(sum_subtotal),
#         "doc_value": float(amount_wo),
#         "delta": float(delta_wo),
#         "status": status_wo,
#         "note": note_wo,
#     }
    
#     if status_wo == "FAIL":
#         errors.append(f"Σsubtotal: {sum_subtotal:.2f} ≠ doc.wo {amount_wo:.2f} (Δ={delta_wo:.4f})")
#         all_passed = False
#     elif status_wo == "WARN":
#         warnings.append(f"Σsubtotal: Δ={delta_wo:.4f} within tolerance")
#     if adj_wo:
#         adjustments["amount_wo_vat"] = adj_wo

#     # === CHECK 2: Σ(vat) vs vat_amount ===
#     if not separate_vat:
#         status_vat, note_vat, adj_vat = _check_aggregate_with_tolerance(
#             field_name="vat_amount",
#             sum_value=sum_vat,
#             doc_value=vat_amount,
#             delta=delta_vat,
#             fix_delta_enabled=fix_delta_enabled,
#             db_doc=db_doc,
#         )
        
#         report["aggregate_checks"]["sum_vat"] = {
#             "sum_lines": float(sum_vat),
#             "doc_value": float(vat_amount),
#             "delta": float(delta_vat),
#             "status": status_vat,
#             "note": note_vat,
#         }
        
#         if status_vat == "FAIL":
#             errors.append(f"Σvat: {sum_vat:.2f} ≠ doc.vat {vat_amount:.2f} (Δ={delta_vat:.4f})")
#             all_passed = False
#         elif status_vat == "WARN":
#             warnings.append(f"Σvat: Δ={delta_vat:.4f} within tolerance")
#         if adj_vat:
#             adjustments["vat_amount"] = adj_vat
#     else:
#         report["aggregate_checks"]["sum_vat"] = {
#             "status": "SKIP",
#             "reason": "separate_vat=True",
#         }

#     # === CHECK 3: Σ(total) vs amount_with_vat ===
#     status_with, note_with, adj_with = _check_aggregate_with_tolerance(
#         field_name="amount_with_vat",
#         sum_value=sum_total,
#         doc_value=amount_with,
#         delta=delta_with,
#         fix_delta_enabled=fix_delta_enabled,
#         db_doc=db_doc,
#     )
    
#     report["aggregate_checks"]["sum_with_vat"] = {
#         "sum_lines": float(sum_total),
#         "doc_value": float(amount_with),
#         "delta": float(delta_with),
#         "status": status_with,
#         "note": note_with,
#     }
    
#     if status_with == "FAIL":
#         errors.append(f"Σtotal: {sum_total:.2f} ≠ doc.with {amount_with:.2f} (Δ={delta_with:.4f})")
#         all_passed = False
#     elif status_with == "WARN":
#         warnings.append(f"Σtotal: Δ={delta_with:.4f} within tolerance")
#     if adj_with:
#         adjustments["amount_with_vat"] = adj_with

#     # Сохраняем warnings и adjustments
#     if warnings:
#         report["warnings"].extend(warnings)
#     if adjustments:
#         report["adjustments"] = adjustments
#         # Сохраняем документ если были изменения
#         if fix_delta_enabled:
#             try:
#                 update_fields = list(adjustments.keys())
#                 db_doc.save(update_fields=update_fields)
#                 logger.info(f"Doc {getattr(db_doc, 'id', '?')}: saved adjusted values: {update_fields}")
#             except Exception as e:
#                 logger.error(f"Doc {getattr(db_doc, 'id', '?')}: failed to save adjustments: {e}")

#     if errors:
#         report["errors"].extend(errors)
#         logger.warning(f"Doc {getattr(db_doc, 'id', '?')}: aggregates validation FAILED - {errors}")
#         return False
    
#     if warnings:
#         logger.warning(f"Doc {getattr(db_doc, 'id', '?')}: aggregates validation PASSED with warnings - {warnings}")
#     else:
#         logger.info(f"Doc {getattr(db_doc, 'id', '?')}: aggregates validation PASSED")
    
#     return True


# def _check_aggregate_with_tolerance(
#     field_name: str,
#     sum_value: Decimal,
#     doc_value: Decimal,
#     delta: Decimal,
#     fix_delta_enabled: bool,
#     db_doc,
# ) -> tuple:
#     """
#     Проверяет агрегат с учётом толерансов.
    
#     Возвращает: (status, note, adjustment_dict или None)
    
#     status: "PASS" | "WARN" | "FAIL"
#     """
#     # Exact match
#     if delta <= DOC_TOLERANCE:
#         return "PASS", "exact match", None
    
#     # Within tolerance
#     if delta <= AGGREGATE_TOLERANCE:
#         if fix_delta_enabled:
#             # Подгоняем документ
#             old_value = float(doc_value)
#             new_value = float(sum_value)
#             setattr(db_doc, field_name, new_value)
#             adjustment = {
#                 "old": old_value,
#                 "new": new_value,
#                 "delta": float(delta),
#             }
#             note = f"adjusted: {old_value:.2f} → {new_value:.2f} (Δ={delta:.4f})"
#             logger.info(f"Doc {getattr(db_doc, 'id', '?')}: {field_name} {note}")
#             return "PASS", note, adjustment
#         else:
#             # Пропускаем с предупреждением
#             note = f"within tolerance (Δ={delta:.4f} ≤ {AGGREGATE_TOLERANCE}), not adjusted (fix_delta=False)"
#             logger.warning(f"Doc {getattr(db_doc, 'id', '?')}: {field_name} {note}")
#             return "WARN", note, None
    
#     # Too large
#     note = f"delta {delta:.4f} > tolerance {AGGREGATE_TOLERANCE}"
#     return "FAIL", note, None
