"""
DokSkenas — Suma žodžiais (LT / EN / PL / DE)

    amount_in_words(Decimal("1423.45"), "EUR", "lt")
    -> "Vienas tūkstantis keturi šimtai dvidešimt trys eurai keturiasdešimt penki centai"

Pagrindinė valiuta linksniuojama pagal kalbos gramatiką (giminė, skaičius, linksnis).
Smulkieji vienetai žodžiais rašomi tik ten, kur pavadinimas tikslus (EUR, USD, GBP, PLN),
kitur - "45/100". Nežinoma valiuta - ISO kodas.
Valiutoms be centų (ISO 4217: 0 skaitmenų, pvz. JPY) "00/100" nerašoma.
Neigiama suma (kreditinė) - su "minus".
"""

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

SUPPORTED_LANGS = ("lt", "en", "pl", "de")

# ISO 4217 valiutos be smulkiųjų vienetų
ZERO_DECIMAL_CURRENCIES = {
    "JPY", "KRW", "VND", "ISK", "CLP", "PYG", "UGX", "RWF", "BIF",
    "DJF", "GNF", "KMF", "VUV", "XAF", "XOF", "XPF",
}


def _fraction(cents, cur):
    """'45/100' arba '' (valiutai be centų, kai trupmenos nėra)."""
    if cents == 0 and cur in ZERO_DECIMAL_CURRENCIES:
        return ""
    return f"{cents:02d}/100"


def _split_triplets(n):
    groups = []
    while n > 0:
        n, g = divmod(n, 1000)
        groups.append(g)
    return groups or [0]


# ═══════════════════════════════════════════════════════════
# LT
# ═══════════════════════════════════════════════════════════
_LT_ONES_M = ["", "vienas", "du", "trys", "keturi", "penki", "šeši", "septyni", "aštuoni", "devyni"]
_LT_ONES_F = ["", "viena", "dvi", "trys", "keturios", "penkios", "šešios", "septynios", "aštuonios", "devynios"]
_LT_TEENS = [
    "dešimt", "vienuolika", "dvylika", "trylika", "keturiolika",
    "penkiolika", "šešiolika", "septyniolika", "aštuoniolika", "devyniolika",
]
_LT_TENS = [
    "", "", "dvidešimt", "trisdešimt", "keturiasdešimt", "penkiasdešimt",
    "šešiasdešimt", "septyniasdešimt", "aštuoniasdešimt", "devyniasdešimt",
]
# (vns. vardininkas, dgs. vardininkas, dgs. kilmininkas)
_LT_SCALES = [
    None,
    ("tūkstantis", "tūkstančiai", "tūkstančių"),
    ("milijonas", "milijonai", "milijonų"),
    ("milijardas", "milijardai", "milijardų"),
]


def _lt_form(n, forms):
    if n % 10 == 0 or 11 <= n % 100 <= 19:
        return forms[2]
    if n % 10 == 1:
        return forms[0]
    return forms[1]


def _lt_triplet(n, fem):
    ones = _LT_ONES_F if fem else _LT_ONES_M
    words = []
    h, rest = divmod(n, 100)
    if h == 1:
        words.append("šimtas")
    elif h > 1:
        words += [_LT_ONES_M[h], "šimtai"]
    if 10 <= rest <= 19:
        words.append(_LT_TEENS[rest - 10])
    else:
        t, o = divmod(rest, 10)
        if t:
            words.append(_LT_TENS[t])
        if o:
            words.append(ones[o])
    return words


def _lt_number(n, fem=False):
    if n == 0:
        return "nulis"
    words = []
    groups = _split_triplets(n)
    for idx in range(len(groups) - 1, -1, -1):
        g = groups[idx]
        if not g:
            continue
        if idx == 0:
            words += _lt_triplet(g, fem)
        else:
            words += _lt_triplet(g, False) + [_lt_form(g, _LT_SCALES[idx])]
    return " ".join(words)


# ISO: (pagrindinis, moteriška g., smulkus|None, smulkus moteriška g.)
_LT_CUR = {
    "EUR": (("euras", "eurai", "eurų"), False, ("centas", "centai", "centų"), False),
    "USD": (("JAV doleris", "JAV doleriai", "JAV dolerių"), False, ("centas", "centai", "centų"), False),
    "GBP": (("svaras sterlingų", "svarai sterlingų", "svarų sterlingų"), False, ("pensas", "pensai", "pensų"), False),
    "PLN": (("zlotas", "zlotai", "zlotų"), False, ("grašis", "grašiai", "grašių"), False),
    "CHF": (("Šveicarijos frankas", "Šveicarijos frankai", "Šveicarijos frankų"), False, None, False),
    "CZK": (("Čekijos krona", "Čekijos kronos", "Čekijos kronų"), True, None, False),
    "SEK": (("Švedijos krona", "Švedijos kronos", "Švedijos kronų"), True, None, False),
    "NOK": (("Norvegijos krona", "Norvegijos kronos", "Norvegijos kronų"), True, None, False),
    "DKK": (("Danijos krona", "Danijos kronos", "Danijos kronų"), True, None, False),
    "UAH": (("Ukrainos grivina", "Ukrainos grivinos", "Ukrainos grivinų"), True, None, False),
    "RUB": (("Rusijos rublis", "Rusijos rubliai", "Rusijos rublių"), False, None, False),
    "BGN": (("Bulgarijos levas", "Bulgarijos levai", "Bulgarijos levų"), False, None, False),
    "RON": (("Rumunijos lėja", "Rumunijos lėjos", "Rumunijos lėjų"), True, None, False),
    "HUF": (("Vengrijos forintas", "Vengrijos forintai", "Vengrijos forintų"), False, None, False),
}


def _lt(units, cents, cur):
    major, major_f, minor, minor_f = _LT_CUR.get(cur, (None, False, None, False))
    out = _lt_number(units, major_f) + " " + (_lt_form(units, major) if major else cur)
    if minor:
        out += " " + _lt_number(cents, minor_f) + " " + _lt_form(cents, minor)
    else:
        frac = _fraction(cents, cur)
        if frac:
            out += f" {frac}"
    return out


# ═══════════════════════════════════════════════════════════
# EN
# ═══════════════════════════════════════════════════════════
_EN_ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
]
_EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_EN_SCALES = ["", "thousand", "million", "billion"]


def _en_triplet(n):
    words = []
    h, rest = divmod(n, 100)
    if h:
        words += [_EN_ONES[h], "hundred"]
    if rest:
        if rest < 20:
            words.append(_EN_ONES[rest])
        else:
            t, o = divmod(rest, 10)
            words.append(_EN_TENS[t] + (f"-{_EN_ONES[o]}" if o else ""))
    return words


def _en_number(n):
    if n == 0:
        return "zero"
    words = []
    groups = _split_triplets(n)
    for idx in range(len(groups) - 1, -1, -1):
        g = groups[idx]
        if not g:
            continue
        words += _en_triplet(g)
        if idx:
            words.append(_EN_SCALES[idx])
    return " ".join(words)


_EN_CUR = {
    "EUR": (("euro", "euros"), ("cent", "cents")),
    "USD": (("US dollar", "US dollars"), ("cent", "cents")),
    "GBP": (("pound sterling", "pounds sterling"), ("penny", "pence")),
    "PLN": (("zloty", "zlotys"), ("grosz", "groszy")),
    "CHF": (("Swiss franc", "Swiss francs"), None),
    "CZK": (("Czech koruna", "Czech korunas"), None),
    "SEK": (("Swedish krona", "Swedish kronor"), None),
    "NOK": (("Norwegian krone", "Norwegian kroner"), None),
    "DKK": (("Danish krone", "Danish kroner"), None),
    "UAH": (("Ukrainian hryvnia", "Ukrainian hryvnias"), None),
    "RUB": (("Russian ruble", "Russian rubles"), None),
    "BGN": (("Bulgarian lev", "Bulgarian leva"), None),
    "RON": (("Romanian leu", "Romanian lei"), None),
    "HUF": (("Hungarian forint", "Hungarian forints"), None),
}


def _en(units, cents, cur):
    major, minor = _EN_CUR.get(cur, (None, None))
    noun = (major[0] if units == 1 else major[1]) if major else cur
    out = f"{_en_number(units)} {noun}"
    if minor:
        out += f" and {_en_number(cents)} {minor[0] if cents == 1 else minor[1]}"
    else:
        frac = _fraction(cents, cur)
        if frac:
            out += f" and {frac}"
    return out


# ═══════════════════════════════════════════════════════════
# PL
# ═══════════════════════════════════════════════════════════
_PL_ONES = ["", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć"]
_PL_TEENS = [
    "dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście",
    "piętnaście", "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście",
]
_PL_TENS = [
    "", "", "dwadzieścia", "trzydzieści", "czterdzieści", "pięćdziesiąt",
    "sześćdziesiąt", "siedemdziesiąt", "osiemdziesiąt", "dziewięćdziesiąt",
]
_PL_HUNDREDS = [
    "", "sto", "dwieście", "trzysta", "czterysta", "pięćset",
    "sześćset", "siedemset", "osiemset", "dziewięćset",
]
# (1, 2-4, 5+)
_PL_SCALES = [
    None,
    ("tysiąc", "tysiące", "tysięcy"),
    ("milion", "miliony", "milionów"),
    ("miliard", "miliardy", "miliardów"),
]
_PL_ONE_BY_GENDER = {"m": "jeden", "f": "jedna", "n": "jedno"}


def _pl_form(n, forms):
    if n == 1:
        return forms[0]
    if n % 10 in (2, 3, 4) and not 12 <= n % 100 <= 14:
        return forms[1]
    return forms[2]


def _pl_triplet(n, gender):
    words = []
    h, rest = divmod(n, 100)
    if h:
        words.append(_PL_HUNDREDS[h])
    if 10 <= rest <= 19:
        words.append(_PL_TEENS[rest - 10])
    else:
        t, o = divmod(rest, 10)
        if t:
            words.append(_PL_TENS[t])
        if o:
            words.append("dwie" if (o == 2 and gender == "f") else _PL_ONES[o])
    return words


def _pl_number(n, gender="m"):
    if n == 0:
        return "zero"
    if n == 1:
        return _PL_ONE_BY_GENDER[gender]
    words = []
    groups = _split_triplets(n)
    for idx in range(len(groups) - 1, -1, -1):
        g = groups[idx]
        if not g:
            continue
        if idx == 0:
            words += _pl_triplet(g, gender)
        elif g == 1:
            words.append(_PL_SCALES[idx][0])
        else:
            words += _pl_triplet(g, "m") + [_pl_form(g, _PL_SCALES[idx])]
    return " ".join(words)


# ISO: (pagrindinis (1, 2-4, 5+), giminė, smulkus|None, smulkaus giminė)
_PL_CUR = {
    "EUR": (("euro", "euro", "euro"), "n", ("cent", "centy", "centów"), "m"),
    "USD": (("dolar amerykański", "dolary amerykańskie", "dolarów amerykańskich"), "m", ("cent", "centy", "centów"), "m"),
    "GBP": (("funt szterling", "funty szterlingi", "funtów szterlingów"), "m", ("pens", "pensy", "pensów"), "m"),
    "PLN": (("złoty", "złote", "złotych"), "m", ("grosz", "grosze", "groszy"), "m"),
    "CHF": (("frank szwajcarski", "franki szwajcarskie", "franków szwajcarskich"), "m", None, "m"),
    "CZK": (("korona czeska", "korony czeskie", "koron czeskich"), "f", None, "m"),
    "SEK": (("korona szwedzka", "korony szwedzkie", "koron szwedzkich"), "f", None, "m"),
    "NOK": (("korona norweska", "korony norweskie", "koron norweskich"), "f", None, "m"),
    "DKK": (("korona duńska", "korony duńskie", "koron duńskich"), "f", None, "m"),
    "UAH": (("hrywna", "hrywny", "hrywien"), "f", None, "m"),
    "RUB": (("rubel rosyjski", "ruble rosyjskie", "rubli rosyjskich"), "m", None, "m"),
    "BGN": (("lew bułgarski", "lewy bułgarskie", "lewów bułgarskich"), "m", None, "m"),
    "RON": (("lej rumuński", "leje rumuńskie", "lejów rumuńskich"), "m", None, "m"),
    "HUF": (("forint", "forinty", "forintów"), "m", None, "m"),
}


def _pl(units, cents, cur):
    major, g, minor, mg = _PL_CUR.get(cur, (None, "m", None, "m"))
    out = _pl_number(units, g) + " " + (_pl_form(units, major) if major else cur)
    if minor:
        out += " " + _pl_number(cents, mg) + " " + _pl_form(cents, minor)
    else:
        frac = _fraction(cents, cur)
        if frac:
            out += f" {frac}"
    return out


# ═══════════════════════════════════════════════════════════
# DE
# ═══════════════════════════════════════════════════════════
_DE_ONES = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"]
_DE_TEENS = [
    "zehn", "elf", "zwölf", "dreizehn", "vierzehn",
    "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn",
]
_DE_TENS = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"]
_DE_BIG = [
    None,
    None,
    ("Million", "Millionen"),
    ("Milliarde", "Milliarden"),
]


def _de_ends_with_one(n):
    """101, 1001, 2001 ... — skaičius baigiasi "-ein(e)" -> daiktavardis vienaskaita."""
    return n % 100 == 1


def _de_triplet(n, gender="m"):
    s = ""
    h, rest = divmod(n, 100)
    if h:
        s += _DE_ONES[h] + "hundert"
    if rest:
        if rest < 10:
            s += "eine" if (rest == 1 and gender == "f") else _DE_ONES[rest]
        elif rest < 20:
            s += _DE_TEENS[rest - 10]
        else:
            t, o = divmod(rest, 10)
            s += (_DE_ONES[o] + "und" if o else "") + _DE_TENS[t]
    return s


def _de_number(n, gender="m"):
    if n == 0:
        return "null"
    if n == 1:
        return "eine" if gender == "f" else "ein"
    groups = _split_triplets(n)
    parts = []
    for idx in range(len(groups) - 1, 1, -1):
        g = groups[idx]
        if not g:
            continue
        sg, pl = _DE_BIG[idx]
        # Million/Milliarde - moteriška g.: "eine Million", "einhunderteine Million", "zwei Millionen"
        noun = sg if _de_ends_with_one(g) else pl
        parts.append(f"{_de_triplet(g, 'f')} {noun}")
    tail = ""
    if len(groups) > 1 and groups[1]:
        tail += _de_triplet(groups[1]) + "tausend"
    if groups[0]:
        tail += _de_triplet(groups[0], gender)
    if tail:
        parts.append(tail)
    return " ".join(parts)


# ISO: (pagrindinis (vns, dgs), giminė, smulkus|None, smulkaus giminė)
_DE_CUR = {
    "EUR": (("Euro", "Euro"), "m", ("Cent", "Cent"), "m"),
    "USD": (("US-Dollar", "US-Dollar"), "m", ("Cent", "Cent"), "m"),
    "GBP": (("Pfund Sterling", "Pfund Sterling"), "n", ("Penny", "Pence"), "m"),
    "PLN": (("Złoty", "Złoty"), "m", ("Grosz", "Groszy"), "m"),
    "CHF": (("Schweizer Franken", "Schweizer Franken"), "m", None, "m"),
    "CZK": (("tschechische Krone", "tschechische Kronen"), "f", None, "m"),
    "SEK": (("schwedische Krone", "schwedische Kronen"), "f", None, "m"),
    "NOK": (("norwegische Krone", "norwegische Kronen"), "f", None, "m"),
    "DKK": (("dänische Krone", "dänische Kronen"), "f", None, "m"),
    "RUB": (("russischer Rubel", "russische Rubel"), "m", None, "m"),
    "BGN": (("bulgarischer Lew", "bulgarische Lewa"), "m", None, "m"),
    "RON": (("rumänischer Leu", "rumänische Lei"), "m", None, "m"),
    "HUF": (("Forint", "Forint"), "m", None, "m"),
}


def _de(units, cents, cur):
    major, g, minor, mg = _DE_CUR.get(cur, (None, "m", None, "m"))
    # "ein Euro", "einhundertein Euro", "einhunderteine tschechische Krone" — vienaskaita
    noun = (major[0] if _de_ends_with_one(units) else major[1]) if major else cur
    out = f"{_de_number(units, g)} {noun}"
    if minor:
        out += f" und {_de_number(cents, mg)} {minor[0] if cents == 1 else minor[1]}"
    else:
        frac = _fraction(cents, cur)
        if frac:
            out += f" {frac}"
    return out


# ═══════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════
_BUILDERS = {"lt": _lt, "en": _en, "pl": _pl, "de": _de}
_MAX = Decimal("999999999999.99")


def amount_in_words(amount, currency="EUR", lang="lt"):
    """Suma žodžiais. Grąžina "" jei suma netinkama."""
    if amount in (None, ""):
        return ""
    try:
        value = Decimal(str(amount).replace(",", ".")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return ""

    negative = value < 0
    value = abs(value)
    if value > _MAX:
        return ""

    units = int(value)
    cents = int((value - units) * 100)
    cur = (currency or "EUR").strip().upper()
    builder = _BUILDERS.get((lang or "lt").lower(), _lt)

    text = builder(units, cents, cur)
    if negative:
        text = "minus " + text
    return text[0].upper() + text[1:]
