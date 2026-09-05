import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import WEBSITE_API_URL, WEBSITE_TABLET_API_KEY
from app.models import Song, SongArtist
from app.services.song_access_text import (
    is_confident_typo_match,
    is_generic_route_not_found,
    normalize_text,
    resolve_url_candidates,
)


def resolve_website_code(code: str) -> dict:
    if not WEBSITE_API_URL or not WEBSITE_TABLET_API_KEY:
        raise HTTPException(status_code=503, detail="Website song-code integration is not configured")
    urls = resolve_url_candidates(WEBSITE_API_URL)
    for index, url in enumerate(urls):
        request = Request(
            url,
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
                raw_body = error.read().decode("utf-8")
            except UnicodeDecodeError:
                raw_body = ""
            try:
                payload = json.loads(raw_body)
            except ValueError:
                payload = {}
            message = payload.get("error") or payload.get("detail") or raw_body.strip()
            if index < len(urls) - 1 and is_generic_route_not_found(error.code, message):
                continue
            detail = message or "Booking code could not be validated"
            raise HTTPException(status_code=error.code, detail=detail)
        except (URLError, TimeoutError):
            raise HTTPException(status_code=503, detail="The booking website is temporarily unavailable")

    raise HTTPException(status_code=502, detail="The booking website song-code endpoint was not found")


def match_suggestions(db: Session, suggestions: list[dict]) -> list[dict]:
    """Conservative catalogue matching with an artist-backed typo fallback."""
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

        if chosen is None and title_key:
            similarity = func.similarity(func.noraebox_search_normalize(Song.title), title_key)
            fuzzy_candidates = (
                db.query(Song, similarity.label("title_similarity"))
                .options(joinedload(Song.song_artists).joinedload(SongArtist.artist))
                .filter(similarity >= 0.65)
                .order_by(similarity.desc(), Song.play_count.desc())
                .limit(5)
                .all()
            )
            for candidate, score in fuzzy_candidates:
                artist_names = [link.artist.name for link in candidate.song_artists if link.artist]
                if is_confident_typo_match(float(score), suggestion.get("artist"), artist_names):
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
