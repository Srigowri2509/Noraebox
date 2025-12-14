import { useEffect, useState } from "react";
import { api } from "../api";

export default function RoomCard({ room, onExtend, onEnd }) {
  const [remaining, setRemaining] = useState(0);
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
    }
  }, [room.id, room.is_active]);

  const compute = () => {
    // Timer only shows when session_start_time exists (first song played)
    if (!session || !session.session_start_time || !session.total_minutes) {
      return null; // Session ready but idle - no timer yet
    }

    const start = new Date(session.session_start_time);
    const now = new Date();
    const elapsed = (now - start) / 60000;
    return Math.max(0, session.total_minutes - elapsed);
  };

  useEffect(() => {
    const computed = compute();
    if (computed !== null) {
      setRemaining(computed);
      const interval = setInterval(() => {
        const newRemaining = compute();
        if (newRemaining !== null) {
          setRemaining(newRemaining);
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setRemaining(0);
    }
  }, [session]);

  const mins = Math.floor(remaining);
  const sec = Math.floor((remaining - mins) * 60)
    .toString()
    .padStart(2, "0");

  let border = "border-green-500";
  if (remaining < 30) border = "border-red-500";
  else if (remaining < 60) border = "border-yellow-500";

  // Show timer only if session_start_time exists, otherwise show "READY"
  const timerDisplay = session && session.session_start_time 
    ? `${mins}:${sec}` 
    : room.is_active 
      ? "READY" 
      : "FREE";

  return (
    <div className={`border-2 ${border} rounded-xl p-4 bg-white/40 text-white`}>
      <div className="text-xl font-bold">{room.name}</div>

      <div className="text-4xl my-2">
        {timerDisplay}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          className="px-4 py-2 bg-purple-600 rounded-lg"
          onClick={() => onExtend(room.id)}
        >
          + Extend
        </button>

        <button
          className="px-4 py-2 bg-red-600 rounded-lg"
          onClick={() => onEnd(room.id)}
        >
          End
        </button>
      </div>
    </div>
  );
}
