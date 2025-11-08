from difflib import SequenceMatcher
from ..models import ScannedDocument

def calculate_max_similarity_percent(glued_text, user, exclude_doc_id=None):
    qs = ScannedDocument.objects.filter(user=user)
    if exclude_doc_id:
        qs = qs.exclude(pk=exclude_doc_id)

    # берём id и склейку
    recent = qs.order_by('-uploaded_at')[:100].values('id', 'glued_raw_text')

    def similarity(a, b):
        return round(SequenceMatcher(None, a or '', b or '').ratio() * 100, 2)

    max_sim = 0.0
    best_id = None
    for row in recent:
        t = row['glued_raw_text']
        if not t:
            continue
        s = similarity(glued_text, t)
        if s > max_sim:
            max_sim = s
            best_id = row['id']

    return max_sim, best_id

