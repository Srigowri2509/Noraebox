import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import { api, API_BASE } from "../api";
import { safeSet, safeSessionSet } from "../utils/safeStorage";
import { unlockAudio } from "../utils/audioUnlock";

// Transition clips bundled with the app (public/transcitions/*.mp4).
const TRANSITION_IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
const TRANSCITIONS_FOLDER = "transcitions";
const POLL_INTERVAL_MS = 400;

// Android TV hardware has a tiny video-decoder pool (often 1–2) vs desktop
// Chrome. Preloading the transition clip while a song already has the current +
// next song decoding makes three decoders compete, which on TV causes the
// stutter and black transitions. On these devices we skip preloading the
// transition and instead load it (it's local + ~0.8 MB, so near-instant) only
// at the moment the song ends, after a decoder has been freed.
const LOW_POWER =
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "");

function buildTransitionVideoUrls() {
  return TRANSITION_IDS.map((id) => {
    const relativePath = `${TRANSCITIONS_FOLDER}/${id}.mp4`;
    if (typeof window !== "undefined") {
      try {
        return new URL(relativePath, window.location.href).href;
      } catch {
        /* fall through */
      }
    }
    return `/${relativePath}`;
  });
}

function pickRandom(list, avoid) {
  if (!list?.length) return "";
  const pool = avoid ? list.filter((u) => u !== avoid) : list;
  const from = pool.length ? pool : list;
  return from[Math.floor(Math.random() * from.length)] || "";
}

function queueHeadId(queue) {
  const head = queue?.[0];
  if (!head) return null;
  return head.song_id || head.id || (head.song && head.song.id) || null;
}

function sid(id) {
  if (id == null || id === "") return null;
  return String(id);
}

/** Fetch song metadata and resolve a directly-playable (S3) media URL. */
async function fetchSongWithUrl(songId) {
  try {
    const songData = await api(`/songs/${songId}`);
    let videoUrl = songData.file_url || songData.video_url || songData.url || "";
    if (videoUrl) {
      const needsSign =
        !videoUrl.startsWith("http://") && !videoUrl.startsWith("https://");
      if (needsSign) {
        try {
          const signed = await api(`/songs/${songId}/signed-url`);
          videoUrl = signed.signed_url || signed.url || videoUrl;
        } catch {
          /* use file_url as-is */
        }
      }
      return { ...songData, id: songId, videoUrl };
    }
    const base = (API_BASE || "").replace(/\/$/, "");
    return { ...songData, id: songId, videoUrl: `${base}/songs/${songId}/stream` };
  } catch (err) {
    console.error("[DISPLAY] fetch song failed:", err);
    return null;
  }
}

/*
 * Display controller — explicit state machine.
 *
 * States: LOGO | SONG | TRANSITION | ENDING
 *   - NEXT_SONG is not a visible state; it is the "armed" next song that is
 *     fully preloaded into a hidden element while the current SONG plays.
 *
 * The 4 scenarios:
 *   1. Song ends, queue has songs : SONG -> TRANSITION -> next SONG
 *   2. Skip                       : SONG -> next SONG (instant, no transition)
 *   3. Song ends, queue empty     : SONG -> TRANSITION -> LOGO
 *   4. Timer expires (any time)   : -> LOGO (hard cut, cancels everything)
 *
 * Preloading: the moment a SONG begins we arm both the transition clip and the
 * next song into hidden elements. State changes are then pure visibility
 * toggles handled by VideoPlayer — never a fetch or load at transition time.
 */
export default function Display({ roomId }) {
  const videoRef = useRef(null);
  const transitionUrls = useMemo(() => buildTransitionVideoUrls(), []);

  // UI state (Navbar only).
  const [timeLeft, setTimeLeft] = useState(null);
  const [nextSongBanner, setNextSongBanner] = useState(null);

  // Interaction gate: the browser blocks all autoplay until the user performs
  // a gesture. We show a fullscreen overlay on mount; a single click/tap/key
  // satisfies the autoplay requirement for the whole page session. No song,
  // transition, or logo video is driven until interactedRef is true.
  const [needsInteraction, setNeedsInteraction] = useState(true);
  const interactedRef = useRef(false);

  // ---- State machine refs --------------------------------------------------
  const stageRef = useRef("LOGO"); // LOGO | SONG | TRANSITION | ENDING
  const currentSongIdRef = useRef(null); // id the controller believes is current
  const hasPlayedRef = useRef(false);

  // Armed (preloaded) assets for the current song.
  const armedNextRef = useRef(null); // { id, url } | null
  const armedTransitionRef = useRef(""); // transition url armed for this song
  // After a natural song end we remember what the transition should resolve to.
  const transitionTargetRef = useRef(null); // { type: 'song', id, url } | { type: 'logo' }

  // Session / timer coordination.
  const lastSessionIdRef = useRef(null);
  const finalizedRef = useRef(false); // hard-cut lock until a new session appears
  const endRequestedRef = useRef(false);
  const queueAdvancingRef = useRef(false);
  // Authoritative session end instant (ms) from backend session_end_time.
  const timerDeadlineRef = useRef(null);

  // Guards.
  const busyRef = useRef(false); // a swap/transition op is in flight
  const songEndLockRef = useRef(false);
  const transitionStartedAtRef = useRef(0);
  const bannerKeyRef = useRef(""); // avoids re-rendering the banner every poll
  // Poll-exclusive playback drive: ensures only one cold-start/skip op runs at
  // a time WITHOUT ever blocking the poll loop itself (ops are fire-and-forget).
  const driveLockRef = useRef(false);
  const driveSeqRef = useRef(0);
  const armingRef = useRef(false); // prevents overlapping armAssets() runs

  // ---- On-screen debug overlay (Android TV has no visible console) ----------
  const [showDebug, setShowDebug] = useState(false);
  const [, setDebugTick] = useState(0);
  const dbg = useRef({
    poll: "—",
    backendSong: "—",
    sessionStatus: "—",
    queueLen: 0,
    lastEvent: "—",
    lastError: "—",
  });

  // Run a playback operation in the background, never awaited by the poll loop.
  // A single in-flight op at a time; a stalled video call can therefore never
  // freeze backend-state polling (skip / session-stop / queue detection).
  const drive = useCallback((fn, { preempt = false } = {}) => {
    if (!preempt && driveLockRef.current) return;
    const seq = ++driveSeqRef.current;
    driveLockRef.current = true;
    Promise.resolve()
      .then(() => fn(seq))
      .catch((err) => console.error("[DRIVE] error:", err))
      .finally(() => {
        if (seq === driveSeqRef.current) {
          driveLockRef.current = false;
        }
      });
  }, []);

  // ---- Backend helpers -----------------------------------------------------

  const postEnded = useCallback(async () => {
    try {
      return await api(`/rooms/${roomId}/playback/ended`, { method: "POST" });
    } catch (err) {
      console.warn("[QUEUE] /playback/ended failed:", err);
      return null;
    }
  }, [roomId]);

  const nudgeAdvance = useCallback(async () => {
    if (queueAdvancingRef.current) return;
    queueAdvancingRef.current = true;
    try {
      await api(`/rooms/${roomId}/playback/ended`, { method: "POST" });
    } catch (err) {
      console.warn("[QUEUE] idle nudge failed:", err);
    } finally {
      queueAdvancingRef.current = false;
    }
  }, [roomId]);

  // ---- State transitions ---------------------------------------------------

  const goToLogo = useCallback(() => {
    stageRef.current = "LOGO";
    currentSongIdRef.current = null;
    armedNextRef.current = null;
    armedTransitionRef.current = "";
    transitionTargetRef.current = null;
    songEndLockRef.current = false;
    setNextSongBanner(null);
    videoRef.current?.cutToLogo();
  }, []);

  // HARD cut to logo on timer expiry / session end. Cancels everything,
  // never plays a transition, and locks until a new session starts.
  const hardCutToLogo = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    console.log("[STATE] hard cut -> LOGO");
    stageRef.current = "ENDING";
    currentSongIdRef.current = null;
    armedNextRef.current = null;
    armedTransitionRef.current = "";
    transitionTargetRef.current = null;
    busyRef.current = false;
    songEndLockRef.current = false;
    hasPlayedRef.current = false;
    setTimeLeft(null);
    setNextSongBanner(null);
    videoRef.current?.cutToLogo();
    stageRef.current = "LOGO";
  }, []);

  // Begin playing a song NOW (cold start from logo, or instant skip target).
  const enterSong = useCallback(async (songId, url, { urgent = false, seq } = {}) => {
    if (!url) return false;
    const stale = () => seq !== undefined && seq !== driveSeqRef.current;
    if (stale()) return false;
    busyRef.current = true;
    try {
      const ok = await videoRef.current?.playSong(url, { urgent });
      if (stale()) return false;
      if (!ok) return false;
      // Session may have been stopped while the song was loading.
      if (finalizedRef.current) {
        videoRef.current?.cutToLogo();
        return false;
      }
      stageRef.current = "SONG";
      currentSongIdRef.current = sid(songId);
      hasPlayedRef.current = true;
      songEndLockRef.current = false;
      // Force fresh assets to be armed for this song on the next poll tick.
      armedNextRef.current = null;
      armedTransitionRef.current = "";
      transitionTargetRef.current = null;
      safeSet("lastVideo", url);
      dbg.current.lastEvent = `enterSong ${songId}`;
      return true;
    } finally {
      busyRef.current = false;
    }
  }, []);

  // Arm transition + next song while the current song plays.
  const armAssets = useCallback(
    async (queue) => {
      if (stageRef.current !== "SONG") return;
      if (armingRef.current) return; // a previous arm is still running
      armingRef.current = true;
      try {
        // On low-power TVs, do NOT preload the transition during the song — that
        // would be a third concurrent decoder. It's loaded just-in-time at song
        // end instead (see handleSongEnded).
        if (!LOW_POWER && !armedTransitionRef.current) {
          const url = pickRandom(transitionUrls);
          if (url) {
            armedTransitionRef.current = url;
            videoRef.current?.armTransition(url);
          }
        }

        const headId = queueHeadId(queue);
        if (!headId) {
          // Queue is empty — evaluated now, during the song, not at song end.
          armedNextRef.current = null;
          return;
        }
        if (armedNextRef.current?.id === sid(headId)) return;
        // Don't arm the song that is currently playing.
        if (headId === sid(currentSongIdRef.current)) return;
        const loaded = await fetchSongWithUrl(headId);
        if (!loaded?.videoUrl) return;
        if (stageRef.current !== "SONG") return;
        armedNextRef.current = { id: sid(headId), url: loaded.videoUrl };
        videoRef.current?.armNext(loaded.videoUrl);
      } finally {
        armingRef.current = false;
      }
    },
    [transitionUrls]
  );

  // Song finished naturally -> play the armed transition, then resolve.
  const handleSongEnded = useCallback(async () => {
    if (stageRef.current !== "SONG") return;
    if (finalizedRef.current) return;
    if (songEndLockRef.current) return;
    songEndLockRef.current = true;
    console.log("[STATE] SONG ended");

    const next = armedNextRef.current;
    // Decide where the transition leads BEFORE it starts.
    if (next?.url) {
      transitionTargetRef.current = { type: "song", id: sid(next.id), url: next.url };
      // Claim the next id locally so the poll doesn't read the backend's
      // soon-to-advance current_song_id as a skip.
      currentSongIdRef.current = sid(next.id);
    } else {
      transitionTargetRef.current = { type: "logo" };
      currentSongIdRef.current = null;
    }

    stageRef.current = "TRANSITION";
    transitionStartedAtRef.current = Date.now();
    // Low-power path: the transition wasn't preloaded during the song, so pick +
    // arm one now. The song decoder is released as the transition starts (see
    // VideoPlayer.playTransition), and the clip is local + tiny so the load is
    // effectively instant under the black shield.
    if (LOW_POWER && !armedTransitionRef.current) {
      const turl = pickRandom(transitionUrls);
      if (turl) {
        armedTransitionRef.current = turl;
        videoRef.current?.armTransition(turl);
      }
    }
    // Advance the backend queue in the background while the transition plays.
    void postEnded();
    await videoRef.current?.playTransition();
  }, [postEnded, transitionUrls]);

  // Transition clip finished -> show next song or the logo.
  const handleTransitionEnded = useCallback(async () => {
    if (stageRef.current !== "TRANSITION") return;
    transitionStartedAtRef.current = 0;
    const target = transitionTargetRef.current;
    transitionTargetRef.current = null;

    if (target?.type === "song" && target.url) {
      const ok = await enterSong(target.id, target.url);
      if (!ok) goToLogo();
      return;
    }
    // Queue empty (Scenario 3) or no usable next -> logo.
    goToLogo();
  }, [enterSong, goToLogo]);

  const handleSongError = useCallback(
    (info) => {
      console.warn("[VIDEO] song error", info);
      if (stageRef.current !== "SONG") return;
      // Treat an unrecoverable song error like a natural end so the pipeline
      // keeps moving instead of freezing on a black frame.
      if (!songEndLockRef.current) {
        void handleSongEnded();
      }
    },
    [handleSongEnded]
  );

  // ---- Interaction gate / autoplay unlock ----------------------------------
  const markInteracted = useCallback(() => {
    interactedRef.current = true;
    safeSessionSet("video_autoplay_enabled", "true");
    // Unlock the audio output for the whole session (Android TV WebView blocks
    // audio more aggressively than Chrome — a silent clip inside the gesture
    // handler keeps later play() calls audible).
    unlockAudio();
    setNeedsInteraction(false);
    // Unmute/resume anything already playing muted.
    videoRef.current?.retryActive();
  }, []);

  useEffect(() => {
    const unlock = () => markInteracted();
    const events = ["click", "touchstart", "keydown", "pointerdown"];
    events.forEach((e) => document.addEventListener(e, unlock, { passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, unlock));
  }, [markInteracted]);

  // ---- Backend polling -----------------------------------------------------
  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api(`/rooms/${roomId}/session`);
        if (!mounted) return;
        const session = data.session;
        const queue = data.queue || [];

        // Diagnostics for the on-screen overlay.
        dbg.current.poll = new Date().toLocaleTimeString();
        dbg.current.sessionStatus = session?.status || "none";
        dbg.current.backendSong = session?.current_song_id ?? "—";
        dbg.current.queueLen = queue.length;

        // No session at all -> idle logo.
        if (!session) {
          if (stageRef.current !== "LOGO") goToLogo();
          finalizedRef.current = false;
          hasPlayedRef.current = false;
          timerDeadlineRef.current = null;
          setTimeLeft(null);
          return;
        }

        // New session id -> clear end locks so the next session runs normally.
        if (session.id && session.id !== lastSessionIdRef.current) {
          lastSessionIdRef.current = session.id;
          finalizedRef.current = false;
          endRequestedRef.current = false;
          if (stageRef.current === "LOGO") {
            currentSongIdRef.current = null;
          }
        }

        const isEnded = session.status === "ended" || session.status === "finished";
        const active =
          !isEnded &&
          (session.status === "playing" ||
            session.status === "idle" ||
            session.status === "active");

        // Scenario 4 (backend side): session ended -> hard cut to logo.
        if (isEnded) {
          if (!finalizedRef.current) {
            if (hasPlayedRef.current) hardCutToLogo();
            else goToLogo();
          }
          timerDeadlineRef.current = null;
          setTimeLeft(null);
          return;
        }
        if (finalizedRef.current) return; // wait for a fresh session id

        // ---- Timer (deadline from backend — poll updates ref, 1s tick renders) -
        if (session.session_end_time) {
          timerDeadlineRef.current = new Date(session.session_end_time).getTime();
        } else if (session.session_start_time && session.total_minutes) {
          timerDeadlineRef.current =
            new Date(session.session_start_time).getTime() + session.total_minutes * 60 * 1000;
        } else {
          timerDeadlineRef.current = null;
        }

        // Natural expiry: only when backend deadline has passed while session
        // is still marked active (not on a transient local miscalculation).
        if (timerDeadlineRef.current && Date.now() >= timerDeadlineRef.current) {
          if (hasPlayedRef.current) {
            if (!endRequestedRef.current) {
              endRequestedRef.current = true;
              api(`/rooms/${roomId}/end`, { method: "POST" }).catch((err) =>
                console.warn("[SESSION] /end failed:", err)
              );
            }
            hardCutToLogo();
          } else {
            goToLogo();
          }
          return;
        }

        // ---- Next-song banner (only re-render when it actually changes) ------
        const head = queue[0];
        if (head) {
          const title = head.title || head.song?.title || "Unknown";
          const artist =
            head.artist ||
            head.artist_name ||
            head.song?.artist ||
            head.song?.artist_name ||
            "";
          const key = `${title}|${artist}`;
          if (bannerKeyRef.current !== key) {
            bannerKeyRef.current = key;
            setNextSongBanner({ title, artist });
          }
        } else if (bannerKeyRef.current !== "") {
          bannerKeyRef.current = "";
          setNextSongBanner(null);
        }

        const backendSongId = sid(session.current_song_id);

        // Gate: do not drive any playback until the user has interacted, so we
        // never fire a play() the browser will silently reject.
        if (!interactedRef.current) return;

        // ---- Drive the state machine ---------------------------------------
        // CRITICAL: playback operations are fired in the background via drive()
        // and never awaited here. A slow/stalled video call must never block
        // this loop, or backend state (skip / session-stop / queue) stops being
        // read — which froze the TV build while Chrome (honoring fetch abort)
        // kept working.
        if (stageRef.current === "LOGO") {
          if (driveLockRef.current) return;
          if (backendSongId) {
            // Cold start: load + play the first song directly from the logo.
            drive(async (seq) => {
              const loaded = await fetchSongWithUrl(backendSongId);
              if (loaded?.videoUrl && stageRef.current === "LOGO" && !finalizedRef.current) {
                await enterSong(backendSongId, loaded.videoUrl, { seq });
              }
            });
          } else if (active && queue.length > 0) {
            // Queued items but nothing current -> ask backend to promote one.
            void nudgeAdvance();
          }
          return;
        }

        if (stageRef.current === "SONG") {
          // Scenario 2: skip. The tablet POSTs start_next, so the backend's
          // current_song_id changes mid-song -> instant cut, no transition.
          if (backendSongId && backendSongId !== sid(currentSongIdRef.current)) {
            dbg.current.lastEvent = `skip ${currentSongIdRef.current}->${backendSongId}`;
            drive(
              async (seq) => {
                console.log("[STATE] skip detected -> instant next");
                videoRef.current?.interruptForSkip?.();
                const armed = armedNextRef.current;
                let ok = false;
                if (armed?.id === backendSongId && armed.url) {
                  ok = await enterSong(backendSongId, armed.url, { urgent: true, seq });
                } else {
                  const loaded = await fetchSongWithUrl(backendSongId);
                  if (loaded?.videoUrl) {
                    ok = await enterSong(backendSongId, loaded.videoUrl, { urgent: true, seq });
                  }
                }
                dbg.current.lastEvent = `skip ${ok ? "OK" : "FAIL"} ->${backendSongId}`;
              },
              { preempt: true }
            );
            return;
          }
          // Keep transition + next song armed during the song (non-blocking).
          void armAssets(queue);
          return;
        }

        // stageRef === TRANSITION: let the clip finish; ignore skip detection
        // here to avoid racing the backend's queue advance.
      } catch (err) {
        console.error("[POLL] error:", err);
        dbg.current.lastError = String(err?.message || err);
      } finally {
        inFlight = false;
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [roomId, goToLogo, hardCutToLogo, enterSong, armAssets, nudgeAdvance, drive]);

  // Keyboard (TV remote OK/Enter) also dismisses the interaction gate.
  useEffect(() => {
    if (!needsInteraction) return;
    const onKey = () => markInteracted();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [needsInteraction, markInteracted]);

  // Wire VideoPlayer callbacks to stable refs (they read live state via refs).
  const onSongEnded = useCallback(() => void handleSongEnded(), [handleSongEnded]);
  const onTransitionEnded = useCallback(
    () => void handleTransitionEnded(),
    [handleTransitionEnded]
  );

  // ---- Session timer tick (single source — reads backend deadline ref) -------
  useEffect(() => {
    const timer = setInterval(() => {
      const deadline = timerDeadlineRef.current;
      if (!deadline) {
        setTimeLeft(null);
        return;
      }
      const remaining = Math.max(0, deadline - Date.now());
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ---- Transition watchdog -------------------------------------------------
  // A transition clip that never fires "ended" (decode/network hiccup) must
  // still resolve so we never stall on it. ~9s covers the longest clip.
  useEffect(() => {
    const timer = setInterval(() => {
      if (stageRef.current !== "TRANSITION") return;
      const startedAt = transitionStartedAtRef.current;
      if (!startedAt) return;
      if (Date.now() - startedAt < 15000) return;
      console.warn("[WATCHDOG] transition timed out -> resolving");
      transitionStartedAtRef.current = 0;
      void handleTransitionEnded();
    }, 1000);
    return () => clearInterval(timer);
  }, [handleTransitionEnded]);

  // ---- Debug overlay: toggle + refresh -------------------------------------
  // Toggle with the 'd'/'0' key or the remote MENU/INFO button, or a ~1.2s
  // long-press anywhere. While visible it re-renders twice a second so the
  // live state machine values stay current (Android TV has no console).
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key;
      if (k === "d" || k === "D" || k === "0" || k === "Info" || k === "ContextMenu" || e.keyCode === 82) {
        setShowDebug((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!showDebug) return undefined;
    const t = setInterval(() => setDebugTick((n) => (n + 1) % 1000), 500);
    return () => clearInterval(t);
  }, [showDebug]);

  const longPressRef = useRef(null);
  const onPressStart = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => setShowDebug((v) => !v), 1200);
  }, []);
  const onPressEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const fmt = (ms) => {
    if (ms == null || ms <= 0) return "--:--:--";
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const timeUrgent = timeLeft != null && timeLeft > 0 && timeLeft < 5 * 60 * 1000;

  return (
    <div
      className="display-root"
      style={{ height: "100vh", display: "flex", flexDirection: "column" }}
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      onPointerLeave={onPressEnd}
    >
      <Navbar timeText={fmt(timeLeft)} roomId={roomId} nextSong={nextSongBanner} timeUrgent={timeUrgent} />

      <div className="display-content" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div
          className="display-center"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
        >
          <VideoPlayer
            ref={videoRef}
            logoSrc="/logo_noraebox.png"
            onSongEnded={onSongEnded}
            onTransitionEnded={onTransitionEnded}
            onSongError={handleSongError}
          />
        </div>
      </div>

      {needsInteraction ? (
        <div
          className="interaction-gate"
          role="button"
          tabIndex={0}
          onClick={markInteracted}
          onTouchStart={markInteracted}
        >
          <img src="/logo_noraebox.png" alt="Norebox" className="interaction-gate__logo" />
          <div className="interaction-gate__text">Tap anywhere to start</div>
        </div>
      ) : null}

      {showDebug ? (
        <div className="debug-overlay">
          <div className="debug-overlay__title">NOREBOX DEBUG (press D / long-press to hide)</div>
          <div>stage: <b>{stageRef.current}</b> &nbsp; front: <b>{videoRef.current?.getDebug?.()?.front ?? "?"}</b></div>
          <div>display song: <b>{String(currentSongIdRef.current ?? "—")}</b></div>
          <div>backend song: <b>{String(dbg.current.backendSong)}</b></div>
          <div>session: <b>{dbg.current.sessionStatus}</b> &nbsp; queue: <b>{dbg.current.queueLen}</b></div>
          <div>armed next: <b>{String(armedNextRef.current?.id ?? "—")}</b></div>
          <div>driveLock: <b>{String(driveLockRef.current)}</b> &nbsp; busy: <b>{String(busyRef.current)}</b> &nbsp; interacted: <b>{String(interactedRef.current)}</b></div>
          <div>last poll: <b>{dbg.current.poll}</b></div>
          <div>last event: <b>{dbg.current.lastEvent}</b></div>
          <div className="debug-overlay__err">last error: {dbg.current.lastError}</div>
          <div>video: {(() => { const d = videoRef.current?.getDebug?.(); return d ? `rs=${d.readyState} paused=${d.paused} t=${d.currentTime}` : "—"; })()}</div>
        </div>
      ) : null}
    </div>
  );
}
