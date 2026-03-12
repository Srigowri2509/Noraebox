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
      <section style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="text-slate-400 py-6 text-center" style={{ flex: 1 }}>
          No playlists found.
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        className="flex gap-3 items-stretch overflow-x-auto pb-2 playlists-scroll"
        style={{
          flex: 1,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          minHeight: 0,
          touchAction: 'pan-x',
        }}
      >
        {playlists.map((playlist) => {
          const isSelected = selectedPlaylistId === playlist.id;
          const imageSrc = typeof playlist.image_url === "string" ? playlist.image_url.trim() : "";
          const hasImage = imageSrc.length > 0 && imageSrc !== "/default-playlist.jpg";
          return (
            <div
              key={playlist.id}
              onClick={() => onPlaylistSelect?.(playlist)}
              className={`flex-shrink-0 flex flex-col rounded-lg border bg-slate-800/80 border-slate-600 p-2.5 cursor-pointer hover:-translate-y-1 transition-transform shadow-md w-[132px] sm:w-[144px] aspect-square ${
                isSelected ? "border-sky-400 shadow-sky-400/20" : ""
              }`}
            >
              <div className="w-full flex-1 min-h-0 rounded-lg bg-slate-700/70 flex items-center justify-center mb-1.5 overflow-hidden object-contain relative">
                {hasImage ? (
                  <img
                    src={imageSrc}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.log(`Failed to load image: ${imageSrc}`);
                      e.target.style.display = 'none';
                    }}
                  />
                ) : null}
                {!hasImage && (
                  <span className="text-3xl text-slate-300">📋</span>
                )}
              </div>
              <div className="text-white font-bold text-xs sm:text-sm truncate text-center">
                {playlist.name}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
