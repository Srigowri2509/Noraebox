import React, { useState, useEffect } from 'react';
import { api, API_BASE } from '../api';

export default function RoomSelection({ onRoomSelect }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [manualRoomId, setManualRoomId] = useState("");
  const [assigning, setAssigning] = useState(null); // room id being assigned

  const handleSelect = async (roomId) => {
    if (!roomId) return;
    setAssigning(roomId);

    try {
      // Try to assign via backend (with locking)
      const deviceUuid = localStorage.getItem("device_uuid");
      if (deviceUuid) {
        await api("/devices/assign-room", {
          method: "POST",
          body: JSON.stringify({
            device_uuid: deviceUuid,
            room_id: roomId,
          }),
        });
      }
      localStorage.setItem("roomId", roomId);
      localStorage.setItem("room_id", roomId);
      onRoomSelect(roomId);
    } catch (err) {
      const msg = err.message || "Unknown error";
      if (msg.includes("already taken")) {
        alert(msg);
        // Refresh rooms to show updated status
        fetchRooms();
      } else {
        // Fallback: still assign locally
        localStorage.setItem("roomId", roomId);
        localStorage.setItem("room_id", roomId);
        onRoomSelect(roomId);
      }
    } finally {
      setAssigning(null);
    }
  };

  const handleManualAssign = () => {
    if (manualRoomId.trim()) {
      handleSelect(manualRoomId.trim());
    }
  };

  async function fetchRooms() {
    try {
      const deviceUuid = localStorage.getItem("device_uuid");
      const url = deviceUuid
        ? `/rooms/available?device_uuid=${encodeURIComponent(deviceUuid)}`
        : "/rooms/available";

      const data = await api(url);
      const roomsData = Array.isArray(data) ? data : (data.data || []);
      setRooms(roomsData);
      setError(null);
    } catch (err) {
      console.warn("Could not fetch /rooms/available, falling back to /rooms:", err.message);
      try {
        const res = await api("/rooms");
        const roomsData = res.data || res;
        setRooms(Array.isArray(roomsData) ? roomsData : []);
        setError(null);
      } catch (error2) {
        console.error("Error fetching rooms:", error2);
        setError(error2.message || "Failed to connect to backend");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRooms();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div className="text-2xl">Loading rooms...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white p-8">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">Noraebox Display</h1>
          <p className="text-gray-400 text-2xl">Select your room</p>
        </div>

        {error && rooms.length === 0 && (
          <div className="mb-6 p-6 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-200">
            <p className="font-semibold mb-2 text-lg">⚠️ Backend Connection Issue</p>
            <p className="text-sm mb-2">
              Cannot load rooms. Please ensure the backend server is running at {API_BASE}
            </p>
            <p className="text-sm mb-4">
              If you have a room ID, enter it below:
            </p>
            <input
              type="text"
              value={manualRoomId}
              onChange={(e) => setManualRoomId(e.target.value)}
              placeholder="Enter room ID (UUID)"
              className="w-full mt-2 bg-black/50 text-white px-4 py-3 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleManualAssign();
                }
              }}
            />
            <button
              onClick={handleManualAssign}
              disabled={!manualRoomId.trim()}
              className="mt-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded transition-colors"
            >
              Assign Room
            </button>
          </div>
        )}
        
        {rooms.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {rooms.map((room) => {
              const roomName = room.name || `Room ${String(room.id).slice(0, 8)}`;
              const takenByDisplay = room.has_display && !room.my_room;
              const isAssigning = assigning === room.id || assigning === String(room.id);

              return (
                <button
                  key={room.id}
                  onClick={() => !takenByDisplay && handleSelect(room.id)}
                  disabled={takenByDisplay || isAssigning}
                  className={`rounded-xl p-8 text-center transition-all border-2 ${
                    takenByDisplay
                      ? "bg-gray-900/50 border-gray-700 opacity-50 cursor-not-allowed"
                      : room.my_room
                      ? "bg-gray-900 border-green-500 hover:border-green-400"
                      : "bg-gray-900 hover:bg-gray-800 border-purple-500/30 hover:border-purple-500"
                  }`}
                >
                  <div className={`text-3xl font-bold mb-2 ${
                    takenByDisplay ? "text-gray-500" : room.my_room ? "text-green-400" : "text-purple-400"
                  }`}>
                    {roomName}
                  </div>
                  {takenByDisplay && (
                    <div className="text-red-400 text-sm font-medium">Taken</div>
                  )}
                  {room.my_room && (
                    <div className="text-green-400 text-sm font-medium">Current</div>
                  )}
                  {!takenByDisplay && !room.my_room && (
                    <div className="text-gray-500 text-sm">
                      {isAssigning ? "Assigning..." : "Available"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!error && rooms.length === 0 && (
          <div className="text-center text-gray-400 mt-8 text-xl">
            No rooms available. Please contact administrator.
          </div>
        )}
      </div>
    </div>
  );
}
