import React, { useRef, useEffect, useState, useCallback } from "react";

/*
  QueueList with long-press drag-to-reorder (like Spotify).
  - Long-press (400ms) on a queue item activates drag mode.
  - Dragging over other items reorders live.
  - Releasing commits the reorder.
  - Works on both touch (mobile/tablet) and mouse (desktop).
*/

export default function QueueList({ queue = [], onRemove, onReorder }) {
  const scrollContainerRef = useRef(null);

  // Drag state
  const [dragIndex, setDragIndex] = useState(null); // index being dragged
  const [overIndex, setOverIndex] = useState(null); // index being hovered over
  const longPressTimer = useRef(null);
  const dragStartY = useRef(0);
  const itemRefs = useRef([]);
  const isDragging = useRef(false);

  // Auto-scroll to bottom when queue updates (only when not dragging)
  useEffect(() => {
    if (scrollContainerRef.current && queue.length > 0 && dragIndex === null) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [queue.length, dragIndex]);

  // Get visual order: items rearranged during drag
  const getDisplayQueue = useCallback(() => {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) {
      return queue.map((item, i) => ({ item, originalIndex: i }));
    }
    const result = queue.map((item, i) => ({ item, originalIndex: i }));
    const [moved] = result.splice(dragIndex, 1);
    result.splice(overIndex, 0, moved);
    return result;
  }, [queue, dragIndex, overIndex]);

  // ── Long press start ──
  const handlePressStart = (index, clientY) => {
    clearTimeout(longPressTimer.current);
    dragStartY.current = clientY;

    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      setDragIndex(index);
      setOverIndex(index);
      // Haptic feedback on mobile (if available)
      if (navigator.vibrate) navigator.vibrate(30);
    }, 400);
  };

  // ── Move while dragging ──
  const handleMoveWhileDragging = (clientY) => {
    if (!isDragging.current || dragIndex === null) return;

    // Find which item the finger/mouse is over
    const container = scrollContainerRef.current;
    if (!container) return;

    const children = container.children;
    // Skip first child (the <style> element)
    for (let i = 0; i < queue.length; i++) {
      const el = children[i + 1]; // +1 to skip <style> tag
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) {
        setOverIndex(i);
        return;
      }
    }
    // Below all items → last position
    setOverIndex(queue.length - 1);
  };

  // ── Release / cancel drag ──
  const handlePressEnd = () => {
    clearTimeout(longPressTimer.current);

    if (isDragging.current && dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      // Commit reorder
      onReorder?.(dragIndex, overIndex);
    }

    isDragging.current = false;
    setDragIndex(null);
    setOverIndex(null);
  };

  // Cancel long-press if finger moves too much before timer fires
  const handlePressMove = (clientY) => {
    if (!isDragging.current) {
      const dy = Math.abs(clientY - dragStartY.current);
      if (dy > 10) {
        clearTimeout(longPressTimer.current);
      }
    }
  };

  // ── Touch handlers ──
  const onTouchStart = (index, e) => {
    const touch = e.touches[0];
    handlePressStart(index, touch.clientY);
  };

  const onTouchMove = (e) => {
    const touch = e.touches[0];
    handlePressMove(touch.clientY);
    handleMoveWhileDragging(touch.clientY);

    // Prevent scroll while dragging
    if (isDragging.current) {
      e.preventDefault();
    }
  };

  const onTouchEnd = () => {
    handlePressEnd();
  };

  // ── Mouse handlers (for desktop testing) ──
  const onMouseDown = (index, e) => {
    handlePressStart(index, e.clientY);
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      handlePressMove(e.clientY);
      handleMoveWhileDragging(e.clientY);
    };
    const onMouseUp = () => {
      handlePressEnd();
    };

    if (dragIndex !== null) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragIndex, overIndex, queue]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(longPressTimer.current);
  }, []);

  const displayQueue = getDisplayQueue();

  return (
    <div
      className="card-surface p-4 sm:p-5"
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sky-300 text-lg">🎵</span>
        <h4 className="text-white font-semibold text-base sm:text-lg">Queue</h4>
        {queue.length > 1 && (
          <span className="text-slate-500 text-xs ml-auto">Long press to reorder</span>
        )}
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
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: dragIndex !== null ? "hidden" : "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            touchAction: dragIndex !== null ? "none" : "pan-y",
            overscrollBehavior: "auto",
          }}
        >
          <style>{`
            .queue-scroll::-webkit-scrollbar {
              display: none;
            }
            .queue-item-dragging {
              opacity: 0.95;
              transform: scale(1.03);
              box-shadow: 0 8px 25px rgba(139, 92, 246, 0.35), 0 0 0 2px rgba(139, 92, 246, 0.5);
              z-index: 50;
              transition: transform 0.15s ease, box-shadow 0.15s ease;
            }
            .queue-item-over {
              border-color: rgba(139, 92, 246, 0.6) !important;
              background: rgba(139, 92, 246, 0.12) !important;
            }
            .queue-item-shift {
              transition: transform 0.2s ease;
            }
          `}</style>
          {displayQueue.map(({ item: s, originalIndex }, displayIdx) => {
            const isBeingDragged = originalIndex === dragIndex;
            const isDropTarget = dragIndex !== null && displayIdx === overIndex && !isBeingDragged;

            return (
              <div
                key={s.queue_id || s.id || originalIndex}
                ref={(el) => (itemRefs.current[displayIdx] = el)}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all group ${
                  isBeingDragged
                    ? "queue-item-dragging bg-slate-700/80 border-purple-500"
                    : isDropTarget
                    ? "queue-item-over bg-slate-800/60 border-purple-400"
                    : "bg-slate-800/60 border-slate-700 hover:bg-slate-700/60"
                }`}
                onTouchStart={(e) => onTouchStart(originalIndex, e)}
                onMouseDown={(e) => onMouseDown(originalIndex, e)}
                style={{
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  cursor: dragIndex !== null ? "grabbing" : "default",
                }}
              >
                {/* Drag handle (grip dots) */}
                <div
                  className="flex flex-col items-center justify-center shrink-0"
                  style={{
                    width: 20,
                    cursor: "grab",
                    opacity: 0.4,
                    touchAction: "none",
                  }}
                >
                  <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" className="text-slate-400">
                    <circle cx="5" cy="4" r="1.5" />
                    <circle cx="11" cy="4" r="1.5" />
                    <circle cx="5" cy="10" r="1.5" />
                    <circle cx="11" cy="10" r="1.5" />
                    <circle cx="5" cy="16" r="1.5" />
                    <circle cx="11" cy="16" r="1.5" />
                  </svg>
                </div>

                {/* Song icon */}
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-700/70 flex items-center justify-center shrink-0">
                  <span className="text-xl">🎵</span>
                </div>

                {/* Song title */}
                <div className="flex-1 min-w-0 mr-2">
                  <div className="text-white font-medium text-sm sm:text-base truncate">
                    {s.title || "Unknown"}
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dragIndex === null) {
                      onRemove?.(originalIndex);
                    }
                  }}
                  className="text-slate-400 hover:text-red-400 transition-colors px-1.5 py-1.5 text-lg font-bold flex-shrink-0"
                  style={{ marginRight: "8px" }}
                  aria-label="Remove from queue"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
