import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

const BLACK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Cut from 350 → 150 ms. waitPlaying already gates on the "playing" event
// (video is actively advancing), so this extra buffer was overcautious and
// added up to ~200 ms of dead time on every karaoke / transition swap.
const SWAP_STABILIZE_MS = 150;
const PRELOAD_WARM_MS = 150;
const HIDDEN_KARAOKE_RETRY_MS = 600;
const UNSUPPORTED_MEDIA_CODES = new Set([4]);

function normalizeMediaUrl(u) {
  if (!u) return "";
  try {
    return String(u).split("#")[0];
  } catch {
    return String(u);
  }
}

function isUnsupportedMediaError(code, message) {
  const msg = String(message || "").toLowerCase();
  if (UNSUPPORTED_MEDIA_CODES.has(Number(code))) return true;
  return (
    msg.includes("format error") ||
    msg.includes("no supported sources") ||
    msg.includes("notsupportederror") ||
    msg.includes("media_element_error")
  );
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
    const suppressPauseRecoveryRef = useRef(false);
    const activeKaraokeUrlRef = useRef("");
    const lastProgressTimeRef = useRef(0);
    const lastProgressWallClockRef = useRef(0);
    const lastRecoveryAtRef = useRef(0);
    const unsupportedKaraokeUrlRef = useRef("");

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
      suppressPauseRecoveryRef.current = true;
      try {
        video.pause();
        video.muted = true;
        video.volume = 0;
      } catch {
        /* ignore */
      }
      slotModeRef.current[slot] = "idle";
      // 24/7 hygiene + snap-pic fix:
      // - removeAttribute('src') + load() releases the decoder/audio buffer
      //   so the WebView doesn't accumulate media-pipeline state across
      //   hundreds of clips per day.
      // - It also clears the last-frame "snap pic" the user would otherwise
      //   see while the next clip loads on the hidden slot; the slot falls
      //   back to BLACK_POSTER and the #000 video-stage-base shows through.
      try {
        if (video.currentSrc || video.getAttribute("src")) {
          video.removeAttribute("src");
          video.load();
        }
      } catch {
        /* ignore */
      }
      suppressPauseRecoveryRef.current = false;
    }, [slotEl]);

    const silenceAllSlots = useCallback(() => {
      loadTokenRef.current += 1;
      activeKaraokeUrlRef.current = "";
      silenceSlot("a");
      silenceSlot("b");
    }, [silenceSlot]);

    const showSlot = useCallback(
      (slot) => {
        const other = slot === "a" ? "b" : "a";
        silenceSlot(other);
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

        // Karaoke: if the decoder is advancing, swap in — don't reject for low readyState.
        if (mode === "karaoke") {
          if (video.paused) {
            // Some browsers briefly flip paused=true between autoplay retries.
            // Nudge once more before giving up this swap.
            try {
              await video.play();
            } catch {
              /* ignore */
            }
            const resumed = await waitPlaying(video, 1500);
            if (!resumed) {
              console.warn("[VIDEO] karaoke still paused before swap", url);
              return false;
            }
          }
        } else if (video.paused || video.readyState < 2) {
          console.warn("[VIDEO] transition unstable before swap — pausing", url);
          try {
            video.pause();
            video.muted = true;
          } catch {
            /* ignore */
          }
          return false;
        }

        showSlot(slot);

        if (mode === "karaoke") {
          activeKaraokeUrlRef.current = normalizeMediaUrl(url);
          karaokeStartedAtRef.current = Date.now();
          tryUnmuteKaraoke(video, slot);
        }
        return true;
      },
      [slotEl, showSlot, tryUnmuteKaraoke]
    );

    const swapToUrlRef = useRef(null);

    const scheduleKaraokeRetry = useCallback((url) => {
      if (
        unsupportedKaraokeUrlRef.current &&
        normalizeMediaUrl(url) === unsupportedKaraokeUrlRef.current
      ) {
        console.warn("[VIDEO] unsupported karaoke URL — retry disabled", url);
        return;
      }
      pendingKaraokeUrlRef.current = url;
      if (hiddenKaraokeRetryRef.current) {
        window.clearTimeout(hiddenKaraokeRetryRef.current);
      }
      hiddenKaraokeRetryRef.current = window.setTimeout(() => {
        hiddenKaraokeRetryRef.current = null;
        const retryUrl = pendingKaraokeUrlRef.current;
        if (!retryUrl) return;
        console.log("[VIDEO] retry karaoke load", retryUrl);
        void swapToUrlRef.current?.(retryUrl, "karaoke");
      }, HIDDEN_KARAOKE_RETRY_MS);
    }, []);

    const bothSlotsIdle = useCallback(() => {
      return (
        slotModeRef.current.a === "idle" &&
        slotModeRef.current.b === "idle"
      );
    }, []);

    const swapToUrl = useCallback(
      async (url, mode) => {
        if (!url) return;
        if (
          mode === "karaoke" &&
          unsupportedKaraokeUrlRef.current &&
          normalizeMediaUrl(url) === unsupportedKaraokeUrlRef.current
        ) {
          console.warn("[VIDEO] unsupported karaoke URL — swap blocked", url);
          return;
        }
        const token = ++loadTokenRef.current;
        const hidden = hiddenSlot();
        const visible = activeSlotRef.current;
        const visibleMode = slotModeRef.current[visible];

        // Tablet skip during transition: load karaoke on the visible slot instead of
        // silencing the visible transition and loading hidden (hidden load can fail on
        // web and leaves a blank/white frame with no recovery).
        if (mode === "karaoke" && visibleMode === "transition") {
          if (hiddenKaraokeRetryRef.current) {
            window.clearTimeout(hiddenKaraokeRetryRef.current);
            hiddenKaraokeRetryRef.current = null;
          }
          pendingKaraokeUrlRef.current = null;
          silenceSlot(hidden);
          const ok = await playOnSlot(visible, url, mode, token);
          if (ok) return;
          if (loadTokenRef.current !== token) return;
          console.warn("[VIDEO] visible karaoke swap failed — trying hidden slot", url);
          const okHidden = await playOnSlot(hidden, url, mode, token);
          if (okHidden) return;
          if (loadTokenRef.current !== token) return;
          scheduleKaraokeRetry(url);
          return;
        }

        // First song / cold start: load on visible slot (works better with browser autoplay).
        if (mode === "karaoke" && bothSlotsIdle()) {
          if (hiddenKaraokeRetryRef.current) {
            window.clearTimeout(hiddenKaraokeRetryRef.current);
            hiddenKaraokeRetryRef.current = null;
          }
          pendingKaraokeUrlRef.current = null;
          const okVisible = await playOnSlot(visible, url, mode, token);
          if (okVisible) return;
          if (loadTokenRef.current !== token) return;
          console.warn("[VIDEO] visible cold-start failed — trying hidden slot", url);
          const okHidden = await playOnSlot(hidden, url, mode, token);
          if (okHidden) return;
          if (loadTokenRef.current !== token) return;
          scheduleKaraokeRetry(url);
          return;
        }

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

        if (mode === "karaoke") {
          console.warn("[VIDEO] hidden karaoke swap failed — trying visible slot", url);
          const okVisible = await playOnSlot(visible, url, mode, token);
          if (okVisible) return;
          if (loadTokenRef.current !== token) return;
          scheduleKaraokeRetry(url);
        }
      },
      [hiddenSlot, playOnSlot, scheduleKaraokeRetry, silenceSlot, bothSlotsIdle]
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
        } catch (err) {
          slotModeRef.current[hidden] = "idle";
          // Ignore expected interruption when another swap pauses preload.
          if (preloadTokenRef.current === token && String(err?.name || "") !== "AbortError") {
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
      void swapToUrl(next, "transition");
    }, [swapToUrl]);

    useEffect(() => {
      if (!preloadUrl) return;
      // Allow preload whenever a song or transition is on screen — the hidden
      // slot is free, so primng the browser cache here makes the next swap
      // near-instant. We only skip when the active slot is in "logo" mode
      // (nothing queued / between sessions) since there's no song coming.
      const activeMode = slotModeRef.current[activeSlotRef.current];
      if (activeMode !== "karaoke" && activeMode !== "transition") return;
      const hidden = hiddenSlot();
      const hiddenMode = slotModeRef.current[hidden];
      if (hiddenMode === "karaoke" || hiddenMode === "preload") return;
      void warmPreloadOnHiddenSlot(preloadUrl);
    }, [preloadUrl, warmPreloadOnHiddenSlot]);

    useEffect(() => {
      const url = song?.videoUrl ? String(song.videoUrl) : "";
      if (url) {
        if (
          unsupportedKaraokeUrlRef.current &&
          normalizeMediaUrl(url) !== unsupportedKaraokeUrlRef.current
        ) {
          unsupportedKaraokeUrlRef.current = "";
        }
        const norm = normalizeMediaUrl(url);
        const active = activeSlotRef.current;
        const video = slotEl(active);
        const alreadyPlaying =
          slotModeRef.current[active] === "karaoke" &&
          norm === activeKaraokeUrlRef.current &&
          video &&
          !video.paused;
        if (alreadyPlaying) return;
        void swapToUrl(url, "karaoke");
      } else {
        activeKaraokeUrlRef.current = "";
        if (idleMode === "logo") {
          silenceAllSlots();
        } else if (
          idleMode === "transition" &&
          slotModeRef.current[activeSlotRef.current] !== "transition"
        ) {
          silenceAllSlots();
          startTransition();
        }
      }
    }, [song?.videoUrl, idleMode, swapToUrl, startTransition, silenceAllSlots, slotEl]);

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
          silenceSlot(slot);
          onEndedRef.current?.();
          // Transition is started by Display clearing videoUrl — not here.
        } else if (slotMode === "transition") {
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
        // Ignore errors that fire after our intentional silenceSlot() clears src.
        if (!video?.getAttribute("src") && !video?.currentSrc) return;
        const url = video?.currentSrc || video?.src || "";
        const errCode = video?.error?.code;
        const errMessage = video?.error?.message;
        console.warn("[VIDEO] error", url, errCode, video?.error?.message);
        if (String(url).includes("/stream") && errCode === 4) {
          console.error(
            "[VIDEO] Media not supported — restart backend and confirm S3 key exists for this song"
          );
        }
        onErrorRef.current?.({
          videoUrl: url,
          code: errCode,
          message: video?.error?.message,
        });

        if (slotModeRef.current[slot] === "karaoke" && isUnsupportedMediaError(errCode, errMessage)) {
          const norm = normalizeMediaUrl(url);
          unsupportedKaraokeUrlRef.current = norm;
          pendingKaraokeUrlRef.current = null;
          if (hiddenKaraokeRetryRef.current) {
            window.clearTimeout(hiddenKaraokeRetryRef.current);
            hiddenKaraokeRetryRef.current = null;
          }
          console.warn("[VIDEO] marked unsupported karaoke URL, stopped retries", norm);
        }
      },
      [slotEl]
    );

    // 24/7 stall recovery: HTML5 `waiting`/`stalled` fire when the decoder
    // or network buffer underruns mid-playback (common on long-running TVs).
    // Nudge play() — never skip, only resume the same stream.
    const onSlotStall = useCallback(
      (slot) => () => {
        if (suppressPauseRecoveryRef.current) return;
        if (activeSlotRef.current !== slot) return;
        const video = slotEl(slot);
        const mode = slotModeRef.current[slot];
        if (!video || mode !== "karaoke") return;
        const url = normalizeMediaUrl(video.currentSrc || video.src || "");
        if (unsupportedKaraokeUrlRef.current && url === unsupportedKaraokeUrlRef.current) return;
        if (video.paused) {
          console.warn("[VIDEO] stall detected — resuming", video.currentSrc || video.src);
          try {
            Promise.resolve(video.play()).catch(() => {});
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
        const url = normalizeMediaUrl(video.currentSrc || video.src || "");
        if (unsupportedKaraokeUrlRef.current && url === unsupportedKaraokeUrlRef.current) return;
        if (!video.paused) return;
        console.warn("[VIDEO] visibility resume — re-playing active karaoke");
        try {
          Promise.resolve(video.play()).catch(() => {});
        } catch {
          /* ignore */
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [slotEl]);

    // Freeze watchdog:
    // Only nudge play() when truly stalled. Do NOT reload/swap same URL here,
    // because that can restart playback from 0 on transient startup jitter.
    useEffect(() => {
      const interval = window.setInterval(() => {
        const slot = activeSlotRef.current;
        const video = slotEl(slot);
        if (!video) return;
        if (slotModeRef.current[slot] !== "karaoke") return;

        const now = Date.now();
        const t = Number(video.currentTime || 0);

        if (lastProgressWallClockRef.current === 0) {
          lastProgressWallClockRef.current = now;
          lastProgressTimeRef.current = t;
          return;
        }

        const dtWall = now - lastProgressWallClockRef.current;
        const dtPlay = t - lastProgressTimeRef.current;

        // Still moving, keep snapshot fresh.
        if (dtPlay > 0.2) {
          lastProgressWallClockRef.current = now;
          lastProgressTimeRef.current = t;
          return;
        }

        // Startup freeze guard:
        // Some Edge/WebView runs stall around 0-2 s with paused=false and
        // readyState looking healthy. If progress has been flat for long
        // enough, treat this as a real freeze even during startup.
        if (t < 5 && dtWall < 5000) return;
        // Give it longer before declaring frozen.
        if (dtWall < 7000) return;
        // Cooldown between recoveries so we don't thrash.
        if (now - lastRecoveryAtRef.current < 12000) return;

        const url = video.currentSrc || video.src || "";
        if (!url) return;
        const norm = normalizeMediaUrl(url);
        if (unsupportedKaraokeUrlRef.current && norm === unsupportedKaraokeUrlRef.current) return;
        // Do not rely only on paused/readyState here — those can look healthy
        // while currentTime is frozen at startup on some browser builds.

        lastRecoveryAtRef.current = now;
        lastProgressWallClockRef.current = now;
        lastProgressTimeRef.current = t;

        console.warn("[VIDEO] freeze watchdog recovery", { url, t });
        try {
          Promise.resolve(video.play()).catch(() => {});
        } catch {
          /* ignore */
        }
      }, 1000);

      return () => window.clearInterval(interval);
    }, [slotEl]);

    // Immediately stop playback on BOTH slots (audio + video) without
    // clearing src. Used for hard cut-to-logo on session end so the user
    // doesn't hear a stale audio tail; the React commit that flips both
    // slots to opacity 0 then handles the visual hide atomically.
    const pauseAllSlots = useCallback(() => {
      // Abort any in-flight load/play loops first.
      loadTokenRef.current += 1;
      // Mark both slots idle BEFORE pausing — the karaoke onPause stall-
      // recovery would otherwise see mode === "karaoke" and immediately
      // call play() to undo our pause.
      if (slotModeRef.current.a === "karaoke") slotModeRef.current.a = "idle";
      if (slotModeRef.current.b === "karaoke") slotModeRef.current.b = "idle";
      try {
        const va = videoARef.current;
        if (va) {
          va.muted = true;
          va.volume = 0;
          va.pause();
        }
      } catch {
        /* ignore */
      }
      try {
        const vb = videoBRef.current;
        if (vb) {
          vb.muted = true;
          vb.volume = 0;
          vb.pause();
        }
      } catch {
        /* ignore */
      }
      console.log("[AUDIO] all slots paused (no src clear)");
    }, []);

    useImperativeHandle(ref, () => ({
      play: () => activeEl()?.play(),
      pause: () => activeEl()?.pause(),
      getActiveVideo: activeEl,
      warmPreload: (url) => warmPreloadOnHiddenSlot(url),
      stopKaraokeAudio: () => silenceAllSlots(),
      pauseAllSlots,
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
