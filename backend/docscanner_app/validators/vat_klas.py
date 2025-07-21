def auto_select_pvm_code(
    scan_type,
    vat_percent,
    buyer_country_iso=None,
    seller_country_iso=None,
    separate_vat=False
):
    EU_COUNTRIES = {"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
                    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
                    "PL", "PT", "RO", "SK", "SI", "ES", "SE"}

    if separate_vat:
        return "Keli skirtingi PVM"

    if scan_type in ("sumiskai", "detaliai"):
        if vat_percent == 21:
            return "PVM1"
        if vat_percent == 9:
            return "PVM2"
        if vat_percent == 5:
            return "PVM3"
        if vat_percent == 6:
            return "PVM49"
        if vat_percent == 0:
            if buyer_country_iso == "LT" and seller_country_iso == "LT":
                return "PVM5"
            if buyer_country_iso in EU_COUNTRIES and seller_country_iso == "LT":
                return "PVM13"
            if buyer_country_iso not in EU_COUNTRIES and buyer_country_iso != "LT" and seller_country_iso == "LT":
                return "PVM12"
                # ДОБАВЬ: импорт в Литву из не ЕС
            if seller_country_iso not in EU_COUNTRIES and seller_country_iso != "LT" and buyer_country_iso == "LT":
                return "PVM12"
            if buyer_country_iso == "LT" and seller_country_iso in EU_COUNTRIES and seller_country_iso != "LT":
                return "PVM13"
    return ""