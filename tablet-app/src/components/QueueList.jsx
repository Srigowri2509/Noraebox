import React, { useRef, useEffect, useState, useCallback } from "react";
import SongRow from "./SongRow";
import { formatSongSubtitle } from "./SongRow";

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

  const onTouchEnd = () => {
    handlePressEnd();
  };

  // ── Mouse handlers (for desktop testing) ──
  const onMouseDown = (index, e) => {
    handlePressStart(index, e.clientY);
  };

  // Use native (non-passive) touchmove on document to reliably preventDefault
  // React synthetic touch events are passive and can't block scrolling
  useEffect(() => {
    const handleTouchMove = (e) => {
      if (!isDragging.current) {
        // Not dragging yet — just check if we should cancel the long-press timer
        if (e.touches.length > 0) {
          handlePressMove(e.touches[0].clientY);
        }
        return;
      }
      // Dragging — block ALL scrolling on the page
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length > 0) {
        handleMoveWhileDragging(e.touches[0].clientY);
      }
    };

    const handleTouchEnd = () => {
      handlePressEnd();
    };

    // { passive: false } is required to allow preventDefault() on touchmove
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [dragIndex, overIndex, queue]);

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
      className="card-surface flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 md:p-4"
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
    >
      {/* ── Queue header ── */}
      <div className="queue-panel-header mb-2 flex-shrink-0 md:mb-3">
        <div className="queue-panel-header-row">
          <div className="queue-panel-title-wrap">
            <span className="text-lg text-sky-300 md:text-xl">🎵</span>
            <h4 className="text-base font-semibold text-white sm:text-lg md:text-xl">Queue</h4>
          </div>
        </div>
        {queue.length > 0 && (
          <p className="queue-panel-hint">Long press to reorder</p>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-[2] flex-col items-center justify-center px-4">
          <div className="mb-4 text-7xl text-purple-400 md:mb-6 md:text-8xl">🎵</div>
          <div className="mb-2 text-center text-base text-slate-400 md:text-xl lg:text-2xl">Your queue is empty</div>
          <div className="text-center text-sm text-slate-500 md:text-base lg:text-lg">Add songs to get started</div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="queue-scroll flex min-h-0 flex-1 flex-col gap-0"
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
            .song-row.queue-item-dragging {
              opacity: 0.95;
              transform: scale(1.03);
              box-shadow: 0 8px 25px rgba(139, 92, 246, 0.35), 0 0 0 2px rgba(139, 92, 246, 0.5);
              z-index: 50;
              border-color: rgba(167, 139, 250, 0.85) !important;
              background: rgba(30, 41, 59, 0.92) !important;
            }
            .song-row.queue-item-over {
              border-color: rgba(139, 92, 246, 0.55) !important;
              background: rgba(51, 65, 85, 0.75) !important;
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
                className={[
                  "song-row",
                  isBeingDragged ? "queue-item-dragging z-50" : "",
                  isDropTarget ? "queue-item-over" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onTouchStart={(e) => onTouchStart(originalIndex, e)}
                onMouseDown={(e) => onMouseDown(originalIndex, e)}
                style={{
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  cursor: dragIndex !== null ? "grabbing" : "default",
                  marginTop: 0,
                  marginBottom: 0,
                }}
              >
                {/* Drag handle — vertical grip */}
                <div
                  className="flex shrink-0 flex-col items-center justify-center text-slate-500"
                  style={{
                    width: 14,
                    cursor: "grab",
                    opacity: 0.65,
                    touchAction: "none",
                  }}
                  aria-hidden
                >
                  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                    <circle cx="5" cy="3.5" r="1.4" />
                    <circle cx="5" cy="8" r="1.4" />
                    <circle cx="5" cy="12.5" r="1.4" />
                  </svg>
                </div>

                <div className="song-row-icon" aria-hidden>
                  <span>🎵</span>
                </div>

                <div className="song-row-body">
                  <div className="song-row-title">{s.title || "Unknown title"}</div>
                  <div className="song-row-subtitle">{formatSongSubtitle(s)}</div>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dragIndex === null) {
                      onRemove?.(originalIndex);
                    }
                  }}
                  className="flex shrink-0 rounded-md p-1 text-lg font-bold leading-none text-slate-400 transition-colors hover:bg-slate-600/50 hover:text-red-400 sm:p-1.5 sm:text-xl"
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


