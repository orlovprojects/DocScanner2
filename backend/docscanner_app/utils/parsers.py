import re
from datetime import datetime
from decimal import Decimal
import logging
logger = logging.getLogger("celery")

def parse_date_lit(s: str):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except (ValueError, TypeError):
            continue
    return None

def parse_decimal_lit(s: str):
    if s is None:
        return None
    if not isinstance(s, str):
        s = str(s)
    cleaned = re.sub(r"[^\d,\.\-]", "", s)
    normalized = cleaned.replace(",", ".")
    try:
        return Decimal(normalized)
    except Exception:
        return None

def parse_percent_int(s):
    if s is None or s == "" or str(s).lower() == "null":
        return None
    cleaned = re.sub(r"[^\d,\.\-]", "", str(s))
    normalized = cleaned.replace(",", ".")
    try:
        pct = Decimal(normalized)
        return int(pct.to_integral_value())
    except Exception:
        return None