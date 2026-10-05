"""esavitarna.lt laiškai: Mailgun API (EU), domenas m.esavitarna.lt - kaip išrašymo laiškai."""
import logging
from html import escape

import requests
from django.conf import settings

logger = logging.getLogger("docscanner_app")


def _send(to, subject, text, button_text=None, button_url=None):
    if not to:
        return False
    key = getattr(settings, "MAILGUN_SAVITARNA_API_KEY", "")
    domain = getattr(settings, "MAILGUN_SAVITARNA_DOMAIN", "")
    if not key or not domain:
        logger.warning("esavitarna: Mailgun nesukonfigūruotas, laiškas nesiųstas: %s", to)
        return False
    html = f"""<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:520px">
{''.join(f'<p>{escape(line)}</p>' for line in text.split(chr(10)) if line.strip())}
{f'<p style="margin:28px 0"><a href="{escape(button_url)}" style="background:#1565c0;color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:17px">{escape(button_text)}</a></p>' if button_url else ''}
<p style="color:#888;font-size:13px;margin-top:32px">esavitarna.lt – darbuotojų savitarna</p></div>"""
    body = text + (f"\n\n{button_text}: {button_url}" if button_url else "")
    try:
        r = requests.post(
            f"{settings.MAILGUN_SAVITARNA_API_URL}/{domain}/messages",
            auth=("api", key),
            data={"from": settings.MAILGUN_SAVITARNA_FROM, "to": [to], "subject": subject,
                  "text": body, "html": html},
            timeout=15,
        )
        if r.status_code >= 300:
            logger.error("esavitarna laiškas nenusiųstas %s: %s %s", to, r.status_code, r.text[:300])
            return False
        return True
    except requests.RequestException:
        logger.exception("esavitarna laiškas nenusiųstas: %s", to)
        return False


def send_invite(employee, url):
    company = _company_name(employee.company)
    return _send(
        employee.email, f"{company}: prisijunkite prie darbuotojo savitarnos",
        f"Sveiki, {employee.first_name},\n"
        f"{company} kviečia prisijungti prie darbuotojo savitarnos esavitarna.lt.\n"
        "Čia galėsite užpildyti savo duomenis, pateikti atostogų prašymus ir matyti atsiskaitymo lapelius.\n"
        "Nuoroda galioja 7 dienas.",
        "Prisijungti", url,
    )


def send_password_reset(account, url):
    return _send(
        account.login if "@" in account.login else "", "Slaptažodžio keitimas – esavitarna.lt",
        "Gavome prašymą pakeisti jūsų slaptažodį.\nJei to neprašėte – tiesiog ignoruokite šį laišką.\n"
        "Nuoroda galioja 2 valandas.",
        "Keisti slaptažodį", url,
    )


def notify_accountant(employee, subject, text):
    user = getattr(employee.company, "user", None)
    return _send(getattr(user, "email", ""), subject, text)


def _company_name(company):
    for n in ("name", "company_name"):
        v = getattr(company, n, None)
        if v:
            return str(v)
    return "Jūsų darbdavys"


KIND_LT = {
    "vacation": "kasmetinių atostogų", "parent_day": "papildomo poilsio laiko (mamadienio / tėvadienio)",
    "unpaid": "nemokamų atostogų", "dismissal": "darbo sutarties nutraukimo",
    "pay_info": "informacijos apie darbo užmokestį",
}


def notify_new_request(req):
    e = req.employee
    period = str(req.end_date) if req.kind == "dismissal" else (
        str(req.start_date) if req.start_date == req.end_date else f"{req.start_date} – {req.end_date}")
    return notify_accountant(
        e, f"Naujas prašymas: {e.full_name}",
        f"{e.full_name} pateikė {KIND_LT[req.kind]} prašymą ({period}).\n"
        "Patvirtinkite arba atmeskite jį DokSkenas skiltyje „Prašymai“.",
    )


def send_decision(req):
    e = req.employee
    ok = req.status == "approved"
    text = (f"Sveiki, {e.first_name},\n"
            + (f"Atsakymas į jūsų {KIND_LT[req.kind]} prašymą jau paruoštas savitarnoje."
               if req.kind == "pay_info" and ok else
               f"Jūsų {KIND_LT[req.kind]} prašymas {'patvirtintas' if ok else 'atmestas'}."))
    if not ok and req.reject_reason:
        text += f"\nPriežastis: {req.reject_reason}"
    from .savitarna_auth import base_url
    return _send(e.email, f"Prašymas {'patvirtintas' if ok else 'atmestas'}", text, "Atidaryti savitarną", base_url())


def notify_payslip(employee, year, month):
    from .savitarna_auth import base_url
    return _send(employee.email, f"Atsiskaitymo lapelis už {year}-{month:02d}",
                 f"Sveiki, {employee.first_name},\nJūsų atsiskaitymo lapelis už {year}-{month:02d} jau paruoštas.",
                 "Peržiūrėti", f"{base_url()}/algalapiai")


def notify_roster(employee, year, month, changed=False, lines=None):
    from .savitarna_auth import base_url
    what = "pakeistas" if changed else "paskelbtas"
    body = (f"Sveiki, {employee.first_name},\nJūsų {year}-{month:02d} darbo grafikas {what}. "
            "Peržiūrėkite jį ir patvirtinkite, kad susipažinote.")
    if lines:
        body += "\n\nPakeitimai:\n" + "\n".join(f"• {x}" for x in lines[:15])
    return _send(employee.email, f"Darbo grafikas {year}-{month:02d} {what}", body,
                 "Peržiūrėti grafiką", f"{base_url()}/grafikas?y={year}&m={month}")
