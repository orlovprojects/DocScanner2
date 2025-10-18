# views.py
import logging
import stripe
from django.conf import settings
from django.db import transaction, IntegrityError
from django.http import HttpResponse, HttpResponseBadRequest
from datetime import datetime, timezone as dt_timezone
from django.utils import timezone

from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model

from ..models import Payments 

logger = logging.getLogger(__name__)
stripe.api_key = settings.STRIPE_SECRET_KEY

# price_id → сколько кредитов покупать
PRICE_CREDITS_MAP = {
    # примеры: подставь свои значения
    "price_1RfxUWIaJDydaLBY6Y3MGrBj": 100,
    "price_1RfxWUIaJDydaLBYJomOA1FD": 500,
    "price_1RfxY1IaJDydaLBY4YXDNSAO": 1000,
}

def _calc_credits_from_line_items(session) -> int:
    credits = 0
    line_items = (session.get("line_items") or {}).get("data") or []
    for li in line_items:
        price = li.get("price") or {}
        price_id = price.get("id")
        qty = li.get("quantity") or 1
        if price_id in PRICE_CREDITS_MAP:
            credits += PRICE_CREDITS_MAP[price_id] * int(qty)
    return credits

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def StripeWebhookView(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
    endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

    # 1) Проверка подписи
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except ValueError:
        return HttpResponseBadRequest("Invalid payload")
    except stripe.error.SignatureVerificationError:
        return HttpResponseBadRequest("Invalid signature")

    evt_type = event.get("type")
    evt_id = event.get("id")

    # 2) Идемпотентность: если уже сохранили этот event → выходим
    if evt_id and Payments.objects.filter(stripe_event_id=evt_id).exists():
        return HttpResponse(status=200)

    if evt_type != "checkout.session.completed":
        # другие типы можно игнорировать или логировать
        return HttpResponse(status=200)

    raw_session = event["data"]["object"]

    # 3) Добираем всё нужное одним запросом
    try:
        session = stripe.checkout.Session.retrieve(
            raw_session["id"],
            expand=[
                "line_items.data.price.product",
                "payment_intent.charges.data.balance_transaction",
            ],
        )
    except Exception as e:
        logger.exception("Stripe retrieve Session failed: %s", e)
        # Пусть Stripe повторит попытку
        return HttpResponse(status=500)

    # 4) Проверяем, что оплата реально прошла
    if session.get("payment_status") != "paid":
        return HttpResponse(status=200)

    # 5) Ищем пользователя: сперва по customer, потом по metadata.user_id
    User = get_user_model()
    user = None
    customer_id = session.get("customer")
    if customer_id:
        try:
            user = User.objects.get(stripe_customer_id=customer_id)
        except User.DoesNotExist:
            user = None

    if not user:
        md = session.get("metadata") or {}
        uid = md.get("user_id")
        if uid:
            try:
                user = User.objects.get(id=uid)
            except User.DoesNotExist:
                user = None

    if not user:
        logger.error("Stripe webhook: user not found for customer=%s metadata.user_id=%s", customer_id, (session.get("metadata") or {}).get("user_id"))
        return HttpResponse(status=200)

    # 6) Суммы/валюта/покупатель
    amount_subtotal = int(session.get("amount_subtotal") or 0)
    amount_total = int(session.get("amount_total") or 0)
    amount_tax = int((session.get("total_details") or {}).get("amount_tax") or 0)
    currency = session.get("currency") or "eur"

    buyer = session.get("customer_details") or {}
    buyer_email = buyer.get("email")
    buyer_address = buyer.get("address") or {}

    # 7) Charge / баланс-транзакция (комиссия, нетто, receipt)
    receipt_url = None
    stripe_fee = 0
    net_amount = 0
    pi = session.get("payment_intent")
    charge = None

    # expand вернёт dict
    if isinstance(pi, dict):
        charges = (pi.get("charges") or {}).get("data") or []
        if charges:
            charge = charges[0]
            receipt_url = charge.get("receipt_url")
            bt = charge.get("balance_transaction")
            if isinstance(bt, dict):
                stripe_fee = int(bt.get("fee") or 0)
                net_amount = int(bt.get("net") or 0)

    # 8) Считаем кредиты по price_id (надёжно). Если 0 — фолбэк на metadata.credits
    credits = _calc_credits_from_line_items(session)
    if credits <= 0:
        md = session.get("metadata") or {}
        try:
            credits = int(md.get("credits") or 0)
        except (TypeError, ValueError):
            credits = 0

    # 9) Атомарно: начислить кредиты + создать Payments
    paid_at_ts = session.get("created")
    paid_at = (
    datetime.fromtimestamp(paid_at_ts, tz=dt_timezone.utc)   # aware UTC datetime
    if paid_at_ts else timezone.now()
    )

    try:
        with transaction.atomic():
            # двойная защита от дублей: проверим снова в транзакции
            if evt_id and Payments.objects.select_for_update().filter(stripe_event_id=evt_id).exists():
                return HttpResponse(status=200)

            # начисляем кредиты только если есть что начислять
            if credits > 0:
                u = User.objects.select_for_update().get(pk=user.pk)
                u.credits = (u.credits or 0) + credits
                u.save(update_fields=["credits"])

            # берём первую позицию для хранения price_id/product_id (по желанию)
            price_id = None
            product_id = None
            quantity = 1
            lis = (session.get("line_items") or {}).get("data") or []
            if lis:
                first = lis[0]
                price = first.get("price") or {}
                price_id = price.get("id")
                prod = price.get("product")
                if isinstance(prod, dict):
                    product_id = prod.get("id")
                quantity = int(first.get("quantity") or 1)

            Payments.objects.create(
                user=user,
                stripe_event_id=event["id"],
                session_id=session["id"],
                payment_intent_id=(pi.get("id") if isinstance(pi, dict) else pi),
                customer_id=customer_id,

                amount_subtotal=amount_subtotal,
                amount_tax=amount_tax,
                amount_total=amount_total,
                stripe_fee=stripe_fee,
                net_amount=(net_amount or (amount_total - stripe_fee)),
                currency=currency,

                credits_purchased=credits,

                buyer_email=buyer_email,
                buyer_address_json=buyer_address,

                payment_status=session.get("payment_status", "paid"),
                paid_at=paid_at,

                receipt_url=receipt_url,
            )

    except IntegrityError:
        # на случай гонки по unique(stripe_event_id)
        return HttpResponse(status=200)
    except Exception as e:
        logger.exception("Stripe webhook processing failed: %s", e)
        # дайте Stripe повторить попытку
        return HttpResponse(status=500)

    return HttpResponse(status=200)






# import stripe
# from django.conf import settings
# from django.http import HttpResponse, HttpResponseBadRequest
# from django.views.decorators.csrf import csrf_exempt
# from rest_framework.decorators import api_view, permission_classes
# from rest_framework.permissions import AllowAny
# from django.contrib.auth import get_user_model

# # Инициализируем ключ
# stripe.api_key = settings.STRIPE_SECRET_KEY

# @csrf_exempt
# @api_view(['POST'])
# @permission_classes([AllowAny])
# def StripeWebhookView(request):
#     """
#     Обработчик webhook’ов Stripe: слушаем checkout.session.completed
#     и зачисляем кредиты пользователю.
#     """
#     payload = request.body
#     sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')
#     endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

#     # Проверка подписи
#     try:
#         event = stripe.Webhook.construct_event(
#             payload, sig_header, endpoint_secret
#         )
#     except ValueError:
#         return HttpResponseBadRequest("Invalid payload")
#     except stripe.error.SignatureVerificationError:
#         return HttpResponseBadRequest("Invalid signature")

#     # Если сессия успешно оплачена — добавляем кредиты
#     if event['type'] == 'checkout.session.completed':
#         session = event['data']['object']
#         metadata = session.get('metadata', {})
#         user_id = metadata.get('user_id')
#         credits = int(metadata.get('credits', 0))

#         if user_id and credits > 0:
#             User = get_user_model()
#             try:
#                 user = User.objects.get(id=user_id)
#                 user.credits = (user.credits or 0) + credits
#                 user.save()
#             except User.DoesNotExist:
#                 # Здесь можете логировать или уведомлять админа
#                 pass

#     return HttpResponse(status=200)