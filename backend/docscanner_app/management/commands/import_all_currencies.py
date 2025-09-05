# docscanner_app/management/commands/import_all_currencies.py

import time
import requests
import xml.etree.ElementTree as ET
from datetime import date as dt_date, datetime, timezone
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.core.management.base import BaseCommand, CommandError
from docscanner_app.models import CurrencyRate


# =========================
# Константы
# =========================
LB_BASE = "https://www.lb.lt/webservices/FxRates/FxRates.asmx"
TP_DEFAULT = "EU"
DT_FROM_DEFAULT = "2014-09-30"
DT_TO_DEFAULT   = "2025-09-05"

REQUEST_TIMEOUT = 25
RETRY_WAIT_SEC  = [1, 2, 4]
REQUEST_HEADERS = {
    "User-Agent": "DocScanner/1.0 (+contact: admin@docscanner.local)",
    "Accept": "application/xml, text/xml;q=0.9, */*;q=0.1",
}


# =========================
# Вспомогательные функции
# =========================
def _http_get(url: str) -> str:
    """HTTP GET с ретраями и корректной кодировкой."""
    for i, wait in enumerate([0] + RETRY_WAIT_SEC):
        if wait:
            time.sleep(wait)
        try:
            r = requests.get(url, timeout=REQUEST_TIMEOUT, headers=REQUEST_HEADERS)
            r.raise_for_status()
            r.encoding = "utf-8"
            return r.text
        except requests.RequestException:
            if i == len(RETRY_WAIT_SEC):
                raise
    raise RuntimeError("GET failed after retries")


def _local(tag: str) -> str:
    """'{ns}Tag' -> 'Tag' ; 'Tag' -> 'Tag'"""
    return tag.split('}', 1)[-1] if '}' in tag else tag


def _dec(val):
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        return None


# =========================
# Получение списка валют
# =========================
def _parse_fxrates_codes(xml_text: str):
    """
    Возвращает множество ISO-кодов (кроме EUR) из ответа getFxRates.
    Namespace-агностично + игнорируем <script/>.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return set()

    codes = set()
    for node in root.iter():
        if _local(node.tag) == "CcyAmt":
            ccy = None
            amt = None
            for ch in node:
                lname = _local(ch.tag)
                if lname == "Ccy":
                    ccy = (ch.text or "").strip().upper()
                elif lname == "Amt":
                    amt = (ch.text or "").strip()
            if ccy and ccy != "EUR":
                codes.add(ccy)
    return codes


def discover_unique_currencies(tp: str, date_a: str, date_b: str):
    """
    Берём валюты с двух дат и объединяем. Исключаем EUR и редкие спецкоды.
    """
    codes = set()
    for dt in (date_a, date_b):
        url = f"{LB_BASE}/getFxRates?tp={tp}&dt={dt}"
        xml = _http_get(url)
        codes |= _parse_fxrates_codes(xml)
        time.sleep(0.2)  # бережнее к сервису
    for bad in ("XAU", "XAG", "XDR"):  # на всякий случай
        codes.discard(bad)
    return sorted(codes)


# =========================
# История по валюте
# =========================
def fetch_currency_history(ccy: str, tp: str, dt_from: str, dt_to: str):
    """
    Возвращает список (date, rate_to_EUR) из getFxRatesForCurrency.
    Парсинг по локальным именам тегов (namespace-agnostic).
    """
    url = f"{LB_BASE}/getFxRatesForCurrency?tp={tp}&ccy={ccy}&dtFrom={dt_from}&dtTo={dt_to}"
    xml = _http_get(url)

    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []

    out = []
    for fx in root.iter():
        if _local(fx.tag) != "FxRate":
            continue

        # дата: Dt (fallback Dts)
        dtxt = None
        for ch in fx:
            lname = _local(ch.tag)
            if lname in ("Dt", "Dts"):
                t = (ch.text or "").strip()
                if t:
                    dtxt = t[:10]
                    break
        if not dtxt:
            continue
        try:
            d = dt_date.fromisoformat(dtxt)
        except ValueError:
            continue

        eur_amt = None
        ccy_amt = None
        for ch in fx:
            if _local(ch.tag) != "CcyAmt":
                continue
            code = None
            amt  = None
            for sub in ch:
                lname = _local(sub.tag)
                if lname == "Ccy":
                    code = (sub.text or "").strip().upper()
                elif lname == "Amt":
                    amt = _dec(sub.text)
            if code == "EUR":
                eur_amt = amt
            elif code == ccy.upper():
                ccy_amt = amt

        if eur_amt is not None and ccy_amt is not None:
            # Храним курс CCY к EUR (как возвращает LB): 1 EUR = <rate> CCY
            out.append((d, ccy_amt))

    return out


# =========================
# Основная логика импорта
# =========================
def run_import(tp: str,
               dt_from: str,
               dt_to: str,
               list_only: bool = False,
               throttle: float = 0.2,
               stdout=None,
               reset: bool = False):
    """
    1) Печатает уникальный список валют из двух дат.
    2) Если list_only=False — по каждой валюте тянет историю и сохраняет в CurrencyRate.
    3) Если reset=True — очищает таблицу перед импортом.
    """
    start = datetime.now(timezone.utc)

    # Шаг 1: список валют
    codes = discover_unique_currencies(tp, dt_from, dt_to)
    if stdout:
        stdout.write(f"Currencies ({len(codes)}): {', '.join(codes)}")

    if list_only:
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        return {"currency_count": len(codes), "saved": 0, "elapsed_sec": elapsed}

    # Шаг 2: запись курсов
    saved = 0
    with transaction.atomic():
        if reset:
            deleted, _ = CurrencyRate.objects.all().delete()
            if stdout:
                stdout.write(f"Reset: deleted {deleted} rows from CurrencyRate")

        for i, ccy in enumerate(codes, start=1):
            hist = fetch_currency_history(ccy, tp, dt_from, dt_to)
            if stdout:
                stdout.write(f"[{i}/{len(codes)}] {ccy}: {len(hist)} records")
            for d, rate in hist:
                CurrencyRate.objects.update_or_create(
                    currency=ccy,
                    date=d,
                    defaults={"rate": rate},
                )
                saved += 1
            time.sleep(throttle)  # чуть притормозим между валютами

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    return {"currency_count": len(codes), "saved": saved, "elapsed_sec": elapsed}


# =========================
# Django management command
# =========================
class Command(BaseCommand):
    help = (
        "1) Берёт уникальный список валют из getFxRates на 2014-09-30 и 2025-09-05 и печатает его.\n"
        "2) По каждой валюте тянет историю getFxRatesForCurrency за весь интервал и сохраняет в CurrencyRate.\n"
        "EUR не сохраняется (курс 1.0 не нужен)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--tp", dest="tp", default=TP_DEFAULT, help="Тип курсов: EU | LT")
        parser.add_argument("--from", dest="dt_from", default=DT_FROM_DEFAULT, help="YYYY-MM-DD (начало интервала)")
        parser.add_argument("--to", dest="dt_to", default=DT_TO_DEFAULT, help="YYYY-MM-DD (конец интервала)")
        parser.add_argument("--list-only", dest="list_only", action="store_true",
                            help="Только вывести список валют и выйти (без записи курсов в БД)")
        parser.add_argument("--reset", dest="reset", action="store_true",
                            help="Очистить таблицу CurrencyRate перед импортом")

    def handle(self, *args, **opts):
        try:
            stats = run_import(
                tp=opts.get("tp") or TP_DEFAULT,
                dt_from=opts.get("dt_from") or DT_FROM_DEFAULT,
                dt_to=opts.get("dt_to") or DT_TO_DEFAULT,
                list_only=opts.get("list_only", False),
                stdout=self.stdout,
                reset=opts.get("reset", False),
            )
        except Exception as e:
            raise CommandError(str(e))

        self.stdout.write(self.style.SUCCESS("Done."))
        self.stdout.write(self.style.SUCCESS(
            f"Currencies: {stats['currency_count']}  Saved records: {stats['saved']}  "
            f"Took: {stats['elapsed_sec']:.2f}s"
        ))


