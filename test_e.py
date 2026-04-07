"""Тест E: правильный формат фильтрации Spinta"""
import requests, json
BASE = "https://get.data.gov.lt"
AOB = 158912982

def fetch(label, url):
    print(f"\n--- {label} ---")
    print(url)
    r = requests.get(url, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:1500])
    else:
        print(r.text[:250])

# 1) Все поля модели Adresas (без фильтра, limit 2)
fetch("Adresas sample",
      f"{BASE}/datasets/gov/rc/ar/adresai/Adresas/:format/json?limit(2)")

# 2) Фильтр aob_kodas через Spinta синтаксис
fetch("Adresas filter aob_kodas",
      f"{BASE}/datasets/gov/rc/ar/adresai/Adresas/:format/json?limit(2)&aob_kodas={AOB}")

# 3) Альтернативный синтаксис
fetch("Adresas select+filter alt",
      f'{BASE}/datasets/gov/rc/ar/adresai/Adresas/:format/json?limit(2)&select()&aob_kodas="{AOB}"')
