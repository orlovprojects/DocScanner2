"""Kontrahento duomenų papildymas iš įmonių registro ir automatinis nustatymas."""

import re

from ..models import Company

# Juridinių asmenų formos pavadinime
_LEGAL_FORMS = (
    "UAB", "AB", "MB", "VSI", "VŠĮ", "IĮ", "II", "ZUB", "ŽŪB", "KB", "TUB", "KUB",
    "SIA", "OU", "OÜ", "AS", "SP Z O O", "GMBH", "LTD", "LLC", "INC", "OY", "BV",
    "SRL", "SAS", "PLC", "NV", "SA", "SL", "KFT", "DOO",
)

_VAT_COUNTRY_RE = re.compile(r"^([A-Z]{2})")


def _digits(value):
    return re.sub(r"\D", "", str(value or ""))


def find_in_registry(code="", vat_code="", name=""):
    """Randa įmonę registre pagal kodą, PVM kodą arba pavadinimą."""
    code = _digits(code)
    if code:
        hit = Company.objects.filter(im_kodas=code).first()
        if hit:
            return hit

    vat = str(vat_code or "").strip().upper().replace(" ", "")
    if vat:
        hit = Company.objects.filter(pvm_kodas__iexact=vat).first()
        if hit:
            return hit

    name = str(name or "").strip()
    if len(name) >= 4:
        normalized = " ".join(name.upper().split())
        hit = Company.objects.filter(normalized_pavadinimas=normalized).first()
        if hit:
            return hit

    return None


def _has_legal_form(name):
    upper = " " + " ".join(str(name or "").upper().replace('"', " ").split()) + " "
    return any(f" {form} " in upper for form in _LEGAL_FORMS)


def guess_country_iso(vat_code="", code="", registry_hit=None):
    if registry_hit:
        return "LT"

    vat = str(vat_code or "").strip().upper().replace(" ", "")
    match = _VAT_COUNTRY_RE.match(vat)
    if match:
        return match.group(1)

    if len(_digits(code)) in (9, 11):
        return "LT"

    return ""


def guess_is_person(code="", name="", registry_hit=None, explicit=""):
    """
    explicit — vartotojo nurodytas tipas iš failo („fizinis" / „juridinis").
    """
    hint = str(explicit or "").strip().lower()
    if hint.startswith(("fiz", "asmuo", "person")):
        return True
    if hint.startswith(("jur", "imon", "įmon", "company")):
        return False

    if registry_hit:
        return False

    digits = _digits(code)
    if len(digits) == 11:
        return True

    if _has_legal_form(name):
        return False

    # 9 skaitmenys, registre nerasta, nėra juridinės formos → ind. veikla
    return bool(digits)


def enrich_counterparty_data(name="", code="", vat_code="", address="", country="", person_type=""):
    """
    Grąžina dict su papildytais duomenimis kontrahento kortelei.
    Vartotojo nurodytos reikšmės visada viršesnės.
    """
    hit = find_in_registry(code=code, vat_code=vat_code, name=name)

    result = {
        "name": name or (hit.pavadinimas if hit else ""),
        "company_code": _digits(code) or (hit.im_kodas if hit else ""),
        "vat_code": (vat_code or "").strip().upper() or ((hit.pvm_kodas or "") if hit else ""),
        "address": address or ((hit.adresas or "")[:255] if hit else ""),
    }

    country_iso = (country or "").strip().upper()[:10]
    if len(country_iso) != 2:
        country_iso = guess_country_iso(result["vat_code"], result["company_code"], hit)
    result["country_iso"] = country_iso
    result["country"] = "Lietuva" if country_iso == "LT" else (country or "")

    result["is_person"] = guess_is_person(
        code=result["company_code"],
        name=result["name"],
        registry_hit=hit,
        explicit=person_type,
    )

    return result