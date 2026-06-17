"""
Применяет правила замены контрагентов (company_replace_rules)
к ScannedDocument сразу после OCR-парсинга.

Вызывается из save_documents.update_scanned_document
ПОСЛЕ _apply_top_level_fields и ДО _save_line_items.
"""

import logging

from ..validators.company_name_normalizer import normalize_company_name_v2

logger = logging.getLogger("docscanner_app")


def _norm(val):
    """Нормализация строки для сравнения."""
    return (str(val) if val else "").strip().upper()


def _matches_side(rule, side_data):
    """
    Проверяет, совпадают ли ВСЕ непустые условия правила
    с данными одной стороны (buyer или seller).
    Если все условия пустые — не матчим (нет смысла).
    """
    conditions_checked = 0

    # Pavadinimas — нормализованное сравнение (contains)
    match_pav = (rule.get("match_pavadinimas") or "").strip()
    if match_pav:
        conditions_checked += 1
        side_name_norm = normalize_company_name_v2(side_data.get("name") or "")
        match_pav_norm = normalize_company_name_v2(match_pav)
        if not side_name_norm or not match_pav_norm:
            return False
        if match_pav_norm not in side_name_norm and side_name_norm not in match_pav_norm:
            # Пробуем точное совпадение и contains в обе стороны
            if match_pav_norm != side_name_norm:
                return False

    # Kodas — точное совпадение
    match_kodas = _norm(rule.get("match_kodas"))
    if match_kodas:
        conditions_checked += 1
        if _norm(side_data.get("id")) != match_kodas:
            return False

    # PVM kodas — точное совпадение
    match_pvm = _norm(rule.get("match_pvm_kodas"))
    if match_pvm:
        conditions_checked += 1
        if _norm(side_data.get("vat_code")) != match_pvm:
            return False

    # Šalies kodas — точное совпадение ISO
    match_country = _norm(rule.get("match_salies_kodas"))
    if match_country:
        conditions_checked += 1
        if _norm(side_data.get("country_iso")) != match_country:
            return False

    # Tipas: fizinis / juridinis
    match_tipas = (rule.get("match_tipas") or "").strip().lower()
    if match_tipas:
        conditions_checked += 1
        is_person = side_data.get("is_person")
        if match_tipas == "fizinis" and is_person is not True:
            return False
        if match_tipas == "juridinis" and is_person is not False:
            return False

    # Если ни одного условия не было — не матчим
    return conditions_checked > 0


def _extract_side(db_doc, side: str) -> dict:
    """Извлекает данные стороны из документа."""
    prefix = side  # "buyer" или "seller"
    return {
        "name": getattr(db_doc, f"{prefix}_name", None),
        "id": getattr(db_doc, f"{prefix}_id", None),
        "vat_code": getattr(db_doc, f"{prefix}_vat_code", None),
        "country_iso": getattr(db_doc, f"{prefix}_country_iso", None),
        "is_person": getattr(db_doc, f"{prefix}_is_person", None),
    }


def _apply_result_to_side(db_doc, rule, side: str) -> bool:
    """
    Применяет result-поля правила к указанной стороне документа.
    Заменяет ТОЛЬКО непустые result-поля.
    Возвращает True если хоть что-то изменилось.
    """
    prefix = side
    changed = False

    mapping = {
        "result_pavadinimas": f"{prefix}_name",
        "result_kodas": f"{prefix}_id",
        "result_pvm_kodas": f"{prefix}_vat_code",
        "result_salies_kodas": f"{prefix}_country_iso",
    }

    for rule_key, doc_field in mapping.items():
        val = (rule.get(rule_key) or "").strip()
        if val:
            old_val = getattr(db_doc, doc_field, None)
            setattr(db_doc, doc_field, val)
            changed = True
            logger.info(
                "company_replace_rule[%s]: %s: %r → %r",
                rule.get("id", "?"), doc_field, old_val, val,
            )

    # Tipas: fizinis/juridinis → is_person
    result_tipas = (rule.get("result_tipas") or "").strip().lower()
    if result_tipas:
        old_val = getattr(db_doc, f"{prefix}_is_person", None)
        new_val = True if result_tipas == "fizinis" else False
        setattr(db_doc, f"{prefix}_is_person", new_val)
        changed = True
        logger.info(
            "company_replace_rule[%s]: %s_is_person: %r → %r",
            rule.get("id", "?"), prefix, old_val, new_val,
        )

    # Обновляем нормализованное имя если менялось имя
    if (rule.get("result_pavadinimas") or "").strip():
        norm_field = f"{prefix}_name_normalized"
        new_name = getattr(db_doc, f"{prefix}_name", "")
        setattr(db_doc, norm_field, normalize_company_name_v2(new_name))

    return changed


def apply_company_replace_rules(db_doc, user) -> int:
    """
    Применяет правила замены контрагентов из user.company_replace_rules.
    
    Логика change_target:
      - "" (пусто)      → проверяем и buyer, и seller; заменяем совпавших
      - "buyer_only"     → проверяем только buyer
      - "seller_only"    → проверяем только seller
    
    Возвращает количество применённых замен.
    """
    rules = getattr(user, "company_replace_rules", None)
    if not rules or not isinstance(rules, list):
        return 0

    total_applied = 0

    for rule in rules:
        if not isinstance(rule, dict):
            continue
        if not rule.get("enabled", True):
            continue

        change_target = (rule.get("change_target") or "").strip().lower()

        # Определяем какие стороны проверять
        check_buyer = change_target in ("", "buyer_only")
        check_seller = change_target in ("", "seller_only")

        buyer_matched = False
        seller_matched = False

        if check_buyer:
            buyer_data = _extract_side(db_doc, "buyer")
            buyer_matched = _matches_side(rule, buyer_data)

        if check_seller:
            seller_data = _extract_side(db_doc, "seller")
            seller_matched = _matches_side(rule, seller_data)

        if buyer_matched:
            if _apply_result_to_side(db_doc, rule, "buyer"):
                db_doc.buyer_replaced_by_rule = True
                total_applied += 1
                logger.info(
                    "company_replace_rule[%s] applied to BUYER (doc=%s)",
                    rule.get("id", "?"), db_doc.pk,
                )

        if seller_matched:
            if _apply_result_to_side(db_doc, rule, "seller"):
                db_doc.seller_replaced_by_rule = True
                total_applied += 1
                logger.info(
                    "company_replace_rule[%s] applied to SELLER (doc=%s)",
                    rule.get("id", "?"), db_doc.pk,
                )

    return total_applied