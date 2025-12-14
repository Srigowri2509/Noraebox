import React from "react";

// Language Filter Component
function LanguageFilter({ value = "all", onChange, languages = [] }) {
  return (
    <div>
      <label className="block text-white text-sm font-medium mb-3">Language</label>
      <div className="bg-slate-800/70 border-2 border-slate-700 rounded-xl p-4">
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full h-10 bg-slate-800/70 border-2 border-slate-700 rounded-lg pl-8 pr-10 text-black text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
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
      <label className="block text-white text-sm font-medium mb-3">Artist</label>
      <div className="bg-slate-800/70 border-2 border-slate-700 rounded-xl p-4">
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
            className="w-full h-10 bg-slate-800/70 border-2 border-slate-700 rounded-lg pl-10 pr-4 text-white text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ paddingLeft: '2.75rem' }}
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
      <label className="block text-white text-sm font-medium mb-3">Album</label>
      <div className="bg-slate-800/70 border-2 border-slate-700 rounded-xl p-4">
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
            className="w-full h-10 bg-slate-800/70 border-2 border-slate-700 rounded-lg pl-10 pr-4 text-white text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ paddingLeft: '2.75rem' }}
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
      <label className="block text-white text-sm font-medium mb-3">Song Name</label>
      <div className="bg-slate-800/70 border-2 border-slate-700 rounded-xl p-4">
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
            className="w-full h-10 bg-slate-800/70 border-2 border-slate-700 rounded-lg pl-10 pr-4 text-white text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>
      </div>
    </div>
  );
}

// Main SearchBar Component
export default function SearchBar({ filters = {}, onFilterChange, languages = [] }) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <LanguageFilter
          value={filters.language || "all"}
          onChange={(val) => onFilterChange?.("language", val)}
          languages={languages}
        />
        <ArtistFilter
          value={filters.artist || ""}
          onChange={(val) => onFilterChange?.("artist", val)}
        />
        <AlbumFilter
          value={filters.album || ""}
          onChange={(val) => onFilterChange?.("album", val)}
        />
        <SongNameFilter
          value={filters.songName || ""}
          onChange={(val) => onFilterChange?.("songName", val)}
        />
      </div>
    </div>
  );
}
