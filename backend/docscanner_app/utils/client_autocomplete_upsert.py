import logging
import re
import unicodedata
from django.utils import timezone

logger = logging.getLogger("docscanner_app")


def normalize_name(name: str) -> str:
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


def _fill_if_empty(obj, field, value):
    if not value:
        return False
    current = getattr(obj, field, None)
    if current and str(current).strip():
        return False
    setattr(obj, field, value)
    return True


def upsert_client_from_document(user, side_data: dict):
    """
    Upsert контрагента в ClientAutocomplete из обработанного документа.
    Ищет ТОЛЬКО среди source="document". Imported записи не трогает.
    """
    from ..models import ClientAutocomplete

    name = (side_data.get("name") or "").strip()
    company_code = (side_data.get("company_code") or "").strip()
    vat_code = (side_data.get("vat_code") or "").strip()
    address = (side_data.get("address") or "").strip()
    country_iso = (side_data.get("country_iso") or "").strip()
    iban = (side_data.get("iban") or "").strip()
    is_person = bool(side_data.get("is_person", False))

    if not name and not company_code and not vat_code:
        return None

    norm_name = normalize_name(name)
    now = timezone.now()

    base_qs = ClientAutocomplete.objects.filter(user=user, source="document")

    existing = None

    if company_code:
        existing = base_qs.filter(imones_kodas=company_code).first()

    if not existing and vat_code:
        existing = base_qs.filter(pvm_kodas=vat_code).first()

    if not existing and norm_name:
        existing = base_qs.filter(name_normalized=norm_name).first()

    if existing:
        changed = False
        changed |= _fill_if_empty(existing, "pavadinimas", name)
        changed |= _fill_if_empty(existing, "imones_kodas", company_code)
        changed |= _fill_if_empty(existing, "pvm_kodas", vat_code)
        changed |= _fill_if_empty(existing, "address", address)
        changed |= _fill_if_empty(existing, "country_iso", country_iso)
        changed |= _fill_if_empty(existing, "ibans", iban)

        if norm_name and not existing.name_normalized:
            existing.name_normalized = norm_name
            changed = True

        existing.doc_count = (existing.doc_count or 0) + 1
        existing.last_seen_at = now

        update_fields = ["doc_count", "last_seen_at"]
        if changed:
            update_fields.extend([
                "pavadinimas", "imones_kodas", "pvm_kodas",
                "address", "country_iso", "ibans", "name_normalized",
            ])

        existing.save(update_fields=update_fields)
        return existing

    try:
        obj = ClientAutocomplete.objects.create(
            user=user,
            pavadinimas=name or None,
            imones_kodas=company_code or None,
            pvm_kodas=vat_code or None,
            address=address or None,
            country_iso=country_iso or None,
            ibans=iban or None,
            is_person=is_person,
            source="document",
            doc_count=1,
            last_seen_at=now,
            name_normalized=norm_name,
        )
        return obj
    except Exception as e:
        logger.debug("[CLIENT-UPSERT] Create failed (likely race): %s", e)
        return None