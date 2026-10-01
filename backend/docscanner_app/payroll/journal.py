"""
DU skaičiavimo -> DK įrašų eilutės (grynas modulis).

Kiekviena DU eilutė turi debeto/kredito sąskaitas (iš DU kodo).
Sąskaitos suvedamos į sąskaitų likučius (debetas +, kreditas -), todėl 4480 automatiškai
tampa "išmokėtinas DU" (priskaitymai - išskaitos).
"""
from collections import OrderedDict
from dataclasses import dataclass
from decimal import Decimal

from .run import CODES, Line
from .taxes import ZERO

TAX_FIELDS = (
    ("gpm", "GPM"), ("gpm_sick", "G15"),
    ("vsd", "VSD"), ("psd", "PSD"), ("kaupimas", "KAU"),
    ("employer_vsd", "DVS"), ("gar", "GAR"), ("ilg", "ILG"),
    ("grindys_vsd", "GRD"), ("grindys_psd", "GRP"),
)
DEFAULT_EXPENSE = "6304"


@dataclass
class JournalLine:
    account: str
    debit: Decimal = ZERO
    credit: Decimal = ZERO


def tax_lines(taxes):
    """TaxResult -> išskaitų ir darbdavio įmokų eilutės."""
    return [Line(code, getattr(taxes, attr)) for attr, code in TAX_FIELDS if getattr(taxes, attr)]


def build_journal(lines, expense_account=DEFAULT_EXPENSE, codes=CODES):
    """
    lines: Line sąrašas (priskaitymai + tax_lines + išskaitos).
    expense_account: darbuotojo sąnaudų sąskaita (6304 / 6203 / 6003) - pakeičia 6304.
    Grąžina subalansuotas JournalLine eilutes.
    """
    balances = OrderedDict()
    for l in lines:
        c = codes.get(l.code)
        if not c or not c["debit_account"] or not c["credit_account"] or not l.amount:
            continue
        debit = expense_account if c["debit_account"] == DEFAULT_EXPENSE else c["debit_account"]
        credit = expense_account if c["credit_account"] == DEFAULT_EXPENSE else c["credit_account"]
        balances[debit] = balances.get(debit, ZERO) + l.amount
        balances[credit] = balances.get(credit, ZERO) - l.amount

    out = []
    for account, bal in balances.items():
        if bal > 0:
            out.append(JournalLine(account, debit=bal))
        elif bal < 0:
            out.append(JournalLine(account, credit=-bal))
    return out


def merge_journals(journals):
    """Kelių darbuotojų eilutės -> viena suvestinė (sąskaitų likučiai)."""
    balances = OrderedDict()
    for jl in (x for j in journals for x in j):
        balances[jl.account] = balances.get(jl.account, ZERO) + jl.debit - jl.credit
    return [JournalLine(a, debit=b) if b > 0 else JournalLine(a, credit=-b)
            for a, b in balances.items() if b != 0]


def is_balanced(journal):
    return sum((j.debit for j in journal), ZERO) == sum((j.credit for j in journal), ZERO)
