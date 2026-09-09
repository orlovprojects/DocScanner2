from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("docscanner_app", "0170_scanneddocument_epris_codes_and_more")]
    operations = [migrations.AddField(
        model_name="scanneddocument", name="epris_details",
        field=models.JSONField(blank=True, default=dict),
    )]
