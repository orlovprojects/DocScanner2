# Generated by Django 4.2.16 on 2025-07-07 17:42

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("docscanner_app", "0010_customuser_default_accounting_program"),
    ]

    operations = [
        migrations.AlterField(
            model_name="customuser",
            name="default_accounting_program",
            field=models.CharField(
                blank=True,
                choices=[
                    ("rivile", "Rivilė"),
                    ("bss", "BSS"),
                    ("finvalda", "Finvalda"),
                    ("centas", "Centas"),
                    ("apskaita5", "Apskaita5"),
                ],
                max_length=32,
                null=True,
            ),
        ),
        migrations.CreateModel(
            name="Apskaita5Autocomplete",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "islaidos_prekes_kodas",
                    models.CharField(
                        blank=True, max_length=128, verbose_name="Išlaidos prekės kodas"
                    ),
                ),
                (
                    "islaidos_prekes_pavadinimas",
                    models.CharField(
                        blank=True,
                        max_length=255,
                        verbose_name="Išlaidos prekės pavadinimas",
                    ),
                ),
                (
                    "klientai_kodas_programoje",
                    models.CharField(
                        blank=True,
                        max_length=128,
                        verbose_name="Klientai kodas programoje",
                    ),
                ),
                (
                    "klientai_imones_kodas",
                    models.CharField(
                        blank=True, max_length=128, verbose_name="Klientai įmonės kodas"
                    ),
                ),
                (
                    "klientai_pavadinimas",
                    models.CharField(
                        blank=True, max_length=255, verbose_name="Klientai pavadinimas"
                    ),
                ),
                (
                    "klientai_pvm_kodas",
                    models.CharField(
                        blank=True, max_length=128, verbose_name="Klientai PVM kodas"
                    ),
                ),
                (
                    "klientai_iban",
                    models.CharField(
                        blank=True, max_length=128, verbose_name="Klientai IBAN"
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="apskaita5_autocomplete",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Apskaita5 autocomplete įrašas",
                "verbose_name_plural": "Apskaita5 autocomplete įrašai",
                "indexes": [
                    models.Index(
                        fields=["user", "klientai_imones_kodas"],
                        name="docscanner__user_id_d057bc_idx",
                    )
                ],
            },
        ),
    ]
