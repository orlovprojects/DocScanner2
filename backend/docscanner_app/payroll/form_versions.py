"""
Sodros formų versijų stebėjimas: kartą per savaitę tikrina sodra.lt formų puslapį.
Jei atsirado nauja versija (pvz. sam-v08), siunčia Telegram pranešimą administratoriui.
"""
import logging
import re

import requests
from celery import shared_task

from .notify import notify_admin

logger = logging.getLogger("docscanner_app")

SODRA_FORMS_URL = "https://sodra.lt/formos-ir-sablonai/draudejams"
EXPECTED = {"sam": 7, "1-sd": 11, "2-sd": 9, "12-sd": 5, "9-sd": 6}   # versijos, kurias palaiko DokSkenas


def newer_versions(html):
    """-> {"sam": 8} - formos, kurių puslapyje yra naujesnė versija nei palaikoma."""
    out = {}
    for form, ours in EXPECTED.items():
        found = [int(v) for v in re.findall(rf"(?<![\w-]){re.escape(form)}-v(\d{{2}})", html, flags=re.I)]
        if found and max(found) > ours:
            out[form] = max(found)
    return out


@shared_task
def check_sodra_form_versions():
    try:
        r = requests.get(SODRA_FORMS_URL, timeout=30, headers={"User-Agent": "DokSkenas/1.0"})
        r.raise_for_status()
    except requests.RequestException as e:
        logger.warning("Sodros formų puslapis nepasiekiamas: %s", e)
        return
    newer = newer_versions(r.text)
    if newer:
        lines = [f"{f.upper()}: palaikome v{EXPECTED[f]:02d}, Sodroje jau v{v:02d}" for f, v in newer.items()]
        notify_admin("⚠ DokSkenas: nauja Sodros formos versija\n" + "\n".join(lines) + f"\n{SODRA_FORMS_URL}")
    logger.info("Sodros formų versijos patikrintos: %s", newer or "naujų nėra")
