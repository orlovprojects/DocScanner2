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

    class Meta:
        verbose_name = "Klientas autocomplete įrašas"
        verbose_name_plural = "Klientai autocomplete įrašai"
        indexes = [
            models.Index(fields=["user", "imones_kodas"]),
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
    im_kodas     = models.CharField(max_length=16, db_index=True, blank=True, null=True)   # Идентификационный код фирмы
    pavadinimas  = models.CharField(max_length=255, db_index=True, blank=True, null=True)  # Название фирмы
    ireg_data    = models.DateField(null=True, blank=True)          # Дата регистрации
    isreg_data   = models.DateField(null=True, blank=True)          # Дата закрытия (если есть)
    tipas        = models.CharField(max_length=64, blank=True, null=True)      # Тип организации
    pvm_kodas    = models.CharField(max_length=32, blank=True, null=True)      # PVM/VAT код
    pvm_ireg     = models.DateField(null=True, blank=True)          # Дата регистрации PVM
    pvm_isreg    = models.DateField(null=True, blank=True)          # Дата снятия с PVM

    class Meta:
        indexes = [
            models.Index(fields=["im_kodas"]),
            models.Index(fields=["pavadinimas"]),
            models.Index(fields=["pvm_kodas"]),
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

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='api_export_logs'
    )
    document = models.ForeignKey(
        'ScannedDocument',
        on_delete=models.CASCADE,
        related_name='api_export_logs'
    )
    program = models.CharField(max_length=50, choices=ExportProgram.choices)
    status = models.CharField(max_length=20, choices=ExportStatus.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    message = models.CharField(max_length=255, blank=True, default="")

    invoice_type = models.CharField(max_length=30)
    invoice_status = models.CharField(max_length=10)
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
            models.Index(fields=['document', 'program', '-created_at']),
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