import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../api";

/**
 * Live prefix-search hook that calls GET /songs/search on the backend.
 *
 * If the backend endpoint is unavailable (e.g. not restarted yet), the hook
 * automatically falls back to filtering the full song list supplied via
 * `fallbackSongs`.  This means the app never shows an error to the user —
 * it just degrades to local search until the endpoint is deployed.
 */

const EMPTY = []; // stable empty array to avoid re-render loops

export default function usePrefixSearch(query, field = "title", enabled = false, fallbackSongs = EMPTY) {
  const [results, setResults] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  // Store fallbackSongs in a ref so it never triggers effect re-runs
  const fallbackRef = useRef(fallbackSongs);
  fallbackRef.current = fallbackSongs;

  // Track whether the backend endpoint is available
  const endpointOk = useRef(true);

  useEffect(() => {
    const trimmedQuery = (query || "").trim();

    if (!enabled || !trimmedQuery) {
      // Use stable EMPTY reference so React skips the re-render when already empty
      setResults(prev => (prev.length === 0 ? prev : EMPTY));
      setLoading(false);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      if (active) setLoading(true);

      // ── Try backend first ──
      if (endpointOk.current) {
        try {
          const res = await api(
            `/songs/search?q=${encodeURIComponent(trimmedQuery)}&field=${encodeURIComponent(field)}&limit=50`
          );
          if (active) {
            setResults(Array.isArray(res) ? res : EMPTY);
            setLoading(false);
          }
          return; // success — done
        } catch (error) {
          console.warn("Prefix search endpoint unavailable, falling back to local filter:", error.message);
          endpointOk.current = false; // stop trying until next mount
        }
      }

      // ── Fallback: filter locally using ref (no dependency) ──
      const songs = fallbackRef.current;
      if (active && songs && songs.length > 0) {
        const normalize = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        // Strict starts-with: "tu" matches "Tum Hi Ho" but NOT "Agar Tum Saat Ho"
        const startsWithMatch = (candidate, q) => {
          const nc = normalize(candidate);
          const nq = normalize(q);
          if (!nq) return true;
          if (!nc) return false;
          return nc.startsWith(nq);
        };

        const filtered = songs.filter(song => {
          if (field === "title") return startsWithMatch(song.title, trimmedQuery);
          if (field === "album") return startsWithMatch(song.album, trimmedQuery);
          if (field === "artist") {
            const names = [];
            if (Array.isArray(song.artists)) {
              song.artists.forEach(a => { if (a?.name) names.push(a.name); });
            }
            if (song.artist_name) names.push(song.artist_name);
            if (song.artist) names.push(song.artist);
            return names.some(n => startsWithMatch(n, trimmedQuery));
          }
          return false;
        });
        setResults(filtered.slice(0, 50));
      } else {
        setResults(EMPTY);
      }

      if (active) setLoading(false);
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, field, query]); // NO fallbackSongs — accessed via ref

  return { results, loading };
}
