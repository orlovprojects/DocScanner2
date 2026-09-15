import logging
import re
import unicodedata

from django.db import IntegrityError, transaction

from ..models import Counterparty, CounterpartyBankAccount

logger = logging.getLogger("docscanner_app")


# ────────────────────────────────────────────────────────────
# Нормализация
# ────────────────────────────────────────────────────────────

_LEGAL_FORMS = sorted([
    "UZDAROJI AKCINE BENDROVE", "AKCINE BENDROVE", "MAZOJI BENDRIJA",
    "VIESOJI ISTAIGA", "INDIVIDUALI IMONE", "ZEMES UKIO BENDROVE",
    "KOOPERATINE BENDROVE", "TIKROJI UKINE BENDRIJA", "KOMANDITINE UKINE BENDRIJA",
    "UAB", "AB", "MB", "VSI", "II", "ZUB", "KB", "TUB", "KUB",
    "SIA", "AS", "OU", "SP Z O O", "GMBH", "LTD", "LLC", "INC", "OY", "BV", "SRL", "SAS",
], key=len, reverse=True)


def normalize_code(value):
    return re.sub(r"\s+", "", value or "").upper()


def normalize_iban(value):
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def normalize_company_name(name):
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).upper()
    s = re.sub(r"[^\w\s]|_", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    base = s
    s = f" {s} "
    for form in _LEGAL_FORMS:
        s = s.replace(f" {form} ", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s or base


# ────────────────────────────────────────────────────────────
# Поиск
# ────────────────────────────────────────────────────────────

def find_counterparty(company_profile, *, company_code="", vat_code="", name="", iban=""):
    """
    Порядок: įmonės kodas → PVM kodas → IBAN → название.
    По названию — только если найден ровно один кандидат.
    """
    qs = Counterparty.objects.filter(company_profile=company_profile)

    code = normalize_code(company_code)
    if code:
        cp = qs.filter(company_code=code).first()
        if cp:
            return cp

    vat = normalize_code(vat_code)
    if vat:
        cp = qs.filter(vat_code=vat).first()
        if cp:
            return cp

    ibn = normalize_iban(iban)
    if ibn:
        acc = (
            CounterpartyBankAccount.objects
            .filter(company_profile=company_profile, iban=ibn)
            .select_related("counterparty")
            .first()
        )
        if acc:
            return acc.counterparty

    norm = normalize_company_name(name)
    if not norm:
        return None

    candidates = qs.filter(name_normalized=norm)
    if code or vat:
        # Пришли с кодом, по коду не нашли → можно прицепиться только к карточке без кодов
        candidates = candidates.filter(company_code="", vat_code="")
    candidates = list(candidates[:2])
    if len(candidates) == 1:
        return candidates[0]
    return None


# ────────────────────────────────────────────────────────────
# Get or create
# ────────────────────────────────────────────────────────────

_FILLABLE_FIELDS = (
    "company_code", "vat_code", "address", "country", "country_iso",
    "phone", "email", "bank_name", "iban", "swift", "id_programoje",
)


def add_counterparty_iban(counterparty, iban):
    ibn = normalize_iban(iban)
    if not ibn:
        return
    CounterpartyBankAccount.objects.get_or_create(
        company_profile_id=counterparty.company_profile_id,
        iban=ibn,
        defaults={"counterparty": counterparty},
    )


def get_or_create_counterparty(
    company_profile,
    user,
    *,
    name,
    company_code="",
    vat_code="",
    address="",
    country="",
    country_iso="",
    phone="",
    email="",
    bank_name="",
    iban="",
    swift="",
    is_person=False,
    id_programoje="",
    role="buyer",
    source="manual",
):
    """
    Возвращает (counterparty, created).
    Существующую карточку НЕ перезаписывает — только дозаполняет пустые поля.
    """
    name = (name or "").strip()
    if not name and not company_code and not vat_code:
        return None, False

    incoming = {
        "company_code": normalize_code(company_code),
        "vat_code": normalize_code(vat_code),
        "address": (address or "").strip(),
        "country": (country or "").strip(),
        "country_iso": (country_iso or "").strip().upper(),
        "phone": (phone or "").strip(),
        "email": (email or "").strip(),
        "bank_name": (bank_name or "").strip(),
        "iban": normalize_iban(iban),
        "swift": (swift or "").strip().upper(),
        "id_programoje": (id_programoje or "").strip(),
    }

    cp = find_counterparty(
        company_profile,
        company_code=incoming["company_code"],
        vat_code=incoming["vat_code"],
        name=name,
        iban=incoming["iban"],
    )

    if cp:
        changed = []
        for field in _FILLABLE_FIELDS:
            if not getattr(cp, field) and incoming[field]:
                setattr(cp, field, incoming[field])
                changed.append(field)
        if cp.default_role != "both" and role and cp.default_role != role:
            cp.default_role = "both"
            changed.append("default_role")
        if changed:
            try:
                with transaction.atomic():
                    cp.save(update_fields=changed + ["name_normalized", "updated_at"])
            except IntegrityError:
                # код/PVM уже занят другой карточкой — не трогаем, это кандидат на merge
                logger.warning("Counterparty %s fill conflict on %s", cp.pk, changed)
        add_counterparty_iban(cp, incoming["iban"])
        return cp, False

    try:
        with transaction.atomic():
            cp = Counterparty.objects.create(
                user=user,
                company_profile_id=getattr(company_profile, "pk", company_profile),
                name=name or incoming["company_code"] or incoming["vat_code"],
                is_person=is_person,
                default_role=role or "buyer",
                source=source,
                **incoming,
            )
    except IntegrityError:
        # гонка: параллельно создали карточку с тем же кодом
        cp = find_counterparty(
            company_profile,
            company_code=incoming["company_code"],
            vat_code=incoming["vat_code"],
            name=name,
        )
        if cp is None:
            raise
        return cp, False

    add_counterparty_iban(cp, incoming["iban"])
    return cp, True


# ────────────────────────────────────────────────────────────
# Merge
# ────────────────────────────────────────────────────────────

@transaction.atomic
def merge_counterparties(target, source):
    """
    Сливает source → target: перевешивает ВСЕ FK (любые модели, в т.ч. будущие),
    переносит IBAN, дозаполняет пустые поля target, удаляет source.
    """
    if target.pk == source.pk:
        return target
    if target.company_profile_id != source.company_profile_id:
        raise ValueError("Negalima sujungti skirtingų įmonių kontrahentų")

    # IBAN: дубли удаляем, остальные переносим
    target_ibans = set(target.bank_accounts.values_list("iban", flat=True))
    source.bank_accounts.filter(iban__in=target_ibans).delete()
    source.bank_accounts.update(counterparty=target)

    for rel in source._meta.related_objects:
        if not rel.one_to_many or rel.related_model is CounterpartyBankAccount:
            continue
        rel.related_model._default_manager.filter(
            **{rel.field.name: source}
        ).update(**{rel.field.name: target})

    changed = []
    for field in _FILLABLE_FIELDS:
        if not getattr(target, field) and getattr(source, field):
            setattr(target, field, getattr(source, field))
            changed.append(field)
    if target.default_role != source.default_role:
        target.default_role = "both"
        changed.append("default_role")

    source_id = source.pk
    source.delete()  # удаляем ДО save target, иначе конфликт уникальности кода/PVM
    if changed:
        target.save()

    logger.info("Counterparty merged: %s → %s", source_id, target.pk)
    return target


# ────────────────────────────────────────────────────────────
# Iš dokumento pusės (ScannedDocument / Invoice / Purchase)
# ────────────────────────────────────────────────────────────

def counterparty_from_party(company_profile, user, obj, prefix, *, role, source):
    """
    Kontrahentas iš dokumento pusės: obj.<prefix>_name, <prefix>_id, <prefix>_vat_code ...
    prefix = "buyer" arba "seller". Laukų, kurių modelyje nėra, tiesiog nepaima.
    """
    def g(field):
        return getattr(obj, f"{prefix}_{field}", None) or ""

    cp, _ = get_or_create_counterparty(
        company_profile,
        user,
        name=g("name"),
        company_code=g("id"),
        vat_code=g("vat_code"),
        address=g("address"),
        country=g("country"),
        country_iso=g("country_iso"),
        phone=g("phone"),
        email=g("email"),
        bank_name=g("bank_name"),
        iban=g("iban"),
        swift=g("swift"),
        is_person=bool(getattr(obj, f"{prefix}_is_person", False)),
        id_programoje=g("id_programoje"),
        role=role,
        source=source,
    )
    return cp




def ensure_party_counterparty(company_profile, user, obj, prefix, *, role, source):
    """
    Grąžina obj.<prefix>_counterparty, jei kortelė atitinka dokumento kodus.
    Jei kortelės nėra arba kodai nesutampa (pvz. pasirinko iš katalogo,
    bet vėliau ranka pakeitė kodą) — suranda/sukuria teisingą.
    """
    current = getattr(obj, f"{prefix}_counterparty", None)
    if current is not None:
        code = normalize_code(getattr(obj, f"{prefix}_id", "") or "")
        vat = normalize_code(getattr(obj, f"{prefix}_vat_code", "") or "")
        code_ok = not code or not current.company_code or current.company_code == code
        vat_ok = not vat or not current.vat_code or current.vat_code == vat
        if code_ok and vat_ok:
            return current
    return counterparty_from_party(
        company_profile, user, obj, prefix, role=role, source=source,
    )