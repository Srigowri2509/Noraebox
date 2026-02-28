import { useEffect, useState } from "react";
import { api } from "../api";

export default function RoomSquare({ room, onClick, onAutoEnd }) {
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

  const updateRemaining = () => {
    // Timer only shows when session_start_time exists (first song played)
    if (!session || !session.session_start_time || !session.total_minutes) {
      setRemaining(null); // Session ready but idle - no timer yet
      return;
    }

    const start = new Date(session.session_start_time);
    const now = new Date();
    const elapsed = (now - start) / 60000;
    const newRemaining = Math.max(0, session.total_minutes - elapsed);

    setRemaining(newRemaining);

    if (newRemaining <= 0 && room.is_active && onAutoEnd) {
      onAutoEnd(room);
    }
  };

  useEffect(() => {
    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [session, room]);

  const mins = remaining !== null ? Math.floor(remaining) : 0;
  const secs = remaining !== null ? Math.floor((remaining - mins) * 60).toString().padStart(2, "0") : "00";

  // Check if there's an active session (even if room.is_active is false initially)
  const hasActiveSession = session && (session.status === 'active' || session.status === 'playing');
  const isFree = !hasActiveSession && !room.is_active;
  
  // Show timer only if session_start_time exists, otherwise show "USING" or "READY"
  const timerDisplay = isFree 
    ? "FREE" 
    : hasActiveSession && remaining !== null 
      ? `${mins}:${secs}` 
      : hasActiveSession 
        ? "USING" 
        : "READY";

  // Pastel color theme
  let bg = "bg-[#e9d5ff] text-purple-900"; // Lavender (FREE)
  let glow = "shadow-purple-300";

  if (!isFree) {
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
        w-[250px] h-[250px] rounded-2xl
        flex flex-col items-center justify-center
        text-xl font-semibold
        shadow-lg ${glow}
        border border-white/40
        backdrop-blur-sm
        transition-all duration-300 hover:scale-[1.04]
        cursor-pointer
      `}
    >
      <div className="text-2xl font-bold">{room.name}</div>

      <div className="mt-3 text-lg font-medium">
        {timerDisplay}
      </div>
    </div>
  );
}
