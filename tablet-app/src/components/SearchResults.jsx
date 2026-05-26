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
        <p className="search-results-header-label">
          {languageLabel ? (
            <>
              Showing results: <span className="text-white">{languageLabel}</span>
            </>
          ) : (
            "Search results"
          )}
        </p>
        {songList?.length > 0 && totalPages <= 1 && (
          <p className="search-results-header-meta">
            {songList.length} {songList.length === 1 ? "song" : "songs"}
          </p>
        )}
        {songList?.length > 0 && totalPages > 1 && (
          <p className="search-results-header-meta">
            Page {currentPage}/{totalPages}
          </p>
        )}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="search-results-root">
        {languageLabel && (
          <div className="search-results-header shrink-0">
            <p className="search-results-header-label">
              Showing results: <span className="text-white">{languageLabel}</span>
            </p>
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
            <p className="search-results-header-label">
              Showing results: <span className="text-white">{languageLabel}</span>
            </p>
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
        <div className="search-results-list">
          {pageSongs.map((s) => (
            <SongCard key={s.id || s.title} song={s} onQueue={handleQueue} />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="search-results-footer">
          <span className="search-results-footer-count">{songList.length} songs</span>
          <div className="search-results-pagination">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`search-results-page-btn ${
                currentPage === 1 ? "search-results-page-btn--disabled" : ""
              }`}
              aria-label="Previous page"
            >
              ‹
            </button>
            {getPageNumbers().map((page, idx) =>
              page === "..." ? (
                <span key={`e-${idx}`} className="search-results-page-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToPage(page)}
                  className={`search-results-page-btn ${
                    page === currentPage ? "search-results-page-btn--active" : ""
                  }`}
                >
                  {page}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`search-results-page-btn ${
                currentPage === totalPages ? "search-results-page-btn--disabled" : ""
              }`}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
