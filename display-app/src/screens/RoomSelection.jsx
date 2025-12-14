import React, { useState, useEffect } from 'react';
import { api, API_BASE } from '../api';

export default function RoomSelection({ onRoomSelect }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [manualRoomId, setManualRoomId] = useState("");

  const handleSelect = (roomId) => {
    if (!roomId) return;
    localStorage.setItem("roomId", roomId);
    localStorage.setItem("room_id", roomId);
    onRoomSelect(roomId);
  };

  const handleManualAssign = () => {
    if (manualRoomId.trim()) {
      handleSelect(manualRoomId.trim());
    }
  };

  useEffect(() => {
    async function fetchRooms() {
      try {
        const res = await api('/rooms');
        const roomsData = res.data || res;
        setRooms(Array.isArray(roomsData) ? roomsData : []);
        setError(null);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching rooms:', error);
        setError(error.message || 'Failed to connect to backend');
        setLoading(false);
      }
    }

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
              If you have a room ID, enter it below or set it in the browser console:
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
            <code className="text-xs block mt-3 bg-black/50 p-2 rounded font-mono">
              localStorage.setItem("room_id", "your-room-id")
            </code>
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
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => handleSelect(room.id)}
                className="bg-gray-900 hover:bg-gray-800 border-2 border-purple-500/30 hover:border-purple-500 rounded-xl p-8 text-center transition-all"
              >
                <div className="text-3xl font-bold text-purple-400 mb-2">
                  {room.name || `Room ${room.id.slice(0, 8)}`}
                </div>
                <div className="text-gray-400 text-sm">ID: {room.id.slice(0, 8)}...</div>
              </button>
            ))}
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

