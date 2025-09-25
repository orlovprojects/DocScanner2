from difflib import SequenceMatcher
from ..models import ScannedDocument

def calculate_max_similarity_percent(raw_text, user, exclude_doc_id=None):
    qs = ScannedDocument.objects.filter(user=user)
    if exclude_doc_id:
        qs = qs.exclude(pk=exclude_doc_id)
    recent_texts = qs.order_by('-uploaded_at')[:100].values_list('raw_text', flat=True)
    def similarity(a, b):
        return round(SequenceMatcher(None, a or '', b or '').ratio() * 100, 2)
    similarities = [similarity(raw_text, t) for t in recent_texts if t]
    return max(similarities) if similarities else 0