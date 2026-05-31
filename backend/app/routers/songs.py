from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import distinct, or_, text
from typing import List
import json
import re
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
    normalized = re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()
    return normalized.split() if normalized else []


def _starts_with_match(candidate: str, query: str) -> bool:
    """Check if candidate starts with query (after normalization).
    'tu' matches 'Tum Hi Ho' but NOT 'Agar Tum Saat Ho'."""
    norm_candidate = re.sub(r"[^a-z0-9]+", " ", str(candidate or "").lower()).strip()
    norm_query = re.sub(r"[^a-z0-9]+", " ", str(query or "").lower()).strip()

    if not norm_query:
        return True
    if not norm_candidate:
        return False

    return norm_candidate.startswith(norm_query)


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
    q: str = Query(..., min_length=1, description="Prefix query"),
    field: str = Query("title", description="Search field: title, artist or album"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Prefix autocomplete search for titles, artists or albums."""
    try:
        query = q.strip()
        if not query:
            return []

        if field not in {"title", "artist", "album"}:
            raise HTTPException(status_code=400, detail="field must be 'title', 'artist' or 'album'")

        # Use starts-with pattern for SQL pre-filter (query% not %query%)
        starts_pattern = f"{query}%"
        if field == "artist":
            where_clause = """
                WHERE LOWER(a.name) LIKE LOWER(:search_pattern)
            """
        elif field == "album":
            where_clause = """
                WHERE LOWER(s.album) LIKE LOWER(:search_pattern)
            """
        else:
            where_clause = """
                WHERE LOWER(s.title) LIKE LOWER(:search_pattern)
            """

        query_sql = f"""
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
            {where_clause}
            GROUP BY 
                s.id,
                s.title,
                s.album,
                s.language,
                s.file_url,
                s.play_count
            ORDER BY s.title
            LIMIT :candidate_limit
        """

        rows = db.execute(
            text(query_sql),
            {
                "search_pattern": starts_pattern,
                "candidate_limit": max(limit * 4, 80),
            },
        ).fetchall()

        matched_songs = []
        for row in rows:
            artists_list = _parse_artists(row.artists)

            if field == "artist":
                candidates = [artist.get("name") for artist in artists_list if isinstance(artist, dict)]
            elif field == "album":
                candidates = [row.album] if row.album else []
            else:
                candidates = [row.title]

            if not any(_starts_with_match(candidate, query) for candidate in candidates if candidate):
                continue

            matched_songs.append(_build_song_response(row, signed_urls=False))
            if len(matched_songs) >= limit:
                break

        return matched_songs

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in search_songs: {e}")
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
        
        # Use the song's language to determine the S3 prefix (e.g., "Telugu" -> "fixed_Telugu/")
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
