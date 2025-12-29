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
            {"error": "Неверный price_id для покупки кредитов"},
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













# Stripe subscriptions, ne one-time payment

# from rest_framework.decorators import api_view, permission_classes
# from rest_framework.permissions import IsAuthenticated, AllowAny
# from django.conf import settings
# from rest_framework.response import Response
# from rest_framework import status
# import stripe
# from django_ratelimit.decorators import ratelimit
# from .create_stripe_customer import create_stripe_customer

# # STRIPE_SECRET_KEY iz settings.py
# stripe.api_key = settings.STRIPE_SECRET_KEY

# # Funkcija dlia sozdanija Stripe sessii (checkout) dlia pokupki subscriptionsa


# @api_view(['POST'])
# @permission_classes([IsAuthenticated])  # Только аутентифицированные пользователи
# def StripeCheckoutView(request):
#     try:
#         user = request.user  # Получаем текущего пользователя

#         # Проверяем или создаём Stripe клиента
#         if not user.stripe_customer_id:
#             stripe_customer_id = create_stripe_customer(user)
#         else:
#             stripe_customer_id = user.stripe_customer_id

#         # Получаем price_id из запроса
#         price_id = request.data.get("price_id")
#         if not price_id:
#             return Response(
#                 {"error": "Price ID is required"},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         # Создаём Stripe Checkout сессию
#         checkout_session = stripe.checkout.Session.create(
#             customer=stripe_customer_id,  # Привязываем сессию к пользователю
#             line_items=[
#                 {
#                     'price': price_id,
#                     'quantity': 1,
#                 },
#             ],
#             mode='subscription',
#             success_url=settings.SITE_URL + '/dashboard/?success=true&session_id={CHECKOUT_SESSION_ID}',
#             cancel_url=settings.SITE_URL + '/subscribe/?canceled=true',
#         )

#         return Response({"url": checkout_session.url})

#     except Exception as e:
#         return Response(
#             {"error": str(e)},
#             status=status.HTTP_500_INTERNAL_SERVER_ERROR
#         )

