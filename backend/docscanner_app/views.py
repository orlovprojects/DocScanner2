# --- Standard library ---
import hashlib
import io
import logging
import logging.config
import os
import tempfile
import zipfile
from datetime import date, timedelta
from decimal import Decimal

# --- Django ---
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

# --- Django REST Framework ---
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

# --- DRF SimpleJWT ---
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# --- Local (project) imports ---
from .data_import.data_import_from_buh import import_products_from_xlsx, import_clients_from_xlsx
from .exports.apskaita5 import export_documents_group_to_apskaita5_files
from .exports.centas import export_documents_group_to_centras_xml
from .exports.finvalda import (
    export_pirkimai_group_to_finvalda,
    export_pardavimai_group_to_finvalda,
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
from .models import (
    CustomUser,
    ScannedDocument,
    ProductAutocomplete,
    ClientAutocomplete,
    LineItem,
    AdClick,
)
from .serializers import (
    CustomUserSerializer,
    ViewModeSerializer,
    ScannedDocumentSerializer,
    ScannedDocumentListSerializer,
    ScannedDocumentDetailSerializer,
    AdClickSerializer,
)
from .tasks import process_uploaded_file_task
from .utils.data_resolver import build_preview
from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from .utils.prekes_kodas import assign_random_prekes_kodai
from .utils.save_document import _apply_sumiskai_defaults_from_user
from .utils.update_currency_rates import update_currency_rates
from .validators.vat_klas import auto_select_pvm_code


# --- Logging setup ---
logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')
site_url = settings.SITE_URL_FRONTEND  # берём из settings.py


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

    logger.info("[EXP] start user=%s export_type_raw=%r ids=%s raw_overrides=%r mode_raw=%r",
                log_ctx["user"], export_type, ids, raw_overrides, mode_raw)

    if not ids:
        logger.warning("[EXP] no ids provided")
        return Response({"error": "No document ids provided"}, status=400)

    user = request.user
    export_type = str(export_type).lower()

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

    documents = ScannedDocument.objects.filter(pk__in=ids, user=user)
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
            overrides=overrides if mode == 'multi' else {},  # <<< уважать переданный режим
            view_mode=mode,                                   # <<< уважать переданный режим
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

    files_to_export = []

    # ========================= CENTAS =========================
    if export_type == 'centas':
        logger.info("[EXP] CENTAS export started")
        assign_random_prekes_kodai(documents)

        if pirkimai_docs:
            logger.info("[EXP] CENTAS exporting pirkimai: %d docs", len(pirkimai_docs))
            xml_bytes = export_documents_group_to_centras_xml(pirkimai_docs, direction="pirkimas")
            files_to_export.append((f"{today_str}_pirkimai.xml", xml_bytes))
        if pardavimai_docs:
            logger.info("[EXP] CENTAS exporting pardavimai: %d docs", len(pardavimai_docs))
            xml_bytes = export_documents_group_to_centras_xml(pardavimai_docs, direction="pardavimas")
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
            return response
        elif len(files_to_export) == 1:
            filename, xml_content = files_to_export[0]
            response = HttpResponse(
                xml_content,
                content_type='application/xml; charset=utf-8'
            )
            response['Content-Disposition'] = f'attachment; filename={filename}'
            return response

        else:
            logger.warning("[EXP] CENTAS nothing to export")
            return Response({"error": "No documents to export"}, status=400)

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
            pirkimai_xml = export_pirkimai_group_to_rivile(pirkimai_docs)
            files_to_export.append(('pirkimai.eip', pirkimai_xml))

        # 3) ПАРДАВИМАИ (I06/I07)
        if pardavimai_docs:
            logger.info("[EXP] RIVILE exporting pardavimai: %d docs", len(pardavimai_docs))
            pardavimai_xml = export_pardavimai_group_to_rivile(pardavimai_docs)
            files_to_export.append(('pardavimai.eip', pardavimai_xml))

        # 4) N17/N25
        prekes_xml, paslaugos_xml, kodai_xml = export_prekes_paslaugos_kodai_group_to_rivile(documents)
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
            documents.update(status="exported")
            return response
        else:
            logger.warning("[EXP] RIVILE nothing to export")
            return Response({"error": "No documents to export"}, status=400)



    # ========================= FINVALDA =========================
    elif export_type == 'finvalda':
        logger.info("[EXP] FINVALDA export started")
        assign_random_prekes_kodai(documents)

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
            return response
        elif len(files_to_export) == 1:
            filename, xml_content = files_to_export[0]
            response = HttpResponse(xml_content, content_type='application/xml')
            response['Content-Disposition'] = f'attachment; filename={filename}'
            return response
        else:
            logger.warning("[EXP] FINVALDA nothing to export")
            return Response({"error": "No documents to export"}, status=400)

    # ========================= APSKAITA5 =========================
    elif export_type == 'apskaita5':
        logger.info("[EXP] APSKAITA5 export started")
        assign_random_prekes_kodai(documents)

        content, filename, content_type = export_documents_group_to_apskaita5_files(
            documents=documents,
            site_url=site_url,
            company_code=None,
            direction=None,
        )
        logger.info("[EXP] APSKAITA5 produced file=%s content_type=%s size=%d",
                    filename, content_type, len(content))
        response = HttpResponse(content, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    # ========================= RIVILĖ ERP (XLSX) =========================
    elif export_type == 'rivile_erp':
        logger.info("[EXP] RIVILE_ERP export started")
        assign_random_prekes_kodai(documents)

        klientai = []
        seen = set()

        for pack in (prepared.get("pirkimai", []) + prepared.get("pardavimai", [])):
            doc = pack["doc"]
            dir_ = pack.get("direction")

            if dir_ == 'pirkimas':
                is_person = doc.seller_is_person
                klient_type = 'pirkimas'
                client = {
                    'id': doc.seller_id or "",
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
                client = {
                    'id': doc.buyer_id or "",
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
                export_documents_to_rivile_erp_xlsx(pirkimai_docs, tmp.name, doc_type="pirkimai")
                tmp.seek(0)
                pirkimai_xlsx_bytes = tmp.read()
            files_to_export.append((f'pirkimai_{today_str}.xlsx', pirkimai_xlsx_bytes))

        if pardavimai_docs:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                export_documents_to_rivile_erp_xlsx(pardavimai_docs, tmp.name, doc_type="pardavimai")
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
            return response
        elif len(files_to_export) == 1:
            filename, file_bytes = files_to_export[0]
            response = HttpResponse(
                file_bytes,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename={filename}'
            return response
        else:
            logger.warning("[EXP] RIVILE_ERP nothing to export")
            return Response({"error": "No clients or products to export"}, status=400)

    else:
        logger.error("[EXP] unknown export type: %s", export_type)
        return Response({"error": "Unknown export type"}, status=400)

    logger.warning("[EXP] fell through unexpectedly")
    return Response({"error": "No documents to export"}, status=400)





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
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_documents(request):
    user = request.user
    status = request.GET.get('status')
    date_from = request.GET.get('from')
    date_to = request.GET.get('to')

    docs = ScannedDocument.objects.filter(user=user)
    if status:
        docs = docs.filter(status=status)
    if date_from:
        docs = docs.filter(created_at__date__gte=parse_date(date_from))
    if date_to:
        docs = docs.filter(created_at__date__lte=parse_date(date_to))

    serializer = ScannedDocumentListSerializer(docs.order_by('-uploaded_at'), many=True)
    return Response(serializer.data)


# /documents/<id>/
# @api_view(['GET'])
# @permission_classes([IsAuthenticated])
# def get_document_detail(request, pk):
#     try:
#         doc = ScannedDocument.objects.get(pk=pk, user=request.user)
#     except ScannedDocument.DoesNotExist:
#         return Response({'error': 'Not found'}, status=404)
#     serializer = ScannedDocumentDetailSerializer(doc)
#     return Response(serializer.data)

# /documents/<id>/
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_document_detail(request, pk):
    """
    Детали документа.
    - В single-режиме: отдаем сериализованные данные из БД (без preview).
    - В multi-режиме: добавляем preview через data_resolver.build_preview (ничего в БД не пишем).
    """
    try:
        doc = ScannedDocument.objects.get(pk=pk, user=request.user)
    except ScannedDocument.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    serializer = ScannedDocumentDetailSerializer(doc)
    data = serializer.data

    # Превью только в multi
    if getattr(request.user, "view_mode", None) != "multi":
        return Response(data)

    cp_key = request.query_params.get("cp_key")
    preview = build_preview(
        doc,
        request.user,
        cp_key=cp_key,
        view_mode="multi",
        base_vat_percent=data.get("vat_percent"),
        base_preke_paslauga=data.get("preke_paslauga"),
    )

    data["preview"] = preview
    return Response(data)






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
    from .utils.save_document import _apply_sumiskai_defaults_from_user  # обновлённая версия

    log = logging.getLogger("docscanner_app.api.update_extra_fields")

    doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
    if not doc:
        log.warning("PATCH extra_fields pk=%s: document not found for user=%s", pk, request.user.id)
        return Response({'error': 'Dokumentas nerastas'}, status=404)

    ALLOWED_FIELDS = [
        'buyer_id', 'buyer_name', 'buyer_vat_code', 'buyer_iban', 'buyer_address', 'buyer_country_iso',
        'seller_id', 'seller_name', 'seller_vat_code', 'seller_iban', 'seller_address', 'seller_country_iso',
        'prekes_kodas', 'prekes_barkodas', 'prekes_pavadinimas', 'preke_paslauga',
        'vat_percent', 'scan_type',
    ]

    # helpers
    def _is_cleared(prefix: str) -> bool:
        keys = [
            f"{prefix}_name", f"{prefix}_id", f"{prefix}_vat_code",
            f"{prefix}_iban", f"{prefix}_address", f"{prefix}_country_iso",
        ]
        touched = any(k in request.data for k in keys)
        if not touched:
            return False
        return all(not str(request.data.get(k) or "").strip() for k in keys)

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

    return Response(ScannedDocumentSerializer(doc).data)





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

            res.data = {'refreshed':True}

            res.set_cookie(
                key='access_token',
                value=access_token,
                httponly=True,
                secure=True,
                samesite='Lax',
                path='/'
            )

            return res

        except:
            return Response({'refreshed':False})


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

            # Создаём триал-подписку для нового пользователя
            create_trial_subscription(user)

            return Response({
                "message": "User successfully registered!",
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