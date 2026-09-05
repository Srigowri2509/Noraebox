import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const FILTERS = ["pending", "all", "approved", "rejected"];

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SongSuggestionsPanel() {
  const [suggestions, setSuggestions] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const suffix = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
      const result = await api(`/songs/suggestions${suffix}`);
      setSuggestions(Array.isArray(result) ? result : result?.data || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load song suggestions.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const changeStatus = async (id, status) => {
    setUpdatingId(id);
    setError("");
    try {
      await api(`/songs/suggestions/${id}?status=${encodeURIComponent(status)}`, { method: "PATCH" });
      await loadSuggestions();
    } catch (updateError) {
      setError(updateError.message || "Could not update this suggestion.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="song-suggestions-panel" aria-labelledby="song-suggestions-title">
      <div className="song-suggestions-header">
        <div>
          <h2 id="song-suggestions-title">Song Suggestions</h2>
          <p>Requests submitted from room tablets when a search has no results.</p>
        </div>
        <div className="song-suggestions-controls">
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Suggestion status">
            {FILTERS.map((value) => (
              <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
            ))}
          </select>
          <button type="button" onClick={loadSuggestions} disabled={loading}>Refresh</button>
        </div>
      </div>

      {error ? <p className="song-suggestions-error" role="alert">{error}</p> : null}
      {loading ? <p className="song-suggestions-empty">Loading suggestions…</p> : null}
      {!loading && suggestions.length === 0 ? (
        <p className="song-suggestions-empty">No {filter === "all" ? "" : `${filter} `}song suggestions.</p>
      ) : null}

      {!loading && suggestions.length > 0 ? (
        <div className="song-suggestions-list">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="song-suggestion-card">
              <div className="song-suggestion-card-main">
                <h3>{suggestion.title}</h3>
                <p>
                  {[suggestion.artist, suggestion.language].filter(Boolean).join(" · ") || "No artist or language supplied"}
                </p>
                <time dateTime={suggestion.created_at}>{formatDate(suggestion.created_at)}</time>
              </div>
              <span className={`song-suggestion-status is-${suggestion.status}`}>{suggestion.status}</span>
              {suggestion.status === "pending" ? (
                <div className="song-suggestion-card-actions">
                  <button
                    type="button"
                    onClick={() => changeStatus(suggestion.id, "approved")}
                    disabled={updatingId === suggestion.id}
                    className="is-approve"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => changeStatus(suggestion.id, "rejected")}
                    disabled={updatingId === suggestion.id}
                    className="is-reject"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
