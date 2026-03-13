import React, { useEffect, useMemo, useState } from "react";
import SongCard from "./SongCard";

export default function SearchResults({ songs = [], results = [], onAddToQueue, onQueue, loading }) {
  // Support both 'songs' and 'results' props for backward compatibility
  const songList = songs || results;
  const [visibleCount, setVisibleCount] = useState(60);

  // ALL hooks MUST come before any conditional returns (Rules of Hooks)
  const visibleSongs = useMemo(
    () => (songList ? songList.slice(0, visibleCount) : []),
    [songList, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(60);
  }, [songList]);

  const handleQueue = onAddToQueue || onQueue;

  const handleScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 120) {
      setVisibleCount((prev) => Math.min(prev + 40, (songList ? songList.length : 0)));
    }
  };

  // Conditional renders AFTER all hooks
  if (loading) {
    return <div className="text-slate-400 py-6 text-center">Loading...</div>;
  }

  if (!songList || songList.length === 0) {
    return <div className="text-slate-400 py-6 text-center">No results</div>;
  }

  return (
    <div
      className="space-y-2 search-results-scroll"
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: "auto", overflowX: "hidden", scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'auto' }}
    >
      <style>{`
        .search-results-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {visibleSongs.map((s) => (
        <SongCard key={s.id || s.title} song={s} onQueue={handleQueue} />
      ))}
      {visibleCount < songList.length && (
        <div className="text-center text-slate-400 text-xs py-2">
          Loading more results...
        </div>
      )}
    </div>
  );
}
