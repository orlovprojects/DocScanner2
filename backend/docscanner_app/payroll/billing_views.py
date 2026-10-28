import logging

from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import billing
from .views import PayrollCompanyMixin

logger = logging.getLogger("docscanner_app")


class PayrollSubscriptionView(PayrollCompanyMixin, APIView):
    """GET - DU plano būsena; POST {action: start_trial | checkout | cancel | resume | portal}."""

    def get(self, request):
        return Response(billing.payroll_access(self.get_company()))

    def post(self, request):
        company = self.get_company()
        action = request.data.get("action")
        try:
            if action == "start_trial":
                return Response(billing.start_trial(company))
            if action == "checkout":
                return Response({"url": billing.create_checkout(company, request.user)})
            if action == "cancel":
                return Response(billing.cancel_subscription(company))
            if action == "resume":
                return Response(billing.resume_subscription(company))
            if action == "portal":
                return Response({"url": billing.create_portal(company, request.user)})
        except ValueError as e:
            raise ValidationError(str(e))
        except Exception:
            logger.exception("DU planas: %s nepavyko (įmonė %s)", action, company.id)
            raise ValidationError("Mokėjimų sistema šiuo metu nepasiekiama – pabandykite vėliau")
        raise ValidationError("Nežinomas veiksmas")


@method_decorator(csrf_exempt, name="dispatch")
class StripeDuWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            billing.handle_webhook(request.body, request.META.get("HTTP_STRIPE_SIGNATURE", ""))
        except Exception:
            logger.exception("Stripe DU webhook klaida")
            return HttpResponse(status=400)
        return HttpResponse(status=200)
