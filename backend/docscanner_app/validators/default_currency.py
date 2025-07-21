def set_default_currency(currency):
    """
    Возвращает валюту, если задана, иначе 'EUR'.
    """
    if not currency or str(currency).strip().lower() in ("", "none", "null"):
        return "EUR"
    return str(currency).strip()