from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import stripe
from datetime import datetime
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Установите секретный ключ Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_subscription(request):
    try:
        user = request.user
        logger.info(f"Attempting to cancel subscription for user: {user.id}")

        if not user.stripe_customer_id:
            logger.error("User does not have a Stripe customer ID.")
            return Response({"error": "User does not have a Stripe customer ID."}, status=status.HTTP_400_BAD_REQUEST)

        subscriptions = stripe.Subscription.list(customer=user.stripe_customer_id, status='active')

        if not subscriptions['data']:
            return Response({"error": "No active subscription found."}, status=status.HTTP_400_BAD_REQUEST)

        subscription_id = subscriptions['data'][0]['id']

        canceled_subscription = stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        logger.info(f"Subscription canceled: {canceled_subscription}")

        user.subscription_status = 'canceled'
        user.subscription_end_date = datetime.fromtimestamp(canceled_subscription['current_period_end'])
        user.save()

        return Response({
            "message": "Subscription cancellation scheduled at the end of the current period.",
            "subscription_end_date": user.subscription_end_date
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Error during subscription cancellation: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_subscription_info(request):
    try:
        # Получить текущего пользователя
        user = request.user

        # Проверить, есть ли необходимые данные в модели пользователя
        if not hasattr(user, 'email') or not hasattr(user, 'subscription_status') or not hasattr(user, 'subscription_plan') or not hasattr(user, 'subscription_end_date'):
            return Response({"error": "User model is missing required fields."}, status=status.HTTP_400_BAD_REQUEST)

        # Преобразовать дату окончания подписки в формат только с датой (без времени)
        subscription_end_date = None
        if user.subscription_end_date:
            subscription_end_date = user.subscription_end_date.strftime('%Y-%m-%d')

        # Подготовить данные для ответа
        user_data = {
            "email": user.email,
            "subscription_status": user.subscription_status,
            "subscription_plan": user.subscription_plan,
            "subscription_end_date": subscription_end_date,
        }

        return Response(user_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
