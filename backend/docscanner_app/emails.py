from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from email.utils import formataddr

import logging
import logging.config

logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')


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
