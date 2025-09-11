import logging
import logging.config
from .models import CustomUser
from datetime import timedelta
from django.utils import timezone
from .serializers import CustomUserSerializer
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from django.db.models import Q
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from decimal import Decimal
from datetime import date
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from .utils.save_document import _apply_sumiskai_defaults_from_user
from .utils.update_currency_rates import update_currency_rates
from rest_framework.views import APIView

from .data_import.data_import_from_buh import import_products_from_xlsx, import_clients_from_xlsx

from .models import ScannedDocument, ProductAutocomplete, ClientAutocomplete, LineItem


from django.conf import settings
import io
import zipfile
from .tasks import process_uploaded_file_task

from .serializers import ScannedDocumentSerializer
from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from .validators.vat_klas import auto_select_pvm_code

from django.utils.dateparse import parse_date
from .serializers import ScannedDocumentListSerializer, ScannedDocumentDetailSerializer

from django.http import HttpResponse
from .exports.centas  import export_documents_group_to_centras_xml
from .exports.rivile import (
    export_clients_group_to_rivile,
    export_pirkimai_group_to_rivile,
    export_pardavimai_group_to_rivile,
    export_prekes_paslaugos_kodai_group_to_rivile
)
from .exports.finvalda import (
    export_pirkimai_group_to_finvalda,
    export_pardavimai_group_to_finvalda,
)
from .exports.apskaita5 import export_documents_group_to_apskaita5
from .exports.rivile_erp import export_clients_to_rivile_erp_xlsx, export_prekes_and_paslaugos_to_rivile_erp_xlsx, export_documents_to_rivile_erp_xlsx
from docscanner_app.utils.prekes_kodas import assign_random_prekes_kodai
import tempfile
from .models import AdClick
from .serializers import AdClickSerializer
from rest_framework import generics, permissions





logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')
site_url = settings.SITE_URL_FRONTEND  # берём из settings.py




@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_documents(request):
    ids = request.data.get('ids', [])
    if not ids:
        return Response({"error": "No document ids provided"}, status=400)

    user = request.user
    export_type = request.data.get('export_type')
    if not export_type:
        export_type = getattr(user, 'default_accounting_program', 'centas')
    export_type = export_type.lower()

    today_str = date.today().strftime('%Y-%m-%d')
    documents = ScannedDocument.objects.filter(pk__in=ids, user=user)
    if not documents:
        return Response({"error": "No documents found"}, status=404)

    # Группируем по типу
    pirkimai = [doc for doc in documents if doc.pirkimas_pardavimas == 'pirkimas']
    pardavimai = [doc for doc in documents if doc.pirkimas_pardavimas == 'pardavimas']

    files_to_export = []

    if export_type == 'centas':
        assign_random_prekes_kodai(documents)
        # ... твой код экспорта Centas (оставь как есть)
        if pirkimai:
            xml_bytes = export_documents_group_to_centras_xml(pirkimai)
            files_to_export.append((f"{today_str}_pirkimai.xml", xml_bytes))
        if pardavimai:
            xml_bytes = export_documents_group_to_centras_xml(pardavimai)
            files_to_export.append((f"{today_str}_pardavimai.xml", xml_bytes))
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
            response = HttpResponse(xml_content, content_type='application/xml')
            response['Content-Disposition'] = f'attachment; filename={filename}'
            return response

    elif export_type == 'rivile':
        assign_random_prekes_kodai(documents)

        klientai = []
        seen = set()
        for doc in documents:
            if doc.pirkimas_pardavimas == 'pirkimas':
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
                    'seller_is_person': bool(doc.seller_is_person),
                    'iban': doc.seller_iban or "",
                }
            elif doc.pirkimas_pardavimas == 'pardavimas':
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
                    'buyer_is_person': bool(doc.buyer_is_person),
                    'iban': doc.buyer_iban or "",
                }
            else:
                continue
            client_key = (client['id'], client['vat'], client['name'], client['type'])
            # если id пустой → подставляем vat или заглушку
            if not client['id']:
                client['id'] = client['vat'] or "111111111"

            if client_key not in seen:
                klientai.append(client)
                seen.add(client_key)

        if klientai:
            klientai_xml = export_clients_group_to_rivile(klientai)
            files_to_export.append(('klientai.eip', klientai_xml))
        if pirkimai:
            pirkimai_xml = export_pirkimai_group_to_rivile(pirkimai)
            files_to_export.append(('pirkimai.eip', pirkimai_xml))
        if pardavimai:
            pardavimai_xml = export_pardavimai_group_to_rivile(pardavimai)
            files_to_export.append(('pardavimai.eip', pardavimai_xml))

        # -------- ЭКСПОРТ PREKĖS / PASLAUGOS / KODAI ---------
        prekes_xml, paslaugos_xml, kodai_xml = export_prekes_paslaugos_kodai_group_to_rivile(documents)

        # Используем .strip(), чтобы не писались файлы из пустых буферов с \n
        if prekes_xml and prekes_xml.strip():
            files_to_export.append(('prekes.eip', prekes_xml))

        if paslaugos_xml and paslaugos_xml.strip():
            files_to_export.append(('paslaugos.eip', paslaugos_xml))

        # <-- ЭТОГО НЕ ХВАТАЛО
        if kodai_xml and kodai_xml.strip():
            files_to_export.append(('kodai.eip', kodai_xml))
        # -------- КОНЕЦ ---------

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
        


    elif export_type == 'finvalda':
        assign_random_prekes_kodai(documents)

        if pirkimai:
            xml_bytes = export_pirkimai_group_to_finvalda(pirkimai)
            files_to_export.append((f"{today_str}_pirkimai_finvalda.xml", xml_bytes))
        if pardavimai:
            xml_bytes = export_pardavimai_group_to_finvalda(pardavimai)
            files_to_export.append((f"{today_str}_pardavimai_finvalda.xml", xml_bytes))

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
            return Response({"error": "No documents to export"}, status=400)



    elif export_type == 'apskaita5':
        assign_random_prekes_kodai(documents)
        xml_bytes = export_documents_group_to_apskaita5(documents, site_url)
        response = HttpResponse(xml_bytes, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename={today_str}_apskaita5.xml'
        return response



    elif export_type == 'rivile_erp':
        assign_random_prekes_kodai(documents)
        klientai = []
        seen = set()
        for doc in documents:
            if doc.pirkimas_pardavimas == 'pirkimas':
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
            elif doc.pirkimas_pardavimas == 'pardavimas':
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

            # === ВАЖНО: Логика для client['id'] ===
            if not client['id']:
                client['id'] = client['vat'] or ""
            if not client['id']:
                client['id'] = "111111111"

            client_key = (client['id'], client['vat'], client['name'], client['type'])
            if client['id'] and client_key not in seen:
                klientai.append(client)
                seen.add(client_key)

        files_to_export = []

        # --- Экспортируем Klientai.xlsx ---
        if klientai:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                export_clients_to_rivile_erp_xlsx(klientai, tmp.name)
                tmp.seek(0)
                klientai_xlsx_bytes = tmp.read()
            files_to_export.append((f'klientai_{today_str}.xlsx', klientai_xlsx_bytes))

        # --- Экспортируем Prekės, paslaugos.xlsx ---
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            export_prekes_and_paslaugos_to_rivile_erp_xlsx(documents, tmp.name)
            tmp.seek(0)
            prekes_xlsx_bytes = tmp.read()
        files_to_export.append((f'prekes_paslaugos_{today_str}.xlsx', prekes_xlsx_bytes))

        # --- Экспортируем Pirkimai.xlsx ---
        pirkimai = [doc for doc in documents if doc.pirkimas_pardavimas == 'pirkimas']
        if pirkimai:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                export_documents_to_rivile_erp_xlsx(pirkimai, tmp.name, doc_type="pirkimai")
                tmp.seek(0)
                pirkimai_xlsx_bytes = tmp.read()
            files_to_export.append((f'pirkimai_{today_str}.xlsx', pirkimai_xlsx_bytes))

        # --- Экспортируем Pardavimai.xlsx ---
        pardavimai = [doc for doc in documents if doc.pirkimas_pardavimas == 'pardavimas']
        if pardavimai:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                export_documents_to_rivile_erp_xlsx(pardavimai, tmp.name, doc_type="pardavimai")
                tmp.seek(0)
                pardavimai_xlsx_bytes = tmp.read()
            files_to_export.append((f'pardavimai_{today_str}.xlsx', pardavimai_xlsx_bytes))

        # --- ZIP или один файл ---
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
            return Response({"error": "No clients or products to export"}, status=400)








    else:
        return Response({"error": "Unknown export type"}, status=400)
    

    return Response({"error": "No documents to export"}, status=400)



# @api_view(['POST'])
# @permission_classes([IsAuthenticated])
# def export_documents_to_xml_zip(request):
#     ids = request.data.get('ids', [])
#     if not ids:
#         return Response({"error": "No document ids provided"}, status=400)

#     today_str = date.today().strftime('%Y-%m-%d')
#     documents = ScannedDocument.objects.filter(pk__in=ids, user=request.user)
#     if not documents:
#         return Response({"error": "No documents found"}, status=404)

#     # Группируем по типу
#     pirkimai = [doc for doc in documents if getattr(doc, "pirkimas_pardavimas", None) == 'pirkimas']
#     pardavimai = [doc for doc in documents if getattr(doc, "pirkimas_pardavimas", None) == 'pardavimas']

#     print(f"DEBUG: pirkimai={len(pirkimai)}, pardavimai={len(pardavimai)}, всего документов={len(documents)}", file=sys.stderr)
#     sys.stderr.flush()

#     files_to_export = []

#     if pirkimai:
#         xml_bytes = export_documents_group_to_centras_xml(pirkimai)
#         if isinstance(xml_bytes, str):
#             xml_bytes = xml_bytes.encode("utf-8")
#         files_to_export.append((f"{today_str}_pirkimai.xml", xml_bytes))
#     if pardavimai:
#         xml_bytes = export_documents_group_to_centras_xml(pardavimai)
#         if isinstance(xml_bytes, str):
#             xml_bytes = xml_bytes.encode("utf-8")
#         files_to_export.append((f"{today_str}_pardavimai.xml", xml_bytes))

#     print(f"DEBUG: files_to_export = {files_to_export}", file=sys.stderr)
#     sys.stderr.flush()

#     # --------- ВАЖНО: Статус экспортированных документов ---------
#     documents.update(status="exported")

#     if len(files_to_export) > 1:
#         # Экспортируем zip если больше одного файла
#         zip_buffer = io.BytesIO()
#         with zipfile.ZipFile(zip_buffer, "w") as zf:
#             for filename, xml_content in files_to_export:
#                 zf.writestr(filename, xml_content)
#         zip_buffer.seek(0)
#         response = HttpResponse(zip_buffer.read(), content_type='application/zip')
#         response['Content-Disposition'] = f'attachment; filename={today_str}_importui.zip'
#         return response
#     elif len(files_to_export) == 1:
#         filename, xml_content = files_to_export[0]
#         response = HttpResponse(xml_content, content_type='application/xml')
#         response['Content-Disposition'] = f'attachment; filename={filename}'
#         return response
#     else:
#         return Response({"error": "No documents to export"}, status=400)
    



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





# @api_view(['PATCH'])
# @permission_classes([IsAuthenticated])
# def update_extra_fields(request, pk):
#     try:
#         doc = ScannedDocument.objects.get(pk=pk, user=request.user)
#     except ScannedDocument.DoesNotExist:
#         return Response({'error': 'Not found'}, status=404)

#     serializer = ScannedDocumentSerializer(doc, data=request.data, partial=True)
#     if not serializer.is_valid():
#         return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

#     with transaction.atomic():
#         doc = serializer.save()

#         # 1) Пересчёт pirkimas/pardavimas
#         doc_struct = {
#             "seller_id": doc.seller_id,
#             "seller_vat_code": doc.seller_vat_code,
#             "seller_name": doc.seller_name,
#             "buyer_id": doc.buyer_id,
#             "buyer_vat_code": doc.buyer_vat_code,
#             "buyer_name": doc.buyer_name,
#         }
#         doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, request.user)

#         # 2) Применяем дефолты сумiškai
#         changed = False
#         if doc.scan_type == "sumiskai":
#             changed = _apply_sumiskai_defaults_from_user(doc, request.user)

#         # 3) Пересчёт VAT-класса (как у тебя было)
#         doc.vat_class = auto_select_pvm_code(
#             doc.scan_type or "sumiskai",
#             doc.vat_percent or 21,
#             doc.buyer_country_iso or "LT",
#             doc.seller_country_iso or "LT",
#             False
#         )

#         # 4) Сохраняем. ВАЖНО: принудительно сохраняем короткие поля,
#         #    потому что они меняются на самом doc, а не через сериализатор.
#         fields_to_save = ["pirkimas_pardavimas", "pvm_kodas"]
#         if doc.scan_type == "sumiskai":
#             fields_to_save += [
#                 "prekes_pavadinimas",
#                 "prekes_kodas",
#                 "prekes_barkodas",
#                 "preke_paslauga",
#             ]

#         # Если хочешь быть совсем строгим — сохраняй только если реально изменилось:
#         # но для диагностики сейчас сохраняем всегда.
#         doc.save(update_fields=fields_to_save)

#         # 5) Проверяем, что реально лежит в БД после save()
#         doc.refresh_from_db(fields=[
#             "prekes_pavadinimas", "prekes_kodas", "prekes_barkodas",
#             "preke_paslauga", "pirkimas_pardavimas", "pvm_kodas"
#         ])

#     return Response(ScannedDocumentSerializer(doc).data)




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
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_document_detail(request, pk):
    try:
        doc = ScannedDocument.objects.get(pk=pk, user=request.user)
    except ScannedDocument.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)
    serializer = ScannedDocumentDetailSerializer(doc)
    return Response(serializer.data)


#Obnovit extra field vzavisimosti ot vybranoj buh programy
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_scanned_document_extra_fields(request, pk):
    from django.db import transaction
    from .models import ScannedDocument, LineItem
    from .serializers import ScannedDocumentSerializer
    from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
    from .validators.vat_klas import auto_select_pvm_code
    from .utils.save_document import _apply_sumiskai_defaults_from_user  # обновлённая версия

    doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
    if not doc:
        return Response({'error': 'Dokumentas nerastas'}, status=404)

    # Разрешённые к патчу поля
    ALLOWED_FIELDS = [
        'buyer_id', 'buyer_name', 'buyer_vat_code', 'buyer_iban', 'buyer_address', 'buyer_country_iso',
        'seller_id', 'seller_name', 'seller_vat_code', 'seller_iban', 'seller_address', 'seller_country_iso',
        'prekes_kodas', 'prekes_barkodas', 'prekes_pavadinimas', 'preke_paslauga',
        'vat_percent', 'scan_type',
    ]

    fields_to_update = []
    for field in ALLOWED_FIELDS:
        if field in request.data:
            setattr(doc, field, request.data[field])
            fields_to_update.append(field)

    # helper: распознать, что пришёл явный "clear" клиента
    def _is_cleared(prefix: str) -> bool:
        keys = [
            f"{prefix}_name",
            f"{prefix}_id",
            f"{prefix}_vat_code",
            f"{prefix}_iban",
            f"{prefix}_address",
            f"{prefix}_country_iso",
        ]
        touched = any(k in request.data for k in keys)
        if not touched:
            return False
        # все значения пустые/пробельные
        return all(not str(request.data.get(k) or "").strip() for k in keys)

    buyer_cleared = _is_cleared("buyer")
    seller_cleared = _is_cleared("seller")

    # helper: привести apply_defaults к bool
    def _to_bool_allow(x):
        if x is None:
            return None
        if isinstance(x, bool):
            return x
        s = str(x).strip().lower()
        if s in {"0", "false", "no", "ne", "off"}:
            return False
        if s in {"1", "true", "taip", "yes", "on"}:
            return True
        return None  # неизвестно — трактуем как не задано

    apply_defaults_req = _to_bool_allow(request.data.get("apply_defaults", None))

    with transaction.atomic():
        # 0) Сохранить то, что прямо прислали (чтобы расчёт шёл по уже проставленным значениям)
        if fields_to_update:
            doc.save(update_fields=fields_to_update)

        # 1) Пересчёт pirkimas/pardavimas по текущим полям
        doc_struct = {
            "seller_id": doc.seller_id,
            "seller_vat_code": doc.seller_vat_code,
            "seller_name": doc.seller_name,
            "buyer_id": doc.buyer_id,
            "buyer_vat_code": doc.buyer_vat_code,
            "buyer_name": doc.buyer_name,
        }
        doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, request.user)

        # 1.1) Если очищаем одного из клиентов — очистим и «дефолтные» товарные поля
        if buyer_cleared or seller_cleared:
            doc.prekes_pavadinimas = ""
            doc.prekes_kodas = ""
            doc.prekes_barkodas = ""
            doc.preke_paslauga = ""
            fields_to_update += ["prekes_pavadinimas", "prekes_kodas", "prekes_barkodas", "preke_paslauga"]

        # 2) Применение дефолтов (ТОЛЬКО если это sumiskai, режим ясен, не было очистки, и не запрещено флагом)
        scan_type = (doc.scan_type or "").strip().lower()
        mode = (doc.pirkimas_pardavimas or "").strip().lower()
        allow_defaults = (
            scan_type == "sumiskai" and
            mode in ("pirkimas", "pardavimas") and
            not (buyer_cleared or seller_cleared) and
            (apply_defaults_req is None or apply_defaults_req is True)
        )
        if allow_defaults:
            changed = _apply_sumiskai_defaults_from_user(doc, request.user)
            if changed:
                fields_to_update += ["prekes_pavadinimas", "prekes_kodas", "prekes_barkodas", "preke_paslauga"]

        # 3) Пересчёт PVM kodo
        doc.pvm_kodas = auto_select_pvm_code(
            (doc.scan_type or "sumiskai"),
            (doc.vat_percent or 21),
            (doc.buyer_country_iso or "LT"),
            (doc.seller_country_iso or "LT"),
            False
        )

        # 4) Сохранить вычисленные поля
        doc.save(update_fields=list(set(fields_to_update + ["pirkimas_pardavimas", "pvm_kodas"])))

        # 5) Для детальных документов — обновить pvm_kodas в строках
        if scan_type == "detaliai":
            items = LineItem.objects.filter(document=doc)
            for item in items:
                item.pvm_kodas = auto_select_pvm_code(
                    doc.scan_type,
                    (item.vat_percent or doc.vat_percent or 21),
                    (doc.buyer_country_iso or "LT"),
                    (doc.seller_country_iso or "LT"),
                    False
                )
                item.save(update_fields=["pvm_kodas"])

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





# @api_view(['PATCH'])
# @permission_classes([IsAuthenticated])
# def update_scanned_document_extra_fields(request, pk):
#     from .models import ScannedDocument, LineItem
#     from .serializers import ScannedDocumentSerializer
#     from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
#     from .validators.vat_klas import auto_select_pvm_code

#     doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
#     if not doc:
#         return Response({'error': 'Dokumentas nerastas'}, status=404)

#     # Разрешённые поля (добавь нужные, если чего не хватает)
#     ALLOWED_FIELDS = [
#         'buyer_id', 'buyer_name', 'buyer_vat_code', 'buyer_iban', 'buyer_address', 'buyer_country_iso',
#         'seller_id', 'seller_name', 'seller_vat_code', 'seller_iban', 'seller_address', 'seller_country_iso',
#         'prekes_kodas', 'prekes_barkodas', 'prekes_pavadinimas',
#         # ... (добавь остальные нужные)
#     ]

#     changed = False
#     for field in ALLOWED_FIELDS:
#         if field in request.data:
#             setattr(doc, field, request.data[field])
#             changed = True
#     if changed:
#         doc.save()

#         # --- Здесь твоя логика для автоопределения ---
#         doc_struct = {
#             "seller_id": doc.seller_id,
#             "seller_vat_code": doc.seller_vat_code,
#             "seller_name": doc.seller_name,
#             "buyer_id": doc.buyer_id,
#             "buyer_vat_code": doc.buyer_vat_code,
#             "buyer_name": doc.buyer_name,
#         }
#         doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, request.user)
#         doc.vat_class = auto_select_pvm_code(
#             doc.scan_type or "sumiskai",
#             doc.vat_percent or 21,
#             doc.buyer_country_iso or "LT",
#             doc.seller_country_iso or "LT",
#             False
#         )
#         doc.save(update_fields=["pirkimas_pardavimas", "pvm_kodas"])

#         # Если детальные — обновим line items
#         if doc.scan_type == "detaliai":
#             items = LineItem.objects.filter(document=doc)
#             for item in items:
#                 item.vat_class = auto_select_pvm_code(
#                     doc.scan_type,
#                     item.vat_percent or doc.vat_percent or 21,
#                     doc.buyer_country_iso or "LT",
#                     doc.seller_country_iso or "LT",
#                     False
#                 )
#                 item.save(update_fields=["pvm_kodas"])

#     # Возвращаем сериализованный документ
#     return Response(ScannedDocumentSerializer(doc).data)





# @api_view(['PATCH'])
# @permission_classes([IsAuthenticated])
# def update_lineitem_fields(request, doc_id, lineitem_id):
#     doc = get_object_or_404(ScannedDocument, pk=doc_id, user=request.user)
#     lineitem = get_object_or_404(LineItem, pk=lineitem_id, document=doc)
#     allowed = ['prekes_kodas', 'prekes_pavadinimas', 'prekes_barkodas']
#     for field in allowed:
#         if field in request.data:
#             setattr(lineitem, field, request.data[field])
#     lineitem.save()
#     return Response({'success': True})

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