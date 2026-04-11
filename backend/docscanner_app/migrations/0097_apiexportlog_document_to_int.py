from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("docscanner_app", "0096_exportsession_invoice_documents"),
    ]

    operations = [
        # 1. Удаляем старый индекс через SQL
        migrations.RunSQL(
            sql='DROP INDEX IF EXISTS "docscanner__documen_504cef_idx";',
            reverse_sql=migrations.RunSQL.noop,
        ),
        # 2. Дропаем FK constraint, Django state: rename + alter
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RenameField(
                    model_name="apiexportlog",
                    old_name="document",
                    new_name="document_id",
                ),
                migrations.AlterField(
                    model_name="apiexportlog",
                    name="document_id",
                    field=models.IntegerField(
                        verbose_name="Dokumento ID",
                        db_index=True,
                        help_text="ScannedDocument arba Invoice ID",
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE docscanner_app_apiexportlog DROP CONSTRAINT IF EXISTS docscanner_app_apiex_document_id_4d8f1a5a_fk_docscanne;",
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
        ),
        # 3. Новый индекс
        migrations.AddIndex(
            model_name="apiexportlog",
            index=models.Index(
                fields=["document_id", "program", "-created_at"],
                name="idx_explog_doc_prog",
            ),
        ),
    ]