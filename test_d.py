"""Тест D: ищем текст адреса по aob_kodas и модели JAR"""
import requests, json
BASE = "https://get.data.gov.lt"

def fetch(label, url):
    print(f"\n--- {label} ---")
    print(url)
    r = requests.get(url, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:1200])
    else:
        print(r.text[:200])

# 1) Модели в JAR
fetch("Модели JAR", f"{BASE}/datasets/gov/rc/jar/:format/json")

# 2) Модели в AR/adresai
fetch("Модели AR/adresai", f"{BASE}/datasets/gov/rc/ar/adresai/:format/json")

# 3) Текст адреса по aob_kodas=158912982
AOB = 158912982
for path in [
    f"datasets/gov/rc/ar/adresai/Adresas?aob_kodas={AOB}",
    f"datasets/gov/rc/ar/adresai/AdresoObjektas?aob_kodas={AOB}",
]:
    fetch(f"Адрес по aob_kodas", f"{BASE}/{path}/:format/json?limit(2)")

# 4) Может есть отдельная модель с полным адресом
for model in ["Gatve", "Gyvenamoji_vieta", "Savivaldybe", "AdresoElementas"]:
    fetch(model, f"{BASE}/datasets/gov/rc/ar/adresai/{model}/:format/json?limit(1)")
