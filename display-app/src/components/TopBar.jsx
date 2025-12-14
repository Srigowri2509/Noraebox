import React from "react";

export default function TopBar({ timerLeft }) {
  const format = (s) => {
    if (s === null || s === undefined) return "--:--:--";
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);

    if (hrs > 0)
      return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-16 glass z-50 flex items-center px-6 justify-between">
      {/* LEFT: Song preview injected by Display.jsx */}
      <div id="next-song-preview" className="text-white text-lg font-semibold"></div>

      {/* RIGHT: Timer */}
      <div className="text-xl font-bold">
        Time left:{" "}
        <span className="text-cyan-300">
          {format(timerLeft)}
        </span>
      </div>
    </div>
  );
}
