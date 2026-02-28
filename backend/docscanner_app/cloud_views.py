"""
Cloud Integration Views — OAuth, clients, folders, webhooks, unified inbox.
"""

import hashlib
import hmac
import json
import logging
from datetime import timedelta

from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════
#  Serializers
# ════════════════════════════════════════════════

class CloudClientSerializer(serializers.ModelSerializer):
    folders = serializers.SerializerMethodField()

    class Meta:
        from .models import CloudClient
        model = CloudClient
        fields = ["id", "name", "folder_name", "company_code",
                  "is_active", "created_at", "folders"]
        read_only_fields = ["id", "folder_name", "created_at"]

    def get_folders(self, obj):
        return [
            {
                "id": f.id,
                "provider": f.connection.provider,
                "provider_display": f.connection.get_provider_display(),
                "remote_folder_id": f.remote_folder_id,
                "is_shared": f.is_shared,
                "shared_with_emails": f.shared_with_emails,
                "last_polled_at": f.last_polled_at,
            }
            for f in obj.cloud_folders.select_related("connection").filter(is_active=True)
        ]


class CloudConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import CloudConnection
        model = CloudConnection
        fields = ["id", "provider", "account_email",
                  "is_active", "created_at", "last_synced_at"]


# ════════════════════════════════════════════════
#  OAuth — Google Drive
# ════════════════════════════════════════════════

class GoogleDriveAuthStartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .cloud_services import GoogleDriveService
        auth_url = GoogleDriveService.get_auth_url(state=str(request.user.id))
        return Response({"auth_url": auth_url})


class GoogleDriveAuthCallbackView(APIView):
    permission_classes = []

    def get(self, request):
        from .models import CloudConnection
        from .cloud_services import GoogleDriveService, auto_create_folders_for_connection
        from django.contrib.auth import get_user_model

        code = request.GET.get("code")
        state = request.GET.get("state")
        if not code or not state:
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?error=missing_params"
            )

        try:
            user = get_user_model().objects.get(id=int(state))
        except Exception:
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?error=invalid_user"
            )

        try:
            tokens = GoogleDriveService.exchange_code(code)
            conn, _ = CloudConnection.objects.update_or_create(
                user=user, provider="google_drive",
                defaults={
                    "access_token": tokens["access_token"],
                    "refresh_token": tokens.get("refresh_token") or "",
                    "token_expires_at": tokens.get("expires_at"),
                    "is_active": True,
                },
            )

            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?connected=google_drive"
            )
        except Exception as e:
            logger.error("Google OAuth failed: %s", e, exc_info=True)
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?error=oauth_failed"
            )


# ════════════════════════════════════════════════
#  OAuth — Dropbox
# ════════════════════════════════════════════════

class DropboxAuthStartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .cloud_services import DropboxService
        auth_url = DropboxService.get_auth_url(state=str(request.user.id))
        return Response({"auth_url": auth_url})


class DropboxAuthCallbackView(APIView):
    permission_classes = []

    def get(self, request):
        from .models import CloudConnection
        from .cloud_services import DropboxService, auto_create_folders_for_connection
        from django.contrib.auth import get_user_model

        code = request.GET.get("code")
        state = request.GET.get("state")
        if not code or not state:
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?error=missing_params"
            )

        try:
            user = get_user_model().objects.get(id=int(state))
        except Exception:
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?error=invalid_user"
            )

        try:
            tokens = DropboxService.exchange_code(code)
            expires_at = None
            if tokens.get("expires_in"):
                expires_at = timezone.now() + timedelta(seconds=tokens["expires_in"])

            conn, _ = CloudConnection.objects.update_or_create(
                user=user, provider="dropbox",
                defaults={
                    "access_token": tokens["access_token"],
                    "refresh_token": tokens.get("refresh_token") or "",
                    "token_expires_at": expires_at,
                    "is_active": True,
                },
            )

            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?connected=dropbox"
            )
        except Exception as e:
            logger.error("Dropbox OAuth failed: %s", e, exc_info=True)
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/nustatymai?error=oauth_failed"
            )


# ════════════════════════════════════════════════
#  Connections
# ════════════════════════════════════════════════

class CloudConnectionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import CloudConnection
        qs = CloudConnection.objects.filter(user=request.user)
        return Response(CloudConnectionSerializer(qs, many=True).data)


class CloudConnectionDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, provider):
        from .models import CloudConnection
        try:
            conn = CloudConnection.objects.get(user=request.user, provider=provider)
            conn.is_active = False
            conn.save(update_fields=["is_active"])
            return Response({"status": "disconnected"})
        except CloudConnection.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


# ════════════════════════════════════════════════
#  Cloud Clients — CRUD + автопапки
# ════════════════════════════════════════════════

class CloudClientListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import CloudClient
        qs = CloudClient.objects.filter(
            user=request.user, is_active=True
        ).prefetch_related("cloud_folders__connection")
        return Response(CloudClientSerializer(qs, many=True).data)

    def post(self, request):
        from .models import CloudClient, CloudConnection, CloudClientFolder
        from .cloud_services import get_cloud_service

        name = (request.data.get("name") or "").strip()
        provider = (request.data.get("provider") or "").strip()

        if not name:
            return Response({"error": "Įveskite kliento pavadinimą"}, status=400)
        if not provider:
            return Response({"error": "Pasirinkite debesų tiekėją"}, status=400)

        # Проверяем что провайдер подключён
        try:
            connection = CloudConnection.objects.get(
                user=request.user, provider=provider, is_active=True
            )
        except CloudConnection.DoesNotExist:
            return Response({"error": f"{provider} neprijungtas"}, status=400)

        folder_name = CloudClient.generate_folder_name(name)

        # Находим или создаём клиента
        client, created = CloudClient.objects.get_or_create(
            user=request.user,
            folder_name=folder_name,
            defaults={
                "name": name,
                "company_code": (request.data.get("company_code") or "").strip(),
            },
        )

        # Проверяем дубликат: этот клиент + этот провайдер
        if CloudClientFolder.objects.filter(
            cloud_client=client, connection=connection
        ).exists():
            return Response(
                {"error": f"Klientas '{name}' jau turi aplanką {connection.get_provider_display()}"},
                status=400,
            )

        # Создаём папку только в выбранном провайдере
        service = get_cloud_service(provider)
        try:
            remote_id = service.create_folder(connection, client.folder_name)
            CloudClientFolder.objects.create(
                cloud_client=client,
                connection=connection,
                remote_folder_id=remote_id,
            )
        except Exception as e:
            return Response({"error": f"Nepavyko sukurti aplanko: {e}"}, status=500)

        client.refresh_from_db()
        return Response(
            CloudClientSerializer(client).data,
            status=status.HTTP_201_CREATED,
        )


class CloudClientDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, client_id):
        from .models import CloudClient
        try:
            client = CloudClient.objects.get(id=client_id, user=request.user)
        except CloudClient.DoesNotExist:
            return Response(status=404)

        if "name" in request.data:
            client.name = request.data["name"]
        if "company_code" in request.data:
            client.company_code = request.data["company_code"]
        client.save()
        return Response(CloudClientSerializer(client).data)

    def delete(self, request, client_id):
        from .models import CloudClient
        try:
            client = CloudClient.objects.get(id=client_id, user=request.user)
        except CloudClient.DoesNotExist:
            return Response(status=404)
        client.is_active = False
        client.save(update_fields=["is_active"])
        client.cloud_folders.update(is_active=False)
        return Response(status=204)


# ════════════════════════════════════════════════
#  Share folder
# ════════════════════════════════════════════════

class ShareCloudFolderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import CloudClientFolder
        from .cloud_services import get_cloud_service

        folder_id = request.data.get("folder_id")
        email = (request.data.get("email") or "").strip()
        if not folder_id or not email:
            return Response({"error": "folder_id ir email privalomi"}, status=400)

        try:
            folder = CloudClientFolder.objects.select_related("connection").get(
                id=folder_id, connection__user=request.user,
            )
        except CloudClientFolder.DoesNotExist:
            return Response(status=404)

        service = get_cloud_service(folder.connection.provider)
        try:
            service.share_folder(folder.connection, folder.remote_folder_id, email)
        except Exception as e:
            return Response({"error": f"Nepavyko bendrinti: {e}"}, status=500)

        if email not in folder.shared_with_emails:
            folder.shared_with_emails.append(email)
        folder.is_shared = True
        folder.save(update_fields=["shared_with_emails", "is_shared"])

        return Response({"status": "shared", "email": email})


# ════════════════════════════════════════════════
#  Manual sync
# ════════════════════════════════════════════════

class ManualSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, folder_id):
        from .models import CloudClientFolder
        from .tasks import sync_cloud_folder

        try:
            CloudClientFolder.objects.get(
                id=folder_id, connection__user=request.user, is_active=True,
            )
        except CloudClientFolder.DoesNotExist:
            return Response(status=404)

        sync_cloud_folder.delay(folder_id, event_type="poll")
        return Response({"status": "sync_scheduled"})


# ════════════════════════════════════════════════
#  Webhooks
# ════════════════════════════════════════════════

class GoogleDriveWebhookView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        from .models import CloudConnection
        from .tasks import schedule_sync_after_webhook

        channel_id = request.headers.get("X-Goog-Channel-ID", "")
        resource_state = request.headers.get("X-Goog-Resource-State", "")

        if resource_state == "sync":
            return HttpResponse(status=200)
        if not channel_id:
            return HttpResponse(status=400)

        try:
            conn = CloudConnection.objects.get(
                gdrive_channel_id=channel_id, is_active=True
            )
            schedule_sync_after_webhook.delay(conn.id)
        except CloudConnection.DoesNotExist:
            logger.warning("Unknown GDrive channel: %s", channel_id)

        return HttpResponse(status=200)


class DropboxWebhookView(APIView):
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        challenge = request.GET.get("challenge", "")
        resp = HttpResponse(challenge, content_type="text/plain")
        resp["X-Content-Type-Options"] = "nosniff"
        return resp

    def post(self, request):
        from .models import CloudConnection
        from .tasks import schedule_sync_after_webhook

        signature = request.headers.get("X-Dropbox-Signature", "")
        expected = hmac.new(
            settings.DROPBOX_APP_SECRET.encode(), request.body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return HttpResponse(status=403)

        try:
            data = json.loads(request.body)
            accounts = data.get("list_folder", {}).get("accounts", [])
        except Exception:
            return HttpResponse(status=400)

        for _ in accounts:
            for conn in CloudConnection.objects.filter(
                provider="dropbox", is_active=True
            ):
                schedule_sync_after_webhook.delay(conn.id)

        return HttpResponse(status=200)


# ════════════════════════════════════════════════
#  Unified Inbox — для IsKlientu
# ════════════════════════════════════════════════

class UnifiedInboxView(APIView):
    """
    ВСЕ документы из MobileInboxDocument (mob + email + cloud).
    Поддерживает cursor pagination и фильтры source / client_id.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import MobileInboxDocument
        from rest_framework.pagination import CursorPagination

        qs = MobileInboxDocument.objects.filter(
            user=request.user, is_processed=False,
        ).select_related("cloud_client").order_by("-created_at")

        source = request.query_params.get("source")
        if source:
            qs = qs.filter(source=source)

        client_id = request.query_params.get("client_id")
        if client_id:
            qs = qs.filter(cloud_client_id=client_id)

        class InboxPagination(CursorPagination):
            page_size = 50
            ordering = "-created_at"

        total_count = qs.count()

        paginator = InboxPagination()
        page = paginator.paginate_queryset(qs, request)

        source_labels = {
            "mob": "Mob",
            "email": "El. paštas",
            "google_drive": "Google Drive",
            "dropbox": "Dropbox",
        }

        results = []
        for doc in page:
            # Sender info зависит от source
            if doc.source in ("google_drive", "dropbox"):
                sender_primary = doc.cloud_client.name if doc.cloud_client_id else None
                sender_secondary = doc.cloud_client.company_code if doc.cloud_client_id and doc.cloud_client.company_code else None
            elif doc.source == "mob":
                sender_primary = doc.access_key.label if doc.access_key_id else None
                sender_secondary = doc.sender_email or None
            else:  # email
                sender_primary = doc.sender_email or None
                sender_secondary = None


            # Preview URL — полный URL
            preview = doc.preview_url
            if not preview and doc.uploaded_file:
                try:
                    preview = doc.uploaded_file.url
                except Exception:
                    preview = None

            # Делаем абсолютный URL
            if preview and not preview.startswith("http"):
                preview = request.build_absolute_uri(preview)

            results.append({
                "id": doc.id,
                "source": doc.source,
                "source_label": source_labels.get(doc.source, doc.source),
                "original_filename": doc.original_filename,
                "sender_primary": sender_primary,
                "sender_secondary": sender_secondary,
                "sender_email": doc.sender_email,
                "client_name": (
                    doc.cloud_client.name if doc.cloud_client_id else None
                ),
                "client_id": doc.cloud_client_id,
                "client_company_code": (
                    doc.cloud_client.company_code if doc.cloud_client_id and doc.cloud_client else None
                ),
                "created_at": doc.created_at.isoformat(),
                "preview_url": preview,
                "size_bytes": doc.size_bytes,
            })

        resp = paginator.get_paginated_response(results)
        resp.data["total_count"] = total_count
        return resp
    

class InboxClientsView(APIView):
    """Возвращает уникальных клиентов у которых есть документы в inbox"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import MobileInboxDocument, CloudClient

        client_ids = (
            MobileInboxDocument.objects
            .filter(user=request.user, is_processed=False, cloud_client__isnull=False)
            .values_list("cloud_client_id", flat=True)
            .distinct()
        )
        clients = CloudClient.objects.filter(id__in=client_ids).values(
            "id", "name", "company_code"
        )
        return Response(list(clients))