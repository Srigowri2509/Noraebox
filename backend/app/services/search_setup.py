from sqlalchemy import text

from app.db import engine


def ensure_search_support() -> None:
    """Install lightweight search prerequisites when the DB user is allowed.

    Production should still run backend/sql/search_indexes.sql so the GIN
    indexes are present before large catalogs are searched.
    """
    statements = [
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "CREATE EXTENSION IF NOT EXISTS unaccent",
        """
        CREATE OR REPLACE FUNCTION public.noraebox_unaccent(value text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        AS $$
          SELECT public.unaccent('public.unaccent', COALESCE(value, ''));
        $$;
        """,
        """
        CREATE OR REPLACE FUNCTION public.noraebox_search_normalize(value text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        AS $$
          SELECT btrim(regexp_replace(lower(public.noraebox_unaccent(value)), '[[:punct:][:space:]]+', ' ', 'g'));
        $$;
        """,
    ]

    try:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))
    except Exception as exc:
        print(f"Search extension setup skipped: {exc}")
