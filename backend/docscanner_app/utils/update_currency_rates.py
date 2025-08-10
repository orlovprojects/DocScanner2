import requests
import xml.etree.ElementTree as ET
from datetime import date as dt_date
from docscanner_app.models import CurrencyRate

def update_currency_rates(target_date=None):
    """
    Обновляет курсы валют на указанную дату (или за сегодня, если не указано)
    Курсы берутся с сайта Lietuvos bankas и сохраняются в CurrencyRate
    """
    if target_date is None:
        target_date = dt_date.today()
    date_str = target_date.strftime('%Y-%m-%d')
    url = f"https://www.lb.lt/webservices/FxRates/FxRates.asmx/getFxRates?tp=EU&dt={date_str}"

    resp = requests.get(url)
    resp.encoding = 'utf-8'
    root = ET.fromstring(resp.text)
    ns = {'lb': 'http://www.lb.lt/WebServices/FxRates'}

    count = 0
    for fxrate in root.findall('.//lb:FxRate', ns):
        ccyamts = fxrate.findall('lb:CcyAmt', ns)
        if len(ccyamts) == 2:
            ccy1 = ccyamts[0].find('lb:Ccy', ns).text
            amt1 = float(ccyamts[0].find('lb:Amt', ns).text)
            ccy2 = ccyamts[1].find('lb:Ccy', ns).text
            amt2 = float(ccyamts[1].find('lb:Amt', ns).text)
            # Нам нужен только курс валюты к EUR (EUR всегда amt1=1)
            if ccy1 == "EUR" and amt1 == 1:
                CurrencyRate.objects.update_or_create(
                    currency=ccy2,
                    date=target_date,
                    defaults={'rate': amt2}
                )
                count += 1
    # Курс EUR к EUR всегда 1
    CurrencyRate.objects.update_or_create(
        currency="EUR",
        date=target_date,
        defaults={'rate': 1.0}
    )
    return count