import re
from typing import Optional

# Минимальный whitelisted-набор ISO-4217 (на случай если LLM уже вернул "USD"/"EUR" и т.п.)
ISO3 = {
    "USD","EUR","GBP","RUB","JPY","CNY","KRW","INR","TRY","VND","ILS","PHP",
    "NGN","CRC","PYG","LAK","GHS","KZT","AZN","UAH","BRL","AUD","CAD","NZD",
    "HKD","SGD","TWD","MXN","CZK","PLN","BGN","ZAR","CHF","SEK","NOK","DKK","ISK"
}

# Простая таблица символов (однозначные)
SYMBOL_MAP = {
    "€": "EUR",
    "£": "GBP",
    "₽": "RUB",
    "¥": "JPY",   # по умолчанию считаем JPY
    "₩": "KRW",
    "₹": "INR",
    "₺": "TRY",
    "₫": "VND",
    "₪": "ILS",
    "₱": "PHP",
    "₦": "NGN",
    "₡": "CRC",
    "₲": "PYG",
    "₭": "LAK",
    "₵": "GHS",
    "₸": "KZT",
    "₼": "AZN",
    "₴": "UAH",
}

# Префиксы вида "C$" / "CA$" -> CAD, и др. безопасные варианты
PREFIX_MAP = {
    "C$": "CAD",
    "CA$": "CAD",
    "A$": "AUD",     # если не нужен — можно удалить
    "AU$": "AUD",    # если не нужен — можно удалить
    "NZ$": "NZD",    # если не нужен — можно удалить
    "HK$": "HKD",    # если не нужен — можно удалить
    "S$": "SGD",     # если не нужен — можно удалить
    "NT$": "TWD",    # если не нужен — можно удалить
    "MX$": "MXN",    # если не нужен — можно удалить
    "R$": "BRL",     # бразильский реал
    "US$": "USD",    # иногда так приходит
}

def to_iso_currency(value: Optional[str]) -> Optional[str]:
    """
    Преобразует символ/префикс/код в ISO-4217 (3 буквы).
    Упрощённая логика:
      - '$' -> 'USD'
      - 'C$' или 'CA$' -> 'CAD'
      - известные символы из SYMBOL_MAP -> их ISO
      - префиксы из PREFIX_MAP -> их ISO
      - если уже 3-буквенный ISO из списка, возвращаем как есть
      - иначе — возвращаем исходное значение (или None, если value пустое)
    """
    if not value:
        return None

    s = value.strip()

    # Уже ISO?
    u = re.sub(r"\s+", "", s).upper()
    if len(u) == 3 and u in ISO3:
        return u

    # Явные префиксы (регистр учитываем только для букв, $ не трогаем)
    # Проверим сначала точное совпадение с нашими ключами в разных регистрах
    for k, iso in PREFIX_MAP.items():
        if u == k.upper():
            return iso

    # Однозначные unicode-символы
    if s in SYMBOL_MAP:
        return SYMBOL_MAP[s]

    # Специальные правила
    if s == "$":
        return "USD"

    # Ничего не определили — вернем как есть (без ломки потока)
    return s