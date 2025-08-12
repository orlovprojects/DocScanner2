from docscanner_app.models import Company
from .company_name_normalizer import normalize_company_name
import re


def ensure_lt_prefix(vat_code):
    vat_code = (vat_code or "").strip()
    if vat_code and not vat_code.upper().startswith("LT"):
        return f"LT{vat_code}"
    return vat_code


def shorten_legal_form(name):
    # Уменьшаем юридическую форму в начале или в конце строки
    substitutions = [
        ("Uždaroji akcinė bendrovė", "UAB"),
        ("Akcinė bendrovė", "AB"),
        ("Mažoji bendrija", "MB"),
        ("Viešoji įstaiga", "VšĮ"),
        ("Individuali įmonė", "IĮ"),
        ("Tikroji ūkinė bendrija", "TŪB"),
        ("Kooperatinė bendrovė", "KB"),
        ("Žemės ūkio bendrovė", "ŽŪB"),
    ]
    s = name
    for long, short in substitutions:
        # В начале строки
        s = re.sub(rf"^{long}\s+", f"{short} ", s, flags=re.IGNORECASE)
        # В конце строки
        s = re.sub(rf"\s+{long}$", f" {short}", s, flags=re.IGNORECASE)
        # Внутри
        s = re.sub(rf"\s*{long}\s*", f" {short} ", s, flags=re.IGNORECASE)
    # Убираем двойные пробелы
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def update_seller_buyer_info_from_companies(scanned_doc):
    # === BUYER ===
    buyer_country = (scanned_doc.buyer_country_iso or "").strip().upper()
    if not buyer_country or buyer_country == "LT":
        buyer_fields = {
            'id': scanned_doc.buyer_id,
            'vat': scanned_doc.buyer_vat_code,
            'name': scanned_doc.buyer_name
        }
        buyer_company = None

        # 1. По company_code
        if buyer_fields['id']:
            buyer_company = Company.objects.filter(im_kodas__iexact=buyer_fields['id'].strip()).first()
        # 2. По vat_code
        if not buyer_company and buyer_fields['vat']:
            buyer_company = Company.objects.filter(pvm_kodas__iexact=buyer_fields['vat'].strip()).first()
        # 3. По company_name (нормализация)
        if not buyer_company and buyer_fields['name']:
            norm_name = normalize_company_name(buyer_fields['name'])
            candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
            for comp in candidates:
                if normalize_company_name(comp.pavadinimas) == norm_name:
                    buyer_company = comp
                    break

        # Если нашли — проставляем всё из Company
        if buyer_company:
            scanned_doc.buyer_id = buyer_company.im_kodas
            scanned_doc.buyer_name = shorten_legal_form(buyer_company.pavadinimas)
            scanned_doc.buyer_vat_code = ensure_lt_prefix(buyer_company.pvm_kodas)
        # Если есть хотя бы одно, но не всё — заполняем отсутствующее
        elif any(buyer_fields.values()):
            comp = None
            if buyer_fields['id']:
                comp = Company.objects.filter(im_kodas__iexact=buyer_fields['id'].strip()).first()
            elif buyer_fields['vat']:
                comp = Company.objects.filter(pvm_kodas__iexact=buyer_fields['vat'].strip()).first()
            elif buyer_fields['name']:
                norm_name = normalize_company_name(buyer_fields['name'])
                candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
                for c in candidates:
                    if normalize_company_name(c.pavadinimas) == norm_name:
                        comp = c
                        break
            if comp:
                if not scanned_doc.buyer_id:
                    scanned_doc.buyer_id = comp.im_kodas
                if not scanned_doc.buyer_name:
                    scanned_doc.buyer_name = shorten_legal_form(comp.pavadinimas)
                if not scanned_doc.buyer_vat_code:
                    scanned_doc.buyer_vat_code = ensure_lt_prefix(comp.pvm_kodas)

    # === SELLER ===
    seller_country = (scanned_doc.seller_country_iso or "").strip().upper()
    if not seller_country or seller_country == "LT":
        seller_fields = {
            'id': scanned_doc.seller_id,
            'vat': scanned_doc.seller_vat_code,
            'name': scanned_doc.seller_name
        }
        seller_company = None

        if seller_fields['id']:
            seller_company = Company.objects.filter(im_kodas__iexact=seller_fields['id'].strip()).first()
        if not seller_company and seller_fields['vat']:
            seller_company = Company.objects.filter(pvm_kodas__iexact=seller_fields['vat'].strip()).first()
        if not seller_company and seller_fields['name']:
            norm_name = normalize_company_name(seller_fields['name'])
            candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
            for comp in candidates:
                if normalize_company_name(comp.pavadinimas) == norm_name:
                    seller_company = comp
                    break

        if seller_company:
            scanned_doc.seller_id = seller_company.im_kodas
            scanned_doc.seller_name = shorten_legal_form(seller_company.pavadinimas)
            scanned_doc.seller_vat_code = ensure_lt_prefix(seller_company.pvm_kodas)
        elif any(seller_fields.values()):
            comp = None
            if seller_fields['id']:
                comp = Company.objects.filter(im_kodas__iexact=seller_fields['id'].strip()).first()
            elif seller_fields['vat']:
                comp = Company.objects.filter(pvm_kodas__iexact=seller_fields['vat'].strip()).first()
            elif seller_fields['name']:
                norm_name = normalize_company_name(seller_fields['name'])
                candidates = Company.objects.only('pavadinimas', 'im_kodas', 'pvm_kodas')
                for c in candidates:
                    if normalize_company_name(c.pavadinimas) == norm_name:
                        comp = c
                        break
            if comp:
                if not scanned_doc.seller_id:
                    scanned_doc.seller_id = comp.im_kodas
                if not scanned_doc.seller_name:
                    scanned_doc.seller_name = shorten_legal_form(comp.pavadinimas)
                if not scanned_doc.seller_vat_code:
                    scanned_doc.seller_vat_code = ensure_lt_prefix(comp.pvm_kodas)

    return scanned_doc
