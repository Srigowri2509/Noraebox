import React, { useState, useEffect } from "react";
import { useRoom } from "../context/RoomContext";
import { api } from "../api";

export default function Header() {
  const { roomId, queue, room } = useRoom();
  const queueCount = Array.isArray(queue) ? queue.length : 0;
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
    <header className="relative z-20">
      <div className="w-full max-w-[1800px] mx-auto pt-1 sm:pt-2">
        {/* Logo and Title */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden border border-slate-800 shadow-lg relative shrink-0" style={{ boxShadow: "0 0 15px rgba(59, 130, 246, 0.3), 0 0 30px rgba(236, 72, 153, 0.2)" }}>
              <img
                src="/logo_norebox.jpg"
                alt="Noreabox logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-white leading-none mb-0">
                Noraebox
              </h1>
              <p className="text-slate-300 text-[10px] sm:text-xs leading-tight">Your stage awaits</p>
            </div>
          </div>
          
          {/* Room Indicator */}
          <div style={{ 
            fontSize: "0.75rem",
            color: "#60a5fa",
            backgroundColor: "rgba(96, 165, 250, 0.1)",
            padding: "0.375rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid rgba(96, 165, 250, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            maxWidth: "50%"
          }} className="shrink min-w-0">
            <span style={{ opacity: 0.7 }} className="shrink-0">Room:</span>
            <span style={{ fontWeight: "600" }} className="truncate">{displayText}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
