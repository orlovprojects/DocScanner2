from django.db import transaction
from ..models import ProductAutocomplete, ClientAutocomplete
from openpyxl import load_workbook
import io


def _get_xlsx_rows(file, required_fields):
    """
    Читает строки из XLSX и возвращает list[dict] с НОРМАЛИЗОВАННЫМИ ключами заголовков.
    Нормализация: trim, lower, удаление конечной '*' (pvz. 'imones_kodas*' -> 'imones_kodas').
    """
    file.seek(0)
    file_bytes = file.read()
    wb = load_workbook(filename=io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    # 1) заголовки raw
    raw_header_cells = next(ws.iter_rows(min_row=1, max_row=1))
    raw_headers = [str(c.value).strip() if c.value else "" for c in raw_header_cells]

    # 2) normalizacija
    def norm(h: str) -> str:
        h = (h or "").strip()
        if h.endswith("*"):
            h = h[:-1]
        return h.strip().lower()

    norm_headers = [norm(h) for h in raw_headers]

    # 3) validate required (jau be žvaigždučių)
    need = {f.strip().lower() for f in required_fields}
    have = set(norm_headers)
    if not need.issubset(have):
        missing = ", ".join(sorted(need - have))
        raise Exception(f"Nerasta {missing} stulpelio")

    # 4) rows -> dict su normalizuotais raktai
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        d = {}
        for i, val in enumerate(row[:len(norm_headers)]):
            key = norm_headers[i]
            d[key] = (str(val).strip() if val is not None else "")
        rows.append(d)

    return rows


def _norm_preke_paslauga(value) -> str:
    """
    Normalizuoja 'preke_paslauga_kodas' į '1' | '2' | '3' arba ''.
    Priima 1/2/3 (su tarpais, kableliais), bei žodinius sinonimus.
    """
    if value is None:
        return ""
    s = str(value).strip().lower()
    if not s:
        return ""

    # skaičiai (leidžiam '1', '1.0', ' 2 ', '3,0')
    s_num = s.replace(",", ".")
    try:
        n = int(float(s_num))
        if n in (1, 2, 3):
            return str(n)
    except ValueError:
        pass

    # žodiniai variantai
    preke_syn = {"preke", "prekė", "prekes", "prekės"}
    paslauga_syn = {"paslauga", "paslaugos"}
    kodas_syn = {"kodas", "kodai"}

    if s in preke_syn:
        return "1"
    if s in paslauga_syn:
        return "2"
    if s in kodas_syn:
        return "3"

    return ""  # neatspažinta — paliekam tuščią


def import_products_from_xlsx(user, file):
    """
    Importuoja prekes iš XLSX.
    Palaikomas naujas stulpelis 'preke_paslauga_kodas' (nebūtinas).
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

            prekes_kodas = (data.get('prekes_kodas') or '').strip()
            # dublikatai pagal prekes_kodas
            if prekes_kodas and ProductAutocomplete.objects.filter(user=user, prekes_kodas=prekes_kodas).exists():
                continue

            preke_paslauga = _norm_preke_paslauga(data.get('preke_paslauga_kodas'))

            ProductAutocomplete.objects.create(
                user=user,
                prekes_kodas=prekes_kodas,
                prekes_barkodas=(data.get('prekes_barkodas') or '').strip(),
                prekes_pavadinimas=(data.get('prekes_pavadinimas') or '').strip(),
                preke_paslauga=preke_paslauga,

                prekes_tipas=(data.get('prekes_tipas') or '').strip(),
                sandelio_kodas=(data.get('sandelio_kodas') or '').strip(),
                sandelio_pavadinimas=(data.get('sandelio_pavadinimas') or '').strip(),
                objekto_kodas=(data.get('objekto_kodas') or '').strip(),
                objekto_pavadinimas=(data.get('objekto_pavadinimas') or '').strip(),
                padalinio_kodas=(data.get('padalinio_kodas') or '').strip(),
                padalinio_pavadinimas=(data.get('padalinio_pavadinimas') or '').strip(),
                mokescio_kodas=(data.get('mokescio_kodas') or '').strip(),
                mokescio_pavadinimas=(data.get('mokescio_pavadinimas') or '').strip(),
                atsakingo_asmens_kodas=(data.get('atsakingo_asmens_kodas') or '').strip(),
                atsakingo_asmens_pavadinimas=(data.get('atsakingo_asmens_pavadinimas') or '').strip(),
                operacijos_kodas=(data.get('operacijos_kodas') or '').strip(),
                operacijos_pavadinimas=(data.get('operacijos_pavadinimas') or '').strip(),
                islaidu_straipsnio_kodas=(data.get('islaidu_straipsnio_kodas') or '').strip(),
                islaidu_straipsnio_pavadinimas=(data.get('islaidu_straipsnio_pavadinimas') or '').strip(),
                pvm_kodas=(data.get('pvm_kodas') or '').strip(),
                pvm_pavadinimas=(data.get('pvm_pavadinimas') or '').strip(),
                tipo_kodas=(data.get('tipo_kodas') or '').strip(),
                tipo_pavadinimas=(data.get('tipo_pavadinimas') or '').strip(),
                zurnalo_kodas=(data.get('zurnalo_kodas') or '').strip(),
                zurnalo_pavadinimas=(data.get('zurnalo_pavadinimas') or '').strip(),
                projekto_kodas=(data.get('projekto_kodas') or '').strip(),
                projekto_pavadinimas=(data.get('projekto_pavadinimas') or '').strip(),
                projekto_vadovo_kodas=(data.get('projekto_vadovo_kodas') or '').strip(),
                projekto_vadovo_pavadinimas=(data.get('projekto_vadovo_pavadinimas') or '').strip(),
                skyrio_kodas=(data.get('skyrio_kodas') or '').strip(),
                skyrio_pavadinimas=(data.get('skyrio_pavadinimas') or '').strip(),
                partijos_nr_kodas=(data.get('partijos_nr_kodas') or '').strip(),
                partijos_nr_pavadinimas=(data.get('partijos_nr_pavadinimas') or '').strip(),
                korespondencijos_kodas=(data.get('korespondencijos_kodas') or '').strip(),
                korespondencijos_pavadinimas=(data.get('korespondencijos_pavadinimas') or '').strip(),
                serijos_kodas=(data.get('serijos_kodas') or '').strip(),
                serijos_pavadinimas=(data.get('serijos_pavadinimas') or '').strip(),
                centro_kodas=(data.get('centro_kodas') or '').strip(),
                centro_pavadinimas=(data.get('centro_pavadinimas') or '').strip(),
            )
            imported += 1

    return {"imported": imported, "processed": total}


def import_clients_from_xlsx(user, file):
    """
    Importuoja klientus iš XLSX.
    Palaiko antraštes su žvaigždutėmis: 'imones_pavadinimas*' / 'imones_kodas*'
    (per normalizaciją jos tampa 'imones_pavadinimas' / 'imones_kodas').
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
            name = (data.get('imones_pavadinimas') or '').strip()
            code = (data.get('imones_kodas') or '').strip()

            if not (code or name):
                continue

            # dublikatai pagal įmonės kodą (jei yra)
            if code and ClientAutocomplete.objects.filter(user=user, imones_kodas=code).exists():
                continue

            ClientAutocomplete.objects.create(
                user=user,
                kodas_programoje=(data.get('kodas_buh_programoje') or '').strip(),
                imones_kodas=code,
                pavadinimas=name,
                pvm_kodas=(data.get('imones_pvm_kodas') or '').strip(),
                ibans=(data.get('imones_iban') or '').strip(),           # svarbu: 'iban' -> lowercase
                address=(data.get('imones_adresas') or '').strip(),
                country_iso=(data.get('imones_salies_kodas') or '').strip().upper(),
            )
            imported += 1

    return {"imported": imported, "processed": total}

