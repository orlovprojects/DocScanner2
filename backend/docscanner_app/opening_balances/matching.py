"""Vartotojo sąskaitų plano kodų susiejimas su mūsų planu."""

import re

from ..models import AccountMapping, OpeningBalanceLine
from ..utils.chart_of_accounts import (
    CHART_OF_ACCOUNTS,
    get_account_name,
    is_valid_account,
    search_accounts,
)

# Sąskaitos, kurios plane turi vaikinių kodų (241 → 2410, 2419), yra grupinės.
# Jose įrašų vesti negalima, todėl susiejant jos praleidžiamos.
_PARENT_CODES = {
    code[:length]
    for code in CHART_OF_ACCOUNTS
    for length in range(2, len(code))
    if code[:length] in CHART_OF_ACCOUNTS
}

# Sąskaitos, kurias generatoriai naudoja konkrečiu ilgiu — trumpesnius
# variantus suvedam į tą patį kodą, kad sutaptų su esamais DK įrašais.
CANONICAL = {
    "241": "2410",
    "244": "2441",
    "443": "4430",
    "449": "4492",
    "442": "4420",
    "208": "2080",
}


def normalize_account_code(value):
    """2410.01 / 2410-1 / 24 10 → 241001."""
    return re.sub(r"[^0-9A-Za-z]", "", str(value or "")).upper()


def canonicalize(code):
    return CANONICAL.get(str(code or "").strip(), str(code or "").strip())


def is_postable(code):
    """Ar sąskaitoje galima daryti DK įrašus (nėra grupinė)."""
    code = str(code or "").strip()
    if not code or not is_valid_account(code):
        return False
    return code not in _PARENT_CODES


def _prefix_match(code):
    """Ilgesnis vartotojo kodas → trumpinam, kol randam darbinę sąskaitą. 24101 → 2410."""
    for length in range(len(code) - 1, 1, -1):
        candidate = code[:length]
        if is_postable(candidate):
            return candidate
    return None


def _expand_match(code):
    """Trumpesnis kodas → ieškom vienos darbinės sąskaitos, kuri juo prasideda. 443 → 4430."""
    hits = [
        c for c in CHART_OF_ACCOUNTS
        if c.startswith(code) and len(c) == len(code) + 1 and is_postable(c)
    ]
    return hits[0] if len(hits) == 1 else None


def _name_match(name):
    """Pagal pavadinimą — tik jei randam lygiai vieną darbinę sąskaitą."""
    if not (name or "").strip():
        return None
    results = search_accounts(name.strip(), limit=5) or []
    postable = [
        item["code"] for item in results
        if isinstance(item, dict) and is_postable(item.get("code"))
    ]
    return postable[0] if len(postable) == 1 else None


def match_account(code, name="", saved=None):
    """
    Grąžina (mūsų_kodas, match_type).
    saved — dict {normalizuotas_kodas: mūsų_kodas} iš AccountMapping.
    """
    raw = normalize_account_code(code)

    if saved and raw in saved:
        return canonicalize(saved[raw]), OpeningBalanceLine.MATCH_SAVED

    if raw and is_postable(raw):
        return canonicalize(raw), OpeningBalanceLine.MATCH_EXACT

    if raw in CANONICAL:
        return CANONICAL[raw], OpeningBalanceLine.MATCH_PREFIX

    if raw:
        hit = _expand_match(raw)
        if hit:
            return canonicalize(hit), OpeningBalanceLine.MATCH_PREFIX

        hit = _prefix_match(raw)
        if hit:
            return canonicalize(hit), OpeningBalanceLine.MATCH_PREFIX

    hit = _name_match(name)
    if hit:
        return canonicalize(hit), OpeningBalanceLine.MATCH_NAME

    return "", OpeningBalanceLine.MATCH_NONE


def load_saved_mappings(company_profile_id):
    return {
        normalize_account_code(m.external_code): m.account_code
        for m in AccountMapping.objects.filter(company_profile_id=company_profile_id)
    }


def save_mapping(company_profile_id, external_code, external_name, account_code):
    if not external_code or not account_code:
        return
    AccountMapping.objects.update_or_create(
        company_profile_id=company_profile_id,
        external_code=str(external_code).strip()[:40],
        defaults={
            "external_name": str(external_name or "").strip()[:255],
            "account_code": str(account_code).strip()[:20],
        },
    )


def apply_matching(lines, company_profile_id):
    """Užpildo mapped_account / mapped_name / match_type dar neišsaugotoms eilutėms."""
    saved = load_saved_mappings(company_profile_id)
    for line in lines:
        code, match_type = match_account(line.account_code, line.account_name, saved)
        line.mapped_account = code
        line.mapped_name = get_account_name(code) if code else ""
        line.match_type = match_type
    return lines