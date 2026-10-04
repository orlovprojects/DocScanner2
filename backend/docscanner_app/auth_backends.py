from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class CaseInsensitiveEmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        email = username or kwargs.get(User.USERNAME_FIELD)
        if not email or password is None:
            return None
        email = email.strip()
        user = (
            User.objects.filter(email=email).first()
            or User.objects.filter(email__iexact=email).order_by("id").first()
        )
        if user is None:
            User().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None