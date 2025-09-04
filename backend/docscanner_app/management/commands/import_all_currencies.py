# docscanner_app/management/commands/import_all_currencies.py

import time
import requests
import xml.etree.ElementTree as ET
from datetime import date as dt_date, timedelta
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.core.management.base import BaseCommand, CommandError
from docscanner_app.models import CurrencyRate

# ====== Константы ======
NS_URI  = "http://www.lb.lt/WebServices/FxRates"
LB_BASE = "https://www.lb.lt/webservices/FxRates/FxRates.asmx"  # точный регистр как в примере

DT_FROM_DEFAULT = "2014-09-30"
DT_TO_DEFAULT   = "2025-09-04"
TP_DEFAULT      = "EU"

REQUEST_TIMEOUT = 25
RETRY_WAIT_SEC  = [1, 2, 4]  # backoff


# ====== HTTP/XML утилиты ======
def _http_get(url: str) -> str:
    for i, wait in enumerate([0] + RETRY_WAIT_SEC):
        if wait:
            time.sleep(wait)
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            return resp.text
        except requests.RequestException:
            if i == len(RETRY_WAIT_SEC):
                raise
    raise RuntimeError("Failed to GET after retries")


def _dec(val):
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _findall(elem, localname, ns=True):
    """Находит элементы с учётом и без namespace."""
    if ns:
        return elem.findall(f".//{{{NS_URI}}}{localname}")
    return elem.findall(f".//{localname}")


def _discover_currency_codes():
    """Собирает ISO-коды валют (кроме EUR) по двум срезам — на начало и на конец диапазона."""
    codes = set()
    for dt in (DT_FROM_DEFAULT, DT_TO_DEFAULT):
        url  = f"{LB_BASE}/getFxRates?tp={TP_DEFAULT}&dt={dt}"
        xml  = _http_get(url)
        root = ET.fromstring(xml)

        # пробуем с NS, потом без
        fxrates = _findall(root, "FxRate", ns=True) or _findall(root, "FxRate", ns=False)
        for fx in fxrates:
            ccyamts = list(fx.findall(f"{{{NS_URI}}}CcyAmt")) or list(fx.findall("CcyAmt"))
            for ca in ccyamts:
                c = (ca.find(f"{{{NS_URI}}}Ccy") or ca.find("Ccy"))
                if c is not None and c.text:
                    code = c.text.strip().upper()
                    if code and code != "EUR":
                        codes.add(code)

    # убираем спецкоды, если попадутся
    for bad in ("XAU", "XAG", "XDR"):
        codes.discard(bad)
    return sorted(codes)


def _fetch_currency_history(ccy: str, dt_from: str, dt_to: str, tp: str = TP_DEFAULT):
    """Возвращает список (date, rate_decimal) по одной валюте из getFxRatesForCurrency."""
    url  = f"{LB_BASE}/getFxRatesForCurrency?tp={tp}&ccy={ccy}&dtFrom={dt_from}&dtTo={dt_to}"
    xml  = _http_get(url)
    root = ET.fromstring(xml)
    out  = []

    fxrates = _findall(root, "FxRate", ns=True) or _findall(root, "FxRate", ns=False)
    if not fxrates:
        # Иногда сервис отдаёт техническую ошибку/пустоту — вернём пусто
        return out

    for fx in fxrates:
        # Дата: <Dt> (иногда встречается <Dts> — поддержим оба)
        dt_node = (fx.find(f"{{{NS_URI}}}Dt") or fx.find("Dt")
                   or fx.find(f"{{{NS_URI}}}Dts") or fx.find("Dts"))
        if dt_node is None or not (dt_text := (dt_node.text or "").strip()):
            continue
        d = dt_date.fromisoformat(dt_text[:10])

        # Пара CcyAmt: EUR и наша валюта
        ccyamts = list(fx.findall(f"{{{NS_URI}}}CcyAmt")) or list(fx.findall("CcyAmt"))
        if len(ccyamts) != 2:
            continue

        def read_pair(node):
            c = (node.find(f"{{{NS_URI}}}Ccy") or node.find("Ccy"))
            a = (node.find(f"{{{NS_URI}}}Amt") or node.find("Amt"))
            return (c.text.strip().upper() if c is not None and c.text else ""), (_dec(a.text) if a is not None else None)

        ccy1, amt1 = read_pair(ccyamts[0])
        ccy2, amt2 = read_pair(ccyamts[1])

        if ccy1 == "EUR" and ccy2 == ccy.upper() and amt2 is not None:
            out.append((d, amt2))
        elif ccy2 == "EUR" and ccy1 == ccy.upper() and amt1 is not None:
            out.append((d, amt1))
        # иначе пропускаем

    return out


def bulk_import_all_currency_rates(dt_from=DT_FROM_DEFAULT,
                                   dt_to=DT_TO_DEFAULT,
                                   tp=TP_DEFAULT,
                                   dry_run=False,
                                   logger=None):
    """
    1) Полностью очищает таблицу CurrencyRate.
    2) Собирает список валют (кроме EUR).
    3) Для каждой валюты вытягивает ВСЕ курсы за [dt_from; dt_to] и сохраняет.
    4) EUR НЕ сохраняем.
    """
    start = datetime.now(timezone.utc)

    d1 = dt_date.fromisoformat(dt_from)
    d2 = dt_date.fromisoformat(dt_to)
    if d1 > d2:
        raise ValueError("dt_from must be <= dt_to")

    codes = _discover_currency_codes()
    if logger:
        logger.stdout.write(f"Discovered {len(codes)} currencies: {', '.join(codes)}")

    saved = 0
    per_ccy_counts = {}

    if dry_run:
        if logger:
            logger.stdout.write("DRY RUN: database will not be modified.")
        return {
            "currency_count": len(codes),
            "saved_records": 0,
            "per_currency": {c: 0 for c in codes},
            "elapsed_sec": 0.0,
            "range": (dt_from, dt_to),
            "tp": tp,
        }

    with transaction.atomic():
        # Чистим таблицу перед заливкой
        CurrencyRate.objects.all().delete()

        for idx, ccy in enumerate(codes, start=1):
            hist = _fetch_currency_history(ccy, dt_from, dt_to, tp=tp)
            per_ccy_counts[ccy] = len(hist)
            if logger:
                logger.stdout.write(f"[{idx}/{len(codes)}] {ccy}: {len(hist)} records")

            for d, rate in hist:
                CurrencyRate.objects.update_or_create(
                    currency=ccy,
                    date=d,
                    defaults={'rate': rate}
                )
                saved += 1

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    return {
        "currency_count": len(codes),
        "saved_records": saved,
        "per_currency": per_ccy_counts,
        "elapsed_sec": elapsed,
        "range": (dt_from, dt_to),
        "tp": tp,
    }


# ====== Django management command ======
class Command(BaseCommand):
    help = "Очищает таблицу и импортирует все курсы валют с LB (2014-09-30..2025-08-29 по умолчанию, tp=EU). EUR не сохраняется."

    def add_arguments(self, parser):
        parser.add_argument("--from", dest="dt_from", default=DT_FROM_DEFAULT,
                            help="YYYY-MM-DD (начало диапазона)")
        parser.add_argument("--to", dest="dt_to", default=DT_TO_DEFAULT,
                            help="YYYY-MM-DD (конец диапазона)")
        parser.add_argument("--tp", dest="tp", default="EU",
                            help="Тип курсов: EU | LT")
        parser.add_argument("--dry-run", dest="dry_run", action="store_true",
                            help="Только подсчёт без записи в БД")

    def handle(self, *args, **opts):
        try:
            stats = bulk_import_all_currency_rates(
                dt_from=opts.get("dt_from"),
                dt_to=opts.get("dt_to"),
                tp=opts.get("tp") or "EU",
                dry_run=opts.get("dry_run", False),
                logger=self,
            )
        except Exception as e:
            raise CommandError(str(e))

        self.stdout.write(self.style.SUCCESS("Done."))
        self.stdout.write(self.style.SUCCESS(
            f"Range: {stats['range'][0]}..{stats['range'][1]}  tp={stats['tp']}  dry_run={opts.get('dry_run', False)}"))
        self.stdout.write(self.style.SUCCESS(
            f"Currencies discovered: {stats['currency_count']}"))
        self.stdout.write(self.style.SUCCESS(
            f"Saved records: {stats['saved_records']}"))
        self.stdout.write(self.style.SUCCESS(
            f"Took: {stats['elapsed_sec']:.2f}s"))

