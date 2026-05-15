import React from "react";

const DEFAULT_TILE = "/default-cover.jpg";

function firstPlaylistCover(previewImages, fallbackUrl) {
  for (const u of previewImages || []) {
    if (!u || typeof u !== "string") continue;
    const t = u.trim();
    if (t && t !== "/default-playlist.jpg") return t;
  }
  if (fallbackUrl && String(fallbackUrl).trim()) {
    const t = String(fallbackUrl).trim();
    if (t && t !== "/default-playlist.jpg") return t;
  }
  return null;
}

export default function Playlists({ playlists = [], onPlaylistSelect, selectedPlaylistId = null }) {
  React.useEffect(() => {
    const style = document.createElement("style");
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
        <div className="py-6 text-center text-base text-slate-400 md:text-lg" style={{ flex: 1 }}>
          No playlists found.
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        className="playlists-scroll flex min-h-0 items-stretch gap-3 overflow-x-auto pb-2 md:gap-4"
        style={{
          flex: 1,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
        }}
      >
        {playlists.map((playlist) => {
          const isSelected = selectedPlaylistId === playlist.id;
          const imageSrc =
            typeof playlist.image_url === "string" ? playlist.image_url.trim() : "";
          const hasLegacyImage = imageSrc.length > 0 && imageSrc !== "/default-playlist.jpg";
          const previewImages = Array.isArray(playlist.preview_images)
            ? playlist.preview_images
            : [];
          const fallbackUrl = hasLegacyImage ? imageSrc : null;
          const cover = firstPlaylistCover(previewImages, fallbackUrl);

          return (
            <div
              key={playlist.id}
              onClick={() => onPlaylistSelect?.(playlist)}
              className={`flex aspect-square w-[148px] shrink-0 cursor-pointer flex-col rounded-2xl border bg-slate-900/75 p-2.5 shadow-lg transition-transform hover:-translate-y-0.5 sm:w-[160px] md:w-[172px] lg:w-[188px] ${
                isSelected
                  ? "border-sky-400/90 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_12px_28px_rgba(0,0,0,0.45)]"
                  : "border-white/[0.08] hover:border-white/15"
              }`}
            >
              <div className="relative mb-2 min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-slate-900/90">
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = DEFAULT_TILE;
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl text-slate-400 md:text-5xl">
                    📋
                  </div>
                )}
              </div>
              <div className="truncate px-0.5 text-center text-xs font-bold leading-tight text-white sm:text-sm md:text-base">
                {playlist.name}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
