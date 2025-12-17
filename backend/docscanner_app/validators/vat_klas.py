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
    doc_96_str: bool = False,                 # документ по 96 str
) -> str | None:
    """
    Возвращает ТОЛЬКО:
      - PVM-код ("PVM1", "PVM13", ...)
      - None — когда данных недостаточно/условия не выполняются

    doc_96_str=True:
      21% -> PVM25
      9%  -> PVM26
      5%  -> PVM27
    """
    if separate_vat:
        return "Keli skirtingi PVM"

    # --------- ВАЖНО: спец-коды для pirkimas (с fallback на PVM1/2/3) ---------
    # Эти правила применяем ТОЛЬКО если хватает данных определить, что это IČP/RC.
    # Если данных не хватает (нет стран/непонятно preke/paslauga и т.п.), мы НЕ лезем сюда,
    # и дальше сработает обычный fallback на PVM1/2/3 по ставке.

    kind = _normalize_supply_kind(preke_paslauga)

    if (
        vat_percent in (21, 21.0, 9, 9.0, 5, 5.0)
        and pirkimas_pardavimas == "pirkimas"
        and buyer_country_iso == "LT"
        and buyer_country_iso is not None
        and seller_country_iso is not None
        and kind is not None
    ):
        seller_in_eu = seller_country_iso in EU_COUNTRIES

        # IČP: prekių pirkimas iš ES (ne 0%) -> PVM16/17/18
        if kind == "preke" and seller_in_eu and seller_country_iso != "LT":
            if vat_percent in (21, 21.0): return "PVM16"
            if vat_percent in (9,  9.0):  return "PVM17"
            if vat_percent in (5,  5.0):  return "PVM18"

        # Paslaugos pirkimas (RC) su 21%:
        # - iš ES -> PVM21
        # - iš ne ES -> PVM20
        if kind == "paslauga" and seller_country_iso != "LT" and vat_percent in (21, 21.0):
            return "PVM21" if seller_in_eu else "PVM20"

    # --------- Обычные фиксированные ставки (fallback) ---------
    if vat_percent in (21, 21.0):
        return "PVM25" if doc_96_str else "PVM1"
    if vat_percent in (9,  9.0):
        return "PVM26" if doc_96_str else "PVM2"
    if vat_percent in (5,  5.0):
        return "PVM27" if doc_96_str else "PVM3"
    if vat_percent in (6,  6.0):
        return "PVM49"

    # --------- 0% / be PVM — нужна доп.инфа ---------
    if vat_percent in (0, 0.0):
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
                if seller_in_eu and seller_country_iso != "LT": return "PVM13"  # IČP (как у тебя было)
                if (not seller_in_eu) and seller_country_iso != "LT": return "PVM12"  # импорт

        if kind == "paslauga":
            # pardavimas: LT -> EU B2B (0%) -> PVM15 (по твоему правилу)
            if pirkimas_pardavimas == "pardavimas" and seller_country_iso == "LT":
                if buyer_country_iso == "LT": return "PVM5"
                if buyer_in_eu and buyer_country_iso != "LT":
                    # 0% B2B услуг в ЕС нужен VAT-код покупателя
                    return "PVM15" if buyer_has_vat_code is True else None
                if (not buyer_in_eu) and buyer_country_iso != "LT":
                    return "PVM14"  # как у тебя было

            # pirkimas: услуги в LT
            if pirkimas_pardavimas == "pirkimas" and buyer_country_iso == "LT":
                if seller_country_iso == "LT": return "PVM5"
                if seller_in_eu and seller_country_iso != "LT":
                    return "PVM21"  # pirkimas из ЕС (0% ветка как у тебя)
                if (not seller_in_eu) and seller_country_iso != "LT":
                    return "PVM14"  # как у тебя было

    return None






# EU_COUNTRIES = {
#     "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR",
#     "DE","GR","HU","IE","IT","LV","LT","LU","MT","NL",
#     "PL","PT","RO","SK","SI","ES","SE"
# }

# def _normalize_supply_kind(preke_paslauga) -> str | None:
#     """
#     Вход: 1/2/3/4 (int или "1".."4" строкой).
#     Выход: "preke" | "paslauga" | None.
#     1 -> preke; 3 -> kodas-prekė -> preke
#     2 -> paslauga; 4 -> kodas-paslauga -> paslauga
#     """
#     if preke_paslauga is None:
#         return None
#     v = preke_paslauga
#     if isinstance(v, str):
#         v = v.strip()
#         if not v.isdigit(): 
#             return None
#         v = int(v)
#     if v in (1, 3): return "preke"
#     if v in (2, 4): return "paslauga"
#     return None


# def auto_select_pvm_code(
#     pirkimas_pardavimas: str | None,     # "pirkimas" | "pardavimas"
#     buyer_country_iso: str | None,
#     seller_country_iso: str | None,
#     preke_paslauga: int | str | None,    # 1/2/3/4
#     vat_percent: float | int | None,
#     separate_vat: bool = False,
#     buyer_has_vat_code: bool | None = None,   # важно для SALES в ЕС (0% товары/услуги)
#     seller_has_vat_code: bool | None = None,  # опционально, пока не используем
#     doc_96_str: bool = False,                 # документ по 96 str
# ) -> str | None:
#     """
#     Возвращает ТОЛЬКО:
#       - PVM-код ("PVM1", "PVM13", ...)
#       - None — когда данных недостаточно/условия не выполняются

#     doc_96_str=True:
#       21% -> PVM25
#       9%  -> PVM26
#       5%  -> PVM27
#     """
#     if separate_vat:
#         return "Keli skirtingi PVM"

#     # фиксированные ставки
#     if vat_percent in (21, 21.0):
#         return "PVM25" if doc_96_str else "PVM1"
#     if vat_percent in (9,  9.0):
#         return "PVM26" if doc_96_str else "PVM2"
#     if vat_percent in (5,  5.0):
#         return "PVM27" if doc_96_str else "PVM3"
#     if vat_percent in (6,  6.0):
#         return "PVM49"

#     # 0% / be PVM — нужна доп.инфа
#     if vat_percent in (0, 0.0):
#         kind = _normalize_supply_kind(preke_paslauga)
#         if not kind or not buyer_country_iso or not seller_country_iso or pirkimas_pardavimas not in ("pirkimas","pardavimas"):
#             return None

#         buyer_in_eu  = buyer_country_iso in EU_COUNTRIES
#         seller_in_eu = seller_country_iso in EU_COUNTRIES

#         if kind == "preke":
#             if pirkimas_pardavimas == "pardavimas" and seller_country_iso == "LT":
#                 if buyer_country_iso == "LT": return "PVM5"
#                 if buyer_in_eu and buyer_country_iso != "LT":
#                     # для 0% intra-EU sale товара нужен VAT-код покупателя
#                     return "PVM13" if buyer_has_vat_code is True else None
#                 if (not buyer_in_eu) and buyer_country_iso != "LT":
#                     return "PVM12"  # экспорт
#             if pirkimas_pardavimas == "pirkimas" and buyer_country_iso == "LT":
#                 if seller_country_iso == "LT": return "PVM5"
#                 if seller_in_eu and seller_country_iso != "LT": return "PVM13"  # IČP
#                 if (not seller_in_eu) and seller_country_iso != "LT": return "PVM12"  # импорт

#         # if kind == "paslauga":
#         #     if pirkimas_pardavimas == "pardavimas" and seller_country_iso == "LT":
#         #         if buyer_country_iso == "LT": return "PVM5"
#         #         if buyer_in_eu and buyer_country_iso != "LT":
#         #             # для 0% B2B услуг в ЕС нужен VAT-код покупателя
#         #             return "PVM21" if buyer_has_vat_code is True else None
#         #         if (not buyer_in_eu) and buyer_country_iso != "LT":
#         #             return "PVM14"  # экспорт услуг
#         #     if pirkimas_pardavimas == "pirkimas" and buyer_country_iso == "LT":
#         #         if seller_country_iso == "LT": return "PVM5"
#         #         if seller_in_eu and seller_country_iso != "LT": return "PVM21"  # услуги из ЕС (RC)
#         #         if (not seller_in_eu) and seller_country_iso != "LT": return "PVM14"  # услуги из не ЕС (RC)

#         if kind == "paslauga":
#             if pirkimas_pardavimas == "pardavimas" and seller_country_iso == "LT":
#                 if buyer_country_iso == "LT": return "PVM5"
#                 if buyer_in_eu and buyer_country_iso != "LT":
#                     # 0% B2B услуг в ЕС нужен VAT-код покупателя
#                     return "PVM15" if buyer_has_vat_code is True else None
#                 if (not buyer_in_eu) and buyer_country_iso != "LT":
#                     return "PVM14"  # экспорт услуг

#             if pirkimas_pardavimas == "pirkimas" and buyer_country_iso == "LT":
#                 if seller_country_iso == "LT": return "PVM5"
#                 if seller_in_eu and seller_country_iso != "LT":
#                     return "PVM21"  # было PVM21, стало PVM15
#                 if (not seller_in_eu) and seller_country_iso != "LT":
#                     return "PVM14"  # услуги из не ЕС (RC)

#     return None


