import { useEffect, useState } from "react";
import { api } from "../api";
import RoomSquare from "../components/RoomSquare";
import RoomModal from "../components/RoomModal";

export default function Dashboard() {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [devices, setDevices] = useState([]);
  const [connectionError, setConnectionError] = useState(null);

  // Fetch rooms from database
  const loadRooms = async () => {
    console.log("📡 Fetching rooms...");
    try {
      const res = await api('/rooms');
      const data = res.data || res;
      const roomsArray = Array.isArray(data) ? data : [];
      // Sort by id
      roomsArray.sort((a, b) => (a.id || "").localeCompare(b.id || ""));
      console.log("📦 Rooms fetched:", roomsArray);
      setRooms(roomsArray);
      setConnectionError(null); // Clear error on success
    } catch (error) {
      console.log("❌ Error:", error);
      setRooms([]);
      setConnectionError(error.message || "Failed to connect to backend");
    }
  };

  // Load devices
  const loadDevices = async () => {
    try {
      const res = await api('/devices');
      const data = res.data || res;
      setDevices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading devices:", error);
      setDevices([]);
    }
  };

  useEffect(() => {
    loadRooms();
    loadDevices();
    // Poll for updates every 2 seconds
    const interval = setInterval(() => {
      loadRooms();
      loadDevices();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto end room when timer hits 0
  const autoEndRoom = async (room) => {
    try {
      await api(`/rooms/${room.id}/end`, {
        method: "POST"
      });
      loadRooms();
    } catch (err) {
      console.error("Error ending room:", err);
    }
  };

  // Open modal
  const openRoom = (room) => {
    setSelectedRoom(room);
  };

  // Handle Start Session
  const startRoom = async (minutes) => {
    if (!selectedRoom || !minutes || minutes <= 0) {
      console.error("Invalid room or minutes");
      return;
    }
    try {
      console.log(`Starting session for room ${selectedRoom.id} with ${minutes} minutes`);
      await api(`/rooms/${selectedRoom.id}/start`, {
        method: "POST",
        body: JSON.stringify({
          total_minutes: minutes
        })
      });
      console.log("Session started successfully");
      setSelectedRoom(null);
      loadRooms();
    } catch (err) {
      console.error("Error starting room:", err);
      alert(`Failed to start session: ${err.message || "Unknown error"}`);
    }
  };

  // Handle Extend Session
  const extendRoom = async (minutes) => {
    if (!selectedRoom || !minutes || minutes <= 0) {
      console.error("Invalid room or minutes");
      return;
    }
    try {
      // Get current session state from room_sessions
      const sessionData = await api(`/rooms/${selectedRoom.id}/session`);
      const session = sessionData.session;
      
      if (!session || !selectedRoom.is_active) {
        // If session not active, just start a new one
        await startRoom(minutes);
        return;
      }
      
      // Calculate remaining time from session_start_time
      let newTotalMinutes = minutes;
      if (session.session_start_time && session.total_minutes) {
        const startedAt = new Date(session.session_start_time);
        const now = new Date();
        const elapsedMinutes = (now - startedAt) / 60000;
        const remainingMinutes = Math.max(0, session.total_minutes - elapsedMinutes);
        newTotalMinutes = remainingMinutes + minutes;
        
        console.log(`Extending session for room ${selectedRoom.id} by ${minutes} minutes`);
        console.log(`Current remaining: ${remainingMinutes.toFixed(1)} min, New total: ${newTotalMinutes.toFixed(1)} min`);
      } else {
        // Session ready but idle - just add to total_minutes
        newTotalMinutes = (session.total_minutes || 0) + minutes;
        console.log(`Extending session for room ${selectedRoom.id} by ${minutes} minutes (session not started yet)`);
      }
      
      // Update room_sessions total_minutes via room status endpoint
      // Note: We need to update room_sessions, but for now use the status endpoint
      // TODO: Create proper endpoint to update room_sessions.total_minutes
      await api(`/rooms/${selectedRoom.id}/status`, {
        method: "PUT",
        body: JSON.stringify({
          total_minutes: newTotalMinutes
        })
      });
      
      console.log("Session extended successfully");
      setSelectedRoom(null);
      loadRooms();
    } catch (err) {
      console.error("Error extending room:", err);
      alert(`Failed to extend session: ${err.message || "Unknown error"}`);
    }
  };

  // Handle Cancel Session
  const cancelSession = async () => {
    if (!selectedRoom) {
      console.error("No room selected");
      return;
    }
    try {
      const confirmed = window.confirm(`Are you sure you want to cancel the session for ${selectedRoom.name}?`);
      if (!confirmed) return;

      console.log(`Canceling session for room ${selectedRoom.id}`);
      await api(`/rooms/${selectedRoom.id}/end`, {
        method: "POST"
      });
      console.log("Session canceled successfully");
      setSelectedRoom(null);
      loadRooms();
    } catch (err) {
      console.error("Error canceling session:", err);
      alert(`Failed to cancel session: ${err.message || "Unknown error"}`);
    }
  };

  // Handle device assignment
  const assignDeviceToRoom = async (deviceId, roomId) => {
    try {
      // Check if room is already assigned to another device (frontend validation)
      if (roomId) {
        const alreadyAssigned = devices.find(
          d => d.id !== deviceId && d.room_id === roomId
        );
        if (alreadyAssigned) {
          const deviceName = alreadyAssigned.name || alreadyAssigned.device_uuid?.slice(0, 8) || "Unknown";
          alert(`Cannot assign: Room is already assigned to device "${deviceName}"`);
          return;
        }
      }

      // Send null if empty string to unassign device
      await api(`/devices/${deviceId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ room_id: roomId || null })
      });
      loadDevices();
    } catch (err) {
      console.error("Error assigning device:", err);
      alert(`Failed to assign device: ${err.message || "Unknown error"}`);
      // Reload devices to sync state
      loadDevices();
    }
  };

  return (
    <>
      {connectionError && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg max-w-2xl">
          <div className="font-bold text-lg mb-2">⚠️ Backend Connection Failed</div>
          <div className="text-sm mb-2">{connectionError}</div>
          <div className="text-xs bg-red-600/50 p-2 rounded mt-2">
            <div className="font-semibold mb-1">To fix this:</div>
            <div>1. Open a terminal in the <code className="bg-black/30 px-1 rounded">backend</code> folder</div>
            <div>2. Run: <code className="bg-black/30 px-1 rounded">uvicorn app.main:app --reload --host 0.0.0.0 --port 8000</code></div>
            <div>3. Wait for "Application startup complete" message</div>
            <div>4. Refresh this page</div>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center" style={{ marginTop: "6rem" }}>
        {connectionError ? (
          <div className="text-center text-red-600 text-xl">
            Cannot connect to backend server at http://localhost:8000
          </div>
        ) : rooms.length > 0 ? (
          <div className="grid grid-cols-3 gap-40">
            {rooms.map((room) => (
              <RoomSquare
                key={room.id}
                room={room}
                onClick={() => openRoom(room)}
                onAutoEnd={autoEndRoom}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 text-xl">
            Loading rooms...
          </div>
        )}
      </div>

      {/* Devices Panel */}
      <div className="w-full flex justify-center mt-12">
        <div className="max-w-6xl w-full">
          <h2 className="text-2xl font-bold text-white mb-6">Devices</h2>
          {devices.length > 0 ? (
            <div className="bg-gray-800 rounded-lg p-6">
              <table className="w-full text-white">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-3">Device UUID</th>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Assigned Room</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id} className="border-b border-gray-700">
                      <td className="p-3 text-sm">{device.device_uuid?.slice(0, 8)}...</td>
                      <td className="p-3">{device.name || "Unnamed"}</td>
                      <td className="p-3">
                        {device.rooms?.name || device.room_id ? 
                          (device.rooms?.name || `Room ${device.room_id?.slice(0, 8)}`) : 
                          "Unassigned"}
                      </td>
                      <td className="p-3">
                        <select
                          value={device.room_id || ""}
                          onChange={(e) => assignDeviceToRoom(device.id, e.target.value)}
                          className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600"
                        >
                          <option value="">Unassigned</option>
                          {rooms.map((room) => {
                            // Check if room is assigned to another device
                            const isAssignedToOther = devices.some(
                              d => d.id !== device.id && d.room_id === room.id
                            );
                            const isCurrentDevice = device.room_id === room.id;
                            
                            return (
                              <option 
                                key={room.id} 
                                value={room.id}
                                disabled={isAssignedToOther && !isCurrentDevice}
                                style={{ 
                                  color: isAssignedToOther && !isCurrentDevice ? '#666' : 'inherit',
                                  fontStyle: isAssignedToOther && !isCurrentDevice ? 'italic' : 'normal'
                                }}
                              >
                                {room.name || room.id.slice(0, 8)}
                                {isAssignedToOther && !isCurrentDevice ? ' (Assigned)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-500 text-lg">
              No devices registered yet
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <RoomModal
        room={selectedRoom}
        onClose={() => setSelectedRoom(null)}
        onStart={startRoom}
        onExtend={extendRoom}
        onCancel={cancelSession}
      />
    </>
  );
}
