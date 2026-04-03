# --- Standard library ---
import hashlib
import io
import logging
import logging.config
import os
import uuid
import re
import tempfile
import zipfile, tarfile
import json
from datetime import date, datetime, timedelta, time as dt_time
from decimal import Decimal
import unicodedata
from django.http import HttpRequest
from django.contrib.auth import get_user_model
import openpyxl
from django.conf import settings as django_settings
from django.http import FileResponse
from django.db import models

from django.core.files.base import ContentFile
from .tasks import process_uploaded_file_task 

from .tasks import start_session_processing, export_to_optimum_task, export_to_dineta_task, export_to_rivile_gama_api_task


from rest_framework.parsers import MultiPartParser, FormParser
from django.utils.dateparse import parse_date
from .serializers import ScannedDocumentListSerializer
from .pagination import DocumentsCursorPagination, UsersCursorPagination, MobileInboxCursorPagination, LineItemPagination


import hmac
from .utils.file_converter import SUPPORTED_EXTS
from django.views.decorators.http import require_POST

from .utils.invoice_pdf import save_invoice_pdf


# --- Django ---
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404, HttpResponse, HttpResponseForbidden, JsonResponse
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
from .exports.stekas import export_documents_group_to_stekas_files
from .exports.apsa import export_to_apsa
from .exports.dineta import dineta_hello, DinetaError
from .exports.optimum import optimum_hello, OptimumError
from .utils.password_encryption import decrypt_password
from .utils.password_encryption import encrypt_password
from .exports.rivile_gama_api import verify_api_key


from .exports.pragma4 import export_to_pragma40_xml
from .exports.pragma3 import export_to_pragma_full, save_pragma_export_to_files
from .exports.butent import export_to_butent
from .exports.site_pro import export_to_site_pro
from .exports.debetas import export_to_debetas
from .validators.required_fields_checker import check_required_fields_for_export
from .validators.math_validator_for_export import validate_document_math_for_export
from .exports.formatters import COUNTRY_NAME_LT


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
    MeasurementUnit,
    InvoiceSeries,
    Product,
    RecurringInvoice,
    Invoice,
    InvoiceEmail,
    InvoiceSettings,
    CreditUsageLog,
    InvSubscription,
    RivileGamaAPIKey,
    PaymentAllocation,
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
    InvoiceSeriesSerializer,
    MeasurementUnitSerializer,
    ProductListSerializer,
    ProductSerializer,
    RecurringInvoiceListSerializer,
    RecurringInvoiceDetailSerializer,
    RecurringInvoiceWriteSerializer,
    RivileGamaAPIKeySerializer,
    RivileGamaAPIKeyCreateSerializer,
    RivileGamaAPIKeyUpdateSerializer,
    InvoiceAdminListSerializer,
    RecurringInvoiceAdminListSerializer,
)
from django.db.models import Prefetch
from django.db.models import Count, Sum

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
    start = timezone.make_aware(datetime.combine(target_date, dt_time.min))
    end = timezone.make_aware(datetime.combine(target_date, dt_time.max))
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

def _payments_agg(qs):
    r = qs.aggregate(
        total_eur=Sum('amount_total'),
        net_eur=Sum('net_amount'),
        count=Count('id'),
    )
    return {
        "total_eur": round((r['total_eur'] or 0) / 100, 2),
        "net_eur":   round((r['net_eur'] or 0) / 100, 2),
        "count":     r['count'] or 0,
    }

def _invoice_count_by_date(date_val):
    """Считает выставленные счета за дату (status != draft)"""
    start = timezone.make_aware(datetime.combine(date_val, dt_time.min))
    end = timezone.make_aware(datetime.combine(date_val, dt_time.max))
    return Invoice.objects.filter(
        created_at__range=(start, end)
    ).exclude(status="draft").count()

def _invoice_count_last_n_days(n):
    since = timezone.now() - timedelta(days=n)
    return Invoice.objects.filter(created_at__gte=since).exclude(status="draft").count()

def _invoice_count_total():
    return Invoice.objects.exclude(status="draft").count()

def _email_stats_by_date(date_val):
    """Возвращает {'sent': X, 'failed': Y} за дату"""
    start = timezone.make_aware(datetime.combine(date_val, dt_time.min))
    end = timezone.make_aware(datetime.combine(date_val, dt_time.max))
    qs = InvoiceEmail.objects.filter(sent_at__range=(start, end))
    return {
        "sent": qs.filter(status="sent").count(),
        "failed": qs.filter(status__in=["failed", "bounced"]).count(),
    }

def _email_stats_last_n_days(n):
    since = timezone.now() - timedelta(days=n)
    qs = InvoiceEmail.objects.filter(sent_at__gte=since)
    return {
        "sent": qs.filter(status="sent").count(),
        "failed": qs.filter(status__in=["failed", "bounced"]).count(),
    }

def _email_stats_total():
    qs = InvoiceEmail.objects.all()
    return {
        "sent": qs.filter(status="sent").count(),
        "failed": qs.filter(status__in=["failed", "bounced"]).count(),
    }

def _inv_subscription_stats():
    """Статистика подписок Išrašymas"""
    now = timezone.now()
    
    # Активные триалы (status=trial И trial_end ещё не прошёл)
    trial_active = InvSubscription.objects.filter(
        status="trial",
        trial_end__gte=now
    ).count()
    
    # Завершённые триалы (trial_used=True И (status != trial ИЛИ trial_end < now))
    trial_expired = InvSubscription.objects.filter(
        trial_used=True
    ).exclude(
        status="trial",
        trial_end__gte=now
    ).count()
    
    # Платные подписки
    paid_monthly = InvSubscription.objects.filter(
        status="active",
        plan__icontains="monthly"
    ).count()
    
    paid_yearly = InvSubscription.objects.filter(
        status="active",
        plan__icontains="yearly"
    ).count()
    
    return {
        "trial_active": trial_active,
        "trial_expired": trial_expired,
        "paid_monthly": paid_monthly,
        "paid_yearly": paid_yearly,
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
    start_today = timezone.make_aware(datetime.combine(today, dt_time.min))
    end_today   = timezone.make_aware(datetime.combine(today, dt_time.max))
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

    # Payments статистика
    pay_base = Payments.objects.filter(payment_status='paid')

    start_today = timezone.make_aware(datetime.combine(today, dt_time.min))
    end_today   = timezone.make_aware(datetime.combine(today, dt_time.max))
    start_yest  = timezone.make_aware(datetime.combine(yesterday, dt_time.min))
    end_yest    = timezone.make_aware(datetime.combine(yesterday, dt_time.max))

    week_start  = today - timedelta(days=today.weekday())  # Понедельник текущей недели
    month_start = today.replace(day=1)

    pay_today      = _payments_agg(pay_base.filter(paid_at__range=(start_today, end_today)))
    pay_yesterday  = _payments_agg(pay_base.filter(paid_at__range=(start_yest, end_yest)))
    pay_this_week  = _payments_agg(pay_base.filter(paid_at__gte=timezone.make_aware(datetime.combine(week_start, dt_time.min))))
    pay_this_month = _payments_agg(pay_base.filter(paid_at__gte=timezone.make_aware(datetime.combine(month_start, dt_time.min))))
    pay_30d        = _payments_agg(pay_base.filter(paid_at__gte=timezone.now() - timedelta(days=30)))
    pay_total      = _payments_agg(pay_base)

    # ========== Išrašymas stats ==========
    inv_today = _invoice_count_by_date(today)
    inv_yesterday = _invoice_count_by_date(yesterday)
    inv_7d = _invoice_count_last_n_days(7)
    inv_30d = _invoice_count_last_n_days(30)
    inv_total = _invoice_count_total()

    inv_subs = _inv_subscription_stats()

    email_today = _email_stats_by_date(today)
    email_yesterday = _email_stats_by_date(yesterday)
    email_7d = _email_stats_last_n_days(7)
    email_30d = _email_stats_last_n_days(30)
    email_total = _email_stats_total()

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
        "payments": {
            "today":       pay_today,
            "yesterday":   pay_yesterday,
            "this_week":   pay_this_week,
            "this_month":  pay_this_month,
            "last_30_days":pay_30d,
            "total":       pay_total,
        },
        "israsymas": {
            "invoices": {
                "today": inv_today,
                "yesterday": inv_yesterday,
                "last_7_days": inv_7d,
                "last_30_days": inv_30d,
                "total": inv_total,
            },
            "subscriptions": inv_subs,
            "emails": {
                "today": email_today,
                "yesterday": email_yesterday,
                "last_7_days": email_7d,
                "last_30_days": email_30d,
                "total": email_total,
            },
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

    source = (request.data.get("source") or "scanned").strip().lower()
    user = request.user                          
    export_type = str(export_type).lower() 
    today_str = date.today().strftime('%Y-%m-%d')  
    inv_sub = None
    inv_usage = None    

    logger.info("[EXP] start user=%s export_type_raw=%r ids=%s raw_overrides=%r mode_raw=%r",
                log_ctx["user"], export_type, ids, raw_overrides, mode_raw)
    
    if source == "invoice":
        from docscanner_app.models import Invoice
        from docscanner_app.utils.invoice_export_adapter import adapt_invoices_for_export

        if not ids:
            return Response({"error": "No invoice ids provided"}, status=400)

        invoices = Invoice.objects.filter(
            pk__in=ids, user=user
        ).prefetch_related("line_items")

        if not invoices.exists():
            return Response({"error": "No invoices found"}, status=404)

        # --- Block isankstine and kreditine ---
        blocked = invoices.filter(invoice_type__in=["isankstine", "kreditine"])
        if blocked.exists():
            blocked_types = list(
                blocked.values_list("invoice_type", flat=True).distinct()
            )
            msgs = []
            if "isankstine" in blocked_types:
                msgs.append(
                    "Isankstines saskaitos negali buti eksportuojamos. "
                    "Konvertuokite i SF arba PVM SF."
                )
            if "kreditine" in blocked_types:
                msgs.append(
                    "Kreditiniu saskaitu eksportas kol kas nepalaikomas."
                )
            return Response({"error": " ".join(msgs)}, status=400)

        # --- Only issued/sent/paid ---
        not_ready = invoices.exclude(status__in=["issued", "sent", "paid"])
        if not_ready.exists():
            return Response(
                {"error": "Galima eksportuoti tik israsytas saskaitas."},
                status=400,
            )

        # --- Inv subscription: export limit check ---
        inv_sub = None
        inv_usage = None
        try:
            from .models import InvSubscription, InvMonthlyUsage
            inv_sub = InvSubscription.objects.filter(user=user).first()
            if inv_sub:
                inv_sub.check_and_expire()
                if inv_sub.status == "free":
                    inv_usage = InvMonthlyUsage.get_current(user)
                    new_ids = [inv.pk for inv in invoices if inv.pk not in inv_usage.exported_invoice_ids]
                    slots_left = 10 - inv_usage.exports_used
                    if len(new_ids) > slots_left:
                        return Response({
                            "error": "limit_reached",
                            "feature": "export",
                            "message": (
                                f"Mėnesio eksporto limitas: {inv_usage.exports_used}/10 panaudota. "
                                f"Bandote eksportuoti {len(new_ids)} naujų sąskaitų, "
                                f"bet liko tik {max(0, slots_left)} eksportų."
                            ),
                            "exports_used": inv_usage.exports_used,
                            "exports_max": 10,
                        }, status=403)
        except Exception as e:
            logger.warning("[EXP] inv subscription check failed: %s", e)

        # --- Adapt for exporters ---
        adapted = adapt_invoices_for_export(invoices, user=user)

        pirkimai_docs = []
        pardavimai_docs = adapted
        unknown_docs = []

        documents = pardavimai_docs

        logger.info(
            "[EXP] INVOICE source: %d invoices for export_type=%s",
            len(adapted), export_type,
        )

    else:
    
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
                    dt_from = timezone.make_aware(datetime.combine(d, dt_time.min), tz)
                    qs = qs.filter(uploaded_at__gte=dt_from)

            if date_to:
                d = parse_date(date_to)
                if d:
                    dt_to = timezone.make_aware(datetime.combine(d, dt_time.min), tz) + timedelta(days=1)
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

        # user = request.user
        # export_type = str(export_type).lower()

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

        # today_str = date.today().strftime('%Y-%m-%d')

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

    if source == "invoice":
        prepared = {
            "pirkimai": [],
            "pardavimai": [
                {"doc": d, "direction": "pardavimas"}
                for d in pardavimai_docs
            ],
            "unknown": [],
        }

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
            xml_bytes = export_documents_group_to_centras_xml(
                pirkimai_docs, 
                direction="pirkimas",
                user=request.user,
                own_company_code=cp_key,
            )
            files_to_export.append((f"{today_str}_pirkimai.xml", xml_bytes))
            
        if pardavimai_docs:
            logger.info("[EXP] CENTAS exporting pardavimai: %d docs", len(pardavimai_docs))
            xml_bytes = export_documents_group_to_centras_xml(
                pardavimai_docs, 
                direction="pardavimas",
                user=request.user  ,
                own_company_code=cp_key,
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
            pirkimai_xml = export_pirkimai_group_to_rivile(pirkimai_docs, request.user, own_company_code=cp_key)
            files_to_export.append(('pirkimai.eip', pirkimai_xml))

        # 3) ПАРДАВИМАИ (I06/I07)
        if pardavimai_docs:
            logger.info("[EXP] RIVILE exporting pardavimai: %d docs", len(pardavimai_docs))
            pardavimai_xml = export_pardavimai_group_to_rivile(pardavimai_docs, request.user, own_company_code=cp_key)
            files_to_export.append(('pardavimai.eip', pardavimai_xml))

        # 4) N17/N25 - ИЗМЕНЕНО: передаём request.user
        prekes_xml, paslaugos_xml, kodai_xml = export_prekes_paslaugos_kodai_group_to_rivile(
            documents, 
            request.user,
            own_company_code=cp_key, 
        )
        if prekes_xml and prekes_xml.strip():
            files_to_export.append(('prekes.eip', prekes_xml))
        if paslaugos_xml and paslaugos_xml.strip():
            files_to_export.append(('paslaugos.eip', paslaugos_xml))
        if kodai_xml and kodai_xml.strip():
            files_to_export.append(('kodai.eip', kodai_xml))

        logger.info("[EXP] RIVILE files_to_export=%s", [n for n, _ in files_to_export])

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

    # ========================= RIVILE GAMA API =========================

    elif export_type == "rivile_gama_api":
        from .models import RivileGamaAPIKey, ExportSession

        assign_random_prekes_kodai(documents)

        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])
        if not all_docs:
            logger.warning("[EXP] RIVILE_GAMA_API no documents to export")
            return Response({"error": "No documents to export"}, status=400)

        # --- Определяем company_code для поиска API ключа ---
        if source == "invoice":
            # Išrašymas: одна фирма, данные из профиля
            own_company_code = str(getattr(user, "company_code", "") or "").strip()
        elif cp_key:
            # Skaitmenizavimas multi: cp_key = своя фирма
            cp = cp_key.strip()
            own_company_code = cp.split(":", 1)[1].strip() if cp.lower().startswith("id:") else cp
        else:
            # Skaitmenizavimas single: fallback на user.company_code
            own_company_code = str(getattr(user, "company_code", "") or "").strip()

        logger.info(
            "[EXP] RIVILE_GAMA_API source=%s cp_key=%r own_company=%s",
            source, cp_key, own_company_code,
        )

        # --- Ищем API ключ ---
        api_key_obj = (
            RivileGamaAPIKey.objects
            .filter(user=user, company_code=own_company_code, is_active=True)
            .first()
        )

        # Fallback: если один ключ — используем его
        if not api_key_obj:
            active_keys = RivileGamaAPIKey.objects.filter(user=user, is_active=True)
            if active_keys.count() == 1:
                api_key_obj = active_keys.first()
                logger.info(
                    "[EXP] RIVILE_GAMA_API fallback to single key=%s (wanted=%s)",
                    api_key_obj.company_code, own_company_code,
                )

        if not api_key_obj:
            return JsonResponse(
                {"error": f"Rivile GAMA API raktas nerastas įmonei {own_company_code}. "
                          "Pridėkite raktą Nustatymuose."},
                status=400,
            )

        doc_ids = [d.pk for d in all_docs]

        # --- ExportSession + Celery ---
        session_obj = ExportSession.objects.create(
            user=user,
            program="rivile_gama_api",
            stage=ExportSession.Stage.QUEUED,
            total_documents=len(doc_ids),
        )
        session_obj.documents.set(doc_ids)

        task = export_to_rivile_gama_api_task.delay(
            session_obj.id,
            api_key_obj.pk,
            own_company_code,
        )
        session_obj.task_id = task.id
        session_obj.save(update_fields=["task_id"])

        logger.info(
            "[EXP] RIVILE_GAMA_API session=%s task=%s docs=%d company=%s key=%s",
            session_obj.pk, task.id, len(doc_ids), own_company_code, api_key_obj.company_code,
        )

        return Response({
            "status": "ok",
            "session_id": session_obj.pk,
            "total_documents": len(doc_ids),
            "message": "Export started",
        }, status=202)

    # ========================= FINVALDA =========================
    elif export_type == 'finvalda':
        logger.info("[EXP] FINVALDA export started")
        assign_random_prekes_kodai(documents)

        files_to_export = []

        if pirkimai_docs:
            logger.info("[EXP] FINVALDA exporting pirkimai: %d docs", len(pirkimai_docs))
            xml_bytes = export_pirkimai_group_to_finvalda(pirkimai_docs, user=request.user, own_company_code=cp_key)
            files_to_export.append((f"{today_str}_pirkimai_finvalda.xml", xml_bytes))
        if pardavimai_docs:
            logger.info("[EXP] FINVALDA exporting pardavimai: %d docs", len(pardavimai_docs))
            xml_bytes = export_pardavimai_group_to_finvalda(pardavimai_docs, user=request.user, own_company_code=cp_key)
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
                include_reference_data=True,
                own_company_code=cp_key, 
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

        from types import SimpleNamespace

        if not cp_key:
            return Response(
                {"error": "Counterparty (CP) is required for Pragma 4.0 export. Select a counterparty."},
                status=400,
            )

        # --- Парсим cp_key и ищем CP в документах ---
        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])
        if not all_docs:
            all_docs = list(documents)

        cp_raw = cp_key.strip()
        counterparty = None

        def _build_cp(doc, prefix):
            """Собираем SimpleNamespace из полей документа с указанным prefix."""
            return SimpleNamespace(
                company_code=getattr(doc, f'{prefix}id', '') or '',
                name=getattr(doc, f'{prefix}name', '') or '',
                vat_code=getattr(doc, f'{prefix}vat_code', '') or '',
                email=getattr(doc, f'{prefix}email', '') or '',
                address=getattr(doc, f'{prefix}address', '') or '',
                city=getattr(doc, f'{prefix}city', '') or '',
                country=getattr(doc, f'{prefix}country', '') or '',
                country_iso=getattr(doc, f'{prefix}country_iso', '') or '',
                post_code=getattr(doc, f'{prefix}post_code', '') or '',
                iban=getattr(doc, f'{prefix}iban', '') or '',
            )

        if cp_raw.lower().startswith("id:"):
            # Формат 1: "id:304401940" → ищем по seller_id / buyer_id
            code = cp_raw.split(":", 1)[1].strip()
            for doc in all_docs:
                if str(getattr(doc, 'seller_id', '') or '') == code:
                    counterparty = _build_cp(doc, 'seller_')
                    break
                if str(getattr(doc, 'buyer_id', '') or '') == code:
                    counterparty = _build_cp(doc, 'buyer_')
                    break
        else:
            # Формат 2 или 3: VAT code или имя (lowercase)
            cp_lower = cp_raw.lower()
            for doc in all_docs:
                for prefix in ('seller_', 'buyer_'):
                    vat = (str(getattr(doc, f'{prefix}vat_code', '') or '')).strip().lower()
                    name = (str(getattr(doc, f'{prefix}name', '') or '')).strip().lower()
                    if vat and vat == cp_lower:
                        counterparty = _build_cp(doc, prefix)
                        break
                    if name and name == cp_lower:
                        counterparty = _build_cp(doc, prefix)
                        break
                if counterparty:
                    break

        if counterparty is None:
            # Последний fallback — минимальный CP
            if cp_raw.lower().startswith("id:"):
                counterparty = SimpleNamespace(
                    company_code=cp_raw.split(":", 1)[1].strip(),
                    name='', vat_code='', email='', address='',
                    city='', country='', country_iso='', post_code='', iban='',
                )
            else:
                counterparty = SimpleNamespace(
                    company_code='', name=cp_raw, vat_code=cp_raw if cp_raw[:2].isalpha() else '',
                    email='', address='', city='', country='', country_iso='',
                    post_code='', iban='',
                )
            logger.warning("[EXP] PRAGMA40 CP not found in docs, fallback cp_key=%s", cp_key)

        logger.info("[EXP] PRAGMA40 CP: code=%s name=%s vat=%s",
                     counterparty.company_code, counterparty.name, counterparty.vat_code)

        try:
            result = export_to_pragma40_xml(
                documents=all_docs,
                counterparty=counterparty,
                user=request.user,
                own_company_code=cp_key,
            )
        except Exception as e:
            logger.exception("[EXP] PRAGMA40 export failed: %s", e)
            return Response({"error": "Pragma 4.0 export failed", "detail": str(e)}, status=500)

        if not result:
            logger.warning("[EXP] PRAGMA40 nothing to export")
            return Response({"error": "No documents to export"}, status=400)

        if len(result) == 1:
            doc_type_key, xml_bytes = list(result.items())[0]
            filename = f"{today_str}_pragma40_{doc_type_key}.xml"
            response = HttpResponse(xml_bytes, content_type="application/xml; charset=utf-8")
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            export_success = True
        else:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for doc_type_key, xml_bytes in result.items():
                    fname = f"{today_str}_pragma40_{doc_type_key}.xml"
                    zip_file.writestr(fname, xml_bytes)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="{today_str}_pragma40.zip"'
            export_success = True



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
                user=request.user,
                own_company_code=cp_key,
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
            result = export_to_site_pro(all_docs, user=request.user, own_company_code=cp_key)
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

        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])

        if not all_docs:
            logger.warning("[EXP] APSKAITA5 no documents to export")
            return Response({"error": "No documents to export"}, status=400)

        extra_fields = {
            "user": {
                "extra_settings": getattr(user, "extra_settings", {}) or {},
            }
        }

        content, filename, content_type = export_documents_group_to_apskaita5_files(
            documents=all_docs,
            site_url="",
            company_code=None,
            direction=None,
            apskaita5_extra_fields=extra_fields,
        )
        logger.info("[EXP] APSKAITA5 produced file=%s content_type=%s size=%d",
                     filename, content_type, len(content))
        response = HttpResponse(content, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-Content-Type-Options'] = 'nosniff'
        export_success = True

    # elif export_type == 'apskaita5':
    #     logger.info("[EXP] APSKAITA5 export started")
    #     assign_random_prekes_kodai(documents)

    #     content, filename, content_type = export_documents_group_to_apskaita5_files(
    #         documents=documents,
    #         site_url=site_url,   # предполагается, что переменная определена выше по модулю/конфигу
    #         company_code=None,
    #         direction=None,
    #     )
    #     logger.info("[EXP] APSKAITA5 produced file=%s content_type=%s size=%d",
    #                 filename, content_type, len(content))
    #     response = HttpResponse(content, content_type=content_type)
    #     response['Content-Disposition'] = f'attachment; filename="{filename}"'
    #     response['X-Content-Type-Options'] = 'nosniff'
    #     export_success = True

    # ========================= AGNUM =========================
    elif export_type == 'agnum':
        logger.info("[EXP] AGNUM export started")
        assign_random_prekes_kodai(documents)

        files_to_export = []

        # 1) Pirkimai (Type="2")
        if pirkimai_docs:
            logger.info("[EXP] AGNUM exporting pirkimai: %d docs", len(pirkimai_docs))
            pirkimai_xml = export_pirkimai_group_to_agnum(pirkimai_docs, request.user, own_company_code=cp_key)
            files_to_export.append((f'{today_str}_pirkimai_agnum.xml', pirkimai_xml))

        # 2) Pardavimai (Type="4")
        if pardavimai_docs:
            logger.info("[EXP] AGNUM exporting pardavimai: %d docs", len(pardavimai_docs))
            pardavimai_xml = export_pardavimai_group_to_agnum(pardavimai_docs, request.user, own_company_code=cp_key)
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
                own_company_code=cp_key,
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


    # ========================= APSA (i.SAF, Paulita XML) =========================
    elif export_type in ('apsa', 'isaf', 'paulita'):
        logger.info("[EXP] APSA export started")
        
        # Собираем документы с direction
        all_docs = []
        all_packs = []  # сохраняем pack для доступа к line_items
        
        for pack in prepared.get("pirkimai", []):
            doc = pack["doc"]
            doc.direction = "pirkimas"
            all_docs.append(doc)
            all_packs.append(pack)
        
        for pack in prepared.get("pardavimai", []):
            doc = pack["doc"]
            doc.direction = "pardavimas"
            all_docs.append(doc)
            all_packs.append(pack)
        
        if not all_docs:
            logger.warning("[EXP] APSA nothing to export")
            return Response({"error": "No documents to export"}, status=400)
        
        # RegistrationNumber = код выбранного контрагента из cp_key
        registration_number = ""
        cp_name = ""
        if cp_key:
            cp = cp_key.strip()
            if cp.lower().startswith("id:"):
                cp = cp.split(":", 1)[1].strip()

            # Если похоже на код/ПВМ (например LT123456789 или просто цифры)
            if re.match(r"^[A-Za-z]{0,2}\d{4,}$", cp):
                registration_number = cp
            else:
                cp_name = cp

        # Если cp_key был именем - ищем совпадение по имени и берём id_programoje
        if not registration_number and cp_name and all_docs:
            target = cp_name.strip().lower()
            for doc in all_docs:
                buyer_name = (getattr(doc, "buyer_name", "") or "").strip().lower()
                if buyer_name and buyer_name == target:
                    reg_from_name = (getattr(doc, "buyer_id_programoje", "") or "").strip()
                    if reg_from_name:
                        registration_number = reg_from_name
                        break

                seller_name = (getattr(doc, "seller_name", "") or "").strip().lower()
                if seller_name and seller_name == target:
                    reg_from_name = (getattr(doc, "seller_id_programoje", "") or "").strip()
                    if reg_from_name:
                        registration_number = reg_from_name
                        break

        
        # Fallback: берём из первого документа
        if not registration_number and all_docs:
            first_doc = all_docs[0]
            if first_doc.direction == "pirkimas":
                registration_number = (
                    getattr(first_doc, "buyer_id", "") or 
                    getattr(first_doc, "buyer_vat_code", "") or ""
                )
            else:
                registration_number = (
                    getattr(first_doc, "seller_id", "") or 
                    getattr(first_doc, "seller_vat_code", "") or ""
                )
        
        if not registration_number:
            logger.error("[EXP] APSA no registration number")
            return Response({
                "error": "Company registration number is required. Select counterparty or ensure documents have company data."
            }, status=400)
        
        # pvm_resolver из pack["line_items"] (CP данные с vat_percent и pvm_kodas)
        # Структура: {doc_id: {item_id: {"vat_percent": ..., "pvm_kodas": ...}}}
        pvm_resolver = {}
        for pack in all_packs:
            doc = pack["doc"]
            line_items_data = pack.get("line_items", [])
            
            if line_items_data:
                # DETALIAI - есть line_items
                item_map = {}
                for li in line_items_data:
                    item_id = li.get("id")
                    if item_id is not None:
                        item_map[item_id] = {
                            "vat_percent": li.get("vat_percent"),
                            "pvm_kodas": li.get("pvm_kodas"),
                        }
                if item_map:
                    pvm_resolver[doc.id] = item_map
            else:
                # SUMISKAI - нет line_items, берём из pack напрямую
                pvm_resolver[doc.id] = {
                    "pvm_kodas": pack.get("pvm_kodas"),
                    "vat_percent": pack.get("vat_percent"),
                }
        
        logger.info("[EXP] APSA docs=%d reg_num=%s pvm_resolver_docs=%d", 
                    len(all_docs), registration_number, len(pvm_resolver))
        
        try:
            result = export_to_apsa(
                documents=all_docs,
                registration_number=registration_number,
                pvm_resolver=pvm_resolver,
            )
            
            xml_bytes = result["isaf"]
            
            response = HttpResponse(xml_bytes, content_type='application/xml')
            response['Content-Disposition'] = f'attachment; filename=isaf_{today_str}.xml'
            export_success = True
            
            logger.info("[EXP] APSA export completed, size=%d", len(xml_bytes))
            
        except ValueError as e:
            logger.error("[EXP] APSA export error: %s", str(e))
            return Response({"error": str(e)}, status=400)
        except Exception as e:
            logger.exception("[EXP] APSA export failed")
            return Response({"error": f"Export failed: {str(e)}"}, status=500)



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
                    },
                    own_company_code=cp_key,
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
                    own_company_code=cp_key,
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


    # ========================= STEKAS PLIUS (ZIP/JSON) =========================
    elif export_type == 'stekas':
        logger.info("[EXP] STEKAS_PLIUS export started")

        all_docs = []
        for pack in (prepared.get("pirkimai", []) + prepared.get("pardavimai", [])):
            doc = pack["doc"]
            doc.pirkimas_pardavimas = pack.get("direction", "")
            all_docs.append(doc)

        logger.info("[EXP] STEKAS_PLIUS docs=%d pirk=%d pard=%d",
                    len(all_docs),
                    len(prepared.get("pirkimai", [])),
                    len(prepared.get("pardavimai", [])))

        if not all_docs:
            logger.warning("[EXP] STEKAS_PLIUS nothing to export")
            response = Response({"error": "Nėra dokumentų eksportui"}, status=400)
        else:

            content, filename, content_type = export_documents_group_to_stekas_files(
                documents=all_docs,
                site_url=request.build_absolute_uri('/') if request else "",
                company_code=getattr(request.user, 'company_code', '') or '',
                direction=None,  # направление берётся из doc.pirkimas_pardavimas
            )

            response = HttpResponse(content, content_type=content_type)
            response['Content-Disposition'] = f'attachment; filename={filename}'
            export_success = True


    # ========================= OPTIMUM (API) =========================
    elif export_type == 'optimum':
        logger.info("[EXP] OPTIMUM API export started")
        assign_random_prekes_kodai(documents)

        # Проверяем ключ
        opt_settings = getattr(request.user, "optimum_settings", {}) or {}
        enc_key = opt_settings.get("key") or ""
        if not enc_key:
            logger.warning("[EXP] OPTIMUM key missing")
            return Response({"error": "Optimum key is missing"}, status=400)

        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])
        if not all_docs:
            logger.warning("[EXP] OPTIMUM no documents to export")
            return Response({"error": "No documents to export"}, status=400)

        doc_ids = [d.pk for d in all_docs]

        # Создаём ExportSession
        from docscanner_app.models import ExportSession
        session = ExportSession.objects.create(
            user=request.user,
            program='optimum',
            stage=ExportSession.Stage.QUEUED,
            total_documents=len(doc_ids),
        )
        session.documents.set(doc_ids)

        # Запускаем Celery task
        task = export_to_optimum_task.delay(session.id)
        session.task_id = task.id
        session.save(update_fields=["task_id"])

        logger.info(
            "[EXP] OPTIMUM session=%s task=%s docs=%d",
            session.pk, task.id, len(doc_ids),
        )

        # Не помечаем как exported здесь — это сделает task после успешной отправки
        # Не ставим export_success = True чтобы universal finalize не менял статусы
        return Response({
            "status": "ok",
            "session_id": session.pk,
            "total_documents": len(doc_ids),
            "message": "Export started",
        }, status=202)
    

    # ========================= DINETA (API) =========================
    elif export_type == 'dineta':
        logger.info("[EXP] DINETA API export started")
        assign_random_prekes_kodai(documents)

        # Проверяем настройки
        dineta_settings = getattr(request.user, "dineta_settings", {}) or {}
        if not all([
            dineta_settings.get("server"),
            dineta_settings.get("client"),
            dineta_settings.get("username"),
            dineta_settings.get("password"),
        ]):
            logger.warning("[EXP] DINETA settings incomplete")
            return Response(
                {"error": "Dineta nustatymai neužpildyti"},
                status=400,
            )

        all_docs = (pirkimai_docs or []) + (pardavimai_docs or [])
        if not all_docs:
            logger.warning("[EXP] DINETA no documents to export")
            return Response({"error": "No documents to export"}, status=400)

        doc_ids = [d.pk for d in all_docs]

        # Создаём ExportSession
        from docscanner_app.models import ExportSession
        session = ExportSession.objects.create(
            user=request.user,
            program='dineta',
            stage=ExportSession.Stage.QUEUED,
            total_documents=len(doc_ids),
        )
        session.documents.set(doc_ids)

        # Запускаем Celery task
        task = export_to_dineta_task.delay(session.id)
        session.task_id = task.id
        session.save(update_fields=["task_id"])

        logger.info(
            "[EXP] DINETA session=%s task=%s docs=%d",
            session.pk, task.id, len(doc_ids),
        )

        return Response({
            "status": "ok",
            "session_id": session.pk,
            "total_documents": len(doc_ids),
            "message": "Export started",
        }, status=202)



    else:
        logger.error("[EXP] unknown export type: %s", export_type)
        return Response({"error": "Unknown export type"}, status=400)

    # --- universal finalize ---
    if response is not None:
        try:
            if export_success and exported_ids:
                if source == "invoice":
                    from django.utils import timezone as tz
                    Invoice.objects.filter(pk__in=exported_ids).update(
                        exported=True,
                        exported_at=tz.now(),
                    )
                    logger.info("[EXP] Marked %d invoices as exported", len(exported_ids))

                    # --- Record inv export usage + add headers ---
                    try:
                        if inv_sub and inv_sub.status == "free" and inv_usage:
                            for inv_id in exported_ids:
                                inv_usage.record_export(inv_id)
                            inv_usage.refresh_from_db()
                            response["X-Inv-Exports-Used"] = str(inv_usage.exports_used)
                            response["X-Inv-Exports-Max"] = "10"
                            response["X-Inv-Status"] = "free"
                            response["Access-Control-Expose-Headers"] = "X-Inv-Exports-Used, X-Inv-Exports-Max, X-Inv-Status"
                    except Exception as e:
                        logger.warning("[EXP] Failed to record inv export usage: %s", e)
                else:
                    ScannedDocument.objects.filter(pk__in=exported_ids).update(status="exported")
                    logger.info("[EXP] Marked %d documents as exported", len(exported_ids))
        except Exception as e:
            logger.warning("[EXP] Failed to mark as exported: %s", e)
        return response

    # # --- universal finalize ---
    # if response is not None:
    #     try:
    #         if export_success and exported_ids:
    #             ScannedDocument.objects.filter(pk__in=exported_ids).update(status="exported")
    #             logger.info("[EXP] Marked %d documents as exported (universal)", len(exported_ids))
    #     except Exception as e:
    #         logger.warning("[EXP] Failed to mark documents as exported: %s", e)
    #     return response

    logger.warning("[EXP] fell through unexpectedly")
    return Response({"error": "No documents to export"}, status=400)



# Soxranenije user infy s Dineta
class DinetaSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Вернуть текущие настройки Dineta этого пользователя.
        Пароль НЕ возвращается.
        Вместо server/client отдаём склеенный url для отображения на фронте.
        """
        user = request.user
        settings_dict = user.dineta_settings or {}

        serializer = DinetaSettingsSerializer(instance=settings_dict)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):

        user = request.user

        serializer = DinetaSettingsSerializer(
            data=request.data,
            instance=user.dineta_settings,
        )
        serializer.is_valid(raise_exception=True)

        settings_to_store = serializer.build_settings_dict()

        user.dineta_settings = settings_to_store
        user.save(update_fields=["dineta_settings"])

        response_serializer = DinetaSettingsSerializer(instance=settings_to_store)
        response_data = response_serializer.data

        try:
            dineta_hello(
                server=settings_to_store.get("server", ""),
                client=settings_to_store.get("client", ""),
                username=settings_to_store.get("username", ""),
                password=decrypt_password(settings_to_store.get("password", "")),
            )
            response_data["connection_status"] = "ok"
            response_data["connection_message"] = "Prisijungimas sėkmingas."
        except DinetaError as e:
            response_data["connection_status"] = "warning"
            response_data["connection_message"] = str(e)
        except Exception:
            response_data["connection_status"] = "warning"
            response_data["connection_message"] = "Prisijungimo patikrinimą nepavyko atlikti."

        return Response(response_data, status=status.HTTP_200_OK)




# Soxranenije user infy s Optimum i do soxranenija delajet probnyj Hello test
class OptimumSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Grąžina meta informaciją (be rakto) + užmaskuotą rakto galą."""
        settings = request.user.optimum_settings or {}
        raw_key = settings.get("key", "")
        return Response({
            "has_key": bool(raw_key),
            "key_suffix": settings.get("key_suffix", ""),
            "verified_at": settings.get("verified_at"),
            "last_ok": settings.get("last_ok"),
            "last_error_at": settings.get("last_error_at"),
            "last_error": settings.get("last_error", ""),
        })

    def put(self, request):
        """Išsaugoti naują raktą: Hello testas → jei OK saugom, jei klaida — nesaugom rakto."""
        user = request.user
        raw_key = (request.data.get("key") or "").strip()

        if not raw_key:
            return Response({"detail": "API Key yra privalomas."}, status=status.HTTP_400_BAD_REQUEST)

        now_iso = timezone.now().isoformat()

        try:
            optimum_hello(raw_key)
        except OptimumError as exc:
            # Rakto nesaugom, saugom klaidos metaduomenis
            current = user.optimum_settings or {}
            current["last_ok"] = False
            current["last_error_at"] = now_iso
            current["last_error"] = str(exc) or "Optimum: klaida"
            user.optimum_settings = current
            user.save(update_fields=["optimum_settings"])

            return Response({
                "detail": str(exc) or "Nepavyko patikrinti Optimum API Key.",
                "last_ok": False,
                "last_error": str(exc),
                "last_error_at": now_iso,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Sėkmė: saugom raktą + metaduomenis
        user.optimum_settings = {
            "key": raw_key,
            "key_suffix": raw_key[-4:] if len(raw_key) >= 4 else raw_key,
            "verified_at": now_iso,
            "last_ok": True,
            "last_error": "",
            "last_error_at": None,
        }
        user.save(update_fields=["optimum_settings"])

        return Response({
            "has_key": True,
            "key_suffix": raw_key[-4:] if len(raw_key) >= 4 else "",
            "verified_at": now_iso,
            "last_ok": True,
            "last_error": "",
            "last_error_at": None,
        })

    def post(self, request):
        """Patikrinti jau išsaugotą raktą (Patikrinti API mygtukas)."""
        user = request.user
        settings = user.optimum_settings or {}
        raw_key = settings.get("key", "")

        if not raw_key:
            return Response({"detail": "API raktas nerastas. Pirmiausia išsaugokite raktą."}, status=status.HTTP_400_BAD_REQUEST)

        now_iso = timezone.now().isoformat()

        try:
            optimum_hello(raw_key)
        except OptimumError as exc:
            settings["last_ok"] = False
            settings["last_error_at"] = now_iso
            settings["last_error"] = str(exc) or "Optimum: klaida"
            user.optimum_settings = settings
            user.save(update_fields=["optimum_settings"])

            return Response({
                "detail": str(exc) or "Nepavyko patikrinti Optimum API Key.",
                "has_key": True,
                "key_suffix": raw_key[-4:] if len(raw_key) >= 4 else "",
                "verified_at": settings.get("verified_at"),
                "last_ok": False,
                "last_error": str(exc),
                "last_error_at": now_iso,
            }, status=status.HTTP_400_BAD_REQUEST)

        settings["verified_at"] = now_iso
        settings["last_ok"] = True
        settings["last_error"] = ""
        settings["last_error_at"] = None
        user.optimum_settings = settings
        user.save(update_fields=["optimum_settings"])

        return Response({
            "has_key": True,
            "key_suffix": raw_key[-4:] if len(raw_key) >= 4 else "",
            "verified_at": now_iso,
            "last_ok": True,
            "last_error": "",
            "last_error_at": None,
        })

    def delete(self, request):
        """Ištrinti raktą ir visus metaduomenis."""
        user = request.user
        user.optimum_settings = {}
        user.save(update_fields=["optimum_settings"])
        return Response({"detail": "Optimum API raktas ištrintas."})

    # def put(self, request):
    #     """
    #     Временно: сохраняем любой key без проверки.
    #     """
    #     user = request.user

    #     serializer = OptimumSettingsSerializer(data=request.data)
    #     serializer.is_valid(raise_exception=True)

    #     raw_key = (serializer.validated_data.get("key") or "").strip()
    #     now_iso = timezone.now().isoformat()

    #     # сохраняем key без проверки
    #     settings_to_store = {
    #         "key": encrypt_password(raw_key),
    #         "verified_at": now_iso,
    #         "last_ok": True,
    #         "last_error_at": None,
    #         "last_error": "",
    #     }

    #     user.optimum_settings = settings_to_store
    #     user.save(update_fields=["optimum_settings"])

    #     response_serializer = OptimumSettingsSerializer(instance=settings_to_store)
    #     return Response(response_serializer.data, status=status.HTTP_200_OK)





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

    queryset = ScannedDocument.objects.filter(id__in=ids, user=request.user)

    # --- audit log: помечаем удаление в CreditUsageLog ---
    doc_ids = list(queryset.values_list('id', flat=True))
    if doc_ids:
        CreditUsageLog.objects.filter(
            scanned_document_id__in=doc_ids,
            document_deleted_by_user=False,
        ).update(
            document_deleted_by_user=True,
            document_deleted_at=timezone.now(),
        )

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
                dt_from = timezone.make_aware(datetime.combine(d, dt_time.min), tz)
                qs = qs.filter(uploaded_at__gte=dt_from)

        if date_to:
            d = parse_date(date_to)
            if d:
                dt_to = timezone.make_aware(datetime.combine(d, dt_time.min), tz) + timedelta(days=1)
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
#                 dt_from = timezone.make_aware(datetime.combine(d, dt_time.min), tz)
#                 qs = qs.filter(uploaded_at__gte=dt_from)

#         if date_to:
#             d = parse_date(date_to)
#             if d:
#                 dt_to = timezone.make_aware(datetime.combine(d, dt_time.min), tz) + timedelta(days=1)
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

#Naxodit IP usera pri registracii
def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')

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
            user.registration_ip = get_client_ip(request)
            user.extra_settings = {"fix_delta": 1}
            user.save(update_fields=["extra_settings"])

            user.ensure_inbox_token(save=True)

            from .models import MeasurementUnit, InvoiceSeries
            MeasurementUnit.create_defaults_for_user(user)
            InvoiceSeries.create_defaults_for_user(user)
            InvSubscription.objects.create(user=user)

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

    search = request.GET.get('search')
    if search:
        qs = qs.filter(document_number__icontains=search)

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
        "nuo šiol sąskaitas į DokSkeną galite siųsti ir el. paštu.\n"
        "Šiame video parodome, kaip tai vyksta: https://youtu.be/6zcjzTEiK1A\n\n"
        "Jei nematote \"Kiti būdai\" suvestinėje, savo klaviatūroje paspauskite CTRL, SHIFT, R klavišus kartu.\n\n"
        "Iš ateities planų:\n"
        "- integracija su Google Drive ir Dropbox (prijungiate savo paskyras, pasidalinate prieiga su klientais, kiekvienam klientui sukuriamas aplankas į kurį jie kelia failus, o DokSkenas automatiškai juos pasiėma)\n\n"
        "- sąskaitų išrašymas ir duomenų eksportas į 16 apskaitos programų (pardavimo sąskaitas galėsite formuoti tiesiai DokSkene, greitai ir patogiai, o sąskaitas nereikės skaitmenizuoti, nes duomenis tiesiog eksportuosite į savo apskaitos programą)\n\n"
        "Jei turite klausimų ar pastebėjimų, klauskite.\n\n"
        "Su pagarba,\n"
        "DokSkeno komanda\n"
        "Denis"
    )

    siusti_masini_laiska_visiems(
        subject="Svarbus atnaujinimas",
        text_template=text_tpl,
        html_template_name=None,      # ← НЕ используем HTML вообще
        extra_context=None,           # можно опустить
        exclude_user_ids=[46, 2, 16, 24, 31, 69, 105, 133, 202, 233, 283, 284, 289, 322, 351, 360 ],   # кого исключить (опционально)
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
    user = request.user
    select_all = request.data.get("select_all", False)
    exclude_ids = request.data.get("exclude_ids", [])

    if select_all:
        qs = MobileInboxDocument.objects.filter(user=user, is_processed=False)
        source = request.data.get("source")
        client_id = request.data.get("client_id")
        if source:
            qs = qs.filter(source=source)
        if client_id:
            qs = qs.filter(cloud_client_id=client_id)
        if exclude_ids:
            qs = qs.exclude(id__in=exclude_ids)
        docs = qs
    else:
        ids = request.data.get("ids") or []
        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": "NO_IDS", "detail": "Pateikite bent vieną ID."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        docs = MobileInboxDocument.objects.filter(
            user=user, is_processed=False, id__in=ids,
        )

    file_paths = []
    for d in docs:
        if d.uploaded_file and d.uploaded_file.name:
            try:
                file_paths.append(d.uploaded_file.path)
            except Exception:
                pass

    deleted_count = docs.count()
    deleted_ids = list(docs.values_list("id", flat=True))
    docs.delete()

    for path in file_paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception:
            continue

    return Response(
        {"status": "OK", "count": deleted_count, "deleted_ids": deleted_ids},
        status=status.HTTP_200_OK,
    )


ARCHIVE_EXTS_PROMOTE = {".zip", ".rar", ".7z", ".tar", ".tgz", ".tar.gz", ".tar.bz2", ".tar.xz", ".tbz2"}

def _ext_lower(name):
    n = (name or "").lower()
    if n.endswith(".tar.gz"): return ".tar.gz"
    if n.endswith(".tar.bz2"): return ".tar.bz2"
    if n.endswith(".tar.xz"): return ".tar.xz"
    return os.path.splitext(n)[1]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def web_mobile_inbox_promote(request):
    user = request.user
    scan_type = request.data.get("scan_type", "sumiskai")

    # 1. Blocked session check
    if UploadSession.objects.filter(user=user, stage="blocked").exists():
        return Response({
            "error": "BLOCKED_SESSION_EXISTS",
            "detail": "Turite neapmokėtą užduotį. Papildykite kreditus arba panaikinkite užduotį.",
        }, status=409)

    # 2. Get documents (support select_all)
    select_all = request.data.get("select_all", False)
    exclude_ids = request.data.get("exclude_ids", [])

    if select_all:
        qs = MobileInboxDocument.objects.filter(user=user, is_processed=False)
        source = request.data.get("source")
        client_id = request.data.get("client_id")
        if source:
            qs = qs.filter(source=source)
        if client_id:
            qs = qs.filter(cloud_client_id=client_id)
        if exclude_ids:
            qs = qs.exclude(id__in=exclude_ids)
        mobile_docs = list(qs)
    else:
        ids = request.data.get("ids") or []
        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": "NO_IDS", "detail": "Pateikite bent vieną ID."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        mobile_docs = list(
            MobileInboxDocument.objects
            .filter(user=user, is_processed=False, id__in=ids)
        )

    if not mobile_docs:
        return Response({"status": "OK", "count": 0, "processed_ids": []})

    # 3. Create UploadSession
    session = UploadSession.objects.create(
        user=user,
        scan_type=scan_type,
        stage="uploading",
        client_total_files=len(mobile_docs),
    )

    # 4. Copy files to ScannedDocuments
    processed_ids = []
    for mobile_doc in mobile_docs:
        if not mobile_doc.uploaded_file:
            continue
        try:
            with transaction.atomic():
                original_file = mobile_doc.uploaded_file
                original_file.open("rb")
                content = original_file.read()
                original_file.close()

                ext = _ext_lower(mobile_doc.original_filename)
                is_archive = ext in ARCHIVE_EXTS_PROMOTE

                scanned = ScannedDocument(
                    user=user,
                    original_filename=mobile_doc.original_filename,
                    status="pending",
                    scan_type=scan_type,
                    upload_session=session,
                    is_archive_container=is_archive,
                    uploaded_size_bytes=len(content),
                )
                scanned.file.save(
                    original_file.name.split("/")[-1],
                    ContentFile(content),
                    save=True,
                )
                scanned.save()

                mobile_doc.processed_document = scanned
                mobile_doc.processed_at = timezone.now()
                mobile_doc.is_processed = True
                mobile_doc.save(
                    update_fields=["processed_document", "processed_at", "is_processed"]
                )

                processed_ids.append(mobile_doc.id)

        except Exception as e:
            logger.error("Promote failed for doc %s: %s", mobile_doc.id, e)
            continue

    if not processed_ids:
        session.delete()
        return Response({"status": "OK", "count": 0, "processed_ids": []})

    # 5. Update session counters
    session.uploaded_files = len(processed_ids)
    session.save(update_fields=["uploaded_files"])

    # 6. Reserve credits + check
    session = reserve_and_queue(str(session.id), user.id)

    # 7. Start if not blocked
    if session.stage == "processing":
        start_session_processing.delay(str(session.id))

    return Response({
        "status": "OK",
        "count": len(processed_ids),
        "processed_ids": processed_ids,
        "session_id": str(session.id),
        "session_stage": session.stage,
        "error_message": session.error_message or None,
    })



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def retry_blocked_session(request, session_id):
    """POST /api/web/sessions/<id>/retry/ — повтор после пополнения кредитов"""
    try:
        session = UploadSession.objects.get(id=session_id, user=request.user)
    except UploadSession.DoesNotExist:
        return Response(status=404)

    if session.stage != "blocked":
        return Response({"error": "Session is not blocked"}, status=400)

    # Сбрасываем rejected docs обратно в pending
    ScannedDocument.objects.filter(
        upload_session=session,
        status="rejected",
        error_message="Nepakanka kreditų",
    ).update(status="pending", error_message=None)

    # Сбрасываем счётчики сессии
    session.stage = "uploading"
    session.error_message = ""
    session.processed_items = 0
    session.done_items = 0
    session.failed_items = 0
    session.save(update_fields=[
        "stage", "error_message",
        "processed_items", "done_items", "failed_items", "updated_at",
    ])

    # Заново проверяем кредиты
    session = reserve_and_queue(str(session.id), request.user.id)

    if session.stage == "processing":
        start_session_processing.delay(str(session.id))

    return Response({
        "id": str(session.id),
        "stage": session.stage,
        "error_message": session.error_message or None,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_blocked_session(request, session_id):
    """POST /api/web/sessions/<id>/cancel/ — отмена, возврат файлов в inbox"""
    try:
        session = UploadSession.objects.get(id=session_id, user=request.user)
    except UploadSession.DoesNotExist:
        return Response(status=404)

    if session.stage != "blocked":
        return Response({"error": "Session is not blocked"}, status=400)

    # Находим ScannedDocuments этой сессии
    scanned_docs = ScannedDocument.objects.filter(upload_session=session)
    scanned_ids = list(scanned_docs.values_list("id", flat=True))

    # Возвращаем файлы в inbox
    MobileInboxDocument.objects.filter(
        user=request.user,
        processed_document_id__in=scanned_ids,
    ).update(
        is_processed=False,
        processed_document=None,
        processed_at=None,
    )

    # Удаляем физические файлы + ScannedDocuments
    for doc in scanned_docs:
        if doc.file:
            try:
                doc.file.delete(save=False)
            except Exception:
                pass
    scanned_docs.delete()

    # Удаляем сессию
    session.delete()

    return Response({"status": "cancelled"})




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
            dt_from = timezone.make_aware(datetime.combine(d, dt_time.min), tz)
            qs = qs.filter(uploaded_at__gte=dt_from)

    if date_to:
        d = parse_date(date_to)
        if d:
            dt_to = timezone.make_aware(datetime.combine(d, dt_time.min), tz) + timedelta(days=1)
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
        count = 0

        if ext == ".zip":
            with zipfile.ZipFile(path) as zf:
                for zi in zf.infolist():
                    if zi.is_dir():
                        continue
                    if not zi.filename:
                        continue
                    count += 1

        elif ext in {".tar", ".tgz", ".tar.gz", ".tar.bz2", ".tar.xz", ".tbz2"}:
            with tarfile.open(path, mode="r:*") as tf:
                for m in tf.getmembers():
                    if not m.isfile():
                        continue
                    count += 1

        elif ext == ".7z":
            try:
                import py7zr
                with py7zr.SevenZipFile(path, mode='r') as sz:
                    for name in sz.getnames():
                        if not name.endswith('/'):
                            count += 1
            except Exception as e:
                logger.warning(f"Failed to read 7z archive {a.original_filename}: {e}")
                count = 1

        elif ext == ".rar":
            try:
                import rarfile
                with rarfile.RarFile(path) as rf:
                    for ri in rf.infolist():
                        if ri.isdir():
                            continue
                        count += 1
            except Exception as e:
                logger.warning(f"Failed to read rar archive {a.original_filename}: {e}")
                count = 1

        else:
            count = 1

        a.archive_file_count = count
        a.save(update_fields=["archive_file_count"])

        total_inside += count
    return base + total_inside




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

        # Reject all pending documents in this session
        blocked_count = ScannedDocument.objects.filter(
            upload_session=s,
            status="pending",
        ).update(
            status="rejected",
            error_message="Nepakanka kreditų",
        )
        logger.info(
            "[SESSION] Blocked session %s: rejected %d pending docs (available=%.0f, needed=%.0f)",
            s.id, blocked_count, available, needed,
        )

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
    
    if UploadSession.objects.filter(user=request.user, stage="blocked").exists():
        return Response({
            "error": "BLOCKED_SESSION_EXISTS",
            "detail": "Turite neapmokėtą užduotį. Papildykite kreditus arba panaikinkite užduotį.",
        }, status=409)
    
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
        stage__in=["processing", "queued", "credit_check", "blocked"]
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


#proveriajet status zadachi exporta cerez API

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_sessions_active(request):
    """
    Возвращает активные и недавно завершённые ExportSession для текущего юзера.
    Фронт поллит каждые 2 секунды для progress bar.
    """
    from docscanner_app.models import ExportSession
    from django.utils import timezone
    from datetime import timedelta

    # Активные сессии (queued + processing)
    active = ExportSession.objects.filter(
        user=request.user,
        stage__in=[ExportSession.Stage.QUEUED, ExportSession.Stage.PROCESSING],
    )

    # Недавно завершённые (за последние 10 секунд) — чтобы фронт увидел финальное состояние
    recent_done = ExportSession.objects.filter(
        user=request.user,
        stage=ExportSession.Stage.DONE,
        finished_at__gte=timezone.now() - timedelta(seconds=10),
    )

    sessions = list(active) + list(recent_done)

    data = {
        "sessions": [
            {
                "id": s.pk,
                "program": s.program,
                "stage": s.stage,
                "total_documents": s.total_documents,
                "processed_documents": s.processed_documents,
                "success_count": s.success_count,
                "partial_count": s.partial_count,
                "error_count": s.error_count,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "finished_at": s.finished_at.isoformat() if s.finished_at else None,
                "total_time_seconds": s.total_time_seconds,
            }
            for s in sessions
        ]
    }

    return Response(data, status=200)


# Proverka errors exportirovanyx dokumentov cerez API (dlia documentstable)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_log_detail(request, document_id):
    """
    Возвращает последний APIExportLog для документа + вложенные article_logs.
    Для popup при клике на статус в DocumentsTable.
    Query params:
      ?program=optimum (по умолчанию optimum)
    """
    from docscanner_app.models import APIExportLog

    program = request.query_params.get("program", "optimum")

    export_log = (
        APIExportLog.objects
        .filter(
            document_id=document_id,
            user=request.user,
            program=program,
        )
        .prefetch_related("article_logs")
        .order_by("-created_at")
        .first()
    )

    if not export_log:
        return Response({"error": "No export log found"}, status=404)

    data = {
        "id": export_log.pk,
        "status": export_log.status,
        "created_at": export_log.created_at.isoformat(),
        "partner_status": getattr(export_log, "partner_status", None),
        "partner_error": getattr(export_log, "partner_error", None),
        "invoice_type": export_log.invoice_type,
        "invoice_status": export_log.invoice_status,
        "invoice_result": export_log.invoice_result,
        "invoice_error": export_log.invoice_error,
        "articles": [
            {
                "article_name": a.article_name,
                "article_code": a.article_code,
                "status": a.status,
                "result": a.result,
                "error": a.error,
            }
            for a in export_log.article_logs.all()
        ],
    }

    return Response(data, status=200)




#Dokumenty iz emailov

MAX_MAILGUN_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


@csrf_exempt
@require_POST
def mailgun_inbound(request):
    """
    POST /api/mailgun/inbound/
    Webhook от Mailgun — принимает входящие email и сохраняет вложения
    в MobileInboxDocument с source='email'.
    """

    # 1. Проверяем подпись Mailgun
    signing_key = getattr(settings, 'MAILGUN_WEBHOOK_SIGNING_KEY', '')
    if not signing_key:
        logger.error("MAILGUN_WEBHOOK_SIGNING_KEY not configured")
        return HttpResponseForbidden('Webhook not configured')

    token = request.POST.get('token', '')
    timestamp = request.POST.get('timestamp', '')
    signature = request.POST.get('signature', '')

    try:
        import time as time_module
        if abs(time_module.time() - int(timestamp)) > 300:
            logger.warning("Mailgun webhook: stale timestamp")
            return HttpResponseForbidden('Stale request')
    except (ValueError, TypeError):
        return HttpResponseForbidden('Invalid timestamp')

    expected = hmac.new(
        key=signing_key.encode('utf-8'),
        msg=f'{timestamp}{token}'.encode('utf-8'),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        logger.warning("Mailgun webhook: invalid signature")
        return HttpResponseForbidden('Invalid signature')  # ВРЕМЕННО ОТКЛЮЧЕНО

    # 2. Находим пользователя по inbox-токену
    recipient = request.POST.get('recipient', '')
    inbox_token = recipient.split('@')[0].lower().strip()

    if not inbox_token:
        return HttpResponse('ok', status=200)

    try:
        user = CustomUser.objects.get(email_inbox_token=inbox_token)
    except CustomUser.DoesNotExist:
        logger.info(f"Mailgun inbound: unknown token '{inbox_token}'")
        return HttpResponse('ok', status=200)

    sender_email = request.POST.get('sender', '')
    subject = request.POST.get('subject', '')

    # 3. Сохраняем вложения
    saved_count = 0
    skipped_count = 0

    for key, uploaded_file in request.FILES.items():
        # Проверка расширения
        ext = os.path.splitext(uploaded_file.name)[1].lower()
        if ext not in SUPPORTED_EXTS:
            logger.debug(f"Mailgun inbound: skip unsupported ext '{ext}' ({uploaded_file.name})")
            skipped_count += 1
            continue

        # Проверка размера
        file_size = getattr(uploaded_file, 'size', 0) or 0
        if file_size > MAX_MAILGUN_FILE_SIZE:
            logger.warning(f"Mailgun inbound: skip too large file ({file_size} bytes): {uploaded_file.name}")
            skipped_count += 1
            continue

        doc = MobileInboxDocument.objects.create(
            user=user,
            uploaded_file=uploaded_file,
            original_filename=uploaded_file.name,
            size_bytes=file_size,
            sender_email=sender_email,
            source='email',
            sender_subject=subject,
            is_processed=False,
        )

        doc.preview_url = f"{settings.SITE_URL_BACKEND}{doc.uploaded_file.url}"
        doc.save(update_fields=["preview_url"])

        saved_count += 1

    logger.info(
        f"Mailgun inbound: user={user.email}, token={inbox_token}, "
        f"sender={sender_email}, saved={saved_count}, skipped={skipped_count}"
    )

    return HttpResponse('ok', status=200)




#NEW - saskaitu israsymas
"""
DokSkenas — Sąskaitų išrašymas
Views: CRUD для Invoice, Counterparty, InvoiceSettings + бизнес-действия.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum, Count, Case, When, BooleanField, Value
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from .models import Counterparty, InvoiceSettings, Invoice, InvoiceLineItem
from .serializers import (
    InvoiceCounterpartySerializer,
    InvoiceCounterpartyListSerializer,
    InvoiceSettingsSerializer,
    InvoiceListSerializer,
    InvoiceDetailSerializer,
    InvoiceWriteSerializer,
    InvoicePublicSerializer,
    InvoiceLineItemSerializer,
)


# ════════════════════════════════════════════════════════════
# Counterparty
# ════════════════════════════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def counterparty_list_create(request):
    """
    GET  — список контрагентов (с поиском ?q=..., фильтром ?role=...)
           Пагинация: ?limit=25&offset=0
    POST — создать нового контрагента
    """
    user = request.user

    if request.method == "GET":
        qs = Counterparty.objects.filter(user=user)

        q = request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(company_code__icontains=q)
                | Q(vat_code__icontains=q)
            )

        role = request.GET.get("role")
        if role in ("buyer", "seller"):
            qs = qs.filter(Q(default_role=role) | Q(default_role="both"))

        # Новые сверху
        qs = qs.order_by("-id")
        total = qs.count()

        try:
            limit = int(request.GET.get("limit", 25))
            offset = int(request.GET.get("offset", 0))
        except (ValueError, TypeError):
            limit, offset = 25, 0
        limit = max(1, min(limit, 250))
        offset = max(offset, 0)

        page = qs[offset : offset + limit]
        serializer = InvoiceCounterpartyListSerializer(page, many=True)
        return Response({"results": serializer.data, "count": total})

    # POST
    serializer = InvoiceCounterpartySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(user=user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def counterparty_detail(request, pk):
    """GET / PUT / DELETE одного контрагента."""
    cp = get_object_or_404(Counterparty, pk=pk, user=request.user)

    if request.method == "GET":
        return Response(InvoiceCounterpartySerializer(cp).data)

    if request.method == "PUT":
        serializer = InvoiceCounterpartySerializer(cp, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # DELETE
    cp.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ════════════════════════════════════════════════════════════
# InvoiceSettings
# ════════════════════════════════════════════════════════════

@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def invoice_settings(request):
    obj, _ = InvoiceSettings.objects.get_or_create(user=request.user)

    if request.method == "GET":
        data = InvoiceSettingsSerializer(obj, context={"request": request}).data
        data["payment_providers"] = request.user.payment_providers or {}
        return Response(data)

    serializer = InvoiceSettingsSerializer(
        obj, data=request.data, partial=True, context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()

    resp_data = serializer.data
    resp_data["payment_providers"] = request.user.payment_providers or {}
    return Response(resp_data)


# ════════════════════════════════════════════════════════════
# Invoice List — с поддержкой категорий
# ════════════════════════════════════════════════════════════

from django.db.models import Count, Exists, OuterRef, Q

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_list(request):
    user = request.user
    today = date.today()

    qs = (
        Invoice.objects
        .filter(user=user)
        .annotate(
            line_items_count=Count("line_items"),
            _has_proposed=Exists(
                PaymentAllocation.objects.filter(
                    invoice=OuterRef("pk"),
                    status="proposed",
                )
            ),
        )
    )


    category = (request.GET.get("category") or "").strip().lower()
    status_param = (request.GET.get("status") or "").strip().lower()

    # ── Category filter ──
    if category == "israsytos":
        # Base: issued + sent, NOT overdue
        qs = qs.filter(status__in=["issued", "sent"]).filter(
            Q(due_date__gte=today) | Q(due_date__isnull=True)
        )
        # Sub-filter within israsytos
        if status_param in ("issued", "sent"):
            qs = qs.filter(status=status_param)

    elif category == "veluojancios":
        qs = qs.filter(status__in=["issued", "sent"], due_date__lt=today)
        if status_param in ("issued", "sent"):
            qs = qs.filter(status=status_param)

    elif category == "apmoketos":
        qs = qs.filter(status__in=["paid", "partially_paid"])

    elif category == "juodrasciai":
        qs = qs.filter(status="draft")

    elif category == "cancelled":
        qs = qs.filter(status="cancelled")

    else:
        # No category — old-style status filter
        if status_param:
            statuses = [s.strip() for s in status_param.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

    # ── Exported filter ──
    exported_param = (request.GET.get("exported") or "").strip().lower()
    if exported_param == "true":
        qs = qs.filter(exported=True)
    elif exported_param == "false":
        qs = qs.filter(exported=False)

    # ── Invoice type ──
    invoice_type = request.GET.get("invoice_type")
    if invoice_type:
        qs = qs.filter(invoice_type=invoice_type)

    # ── Search ──
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(
            Q(buyer_name__icontains=q)
            | Q(buyer_id__icontains=q)
            | Q(document_number__icontains=q)
            | Q(document_series__icontains=q)
        )

    # ── Date range ──
    date_from = request.GET.get("date_from")
    if date_from:
        qs = qs.filter(invoice_date__gte=date_from)
    date_to = request.GET.get("date_to")
    if date_to:
        qs = qs.filter(invoice_date__lte=date_to)

    # ── Sort & paginate ──
    qs = qs.order_by("-created_at")

    limit = min(int(request.GET.get("limit", 50)), 200)
    offset = int(request.GET.get("offset", 0))
    total = qs.count()

    page = qs[offset : offset + limit]
    serializer = InvoiceListSerializer(page, many=True)

    return Response({
        "count": total,
        "limit": limit,
        "offset": offset,
        "results": serializer.data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_create(request):
    """Создать новый счёт (draft)."""
    serializer = InvoiceWriteSerializer(
        data=request.data, context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_detail(request, pk):
    """Получить полный счёт с line items."""
    if request.user.is_superuser:
        invoice = get_object_or_404(Invoice, pk=pk)
    else:
        invoice = get_object_or_404(Invoice, pk=pk, user=request.user)
    serializer = InvoiceDetailSerializer(invoice, context={"request": request})
    return Response(serializer.data)


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def invoice_update(request, pk):
    """Обновить счёт (только draft)."""
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)
    serializer = InvoiceWriteSerializer(
        invoice, data=request.data, partial=True, context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def invoice_delete(request, pk):
    """Удалить счёт (только draft)."""
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)
    if not invoice.is_editable:
        return Response(
            {"detail": "Negalima ištrinti išrašytos sąskaitos."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    invoice.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ════════════════════════════════════════════════════════════
# Invoice — Line Items (отдельный endpoint для lazy loading)
# ════════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_line_items(request, pk):
    """Line items для конкретного счёта (lazy load)."""
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)
    qs = invoice.line_items.order_by("sort_order", "id")
    serializer = InvoiceLineItemSerializer(qs, many=True)
    return Response(serializer.data)


# ════════════════════════════════════════════════════════════
# Invoice — Бизнес-действия
# ════════════════════════════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_issue(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)

    if invoice.status != "draft":
        return Response(
            {"detail": "Galima išrašyti tik juodraštį."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    errors = {}
    if not invoice.seller_name:
        errors["seller_name"] = "Pardavėjo pavadinimas privalomas."
    if not invoice.buyer_name:
        errors["buyer_name"] = "Pirkėjo pavadinimas privalomas."
    if not invoice.invoice_date:
        errors["invoice_date"] = "Sąskaitos data privaloma."
    if not invoice.line_items.exists():
        errors["line_items"] = "Būtina bent viena eilutė."
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        series_obj = None

        if invoice.document_series:
            series_obj = InvoiceSeries.objects.select_for_update().filter(
                user=request.user,
                prefix=invoice.document_series,
                invoice_type=invoice.invoice_type,
                is_active=True,
            ).first()

        if not series_obj:
            series_obj = InvoiceSeries.objects.select_for_update().filter(
                user=request.user,
                invoice_type=invoice.invoice_type,
                is_active=True,
                is_default=True,
            ).first()

        if not series_obj:
            series_obj = InvoiceSeries.objects.select_for_update().filter(
                user=request.user,
                invoice_type=invoice.invoice_type,
                is_active=True,
            ).first()

        if not series_obj:
            return Response(
                {"detail": "Nėra sukurtos serijos šiam dokumento tipui."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Если юзер уже задал номер вручную — проверяем уникальность
        if invoice.document_number:
            exists = Invoice.objects.filter(
                user=request.user,
                document_series=series_obj.prefix,
                document_number=invoice.document_number,
                invoice_type=invoice.invoice_type,
            ).exclude(pk=invoice.pk).exists()
            if exists:
                return Response(
                    {"detail": f"Numeris {series_obj.prefix}-{invoice.document_number} jau užimtas."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            prefix = series_obj.prefix
            number_str = invoice.document_number
        else:
            # Авто-присвоение
            prefix, number_str, number_int = series_obj.allocate_number()

        invoice.document_series = prefix
        invoice.document_number = number_str
        invoice.status = "issued"
        invoice.assign_pvm_codes()
        invoice.save(update_fields=[
            "document_series", "document_number",
            "status", "pvm_kodas",
        ])

    serializer = InvoiceDetailSerializer(invoice, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_send(request, pk):
    """
    Отправить счёт по email покупателю.
    Body: {"email": "buyer@example.com"} (опционально, иначе buyer_email)
    """
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)

    if not invoice.can_be_sent:
        return Response(
            {"detail": "Sąskaita turi būti išrašyta prieš siunčiant."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = request.data.get("email") or invoice.buyer_email
    if not email:
        return Response(
            {"detail": "Nurodykite pirkėjo el. paštą."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # TODO: отправить email с PDF вложением
    # send_invoice_email(invoice, email)

    invoice.status = "sent"
    invoice.sent_at = timezone.now()
    invoice.sent_to_email = email
    invoice.save(update_fields=["status", "sent_at", "sent_to_email"])

    serializer = InvoiceDetailSerializer(invoice, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_mark_paid(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)

    if invoice.status not in ("issued", "sent", "partially_paid"):
        return Response(
            {"detail": "Galima pažymėti tik išrašytą/išsiųstą/dalinai apmokėtą sąskaitą."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate input
    amount = request.data.get("amount")
    payment_date = request.data.get("payment_date")

    if not amount or not payment_date:
        return Response(
            {"detail": "Privalomi laukai: amount, payment_date."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from decimal import Decimal, InvalidOperation
    try:
        amount = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return Response(
            {"detail": "Neteisinga suma."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    note = request.data.get("note", "")

    # Create PaymentAllocation
    from .services.payment_service import PaymentService
    svc = PaymentService(request.user)
    svc.mark_paid_manual(
        invoice=invoice,
        amount=amount,
        payment_date=payment_date,
        note=note,
    )

    # Auto SF creation
    invoice.refresh_from_db()
    from .services.auto_sf import maybe_auto_create_sf
    created_sf = maybe_auto_create_sf(invoice)

    data = InvoiceDetailSerializer(invoice, context={"request": request}).data
    if created_sf:
        data["auto_created_sf"] = {
            "id": created_sf.id,
            "full_number": created_sf.full_number,
            "status": created_sf.status,
        }

    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_cancel(request, pk):
    """Atšaukti sąskaitą + каскад на связанные."""
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)

    if invoice.status in ("cancelled", "draft"):
        return Response(
            {"detail": "Ši sąskaita negali būti anuliuota."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()

    with transaction.atomic():
        invoice.status = "cancelled"
        invoice.cancelled_at = now
        invoice.save(update_fields=["status", "cancelled_at", "updated_at"])

        # Каскад: išankstinė → derived SF/PVM SF
        if invoice.invoice_type == "isankstine":
            invoice.derived_invoices.filter(
                invoice_type__in=["pvm_saskaita", "saskaita"],
            ).exclude(
                status="cancelled",
            ).update(status="cancelled", cancelled_at=now, updated_at=now)

        # Каскад: SF/PVM SF → source išankstinė
        if (
            invoice.invoice_type in ("pvm_saskaita", "saskaita")
            and invoice.source_invoice_id
        ):
            Invoice.objects.filter(
                pk=invoice.source_invoice_id,
                invoice_type="isankstine",
                user=request.user,
            ).exclude(
                status="cancelled",
            ).update(status="cancelled", cancelled_at=now, updated_at=now)

    serializer = InvoiceDetailSerializer(invoice, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_duplicate(request, pk):
    """
    Скопировать счёт как новый draft.
    Копируются все данные и line items, но без номера/серии/статуса.
    """
    source = get_object_or_404(Invoice, pk=pk, user=request.user)

    # Поля которые НЕ копируем
    skip_fields = {
        "id", "uuid", "status", "document_series", "document_number",
        "pdf_file", "sent_at", "sent_to_email", "paid_at", "cancelled_at",
        "optimum_api_status", "optimum_last_try_date",
        "dineta_api_status", "dineta_last_try_date",
        "created_at", "updated_at",
    }

    new_data = {}
    for field in Invoice._meta.get_fields():
        if not hasattr(field, "attname"):
            continue
        name = field.attname
        if name in skip_fields:
            continue
        new_data[name] = getattr(source, name)

    new_data["status"] = "draft"
    new_data["invoice_date"] = timezone.now().date()

    with transaction.atomic():
        new_invoice = Invoice.objects.create(**new_data)

        # Копируем line items
        for li in source.line_items.order_by("sort_order", "id"):
            li_data = {}
            for field in InvoiceLineItem._meta.get_fields():
                if not hasattr(field, "attname"):
                    continue
                if field.attname in ("id", "invoice_id"):
                    continue
                li_data[field.attname] = getattr(li, field.attname)
            InvoiceLineItem.objects.create(invoice=new_invoice, **li_data)

    serializer = InvoiceDetailSerializer(new_invoice, context={"request": request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_create_pvm_sf(request, pk):
    source = get_object_or_404(Invoice, pk=pk, user=request.user)

    if not source.can_create_pvm_sf:
        if source.invoice_type != "isankstine":
            msg = "SF galima sukurti tik iš išankstinės sąskaitos."
        elif source.status not in ("issued", "sent", "paid"):
            msg = "Išankstinė sąskaita turi būti išrašyta."
        else:
            msg = "SF jau sukurta iš šios išankstinės sąskaitos."
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    from .services.auto_sf import create_sf_from_isankstine

    try:
        new_invoice = create_sf_from_isankstine(
            source=source,
            user=request.user,
            series_prefix=None,
        )
    except ValueError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    if not new_invoice:
        return Response({"detail": "SF jau sukurta."}, status=status.HTTP_400_BAD_REQUEST)

    serializer = InvoiceDetailSerializer(new_invoice, context={"request": request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# ════════════════════════════════════════════════════════════
# Invoice Summary — counts для табов (overdue на лету)
# ════════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_summary(request):
    user = request.user
    today = date.today()

    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    base_qs = Invoice.objects.filter(user=user).exclude(source_invoice__isnull=False)

    if date_from:
        base_qs = base_qs.filter(invoice_date__gte=date_from)
    if date_to:
        base_qs = base_qs.filter(invoice_date__lte=date_to)

    israsytos_qs = base_qs.filter(
        status__in=["issued", "sent"]
    ).filter(Q(due_date__gte=today) | Q(due_date__isnull=True))

    veluojancios_qs = base_qs.filter(
        status__in=["issued", "sent"], due_date__lt=today,
    )

    apmoketos_qs = base_qs.filter(status="paid")
    juodrasciai_qs = base_qs.filter(status="draft")
    cancelled_qs = base_qs.filter(status="cancelled")
    exported_qs = base_qs.filter(exported=True)

    def _agg(qs):
        agg = qs.aggregate(total=Sum("amount_with_vat"), count=Count("id"))
        return {
            "count": agg["count"] or 0,
            "total": str(agg["total"] or Decimal("0.00")),
        }

    return Response({
        "israsytos": _agg(israsytos_qs),
        "veluojancios": _agg(veluojancios_qs),
        "apmoketos": _agg(apmoketos_qs),
        "juodrasciai": _agg(juodrasciai_qs),
        "cancelled": _agg(cancelled_qs),
        "exported": _agg(exported_qs),
    })


# ════════════════════════════════════════════════════════════
# Public — Просмотр счёта покупателем (без авторизации)
# ════════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([AllowAny])
def invoice_public(request, uuid):
    invoice = get_object_or_404(Invoice, uuid=uuid)

    if not invoice.public_link_enabled:
        return Response(
            {"detail": "Ši sąskaita nėra vieša."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if invoice.status == "draft":
        return Response(
            {"detail": "Sąskaita dar neišrašyta."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = InvoicePublicSerializer(invoice, context={'request': request})
    data = serializer.data

    # --- Watermark for free plan ---
    show_watermark = False
    try:
        sub = getattr(invoice.user, "inv_subscription", None)
        if sub:
            sub.check_and_expire()
            show_watermark = sub.status == "free"
    except Exception:
        pass
    data["show_watermark"] = show_watermark

    return Response(data)


@api_view(["GET"])
@permission_classes([AllowAny])
def invoice_public_pdf(request, uuid):
    invoice = get_object_or_404(Invoice, uuid=uuid)

    if not invoice.public_link_enabled or invoice.status == "draft":
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Логотип
    logo_path = None
    try:
        settings = invoice.user.invoice_settings
        if settings.logo and settings.logo.storage.exists(settings.logo.name):
            logo_path = settings.logo.path
    except Exception:
        pass

    # --- Watermark for free plan ---
    watermark = False
    try:
        from docscanner_app.models import InvSubscription
        sub = InvSubscription.objects.filter(user=invoice.user).first()
        if sub:
            sub.check_and_expire()
            watermark = sub.status == "free"
    except Exception:
        pass

    from .utils.invoice_pdf import generate_invoice_pdf
    pdf_bytes = generate_invoice_pdf(invoice, logo_path=logo_path, watermark=watermark)

    filename = f"saskaita-{invoice.document_series}-{invoice.document_number}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response




"""
Hybrid search: Counterparty (сохранённые клиенты) + Company (все фирмы ЛТ).
Приоритет — сохранённые клиенты. Дедупликация по im_kodas.

Добавить в urls.py:
    path('invoicing/search-companies/', invoice_search_companies, name='invoice-search-companies'),

Добавить в views.py импорт:
    from .views import invoice_search_companies
    (или в тот же файл где остальные invoicing views)
"""

from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_search_companies(request):
    """
    GET /api/invoicing/search-companies/?q=UAB+Senukai&limit=20

    Возвращает:
    [
      {
        "source": "saved",          // или "company"
        "id": 123,                  // PK
        "name": "UAB Senukai",
        "company_code": "234376520",
        "vat_code": "LT234376520",
        "address": "...",
        "phone": "...",
        "email": "...",
        "bank_name": "...",
        "iban": "...",
        "swift": "...",
        "is_person": false,
      }
    ]
    """
    from .models import Counterparty, Company

    q = (request.GET.get("q") or "").strip()
    limit = min(int(request.GET.get("limit") or 20), 50)

    if len(q) < 2:
        return Response([])

    results = []
    seen_codes = set()

    # ── 1. Сохранённые клиенты (Counterparty) — приоритет ──
    cp_qs = Counterparty.objects.filter(user=request.user).filter(
        Q(name__icontains=q)
        | Q(company_code__icontains=q)
        | Q(vat_code__icontains=q)
    )[:limit]

    for cp in cp_qs:
        code = (cp.company_code or "").strip()
        results.append({
            "source": "saved",
            "id": cp.id,
            "name": cp.name or "",
            "company_code": code,
            "vat_code": cp.vat_code or "",
            "address": cp.address or "",
            "phone": cp.phone or "",
            "email": cp.email or "",
            "bank_name": cp.bank_name or "",
            "iban": cp.iban or "",
            "swift": cp.swift or "",
            "is_person": getattr(cp, "is_person", False),
        })
        if code:
            seen_codes.add(code)

    # ── 2. Company (все фирмы ЛТ) — дополняем до limit ──
    remaining = limit - len(results)
    if remaining > 0:
        co_qs = Company.objects.filter(
            Q(pavadinimas__icontains=q)
            | Q(im_kodas__icontains=q)
            | Q(pvm_kodas__icontains=q)
        ).only(
            "id", "pavadinimas", "im_kodas", "pvm_kodas"
        )[:remaining + len(seen_codes)]

        count = 0
        for co in co_qs:
            if count >= remaining:
                break
            code = (co.im_kodas or "").strip()
            if code in seen_codes:
                continue
            seen_codes.add(code)

            results.append({
                "source": "company",
                "id": co.id,
                "name": co.pavadinimas or "",
                "company_code": code,
                "vat_code": co.pvm_kodas or "",
                "address": getattr(co, "adresas", "") or "",
                "phone": "",
                "email": "",
                "bank_name": "",
                "iban": "",
                "swift": "",
                "is_person": False,
            })
            count += 1

    return Response(results)








# ═══════════════════════════════════════════════════════════
# MeasurementUnit views
# ═══════════════════════════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def measurement_unit_list(request):
    """
    GET  — список единиц (auto-создаёт дефолтные при первом вызове)
    POST — создать новую единицу
    """
    user = request.user

    # Авто-создание дефолтных при первом обращении
    MeasurementUnit.create_defaults_for_user(user)

    if request.method == "GET":
        qs = MeasurementUnit.objects.filter(user=user, is_active=True)
        return Response(MeasurementUnitSerializer(qs, many=True).data)

    # POST
    ser = MeasurementUnitSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    code = ser.validated_data["code"]
    # Проверка на дубликат (re-activate если был удалён)
    existing = MeasurementUnit.objects.filter(user=user, code=code).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.name = ser.validated_data.get("name", existing.name)
            existing.save(update_fields=["is_active", "name"])
            return Response(MeasurementUnitSerializer(existing).data, status=status.HTTP_200_OK)
        return Response(
            {"detail": f"Matavimo vienetas '{code}' jau egzistuoja."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    max_order = MeasurementUnit.objects.filter(user=user).count()
    ser.save(user=user, sort_order=max_order)
    return Response(ser.data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def measurement_unit_detail(request, pk):
    try:
        unit = MeasurementUnit.objects.get(pk=pk, user=request.user)
    except MeasurementUnit.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        unit.is_active = False
        unit.is_default = False
        unit.save(update_fields=["is_active", "is_default"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PUT
    ser = MeasurementUnitSerializer(unit, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)

    new_code = ser.validated_data.get("code", unit.code)
    if new_code != unit.code:
        if MeasurementUnit.objects.filter(user=request.user, code=new_code).exclude(pk=pk).exists():
            return Response(
                {"detail": f"Matavimo vienetas '{new_code}' jau egzistuoja."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    obj = ser.save()

    if obj.is_default:
        MeasurementUnit.ensure_only_one_default(request.user, obj.id)

    return Response(MeasurementUnitSerializer(obj).data)


# ═══════════════════════════════════════════════════════════
# InvoiceSeries views
# ═══════════════════════════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def invoice_series_list(request):
    """
    GET  — список серий. ?invoice_type=pvm_saskaita для фильтрации
    POST — создать серию
    """
    user = request.user

    if request.method == "GET":
        qs = InvoiceSeries.objects.filter(user=user, is_active=True)
        invoice_type = request.query_params.get("invoice_type")
        if invoice_type:
            qs = qs.filter(invoice_type=invoice_type)
        return Response(InvoiceSeriesSerializer(qs, many=True).data)

    # POST
    ser = InvoiceSeriesSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    prefix = ser.validated_data["prefix"].strip().upper()
    invoice_type = ser.validated_data["invoice_type"]

    # Уникальность prefix в пределах user
    if InvoiceSeries.objects.filter(user=user, prefix=prefix).exists():
        return Response(
            {"detail": f"Serija '{prefix}' jau egzistuoja."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    is_default = ser.validated_data.get("is_default", False)
    # Если это первая серия для типа — сделать default
    if not InvoiceSeries.objects.filter(user=user, invoice_type=invoice_type, is_active=True).exists():
        is_default = True

    obj = ser.save(user=user, prefix=prefix, is_default=is_default)

    # Ensure only one default
    if is_default:
        InvoiceSeries.ensure_only_one_default(user, invoice_type, obj.id)

    return Response(InvoiceSeriesSerializer(obj).data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def invoice_series_detail(request, pk):
    """
    PUT    — обновить серию (prefix, next_number, padding, is_default, is_active)
    DELETE — soft-delete (is_active=False)
    """
    try:
        series = InvoiceSeries.objects.get(pk=pk, user=request.user)
    except InvoiceSeries.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        series.is_active = False
        series.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PUT
    data = request.data.copy()
    # Prefix всегда uppercase
    if "prefix" in data:
        data["prefix"] = data["prefix"].strip().upper()

    ser = InvoiceSeriesSerializer(series, data=data, partial=True)
    ser.is_valid(raise_exception=True)

    # Проверка уникальности prefix
    new_prefix = ser.validated_data.get("prefix", series.prefix)
    if new_prefix != series.prefix:
        if InvoiceSeries.objects.filter(user=request.user, prefix=new_prefix).exclude(pk=pk).exists():
            return Response(
                {"detail": f"Serija '{new_prefix}' jau egzistuoja."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    obj = ser.save()

    # Ensure only one default
    if ser.validated_data.get("is_default"):
        InvoiceSeries.ensure_only_one_default(request.user, obj.invoice_type, obj.id)

    return Response(InvoiceSeriesSerializer(obj).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_series_check_number(request):
    """
    GET /api/invoicing/series/check-number/?prefix=AA&number=001

    Проверяет, существует ли документ с такой серией и номером.
    Возвращает: { "exists": true/false, "invoice_id": 123 }
    """
    prefix = (request.GET.get("prefix") or "").strip()
    number = (request.GET.get("number") or "").strip()

    if not prefix or not number:
        return Response({"exists": False, "invoice_id": None})

    invoice = Invoice.objects.filter(
        user=request.user,
        document_series=prefix,
        document_number=number,
    ).first()

    return Response({
        "exists": invoice is not None,
        "invoice_id": invoice.id if invoice else None,
    })




from django.db.models import Q, Value, CharField
from django.db.models.functions import Concat


# ────────────────────────────────────────────────────────────
# 1. GET /invoicing/next-number/?series=SF&invoice_type=pvm_saskaita
#    → { "next_number": "001", "preview": "SF-001", "prefix": "SF", "padding": 3 }
# ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_next_number(request):
    """
    Возвращает следующий свободный номер для указанной серии.
    Если серия не указана — берёт default для типа.
    """
    series_prefix = request.query_params.get("series", "").strip()
    invoice_type = request.query_params.get("invoice_type", "pvm_saskaita").strip()

    # Найти серию
    if series_prefix:
        series = InvoiceSeries.objects.filter(
            user=request.user,
            prefix=series_prefix,
            is_active=True,
        ).first()
    else:
        series = InvoiceSeries.get_default_for_type(request.user, invoice_type)

    if not series:
        return Response({"next_number": "", "preview": "", "prefix": "", "padding": 3})

    next_num = series.format_number()

    return Response({
        "next_number": next_num,
        "preview": f"{series.prefix}-{next_num}",
        "prefix": series.prefix,
        "padding": series.padding,
        "raw_next": series.next_number,
    })


# ────────────────────────────────────────────────────────────
# 2. GET /invoicing/check-number/?number=001&series=SF&invoice_type=pvm_saskaita
#    → { "exists": true/false }
# ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_check_number(request):
    """
    Проверяет, существует ли уже счёт с таким номером+серией у пользователя.
    Учитывает только не-отменённые счета.
    """
    number = request.query_params.get("number", "").strip()
    series = request.query_params.get("series", "").strip()
    invoice_type = request.query_params.get("invoice_type", "").strip()

    if not number or not series:
        return Response({"exists": False})

    qs = Invoice.objects.filter(
        user=request.user,
        document_series=series,
        document_number=number,
    ).exclude(
        status="cancelled",
    )

    # Опционально фильтр по типу
    if invoice_type:
        qs = qs.filter(invoice_type=invoice_type)

    return Response({"exists": qs.exists()})


# ────────────────────────────────────────────────────────────
# 3. GET /invoicing/search-products/?q=konsultacij&limit=15
#    → [{ prekes_pavadinimas, prekes_kodas, prekes_barkodas, price, unit, vat_percent }, ...]
#
#    Ищет по ранее использованным товарам/услугам в InvoiceLineItem.
#    Поиск по pavadinimas, kodas, barkodas.
# ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_search_products(request):
    """
    Ищет по ранее использованным товарам/услугам пользователя.
    Источник — InvoiceLineItem из счетов этого пользователя.
    Дедупликация по (pavadinimas, kodas, barkodas).
    """
    q = request.query_params.get("q", "").strip()
    limit = min(int(request.query_params.get("limit", 15)), 50)

    if len(q) < 2:
        return Response([])

    # Все строки из счетов этого пользователя
    qs = InvoiceLineItem.objects.filter(
        invoice__user=request.user,
    ).exclude(
        prekes_pavadinimas="",
    )

    # Поиск по трём полям
    q_upper = q.upper()
    q_filter = (
        Q(prekes_pavadinimas__icontains=q) |
        Q(prekes_kodas__icontains=q) |
        Q(prekes_barkodas__icontains=q)
    )
    qs = qs.filter(q_filter)

    # Берём уникальные комбинации, приоритет — последние использованные
    qs = qs.order_by("-invoice__created_at")

    # Дедупликация в Python (чтобы сохранить последнюю цену)
    seen = set()
    results = []
    for item in qs.iterator():
        key = (
            item.prekes_pavadinimas.strip().upper(),
            item.prekes_kodas.strip().upper(),
        )
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "id": item.id,
            "prekes_pavadinimas": item.prekes_pavadinimas,
            "prekes_kodas": item.prekes_kodas,
            "prekes_barkodas": item.prekes_barkodas,
            "price": float(item.price) if item.price is not None else None,
            "unit": item.unit or "vnt",
            "vat_percent": float(item.vat_percent) if item.vat_percent is not None else None,
        })
        if len(results) >= limit:
            break

    return Response(results)





@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def product_list_create(request):
    """
    GET  — список товаров/услуг (с поиском ?q=... и фильтром ?type=preke|paslauga)
           Пагинация: ?limit=25&offset=0
    POST — создать
    """
    user = request.user

    if request.method == "GET":
        qs = Product.objects.filter(user=user).select_related("measurement_unit")

        q = request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(pavadinimas__icontains=q)
                | Q(kodas__icontains=q)
                | Q(barkodas__icontains=q)
            )

        typ = request.GET.get("type")
        if typ in ("preke", "paslauga"):
            qs = qs.filter(preke_paslauga=typ)

        # Новые сверху
        qs = qs.order_by("-id")
        total = qs.count()

        try:
            limit = int(request.GET.get("limit", 25))
            offset = int(request.GET.get("offset", 0))
        except (ValueError, TypeError):
            limit, offset = 25, 0
        limit = max(1, min(limit, 250))
        offset = max(offset, 0)

        page = qs[offset : offset + limit]
        serializer = ProductListSerializer(page, many=True)
        return Response({"results": serializer.data, "count": total})

    # POST
    serializer = ProductSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save(user=user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def product_detail(request, pk):
    """GET / PUT / DELETE одного товара."""
    obj = get_object_or_404(
        Product.objects.select_related("measurement_unit"),
        pk=pk, user=request.user,
    )

    if request.method == "GET":
        return Response(ProductSerializer(obj, context={"request": request}).data)

    if request.method == "PUT":
        serializer = ProductSerializer(
            obj, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    obj.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)




#Dlia generacii PDF dlia skacivanja iz israsymas

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_pdf(request, pk):
    """Сгенерировать PDF на лету и отдать."""
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)

    if invoice.status == "draft":
        return Response(
            {"detail": "PDF galimas tik išrašytai sąskaitai."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Логотип
    logo_path = None
    try:
        settings = invoice.user.invoice_settings
        if settings.logo and settings.logo.storage.exists(settings.logo.name):
            logo_path = settings.logo.path
    except Exception:
        pass

    # --- Watermark for free plan ---
    watermark = False
    try:
        from docscanner_app.models import InvSubscription
        sub = InvSubscription.objects.filter(user=request.user).first()
        if sub:
            sub.check_and_expire()
            watermark = sub.status == "free"
    except Exception:
        pass

    from .utils.invoice_pdf import generate_invoice_pdf
    pdf_bytes = generate_invoice_pdf(invoice, logo_path=logo_path, watermark=watermark)

    filename = f"{invoice.full_number or invoice.pk}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response



# ────────────────────────────────────────────────────────────
# Recurring invoices
# ────────────────────────────────────────────────────────────

class RecurringInvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_superuser:
            return RecurringInvoice.objects.all().prefetch_related("line_items")
        return RecurringInvoice.objects.filter(
            user=self.request.user
        ).prefetch_related("line_items")

    def get_serializer_class(self):
        if self.action == "list":
            return RecurringInvoiceListSerializer
        if self.action in ("create", "update", "partial_update"):
            return RecurringInvoiceWriteSerializer
        return RecurringInvoiceDetailSerializer

    def _finalize_if_no_future_runs(self, obj):
        """
        Если после пересчета запусков больше нет, переводим в finished.
        Пропущенные во время pause даты НЕ считаются использованными.
        max_count считаем только по generation_count.
        """
        if obj.max_count and obj.generation_count >= obj.max_count:
            obj.status = "finished"
            obj.next_run_at = None
            return

        if not obj.next_run_at:
            obj.status = "finished"
            obj.next_run_at = None
            return

        if obj.end_date and obj.next_run_at.date() > obj.end_date:
            obj.status = "finished"
            obj.next_run_at = None
            return


    def _build_future_dates(self, obj, count):
        """
        Будущие даты только для active + next_run_at.
        Никакого backfill.
        """
        if obj.status != "active" or not obj.next_run_at:
            return []

        if obj.max_count and obj.generation_count >= obj.max_count:
            return []

        future = []
        current_dt = obj.next_run_at
        remaining = None

        if obj.max_count:
            remaining = max(obj.max_count - obj.generation_count, 0)

        for _ in range(count):
            if not current_dt:
                break

            if obj.end_date and current_dt.date() > obj.end_date:
                break

            if remaining is not None and len(future) >= remaining:
                break

            future.append(current_dt.date().isoformat())
            current_dt = obj.compute_next_run_after(from_dt=current_dt)

        return future

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        obj = self.get_object()
        if obj.status != "active":
            return Response(
                {"detail": "Galima pristabdyti tik aktyvią periodinę sąskaitą."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.status = "paused"
        obj.save(update_fields=["status", "updated_at"])
        return Response(RecurringInvoiceDetailSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        obj = self.get_object()
        if obj.status != "paused":
            return Response(
                {"detail": "Galima tęsti tik pristabdytą periodinę sąskaitą."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj.status = "active"

        # Пересчитываем next_run только вперед, без backfill
        obj.refresh_next_run_at()

        # Если future run больше нет, сразу finished
        self._finalize_if_no_future_runs(obj)

        obj.save(update_fields=["status", "next_run_at", "updated_at"])
        return Response(RecurringInvoiceDetailSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        obj = self.get_object()
        if obj.status in ("finished", "cancelled"):
            return Response(
                {"detail": "Periodinė sąskaita jau baigta arba atšaukta."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.status = "cancelled"
        obj.next_run_at = None
        obj.save(update_fields=["status", "next_run_at", "updated_at"])
        return Response(RecurringInvoiceDetailSerializer(obj).data)

    @action(detail=True, methods=["get"])
    def preview_next(self, request, pk=None):
        """Показать когда будут следующие N запусков."""
        obj = self.get_object()
        count = min(int(request.query_params.get("count", 5)), 12)
        dates = self._build_future_dates(obj, count)
        return Response({"dates": dates})

    @action(detail=True, methods=["get"])
    def plan_history(self, request, pk=None):
        """Прошлые runs + будущие даты."""
        obj = self.get_object()
        count = min(int(request.query_params.get("count", 12)), 24)

        # Прошлые (из RecurringInvoiceRun)
        past_runs = obj.runs.order_by("-scheduled_for")[:12].values(
            "scheduled_for", "status", "invoice_id", "error_text", "created_at"
        )
        past = []
        for run in past_runs:
            past.append({
                "date": run["scheduled_for"].date().isoformat() if run["scheduled_for"] else None,
                "status": run["status"],
                "invoice_id": run["invoice_id"],
                "error": run["error_text"][:200] if run["error_text"] else "",
            })

        future = self._build_future_dates(obj, count)

        return Response({
            "past": list(reversed(past)),
            "future": future,
        })




import os
import openpyxl
from django.conf import settings as django_settings
from django.http import FileResponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def counterparty_import_template(request):
    """Скачать XLSX шаблон для импорта контрагентов."""
    file_path = os.path.join(
        django_settings.BASE_DIR, "templates", "israsymas", "kontrahentu_sablonas.xlsx"
    )
    return FileResponse(
        open(file_path, "rb"),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        filename="kontrahentu_sablonas.xlsx",
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def counterparty_import_xlsx(request):
    """Импорт контрагентов из XLSX файла."""
    file = request.FILES.get("file")
    if not file:
        return Response({"detail": "Failas nerastas."}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.endswith((".xlsx", ".xls")):
        return Response({"detail": "Tik .xlsx failai palaikomi."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
        ws = wb.active
    except Exception:
        return Response({"detail": "Nepavyko atidaryti failo."}, status=status.HTTP_400_BAD_REQUEST)

    rows = list(ws.iter_rows(min_row=2, values_only=True))
    if not rows:
        return Response({"detail": "Failas tuščias."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    created = 0
    updated = 0
    errors = []

    # Case-insensitive, с/без диакритиков
    ROLE_MAP = {
        "pirkėjas": "buyer", "pirkejas": "buyer", "buyer": "buyer",
        "pardavėjas": "seller", "pardavejas": "seller", "seller": "seller",
        "abu": "both", "both": "both",
    }

    PERSON_TRUE = {"taip", "yes", "true", "1", "fizinis", "t"}
    PERSON_FALSE = {"ne", "no", "false", "0", "juridinis", "f", ""}


    for row_idx, row in enumerate(rows, start=2):
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue

        def cell_val(idx):
            if idx < len(row) and row[idx] is not None:
                return str(row[idx]).strip()
            return ""

        # Колонки по шаблону
        name = cell_val(0)
        company_code = cell_val(1)
        vat_code = cell_val(2)
        address = cell_val(3)
        country_iso = cell_val(4).upper()
        phone = cell_val(5)
        email = cell_val(6)
        bank_name = cell_val(7)
        iban = cell_val(8)
        swift = cell_val(9)
        is_person_raw = cell_val(10).lower().strip()
        role_raw = cell_val(11).lower().strip()
        delivery_address = cell_val(12)
        extra_info = cell_val(13)

        # Валидация required
        row_errors = []
        if not name:
            row_errors.append("Pavadinimas privalomas")
        if not company_code:
            row_errors.append("Įmonės kodas privalomas")
        if row_errors:
            errors.append({"row": row_idx, "name": name or "—", "errors": row_errors})
            continue

        # Парсинг — всё case-insensitive
        is_person = is_person_raw in PERSON_TRUE
        default_role = ROLE_MAP.get(role_raw, "buyer")

        # Country — если указан ISO, берём его; иначе LT по умолчанию
        if not country_iso:
            country_iso = "LT"
        country_name = COUNTRY_NAME_LT.get(country_iso, country_iso)

        try:
            cp, is_new = Counterparty.objects.update_or_create(
                user=user,
                company_code=company_code,
                defaults={
                    "name": name,
                    "name_normalized": name.strip().upper(),
                    "vat_code": vat_code,
                    "address": address,
                    "country": country_name,
                    "country_iso": country_iso,
                    "phone": phone,
                    "email": email,
                    "bank_name": bank_name,
                    "iban": iban,
                    "swift": swift,
                    "is_person": is_person,
                    "default_role": default_role,
                    "delivery_address": delivery_address,
                    "extra_info": extra_info,
                },
            )
            if is_new:
                created += 1
            else:
                updated += 1
        except Exception as e:
            errors.append({"row": row_idx, "name": name, "errors": [str(e)[:200]]})

    return Response({
        "created": created,
        "updated": updated,
        "total_rows": len(rows),
        "errors": errors,
    })





@api_view(["GET"])
@permission_classes([IsAuthenticated])
def product_import_template(request):
    """Скачать XLSX шаблон для импорта товаров/услуг."""
    file_path = os.path.join(
        django_settings.BASE_DIR, "templates", "israsymas", "prekiu_sablonas.xlsx"
    )
    return FileResponse(
        open(file_path, "rb"),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        filename="prekiu_sablonas.xlsx",
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def product_import_xlsx(request):
    """Импорт товаров/услуг из XLSX файла."""
    file = request.FILES.get("file")
    if not file:
        return Response({"detail": "Failas nerastas."}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.endswith((".xlsx", ".xls")):
        return Response({"detail": "Tik .xlsx failai palaikomi."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
        ws = wb.active
    except Exception:
        return Response({"detail": "Nepavyko atidaryti failo."}, status=status.HTTP_400_BAD_REQUEST)

    rows = list(ws.iter_rows(min_row=2, values_only=True))
    if not rows:
        return Response({"detail": "Failas tuščias."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    created = 0
    updated = 0
    errors = []

    TYPE_MAP = {
        "prekė": "preke", "preke": "preke", "prekė": "preke",
        "paslauga": "paslauga", "paslaugą": "paslauga",
        "product": "preke", "service": "paslauga",
    }

    # Загрузить measurement units для маппинга по коду
    from .models import MeasurementUnit
    unit_map = {}
    for u in MeasurementUnit.objects.filter(user=user):
        unit_map[u.code.lower()] = u
        if u.name:
            unit_map[u.name.lower()] = u

    for row_idx, row in enumerate(rows, start=2):
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue

        def cell_val(idx):
            if idx < len(row) and row[idx] is not None:
                return str(row[idx]).strip()
            return ""

        pavadinimas = cell_val(0)
        kodas = cell_val(1)
        barkodas = cell_val(2)
        type_raw = cell_val(3).lower()
        unit_raw = cell_val(4)
        price_raw = cell_val(5)
        pvm_raw = cell_val(6)

        # Валидация required
        row_errors = []
        if not pavadinimas:
            row_errors.append("Pavadinimas privalomas")
        if not kodas:
            row_errors.append("Kodas privalomas")
        if row_errors:
            errors.append({"row": row_idx, "name": pavadinimas or "—", "errors": row_errors})
            continue

        # Тип
        preke_paslauga = TYPE_MAP.get(type_raw, "preke")

        # Mato vienetas
        measurement_unit = None
        if unit_raw:
            measurement_unit = unit_map.get(unit_raw.lower())
            if not measurement_unit:
                existing_codes = ", ".join(sorted(set(
                    u.code for u in unit_map.values()
                )))
                row_errors.append(
                    f'Mato vienetas "{unit_raw}" nerastas. '
                    f'Sukurkite tokį matavimo vienetą arba naudokite vieną iš jau sukurtų: {existing_codes}'
                )

        # Цена
        pardavimo_kaina = 0
        if price_raw:
            try:
                pardavimo_kaina = float(price_raw.replace(",", ".").replace(" ", ""))
            except ValueError:
                row_errors.append(f"Neteisinga kaina: {price_raw}")

        # PVM
        pvm_procentas = None
        if pvm_raw:
            try:
                pvm_val = int(float(pvm_raw.replace(",", ".").replace("%", "").strip()))
                if 0 <= pvm_val <= 100:
                    pvm_procentas = pvm_val
                else:
                    row_errors.append(f"PVM turi būti 0-100: {pvm_raw}")
            except (ValueError, TypeError):
                row_errors.append(f"Neteisingas PVM: {pvm_raw}")

        if row_errors:
            errors.append({"row": row_idx, "name": pavadinimas, "errors": row_errors})
            continue

        try:
            obj, is_new = Product.objects.update_or_create(
                user=user,
                kodas=kodas,
                defaults={
                    "pavadinimas": pavadinimas,
                    "barkodas": barkodas,
                    "preke_paslauga": preke_paslauga,
                    "measurement_unit": measurement_unit,
                    "pardavimo_kaina": pardavimo_kaina,
                    "pvm_procentas": pvm_procentas,
                },
            )
            if is_new:
                created += 1
            else:
                updated += 1
        except Exception as e:
            errors.append({"row": row_idx, "name": pavadinimas, "errors": [str(e)[:200]]})

    return Response({
        "created": created,
        "updated": updated,
        "total_rows": len(rows),
        "errors": errors,
    })












# ────────────────────────────────────────────────────────────
# Banko israso importas
# ────────────────────────────────────────────────────────────
"""
API Views для банковского импорта и платежей.

Bank Import:
  POST   /api/bank-import/upload/
  GET    /api/bank-import/statements/
  GET    /api/bank-import/statements/<id>/
  DELETE /api/bank-import/statements/<id>/
  POST   /api/bank-import/statements/<id>/re-match/

Payment Management:
  GET    /api/bank-import/invoice/<id>/payments/     ← PaymentProofDialog data
  POST   /api/bank-import/invoice/<id>/mark-paid/    ← MarkPaidDialog
  POST   /api/bank-import/invoice/<id>/remove-payment/<alloc_id>/

Matching Actions:
  POST   /api/bank-import/confirm/
  POST   /api/bank-import/bulk-confirm/
  POST   /api/bank-import/reject/

Dashboard:
  GET    /api/bank-import/stats/
"""

from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BankStatement, PaymentAllocation
from .serializers import (
    BankStatementListSerializer,
    BankStatementUploadSerializer,
    BulkConfirmSerializer,
    ConfirmAllocationSerializer,
    InvoicePaymentDetailsSerializer,
    MarkPaidSerializer,
)
from .services.payment_service import BankImportService, PaymentService, BankImportError


class Pagination50(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


# ────────────────────────────────────────────────────────────
# Bank Statement Upload & List
# ────────────────────────────────────────────────────────────


class StatementUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # --- Inv subscription: bank_import check ---
        allowed, err = check_inv_feature(request.user, "bank_import")
        if not allowed:
            return Response(err, status=status.HTTP_403_FORBIDDEN)

        ser = BankStatementUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        svc = BankImportService(request.user)
        try:
            stmt = svc.import_statement(
                file=ser.validated_data["file"],
                bank_name=ser.validated_data.get("bank_name", ""),
                file_format=ser.validated_data.get("file_format", ""),
                original_filename=ser.validated_data["file"].name,
            )
        except BankImportError as e:

            from .celery_signals import _send_telegram
            _send_telegram(
                f"🏦 <b>Bank import failed</b>\n"
                f"User: {request.user.email}\n"
                f"File: {ser.validated_data['file'].name}\n"
                f"Error: {str(e)[:300]}"
            )

            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            BankStatementListSerializer(stmt).data,
            status=status.HTTP_201_CREATED,
        )


class StatementListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BankStatementListSerializer
    pagination_class = Pagination50

    def get_queryset(self):
        return BankStatement.objects.filter(user=self.request.user)


class StatementDetailView(generics.RetrieveDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BankStatementListSerializer
 
    def get_queryset(self):
        return BankStatement.objects.filter(user=self.request.user)
 
    def perform_destroy(self, instance):
        if instance.status != "error":
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"detail": "Galima ištrinti tik išrašus su klaida. "
                           "Sėkmingai importuoti išrašai negali būti ištrinti."}
            )
        instance.delete()


class StatementReMatchView(APIView):
    permission_classes = [permissions.IsAuthenticated]
 
    def post(self, request, pk):
        stmt = get_object_or_404(BankStatement, pk=pk, user=request.user)
 
        if stmt.status != "processed":
            return Response(
                {"detail": "Pakartotinis susiejimas galimas tik apdorotiems išrašams."},
                status=status.HTTP_400_BAD_REQUEST,
            )
 
        svc = BankImportService(request.user)
        svc.re_match_statement(stmt)
 
        # Auto SF for any newly auto_matched
        for txn in stmt.incoming_transactions.filter(match_status="auto_matched"):
            for alloc in txn.allocations.filter(status="auto"):
                try:
                    from .services.auto_sf import maybe_auto_create_sf
                    created_sf = maybe_auto_create_sf(alloc.invoice)
                    if created_sf:
                        logger.info(
                            "[ReMatch] Auto SF created: %s for invoice %s",
                            created_sf.full_number, alloc.invoice.full_number,
                        )
                except Exception as e:
                    logger.warning("[ReMatch] Auto SF failed: %s", e)
 
        return Response(BankStatementListSerializer(stmt).data)


# ────────────────────────────────────────────────────────────
# Invoice Payment Details (для PaymentProofDialog)
# ────────────────────────────────────────────────────────────


class InvoicePaymentDetailsView(APIView):
    """
    GET /api/bank-import/invoice/<id>/payments/

    Возвращает полную информацию о платежах invoice.
    Используется PaymentProofDialog на фронте.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        from .models import Invoice
        invoice = get_object_or_404(Invoice, pk=pk, user=request.user)
        svc = PaymentService(request.user)
        data = svc.get_invoice_payment_details(invoice)
        serializer = InvoicePaymentDetailsSerializer(data)
        return Response(serializer.data)


# ────────────────────────────────────────────────────────────
# Mark Paid (refactored — для MarkPaidDialog)
# ────────────────────────────────────────────────────────────


class InvoiceMarkPaidView(APIView):
    """
    POST /api/bank-import/invoice/<id>/mark-paid/

    Ручная пометка invoice как оплаченный.
    Создаёт PaymentAllocation с source="manual".

    Body: { amount, payment_date, note? }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        from .models import Invoice

        invoice = get_object_or_404(Invoice, pk=pk, user=request.user)

        if invoice.status not in ("issued", "sent", "partially_paid"):
            return Response(
                {"detail": "Galima pažymėti tik išrašytą/išsiųstą/dalinai apmokėtą sąskaitą."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = MarkPaidSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        svc = PaymentService(request.user)
        alloc = svc.mark_paid_manual(
            invoice=invoice,
            amount=ser.validated_data["amount"],
            payment_date=ser.validated_data["payment_date"],
            note=ser.validated_data.get("note", ""),
        )

        # Auto SF creation (existing logic)
        from .services.auto_sf import maybe_auto_create_sf
        created_sf = maybe_auto_create_sf(invoice)

        # Reload invoice
        invoice.refresh_from_db()

        # Build response
        from .serializers import InvoiceDetailSerializer
        data = InvoiceDetailSerializer(invoice, context={"request": request}).data
        data["allocation_id"] = alloc.id
        if created_sf:
            data["auto_created_sf"] = {
                "id": created_sf.id,
                "full_number": created_sf.full_number,
                "status": created_sf.status,
            }

        return Response(data)


class RemoveManualPaymentView(APIView):
    """
    POST /api/bank-import/invoice/<invoice_id>/remove-payment/<alloc_id>/

    Удаление ручной пометки оплаты.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, alloc_id):
        svc = PaymentService(request.user)
        try:
            svc.remove_manual_payment(int(alloc_id))
            return Response({"status": "removed"})
        except PaymentAllocation.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)


# ────────────────────────────────────────────────────────────
# Matching Actions
# ────────────────────────────────────────────────────────────


class ConfirmAllocationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ser = ConfirmAllocationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        svc = PaymentService(request.user)
        try:
            alloc = svc.confirm_allocation(ser.validated_data["allocation_id"])
            return Response({"status": "confirmed", "allocation_id": alloc.id})
        except PaymentAllocation.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)


class BulkConfirmView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ser = BulkConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        svc = PaymentService(request.user)
        confirmed, errors = [], []
        for aid in ser.validated_data["allocation_ids"]:
            try:
                alloc = svc.confirm_allocation(aid)
                confirmed.append(alloc.id)
            except PaymentAllocation.DoesNotExist:
                errors.append(aid)

        return Response({"confirmed": confirmed, "errors": errors})


class RejectAllocationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        aid = request.data.get("allocation_id")
        if not aid:
            return Response({"error": "allocation_id required"}, status=400)

        svc = PaymentService(request.user)
        try:
            svc.reject_allocation(int(aid))
            return Response({"status": "rejected"})
        except PaymentAllocation.DoesNotExist:
            return Response({"error": "Not found"}, status=404)


# ────────────────────────────────────────────────────────────
# Stats
# ────────────────────────────────────────────────────────────


class ImportStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import IncomingTransaction
        from django.db.models import Sum

        user = request.user
        stmts = BankStatement.objects.filter(user=user)
        txns = IncomingTransaction.objects.filter(user=user)

        return Response({
            "total_statements": stmts.count(),
            "total_incoming": txns.count(),
            "auto_matched": txns.filter(match_status="auto_matched").count(),
            "likely_matched": txns.filter(match_status="likely_matched").count(),
            "confirmed": txns.filter(match_status="confirmed").count(),
            "unmatched": txns.filter(match_status="unmatched").count(),
            "total_credit_amount": (
                txns.aggregate(t=Sum("amount"))["t"] or 0
            ),
            "total_allocated_amount": (
                PaymentAllocation.objects
                .filter(invoice__user=user, status__in=["confirmed", "auto", "manual"])
                .aggregate(t=Sum("amount"))["t"] or 0
            ),
        })





# ────────────────────────────────────────────────────────────
# Dlia direct payment linkov v invoicax
# ────────────────────────────────────────────────────────────
"""
Payment-provider endpoints.

Endpoints:
  POST /api/invoicing/invoices/{id}/generate-payment-link/   (auth)
  GET  /api/invoicing/payment-providers/                      (auth)
  POST /api/invoicing/payment-providers/connect/              (auth)
  POST /api/invoicing/payment-providers/disconnect/           (auth)
  *    /api/invoicing/payment-webhook/{provider}/{invoice_id}/ (public)
"""

import hashlib
import json
import logging
import time as pytime
from datetime import time as dt_time
import urllib.parse
from base64 import b64encode

import jwt
import requests as http_requests
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone as tz
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Invoice
from .services.payment_link_service import PaymentLinkService

logger = logging.getLogger("docscanner_app")

PAYMENT_ENV = getattr(settings, "PAYMENT_ENVIRONMENT", "sandbox")

MONTONIO_BASE_URLS = {
    "sandbox": "https://sandbox-stargate.montonio.com/api",
    "production": "https://stargate.montonio.com/api",
}


# ────────────────────────────────────────────────────────────
# 1. Generate payment link for an invoice
# ────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_payment_link(request, invoice_id):
    provider_name = request.data.get("provider", "montonio")

    try:
        invoice = Invoice.objects.get(id=invoice_id, user=request.user)
    except Invoice.DoesNotExist:
        return Response({"detail": "Sąskaita nerasta"}, status=404)

    if invoice.status == "cancelled":
        return Response(
            {"detail": "Negalima sukurti mokėjimo nuorodos atšauktai sąskaitai"},
            status=400,
        )

    service = PaymentLinkService(request.user)

    try:
        result = service.create_for_invoice(invoice, provider_name)
    except ValueError as e:
        return Response({"detail": str(e)}, status=400)
    except Exception as e:
        logger.exception("generate_payment_link error: invoice=%s", invoice_id)

        from .celery_signals import _send_telegram
        _send_telegram(
            f"💳 <b>Payment link failed</b>\n"
            f"Invoice: {invoice_id}\n"
            f"Provider: {provider_name}\n"
            f"User: {request.user.email}\n"
            f"Error: {str(e)[:300]}"
        )

        return Response(
            {"detail": f"Klaida kuriant mokėjimo nuorodą: {e}"},
            status=500,
        )

    return Response({
        "payment_url": result.url,
        "provider": provider_name,
        "provider_payment_id": result.provider_payment_id,
    })


# ────────────────────────────────────────────────────────────
# 2. Available providers
# ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_payment_providers(request):
    service = PaymentLinkService(request.user)
    return Response(service.get_available_providers())


# ────────────────────────────────────────────────────────────
# 3. Connect: save + test + return result
# ────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def connect_payment_provider(request):
    """
    POST /api/invoicing/payment-providers/connect/

    Saves credentials, runs a live test, saves result to DB.
    """
    provider_name = request.data.get("provider")
    if not provider_name:
        return Response({"detail": "Nenurodytas teikėjas"}, status=400)

    data = request.data
    error = _validate_provider_fields(provider_name, data)
    if error:
        return Response({"connected": False, "error": error}, status=400)

    save_data = {**data, "environment": PAYMENT_ENV}

    # Save credentials first
    try:
        PaymentLinkService.save_provider_config(
            user=request.user,
            provider_name=provider_name,
            data=save_data,
        )
    except ValueError as e:
        return Response({"connected": False, "error": str(e)}, status=400)

    # Test connection
    logger.info("=" * 60)
    logger.info("Testing %s connection for user=%s", provider_name, request.user.id)

    connected, test_error, provider_response, raw_response = _test_provider_connection(
        provider_name, data
    )

    logger.info(
        "Test result: connected=%s, error=%s, methods=%s",
        connected, test_error,
        len(provider_response) if provider_response else 0,
    )
    logger.info("=" * 60)

    # Build test result
    last_test_result = {
        "tested_at": tz.now().isoformat(),
        "connected": connected,
        "error": test_error,
        "methods_count": len(provider_response) if provider_response else 0,
        "raw_response": raw_response,
    }

    # Always save test result
    final_data = {
        **save_data,
        "last_test_result": last_test_result,
    }
    if connected and provider_response:
        final_data["available_methods"] = provider_response

    logger.info(
        "Saving to DB for %s: keys=%s",
        provider_name, list(final_data.keys()),
    )

    try:
        PaymentLinkService.save_provider_config(
            user=request.user,
            provider_name=provider_name,
            data=final_data,
        )
        logger.info("Saved test result to DB for %s", provider_name)
    except Exception as e:
        logger.exception("FAILED to save test result for %s: %s", provider_name, e)

    return Response({
        "connected": connected,
        "error": test_error,
        "available_methods": provider_response,
    })


# ────────────────────────────────────────────────────────────
# 4. Disconnect (delete keys)
# ────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def disconnect_payment_provider(request):
    provider_name = request.data.get("provider")
    if not provider_name:
        return Response({"detail": "Nenurodytas teikėjas"}, status=400)

    try:
        PaymentLinkService.save_provider_config(
            user=request.user,
            provider_name=provider_name,
            data={"provider": provider_name},  # empty = cleared
        )
    except ValueError as e:
        return Response({"detail": str(e)}, status=400)

    return Response({"status": "ok"})


# ────────────────────────────────────────────────────────────
# 5. Webhook (public)
# ────────────────────────────────────────────────────────────

@csrf_exempt
def payment_webhook(request, provider_name, invoice_id):
    """
    POST/GET /api/invoicing/payment-webhook/{provider}/{invoice_id}/
    Called by Montonio/Paysera after payment. No Django auth — verified via provider signature.
    """
    logger.info("=" * 60)
    logger.info(
        "[Webhook] Incoming: provider=%s, invoice=%s, method=%s",
        provider_name, invoice_id, request.method,
    )
    logger.info("[Webhook] GET params: %s", dict(request.GET.items()))
 
    if request.method == "POST":
        ct = request.content_type or ""
        logger.info("[Webhook] Content-Type: %s", ct)
        logger.info("[Webhook] POST body (first 1000): %s", request.body[:1000].decode("utf-8", errors="replace"))
 
    request_data = _extract_webhook_data(request)
    logger.info("[Webhook] Parsed data keys: %s", list(request_data.keys()))
 
    # Log key fields per provider
    if provider_name == "montonio":
        token = request_data.get("payment_token") or request_data.get("orderToken") or ""
        logger.info("[Webhook][Montonio] Token present: %s, length: %d", bool(token), len(token))
    elif provider_name == "paysera":
        logger.info(
            "[Webhook][Paysera] data=%s..., ss1=%s",
            (request_data.get("data", ""))[:60],
            request_data.get("ss1", ""),
        )
 
    try:
        allocation = PaymentLinkService.handle_webhook(
            provider_name, int(invoice_id), request_data
        )
 
        if allocation:
            logger.info(
                "[Webhook] SUCCESS: allocation_id=%s, amount=%s, invoice=%s → status=%s",
                allocation.id, allocation.amount, invoice_id,
                allocation.invoice.status if hasattr(allocation, 'invoice') else "?",
            )
        else:
            logger.info("[Webhook] No allocation created (duplicate or not finalized)")
 
        logger.info("=" * 60)
 
        if provider_name == "paysera":
            return HttpResponse("OK", content_type="text/plain")
 
        status_str = "ok" if allocation else "ignored"
        return JsonResponse({"status": status_str})
 
    except Exception as e:
        logger.exception(
            "[Webhook] ERROR: provider=%s invoice=%s error=%s",
            provider_name, invoice_id, e,
        )

        from .celery_signals import _send_telegram
        _send_telegram(
            f"💳 <b>Payment webhook error</b>\n"
            f"Provider: {provider_name}\n"
            f"Invoice: {invoice_id}\n"
            f"Error: {str(e)[:300]}"
        )

        logger.info("=" * 60)
 
        # Always 200 — prevent infinite retries from provider
        if provider_name == "paysera":
            return HttpResponse("OK", content_type="text/plain")
        return JsonResponse({"status": "error", "detail": str(e)}, status=200)


# ════════════════════════════════════════════════════════════
# Internal helpers
# ════════════════════════════════════════════════════════════

def _validate_provider_fields(provider_name: str, data: dict) -> str | None:
    if provider_name == "montonio":
        if not data.get("access_key"):
            return "Įveskite Montonio Access Key"
        if not data.get("secret_key"):
            return "Įveskite Montonio Secret Key"
    elif provider_name == "paysera":
        if not data.get("project_id"):
            return "Įveskite Paysera projekto ID"
        if not data.get("sign_password"):
            return "Įveskite Paysera parašo slaptažodį"
    else:
        return f"Nežinomas teikėjas: {provider_name}"
    return None


def _test_provider_connection(
    provider_name: str, data: dict
) -> tuple[bool, str | None, list | None, dict | None]:
    """Returns (connected, error, methods, raw_response)."""
    if provider_name == "montonio":
        return _test_montonio(data)
    elif provider_name == "paysera":
        return _test_paysera(data)
    return False, f"Nežinomas teikėjas: {provider_name}", None, None


# ── Montonio ─────────────────────────────────────────────────

def _test_montonio(data: dict) -> tuple[bool, str | None, list | None, dict | None]:
    access_key = data.get("access_key", "")
    secret_key = data.get("secret_key", "")
    base_url = MONTONIO_BASE_URLS.get(PAYMENT_ENV, MONTONIO_BASE_URLS["sandbox"])

    try:
        now = int(pytime.time())
        payload = {"access_key": access_key, "iat": now, "exp": now + 600}
        token = jwt.encode(payload, secret_key, algorithm="HS256")

        url = f"{base_url}/stores/payment-methods"
        logger.info("[Montonio] GET %s (access_key=%s...)", url, access_key[:8])

        resp = http_requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            params={"currency": "EUR"},
            timeout=15,
        )

        logger.info(
            "[Montonio] Response: status=%s body=%s",
            resp.status_code, resp.text[:500],
        )

        raw = {
            "status_code": resp.status_code,
            "body": resp.text[:1000],
        }

        if resp.status_code == 200:
            methods = resp.json()
            logger.info("[Montonio] OK — %d payment methods", len(methods))
            return True, None, methods, raw

        # Parse error from JSON
        try:
            err_body = resp.json()
            montonio_msg = err_body.get("message", "")
            raw["provider_error"] = montonio_msg
        except Exception:
            montonio_msg = ""

        error_map = {
            "ACCESS_KEY_NOT_FOUND": "Montonio Access Key nerastas – patikrinkite raktą",
            "INVALID_SIGNATURE": "Neteisingas Secret Key – patikrinkite raktą",
            "UNAUTHORIZED": "Neteisingi Montonio raktai",
        }

        if montonio_msg in error_map:
            return False, error_map[montonio_msg], None, raw

        if resp.status_code in (400, 401, 403):
            return False, f"Montonio klaida: {montonio_msg or f'HTTP {resp.status_code}'}", None, raw

        return False, f"Montonio netikėtas atsakymas (HTTP {resp.status_code})", None, raw

    except http_requests.Timeout:
        return False, "Montonio neatsako – bandykite vėliau", None, {"timeout": True}
    except Exception as e:
        logger.exception("[Montonio] Test error")
        return False, f"Klaida jungiantis prie Montonio: {e}", None, {"exception": str(e)}


# ── Paysera ──────────────────────────────────────────────────

def _test_paysera(data: dict) -> tuple[bool, str | None, list | None, dict | None]:
    """
    Paysera test: build a signed payment request and POST to Paysera.
    Follow redirects to see the final page — check for errors in HTML.
    """
    project_id = data.get("project_id", "").strip()
    sign_password = data.get("sign_password", "").strip()

    if not project_id.isdigit():
        return False, "Paysera projekto ID turi būti skaičius", None, None
    if len(sign_password) < 5:
        return False, "Paysera parašo slaptažodis per trumpas", None, None

    try:
        # 1. Build params
        params = {
            "projectid": project_id,
            "orderid": "test_connection_check",
            "amount": "100",
            "currency": "EUR",
            "country": "LT",
            "test": "0" if PAYMENT_ENV == "production" else "1",
            "version": "1.6",
            "accepturl": "https://localhost/accept",
            "cancelurl": "https://localhost/cancel",
            "callbackurl": "https://localhost/callback",
        }

        # 2. URL-encode → url-safe base64
        query_string = urllib.parse.urlencode(params)
        b64_data = b64encode(query_string.encode()).decode()
        b64_data_safe = b64_data.replace("+", "-").replace("/", "_")

        # 3. sign = md5(data + password)
        sign = hashlib.md5((b64_data_safe + sign_password).encode()).hexdigest()

        logger.info("[Paysera] POST https://www.paysera.com/pay/ (project=%s)", project_id)
        logger.info("[Paysera] data=%s..., sign=%s", b64_data_safe[:60], sign)

        # 4. POST — follow redirects to get final page
        resp = http_requests.post(
            "https://www.paysera.com/pay/",
            data={"data": b64_data_safe, "sign": sign},
            timeout=20,
            allow_redirects=True,  # follow all redirects
        )

        final_url = resp.url
        status = resp.status_code
        body = resp.text[:2000] if resp.text else ""
        body_lower = body.lower()

        logger.info("[Paysera] Final URL: %s", final_url)
        logger.info("[Paysera] Final status: %s", status)
        logger.info("[Paysera] Body (first 1000): %s", body[:1000])

        raw = {
            "final_url": final_url,
            "status_code": status,
        }

        # 5. Analyze final page — check URL first, then body
        # Error patterns in URL (Paysera puts error info in URL path)
        url_lower = final_url.lower()
        url_has_error = any(kw in url_lower for kw in [
            "error", "bad_request", "pick_payment_error",
        ])

        if url_has_error:
            # Extract error_code from URL if present (e.g. error_code/0x6)
            error_code = ""
            if "error_code/" in final_url:
                parts = final_url.split("error_code/")
                if len(parts) > 1:
                    error_code = parts[1].split("/")[0]

            logger.warning(
                "[Paysera] Error in URL: %s (error_code=%s)", final_url, error_code,
            )

            raw["error_code"] = error_code

            # Map known error codes
            error_messages = {
                "0x1": "Neteisingi parametrai – patikrinkite projekto nustatymus",
                "0x2": "Neteisingi parametrai",
                "0x3": "Netinkama valiuta arba suma",
                "0x4": "Neteisingas parašas (sign) – patikrinkite parašo slaptažodį",
                "0x6": "Neteisingas projekto ID arba parašo slaptažodis",
            }

            err_msg = error_messages.get(
                error_code,
                "Paysera atmetė užklausą – patikrinkite projekto ID ir parašo slaptažodį",
            )
            return False, err_msg, None, raw

        # No error in URL — check body for payment page
        is_payment_page = any(kw in body_lower for kw in [
            "payment", "mokėjim", "choose", "bank", "pasirink",
        ])

        if is_payment_page:
            logger.info("[Paysera] Payment page reached — credentials OK")
            methods = _fetch_paysera_methods(project_id)
            return True, None, methods, raw

        # Not clearly error, not clearly payment — log everything
        logger.warning(
            "[Paysera] Unclear response. URL=%s status=%s body_snippet=%s",
            final_url, status, body[:300],
        )
        return (
            False,
            f"Neaiškus Paysera atsakymas (HTTP {status}). "
            "Patikrinkite projekto ID ir parašo slaptažodį.",
            None,
            raw,
        )

    except http_requests.Timeout:
        return False, "Paysera neatsako – bandykite vėliau", None, {"timeout": True}
    except Exception as e:
        logger.exception("[Paysera] Test error")
        return False, f"Klaida jungiantis prie Paysera: {e}", None, {"exception": str(e)}


def _fetch_paysera_methods(project_id: str) -> list | None:
    """Fetch available payment methods XML (public endpoint)."""
    import xml.etree.ElementTree as ET

    url = f"https://www.paysera.com/new/api/paymentMethods/{project_id}/currency:EUR"

    try:
        logger.info("[Paysera] Fetching methods: %s", url)
        resp = http_requests.get(url, timeout=10)
        logger.info("[Paysera] Methods response: status=%s, size=%d", resp.status_code, len(resp.text))

        if resp.status_code != 200:
            return None

        methods = []
        root = ET.fromstring(resp.text)
        for method_el in root.iter("method"):
            name = method_el.get("title", method_el.get("key", ""))
            logo = method_el.get("logo_url", "")
            if name:
                methods.append({"name": name, "logo_url": logo})

        logger.info("[Paysera] Parsed %d payment methods", len(methods))
        return methods or None

    except Exception:
        logger.warning("[Paysera] Could not fetch methods for project %s", project_id)
        return None


# ── Webhook data extraction ──────────────────────────────────


def _extract_webhook_data(request) -> dict:
    """Universal parsing of webhook data from GET and POST."""
    data = {}
 
    if request.method == "GET":
        data = {k: v for k, v in request.GET.items()}
    elif request.method == "POST":
        ct = request.content_type or ""
        if "json" in ct:
            try:
                data = json.loads(request.body)
            except (json.JSONDecodeError, ValueError):
                data = {}
        else:
            data = {k: v for k, v in request.POST.items()}
 
    # Montonio may send token in query string even on POST
    for key in ("payment_token", "orderToken"):
        if key in request.GET and key not in data:
            data[key] = request.GET[key]
 
    return data




from .models import InvoiceEmail, InvoiceSettings
from .serializers import InvoiceEmailSerializer, ReminderSettingsSerializer



# ════════════════════════════════════════════════════════════
#  Invoice Email — отправка, напоминания, tracking
# ════════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_email_list(request, invoice_id):
    """GET /api/invoicing/invoices/<id>/emails/ — список отправленных email."""
    if request.user.is_superuser:
        invoice = get_object_or_404(Invoice, id=invoice_id)
    else:
        invoice = get_object_or_404(Invoice, id=invoice_id, user=request.user)
    emails = invoice.emails.all().order_by("-sent_at")
    serializer = InvoiceEmailSerializer(emails, many=True)
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_send_email_view(request, invoice_id):
    """POST /api/invoicing/invoices/<id>/send-email/"""
    invoice = get_object_or_404(Invoice, id=invoice_id, user=request.user)

    if invoice.status not in ("issued", "sent", "partially_paid", "paid"):
        return Response(
            {"detail": "Sąskaitą galima siųsti tik išrašytą arba išsiųstą."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    recipient = request.data.get("email") or invoice.buyer_email or invoice.sent_to_email
    if not recipient:
        return Response(
            {"detail": "Nenurodytas gavėjo el. pašto adresas."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    force = request.data.get("force", False)
    requested_type = request.data.get("email_type", "")

    # -- Determine email_type --
    if requested_type in ("invoice", "invoice_paid", "invoice_info"):
        email_type = requested_type
    elif invoice.status == "paid" and invoice.source_invoice_id:
        email_type = "invoice_paid"
    else:
        email_type = "invoice"

    # -- Inv subscription: email limit check --
    allowed, err = check_inv_email_limit(request.user, invoice.id)
    if not allowed:
        return Response(err, status=status.HTTP_403_FORBIDDEN)

    # -- Limits: max 3 invoice, max 1 invoice_paid/invoice_info per invoice --
    max_counts = {"invoice": 3, "invoice_paid": 1, "invoice_info": 2}
    max_count = max_counts.get(email_type, 3)

    total_sent = InvoiceEmail.objects.filter(
        invoice=invoice, email_type=email_type, status="sent",
    ).count()

    if total_sent >= max_count:
        return Response(
            {"detail": f"Pasiektas išsiųstų laiškų limitas ({max_count}) vienai sąskaitai."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    # -- Confirm check (skip for first send) --
    if total_sent > 0 and not force:
        last_email = InvoiceEmail.objects.filter(
            invoice=invoice, email_type=email_type, status="sent",
        ).order_by("-sent_at").first()

        # 5 min cooldown
        if last_email and last_email.sent_at:
            from datetime import timedelta as td
            diff = timezone.now() - last_email.sent_at
            if diff < td(minutes=5):
                return Response(
                    {"detail": "Prašome palaukti 5 min. prieš siunčiant pakartotinį laišką."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        return Response({
            "needs_confirm": True,
            "last_sent_at": last_email.sent_at if last_email else None,
            "last_sent_to": last_email.to_email if last_email else "",
            "total_sent": total_sent,
            "max_count": max_count,
        }, status=status.HTTP_200_OK)

    # -- Update counters immediately --
    update_fields = {
        "email_sent_count": models.F("email_sent_count") + 1,
        "email_last_status": "sent",
    }
    if email_type == "invoice" and invoice.status == "issued":
        update_fields.update({
            "status": "sent",
            "sent_at": timezone.now(),
            "sent_to_email": recipient,
        })
    Invoice.objects.filter(id=invoice.id).update(**update_fields)

    # -- Record inv email usage --
    inv_email_info = None
    try:
        inv_email_info = record_inv_email(request.user, invoice.id)
    except Exception as e:
        logger.warning(f"Failed to record inv email usage: {e}")

    # -- Send in background --
    import threading
    from .services.invoice_email_service import send_invoice_email

    def _send():
        import django
        django.db.connections.close_all()
        send_invoice_email(
            invoice_id=invoice.id,
            email_type=email_type,
            recipient_email=recipient,
            skip_counter=True,
        )

    threading.Thread(target=_send, daemon=True).start()

# -- Build response with usage info --
    resp_data = {"detail": "El. laiškas siunčiamas.", "to": recipient}
    if inv_email_info:
        emails_used, emails_max, inv_status, was_new = inv_email_info
        resp_data["emails_used"] = emails_used
        resp_data["emails_max"] = emails_max
        resp_data["inv_status"] = inv_status
        resp_data["was_new_email"] = was_new

    return Response(resp_data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_send_reminder_view(request, invoice_id):
    """POST /api/invoicing/invoices/<id>/send-reminder/"""
    invoice = get_object_or_404(Invoice, id=invoice_id, user=request.user)

    if invoice.status not in ("issued", "sent", "partially_paid"):
        return Response(
            {"detail": "Priminimą galima siųsti tik neapmokėtai sąskaitai."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if invoice.send_payment_reminders:
        return Response(
            {"detail": "Automatiniai priminimai įjungti. Išjunkite juos, jei norite siųsti rankinį priminimą."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    recipient = request.data.get("email") or invoice.buyer_email or invoice.sent_to_email
    if not recipient:
        return Response(
            {"detail": "Nenurodytas gavėjo el. pašto adresas."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # -- Inv subscription: email limit check --
    allowed, err = check_inv_email_limit(request.user, invoice.id)
    if not allowed:
        return Response(err, status=status.HTTP_403_FORBIDDEN)

    # Инкрементим счётчик сразу
    Invoice.objects.filter(id=invoice.id).update(
        email_sent_count=models.F("email_sent_count") + 1,
        email_last_status="sent",
    )

    # -- Record inv email usage --
    inv_email_info = None
    try:
        inv_email_info = record_inv_email(request.user, invoice.id)
    except Exception as e:
        logger.warning(f"Failed to record inv email usage: {e}")

    import threading
    from .services.invoice_email_service import send_invoice_email

    def _send():
        import django
        django.db.connections.close_all()
        send_invoice_email(
            invoice_id=invoice.id,
            email_type="manual_reminder",
            recipient_email=recipient,
            skip_counter=True,
        )

    threading.Thread(target=_send, daemon=True).start()

    # -- Build response with usage info --
    resp_data = {"detail": "Priminimas siunčiamas.", "to": recipient}
    if inv_email_info:
        emails_used, emails_max, inv_status, was_new = inv_email_info
        resp_data["emails_used"] = emails_used
        resp_data["emails_max"] = emails_max
        resp_data["inv_status"] = inv_status
        resp_data["was_new_email"] = was_new

    return Response(resp_data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_email_summary(request):
    """
    GET /api/invoicing/invoices/email-summary/?ids=1,2,3
    Краткая сводка для иконок в InvoiceList.
    """
    ids_param = request.query_params.get("ids", "")
    if not ids_param:
        return Response({})

    try:
        invoice_ids = [int(x) for x in ids_param.split(",") if x.strip()]
    except ValueError:
        return Response({})

    valid_ids = set(
        Invoice.objects.filter(id__in=invoice_ids, user=request.user)
        .values_list("id", flat=True)
    )

    from django.db.models import Count, Max, Q as DQ

    email_stats = (
        InvoiceEmail.objects.filter(invoice_id__in=valid_ids)
        .values("invoice_id")
        .annotate(
            total=Count("id"),
            sent_count=Count("id", filter=DQ(status="sent")),
            failed_count=Count("id", filter=DQ(status__in=["failed", "bounced"])),
            opened_count=Count("id", filter=DQ(opened_at__isnull=False)),
            last_sent=Max("sent_at"),
        )
    )

    result = {}
    for stat in email_stats:
        inv_id = stat["invoice_id"]
        if stat["opened_count"] > 0:
            icon_status = "opened"
        elif stat["failed_count"] > 0 and stat["sent_count"] == 0:
            icon_status = "failed"
        elif stat["sent_count"] > 0:
            icon_status = "sent"
        else:
            icon_status = "none"

        result[str(inv_id)] = {
            "total": stat["total"],
            "icon_status": icon_status,
            "last_sent": stat["last_sent"],
        }

    return Response(result)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def reminder_settings_view(request):
    """GET/PATCH /api/invoicing/reminder-settings/"""
    inv_settings, _ = InvoiceSettings.objects.get_or_create(user=request.user)

    if request.method == "GET":
        return Response({
            "reminder_enabled": inv_settings.reminder_enabled,
            "invoice_reminder_days": inv_settings.invoice_reminder_days or [-7, -1, 3],
        })

    serializer = ReminderSettingsSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    if "reminder_enabled" in serializer.validated_data:
        inv_settings.reminder_enabled = serializer.validated_data["reminder_enabled"]
    if "invoice_reminder_days" in serializer.validated_data:
        inv_settings.invoice_reminder_days = serializer.validated_data["invoice_reminder_days"]

    inv_settings.save(update_fields=["reminder_enabled", "invoice_reminder_days"])

    return Response({
        "reminder_enabled": inv_settings.reminder_enabled,
        "invoice_reminder_days": inv_settings.invoice_reminder_days,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reminder_settings_reset_view(request):
    """POST /api/invoicing/reminder-settings/reset/"""
    inv_settings, _ = InvoiceSettings.objects.get_or_create(user=request.user)
    inv_settings.invoice_reminder_days = [-7, -1, 3]
    inv_settings.save(update_fields=["invoice_reminder_days"])

    return Response({
        "reminder_enabled": inv_settings.reminder_enabled,
        "invoice_reminder_days": inv_settings.invoice_reminder_days,
    })


# ════════════════════════════════════════════════════════════
#  Mailgun invoice tracking webhook
# ════════════════════════════════════════════════════════════

@csrf_exempt
@require_POST
def mailgun_invoice_tracking_webhook(request):
    """POST /api/webhooks/mailgun/invoice-tracking/"""
    import time as time_module

    try:
        payload = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return HttpResponse("bad json", status=400)

    event_data = payload.get("event-data", {})
    signature_data = payload.get("signature", {})

    timestamp = str(signature_data.get("timestamp", ""))
    token = signature_data.get("token", "")
    signature = signature_data.get("signature", "")

    # Verify signature
    signing_key = getattr(django_settings, "MAILGUN_INVOICE_WEBHOOK_SIGNING_KEY", "")
    if not signing_key:
        logger.error("MAILGUN_INVOICE_WEBHOOK_SIGNING_KEY not configured")
        return HttpResponseForbidden("Not configured")

    try:
        if abs(time_module.time() - int(timestamp)) > 300:
            return HttpResponseForbidden("Stale request")
    except (ValueError, TypeError):
        return HttpResponseForbidden("Invalid timestamp")

    expected = hmac.new(
        key=signing_key.encode("utf-8"),
        msg=f"{timestamp}{token}".encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        logger.warning("Mailgun invoice tracking: invalid signature")
        return HttpResponseForbidden("Invalid signature")

    event_type = event_data.get("event", "")
    message_headers = event_data.get("message", {}).get("headers", {})
    message_id = message_headers.get("message-id", "").strip("<>")

    if not message_id:
        return HttpResponse("ok", status=200)

    try:
        email_log = InvoiceEmail.objects.get(mailgun_message_id=message_id)
    except InvoiceEmail.DoesNotExist:
        return HttpResponse("ok", status=200)
    except InvoiceEmail.MultipleObjectsReturned:
        email_log = InvoiceEmail.objects.filter(mailgun_message_id=message_id).first()

    if event_type == "opened":
        from django.db.models import F
        update_fields = ["open_count"]
        email_log.open_count = F("open_count") + 1
        if not email_log.opened_at:
            email_log.opened_at = timezone.now()
            update_fields.append("opened_at")
        email_log.save(update_fields=update_fields)
        logger.info(f"Invoice email {email_log.id} opened (invoice {email_log.invoice_id})")

    elif event_type == "delivered":
        if email_log.status == "pending":
            email_log.status = "sent"
            email_log.save(update_fields=["status"])

    elif event_type in ("failed", "rejected"):
        delivery_status = event_data.get("delivery-status", {})
        error_msg = delivery_status.get("message", "")[:500] or delivery_status.get("description", "")[:500]
        email_log.status = "failed"
        email_log.error_text = error_msg
        email_log.save(update_fields=["status", "error_text"])
        logger.warning(f"Invoice email {email_log.id} failed: {error_msg}")

        from .celery_signals import _send_telegram
        _send_telegram(
            f"📧 <b>Email failed</b>\n"
            f"Invoice: {email_log.invoice_id}\n"
            f"To: {email_log.to_email}\n"
            f"Type: {email_log.email_type}\n"
            f"Error: {error_msg[:300]}"
        )

    elif event_type == "complained":
        email_log.status = "bounced"
        email_log.error_text = "Spam complaint"
        email_log.save(update_fields=["status", "error_text"])

    return HttpResponse("ok", status=200)





# ════════════════════════════════════════════════════════════
#  Subscriptions - israsymas only
# ════════════════════════════════════════════════════════════

def get_inv_access(user):
    """
    Возвращает полный статус подписки Išrašymas + лимиты + фичи.
    Lazy-expire: если trial/active истёк — переводит в free.
    """
    sub = getattr(user, "inv_subscription", None)
    if sub is None:
        # На случай если запись не создана (старый user до миграции)
        from .models import InvSubscription
        sub, _ = InvSubscription.objects.get_or_create(user=user)

    # Lazy expire
    sub.check_and_expire()

    features = sub.get_features()
    days_left = sub.days_left

    # Баннер-логика
    banner = None
    if sub.status == "free" and not sub.trial_used:
        banner = "trial_available"       # «Начните 14-дневный trial»
    elif sub.status == "trial" and sub.show_trial_banner:
        banner = "trial_ending"          # «Осталось X дней»
    elif sub.status == "free" and sub.trial_used:
        banner = "trial_expired"         # «Trial закончился, купите план»

    # Лимиты (только для free)
    limits = None
    if sub.status == "free":
        from .models import InvMonthlyUsage
        usage = InvMonthlyUsage.get_current(user)
        limits = {
            "exports_max": 30,
            "exports_used": usage.exports_used,
            "emails_max": 10,
            "emails_used": usage.emails_used,
        }

    return {
        "status": sub.status,
        "trial_used": sub.trial_used,
        "days_left": days_left,
        "banner": banner,
        "features": features,
        "limits": limits,
    }


def check_inv_feature(user, feature_name):
    """
    Быстрая проверка одной фичи. Для использования в view перед действием.
    Возвращает (allowed: bool, error_response_data: dict|None)
    """
    sub = getattr(user, "inv_subscription", None)
    if sub is None:
        from .models import InvSubscription
        sub, _ = InvSubscription.objects.get_or_create(user=user)

    sub.check_and_expire()
    features = sub.get_features()

    if feature_name in features and not features[feature_name]:
        return False, {
            "error": "feature_locked",
            "feature": feature_name,
            "message": "Ši funkcija leidžiama tik turintiems mokamą planą.",
        }
    return True, None


def check_inv_export_limit(user, invoice_id):
    """
    Проверка лимита экспорта. Вызывать перед экспортом фактуры.
    Возвращает (allowed, error_data).
    """
    sub = getattr(user, "inv_subscription", None)
    if sub is None:
        from .models import InvSubscription
        sub, _ = InvSubscription.objects.get_or_create(user=user)

    sub.check_and_expire()
    if sub.status in ("trial", "active"):
        return True, None

    from .models import InvMonthlyUsage
    usage = InvMonthlyUsage.get_current(user)
    if not usage.can_export(invoice_id):
        return False, {
            "error": "limit_reached",
            "feature": "export",
            "message": "Pasiektas mėnesio eksporto limitas (30 sąskaitų).",
            "exports_used": usage.exports_used,
            "exports_max": 30,
        }
    return True, None


def check_inv_email_limit(user, invoice_id):
    from .models import InvSubscription, InvMonthlyUsage
    sub = InvSubscription.objects.filter(user=user).first()
    if sub is None:
        return True, None

    sub.check_and_expire()
    if sub.status in ("trial", "active"):
        return True, None

    usage = InvMonthlyUsage.get_current(user)
    if not usage.can_email(invoice_id):
        return False, {
            "error": "limit_reached",
            "feature": "email",
            "message": (
                f"Mėnesio el. pašto limitas: {usage.emails_used}/10 panaudota. "
                f"Įsigykite mokamą planą neribotam naudojimui."
            ),
            "emails_used": usage.emails_used,
            "emails_max": 10,
        }
    return True, None


def record_inv_email(user, invoice_id):
    from .models import InvSubscription, InvMonthlyUsage
    sub = InvSubscription.objects.filter(user=user).first()
    if sub is None or sub.status != "free":
        return None

    usage = InvMonthlyUsage.get_current(user)
    was_new = invoice_id not in usage.emailed_invoice_ids
    usage.record_email(invoice_id)
    usage.refresh_from_db()
    return usage.emails_used, 10, "free", was_new




# --- Inv Subscription endpoints ---

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def inv_subscription_status(request):
    """
    GET /api/inv/subscription/
    Возвращает полный статус подписки Išrašymas.
    """
    data = get_inv_access(request.user)

    # Check Stripe cancel_at_period_end
    sub = InvSubscription.objects.filter(user=request.user).first()
    cancel_at_period_end = False
    plan_end_display = ""

    if sub and sub.stripe_subscription_id and sub.status == "active":
        try:
            import stripe
            stripe.api_key = django_settings.STRIPE_SECRET_KEY
            stripe_sub = stripe.Subscription.retrieve(sub.stripe_subscription_id)
            cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)
        except Exception as e:
            logger.warning("[InvSub] Stripe check failed: %s", e)

    if sub and sub.plan_end:
        plan_end_display = sub.plan_end.strftime("%Y-%m-%d")

    data["cancel_at_period_end"] = cancel_at_period_end
    data["plan_end_display"] = plan_end_display

    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def inv_start_trial(request):
    """
    POST /api/inv/start-trial/
    Активирует 14-дневный trial Išrašymas.
    """
    sub = getattr(request.user, "inv_subscription", None)
    if sub is None:
        sub, _ = InvSubscription.objects.get_or_create(user=request.user)

    if sub.trial_used:
        return Response(
            {"error": "trial_already_used",
             "message": "Bandomasis laikotarpis jau buvo panaudotas."},
            status=400,
        )

    if sub.status == "active":
        return Response(
            {"error": "already_active",
             "message": "Jūs jau turite aktyvų planą."},
            status=400,
        )

    sub.start_trial()
    logger.info(f"Inv trial started for user {request.user.email}, ends {sub.trial_end}")

    return Response(get_inv_access(request.user), status=200)



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def inv_cancel_subscription(request):
    """POST /api/inv/cancel-subscription/"""
    import stripe
    stripe.api_key = django_settings.STRIPE_SECRET_KEY

    sub = InvSubscription.objects.filter(user=request.user).first()
    if not sub or sub.status != "active" or not sub.stripe_subscription_id:
        return Response(
            {"error": "Neturite aktyvaus PRO plano."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        stripe.Subscription.modify(
            sub.stripe_subscription_id,
            cancel_at_period_end=True,
        )
    except Exception as e:
        logger.error("[InvCancel] Stripe error: %s", e)
        return Response(
            {"error": "Nepavyko atšaukti plano."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    plan_end_display = sub.plan_end.strftime("%Y-%m-%d") if sub.plan_end else ""

    logger.info("[InvCancel] User %s cancelled PRO, active until %s", request.user.email, plan_end_display)

    return Response({
        "status": "active",
        "cancel_at_period_end": True,
        "plan_end": str(sub.plan_end) if sub.plan_end else None,
        "plan_end_display": plan_end_display,
    })

# ════════════════════════════════════════════════════════════
#  END --- Subscriptions - israsymas only
# ════════════════════════════════════════════════════════════





# ════════════════════════════════════════════════════════════
# ─── Rivile GAMA API Key Views ───
# ════════════════════════════════════════════════════════════
class RivileGamaAPIKeyListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = RivileGamaAPIKey.objects.filter(user=request.user)
        return Response(RivileGamaAPIKeySerializer(qs, many=True).data)

    def post(self, request):
        ser = RivileGamaAPIKeyCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        user = request.user
        company_code = ser.validated_data["company_code"]
        raw_key = ser.validated_data["api_key"]
        label = ser.validated_data.get("label", "")

        if RivileGamaAPIKey.objects.filter(user=user, company_code=company_code).exists():
            return Response(
                {"detail": f"API raktas įmonei {company_code} jau egzistuoja. Naudokite redagavimą."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verify_result = verify_api_key(raw_key)

        obj = RivileGamaAPIKey(
            user=user,
            company_code=company_code,
            label=label,
            is_active=ser.validated_data.get("is_active", True),
        )
        obj.set_api_key(raw_key)
        obj.save()

        obj.mark_verified(
            success=verify_result.success,
            error="" if verify_result.success else (verify_result.error_message or "Verification failed"),
        )

        logger.info(
            "[RIVILE_API_KEY] Created key for user=%s company=%s verified=%s",
            user.id, company_code, verify_result.success,
        )

        return Response(RivileGamaAPIKeySerializer(obj).data, status=status.HTTP_201_CREATED)


class RivileGamaAPIKeyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_obj(self, request, pk):
        try:
            return RivileGamaAPIKey.objects.get(pk=pk, user=request.user)
        except RivileGamaAPIKey.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self._get_obj(request, pk)
        if not obj:
            return Response({"detail": "Raktas nerastas."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RivileGamaAPIKeySerializer(obj).data)

    def patch(self, request, pk):
        obj = self._get_obj(request, pk)
        if not obj:
            return Response({"detail": "Raktas nerastas."}, status=status.HTTP_404_NOT_FOUND)

        ser = RivileGamaAPIKeyUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        if "label" in ser.validated_data:
            obj.label = ser.validated_data["label"]

        if "is_active" in ser.validated_data:
            obj.is_active = ser.validated_data["is_active"]

        if "company_code" in ser.validated_data:
            new_code = ser.validated_data["company_code"].strip()
            if new_code and new_code != obj.company_code:
                if RivileGamaAPIKey.objects.filter(
                    user=request.user, company_code=new_code
                ).exclude(pk=obj.pk).exists():
                    return Response(
                        {"detail": f"API raktas įmonei {new_code} jau egzistuoja."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                obj.company_code = new_code

        raw_key = ser.validated_data.get("api_key", "").strip()
        if raw_key:
            obj.set_api_key(raw_key)
            obj.save()
            verify_result = verify_api_key(raw_key)
            obj.mark_verified(
                success=verify_result.success,
                error="" if verify_result.success else (verify_result.error_message or ""),
            )
        else:
            obj.save()

        return Response(RivileGamaAPIKeySerializer(obj).data)

    def delete(self, request, pk):
        obj = self._get_obj(request, pk)
        if not obj:
            return Response({"detail": "Raktas nerastas."}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RivileGamaAPIKeyVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            obj = RivileGamaAPIKey.objects.get(pk=pk, user=request.user)
        except RivileGamaAPIKey.DoesNotExist:
            return Response({"detail": "Raktas nerastas."}, status=status.HTTP_404_NOT_FOUND)

        raw_key = obj.get_api_key()
        result = verify_api_key(raw_key)

        obj.mark_verified(
            success=result.success,
            error="" if result.success else (result.error_message or "Patikrinimas nepavyko"),
        )

        logger.info("[RIVILE_API_KEY] Verify key=%s company=%s ok=%s", pk, obj.company_code, result.success)

        return Response(RivileGamaAPIKeySerializer(obj).data)

# ════════════════════════════════════════════════════════════
# END ─── Rivile GAMA API Key Views ───
# ════════════════════════════════════════════════════════════

# ════════════════════════════════════════════════════════════
# ─── Extra fields v nustatymai ───
# ════════════════════════════════════════════════════════════

"""
Views для per-company extra fields.

Добавить в docscanner_app/views.py (или в отдельный файл и импортировать).

Endpoint'ы:
  GET    /api/extra-fields/<program_key>/                    — список профилей (пагинация)
  GET    /api/extra-fields/<program_key>/<company_code>/     — полные данные профиля
  PATCH  /api/extra-fields/<program_key>/<company_code>/     — создать/обновить профиль
  DELETE /api/extra-fields/<program_key>/<company_code>/     — удалить профиль
  POST   /api/extra-fields/<program_key>/check-duplicate/    — проверка дубликата
"""

import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .utils.extra_fields import (
    VALID_PROGRAM_KEYS,
    get_field_name,
    get_profiles_summary,
    count_non_empty_fields,
    get_non_empty_field_keys,
)

logger = logging.getLogger("docscanner_app")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def extra_fields_list(request, program_key):
    """
    GET /api/extra-fields/<program_key>/?offset=0&limit=5

    Возвращает лёгкий список профилей (без полных полей).
    """
    if program_key not in VALID_PROGRAM_KEYS:
        return Response(
            {"detail": f"Nežinoma programa: {program_key}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    field_name = get_field_name(program_key)
    data = getattr(request.user, field_name, None) or {}

    all_profiles = get_profiles_summary(data)
    total = len(all_profiles)

    # Пагинация
    try:
        offset = max(0, int(request.query_params.get("offset", 0)))
        limit = max(1, min(100, int(request.query_params.get("limit", 5))))
    except (ValueError, TypeError):
        offset, limit = 0, 5

    page = all_profiles[offset : offset + limit]

    return Response({
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": page,
    })


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def extra_fields_detail(request, program_key, company_code):
    """
    GET    — полные данные одного профиля
    PATCH  — создать или обновить профиль (мердж на бэкенде)
    DELETE — удалить профиль
    """
    if program_key not in VALID_PROGRAM_KEYS:
        return Response(
            {"detail": f"Nežinoma programa: {program_key}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user
    field_name = get_field_name(program_key)
    data = getattr(user, field_name, None) or {}

    # Нормализуем data в nested формат если ещё плоский (legacy)
    data = _ensure_nested(data)

    # ──── GET ────
    if request.method == "GET":
        profile = data.get(company_code)
        if profile is None:
            return Response(
                {"detail": "Profilis nerastas."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # Возвращаем без служебных ключей
        clean = {k: v for k, v in profile.items() if not k.startswith("__")}
        return Response({
            "company_code": company_code,
            "company_name": profile.get("__name__", ""),
            "fields": clean,
            "fields_count": count_non_empty_fields(profile),
        })

    # ──── DELETE ────
    if request.method == "DELETE":
        if company_code not in data:
            return Response(
                {"detail": "Profilis nerastas."},
                status=status.HTTP_404_NOT_FOUND,
            )
        del data[company_code]
        setattr(user, field_name, data)
        user.save(update_fields=[field_name])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ──── PATCH (create or update) ────
    body = request.data
    if not isinstance(body, dict):
        return Response(
            {"detail": "Turinys turi būti JSON objektas."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    fields = body.get("fields", {})
    company_name = body.get("company_name", "")

    if not isinstance(fields, dict):
        return Response(
            {"detail": "fields turi būti JSON objektas."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Валидация: для не-__all__ нужен company_code
    if company_code != "__all__" and not company_code.strip():
        return Response(
            {"detail": "Įmonės kodas privalomas."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Сохраняем __name__ для отображения в списке
    if company_code != "__all__" and company_name:
        fields["__name__"] = str(company_name).strip()
    elif company_code == "__all__":
        fields.pop("__name__", None)

    # Мердж: обновляем только переданные поля, не трогая остальные
    existing = data.get(company_code, {})
    if isinstance(existing, dict):
        existing.update(fields)
    else:
        existing = fields

    data[company_code] = existing
    setattr(user, field_name, data)
    user.save(update_fields=[field_name])

    clean = {k: v for k, v in existing.items() if not k.startswith("__")}
    return Response({
        "company_code": company_code,
        "company_name": existing.get("__name__", ""),
        "fields": clean,
        "fields_count": count_non_empty_fields(existing),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def extra_fields_check_duplicate(request, program_key):
    """
    POST /api/extra-fields/<program_key>/check-duplicate/
    Body: { "company_code": "123456" }

    Проверяет, есть ли уже профиль с таким company_code.
    Если есть — возвращает список непустых полей (для предупреждения).
    """
    if program_key not in VALID_PROGRAM_KEYS:
        return Response(
            {"detail": f"Nežinoma programa: {program_key}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    company_code = (request.data.get("company_code", "") or "").strip()
    if not company_code:
        return Response(
            {"detail": "company_code privalomas."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    field_name = get_field_name(program_key)
    data = getattr(request.user, field_name, None) or {}
    data = _ensure_nested(data)

    existing = data.get(company_code)
    if existing and isinstance(existing, dict):
        non_empty = get_non_empty_field_keys(existing)
        return Response({
            "exists": True,
            "company_name": existing.get("__name__", ""),
            "fields_count": count_non_empty_fields(existing),
            "non_empty_fields": non_empty,
        })

    return Response({"exists": False})


def _ensure_nested(data):
    """
    Если data — плоский dict (legacy), конвертируем в nested.
    Если уже nested — возвращаем как есть.
    """
    if not data or not isinstance(data, dict):
        return {}

    # Уже nested
    if "__all__" in data:
        return data

    # Проверяем: если есть ключи с "_" — это плоский формат
    has_flat_keys = any(
        "_" in k and not k.startswith("__")
        for k in data
    )

    if has_flat_keys:
        # Конвертируем на лету (в памяти, не сохраняем — сохранит PATCH)
        return {"__all__": dict(data)}

    # Может быть пустой nested или уже с company codes
    return data

# ════════════════════════════════════════════════════════════
# END ─── Extra fields v nustatymai ───
# ════════════════════════════════════════════════════════════


# ════════════════════════════════════════════════════════════
# ─── Dlia ADMIN israsymas ───
# ════════════════════════════════════════════════════════════

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.utils.dateparse import parse_date
from datetime import timedelta
 
 
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_all_invoices(request):
    """
    Dlia superuser — spisok VSEX sčotov vsex polzovatelej.
    Offset/limit paginacija dlia infinite scroll.
    """
    if not request.user.is_superuser:
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)
 
    qs = Invoice.objects.select_related("user").all()
 
    # --- filtry ---
 
    st = request.GET.get("status")
    if st:
        qs = qs.filter(status=st)
 
    invoice_type = request.GET.get("invoice_type")
    if invoice_type:
        qs = qs.filter(invoice_type=invoice_type)
 
    q = request.GET.get("q")
    if q:
        qs = qs.filter(
            Q(document_number__icontains=q)
            | Q(document_series__icontains=q)
            | Q(buyer_name__icontains=q)
            | Q(buyer_email__icontains=q)
            | Q(seller_name__icontains=q)
            | Q(user__email__icontains=q)
        )
 
    date_from = request.GET.get("date_from")
    if date_from:
        d = parse_date(date_from)
        if d:
            qs = qs.filter(invoice_date__gte=d)
 
    date_to = request.GET.get("date_to")
    if date_to:
        d = parse_date(date_to)
        if d:
            qs = qs.filter(invoice_date__lte=d)
 
    # --- sortirovka ---
    qs = qs.order_by("-created_at", "-id")
 
    # --- offset/limit paginacija ---
    try:
        offset = int(request.GET.get("offset", 0))
    except (ValueError, TypeError):
        offset = 0
    try:
        limit = int(request.GET.get("limit", 50))
    except (ValueError, TypeError):
        limit = 50
    limit = min(limit, 100)  # max 100
 
    total = qs.count()
    results = qs[offset : offset + limit]
 
    serializer = InvoiceAdminListSerializer(results, many=True)
 
    return Response({
        "count": total,
        "results": serializer.data,
    })




@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_all_recurring_invoices(request):
    """
    Dlia superuser — spisok VSEX periodičeskich sčotov vsex polzovatelej.
    Offset/limit paginacija.
    """
    if not request.user.is_superuser:
        return Response({"detail": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)
 
    qs = RecurringInvoice.objects.select_related("user").prefetch_related("line_items").all()
 
    # --- filtry ---
    q = request.GET.get("q")
    if q:
        qs = qs.filter(
            Q(document_series__icontains=q)
            | Q(buyer_name__icontains=q)
            | Q(buyer_email__icontains=q)
            | Q(seller_name__icontains=q)
            | Q(user__email__icontains=q)
        )
 
    st = request.GET.get("status")
    if st:
        qs = qs.filter(status=st)
 
    qs = qs.order_by("-created_at", "-id")
 
    # --- offset/limit ---
    try:
        offset = int(request.GET.get("offset", 0))
    except (ValueError, TypeError):
        offset = 0
    try:
        limit = int(request.GET.get("limit", 50))
    except (ValueError, TypeError):
        limit = 50
    limit = min(limit, 100)
 
    total = qs.count()
    results = qs[offset : offset + limit]
 
    serializer = RecurringInvoiceAdminListSerializer(results, many=True)
 
    return Response({
        "count": total,
        "results": serializer.data,
    })

# ════════════════════════════════════════════════════════════
# END ─── Dlia ADMIN israsymas ───
# ════════════════════════════════════════════════════════════