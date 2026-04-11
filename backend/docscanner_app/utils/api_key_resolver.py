"""
Utility для поиска API ключа при экспорте.

Файл: docscanner_app/utils/api_key_resolver.py

Использование:
    from docscanner_app.utils.api_key_resolver import resolve_api_key

    key_obj = resolve_api_key(user, "rivile_gama_api", company_code="304401940")
    if not key_obj:
        return error("Raktas nerastas")
    
    creds = key_obj.get_credentials()
    api_key = creds["api_key"]
"""

import logging

logger = logging.getLogger("docscanner_app")


def resolve_api_key(user, provider: str, company_code: str = "", strict: bool = False):

    """
    Ищет APIProviderKey для экспорта.

    Приоритет:
    1. Точное совпадение по company_code (если передан и не __all__/__israsymas__)
    2. __israsymas__ (если company_code == "__israsymas__")
    3. Ключ с use_for_all=True (или company_code="__all__")
    4. Единственный активный ключ этого провайдера
    5. None
    """
    from docscanner_app.models import APIProviderKey

    qs = APIProviderKey.objects.filter(
        user=user,
        provider=provider,
        is_active=True,
    )

    if not qs.exists():
        logger.warning(
            "[API_KEY] %s: no active keys at all for user=%s",
            provider, user.pk,
        )
        return None

    # 1. Точное совпадение (включая __israsymas__)
    if company_code:
        exact = qs.filter(company_code=company_code).first()
        if exact:
            logger.info(
                "[API_KEY] %s: exact match company=%s key=%s",
                provider, company_code, exact.pk,
            )
            return exact

    # 2. use_for_all или __all__
    if not strict:
        fallback_all = qs.filter(use_for_all=True).first()
        if not fallback_all:
            fallback_all = qs.filter(company_code="__all__").first()
        if fallback_all:
            logger.info(
                "[API_KEY] %s: use_for_all key=%s (wanted=%s)",
                provider, fallback_all.pk, company_code,
            )
            return fallback_all

    logger.warning(
        "[API_KEY] %s: no key found for company=%s (total_active=%d)",
        provider, company_code, qs.count(),
    )
    return None