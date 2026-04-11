from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("docscanner_app", "0099_clientautocomplete_unique_client_code_per_user"),
    ]

    operations = [
        migrations.RunSQL(
            sql='DROP INDEX IF EXISTS "idx_explog_doc_prog";',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
