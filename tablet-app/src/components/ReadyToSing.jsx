import React from "react";

export default function ReadyToSing({ onPlay, onSkip, queueLength = 0 }) {
  const playDisabled = queueLength === 0;
  const skipDisabled = queueLength === 0;

  const playGlow =
    "0 0 0 1px rgba(255,255,255,0.28), 0 4px 12px rgba(0,0,0,0.32), 0 0 22px rgba(255,64,129,0.8), 0 0 48px rgba(255,64,129,0.38)";
  const skipGlow =
    "0 0 0 1px rgba(255,255,255,0.28), 0 4px 12px rgba(0,0,0,0.32), 0 0 22px rgba(0,229,255,0.7), 0 0 48px rgba(0,188,212,0.42)";

  return (
    <div
      className="flex h-full min-h-0 flex-row flex-nowrap items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#0f1220]/90 px-5 py-3 shadow-xl backdrop-blur-md md:gap-5 md:px-7 md:py-4"
      style={{ height: "100%", minHeight: 0 }}
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={playDisabled}
        className={`playback-action-btn flex h-[52px] min-w-[5.5rem] shrink-0 items-center justify-center rounded-full border-0 px-5 text-2xl text-white outline-none transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 md:h-[58px] md:min-w-[6.25rem] md:px-6 md:text-3xl
          ${playDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:scale-[1.06] active:scale-[0.97]"}`}
        style={{
          backgroundColor: playDisabled ? "#475569" : "#ff4081",
          borderRadius: 9999,
          boxShadow: playDisabled ? "inset 0 1px 0 rgba(255,255,255,0.08)" : playGlow,
        }}
        aria-label="Play"
      >
        ▶
      </button>

      <button
        type="button"
        onClick={onSkip}
        disabled={skipDisabled}
        className={`playback-action-btn flex h-11 min-w-[10.5rem] shrink-0 flex-row items-center justify-center gap-1.5 rounded-full border-0 px-6 text-sm font-semibold tracking-wide text-white outline-none transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 md:h-12 md:min-w-[12.5rem] md:gap-2 md:px-8 md:text-base lg:min-w-[13.5rem] lg:px-9
          ${skipDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:scale-[1.03] active:scale-[0.98]"}`}
        style={{
          backgroundColor: skipDisabled ? "#475569" : "#00bcd4",
          borderRadius: 9999,
          boxShadow: skipDisabled ? "inset 0 1px 0 rgba(255,255,255,0.08)" : skipGlow,
        }}
      >
        <span className="text-xl leading-none drop-shadow-sm md:text-2xl">⏭</span>
        <span className="leading-none drop-shadow-sm">Skip to Next</span>
      </button>
    </div>
  );
}
