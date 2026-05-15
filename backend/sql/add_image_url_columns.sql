-- Run on production Postgres if artist/playlist image columns are missing.
-- psql $DATABASE_URL -f add_image_url_columns.sql

ALTER TABLE artist ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS image_url TEXT;
