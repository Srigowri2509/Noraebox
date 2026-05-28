import React from "react";

const shell =
  "rounded-3xl border border-white/[0.08] bg-[rgba(11,17,28,0.92)] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-1";
const labelCls =
  "mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-300 sm:text-xs md:text-sm";
const innerRow =
  "flex h-8 w-full min-w-0 items-stretch overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-950/75 transition-[box-shadow,border-color] focus-within:border-sky-500/45 focus-within:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22)] md:h-9";
const iconCol = "flex w-9 shrink-0 items-center justify-center text-slate-400 md:w-10";
const inputRest =
  "min-w-0 flex-1 border-0 bg-transparent py-1.5 pr-2.5 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:ring-0 md:py-2 md:pr-3 md:text-[15px]";

function LanguageFilter({ value = "all", onChange, languages = [] }) {
  return (
    <div className="min-w-0">
      <label className={labelCls}>Language</label>
      <div className={shell}>
        <div className={`${innerRow} relative`}>
          <select
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className={`h-full w-full cursor-pointer appearance-none rounded-2xl bg-transparent py-1.5 pl-3 pr-9 text-sm text-white md:py-2 md:pl-3.5 md:text-[15px]`}
          >
            <option value="all">All Languages</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 md:right-2.5 md:h-[18px] md:w-[18px]"
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

function SearchField({ label, placeholder, value, onChange }) {
  const dismissKeyboard = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="min-w-0">
      <label className={labelCls}>{label}</label>
      <div className={shell}>
        <div className={innerRow}>
          <div className={iconCol} aria-hidden>
            <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="search"
            enterKeyHint="search"
            inputMode="search"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={dismissKeyboard}
            placeholder={placeholder}
            className={`${inputRest} border-l border-white/[0.06] pl-2 md:pl-2.5`}
          />
        </div>
      </div>
    </div>
  );
}

export default function SearchBar({ filters = {}, onFilterChange, languages = [] }) {
  return (
    <div className="mt-1 sm:mt-2">
      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-3 md:grid-cols-4 md:gap-x-6 md:gap-y-3">
        <LanguageFilter
          value={filters.language || "all"}
          onChange={(val) => onFilterChange?.("language", val)}
          languages={languages}
        />
        <SearchField
          label="Artist"
          placeholder="Search artist..."
          value={filters.artist || ""}
          onChange={(val) => onFilterChange?.("artist", val)}
        />
        <SearchField
          label="Album"
          placeholder="Search album..."
          value={filters.album || ""}
          onChange={(val) => onFilterChange?.("album", val)}
        />
        <SearchField
          label="Song Name"
          placeholder="Search song..."
          value={filters.songName || ""}
          onChange={(val) => onFilterChange?.("songName", val)}
        />
      </div>
    </div>
  );
}
