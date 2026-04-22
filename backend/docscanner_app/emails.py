# docscanner_app/emails.py
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from email.utils import formataddr
from django.utils.timezone import now, localtime
from django.contrib.auth import get_user_model

import io
import qrcode

import logging
import logging.config

logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')




def siusti_kontakto_laiska(*, vardas: str, email: str, zinute: str, tema: str | None = None):
    """
    Paprasta kontaktinės formos laiško siuntimo funkcija.

    :param vardas: siuntėjo vardas
    :param email: siuntėjo el. paštas (Reply-To bus nustatytas į šį adresą)
    :param zinute: žinutės tekstas
    :param tema: (neprivaloma) tema; jei nepaduota – bus naudota generinė
    """
    subject = (tema or "Nauja žinutė iš kontaktų formos").strip()

    # Tekstinė versija
    text_body = (
        f"Nauja žinutė iš kontaktų formos\n\n"
        f"Vardas: {vardas}\n"
        f"El. paštas: {email}\n"
        f"Tema: {subject}\n\n"
        f"Žinutė:\n{zinute}\n\n"
        f"Gauta: {now().strftime('%Y-%m-%d %H:%M:%S')}"
    )

    # Minimalus HTML (be šablono – paprastai)
    html_body = (
        "<!doctype html><html><body style='font-family:Arial,Helvetica,sans-serif;'>"
        "<h2>Nauja žinutė iš kontaktų formos</h2>"
        f"<p><strong>Vardas:</strong> {vardas}</p>"
        f"<p><strong>El. paštas:</strong> {email}</p>"
        f"<p><strong>Tema:</strong> {subject}</p>"
        "<hr>"
        f"<pre style='white-space:pre-wrap;font-family:inherit;'>{zinute}</pre>"
        f"<p style='color:#888;'>Gauta: {now().strftime('%Y-%m-%d %H:%M:%S')}</p>"
        "</body></html>"
    )

    try:
        logger.info(f"[CONTACT EMAIL START] from={email} to={getattr(settings, 'CONTACT_EMAIL', None)}")
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=formataddr(("DokSkenas", settings.DEFAULT_FROM_EMAIL)),
            to=[getattr(settings, "CONTACT_EMAIL", settings.DEFAULT_FROM_EMAIL)],
            reply_to=[f"{vardas} <{email}>"],
        )
        msg.attach_alternative(html_body, "text/html")

        try:
            msg.tags = ["contact"]
            msg.metadata = {"event": "contact_form"}
        except Exception:
            pass

        msg.send()
        logger.info("[CONTACT EMAIL SUCCESS]")
        return True
    except Exception as e:
        logger.exception(f"[CONTACT EMAIL ERROR] {e}")
        return False






def siusti_sveikinimo_laiska(vartotojas):
    """
    Siunčia 'Sveiki atvykę' laišką naujam vartotojui.
    HTML šablonas: templates/emails/welcome.html
    """
    try:
        logger.info(f"[EMAIL START] Pradedame siųsti laišką vartotojui ID={vartotojas.id}, el. paštas={vartotojas.email}")

        # 1️⃣ Paruošiame tekstinę versiją
        text_content = (
            "Sveiki prisijungę prie DokSkeno!\n\n"
            "Į jūsų sąskaitą pridėjome 50 nemokamų kreditų, kad galėtumėte išbandyti DokSkeną.\n\n"
            "Prieš pradedant kelti failus, įveskite savo įmonės rekvizitus bei pasirinkite buhalterinę "
            "programą nustatymuose, tada bus aktyvuotas \"Įkelti failus\" mygtukas.\n"
            "Žiūrėti video: https://youtu.be/falGn4_S_5Y\n\n"
            "Jei kyla kitų klausimų (pvz. kaip importuoti duomenis į Rivilę), "
            "atsakymus rasite mūsų naudojimo gide: https://atlyginimoskaiciuokle.com/naudojimo-gidas\n\n"
            "O jei turite pastebėjimų ar norite pasakyti \"Labas!\" mūsų komandai,"
            "tiesiog atsakykite į šį el. laišką.\n\n"
            "Pagarbiai,\nDenis iš DokSkeno"
        )
        logger.debug(f"[EMAIL TEXT READY] Tekstinė versija: {text_content}")

        # 2️⃣ Renderiname HTML šabloną
        try:
            html_content = render_to_string("emails/welcome.html", {"user": vartotojas})
            logger.debug("[EMAIL HTML READY] HTML šablonas sėkmingai sugeneruotas.")
        except Exception as e:
            logger.exception(f"[EMAIL TEMPLATE ERROR] Nepavyko sugeneruoti HTML šablono: {e}")
            raise

        # 3️⃣ Sukuriame laiško objektą
        msg = EmailMultiAlternatives(
            subject="Pridėjome 50 nemokamų kreditų į jūsų sąskaitą",
            body=text_content,
            from_email=formataddr(("Denis iš DokSkeno", settings.DEFAULT_FROM_EMAIL)),
            to=[vartotojas.email],
        )
        msg.attach_alternative(html_content, "text/html")

        # 4️⃣ Pridedame žymas ir metaduomenis
        try:
            msg.tags = ["welcome"]
            msg.metadata = {"event": "welcome", "user_id": vartotojas.id}
            logger.debug("[EMAIL META READY] Pridėtos žymos ir metaduomenys.")
        except Exception as meta_err:
            logger.warning(f"[EMAIL META WARNING] Nepavyko pridėti žymų/metaduomenų: {meta_err}")

        # 5️⃣ Siunčiame laišką
        logger.info(f"[EMAIL SENDING] Siunčiame laišką į {vartotojas.email} iš {settings.DEFAULT_FROM_EMAIL}")
        msg.send()
        logger.info(f"[EMAIL SUCCESS] Laiškas sėkmingai išsiųstas vartotojui {vartotojas.email}")

    except Exception as e:
        logger.exception(f"[EMAIL ERROR] Nepavyko išsiųsti laiško vartotojui {vartotojas.email if vartotojas else 'nežinomas'}: {e}")
        raise





# Masinis laiskas visiems uzsiregistravusiems (galima exclude pagal user id)

def siusti_masini_laiska_visiems(
    *,
    subject: str,
    text_template: str | None = None,
    html_template_name: str | None = None,
    extra_context: dict | None = None,
    exclude_user_ids: list[int] | None = None,
    tik_aktyviems: bool = True,
) -> int:
    """
    Masinė laiškų siunta visiems CustomUser.

    :param subject: laiško tema
    :param text_template: tekstinė versija (gali būti su .format() vietomis: {vardas}, {email}, {user})
    :param html_template_name: Django šablono pavadinimas, pvz. 'emails/bulk_info.html'
    :param extra_context: papildomas kontekstas, kurį gaus šablonai
    :param exclude_user_ids: vartotojų ID sąrašas, kuriems nesiųsti
    :param tik_aktyviems: jei True – siųsti tik aktyviems vartotojams (is_active=True)
    :return: sėkmingai išsiųstų laiškų skaičius
    """
    User = get_user_model()

    qs = User.objects.all()

    if tik_aktyviems and hasattr(User, "is_active"):
        qs = qs.filter(is_active=True)

    if exclude_user_ids:
        qs = qs.exclude(id__in=exclude_user_ids)

    users = list(qs)

    if not users:
        logger.warning("[BULK EMAIL] Nėra kam siųsti (vartotojų sąrašas tuščias).")
        return 0

    logger.info(
        f"[BULK EMAIL START] Vartotojų kiekis={len(users)}, "
        f"exclude_user_ids={exclude_user_ids or []}"
    )

    extra_context = extra_context or {}
    sent_count = 0

    for user in users:
        try:
            ctx = {
                "user": user,
                "email": getattr(user, "email", ""),
                "vardas": getattr(user, "first_name", "") or getattr(user, "username", ""),
                "now": now(),
                **extra_context,
            }

            # Tekstinė versija
            if text_template:
                try:
                    text_body = text_template.format(**ctx)
                except Exception:
                    text_body = text_template
            else:
                vardas = ctx["vardas"] or "vartotojau"
                text_body = (
                    f"Sveiki, {vardas},\n\n"
                    "Norėjome jus informuoti apie naujienas DokSkeno sistemoje.\n\n"
                    "Pagarbiai,\nDokSkeno komanda"
                )

            # HTML versija
            html_body = None
            if html_template_name:
                html_body = render_to_string(html_template_name, ctx)

            msg = EmailMultiAlternatives(
                subject=subject.strip(),
                body=text_body,
                from_email=formataddr(("Denis iš DokSkeno", settings.DEFAULT_FROM_EMAIL)),
                to=[user.email],
            )

            if html_body:
                msg.attach_alternative(html_body, "text/html")

            try:
                msg.tags = ["bulk"]
                msg.metadata = {"event": "bulk_send", "user_id": user.id}
            except Exception:
                pass

            msg.send()
            sent_count += 1
            logger.info(f"[BULK EMAIL SENT] user_id={user.id}, email={user.email}")

        except Exception as e:
            logger.exception(
                f"[BULK EMAIL ERROR] Nepavyko išsiųsti vartotojui id={getattr(user, 'id', None)}, "
                f"email={getattr(user, 'email', None)}: {e}"
            )

    logger.info(f"[BULK EMAIL DONE] Sėkmingai išsiųsta: {sent_count} laiškų.")
    return sent_count




def siusti_mobilios_apps_kvietima(
    *,
    kvietejas,
    gavejo_email: str,
    play_store_link: str,
    mobile_key: str,
) -> bool:
    """
    Siunčia kvietimą į DokSkenas mobilųjį app'ą:
    - el. laiškas su nuoroda į Google Play (ar deeplink)
    - QR kodas kaip priedas (PNG)
    """
    subject = "Kvietimas į DokSkenas mobilųjį aplikaciją"

    text_body = (
        "Sveiki!\n\n"
        "Jūs gavote kvietimą naudotis DokSkenas mobiliąja programėle.\n\n"
        f"Nuoroda į aplikaciją:\n{play_store_link}\n\n"
        "Jūsų mobilus raktas (jei reikėtų įvesti ranka):\n"
        f"{mobile_key}\n\n"
        "Pagarbiai,\n"
        f"{getattr(kvietejas, 'get_full_name', lambda: kvietejas.username)() or kvietejas.username}\n"
        "DokSkeno komanda\n"
    )

    html_body = None
    try:
        html_body = render_to_string(
            "emails/mobile_invitation.html",
            {
                "kvietejas": kvietejas,
                "gavejo_email": gavejo_email,
                "play_store_link": play_store_link,
                "mobile_key": mobile_key,
            },
        )
    except Exception as e:
        logger.warning(f"[MOBILE INVITE TEMPLATE WARNING] {e}")

    try:
        logger.info(
            f"[MOBILE INVITE START] from_user_id={kvietejas.id}, "
            f"from={kvietejas.email}, to={gavejo_email}"
        )

        msg = EmailMultiAlternatives(
            subject=subject.strip(),
            body=text_body,
            from_email=formataddr(
                ("Denis iš DokSkeno", settings.DEFAULT_FROM_EMAIL)
            ),
            to=[gavejo_email],
        )

        if html_body:
            msg.attach_alternative(html_body, "text/html")

        qr = qrcode.QRCode(
            version=1,
            box_size=10,
            border=4,
        )
        qr.add_data(play_store_link)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        qr_png_data = buf.read()

        msg.attach("dokskenas_qr.png", qr_png_data, "image/png")

        try:
            msg.tags = ["mobile_invite"]
            msg.metadata = {
                "event": "mobile_invite",
                "inviter_user_id": kvietejas.id,
            }
        except Exception:
            pass

        msg.send()
        logger.info("[MOBILE INVITE SUCCESS]")
        return True

    except Exception as e:
        logger.exception(f"[MOBILE INVITE ERROR] {e}")
        return False


# ══════════════════════════════════════════════════════════════════
#  ONBOARDING EMAILS
#  Celery Beat runs send_onboarding_emails() every workday at 10:00.
#  Each new user gets exactly ONE onboarding email the next business
#  day after registration.
# ══════════════════════════════════════════════════════════════════


# ──────────────────────────────────────────────
#  Video mapping по бухгалтерской программе
# ──────────────────────────────────────────────
VIDEO_BY_PROGRAM = {
    "rivile_erp":  {"label": "Rivilę ERP",  "url": "https://youtu.be/2ENROTqWfYw"},
    "rivile":      {"label": "Rivilę Gama", "url": "https://youtu.be/7uwLLA3uTQ0"},
    "apskaita5":   {"label": "Apskaita 5",   "url": "https://youtu.be/_HeD_TKUsl0"},
    "finvalda":    {"label": "Centą",      "url": "https://youtu.be/n1OGeQ9quEk"},
    "dineta":      {"label": "Dinetą",      "url": "https://youtu.be/MLCPSPmcupE"},
    # Добавляй по мере появления видео. Если программы нет в словаре —
    # строка про видео просто не попадёт в письмо.
}


# ──────────────────────────────────────────────
#  Текстовые шаблоны — SKAITMENIZAVIMAS
# ──────────────────────────────────────────────

def _skaitmn_not_configured(user):
    """Зарегался, но не ввёл компанию или не выбрал бух. программу."""
    return {
        "subject": "Kaip pradėti skaitmenizuoti DokSkene?",
        "body": (
            "Sveiki,\n\n"
            "tam kad galėtumėte įkelti dokumentus skaitmenizuoti DokSkene, tereikia "
            "nustatymuose įvesti savo įmonės rekvizitus bei pasirinkti apskaitos programą.\n\n"
            "Plačiau šiame video: https://youtu.be/ByViuilYxZA\n\n"
            "Jei kils sunkumų, drąsiai kreipkitės.\n\n"
            "Pagarbiai,\n"
            "Denis iš DokSkeno"
        ),
    }


def _skaitmn_configured_not_scanned(user):
    """Ввёл компанию + выбрал программу, но ещё не сканировал (credits == 50)."""
    return {
        "subject": "Jūsų paskyra paruošta skaitmenizuoti dokumentus",
        "body": (
            "Sveiki,\n\n"
            "jūsų DokSkeno paskyra jau paruošta skaitmenizuoti dokumentus.\n\n"
            'Suvestinėje tiesiog paspauskite "Įkelti failus" mygtuką ir pasirinkite failus. '
            "Viename faile turi būti viena sąskaita (gali būti iki 5 puslapių). "
            "Galite įkelti ir archyvus.\n\n"
            "Jei norėsite, kad nesikurtų prekių/paslaugų kortelės kiekvienai prekei, "
            "galite nusistatyti automatizacijas, plačiau šiame video: "
            "https://youtu.be/MftJl0_4jOE\n\n"
            "Jei kyla klausimų, drąsiai kreipkitės.\n\n"
            "Pagarbiai,\n"
            "Denis iš DokSkeno"
        ),
    }


def _skaitmn_scanned(user):
    """Сканировал хотя бы 1 документ (credits < 50)."""
    program = user.default_accounting_program
    video = VIDEO_BY_PROGRAM.get(program)

    video_line = ""
    if video:
        video_line = (
            f"Šis video parodo, kaip importuoti į {video['label']}: "
            f"{video['url']}\n\n"
        )

    return {
        "subject": "Ar pavyko importuoti sąskaitas į apskaitą?",
        "body": (
            "Sveiki,\n\n"
            "matome, kad jau skaitmenizavote kelis dokumentus. "
            "Ar pavyko importuoti duomenis į apskaitos programą?\n\n"
            f"{video_line}"
            "Taip pat galbūt norėsite nusistatyti papildomus laukus, tokius kaip "
            "sandėlis, objektas, atskaitingas asmuo ir kiti, plačiau šiame video: "
            "https://youtu.be/_AuMdOP66bE\n\n"
            "Kilo klausimų, susisiekite.\n\n"
            "Pagarbiai,\n"
            "Denis iš DokSkeno"
        ),
    }


# ──────────────────────────────────────────────
#  Текстовые шаблоны — ISRASYMAS
# ──────────────────────────────────────────────

def _israsymas_nothing(user):
    """Зарегался с išrašymas, но нет trial."""
    return {
        "subject": "Paskyra paruošta išrašyti sąskaitas",
        "body": (
            "Sveiki,\n\n"
            "savo DokSkeno paskyroje jau galite išrašyti sąskaitas.\n\n"
            "Prisijungę eikite į Išrašymas -> Sąskaitos -> Nauja sąskaita\n\n"
            "Norėdami išbandyti visas funkcijas, tokias kaip apmokėjimo mygtukai "
            "sąskaitose, banko išrašų importas, automatiniai priminimai bei neribotas "
            "sąskaitų išrašymas ir siuntimas klientams, pradėkite bandomąjį laikotarpį "
            "arba įsigykite PRO planą.\n\n"
            "Jei kils klausimų, drąsiai kreipkitės.\n\n"
            "Pagarbiai,\n"
            "Denis iš DokSkeno"
        ),
    }


def _israsymas_trial_no_invoices(user):
    """Начал trial, но не выписал ни одной фактуры."""
    return {
        "subject": "Išrašykite savo pirmąją sąskaitą",
        "body": (
            "Sveiki,\n\n"
            "jūsų PRO plano bandomasis laikotarpis jau prasidėjo. "
            "Nedelskite ir išbandykite visas funkcijas.\n\n"
            "Sąskaitas galite išrašyti ir siųsti per: "
            "Išrašymas -> Sąskaitos -> Nauja sąskaita\n\n"
            "Bandomuoju laikotarpiu galite neribotai naudotis visomis funkcijomis.\n\n"
            "Jei kils klausimų, drąsiai kreipkitės.\n\n"
            "Pagarbiai,\n"
            "Denis iš DokSkeno"
        ),
    }


def _israsymas_has_invoices(user):
    """Начал trial и выписал хотя бы 1 фактуру."""
    return {
        "subject": "Naudingos funkcijos",
        "body": (
            "Sveiki,\n\n"
            "sveikiname su pirmąja išrašyta sąskaita.\n\n"
            "Keletas funkcijų, kurias rekomenduojame išbandyti:\n"
            "- Periodinės sąskaitos\n"
            "- Montonio / Paysera mygtukai sąskaitose\n"
            "- Banko išrašų importas ir apmokėjimų susiejimas su sąskaitomis\n"
            "- Automatiniai apmokėjimo priminimai\n"
            "- Sąskaitų duomenų eksportas į apskaitos programą\n\n"
            "Jei kils klausimų, drąsiai kreipkitės.\n\n"
            "Pagarbiai,\n"
            "Denis iš DokSkeno"
        ),
    }


# ──────────────────────────────────────────────
#  Определение категории и отправка
# ──────────────────────────────────────────────

def _classify_skaitmenizavimas(user):
    """Возвращает функцию-шаблон для skaitmenizavimas юзера."""
    has_company = bool(user.company_name and user.company_name.strip())
    has_program = bool(user.default_accounting_program)

    if not has_company or not has_program:
        return _skaitmn_not_configured

    from decimal import Decimal
    if user.credits >= Decimal("50"):
        return _skaitmn_configured_not_scanned

    return _skaitmn_scanned


def _classify_israsymas(user):
    """Возвращает функцию-шаблон для israsymas юзера."""
    from .models import InvSubscription, Invoice

    has_trial = InvSubscription.objects.filter(user=user).exists()

    if not has_trial:
        return _israsymas_nothing

    has_invoices = Invoice.objects.filter(user=user).exists()

    if not has_invoices:
        return _israsymas_trial_no_invoices

    return _israsymas_has_invoices


def _send_onboarding_to_user(user):
    """Определяет категорию, формирует текст, отправляет."""
    source = user.registration_source or "skaitmenizavimas"

    if source == "israsymas":
        template_fn = _classify_israsymas(user)
    else:
        template_fn = _classify_skaitmenizavimas(user)

    email_data = template_fn(user)

    try:
        msg = EmailMultiAlternatives(
            subject=email_data["subject"],
            body=email_data["body"],
            from_email=formataddr(("Denis iš DokSkeno", settings.DEFAULT_FROM_EMAIL)),
            to=[user.email],
        )
        try:
            msg.tags = ["onboarding"]
            msg.metadata = {
                "event": "onboarding",
                "user_id": user.id,
                "source": source,
                "template": template_fn.__name__,
            }
        except Exception:
            pass

        msg.send()
        logger.info(
            f"[ONBOARDING SENT] user_id={user.id} email={user.email} "
            f"source={source} template={template_fn.__name__}"
        )
        return True
    except Exception as e:
        logger.exception(
            f"[ONBOARDING ERROR] user_id={user.id} email={user.email}: {e}"
        )
        return False


# ──────────────────────────────────────────────
#  Главная функция — вызывается из Celery task
# ──────────────────────────────────────────────

def send_onboarding_emails():
    """
    Берёт всех юзеров, которым ещё не отправлен onboarding email
    и которые зарегистрировались до начала сегодняшнего дня.
    Beat запускает это Пн–Пт в 10:00.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    today = localtime(now()).date()

    # Перестраховка: не шлём в выходные (beat не должен запускать, но мало ли)
    if today.weekday() in (5, 6):  # 5=Сб, 6=Вс
        logger.info("[ONBOARDING] Weekend — skipping.")
        return 0

    users = User.objects.filter(
        onboarding_email_sent_at__isnull=True,
        is_active=True,
        date_joined__date__lt=today,
    )

    total = users.count()
    if total == 0:
        logger.info("[ONBOARDING] No users to process.")
        return 0

    logger.info(f"[ONBOARDING START] {total} user(s) to process.")

    sent = 0
    stats = {}
    for user in users:
        ok = _send_onboarding_to_user(user)
        if ok:
            sent += 1
            source = user.registration_source or "skaitmenizavimas"
            if source == "israsymas":
                tpl = _classify_israsymas(user).__name__
            else:
                tpl = _classify_skaitmenizavimas(user).__name__
            stats[tpl] = stats.get(tpl, 0) + 1

        user.onboarding_email_sent_at = now()
        user.save(update_fields=["onboarding_email_sent_at"])

    logger.info(f"[ONBOARDING DONE] Sent {sent}/{total}. Breakdown: {stats}")
    return sent


# ══════════════════════════════════════════════════════════════════
#  TRIAL EXPIRED EMAIL
#  Celery Beat runs send_trial_expired_emails() every workday at 10:15.
# ══════════════════════════════════════════════════════════════════

def _trial_expired_email(user):
    """Trial закончился — просим подписаться."""
    return {
        "subject": "Bandomasis laikotarpis baigėsi",
        "body": (
            "Sveiki,\n\n"
            "jūsų bandomasis laikotarpis baigėsi.\n\n"
            "Norėdami neribotai naudotis visomis funkcijomis, įsigykite PRO planą.\n\n"
            'Tai galite padaryti prisijungę prie paskyros ir aplankę "Papildyti" puslapį.\n\n'
            "Reikia pagalbos, praneškite.\n\n"
            "Pagarbiai,\n"
            "Denis iš DokSkeno"
        ),
    }


def send_trial_expired_emails():
    """
    Шлёт email юзерам, у которых trial israsymas закончился.
    Beat: Пн–Пт 10:15.
    """
    from django.contrib.auth import get_user_model
    from .models import InvSubscription

    User = get_user_model()
    today = localtime(now()).date()

    if today.weekday() in (5, 6):
        logger.info("[TRIAL EXPIRED] Weekend — skipping.")
        return 0

    users = User.objects.filter(
        trial_expired_email_sent_at__isnull=True,
        is_active=True,
    )

    sent = 0
    for user in users:
        sub = InvSubscription.objects.filter(user=user).first()
        if not sub:
            continue

        # Trial закончился?
        if sub.status != "trial_expired" and not (
            sub.status == "trial"
            and sub.trial_end
            and sub.trial_end < now()
        ):
            continue

        email_data = _trial_expired_email(user)

        try:
            msg = EmailMultiAlternatives(
                subject=email_data["subject"],
                body=email_data["body"],
                from_email=formataddr(("Denis iš DokSkeno", settings.DEFAULT_FROM_EMAIL)),
                to=[user.email],
            )
            try:
                msg.tags = ["trial_expired"]
                msg.metadata = {"event": "trial_expired", "user_id": user.id}
            except Exception:
                pass

            msg.send()
            sent += 1
            logger.info(f"[TRIAL EXPIRED SENT] user_id={user.id} email={user.email}")
        except Exception as e:
            logger.exception(f"[TRIAL EXPIRED ERROR] user_id={user.id}: {e}")

        user.trial_expired_email_sent_at = now()
        user.save(update_fields=["trial_expired_email_sent_at"])

    logger.info(f"[TRIAL EXPIRED DONE] Sent {sent}.")
    return sent