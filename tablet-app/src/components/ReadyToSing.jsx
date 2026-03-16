import React from "react";

export default function ReadyToSing({ onPlay, onSkip, queueLength = 0 }) {
  const playDisabled = queueLength === 0;
  // Skip should be enabled if there's at least one song in queue (to skip to)
  const skipDisabled = queueLength === 0;

  return (
    <div className="rounded-2xl bg-[#0f1220]/90 border border-white/10 shadow-xl p-3 sm:p-4 flex flex-row items-center justify-center gap-4 backdrop-blur-md" style={{ height: '100%', minHeight: 0 }}>
      
      {/* PLAY BUTTON */}
      <button
        onClick={onPlay}
        disabled={playDisabled}
        className={`rounded-full flex items-center justify-center text-lg sm:text-xl transition-all shrink-0
          ${playDisabled
            ? "bg-slate-700 cursor-not-allowed opacity-40 text-slate-400"
            : "hover:scale-110 shadow-[0_0_12px_rgba(6,182,212,0.6),0_0_24px_rgba(6,182,212,0.35)] text-white"}
        `} 
        style={{ 
          width: '52px', 
          height: '52px',
          backgroundColor: playDisabled ? '#475569' : '#06b6d4',
          borderRadius: '50%',
        }}
      >
        ▶
      </button>

      {/* SKIP BUTTON */}
      <button
        onClick={onSkip}
        disabled={skipDisabled}
        className={`px-4 py-2 sm:py-2.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all border whitespace-nowrap shrink-0
          ${skipDisabled
            ? "border-slate-700 bg-slate-800/50 text-slate-600 cursor-not-allowed"
            : "border-slate-400 bg-transparent text-white hover:bg-slate-800/50 hover:border-slate-300"}
        `}>
          Skip to Next
        </button>
    </div>
  );
  }
