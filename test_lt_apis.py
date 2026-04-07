"""
Тест двух API get.data.gov.lt:
1) MokesciuMoketojas (реестр налогоплательщиков)
2) Buveine (адреса из JAR)

Запуск: python test_lt_apis.py
"""
import requests
import json
import sys

BASE = "https://get.data.gov.lt"

def fetch_sample(name, path, limit=3):
    url = f"{BASE}/{path}/:format/json?limit({limit})"
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"  URL: {url}")
    print(f"{'='*60}")
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        data = r.json()

        # Показываем структуру _page
        if "_page" in data:
            print(f"\n_page: {json.dumps(data['_page'], indent=2, ensure_ascii=False)}")

        # Показываем записи
        records = data.get("_data", [])
        print(f"\nЗаписей получено: {len(records)}")
        for i, rec in enumerate(records):
            print(f"\n--- Запись {i+1} ---")
            print(json.dumps(rec, indent=2, ensure_ascii=False))

        return data
    except Exception as e:
        print(f"\nОшибка: {e}")
        return None


def test_buveine_by_code(ja_kodas):
    """Тест поиска адреса по коду компании"""
    url = f"{BASE}/datasets/gov/rc/jar/buveines/Buveine/:format/json?limit(3)&ja_kodas={ja_kodas}"
    print(f"\n{'='*60}")
    print(f"  Buveine по ja_kodas={ja_kodas}")
    print(f"  URL: {url}")
    print(f"{'='*60}")
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        data = r.json()
        records = data.get("_data", [])
        print(f"\nЗаписей найдено: {len(records)}")
        for i, rec in enumerate(records):
            print(f"\n--- Запись {i+1} ---")
            print(json.dumps(rec, indent=2, ensure_ascii=False))
        return data
    except Exception as e:
        # Попробуем альтернативный формат фильтрации Spinta
        alt_url = f"{BASE}/datasets/gov/rc/jar/buveines/Buveine/:format/json?limit(3)&select(ja_kodas,adresas)&ja_kodas=\"{ja_kodas}\""
        print(f"  Первый формат не сработал ({e}), пробуем: {alt_url}")
        try:
            r = requests.get(alt_url, timeout=30)
            r.raise_for_status()
            data = r.json()
            records = data.get("_data", [])
            print(f"\nЗаписей найдено: {len(records)}")
            for rec in records:
                print(json.dumps(rec, indent=2, ensure_ascii=False))
            return data
        except Exception as e2:
            print(f"\nОшибка: {e2}")
            return None


def count_total(path):
    """Попробуем узнать общее кол-во записей"""
    url = f"{BASE}/{path}/:format/json?limit(1)&count()"
    print(f"\nCount URL: {url}")
    try:
        r = requests.get(url, timeout=30)
        data = r.json()
        # Spinta может вернуть count в _page или отдельно
        print(f"Response keys: {list(data.keys())}")
        if "_page" in data:
            print(f"_page: {json.dumps(data['_page'], indent=2)}")
        if "_total" in data:
            print(f"_total: {data['_total']}")
    except Exception as e:
        print(f"Count error: {e}")


if __name__ == "__main__":
    print(">>> Тестируем MokesciuMoketojas...")
    data1 = fetch_sample(
        "MokesciuMoketojas (налогоплательщики)",
        "datasets/gov/vmi/mm_registras/MokesciuMoketojas",
        limit=3,
    )

    print("\n\n>>> Тестируем Buveine...")
    data2 = fetch_sample(
        "Buveine (адреса юр. лиц из JAR)",
        "datasets/gov/rc/jar/buveines/Buveine",
        limit=3,
    )

    # Если получили данные из первого API, попробуем найти адрес
    if data1:
        records = data1.get("_data", [])
        if records:
            # Ищем поле с кодом компании
            first = records[0]
            # Пробуем разные варианты названия поля
            ja_kodas = None
            for field in ["ja_kodas", "mokescio_moketojo_kodas", "kodas", "mm_kodas"]:
                if field in first:
                    ja_kodas = first[field]
                    print(f"\n\nНашли код компании в поле '{field}': {ja_kodas}")
                    break

            if ja_kodas is None:
                print(f"\n\nВсе поля первой записи: {list(first.keys())}")
                # Берём первое числовое значение как код
                for k, v in first.items():
                    if k.startswith("_"):
                        continue
                    if isinstance(v, (int, str)) and str(v).isdigit() and len(str(v)) >= 7:
                        ja_kodas = str(v)
                        print(f"Предполагаемый код компании (поле '{k}'): {ja_kodas}")
                        break

            if ja_kodas:
                print(f"\n\n>>> Тестируем поиск адреса по коду {ja_kodas}...")
                test_buveine_by_code(ja_kodas)

    # Попробуем count
    print("\n\n>>> Пробуем узнать общее количество записей...")
    count_total("datasets/gov/vmi/mm_registras/MokesciuMoketojas")
    count_total("datasets/gov/rc/jar/buveines/Buveine")
