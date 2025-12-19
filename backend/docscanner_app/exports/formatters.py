import re

def format_date_agnum(d):
    """
    Форматирует дату для AGNUM XML в формате YYYY-MM-DD.
    Принимает: date, datetime, str или None.
    Возвращает: строку 'YYYY-MM-DD' или None.
    """
    if d is None:
        return None
    if isinstance(d, str):
        # Если уже строка, пытаемся нормализовать
        d_clean = d.strip()
        if not d_clean or d_clean == '1900-01-01':
            return d_clean
        # Конвертируем точки в дефисы, если есть
        return d_clean.replace('.', '-')
    # Для date/datetime объектов
    try:
        return d.strftime('%Y-%m-%d')
    except AttributeError:
        return None


def format_date(date_obj):
    return date_obj.strftime("%Y.%m.%d") if date_obj else ""


def format_date_iso(date_obj):
    """
    Формат даты для Apskaita5 (xsd:date) -> YYYY-MM-DD
    """
    return date_obj.strftime("%Y-%m-%d") if date_obj else ""


def vat_to_int_str(val):
    try:
        if val is None or str(val).strip() == "":
            return "0"
        if float(val) == 0:
            return "0"
        return str(int(float(val)))
    except Exception:
        return "0"

def get_price_or_zero(val):
    try:
        if val is None or str(val).strip() == "":
            return "0.00"
        val_f = float(val)
        if val_f == 0:
            return "0.00"
        return f"{val_f:.2f}"
    except Exception:
        return "0.00"
    

def expand_empty_tags(xml_bytes: bytes) -> bytes:
    """
    Разворачивает самозакрывающиеся теги <tag .../> -> <tag ...></tag>.
    Работает ПО БАЙТАМ, не декодируя строку, чтобы не зависеть от кодировки
    (UTF-8, Windows-1257 и т.п.).
    """
    # \w в bytes-режиме — ASCII-символы [A-Za-z0-9_], что для имён тегов достаточно
    pattern = re.compile(br"<(\w+)([^/>]*?)\s*/>")
    return pattern.sub(br"<\1\2></\1>", xml_bytes)


COUNTRY_NAME_LT = {
    "LT": "Lietuva",
    "AD": "Andora",
    "AE": "Jungtiniai Arabų Emyratai",
    "AF": "Afganistanas",
    "AG": "Antigva ir Barbuda",
    "AI": "Angilija",
    "AL": "Albanija",
    "AM": "Armėnija",
    "AO": "Angola",
    "AQ": "Antarktida",
    "AR": "Argentina",
    "AS": "Samoa",
    "AT": "Austrija",
    "AU": "Australija",
    "AW": "Aruba",
    "AZ": "Azerbaidžanas",
    "BA": "Bosnija ir Hercegovina",
    "BB": "Barbadosas",
    "BD": "Bangladešas",
    "BE": "Belgija",
    "BF": "Burkina Fasas",
    "BG": "Bulgarija",
    "BH": "Bahreinas",
    "BI": "Burundis",
    "BY": "Baltarusija",
    "BJ": "Beninas",
    "BL": "Sen Bartelemi",
    "BM": "Bermudai",
    "BN": "Brunėjus",
    "BO": "Bolivija",
    "BQ": "Boneras, Sint Eustatijus ir Saba",
    "BR": "Brazilija",
    "BS": "Bahamos",
    "BT": "Butanas",
    "BV": "Bouvet sala",
    "BW": "Botsvana",
    "BZ": "Belizas",
    "CA": "Kanada",
    "CC": "Kokosų (Kilingo) Salos",
    "CD": "Kongo Demokratinė Respublika",
    "CF": "Centrinės Afrikos Respublika",
    "CG": "Kongas",
    "CH": "Šveicarija",
    "CI": "Dramblio Kaulo Krantas",
    "CY": "Kipras",
    "CK": "Kuko salos",
    "CL": "Čilė",
    "CM": "Kamerūnas",
    "CN": "Kinija",
    "CO": "Kolumbija",
    "CR": "Kosta Rika",
    "CU": "Kuba",
    "CV": "Žaliasis Kyšulys",
    "CW": "Kiurasao",
    "CX": "Kalėdų sala",
    "CZ": "Čekija",
    "DE": "Vokietija",
    "DJ": "Džibutis",
    "DK": "Danija",
    "DM": "Dominika",
    "DO": "Dominikos Respublika",
    "DZ": "Alžyras",
    "EC": "Ekvadoras",
    "EE": "Estija",
    "EG": "Egiptas",
    "EH": "Vakarų Sachara",
    "ER": "Eritrėja",
    "ES": "Ispanija",
    "ET": "Etiopija",
    "EU": "Europos Sąjunga",
    "FI": "Suomija",
    "FJ": "Fidžis",
    "FK": "Folklando Salos",
    "FM": "Mikronezijos Federacines Valstijos",
    "FO": "Farerų salos",
    "FR": "Prancūzija",
    "GA": "Gabonas",
    "GB": "Didžioji Britanija",
    "GD": "Grenada",
    "GE": "Gruzija",
    "GH": "Gana",
    "GI": "Gibraltaras",
    "GY": "Gajana",
    "GL": "Grenlandija",
    "GM": "Gambija",
    "GN": "Gvinėja",
    "GQ": "Pusiaujo Gvinėja",
    "GR": "Graikija",
    "GS": "Pietų Džordžijos ir Pietų Sendvičo Salos",
    "GT": "Gvatemala",
    "GU": "Guamas",
    "GW": "Bisau Gvinėja",
    "HK": "Honkongas",
    "HM": "Heardo ir Mc Donaldo salos",
    "HN": "Hondūras",
    "HR": "Kroatija",
    "HT": "Haitis",
    "HU": "Vengrija",
    "ID": "Indonezija",
    "IE": "Airija",
    "YE": "Jemenas",
    "IL": "Izraelis",
    "IN": "Indija",
    "IO": "Indijos Vandenyno Britu Sritis",
    "IQ": "Irakas",
    "IR": "Irano Islamo Respublika",
    "IS": "Islandija",
    "IT": "Italija",
    "YT": "Mayotte'as",
    "JM": "Jamaika",
    "JO": "Jordanija",
    "JP": "Japonija",
    "KE": "Kenija",
    "KG": "Kirgizija",
    "KH": "Kambodža",
    "KI": "Kiribatis",
    "KY": "Kaimanų salos",
    "KM": "Komorai",
    "KN": "Sent Kitsas ir Nevis",
    "KP": "Šiaurės Korėja",
    "KR": "Pietų Korėja",
    "KW": "Kuveitas",
    "KZ": "Kazachstanas",
    "LA": "Laosas",
    "LB": "Libanas",
    "LC": "Sent Lusija",
    "LI": "Lichtenšteinas",
    "LY": "Libija",
    "LK": "Šri Lanka",
    "LR": "Liberija",
    "LS": "Lesotas",
    "LU": "Liuksemburgas",
    "LV": "Latvija",
    "MA": "Marokas",
    "MD": "Moldavija, Moldovos Respublika",
    "ME": "Juodkalnija",
    "MG": "Madagaskaras",
    "MH": "Maršalo Salos",
    "MY": "Malaizija",
    "MK": "Makedonija",
    "ML": "Malis",
    "MM": "Mianmaras",
    "MN": "Mongolija",
    "MO": "Macao",
    "MP": "Marianos šiaurinės salos",
    "MR": "Mauritanija",
    "MS": "Montserratas",
    "MT": "Malta",
    "MU": "Mauricijus",
    "MV": "Maldyvai",
    "MW": "Malavis",
    "MX": "Meksika",
    "MZ": "Mozambikas",
    "NA": "Namibija",
    "NC": "Naujoji Kaledonija ir priklausoma teritorija",
    "NE": "Nigeris",
    "NF": "Norfolko sala",
    "NG": "Nigerija",
    "NI": "Nikaragva",
    "NL": "Olandija",
    "NO": "Norvegija",
    "NP": "Nepalas",
    "NR": "Nauru",
    "NU": "Niujė sala",
    "NZ": "Naujoji Zelandija",
    "OM": "Omanas",
    "PA": "Panama",
    "PE": "Peru",
    "PF": "Prancūzijos Polinezija",
    "PG": "Papua Naujoji Gvinėja",
    "PH": "Filipinai",
    "PY": "Paragvajus",
    "PK": "Pakistanas",
    "PL": "Lenkija",
    "PM": "Sent Pjeras ir Mikelonas",
    "PN": "Pitcairno salos",
    "PS": "Okupuota Palestinos teritorija",
    "PT": "Portugalija",
    "PW": "Palau",
    "QA": "Kataras",
    "QY": "Dėl prekybos ar karinių priežasčių vykdant ES vidaus prekybą nenurodytos šalys ir teritorijos",
    "QP": "Atvira jura (Jūrų sritis, nepriklausanti teritoriniams vandenims)",
    "QQ": "Aprūpinimas ir tiekimas",
    "QR": "Atsargos ir maisto atsargos, tiekiamos vykdant ES vidaus prekybą",
    "QS": "Aprūpinimas ir tiekimas trečiųjų šalių prekybos erdvėje",
    "QU": "Kitur nenurodytos valstybės ir teritorijos",
    "QV": "Šalys ir teritorijos, nenurodytos vykdant ES vidaus prekybą",
    "QW": "Valstybės ir teritorijos nenurodytos Trečiųjų salių prekybos erdvėje",
    "QX": "Valstybės ir teritorijos nenurodytos kaip skirtos komerciniams ir kariniams tikslams",
    "QZ": "QX Trečiųjų šalių prekybos erdvėje",
    "RO": "Rumunija",
    "RU": "Rusijos Federacija",
    "RW": "Ruanda",
    "SA": "Saudo Arabija",
    "SB": "Saliamono salos",
    "SC": "Seišeliai",
    "SD": "Sudanas",
    "SE": "Švedija",
    "SG": "Singapūras",
    "SH": "Šv. Elenos, Dangun Žengimo ir Tristano da Kunjos Salos",
    "SI": "Slovėnija",
    "SY": "Sirija",
    "SK": "Slovakija",
    "SL": "Siera Leonė",
    "SM": "San Marinas",
    "SN": "Senegalas",
    "SO": "Somalis",
    "SR": "Surinamas",
    "SS": "Pietu Sudanas",
    "ST": "San Tomė ir ir Prinsipė",
    "SV": "Salvadoras",
    "SX": "Sint Martenas (Nyderlandų dalis)",
    "SZ": "Svazilandas",
    "TC": "Turkso ir Caicoso salos",
    "TD": "Čadas",
    "TF": "Prancuzijos Pietu Sritys",
    "TG": "Togas",
    "TH": "Tailandas",
    "TJ": "Tadžikistanas",
    "TK": "Tokelau",
    "TL": "Rytų Timoras",
    "TM": "Turkmėnistanas",
    "TN": "Tunisas",
    "TO": "Tonga",
    "TR": "Turkija",
    "TT": "Trinidadas ir Tobagas",
    "TV": "Tuvalu",
    "TW": "Taivanas",
    "TZ": "Tanzanijos Jungtine Respublika",
    "UA": "Ukraina",
    "UG": "Uganda",
    "UY": "Urugvajus",
    "UM": "Jungtinių Valstijų aplinkinės smulkiosios salos (United States Minor outlying islands)",
    "US": "Jungtinės Valstijos, JAV",
    "UZ": "Uzbekistanas",
    "VA": "Vatikanas",
    "VC": "Sent Vinsentas ir Grenadinai",
    "VE": "Venesuela",
    "VG": "Didžiosios Britanijos Mergelių Salos",
    "VI": "Mergelių salos (JAV)",
    "VN": "Vietnamas",
    "VU": "Vanuatu",
    "WF": "Walliso ir Futunos salos",
    "WS": "Samoa",
    "XC": "Seuta",
    "XK": "Kosovas (Kaip nustatyta 1999 m. birželio 10d. Jungtinių Tautų Saugumo Tarybos rezoliucijoje Nr.1244)",
    "XL": "Melilija",
    "XS": "Serbija",
    "ZA": "Pietų Afrika",
    "ZM": "Zambija",
    "ZW": "Zimbabvė",
}