import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { playTenMinuteAlarm } from "../services/audioService";

const TEN_MINUTE_ALARM_KEY = "noraebox.tenMinuteAlarms";
const TEN_MINUTE_ALARM_THRESHOLD = 10;

function getPlayedAlarmKeys() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(TEN_MINUTE_ALARM_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

const playedAlarmKeys = getPlayedAlarmKeys();
const pendingAlarmKeys = new Set();

function savePlayedAlarmKey(alarmKey) {
  playedAlarmKeys.add(alarmKey);
  try {
    window.localStorage.setItem(
      TEN_MINUTE_ALARM_KEY,
      JSON.stringify(Array.from(playedAlarmKeys).slice(-500))
    );
  } catch {
    // The alarm can still play when storage is unavailable.
  }
}

export default function RoomSquare({ room, onClick, finishedSession, onAcknowledge, extensionNotice }) {
  const [remaining, setRemaining] = useState(null);
  const [session, setSession] = useState(null);

  // Fetch session data from room_sessions
  // Always fetch to check for active sessions (even if room.is_active is false)
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const sessionData = await api(`/rooms/${room.id}/session`);
        const session = sessionData.session;
        setSession(session);
        // If session exists and is active, update room status
        if (session && (session.status === 'active' || session.status === 'playing')) {
          // Session exists, so room should be considered active
        }
      } catch (error) {
        console.error("Error fetching session:", error);
        setSession(null);
      }
    };

    // Always fetch session data (not just when room.is_active is true)
    // This ensures we show "USING" status even if room.is_active hasn't updated yet
    fetchSession();
    const interval = setInterval(fetchSession, 2000);
    return () => clearInterval(interval);
  }, [room.id]);

  const updateRemaining = useCallback(() => {
    // Timer starts as soon as the admin starts the room session.
    if (!session || !session.session_start_time || !session.total_minutes) {
      setRemaining(null); // Session ready but idle - no timer yet
      return;
    }

    const now = Date.now();
    const newRemaining = session.session_end_time
      ? Math.max(0, (new Date(session.session_end_time).getTime() - now) / 60000)
      : Math.max(
          0,
          session.total_minutes -
            (now - new Date(session.session_start_time).getTime()) / 60000
        );

    setRemaining(newRemaining);

  }, [session]);

  useEffect(() => {
    const timeout = setTimeout(updateRemaining, 0);
    const interval = setInterval(updateRemaining, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [updateRemaining]);

  useEffect(() => {
    const isActive = session && (session.status === "active" || session.status === "playing");
    if (
      !isActive ||
      remaining === null ||
      remaining <= 0 ||
      remaining > TEN_MINUTE_ALARM_THRESHOLD
    ) return;

    const sessionIdentity = session.id || `${room.id}:${session.session_start_time}`;
    const durationIdentity = session.session_end_time || session.total_minutes;
    const alarmKey = `${sessionIdentity}:${durationIdentity}`;
    if (playedAlarmKeys.has(alarmKey) || pendingAlarmKeys.has(alarmKey)) return;

    // Keep the key pending so the 1-second timer and 2-second session refresh
    // cannot schedule the same alarm concurrently. Persist only after audio
    // succeeds, allowing a blocked browser to retry after user interaction.
    pendingAlarmKeys.add(alarmKey);
    playTenMinuteAlarm()
      .then(() => savePlayedAlarmKey(alarmKey))
      .catch((error) => {
        console.warn(`Ten-minute alarm failed for ${room.name}.`, error);
      })
      .finally(() => pendingAlarmKeys.delete(alarmKey));
  }, [remaining, room.id, room.name, session]);

  const mins = remaining !== null ? Math.floor(remaining) : 0;
  const secs = remaining !== null ? Math.floor((remaining - mins) * 60).toString().padStart(2, "0") : "00";

  // Check if there's an active session (even if room.is_active is false initially)
  const hasActiveSession = session && (session.status === 'active' || session.status === 'playing');
  const hasCompletedSession = Boolean(finishedSession);
  const isFree = !hasActiveSession && !room.is_active;
  
  // Show timer only if session_start_time exists, otherwise show "USING" or "READY"
  const timerDisplay = hasCompletedSession
    ? "00:00"
    : isFree
    ? "FREE" 
    : hasActiveSession && remaining !== null 
      ? `${mins}:${secs}` 
      : hasActiveSession 
        ? "USING" 
        : "READY";

  // Pastel color theme
  let bg = "bg-[#e9d5ff] text-purple-900"; // Lavender (FREE)
  let glow = "shadow-purple-300";

  if (hasCompletedSession) {
    bg = "bg-[#fed7aa] text-red-950";
    glow = "shadow-red-300";
  } else if (!isFree) {
    if (hasActiveSession && remaining === null) {
      // Session active but no timer yet (just started)
      bg = "bg-[#c7d2fe] text-indigo-900"; // Indigo (USING)
      glow = "shadow-indigo-200";
    } else if (remaining === null) {
      // Session ready but idle
      bg = "bg-[#dbeafe] text-blue-900"; // Light Blue (READY)
      glow = "shadow-blue-200";
    } else if (remaining >= 60) {
      bg = "bg-[#bbf7d0] text-green-900"; // Mint
      glow = "shadow-green-200";
    } else if (remaining >= 30) {
      bg = "bg-[#fef9c3] text-yellow-900"; // Yellow
      glow = "shadow-yellow-200";
    } else {
      bg = "bg-[#fecdd3] text-red-900"; // Soft Red
      glow = "shadow-red-200";
    }
  }

  return (
    <div
      onClick={() => onClick(room)}
      className={`
        ${bg}
        ${hasCompletedSession ? "room-session-finished" : ""}
        room-square rounded-2xl
        flex flex-col items-center justify-center
        text-xl font-semibold
        shadow-lg ${glow}
        border border-white/40
        backdrop-blur-sm
        transition-all duration-300 hover:scale-[1.04]
        cursor-pointer
      `}
    >
      <div className="room-square__name text-2xl font-bold">{room.name}</div>

      <div className="room-square__timer mt-3 text-lg font-medium">
        {timerDisplay}
      </div>

      {extensionNotice && !hasCompletedSession ? (
        <div className="room-square__notice mt-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md">
          Guest added +{extensionNotice.addedMinutes} min
        </div>
      ) : null}

      {hasCompletedSession && (
        <div className="room-square__finished mt-4 flex flex-col items-center gap-3">
          <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white shadow-sm">
            Session Finished
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAcknowledge?.();
            }}
            className="rounded-lg bg-white/80 px-3 py-1 text-sm font-semibold text-red-800 shadow hover:bg-white"
          >
            Acknowledge
          </button>
        </div>
      )}
    </div>
  );
}
