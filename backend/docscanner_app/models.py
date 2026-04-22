from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.utils.timezone import now
import os
import uuid
import hashlib
from django.conf import settings
from django.utils import timezone
import secrets
from decimal import Decimal
import string
from django.core.validators import MaxValueValidator
from dateutil.relativedelta import relativedelta
from datetime import timedelta


#wagtail importy
from wagtail.models import Page
from wagtail.fields import StreamField, RichTextField
from wagtail.admin.panels import FieldPanel
from wagtail import blocks
from wagtail.api import APIField
from wagtail.images.blocks import ImageChooserBlock
from wagtail.embeds.blocks import EmbedBlock
from wagtail.images.api.fields import ImageRenditionField
from wagtail.api import APIField

#search
from django.utils.html import strip_tags


#helpers
def _body_to_text(stream_value) -> str:
    parts = []
    try:
        items = getattr(stream_value, "stream_data", None) or list(stream_value)
    except Exception:
        items = stream_value
    if isinstance(items, dict):
        items = items.get("stream") or items.get("blocks") or []
    if isinstance(items, str):
        return strip_tags(items)
    for blk in items or []:
        btype = getattr(blk, "block_type", None) or getattr(blk, "type", None)
        bval = getattr(blk, "value", None)
        if btype is None and isinstance(blk, dict):
            btype = blk.get("type"); bval = blk.get("value")
        if btype in {"heading", "paragraph", "quote", "code"} and bval:
            parts.append(strip_tags(str(bval)))
        elif btype == "table" and isinstance(bval, dict):
            data = bval.get("data") or {}
            stream = data.get("stream") or data.get("blocks") or data
            try:
                for row in stream:
                    row_val = getattr(row, "value", None) or row
                    if isinstance(row_val, list):
                        parts.append(" ".join([strip_tags(str(x)) for x in row_val]))
            except Exception:
                pass
    return " ".join(p for p in parts if p).strip()


def user_upload_path(instance, filename):
    email_hash = hashlib.sha256(instance.user.email.lower().encode()).hexdigest()[:16]
    ext = filename.split('.')[-1]
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    return os.path.join("uploads", email_hash, unique_name)


# Dlia podsciota progresa v progress bar posle zagruzki failov
class UploadSession(models.Model):
    STAGES = [
        ("uploading", "uploading"),
        ("credit_check", "credit_check"),
        ("queued", "queued"),
        ("processing", "processing"),
        ("done", "done"),
        ("blocked", "blocked"),
        ("failed", "failed"),
    ]

    ARCHIVE_FORMATS = [
        ("", "None"),
        ("zip", "ZIP"),
        ("rar", "RAR"),
        ("7z", "7Z"),
        ("tar", "TAR"),
        ("tar.gz", "TAR.GZ"),
        ("tar.bz2", "TAR.BZ2"),
        ("tar.xz", "TAR.XZ"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="upload_sessions",
    )

    scan_type = models.CharField(max_length=32, default="sumiskai", db_index=True)
    stage = models.CharField(max_length=32, choices=STAGES, default="uploading", db_index=True)

    client_total_files = models.PositiveIntegerField(default=0)

    uploaded_files = models.PositiveIntegerField(default=0)
    uploaded_bytes = models.BigIntegerField(default=0)

    expected_items = models.PositiveIntegerField(default=0)  # dlya credit-check (kak budto vsyo uspeshno)
    actual_items = models.PositiveIntegerField(default=0)    # real'no postavleno v obrabotku
    processed_items = models.PositiveIntegerField(default=0)
    done_items = models.PositiveIntegerField(default=0)
    failed_items = models.PositiveIntegerField(default=0)

    pending_archives = models.PositiveIntegerField(default=0)

    archive_formats = models.JSONField(default=list, blank=True)

    error_message = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    reserved_credits = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    reserved_items = models.PositiveIntegerField(default=0)  # сколько “единиц” зарезервили (expected docs)

    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "stage"]),
            models.Index(fields=["created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"UploadSession({self.id}) user={self.user_id} stage={self.stage}"
    

class ChunkedUpload(models.Model):
    STATUS = [
        ("uploading", "uploading"),
        ("complete", "complete"),
        ("failed", "failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chunked_uploads")
    session = models.ForeignKey("UploadSession", on_delete=models.CASCADE, related_name="chunked_uploads")

    filename = models.CharField(max_length=255)
    total_size = models.BigIntegerField()
    chunk_size = models.IntegerField()
    total_chunks = models.IntegerField()

    # simplest: список полученных индексов (не идеально для 10000, но для 2GB при chunk=10-25MB это ок)
    received = models.JSONField(default=list, blank=True)  # e.g. [0,1,2,5,...]
    status = models.CharField(max_length=16, choices=STATUS, default="uploading")

    tmp_path = models.TextField(blank=True, default="")  # путь до .part
    error_message = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["session", "status"]),
        ]



class ScannedDocument(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Tikrinami'),
        ('processing', 'Vykdomi'),
        ('completed', 'Atlikti (Neeksportuoti)'),
        ('rejected', 'Atmesti'),
        ('exported', 'Atlikti (Eksportuoti)'),
    ]

    SCAN_TYPE_CHOICES = [
        ('sumiskai', 'Sumiškai'),
        ('detaliai', 'Detaliai'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    file = models.FileField(upload_to=user_upload_path)
    original_filename = models.CharField(max_length=255)

    # Статус и ошибки
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='processing')
    error_message = models.TextField(blank=True, null=True)
    preview_url = models.URLField(blank=True, null=True)
    scan_type = models.CharField(
        max_length=32,
        choices=SCAN_TYPE_CHOICES,
        default='sumiskai'
    )  # <-- Новое поле

    # OCR и JSON-результаты
    raw_text = models.TextField(blank=True, null=True)
    glued_raw_text = models.TextField(blank=True, null=True)
    gpt_raw_json = models.JSONField(blank=True, null=True)
    structured_json = models.JSONField(blank=True, null=True)
    enhanced_ocr_text = models.TextField(blank=True, null=True)
    enhanced_ocr_source = models.CharField(max_length=50, blank=True, null=True)

    # Поля из структурированных данных (для фильтрации/поиска)
    document_type = models.CharField(max_length=100, blank=True, null=True)
    similarity_percent = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    pirkimas_pardavimas = models.CharField(
        max_length=20,
        choices=[("pirkimas", "Pirkimas"), ("pardavimas", "Pardavimas"), ("nezinoma", "Nežinoma")],
        blank=True,
        null=True,
    )

    seller_id_programoje = models.CharField(max_length=64, blank=True, null=True)
    seller_id = models.CharField(max_length=100, blank=True, null=True)
    seller_name = models.CharField(max_length=255, blank=True, null=True)
    seller_vat_code = models.CharField(max_length=50, blank=True, null=True)
    seller_address = models.CharField(max_length=255, blank=True, null=True)
    seller_country = models.CharField(max_length=50, blank=True, null=True)
    seller_country_iso = models.CharField(max_length=10, blank=True, null=True)
    seller_iban = models.CharField(max_length=255, blank=True, null=True)
    seller_is_person = models.BooleanField(blank=True, null=True)
    seller_name_normalized = models.CharField(max_length=255, blank=True, default="")
    seller_vat_val = models.CharField(max_length=32, null=True, blank=True)

    buyer_id_programoje = models.CharField(max_length=64, blank=True, null=True)
    buyer_id = models.CharField(max_length=100, blank=True, null=True)
    buyer_name = models.CharField(max_length=255, blank=True, null=True)
    buyer_vat_code = models.CharField(max_length=50, blank=True, null=True)
    buyer_address = models.CharField(max_length=255, blank=True, null=True)
    buyer_country = models.CharField(max_length=50, blank=True, null=True)
    buyer_country_iso = models.CharField(max_length=10, blank=True, null=True)
    buyer_iban = models.CharField(max_length=255, blank=True, null=True)
    buyer_is_person = models.BooleanField(blank=True, null=True)
    buyer_name_normalized = models.CharField(max_length=255, blank=True, default="")
    buyer_vat_val = models.CharField(max_length=32, null=True, blank=True)

    invoice_date = models.DateField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    operation_date = models.DateField(blank=True, null=True)
    document_series = models.CharField(max_length=50, blank=True, null=True)
    document_number = models.CharField(max_length=100, blank=True, null=True)
    order_number = models.CharField(max_length=100, blank=True, null=True)
    amount_wo_vat = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)
    vat_amount = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)
    vat_percent = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    amount_with_vat = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)
    invoice_discount_with_vat = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)
    invoice_discount_wo_vat = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)
    separate_vat = models.BooleanField(blank=True, null=True)
    doc_96_str = models.BooleanField(blank=True, null=True)
    currency = models.CharField(max_length=20, blank=True, null=True)
    with_receipt = models.BooleanField(blank=True, null=True)
    paid_by_cash = models.BooleanField(blank=True, null=True)

    note = models.TextField(blank=True, null=True)
    report_to_isaf = models.BooleanField(blank=True, null=True)
    document_type_code = models.CharField(max_length=50, blank=True, null=True)
    xml_source = models.CharField(max_length=255, blank=True, null=True)

    # ===== Дополнительные поля для autocomplete =====
    # Продуктовые поля
    prekes_kodas = models.CharField("Prekės kodas", max_length=128, blank=True, null=True)
    prekes_barkodas = models.CharField("Prekės barkodas", max_length=128, blank=True, null=True)
    prekes_pavadinimas = models.CharField("Prekės pavadinimas", max_length=255, blank=True, null=True)
    prekes_tipas = models.CharField("Prekės tipas", max_length=128, blank=True, null=True)
    preke_paslauga = models.CharField("Preke_paslauga", max_length=12, blank=True, null=True)


    sandelio_kodas = models.CharField("Sandėlio kodas", max_length=128, blank=True, null=True)
    sandelio_pavadinimas = models.CharField("Sandėlio pavadinimas", max_length=255, blank=True, null=True)
    objekto_kodas = models.CharField("Objekto kodas", max_length=128, blank=True, null=True)
    objekto_pavadinimas = models.CharField("Objekto pavadinimas", max_length=255, blank=True, null=True)
    padalinio_kodas = models.CharField("Padalinio kodas", max_length=128, blank=True, null=True)
    padalinio_pavadinimas = models.CharField("Padalinio pavadinimas", max_length=255, blank=True, null=True)
    mokescio_kodas = models.CharField("Mokesčio kodas", max_length=128, blank=True, null=True)
    mokescio_pavadinimas = models.CharField("Mokesčio pavadinimas", max_length=255, blank=True, null=True)
    atsakingo_asmens_kodas = models.CharField("Atsakingo asmens kodas", max_length=128, blank=True, null=True)
    atsakingo_asmens_pavadinimas = models.CharField("Atsakingo asmens pavadinimas", max_length=255, blank=True, null=True)
    operacijos_kodas = models.CharField("Operacijos kodas", max_length=128, blank=True, null=True)
    operacijos_pavadinimas = models.CharField("Operacijos pavadinimas", max_length=255, blank=True, null=True)
    islaidu_straipsnio_kodas = models.CharField("Išlaidų straipsnio kodas", max_length=128, blank=True, null=True)
    islaidu_straipsnio_pavadinimas = models.CharField("Išlaidų straipsnio pavadinimas", max_length=255, blank=True, null=True)
    pvm_kodas = models.CharField("PVM kodas", max_length=128, blank=True, null=True)
    pvm_pavadinimas = models.CharField("PVM pavadinimas", max_length=255, blank=True, null=True)
    tipo_kodas = models.CharField("Tipo kodas", max_length=128, blank=True, null=True)
    tipo_pavadinimas = models.CharField("Tipo pavadinimas", max_length=255, blank=True, null=True)
    zurnalo_kodas = models.CharField("Žurnalo kodas", max_length=128, blank=True, null=True)
    zurnalo_pavadinimas = models.CharField("Žurnalo pavadinimas", max_length=255, blank=True, null=True)
    projekto_kodas = models.CharField("Projekto kodas", max_length=128, blank=True, null=True)
    projekto_pavadinimas = models.CharField("Projekto pavadinimas", max_length=255, blank=True, null=True)
    projekto_vadovo_kodas = models.CharField("Projekto vadovo kodas", max_length=128, blank=True, null=True)
    projekto_vadovo_pavadinimas = models.CharField("Projekto vadovo pavadinimas", max_length=255, blank=True, null=True)
    skyrio_kodas = models.CharField("Skyriaus kodas", max_length=128, blank=True, null=True)
    skyrio_pavadinimas = models.CharField("Skyriaus pavadinimas", max_length=255, blank=True, null=True)
    partijos_nr_kodas = models.CharField("Partijos nr. kodas", max_length=128, blank=True, null=True)
    partijos_nr_pavadinimas = models.CharField("Partijos nr. pavadinimas", max_length=255, blank=True, null=True)
    korespondencijos_kodas = models.CharField("Korespondencijos kodas", max_length=128, blank=True, null=True)
    korespondencijos_pavadinimas = models.CharField("Korespondencijos pavadinimas", max_length=255, blank=True, null=True)
    serijos_kodas = models.CharField("Serijos kodas", max_length=128, blank=True, null=True)
    serijos_pavadinimas = models.CharField("Serijos pavadinimas", max_length=255, blank=True, null=True)
    centro_kodas = models.CharField("Centro kodas", max_length=128, blank=True, null=True)
    centro_pavadinimas = models.CharField("Centro pavadinimas", max_length=255, blank=True, null=True)

    # ===== Validators =====
    val_ar_sutapo = models.BooleanField(null=True, blank=True)
    val_subtotal_match = models.BooleanField(null=True, blank=True)
    val_vat_match = models.BooleanField(null=True, blank=True)
    val_total_match = models.BooleanField(null=True, blank=True)
    ready_for_export = models.BooleanField(null=True, blank=True, default=None)
    math_validation_passed = models.BooleanField(null=True, blank=True, default=None)

    # ===== Novyje dlia progress bar i razdelenija uploadov na neskolko sessij =====
    upload_session = models.ForeignKey(
        UploadSession,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="documents",
    )

    counted_in_session = models.BooleanField(default=False)

    is_archive_container = models.BooleanField(default=False)
    archive_file_count = models.PositiveIntegerField(default=0)


    parent_document = models.ForeignKey(
        "self",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="children",
    )

    upload_batch_index = models.PositiveIntegerField(null=True, blank=True)

    uploaded_size_bytes = models.BigIntegerField(default=0)

    optimum_api_status = models.CharField(max_length=20, blank=True, default='')
    optimum_last_try_date = models.DateTimeField(null=True, blank=True)

    dineta_api_status = models.CharField(max_length=20, blank=True, default='')
    dineta_last_try_date = models.DateTimeField(null=True, blank=True)

    rivile_api_status = models.CharField(
        "Rivile API statusas",
        max_length=20,
        blank=True,
        null=True,
        help_text="success / partial_success / error",
    )
    rivile_api_last_try = models.DateTimeField(
        "Rivile API paskutinis bandymas",
        null=True,
        blank=True,
    )
    rivile_api_kodas_po = models.CharField(
        "Rivile operacijos numeris (I06_KODAS_PO)",
        max_length=20,
        blank=True,
        help_text="Grąžintas Rivile GAMA operacijos numeris",
    )

    class Meta:
        indexes = [
            models.Index(fields=["user", "-uploaded_at"], name="idx_user_uploaded_desc"),
            models.Index(fields=["user", "status", "-uploaded_at"], name="idx_user_status_uploaded"),
            # verxnije 2 indexa novyje, nize 3 kotoryje byli do verxnix
            # models.Index(fields=["user"]),
            # models.Index(fields=["uploaded_at"]),
            # models.Index(fields=["seller_name"]),
            models.Index(fields=["user", "seller_name_normalized"], name="idx_user_seller_norm"),
            models.Index(fields=["user", "buyer_name_normalized"], name="idx_user_buyer_norm"),
            models.Index(fields=["upload_session"]),
            models.Index(fields=["parent_document"]),
        ]

    def __str__(self):
        return f"{self.original_filename} ({self.user.email})"
    






class LineItem(models.Model):
    document = models.ForeignKey('ScannedDocument', on_delete=models.CASCADE, related_name='line_items')
    line_id = models.CharField(max_length=100, blank=True, null=True)
    prekes_kodas = models.CharField("Prekės kodas", max_length=128, blank=True, null=True)
    prekes_barkodas = models.CharField("Prekės barkodas", max_length=128, blank=True, null=True)
    prekes_pavadinimas = models.CharField("Prekės pavadinimas", max_length=255, blank=True, null=True)
    prekes_tipas = models.CharField("Prekės tipas", max_length=128, blank=True, null=True)
    unit = models.CharField(max_length=50, blank=True, null=True)               # <matovnt> / unit
    quantity = models.DecimalField(max_digits=15, decimal_places=5, blank=True, null=True)  # <kiekis>
    price = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)     # <kaina> / price
    subtotal = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)  # <suma_v> / subtotal
    vat = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)       # <suma_pvmv> / vat
    vat_percent = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True) # <pvm_proc> / vatpercent
    total = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)     # <total>
    preke_paslauga = models.CharField("Preke_paslauga", max_length=12, blank=True, null=True)

    discount_with_vat = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)
    discount_wo_vat = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)

    # ДОБАВЛЕННЫЕ поля для product autocomplete (те же как в ProductAutocomplete)

    sandelio_kodas = models.CharField("Sandėlio kodas", max_length=128, blank=True, null=True)
    sandelio_pavadinimas = models.CharField("Sandėlio pavadinimas", max_length=255, blank=True, null=True)
    objekto_kodas = models.CharField("Objekto kodas", max_length=128, blank=True, null=True)
    objekto_pavadinimas = models.CharField("Objekto pavadinimas", max_length=255, blank=True, null=True)
    padalinio_kodas = models.CharField("Padalinio kodas", max_length=128, blank=True, null=True)
    padalinio_pavadinimas = models.CharField("Padalinio pavadinimas", max_length=255, blank=True, null=True)
    mokescio_kodas = models.CharField("Mokesčio kodas", max_length=128, blank=True, null=True)
    mokescio_pavadinimas = models.CharField("Mokesčio pavadinimas", max_length=255, blank=True, null=True)
    atsakingo_asmens_kodas = models.CharField("Atsakingo asmens kodas", max_length=128, blank=True, null=True)
    atsakingo_asmens_pavadinimas = models.CharField("Atsakingo asmens pavadinimas", max_length=255, blank=True, null=True)
    operacijos_kodas = models.CharField("Operacijos kodas", max_length=128, blank=True, null=True)
    operacijos_pavadinimas = models.CharField("Operacijos pavadinimas", max_length=255, blank=True, null=True)
    islaidu_straipsnio_kodas = models.CharField("Išlaidų straipsnio kodas", max_length=128, blank=True, null=True)
    islaidu_straipsnio_pavadinimas = models.CharField("Išlaidų straipsnio pavadinimas", max_length=255, blank=True, null=True)
    pvm_kodas = models.CharField("PVM kodas", max_length=128, blank=True, null=True)
    pvm_pavadinimas = models.CharField("PVM pavadinimas", max_length=255, blank=True, null=True)
    tipo_kodas = models.CharField("Tipo kodas", max_length=128, blank=True, null=True)
    tipo_pavadinimas = models.CharField("Tipo pavadinimas", max_length=255, blank=True, null=True)
    zurnalo_kodas = models.CharField("Žurnalo kodas", max_length=128, blank=True, null=True)
    zurnalo_pavadinimas = models.CharField("Žurnalo pavadinimas", max_length=255, blank=True, null=True)
    projekto_kodas = models.CharField("Projekto kodas", max_length=128, blank=True, null=True)
    projekto_pavadinimas = models.CharField("Projekto pavadinimas", max_length=255, blank=True, null=True)
    projekto_vadovo_kodas = models.CharField("Projekto vadovo kodas", max_length=128, blank=True, null=True)
    projekto_vadovo_pavadinimas = models.CharField("Projekto vadovo pavadinimas", max_length=255, blank=True, null=True)
    skyrio_kodas = models.CharField("Skyriaus kodas", max_length=128, blank=True, null=True)
    skyrio_pavadinimas = models.CharField("Skyriaus pavadinimas", max_length=255, blank=True, null=True)
    partijos_nr_kodas = models.CharField("Partijos nr. kodas", max_length=128, blank=True, null=True)
    partijos_nr_pavadinimas = models.CharField("Partijos nr. pavadinimas", max_length=255, blank=True, null=True)
    korespondencijos_kodas = models.CharField("Korespondencijos kodas", max_length=128, blank=True, null=True)
    korespondencijos_pavadinimas = models.CharField("Korespondencijos pavadinimas", max_length=255, blank=True, null=True)
    serijos_kodas = models.CharField("Serijos kodas", max_length=128, blank=True, null=True)
    serijos_pavadinimas = models.CharField("Serijos pavadinimas", max_length=255, blank=True, null=True)
    centro_kodas = models.CharField("Centro kodas", max_length=128, blank=True, null=True)
    centro_pavadinimas = models.CharField("Centro pavadinimas", max_length=255, blank=True, null=True)


    def __str__(self):
        return f"{self.product_name or ''} ({self.product_code or ''}) x{self.quantity or ''}"




# Log dlia kreditov
class CreditUsageLog(models.Model):
    user = models.ForeignKey(
        'CustomUser',
        on_delete=models.CASCADE,
        related_name='credit_usage_logs',
    )
    scanned_document = models.ForeignKey(
        'ScannedDocument',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='credit_usage_logs',
    )
    credits_used = models.DecimalField(max_digits=6, decimal_places=2, default=1)
    document_filename = models.CharField(max_length=512, blank=True, default='')
    document_deleted_by_user = models.BooleanField(default=False)
    document_deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        status = ' [DELETED]' if self.document_deleted_by_user else ''
        return f"User {self.user_id} | -{self.credits_used} cr | {self.document_filename}{status}"














# Менеджер пользователя
class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        """
        Создаёт обычного пользователя с email и паролем.
        """
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        extra_fields.setdefault('is_active', True)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """
        Создаёт суперпользователя с email и паролем.
        """
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self.create_user(email, password, **extra_fields)
    

ACCOUNTING_PROGRAM_CHOICES = [
    ('rivile', 'Rivilė GAMA'),
    ('rivile_erp', 'Rivilė ERP'),
    ('bss', 'BSS'),
    ('finvalda', 'Finvalda'),
    ('apskaita5', 'Apskaita5'),
    ('centas', 'Centas'),
    ('agnum', 'Agnum'),
    ('pragma3', 'Pragma 3.2'),
    ('pragma4', 'Pragma 4'),
    ('butent', 'Būtent'),
    ('dineta', 'Dineta'),
    ('optimum', 'Optimum'),
    ('debetas', 'Debetas'),
    ('site_pro', 'Site.Pro (B1)'),
    ('apsa', 'APSA'),
    ('isaf', 'iSAF'),
    ('paulita', 'Paulita'),
    ('rivile_gama_api', 'Rivilė GAMA (per API)'),
    ('stekas', 'Stekas Plius'),
    # добавь нужные программы
]





def _purchase_default_list():
    return []  # список профилей (каждый профиль — dict)

def _sales_default_list():
    return []




class CustomUser(AbstractUser):
    # --- NEW: view mode choices ---
    VIEW_MODE_SINGLE = "single"
    VIEW_MODE_MULTI  = "multi"
    VIEW_MODE_CHOICES = [
        (VIEW_MODE_SINGLE, "Single-company"),
        (VIEW_MODE_MULTI,  "Multi-company"),
    ]

    username = None
    email = models.EmailField(unique=True)

    pswd_reset_code = models.CharField(
        max_length=7, 
        blank=True, 
        null=True,
        verbose_name="Slaptažodžio atkūrimo kodas"
    )
    pswd_code_sent = models.DateTimeField(
        blank=True, 
        null=True,
        verbose_name="Kodo išsiuntimo laikas"
    )
    pswd_reset_attempts = models.PositiveSmallIntegerField(
        default=0,
        verbose_name="Neteisingų bandymų skaičius"
    )

    credits = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    credits_reserved = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)
    subscription_status = models.CharField(max_length=50, blank=True, null=True)
    subscription_plan = models.CharField(max_length=255, blank=True, null=True)
    subscription_start_date = models.DateTimeField(blank=True, null=True)
    subscription_end_date = models.DateTimeField(blank=True, null=True)
    default_accounting_program = models.CharField(
        max_length=32, choices=ACCOUNTING_PROGRAM_CHOICES, blank=True, null=True
    )
    company_name = models.CharField("Įmonės pavadinimas", max_length=255, blank=True, null=True)
    company_code = models.CharField("Įmonės kodas", max_length=50, blank=True, null=True)
    vat_code = models.CharField("PVM kodas", max_length=50, blank=True, null=True)
    company_iban = models.CharField("Įmonės IBAN", max_length=255, blank=True, null=True)
    company_address = models.CharField("Įmonės adresas", max_length=255, blank=True, null=True)
    company_country_iso = models.CharField("Įmonės šalis", max_length=10, blank=True, null=True)

    purchase_defaults = models.JSONField(default=_purchase_default_list, blank=True)
    sales_defaults = models.JSONField(default=_sales_default_list, blank=True)
    lineitem_rules = models.JSONField(default=list, blank=True)

    extra_settings = models.JSONField(blank=True, null=True)

    dineta_settings = models.JSONField(default=dict, blank=True)
    optimum_settings = models.JSONField(default=dict, blank=True)

    rivile_erp_extra_fields = models.JSONField(default=dict, blank=True)
    rivile_gama_extra_fields = models.JSONField(default=dict, blank=True)
    butent_extra_fields      = models.JSONField(default=dict, blank=True)
    finvalda_extra_fields    = models.JSONField(default=dict, blank=True)
    centas_extra_fields      = models.JSONField(default=dict, blank=True)
    agnum_extra_fields       = models.JSONField(default=dict, blank=True)
    debetas_extra_fields       = models.JSONField(default=dict, blank=True)
    site_pro_extra_fields       = models.JSONField(default=dict, blank=True)
    pragma3_extra_fields       = models.JSONField(default=dict, blank=True)
    pragma4_extra_fields       = models.JSONField(default=dict, blank=True)
    optimum_extra_fields       = models.JSONField(default=dict, blank=True)
    dineta_extra_fields       = models.JSONField(default=dict, blank=True)

    email_inbox_token = models.CharField(
        max_length=15,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )

    registration_ip = models.GenericIPAddressField(
        "Registracijos IP", null=True, blank=True
    )

    registration_source = models.CharField(
        "Registracijos šaltinis",
        max_length=32,
        choices=[
            ("skaitmenizavimas", "Skaitmenizavimas"),
            ("israsymas", "Sąskaitų išrašymas"),
        ],
        blank=True,
        null=True,
    )

    trial_expired_email_sent_at = models.DateTimeField(
        "Trial pabaigos laiško data",
        blank=True,
        null=True,
    )

    onboarding_email_sent_at = models.DateTimeField(
        "Onboarding laiško išsiuntimo data",
        blank=True,
        null=True,
    )

    # mobile_key = models.CharField(max_length=64, unique=True, null=True, blank=True)

    # def generate_mobile_key(self, save: bool = True) -> str:
    #     """
    #     Генерирует новый мобильный ключ для пользователя.
    #     """
    #     # token_urlsafe(32) даёт ~43 символа
    #     self.mobile_key = secrets.token_urlsafe(32)
    #     if save:
    #         self.save(update_fields=["mobile_key"])
    #     return self.mobile_key

    # --- NEW: UI režimas dokumentų sąrašui ---
    view_mode = models.CharField(
        max_length=16,
        choices=VIEW_MODE_CHOICES,
        default=VIEW_MODE_MULTI,
        help_text="UI mode for documents: single or multi company."
    )

    # --- ISRASYMAS ---
    payment_providers = models.JSONField(
        "Mokėjimo nuorodų teikėjai",
        default=dict,
        blank=True,
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    def __str__(self):
        return self.email

    def get_subscription_status(self):
        current_time = now()
        if self.subscription_status == "trial":
            if self.subscription_end_date and self.subscription_end_date < current_time:
                return "trial_expired"
            return "trial"
        elif self.subscription_status == "active":
            if self.subscription_end_date and self.subscription_end_date < current_time:
                return "expired"
            return "active"
        elif self.subscription_status == "canceled":
            if self.subscription_end_date and self.subscription_end_date < current_time:
                return "canceled_expired"
            return "canceled"
        return "unknown"
    
    @staticmethod
    def _generate_inbox_token():
        """15 символов: lowercase буквы + цифры, без путаницы (без o/0/l/1)."""
        alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
        return ''.join(secrets.choice(alphabet) for _ in range(15))

    def ensure_inbox_token(self, save=True):
        """Генерирует токен если его ещё нет."""
        if not self.email_inbox_token:
            for _ in range(10):  # на случай коллизии
                token = self._generate_inbox_token()
                if not CustomUser.objects.filter(email_inbox_token=token).exists():
                    self.email_inbox_token = token
                    if save:
                        self.save(update_fields=["email_inbox_token"])
                    return token
            raise RuntimeError("Failed to generate unique inbox token")
        return self.email_inbox_token

    @property
    def inbox_email_address(self):
        if self.email_inbox_token:
            return f"{self.email_inbox_token}@inbox.dokskenas.lt"
        return None


    
### Integracii s buhalterskimi programami:

class ProductAutocomplete(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="product_autocomplete"
    )

    prekes_kodas = models.CharField("Prekės kodas", max_length=128, blank=True, null=True)
    prekes_barkodas = models.CharField("Prekės barkodas", max_length=128, blank=True, null=True)
    prekes_pavadinimas = models.CharField("Prekės pavadinimas", max_length=255, blank=True, null=True)
    prekes_tipas = models.CharField("Prekės tipas", max_length=128, blank=True, null=True)
    preke_paslauga = models.CharField("Preke_paslauga", max_length=12, blank=True, null=True)

    sandelio_kodas = models.CharField("Sandėlio kodas", max_length=128, blank=True, null=True)
    sandelio_pavadinimas = models.CharField("Sandėlio pavadinimas", max_length=255, blank=True, null=True)
    objekto_kodas = models.CharField("Objekto kodas", max_length=128, blank=True, null=True)
    objekto_pavadinimas = models.CharField("Objekto pavadinimas", max_length=255, blank=True, null=True)
    padalinio_kodas = models.CharField("Padalinio kodas", max_length=128, blank=True, null=True)
    padalinio_pavadinimas = models.CharField("Padalinio pavadinimas", max_length=255, blank=True, null=True)
    mokescio_kodas = models.CharField("Mokesčio kodas", max_length=128, blank=True, null=True)
    mokescio_pavadinimas = models.CharField("Mokesčio pavadinimas", max_length=255, blank=True, null=True)
    atsakingo_asmens_kodas = models.CharField("Atsakingo asmens kodas", max_length=128, blank=True, null=True)
    atsakingo_asmens_pavadinimas = models.CharField("Atsakingo asmens pavadinimas", max_length=255, blank=True, null=True)
    operacijos_kodas = models.CharField("Operacijos kodas", max_length=128, blank=True, null=True)
    operacijos_pavadinimas = models.CharField("Operacijos pavadinimas", max_length=255, blank=True, null=True)
    islaidu_straipsnio_kodas = models.CharField("Išlaidų straipsnio kodas", max_length=128, blank=True, null=True)
    islaidu_straipsnio_pavadinimas = models.CharField("Išlaidų straipsnio pavadinimas", max_length=255, blank=True, null=True)
    pvm_kodas = models.CharField("PVM kodas", max_length=128, blank=True, null=True)
    pvm_pavadinimas = models.CharField("PVM pavadinimas", max_length=255, blank=True, null=True)
    tipo_kodas = models.CharField("Tipo kodas", max_length=128, blank=True, null=True)
    tipo_pavadinimas = models.CharField("Tipo pavadinimas", max_length=255, blank=True, null=True)
    zurnalo_kodas = models.CharField("Žurnalo kodas", max_length=128, blank=True, null=True)
    zurnalo_pavadinimas = models.CharField("Žurnalo pavadinimas", max_length=255, blank=True, null=True)
    projekto_kodas = models.CharField("Projekto kodas", max_length=128, blank=True, null=True)
    projekto_pavadinimas = models.CharField("Projekto pavadinimas", max_length=255, blank=True, null=True)
    projekto_vadovo_kodas = models.CharField("Projekto vadovo kodas", max_length=128, blank=True, null=True)
    projekto_vadovo_pavadinimas = models.CharField("Projekto vadovo pavadinimas", max_length=255, blank=True, null=True)
    skyrio_kodas = models.CharField("Skyriaus kodas", max_length=128, blank=True, null=True)
    skyrio_pavadinimas = models.CharField("Skyriaus pavadinimas", max_length=255, blank=True, null=True)
    partijos_nr_kodas = models.CharField("Partijos nr. kodas", max_length=128, blank=True, null=True)
    partijos_nr_pavadinimas = models.CharField("Partijos nr. pavadinimas", max_length=255, blank=True, null=True)
    korespondencijos_kodas = models.CharField("Korespondencijos kodas", max_length=128, blank=True, null=True)
    korespondencijos_pavadinimas = models.CharField("Korespondencijos pavadinimas", max_length=255, blank=True, null=True)
    serijos_kodas = models.CharField("Serijos kodas", max_length=128, blank=True, null=True)
    serijos_pavadinimas = models.CharField("Serijos pavadinimas", max_length=255, blank=True, null=True)
    centro_kodas = models.CharField("Centro kodas", max_length=128, blank=True, null=True)
    centro_pavadinimas = models.CharField("Centro pavadinimas", max_length=255, blank=True, null=True)


    class Meta:
        verbose_name = "Prekės autocomplete įrašas"
        verbose_name_plural = "Prekės autocomplete įrašai"
        indexes = [
            models.Index(fields=["user", "prekes_kodas"]),
        ]

    def __str__(self):
        return f"{self.prekes_pavadinimas or self.prekes_kodas}"



class ClientAutocomplete(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="clients"
    )
    kodas_programoje = models.CharField("Kliento kodas programoje", max_length=128, blank=True, null=True)
    imones_kodas = models.CharField("Imonės kodas", max_length=128, blank=True, db_index=True, null=True)
    pavadinimas = models.CharField("Pavadinimas", max_length=255, blank=True, null=True)
    pvm_kodas = models.CharField("PVM kodas", max_length=128, blank=True, null=True)
    ibans = models.CharField("IBANs (per kablelį, jei keli)", max_length=512, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    country_iso = models.CharField(max_length=10, blank=True, null=True)
    is_person = models.BooleanField("Fizinis asmuo", default=False)

    class Meta:
        verbose_name = "Klientas autocomplete įrašas"
        verbose_name_plural = "Klientai autocomplete įrašai"
        indexes = [
            models.Index(fields=["user", "imones_kodas"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "imones_kodas"],
                condition=~models.Q(imones_kodas__isnull=True) & ~models.Q(imones_kodas=""),
                name="unique_client_code_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.pavadinimas or self.imones_kodas}"
    



class PVMKlasifikatoriai(models.Model):
    kodas = models.CharField(max_length=16, unique=True)
    aprasymas = models.TextField()
    tarifas = models.CharField(max_length=8, blank=True, null=True)

    def __str__(self):
        return f"{self.kodas} ({self.tarifas})"
    


class CurrencyRate(models.Model):
    currency = models.CharField(max_length=8, db_index=True)
    date = models.DateField(db_index=True)
    rate = models.DecimalField(max_digits=15, decimal_places=8)
    checked_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', 'currency']
        constraints = [
            models.UniqueConstraint(
                fields=['currency', 'date'],
                name='uniq_currency_date',
            )
        ]
    



class Company(models.Model):
    im_kodas     = models.CharField(max_length=16, unique=True, blank=True, null=True)     # Идентификационный код фирмы
    pavadinimas  = models.CharField(max_length=255, db_index=True, blank=True, null=True)  # Название фирмы
    normalized_pavadinimas = models.CharField(max_length=255, db_index=True, blank=True, null=True)
    ireg_data    = models.DateField(null=True, blank=True)          # Дата регистрации
    isreg_data   = models.DateField(null=True, blank=True)          # Дата закрытия (если есть)
    tipas        = models.CharField(max_length=64, blank=True, null=True)      # Тип организации
    pvm_kodas    = models.CharField(max_length=32, blank=True, null=True)      # PVM/VAT код
    pvm_ireg     = models.DateField(null=True, blank=True)          # Дата регистрации PVM
    pvm_isreg    = models.DateField(null=True, blank=True)          # Дата снятия с PVM
    adresas      = models.CharField(max_length=512, blank=True, null=True, verbose_name="Adresas")
    aob_kodas    = models.IntegerField(blank=True, null=True, db_index=True)
    last_synced_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["pavadinimas"]),
            models.Index(fields=["pvm_kodas"]),
            models.Index(fields=["normalized_pavadinimas"]),
        ]
        verbose_name = "Company"
        verbose_name_plural = "Company"

    def __str__(self):
        return f"{self.pavadinimas} ({self.im_kodas})"


class AdClick(models.Model):
    ad_name = models.CharField(max_length=100)  # например "DokskenAd"
    user = models.ForeignKey('CustomUser', on_delete=models.SET_NULL, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.ad_name} - {self.created_at}"
    

#Dlia soxranenii danyx o paymentax
class Payments(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='payments')

    # Stripe
    stripe_event_id = models.CharField(max_length=255, db_index=True, unique=True)
    session_id = models.CharField(max_length=255, db_index=True)
    payment_intent_id = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    customer_id = models.CharField(max_length=255, blank=True, null=True, db_index=True)

    # Money
    amount_subtotal = models.BigIntegerField(default=0)   # cents
    amount_tax = models.BigIntegerField(default=0)
    amount_total = models.BigIntegerField(default=0)
    stripe_fee = models.BigIntegerField(default=0)
    net_amount = models.BigIntegerField(default=0)  # amount_total - stripe_fee
    currency = models.CharField(max_length=10, default='eur')

    # Credits
    credits_purchased = models.IntegerField(default=0)

    dok_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        db_index=True,
        unique=True,
    )

    # Buyer snapshot
    buyer_email = models.EmailField(blank=True, null=True)
    buyer_address_json = models.JSONField(default=dict, blank=True)

    # Status/time
    payment_status = models.CharField(max_length=32, default='paid')
    paid_at = models.DateTimeField(default=timezone.now)

    # Links
    receipt_url = models.URLField(blank=True, null=True)

    # Raw
    created_at = models.DateTimeField(auto_now_add=True)

    # Subscription
    payment_type = models.CharField(max_length=20, default="credits", db_index=True)  # "credits" | "inv_subscription"
    plan = models.CharField(max_length=50, blank=True, default="")
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    stripe_invoice_id = models.CharField(max_length=255, blank=True, default="")
    invoice_pdf_url = models.URLField(blank=True, default="")




#Wagtail modeli
from django.db import models
from wagtail.models import Page
from wagtail.fields import StreamField, RichTextField
from wagtail.admin.panels import FieldPanel
from wagtail import blocks
# (опционально) from wagtail.api import APIField  # если используешь API


class GuideIndexPage(Page):
    subpage_types = ["docscanner_app.GuideCategoryPage"]



class GuideCategoryPage(Page):
    description = RichTextField(blank=True)
    cat_image = models.ForeignKey(
        "wagtailimages.Image",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    order = models.PositiveIntegerField(default=0)
    search_text = models.TextField(blank=True, default="")

    def save(self, *args, **kwargs):
        title = self.title or ""
        desc = strip_tags(self.description or "")
        self.search_text = f"{title}\n{desc}".strip()
        super().save(*args, **kwargs)

    content_panels = Page.content_panels + [
        FieldPanel("description"),
        FieldPanel("cat_image"),
        FieldPanel("order"),
    ]

    parent_page_types = ["docscanner_app.GuideIndexPage"]
    subpage_types = ["docscanner_app.GuidePage"]

    api_fields = [
        APIField("title"),
        APIField("slug"),
        APIField("seo_title"),
        APIField("search_description"),
        APIField("description"),
        APIField(
            "cat_image_rendition",
            serializer=ImageRenditionField("fill-800x450|jpegquality-70", source="cat_image"),
        ),
        APIField("order"),
    ]





class GuidePage(Page):
    # 🔹 Основное содержимое статьи
    body = StreamField(
        [
            # Текстовые блоки
            ("heading", blocks.CharBlock(form_classname="full title")),
            ("paragraph", blocks.RichTextBlock(features=[
                "h2", "h3", "h4", "h5",
                "bold", "italic", "link", "ol", "ul", "image", "blockquote"
            ])),

            # Медиа
            ("image", ImageChooserBlock()),
            ("youtube", EmbedBlock(help_text="Вставь YouTube ссылку")),

            # Код
            ("code", blocks.TextBlock(help_text="Вставь кодовый блок")),

            # Цитата
            ("quote", blocks.BlockQuoteBlock()),

            # Таблица
            ("table", blocks.StructBlock([
                ("caption", blocks.CharBlock(required=False)),
                ("data", blocks.StreamBlock([
                    ("row", blocks.ListBlock(blocks.CharBlock())),
                ])),
            ])),

            # Разделитель
            ("divider", blocks.StaticBlock(label="Space line")),

        ],
        use_json_field=True,
        blank=True,
    )

    # 🔹 Изображение и автор
    main_image = models.ForeignKey(
        "wagtailimages.Image",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    author_name = models.CharField(max_length=100, blank=True)
    last_updated = models.DateTimeField(auto_now=True)

    search_text = models.TextField(blank=True, default="")

    def save(self, *args, **kwargs):
        title = self.title or ""
        body_txt = _body_to_text(self.body)
        self.search_text = f"{title}\n{body_txt}".strip()
        super().save(*args, **kwargs)

    # 🔹 Панели Wagtail Admin
    content_panels = Page.content_panels + [
        FieldPanel("body"),
        FieldPanel("main_image"),
        FieldPanel("author_name"),
    ]

    # 🔹 Структура Wagtail
    parent_page_types = ["docscanner_app.GuideCategoryPage"]
    subpage_types = []

    # 🔹 Поля, доступные в API
    api_fields = [
        APIField("id"),
        APIField("title"),
        APIField("slug"),
        APIField("content_type"),
        APIField("live"),
        APIField("seo_title"),
        APIField("search_description"),
        APIField("first_published_at"),
        APIField("last_published_at"),
        APIField("body"),
        APIField("main_image"),
        APIField("author_name"),
    ]





def mobile_document_upload_to(instance, filename: str) -> str:
    """
    Храним mobile-файлы в такой же структуре, как web:
    uploads/<email_hash>/<uuid>_mob.<ext>

    - email_hash = первые 16 символов sha256(email)
    - uuid гарантирует уникальность, никаких конфликтов в inbox
    - суффикс _mob чисто для отладки (видно, что это mobile-источник)
    """
    # email юзера (на всякий случай lower + fallback на пустую строку)
    email = (getattr(instance.user, "email", "") or "").lower()
    email_hash = hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]

    # расширение из исходного файла (если вдруг нет — считаем, что pdf)
    base, ext = os.path.splitext(filename)
    ext = ext or ".pdf"

    # уникальное имя, отличимое от web-аплоада по суффиксу _mob
    unique_name = f"{uuid.uuid4().hex}_mob{ext}"

    # кладём в ту же базовую папку, что и ScannedDocument: "uploads/<email_hash>/..."
    return os.path.join("uploads", email_hash, unique_name)



class MobileAccessKey(models.Model):
    """
    Отдельный мобильный ключ для конкретного отправителя (email/label).
    Ключ в БД хранится только как SHA256-хэш + последние 4 символа.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mobile_access_keys",
    )

    key_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="SHA256 hešas nuo pilno mobilio rakto",
    )

    key_last4 = models.CharField(
        max_length=4,
        db_index=True,
        help_text="Paskutiniai 4 rakto simboliai (rodymui nustatymuose)",
    )

    sender_email = models.EmailField()
    label = models.CharField(max_length=100, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        status = "active" if self.is_active else "revoked"
        return f"{self.sender_email} ({self.label or 'no label'}) [{status}]"

    @staticmethod
    def generate_raw_key() -> str:
        return secrets.token_urlsafe(32)

    @staticmethod
    def make_hash(raw_key: str) -> str:
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    @classmethod
    def create_for_user(cls, user, sender_email: str, label: str | None = None):
        raw_key = cls.generate_raw_key()
        key_hash = cls.make_hash(raw_key)
        obj = cls.objects.create(
            user=user,
            key_hash=key_hash,
            key_last4=raw_key[-4:],
            sender_email=sender_email,
            label=label or "",
        )
        return obj, raw_key

    def revoke(self):
        if self.is_active:
            self.is_active = False
            self.revoked_at = timezone.now()
            self.save(update_fields=["is_active", "revoked_at"])


#DLIA GOOGLE DRIVE I DROPBOX
# ──────────────────────────────────────────────
# Cloud Integration
# ──────────────────────────────────────────────

class CloudConnection(models.Model):
    """OAuth подключение к Google Drive / Dropbox."""
    PROVIDER_CHOICES = [
        ("google_drive", "Google Drive"),
        ("dropbox", "Dropbox"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cloud_connections",
    )
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, db_index=True)

    access_token = models.TextField()
    refresh_token = models.TextField(blank=True, null=True)
    token_expires_at = models.DateTimeField(blank=True, null=True)

    dropbox_cursor = models.TextField(blank=True, null=True)
    gdrive_channel_id = models.CharField(max_length=255, blank=True, null=True)
    gdrive_channel_expiration = models.DateTimeField(blank=True, null=True)

    account_email = models.EmailField(blank=True, null=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_synced_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        unique_together = [("user", "provider")]

    def __str__(self):
        return f"{self.user.email} — {self.get_provider_display()}"

    @property
    def is_token_expired(self):
        if not self.token_expires_at:
            return False
        from django.utils import timezone
        now = timezone.now()
        expires = self.token_expires_at
        # Если одно naive, другое aware — приводим к aware
        if expires.tzinfo is None:
            from datetime import timezone as dt_tz
            expires = expires.replace(tzinfo=dt_tz.utc)
        return now >= expires


class CloudClient(models.Model):
    """Kliento (firmos) įrašas. UAB Senukai → UAB_Senukai_DokSkenas"""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cloud_clients",
    )
    name = models.CharField("Kliento pavadinimas", max_length=255)
    folder_name = models.CharField("Aplanko pavadinimas", max_length=255)
    company_code = models.CharField("Įmonės kodas", max_length=50, blank=True, null=True)

    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = [("user", "folder_name")]

    def __str__(self):
        return f"{self.name} ({self.folder_name})"

    def save(self, *args, **kwargs):
        if not self.folder_name:
            self.folder_name = self.generate_folder_name(self.name)
        super().save(*args, **kwargs)

    @staticmethod
    def generate_folder_name(client_name):
        safe = "".join(
            c if c.isalnum() or c in (" ", "-", "_") else ""
            for c in client_name
        )
        safe = safe.strip().replace(" ", "_")
        while "__" in safe:
            safe = safe.replace("__", "_")
        return f"{safe}_DokSkenas"


class CloudClientFolder(models.Model):
    """Папка клиента в конкретном облачном провайдере."""
    cloud_client = models.ForeignKey(
        CloudClient, on_delete=models.CASCADE, related_name="cloud_folders",
    )
    connection = models.ForeignKey(
        CloudConnection, on_delete=models.CASCADE, related_name="client_folders",
    )
    remote_folder_id = models.CharField(max_length=512)

    is_shared = models.BooleanField(default=False)
    shared_with_emails = models.JSONField(default=list, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_polled_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        unique_together = [("cloud_client", "connection")]

    def __str__(self):
        return f"{self.cloud_client.name} @ {self.connection.get_provider_display()}"






#XRANIM FAILY IZ EMAIL, MOB, GOOGLE DRIVE, DROPBOX (pokazyvajem v is-klientu)
class MobileInboxDocument(models.Model):
    """
    Чистая таблица ИМЕННО для файлов из mobile app.

    Тут просто лежат PDF, пока пользователь в вебе не решит:
    'перенести эти документы в suvestinė'.
    Никаких статусов не нужно — 'необработанные' = все записи,
    у которых processed_document IS NULL.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mobile_inbox_documents",
    )

    access_key = models.ForeignKey(
        MobileAccessKey,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
        help_text="Конкретный моб. ключ, через который пришёл файл",
    )

    uploaded_file = models.FileField(upload_to=mobile_document_upload_to)
    original_filename = models.CharField(max_length=255)
    size_bytes = models.PositiveBigIntegerField(default=0)
    page_count = models.PositiveIntegerField(null=True, blank=True)

    sender_email = models.EmailField(
        null=True,
        blank=True,
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    processed_document = models.ForeignKey(
        "ScannedDocument",    
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_mobile_documents",
    )

    processed_at = models.DateTimeField(null=True, blank=True)

    # 🔹 новые реальные поля
    is_processed = models.BooleanField(
        default=False,
        db_index=True,
    )

    preview_url = models.URLField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Pilnas URL, kurį WEB gali naudoti peržiūrai (PDF/preview)",
    )

    source = models.CharField(
        max_length=20,
        choices=[("mob", "Mob. programėlė"), ("email", "El. paštas")],
        default="mob",
        db_index=True,
    )
    sender_subject = models.CharField(
        max_length=500,
        blank=True,
        default="",
    )    
    cloud_client = models.ForeignKey(
        "CloudClient",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="inbox_documents",
    )

    remote_file_id = models.CharField(
        max_length=512, blank=True, null=True,
        help_text="Failo ID debesyje (reikalingas pervadinimui)",
    )

    rename_status = models.CharField(
        max_length=10,
        choices=[("na","N/A"),("pending","Laukia"),("done","Atlikta"),("failed","Klaida")],
        default="na",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"MobileInboxDocument(id={self.id}, user={self.user_id}, filename={self.original_filename})"







class APIExportLog(models.Model):
    class ExportStatus(models.TextChoices):
        SUCCESS = 'success', 'Success'
        PARTIAL_SUCCESS = 'partial_success', 'Partial Success'
        ERROR = 'error', 'Error'

    class ExportProgram(models.TextChoices):
        OPTIMUM = 'optimum', 'Optimum'
        DINETA = 'dineta', 'Dineta'
        RIVILE_GAMA_API = 'rivile_gama_api', 'Rivile GAMA API'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='api_export_logs'
    )
    document_id = models.IntegerField(
        "Dokumento ID",
        db_index=True,
        help_text="ScannedDocument arba Invoice ID",
    )
    program = models.CharField(max_length=50, choices=ExportProgram.choices)
    status = models.CharField(max_length=20, choices=ExportStatus.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    message = models.CharField(max_length=255, blank=True, default="")

    invoice_type = models.CharField(max_length=30)
    invoice_status = models.CharField(max_length=20)
    invoice_result = models.IntegerField(null=True, blank=True)
    invoice_error = models.TextField(blank=True, default='')

    full_response = models.TextField(blank=True, default='')
    partner_status = models.CharField(max_length=10, blank=True, default='')
    partner_error = models.TextField(blank=True, default='')
    partner_message = models.CharField(max_length=255, blank=True, default="")

    session = models.ForeignKey(
        'ExportSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='export_logs'
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'program', '-created_at']),
        ]

    def __str__(self):
        return f"{self.document} → {self.program} [{self.status}]"


class APIExportArticleLog(models.Model):
    export_log = models.ForeignKey(
        APIExportLog,
        on_delete=models.CASCADE,
        related_name='article_logs'
    )
    article_name = models.CharField(max_length=255)
    article_code = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=10)
    result = models.IntegerField(null=True, blank=True)
    error = models.TextField(blank=True, default='')
    message = models.CharField(max_length=255, blank=True, default="")

    full_response = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.article_name} ({self.article_code}) [{self.status}]"
    

class ExportSession(models.Model):
    class Stage(models.TextChoices):
        QUEUED = 'queued', 'Queued'
        PROCESSING = 'processing', 'Processing'
        DONE = 'done', 'Done'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='export_sessions'
    )
    program = models.CharField(
        max_length=50,
        choices=APIExportLog.ExportProgram.choices
    )
    stage = models.CharField(
        max_length=20,
        choices=Stage.choices,
        default=Stage.QUEUED
    )

    # Документы для экспорта
    documents = models.ManyToManyField(
        'ScannedDocument',
        related_name='export_sessions'
    )

    invoice_documents = models.ManyToManyField(
        "Invoice",
        blank=True,
        related_name="inv_export_sessions",
    )

    # Счётчики
    total_documents = models.IntegerField(default=0)
    processed_documents = models.IntegerField(default=0)
    success_count = models.IntegerField(default=0)
    partial_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)

    # Время
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    # Celery task id — для возможной отмены
    task_id = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'stage', '-created_at']),
        ]

    def __str__(self):
        return f"ExportSession #{self.pk} {self.program} [{self.stage}]"

    @property
    def total_time_seconds(self):
        if self.started_at and self.finished_at:
            return (self.finished_at - self.started_at).total_seconds()
        return None
    







#NEW - saskaitu israsymas
"""
DokSkenas — Sąskaitų išrašymas (Invoice Issuing)
Django models for creating, sending, and managing outgoing invoices.

Модели:
  1. Counterparty     — справочник контрагентов (buyer/seller)
  2. InvoiceSettings  — настройки пользователя (серия, нумерация, логотип, дефолты)
  3. Invoice          — счёт (išankstinė / PVM SF / SF / kreditinė)
  4. InvoiceLineItem  — строки счёта
"""



# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────

def invoice_logo_path(instance, filename):
    return f"invoicing/logos/{instance.user.id}/{filename}"


def invoice_pdf_path(instance, filename):
    return f"invoicing/pdfs/{instance.user.id}/{filename}"


# ────────────────────────────────────────────────────────────
# 1. Counterparty — справочник контрагентов
# ────────────────────────────────────────────────────────────

class Counterparty(models.Model):
    """
    Справочник контрагентов пользователя.
    Используется для автозаполнения buyer/seller при создании счетов.
    Данные копируются в Invoice при создании (денормализация).
    """

    ROLE_CHOICES = [
        ("buyer", "Pirkėjas"),
        ("seller", "Pardavėjas"),
        ("both", "Abu"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="counterparties",
    )

    # Основные реквизиты
    name = models.CharField("Pavadinimas", max_length=255)
    name_normalized = models.CharField(max_length=255, blank=True, default="")
    company_code = models.CharField("Įmonės kodas", max_length=100, blank=True, default="")
    vat_code = models.CharField("PVM kodas", max_length=50, blank=True, default="")
    address = models.CharField("Adresas", max_length=255, blank=True, default="")
    country = models.CharField("Šalis", max_length=50, blank=True, default="")
    country_iso = models.CharField("Šalies ISO", max_length=10, blank=True, default="")
    phone = models.CharField("Telefonas", max_length=50, blank=True, default="")
    email = models.EmailField("El. paštas", blank=True, default="")

    # Банковские реквизиты
    bank_name = models.CharField("Banko pavadinimas", max_length=255, blank=True, default="")
    iban = models.CharField("IBAN", max_length=255, blank=True, default="")
    swift = models.CharField("SWIFT/BIC", max_length=50, blank=True, default="")

    # Мета
    is_person = models.BooleanField("Fizinis asmuo", default=False)
    default_role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="buyer")
    extra_info = models.TextField(blank=True, default='')  # или notes
    delivery_address = models.TextField(blank=True, default='')

    # ID в бухгалтерской программе (для экспорта)
    id_programoje = models.CharField("ID programoje", max_length=64, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Counterparty"
        verbose_name_plural = "Counterparties"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["user", "name_normalized"], name="idx_cp_user_name_norm"),
            models.Index(fields=["user", "company_code"], name="idx_cp_user_code"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "company_code"],
                condition=~models.Q(company_code=""),
                name="unique_user_company_code",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.company_code or '—'})"

    def save(self, *args, **kwargs):
        if self.name:
            self.name_normalized = self.name.strip().upper()
        super().save(*args, **kwargs)


# ────────────────────────────────────────────────────────────
# 2. InvoiceSettings — настройки пользователя
# ────────────────────────────────────────────────────────────

class InvoiceSettings(models.Model):
    """
    Настройки выставления счетов: данные продавца, серии, нумерация, дефолты.
    Один объект на пользователя.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoice_settings",
    )

    # Данные продавца (по умолчанию подставляются в каждый новый счёт)
    seller_name = models.CharField("Pardavėjo pavadinimas", max_length=255, blank=True, default="")
    seller_company_code = models.CharField("Įmonės kodas", max_length=100, blank=True, default="")
    seller_vat_code = models.CharField("PVM kodas", max_length=50, blank=True, default="")
    seller_address = models.CharField("Adresas", max_length=255, blank=True, default="")
    seller_phone = models.CharField("Telefonas", max_length=50, blank=True, default="")
    seller_email = models.EmailField("El. paštas", blank=True, default="")
    seller_bank_name = models.CharField("Banko pavadinimas", max_length=255, blank=True, default="")
    seller_iban = models.CharField("IBAN", max_length=255, blank=True, default="")
    seller_swift = models.CharField("SWIFT/BIC", max_length=50, blank=True, default="")

    # Логотип
    logo = models.FileField("Logotipas", upload_to=invoice_logo_path, blank=True, null=True)


    # Дефолты
    default_currency = models.CharField("Numatyta valiuta", max_length=10, default="EUR")
    default_vat_percent = models.DecimalField(
        "Numatytas PVM %", max_digits=5, decimal_places=2, default=21
    )
    default_payment_days = models.PositiveIntegerField("Mokėjimo terminas (dienomis)", default=14)

    reminder_enabled = models.BooleanField(default=False)
    reminder_days_after_due = models.PositiveIntegerField(default=3)
    reminder_interval_days = models.PositiveIntegerField(default=7)
    reminder_max_count = models.PositiveSmallIntegerField(default=3)

    invoice_reminder_days = models.JSONField(
        "Priminimų dienos",
        default=list,  # будем ставить [-7, -1, 3] в save()
        blank=True,
        help_text="Dienos iki/po termino: neigiamos = prieš, teigiamos = po. Pvz: [-7, -1, 3]",
    )   

    # Email
    email_subject_template = models.CharField(
        max_length=255,
        blank=True,
        default="Sąskaita faktūra Nr. {series}{number}",
    )
    email_body_template = models.TextField(
        blank=True,
        default=(
            "Laba diena,\n\n"
            "Siunčiame sąskaitą faktūrą Nr. {series}{number}.\n"
            "Mokėti iki: {due_date}.\n"
            "Suma: {total} {currency}.\n\n"
            "Pagarbiai,\n{seller_name}"
        ),
    )

    class Meta:
        verbose_name = "Invoice Settings"
        verbose_name_plural = "Invoice Settings"

    def __str__(self):
        return f"Invoice settings for {self.user}"

    def save(self, *args, **kwargs):
        if not self.invoice_reminder_days:
            self.invoice_reminder_days = [-7, -1, 3]
        super().save(*args, **kwargs)

# ────────────────────────────────────────────────────────────
# 3. Invoice — счёт
# ────────────────────────────────────────────────────────────

class Invoice(models.Model):
    """
    Исходящий счёт.

    Типы:
      - isankstine    — Išankstinė sąskaita faktūra (проформа, не идёт в i.SAF)
      - pvm_saskaita  — PVM sąskaita faktūra (бухгалтерский документ)
      - saskaita      — Sąskaita faktūra (без PVM)
      - kreditine     — Kreditinė sąskaita faktūra

    Flow:
      draft → issued → sent → paid
                         ↘ overdue (auto)
             → cancelled
    """

    INVOICE_TYPE_CHOICES = [
        ("isankstine", "Išankstinė sąskaita faktūra"),
        ("pvm_saskaita", "PVM sąskaita faktūra"),
        ("saskaita", "Sąskaita faktūra"),
        ("kreditine", "Kreditinė sąskaita faktūra"),
    ]

    STATUS_CHOICES = [
        ("draft", "Juodraštis"),
        ("issued", "Išrašyta"),
        ("sent", "Išsiųsta"),
        ("partially_paid", "Dalinai apmokėta"),
        ("paid", "Apmokėta"),
        ("cancelled", "Atšaukta"),
    ]

    PVM_TYPE_CHOICES = [
        ("taikoma", "Taikoma"),
        ("netaikoma", "Netaikoma"),
    ]

    # ---- Core ----
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    invoice_type = models.CharField(max_length=20, choices=INVOICE_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")

    # ---- Связь išankstinė → PVM SF ----
    source_invoice = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="derived_invoices",
        help_text="Išankstinė, iš kurios sukurta ši PVM SF",
    )

    # ---- Нумерация (присваивается при issued) ----
    document_series = models.CharField("Serija", max_length=50, blank=True, default="")
    document_number = models.CharField("Numeris", max_length=100, blank=True, default="")

    # ---- Даты ----
    invoice_date = models.DateField("Sąskaitos data", null=True, blank=True)
    due_date = models.DateField("Mokėti iki", null=True, blank=True)
    operation_date = models.DateField("Operacijos data", null=True, blank=True)

    # ---- Seller (денормализованные, копируются из settings/counterparty) ----
    seller_counterparty = models.ForeignKey(
        Counterparty,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="invoices_as_seller",
    )
    seller_id_programoje = models.CharField(max_length=64, blank=True, default="")
    seller_name = models.CharField(max_length=255, blank=True, default="")
    seller_name_normalized = models.CharField(max_length=255, blank=True, default="")
    seller_id = models.CharField("Įmonės kodas", max_length=100, blank=True, default="")
    seller_vat_code = models.CharField(max_length=50, blank=True, default="")
    seller_address = models.CharField(max_length=255, blank=True, default="")
    seller_country = models.CharField(max_length=50, blank=True, default="")
    seller_country_iso = models.CharField(max_length=10, blank=True, default="")
    seller_phone = models.CharField(max_length=50, blank=True, default="")
    seller_email = models.EmailField(blank=True, default="")
    seller_bank_name = models.CharField(max_length=255, blank=True, default="")
    seller_iban = models.CharField(max_length=255, blank=True, default="")
    seller_swift = models.CharField(max_length=50, blank=True, default="")
    seller_is_person = models.BooleanField(null=True, blank=True)
    seller_vat_val = models.CharField(max_length=32, blank=True, default="")
    seller_extra_info = models.TextField(blank=True, default="")

    # ---- Buyer (денормализованные) ----
    buyer_counterparty = models.ForeignKey(
        Counterparty,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="invoices_as_buyer",
    )
    buyer_id_programoje = models.CharField(max_length=64, blank=True, default="")
    buyer_name = models.CharField(max_length=255, blank=True, default="")
    buyer_name_normalized = models.CharField(max_length=255, blank=True, default="")
    buyer_id = models.CharField("Įmonės kodas", max_length=100, blank=True, default="")
    buyer_vat_code = models.CharField(max_length=50, blank=True, default="")
    buyer_address = models.CharField(max_length=255, blank=True, default="")
    buyer_country = models.CharField(max_length=50, blank=True, default="")
    buyer_country_iso = models.CharField(max_length=10, blank=True, default="")
    buyer_phone = models.CharField(max_length=50, blank=True, default="")
    buyer_email = models.EmailField(blank=True, default="")
    buyer_bank_name = models.CharField(max_length=255, blank=True, default="")
    buyer_iban = models.CharField(max_length=255, blank=True, default="")
    buyer_swift = models.CharField(max_length=50, blank=True, default="")
    buyer_is_person = models.BooleanField(null=True, blank=True)
    buyer_vat_val = models.CharField(max_length=32, blank=True, default="")
    buyer_extra_info = models.TextField(blank=True, default="")
    buyer_delivery_address = models.TextField(blank=True, default="")

    # ---- Суммы ----
    currency = models.CharField(max_length=20, default="EUR")
    pvm_tipas = models.CharField(max_length=20, choices=PVM_TYPE_CHOICES, default="taikoma")
    vat_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, default=21)
    amount_wo_vat = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    vat_amount = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    amount_with_vat = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    invoice_discount_with_vat = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    invoice_discount_wo_vat = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    delivery_fee = models.DecimalField("Pristatymo mokestis", max_digits=12, decimal_places=4, null=True, blank=True)
    separate_vat = models.BooleanField(null=True, blank=True)
    doc_96_str = models.BooleanField(null=True, blank=True)

    # ---- Прочие поля (совместимые с ScannedDocument для экспортеров) ----
    document_type = models.CharField(max_length=100, blank=True, default="")
    document_type_code = models.CharField(max_length=50, blank=True, default="")
    order_number = models.CharField(max_length=100, blank=True, default="")
    pirkimas_pardavimas = models.CharField(
        max_length=20,
        choices=[("pirkimas", "Pirkimas"), ("pardavimas", "Pardavimas")],
        default="pardavimas",
    )
    note = models.TextField(blank=True, default="")
    report_to_isaf = models.BooleanField(null=True, blank=True)

    # ---- Autocomplete поля (идентичны ScannedDocument для экспорта) ----
    prekes_kodas = models.CharField("Prekės kodas", max_length=128, blank=True, default="")
    prekes_barkodas = models.CharField("Prekės barkodas", max_length=128, blank=True, default="")
    prekes_pavadinimas = models.CharField("Prekės pavadinimas", max_length=255, blank=True, default="")
    prekes_tipas = models.CharField("Prekės tipas", max_length=128, blank=True, default="")
    preke_paslauga = models.CharField("Preke_paslauga", max_length=12, blank=True, default="")

    # ---- PDF и отправка ----
    pdf_file = models.FileField(
        "PDF failas",
        upload_to=invoice_pdf_path,
        blank=True,
        null=True,
    )
    sent_at = models.DateTimeField("Išsiųsta", null=True, blank=True)
    sent_to_email = models.EmailField("Siųsta kam", blank=True, default="")
    paid_at = models.DateTimeField("Apmokėta", null=True, blank=True)
    # ---- Payment tracking (денормализованные) ----
    paid_amount = models.DecimalField(
        "Apmokėta suma",
        max_digits=12,
        decimal_places=4,
        default=0,
        null=True,
        blank=True,
    )
    last_payment_date = models.DateField(
        "Paskutinio mokėjimo data",
        null=True,
        blank=True,
    )
    cancelled_at = models.DateTimeField("Atšaukta", null=True, blank=True)
    public_link_enabled = models.BooleanField(
        "Viešas peržiūros nuoroda",
        default=True,
        help_text="Ar pirkėjas gali peržiūrėti sąskaitą per uuid nuorodą",
    )

    # ---- Экспорт в бухгалтерские программы ----
    optimum_api_status = models.CharField(max_length=20, blank=True, default="")
    optimum_last_try_date = models.DateTimeField(null=True, blank=True)
    dineta_api_status = models.CharField(max_length=20, blank=True, default="")
    dineta_last_try_date = models.DateTimeField(null=True, blank=True)
    rivile_api_status = models.CharField(
        "Rivile API statusas",
        max_length=20,
        blank=True,
        null=True,
        help_text="success / partial_success / error",
    )
    rivile_api_last_try = models.DateTimeField(
        "Rivile API paskutinis bandymas",
        null=True,
        blank=True,
    )
    rivile_api_kodas_po = models.CharField(
        "Rivile operacijos numeris (I06_KODAS_PO)",
        max_length=20,
        blank=True,
        help_text="Grąžintas Rivile GAMA operacijos numeris",
    )

    exported = models.BooleanField("Eksportuota", default=False)
    exported_at = models.DateTimeField("Eksportavimo data", null=True, blank=True)
    pvm_kodas = models.CharField("PVM kodas", max_length=128, blank=True, default="")
    issued_by = models.CharField(max_length=255, blank=True, default="")
    received_by = models.CharField(max_length=255, blank=True, default="")
    recurring_invoice = models.ForeignKey("RecurringInvoice", null=True, blank=True, on_delete=models.SET_NULL, related_name="generated_invoices")
    auto_create_sf_on_paid = models.BooleanField(default=False)
    auto_sf_series = models.CharField(max_length=50, blank=True, default="")
    auto_sf_send = models.BooleanField(default=False)
    send_payment_reminders = models.BooleanField(default=False)
    payment_link_url = models.URLField(
        "Mokėjimo nuoroda",
        max_length=1024,
        blank=True,
        default="",
    )
    payment_link_provider = models.CharField(
        "Mokėjimo nuorodų teikėjas",
        max_length=30,
        blank=True,
        default="",
        help_text="montonio / paysera / seb_paylink"
    )
    payment_link_provider_id = models.CharField(
        "Teikėjo mokėjimo ID",
        max_length=255,
        blank=True,
        default="",
        help_text="UUID/ID from provider for webhook matching"
    )
    payment_link_created_at = models.DateTimeField(
        null=True, blank=True,
    )
    email_sent_count = models.PositiveSmallIntegerField(default=0)
    email_last_status = models.CharField(max_length=20, blank=True, default="")  # sent/opened/failed

    # ---- Timestamps ----
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"], name="idx_inv_user_created"),
            models.Index(fields=["user", "status", "-created_at"], name="idx_inv_user_status"),
            models.Index(fields=["user", "invoice_type", "-created_at"], name="idx_inv_user_type"),
            models.Index(fields=["uuid"], name="idx_inv_uuid"),
            models.Index(fields=["user", "buyer_name_normalized"], name="idx_inv_buyer_norm"),
            models.Index(fields=["due_date"], name="idx_inv_due_date"),
            models.Index(fields=["source_invoice"], name="idx_inv_source"),
        ]

    def __str__(self):
        return f"{self.get_invoice_type_display()} {self.document_series}{self.document_number} ({self.user})"

    def recalc_payment_status(self):
        from decimal import Decimal
        from django.db.models import Max, Sum
        from django.utils import timezone

        confirmed_statuses = ["auto", "confirmed", "manual"]

        agg = (
            self.payment_allocations
            .filter(status__in=confirmed_statuses)
            .aggregate(
                total=Sum("amount"),
                last_date=Max("payment_date"),
            )
        )

        total_paid = agg["total"] or Decimal("0")
        last_date = agg["last_date"]

        self.paid_amount = total_paid
        self.last_payment_date = last_date

        invoice_total = self.amount_with_vat or Decimal("0")
        tolerance = Decimal("0.009")

        if invoice_total > 0 and total_paid >= invoice_total - tolerance:
            if self.status not in ("cancelled",):
                self.status = "paid"
                if not self.paid_at:
                    self.paid_at = timezone.now()
        elif total_paid > Decimal("0"):
            if self.status not in ("cancelled", "paid"):
                self.status = "partially_paid"
        # Если total_paid == 0 и status был partially_paid — вернуть sent/issued
        elif total_paid == Decimal("0") and self.status == "partially_paid":
            self.status = "sent" if self.sent_at else "issued"

        self.save(update_fields=[
            "paid_amount", "last_payment_date",
            "status", "paid_at", "updated_at",
        ])

    @property
    def full_number(self):
        """SF001, ISF002 и т.д."""
        return f"{self.document_series}{self.document_number}"
    
    @property
    def has_proposed_payments(self):
        return self.payment_allocations.filter(status="proposed").exists()

    @property
    def is_editable(self):
        return self.status == "draft"

    @property
    def can_be_sent(self):
        return self.status in ("issued", "sent")

    @property
    def can_create_pvm_sf(self):
        """Можно создать SF из išankstinė (любой статус кроме draft/cancelled)."""
        return (
            self.invoice_type == "isankstine"
            and self.status in ("issued", "sent", "paid")
            and not self.derived_invoices.filter(
                invoice_type__in=["pvm_saskaita", "saskaita"]
            ).exists()
        )

    @property
    def public_url(self):
        """URL для просмотра покупателем без логина."""
        if self.public_link_enabled:
            return f"/sf/{self.uuid}"
        return None
    
    # ---- PVM auto-assign ----
    def assign_pvm_codes(self):
        from .validators.vat_klas import auto_select_pvm_code
        
        user = self.user
        seller_country_iso = getattr(user, "company_country_iso", None) or "LT"
        seller_has_vat_code = bool(getattr(user, "vat_code", None))
        buyer_country_iso = self.buyer_country_iso or None
        buyer_has_vat_code = bool(self.buyer_vat_code)

        line_items = list(self.line_items.all())
        pvm_codes = set()

        for li in line_items:
            code = auto_select_pvm_code(
                pirkimas_pardavimas="pardavimas",
                buyer_country_iso=buyer_country_iso,
                seller_country_iso=seller_country_iso,
                preke_paslauga=li.preke_paslauga or None,
                vat_percent=(
                    float(li.vat_percent)
                    if li.vat_percent is not None
                    else None
                ),
                separate_vat=False,
                buyer_has_vat_code=buyer_has_vat_code,
                seller_has_vat_code=seller_has_vat_code,
                doc_96_str=bool(self.doc_96_str),
            )
            li.pvm_kodas = code or ""
            pvm_codes.add(code)

        if line_items:
            InvoiceLineItem.objects.bulk_update(line_items, ["pvm_kodas"])

        pvm_codes.discard(None)
        pvm_codes.discard("")
        if len(pvm_codes) == 1:
            self.pvm_kodas = pvm_codes.pop()
        elif len(pvm_codes) > 1:
            self.pvm_kodas = "Keli skirtingi PVM"
        else:
            self.pvm_kodas = ""


# ────────────────────────────────────────────────────────────
# 4. InvoiceLineItem — строки счёта
# ────────────────────────────────────────────────────────────

class InvoiceLineItem(models.Model):
    """
    Строка счёта. Поля идентичны LineItem для совместимости с экспортерами.
    """

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="line_items",
    )
    line_id = models.CharField(max_length=100, blank=True, default="")

    # ---- Продукт ----
    prekes_kodas = models.CharField("Prekės kodas", max_length=128, blank=True, default="")
    prekes_barkodas = models.CharField("Prekės barkodas", max_length=128, blank=True, default="")
    prekes_pavadinimas = models.CharField("Prekės pavadinimas", max_length=255, blank=True, default="")
    prekes_tipas = models.CharField("Prekės tipas", max_length=128, blank=True, default="")
    preke_paslauga = models.CharField("Preke_paslauga", max_length=12, blank=True, default="")

    # ---- Количество / цена / суммы ----
    unit = models.CharField("Mato vnt.", max_length=50, blank=True, default="vnt")
    quantity = models.DecimalField(max_digits=15, decimal_places=5, null=True, blank=True)
    price = models.DecimalField("Kaina", max_digits=12, decimal_places=4, null=True, blank=True)
    subtotal = models.DecimalField("Suma be PVM", max_digits=12, decimal_places=4, null=True, blank=True)
    vat = models.DecimalField("PVM suma", max_digits=12, decimal_places=4, null=True, blank=True)
    vat_percent = models.DecimalField("PVM %", max_digits=5, decimal_places=2, null=True, blank=True)
    total = models.DecimalField("Suma su PVM", max_digits=12, decimal_places=4, null=True, blank=True)

    discount_with_vat = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    discount_wo_vat = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)

    pvm_kodas = models.CharField("PVM kodas", max_length=128, blank=True, default="")

    # ---- Порядок ----
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["invoice"], name="idx_invline_invoice"),
        ]

    def __str__(self):
        return f"{self.prekes_pavadinimas or ''} ({self.prekes_kodas or ''}) x{self.quantity or ''}"



# ═══════════════════════════════════════════════════════════
# Matavimo vienetai
# ═══════════════════════════════════════════════════════════

# Дефолтные единицы, которые создаются для каждого нового пользователя
DEFAULT_UNITS = [
    # Top 5 pagal dažnumą
    ("vnt", "Vienetas", True),
    ("m", "Metras", False),
    ("pak", "Pakuotė", False),
    ("m3", "Kubinis metras", False),
    ("val", "Valanda", False),
    # Kiti — abėcėlės tvarka
    ("cm", "Centimetras", False),
    ("diena", "Diena", False),
    ("dėžė", "Dėžė", False),
    ("erdm", "Erdvinis metras", False),
    ("g", "Gramas", False),
    ("kg", "Kilogramas", False),
    ("km", "Kilometras", False),
    ("kompl", "Komplektas", False),
    ("l", "Litras", False),
    ("m2", "Kvadratinis metras", False),
    ("ml", "Mililitras", False),
    ("mėn", "Mėnuo", False),
    ("pora", "Pora", False),
    ("rul", "Rulonas", False),
    ("t", "Tona", False),
]


class MeasurementUnit(models.Model):
    """
    Единицы измерения. У каждого пользователя свой набор.
    При регистрации создаются дефолтные, потом можно менять.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="measurement_units",
    )
    code = models.CharField(max_length=20, help_text="Короткий код: vnt, kg, val...")
    name = models.CharField(max_length=100, blank=True, help_text="Полное название")
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    is_default = models.BooleanField(default=False, help_text="Numatytasis matavimo vienetas")


    class Meta:
        ordering = ["sort_order", "code"]
        unique_together = [("user", "code")]

    def __str__(self):
        return f"{self.code} ({self.name})"

    @classmethod
    def create_defaults_for_user(cls, user):
        if cls.objects.filter(user=user).exists():
            return
        objs = [
            cls(user=user, code=code, name=name, sort_order=i, is_default=is_def)
            for i, (code, name, is_def) in enumerate(DEFAULT_UNITS)
        ]
        cls.objects.bulk_create(objs, ignore_conflicts=True)

    @classmethod
    def ensure_only_one_default(cls, user, default_id):
        cls.objects.filter(
            user=user, is_default=True
        ).exclude(id=default_id).update(is_default=False)


# ═══════════════════════════════════════════════════════════
# Sąskaitų serijos
# ═══════════════════════════════════════════════════════════

INVOICE_TYPE_CHOICES = [
    ("isankstine", "Išankstinė SF"),
    ("pvm_saskaita", "PVM SF"),
    ("saskaita", "SF"),
    ("kreditine", "Kreditinė SF"),
]

#                       (invoice_type, prefix, is_default)
DEFAULT_SERIES = [
    ("isankstine", "ISF", True),
    ("pvm_saskaita", "SF", True),
    ("saskaita", "SA", True),
    ("kreditine", "KS", True),
]


class InvoiceSeries(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoice_series",
    )
    invoice_type = models.CharField(max_length=20, choices=INVOICE_TYPE_CHOICES)
    prefix = models.CharField(max_length=20)
    next_number = models.PositiveIntegerField(default=1)
    padding = models.PositiveSmallIntegerField(default=3)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["invoice_type", "-is_default", "prefix"]
        unique_together = [("user", "prefix")]
        verbose_name_plural = "Invoice series"

    def __str__(self):
        return f"{self.prefix} ({self.get_invoice_type_display()}) next={self.next_number}"

    def format_number(self, number=None):
        n = number or self.next_number
        return str(n).zfill(self.padding)

    def preview(self):
        return f"{self.prefix}-{self.format_number()}"

    def allocate_number(self):
        n = self.next_number
        self.next_number = n + 1
        self.save(update_fields=["next_number"])
        return self.prefix, self.format_number(n), n

    @classmethod
    def get_default_for_type(cls, user, invoice_type):
        s = cls.objects.filter(
            user=user, invoice_type=invoice_type, is_active=True, is_default=True
        ).first()
        if not s:
            s = cls.objects.filter(
                user=user, invoice_type=invoice_type, is_active=True
            ).first()
        return s

    @classmethod
    def ensure_only_one_default(cls, user, invoice_type, default_id):
        cls.objects.filter(
            user=user, invoice_type=invoice_type, is_default=True
        ).exclude(id=default_id).update(is_default=False)

    @classmethod
    def create_defaults_for_user(cls, user):
        if cls.objects.filter(user=user).exists():
            return
        objs = [
            cls(
                user=user,
                invoice_type=inv_type,
                prefix=prefix,
                next_number=1,
                padding=3,
                is_default=is_def,
            )
            for inv_type, prefix, is_def in DEFAULT_SERIES
        ]
        cls.objects.bulk_create(objs, ignore_conflicts=True)



# ═══════════════════════════════════════════════════════════
# Prekes / paslaugos israsymui
# ═══════════════════════════════════════════════════════════

class Product(models.Model):
    """
    Справочник товаров/услуг пользователя.
    Поля максимально совместимы со ScannedDocument для единой логики экспорта.
    """

    TYPE_CHOICES = [
        ("preke", "Prekė"),
        ("paslauga", "Paslauga"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="products",
    )

    # ── Основные (совпадают с ScannedDocument) ──────────
    preke_paslauga = models.CharField(
        "Tipas",
        max_length=12,
        choices=TYPE_CHOICES,
        default="preke",
    )
    pavadinimas = models.CharField("Pavadinimas", max_length=255)
    kodas = models.CharField("Prekės kodas", max_length=128)
    barkodas = models.CharField("Barkodas", max_length=128, blank=True, default="")

    # FK на MeasurementUnit (mato vienetas)
    measurement_unit = models.ForeignKey(
        "MeasurementUnit",
        verbose_name="Mato vienetas",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )

    # ── Kaina ir PVM ────────────────────────────────────
    pardavimo_kaina = models.DecimalField(
        "Pardavimo kaina (be PVM)",
        max_digits=12,
        decimal_places=4,
        default=0,
    )
    pvm_procentas = models.PositiveSmallIntegerField(
        "PVM %",
        null=True,
        blank=True,
        validators=[MaxValueValidator(100)],
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Product"
        verbose_name_plural = "Products"
        ordering = ["pavadinimas"]
        indexes = [
            models.Index(fields=["user", "kodas"], name="idx_prod_user_kodas"),
            models.Index(fields=["user", "pavadinimas"], name="idx_prod_user_pav"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "kodas"],
                name="unique_user_product_kodas",
            ),
        ]

    def __str__(self):
        return f"{self.kodas} — {self.pavadinimas}"


# ═══════════════════════════════════════════════════════════
# Periodines saskaitos
# ═══════════════════════════════════════════════════════════

class RecurringInvoice(models.Model):
    """
    Шаблон периодической счёт-фактуры.

    Это НЕ сама счёт-фактура, а правило:
    - что создавать
    - когда создавать
    - отправлять ли автоматически
    """

    FREQUENCY_CHOICES = [
        ("daily", "Kasdien"),
        ("weekly", "Kas savaitę"),
        ("monthly", "Kas mėnesį"),
        ("quarterly", "Kas ketvirtį"),
        ("yearly", "Kas metus"),
    ]

    STATUS_CHOICES = [
        ("active", "Aktyvi"),
        ("paused", "Pristabdyta"),
        ("finished", "Baigta"),
        ("cancelled", "Atšaukta"),
    ]

    WEEKDAY_CHOICES = [
        (0, "Pirmadienis"),
        (1, "Antradienis"),
        (2, "Trečiadienis"),
        (3, "Ketvirtadienis"),
        (4, "Penktadienis"),
        (5, "Šeštadienis"),
        (6, "Sekmadienis"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recurring_invoices",
    )
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    # ---- Что создавать ----
    invoice_type = models.CharField(
        max_length=20,
        choices=Invoice.INVOICE_TYPE_CHOICES,
        default="pvm_saskaita",
    )
    document_series = models.CharField("Serija", max_length=50, blank=True, default="")
    currency = models.CharField(max_length=20, default="EUR")

    pvm_tipas = models.CharField(
        max_length=20,
        choices=Invoice.PVM_TYPE_CHOICES,
        default="taikoma",
    )
    vat_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        default=Decimal("21.00"),
    )

    note = models.TextField(blank=True, default="")
    order_number = models.CharField(max_length=100, blank=True, default="")
    public_link_enabled = models.BooleanField(default=True)

    # ---- Даты и расписание ----
    start_date = models.DateField("Начать с")
    end_date = models.DateField("Остановить после", null=True, blank=True)

    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES)
    interval = models.PositiveIntegerField(default=1)

    weekday = models.PositiveSmallIntegerField(
        choices=WEEKDAY_CHOICES,
        null=True,
        blank=True,
        help_text="Используется для weekly",
    )
    day_of_month = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Используется для monthly/quarterly/yearly",
    )

    issue_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Во сколько создавать/отправлять",
    )
    timezone_name = models.CharField(max_length=64, default="Europe/Vilnius")

    payment_term_days = models.PositiveIntegerField(default=0)

    # ---- Автодействия ----
    auto_issue = models.BooleanField(default=True)
    auto_send = models.BooleanField(default=True)
    send_to_email = models.EmailField(blank=True, default="")

    # ---- Seller snapshot ----
    seller_counterparty = models.ForeignKey(
        Counterparty,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_invoices_as_seller",
    )
    seller_name = models.CharField(max_length=255, blank=True, default="")
    seller_id = models.CharField("Įmonės kodas", max_length=100, blank=True, default="")
    seller_vat_code = models.CharField(max_length=50, blank=True, default="")
    seller_address = models.CharField(max_length=255, blank=True, default="")
    seller_country = models.CharField(max_length=50, blank=True, default="")
    seller_country_iso = models.CharField(max_length=10, blank=True, default="")
    seller_phone = models.CharField(max_length=50, blank=True, default="")
    seller_email = models.EmailField(blank=True, default="")
    seller_bank_name = models.CharField(max_length=255, blank=True, default="")
    seller_iban = models.CharField(max_length=255, blank=True, default="")
    seller_swift = models.CharField(max_length=50, blank=True, default="")
    seller_is_person = models.BooleanField(null=True, blank=True)
    seller_extra_info = models.TextField(blank=True, default="")

    # ---- Buyer snapshot ----
    buyer_counterparty = models.ForeignKey(
        Counterparty,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_invoices_as_buyer",
    )
    buyer_name = models.CharField(max_length=255, blank=True, default="")
    buyer_id = models.CharField("Įmonės kodas", max_length=100, blank=True, default="")
    buyer_vat_code = models.CharField(max_length=50, blank=True, default="")
    buyer_address = models.CharField(max_length=255, blank=True, default="")
    buyer_country = models.CharField(max_length=50, blank=True, default="")
    buyer_country_iso = models.CharField(max_length=10, blank=True, default="")
    buyer_phone = models.CharField(max_length=50, blank=True, default="")
    buyer_email = models.EmailField(blank=True, default="")
    buyer_bank_name = models.CharField(max_length=255, blank=True, default="")
    buyer_iban = models.CharField(max_length=255, blank=True, default="")
    buyer_swift = models.CharField(max_length=50, blank=True, default="")
    buyer_is_person = models.BooleanField(null=True, blank=True)
    buyer_extra_info = models.TextField(blank=True, default="")
    buyer_delivery_address = models.TextField(blank=True, default="")

    # ---- Подписи ----
    issued_by = models.CharField(max_length=255, blank=True, default="")
    received_by = models.CharField(max_length=255, blank=True, default="")

    # ---- Служебные поля schedulers ----
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_invoice = models.ForeignKey(
        Invoice,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="generated_from_recurring_templates",
    )
    generation_count = models.PositiveIntegerField(default=0)
    max_count = models.PositiveIntegerField(null=True, blank=True, help_text="Sustabdyti po N sąskaitų")
    first_day_of_month = models.BooleanField(default=False)
    last_day_of_month = models.BooleanField(default=False)

    send_payment_reminders = models.BooleanField(default=False)
    auto_create_sf_on_paid = models.BooleanField(default=False)
    auto_sf_series = models.CharField(max_length=50, blank=True, default="")
    auto_sf_send = models.BooleanField(default=False)
    payment_link_provider = models.CharField(
        max_length=50, blank=True, default=""
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"], name="idx_recinv_user_status"),
            models.Index(fields=["status", "next_run_at"], name="idx_recinv_status_next"),
            models.Index(fields=["user", "buyer_name"], name="idx_recinv_buyer_name"),
        ]

    def __str__(self):
        return f"Recurring {self.document_series} ({self.user})"

    @property
    def is_active(self):
        return self.status == "active"

    def clean_schedule_fields(self):
        """
        Вспомогательная нормализация.
        Можно вызывать из serializer/service перед save().
        """
        if self.frequency == "weekly":
            self.day_of_month = None
        elif self.frequency in ("monthly", "quarterly", "yearly"):
            self.weekday = None
        else:
            self.weekday = None
            self.day_of_month = None

    def should_finish(self, current_date=None):
        current_date = current_date or timezone.localdate()
        if self.end_date and current_date > self.end_date:
            return True
        if self.max_count and self.generation_count >= self.max_count:
            return True
        return False

    def mark_finished_if_needed(self, current_date=None):
        if self.should_finish(current_date=current_date):
            self.status = "finished"

    def compute_first_run_at(self):
        """
        Считает первый запуск от start_date + issue_time.
        Если issue_time не задано, берём 09:00.
        """
        from zoneinfo import ZoneInfo
        import datetime

        tz = ZoneInfo(self.timezone_name or "Europe/Vilnius")
        run_time = self.issue_time or datetime.time(hour=9, minute=0)

        base_date = self.start_date
        dt = datetime.datetime.combine(base_date, run_time)
        aware = dt.replace(tzinfo=tz)
        return aware.astimezone(timezone.get_current_timezone())

    def compute_next_run_after(self, from_dt=None):
        """
        Считает следующий запуск после from_dt.
        Для MVP логика достаточно простая и предсказуемая.
        """
        from zoneinfo import ZoneInfo
        import datetime
        import calendar

        tz = ZoneInfo(self.timezone_name or "Europe/Vilnius")
        run_time = self.issue_time or datetime.time(hour=9, minute=0)

        current = from_dt or self.next_run_at or self.compute_first_run_at()
        local_current = current.astimezone(tz)
        local_date = local_current.date()

        if self.frequency == "daily":
            next_date = local_date + relativedelta(days=self.interval)

        elif self.frequency == "weekly":
            next_date = local_date + relativedelta(weeks=self.interval)
            if self.weekday is not None:
                delta = self.weekday - next_date.weekday()
                next_date = next_date + relativedelta(days=delta)

        elif self.frequency == "monthly":
            candidate = local_date + relativedelta(months=self.interval)
            target_day = self.day_of_month or self.start_date.day
            last_day = calendar.monthrange(candidate.year, candidate.month)[1]
            next_date = candidate.replace(day=min(target_day, last_day))

        elif self.frequency == "quarterly":
            candidate = local_date + relativedelta(months=3 * self.interval)
            target_day = self.day_of_month or self.start_date.day
            last_day = calendar.monthrange(candidate.year, candidate.month)[1]
            next_date = candidate.replace(day=min(target_day, last_day))

        elif self.frequency == "yearly":
            candidate = local_date + relativedelta(years=self.interval)
            target_day = self.day_of_month or self.start_date.day
            last_day = calendar.monthrange(candidate.year, candidate.month)[1]
            next_date = candidate.replace(day=min(target_day, last_day))

        else:
            raise ValueError(f"Unsupported frequency: {self.frequency}")

        dt = datetime.datetime.combine(next_date, run_time)
        aware = dt.replace(tzinfo=tz)
        return aware.astimezone(timezone.get_current_timezone())

    def refresh_next_run_at(self, from_dt=None, save=False):
        next_run = self.compute_next_run_after(from_dt=from_dt)
        self.next_run_at = next_run

        if self.end_date:
            local_next_date = timezone.localtime(next_run).date()
            if local_next_date > self.end_date:
                self.next_run_at = None
                self.status = "finished"

        if save:
            self.save(update_fields=["next_run_at", "status", "updated_at"])

        return self.next_run_at




class RecurringInvoiceLineItem(models.Model):
    """
    Строки шаблона периодической счёт-фактуры.
    Без autosuggest полей.
    """

    recurring_invoice = models.ForeignKey(
        RecurringInvoice,
        on_delete=models.CASCADE,
        related_name="line_items",
    )

    prekes_pavadinimas = models.CharField("Prekės pavadinimas", max_length=255, blank=True, default="")
    prekes_kodas = models.CharField("Prekės kodas", max_length=128, blank=True, default="")
    prekes_barkodas = models.CharField("Prekės barkodas", max_length=128, blank=True, default="")
    preke_paslauga = models.CharField("Preke_paslauga", max_length=12, blank=True, default="")

    unit = models.CharField("Mato vnt.", max_length=50, blank=True, default="vnt")
    quantity = models.DecimalField(max_digits=15, decimal_places=5, null=True, blank=True)
    price = models.DecimalField("Kaina", max_digits=12, decimal_places=4, null=True, blank=True)
    vat_percent = models.DecimalField("PVM %", max_digits=5, decimal_places=2, null=True, blank=True)
    discount_wo_vat = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["recurring_invoice"], name="idx_recinvline_parent"),
        ]

    def __str__(self):
        return f"{self.prekes_pavadinimas or ''} x{self.quantity or ''}"




class RecurringInvoiceRun(models.Model):
    STATUS_CHOICES = [
        ("started", "Started"),
        ("success", "Success"),
        ("failed", "Failed"),
    ]

    recurring_invoice = models.ForeignKey(
        RecurringInvoice,
        on_delete=models.CASCADE,
        related_name="runs",
    )

    scheduled_for = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="started")

    invoice = models.ForeignKey(
        Invoice,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_runs",
    )

    error_text = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["recurring_invoice", "scheduled_for"],
                name="uniq_recinv_run_per_slot",
            )
        ]
        indexes = [
            models.Index(fields=["recurring_invoice", "status"], name="idx_recinvrun_parent_status"),
        ]

    def __str__(self):
        return f"Run {self.recurring_invoice_id} @ {self.scheduled_for} [{self.status}]"




# В модели InvoiceEmail — ЗАМЕНИТЬ/ДОПОЛНИТЬ:

class InvoiceEmail(models.Model):
    EMAIL_TYPE_CHOICES = [
        ("invoice", "S\u0105skaitos siuntimas"),
        ("invoice_paid", "Apmok\u0117ta SF i\u0161 i\u0161ankstin\u0117s"),
        ("invoice_info", "Informacin\u0117 s\u0105skaita"),          # NEW
        ("auto_sf", "Automatin\u0117 SF"),
        ("reminder_before", "Priminimas prie\u0161 termin\u0105"),
        ("reminder_overdue", "Priminimas po termino"),
        ("reminder", "Priminimas"),
        ("manual_reminder", "Rankinis priminimas"),
        ("cancelled", "S\u0105skaita at\u0161aukta"),
        ("paid_notice", "Apmok\u0117jimo patvirtinimas"),
    ]

    STATUS_CHOICES = [
        ("pending", "Laukiama"),
        ("sent", "Išsiųsta"),
        ("failed", "Nepavyko"),
        ("bounced", "Atmesta"),
    ]

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="emails",
    )
    email_type = models.CharField(max_length=20, choices=EMAIL_TYPE_CHOICES)
    to_email = models.EmailField()
    subject = models.CharField(max_length=500, blank=True, default="")
    sent_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="sent")
    error_text = models.TextField(blank=True, default="")
    reminder_number = models.PositiveSmallIntegerField(null=True, blank=True)

    # --- NEW: tracking ---
    mailgun_message_id = models.CharField(max_length=255, blank=True, default="")
    reminder_day = models.IntegerField(null=True, blank=True)  # -7, -1, 3 — для дедупликации
    opened_at = models.DateTimeField(null=True, blank=True)
    open_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-sent_at"]
        indexes = [
            models.Index(fields=["invoice", "-sent_at"], name="idx_invemail_inv_sent"),
            models.Index(fields=["invoice", "email_type"], name="idx_invemail_inv_type"),
            models.Index(fields=["mailgun_message_id"], name="idx_invemail_msgid"),
        ]

    def __str__(self):
        return f"{self.get_email_type_display()} → {self.to_email} ({self.sent_at})"





# ────────────────────────────────────────────────────────────
# Modeli dlia importa bankovskix scetov dlia israsymas
# ────────────────────────────────────────────────────────────

"""
Модели для банковского импорта, платежей и matching'а.

BankStatement          — загруженный файл банковской выписки
BaseTransaction        — abstract база для транзакций
IncomingTransaction    — входящий платёж (кредит из банка / webhook)
OutgoingTransaction    — исходящий платёж (дебет из банка)
PaymentAllocation      — связь транзакция → Invoice (M:N с суммами)

PaymentAllocation — единый источник правды про оплаты:
  - source="bank_import"   + incoming_transaction FK  → из банковской выписки
  - source="manual"        + incoming_transaction=null → ручная пометка юзером
  - source="payment_link"  + incoming_transaction FK  → webhook Montonio/Paysera
"""

import hashlib
import re
import unicodedata
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────


def normalize_name(name: str) -> str:
    """Нормализация названия компании для fuzzy matching."""
    if not name:
        return ""
    name = name.lower().strip()
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    for suffix in [
        r"\buab\b", r"\bab\b", r"\bvsi\b", r"\bmb\b", r"\biiv\b",
        r"\buz\b", r"\buzdaroji\b", r"\bakcine\b", r"\bbendrov[eė]\b",
        r"\bviesoji\b", r"\bistaiga\b", r"\bmazoji\b",
        r"\bsia\b", r"\boo\b", r"\booo\b", r"\bllc\b", r"\bgmbh\b",
        r"\bsp\.?\s*z\.?\s*o\.?\s*o\.?\b",
    ]:
        name = re.sub(suffix, "", name)
    name = re.sub(r'[\"\'\u201e\u201c\u00ab\u00bb\(\)]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


# ────────────────────────────────────────────────────────────
# 1. BankStatement
# ────────────────────────────────────────────────────────────


def bank_statement_path(instance, filename):
    return f"bank_statements/{instance.user_id}/{timezone.now():%Y/%m}/{filename}"


class BankStatement(models.Model):
    """Один загруженный файл банковской выписки."""

    BANK_CHOICES = [
        ("swedbank", "Swedbank"),
        ("seb", "SEB"),
        ("luminor", "Luminor"),
        ("siauliu", "Šiaulių bankas"),
        ("revolut", "Revolut"),
        ("other", "Kitas"),
    ]

    FORMAT_CHOICES = [
        ("csv", "CSV"),
        ("xml", "XML (ISO 20022)"),
    ]

    STATUS_CHOICES = [
        ("uploaded", "Įkeltas"),
        ("processing", "Apdorojamas"),
        ("processed", "Apdorotas"),
        ("error", "Klaida"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bank_statements",
    )
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    bank_name = models.CharField("Bankas", max_length=50, choices=BANK_CHOICES)
    file = models.FileField("Failas", upload_to=bank_statement_path, blank=True, null=True)
    file_format = models.CharField("Formatas", max_length=10, choices=FORMAT_CHOICES)
    original_filename = models.CharField(max_length=255, blank=True, default="")

    account_iban = models.CharField("IBAN", max_length=50, blank=True, default="")
    currency = models.CharField(max_length=10, default="EUR")
    period_from = models.DateField("Laikotarpis nuo", null=True, blank=True)
    period_to = models.DateField("Laikotarpis iki", null=True, blank=True)

    total_entries = models.PositiveIntegerField("Iš viso įrašų", default=0)
    credit_entries = models.PositiveIntegerField("Įplaukos", default=0)
    debit_entries = models.PositiveIntegerField("Išlaidos", default=0)
    duplicates_skipped = models.PositiveIntegerField("Praleisti dublikatai", default=0)
    auto_matched_count = models.PositiveIntegerField("Automatiškai susieta", default=0)
    likely_matched_count = models.PositiveIntegerField("Galimi atitikimai", default=0)
    unmatched_count = models.PositiveIntegerField("Nesusieta", default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="uploaded")
    error_message = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"], name="idx_bs_user_created"),
        ]

    def __str__(self):
        return f"{self.get_bank_name_display()} {self.period_from}–{self.period_to}"

    def refresh_stats(self):
        inc = self.incoming_transactions.all()
        out = self.outgoing_transactions.all()
        self.credit_entries = inc.count()
        self.debit_entries = out.count()
        self.total_entries = self.credit_entries + self.debit_entries
        self.auto_matched_count = inc.filter(match_status="auto_matched").count()
        self.likely_matched_count = inc.filter(match_status="likely_matched").count()
        self.unmatched_count = inc.filter(match_status="unmatched").count()
        self.save(update_fields=[
            "total_entries", "credit_entries", "debit_entries",
            "auto_matched_count", "likely_matched_count", "unmatched_count",
            "updated_at",
        ])


# ────────────────────────────────────────────────────────────
# 2. BaseTransaction → IncomingTransaction / OutgoingTransaction
# ────────────────────────────────────────────────────────────


class BaseTransaction(models.Model):
    """Abstract база — общие поля для входящих и исходящих транзакций."""

    SOURCE_CHOICES = [
        ("bank_import", "Banko išrašas"),
        ("payment_link", "Mokėjimo nuoroda"),
        ("manual", "Rankinis"),
        ("api", "API"),
    ]

    MATCH_STATUS_CHOICES = [
        ("unmatched", "Nesusieta"),
        ("auto_matched", "Automatiškai susieta"),
        ("likely_matched", "Galimas atitikimas"),
        ("confirmed", "Patvirtinta vartotojo"),
        ("manually_matched", "Susieta rankiniu būdu"),
        ("ignored", "Ignoruota"),
    ]

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    source = models.CharField("Šaltinis", max_length=20, choices=SOURCE_CHOICES)

    # ---- Данные из банка / провайдера ----
    transaction_date = models.DateField("Operacijos data")
    value_date = models.DateField("Valiutos data", null=True, blank=True)
    doc_number = models.CharField("Dok. nr.", max_length=100, blank=True, default="")
    bank_operation_code = models.CharField(
        "Banko žyma", max_length=20, blank=True, default="",
        help_text="K=korespondentinis, MK=memorialinis, TT=tarptautinis, M=mokestis",
    )

    counterparty_name = models.CharField(
        "Mokėtojo/gavėjo pavadinimas", max_length=255, blank=True, default="",
    )
    counterparty_name_normalized = models.CharField(max_length=255, blank=True, default="")
    counterparty_code = models.CharField(
        "Įmonės/asmens kodas", max_length=50, blank=True, default="",
    )
    counterparty_account = models.CharField(
        "Sąskaitos nr.", max_length=50, blank=True, default="",
    )

    payment_purpose = models.TextField("Mokėjimo paskirtis", blank=True, default="")
    reference_number = models.CharField("Nuorodos nr.", max_length=100, blank=True, default="")

    amount = models.DecimalField("Suma", max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="EUR")

    # ---- Payment link providers ----
    provider_name = models.CharField(
        "Paslaugų teikėjas", max_length=50, blank=True, default="",
    )
    provider_payment_id = models.CharField(
        "Mokėjimo ID", max_length=255, blank=True, default="",
    )

    # ---- Дедупликация ----
    transaction_hash = models.CharField(max_length=64, unique=True, editable=False)

    # ---- Matching ----
    match_status = models.CharField(
        max_length=20, choices=MATCH_STATUS_CHOICES, default="unmatched",
    )
    match_confidence = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    match_details = models.JSONField(default=dict, blank=True)
    allocated_amount = models.DecimalField(
        "Paskirstyta suma", max_digits=12, decimal_places=2, default=0,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    @property
    def unallocated_amount(self):
        return self.amount - self.allocated_amount

    @property
    def is_fully_allocated(self):
        return self.allocated_amount >= self.amount

    def compute_hash(self):
        raw = (
            f"{self.user_id}|"
            f"{self.transaction_date.isoformat()}|"
            f"{self.amount}|"
            f"{self.source}|"
            f"{(self.doc_number or '').strip()}|"
            f"{self.counterparty_code.strip()}|"
            f"{self.counterparty_account.strip()}|"
            f"{(self.payment_purpose or '')[:200].strip()}"
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def save(self, *args, **kwargs):
        if not self.transaction_hash:
            self.transaction_hash = self.compute_hash()
        if not self.counterparty_name_normalized and self.counterparty_name:
            self.counterparty_name_normalized = normalize_name(self.counterparty_name)
        super().save(*args, **kwargs)


class IncomingTransaction(BaseTransaction):
    """Входящий платёж — нам заплатили (кредит)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="incoming_transactions",
    )
    bank_statement = models.ForeignKey(
        BankStatement,
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name="incoming_transactions",
    )

    class Meta:
        ordering = ["-transaction_date", "-id"]
        indexes = [
            models.Index(fields=["user", "-transaction_date"], name="idx_inc_user_date"),
            models.Index(fields=["user", "match_status"], name="idx_inc_user_match"),
            models.Index(fields=["transaction_hash"], name="idx_inc_hash"),
            models.Index(fields=["counterparty_code"], name="idx_inc_cpty_code"),
        ]

    def __str__(self):
        return f"↓ {self.transaction_date} {self.amount} {self.currency} – {self.counterparty_name}"


class OutgoingTransaction(BaseTransaction):
    """Исходящий платёж — мы заплатили (дебет). Потом: matching с ScannedDocument."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="outgoing_transactions",
    )
    bank_statement = models.ForeignKey(
        BankStatement,
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name="outgoing_transactions",
    )

    class Meta:
        ordering = ["-transaction_date", "-id"]
        indexes = [
            models.Index(fields=["user", "-transaction_date"], name="idx_out_user_date"),
            models.Index(fields=["transaction_hash"], name="idx_out_hash"),
        ]

    def __str__(self):
        return f"↑ {self.transaction_date} {self.amount} {self.currency} – {self.counterparty_name}"


# ────────────────────────────────────────────────────────────
# 3. PaymentAllocation
# ────────────────────────────────────────────────────────────


class PaymentAllocation(models.Model):
    """
    Единый источник правды про оплаты Invoice.

    Три режима:
      1. bank_import:   incoming_transaction != null, source="bank_import"
      2. manual:        incoming_transaction = null,  source="manual"
      3. payment_link:  incoming_transaction != null, source="payment_link"
    """

    SOURCE_CHOICES = [
        ("bank_import", "Banko išrašas"),
        ("payment_link", "Mokėjimo nuoroda"),
        ("manual", "Rankinis"),
        ("api", "API"),
    ]

    STATUS_CHOICES = [
        ("auto", "Automatinis"),
        ("proposed", "Pasiūlytas"),
        ("confirmed", "Patvirtintas"),
        ("manual", "Rankinis"),
    ]

    incoming_transaction = models.ForeignKey(
        IncomingTransaction,
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name="allocations",
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="payment_allocations",
    )

    source = models.CharField("Šaltinis", max_length=20, choices=SOURCE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="proposed")

    amount = models.DecimalField("Paskirstyta suma", max_digits=12, decimal_places=2)
    payment_date = models.DateField("Mokėjimo data", null=True, blank=True)

    confidence = models.DecimalField(
        "Patikimumas", max_digits=3, decimal_places=2, default=0,
    )
    match_reasons = models.JSONField("Atitikimo kriterijai", default=dict, blank=True)

    note = models.TextField("Pastaba", blank=True, default="")

    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["invoice"], name="idx_pa_invoice"),
            models.Index(fields=["incoming_transaction"], name="idx_pa_txn"),
            models.Index(fields=["status"], name="idx_pa_status"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["incoming_transaction", "invoice"],
                condition=models.Q(incoming_transaction__isnull=False),
                name="uq_allocation_txn_inv",
            ),
        ]

    def __str__(self):
        src = f"Txn#{self.incoming_transaction_id}" if self.incoming_transaction_id else "Manual"
        return f"{src} → Inv#{self.invoice_id} = {self.amount}"

    @property
    def effective_payment_date(self):
        if self.payment_date:
            return self.payment_date
        if self.incoming_transaction:
            return self.incoming_transaction.transaction_date
        return self.created_at.date() if self.created_at else None





class InvSubscription(models.Model):
    """
    Подписка на модуль выставления счетов (Išrašymas).
    Создаётся при регистрации пользователя.
    """
    STATUS_FREE   = "free"
    STATUS_TRIAL  = "trial"
    STATUS_ACTIVE = "active"
    STATUS_CHOICES = [
        (STATUS_FREE,   "Free (basic)"),
        (STATUS_TRIAL,  "Trial"),
        (STATUS_ACTIVE, "Active (paid)"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="inv_subscription",
    )
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_FREE,
    )
    trial_used = models.BooleanField(default=False)
    trial_end = models.DateTimeField(null=True, blank=True)
    plan = models.CharField(max_length=50, null=True, blank=True)
    plan_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    stripe_subscription_id = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        verbose_name = "Inv subscription"
        verbose_name_plural = "Inv subscriptions"

    def __str__(self):
        return f"{self.user.email} — {self.status}"

    def check_and_expire(self):
        """
        Lazy check: если trial/active истёк — переводим в free.
        Вызывается при каждом обращении к статусу.
        Возвращает True если статус изменился.
        """
        changed = False
        now_dt = timezone.now()

        if self.status == self.STATUS_TRIAL and self.trial_end and self.trial_end < now_dt:
            self.status = self.STATUS_FREE
            changed = True

        if self.status == self.STATUS_ACTIVE and self.plan_end and self.plan_end < now_dt:
            self.status = self.STATUS_FREE
            changed = True

        if changed:
            self.save(update_fields=["status"])

        return changed

    def start_trial(self):
        """Активирует 14-дневный trial. Можно только один раз."""
        if self.trial_used:
            raise ValueError("Trial already used")
        self.status = self.STATUS_TRIAL
        self.trial_used = True
        self.trial_end = timezone.now() + timedelta(days=14)
        self.save(update_fields=["status", "trial_used", "trial_end"])

    @property
    def days_left(self):
        """Дней до конца trial или платной подписки."""
        end = None
        if self.status == self.STATUS_TRIAL:
            end = self.trial_end
        elif self.status == self.STATUS_ACTIVE:
            end = self.plan_end
        if end:
            delta = (end - timezone.now()).days
            return max(delta, 0)
        return None

    @property
    def show_trial_banner(self):
        """Жёлтый баннер за 3 дня до конца trial."""
        if self.status == self.STATUS_TRIAL and self.days_left is not None:
            return self.days_left <= 3
        return False

    def get_features(self):
        full_access = self.status in (self.STATUS_TRIAL, self.STATUS_ACTIVE)
        return {
            "bank_import": full_access,
            "payment_links": full_access,
            "recurring": full_access,
            "auto_reminders": full_access,
            "watermark": not full_access,
            "export_limit": None if full_access else 10,
            "email_limit": None if full_access else 10,
        }


class InvMonthlyUsage(models.Model):
    """
    Месячные счётчики лимитов free-плана Išrašymas.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="inv_monthly_usages",
    )
    month = models.CharField(
        max_length=7,
        help_text="YYYY-MM format, e.g. 2026-03",
    )
    exported_invoice_ids = models.JSONField(default=list, blank=True)
    emailed_invoice_ids = models.JSONField(default=list, blank=True)

    class Meta:
        unique_together = ("user", "month")
        verbose_name = "Inv monthly usage"
        verbose_name_plural = "Inv monthly usages"

    def __str__(self):
        return f"{self.user.email} — {self.month}"

    @classmethod
    def get_current(cls, user):
        """Получить или создать запись за текущий месяц."""
        current_month = timezone.now().strftime("%Y-%m")
        obj, _ = cls.objects.get_or_create(
            user=user, month=current_month,
        )
        return obj

    def can_export(self, invoice_id):
        """Можно ли экспортировать эту фактуру (лимит 30 уникальных)."""
        if invoice_id in self.exported_invoice_ids:
            return True  # повторный экспорт — всегда ок
        return len(self.exported_invoice_ids) < 30

    def record_export(self, invoice_id):
        """Записать экспорт фактуры."""
        if invoice_id not in self.exported_invoice_ids:
            self.exported_invoice_ids.append(invoice_id)
            self.save(update_fields=["exported_invoice_ids"])

    def can_email(self, invoice_id):
        """Можно ли отправить email по этой фактуре (лимит 10 уникальных)."""
        if invoice_id in self.emailed_invoice_ids:
            return True  # повторная отправка той же — ок
        return len(self.emailed_invoice_ids) < 10

    def record_email(self, invoice_id):
        """Записать email-отправку фактуры."""
        if invoice_id not in self.emailed_invoice_ids:
            self.emailed_invoice_ids.append(invoice_id)
            self.save(update_fields=["emailed_invoice_ids"])

    @property
    def exports_used(self):
        return len(self.exported_invoice_ids)

    @property
    def emails_used(self):
        return len(self.emailed_invoice_ids)











from .services.encryption import encrypt_value, decrypt_value
 
# ═══════════════════════════════════════════════════════════
# 1. RivileGamaAPIKey — одна карточка = одна фирма (DB)
# ═══════════════════════════════════════════════════════════
class RivileGamaAPIKey(models.Model):
    """
    Один API ключ Rivile GAMA = одна база данных = одна фирма клиента.
    Бухгалтер, ведущий несколько фирм, создаёт несколько карточек.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rivile_gama_api_keys",
    )
 
    # Описание
    label = models.CharField(
        "Pavadinimas",
        max_length=150,
        blank=True,
        help_text="Pvz. 'UAB Mano Įmonė' — laisvos formos pavadinimas",
    )
    company_code = models.CharField(
        "Įmonės kodas",
        max_length=50,
        help_text="Unikalus įmonės kodas, pvz. 123456789",
    )
 
    # API ключ (зашифрованный)
    api_key_encrypted = models.TextField(
        "API raktas (šifruotas)",
        help_text="Fernet-encrypted API key",
    )
    key_suffix = models.CharField(
        "Rakto pabaiga",
        max_length=8,
        blank=True,
        help_text="Paskutiniai 4 simboliai rodymui UI",
    )
 
    # Состояние
    is_active = models.BooleanField("Aktyvus", default=True)
    verified_at = models.DateTimeField("Patikrinimo laikas", null=True, blank=True)
    last_ok = models.BooleanField("Paskutinis patikrinimas OK", null=True, blank=True)
    last_error = models.TextField("Paskutinė klaida", blank=True)
 
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
 
    class Meta:
        verbose_name = "Rivile GAMA API raktas"
        verbose_name_plural = "Rivile GAMA API raktai"
        unique_together = ("user", "company_code")
        ordering = ["created_at"]
 
    def __str__(self):
        return f"{self.label or self.company_code} (****{self.key_suffix})"
 
    # ─── Работа с ключом ───
 
    def set_api_key(self, raw_key: str):
        self.api_key_encrypted = encrypt_value(raw_key)
        self.key_suffix = raw_key[-4:] if len(raw_key) >= 4 else raw_key

    def get_api_key(self) -> str:
        return decrypt_value(self.api_key_encrypted)
    
 
    def mark_verified(self, success: bool, error: str = ""):
        """Обновляет статус проверки ключа."""
        self.verified_at = timezone.now()
        self.last_ok = success
        self.last_error = error if not success else ""
        self.save(update_fields=["verified_at", "last_ok", "last_error", "updated_at"])
 
 
# ═══════════════════════════════════════════════════════════
# 2. RivileAPIRefLog — лог запросов к справочникам
# ═══════════════════════════════════════════════════════════
class RivileAPIRefLog(models.Model):
    """
    Лог каждого запроса к справочникам Rivile GAMA API.
    Привязан к конкретной карточке API ключа (= конкретная фирма).
 
    Используется для:
      - Отладки ошибок
      - Будущей оптимизации (пропуск уже отправленных записей)
    """
    api_key = models.ForeignKey(
        "APIProviderKey",
        on_delete=models.CASCADE,
        related_name="ref_logs",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
 
    session = models.CharField(
        "Eksporto sesija",
        max_length=64,
        blank=True,
        db_index=True,
        help_text="Session ID пачки экспорта",
    )
 
    method = models.CharField(
        "API metodas",
        max_length=30,
        help_text="EDIT_N08_FULL / EDIT_N17 / EDIT_N25",
    )
    entity_code = models.CharField(
        "Objekto kodas",
        max_length=50,
        help_text="N08_KODAS_KS / N17_KODAS_PS / N25_KODAS_BS",
    )
 
    # Результат
    STATUS_CHOICES = [
        ("Success", "Success"),
        ("Error", "Error"),
        ("Duplicate", "Duplicate"),
    ]
    status = models.CharField("Statusas", max_length=20, choices=STATUS_CHOICES)
    http_status = models.IntegerField("HTTP statusas", default=0)
    error_code = models.CharField("Klaidos kodas", max_length=20, blank=True)
    error_message = models.TextField("Klaidos pranešimas", blank=True)
    raw_response = models.TextField("Atsakymas (raw)", blank=True)
 
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
 
    class Meta:
        verbose_name = "Rivile API ref log"
        verbose_name_plural = "Rivile API ref logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["api_key", "method", "entity_code"],
                name="idx_riv_ref_mth_code",
            ),
            models.Index(
                fields=["api_key", "method", "status"],
                name="idx_riv_ref_mth_stat",
            ),
        ]
 
    def __str__(self):
        return f"{self.method} {self.entity_code} → {self.status}"



import json
from .services.encryption import encrypt_value, decrypt_value


class APIProviderKey(models.Model):
    """
    Универсальный API ключ для любого провайдера (Rivile GAMA API, Dineta, Optimum).
    Один ключ = одна фирма (или __all__ для всех, или __israsymas__ для Išrašymas).
    """
    PROVIDER_CHOICES = [
        ("rivile_gama_api", "Rivile GAMA API"),
        ("dineta", "Dineta"),
        ("optimum", "Optimum"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_provider_keys",
    )
    provider = models.CharField(
        "Teikėjas",
        max_length=30,
        choices=PROVIDER_CHOICES,
    )

    label = models.CharField(
        "Pavadinimas",
        max_length=150,
        blank=True,
    )
    company_code = models.CharField(
        "Įmonės kodas",
        max_length=50,
        help_text="Įmonės kodas, '__all__' visoms, '__israsymas__' išrašymui",
    )

    # Зашифрованные credentials (JSON)
    # rivile_gama_api: {"api_key": "..."}
    # dineta: {"url": "...", "username": "...", "password": "..."}
    # optimum: {"api_key": "..."}
    credentials_encrypted = models.TextField(
        "Prisijungimo duomenys (šifruoti)",
    )
    key_suffix = models.CharField(
        "Rakto pabaiga",
        max_length=8,
        blank=True,
        help_text="Paskutiniai 4 simboliai rodymui UI",
    )

    is_active = models.BooleanField("Aktyvus", default=True)
    use_for_all = models.BooleanField(
        "Naudoti visoms įmonėms",
        default=False,
        help_text="Jei True, šis raktas naudojamas kai nėra specifinio rakto įmonei",
    )
    verified_at = models.DateTimeField("Patikrinimo laikas", null=True, blank=True)
    last_ok = models.BooleanField("Paskutinis patikrinimas OK", null=True, blank=True)
    last_error = models.TextField("Paskutinė klaida", blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "API provider key"
        verbose_name_plural = "API provider keys"
        unique_together = ("user", "provider", "company_code")
        ordering = ["provider", "created_at"]

    def __str__(self):
        return f"{self.get_provider_display()} | {self.label or self.company_code} (****{self.key_suffix})"

    # ─── Credentials ───

    def set_credentials(self, creds: dict):
        """Шифрует и сохраняет credentials dict."""
        raw = json.dumps(creds, ensure_ascii=False)
        self.credentials_encrypted = encrypt_value(raw)
        # key_suffix из основного ключа
        main_key = creds.get("api_key") or creds.get("password") or ""
        self.key_suffix = main_key[-4:] if len(main_key) >= 4 else main_key

    def get_credentials(self) -> dict:
        """Расшифровывает и возвращает credentials dict."""
        raw = decrypt_value(self.credentials_encrypted)
        return json.loads(raw)

    # ─── Convenience для обратной совместимости с Rivile GAMA API ───

    def get_api_key(self) -> str:
        """Для rivile_gama_api и optimum."""
        return self.get_credentials().get("api_key", "")

    def set_api_key(self, raw_key: str):
        """Для rivile_gama_api и optimum."""
        self.set_credentials({"api_key": raw_key})

    def mark_verified(self, success: bool, error: str = ""):
        self.verified_at = timezone.now()
        self.last_ok = success
        self.last_error = error if not success else ""
        self.save(update_fields=["verified_at", "last_ok", "last_error", "updated_at"])