import React, { useState, useEffect } from "react";
import { api, getApiBase } from "../api";

export default function RoomSelectModal({ rooms: initialRooms = [], device, onSelect, onClose }) {
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState(initialRooms);

  // Fetch rooms with availability info
  useEffect(() => {
    (async () => {
      try {
        const deviceUuid = localStorage.getItem("device_uuid");
        const url = deviceUuid
          ? `/rooms/available?device_uuid=${encodeURIComponent(deviceUuid)}`
          : "/rooms/available";
        const data = await api(url);
        if (Array.isArray(data)) {
          setRooms(data);
        }
      } catch (err) {
        console.warn("Could not fetch room availability, using initial list:", err.message);
        // Keep initialRooms as fallback
      }
    })();
  }, []);

  const handleAssign = async () => {
    if (!selectedRoomId) {
      alert("Please select a room");
      return;
    }
    
    setLoading(true);
    try {
      const deviceUuid = localStorage.getItem("device_uuid");
      if (!deviceUuid) {
        alert("Device UUID not found. Please refresh the page.");
        setLoading(false);
        return;
      }
      
      await api("/devices/assign-room", {
        method: "POST",
        body: JSON.stringify({ 
          device_uuid: deviceUuid,
          room_id: selectedRoomId
        })
      });
      
      console.log("✅ Device assigned to room in backend");
      
      localStorage.setItem("room_id", selectedRoomId);
      localStorage.setItem("roomId", selectedRoomId);
      
      onSelect(selectedRoomId);
    } catch (error) {
      console.error("Error assigning room:", error);
      const errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("already taken")) {
        alert(errorMsg);
        // Refresh room list to show updated availability
        try {
          const deviceUuid = localStorage.getItem("device_uuid");
          const url = deviceUuid
            ? `/rooms/available?device_uuid=${encodeURIComponent(deviceUuid)}`
            : "/rooms/available";
          const data = await api(url);
          if (Array.isArray(data)) setRooms(data);
        } catch {}
      } else {
        alert(`Failed to assign room: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full mx-4 border border-slate-700">
        <h2 className="text-2xl font-bold text-white mb-4">Select Room</h2>
        <p className="text-slate-400 mb-6">
          Please select a room for this device to continue.
        </p>
        
        {rooms.length === 0 ? (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200">
            <p className="font-semibold mb-2">⚠️ Backend Connection Issue</p>
            <p className="text-sm">Cannot load rooms. Please ensure the backend server is running at {getApiBase()}</p>
            <p className="text-xs mt-1 text-yellow-300">Check browser console (F12) for detailed error messages.</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block text-white mb-2 font-semibold">Select Room:</label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full bg-slate-700 text-white px-4 py-3 rounded border-2 border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-lg"
              >
                <option value="">-- Select a room --</option>
                {rooms.map((room) => {
                  const roomName = room.name || `Room ${String(room.id).slice(0, 8)}`;
                  const takenByTablet = room.has_tablet && !room.my_room;
                  return (
                    <option
                      key={room.id}
                      value={room.id}
                      disabled={takenByTablet}
                    >
                      {roomName}{takenByTablet ? " (taken)" : ""}{room.my_room ? " (current)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded text-blue-200 text-sm">
              <p className="font-semibold mb-1">💡 Tip:</p>
              <p>Select the same room in both Tablet App and Display App to connect them. When you play a song in Tablet App, it will play in Display App for the same room.</p>
            </div>
          </>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleAssign}
            disabled={!selectedRoomId || loading}
            className="flex-1 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors"
          >
            {loading ? "Assigning..." : "Assign Room"}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
