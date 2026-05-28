import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import NextBanner from "../components/NextBanner";
import { api, API_BASE } from "../api";

const TRANSITION_IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const TRANSCITIONS_FOLDER = "transcitions";
let streamProbeResult = null; // null=unknown, true=available, false=unavailable

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

async function fetchSongWithUrl(songId) {
  try {
    const songData = await api(`/songs/${songId}`);
    const base = (API_BASE || "").replace(/\/$/, "");
    const streamUrl = `${base}/songs/${songId}/stream`;

    // Probe stream endpoint once per app run to avoid repeated 404 console noise.
    if (streamProbeResult !== false) {
      try {
        const probe = await fetch(streamUrl, { method: "HEAD" });
        if (probe.ok) {
          streamProbeResult = true;
          return { ...songData, videoUrl: streamUrl };
        }
        streamProbeResult = false;
      } catch {
        streamProbeResult = false;
      }
    }

    let videoUrl = songData.file_url || songData.video_url || songData.url;
    if (videoUrl && !videoUrl.startsWith("http://") && !videoUrl.startsWith("https://")) {
      try {
        const signedUrlResponse = await api(`/songs/${songId}/signed-url`);
        videoUrl = signedUrlResponse.signed_url || signedUrlResponse.url || videoUrl;
      } catch {
        /* use file_url as-is */
      }
    }
    if (!videoUrl) return null;
    return { ...songData, videoUrl };

  } catch (err) {
    console.error("[DISPLAY] fetch song failed:", err);
    return null;
  }
}

/*
  Display app behavior:
  - Polls backend /rooms/{roomId}/status every 2 seconds
  - Gets current_song_id and fetches song details
  - Calculates timer from started_at + total_minutes
  - Shows video when current_song_id is set
  - Shows logo (no loop video) when idle, between songs, or session ends
*/

export default function Display({ roomId }) {
  const [currentSong, setCurrentSong] = useState(null); // null = show logo (no idle loop video)
  const [nextSong, setNextSong] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null); // milliseconds remaining
  const [isActive, setIsActive] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const videoRef = useRef();
  const lastSongIdRef = useRef(null);
  const currentSongRef = useRef(null);
  const [hasSessionStarted, setHasSessionStarted] = useState(false);
  const [preloadUrl, setPreloadUrl] = useState(null);
  const betweenSongsRef = useRef(false);
  const [betweenSongs, setBetweenSongs] = useState(false);
  const pendingSongRef = useRef(null);
  const queueAdvancingRef = useRef(false);
  const skipPendingSongIdRef = useRef(null);
  const sessionEndPhaseRef = useRef(false);
  const [sessionEndPhase, setSessionEndPhase] = useState(false);
  const hasPlayedSongRef = useRef(false);
  const [hasPlayedSong, setHasPlayedSong] = useState(false);
  // Locks/state for session-end coordination — see fix-session-end-transition-loop plan.
  const sessionFinalizedRef = useRef(false);
  const sessionEndRequestedRef = useRef(false);
  const pendingSessionEndRef = useRef(false);
  const lastSessionIdRef = useRef(null);
  // Set true the first time the backend actually reports the session as
  // ended/finished. The "session restarted in-place" recovery block only
  // fires after this has been observed, so that the gap between our
  // client-side timer hitting 0 and the backend processing /end cannot
  // accidentally clear the finalization lock and re-load the just-ended song.
  const backendConfirmedEndedRef = useRef(false);
  // Snapshot of queue length from the most recent successful poll — used to
  // decide whether to retry a queue advance with another transition versus
  // falling back to the logo.
  const latestQueueLengthRef = useRef(0);
  const consecutiveAdvanceRetriesRef = useRef(0);
  // Tracks the song id we've already proactively preloaded for the queue
  // head, so polls don't refetch the signed URL or re-warm the hidden slot
  // on every tick. Cleared whenever a song actually starts playing.
  const preloadedSongIdRef = useRef(null);
  // Guards to prevent duplicate end/transition resolution races.
  const songEndedLockRef = useRef(false);
  const transitionResolveInFlightRef = useRef(false);
  const transitionVideoUrls = useMemo(() => buildTransitionVideoUrls(), []);

  const markSongPlayed = useCallback(() => {
    if (hasPlayedSongRef.current) return;
    hasPlayedSongRef.current = true;
    setHasPlayedSong(true);
  }, []);

  const promoteSongFromBackend = useCallback(
    async (songId, { escapeTransition = false } = {}) => {
      if (!songId || songId === lastSongIdRef.current) return true;

      if (escapeTransition) {
        betweenSongsRef.current = false;
        setBetweenSongs(false);
        skipPendingSongIdRef.current = null;
        pendingSongRef.current = null;
        videoRef.current?.stopKaraokeAudio?.();
      }

      try {
        const loaded = await fetchSongWithUrl(songId);
        if (!loaded?.videoUrl) {
          setCurrentSong(null);
          return false;
        }
        lastSongIdRef.current = songId;
        setPreloadUrl(null);
        preloadedSongIdRef.current = null;
        localStorage.setItem("lastVideo", loaded.videoUrl);
        markSongPlayed();
        setCurrentSong(loaded);
        return true;
      } catch (err) {
        console.error("[POLL] promote song failed:", err);
        setCurrentSong(null);
        return false;
      }
    },
    [markSongPlayed]
  );

  const resetToHomeLogo = useCallback(() => {
    betweenSongsRef.current = false;
    setBetweenSongs(false);
    sessionEndPhaseRef.current = false;
    setSessionEndPhase(false);
    pendingSongRef.current = null;
    skipPendingSongIdRef.current = null;
    lastSongIdRef.current = null;
    setPreloadUrl(null);
    preloadedSongIdRef.current = null;
    setCurrentSong(null);
    videoRef.current?.stopKaraokeAudio?.();
  }, []);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  const applyPendingSong = useCallback(() => {
    const pending = pendingSongRef.current;
    if (!pending?.videoUrl) return false;
    pendingSongRef.current = null;
    betweenSongsRef.current = false;
    setBetweenSongs(false);
    lastSongIdRef.current = pending.id;
    setPreloadUrl(null);
    // The current preload (if any) has now become the active song.
    // Clear so the next poll can preload the NEW queue head.
    preloadedSongIdRef.current = null;
    localStorage.setItem("lastVideo", pending.videoUrl);
    markSongPlayed();
    setCurrentSong(pending);
    songEndedLockRef.current = false;
    return true;
  }, [markSongPlayed]);

  const enterBetweenSongs = useCallback(() => {
    if (betweenSongsRef.current) return;
    betweenSongsRef.current = true;
    setBetweenSongs(true);
    videoRef.current?.stopKaraokeAudio?.();
    setPreloadUrl(null);
    setCurrentSong((prev) => (prev ? { ...prev, videoUrl: null } : null));
  }, []);

  // HARD cut to logo. Runs the moment the session time ends (or the backend
  // reports session ended), even if a karaoke song or transition clip is in
  // the middle of playing. No final transition, no waiting for natural end.
  const startSessionEndSequence = useCallback(() => {
    if (sessionFinalizedRef.current) return;
    console.log("[STATE] SESSION_ENDED → hard cut to logo");
    // Mark finalized first so the 1 s poll cannot re-trigger anything.
    sessionFinalizedRef.current = true;
    // Stop audio + video frame advancement immediately. We deliberately do
    // NOT clear src here — keeping the last frame visible for the ~1 React
    // commit cycle until both slots become opacity 0 is much smoother than
    // flashing BLACK_POSTER before the logo placeholder mounts.
    videoRef.current?.pauseAllSlots?.();
    // Wipe all session/playback state in one batch so React commits the
    // logo placeholder + slot opacity flip + cleared timer atomically.
    sessionEndPhaseRef.current = false;
    setSessionEndPhase(false);
    betweenSongsRef.current = false;
    setBetweenSongs(false);
    pendingSongRef.current = null;
    skipPendingSongIdRef.current = null;
    pendingSessionEndRef.current = false;
    consecutiveAdvanceRetriesRef.current = 0;
    lastSongIdRef.current = null;
    hasPlayedSongRef.current = false;
    setHasPlayedSong(false);
    setHasSessionStarted(false);
    setSessionEnded(true);
    setPreloadUrl(null);
    preloadedSongIdRef.current = null;
    setNextSong(null);
    setTimeLeft(null);
    setCurrentSong(null);
  }, []);

  const advanceQueueFromBackend = useCallback(async () => {
    if (queueAdvancingRef.current) {
      console.warn("[QUEUE] advance already in progress — skipped duplicate");
      return false;
    }
    queueAdvancingRef.current = true;
    try {
      console.log("[QUEUE] advancing");
      const response = await api(`/rooms/${roomId}/playback/ended`, { method: "POST" });
      if (response?.status === "next_started" && response.song_id) {
        const loaded = await fetchSongWithUrl(response.song_id);
        if (loaded) {
          pendingSongRef.current = loaded;
          setPreloadUrl(loaded.videoUrl);
          // The advanced song was likely the one we'd prefetched as the
          // queue head — release the lock so the new head can preload.
          preloadedSongIdRef.current = null;
          return true;
        }
      }
      console.log("[QUEUE] no next song");
      return false;
    } finally {
      queueAdvancingRef.current = false;
    }
  }, [roomId]);

  // Lightweight nudge — used when the display is idle on logo and the queue
  // gains items. Unlike advanceQueueFromBackend, this does NOT prefetch or
  // populate pendingSongRef, because the poll loop will pick up the freshly
  // promoted current_song_id and load it directly (logo → song, no transition).
  const triggerBackendQueueAdvance = useCallback(async () => {
    if (queueAdvancingRef.current) return;
    queueAdvancingRef.current = true;
    try {
      console.log("[QUEUE] idle nudge → POST /playback/ended");
      await api(`/rooms/${roomId}/playback/ended`, { method: "POST" });
    } catch (err) {
      console.warn("[QUEUE] idle advance failed:", err);
    } finally {
      queueAdvancingRef.current = false;
    }
  }, [roomId]);

  const handleTransitionClipEnded = useCallback(async () => {
    if (transitionResolveInFlightRef.current) return true;
    transitionResolveInFlightRef.current = true;
    try {

      if (!hasPlayedSongRef.current && !sessionEndPhaseRef.current) {
        consecutiveAdvanceRetriesRef.current = 0;
        resetToHomeLogo();
        return true;
      }

      if (sessionEndPhaseRef.current) {
      // One-shot lock: prevent the 1 s poll from re-triggering another
      // session-end transition after this final one completes.
      sessionFinalizedRef.current = true;
      consecutiveAdvanceRetriesRef.current = 0;
      sessionEndPhaseRef.current = false;
      setSessionEndPhase(false);
      betweenSongsRef.current = false;
      setBetweenSongs(false);
      setHasSessionStarted(false);
      setSessionEnded(true);
      setPreloadUrl(null);
      setCurrentSong(null);
      lastSongIdRef.current = null;
      hasPlayedSongRef.current = false;
      setHasPlayedSong(false);
      // NOTE: do NOT clear the video slots synchronously here.
      // The transition slot is still video-slot--front (opacity 1) at this
      // instant; clearing its src would show BLACK_POSTER for ~one React
      // commit cycle, producing a visible "glitch" between the transition's
      // last frame and the logo. Let VideoPlayer's idleMode="logo" useEffect
      // run silenceAllSlots() after the placeholder is on screen — both
      // slots will already be at opacity 0 by then, so the clear is invisible.
      console.log("[STATE] final transition done → home logo");
        return true;
      }

      if (pendingSongRef.current?.videoUrl) {
      try {
        await videoRef.current?.warmPreload?.(pendingSongRef.current.videoUrl);
      } catch (warmErr) {
        console.warn("[VIDEO] warm preload before swap failed", warmErr);
      }
      applyPendingSong();
      skipPendingSongIdRef.current = null;
      consecutiveAdvanceRetriesRef.current = 0;
        return true;
      }

      if (skipPendingSongIdRef.current) {
      try {
        const loaded = await fetchSongWithUrl(skipPendingSongIdRef.current);
        skipPendingSongIdRef.current = null;
        if (loaded) {
          pendingSongRef.current = loaded;
          try {
            await videoRef.current?.warmPreload?.(loaded.videoUrl);
          } catch (warmErr) {
            console.warn("[VIDEO] warm preload before skip swap failed", warmErr);
          }
          applyPendingSong();
          consecutiveAdvanceRetriesRef.current = 0;
            return true;
          }
        } catch (error) {
          console.error("[QUEUE] skip pending load failed:", error);
        }
      }

      try {
        const hasNext = await advanceQueueFromBackend();
        if (hasNext && pendingSongRef.current?.videoUrl) {
          const nextUrl = pendingSongRef.current.videoUrl;
          try {
            await videoRef.current?.warmPreload?.(nextUrl);
          } catch (warmErr) {
            console.warn("[VIDEO] warm preload before swap failed", warmErr);
          }
          applyPendingSong();
          consecutiveAdvanceRetriesRef.current = 0;
          return true;
        }
      } catch (error) {
        console.error("[QUEUE] advance failed after transition:", error);
      }

    // Fallback path — backend reports no next song.
    // If our latest poll snapshot believed the queue still had items, this is
    // almost certainly a transient race (queue item committed after our
    // advance request). Don't drop to the logo: return false so VideoPlayer
    // starts another transition, giving the backend more time.
    //
    // Cap raised to MAX_TRANSITION_RETRIES so a slow backend (or a brief
    // network blip) over a long session never flashes the logo with songs
    // still queued — user explicitly wants song → transition → next song
    // continuity for 10–12 hour shifts. With ~2–3 s per transition this
    // gives ~20–30 s of recovery time before we give up and let the
    // auto-restart-from-idle poll pick up.
      const MAX_TRANSITION_RETRIES = 10;
      if (
        latestQueueLengthRef.current > 0 &&
        consecutiveAdvanceRetriesRef.current < MAX_TRANSITION_RETRIES &&
        !pendingSessionEndRef.current
      ) {
        consecutiveAdvanceRetriesRef.current += 1;
        console.warn(
          `[QUEUE] advance failed but queue snapshot has ${latestQueueLengthRef.current} item(s) — playing another transition (retry ${consecutiveAdvanceRetriesRef.current}/${MAX_TRANSITION_RETRIES})`
        );
        // Stay in between-songs state; VideoPlayer will autostart another transition.
        return false;
      }

      consecutiveAdvanceRetriesRef.current = 0;
      betweenSongsRef.current = false;
      setBetweenSongs(false);
      setPreloadUrl(null);
      setCurrentSong(null);
      return true;
    } finally {
      transitionResolveInFlightRef.current = false;
    }
  }, [applyPendingSong, advanceQueueFromBackend, resetToHomeLogo]);

  // Browser autoplay: one click on the display page unlocks video+audio and retries playback.
  useEffect(() => {
    const unlock = () => {
      sessionStorage.setItem("video_autoplay_enabled", "true");
      const active = videoRef.current?.getActiveVideo?.();
      const needsRetry = !active || active.paused;
      if (needsRetry) {
        setCurrentSong((prev) => (prev?.videoUrl ? { ...prev } : prev));
      }
    };
    const events = ["click", "touchstart", "keydown", "pointerdown"];
    events.forEach((e) => document.addEventListener(e, unlock, { passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, unlock));
  }, []);

  // Poll room session from backend
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;
    let pollInterval;
    // In-flight guard — prevents overlapping polls when the backend is slow.
    // Without this, a 3 s fetch under setInterval(1000) would stack up state
    // updates from stale responses arriving after newer ones.
    let pollInFlight = false;

    const pollRoomStatus = async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        // Use GET /rooms/{id}/session endpoint (reads from room_sessions)
        const sessionData = await api(`/rooms/${roomId}/session`);
        if (!mounted) return;

        const session = sessionData.session;
        // Update the queue-length snapshot every poll so transition retries
        // and idle auto-restart can make accurate decisions.
        const queueSnapshot = sessionData.queue || [];
        latestQueueLengthRef.current = queueSnapshot.length;

        // If no session, show idle
        if (!session) {
          setIsActive(false);
          setTimeLeft(null);
          setSessionEnded(true);
          hasPlayedSongRef.current = false;
          setHasPlayedSong(false);
          resetToHomeLogo();
          return;
        }

        // Reset session-end locks the moment a new session id appears so the
        // next session's end-of-song / timer / cancel flow can fire normally.
        if (session.id && session.id !== lastSessionIdRef.current) {
          if (lastSessionIdRef.current) {
            sessionFinalizedRef.current = false;
            sessionEndRequestedRef.current = false;
            pendingSessionEndRef.current = false;
            backendConfirmedEndedRef.current = false;
            consecutiveAdvanceRetriesRef.current = 0;
            preloadedSongIdRef.current = null;
          }
          lastSongIdRef.current = null;
          lastSessionIdRef.current = session.id;
        }

        // Waiting for first song — logo only, never transitions
        if (!hasPlayedSongRef.current) {
          if (betweenSongsRef.current || betweenSongs || sessionEndPhaseRef.current) {
            resetToHomeLogo();
          }
        }

        // Check if session is active (not ended or finished)
        const isSessionEnded = session.status === "ended" || session.status === "finished";
        const active = !isSessionEnded && (session.status === "playing" || session.status === "idle" || session.status === "active");
        setIsActive(active);

        // Recover from the session-end finalization lock when the backend
        // restarts the session in-place (same session.id, status flipped
        // from ended/finished back to playing/active). Gated by
        // backendConfirmedEndedRef so a stale "active" read from before the
        // backend has processed our /end POST can't clear the lock and
        // re-load the just-ended song.
        if (
          !isSessionEnded &&
          sessionFinalizedRef.current &&
          backendConfirmedEndedRef.current
        ) {
          console.log("[POLL] session restarted in-place — clearing finalization lock");
          sessionFinalizedRef.current = false;
          sessionEndRequestedRef.current = false;
          pendingSessionEndRef.current = false;
          backendConfirmedEndedRef.current = false;
          consecutiveAdvanceRetriesRef.current = 0;
          preloadedSongIdRef.current = null;
        }

        // Session ended on backend — cut immediately to logo, regardless of
        // whether a song or transition is currently playing. User wants a
        // hard stop the moment the session time runs out.
        if (isSessionEnded) {
          // Mark that the backend has acknowledged the end at least once.
          // The recovery block above requires this before it will clear the
          // finalization lock on a subsequent "active" read.
          backendConfirmedEndedRef.current = true;
          if (sessionFinalizedRef.current) {
            return; // already finalized; ignore stale "ended" reads from backend
          }
          if (hasPlayedSongRef.current) {
            startSessionEndSequence();
          } else {
            resetToHomeLogo();
            setHasSessionStarted(false);
            setSessionEnded(true);
          }
          return;
        }

        // Get current song ID from session
        const currentSongId = session.current_song_id;

        // Calculate timer from session_start_time + total_minutes
        // Timer only shows when session_start_time exists (first song played)
        if (session.session_start_time) {
          setHasSessionStarted(true);
        }

        if (session.session_start_time && session.total_minutes) {
          try {
            const startedAt = new Date(session.session_start_time);
            const now = new Date();
            // Use the total_minutes from the session (set by admin)
            const totalMinutes = session.total_minutes;
            const totalSeconds = totalMinutes * 60;
            const elapsedSeconds = Math.floor((now - startedAt) / 1000);
            const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
            const remainingMs = remainingSeconds * 1000;

            // Show timer (session has started)
            setTimeLeft(remainingMs);

            // Timer ran out — auto-cancel the backend session once and hard-
            // cut to logo immediately. Whatever is playing (karaoke or a
            // random transition) is stopped on the spot.
            if (remainingSeconds === 0) {
              if (sessionFinalizedRef.current) {
                // Already finalized — but the backend may still be
                // reporting the old current_song_id because /end hasn't
                // been processed yet. Bail out of this poll so the
                // song-change branch below cannot re-load the just-ended
                // song.
                return;
              }
              if (hasPlayedSongRef.current) {
                if (!sessionEndRequestedRef.current) {
                  sessionEndRequestedRef.current = true;
                  console.log("[POLL] timer hit 0 — auto-cancelling backend session");
                  api(`/rooms/${roomId}/end`, { method: "POST" }).catch((err) =>
                    console.warn("[SESSION] /end POST failed:", err)
                  );
                }
                startSessionEndSequence();
                // Critical: bail out NOW. Without this return, the song-
                // change branch further down would see the still-stale
                // current_song_id from the backend (no /end processed
                // yet) and re-fetch + setCurrentSong, restarting the
                // song we just stopped.
                return;
              }
              resetToHomeLogo();
              setSessionEnded(true);
              return;
            }
            setSessionEnded(false);
          } catch (e) {
            console.error("Error calculating timer:", e);
            setTimeLeft(null);
          }
        } else {
          // Session ready but idle - no timer yet (session_start_time is NULL)
          setTimeLeft(null);
          setSessionEnded(false);
          // Don't clear currentSong here - might be waiting for first song
        }

        // Song changes from backend — never interrupt transition or session-end sequence
        if (sessionEndPhaseRef.current) {
          /* wait for final transition → logo */
        } else if (currentSongId && currentSongId !== lastSongIdRef.current) {
          setHasSessionStarted(true);
          const escapeTransition = betweenSongsRef.current;
          if (escapeTransition) {
          } else if (currentSongRef.current?.videoUrl && lastSongIdRef.current != null) {
          }
          await promoteSongFromBackend(currentSongId, { escapeTransition });
        } else if (!currentSongId) {
          if (lastSongIdRef.current && !betweenSongsRef.current) {
            // If backend clears current_song_id while session is still active,
            // preserve smooth UX: run one transition before dropping to logo.
            if (active && hasPlayedSongRef.current && !sessionEndPhaseRef.current) {
              enterBetweenSongs();
            } else {
              setCurrentSong(null);
            }
          }
          if (!betweenSongsRef.current) {
            lastSongIdRef.current = null;
          }
          if (session.status === "finished" || session.status === "ended" || !session) {
            setCurrentSong(null);
            setNextSong(null);
          }
        }

        // Get next song from queue (from sessionData.queue)
        try {
          if (queueSnapshot.length > 0) {
            const nextSongData = queueSnapshot[0];
            setNextSong({
              title: nextSongData.title || (nextSongData.song && nextSongData.song.title) || "Unknown",
              artist:
                nextSongData.artist ||
                nextSongData.artist_name ||
                (nextSongData.song && nextSongData.song.artist) ||
                (nextSongData.song && nextSongData.song.artist_name) ||
                ""
            });
          } else {
            setNextSong(null);
          }
        } catch (err) {
          console.error("Error getting queue:", err);
          setNextSong(null);
        }

        // Proactive preload of the queue head while the current song is
        // playing. Primes the browser HTTP cache so the swap from
        // transition → next karaoke is near-instant instead of waiting
        // 1–5 s for S3 to deliver the new file. Big win for back-to-back
        // playback timing.
        if (
          active &&
          currentSongRef.current?.videoUrl &&
          !betweenSongsRef.current &&
          !sessionEndPhaseRef.current &&
          !sessionFinalizedRef.current &&
          !pendingSessionEndRef.current &&
          queueSnapshot.length > 0
        ) {
          const head = queueSnapshot[0] || {};
          const nextId =
            head.song_id ||
            (head.song && head.song.id) ||
            head.id ||
            null;
          if (nextId && nextId !== preloadedSongIdRef.current) {
            preloadedSongIdRef.current = nextId;
            (async () => {
              try {
                const loaded = await fetchSongWithUrl(nextId);
                if (!loaded?.videoUrl) return;
                // Bail if state moved on while we were fetching (e.g.
                // session ended, queue head changed, song already started).
                if (
                  preloadedSongIdRef.current !== nextId ||
                  sessionFinalizedRef.current ||
                  sessionEndPhaseRef.current
                ) {
                  return;
                }
                setPreloadUrl(loaded.videoUrl);
              } catch (err) {
                console.warn("[PRELOAD] queue-head prefetch failed:", err);
                if (preloadedSongIdRef.current === nextId) {
                  preloadedSongIdRef.current = null;
                }
              }
            })();
          }
        }

        // Auto-restart from idle: if the display landed on the logo while
        // queued items exist, nudge the backend to promote the next item.
        // The very next poll will see a fresh current_song_id and the
        // existing new-song branch loads it directly from logo (no transition).
        const isOnLogoIdle =
          !currentSongId &&
          !currentSongRef.current?.videoUrl &&
          !betweenSongsRef.current &&
          !sessionEndPhaseRef.current &&
          !sessionFinalizedRef.current &&
          !pendingSessionEndRef.current &&
          !queueAdvancingRef.current;
        if (active && isOnLogoIdle && queueSnapshot.length > 0) {
          console.log(
            `[POLL] idle on logo with ${queueSnapshot.length} queued item(s) — nudging backend to advance`
          );
          void triggerBackendQueueAdvance();
        }

      } catch (error) {
        console.error("Error polling room status:", error);
        if (!mounted) return;
      } finally {
        pollInFlight = false;
      }
    };

    // Poll immediately and then every 1 second for faster autoplay
    pollRoomStatus();
    pollInterval = setInterval(pollRoomStatus, 1000);

    return () => {
      mounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [roomId]);

  // Update timer every second.
  // Important: keep the dependency list EMPTY so the interval is created
  // exactly once and not torn down + recreated on every tick. The poll's
  // setTimeLeft from backend remains the source of truth; this local timer
  // is just for sub-poll smoothness.
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1000) return 0;
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Karaoke finished — play transition; advance backend queue only after the clip ends.
  const handleVideoEnded = () => {
    // Ignore any late-firing ended event after we've already hard-cut to
    // logo (session-end finalized).
    if (sessionFinalizedRef.current) return;
    if (betweenSongsRef.current || sessionEndPhaseRef.current) return;
    if (songEndedLockRef.current) return;
    songEndedLockRef.current = true;
    console.log("[STATE] SONG_ENDED");
    pendingSongRef.current = null;
    skipPendingSongIdRef.current = null;
    enterBetweenSongs();
  };

  const handleVideoError = (videoError) => {
    console.error("❌ Video failed to load (will retry, not skipping):", videoError);
    // Intentionally do nothing here.
    // Requirement: never auto-skip songs on media errors.
  };

  // Format timeLeft ms -> "HH:MM:SS" or "MM:SS"
  const fmt = (ms) => {
    if (ms == null || ms <= 0) return "--:--:--";
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Last 5 minutes: from 04:59 (299 999 ms) down to 00:01 the timer renders
  // red as a visual warning. 00:00 / null / placeholder show neutral.
  const timeUrgent = timeLeft != null && timeLeft > 0 && timeLeft < 5 * 60 * 1000;

  return (
    <div className="display-root" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar timeText={fmt(timeLeft)} roomId={roomId} nextSong={nextSong} timeUrgent={timeUrgent} />

      <div className="display-content" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Center: Video or Default Background - Fullscreen excluding navbar */}
        <div className="display-center" style={{ 
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%"
        }}>
          <VideoPlayer
            ref={videoRef}
            song={currentSong}
            preloadUrl={preloadUrl}
            transitionVideoUrls={transitionVideoUrls}
            idleMode={hasPlayedSong && (betweenSongs || sessionEndPhase) ? "transition" : "logo"}
            endWithLogo={sessionEndPhase}
            logoSrc="/logo_noraebox.png"
            onEnded={handleVideoEnded}
            onTransitionClipEnded={handleTransitionClipEnded}
            onError={handleVideoError}
          />
        </div>
      </div>
    </div>
  );
}
