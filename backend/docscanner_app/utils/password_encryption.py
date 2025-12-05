from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken


def _get_fernet():
    """
    Возвращает Fernet-объект, использующий ключ из settings.CRYPTOGRAPHY_ENCRYPTION_KEY.
    Ключ должен быть base64-строкой, как выдаёт Fernet.generate_key().
    """
    key = getattr(settings, "CRYPTOGRAPHY_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("CRYPTOGRAPHY_ENCRYPTION_KEY is not configured")

    # key у нас строка из env → кодируем в bytes
    return Fernet(key.encode("utf-8"))


def encrypt_password(raw_password):
    """
    Шифрует пароль и возвращает строку-токен (str),
    которую можно безопасно хранить в БД/JSON.
    """
    if not raw_password:
        return ""
    f = _get_fernet()
    token = f.encrypt(raw_password.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_password(token):
    """
    Расшифровывает токен. Если токен пустой/битый, возвращает None.
    """
    if not token:
        return None

    f = _get_fernet()
    try:
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None