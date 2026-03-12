import React from "react";

export default function SongCard({ song = {}, onQueue }) {
  return (
    <div 
      onClick={() => onQueue?.(song)}
      className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-500 hover:bg-slate-700/60 transition-all cursor-pointer hover:border-slate-400"
      style={{ marginTop: '6px', marginBottom: '6px' }}
    >
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-700/70 flex items-center justify-center flex-shrink-0">
        <span className="text-xl">🎵</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium text-sm sm:text-base truncate mb-0.5">{song.title || "Unknown title"}</div>
        <div className="text-slate-300 text-xs sm:text-sm truncate">
          {(() => {
            const singers = (song.artists || [])
              .filter(a => a.role === "singer")
              .map(a => a.name)
              .join(", ");

            const composers = (song.artists || [])
              .filter(a => a.role === "composer")
              .map(a => a.name)
              .join(", ");

            return `${singers || composers || song.artist_name || song.artist || ""}${song.album ? ` • ${song.album}` : ""}`;
          })()}
        </div>
      </div>
    </div>
  );
}
