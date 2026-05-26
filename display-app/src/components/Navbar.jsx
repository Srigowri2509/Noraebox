import React, { useState, useEffect } from "react";
import { api } from "../api";

/*
  Simple top navbar.
  On right: "Time left: 59 min 30 sec"
  On left: Room name indicator
  Styling: dark neon background
*/
export default function Navbar({ timeText, roomId, nextSong, timeUrgent = false }) {
  const [roomName, setRoomName] = useState(null);
  // ONLY use roomId prop - don't trust localStorage (backend is source of truth)
  const currentRoomId = roomId || null;
  
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
          // If backend is down, show generic room ID
          setRoomName(`Room ${currentRoomId.slice(0, 8)}`);
        }
      })();
    } else {
      setRoomName(null);
    }
  }, [currentRoomId]);
  
  const displayText = roomName || (currentRoomId ? `Room ${currentRoomId.slice(0, 8)}` : "Not connected");
  
  return (
    <div className="nav-wrap">
      <div className="nav-inner">
        <div className="nav-left" style={{ 
          display: "flex",
          alignItems: "center",
          fontSize: "0.875rem",
          color: "#60a5fa",
          backgroundColor: "rgba(96, 165, 250, 0.1)",
          padding: "0.5rem 1rem",
          borderRadius: "0.5rem",
          border: "1px solid rgba(96, 165, 250, 0.3)",
          marginLeft: "1rem"
        }}>
          <span style={{ opacity: 0.7, marginRight: "0.5rem" }}>Room:</span>
          <span style={{ fontWeight: "600" }}>{displayText}</span>
        </div>
        <div className="nav-center" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          fontSize: "0.875rem",
          color: "#fff"
        }}>
          {nextSong ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255, 255, 255, 0.2)"
            }}>
              <span style={{ opacity: 0.7 }}>Next:</span>
              <span style={{ fontWeight: "600" }}>
                {nextSong.title} {nextSong.artist ? `— ${nextSong.artist}` : ''}
              </span>
            </div>
          ) : (
            <span style={{ opacity: 0.5 }}>No upcoming songs</span>
          )}
        </div>
        <div className="nav-right">
          <div className="time-label">
            <span>Time left</span>
            <span className={timeUrgent ? "time-value time-value--urgent" : "time-value"}>
              {timeText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
