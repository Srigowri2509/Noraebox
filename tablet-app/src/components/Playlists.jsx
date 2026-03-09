import React from "react";

export default function Playlists({ playlists = [], onPlaylistSelect, selectedPlaylistId = null }) {
  // Hide scrollbar styles
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .playlists-scroll::-webkit-scrollbar {
        display: none;
      }
      .playlists-scroll {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
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

      <div className="flex gap-3 overflow-x-auto pb-2 playlists-scroll" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
        {playlists.map((playlist) => {
          const isSelected = selectedPlaylistId === playlist.id;
          return (
            <div
              key={playlist.id}
              onClick={() => onPlaylistSelect?.(playlist)}
              className={`flex-shrink-0 rounded-lg border bg-slate-800/80 border-slate-600 p-3 cursor-pointer hover:-translate-y-1 transition-transform shadow-md w-[140px] ${
                isSelected ? "border-sky-400 shadow-sky-400/20" : ""
              }`}
            >
              <div className="aspect-square w-full rounded-lg bg-slate-700/70 flex items-center justify-center mb-2 overflow-hidden object-contain relative">
                {playlist.image_url && playlist.image_url !== "/default-playlist.jpg" ? (
                  <img
                    src={playlist.image_url}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.log(`Failed to load image: ${playlist.image_url}`);
                      e.target.style.display = 'none';
                    }}
                  />
                ) : null}
                {(!playlist.image_url || playlist.image_url === "/default-playlist.jpg") && (
                  <span className="text-4xl text-slate-300">📋</span>
                )}
              </div>
              <div className="text-white font-bold text-sm truncate text-center mb-1">
                {playlist.name}
              </div>
              {playlist.song_count !== undefined && (
                <div className="text-slate-400 text-xs text-center">
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
