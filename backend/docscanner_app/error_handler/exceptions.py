from django_ratelimit.exceptions import Ratelimited
from rest_framework.views import exception_handler

# Funkcija kotoraja pokazhet error message dlia usera jesle on privyset rate limit

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    
    if isinstance(exc, Ratelimited):
        response.data = {
            'error': 'You have exceeded the rate limit. Please try again later.'
        }
        response.status_code = 429

    return response