import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const BLACK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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
    const onReady = () => finish(true);
    video.addEventListener("canplaythrough", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onReady);
    const tid = window.setTimeout(() => finish(video.readyState >= 2), timeoutMs);
  });
}

/** Resolve once the element is actually advancing (the "playing" event). */
function waitPlaying(video, timeoutMs = 12000) {
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
    const userInteractedRef = useRef(
      sessionStorage.getItem("video_autoplay_enabled") === "true"
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

    useEffect(() => {
      configureVideo(songARef.current);
      configureVideo(songBRef.current);
      configureVideo(transRef.current);
    }, []);

    const setVisible = useCallback((id) => {
      frontRef.current = id;
      setFront(id);
    }, []);

    /** Pause + release an element's decoder without disturbing the visible layer. */
    const silence = useCallback((el) => {
      if (!el) return;
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
    }, []);

    /** Load a url into an element and wait until it can play. Never shows it. */
    const loadInto = useCallback(async (el, url) => {
      if (!el || !url) return false;
      configureVideo(el);
      el.loop = false;
      el.muted = true;
      el.volume = 0;
      el.preload = "auto";
      if (normalizeMediaUrl(el.src) !== normalizeMediaUrl(url)) {
        el.src = url;
        try {
          el.load();
        } catch {
          /* ignore */
        }
      }
      return waitCanPlay(el, 15000);
    }, []);

    /**
     * Start an element playing using the muted-first pattern. Muted autoplay is
     * always permitted by the browser, so we always start muted, then unmute
     * once playback is confirmed AND the user has interacted (unmuting without
     * a gesture pauses the element on some browsers). Every play() is wrapped
     * in try/catch with a single retry so a rejected play() can never silently
     * stall the state machine.
     */
    const startPlayback = useCallback(async (el, { withSound }) => {
      if (!el) return false;
      el.volume = withSound ? 1 : 0;
      el.muted = true; // muted-first: always allowed to autoplay
      try {
        await el.play();
      } catch (err) {
        console.error("[PLAY FAILED]", err);
        try {
          await el.play(); // retry once
        } catch (err2) {
          console.error("[PLAY FAILED] retry", err2);
          return false;
        }
      }
      const ok = await waitPlaying(el, 12000);
      if (ok && withSound && userInteractedRef.current) {
        try {
          el.muted = false;
          el.volume = 1;
        } catch (err) {
          console.error("[UNMUTE FAILED]", err);
        }
      }
      return ok;
    }, []);

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
      async (url) => {
        if (!url) return false;
        const incoming = nextEl();
        if (!incoming) return false;

        const preloaded =
          normalizeMediaUrl(incoming.src) === normalizeMediaUrl(url) &&
          incoming.readyState >= 2;
        if (!preloaded) {
          const ok = await loadInto(incoming, url);
          if (!ok && incoming.readyState < 2) {
            // Last-ditch: still attempt to play; decoder may catch up.
          }
        }

        const playing = await startPlayback(incoming, { withSound: true });
        if (!playing) {
          cbRef.current.onSongError?.({ videoUrl: url, message: "play failed" });
          return false;
        }

        const previousSongId = roleRef.current.song;
        const incomingId = roleRef.current.next;
        // Promote: the preloaded element becomes the visible song; roles swap so
        // the old song element is now the free "next" slot for the next preload.
        roleRef.current = { song: incomingId, next: previousSongId };
        armedNextUrlRef.current = "";
        stageRef.current = "song";
        // Only reveal once the new frame is actually painted, so slow GPUs
        // never show a black/old frame during the opacity swap.
        await nextPaint();
        setVisible(incomingId);

        // Release the element we just swapped away from, after the swap settles.
        const oldEl = elById(previousSongId);
        window.setTimeout(() => silence(oldEl), 600);
        return true;
      },
      [nextEl, loadInto, startPlayback, setVisible, elById, silence]
    );

    const playTransition = useCallback(async () => {
      const el = transRef.current;
      if (!el) return false;
      const armed =
        armedTransUrlRef.current &&
        normalizeMediaUrl(el.src) === normalizeMediaUrl(armedTransUrlRef.current) &&
        el.readyState >= 2;
      if (!armed && armedTransUrlRef.current) {
        await loadInto(el, armedTransUrlRef.current);
      }
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
      stageRef.current = "transition";
      const playing = await startPlayback(el, { withSound: false });
      // Reveal the transition only after its first frame is painted.
      await nextPaint();
      setVisible("t");
      if (!playing) {
        // Could not start the clip — resolve immediately so the controller can
        // advance to the next song or the logo without a black gap.
        cbRef.current.onTransitionEnded?.();
        return false;
      }
      return true;
    }, [loadInto, startPlayback, setVisible]);

    const cutToLogo = useCallback(() => {
      stageRef.current = "logo";
      armedNextUrlRef.current = "";
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
        [songARef.current, songBRef.current, transRef.current].forEach(silence);
      }, 600);
    }, [setVisible, silence]);

    const retryActive = useCallback(() => {
      userInteractedRef.current = true;
      sessionStorage.setItem("video_autoplay_enabled", "true");
      if (stageRef.current !== "song") return;
      const el = songEl();
      if (!el) return;
      el.muted = false;
      el.volume = 1;
      try {
        Promise.resolve(el.play()).catch((err) =>
          console.error("[PLAY FAILED] retryActive", err)
        );
      } catch (err) {
        console.error("[PLAY FAILED] retryActive", err);
      }
    }, [songEl]);

    useImperativeHandle(ref, () => ({
      armNext,
      armTransition,
      playSong,
      playTransition,
      cutToLogo,
      retryActive,
      getActiveVideo: () => (stageRef.current === "song" ? songEl() : null),
    }));

    // ---- Media events ---------------------------------------------------

    const onEndedFor = useCallback(
      (id) => () => {
        if (id === "t") {
          if (stageRef.current !== "transition") return;
          cbRef.current.onTransitionEnded?.();
          return;
        }
        // Song element: only the visible song slot may signal completion.
        if (stageRef.current !== "song") return;
        if (roleRef.current.song !== id) return;
        cbRef.current.onSongEnded?.();
      },
      []
    );

    const onErrorFor = useCallback(
      (id) => () => {
        const el = elById(id);
        if (!el?.getAttribute("src") && !el?.currentSrc) return;
        const url = el?.currentSrc || el?.src || "";
        const code = el?.error?.code;
        if (id === "t") {
          if (stageRef.current === "transition") {
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
    useEffect(() => {
      const interval = window.setInterval(() => {
        if (stageRef.current !== "song") return;
        const el = songEl();
        if (!el) return;

        if (el.paused && el.readyState >= 2) {
          try {
            Promise.resolve(el.play()).catch((err) =>
              console.error("[PLAY FAILED] stall nudge", err)
            );
          } catch (err) {
            console.error("[PLAY FAILED] stall nudge", err);
          }
        }

        const t = Number(el.currentTime || 0);
        const dur = Number(el.duration || 0);
        const now = Date.now();
        if (dur > 0 && dur - t <= 0.6) {
          if (tailRef.current.at === 0) {
            tailRef.current = { t, at: now };
          } else if (now - tailRef.current.at >= 1200) {
            tailRef.current = { t: 0, at: 0 };
            cbRef.current.onSongEnded?.();
          }
        } else {
          tailRef.current = { t, at: 0 };
        }
      }, 1000);
      return () => window.clearInterval(interval);
    }, [songEl]);

    // Resume the visible song after the TV/webview returns from background.
    useEffect(() => {
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        if (stageRef.current !== "song") return;
        const el = songEl();
        if (el && el.paused) {
          try {
            Promise.resolve(el.play()).catch((err) =>
              console.error("[PLAY FAILED] visibility resume", err)
            );
          } catch (err) {
            console.error("[PLAY FAILED] visibility resume", err);
          }
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [songEl]);

    // ---- Render ---------------------------------------------------------

    const cls = (id) =>
      `video-element video-slot ${front === id ? "video-slot--front" : "video-slot--back"}`;

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
