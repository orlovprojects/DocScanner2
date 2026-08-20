"""
Policy банковских транзакций.

Classifier отвечает: ЧТО это за транзакция.
Policy отвечает: ЧТО с этой категорией делать.

Если категория пустая — пробуем обычный matching по направлению:
    incoming -> Invoice
    outgoing -> Purchase

Если категория известна, но policy для неё не объявлена —
автоматический matching НЕ запускаем. Это fail-safe:
новая категория не должна случайно привязаться к документу.
"""


CATEGORY_POLICIES = {
    # ── Обычные оплаты документов ──────────────────────────
    "customer_receipt": {
        "requires_document": True,
        "document_type": "invoice",
    },

    "supplier_payment": {
        "requires_document": True,
        "document_type": "purchase",
    },

    # ── Shopify sale → должна искать pardavimo SF ─────────
    "shopify_pardavimas": {
        "requires_document": True,
        "document_type": "invoice",
    },

    # ── Без документа → сразу DK ───────────────────────────
    "bank_fee": {
        "requires_document": False,
        "auto_create_je": True,
        "journal": {
            "debit_account": "6880",
            "debit_name": "Banko mokesčiai",
            "description": "Banko mokestis",
        },
    },

    "tax_vmi": {
        "requires_document": False,
        "auto_create_je": True,
        "journal": {
            "debit_account": "4481",
            "debit_name": "Mokėtini mokesčiai VMI",
            "description": "VMI įmoka",
        },
    },

    "tax_sodra": {
        "requires_document": False,
        "auto_create_je": True,
        "journal": {
            "debit_account": "4482",
            "debit_name": "Mokėtina Sodra",
            "description": "Sodra įmoka",
        },
    },

    "salary": {
        "requires_document": False,
        "auto_create_je": True,
        "journal": {
            # фактический account может быть переопределён classifier/rule
            "debit_account": "4491",
            "debit_name": "Mokėtinas darbo užmokestis",
            "description": "Darbo užmokesčio išmokėjimas",
        },
    },

    # ── Специальный handler: D bankas / K pinigai kelyje ──
    "provider_payout": {
        "requires_document": False,
        "auto_create_je": False,
        "handler": "aggregator_payout",
    },

    "payment_reversal": {
        "requires_document": False,
        "auto_create_je": False,
        "handler": "payment_reversal",
    },

    "chargeback": {
        "requires_document": False,
        "auto_create_je": False,
        "handler": "payment_reversal",
    },

    "payment_refund": {
        "requires_document": False,
        "auto_create_je": False,
        "handler": "payment_refund",
    },

    "paypal_card_funding": {
        "requires_document": False,
        "auto_create_je": False,
        "handler": "internal_transfer",
    },
}


def get_category_policy(category: str) -> dict:
    return CATEGORY_POLICIES.get(category or "", {})


def should_try_document_match(txn, direction: str) -> bool:
    """
    Нужно ли эту bank transaction отправлять в document matching.

    direction:
        incoming -> Invoice
        outgoing -> Purchase
    """
    category = txn.transaction_category or ""

    # Не смогли классифицировать — всё ещё пробуем обычный
    # matching по направлению.
    if not category:
        return True

    policy = get_category_policy(category)

    # Категория существует, но developer ещё не описал её поведение.
    # Безопаснее НЕ делать автоматический document matching.
    if not policy:
        return False

    if not policy.get("requires_document", False):
        return False

    expected = policy.get("document_type")

    if direction == "incoming":
        return expected == "invoice"

    if direction == "outgoing":
        return expected == "purchase"

    return False


def get_direct_journal_categories() -> dict:
    """
    Config для BankCategoryJournalBuilder.
    Один source of truth — CATEGORY_POLICIES.
    """
    result = {}

    for category, policy in CATEGORY_POLICIES.items():
        if (
            not policy.get("requires_document", False)
            and policy.get("auto_create_je", False)
            and policy.get("journal")
        ):
            result[category] = dict(policy["journal"])

    return result