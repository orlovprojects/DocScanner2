"""Тест A: структура моделей в gov/rc/jar"""
import requests, json
BASE = "https://get.data.gov.lt"

for path in [
    "datasets/gov/rc/jar",
    "datasets/gov/rc",
]:
    url = f"{BASE}/{path}/:format/json"
    print(f"\n{url}")
    r = requests.get(url, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:1500])
