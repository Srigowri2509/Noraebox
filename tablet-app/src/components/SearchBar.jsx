import React, { useEffect, useRef, useState } from "react";
import useSearchSuggestions from "../hooks/useSearchSuggestions";

const typeLabels = {
  song: "Song",
  album: "Album",
  artist: "Artist / singer",
};

function SearchIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

export default function SearchBar({
  filters = {},
  onFilterChange,
  onEntitySelect,
  onSongSelect,
  languages = [],
  songs = [],
}) {
  const query = filters.query || "";
  const { suggestions, loading } = useSearchSuggestions(query, songs, filters.language);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);

  useEffect(() => {
    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  useEffect(() => {
    if (activeIndex < 0) return;
    rootRef.current
      ?.querySelector(`#search-suggestion-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const chooseSuggestion = (suggestion) => {
    if (suggestion.type === "song") {
      const song = songs.find((candidate) =>
        suggestion.id != null
          ? String(candidate.id) === String(suggestion.id)
          : candidate.title === suggestion.value
      );
      if (song) onSongSelect?.(song);
    } else if (onEntitySelect) {
      onEntitySelect(suggestion);
    } else {
      onFilterChange?.("query", suggestion.value);
    }
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (open && activeIndex >= 0) {
        event.preventDefault();
        chooseSuggestion(suggestions[activeIndex]);
      } else {
        event.currentTarget.blur();
        setOpen(false);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      event.currentTarget.blur();
    }
  };

  const showSuggestions = open && query.trim().length >= 2 && (loading || suggestions.length > 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,0.28fr)] items-start gap-3 md:gap-5">
      <div ref={rootRef} className="relative min-w-0">
        <label htmlFor="unified-song-search" className="sr-only">
          Search
        </label>
        <div className={`flex h-11 items-center overflow-hidden border border-white/10 bg-slate-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition focus-within:border-sky-500/70 focus-within:ring-2 focus-within:ring-sky-500/20 md:h-12 ${showSuggestions ? "rounded-t-[1.5rem] rounded-b-none border-b-transparent" : "rounded-full"}`}>
          <span className="flex w-12 shrink-0 items-center justify-center text-slate-300 md:w-14">
            <SearchIcon />
          </span>
          <input
            id="unified-song-search"
            type="text"
            dir="auto"
            enterKeyHint="search"
            inputMode="search"
            autoComplete="off"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onFilterChange?.("query", event.target.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search song, album, artist or singer..."
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls="search-suggestion-list"
            aria-activedescendant={activeIndex >= 0 ? `search-suggestion-${activeIndex}` : undefined}
            className="min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-base text-white outline-none placeholder:text-slate-500 md:text-lg"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onFilterChange?.("query", "");
                setOpen(false);
              }}
              className="flex h-full w-12 shrink-0 items-center justify-center text-slate-400 transition hover:text-white md:w-14"
              aria-label="Clear search"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {showSuggestions && (
          <div id="search-suggestion-list" role="listbox" className="search-suggestions-scroll scrollbar-thin relative z-50 -mt-px max-h-[min(45vh,340px)] w-full touch-pan-y overflow-y-scroll overscroll-contain rounded-b-2xl border border-t-0 border-white/10 bg-black p-2 pt-1.5 shadow-[0_18px_38px_rgba(0,0,0,0.5)]">
            {loading && suggestions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">Finding matches...</div>
            ) : (
              suggestions.map((suggestion, index) => (
                <button
                  id={`search-suggestion-${index}`}
                  key={`${suggestion.type}-${suggestion.id ?? suggestion.value}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex((current) => current === index ? -1 : current)}
                  className="search-suggestion-row flex min-h-14 w-full items-center gap-3 rounded-xl bg-transparent px-3 py-3 text-left transition-colors duration-100"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-200">
                    <SearchIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white md:text-base">{suggestion.value}</span>
                    <span className="block text-xs text-slate-400">{typeLabels[suggestion.type] || "Match"}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <label htmlFor="search-language" className="sr-only">
          Language
        </label>
        <div className="relative h-11 rounded-full border border-white/10 bg-slate-950/90 md:h-12">
          <select
            id="search-language"
            aria-label="Language"
            value={filters.language || "all"}
            onChange={(event) => onFilterChange?.("language", event.target.value)}
            className="h-full w-full cursor-pointer appearance-none rounded-full bg-transparent pr-12 text-sm text-white outline-none md:text-base"
            style={{ textIndent: "1.5rem" }}
          >
            <option value="all">{"\u00a0\u00a0"}All languages</option>
            {languages.map((language) => (
              <option key={language} value={language}>{"\u00a0\u00a0"}{language}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
