"""
Optimum API Mock Server
=======================
Запуск:
    python optimum_mock_server.py

Сервер слушает на http://localhost:8877/v1/lt/Trd.asmx
и отвечает на SOAP-запросы InsertArticle, InsertInvoice, InsertPrcInvoice.

Чтобы использовать - поменяй OPTIMUM_API_URL в optimum.py на:
    OPTIMUM_API_URL = "http://localhost:8877/v1/lt/Trd.asmx"

Ответы:
  ~50% - Success (Result=0)
  ~50% - Error (Result=-1, текст ошибки)

Между ответами задержка 3 секунды.
"""

import os
import sys
import time
import random
import django
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.urls import path

# -- Django minimal config --
if not settings.configured:
    settings.configure(
        DEBUG=True,
        SECRET_KEY="mock-server-secret-key-not-for-production",
        ROOT_URLCONF=__name__,
        ALLOWED_HOSTS=["*"],
        MIDDLEWARE=[],
    )
    django.setup()

# -- Настройки мок-сервера --
DELAY_SECONDS = 3          # задержка перед ответом
SUCCESS_WEIGHT = 50        # шанс Success (%)
ERROR_WEIGHT = 50          # шанс Error (%)

MOCK_ERRORS = [
    "Preke nerasta duomenu bazeje",
    "Neteisingas PVM kodas",
    "Dublikatas: dokumentas jau egzistuoja",
    "Vidine serverio klaida",
    "Neteisingas tiekejo kodas",
    "Kiekis negali buti nulinis",
    "Suma neatitinka eiluciu sumos",
    "Neteisingas valiutos kodas",
    "Sandelis nerastas",
    "Prekes grupe nenurodyta",
]

OPT_NS = "http://api.optimum.lt/v1/lt/"

# -- Счётчики для статистики --
stats = {"total": 0, "success": 0, "error": 0}


def _build_soap_response(action, status, result_int, error_text=""):
    """Генерирует SOAP 1.1 XML ответ в формате Optimum API."""
    result_tag = action + "Result"
    error_elem = "<Error>" + error_text + "</Error>" if error_text else "<Error />"
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
        ' xmlns:xsd="http://www.w3.org/2001/XMLSchema">'
        '<soap:Body>'
        '<' + action + 'Response xmlns="' + OPT_NS + '">'
        '<' + result_tag + '>'
        '<Status>' + status + '</Status>'
        '<Result>' + str(result_int) + '</Result>'
        + error_elem +
        '</' + result_tag + '>'
        '</' + action + 'Response>'
        '</soap:Body>'
        '</soap:Envelope>'
    )
    return xml


def _random_response(action):
    """Возвращает (status, result_int, error_text) случайно."""
    roll = random.randint(1, 100)
    if roll <= SUCCESS_WEIGHT:
        return "Success", 0, ""
    else:
        error_msg = random.choice(MOCK_ERRORS)
        return "Error", -1, error_msg


def _extract_action(request):
    """Извлекает название SOAP action из заголовка SOAPAction."""
    soap_action = request.headers.get("SOAPAction", "")
    # SOAPAction: "http://api.optimum.lt/v1/lt/Trd/InsertArticle"
    soap_action = soap_action.strip('"').strip("'")
    if "/" in soap_action:
        return soap_action.rsplit("/", 1)[-1]
    return soap_action or "Unknown"


@csrf_exempt
def mock_soap_endpoint(request):
    """Основной эндпоинт мок-сервера."""
    if request.method != "POST":
        return HttpResponse("Mock Optimum SOAP Server is running. Send POST requests.", status=200)

    action = _extract_action(request)
    stats["total"] += 1

    # Задержка
    print("")
    print("=" * 60)
    print("  #" + str(stats["total"]) + " Получен запрос: " + action)
    print("  Задержка " + str(DELAY_SECONDS) + " сек...")
    time.sleep(DELAY_SECONDS)

    # Случайный ответ
    status, result_int, error_text = _random_response(action)

    if status == "Success":
        stats["success"] += 1
        emoji = "OK"
    else:
        stats["error"] += 1
        emoji = "ERR"

    xml_response = _build_soap_response(action, status, result_int, error_text)

    msg = "  [" + emoji + "] " + action + " -> " + status
    if error_text:
        msg += " (" + error_text + ")"
    print(msg)
    print("  Итого: " + str(stats["total"]) + " запросов | OK: " + str(stats["success"]) + " | ERR: " + str(stats["error"]))
    print("=" * 60)

    return HttpResponse(
        xml_response,
        content_type="text/xml; charset=utf-8",
        status=200,
    )


# -- URL routing --
urlpatterns = [
    path("v1/lt/Trd.asmx", mock_soap_endpoint),
]


# -- Запуск --
if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    port = sys.argv[1] if len(sys.argv) > 1 else "8877"

    print("")
    print("=" * 58)
    print("  Optimum API Mock Server")
    print("=" * 58)
    print("")
    print("  URL:     http://localhost:" + port + "/v1/lt/Trd.asmx")
    print("  Delay:   " + str(DELAY_SECONDS) + " сек между ответами")
    print("  Success: " + str(SUCCESS_WEIGHT) + "%  |  Error: " + str(ERROR_WEIGHT) + "%")
    print("")
    print("  Поменяй OPTIMUM_API_URL в optimum.py на:")
    print("  http://localhost:" + port + "/v1/lt/Trd.asmx")
    print("")
    print("  Ctrl+C для остановки")
    print("=" * 58)
    print("")

    execute_from_command_line(["mock_server", "runserver", "0.0.0.0:" + port, "--noreload"])