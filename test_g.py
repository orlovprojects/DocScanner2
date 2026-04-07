"""Тест G: JuridinisAsmuo из iregistruoti + ещё попытки с адресами"""
import requests, json
BASE = "https://get.data.gov.lt"

def fetch(label, url):
    print(f"\n--- {label} ---")
    print(url)
    r = requests.get(url, timeout=30)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False)[:2000])
    else:
        print(r.text[:200])

# 1) JuridinisAsmuo из iregistruoti — должен иметь ja_kodas
fetch("JAR iregistruoti JuridinisAsmuo",
      f"{BASE}/datasets/gov/rc/jar/iregistruoti/JuridinisAsmuo/:format/json?limit(2)")

# 2) Резолвим ja UUID через iregistruoti
JA_UUID = "c6aed122-16e9-48ff-9dd5-be0b2cdc9b55"
fetch("JuridinisAsmuo by UUID",
      f"{BASE}/datasets/gov/rc/jar/iregistruoti/JuridinisAsmuo/{JA_UUID}/:format/json")

# 3) Buveine с expand — ещё раз правильным синтаксисом
fetch("Buveine expand",
      f"{BASE}/datasets/gov/rc/jar/buveines/Buveine/:format/json?limit(1)&expand()")

# 4) Buveine select с вложенным полем
fetch("Buveine select nested",
      f"{BASE}/datasets/gov/rc/jar/buveines/Buveine/:format/json?limit(1)&select(juridinis_asmuo._id,adresas._id)")
