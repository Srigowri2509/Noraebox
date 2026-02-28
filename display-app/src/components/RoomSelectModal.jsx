import React, { useState } from "react";
import { api, API_BASE } from "../api";

export default function RoomSelectModal({ rooms = [], device, onSelect, onClose }) {
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!selectedRoomId) {
      alert("Please select a room");
      return;
    }
    
    setLoading(true);
    try {
      // Use POST /devices/assign-room endpoint
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
      
      console.log("✅ Display device assigned to room in backend");
      
      // Set room_id locally
      localStorage.setItem("room_id", selectedRoomId);
      localStorage.setItem("roomId", selectedRoomId);
      
      // Call onSelect to update parent
      onSelect(selectedRoomId);
    } catch (error) {
      console.error("Error assigning room:", error);
      const errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("already has a")) {
        alert(`Room assignment failed: ${errorMsg}. Please select a different room.`);
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
        
        <div className="mb-6">
          <label className="block text-white mb-4 font-semibold text-center">Select Room:</label>
          {rooms.length === 0 ? (
            <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200 text-sm mb-4">
              <p className="font-semibold mb-1">⚠️ Backend Connection Issue</p>
              <p>Cannot load rooms. Please ensure the backend server is running at {API_BASE}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {rooms.slice(0, 4).map((room, index) => {
                const roomNum = index + 1;
                const roomId = room?.id;
                const roomName = room?.name || `Room ${roomNum}`;
                const isSelected = selectedRoomId === roomId;
                
                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(roomId)}
                    className={`p-6 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg'
                        : 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-2xl font-bold">{roomName}</div>
                    <div className="text-sm mt-1 text-slate-300">Room {roomNum}</div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded text-blue-200 text-sm">
            <p className="font-semibold mb-1">💡 Tip:</p>
            <p>Select the same room in both Tablet App and Display App to connect them. When you play a song in Tablet App, it will play in Display App for the same room.</p>
          </div>
        </div>

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

