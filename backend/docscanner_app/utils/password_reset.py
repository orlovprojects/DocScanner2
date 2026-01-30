# utils/password_reset.py

import random
import logging
from datetime import timedelta
from email.utils import formataddr

from django.conf import settings
from django.utils import timezone
from django.template.loader import render_to_string
from django.core.mail import EmailMultiAlternatives
from django.contrib.auth import get_user_model

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

User = get_user_model()
logger = logging.getLogger("docscanner_app")

# ═══════════════════════════════════════════════════════════════════════════════
# Konstantos
# ═══════════════════════════════════════════════════════════════════════════════
CODE_EXPIRY_MINUTES = 15          # Kodo galiojimo laikas
CODE_RESEND_COOLDOWN_MINUTES = 3  # Minimalus laikas tarp užklausų
MAX_FAILED_ATTEMPTS = 3           # Maksimalus neteisingų bandymų skaičius


# ═══════════════════════════════════════════════════════════════════════════════
# Helper funkcijos
# ═══════════════════════════════════════════════════════════════════════════════
def generate_reset_code():
    """Sugeneruoja 7 skaitmenų atsitiktinį kodą."""
    return ''.join([str(random.randint(0, 9)) for _ in range(7)])


def validate_email_format(email):
    """Paprasta el. pašto validacija."""
    import re
    pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    return bool(re.match(pattern, email))


def validate_password_strength(password):
    """
    Slaptažodžio validacija (tokia pati kaip registracijoje).
    Grąžina klaidų sąrašą arba tuščią sąrašą jei viskas gerai.
    """
    import re
    errors = []

    if len(password) < 8:
        errors.append("Minimum 8 simboliai")
    if not re.search(r'[a-z]', password):
        errors.append("Bent viena mažoji raidė")
    if not re.search(r'[A-Z]', password):
        errors.append("Bent viena didžioji raidė")
    if not re.search(r'\d', password):
        errors.append("Bent vienas skaičius")
    if re.search(r'\s', password):
        errors.append("Be tarpų")

    return errors


def send_password_reset_email(user, code):
    """
    Siunčia slaptažodžio atkūrimo laišką su kodu.
    HTML šablonas: templates/emails/password_reset.html
    """
    try:
        logger.info(f"[PASSWORD RESET EMAIL] Siunčiame kodą vartotojui {user.email}")

        text_content = (
            f"Sveiki,\n\n"
            f"Gavome jūsų užklausą atkurti slaptažodį DokSkenas paskyroje.\n\n"
            f"Jūsų patvirtinimo kodas: {code}\n\n"
            f"Šis kodas galioja {CODE_EXPIRY_MINUTES} minučių.\n\n"
            f"Jei jūs neprašėte atkurti slaptažodžio, tiesiog ignoruokite šį laišką.\n\n"
            f"Pagarbiai,\nDokSkenas komanda"
        )

        # Bandome naudoti HTML šabloną, jei yra
        try:
            html_content = render_to_string("emails/password_reset.html", {
                "user": user,
                "code": code,
                "expiry_minutes": CODE_EXPIRY_MINUTES,
            })
        except Exception:
            # Jei nėra šablono, naudojame paprastą HTML
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Slaptažodžio atkūrimas</h2>
                <p>Sveiki,</p>
                <p>Gavome jūsų užklausą atkurti slaptažodį DokSkenas paskyroje.</p>
                <p style="font-size: 18px;">Jūsų patvirtinimo kodas:</p>
                <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #333;">{code}</span>
                </div>
                <p style="color: #666;">Šis kodas galioja <strong>{CODE_EXPIRY_MINUTES} minučių</strong>.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px;">
                    Jei jūs neprašėte atkurti slaptažodžio, tiesiog ignoruokite šį laišką.
                </p>
            </div>
            """

        msg = EmailMultiAlternatives(
            subject="Slaptažodžio atkūrimas – DokSkenas",
            body=text_content,
            from_email=formataddr(("DokSkenas", settings.DEFAULT_FROM_EMAIL)),
            to=[user.email],
        )
        msg.attach_alternative(html_content, "text/html")

        try:
            msg.tags = ["password-reset"]
            msg.metadata = {"event": "password_reset", "user_id": user.id}
        except Exception:
            pass

        msg.send()
        logger.info(f"[PASSWORD RESET EMAIL SUCCESS] Laiškas išsiųstas į {user.email}")
        return True

    except Exception as e:
        logger.exception(f"[PASSWORD RESET EMAIL ERROR] Nepavyko išsiųsti: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# 1️⃣ Kodo užklausos endpointas
# ═══════════════════════════════════════════════════════════════════════════════
@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_request(request):
    """
    POST /api/password-reset/request/
    Body: { "email": "user@example.com" }

    Siunčia 7 skaitmenų kodą į nurodytą el. paštą.
    """
    email = request.data.get("email", "").lower().strip()

    # Validacija
    if not email:
        return Response(
            {"error": "Įveskite el. paštą."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not validate_email_format(email):
        return Response(
            {"error": "Neteisingas el. pašto formatas."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Visada grąžiname sėkmės žinutę (saugumo sumetimais)
    success_response = Response({
        "message": "Jei toks el. paštas egzistuoja, išsiuntėme patvirtinimo kodą.",
        "cooldown_minutes": CODE_RESEND_COOLDOWN_MINUTES,
    }, status=status.HTTP_200_OK)

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        logger.info(f"[PASSWORD RESET] Vartotojas nerastas: {email}")
        return success_response

    # Tikriname ar paskyra aktyvi
    if not user.is_active:
        logger.warning(f"[PASSWORD RESET] Paskyra užblokuota: {email}")
        return Response({
            "error": "Ši paskyra yra užblokuota. Susisiekite su mumis.",
        }, status=status.HTTP_403_FORBIDDEN)

    # Tikriname cooldown (3 minutės tarp užklausų)
    if user.pswd_code_sent:
        time_since_last = timezone.now() - user.pswd_code_sent
        cooldown = timedelta(minutes=CODE_RESEND_COOLDOWN_MINUTES)

        if time_since_last < cooldown:
            remaining_seconds = int((cooldown - time_since_last).total_seconds())
            remaining_minutes = remaining_seconds // 60
            remaining_secs = remaining_seconds % 60

            return Response({
                "error": f"Palaukite {remaining_minutes}:{remaining_secs:02d} prieš užklausiant naują kodą.",
                "retry_after_seconds": remaining_seconds,
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

    # Generuojame ir išsaugome kodą
    code = generate_reset_code()
    user.pswd_reset_code = code
    user.pswd_code_sent = timezone.now()
    user.pswd_reset_attempts = 0  # Resetiname bandymų skaičių
    user.save(update_fields=['pswd_reset_code', 'pswd_code_sent', 'pswd_reset_attempts'])

    # Siunčiame el. laišką
    if send_password_reset_email(user, code):
        logger.info(f"[PASSWORD RESET] Kodas išsiųstas: {email}")
    else:
        logger.error(f"[PASSWORD RESET] Nepavyko išsiųsti kodo: {email}")

    return success_response


# ═══════════════════════════════════════════════════════════════════════════════
# 2️⃣ Kodo patikrinimo endpointas
# ═══════════════════════════════════════════════════════════════════════════════
@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_verify(request):
    """
    POST /api/password-reset/verify/
    Body: { "email": "user@example.com", "code": "1234567" }

    Patikrina ar kodas teisingas ir negaliojęs.
    """
    email = request.data.get("email", "").lower().strip()
    code = request.data.get("code", "").strip()

    # Validacija
    if not email or not code:
        return Response(
            {"error": "Įveskite el. paštą ir kodą."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not code.isdigit() or len(code) != 7:
        return Response(
            {"error": "Kodas turi būti 7 skaitmenys."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response(
            {"error": "Neteisingas el. paštas arba kodas."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Tikrinimas ar paskyra aktyvi
    if not user.is_active:
        return Response(
            {"error": "Ši paskyra yra užblokuota. Susisiekite su mumis."},
            status=status.HTTP_403_FORBIDDEN
        )

    # Tikrinimas ar yra išsiųstas kodas
    if not user.pswd_reset_code or not user.pswd_code_sent:
        return Response(
            {"error": "Pirmiausia užklaukite atkūrimo kodą."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Tikrinimas ar kodas negaliojęs (15 min)
    time_elapsed = timezone.now() - user.pswd_code_sent
    if time_elapsed > timedelta(minutes=CODE_EXPIRY_MINUTES):
        # Išvalome kodą
        user.pswd_reset_code = None
        user.pswd_code_sent = None
        user.pswd_reset_attempts = 0
        user.save(update_fields=['pswd_reset_code', 'pswd_code_sent', 'pswd_reset_attempts'])

        return Response({
            "error": "Kodo galiojimo laikas baigėsi. Užklaukite naują kodą.",
            "expired": True,
        }, status=status.HTTP_400_BAD_REQUEST)

    # Tikrinimas ar kodas teisingas
    if user.pswd_reset_code != code:
        user.pswd_reset_attempts += 1
        remaining_attempts = MAX_FAILED_ATTEMPTS - user.pswd_reset_attempts

        if user.pswd_reset_attempts >= MAX_FAILED_ATTEMPTS:
            # Blokuojame paskyrą
            user.is_active = False
            user.pswd_reset_code = None
            user.pswd_code_sent = None
            user.save(update_fields=['is_active', 'pswd_reset_code', 'pswd_code_sent', 'pswd_reset_attempts'])

            logger.warning(f"[PASSWORD RESET] Paskyra užblokuota po {MAX_FAILED_ATTEMPTS} bandymų: {email}")

            return Response({
                "error": "Per daug neteisingų bandymų. Paskyra užblokuota.",
                "blocked": True,
            }, status=status.HTTP_403_FORBIDDEN)

        user.save(update_fields=['pswd_reset_attempts'])

        return Response({
            "error": f"Neteisingas kodas. Liko bandymų: {remaining_attempts}",
            "attempts_remaining": remaining_attempts,
        }, status=status.HTTP_400_BAD_REQUEST)

    # ✅ Kodas teisingas!
    return Response({
        "message": "Kodas patvirtintas. Galite nustatyti naują slaptažodį.",
        "verified": True,
    }, status=status.HTTP_200_OK)


# ═══════════════════════════════════════════════════════════════════════════════
# 3️⃣ Naujo slaptažodžio nustatymo endpointas
# ═══════════════════════════════════════════════════════════════════════════════
@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    """
    POST /api/password-reset/confirm/
    Body: {
        "email": "user@example.com",
        "code": "1234567",
        "password": "NewPass123",
        "password_confirm": "NewPass123"
    }

    Nustato naują slaptažodį po sėkmingo kodo patvirtinimo.
    """
    email = request.data.get("email", "").lower().strip()
    code = request.data.get("code", "").strip()
    password = request.data.get("password", "")
    password_confirm = request.data.get("password_confirm", "")

    # Bazinė validacija
    if not email or not code:
        return Response(
            {"error": "Įveskite el. paštą ir kodą."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not code.isdigit() or len(code) != 7:
        return Response(
            {"error": "Kodas turi būti 7 skaitmenys."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not password or not password_confirm:
        return Response(
            {"error": "Įveskite naują slaptažodį."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Slaptažodžio stiprumo validacija
    password_errors = validate_password_strength(password)
    if password_errors:
        return Response({
            "error": "Slaptažodis neatitinka reikalavimų.",
            "password_errors": password_errors,
        }, status=status.HTTP_400_BAD_REQUEST)

    # Slaptažodžių sutapimo tikrinimas
    if password != password_confirm:
        return Response(
            {"error": "Slaptažodžiai nesutampa."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response(
            {"error": "Neteisingas el. paštas arba kodas."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Tikrinimas ar paskyra aktyvi
    if not user.is_active:
        return Response(
            {"error": "Ši paskyra yra užblokuota. Susisiekite su mumis."},
            status=status.HTTP_403_FORBIDDEN
        )

    # Tikrinimas ar yra kodas
    if not user.pswd_reset_code or not user.pswd_code_sent:
        return Response(
            {"error": "Pirmiausia užklaukite atkūrimo kodą."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Tikrinimas ar kodas negaliojęs
    time_elapsed = timezone.now() - user.pswd_code_sent
    if time_elapsed > timedelta(minutes=CODE_EXPIRY_MINUTES):
        user.pswd_reset_code = None
        user.pswd_code_sent = None
        user.pswd_reset_attempts = 0
        user.save(update_fields=['pswd_reset_code', 'pswd_code_sent', 'pswd_reset_attempts'])

        return Response({
            "error": "Kodo galiojimo laikas baigėsi. Užklaukite naują kodą.",
            "expired": True,
        }, status=status.HTTP_400_BAD_REQUEST)

    # Tikrinimas ar kodas teisingas
    if user.pswd_reset_code != code:
        user.pswd_reset_attempts += 1
        remaining_attempts = MAX_FAILED_ATTEMPTS - user.pswd_reset_attempts

        if user.pswd_reset_attempts >= MAX_FAILED_ATTEMPTS:
            user.is_active = False
            user.pswd_reset_code = None
            user.pswd_code_sent = None
            user.save(update_fields=['is_active', 'pswd_reset_code', 'pswd_code_sent', 'pswd_reset_attempts'])

            return Response({
                "error": "Per daug neteisingų bandymų. Paskyra užblokuota.",
                "blocked": True,
            }, status=status.HTTP_403_FORBIDDEN)

        user.save(update_fields=['pswd_reset_attempts'])

        return Response({
            "error": f"Neteisingas kodas. Liko bandymų: {remaining_attempts}",
            "attempts_remaining": remaining_attempts,
        }, status=status.HTTP_400_BAD_REQUEST)

    # ✅ Viskas gerai - keičiame slaptažodį
    user.set_password(password)
    user.pswd_reset_code = None
    user.pswd_code_sent = None
    user.pswd_reset_attempts = 0
    user.save()

    logger.info(f"[PASSWORD RESET SUCCESS] Slaptažodis pakeistas: {email}")

    return Response({
        "message": "Slaptažodis sėkmingai pakeistas! Galite prisijungti.",
        "success": True,
    }, status=status.HTTP_200_OK)