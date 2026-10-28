"""
DU admin pagalbinės funkcijos:
  archive_upload - kiekvieno vartotojo įkelto failo kopija (perėjimas, Excel, ligos S15, S47) - parserių tobulinimui;
  log_error      - DU API klaidos (4xx su tekstu ir 500 su traceback) - kur vartotojai „užstringa“;
  purge          - senų įrašų valymas (BDAR: failuose asmens kodai).
Jokia klaida čia nestabdo vartotojo veiksmo.
"""
import gzip
import hashlib
import json
import logging
import re
import traceback
from datetime import timedelta

from django.core.files.base import ContentFile
from django.utils import timezone

logger = logging.getLogger("docscanner_app")


# ============================================================
# Įkeltų failų archyvas
# ============================================================

def _detect(content, file_name):
    """Forma ir trumpa informacija; neatpažintiems - kas tai per failas (Sodros ataskaitos pavadinimas ir pan.)."""
    try:
        from .migration import ffparse
        p = ffparse.parse(content, file_name)
        if p is not None:
            meta = {"rows": len(p.rows), "year": p.year, "month": p.month}
            if p.period and p.period[0]:
                meta["period"] = [str(p.period[0]), str(p.period[1])]
            return p.form, meta
    except Exception:
        pass
    text = content[:4000].decode("utf-8", "ignore")
    m = re.search(r'<Ataskaita[^>]*pavadinimas="([^"]+)"', text)
    if m:
        return f"Sodra:{m.group(1)}"[:60], {}
    m = re.search(r'PageDefName="([^"]+)"', text)
    if m:
        return f"FFDATA:{m.group(1)}"[:60], {}
    if content[:2] == b"PK":
        return "XLSX/ZIP", {}
    return "", {}


def _real_user(user):
    return getattr(user, "impersonator", None) or user


def archive_upload(company, user, source, file_name, content, *, form="", ok=True, error="", meta=None):
    """source: migration | excel | sick_import | s47 | other. Tas pats failas (sha1) - tik skaitiklis padidinamas."""
    try:
        from docscanner_app.models import PayrollUploadArchive
        if isinstance(content, str):
            content = content.encode("utf-8")
        sha = hashlib.sha1(content).hexdigest()
        now = timezone.now()
        detected, info = _detect(content, file_name) if source in ("migration", "other") or not form else ("", {})
        form = form or detected
        meta = {**info, **(meta or {})}
        obj = PayrollUploadArchive.objects.filter(company=company, sha1=sha, source=source).first()
        if obj:
            obj.times += 1
            obj.last_uploaded_at = now
            obj.parsed, obj.error = ok, (error or "")[:4000]
            obj.meta = {**(obj.meta or {}), **meta}
            obj.save(update_fields=["times", "last_uploaded_at", "parsed", "error", "meta"])
            return obj
        u = _real_user(user)
        obj = PayrollUploadArchive(
            company=company, user=u if getattr(u, "pk", None) else None, source=source,
            file_name=(file_name or "")[:255], form=(form or "")[:60], sha1=sha, size=len(content),
            parsed=ok, error=(error or "")[:4000], meta=meta, last_uploaded_at=now)
        obj.file.save(f"{sha}.gz", ContentFile(gzip.compress(content)), save=False)
        obj.save()
        return obj
    except Exception:
        logger.exception("archive_upload: nepavyko išsaugoti %s", file_name)
        return None


def archive_content(obj):
    """Archyvuoto failo turinys (bytes)."""
    with obj.file.open("rb") as f:
        return gzip.decompress(f.read())


# ============================================================
# Klaidų žurnalas
# ============================================================

def _payload(request):
    try:
        if request.FILES:
            return {"files": [f"{f.name} ({f.size} B)" for f in request.FILES.values()],
                    **{k: str(v)[:300] for k, v in request.POST.items()}}
        data = request.data
        raw = json.dumps(data, default=str, ensure_ascii=False)
        return json.loads(raw[:6000]) if len(raw) <= 6000 else {"_truncated": raw[:6000]}
    except Exception:
        return None


def log_error(request, exc):
    try:
        from rest_framework.exceptions import (APIException, AuthenticationFailed, MethodNotAllowed,
                                               NotAuthenticated, NotFound, Throttled)
        from docscanner_app.models import PayrollErrorLog
        if isinstance(exc, (NotAuthenticated, AuthenticationFailed, NotFound, MethodNotAllowed, Throttled)):
            return
        if isinstance(exc, APIException):
            status, detail, tb = exc.status_code, exc.detail, ""
        else:
            status, detail, tb = 500, f"{type(exc).__name__}: {exc}", traceback.format_exc()[-10000:]
        message = detail if isinstance(detail, str) else json.dumps(detail, default=str, ensure_ascii=False)
        if "Peržiūros režim" in message:
            return
        user = getattr(request, "_user", None)
        user = user if getattr(user, "pk", None) else None
        impersonator = getattr(user, "impersonator", None)
        PayrollErrorLog.objects.create(
            user=user, impersonator=impersonator,
            company_id=getattr(user, "active_company_profile_id", None) if user else None,
            method=request.method, path=request.get_full_path()[:500], status=status,
            error_type=type(exc).__name__[:100], message=message[:4000], traceback=tb,
            payload=_payload(request) if request.method not in ("GET", "HEAD") else None)
    except Exception:
        logger.exception("log_error: nepavyko įrašyti")


# ============================================================
# Valymas
# ============================================================

def purge(uploads_days=365, errors_days=180):
    from docscanner_app.models import AdminViewAsLog, PayrollErrorLog, PayrollUploadArchive
    now = timezone.now()
    n_files = 0
    for obj in PayrollUploadArchive.objects.filter(last_uploaded_at__lt=now - timedelta(days=uploads_days)):
        obj.file.delete(save=False)
        obj.delete()
        n_files += 1
    n_err, _ = PayrollErrorLog.objects.filter(created_at__lt=now - timedelta(days=errors_days)).delete()
    AdminViewAsLog.objects.filter(created_at__lt=now - timedelta(days=uploads_days)).delete()
    return n_files, n_err
