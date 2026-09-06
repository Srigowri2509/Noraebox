import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { playSessionFinishedSound } from "../services/audioService";

export default function RoomSquare({ room, onClick, finishedSession, onAcknowledge, extensionNotice }) {
  const [remaining, setRemaining] = useState(null);
  const [session, setSession] = useState(null);
  const previousRemainingSecondsRef = useRef(null);

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

  const remainingSeconds = remaining !== null
    ? Math.max(0, Math.ceil(remaining * 60))
    : null;
  const mins = remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : 0;
  const secs = remainingSeconds !== null
    ? String(remainingSeconds % 60).padStart(2, "0")
    : "00";

  // Check if there's an active session (even if room.is_active is false initially)
  const hasActiveSession = session && (session.status === 'active' || session.status === 'playing');
  const hasCompletedSession = Boolean(finishedSession);
  const isFree = !hasActiveSession && !room.is_active;

  useEffect(() => {
    const previousSeconds = previousRemainingSecondsRef.current;
    const justReachedZero =
      previousSeconds !== null && previousSeconds > 0 && remainingSeconds === 0;

    previousRemainingSecondsRef.current = remainingSeconds;

    // Sound only on the local countdown's transition to 00:00. Session events
    // must never trigger audio while the displayed timer is still above zero.
    if (!justReachedZero) return;

    const sessionId = session?.id;
    if (!sessionId) return;

    playSessionFinishedSound(String(sessionId)).catch((error) => {
      console.warn(`Session-finished sound failed for ${room.name}.`, error);
    });
  }, [remainingSeconds, room.name, session?.id]);
  
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
