"""Тест пагинации Spinta — какой формат курсора работает"""
import requests, json
BASE = "https://get.data.gov.lt"
PATH = "datasets/gov/vmi/mm_registras/MokesciuMoketojas"

# Первая страница
url = f"{BASE}/{PATH}/:format/json?limit(2)"
r = requests.get(url, timeout=30)
data = r.json()
cursor = data["_page"]["next"]
print(f"Cursor: {cursor}")
print(f"Records page 1: {len(data['_data'])}")
last_id = data['_data'][-1].get('ja_kodas')
print(f"Last ja_kodas: {last_id}\n")

# Попытка 2: ?limit(2)&page("cursor")
for fmt in [
    f'{BASE}/{PATH}/:format/json?limit(2)&page("{cursor}")',
    f"{BASE}/{PATH}/:format/json?limit(2)&page({cursor})",
    f'{BASE}/{PATH}/:format/json?limit(2)&page.next="{cursor}"',
    f'{BASE}/{PATH}/:format/json?limit(2)&_page="{cursor}"',
]:
    print(f"Trying: {fmt[:100]}...")
    r2 = requests.get(fmt, timeout=30)
    print(f"  Status: {r2.status_code}")
    if r2.status_code == 200:
        d2 = r2.json()
        recs = d2.get("_data", [])
        if recs:
            print(f"  WORKS! Records: {len(recs)}, first ja_kodas: {recs[0].get('ja_kodas')}")
            break
    else:
        print(f"  {r2.text[:150]}")
