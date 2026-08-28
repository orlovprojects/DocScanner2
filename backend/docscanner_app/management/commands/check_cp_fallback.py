import csv
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from docscanner_app.models import ScannedDocument
from docscanner_app.validators.company_name_normalizer import (
    normalize_company_name_v2,
    looks_like_person, person_names_match, person_tokens, _person_stem,
    has_lt_legal_form, company_names_match, company_tokens, _company_stem,
    looks_like_lt_code,
)

FIELDS = (
    "id", "user_id", "uploaded_at",
    "seller_name", "seller_id", "seller_vat_code", "seller_id_programoje",
    "buyer_name", "buyer_id", "buyer_vat_code", "buyer_id_programoje",
)


def _s(v):
    return (str(v) if v is not None else "").strip()


def _blocks(name, is_person):
    """Ключи блокировки: первые 3 буквы каждой основы."""
    toks = person_tokens(name) if is_person else company_tokens(name)
    stem = _person_stem if is_person else _company_stem
    return {stem(t)[:3] for t in toks if len(t) > 1}


class Command(BaseCommand):
    help = "Dry-run: сколько контрагентов без įmonės kodas/PVM подтянул бы fallback"

    def add_arguments(self, parser):
        parser.add_argument("--user", type=str, default=None, help="email или id юзера")
        parser.add_argument("--limit", type=int, default=0, help="макс. документов (0 = все)")
        parser.add_argument("--show", type=int, default=40, help="сколько примеров печатать")
        parser.add_argument("--csv", type=str, default=None, help="путь для CSV")

    def handle(self, *args, **o):
        qs = ScannedDocument.objects.all()

        if o["user"]:
            User = get_user_model()
            u = (User.objects.filter(pk=o["user"]).first() if o["user"].isdigit()
                 else User.objects.filter(email=o["user"]).first())
            if not u:
                self.stderr.write("Пользователь не найден")
                return
            qs = qs.filter(user=u)

        qs = qs.order_by("uploaded_at").values(*FIELDS)
        if o["limit"]:
            qs = qs[:o["limit"]]

        # ---- собираем стороны документов по юзерам ----
        by_user = defaultdict(list)
        total_docs = 0
        for d in qs.iterator(chunk_size=2000):
            total_docs += 1
            for side in ("seller", "buyer"):
                name = _s(d[f"{side}_name"])
                if not name:
                    continue
                by_user[d["user_id"]].append({
                    "doc": d["id"], "side": side, "name": name,
                    "id": _s(d[f"{side}_id"]),
                    "vat": _s(d[f"{side}_vat_code"]),
                    "prog": _s(d[f"{side}_id_programoje"]),
                    "norm": normalize_company_name_v2(name),
                    "at": d["uploaded_at"],
                })

        stat = defaultdict(int)
        rows = []

        for uid, entries in by_user.items():
            # индекс источников по блокам
            idx_p, idx_c = defaultdict(list), defaultdict(list)
            norm_idx = defaultdict(list)
            for e in entries:
                if not (e["id"] or e["vat"] or e["prog"]):
                    continue
                norm_idx[e["norm"]].append(e)
                is_p = looks_like_person(e["name"])
                target = idx_p if is_p else idx_c
                for b in _blocks(e["name"], is_p):
                    target[b].append(e)

            # уникальные имена без кода и PVM
            seen = {}
            for e in entries:
                if e["id"] or e["vat"]:
                    continue
                seen.setdefault((e["norm"], e["name"].lower()), e)

            for e in seen.values():
                stat["без_kodas_ir_pvm"] += 1
                name = e["name"]

                # 1) ловится ли текущей точной логикой?
                exact = [s for s in norm_idx.get(e["norm"], [])
                         if s["doc"] != e["doc"] and (s["id"] or s["vat"] or s["prog"])]
                if exact:
                    stat["уже_ловит_точное_совпадение"] += 1
                    continue

                # 2) классификация для fallback
                if looks_like_person(name):
                    kind, matcher, skip_lt = "fizinis", person_names_match, False
                    pool = idx_p
                elif has_lt_legal_form(name):
                    stat["LT_firma_fallback_пропущен"] += 1
                    continue
                else:
                    if len(e["norm"]) < 6:
                        stat["слишком_короткое_имя"] += 1
                        continue
                    kind, matcher, skip_lt = "uzsienio", company_names_match, True
                    pool = idx_c

                cands, ids = [], set()
                for b in _blocks(name, kind == "fizinis"):
                    for s in pool.get(b, []):
                        key = (s["doc"], s["side"])
                        if key not in ids and s["doc"] != e["doc"]:
                            ids.add(key)
                            cands.append(s)
                cands.sort(key=lambda x: x["at"])

                hit_code, hit_prog = None, None
                for s in cands:
                    if s["norm"] == e["norm"] or not matcher(name, s["name"]):
                        if s["norm"] != e["norm"]:
                            continue
                    if (s["id"] or s["vat"]) and not (skip_lt and looks_like_lt_code(s["id"], s["vat"])):
                        hit_code = s
                        break
                    if s["prog"] and hit_prog is None:
                        hit_prog = s

                if hit_code:
                    stat[f"НОВОЕ_{kind}_с_кодом"] += 1
                    rows.append((kind, "kodas+pvm", name, hit_code["name"],
                                 hit_code["id"], hit_code["vat"], hit_code["prog"], e["doc"], hit_code["doc"]))
                elif hit_prog:
                    stat[f"НОВОЕ_{kind}_только_id_programoje"] += 1
                    rows.append((kind, "id_programoje", name, hit_prog["name"],
                                 "", "", hit_prog["prog"], e["doc"], hit_prog["doc"]))
                else:
                    stat[f"{kind}_без_совпадений"] += 1

        # ---- вывод ----
        self.stdout.write(f"\nДокументов просмотрено: {total_docs}\n")
        for k in sorted(stat):
            self.stdout.write(f"  {k:38} {stat[k]}")

        self.stdout.write(f"\nПримеры (первые {o['show']}):\n")
        for r in rows[:o["show"]]:
            kind, what, name, match, rid, vat, prog, d1, d2 = r
            self.stdout.write(
                f"  [{kind}/{what}] '{name}'  ->  '{match}'   "
                f"id={rid or '-'} pvm={vat or '-'} prog={prog or '-'}  (doc {d1} <- {d2})"
            )

        if o["csv"]:
            with open(o["csv"], "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f, delimiter=";")
                w.writerow(["tipas", "kas_pasidubliuotu", "vardas_be_kodo", "rastas_atitikmuo",
                            "id", "pvm", "id_programoje", "doc_id", "source_doc_id"])
                w.writerows(rows)
            self.stdout.write(f"\nCSV: {o['csv']}  (строк: {len(rows)})")