import React from "react";

export default function QueueList({ queue = [], onRemove }) {
  return (
    <div className="card-surface p-6" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sky-300 text-xl">🎵</span>
        <h4 className="text-white font-semibold text-lg">Queue</h4>
      </div>
      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ flex: 2 }}>
          <div className="text-6xl mb-4 text-purple-400">🎵</div>
          <div className="text-slate-400 text-sm mb-2">Your queue is empty</div>
          <div className="text-slate-500 text-xs">Add songs to get started</div>
        </div>
      ) : (
        <div className="space-y-3" style={{ flex: 1, overflowY: "auto" }}>
          {queue.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 transition-all group"
            >
              <div className="w-14 h-14 rounded-lg bg-slate-700/70 flex items-center justify-center shrink-0">
                <span className="text-2xl">🎵</span>
              </div>
              <div className="flex-1 min-w-0 mr-4">
                <div className="text-white font-medium text-base truncate">
                  {s.title || "Unknown"}
                </div>
              </div>
              <button
                onClick={() => onRemove?.(i)}
                className="text-slate-400 hover:text-red-400 transition-colors px-2 py-2 text-xl font-bold flex-shrink-0"
                style={{ marginRight: '16px' }}
                aria-label="Remove from queue"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
