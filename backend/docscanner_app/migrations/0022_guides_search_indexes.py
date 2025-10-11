from django.db import migrations

# 1) Расширения Postgres: trigram + unaccent
SQL_EXT = """
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
"""

# 2) IMMUTABLE-обёртка вокруг unaccent (иначе Postgres ругается в индексах)
#    Важно: используем public.unaccent внутри (так чаще всего ставится расширение).
SQL_FN = """
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT public.unaccent($1) $$;
"""

# 3) Индексы GIN на нормализованное выражение:
#    public.unaccent_immutable(lower(search_text)) gin_trgm_ops
SQL_IDX_CREATE = """
-- categories
CREATE INDEX IF NOT EXISTS docscan_cat_searchtext_trgm
  ON docscanner_app_guidecategorypage
  USING gin (public.unaccent_immutable(lower(search_text)) gin_trgm_ops);

-- articles
CREATE INDEX IF NOT EXISTS docscan_guide_searchtext_trgm
  ON docscanner_app_guidepage
  USING gin (public.unaccent_immutable(lower(search_text)) gin_trgm_ops);
"""

SQL_IDX_DROP = """
DROP INDEX IF EXISTS docscan_cat_searchtext_trgm;
DROP INDEX IF EXISTS docscan_guide_searchtext_trgm;
"""

class Migration(migrations.Migration):

    dependencies = [
        ("docscanner_app", "0021_add_search_text_fields"),  # замени, если номер другой
    ]

    operations = [
        migrations.RunSQL(SQL_EXT),
        migrations.RunSQL(SQL_FN),
        migrations.RunSQL(SQL_IDX_CREATE, reverse_sql=SQL_IDX_DROP),
    ]