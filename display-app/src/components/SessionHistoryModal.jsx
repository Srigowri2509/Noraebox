import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export default function SessionHistoryModal({ roomId, onClose, finalScreen = false, playedSongs }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const hasLocalHistory = Array.isArray(playedSongs);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api(`/rooms/${roomId}/session/history`);
      setSongs(Array.isArray(data?.songs) ? data.songs : []);
      setError("");
    } catch (err) {
      setError(err?.message || "Could not load played songs");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (hasLocalHistory) {
      setLoading(false);
      setError("");
      return undefined;
    }
    loadHistory();
    const timer = window.setInterval(loadHistory, 5000);
    return () => window.clearInterval(timer);
  }, [hasLocalHistory, loadHistory]);

  const displaySongs = hasLocalHistory ? playedSongs : songs;

  return (
    <div
      className={finalScreen ? "display-modal-backdrop display-modal-backdrop--final-history" : "display-modal-backdrop"}
      role="presentation"
      onClick={finalScreen ? undefined : onClose}
      style={finalScreen ? {
        backgroundImage: 'linear-gradient(rgba(3, 1, 10, 0.74), rgba(3, 1, 10, 0.92)), url("./logo_noraebox.png")',
      } : undefined}
    >
      <section
        className={finalScreen ? "display-modal session-history session-history--final" : "display-modal session-history"}
        role="dialog"
        aria-modal="true"
        aria-label="Songs played this session"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="display-modal__header">
          <div>
            <p className="display-modal__eyebrow">{finalScreen ? "Thank you for singing with us" : "Current session"}</p>
            <h2>{finalScreen ? "Your session playlist" : "Songs played this session"}</h2>
          </div>
          {!finalScreen ? <button type="button" onClick={onClose}>Close</button> : null}
        </div>
        {loading ? <p className="display-modal__message">Loading history...</p> : null}
        {error ? <p className="display-modal__message display-modal__message--error">{error}</p> : null}
        {!loading && !error && displaySongs.length === 0 ? <p className="display-modal__message">No songs have played in this session yet.</p> : null}
        <ol className="session-history__list">
          {displaySongs.map((song, index) => (
            <li key={song.event_id || `${song.song_id}-${index}`}>
              <span className="session-history__number">{index + 1}</span>
              <div>
                <strong>{song.title || "Unknown song"}</strong>
                <span>{song.artists?.map((artist) => typeof artist === "string" ? artist : artist?.name).filter(Boolean).join(", ") || song.album || "Artist unavailable"}</span>
              </div>
              {!finalScreen ? (
                <time>{song.played_at ? new Date(song.played_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
