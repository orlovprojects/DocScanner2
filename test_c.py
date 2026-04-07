"""Тест C: резолвим UUID адреса из Buveine"""
import requests, json
BASE = "https://get.data.gov.lt"
ADDR_UUID = "d4dce9ff-1b92-4386-af9c-9024b0417df8"

for path in [
    f"datasets/gov/rc/ar/Adresas/{ADDR_UUID}",
    f"datasets/gov/rc/adresai/Adresas/{ADDR_UUID}",
    f"datasets/gov/rc/jar/Adresas/{ADDR_UUID}",
    f"datasets/gov/rc/ar/adresai/Adresas/{ADDR_UUID}",
]:
    url = f"{BASE}/{path}/:format/json"
    print(f"\n{url}")
    r = requests.get(url, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:1000])
    else:
        print(r.text[:150])
