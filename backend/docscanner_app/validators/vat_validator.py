import re
import logging
import logging.config
import textwrap
import requests
import xml.etree.ElementTree as ET


logger = logging.getLogger("docscanner_app")


VIES_SOAP_URL = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService"


def build_soap_request(country_code: str, vat_number: str) -> str:
    envelope = f"""<?xml version="1.0" encoding="UTF-8"?>
    <soap:Envelope
        xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
        xmlns:tns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <soap:Body>
        <tns:checkVat>
          <tns:countryCode>{country_code}</tns:countryCode>
          <tns:vatNumber>{vat_number}</tns:vatNumber>
        </tns:checkVat>
      </soap:Body>
    </soap:Envelope>
    """
    return textwrap.dedent(envelope).strip()


def check_vat(country_code: str, vat_number: str) -> dict:
    """
    Проверка VAT через VIES.

    :param country_code: двухбуквенный код страны, например "LT", "LV", "DE"
    :param vat_number: номер VAT без кода страны
    :return: dict с полями:
        {
          "success": True/False,
          "countryCode": "...",
          "vatNumber": "...",
          "requestDate": "...",
          "valid": True/False,
          "name": "...",
          "address": "...",
          "error": "..."  # если success=False
        }
    """
    country_code = (country_code or "").strip().upper()
    vat_number = (vat_number or "").strip()

    if not country_code or not vat_number:
        return {
            "success": False,
            "error": "country_code and vat_number are required",
        }

    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "User-Agent": "vat-checker-simple/1.0",
    }

    body = build_soap_request(country_code, vat_number)

    try:
        resp = requests.post(VIES_SOAP_URL, data=body, headers=headers, timeout=10)
    except requests.RequestException as e:
        return {
            "success": False,
            "error": f"HTTP error calling VIES: {e}",
        }

    if resp.status_code != 200:
        return {
            "success": False,
            "error": f"Non-200 response from VIES: {resp.status_code}",
            "raw_response": resp.text[:1000],
        }

    # Разбираем XML
    namespaces = {
        "soap": "http://schemas.xmlsoap.org/soap/envelope/",
        "tns": "urn:ec.europa.eu:taxud:vies:services:checkVat:types",
    }

    try:
        root = ET.fromstring(resp.text)

        # Проверка на SOAP Fault
        fault = root.find(".//soap:Fault", namespaces)
        if fault is not None:
            faultcode = fault.findtext("faultcode")
            faultstring = fault.findtext("faultstring")
            return {
                "success": False,
                "error": "VIES SOAP Fault",
                "faultcode": faultcode,
                "faultstring": faultstring,
            }

        check_resp = root.find(".//tns:checkVatResponse", namespaces)
        if check_resp is None:
            return {
                "success": False,
                "error": "Cannot find checkVatResponse in VIES response",
                "raw_response": resp.text[:1000],
            }

        def get_text(tag):
            el = check_resp.find(f"tns:{tag}", namespaces)
            return el.text if el is not None else None

        return {
            "success": True,
            "countryCode": get_text("countryCode"),
            "vatNumber": get_text("vatNumber"),
            "requestDate": get_text("requestDate"),
            "valid": get_text("valid") == "true",
            "name": (get_text("name") or "").strip(),
            "address": (get_text("address") or "").strip(),
        }

    except ET.ParseError as e:
        return {
            "success": False,
            "error": f"XML parse error: {e}",
            "raw_response": resp.text[:1000],
        }



# Страны, которые поддерживает VIES (2-буквенный код, как в самом VIES)
EU_VIES_COUNTRIES = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE",
    "EL",  # Greece (ISO GR)
    "ES", "FI", "FR", "HR", "HU", "IE", "IT", "LT",
    "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE",
    "SI", "SK",
}

# Маппинг ISO2 → код страны в VIES
ISO_TO_VIES = {
    "AT": "AT",
    "BE": "BE",
    "BG": "BG",
    "CY": "CY",
    "CZ": "CZ",
    "DE": "DE",
    "DK": "DK",
    "EE": "EE",
    "EL": "EL",  # редко попадётся
    "GR": "EL",  # Греция в ISO, но в VIES она EL
    "ES": "ES",
    "FI": "FI",
    "FR": "FR",
    "HR": "HR",
    "HU": "HU",
    "IE": "IE",
    "IT": "IT",
    "LT": "LT",
    "LU": "LU",
    "LV": "LV",
    "MT": "MT",
    "NL": "NL",
    "PL": "PL",
    "PT": "PT",
    "RO": "RO",
    "SE": "SE",
    "SI": "SI",
    "SK": "SK",
}


def _normalize_country_code(country_iso: str | None) -> str | None:
    """
    Приводим ISO2 код к тому, что ждёт VIES.
    Если страна не из ЕС/VIES — возвращаем None.
    """
    if not country_iso:
        return None
    iso = country_iso.strip().upper()
    if len(iso) != 2:
        return None
    vies_code = ISO_TO_VIES.get(iso)
    if vies_code not in EU_VIES_COUNTRIES:
        return None
    return vies_code


def _parse_vat(raw_code: str | None, country_iso: str | None):
    """
    Пытаемся понять, что у нас за VAT-код и какую страну использовать.

    Логика:
      - если код пустой → None
      - сначала пытаемся взять 2-буквенный префикс из самого VAT-кода
          (LT123..., DE 123..., FR123 и т.п.)
        * если этот префикс — EU (по _normalize_country_code) → берём его
      - если из самого кода EU-страна не определилась:
          * пробуем взять country_iso (seller/buyer)
          * если страна не из EU/VIES → возвращаем None (VIES не зовём)
      - если в номере есть не [A-Z0-9] → считаем формат невалидным
    """
    if not raw_code:
        return None

    original = raw_code.strip()
    if not original:
        return None

    # --- 1) Пытаемся вытащить префикс страны прямо из VAT-кода ---
    vat_prefix_cc = None
    rest = original

    m = re.match(r"^([A-Za-z]{2})\s*(.+)$", original)
    if m:
        vat_prefix_cc = m.group(1).upper()
        rest = m.group(2).strip()

    country_code: str | None = None

    # --- 2) Если в самом VAT есть EU-префикс, используем его (НЕ важно, что за seller/buyer) ---
    if vat_prefix_cc:
        country_code = _normalize_country_code(vat_prefix_cc)

    # --- 3) Если из VAT префикса EU-страна не определилась → fallback к seller/buyer country_iso ---
    if not country_code:
        country_code = _normalize_country_code(country_iso)

    # --- 4) Ни из VAT, ни из seller/buyer EU не получилось → VIES не зовём ---
    if not country_code:
        logger.info(
            "Skip VAT VIES check: non-EU or unsupported country. raw_code=%r, country_iso=%r",
            raw_code,
            country_iso,
        )
        return None

    # Убираем пробелы внутри номера
    vat_number = re.sub(r"\s+", "", rest)

    # Базовая проверка: только латинские буквы и цифры
    if not re.match(r"^[A-Z0-9]+$", vat_number, re.IGNORECASE):
        logger.info(
            "VAT invalid format, skip VIES: raw_code=%r, normalized=%r, country=%s",
            raw_code,
            vat_number,
            country_code,
        )
        return {
            "status": "invalid_format",
            "country_code": country_code,
            "vat_number": vat_number,
            "api_called": False,
        }

    return {
        "status": "ok_format",
        "country_code": country_code,
        "vat_number": vat_number,
        "api_called": False,
    }


def validate_vat(raw_code: str | None, country_iso: str | None) -> dict:
    """
    Главная функция для использования в докскенасе.

    Возвращает dict с полями:
      - status:
          "not_provided"  – кода нет, ничего не делали
          "invalid_format" – невозможно/бессмысленно отправлять в VIES
          "unavailable"   – VIES/MS_UNAVAILABLE или другие тех. проблемы
          "valid"         – VIES говорит, что номер действителен
          "invalid"       – VIES говорит, что номер не действителен
      - country_code  – код страны, который реально отправили/хотели
      - vat_number    – номер без префикса страны
      - api_called    – True/False, вызывали ли VIES вообще
    """
    # 1) нормализация + базовая проверка формата
    if not (raw_code and raw_code.strip()):
        return {
            "status": "not_provided",
            "country_code": None,
            "vat_number": None,
            "api_called": False,
        }

    parsed = _parse_vat(raw_code, country_iso)

    # parsed == None → либо страна не EU/VIES, либо вообще не смогли
    if parsed is None:
        return {
            "status": "invalid_format",
            "country_code": None,
            "vat_number": None,
            "api_called": False,
        }

    if parsed["status"] == "invalid_format":
        return parsed  # уже решили, что отправлять в VIES бессмысленно

    country_code = parsed["country_code"]
    vat_number = parsed["vat_number"]

    # 2) зовём VIES
    try:
        vies_res = check_vat(country_code, vat_number)
    except Exception as e:
        logger.warning("VIES call failed for %s%s: %s", country_code, vat_number, e)
        return {
            "status": "unavailable",
            "country_code": country_code,
            "vat_number": vat_number,
            "api_called": True,
        }

    if not vies_res.get("success"):
        fault = (vies_res.get("faultstring") or "").upper()
        err = (vies_res.get("error") or "").upper()
        if "MS_UNAVAILABLE" in fault or "SERVICE_UNAVAILABLE" in fault:
            status = "unavailable"
        else:
            status = "unavailable"  # можно потом раздробить на отдельные ошибки
        return {
            "status": status,
            "country_code": country_code,
            "vat_number": vat_number,
            "api_called": True,
        }

    # success == True → смотрим valid
    is_valid = bool(vies_res.get("valid"))
    return {
        "status": "valid" if is_valid else "invalid",
        "country_code": country_code,
        "vat_number": vat_number,
        "api_called": True,
    }