"""
invoicing/services/payment_providers.py
=======================================
Абстрактный провайдер + реализации Montonio и Paysera.

pip install PyJWT requests
"""

import abc
import base64
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from urllib.parse import urlencode, parse_qs

import jwt
import requests as http_requests
from django.conf import settings

from .encryption import encrypt_value, decrypt_value

logger = logging.getLogger("docscanner_app")


# ────────────────────────────────────────────────────────────
# Data classes
# ────────────────────────────────────────────────────────────

@dataclass
class PaymentLinkResult:
    """Результат создания payment link."""
    url: str
    provider_payment_id: str
    raw_response: dict = field(default_factory=dict)


@dataclass
class WebhookResult:
    """Результат обработки webhook."""
    success: bool
    payment_id: str
    merchant_reference: str          # наш invoice ID
    amount: Decimal
    currency: str = "EUR"
    payer_name: str = ""
    payer_email: str = ""
    raw_data: dict = field(default_factory=dict)


# ────────────────────────────────────────────────────────────
# Abstract provider
# ────────────────────────────────────────────────────────────

class BasePaymentProvider(abc.ABC):
    """Базовый класс для всех провайдеров payment links."""

    name: str = ""
    display_name: str = ""

    # Какие поля нужны для настройки (для фронтенда)
    config_fields: list[dict] = []

    def __init__(self, provider_config: dict):
        self.config = provider_config

    @abc.abstractmethod
    def create_payment_link(
        self,
        invoice_id: int,
        amount: Decimal,
        currency: str,
        description: str,
        due_date: datetime | None = None,
        buyer_email: str = "",
        buyer_name: str = "",
        notification_url: str = "",
        return_url: str = "",
    ) -> PaymentLinkResult:
        ...

    @abc.abstractmethod
    def verify_webhook(self, request_data: dict) -> WebhookResult:
        ...

    @abc.abstractmethod
    def test_connection(self) -> bool:
        ...

    def _decrypt(self, key: str) -> str:
        """Дешифруем секрет из конфига."""
        return decrypt_value(self.config.get(key, ""))


# ────────────────────────────────────────────────────────────
# Montonio
# ────────────────────────────────────────────────────────────

class MontonioProvider(BasePaymentProvider):
    """
    Montonio Stargate API — Payment Links.
    https://docs.montonio.com/api/stargate/guides/payment-links

    Auth: JWT (HS256) подписанный secret_key мерчанта.
    """

    name = "montonio"
    display_name = "Montonio"
    config_fields = [
        {"key": "access_key", "label": "Access Key", "type": "text"},
        {"key": "secret_key", "label": "Secret Key", "type": "password"},
        {"key": "environment", "label": "Aplinka", "type": "select",
         "options": [("sandbox", "Sandbox (testavimas)"), ("production", "Production")]},
    ]

    SANDBOX_URL = "https://sandbox-stargate.montonio.com/api"
    PRODUCTION_URL = "https://stargate.montonio.com/api"

    @property
    def base_url(self):
        env = self.config.get("environment", "sandbox")
        return self.SANDBOX_URL if env == "sandbox" else self.PRODUCTION_URL

    @property
    def access_key(self):
        return self.config.get("access_key", "")

    @property
    def secret_key(self):
        return self._decrypt("secret_key")

    def _make_jwt(self, payload: dict) -> str:
        now = datetime.utcnow()
        payload.update({
            "accessKey": self.access_key,
            "iat": now,
            "exp": now + timedelta(minutes=10),
        })
        return jwt.encode(payload, self.secret_key, algorithm="HS256")

    def create_payment_link(
        self,
        invoice_id: int,
        amount: Decimal,
        currency: str,
        description: str,
        due_date: datetime | None = None,
        buyer_email: str = "",
        buyer_name: str = "",
        notification_url: str = "",
        return_url: str = "",
    ) -> PaymentLinkResult:

        # expiresAt обязателен — если нет due_date, ставим +30 дней
        expires = due_date or (datetime.utcnow() + timedelta(days=30))

        payload = {
            "amount": float(amount),
            "currency": currency,
            "description": description,
            "locale": "lt",
            "expiresAt": expires.isoformat(),
            "askAdditionalInfo": True,
            "type": "one_time",
            "merchantReference": str(invoice_id),
        }
        if return_url:
            payload["returnUrl"] = return_url
        if notification_url:
            payload["notificationUrl"] = notification_url

        token = self._make_jwt(payload)

        resp = http_requests.post(
            f"{self.base_url}/payment-links",
            json={"data": token},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )

        if resp.status_code >= 400:
            logger.error(
                "[Montonio] payment-link FAILED: status=%s body=%s",
                resp.status_code, resp.text[:1000],
            )
            raise ValueError(f"Montonio: {resp.status_code} — {resp.text[:500]}")

        data = resp.json()

        logger.info(
            "Montonio payment link created: invoice=%s url=%s",
            invoice_id,
            data.get("url", data.get("paymentUrl", ""))[:80],
        )

        return PaymentLinkResult(
            url=data.get("url") or data.get("paymentUrl", ""),
            provider_payment_id=data.get("uuid", ""),
            raw_response=data,
        )

    def verify_webhook(self, request_data: dict) -> WebhookResult:
        token = (
            request_data.get("payment_token")
            or request_data.get("orderToken")
            or ""
        )
        if not token:
            logger.warning("[Montonio Webhook] No token in request_data")
            return WebhookResult(
                success=False, payment_id="", merchant_reference="",
                amount=Decimal("0"),
            )

        try:
            decoded = jwt.decode(token, self.secret_key, algorithms=["HS256"])
        except jwt.InvalidTokenError as e:
            logger.warning("[Montonio Webhook] Invalid JWT: %s", e)
            return WebhookResult(
                success=False, payment_id="", merchant_reference="",
                amount=Decimal("0"),
            )

        status = decoded.get("paymentStatus", decoded.get("status", ""))
        is_finalized = status in ("finalized", "PAID")

        logger.info(
            "[Montonio Webhook] Decoded: status=%s, uuid=%s, ref=%s, amount=%s, currency=%s",
            status,
            decoded.get("uuid", ""),
            decoded.get("merchantReference", ""),
            decoded.get("grandTotal", decoded.get("amount", 0)),
            decoded.get("currency", "EUR"),
        )

        if not is_finalized:
            logger.info("[Montonio Webhook] Not finalized (status=%s)", status)

        return WebhookResult(
            success=is_finalized,
            payment_id=decoded.get("uuid", decoded.get("payment_uuid", "")),
            merchant_reference=decoded.get(
                "merchantReference", decoded.get("merchant_reference", "")
            ),
            amount=Decimal(
                str(decoded.get("grandTotal", decoded.get("amount", 0)))
            ),
            currency=decoded.get("currency", "EUR"),
            payer_name=(
                f"{decoded.get('customerFirstName', '')} "
                f"{decoded.get('customerLastName', '')}"
            ).strip(),
            payer_email=decoded.get("customerEmail", ""),
            raw_data=decoded,
        )

    def test_connection(self) -> bool:
        try:
            token = self._make_jwt({})
            resp = http_requests.get(
                f"{self.base_url}/stores/payment-methods",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.info("Montonio test_connection failed: %s", e)
            return False


# ────────────────────────────────────────────────────────────
# Paysera
# ────────────────────────────────────────────────────────────

class PayseraProvider(BasePaymentProvider):
    """
    Paysera payment links (libwebtopay protocol).
    https://developers.paysera.com/en/payments/current

    Auth: project_id + sign_password (MD5 подпись).

    ВАЖНО: У Paysera нет рабочего sandbox.
    Тестирование идёт на production URL с параметром test=1.
    """

    name = "paysera"
    display_name = "Paysera"
    config_fields = [
        {"key": "project_id", "label": "Projekto ID", "type": "text"},
        {"key": "sign_password", "label": "Parašo slaptažodis", "type": "password"},
        {"key": "environment", "label": "Aplinka", "type": "select",
         "options": [("sandbox", "Sandbox (testavimas)"), ("production", "Production")]},
    ]

    # Всегда production URL — тестирование через test=1 параметр
    PAY_URL = "https://www.paysera.com/pay/"

    @property
    def project_id(self):
        return self.config.get("project_id", "")

    @property
    def sign_password(self):
        return self._decrypt("sign_password")

    @property
    def is_test(self):
        return self.config.get("environment", "production") != "production"

    def _sign(self, data_base64: str) -> str:
        return hashlib.md5((data_base64 + self.sign_password).encode()).hexdigest()

    def create_payment_link(
        self,
        invoice_id: int,
        amount: Decimal,
        currency: str,
        description: str,
        due_date: datetime | None = None,
        buyer_email: str = "",
        buyer_name: str = "",
        notification_url: str = "",
        return_url: str = "",
    ) -> PaymentLinkResult:

        fallback_url = f"{settings.SITE_URL_FRONTEND}/israsymas/saskaitos"

        params = {
            "projectid": self.project_id,
            "orderid": str(invoice_id),
            "amount": str(int(amount * 100)),   # центы
            "currency": currency,
            "country": "LT",
            "accepturl": return_url or fallback_url,
            "cancelurl": return_url or fallback_url,
            "callbackurl": notification_url,
            "paytext": description[:255],
            "test": "1" if self.is_test else "0",
            "version": "1.6",
        }
        if buyer_email:
            params["p_email"] = buyer_email
        if buyer_name:
            parts = buyer_name.split(" ", 1)
            params["p_firstname"] = parts[0]
            if len(parts) > 1:
                params["p_lastname"] = parts[1]

        data_str = urlencode(params)
        data_b64 = base64.urlsafe_b64encode(data_str.encode()).decode()
        sign = self._sign(data_b64)

        # Всегда production URL — test=1 в параметрах включает тестовый режим
        payment_url = f"{self.PAY_URL}?data={data_b64}&sign={sign}"

        logger.info("Paysera payment link created: invoice=%s", invoice_id)

        return PaymentLinkResult(
            url=payment_url,
            provider_payment_id=str(invoice_id),
        )

    def verify_webhook(self, request_data: dict) -> WebhookResult:
        data_b64 = request_data.get("data", "")
        ss1 = request_data.get("ss1", "")

        # Verify signature
        expected = self._sign(data_b64)

        logger.info(
            "[Paysera Webhook] data=%s..., ss1=%s, expected=%s, match=%s",
            data_b64[:40], ss1, expected, ss1 == expected,
        )

        if ss1 != expected:
            logger.warning("[Paysera Webhook] Signature mismatch!")
            return WebhookResult(
                success=False, payment_id="", merchant_reference="",
                amount=Decimal("0"),
            )

        # Decode
        decoded_str = base64.urlsafe_b64decode(data_b64).decode()
        params = parse_qs(decoded_str)

        def first(key, default=""):
            vals = params.get(key, [default])
            return vals[0] if vals else default

        status = first("status")
        is_success = status in ("1", "3")

        logger.info(
            "[Paysera Webhook] Decoded: status=%s, orderid=%s, amount=%s, currency=%s, requestid=%s",
            status, first("orderid"), first("amount", "0"), first("currency", "EUR"), first("requestid"),
        )

        if not is_success:
            logger.info("[Paysera Webhook] Not successful (status=%s)", status)

        return WebhookResult(
            success=is_success,
            payment_id=first("requestid"),
            merchant_reference=first("orderid"),
            amount=Decimal(first("amount", "0")) / 100,
            currency=first("currency", "EUR"),
            payer_name=f"{first('name')} {first('surename')}".strip(),
            payer_email=first("p_email"),
            raw_data=dict(params),
        )

    def test_connection(self) -> bool:
        return bool(self.project_id and self.sign_password)


# ────────────────────────────────────────────────────────────
# Registry
# ────────────────────────────────────────────────────────────

PROVIDER_REGISTRY: dict[str, type[BasePaymentProvider]] = {
    "montonio": MontonioProvider,
    "paysera": PayseraProvider,
    # "seb_paylink": SebPayLinkProvider,
}