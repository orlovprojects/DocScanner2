# docscanner_app/emails.py
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from email.utils import formataddr
from django.utils.timezone import now
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
            reply_to=[f"{vardas} <{email}>"],  # ← «Atsakyti» keliaus siuntėjui
        )
        msg.attach_alternative(html_body, "text/html")

        # (neprivaloma) žymos/metadata – jei jūsų ESP jas palaiko
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
            "programą nustatymuose, tada bus aktyvuotas „Įkelti failus“ mygtukas.\n"
            "Žiūrėti video 📽️: https://youtu.be/falGn4_S_5Y\n\n"
            "Jei kyla kitų klausimų (pvz. kaip importuoti duomenis į Rivilę), "
            "atsakymus rasite mūsų naudojimo gide: https://atlyginimoskaiciuokle.com/naudojimo-gidas\n\n"
            "O jei turite pastebėjimų ar norite pasakyti „Labas!“ mūsų komandai — "
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
            # from_email=settings.DEFAULT_FROM_EMAIL,
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
                    # jei format nepavyko – nenaudojam .format, kad bent kažką išsiųstų
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

            # Mailjet / Anymail žymos ir metaduomenys
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
    kvietejas,          # CustomUser, который приглашает
    gavejo_email: str,  # кому отправляем приглашение
    play_store_link: str,
    mobile_key: str,
) -> bool:
    """
    Siunčia kvietimą į DokSkenas mobilųjį app'ą:
    - el. laiškas su nuoroda į Google Play (ar deeplink)
    - QR kodas kaip priedas (PNG)
    """
    subject = "Kvietimas į DokSkenas mobilųjį aplikaciją"

    # Paprasta tekstinė versija (fallback)
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

    # Bandome sugeneruoti HTML šabloną, jei jis yra
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
        # Jei šablono nėra ar klaida – loginam ir paliekam tik text_body
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

        # --- Generuojame QR kodą ---
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

        # Prisegame QR kaip priedą
        msg.attach("dokskenas_qr.png", qr_png_data, "image/png")

        # Žymos / metadata, jei jos palaikomos
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
