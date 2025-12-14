import React from "react";

export default function FilterIndicator({ filters, onClear }) {
  const active = Object.entries(filters || {}).filter(([k,v]) => v && v !== "all");
  if (active.length === 0) return null;
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-slate-300">
      <div className="font-semibold mr-2">Filters:</div>
      <div className="flex gap-2 flex-wrap">
        {active.map(([k,v]) => <div key={k} className="px-2 py-1 bg-slate-700/30 rounded">{k}: {v}</div>)}
      </div>
      <button onClick={onClear} className="ml-auto text-slate-400 hover:text-white">Clear</button>
    </div>
  );
}
