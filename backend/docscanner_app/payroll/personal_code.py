"""
Lietuvos asmens kodas: gimimo data, lytis, kontrolinis skaičius.
Formatas: G YYMMDD NNN K  (G: 1/2 - XIX a., 3/4 - XX a., 5/6 - XXI a.; nelyginis - vyras)

Kontrolinio skaičiaus neatitikimas - ĮSPĖJIMAS (warning), ne klaida: registre pasitaiko išduotų kodų su
nestandartiniu kontroliniu skaičiumi, todėl tokio kodo išsaugojimas neblokuojamas.
"""
from dataclasses import dataclass
from datetime import date

W1 = (1, 2, 3, 4, 5, 6, 7, 8, 9, 1)
W2 = (3, 4, 5, 6, 7, 8, 9, 1, 2, 3)
CENTURY = {"1": 1800, "2": 1800, "3": 1900, "4": 1900, "5": 2000, "6": 2000}


def control_digit(first10):
    d = [int(c) for c in first10]
    r = sum(a * b for a, b in zip(d, W1)) % 11
    if r != 10:
        return r
    r = sum(a * b for a, b in zip(d, W2)) % 11
    return 0 if r == 10 else r


@dataclass
class PersonalCodeInfo:
    valid: bool
    error: str = ""
    birth_date: date = None
    gender: str = ""   # M / F
    warning: str = ""


def parse(code):
    code = (code or "").strip()
    if not code.isdigit():
        return PersonalCodeInfo(False, "Asmens kodą sudaro tik skaitmenys")
    if len(code) != 11:
        return PersonalCodeInfo(False, f"Įvesta {len(code)} iš 11 skaitmenų")
    if code[0] not in CENTURY:
        return PersonalCodeInfo(False, f"Pirmas skaitmuo turi būti 1–6 (lytis ir gimimo šimtmetis), o įvesta {code[0]}")
    gender = "M" if int(code[0]) % 2 else "F"
    year, mm, dd = CENTURY[code[0]] + int(code[1:3]), int(code[3:5]), int(code[5:7])
    bd = None
    if mm and dd:                                   # 00 - data užkoduota nepilnai (retais atvejais)
        try:
            bd = date(year, mm, dd)
        except ValueError:
            return PersonalCodeInfo(False, f"2–7 skaitmenys turi būti gimimo data, bet {year}-{code[3:5]}-{code[5:7]} tokios datos nėra")
        if bd > date.today():
            return PersonalCodeInfo(False, f"Gimimo data {bd} – ateityje")
    k = control_digit(code[:10])
    warning = "" if k == int(code[10]) else (
        f"Kontrolinis skaitmuo pagal algoritmą turėtų būti {k}, o įvesta {code[10]} – patikrinkite pagal asmens dokumentą")
    return PersonalCodeInfo(True, "", bd, gender, warning)
