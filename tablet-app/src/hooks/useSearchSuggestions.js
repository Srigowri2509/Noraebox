import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "../api";

const MIN_SIMILARITY = 0.45;
const MAX_SUGGESTIONS = 20;

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function editSimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function initials(value) {
  return normalize(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("");
}

function isRelevantSuggestion(suggestion, query) {
  if (!suggestion?.value) return false;

  const queryCompact = normalize(query).replace(/\s+/g, "");
  const candidateCompact = normalize(suggestion.value).replace(/\s+/g, "");
  const acronymMatch = queryCompact.length >= 2 && initials(suggestion.value) === queryCompact;
  const containsQuery = candidateCompact.includes(queryCompact);
  const similarity = Number.isFinite(Number(suggestion.similarity))
    ? Number(suggestion.similarity)
    : editSimilarity(suggestion.value, query);

  return acronymMatch || containsQuery || similarity >= MIN_SIMILARITY;
}

function localSuggestions(songs, query, language) {
  const entities = new Map();
  const add = (value, type, id = null) => {
    const key = type === "song" && id != null ? `${type}:${id}` : `${type}:${normalize(value)}`;
    if (!value || entities.has(key)) return;
    const queryCompact = normalize(query).replace(/\s+/g, "");
    const candidateCompact = normalize(value).replace(/\s+/g, "");
    const acronymMatch = queryCompact.length >= 2 && initials(value) === queryCompact;
    const similarity = acronymMatch ? 1 : editSimilarity(value, query);
    const reasonableLength = queryCompact.length <= candidateCompact.length * 1.35;
    const requiredSimilarity = queryCompact.length >= 8 ? 0.45 : MIN_SIMILARITY;
    if (acronymMatch || (reasonableLength && similarity >= requiredSimilarity)) {
      entities.set(key, { value, type, id, similarity });
    }
  };

  (songs || [])
    .filter((song) => !language || language === "all" || normalize(song.language) === normalize(language))
    .forEach((song) => {
    add(song.title, "song", song.id);
    add(song.album, "album");
    (song.artists || []).forEach((artist) => add(artist?.name, "artist"));
    add(song.artist_name || song.artist, "artist");
  });

  return [...entities.values()]
    .sort((a, b) => b.similarity - a.similarity || a.value.localeCompare(b.value))
    .slice(0, MAX_SUGGESTIONS);
}

export default function useSearchSuggestions(query, songs = [], language = "all") {
  const [remoteResult, setRemoteResult] = useState({ query: "", language: "all", suggestions: [] });
  const [loading, setLoading] = useState(false);
  const trimmedQuery = query.trim();
  const fallback = useMemo(
    () => (trimmedQuery.length >= 2 ? localSuggestions(songs, trimmedQuery, language) : []),
    [language, songs, trimmedQuery]
  );

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: trimmedQuery, limit: String(MAX_SUGGESTIONS) });
        if (language && language !== "all") params.set("language", language);
        const response = await fetch(`${getApiBase()}/songs/search/suggestions?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Suggestion search failed: ${response.status}`);
        const data = await response.json();
        setRemoteResult({
          query: trimmedQuery,
          language,
          suggestions: Array.isArray(data)
            ? data.filter((suggestion) => isRelevantSuggestion(suggestion, trimmedQuery))
            : [],
        });
      } catch {
        if (!controller.signal.aborted) {
          setRemoteResult({ query: trimmedQuery, language, suggestions: [] });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [language, trimmedQuery]);

  const remoteSuggestions =
    remoteResult.query === trimmedQuery && remoteResult.language === language
      ? remoteResult.suggestions
      : [];

  return {
    suggestions: remoteSuggestions.length > 0 ? remoteSuggestions : fallback,
    loading,
  };
}
