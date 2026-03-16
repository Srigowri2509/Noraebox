import React from "react";

export default function ReadyToSing({ onPlay, onSkip, queueLength = 0 }) {
  const playDisabled = queueLength === 0;
  // Skip should be enabled if there's at least one song in queue (to skip to)
  const skipDisabled = queueLength === 0;

  return (
    <div className="rounded-2xl bg-[#0f1220]/90 border border-white/10 shadow-xl px-6 py-4 flex flex-row items-center justify-center gap-14 backdrop-blur-md" style={{ height: '100%', minHeight: 0 }}>
      
      {/* PLAY BUTTON */}
      <button
        onClick={onPlay}
        disabled={playDisabled}
        className={`rounded-full flex items-center justify-center text-2xl transition-all shrink-0
          ${playDisabled
            ? "cursor-not-allowed opacity-40 text-slate-400"
            : "hover:scale-110 shadow-[0_0_16px_rgba(6,182,212,0.6),0_0_32px_rgba(6,182,212,0.35)] text-white"}
        `} 
        style={{ 
          width: '64px', 
          height: '64px',
          backgroundColor: playDisabled ? '#475569' : '#06b6d4',
          borderRadius: '50%',
        }}
      >
        ▶
      </button>

      {/* SKIP BUTTON — rounded rectangle with icon + text */}
      <button
        onClick={onSkip}
        disabled={skipDisabled}
        className={`flex flex-row items-center justify-center gap-2 transition-all shrink-0
          ${skipDisabled
            ? "cursor-not-allowed opacity-40"
            : "hover:scale-105 shadow-[0_0_16px_rgba(6,182,212,0.6),0_0_32px_rgba(6,182,212,0.35)]"}
        `}
        style={{
          height: '48px',
          paddingLeft: '16px',
          paddingRight: '20px',
          backgroundColor: skipDisabled ? '#475569' : '#06b6d4',
          borderRadius: '24px',
        }}
      >
        <span className="text-white text-xl leading-none">⏭</span>
        <span className="text-white text-sm font-semibold leading-none">Skip to Next</span>
      </button>
    </div>
  );
  }
