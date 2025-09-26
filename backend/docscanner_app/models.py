from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.utils.timezone import now
import os
import uuid
import hashlib
from django.conf import settings
from django.utils import timezone




def user_upload_path(instance, filename):
    email_hash = hashlib.sha256(instance.user.email.lower().encode()).hexdigest()[:16]
    ext = filename.split('.')[-1]
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    return os.path.join("uploads", email_hash, unique_name)


class ScannedDocument(models.Model):
    STATUS_CHOICES = [
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

    buyer_id_programoje = models.CharField(max_length=64, blank=True, null=True)
    buyer_id = models.CharField(max_length=100, blank=True, null=True)
    buyer_name = models.CharField(max_length=255, blank=True, null=True)
    buyer_vat_code = models.CharField(max_length=50, blank=True, null=True)
    buyer_address = models.CharField(max_length=255, blank=True, null=True)
    buyer_country = models.CharField(max_length=50, blank=True, null=True)
    buyer_country_iso = models.CharField(max_length=10, blank=True, null=True)
    buyer_iban = models.CharField(max_length=255, blank=True, null=True)
    buyer_is_person = models.BooleanField(blank=True, null=True)

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

    class Meta:
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["uploaded_at"]),
            models.Index(fields=["seller_name"]),
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
    quantity = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)  # <kiekis>
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

    credits = models.DecimalField(max_digits=7, decimal_places=2, default=0)
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

    extra_settings = models.JSONField(blank=True, null=True)

    # --- NEW: UI režimas dokumentų sąrašui ---
    view_mode = models.CharField(
        max_length=16,
        choices=VIEW_MODE_CHOICES,
        default=VIEW_MODE_SINGLE,
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