import logging
from .models import CustomUser
from datetime import timedelta
from django.utils import timezone
from .serializers import CustomUserSerializer
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.db.models import Q
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from decimal import Decimal
from datetime import date
from django.shortcuts import get_object_or_404
from rest_framework import status
from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas

from .data_import.data_import_from_buh import import_products_from_xlsx, import_clients_from_xlsx

from .models import ScannedDocument, ProductAutocomplete, ClientAutocomplete, LineItem


from django.conf import settings
import io
import sys
import zipfile
from .tasks import process_uploaded_file_task

from .serializers import ScannedDocumentSerializer
from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
from .validators.vat_klas import auto_select_pvm_code

from django.utils.dateparse import parse_date
from .serializers import ScannedDocumentListSerializer, ScannedDocumentDetailSerializer

from django.http import HttpResponse
from .exports.centas  import export_documents_group_to_centras_xml



logger = logging.getLogger('docscanner_app')
site_url = settings.SITE_URL_FRONTEND  # берём из settings.py

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_documents_to_xml_zip(request):
    ids = request.data.get('ids', [])
    if not ids:
        return Response({"error": "No document ids provided"}, status=400)

    today_str = date.today().strftime('%Y-%m-%d')
    documents = ScannedDocument.objects.filter(pk__in=ids, user=request.user)
    if not documents:
        return Response({"error": "No documents found"}, status=404)

    # Группируем по типу
    pirkimai = [doc for doc in documents if getattr(doc, "pirkimas_pardavimas", None) == 'pirkimas']
    pardavimai = [doc for doc in documents if getattr(doc, "pirkimas_pardavimas", None) == 'pardavimas']

    print(f"DEBUG: pirkimai={len(pirkimai)}, pardavimai={len(pardavimai)}, всего документов={len(documents)}", file=sys.stderr)
    sys.stderr.flush()

    files_to_export = []

    if pirkimai:
        xml_bytes = export_documents_group_to_centras_xml(pirkimai)
        if isinstance(xml_bytes, str):
            xml_bytes = xml_bytes.encode("utf-8")
        files_to_export.append((f"{today_str}_pirkimai.xml", xml_bytes))
    if pardavimai:
        xml_bytes = export_documents_group_to_centras_xml(pardavimai)
        if isinstance(xml_bytes, str):
            xml_bytes = xml_bytes.encode("utf-8")
        files_to_export.append((f"{today_str}_pardavimai.xml", xml_bytes))

    print(f"DEBUG: files_to_export = {files_to_export}", file=sys.stderr)
    sys.stderr.flush()

    # --------- ВАЖНО: Статус экспортированных документов ---------
    documents.update(status="exported")

    if len(files_to_export) > 1:
        # Экспортируем zip если больше одного файла
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
    else:
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





@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_extra_fields(request, pk):
    try:
        doc = ScannedDocument.objects.get(pk=pk, user=request.user)
    except ScannedDocument.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    # Обновляем переданные поля (buyer/seller)
    serializer = ScannedDocumentSerializer(doc, data=request.data, partial=True)
    if serializer.is_valid():
        doc = serializer.save()

        # Пересчитываем pirkimas_pardavimas
        doc_struct = {
            "seller_id": doc.seller_id,
            "seller_vat_code": doc.seller_vat_code,
            "seller_name": doc.seller_name,
            "buyer_id": doc.buyer_id,
            "buyer_vat_code": doc.buyer_vat_code,
            "buyer_name": doc.buyer_name,
        }
        doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, request.user)

        # Пересчитываем vat_class для документа
        doc.vat_class = auto_select_pvm_code(
            doc.scan_type or "sumiskai",
            doc.vat_percent or 21,
            doc.buyer_country_iso or "LT",
            doc.seller_country_iso or "LT",
            False
        )
        doc.save(update_fields=["pirkimas_pardavimas", "pvm_kodas"])

        # Если scan_type == "detaliai" — обновим vat_class у строк
        if doc.scan_type == "detaliai":
            items = LineItem.objects.filter(document=doc)
            for item in items:
                item.vat_class = auto_select_pvm_code(
                    doc.scan_type,
                    item.vat_percent or doc.vat_percent or 21,
                    doc.buyer_country_iso or "LT",
                    doc.seller_country_iso or "LT",
                    False
                )
                item.save(update_fields=["pvm_kodas"])

        # Возвращаем обновленный документ
        return Response(ScannedDocumentSerializer(doc).data)
    else:
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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
    from .models import ScannedDocument, LineItem
    from .serializers import ScannedDocumentSerializer
    from .utils.pirkimas_pardavimas import determine_pirkimas_pardavimas
    from .validators.vat_klas import auto_select_pvm_code

    doc = ScannedDocument.objects.filter(pk=pk, user=request.user).first()
    if not doc:
        return Response({'error': 'Dokumentas nerastas'}, status=404)

    # Разрешённые поля (добавь нужные, если чего не хватает)
    ALLOWED_FIELDS = [
        'buyer_id', 'buyer_name', 'buyer_vat_code', 'buyer_iban', 'buyer_address', 'buyer_country_iso',
        'seller_id', 'seller_name', 'seller_vat_code', 'seller_iban', 'seller_address', 'seller_country_iso',
        'prekes_kodas', 'prekes_barkodas', 'prekes_pavadinimas',
        # ... (добавь остальные нужные)
    ]

    changed = False
    for field in ALLOWED_FIELDS:
        if field in request.data:
            setattr(doc, field, request.data[field])
            changed = True
    if changed:
        doc.save()

        # --- Здесь твоя логика для автоопределения ---
        doc_struct = {
            "seller_id": doc.seller_id,
            "seller_vat_code": doc.seller_vat_code,
            "seller_name": doc.seller_name,
            "buyer_id": doc.buyer_id,
            "buyer_vat_code": doc.buyer_vat_code,
            "buyer_name": doc.buyer_name,
        }
        doc.pirkimas_pardavimas = determine_pirkimas_pardavimas(doc_struct, request.user)
        doc.vat_class = auto_select_pvm_code(
            doc.scan_type or "sumiskai",
            doc.vat_percent or 21,
            doc.buyer_country_iso or "LT",
            doc.seller_country_iso or "LT",
            False
        )
        doc.save(update_fields=["pirkimas_pardavimas", "pvm_kodas"])

        # Если детальные — обновим line items
        if doc.scan_type == "detaliai":
            items = LineItem.objects.filter(document=doc)
            for item in items:
                item.vat_class = auto_select_pvm_code(
                    doc.scan_type,
                    item.vat_percent or doc.vat_percent or 21,
                    doc.buyer_country_iso or "LT",
                    doc.seller_country_iso or "LT",
                    False
                )
                item.save(update_fields=["pvm_kodas"])

    # Возвращаем сериализованный документ
    return Response(ScannedDocumentSerializer(doc).data)





@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_lineitem_fields(request, doc_id, lineitem_id):
    doc = get_object_or_404(ScannedDocument, pk=doc_id, user=request.user)
    lineitem = get_object_or_404(LineItem, pk=lineitem_id, document=doc)
    allowed = ['prekes_kodas', 'prekes_pavadinimas', 'prekes_barkodas']
    for field in allowed:
        if field in request.data:
            setattr(lineitem, field, request.data[field])
    lineitem.save()
    return Response({'success': True})





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