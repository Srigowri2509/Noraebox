from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import distinct, text
from typing import List
import json
import re
import unicodedata
from botocore.exceptions import ClientError
from app.db import get_db
from app.models import Song, SongArtist, Artist, SongSuggestion
from app.schemas import SongResponse, SongSuggestionCreate, SongSuggestionResponse
from app.s3_service import generate_signed_url, resolve_full_s3_key, open_s3_object, get_streaming_s3_client, S3_BUCKET_NAME

router = APIRouter()


def _parse_artists(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value) if value else []
        except Exception:
            return []
    return []


def _normalize_words(value: str):
    # Keep letters and numbers from every Unicode script (Hindi, Telugu,
    # Tamil, Arabic, CJK, etc.) instead of silently discarding non-English
    # search terms. NFKC also makes full-width/compatibility forms comparable.
    source = unicodedata.normalize("NFKC", str(value or "")).casefold()
    normalized = "".join(
        character if character.isalnum() or unicodedata.category(character).startswith("M") else " "
        for character in source
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized.split() if normalized else []


def _build_song_response(row, signed_urls: bool = False):
    artists_list = _parse_artists(row.artists)

    s3_key_for_signing = row.file_url or ""
    song_language = row.language or None

    file_url_value = s3_key_for_signing
    if signed_urls and row.file_url:
        try:
            print(f"Generating signed URL for song {row.id} (language: {song_language}): {s3_key_for_signing}")
            file_url_value = generate_signed_url(s3_key_for_signing, language=song_language)
            print(f"✅ Generated signed URL for song {row.id}: {file_url_value[:80]}...")
        except Exception as e:
            print(f"❌ ERROR: Failed to generate signed URL for song {row.id} ({s3_key_for_signing}): {e}")
            import traceback
            traceback.print_exc()
            file_url_value = s3_key_for_signing

    first_artist = artists_list[0] if artists_list else None
    play_count_value = row.play_count if isinstance(row.play_count, int) and row.play_count is not None else int(row.play_count or 0)

    return {
        "id": row.id,
        "title": row.title,
        "album": row.album,
        "language": row.language,
        "file_url": file_url_value,
        "s3_key": s3_key_for_signing,
        "play_count": play_count_value,
        "artists": artists_list,
        "artist": first_artist["name"] if first_artist else None,
        "artist_name": first_artist["name"] if first_artist else None,
        "artist_id": int(first_artist["id"]) if (first_artist and "id" in first_artist and first_artist["id"] is not None) else None,
        "artist_image": first_artist.get("image_url") if (isinstance(first_artist, dict) and "image_url" in first_artist) else None
    }


@router.get("/languages")
def get_languages(db: Session = Depends(get_db)):
    """Get unique languages from songs table"""
    try:
        languages = db.query(distinct(Song.language)).filter(Song.language.isnot(None)).all()
        # Extract language values from tuples
        language_list = sorted([lang[0] for lang in languages if lang[0]])
        print(f"Found {len(language_list)} unique languages: {language_list}")
        return language_list
    except Exception as e:
        print(f"Error fetching languages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[SongResponse])
def list_songs(
    search: str = None, 
    signed_urls: bool = Query(False, description="Generate signed URLs for all songs (default: False, faster)"),
    db: Session = Depends(get_db)
):
    """List all songs with artist data
    
    Args:
        search: Optional search term to filter songs
        signed_urls: If True (default), generate signed URLs for all songs. Set to False for faster response with S3 keys only.
    """
    try:
        print(f"GET /songs called (search={search}, signed_urls={signed_urls})")
        
        # Build base SQL query with GROUP BY to prevent duplicates
        base_query = """
            SELECT 
                s.id,
                s.title,
                s.album,
                s.language,
                s.file_url,
                s.play_count,
                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'id', a.id,
                            'name', a.name,
                            'role', sa.role
                        )
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'::json
                ) AS artists
            FROM songs s
            LEFT JOIN song_artists sa ON s.id = sa.song_id
            LEFT JOIN artist a ON sa.artist_id = a.id
        """
        
        # Add WHERE clause if search is provided
        where_clause = ""
        if search:
            like_pattern = f"%{search}%"
            where_clause = f"""
            WHERE (
                LOWER(s.title) LIKE LOWER(:search_pattern)
                OR LOWER(s.album) LIKE LOWER(:search_pattern)
                OR LOWER(s.language) LIKE LOWER(:search_pattern)
                OR LOWER(a.name) LIKE LOWER(:search_pattern)
            )
            """
        
        # Complete query with GROUP BY after WHERE clause
        query_sql = base_query + where_clause + """
            GROUP BY 
                s.id,
                s.title,
                s.album,
                s.language,
                s.file_url,
                s.play_count
            ORDER BY s.title
        """
        
        # Execute query
        if search:
            result = db.execute(text(query_sql), {"search_pattern": like_pattern})
        else:
            result = db.execute(text(query_sql))
        
        rows = result.fetchall()
        
        print(f"Fetched {len(rows)} songs from database")
        
        # Build result list
        songs = []
        for row in rows:
            if not signed_urls:
                print(f"⚠️ Skipping signed URL for song {row.id} (signed_urls={signed_urls}, file_url={row.file_url}, s3_key={row.file_url or ''})")
            songs.append(_build_song_response(row, signed_urls=signed_urls))
        
        url_type = "signed URLs" if signed_urls else "S3 keys"
        print(f"Returning {len(songs)} songs with {url_type}")
        return songs

    except Exception as e:
        print(f"Error in list_songs: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search", response_model=List[SongResponse])
def search_songs(
    q: str = Query(..., min_length=1, description="Search query"),
    field: str = Query("all", description="Backward-compatible hint: all, title, artist or album"),
    language: str = Query(None, description="Optional explicit language filter"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Fuzzy combined search across song title, every linked artist and album."""
    try:
        query = q.strip()
        if not query:
            return []

        if field not in {"all", "title", "artist", "album"}:
            raise HTTPException(status_code=400, detail="field must be 'all', 'title', 'artist' or 'album'")

        # The indexed candidate CTE avoids ranking every song. It first pulls IDs
        # from trigram LIKE/% and FTS probes on title, album and every linked artist.
        query_sql = """
            WITH params AS (
                SELECT
                    public.noraebox_search_normalize(:query) AS q,
                    replace(public.noraebox_search_normalize(:query), ' ', '') AS q_compact,
                    :field AS field,
                    NULLIF(public.noraebox_search_normalize(:language), '') AS language,
                    websearch_to_tsquery('simple', public.noraebox_search_normalize(:query)) AS tsq
            ),
            terms AS (
                SELECT
                    term,
                    replace(term, ' ', '') AS term_compact
                FROM params p,
                LATERAL regexp_split_to_table(p.q, ' ') AS term
                WHERE length(term) > 0
            ),
            candidate_song_ids AS (
                SELECT s.id
                FROM (
                    SELECT
                        id,
                        public.noraebox_search_normalize(title) AS title_norm,
                        replace(public.noraebox_search_normalize(title), ' ', '') AS title_compact,
                        public.noraebox_search_normalize(album) AS album_norm,
                        replace(public.noraebox_search_normalize(album), ' ', '') AS album_compact
                    FROM songs
                ) s
                CROSS JOIN params p
                WHERE p.q <> ''
                  AND (
                    (
                      p.field IN ('all', 'title')
                      AND (
                        s.title_norm LIKE '%' || p.q || '%'
                        OR s.title_compact LIKE '%' || p.q_compact || '%'
                        OR (
                          length(p.q_compact) <= length(s.title_compact) * 1.35
                          AND GREATEST(
                            similarity(s.title_norm, p.q),
                            similarity(s.title_compact, p.q_compact),
                            word_similarity(p.q, s.title_norm)
                          ) >= CASE WHEN length(p.q_compact) >= 8 THEN :long_query_similarity ELSE :min_similarity END
                        )
                        OR to_tsvector('simple', s.title_norm) @@ p.tsq
                      )
                    )
                    OR (
                      p.field IN ('all', 'album')
                      AND (
                        s.album_norm LIKE '%' || p.q || '%'
                        OR s.album_compact LIKE '%' || p.q_compact || '%'
                        OR (
                          length(p.q_compact) <= length(s.album_compact) * 1.35
                          AND GREATEST(
                            similarity(s.album_norm, p.q),
                            similarity(s.album_compact, p.q_compact),
                            word_similarity(p.q, s.album_norm)
                          ) >= CASE WHEN length(p.q_compact) >= 8 THEN :long_query_similarity ELSE :min_similarity END
                        )
                        OR to_tsvector('simple', s.album_norm) @@ p.tsq
                      )
                    )
                    OR (
                      p.field = 'all'
                      AND to_tsvector(
                          'simple',
                          s.title_norm || ' ' || s.album_norm
                        ) @@ p.tsq
                    )
                    OR (
                      p.field IN ('all', 'title', 'album')
                      AND NOT EXISTS (
                        SELECT 1
                        FROM terms t
                        WHERE NOT (
                          (p.field IN ('all', 'title') AND (s.title_norm LIKE '%' || t.term || '%' OR s.title_compact LIKE '%' || t.term_compact || '%'))
                          OR (p.field IN ('all', 'album') AND (s.album_norm LIKE '%' || t.term || '%' OR s.album_compact LIKE '%' || t.term_compact || '%'))
                        )
                      )
                    )
                  )
                UNION
                SELECT sa.song_id
                FROM song_artists sa
                JOIN (
                    SELECT
                        id,
                        public.noraebox_search_normalize(name) AS name_norm,
                        replace(public.noraebox_search_normalize(name), ' ', '') AS name_compact
                    FROM artist
                ) a ON a.id = sa.artist_id
                CROSS JOIN params p
                WHERE p.q <> ''
                  AND p.field IN ('all', 'artist')
                  AND (
                    a.name_norm LIKE '%' || p.q || '%'
                    OR a.name_compact LIKE '%' || p.q_compact || '%'
                    OR (
                      length(p.q_compact) <= length(a.name_compact) * 1.35
                      AND GREATEST(
                        similarity(a.name_norm, p.q),
                        similarity(a.name_compact, p.q_compact),
                        word_similarity(p.q, a.name_norm)
                      ) >= CASE WHEN length(p.q_compact) >= 8 THEN :long_query_similarity ELSE :min_similarity END
                    )
                    OR (
                      length(p.q_compact) >= 2
                      AND (
                        SELECT string_agg(left(initial_word, 1), '' ORDER BY initial_order)
                        FROM regexp_split_to_table(a.name_norm, ' ') WITH ORDINALITY AS initials(initial_word, initial_order)
                        WHERE initial_word <> ''
                      ) = p.q_compact
                    )
                    OR to_tsvector('simple', a.name_norm) @@ p.tsq
                    OR NOT EXISTS (
                        SELECT 1
                        FROM terms t
                        WHERE NOT (
                          a.name_norm LIKE '%' || t.term || '%'
                          OR a.name_compact LIKE '%' || t.term_compact || '%'
                        )
                    )
                  )
            ),
            artist_rollup AS (
                SELECT
                    sa.song_id,
                    string_agg(DISTINCT public.noraebox_search_normalize(a.name), ' ') AS artist_search_text,
                    string_agg(DISTINCT replace(public.noraebox_search_normalize(a.name), ' ', ''), ' ') AS artist_compact_text,
                    COALESCE(
                        json_agg(
                            DISTINCT jsonb_build_object(
                                'id', a.id,
                                'name', a.name,
                                'role', sa.role
                            )
                        ) FILTER (WHERE a.id IS NOT NULL),
                        '[]'::json
                    ) AS artists
                FROM song_artists sa
                LEFT JOIN artist a ON a.id = sa.artist_id
                GROUP BY sa.song_id
            ),
            scored AS (
                SELECT
                    s.id,
                    s.title,
                    s.album,
                    s.language,
                    s.file_url,
                    s.play_count,
                    COALESCE(ar.artists, '[]'::json) AS artists,
                    public.noraebox_search_normalize(s.title) AS title_norm,
                    public.noraebox_search_normalize(s.album) AS album_norm,
                    COALESCE(ar.artist_search_text, '') AS artist_norm,
                    COALESCE(ar.artist_compact_text, '') AS artist_compact_norm,
                    p.q AS query_norm,
                    (
                        CASE WHEN public.noraebox_search_normalize(s.title) = p.q THEN 1000 ELSE 0 END
                        + CASE WHEN EXISTS (
                            SELECT 1
                            FROM song_artists exact_sa
                            JOIN artist exact_a ON exact_a.id = exact_sa.artist_id
                            WHERE exact_sa.song_id = s.id
                              AND public.noraebox_search_normalize(exact_a.name) = p.q
                          ) THEN 900 ELSE 0 END
                        + CASE WHEN public.noraebox_search_normalize(s.title) LIKE '%' || p.q || '%' THEN 800 ELSE 0 END
                        + CASE WHEN COALESCE(ar.artist_search_text, '') LIKE '%' || p.q || '%' THEN 850 ELSE 0 END
                        + CASE WHEN COALESCE(ar.artist_compact_text, '') LIKE '%' || p.q_compact || '%' THEN 830 ELSE 0 END
                        + CASE WHEN EXISTS (
                            SELECT 1
                            FROM song_artists acronym_sa
                            JOIN artist acronym_a ON acronym_a.id = acronym_sa.artist_id
                            WHERE acronym_sa.song_id = s.id
                              AND (
                                SELECT string_agg(left(initial_word, 1), '' ORDER BY initial_order)
                                FROM regexp_split_to_table(public.noraebox_search_normalize(acronym_a.name), ' ')
                                  WITH ORDINALITY AS initials(initial_word, initial_order)
                                WHERE initial_word <> ''
                              ) = p.q_compact
                          ) THEN 880 ELSE 0 END
                        + CASE WHEN public.noraebox_search_normalize(s.album) LIKE '%' || p.q || '%' THEN 450 ELSE 0 END
                        + GREATEST(similarity(public.noraebox_search_normalize(s.title), p.q), 0) * 300
                        + GREATEST(similarity(COALESCE(ar.artist_search_text, ''), p.q), 0) * 240
                        + GREATEST(similarity(COALESCE(ar.artist_compact_text, ''), p.q_compact), 0) * 220
                        + GREATEST(similarity(public.noraebox_search_normalize(s.album), p.q), 0) * 120
                        + ts_rank_cd(
                            to_tsvector(
                                'simple',
                                public.noraebox_search_normalize(COALESCE(s.title, '') || ' ' || COALESCE(s.album, ''))
                            ),
                            p.tsq
                          ) * 120
                        + (
                            SELECT COUNT(*) * 85
                            FROM terms t
                            WHERE public.noraebox_search_normalize(s.title) LIKE '%' || t.term || '%'
                               OR COALESCE(ar.artist_search_text, '') LIKE '%' || t.term || '%'
                               OR COALESCE(ar.artist_compact_text, '') LIKE '%' || t.term_compact || '%'
                               OR public.noraebox_search_normalize(s.album) LIKE '%' || t.term || '%'
                        )
                    ) AS match_score
                FROM candidate_song_ids c
                JOIN songs s ON s.id = c.id
                CROSS JOIN params p
                LEFT JOIN artist_rollup ar ON ar.song_id = s.id
                WHERE p.language IS NULL
                   OR p.language = 'all'
                   OR public.noraebox_search_normalize(s.language) = p.language
            )
            SELECT
                s.id,
                s.title,
                s.album,
                s.language,
                s.file_url,
                s.play_count,
                s.artists,
                s.match_score
            FROM scored s
            ORDER BY
                s.match_score DESC,
                COALESCE(s.play_count, 0) DESC,
                lower(s.title) ASC
            LIMIT :limit
        """

        rows = db.execute(
            text(query_sql),
            {
                "query": query,
                "field": field,
                "language": language,
                "min_similarity": 0.30,
                "long_query_similarity": 0.45,
                "limit": limit,
            },
        ).fetchall()

        return [_build_song_response(row, signed_urls=False) for row in rows]

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in search_songs: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/suggestions")
def search_suggestions(
    q: str = Query(..., min_length=2, description="Partial or misspelled song, album, artist or singer name"),
    language: str = Query(None, description="Only suggest entities linked to this language"),
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Return database names whose trigram similarity is at least 30%."""
    try:
        query = q.strip()
        if len(query) < 2:
            return []

        query_sql = """
            WITH params AS (
                SELECT
                    public.noraebox_search_normalize(:query) AS q,
                    replace(public.noraebox_search_normalize(:query), ' ', '') AS q_compact,
                    NULLIF(public.noraebox_search_normalize(:language), '') AS language
            ),
            entities AS (
                SELECT s.title AS value, 'song'::text AS type, 3 AS type_priority, MIN(s.id)::text AS entity_id
                FROM songs s
                CROSS JOIN params p
                WHERE NULLIF(btrim(s.title), '') IS NOT NULL
                  AND (p.language IS NULL OR p.language = 'all' OR public.noraebox_search_normalize(s.language) = p.language)
                GROUP BY s.title

                UNION ALL

                SELECT DISTINCT s.album AS value, 'album'::text AS type, 2 AS type_priority, NULL::text AS entity_id
                FROM songs s
                CROSS JOIN params p
                WHERE NULLIF(btrim(s.album), '') IS NOT NULL
                  AND (p.language IS NULL OR p.language = 'all' OR public.noraebox_search_normalize(s.language) = p.language)

                UNION ALL

                SELECT DISTINCT a.name AS value, 'artist'::text AS type, 1 AS type_priority, NULL::text AS entity_id
                FROM artist a
                JOIN song_artists sa ON sa.artist_id = a.id
                JOIN songs s ON s.id = sa.song_id
                CROSS JOIN params p
                WHERE NULLIF(btrim(a.name), '') IS NOT NULL
                  AND (p.language IS NULL OR p.language = 'all' OR public.noraebox_search_normalize(s.language) = p.language)
            ),
            normalized AS (
                SELECT
                    e.value,
                    e.type,
                    e.type_priority,
                    e.entity_id,
                    public.noraebox_search_normalize(e.value) AS value_norm,
                    replace(public.noraebox_search_normalize(e.value), ' ', '') AS value_compact,
                    (
                        SELECT string_agg(left(initial_word, 1), '' ORDER BY initial_order)
                        FROM regexp_split_to_table(public.noraebox_search_normalize(e.value), ' ')
                          WITH ORDINALITY AS initials(initial_word, initial_order)
                        WHERE initial_word <> ''
                    ) AS value_acronym,
                    p.q,
                    p.q_compact
                FROM entities e
                CROSS JOIN params p
                WHERE p.q <> ''
            ),
            scored AS (
                SELECT
                    n.*,
                    GREATEST(
                        CASE WHEN n.value_norm LIKE '%' || n.q || '%' THEN 1.0 ELSE 0.0 END,
                        CASE WHEN length(n.q_compact) >= 2 AND n.value_acronym = n.q_compact THEN 1.0 ELSE 0.0 END,
                        similarity(n.value_norm, n.q),
                        similarity(n.value_compact, n.q_compact),
                        word_similarity(n.q, n.value_norm)
                    ) AS similarity_score
                FROM normalized n
            ),
            deduplicated AS (
                SELECT DISTINCT ON (type, value_norm)
                    value,
                    type,
                    type_priority,
                    entity_id,
                    similarity_score,
                    value_norm,
                    q
                FROM scored
                WHERE similarity_score >= CASE
                    WHEN length(q_compact) >= 8 THEN :long_query_similarity
                    ELSE :min_similarity
                  END
                  AND (
                    (length(q_compact) >= 2 AND value_acronym = q_compact)
                    OR length(q_compact) <= length(value_compact) * 1.35
                  )
                ORDER BY type, value_norm, similarity_score DESC
            )
            SELECT value, type, entity_id, similarity_score
            FROM deduplicated
            ORDER BY
                CASE WHEN value_norm = q THEN 1 ELSE 0 END DESC,
                CASE WHEN value_norm LIKE q || '%' THEN 1 ELSE 0 END DESC,
                similarity_score DESC,
                type_priority DESC,
                lower(value) ASC
            LIMIT :limit
        """

        rows = db.execute(
            text(query_sql),
            {
                "query": query,
                "language": language,
                "min_similarity": 0.30,
                "long_query_similarity": 0.45,
                "limit": limit,
            },
        ).fetchall()

        return [
            {
                "value": row.value,
                "type": row.type,
                "id": row.entity_id,
                "similarity": round(float(row.similarity_score), 3),
            }
            for row in rows
        ]
    except Exception as e:
        print(f"Error in search_suggestions: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggestions", response_model=SongSuggestionResponse)
def create_song_suggestion(body: SongSuggestionCreate, db: Session = Depends(get_db)):
    """Submit a song suggestion when a user can't find a song."""
    try:
        suggestion = SongSuggestion(
            title=body.title.strip(),
            artist=body.artist.strip() if body.artist else None,
            language=body.language.strip() if body.language else None,
            room_id=body.room_id if body.room_id else None,
        )
        db.add(suggestion)
        db.commit()
        db.refresh(suggestion)
        print(f"✅ New song suggestion: '{suggestion.title}' by '{suggestion.artist}' (id={suggestion.id})")
        return suggestion
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating song suggestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions", response_model=List[SongSuggestionResponse])
def list_song_suggestions(
    status: str = Query(None, description="Filter by status: pending, approved, rejected"),
    db: Session = Depends(get_db),
):
    """List all song suggestions (for admin review)."""
    try:
        q = db.query(SongSuggestion).order_by(SongSuggestion.created_at.desc())
        if status:
            q = q.filter(SongSuggestion.status == status)
        return q.all()
    except Exception as e:
        print(f"❌ Error listing song suggestions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/suggestions/{suggestion_id}")
def update_suggestion_status(
    suggestion_id: str,
    status: str = Query(..., description="New status: pending, approved, rejected"),
    db: Session = Depends(get_db),
):
    """Update a song suggestion's status (admin action)."""
    try:
        import uuid as _uuid
        suggestion = db.query(SongSuggestion).filter(
            SongSuggestion.id == _uuid.UUID(suggestion_id)
        ).first()
        if not suggestion:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        if status not in ("pending", "approved", "rejected"):
            raise HTTPException(status_code=400, detail="Status must be pending, approved, or rejected")
        suggestion.status = status
        db.commit()
        return {"id": str(suggestion.id), "status": suggestion.status}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Error updating suggestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.head("/{song_id}/stream")
@router.get("/{song_id}/stream")
def stream_song(song_id: str, request: Request, db: Session = Depends(get_db)):
    """
    Stream karaoke MP4 through the API with correct Content-Type and CORS.
    Use this URL in <video src> instead of raw S3 links (fixes blank browser tab
    when S3 objects are application/octet-stream or bucket CORS is missing).
    """
    try:
        song_id_int = int(song_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid song ID format: {song_id}")

    song = db.query(Song).filter(Song.id == song_id_int).first()
    if not song:
        raise HTTPException(status_code=404, detail=f"Song with ID {song_id_int} not found")
    if not song.file_url:
        raise HTTPException(status_code=404, detail=f"Song {song_id_int} has no file_url")

    full_key = resolve_full_s3_key(song.file_url, language=song.language)
    if not full_key:
        raise HTTPException(status_code=400, detail="Song file is not stored in S3")

    try:
        head = get_streaming_s3_client().head_object(Bucket=S3_BUCKET_NAME, Key=full_key)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        print(f"❌ S3 stream failed for key '{full_key}': {code} {e}")
        if code in ("404", "NoSuchKey"):
            raise HTTPException(status_code=404, detail=f"S3 object not found: {full_key}")
        raise HTTPException(status_code=502, detail=f"S3 stream error: {code}")

    content_type = head.get("ContentType") or "video/mp4"
    if content_type in ("application/octet-stream", "binary/octet-stream"):
        content_type = "video/mp4"

    headers = {
        "Content-Type": content_type,
        "Content-Disposition": "inline",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    if head.get("ContentLength") is not None:
        headers["Content-Length"] = str(head["ContentLength"])
    if head.get("ETag"):
        headers["ETag"] = head["ETag"]

    if request.method == "HEAD":
        return Response(status_code=200, headers=headers)

    range_header = request.headers.get("range")
    try:
        obj = open_s3_object(full_key, range_header=range_header)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        print(f"❌ S3 stream failed for key '{full_key}': {code} {e}")
        if code in ("404", "NoSuchKey"):
            raise HTTPException(status_code=404, detail=f"S3 object not found: {full_key}")
        raise HTTPException(status_code=502, detail=f"S3 stream error: {code}")

    if obj.get("ContentRange"):
        headers["Content-Range"] = obj["ContentRange"]
    status_code = 206 if range_header and obj.get("ContentRange") else 200

    def iter_body():
        for chunk in obj["Body"].iter_chunks(chunk_size=1024 * 512):
            if chunk:
                yield chunk

    return StreamingResponse(
        iter_body(),
        status_code=status_code,
        headers=headers,
        media_type=content_type,
    )


@router.get("/{song_id}", response_model=SongResponse)
def get_song(song_id: str, db: Session = Depends(get_db)):
    """Get song by ID (uses raw SQL to avoid ORM/schema mismatches)"""
    try:
        try:
            song_id_int = int(song_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid song ID format: {song_id}")
        
        # Raw SQL similar to list_songs but filtered by ID
        query_sql = """
            SELECT 
                s.id,
                s.title,
                s.album,
                s.language,
                s.file_url,
                s.play_count,
                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'id', a.id,
                            'name', a.name,
                            'role', sa.role
                        )
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'::json
                ) AS artists
            FROM songs s
            LEFT JOIN song_artists sa ON s.id = sa.song_id
            LEFT JOIN artist a ON sa.artist_id = a.id
            WHERE s.id = :song_id
            GROUP BY 
                s.id,
                s.title,
                s.album,
                s.language,
                s.file_url,
                s.play_count
        """
        
        result = db.execute(text(query_sql), {"song_id": song_id_int})
        row = result.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail=f"Song with ID {song_id_int} not found")
        
        # Parse artists JSON - always ensure it's an array
        if row.artists is None:
            artists_list = []
        elif isinstance(row.artists, list):
            artists_list = row.artists
        elif isinstance(row.artists, str):
            try:
                artists_list = json.loads(row.artists) if row.artists else []
            except:
                artists_list = []
        else:
            artists_list = []
        
        # S3 key comes directly from songs.file_url
        # The file_url should be just the filename (e.g. 'song.mp4'),
        # and the language prefix will be automatically added based on row.language
        s3_key_for_signing = row.file_url or ""
        
        # Use the song's language to determine the S3 prefix (e.g., "Telugu" -> "Telugu/")
        song_language = row.language or None
        
        # Generate signed URL for playback
        signed_url = None
        if s3_key_for_signing:
            try:
                print(f"Generating signed URL for song {song_id_int} (language: {song_language}): {s3_key_for_signing}")
                signed_url = generate_signed_url(s3_key_for_signing, language=song_language)
            except Exception as e:
                print(f"Warning: Failed to generate signed URL for song {song_id_int}: {e}")
                signed_url = s3_key_for_signing
        
        first_artist = artists_list[0] if artists_list else None
        
        song_data = {
            "id": row.id,
            "title": row.title,
            "album": row.album,
            "language": row.language,
            "file_url": signed_url,        # signed/public URL for playback
            "s3_key": s3_key_for_signing,  # original S3 key from DB
            "play_count": int(row.play_count or 0),
            "artists": artists_list,
            "artist": first_artist["name"] if first_artist else None,
            "artist_name": first_artist["name"] if first_artist else None,
            "artist_id": int(first_artist["id"]) if (first_artist and "id" in first_artist and first_artist["id"] is not None) else None,
            "artist_image": None,  # No image column in DB schema
        }
        
        return song_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_song: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{song_id}/signed-url")
def get_song_signed_url(song_id: str, db: Session = Depends(get_db)):
    """Get signed URL for a song - use this when you need to play the song"""
    try:
        try:
            song_id_int = int(song_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid song ID format: {song_id}")
        
        song = db.query(Song).filter(Song.id == song_id_int).first()
        
        if not song:
            raise HTTPException(status_code=404, detail=f"Song with ID {song_id_int} not found")
        
        if not song.file_url:
            raise HTTPException(status_code=404, detail=f"Song {song_id_int} has no file_url")
        
        # Use the song's language to determine the S3 prefix
        song_language = song.language or None
        
        # Generate URL (public or presigned)
        try:
            file_url = generate_signed_url(song.file_url, language=song_language)
            return {"signed_url": file_url, "s3_key": song.file_url, "url": file_url}
        except Exception as e:
            print(f"Error generating URL for song {song_id_int}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate URL: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_song_signed_url: {e}")
        raise HTTPException(status_code=500, detail=str(e))
