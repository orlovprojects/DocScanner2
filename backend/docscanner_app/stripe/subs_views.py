import logging
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.conf import settings
from rest_framework.response import Response
from rest_framework import status
import stripe
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, HttpResponseBadRequest
from django.contrib.auth import get_user_model

from .create_stripe_customer import create_stripe_customer
from ..models import Payments

logger = logging.getLogger("docscanner_app")

stripe.api_key = settings.STRIPE_SECRET_KEY


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def StripeCreditCheckoutView(request):
    """
    Создаёт Stripe Checkout Session в режиме разового платежа (mode='payment')
    для покупки пакетов кредитов.
    """
    user = request.user

    # Убедимся, что в Stripe есть customer_id
    if not user.stripe_customer_id:
        user.stripe_customer_id = create_stripe_customer(user)
        user.save()

    price_id = request.data.get("price_id")
    # Опционально: можно здесь же маппить price_id → credits
    PRICE_CREDITS_MAP = {
        'price_1RfxUWIaJDydaLBY6Y3MGrBj': 100,
        'price_1RfxWUIaJDydaLBYJomOA1FD': 500,
        'price_1RfxY1IaJDydaLBY4YXDNSAO': 1000,
        'price_1SjdLJIaJDydaLBYKixOTMNc': 5000,
        'price_1SjdMMIaJDydaLBYAMXtAUra': 10000,
    }
    credits = PRICE_CREDITS_MAP.get(price_id)
    if credits is None:
        return Response(
            {"error": "Neteisingas price_id"},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        session = stripe.checkout.Session.create(
            customer=user.stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='payment',  # именно разовый платёж
            success_url=f"{settings.SITE_URL_FRONTEND}/suvestine/?success=true&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.SITE_URL_FRONTEND}/papildyti/?canceled=true",
            metadata={
                'user_id': str(user.id),
                'credits': str(credits),
            }
        )
        return Response({"url": session.url})
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )




@api_view(['POST'])
@permission_classes([IsAuthenticated])
def inv_subscribe_checkout(request):
    """POST /api/inv/subscribe-checkout/"""
    from ..models import InvSubscription
    from .create_stripe_customer import create_stripe_customer

    user = request.user

    sub = InvSubscription.objects.filter(user=user).first()
    if sub and sub.status == "active":
        return Response({"error": "Jau turite aktyvų PRO planą."}, status=status.HTTP_400_BAD_REQUEST)

    if not user.stripe_customer_id:
        create_stripe_customer(user)

    try:
        billing = request.data.get("billing", "yearly")
        if billing == "yearly":
            price_id = settings.STRIPE_INV_PRO_YEARLY_PRICE_ID
        else:
            price_id = settings.STRIPE_INV_PRO_PRICE_ID

        if not price_id:
            return Response({"error": "Plano kaina nesukonfigūruota."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        session = stripe.checkout.Session.create(
            customer=user.stripe_customer_id,
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{
                "price": price_id,
                "quantity": 1,
            }],
            success_url=f"{settings.SITE_URL_FRONTEND}/papildyti?inv_success=true",
            cancel_url=f"{settings.SITE_URL_FRONTEND}/papildyti?inv_canceled=true",
            metadata={
                "user_id": str(user.id),
                "type": "inv_subscription",
            },
            subscription_data={
                "metadata": {
                    "user_id": str(user.id),
                    "type": "inv_subscription",
                },
            },
        )
        return Response({"url": session.url})
    except Exception as e:
        logger.error("[InvCheckout] Error: %s", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def inv_payment_history(request):
    """GET /api/inv/payments/"""
    payments = Payments.objects.filter(
        user=request.user,
        payment_type="inv_subscription",
    )
    data = [{
        "id": p.id,
        "dok_number": p.dok_number,
        "amount": round(p.amount_total / 100, 2),
        "currency": p.currency.upper(),
        "status": p.payment_status,
        "plan": p.plan,
        "period_start": p.period_start,
        "period_end": p.period_end,
        "invoice_pdf_url": p.invoice_pdf_url,
        "created_at": p.created_at.isoformat(),
    } for p in payments]
    return Response(data)


