import React from "react";

export default function MostPlayed({ songs = [], onAddToQueue, onSongSelect }) {
  // Support both onAddToQueue and onSongSelect for compatibility
  const handleAddToQueue = onAddToQueue || onSongSelect;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <h4 className="text-white font-semibold text-lg mb-6 flex items-center gap-2">
        <span className="text-xl">⚡</span>
        Most Played in Studio
      </h4>
      {songs.length === 0 ? (
        <div className="text-slate-400 text-center py-12" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>No songs played yet</div>
      ) : (
        <div className="space-y-3 most-played-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`
            .most-played-scroll::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {songs.map((song, i) => (
            <div
              key={song.id || i}
              onClick={() => handleAddToQueue?.(song)}
              className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 transition-all cursor-pointer group"
            >
              <div className="w-14 h-14 rounded-lg bg-slate-700/70 flex items-center justify-center shrink-0">
                <span className="text-2xl">🎵</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium text-base truncate mb-1">
                  {song.title || "Unknown"}
                </div>
                <div className="text-slate-400 text-sm truncate">
                  {song.artist_name || song.artist || "Unknown artist"}
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
