import React from "react";

export function formatSongSubtitle(song = {}) {
  let artists = [];
  if (Array.isArray(song.artists)) {
    artists = song.artists;
  } else if (typeof song.artists === "string") {
    try {
      const parsed = JSON.parse(song.artists);
      artists = Array.isArray(parsed) ? parsed : [];
    } catch {
      artists = [];
    }
  }

  const singers = artists
    .filter((a) => a.role === "singer")
    .map((a) => a.name)
    .join(", ");
  const composers = artists
    .filter((a) => a.role === "composer")
    .map((a) => a.name)
    .join(", ");
  const main = singers || composers || song.artist_name || song.artist || "";
  return `${main}${song.album ? ` • ${song.album}` : ""}`;
}

export default function SongRow({
  song = {},
  onClick,
  trailing = null,
  leading = null,
  className = "",
  interactive = true,
}) {
  const subtitle = formatSongSubtitle(song);

  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`song-row ${interactive ? "song-row-interactive" : ""} ${className}`.trim()}
    >
      {leading}
      <div className="song-row-icon" aria-hidden>
        <span>🎵</span>
      </div>
      <div className="song-row-body">
        <div className="song-row-title">{song.title || "Unknown title"}</div>
        {subtitle ? <div className="song-row-subtitle">{subtitle}</div> : null}
      </div>
      {trailing}
    </div>
  );
}
