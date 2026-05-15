import React, { useState, useEffect } from "react";
import { useRoom } from "../context/RoomContext";
import { api } from "../api";

export default function Header() {
  const { roomId, room } = useRoom();
  const [roomName, setRoomName] = useState(null);
  
  // Get room ID from context or localStorage
  const currentRoomId = room?.id || roomId || localStorage.getItem("room_id") || localStorage.getItem("roomId") || null;
  
  // Fetch room name from backend
  useEffect(() => {
    if (currentRoomId) {
      (async () => {
        try {
          const roomData = await api(`/rooms/${currentRoomId}`);
          const name = roomData.name || `Room ${currentRoomId.slice(0, 8)}`;
          setRoomName(name);
        } catch (error) {
          console.error("Error fetching room name:", error);
          setRoomName(`Room ${currentRoomId.slice(0, 8)}`);
        }
      })();
    } else {
      setRoomName(null);
    }
  }, [currentRoomId]);

  const displayText = roomName || (currentRoomId ? `Room ${currentRoomId.slice(0, 8)}` : "Not connected");

  return (
    <header className="relative z-20 shrink-0">
      <div className="mx-auto w-full max-w-[1800px] pt-1 sm:pt-2 md:pt-3">
        <div className="flex w-full items-center justify-between gap-3 md:gap-4">
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 md:h-16 md:w-16" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35), 0 0 15px rgba(59, 130, 246, 0.3), 0 0 30px rgba(236, 72, 153, 0.2)" }}>
              <img
                src={`${import.meta.env.BASE_URL}logo_norebox.jpg`}
                alt="Noreabox logo"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h1 className="mb-0 text-xl font-extrabold leading-none text-white sm:text-2xl md:text-3xl lg:text-4xl">
                Noraebox
              </h1>
              <p className="text-xs leading-tight text-slate-300 sm:text-sm md:text-base">Your stage awaits.</p>
            </div>
          </div>

          <div
            className="flex min-w-0 max-w-[52%] shrink-0 items-center gap-2 rounded-full border border-sky-400/35 bg-sky-500/10 py-2 pl-3 pr-4 text-sky-300 md:gap-2.5 md:py-2.5 md:pl-4 md:pr-5"
            style={{
              fontSize: "clamp(0.8rem, 1.2vw, 1.05rem)",
            }}
          >
            <span className="shrink-0 opacity-80">Room:</span>
            <span className="truncate font-semibold text-white">{displayText}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
