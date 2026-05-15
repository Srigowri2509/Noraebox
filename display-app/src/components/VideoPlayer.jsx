import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

function normalizeMediaUrl(u) {
  if (!u) return "";
  try {
    return String(u).split("#")[0];
  } catch {
    return String(u);
  }
}

function pickRandomTransition(paths) {
  if (!paths || paths.length === 0) return "";
  const i = Math.floor(Math.random() * paths.length);
  return paths[i] || "";
}

const HAVE_FUTURE_DATA = 3;

/** Android TV WebView: never call play() until media has enough data (canplay / loadeddata). */
function waitUntilMediaCanPlay(video, key, playRetryRef, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!video) {
      resolve();
      return;
    }
    if (video.readyState >= HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(tid);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplaythrough", onReady);
      resolve();
    };
    const onReady = () => {
      if (playRetryRef.current.key !== key) return;
      finish();
    };
    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplaythrough", onReady);
    const tid = window.setTimeout(finish, timeoutMs);
  });
}

const VideoPlayer = forwardRef(
  (
    {
      song,
      transitionVideoUrls = [],
      idleMode = "transition", // "logo" | "transition"
      logoSrc = "/logo_norebox.jpg",
      onEnded,
      onError,
    },
    ref
  ) => {
    const videoRef = useRef(null);
    const onEndedRef = useRef(onEnded);
    const onErrorRef = useRef(onError);
    const transitionVideoUrlsRef = useRef(transitionVideoUrls);
    const modeRef = useRef("idle"); // "karaoke" | "transition" | "idle"
    const activeSrcRef = useRef("");
    const transitionSrcRef = useRef("");
    const playRetryRef = useRef({ key: "", attempts: 0, timer: null });
    const [isVideoVisible, setIsVideoVisible] = useState(false);

    useEffect(() => {
      onEndedRef.current = onEnded;
      onErrorRef.current = onError;
      transitionVideoUrlsRef.current = transitionVideoUrls;
    }, [onEnded, onError, transitionVideoUrls]);

    const clearPlayRetry = useCallback(() => {
      if (playRetryRef.current.timer) {
        window.clearTimeout(playRetryRef.current.timer);
      }
      playRetryRef.current.timer = null;
      playRetryRef.current.attempts = 0;
      playRetryRef.current.key = "";
    }, []);

    const ensurePlaying = useCallback(
      (key) => {
        const video = videoRef.current;
        if (!video) return;
        if (playRetryRef.current.key !== key) {
          clearPlayRetry();
          playRetryRef.current.key = key;
        }

        video.muted = true;
        video.controls = false;
        video.removeAttribute("controls");

        const tryPlay = async () => {
          if (playRetryRef.current.key !== key) return;
          await waitUntilMediaCanPlay(video, key, playRetryRef);
          if (playRetryRef.current.key !== key) return;
          try {
            await video.play();
            setIsVideoVisible(true);
            clearPlayRetry();
          } catch (err) {
            setIsVideoVisible(false);
            onErrorRef.current?.({ videoUrl: video.currentSrc || video.src, message: String(err) });
            const attempts = (playRetryRef.current.attempts || 0) + 1;
            playRetryRef.current.attempts = attempts;
            if (attempts > 8) return;
            const delay = Math.min(2500, 400 + attempts * 350);
            playRetryRef.current.timer = window.setTimeout(async () => {
              if (playRetryRef.current.key !== key) return;
              try {
                video.load();
              } catch {
                /* ignore */
              }
              await tryPlay();
            }, delay);
          }
        };

        void tryPlay();
      },
      [clearPlayRetry]
    );

    const startTransition = useCallback(() => {
      const video = videoRef.current;
      const paths = transitionVideoUrlsRef.current || [];
      if (!video || paths.length === 0) return;

      modeRef.current = "transition";
      const next = pickRandomTransition(paths);
      if (!next) return;
      transitionSrcRef.current = normalizeMediaUrl(next);
      activeSrcRef.current = transitionSrcRef.current;

      video.loop = false; // we want ended events to rotate clips
      video.src = next;
      setIsVideoVisible(false);
      try {
        video.load();
      } catch {
        /* ignore */
      }
      ensurePlaying(activeSrcRef.current);
    }, [ensurePlaying]);

    const startKaraoke = useCallback(
      (url) => {
        const video = videoRef.current;
        if (!video || !url) return;

        modeRef.current = "karaoke";
        const key = normalizeMediaUrl(url);
        activeSrcRef.current = key;
        transitionSrcRef.current = "";

        video.loop = false;
        video.src = url;
        setIsVideoVisible(false);
        try {
          video.load();
        } catch {
          /* ignore */
        }
        ensurePlaying(key);
      },
      [ensurePlaying]
    );

    // Keep ONE video element mounted; just swap src.
    useEffect(() => {
      const url = song?.videoUrl ? String(song.videoUrl) : "";
      if (url) {
        startKaraoke(url);
      } else if (idleMode === "transition") {
        startTransition();
      } else {
        modeRef.current = "idle";
        setIsVideoVisible(false);
        const v = videoRef.current;
        if (v) {
          v.pause();
          v.removeAttribute("src");
          try {
            v.load();
          } catch {
            /* ignore */
          }
        }
      }
      return () => clearPlayRetry();
    }, [song?.videoUrl, idleMode, startKaraoke, startTransition, clearPlayRetry]);

    // Force-disable controls at runtime to avoid flashes on some TV browsers/WebViews.
    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      v.controls = false;
      v.removeAttribute("controls");
    }, []);

    const onEndedInternal = useCallback(() => {
      if (modeRef.current === "karaoke") {
        // Karaoke ended -> tell backend, then immediately play transition clips while waiting.
        onEndedRef.current?.();
        startTransition();
        return;
      }
      // Transition ended -> rotate another transition clip.
      startTransition();
    }, [startTransition]);

    const togglePlayPause = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    }, []);

    // Remote keys support (Android TV)
    useEffect(() => {
      const onKeyDown = (event) => {
        const code = event.code || event.key || "";
        const keyCode = event.keyCode;
        const isToggle =
          code === "MediaPlayPause" ||
          code === "Space" ||
          code === "Enter" ||
          keyCode === 415 ||
          keyCode === 19 ||
          keyCode === 179;
        const isPause = code === "MediaPause" || keyCode === 413;
        const isPlay = code === "MediaPlay" || keyCode === 415;
        if (!(isToggle || isPause || isPlay)) return;
        event.preventDefault();
        if (isPause) return videoRef.current?.pause();
        if (isPlay) return videoRef.current?.play().catch(() => {});
        togglePlayPause();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [togglePlayPause]);

    useImperativeHandle(
      ref,
      () => ({
        play: () => videoRef.current?.play(),
        pause: () => videoRef.current?.pause(),
        toggle: () => togglePlayPause(),
        getActiveVideo: () => videoRef.current,
        getCurrentSrc: () => {
          const el = videoRef.current;
          return el?.currentSrc || el?.src || "";
        },
      }),
      []
    );

    return (
      <div
        className="video-dual-stack"
        role="button"
        tabIndex={0}
        aria-label="Toggle play/pause"
        onPointerDown={(e) => {
          // Allow user to pause/play without exposing native controls UI.
          e.preventDefault();
          togglePlayPause();
        }}
        onKeyDown={(e) => {
          // Backup: Enter/Space toggles when container is focused.
          const code = e.code || e.key || "";
          if (code === "Enter" || code === "Space") {
            e.preventDefault();
            togglePlayPause();
          }
        }}
      >
        {idleMode === "logo" && !song?.videoUrl ? (
          <div className="video-placeholder">
            <img
              src={logoSrc}
              alt="Norebox logo"
              className="logo-fallback"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          </div>
        ) : null}
        <video
          ref={videoRef}
          className="video-element video-layer-main video-layer-main--visible"
          playsInline
          webkitPlaysInline
          autoPlay
          muted
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
          style={{
            opacity: isVideoVisible ? 1 : 0,
            visibility: isVideoVisible ? "visible" : "hidden",
            transition: "opacity 160ms linear",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          onPlaying={() => setIsVideoVisible(true)}
          onEnded={onEndedInternal}
          onError={(e) => {
            const el = videoRef.current;
            const code = el?.error?.code;
            const msg = el?.error?.message;
            onErrorRef.current?.({ videoUrl: el?.currentSrc || el?.src, code, message: msg, event: e });
            // retry same src (no skipping)
            ensurePlaying(activeSrcRef.current || normalizeMediaUrl(el?.currentSrc || el?.src || ""));
          }}
        />
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
