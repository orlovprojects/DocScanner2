"""
invoicing/services/payment_link_service.py
==========================================
Фасад: создание ссылок, обработка webhook, вспомогательные методы.
"""

import logging
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from django.conf import settings

from .encryption import encrypt_value
from .payment_providers import (
    PROVIDER_REGISTRY,
    BasePaymentProvider,
    PaymentLinkResult,
)

logger = logging.getLogger("docscanner_app")


class PaymentLinkService:
    """
    Использование:
        service = PaymentLinkService(request.user)
        result = service.create_for_invoice(invoice, "montonio")
    """

    def __init__(self, user):
        self.user = user
        self._providers_config = user.payment_providers or {}

    # ── Provider access ──────────────────────────────────────

    def get_provider(self, name: str) -> BasePaymentProvider:
        cls = PROVIDER_REGISTRY.get(name)
        if not cls:
            raise ValueError(f"Nežinomas teikėjas: {name}")

        config = self._providers_config.get(name, {})
        if not config:
            raise ValueError(f"Teikėjas \"{name}\" nesukonfigūruotas")

        return cls(config)

    def get_available_providers(self) -> list[dict]:
        """Для dropdown в InvoiceEditorPage."""
        result = []
        for name, config in self._providers_config.items():
            if name in PROVIDER_REGISTRY:
                last_test = config.get("last_test_result", {})
                if last_test.get("connected"):
                    cls = PROVIDER_REGISTRY[name]
                    result.append({
                        "name": name,
                        "display_name": cls.display_name,
                    })
        return result

    # ── Create payment link ──────────────────────────────────

    def create_for_invoice(self, invoice, provider_name: str) -> PaymentLinkResult:
        provider = self.get_provider(provider_name)

        # Webhook URL — публичный, без auth
        webhook_url = (
            f"{settings.SITE_URL_BACKEND}/api/invoicing/"
            f"payment-webhook/{provider_name}/{invoice.id}/"
        )

        # Return URL после оплаты — публичная страница счёта
        return_url = (
            f"{getattr(settings, 'INVOICE_PUBLIC_URL', 'https://saskaituisrasymas.lt')}/sf/{invoice.uuid}/"
        )

        # Описание
        description = f"Sąskaita faktūra {invoice.full_number}"

        result = provider.create_payment_link(
            invoice_id=invoice.id,
            amount=invoice.amount_with_vat,
            currency=getattr(invoice, "currency", "EUR") or "EUR",
            description=description,
            due_date=getattr(invoice, "due_date", None),
            buyer_email=getattr(invoice, "buyer_email", "") or "",
            buyer_name=getattr(invoice, "buyer_name", "") or "",
            notification_url=webhook_url,
            return_url=return_url,
        )

        # Сохраняем в Invoice
        invoice.payment_link_url = result.url
        invoice.payment_link_provider = provider_name
        invoice.payment_link_provider_id = result.provider_payment_id
        invoice.payment_link_created_at = timezone.now()
        invoice.save(update_fields=[
            "payment_link_url",
            "payment_link_provider",
            "payment_link_provider_id",
            "payment_link_created_at",
        ])

        return result

    # ── Webhook handling ─────────────────────────────────────

    @staticmethod
    def handle_webhook(provider_name: str, invoice_id: int, request_data: dict):
        """
        Вызывается из webhook view.
        Находит invoice → user → provider config → verify → create transaction.
        """
        from ..models import Invoice
        from ..models import IncomingTransaction, PaymentAllocation

        # 1. Находим invoice и владельца
        try:
            invoice = Invoice.objects.select_related("user").get(id=invoice_id)
        except Invoice.DoesNotExist:
            logger.warning("Webhook: invoice %s not found", invoice_id)
            return None

        user = invoice.user

        # 2. Инстанциируем провайдер с ключами владельца
        config = (user.payment_providers or {}).get(provider_name, {})
        cls = PROVIDER_REGISTRY.get(provider_name)
        if not cls:
            logger.warning("Webhook: unknown provider %s", provider_name)
            return None

        provider = cls(config)

        # 3. Верифицируем
        result = provider.verify_webhook(request_data)

        if not result.success:
            logger.info(
                "Webhook: payment not finalized, provider=%s invoice=%s",
                provider_name, invoice_id,
            )
            return None

        # 4. Создаём IncomingTransaction
        txn = IncomingTransaction(
            user=user,
            source="payment_link",
            transaction_date=timezone.now().date(),
            counterparty_name=result.payer_name or getattr(invoice, "buyer_name", "") or "",
            counterparty_code="",
            payment_purpose=f"Apmokėjimas pagal sąskaitą {invoice.full_number}",
            amount=result.amount,
            currency=result.currency,
            provider_name=provider_name,
            provider_payment_id=result.payment_id,
        )
        txn.transaction_hash = txn.compute_hash()

        # Дедупликация — повторный webhook
        if IncomingTransaction.objects.filter(transaction_hash=txn.transaction_hash).exists():
            logger.info("Webhook: duplicate, hash=%s", txn.transaction_hash[:16])
            return None

        txn.match_status = "auto_matched"
        txn.match_confidence = Decimal("1.00")
        txn.allocated_amount = result.amount
        txn.save()

        # 5. Создаём PaymentAllocation
        allocation = PaymentAllocation.objects.create(
            incoming_transaction=txn,
            invoice=invoice,
            source="payment_link",
            status="confirmed",
            amount=result.amount,
            payment_date=timezone.now().date(),
            confidence=Decimal("1.00"),
            match_reasons={
                "method": "payment_link",
                "provider": provider_name,
                "provider_payment_id": result.payment_id,
            },
            confirmed_at=timezone.now(),
        )

        # 6. Обновляем статус Invoice
        total_paid = (
            invoice.payment_allocations
            .filter(status__in=["confirmed", "auto"])
            .aggregate(t=Sum("amount"))["t"]
        ) or Decimal("0")

        if total_paid >= invoice.amount_with_vat:
            invoice.status = "paid"
            invoice.save(update_fields=["status"])
            logger.info("Invoice %s marked as paid via %s", invoice_id, provider_name)

        return allocation

    # ── Save provider settings ───────────────────────────────

    @staticmethod
    def save_provider_config(user, provider_name: str, data: dict):
        """
        Сохраняет настройки провайдера в user.payment_providers.
        Шифрует секретные поля.
        Сохраняет мета-поля (last_test_result, available_methods, environment).
        """
        if provider_name not in PROVIDER_REGISTRY:
            raise ValueError(f"Nežinomas teikėjas: {provider_name}")

        providers = user.payment_providers or {}
        current = providers.get(provider_name, {})

        new_config = {}

        # Определяем какие поля секретные
        secret_fields = _get_secret_fields(provider_name)

        cls = PROVIDER_REGISTRY[provider_name]
        for field_def in cls.config_fields:
            key = field_def["key"]
            incoming = data.get(key, "")

            if key in secret_fields:
                # Не перезаписываем если пришла маска
                if incoming and incoming != "••••••••":
                    new_config[key] = encrypt_value(incoming)
                else:
                    new_config[key] = current.get(key, "")
            else:
                new_config[key] = incoming or current.get(key, "")

        # ── Meta fields — save as-is, don't encrypt ──────────
        META_FIELDS = ("last_test_result", "available_methods", "environment")
        for meta_key in META_FIELDS:
            if meta_key in data:
                new_config[meta_key] = data[meta_key]
            elif meta_key in current:
                new_config[meta_key] = current[meta_key]

        providers[provider_name] = new_config
        user.payment_providers = providers
        user.save(update_fields=["payment_providers"])


def _get_secret_fields(provider_name: str) -> set[str]:
    return {
        "montonio": {"secret_key"},
        "paysera": {"sign_password"},
    }.get(provider_name, set())