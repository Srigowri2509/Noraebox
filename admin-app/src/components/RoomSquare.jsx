import { useEffect, useState } from "react";
import { api } from "../api";

export default function RoomSquare({ room, onClick, onAutoEnd }) {
  const [remaining, setRemaining] = useState(null);
  const [session, setSession] = useState(null);

  // Fetch session data from room_sessions
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const sessionData = await api(`/rooms/${room.id}/session`);
        setSession(sessionData.session);
      } catch (error) {
        console.error("Error fetching session:", error);
        setSession(null);
      }
    };

    if (room.is_active) {
      fetchSession();
      const interval = setInterval(fetchSession, 2000);
      return () => clearInterval(interval);
    } else {
      setSession(null);
      setRemaining(null);
    }
  }, [room.id, room.is_active]);

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

  const isFree = !room.is_active;
  
  // Show timer only if session_start_time exists, otherwise show "READY"
  const timerDisplay = isFree 
    ? "FREE" 
    : (remaining !== null ? `${mins}:${secs}` : "READY");

  // Pastel color theme
  let bg = "bg-[#e9d5ff] text-purple-900"; // Lavender (FREE)
  let glow = "shadow-purple-300";

  if (!isFree) {
    if (remaining === null) {
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
