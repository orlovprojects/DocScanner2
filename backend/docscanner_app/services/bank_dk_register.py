"""
invoicing/services/bank_dk_register.py
======================================
Šablonai + laisvas DK kūrimas banko operacijoms.

Naudojamas kai operacija nesusieta su dokumentu ir vartotojas
pasirenka šabloną arba įveda korespondenciją rankiniu būdu.
"""

import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction

from ..models import (
    JournalEntry,
    JournalEntryLine,
    OutgoingTransaction,
    IncomingTransaction,
)
from ..utils.journal_generators import finalize_journal_entry

logger = logging.getLogger("docscanner_app")


# ════════════════════════════════════════════════════════════
# Šablonai
# ════════════════════════════════════════════════════════════

# amount_mode:
#   "full"    — suma iš transakcijos
#   "empty"   — vartotojas įveda pats
#   "balance" — automatiškai apskaičiuojama (D=K)

DK_TEMPLATES = [
    # ── Automatiniai (tie patys kaip classifier) ──
    {
        "key": "bank_fee",
        "label": "Banko mokestis",
        "category": "bank_fee",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "6810", "name": "Kitos finansinės ir investicinės veiklos sąnaudos", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "tax_vmi",
        "label": "VMI mokestis",
        "category": "tax_vmi",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "4481", "name": "Mokėtini mokesčiai VMI", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "tax_sodra",
        "label": "Sodra / VSDFV",
        "category": "tax_sodra",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "4482", "name": "Mokėtina Sodra", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "salary",
        "label": "Darbo užmokestis",
        "category": "salary",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "4480", "name": "Mokėtinas darbo užmokestis", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },

    # ── Rankiniai ──
    {
        "key": "internal_transfer",
        "label": "Vidinis pervedimas",
        "category": "",
        "directions": ["outgoing", "incoming"],
        "lines": [
            {"side": "debit", "code": "", "name": "", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "owner_withdrawal",
        "label": "Savininko paėmimas",
        "category": "owner_withdrawal",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "24472", "name": "Įmonės savininkų asmeniniams poreikiams išmokėtos lėšos", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "owner_deposit",
        "label": "Savininko įnašas",
        "category": "owner_deposit",
        "directions": ["incoming"],
        "lines": [
            {"side": "debit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
            {"side": "credit", "code": "308", "name": "Savininkų įnašai", "amount_mode": "full"},
        ],
    },
    {
        "key": "loan_payment",
        "label": "Paskolos grąžinimas",
        "category": "loan_payment",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "4410", "name": "Įsipareigojimai pagal trumpalaikių paskolų sutartis", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "loan_received",
        "label": "Gauta paskola",
        "category": "loan_received",
        "directions": ["incoming"],
        "lines": [
            {"side": "debit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
            {"side": "credit", "code": "4410", "name": "Įsipareigojimai pagal trumpalaikių paskolų sutartis", "amount_mode": "full"},
        ],
    },
    {
        "key": "loan_interest",
        "label": "Paskolos palūkanos",
        "category": "",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "6802", "name": "Kitų įmonių suteiktų paskolų palūkanų sąnaudos", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "interest_received",
        "label": "Gautos palūkanos",
        "category": "",
        "directions": ["incoming"],
        "lines": [
            {"side": "debit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
            {"side": "credit", "code": "5802", "name": "Kitų suteiktų paskolų palūkanų pajamos", "amount_mode": "full"},
        ],
    },
    {
        "key": "cash_withdrawal",
        "label": "Kasos išėmimas",
        "category": "",
        "directions": ["outgoing"],
        "lines": [
            {"side": "debit", "code": "272", "name": "Kasa", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
    {
        "key": "cash_deposit",
        "label": "Kasos įnešimas",
        "category": "",
        "directions": ["incoming"],
        "lines": [
            {"side": "debit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
            {"side": "credit", "code": "272", "name": "Kasa", "amount_mode": "full"},
        ],
    },
    {
        "key": "provider_payout",
        "label": "Tarpininko išmoka",
        "category": "provider_payout",
        "directions": ["incoming"],
        "lines": [
            {"side": "debit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
            {"side": "debit", "code": "6810", "name": "Tarpininko komisinis", "amount_mode": "empty"},
            {"side": "credit", "code": "2731", "name": "Pinigai kelyje (tarpininkas)", "amount_mode": "balance"},
        ],
    },
    {
        "key": "custom",
        "label": "Kitas — įvesti rankiniu būdu",
        "category": "",
        "directions": ["outgoing", "incoming"],
        "lines": [
            {"side": "debit", "code": "", "name": "", "amount_mode": "full"},
            {"side": "credit", "code": "[bank]", "name": "[bank_name]", "amount_mode": "full"},
        ],
    },
]


# ════════════════════════════════════════════════════════════
# Service
# ════════════════════════════════════════════════════════════


class BankDKRegisterService:

    def __init__(self, user, company_profile=None):
        self.user = user
        self.company_profile = company_profile

    # ── Templates ───────────────────────────────────────

    def get_templates_for_transaction(self, txn, direction):
        """
        Grąžina šablonus su užpildytomis sąskaitomis ir sumomis.
        """
        bank_code, bank_name = self._resolve_bank_account(txn)
        amount = abs(txn.amount or Decimal("0"))

        result = []
        for tpl in DK_TEMPLATES:
            if direction not in tpl["directions"]:
                continue

            lines = []
            for line_def in tpl["lines"]:
                code = line_def["code"]
                name = line_def["name"]

                if code == "[bank]":
                    code = bank_code
                if name == "[bank_name]":
                    name = bank_name

                if line_def["amount_mode"] == "full":
                    line_amount = str(amount)
                elif line_def["amount_mode"] == "empty":
                    line_amount = ""
                else:  # balance
                    line_amount = ""

                lines.append({
                    "side": line_def["side"],
                    "account_code": code,
                    "account_name": name,
                    "amount": line_amount,
                    "editable": code != bank_code,
                })

            result.append({
                "key": tpl["key"],
                "label": tpl["label"],
                "category": tpl.get("category", ""),
                "lines": lines,
            })

        return {
            "templates": result,
            "bank_account": {"code": bank_code, "name": bank_name},
            "amount": str(amount),
            "direction": direction,
        }

    # ── Register DK ─────────────────────────────────────

    def register_dk(self, txn, direction, lines_data, description="",
                    save_as_template=False, template_name="", template_id=None):
        """
        Sukurti DK įrašą iš pateiktų eilučių.

        lines_data: [
            {"side": "debit", "account_code": "6880", "account_name": "...", "amount": "12.50"},
            {"side": "credit", "account_code": "2710", "account_name": "...", "amount": "12.50"},
        ]

        Grąžina JournalEntry arba kelia ValueError.
        """
        # ── Validate ───────────────────────────────────
        if not lines_data or len(lines_data) < 2:
            raise ValueError("Reikia bent dviejų eilučių (debetas ir kreditas).")

        parsed = []
        total_debit = Decimal("0")
        total_credit = Decimal("0")

        for i, line in enumerate(lines_data):
            side = line.get("side", "").strip().lower()
            if side not in ("debit", "credit"):
                raise ValueError(f"Eilutė {i + 1}: neteisingas pusė '{side}'.")

            code = (line.get("account_code") or "").strip()
            if not code:
                raise ValueError(f"Eilutė {i + 1}: sąskaitos kodas privalomas.")

            try:
                amount = Decimal(str(line.get("amount", "0")).replace(",", "."))
            except (InvalidOperation, ValueError):
                raise ValueError(f"Eilutė {i + 1}: neteisinga suma.")

            if amount <= 0:
                raise ValueError(f"Eilutė {i + 1}: suma turi būti teigiama.")

            name = (line.get("account_name") or code).strip()

            parsed.append({
                "side": side,
                "account_code": code,
                "account_name": name,
                "amount": amount,
            })

            if side == "debit":
                total_debit += amount
            else:
                total_credit += amount

        # D = K
        if abs(total_debit - total_credit) > Decimal("0.01"):
            raise ValueError(
                f"Debeto suma ({total_debit}) nesutampa su kredito suma ({total_credit})."
            )

        # Banko pusė turi sutapti su operacijos suma EUR.
        bank_code, _bank_name = self._resolve_bank_account(txn)
        txn_eur = Decimal(str(
            txn.amount_eur if (txn.currency or "EUR").upper() != "EUR" else txn.amount
        ) or "0")

        if txn_eur <= 0:
            raise ValueError("Nėra valiutos kurso — DK įrašo sukurti negalima.")

        bank_total = sum(
            (p["amount"] for p in parsed if p["account_code"] == bank_code),
            Decimal("0"),
        )
        if abs(bank_total - txn_eur) > Decimal("0.01"):
            raise ValueError(
                f"Banko sąskaitos ({bank_code}) suma {bank_total} "
                f"nesutampa su operacijos suma {txn_eur} EUR."
            )

        # ── Create ─────────────────────────────────────
        with db_transaction.atomic():
            Model = OutgoingTransaction if direction == "outgoing" else IncomingTransaction
            locked_txn = Model.objects.select_for_update().get(id=txn.id)

            if locked_txn.journal_entry_id:
                raise ValueError("Šiai operacijai DK įrašas jau sukurtas.")

            desc = description or self._build_description(locked_txn)

            txn_currency = (locked_txn.currency or "EUR").upper()
            is_foreign = txn_currency != "EUR"

            entry = JournalEntry.objects.create(
                user=self.user,
                company_profile=self.company_profile,
                source_type=JournalEntry.SOURCE_BANK,
                entry_date=locked_txn.transaction_date,
                period=date(locked_txn.transaction_date.year, locked_txn.transaction_date.month, 1),
                document_number=locked_txn.doc_number or locked_txn.reference_number or f"BANK-{locked_txn.id}",
                counterparty_name=locked_txn.counterparty_name or "",
                counterparty_code=locked_txn.counterparty_code or "",
                description=desc[:255],
                status=JournalEntry.STATUS_DRAFT,
                currency="EUR",
                original_amount=locked_txn.amount if is_foreign else None,
                original_currency=txn_currency if is_foreign else "",
                exchange_rate=getattr(locked_txn, "exchange_rate", None) if is_foreign else None,
                exchange_rate_date=getattr(locked_txn, "exchange_rate_date", None) if is_foreign else None,
            )

            for i, p in enumerate(parsed):
                JournalEntryLine.objects.create(
                    entry=entry,
                    side=JournalEntryLine.SIDE_DEBIT if p["side"] == "debit" else JournalEntryLine.SIDE_CREDIT,
                    account_code=p["account_code"],
                    account_name=p["account_name"],
                    amount=p["amount"],
                    description=desc[:255],
                    sort_order=i + 1,
                )

            finalize_journal_entry(entry)

            # Update transaction
            debit_codes = [p["account_code"] for p in parsed if p["side"] == "debit"]
            credit_codes = [p["account_code"] for p in parsed if p["side"] == "credit"]

            locked_txn.journal_entry = entry
            locked_txn.match_status = "classified"
            locked_txn.category_account_debit = debit_codes[0] if debit_codes else ""
            locked_txn.category_account_credit = credit_codes[0] if credit_codes else ""
            locked_txn.match_details = {
                **(locked_txn.match_details or {}),
                "manual_dk": {
                    "created": True,
                    "journal_entry_id": entry.id,
                    "lines": [
                        {"side": p["side"], "code": p["account_code"], "amount": str(p["amount"])}
                        for p in parsed
                    ],
                },
            }
            locked_txn.save(update_fields=[
                "journal_entry", "match_status",
                "category_account_debit", "category_account_credit",
                "match_details", "updated_at",
            ])

            logger.info(
                "[BankDK] Created DK #%s for txn %s (%s lines, D=%s K=%s)",
                entry.id, locked_txn.id, len(parsed), total_debit, total_credit,
            )

            self._handle_template(
                parsed, locked_txn, direction,
                save_as_template, template_name, template_id,
            )

            return entry

    def _handle_template(self, parsed, txn, direction,
                         save_as_template, template_name, template_id):
        """Išsaugo naują šabloną arba pažymi panaudotą."""
        from ..models import UserDKTemplate

        if template_id:
            try:
                tpl = UserDKTemplate.objects.get(
                    id=template_id, user=self.user, is_active=True,
                )
                tpl.mark_used()
            except UserDKTemplate.DoesNotExist:
                pass
            return

        if not save_as_template or not template_name.strip():
            return
        if not self.company_profile:
            return

        bank_code, _ = self._resolve_bank_account(txn)

        name = template_name.strip()[:120]
        if UserDKTemplate.objects.filter(
            company_profile=self.company_profile, name=name,
        ).exists():
            logger.info("[BankDK] Template '%s' already exists, skipping", name)
            return

        own_lines = [
            p for p in parsed
            if p["account_code"] != bank_code and p["account_code"] != "6810"
        ]
        if not own_lines:
            logger.info("[BankDK] Template '%s' has no own lines, skipping", name)
            return

        UserDKTemplate.objects.create(
            user=self.user,
            company_profile=self.company_profile,
            name=name,
            direction=direction or "both",
            # Šablone saugom tik "savo" sąskaitas. Banko eilutė ir komisinis
            # kiekvienai operacijai skiriasi — juos generuojam iš naujo.
            lines=[{
                "side": p["side"],
                "code": p["account_code"],
                "name": p["account_name"],
                "amount_mode": "full",
            } for p in parsed
              if p["account_code"] != bank_code and p["account_code"] != "6810"],
            times_used=1,
        )
        logger.info("[BankDK] Saved template '%s' for profile %s",
                    name, self.company_profile_id if hasattr(self, "company_profile_id") else self.company_profile.id)
    # ── Helpers ──────────────────────────────────────────

    def _resolve_bank_account(self, txn):
        """Nustatyti banko sąskaitos kodą ir pavadinimą iš išrašo."""
        stmt = getattr(txn, "bank_statement", None)
        iban = getattr(stmt, "account_iban", "") if stmt else ""
        bank_name = getattr(stmt, "bank_name", "") if stmt else ""
        currency = getattr(stmt, "currency", "") if stmt else ""

        code = "2711"
        name = "Bankas"

        if self.company_profile and hasattr(self.company_profile, "get_bank_chart_account"):
            try:
                info = self.company_profile.get_bank_chart_account(
                    iban=iban, bank_name=bank_name,
                    currency=currency or txn.currency,
                )
                if isinstance(info, dict) and info.get("account"):
                    code = str(info["account"])
                if isinstance(info, dict) and info.get("label"):
                    name = str(info["label"])
            except Exception:
                pass

        if name == "Bankas" and bank_name:
            name = bank_name.upper()
            if currency:
                name = f"{name} {currency}"

        return code, name[:255]

    @staticmethod
    def _build_description(txn):
        name = txn.counterparty_name or ""
        purpose = (txn.payment_purpose or "").strip()

        if name:
            return name[:255]
        if purpose:
            return purpose[:255]
        return f"Banko operacija #{txn.id}"