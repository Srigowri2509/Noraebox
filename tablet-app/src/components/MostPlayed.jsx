import React from "react";

export default function MostPlayed({ songs = [], onAddToQueue }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <h4 className="text-white font-semibold text-lg mb-6 flex items-center gap-2">
        <span className="text-xl">⚡</span>
        Most Played in Studio
      </h4>
      {songs.length === 0 ? (
        <div className="text-slate-400 text-center py-12" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>No songs played yet</div>
      ) : (
        <div className="space-y-3" style={{ flex: 1, overflowY: "auto" }}>
          {songs.map((song, i) => (
            <div
              key={song.id || i}
              onClick={() => onAddToQueue?.(song)}
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 transition-colors cursor-pointer group mb-2"
            >
              <span className="text-sky-300 text-xl">🎵</span>
              <div className="flex-1">
                <div className="text-white font-medium">
                  {song.title || "Unknown"}
                </div>
                <div className="text-sm text-slate-400">
                  {song.artist_name || "Unknown artist"}
                  {song.album ? ` • ${song.album}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
