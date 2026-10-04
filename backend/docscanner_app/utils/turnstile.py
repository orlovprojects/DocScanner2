import logging
import requests
from django.conf import settings

logger = logging.getLogger("docscanner_app")


def get_real_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[-1].strip()
    return request.META.get("REMOTE_ADDR")


def verify_turnstile(token, ip):
    if not token:
        return False
    try:
        r = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": settings.TURNSTILE_SECRET, "response": token, "remoteip": ip},
            timeout=5,
        )
        return r.json().get("success", False)
    except Exception as e:
        logger.error(f"Turnstile klaida: {e}")
        return False