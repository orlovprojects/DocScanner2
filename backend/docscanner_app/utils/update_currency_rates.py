import requests
import xml.etree.ElementTree as ET
from datetime import date as dt_date
from decimal import Decimal, InvalidOperation
from docscanner_app.models import CurrencyRate

LB_BASE = "https://www.lb.lt/webservices/FxRates/FxRates.asmx"
HEADERS = {
    "User-Agent": "DocScanner/1.0",
    "Accept": "application/xml, text/xml;q=0.9, */*;q=0.1",
}

def _local(tag: str) -> str:
    # '{ns}Tag' -> 'Tag' ; 'Tag' -> 'Tag'
    return tag.split('}', 1)[-1] if '}' in tag else tag

def _dec(x):
    try:
        return Decimal(str(x))
    except (InvalidOperation, TypeError, ValueError):
        return None

def update_currency_rates(target_date: dt_date | None = None, tp: str = "EU", timeout: int = 15):
    """
    Ежедневное обновление курсов:
      - забираем getFxRates на target_date,
      - сохраняем курсы НЕ-EUR под датой target_date,
      - если запись уже есть с тем же курсом — пропускаем; если курс другой — обновляем.

    Возвращает dict со статистикой.
    """
    if target_date is None:
        target_date = dt_date.today()

    url = f"{LB_BASE}/getFxRates"
    params = {"tp": tp, "dt": target_date.strftime("%Y-%m-%d")}
    resp = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    resp.encoding = "utf-8"

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        return {"date": target_date, "inserted": 0, "updated": 0, "skipped": 0, "error": "parse_error"}

    inserted = updated = skipped = 0

    for fx in root.iter():
        if _local(fx.tag) != "FxRate":
            continue

        # Собираем пару (EUR, CCY) независимо от порядка
        pairs = []
        for ch in fx:
            if _local(ch.tag) != "CcyAmt":
                continue
            ccy = None
            amt = None
            for sub in ch:
                name = _local(sub.tag)
                if name == "Ccy":
                    ccy = (sub.text or "").strip().upper()
                elif name == "Amt":
                    amt = _dec(sub.text)
            if ccy and amt is not None:
                pairs.append((ccy, amt))

        if len(pairs) != 2:
            continue

        (c1, a1), (c2, a2) = pairs
        # Определяем НЕ-EUR валюту и её курс к EUR (как возвращает LB)
        if c1 == "EUR" and c2 != "EUR":
            code, rate = c2, a2
        elif c2 == "EUR" and c1 != "EUR":
            code, rate = c1, a1
        else:
            continue  # пара не EUR/CCY — пропускаем

        if code == "EUR":  # EUR не сохраняем
            continue

        # Проверяем существование записи на target_date до сохранения
        obj = CurrencyRate.objects.filter(currency=code, date=target_date).first()
        if obj:
            if obj.rate == rate:
                skipped += 1
            else:
                obj.rate = rate
                obj.save(update_fields=["rate"])
                updated += 1
        else:
            CurrencyRate.objects.create(currency=code, date=target_date, rate=rate)
            inserted += 1

    return {"date": target_date, "inserted": inserted, "updated": updated, "skipped": skipped}





# import requests
# import xml.etree.ElementTree as ET
# from datetime import date as dt_date
# from docscanner_app.models import CurrencyRate

# def update_currency_rates(target_date=None):
#     """
#     Обновляет курсы валют на указанную дату (или за сегодня, если не указано)
#     Курсы берутся с сайта Lietuvos bankas и сохраняются в CurrencyRate
#     """
#     if target_date is None:
#         target_date = dt_date.today()
#     date_str = target_date.strftime('%Y-%m-%d')
#     url = f"https://www.lb.lt/webservices/FxRates/FxRates.asmx/getFxRates?tp=EU&dt={date_str}"

#     resp = requests.get(url)
#     resp.encoding = 'utf-8'
#     root = ET.fromstring(resp.text)
#     ns = {'lb': 'http://www.lb.lt/WebServices/FxRates'}

#     count = 0
#     for fxrate in root.findall('.//lb:FxRate', ns):
#         ccyamts = fxrate.findall('lb:CcyAmt', ns)
#         if len(ccyamts) == 2:
#             ccy1 = ccyamts[0].find('lb:Ccy', ns).text
#             amt1 = float(ccyamts[0].find('lb:Amt', ns).text)
#             ccy2 = ccyamts[1].find('lb:Ccy', ns).text
#             amt2 = float(ccyamts[1].find('lb:Amt', ns).text)
#             # Нам нужен только курс валюты к EUR (EUR всегда amt1=1)
#             if ccy1 == "EUR" and amt1 == 1:
#                 CurrencyRate.objects.update_or_create(
#                     currency=ccy2,
#                     date=target_date,
#                     defaults={'rate': amt2}
#                 )
#                 count += 1
#     # Курс EUR к EUR всегда 1
#     CurrencyRate.objects.update_or_create(
#         currency="EUR",
#         date=target_date,
#         defaults={'rate': 1.0}
#     )
#     return count