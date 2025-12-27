# exports/optimum.py
import logging
import requests
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)

OPTIMUM_ENDPOINT = "http://api.optimum.lt/v1/lt/Trd.asmx"
OPT_NS = "http://api.optimum.lt/v1/lt/Trd/"
SOAP11_NS = "http://schemas.xmlsoap.org/soap/envelope/"


class OptimumError(Exception):
    """Bendra Optimum API klaida."""
    pass


# =========================
# Общие хелперы
# =========================

def _mask_key(key: str) -> str:
    if not key:
        return ""
    s = str(key)
    if len(s) <= 4:
        return "****"
    return "****" + s[-4:]


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _get_attr(obj, name: str, default=None):
    try:
        return getattr(obj, name, default)
    except Exception:
        return default


def _to_decimal_str(v, default="0"):
    """
    Преобразуем значение к строке decimal (точка как разделитель).
    Допускаем '21%', '21.0', 21, None.
    """
    s = _s(v).replace("%", "").replace(",", ".")
    if not s:
        return default
    try:
        d = Decimal(s)
    except (InvalidOperation, ValueError):
        return default
    # Optimum обычно принимает "21" или "21.00" — оставим без лишней квантизации
    # но нормализуем -0 в 0
    if d == Decimal("-0"):
        d = Decimal("0")
    return format(d, "f").rstrip("0").rstrip(".") or "0"


# =========================
# preke_paslauga -> PREKE/PASLAUGA и boolean Product
# =========================

def _get_preke_paslauga_value(item=None, doc=None):
    """
    Берём preke_paslauga с item, иначе с doc (если item'ов нет).
    Возвращает int или None.
    """
    v = _get_attr(item, "preke_paslauga", None) if item is not None else None
    if v is None and doc is not None:
        v = _get_attr(doc, "preke_paslauga", None)
    try:
        return int(v)
    except Exception:
        return None


def _type_and_product(preke_paslauga_int):
    """
    1,3 => PREKE (товар), Product=true
    2,4 => PASLAUGA (услуга), Product=false
    иначе => PREKE по умолчанию
    """
    if preke_paslauga_int in (2, 4):
        return "PASLAUGA", False
    return "PREKE", True


# =========================
# Определение типа документа (pirkimas/pardavimas) как у вас
# =========================

def _detect_document_type(doc) -> str:
    """
    Возвращает: 'pirkimas' или 'pardavimas'
    Логика повторяет вашу: сначала pirkimas_pardavimas, потом признаки seller/buyer.
    """
    doc_type_str = _s(_get_attr(doc, "pirkimas_pardavimas", "")).lower()
    if doc_type_str in ("pirkimas", "pardavimas"):
        return doc_type_str

    # fallback эвристика
    if _s(_get_attr(doc, "seller_id", "")) or _s(_get_attr(doc, "seller_vat_code", "")):
        return "pirkimas"
    if _s(_get_attr(doc, "buyer_id", "")) or _s(_get_attr(doc, "buyer_vat_code", "")):
        return "pardavimas"

    logger.warning("[OPTIMUM:TYPE] doc=%s cannot determine type, defaulting to pardavimas",
                   _get_attr(doc, "id", None))
    return "pardavimas"


# =========================
# Код товара (как у вас в Pragma)
# =========================

def _get_product_code(item=None, doc=None) -> str:
    """
    Приоритет:
      item.prekes_kodas -> item.prekes_barkodas -> doc.prekes_kodas -> doc.prekes_barkodas -> PREKE001
    """
    if item is not None:
        code = _s(_get_attr(item, "prekes_kodas", "")) or _s(_get_attr(item, "prekes_barkodas", ""))
        if code:
            return code
    if doc is not None:
        code = _s(_get_attr(doc, "prekes_kodas", "")) or _s(_get_attr(doc, "prekes_barkodas", ""))
        if code:
            return code
    return "PREKE001"


def _get_barcode(item=None, doc=None) -> str:
    """
    Баркод — берём из item, иначе из doc.
    """
    if item is not None:
        bc = _s(_get_attr(item, "prekes_barkodas", ""))
        if bc:
            return bc
    if doc is not None:
        bc = _s(_get_attr(doc, "prekes_barkodas", ""))
        if bc:
            return bc
    return ""


# =========================
# Единицы измерения (нормализация под Optimum)
# =========================

_CANON_UNITS = {
    # канонический вид => варианты
    "vnt.": {"vnt", "vnt.", "vnt ", "vnt. "},
    "val.": {"val", "val.", "val ", "val. "},
    "d.":   {"d", "d.", "d ", "d. "},
    "kg":   {"kg", "kg "},
    "kompl.": {"kompl", "kompl.", "komplektas", "komplektas.", "kompl "},
    "l":    {"l", "l "},
    "m":    {"m", "m "},
    "m²":   {"m2", "m²", "m^2"},
    "m³":   {"m3", "m³", "m^3"},
    "t":    {"t", "t "},
}

# инвертируем для быстрого поиска
_UNIT_MAP = {}
for canon, variants in _CANON_UNITS.items():
    for v in variants:
        _UNIT_MAP[v.strip().lower()] = canon


def _normalize_unit(unit: str) -> str:
    """
    Правило как ты описал:
    - lowercase
    - если узнаём среди стандартных Optimum — отдаём канонический вид (с точкой где надо)
    - иначе просто lowercase
    """
    u = _s(unit).strip()
    if not u:
        return "vnt."  # ваш дефолт
    key = u.lower()
    return _UNIT_MAP.get(key, key)


# =========================
# ArtGrpFllCode (группы) из customuser.optimum_extra_fields
# =========================

def _get_optimum_extra_fields(customuser):
    """
    customuser.optimum_extra_fields должен быть dict.
    """
    if customuser is None:
        return {}
    d = _get_attr(customuser, "optimum_extra_fields", None)
    return d if isinstance(d, dict) else {}


def _select_art_group_code(doc_type: str, preke_paslauga_int, customuser) -> str:
    """
    Твоё правило:
    - смотрим preke_paslauga (с item или doc)
    - если 1/3 (PREKE):
        pirkimas  -> pirkimas_prekes_grupe
        pardavimas-> pardavimas_prekes_grupe
      если 2/4 (PASLAUGA):
        pirkimas  -> pirkimas_paslaugos_grupe
        pardavimas-> pardavimas_paslaugos_grupe
    - если значение пустое => fallback:
        PREKE  -> "PR"
        PASLAUGA -> "PA"
    """
    fields = _get_optimum_extra_fields(customuser)

    is_service = preke_paslauga_int in (2, 4)

    if not is_service:
        key = "pirkimas_prekes_grupe" if doc_type == "pirkimas" else "pardavimas_prekes_grupe"
        fallback = "PR"
    else:
        key = "pirkimas_paslaugos_grupe" if doc_type == "pirkimas" else "pardavimas_paslaugos_grupe"
        fallback = "PA"

    val = _s(fields.get(key, ""))
    return val or fallback


# =========================
# SOAP: построение/парсинг
# =========================

def _build_envelope_soap11(key: str, action_el: ET.Element) -> bytes:
    envelope = ET.Element(f"{{{SOAP11_NS}}}Envelope")

    header = ET.SubElement(envelope, f"{{{SOAP11_NS}}}Header")
    hdr = ET.SubElement(header, f"{{{OPT_NS}}}Header")
    k = ET.SubElement(hdr, f"{{{OPT_NS}}}Key")
    k.text = str(key)

    body = ET.SubElement(envelope, f"{{{SOAP11_NS}}}Body")
    body.append(action_el)

    return ET.tostring(envelope, encoding="utf-8", xml_declaration=True)


def _parse_generic_result(xml_text: str) -> dict:
    """
    Парсит ответы вида:
      <...Result>
        <Status>Success|Error</Status>
        <Result>...</Result>
        <Error>...</Error>
      </...Result>
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise OptimumError("Optimum: nepavyko perskaityti SOAP atsakymo") from exc

    # SOAP Fault
    for el in root.iter():
        if el.tag.endswith("Fault"):
            fault_text = ""
            for sub in el.iter():
                if sub.tag.endswith("faultstring") or sub.tag.endswith("Text") or sub.tag.endswith("Reason"):
                    if sub.text:
                        fault_text = sub.text.strip()
                        break
            raise OptimumError(f"Optimum: SOAP Fault{': ' + fault_text if fault_text else ''}")

    def find_first_text(endswith: str) -> str:
        for el in root.iter():
            if el.tag.endswith(endswith):
                return (el.text or "").strip()
        return ""

    return {
        "status": find_first_text("Status"),
        "result": find_first_text("Result"),
        "error": find_first_text("Error"),
    }


def _soap11_post(key: str, soap_action: str, body: bytes, *, timeout=(5, 60)) -> dict:
    masked = _mask_key(key)
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f"\"{soap_action}\"",
    }

    try:
        resp = requests.post(
            OPTIMUM_ENDPOINT,
            data=body,
            headers=headers,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        logger.warning("[OPTIMUM] request failed key=%s err=%s", masked, exc)
        raise OptimumError("Optimum: ryšio klaida (request failed)") from exc

    if resp.status_code != 200:
        snippet = (resp.text or "")[:300]
        logger.warning("[OPTIMUM] non-200 key=%s status=%s body_snippet=%r",
                       masked, resp.status_code, snippet)
        raise OptimumError("Optimum: netikėtas atsakymas iš serverio")

    return _parse_generic_result(resp.text)


# =========================
# InsertArticle: сбор данных + вызов
# =========================

def build_article_payload_for_optimum(*, item=None, doc=None, customuser=None) -> dict:
    """
    Собирает ТОЛЬКО те поля, которые вы решили отправлять:
      Code, BarCode, Name, Type, MsrName, Product, ArtGrpFllCode, SlsPrcCurrencyId, VatTariff, Active
    OrgCode НЕ ставим. Остальное не заполняем.
    """
    if doc is None:
        raise OptimumError("Optimum: doc yra privalomas (article mapping)")

    doc_type = _detect_document_type(doc)

    preke_paslauga = _get_preke_paslauga_value(item=item, doc=doc)
    type_str, product_bool = _type_and_product(preke_paslauga)

    code = _get_product_code(item=item, doc=doc)
    name = _s(_get_attr(item, "prekes_pavadinimas", "")) or _s(_get_attr(doc, "prekes_pavadinimas", "")) or "Prekė"
    unit = _s(_get_attr(item, "unit", "")) or _s(_get_attr(doc, "unit", "")) or "vnt."
    msr = _normalize_unit(unit)

    currency = (_s(_get_attr(doc, "currency", "")) or "EUR").upper()

    vat_percent = _get_attr(item, "vat_percent", None) if item is not None else None
    if vat_percent is None:
        vat_percent = _get_attr(doc, "vat_percent", None)
    vat_tariff = _to_decimal_str(vat_percent, default="0")

    art_grp = _select_art_group_code(doc_type, preke_paslauga, customuser)

    barcode = _get_barcode(item=item, doc=doc)

    payload = {
        "Code": code,
        "BarCode": barcode,              # можно пустую строку не отправлять — см. ниже
        "Name": name,
        "Type": type_str,                # PREKE / PASLAUGA
        "MsrName": msr,                  # нормализованное
        "Product": product_bool,         # boolean
        "ArtGrpFllCode": art_grp,        # из optimum_extra_fields или "PP"
        "SlsPrcCurrencyId": currency,    # EUR и т.п.
        "VatTariff": vat_tariff,         # decimal string
        "Active": True,
    }
    return payload


def _build_insert_article_action(article: dict) -> ET.Element:
    action = ET.Element(f"{{{OPT_NS}}}InsertArticle")
    art_el = ET.SubElement(action, f"{{{OPT_NS}}}article")

    # Обязательные
    def put(tag, text):
        el = ET.SubElement(art_el, f"{{{OPT_NS}}}{tag}")
        el.text = str(text)

    put("Code", article["Code"])
    # BarCode опциональный — если пустой, не добавляем
    if _s(article.get("BarCode", "")):
        put("BarCode", article["BarCode"])

    put("Name", article["Name"])
    put("Type", article["Type"])
    put("MsrName", article["MsrName"])
    put("Product", "true" if article["Product"] else "false")
    put("ArtGrpFllCode", article["ArtGrpFllCode"])
    put("SlsPrcCurrencyId", article["SlsPrcCurrencyId"])
    put("VatTariff", article["VatTariff"])
    put("Active", "true" if article["Active"] else "false")

    return action


def optimum_insert_article(key: str, article: dict, *, timeout=(5, 60)) -> dict:
    """
    Отправляет InsertArticle (SOAP 1.1).
    Возвращает {status,result,error}.
    Бросает OptimumError если Status != Success.
    """
    if not key or not str(key).strip():
        raise OptimumError("Optimum: Key yra privalomas")
    key = str(key).strip()
    masked = _mask_key(key)

    soap_action = "http://api.optimum.lt/v1/lt/Trd/InsertArticle"
    action_el = _build_insert_article_action(article)
    body = _build_envelope_soap11(key, action_el)

    logger.info("[OPTIMUM] InsertArticle start key=%s code=%s name=%r",
                masked, _s(article.get("Code")), _s(article.get("Name"))[:80])

    parsed = _soap11_post(key, soap_action, body, timeout=timeout)

    st = _s(parsed.get("status")).lower()
    err = _s(parsed.get("error"))
    if st != "success":
        logger.info("[OPTIMUM] InsertArticle error key=%s code=%s status=%r error=%r",
                    masked, _s(article.get("Code")), parsed.get("status"), err)
        raise OptimumError(err or "Optimum: InsertArticle klaida")

    logger.info("[OPTIMUM] InsertArticle success key=%s code=%s result=%s",
                masked, _s(article.get("Code")), _s(parsed.get("result")))
    return parsed


# =========================
# (Опционально) массовая отправка уникальных артиклов из документов
# =========================

def export_articles_from_documents(key: str, documents, customuser=None, *, timeout=(5, 60)) -> dict:
    """
    Пока только InsertArticle:
    - собирает уникальные product_code из документов
    - для каждого делает InsertArticle
    Возвращает:
      {
        "sent": int,
        "errors": [{"code":..., "error":...}, ...]
      }
    """
    if not documents:
        return {"sent": 0, "errors": []}

    unique = {}  # code -> payload
    for doc in documents:
        doc_type = _detect_document_type(doc)
        line_items = _get_attr(doc, "line_items", None)

        has_items = bool(line_items and hasattr(line_items, "all") and line_items.exists())
        if has_items:
            for item in line_items.all():
                code = _get_product_code(item=item, doc=doc)
                if code in unique:
                    continue
                unique[code] = build_article_payload_for_optimum(item=item, doc=doc, customuser=customuser)
        else:
            code = _get_product_code(item=None, doc=doc)
            if code not in unique:
                unique[code] = build_article_payload_for_optimum(item=None, doc=doc, customuser=customuser)

        logger.debug("[OPTIMUM] doc=%s type=%s unique_articles=%d",
                     _get_attr(doc, "id", None), doc_type, len(unique))

    sent = 0
    errors = []
    for code, payload in unique.items():
        try:
            optimum_insert_article(key, payload, timeout=timeout)
            sent += 1
        except OptimumError as e:
            # Если Optimum возвращает “jau egzistuoja / already exists” — можно считать OK.
            # Т.к. точный текст ошибки у вас может отличаться, оставим как ошибка и потом решим правило.
            errors.append({"code": code, "error": str(e)})

    return {"sent": sent, "errors": errors}
