import React from "react";
import { formatSongSubtitle } from "../utils/songFormatting";

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
        <div className="song-row-title" dir="auto">{song.title || "Unknown title"}</div>
        {subtitle ? <div className="song-row-subtitle" dir="auto">{subtitle}</div> : null}
      </div>
      {trailing}
    </div>
  );
}
