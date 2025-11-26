# utils/lineitem_rules.py
import json
import logging
import re
import unicodedata
from typing import Any, Dict, List, Tuple

from rest_framework import serializers

logger = logging.getLogger(__name__)

Rule = Dict[str, Any]

ALLOWED_VAT_OPS = {"<", "<=", "=", ">=", ">"}


# ------------------ string helpers ------------------


def normalize_name_for_match(value: Any) -> str:
    """
    Нормализуем pavadinimas для сравнения:
    - str()
    - strip
    - схлопываем все пробелы до одного
    - to lower
    - убираем диакритику (š -> s, ė -> e, ...)
    - убираем мусорные знаки
    - снова схлопываем пробелы
    """
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""

    # все whitespace -> один пробел
    s = re.sub(r"\s+", " ", s)

    # нижний регистр
    s = s.lower()

    # убрать диакритику (NFD + выкинуть combining marks)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))

    # убрать кавычки и простые знаки препинания
    s = re.sub(r"[\"'“”„.,!?()\\[\\]{}]+", "", s)

    # дефисы/подчёркивания считаем разделителями
    s = re.sub(r"[-_]+", " ", s)

    # снова схлопываем пробелы и trim
    s = re.sub(r"\s+", " ", s).strip()

    return s


def _norm_code(value: Any) -> str:
    """
    Нормализация кодов (Įmonės kodas, VAT код):
    - str, strip, upper
    - пустое -> ""
    """
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    return s.upper()


# ------------------ raw -> list[dict] ------------------


def _to_rules_list(raw: Any) -> List[Rule]:
    """
    Нормализуем сырое значение из request.data["lineitem_rules"]
    в список словарей (list[dict]).

    Допускаем варианты:
      - уже list[dict]
      - одиночный dict
      - строка с JSON (list | dict)
      - None / пустое -> []
    Во всех других случаях — ValidationError.
    """
    if raw is None:
        return []

    # Уже список
    if isinstance(raw, list):
        if not all(isinstance(r, dict) for r in raw):
            raise serializers.ValidationError(
                {"lineitem_rules": "kiekviena taisyklė turi būti objektas (JSON objektas)."}
            )
        return raw

    # Одиночный dict
    if isinstance(raw, dict):
        return [raw]

    # Строка с JSON
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except Exception as e:
            logger.warning("Failed to parse lineitem_rules JSON: %s", e)
            raise serializers.ValidationError(
                {"lineitem_rules": "lineitem_rules turi būti galiojantis JSON."}
            )

        if isinstance(data, list):
            if not all(isinstance(r, dict) for r in data):
                raise serializers.ValidationError(
                    {"lineitem_rules": "kiekviena taisyklė turi būti objektas (JSON objektas)."}
                )
            return data

        if isinstance(data, dict):
            return [data]

        raise serializers.ValidationError(
            {"lineitem_rules": "lineitem_rules JSON turi būti masyvas arba objektas."}
        )

    raise serializers.ValidationError(
        {"lineitem_rules": "lineitem_rules turi būti masyvas, objektas arba JSON eilutė."}
    )


def _normalize_rule_ids(rules: List[Rule]) -> List[Rule]:
    """
    Гарантируем, что у каждого правила есть уникальный числовой id.
    Если id нет или он не int — расставляем по порядку после максимального имеющегося.
    """
    existing_ids = {r.get("id") for r in rules if isinstance(r.get("id"), int)}
    next_id = (max(existing_ids) + 1) if existing_ids else 1

    for r in rules:
        rid = r.get("id")
        if not isinstance(rid, int):
            r["id"] = next_id
            next_id += 1

    return rules


# ------------------ condition key for duplicate detection ------------------


def _rule_condition_key(rule: Rule) -> Tuple:
    """
    Строим ключ, описывающий только УСЛОВИЯ правила (без результата и enabled/id):
      - apply_to_all
      - vat_percent (op, value)
      - name_contains_norm
      - buyer_id / buyer_vat_code
      - seller_id / seller_vat_code
    """
    if rule.get("apply_to_all"):
        # Особый ключ для "default" правила
        return ("ALL",)

    vat = rule.get("vat_percent") or {}
    op = vat.get("op") if isinstance(vat, dict) else None
    val = vat.get("value") if isinstance(vat, dict) else None

    name_norm = rule.get("name_contains_norm") or ""

    buyer_id = _norm_code(rule.get("buyer_id"))
    buyer_vat_code = _norm_code(rule.get("buyer_vat_code"))
    seller_id = _norm_code(rule.get("seller_id"))
    seller_vat_code = _norm_code(rule.get("seller_vat_code"))

    return (
        bool(vat),
        op,
        val,
        name_norm,
        buyer_id,
        buyer_vat_code,
        seller_id,
        seller_vat_code,
    )


# ------------------ main normalizer ------------------


def normalize_lineitem_rules(raw: Any) -> List[Rule]:
    """
    Главная точка входа нормализации:
    - raw -> список dict-ов
    - нормализуем id, строки, PVM, pirkėjas/pardavėjas, pavadinimas
    - проверяем:
        * есть хотя бы одно условие (arba apply_to_all)
        * максимум viena aktyvi apply_to_all taisyklė
        * nėra dublikatų pagal sąlygų raktą
        * result_kodas neprivalo būti tuščias
    Возвращаем list[Rule], готовый класть в user.lineitem_rules.
    """
    rules = _to_rules_list(raw)
    rules = _normalize_rule_ids(rules)

    normalized: List[Rule] = []
    seen_keys: Dict[Tuple, int] = {}
    apply_all_active_count = 0

    for idx, item in enumerate(rules):
        if not isinstance(item, dict):
            raise serializers.ValidationError(
                {"lineitem_rules": f"taisykle indeksu {idx} turi būti objektas (JSON objektas)."}
            )

        r: Rule = dict(item)  # копия, чтобы не трогать исходный объект

        # --- id ---
        rid = r.get("id")
        if not isinstance(rid, int):
            # на всякий случай, если _normalize_rule_ids не отработал (но он уже отработал)
            rid = idx + 1
            r["id"] = rid

        # --- enabled / apply_to_all ---
        enabled = bool(r.get("enabled", True))
        r["enabled"] = enabled

        apply_all = bool(r.get("apply_to_all", False))
        r["apply_to_all"] = apply_all

        # --- result_kodas / result_tipas (čia būtų prekes_kodas/ tipas) ---
        result_kodas = (r.get("result_kodas") or "").strip()
        if not result_kodas:
            raise serializers.ValidationError(
                {"lineitem_rules": f"taisyklei #{rid} trūksta 'Prekės kodas' (result_kodas yra privalomas)."}
            )
        r["result_kodas"] = result_kodas

        result_tipas = (r.get("result_tipas") or "Prekė").strip() or "Prekė"
        # можно ограничить тремя вариантами
        if result_tipas not in {"Prekė", "Paslauga", "Kodas"}:
            raise serializers.ValidationError(
                {"lineitem_rules": f"taisyklei #{rid} 'result_tipas' turi būti 'Prekė', 'Paslauga' arba 'Kodas'."}
            )
        r["result_tipas"] = result_tipas

        # --- VAT (PVM procentas) ---
        vat_raw = r.get("vat_percent")
        vat = None
        if vat_raw not in (None, "", {}):
            if not isinstance(vat_raw, dict):
                raise serializers.ValidationError(
                    {"lineitem_rules": f"taisyklei #{rid} 'vat_percent' turi būti objektas."}
                )
            op = vat_raw.get("op") or "="
            if op not in ALLOWED_VAT_OPS:
                raise serializers.ValidationError(
                    {"lineitem_rules": f"taisyklei #{rid} netinkamas PVM operatorius: {op!r}."}
                )
            value = vat_raw.get("value")
            if value is None:
                vat = None
            else:
                try:
                    value_int = int(value)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(
                        {"lineitem_rules": f"taisyklei #{rid} PVM reikšmė turi būti sveikas skaičius 0..100."}
                    )
                if not (0 <= value_int <= 100):
                    raise serializers.ValidationError(
                        {"lineitem_rules": f"taisyklei #{rid} PVM reikšmė turi būti 0..100."}
                    )
                vat = {"op": op, "value": value_int}

        # jei apply_to_all, PVM nenaudojam
        r["vat_percent"] = None if apply_all else vat

        # --- pavadinimas (name_contains) ---
        raw_name = (r.get("name_contains") or "").strip()
        if raw_name:
            name_norm = normalize_name_for_match(raw_name)
            # jei po normalizacijos nieko neliko – laikom, kad sąlygos nėra
            if not name_norm:
                raw_name = ""
                name_norm = ""
        else:
            name_norm = ""

        # jei apply_to_all – jokių sąlygų pagal pavadinimą
        if apply_all:
            r["name_contains"] = ""
            r["name_contains_norm"] = ""
        else:
            r["name_contains"] = raw_name
            r["name_contains_norm"] = name_norm

        # --- pirkėjas / pardavėjas ---
        def _clean_party(prefix: str) -> None:
            code = _norm_code(r.get(f"{prefix}_id"))
            vatc = _norm_code(r.get(f"{prefix}_vat_code"))
            if not code and not vatc:
                # sąlygos nėra
                r[f"{prefix}_id"] = ""
                r[f"{prefix}_vat_code"] = ""
            else:
                r[f"{prefix}_id"] = code
                r[f"{prefix}_vat_code"] = vatc

        if apply_all:
            r["buyer_id"] = ""
            r["buyer_vat_code"] = ""
            r["seller_id"] = ""
            r["seller_vat_code"] = ""
        else:
            _clean_party("buyer")
            _clean_party("seller")

        # --- ar yra bent viena sąlyga? ---
        has_condition = (
            apply_all
            or (r.get("vat_percent") is not None)
            or bool(r.get("name_contains_norm"))
            or bool(_norm_code(r.get("buyer_id")))
            or bool(_norm_code(r.get("buyer_vat_code")))
            or bool(_norm_code(r.get("seller_id")))
            or bool(_norm_code(r.get("seller_vat_code")))
        )

        if not has_condition:
            raise serializers.ValidationError(
                {
                    "lineitem_rules": (
                        f"taisyklei #{rid} turi būti nurodyta bent viena sąlyga "
                        "(PVM, pavadinimas, pirkėjas, pardavėjas arba 'Taikyti visoms kitoms eilutėms')."
                    )
                }
            )

        # --- apply_to_all: tik viena aktyvi taisyklė ---
        if apply_all and enabled:
            apply_all_active_count += 1
            if apply_all_active_count > 1:
                raise serializers.ValidationError(
                    {
                        "lineitem_rules": (
                            "Gali būti tik viena AKTYVI taisyklė su 'Taikyti visoms kitoms eilutėms'."
                        )
                    }
                )

        # --- dublikatai pagal sąlygų raktą ---
        cond_key = _rule_condition_key(r)
        if cond_key in seen_keys:
            other_idx = seen_keys[cond_key]
            raise serializers.ValidationError(
                {
                    "lineitem_rules": (
                        f"Taisyklės su ID #{rules[other_idx].get('id')} ir #{rid} turi vienodas sąlygas "
                        "(dublikuotos taisyklės)."
                    )
                }
            )
        seen_keys[cond_key] = idx

        normalized.append(r)

    return normalized


# ------------------ helper for direct saving ------------------


def set_lineitem_rules_for_user(user, raw_rules: Any) -> List[Rule]:
    """
    Helper: нормализует и сохраняет lineitem_rules для пользователя.
    В большинстве случаев ты уже делаешь это в сериалайзере,
    но эта функция может пригодиться в сервисах/management-командах.
    """
    rules = normalize_lineitem_rules(raw_rules)
    user.lineitem_rules = rules
    user.save(update_fields=["lineitem_rules"])
    logger.info("Saved %d lineitem_rules for user id=%s", len(rules), user.pk)
    return rules