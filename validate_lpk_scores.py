"""Build and validate group-level LPK job evaluations; never modify the input."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INPUT = Path('C:/Users/dorlo/Downloads/lpk_2023.json')
OUTPUT = ROOT / 'lpk_scores.json'
FIELDS = ('skills', 'qualification', 'effort', 'responsibility', 'conditions')
CALIBRATION = {
    '1120': [5, 4, 4, 5, 2],
    '1211': [5, 5, 3, 5, 1],
    '2211': [5, 5, 4, 5, 2],
    '2411': [4, 4, 3, 4, 1],
    '2512': [4, 4, 3, 3, 1],
    '3313': [3, 3, 2, 3, 1],
    '4110': [2, 2, 2, 2, 1],
    '5223': [2, 2, 3, 2, 2],
    '5411': [3, 3, 5, 5, 5],
    '7115': [3, 3, 4, 2, 4],
    '8322': [2, 2, 3, 3, 3],
    '9112': [1, 1, 4, 1, 3],
}
EXPECTED_INPUT_HASH = '186fad71424b87e64af4c723e5ebcdc232c58065dd6ff4906903e72964d65876'


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f'Duplicate JSON key: {key}'
        result[key] = value
    return result


input_bytes = INPUT.read_bytes()
input_hash = hashlib.sha256(input_bytes).hexdigest()
assert input_hash == EXPECTED_INPUT_HASH, 'Input changed since evaluation'
rows = json.loads(input_bytes.decode('utf-8-sig'))
assert isinstance(rows, list)
expected_codes = {row['group_code'] for row in rows}
assert len(expected_codes) == 436
assert all(isinstance(c, str) and re.fullmatch(r'\d{4}', c) for c in expected_codes)

scores = {}
for line in (ROOT / 'lpk_scores_source.txt').read_text(encoding='utf-8').splitlines():
    code, digits, note = line.split('|', 2)
    assert code not in scores, f'Duplicate source code: {code}'
    assert re.fullmatch(r'[1-5]{5}', digits), (code, digits)
    scores[code] = dict(zip(FIELDS, map(int, digits)))
    scores[code]['note'] = note


def validate(data):
    assert type(data) is dict
    assert len(data) == 436, len(data)
    assert set(data) == expected_codes, {
        'missing': sorted(expected_codes - set(data)),
        'extra': sorted(set(data) - expected_codes),
    }
    for code, record in data.items():
        assert type(record) is dict, code
        assert len(record) == 6 and set(record) == set(FIELDS) | {'note'}, code
        values = [record[field] for field in FIELDS]
        assert all(type(v) is int and 1 <= v <= 5 for v in values), (code, values)
        assert values != [3] * 5, code
        note = record['note']
        assert isinstance(note, str) and note.strip() and len(note) <= 120, (code, len(note))
        assert not re.search(r'[\u0400-\u04ff\ufffd]', note), (code, 'Unexpected characters')
    for code, values in CALIBRATION.items():
        assert [data[code][field] for field in FIELDS] == values, code
    for field in FIELDS:
        assert {record[field] for record in data.values()} == {1, 2, 3, 4, 5}, field


validate(scores)
OUTPUT.write_text(json.dumps(dict(sorted(scores.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
saved_bytes = OUTPUT.read_bytes()
assert not saved_bytes.startswith(b'\xef\xbb\xbf')
assert b'\\u' not in saved_bytes, 'Unexpected Unicode escaping'
saved = json.loads(saved_bytes.decode('utf-8'), object_pairs_hook=unique_object)
validate(saved)
assert hashlib.sha256(INPUT.read_bytes()).hexdigest() == input_hash, 'Input was modified'

distribution = {
    field: {str(value): sum(record[field] == value for record in saved.values()) for value in range(1, 6)}
    for field in FIELDS
}
report = {
    'status': 'PASS',
    'input_rows': len(rows),
    'input_group_marker_rows': sum(row.get('is_group') is True for row in rows),
    'input_unique_group_codes': len(expected_codes),
    'output_keys': len(saved),
    'exact_group_code_match': True,
    'exact_six_fields_per_record': True,
    'all_scores_integer_1_to_5': True,
    'all_notes_nonempty_max_120_characters': True,
    'maximum_note_length': max(len(record['note']) for record in saved.values()),
    'all_five_threes_count': 0,
    'calibration_examples_matched': len(CALIBRATION),
    'calibration_examples_total': len(CALIBRATION),
    'full_1_to_5_range_used_in_each_criterion': True,
    'utf8_without_bom_and_ensure_ascii_false': True,
    'input_unchanged': True,
    'input_sha256': input_hash,
    'output_sha256': hashlib.sha256(saved_bytes).hexdigest(),
    'main_group_counts': dict(sorted(Counter(c[0] for c in saved).items())),
    'score_distributions': distribution,
    'methodology': [
        'Оцениваются типичные требования работы, а не опыт, стаж или результаты конкретного человека.',
        'Прочитаны названия всех профессий в каждой группе; строки is_group включены на общих основаниях.',
        'У неоднородных групп выбран типичный профиль, без максимизации по наиболее сложной профессии.',
        'Использованы заданная шкала и все 12 калибровочных примеров без изменений.',
        'Физические, умственные и эмоциональные усилия оценены совместно, независимо от пола работников.',
        'Формальное образование и лицензирование оценены как типичные требования; это не реестр правовых требований.',
        'Условия отражают типичную профессиональную среду; военные роли включают оперативную и боевую готовность.',
        'Литовский язык и содержательная согласованность пояснений проверены вручную; скрипт проверяет формат и длину.',
        'Групповые оценки требуют уточнения по фактическим обязанностям и условиям конкретной должности.',
        'Директива ЕС 2023/970, статья 4, определяет критерии, но не устанавливает численные оценки LPK.',
    ],
    'reference': 'https://eur-lex.europa.eu/eli/dir/2023/970/oj',
}
(ROOT / 'lpk_scores_validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
