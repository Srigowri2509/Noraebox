import React, { useRef, useEffect } from "react";

export default function QueueList({ queue = [], onRemove, onMoveUp, onMoveDown }) {
  const scrollContainerRef = useRef(null);

  // Hide scrollbar styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .queue-scroll::-webkit-scrollbar {
        display: none;
      }
      .queue-scroll {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Auto-scroll to bottom when queue updates
  useEffect(() => {
    if (scrollContainerRef.current && queue.length > 0) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [queue.length]);

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
        <div 
          ref={scrollContainerRef}
          className="space-y-3 queue-scroll" 
          style={{ flex: 1, overflowY: "auto", scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {queue.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-2 p-4 rounded-lg bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 transition-all group queue-scroll"
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => onMoveUp?.(i)}
                  disabled={i === 0}
                  className={`text-slate-400 hover:text-cyan-400 transition-colors text-xs px-1 py-0.5 ${
                    i === 0 ? 'opacity-30 cursor-not-allowed' : ''
                  }`}
                  aria-label="Move up"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => onMoveDown?.(i)}
                  disabled={i === queue.length - 1}
                  className={`text-slate-400 hover:text-cyan-400 transition-colors text-xs px-1 py-0.5 ${
                    i === queue.length - 1 ? 'opacity-30 cursor-not-allowed' : ''
                  }`}
                  aria-label="Move down"
                  title="Move down"
                >
                  ▼
                </button>
              </div>
              
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
