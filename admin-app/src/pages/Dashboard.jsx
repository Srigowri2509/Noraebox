import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import RoomSquare from "../components/RoomSquare";
import RoomModal from "../components/RoomModal";
import DeviceRoomPanel from "../components/DeviceRoomPanel";

/**
 * Sort rooms for display. Rooms named with a number ("Room 3") sort
 * numerically; rooms named anything else (e.g. "Country", "Pop", "Jazz")
 * sort alphabetically after the numbered ones. Name-agnostic so custom
 * room names always appear.
 */
function getRoomNumber(room) {
  const name = String(room?.name ?? "").trim();
  const match = name.match(/room\s*#?\s*(\d+)/i) || name.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function sortRooms(rooms) {
  return [...rooms].sort((a, b) => {
    const diff = getRoomNumber(a) - getRoomNumber(b);
    if (diff !== 0) return diff;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

export default function Dashboard() {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [devices, setDevices] = useState([]);
  const [connectionError, setConnectionError] = useState(null);

  const gridRooms = useMemo(() => sortRooms(rooms), [rooms]);

  // Fetch rooms from database
  const loadRooms = async () => {
    console.log("📡 Fetching rooms...");
    try {
      const res = await api('/rooms');
      const data = res.data || res;
      const roomsArray = sortRooms(Array.isArray(data) ? data : []);
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
      // Check if there's an active session first
      try {
        const sessionData = await api(`/rooms/${selectedRoom.id}/session`);
        const session = sessionData.session;
        const hasActiveSession = session && (session.status === 'active' || session.status === 'playing');
        
        if (!hasActiveSession) {
          // If no active session, start a new one instead
          await startRoom(minutes);
          return;
        }
      } catch (sessionErr) {
        console.warn("Could not check session status, assuming no active session:", sessionErr);
        // If we can't check, try to start a new session
        await startRoom(minutes);
        return;
      }
      
      // Use the extend endpoint to set total minutes for current session
      console.log(`Setting session time for room ${selectedRoom.id} to ${minutes} minutes`);
      await api(`/rooms/${selectedRoom.id}/extend`, {
        method: "POST",
        body: JSON.stringify({
          minutes: minutes,
          total_minutes: minutes  // Also send as total_minutes for clarity
        })
      });
      
      console.log("Session time updated successfully");
      setSelectedRoom(null);
      // Force refresh rooms immediately
      await loadRooms();
      // Also refresh after a short delay to ensure backend has committed
      setTimeout(() => loadRooms(), 500);
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
      const device = devices.find((d) => d.id === deviceId);
      if (roomId && device?.device_type) {
        const sameTypeInRoom = devices.find(
          (d) =>
            d.id !== deviceId &&
            d.room_id === roomId &&
            d.device_type === device.device_type
        );
        if (sameTypeInRoom) {
          const otherName =
            sameTypeInRoom.name || sameTypeInRoom.device_uuid?.slice(0, 8) || "Unknown";
          alert(
            `This room already has a ${device.device_type} device (${otherName}). Unassign it first.`
          );
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

  // Delete a single device.
  const deleteDevice = async (deviceId) => {
    try {
      await api(`/devices/${deviceId}`, { method: "DELETE" });
      loadDevices();
    } catch (err) {
      console.error("Error deleting device:", err);
      alert(`Failed to delete device: ${err.message || "Unknown error"}`);
      loadDevices();
    }
  };

  // Delete all unassigned devices (clears test junk).
  const deleteUnassignedDevices = async () => {
    const count = devices.filter((d) => !d.room_id).length;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} unassigned device${count === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }
    try {
      await api(`/devices/unassigned`, { method: "DELETE" });
      loadDevices();
    } catch (err) {
      console.error("Error deleting unassigned devices:", err);
      alert(`Failed to delete unassigned devices: ${err.message || "Unknown error"}`);
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
        ) : gridRooms.length > 0 ? (
          <div className="rooms-grid">
            {gridRooms.map((room) => (
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

      {/* Devices — one compact card per room */}
      <div className="w-full flex justify-center mt-10 mb-16 px-4">
        <div className="device-panel-wrap">
          {devices.length > 0 ? (
            <DeviceRoomPanel
              rooms={rooms}
              devices={devices}
              onAssign={assignDeviceToRoom}
              onDelete={deleteDevice}
              onDeleteUnassigned={deleteUnassignedDevices}
            />
          ) : (
            <p className="device-panel-empty">No devices registered yet. Open the tablet or TV app to register.</p>
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
