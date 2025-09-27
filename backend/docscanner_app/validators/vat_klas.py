EU_COUNTRIES = {
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR",
    "DE","GR","HU","IE","IT","LV","LT","LU","MT","NL",
    "PL","PT","RO","SK","SI","ES","SE"
}

def _normalize_supply_kind(preke_paslauga) -> str | None:
    """
    Вход: 1/2/3/4 (int или "1".."4" строкой).
    Выход: "preke" | "paslauga" | None.
    1 -> preke; 3 -> kodas-prekė -> preke
    2 -> paslauga; 4 -> kodas-paslauga -> paslauga
    """
    if preke_paslauga is None:
        return None
    v = preke_paslauga
    if isinstance(v, str):
        v = v.strip()
        if not v.isdigit(): 
            return None
        v = int(v)
    if v in (1, 3): return "preke"
    if v in (2, 4): return "paslauga"
    return None

def auto_select_pvm_code(
    pirkimas_pardavimas: str | None,     # "pirkimas" | "pardavimas"
    buyer_country_iso: str | None,
    seller_country_iso: str | None,
    preke_paslauga: int | str | None,    # 1/2/3/4
    vat_percent: float | int | None,
    separate_vat: bool = False,
    buyer_has_vat_code: bool | None = None,   # важно для SALES в ЕС (0% товары/услуги)
    seller_has_vat_code: bool | None = None,  # опционально, пока не используем
) -> str | None:
    """
    Возвращает ТОЛЬКО:
      - PVM-код ("PVM1", "PVM13", ...) — когда правила однозначны
      - None — когда данных недостаточно/условия не выполняются
    НИКАКИХ UI-строк.
    """
    if separate_vat:
        return "Keli skirtingi PVM"

    # фиксированные ставки
    if vat_percent in (21, 21.0): return "PVM1"
    if vat_percent in (9,  9.0):  return "PVM2"
    if vat_percent in (5,  5.0):  return "PVM3"
    if vat_percent in (6,  6.0):  return "PVM49"

    # 0% / be PVM — нужна доп.инфа
    if vat_percent in (0, 0.0):
        kind = _normalize_supply_kind(preke_paslauga)
        if not kind or not buyer_country_iso or not seller_country_iso or pirkimas_pardavimas not in ("pirkimas","pardavimas"):
            return None

        buyer_in_eu  = buyer_country_iso in EU_COUNTRIES
        seller_in_eu = seller_country_iso in EU_COUNTRIES

        if kind == "preke":
            if pirkimas_pardavimas == "pardavimas" and seller_country_iso == "LT":
                if buyer_country_iso == "LT": return "PVM5"
                if buyer_in_eu and buyer_country_iso != "LT":
                    # для 0% intra-EU sale товара нужен VAT-код покупателя
                    return "PVM13" if buyer_has_vat_code is True else None
                if (not buyer_in_eu) and buyer_country_iso != "LT":
                    return "PVM12"  # экспорт
            if pirkimas_pardavimas == "pirkimas" and buyer_country_iso == "LT":
                if seller_country_iso == "LT": return "PVM5"
                if seller_in_eu and seller_country_iso != "LT": return "PVM13"  # IČP
                if (not seller_in_eu) and seller_country_iso != "LT": return "PVM12"  # импорт

        if kind == "paslauga":
            if pirkimas_pardavimas == "pardavimas" and seller_country_iso == "LT":
                if buyer_country_iso == "LT": return "PVM5"
                if buyer_in_eu and buyer_country_iso != "LT":
                    # для 0% B2B услуг в ЕС нужен VAT-код покупателя
                    return "PVM21" if buyer_has_vat_code is True else None
                if (not buyer_in_eu) and buyer_country_iso != "LT":
                    return "PVM14"  # экспорт услуг
            if pirkimas_pardavimas == "pirkimas" and buyer_country_iso == "LT":
                if seller_country_iso == "LT": return "PVM5"
                if seller_in_eu and seller_country_iso != "LT": return "PVM21"  # услуги из ЕС (RC)
                if (not seller_in_eu) and seller_country_iso != "LT": return "PVM14"  # услуги из не ЕС (RC)

    return None

