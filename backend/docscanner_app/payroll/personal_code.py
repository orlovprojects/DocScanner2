"""
Lietuvos asmens kodas: kontrolinio skaičiaus tikrinimas, gimimo data, lytis.
Formatas: G YYMMDD NNN K  (G: 1/2 - XIX a., 3/4 - XX a., 5/6 - XXI a.; nelyginis - vyras)
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


def parse(code):
    code = (code or "").strip()
    if len(code) != 11 or not code.isdigit():
        return PersonalCodeInfo(False, "Asmens kodą sudaro 11 skaitmenų")
    if code[0] not in CENTURY:
        return PersonalCodeInfo(False, "Neteisingas pirmas skaitmuo")
    if control_digit(code[:10]) != int(code[10]):
        return PersonalCodeInfo(False, "Neteisingas asmens kodas (nesutampa kontrolinis skaičius)")
    gender = "M" if int(code[0]) % 2 else "F"
    try:
        bd = date(CENTURY[code[0]] + int(code[1:3]), int(code[3:5]), int(code[5:7]))
    except ValueError:
        bd = None  # retais atvejais data užkoduota nepilnai (pvz. 00 mėnuo)
    return PersonalCodeInfo(True, "", bd, gender)
