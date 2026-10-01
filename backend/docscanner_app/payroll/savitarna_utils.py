"""esavitarna.lt grynos pagalbinės funkcijos (be Django) - testuojamos atskirai."""
import hashlib
import secrets

COMMON_PASSWORDS = {"12345678", "123456789", "1234567890", "password", "slaptazodis", "qwertyui",
                    "11111111", "00000000", "87654321", "abcdefgh", "labas123", "password1"}


def hash_token(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def new_token():
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def normalize_login(value):
    v = (value or "").strip()
    if "@" in v:
        return v.lower()
    digits = "".join(ch for ch in v if ch.isdigit() or ch == "+")
    if digits.startswith("8") and len(digits) == 9:     # 8 6xx xxxxx -> +370 6xx xxxxx
        digits = "+370" + digits[1:]
    return digits


def password_problem(pw):
    pw = pw or ""
    if len(pw) < 8:
        return "Slaptažodį turi sudaryti bent 8 simboliai"
    if pw.lower() in COMMON_PASSWORDS or len(set(pw)) <= 2:
        return "Šis slaptažodis per paprastas – sugalvokite kitą"
    return ""


def iban_ok(iban):
    iban = (iban or "").replace(" ", "").upper()
    if len(iban) < 15 or not iban[:2].isalpha():
        return False
    try:
        digits = "".join(str(int(ch, 36)) for ch in iban[4:] + iban[:4])
    except ValueError:
        return False
    return int(digits) % 97 == 1
