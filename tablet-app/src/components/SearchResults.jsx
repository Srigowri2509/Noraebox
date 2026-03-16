import React, { useEffect, useMemo, useState, useRef } from "react";
import SongCard from "./SongCard";

const PAGE_SIZE = 20; // songs per page

export default function SearchResults({ songs = [], results = [], onAddToQueue, onQueue, loading }) {
  const songList = songs || results;
  const [currentPage, setCurrentPage] = useState(1);
  const scrollRef = useRef(null);

  const handleQueue = onAddToQueue || onQueue;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((songList?.length || 0) / PAGE_SIZE)),
    [songList]
  );

  const pageSongs = useMemo(
    () => (songList ? songList.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : []),
    [songList, currentPage]
  );

  // Reset to page 1 when results change
  useEffect(() => {
    setCurrentPage(1);
  }, [songList]);

  // Scroll to top when page changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Build page numbers to show (max 5 visible + ellipsis)
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    pages.push(1);

    if (currentPage > 3) pages.push("...");

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) pages.push("...");

    pages.push(totalPages);
    return pages;
  };

  // Conditional renders AFTER all hooks
  if (loading) {
    return <div className="text-slate-400 py-6 text-center">Loading...</div>;
  }

  if (!songList || songList.length === 0) {
    return <div className="text-slate-400 py-6 text-center">No results</div>;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      {/* Scrollable song list */}
      <div
        ref={scrollRef}
        className="search-results-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "auto",
        }}
      >
        <style>{`
          .search-results-scroll::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {pageSongs.map((s) => (
          <SongCard key={s.id || s.title} song={s} onQueue={handleQueue} />
        ))}
      </div>

      {/* Pagination bar — always inside the container */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 pb-1 flex-shrink-0" style={{ minHeight: 36 }}>
          {/* Song count */}
          <span className="text-slate-500 text-xs whitespace-nowrap">
            {songList.length} songs
          </span>

          {/* Page buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium ${
                currentPage === 1
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-300 hover:bg-slate-700 active:bg-slate-600"
              }`}
            >
              ‹
            </button>

            {getPageNumbers().map((page, idx) =>
              page === "..." ? (
                <span key={`e-${idx}`} className="w-5 text-center text-slate-500 text-xs">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium ${
                    page === currentPage
                      ? "bg-purple-600 text-white"
                      : "text-slate-300 hover:bg-slate-700 active:bg-slate-600"
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium ${
                currentPage === totalPages
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-300 hover:bg-slate-700 active:bg-slate-600"
              }`}
            >
              ›
            </button>
          </div>

          {/* Page info */}
          <span className="text-slate-500 text-xs whitespace-nowrap">
            {currentPage}/{totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
