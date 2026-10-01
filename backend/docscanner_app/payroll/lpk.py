"""
Lietuvos profesijų klasifikatorius (LPK 2023): paieška ir trumpas pareigų pavadinimas.
Duomenys: payroll/data/lpk_2023.json (2608 profesijos, 6 skaitmenų kodai).
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "lpk_2023.json"


@lru_cache(maxsize=1)
def all_professions():
    """[{code, name, group_code, group_name}] - įkeliama vieną kartą."""
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def codes():
    return {p["code"] for p in all_professions()}


def get(code):
    return next((p for p in all_professions() if p["code"] == code), None)

SCORES_FILE = Path(__file__).parent / "data" / "lpk_scores.json"


@lru_cache(maxsize=1)
def all_scores():
    """{group_code: {skills, qualification, effort, responsibility, conditions, note}}"""
    try:
        with open(SCORES_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def normalize(text):
    """Mažosios raidės, be lietuviškų diakritikų: 'Buhalterė' -> 'buhaltere'."""
    text = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def short_title(name):
    """
    Pavadinimas sutarčiai: LPK pavadinimas be patikslinimo skliaustuose gale.
    'Apskaitos specialistas (buhalteris)' -> 'Apskaitos specialistas'
    'Politikas (išskyrus Seimo narius)'   -> 'Politikas'
    """
    return re.sub(r"\s*\([^()]*\)\s*$", "", name or "").strip()

def _alias(name):
    """Tekstas skliaustuose gale: 'Apskaitos specialistas (buhalteris)' -> 'buhalteris'."""
    m = re.search(r"\(([^()]+)\)\s*$", name or "")
    return m.group(1) if m else ""


def rank(query, name, code=""):
    """
    Mažesnis - geresnis:
      0 - pavadinimas arba tekstas skliaustuose prasideda užklausa
      1 - juose kuris nors žodis prasideda užklausa
      2 - kitur pavadinime žodis prasideda užklausa
      3 - užklausa kažkur viduryje
    'Kiti ...' (kodai xxxx90) - šiek tiek žemiau.
    """
    q, n = normalize(query), normalize(name)
    if not q or q not in n:
        return None
    parts = [normalize(short_title(name)), normalize(_alias(name))]
    word = re.compile(r"(^|[\s(-])" + re.escape(q))
    if any(p.startswith(q) for p in parts if p):
        r = 0
    elif any(word.search(p) for p in parts if p):
        r = 1
    elif word.search(n):
        r = 2
    else:
        r = 3
    return r + (0.5 if code.endswith("90") else 0)


def search(query, items, limit=15):
    """items: [{code, name, ...}] -> geriausi atitikmenys (paieška ir pagal kodą)."""
    q = (query or "").strip()
    if len(q) < 2:
        return []
    if q.isdigit():
        return [i for i in items if i["code"].startswith(q)][:limit]
    scored = []
    for i in items:
        r = rank(q, i["name"], i["code"])
        if r is not None:
            scored.append((r, len(i["name"]), i))
    scored.sort(key=lambda x: (x[0], x[1]))
    return [i for _, _, i in scored[:limit]]
