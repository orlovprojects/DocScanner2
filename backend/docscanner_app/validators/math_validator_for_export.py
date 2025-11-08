# validators/math_validator_for_export.py

from decimal import Decimal
import logging

logger = logging.getLogger("docscanner_app")

# Толерантности
DOC_TOLERANCE = Decimal("0.02")    # для документа
LINE_TOLERANCE = Decimal("0.02")   # для строк


def validate_document_math_for_export(db_doc) -> tuple[bool, dict]:
    """
    Математическая валидация документа для экспорта.
    
    Проверки документа:
    1. amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat
    2. amount_wo_vat × vat_percent/100 ≈ vat_amount (если separate_vat=False)
    
    Проверки строк (если есть):
    1. price × quantity = subtotal
    2. subtotal + vat = total
    3. subtotal × vat_percent/100 = vat (если separate_vat=False)
    
    Проверки агрегатов (если есть строки):
    1. Σ(subtotal) = amount_wo_vat - invoice_discount_wo_vat
    2. Σ(vat) = vat_amount (если separate_vat=False)
    3. Σ(total) = amount_with_vat
    
    Returns:
        (is_valid: bool, report: dict)
    """
    validation_report = {
        "document_checks": {},
        "line_checks": [],
        "aggregate_checks": {},
        "overall_status": "PASS",
        "errors": []
    }
    
    separate_vat = db_doc.separate_vat or False
    
    # ========== 1. ПРОВЕРКИ ДОКУМЕНТА ==========
    doc_checks_passed = _validate_document_totals(
        db_doc, 
        separate_vat, 
        validation_report
    )
    
    # ========== 2. ПРОВЕРКИ СТРОК ==========
    line_items = db_doc.line_items.all()
    
    if line_items.exists():
        lines_passed = _validate_line_items(
            line_items,
            separate_vat,
            validation_report
        )
        
        # ========== 3. ПРОВЕРКИ АГРЕГАТОВ ==========
        aggregates_passed = _validate_aggregates(
            db_doc,
            line_items,
            separate_vat,
            validation_report
        )
    else:
        lines_passed = True
        aggregates_passed = True
    
    # ========== ИТОГ ==========
    is_valid = doc_checks_passed and lines_passed and aggregates_passed
    validation_report["overall_status"] = "PASS" if is_valid else "FAIL"
    
    if is_valid:
        logger.info(f"Document {db_doc.id}: Math validation PASSED ✓")
    else:
        logger.warning(
            f"Document {db_doc.id}: Math validation FAILED. "
            f"Errors: {len(validation_report['errors'])}"
        )
    
    return is_valid, validation_report




def _validate_document_totals(db_doc, separate_vat, report):
    """
    CHECK 1: amount_wo_vat - invoice_discount_wo_vat + vat_amount = amount_with_vat
    CHECK 2: amount_wo_vat × vat_percent/100 ≈ vat_amount (если separate_vat=False)
    """
    amount_wo = _d(db_doc.amount_wo_vat)
    discount_wo = _d(db_doc.invoice_discount_wo_vat)
    vat_amount = _d(db_doc.vat_amount)
    amount_with = _d(db_doc.amount_with_vat)
    vat_percent = _d(db_doc.vat_percent)
    
    errors = []
    
    # CHECK 1: Базовое уравнение
    expected_with_vat = amount_wo - discount_wo + vat_amount
    delta = abs(expected_with_vat - amount_with)
    match = delta <= DOC_TOLERANCE
    
    report["document_checks"]["basic_equation"] = {
        "formula": "amount_wo_vat - discount_wo_vat + vat_amount = amount_with_vat",
        "expected": float(expected_with_vat),
        "actual": float(amount_with),
        "delta": float(delta),
        "match": match,
        "tolerance": float(DOC_TOLERANCE)
    }
    
    if not match:
        errors.append(
            f"Doc equation: {expected_with_vat:.2f} ≠ {amount_with:.2f} (Δ={delta:.4f})"
        )
    
    # CHECK 2: Проверка НДС через процент (только если separate_vat=False)
    if not separate_vat and vat_percent is not None and amount_wo != 0:
        expected_vat = (amount_wo - discount_wo) * vat_percent / Decimal("100")
        delta_vat = abs(expected_vat - vat_amount)
        match_vat = delta_vat <= DOC_TOLERANCE
        
        report["document_checks"]["vat_percent_check"] = {
            "formula": "(amount_wo_vat - discount_wo_vat) × vat_percent / 100",
            "expected": float(expected_vat),
            "actual": float(vat_amount),
            "delta": float(delta_vat),
            "match": match_vat,
            "tolerance": float(DOC_TOLERANCE)
        }
        
        if not match_vat:
            errors.append(
                f"Doc VAT %: {expected_vat:.2f} ≠ {vat_amount:.2f} (Δ={delta_vat:.4f})"
            )
    else:
        report["document_checks"]["vat_percent_check"] = {
            "status": "SKIP",
            "reason": "separate_vat=True" if separate_vat else "vat_percent not set"
        }
    
    if errors:
        report["errors"].extend(errors)
        return False
    
    return True





def _validate_line_items(line_items, separate_vat, report):
    """
    Для каждой строки:
    CHECK 1: price × quantity = subtotal
    CHECK 2: subtotal + vat = total
    CHECK 3: subtotal × vat_percent/100 = vat (если separate_vat=False)
    """
    errors = []
    
    for idx, line in enumerate(line_items, start=1):
        line_check = {
            "line_number": idx,
            "line_id": line.line_id,
            "checks": {},
            "errors": []
        }
        
        price = _d(line.price)
        qty = _d(line.quantity)
        subtotal = _d(line.subtotal)
        vat = _d(line.vat)
        vat_percent = _d(line.vat_percent)
        total = _d(line.total)
        
        # CHECK 1: price × quantity = subtotal
        if price != 0 and qty != 0:
            expected_subtotal = price * qty
            delta = abs(expected_subtotal - subtotal)
            match = delta <= LINE_TOLERANCE
            
            line_check["checks"]["price_x_qty"] = {
                "expected": float(expected_subtotal),
                "actual": float(subtotal),
                "delta": float(delta),
                "match": match
            }
            
            if not match:
                line_check["errors"].append(
                    f"price×qty: {expected_subtotal:.2f} ≠ {subtotal:.2f} (Δ={delta:.4f})"
                )
        
        # CHECK 2: subtotal + vat = total
        if subtotal != 0 or vat != 0:
            expected_total = subtotal + vat
            delta = abs(expected_total - total)
            match = delta <= LINE_TOLERANCE
            
            line_check["checks"]["subtotal_plus_vat"] = {
                "expected": float(expected_total),
                "actual": float(total),
                "delta": float(delta),
                "match": match
            }
            
            if not match:
                line_check["errors"].append(
                    f"subtotal+vat: {expected_total:.2f} ≠ {total:.2f} (Δ={delta:.4f})"
                )
        
        # CHECK 3: subtotal × vat_percent/100 = vat (только если separate_vat=False)
        if not separate_vat and subtotal != 0 and vat_percent is not None:
            expected_vat = subtotal * vat_percent / Decimal("100")
            delta = abs(expected_vat - vat)
            match = delta <= LINE_TOLERANCE
            
            line_check["checks"]["vat_from_percent"] = {
                "expected": float(expected_vat),
                "actual": float(vat),
                "delta": float(delta),
                "match": match
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




def _validate_aggregates(db_doc, line_items, separate_vat, report):
    """
    CHECK 1: Σ(subtotal) = amount_wo_vat - invoice_discount_wo_vat
    CHECK 2: Σ(vat) = vat_amount (если separate_vat=False)
    CHECK 3: Σ(total) = amount_with_vat
    """
    # Суммы из строк
    sum_subtotal = sum(_d(li.subtotal) for li in line_items)
    sum_vat = sum(_d(li.vat) for li in line_items)
    sum_total = sum(_d(li.total) for li in line_items)
    
    # Суммы из документа
    amount_wo = _d(db_doc.amount_wo_vat)
    discount_wo = _d(db_doc.invoice_discount_wo_vat)
    vat_amount = _d(db_doc.vat_amount)
    amount_with = _d(db_doc.amount_with_vat)
    
    errors = []
    
    # CHECK 1: Σ(subtotal) = amount_wo_vat - invoice_discount_wo_vat
    expected_wo = amount_wo - discount_wo
    delta_wo = abs(sum_subtotal - expected_wo)
    match_wo = delta_wo <= DOC_TOLERANCE
    
    report["aggregate_checks"]["sum_wo_vat"] = {
        "sum_lines": float(sum_subtotal),
        "doc_value": float(expected_wo),
        "delta": float(delta_wo),
        "match": match_wo
    }
    
    if not match_wo:
        errors.append(
            f"Σsubtotal: {sum_subtotal:.2f} ≠ doc {expected_wo:.2f} (Δ={delta_wo:.4f})"
        )
    
    # CHECK 2: Σ(vat) = vat_amount (только если separate_vat=False)
    if not separate_vat:
        delta_vat = abs(sum_vat - vat_amount)
        match_vat = delta_vat <= DOC_TOLERANCE
        
        report["aggregate_checks"]["sum_vat"] = {
            "sum_lines": float(sum_vat),
            "doc_value": float(vat_amount),
            "delta": float(delta_vat),
            "match": match_vat
        }
        
        if not match_vat:
            errors.append(
                f"Σvat: {sum_vat:.2f} ≠ doc {vat_amount:.2f} (Δ={delta_vat:.4f})"
            )
    else:
        report["aggregate_checks"]["sum_vat"] = {
            "status": "SKIP",
            "reason": "separate_vat=True"
        }
    
    # CHECK 3: Σ(total) = amount_with_vat
    delta_with = abs(sum_total - amount_with)
    match_with = delta_with <= DOC_TOLERANCE
    
    report["aggregate_checks"]["sum_with_vat"] = {
        "sum_lines": float(sum_total),
        "doc_value": float(amount_with),
        "delta": float(delta_with),
        "match": match_with
    }
    
    if not match_with:
        errors.append(
            f"Σtotal: {sum_total:.2f} ≠ doc {amount_with:.2f} (Δ={delta_with:.4f})"
        )
    
    if errors:
        report["errors"].extend(errors)
        return False
    
    return True


def _d(value):
    """Конвертирует в Decimal, None -> 0"""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))





