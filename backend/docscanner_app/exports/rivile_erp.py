import os 
from openpyxl import load_workbook

PREKES_TEMPLATE_DIR = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
PREKES_TEMPLATE_FILE = 'Prekės, paslaugos.xlsx'

def export_prekes_and_paslaugos_to_rivile_erp_xlsx(documents, output_path):
    template_path = os.path.join(PREKES_TEMPLATE_DIR, PREKES_TEMPLATE_FILE)
    wb = load_workbook(template_path)
    ws = wb.active

    prekes_rows = []
    seen = set()

    # Собираем товары и услуги в один список (каждая строка = dict)
    for doc in documents:
        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            for item in line_items.all():
                kodas = getattr(item, "prekes_kodas", None) or getattr(item, "prekes_barkodas", None)
                tipas_val = getattr(item, "preke_paslauga", "preke")
                tipas = "1" if tipas_val == "preke" else "2"
                unit = getattr(item, "unit", None) or "VNT"
                pavadinimas = getattr(item, "prekes_pavadinimas", None) or "Prekė"

                if kodas and kodas not in seen:
                    row = [
                        kodas,         # A: ##refId##
                        tipas,         # B: Type
                        kodas,         # C: Code
                        pavadinimas,   # D: Name
                        unit           # E: BaseUomCode
                    ]
                    prekes_rows.append(row)
                    seen.add(kodas)
        else:
            kodas = getattr(doc, "prekes_kodas", None) or getattr(doc, "prekes_barkodas", None)
            tipas_val = getattr(doc, "preke_paslauga", "preke")
            tipas = "1" if tipas_val == "preke" else "2"
            unit = "VNT"
            pavadinimas = getattr(doc, "prekes_pavadinimas", None) or "Prekė"

            if kodas and kodas not in seen:
                row = [
                    kodas,         # A: ##refId##
                    tipas,         # B: Type
                    kodas,         # C: Code
                    pavadinimas,   # D: Name
                    unit           # E: BaseUomCode
                ]
                prekes_rows.append(row)
                seen.add(kodas)

    # Записываем данные с 6-й строки (row=6)
    start_row = 6
    for i, row_data in enumerate(prekes_rows):
        for col_idx, value in enumerate(row_data, start=1):
            ws.cell(row=start_row + i, column=col_idx, value=value)

    wb.save(output_path)
    return output_path





CLIENTS_TEMPLATE_DIR = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
CLIENTS_TEMPLATE_FILE = 'Klientai.xlsx'

def export_clients_to_rivile_erp_xlsx(clients, output_path):
    template_path = os.path.join(CLIENTS_TEMPLATE_DIR, CLIENTS_TEMPLATE_FILE)
    wb = load_workbook(template_path)
    ws = wb.active

    # Заполняем с 6-й строки!
    start_row = 6

    for i, client in enumerate(clients):
        row = start_row + i

        doc_type = client.get('type', 'pirkimas')
        is_person = client.get('is_person', False)

        # В колонках, которые не используются, оставляем пусто
        ws.cell(row=row, column=1, value=client.get('id', ''))            # A: ##refId##
        ws.cell(row=row, column=2, value=client.get('name', ''))          # B: Name
        ws.cell(row=row, column=3, value=client.get('id', ''))            # C: Code
        ws.cell(row=row, column=4, value=1 if is_person else 0)           # D: TypeID (1 - физ лицо, 0 - юр лицо)
        ws.cell(row=row, column=7, value=client.get('id', ''))            # G: RegCode
        ws.cell(row=row, column=8, value=client.get('vat', ''))           # H: VatNumber
        ws.cell(row=row, column=9, value=client.get('address', ''))       # I: Address

        # U: IsCustomer (21)
        is_customer = 1 if doc_type == 'pardavimas' else ""
        ws.cell(row=row, column=21, value=is_customer)

        # AA: IsSupplier (27)
        is_supplier = 1 if doc_type == 'pirkimas' else ""
        ws.cell(row=row, column=27, value=is_supplier)

    wb.save(output_path)
    return output_path




PIRK_TEMPLATE_DIR  = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
PIRK_TEMPLATE_FILE = 'Pirkimai.xlsx'
PARD_TEMPLATE_DIR  = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
PARD_TEMPLATE_FILE = 'Pardavimai.xlsx'


def export_documents_to_rivile_erp_xlsx(documents, output_path, doc_type="pirkimai"):
    """
    Экспортирует документы в xlsx-шаблон Rivile ERP (pirkimai/pardavimai).
    doc_type: 'pirkimai' или 'pardavimai'
    """
    if doc_type == "pirkimai":
        template_path = os.path.join(PIRK_TEMPLATE_DIR, PIRK_TEMPLATE_FILE)
        client_id_field = "seller_id"
        client_vat_field = "seller_vat_code"
    elif doc_type == "pardavimai":
        template_path = os.path.join(PARD_TEMPLATE_DIR, PARD_TEMPLATE_FILE)
        client_id_field = "buyer_id"
        client_vat_field = "buyer_vat_code"
    else:
        raise ValueError("doc_type должен быть 'pirkimai' или 'pardavimai'")

    wb = load_workbook(template_path)
    ws_headers = wb["Headers"]
    ws_lines = wb["Lines"]

    header_row = 6
    line_row = 3

    header_idx = header_row
    line_idx = line_row

    for doc in documents:
        dok_nr = getattr(doc, "document_number", "") or ""
        series = getattr(doc, "document_series", "") or ""
        if series and not dok_nr.startswith(series):
            ref_id = f"{series}{dok_nr}"
        else:
            ref_id = dok_nr

        # client_code: id -> vat -> "111111111"
        client_code = getattr(doc, client_id_field, "") or ""
        if not client_code:
            client_code = getattr(doc, client_vat_field, "") or ""
        if not client_code:
            client_code = "111111111"

        ws_headers.cell(row=header_idx, column=1, value=ref_id)
        ws_headers.cell(row=header_idx, column=2, value=client_code)
        ws_headers.cell(row=header_idx, column=3, value=str(getattr(doc, "operation_date", "") or getattr(doc, "invoice_date", "")))
        ws_headers.cell(row=header_idx, column=4, value=str(getattr(doc, "invoice_date", "")))
        ws_headers.cell(row=header_idx, column=5, value=dok_nr)
        ws_headers.cell(row=header_idx, column=6, value=0)
        zurnalo_kodas = getattr(doc, "zurnalo_kodas", "")
        if not zurnalo_kodas:
            if doc_type == "pirkimai":
                zurnalo_kodas = "0201"
            elif doc_type == "pardavimai":
                zurnalo_kodas = "0101"
        ws_headers.cell(row=header_idx, column=7, value=zurnalo_kodas)
        ws_headers.cell(row=header_idx, column=9, value=getattr(doc, "currency", "") or "EUR")

        header_idx += 1

        # источник PVM кода для строк: multi (map) / single (item.pvm_kodas)
        line_map = getattr(doc, "_pvm_line_map", None)

        line_items = getattr(doc, "line_items", None)
        if line_items and hasattr(line_items, 'all') and line_items.exists():
            for item in line_items.all():
                ws_lines.cell(row=line_idx, column=1, value=ref_id)
                ws_lines.cell(row=line_idx, column=2, value=getattr(item, "prekes_kodas", "") or "")
                ws_lines.cell(row=line_idx, column=3, value=getattr(item, "unit", "") or "VNT")
                ws_lines.cell(row=line_idx, column=4, value=getattr(item, "prekes_barkodas", "") or "")
                ws_lines.cell(row=line_idx, column=5, value=getattr(item, "padalinio_kodas", "") or "01")
                ws_lines.cell(row=line_idx, column=6, value=getattr(item, "quantity", 1) or 1)
                price = getattr(item, "price", None)
                ws_lines.cell(row=line_idx, column=7, value=price if price is not None else 0)

                # PVM код: multi -> из map по id; single -> из item.pvm_kodas
                if line_map is not None:
                    pvm_code = (line_map or {}).get(getattr(item, "id", None))
                else:
                    pvm_code = getattr(item, "pvm_kodas", None)
                ws_lines.cell(row=line_idx, column=9, value=pvm_code or "")

                vat_amount = getattr(item, "vat", None)
                ws_lines.cell(row=line_idx, column=10, value=vat_amount if vat_amount is not None else 0)
                ws_lines.cell(row=line_idx, column=11, value=getattr(item, "prekes_pavadinimas", "") or "")
                line_idx += 1
        else:
            ws_lines.cell(row=line_idx, column=1, value=ref_id)
            ws_lines.cell(row=line_idx, column=2, value=getattr(doc, "prekes_kodas", "") or "")
            ws_lines.cell(row=line_idx, column=3, value="VNT")
            ws_lines.cell(row=line_idx, column=4, value=getattr(doc, "prekes_barkodas", "") or "")
            ws_lines.cell(row=line_idx, column=5, value="")
            ws_lines.cell(row=line_idx, column=6, value=1)
            price = getattr(doc, "amount_wo_vat", None)
            ws_lines.cell(row=line_idx, column=7, value=price if price is not None else 0)
            # без строк — берём PVM код с уровня документа
            ws_lines.cell(row=line_idx, column=9, value=getattr(doc, "pvm_kodas", "") or "")
            vat_amount = getattr(doc, "vat_amount", None)
            ws_lines.cell(row=line_idx, column=10, value=vat_amount if vat_amount is not None else 0)
            ws_lines.cell(row=line_idx, column=11, value=getattr(doc, "prekes_pavadinimas", "") or "")
            line_idx += 1

    wb.save(output_path)
    return output_path



# import os
# from openpyxl import load_workbook

# PREKES_TEMPLATE_DIR = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
# PREKES_TEMPLATE_FILE = 'Prekės, paslaugos.xlsx'

# def export_prekes_and_paslaugos_to_rivile_erp_xlsx(documents, output_path):
#     template_path = os.path.join(PREKES_TEMPLATE_DIR, PREKES_TEMPLATE_FILE)
#     wb = load_workbook(template_path)
#     ws = wb.active

#     prekes_rows = []
#     seen = set()

#     # Собираем товары и услуги в один список (каждая строка = dict)
#     for doc in documents:
#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, 'all') and line_items.exists():
#             for item in line_items.all():
#                 kodas = getattr(item, "prekes_kodas", None) or getattr(item, "prekes_barkodas", None)
#                 tipas_val = getattr(item, "preke_paslauga", "preke")
#                 tipas = "1" if tipas_val == "preke" else "2"
#                 unit = getattr(item, "unit", None) or "VNT"
#                 pavadinimas = getattr(item, "prekes_pavadinimas", None) or "Prekė"

#                 if kodas and kodas not in seen:
#                     row = [
#                         kodas,         # A: ##refId##
#                         tipas,         # B: Type
#                         kodas,         # C: Code
#                         pavadinimas,   # D: Name
#                         unit           # E: BaseUomCode
#                     ]
#                     prekes_rows.append(row)
#                     seen.add(kodas)
#         else:
#             kodas = getattr(doc, "prekes_kodas", None) or getattr(doc, "prekes_barkodas", None)
#             tipas_val = getattr(doc, "preke_paslauga", "preke")
#             tipas = "1" if tipas_val == "preke" else "2"
#             unit = "VNT"
#             pavadinimas = getattr(doc, "prekes_pavadinimas", None) or "Prekė"

#             if kodas and kodas not in seen:
#                 row = [
#                     kodas,         # A: ##refId##
#                     tipas,         # B: Type
#                     kodas,         # C: Code
#                     pavadinimas,   # D: Name
#                     unit           # E: BaseUomCode
#                 ]
#                 prekes_rows.append(row)
#                 seen.add(kodas)

#     # Записываем данные с 6-й строки (row=6)
#     start_row = 6
#     for i, row_data in enumerate(prekes_rows):
#         for col_idx, value in enumerate(row_data, start=1):
#             ws.cell(row=start_row + i, column=col_idx, value=value)

#     wb.save(output_path)
#     return output_path





# CLIENTS_TEMPLATE_DIR = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
# CLIENTS_TEMPLATE_FILE = 'Klientai.xlsx'

# def export_clients_to_rivile_erp_xlsx(clients, output_path):
#     template_path = os.path.join(CLIENTS_TEMPLATE_DIR, CLIENTS_TEMPLATE_FILE)
#     wb = load_workbook(template_path)
#     ws = wb.active

#     # Заполняем с 6-й строки!
#     start_row = 6

#     for i, client in enumerate(clients):
#         row = start_row + i

#         doc_type = client.get('type', 'pirkimas')
#         is_person = client.get('is_person', False)

#         # В колонках, которые не используются, оставляем пусто
#         ws.cell(row=row, column=1, value=client.get('id', ''))            # A: ##refId##
#         ws.cell(row=row, column=2, value=client.get('name', ''))          # B: Name
#         ws.cell(row=row, column=3, value=client.get('id', ''))            # C: Code
#         ws.cell(row=row, column=4, value=1 if is_person else 0)           # D: TypeID (1 - физ лицо, 0 - юр лицо)
#         ws.cell(row=row, column=7, value=client.get('id', ''))            # G: RegCode
#         ws.cell(row=row, column=8, value=client.get('vat', ''))           # H: VatNumber
#         ws.cell(row=row, column=9, value=client.get('address', ''))       # I: Address

#         # U: IsCustomer (21)
#         is_customer = 1 if doc_type == 'pardavimas' else ""
#         ws.cell(row=row, column=21, value=is_customer)

#         # AA: IsSupplier (27)
#         is_supplier = 1 if doc_type == 'pirkimas' else ""
#         ws.cell(row=row, column=27, value=is_supplier)

#     wb.save(output_path)
#     return output_path




# PIRK_TEMPLATE_DIR  = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
# PIRK_TEMPLATE_FILE = 'Pirkimai.xlsx'
# PARD_TEMPLATE_DIR  = r'C:\JavaScript\DocScanner\backend\media\export_templates\riviler_erp'
# PARD_TEMPLATE_FILE = 'Pardavimai.xlsx'


# def export_documents_to_rivile_erp_xlsx(documents, output_path, doc_type="pirkimai"):
#     """
#     Экспортирует документы в xlsx-шаблон Rivile ERP (pirkimai/pardavimai).
#     doc_type: 'pirkimai' или 'pardavimai'
#     """
#     if doc_type == "pirkimai":
#         template_path = os.path.join(PIRK_TEMPLATE_DIR, PIRK_TEMPLATE_FILE)
#         client_id_field = "seller_id"
#         client_vat_field = "seller_vat_code"
#     elif doc_type == "pardavimai":
#         template_path = os.path.join(PARD_TEMPLATE_DIR, PARD_TEMPLATE_FILE)
#         client_id_field = "buyer_id"
#         client_vat_field = "buyer_vat_code"
#     else:
#         raise ValueError("doc_type должен быть 'pirkimai' или 'pardavimai'")

#     wb = load_workbook(template_path)
#     ws_headers = wb["Headers"]
#     ws_lines = wb["Lines"]

#     header_row = 6
#     line_row = 3

#     header_idx = header_row
#     line_idx = line_row

#     for doc in documents:
#         dok_nr = getattr(doc, "document_number", "") or ""
#         series = getattr(doc, "document_series", "") or ""
#         if series and not dok_nr.startswith(series):
#             ref_id = f"{series}{dok_nr}"
#         else:
#             ref_id = dok_nr

#         # --- Новый блок логики для client_code ---
#         client_code = getattr(doc, client_id_field, "") or ""
#         if not client_code:
#             client_code = getattr(doc, client_vat_field, "") or ""
#         if not client_code:
#             client_code = "111111111"

#         ws_headers.cell(row=header_idx, column=1, value=ref_id)
#         ws_headers.cell(row=header_idx, column=2, value=client_code)
#         ws_headers.cell(row=header_idx, column=3, value=str(getattr(doc, "operation_date", "") or getattr(doc, "invoice_date", "")))
#         ws_headers.cell(row=header_idx, column=4, value=str(getattr(doc, "invoice_date", "")))
#         ws_headers.cell(row=header_idx, column=5, value=dok_nr)
#         ws_headers.cell(row=header_idx, column=6, value=0)
#         zurnalo_kodas = getattr(doc, "zurnalo_kodas", "")
#         if not zurnalo_kodas:
#             if doc_type == "pirkimai":
#                 zurnalo_kodas = "0201"
#             elif doc_type == "pardavimai":
#                 zurnalo_kodas = "0101"
#         ws_headers.cell(row=header_idx, column=7, value=zurnalo_kodas)
#         ws_headers.cell(row=header_idx, column=9, value=getattr(doc, "currency", "") or "EUR")

#         header_idx += 1

#         line_items = getattr(doc, "line_items", None)
#         if line_items and hasattr(line_items, 'all') and line_items.exists():
#             for item in line_items.all():
#                 ws_lines.cell(row=line_idx, column=1, value=ref_id)
#                 ws_lines.cell(row=line_idx, column=2, value=getattr(item, "prekes_kodas", "") or "")
#                 ws_lines.cell(row=line_idx, column=3, value=getattr(item, "unit", "") or "VNT")
#                 ws_lines.cell(row=line_idx, column=4, value=getattr(item, "prekes_barkodas", "") or "")
#                 ws_lines.cell(row=line_idx, column=5, value=getattr(item, "padalinio_kodas", "") or "01")
#                 ws_lines.cell(row=line_idx, column=6, value=getattr(item, "quantity", 1) or 1)
#                 price = getattr(item, "price", None)
#                 ws_lines.cell(row=line_idx, column=7, value=price if price is not None else 0)
#                 ws_lines.cell(row=line_idx, column=9, value=getattr(item, "pvm_kodas", "") or "")
#                 vat_amount = getattr(item, "vat", None)
#                 ws_lines.cell(row=line_idx, column=10, value=vat_amount if vat_amount is not None else 0)
#                 ws_lines.cell(row=line_idx, column=11, value=getattr(item, "prekes_pavadinimas", "") or "")
#                 line_idx += 1
#         else:
#             ws_lines.cell(row=line_idx, column=1, value=ref_id)
#             ws_lines.cell(row=line_idx, column=2, value=getattr(doc, "prekes_kodas", "") or "")
#             ws_lines.cell(row=line_idx, column=3, value="VNT")
#             ws_lines.cell(row=line_idx, column=4, value=getattr(doc, "prekes_barkodas", "") or "")
#             ws_lines.cell(row=line_idx, column=5, value="")
#             ws_lines.cell(row=line_idx, column=6, value=1)
#             price = getattr(doc, "amount_wo_vat", None)
#             ws_lines.cell(row=line_idx, column=7, value=price if price is not None else 0)
#             ws_lines.cell(row=line_idx, column=9, value=getattr(doc, "pvm_kodas", "") or "")
#             vat_amount = getattr(doc, "vat_amount", None)
#             ws_lines.cell(row=line_idx, column=10, value=vat_amount if vat_amount is not None else 0)
#             ws_lines.cell(row=line_idx, column=11, value=getattr(doc, "prekes_pavadinimas", "") or "")
#             line_idx += 1

#     wb.save(output_path)
#     return output_path

