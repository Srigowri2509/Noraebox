import { useMemo, useState } from "react";
import { api } from "../api";
import SearchResults from "./SearchResults";

export default function BookingSongCodePanel({ roomId, onImported }) {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const normalizedCode = code.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
  const available = useMemo(
    () => (preview?.matches || []).filter((match) => match.available),
    [preview],
  );
  const availableSongs = useMemo(
    () => available.map((match) => ({
      ...match.song,
      artists: (match.song.artists || []).map((artist) =>
        typeof artist === "string" ? { name: artist, role: "singer" } : artist,
      ),
    })),
    [available],
  );

  async function lookUp(event) {
    event.preventDefault();
    if (normalizedCode.length !== 6) {
      setError("Enter the six-character code from your booking.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/song-access/preview", {
        method: "POST",
        body: JSON.stringify({ code: normalizedCode }),
      });
      setPreview(result);
    } catch (lookupError) {
      setPreview(null);
      setError(lookupError.message || "Could not load this playlist code.");
    } finally {
      setBusy(false);
    }
  }

  async function addSong(song) {
    if (busy) return;
    if (!roomId) {
      setError("Connect this tablet to a room first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/song-access/import", {
        method: "POST",
        body: JSON.stringify({ code: normalizedCode, room_id: roomId, song_ids: [song.id] }),
      });
      await onImported?.(result);
      const addedCount = result.added?.length || 0;
      if (!addedCount && !(result.skipped?.length || 0)) {
        setError(`${song.title} could not be added to the queue.`);
      }
    } catch (importError) {
      setError(importError.message || "Could not add this song to the queue.");
    } finally {
      setBusy(false);
    }
  }

  async function addAllSongs() {
    if (busy || !availableSongs.length) return;
    if (!roomId) {
      setError("Connect this tablet to a room first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/song-access/import", {
        method: "POST",
        body: JSON.stringify({
          code: normalizedCode,
          room_id: roomId,
          song_ids: availableSongs.map((song) => song.id),
        }),
      });
      await onImported?.(result);
      if (!(result.added?.length || 0) && !(result.skipped?.length || 0)) {
        setError("The songs could not be added to the queue.");
      }
    } catch (importError) {
      setError(importError.message || "Could not add these songs to the queue.");
    } finally {
      setBusy(false);
    }
  }

  function clearPlaylist() {
    setCode("");
    setPreview(null);
    setError("");
  }

  if (preview) {
    return (
      <section className="booking-code-loaded-results" aria-label="Songs from your booking">
        <div className="mb-0 flex min-h-[36px] shrink-0 flex-wrap items-center justify-start gap-3 rounded-lg border border-blue-500/40 bg-gradient-to-r from-slate-950/95 via-[#0f172a]/95 to-blue-950/70 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:min-h-[38px] md:gap-4 md:px-3.5 md:py-1.5">
          <div className="flex min-w-0 items-center">
            <span className="min-w-0 text-sm font-semibold leading-tight text-white md:text-base">
              Showing playlist: <span className="text-sky-200">Your Requested Songs</span>
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:gap-2.5">
            <button
              type="button"
              onClick={addAllSongs}
              disabled={busy || !availableSongs.length}
              className="rounded-xl bg-sky-500 px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 md:px-3.5 md:text-[11px]"
            >
              {busy ? "Adding…" : "Add All to Queue"}
            </button>
            <button
              type="button"
              onClick={clearPlaylist}
              disabled={busy}
              className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 md:text-xs"
            >
              Clear
            </button>
          </div>
        </div>
        {error ? <p className="booking-code-error" role="alert">{error}</p> : null}
        <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden md:mt-2">
          <SearchResults
            songs={availableSongs}
            onAddToQueue={addSong}
            loading={false}
            hideHeader
          />
        </div>
      </section>
    );
  }

  return (
    <section className="booking-code-inline" aria-labelledby="booking-song-code-title">
      <div className="booking-code-inline-heading">
        <div className="booking-code-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M9.75 13.5a4.75 4.75 0 1 1 3.36 3.36L11 19H8.5v2H5v-3.5l4.75-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="14.5" cy="9.5" r="1.25" fill="currentColor" />
          </svg>
        </div>
        <div>
          <h2 id="booking-song-code-title" className="booking-code-inline-title">Type your playlist code here</h2>
          <p className="booking-code-inline-subtitle">Load the songs you selected when you booked.</p>
        </div>
      </div>

      <div className="booking-code-body">
        <form onSubmit={lookUp} className="booking-code-form">
          <label className="booking-code-field">
            <span className="booking-code-input-wrap">
              <span className="booking-code-input-icon" aria-hidden>#</span>
              <input
                value={normalizedCode}
                onChange={(event) => setCode(event.target.value)}
                inputMode="text"
                autoComplete="off"
                spellCheck="false"
                maxLength={6}
                placeholder="ABC234"
                aria-label="Six-character playlist code"
                aria-describedby="playlist-code-hint"
                className="booking-code-input"
              />
              <span className="booking-code-progress" aria-hidden>{normalizedCode.length}/6</span>
            </span>
            <span id="playlist-code-hint" className="booking-code-hint">Enter the six-character code from your booking</span>
          </label>
          <button type="submit" disabled={busy || normalizedCode.length !== 6} className="booking-code-submit">
            <span>{busy && !preview ? "Checking…" : "Load playlist"}</span>
            {!busy ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </button>
        </form>

        {error ? <p className="booking-code-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
