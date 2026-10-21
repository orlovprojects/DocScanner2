"""
Grafiko taisyklių katalogas (šablonai). Frontas rodo korteles, backend'as (sprendiklis) - interpretuoja.
target: {"employees": [], "positions": [], "position_groups": [], "tags": []} - kam taikoma.
"""

# Grupės - dažniausiai naudojamos viršuje
GROUPS = [
    ("load", "Poilsis ir krūvis"),
    ("availability", "Kada darbuotojas gali dirbti"),
    ("coverage", "Pamainos sudėtis"),
    ("pairs", "Kas su kuo dirba"),
    ("fairness", "Teisingumas ir pageidavimai"),
]

# kind: (grupė, pavadinimas, sakinys, parametrai). Sakinys - frontas jį rodo su įrašomais laukais {..}.
# Tvarka grupės viduje - nuo dažniausių.
RULES = {
    # "min_max_staff" - pašalinta: darbuotojų skaičius nustatomas pamainose (reikia / daugiausia pagal savaitės dienas)
    "max_consecutive_nights": ("load", "Naktys iš eilės",
                               "{target} dirba ne daugiau kaip {n} naktis iš eilės, po jų bent {rest} laisvos dienos. "
                               "Naktinės pamainos: {shifts}", ["target", "n", "rest", "shifts"]),
    "max_consecutive_days": ("load", "Darbo dienos iš eilės",
                             "{target} dirba ne daugiau kaip {n} dienas iš eilės", ["target", "n"]),
    "no_day_after_night": ("load", "Po nakties – ne dieninė",
                           "{target} po naktinės pamainos ({shifts}) kitą dieną nedirba dieninės", ["target", "shifts"]),
    "free_weekends": ("load", "Laisvi savaitgaliai",
                      "{target} per mėnesį turi bent {n} laisvus savaitgalius", ["target", "n"]),
    "min_days_off_block": ("load", "Laisvos dienos blokais",
                           "{target} laisvas dienas gauna bent po {n} iš eilės", ["target", "n"]),
    "shifts_per_period": ("load", "Pamainų skaičius per savaitę ar mėnesį",
                          "{target} per {per} dirba nuo {min} iki {max} pamainų", ["target", "per", "min", "max"]),
    "only_shifts": ("availability", "Tik tam tikros pamainos",
                    "{target} dirba tik {shifts} pamainas", ["target", "shifts"]),
    "never_shifts": ("availability", "Niekada tam tikros pamainos",
                     "{target} nedirba {shifts} pamainų", ["target", "shifts"]),
    "not_on_weekdays": ("availability", "Nedirba tam tikromis dienomis",
                        "{target} nedirba šiomis dienomis: {weekdays}", ["target", "weekdays"]),
    "only_on_weekdays": ("availability", "Dirba tik tam tikromis dienomis",
                         "{target} dirba tik šiomis dienomis: {weekdays}", ["target", "weekdays"]),
    "fixed_shift": ("availability", "Visada ta pati pamaina",
                    "{target} visada dirba {shifts} pamainą šiomis dienomis: {weekdays}", ["target", "shifts", "weekdays"]),
    "cycle": ("availability", "Darbo ciklas",
              "{target} dirba ciklu: {work} d. dirba, {rest} d. ilsisi, pradedant {date_from}. Pamainos: {shifts}",
              ["target", "work", "rest", "date_from", "shifts"]),
    "unavailable": ("availability", "Nedirba laikotarpiu",
                    "{target} nedirba nuo {date_from} iki {date_to}", ["target", "date_from", "date_to"]),
    "at_least_of": ("coverage", "Bent N iš grupės pamainoje",
                    "Pamainoje {shifts} visada dirba bent {n} iš: {target}. Dienos: {weekdays}",
                    ["target", "shifts", "weekdays", "n"]),
    "at_most_of": ("coverage", "Ne daugiau kaip N iš grupės",
                   "Pamainoje {shifts} dirba ne daugiau kaip {n} iš: {target}. Dienos: {weekdays}",
                   ["target", "shifts", "weekdays", "n"]),
    "not_all_of": ("coverage", "Ne visi iš grupės vienu metu",
                   "{target} nedirba visi kartu pamainoje {shifts}", ["target", "shifts"]),
    "only_with_one_of": ("pairs", "Tik kartu su kuo nors iš grupės",
                         "{target} dirba tik kai pamainoje yra bent vienas iš: {target2}", ["target", "target2"]),
    "never_together": ("pairs", "Niekada kartu",
                       "{target} niekada nedirba kartu su {target2}", ["target", "target2"]),
    "always_together": ("pairs", "Visada kartu",
                        "{target} visada dirba kartu su {target2}", ["target", "target2"]),
    "no_two_of": ("pairs", "Jokie du iš grupės kartu",
                  "Jokie du iš {target} nedirba vienoje pamainoje", ["target"]),
    "balance_shifts": ("fairness", "Tolygiai paskirstyti pamainas",
                       "Tolygiai paskirstyti {shifts} pamainas, savaitgalius ir šventes tarp: {target}", ["target", "shifts"]),
    "prefer_shifts": ("fairness", "Pirmenybė pamainoms",
                      "{target} pirmiausia skiriamos {shifts} pamainos", ["target", "shifts"]),
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
