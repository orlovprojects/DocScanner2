import stripe
from django.conf import settings
from django.http import HttpResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model

# Инициализируем ключ
stripe.api_key = settings.STRIPE_SECRET_KEY

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def StripeWebhookView(request):
    """
    Обработчик webhook’ов Stripe: слушаем checkout.session.completed
    и зачисляем кредиты пользователю.
    """
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')
    endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

    # Проверка подписи
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError:
        return HttpResponseBadRequest("Invalid payload")
    except stripe.error.SignatureVerificationError:
        return HttpResponseBadRequest("Invalid signature")

    # Если сессия успешно оплачена — добавляем кредиты
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        metadata = session.get('metadata', {})
        user_id = metadata.get('user_id')
        credits = int(metadata.get('credits', 0))

        if user_id and credits > 0:
            User = get_user_model()
            try:
                user = User.objects.get(id=user_id)
                user.credits = (user.credits or 0) + credits
                user.save()
            except User.DoesNotExist:
                # Здесь можете логировать или уведомлять админа
                pass

    return HttpResponse(status=200)