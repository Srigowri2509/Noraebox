import React, { useRef, useEffect } from "react";

export default function QueueList({ queue = [], onRemove }) {
  const scrollContainerRef = useRef(null);


  // Auto-scroll to bottom when queue updates
  useEffect(() => {
    if (scrollContainerRef.current && queue.length > 0) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [queue.length]);

  return (
    <div
      className="card-surface p-4 sm:p-5"
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sky-300 text-lg">🎵</span>
        <h4 className="text-white font-semibold text-base sm:text-lg">Queue</h4>
      </div>
      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ flex: 2 }}>
          <div className="text-6xl mb-4 text-purple-400">🎵</div>
          <div className="text-slate-400 text-sm mb-2">Your queue is empty</div>
          <div className="text-slate-500 text-xs">Add songs to get started</div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="space-y-3 queue-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            overscrollBehavior: "auto",
          }}
        >
          <style>{`
            .queue-scroll::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {queue.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 transition-all group"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-700/70 flex items-center justify-center shrink-0">
                <span className="text-xl">🎵</span>
              </div>
              <div className="flex-1 min-w-0 mr-2">
                <div className="text-white font-medium text-sm sm:text-base truncate">
                  {s.title || "Unknown"}
                </div>
              </div>
              <button
                onClick={() => onRemove?.(i)}
                className="text-slate-400 hover:text-red-400 transition-colors px-1.5 py-1.5 text-lg font-bold flex-shrink-0"
                style={{ marginRight: '8px' }}
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
