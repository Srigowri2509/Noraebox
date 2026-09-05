import React, { useEffect, useMemo, useState, useRef } from "react";
import SongCard from "./SongCard";
import { api } from "../api";

const PAGE_SIZE = 20;

export default function SearchResults({
  songs = [],
  results = [],
  onAddToQueue,
  onQueue,
  loading,
  languageLabel = null,
  hideHeader = false,
  suggestionTitle = "",
  suggestionLanguage = null,
  suggestionRoomId = null,
}) {
  const songList = songs || results;
  const [currentPage, setCurrentPage] = useState(1);
  const scrollRef = useRef(null);
  const [suggestionFeedback, setSuggestionFeedback] = useState({ key: "", status: "idle", error: "" });
  const [artistDraft, setArtistDraft] = useState({ key: "", value: "" });
  const suggestionKey = `${suggestionTitle.trim()}\u0000${suggestionLanguage || ""}`;
  const suggestionArtist = artistDraft.key === suggestionKey ? artistDraft.value : "";
  const currentSuggestionFeedback = suggestionFeedback.key === suggestionKey
    ? suggestionFeedback
    : { status: "idle", error: "" };
  const suggestionState = currentSuggestionFeedback.status;
  const suggestionError = currentSuggestionFeedback.error;

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
    const timeout = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(timeout);
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

  const submitSuggestion = async () => {
    const title = suggestionTitle.trim();
    if (!title || suggestionState === "submitting" || suggestionState === "submitted") return;
    setSuggestionFeedback({ key: suggestionKey, status: "submitting", error: "" });
    try {
      await api("/songs/suggestions", {
        method: "POST",
        body: JSON.stringify({
          title,
          artist: suggestionArtist.trim() || null,
          language: suggestionLanguage || null,
          room_id: suggestionRoomId || null,
        }),
      });
      setSuggestionFeedback({ key: suggestionKey, status: "submitted", error: "" });
    } catch (error) {
      setSuggestionFeedback({
        key: suggestionKey,
        status: "idle",
        error: error.message || "Could not submit this song. Please try again.",
      });
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
    !hideHeader && (languageLabel || (songList?.length > 0 && !loading)) ? (
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
    const canSuggest = Boolean(suggestionTitle.trim());
    return (
      <div className="search-results-root">
        {languageLabel && (
          <div className="search-results-header shrink-0">
            <p className="search-results-header-label">
              Showing results: <span className="text-white">{languageLabel}</span>
            </p>
          </div>
        )}
        <div className="search-results-scroll flex flex-col items-center justify-center px-6 py-8 text-center md:px-10">
          {canSuggest ? (
            <div className="song-suggestion-empty">
              <div className="song-suggestion-empty-icon" aria-hidden>♫</div>
              <p className="song-suggestion-empty-title">No songs found</p>
              <p className="song-suggestion-empty-copy">
                Request <span>“{suggestionTitle.trim()}”</span> for the song bank.
              </p>
              <form
                className="song-suggestion-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSuggestion();
                }}
              >
                <label htmlFor="song-suggestion-artist">Artist name</label>
                <input
                  id="song-suggestion-artist"
                  type="text"
                  value={suggestionArtist}
                  onChange={(event) => setArtistDraft({ key: suggestionKey, value: event.target.value })}
                  disabled={suggestionState !== "idle"}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Enter singer or artist (optional)"
                />
                <button
                  type="submit"
                  disabled={suggestionState !== "idle"}
                  className="song-suggestion-submit"
                >
                  {suggestionState === "submitting"
                    ? "Sending…"
                    : suggestionState === "submitted"
                      ? "Suggestion sent ✓"
                      : "Suggest this song"}
                </button>
              </form>
              {suggestionError ? <p className="song-suggestion-error" role="alert">{suggestionError}</p> : null}
              {suggestionState === "submitted" ? (
                <p className="song-suggestion-success" role="status">Sent to the Noraebox admin team.</p>
              ) : null}
            </div>
          ) : null}
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
