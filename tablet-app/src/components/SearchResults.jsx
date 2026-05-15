import React, { useEffect, useMemo, useState, useRef } from "react";
import SongCard from "./SongCard";

const PAGE_SIZE = 20;

export default function SearchResults({
  songs = [],
  results = [],
  onAddToQueue,
  onQueue,
  loading,
  languageLabel = null,
}) {
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

  useEffect(() => {
    setCurrentPage(1);
  }, [songList, languageLabel]);

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

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [1];
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  const resultsHeader =
    languageLabel || (songList?.length > 0 && !loading) ? (
      <div className="search-results-header shrink-0">
        {languageLabel ? (
          <span className="text-sm font-semibold text-sky-200 md:text-base">
            Showing results: <span className="text-white">{languageLabel}</span>
          </span>
        ) : (
          <span className="text-sm font-semibold text-white md:text-base">Search results</span>
        )}
        {songList?.length > 0 && (
          <span className="text-xs font-medium text-slate-400 md:text-sm">
            Page {currentPage} of {totalPages}
            <span className="text-slate-500"> · {songList.length} songs</span>
          </span>
        )}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="search-results-root">
        {languageLabel && (
          <div className="search-results-header shrink-0">
            <span className="text-sm font-semibold text-sky-200 md:text-base">
              Showing results: <span className="text-white">{languageLabel}</span>
            </span>
          </div>
        )}
        <div className="search-results-scroll flex items-center justify-center py-8">
          <p className="text-base text-slate-400 md:text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!songList || songList.length === 0) {
    return (
      <div className="search-results-root">
        {languageLabel && (
          <div className="search-results-header shrink-0">
            <span className="text-sm font-semibold text-sky-200 md:text-base">
              Showing results: <span className="text-white">{languageLabel}</span>
            </span>
          </div>
        )}
        <div className="most-played-scroll flex flex-col items-center justify-center px-6 py-8 text-center md:px-10">
          <p className="max-w-sm text-base leading-relaxed text-slate-400 md:max-w-md md:text-lg">
            Suggest this song on our website:{" "}
            <a
              href="https://www.noraebox.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-200 underline decoration-violet-400/35 decoration-1 underline-offset-[4px] transition-colors hover:text-white hover:decoration-violet-300/55"
            >
              www.noraebox.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="search-results-root">
      {resultsHeader}
      <div ref={scrollRef} className="search-results-scroll">
        <div className="flex flex-col gap-1">
          {pageSongs.map((s) => (
            <SongCard key={s.id || s.title} song={s} onQueue={handleQueue} />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between pt-2 pb-1" style={{ minHeight: 36 }}>
          <span className="whitespace-nowrap text-xs text-slate-500">{songList.length} songs</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium ${
                currentPage === 1
                  ? "cursor-not-allowed text-slate-600"
                  : "text-slate-300 hover:bg-slate-700 active:bg-slate-600"
              }`}
            >
              ‹
            </button>
            {getPageNumbers().map((page, idx) =>
              page === "..." ? (
                <span key={`e-${idx}`} className="w-5 text-center text-xs text-slate-500">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium ${
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
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium ${
                currentPage === totalPages
                  ? "cursor-not-allowed text-slate-600"
                  : "text-slate-300 hover:bg-slate-700 active:bg-slate-600"
              }`}
            >
              ›
            </button>
          </div>
          <span className="whitespace-nowrap text-xs text-slate-500">
            {currentPage}/{totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
