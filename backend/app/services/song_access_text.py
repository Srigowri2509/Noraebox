import unicodedata


SONG_ACCESS_RESOLVE_PATH = "/api/internal/tablet/song-access/resolve"


def normalize_text(value: str) -> str:
    source = unicodedata.normalize("NFKD", str(value or "")).casefold()
    output = []
    previous_base_is_latin = False
    for char in source:
        if unicodedata.category(char).startswith("M"):
            if not previous_base_is_latin:
                output.append(char)
        elif char.isalnum():
            output.append(char)
            previous_base_is_latin = "LATIN" in unicodedata.name(char, "")
        else:
            output.append(" ")
            previous_base_is_latin = False
    return " ".join("".join(output).split())


def resolve_url_candidates(base_url: str) -> list[str]:
    """Support website API bases configured with or without a trailing /api."""
    base = str(base_url or "").strip().rstrip("/")
    if not base:
        return []
    if base.lower().endswith("/api"):
        candidates = [
            f"{base}/internal/tablet/song-access/resolve",
            f"{base[:-4]}{SONG_ACCESS_RESOLVE_PATH}",
        ]
    else:
        candidates = [
            f"{base}{SONG_ACCESS_RESOLVE_PATH}",
            f"{base}/internal/tablet/song-access/resolve",
        ]
    return list(dict.fromkeys(candidates))


def is_generic_route_not_found(status: int, message: str) -> bool:
    """Distinguish a missing HTTP route from a resolver's invalid-code response."""
    if status != 404:
        return False
    normalized = " ".join(str(message or "").strip().casefold().rstrip(".").split())
    return normalized in {"", "not found", "route not found", "page not found"}


def is_confident_typo_match(score: float, requested_artist: str, candidate_artists: list[str]) -> bool:
    """Accept small title typos only when the artist corroborates the match.

    A very high title score can stand alone, while a lower score requires an
    exact/contained normalized artist match. This keeps booking imports from
    silently selecting a similarly named song by somebody else.
    """
    if score >= 0.90:
        return True
    artist_key = normalize_text(requested_artist)
    if score < 0.65 or not artist_key:
        return False
    normalized_candidates = [normalize_text(name) for name in candidate_artists]
    return any(
        artist_key == name or artist_key in name or name in artist_key
        for name in normalized_candidates
        if name
    )
