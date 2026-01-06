import React from "react";

export default function SongCard({ song = {}, onQueue }) {
  return (
    <div 
      onClick={() => onQueue?.(song)}
      className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/60 border-2 border-slate-500 hover:bg-slate-700/60 transition-all cursor-pointer hover:border-slate-400"
      style={{ marginTop: '8px', marginBottom: '8px' }}
    >
      <div className="w-14 h-14 rounded-lg bg-slate-700/70 flex items-center justify-center flex-shrink-0">
        <span className="text-2xl">🎵</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium text-base truncate mb-1">{song.title || "Unknown title"}</div>
        <div className="text-slate-300 text-sm truncate">
          {song.artist_name || song.artist || ""}
          {song.album ? ` • ${song.album}` : ""}
        </div>
      </div>
    </div>
  );
}
