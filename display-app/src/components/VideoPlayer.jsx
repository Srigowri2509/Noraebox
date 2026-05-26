import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

const BLACK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const SWAP_STABILIZE_MS = 350;
const PRELOAD_WARM_MS = 150;
const HIDDEN_KARAOKE_RETRY_MS = 600;

function normalizeMediaUrl(u) {
  if (!u) return "";
  try {
    return String(u).split("#")[0];
  } catch {
    return String(u);
  }
}

function pickRandomTransition(paths, avoidUrl) {
  if (!paths?.length) return "";
  const pool = avoidUrl ? paths.filter((p) => normalizeMediaUrl(p) !== normalizeMediaUrl(avoidUrl)) : paths;
  const list = pool.length ? pool : paths;
  return list[Math.floor(Math.random() * list.length)] || "";
}

function configureVideo(video) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.controls = false;
  video.removeAttribute("controls");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.playsInline = true;
}

function waitReady(video, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!video) {
      resolve();
      return;
    }
    if (video.readyState >= 3) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(tid);
      video.removeEventListener("canplaythrough", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onReady);
      resolve();
    };
    const onReady = () => finish();
    video.addEventListener("canplaythrough", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onReady);
    const tid = window.setTimeout(finish, timeoutMs);
  });
}

function waitPlaying(video, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!video) {
      resolve(false);
      return;
    }
    if (!video.paused && video.readyState >= 2) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      window.clearTimeout(tid);
      video.removeEventListener("playing", onPlaying);
      resolve(ok);
    };
    const onPlaying = () => finish(true);
    video.addEventListener("playing", onPlaying);
    const tid = window.setTimeout(() => finish(!video.paused && video.readyState >= 2), timeoutMs);
  });
}

/**
 * Dual permanently mounted <video> elements (videoA / videoB).
 * Hidden slot loads + plays + stabilizes, then opacity swap — never reload visible slot.
 */
const VideoPlayer = forwardRef(
  (
    {
      song,
      preloadUrl = null,
      transitionVideoUrls = [],
      idleMode = "transition",
      endWithLogo = false,
      logoSrc = "/logo_noraebox.png",
      onEnded,
      onError,
      onTransitionClipEnded,
    },
    ref
  ) => {
    const videoARef = useRef(null);
    const videoBRef = useRef(null);
    const onEndedRef = useRef(onEnded);
    const onErrorRef = useRef(onError);
    const onTransitionClipEndedRef = useRef(onTransitionClipEnded);
    const transitionUrlsRef = useRef(transitionVideoUrls);
    const activeSlotRef = useRef("a");
    const loadTokenRef = useRef(0);
    const slotModeRef = useRef({ a: "idle", b: "idle" });
    const lastTransitionRef = useRef("");
    const karaokeStartedAtRef = useRef(0);
    const preloadTokenRef = useRef(0);
    const hiddenKaraokeRetryRef = useRef(null);
    const pendingKaraokeUrlRef = useRef(null);
    const userInteractedRef = useRef(sessionStorage.getItem("video_autoplay_enabled") === "true");
    const [activeSlot, setActiveSlot] = useState("a");

    const slotEl = useCallback((slot) => (slot === "a" ? videoARef.current : videoBRef.current), []);
    const hiddenSlot = useCallback(() => (activeSlotRef.current === "a" ? "b" : "a"), []);
    const activeEl = useCallback(() => slotEl(activeSlotRef.current), [slotEl]);
    useEffect(() => {
      onEndedRef.current = onEnded;
      onErrorRef.current = onError;
      onTransitionClipEndedRef.current = onTransitionClipEnded;
      transitionUrlsRef.current = transitionVideoUrls;
    }, [onEnded, onError, onTransitionClipEnded, transitionVideoUrls]);

    useEffect(() => {
      configureVideo(videoARef.current);
      configureVideo(videoBRef.current);
    }, []);

    useEffect(() => {
      return () => {
        if (hiddenKaraokeRetryRef.current) {
          window.clearTimeout(hiddenKaraokeRetryRef.current);
        }
      };
    }, []);

    const silenceSlot = useCallback((slot) => {
      const video = slotEl(slot);
      if (!video) return;
      try {
        video.pause();
        video.muted = true;
        video.volume = 0;
      } catch {
        /* ignore */
      }
      if (slotModeRef.current[slot] === "karaoke") {
        slotModeRef.current[slot] = "idle";
      }
    }, [slotEl]);

    const silenceAllSlots = useCallback(() => {
      loadTokenRef.current += 1;
      silenceSlot("a");
      silenceSlot("b");
      console.log("[AUDIO] all slots silenced");
    }, [silenceSlot]);

    const showSlot = useCallback(
      (slot) => {
        const other = slot === "a" ? "b" : "a";
        silenceSlot(other);
        console.log("[SWAP] visible slot", slot);
        activeSlotRef.current = slot;
        setActiveSlot(slot);
      },
      [silenceSlot]
    );

    const tryUnmuteKaraoke = useCallback((video, slot) => {
      if (!video || slotModeRef.current[slot] !== "karaoke") return;
      video.volume = 1;
      if (userInteractedRef.current) {
        video.muted = false;
        return;
      }
      video.muted = false;
      if (!video.muted) {
        userInteractedRef.current = true;
        sessionStorage.setItem("video_autoplay_enabled", "true");
      }
    }, []);

    const playOnSlot = useCallback(
      async (slot, url, mode, token) => {
        const video = slotEl(slot);
        if (!video || !url) return false;

        console.log("[VIDEO] loading", url);

        configureVideo(video);
        video.loop = false;
        slotModeRef.current[slot] = mode;
        if (mode === "karaoke") {
          video.volume = 1;
        }

        if (normalizeMediaUrl(video.src) !== normalizeMediaUrl(url)) {
          video.src = url;
          try {
            video.load();
          } catch {
            /* ignore */
          }
        }

        await waitReady(video);
        if (loadTokenRef.current !== token) return false;

        let played = false;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (loadTokenRef.current !== token) return false;
          video.muted = true;
          try {
            await video.play();
          } catch (err) {
            if (attempt === 3) {
              console.warn("[VIDEO] play failed", url, err);
              onErrorRef.current?.({ videoUrl: url, message: String(err) });
              return false;
            }
            await new Promise((r) => window.setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          const isPlaying = await waitPlaying(video);
          if (isPlaying) {
            played = true;
            break;
          }
        }

        if (!played || loadTokenRef.current !== token) {
          try {
            video.pause();
            video.muted = true;
          } catch {
            /* ignore */
          }
          return false;
        }

        console.log("[VIDEO] playing", url);

        await new Promise((r) => window.setTimeout(r, SWAP_STABILIZE_MS));

        if (loadTokenRef.current !== token) {
          try {
            video.pause();
            video.muted = true;
          } catch {
            /* ignore */
          }
          return false;
        }

        // Karaoke: swap when actually playing — avoid audio-only on hidden slot (opacity 0).
        const unstable = video.paused || video.readyState < 2;
        if (unstable) {
          if (mode === "karaoke" && !video.paused) {
            console.log("[VIDEO] karaoke swap (playing, stabilizing readyState)", url);
          } else {
            console.warn("[VIDEO] Playback unstable before swap — pausing", url);
            try {
              video.pause();
              video.muted = true;
            } catch {
              /* ignore */
            }
            return false;
          }
        }

        showSlot(slot);

        if (mode === "karaoke") {
          karaokeStartedAtRef.current = Date.now();
          tryUnmuteKaraoke(video, slot);
        }
        return true;
      },
      [slotEl, showSlot, tryUnmuteKaraoke]
    );

    const swapToUrlRef = useRef(null);

    const scheduleHiddenKaraokeRetry = useCallback((url) => {
      pendingKaraokeUrlRef.current = url;
      if (hiddenKaraokeRetryRef.current) {
        window.clearTimeout(hiddenKaraokeRetryRef.current);
      }
      hiddenKaraokeRetryRef.current = window.setTimeout(() => {
        hiddenKaraokeRetryRef.current = null;
        const retryUrl = pendingKaraokeUrlRef.current;
        if (!retryUrl) return;
        if (slotModeRef.current[activeSlotRef.current] !== "transition") return;
        console.log("[VIDEO] retry hidden karaoke preload", retryUrl);
        void swapToUrlRef.current?.(retryUrl, "karaoke");
      }, HIDDEN_KARAOKE_RETRY_MS);
    }, []);

    const swapToUrl = useCallback(
      async (url, mode) => {
        if (!url) return;
        const token = ++loadTokenRef.current;
        const hidden = hiddenSlot();
        const visible = activeSlotRef.current;

        // Stop karaoke audio on the visible slot before transition/karaoke loads on hidden.
        if (mode === "transition" || mode === "karaoke") {
          silenceSlot(visible);
        }

        const ok = await playOnSlot(hidden, url, mode, token);
        if (ok) {
          pendingKaraokeUrlRef.current = null;
          if (hiddenKaraokeRetryRef.current) {
            window.clearTimeout(hiddenKaraokeRetryRef.current);
            hiddenKaraokeRetryRef.current = null;
          }
          return;
        }
        if (loadTokenRef.current !== token) return;

        // Never reload the visible slot — keep transition running and retry hidden only.
        if (mode === "karaoke" && slotModeRef.current[activeSlotRef.current] === "transition") {
          console.warn("[VIDEO] hidden karaoke swap failed — will retry", url);
          scheduleHiddenKaraokeRetry(url);
        }
      },
      [hiddenSlot, playOnSlot, scheduleHiddenKaraokeRetry, silenceSlot]
    );

    swapToUrlRef.current = swapToUrl;

    const warmPreloadOnHiddenSlot = useCallback(
      async (url) => {
        if (!url) return;
        const token = ++preloadTokenRef.current;
        const hidden = hiddenSlot();
        const video = slotEl(hidden);
        if (!video) return;

        if (normalizeMediaUrl(video.src) === normalizeMediaUrl(url)) return;

        console.log("[VIDEO] warm preload", url);

        configureVideo(video);
        video.muted = true;
        video.volume = 0;
        video.preload = "auto";
        slotModeRef.current[hidden] = "preload";

        if (normalizeMediaUrl(video.src) !== normalizeMediaUrl(url)) {
          video.src = url;
        }

        try {
          video.load();
          await video.play();
          await new Promise((r) => window.setTimeout(r, PRELOAD_WARM_MS));
          video.pause();
          video.currentTime = 0;
          video.muted = true;
          slotModeRef.current[hidden] = "idle";
          console.log("[VIDEO] warm preload ready", url);
        } catch (err) {
          slotModeRef.current[hidden] = "idle";
          if (preloadTokenRef.current === token) {
            console.warn("[VIDEO] Warm preload failed", url, err);
          }
        }
      },
      [hiddenSlot, slotEl]
    );

    const startTransition = useCallback(() => {
      const paths = transitionUrlsRef.current || [];
      if (!paths.length) return;
      const next = pickRandomTransition(paths, lastTransitionRef.current);
      if (!next) return;
      lastTransitionRef.current = normalizeMediaUrl(next);
      console.log("[TRANSITION] started", next);
      void swapToUrl(next, "transition");
    }, [swapToUrl]);

    useEffect(() => {
      if (!preloadUrl) return;
      if (slotModeRef.current[activeSlotRef.current] !== "transition") return;
      void warmPreloadOnHiddenSlot(preloadUrl);
    }, [preloadUrl, warmPreloadOnHiddenSlot]);

    useEffect(() => {
      const url = song?.videoUrl ? String(song.videoUrl) : "";
      if (url) {
        void swapToUrl(url, "karaoke");
      } else if (idleMode === "logo") {
        silenceAllSlots();
      } else if (
        idleMode === "transition" &&
        slotModeRef.current[activeSlotRef.current] !== "transition"
      ) {
        silenceAllSlots();
        startTransition();
      }
    }, [song?.videoUrl, idleMode, swapToUrl, startTransition, silenceAllSlots]);

    const onSlotEnded = useCallback(
      (slot) => () => {
        if (activeSlotRef.current !== slot) return;
        const video = slotEl(slot);
        const slotMode = slotModeRef.current[slot];
        const url = video?.currentSrc || video?.src || "";

        if (slotMode === "karaoke") {
          const playedSec = video?.currentTime || 0;
          const dur = video?.duration || 0;
          const elapsed = Date.now() - (karaokeStartedAtRef.current || 0);
          const nearEnd = dur > 0 && playedSec >= Math.max(2, dur * 0.85);
          const longEnough = elapsed >= 4000 || nearEnd;
          if (!longEnough) {
            console.warn("[VIDEO] ignored spurious ended", url, { playedSec, dur, elapsed });
            try {
              void video?.play();
            } catch {
              /* ignore */
            }
            return;
          }
          console.log("[VIDEO] ended", url);
          silenceSlot(slot);
          onEndedRef.current?.();
          // Transition is started by Display clearing videoUrl — not here.
        } else if (slotMode === "transition") {
          console.log("[TRANSITION] ended", url);
          slotModeRef.current[slot] = "idle";
          void (async () => {
            const handled = await onTransitionClipEndedRef.current?.();
            if (handled !== true && !endWithLogo) {
              startTransition();
            }
          })();
        }
      },
      [slotEl, startTransition, silenceSlot, endWithLogo]
    );

    const onSlotError = useCallback(
      (slot) => () => {
        const video = slotEl(slot);
        if (activeSlotRef.current !== slot) return;
        const url = video?.currentSrc || video?.src || "";
        console.warn("[VIDEO] error", url, video?.error?.code);
        onErrorRef.current?.({
          videoUrl: url,
          code: video?.error?.code,
          message: video?.error?.message,
        });
      },
      [slotEl]
    );

    // 24/7 stall recovery: HTML5 `waiting`/`stalled` fire when the decoder
    // or network buffer underruns mid-playback (common on long-running TVs).
    // Nudge play() — never skip, only resume the same stream.
    const onSlotStall = useCallback(
      (slot) => () => {
        if (activeSlotRef.current !== slot) return;
        const video = slotEl(slot);
        const mode = slotModeRef.current[slot];
        if (!video || mode !== "karaoke") return;
        if (video.paused) {
          console.warn("[VIDEO] stall detected — resuming", video.currentSrc || video.src);
          try {
            void video.play();
          } catch {
            /* ignore */
          }
        }
      },
      [slotEl]
    );

    // 24/7 visibility recovery: some Android TV webviews pause background
    // <video> elements on suspend. Resume the active karaoke when shown.
    useEffect(() => {
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        const slot = activeSlotRef.current;
        const video = slotEl(slot);
        if (!video) return;
        if (slotModeRef.current[slot] !== "karaoke") return;
        if (!video.paused) return;
        console.warn("[VIDEO] visibility resume — re-playing active karaoke");
        try {
          void video.play();
        } catch {
          /* ignore */
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [slotEl]);

    useImperativeHandle(ref, () => ({
      play: () => activeEl()?.play(),
      pause: () => activeEl()?.pause(),
      getActiveVideo: activeEl,
      warmPreload: (url) => warmPreloadOnHiddenSlot(url),
      stopKaraokeAudio: () => silenceAllSlots(),
    }));

    const showLogo = idleMode === "logo" && !song?.videoUrl;
    const slotClass = (slot) => {
      const base = "video-element video-slot";
      if (showLogo) return `${base} video-slot--back`;
      return `${base} ${activeSlot === slot ? "video-slot--front" : "video-slot--back"}`;
    };

    return (
      <div className="video-dual-stack">
        <div className="video-stage-base" aria-hidden="true" />

        <video
          ref={videoARef}
          id="videoA"
          className={slotClass("a")}
          poster={BLACK_POSTER}
          muted
          preload="auto"
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
          onEnded={onSlotEnded("a")}
          onError={onSlotError("a")}
          onWaiting={onSlotStall("a")}
          onStalled={onSlotStall("a")}
          onPause={onSlotStall("a")}
        />
        <video
          ref={videoBRef}
          id="videoB"
          className={slotClass("b")}
          poster={BLACK_POSTER}
          muted
          preload="auto"
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
          onEnded={onSlotEnded("b")}
          onError={onSlotError("b")}
          onWaiting={onSlotStall("b")}
          onStalled={onSlotStall("b")}
          onPause={onSlotStall("b")}
        />

        {showLogo ? (
          <div className="video-placeholder">
            <img src={logoSrc} alt="Norebox logo" className="logo-fallback" />
          </div>
        ) : null}
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
