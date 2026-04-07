"""Тест F: ищем текстовые адреса в AR и других реестрах"""
import requests, json
BASE = "https://get.data.gov.lt"

def fetch(label, url):
    print(f"\n--- {label} ---")
    print(url)
    r = requests.get(url, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:1500])
    else:
        print(r.text[:200])

# 1) Все модели/namespaces в AR
fetch("AR namespaces", f"{BASE}/datasets/gov/rc/ar/:format/json")

# 2) Может в JAR есть модели с ja_kodas + adresas текстом
fetch("JAR models", f"{BASE}/datasets/gov/rc/jar/:format/json")

# 3) Пробуем искать по aob_kodas в другом API - adresai.lt / rekvizitai
# Может есть datasets/gov/rc/ar/aob
fetch("AR/aob", f"{BASE}/datasets/gov/rc/ar/aob/:format/json")

# 4) Пробуем rc/jar/iregistruoti или rc/jar/imones
for m in ["iregistruoti", "imones", "juridiniai", "JAR"]:
    fetch(m, f"{BASE}/datasets/gov/rc/jar/{m}/:format/json")
