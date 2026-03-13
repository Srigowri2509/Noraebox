import { useEffect, useState } from "react";
import { api } from "../api";

export default function usePrefixSearch(query, field = "title", enabled = false) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

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
      try {
        const res = await api(
          `/songs/search?q=${encodeURIComponent(trimmedQuery)}&field=${encodeURIComponent(field)}&limit=50`
        );
        if (active) {
          setResults(Array.isArray(res) ? res : []);
        }
      } catch (error) {
        console.error("Prefix search failed:", error);
        if (active) {
          setResults([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, field, query]);

  return { results, loading };
}
