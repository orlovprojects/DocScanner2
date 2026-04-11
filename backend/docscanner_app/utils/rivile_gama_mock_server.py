"""
Rivile GAMA API v2 Mock Server
================================
Запуск:
    python rivile_gama_mock_server.py          # порт 8879
    python rivile_gama_mock_server.py 9000     # порт 9000

Сервер имитирует Rivile GAMA REST API v2:
    POST /client/v2   — единый endpoint, метод определяется в JSON body

Методы:
    EDIT_N08_FULL  — создание контрагента + банк. реквизиты (N33)
    EDIT_N17       — создание товара/услуги
    EDIT_N25       — создание кода
    EDIT_I06_FULL  — создание документа + строки (I07)
    GET_N08_LIST   — список контрагентов (для verify)

Авторизация: Header ApiKey (любой непустой ключ принимается).

Подключение:
    В DokSkenas → Nustatymai → Rivile GAMA API:
      Перезаписать RIVILE_API_URL на http://localhost:8879/client/v2
      API Key: test-api-key-12345

Ответы (настраиваемые веса):
  ~60% — Success  (HTTP 200)
  ~15% — Duplicate (HTTP 400, код 5008/2011/19017)
  ~15% — Error    (HTTP 400, бизнес-ошибка)
  ~5%  — Partial  (HTTP 207, для I06_FULL)
  ~3%  — Auth err (HTTP 401)
  ~2%  — Server   (HTTP 500)
"""

import os
import sys
import json
import time
import random
import django
from django.conf import settings as django_settings
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.urls import path

# -- Django minimal config --
if not django_settings.configured:
    django_settings.configure(
        DEBUG=True,
        SECRET_KEY="rivile-gama-mock-server-secret-key-not-for-production",
        ROOT_URLCONF=__name__,
        ALLOWED_HOSTS=["*"],
        MIDDLEWARE=[],
    )
    django.setup()


# =========================================================
# Настройки мок-сервера
# =========================================================
DELAY_SECONDS = 0.3          # задержка перед ответом (секунды)

# Веса для СПРАВОЧНИКОВ (N08, N17, N25)
REF_SUCCESS_WEIGHT = 100
REF_DUPLICATE_WEIGHT = 0
REF_ERROR_400_WEIGHT = 0
REF_ERROR_401_WEIGHT = 0
REF_ERROR_500_WEIGHT = 0

# Веса для ДОКУМЕНТОВ (I06_FULL)
DOC_SUCCESS_WEIGHT = 100
DOC_PARTIAL_207_WEIGHT = 0
DOC_ERROR_400_WEIGHT = 0
DOC_ERROR_401_WEIGHT = 0
DOC_ERROR_500_WEIGHT = 0

# Дубликат-коды
DUPLICATE_CODES = {
    "EDIT_N08_FULL": "2011",
    "EDIT_N17": "5008",
    "EDIT_N25": "19017",
}

# Литовские ошибки для реалистичности
MOCK_ERRORS = {
    "EDIT_N08_FULL": [
        "Neteisingas kliento kodas",
        "Kliento pavadinimas privalomas",
        "Neteisingas PVM kodas formatas",
        "Šalies kodas neatpažintas",
        "N08_KODAS_KS per ilgas (max 20 simbolių)",
        "Netinkamas N08_TIPAS reikšmė",
    ],
    "EDIT_N17": [
        "Prekės kodas per ilgas",
        "Netinkamas N17_TIPAS (leidžiama: 1, 2)",
        "Matavimo vienetas neatpažintas",
        "Prekės pavadinimas privalomas",
        "N17_KODAS_DS neatitinka jokio ryšio kodo",
    ],
    "EDIT_N25": [
        "Kodo reikšmė per ilga",
        "Netinkamas N25_TIPAS",
        "Sąskaitos kodas neegzistuoja",
        "N25_KODAS_BS privalomas",
    ],
    "EDIT_I06_FULL": [
        "Operacijos data netinkamo formato",
        "Klientas nerastas: N08_KODAS_KS",
        "Prekė I07 nerasta: I07_KODAS",
        "Dokumenta su tokiu numeriu jau egzistuoja",
        "I06_DOK_NR privalomas",
        "Tuščias I07 masyvas",
        "PVM procentas netinkamas eilutėje",
        "Suma neatitinka eilučių sumos",
        "Valiutos kursas privalomas kai VAL_POZ=1",
    ],
    "EDIT_I06_FULL_207": [
        "Eilutė 2: Prekė nerasta, sukurta automatiškai",
        "Eilutė 3: PVM procentas pakoreguotas",
        "Eilutė 1: Kiekis apvalintas iki 4 skaičių",
    ],
}

# -- Счётчики --
stats = {
    "total": 0,
    "success_200": 0,
    "partial_207": 0,
    "duplicate": 0,
    "error_400": 0,
    "error_401": 0,
    "error_500": 0,
    "by_method": {
        "EDIT_N08_FULL": {"total": 0, "ok": 0, "dup": 0, "err": 0},
        "EDIT_N17": {"total": 0, "ok": 0, "dup": 0, "err": 0},
        "EDIT_N25": {"total": 0, "ok": 0, "dup": 0, "err": 0},
        "EDIT_I06_FULL": {"total": 0, "ok": 0, "207": 0, "err": 0},
        "GET_N08_LIST": {"total": 0, "ok": 0, "err": 0},
        "UNKNOWN": {"total": 0, "ok": 0, "err": 0},
    },
}

# Авто-инкремент для I06_KODAS_PO
_next_kodas_po = [1000]


# =========================================================
# Утилиты
# =========================================================
def _roll_ref_response():
    """Случайный тип ответа для справочников (N08/N17/N25)."""
    roll = random.randint(1, 100)
    cumul = REF_SUCCESS_WEIGHT
    if roll <= cumul:
        return "success"
    cumul += REF_DUPLICATE_WEIGHT
    if roll <= cumul:
        return "duplicate"
    cumul += REF_ERROR_400_WEIGHT
    if roll <= cumul:
        return "error_400"
    cumul += REF_ERROR_401_WEIGHT
    if roll <= cumul:
        return "error_401"
    return "error_500"


def _roll_doc_response():
    """Случайный тип ответа для документов (I06_FULL)."""
    roll = random.randint(1, 100)
    cumul = DOC_SUCCESS_WEIGHT
    if roll <= cumul:
        return "success"
    cumul += DOC_PARTIAL_207_WEIGHT
    if roll <= cumul:
        return "partial_207"
    cumul += DOC_ERROR_400_WEIGHT
    if roll <= cumul:
        return "error_400"
    cumul += DOC_ERROR_401_WEIGHT
    if roll <= cumul:
        return "error_401"
    return "error_500"


def _check_api_key(request):
    """Проверяет наличие ApiKey header."""
    key = request.headers.get("ApiKey", "").strip()
    if not key:
        return False, "Trūksta ApiKey header"
    return True, key


def _next_po():
    """Генерирует следующий I06_KODAS_PO."""
    val = _next_kodas_po[0]
    _next_kodas_po[0] += 1
    return f"PO{val:06d}"


def _build_error_response(method, error_msg, entity_tag=""):
    """Строит ответ ошибки в формате Rivile API."""
    code = "9999"
    if method in DUPLICATE_CODES:
        code = "9999"  # бизнес-ошибка, не дубликат

    return {
        "errorMessage": error_msg,
        "errors": {
            "error": [
                {
                    "dataErrors": {
                        "dataError": [
                            {
                                "tag": entity_tag or method,
                                "code": code,
                                "message": error_msg,
                            }
                        ]
                    }
                }
            ]
        },
    }


def _build_duplicate_response(method, entity_code):
    """Строит ответ дубликата."""
    dup_code = DUPLICATE_CODES.get(method, "5008")

    messages = {
        "2011": f"Egzistuoja toks kliento kodas: {entity_code}",
        "5008": f"Tokia prekė/paslauga jau yra: {entity_code}",
        "19017": f"Toks kodas jau yra: {entity_code}",
    }

    return {
        "errorMessage": messages.get(dup_code, f"Duplicate: {entity_code}"),
        "errors": {
            "error": [
                {
                    "dataErrors": {
                        "dataError": [
                            {
                                "tag": method.replace("EDIT_", ""),
                                "code": dup_code,
                                "message": messages.get(dup_code, "Duplicate"),
                            }
                        ]
                    }
                }
            ]
        },
    }


def _log(method, status_code, response_type, entity="", extra=""):
    """Лог в терминал."""
    stats["total"] += 1
    ms = stats["by_method"].get(method, stats["by_method"]["UNKNOWN"])
    ms["total"] += 1

    if status_code == 200:
        stats["success_200"] += 1
        ms["ok"] += 1
        icon = "✅ 200"
    elif status_code == 207:
        stats["partial_207"] += 1
        ms["207"] = ms.get("207", 0) + 1
        icon = "⚠️  207"
    elif response_type == "duplicate":
        stats["duplicate"] += 1
        ms["dup"] = ms.get("dup", 0) + 1
        icon = "🔄 400 DUP"
    elif status_code == 400:
        stats["error_400"] += 1
        ms["err"] += 1
        icon = "❌ 400"
    elif status_code == 401:
        stats["error_401"] += 1
        ms["err"] += 1
        icon = "🔒 401"
    else:
        stats["error_500"] += 1
        ms["err"] += 1
        icon = "💥 500"

    ent_str = f"  entity={entity}" if entity else ""
    ext_str = f"  {extra}" if extra else ""

    print(f"  #{stats['total']:>4}  {icon:<12}  {method:<16}{ent_str}{ext_str}")


def _print_stats():
    """Печатает текущую статистику."""
    m = stats["by_method"]
    print(
        f"       "
        f"N08: {m['EDIT_N08_FULL']['ok']}/{m['EDIT_N08_FULL']['total']}  "
        f"N17: {m['EDIT_N17']['ok']}/{m['EDIT_N17']['total']}  "
        f"N25: {m['EDIT_N25']['ok']}/{m['EDIT_N25']['total']}  "
        f"I06: {m['EDIT_I06_FULL']['ok']}/{m['EDIT_I06_FULL']['total']}  "
        f"| dup={stats['duplicate']} err={stats['error_400']+stats['error_401']+stats['error_500']}"
    )


# =========================================================
# Обработчики методов
# =========================================================

def _handle_verify(body):
    """GET_N08_LIST — проверка API ключа."""
    ms = stats["by_method"]["GET_N08_LIST"]
    ms["total"] += 1
    ms["ok"] += 1
    _log("GET_N08_LIST", 200, "success", extra="verify ok")
    return JsonResponse({"N08_LIST": []}, status=200)


def _handle_n08(body):
    """EDIT_N08_FULL — контрагент."""
    n08_data = body.get("data", {}).get("N08", {})
    entity_code = n08_data.get("N08_KODAS_KS", "?")
    name = n08_data.get("N08_PAV", "")

    time.sleep(DELAY_SECONDS)
    roll = _roll_ref_response()

    if roll == "success":
        resp = {"N08": {"N08_KODAS_KS": entity_code, "N08_PAV": name}}
        _log("EDIT_N08_FULL", 200, roll, entity=entity_code)
        return JsonResponse(resp, status=200)

    if roll == "duplicate":
        resp = _build_duplicate_response("EDIT_N08_FULL", entity_code)
        _log("EDIT_N08_FULL", 400, roll, entity=entity_code)
        return JsonResponse(resp, status=400)

    if roll == "error_400":
        msg = random.choice(MOCK_ERRORS["EDIT_N08_FULL"])
        resp = _build_error_response("EDIT_N08_FULL", msg, "N08")
        _log("EDIT_N08_FULL", 400, roll, entity=entity_code, extra=msg[:50])
        return JsonResponse(resp, status=400)

    if roll == "error_401":
        _log("EDIT_N08_FULL", 401, roll, entity=entity_code)
        return JsonResponse({"errorMessage": "Unauthorized"}, status=401)

    # error_500
    _log("EDIT_N08_FULL", 500, roll, entity=entity_code)
    return JsonResponse({"errorMessage": "Internal Server Error"}, status=500)


def _handle_n17(body):
    """EDIT_N17 — товар/услуга."""
    n17_data = body.get("data", {}).get("N17", {})
    entity_code = n17_data.get("N17_KODAS_PS", "?")
    tipas = n17_data.get("N17_TIPAS", "?")

    time.sleep(DELAY_SECONDS)
    roll = _roll_ref_response()

    if roll == "success":
        resp = {"N17": {"N17_KODAS_PS": entity_code, "N17_TIPAS": tipas}}
        _log("EDIT_N17", 200, roll, entity=entity_code)
        return JsonResponse(resp, status=200)

    if roll == "duplicate":
        resp = _build_duplicate_response("EDIT_N17", entity_code)
        _log("EDIT_N17", 400, roll, entity=entity_code)
        return JsonResponse(resp, status=400)

    if roll == "error_400":
        msg = random.choice(MOCK_ERRORS["EDIT_N17"])
        resp = _build_error_response("EDIT_N17", msg, "N17")
        _log("EDIT_N17", 400, roll, entity=entity_code, extra=msg[:50])
        return JsonResponse(resp, status=400)

    if roll == "error_401":
        _log("EDIT_N17", 401, roll, entity=entity_code)
        return JsonResponse({"errorMessage": "Unauthorized"}, status=401)

    _log("EDIT_N17", 500, roll, entity=entity_code)
    return JsonResponse({"errorMessage": "Internal Server Error"}, status=500)


def _handle_n25(body):
    """EDIT_N25 — код."""
    n25_data = body.get("data", {}).get("N25", {})
    entity_code = n25_data.get("N25_KODAS_BS", "?")

    time.sleep(DELAY_SECONDS)
    roll = _roll_ref_response()

    if roll == "success":
        resp = {"N25": {"N25_KODAS_BS": entity_code}}
        _log("EDIT_N25", 200, roll, entity=entity_code)
        return JsonResponse(resp, status=200)

    if roll == "duplicate":
        resp = _build_duplicate_response("EDIT_N25", entity_code)
        _log("EDIT_N25", 400, roll, entity=entity_code)
        return JsonResponse(resp, status=400)

    if roll == "error_400":
        msg = random.choice(MOCK_ERRORS["EDIT_N25"])
        resp = _build_error_response("EDIT_N25", msg, "N25")
        _log("EDIT_N25", 400, roll, entity=entity_code, extra=msg[:50])
        return JsonResponse(resp, status=400)

    if roll == "error_401":
        _log("EDIT_N25", 401, roll, entity=entity_code)
        return JsonResponse({"errorMessage": "Unauthorized"}, status=401)

    _log("EDIT_N25", 500, roll, entity=entity_code)
    return JsonResponse({"errorMessage": "Internal Server Error"}, status=500)


def _handle_i06(body):
    """EDIT_I06_FULL — документ + строки."""
    i06_data = body.get("data", {}).get("I06", {})
    dok_nr = i06_data.get("I06_DOK_NR", "?")
    kodas_ks = i06_data.get("I06_KODAS_KS", "?")
    op_tip = i06_data.get("I06_OP_TIP", "?")
    lines = i06_data.get("I07", [])
    lines_count = len(lines)
    kodas_po = _next_po()

    time.sleep(DELAY_SECONDS)
    roll = _roll_doc_response()

    if roll == "success":
        resp = {
            "I06": {
                "I06_KODAS_PO": kodas_po,
                "I06_DOK_NR": dok_nr,
                "I06_KODAS_KS": kodas_ks,
                "I06_OP_TIP": op_tip,
            }
        }
        _log("EDIT_I06_FULL", 200, roll, entity=dok_nr,
             extra=f"KS={kodas_ks} lines={lines_count} → {kodas_po}")
        _print_stats()
        return JsonResponse(resp, status=200)

    if roll == "partial_207":
        warnings = random.sample(
            MOCK_ERRORS["EDIT_I06_FULL_207"],
            k=min(2, len(MOCK_ERRORS["EDIT_I06_FULL_207"])),
        )
        resp = {
            "I06": {
                "I06_KODAS_PO": kodas_po,
                "I06_DOK_NR": dok_nr,
            },
            "errors": {
                "error": [
                    {
                        "dataErrors": {
                            "dataError": [
                                {"tag": "I07", "code": "3001", "message": w}
                                for w in warnings
                            ]
                        }
                    }
                ]
            },
        }
        _log("EDIT_I06_FULL", 207, roll, entity=dok_nr,
             extra=f"→ {kodas_po} warnings={len(warnings)}")
        _print_stats()
        return JsonResponse(resp, status=207)

    if roll == "error_400":
        msg = random.choice(MOCK_ERRORS["EDIT_I06_FULL"])
        msg = msg.replace("N08_KODAS_KS", kodas_ks)
        if lines:
            first_kodas = lines[0].get("I07_KODAS", "?")
            msg = msg.replace("I07_KODAS", first_kodas)
        resp = _build_error_response("EDIT_I06_FULL", msg, "I06")
        _log("EDIT_I06_FULL", 400, roll, entity=dok_nr, extra=msg[:50])
        _print_stats()
        return JsonResponse(resp, status=400)

    if roll == "error_401":
        _log("EDIT_I06_FULL", 401, roll, entity=dok_nr)
        _print_stats()
        return JsonResponse({"errorMessage": "Unauthorized"}, status=401)

    # error_500
    _log("EDIT_I06_FULL", 500, roll, entity=dok_nr)
    _print_stats()
    return JsonResponse({"errorMessage": "Internal Server Error"}, status=500)


# =========================================================
# Единый endpoint
# =========================================================

METHOD_HANDLERS = {
    "EDIT_N08_FULL": _handle_n08,
    "EDIT_N17": _handle_n17,
    "EDIT_N25": _handle_n25,
    "EDIT_I06_FULL": _handle_i06,
    "GET_N08_LIST": _handle_verify,
}


@csrf_exempt
def handle_api(request):
    """POST /client/v2 — единый endpoint Rivile GAMA API."""
    if request.method == "GET":
        return _render_info_page()

    if request.method != "POST":
        return JsonResponse({"errorMessage": "Only POST allowed"}, status=405)

    # Auth
    auth_ok, auth_msg = _check_api_key(request)
    if not auth_ok:
        _log("AUTH", 401, "error_401", extra=auth_msg)
        return JsonResponse({"errorMessage": auth_msg}, status=401)

    # Parse body
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError as e:
        return JsonResponse({"errorMessage": f"JSON parse error: {e}"}, status=400)

    method = body.get("method", "")

    handler = METHOD_HANDLERS.get(method)
    if not handler:
        _log("UNKNOWN", 400, "error_400", extra=f"method={method}")
        return JsonResponse(
            {"errorMessage": f"Nežinomas metodas: {method}"},
            status=400,
        )

    return handler(body)


# =========================================================
# Info page
# =========================================================

def _render_info_page():
    html = f"""<html><body>
<h2>Rivile GAMA API v2 Mock Server</h2>
<p>Endpoint: <code>POST /client/v2</code></p>
<p>Auth: Header <code>ApiKey: your-key</code></p>

<h3>Metodai:</h3>
<ul>
  <li><code>EDIT_N08_FULL</code> — kontrahentai</li>
  <li><code>EDIT_N17</code> — prekės/paslaugos</li>
  <li><code>EDIT_N25</code> — kodai</li>
  <li><code>EDIT_I06_FULL</code> — dokumentai + eilutės</li>
  <li><code>GET_N08_LIST</code> — patikrinti API raktą</li>
</ul>

<h3>Statistika:</h3>
<pre>{json.dumps(stats, indent=2, ensure_ascii=False)}</pre>

<h3>Test su curl:</h3>
<pre>
# Patikrinti API rakta:
curl -X POST http://localhost:8879/client/v2 \\
  -H "ApiKey: test-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{{"method": "GET_N08_LIST", "params": {{"pagenumber": 1, "fil": "N08_KODAS_KS=\\'___VERIFY___\\'"}}}}'

# Sukurti kontrahenta:
curl -X POST http://localhost:8879/client/v2 \\
  -H "ApiKey: test-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{{"method": "EDIT_N08_FULL", "params": {{"oper": "I"}}, "data": {{"N08": {{"N08_KODAS_KS": "LT123456789", "N08_PAV": "UAB Testas", "N08_RUSIS": "2"}}}}}}'

# Sukurti preke:
curl -X POST http://localhost:8879/client/v2 \\
  -H "ApiKey: test-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{{"method": "EDIT_N17", "params": {{"oper": "I"}}, "data": {{"N17": {{"N17_KODAS_PS": "PRK001", "N17_TIPAS": "1", "N17_PAV": "Bananai"}}}}}}'

# Sukurti dokumenta:
curl -X POST http://localhost:8879/client/v2 \\
  -H "ApiKey: test-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{{"method": "EDIT_I06_FULL", "params": {{"errorAction": "CONTINUE"}}, "data": {{"I06": {{"I06_OP_TIP": "1", "I06_DOK_NR": "SF001", "I06_KODAS_KS": "LT123456789", "I06_OP_DATA": "2026-04-03", "I06_DOK_DATA": "2026-04-03", "I06_VAL_POZ": "0", "I07": [{{"I07_KODAS": "PRK001", "I07_TIPAS": "1", "I07_KAINA_BE": "100.00", "I07_KIEKIS": "2"}}]}}}}}}'
</pre>
</body></html>"""
    return HttpResponse(html, content_type="text/html; charset=utf-8")


# =========================================================
# URL routing
# =========================================================
urlpatterns = [
    path("client/v2", handle_api),
    path("", lambda r: _render_info_page()),
]


# =========================================================
# Запуск
# =========================================================
if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    port = sys.argv[1] if len(sys.argv) > 1 else "8879"

    print("")
    print("=" * 62)
    print("  Rivile GAMA API v2 Mock Server")
    print("=" * 62)
    print("")
    print(f"  Base URL:   http://localhost:{port}")
    print(f"  Endpoint:   POST /client/v2")
    print(f"  Auth:       Header ApiKey")
    print("")
    print("  Metodai:")
    print("    EDIT_N08_FULL   — kontrahentai")
    print("    EDIT_N17        — prekės/paslaugos")
    print("    EDIT_N25        — kodai")
    print("    EDIT_I06_FULL   — dokumentai + eilutės")
    print("    GET_N08_LIST    — API rakto patikrinimas")
    print("")
    print(f"  Delay:      {DELAY_SECONDS} sek")
    print(f"  Ref:        ok={REF_SUCCESS_WEIGHT}% dup={REF_DUPLICATE_WEIGHT}%"
          f" err400={REF_ERROR_400_WEIGHT}% err401={REF_ERROR_401_WEIGHT}%"
          f" err500={REF_ERROR_500_WEIGHT}%")
    print(f"  Doc:        ok={DOC_SUCCESS_WEIGHT}% 207={DOC_PARTIAL_207_WEIGHT}%"
          f" err400={DOC_ERROR_400_WEIGHT}% err401={DOC_ERROR_401_WEIGHT}%"
          f" err500={DOC_ERROR_500_WEIGHT}%")
    print("")
    print("  +-----------------------------------------------+")
    print("  |  V DokSkenas pakeisti RIVILE_API_URL:         |")
    print(f"  |  http://localhost:{port}/client/v2             |")
    print("  |  API Key: test-api-key                        |")
    print("  +-----------------------------------------------+")
    print("")
    print("  Ctrl+C dlia ostanovki")
    print("=" * 62)
    print("")

    execute_from_command_line(["mock_server", "runserver", f"0.0.0.0:{port}", "--noreload"])