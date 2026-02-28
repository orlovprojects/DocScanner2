"""
Cloud Provider Services — Google Drive / Dropbox API.

pip install google-api-python-client google-auth google-auth-oauthlib dropbox

settings.py:
    GOOGLE_DRIVE_CLIENT_ID = "..."
    GOOGLE_DRIVE_CLIENT_SECRET = "..."
    GOOGLE_DRIVE_REDIRECT_URI = "https://app.dokskenas.lt/api/cloud/google/callback"
    DROPBOX_APP_KEY = "..."
    DROPBOX_APP_SECRET = "..."
    DROPBOX_REDIRECT_URI = "https://app.dokskenas.lt/api/cloud/dropbox/callback"
"""

import io
import logging
from abc import ABC, abstractmethod
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

logging.config.dictConfig(settings.LOGGING)
logger = logging.getLogger('docscanner_app')


# ════════════════════════════════════════════════
#  CloudFile — универсальное представление файла
# ════════════════════════════════════════════════

class CloudFile:
    def __init__(self, file_id, name, size=0, mime_type="", modified_at=None):
        self.file_id = file_id
        self.name = name
        self.size = size
        self.mime_type = mime_type
        self.modified_at = modified_at

    @property
    def has_prefix(self):
        return self.name.startswith("ISSIUSTA_") or self.name.startswith("KLAIDA_")


# ════════════════════════════════════════════════
#  Base
# ════════════════════════════════════════════════

class BaseCloudService(ABC):
    @abstractmethod
    def refresh_token_if_needed(self, connection): ...
    @abstractmethod
    def create_folder(self, connection, folder_name, parent_id=None): ...
    @abstractmethod
    def list_new_files(self, connection, folder_id): ...
    @abstractmethod
    def download_file(self, connection, file_id): ...
    @abstractmethod
    def rename_file(self, connection, file_id, new_name): ...
    @abstractmethod
    def share_folder(self, connection, folder_id, email, role="writer"): ...


# ════════════════════════════════════════════════
#  Google Drive
# ════════════════════════════════════════════════

class GoogleDriveService(BaseCloudService):

    SCOPES = [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive",
    ]

    @staticmethod
    def _client_config():
        return {
            "web": {
                "client_id": settings.GOOGLE_DRIVE_CLIENT_ID,
                "client_secret": settings.GOOGLE_DRIVE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }

    @staticmethod
    def get_auth_url(state=""):
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            GoogleDriveService._client_config(),
            scopes=GoogleDriveService.SCOPES,
        )
        flow.redirect_uri = settings.GOOGLE_DRIVE_REDIRECT_URI
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        return auth_url

    @staticmethod
    def exchange_code(code):
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            GoogleDriveService._client_config(),
            scopes=GoogleDriveService.SCOPES,
        )
        flow.redirect_uri = settings.GOOGLE_DRIVE_REDIRECT_URI
        flow.fetch_token(code=code)
        creds = flow.credentials
        return {
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "expires_at": creds.expiry,
        }

    def refresh_token_if_needed(self, connection):
        if not connection.is_token_expired:
            return
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        creds = Credentials(
            token=connection.access_token,
            refresh_token=connection.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_DRIVE_CLIENT_ID,
            client_secret=settings.GOOGLE_DRIVE_CLIENT_SECRET,
        )
        creds.refresh(Request())
        connection.access_token = creds.token
        connection.token_expires_at = creds.expiry
        connection.save(update_fields=["access_token", "token_expires_at"])

    def _get_service(self, connection):
        self.refresh_token_if_needed(connection)
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        creds = Credentials(
            token=connection.access_token,
            refresh_token=connection.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_DRIVE_CLIENT_ID,
            client_secret=settings.GOOGLE_DRIVE_CLIENT_SECRET,
        )
        return build("drive", "v3", credentials=creds)

    def create_folder(self, connection, folder_name, parent_id=None):
        service = self._get_service(connection)
        metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parent_id:
            metadata["parents"] = [parent_id]
        folder = service.files().create(body=metadata, fields="id").execute()
        logger.info("Created GDrive folder '%s' -> %s", folder_name, folder["id"])
        return folder["id"]

    def list_new_files(self, connection, folder_id):
        service = self._get_service(connection)
        query = (
            f"'{folder_id}' in parents"
            f" and trashed=false"
            f" and not name contains 'ISSIUSTA_'"
            f" and not name contains 'KLAIDA_'"
            f" and mimeType != 'application/vnd.google-apps.folder'"
        )
        results = []
        page_token = None
        while True:
            resp = service.files().list(
                q=query,
                fields="nextPageToken, files(id, name, size, mimeType, modifiedTime)",
                pageSize=100, pageToken=page_token,
            ).execute()
            for f in resp.get("files", []):
                results.append(CloudFile(
                    file_id=f["id"], name=f["name"],
                    size=int(f.get("size", 0)),
                    mime_type=f.get("mimeType", ""),
                    modified_at=f.get("modifiedTime"),
                ))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return results

    def download_file(self, connection, file_id):
        service = self._get_service(connection)
        meta = service.files().get(fileId=file_id, fields="name").execute()
        from googleapiclient.http import MediaIoBaseDownload
        request = service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        return buffer.getvalue(), meta["name"]

    def rename_file(self, connection, file_id, new_name):
        service = self._get_service(connection)
        try:
            service.files().update(fileId=file_id, body={"name": new_name}).execute()
            return True
        except Exception as e:
            logger.error("GDrive rename failed %s: %s", file_id, e)
            return False

    def share_folder(self, connection, folder_id, email, role="writer"):
        service = self._get_service(connection)
        result = service.permissions().create(
            fileId=folder_id,
            body={"type": "user", "role": role, "emailAddress": email},
            sendNotificationEmail=True,
        ).execute()
        return result

    def setup_push_notifications(self, connection, folder_id, webhook_url):
        import uuid as _uuid
        service = self._get_service(connection)
        channel_id = str(_uuid.uuid4())
        expiration = timezone.now() + timedelta(hours=24)
        body = {
            "id": channel_id, "type": "web_hook",
            "address": webhook_url,
            "expiration": int(expiration.timestamp() * 1000),
        }
        result = service.files().watch(fileId=folder_id, body=body).execute()
        connection.gdrive_channel_id = channel_id
        connection.gdrive_channel_expiration = expiration
        connection.save(update_fields=["gdrive_channel_id", "gdrive_channel_expiration"])
        return result


# ════════════════════════════════════════════════
#  Dropbox
# ════════════════════════════════════════════════

class DropboxService(BaseCloudService):

    @staticmethod
    def get_auth_url(state=""):
        return (
            f"https://www.dropbox.com/oauth2/authorize"
            f"?client_id={settings.DROPBOX_APP_KEY}"
            f"&redirect_uri={settings.DROPBOX_REDIRECT_URI}"
            f"&response_type=code&token_access_type=offline"
            f"&state={state}"
        )

    @staticmethod
    def exchange_code(code):
        import requests
        resp = requests.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "code": code, "grant_type": "authorization_code",
                "client_id": settings.DROPBOX_APP_KEY,
                "client_secret": settings.DROPBOX_APP_SECRET,
                "redirect_uri": settings.DROPBOX_REDIRECT_URI,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
        }

    def refresh_token_if_needed(self, connection):
        if not connection.is_token_expired or not connection.refresh_token:
            return
        import requests
        resp = requests.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": connection.refresh_token,
                "client_id": settings.DROPBOX_APP_KEY,
                "client_secret": settings.DROPBOX_APP_SECRET,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        connection.access_token = data["access_token"]
        connection.token_expires_at = timezone.now() + timedelta(
            seconds=data.get("expires_in", 14400)
        )
        connection.save(update_fields=["access_token", "token_expires_at"])

    def _get_client(self, connection):
        import dropbox
        self.refresh_token_if_needed(connection)
        return dropbox.Dropbox(connection.access_token)

    def create_folder(self, connection, folder_name, parent_id=None):
        dbx = self._get_client(connection)
        path = f"{parent_id}/{folder_name}" if parent_id else f"/{folder_name}"
        try:
            result = dbx.files_create_folder_v2(path)
            return result.metadata.path_display
        except Exception as e:
            if "conflict" in str(e).lower():
                return path
            raise

    def list_new_files(self, connection, folder_id):
        dbx = self._get_client(connection)
        import dropbox as dbx_module
        results = []
        try:
            resp = dbx.files_list_folder(folder_id)
        except Exception as e:
            logger.error("Dropbox list failed %s: %s", folder_id, e)
            return results
        while True:
            for entry in resp.entries:
                if isinstance(entry, dbx_module.files.FolderMetadata):
                    continue
                if entry.name.startswith("ISSIUSTA_") or entry.name.startswith("KLAIDA_"):
                    continue
                results.append(CloudFile(
                    file_id=entry.path_display, name=entry.name,
                    size=getattr(entry, "size", 0),
                    modified_at=getattr(entry, "server_modified", None),
                ))
            if not resp.has_more:
                break
            resp = dbx.files_list_folder_continue(resp.cursor)
        return results

    def download_file(self, connection, file_id):
        dbx = self._get_client(connection)
        metadata, response = dbx.files_download(file_id)
        return response.content, metadata.name

    def rename_file(self, connection, file_id, new_name):
        dbx = self._get_client(connection)
        parts = file_id.rsplit("/", 1)
        folder_path = parts[0] if len(parts) == 2 else ""
        new_path = f"{folder_path}/{new_name}"
        try:
            dbx.files_move_v2(file_id, new_path)
            return True
        except Exception as e:
            logger.error("Dropbox rename failed %s: %s", file_id, e)
            return False

    def share_folder(self, connection, folder_id, email, role="editor"):
        dbx = self._get_client(connection)
        import dropbox as dbx_module
        try:
            shared = dbx.sharing_share_folder(folder_id)
            shared_folder_id = shared.shared_folder_id
        except Exception as e:
            if "already_shared" in str(e).lower():
                meta = dbx.sharing_get_folder_metadata(folder_id)
                shared_folder_id = meta.shared_folder_id
            else:
                raise
        member = dbx_module.sharing.MemberSelector.email(email)
        access_level = (
            dbx_module.sharing.AccessLevel.editor if role == "editor"
            else dbx_module.sharing.AccessLevel.viewer
        )
        dbx.sharing_add_folder_member(
            shared_folder_id,
            members=[dbx_module.sharing.AddMember(member=member, access_level=access_level)],
        )
        return {"shared_folder_id": shared_folder_id, "email": email}


# ════════════════════════════════════════════════
#  Factory
# ════════════════════════════════════════════════

def get_cloud_service(provider):
    if provider == "google_drive":
        return GoogleDriveService()
    elif provider == "dropbox":
        return DropboxService()
    raise ValueError(f"Unknown provider: {provider}")


# ════════════════════════════════════════════════
#  AUTO-CREATE FOLDERS
#  1) После OAuth → папки для ВСЕХ клиентов
#  2) После нового клиента → папки во ВСЕХ провайдерах
# ════════════════════════════════════════════════

def auto_create_folders_for_connection(connection):
    """После подключения провайдера — создать папки для всех клиентов."""
    from .models import CloudClient, CloudClientFolder

    service = get_cloud_service(connection.provider)
    clients = CloudClient.objects.filter(user=connection.user, is_active=True)

    created = []
    for client in clients:
        if CloudClientFolder.objects.filter(
            cloud_client=client, connection=connection
        ).exists():
            continue
        try:
            remote_id = service.create_folder(connection, client.folder_name)
            folder = CloudClientFolder.objects.create(
                cloud_client=client, connection=connection,
                remote_folder_id=remote_id,
            )
            created.append(folder)
            logger.info("Auto-created '%s' in %s", client.folder_name, connection.provider)
        except Exception as e:
            logger.error("Failed to create '%s': %s", client.folder_name, e)
    return created


def auto_create_folders_for_client(client):
    """После нового клиента — создать папки во всех подключённых провайдерах."""
    from .models import CloudConnection, CloudClientFolder

    connections = CloudConnection.objects.filter(user=client.user, is_active=True)

    created = []
    for conn in connections:
        if CloudClientFolder.objects.filter(
            cloud_client=client, connection=conn
        ).exists():
            continue
        service = get_cloud_service(conn.provider)
        try:
            remote_id = service.create_folder(conn, client.folder_name)
            folder = CloudClientFolder.objects.create(
                cloud_client=client, connection=conn,
                remote_folder_id=remote_id,
            )
            created.append(folder)
            logger.info("Auto-created '%s' in %s", client.folder_name, conn.provider)
        except Exception as e:
            logger.error("Failed to create '%s': %s", client.folder_name, e)
    return created