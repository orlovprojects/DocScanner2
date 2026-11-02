"""Darbuotojo ištrynimas: leidžiama tik „tuščią“ (be patvirtinto DU ir be pateiktų Sodrai / VMI duomenų)."""
from django.db import transaction
from django.db.models import ProtectedError, Q

from ..models import PayrollDeclaration, PayrollEmployeeResult
from .services import CLOSED_STATUSES

SUBMITTED = ("submitted", "accepted")


def delete_blockers(emp):
    """Priežastys, dėl kurių darbuotojo ištrinti negalima (tuščias sąrašas - galima)."""
    out = []
    months = list(PayrollEmployeeResult.objects.filter(employee=emp, run__status__in=CLOSED_STATUSES)
                  .values_list("run__year", "run__month").distinct().order_by("run__year", "run__month"))
    if months:
        shown = ", ".join(f"{y}-{m:02d}" for y, m in months[:3]) + (" ir kt." if len(months) > 3 else "")
        out.append(f"Patvirtintas DU už {shown}")
    forms = sorted(set(PayrollDeclaration.objects.filter(status__in=SUBMITTED)
                       .filter(Q(contract__employee=emp) | Q(absence_event__employee=emp))
                       .values_list("form", flat=True)))
    if forms:
        out.append("Sodrai / VMI jau pateikta: " + ", ".join(forms))
    return out


def delete_warnings(emp):
    """Kas bus ištrinta kartu (rodoma patvirtinimo lange)."""
    out = []
    if emp.contracts.exclude(status="draft").exists():
        out.append("Darbo sutartis ir jos sąlygos")
    from ..models import AbsenceEvent
    if AbsenceEvent.objects.filter(employee=emp).exists():
        out.append("Nebuvimai")
    acc = getattr(emp, "account", None)
    if acc is not None:
        out.append("Prieiga prie esavitarna.lt bus išjungta")
    from ..models import PayrollMigrationEmployee
    if PayrollMigrationEmployee.objects.filter(employee=emp).exists():
        out.append("Perkeltas pradinis likutis ir istorija (Perėjime žmogus liks pažymėtas „neperkelti“)")
    return out


@transaction.atomic
def delete_employee(emp):
    blockers = delete_blockers(emp)
    if blockers:
        raise ValueError("Darbuotojo ištrinti negalima: " + "; ".join(blockers)
                         + ". Jei darbuotojas nebedirba - jį atleiskite.")
    acc = getattr(emp, "account", None)
    # Perėjime žmogus lieka, bet pažymimas „neperkelti“ - kad patvirtinus perėjimą iš naujo nebūtų sukurtas vėl
    from ..models import PayrollMigrationEmployee
    for p in PayrollMigrationEmployee.objects.filter(employee=emp):
        p.include = False
        p.edited = sorted(set(p.edited or []) | {"include"})
        p.save(update_fields=["include", "edited"])
    try:
        emp.delete()
    except ProtectedError:
        raise ValueError("Darbuotojo ištrinti negalima - su juo susieti kiti duomenys.")
    if acc is not None and not acc.employees.exists():
        from ..models import EmployeeSession
        acc.is_active = False
        acc.save(update_fields=["is_active"])
        EmployeeSession.objects.filter(account=acc).update(revoked=True)
