import React from "react";
import SongCard from "./SongCard";

export default function SearchResults({ songs = [], results = [], onAddToQueue, onQueue, loading }) {
  // Support both 'songs' and 'results' props for backward compatibility
  const songList = songs || results;
  
  if (loading) {
    return <div className="text-slate-400 py-6 text-center">Loading...</div>;
  }
  
  if (!songList || songList.length === 0) {
    return <div className="text-slate-400 py-6 text-center">No results</div>;
  }

  const handleQueue = onAddToQueue || onQueue;

  return (
    <div className="space-y-2 search-results-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'auto' }}>
      <style>{`
        .search-results-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {songList.map((s) => (
        <SongCard key={s.id || s.title} song={s} onQueue={handleQueue} />
      ))}
    </div>
  );
}
