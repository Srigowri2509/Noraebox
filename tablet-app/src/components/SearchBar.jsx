import React from "react";

// Language Filter Component
function LanguageFilter({ value = "all", onChange, languages = [] }) {
  return (
    <div>
      <label className="block text-white text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Language</label>
      <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-2.5 sm:p-3">
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full h-9 sm:h-10 bg-slate-800/70 border border-slate-700 rounded-lg pl-3 pr-9 text-black text-sm sm:text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
          >
            <option value="all" className="text-black">All Languages</option>
            {languages.map((lang) => (
              <option key={lang} value={lang} className="text-black">
                {lang}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// Artist Filter Component
function ArtistFilter({ value = "", onChange }) {
  return (
    <div>
      <label className="block text-white text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Artist</label>
      <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-2.5 sm:p-3">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none z-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="Search artist..."
            className="w-full h-9 sm:h-10 bg-slate-800/70 border border-slate-700 rounded-lg pl-9 pr-3 text-white text-sm sm:text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>
    </div>
  );
}

// Album Filter Component
function AlbumFilter({ value = "", onChange }) {
  return (
    <div>
      <label className="block text-white text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Album</label>
      <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-2.5 sm:p-3">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none z-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="Search album..."
            className="w-full h-9 sm:h-10 bg-slate-800/70 border border-slate-700 rounded-lg pl-9 pr-3 text-white text-sm sm:text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>
    </div>
  );
}

// Song Name Filter Component
function SongNameFilter({ value = "", onChange }) {
  return (
    <div>
      <label className="block text-white text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Song Name</label>
      <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-2.5 sm:p-3">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none z-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="Search song..."
            className="w-full h-9 sm:h-10 bg-slate-800/70 border border-slate-700 rounded-lg pl-9 pr-3 text-white text-sm sm:text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>
    </div>
  );
}

// Singer Filter Component
function SingerFilter({ value = "", onChange }) {
  return (
    <div>
      <label className="block text-white text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Singer</label>
      <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-2.5 sm:p-3">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none z-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="Search singer..."
            className="w-full h-9 sm:h-10 bg-slate-800/70 border border-slate-700 rounded-lg pl-9 pr-3 text-white text-sm sm:text-base placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>
    </div>
  );
}

// Main SearchBar Component
export default function SearchBar({ filters = {}, onFilterChange, languages = [] }) {
  return (
    <div className="mt-1 sm:mt-2">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 items-start">
        <div className="min-w-0">
          <LanguageFilter
            value={filters.language || "all"}
            onChange={(val) => onFilterChange?.("language", val)}
            languages={languages}
          />
        </div>
        <div className="min-w-0">
          <ArtistFilter
            value={filters.artist || ""}
            onChange={(val) => onFilterChange?.("artist", val)}
          />
        </div>
        <div className="min-w-0">
          <SingerFilter
            value={filters.singer || ""}
            onChange={(val) => onFilterChange?.("singer", val)}
          />
        </div>
        <div className="min-w-0">
          <AlbumFilter
            value={filters.album || ""}
            onChange={(val) => onFilterChange?.("album", val)}
          />
        </div>
        <div className="min-w-0 col-span-2 lg:col-span-1">
          <SongNameFilter
            value={filters.songName || ""}
            onChange={(val) => onFilterChange?.("songName", val)}
          />
        </div>
      </div>
    </div>
  );
}
