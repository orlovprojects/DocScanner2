from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional
import logging

from .lineitem_rules import normalize_name_for_match, _norm_code  # <-- импорт из utils/lineitem_rules.py

logger = logging.getLogger("docscanner_app")

Rule = Dict[str, Any]

def _rule_specificity(rule: Rule) -> int:
    """
    Считает «вес» правила = количество реально используемых фильтров:

      +1 если задан buyer_id
      +1 если задан buyer_vat_code
      +1 если задан seller_id
      +1 если задан seller_vat_code
      +1 если есть name_contains / name_contains_norm
      +1 если есть условие по VAT (vat_percent != null)

    Предполагается, что _rule_matches уже вернул True, т.е. все эти фильтры,
    если заданы, уже совпали.
    """
    score = 0
    apply_to_all = bool(rule.get("apply_to_all"))

    if not apply_to_all:
        if _norm_code(rule.get("buyer_id")):
            score += 1
        if _norm_code(rule.get("buyer_vat_code")):
            score += 1
        if _norm_code(rule.get("seller_id")):
            score += 1
        if _norm_code(rule.get("seller_vat_code")):
            score += 1

        name_contains = (rule.get("name_contains") or "").strip()
        name_contains_norm = (rule.get("name_contains_norm") or "").strip()
        if name_contains or name_contains_norm:
            score += 1

    # VAT-условие
    if rule.get("vat_percent"):
        score += 1

    return score


def _rule_id_int(rule: Rule) -> int:
    rid = rule.get("id")
    try:
        return int(rid)
    except Exception:
        return 10**9

def _to_rules(raw: Any) -> List[Rule]:
    """
    Безопасно приводим user.lineitem_rules к list[dict].
    """
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    if isinstance(raw, dict):
        return [raw]
    return []


def _norm_str(x: Any) -> str:
    return (str(x or "")).strip()


def _normalize_preke_paslauga(result_tipas: Any,
                              kodas_kaip: Any = None) -> Optional[str]:
  """
  UI gali atsiųsti:
    - "Prekė" / "Paslauga"
    - "Kodas" + result_kodas_kaip: "Prekei" / "Paslaugai"
    - arba jau skaitmenis: "1" / "2" / "3" / "4"

  DB laukelyje preke_paslauga mes laikom:
    1 = Prekė
    2 = Paslauga
    3 = Kodas (Prekei)
    4 = Kodas (Paslaugai)
  """
  if result_tipas is None:
    return None

  s = str(result_tipas or "").strip().lower()

  # jei jau skaičius – paliekam kaip yra
  if s in ("1", "2", "3", "4"):
    return s

  if s in ("preke", "prekė"):
    return "1"
  if s in ("paslauga",):
    return "2"

  # "kodas" + papildomas laukas "kaip"
  if s == "kodas":
    kk = str(kodas_kaip or "").strip().lower()
    if kk.startswith("prekei") or kk.startswith("preke"):
      return "3"   # Kodas (Prekei)
    if kk.startswith("paslaugai") or kk.startswith("paslaug"):
      return "4"   # Kodas (Paslaugai)
    # jei kažką keisto atsiuntė – default į prekei
    return "3"

  # atsarginiai pavadinimai, jei ateis tiesioginė reikšmė
  if s in ("kodas_prekei", "kodas-prekei", "kodas prekei"):
    return "3"
  if s in ("kodas_paslaugai", "kodas-paslaugai", "kodas paslaugai"):
    return "4"

  return None


def _vat_matches(rule_vat: Dict[str, Any] | None, line_vat: Any) -> bool:
    """
    Сравнение PVM % по условию {op, value}.
    Если в правиле vat_percent = null → условие по VAT НЕ применяется.
    """
    if not rule_vat:
        return True  # нет условия на VAT → подходит

    op = (rule_vat.get("op") or "").strip()
    value = rule_vat.get("value", None)
    if value is None:
        return True  # странное правило, но не блокируем

    if line_vat is None:
        return False

    try:
        lv = line_vat if isinstance(line_vat, Decimal) else Decimal(str(line_vat))
        rv = value if isinstance(value, Decimal) else Decimal(str(value))
    except Exception:
        return False

    if op == "<":
        return lv < rv
    if op == "<=":
        return lv <= rv
    if op == "=":
        return lv == rv
    if op == ">=":
        return lv >= rv
    if op == ">":
        return lv > rv

    # неизвестный оператор — считаем, что правило по VAT не подходит
    return False


def _match_name_condition(rule: Rule, line) -> bool:
    """
    Проверка условия по pavadinimas (prekes_pavadinimas):

    - rule.name_contains_norm берётся из БД (нормализовано на сохранении),
      если его нет (старые данные) — считаем на лету из rule.name_contains.
    - line.prekes_pavadinimas нормализуем той же функцией normalize_name_for_match.
    - считаем совпадением, если name_contains_norm является подстрокой в нормализованном названии строки.
    """
    # нормализованная фраза из правила
    name_norm = (rule.get("name_contains_norm") or "").strip()
    if not name_norm:
        # обратная совместимость: старые правила могли не иметь name_contains_norm
        raw = (rule.get("name_contains") or "").strip()
        if not raw:
            return True  # нет условия по имени → не фильтруем
        name_norm = normalize_name_for_match(raw)
        if not name_norm:
            # после нормализации ничего не осталось — условие по имени фактически пустое
            return True

    # нормализованное название строки
    line_raw_name = getattr(line, "prekes_pavadinimas", "") or ""
    line_name_norm = normalize_name_for_match(line_raw_name)
    if not line_name_norm:
        # строка вообще без осмысленного названия → условие по имени не выполняется
        return False

    return name_norm in line_name_norm


def _rule_matches(
    rule: Rule,
    line,
    buyer_id: str,
    buyer_vat_code: str,
    seller_id: str,
    seller_vat_code: str,
) -> bool:
    """
    Проверяем, подходит ли правило к конкретной строке.
    """
    if not rule.get("enabled", True):
        return False

    apply_to_all = bool(rule.get("apply_to_all"))

    # 1) фильтры по контрагентам (если apply_to_all = False)
    if not apply_to_all:
        # ВАЖНО: коды на стороне правила уже нормализованы (upper) при сохранении,
        # здесь мы нормализуем коды документа тем же способом.
        r_buyer_id = _norm_code(rule.get("buyer_id"))
        r_buyer_vat = _norm_code(rule.get("buyer_vat_code"))
        r_seller_id = _norm_code(rule.get("seller_id"))
        r_seller_vat = _norm_code(rule.get("seller_vat_code"))

        if r_buyer_id and r_buyer_id != buyer_id:
            return False
        if r_buyer_vat and r_buyer_vat != buyer_vat_code:
            return False
        if r_seller_id and r_seller_id != seller_id:
            return False
        if r_seller_vat and r_seller_vat != seller_vat_code:
            return False

    # 2) фильтр по названию (pavadinimas)
    if not apply_to_all:
        if not _match_name_condition(rule, line):
            return False

    # 3) условие по VAT
    rule_vat = rule.get("vat_percent")
    if not _vat_matches(rule_vat, getattr(line, "vat_percent", None)):
        return False

    # все условия ок
    return True


def apply_lineitem_rules_for_detaliai(db_doc, user) -> int:
    """
    Применяет lineitem_rules пользователя к КАЖДОЙ строке detaliai:

      - работает ТОЛЬКО если db_doc.scan_type == "detaliai"
      - на одну строку применяется ОДНО, самое «специфичное» правило:
          * больше совпавших условий → выше приоритет
          * при равенстве совпадений → меньше id
          * apply_to_all = true → низший приоритет, используется
            только если нет ни одного совпавшего правила с apply_to_all = false
      - меняет:
          line.prekes_kodas        ← rule.result_kodas
          line.preke_paslauga      ← mapped(result_tipas)  (1/2/3/4)
          line.prekes_pavadinimas  ← rule.result_pavadinimas (если непустой)
          line.prekes_barkodas     ← rule.result_barkodas, если он непустой,
                                     иначе очищается (становится пустой строкой)
    """
    if (getattr(db_doc, "scan_type", "") or "").strip().lower() != "detaliai":
        logger.info(
            "Skip lineitem_rules: scan_type != detaliai (%s)", db_doc.scan_type
        )
        return 0

    raw_rules = getattr(user, "lineitem_rules", None)
    rules = _to_rules(raw_rules)
    if not rules:
        logger.info("No lineitem_rules for user id=%s", getattr(user, "id", None))
        return 0

    # сортируем по id, чтобы tie-breaker по id можно было делать просто
    def _rule_key(r: Rule):
        rid = r.get("id")
        try:
            return int(rid)
        except Exception:
            return 10**9

    rules = sorted(rules, key=_rule_key)

    # контрагенты документа нормализованы так же, как и в нормализаторе правил
    buyer_id = _norm_code(getattr(db_doc, "buyer_id", ""))
    buyer_vat_code = _norm_code(getattr(db_doc, "buyer_vat_code", ""))
    seller_id = _norm_code(getattr(db_doc, "seller_id", ""))
    seller_vat_code = _norm_code(getattr(db_doc, "seller_vat_code", ""))

    changed_lines = 0

    for line in db_doc.line_items.all():  # type: ignore[attr-defined]
        best_rule: Optional[Rule] = None
        best_score = -1
        best_id = 10**9
        best_apply_to_all = True

        # 1) ищем лучшее правило для этой строки
        for rule in rules:
            if not _rule_matches(rule, line, buyer_id, buyer_vat_code, seller_id, seller_vat_code):
                continue

            apply_to_all = bool(rule.get("apply_to_all"))
            score = _rule_specificity(rule)
            rid = _rule_id_int(rule)

            if best_rule is None:
                best_rule = rule
                best_score = score
                best_id = rid
                best_apply_to_all = apply_to_all
                continue

            # Правила с apply_to_all = true самые низкоприоритетные:
            # если уже есть сработавшее правило с apply_to_all = False,
            # то apply_to_all-правила игнорируем.
            if apply_to_all and not best_apply_to_all:
                continue

            # Если текущее правило НЕ apply_to_all, а лучшее сейчас apply_to_all —
            # сразу выбираем это правило, даже если score меньше/равен.
            if not apply_to_all and best_apply_to_all:
                best_rule = rule
                best_score = score
                best_id = rid
                best_apply_to_all = apply_to_all
                continue

            # Оба правила одного типа (оба apply_to_all или оба нет) —
            # сравниваем по количеству совпадений, затем по id.
            if score > best_score:
                best_rule = rule
                best_score = score
                best_id = rid
                best_apply_to_all = apply_to_all
            elif score == best_score and rid < best_id:
                best_rule = rule
                best_score = score
                best_id = rid
                best_apply_to_all = apply_to_all

        if best_rule is None:
            logger.debug("No rule matched for line id=%s", getattr(line, "id", None))
            continue

        # 2) применяем выбранное правило
        result_kodas = _norm_str(best_rule.get("result_kodas"))
        result_tipas = _normalize_preke_paslauga(
            best_rule.get("result_tipas"),
            best_rule.get("result_kodas_kaip"),
        )
        result_pavadinimas = _norm_str(best_rule.get("result_pavadinimas"))

        # result_barkodas:
        # - если непустой → записываем
        # - если пустой / None → очищаем prekes_barkodas
        raw_barkodas = best_rule.get("result_barkodas", None)
        if raw_barkodas is None:
            new_barkodas = ""
        else:
            new_barkodas = _norm_str(raw_barkodas)

        update_fields: List[str] = []

        if result_kodas and getattr(line, "prekes_kodas", "") != result_kodas:
            line.prekes_kodas = result_kodas
            update_fields.append("prekes_kodas")

        if result_tipas is not None and getattr(line, "preke_paslauga", None) != result_tipas:
            line.preke_paslauga = result_tipas
            update_fields.append("preke_paslauga")

        if result_pavadinimas:
            if getattr(line, "prekes_pavadinimas", "") != result_pavadinimas:
                line.prekes_pavadinimas = result_pavadinimas
                update_fields.append("prekes_pavadinimas")

        # barkodas: всегда приводим к new_barkodas (в т.ч. чистим)
        if hasattr(line, "prekes_barkodas"):
            if (line.prekes_barkodas or "") != new_barkodas:
                line.prekes_barkodas = new_barkodas
                update_fields.append("prekes_barkodas")

        if update_fields:
            line.save(update_fields=update_fields)
            changed_lines += 1

    logger.info(
        "Lineitem rules applied to %d line(s) for document id=%s",
        changed_lines,
        getattr(db_doc, "id", None),
    )
    return changed_lines