"""
utils/tax_payment_refs.py

VMI / Sodra sąskaitos ir įmokų kodai.

Svarbu:
- Čia laikome tik atpažinimo ir default DK mapping logiką.
- Tikslus DK account gali būti override'intas įmonės nustatymuose.
"""

import re


# VMI biudžeto pajamų surenkamosios sąskaitos.
# Pradžiai įdedame dažniausiai matomas / iš importų.
# Vėliau čia galima suseedinti pilną sąrašą iš VMI puslapio.
VMI_ACCOUNTS = {
    "LT057044060007887175",  # SEB, matomas tavo išrašuose
}


# Sodra surenkamosios sąskaitos.
SODRA_ACCOUNTS = {
    "LT337044060007740589",  # SEB, matomas tavo išrašuose
}


# Pradinis VMI įmokų kodų mapping.
# Jeigu nežinom konkretaus mokesčio, defaultinam į 4481.
VMI_PAYMENT_CODES = {
    "1001": {
        "label": "VMI įmoka",
        "account": "4481",
    },
    "1311": {
        "label": "VMI įmoka",
        "account": "4481",
    },
}


# Pradinis Sodra mapping.
# Už samdomus darbuotojus dažnai matomas 252.
SODRA_PAYMENT_CODES = {
    "252": {
        "label": "Sodra įmoka",
        "account": "4482",
    },
}


def normalize_iban(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "")).upper()


def is_vmi_account(value: str) -> bool:
    return normalize_iban(value) in VMI_ACCOUNTS


def is_sodra_account(value: str) -> bool:
    return normalize_iban(value) in SODRA_ACCOUNTS


def extract_payment_code(txn) -> str:
    """
    SEB dažnai deda įmokos kodą į reference_number:
      reference_number = 1001
      reference_number = 252

    Kartais jis būna payment_purpose pradžioje:
      ", 1001, dok. nr..."
      ", 252, dok. nr..."
    """
    ref = str(getattr(txn, "reference_number", "") or "").strip()
    if ref.isdigit() and 2 <= len(ref) <= 6:
        return ref

    purpose = str(getattr(txn, "payment_purpose", "") or "")

    patterns = [
        r"(?:^|[,;\s])(\d{2,6})(?:[,;\s]|$)",
        r"įmokos\s+kodas\s*[:\-]?\s*(\d{2,6})",
        r"imokos\s+kodas\s*[:\-]?\s*(\d{2,6})",
    ]

    for p in patterns:
        m = re.search(p, purpose, flags=re.IGNORECASE)
        if m:
            return m.group(1)

    return ""


def get_vmi_payment_info(code: str) -> dict:
    return VMI_PAYMENT_CODES.get(str(code or "").strip(), {})


def get_sodra_payment_info(code: str) -> dict:
    return SODRA_PAYMENT_CODES.get(str(code or "").strip(), {})


def get_default_vmi_account(code: str = "") -> str:
    return get_vmi_payment_info(code).get("account") or "4481"


def get_default_sodra_account(code: str = "") -> str:
    return get_sodra_payment_info(code).get("account") or "4482"