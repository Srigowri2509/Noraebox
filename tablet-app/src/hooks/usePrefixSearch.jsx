import { useEffect, useRef, useState } from "react";
import { getApiBase } from "../api";

const EMPTY = [];

function normalize(value) {
  const source = String(value || "");
  const compatibilityNormalized = typeof source.normalize === "function" ? source.normalize("NFKC") : source;
  return compatibilityNormalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeSearchText(value) {
  const normalized = normalize(value);
  return {
    normalized,
    compact: normalized.replace(/\s+/g, ""),
  };
}

function getArtistNames(song) {
  const names = [];
  if (Array.isArray(song.artists)) {
    song.artists.forEach((artist) => {
      if (artist?.name) names.push(artist.name);
    });
  }
  if (song.artist_name) names.push(song.artist_name);
  if (song.artist) names.push(song.artist);
  return names;
}

function songMatches(song, query, field) {
  const queryText = normalizeSearchText(query);
  if (!queryText.normalized) return true;

  const artists = getArtistNames(song);
  const candidates =
    field === "title"
      ? [song.title]
      : field === "artist"
        ? artists
        : field === "album"
          ? [song.album]
          : [song.title, song.album, ...artists];

  const queryTerms = queryText.normalized.split(/\s+/).filter(Boolean);
  return candidates.some((candidate) => {
    const candidateText = normalizeSearchText(candidate);
    return (
      candidateText.normalized.includes(queryText.normalized) ||
      (queryText.compact && candidateText.compact.includes(queryText.compact)) ||
      queryTerms.every((term) => candidateText.normalized.includes(term) || candidateText.compact.includes(term))
    );
  });
}

export function filterSongs(songs, query, field, language) {
  return (songs || []).filter((song) => {
    const languageMatches =
      !language || language === "all" || normalize(song.language) === normalize(language);
    return languageMatches && songMatches(song, query, field);
  });
}

export default function usePrefixSearch(
  query,
  field = "all",
  enabled = false,
  fallbackSongs = EMPTY,
  language = "all"
) {
  const [results, setResults] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [completedQuery, setCompletedQuery] = useState("");
  const fallbackRef = useRef(fallbackSongs);
  const endpointOk = useRef(true);

  fallbackRef.current = fallbackSongs;

  useEffect(() => {
    const trimmedQuery = (query || "").trim();

    if (!enabled || !trimmedQuery) {
      setResults((prev) => (prev.length === 0 ? prev : EMPTY));
      setLoading(false);
      setCompletedQuery("");
      return undefined;
    }

    setCompletedQuery("");

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (active) setLoading(true);

      if (endpointOk.current) {
        try {
          const params = new URLSearchParams({
            q: trimmedQuery,
            field,
            limit: "100",
          });
          if (language && language !== "all") {
            params.set("language", language);
          }

          const response = await fetch(`${getApiBase()}/songs/search?${params.toString()}`, {
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) {
            const body = await response.text();
            throw new Error(body || `Search failed: ${response.status}`);
          }

          const data = await response.json();
          const endpointResults = Array.isArray(data)
            ? filterSongs(data, trimmedQuery, field, language).slice(0, 100)
            : EMPTY;
          if (active) {
            const fallbackResults =
              endpointResults.length === 0
                ? filterSongs(fallbackRef.current, trimmedQuery, field, language).slice(0, 100)
                : EMPTY;
            setResults(endpointResults.length > 0 ? endpointResults : fallbackResults);
            setLoading(false);
            setCompletedQuery(trimmedQuery);
          }
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          console.warn("Search endpoint unavailable, falling back to local filter:", error.message);
          endpointOk.current = false;
        }
      }

      const songs = fallbackRef.current;
      if (active && songs && songs.length > 0) {
        const filtered = filterSongs(songs, trimmedQuery, field, language);
        setResults(filtered.slice(0, 100));
      } else {
        setResults(EMPTY);
      }

      if (active) {
        setLoading(false);
        setCompletedQuery(trimmedQuery);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, field, language, query]);

  return { results, loading, completedQuery };
}
