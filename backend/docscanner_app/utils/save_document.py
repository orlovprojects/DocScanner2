from typing import Any, Dict, List, Optional
from decimal import Decimal
import logging

from django.db import transaction

from ..models import LineItem
from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from ..validators.amount_validator import (
    validate_and_calculate_main_amounts,
    validate_and_calculate_lineitem_amounts,
    compare_lineitems_with_main_totals,
    global_validate_and_correct,
    dedupe_document_discounts,
)
from ..validators.default_currency import set_default_currency
from ..validators.vat_klas import auto_select_pvm_code

# Санитайзеры
from ..utils.parsers import (
    sanitize_document_struct,
    sanitize_line_item,
    convert_for_json,
)

logger = logging.getLogger("celery")


def _apply_top_level_fields(
    db_doc, doc_struct: Dict[str, Any], user, scan_type: str, raw_text: str, preview_url: Optional[str]
):
    """
    Заполняет поля ScannedDocument из уже САНИТИЗИРОВАННОГО doc_struct.
    """
    # Базовые технические поля
    db_doc.raw_text = raw_text
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

    db_doc.invoice_date = doc_struct.get("invoice_date")
    db_doc.due_date = doc_struct.get("due_date")
    db_doc.operation_date = doc_struct.get("operation_date")
    db_doc.document_series = doc_struct.get("document_series")
    db_doc.document_number = doc_struct.get("document_number")
    db_doc.order_number = doc_struct.get("order_number")

    db_doc.amount_wo_vat = doc_struct.get("amount_wo_vat")
    db_doc.invoice_discount_with_vat = doc_struct.get("invoice_discount_with_vat")
    db_doc.invoice_discount_wo_vat = doc_struct.get("invoice_discount_wo_vat")
    db_doc.vat_amount = doc_struct.get("vat_amount")
    db_doc.vat_percent = doc_struct.get("vat_percent")
    db_doc.amount_with_vat = doc_struct.get("amount_with_vat")

    db_doc.separate_vat = doc_struct.get("separate_vat")
    db_doc.currency = set_default_currency(doc_struct.get("currency"))
    db_doc.with_receipt = doc_struct.get("with_receipt")
    db_doc.document_type = doc_struct.get("document_type")

    db_doc.similarity_percent = doc_struct.get("similarity_percent")
    db_doc.note = doc_struct.get("note")
    db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
    db_doc.document_type_code = doc_struct.get("document_type_code")
    db_doc.xml_source = doc_struct.get("xml_source")

    # --- Короткие продуктовые поля для sumiskai ---
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
        db_doc.projekto_kodas = ""
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


def _save_line_items(db_doc, doc_struct: Dict[str, Any], scan_type: str):
    """
    Пересоздаёт строки LineItem из doc_struct["line_items"] для detaliai.
    АГРЕГИРУЕТ И/ИЛИ ВЫБИРАЕТ pvm_kodas ВСЕГДА (и для sumiskai тоже).
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
            pvm_kodas = auto_select_pvm_code(
                scan_type=scan_type,
                vat_percent=vat_percent,
                buyer_country_iso=db_doc.buyer_country_iso,
                seller_country_iso=db_doc.seller_country_iso,
                separate_vat=False,
            )

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
                unit=item.get("unit"),
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

    # 2) Агрегация/выбор PVM кода — ВСЕГДА
    if db_doc.separate_vat is True:
        # разные ставки/коды VAT
        db_doc.pvm_kodas = "Keli skirtingi PVM"
        db_doc.vat_percent = None
    elif scan_type == "detaliai" and line_items:
        # по строкам, если однородные
        unique_pvm = {c for c in pvm_codes if c is not None}
        unique_vat = {v for v in vat_percents if v is not None}
        if len(unique_pvm) == 1 and len(unique_vat) == 1:
            db_doc.pvm_kodas = unique_pvm.pop()
            db_doc.vat_percent = unique_vat.pop()
        else:
            db_doc.pvm_kodas = ""
            db_doc.vat_percent = None
    else:
        # sumiskai (или detaliai без строк): выбираем по документу
        db_doc.pvm_kodas = auto_select_pvm_code(
            scan_type=scan_type,
            vat_percent=db_doc.vat_percent,
            buyer_country_iso=db_doc.buyer_country_iso,
            seller_country_iso=db_doc.seller_country_iso,
            separate_vat=db_doc.separate_vat,
        )

    db_doc.save()



def update_scanned_document(
    db_doc,
    doc_struct: Dict[str, Any],
    raw_text: str,
    preview_url: Optional[str],
    user,
    structured: Optional[Dict[str, Any]] = None,
):
    """
    Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.
    """
    scan_type = getattr(db_doc, "scan_type", "sumiskai")

    # 1) Санитизация
    doc_struct = sanitize_document_struct(doc_struct)

    if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
        doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]

    # 1.5) Дедупликация скидок ДО расчётов
    doc_struct = dedupe_document_discounts(doc_struct)

    # # --- Сброс флагов ---
    # db_doc.val_subtotal_match = None
    # db_doc.val_vat_match = None
    # db_doc.val_total_match = None
    # db_doc.val_ar_sutapo = None
    # db_doc.error_message = ""

    # # 2) Валидации
    # if scan_type == "sumiskai":
    #     doc_struct = validate_and_calculate_main_amounts(doc_struct)
    
    # elif scan_type == "detaliai":
    #     line_items = doc_struct.get("line_items", []) or []
    #     # 1) нормализуем строки ТОЛЬКО при необходимости (если используешь)
    #     # doc_struct = normalize_line_items_if_needed(doc_struct)
    #     # если нет — оставь как у тебя:
    #     doc_struct["line_items"] = [validate_and_calculate_lineitem_amounts(item) for item in line_items]

    #     # 2) глобальная коррекция документа
    #     doc_struct = global_validate_and_correct(doc_struct)

    #     # 3) финальная сверка уже ПОСЛЕ коррекции
    #     compare_result = compare_lineitems_with_main_totals(doc_struct)
    #     db_doc.val_subtotal_match = bool(compare_result["subtotal_match"])
    #     db_doc.val_vat_match      = bool(compare_result["vat_match"])
    #     db_doc.val_total_match    = bool(compare_result["total_match"])

    #     # 4) НЕ затираем True на False из-за флага "было заменено".
    #     #    Вместо этого — просто оставим примечание, если что-то меняли.
    #     was_adjusted = bool(doc_struct.get("_doc_totals_replaced_by_lineitems"))
    #     db_doc.was_adjusted = was_adjusted  # новый необязательный признак в БД (если есть)


    # --- Сброс флагов ---
    db_doc.val_subtotal_match = None
    db_doc.val_vat_match = None
    db_doc.val_total_match = None
    db_doc.val_ar_sutapo = None
    db_doc.error_message = ""

    # 2) Валидации
    if scan_type == "sumiskai":
        doc_struct = validate_and_calculate_main_amounts(doc_struct)

    elif scan_type == "detaliai":
        line_items = doc_struct.get("line_items", []) or []
        doc_struct["line_items"] = [
            validate_and_calculate_lineitem_amounts(item) for item in line_items
        ]

        # 2) глобальная коррекция документа
        doc_struct = global_validate_and_correct(doc_struct)

        # 3) флаги: если поле заменили → match=False
        db_doc.val_subtotal_match = not bool(doc_struct.get("_subtotal_replaced"))
        db_doc.val_vat_match      = not bool(doc_struct.get("_vat_replaced"))
        db_doc.val_total_match    = not bool(doc_struct.get("_total_replaced"))

        # 4) общий флаг
        db_doc.was_adjusted = bool(doc_struct.get("_doc_totals_replaced_by_lineitems"))

        # (опционально) хочешь ещё показать ar_sutapo — можно взять из compare_lineitems
        compare_result = compare_lineitems_with_main_totals(doc_struct)
        db_doc.val_ar_sutapo = (
            compare_result["subtotal_match"]
            and compare_result["vat_match"]
            and compare_result["total_match"]
        )




    # if scan_type == "sumiskai":
    #     doc_struct = validate_and_calculate_main_amounts(doc_struct)

    # elif scan_type == "detaliai":
    #     line_items = doc_struct.get("line_items", []) or []
    #     doc_struct["line_items"] = [validate_and_calculate_lineitem_amounts(item) for item in line_items]

    #     doc_struct = global_validate_and_correct(doc_struct)

    #     compare_result = compare_lineitems_with_main_totals(doc_struct)
    #     db_doc.val_subtotal_match = compare_result["subtotal_match"]
    #     db_doc.val_vat_match = compare_result["vat_match"]
    #     db_doc.val_total_match = compare_result["total_match"]

    #     # Если документные суммы заменились суммами строк → сразу False
    #     if doc_struct.get("_doc_totals_replaced_by_lineitems"):
    #         if doc_struct.get("_subtotal_replaced"):
    #             db_doc.val_subtotal_match = False
    #         if doc_struct.get("_vat_replaced"):
    #             db_doc.val_vat_match = False
    #         if doc_struct.get("_total_replaced"):
    #             db_doc.val_total_match = False



    # 3) Сохранение документа и строк
    with transaction.atomic():
        _apply_top_level_fields(
            db_doc=db_doc,
            doc_struct=doc_struct,
            user=user,
            scan_type=scan_type,
            raw_text=raw_text,
            preview_url=preview_url,
        )
        db_doc.save()

        _save_line_items(db_doc, doc_struct, scan_type)

        if scan_type == "detaliai":
            db_doc.val_ar_sutapo = (structured or {}).get("ar_sutapo")

        db_doc.status = "completed"
        db_doc.save()






# from typing import Any, Dict, List, Optional
# from decimal import Decimal
# import logging

# from django.db import transaction  # NEW: для атомарного сохранения

# from ..models import LineItem
# from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
# from ..validators.amount_validator import (
#     validate_and_calculate_main_amounts,
#     validate_and_calculate_lineitem_amounts,
#     compare_lineitems_with_main_totals,
#     global_validate_and_correct,
# )
# from ..validators.default_currency import set_default_currency
# from ..validators.vat_klas import auto_select_pvm_code

# # ВАЖНО: подключаем санитайзеры
# from ..utils.parsers import (
#     sanitize_document_struct,
#     sanitize_line_item,
#     convert_for_json,
# )
# from celery import current_app


# logger = logging.getLogger("celery")


# def convert_decimals(obj: Any):
#     """
#     Совместимость: если хочешь оставить свою версию — используй _convert_decimals,
#     иначе эта функция просто проксирует.
#     """
#     return _convert_decimals(obj)


# def _apply_top_level_fields(
#     db_doc, doc_struct: Dict[str, Any], user, scan_type: str, raw_text: str, preview_url: Optional[str]
# ):
#     """
#     Заполняет поля ScannedDocument из уже САНИТИЗИРОВАННОГО doc_struct.
#     Никаких прямых Decimal(str(...)) здесь — вся нормализация сделана в sanitize_*.
#     """
#     # Базовые технические поля
#     db_doc.raw_text = raw_text
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
#     # ВНИМАНИЕ: vat_percent в модели Decimal(5,2). В санитайзере он приведён к Decimal или None.
#     # Если нужен int — приводи при отображении, но в БД храним Decimal.
#     db_doc.vat_percent = doc_struct.get("vat_percent")
#     db_doc.amount_with_vat = doc_struct.get("amount_with_vat")

#     db_doc.separate_vat = doc_struct.get("separate_vat")
#     db_doc.currency = set_default_currency(doc_struct.get("currency"))
#     db_doc.with_receipt = doc_struct.get("with_receipt")
#     db_doc.document_type = doc_struct.get("document_type")

#     db_doc.similarity_percent = doc_struct.get("similarity_percent")
#     db_doc.note = doc_struct.get("note")
#     db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
#     db_doc.document_type_code = doc_struct.get("document_type_code")
#     db_doc.xml_source = doc_struct.get("xml_source")

#     # --- Короткие продуктовые поля для sumiskai ---
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
#         db_doc.islaidu_straipsnio_pavadinimas = first_item.get("islaidu_stраipsnio_pavadinimas") or ""
#         db_doc.pvm_kodas = first_item.get("pvm_kodas") or ""
#         db_doc.pvm_pavadinimas = first_item.get("pvm_pavadinimas") or ""
#         db_doc.tipo_kodas = first_item.get("tipo_kodas") or ""
#         db_doc.tipo_pavadinimas = first_item.get("tipo_pavadinimas") or ""
#         db_doc.zurnalo_kodas = first_item.get("zurnalo_kodas") or ""
#         db_doc.zurnalo_pavadinimas = first_item.get("zurnalo_pavadinimas") or ""
#         db_doc.projekтo_kodas = first_item.get("projekto_kodas") or ""
#         db_doc.projekто_pavadinimas = first_item.get("projekto_pavadinimas") or ""
#         db_doc.projekто_vadovo_kodas = first_item.get("projekto_vadovo_kodas") or ""
#         db_doc.projekто_vadovo_pavadинimas = first_item.get("projekto_vadovo_pavadinimas") or ""
#         db_doc.skyrio_kodas = first_item.get("skyrio_kodas") or ""
#         db_doc.skyrio_pavadинimas = first_item.get("skyrio_pavadinimas") or ""
#         db_doc.partijos_nr_kodas = first_item.get("partijos_nr_kodas") or ""
#         db_doc.partijos_nr_pavadинimas = first_item.get("partijos_nr_pavadinimas") or ""
#         db_doc.korespondencijos_kodas = first_item.get("korespondencijos_kodas") or ""
#         db_doc.korespondencijos_pavadинimas = first_item.get("korespondencijos_pavadinimas") or ""
#         db_doc.serijos_kodas = first_item.get("serijos_kodas") or ""
#         db_doc.serijos_pavadинimas = first_item.get("serijos_pavadinimas") or ""
#         db_doc.centro_kodas = first_item.get("centro_kodas") or ""
#         db_doc.centro_pavadинimas = first_item.get("centro_pavadinimas") or ""
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
#         db_doc.atsakingо_asmens_kodas = ""
#         db_doc.atsakingо_asmens_pavadinimas = ""
#         db_doc.operacijos_kodas = ""
#         db_doc.operacijos_pavadinimas = ""
#         db_doc.islaidu_straipsnio_kodas = ""
#         db_doc.islaidu_stраipsnio_pavadinimas = ""
#         db_doc.pvm_kodas = ""
#         db_doc.pvm_pavadinimas = ""
#         db_doc.tipo_kodas = ""
#         db_doc.tipo_pavadinimas = ""
#         db_doc.zurnalo_kodas = ""
#         db_doc.zurnalo_pavadинimas = ""
#         db_doc.projekто_kodas = ""
#         db_doc.projekто_pavadинimas = ""
#         db_doc.projekто_vadово_kodas = ""
#         db_doc.projekто_vadово_pavadинimas = ""
#         db_doc.skyrio_kodas = ""
#         db_doc.skyrio_pavadинimas = ""
#         db_doc.partijos_nr_kodas = ""
#         db_doc.partijos_nr_pavadинimas = ""
#         db_doc.korespondencijos_kodas = ""
#         db_doc.korespondencijos_pavadинimas = ""
#         db_doc.serijos_kodas = ""
#         db_doc.serijos_pavadинimas = ""
#         db_doc.centro_kodas = ""
#         db_doc.centro_pavadинimas = ""

#     # Определяем pirkimas/pardavimas
#     db_doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, user)


# def _save_line_items(db_doc, doc_struct: Dict[str, Any], scan_type: str):
#     """
#     Пересоздаёт строки LineItem из doc_struct["line_items"].
#     doc_struct уже санитизирован, но НА ВСЯКИЙ случай прогоняем каждый item через sanitize_line_item.
#     """
#     # очистка старых строк
#     db_doc.line_items.all().delete()

#     if scan_type != "detaliai":
#         return

#     line_items = doc_struct.get("line_items", []) or []
#     db_doc.val_ar_sutapo = None  # выставим ниже, если structured есть в зовущем коде

#     pvm_codes: List[str] = []
#     vat_percents: List[Optional[Decimal]] = []

#     for raw_item in line_items:
#         item = sanitize_line_item(raw_item)

#         vat_percent = item.get("vat_percent")  # Decimal | None
#         # для строк всегда считаем separate_vat=False — чтобы не получить "Keli skirtingi PVM" на каждую строку
#         pvm_kodas = auto_select_pvm_code(
#             scan_type=scan_type,
#             vat_percent=vat_percent,
#             buyer_country_iso=db_doc.buyer_country_iso,
#             seller_country_iso=db_doc.seller_country_iso,
#             separate_vat=False,
#         )

#         pvm_codes.append(pvm_kodas)
#         vat_percents.append(vat_percent)

#         LineItem.objects.create(
#             document=db_doc,
#             line_id=item.get("line_id"),
#             prekes_kodas=item.get("product_code"),
#             prekes_barkodas=item.get("product_barcode"),
#             prekes_pavadinimas=item.get("product_name"),
#             prekes_tipas=item.get("prekes_tipas"),
#             preke_paslauga=item.get("preke_paslauga"),
#             unit=item.get("unit"),
#             quantity=item.get("quantity"),
#             price=item.get("price"),
#             subtotal=item.get("subtotal"),
#             vat=item.get("vat"),
#             vat_percent=vat_percent,
#             total=item.get("total"),
#             discount_with_vat=item.get("discount_with_vat"),
#             discount_wo_vat=item.get("discount_wo_vat"),
#             sandelio_kodas=item.get("sandelio_kodas"),
#             sandelio_pavadinimas=item.get("sandelio_pavadinimas"),
#             objekto_kodas=item.get("objekto_kodas"),
#             objekto_pavadinimas=item.get("objekto_pavadinimas"),
#             padalinio_kodas=item.get("padalinio_kodas"),
#             padalinio_pavadinimas=item.get("padalinio_pavadinimas"),
#             mokescio_kodas=item.get("mokescio_kodas"),
#             mokescio_pavadinimas=item.get("mokescio_pavadinimas"),
#             atsakingo_asmens_kodas=item.get("atsakingo_asmens_kodas"),
#             atsakingo_asmens_pavadinimas=item.get("atsakingo_asmens_pavadinimas"),
#             operacijos_kodas=item.get("operacijos_kodas"),
#             operacijos_pavadinimas=item.get("operacijos_pavadinimas"),
#             islaidu_straipsnio_kodas=item.get("islaidu_straipsnio_kodas"),
#             islaidu_straipsnio_pavadinimas=item.get("islaidu_straipsnio_pavadinimas"),
#             pvm_kodas=pvm_kodas,
#             pvm_pavadinimas=item.get("pvm_pavadinimas"),
#             tipo_kodas=item.get("tipo_kodas"),
#             tipo_pavadinimas=item.get("tipo_pavadinimas"),
#             zurnalo_kodas=item.get("zurnalo_kodas"),
#             zurnalo_pavadinimas=item.get("zurnalo_pavadinimas"),
#             projekto_kodas=item.get("projekto_kodas"),
#             projekto_pavadinimas=item.get("projekto_pavadinimas"),
#             projekto_vadovo_kodas=item.get("projekto_vadovo_kodas"),
#             projekto_vadovo_pavadinimas=item.get("projekto_vadovo_pavadinimas"),
#             skyrio_kodas=item.get("skyrio_kodas"),
#             skyrio_pavadinimas=item.get("skyrio_pavadinimas"),
#             partijos_nr_kodas=item.get("partijos_nr_kodas"),
#             partijos_nr_pavadinimas=item.get("partijos_nr_pavadinimas"),
#             korespondencijos_kodas=item.get("korespondencijos_kodas"),
#             korespondencijos_pavadinimas=item.get("korespondencijos_pavadinimas"),
#             serijos_kodas=item.get("serijos_kodas"),
#             serijos_pavadinimas=item.get("serijos_pavadinimas"),
#             centro_kodas=item.get("centro_kodas"),
#             centro_pavadinimas=item.get("centro_pavadinimas"),
#         )

#     # Итоговая агрегация по документу
#     if db_doc.separate_vat is True:
#         db_doc.pvm_kodas = "Keli skirtingi PVM"
#         db_doc.vat_percent = None
#     elif line_items:
#         unique_pvm = {c for c in pvm_codes if c is not None}
#         unique_vat = {v for v in vat_percents if v is not None}
#         if len(unique_pvm) == 1 and len(unique_vat) == 1:
#             db_doc.pvm_kodas = unique_pvm.pop()
#             db_doc.vat_percent = unique_vat.pop()
#         else:
#             db_doc.pvm_kodas = ""
#             db_doc.vat_percent = None
#     else:
#         db_doc.pvm_kodas = auto_select_pvm_code(
#             scan_type=scan_type,
#             vat_percent=db_doc.vat_percent,
#             buyer_country_iso=db_doc.buyer_country_iso,
#             seller_country_iso=db_doc.seller_country_iso,
#             separate_vat=db_doc.separate_vat,
#         )

#     db_doc.save()


# def _trigger_reprocess_async(doc_id: int):
#     # таск будет послан только после успешного коммита БД
#     def _send():
#         current_app.send_task('docscanner_app.tasks.reprocess_with_gemini', args=[doc_id])
#     transaction.on_commit(_send)


# def update_scanned_document(
#     db_doc,
#     doc_struct: Dict[str, Any],
#     raw_text: str,
#     preview_url: Optional[str],
#     parse_date_lit,  # оставлены для совместимости сигнатуры, внутри не используются
#     parse_decimal_lit,  # (всё делаем через sanitize_*), можешь удалить из вызовов позднее
#     parse_percent_int,
#     user,
#     structured: Optional[Dict[str, Any]] = None,
# ):
#     """
#     Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.
#     """
#     scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     # 1) Санитизация верхнего уровня
#     doc_struct = sanitize_document_struct(doc_struct)

#     # 2) Санитизация line items (если есть)
#     if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
#         doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]

#     # --- Сброс флагов/ошибки на старте (чтобы не тянуться из прошлого) ---
#     db_doc.val_subtotal_match = None
#     db_doc.val_vat_match = None
#     db_doc.val_total_match = None
#     db_doc.val_ar_sutapo = None
#     db_doc.error_message = ""

#     # Счётчик повторного прогона (храним в structured_json, чтобы без миграций)
#     try:
#         attempts = int((db_doc.structured_json or {}).get("_reprocess_attempts", 0))
#     except Exception:
#         attempts = 0

#     # 3) Валидации/коррекции до сохранения
#     if scan_type == "sumiskai":
#         doc_struct = validate_and_calculate_main_amounts(doc_struct)

#     elif scan_type == "detaliai":
#         # 3.1 Пересчёт строк
#         line_items = doc_struct.get("line_items", []) or []
#         doc_struct["line_items"] = [validate_and_calculate_lineitem_amounts(item) for item in line_items]

#         # 3.2 Глобальная коррекция документа и строк
#         doc_struct = global_validate_and_correct(doc_struct)

#         # 3.3 Итоговые флаги сравнения
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         db_doc.val_subtotal_match = compare_result["subtotal_match"]
#         db_doc.val_vat_match = compare_result["vat_match"]
#         db_doc.val_total_match = compare_result["total_match"]

#         # Признак, что документные суммы были заменены суммами строк
#         doc_totals_replaced = bool(doc_struct.get("_doc_totals_replaced_by_lineitems"))

#         # --- Первый раз: отправляем на повторный круг Gemini ---
#         if doc_totals_replaced and attempts == 0:
#             try:
#                 sj = dict(db_doc.structured_json or {})
#                 sj["_reprocess_attempts"] = 1
#                 db_doc.structured_json = sj
#                 db_doc.status = "requeue"
#                 db_doc.save()
#             except Exception as e:
#                 logger.warning(f"[update_scanned_document] failed to mark reprocess: {e}")

#             # Запускаем Celery-таску второго круга
#             _trigger_reprocess_async(db_doc.id)
#             return  # второй круг сам вызовет update_scanned_document

#         # --- Второй раз: если снова пришлось заменить суммы, то точечно ставим False по несоответствиям ---
#         if doc_totals_replaced and attempts >= 1:
#             if not compare_result["subtotal_match"]:
#                 db_doc.val_subtotal_match = False
#             if not compare_result["vat_match"]:
#                 db_doc.val_vat_match = False
#             if not compare_result["total_match"]:
#                 db_doc.val_total_match = False

#         # Логи несоответствий для фронта
#         if not (compare_result["subtotal_match"] and compare_result["vat_match"] and compare_result["total_match"]):
#             db_doc.error_message = "\n".join(doc_struct.get("_global_validation_log", []))

#     # 4) Сохранение в транзакции и корректный порядок
#     with transaction.atomic():
#         # Верхний уровень
#         _apply_top_level_fields(
#             db_doc=db_doc,
#             doc_struct=doc_struct,
#             user=user,
#             scan_type=scan_type,
#             raw_text=raw_text,
#             preview_url=preview_url,
#         )
#         db_doc.save()

#         # Строки
#         _save_line_items(db_doc, doc_struct, scan_type)

#         # Доп.флаг (если приходил в structured) — только для detaliai
#         if scan_type == "detaliai":
#             db_doc.val_ar_sutapo = (structured or {}).get("ar_sutapo")

#         # Финальный статус — после успешного сохранения строк
#         db_doc.status = "completed"
#         db_doc.save()
















# from typing import Any, Dict, List, Optional
# from decimal import Decimal
# import logging

# from ..models import LineItem
# from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
# from ..validators.amount_validator import (
#     validate_and_calculate_main_amounts,
#     validate_and_calculate_lineitem_amounts,
#     compare_lineitems_with_main_totals,
#     global_validate_and_correct,
# )
# from ..validators.default_currency import set_default_currency
# from ..validators.vat_klas import auto_select_pvm_code

# # ВАЖНО: подключаем санитайзеры
# from ..utils.parsers import (
#     sanitize_document_struct,
#     sanitize_line_item,
#     convert_for_json 
# )

# logger = logging.getLogger("celery")


# def convert_decimals(obj: Any):
#     """
#     Совместимость: если хочешь оставить свою версию — используй _convert_decimals,
#     иначе эта функция просто проксирует.
#     """
#     return _convert_decimals(obj)


# def _apply_top_level_fields(db_doc, doc_struct: Dict[str, Any], user, scan_type: str, raw_text: str, preview_url: Optional[str]):
#     """
#     Заполняет поля ScannedDocument из уже САНИТИЗИРОВАННОГО doc_struct.
#     Никаких прямых Decimal(str(...)) здесь — вся нормализация сделана в sanitize_*.
#     """
#     # Базовые технические поля
#     db_doc.raw_text = raw_text
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
#     # ВНИМАНИЕ: vat_percent в модели Decimal(5,2). В санитайзере он приведён к Decimal или None.
#     # Если нужен int — приводи при отображении, но в БД храним Decimal.
#     db_doc.vat_percent = doc_struct.get("vat_percent")
#     db_doc.amount_with_vat = doc_struct.get("amount_with_vat")

#     db_doc.separate_vat = doc_struct.get("separate_vat")
#     db_doc.currency = set_default_currency(doc_struct.get("currency"))
#     db_doc.with_receipt = doc_struct.get("with_receipt")
#     db_doc.document_type = doc_struct.get("document_type")

#     db_doc.similarity_percent = doc_struct.get("similarity_percent")
#     db_doc.note = doc_struct.get("note")
#     db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
#     db_doc.document_type_code = doc_struct.get("document_type_code")
#     db_doc.xml_source = doc_struct.get("xml_source")

#     # --- Короткие продуктовые поля для sumiskai ---
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


# def _save_line_items(db_doc, doc_struct: Dict[str, Any], scan_type: str):
#     """
#     Пересоздаёт строки LineItem из doc_struct["line_items"].
#     doc_struct уже санитизирован, но НА ВСЯКИЙ случай прогоняем каждый item через sanitize_line_item.
#     """
#     # очистка старых строк
#     db_doc.line_items.all().delete()

#     if scan_type != "detaliai":
#         return

#     line_items = doc_struct.get("line_items", []) or []
#     db_doc.val_ar_sutapo = None  # выставим ниже, если structured есть в зовущем коде

#     pvm_codes: List[str] = []
#     vat_percents: List[Optional[Decimal]] = []

#     for raw_item in line_items:
#         item = sanitize_line_item(raw_item)

#         vat_percent = item.get("vat_percent")  # Decimal | None
#         # для строк всегда считаем separate_vat=False — чтобы не получить "Keli skirtingi PVM" на каждую строку
#         pvm_kodas = auto_select_pvm_code(
#             scan_type=scan_type,
#             vat_percent=vat_percent,
#             buyer_country_iso=db_doc.buyer_country_iso,
#             seller_country_iso=db_doc.seller_country_iso,
#             separate_vat=False
#         )

#         pvm_codes.append(pvm_kodas)
#         vat_percents.append(vat_percent)

#         LineItem.objects.create(
#             document=db_doc,
#             line_id=item.get("line_id"),
#             prekes_kodas=item.get("product_code"),
#             prekes_barkodas=item.get("product_barcode"),
#             prekes_pavadinimas=item.get("product_name"),
#             prekes_tipas=item.get("prekes_tipas"),
#             preke_paslauga=item.get("preke_paslauga"),
#             unit=item.get("unit"),
#             quantity=item.get("quantity"),
#             price=item.get("price"),
#             subtotal=item.get("subtotal"),
#             vat=item.get("vat"),
#             vat_percent=vat_percent,
#             total=item.get("total"),
#             discount_with_vat=item.get("discount_with_vat"),
#             discount_wo_vat=item.get("discount_wo_vat"),
#             sandelio_kodas=item.get("sandelio_kodas"),
#             sandelio_pavadinimas=item.get("sandelio_pavadinimas"),
#             objekto_kodas=item.get("objekto_kodas"),
#             objekto_pavadinimas=item.get("objekto_pavadinimas"),
#             padalinio_kodas=item.get("padalinio_kodas"),
#             padalinio_pavadinimas=item.get("padalinio_pavadinimas"),
#             mokescio_kodas=item.get("mokescio_kodas"),
#             mokescio_pavadinimas=item.get("mokescio_pavadinimas"),
#             atsakingo_asmens_kodas=item.get("atsakingo_asmens_kodas"),
#             atsakingo_asmens_pavadinimas=item.get("atsakingo_asmens_pavadinimas"),
#             operacijos_kodas=item.get("operacijos_kodas"),
#             operacijos_pavadinimas=item.get("operacijos_pavadinimas"),
#             islaidu_straipsnio_kodas=item.get("islaidu_straipsnio_kodas"),
#             islaidu_straipsnio_pavadinimas=item.get("islaidu_straipsnio_pavadinimas"),
#             pvm_kodas=pvm_kodas,
#             pvm_pavadinimas=item.get("pvm_pavadinimas"),
#             tipo_kodas=item.get("tipo_kodas"),
#             tipo_pavadinimas=item.get("tipo_pavadinimas"),
#             zurnalo_kodas=item.get("zurnalo_kodas"),
#             zurnalo_pavadinimas=item.get("zurnalo_pavadinimas"),
#             projekto_kodas=item.get("projekto_kodas"),
#             projekto_pavadinimas=item.get("projekto_pavadinimas"),
#             projekto_vadovo_kodas=item.get("projekto_vadovo_kodas"),
#             projekto_vadovo_pavadinimas=item.get("projekto_vadovo_pavadinimas"),
#             skyrio_kodas=item.get("skyrio_kodas"),
#             skyrio_pavadinimas=item.get("skyrio_pavadinimas"),
#             partijos_nr_kodas=item.get("partijos_nr_kodas"),
#             partijos_nr_pavadinimas=item.get("partijos_nr_pavadinimas"),
#             korespondencijos_kodas=item.get("korespondencijos_kodas"),
#             korespondencijos_pavadinimas=item.get("korespondencijos_pavadinimas"),
#             serijos_kodas=item.get("serijos_kodas"),
#             serijos_pavadinimas=item.get("serijos_pavadinimas"),
#             centro_kodas=item.get("centro_kodas"),
#             centro_pavadinimas=item.get("centro_pavadinimas"),
#         )

#     # Итоговая агрегация по документу
#     if db_doc.separate_vat is True:
#         db_doc.pvm_kodas = "Keli skirtingi PVM"
#         db_doc.vat_percent = None
#     elif line_items:
#         unique_pvm = {c for c in pvm_codes if c is not None}
#         unique_vat = {v for v in vat_percents if v is not None}
#         if len(unique_pvm) == 1 and len(unique_vat) == 1:
#             db_doc.pvm_kodas = unique_pvm.pop()
#             db_doc.vat_percent = unique_vat.pop()
#         else:
#             db_doc.pvm_kodas = ""
#             db_doc.vat_percent = None
#     else:
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
#     parse_date_lit,          # оставлены для совместимости сигнатуры, внутри не используются
#     parse_decimal_lit,       # (всё делаем через sanitize_*), можешь удалить из вызовов позднее
#     parse_percent_int,
#     user,
#     structured: Optional[Dict[str, Any]] = None
# ):
#     """
#     Главный вход: принимает распарсенный JSON от LLM, санитизирует, валидирует суммы, сохраняет документ и строки.
#     """

#     scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     # 1) Санитизация верхнего уровня
#     doc_struct = sanitize_document_struct(doc_struct)

#     # 2) Санитизация line items (если есть)
#     if "line_items" in doc_struct and isinstance(doc_struct["line_items"], list):
#         doc_struct["line_items"] = [sanitize_line_item(li) for li in doc_struct["line_items"]]

#     # 3) Валидации/коррекции до сохранения
#     if scan_type == "sumiskai":
#         doc_struct = validate_and_calculate_main_amounts(doc_struct)
#         db_doc.val_subtotal_match = None
#         db_doc.val_vat_match = None
#         db_doc.val_total_match = None
#     elif scan_type == "detaliai":
#         # 3.1 Пересчёт строк
#         line_items = doc_struct.get("line_items", []) or []
#         doc_struct["line_items"] = [validate_and_calculate_lineitem_amounts(item) for item in line_items]

#         # 3.2 Глобальная коррекция документа и строк
#         doc_struct = global_validate_and_correct(doc_struct)

#         # 3.3 Итоговые флаги сравнения
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         db_doc.val_subtotal_match = compare_result["subtotal_match"]
#         db_doc.val_vat_match = compare_result["vat_match"]
#         db_doc.val_total_match = compare_result["total_match"]

#         # Логи несоответствий
#         if not (compare_result["subtotal_match"] and compare_result["vat_match"] and compare_result["total_match"]):
#             db_doc.error_message = "\n".join(doc_struct.get("_global_validation_log", []))

#     # 4) Заполняем модель верхнего уровня
#     _apply_top_level_fields(
#         db_doc=db_doc,
#         doc_struct=doc_struct,
#         user=user,
#         scan_type=scan_type,
#         raw_text=raw_text,
#         preview_url=preview_url
#     )

#     # 5) Ставим финальный статус здесь (но строки ещё не записаны)
#     db_doc.status = 'completed'
#     db_doc.save()

#     # 6) Строки
#     _save_line_items(db_doc, doc_struct, scan_type)

#     # 7) val_ar_sutapo (если приходил в structured и это detaliai)
#     if scan_type == "detaliai":
#         db_doc.val_ar_sutapo = (structured or {}).get("ar_sutapo")
#         db_doc.save()

