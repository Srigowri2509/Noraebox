import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import WEBSITE_API_URL, WEBSITE_TABLET_API_KEY
from app.models import Song, SongArtist
from app.services.song_access_text import normalize_text


def resolve_website_code(code: str) -> dict:
    if not WEBSITE_API_URL or not WEBSITE_TABLET_API_KEY:
        raise HTTPException(status_code=503, detail="Website song-code integration is not configured")
    request = Request(
        f"{WEBSITE_API_URL.rstrip('/')}/api/internal/tablet/song-access/resolve",
        data=json.dumps({"code": code}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {WEBSITE_TABLET_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            payload = {}
        raise HTTPException(status_code=error.code, detail=payload.get("error", "Booking code could not be validated"))
    except (URLError, TimeoutError):
        raise HTTPException(status_code=503, detail="The booking website is temporarily unavailable")


def match_suggestions(db: Session, suggestions: list[dict]) -> list[dict]:
    """Conservative catalogue matching: normalized title must be exact; artist breaks ties."""
    title_keys = {normalize_text(suggestion.get("title")) for suggestion in suggestions}
    title_keys.discard("")
    songs = (
        db.query(Song)
        .options(joinedload(Song.song_artists).joinedload(SongArtist.artist))
        .filter(func.noraebox_search_normalize(Song.title).in_(title_keys))
        .all()
    ) if title_keys else []
    by_title: dict[str, list[Song]] = {}
    for song in songs:
        by_title.setdefault(normalize_text(song.title), []).append(song)

    matches = []
    for suggestion in suggestions:
        title_key = normalize_text(suggestion.get("title"))
        artist_key = normalize_text(suggestion.get("artist"))
        candidates = by_title.get(title_key, [])
        chosen = None
        if len(candidates) == 1:
            chosen = candidates[0]
        elif candidates and artist_key:
            for candidate in candidates:
                artist_names = [normalize_text(link.artist.name) for link in candidate.song_artists if link.artist]
                if any(artist_key == name or artist_key in name or name in artist_key for name in artist_names):
                    chosen = candidate
                    break

        song_payload = None
        if chosen:
            song_payload = {
                "id": chosen.id,
                "title": chosen.title,
                "album": chosen.album,
                "language": chosen.language,
                "artists": [link.artist.name for link in chosen.song_artists if link.artist],
            }
        matches.append({"suggestion": suggestion, "available": bool(chosen), "song": song_payload})
    return matches
