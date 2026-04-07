"""
Тест #2: исследуем связи в Buveine и expand
"""
import requests
import json

BASE = "https://get.data.gov.lt"

def fetch(url):
    print(f"\nURL: {url}")
    try:
        r = requests.get(url, timeout=30)
        print(f"Status: {r.status_code}")
        if r.status_code != 200:
            print(f"Body: {r.text[:500]}")
            return None
        data = r.json()
        print(json.dumps(data, indent=2, ensure_ascii=False)[:3000])
        return data
    except Exception as e:
        print(f"Error: {e}")
        return None

print("=" * 60)
print("1) MokesciuMoketojas — полная запись (limit 2)")
print("=" * 60)
fetch(f"{BASE}/datasets/gov/vmi/mm_registras/MokesciuMoketojas/:format/json?limit(2)")

print("\n" + "=" * 60)
print("2) Buveine с expand() — пробуем развернуть ссылки")
print("=" * 60)
# Вариант 1: expand
fetch(f"{BASE}/datasets/gov/rc/jar/buveines/Buveine/:format/json?limit(2)&expand()")

print("\n" + "=" * 60)
print("3) JuridinisAsmuo — что внутри (там должен быть ja_kodas)")
print("=" * 60)
fetch(f"{BASE}/datasets/gov/rc/jar/JuridinisAsmuo/:format/json?limit(2)")

print("\n" + "=" * 60)
print("4) Пробуем другой путь к JAR юр.лицам")
print("=" * 60)
fetch(f"{BASE}/datasets/gov/rc/jar/JuridiniaiAsmenys/:format/json?limit(2)")

print("\n" + "=" * 60)
print("5) Смотрим структуру JAR dataset")
print("=" * 60)
fetch(f"{BASE}/datasets/gov/rc/jar/:format/json")

print("\n" + "=" * 60)
print("6) Buveine — пробуем select с вложенными полями")
print("=" * 60)
fetch(f"{BASE}/datasets/gov/rc/jar/buveines/Buveine/:format/json?limit(2)&select(_id,juridinis_asmuo,adresas,adresas_nuo)&expand()")

print("\n" + "=" * 60)
print("7) Адреса — ищем модель Adresas")
print("=" * 60)
fetch(f"{BASE}/datasets/gov/rc/jar/buveines/:format/json")

print("\n" + "=" * 60)
print("8) Пробуем Adresai из RC/AR")
print("=" * 60)
fetch(f"{BASE}/datasets/gov/rc/ar/Adresas/:format/json?limit(2)")
