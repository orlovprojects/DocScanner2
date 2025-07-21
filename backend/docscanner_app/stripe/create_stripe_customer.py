import stripe
from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.decorators import api_view, permission_classes
from django.views.decorators.csrf import csrf_exempt

stripe.api_key = settings.STRIPE_SECRET_KEY

@csrf_exempt
@permission_classes([AllowAny])
def create_stripe_customer(user):
    """
    Создание клиента в Stripe и сохранение stripe_customer_id в CustomUser.
    """
    # Создание клиента в Stripe
    customer = stripe.Customer.create(
        email=user.email,  # Используем email вместо username
        name=f"{user.first_name} {user.last_name}".strip() or user.email,  # Имя или email, если имя пустое
        metadata={"user_id": user.id}  # Привязка Stripe Customer к ID пользователя
    )

    # Сохранение Stripe Customer ID в модели CustomUser
    user.stripe_customer_id = customer['id']
    user.save()
    return customer['id']