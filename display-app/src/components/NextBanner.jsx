import React, { useEffect, useRef, useState } from "react";

/*
  Slides a compact "Next Up" banner from left every 30s for 3s.
  When no nextSong -> does not show.
*/
export default function NextBanner({ nextSong }) {
  const [visible, setVisible] = useState(false);
  const ivRef = useRef();

  useEffect(() => {
    // if no nextSong don't schedule
    clearInterval(ivRef.current);

    if (!nextSong) return;

    // show immediately then schedule repeats
    const showOnce = () => {
      setVisible(true);
      setTimeout(() => setVisible(false), 3000); // visible for 3s
    };

    // show first time now
    showOnce();

    // every 30s show again
    ivRef.current = setInterval(showOnce, 30000);
    return () => clearInterval(ivRef.current);
  }, [nextSong]);

  if (!nextSong) return null;

  return (
    <div className={`next-banner ${visible ? "in" : "out"}`}>
      <div className="next-inner">
        <div className="play-pill">▶</div>
        <div className="next-text">
          <div className="next-title">Next Up</div>
          <div className="next-song">{nextSong.title} — {nextSong.artist}</div>
        </div>
      </div>
    </div>
  );
}
