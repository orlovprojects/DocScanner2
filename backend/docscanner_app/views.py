# --- Standard library ---
import hashlib
import io
import logging
import logging.config
import os
import uuid
import tempfile
import zipfile, tarfile
import json
from datetime import date, timedelta, time, datetime
from decimal import Decimal
import unicodedata
from django.http import HttpRequest
from django.contrib.auth import get_user_model

from django.core.files.base import ContentFile
from .tasks import process_uploaded_file_task 

from .tasks import start_session_processing


from rest_framework.parsers import MultiPartParser, FormParser
from django.utils.dateparse import parse_date
from .serializers import ScannedDocumentListSerializer
from .pagination import DocumentsCursorPagination, UsersCursorPagination, MobileInboxCursorPagination, LineItemPagination




# --- Django ---
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.core.files.base import File



# --- Django REST Framework ---
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.views.decorators.csrf import csrf_exempt

# --- DRF SimpleJWT ---
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import AccessToken

# --- Local (project) imports ---
from .data_import.data_import_from_buh import import_products_from_xlsx, import_clients_from_xlsx
from .exports.apskaita5 import export_documents_group_to_apskaita5_files
from .exports.centas import export_documents_group_to_centras_xml
from .exports.finvalda import (
    export_pirkimai_group_to_finvalda,
    export_pardavimai_group_to_finvalda,
)
from .exports.agnum import (
    export_pirkimai_group_to_agnum,
    export_pardavimai_group_to_agnum,
)
from .exports.rivile import (
    export_clients_group_to_rivile,
    export_pirkimai_group_to_rivile,
    export_pardavimai_group_to_rivile,
    export_prekes_paslaugos_kodai_group_to_rivile,
)
from .exports.rivile_erp import (
    export_clients_to_rivile_erp_xlsx,
    export_prekes_and_paslaugos_to_rivile_erp_xlsx,
    export_documents_to_rivile_erp_xlsx,
)
from .exports.dineta import send_dineta_bundle, DinetaError
# from .exports.optimum import optimum_hello, OptimumError
from .exports.pragma4 import export_to_pragma40_xml
from .exports.pragma3 import export_to_pragma_full, save_pragma_export_to_files
from .exports.butent import export_to_butent
from .exports.site_pro import export_to_site_pro
from .exports.debetas import export_to_debetas
from .validators.required_fields_checker import check_required_fields_for_export
from .validators.math_validator_for_export import validate_document_math_for_export

from .models import (
    CustomUser,
    ScannedDocument,
    ProductAutocomplete,
    ClientAutocomplete,
    LineItem,
    AdClick,
    MobileAccessKey,
    MobileInboxDocument,
    Payments,
    UploadSession,
    ChunkedUpload,
)

from .serializers import (
    CustomUserSerializer,
    ViewModeSerializer,
    ScannedDocumentSerializer,
    ScannedDocumentListSerializer,
    ScannedDocumentDetailSerializer,
    ScannedDocumentAdminDetailSerializer,
    AdClickSerializer,
    LineItemSerializer,
    CustomUserAdminListSerializer,
    DinetaSettingsSerializer,
    OptimumSettingsSerializer,
    MobileAccessKeySerializer,
    MobileInboxDocumentSerializer,
    PaymentSerializer,
    CounterpartySerializer,
)
from django.db.models import Prefetch
from django.db.models import Count

from typing import Any, Optional

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

# <-- поправь пути импорта под свой проект
from .models import ScannedDocument
from .serializers import LineItemSerializer
from .pagination import LineItemPagination

from .utils.data_resolver import (
    ResolveContext,
    resolve_direction,
    auto_select_pvm_code,
    _pvm_label,
    _nz,
    _normalize_vat_percent,
    _normalize_ps,
    _ps_to_bin,
    _need_geo,
)

from .tasks import process_uploaded_file_task
from .utils.data_resolver import build_preview
from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from .utils.prekes_kodas import assign_random_prekes_kodai
from .utils.save_document import _apply_sumiskai_defaults_from_user
from .utils.update_currency_rates import update_currency_rates
from .validators.vat_klas import auto_select_pvm_code

#dlia superuser dashboard
from django.db.models import Count
from .permissions import IsSuperUser, IsOwner

#wagtail imports
from rest_framework import viewsets, mixins
from .models import GuidePage, GuideCategoryPage
from rest_framework.decorators import action
from .serializers import (
    GuideCategoryListSerializer,
    GuideCategoryDetailSerializer,
    GuideArticleListSerializer,
    GuideArticleDetailSerializer,
)


#emails
from .emails import siusti_sveikinimo_laiska, siusti_kontakto_laiska
from .emails import siusti_masini_laiska_visiems
from .emails import siusti_mobilios_apps_kvietima
from .utils.play_store_link_gen import build_mobile_play_store_link

from time import perf_counter


# --- Logging setup ---
logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')
site_url = settings.SITE_URL_FRONTEND  # берём из settings.py


#admin dashboard
from datetime import datetime, time, timedelta
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
import json

# from .models import ScannedDocument, CustomUser
# from .permissions import IsSuperUser
# from .views import summarize_doc_issues  # если в том же файле — не нужно

def _today_dates():
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)
    return today, yesterday

def _qs_by_date(model, date_field: str, target_date, exclude_archives=True):
    start = timezone.make_aware(datetime.combine(target_date, time.min))
    end = timezone.make_aware(datetime.combine(target_date, time.max))
    qs = model.objects.filter(**{f"{date_field}__range": (start, end)})
    if exclude_archives:
        qs = qs.filter(is_archive_container=False)
    return qs

def _qs_last_n_days(model, date_field: str, days: int, exclude_archives=True):
    since = timezone.now() - timedelta(days=days)
    qs = model.objects.filter(**{f"{date_field}__gte": since})
    if exclude_archives:
        qs = qs.filter(is_archive_container=False)
    return qs

def _qs_all_docs(exclude_archives=True):
    qs = ScannedDocument.objects.all()
    if exclude_archives:
        qs = qs.filter(is_archive_container=False)
    return qs

def _count_errors_in_qs(qs):
    """Ошибка = math_validation_passed=False ИЛИ ready_for_export=False"""
    return qs.filter(
        Q(math_validation_passed=False) | Q(ready_for_export=False)
    ).count()

def _count_rejected_in_qs(qs):
    """Количество rejected документов"""
    return qs.filter(status="rejected").count()

def _pct(part, whole):
    return round((part / whole * 100.0), 2) if whole else 0.0

def _rate(ok_count, total_count):
    """% успешных (без ошибок) от общего количества."""
    return _pct(ok_count, total_count)

def _rejected_stats(rejected, total):
    """Статистика rejected: count, total, percent"""
    return {
        "rejected": rejected,
        "total": total,
        "pct": _pct(rejected, total),
    }

@api_view(["GET"])
@permission_classes([IsSuperUser])
def superuser_dashboard_stats(request):
    doc_date_field = "uploaded_at"
    user_date_field = "date_joined"

    today, yesterday = _today_dates()

    # Все QuerySet'ы исключают is_archive_container=True
    qs_all       = _qs_all_docs()
    qs_today     = _qs_by_date(ScannedDocument, doc_date_field, today)
    qs_yesterday = _qs_by_date(ScannedDocument, doc_date_field, yesterday)
    qs_7d        = _qs_last_n_days(ScannedDocument, doc_date_field, 7)
    qs_30d       = _qs_last_n_days(ScannedDocument, doc_date_field, 30)

    docs_today     = qs_today.count()
    docs_yesterday = qs_yesterday.count()
    docs_7d        = qs_7d.count()
    docs_30d       = qs_30d.count()
    total_docs     = qs_all.count()

    # Ошибки (math_validation_passed=False OR ready_for_export=False)
    err_today     = _count_errors_in_qs(qs_today)
    err_yesterday = _count_errors_in_qs(qs_yesterday)
    err_7d        = _count_errors_in_qs(qs_7d)
    err_30d       = _count_errors_in_qs(qs_30d)
    err_total     = _count_errors_in_qs(qs_all)

    ok_today     = max(docs_today - err_today, 0)
    ok_yesterday = max(docs_yesterday - err_yesterday, 0)
    ok_7d        = max(docs_7d - err_7d, 0)
    ok_30d       = max(docs_30d - err_30d, 0)
    ok_total     = max(total_docs - err_total, 0)

    # Rejected документы (status="rejected")
    rej_today     = _count_rejected_in_qs(qs_today)
    rej_yesterday = _count_rejected_in_qs(qs_yesterday)
    rej_7d        = _count_rejected_in_qs(qs_7d)
    rej_30d       = _count_rejected_in_qs(qs_30d)
    rej_total     = _count_rejected_in_qs(qs_all)

    # уникальные пользователи
    start_today = timezone.make_aware(datetime.combine(today, time.min))
    end_today   = timezone.make_aware(datetime.combine(today, time.max))
    unique_users_excl_1_2_today = (
        ScannedDocument.objects
        .filter(is_archive_container=False)
        .exclude(user_id__in=[1, 2])
        .filter(**{f"{doc_date_field}__range": (start_today, end_today)})
        .values("user_id").distinct().count()
    )

    # пользователи/регистрации
    new_users_today     = CustomUser.objects.filter(**{f"{user_date_field}__date": today}).count()
    new_users_yesterday = CustomUser.objects.filter(**{f"{user_date_field}__date": yesterday}).count()
    new_users_7d        = _qs_last_n_days(CustomUser, user_date_field, 7, exclude_archives=False).count()
    new_users_30d       = _qs_last_n_days(CustomUser, user_date_field, 30, exclude_archives=False).count()
    total_users         = CustomUser.objects.count()

    # разбивка по типам
    st_sumiskai = qs_all.filter(scan_type="sumiskai").count()
    st_detaliai = qs_all.filter(scan_type="detaliai").count()

    data = {
        "documents": {
            "today":       {"count": docs_today,     "errors": err_today},
            "yesterday":   {"count": docs_yesterday, "errors": err_yesterday},
            "last_7_days": {"count": docs_7d,        "errors": err_7d},
            "last_30_days":{"count": docs_30d,       "errors": err_30d},
            "total":       {"count": total_docs,     "errors": err_total},

            "success_rate": {
                "today":       _rate(ok_today,     docs_today),
                "yesterday":   _rate(ok_yesterday, docs_yesterday),
                "last_7_days": _rate(ok_7d,        docs_7d),
                "last_30_days":_rate(ok_30d,       docs_30d),
                "total":       _rate(ok_total,     total_docs),
            },

            # ✅ Новый блок — Rejected статистика
            "rejected": {
                "today":       _rejected_stats(rej_today,     docs_today),
                "yesterday":   _rejected_stats(rej_yesterday, docs_yesterday),
                "last_7_days": _rejected_stats(rej_7d,        docs_7d),
                "last_30_days":_rejected_stats(rej_30d,       docs_30d),
                "total":       _rejected_stats(rej_total,     total_docs),
            },

            "unique_users_excluding_1_2_today": unique_users_excl_1_2_today,
            "scan_types": {
                "sumiskai": {"count": st_sumiskai, "pct": _pct(st_sumiskai, total_docs)},
                "detaliai": {"count": st_detaliai, "pct": _pct(st_detaliai, total_docs)},
            },
        },
        "users": {
            "new_today":        new_users_today,
            "new_yesterday":    new_users_yesterday,
            "new_last_7_days":  new_users_7d,
            "new_last_30_days": new_users_30d,
            "total":            total_users,
        },
        "meta": {
            "timezone": str(timezone.get_current_timezone()),
            "generated_at": timezone.now().isoformat(),
        },
    }
    return Response(data)








def strip_diacritics(text):
    """
    Pakeičia visas lietuviškas ir kitas lotyniškas raides su diakritika
    į paprastas: š->s, ą->a, Ž->Z ir t.t.
    """
    if not isinstance(text, str):
        return text
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_documents(request):
    from datetime import date
    import io
    import zipfile
    import tempfile
    import logging

    logger = logging.getLogger(__name__)
    log_ctx = {"user": getattr(request.user, "id", None)}

    # ---- входные параметры
    ids = request.data.get('ids', [])
    export_type = request.data.get('export_type') or getattr(request.user, 'default_accounting_program', 'centas')
    raw_overrides = request.data.get('overrides', {}) or {}
    mode_raw = (request.data.get('mode') or "").strip().lower()  # <<< NEW

    scope = (request.data.get("scope") or "").strip().lower()
    filters = request.data.get("filters") or {}
    cp_key = (request.data.get("cp_key") or "").strip()

    excluded_ids = request.data.get("excluded_ids") or []
    excluded_ids = [int(x) for x in excluded_ids if str(x).isdigit()]

    logger.info("[EXP] start user=%s export_type_raw=%r ids=%s raw_overrides=%r mode_raw=%r",
                log_ctx["user"], export_type, ids, raw_overrides, mode_raw)
    
    if scope == "filtered":
        # multi требует выбранного контрагента
        if mode_raw == "multi" and not cp_key:
            return Response({"error": "Choose counterparty (cp_key) for multi export"}, status=400)

        q = filters or {}
        status_param = (q.get("status") or "").strip()
        date_from = (q.get("from") or "").strip()
        date_to = (q.get("to") or "").strip()
        search = (q.get("search") or "").strip()

        qs = ScannedDocument.objects.filter(user=request.user)

        # --- те же фильтры, что в get_user_documents ---
        if status_param:
            qs = qs.filter(status=status_param)

        tz = timezone.get_current_timezone()

        if date_from:
            d = parse_date(date_from)
            if d:
                dt_from = timezone.make_aware(datetime.combine(d, time.min), tz)
                qs = qs.filter(uploaded_at__gte=dt_from)

        if date_to:
            d = parse_date(date_to)
            if d:
                dt_to = timezone.make_aware(datetime.combine(d, time.min), tz) + timedelta(days=1)
                qs = qs.filter(uploaded_at__lt=dt_to)

        if search:
            qs = qs.filter(document_number__icontains=search)

        # --- фильтр по контрагенту (как у тебя в /documents/) ---
        if cp_key:
            cp = cp_key.strip().lower()
            if cp.startswith("id:"):
                cp_id = cp.split("id:", 1)[1].strip()
                if cp_id.isdigit():
                    qs = qs.filter(Q(seller_id=int(cp_id)) | Q(buyer_id=int(cp_id)))
            else:
                qs = qs.filter(
                    Q(seller_vat_code__iexact=cp) |
                    Q(buyer_vat_code__iexact=cp) |
                    Q(seller_name__icontains=cp) |
                    Q(buyer_name__icontains=cp)
                )

        # --- ВАЖНО: экспортируем только "не серые" как в таблице ---
        qs = qs.filter(
            status__in=["completed", "exported"],
            ready_for_export=True,
            math_validation_passed=True,
        )

        ids = list(qs.values_list("id", flat=True))

        if excluded_ids:
            ids = [i for i in ids if i not in set(excluded_ids)]


    if not ids:
        logger.warning("[EXP] no ids provided")
        return Response({"error": "No document ids provided"}, status=400)

    user = request.user
    export_type = str(export_type).lower()

    # Rivilė: ar reikia nuimti lietuviškas raides (š->s ir t.t.)
    extra_settings = getattr(user, "extra_settings", {}) or {}
    rivile_strip_lt = bool(extra_settings.get("rivile_strip_lt_letters"))
    logger.info("[EXP] user extra_settings: rivile_strip_lt_letters=%s", rivile_strip_lt)

    # --- нормализация overrides (id -> 'pirkimas'|'pardavimas')
    overrides = {}
    for k, v in raw_overrides.items():
        key = str(k)
        val = str(v).lower()
        if val in ('pirkimas', 'pardavimas'):
            overrides[key] = val
        else:
            logger.warning("[EXP] skip override key=%r val=%r (invalid)", key, v)

    # --- определить mode: берём из клиента, иначе как раньше (по overrides)
    if mode_raw in ("multi", "single"):                       # <<< NEW
        mode = mode_raw
        logger.info("[EXP] view mode taken from request: %s", mode)
    else:
        mode = 'multi' if overrides else 'single'
        logger.info("[EXP] view mode inferred for backward-compat: %s", mode)

    # Доп. диагностика: если пришёл multi, но overrides пустой
    if mode == "multi" and not overrides:
        logger.info("[EXP] mode is 'multi' but overrides are EMPTY (will rely on resolver/doc DB fields)")

    logger.info("[EXP] export_type=%s overrides_norm=%r", export_type, overrides)

    today_str = date.today().strftime('%Y-%m-%d')

    documents = ScannedDocument.objects.filter(pk__in=ids, user=user).prefetch_related('line_items')
    # documents = ScannedDocument.objects.filter(pk__in=ids, user=user)
    if not documents:
        logger.warning("[EXP] no documents found by ids=%s user=%s", ids, log_ctx["user"])
        return Response({"error": "No documents found"}, status=404)

    # === резолвер ===
    from .utils.data_resolver import prepare_export_groups
    logger.info("[EXP] resolver_mode=%s", mode)

    try:
        prepared = prepare_export_groups(
            documents,
            user=user,
            overrides=overrides if mode == "multi" else {},
            view_mode=mode,
            cp_key=cp_key if mode == "multi" else None,   
        )
    except Exception as e:
        logger.exception("[EXP] prepare_export_groups failed: %s", e)
        return Response({"error": "Resolver failed", "detail": str(e)}, status=500)

    # быстрый дамп того, что пришло из резолвера
    def _debug_dump(prepared_obj, where):
        for bucket in ("pirkimai", "pardavimai", "unknown"):
            packs = prepared_obj.get(bucket) or []
            logger.info("[EXPDBG:%s] bucket=%s count=%d", where, bucket, len(packs))
            for p in packs:
                d = p.get("doc")
                dpk = getattr(d, "pk", None)
                li = p.get("line_items") or []
                logger.info(
                    "[EXPDBG:%s] bucket=%s doc=%s dir=%r pack_keys=%s pvm=%r lines=%d",
                    where, bucket, dpk, p.get("direction"), list(p.keys()),
                    p.get("pvm_kodas", None), len(li)
                )
                if li:
                    preview = [(x.get("id"), x.get("pvm_kodas")) for x in li[:3]]
                    logger.info("[EXPDBG:%s] doc=%s sample_line_items=%s", where, dpk, preview)

    _debug_dump(prepared, "after_resolver")

    # применяем «в память» (без сохранения в БД)
    def _apply_resolved(pack_list, tag):
        out_docs = []
        for pack in pack_list:
            d = pack["doc"]
            setattr(d, "pirkimas_pardavimas", pack.get("direction"))
            setattr(d, "pvm_kodas", pack.get("pvm_kodas", None))  # явное перетирание

            line_map = {}
            for li in (pack.get("line_items") or []):
                li_id = li.get("id")
                if li_id is not None:
                    line_map[li_id] = li.get("pvm_kodas")
            setattr(d, "_pvm_line_map", line_map)

            logger.info("[EXPDBG:apply] tag=%s doc=%s dir=%r pvm_kodas=%r line_map_size=%d",
                        tag, getattr(d, "pk", None), getattr(d, "pirkimas_pardavimas", None),
                        getattr(d, "pvm_kodas", None), len(line_map))
            out_docs.append(d)
        return out_docs

    pirkimai_docs   = _apply_resolved(prepared.get("pirkimai", []), "pirkimai")
    pardavimai_docs = _apply_resolved(prepared.get("pardavimai", []), "pardavimai")
    unknown_docs    = _apply_resolved(prepared.get("unknown", []), "unknown")

    logger.info("[EXP] ready_for_export counts: pirkimai=%d pardavimai=%d unknown=%d",
                len(pirkimai_docs), len(pardavimai_docs), len(unknown_docs))

    # --- переменные для универсального финализатора
    response = None
    export_success = False
    exported_ids = [d.pk for d in (pirkimai_docs + pardavimai_docs)]

    # общий контейнер (внутри веток можно переопределять/очищать)
    files_to_export = []

    # ========================= CENTAS =========================
    if export_type == 'centas':
        logger.info("[EXP] CENTAS export started")
        assign_random_prekes_kodai(documents)

        if pirkimai_docs:
            logger.info("[EXP] CENTAS exporting pirkimai: %d docs", len(pirkimai_docs))
            # ИЗМЕНЕНО: добавлен параметр user=request.user
            xml_bytes = export_documents_group_to_centras_xml(
                pirkimai_docs, 
                direction="pirkimas",
                user=request.user  # <-- ДОБАВЬ ЭТО
            )
            files_to_export.append((f"{today_str}_pirkimai.xml", xml_bytes))
            
        if pardavimai_docs:
            logger.info("[EXP] CENTAS exporting pardavimai: %d docs", len(pardavimai_docs))
            # ИЗМЕНЕНО: добавлен параметр user=request.user
            xml_bytes = export_documents_group_to_centras_xml(
                pardavimai_docs, 
                direction="pardavimas",
                user=request.user  # <-- ДОБАВЬ ЭТО
            )
            files_to_export.append((f"{today_str}_pardavimai.xml", xml_bytes))

        logger.info("[EXP] CENTAS files_to_export=%s", [n for n, _ in files_to_export])

        if len(files_to_export) > 1:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zf:
                for filename, xml_content in files_to_export:
                    zf.writestr(filename, xml_content)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename={today_str}_importui.zip'
            export_success = True
        elif len(files_to_export) == 1:
            filename, xml_content = files_to_export[0]
            response = HttpResponse(
                xml_content,
                content_type='application/xml; charset=utf-8'
            )
            response['Content-Disposition'] = f'attachment; filename={filename}'
            export_success = True
        else:
            logger.warning("[EXP] CENTAS nothing to export")
            response = Response({"error": "No documents to export"}, status=400)

    # ========================= RIVILĖ (EIP) =========================

    elif export_type == 'rivile':
        logger.info("[EXP] RIVILE export started")
        assign_random_prekes_kodai(documents)

        files_to_export = []

        # 1) Клиенты (N08+N33): собираем ИЗ ДОКУМЕНТОВ; кэш больше не нужен
        docs_for_clients = (pirkimai_docs or []) + (pardavimai_docs or [])
        if docs_for_clients:
            klientai_xml = export_clients_group_to_rivile(
                clients=None,
                documents=docs_for_clients,
            )
            if klientai_xml and klientai_xml.strip():
                files_to_export.append(('klientai.eip', klientai_xml))
                logger.info("[EXP] RIVILE clients exported")

        # 2) ПИРКИМАИ (I06/I07)
        if pirkimai_docs:
            logger.info("[EXP] RIVILE exporting pirkimai: %d docs", len(pirkimai_docs))
            pirkimai_xml = export_pirkimai_group_to_rivile(pirkimai_docs, request.user)
            files_to_export.append(('pirkimai.eip', pirkimai_xml))

        # 3) ПАРДАВИМАИ (I06/I07)
        if pardavimai_docs:
            logger.info("[EXP] RIVILE exporting pardavimai: %d docs", len(pardavimai_docs))
            pardavimai_xml = export_pardavimai_group_to_rivile(pardavimai_docs, request.user)
            files_to_export.append(('pardavimai.eip', pardavimai_xml))

        # 4) N17/N25 - ИЗМЕНЕНО: передаём request.user
        prekes_xml, paslaugos_xml, kodai_xml = export_prekes_paslaugos_kodai_group_to_rivile(
            documents, 
            request.user  # ← ДОБАВЛЕНО
        )
        if prekes_xml and prekes_xml.strip():
            files_to_export.append(('prekes.eip', prekes_xml))
        if paslaugos_xml and paslaugos_xml.strip():
            files_to_export.append(('paslaugos.eip', paslaugos_xml))
        if kodai_xml and kodai_xml.strip():
            files_to_export.append(('kodai.eip', kodai_xml))

        logger.info("[EXP] RIVILE files_to_export=%s", [n for n, _ in files_to_export])

        # Jei profilyje nustatyta „rivile_strip_lt_letters" – nuimame diakritiką
        # if rivile_strip_lt and files_to_export:
        #     new_files = []
        #     for filename, xml_content in files_to_export:
        #         # гарантируем, что работаем с bytes
        #         if isinstance(xml_content, bytes):
        #             try:
        #                 # декодируем так же, как и писали — windows-1257
        #                 xml_text = xml_content.decode("windows-1257", errors="ignore")
        #             except Exception:
        #                 # крайний случай – хотя сюда вряд ли попадём
        #                 xml_text = xml_content.decode("latin-1", errors="ignore")
        #         else:
        #             xml_text = xml_content

        #         stripped = strip_diacritics(xml_text)

        #         # ВАЖНО: снова кодируем в windows-1257, чтобы файл реально был ANSI
        #         stripped_bytes = stripped.encode("windows-1257", errors="replace")

        #         logger.info(
        #             "[EXP] RIVILE strip_lt applied to %s (len %d -> %d)",
        #             filename, len(xml_text), len(stripped)
        #         )
        #         new_files.append((filename, stripped_bytes))

        #     files_to_export = new_files

        if files_to_export:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zf:
                for filename, xml_content in files_to_export:
                    zf.writestr(filename, xml_content)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename={today_str}_rivile_eip.zip'
            export_success = True
        else:
            logger.warning("[EXP] RIVILE nothing to export")
            response = Response({"error": "No documents to export"}, status=400)


    # ========================= FINVALDA =========================
    elif export_type == 'finvalda':
        logger.info("[EXP] FINVALDA export started")
        assign_random_prekes_kodai(documents)

        files_to_export = []

        if pirkimai_docs:
            logger.info("[EXP] FINVALDA exporting pirkimai: %d docs", len(pirkimai_docs))
            xml_bytes = export_pirkimai_group_to_finvalda(pirkimai_docs)
            files_to_export.append((f"{today_str}_pirkimai_finvalda.xml", xml_bytes))
        if pardavimai_docs:
            logger.info("[EXP] FINVALDA exporting pardavimai: %d docs", len(pardavimai_docs))
            xml_bytes = export_pardavimai_group_to_finvalda(pardavimai_docs)
            files_to_export.append((f"{today_str}_pardavimai_finvalda.xml", xml_bytes))

        logger.info("[EXP] FINVALDA files_to_export=%s", [n for n, _ in files_to_export])

        if len(files_to_export) > 1:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zf:
                for filename, xml_content in files_to_export:
                    zf.writestr(filename, xml_content)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename={today_str}_finvalda.zip'
            export_success = True
        elif len(files_to_export) == 1:
            filename, xml_content = files_to_export[0]
            response = HttpResponse(xml_content, content_type='application/xml')
            response['Content-Disposition'] = f'attachment; filename={filename}'
            export_success = True
        else:
            logger.warning("[EXP] FINVALDA nothing to export")
            response = Response({"error": "No documents to export"}, status=400)



    # ========================= PRAGMA 3.2 =========================
    elif export_type == 'pragma3':
        logger.info("[EXP] PRAGMA32 export started")
        assign_random_prekes_kodai(documents)

        # Используем уже подготовленные документы с атрибутами от _apply_resolved
        # (pirkimas_pardavimas, pvm_kodas, _pvm_line_map)
        # ВАЖНО: добавь .prefetch_related('line_items') в начале функции где documents = ...
        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])

        files_to_export = []

        try:
            # Полный экспорт (4 или 6 файлов)
            export_data = export_to_pragma_full(
                documents=all_docs,
                user=request.user,
                include_reference_data=True
            )
            
            logger.info("[EXP] PRAGMA32 export_data keys: %s", list(export_data.keys()))

            # Pirkimai (если есть)
            if export_data.get('pirkimai'):
                files_to_export.append((
                    f'{today_str}_pirkimai.txt',
                    export_data['pirkimai']
                ))
            
            if export_data.get('pirkimai_det'):
                files_to_export.append((
                    f'{today_str}_pirkimai_det.txt',
                    export_data['pirkimai_det']
                ))

            # Pardavimai (если есть)
            if export_data.get('pardavimai'):
                files_to_export.append((
                    f'{today_str}_pardavimai.txt',
                    export_data['pardavimai']
                ))
            
            if export_data.get('pardavimai_det'):
                files_to_export.append((
                    f'{today_str}_pardavimai_det.txt',
                    export_data['pardavimai_det']
                ))
            
            # Справочники (общие)
            if export_data.get('companies'):
                files_to_export.append((
                    f'{today_str}_Imones.txt',
                    export_data['companies']
                ))
            
            if export_data.get('products'):
                files_to_export.append((
                    f'{today_str}_Prekes.txt',
                    export_data['products']
                ))

            logger.info("[EXP] PRAGMA32 files_to_export=%s", [n for n, _ in files_to_export])

        except Exception as e:
            logger.exception("[EXP] PRAGMA32 export failed: %s", e)
            return Response({"error": "Pragma 3.2 export failed", "detail": str(e)}, status=500)

        # Формирование ответа
        if len(files_to_export) > 1:
            # Несколько файлов -> ZIP
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zf:
                for filename, txt_content in files_to_export:
                    zf.writestr(filename, txt_content)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename={today_str}_pragma32.zip'
            export_success = True
            
        elif len(files_to_export) == 1:
            # Один файл -> прямая отдача
            filename, txt_content = files_to_export[0]
            response = HttpResponse(
                txt_content,
                content_type='text/plain; charset=windows-1257'
            )
            response['Content-Disposition'] = f'attachment; filename={filename}'
            export_success = True
            
        else:
            logger.warning("[EXP] PRAGMA32 nothing to export")
            response = Response({"error": "No documents to export"}, status=400)


    # ========================= PRAGMA 4.0 =========================
    elif export_type == 'pragma4':
        logger.info("[EXP] PRAGMA40 export started")
        assign_random_prekes_kodai(documents)

        # Твой универсальный экспортёр: сам решает, XML или ZIP
        try:
            content = export_to_pragma40_xml(
                pirkimai_documents=pirkimai_docs,
                pardavimai_documents=pardavimai_docs
            )
        except Exception as e:
            logger.exception("[EXP] PRAGMA40 export failed: %s", e)
            return Response({"error": "Pragma 4.0 export failed", "detail": str(e)}, status=500)

        if not content:
            logger.warning("[EXP] PRAGMA40 nothing to export")
            response = Response({"error": "No documents to export"}, status=400)
        else:
            # Определяем, ZIP это или XML по сигнатуре ZIP ("PK")
            if content[:2] == b'PK':
                filename = f"{today_str}_pragma40.zip"
                content_type = "application/zip"
            else:
                # Если экспортировались только покупки/продажи – более говорящие имена
                if pirkimai_docs and not pardavimai_docs:
                    filename = f"{today_str}_pragma40_pirkimai.xml"
                elif pardavimai_docs and not pirkimai_docs:
                    filename = f"{today_str}_pragma40_pardavimai.xml"
                else:
                    filename = f"{today_str}_pragma40.xml"

                content_type = "application/xml; charset=utf-8"

            response = HttpResponse(content, content_type=content_type)
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            export_success = True


    # ========================= DINETA =========================
    elif export_type == 'dineta':
        logger.info("[EXP] DINETA export started")

        # Для Dineta нам логичнее отправлять только уже классифицированные покупки/продажи
        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])

        if not all_docs:
            logger.warning("[EXP] DINETA no documents to export (no pirkimai/pardavimai)")
            return Response({"error": "No documents to send to Dineta"}, status=400)

        try:
            dineta_result = send_dineta_bundle(request.user, all_docs)
        except DinetaError as e:
            logger.exception("[EXP] DINETA export failed (DinetaError): %s", e)
            return Response(
                {
                    "error": "Dineta export failed",
                    "detail": str(e),
                },
                status=502,  # bad gateway / внешняя система
            )
        except Exception as e:
            logger.exception("[EXP] DINETA export failed (unexpected): %s", e)
            return Response(
                {
                    "error": "Dineta export failed (unexpected)",
                    "detail": str(e),
                },
                status=500,
            )

        # Если сюда дошли – считаем экспорт успешным
        export_success = True
        # response — обычный JSON с тем, что вернула Dineta
        response = Response(
            {
                "status": "ok",
                "dineta": dineta_result,
            },
            status=200,
        )



    # ========================= Butent =========================
    elif export_type == 'butent':
        logger.info("[EXP] BUTENT export started")
        assign_random_prekes_kodai(documents)

        # Объединяем все документы для экспорта (Būtent поддерживает смешивание)
        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])
        
        if not all_docs:
            logger.warning("[EXP] BUTENT no documents to export")
            return Response({"error": "No documents to export"}, status=400)

        try:
            # Экспортируем в Excel (mode='auto' возвращает Dict[str, bytes])
            result = export_to_butent(
                documents=all_docs,
                mode='auto',
                user=request.user
            )
            
            logger.info("[EXP] BUTENT export completed, files=%s", list(result.keys()))
            
            # Если один файл - отдаем его напрямую
            if len(result) == 1:
                mode, excel_bytes = list(result.items())[0]
                filename = f'{today_str}_butent_{mode}_import.xlsx'
                
                logger.info("[EXP] BUTENT single file: %s, size=%d bytes", filename, len(excel_bytes))
                
                response = HttpResponse(
                    excel_bytes,
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                export_success = True
            
            # Если два файла - создаем ZIP архив
            else:
                import zipfile
                from io import BytesIO
                
                zip_buffer = BytesIO()
                
                with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                    for mode, excel_bytes in result.items():
                        filename = f'{today_str}_butent_{mode}_import.xlsx'
                        zip_file.writestr(filename, excel_bytes)
                        logger.info("[EXP] BUTENT added to ZIP: %s, size=%d bytes", filename, len(excel_bytes))
                
                zip_buffer.seek(0)
                zip_bytes = zip_buffer.read()
                
                logger.info("[EXP] BUTENT ZIP created, size=%d bytes", len(zip_bytes))
                
                response = HttpResponse(zip_bytes, content_type='application/zip')
                response['Content-Disposition'] = f'attachment; filename="{today_str}_butent_import.zip"'
                export_success = True

        except FileNotFoundError as e:
            logger.error("[EXP] BUTENT template not found: %s", e)
            return Response({
                "error": "Būtent template not found",
                "detail": "Please create template using create_butent_template()"
            }, status=500)
        
        except Exception as e:
            logger.exception("[EXP] BUTENT export failed: %s", e)
            return Response({
                "error": "Būtent export failed",
                "detail": str(e)
            }, status=500)
        

    # ========================= SITE.PRO (B1) =========================
    elif export_type == 'site_pro':
        logger.info("[EXP] SITE.PRO(B1) export started")
        assign_random_prekes_kodai(documents)

        # Экспортируем только уже классифицированные документы (pirkimai + pardavimai)
        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])

        if not all_docs:
            logger.warning("[EXP] SITE.PRO(B1) no documents to export (no pirkimai/pardavimai)")
            return Response({"error": "No documents to export"}, status=400)

        try:
            # result: {"clients": bytes, "items": bytes, "purchases": bytes, "sales": bytes}
            result = export_to_site_pro(all_docs, user=request.user)
            logger.info("[EXP] SITE.PRO(B1) export completed, keys=%s", list(result.keys()))

            files_to_export = []

            if result.get("clients"):
                files_to_export.append((f"{today_str}_site_pro_klientai.xlsx", result["clients"]))
            if result.get("items"):
                files_to_export.append((f"{today_str}_site_pro_prekes_paslaugos.xlsx", result["items"]))
            if result.get("purchases"):
                files_to_export.append((f"{today_str}_site_pro_pirkimai.xlsx", result["purchases"]))
            if result.get("sales"):
                files_to_export.append((f"{today_str}_site_pro_pardavimai.xlsx", result["sales"]))

            if not files_to_export:
                logger.warning("[EXP] SITE.PRO(B1) nothing to export (empty bytes)")
                return Response({"error": "No documents to export"}, status=400)

            # B1 обычно = 4 файла -> ZIP
            if len(files_to_export) > 1:
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                    for filename, content in files_to_export:
                        zf.writestr(filename, content)
                        logger.info("[EXP] SITE.PRO(B1) added to ZIP: %s size=%d", filename, len(content))
                zip_buffer.seek(0)

                response = HttpResponse(zip_buffer.read(), content_type="application/zip")
                response["Content-Disposition"] = f'attachment; filename="{today_str}_site_pro_importas.zip"'
                export_success = True

            else:
                filename, content = files_to_export[0]
                response = HttpResponse(
                    content,
                    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
                response["Content-Disposition"] = f'attachment; filename="{filename}"'
                export_success = True

        except FileNotFoundError as e:
            logger.exception("[EXP] SITE.PRO(B1) template not found: %s", e)
            return Response(
                {"error": "B1 template not found", "detail": str(e)},
                status=500
            )
        except Exception as e:
            logger.exception("[EXP] SITE.PRO(B1) export failed: %s", e)
            return Response(
                {"error": "B1 export failed", "detail": str(e)},
                status=500
            )



    # ========================= APSKAITA5 =========================
    elif export_type == 'apskaita5':
        logger.info("[EXP] APSKAITA5 export started")
        assign_random_prekes_kodai(documents)

        content, filename, content_type = export_documents_group_to_apskaita5_files(
            documents=documents,
            site_url=site_url,   # предполагается, что переменная определена выше по модулю/конфигу
            company_code=None,
            direction=None,
        )
        logger.info("[EXP] APSKAITA5 produced file=%s content_type=%s size=%d",
                    filename, content_type, len(content))
        response = HttpResponse(content, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-Content-Type-Options'] = 'nosniff'
        export_success = True

    # ========================= AGNUM =========================
    elif export_type == 'agnum':
        logger.info("[EXP] AGNUM export started")
        assign_random_prekes_kodai(documents)

        files_to_export = []

        # 1) Pirkimai (Type="2")
        if pirkimai_docs:
            logger.info("[EXP] AGNUM exporting pirkimai: %d docs", len(pirkimai_docs))
            pirkimai_xml = export_pirkimai_group_to_agnum(pirkimai_docs, request.user)
            files_to_export.append((f'{today_str}_pirkimai_agnum.xml', pirkimai_xml))

        # 2) Pardavimai (Type="4")
        if pardavimai_docs:
            logger.info("[EXP] AGNUM exporting pardavimai: %d docs", len(pardavimai_docs))
            pardavimai_xml = export_pardavimai_group_to_agnum(pardavimai_docs, request.user)
            files_to_export.append((f'{today_str}_pardavimai_agnum.xml', pardavimai_xml))

        logger.info("[EXP] AGNUM files_to_export=%s", [n for n, _ in files_to_export])

        if len(files_to_export) > 1:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zf:
                for filename, xml_content in files_to_export:
                    zf.writestr(filename, xml_content)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename={today_str}_agnum.zip'
            export_success = True
        elif len(files_to_export) == 1:
            filename, xml_content = files_to_export[0]
            response = HttpResponse(
                xml_content,
                content_type='application/xml; charset=utf-8'
            )
            response['Content-Disposition'] = f'attachment; filename={filename}'
            export_success = True
        else:
            logger.warning("[EXP] AGNUM nothing to export")
            response = Response({"error": "No documents to export"}, status=400)


    # # ========================= DEBETAS =========================
    elif export_type == 'debetas':
        logger.info("[EXP] DEBETAS export started")
        assign_random_prekes_kodai(documents)

        # Берём только уже классифицированные документы (pirkimai + pardavimai)
        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])

        if not all_docs:
            logger.warning("[EXP] DEBETAS no documents to export (no pirkimai/pardavimai)")
            return Response({"error": "No documents to export"}, status=400)

        try:
            debetas_result = export_to_debetas(
                documents=all_docs,
                user=request.user,
            )
        except FileNotFoundError as e:
            logger.exception("[EXP] DEBETAS template not found: %s", e)
            return Response(
                {
                    "error": "Debetas template not found",
                    "detail": str(e),
                },
                status=500,
            )
        except Exception as e:
            logger.exception("[EXP] DEBETAS export failed: %s", e)
            return Response(
                {
                    "error": "Debetas export failed",
                    "detail": str(e),
                },
                status=500,
            )

        logger.info("[EXP] DEBETAS export result keys: %s", list(debetas_result.keys()))

        # Если есть zip (и pirkimai, и pardavimai) — отдаём его
        if debetas_result.get("zip"):
            content = debetas_result["zip"]
            filename = debetas_result.get("zip_filename", f"Debetas_Import_{today_str}.zip")
            response = HttpResponse(content, content_type="application/zip")
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            export_success = True

        # Если только pirkimai
        elif debetas_result.get("pirkimai"):
            content = debetas_result["pirkimai"]
            filename = debetas_result.get("pirkimai_filename", f"Debetas_Pirkimai_{today_str}.csv")
            response = HttpResponse(
                content,
                content_type='text/csv; charset=windows-1257'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            export_success = True

        # Если только pardavimai
        elif debetas_result.get("pardavimai"):
            content = debetas_result["pardavimai"]
            filename = debetas_result.get("pardavimai_filename", f"Debetas_Pardavimai_{today_str}.csv")
            response = HttpResponse(
                content,
                content_type='text/csv; charset=windows-1257'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            export_success = True

        else:
            logger.warning("[EXP] DEBETAS nothing to export (empty result dict)")
            response = Response({"error": "No documents to export"}, status=400)


    # ========================= RIVILĖ ERP (XLSX) =========================
    elif export_type == 'rivile_erp':
        logger.info("[EXP] RIVILE_ERP export started")
        assign_random_prekes_kodai(documents)
        rivile_defaults = getattr(request.user, "rivile_erp_extra_fields", None) or {}
        rivile_defaults = getattr(request.user, "rivile_erp_extra_fields", None) or {}
        user_extra_settings = getattr(request.user, "extra_settings", None)
        if not isinstance(user_extra_settings, dict):
            user_extra_settings = {}

        klientai = []
        seen = set()

        for pack in (prepared.get("pirkimai", []) + prepared.get("pardavimai", [])):
            doc = pack["doc"]
            dir_ = pack.get("direction")

            if dir_ == 'pirkimas':
                is_person = doc.seller_is_person
                klient_type = 'pirkimas'
                # Код клиента: id → vat_code → id_programoje (как в get_party_code)
                client_code = doc.seller_id or doc.seller_vat_code or doc.seller_id_programoje or ""
                client = {
                    'id': client_code,
                    'vat': doc.seller_vat_code or "",
                    'name': doc.seller_name or "",
                    'address': doc.seller_address or "",
                    'country_iso': doc.seller_country_iso or "",
                    'currency': doc.currency or "EUR",
                    'kodas_ds': 'PT001',
                    'type': klient_type,
                    'is_person': is_person,
                    'iban': doc.seller_iban or "",
                }
            elif dir_ == 'pardavimas':
                is_person = doc.buyer_is_person
                klient_type = 'pardavimas'
                # Код клиента: id → vat_code → id_programoje (как в get_party_code)
                client_code = doc.buyer_id or doc.buyer_vat_code or doc.buyer_id_programoje or ""
                client = {
                    'id': client_code,
                    'vat': doc.buyer_vat_code or "",
                    'name': doc.buyer_name or "",
                    'address': doc.buyer_address or "",
                    'country_iso': doc.buyer_country_iso or "",
                    'currency': doc.currency or "EUR",
                    'kodas_ds': 'PT001',
                    'type': klient_type,
                    'is_person': is_person,
                    'iban': doc.buyer_iban or "",
                }
            else:
                continue

            client_key = (client['id'], client['vat'], client['name'], client['type'])
            if client['id'] and client_key not in seen:
                klientai.append(client)
                seen.add(client_key)

        logger.info("[EXP] RIVILE_ERP klientai=%d docs_pirk=%d docs_pard=%d",
                    len(klientai), len(pirkimai_docs), len(pardavimai_docs))

        files_to_export = []

        if klientai:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                export_clients_to_rivile_erp_xlsx(klientai, tmp.name)
                tmp.seek(0)
                klientai_xlsx_bytes = tmp.read()
            files_to_export.append((f'klientai_{today_str}.xlsx', klientai_xlsx_bytes))

        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            export_prekes_and_paslaugos_to_rivile_erp_xlsx(documents, tmp.name)
            tmp.seek(0)
            prekes_xlsx_bytes = tmp.read()
        files_to_export.append((f'prekes_paslaugos_{today_str}.xlsx', prekes_xlsx_bytes))

        if pirkimai_docs:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                export_documents_to_rivile_erp_xlsx(
                    pirkimai_docs,
                    tmp.name,
                    doc_type="pirkimai",
                    rivile_erp_extra_fields={
                        **rivile_defaults,
                        "user": {"extra_settings": user_extra_settings},
                    }
                )
                tmp.seek(0)
                pirkimai_xlsx_bytes = tmp.read()
            files_to_export.append((f'pirkimai_{today_str}.xlsx', pirkimai_xlsx_bytes))

        if pardavimai_docs:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                export_documents_to_rivile_erp_xlsx(
                    pardavimai_docs,
                    tmp.name,
                    doc_type="pardavimai",
                    rivile_erp_extra_fields={
                        **rivile_defaults,
                        "user": {"extra_settings": user_extra_settings},
                    },  
                )
                tmp.seek(0)
                pardavimai_xlsx_bytes = tmp.read()
            files_to_export.append((f'pardavimai_{today_str}.xlsx', pardavimai_xlsx_bytes))

        logger.info("[EXP] RIVILE_ERP files_to_export=%s", [n for n, _ in files_to_export])

        if len(files_to_export) > 1:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zf:
                for filename, file_bytes in files_to_export:
                    zf.writestr(filename, file_bytes)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename={today_str}_rivile_erp.zip'
            export_success = True
        elif len(files_to_export) == 1:
            filename, file_bytes = files_to_export[0]
            response = HttpResponse(
                file_bytes,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename={filename}'
            export_success = True
        else:
            logger.warning("[EXP] RIVILE_ERP nothing to export")
            response = Response({"error": "No clients or products to export"}, status=400)




    else:
        logger.error("[EXP] unknown export type: %s", export_type)
        return Response({"error": "Unknown export type"}, status=400)

    # --- universal finalize ---
    if response is not None:
        try:
            if export_success and exported_ids:
                ScannedDocument.objects.filter(pk__in=exported_ids).update(status="exported")
                logger.info("[EXP] Marked %d documents as exported (universal)", len(exported_ids))
        except Exception as e:
            logger.warning("[EXP] Failed to mark documents as exported: %s", e)
        return response

    logger.warning("[EXP] fell through unexpectedly")
    return Response({"error": "No documents to export"}, status=400)



# Soxranenije user infy s Dineta
class DinetaSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Вернуть текущие настройки Dineta этого пользователя.
        Пароль НЕ возвращается.
        """
        user = request.user
        settings_dict = user.dineta_settings or {}

        serializer = DinetaSettingsSerializer(instance=settings_dict)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        """
        Обновить настройки Dineta.
        Фронт шлёт server/client/username/password (+ опции).
        """
        user = request.user

        serializer = DinetaSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        settings_to_store = serializer.build_settings_dict()

        user.dineta_settings = settings_to_store
        user.save(update_fields=["dineta_settings"])

        # в ответ отдаём без пароля (serializer.instance → dict)
        response_serializer = DinetaSettingsSerializer(instance=settings_to_store)
        return Response(response_serializer.data, status=status.HTTP_200_OK)



# Soxranenije user infy s Optimum i do soxranenija delajet probnyj Hello test
class OptimumSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        """
        Вариант A:
        - user вводит key -> backend делает Hello
        - если Success: сохраняем key + verified_at + last_ok=true, чистим last_error*
        - если Error: key НЕ сохраняем, но сохраняем last_ok=false + last_error_at + last_error
        """
        user = request.user

        serializer = OptimumSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_key = (serializer.validated_data.get("key") or "").strip()
        now_iso = timezone.now().isoformat()

        try:
            optimum_hello(raw_key)
        except OptimumError as exc:
            # --- сохраняем метаданные ошибки (key не трогаем) ---
            patch = OptimumSettingsSerializer.build_error_patch(
                error_at=now_iso,
                error_msg=str(exc) or "Optimum: klaida",
            )

            current = user.optimum_settings or {}
            current.update(patch)
            user.optimum_settings = current
            user.save(update_fields=["optimum_settings"])

            # фронту отдаём понятную ошибку
            return Response(
                {"detail": patch["last_error"] or "Nepavyko patikrinti Optimum API Key."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- SUCCESS: сохраняем новый key + метаданные ---
        settings_to_store = serializer.build_success_settings_dict(verified_at=now_iso)

        user.optimum_settings = settings_to_store
        user.save(update_fields=["optimum_settings"])

        response_serializer = OptimumSettingsSerializer(instance=settings_to_store)
        return Response(response_serializer.data, status=status.HTTP_200_OK)







@api_view(['POST'])
@permission_classes([IsAuthenticated])
def process_image(request):
    raw_files = request.FILES.getlist("files")
    scan_type = request.data.get("scan_type", "sumiskai")

    if not raw_files:
        return Response({'error': 'Файлы не предоставлены'}, status=400)

    user = request.user

    # Выбираем цену за документ
    if scan_type == "detaliai":
        credits_per_doc = Decimal("1.3")
    else:
        credits_per_doc = Decimal("1")

    files_count = len(raw_files)

    # --- ПРОВЕРКА кредитов ДО обработки ---
    if user.credits < credits_per_doc * files_count:
        return Response({
            'error': f'Nepakanka kreditų. Liko – {user.credits}, reikia – {credits_per_doc * files_count}.'
        }, status=402)

    results = []
    for raw_file in raw_files:
        original_filename = raw_file.name

        # 1. Сохраняем запись в БД сразу!
        doc = ScannedDocument.objects.create(
            user=user,
            original_filename=original_filename,
            status='processing',
            scan_type=scan_type
        )
        doc.file.save(original_filename, raw_file)
        doc.save()

        # 2. Запускаем celery-task c ID
        process_uploaded_file_task.delay(
            user.id,
            doc.id,
            scan_type
        )

        results.append({
            "id": doc.id,
            "original_filename": original_filename,
            "status": "processing",
            "uploaded_at": doc.uploaded_at
        })

    return Response({
        'status': 'processing',
        'results': results,
        'msg': 'Dokumentai užregistruoti ir apdorojami. Po kelių sekundžių statusas atsinaujins.'
    })






# Obnovit company details v Nustatymai

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_own_company_details(request):
    user = request.user
    serializer = CustomUserSerializer(user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)



# Udaliajet zapisi s dashboard i BD

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def bulk_delete_documents(request):
    ids = request.data.get('ids', [])
    if not ids:
        return Response({'error': 'No IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
    # Удаляем только документы текущего пользователя
    queryset = ScannedDocument.objects.filter(id__in=ids, user=request.user)
    deleted, _ = queryset.delete()
    return Response({'deleted': deleted}, status=status.HTTP_200_OK)




# #poluciajem vsio infu iz BD dlia otobrazhenija v dashboard pri zagruzke

# /documents/
# @api_view(['GET'])
# @permission_classes([IsAuthenticated])
# def get_user_documents(request):
#     user = request.user
#     status = request.GET.get('status')
#     date_from = request.GET.get('from')
#     date_to = request.GET.get('to')

#     docs = ScannedDocument.objects.filter(user=user)

#     if status:
#         docs = docs.filter(status=status)
#     if date_from:
#         docs = docs.filter(created_at__date__gte=parse_date(date_from))
#     if date_to:
#         docs = docs.filter(created_at__date__lte=parse_date(date_to))

#     docs = docs.order_by('-uploaded_at').only(
#         "id","original_filename","status","uploaded_at","preview_url",
#         "document_number",
#         "seller_name","seller_id","seller_vat_code","seller_vat_val",
#         "buyer_name","buyer_id","buyer_vat_code","buyer_vat_val",
#         "pirkimas_pardavimas","scan_type","ready_for_export","math_validation_passed",
#     )

#     serializer = ScannedDocumentListSerializer(docs, many=True)
#     return Response(serializer.data)


# @api_view(['GET'])
# @permission_classes([IsAuthenticated])
# def get_user_documents(request):
#     user = request.user
#     status = request.GET.get('status')
#     date_from = request.GET.get('from')
#     date_to = request.GET.get('to')

#     docs = ScannedDocument.objects.filter(user=user)
#     if status:
#         docs = docs.filter(status=status)
#     if date_from:
#         docs = docs.filter(created_at__date__gte=parse_date(date_from))
#     if date_to:
#         docs = docs.filter(created_at__date__lte=parse_date(date_to))

#     serializer = ScannedDocumentListSerializer(docs.order_by('-uploaded_at'), many=True)
#     return Response(serializer.data)



@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def get_user_documents(request):
    user = request.user

    if request.method == "GET":
        q = request.query_params
        status_param = q.get("status")
        date_from = q.get("from")
        date_to = q.get("to")
        search = q.get("search")
        cp = q.get("cp")
        
        # NEW: параметры для archive_warnings
        include_archive_warnings = q.get("include_archive_warnings", "").lower() == "true"
        session_id = q.get("session_id")

        qs = ScannedDocument.objects.filter(user=user, is_archive_container=False)

        if status_param:
            qs = qs.filter(status=status_param)

        tz = timezone.get_current_timezone()

        if date_from:
            d = parse_date(date_from)
            if d:
                dt_from = timezone.make_aware(datetime.combine(d, time.min), tz)
                qs = qs.filter(uploaded_at__gte=dt_from)

        if date_to:
            d = parse_date(date_to)
            if d:
                dt_to = timezone.make_aware(datetime.combine(d, time.min), tz) + timedelta(days=1)
                qs = qs.filter(uploaded_at__lt=dt_to)

        if search:
            search = search.strip()
            if search:
                qs = qs.filter(document_number__icontains=search)

        if cp:
            cp = cp.strip().lower()
            if cp.startswith("id:"):
                cp_id = cp.split("id:", 1)[1].strip()
                if cp_id.isdigit():
                    qs = qs.filter(Q(seller_id=int(cp_id)) | Q(buyer_id=int(cp_id)))
            else:
                qs = qs.filter(
                    Q(seller_vat_code__iexact=cp) |
                    Q(buyer_vat_code__iexact=cp) |
                    Q(seller_name__icontains=cp) |
                    Q(buyer_name__icontains=cp)
                )

        # === Exportable count ===
        exportable_qs = qs.filter(
            status__in=["completed", "exported"],
            ready_for_export=True,
            math_validation_passed=True,
        )

        view_mode = getattr(user, "view_mode", "single")
        if view_mode != "multi":
            exportable_qs = exportable_qs.filter(pirkimas_pardavimas__in=["pirkimas", "pardavimas"])

        exportable_total = 0 if (view_mode == "multi" and not cp) else exportable_qs.count()

        qs = qs.order_by("-uploaded_at", "-id").only(
            "id","original_filename","status","uploaded_at","preview_url",
            "document_number",
            "seller_name","seller_id","seller_vat_code","seller_vat_val",
            "buyer_name","buyer_id","buyer_vat_code","buyer_vat_val",
            "pirkimas_pardavimas","scan_type","ready_for_export","math_validation_passed",
        )

        paginator = DocumentsCursorPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = ScannedDocumentListSerializer(page, many=True)
        resp = paginator.get_paginated_response(serializer.data)
        resp.data["exportable_total"] = exportable_total

        # === NEW: Архивы с ошибками (только если запрошено) ===
        if include_archive_warnings and session_id:
            archive_warnings_qs = ScannedDocument.objects.filter(
                user=user,
                is_archive_container=True,
                upload_session_id=session_id,
                error_message__startswith="Praleista"
            )
            
            resp.data["archive_warnings"] = list(archive_warnings_qs.order_by("-uploaded_at").values(
                "id", "original_filename", "error_message", "uploaded_at"
            )[:50])

        return resp

    # POST upload
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

    doc = ScannedDocument.objects.create(
        user=user,
        file=uploaded_file,
        original_filename=uploaded_file.name,
        status="processing",
    )
    return Response(ScannedDocumentListSerializer(doc).data, status=status.HTTP_201_CREATED)

# @api_view(["GET", "POST"])
# @permission_classes([IsAuthenticated])
# @parser_classes([MultiPartParser, FormParser])
# def get_user_documents(request):
#     user = request.user

#     if request.method == "GET":
#         q = request.query_params
#         status_param = q.get("status")
#         date_from = q.get("from")
#         date_to = q.get("to")
#         search = q.get("search")
#         cp = q.get("cp")

#         qs = ScannedDocument.objects.filter(user=user, is_archive_container=False)

#         if status_param:
#             qs = qs.filter(status=status_param)

#         tz = timezone.get_current_timezone()

#         if date_from:
#             d = parse_date(date_from)
#             if d:
#                 dt_from = timezone.make_aware(datetime.combine(d, time.min), tz)
#                 qs = qs.filter(uploaded_at__gte=dt_from)

#         if date_to:
#             d = parse_date(date_to)
#             if d:
#                 dt_to = timezone.make_aware(datetime.combine(d, time.min), tz) + timedelta(days=1)
#                 qs = qs.filter(uploaded_at__lt=dt_to)

#         if search:
#             search = search.strip()
#             if search:
#                 qs = qs.filter(document_number__icontains=search)

#         if cp:
#             cp = cp.strip().lower()
#             if cp.startswith("id:"):
#                 cp_id = cp.split("id:", 1)[1].strip()
#                 if cp_id.isdigit():
#                     qs = qs.filter(Q(seller_id=int(cp_id)) | Q(buyer_id=int(cp_id)))
#             else:
#                 # пробуем как VAT (точное совпадение) или как имя (icontains)
#                 qs = qs.filter(
#                     Q(seller_vat_code__iexact=cp) |
#                     Q(buyer_vat_code__iexact=cp) |
#                     Q(seller_name__icontains=cp) |
#                     Q(buyer_name__icontains=cp)
#                 )

#         # === NEW: сколько документов реально экспортируемо по текущим фильтрам ===
#         exportable_qs = qs.filter(
#             status__in=["completed", "exported"],
#             ready_for_export=True,
#             math_validation_passed=True,
#         )

#         view_mode = getattr(user, "view_mode", "single")
#         if view_mode != "multi":
#             exportable_qs = exportable_qs.filter(pirkimas_pardavimas__in=["pirkimas", "pardavimas"])

#         # в multi без выбранного контрагента — считаем 0 (экспорт всё равно запрещён)
#         exportable_total = 0 if (view_mode == "multi" and not cp) else exportable_qs.count()

        

#         qs = qs.order_by("-uploaded_at", "-id").only(
#             "id","original_filename","status","uploaded_at","preview_url",
#             "document_number",
#             "seller_name","seller_id","seller_vat_code","seller_vat_val",
#             "buyer_name","buyer_id","buyer_vat_code","buyer_vat_val",
#             "pirkimas_pardavimas","scan_type","ready_for_export","math_validation_passed",
#         )

#         paginator = DocumentsCursorPagination()
#         page = paginator.paginate_queryset(qs, request)
#         serializer = ScannedDocumentListSerializer(page, many=True)
#         resp = paginator.get_paginated_response(serializer.data)
#         resp.data["exportable_total"] = exportable_total  # NEW
#         return resp

#     # POST upload
#     uploaded_file = request.FILES.get("file")
#     if not uploaded_file:
#         return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

#     doc = ScannedDocument.objects.create(
#         user=user,
#         file=uploaded_file,
#         original_filename=uploaded_file.name,
#         status="processing",
#     )
#     # фронт сможет сделать prepend
#     return Response(ScannedDocumentListSerializer(doc).data, status=status.HTTP_201_CREATED)


BIG_FIELDS = ("raw_text", "gpt_raw_json", "structured_json", "glued_raw_text")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_document_detail(request, pk):
    user = request.user

    if user.is_superuser:
        doc = get_object_or_404(
            ScannedDocument.objects.annotate(line_items_count=Count("line_items")),
            pk=pk
        )
        ser = ScannedDocumentAdminDetailSerializer(doc, context={"request": request})
        data = ser.data
        data["line_items_count"] = doc.line_items_count  # уже посчитано

        if getattr(user, "view_mode", None) == "multi":
            cp_key = request.query_params.get("cp_key")
            preview = build_preview(
                doc,
                user,
                cp_key=cp_key,
                view_mode="multi",
                base_vat_percent=data.get("vat_percent"),
                base_preke_paslauga=data.get("preke_paslauga"),
            )
            data["preview"] = preview

        return Response(data)

    qs = (
        ScannedDocument.objects
        .defer(*BIG_FIELDS)
        .annotate(line_items_count=Count("line_items"))
    )
    doc = get_object_or_404(qs, pk=pk, user=user)

    ser = ScannedDocumentDetailSerializer(doc, context={"request": request})
    data = ser.data
    data["line_items_count"] = doc.line_items_count  # уже посчитано

    if getattr(user, "view_mode", None) != "multi":
        return Response(data)

    cp_key = request.query_params.get("cp_key")
    preview = build_preview(
        doc,
        user,
        cp_key=cp_key,
        view_mode="multi",
        base_vat_percent=data.get("vat_percent"),
        base_preke_paslauga=data.get("preke_paslauga"),
    )
    data["preview"] = preview
    return Response(data)



# @api_view(["GET"])
# @permission_classes([IsAuthenticated])
# def get_document_detail(request, pk):
#     user = request.user

#     line_items_prefetch = Prefetch(
#         "line_items",
#         queryset=LineItem.objects.order_by("id")
#     )

#     # --- Суперюзер: оставляем как есть (все поля) ---
#     if user.is_superuser:
#         doc = get_object_or_404(
#             ScannedDocument.objects.prefetch_related(line_items_prefetch),
#             pk=pk
#         )
#         ser = ScannedDocumentAdminDetailSerializer(doc, context={"request": request})
#         data = ser.data

#         if getattr(user, "view_mode", None) == "multi":
#             cp_key = request.query_params.get("cp_key")
#             preview = build_preview(
#                 doc,
#                 user,
#                 cp_key=cp_key,
#                 view_mode="multi",
#                 base_vat_percent=data.get("vat_percent"),
#                 base_preke_paslauga=data.get("preke_paslauga"),
#             )
#             data["preview"] = preview

#         return Response(data)

#     # --- Обычный пользователь: НЕ читаем большие поля ---
#     qs = (
#         ScannedDocument.objects
#         .prefetch_related(line_items_prefetch)
#         .defer(*BIG_FIELDS)
#     )

#     doc = get_object_or_404(qs, pk=pk, user=user)

#     ser = ScannedDocumentDetailSerializer(doc, context={"request": request})
#     data = ser.data

#     if getattr(user, "view_mode", None) != "multi":
#         return Response(data)

#     cp_key = request.query_params.get("cp_key")
#     preview = build_preview(
#         doc,
#         user,
#         cp_key=cp_key,
#         view_mode="multi",
#         base_vat_percent=data.get("vat_percent"),
#         base_preke_paslauga=data.get("preke_paslauga"),
#     )
#     data["preview"] = preview
#     return Response(data)



# @api_view(["GET"])
# @permission_classes([IsAuthenticated])
# def get_document_lineitems(request, pk):
#     """Пагинированная загрузка line items для документа."""
#     user = request.user
    
#     if user.is_superuser:
#         doc = get_object_or_404(ScannedDocument, pk=pk)
#     else:
#         doc = get_object_or_404(ScannedDocument, pk=pk, user=user)
    
#     line_items_qs = doc.line_items.order_by("id")
    
#     paginator = LineItemPagination()
#     page = paginator.paginate_queryset(line_items_qs, request)
    
#     serializer = LineItemSerializer(page, many=True)
    
#     return paginator.get_paginated_response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_document_lineitems(request, pk):
    """Пагинированная загрузка line items для документа (+ PVM klasė по cp_key)."""
    user = request.user

    if user.is_superuser:
        doc = get_object_or_404(ScannedDocument, pk=pk)
    else:
        doc = get_object_or_404(ScannedDocument, pk=pk, user=user)

    # cp_key приходит из фронта так же, как на /documents/{id}/
    cp_key = request.query_params.get("cp_key") or None
    cp_selected = bool(cp_key)

    # строим ctx ровно как в preview (multi)
    ctx = ResolveContext(
        user=user,
        view_mode="multi",
        purpose="preview",
        overrides={},
        cp_key=cp_key,
    )
    direction = resolve_direction(doc, ctx)

    # базовые значения на случай, если в lineitem нет vat_percent / preke_paslauga
    # (если у тебя эти поля называются иначе — поправь getattr)
    base_vat_percent = getattr(doc, "vat_percent", None)
    base_preke_paslauga = getattr(doc, "preke_paslauga", None)

    line_items_qs = doc.line_items.order_by("id")

    paginator = LineItemPagination()
    page = paginator.paginate_queryset(line_items_qs, request)

    serializer = LineItemSerializer(page, many=True)
    data = list(serializer.data)  # <-- будем модифицировать

    # Если cp не выбран — как раньше: “Pasirinkite kontrahentą”
    if not cp_selected:
        for row in data:
            row["pvm_kodas"] = None
            row["pvm_kodas_label"] = "Pasirinkite kontrahentą"
        return paginator.get_paginated_response(data)

    # cp выбран — считаем PVM kodą на каждую строку страницы
    buyer_iso = _nz(doc.buyer_country_iso)
    seller_iso = _nz(doc.seller_country_iso)
    buyer_has_v = bool(_nz(doc.buyer_vat_code))
    seller_has_v = bool(_nz(doc.seller_vat_code))

    ps_doc = _normalize_ps(base_preke_paslauga)
    separate_vat = bool(doc.separate_vat)
    doc_96_str = bool(getattr(doc, "doc_96_str", False))

    # page и serializer.data должны быть в одном порядке — zip безопасен
    for li_obj, row in zip(page, data):
        li_vat = _normalize_vat_percent(
            li_obj.vat_percent if getattr(li_obj, "vat_percent", None) is not None else base_vat_percent
        )

        # если в модели есть preke_paslauga — используем её, иначе fallback на doc-level
        li_ps_val = getattr(li_obj, "preke_paslauga", None)
        li_ps = _normalize_ps(li_ps_val if li_ps_val is not None else ps_doc)
        li_ps_bin = _ps_to_bin(li_ps)

        if _need_geo(li_vat) and (direction is None or not (buyer_iso and seller_iso)):
            li_code = None
        else:
            li_code = auto_select_pvm_code(
                pirkimas_pardavimas=direction,
                buyer_country_iso=buyer_iso,
                seller_country_iso=seller_iso,
                preke_paslauga=li_ps_bin,
                vat_percent=li_vat,
                separate_vat=False,
                buyer_has_vat_code=buyer_has_v,
                seller_has_vat_code=seller_has_v,
                doc_96_str=doc_96_str,
            )

        row["pvm_kodas"] = li_code
        row["pvm_kodas_label"] = _pvm_label(li_code, cp_selected=True)

    return paginator.get_paginated_response(data)




#Obnovit extra field vzavisimosti ot vybranoj buh programy
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_scanned_document_extra_fields(request, pk):
    import logging
    from django.db import transaction
    from .models import ScannedDocument, LineItem
    from .serializers import ScannedDocumentSerializer
    from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
    from .validators.vat_klas import auto_select_pvm_code
    from .utils.save_document import _apply_sumiskai_defaults_from_user
    from .validators.required_fields_checker import check_required_fields_for_export

    log = logging.getLogger("docscanner_app.api.update_extra_fields")

    doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
    if not doc:
        log.warning("PATCH extra_fields pk=%s: document not found for user=%s", pk, request.user.id)
        return Response({'error': 'Dokumentas nerastas'}, status=404)

    ALLOWED_FIELDS = [
        'buyer_id', 'buyer_name', 'buyer_vat_code', 'buyer_iban', 'buyer_address', 'buyer_country_iso',
        'seller_id', 'seller_name', 'seller_vat_code', 'seller_iban', 'seller_address', 'seller_country_iso',
        'prekes_kodas', 'prekes_barkodas', 'prekes_pavadinimas', 'preke_paslauga',
        'vat_percent', 'scan_type', 'doc_96_str',
    ]

    def _is_cleared(prefix: str) -> bool:
        keys = [
            f"{prefix}_name", f"{prefix}_id", f"{prefix}_vat_code",
            f"{prefix}_iban", f"{prefix}_address", f"{prefix}_country_iso",
        ]
        provided = [k for k in keys if k in request.data]
        if not provided:
            return False
        return all(not str(request.data.get(k) or "").strip() for k in provided)

    def _to_bool_allow(x):
        if x is None: return None
        if isinstance(x, bool): return x
        s = str(x).strip().lower()
        if s in {"0","false","no","ne","off"}: return False
        if s in {"1","true","taip","yes","on"}: return True
        return None

    def _normalize_ps(v):
        if v is None: return None
        if isinstance(v, int): return v if v in (1,2,3,4) else None
        s = str(v).strip()
        return int(s) if s.isdigit() and int(s) in (1,2,3,4) else None

    def _normalize_vat_percent(v):
        if v is None: return None
        try:
            from decimal import Decimal
            if isinstance(v, Decimal): return float(v)
            s = str(v).strip().replace(",", ".")
            if not s: return None
            if s.endswith("%"): s = s[:-1]
            return float(Decimal(s))
        except Exception:
            return None

    def _nz(s):
        if s is None: return None
        s2 = str(s).strip()
        return s2 if s2 else None

    # применяем входные изменения (сыро), логируем
    fields_to_update = []
    for field in ALLOWED_FIELDS:
        if field in request.data:
            old_val = getattr(doc, field, None)
            new_val = request.data[field]
            setattr(doc, field, new_val)
            fields_to_update.append(field)
            if str(old_val) != str(new_val):
                log.info("pk=%s: field %s changed: %r -> %r", pk, field, old_val, new_val)

    buyer_cleared = _is_cleared("buyer")
    seller_cleared = _is_cleared("seller")
    if buyer_cleared or seller_cleared:
        log.info("pk=%s: clear detected: buyer_cleared=%s seller_cleared=%s", pk, buyer_cleared, seller_cleared)

    apply_defaults_req = _to_bool_allow(request.data.get("apply_defaults", None))
    log.info("pk=%s: apply_defaults_req=%r", pk, apply_defaults_req)

    with transaction.atomic():
        # 0) Сохранить присланные поля
        if fields_to_update:
            doc.save(update_fields=fields_to_update)

        # 1) Пересчитать pirkimas/pardavimas
        doc_struct = {
            "seller_id": doc.seller_id,
            "seller_vat_code": doc.seller_vat_code,
            "seller_name": doc.seller_name,
            "buyer_id": doc.buyer_id,
            "buyer_vat_code": doc.buyer_vat_code,
            "buyer_name": doc.buyer_name,
        }
        doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, request.user)
        log.info("pk=%s: pirkimas_pardavimas=%r", pk, doc.pirkimas_pardavimas)

        # 1.1) Флаги наличия VAT кода
        buyer_has_vat_code = bool((doc.buyer_vat_code or "").strip())
        seller_has_vat_code = bool((doc.seller_vat_code or "").strip())
        if hasattr(doc, "buyer_has_vat_code"):
            doc.buyer_has_vat_code = buyer_has_vat_code
        if hasattr(doc, "seller_has_vat_code"):
            doc.seller_has_vat_code = seller_has_vat_code
        log.info("pk=%s: buyer_has_vat_code=%s seller_has_vat_code=%s", pk, buyer_has_vat_code, seller_has_vat_code)

        # 1.2) ЕСЛИ очищаем buyer/seller — чистим товарные поля и PVM И ВЫХОДИМ РАНО
        if buyer_cleared or seller_cleared:
            doc.prekes_pavadinimas = ""
            doc.prekes_kodas = ""
            doc.prekes_barkodas = ""
            doc.preke_paslauga = ""
            doc.pvm_kodas = None
            update_fields_now = ["prekes_pavadinimas","prekes_kodas","prekes_barkodas","preke_paslauga","pvm_kodas","pirkimas_pardavimas"]

            if hasattr(doc, "buyer_has_vat_code"): update_fields_now.append("buyer_has_vat_code")
            if hasattr(doc, "seller_has_vat_code"): update_fields_now.append("seller_has_vat_code")

            if (doc.scan_type or "").strip().lower() == "detaliai":
                cleared = LineItem.objects.filter(document=doc).update(pvm_kodas=None)
                log.info("pk=%s: cleared LineItem.pvm_kodas for %d items", pk, cleared)

            doc.save(update_fields=update_fields_now)
            
            # Валидация перед ранним возвратом
            try:
                is_valid = check_required_fields_for_export(doc)
                doc.ready_for_export = is_valid
                doc.save(update_fields=['ready_for_export'])
                log.info("pk=%s: validated after clear, ready_for_export=%s", pk, is_valid)
            except Exception as e:
                log.error("pk=%s: validation error after clear: %s", pk, str(e))
            
            log.info("pk=%s: PVM cleared due to party clear, early return", pk)
            return Response(ScannedDocumentSerializer(doc).data)

        # 2) Применить дефолты (sumiskai, если разрешено)
        scan_type = (doc.scan_type or "").strip().lower()
        allow_defaults = (scan_type == "sumiskai" and (apply_defaults_req is None or apply_defaults_req is True))
        if allow_defaults:
            changed = _apply_sumiskai_defaults_from_user(doc, request.user)
            log.info("pk=%s: defaults applied=%s", pk, changed)
            if changed:
                doc.save(update_fields=["prekes_pavadinimas","prekes_kodas","prekes_barkodas","preke_paslauga"])

        # 3) Нормализованные данные для расчёта
        buyer_iso = _nz(doc.buyer_country_iso)
        seller_iso = _nz(doc.seller_country_iso)
        doc_vat_norm = _normalize_vat_percent(doc.vat_percent)
        doc_ps = _normalize_ps(doc.preke_paslauga)

        log.info("pk=%s: buyer_iso=%r seller_iso=%r vat_percent_norm=%r preke_paslauga_norm=%r",
                 pk, buyer_iso, seller_iso, doc_vat_norm, doc_ps)

        # требуем страны/направление только если 0%
        need_countries_doc = (doc_vat_norm == 0.0)
        missing_crit = need_countries_doc and (
            doc.pirkimas_pardavimas not in ("pirkimas", "pardavimas") or not (buyer_iso and seller_iso)
        )
        log.info("pk=%s: need_countries_doc=%s missing_crit=%s", pk, need_countries_doc, missing_crit)

        # ============ СОХРАНЯЕМ ОРИГИНАЛЬНЫЙ vat_percent ============
        original_vat_percent = doc.vat_percent
        # ============================================================

        # 4) Пересчёт PVM
        if scan_type == "detaliai":
            items = list(LineItem.objects.filter(document=doc))
            pvm_codes = set()
            vat_percents = set()
            log.info("pk=%s: recalc items count=%d", pk, len(items))

            for item in items:
                item_vat = item.vat_percent if item.vat_percent is not None else doc.vat_percent
                item_vat_norm = _normalize_vat_percent(item_vat)
                item_ps = _normalize_ps(item.preke_paslauga)
                if item_ps is None:
                    item_ps = doc_ps

                item_pvm = auto_select_pvm_code(
                    pirkimas_pardavimas=doc.pirkimas_pardavimas,
                    buyer_country_iso=buyer_iso,
                    seller_country_iso=seller_iso,
                    preke_paslauga=item_ps,
                    vat_percent=item_vat_norm,
                    separate_vat=bool(doc.separate_vat),
                    buyer_has_vat_code=buyer_has_vat_code,
                    seller_has_vat_code=seller_has_vat_code,
                    doc_96_str=bool(getattr(doc, "doc_96_str", False)),
                )

                old = item.pvm_kodas
                item.pvm_kodas = item_pvm
                item.save(update_fields=["pvm_kodas"])
                log.info("pk=%s: item[%s] vat=%r ps=%r -> pvm %r (was %r)",
                         pk, item.id, item_vat_norm, item_ps, item_pvm, old)

                if item_pvm is not None: pvm_codes.add(item_pvm)
                if item_vat_norm is not None: vat_percents.add(item_vat_norm)

            if bool(doc.separate_vat):
                doc.pvm_kodas = "Keli skirtingi PVM"
                doc.vat_percent = None
                log.info("pk=%s: separate_vat=True -> doc.pvm_kodas='Keli skirtingi PVM'", pk)
            else:
                if len(pvm_codes) == 1 and len(vat_percents) == 1:
                    doc.pvm_kodas = next(iter(pvm_codes))
                    doc.vat_percent = next(iter(vat_percents))
                    log.info("pk=%s: unified items -> doc.pvm_kodas=%r vat_percent=%r",
                             pk, doc.pvm_kodas, doc.vat_percent)
                elif len(pvm_codes) == 0:
                    # ============ FIX: Не удалось рассчитать PVM - сохраняем оригинальный vat_percent ============
                    doc.pvm_kodas = ""
                    # НЕ трогаем vat_percent - оставляем как было
                    log.info("pk=%s: could not calculate PVM (no pvm_codes), keeping vat_percent=%r", 
                             pk, doc.vat_percent)
                    # ============================================================================================
                else:
                    doc.pvm_kodas = ""
                    doc.vat_percent = None
                    log.info("pk=%s: heterogeneous items -> doc.pvm_kodas cleared", pk)

        else:
            # sumiskai / detaliai без строк — документный расчёт
            doc_pvm = auto_select_pvm_code(
                pirkimas_pardavimas=doc.pirkimas_pardavimas,
                buyer_country_iso=buyer_iso,
                seller_country_iso=seller_iso,
                preke_paslauga=doc_ps,
                vat_percent=doc_vat_norm,
                separate_vat=bool(doc.separate_vat),
                buyer_has_vat_code=buyer_has_vat_code,
                seller_has_vat_code=seller_has_vat_code,
                doc_96_str=bool(getattr(doc, "doc_96_str", False)),
            )
            old_doc_pvm = doc.pvm_kodas
            doc.pvm_kodas = doc_pvm
            log.info("pk=%s: doc-level recalc -> pvm %r (was %r)", pk, doc_pvm, old_doc_pvm)

        # 5) Сохранить
        update_set = {"pirkimas_pardavimas","pvm_kodas","vat_percent"}
        if hasattr(doc, "buyer_has_vat_code"): update_set.add("buyer_has_vat_code")
        if hasattr(doc, "seller_has_vat_code"): update_set.add("seller_has_vat_code")

        doc.save(update_fields=list(update_set))
        log.info("pk=%s: saved fields=%s", pk, sorted(update_set))

    # Валидация в конце - ВСЕГДА проверяем после изменений
    try:
        is_valid = check_required_fields_for_export(doc)
        doc.ready_for_export = is_valid
        doc.save(update_fields=['ready_for_export'])
        log.info("pk=%s: validated after update, ready_for_export=%s", pk, is_valid)
    except Exception as e:
        log.error("pk=%s: validation error: %s", pk, str(e))

    return Response(ScannedDocumentSerializer(doc).data)
# @api_view(['PATCH'])
# @permission_classes([IsAuthenticated])
# def update_scanned_document_extra_fields(request, pk):
#     import logging
#     from django.db import transaction
#     from .models import ScannedDocument, LineItem
#     from .serializers import ScannedDocumentSerializer
#     from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
#     from .validators.vat_klas import auto_select_pvm_code
#     from .utils.save_document import _apply_sumiskai_defaults_from_user
#     from .validators.required_fields_checker import check_required_fields_for_export  # ДОБАВИТЬ

#     log = logging.getLogger("docscanner_app.api.update_extra_fields")

#     doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
#     if not doc:
#         log.warning("PATCH extra_fields pk=%s: document not found for user=%s", pk, request.user.id)
#         return Response({'error': 'Dokumentas nerastas'}, status=404)

#     ALLOWED_FIELDS = [
#         'buyer_id', 'buyer_name', 'buyer_vat_code', 'buyer_iban', 'buyer_address', 'buyer_country_iso',
#         'seller_id', 'seller_name', 'seller_vat_code', 'seller_iban', 'seller_address', 'seller_country_iso',
#         'prekes_kodas', 'prekes_barkodas', 'prekes_pavadinimas', 'preke_paslauga',
#         'vat_percent', 'scan_type', 'doc_96_str',
#     ]

#     # helpers
#     # def _is_cleared(prefix: str) -> bool:
#     #     keys = [
#     #         f"{prefix}_name", f"{prefix}_id", f"{prefix}_vat_code",
#     #         f"{prefix}_iban", f"{prefix}_address", f"{prefix}_country_iso",
#     #     ]
#     #     touched = any(k in request.data for k in keys)
#     #     if not touched:
#     #         return False
#     #     return all(not str(request.data.get(k) or "").strip() for k in keys)

#     def _is_cleared(prefix: str) -> bool:
#         keys = [
#             f"{prefix}_name", f"{prefix}_id", f"{prefix}_vat_code",
#             f"{prefix}_iban", f"{prefix}_address", f"{prefix}_country_iso",
#         ]
#         provided = [k for k in keys if k in request.data]  # только реально присланные
#         if not provided:
#             return False
#         return all(not str(request.data.get(k) or "").strip() for k in provided)

#     def _to_bool_allow(x):
#         if x is None: return None
#         if isinstance(x, bool): return x
#         s = str(x).strip().lower()
#         if s in {"0","false","no","ne","off"}: return False
#         if s in {"1","true","taip","yes","on"}: return True
#         return None

#     def _normalize_ps(v):
#         if v is None: return None
#         if isinstance(v, int): return v if v in (1,2,3,4) else None
#         s = str(v).strip()
#         return int(s) if s.isdigit() and int(s) in (1,2,3,4) else None

#     def _normalize_vat_percent(v):
#         if v is None: return None
#         try:
#             from decimal import Decimal
#             if isinstance(v, Decimal): return float(v)
#             s = str(v).strip().replace(",", ".")
#             if not s: return None
#             if s.endswith("%"): s = s[:-1]
#             return float(Decimal(s))
#         except Exception:
#             return None

#     def _nz(s):
#         if s is None: return None
#         s2 = str(s).strip()
#         return s2 if s2 else None

#     # применяем входные изменения (сыро), логируем
#     fields_to_update = []
#     for field in ALLOWED_FIELDS:
#         if field in request.data:
#             old_val = getattr(doc, field, None)
#             new_val = request.data[field]
#             setattr(doc, field, new_val)
#             fields_to_update.append(field)
#             if str(old_val) != str(new_val):
#                 log.info("pk=%s: field %s changed: %r -> %r", pk, field, old_val, new_val)

#     buyer_cleared = _is_cleared("buyer")
#     seller_cleared = _is_cleared("seller")
#     if buyer_cleared or seller_cleared:
#         log.info("pk=%s: clear detected: buyer_cleared=%s seller_cleared=%s", pk, buyer_cleared, seller_cleared)

#     apply_defaults_req = _to_bool_allow(request.data.get("apply_defaults", None))
#     log.info("pk=%s: apply_defaults_req=%r", pk, apply_defaults_req)

#     with transaction.atomic():
#         # 0) Сохранить присланные поля
#         if fields_to_update:
#             doc.save(update_fields=fields_to_update)

#         # 1) Пересчитать pirkimas/pardavimas
#         doc_struct = {
#             "seller_id": doc.seller_id,
#             "seller_vat_code": doc.seller_vat_code,
#             "seller_name": doc.seller_name,
#             "buyer_id": doc.buyer_id,
#             "buyer_vat_code": doc.buyer_vat_code,
#             "buyer_name": doc.buyer_name,
#         }
#         doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, request.user)
#         log.info("pk=%s: pirkimas_pardavimas=%r", pk, doc.pirkimas_pardavimas)

#         # 1.1) Флаги наличия VAT кода
#         buyer_has_vat_code = bool((doc.buyer_vat_code or "").strip())
#         seller_has_vat_code = bool((doc.seller_vat_code or "").strip())
#         if hasattr(doc, "buyer_has_vat_code"):
#             doc.buyer_has_vat_code = buyer_has_vat_code
#         if hasattr(doc, "seller_has_vat_code"):
#             doc.seller_has_vat_code = seller_has_vat_code
#         log.info("pk=%s: buyer_has_vat_code=%s seller_has_vat_code=%s", pk, buyer_has_vat_code, seller_has_vat_code)

#         # 1.2) ЕСЛИ очищаем buyer/seller — чистим товарные поля и PVM И ВЫХОДИМ РАНО
#         if buyer_cleared or seller_cleared:
#             doc.prekes_pavadinimas = ""
#             doc.prekes_kodas = ""
#             doc.prekes_barkodas = ""
#             doc.preke_paslauga = ""
#             doc.pvm_kodas = None
#             update_fields_now = ["prekes_pavadinimas","prekes_kodas","prekes_barkodas","preke_paslauga","pvm_kodas","pirkimas_pardavimas"]

#             if hasattr(doc, "buyer_has_vat_code"): update_fields_now.append("buyer_has_vat_code")
#             if hasattr(doc, "seller_has_vat_code"): update_fields_now.append("seller_has_vat_code")

#             if (doc.scan_type or "").strip().lower() == "detaliai":
#                 cleared = LineItem.objects.filter(document=doc).update(pvm_kodas=None)
#                 log.info("pk=%s: cleared LineItem.pvm_kodas for %d items", pk, cleared)

#             doc.save(update_fields=update_fields_now)
            
#             # ============ ДОБАВИТЬ ВАЛИДАЦИЮ ПЕРЕД РАННИМ ВОЗВРАТОМ ============
#             try:
#                 is_valid = check_required_fields_for_export(doc)
#                 doc.ready_for_export = is_valid
#                 doc.save(update_fields=['ready_for_export'])
#                 log.info("pk=%s: validated after clear, ready_for_export=%s", pk, is_valid)
#             except Exception as e:
#                 log.error("pk=%s: validation error after clear: %s", pk, str(e))
#             # ====================================================================
            
#             log.info("pk=%s: PVM cleared due to party clear, early return", pk)
#             return Response(ScannedDocumentSerializer(doc).data)

#         # 2) Применить дефолты (sumiskai, если разрешено)
#         scan_type = (doc.scan_type or "").strip().lower()
#         allow_defaults = (scan_type == "sumiskai" and (apply_defaults_req is None or apply_defaults_req is True))
#         if allow_defaults:
#             changed = _apply_sumiskai_defaults_from_user(doc, request.user)
#             log.info("pk=%s: defaults applied=%s", pk, changed)
#             if changed:
#                 doc.save(update_fields=["prekes_pavadinimas","prekes_kodas","prekes_barkodas","preke_paslauga"])

#         # 3) Нормализованные данные для расчёта
#         buyer_iso = _nz(doc.buyer_country_iso)
#         seller_iso = _nz(doc.seller_country_iso)
#         doc_vat_norm = _normalize_vat_percent(doc.vat_percent)
#         doc_ps = _normalize_ps(doc.preke_paslauga)

#         log.info("pk=%s: buyer_iso=%r seller_iso=%r vat_percent_norm=%r preke_paslauga_norm=%r",
#                  pk, buyer_iso, seller_iso, doc_vat_norm, doc_ps)

#         # требуем страны/направление только если 0%
#         need_countries_doc = (doc_vat_norm == 0.0)
#         missing_crit = need_countries_doc and (
#             doc.pirkimas_pardavimas not in ("pirkimas", "pardavimas") or not (buyer_iso and seller_iso)
#         )
#         log.info("pk=%s: need_countries_doc=%s missing_crit=%s", pk, need_countries_doc, missing_crit)

#         # 4) Пересчёт PVM
#         if scan_type == "detaliai":
#             items = list(LineItem.objects.filter(document=doc))
#             pvm_codes = set()
#             vat_percents = set()
#             log.info("pk=%s: recalc items count=%d", pk, len(items))

#             for item in items:
#                 item_vat = item.vat_percent if item.vat_percent is not None else doc.vat_percent
#                 item_vat_norm = _normalize_vat_percent(item_vat)
#                 item_ps = _normalize_ps(item.preke_paslauga)
#                 if item_ps is None:
#                     item_ps = doc_ps

#                 item_pvm = auto_select_pvm_code(
#                     pirkimas_pardavimas=doc.pirkimas_pardavimas,
#                     buyer_country_iso=buyer_iso,
#                     seller_country_iso=seller_iso,
#                     preke_paslauga=item_ps,
#                     vat_percent=item_vat_norm,
#                     separate_vat=bool(doc.separate_vat),
#                     buyer_has_vat_code=buyer_has_vat_code,
#                     seller_has_vat_code=seller_has_vat_code,
#                     doc_96_str=bool(getattr(doc, "doc_96_str", False)),
#                 )

#                 old = item.pvm_kodas
#                 item.pvm_kodas = item_pvm
#                 item.save(update_fields=["pvm_kodas"])
#                 log.info("pk=%s: item[%s] vat=%r ps=%r -> pvm %r (was %r)",
#                          pk, item.id, item_vat_norm, item_ps, item_pvm, old)

#                 if item_pvm is not None: pvm_codes.add(item_pvm)
#                 if item_vat_norm is not None: vat_percents.add(item_vat_norm)

#             if bool(doc.separate_vat):
#                 doc.pvm_kodas = "Keli skirtingi PVM"
#                 doc.vat_percent = None
#                 log.info("pk=%s: separate_vat=True -> doc.pvm_kodas='Keli skirtingi PVM'", pk)
#             else:
#                 if len(pvm_codes) == 1 and len(vat_percents) == 1:
#                     doc.pvm_kodas = next(iter(pvm_codes))
#                     doc.vat_percent = next(iter(vat_percents))
#                     log.info("pk=%s: unified items -> doc.pvm_kodas=%r vat_percent=%r",
#                              pk, doc.pvm_kodas, doc.vat_percent)
#                 else:
#                     doc.pvm_kodas = ""
#                     doc.vat_percent = None
#                     log.info("pk=%s: heterogeneous items -> doc.pvm_kodas cleared", pk)

#         else:
#             # sumiskai / detaliai без строк — документный расчёт
#             doc_pvm = auto_select_pvm_code(
#                 pirkimas_pardavimas=doc.pirkimas_pardavimas,
#                 buyer_country_iso=buyer_iso,
#                 seller_country_iso=seller_iso,
#                 preke_paslauga=doc_ps,
#                 vat_percent=doc_vat_norm,
#                 separate_vat=bool(doc.separate_vat),
#                 buyer_has_vat_code=buyer_has_vat_code,
#                 seller_has_vat_code=seller_has_vat_code,
#                 doc_96_str=bool(getattr(doc, "doc_96_str", False)),
#             )
#             old_doc_pvm = doc.pvm_kodas
#             doc.pvm_kodas = doc_pvm
#             log.info("pk=%s: doc-level recalc -> pvm %r (was %r)", pk, doc_pvm, old_doc_pvm)

#         # 5) Сохранить
#         update_set = {"pirkimas_pardavimas","pvm_kodas","vat_percent"}
#         if hasattr(doc, "buyer_has_vat_code"): update_set.add("buyer_has_vat_code")
#         if hasattr(doc, "seller_has_vat_code"): update_set.add("seller_has_vat_code")

#         doc.save(update_fields=list(update_set))
#         log.info("pk=%s: saved fields=%s", pk, sorted(update_set))

#     # ============ ДОБАВИТЬ ВАЛИДАЦИЮ В КОНЦЕ ============
#     try:
#         # Проверяем изменились ли поля buyer/seller
#         buyer_seller_changed = any(
#             k.startswith(('buyer_', 'seller_')) 
#             for k in request.data.keys()
#         )
        
#         if buyer_seller_changed:
#             is_valid = check_required_fields_for_export(doc)
#             doc.ready_for_export = is_valid
#             doc.save(update_fields=['ready_for_export'])
#             log.info("pk=%s: validated after update, ready_for_export=%s", pk, is_valid)
#     except Exception as e:
#         log.error("pk=%s: validation error: %s", pk, str(e))
#     # =====================================================

#     return Response(ScannedDocumentSerializer(doc).data)





# Udaliajet produkt s doka
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_document_product(request, pk):
    from .models import ScannedDocument
    from .serializers import ScannedDocumentSerializer

    doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
    if not doc:
        return Response({'error': 'Not found'}, status=404)

    # Очищаем только поля товара
    doc.prekes_pavadinimas = ""
    doc.prekes_kodas = ""
    doc.prekes_barkodas = ""
    doc.preke_paslauga = ""
    doc.save(update_fields=["prekes_pavadinimas", "prekes_kodas", "prekes_barkodas", "preke_paslauga"])

    return Response(ScannedDocumentSerializer(doc).data)



# Udaliajet produkt s lineitem
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_lineitem_product(request, pk, lineitem_id):
    from .models import ScannedDocument, LineItem
    from .serializers import LineItemSerializer

    doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
    if not doc:
        return Response({'error': 'Document not found'}, status=404)

    item = LineItem.objects.filter(document=doc, pk=lineitem_id).first()
    if not item:
        return Response({'error': 'Line item not found'}, status=404)

    item.prekes_pavadinimas = ""
    item.prekes_kodas = ""
    item.prekes_barkodas = ""
    item.preke_paslauga = ""
    item.save(update_fields=["prekes_pavadinimas", "prekes_kodas", "prekes_barkodas", "preke_paslauga"])

    return Response(LineItemSerializer(item).data)



@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_view_mode(request):
    """
    PATCH /users/me/view-mode/
    Body: { "view_mode": "single" | "multi" }
    """
    serializer = ViewModeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    request.user.view_mode = serializer.validated_data['view_mode']
    request.user.save(update_fields=['view_mode'])

    return Response({'view_mode': request.user.view_mode}, status=status.HTTP_200_OK)




@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_lineitem_fields(request, doc_id, lineitem_id):
    from .serializers import LineItemSerializer  # убедись, что есть
    doc = get_object_or_404(ScannedDocument, pk=doc_id, user=request.user)
    lineitem = get_object_or_404(LineItem, pk=lineitem_id, document=doc)

    allowed = ['prekes_kodas', 'prekes_pavadinimas', 'prekes_barkodas']
    for field in allowed:
        if field in request.data:
            setattr(lineitem, field, request.data[field])
    lineitem.save()

    return Response(LineItemSerializer(lineitem).data, status=200)





#Autocomplete funkcii

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def autocomplete_products(request):
    query = request.GET.get('q', '').strip()
    qs = ProductAutocomplete.objects.filter(user=request.user)
    if query:
        qs = qs.filter(
            Q(prekes_pavadinimas__icontains=query) |
            Q(prekes_kodas__icontains=query) |
            Q(prekes_barkodas__icontains=query)
        )
    qs = qs.order_by('prekes_pavadinimas')[:30]  # Ограничь 30, чтобы не грузить всё
    data = [
        {
            "id": prod.id,
            "prekes_pavadinimas": prod.prekes_pavadinimas,
            "prekes_kodas": prod.prekes_kodas,
            "prekes_barkodas": prod.prekes_barkodas,
            # добавь нужные поля!
        }
        for prod in qs
    ]
    return Response(data)




@api_view(['GET'])
@permission_classes([IsAuthenticated])
def autocomplete_clients(request):
    query = request.GET.get('q', '').strip()
    qs = ClientAutocomplete.objects.filter(user=request.user)
    if query:
        qs = qs.filter(
            Q(pavadinimas__icontains=query) |
            Q(imones_kodas__icontains=query) |
            Q(pvm_kodas__icontains=query)
        )
    qs = qs.order_by('pavadinimas')[:30]
    data = [
        {
            "id": c.id,
            "pavadinimas": c.pavadinimas,
            "imones_kodas": c.imones_kodas,
            "pvm_kodas": c.pvm_kodas,
            "company_address": c.address,
            "company_country_iso": c.country_iso,
            "company_iban": c.ibans,
            # нужные поля
        }
        for c in qs
    ]
    return Response(data)





























# --- Импорт товаров (products) ---
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_products_view(request):
    file = request.FILES.get('file')
    if not file:
        return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        report = import_products_from_xlsx(request.user, file)
        return Response(report, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# --- Импорт клиентов (clients) ---
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_clients_view(request):
    file = request.FILES.get('file')
    if not file:
        return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        report = import_clients_from_xlsx(request.user, file)
        return Response(report, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)






#Proverka ili obnovlenija default accounting program

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def user_profile(request):
    user = request.user
    if request.method == 'PATCH':
        old_company_code = user.company_code
        serializer = CustomUserSerializer(user, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            new_company_code = serializer.validated_data.get('company_code', old_company_code)

            # Пытаемся найти старую строку по старому company_code
            ca = ClientAutocomplete.objects.filter(
                user=user,
                imones_kodas=old_company_code
            ).first()

            if not ca:
                # Если не нашли — пробуем по новому
                ca = ClientAutocomplete.objects.filter(
                    user=user,
                    imones_kodas=new_company_code
                ).first()

            if not ca:
                # Если всё равно не нашли — создаём новую
                ca = ClientAutocomplete(user=user, imones_kodas=new_company_code)

            # Теперь обновляем все поля:
            ca.pavadinimas = user.company_name
            ca.imones_kodas = new_company_code
            ca.pvm_kodas = user.vat_code
            ca.ibans = user.company_iban
            ca.address = user.company_address
            ca.country_iso = user.company_country_iso
            ca.save()
            
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    serializer = CustomUserSerializer(user)
    return Response(serializer.data)





@api_view(['POST'])
@permission_classes([IsAdminUser])
def update_currency_rates_view(request):
    d = request.data.get('date')
    if d:
        try:
            from datetime import datetime
            d = datetime.strptime(d, '%Y-%m-%d').date()
        except Exception:
            return Response({'error': 'Invalid date'}, status=400)
    else:
        d = date.today()
    count = update_currency_rates(d)
    return Response({'message': f'Updated {count} currency rates for {d}.'})





@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_me_view(request):
    serializer = CustomUserSerializer(request.user)
    return Response(serializer.data)


class TrackAdClickView(generics.CreateAPIView):
    queryset = AdClick.objects.all()
    serializer_class = AdClickSerializer
    permission_classes = [permissions.AllowAny]  # даже гости могут

    def create(self, request, *args, **kwargs):
        user = request.user if request.user.is_authenticated else None
        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT", "")

        ad_click = AdClick.objects.create(
            ad_name=request.data.get("ad_name", "Unknown"),
            user=user,
            ip_address=ip,
            user_agent=ua
        )
        return Response({"status": "ok"})


#Skacivanje Apskaita5 plugina

FILE_PATH = "/var/files/DokSkenas_apskaita5_adapteris.zip"

def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

@api_view(['GET'])
@permission_classes([IsAuthenticated])  # доступ только для авторизованных
def download_apskaita5_adapter(request):
    if not os.path.exists(FILE_PATH):
        raise Http404("Adapter not found")

    resp = FileResponse(open(FILE_PATH, "rb"))
    resp["Content-Type"] = "application/zip"
    resp["Content-Disposition"] = f'attachment; filename="{os.path.basename(FILE_PATH)}"'
    resp["X-Checksum-SHA256"] = _sha256(FILE_PATH)
    return resp




#JWT functions

class CustomTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        
        try:
            response = super().post(request, *args, **kwargs)
            tokens = response.data

            access_token = tokens['access']
            refresh_token = tokens['refresh']

            token = AccessToken(access_token)
            user_id = token['user_id']
            from .models import CustomUser  
            user = CustomUser.objects.get(id=user_id)
            user.last_login = timezone.now()
            user.save(update_fields=['last_login'])

            res = Response()

            res.data = {'success':True}

            res.set_cookie(
                key="access_token",
                value=access_token,
                httponly=True,
                secure=True,
                samesite='Lax',
                path='/'
            )

            res.set_cookie(
                key="refresh_token",
                value=refresh_token,
                httponly=True,
                secure=True,
                samesite='Lax',
                path='/'
            )

            return res


        except:
            return Response({'success':False})


class CustomRefreshTokenView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        try:
            refresh_token = request.COOKIES.get('refresh_token')
            request.data['refresh'] = refresh_token

            response = super().post(request, *args, **kwargs)
            tokens = response.data
            access_token = tokens['access']

            res = Response()
            res.data = {'refreshed': True}

            res.set_cookie(
                key='access_token',
                value=access_token,
                httponly=True,
                secure=True,
                samesite='Lax',
                path='/'
            )

            if 'refresh' in tokens:
                res.set_cookie(
                    key='refresh_token',
                    value=tokens['refresh'],
                    httponly=True,
                    secure=True,
                    samesite='Lax',
                    path='/'
                )

            return res

        except:
            return Response({'refreshed': False})


@api_view(['POST'])
def logout(request):
    try:
        res = Response()
        res.data = {'success':True}
        res.delete_cookie('access_token', path='/', samesite='Lax')
        res.delete_cookie('refresh_token', path='/', samesite='Lax')
        return res
    except:
        return Response({'success':False})
    

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def is_authenticated(request):
    return Response({'authenticated':True})


# Funkcija dlia sozdanija trial

@permission_classes([AllowAny])
def create_trial_subscription(user):
    """
    Создаёт пробную подписку для нового пользователя.
    """
    logger.info(f"Начинаем создание триал-подписки для пользователя: {user.email}")
    try:
        # Устанавливаем триал-подписку
        trial_start_date = timezone.now()
        trial_end_date = trial_start_date + timedelta(days=3000)

        user.subscription_status = 'trial'
        user.subscription_plan = 'trial'
        user.subscription_start_date = trial_start_date
        user.subscription_end_date = trial_end_date
        user.save()

        logger.info(f"Триал-подписка успешно создана для пользователя: {user.email}")
    except Exception as e:
        logger.error(f"Ошибка при создании триал-подписки для пользователя {user.email}: {str(e)}")
        raise e



@api_view(['POST'])
@authentication_classes([])  # Отключение проверки аутентификации
@permission_classes([AllowAny])  # Разрешить всем пользователям доступ к этому эндпоинту
def register(request):
    """
    Регистрация нового пользователя и создание триал-подписки.
    """
    logger.info("Получен запрос на регистрацию нового пользователя.")

    # Удаление cookies с токенами
    if 'access_token' in request.COOKIES:
        logger.info("Удаляем access_token из cookies.")
        del request.COOKIES['access_token']

    if 'refresh_token' in request.COOKIES:
        logger.info("Удаляем refresh_token из cookies.")
        del request.COOKIES['refresh_token']

    try:
        serializer = CustomUserSerializer(data=request.data)
        if serializer.is_valid():
            logger.info("Данные пользователя валидны.")

            # Создаём пользователя
            user = serializer.save()
            logger.info(f"Пользователь {user.email} успешно зарегистрирован.")

            # Устанавливаем default extra_settings
            user.extra_settings = {"fix_delta": 1}
            user.save(update_fields=["extra_settings"])

            # Создаём триал-подписку для нового пользователя
            create_trial_subscription(user)

            # 3️⃣ Ставим welcome email в очередь Celery (после коммита)

            try:
                t0 = perf_counter()
                siusti_sveikinimo_laiska(user)
                t1 = perf_counter()
                logger.info(f"Welcome email išsiųstas vartotojui {user.email} per {t1 - t0:.4f}s (be Celery).")
            except Exception as mail_err:
                logger.exception(f"Nepavyko išsiųsti welcome email be Celery: {mail_err}")

            # try:
            #     t_reg = perf_counter()

            #     def _enqueue():
            #         t0 = perf_counter()
            #         logger.info(f"[ENQUEUE] on_commit fired; start apply_async for {user.email}")
            #         try:
            #             task_siusti_sveikinimo_laiska.apply_async(args=[user.id], ignore_result=True)
            #         finally:
            #             t1 = perf_counter()
            #             logger.info(f"[ENQUEUE] apply_async_time={t1 - t0:.4f}s for {user.email}")

            #     transaction.on_commit(_enqueue)

            #     t_reg_done = perf_counter()
            #     logger.info(f"Queued welcome email for {user.email}. on_commit_registration_time={t_reg_done - t_reg:.4f}s")

            # except Exception as mail_err:
            #     logger.exception(f"Не удалось поставить welcome email в очередь: {mail_err}")

            return Response({
                "message": "Registracija sėkminga!",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "subscription_status": user.subscription_status,
                    "subscription_plan": user.subscription_plan,
                    "subscription_start_date": user.subscription_start_date,
                    "subscription_end_date": user.subscription_end_date
                }
            }, status=201)

        logger.warning(f"Ошибка в данных регистрации: {serializer.errors}")
        return Response(serializer.errors, status=400)

    except Exception as e:
        logger.error(f"Ошибка при регистрации пользователя: {str(e)}")
        return Response({"error": "An error occurred during registration."}, status=500)




# Proveriajem status subscriptiona usera
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_status(request):
    try:
        # Получаем текущего пользователя
        user = request.user

        # Получаем расширенную модель пользователя (CustomUser)
        user_profile = get_object_or_404(CustomUser, pk=user.pk)

        # Вызываем метод get_subscription_status из модели CustomUser
        status = user_profile.get_subscription_status()

        # Возвращаем статус подписки
        return Response({'status': status}, status=200)

    except Exception as e:
        # Обработка ошибок и возврат сообщения
        return Response({'error': str(e)}, status=500)
    




#DLIA SUPERUSEROV!!!:
#1) dlia admin-suvestine


def _ensure_dict(x):
    if x is None:
        return {}
    if isinstance(x, dict):
        return x
    if isinstance(x, str):
        try:
            return json.loads(x)
        except Exception:
            return {}
    return {}


def _ensure_dict(x):
    if x is None:
        return {}
    if isinstance(x, dict):
        return x
    if isinstance(x, str):
        try:
            return json.loads(x)
        except Exception:
            return {}
    return {}

def summarize_doc_issues(doc_struct):
    """
    Возвращает 'error' ТОЛЬКО если overall_status == "FAIL" из финальной математической валидации.
    Это единственный критерий для определения проблемных документов.
    """
    doc = _ensure_dict(doc_struct)

    # ✅ ЕДИНСТВЕННАЯ ПРОВЕРКА: overall_status из финальной валидации
    math_failed = False
    math_badge = None
    validation_type = None
    
    # Проверяем для detaliai (с line_items)
    final_validation = doc.get("_final_math_validation")
    if final_validation:
        overall = final_validation.get("summary", {}).get("overall_status")
        if overall == "FAIL":
            math_failed = True
            math_badge = "MATH✗"
            validation_type = "detaliai"
    
    # Проверяем для sumiskai (без line_items)
    sumiskai_validation = doc.get("_final_math_validation_sumiskai")
    if sumiskai_validation:
        overall = sumiskai_validation.get("overall_status")
        if overall == "FAIL":
            math_failed = True
            math_badge = "MATH✗"
            validation_type = "sumiskai"

    has_error = math_failed

    # --- оформление результата ---
    badges = []
    if math_badge:
        badges.append(math_badge)

    summary = " ".join(badges) if badges else ""
    if validation_type:
        summary = f"{summary} ({validation_type})".strip()

    issue_count = 1 if has_error else 0

    return {
        "has_issues": has_error,
        "severity": "error" if has_error else "ok",
        "issue_badges": " ".join(badges),
        "issue_summary": summary,
        "issue_count": issue_count,
    }

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_documents_with_errors(request):
    """
    Для superuser — документы всех пользователей с ошибками.
    Ошибка = math_validation_passed=False ИЛИ ready_for_export=False
             ИЛИ structured_json._global_validation_log содержит "OVERALL STATUS: FAIL"
    Курсорная пагинация с infinite scroll.
    """
    user = request.user
    if not user.is_superuser:
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    # Только документы с ошибками
    qs = ScannedDocument.objects.select_related('user').filter(
        Q(math_validation_passed=False) | 
        Q(ready_for_export=False) |
        Q(structured_json___global_validation_log__icontains='OVERALL STATUS: FAIL')
    )

    # --- фильтры ---
    status_filter = request.GET.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    # Сортировка
    qs = qs.order_by('-uploaded_at', '-id')

    # --- курсорная пагинация ---
    paginator = DocumentsCursorPagination()
    page = paginator.paginate_queryset(qs, request)

    ser = ScannedDocumentListSerializer(page, many=True)

    # --- обогащение данных ---
    data = []
    for obj, row in zip(page, ser.data):
        r = dict(row)
        r["user_id"] = getattr(obj.user, "id", None)
        r["owner_email"] = getattr(obj.user, "email", None)
        
        # Показываем какая именно ошибка
        badges = []
        if not obj.math_validation_passed:
            badges.append("MATH✗")
        if not obj.ready_for_export:
            badges.append("NOT_READY")
        
        # Проверяем _global_validation_log в structured_json
        structured = obj.structured_json or {}
        validation_log = structured.get('_global_validation_log', '')
        if validation_log and 'OVERALL STATUS: FAIL' in validation_log:
            badges.append("VALIDATION✗")
        
        r["issue_badges"] = " ".join(badges)
        r["issue_has"] = True
        data.append(r)

    return paginator.get_paginated_response(data)

# @api_view(['GET'])
# @permission_classes([IsAuthenticated])
# def admin_documents_with_errors(request):
#     """
#     Для superuser — документы всех пользователей с ошибками.
#     Ошибка = math_validation_passed=False ИЛИ ready_for_export=False
#     Курсорная пагинация с infinite scroll.
#     """
#     user = request.user
#     if not user.is_superuser:
#         return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

#     # Только документы с ошибками
#     qs = ScannedDocument.objects.select_related('user').filter(
#         Q(math_validation_passed=False) | Q(ready_for_export=False)
#     )

#     # --- фильтры ---
#     status_filter = request.GET.get('status')
#     if status_filter:
#         qs = qs.filter(status=status_filter)

#     # Сортировка
#     qs = qs.order_by('-uploaded_at', '-id')

#     # --- курсорная пагинация ---
#     paginator = DocumentsCursorPagination()
#     page = paginator.paginate_queryset(qs, request)

#     ser = ScannedDocumentListSerializer(page, many=True)

#     # --- обогащение данных ---
#     data = []
#     for obj, row in zip(page, ser.data):
#         r = dict(row)
#         r["user_id"] = getattr(obj.user, "id", None)
#         r["owner_email"] = getattr(obj.user, "email", None)
        
#         # Показываем какая именно ошибка
#         badges = []
#         if not obj.math_validation_passed:
#             badges.append("MATH✗")
#         if not obj.ready_for_export:
#             badges.append("NOT_READY")
        
#         r["issue_badges"] = " ".join(badges)
#         r["issue_has"] = True
#         data.append(r)

#     return paginator.get_paginated_response(data)



@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_all_documents(request):
    """
    Для superuser — сводный список ВСЕХ документов всех пользователей.
    Курсорная пагинация с infinite scroll.
    """
    user = request.user
    if not user.is_superuser:
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    qs = ScannedDocument.objects.select_related('user').all()

    # --- фильтры ---
    status_filter = request.GET.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    owner = request.GET.get('owner')
    if owner:
        qs = qs.filter(user__email__icontains=owner)

    from django.utils.dateparse import parse_date
    from datetime import timedelta

    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')

    if date_from:
        d = parse_date(date_from)
        if d:
            qs = qs.filter(uploaded_at__gte=d)

    if date_to:
        d = parse_date(date_to)
        if d:
            qs = qs.filter(uploaded_at__lt=d + timedelta(days=1))

    # --- сортировка (курсорная пагинация требует фиксированный order) ---
    qs = qs.order_by('-uploaded_at', '-id')

    # --- курсорная пагинация ---
    paginator = DocumentsCursorPagination()
    page = paginator.paginate_queryset(qs, request)

    from .serializers import ScannedDocumentListSerializer
    ser = ScannedDocumentListSerializer(page, many=True)

    # --- обогащение данных ---
    data = []
    for obj, row in zip(page, ser.data):
        doc_struct_raw = getattr(obj, 'structured_json', None) or getattr(obj, 'gpt_raw_json', None)
        issues = summarize_doc_issues(doc_struct_raw)

        enriched_row = {
            "user_id": getattr(obj.user, "id", None),
            "owner_email": getattr(obj.user, "email", None),
        }
        enriched_row.update(row)
        enriched_row["issue_has"] = issues["has_issues"]
        enriched_row["issue_badges"] = issues["issue_badges"]
        enriched_row["issue_summary"] = issues["issue_summary"]
        enriched_row["issue_count"] = issues["issue_count"]
        data.append(enriched_row)

    return paginator.get_paginated_response(data)


#3) Dlia users
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_users_simple(request):
    """
    Для superuser — список всех пользователей (CustomUser).
    Курсорная пагинация с infinite scroll.
    """
    if not request.user.is_superuser:
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

    qs = CustomUser.objects.all().order_by("-date_joined", "-id")
    
    # --- фильтры (опционально) ---
    email = request.GET.get('email')
    if email:
        qs = qs.filter(email__icontains=email)
    
    # --- курсорная пагинация ---
    paginator = UsersCursorPagination()
    page = paginator.paginate_queryset(qs, request)
    
    ser = CustomUserAdminListSerializer(page, many=True, context={'request': request})
    return paginator.get_paginated_response(ser.data)



#Wagtail blog
class GuideCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /guides-api/v2/guide-categories/                 -> список категорий
    /guides-api/v2/guide-categories/<slug>/          -> категория + articles[] (детально)
    /guides-api/v2/guide-categories/<slug>/articles/ -> только список статей категории
    """
    permission_classes = [AllowAny]
    lookup_field = "slug"
    queryset = GuideCategoryPage.objects.live().public().order_by("order", "title")

    def get_serializer_class(self):
        # list -> короткий сериализатор
        # retrieve -> детальный (с вложенным массивом статей)
        return (
            GuideCategoryDetailSerializer
            if self.action == "retrieve"
            else GuideCategoryListSerializer
        )

    @action(detail=True, methods=["get"], url_path="articles")
    def articles(self, request, slug=None):
        """
        Вернёт список статей одной категории (удобно для пагинации фронта).
        GET-параметры: ?limit=12&offset=0
        """
        category = self.get_object()

        try:
            limit = int(request.query_params.get("limit", 100))
            offset = int(request.query_params.get("offset", 0))
        except ValueError:
            limit, offset = 100, 0

        qs = (
            GuidePage.objects.child_of(category)
            .live()
            .public()
            .specific()
            .order_by("-first_published_at")
        )
        total = qs.count()
        items = qs[offset : offset + limit]

        data = GuideArticleListSerializer(items, many=True, context={"request": request}).data
        return Response(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "results": data,
            }
        )


class GuideArticleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /guides-api/v2/guides/           -> (опц.) список всех статей (короткие карточки)
    /guides-api/v2/guides/<slug>/    -> детальная статья
    """
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        return GuidePage.objects.live().public().specific()

    def get_serializer_class(self):
        return (
            GuideArticleDetailSerializer
            if self.action == "retrieve"
            else GuideArticleListSerializer
        )


# Update doc and item field in Preview

# --- разрешённые поля ---
ALLOWED_DOC_FIELDS = {
    "invoice_date","due_date","operation_date","document_series","document_number","order_number",
    "amount_wo_vat","vat_amount","vat_percent","amount_with_vat","currency","paid_by_cash",
    "buyer_name","buyer_id","buyer_vat_code","seller_name","seller_id","seller_vat_code",
    "prekes_kodas","prekes_pavadinimas","prekes_barkodas", "invoice_discount_wo_vat", "invoice_discount_with_vat"
}

ALLOWED_LINE_FIELDS = {
    "prekes_kodas","prekes_pavadinimas","prekes_barkodas",
    "unit","quantity","price","subtotal","vat","vat_percent","total",
}

REQUIRED_FIELDS = {
    'invoice_date', 'document_number', 'amount_wo_vat', 'vat_amount', 
    'amount_with_vat', 'currency', 'seller_name', 'seller_vat_code', 
    'buyer_name', 'buyer_vat_code', 'seller_id', 'buyer_id'
}

MATH_FIELDS = {
    'amount_wo_vat', 'vat_amount', 'amount_with_vat', 'vat_percent',
    'invoice_discount_wo_vat', 'invoice_discount_with_vat'
}

LINE_MATH_FIELDS = {
    'quantity', 'price', 'subtotal', 'vat', 'vat_percent', 'total',
    'discount_wo_vat', 'discount_with_vat'
}


class InlineDocUpdateView(APIView):
    permission_classes = [IsOwner]

    def patch(self, request, doc_id):
        doc = get_object_or_404(ScannedDocument, pk=doc_id, user=request.user)
        field = request.data.get("field")
        value = request.data.get("value")

        if field not in ALLOWED_DOC_FIELDS:
            return Response({"detail": "Field not allowed"}, status=400)

        if value in ("", None):
            value = None

        setattr(doc, field, value)
        doc.save(update_fields=[field])

        # Валидация
        response_data = {
            "ok": True,
            "id": doc.id,
            field: getattr(doc, field),
        }
        
        try:
            if field in REQUIRED_FIELDS:
                is_valid = check_required_fields_for_export(doc)
                doc.ready_for_export = is_valid
                response_data['ready_for_export'] = is_valid
            
            if field in MATH_FIELDS:
                is_valid, _ = validate_document_math_for_export(doc)
                doc.math_validation_passed = is_valid
                response_data['math_validation_passed'] = is_valid
            
            if field in REQUIRED_FIELDS or field in MATH_FIELDS:
                update_fields = []
                if field in REQUIRED_FIELDS:
                    update_fields.append('ready_for_export')
                if field in MATH_FIELDS:
                    update_fields.append('math_validation_passed')
                if update_fields:
                    doc.save(update_fields=update_fields)
        except Exception as e:
            logger.error(f"Validation error: {str(e)}")
        
        return Response(response_data)


class InlineLineUpdateView(APIView):
    permission_classes = [IsOwner]

    def patch(self, request, doc_id, line_id):
        doc = get_object_or_404(ScannedDocument, pk=doc_id, user=request.user)
        line = get_object_or_404(LineItem, pk=line_id, document=doc)

        field = request.data.get("field")
        value = request.data.get("value")

        if field not in ALLOWED_LINE_FIELDS:
            return Response({"detail": "Field not allowed"}, status=400)

        if value in ("", None):
            value = None

        setattr(line, field, value)
        line.save(update_fields=[field])

        # Валидация
        response_data = {
            "ok": True,
            "id": line.id,
            field: getattr(line, field),
        }
        
        try:
            if field in LINE_MATH_FIELDS:
                is_valid, _ = validate_document_math_for_export(doc)
                doc.math_validation_passed = is_valid
                doc.save(update_fields=['math_validation_passed'])
                response_data['math_validation_passed'] = is_valid
        except Exception as e:
            logger.error(f"Validation error: {str(e)}")
        
        return Response(response_data)


# Add / delete lineitem in Preview

class ScannedDocumentViewSet(viewsets.ModelViewSet):
    queryset = ScannedDocument.objects.all()
    serializer_class = ScannedDocumentDetailSerializer
    permission_classes = [IsAuthenticated]

    # --- ДОБАВИТЬ ПУСТОЙ LINE ITEM ---
    @action(detail=True, methods=["post"], url_path="add-lineitem")
    def add_lineitem(self, request, pk=None):
        doc = self.get_object()
        line = LineItem.objects.create(document=doc)
        return Response(LineItemSerializer(line).data, status=status.HTTP_201_CREATED)

    # --- УДАЛИТЬ LINE ITEM ---
    @action(detail=True, methods=["delete"], url_path="delete-lineitem/(?P<line_id>[^/.]+)")
    def delete_lineitem(self, request, pk=None, line_id=None):
        doc = self.get_object()
        try:
            line = doc.line_items.get(id=line_id)
            line.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except LineItem.DoesNotExist:
            return Response({"detail": "Line item not found"}, status=status.HTTP_404_NOT_FOUND)
        


# contact email sender
@api_view(["POST"])
@permission_classes([AllowAny])
def contact_form(request):
    vardas  = (request.data.get("name") or "").strip()
    email   = (request.data.get("email") or "").strip()
    zinute  = (request.data.get("message") or "").strip()
    # subject nėra formoje – paliekame None (bus generinė)

    if not vardas or not email or len(zinute) < 10:
        return Response({"detail": "Klaida formoje"}, status=status.HTTP_400_BAD_REQUEST)

    ok = siusti_kontakto_laiska(vardas=vardas, email=email, zinute=zinute, tema=None)
    if ok:
        return Response({"detail": "Žinutė sėkmingai išsiųsta. Ačiū!"})
    return Response({"detail": "Nepavyko išsiųsti žinutės. Pabandykite vėliau."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR)





def send_newsletter():
    text_tpl = (
        "Sveiki,\n\n"
        "🎄 Sveikiname su artėjančiomis Kalėdomis ir Naujaisiais metais!\n\n"
        "Nuoširdžiai dėkojame, kad šiais metais prisidėjote prie DokSkeno starto ir augimo.\n"
        "Jūsų pasitikėjimas mums labai svarbus.\n\n"
        "Kitais metais pažadame DokSkeną padaryti dar patogesnį ir inovatyvesnį.\n\n"
        "Linkime sėkmės darbuose, sklandžių procesų ir puikių rezultatų Naujaisiais metais!\n\n"
        "Su pagarba,\n"
        "DokSkeno komanda\n"
        "Denis"
    )

    siusti_masini_laiska_visiems(
        subject="Sveikinimas iš DokSkeno komandos",
        text_template=text_tpl,
        html_template_name=None,      # ← НЕ используем HTML вообще
        extra_context=None,           # можно опустить
        exclude_user_ids=[46, 2, 16, 24, 31, 69, 105, 133, ],   # кого исключить (опционально)
        tik_aktyviems=True,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_mobile_key(request):
    """
    POST /api/mobile/generate-key/

    Новая версия: создаёт ОТДЕЛЬНЫЙ MobileAccessKey для этого пользователя.

    Ожидает (опционально):
    - email: для какого отправителя (по умолчанию user.email)
    - label: человекопонятное имя (pvz. "Jonas (ofisas)", "Kasa #2")

    НИЧЕГО не шлёт по email – просто генерирует и возвращает.
    """
    user = request.user

    raw_email = (request.data.get("email") or "").strip().lower()
    label = (request.data.get("label") or "").strip()

    if not raw_email:
        # Если email не пришёл – пробуем взять email самого пользователя
        raw_email = (user.email or "").strip().lower()

    if not raw_email:
        return Response({"error": "EMAIL_REQUIRED"}, status=400)

    # создаём MobileAccessKey и получаем raw_key (строка, которую покажем/отправим)
    access_key, raw_key = MobileAccessKey.create_for_user(
        user=user,
        sender_email=raw_email,
        label=label or None,
    )

    play_store_link = build_mobile_play_store_link(raw_key)

    return Response({
        "id": access_key.id,
        "mobile_key": raw_key,          # ПОЛНЫЙ ключ – покажем один раз
        "key_last4": access_key.key_last4,
        "sender_email": access_key.sender_email,
        "label": access_key.label,
        "play_store_link": play_store_link,
    })



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_mobile_invitation(request):
    """
    POST /api/mobile/send-invitation/

    Ожидает:
    - email: получатель приглашения
    - (опционально) label: pvz. "Jonas (ofisas)", "Kasa #2"

    Действия:
    - создаём новый MobileAccessKey для этого email
    - строим Play Store ссылку с этим ключом
    - шлём письмо (siusti_mobilios_apps_kvietima)
    """
    user = request.user

    raw_email = (request.data.get("email") or "").strip().lower()
    label = (request.data.get("label") or "").strip()

    if not raw_email:
        return Response({"error": "EMAIL_REQUIRED"}, status=400)

    # создаём отдельный ключ под этот email
    access_key, raw_key = MobileAccessKey.create_for_user(
        user=user,
        sender_email=raw_email,
        label=label or None,
    )

    play_store_link = build_mobile_play_store_link(raw_key)

    ok = siusti_mobilios_apps_kvietima(
        kvietejas=user,
        gavejo_email=raw_email,
        play_store_link=play_store_link,
        mobile_key=raw_key,  # важный момент: сюда кладём СЫРОЙ ключ
    )

    if not ok:
        return Response(
            {"error": "EMAIL_SEND_FAILED"},
            status=500,
        )

    return Response({
        "status": "OK",
        "email": raw_email,
        "label": access_key.label,
        "key_last4": access_key.key_last4,
        "play_store_link": play_store_link,
        "id": access_key.id,
    })


User = get_user_model()


@api_view(['POST'])
@authentication_classes([])   # авторизация только по мобильному ключу
@permission_classes([AllowAny])
def mobile_upload_documents(request: HttpRequest):
    """
    POST /api/mobile/upload/

    Headers:
      X-Mobile-Key: <pilnas mobilus raktas>

    Body (multipart/form-data):
      files: <pdf1>, files: <pdf2>, ...
      (neprivaloma) sender_email: jei nori perrašyti (dažniausiai nereikės)
    """

    raw_key = (
        request.META.get("HTTP_X_MOBILE_KEY")
        or request.data.get("mobile_key")
    )

    if not raw_key:
        return Response(
            {"error": "MOBILE_KEY_REQUIRED"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    key_hash = MobileAccessKey.make_hash(raw_key)

    try:
        access_key = MobileAccessKey.objects.select_related("user").get(
            key_hash=key_hash,
            is_active=True,
        )
    except MobileAccessKey.DoesNotExist:
        return Response(
            {"error": "INVALID_OR_REVOKED_MOBILE_KEY"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    user = access_key.user

    files = request.FILES.getlist("files")
    if not files:
        return Response(
            {"error": "NO_FILES"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sender_email = request.data.get("sender_email") or access_key.sender_email or None

    access_key.last_used_at = timezone.now()
    access_key.save(update_fields=["last_used_at"])

    created_docs = []
    for f in files:
        doc = MobileInboxDocument.objects.create(
            user=user,
            access_key=access_key,
            uploaded_file=f,
            original_filename=f.name,
            size_bytes=getattr(f, "size", 0) or 0,
            page_count=None,          # page_count v budushchem mozhno budet peredavat iz mobile
            sender_email=sender_email,
            is_processed=False,       # v inbox po umolchaniyu neperenesennyj
        )

        # posle soxranenija u polja uploaded_file uzhe est .url
        doc.preview_url = f"{settings.SITE_URL_BACKEND}{doc.uploaded_file.url}"
        doc.save(update_fields=["preview_url"])

        created_docs.append({
            "id": doc.id,
            "original_filename": doc.original_filename,
            "size_bytes": doc.size_bytes,
            "page_count": doc.page_count,
            "sender_email": doc.sender_email,
            "created_at": doc.created_at.isoformat(),
            # bez URL-ov, kak dogovorilis'
        })

    return Response(
        {
            "status": "OK",
            "count": len(created_docs),
            "documents": created_docs,
        },
        status=status.HTTP_201_CREATED,
    )



@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def mobile_access_keys_list_create(request):
    """
    GET  /api/mobile/keys/   -> sąrašas visų MobileAccessKey šitam user'iui
    POST /api/mobile/keys/   -> sukuria naują MobileAccessKey ir išsiunčia kvietimą el. paštu

    Body (POST):
      - email (required)
      - label (optional)
    """
    user = request.user

    if request.method == "GET":
        qs = MobileAccessKey.objects.filter(user=user).order_by("-created_at")
        serializer = MobileAccessKeySerializer(qs, many=True)
        return Response(serializer.data)

    # POST
    raw_email = (request.data.get("email") or "").strip().lower()
    label = (request.data.get("label") or "").strip()

    if not raw_email:
        return Response({"error": "EMAIL_REQUIRED"}, status=status.HTTP_400_BAD_REQUEST)

    # создаём отдельный ключ под этот email
    access_key, raw_key = MobileAccessKey.create_for_user(
        user=user,
        sender_email=raw_email,
        label=label or None,
    )

    play_store_link = build_mobile_play_store_link(raw_key)

    ok = siusti_mobilios_apps_kvietima(
        kvietejas=user,
        gavejo_email=raw_email,
        play_store_link=play_store_link,
        mobile_key=raw_key,
    )

    if not ok:
        return Response(
            {"error": "EMAIL_SEND_FAILED"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    serializer = MobileAccessKeySerializer(access_key)
    data = serializer.data
    # play_store_link мы можем вернуть только здесь (когда ещё есть raw_key)
    data["play_store_link"] = play_store_link

    return Response(data, status=status.HTTP_201_CREATED)



@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def mobile_access_key_detail(request, pk: int):
    """
    PATCH  /api/mobile/keys/<id>/   -> keičiam is_active (toggle)
    DELETE /api/mobile/keys/<id>/   -> ištrinam raktą

    PATCH body:
      { "is_active": true/false }
    """
    try:
        access_key = MobileAccessKey.objects.get(pk=pk, user=request.user)
    except MobileAccessKey.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        access_key.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH
    new_is_active = request.data.get("is_active", None)

    # поддержим строки "true"/"false" на всякий случай
    if isinstance(new_is_active, str):
        new_is_active = new_is_active.lower() in ("1", "true", "yes", "on")

    if new_is_active is None:
        return Response(
            {"detail": "is_active is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not new_is_active:
        # выключаем аккуратно через метод модели (ставит revoked_at)
        access_key.revoke()
    else:
        # включаем обратно, чистим revoked_at
        if not access_key.is_active:
            access_key.is_active = True
            access_key.revoked_at = None
            access_key.save(update_fields=["is_active", "revoked_at"])

    serializer = MobileAccessKeySerializer(access_key)
    return Response(serializer.data)




@api_view(["GET"])
@permission_classes([IsAuthenticated])
def web_mobile_inbox(request):
    """
    GET /api/web/mobile-inbox/

    Список мобильных документов для текущего пользователя (WEB).
    Курсорная пагинация с infinite scroll.
    """
    user = request.user

    qs = (
        MobileInboxDocument.objects
        .filter(user=user, is_processed=False)
        .select_related("processed_document", "access_key")
        .order_by("-created_at", "-id")
    )

    paginator = MobileInboxCursorPagination()
    page = paginator.paginate_queryset(qs, request)

    serializer = MobileInboxDocumentSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)


#Udaliajem faily s IsKlientu spiska
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def web_mobile_inbox_bulk_delete(request):
    """
    DELETE /api/web/mobile-inbox/bulk-delete/

    Body (JSON):
      { "ids": [1, 2, 3, ...] }

    Удаляет MobileInboxDocument текущего пользователя.
    Логично удалять только те, что ещё не перенесены (is_processed=False).
    """

    user = request.user
    ids = request.data.get("ids") or []

    if not isinstance(ids, list) or not ids:
        return Response(
            {"error": "NO_IDS", "detail": "Pateikite bent vieną ID."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    docs = MobileInboxDocument.objects.filter(
        user=user,
        is_processed=False,
        id__in=ids,
    )

    # Если хочешь чистить и физические файлы – можно так:
    file_paths = []
    for d in docs:
        if d.uploaded_file and d.uploaded_file.name:
            try:
                file_paths.append(d.uploaded_file.path)
            except Exception:
                pass

    deleted_count = docs.count()
    docs.delete()

    # Пытаемся удалить файлы с диска (не критично, если не получится)
    for path in file_paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception:
            continue

    return Response(
        {"status": "OK", "count": deleted_count, "deleted_ids": ids},
        status=status.HTTP_200_OK,
    )


#Perevodim vybranyje faily s IsKlientu v Suvestine (mobile file(original) i preview_url ostajuca)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def web_mobile_inbox_promote(request):
    """
    POST /api/web/mobile-inbox/promote/
    Body: { "ids": [1, 2, 3] }
    """

    user = request.user
    ids = request.data.get("ids") or []

    if not isinstance(ids, list) or not ids:
        return Response(
            {"error": "NO_IDS", "detail": "Pateikite bent vieną ID."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    mobile_docs = (
        MobileInboxDocument.objects
        .filter(user=user, is_processed=False, id__in=ids)
        .select_related("access_key")
    )

    if not mobile_docs.exists():
        return Response(
            {"status": "OK", "count": 0, "processed_ids": []},
            status=status.HTTP_200_OK,
        )

    processed_ids = []
    scan_type = "sumiskai"  # пока фиксированно, как обычный web-upload

    for mobile_doc in mobile_docs:
        if not mobile_doc.uploaded_file:
            continue

        try:
            with transaction.atomic():
                # 1) забираем байты исходного PDF из MobileInboxDocument
                original_file = mobile_doc.uploaded_file
                original_file.open("rb")
                content = original_file.read()
                original_file.close()

                # 2) создаём ScannedDocument с тем же original_filename
                scanned = ScannedDocument(
                    user=user,
                    original_filename=mobile_doc.original_filename,
                    status="processing",
                    scan_type=scan_type,
                )

                # 3) сохраняем КОПИЮ файла (user_upload_path сгенерит своё имя)
                scanned.file.save(
                    original_file.name.split("/")[-1],
                    ContentFile(content),
                    save=True,
                )
                scanned.save()

                # 4) помечаем mobile-док как перенесённый
                mobile_doc.processed_document = scanned
                mobile_doc.processed_at = timezone.now()
                mobile_doc.is_processed = True
                mobile_doc.save(
                    update_fields=["processed_document", "processed_at", "is_processed"]
                )

                # 5) запускаем твой Celery-пайплайн
                process_uploaded_file_task.delay(user.id, scanned.id, scan_type)

                processed_ids.append(mobile_doc.id)

        except Exception as e:
            # логировать можно тут
            continue

    return Response(
        {
            "status": "OK",
            "count": len(processed_ids),
            "processed_ids": processed_ids,
        },
        status=status.HTTP_200_OK,
    )



@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payments_list(request):
    """
    /api/payments/
    Возвращает историю платежей текущего пользователя.
    GET и POST делают одно и то же, чтобы не ломать твой привычный паттерн.
    """
    qs = (
        Payments.objects
        .filter(user=request.user)
        .order_by('-paid_at')
    )

    serializer = PaymentSerializer(
        qs,
        many=True,
        context={'request': request},  # важно для invoice_url в сериализаторе
    )
    return Response(serializer.data)



@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payment_invoice(request, pk):
    """
    /api/payments/<pk>/invoice/
    Dati skirti PDF sąskaitai.
    """
    payment = get_object_or_404(Payments, pk=pk, user=request.user)
    user = request.user  # CustomUser

    # Pardavėjas 
    seller = {
        "pavadinimas": "Denis Orlov - DokSkenas",
        "iv_numeris": "1292165",
        "imonesKodas": "",  
        "pvmKodas": "",
        "adresas": "Kreivasis skg. 18-19, Vilnius",
        "telefonas": "",
        "bankoPavadinimas": "",
        "iban": "",
        "swift": "",
    }

    # Pirkėjas – klientas из CustomUser
    buyer = {
        "pavadinimas": user.company_name or user.email,
        "imonesKodas": user.company_code or "",
        "pvmKodas": user.vat_code or "",
        "adresas": user.company_address or "",
        "telefonas": "",
        "bankoPavadinimas": "",
        "iban": user.company_iban or "",
        "swift": "",
        "salis": user.company_country_iso or "",
    }

    data = {
        "id": payment.id,
        "dok_number": payment.dok_number,
        "paid_at": payment.paid_at,
        "credits_purchased": payment.credits_purchased,
        "net_amount": payment.net_amount,
        "currency": (payment.currency or "EUR").upper(),
        "buyer_email": payment.buyer_email,
        "buyer_address": payment.buyer_address_json,
        "seller": seller,
        "buyer": buyer,
    }

    return Response(data)


#Pagination dlia DocumentsTable

# Optimizacija skorosti zagruzki

def company_key(name, vat, cp_id):
    cp_id = (cp_id or "").strip()
    if cp_id:
        return f"id:{cp_id}"
    vat = (vat or "").strip().lower()
    if vat:
        return vat
    name = (name or "").strip().lower()
    return name


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_user_counterparties(request):
    user = request.user
    q = request.query_params

    status_param = q.get("status")
    date_from = q.get("from")
    date_to = q.get("to")
    search = (q.get("q") or "").strip().lower()
    limit = int(q.get("limit") or 200)

    qs = ScannedDocument.objects.filter(user=user, is_archive_container=False)

    if status_param:
        qs = qs.filter(status=status_param)

    tz = timezone.get_current_timezone()

    if date_from:
        d = parse_date(date_from)
        if d:
            dt_from = timezone.make_aware(datetime.combine(d, time.min), tz)
            qs = qs.filter(uploaded_at__gte=dt_from)

    if date_to:
        d = parse_date(date_to)
        if d:
            dt_to = timezone.make_aware(datetime.combine(d, time.min), tz) + timedelta(days=1)
            qs = qs.filter(uploaded_at__lt=dt_to)

    # агрегируем sellers
    sellers = (
        qs.exclude(seller_name__isnull=True, seller_name__exact="")
          .values("seller_id", "seller_name", "seller_vat_code")
          .annotate(docs_count=Count("id"))
    )

    # агрегируем buyers
    buyers = (
        qs.exclude(buyer_name__isnull=True, buyer_name__exact="")
          .values("buyer_id", "buyer_name", "buyer_vat_code")
          .annotate(docs_count=Count("id"))
    )

    merged = {}

    def upsert(cp_id, name, vat, cnt):
        key = company_key(name, vat, cp_id)
        if not key:
            return
        item = merged.get(key)
        if not item:
            merged[key] = {
                "key": key,
                "id": (cp_id or "").strip() or None,
                "name": name or "",
                "vat": vat or "",
                "docs_count": int(cnt or 0),
            }
        else:
            item["docs_count"] += int(cnt or 0)
            # “улучшаем” данные, если раньше было пусто
            if not item["id"] and cp_id:
                item["id"] = (cp_id or "").strip() or None
            if not item["vat"] and vat:
                item["vat"] = vat or ""
            if not item["name"] and name:
                item["name"] = name or ""

    for r in sellers:
        upsert(r.get("seller_id"), r.get("seller_name"), r.get("seller_vat_code"), r.get("docs_count"))

    for r in buyers:
        upsert(r.get("buyer_id"), r.get("buyer_name"), r.get("buyer_vat_code"), r.get("docs_count"))

    items = list(merged.values())

    # поиск по контрагентам (по имени/ват/id)
    if search:
        def match(it):
            return (
                search in (it.get("name") or "").lower()
                or search in (it.get("vat") or "").lower()
                or search in (it.get("id") or "").lower()
            )
        items = [x for x in items if match(x)]

    items.sort(key=lambda x: (-(x.get("docs_count") or 0), (x.get("name") or "").lower()))
    items = items[:limit]

    ser = CounterpartySerializer(items, many=True)
    return Response({"results": ser.data})




#Создать сессию

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_session(request):
    scan_type = (request.data.get("scan_type") or "sumiskai").strip()
    client_total_files = int(request.data.get("client_total_files") or 0)

    s = UploadSession.objects.create(
        user=request.user,
        scan_type=scan_type,
        stage="uploading",
        client_total_files=max(0, client_total_files),
    )
    return Response({"id": str(s.id), "stage": s.stage})


#Статус сессии (для progress bar)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def session_status(request, session_id):
    s = UploadSession.objects.get(id=session_id, user=request.user)

    return Response({
        "id": str(s.id),
        "stage": s.stage,
        "client_total_files": s.client_total_files,
        "uploaded_files": s.uploaded_files,
        "uploaded_bytes": s.uploaded_bytes,
        "expected_items": s.expected_items,
        "actual_items": s.actual_items,
        "processed_items": s.processed_items,
        "done_items": s.done_items,
        "failed_items": s.failed_items,
        "pending_archives": s.pending_archives,
        "reserved_credits": str(s.reserved_credits),
        "error_message": s.error_message,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    })



#Upload обычных файлов батчами

MAX_BATCH_BYTES = 300 * 1024 * 1024
MAX_BATCH_FILES = 60

ARCHIVE_EXTS = {".zip",".rar",".7z",".tar",".tgz",".tar.gz",".tar.bz2",".tar.xz",".tbz2"}

def _ext(name: str) -> str:
    n = (name or "").lower()
    if n.endswith(".tar.gz"): return ".tar.gz"
    if n.endswith(".tar.bz2"): return ".tar.bz2"
    if n.endswith(".tar.xz"): return ".tar.xz"
    import os
    return os.path.splitext(n)[1]

def _get_archive_format(filename: str) -> str:
    """Определяет формат архива по расширению"""
    lower = filename.lower()
    if lower.endswith('.tar.gz') or lower.endswith('.tgz'):
        return 'tar.gz'
    if lower.endswith('.tar.bz2') or lower.endswith('.tbz2'):
        return 'tar.bz2'
    if lower.endswith('.tar.xz'):
        return 'tar.xz'
    if lower.endswith('.tar'):
        return 'tar'
    if lower.endswith('.zip'):
        return 'zip'
    if lower.endswith('.rar'):
        return 'rar'
    if lower.endswith('.7z'):
        return '7z'
    return ''

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_batch(request, session_id):
    s = UploadSession.objects.get(id=session_id, user=request.user)
    if s.stage not in ("uploading",):
        return Response({"error": "Session is not in uploading stage"}, status=400)

    files = list(request.FILES.getlist("files") or [])
    if not files:
        return Response({"error": "No files"}, status=400)

    if len(files) > MAX_BATCH_FILES:
        return Response({"error": f"Too many files in batch (max {MAX_BATCH_FILES})"}, status=400)

    total_bytes = sum(getattr(f, "size", 0) or 0 for f in files)
    if total_bytes > MAX_BATCH_BYTES:
        return Response({"error": f"Batch too large (max {MAX_BATCH_BYTES} bytes)"}, status=400)

    # запретим архивы тут — архивы только через chunk upload
    for f in files:
        if _ext(f.name) in ARCHIVE_EXTS:
            return Response({"error": "Archives must be uploaded via chunk upload"}, status=400)

    created_ids = []
    with transaction.atomic():
        for idx, f in enumerate(files, start=1):
            doc = ScannedDocument.objects.create(
                user=request.user,
                upload_session=s,
                status="pending",
                original_filename=f.name,
                scan_type=s.scan_type,
                uploaded_size_bytes=int(getattr(f, "size", 0) or 0),
            )
            doc.file.save(f.name, f, save=True)
            created_ids.append(doc.id)

        s.uploaded_files = s.uploaded_files + len(files)
        s.uploaded_bytes = s.uploaded_bytes + int(total_bytes)
        s.save(update_fields=["uploaded_files","uploaded_bytes","updated_at"])

    return Response({"ok": True, "created": len(created_ids)})



#Chunk upload для архивов (ZIP/RAR/7Z/TAR), max 2GB

MAX_ARCHIVE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chunk_init(request, session_id):
    s = UploadSession.objects.get(id=session_id, user=request.user)
    if s.stage != "uploading":
        return Response({"error":"Session not uploading"}, status=400)

    filename = (request.data.get("filename") or "").strip()
    total_size = int(request.data.get("total_size") or 0)
    chunk_size = int(request.data.get("chunk_size") or 0)
    total_chunks = int(request.data.get("total_chunks") or 0)

    if not filename or total_size <= 0 or chunk_size <= 0 or total_chunks <= 0:
        return Response({"error":"Bad init params"}, status=400)

    if total_size > MAX_ARCHIVE_SIZE:
        return Response({"error":"Archive too large (max 2GB)"}, status=400)

    if _ext(filename) not in ARCHIVE_EXTS:
        return Response({"error":"Not an archive filename"}, status=400)

    # создаём tmp file path
    import os, tempfile
    tmp_dir = os.path.join(tempfile.gettempdir(), "doksken_chunks")
    os.makedirs(tmp_dir, exist_ok=True)

    cu = ChunkedUpload.objects.create(
        user=request.user,
        session=s,
        filename=filename,
        total_size=total_size,
        chunk_size=chunk_size,
        total_chunks=total_chunks,
        received=[],
        status="uploading",
        tmp_path=os.path.join(tmp_dir, f"{uuid.uuid4().hex}.part"),
    )

    return Response({"upload_id": str(cu.id)})


#upload chunk

@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def upload_chunk(request, session_id, upload_id, index):
    s = UploadSession.objects.get(id=session_id, user=request.user)
    cu = ChunkedUpload.objects.get(id=upload_id, user=request.user, session=s)

    if cu.status != "uploading":
        return Response({"error":"Not uploading"}, status=400)

    index = int(index)
    if index < 0 or index >= cu.total_chunks:
        return Response({"error":"Bad index"}, status=400)

    data = request.body or b""
    if not data:
        return Response({"error":"Empty chunk"}, status=400)

    # проверки размера чанка
    is_last = (index == cu.total_chunks - 1)
    if not is_last and len(data) != cu.chunk_size:
        return Response({"error":"Bad chunk size"}, status=400)
    if is_last and len(data) > cu.chunk_size:
        return Response({"error":"Bad last chunk size"}, status=400)

    offset = index * cu.chunk_size
    if offset + len(data) > cu.total_size:
        return Response({"error":"Out of bounds"}, status=400)

    # пишем по смещению
    import os
    os.makedirs(os.path.dirname(cu.tmp_path), exist_ok=True)
    with open(cu.tmp_path, "ab") as f:
        pass  # ensure file exists
    with open(cu.tmp_path, "r+b") as f:
        f.seek(offset)
        f.write(data)

    # отметить чанк полученным (атомарно)
    with transaction.atomic():
        cu = ChunkedUpload.objects.select_for_update().get(id=cu.id)
        got = set(cu.received or [])
        if index not in got:
            got.add(index)
            cu.received = sorted(got)
            cu.save(update_fields=["received","updated_at"])

        received_count = len(cu.received)

    return Response({"ok": True, "received": received_count, "total": cu.total_chunks})



#status (resume)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def chunk_status(request, session_id, upload_id):
    s = UploadSession.objects.get(id=session_id, user=request.user)
    cu = ChunkedUpload.objects.get(id=upload_id, user=request.user, session=s)
    return Response({
        "upload_id": str(cu.id),
        "status": cu.status,
        "received": cu.received,
        "total_chunks": cu.total_chunks,
    })


#complete → создать архив-контейнер ScannedDocument

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chunk_complete(request, session_id, upload_id):
    s = UploadSession.objects.get(id=session_id, user=request.user)
    cu = ChunkedUpload.objects.get(id=upload_id, user=request.user, session=s)

    if cu.status != "uploading":
        return Response({"error":"Bad state"}, status=400)

    got = set(cu.received or [])
    if len(got) != cu.total_chunks:
        return Response({"error":"Not all chunks uploaded"}, status=400)

    if not os.path.exists(cu.tmp_path):
        return Response({"error":"Missing tmp file"}, status=400)

    if os.path.getsize(cu.tmp_path) != cu.total_size:
        return Response({"error":"Size mismatch"}, status=400)

    # НОВОЕ: определяем формат архива
    archive_fmt = _get_archive_format(cu.filename)

    # атомарно создаём архив-документ
    with transaction.atomic():
        # пометим upload complete
        cu.status = "complete"
        cu.save(update_fields=["status","updated_at"])

        # создаём ScannedDocument container
        doc = ScannedDocument.objects.create(
            user=request.user,
            upload_session=s,
            status="pending",
            original_filename=cu.filename,
            scan_type=s.scan_type,
            is_archive_container=True,
            uploaded_size_bytes=cu.total_size,
        )

        # переносим tmp файл в FileField (через open)
        with open(cu.tmp_path, "rb") as fp:
            doc.file.save(cu.filename, File(fp), save=True)

        # счётчики upload
        s.uploaded_files = s.uploaded_files + 1
        s.uploaded_bytes = s.uploaded_bytes + int(cu.total_size)
        
        # НОВОЕ: сохраняем формат архива в сессии
        if archive_fmt:
            current_formats = s.archive_formats or []
            if archive_fmt not in current_formats:
                current_formats.append(archive_fmt)
            s.archive_formats = current_formats

        s.save(update_fields=["uploaded_files", "uploaded_bytes", "archive_formats", "updated_at"])

    # можно удалить tmp_path после успешного save (если storage локальный)
    try:
        os.remove(cu.tmp_path)
    except Exception:
        pass

    return Response({"ok": True, "doc_id": doc.id})


###Finalize: reserve credits + поставить в queued/processing

#Подсчёт expected_items

COST = {"sumiskai": Decimal("1.00"), "detaliai": Decimal("1.30")}

def compute_expected_items(session: UploadSession) -> int:
    # обычные файлы
    base = ScannedDocument.objects.filter(upload_session=session, is_archive_container=False).count()

    # архивы (минимальный preflight)
    archives = ScannedDocument.objects.filter(upload_session=session, is_archive_container=True)
    total_inside = 0

    for a in archives:
        path = a.file.path
        ext = _ext(a.original_filename)

        if ext == ".zip":
            with zipfile.ZipFile(path) as zf:
                for zi in zf.infolist():
                    if zi.is_dir(): 
                        continue
                    name = zi.filename
                    if not name: 
                        continue
                    total_inside += 1

        elif ext in {".tar", ".tgz", ".tar.gz", ".tar.bz2", ".tar.xz", ".tbz2"}:
            with tarfile.open(path, mode="r:*") as tf:
                for m in tf.getmembers():
                    if not m.isfile():
                        continue
                    total_inside += 1

        elif ext == ".7z":
            try:
                import py7zr
                with py7zr.SevenZipFile(path, mode='r') as sz:
                    for name in sz.getnames():
                        if not name.endswith('/'):
                            total_inside += 1
            except Exception as e:
                logger.warning(f"Failed to read 7z archive {a.original_filename}: {e}")
                total_inside += 1  # fallback

        elif ext == ".rar":
            try:
                import rarfile
                with rarfile.RarFile(path) as rf:
                    for ri in rf.infolist():
                        if ri.isdir():
                            continue
                        total_inside += 1
            except Exception as e:
                logger.warning(f"Failed to read rar archive {a.original_filename}: {e}")
                total_inside += 1  # fallback

        else:
            # Неизвестный архив — считаем как 1 (безопаснее чем 0)
            total_inside += 1

    return base + total_inside

# def compute_expected_items(session: UploadSession) -> int:
#     # обычные файлы
#     base = ScannedDocument.objects.filter(upload_session=session, is_archive_container=False).count()

#     # архивы (минимальный preflight)
#     archives = ScannedDocument.objects.filter(upload_session=session, is_archive_container=True)
#     total_inside = 0

#     for a in archives:
#         path = a.file.path  # если storage не локальный — надо будет иначе
#         ext = _ext(a.original_filename)

#         if ext == ".zip":
#             with zipfile.ZipFile(path) as zf:
#                 for zi in zf.infolist():
#                     if zi.is_dir(): 
#                         continue
#                     name = zi.filename
#                     if not name: 
#                         continue
#                     # можно тут пропускать __MACOSX/Thumbs.db и т.п.
#                     total_inside += 1

#         elif ext in {".tar",".tgz",".tar.gz",".tar.bz2",".tar.xz",".tbz2"}:
#             with tarfile.open(path, mode="r:*") as tf:
#                 for m in tf.getmembers():
#                     if not m.isfile():
#                         continue
#                     total_inside += 1

#         else:
#             # RAR/7Z: если хочешь пока без preflight — можно вернуть 0 и обрабатывать позже
#             # но ты выбрал reserved_credits -> лучше добавить позже поддержку
#             total_inside += 0

#     return base + total_inside



#reserve + stage

@transaction.atomic
def reserve_and_queue(session_id, user_id):
    s = UploadSession.objects.select_for_update().get(id=session_id, user_id=user_id)
    u = CustomUser.objects.select_for_update().get(id=user_id)

    if s.stage not in ("uploading", "credit_check"):
        return s

    s.stage = "credit_check"
    s.save(update_fields=["stage","updated_at"])

    expected = compute_expected_items(s)
    s.expected_items = expected
    s.reserved_items = expected

    cost = COST.get(s.scan_type, Decimal("1.00"))
    needed = cost * Decimal(expected)

    available = (u.credits or Decimal("0")) - (u.credits_reserved or Decimal("0"))
    if available < needed:
        s.stage = "blocked"
        s.error_message = f"Nepakanka kreditų. Turite: {available:.0f} | Reikia: {needed:.0f}"
        s.reserved_credits = Decimal("0.00")
        s.save(update_fields=["stage","error_message","expected_items","reserved_items","reserved_credits","updated_at"])
        return s

    # reserve
    u.credits_reserved = (u.credits_reserved or Decimal("0")) + needed
    u.save(update_fields=["credits_reserved"])

    s.reserved_credits = needed

    has_processing = UploadSession.objects.filter(user_id=u.id, stage="processing").exists()
    s.stage = "queued" if has_processing else "processing"
    if s.stage == "processing" and not s.started_at:
        s.started_at = timezone.now()

    s.save(update_fields=["stage","expected_items","reserved_items","reserved_credits","started_at","updated_at"])
    return s



#finalize endpoint

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def finalize_session(request, session_id):
    try:
        s = UploadSession.objects.get(id=session_id, user=request.user)
    except UploadSession.DoesNotExist:
        return Response({"error": "Session not found"}, status=404)
    
    if s.stage not in ("uploading", "credit_check"):
        return Response({
            "id": str(s.id),
            "stage": s.stage,
            "error": "Session already finalized"
        }, status=400)
    
    # Проверить что есть файлы
    docs_count = ScannedDocument.objects.filter(upload_session=s).count()
    if docs_count == 0:
        return Response({"error": "No files uploaded"}, status=400)
    
    s = reserve_and_queue(session_id, request.user.id)
    
    if s.stage == "processing":
        start_session_processing.delay(str(s.id))
    
    return Response({
        "id": str(s.id),
        "stage": s.stage,
        "expected_items": s.expected_items,
        "reserved_credits": str(s.reserved_credits),
        "error_message": s.error_message or None,
    })



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def active_sessions(request):
    """Получить все активные сессии пользователя + недавно завершённые"""
    now = timezone.now()
    
    # Активные сессии
    active_qs = UploadSession.objects.filter(
        user=request.user,
        stage__in=["processing", "queued", "credit_check"]
    )
    
    # Недавно завершённые (за последние 10 секунд) — чтобы показать финальный статус
    recently_done_qs = UploadSession.objects.filter(
        user=request.user,
        stage="done",
        finished_at__gte=now - timedelta(seconds=10)
    )
    
    sessions = list(active_qs) + list(recently_done_qs)
    sessions.sort(key=lambda s: s.created_at)
    
    result = []
    for s in sessions:
        result.append({
            "id": str(s.id),
            "stage": s.stage,
            "scan_type": s.scan_type,
            "uploaded_files": s.uploaded_files,
            "expected_items": s.expected_items,
            "actual_items": s.actual_items,
            "processed_items": s.processed_items,
            "done_items": s.done_items,
            "failed_items": s.failed_items,
            "created_at": s.created_at.isoformat(),
            "finished_at": s.finished_at.isoformat() if s.finished_at else None,
        })
    
    return Response({"sessions": result})



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def swap_buyer_seller(request, pk):
    """
    Меняет местами данные buyer и seller.
    - Обычный юзер может менять только свои документы
    - Superuser может менять документы любого юзера
    """
    try:
        doc = ScannedDocument.objects.get(pk=pk)
    except ScannedDocument.DoesNotExist:
        return Response({'error': 'Dokumentas nerastas.'}, status=status.HTTP_404_NOT_FOUND)
    
    # Проверка прав: либо владелец, либо superuser
    if doc.user != request.user and not request.user.is_superuser:
        return Response(
            {'error': 'Neturite teisės keisti šio dokumento.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Swap всех полей
    swap_pairs = [
        ('seller_id_programoje', 'buyer_id_programoje'),
        ('seller_id', 'buyer_id'),
        ('seller_name', 'buyer_name'),
        ('seller_vat_code', 'buyer_vat_code'),
        ('seller_address', 'buyer_address'),
        ('seller_country', 'buyer_country'),
        ('seller_country_iso', 'buyer_country_iso'),
        ('seller_iban', 'buyer_iban'),
        ('seller_is_person', 'buyer_is_person'),
        ('seller_name_normalized', 'buyer_name_normalized'),
        ('seller_vat_val', 'buyer_vat_val'),
    ]
    
    for seller_field, buyer_field in swap_pairs:
        seller_val = getattr(doc, seller_field)
        buyer_val = getattr(doc, buyer_field)
        setattr(doc, seller_field, buyer_val)
        setattr(doc, buyer_field, seller_val)
    
    doc.save()
    
    return Response({
        'success': True,
        'seller_name': doc.seller_name,
        'buyer_name': doc.buyer_name,
    })
