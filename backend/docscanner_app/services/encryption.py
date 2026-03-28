"""
invoicing/services/encryption.py
================================
Шифрование/дешифрование секретных ключей провайдеров.

settings.py:
    CRYPTOGRAPHY_ENCRYPTION_KEY = os.getenv("CRYPTOGRAPHY_ENCRYPTION_KEY", "")

.env:
    # Генерируем один раз:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    CRYPTOGRAPHY_ENCRYPTION_KEY=ваш-ключ-сюда

pip:
    pip install cryptography
"""

from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken


def _get_fernet():
    key = settings.CRYPTOGRAPHY_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "CRYPTOGRAPHY_ENCRYPTION_KEY is not set. "
            "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt_value(plaintext: str) -> str:
    """Шифруем строку → base64 token для хранения в БД."""
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str:
    """Дешифруем token обратно в строку."""
    if not token:
        return ""
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        # Fallback: возможно значение ещё не зашифровано (миграция, sandbox)
        return token