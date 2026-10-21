"""Slaptažodžių (web service) šifravimas: Fernet, raktas iš settings.CRYPTOGRAPHY_ENCRYPTION_KEY."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


def _fernet(key=None):
    if key is None:
        from django.conf import settings
        key = getattr(settings, "CRYPTOGRAPHY_ENCRYPTION_KEY", "") or settings.SECRET_KEY
    raw = key.encode() if isinstance(key, str) else key
    try:
        return Fernet(raw)                       # jau tinkamas Fernet raktas
    except (ValueError, TypeError):
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw).digest()))  # išvedamas iš bet kokios eilutės


def encrypt(text, key=None):
    return _fernet(key).encrypt(text.encode()).decode() if text else ""


def decrypt(token, key=None):
    if not token:
        return ""
    try:
        return _fernet(key).decrypt(token.encode()).decode()
    except InvalidToken:
        return ""
