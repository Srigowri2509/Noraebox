-- Production search setup for Spotify/YouTube Music style fuzzy search.
-- Run with:
--   psql "$DATABASE_URL" -f backend/sql/search_indexes.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.noraebox_unaccent(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.unaccent('public.unaccent', COALESCE(value, ''));
$$;

CREATE OR REPLACE FUNCTION public.noraebox_search_normalize(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(lower(public.noraebox_unaccent(value)), '[[:punct:][:space:]]+', ' ', 'g'));
$$;

DROP INDEX IF EXISTS idx_songs_title_trgm;
DROP INDEX IF EXISTS idx_songs_album_trgm;
DROP INDEX IF EXISTS idx_artist_name_trgm;
DROP INDEX IF EXISTS idx_songs_title_album_fts;
DROP INDEX IF EXISTS idx_songs_title_fts;
DROP INDEX IF EXISTS idx_songs_album_fts;
DROP INDEX IF EXISTS idx_artist_name_fts;
DROP INDEX IF EXISTS idx_songs_language_normalized;

CREATE INDEX IF NOT EXISTS idx_songs_title_trgm
  ON public.songs USING gin (public.noraebox_search_normalize(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_songs_album_trgm
  ON public.songs USING gin (public.noraebox_search_normalize(album) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_artist_name_trgm
  ON public.artist USING gin (public.noraebox_search_normalize(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_songs_title_album_fts
  ON public.songs USING gin (
    to_tsvector('simple', public.noraebox_search_normalize(COALESCE(title, '') || ' ' || COALESCE(album, '')))
  );

CREATE INDEX IF NOT EXISTS idx_songs_title_fts
  ON public.songs USING gin (
    to_tsvector('simple', public.noraebox_search_normalize(COALESCE(title, '')))
  );

CREATE INDEX IF NOT EXISTS idx_songs_album_fts
  ON public.songs USING gin (
    to_tsvector('simple', public.noraebox_search_normalize(COALESCE(album, '')))
  );

CREATE INDEX IF NOT EXISTS idx_artist_name_fts
  ON public.artist USING gin (
    to_tsvector('simple', public.noraebox_search_normalize(name))
  );

CREATE INDEX IF NOT EXISTS idx_song_artists_song_id
  ON public.song_artists(song_id);

CREATE INDEX IF NOT EXISTS idx_song_artists_artist_id
  ON public.song_artists(artist_id);

CREATE INDEX IF NOT EXISTS idx_songs_language_normalized
  ON public.songs(public.noraebox_search_normalize(language));
