import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../api";

const RoomContext = createContext();

export function RoomProvider({ children }) {
  // Use room_id from localStorage (set by device registration)
  const [roomId, setRoomId] = useState(localStorage.getItem("room_id") || localStorage.getItem("roomId") || "");
  const [queue, setQueue] = useState([]);
  const [room, setRoom] = useState(null);

  // Fetch room details when roomId changes
  useEffect(() => {
    if (roomId) {
      // Create minimal room object immediately
      setRoom({ id: roomId });
      
      // Then try to fetch full room details (don't block on this)
      (async () => {
        try {
          const res = await api(`/rooms/${roomId}/status`);
          setRoom({ ...res, id: roomId });
        } catch (error) {
          console.error("Error fetching room:", error);
          // Keep minimal room object if fetch fails - app can still work
        }
      })();
    } else {
      setRoom(null);
    }
  }, [roomId]);

  // Update localStorage when roomId changes
  const updateRoomId = (newRoomId) => {
    setRoomId(newRoomId);
    localStorage.setItem("room_id", newRoomId);
    localStorage.setItem("roomId", newRoomId); // Keep backward compatibility
  };

  return (
    <RoomContext.Provider value={{ roomId, setRoomId: updateRoomId, queue, setQueue, room }}>
      {children}
    </RoomContext.Provider>
  );
}

export const useRoom = () => useContext(RoomContext);
export const useRoomContext = () => useContext(RoomContext);
