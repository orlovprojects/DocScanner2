import json
import os
from datetime import date
from functools import lru_cache

from django.conf import settings

_JSON_PATH = os.path.join(settings.BASE_DIR, "docscanner_app", "data", "epris_reference.json")

EU_COUNTRIES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
}
EU_NO_LT = EU_COUNTRIES - {"LT"}

# Salies valiuta - jei dokumento valiuta kitokia, rodomas ispejimas
COUNTRY_CURRENCY = {
    "BG": "BGN", "CZ": "CZK", "DK": "DKK", "HU": "HUF",
    "PL": "PLN", "RO": "RON", "SE": "SEK",
}


@lru_cache(maxsize=1)
def _ref():
    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _flat():
    return {r["code"]: r for r in _ref()["flat"]}


def category_labels(rows):
    flat = _flat()
    labels = []
    for row in rows or []:
        for code in (row.get("code"), row.get("subcode")):
            if code:
                label = f"{code} - {flat[code]['name_lt']}" if code in flat else code
                if label not in labels:
                    labels.append(label)
    return labels


def _name(code):
    flat = _flat()
    parts = code.split(".")
    chain = []
    for i in range(1, len(parts) + 1):
        c = ".".join(parts[:i])
        if c in flat:
            chain.append(flat[c]["name_lt"])
    return " > ".join(chain)


def country_name(iso):
    c = _ref()["countries"].get((iso or "").strip().upper())
    return c["name_lt"] if c else (iso or "")


def country_currency(iso, on_date=None):
    iso = (iso or "").strip().upper()
    on_date = on_date or date.today()
    if iso == "BG" and on_date >= date(2026, 1, 1):
        return "EUR"
    if iso == "HR" and on_date < date(2023, 1, 1):
        return "HRK"
    return COUNTRY_CURRENCY.get(iso, "EUR")


def country_requires_subcodes(iso):
    c = _ref()["countries"].get((iso or "").strip().upper())
    return bool(c and c["requires_subcodes"])


def country_options(iso):
    """10 kategoriju; kiekvienoje - leidziami subkodai siai saliai."""
    iso = (iso or "").strip().upper()
    ref = _ref()
    country = ref["countries"].get(iso)
    allowed = set(country["allowed_subcodes"]) if country else set()

    categories = []
    for code in [str(i) for i in range(1, 11)]:
        cat = ref["codes"][code]
        subs = sorted(
            (s for s in allowed if s.startswith(code + ".")),
            key=lambda s: [int(x) for x in s.split(".")],
        )
        categories.append({
            "code": code,
            "name_lt": cat["name_lt"],
            "label": f"{code} - {cat['name_lt']}",
            "subcode_required": bool(subs),
            "allows_free_text": code == "10",
            "options": [
                {
                    "value": s,
                    "level": len(s.split(".")),
                    "label": f"{s} - {_name(s).split(' > ')[-1]}",
                    "path": _name(s),
                }
                for s in subs
            ],
        })
    return categories


def normalize_rows(rows):
    if not isinstance(rows, list) or len(rows) > 30 or any(not isinstance(r, dict) for r in rows):
        raise ValueError("Kategorijos turi būti sąrašas (iki 30 eilučių)")
    out, seen = [], set()
    for r in rows or []:
        code = str(r.get("code") or "").strip()
        subcode = str(r.get("subcode") or "").strip()
        free_text = str(r.get("free_text") or "").strip()
        language = str(r.get("language") or "").strip().upper()
        if not code:
            continue
        key = (code, subcode)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "code": code,
            "subcode": subcode,
            "free_text": free_text,
            "language": language if free_text else "",
        })
    return out


def validate_code(iso, code, subcode="", free_text=""):
    code = (code or "").strip()
    subcode = (subcode or "").strip()
    free_text = (free_text or "").strip()

    cats = {c["code"]: c for c in country_options(iso)}
    if not code:
        return "Nenurodyta kategorija"
    if code not in cats:
        return f"Netinkama kategorija: {code}"

    cat = cats[code]

    if free_text and code != "10":
        return "Laisvas aprasymas galimas tik su 10 kategorija"

    if cat["subcode_required"]:
        if not subcode:
            if code == "10" and free_text:
                return None
            return f"{iso} kategorijai {code} reikalauja subkodo"
        if subcode not in {o["value"] for o in cat["options"]}:
            return f"{iso} neleidzia subkodo {subcode}"
    elif subcode:
        return f"{iso} kategorijoje {code} subkodai nenaudojami"

    if code == "10" and not free_text:
        return "10 kategorijai būtinas prekių / paslaugų aprašymas"

    return None


def validate_document(iso, rows):
    if not rows:
        return ["Nenurodyta nei viena kategorija"]
    errors = []
    for r in rows:
        err = validate_code(iso, r.get("code"), r.get("subcode"), r.get("free_text"))
        if err:
            errors.append(err)
        if r.get("free_text") and r.get("language") not in {"BG", "CS", "DA", "DE", "EL", "EN", "ES", "ET", "FI", "FR", "GA", "HR", "HU", "IT", "LT", "LV", "MT", "NL", "PL", "PT", "RO", "SK", "SL", "SV"}:
            errors.append("Nurodykite galiojančią aprašymo kalbą")
    return errors


def compute_status(iso, rows):
    if not rows:
        return "tikrinti"
    return "netinkama" if validate_document(iso, rows) else "tinkama"
