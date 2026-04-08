"""
Sync Lithuanian companies and addresses.

1) sync_companies_from_vmi()  — companies from get.data.gov.lt (MokesciuMoketojas)
2) sync_addresses_from_jar()  — addresses from JAR_ADRESAI.csv (registrucentras.lt)
3) sync_lt_companies_weekly   — Celery task, once a week

Usage:
    # Full sync (first run or re-sync)
    from docscanner_app.services.sync_lt_companies import sync_companies_from_vmi, sync_addresses_from_jar
    sync_companies_from_vmi(full=True)
    sync_addresses_from_jar()

    # Backfill normalized names for existing records
    from docscanner_app.services.sync_lt_companies import backfill_normalized_names
    backfill_normalized_names()

    # Celery Beat — add to CELERY_BEAT_SCHEDULE:
    'sync-lt-companies-weekly': {
        'task': 'docscanner_app.services.sync_lt_companies.sync_lt_companies_weekly',
        'schedule': crontab(hour=5, minute=0, day_of_week=1),
    },
"""
import csv
import io
import logging
import re
import time
import unicodedata
from datetime import date, timedelta

import requests
from celery import shared_task
from django.db import transaction
from django.utils import timezone

from docscanner_app.models import Company

logger = logging.getLogger("docscanner_app")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VMI_API_BASE = (
    "https://get.data.gov.lt/datasets/gov/vmi/mm_registras"
    "/MokesciuMoketojas/:format/json"
)
VMI_PAGE_LIMIT = 500

JAR_ADRESAI_CSV_URL = "https://www.registrucentras.lt/aduomenys/?byla=JAR_ADRESAI.csv"

POSTCODE_RE = re.compile(r"^LT-\d{5}$")

INCREMENTAL_LOOKBACK_DAYS = 10


# ---------------------------------------------------------------------------
# Utils
# ---------------------------------------------------------------------------
def normalize_name(name: str) -> str:
    """Normalize company name for fuzzy matching."""
    if not name:
        return ""
    name = name.lower().strip()
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    for suffix in [
        r"\buab\b", r"\bab\b", r"\bvsi\b", r"\bmb\b", r"\biiv\b",
        r"\buz\b", r"\buzdaroji\b", r"\bakcine\b", r"\bbendrov[eė]\b",
        r"\bviesoji\b", r"\bistaiga\b", r"\bmazoji\b",
        r"\bsia\b", r"\boo\b", r"\booo\b", r"\bllc\b", r"\bgmbh\b",
        r"\bsp\.?\s*z\.?\s*o\.?\s*o\.?\b",
    ]:
        name = re.sub(suffix, "", name)
    name = re.sub(r'[\"\'\u201e\u201c\u00ab\u00bb\(\)]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def reverse_address(raw: str) -> str:
    """
    Reverse Lithuanian address order:
      "Vilniaus r. sav., Bezdoniu sen., Miskoniu k., Miskoniu g. 36, LT-15165"
      -> "Miskoniu g. 36, Miskoniu k., Bezdoniu sen., Vilniaus r. sav., LT-15165"
    """
    if not raw:
        return ""

    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return raw

    postcode = None
    remaining = []
    for p in parts:
        if POSTCODE_RE.match(p):
            postcode = p
        else:
            remaining.append(p)

    remaining.reverse()

    if postcode:
        remaining.append(postcode)

    return ", ".join(remaining)


def build_pvm_kodas(prefix: str, code: str) -> str:
    """
    Merge PVM prefix and code:
      prefix="LT", code="476293314" -> "LT476293314"
    """
    prefix = (prefix or "").strip()
    code = (code or "").strip()
    if not code:
        return ""
    if prefix and not code.startswith(prefix):
        return f"{prefix}{code}"
    return code


def parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _api_get_with_retry(session, url, max_retries=3, timeout=60):
    """GET with retry on 5xx errors."""
    for attempt in range(max_retries):
        try:
            resp = session.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            if attempt < max_retries - 1:
                wait = 10 * (attempt + 1)
                logger.warning(f"  Attempt {attempt+1} failed: {exc}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise


# ---------------------------------------------------------------------------
# Sync companies from VMI API
# ---------------------------------------------------------------------------
def sync_companies_from_vmi(full=False):
    """
    Paginate through MokesciuMoketojas API.
    Creates new / updates existing companies by im_kodas (= ja_kodas).

    full=False (default): incremental, suformuota >= (today - 10 days)
    full=True: fetch everything (first run or manual re-sync)
    """
    logger.info("sync_companies_from_vmi: start (full=%s)", full)
    now = timezone.now()

    if full:
        url = f"{VMI_API_BASE}?limit({VMI_PAGE_LIMIT})"
    else:
        since = (date.today() - timedelta(days=INCREMENTAL_LOOKBACK_DAYS)).isoformat()
        url = f'{VMI_API_BASE}?limit({VMI_PAGE_LIMIT})&suformuota>="{since}"'
        logger.info(f"  Incremental since: {since}")

    page = 0
    created_count = 0
    updated_count = 0
    total_fetched = 0

    # Cache existing: im_kodas -> company_id
    existing = {}
    for c in Company.objects.only("id", "im_kodas").iterator(chunk_size=5000):
        if c.im_kodas:
            existing[c.im_kodas] = c.id

    # Dedup within current run
    seen = set()

    session = requests.Session()
    session.headers["User-Agent"] = "DokSkenas/1.0"

    try:
        while url:
            page += 1
            logger.info(f"  Page {page}, fetched so far: {total_fetched}")

            data = _api_get_with_retry(session, url)

            records = data.get("_data", [])
            if not records:
                break

            total_fetched += len(records)
            to_create = []
            to_update = []

            for rec in records:
                ja_kodas = str(rec.get("ja_kodas", "")).strip()
                if not ja_kodas or ja_kodas in seen:
                    continue
                seen.add(ja_kodas)

                pvm_full = build_pvm_kodas(
                    rec.get("pvm_kodas_pref"),
                    rec.get("pvm_kodas"),
                )
                pavadinimas = (rec.get("pavadinimas") or "")[:255]

                fields = {
                    "pavadinimas": pavadinimas,
                    "normalized_pavadinimas": normalize_name(pavadinimas)[:255],
                    "ireg_data": parse_date(rec.get("ireg_data")),
                    "isreg_data": parse_date(rec.get("isreg_data")),
                    "tipas": (rec.get("tipo_aprasymas") or "")[:64],
                    "pvm_kodas": pvm_full[:32] if pvm_full else None,
                    "pvm_ireg": parse_date(rec.get("pvm_iregistruota")),
                    "pvm_isreg": parse_date(rec.get("pvm_isregistruota")),
                    "last_synced_at": now,
                }

                if ja_kodas in existing:
                    to_update.append((existing[ja_kodas], fields))
                else:
                    to_create.append(Company(im_kodas=ja_kodas, **fields))
                    existing[ja_kodas] = None

            if to_create:
                Company.objects.bulk_create(to_create, ignore_conflicts=True)
                created_count += len(to_create)

            if to_update:
                with transaction.atomic():
                    for company_id, fields in to_update:
                        Company.objects.filter(id=company_id).update(**fields)
                updated_count += len(to_update)

            # Next page
            next_cursor = data.get("_page", {}).get("next")
            if next_cursor:
                if full:
                    url = f'{VMI_API_BASE}?limit({VMI_PAGE_LIMIT})&page("{next_cursor}")'
                else:
                    url = (
                        f'{VMI_API_BASE}?limit({VMI_PAGE_LIMIT})'
                        f'&suformuota>="{since}"'
                        f'&page("{next_cursor}")'
                    )
            else:
                url = None

            time.sleep(0.3)

        msg = (
            f"sync_companies_from_vmi: done. "
            f"Fetched: {total_fetched}, created: {created_count}, "
            f"updated: {updated_count}"
        )
        logger.info(msg)
        return msg

    except requests.RequestException as exc:
        logger.error(f"sync_companies_from_vmi: error: {exc}")
        raise


# ---------------------------------------------------------------------------
# Sync addresses from JAR CSV
# ---------------------------------------------------------------------------
def sync_addresses_from_jar():
    """
    Download JAR_ADRESAI.csv and update company addresses.
    CSV: ja_kodas|adresas|aob_kodas|adresas_nuo|formavimo_data
    Address is reversed: street first, postcode last.
    """
    logger.info("sync_addresses_from_jar: start")

    resp = requests.get(JAR_ADRESAI_CSV_URL, timeout=120, stream=True)
    resp.raise_for_status()

    encoding = resp.apparent_encoding or "utf-8"
    content = resp.content.decode(encoding, errors="replace")

    reader = csv.DictReader(io.StringIO(content), delimiter="|")

    # Cache: im_kodas -> {id, adresas, aob_kodas}
    companies = {}
    for c in Company.objects.only(
        "id", "im_kodas", "adresas", "aob_kodas"
    ).iterator(chunk_size=5000):
        if c.im_kodas:
            companies[c.im_kodas] = {
                "id": c.id,
                "adresas": c.adresas,
                "aob_kodas": c.aob_kodas,
            }

    updated_count = 0
    batch = []
    now = timezone.now()

    for row in reader:
        ja_kodas = (row.get("ja_kodas") or "").strip()
        raw_adresas = (row.get("adresas") or "").strip()
        aob_str = (row.get("aob_kodas") or "").strip()

        if not ja_kodas or ja_kodas not in companies:
            continue

        comp = companies[ja_kodas]
        reversed_addr = reverse_address(raw_adresas)
        aob_kodas = int(aob_str) if aob_str.isdigit() else None

        if comp["adresas"] == reversed_addr and comp["aob_kodas"] == aob_kodas:
            continue

        batch.append({
            "id": comp["id"],
            "adresas": reversed_addr,
            "aob_kodas": aob_kodas,
        })

        if len(batch) >= 500:
            _flush_address_batch(batch, now)
            updated_count += len(batch)
            batch = []

    if batch:
        _flush_address_batch(batch, now)
        updated_count += len(batch)

    msg = f"sync_addresses_from_jar: done. Updated addresses: {updated_count}"
    logger.info(msg)
    return msg


def _flush_address_batch(batch, now):
    with transaction.atomic():
        for item in batch:
            Company.objects.filter(id=item["id"]).update(
                adresas=item["adresas"],
                aob_kodas=item["aob_kodas"],
                last_synced_at=now,
            )


# ---------------------------------------------------------------------------
# Backfill normalized names for existing records
# ---------------------------------------------------------------------------
def backfill_normalized_names():
    """Fill normalized_pavadinimas for all existing records that don't have it."""
    logger.info("backfill_normalized_names: start")
    qs = Company.objects.filter(
        normalized_pavadinimas__isnull=True
    ).exclude(pavadinimas__isnull=True)

    total = qs.count()
    logger.info(f"  Records to process: {total}")

    batch = []
    done = 0
    for c in qs.iterator(chunk_size=5000):
        c.normalized_pavadinimas = normalize_name(c.pavadinimas)[:255]
        batch.append(c)
        if len(batch) >= 5000:
            Company.objects.bulk_update(batch, ["normalized_pavadinimas"])
            done += len(batch)
            logger.info(f"  Progress: {done}/{total}")
            batch = []

    if batch:
        Company.objects.bulk_update(batch, ["normalized_pavadinimas"])
        done += len(batch)

    logger.info(f"backfill_normalized_names: done. Updated: {done}")
    return done


def resume_sync_from_cursor(cursor):
    """Resume full sync from a specific cursor (after API failure)."""
    logger.info(f"resume_sync_from_cursor: starting from cursor")
    now = timezone.now()

    url = f'{VMI_API_BASE}?limit({VMI_PAGE_LIMIT})&page("{cursor}")'

    existing = {}
    for c in Company.objects.only("id", "im_kodas").iterator(chunk_size=5000):
        if c.im_kodas:
            existing[c.im_kodas] = c.id

    seen = set()
    session = requests.Session()
    session.headers["User-Agent"] = "DokSkenas/1.0"
    page = 0
    created_count = 0
    updated_count = 0
    total_fetched = 0

    try:
        while url:
            page += 1
            if page % 50 == 0:
                logger.info(f"  Page {page}, fetched: {total_fetched}, created: {created_count}, updated: {updated_count}")

            data = _api_get_with_retry(session, url)
            records = data.get("_data", [])
            if not records:
                break

            total_fetched += len(records)
            to_create = []
            to_update = []

            for rec in records:
                ja_kodas = str(rec.get("ja_kodas", "")).strip()
                if not ja_kodas or ja_kodas in seen:
                    continue
                seen.add(ja_kodas)

                pvm_full = build_pvm_kodas(rec.get("pvm_kodas_pref"), rec.get("pvm_kodas"))
                pavadinimas = (rec.get("pavadinimas") or "")[:255]

                fields = {
                    "pavadinimas": pavadinimas,
                    "normalized_pavadinimas": normalize_name(pavadinimas)[:255],
                    "ireg_data": parse_date(rec.get("ireg_data")),
                    "isreg_data": parse_date(rec.get("isreg_data")),
                    "tipas": (rec.get("tipo_aprasymas") or "")[:64],
                    "pvm_kodas": pvm_full[:32] if pvm_full else None,
                    "pvm_ireg": parse_date(rec.get("pvm_iregistruota")),
                    "pvm_isreg": parse_date(rec.get("pvm_isregistruota")),
                    "last_synced_at": now,
                }

                if ja_kodas in existing:
                    to_update.append((existing[ja_kodas], fields))
                else:
                    to_create.append(Company(im_kodas=ja_kodas, **fields))
                    existing[ja_kodas] = None

            if to_create:
                Company.objects.bulk_create(to_create, ignore_conflicts=True)
                created_count += len(to_create)

            if to_update:
                with transaction.atomic():
                    for company_id, fields in to_update:
                        Company.objects.filter(id=company_id).update(**fields)
                updated_count += len(to_update)

            next_cursor = data.get("_page", {}).get("next")
            url = f'{VMI_API_BASE}?limit({VMI_PAGE_LIMIT})&page("{next_cursor}")' if next_cursor else None
            time.sleep(0.3)

        msg = f"resume_sync_from_cursor: done. Fetched: {total_fetched}, created: {created_count}, updated: {updated_count}"
        logger.info(msg)
        return msg

    except requests.RequestException as exc:
        logger.error(f"resume_sync_from_cursor: error: {exc}")
        raise


# ---------------------------------------------------------------------------
# Celery task — weekly orchestrator
# ---------------------------------------------------------------------------
@shared_task
def sync_lt_companies_weekly():
    """Weekly sync: companies (incremental) + addresses."""
    logger.info("sync_lt_companies_weekly: start")
    try:
        result1 = sync_companies_from_vmi(full=False)
        logger.info(result1)
    except Exception as e:
        logger.error(f"sync_lt_companies_weekly: companies error: {e}")

    try:
        result2 = sync_addresses_from_jar()
        logger.info(result2)
    except Exception as e:
        logger.error(f"sync_lt_companies_weekly: addresses error: {e}")