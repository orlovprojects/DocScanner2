"""
Dineta API Mock Server
======================
Запуск:
    python backend/docscanner_app/utils/dineta_fake_server.py --success 100 2>&1   # 100% success, порт 8878
    python dineta_mock_server.py --port 9000             # другой порт
    python backend/docscanner_app/utils/dineta_fake_server.py --success 60 2>&1            # 60% success, 40% errors (auto-distributed)
    python dineta_mock_server.py --success 70 --e400 15 --e401 10 --e500 5
    python dineta_mock_server.py --success 0             # 100% errors
    python dineta_mock_server.py --delay 1.5             # задержка 1.5 сек между ответами

Если --success указан без остальных, ошибки распределяются автоматически:
    50% от ошибок → 400, 30% → 401, 20% → 500

Сервер имитирует Dineta REST/JSON API v1.20:
    POST /<client>/ws/dineta_api/v1/partner/        — создание/обновление партнёров
    POST /<client>/ws/dineta_api/v1/stock/          — создание/обновление товаров
    POST /<client>/ws/dineta_api/v1/setOperation/   — создание операции (purchase/sale)
    POST /<client>/ws/dineta_api/v1/getStoreList/   — список складов (проверка подключения)

Авторизация: Basic Auth (любой логин/пароль принимается).

Подключение в DokSkenas → Nustatymai → Dineta:
    URL:      http://localhost:8878/mock_client/login.php
    Username: test
    Password: test

Ответы имитируют реальный Dineta API формат:
  partner  → {"PARTNER_ID": {"status": 200, "action": "insert", "message": "Created"}}
  stock    → {"STOCK_ID": {"status": 200, "action": "insert", "message": "Created"}}
  setOp    → "00012077984"  (просто строка с ID)
"""

import os
import sys
import json
import time
import random
import base64
import argparse
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
# Настройки (заполняются из CLI аргументов)
# =========================================================
class MockConfig:
    success_weight: int = 100
    error_400_weight: int = 0
    error_401_weight: int = 0
    error_500_weight: int = 0
    delay_seconds: float = 0.0

cfg = MockConfig()


# Литовские ошибки для реалистичности
MOCK_ERRORS_PARTNER_400 = [
    {"status": 400, "message": "Neužpildyti privalomi laukai: 'partner'"},
    {"status": 400, "message": "value too long for type character varying(20)"},
    {"status": 400, "message": "Netinkamas prekės pavainimas: Prekė"},
]

MOCK_ERRORS_STOCK_400 = [
    {"status": 400, "message": "PVM % neegzistuoja: 8"},
    {"status": 400, "message": "PVM % neegzistuoja: 5.5"},
    {"status": 400, "message": "PVM % neegzistuoja: 22"},
    {"status": 400, "message": "Netinkamas prekės pavainimas: Prekė"},
    {"status": 400, "message": "Nenaujiname prekės: ignore_stock_update"},
]

MOCK_ERRORS_OPERATION_500 = [
    "Partneris {partner_id} neegzistuoja!",
    "Operation is confirmed. Deletion is forbidden!",
    "<script> alert('insert or update on table t_stockd violates foreign key constraint t_stockd_f_hid_fkey'); </script>",
    "<script> alert('null value in column f_employee_id of relation t_employee_reason violates not-null constraint'); </script>",
    "<script> alert('invalid input syntax for type date: null'); </script>",
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

# -- Внутренний счётчик для Dineta operation ID --
_operation_counter = [10000]


# =========================================================
# Утилиты
# =========================================================
def _roll_response_type():
    """Случайно выбирает тип ответа по весам."""
    roll = random.randint(1, 100)
    if roll <= cfg.success_weight:
        return 200
    elif roll <= cfg.success_weight + cfg.error_400_weight:
        return 400
    elif roll <= cfg.success_weight + cfg.error_400_weight + cfg.error_401_weight:
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


def _next_operation_id():
    """Генерирует следующий Dineta operation ID."""
    _operation_counter[0] += 1
    return f"{_operation_counter[0]:011d}"


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
        icon = "\033[92m✓\033[0m"
        status_str = f"\033[92m{status_code}\033[0m"
    elif status_code == 400:
        stats["error_400"] = stats.get("error_400", 0) + 1
        if ep_stats:
            ep_stats["err"] += 1
        icon = "\033[93m✗\033[0m"
        status_str = f"\033[93m{status_code}\033[0m"
    elif status_code == 401:
        stats["error_401"] = stats.get("error_401", 0) + 1
        if ep_stats:
            ep_stats["err"] += 1
        icon = "\033[91m✗\033[0m"
        status_str = f"\033[91m{status_code}\033[0m"
    else:
        stats["error_500"] = stats.get("error_500", 0) + 1
        if ep_stats:
            ep_stats["err"] += 1
        icon = "\033[91m✗\033[0m"
        status_str = f"\033[91m{status_code}\033[0m"

    print(f"  {icon} #{stats['total']:>4}  {method} /{endpoint}/  → HTTP {status_str}", end="")
    if body_preview:
        print(f"  [{body_preview}]", end="")
    print()

    resp_str = str(response_preview)[:120] if response_preview else ""
    if resp_str:
        print(f"         └─ {resp_str}")


def _print_stats():
    """Выводит текущую статистику."""
    ep = stats["by_endpoint"]
    total = stats["total"] or 1
    print(f"\n  Statistika: {stats['total']} užklausų | "
          f"\033[92m{stats['success']} OK\033[0m | "
          f"\033[93m{stats.get('error_400', 0)} E400\033[0m | "
          f"\033[91m{stats.get('error_401', 0)} E401\033[0m | "
          f"\033[91m{stats.get('error_500', 0)} E500\033[0m | "
          f"sėkmė: {stats['success']*100//total}%")
    print(f"  partner: {ep['partner']['ok']}/{ep['partner']['total']} | "
          f"stock: {ep['stock']['ok']}/{ep['stock']['total']} | "
          f"setOp: {ep['setOperation']['ok']}/{ep['setOperation']['total']} | "
          f"stores: {ep['getStoreList']['ok']}/{ep['getStoreList']['total']}")
    print()


# =========================================================
# Endpoint handlers — реалистичный Dineta формат
# =========================================================

@csrf_exempt
def handle_partner(request):
    """POST /<client>/ws/dineta_api/v1/partner/"""
    if request.method != "POST":
        return JsonResponse({"info": "Dineta Mock: partner endpoint. Send POST."}, status=200)

    auth_ok, auth_msg = _check_basic_auth(request)

    body, parse_err = _parse_json_body(request)
    if parse_err:
        _log_request("partner", "POST", None, 400, parse_err)
        return JsonResponse({"error": parse_err}, status=400)

    partners = body.get("partners", []) if body else []

    time.sleep(cfg.delay_seconds)

    status_code = _roll_response_type()
    if not auth_ok:
        status_code = 401

    if status_code == 200:
        # Реалистичный Dineta ответ: {"PARTNER_ID": {"status": 200, "action": "insert", "message": "Created"}}
        resp_data = {}
        for p in partners:
            pid = p.get("id", "UNKNOWN")
            action = random.choice(["insert", "update"])
            resp_data[pid] = {
                "status": 200,
                "action": action,
                "message": "Created" if action == "insert" else "Updated",
            }
        resp = JsonResponse(resp_data, status=200)

    elif status_code == 400:
        # Реалистичная ошибка
        mock_err = random.choice(MOCK_ERRORS_PARTNER_400)
        resp_data = {}
        for p in partners:
            pid = p.get("id", "UNKNOWN")
            resp_data[pid] = dict(mock_err)
        resp = JsonResponse(resp_data, status=400)

    elif status_code == 401:
        resp = HttpResponse(status=401)
        resp_data = "(no body)"

    else:  # 500
        resp = HttpResponse(status=500)
        resp_data = "(no body)"

    preview = f"{len(partners)} partner(s)"
    _log_request("partner", "POST", preview, status_code, resp_data if status_code in (200, 400) else None)
    if stats["total"] % 10 == 0:
        _print_stats()
    return resp


@csrf_exempt
def handle_stock(request):
    """POST /<client>/ws/dineta_api/v1/stock/"""
    if request.method != "POST":
        return JsonResponse({"info": "Dineta Mock: stock endpoint. Send POST."}, status=200)

    auth_ok, auth_msg = _check_basic_auth(request)

    body, parse_err = _parse_json_body(request)
    if parse_err:
        _log_request("stock", "POST", None, 400, parse_err)
        return JsonResponse({"error": parse_err}, status=400)

    stock_items = body.get("stock", []) if body else []

    time.sleep(cfg.delay_seconds)

    status_code = _roll_response_type()
    if not auth_ok:
        status_code = 401

    if status_code == 200:
        resp_data = {}
        for s in stock_items:
            sid = str(s.get("id", "UNKNOWN")).upper()
            action = random.choice(["insert", "update"])
            resp_data[sid] = {
                "status": 200,
                "action": action,
                "message": "Created" if action == "insert" else "Updated",
            }
        resp = JsonResponse(resp_data, status=200)

    elif status_code == 400:
        resp_data = {}
        for s in stock_items:
            sid = str(s.get("id", "UNKNOWN")).upper()
            mock_err = random.choice(MOCK_ERRORS_STOCK_400)
            resp_data[sid] = dict(mock_err)
        resp = JsonResponse(resp_data, status=400)

    elif status_code == 401:
        resp = HttpResponse(status=401)
        resp_data = "(no body)"

    else:
        resp = HttpResponse(status=500)
        resp_data = "(no body)"

    preview = f"{len(stock_items)} item(s)"
    _log_request("stock", "POST", preview, status_code, resp_data if status_code in (200, 400) else None)
    if stats["total"] % 10 == 0:
        _print_stats()
    return resp


@csrf_exempt
def handle_set_operation(request):
    """POST /<client>/ws/dineta_api/v1/setOperation/"""
    if request.method != "POST":
        return JsonResponse({"info": "Dineta Mock: setOperation endpoint. Send POST."}, status=200)

    auth_ok, auth_msg = _check_basic_auth(request)

    body, parse_err = _parse_json_body(request)
    if parse_err:
        _log_request("setOperation", "POST", None, 400, parse_err)
        return JsonResponse({"error": parse_err}, status=400)

    op_id = body.get("id", "?") if body else "?"
    op_type = body.get("op", "?") if body else "?"
    lines_count = len(body.get("stock_lines", [])) if body else 0
    partner_id = body.get("partnerId", "?") if body else "?"

    time.sleep(cfg.delay_seconds)

    status_code = _roll_response_type()
    if not auth_ok:
        status_code = 401

    if status_code == 200:
        # Реалистичный ответ: просто строка с ID
        dineta_id = _next_operation_id()
        resp = HttpResponse(
            json.dumps(dineta_id),
            content_type="application/json",
            status=200,
        )
        resp_data = dineta_id

    elif status_code == 400:
        # HTTP 405 для "already confirmed"
        if random.random() < 0.2:
            resp = HttpResponse(
                json.dumps("Operation is confirmed. Deletion is forbidden!"),
                content_type="application/json",
                status=405,
            )
            resp_data = "405: Operation confirmed"
            status_code = 405
        else:
            error_msg = random.choice(MOCK_ERRORS_OPERATION_500)
            error_msg = error_msg.replace("{partner_id}", partner_id)
            resp = HttpResponse(
                json.dumps(error_msg),
                content_type="application/json",
                status=500,
            )
            resp_data = error_msg[:100]
            status_code = 500

    elif status_code == 401:
        resp = HttpResponse(status=401)
        resp_data = "(no body)"

    else:  # 500
        resp = HttpResponse(status=500)
        resp_data = "(no body)"

    preview = f"op={op_type} lines={lines_count} partner={partner_id}"
    _log_request("setOperation", "POST", preview, status_code, resp_data)
    if stats["total"] % 10 == 0:
        _print_stats()
    return resp


@csrf_exempt
def handle_get_store_list(request):
    """POST /<client>/ws/dineta_api/v1/getStoreList/ — проверка подключения."""
    auth_ok, auth_msg = _check_basic_auth(request)

    time.sleep(cfg.delay_seconds * 0.3)

    if not auth_ok:
        _log_request("getStoreList", "POST", None, 401, auth_msg)
        return HttpResponse(status=401)

    # Всегда успех если auth ок (это проверка подключения)
    resp_data = {
        "stores": [
            {"storeid": "S1", "store_name": "Pagrindinis sandėlis"},
            {"storeid": "S2", "store_name": "Atsarginis sandėlis"},
        ],
    }
    _log_request("getStoreList", "POST", None, 200, "2 stores")
    return JsonResponse(resp_data, status=200)


@csrf_exempt
def handle_catch_all(request, path_rest=""):
    """Ловит все неизвестные endpoints."""
    return JsonResponse({
        "error": f"Nežinomas endpoint: /ws/dineta_api/{path_rest}",
        "available": ["v1/partner/", "v1/stock/", "v1/setOperation/", "v1/getStoreList/"],
    }, status=404)


@csrf_exempt
def handle_root(request):
    """Корневая страница — статистика."""
    html = f"""<html><body style="font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 20px;">
<h2 style="color: #00d4aa;">Dineta API Mock Server</h2>
<h3>Konfigūracija:</h3>
<pre style="color: #7ec8e3;">
  Success: {cfg.success_weight}%  |  Error 400: {cfg.error_400_weight}%  |  Error 401: {cfg.error_401_weight}%  |  Error 500: {cfg.error_500_weight}%
  Delay:   {cfg.delay_seconds}s
</pre>
<h3>Statistika:</h3>
<pre style="color: #ffd700;">{json.dumps(stats, indent=2, ensure_ascii=False)}</pre>
<h3>Endpoints:</h3>
<ul>
  <li>POST <code>/{'{client}'}/ws/dineta_api/v1/partner/</code></li>
  <li>POST <code>/{'{client}'}/ws/dineta_api/v1/stock/</code></li>
  <li>POST <code>/{'{client}'}/ws/dineta_api/v1/setOperation/</code></li>
  <li>POST <code>/{'{client}'}/ws/dineta_api/v1/getStoreList/</code></li>
</ul>
<h3>DokSkenas nustatymai:</h3>
<pre style="color: #00d4aa;">
  URL:      http://localhost:{PORT}/mock_client/login.php
  Username: test
  Password: test
</pre>
</body></html>"""
    return HttpResponse(html, content_type="text/html; charset=utf-8", status=200)


# =========================================================
# URL routing
# =========================================================
urlpatterns = [
    re_path(r"^[^/]+/ws/dineta_api/v1/partner/?$", handle_partner),
    re_path(r"^[^/]+/ws/dineta_api/v1/stock/?$", handle_stock),
    re_path(r"^[^/]+/ws/dineta_api/v1/setOperation/?$", handle_set_operation),
    re_path(r"^[^/]+/ws/dineta_api/v1/getStoreList/?$", handle_get_store_list),
    re_path(r"^[^/]+/ws/dineta_api/(?P<path_rest>.*)$", handle_catch_all),
    path("", handle_root),
]


# =========================================================
# CLI + Запуск
# =========================================================
PORT = 8878  # default, обновляется в main

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Dineta API Mock Server",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--port", type=int, default=8878, help="Порт (default: 8878)")
    parser.add_argument("--success", type=int, default=100,
                        help="Процент успешных ответов 0-100 (default: 100)")
    parser.add_argument("--e400", type=int, default=None,
                        help="Процент ошибок 400 (auto если не указан)")
    parser.add_argument("--e401", type=int, default=None,
                        help="Процент ошибок 401 (auto если не указан)")
    parser.add_argument("--e500", type=int, default=None,
                        help="Процент ошибок 500 (auto если не указан)")
    parser.add_argument("--delay", type=float, default=0.0,
                        help="Задержка перед ответом в секундах (default: 0)")

    args = parser.parse_args()

    # Validate success range
    success = max(0, min(100, args.success))
    error_budget = 100 - success

    if args.e400 is not None or args.e401 is not None or args.e500 is not None:
        # Ручное распределение
        e400 = args.e400 or 0
        e401 = args.e401 or 0
        e500 = args.e500 or 0
        total = success + e400 + e401 + e500
        if total != 100:
            print(f"\n  ⚠ Suma procentų: {total}% (turi būti 100%). Koreguojama automatiškai.")
            # Нормализуем
            if total > 0:
                factor = 100 / total
                success = int(success * factor)
                e400 = int(e400 * factor)
                e401 = int(e401 * factor)
                e500 = 100 - success - e400 - e401
    else:
        # Автоматическое распределение ошибок: 50% → 400, 30% → 401, 20% → 500
        e400 = int(error_budget * 0.50)
        e401 = int(error_budget * 0.30)
        e500 = error_budget - e400 - e401

    cfg.success_weight = success
    cfg.error_400_weight = e400
    cfg.error_401_weight = e401
    cfg.error_500_weight = e500
    cfg.delay_seconds = args.delay
    PORT = args.port

    print()
    print("\033[96m" + "=" * 62 + "\033[0m")
    print("\033[96m  Dineta API Mock Server v2.0\033[0m")
    print("\033[96m" + "=" * 62 + "\033[0m")
    print()
    print(f"  🌐 http://localhost:{PORT}")
    print(f"  📡 /<client>/ws/dineta_api/v1/<method>/")
    print()

    # Цветная полоска процентов
    bar_len = 40
    s_len = int(bar_len * success / 100)
    e4_len = int(bar_len * e400 / 100)
    e1_len = int(bar_len * e401 / 100)
    e5_len = bar_len - s_len - e4_len - e1_len

    bar = (
        f"\033[92m{'█' * s_len}\033[0m"
        f"\033[93m{'█' * e4_len}\033[0m"
        f"\033[91m{'█' * e1_len}\033[0m"
        f"\033[31m{'█' * e5_len}\033[0m"
    )
    print(f"  Atsakymai: [{bar}]")
    print(f"    \033[92m■\033[0m Success: {success}%   "
          f"\033[93m■\033[0m Error 400: {e400}%   "
          f"\033[91m■\033[0m Error 401: {e401}%   "
          f"\033[31m■\033[0m Error 500: {e500}%")
    if cfg.delay_seconds > 0:
        print(f"  ⏱ Delay: {cfg.delay_seconds}s")
    print()
    print("  ┌─────────────────────────────────────────┐")
    print("  │  DokSkenas → Nustatymai → Dineta:       │")
    print(f"  │  URL: http://localhost:{PORT}/mock_client/login.php")
    print("  │  Username: test                         │")
    print("  │  Password: test                         │")
    print("  └─────────────────────────────────────────┘")
    print()
    print("  Ctrl+C sustabdyti")
    print("\033[96m" + "=" * 62 + "\033[0m")
    print()

    from django.core.management import execute_from_command_line
    execute_from_command_line(["mock_server", "runserver", f"0.0.0.0:{PORT}", "--noreload"])