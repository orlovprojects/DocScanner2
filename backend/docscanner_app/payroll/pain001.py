"""
ISO 20022 pain.001.001.03 (SEPA kredito pervedimai) - DU mokėjimų failas bankui.
Priima Swedbank, SEB, Luminor, Artea ir kt. LT bankai (interneto banke: mokėjimų failo importas).

VMI / Sodra: įmokos kodas -> RmtInf/Strd/CdtrRefInf/Ref (LBA ISO 20022 gairės),
mokėtojo (įmonės) kodas -> Dbtr/Id/OrgId/Othr (COID).
Atlyginimai: CtgyPurp SALA, paskirtyje mūsų nuoroda (DU202609-E12) - išraše susiejama tiksliai.
Adresų neįtraukiame (SEPA viduje neprivalomi) - todėl struktūrizuoto adreso reikalavimai neaktualūs.
"""
import re
from datetime import datetime
from decimal import Decimal
from xml.etree import ElementTree as ET

NS = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"

# Biudžeto pajamų surenkamosios sąskaitos (vmi.lt) - pagal mokėtojo banką (IBAN 5-9 simboliai)
VMI_ACCOUNTS = {
    "73000": "LT247300010112394300",   # Swedbank
    "70440": "LT057044060007887175",   # SEB
    "40100": "LT744010051001324763",   # Luminor
    "71800": "LT327180000000141038",   # Artea
    "72300": "LT427230000000120025",   # Urbo bankas
}
# Sodros (VSDFV, kodas 191630223) surenkamosios sąskaitos - ⚠ periodiškai pasitikrinti sodra.lt
SODRA_ACCOUNTS = {
    "73000": "LT777300010129002656",
    "70440": "LT337044060007740589",
    "40100": "LT584010042403495020",
    "71800": "LT027180300000690001",
}
BIC_BY_BANK = {"73000": "HABALT22", "70440": "CBVILT2X", "40100": "AGBLLT2X", "71800": "CBSBLT26", "72300": "MDBALT22"}
VMI_CODE, SODRA_CODE = "188659752", "191630223"


def clean_iban(v):
    return re.sub(r"\s+", "", v or "").upper()


def iban_valid(v):
    v = clean_iban(v)
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", v):
        return False
    digits = "".join(str(int(c, 36)) for c in v[4:] + v[:4])
    return int(digits) % 97 == 1


def bank_code(iban):
    iban = clean_iban(iban)
    return iban[4:9] if iban.startswith("LT") else ""


def bic_for(iban):
    return BIC_BY_BANK.get(bank_code(iban), "")


def authority_iban(kind, debtor_iban):
    table = VMI_ACCOUNTS if kind == "gpm" else SODRA_ACCOUNTS
    return table.get(bank_code(debtor_iban)) or table["73000"]


_LATIN = re.compile(r"[^A-Za-z0-9ĄČĘĖĮŠŲŪŽąčęėįšųūž/\-?:().,'+ ]")


def text(v, n):
    """SEPA simbolių rinkinys + lietuviškos raidės (LT bankai jas priima)."""
    return _LATIN.sub(" ", v or "").strip()[:n] or "-"


def _sub(parent, tag, value=None):
    el = ET.SubElement(parent, tag)
    if value is not None:
        el.text = str(value)
    return el


def _amt(v):
    return f"{Decimal(v).quantize(Decimal('0.01'))}"


def build(msg_id, debtor, execution_date, items, created=None):
    """
    debtor: {"name", "iban", "company_code"}
    items: [{"end_to_end", "amount", "name", "iban", "kind", "purpose", "imokos_kodas", "code"}]
    """
    ET.register_namespace("", NS)
    doc = ET.Element(f"{{{NS}}}Document")
    root = _sub(doc, "CstmrCdtTrfInitn")
    total = sum((Decimal(str(i["amount"])) for i in items), Decimal("0"))

    hdr = _sub(root, "GrpHdr")
    _sub(hdr, "MsgId", msg_id[:35])
    _sub(hdr, "CreDtTm", (created or datetime.now()).strftime("%Y-%m-%dT%H:%M:%S"))
    _sub(hdr, "NbOfTxs", len(items))
    _sub(hdr, "CtrlSum", _amt(total))
    _sub(_sub(hdr, "InitgPty"), "Nm", text(debtor["name"], 70))

    pmt = _sub(root, "PmtInf")
    _sub(pmt, "PmtInfId", msg_id[:35])
    _sub(pmt, "PmtMtd", "TRF")
    _sub(pmt, "BtchBookg", "false")
    _sub(pmt, "NbOfTxs", len(items))
    _sub(pmt, "CtrlSum", _amt(total))
    _sub(_sub(_sub(pmt, "PmtTpInf"), "SvcLvl"), "Cd", "SEPA")
    _sub(pmt, "ReqdExctnDt", execution_date.isoformat())
    dbtr = _sub(pmt, "Dbtr")
    _sub(dbtr, "Nm", text(debtor["name"], 70))
    if debtor.get("company_code"):
        othr = _sub(_sub(_sub(dbtr, "Id"), "OrgId"), "Othr")
        _sub(othr, "Id", debtor["company_code"])
        _sub(_sub(othr, "SchmeNm"), "Cd", "COID")
    _sub(_sub(_sub(pmt, "DbtrAcct"), "Id"), "IBAN", clean_iban(debtor["iban"]))
    fin = _sub(_sub(pmt, "DbtrAgt"), "FinInstnId")
    bic = bic_for(debtor["iban"])
    if bic:
        _sub(fin, "BIC", bic)
    else:
        _sub(_sub(fin, "Othr"), "Id", "NOTPROVIDED")
    _sub(pmt, "ChrgBr", "SLEV")

    for i in items:
        tx = _sub(pmt, "CdtTrfTxInf")
        pid = _sub(tx, "PmtId")
        _sub(pid, "InstrId", i["end_to_end"][:35])
        _sub(pid, "EndToEndId", i["end_to_end"][:35])
        if i["kind"] in ("employee", "advance"):
            _sub(_sub(_sub(tx, "PmtTpInf"), "CtgyPurp"), "Cd", "SALA")
        _sub(_sub(tx, "Amt"), "InstdAmt", _amt(i["amount"])).set("Ccy", "EUR")
        cdtr = _sub(tx, "Cdtr")
        _sub(cdtr, "Nm", text(i["name"], 70))
        if i.get("code"):
            othr = _sub(_sub(_sub(cdtr, "Id"), "OrgId"), "Othr")
            _sub(othr, "Id", i["code"])
            _sub(_sub(othr, "SchmeNm"), "Cd", "COID")
        _sub(_sub(_sub(tx, "CdtrAcct"), "Id"), "IBAN", clean_iban(i["iban"]))
        rmt = _sub(tx, "RmtInf")
        if i.get("imokos_kodas"):
            strd = _sub(rmt, "Strd")
            _sub(_sub(strd, "CdtrRefInf"), "Ref", i["imokos_kodas"])
            _sub(strd, "AddtlRmtInf", text(f'{i["purpose"]} {i["end_to_end"]}', 140))
        else:
            _sub(rmt, "Ustrd", text(f'{i["purpose"]} {i["end_to_end"]}', 140))

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(doc, encoding="unicode")
