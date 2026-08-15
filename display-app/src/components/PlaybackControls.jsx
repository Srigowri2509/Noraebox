import React, { useEffect } from "react";

export default function PlaybackControls({ playerRef }) {
  useEffect(() => {
    // Samsung/Tizen requires media keys to be registered before keydown events
    // are delivered to the web application. Android TV delivers them directly.
    try {
      const tvInput = window.tizen?.tvinputdevice;
      ["MediaPlayPause", "MediaRewind", "MediaFastForward"].forEach((key) => {
        tvInput?.registerKey?.(key);
      });
    } catch (error) {
      console.warn("Could not register TV remote media keys", error);
    }

    const handleKey = (event) => {
      const playback = playerRef.current?.getPlaybackState?.();
      if (!playback?.available) return;

      const code = Number(event.keyCode || event.which || 0);
      const targetTag = String(event.target?.tagName || "").toLowerCase();
      const isInteractiveTarget = targetTag === "button" || targetTag === "input" || targetTag === "select";

      // OK/Enter is the primary navigation/selection key on a TV remote. It
      // must never pause kiosk playback; otherwise selecting a prompt can
      // leave the display looking permanently stuck. Only dedicated media
      // play/pause keys control playback.
      const playPause =
        event.key === "MediaPlayPause" ||
        event.key === "PlayPause" ||
        [85, 179].includes(code);
      const rewind =
        event.key === "MediaRewind" ||
        [89, 227].includes(code) ||
        (!isInteractiveTarget && (event.key === "ArrowLeft" || code === 21));
      const forward =
        event.key === "MediaFastForward" ||
        [90, 228].includes(code) ||
        (!isInteractiveTarget && (event.key === "ArrowRight" || code === 22));

      if (playPause) {
        event.preventDefault();
        if (playback.paused) playerRef.current?.resumeActive?.();
        else playerRef.current?.pauseActive?.();
      } else if (rewind) {
        event.preventDefault();
        playerRef.current?.seekActive?.(-10);
      } else if (forward) {
        event.preventDefault();
        playerRef.current?.seekActive?.(10);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [playerRef]);

  return null;
}
