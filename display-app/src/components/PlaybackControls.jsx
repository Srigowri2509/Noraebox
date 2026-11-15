import React, { useEffect } from "react";

export default function PlaybackControls({ playerRef }) {
  useEffect(() => {
    // Samsung/Tizen requires media keys to be registered before keydown events
    // are delivered to the web application. Android TV delivers them directly.
    try {
      const tvInput = window.tizen?.tvinputdevice;
      const mediaKeys = [
        "MediaPlayPause",
        "MediaPlay",
        "MediaPause",
        "MediaRewind",
        "MediaFastForward",
      ];

      if (tvInput?.registerKeyBatch) tvInput.registerKeyBatch(mediaKeys);
      else mediaKeys.forEach((key) => tvInput?.registerKey?.(key));
    } catch (error) {
      console.warn("Could not register TV remote media keys", error);
    }

    const handleKey = (event) => {
      const playback = playerRef.current?.getPlaybackState?.();
      if (!playback?.available) return;

      const code = Number(event.keyCode || event.which || 0);
      const targetTag = String(event.target?.tagName || "").toLowerCase();
      const activeTag = String(document.activeElement?.tagName || "").toLowerCase();
      const editableTags = ["input", "select", "textarea"];
      const isEditableTarget =
        editableTags.includes(targetTag) ||
        editableTags.includes(activeTag) ||
        Boolean(event.target?.isContentEditable) ||
        Boolean(document.activeElement?.isContentEditable);
      const selectionUiOpen = Boolean(
        document.querySelector(".interaction-gate, .display-modal-backdrop")
      );

      // Center OK toggles playback on the normal song screen. When a prompt or
      // startup gate is visible, OK remains a UI-selection key and must not
      // leak through to playback.
      const centerOk =
        !event.repeat &&
        !selectionUiOpen &&
        !isEditableTarget &&
        (event.key === "Enter" || [13, 23, 29443].includes(code));
      const playPause =
        event.key === "MediaPlayPause" ||
        event.key === "PlayPause" ||
        event.key === "MediaPlay" ||
        event.key === "MediaPause" ||
        [19, 85, 179, 415, 10252].includes(code) ||
        centerOk;
      const rewind =
        event.key === "MediaRewind" ||
        [89, 227, 412].includes(code) ||
        (!selectionUiOpen &&
          !isEditableTarget &&
          (event.key === "ArrowLeft" || [21, 37].includes(code)));
      const forward =
        event.key === "MediaFastForward" ||
        [90, 228, 417].includes(code) ||
        (!selectionUiOpen &&
          !isEditableTarget &&
          (event.key === "ArrowRight" || [22, 39].includes(code)));

      if (playPause) {
        event.preventDefault();
        event.stopPropagation();
        if (playback.paused) playerRef.current?.resumeActive?.();
        else playerRef.current?.pauseActive?.();
      } else if (rewind) {
        event.preventDefault();
        event.stopPropagation();
        playerRef.current?.seekActive?.(-10);
      } else if (forward) {
        event.preventDefault();
        event.stopPropagation();
        playerRef.current?.seekActive?.(10);
      }
    };
    // Capture the event before focused controls or the TV browser consume it.
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [playerRef]);

  return null;
}
