import React from "react";

export default function TimerDisplay({ minutes = 60 }) {
  const mm = Math.floor(minutes);
  const ss = Math.round((minutes - mm) * 60);
  return (
    <div className="text-white font-semibold text-lg">
      {`${mm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`}
    </div>
  );
}
