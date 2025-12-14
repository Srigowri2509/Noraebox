import React from "react";

export default function ArtistSongs({ songs = [], onAddToQueue }) {
  if (songs.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {songs.map((song) => (
        <div
          key={song.id || song.title}
          onClick={() => onAddToQueue?.(song)}
          className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer group"
        >
          <span className="text-sky-300 text-xl">🎵</span>
          <div className="flex-1">
            <div className="text-white font-medium">{song.title || "Unknown"}</div>
            <div className="text-sm text-slate-400">
              {song.album && `${song.album} • `}
              {song.play_count || 0} plays
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

