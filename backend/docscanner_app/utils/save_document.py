from ..models import LineItem
from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from ..validators.amount_validator import (
    validate_and_calculate_main_amounts,
    validate_and_calculate_lineitem_amounts,
    compare_lineitems_with_main_totals,
    global_validate_and_correct,
)
from ..validators.default_currency import set_default_currency
from ..validators.vat_klas import auto_select_pvm_code
from decimal import Decimal


import logging
logger = logging.getLogger("celery")

def convert_decimals(obj):
    if isinstance(obj, list):
        return [convert_decimals(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    return obj

def update_scanned_document(
    db_doc, doc_struct, raw_text, preview_url,
    parse_date_lit, parse_decimal_lit, parse_percent_int, user, structured=None
):
    scan_type = getattr(db_doc, "scan_type", "sumiskai")

    # === Валидировать и досчитать суммы до сохранения в модель ===
    if scan_type == "sumiskai":
        doc_struct = validate_and_calculate_main_amounts(doc_struct)
        # Для sumiskai ставим None (или False, если хочешь явно)
        db_doc.val_subtotal_match = None
        db_doc.val_vat_match = None
        db_doc.val_total_match = None
    elif scan_type == "detaliai":
        line_items = doc_struct.get("line_items", [])
        # 1. Валидация line items
        doc_struct["line_items"] = [
            validate_and_calculate_lineitem_amounts(item) for item in line_items
        ]

        # 2. Глобальная коррекция документа и line items
        doc_struct = global_validate_and_correct(doc_struct)  # <-- ДОБАВЬ ЭТО!

        # 3. Итоговое сравнение для флагов
        compare_result = compare_lineitems_with_main_totals(doc_struct)
        db_doc.val_subtotal_match = compare_result["subtotal_match"]
        db_doc.val_vat_match = compare_result["vat_match"]
        db_doc.val_total_match = compare_result["total_match"]

        # 4. Можно реагировать на ошибки (например, выводить логи в UI)
        if not (compare_result["subtotal_match"] and compare_result["vat_match"] and compare_result["total_match"]):
            # например, положить логи глобальной проверки в error_message или отдельное поле
            db_doc.error_message = "\n".join(doc_struct.get("_global_validation_log", []))   


    # elif scan_type == "detaliai":
    #     line_items = doc_struct.get("line_items", [])
    #     doc_struct["line_items"] = [
    #         validate_and_calculate_lineitem_amounts(item) for item in line_items
    #     ]
    #     compare_result = compare_lineitems_with_main_totals(doc_struct)
    #     db_doc.val_subtotal_match = compare_result["subtotal_match"]
    #     db_doc.val_vat_match = compare_result["vat_match"]
    #     db_doc.val_total_match = compare_result["total_match"]
    #     # Можно тут реагировать на не-совпадение, если нужно
    #     if not (compare_result["subtotal_match"] and compare_result["vat_match"] and compare_result["total_match"]):
    #         pass

    db_doc.raw_text = raw_text
    db_doc.structured_json = convert_decimals(doc_struct)
    db_doc.status = 'completed'
    db_doc.preview_url = preview_url

    if isinstance(doc_struct, dict):
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

        db_doc.invoice_date = parse_date_lit(doc_struct.get("invoice_date"))
        db_doc.due_date = parse_date_lit(doc_struct.get("due_date"))
        db_doc.operation_date = parse_date_lit(doc_struct.get("operation_date"))
        db_doc.document_series = doc_struct.get("document_series")
        db_doc.document_number = doc_struct.get("document_number")
        db_doc.order_number = doc_struct.get("order_number")
        db_doc.amount_wo_vat = parse_decimal_lit(doc_struct.get("amount_wo_vat"))
        db_doc.invoice_discount_with_vat=parse_decimal_lit(doc_struct.get("invoice_discount_with_vat"))
        db_doc.invoice_discount_wo_vat=parse_decimal_lit(doc_struct.get("invoice_discount_wo_vat"))
        db_doc.vat_amount = parse_decimal_lit(doc_struct.get("vat_amount"))
        db_doc.vat_percent = parse_percent_int(doc_struct.get("vat_percent"))
        db_doc.amount_with_vat = parse_decimal_lit(doc_struct.get("amount_with_vat"))
        db_doc.separate_vat = doc_struct.get("separate_vat")
        db_doc.currency = set_default_currency(doc_struct.get("currency"))
        db_doc.with_receipt = doc_struct.get("with_receipt")
        db_doc.document_type = doc_struct.get("document_type")

        db_doc.similarity_percent = doc_struct.get("similarity_percent")
        db_doc.note = doc_struct.get("note")
        db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
        db_doc.document_type_code = doc_struct.get("document_type_code")
        db_doc.xml_source = doc_struct.get("xml_source")

        # --- Определяем pirkimas/pardavimas ---
        db_doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, user)

        # === Продуктовые поля и детали ===
        if scan_type == "sumiskai":
            if "line_items" in doc_struct and doc_struct["line_items"]:
                first_item = doc_struct["line_items"][0]
            else:
                first_item = doc_struct

            db_doc.prekes_kodas = first_item.get("product_code", "")
            db_doc.prekes_barkodas = first_item.get("prekes_barcode", "")
            db_doc.prekes_pavadinimas = first_item.get("product_name", "")
            db_doc.prekes_tipas = first_item.get("prekes_tipas", "")
            db_doc.preke_paslauga = first_item.get("preke_paslauga")
            db_doc.sandelio_kodas = first_item.get("sandelio_kodas", "")
            db_doc.sandelio_pavadinimas = first_item.get("sandelio_pavadinimas", "")
            db_doc.objekto_kodas = first_item.get("objekto_kodas", "")
            db_doc.objekto_pavadinimas = first_item.get("objekto_pavadinimas", "")
            db_doc.padalinio_kodas = first_item.get("padalinio_kodas", "")
            db_doc.padalinio_pavadinimas = first_item.get("padalinio_pavadinimas", "")
            db_doc.mokescio_kodas = first_item.get("mokescio_kodas", "")
            db_doc.mokescio_pavadinimas = first_item.get("mokescio_pavadinimas", "")
            db_doc.atsakingo_asmens_kodas = first_item.get("atsakingo_asmens_kodas", "")
            db_doc.atsakingo_asmens_pavadinimas = first_item.get("atsakingo_asmens_pavadinimas", "")
            db_doc.operacijos_kodas = first_item.get("operacijos_kodas", "")
            db_doc.operacijos_pavadinimas = first_item.get("operacijos_pavadinimas", "")
            db_doc.islaidu_straipsnio_kodas = first_item.get("islaidu_straipsnio_kodas", "")
            db_doc.islaidu_straipsnio_pavadinimas = first_item.get("islaidu_straipsnio_pavadinimas", "")
            db_doc.pvm_kodas = first_item.get("pvm_kodas", "")
            db_doc.pvm_pavadinimas = first_item.get("pvm_pavadinimas", "")
            db_doc.tipo_kodas = first_item.get("tipo_kodas", "")
            db_doc.tipo_pavadinimas = first_item.get("tipo_pavadinimas", "")
            db_doc.zurnalo_kodas = first_item.get("zurnalo_kodas", "")
            db_doc.zurnalo_pavadinimas = first_item.get("zurnalo_pavadinimas", "")
            db_doc.projekto_kodas = first_item.get("projekto_kodas", "")
            db_doc.projekto_pavadinimas = first_item.get("projekto_pavadinimas", "")
            db_doc.projekto_vadovo_kodas = first_item.get("projekto_vadovo_kodas", "")
            db_doc.projekto_vadovo_pavadinimas = first_item.get("projekto_vadovo_pavadinimas", "")
            db_doc.skyrio_kodas = first_item.get("skyrio_kodas", "")
            db_doc.skyrio_pavadinimas = first_item.get("skyrio_pavadinimas", "")
            db_doc.partijos_nr_kodas = first_item.get("partijos_nr_kodas", "")
            db_doc.partijos_nr_pavadinimas = first_item.get("partijos_nr_pavadinimas", "")
            db_doc.korespondencijos_kodas = first_item.get("korespondencijos_kodas", "")
            db_doc.korespondencijos_pavadinimas = first_item.get("korespondencijos_pavadinimas", "")
            db_doc.serijos_kodas = first_item.get("serijos_kodas", "")
            db_doc.serijos_pavadinimas = first_item.get("serijos_pavadinimas", "")
            db_doc.centro_kodas = first_item.get("centro_kodas", "")
            db_doc.centro_pavadinimas = first_item.get("centro_pavadinimas", "")
        else:
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

    # === АВТОПОДБОР PVM КОДА для sumiskai ===
    if scan_type == "sumiskai":
        db_doc.pvm_kodas = auto_select_pvm_code(
            scan_type=scan_type,
            vat_percent=db_doc.vat_percent,
            buyer_country_iso=db_doc.buyer_country_iso,
            seller_country_iso=db_doc.seller_country_iso,
            separate_vat=db_doc.separate_vat,
        )

    db_doc.save()

    # --- Обновляем line_items ---
    db_doc.line_items.all().delete()
    if scan_type == "detaliai":
        db_doc.val_ar_sutapo = structured.get("ar_sutapo") if structured is not None else None
        line_items = doc_struct.get("line_items", [])
        pvm_codes = []
        vat_percents = []
        for item in line_items:
            vat_percent = parse_percent_int(item.get("vat_percent"))
            # ВАЖНО: всегда передаём separate_vat=False чтобы не получить "Keli skirtingi PVM" для каждой строки!
            pvm_kodas = auto_select_pvm_code(
                scan_type=scan_type,
                vat_percent=vat_percent,
                buyer_country_iso=db_doc.buyer_country_iso,
                seller_country_iso=db_doc.seller_country_iso,
                separate_vat=False  # <-- ВАЖНО!
            )
            pvm_codes.append(pvm_kodas)
            vat_percents.append(vat_percent)
            LineItem.objects.create(
                document=db_doc,
                line_id=item.get("line_id", ""),
                prekes_kodas=item.get("product_code", ""),
                prekes_barkodas=item.get("product_barcode", ""),
                prekes_pavadinimas=item.get("product_name", ""),
                prekes_tipas=item.get("prekes_tipas", ""),
                preke_paslauga=item.get("preke_paslauga"),
                unit=item.get("unit", ""),
                quantity=parse_decimal_lit(item.get("quantity", "")),
                price=parse_decimal_lit(item.get("price", "")),
                subtotal=parse_decimal_lit(item.get("subtotal", "")),
                vat=parse_decimal_lit(item.get("vat", "")),
                vat_percent=vat_percent,
                total=parse_decimal_lit(item.get("total", "")),
                discount_with_vat=parse_decimal_lit(item.get("discount_with_vat", "")),
                discount_wo_vat=parse_decimal_lit(item.get("discount_wo_vat", "")),
                sandelio_kodas=item.get("sandelio_kodas", ""),
                sandelio_pavadinimas=item.get("sandelio_pavadinimas", ""),
                objekto_kodas=item.get("objekto_kodas", ""),
                objekto_pavadinimas=item.get("objekto_pavadinimas", ""),
                padalinio_kodas=item.get("padalinio_kodas", ""),
                padalinio_pavadinimas=item.get("padalinio_pavadinimas", ""),
                mokescio_kodas=item.get("mokescio_kodas", ""),
                mokescio_pavadinimas=item.get("mokescio_pavadinimas", ""),
                atsakingo_asmens_kodas=item.get("atsakingo_asmens_kodas", ""),
                atsakingo_asmens_pavadinimas=item.get("atsakingo_asmens_pavadinimas", ""),
                operacijos_kodas=item.get("operacijos_kodas", ""),
                operacijos_pavadinimas=item.get("operacijos_pavadinimas", ""),
                islaidu_straipsnio_kodas=item.get("islaidu_straipsnio_kodas", ""),
                islaidu_straipsnio_pavadinimas=item.get("islaidu_straipsnio_pavadinimas", ""),
                pvm_kodas=pvm_kodas,
                pvm_pavadinimas=item.get("pvm_pavadinimas", ""),
                tipo_kodas=item.get("tipo_kodas", ""),
                tipo_pavadinimas=item.get("tipo_pavadinimas", ""),
                zurnalo_kodas=item.get("zurnalo_kodas", ""),
                zurnalo_pavadinimas=item.get("zurnalo_pavadinimas", ""),
                projekto_kodas=item.get("projekto_kodas", ""),
                projekto_pavadinimas=item.get("projekto_pavadinimas", ""),
                projekto_vadovo_kodas=item.get("projekto_vadovo_kodas", ""),
                projekto_vadovo_pavadinimas=item.get("projekto_vadovo_pavadinimas", ""),
                skyrio_kodas=item.get("skyrio_kodas", ""),
                skyrio_pavadinimas=item.get("skyrio_pavadinimas", ""),
                partijos_nr_kodas=item.get("partijos_nr_kodas", ""),
                partijos_nr_pavadinimas=item.get("partijos_nr_pavadinimas", ""),
                korespondencijos_kodas=item.get("korespondencijos_kodas", ""),
                korespondencijos_pavadinimas=item.get("korespondencijos_pavadinimas", ""),
                serijos_kodas=item.get("serijos_kodas", ""),
                serijos_pavadinimas=item.get("serijos_pavadinimas", ""),
                centro_kodas=item.get("centro_kodas", ""),
                centro_pavadinimas=item.get("centro_pavadinimas", ""),
            )

        # --- Итоговая метрика ---
        if db_doc.separate_vat is True:
            db_doc.pvm_kodas = "Keli skirtingi PVM"
            db_doc.vat_percent = None
        elif line_items:
            unique_pvm = set(pvm_codes)
            unique_vat = set(vat_percents)
            if len(unique_pvm) == 1 and len(unique_vat) == 1:
                db_doc.pvm_kodas = unique_pvm.pop()
                db_doc.vat_percent = unique_vat.pop()
            else:
                db_doc.pvm_kodas = ""
                db_doc.vat_percent = None
        else:
            db_doc.pvm_kodas = auto_select_pvm_code(
                scan_type=scan_type,
                vat_percent=db_doc.vat_percent,
                buyer_country_iso=db_doc.buyer_country_iso,
                seller_country_iso=db_doc.seller_country_iso,
                separate_vat=db_doc.separate_vat,
            )
        db_doc.save()







# from ..models import LineItem
# from ..utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
# from ..validators.amount_validator import (
#     validate_and_calculate_main_amounts,
#     validate_and_calculate_lineitem_amounts,
#     compare_lineitems_with_main_totals,
# )
# from ..validators.default_currency import set_default_currency

# def update_scanned_document(
#     db_doc, doc_struct, raw_text, preview_url,
#     parse_date_lit, parse_decimal_lit, parse_percent_int, user
# ):
    

#     scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     # === Валидировать и досчитать суммы до сохранения в модель ===
#     if scan_type == "sumiskai":
#         doc_struct = validate_and_calculate_main_amounts(doc_struct)
#     elif scan_type == "detaliai":
#         line_items = doc_struct.get("line_items", [])
#         doc_struct["line_items"] = [
#             validate_and_calculate_lineitem_amounts(item) for item in line_items
#         ]
#         # (optionally) сразу после этого можно сравнить суммы:
#         compare_result = compare_lineitems_with_main_totals(doc_struct)
#         # Можно сохранить результат сравнения или залоггировать, если что-то не так:
#         if not (compare_result["subtotal_match"] and compare_result["vat_match"] and compare_result["total_match"]):
#             # logger.warning(f"Line items sums do not match main totals: {compare_result}")
#             pass


#     db_doc.raw_text = raw_text
#     db_doc.structured_json = doc_struct
#     db_doc.status = 'completed'
#     db_doc.preview_url = preview_url

#     # scan_type = getattr(db_doc, "scan_type", "sumiskai")

#     if isinstance(doc_struct, dict):
#         # --- Основные поля ---
#         db_doc.seller_id = doc_struct.get("seller_id")
#         db_doc.seller_name = doc_struct.get("seller_name")
#         db_doc.seller_vat_code = doc_struct.get("seller_vat_code")
#         db_doc.seller_address = doc_struct.get("seller_address")
#         db_doc.seller_country = doc_struct.get("seller_country")
#         db_doc.seller_country_iso = doc_struct.get("seller_country_iso")
#         db_doc.seller_iban = doc_struct.get("seller_iban")
#         db_doc.seller_is_person = doc_struct.get("seller_is_person")
#         db_doc.buyer_id = doc_struct.get("buyer_id")
#         db_doc.buyer_name = doc_struct.get("buyer_name")
#         db_doc.buyer_vat_code = doc_struct.get("buyer_vat_code")
#         db_doc.buyer_address = doc_struct.get("buyer_address")
#         db_doc.buyer_country = doc_struct.get("buyer_country")
#         db_doc.buyer_country_iso = doc_struct.get("buyer_country_iso")
#         db_doc.buyer_iban = doc_struct.get("buyer_iban")
#         db_doc.buyer_is_person = doc_struct.get("buyer_is_person")

#         db_doc.invoice_date = parse_date_lit(doc_struct.get("invoice_date"))
#         db_doc.due_date = parse_date_lit(doc_struct.get("due_date"))
#         db_doc.operation_date = parse_date_lit(doc_struct.get("operation_date"))
#         db_doc.document_series = doc_struct.get("document_series")
#         db_doc.document_number = doc_struct.get("document_number")
#         db_doc.order_number = doc_struct.get("order_number")
#         db_doc.amount_wo_vat = parse_decimal_lit(doc_struct.get("amount_wo_vat"))
#         db_doc.vat_amount = parse_decimal_lit(doc_struct.get("vat_amount"))
#         db_doc.vat_percent = parse_percent_int(doc_struct.get("vat_percent"))
#         db_doc.amount_with_vat = parse_decimal_lit(doc_struct.get("amount_with_vat"))
#         db_doc.separate_vat = doc_struct.get("separate_vat")
#         db_doc.currency = set_default_currency(doc_struct.get("currency"))
#         db_doc.with_receipt = doc_struct.get("with_receipt")
#         db_doc.document_type = doc_struct.get("document_type")

#         db_doc.similarity_percent = doc_struct.get("similarity_percent")
#         db_doc.note = doc_struct.get("note")
#         db_doc.report_to_isaf = doc_struct.get("report_to_isaf")
#         db_doc.document_type_code = doc_struct.get("document_type_code")
#         db_doc.xml_source = doc_struct.get("xml_source")

#         # --- Определяем pirkimas/pardavimas ---
#         db_doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, user)

#         # === Продуктовые поля и детали ===
#         if scan_type == "sumiskai":
#             # Берём продуктовые поля из doc_struct (или первого line_item, если список)
#             # Обычно для sumiskai line_items не нужны, но если вдруг line_items есть — возьми только первый
#             if "line_items" in doc_struct and doc_struct["line_items"]:
#                 first_item = doc_struct["line_items"][0]
#             else:
#                 first_item = doc_struct

#             db_doc.prekes_kodas = first_item.get("product_code", "")
#             db_doc.prekes_barkodas = first_item.get("prekes_barcode", "")
#             db_doc.prekes_pavadinimas = first_item.get("product_name", "")
#             db_doc.prekes_tipas = first_item.get("prekes_tipas", "")
#             db_doc.sandelio_kodas = first_item.get("sandelio_kodas", "")
#             db_doc.sandelio_pavadinimas = first_item.get("sandelio_pavadinimas", "")
#             db_doc.objekto_kodas = first_item.get("objekto_kodas", "")
#             db_doc.objekto_pavadinimas = first_item.get("objekto_pavadinimas", "")
#             db_doc.padalinio_kodas = first_item.get("padalinio_kodas", "")
#             db_doc.padalinio_pavadinimas = first_item.get("padalinio_pavadinimas", "")
#             db_doc.mokescio_kodas = first_item.get("mokescio_kodas", "")
#             db_doc.mokescio_pavadinimas = first_item.get("mokescio_pavadinimas", "")
#             db_doc.atsakingo_asmens_kodas = first_item.get("atsakingo_asmens_kodas", "")
#             db_doc.atsakingo_asmens_pavadinimas = first_item.get("atsakingo_asmens_pavadinimas", "")
#             db_doc.operacijos_kodas = first_item.get("operacijos_kodas", "")
#             db_doc.operacijos_pavadinimas = first_item.get("operacijos_pavadinimas", "")
#             db_doc.islaidu_straipsnio_kodas = first_item.get("islaidu_straipsnio_kodas", "")
#             db_doc.islaidu_straipsnio_pavadinimas = first_item.get("islaidu_straipsnio_pavadinimas", "")
#             db_doc.pvm_kodas = first_item.get("pvm_kodas", "")
#             db_doc.pvm_pavadinimas = first_item.get("pvm_pavadinimas", "")
#             db_doc.tipo_kodas = first_item.get("tipo_kodas", "")
#             db_doc.tipo_pavadinimas = first_item.get("tipo_pavadinimas", "")
#             db_doc.zurnalo_kodas = first_item.get("zurnalo_kodas", "")
#             db_doc.zurnalo_pavadinimas = first_item.get("zurnalo_pavadinimas", "")
#             db_doc.projekto_kodas = first_item.get("projekto_kodas", "")
#             db_doc.projekto_pavadinimas = first_item.get("projekto_pavadinimas", "")
#             db_doc.projekto_vadovo_kodas = first_item.get("projekto_vadovo_kodas", "")
#             db_doc.projekto_vadovo_pavadinimas = first_item.get("projekto_vadovo_pavadinimas", "")
#             db_doc.skyrio_kodas = first_item.get("skyrio_kodas", "")
#             db_doc.skyrio_pavadinimas = first_item.get("skyrio_pavadinimas", "")
#             db_doc.partijos_nr_kodas = first_item.get("partijos_nr_kodas", "")
#             db_doc.partijos_nr_pavadinimas = first_item.get("partijos_nr_pavadinimas", "")
#             db_doc.korespondencijos_kodas = first_item.get("korespondencijos_kodas", "")
#             db_doc.korespondencijos_pavadinimas = first_item.get("korespondencijos_pavadinimas", "")
#             db_doc.serijos_kodas = first_item.get("serijos_kodas", "")
#             db_doc.serijos_pavadinimas = first_item.get("serijos_pavadinimas", "")
#             db_doc.centro_kodas = first_item.get("centro_kodas", "")
#             db_doc.centro_pavadinimas = first_item.get("centro_pavadinimas", "")
#         else:
#             # Очищаем продуктовые поля в ScannedDocument
#             db_doc.prekes_kodas = ""
#             db_doc.prekes_barkodas = ""
#             db_doc.prekes_pavadinimas = ""
#             db_doc.prekes_tipas = ""
#             db_doc.sandelio_kodas = ""
#             db_doc.sandelio_pavadinimas = ""
#             db_doc.objekto_kodas = ""
#             db_doc.objekto_pavadinimas = ""
#             db_doc.padalinio_kodas = ""
#             db_doc.padalinio_pavadinimas = ""
#             db_doc.mokescio_kodas = ""
#             db_doc.mokescio_pavadinimas = ""
#             db_doc.atsakingo_asmens_kodas = ""
#             db_doc.atsakingo_asmens_pavadinimas = ""
#             db_doc.operacijos_kodas = ""
#             db_doc.operacijos_pavadinimas = ""
#             db_doc.islaidu_straipsnio_kodas = ""
#             db_doc.islaidu_straipsnio_pavadinimas = ""
#             db_doc.pvm_kodas = ""
#             db_doc.pvm_pavadinimas = ""
#             db_doc.tipo_kodas = ""
#             db_doc.tipo_pavadinimas = ""
#             db_doc.zurnalo_kodas = ""
#             db_doc.zurnalo_pavadinimas = ""
#             db_doc.projekto_kodas = ""
#             db_doc.projekto_pavadinimas = ""
#             db_doc.projekto_vadovo_kodas = ""
#             db_doc.projekto_vadovo_pavadinimas = ""
#             db_doc.skyrio_kodas = ""
#             db_doc.skyrio_pavadinimas = ""
#             db_doc.partijos_nr_kodas = ""
#             db_doc.partijos_nr_pavadinimas = ""
#             db_doc.korespondencijos_kodas = ""
#             db_doc.korespondencijos_pavadinimas = ""
#             db_doc.serijos_kodas = ""
#             db_doc.serijos_pavadinimas = ""
#             db_doc.centro_kodas = ""
#             db_doc.centro_pavadinimas = ""

#     db_doc.save()

#     # --- Обновляем line_items ---
#     db_doc.line_items.all().delete()
#     if scan_type == "detaliai":
#         line_items = doc_struct.get("line_items", [])
#         for item in line_items:
#             LineItem.objects.create(
#                 document=db_doc,
#                 line_id=item.get("line_id", ""),
#                 prekes_kodas=item.get("product_code", ""),
#                 prekes_barkodas=item.get("product_barcode", ""),
#                 prekes_pavadinimas=item.get("product_name", ""),
#                 prekes_tipas=item.get("prekes_tipas", ""),
#                 unit=item.get("unit", ""),
#                 quantity=parse_decimal_lit(item.get("quantity", "")),
#                 price=parse_decimal_lit(item.get("price", "")),
#                 subtotal=parse_decimal_lit(item.get("subtotal", "")),
#                 vat=parse_decimal_lit(item.get("vat", "")),
#                 vat_percent=parse_decimal_lit(item.get("vat_percent", "")),
#                 total=parse_decimal_lit(item.get("total", "")),
#                 sandelio_kodas=item.get("sandelio_kodas", ""),
#                 sandelio_pavadinimas=item.get("sandelio_pavadinimas", ""),
#                 objekto_kodas=item.get("objekto_kodas", ""),
#                 objekto_pavadinimas=item.get("objekto_pavadinimas", ""),
#                 padalinio_kodas=item.get("padalinio_kodas", ""),
#                 padalinio_pavadinimas=item.get("padalinio_pavadinimas", ""),
#                 mokescio_kodas=item.get("mokescio_kodas", ""),
#                 mokescio_pavadinimas=item.get("mokescio_pavadinimas", ""),
#                 atsakingo_asmens_kodas=item.get("atsakingo_asmens_kodas", ""),
#                 atsakingo_asmens_pavadinimas=item.get("atsakingo_asmens_pavadinimas", ""),
#                 operacijos_kodas=item.get("operacijos_kodas", ""),
#                 operacijos_pavadinimas=item.get("operacijos_pavadinimas", ""),
#                 islaidu_straipsnio_kodas=item.get("islaidu_straipsnio_kodas", ""),
#                 islaidu_straipsnio_pavadinimas=item.get("islaidu_straipsnio_pavadinimas", ""),
#                 pvm_kodas=item.get("pvm_kodas", ""),
#                 pvm_pavadinimas=item.get("pvm_pavadinimas", ""),
#                 tipo_kodas=item.get("tipo_kodas", ""),
#                 tipo_pavadinimas=item.get("tipo_pavadinimas", ""),
#                 zurnalo_kodas=item.get("zurnalo_kodas", ""),
#                 zurnalo_pavadinimas=item.get("zurnalo_pavadinimas", ""),
#                 projekto_kodas=item.get("projekto_kodas", ""),
#                 projekto_pavadinimas=item.get("projekto_pavadinimas", ""),
#                 projekto_vadovo_kodas=item.get("projekto_vadovo_kodas", ""),
#                 projekto_vadovo_pavadinimas=item.get("projekto_vadovo_pavadinimas", ""),
#                 skyrio_kodas=item.get("skyrio_kodas", ""),
#                 skyrio_pavadinimas=item.get("skyrio_pavadinimas", ""),
#                 partijos_nr_kodas=item.get("partijos_nr_kodas", ""),
#                 partijos_nr_pavadinimas=item.get("partijos_nr_pavadinimas", ""),
#                 korespondencijos_kodas=item.get("korespondencijos_kodas", ""),
#                 korespondencijos_pavadinimas=item.get("korespondencijos_pavadinimas", ""),
#                 serijos_kodas=item.get("serijos_kodas", ""),
#                 serijos_pavadinimas=item.get("serijos_pavadinimas", ""),
#                 centro_kodas=item.get("centro_kodas", ""),
#                 centro_pavadinimas=item.get("centro_pavadinimas", ""),
#             )
#     # Если sumiskai — не создаём line_items
