from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("docscanner_app", "0096_exportsession_invoice_documents"),
    ]

    operations = [
        migrations.RunSQL(
            sql='DROP INDEX IF EXISTS "docscanner__documen_504cef_idx";',
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(
                    model_name="apiexportlog",
                    name="document",
                ),
                migrations.AddField(
                    model_name="apiexportlog",
                    name="document_id",
                    field=models.IntegerField(
                        verbose_name="Dokumento ID",
                        db_index=True,
                        help_text="ScannedDocument arba Invoice ID",
                        default=0,
                    ),
                    preserve_default=False,
                ),
                migrations.AddIndex(
                    model_name="apiexportlog",
                    index=models.Index(
                        fields=["document_id", "program", "-created_at"],
                        name="idx_explog_doc_prog",
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE docscanner_app_apiexportlog DROP CONSTRAINT IF EXISTS docscanner_app_apiex_document_id_4d8f1a5a_fk_docscanne;",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql='CREATE INDEX IF NOT EXISTS "idx_explog_doc_prog" ON "docscanner_app_apiexportlog" ("document_id", "program", "created_at" DESC);',
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
        ),
    ]