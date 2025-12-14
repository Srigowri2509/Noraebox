import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/*
  Very simple video player wrapper.
  - if song && song.videoUrl => plays it
  - else shows a poster/placeholder
  - forwards `play`, `pause` if needed
*/
const VideoPlayer = forwardRef(({ song, onEnded }, ref) => {
  const vref = useRef();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (song && vref.current) {
      try {
        vref.current.load();
        setLoading(true);
        const playPromise = vref.current.play();
        if (playPromise && playPromise.then) {
          playPromise.then(() => setLoading(false)).catch(() => setLoading(false));
        }
      } catch (e) {
        setLoading(false);
      }
    }
  }, [song]);

  useImperativeHandle(ref, () => ({
    play: () => vref.current && vref.current.play(),
    pause: () => vref.current && vref.current.pause(),
  }));

  if (!song || !song.videoUrl) {
    // placeholder (empty stage)
    return (
      <div className="video-placeholder">
        <div className="poster-text">Waiting for song...</div>
      </div>
    );
  }

  return (
    <div className="video-wrapper">
      <video
        ref={vref}
        className="video-element"
        onEnded={() => onEnded && onEnded()}
        controls={false}
        playsInline
        autoPlay
      >
        <source src={song.videoUrl} />
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

export default VideoPlayer;
