# Generated by Django 4.2.16 on 2025-06-30 13:25

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("docscanner_app", "0004_alter_scanneddocument_operation_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="credits",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
