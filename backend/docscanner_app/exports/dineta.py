import logging
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
import requests
from django.conf import settings

from ..utils.password_encryption import decrypt_password

from django.utils import timezone

# подстрой под свой путь
from ..models import CurrencyRate  # если CurrencyRate в другом месте – поправь импорт

logger = logging.getLogger(__name__)



class DinetaError(Exception):
    pass


def _get_dineta_config(user):
    """
    Достаём настройки Dineta из user.dineta_settings и расшифровываем пароль.
    """
    cfg = getattr(user, "dineta_settings", {}) or {}
    server = cfg.get("server")
    client = cfg.get("client")
    username = cfg.get("username")
    enc_password = cfg.get("password")

    if not (server and client and username and enc_password):
        raise DinetaError("Dineta settings are incomplete")

    password = decrypt_password(enc_password)

    return {
        "server": server,
        "client": client,
        "username": username,
        "password": password,
    }


def _dineta_base_url(cfg):
    """
    Подстрой под реальный URL из гайда, здесь просто пример формата.
    """
    # например: https://lt4.dinetaaudit.lt/api/v1/demo
    return f"https://{cfg['server']}.dineta.lt/api/v1/{cfg['client']}"


def _dineta_session(cfg):
    """
    Создаём requests.Session c базовой авторизацией и нужными заголовками.
    Если по гайду нужен другой тип auth — поменяешь здесь.
    """
    s = requests.Session()
    # пример с Basic Auth:
    s.auth = (cfg["username"], cfg["password"])
    s.headers.update({
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    return s


def send_dineta_bundle(user, documents):
    """
    Отправляет в Dineta всё, что нужно:
      1) partners
      2) stock
      3) operations (setOperation)

    documents — уже подготовленные doc’и (с проставленным pirkimas_pardavimas и _pvm_line_map).
    Возвращает словарь с кратким summary по каждому шагу.
    """
    cfg = _get_dineta_config(user)
    base_url = _dineta_base_url(cfg)
    session = _dineta_session(cfg)

    docs = list(documents or [])
    if not docs:
        raise DinetaError("No documents to send to Dineta")

    result = {
        "partners": None,
        "stock": None,
        "operations": None,
    }

    # --- 1) Партнёры ---
    partners_payload = build_dineta_partners_payload(docs, user)
    partners = partners_payload.get("partners") or []
    if partners:
        url = f"{base_url}/partners"  # подправь по гайду, если иной путь
        logger.info("[DINETA] POST partners count=%d url=%s", len(partners), url)
        resp = session.post(url, json=partners_payload, timeout=30)
        logger.info("[DINETA] partners resp=%s %s", resp.status_code, resp.text[:500])

        if resp.status_code >= 400:
            raise DinetaError(f"Dineta partners error {resp.status_code}: {resp.text[:200]}")
        try:
            result["partners"] = resp.json()
        except ValueError:
            result["partners"] = {"raw": resp.text}
    else:
        logger.info("[DINETA] no partners to send")

    # --- 2) Stock ---
    stock_payload = build_dineta_stock_payload(docs, user)
    stock_items = stock_payload.get("stock") or []
    if stock_items:
        url = f"{base_url}/stock"
        logger.info("[DINETA] POST stock count=%d url=%s", len(stock_items), url)
        resp = session.post(url, json=stock_payload, timeout=30)
        logger.info("[DINETA] stock resp=%s %s", resp.status_code, resp.text[:500])

        if resp.status_code >= 400:
            raise DinetaError(f"Dineta stock error {resp.status_code}: {resp.text[:200]}")
        try:
            result["stock"] = resp.json()
        except ValueError:
            result["stock"] = {"raw": resp.text}
    else:
        logger.info("[DINETA] no stock to send")

    # --- 3) Операции (документы) ---
    operations_payload = build_dineta_operations_payload(docs, user)
    # build_dineta_operations_payload сейчас возвращает {"operations": [...]}
    operations = operations_payload.get("operations") or []
    ops_count = len(operations)

    url = f"{base_url}/operations"  # или /operation/setOperation и т.п. по гайду
    logger.info(
        "[DINETA] POST operations docs=%d ops=%d url=%s",
        len(docs),
        ops_count,
        url,
    )

    resp = session.post(url, json=operations_payload, timeout=60)
    logger.info("[DINETA] operations resp=%s %s", resp.status_code, resp.text[:500])

    if resp.status_code >= 400:
        raise DinetaError(f"Dineta operations error {resp.status_code}: {resp.text[:200]}")

    try:
        result["operations"] = resp.json()
    except ValueError:
        result["operations"] = {"raw": resp.text}

    return result



# =========================
# Helpers
# =========================

def _D(x, default="0"):
    """Безопасно приводит к Decimal, иначе default."""
    try:
        return Decimal(str(x))
    except Exception:
        return Decimal(default)


def _s(v):
    """Строка с strip()."""
    return str(v).strip() if v is not None else ""


def _quant_4(v: Decimal) -> Decimal:
    """Decimal -> 4 знака после запятой."""
    return v.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _quant_2(v: Decimal) -> Decimal:
    """Decimal -> 2 знака после запятой."""
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_currency_rate(currency_code, date_obj):
    """
    Курс валюты к EUR.
    Если currency_code пустой или EUR -> 1.
    Берём точную дату, если нет — последнюю меньшую.
    """
    if not currency_code or str(currency_code).upper() == "EUR":
        return Decimal("1")

    code = str(currency_code).upper()
    qs = CurrencyRate.objects.filter(currency=code, date=date_obj)
    obj = qs.first()
    if obj:
        return _D(obj.rate, "1")

    qs = CurrencyRate.objects.filter(currency=code, date__lt=date_obj).order_by("-date")
    obj = qs.first()
    return _D(obj.rate, "1") if obj else Decimal("1")


def dineta_stock_type_from_preke_paslauga(value) -> int:
    """
    Dineta: type
      1 = prekė
      2 = paslauga

    Маппинг:
      preke_paslauga:
        1 -> prekė
        2 -> paslauga
        3 -> prekė
        4 -> paslauga
      всё остальное -> prekė
    """
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 1

    if n in (2, 4):
        return 2  # paslauga
    return 1      # prekė


def build_dok_nr(series: str, number: str) -> str:
    """
    Как в Rivile: series + number без дефиса, без повторов.
    """
    s = (series or "").strip()
    n = (number or "").strip()

    if not s:
        return n
    if not n:
        return s

    if n.startswith(s):
        tail = n[len(s):]
        tail = tail.lstrip("-/ .")
        return f"{s}{tail}"

    return f"{s}{n}"


def get_party_code(
    doc,
    *,
    role: str,
    id_field: str,
    vat_field: str,
    id_programoje_field: str,
) -> str:
    """
    Код контрагента по приоритету:
      1) *_id
      2) *_vat_code
      3) *_id_programoje
    Если всё пусто — "".
    """
    def _sfield(name):
        return _s(getattr(doc, name, None))

    sid = _sfield(id_field)
    if sid:
        logger.info("[DINETA:PARTY] %s: %s -> %s", role, id_field, sid)
        return sid

    svat = _sfield(vat_field)
    if svat:
        logger.info("[DINETA:PARTY] %s: %s -> %s", role, vat_field, svat)
        return svat

    sidp = _sfield(id_programoje_field)
    if sidp:
        logger.info("[DINETA:PARTY] %s: %s -> %s", role, id_programoje_field, sidp)
        return sidp

    logger.info("[DINETA:PARTY] %s: empty id/vat/id_programoje -> ''", role)
    return ""


# =========================
# Распределение документной скидки
# =========================

def _build_lines_with_discounts(doc, items):
    """
    Возвращает список структур для строк:
      {
        "item": item,
        "qty": Decimal,
        "price": Decimal,       # до документной скидки
        "price_disc": Decimal,  # после документной скидки
        "line_base": Decimal,   # price * qty
        "line_base_disc": Decimal, # после скидки
      }

    Всё в валюте документа. Документная скидка (invoice_discount_wo_vat)
    распределяется пропорционально `price * qty`.
    """
    items = list(items or [])
    result = []

    if not items:
        return result

    # Базовая сумма без документной скидки
    line_bases = []
    for it in items:
        price = _D(getattr(it, "price", 0))
        qty = _D(getattr(it, "quantity", 1) or 1)
        if qty <= 0:
            qty = Decimal("1")
        line_base = price * qty
        line_bases.append((it, price, qty, line_base))

    base_total = sum(lb for (_, _, _, lb) in line_bases)
    disc_total = _D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)

    if disc_total <= 0 or base_total <= 0:
        # скидки нет, price_disc == price
        for it, price, qty, line_base in line_bases:
            result.append(
                {
                    "item": it,
                    "qty": qty,
                    "price": _quant_4(price),
                    "price_disc": _quant_4(price),
                    "line_base": _quant_4(line_base),
                    "line_base_disc": _quant_4(line_base),
                }
            )
        return result

    # есть скидка, делим пропорционально
    remaining_disc = disc_total
    for idx, (it, price, qty, line_base) in enumerate(line_bases):
        if idx < len(line_bases) - 1:
            share = (line_base / base_total)
            line_disc_total = (disc_total * share).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            remaining_disc -= line_disc_total
        else:
            # последней строке отдаём остаток, чтобы сумма точно сошлась
            line_disc_total = remaining_disc

        line_base_disc = line_base - line_disc_total
        if qty > 0:
            price_disc = (line_base_disc / qty)
        else:
            price_disc = price

        result.append(
            {
                "item": it,
                "qty": qty,
                "price": _quant_4(price),
                "price_disc": _quant_4(price_disc),
                "line_base": _quant_4(line_base),
                "line_base_disc": _quant_4(line_base_disc),
            }
        )

    return result


# =========================
# Построение операции для Dineta (setOperation)
# =========================

def build_dineta_operation_payload(doc, user):
    """
    Собирает payload для Dineta setOperation по одному документу (pirkimas/pardavimas).

    Возвращает dict, готовый к json.dumps и отправке в Dineta.
    Все суммы приводим к EUR (по CurrencyRate), цены price/priceDisc – с 4 знаками.
    """
    dineta_cfg = getattr(user, "dineta_settings", {}) or {}
    store_id = _s(dineta_cfg.get("storeid") or "S1")
    brandid = _s(dineta_cfg.get("brandid") or "")

    # Тип документа: pirkimas / pardavimas
    doc_type = (_s(getattr(doc, "pirkimas_pardavimas", ""))).lower()
    if doc_type not in ("pirkimas", "pardavimas"):
        # пробуем угадать по полям
        if _s(getattr(doc, "seller_id", None)) or _s(getattr(doc, "seller_vat_code", None)):
            doc_type = "pirkimas"
        elif _s(getattr(doc, "buyer_id", None)) or _s(getattr(doc, "buyer_vat_code", None)):
            doc_type = "pardavimas"
        else:
            raise ValueError(f"Cannot determine doc type (pirkimas/pardavimas) for doc={getattr(doc, 'pk', None)}")

    if doc_type == "pirkimas":
        op = "purchase"
        # контрагент = продавец
        partner_code = get_party_code(
            doc,
            role="seller",
            id_field="seller_id",
            vat_field="seller_vat_code",
            id_programoje_field="seller_id_programoje",
        )
    else:
        op = "sale"
        # контрагент = покупатель
        partner_code = get_party_code(
            doc,
            role="buyer",
            id_field="buyer_id",
            vat_field="buyer_vat_code",
            id_programoje_field="buyer_id_programoje",
        )

    if not partner_code:
        raise ValueError(f"Dineta: empty partner code for doc={getattr(doc, 'pk', None)}")

    partner_id = partner_code
    partner_id2 = partner_code  # у нас нет отдельного плательщика

    # Номер документа
    series = _s(getattr(doc, "document_series", "") or "")
    number = _s(getattr(doc, "document_number", "") or "")
    dok_num = build_dok_nr(series, number)

    # Даты
    invoice_date = getattr(doc, "invoice_date", None)
    op_date = getattr(doc, "operation_date", None) or invoice_date

    if invoice_date is None:
        # на всякий случай не даём None, Dineta поле обязательное
        invoice_date = op_date or timezone.now().date()
    if op_date is None:
        op_date = invoice_date

    # Валюта
    currency = (_s(getattr(doc, "currency", "EUR") or "EUR")).upper()
    op_date_for_rate = op_date

    # Строки документа
    line_items = getattr(doc, "line_items", None)
    if line_items and hasattr(line_items, "all") and line_items.exists():
        items_list = list(line_items.all())
        lines_info = _build_lines_with_discounts(doc, items_list)
    else:
        # суминный документ – одна строка
        price = _D(getattr(doc, "amount_wo_vat", 0))
        qty = Decimal("1")
        disc = _D(getattr(doc, "invoice_discount_wo_vat", 0) or 0)
        line_base = price * qty
        line_base_disc = line_base - disc
        if line_base_disc < 0:
            line_base_disc = Decimal("0")

        price_disc = line_base_disc / qty if qty > 0 else price

        lines_info = [
            {
                "item": None,
                "qty": qty,
                "price": _quant_4(price),
                "price_disc": _quant_4(price_disc),
                "line_base": _quant_4(line_base),
                "line_base_disc": _quant_4(line_base_disc),
            }
        ]

    # Итоги по документу (в валюте документа)
    net_total_after_disc = sum(li["line_base_disc"] for li in lines_info)
    vat_total = _D(getattr(doc, "vat_amount", 0) or 0)
    gross_total = net_total_after_disc + vat_total

    # Конвертация в EUR при необходимости
    rate = get_currency_rate(currency, op_date_for_rate)
    if currency == "EUR":
        net_eur = net_total_after_disc
        vat_eur = vat_total
        gross_eur = gross_total
    else:
        net_eur = _quant_2(net_total_after_disc * rate)
        vat_eur = _quant_2(vat_total * rate)
        gross_eur = _quant_2(gross_total * rate)

    # Время создания строк
    now = timezone.now()
    date_created_ms = int(now.timestamp() * 1000)

    # Строки stock_lines
    stock_lines = []
    line_map = getattr(doc, "_pvm_line_map", None)  # как в Rivile: multi PVM mapping

    for li in lines_info:
        item = li["item"]
        qty = li["qty"]
        price = li["price"]
        price_disc = li["price_disc"]

        # --- stockId (prekes_kodas -> prekes_barkodas -> doc.prekes_kodas -> fallback) ---
        if item is not None:
            stock_id = (
                _s(getattr(item, "prekes_kodas", "")) or
                _s(getattr(item, "prekes_barkodas", "")) or
                _s(getattr(doc, "prekes_kodas", "")) or
                "PREKE001"
            )
            barcode = _s(getattr(item, "prekes_barkodas", "") or "")
            name = _s(
                getattr(item, "prekes_pavadinimas", None)
                or getattr(doc, "prekes_pavadinimas", None)
                or "Prekė"
            )
            vat_percent = _D(getattr(item, "vat_percent", getattr(doc, "vat_percent", 0)) or 0)
            # PVM kodas: multi/single
            if line_map is not None:
                code = (line_map or {}).get(getattr(item, "id", None))
            else:
                code = getattr(item, "pvm_kodas", None)
            vat_code = _s(code or getattr(doc, "pvm_kodas", "") or "")
        else:
            # суминный
            stock_id = (
                _s(getattr(doc, "prekes_kodas", "")) or
                _s(getattr(doc, "prekes_barkodas", "")) or
                "PREKE001"
            )
            barcode = _s(getattr(doc, "prekes_barkodas", "") or "")
            name = _s(getattr(doc, "prekes_pavadinimas", "") or "Prekė")
            vat_percent = _D(getattr(doc, "vat_percent", 0) or 0)
            vat_code = _s(getattr(doc, "pvm_kodas", "") or "")

        if not stock_id:
            logger.warning("[DINETA:OP] doc=%s: empty stock_id, skipping line", getattr(doc, "pk", None))
            continue

        # Конвертация price/priceDisc в EUR при необходимости
        if currency == "EUR":
            price_eur = price
            price_disc_eur = price_disc
        else:
            price_eur = _quant_4(price * rate)
            price_disc_eur = _quant_4(price_disc * rate)

        stock_line = {
            "stockId": stock_id,
            "name": name,
            "quant": float(qty),                 # Dineta ждёт числа, не Decimal
            "price": float(price_eur),          # до скидки, 4 знака
            "priceDisc": float(price_disc_eur), # после скидки, 4 знака
            "vatPerc": float(vat_percent),      # ставка НДС
            "vatCode": vat_code,                # код НДС, если есть (PVM1/PVM2/...)
            "dateCreated": date_created_ms,
        }

        if barcode:
            stock_line["barcode"] = barcode

        if brandid:
            stock_line["brandid"] = brandid

        stock_lines.append(stock_line)

    if not stock_lines:
        raise ValueError(f"Dineta: no stock lines built for doc={getattr(doc, 'pk', None)}")

    # Описание – preview_url
    description = _s(getattr(doc, "preview_url", "") or "")

    # id / externalDocId – используем dok_num (как ты хотел)
    doc_id = dok_num or str(getattr(doc, "id", "") or "")

    payload = {
        "id": doc_id,
        "externalDocId": doc_id,
        "op": op,
        "docDate": invoice_date.strftime("%Y-%m-%d"),
        "aDate": op_date.strftime("%Y-%m-%d"),
        "blankNo": dok_num,
        "description": description,
        "partnerId": partner_id,
        "partnerId2": partner_id2,
        "storeFromId": store_id,
        "storeToId": store_id,
        "totalSum": float(gross_eur),
        "vatSum": float(vat_eur),
        "stock_lines": stock_lines,
    }

    if brandid:
        payload["brandid"] = brandid

    return payload


def build_dineta_operations_payload(documents, user):
    """
    Удобный враппер: несколько документов -> payload для Dineta.
    """
    ops = []
    for doc in documents or []:
        try:
            payload = build_dineta_operation_payload(doc, user)
        except Exception as exc:
            logger.exception("[DINETA:OP] failed to build payload for doc=%s: %s", getattr(doc, "pk", None), exc)
            continue
        ops.append(payload)

    return {"operations": ops}





def build_dineta_partners_payload(documents=None, user=None):
    """
    Собирает payload для Dineta партнёров:

      {
        "partners": [
          {
            "id": "CLIENT_CODE",    # обязательное, тот же код, что и в setOperation.partnerId
            "name": "UAB Klientas", # обязательное
            "code": "123456789",    # įmonės kodas
            "vat_code": "LT123456789",
            "country": "LT",
            "address": "Vilnius, ...",
            "email": "...",
            "phone": "...",
            "type": 2,              # 1 = fizinis, 2 = įmonė
            "brandid": "GVP"
          },
          ...
        ]
      }

    Источник данных:
    - из документов (pirkimas -> seller_*, pardavimas -> buyer_*).
    Код партнёра (id) = тот же, что get_party_code(...), как и в setOperation.
    """
    dineta_cfg = getattr(user, "dineta_settings", {}) or {}
    brandid = _s(dineta_cfg.get("brandid") or "")

    partners = []
    seen_ids = set()

    docs = list(documents or [])

    for doc in docs:
        doc_type = (_s(getattr(doc, "pirkimas_pardavimas", ""))).lower()

        if doc_type not in ("pirkimas", "pardavimas"):
            # пробуем угадать по наличию полей
            if _s(getattr(doc, "seller_id", None)) or _s(getattr(doc, "seller_vat_code", None)) or _s(getattr(doc, "seller_id_programoje", None)):
                doc_type = "pirkimas"
            elif _s(getattr(doc, "buyer_id", None)) or _s(getattr(doc, "buyer_vat_code", None)) or _s(getattr(doc, "buyer_id_programoje", None)):
                doc_type = "pardavimas"
            else:
                logger.info("[DINETA:PARTNER] doc=%s skipped (no side nor ids)", getattr(doc, "pk", None))
                continue

        if doc_type == "pirkimas":
            # контрагент = продавец
            partner_id = get_party_code(
                doc,
                role="seller",
                id_field="seller_id",
                vat_field="seller_vat_code",
                id_programoje_field="seller_id_programoje",
            )
            if not partner_id:
                continue

            if partner_id in seen_ids:
                continue

            name = _s(getattr(doc, "seller_name", "") or "")
            im_code = _s(getattr(doc, "seller_id", "") or "")
            vat_code = _s(getattr(doc, "seller_vat_code", "") or "")
            country = _s(getattr(doc, "seller_country_iso", "") or "").upper()
            address = _s(getattr(doc, "seller_address", "") or "")
            email = _s(getattr(doc, "seller_email", "") or "")
            phone = _s(getattr(doc, "seller_phone", "") or "")
            is_person = bool(getattr(doc, "seller_is_person", False))
        else:
            # pardavimas -> контрагент = покупатель
            partner_id = get_party_code(
                doc,
                role="buyer",
                id_field="buyer_id",
                vat_field="buyer_vat_code",
                id_programoje_field="buyer_id_programoje",
            )
            if not partner_id:
                continue

            if partner_id in seen_ids:
                continue

            name = _s(getattr(doc, "buyer_name", "") or "")
            im_code = _s(getattr(doc, "buyer_id", "") or "")
            vat_code = _s(getattr(doc, "buyer_vat_code", "") or "")
            country = _s(getattr(doc, "buyer_country_iso", "") or "").upper()
            address = _s(getattr(doc, "buyer_address", "") or "")
            email = _s(getattr(doc, "buyer_email", "") or "")
            phone = _s(getattr(doc, "buyer_phone", "") or "")
            is_person = bool(getattr(doc, "buyer_is_person", False))

        if not name:
            name = "Nežinomas"

        ptype = 1 if is_person else 2  # 1=fizinis, 2=įmonė

        partner = {
            "id": partner_id,
            "name": name,
            "code": im_code,
            "vat_code": vat_code,
            "country": country,
            "address": address,
            "email": email,
            "phone": phone,
            "type": ptype,
        }
        if brandid:
            partner["brandid"] = brandid

        partners.append(partner)
        seen_ids.add(partner_id)

        logger.info(
            "[DINETA:PARTNER] added doc=%s type=%s id=%r name=%r",
            getattr(doc, "pk", None),
            doc_type,
            partner_id,
            name,
        )

    return {"partners": partners}





def build_dineta_stock_payload(documents=None, user=None):
    """
    Собирает payload для Dineta stock (prekės/paslaugos):

      {
        "stock": [
          {
            "id": "PREKE1",          # обязательное
            "type": 1,               # 1=prekė, 2=paslauga (из preke_paslauga)
            "name": "Kava",
            "unitid": "VNT",
            "vat_perc": 21.0,
            "vatCode": "PVM1",
            "barcodes": [
              { "barcode": "477...", "default": 1 }
            ],
            "brandid": "GVP"
          },
          ...
        ]
      }

    Источник:
    - По документам и их line_items (как N17/N25):
      - если есть line_items -> идём по ним
      - если нет -> одна "суминная" позиция по doc.prekes_*.
    """
    dineta_cfg = getattr(user, "dineta_settings", {}) or {}
    brandid = _s(dineta_cfg.get("brandid") or "")

    stock_map = {}  # key: stock_id -> dict

    docs = list(documents or [])

    for doc in docs:
        line_items = getattr(doc, "line_items", None)
        has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())

        if not has_items:
            # суминный документ: одна позиция
            stock_id = (
                _s(getattr(doc, "prekes_kodas", "")) or
                _s(getattr(doc, "prekes_barkodas", "")) or
                ""
            )
            if not stock_id:
                continue

            if stock_id in stock_map:
                continue

            name = _s(getattr(doc, "prekes_pavadinimas", "") or "Prekė")
            unitid = _s(getattr(doc, "unit", "") or "VNT")

            preke_paslauga = getattr(doc, "preke_paslauga", None)
            stype = dineta_stock_type_from_preke_paslauga(preke_paslauga)

            vat_percent = _D(getattr(doc, "vat_percent", 0) or 0)
            vat_code = _s(getattr(doc, "pvm_kodas", "") or "")

            barcode = _s(getattr(doc, "prekes_barkodas", "") or "")

            item = {
                "id": stock_id,
                "type": stype,
                "name": name,
                "unitid": unitid,
                "vat_perc": float(vat_percent),
            }
            if vat_code:
                item["vatCode"] = vat_code

            if barcode:
                item["barcodes"] = [{"barcode": barcode, "default": 1}]

            if brandid:
                item["brandid"] = brandid

            stock_map[stock_id] = item
            logger.info(
                "[DINETA:STOCK] suminis doc=%s stock_id=%r name=%r",
                getattr(doc, "pk", None), stock_id, name
            )

        else:
            # kiekinis: идём по строкам
            for item_obj in line_items.all():
                stock_id = (
                    _s(getattr(item_obj, "prekes_kodas", "")) or
                    _s(getattr(item_obj, "prekes_barkodas", "")) or
                    _s(getattr(doc, "prekes_kodas", "")) or
                    ""
                )
                if not stock_id:
                    continue

                if stock_id in stock_map:
                    continue

                name = _s(
                    getattr(item_obj, "prekes_pavadinimas", None)
                    or getattr(doc, "prekes_pavadinimas", None)
                    or "Prekė"
                )
                unitid = _s(
                    getattr(item_obj, "unit", None)
                    or getattr(doc, "unit", None)
                    or "VNT"
                )

                preke_paslauga = (
                    getattr(item_obj, "preke_paslauga", None)
                    or getattr(doc, "preke_paslauga", None)
                )
                stype = dineta_stock_type_from_preke_paslauga(preke_paslauga)

                vat_percent = _D(
                    getattr(item_obj, "vat_percent", None)
                    or getattr(doc, "vat_percent", None)
                    or 0
                )
                vat_code = _s(
                    getattr(item_obj, "pvm_kodas", None)
                    or getattr(doc, "pvm_kodas", None)
                    or ""
                )

                barcode = _s(getattr(item_obj, "prekes_barkodas", "") or "")

                stock_item = {
                    "id": stock_id,
                    "type": stype,
                    "name": name,
                    "unitid": unitid,
                    "vat_perc": float(vat_percent),
                }
                if vat_code:
                    stock_item["vatCode"] = vat_code

                if barcode:
                    stock_item["barcodes"] = [{"barcode": barcode, "default": 1}]

                if brandid:
                    stock_item["brandid"] = brandid

                stock_map[stock_id] = stock_item
                logger.info(
                    "[DINETA:STOCK] kiekinis doc=%s stock_id=%r name=%r",
                    getattr(doc, "pk", None), stock_id, name
                )

    return {"stock": list(stock_map.values())}
