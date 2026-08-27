import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function BookingSongCodeModal({ open, roomId, onClose, onImported }) {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setCode("");
      setPreview(null);
      setSelected(new Set());
      setError("");
      setBusy(false);
    }
  }, [open]);

  const available = useMemo(
    () => (preview?.matches || []).filter((match) => match.available),
    [preview],
  );

  if (!open) return null;

  const normalizedCode = code.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);

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
      setSelected(new Set((result.matches || []).filter((match) => match.available).map((match) => match.song.id)));
    } catch (lookupError) {
      setPreview(null);
      setSelected(new Set());
      setError(lookupError.message || "Could not load this booking song list.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSong(songId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }

  async function addSelected() {
    if (!roomId) {
      setError("Connect this tablet to a room first.");
      return;
    }
    if (!selected.size) {
      setError("Select at least one available song.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/song-access/import", {
        method: "POST",
        body: JSON.stringify({ code: normalizedCode, room_id: roomId, song_ids: [...selected] }),
      });
      await onImported?.(result);
      const skippedCount = result.skipped?.length || 0;
      window.alert(`${result.added?.length || 0} song(s) added to the queue${skippedCount ? `; ${skippedCount} skipped` : ""}.`);
      onClose();
    } catch (importError) {
      setError(importError.message || "Could not add these songs to the queue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="booking-song-code-title">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-purple-400/35 bg-[#101522] shadow-2xl shadow-purple-950/60">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-300">Your requested songs</p>
            <h2 id="booking-song-code-title" className="mt-1 text-2xl font-bold text-white">Use booking code</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-3 py-1.5 text-xl text-slate-300 hover:bg-white/10" aria-label="Close">×</button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <form onSubmit={lookUp} className="flex flex-col gap-3 sm:flex-row">
            <input
              autoFocus
              value={normalizedCode}
              onChange={(event) => setCode(event.target.value)}
              inputMode="text"
              autoComplete="off"
              spellCheck="false"
              maxLength={6}
              placeholder="ABC234"
              aria-label="Six-character booking code"
              className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/35 px-5 py-4 font-mono text-2xl font-black uppercase tracking-[0.25em] text-white outline-none placeholder:text-slate-600 focus:border-purple-400"
            />
            <button type="submit" disabled={busy || normalizedCode.length !== 6} className="rounded-2xl bg-purple-600 px-7 py-4 font-bold text-white hover:bg-purple-500 disabled:opacity-45">{busy && !preview ? "Checking…" : "Find songs"}</button>
          </form>

          {error ? <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</p> : null}

          {preview ? (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
                <span>{preview.available_count} available · {preview.unavailable_count} unavailable</span>
                {preview.booking_ref ? <span className="text-slate-500">Booking {preview.booking_ref}</span> : null}
              </div>
              <div className="space-y-2">
                {(preview.matches || []).map((match) => (
                  <label key={match.suggestion.id} className={`flex items-center gap-4 rounded-2xl border p-4 ${match.available ? "cursor-pointer border-white/10 bg-white/[0.04]" : "border-white/5 bg-black/20 opacity-55"}`}>
                    <input type="checkbox" disabled={!match.available} checked={Boolean(match.available && selected.has(match.song.id))} onChange={() => match.available && toggleSong(match.song.id)} className="h-5 w-5 accent-purple-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{match.available ? match.song.title : match.suggestion.title}</p>
                      <p className="truncate text-sm text-slate-400">{match.available ? (match.song.artists?.join(", ") || match.suggestion.artist) : match.suggestion.artist}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-bold uppercase tracking-wide ${match.available ? "text-emerald-300" : "text-amber-300"}`}>{match.available ? "Available" : "Not in catalogue"}</span>
                  </label>
                ))}
              </div>
              {!preview.matches?.length ? <p className="rounded-xl bg-white/5 p-4 text-slate-400">No songs were attached to this booking.</p> : null}
            </div>
          ) : null}
        </div>

        {preview ? (
          <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-3 text-slate-300 hover:bg-white/10">Cancel</button>
            <button type="button" onClick={addSelected} disabled={busy || !available.length || !selected.size} className="rounded-xl bg-sky-500 px-6 py-3 font-bold text-white hover:bg-sky-400 disabled:opacity-45">{busy ? "Adding…" : `Add ${selected.size} to queue`}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
