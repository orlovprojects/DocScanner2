"""
Grafiko taisyklių katalogas (šablonai). Frontas rodo korteles, backend'as (sprendiklis) - interpretuoja.
target: {"employees": [], "positions": [], "position_groups": [], "tags": []} - kam taikoma.
"""

GROUPS = [
    ("coverage", "Pamainos sudėtis"),
    ("pairs", "Kas su kuo"),
    ("availability", "Kada darbuotojas gali dirbti"),
    ("load", "Krūvis ir poilsis"),
    ("fairness", "Teisingumas ir pageidavimai"),
]

# kind: (grupė, pavadinimas, šablonas, parametrai)
RULES = {
    "min_max_staff": ("coverage", "Darbuotojų skaičius pamainoje",
                      "Pamainoje {shifts} dirba nuo {min} iki {max} darbuotojų", ["shifts", "weekdays", "min", "max"]),
    "at_least_of": ("coverage", "Bent N iš grupės",
                    "Pamainoje {shifts} visada dirba bent {n} iš: {target}", ["target", "shifts", "weekdays", "n"]),
    "at_most_of": ("coverage", "Ne daugiau kaip N iš grupės",
                   "Pamainoje {shifts} ne daugiau kaip {n} iš: {target}", ["target", "shifts", "weekdays", "n"]),
    "not_all_of": ("coverage", "Ne visi iš grupės vienu metu",
                   "{target} nedirba visi vienoje pamainoje", ["target", "shifts"]),
    "never_together": ("pairs", "Niekada kartu",
                       "{target} niekada nedirba kartu su {target2}", ["target", "target2"]),
    "always_together": ("pairs", "Visada kartu",
                        "{target} visada dirba kartu su {target2}", ["target", "target2"]),
    "only_with_one_of": ("pairs", "Tik kai yra kas nors iš grupės",
                         "{target} dirba tik kai pamainoje yra bent vienas iš: {target2}", ["target", "target2"]),
    "no_two_of": ("pairs", "Jokie du iš grupės kartu",
                  "Jokie du iš {target} nedirba vienoje pamainoje", ["target"]),
    "only_shifts": ("availability", "Tik tam tikros pamainos",
                    "{target} dirba tik {shifts} pamainas", ["target", "shifts"]),
    "never_shifts": ("availability", "Niekada tam tikros pamainos",
                     "{target} nedirba {shifts} pamainų", ["target", "shifts"]),
    "not_on_weekdays": ("availability", "Nedirba tam tikromis savaitės dienomis",
                        "{target} nedirba: {weekdays}", ["target", "weekdays"]),
    "only_on_weekdays": ("availability", "Dirba tik tam tikromis savaitės dienomis",
                         "{target} dirba tik: {weekdays}", ["target", "weekdays"]),
    "unavailable": ("availability", "Nedirba laikotarpiu",
                    "{target} nedirba nuo {date_from} iki {date_to}", ["target", "date_from", "date_to"]),
    "cycle": ("availability", "Dirba pagal ciklą",
              "{target} dirba ciklu {work}/{rest} nuo {date_from}", ["target", "work", "rest", "date_from", "shifts"]),
    "fixed_shift": ("availability", "Visada tam tikra pamaina",
                    "{target} visada dirba {shifts}: {weekdays}", ["target", "shifts", "weekdays"]),
    "max_consecutive_days": ("load", "Darbo dienų iš eilės",
                             "{target} ne daugiau kaip {n} darbo dienų iš eilės", ["target", "n"]),
    "max_consecutive_nights": ("load", "Naktų iš eilės",
                               "{target} ne daugiau kaip {n} naktų iš eilės, po jų bent {rest} laisvos dienos",
                               ["target", "n", "rest", "shifts"]),
    "no_day_after_night": ("load", "Po nakties - ne dieninė",
                           "{target}: po naktinės pamainos nestatyti dieninės", ["target", "shifts"]),
    "shifts_per_period": ("load", "Pamainų / valandų per savaitę ar mėnesį",
                          "{target}: per {per} nuo {min} iki {max} pamainų", ["target", "per", "min", "max"]),
    "free_weekends": ("load", "Laisvi savaitgaliai",
                      "{target}: per mėnesį bent {n} laisvi savaitgaliai", ["target", "n"]),
    "min_days_off_block": ("load", "Laisvos dienos blokais",
                           "{target}: laisvos dienos bent po {n} iš eilės", ["target", "n"]),
    "balance_shifts": ("fairness", "Tolygiai paskirstyti",
                       "Tolygiai paskirstyti {shifts} / savaitgalius / šventes tarp: {target}", ["target", "shifts"]),
    "prefer_shifts": ("fairness", "Pirmenybė pamainoms",
                      "{target} pirmenybė {shifts} pamainoms", ["target", "shifts"]),
}

# Visada taikoma, neišjungiama
LAW = [
    "Ne daugiau kaip 52 val. per bet kurias 7 dienas",
    "Tarp pamainų bent 11 val. poilsio",
    "Pamaina ne ilgesnė nei 12 val., dvi pamainos iš eilės draudžiamos",
    "Per 7 dienas bent 35 val. nepertraukiamo poilsio",
    "Atostogos, liga, mamadieniai / tėvadieniai - pamainų nestatoma",
    "Laikotarpio norma pagal etatą, valandos paskirstomos kuo tolygiau",
]
