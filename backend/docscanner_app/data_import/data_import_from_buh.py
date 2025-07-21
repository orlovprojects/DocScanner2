from django.db import transaction
from ..models import ProductAutocomplete, ClientAutocomplete
from openpyxl import load_workbook
import io

def _get_xlsx_rows(file, required_fields):
    """
    Считывает строки из xlsx файла, возвращает list[dict] (ключи — заголовки).
    required_fields — список обязательных заголовков для валидации.
    """
    file.seek(0)
    file_bytes = file.read()  # Прочитай ВСЁ
    wb = load_workbook(filename=io.BytesIO(file_bytes), read_only=True, data_only=True)  # <-- исправление!
    ws = wb.active
    headers = [str(cell.value).strip() if cell.value else "" for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        data = {headers[i]: (str(row[i]).strip() if row[i] is not None else "") for i in range(len(headers))}
        rows.append(data)
    if not any(f in headers for f in required_fields):
        raise Exception(f"Nerasta {' arba '.join(required_fields)} stulpelio")
    return rows

# def _get_xlsx_rows(file, required_fields):
#     """
#     Считывает строки из xlsx файла, возвращает list[dict] (ключи — заголовки).
#     required_fields — список обязательных заголовков для валидации.
#     """
#     file.seek(0)
#     wb = load_workbook(filename=file, read_only=True, data_only=True)
#     ws = wb.active
#     headers = [str(cell.value).strip() if cell.value else "" for cell in next(ws.iter_rows(min_row=1, max_row=1))]
#     rows = []
#     for row in ws.iter_rows(min_row=2, values_only=True):
#         data = {headers[i]: (str(row[i]).strip() if row[i] is not None else "") for i in range(len(headers))}
#         rows.append(data)
#     # Проверка на обязательные поля
#     if not any(f in headers for f in required_fields):
#         raise Exception(f"Nerasta {' arba '.join(required_fields)} stulpelio")
#     return rows

def import_products_from_xlsx(user, file):
    """
    Importuoja prekes iš XLSX.
    """
    imported = 0
    total = 0
    try:
        rows = _get_xlsx_rows(file, required_fields=["prekes_kodas", "prekes_pavadinimas"])
    except Exception as e:
        return {"error": str(e)}

    with transaction.atomic():
        for data in rows:
            total += 1
            if not (data.get('prekes_kodas') or data.get('prekes_pavadinimas')):
                continue
            prekes_kodas = data.get('prekes_kodas', '')
            if prekes_kodas and ProductAutocomplete.objects.filter(user=user, prekes_kodas=prekes_kodas).exists():
                continue
            ProductAutocomplete.objects.create(
                user=user,
                prekes_kodas=prekes_kodas,
                prekes_barkodas=data.get('prekes_barkodas', ''),
                prekes_pavadinimas=data.get('prekes_pavadinimas', ''),
                prekes_tipas=data.get('prekes_tipas', ''),
                sandelio_kodas=data.get('sandelio_kodas', ''),
                sandelio_pavadinimas=data.get('sandelio_pavadinimas', ''),
                objekto_kodas=data.get('objekto_kodas', ''),
                objekto_pavadinimas=data.get('objekto_pavadinimas', ''),
                padalinio_kodas=data.get('padalinio_kodas', ''),
                padalinio_pavadinimas=data.get('padalinio_pavadinimas', ''),
                mokescio_kodas=data.get('mokescio_kodas', ''),
                mokescio_pavadinimas=data.get('mokescio_pavadinimas', ''),
                atsakingo_asmens_kodas=data.get('atsakingo_asmens_kodas', ''),
                atsakingo_asmens_pavadinimas=data.get('atsakingo_asmens_pavadinimas', ''),
                operacijos_kodas=data.get('operacijos_kodas', ''),
                operacijos_pavadinimas=data.get('operacijos_pavadinimas', ''),
                islaidu_straipsnio_kodas=data.get('islaidu_straipsnio_kodas', ''),
                islaidu_straipsnio_pavadinimas=data.get('islaidu_straipsnio_pavadinimas', ''),
                pvm_kodas=data.get('pvm_kodas', ''),
                pvm_pavadinimas=data.get('pvm_pavadinimas', ''),
                tipo_kodas=data.get('tipo_kodas', ''),
                tipo_pavadinimas=data.get('tipo_pavadinimas', ''),
                zurnalo_kodas=data.get('zurnalo_kodas', ''),
                zurnalo_pavadinimas=data.get('zurnalo_pavadinimas', ''),
                projekto_kodas=data.get('projekto_kodas', ''),
                projekto_pavadinimas=data.get('projekto_pavadinimas', ''),
                projekto_vadovo_kodas=data.get('projekto_vadovo_kodas', ''),
                projekto_vadovo_pavadinimas=data.get('projekto_vadovo_pavadinimas', ''),
                skyrio_kodas=data.get('skyrio_kodas', ''),
                skyrio_pavadinimas=data.get('skyrio_pavadinimas', ''),
                partijos_nr_kodas=data.get('partijos_nr_kodas', ''),
                partijos_nr_pavadinimas=data.get('partijos_nr_pavadinimas', ''),
                korespondencijos_kodas=data.get('korespondencijos_kodas', ''),
                korespondencijos_pavadinimas=data.get('korespondencijos_pavadinimas', ''),
                serijos_kodas=data.get('serijos_kodas', ''),
                serijos_pavadinimas=data.get('serijos_pavadinimas', ''),
                centro_kodas=data.get('centro_kodas', ''),
                centro_pavadinimas=data.get('centro_pavadinimas', ''),
            )
            imported += 1
    return {
        "imported": imported,
        "processed": total
    }

def import_clients_from_xlsx(user, file):
    """
    Importuoja klientus iš XLSX.
    """
    imported = 0
    total = 0
    try:
        rows = _get_xlsx_rows(file, required_fields=["imones_kodas", "imones_pavadinimas"])
    except Exception as e:
        return {"error": str(e)}

    with transaction.atomic():
        for data in rows:
            total += 1
            if not (data.get('imones_kodas') or data.get('imones_pavadinimas')):
                continue
            imones_kodas = data.get('imones_kodas', '')
            if imones_kodas and ClientAutocomplete.objects.filter(user=user, imones_kodas=imones_kodas).exists():
                continue
            ClientAutocomplete.objects.create(
                user=user,
                kodas_programoje=data.get('kodas_buh_programoje', ''),
                imones_kodas=imones_kodas,
                pavadinimas=data.get('imones_pavadinimas', ''),
                pvm_kodas=data.get('imones_pvm_kodas', ''),
                ibans=data.get('imones_IBAN', ''),
                address=data.get('imones_adresas', ''),
                country_iso=data.get('imones_salies_kodas', ''),
            )
            imported += 1
    return {
        "imported": imported,
        "processed": total
    }
