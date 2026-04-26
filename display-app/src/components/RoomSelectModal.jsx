import React, { useState, useEffect } from "react";
import { api, API_BASE } from "../api";

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
      
      console.log("✅ Display device assigned to room in backend");
      
      localStorage.setItem("room_id", selectedRoomId);
      localStorage.setItem("roomId", selectedRoomId);
      
      onSelect(selectedRoomId);
    } catch (error) {
      console.error("Error assigning room:", error);
      const errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("already taken")) {
        alert(errorMsg);
        // Refresh room list
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
    <div className="room-modal-overlay">
      <div className="room-modal-card">
        <h2 className="room-modal-title">Select Room</h2>
        <p className="room-modal-subtitle">
          Please select a room for this device to continue.
        </p>
        {device?.name && <p className="room-modal-device">Device: {device.name}</p>}
        
        {rooms.length === 0 ? (
          <div className="room-modal-warning">
            <p className="room-modal-warning-title">Backend Connection Issue</p>
            <p className="room-modal-warning-text">
              Cannot load rooms. Please ensure the backend server is running at {API_BASE}
            </p>
          </div>
        ) : (
          <>
            <div className="room-modal-field">
              <label className="room-modal-label">Select Room</label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="room-modal-select"
              >
                <option value="">-- Select a room --</option>
                {rooms.map((room) => {
                  const roomName = room.name || `Room ${String(room.id).slice(0, 8)}`;
                  const takenByDisplay = room.has_display && !room.my_room;
                  return (
                    <option
                      key={room.id}
                      value={room.id}
                      disabled={takenByDisplay}
                    >
                      {roomName}{takenByDisplay ? " (taken)" : ""}{room.my_room ? " (current)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="room-modal-tip">
              <p className="room-modal-tip-title">Tip</p>
              <p className="room-modal-tip-text">
                Select the same room in both Tablet App and Display App to connect them.
                When you play a song in Tablet App, it will play in Display App for the same room.
              </p>
            </div>
          </>
        )}

        <div className="room-modal-actions">
          <button
            onClick={handleAssign}
            disabled={!selectedRoomId || loading}
            className="room-modal-btn room-modal-btn-primary"
          >
            {loading ? "Assigning..." : "Assign Room"}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="room-modal-btn room-modal-btn-secondary"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
