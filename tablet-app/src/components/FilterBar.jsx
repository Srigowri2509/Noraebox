import React from "react";

export default function FilterBar({ language, onLanguageChange }) {
  return (
    <div className="flex items-center gap-4">
      <label className="text-sm text-slate-300">Language</label>
      <select value={language} onChange={(e) => onLanguageChange(e.target.value)} className="bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-white">
        <option value="all">All Languages</option>
        <option value="english">English</option>
        <option value="hindi">Hindi</option>
        <option value="korean">Korean</option>
      </select>
    </div>
  );
}
