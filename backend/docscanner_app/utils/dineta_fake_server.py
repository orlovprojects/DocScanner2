"""
Dineta API Mock Server
======================
Запуск:
    python dineta_mock_server.py          # порт 8878
    python dineta_mock_server.py 9000     # порт 9000

Сервер имитирует Dineta REST/JSON API v1.18:
    POST /<client>/ws/dineta_api/v1/partner/        — создание/обновление партнёров
    POST /<client>/ws/dineta_api/v1/stock/          — создание/обновление товаров
    POST /<client>/ws/dineta_api/v1/setOperation/   — создание операции (purchase/sale)
    POST /<client>/ws/dineta_api/v1/getStoreList/   — список складов (проверка подключения)

Авторизация: Basic Auth (любой логин/пароль принимается).

Подключение:
    В DokSkenas → Nustatymai → Dineta:
      URL:      http://localhost:8878/mock_client/login.php
      Username: test
      Password: test

Ответы:
  ~60% — Success  (HTTP 200, JSON ok)
  ~25% — Error    (HTTP 400, JSON с ошибкой)
  ~10% — Auth err (HTTP 401)
  ~5%  — Server   (HTTP 500)

Между ответами задержка 1 секунда.
"""

import os
import sys
import json
import time
import random
import base64
import django
from django.conf import settings as django_settings
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.urls import path, re_path

# -- Django minimal config --
if not django_settings.configured:
    django_settings.configure(
        DEBUG=True,
        SECRET_KEY="dineta-mock-server-secret-key-not-for-production",
        ROOT_URLCONF=__name__,
        ALLOWED_HOSTS=["*"],
        MIDDLEWARE=[],
    )
    django.setup()


# =========================================================
# Настройки мок-сервера
# =========================================================
DELAY_SECONDS = 1            # задержка перед ответом (секунды)
SUCCESS_WEIGHT = 60          # % успешных ответов (HTTP 200)
ERROR_400_WEIGHT = 25        # % ошибок валидации (HTTP 400)
ERROR_401_WEIGHT = 10        # % ошибок авторизации (HTTP 401)
ERROR_500_WEIGHT = 5         # % серверных ошибок (HTTP 500)

# Литовские ошибки для реалистичности
MOCK_ERRORS_PARTNER = [
    "Partnerio kodas jau egzistuoja su kitu tipu",
    "Neteisingas PVM kodas",
    "Partnerio pavadinimas privalomas",
    "Šalis neatpažinta: XX",
    "Per ilgas partnerio ID (max 20 simbolių)",
]

MOCK_ERRORS_STOCK = [
    "Prekės kodas jau egzistuoja",
    "Neteisingas prekės tipas (leidžiama: 1, 2)",
    "Matavimo vienetas neatpažintas",
    "PVM procentas negali būti neigiamas",
    "Per ilgas prekės pavadinimas",
    "Barkodas jau priskirtas kitai prekei",
]

MOCK_ERRORS_OPERATION = [
    "Operacijos ID jau egzistuoja",
    "Nežinomas operacijos tipas",
    "Partneris nerastas: UNKNOWN_ID",
    "Sandėlis nerastas: BAD_STORE",
    "Tuščias stock_lines masyvas",
    "Prekė stock_lines nerasta: MISSING_CODE",
    "Dokumento data netinkamo formato",
    "Suma neatitinka eilučių sumos",
    "externalDocId jau egzistuoja (dublikatas)",
    "PVM kodas neatpažintas: BAD_VAT",
]


# -- Счётчики --
stats = {
    "total": 0,
    "success": 0,
    "error_400": 0,
    "error_401": 0,
    "error_500": 0,
    "by_endpoint": {
        "partner": {"total": 0, "ok": 0, "err": 0},
        "stock": {"total": 0, "ok": 0, "err": 0},
        "setOperation": {"total": 0, "ok": 0, "err": 0},
        "getStoreList": {"total": 0, "ok": 0, "err": 0},
    },
}


# =========================================================
# Утилиты
# =========================================================
def _roll_response_type():
    """Случайно выбирает тип ответа по весам."""
    roll = random.randint(1, 100)
    if roll <= SUCCESS_WEIGHT:
        return 200
    elif roll <= SUCCESS_WEIGHT + ERROR_400_WEIGHT:
        return 400
    elif roll <= SUCCESS_WEIGHT + ERROR_400_WEIGHT + ERROR_401_WEIGHT:
        return 401
    else:
        return 500


def _check_basic_auth(request):
    """Проверяет наличие Basic Auth заголовка (любые credentials)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        return False, "Trūksta Authorization header"
    try:
        decoded = base64.b64decode(auth[6:]).decode("utf-8")
        if ":" not in decoded:
            return False, "Netinkamas Basic Auth formatas"
        user, pwd = decoded.split(":", 1)
        return True, f"user={user}"
    except Exception:
        return False, "Nepavyko dekoduoti Authorization header"


def _parse_json_body(request):
    """Парсит JSON из тела запроса."""
    try:
        if request.body:
            return json.loads(request.body), None
        return {}, None
    except json.JSONDecodeError as e:
        return None, f"Netinkamas JSON: {e}"


def _log_request(endpoint, method, body_preview, status_code, response_preview):
    """Красивый лог запроса в терминал."""
    stats["total"] += 1
    ep_stats = stats["by_endpoint"].get(endpoint, None)
    if ep_stats:
        ep_stats["total"] += 1

    if status_code == 200:
        stats["success"] += 1
        if ep_stats:
            ep_stats["ok"] += 1
        icon = "OK"
    else:
        key = f"error_{status_code}"
        stats[key] = stats.get(key, 0) + 1
        if ep_stats:
            ep_stats["err"] += 1
        icon = f"E{status_code}"

    print("")
    print("=" * 62)
    print(f"  #{stats['total']}  [{icon}]  {method} /{endpoint}/  ->  HTTP {status_code}")
    if body_preview:
        preview = str(body_preview)[:200]
        print(f"  Body: {preview}")
    if response_preview:
        print(f"  Resp: {str(response_preview)[:200]}")
    print(
        f"  Itogo: {stats['total']} | "
        f"OK: {stats['success']} | "
        f"400: {stats.get('error_400', 0)} | "
        f"401: {stats.get('error_401', 0)} | "
        f"500: {stats.get('error_500', 0)}"
    )
    ep = stats["by_endpoint"]
    print(
        f"  partner: {ep['partner']['ok']}/{ep['partner']['total']} | "
        f"stock: {ep['stock']['ok']}/{ep['stock']['total']} | "
        f"setOp: {ep['setOperation']['ok']}/{ep['setOperation']['total']} | "
        f"stores: {ep['getStoreList']['ok']}/{ep['getStoreList']['total']}"
    )
    print("=" * 62)


# =========================================================
# Endpoint handlers
# =========================================================

@csrf_exempt
def handle_partner(request):
    """POST /<client>/ws/dineta_api/v1/partner/"""
    if request.method != "POST":
        return JsonResponse({"info": "Dineta Mock: partner endpoint. Send POST."}, status=200)

    auth_ok, auth_msg = _check_basic_auth(request)

    body, parse_err = _parse_json_body(request)
    if parse_err:
        resp_data = {"error": parse_err}
        _log_request("partner", "POST", None, 400, resp_data)
        return JsonResponse(resp_data, status=400)

    partners = body.get("partners", []) if body else []
    count = len(partners)

    time.sleep(DELAY_SECONDS)

    status_code = _roll_response_type()
    if not auth_ok:
        status_code = 401

    if status_code == 200:
        results = []
        for p in partners:
            results.append({
                "id": p.get("id", "?"),
                "status": "ok",
                "message": "Partneris sukurtas/atnaujintas",
            })
        resp_data = {"status": "ok", "count": count, "results": results}

    elif status_code == 400:
        error_msg = random.choice(MOCK_ERRORS_PARTNER)
        if partners and random.random() > 0.5:
            bad_partner = random.choice(partners)
            error_msg = f"{error_msg} (partneris: {bad_partner.get('id', '?')})"
        resp_data = {"error": error_msg}

    elif status_code == 401:
        resp_data = {"error": auth_msg if not auth_ok else "Neteisingi prisijungimo duomenys"}

    else:  # 500
        resp_data = {"error": "Vidine serverio klaida. Bandykite veliau."}

    _log_request("partner", "POST", f"{count} partner(s)", status_code, resp_data)
    return JsonResponse(resp_data, status=status_code)


@csrf_exempt
def handle_stock(request):
    """POST /<client>/ws/dineta_api/v1/stock/"""
    if request.method != "POST":
        return JsonResponse({"info": "Dineta Mock: stock endpoint. Send POST."}, status=200)

    auth_ok, auth_msg = _check_basic_auth(request)

    body, parse_err = _parse_json_body(request)
    if parse_err:
        resp_data = {"error": parse_err}
        _log_request("stock", "POST", None, 400, resp_data)
        return JsonResponse(resp_data, status=400)

    stock_items = body.get("stock", []) if body else []
    count = len(stock_items)

    time.sleep(DELAY_SECONDS)

    status_code = _roll_response_type()
    if not auth_ok:
        status_code = 401

    if status_code == 200:
        results = []
        for s in stock_items:
            results.append({
                "id": s.get("id", "?"),
                "status": "ok",
                "message": "Preke sukurta/atnaujinta",
            })
        resp_data = {"status": "ok", "count": count, "results": results}

    elif status_code == 400:
        error_msg = random.choice(MOCK_ERRORS_STOCK)
        if stock_items and random.random() > 0.5:
            bad_item = random.choice(stock_items)
            error_msg = f"{error_msg} (preke: {bad_item.get('id', '?')})"
        resp_data = {"error": error_msg}

    elif status_code == 401:
        resp_data = {"error": auth_msg if not auth_ok else "Neteisingi prisijungimo duomenys"}

    else:
        resp_data = {"error": "Vidine serverio klaida. Bandykite veliau."}

    _log_request("stock", "POST", f"{count} stock item(s)", status_code, resp_data)
    return JsonResponse(resp_data, status=status_code)


@csrf_exempt
def handle_set_operation(request):
    """POST /<client>/ws/dineta_api/v1/setOperation/"""
    if request.method != "POST":
        return JsonResponse({"info": "Dineta Mock: setOperation endpoint. Send POST."}, status=200)

    auth_ok, auth_msg = _check_basic_auth(request)

    body, parse_err = _parse_json_body(request)
    if parse_err:
        resp_data = {"error": parse_err}
        _log_request("setOperation", "POST", None, 400, resp_data)
        return JsonResponse(resp_data, status=400)

    op_id = body.get("id", "?") if body else "?"
    op_type = body.get("op", "?") if body else "?"
    lines_count = len(body.get("stock_lines", [])) if body else 0
    blank_no = body.get("blankNo", "") if body else ""
    external_id = body.get("externalDocId", "") if body else ""

    time.sleep(DELAY_SECONDS)

    status_code = _roll_response_type()
    if not auth_ok:
        status_code = 401

    if status_code == 200:
        resp_data = {
            "status": "ok",
            "id": op_id,
            "op": op_type,
            "message": f"Operacija sukurta: {op_type} (blankNo={blank_no})",
            "stock_lines_count": lines_count,
            "externalDocId": external_id,
        }

    elif status_code == 400:
        error_msg = random.choice(MOCK_ERRORS_OPERATION)
        error_msg = error_msg.replace("UNKNOWN_ID", body.get("partnerId", "?") if body else "?")
        error_msg = error_msg.replace("BAD_STORE", body.get("storeFromId", "?") if body else "?")
        error_msg = error_msg.replace("MISSING_CODE", "PREKE001")
        error_msg = error_msg.replace("BAD_VAT", "PVM99")
        resp_data = {"error": error_msg, "id": op_id}

    elif status_code == 401:
        resp_data = {"error": auth_msg if not auth_ok else "Neteisingi prisijungimo duomenys"}

    else:
        resp_data = {"error": "Vidine serverio klaida. Bandykite veliau."}

    preview = f"id={op_id} op={op_type} lines={lines_count}"
    _log_request("setOperation", "POST", preview, status_code, resp_data)
    return JsonResponse(resp_data, status=status_code)


@csrf_exempt
def handle_get_store_list(request):
    """POST /<client>/ws/dineta_api/v1/getStoreList/ — проверка подключения."""
    auth_ok, auth_msg = _check_basic_auth(request)

    time.sleep(DELAY_SECONDS * 0.3)  # быстрее остальных

    if not auth_ok:
        resp_data = {"error": auth_msg}
        _log_request("getStoreList", "POST", None, 401, resp_data)
        return JsonResponse(resp_data, status=401)

    # Всегда успех если auth ок (это проверка подключения)
    resp_data = {
        "status": "ok",
        "stores": [
            {"id": "S1", "name": "Pagrindinis sandelis"},
            {"id": "S2", "name": "Atsarginis sandelis"},
            {"id": "PIRK", "name": "Pirkimu sandelis"},
        ],
    }
    _log_request("getStoreList", "POST", None, 200, resp_data)
    return JsonResponse(resp_data, status=200)


@csrf_exempt
def handle_catch_all(request, path_rest=""):
    """Ловит все неизвестные endpoints."""
    return JsonResponse({
        "error": f"Nezinomas endpoint: /ws/dineta_api/{path_rest}",
        "available_endpoints": [
            "v1/partner/",
            "v1/stock/",
            "v1/setOperation/",
            "v1/getStoreList/",
        ],
    }, status=404)


@csrf_exempt
def handle_root(request):
    """Корневая страница — информация о сервере."""
    html = f"""<html><body>
<h2>Dineta API Mock Server</h2>
<p>Veikiantys endpoint'ai:</p>
<ul>
  <li>POST <code>/&lt;client&gt;/ws/dineta_api/v1/partner/</code></li>
  <li>POST <code>/&lt;client&gt;/ws/dineta_api/v1/stock/</code></li>
  <li>POST <code>/&lt;client&gt;/ws/dineta_api/v1/setOperation/</code></li>
  <li>POST <code>/&lt;client&gt;/ws/dineta_api/v1/getStoreList/</code></li>
</ul>
<h3>Statistika:</h3>
<pre>{json.dumps(stats, indent=2, ensure_ascii=False)}</pre>
<h3>Test su curl:</h3>
<pre>
# Tikrinti prisijungima:
curl -X POST http://localhost:8878/mock_client/ws/dineta_api/v1/getStoreList/ \\
  -u test:test -H "Content-Type: application/json"

# Sukurti partneri:
curl -X POST http://localhost:8878/mock_client/ws/dineta_api/v1/partner/ \\
  -u test:test -H "Content-Type: application/json" \\
  -d '{{"partners": [{{"id": "P001", "name": "UAB Testas", "type": "2"}}]}}'

# Sukurti preke:
curl -X POST http://localhost:8878/mock_client/ws/dineta_api/v1/stock/ \\
  -u test:test -H "Content-Type: application/json" \\
  -d '{{"stock": [{{"id": "PRK001", "name": "Bananai", "type": "1", "unitid": "KG"}}]}}'

# Sukurti operacija:
curl -X POST http://localhost:8878/mock_client/ws/dineta_api/v1/setOperation/ \\
  -u test:test -H "Content-Type: application/json" \\
  -d '{{"id": "OP001", "op": "purchase", "blankNo": "SF-001", "partnerId": "P001", "stock_lines": []}}'
</pre>
</body></html>"""
    return HttpResponse(html, content_type="text/html; charset=utf-8", status=200)


# =========================================================
# URL routing
# =========================================================
# Dineta URL: /{client}/ws/dineta_api/v1/{method}/
# {client} = любая строка (mock_client, real_client, ...)
urlpatterns = [
    re_path(r"^[^/]+/ws/dineta_api/v1/partner/?$", handle_partner),
    re_path(r"^[^/]+/ws/dineta_api/v1/stock/?$", handle_stock),
    re_path(r"^[^/]+/ws/dineta_api/v1/setOperation/?$", handle_set_operation),
    re_path(r"^[^/]+/ws/dineta_api/v1/getStoreList/?$", handle_get_store_list),
    re_path(r"^[^/]+/ws/dineta_api/(?P<path_rest>.*)$", handle_catch_all),
    path("", handle_root),
]


# =========================================================
# Запуск
# =========================================================
if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    port = sys.argv[1] if len(sys.argv) > 1 else "8878"

    print("")
    print("=" * 62)
    print("  Dineta API Mock Server  (REST/JSON)")
    print("=" * 62)
    print("")
    print(f"  Base URL:  http://localhost:{port}")
    print(f"  API path:  /<client>/ws/dineta_api/v1/<method>/")
    print("")
    print("  Endpoints:")
    print("    POST /<client>/ws/dineta_api/v1/partner/")
    print("    POST /<client>/ws/dineta_api/v1/stock/")
    print("    POST /<client>/ws/dineta_api/v1/setOperation/")
    print("    POST /<client>/ws/dineta_api/v1/getStoreList/")
    print("")
    print(f"  Delay:     {DELAY_SECONDS} sek")
    print(f"  Success:   {SUCCESS_WEIGHT}%  |  Err400: {ERROR_400_WEIGHT}%"
          f"  |  Err401: {ERROR_401_WEIGHT}%  |  Err500: {ERROR_500_WEIGHT}%")
    print("")
    print("  +-----------------------------------------------+")
    print("  |  V DokSkenas -> Nustatymai -> Dineta:         |")
    print(f"  |  URL: http://localhost:{port}/mock_client/login.php")
    print("  |  Username: test                               |")
    print("  |  Password: test                               |")
    print("  +-----------------------------------------------+")
    print("")
    print("  Ctrl+C dlia ostanovki")
    print("=" * 62)
    print("")

    execute_from_command_line(["mock_server", "runserver", f"0.0.0.0:{port}", "--noreload"])