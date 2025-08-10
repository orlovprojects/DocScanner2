import random
import string
from docscanner_app.models import LineItem

def random_10_alphanum():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))

def assign_random_prekes_kodai(documents):
    for doc in documents:
        # Если нет line_items
        if not (getattr(doc, "line_items", None) and doc.line_items.exists()):
            if not doc.prekes_kodas and not doc.prekes_barkodas:
                doc.prekes_kodas = random_10_alphanum()
                doc.save(update_fields=["prekes_kodas"])
        else:
            for item in doc.line_items.all():
                if not item.prekes_kodas and not item.prekes_barkodas:
                    item.prekes_kodas = random_10_alphanum()
                    item.save(update_fields=["prekes_kodas"])