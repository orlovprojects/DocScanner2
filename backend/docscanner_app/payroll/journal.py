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


EMPLOYEE_ACCOUNTS = ("4480", "4484")   # skola konkrečiam darbuotojui - DK eilutė su darbuotoju


@dataclass
class JournalLine:
    account: str
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    employee_id: int = None


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


def merge_journals_by_employee(items):
    """
    items: [(employee_id, journal)] -> suvestinė, bet 4480 / 4484 paliekamos atskirai kiekvienam darbuotojui
    (Skolos: kiek kuriam darbuotojui mokėtina).
    """
    balances = OrderedDict()
    for emp_id, journal in items:
        for jl in journal:
            key = (jl.account, emp_id if jl.account in EMPLOYEE_ACCOUNTS else None)
            balances[key] = balances.get(key, ZERO) + jl.debit - jl.credit
    out = []
    for (account, emp_id), b in balances.items():
        if b > 0:
            out.append(JournalLine(account, debit=b, employee_id=emp_id))
        elif b < 0:
            out.append(JournalLine(account, credit=-b, employee_id=emp_id))
    return out


def employee_credit(journal, account):
    """Darbuotojo žurnale - sąskaitos kreditinis likutis (pvz. 4484 kompensacijos)."""
    b = sum((jl.credit - jl.debit for jl in journal if jl.account == account), ZERO)
    return b if b > 0 else ZERO


def is_balanced(journal):
    return sum((j.debit for j in journal), ZERO) == sum((j.credit for j in journal), ZERO)
