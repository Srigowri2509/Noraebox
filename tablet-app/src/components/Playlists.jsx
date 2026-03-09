import React from "react";

export default function Playlists({ playlists = [], onPlaylistSelect, selectedPlaylistId = null }) {
  if (!playlists || playlists.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sky-300 text-xl">🎵</span>
          <h3 className="text-white font-semibold text-lg">Playlists</h3>
        </div>
        <div className="text-slate-400 py-6 text-center">
          No playlists found.
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sky-300 text-xl">🎵</span>
        <h3 className="text-white font-semibold text-lg">Playlists</h3>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {playlists.map((playlist) => {
          const isSelected = selectedPlaylistId === playlist.id;
          return (
            <div
              key={playlist.id}
              onClick={() => onPlaylistSelect?.(playlist)}
              className={`flex-shrink-0 rounded-lg border bg-slate-800/80 border-slate-600 p-4 cursor-pointer hover:-translate-y-1 transition-transform shadow-md min-w-[200px] ${
                isSelected ? "border-sky-400 shadow-sky-400/20 bg-slate-700/90" : "hover:bg-slate-700/80"
              }`}
            >
              <div className="text-white font-semibold text-base mb-1">
                {playlist.name}
              </div>
              {playlist.song_count !== undefined && (
                <div className="text-slate-400 text-sm">
                  {playlist.song_count} {playlist.song_count === 1 ? 'song' : 'songs'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
