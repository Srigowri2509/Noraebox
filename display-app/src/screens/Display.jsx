import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import NextBanner from "../components/NextBanner";
import { api } from "../api";

const TRANSITION_IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const TRANSCITIONS_FOLDER = "transcitions";

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
  const songData = await api(`/songs/${songId}`);
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
  // Snapshot of queue length from the most recent successful poll — used to
  // decide whether to retry a queue advance with another transition versus
  // falling back to the logo.
  const latestQueueLengthRef = useRef(0);
  const consecutiveAdvanceRetriesRef = useRef(0);
  const transitionVideoUrls = useMemo(() => buildTransitionVideoUrls(), []);

  const markSongPlayed = useCallback(() => {
    if (hasPlayedSongRef.current) return;
    hasPlayedSongRef.current = true;
    setHasPlayedSong(true);
  }, []);

  const resetToHomeLogo = useCallback(() => {
    betweenSongsRef.current = false;
    setBetweenSongs(false);
    sessionEndPhaseRef.current = false;
    setSessionEndPhase(false);
    pendingSongRef.current = null;
    skipPendingSongIdRef.current = null;
    setPreloadUrl(null);
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
    localStorage.setItem("lastVideo", pending.videoUrl);
    markSongPlayed();
    setCurrentSong(pending);
    return true;
  }, [markSongPlayed]);

  const enterBetweenSongs = useCallback(() => {
    betweenSongsRef.current = true;
    setBetweenSongs(true);
    videoRef.current?.stopKaraokeAudio?.();
    setPreloadUrl(null);
    setCurrentSong((prev) => (prev ? { ...prev, videoUrl: null } : null));
  }, []);

  // True only while a karaoke song is actively visible/playing.
  const isPlayingKaraokeNow = useCallback(() => {
    return (
      !!currentSongRef.current?.videoUrl &&
      !betweenSongsRef.current &&
      !sessionEndPhaseRef.current
    );
  }, []);

  const startSessionEndSequence = useCallback(() => {
    if (sessionEndPhaseRef.current || sessionFinalizedRef.current) return;
    if (!hasPlayedSongRef.current) {
      resetToHomeLogo();
      setHasSessionStarted(false);
      setSessionEnded(true);
      return;
    }
    console.log("[STATE] SESSION_ENDED → final transition → logo");
    sessionEndPhaseRef.current = true;
    setSessionEndPhase(true);
    betweenSongsRef.current = true;
    setBetweenSongs(true);
    pendingSongRef.current = null;
    skipPendingSongIdRef.current = null;
    videoRef.current?.stopKaraokeAudio?.();
    setPreloadUrl(null);
    setNextSong(null);
    setTimeLeft(null);
    setCurrentSong((prev) => (prev ? { ...prev, videoUrl: null } : null));
  }, [resetToHomeLogo]);

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
          console.log("[QUEUE] advanced →", loaded.title);
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
    console.log("[TRANSITION] clip ended — resolving next song");

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
      videoRef.current?.stopKaraokeAudio?.();
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
    // starts another transition, giving the backend more time. Capped at one
    // retry to prevent endless transition loops if state is truly empty.
    if (
      latestQueueLengthRef.current > 0 &&
      consecutiveAdvanceRetriesRef.current < 1 &&
      !pendingSessionEndRef.current
    ) {
      consecutiveAdvanceRetriesRef.current += 1;
      console.warn(
        `[QUEUE] advance failed but queue snapshot has ${latestQueueLengthRef.current} item(s) — playing another transition (retry ${consecutiveAdvanceRetriesRef.current})`
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
  }, [applyPendingSong, advanceQueueFromBackend, resetToHomeLogo]);

  // Autoplay unlock is handled inside VideoPlayer itself.
  // Just mark user interaction once so all future videos autoplay with sound.
  useEffect(() => {
    const unlock = () => {
      sessionStorage.setItem("video_autoplay_enabled", "true");
    };
    const events = ["click", "touchstart", "keydown", "pointerdown"];
    events.forEach((e) =>
      document.addEventListener(e, unlock, { once: true, passive: true })
    );
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
            console.log("[POLL] new session detected — resetting end-sequence locks:", session.id);
            sessionFinalizedRef.current = false;
            sessionEndRequestedRef.current = false;
            pendingSessionEndRef.current = false;
            consecutiveAdvanceRetriesRef.current = 0;
          }
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

        // Session ended on backend — never cut a song mid-playback. If a song
        // is currently playing, defer the visual end sequence until the song
        // finishes naturally (handleVideoEnded consumes the flag).
        if (isSessionEnded) {
          if (sessionFinalizedRef.current) {
            return; // already finalized; ignore stale "ended" reads from backend
          }
          if (hasPlayedSongRef.current && !sessionEndPhaseRef.current) {
            if (isPlayingKaraokeNow()) {
              if (!pendingSessionEndRef.current) {
                console.log("[POLL] backend ended but song still playing — deferring end sequence");
                pendingSessionEndRef.current = true;
              }
            } else {
              startSessionEndSequence();
            }
          } else if (!sessionEndPhaseRef.current && !hasPlayedSongRef.current) {
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

            // Timer ran out — auto-cancel the backend session once, then run
            // the final transition → logo. If a song is mid-playback, defer
            // the visual end sequence so the song plays to its natural end.
            if (remainingSeconds === 0) {
              if (sessionFinalizedRef.current) {
                /* already finalized; ignore */
              } else if (hasPlayedSongRef.current && !sessionEndPhaseRef.current) {
                if (!sessionEndRequestedRef.current) {
                  sessionEndRequestedRef.current = true;
                  console.log("[POLL] timer hit 0 — auto-cancelling backend session");
                  api(`/rooms/${roomId}/end`, { method: "POST" }).catch((err) =>
                    console.warn("[SESSION] /end POST failed:", err)
                  );
                }
                if (isPlayingKaraokeNow()) {
                  if (!pendingSessionEndRef.current) {
                    console.log("[POLL] timer hit 0 but song still playing — deferring end sequence");
                    pendingSessionEndRef.current = true;
                  }
                } else {
                  startSessionEndSequence();
                }
              } else if (!hasPlayedSongRef.current) {
                resetToHomeLogo();
                setSessionEnded(true);
              }
            } else {
              setSessionEnded(false);
            }
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
        } else if (betweenSongsRef.current) {
          if (currentSongId && currentSongId !== lastSongIdRef.current) {
            console.log("[POLL] between-songs — recording skip target only", currentSongId);
            skipPendingSongIdRef.current = currentSongId;
          }
        } else if (currentSongId && currentSongId !== lastSongIdRef.current) {
          setHasSessionStarted(true);

          const wasPlayingKaraoke =
            currentSongRef.current?.videoUrl && lastSongIdRef.current != null;
          const isSkipFromTablet = wasPlayingKaraoke;

          if (isSkipFromTablet) {
            console.log("[POLL] skip detected — transition before next song");
            skipPendingSongIdRef.current = currentSongId;
            pendingSongRef.current = null;
            enterBetweenSongs();
          } else {
            try {
              const loaded = await fetchSongWithUrl(currentSongId);
              if (!loaded) {
                setCurrentSong(null);
              } else {
                lastSongIdRef.current = currentSongId;
                localStorage.setItem("lastVideo", loaded.videoUrl);
                markSongPlayed();
                setCurrentSong(loaded);
                console.log("[POLL] new song loaded:", loaded.title);
              }
            } catch (err) {
              console.error("[POLL] fetch song failed:", err);
              setCurrentSong(null);
            }
          }
        } else if (!currentSongId) {
          if (lastSongIdRef.current && !betweenSongsRef.current) {
            setCurrentSong(null);
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
    if (betweenSongsRef.current || sessionEndPhaseRef.current) return;
    console.log("[STATE] SONG_ENDED");
    pendingSongRef.current = null;
    skipPendingSongIdRef.current = null;

    // Session-end was deferred mid-song to avoid cutting playback; now that
    // the song finished naturally, run the single end transition → logo.
    if (pendingSessionEndRef.current) {
      console.log("[STATE] pending session-end consumed → final transition → logo");
      pendingSessionEndRef.current = false;
      startSessionEndSequence();
      return;
    }

    enterBetweenSongs();
  };

  const handleVideoError = (videoError) => {
    console.error("❌ Video failed to load (will retry, not skipping):", videoError);
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

  return (
    <div className="display-root" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar timeText={fmt(timeLeft)} roomId={roomId} nextSong={nextSong} />

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
