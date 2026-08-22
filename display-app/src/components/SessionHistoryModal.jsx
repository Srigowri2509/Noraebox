import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export default function SessionHistoryModal({ roomId, onClose, finalScreen = false, fallbackSongs = [] }) {
  const [songs, setSongs] = useState([]);
  const [historyType, setHistoryType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      const data = await api(`/rooms/${roomId}/session/history`);
      setSongs(Array.isArray(data?.songs) ? data.songs : []);
      setHistoryType(data?.history_type || "");
      setError("");
    } catch (err) {
      setError(err?.message || "Could not load played songs");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadHistory();
    const timer = window.setInterval(loadHistory, 5000);
    return () => window.clearInterval(timer);
  }, [loadHistory]);

  // Backend started-song history is authoritative. The local started-song
  // cache keeps the final screen useful if the history request is delayed.
  // Older backends returned queued songs from this endpoint. On the final TV
  // screen, accept server data only when it explicitly identifies itself as
  // started-song history; otherwise use the display's local started-song log.
  const displaySongs = finalScreen
    ? (historyType === "started" && songs.length > 0 ? songs : fallbackSongs)
    : (songs.length > 0 ? songs : fallbackSongs);
  const finalColumns = Math.min(6, Math.max(1, Math.ceil(displaySongs.length / 12)));
  const finalRows = Math.max(1, Math.ceil(displaySongs.length / finalColumns));
  const finalItemHeight = Math.min(42, Math.max(28, Math.floor(430 / finalRows)));
  const finalListStyle = finalScreen ? {
    "--history-columns": finalColumns,
    "--history-rows": finalRows,
    "--history-row-height": `${finalItemHeight}px`,
    "--history-title-size": `${Math.min(17, Math.max(9, Math.round(finalItemHeight * 0.3)))}px`,
  } : undefined;

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
        aria-label="Songs selected this session"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="display-modal__header">
          <div>
            <p className="display-modal__eyebrow">{finalScreen ? "Thank you for singing with us" : "Current session"}</p>
            <h2>{finalScreen ? "Your session playlist" : "Songs selected this session"}</h2>
          </div>
          {!finalScreen ? <button type="button" onClick={onClose}>Close</button> : null}
        </div>
        {loading ? <p className="display-modal__message">Loading history...</p> : null}
        {error ? <p className="display-modal__message display-modal__message--error">{error}</p> : null}
        {!loading && !error && displaySongs.length === 0 ? <p className="display-modal__message">No songs were played in this session.</p> : null}
        <ol className="session-history__list" style={finalListStyle}>
          {displaySongs.map((song, index) => (
            <li key={song.event_id || `${song.song_id}-${index}`}>
              <span className="session-history__number">{index + 1}</span>
              <div className="session-history__song">
                <strong>{song.title || "Unknown song"}</strong>
                {!finalScreen ? (
                  <span>{song.artists?.map((artist) => typeof artist === "string" ? artist : artist?.name).filter(Boolean).join(", ") || song.album || "Artist unavailable"}</span>
                ) : null}
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
