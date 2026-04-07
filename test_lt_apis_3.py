"""
Тест #3: резолвим UUID ссылки из Buveine
"""
import requests
import json

BASE = "https://get.data.gov.lt"

def fetch(label, url):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"  {url}")
    print(f"{'='*60}")
    try:
        r = requests.get(url, timeout=30)
        print(f"Status: {r.status_code}")
        if r.status_code != 200:
            print(f"Body: {r.text[:300]}")
            return None
        data = r.json()
        print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])
        return data
    except Exception as e:
        print(f"Error: {e}")
        return None

# UUID из Buveine записи
JA_UUID = "c6aed122-16e9-48ff-9dd5-be0b2cdc9b55"
ADDR_UUID = "d4dce9ff-1b92-4386-af9c-9024b0417df8"

# 1) Пробуем получить юр.лицо по UUID
for path in [
    f"datasets/gov/rc/jar/JuridinisAsmuo/{JA_UUID}",
    f"datasets/gov/rc/jar/juridiniai_asmenys/JuridinisAsmuo/{JA_UUID}",
    f"datasets/gov/rc/jar/dalyviai/JuridinisAsmuo/{JA_UUID}",
]:
    fetch(f"JuridinisAsmuo by UUID", f"{BASE}/{path}/:format/json")

# 2) Ищем все модели в gov/rc/jar
fetch("Все модели в gov/rc/jar", f"{BASE}/datasets/gov/rc/jar/:format/json")

# 3) Ищем все модели в gov/rc
fetch("Все модели в gov/rc", f"{BASE}/datasets/gov/rc/:format/json")

# 4) Пробуем адрес по UUID
for path in [
    f"datasets/gov/rc/ar/{ADDR_UUID}",
    f"datasets/gov/rc/jar/Adresas/{ADDR_UUID}",
]:
    fetch(f"Adresas by UUID", f"{BASE}/{path}/:format/json")

# 5) Может адреса в отдельном dataset?
fetch("AR dataset structure", f"{BASE}/datasets/gov/rc/ar/:format/json")

# 6) Пробуем вообще другой подход — JAR iregistruoti
fetch("JAR iregistruoti", f"{BASE}/datasets/gov/rc/jar/iregistruoti/:format/json")

# 7) Может всё проще — ищем полную модель с адресом через VMI
fetch("VMI mm_registras structure", f"{BASE}/datasets/gov/vmi/mm_registras/:format/json")

# 8) Адрес напрямую в MokesciuMoketojas?
fetch("MokesciuMoketojas полные поля",
      f"{BASE}/datasets/gov/vmi/mm_registras/MokesciuMoketojas/:format/json?limit(1)&select()")
