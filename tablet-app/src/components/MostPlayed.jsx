import React from "react";
import SongRow from "./SongRow";

export default function MostPlayed({ songs = [], onAddToQueue, onSongSelect }) {
  const handleAddToQueue = onAddToQueue || onSongSelect;
  return (
    <div className="most-played-root">
      <h4 className="mb-3 flex shrink-0 items-center gap-2 text-lg font-semibold text-white md:mb-4 md:gap-2.5 md:text-xl lg:text-2xl">
        <span className="text-xl md:text-2xl">⚡</span>
        Most Played in Studio
      </h4>
      {songs.length === 0 ? (
        <div className="most-played-scroll flex flex-col items-center justify-center px-4 text-center text-base text-slate-400 md:text-xl lg:text-2xl">
          No songs played yet
        </div>
      ) : (
        <div className="most-played-scroll flex flex-col gap-1">
          {songs.map((song, i) => (
            <SongRow
              key={song.id || i}
              song={song}
              onClick={() => handleAddToQueue?.(song)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
