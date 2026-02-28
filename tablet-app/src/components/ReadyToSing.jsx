import React from "react";

export default function ReadyToSing({ onPlay, onSkip, queueLength = 0 }) {
  const playDisabled = queueLength === 0;
  // Skip should be enabled if there's at least one song in queue (to skip to)
  const skipDisabled = queueLength === 0;

  return (
    <div className="rounded-2xl bg-[#0f1220]/90 border border-white/10 shadow-xl p-8 flex flex-col items-center text-center backdrop-blur-md" style={{ minHeight: '230px' }}>
      
      {/* PLAY BUTTON (SMALL & FLOATING) */}
      <button
        onClick={onPlay}
        disabled={playDisabled}
        className={`rounded-full flex items-center justify-center text-2xl transition-all
          ${playDisabled
            ? "bg-slate-700 cursor-not-allowed opacity-40 text-slate-400"
            : "hover:scale-110 shadow-[0_0_12px_rgba(6,182,212,0.6),0_0_24px_rgba(6,182,212,0.35)] text-white"}
        `} 
        style={{ 
          marginTop: '1rem', 
          width: '80px', 
          height: '80px',
          backgroundColor: playDisabled ? '#475569' : '#06b6d4',
          borderRadius: '50%'
        }}
      >
        ▶
      </button>

      {/* TEXT */}
      <h4 className="text-2xl font-semibold text-white mb-4" style={{ marginTop: '1rem' }}>
        Ready to Sing?
      </h4>

      <p className="text-slate-300 text-base mb-8" style={{ marginTop: '1rem' }}>
        {playDisabled
          ? "Add songs to queue to start playing"
          : "Select a song from the library to start"}
      </p>

      {/* SKIP BUTTON */}
      <button
        onClick={onSkip}
        disabled={skipDisabled}
        className={`w-full py-3 rounded-lg text-sm font-medium transition-all border-2
          ${skipDisabled
            ? "border-slate-700 bg-slate-800/50 text-slate-600 cursor-not-allowed"
            : "border-slate-400 bg-transparent text-white hover:bg-slate-800/50 hover:border-slate-300"}
        `} 
        style={{ marginTop: '1rem' }}>
          Skip to Next
        </button>
      </div>
    );
  }
