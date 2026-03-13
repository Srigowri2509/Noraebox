import { useEffect, useState, useRef } from "react";
import { api } from "../api";

/**
 * Live prefix-search hook that calls GET /songs/search on the backend.
 *
 * If the backend endpoint is unavailable (e.g. not restarted yet), the hook
 * automatically falls back to filtering the full song list supplied via
 * `fallbackSongs`.  This means the app never shows an error to the user —
 * it just degrades to local search until the endpoint is deployed.
 */
export default function usePrefixSearch(query, field = "title", enabled = false, fallbackSongs = []) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  // Track whether the backend endpoint is available
  const endpointOk = useRef(true);

  useEffect(() => {
    const trimmedQuery = (query || "").trim();

    if (!enabled || !trimmedQuery) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);

      // ── Try backend first ──
      if (endpointOk.current) {
        try {
          const res = await api(
            `/songs/search?q=${encodeURIComponent(trimmedQuery)}&field=${encodeURIComponent(field)}&limit=50`
          );
          if (active) {
            setResults(Array.isArray(res) ? res : []);
            setLoading(false);
          }
          return; // success — done
        } catch (error) {
          console.warn("Prefix search endpoint unavailable, falling back to local filter:", error.message);
          endpointOk.current = false; // stop trying until next mount
        }
      }

      // ── Fallback: filter locally ──
      if (active && fallbackSongs && fallbackSongs.length > 0) {
        const lq = trimmedQuery.toLowerCase();
        const normalize = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const words = (v) => normalize(v).split(/\s+/).filter(Boolean);
        const prefixMatch = (candidate, q) => {
          const cw = words(candidate);
          const qw = words(q);
          if (!qw.length) return true;
          if (!cw.length) return false;
          return qw.every(qt => cw.some(ct => ct.startsWith(qt)));
        };

        const filtered = fallbackSongs.filter(song => {
          if (field === "title") return prefixMatch(song.title, lq);
          if (field === "album") return prefixMatch(song.album, lq);
          if (field === "artist") {
            const names = [];
            if (Array.isArray(song.artists)) {
              song.artists.forEach(a => { if (a?.name) names.push(a.name); });
            }
            if (song.artist_name) names.push(song.artist_name);
            if (song.artist) names.push(song.artist);
            return names.some(n => prefixMatch(n, lq));
          }
          return false;
        });
        setResults(filtered.slice(0, 50));
      } else {
        setResults([]);
      }

      if (active) setLoading(false);
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, fallbackSongs, field, query]);

  return { results, loading };
}
