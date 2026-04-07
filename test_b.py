"""Тест B: резолвим UUID юр.лица из Buveine"""
import requests, json
BASE = "https://get.data.gov.lt"
JA_UUID = "c6aed122-16e9-48ff-9dd5-be0b2cdc9b55"

for path in [
    f"datasets/gov/rc/jar/JuridinisAsmuo/{JA_UUID}",
    f"datasets/gov/rc/jar/juridiniai_asmenys/JuridinisAsmuo/{JA_UUID}",
    f"datasets/gov/rc/jar/dalyviai/JuridinisAsmuo/{JA_UUID}",
]:
    url = f"{BASE}/{path}/:format/json"
    print(f"\n{url}")
    r = requests.get(url, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:1000])
    else:
        print(r.text[:200])
