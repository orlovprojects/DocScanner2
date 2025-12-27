import urllib.parse
from django.conf import settings


def build_mobile_play_store_link(mobile_key: str) -> str:
    """
    Строит ссылку на Google Play с referrer, где внутри передаём mobile_key.
    Дальше мобильное приложение может вытащить этот referrer через
    Play Install Referrer API и сразу заполнить ключ.
    """
    package_name = getattr(settings, "DOKSKENAS_ANDROID_PACKAGE_NAME", "com.example.dokskenasscanner")

    base_url = "https://play.google.com/store/apps/details"
    referrer_value = f"mobile_key={mobile_key}"

    query = {
        "id": package_name,
        "referrer": referrer_value,
    }

    return f"{base_url}?{urllib.parse.urlencode(query)}"