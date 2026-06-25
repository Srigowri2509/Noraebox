import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import { api } from "../api";
import { safeSet, safeSessionGet, safeSessionSet } from "../utils/safeStorage";
import { unlockAudio } from "../utils/audioUnlock";
import { isLowPowerDevice, isNativeAndroidDisplay, isCacheEnabled } from "../utils/device";
import { fetchSongWithUrl } from "../utils/fetchSongWithUrl";
import { resolvePlayableUrl } from "../cache/resolvePlayableUrl";
import {
  initNextSongCache,
  ensureNext,
  getLocalUrl,
  onSongStarted,
  clear as clearNextSongCache,
  logReadyBeforeSongEnd,
} from "../cache/nextSongCache";

// Transition clips bundled with the app (public/transcitions/*.mp4).
const TRANSITION_IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const TRANSCITIONS_FOLDER = "transcitions";
// TVs poll less aggressively — 8 rooms × 1 req/s starves the WebView network
// stack during video playback; backend itself handles load fine at ~3s intervals.
const POLL_INTERVAL_MS = isNativeAndroidDisplay() ? 3000 : 1000;

// Acer/Android TV APKs: transitions stay on, but we avoid preloading extra
// decoders during a song. VITE_LOW_POWER=true disables transitions entirely.
const NATIVE_TV = isNativeAndroidDisplay();
const LOW_POWER = isLowPowerDevice();

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

/** Milliseconds until session end from API fields (works without remaining_seconds). */
function remainingMsFromSession(session) {
  if (!session) return null;
  if (session.remaining_seconds != null) {
    return Math.max(0, session.remaining_seconds) * 1000;
  }
  if (session.session_end_time) {
    const endMs = Date.parse(session.session_end_time);
    if (!Number.isNaN(endMs)) return Math.max(0, endMs - Date.now());
  }
  return null;
}

function isArmedLocal(armed) {
  return armed?.source === "local" || String(armed?.url || "").includes("_capacitor_file_");
}

/** Swap a remote armed URL for a local file when the cache download finishes. */
async function tryUpgradeArmedToLocal(songId, armed) {
  const id = sid(songId);
  if (!id) {
    console.log("[CACHE] armed_upgrade_skip", { reason: "no_song_id" });
    return null;
  }
  if (!isCacheEnabled()) {
    console.log("[CACHE] armed_upgrade_skip", { reason: "cache_disabled", songId: id });
    return null;
  }
  if (!armed?.url) {
    console.log("[CACHE] armed_upgrade_skip", { reason: "no_armed_url", songId: id });
    return null;
  }
  if (sid(armed.id) !== id) {
    console.log("[CACHE] armed_upgrade_skip", {
      reason: "id_mismatch",
      songId: id,
      armedId: armed.id ?? null,
    });
    return null;
  }
  if (isArmedLocal(armed)) {
    return null;
  }

  console.log("[CACHE] armed_upgrade_start", { songId: id });
  const localUrl = await getLocalUrl(id);
  if (!localUrl) {
    console.log("[CACHE] armed_upgrade_skip", { reason: "local_unavailable", songId: id });
    return null;
  }

  console.log("[CACHE] armed_upgrade_success", { songId: id });
  console.log("[CACHE] armed_source remote->local", id);
  return { id, url: localUrl, source: "local" };
}

/** Resolve the next song after /playback/ended — backend queue is authoritative. */
async function resolveNextAfterEnded(endedRes, armedFallback) {
  if (endedRes?.status === "next_started" && endedRes.song_id) {
    const id = sid(endedRes.song_id);
    const loaded = await resolvePlayableUrl(id);
    if (loaded?.videoUrl) {
      return { id, url: loaded.videoUrl, source: loaded.source || "remote" };
    }
  }
  if (endedRes?.status === "ended") {
    return null;
  }
  if (armedFallback?.id && armedFallback?.url) {
    return armedFallback;
  }
  return null;
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
  const sessionEndMsRef = useRef(null); // absolute deadline synced from backend each poll
  const finalizedRef = useRef(false); // hard-cut lock until backend confirms session ended
  const queueAdvancingRef = useRef(false);
  const queueAdvancingAtRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const queueLenRef = useRef(0);
  const lastLogoNudgeAtRef = useRef(0);
  const lastLogoPlayAttemptAtRef = useRef(0);

  // Guards.
  const busyRef = useRef(false); // a swap/transition op is in flight
  const songEndLockRef = useRef(false);
  const transitionStartedAtRef = useRef(0);
  const bannerKeyRef = useRef(""); // avoids re-rendering the banner every poll
  // Poll-exclusive playback drive: ensures only one cold-start/skip op runs at
  // a time WITHOUT ever blocking the poll loop itself (ops are fire-and-forget).
  const driveLockRef = useRef(false);
  const driveLockAtRef = useRef(0);
  const driveWatchdogRef = useRef(null);
  const driveSeqRef = useRef(0);
  const backendSongIdRef = useRef(null);
  const armingRef = useRef(false); // prevents overlapping armAssets() runs
  const skipTargetRef = useRef(null); // skip in-flight target — stops poll re-preempt loop
  const transitionEndLockRef = useRef(false);
  const queueHeadRef = useRef(null); // invalidate armed next when queue head changes (reorder)

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
  const forceUnlockDrive = useCallback(() => {
    if (driveWatchdogRef.current) {
      clearTimeout(driveWatchdogRef.current);
      driveWatchdogRef.current = null;
    }
    if (!driveLockRef.current) return;
    console.warn("[WATCHDOG] driveLock stuck >20s, force unlock");
    driveLockRef.current = false;
    driveLockAtRef.current = 0;
    driveSeqRef.current += 1;
  }, []);

  const drive = useCallback(
    (fn, { preempt = false } = {}) => {
      if (!preempt && driveLockRef.current) {
        if (driveLockAtRef.current && Date.now() - driveLockAtRef.current > 20000) {
          forceUnlockDrive();
        } else {
          return;
        }
      }
      const seq = ++driveSeqRef.current;
      driveLockRef.current = true;
      driveLockAtRef.current = Date.now();
      if (driveWatchdogRef.current) clearTimeout(driveWatchdogRef.current);
      driveWatchdogRef.current = setTimeout(forceUnlockDrive, 20000);
      Promise.resolve()
        .then(() => fn(seq))
        .catch((err) => console.error("[DRIVE] error:", err))
        .finally(() => {
          if (driveWatchdogRef.current) {
            clearTimeout(driveWatchdogRef.current);
            driveWatchdogRef.current = null;
          }
          if (seq === driveSeqRef.current) {
            driveLockRef.current = false;
            driveLockAtRef.current = 0;
          }
        });
    },
    [forceUnlockDrive]
  );

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
    queueAdvancingAtRef.current = Date.now();
    try {
      // Promote queue head when idle on logo (same as tablet "Ready to Sing").
      await api(`/rooms/${roomId}/playback/start_next`, { method: "POST" });
    } catch (err) {
      console.warn("[QUEUE] idle nudge failed:", err);
    } finally {
      queueAdvancingRef.current = false;
      queueAdvancingAtRef.current = 0;
    }
  }, [roomId]);

  // ---- State transitions ---------------------------------------------------

  const goToLogo = useCallback((reason = "goToLogo") => {
    const wasLogo = stageRef.current === "LOGO";
    stageRef.current = "LOGO";
    currentSongIdRef.current = null;
    armedNextRef.current = null;
    armedTransitionRef.current = "";
    transitionTargetRef.current = null;
    songEndLockRef.current = false;
    setNextSongBanner(null);
    if (!wasLogo) {
      void clearNextSongCache(reason);
    }
    videoRef.current?.cutToLogo();
  }, []);

  // HARD cut to logo when the backend reports session ended. Cancels everything
  // and locks until a new session starts or the backend session becomes active again.
  const hardCutToLogo = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    console.log("[STATE] hard cut -> LOGO");
    driveSeqRef.current += 1;
    driveLockRef.current = false;
    stageRef.current = "ENDING";
    currentSongIdRef.current = null;
    armedNextRef.current = null;
    armedTransitionRef.current = "";
    transitionTargetRef.current = null;
    transitionStartedAtRef.current = 0;
    busyRef.current = false;
    songEndLockRef.current = false;
    hasPlayedRef.current = false;
    sessionEndMsRef.current = null;
    setTimeLeft(null);
    setNextSongBanner(null);
    void clearNextSongCache("hardCutToLogo");
    void videoRef.current?.prepareForNextSong?.();
    videoRef.current?.cutToLogo();
    stageRef.current = "LOGO";
  }, []);

  // Begin playing a song NOW (cold start from logo, or instant skip target).
  const enterSong = useCallback(async (songId, url, { urgent = false, coldStart = false, afterTransition = false, seq } = {}) => {
    if (!url) return false;
    const stale = () => seq !== undefined && seq !== driveSeqRef.current;
    if (stale()) return false;
    busyRef.current = true;
    try {
      const ok = await videoRef.current?.playSong(url, { urgent, coldStart, afterTransition });
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
      void onSongStarted(songId);
      return true;
    } finally {
      busyRef.current = false;
    }
  }, []);

  const tryStartFromLogo = useCallback(
    (songId, { coldStart = true } = {}) => {
      if (!songId) return;
      drive(async (seq) => {
        if (stageRef.current !== "LOGO" || finalizedRef.current) return;
        if (sid(backendSongIdRef.current) !== sid(songId)) return;
        const loaded = await fetchSongWithUrl(songId);
        if (!loaded?.videoUrl || stageRef.current !== "LOGO" || finalizedRef.current) return;
        if (sid(backendSongIdRef.current) !== sid(songId)) return;
        await enterSong(songId, loaded.videoUrl, { seq, coldStart });
      });
    },
    [drive, enterSong]
  );

  /** Instant cut to a new song (skip from tablet). Works during SONG or TRANSITION. */
  const performSkipTo = useCallback(
    async (backendSongId, seq) => {
      const stale = () => seq !== driveSeqRef.current;
      console.log("[STATE] skip detected -> instant next", backendSongId);
      transitionStartedAtRef.current = 0;
      transitionTargetRef.current = null;
      songEndLockRef.current = false;
      armedTransitionRef.current = "";

      // Light interrupt — do NOT call prepareForNextSong here; it bumps playSeq
      // and silences all decoders, and repeated poll preemption left the screen
      // blank forever while each new skip aborted the previous load.
      if (stageRef.current === "TRANSITION") {
        await videoRef.current?.abortTransition?.();
      } else {
        await videoRef.current?.interruptForSkip?.();
      }
      if (stale()) return false;

      const armed = armedNextRef.current;
      let ok = false;
      if (armed?.id === backendSongId && armed.url) {
        console.log("[CACHE] skip_path", {
          songId: backendSongId,
          via: "armedNextRef",
          source: armed.source || "unknown",
          urlKind: armed.url.includes("_capacitor_file_") ? "local" : "remote",
        });
        ok = await enterSong(backendSongId, armed.url, { urgent: true, seq });
      } else {
        console.log("[CACHE] skip_path", {
          songId: backendSongId,
          via: "fetchSongWithUrl",
          armedId: armed?.id ?? null,
        });
        const loaded = await fetchSongWithUrl(backendSongId);
        if (stale()) return false;
        if (loaded?.videoUrl) {
          ok = await enterSong(backendSongId, loaded.videoUrl, { urgent: true, seq });
        }
      }

      if (stale()) return false;
      if (ok) {
        console.log("[STATE] skip OK ->", backendSongId);
        return true;
      }

      console.warn("[STATE] skip FAIL ->", backendSongId);
      // Recover: retry playback from backend state instead of leaving a black screen.
      if (backendSongIdRef.current === backendSongId) {
        tryStartFromLogo(backendSongId, { coldStart: true });
      } else {
        videoRef.current?.retryActive?.();
      }
      return false;
    },
    [enterSong, tryStartFromLogo]
  );

  // Arm transition + next song while the current song plays.
  const armAssets = useCallback(
    async (queue) => {
      if (stageRef.current !== "SONG") return;
      if (armingRef.current) return; // a previous arm is still running
      armingRef.current = true;
      try {
        // On TV, arm the transition only at song end (local clip, one decoder).
        if (!NATIVE_TV && !armedTransitionRef.current) {
          const url = pickRandom(transitionUrls);
          if (url) {
            armedTransitionRef.current = url;
            videoRef.current?.armTransition(url);
          }
        }

        const headId = queueHeadId(queue);
        if (!headId) {
          armedNextRef.current = null;
          return;
        }
        if (armedNextRef.current?.id === sid(headId)) {
          if (isCacheEnabled() && !isArmedLocal(armedNextRef.current)) {
            void ensureNext(headId);
            const upgraded = await tryUpgradeArmedToLocal(headId, armedNextRef.current);
            if (upgraded && stageRef.current === "SONG") {
              armedNextRef.current = upgraded;
            }
          }
          return;
        }
        // Queue head must differ from what's currently playing (it's the *next* song).
        if (headId === sid(currentSongIdRef.current)) return;
        if (isCacheEnabled()) {
          void ensureNext(headId);
        }
        // After a reorder/shuffle the head changes — always re-resolve even if we had a stale arm.
        const loaded = isCacheEnabled()
          ? await resolvePlayableUrl(headId)
          : await fetchSongWithUrl(headId);
        if (!loaded?.videoUrl) return;
        if (stageRef.current !== "SONG") return;
        armedNextRef.current = {
          id: sid(headId),
          url: loaded.videoUrl,
          source: loaded.source || "remote",
        };
        // On TV, only store the URL — preloading the next song steals a decoder
        // and can flash the wrong frame before the transition clip plays.
        if (!NATIVE_TV) {
          videoRef.current?.armNext(loaded.videoUrl);
        }
      } finally {
        armingRef.current = false;
      }
    },
    [transitionUrls]
  );

  // Song finished naturally -> transition (desktop) or direct next song (TV).
  const handleSongEnded = useCallback(async () => {
    if (stageRef.current !== "SONG") return;
    if (finalizedRef.current) return;
    if (songEndLockRef.current) return;
    songEndLockRef.current = true;
    console.log("[STATE] SONG ended", LOW_POWER ? "no-transitions" : NATIVE_TV ? "tv" : "desktop");
    // Freeze the ended song immediately — prevents stall-nudge from replaying
    // the last clip for a split second before the transition layer shows.
    videoRef.current?.freezeCurrentSong?.();
    // Keep the ended song frame visible until the transition paints — releasing
    // the decoder here caused a blank screen (logs: SILENCE song → ~1s black).

    // Backend advances the queue and returns the authoritative next song.
    const endedRes = await postEnded();
    console.log("[QUEUE] playback/ended", endedRes?.status, endedRes?.song_id ?? "—");
    if (endedRes?.status === "next_started" && endedRes.song_id) {
      backendSongIdRef.current = sid(endedRes.song_id);
    }
    const next = await resolveNextAfterEnded(endedRes, armedNextRef.current);
    armedNextRef.current = next;
    logReadyBeforeSongEnd(next?.id);

    if (next?.url) {
      transitionTargetRef.current = {
        type: "song",
        id: sid(next.id),
        url: next.url,
        source: next.source || "remote",
      };
    } else {
      transitionTargetRef.current = { type: "logo" };
    }

    // Fallback: backend may have set current_song_id even if response parsing failed.
    if (!next?.url && endedRes?.status === "next_started" && endedRes.song_id) {
      dbg.current.lastEvent = "ended: fetch next FAIL, will recover from poll";
    } else if (!next?.url) {
      dbg.current.lastEvent = "ended: no next song";
    }

    // TV: skip transition clip — hardware decoder pool is too small.
    if (LOW_POWER) {
      dbg.current.lastEvent = next?.url ? "TV direct next" : "TV direct logo";
      await videoRef.current?.prepareForNextSong?.();
      songEndLockRef.current = false;
      transitionStartedAtRef.current = 0;

      if (next?.url) {
        let ok = await enterSong(next.id, next.url, { coldStart: true, urgent: true });
        if (!ok) {
          const loaded = await fetchSongWithUrl(next.id);
          if (loaded?.videoUrl) {
            ok = await enterSong(next.id, loaded.videoUrl, { coldStart: true, urgent: true });
          }
        }
        dbg.current.lastEvent = ok ? `TV next OK ${next.id}` : "TV next FAIL";
        if (!ok) goToLogo();
      } else {
        goToLogo();
      }
      return;
    }

    stageRef.current = "TRANSITION";
    transitionEndLockRef.current = false;
    transitionStartedAtRef.current = Date.now();
    if (!armedTransitionRef.current) {
      const turl = pickRandom(transitionUrls);
      if (turl) {
        armedTransitionRef.current = turl;
        await videoRef.current?.armTransition(turl);
      }
    }
    // Start buffering song 2 during the transition clip (uses 2nd decoder).
    if (next?.url) {
      void videoRef.current?.beginHandoffLoad?.(next.url);
    }
    const transOk = await videoRef.current?.playTransition();
    if (!transOk) {
      console.warn("[STATE] transition play failed — handoff will still run");
    }
  }, [postEnded, transitionUrls, enterSong, goToLogo]);

  const commitHandoffSong = useCallback((songId, url) => {
    stageRef.current = "SONG";
    currentSongIdRef.current = sid(songId);
    hasPlayedRef.current = true;
    songEndLockRef.current = false;
    armedNextRef.current = null;
    armedTransitionRef.current = "";
    transitionTargetRef.current = null;
    safeSet("lastVideo", url);
    dbg.current.lastEvent = `handoff OK ${songId}`;
    void onSongStarted(songId);
  }, []);

  const tryHandoffToSong = useCallback(async (songId, url, source = "remote") => {
    if (!url) return false;
    console.log("[HANDOFF] source=" + source, songId);
    console.log("[HANDOFF] transition ended", { songId, url: url.split("?")[0] }, Date.now());
    let result = await videoRef.current?.handoffToSong?.(url, { timeoutMs: 5000, pollMs: 150 });
    if (result?.ok) {
      commitHandoffSong(songId, url);
      console.log("[STATE] transition -> song OK", songId, result.waitMs ?? "—", "ms wait");
      return true;
    }
    console.warn("[HANDOFF] first attempt failed", result);
    const loaded = await fetchSongWithUrl(songId);
    if (loaded?.videoUrl && loaded.videoUrl !== url) {
      result = await videoRef.current?.handoffToSong?.(loaded.videoUrl, { timeoutMs: 5000, pollMs: 150 });
      if (result?.ok) {
        commitHandoffSong(songId, loaded.videoUrl);
        console.log("[STATE] transition -> song OK (retry)", songId);
        return true;
      }
      console.warn("[HANDOFF] retry failed", result);
    }
    console.warn("[STATE] transition -> song FAIL", songId, "rs=", result?.readyState, "after", result?.elapsedMs, "ms");
    return false;
  }, [commitHandoffSong]);

  // Transition clip finished -> show next song or the logo.
  const handleTransitionEnded = useCallback(async () => {
    if (stageRef.current !== "TRANSITION") return;
    if (transitionEndLockRef.current) return;
    transitionEndLockRef.current = true;
    transitionStartedAtRef.current = 0;
    const target = transitionTargetRef.current;
    // Keep target until handoff succeeds — poll uses it to avoid preempting.

    try {
      songEndLockRef.current = false;

      if (target?.type === "song" && target.url) {
        if (await tryHandoffToSong(target.id, target.url, target.source || "remote"))
          return;
      } else if (backendSongIdRef.current && queueLenRef.current > 0) {
        console.log("[STATE] transition -> recover from backend", backendSongIdRef.current);
        const loaded = await fetchSongWithUrl(backendSongIdRef.current);
        if (loaded?.videoUrl && (await tryHandoffToSong(backendSongIdRef.current, loaded.videoUrl))) {
          return;
        }
      }
      console.log("[HANDOFF] timeout -> logo", Date.now());
      transitionTargetRef.current = null;
      goToLogo();
    } finally {
      songEndLockRef.current = false;
      transitionEndLockRef.current = false;
    }
  }, [tryHandoffToSong, goToLogo]);

  const handleSongError = useCallback(
    async (info) => {
      console.warn("[VIDEO] song error", info?.message ?? info?.code ?? info);
      if (stageRef.current === "LOGO" || stageRef.current === "ENDING") return;
      if (stageRef.current !== "SONG") return;
      const songId = currentSongIdRef.current;
      if (songId) {
        const loaded = await fetchSongWithUrl(songId);
        if (loaded?.videoUrl) {
          const ok = await enterSong(songId, loaded.videoUrl, { urgent: true });
          if (ok) return;
        }
      }
      // Fall through to transition/next only during active song playback — not
      // from logo recovery retries (those would loop every 10–15s).
      if (!songEndLockRef.current && stageRef.current === "SONG") {
        void handleSongEnded();
      }
    },
    [handleSongEnded, enterSong]
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
    console.log(
      "[STATE] playback mode:",
      LOW_POWER ? "no transitions" : NATIVE_TV ? "transitions (tv)" : "transitions (desktop)"
    );
    if (isCacheEnabled()) {
      console.log("[CACHE] enabled (next-song experiment)");
      void initNextSongCache();
    }
  }, []);

  // Returning sessions: skip the tap gate if autoplay was already unlocked.
  useEffect(() => {
    if (safeSessionGet("video_autoplay_enabled") === "true") {
      interactedRef.current = true;
      setNeedsInteraction(false);
    }
  }, []);

  useEffect(() => {
    const unlock = () => markInteracted();
    const events = ["click", "touchstart", "keydown", "pointerdown"];
    events.forEach((e) => document.addEventListener(e, unlock, { passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, unlock));
  }, [markInteracted]);

  useEffect(
    () => () => {
      if (driveWatchdogRef.current) clearTimeout(driveWatchdogRef.current);
    },
    []
  );

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
          sessionEndMsRef.current = null;
          setTimeLeft(null);
          return;
        }

        // New session id -> clear end locks so the next session runs normally.
        if (session.id && session.id !== lastSessionIdRef.current) {
          lastSessionIdRef.current = session.id;
          finalizedRef.current = false;
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

        // Backend is the source of truth for session end — never self-lock on local clock.
        if (isEnded) {
          if (!finalizedRef.current) {
            if (hasPlayedRef.current) hardCutToLogo();
            else if (stageRef.current !== "LOGO") goToLogo("session_ended");
          }
          sessionEndMsRef.current = null;
          setTimeLeft(null);
          return;
        }

        // Recover finalized lock only if the session was extended (time added back).
        if (finalizedRef.current && active) {
          const remainingMs = remainingMsFromSession(session);
          if (remainingMs != null && remainingMs > 0) {
            finalizedRef.current = false;
          }
        }

        // Timer display: remaining_seconds from backend, or derive from session_end_time.
        const remainingMs = remainingMsFromSession(session);
        if (remainingMs != null) {
          if (remainingMs <= 0 && finalizedRef.current) {
            // Already hard-cut — don't re-arm an expired deadline every poll tick.
            sessionEndMsRef.current = null;
            setTimeLeft(0);
          } else {
            sessionEndMsRef.current = Date.now() + remainingMs;
            setTimeLeft(remainingMs);
          }
        } else {
          sessionEndMsRef.current = null;
          setTimeLeft(null);
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
        backendSongIdRef.current = backendSongId;
        sessionActiveRef.current = active;
        queueLenRef.current = queue.length;

        // Detect queue reorder / head change — drop stale armed-next from before shuffle.
        const headId = sid(queueHeadId(queue));
        if (headId !== queueHeadRef.current) {
          if (queueHeadRef.current != null && headId !== armedNextRef.current?.id) {
            armedNextRef.current = null;
            dbg.current.lastEvent = `queue head changed -> ${headId ?? "empty"}`;
          }
          queueHeadRef.current = headId;
        }

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
          if (driveLockRef.current) {
            if (driveLockAtRef.current && Date.now() - driveLockAtRef.current > 20000) {
              forceUnlockDrive();
            } else {
              return;
            }
          }
          if (backendSongId) {
            const now = Date.now();
            const retryMs = queueLenRef.current > 0 ? 1500 : 3000;
            if (now - lastLogoPlayAttemptAtRef.current >= retryMs) {
              lastLogoPlayAttemptAtRef.current = now;
              tryStartFromLogo(backendSongId, { coldStart: true });
            }
          } else if (active && queue.length > 0) {
            const now = Date.now();
            if (now - lastLogoNudgeAtRef.current >= 8000) {
              lastLogoNudgeAtRef.current = now;
              void nudgeAdvance();
            }
          }
          return;
        }

        if (stageRef.current === "SONG" || stageRef.current === "TRANSITION") {
          // Scenario 2: skip — instant cut, no transition (including mid-transition).
          if (backendSongId && backendSongId !== sid(currentSongIdRef.current)) {
            // Song handoff after transition — don't preempt with skip logic.
            if (stageRef.current === "TRANSITION" && transitionEndLockRef.current) {
              return;
            }
            // Transition already in progress toward this song — don't interrupt.
            if (stageRef.current === "TRANSITION") {
              const pending = transitionTargetRef.current;
              if (pending?.type === "song" && sid(pending.id) === backendSongId) {
                return;
              }
            }
            // Already loading this skip — don't preempt again (that was causing
            // blank screen: each poll bumped driveSeq and silenced all videos).
            if (driveLockRef.current && skipTargetRef.current === backendSongId) {
              return;
            }
            const prevSkipTarget = skipTargetRef.current;
            skipTargetRef.current = backendSongId;
            dbg.current.lastEvent = `skip ${currentSongIdRef.current}->${backendSongId}`;
            drive(
              async (seq) => {
                try {
                  const ok = await performSkipTo(backendSongId, seq);
                  dbg.current.lastEvent = `skip ${ok ? "OK" : "FAIL"} ->${backendSongId}`;
                } finally {
                  if (skipTargetRef.current === backendSongId) {
                    skipTargetRef.current = null;
                  }
                }
              },
              { preempt: prevSkipTarget !== backendSongId }
            );
            return;
          }
          if (stageRef.current === "SONG") {
            void armAssets(queue);
          }
          return;
        }
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
  }, [roomId, goToLogo, hardCutToLogo, armAssets, nudgeAdvance, drive, forceUnlockDrive, tryStartFromLogo, performSkipTo]);

  // LOGO idle recovery: after a long pause, driveLock / stale URLs can leave the
  // display on the logo even though the queue or current_song_id is ready.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!interactedRef.current || finalizedRef.current) return;
      if (stageRef.current !== "LOGO") return;

      if (
        queueAdvancingRef.current &&
        queueAdvancingAtRef.current &&
        Date.now() - queueAdvancingAtRef.current > 25000
      ) {
        console.warn("[WATCHDOG] queueAdvancing stuck >25s, reset");
        queueAdvancingRef.current = false;
        queueAdvancingAtRef.current = 0;
      }

      if (driveLockRef.current && driveLockAtRef.current && Date.now() - driveLockAtRef.current > 20000) {
        forceUnlockDrive();
      }

      if (!sessionActiveRef.current) return;

      const backendSongId = backendSongIdRef.current;
      const now = Date.now();

      if (backendSongId) {
        if (now - lastLogoPlayAttemptAtRef.current < 10000) return;
        if (driveLockRef.current) return;
        lastLogoPlayAttemptAtRef.current = now;
        dbg.current.lastEvent = "logo recovery play";
        tryStartFromLogo(backendSongId, { coldStart: true });
      } else if (queueLenRef.current > 0) {
        if (now - lastLogoNudgeAtRef.current < 8000) return;
        lastLogoNudgeAtRef.current = now;
        dbg.current.lastEvent = "logo recovery nudge";
        void nudgeAdvance();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [forceUnlockDrive, nudgeAdvance, tryStartFromLogo]);

  // Local timer expiry — hard cut from any stage (song, transition, logo).
  useEffect(() => {
    const tick = setInterval(() => {
      const endMs = sessionEndMsRef.current;
      if (endMs == null) return;
      const remaining = Math.max(0, endMs - Date.now());
      setTimeLeft(remaining);
      if (remaining <= 0 && !finalizedRef.current && sessionEndMsRef.current != null) {
        console.log("[STATE] local timer expired -> hard cut");
        sessionEndMsRef.current = null;
        hardCutToLogo();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [hardCutToLogo]);

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

  // ---- Transition watchdog -------------------------------------------------
  // A transition clip that never fires "ended" (decode/network hiccup) must
  // still resolve so we never stall on it. ~9s covers the longest clip.
  useEffect(() => {
    const timer = setInterval(() => {
      if (stageRef.current !== "TRANSITION") return;
      const startedAt = transitionStartedAtRef.current;
      if (!startedAt) return;
      if (Date.now() - startedAt < 6000) return;
      console.warn("[WATCHDOG] transition timed out -> resolving");
      transitionStartedAtRef.current = 0;
      void handleTransitionEnded();
    }, 1000);
    return () => clearInterval(timer);
  }, [handleTransitionEnded]);

  // ---- Debug overlay: toggle + refresh -------------------------------------
  // Toggle with the 'd'/'0' key or the remote MENU/INFO button only.
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
      onClick={markInteracted}
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
          <div className="debug-overlay__title">NOREBOX DEBUG (press D to hide)</div>
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
