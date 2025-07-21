DETECTED_PHRASES = [
    "debetinė sąskaita faktūra",
    "debetinė sąskaita",
    "debetinė faktūra",
    "išankstinė sąskaita faktūra",
    "išankstinė sąskaita",
    "išankstinė faktūra",
    "kreditinė sąskaita faktūra",
    "kreditinė sąskaita",
    "kreditinė faktūra",
]

def detect_doc_type(raw_text):
    raw_text_lower = (raw_text or "").lower()
    for phrase in DETECTED_PHRASES:
        if phrase in raw_text_lower:
            return phrase
    return None