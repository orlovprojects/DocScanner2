from typing import Any, Dict, List, Optional
from decimal import Decimal
import logging
import random

from django.db import transaction

from ..models import LineItem
from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from ..utils.data_resolver import (
    resolve_document_amounts,
    resolve_line_items,
)
from ..validators.default_currency import set_default_currency
from ..validators.vat_klas import auto_select_pvm_code  # новая сигнатура (см. вызовы ниже)
from ..validators.currency_converter import to_iso_currency

# Санитайзеры
from ..utils.parsers import (
    sanitize_document_struct,
    sanitize_line_item,
    convert_for_json,
    normalize_unit,
    normalize_code_field,
)
from ..validators.extra_validators import apply_user_extra_settings
from ..validators.required_fields_checker import check_required_fields_for_export
from ..validators.math_validator_for_export import validate_document_math_for_export


logger = logging.getLogger("docscanner_app")


def _gen_program_id7() -> str:
    """7-значный код без ведущего нуля (для *_id_programoje)."""
    return str(random.randint(1_000_000, 9_999_999))


def _apply_top_level_fields(
    db_doc, doc_struct: Dict[str, Any], user, scan_type: str, raw_text: str, preview_url: Optional[str], glued_raw_text: str = "",
):
    """
    Заполняет поля ScannedDocument из уже САНИТИЗИРОВАННОГО doc_struct.
    Ничего не подставляет из пользовательских дефолтов. В конце выставляет
    служебный флажок db_doc._can_apply_defaults (не сохраняется в БД).
    """
    # Базовые технические поля
    db_doc.raw_text = raw_text
    db_doc.glued_raw_text = glued_raw_text
    db_doc.preview_url = preview_url
    db_doc.structured_json = convert_for_json(doc_struct)

    # --- Основные поля ---
    db_doc.seller_id = doc_struct.get("seller_id")
    db_doc.seller_name = doc_struct.get("seller_name")
    db_doc.seller_vat_code = doc_struct.get("seller_vat_code")
    db_doc.seller_address = doc_struct.get("seller_address")
    db_doc.seller_country = doc_struct.get("seller_country")
    db_doc.seller_country_iso = doc_struct.get("seller_country_iso")
    db_doc.seller_iban = doc_struct.get("seller_iban")
    db_doc.seller_is_person = doc_struct.get("seller_is_person")

    db_doc.buyer_id = doc_struct.get("buyer_id")
    db_doc.buyer_name = doc_struct.get("buyer_name")
    db_doc.buyer_vat_code = doc_struct.get("buyer_vat_code")
    db_doc.buyer_address = doc_struct.get("buyer_address")
    db_doc.buyer_country = doc_struct.get("buyer_country")
    db_doc.buyer_country_iso = doc_struct.get("buyer_country_iso")
    db_doc.buyer_iban = doc_struct.get("buyer_iban")
    db_doc.buyer_is_person = doc_struct.get("buyer_is_person")

    # --- Автогенерация *_id_programoje, если пусты *_id и *_vat_code ---
    try:
        if not (str(db_doc.seller_id or "").strip()) and not (str(db_doc.seller_vat_code or "").strip()):
            if not str(getattr(db_doc, "seller_id_programoje", "") or "").strip():
                db_doc.seller_id_programoje = _gen_program_id7()
                logger.info("seller_id_programoje auto-set to %s", db_doc.seller_id_programoje)
    except Exception as e:
        logger.warning("failed to set seller_id_programoje: %s", e)

    try:
        if not (str(db_doc.buyer_id or "").strip()) and not (str(db_doc.buyer_vat_code or "").strip()):
            if not str(getattr(db_doc, "buyer_id_programoje", "") or "").strip():
                db_doc.buyer_id_programoje = _gen_program_id7()
                logger.info("buyer_id_programoje auto-set to %s", db_doc.buyer_id_programoje)
    except Exception as e:
        logger.warning("failed to set buyer_id_programoje: %s", e)

    db_doc.invoice_date = doc_struct.get("invoice_date")
    db_doc.due_date = doc_struct.get("due_date")
    db_doc.operation_date = doc_struct.get("operation_date")
    db_doc.document_series = normalize_code_field(doc_struct.get("document_series"))
    db_doc.document_number = normalize_code_field(doc_struct.get("document_number"))
    db_doc.order_number = doc_struct.get("order_number")

    db_doc.amount_wo_vat = doc_struct.get("amount_wo_vat")
    db_doc.invoice_discount_with_vat = doc_struct.get("invoice_discount_with_vat")
    db_doc.invoice_discount_wo_vat = doc_struct.get("invoice_discount_wo_vat")
    db_doc.vat_amount = doc_struct.get("vat_amount")
    db_doc.vat_percent = doc_struct.get("vat_percent")
    db_doc.amount_with_vat = doc_struct.get("amount_with_vat")

    # NEW: дефолт для режима ставок
    db_doc.separate_vat = doc_struct.get("separate_vat", False)

    # 1) конвертируем символ/префикс → ISO3
    raw_currency = doc_struct.get("currency")
    normalized_currency = to_iso_currency(raw_currency)

    # 2) если результат не строгий ISO-4217 (ровно 3 буквы), считаем, что валюты нет
    if not (isinstance(normalized_currency, str) and len(normalized_currency) == 3 and normalized_currency.isalpha()):
        normalized_currency = None

    # 3) выставляем дефолт (если None/пусто)
    db_doc.currency = set_default_currency(normalized_currency)

    db_doc.with_receipt = doc_struct.get("with_receipt")
    db_doc.paid_by_cash = doc_struct.get("paid_by_cash")
    db_doc.document_type = doc_struct.get("document_type")

    db_doc.similarity_percent = doc_struct.get("similarity_percent")
    db_doc.note = doc_struct.get("note")
    db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
    db_doc.document_type_code = doc_struct.get("document_type_code")
    db_doc.xml_source = doc_struct.get("xml_source")

    # --- Короткие продуктовые поля для sumiskai (ТОЛЬКО из OCR/LLM) ---
    if scan_type == "sumiskai":
        if "line_items" in doc_struct and doc_struct["line_items"]:
            first_item = doc_struct["line_items"][0]
        else:
            first_item = doc_struct

        db_doc.prekes_kodas = first_item.get("product_code") or ""
        db_doc.prekes_barkodas = first_item.get("product_barcode") or ""
        db_doc.prekes_pavadinimas = first_item.get("product_name") or ""
        db_doc.prekes_tipas = first_item.get("prekes_tipas") or ""
        db_doc.preke_paslauga = first_item.get("preke_paslauga")
        db_doc.sandelio_kodas = first_item.get("sandelio_kodas") or ""
        db_doc.sandelio_pavadinimas = first_item.get("sandelio_pavadinimas") or ""
        db_doc.objekto_kodas = first_item.get("objekto_kodas") or ""
        db_doc.objekto_pavadinimas = first_item.get("objekto_pavadinimas") or ""
        db_doc.padalinio_kodas = first_item.get("padalinio_kodas") or ""
        db_doc.padalinio_pavadinimas = first_item.get("padalinio_pavadinimas") or ""
        db_doc.mokescio_kodas = first_item.get("mokescio_kodas") or ""
        db_doc.mokescio_pavadinimas = first_item.get("mokescio_pavadinimas") or ""
        db_doc.atsakingo_asmens_kodas = first_item.get("atsakingo_asmens_kodas") or ""
        db_doc.atsakingo_asmens_pavadinimas = first_item.get("atsakingo_asmens_pavadinimas") or ""
        db_doc.operacijos_kodas = first_item.get("operacijos_kodas") or ""
        db_doc.operacijos_pavadinimas = first_item.get("operacijos_pavadinimas") or ""
        db_doc.islaidu_straipsnio_kodas = first_item.get("islaidu_straipsnio_kodas") or ""
        db_doc.islaidu_straipsnio_pavadinimas = first_item.get("islaidu_straipsnio_pavadinimas") or ""
        db_doc.pvm_kodas = first_item.get("pvm_kodas") or ""
        db_doc.pvm_pavadinimas = first_item.get("pvm_pavadinimas") or ""
        db_doc.tipo_kodas = first_item.get("tipo_kodas") or ""
        db_doc.tipo_pavadinimas = first_item.get("tipo_pavadinimas") or ""
        db_doc.zurnalo_kodas = first_item.get("zurnalo_kodas") or ""
        db_doc.zurnalo_pavadinimas = first_item.get("zurnalo_pavadinimas") or ""
        db_doc.projekto_kodas = first_item.get("projekto_kodas") or ""
        db_doc.projekto_pavadinimas = first_item.get("projekto_pavadinimas") or ""
        db_doc.projekto_vadovo_kodas = first_item.get("projekto_vadovo_kodas") or ""
        db_doc.projekto_vadovo_pavadinimas = first_item.get("projekto_vadovo_pavadinimas") or ""
        db_doc.skyrio_kodas = first_item.get("skyrio_kodas") or ""
        db_doc.skyrio_pavadinimas = first_item.get("skyrio_pavadinimas") or ""
        db_doc.partijos_nr_kodas = first_item.get("partijos_nr_kodas") or ""
        db_doc.partijos_nr_pavadinimas = first_item.get("partijos_nr_pavadinimas") or ""
        db_doc.korespondencijos_kodas = first_item.get("korespondencijos_kodas") or ""
        db_doc.korespondencijos_pavadinimas = first_item.get("korespondencijos_pavadinimas") or ""
        db_doc.serijos_kodas = first_item.get("serijos_kodas") or ""
        db_doc.serijos_pavadinimas = first_item.get("serijos_pavadinimas") or ""
        db_doc.centro_kodas = first_item.get("centro_kodas") or ""
        db_doc.centro_pavadinimas = first_item.get("centro_pavadinimas") or ""
    else:
        # detaliai — чистим короткие поля
        db_doc.prekes_kodas = ""
        db_doc.prekes_barkodas = ""
        db_doc.prekes_pavadinimas = ""
        db_doc.prekes_tipas = ""
        db_doc.preke_paslauga = ""
        db_doc.sandelio_kodas = ""
        db_doc.sandelio_pavadinimas = ""
        db_doc.objekto_kodas = ""
        db_doc.objekto_pavadinimas = ""
        db_doc.padalinio_kodas = ""
        db_doc.padalinio_pavadinimas = ""
        db_doc.mokescio_kodas = ""
        db_doc.mokescio_pavadinimas = ""
        db_doc.atsakingo_asmens_kodas = ""
        db_doc.atsakingo_asmens_pavadinimas = ""
        db_doc.operacijos_kodas = ""
        db_doc.operacijos_pavadinimas = ""
        db_doc.islaidu_straipsnio_kodas = ""
        db_doc.islaidu_straipsnio_pavadinimas = ""
        db_doc.pvm_kodas = ""
        db_doc.pvm_pavadinimas = ""
        db_doc.tipo_kodas = ""
        db_doc.tipo_pavadinimas = ""
        db_doc.zurnalo_kodas = ""
        db_doc.zurnalo_pavadinimas = ""
        db_doc.projekто_kodas = ""
        db_doc.projekto_pavadinimas = ""
        db_doc.projekto_vadovo_kodas = ""
        db_doc.projekto_vadovo_pavadinimas = ""
        db_doc.skyrio_kodas = ""
        db_doc.skyrio_pavadinimas = ""
        db_doc.partijos_nr_kodas = ""
        db_doc.partijos_nr_pavadinimas = ""
        db_doc.korespondencijos_kodas = ""
        db_doc.korespondencijos_pavadinimas = ""
        db_doc.serijos_kodas = ""
        db_doc.serijos_pavadinimas = ""
        db_doc.centro_kodas = ""
        db_doc.centro_pavadinimas = ""

    # Определяем pirkimas/pardavimas
    db_doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, user)

    # Булевы флаги наличия PVM кода у сторон (для классификатора)
    try:
        db_doc.buyer_has_vat_code = bool((db_doc.buyer_vat_code or "").strip())
    except Exception:
        pass
    try:
        db_doc.seller_has_vat_code = bool((db_doc.seller_vat_code or "").strip())
    except Exception:
        pass

    # --- Служебный флажок: дефолты можно применять в sumiskai, если указан ХОТЯ БЫ один контрагент ---
    has_buyer = any([
        (db_doc.buyer_id or "").strip(),
        (db_doc.buyer_vat_code or "").strip(),
        (db_doc.buyer_name or "").strip(),
    ])
    has_seller = any([
        (db_doc.seller_id or "").strip(),
        (db_doc.seller_vat_code or "").strip(),
        (db_doc.seller_name or "").strip(),
    ])

    db_doc._can_apply_defaults = (scan_type == "sumiskai") and (has_buyer or has_seller)



def _apply_sumiskai_defaults_from_user(db_doc, user) -> bool:
    """
    Применяет дефолты по фирме для sumiskai:
      - buyer сопоставляем с user.purchase_defaults
      - seller сопоставляем с user.sales_defaults
      - приоритет совпадения: įmonės_kodas → įmonės_PVM_kodas → нормализованное название
      - заполняем ТОЛЬКО пустые: prekes_pavadinimas, prekes_kodas, prekes_barkodas, preke_paslauga ("1"/"2"/"3"/"4")
      - ПРАВИЛО: если одна сторона заполнила ХОТЯ БЫ ОДНО поле, другая НЕ применяется вообще.
    """
    from docscanner_app.validators.company_name_normalizer import normalize_company_name

    # работаем только для sumiskai
    if (getattr(db_doc, "scan_type", None) or "").strip().lower() != "sumiskai":
        logger.info("Skip defaults: scan_type != sumiskai (%s)", db_doc.scan_type)
        return False

    # ---- helpers ----
    def _norm_code(x: str) -> str:
        return (x or "").strip().upper()

    def _party(side: str):
        name = getattr(db_doc, f"{side}_name", "") or ""
        return {
            "name": name,
            "name_norm": normalize_company_name(name),
            "vat":  _norm_code(getattr(db_doc, f"{side}_vat_code", "") or ""),
            "code": _norm_code(getattr(db_doc, f"{side}_id", "") or ""),  # įmonės kodas
        }

    buyer  = _party("buyer")
    seller = _party("seller")

    def _to_profiles(raw):
        import json
        if isinstance(raw, list):
            return raw
        if isinstance(raw, dict):
            return [raw]
        if isinstance(raw, str) and raw.strip():
            try:
                data = json.loads(raw)
                if isinstance(data, list):  return data
                if isinstance(data, dict):  return [data]
            except Exception as e:
                logger.warning("Failed to parse defaults JSON: %s", e)
        return []

    purchase_profiles = _to_profiles(getattr(user, "purchase_defaults", None))
    sales_profiles    = _to_profiles(getattr(user, "sales_defaults", None))
    logger.info("Defaults pool sizes: purchase=%d, sales=%d", len(purchase_profiles), len(sales_profiles))

    def _match_profile(party: dict, profiles: list):
        if not profiles:
            return None

        def _pf(x): return (x or "").strip()
        def _pf_code(x): return _norm_code(_pf(x))
        def _pf_name_norm(x): return normalize_company_name(_pf(x))

        # 1) įmonės_kodas
        if party["code"]:
            for p in profiles:
                if _pf_code(p.get("imones_kodas")) == party["code"]:
                    logger.info("Matched by imones_kodas: %s", party["code"])
                    return p
        # 2) įmonės_PVM_kodas
        if party["vat"]:
            for p in profiles:
                if _pf_code(p.get("imones_pvm_kodas")) == party["vat"]:
                    logger.info("Matched by imones_pvm_kodas: %s", party["vat"])
                    return p
        # 3) нормализованное название
        if party["name_norm"]:
            for p in profiles:
                if _pf_name_norm(p.get("imones_pavadinimas")) == party["name_norm"]:
                    logger.info("Matched by imones_pavadinimas(norm): %s", party["name_norm"])
                    return p
        return None

    def _norm_tipas_to_str(v):
        if v is None:
            return None
        s = str(v).strip().lower()
        mapping = {"preke": "1", "paslauga": "2", "kodas": "3"}
        if s in ("1", "2", "3"):
            return s
        if s in mapping:
            return mapping[s]
        try:
            i = int(s)
            if i in (1, 2, 3):
                return str(i)
        except Exception:
            pass
        return None

    # ставим значение только если поле пустое; возвращаем 1, если действительно поставили
    def _set_if_empty(field: str, value) -> int:
        cur = getattr(db_doc, field, None)
        if (str(cur).strip() if cur is not None else ""):
            return 0
        if value is None:
            return 0
        val_str = str(value).strip()
        if not val_str:
            return 0
        setattr(db_doc, field, val_str)
        logger.info("Default applied: %s = %r", field, val_str)
        return 1

    # применяем профиль; возвращаем, сколько полей реально поставили
    def _apply_from_profile(profile) -> int:
        if not profile:
            return 0
        applied = 0
        applied += _set_if_empty("prekes_pavadinimas", profile.get("pavadinimas"))
        applied += _set_if_empty("prekes_kodas",       profile.get("kodas"))
        applied += _set_if_empty("prekes_barkodas",    profile.get("barkodas"))
        tipas_norm = _norm_tipas_to_str(profile.get("tipas"))
        if tipas_norm:
            applied += _set_if_empty("preke_paslauga", tipas_norm)
        return applied

    changed_total = 0

    # 1) СНАЧАЛА buyer → purchase_defaults
    if any([buyer["code"], buyer["vat"], buyer["name"]]):
        buyer_profile = _match_profile(buyer, purchase_profiles)
        if buyer_profile:
            applied = _apply_from_profile(buyer_profile)
            changed_total += applied
            if applied > 0:
                logger.info("Buyer applied %d field(s); skip seller defaults completely.", applied)
                logger.info(
                    "Result after buyer: pavadinimas=%s, kodas=%s, barkodas=%s, tipas=%s",
                    getattr(db_doc, "prekes_pavadinimas", None),
                    getattr(db_doc, "prekes_kodas", None),
                    getattr(db_doc, "prekes_barkodas", None),
                    getattr(db_doc, "preke_paslauga", None),
                )
                return True

    # 2) Если buyer НИЧЕГО не поставил — пробуем seller → sales_defaults
    if any([seller["code"], seller["vat"], seller["name"]]):
        seller_profile = _match_profile(seller, sales_profiles)
        if seller_profile:
            applied = _apply_from_profile(seller_profile)
            changed_total += applied

    logger.info(
        "Defaults applied=%s; final: pavadinimas=%s, kodas=%s, barkodas=%s, tipas=%s",
        bool(changed_total),
        getattr(db_doc, "prekes_pavadinimas", None),
        getattr(db_doc, "prekes_kodas", None),
        getattr(db_doc, "prekes_barkodas", None),
        getattr(db_doc, "preke_paslauga", None),
    )
    return bool(changed_total)


def _save_line_items(db_doc, doc_struct: Dict[str, Any], scan_type: str):
    """
    Пересоздаёт строки LineItem из doc_struct["line_items"] для detaliai.
    АГРЕГИРУЕТ И/ИЛИ ВЫБИРАЕТ pvm_kodas ВСЕГДА (и для sumiskai тоже).
    Теперь считаем/записываем PVM и для view_mode="multi", если данных хватает.
    """
    db_doc.line_items.all().delete()

    line_items = doc_struct.get("line_items", []) or []
    db_doc.val_ar_sutapo = None

    pvm_codes: List[str] = []
    vat_percents: List[Optional[Decimal]] = []

    # 1) Создаём строки ТОЛЬКО для detaliai
    if scan_type == "detaliai" and line_items:
        for raw_item in line_items:
            item = sanitize_line_item(raw_item)

            vat_percent = item.get("vat_percent")

            # Эффективный тип позиции: из строки, иначе из документа (ожидаем 1/2/3/4)
            preke_paslauga_eff = item.get("preke_paslauga")
            if preke_paslauga_eff is None:
                preke_paslauga_eff = db_doc.preke_paslauga

            pvm_kodas = auto_select_pvm_code(
                pirkimas_pardavimas=db_doc.pirkimas_pardavimas,          # "pirkimas" | "pardavimas"
                buyer_country_iso=db_doc.buyer_country_iso,
                seller_country_iso=db_doc.seller_country_iso,
                preke_paslauga=preke_paslauga_eff,                        # 1/2/3/4
                vat_percent=vat_percent,
                separate_vat=False,
                buyer_has_vat_code=getattr(db_doc, "buyer_has_vat_code", None),
                seller_has_vat_code=getattr(db_doc, "seller_has_vat_code", None),
            )

            if pvm_kodas is not None:
                pvm_codes.append(pvm_kodas)
            vat_percents.append(vat_percent)

            LineItem.objects.create(
                document=db_doc,
                line_id=item.get("line_id"),
                prekes_kodas=item.get("product_code"),
                prekes_barkodas=item.get("product_barcode"),
                prekes_pavadinimas=item.get("product_name"),
                prekes_tipas=item.get("prekes_tipas"),
                preke_paslauga=item.get("preke_paslauga"),
                unit=normalize_unit(item.get("unit")),
                quantity=item.get("quantity"),
                price=item.get("price"),
                subtotal=item.get("subtotal"),
                vat=item.get("vat"),
                vat_percent=vat_percent,
                total=item.get("total"),
                discount_with_vat=item.get("discount_with_vat"),
                discount_wo_vat=item.get("discount_wo_vat"),
                sandelio_kodas=item.get("sandelio_kodas"),
                sandelio_pavadinimas=item.get("sandelio_pavadinimas"),
                objekto_kodas=item.get("objekto_kodas"),
                objekto_pavadinimas=item.get("objekto_pavadinimas"),
                padalinio_kodas=item.get("padalinio_kodas"),
                padalinio_pavadinimas=item.get("padalinio_pavadinimas"),
                mokescio_kodas=item.get("mokescio_kodas"),
                mokescio_pavadinimas=item.get("mokescio_pavadinimas"),
                atsakingo_asmens_kodas=item.get("atsakingo_asmens_kodas"),
                atsakingo_asmens_pavadinimas=item.get("atsakingo_asmens_pavadinimas"),
                operacijos_kodas=item.get("operacijos_kodas"),
                operacijos_pavadinimas=item.get("operacijos_pavadinimas"),
                islaidu_straipsnio_kodas=item.get("islaidu_straipsnio_kodas"),
                islaidu_straipsnio_pavadinimas=item.get("islaidu_straipsnio_pavadinimas"),
                pvm_kodas=pvm_kodas,
                pvm_pavadinimas=item.get("pvm_pavadinimas"),
                tipo_kodas=item.get("tipo_kodas"),
                tipo_pavadinimas=item.get("tipo_pavadinimas"),
                zurnalo_kodas=item.get("zurnalo_kodas"),
                zurnalo_pavadinimas=item.get("zurnalo_pavadinimas"),
                projekto_kodas=item.get("projekto_kodas"),
                projekto_pavadinimas=item.get("projekto_pavadinimas"),
                projekto_vadovo_kodas=item.get("projekto_vadovo_kodas"),
                projekto_vadovo_pavadinimas=item.get("projekto_vadovo_pavadinimas"),
                skyrio_kodas=item.get("skyrio_kodas"),
                skyrio_pavadinimas=item.get("skyrio_pavadinimas"),
                partijos_nr_kodas=item.get("partijos_nr_kodas"),
                partijos_nr_pavadinimas=item.get("partijos_nr_pavadinimas"),
                korespondencijos_kodas=item.get("korespondencijos_kodas"),
                korespondencijos_pavadinimas=item.get("korespondencijos_pavadinimas"),
                serijos_kodas=item.get("serijos_kodas"),
                serijos_pavadinimas=item.get("serijos_pavadinimas"),
                centro_kodas=item.get("centro_kodas"),
                centro_pavadinimas=item.get("centro_pavadinimas"),
            )

    # 2) Агрегация/выбор PVM кода — ВСЕГДА (и для single, и для multi)
    if db_doc.separate_vat is True:
        # разные ставки/коды VAT
        db_doc.pvm_kodas = "Keli skirtingi PVM"
        db_doc.vat_percent = None
    elif scan_type == "detaliai" and line_items:
        unique_pvm = {c for c in pvm_codes if c is not None}
        unique_vat_non_null = {v for v in vat_percents if v is not None}

        # Если по строкам и pvm, и ставка однозначны — берём их
        if len(unique_pvm) == 1 and len(unique_vat_non_null) == 1:
            db_doc.pvm_kodas = unique_pvm.pop()
            db_doc.vat_percent = unique_vat_non_null.pop()
        else:
            # pvm_kodas можно сбросить в "", если строки неоднородны
            db_doc.pvm_kodas = ""
            # А вот vat_percent не трогаем, если он уже посчитан на документе (в т.ч. 0)
            # Затираем только если он и так пустой
            if db_doc.vat_percent is None:
                db_doc.vat_percent = None
    else:
        # sumiskai (или detaliai без строк): выбираем по документу
        db_doc.pvm_kodas = auto_select_pvm_code(
            pirkimas_pardavimas=db_doc.pirkimas_pardavimas,
            buyer_country_iso=db_doc.buyer_country_iso,
            seller_country_iso=db_doc.seller_country_iso,
            preke_paslauga=db_doc.preke_paslauga,  # 1/2/3/4
            vat_percent=db_doc.vat_percent,
            separate_vat=db_doc.separate_vat,
            buyer_has_vat_code=getattr(db_doc, "buyer_has_vat_code", None),
            seller_has_vat_code=getattr(db_doc, "seller_has_vat_code", None),
        )

    db_doc.save()


def update_scanned_document(
    db_doc,
    doc_struct: Dict[str, Any],
    raw_text: str,
    preview_url: Optional[str],
    user,
    structured: Optional[Dict[str, Any]] = None,
    glued_raw_text: str = "",
):
    """
    Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.

    ОБНОВЛЁННЫЙ МИНИ-ПАЙПЛАЙН (sumiskai и detaliai):
      sanitize → apply_user_extra_settings
      → detect_document_or_line_discounts   (ТОЛЬКО лог)
      → validate_and_calculate_main_amounts (досчёт 4 якорей документа)
      → reconcile_doc_discounts_and_vat     (корректировка скидок/НДС на уровне документа)
      → run_document_consistency_checks     (ТОЛЬКО лог; базовые равенства и сценарии со скидками)
      → сохранение документа и строк БЕЗ каких-либо перерасчётов строк
    """
    scan_type = getattr(db_doc, "scan_type", "sumiskai")

    # 1) Санитизация
    doc_struct = sanitize_document_struct(doc_struct)

    # Строки только санитизируем, unit нормализуем — без пересчётов
    if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
        doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]
        for li in doc_struct["line_items"]:
            if "unit" in li:
                li["unit"] = normalize_unit(li.get("unit"))

    # 1.5) Дедупликацию скидок пока НЕ используем (как договаривались)
    # doc_struct = dedupe_document_discounts(doc_struct)

    # 1.6) Пользовательские extra-настройки (например, operation_date ← invoice_date)
    doc_struct = apply_user_extra_settings(doc_struct, user)

    # --- Сброс флагов на документе (сверки по строкам тут не считаем) ---
    db_doc.val_subtotal_match = None
    db_doc.val_vat_match = None
    db_doc.val_total_match = None
    db_doc.val_ar_sutapo = None
    db_doc.error_message = ""

    # 1.7) Определяем режим скидок (только лог/флаги)
    doc_struct = resolve_document_amounts(doc_struct)
    # Валидность сумм ДОКУМЕНТА:
    try:
        if bool(doc_struct.get("separate_vat")):
            # Для раздельного НДС документную сверку не используем вовсе
            db_doc.val_ar_sutapo = None
        else:
            # Обычный режим: используем сводный флаг; если его нет — ставим None
            v = doc_struct.get("_doc_amounts_consistent")
            db_doc.val_ar_sutapo = (v if v is not None else None)
    except Exception:
        pass

    # 1.8) Линии: канонизация строк + агрегаты + сверка с документом
    doc_struct = resolve_line_items(doc_struct)

    # опционально подхватить итоговые флаги в поля модели (если есть такие поля)
    try:
        db_doc.val_subtotal_match = bool(doc_struct.get("_lines_sum_matches_wo"))
    except Exception:
        pass
    try:
        db_doc.val_vat_match = bool(doc_struct.get("_lines_sum_matches_vat")) if not bool(doc_struct.get("separate_vat")) else None
    except Exception:
        pass
    try:
        db_doc.val_total_match = bool(doc_struct.get("_lines_sum_matches_with"))
    except Exception:
        pass
    try:
        db_doc.val_ar_sutapo = bool(doc_struct.get("ar_sutapo"))
    except Exception:
        pass
    if doc_struct.get("_lines_structured_hints"):
        logger.info("Validation hints: %s", " | ".join(doc_struct["_lines_structured_hints"]))


    # # 1.8) Линии: канонизация строк + агрегаты + сверка с документом
    # # if isinstance(doc_struct.get("line_items"), list) and doc_struct["line_items"]:
    #     doc_struct = resolve_line_items(doc_struct)

    #     # опционально подхватить итоговые флаги в поля модели (если есть такие поля)
    #     try:
    #         db_doc.val_subtotal_match = bool(doc_struct.get("_lines_sum_matches_wo"))
    #     except Exception:
    #         pass
    #     try:
    #         db_doc.val_vat_match = bool(doc_struct.get("_lines_sum_matches_vat")) if not bool(doc_struct.get("separate_vat")) else None
    #     except Exception:
    #         pass
    #     try:
    #         db_doc.val_total_match = bool(doc_struct.get("_lines_sum_matches_with"))
    #     except Exception:
    #         pass
    #     try:
    #         db_doc.val_ar_sutapo = bool(doc_struct.get("ar_sutapo"))
    #     except Exception:
    #         pass
    #     if doc_struct.get("_lines_structured_hints"):
    #         logger.info("Validation hints: %s", " | ".join(doc_struct["_lines_structured_hints"]))



    # 3) Сохранение документа и строк (строки сохраняем как есть; без перерасчётов)
    with transaction.atomic():
        _apply_top_level_fields(
            db_doc=db_doc,
            doc_struct=doc_struct,
            user=user,
            scan_type=scan_type,
            raw_text=raw_text,
            preview_url=preview_url,
            glued_raw_text=glued_raw_text,
        )
        db_doc.save()

        _save_line_items(db_doc, doc_struct, scan_type)

        if scan_type == "detaliai" and (structured or {}).get("ar_sutapo") is not None:
            # Не затираем внешний флаг, если он пришёл снаружи
            db_doc.val_ar_sutapo = structured.get("ar_sutapo")

        db_doc.status = "completed"

        # Проверка обязательных полей
        db_doc.ready_for_export = check_required_fields_for_export(db_doc)

        # Проверка математики
        math_valid, math_report = validate_document_math_for_export(db_doc)
        db_doc.math_validation_passed = math_valid

        db_doc.save()






# def update_scanned_document(
#     db_doc,
#     doc_struct: Dict[str, Any],
#     raw_text: str,
#     preview_url: Optional[str],
#     user,
#     structured: Optional[Dict[str, Any]] = None,
#     glued_raw_text: str = "",
# ):
#     """
#     Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.

#     ОБНОВЛЁННЫЙ ПАЙПЛАЙН (detaliai):
#       sanitize → dedupe_document_discounts → apply_user_extra_settings
#       → detect_document_or_line_discounts  ← (НОВОЕ, только логика выбора)
#       → validate_and_calculate_main_amounts
#       → enforce_discounts_and_vat_rules
#       → run_document_consistency_checks    ← (лог-проверки без подмен)
#       → (если separate_vat False) distribute_vat_from_document
#       → validate_and_calculate_lineitem_amounts (каждая строка)
#       → normalize_line_items_if_needed
#       → global_validate_and_correct
#       → compare_lineitems_with_main_totals (флаги/отчёт)
#     """
#     scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     # 1) Санитизация
#     doc_struct = sanitize_document_struct(doc_struct)

#     if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
#         doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]
#         # normalize units early
#         for li in doc_struct["line_items"]:
#             if "unit" in li:
#                 li["unit"] = normalize_unit(li.get("unit"))

#     # 1.5) Дедупликация скидок ДО расчётов
#     doc_struct = dedupe_document_discounts(doc_struct)

#     # 1.6) ПРИМЕНЯЕМ extra_settings пользователя (например, operation_date ← invoice_date)
#     doc_struct = apply_user_extra_settings(doc_struct, user)

#     # --- Сброс флагов ---
#     db_doc.val_subtotal_match = None
#     db_doc.val_vat_match = None
#     db_doc.val_total_match = None
#     db_doc.val_ar_sutapo = None
#     db_doc.error_message = ""

#     # 1.7) Определяем, какие скидки учитывать (документ/строки/нет) — только лог, без подмен
#     doc_struct = detect_document_or_line_discounts(doc_struct)

#     # 2) Общая нормализация итогов документа — ДЛЯ ОБОИХ режимов
#     doc_struct = validate_and_calculate_main_amounts(doc_struct)

#     # 2.1) Правила по строкам: выравнивание subtotal, логика скидок на строках,
#     #     проталкивание doc.vat_percent в строки (если возможно и separate_vat=False)
#     doc_struct = enforce_discounts_and_vat_rules(doc_struct)

#     # 2.2) Универсальные консистент-проверки (sumiskai + detaliai) — только лог
#     doc_struct = run_document_consistency_checks(doc_struct)

#     if scan_type == "sumiskai":
#         # Для sumiskai сейчас ничего больше не делаем (по твоей просьбе — шагами)
#         pass

#     elif scan_type == "detaliai":
#         # 3) Построчная валидация
#         line_items = doc_struct.get("line_items", []) or []
#         doc_struct["line_items"] = [
#             validate_and_calculate_lineitem_amounts(item) for item in line_items
#         ]

#         # 3.1) Лёгкая нормализация строк при расхождениях
#         doc_struct = normalize_line_items_if_needed(doc_struct)

#         # 3.2) Тонкая раздача НДС от документа по строкам (ничего не сделает, если separate_vat=True/нет НДС)
#         doc_struct = distribute_vat_from_document(doc_struct)

#         # 4) Глобальная коррекция документа по строкам (если нужно)
#         doc_struct = global_validate_and_correct(doc_struct)

#         # 5) Флаги/сравнение
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         db_doc.val_subtotal_match = not bool(doc_struct.get("_subtotal_replaced"))
#         db_doc.val_vat_match      = not bool(doc_struct.get("_vat_replaced"))
#         db_doc.val_total_match    = not bool(doc_struct.get("_total_replaced"))
#         db_doc.val_ar_sutapo = (
#             compare_result["subtotal_match"]
#             and compare_result["vat_match"]
#             and compare_result["total_match"]
#         )

#     # 3) Сохранение документа и строк
#     with transaction.atomic():
#         _apply_top_level_fields(
#             db_doc=db_doc,
#             doc_struct=doc_struct,
#             user=user,
#             scan_type=scan_type,
#             raw_text=raw_text,
#             preview_url=preview_url,
#             glued_raw_text=glued_raw_text,
#         )

#         db_doc.save()

#         _save_line_items(db_doc, doc_struct, scan_type)

#         if scan_type == "detaliai" and (structured or {}).get("ar_sutapo") is not None:
#             # Не затираем вычисленный флаг, если в structured пусто
#             db_doc.val_ar_sutapo = structured.get("ar_sutapo")

#         db_doc.status = "completed"
#         db_doc.save()






# def update_scanned_document(
#     db_doc,
#     doc_struct: Dict[str, Any],
#     raw_text: str,
#     preview_url: Optional[str],
#     user,
#     structured: Optional[Dict[str, Any]] = None,
#     glued_raw_text: str = "",
# ):
#     """
#     Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.

#     ОБНОВЛЁННЫЙ ПАЙПЛАЙН (detaliai):
#       sanitize → dedupe_document_discounts → apply_user_extra_settings
#       → validate_and_calculate_main_amounts
#       → (если separate_vat False) distribute_vat_from_document
#       → validate_and_calculate_lineitem_amounts (каждая строка)
#       → normalize_line_items_if_needed
#       → global_validate_and_correct
#       → compare_lineitems_with_main_totals (флаги/отчёт)
#     """
#     scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     # 1) Санитизация
#     doc_struct = sanitize_document_struct(doc_struct)

#     if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
#         doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]
#         # normalize units early
#         for li in doc_struct["line_items"]:
#             if "unit" in li:
#                 li["unit"] = normalize_unit(li.get("unit"))

#     # 1.5) Дедупликация скидок ДО расчётов
#     doc_struct = dedupe_document_discounts(doc_struct)

#     # 1.6) ПРИМЕНЯЕМ extra_settings пользователя (например, operation_date ← invoice_date)
#     doc_struct = apply_user_extra_settings(doc_struct, user)

#     # --- Сброс флагов ---
#     db_doc.val_subtotal_match = None
#     db_doc.val_vat_match = None
#     db_doc.val_total_match = None
#     db_doc.val_ar_sutapo = None
#     db_doc.error_message = ""

#     # 2) Общая нормализация итогов документа — ДЛЯ ОБОИХ режимов
#     doc_struct = validate_and_calculate_main_amounts(doc_struct)

#     # 2.1) Принудительные правила по скидкам и НДС на уровне строк
#     # - выравниваем subtotal = price*qty, логика скидок на строках,
#     # - если можно, проталкиваем doc.vat_percent в строки (separate_vat=False)
#     doc_struct = enforce_discounts_and_vat_rules(doc_struct)

#     # 2.2) Универсальные консистент-чекеры (sumiskai + detaliai)
#     doc_struct = run_document_consistency_checks(doc_struct)

#     if scan_type == "sumiskai":
#         pass
#     elif scan_type == "detaliai":
#         # 3) Построчная валидация
#         line_items = doc_struct.get("line_items", []) or []
#         doc_struct["line_items"] = [
#             validate_and_calculate_lineitem_amounts(item) for item in line_items
#         ]

#         # 3.1) Лёгкая нормализация строк при расхождениях
#         doc_struct = normalize_line_items_if_needed(doc_struct)

#         # 3.2) (перенесено СЮДА) Тонкая раздача НДС от документа по строкам
#         #      Ничего не сделает, если separate_vat=True или doc.vat отсутствует.
#         doc_struct = distribute_vat_from_document(doc_struct)

#         # 4) Глобальная коррекция документа
#         doc_struct = global_validate_and_correct(doc_struct)

#         # 5) Флаги/сравнение
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         db_doc.val_subtotal_match = not bool(doc_struct.get("_subtotal_replaced"))
#         db_doc.val_vat_match      = not bool(doc_struct.get("_vat_replaced"))
#         db_doc.val_total_match    = not bool(doc_struct.get("_total_replaced"))
#         db_doc.val_ar_sutapo = (
#             compare_result["subtotal_match"]
#             and compare_result["vat_match"]
#             and compare_result["total_match"]
#         )

#         # 6) Общий флаг
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         db_doc.val_ar_sutapo = (
#             compare_result["subtotal_match"]
#             and compare_result["vat_match"]
#             and compare_result["total_match"]
#         )

#     # 3) Сохранение документа и строк
#     with transaction.atomic():
#         _apply_top_level_fields(
#             db_doc=db_doc,
#             doc_struct=doc_struct,
#             user=user,
#             scan_type=scan_type,
#             raw_text=raw_text,
#             preview_url=preview_url,
#             glued_raw_text=glued_raw_text,
#         )

#         db_doc.save()

#         _save_line_items(db_doc, doc_struct, scan_type)

#         if scan_type == "detaliai" and (structured or {}).get("ar_sutapo") is not None:
#             # Не затираем вычисленный флаг, если в structured пусто
#             db_doc.val_ar_sutapo = structured.get("ar_sutapo")

#         db_doc.status = "completed"
#         db_doc.save()





# from typing import Any, Dict, List, Optional
# from decimal import Decimal
# import logging
# import random


# from django.db import transaction

# from ..models import LineItem
# from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
# from ..validators.amount_validator import (
#     validate_and_calculate_main_amounts,
#     validate_and_calculate_lineitem_amounts,
#     compare_lineitems_with_main_totals,
#     global_validate_and_correct,
#     dedupe_document_discounts,
# )
# from ..validators.default_currency import set_default_currency
# from ..validators.vat_klas import auto_select_pvm_code  # новая сигнатура (см. вызовы ниже)
# from ..validators.currency_converter import to_iso_currency

# # Санитайзеры
# from ..utils.parsers import (
#     sanitize_document_struct,
#     sanitize_line_item,
#     convert_for_json,
#     normalize_unit,
#     normalize_code_field,
# )
# from ..validators.extra_validators import apply_user_extra_settings


# logger = logging.getLogger("docscanner_app")


# def _gen_program_id7() -> str:
#     """7-значный код без ведущего нуля (для *_id_programoje)."""
#     return str(random.randint(1_000_000, 9_999_999))


# def _apply_top_level_fields(
#     db_doc, doc_struct: Dict[str, Any], user, scan_type: str, raw_text: str, preview_url: Optional[str], glued_raw_text: str = "",
# ):
#     """
#     Заполняет поля ScannedDocument из уже САНИТИЗИРОВАННОГО doc_struct.
#     Ничего не подставляет из пользовательских дефолтов. В конце выставляет
#     служебный флажок db_doc._can_apply_defaults (не сохраняется в БД).
#     """
#     # Базовые технические поля
#     db_doc.raw_text = raw_text
#     db_doc.glued_raw_text = glued_raw_text
#     db_doc.preview_url = preview_url
#     db_doc.structured_json = convert_for_json(doc_struct)

#     # --- Основные поля ---
#     db_doc.seller_id = doc_struct.get("seller_id")
#     db_doc.seller_name = doc_struct.get("seller_name")
#     db_doc.seller_vat_code = doc_struct.get("seller_vat_code")
#     db_doc.seller_address = doc_struct.get("seller_address")
#     db_doc.seller_country = doc_struct.get("seller_country")
#     db_doc.seller_country_iso = doc_struct.get("seller_country_iso")
#     db_doc.seller_iban = doc_struct.get("seller_iban")
#     db_doc.seller_is_person = doc_struct.get("seller_is_person")

#     db_doc.buyer_id = doc_struct.get("buyer_id")
#     db_doc.buyer_name = doc_struct.get("buyer_name")
#     db_doc.buyer_vat_code = doc_struct.get("buyer_vat_code")
#     db_doc.buyer_address = doc_struct.get("buyer_address")
#     db_doc.buyer_country = doc_struct.get("buyer_country")
#     db_doc.buyer_country_iso = doc_struct.get("buyer_country_iso")
#     db_doc.buyer_iban = doc_struct.get("buyer_iban")
#     db_doc.buyer_is_person = doc_struct.get("buyer_is_person")

#     # --- Автогенерация *_id_programoje, если пусты *_id и *_vat_code ---
#     try:
#         if not (str(db_doc.seller_id or "").strip()) and not (str(db_doc.seller_vat_code or "").strip()):
#             if not str(getattr(db_doc, "seller_id_programoje", "") or "").strip():
#                 db_doc.seller_id_programoje = _gen_program_id7()
#                 logger.info("seller_id_programoje auto-set to %s", db_doc.seller_id_programoje)
#     except Exception as e:
#         logger.warning("failed to set seller_id_programoje: %s", e)

#     try:
#         if not (str(db_doc.buyer_id or "").strip()) and not (str(db_doc.buyer_vat_code or "").strip()):
#             if not str(getattr(db_doc, "buyer_id_programoje", "") or "").strip():
#                 db_doc.buyer_id_programoje = _gen_program_id7()
#                 logger.info("buyer_id_programoje auto-set to %s", db_doc.buyer_id_programoje)
#     except Exception as e:
#         logger.warning("failed to set buyer_id_programoje: %s", e)

#     db_doc.invoice_date = doc_struct.get("invoice_date")
#     db_doc.due_date = doc_struct.get("due_date")
#     db_doc.operation_date = doc_struct.get("operation_date")
#     db_doc.document_series = normalize_code_field(doc_struct.get("document_series"))
#     db_doc.document_number = normalize_code_field(doc_struct.get("document_number"))
#     db_doc.order_number = doc_struct.get("order_number")

#     db_doc.amount_wo_vat = doc_struct.get("amount_wo_vat")
#     db_doc.invoice_discount_with_vat = doc_struct.get("invoice_discount_with_vat")
#     db_doc.invoice_discount_wo_vat = doc_struct.get("invoice_discount_wo_vat")
#     db_doc.vat_amount = doc_struct.get("vat_amount")
#     db_doc.vat_percent = doc_struct.get("vat_percent")
#     db_doc.amount_with_vat = doc_struct.get("amount_with_vat")

#     db_doc.separate_vat = doc_struct.get("separate_vat")

#     # 1) конвертируем символ/префикс → ISO3
#     raw_currency = doc_struct.get("currency")
#     normalized_currency = to_iso_currency(raw_currency)

#     # 2) если результат не строгий ISO-4217 (ровно 3 буквы), считаем, что валюты нет
#     if not (isinstance(normalized_currency, str) and len(normalized_currency) == 3 and normalized_currency.isalpha()):
#         normalized_currency = None

#     # 3) выставляем дефолт (если None/пусто)
#     db_doc.currency = set_default_currency(normalized_currency)

#     db_doc.with_receipt = doc_struct.get("with_receipt")
#     db_doc.paid_by_cash = doc_struct.get("paid_by_cash")
#     db_doc.document_type = doc_struct.get("document_type")

#     db_doc.similarity_percent = doc_struct.get("similarity_percent")
#     db_doc.note = doc_struct.get("note")
#     db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
#     db_doc.document_type_code = doc_struct.get("document_type_code")
#     db_doc.xml_source = doc_struct.get("xml_source")

#     # --- Короткие продуктовые поля для sumiskai (ТОЛЬКО из OCR/LLM) ---
#     if scan_type == "sumiskai":
#         if "line_items" in doc_struct and doc_struct["line_items"]:
#             first_item = doc_struct["line_items"][0]
#         else:
#             first_item = doc_struct

#         db_doc.prekes_kodas = first_item.get("product_code") or ""
#         db_doc.prekes_barkodas = first_item.get("product_barcode") or ""
#         db_doc.prekes_pavadinimas = first_item.get("product_name") or ""
#         db_doc.prekes_tipas = first_item.get("prekes_tipas") or ""
#         db_doc.preke_paslauga = first_item.get("preke_paslauga")
#         db_doc.sandelio_kodas = first_item.get("sandelio_kodas") or ""
#         db_doc.sandelio_pavadinimas = first_item.get("sandelio_pavadinimas") or ""
#         db_doc.objekto_kodas = first_item.get("objekto_kodas") or ""
#         db_doc.objekto_pavadinimas = first_item.get("objekto_pavadinimas") or ""
#         db_doc.padalinio_kodas = first_item.get("padalinio_kodas") or ""
#         db_doc.padalinio_pavadinimas = first_item.get("padalinio_pavadinimas") or ""
#         db_doc.mokescio_kodas = first_item.get("mokescio_kodas") or ""
#         db_doc.mokescio_pavadinimas = first_item.get("mokescio_pavadinimas") or ""
#         db_doc.atsakingo_asmens_kodas = first_item.get("atsakingo_asmens_kodas") or ""
#         db_doc.atsakingo_asmens_pavadinimas = first_item.get("atsakingo_asmens_pavadinimas") or ""
#         db_doc.operacijos_kodas = first_item.get("operacijos_kodas") or ""
#         db_doc.operacijos_pavadinimas = first_item.get("operacijos_pavadinimas") or ""
#         db_doc.islaidu_straipsnio_kodas = first_item.get("islaidu_straipsnio_kodas") or ""
#         db_doc.islaidu_straipsnio_pavadinimas = first_item.get("islaidu_straipsnio_pavadinimas") or ""
#         db_doc.pvm_kodas = first_item.get("pvm_kodas") or ""
#         db_doc.pvm_pavadinimas = first_item.get("pvm_pavadinimas") or ""
#         db_doc.tipo_kodas = first_item.get("tipo_kodas") or ""
#         db_doc.tipo_pavadinimas = first_item.get("tipo_pavadinimas") or ""
#         db_doc.zurnalo_kodas = first_item.get("zurnalo_kodas") or ""
#         db_doc.zurnalo_pavadinimas = first_item.get("zurnalo_pavadinimas") or ""
#         db_doc.projekto_kodas = first_item.get("projekto_kodas") or ""
#         db_doc.projekto_pavadinimas = first_item.get("projekto_pavadinimas") or ""
#         db_doc.projekto_vadovo_kodas = first_item.get("projekto_vadovo_kodas") or ""
#         db_doc.projekto_vadovo_pavadinimas = first_item.get("projekto_vadovo_pavadinimas") or ""
#         db_doc.skyrio_kodas = first_item.get("skyrio_kodas") or ""
#         db_doc.skyrio_pavadinimas = first_item.get("skyrio_pavadinimas") or ""
#         db_doc.partijos_nr_kodas = first_item.get("partijos_nr_kodas") or ""
#         db_doc.partijos_nr_pavadinimas = first_item.get("partijos_nr_pavadinimas") or ""
#         db_doc.korespondencijos_kodas = first_item.get("korespondencijos_kodas") or ""
#         db_doc.korespondencijos_pavadinimas = first_item.get("korespondencijos_pavadinimas") or ""
#         db_doc.serijos_kodas = first_item.get("serijos_kodas") or ""
#         db_doc.serijos_pavadinimas = first_item.get("serijos_pavadinimas") or ""
#         db_doc.centro_kodas = first_item.get("centro_kodas") or ""
#         db_doc.centro_pavadinimas = first_item.get("centro_pavadinimas") or ""
#     else:
#         # detaliai — чистим короткие поля
#         db_doc.prekes_kodas = ""
#         db_doc.prekes_barkodas = ""
#         db_doc.prekes_pavadinimas = ""
#         db_doc.prekes_tipas = ""
#         db_doc.preke_paslauga = ""
#         db_doc.sandelio_kodas = ""
#         db_doc.sandelio_pavadinimas = ""
#         db_doc.objekto_kodas = ""
#         db_doc.objekto_pavadinimas = ""
#         db_doc.padalinio_kodas = ""
#         db_doc.padalinio_pavadinimas = ""
#         db_doc.mokescio_kodas = ""
#         db_doc.mokescio_pavadinimas = ""
#         db_doc.atsakingo_asmens_kodas = ""
#         db_doc.atsakingo_asmens_pavadinimas = ""
#         db_doc.operacijos_kodas = ""
#         db_doc.operacijos_pavadinimas = ""
#         db_doc.islaidu_straipsnio_kodas = ""
#         db_doc.islaidu_straipsnio_pavadinimas = ""
#         db_doc.pvm_kodas = ""
#         db_doc.pvm_pavadinimas = ""
#         db_doc.tipo_kodas = ""
#         db_doc.tipo_pavadinimas = ""
#         db_doc.zurnalo_kodas = ""
#         db_doc.zurnalo_pavadinimas = ""
#         db_doc.projekto_kodas = ""
#         db_doc.projekto_pavadinimas = ""
#         db_doc.projekto_vadovo_kodas = ""
#         db_doc.projekto_vadovo_pavadinimas = ""
#         db_doc.skyrio_kodas = ""
#         db_doc.skyrio_pavadinimas = ""
#         db_doc.partijos_nr_kodas = ""
#         db_doc.partijos_nr_pavadinimas = ""
#         db_doc.korespondencijos_kodas = ""
#         db_doc.korespondencijos_pavadinimas = ""
#         db_doc.serijos_kodas = ""
#         db_doc.serijos_pavadinimas = ""
#         db_doc.centro_kodas = ""
#         db_doc.centro_pavadinimas = ""

#     # Определяем pirkimas/pardavimas
#     db_doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, user)

#     # Булевы флаги наличия PVM кода у сторон (для классификатора)
#     try:
#         db_doc.buyer_has_vat_code = bool((db_doc.buyer_vat_code or "").strip())
#     except Exception:
#         pass
#     try:
#         db_doc.seller_has_vat_code = bool((db_doc.seller_vat_code or "").strip())
#     except Exception:
#         pass

#     # --- Служебный флажок: дефолты можно применять в sumiskai, если указан ХОТЯ БЫ один контрагент ---
#     has_buyer = any([
#         (db_doc.buyer_id or "").strip(),
#         (db_doc.buyer_vat_code or "").strip(),
#         (db_doc.buyer_name or "").strip(),
#     ])
#     has_seller = any([
#         (db_doc.seller_id or "").strip(),
#         (db_doc.seller_vat_code or "").strip(),
#         (db_doc.seller_name or "").strip(),
#     ])

#     db_doc._can_apply_defaults = (scan_type == "sumiskai") and (has_buyer or has_seller)



# def _apply_sumiskai_defaults_from_user(db_doc, user) -> bool:
#     """
#     Применяет дефолты по фирме для sumiskai:
#       - buyer сопоставляем с user.purchase_defaults
#       - seller сопоставляем с user.sales_defaults
#       - приоритет совпадения: įmonės_kodas → įmonės_PVM_kodas → нормализованное название
#       - заполняем ТОЛЬКО пустые: prekes_pavadinimas, prekes_kodas, prekes_barkodas, preke_paslauga ("1"/"2"/"3"/"4")
#       - ПРАВИЛО: если одна сторона заполнила ХОТЯ БЫ ОДНО поле, другая НЕ применяется вообще.
#     """
#     from docscanner_app.validators.company_name_normalizer import normalize_company_name

#     # работаем только для sumiskai
#     if (getattr(db_doc, "scan_type", None) or "").strip().lower() != "sumiskai":
#         logger.info("Skip defaults: scan_type != sumiskai (%s)", db_doc.scan_type)
#         return False

#     # ---- helpers ----
#     def _norm_code(x: str) -> str:
#         return (x or "").strip().upper()

#     def _party(side: str):
#         name = getattr(db_doc, f"{side}_name", "") or ""
#         return {
#             "name": name,
#             "name_norm": normalize_company_name(name),
#             "vat":  _norm_code(getattr(db_doc, f"{side}_vat_code", "") or ""),
#             "code": _norm_code(getattr(db_doc, f"{side}_id", "") or ""),  # įmonės kodas
#         }

#     buyer  = _party("buyer")
#     seller = _party("seller")

#     def _to_profiles(raw):
#         import json
#         if isinstance(raw, list):
#             return raw
#         if isinstance(raw, dict):
#             return [raw]
#         if isinstance(raw, str) and raw.strip():
#             try:
#                 data = json.loads(raw)
#                 if isinstance(data, list):  return data
#                 if isinstance(data, dict):  return [data]
#             except Exception as e:
#                 logger.warning("Failed to parse defaults JSON: %s", e)
#         return []

#     purchase_profiles = _to_profiles(getattr(user, "purchase_defaults", None))
#     sales_profiles    = _to_profiles(getattr(user, "sales_defaults", None))
#     logger.info("Defaults pool sizes: purchase=%d, sales=%d", len(purchase_profiles), len(sales_profiles))

#     def _match_profile(party: dict, profiles: list):
#         if not profiles:
#             return None

#         def _pf(x): return (x or "").strip()
#         def _pf_code(x): return _norm_code(_pf(x))
#         def _pf_name_norm(x): return normalize_company_name(_pf(x))

#         # 1) įmonės_kodas
#         if party["code"]:
#             for p in profiles:
#                 if _pf_code(p.get("imones_kodas")) == party["code"]:
#                     logger.info("Matched by imones_kodas: %s", party["code"])
#                     return p
#         # 2) įmonės_PVM_kodas
#         if party["vat"]:
#             for p in profiles:
#                 if _pf_code(p.get("imones_pvm_kodas")) == party["vat"]:
#                     logger.info("Matched by imones_pvm_kodas: %s", party["vat"])
#                     return p
#         # 3) нормализованное название
#         if party["name_norm"]:
#             for p in profiles:
#                 if _pf_name_norm(p.get("imones_pavadinimas")) == party["name_norm"]:
#                     logger.info("Matched by imones_pavadinimas(norm): %s", party["name_norm"])
#                     return p
#         return None

#     def _norm_tipas_to_str(v):
#         if v is None:
#             return None
#         s = str(v).strip().lower()
#         mapping = {"preke": "1", "paslauga": "2", "kodas": "3"}
#         if s in ("1", "2", "3"):
#             return s
#         if s in mapping:
#             return mapping[s]
#         try:
#             i = int(s)
#             if i in (1, 2, 3):
#                 return str(i)
#         except Exception:
#             pass
#         return None

#     # ставим значение только если поле пустое; возвращаем 1, если действительно поставили
#     def _set_if_empty(field: str, value) -> int:
#         cur = getattr(db_doc, field, None)
#         if (str(cur).strip() if cur is not None else ""):
#             return 0
#         if value is None:
#             return 0
#         val_str = str(value).strip()
#         if not val_str:
#             return 0
#         setattr(db_doc, field, val_str)
#         logger.info("Default applied: %s = %r", field, val_str)
#         return 1

#     # применяем профиль; возвращаем, сколько полей реально поставили
#     def _apply_from_profile(profile) -> int:
#         if not profile:
#             return 0
#         applied = 0
#         applied += _set_if_empty("prekes_pavadinimas", profile.get("pavadinimas"))
#         applied += _set_if_empty("prekes_kodas",       profile.get("kodas"))
#         applied += _set_if_empty("prekes_barkodas",    profile.get("barkodas"))
#         tipas_norm = _norm_tipas_to_str(profile.get("tipas"))
#         if tipas_norm:
#             applied += _set_if_empty("preke_paslauga", tipas_norm)
#         return applied

#     changed_total = 0

#     # 1) СНАЧАЛА buyer → purchase_defaults
#     if any([buyer["code"], buyer["vat"], buyer["name"]]):
#         buyer_profile = _match_profile(buyer, purchase_profiles)
#         if buyer_profile:
#             applied = _apply_from_profile(buyer_profile)
#             changed_total += applied
#             if applied > 0:
#                 # Если buyer заполнил хотя бы ОДНО поле — seller НЕ трогаем.
#                 logger.info("Buyer applied %d field(s); skip seller defaults completely.", applied)
#                 logger.info(
#                     "Result after buyer: pavadinimas=%s, kodas=%s, barkodas=%s, tipas=%s",
#                     getattr(db_doc, "prekes_pavadinimas", None),
#                     getattr(db_doc, "prekes_kodas", None),
#                     getattr(db_doc, "prekes_barkodas", None),
#                     getattr(db_doc, "preke_paslauga", None),
#                 )
#                 return True  # ранний выход

#     # 2) Если buyer НИЧЕГО не поставил — пробуем seller → sales_defaults
#     if any([seller["code"], seller["vat"], seller["name"]]):
#         seller_profile = _match_profile(seller, sales_profiles)
#         if seller_profile:
#             applied = _apply_from_profile(seller_profile)
#             changed_total += applied

#     logger.info(
#         "Defaults applied=%s; final: pavadinimas=%s, kodas=%s, barkodas=%s, tipas=%s",
#         bool(changed_total),
#         getattr(db_doc, "prekes_pavadinimas", None),
#         getattr(db_doc, "prekes_kodas", None),
#         getattr(db_doc, "prekes_barkodas", None),
#         getattr(db_doc, "preke_paslauga", None),
#     )
#     return bool(changed_total)


# def _save_line_items(db_doc, doc_struct: Dict[str, Any], scan_type: str):
#     """
#     Пересоздаёт строки LineItem из doc_struct["line_items"] для detaliai.
#     АГРЕГИРУЕТ И/ИЛИ ВЫБИРАЕТ pvm_kodas ВСЕГДА (и для sumiskai тоже).
#     Теперь считаем/записываем PVM и для view_mode="multi", если данных хватает.
#     """
#     db_doc.line_items.all().delete()

#     line_items = doc_struct.get("line_items", []) or []
#     db_doc.val_ar_sutapo = None

#     pvm_codes: List[str] = []
#     vat_percents: List[Optional[Decimal]] = []

#     # 1) Создаём строки ТОЛЬКО для detaliai
#     if scan_type == "detaliai" and line_items:
#         for raw_item in line_items:
#             item = sanitize_line_item(raw_item)

#             vat_percent = item.get("vat_percent")

#             # Эффективный тип позиции: из строки, иначе из документа (ожидаем 1/2/3/4)
#             preke_paslauga_eff = item.get("preke_paslauga")
#             if preke_paslauga_eff is None:
#                 preke_paslauga_eff = db_doc.preke_paslauga

#             pvm_kodas = auto_select_pvm_code(
#                 pirkimas_pardavimas=db_doc.pirkimas_pardavimas,          # "pirkimas" | "pardavimas"
#                 buyer_country_iso=db_doc.buyer_country_iso,
#                 seller_country_iso=db_doc.seller_country_iso,
#                 preke_paslauga=preke_paslauga_eff,                        # 1/2/3/4
#                 vat_percent=vat_percent,
#                 separate_vat=False,
#                 buyer_has_vat_code=getattr(db_doc, "buyer_has_vat_code", None),
#                 seller_has_vat_code=getattr(db_doc, "seller_has_vat_code", None),
#             )

#             if pvm_kodas is not None:
#                 pvm_codes.append(pvm_kodas)
#             vat_percents.append(vat_percent)

#             LineItem.objects.create(
#                 document=db_doc,
#                 line_id=item.get("line_id"),
#                 prekes_kodas=item.get("product_code"),
#                 prekes_barkodas=item.get("product_barcode"),
#                 prekes_pavadinimas=item.get("product_name"),
#                 prekes_tipas=item.get("prekes_tipas"),
#                 preke_paslauga=item.get("preke_paslauga"),
#                 unit=normalize_unit(item.get("unit")),
#                 quantity=item.get("quantity"),
#                 price=item.get("price"),
#                 subtotal=item.get("subtotal"),
#                 vat=item.get("vat"),
#                 vat_percent=vat_percent,
#                 total=item.get("total"),
#                 discount_with_vat=item.get("discount_with_vat"),
#                 discount_wo_vat=item.get("discount_wo_vat"),
#                 sandelio_kodas=item.get("sandelio_kodas"),
#                 sandelio_pavadinimas=item.get("sandelio_pavadinimas"),
#                 objekto_kodas=item.get("objekto_kodas"),
#                 objekto_pavadinimas=item.get("objekto_pavadinimas"),
#                 padalinio_kodas=item.get("padalinio_kodas"),
#                 padalinio_pavadinimas=item.get("padalinio_pavadinimas"),
#                 mokescio_kodas=item.get("mokescio_kodas"),
#                 mokescio_pavadinimas=item.get("mokescio_pavadinimas"),
#                 atsakingo_asmens_kodas=item.get("atsakingo_asmens_kodas"),
#                 atsakingo_asmens_pavadinimas=item.get("atsakingo_asmens_pavadinimas"),
#                 operacijos_kodas=item.get("operacijos_kodas"),
#                 operacijos_pavadinimas=item.get("operacijos_pavadinimas"),
#                 islaidu_straipsnio_kodas=item.get("islaidu_straipsnio_kodas"),
#                 islaidu_straipsnio_pavadinimas=item.get("islaidu_straipsnio_pavadinimas"),
#                 pvm_kodas=pvm_kodas,
#                 pvm_pavadinimas=item.get("pvm_pavadinimas"),
#                 tipo_kodas=item.get("tipo_kodas"),
#                 tipo_pavadinimas=item.get("tipo_pavadinimas"),
#                 zurnalo_kodas=item.get("zurnalo_kodas"),
#                 zurnalo_pavadinimas=item.get("zurnalo_pavadinimas"),
#                 projekto_kodas=item.get("projekto_kodas"),
#                 projekto_pavadinimas=item.get("projekto_pavadinimas"),
#                 projekto_vadovo_kodas=item.get("projekto_vadovo_kodas"),
#                 projekto_vadovo_pavadinimas=item.get("projekto_vadovo_pavadinimas"),
#                 skyrio_kodas=item.get("skyrio_kodas"),
#                 skyrio_pavadinimas=item.get("skyrio_pavadinimas"),
#                 partijos_nr_kodas=item.get("partijos_nr_kodas"),
#                 partijos_nr_pavadinimas=item.get("partijos_nr_pavadinimas"),
#                 korespondencijos_kodas=item.get("korespondencijos_kodas"),
#                 korespondencijos_pavadinimas=item.get("korespondencijos_pavadinimas"),
#                 serijos_kodas=item.get("serijos_kodas"),
#                 serijos_pavadinimas=item.get("serijos_pavadinimas"),
#                 centro_kodas=item.get("centro_kodas"),
#                 centro_pavadinimas=item.get("centro_pavadinimas"),
#             )

#     # 2) Агрегация/выбор PVM кода — ВСЕГДА (и для single, и для multi)
#     if db_doc.separate_vat is True:
#         # разные ставки/коды VAT
#         db_doc.pvm_kodas = "Keli skirtingi PVM"
#         db_doc.vat_percent = None
#     elif scan_type == "detaliai" and line_items:
#         # по строкам, если однородные
#         unique_pvm = {c for c in pvm_codes if c is not None}
#         unique_vat = {v for v in vat_percents if v is not None}
#         if len(unique_pvm) == 1 and len(unique_vat) == 1:
#             db_doc.pvm_kodas = unique_pvm.pop()
#             db_doc.vat_percent = unique_vat.pop()
#         else:
#             db_doc.pvm_kodas = ""
#             db_doc.vat_percent = None
#     else:
#         # sumiskai (или detaliai без строк): выбираем по документу
#         db_doc.pvm_kodas = auto_select_pvm_code(
#             pirkimas_pardavimas=db_doc.pirkimas_pardavimas,
#             buyer_country_iso=db_doc.buyer_country_iso,
#             seller_country_iso=db_doc.seller_country_iso,
#             preke_paslauga=db_doc.preke_paslauga,  # 1/2/3/4
#             vat_percent=db_doc.vat_percent,
#             separate_vat=db_doc.separate_vat,
#             buyer_has_vat_code=getattr(db_doc, "buyer_has_vat_code", None),
#             seller_has_vat_code=getattr(db_doc, "seller_has_vat_code", None),
#         )

#     db_doc.save()


# def update_scanned_document(
#     db_doc,
#     doc_struct: Dict[str, Any],
#     raw_text: str,
#     preview_url: Optional[str],
#     user,
#     structured: Optional[Dict[str, Any]] = None,
#     glued_raw_text: str = "",
# ):
#     """
#     Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.
#     """
#     scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     # 1) Санитизация
#     doc_struct = sanitize_document_struct(doc_struct)

#     if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
#         doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]

#         # normalize units early
#         for li in doc_struct["line_items"]:
#             if "unit" in li:
#                 li["unit"] = normalize_unit(li.get("unit"))

#     # 1.5) Дедупликация скидок ДО расчётов
#     doc_struct = dedupe_document_discounts(doc_struct)

#     # 1.6) ПРИМЕНЯЕМ extra_settings пользователя (например, operation_date ← invoice_date)
#     doc_struct = apply_user_extra_settings(doc_struct, user)

#     # --- Сброс флагов ---
#     db_doc.val_subtotal_match = None
#     db_doc.val_vat_match = None
#     db_doc.val_total_match = None
#     db_doc.val_ar_sutapo = None
#     db_doc.error_message = ""

#     # 2) Валидации
#     if scan_type == "sumiskai":
#         doc_struct = validate_and_calculate_main_amounts(doc_struct)

#     elif scan_type == "detaliai":
#         line_items = doc_struct.get("line_items", []) or []
#         doc_struct["line_items"] = [
#             validate_and_calculate_lineitem_amounts(item) for item in line_items
#         ]

#         # 2) глобальная коррекция документа
#         doc_struct = global_validate_and_correct(doc_struct)

#         # 3) флаги: если поле заменили → match=False
#         db_doc.val_subtotal_match = not bool(doc_struct.get("_subtotal_replaced"))
#         db_doc.val_vat_match      = not bool(doc_struct.get("_vat_replaced"))
#         db_doc.val_total_match    = not bool(doc_struct.get("_total_replaced"))

#         # 4) общий флаг
#         db_doc.was_adjusted = bool(doc_struct.get("_doc_totals_replaced_by_lineitems"))

#         # (опционально) хочешь ещё показать ar_sutapo — можно взять из compare_lineitems
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         db_doc.val_ar_sutapo = (
#             compare_result["subtotal_match"]
#             and compare_result["vat_match"]
#             and compare_result["total_match"]
#         )

#     # 3) Сохранение документа и строк
#     with transaction.atomic():
#         _apply_top_level_fields(
#             db_doc=db_doc,
#             doc_struct=doc_struct,
#             user=user,
#             scan_type=scan_type,
#             raw_text=raw_text,
#             preview_url=preview_url,
#             glued_raw_text=glued_raw_text,
#         )

#         db_doc.save()

#         _save_line_items(db_doc, doc_struct, scan_type)

#         if scan_type == "detaliai":
#             db_doc.val_ar_sutapo = (structured or {}).get("ar_sutapo")

#         db_doc.status = "completed"
#         db_doc.save()



































# from typing import Any, Dict, List, Optional
# from decimal import Decimal
# import logging

# from django.db import transaction

# from ..models import LineItem
# from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
# from ..validators.amount_validator import (
#     validate_and_calculate_main_amounts,
#     validate_and_calculate_lineitem_amounts,
#     compare_lineitems_with_main_totals,
#     global_validate_and_correct,
#     dedupe_document_discounts,
# )
# from ..validators.default_currency import set_default_currency
# from ..validators.vat_klas import auto_select_pvm_code
# from ..validators.currency_converter import to_iso_currency

# # Санитайзеры
# from ..utils.parsers import (
#     sanitize_document_struct,
#     sanitize_line_item,
#     convert_for_json,
# )
# from ..validators.extra_validators import apply_user_extra_settings


# logger = logging.getLogger("docscanner_app")


# def _apply_top_level_fields(
#     db_doc, doc_struct: Dict[str, Any], user, scan_type: str, raw_text: str, preview_url: Optional[str], glued_raw_text: str = "",
# ):
#     """
#     Заполняет поля ScannedDocument из уже САНИТИЗИРОВАННОГО doc_struct.
#     Ничего не подставляет из пользовательских дефолтов. В конце выставляет
#     служебный флажок db_doc._can_apply_defaults (не сохраняется в БД).
#     """
#     # Базовые технические поля
#     db_doc.raw_text = raw_text  
#     db_doc.glued_raw_text = glued_raw_text
#     db_doc.preview_url = preview_url
#     db_doc.structured_json = convert_for_json(doc_struct)

#     # --- Основные поля ---
#     db_doc.seller_id = doc_struct.get("seller_id")
#     db_doc.seller_name = doc_struct.get("seller_name")
#     db_doc.seller_vat_code = doc_struct.get("seller_vat_code")
#     db_doc.seller_address = doc_struct.get("seller_address")
#     db_doc.seller_country = doc_struct.get("seller_country")
#     db_doc.seller_country_iso = doc_struct.get("seller_country_iso")
#     db_doc.seller_iban = doc_struct.get("seller_iban")
#     db_doc.seller_is_person = doc_struct.get("seller_is_person")

#     db_doc.buyer_id = doc_struct.get("buyer_id")
#     db_doc.buyer_name = doc_struct.get("buyer_name")
#     db_doc.buyer_vat_code = doc_struct.get("buyer_vat_code")
#     db_doc.buyer_address = doc_struct.get("buyer_address")
#     db_doc.buyer_country = doc_struct.get("buyer_country")
#     db_doc.buyer_country_iso = doc_struct.get("buyer_country_iso")
#     db_doc.buyer_iban = doc_struct.get("buyer_iban")
#     db_doc.buyer_is_person = doc_struct.get("buyer_is_person")

#     db_doc.invoice_date = doc_struct.get("invoice_date")
#     db_doc.due_date = doc_struct.get("due_date")
#     db_doc.operation_date = doc_struct.get("operation_date")
#     db_doc.document_series = doc_struct.get("document_series")
#     db_doc.document_number = doc_struct.get("document_number")
#     db_doc.order_number = doc_struct.get("order_number")

#     db_doc.amount_wo_vat = doc_struct.get("amount_wo_vat")
#     db_doc.invoice_discount_with_vat = doc_struct.get("invoice_discount_with_vat")
#     db_doc.invoice_discount_wo_vat = doc_struct.get("invoice_discount_wo_vat")
#     db_doc.vat_amount = doc_struct.get("vat_amount")
#     db_doc.vat_percent = doc_struct.get("vat_percent")
#     db_doc.amount_with_vat = doc_struct.get("amount_with_vat")

#     db_doc.separate_vat = doc_struct.get("separate_vat")

#     # 1) конвертируем символ/префикс → ISO3
#     raw_currency = doc_struct.get("currency")
#     normalized_currency = to_iso_currency(raw_currency)

#     # 2) если результат не строгий ISO-4217 (ровно 3 буквы), считаем, что валюты нет
#     if not (isinstance(normalized_currency, str) and len(normalized_currency) == 3 and normalized_currency.isalpha()):
#         normalized_currency = None

#     # 3) выставляем дефолт (если None/пусто)
#     db_doc.currency = set_default_currency(normalized_currency)

#     db_doc.with_receipt = doc_struct.get("with_receipt")
#     db_doc.paid_by_cash = doc_struct.get("paid_by_cash")
#     db_doc.document_type = doc_struct.get("document_type")

#     db_doc.similarity_percent = doc_struct.get("similarity_percent")
#     db_doc.note = doc_struct.get("note")
#     db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
#     db_doc.document_type_code = doc_struct.get("document_type_code")
#     db_doc.xml_source = doc_struct.get("xml_source")

#     # --- Короткие продуктовые поля для sumiskai (ТОЛЬКО из OCR/LLM) ---
#     if scan_type == "sumiskai":
#         if "line_items" in doc_struct and doc_struct["line_items"]:
#             first_item = doc_struct["line_items"][0]
#         else:
#             first_item = doc_struct

#         db_doc.prekes_kodas = first_item.get("product_code") or ""
#         db_doc.prekes_barkodas = first_item.get("product_barcode") or ""
#         db_doc.prekes_pavadinimas = first_item.get("product_name") or ""
#         db_doc.prekes_tipas = first_item.get("prekes_tipas") or ""
#         db_doc.preke_paslauga = first_item.get("preke_paslauga")
#         db_doc.sandelio_kodas = first_item.get("sandelio_kodas") or ""
#         db_doc.sandelio_pavadinimas = first_item.get("sandelio_pavadinimas") or ""
#         db_doc.objekto_kodas = first_item.get("objekto_kodas") or ""
#         db_doc.objekto_pavadinimas = first_item.get("objekto_pavadinimas") or ""
#         db_doc.padalinio_kodas = first_item.get("padalinio_kodas") or ""
#         db_doc.padalinio_pavadinimas = first_item.get("padalinio_pavadinimas") or ""
#         db_doc.mokescio_kodas = first_item.get("mokescio_kodas") or ""
#         db_doc.mokescio_pavadinimas = first_item.get("mokescio_pavadinimas") or ""
#         db_doc.atsakingo_asmens_kodas = first_item.get("atsakingo_asmens_kodas") or ""
#         db_doc.atsakingo_asmens_pavadinimas = first_item.get("atsakingo_asmens_pavadinimas") or ""
#         db_doc.operacijos_kodas = first_item.get("operacijos_kodas") or ""
#         db_doc.operacijos_pavadinimas = first_item.get("operacijos_pavadinimas") or ""
#         db_doc.islaidu_straipsnio_kodas = first_item.get("islaidu_straipsnio_kodas") or ""
#         db_doc.islaidu_straipsnio_pavadinimas = first_item.get("islaidu_straipsnio_pavadinimas") or ""
#         db_doc.pvm_kodas = first_item.get("pvm_kodas") or ""
#         db_doc.pvm_pavadinimas = first_item.get("pvm_pavadinimas") or ""
#         db_doc.tipo_kodas = first_item.get("tipo_kodas") or ""
#         db_doc.tipo_pavadinimas = first_item.get("tipo_pavadinimas") or ""
#         db_doc.zurnalo_kodas = first_item.get("zurnalo_kodas") or ""
#         db_doc.zurnalo_pavadinimas = first_item.get("zurnalo_pavadinimas") or ""
#         db_doc.projekto_kodas = first_item.get("projekto_kodas") or ""
#         db_doc.projekto_pavadinimas = first_item.get("projekto_pavadinimas") or ""
#         db_doc.projekto_vadovo_kodas = first_item.get("projekto_vadovo_kodas") or ""
#         db_doc.projekto_vadovo_pavadinimas = first_item.get("projekto_vadovo_pavadinimas") or ""
#         db_doc.skyrio_kodas = first_item.get("skyrio_kodas") or ""
#         db_doc.skyrio_pavadinimas = first_item.get("skyrio_pavadinimas") or ""
#         db_doc.partijos_nr_kodas = first_item.get("partijos_nr_kodas") or ""
#         db_doc.partijos_nr_pavadinimas = first_item.get("partijos_nr_pavadinimas") or ""
#         db_doc.korespondencijos_kodas = first_item.get("korespondencijos_kodas") or ""
#         db_doc.korespondencijos_pavadinimas = first_item.get("korespondencijos_pavadinimas") or ""
#         db_doc.serijos_kodas = first_item.get("serijos_kodas") or ""
#         db_doc.serijos_pavadinimas = first_item.get("serijos_pavadinimas") or ""
#         db_doc.centro_kodas = first_item.get("centro_kodas") or ""
#         db_doc.centro_pavadinimas = first_item.get("centro_pavadinimas") or ""
#     else:
#         # detaliai — чистим короткие поля
#         db_doc.prekes_kodas = ""
#         db_doc.prekes_barkodas = ""
#         db_doc.prekes_pavadinimas = ""
#         db_doc.prekes_tipas = ""
#         db_doc.preke_paslauga = ""
#         db_doc.sandelio_kodas = ""
#         db_doc.sandelio_pavadinimas = ""
#         db_doc.objekto_kodas = ""
#         db_doc.objekto_pavadinimas = ""
#         db_doc.padalinio_kodas = ""
#         db_doc.padalinio_pavadinimas = ""
#         db_doc.mokescio_kodas = ""
#         db_doc.mokescio_pavadinimas = ""
#         db_doc.atsakingo_asmens_kodas = ""
#         db_doc.atsakingo_asmens_pavadinimas = ""
#         db_doc.operacijos_kodas = ""
#         db_doc.operacijos_pavadinimas = ""
#         db_doc.islaidu_straipsnio_kodas = ""
#         db_doc.islaidu_straipsnio_pavadinimas = ""
#         db_doc.pvm_kodas = ""
#         db_doc.pvm_pavadinimas = ""
#         db_doc.tipo_kodas = ""
#         db_doc.tipo_pavadinimas = ""
#         db_doc.zurnalo_kodas = ""
#         db_doc.zurnalo_pavadinimas = ""
#         db_doc.projekto_kodas = ""
#         db_doc.projekto_pavadinimas = ""
#         db_doc.projekto_vadovo_kodas = ""
#         db_doc.projekto_vadovo_pavadinimas = ""
#         db_doc.skyrio_kodas = ""
#         db_doc.skyrio_pavadinimas = ""
#         db_doc.partijos_nr_kodas = ""
#         db_doc.partijos_nr_pavadinimas = ""
#         db_doc.korespondencijos_kodas = ""
#         db_doc.korespondencijos_pavadinimas = ""
#         db_doc.serijos_kodas = ""
#         db_doc.serijos_pavadinimas = ""
#         db_doc.centro_kodas = ""
#         db_doc.centro_pavadinimas = ""

#     # Определяем pirkimas/pardavimas
#     db_doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, user)

#     # --- Служебный флажок: дефолты можно применять в sumiskai, если указан ХОТЯ БЫ один контрагент ---
#     has_buyer = any([
#         (db_doc.buyer_id or "").strip(),
#         (db_doc.buyer_vat_code or "").strip(),
#         (db_doc.buyer_name or "").strip(),
#     ])
#     has_seller = any([
#         (db_doc.seller_id or "").strip(),
#         (db_doc.seller_vat_code or "").strip(),
#         (db_doc.seller_name or "").strip(),
#     ])

#     db_doc._can_apply_defaults = (scan_type == "sumiskai") and (has_buyer or has_seller)



# def _apply_sumiskai_defaults_from_user(db_doc, user) -> bool:
#     """
#     Применяет дефолты по фирме для sumiskai:
#       - buyer сопоставляем с user.purchase_defaults
#       - seller сопоставляем с user.sales_defaults
#       - приоритет совпадения: įmonės_kodas → įmonės_PVM_kodas → нормализованное название
#       - заполняем ТОЛЬКО пустые: prekes_pavadinimas, prekes_kodas, prekes_barkodas, preke_paslauga ("1"/"2"/"3")
#       - ПРАВИЛО: если одна сторона заполнила ХОТЯ БЫ ОДНО поле, другая НЕ применяется вообще.
#     """
#     from docscanner_app.validators.company_name_normalizer import normalize_company_name

#     # работаем только для sumiskai
#     if (getattr(db_doc, "scan_type", None) or "").strip().lower() != "sumiskai":
#         logger.info("Skip defaults: scan_type != sumiskai (%s)", db_doc.scan_type)
#         return False

#     # ---- helpers ----
#     def _norm_code(x: str) -> str:
#         return (x or "").strip().upper()

#     def _party(side: str):
#         name = getattr(db_doc, f"{side}_name", "") or ""
#         return {
#             "name": name,
#             "name_norm": normalize_company_name(name),
#             "vat":  _norm_code(getattr(db_doc, f"{side}_vat_code", "") or ""),
#             "code": _norm_code(getattr(db_doc, f"{side}_id", "") or ""),  # įmonės kodas
#         }

#     buyer  = _party("buyer")
#     seller = _party("seller")

#     def _to_profiles(raw):
#         import json
#         if isinstance(raw, list):
#             return raw
#         if isinstance(raw, dict):
#             return [raw]
#         if isinstance(raw, str) and raw.strip():
#             try:
#                 data = json.loads(raw)
#                 if isinstance(data, list):  return data
#                 if isinstance(data, dict):  return [data]
#             except Exception as e:
#                 logger.warning("Failed to parse defaults JSON: %s", e)
#         return []

#     purchase_profiles = _to_profiles(getattr(user, "purchase_defaults", None))
#     sales_profiles    = _to_profiles(getattr(user, "sales_defaults", None))
#     logger.info("Defaults pool sizes: purchase=%d, sales=%d", len(purchase_profiles), len(sales_profiles))

#     def _match_profile(party: dict, profiles: list):
#         if not profiles:
#             return None

#         def _pf(x): return (x or "").strip()
#         def _pf_code(x): return _norm_code(_pf(x))
#         def _pf_name_norm(x): return normalize_company_name(_pf(x))

#         # 1) įmonės_kodas
#         if party["code"]:
#             for p in profiles:
#                 if _pf_code(p.get("imones_kodas")) == party["code"]:
#                     logger.info("Matched by imones_kodas: %s", party["code"])
#                     return p
#         # 2) įmonės_PVM_kodas
#         if party["vat"]:
#             for p in profiles:
#                 if _pf_code(p.get("imones_pvm_kodas")) == party["vat"]:
#                     logger.info("Matched by imones_pvm_kodas: %s", party["vat"])
#                     return p
#         # 3) нормализованное название
#         if party["name_norm"]:
#             for p in profiles:
#                 if _pf_name_norm(p.get("imones_pavadinimas")) == party["name_norm"]:
#                     logger.info("Matched by imones_pavadinimas(norm): %s", party["name_norm"])
#                     return p
#         return None

#     def _norm_tipas_to_str(v):
#         if v is None:
#             return None
#         s = str(v).strip().lower()
#         mapping = {"preke": "1", "paslauga": "2", "kodas": "3"}
#         if s in ("1", "2", "3"):
#             return s
#         if s in mapping:
#             return mapping[s]
#         try:
#             i = int(s)
#             if i in (1, 2, 3):
#                 return str(i)
#         except Exception:
#             pass
#         return None

#     # ставим значение только если поле пустое; возвращаем 1, если действительно поставили
#     def _set_if_empty(field: str, value) -> int:
#         cur = getattr(db_doc, field, None)
#         if (str(cur).strip() if cur is not None else ""):
#             return 0
#         if value is None:
#             return 0
#         val_str = str(value).strip()
#         if not val_str:
#             return 0
#         setattr(db_doc, field, val_str)
#         logger.info("Default applied: %s = %r", field, val_str)
#         return 1

#     # применяем профиль; возвращаем, сколько полей реально поставили
#     def _apply_from_profile(profile) -> int:
#         if not profile:
#             return 0
#         applied = 0
#         applied += _set_if_empty("prekes_pavadinimas", profile.get("pavadinimas"))
#         applied += _set_if_empty("prekes_kodas",       profile.get("kodas"))
#         applied += _set_if_empty("prekes_barkodas",    profile.get("barkodas"))
#         tipas_norm = _norm_tipas_to_str(profile.get("tipas"))
#         if tipas_norm:
#             applied += _set_if_empty("preke_paslauga", tipas_norm)
#         return applied

#     changed_total = 0

#     # 1) СНАЧАЛА buyer → purchase_defaults
#     if any([buyer["code"], buyer["vat"], buyer["name"]]):
#         buyer_profile = _match_profile(buyer, purchase_profiles)
#         if buyer_profile:
#             applied = _apply_from_profile(buyer_profile)
#             changed_total += applied
#             if applied > 0:
#                 # Если buyer заполнил хотя бы ОДНО поле — seller НЕ трогаем.
#                 logger.info("Buyer applied %d field(s); skip seller defaults completely.", applied)
#                 logger.info(
#                     "Result after buyer: pavadinimas=%s, kodas=%s, barkodas=%s, tipas=%s",
#                     getattr(db_doc, "prekes_pavadinimas", None),
#                     getattr(db_doc, "prekes_kodas", None),
#                     getattr(db_doc, "prekes_barkodas", None),
#                     getattr(db_doc, "preke_paslauga", None),
#                 )
#                 return True  # ранний выход

#     # 2) Если buyer НИЧЕГО не поставил — пробуем seller → sales_defaults
#     if any([seller["code"], seller["vat"], seller["name"]]):
#         seller_profile = _match_profile(seller, sales_profiles)
#         if seller_profile:
#             applied = _apply_from_profile(seller_profile)
#             changed_total += applied

#     logger.info(
#         "Defaults applied=%s; final: pavadinimas=%s, kodas=%s, barkodas=%s, tipas=%s",
#         bool(changed_total),
#         getattr(db_doc, "prekes_pavadinimas", None),
#         getattr(db_doc, "prekes_kodas", None),
#         getattr(db_doc, "prekes_barkodas", None),
#         getattr(db_doc, "preke_paslauga", None),
#     )
#     return bool(changed_total)





# def _save_line_items(db_doc, doc_struct: Dict[str, Any], scan_type: str):
#     """
#     Пересоздаёт строки LineItem из doc_struct["line_items"] для detaliai.
#     АГРЕГИРУЕТ И/ИЛИ ВЫБИРАЕТ pvm_kodas ВСЕГДА (и для sumiskai тоже).
#     """
#     db_doc.line_items.all().delete()

#     line_items = doc_struct.get("line_items", []) or []
#     db_doc.val_ar_sutapo = None

#     pvm_codes: List[str] = []
#     vat_percents: List[Optional[Decimal]] = []

#     # 1) Создаём строки ТОЛЬКО для detaliai
#     if scan_type == "detaliai" and line_items:
#         for raw_item in line_items:
#             item = sanitize_line_item(raw_item)

#             vat_percent = item.get("vat_percent")
#             pvm_kodas = auto_select_pvm_code(
#                 scan_type=scan_type,
#                 vat_percent=vat_percent,
#                 buyer_country_iso=db_doc.buyer_country_iso,
#                 seller_country_iso=db_doc.seller_country_iso,
#                 separate_vat=False,
#             )

#             pvm_codes.append(pvm_kodas)
#             vat_percents.append(vat_percent)

#             LineItem.objects.create(
#                 document=db_doc,
#                 line_id=item.get("line_id"),
#                 prekes_kodas=item.get("product_code"),
#                 prekes_barkodas=item.get("product_barcode"),
#                 prekes_pavadinimas=item.get("product_name"),
#                 prekes_tipas=item.get("prekes_tipas"),
#                 preke_paslauga=item.get("preke_paslauga"),
#                 unit=item.get("unit"),
#                 quantity=item.get("quantity"),
#                 price=item.get("price"),
#                 subtotal=item.get("subtotal"),
#                 vat=item.get("vat"),
#                 vat_percent=vat_percent,
#                 total=item.get("total"),
#                 discount_with_vat=item.get("discount_with_vat"),
#                 discount_wo_vat=item.get("discount_wo_vat"),
#                 sandelio_kodas=item.get("sandelio_kodas"),
#                 sandelio_pavadinimas=item.get("sandelio_pavadinimas"),
#                 objekto_kodas=item.get("objekto_kodas"),
#                 objekto_pavadinimas=item.get("objekto_pavadinimas"),
#                 padalinio_kodas=item.get("padalinio_kodas"),
#                 padalinio_pavadinimas=item.get("padalinio_pavadinimas"),
#                 mokescio_kodas=item.get("mokescio_kodas"),
#                 mokescio_pavadinimas=item.get("mokescio_pavadinimas"),
#                 atsakingo_asmens_kodas=item.get("atsakingo_asmens_kodas"),
#                 atsakingo_asmens_pavadinimas=item.get("atsakingo_asmens_pavadinimas"),
#                 operacijos_kodas=item.get("operacijos_kodas"),
#                 operacijos_pavadinimas=item.get("operacijos_pavadinimas"),
#                 islaidu_straipsnio_kodas=item.get("islaidu_straipsnio_kodas"),
#                 islaidu_straipsnio_pavadinimas=item.get("islaidu_straipsnio_pavadinimas"),
#                 pvm_kodas=pvm_kodas,
#                 pvm_pavadinimas=item.get("pvm_pavadinimas"),
#                 tipo_kodas=item.get("tipo_kodas"),
#                 tipo_pavadinimas=item.get("tipo_pavadinimas"),
#                 zurnalo_kodas=item.get("zurnalo_kodas"),
#                 zurnalo_pavadinimas=item.get("zurnalo_pavadinimas"),
#                 projekto_kodas=item.get("projekto_kodas"),
#                 projekto_pavadinimas=item.get("projekto_pavadinimas"),
#                 projekto_vadovo_kodas=item.get("projekto_vadovo_kodas"),
#                 projekto_vadovo_pavadinimas=item.get("projekto_vadovo_pavadinimas"),
#                 skyrio_kodas=item.get("skyrio_kodas"),
#                 skyrio_pavadinimas=item.get("skyrio_pavadinimas"),
#                 partijos_nr_kodas=item.get("partijos_nr_kodas"),
#                 partijos_nr_pavadinimas=item.get("partijos_nr_pavadinimas"),
#                 korespondencijos_kodas=item.get("korespondencijos_kodas"),
#                 korespondencijos_pavadinimas=item.get("korespondencijos_pavadinimas"),
#                 serijos_kodas=item.get("serijos_kodas"),
#                 serijos_pavadinimas=item.get("serijos_pavadinimas"),
#                 centro_kodas=item.get("centro_kodas"),
#                 centro_pavadinimas=item.get("centro_pavadinimas"),
#             )

#     # 2) Агрегация/выбор PVM кода — ВСЕГДА
#     if db_doc.separate_vat is True:
#         # разные ставки/коды VAT
#         db_doc.pvm_kodas = "Keli skirtingi PVM"
#         db_doc.vat_percent = None
#     elif scan_type == "detaliai" and line_items:
#         # по строкам, если однородные
#         unique_pvm = {c for c in pvm_codes if c is not None}
#         unique_vat = {v for v in vat_percents if v is not None}
#         if len(unique_pvm) == 1 and len(unique_vat) == 1:
#             db_doc.pvm_kodas = unique_pvm.pop()
#             db_doc.vat_percent = unique_vat.pop()
#         else:
#             db_doc.pvm_kodas = ""
#             db_doc.vat_percent = None
#     else:
#         # sumiskai (или detaliai без строк): выбираем по документу
#         db_doc.pvm_kodas = auto_select_pvm_code(
#             scan_type=scan_type,
#             vat_percent=db_doc.vat_percent,
#             buyer_country_iso=db_doc.buyer_country_iso,
#             seller_country_iso=db_doc.seller_country_iso,
#             separate_vat=db_doc.separate_vat,
#         )

#     db_doc.save()



# def update_scanned_document(
#     db_doc,
#     doc_struct: Dict[str, Any],
#     raw_text: str,
#     preview_url: Optional[str],
#     user,
#     structured: Optional[Dict[str, Any]] = None,
#     glued_raw_text: str = "",
# ):
#     """
#     Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.
#     """
#     scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     # 1) Санитизация
#     doc_struct = sanitize_document_struct(doc_struct)

#     if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
#         doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]

#     # 1.5) Дедупликация скидок ДО расчётов
#     doc_struct = dedupe_document_discounts(doc_struct)

#     # 1.6) ПРИМЕНЯЕМ extra_settings пользователя (например, operation_date ← invoice_date)
#     doc_struct = apply_user_extra_settings(doc_struct, user)


#     # --- Сброс флагов ---
#     db_doc.val_subtotal_match = None
#     db_doc.val_vat_match = None
#     db_doc.val_total_match = None
#     db_doc.val_ar_sutapo = None
#     db_doc.error_message = ""

#     # 2) Валидации
#     if scan_type == "sumiskai":
#         doc_struct = validate_and_calculate_main_amounts(doc_struct)

#     elif scan_type == "detaliai":
#         line_items = doc_struct.get("line_items", []) or []
#         doc_struct["line_items"] = [
#             validate_and_calculate_lineitem_amounts(item) for item in line_items
#         ]

#         # 2) глобальная коррекция документа
#         doc_struct = global_validate_and_correct(doc_struct)

#         # 3) флаги: если поле заменили → match=False
#         db_doc.val_subtotal_match = not bool(doc_struct.get("_subtotal_replaced"))
#         db_doc.val_vat_match      = not bool(doc_struct.get("_vat_replaced"))
#         db_doc.val_total_match    = not bool(doc_struct.get("_total_replaced"))

#         # 4) общий флаг
#         db_doc.was_adjusted = bool(doc_struct.get("_doc_totals_replaced_by_lineitems"))

#         # (опционально) хочешь ещё показать ar_sutapo — можно взять из compare_lineitems
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         db_doc.val_ar_sutapo = (
#             compare_result["subtotal_match"]
#             and compare_result["vat_match"]
#             and compare_result["total_match"]
#         )


#     # 3) Сохранение документа и строк
#     with transaction.atomic():
#         _apply_top_level_fields(
#             db_doc=db_doc,
#             doc_struct=doc_struct,
#             user=user,
#             scan_type=scan_type,
#             raw_text=raw_text,
#             preview_url=preview_url,
#             glued_raw_text=glued_raw_text,
#         )

#         db_doc.save()


#         _save_line_items(db_doc, doc_struct, scan_type)

#         if scan_type == "detaliai":
#             db_doc.val_ar_sutapo = (structured or {}).get("ar_sutapo")

#         db_doc.status = "completed"
#         db_doc.save()


