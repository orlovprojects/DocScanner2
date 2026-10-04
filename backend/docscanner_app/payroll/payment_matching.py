"""
DU mokėjimų susiejimas su banko išlaidomis (grynas modulis, be Django).

Kriterijai (įmokos kodas - tik vienas iš jų, nes žmonės klysta):
  1. Mūsų mokėjimo nuoroda (DU202609-E12) paskirtyje / nuorodoje   -> tikrai
  2. Gavėjas VMI / Sodra (pavadinimas, kodas) + suma = GPM / įmokos  -> tikrai, jei kodas tinka
     kodo nėra -> tikrai, bet mažesnis patikimumas; kodas kitas -> tik pasiūlymas su įspėjimu
  3. Darbuotojo IBAN + suma                                         -> tikrai
     IBAN be sumos / vardas + suma                                  -> pasiūlymas
Kodas 1001 (PVM / pelno) nesutapus sumai -> ne DU: siūloma 4492, ne 4481.
"""
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

ZERO = Decimal("0")
TOL = Decimal("0.01")
AUTO, PROPOSED = Decimal("0.90"), Decimal("0.60")

VMI_CODES = {"1311": "gpm", "1330": "other", "1331": "other", "1411": "other", "1001": "other"}
SODRA_CODES = {"252": "sodra", "253": "other", "322": "other", "444": "other"}
VMI_NAMES = ("mokesciu inspekcija", "valstybine mokesciu", " vmi ", "vmi prie")
SODRA_NAMES = ("sodra", "socialinio draudimo fondo", "vsdfv")
VMI_COMPANY_CODES = {"188659752"}


@dataclass
class Txn:
    id: int
    amount: Decimal
    date: date
    counterparty_name: str = ""
    counterparty_account: str = ""
    counterparty_code: str = ""
    purpose: str = ""
    reference: str = ""


@dataclass
class Obligation:
    id: int
    kind: str                 # employee / advance / gpm / sodra / deduction
    open_amount: Decimal      # dar nesumokėta (rankiniai mokėjimai be banko - laikomi neatvirais tik jei patvirtinti banku)
    due_date: date = None
    recipient_name: str = ""
    recipient_iban: str = ""
    reference: str = ""


@dataclass
class Match:
    obligation_id: int
    amount: Decimal
    confidence: Decimal
    reasons: dict = field(default_factory=dict)


@dataclass
class Result:
    txn_id: int
    status: str = "none"      # auto / proposed / none
    matches: list = field(default_factory=list)
    category: str = ""        # salary / tax_vmi / tax_sodra
    warnings: list = field(default_factory=list)
    hint: dict = field(default_factory=dict)

    @property
    def confidence(self):
        return min((m.confidence for m in self.matches), default=ZERO)


def norm(text):
    text = unicodedata.normalize("NFD", (text or "").lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return " " + re.sub(r"[^a-z0-9]+", " ", text).strip() + " "


def norm_iban(v):
    return re.sub(r"\s+", "", v or "").upper()


def extract_codes(*texts):
    """Įmokų kodai paskirtyje / nuorodoje: tik žinomi, kaip atskiri skaičiai."""
    found = set()
    for t in texts:
        for tok in re.findall(r"(?<!\d)(\d{3,4})(?!\d)", t or ""):
            if tok in VMI_CODES or tok in SODRA_CODES:
                found.add(tok)
    return found


def authority(txn):
    from .pain001 import SODRA_ACCOUNTS, SODRA_CODE, VMI_ACCOUNTS
    name, iban = norm(txn.counterparty_name), norm_iban(txn.counterparty_account)
    if (txn.counterparty_code in VMI_COMPANY_CODES or iban in VMI_ACCOUNTS.values()
            or any(k in name for k in VMI_NAMES)):
        return "vmi"
    if txn.counterparty_code == SODRA_CODE or iban in SODRA_ACCOUNTS.values() or any(k in name for k in SODRA_NAMES):
        return "sodra"
    return None


def _eq(a, b):
    return abs(a - b) <= TOL


def _fifo(amount, obligations):
    out, left = [], amount
    for o in sorted(obligations, key=lambda o: (o.due_date or date.max, o.id)):
        if left <= TOL:
            break
        part = min(left, o.open_amount)
        out.append((o, part))
        left -= part
    return out, left


def _by_reference(txn, obligations):
    hay = re.sub(r"\s+", "", f"{txn.purpose} {txn.reference}").upper()
    for o in obligations:
        if o.reference and o.reference.upper() in hay:
            return o
    return None


def _match_authority(txn, obligations, kind, good_code, codes):
    res = Result(txn.id, category="tax_vmi" if kind == "gpm" else "tax_sodra")
    pool = [o for o in obligations if o.kind == kind and o.open_amount > TOL]
    wrong = sorted(c for c in codes if c != good_code)
    if not pool:
        if wrong:
            res.hint = {"codes": wrong}
        return res

    exact = [o for o in pool if _eq(o.open_amount, txn.amount)]
    if exact:
        chosen = [(min(exact, key=lambda o: (o.due_date or date.max, o.id)), txn.amount)]
        exact_hit = True
    elif _eq(sum((o.open_amount for o in pool), ZERO), txn.amount):
        chosen, _ = _fifo(txn.amount, pool)
        exact_hit = True
    else:
        chosen, _ = _fifo(txn.amount, pool)
        exact_hit = False

    if exact_hit and good_code in codes and not wrong:
        conf, reason = Decimal("0.97"), "Suma ir įmokos kodas sutampa"
    elif exact_hit and not codes:
        conf, reason = Decimal("0.92"), "Suma sutampa (įmokos kodo išraše nėra)"
    elif exact_hit:
        conf, reason = Decimal("0.70"), "Suma sutampa"
        res.warnings.append(f"Įmokos kodas {', '.join(wrong)} - tikėtasi {good_code}. Patikrinkite, ar mokėta teisingai.")
    elif good_code in codes:
        conf, reason = Decimal("0.65"), "Įmokos kodas sutampa"
        res.warnings.append("Suma nesutampa su mokėtina suma - dalinis mokėjimas arba permoka")
    else:
        if wrong:
            res.hint = {"codes": wrong}
        return res

    res.matches = [Match(o.id, amt, conf, {"rule": kind, "reason": reason, "codes": sorted(codes)}) for o, amt in chosen]
    res.status = "auto" if conf >= AUTO else "proposed"
    return res


def _match_employee(txn, obligations):
    res = Result(txn.id, category="salary")
    iban = norm_iban(txn.counterparty_account)
    name = norm(txn.counterparty_name)
    best = None
    for o in obligations:
        if o.kind not in ("employee", "advance", "deduction") or o.open_amount <= TOL:
            continue
        score, reasons = ZERO, []
        if iban and o.recipient_iban and norm_iban(o.recipient_iban) == iban:
            score += Decimal("0.60")
            reasons.append("IBAN")
        rn = norm(o.recipient_name)
        if rn.strip() and (rn in name or name in rn or set(rn.split()) == set(name.split())):
            score += Decimal("0.30")
            reasons.append("vardas")
        if not score:
            continue
        if _eq(o.open_amount, txn.amount):
            score += Decimal("0.35")
            reasons.append("suma")
        elif txn.amount < o.open_amount:
            score += Decimal("0.10")
            reasons.append("dalinė suma")
        key = (score, -(o.due_date or date.max).toordinal())
        if best is None or key > best[0]:
            best = (key, o, min(score, Decimal("0.99")), reasons)
    if not best:
        return res
    _, o, conf, reasons = best
    if conf < PROPOSED:
        return res
    res.matches = [Match(o.id, min(txn.amount, o.open_amount), conf, {"rule": "employee", "reason": " + ".join(reasons)})]
    res.status = "auto" if conf >= AUTO else "proposed"
    if txn.amount - o.open_amount > TOL:
        res.warnings.append("Sumokėta daugiau nei mokėtina")
    return res


def match_txn(txn, obligations):
    """Viena banko išlaida -> Result (susiejimai su DU įsipareigojimais)."""
    ref = _by_reference(txn, obligations)
    if ref and ref.open_amount > TOL:
        cat = {"gpm": "tax_vmi", "sodra": "tax_sodra"}.get(ref.kind, "salary")
        return Result(txn.id, "auto", [Match(ref.id, min(txn.amount, ref.open_amount), Decimal("1.00"),
                                             {"rule": "reference", "reason": "Mokėjimo nuoroda"})], cat)

    codes = extract_codes(txn.purpose, txn.reference)
    who = authority(txn)
    if who == "vmi":
        return _match_authority(txn, obligations, "gpm", "1311", codes)
    if who == "sodra":
        return _match_authority(txn, obligations, "sodra", "252", codes)
    return _match_employee(txn, obligations)


def match_all(txns, obligations):
    """Kelios išlaidos: susieta suma mažina įsipareigojimo likutį, kad dvi operacijos jo nepadengtų dukart."""
    left = {o.id: o.open_amount for o in obligations}
    out = []
    for t in sorted(txns, key=lambda t: (t.date, t.id)):
        pool = [Obligation(o.id, o.kind, left[o.id], o.due_date, o.recipient_name, o.recipient_iban, o.reference)
                for o in obligations]
        r = match_txn(t, pool)
        for m in r.matches:
            left[m.obligation_id] -= m.amount
        out.append(r)
    return out


def gpm_due_date(pay_date):
    from .gpm313_attribution import gpm_due_date as _due
    return _due(pay_date)


def split_proportionally(amount, breakdown):
    """Dalinis mokėjimas -> sąskaitų dalys pagal įsipareigojimo struktūrą (4482/4486, 4480/4484)."""
    total = sum((Decimal(str(v)) for v in breakdown.values()), ZERO)
    if not breakdown or total <= 0:
        return {}
    keys = list(breakdown)
    out, used = {}, ZERO
    for k in keys[:-1]:
        part = (amount * Decimal(str(breakdown[k])) / total).quantize(Decimal("0.01"))
        out[k] = part
        used += part
    out[keys[-1]] = amount - used
    return {k: v for k, v in out.items() if v}
