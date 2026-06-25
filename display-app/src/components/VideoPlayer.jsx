import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { safeSessionGet, safeSessionSet } from "../utils/safeStorage";
import { isLowPowerDevice, isNativeAndroidDisplay } from "../utils/device";

const BLACK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Android TV / set-top hardware usually exposes only 1–2 simultaneous video
// decoders, unlike desktop Chrome. Keeping the song + preloaded-next + transition
// all decoding at once (3) starves the decoder pool, which shows up as a black
// transition (it loses the decoder race) and stuttering playback (software
// fallback). On these devices we cap concurrent decoding at two by releasing
// decoders the moment they're no longer on screen. Desktop keeps the original
// fully-preloaded, gapless path.
const LOW_POWER = isLowPowerDevice();

function normalizeMediaUrl(u) {
  if (!u) return "";
  try {
    return String(u).split("#")[0];
  } catch {
    return String(u);
  }
}

function configureVideo(video) {
  if (!video) return;
  video.defaultMuted = true;
  video.controls = false;
  video.removeAttribute("controls");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.playsInline = true;
}

/** Wait two animation frames so a just-played frame is actually painted
 *  before we toggle its layer visible (prevents a flash of the old/black
 *  frame on slow GPUs/CPUs). */
function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** TVs need a beat after src removal before a new decoder can be allocated. */
function waitDecoderRelease() {
  return isNativeAndroidDisplay() || isLowPowerDevice()
    ? new Promise((resolve) => window.setTimeout(resolve, 400))
    : Promise.resolve();
}

function needsNativeDecoderCare() {
  return isNativeAndroidDisplay() || isLowPowerDevice();
}

function formatPlayError(err) {
  if (!err) return { name: "unknown", message: "" };
  return { name: err.name || "Error", message: err.message || String(err) };
}

function videoLog(tag, detail) {
  const ts = Date.now();
  if (detail !== undefined) {
    console.log(`[VIDEO] ${tag}`, detail, ts);
  } else {
    console.log(`[VIDEO] ${tag}`, ts);
  }
}

function handoffLog(tag, detail) {
  const ts = Date.now();
  if (detail !== undefined) {
    console.log(`[HANDOFF] ${tag}`, detail, ts);
  } else {
    console.log(`[HANDOFF] ${tag}`, ts);
  }
}

/** Resolve once the element has enough buffered data to start playing. */
function waitCanPlay(video, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!video) {
      resolve(false);
      return;
    }
    if (video.readyState >= 3) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      window.clearTimeout(tid);
      video.removeEventListener("canplaythrough", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onReady);
      resolve(ok);
    };
    // Android TV WebView sometimes reports a high readyState before it can
    // actually play; require HAVE_FUTURE_DATA (>=3). Only finish on an event
    // once that threshold is genuinely reached (loadeddata fires at rs=2).
    const onReady = () => {
      if (video.readyState >= 3) finish(true);
    };
    video.addEventListener("canplaythrough", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onReady);
    const tid = window.setTimeout(() => finish(video.readyState >= 3), timeoutMs);
  });
}

/** Resolve once the element is actually advancing (the "playing" event). */
function waitPlaying(video, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!video) {
      resolve(false);
      return;
    }
    if (!video.paused && video.readyState >= 3) {
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
    const tid = window.setTimeout(() => finish(!video.paused && video.readyState >= 3), timeoutMs);
  });
}

/**
 * Playback stage with three permanently-mounted <video> elements and a logo.
 *
 *   - songA / songB : the two song slots (ping-pong). One is the visible
 *                     "current song", the other holds the PRELOADED next song.
 *   - transition    : holds the PRELOADED transition clip.
 *   - logo          : idle image.
 *
 * Every element exists in the DOM at all times. State changes are pure
 * visibility toggles + .play() on already-loaded media. We never add/remove
 * elements and never load media at the moment of a transition.
 *
 * Imperative API (see useImperativeHandle):
 *   armNext(url)        preload a song into the hidden next slot
 *   armTransition(url)  preload the transition clip
 *   playSong(url)       show + play a song (instant if it was armed)
 *   playTransition()    show + play the armed transition (muted)
 *   cutToLogo()         hard stop everything, show the logo
 *   retryActive()       re-attempt play()/unmute on the visible song
 *   getActiveVideo()    the currently visible song element (or null)
 */
const VideoPlayer = forwardRef(
  (
    {
      logoSrc = "/logo_noraebox.png",
      onSongEnded,
      onTransitionEnded,
      onSongError,
    },
    ref
  ) => {
    const songARef = useRef(null);
    const songBRef = useRef(null);
    const transRef = useRef(null);

    // Which physical element currently holds the song vs the preloaded next.
    const roleRef = useRef({ song: "a", next: "b" });
    // Visible layer: 'a' | 'b' | 't' | 'logo'.
    const [front, setFront] = useState("logo");
    const frontRef = useRef("logo");
    // Coarse stage used by event handlers to ignore stale media events.
    const stageRef = useRef("logo"); // 'logo' | 'song' | 'transition'

    const armedNextUrlRef = useRef("");
    const armedTransUrlRef = useRef("");
    // Bumped on skip so a slow in-flight playSong cannot swap layers after a
    // newer skip has already taken over (common on TV where waitPlaying is slow).
    const playSeqRef = useRef(0);
    const loadSeqRef = useRef({ a: 0, b: 0, t: 0 });
    const playbackBusyRef = useRef(false);
    const endedFiredRef = useRef(false);
    const transitionEndedFiredRef = useRef(false);
    const songHandoffAtRef = useRef(0);
    const userInteractedRef = useRef(
      safeSessionGet("video_autoplay_enabled") === "true"
    );

    const cbRef = useRef({});
    useEffect(() => {
      cbRef.current = { onSongEnded, onTransitionEnded, onSongError };
    }, [onSongEnded, onTransitionEnded, onSongError]);

    const elById = useCallback((id) => {
      if (id === "a") return songARef.current;
      if (id === "b") return songBRef.current;
      if (id === "t") return transRef.current;
      return null;
    }, []);

    const songEl = useCallback(() => elById(roleRef.current.song), [elById]);
    const nextEl = useCallback(() => elById(roleRef.current.next), [elById]);

    const slotId = useCallback(
      (el) => {
        if (!el) return "?";
        if (el === songARef.current) return "a";
        if (el === songBRef.current) return "b";
        if (el === transRef.current) return "t";
        return "?";
      },
      []
    );

    useEffect(() => {
      configureVideo(songARef.current);
      configureVideo(songBRef.current);
      configureVideo(transRef.current);

      const attachDiag = (el, id) => {
        if (!el) return;
        el.addEventListener("loadedmetadata", () => videoLog("LOADEDMETADATA", id));
        el.addEventListener("canplay", () => videoLog("CANPLAY", { id, rs: el.readyState }));
        el.addEventListener("error", () => {
          videoLog("ERROR_EVENT", {
            id,
            code: el.error?.code,
            message: el.error?.message,
          });
        });
      };
      attachDiag(songARef.current, "a");
      attachDiag(songBRef.current, "b");
      attachDiag(transRef.current, "t");
    }, []);

    const setVisible = useCallback((id) => {
      frontRef.current = id;
      setFront(id);
    }, []);

    /** Pause + release an element's decoder. Awaits decoder drain on TV hardware. */
    const silence = useCallback(
      async (el) => {
        if (!el) return;
        const id = slotId(el);
        videoLog("SILENCE", id);
        try {
          el.pause();
          el.muted = true;
          el.volume = 0;
          if (el.currentSrc || el.getAttribute("src")) {
            el.removeAttribute("src");
            el.load();
          }
        } catch {
          /* ignore */
        }
        if (needsNativeDecoderCare()) {
          await waitDecoderRelease();
        }
      },
      [slotId]
    );

    /** Load a url into an element and wait until it can play. Never shows it. */
    const loadInto = useCallback(
      async (el, url, timeoutMs = 15000) => {
        if (!el || !url) return false;
        const id = slotId(el);
        const myLoad = ++loadSeqRef.current[id];
        const staleLoad = () => myLoad !== loadSeqRef.current[id];
        configureVideo(el);
        el.loop = false;
        el.muted = true;
        el.volume = 0;
        el.preload = "auto";
        if (normalizeMediaUrl(el.src) !== normalizeMediaUrl(url)) {
          videoLog("SET_SRC", { id, url: normalizeMediaUrl(url) });
          el.src = url;
          try {
            el.load();
          } catch {
            /* ignore */
          }
        }
        const ok = await waitCanPlay(el, timeoutMs);
        if (staleLoad()) return false;
        return ok;
      },
      [slotId]
    );

    /**
     * Start an element playing using the muted-first pattern. Muted autoplay is
     * always permitted by the browser, so we always start muted, then unmute
     * once playback is confirmed AND the user has interacted (unmuting without
     * a gesture pauses the element on some browsers). Every play() is wrapped
     * in try/catch with a single retry so a rejected play() can never silently
     * stall the state machine.
     */
    const startPlayback = useCallback(
      async (el, { withSound, urgent = false, coldStart = false, waitReadyMs = 0 } = {}) => {
        if (!el) return false;
        const id = slotId(el);
        const readyDeadline = Date.now() + (waitReadyMs || (needsNativeDecoderCare() ? 2500 : 0));
        while (el.readyState < 2 && Date.now() < readyDeadline) {
          await new Promise((r) => window.setTimeout(r, 50));
        }
        if (el.readyState < 2) {
          videoLog("PLAY_BLOCKED_NOT_READY", { id, rs: el.readyState });
          return false;
        }
        el.volume = withSound ? 1 : 0;
        el.muted = true;

        const attemptPlay = async (label) => {
          videoLog("PLAY_ATTEMPT", { id, label, rs: el.readyState, paused: el.paused });
          await el.play();
          videoLog("PLAY_SUCCESS", { id, label });
        };

        try {
          await attemptPlay("primary");
        } catch (err) {
          const info = formatPlayError(err);
          videoLog("PLAY_FAILED", { id, ...info });
          // load() during handoff aborts a pending play() — wait and retry once.
          if (info.name === "AbortError" && needsNativeDecoderCare()) {
            await waitDecoderRelease();
          }
          try {
            await attemptPlay("retry");
          } catch (err2) {
            videoLog("PLAY_FAILED", { id, ...formatPlayError(err2), phase: "retry" });
            return false;
          }
        }

        const playWaitMs = urgent ? 4000 : coldStart ? 6000 : 12000;
        const ok = await waitPlaying(el, playWaitMs);
        if (!ok) {
          videoLog("PLAY_STALL", { id, rs: el.readyState, paused: el.paused });
        }
        if (ok && withSound && userInteractedRef.current) {
          try {
            el.muted = false;
            el.volume = 1;
          } catch (err) {
            videoLog("UNMUTE_FAILED", formatPlayError(err));
          }
        }
        return ok;
      },
      [slotId]
    );

    // ---- Imperative API -------------------------------------------------

    const armTransition = useCallback(
      async (url) => {
        if (!url) return;
        if (normalizeMediaUrl(armedTransUrlRef.current) === normalizeMediaUrl(url)) {
          return;
        }
        armedTransUrlRef.current = url;
        await loadInto(transRef.current, url);
      },
      [loadInto]
    );

    const armNext = useCallback(
      async (url) => {
        if (!url) return;
        const el = nextEl();
        if (!el) return;
        if (normalizeMediaUrl(armedNextUrlRef.current) === normalizeMediaUrl(url)) {
          return;
        }
        armedNextUrlRef.current = url;
        await loadInto(el, url);
      },
      [loadInto, nextEl]
    );

    /**
     * Show + play a song. If `url` matches the element already preloaded in the
     * hidden next slot, this is an instant visibility toggle. Otherwise we load
     * it into the next slot first (skip to a non-preloaded target), then swap.
     */
    const playSong = useCallback(
      async (url, { urgent = false, coldStart = false, afterTransition = false } = {}) => {
        if (!url) return false;
        const mySeq = ++playSeqRef.current;
        const stale = () => mySeq !== playSeqRef.current;
        const loadTimeoutMs = urgent ? 8000 : coldStart ? 10000 : 15000;
        playbackBusyRef.current = true;

        if (afterTransition) {
          // Seamless handoff: next song was prefetched during the transition clip.
          // Only release the transition decoder — keep the preloaded next slot intact.
          await silence(transRef.current);
          if (stale()) return false;
        } else if (LOW_POWER || needsNativeDecoderCare()) {
          await silence(transRef.current);
          if (stale()) return false;
        }

        if (urgent && !afterTransition) {
          // Stop the visible song immediately so skip feels instant on TV.
          const cur = songEl();
          if (cur) {
            try {
              cur.pause();
              cur.muted = true;
              cur.volume = 0;
            } catch {
              /* ignore */
            }
          }
          if (needsNativeDecoderCare()) {
            await silence(transRef.current);
          }
        }

        const incoming = nextEl();
        if (!incoming) {
          playbackBusyRef.current = false;
          return false;
        }

        const minReady = urgent || afterTransition ? 2 : 3;
        const preloaded =
          (afterTransition ||
            (!LOW_POWER && !needsNativeDecoderCare())) &&
          normalizeMediaUrl(incoming.src) === normalizeMediaUrl(url) &&
          incoming.readyState >= minReady;
        if (!preloaded) {
          if ((LOW_POWER || needsNativeDecoderCare()) && !afterTransition) {
            await silence(incoming);
            if (stale()) {
              playbackBusyRef.current = false;
              return false;
            }
          }
          const ok = await loadInto(incoming, url, loadTimeoutMs);
          if (stale()) {
            playbackBusyRef.current = false;
            return false;
          }
          if (!ok && incoming.readyState < minReady) {
            videoLog("LOAD_NOT_READY", { id: slotId(incoming), rs: incoming.readyState, minReady });
            playbackBusyRef.current = false;
            cbRef.current.onSongError?.({ videoUrl: url, message: "load not ready" });
            return false;
          }
        }

        if (afterTransition) {
          try {
            incoming.currentTime = 0;
          } catch {
            /* ignore */
          }
        }

        const playing = await startPlayback(incoming, {
          withSound: true,
          urgent: urgent || afterTransition,
          coldStart,
        });
        if (stale()) {
          playbackBusyRef.current = false;
          return false;
        }
        if (!playing) {
          playbackBusyRef.current = false;
          cbRef.current.onSongError?.({ videoUrl: url, message: "play failed" });
          return false;
        }

        const previousSongId = roleRef.current.song;
        const incomingId = roleRef.current.next;
        roleRef.current = { song: incomingId, next: previousSongId };
        armedNextUrlRef.current = "";
        endedFiredRef.current = false;
        stageRef.current = "song";
        songHandoffAtRef.current = Date.now();
        if (afterTransition) {
          setVisible(incomingId);
          await nextPaint();
        } else {
          await nextPaint();
          if (stale()) return false;
          setVisible(incomingId);
        }

        // Release the element we just swapped away from once the new song paints.
        const oldEl = elById(previousSongId);
        if (needsNativeDecoderCare()) {
          void silence(oldEl);
          void silence(transRef.current);
        } else {
          window.setTimeout(() => silence(oldEl), 600);
        }
        playbackBusyRef.current = false;
        return true;
      },
      [nextEl, songEl, loadInto, startPlayback, setVisible, elById, silence, slotId]
    );

    /** Pause the visible song and block stall-nudge from replaying it. */
    const freezeCurrentSong = useCallback(() => {
      endedFiredRef.current = true;
      const el = songEl();
      if (!el) return;
      try {
        el.pause();
        el.muted = true;
        el.volume = 0;
      } catch {
        /* ignore */
      }
    }, [songEl]);

    const playTransition = useCallback(async () => {
      const el = transRef.current;
      if (!el) return false;

      playbackBusyRef.current = true;
      freezeCurrentSong();

      // Drop any preloaded next song first — prevents a flash of the next clip
      // before the transition layer is shown.
      await silence(nextEl());
      armedNextUrlRef.current = "";

      // Keep the ended song frame visible until the transition is actually playing
      // (setVisible("black") caused the blank screen users reported in logs).

      const armed =
        armedTransUrlRef.current &&
        normalizeMediaUrl(el.src) === normalizeMediaUrl(armedTransUrlRef.current) &&
        el.readyState >= 3;
      if (!armed && armedTransUrlRef.current) {
        if (needsNativeDecoderCare()) {
          await silence(elById(roleRef.current.song));
        }
        const loaded = await loadInto(el, armedTransUrlRef.current);
        if (!loaded && el.readyState < 3) {
          playbackBusyRef.current = false;
          cbRef.current.onTransitionEnded?.();
          return false;
        }
      }
      if (!armedTransUrlRef.current) {
        cbRef.current.onTransitionEnded?.();
        return false;
      }
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
      stageRef.current = "transition";
      transitionEndedFiredRef.current = false;
      if (el.readyState < 3) {
        await waitCanPlay(el, 4000);
      }
      let playing = await startPlayback(el, { withSound: false, waitReadyMs: 3000 });
      if (!playing) {
        handoffLog("transition play retry", { rs: el.readyState });
        await waitCanPlay(el, 2000);
        playing = await startPlayback(el, { withSound: false, waitReadyMs: 2000 });
      }
      if (!playing) {
        playbackBusyRef.current = false;
        handoffLog("transition play failed — skipping clip", { rs: el.readyState });
        cbRef.current.onTransitionEnded?.();
        return false;
      }
      // Swap to transition only after its first frame is ready; then release song.
      await nextPaint();
      setVisible("t");
      if (needsNativeDecoderCare()) {
        void silence(elById(roleRef.current.song));
      }
      playbackBusyRef.current = false;
      return true;
    }, [loadInto, startPlayback, setVisible, silence, elById, nextEl, freezeCurrentSong]);

    const abortTransition = useCallback(async () => {
      playSeqRef.current += 1;
      await silence(transRef.current);
      stageRef.current = "logo";
    }, [silence]);

    /** Release the visible song decoder (e.g. before postEnded network wait). */
    const releaseSongDecoder = useCallback(async () => {
      await silence(songEl());
    }, [silence, songEl]);

    /** Hold the transition on its last frame while the next song buffers. */
    const freezeTransitionFrame = useCallback(() => {
      const el = transRef.current;
      if (!el) return;
      try {
        const dur = Number(el.duration || 0);
        if (dur > 0) {
          el.currentTime = Math.max(0, dur - 0.034);
        }
        el.pause();
      } catch {
        /* ignore */
      }
      setVisible("t");
      stageRef.current = "transition";
      handoffLog("freeze transition frame", { rs: el.readyState });
    }, [setVisible]);

    /**
     * Start loading the next song into the hidden slot while the transition
     * clip plays (uses the second hardware decoder on TV).
     */
    const beginHandoffLoad = useCallback(
      async (url) => {
        if (!url) return;
        const incoming = nextEl();
        if (!incoming) return;
        const urlNorm = normalizeMediaUrl(url);
        if (normalizeMediaUrl(incoming.src) === urlNorm && incoming.readyState >= 1) {
          handoffLog("prefetch already started", { rs: incoming.readyState });
          return;
        }
        handoffLog("prefetch during transition", { url: urlNorm });
        await loadInto(incoming, url, 20000);
      },
      [nextEl, loadInto]
    );

    /**
     * Transition ended → keep transition visible → wait for next song (up to
     * timeoutMs) → play song → release transition. Never silences transition
     * until the song is ready to play.
     */
    const handoffToSong = useCallback(
      async (url, { timeoutMs = 5000, pollMs = 150 } = {}) => {
        if (!url) return { ok: false, reason: "no-url" };
        const mySeq = ++playSeqRef.current;
        const stale = () => mySeq !== playSeqRef.current;
        playbackBusyRef.current = true;
        const t0 = Date.now();
        const incoming = nextEl();
        const id = slotId(incoming);
        const urlNorm = normalizeMediaUrl(url);
        const minReady = 2;

        freezeTransitionFrame();

        if (!incoming) {
          playbackBusyRef.current = false;
          return { ok: false, reason: "no-slot", elapsedMs: 0 };
        }

        if (normalizeMediaUrl(incoming.src) !== urlNorm) {
          handoffLog("waiting for next song", { id, rs: incoming.readyState });
          void loadInto(incoming, url, timeoutMs + 5000);
        }

        const deadline = t0 + timeoutMs;
        let readyAt = 0;
        while (Date.now() < deadline) {
          if (stale()) {
            playbackBusyRef.current = false;
            return { ok: false, reason: "stale", elapsedMs: Date.now() - t0, readyState: incoming.readyState };
          }
          handoffLog("song readyState", { id, rs: incoming.readyState, elapsedMs: Date.now() - t0 });
          if (incoming.readyState >= minReady) {
            readyAt = Date.now();
            handoffLog("next song became ready", { id, rs: incoming.readyState, elapsedMs: readyAt - t0 });
            break;
          }
          await new Promise((r) => window.setTimeout(r, pollMs));
        }

        if (incoming.readyState < minReady) {
          handoffLog("timeout -> logo", { id, rs: incoming.readyState, elapsedMs: Date.now() - t0 });
          playbackBusyRef.current = false;
          return { ok: false, reason: "timeout", readyState: incoming.readyState, elapsedMs: Date.now() - t0 };
        }

        handoffLog("starting next song", { id, rs: incoming.readyState, waitMs: readyAt - t0 });

        await silence(transRef.current);
        if (needsNativeDecoderCare()) {
          await waitDecoderRelease();
        }
        if (stale()) {
          playbackBusyRef.current = false;
          return { ok: false, reason: "stale", elapsedMs: Date.now() - t0, readyState: incoming.readyState };
        }

        try {
          incoming.currentTime = 0;
        } catch {
          /* ignore */
        }

        let playing = await startPlayback(incoming, {
          withSound: true,
          urgent: true,
          coldStart: true,
          waitReadyMs: 2000,
        });
        if (!playing && incoming.readyState >= 2) {
          handoffLog("song play retry", { id, rs: incoming.readyState });
          playing = await startPlayback(incoming, {
            withSound: true,
            urgent: true,
            coldStart: true,
            waitReadyMs: 1500,
          });
        }
        if (stale()) {
          playbackBusyRef.current = false;
          return { ok: false, reason: "stale", elapsedMs: Date.now() - t0, readyState: incoming.readyState };
        }
        if (!playing) {
          playbackBusyRef.current = false;
          return {
            ok: false,
            reason: "play-failed",
            readyState: incoming.readyState,
            elapsedMs: Date.now() - t0,
          };
        }

        const previousSongId = roleRef.current.song;
        const incomingId = roleRef.current.next;
        roleRef.current = { song: incomingId, next: previousSongId };
        armedNextUrlRef.current = "";
        endedFiredRef.current = false;
        stageRef.current = "song";
        songHandoffAtRef.current = Date.now();
        setVisible(incomingId);
        await nextPaint();

        void silence(elById(previousSongId));
        playbackBusyRef.current = false;
        handoffLog("handoff complete", { id, elapsedMs: Date.now() - t0, waitMs: readyAt - t0 });
        return {
          ok: true,
          readyState: incoming.readyState,
          elapsedMs: Date.now() - t0,
          waitMs: readyAt - t0,
        };
      },
      [nextEl, slotId, loadInto, startPlayback, setVisible, silence, elById, freezeTransitionFrame]
    );

    /** Release all video decoders before loading the next song (TV path). */
    const prepareForNextSong = useCallback(async () => {
      playSeqRef.current += 1;
      await Promise.all([
        silence(elById(roleRef.current.song)),
        silence(nextEl()),
        silence(transRef.current),
      ]);
      armedNextUrlRef.current = "";
      armedTransUrlRef.current = "";
      endedFiredRef.current = false;
    }, [silence, elById, nextEl]);

    const cutToLogo = useCallback(() => {
      stageRef.current = "logo";
      armedNextUrlRef.current = "";
      endedFiredRef.current = false;
      setVisible("logo");
      // Stop audio immediately; release decoders shortly after the logo paints.
      [songARef.current, songBRef.current, transRef.current].forEach((el) => {
        if (!el) return;
        try {
          el.pause();
          el.muted = true;
          el.volume = 0;
        } catch {
          /* ignore */
        }
      });
      window.setTimeout(() => {
        [songARef.current, songBRef.current, transRef.current].forEach((el) => void silence(el));
      }, 600);
    }, [setVisible, silence]);

    const retryActive = useCallback(() => {
      userInteractedRef.current = true;
      safeSessionSet("video_autoplay_enabled", "true");
      if (stageRef.current !== "song" || playbackBusyRef.current) return;
      const el = songEl();
      if (!el || el.readyState < 2) return;
      el.muted = false;
      el.volume = 1;
      videoLog("PLAY_ATTEMPT", { id: slotId(el), label: "retryActive", rs: el.readyState });
      Promise.resolve(el.play())
        .then(() => videoLog("PLAY_SUCCESS", { id: slotId(el), label: "retryActive" }))
        .catch((err) => videoLog("PLAY_FAILED", { id: slotId(el), ...formatPlayError(err), label: "retryActive" }));
    }, [songEl, slotId]);

    const interruptForSkip = useCallback(async () => {
      playSeqRef.current += 1;
      const cur = songEl();
      if (cur) {
        try {
          cur.pause();
          cur.muted = true;
          cur.volume = 0;
        } catch {
          /* ignore */
        }
      }
      if (needsNativeDecoderCare()) {
        await silence(transRef.current);
      }
    }, [songEl, silence]);

    useImperativeHandle(ref, () => ({
      armNext,
      armTransition,
      playSong,
      playTransition,
      cutToLogo,
      abortTransition,
      prepareForNextSong,
      releaseSongDecoder,
      freezeCurrentSong,
      freezeTransitionFrame,
      beginHandoffLoad,
      handoffToSong,
      retryActive,
      interruptForSkip,
      getActiveVideo: () => (stageRef.current === "song" ? songEl() : null),
      getDebug: () => {
        const el = stageRef.current === "song" ? songEl() : elById(frontRef.current);
        return {
          front: frontRef.current,
          stage: stageRef.current,
          readyState: el ? el.readyState : -1,
          paused: el ? el.paused : true,
          currentTime: el ? Math.round((el.currentTime || 0) * 10) / 10 : 0,
        };
      },
    }));

    // ---- Media events ---------------------------------------------------

    const onEndedFor = useCallback(
      (id) => () => {
        if (id === "t") {
          if (stageRef.current !== "transition") return;
          if (transitionEndedFiredRef.current) return;
          transitionEndedFiredRef.current = true;
          videoLog("ENDED", id);
          cbRef.current.onTransitionEnded?.();
          return;
        }
        // Song element: only the visible song slot may signal completion.
        if (stageRef.current !== "song") return;
        if (roleRef.current.song !== id) return;
        if (endedFiredRef.current) return;
        endedFiredRef.current = true;
        videoLog("ENDED", id);
        const endedEl = elById(id);
        if (endedEl) {
          try {
            endedEl.pause();
            endedEl.muted = true;
            endedEl.volume = 0;
          } catch {
            /* ignore */
          }
        }
        cbRef.current.onSongEnded?.();
      },
      [elById]
    );

    const onErrorFor = useCallback(
      (id) => () => {
        const el = elById(id);
        if (!el?.getAttribute("src") && !el?.currentSrc) return;
        const url = el?.currentSrc || el?.src || "";
        const code = el?.error?.code;
        if (id === "t") {
          if (stageRef.current === "transition") {
            if (transitionEndedFiredRef.current) return;
            transitionEndedFiredRef.current = true;
            cbRef.current.onTransitionEnded?.();
          }
          return;
        }
        if (stageRef.current === "song" && roleRef.current.song === id) {
          cbRef.current.onSongError?.({ videoUrl: url, code, message: el?.error?.message });
        }
      },
      [elById]
    );

    // 24/7 stall nudge + end-of-tail completion. If the visible song pauses
    // unexpectedly, resume it. If it is stuck on the final frame without
    // firing "ended" (common on some TVs), force completion so the controller
    // can move on. handleSongEnded is idempotent (lock-guarded) on the
    // controller side, so a duplicate with the native event is harmless.
    const tailRef = useRef({ t: 0, at: 0 });
    const transTailRef = useRef({ t: 0, at: 0 });
    useEffect(() => {
      const interval = window.setInterval(() => {
        if (stageRef.current === "transition") {
          const tel = transRef.current;
          if (tel && !tel.paused && tel.readyState >= 2) {
            const t = Number(tel.currentTime || 0);
            const dur = Number(tel.duration || 0);
            const now = Date.now();
            if (dur > 0 && dur - t <= 0.5) {
              if (transTailRef.current.at === 0) {
                transTailRef.current = { t, at: now };
              } else if (now - transTailRef.current.at >= 800) {
                transTailRef.current = { t: 0, at: 0 };
                if (transitionEndedFiredRef.current) return;
                transitionEndedFiredRef.current = true;
                cbRef.current.onTransitionEnded?.();
              }
            } else {
              transTailRef.current = { t: 0, at: 0 };
            }
          }
          return;
        }

        if (stageRef.current !== "song") return;
        if (playbackBusyRef.current) return;
        const el = songEl();
        if (!el) return;

        const t = Number(el.currentTime || 0);
        const dur = Number(el.duration || 0);
        const now = Date.now();

        if (endedFiredRef.current) return;

        if (el.paused && el.readyState >= 2) {
          const handoffAge = Date.now() - songHandoffAtRef.current;
          // Avoid a second play() right after transition handoff — causes a visible restart.
          if (handoffAge >= 0 && handoffAge < 3000 && t > 0) return;
          // Song reached the end — never restart it; controller is moving on.
          if (dur > 0 && t >= dur - 1) return;
          const id = slotId(el);
          videoLog("PLAY_ATTEMPT", { id, label: "stall-nudge", rs: el.readyState });
          Promise.resolve(el.play())
            .then(() => videoLog("PLAY_SUCCESS", { id, label: "stall-nudge" }))
            .catch((err) => videoLog("PLAY_FAILED", { id, ...formatPlayError(err), label: "stall-nudge" }));
        }

        if (dur > 0 && dur - t <= 0.6) {
          if (tailRef.current.at === 0) {
            tailRef.current = { t, at: now };
          } else if (now - tailRef.current.at >= 1200) {
            tailRef.current = { t: 0, at: 0 };
            if (endedFiredRef.current) return;
            endedFiredRef.current = true;
            cbRef.current.onSongEnded?.();
          }
        } else {
          tailRef.current = { t, at: 0 };
        }
      }, 1000);
      return () => window.clearInterval(interval);
    }, [songEl, slotId]);

    // Resume the visible song after the TV/webview returns from background.
    useEffect(() => {
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        if (stageRef.current !== "song" || playbackBusyRef.current) return;
        const el = songEl();
        if (el && el.paused && el.readyState >= 2) {
          const id = slotId(el);
          videoLog("PLAY_ATTEMPT", { id, label: "visibility-resume", rs: el.readyState });
          Promise.resolve(el.play())
            .then(() => videoLog("PLAY_SUCCESS", { id, label: "visibility-resume" }))
            .catch((err) => videoLog("PLAY_FAILED", { id, ...formatPlayError(err), label: "visibility-resume" }));
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [songEl, slotId]);

    // ---- Render ---------------------------------------------------------

    const cls = (id) =>
      `video-element video-slot ${
        front === id && front !== "black" ? "video-slot--front" : "video-slot--back"
      }`;

    const videoProps = {
      poster: BLACK_POSTER,
      muted: true,
      preload: "auto",
      playsInline: true,
      disablePictureInPicture: true,
      disableRemotePlayback: true,
      controls: false,
      controlsList: "nodownload noplaybackrate nofullscreen noremoteplayback",
    };

    return (
      <div className="video-dual-stack">
        <div className="video-stage-base" aria-hidden="true" />

        <video
          ref={songARef}
          id="videoA"
          className={cls("a")}
          {...videoProps}
          onEnded={onEndedFor("a")}
          onError={onErrorFor("a")}
        />
        <video
          ref={songBRef}
          id="videoB"
          className={cls("b")}
          {...videoProps}
          onEnded={onEndedFor("b")}
          onError={onErrorFor("b")}
        />
        <video
          ref={transRef}
          id="videoT"
          className={cls("t")}
          {...videoProps}
          onEnded={onEndedFor("t")}
          onError={onErrorFor("t")}
        />

        {front === "logo" ? (
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
