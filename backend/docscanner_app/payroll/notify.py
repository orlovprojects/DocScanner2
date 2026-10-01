"""Pranešimai administratoriui į Telegram (naudojami TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID iš settings)."""
import logging

import requests
from django.conf import settings

logger = logging.getLogger("docscanner_app")


def notify_admin(text):
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    chat = getattr(settings, "TELEGRAM_CHAT_ID", "")
    if not token or not chat:
        logger.warning("Telegram nesukonfigūruotas: %s", text[:200])
        return False
    try:
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                          data={"chat_id": chat, "text": text[:4000]}, timeout=10)
        return r.ok
    except requests.RequestException:
        logger.exception("Telegram pranešimas nenusiųstas")
        return False
