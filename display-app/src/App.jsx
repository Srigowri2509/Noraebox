import React, { useState, useEffect } from "react";
import Display from "./screens/Display";
import RoomSelectModal from "./components/RoomSelectModal";
import { ensureDeviceRegistered } from "./init/registerDevice";
import { api } from "./api";
import updateService from "./services/updateService";

export default function App() {
  const [roomId, setRoomId] = useState(null); // Start with null - backend is source of truth
  const [isRegistering, setIsRegistering] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [showRoomSelect, setShowRoomSelect] = useState(false);

  // Initialize update service
  useEffect(() => {
    // Check for updates on startup (after 10 seconds for TV/display)
    updateService.checkOnStartup();
    
    // Schedule daily update checks at 3 AM (off-peak for TV)
    updateService.scheduleDailyCheck(3, 0);
    
    return () => {
      updateService.stopScheduledChecks();
    };
  }, []);

  // Register device on mount
  useEffect(() => {
    (async () => {
      // Clear any stale room data from localStorage first
      localStorage.removeItem("room_id");
      localStorage.removeItem("roomId");
      
      try {
        const result = await ensureDeviceRegistered();
        console.log("Display App: Registration result:", result);
        setDeviceInfo(result.device);
        
        // Fetch rooms list
        try {
          const roomsRes = await api('/rooms');
          const roomsData = Array.isArray(roomsRes) ? roomsRes : (roomsRes.data || []);
          setRooms(roomsData);
        } catch (error) {
          console.error("Error fetching rooms:", error);
          setRooms([]);
        }
        
        // Check if device is assigned to a room
        // The registration endpoint returns assigned:true and room_id if device has a room
        if (result.assigned && result.room_id) {
          console.log("Display App: Device already assigned to room:", result.room_id);
          localStorage.setItem("room_id", result.room_id);
          localStorage.setItem("roomId", result.room_id);
          setRoomId(result.room_id);
          setShowRoomSelect(false);
        } else {
          // No room assigned in backend - show room selection (BLOCK everything until room selected)
          console.log("Display App: No room assigned - showing room selection");
          console.log("Registration result:", { assigned: result.assigned, room_id: result.room_id });
          setShowRoomSelect(true);
          setRoomId(null);
        }
      } catch (error) {
        console.error("Error in device registration:", error);
        // Backend is down - show room selection and clear stale data
        localStorage.removeItem("room_id");
        localStorage.removeItem("roomId");
        setShowRoomSelect(true);
        setRoomId(null);
      } finally {
        setIsRegistering(false);
      }
    })();
  }, []);

  const handleRoomSelect = async (selectedRoomId) => {
    if (!selectedRoomId) return;
    console.log("Display App: Room selected:", selectedRoomId);
    
    const deviceUuid = localStorage.getItem("device_uuid");
    if (!deviceUuid) {
      alert("Device UUID not found. Please refresh the page.");
      return;
    }
    
    try {
      // Use POST /devices/assign-room endpoint
      await api("/devices/assign-room", {
        method: "POST",
        body: JSON.stringify({ 
          device_uuid: deviceUuid,
          room_id: selectedRoomId
        })
      });
      console.log("✅ Display device assigned to room:", selectedRoomId);
      
      localStorage.setItem("roomId", selectedRoomId);
      localStorage.setItem("room_id", selectedRoomId);
      setRoomId(selectedRoomId);
      setShowRoomSelect(false);
      // Reload to ensure all components use the new room_id
      window.location.reload();
    } catch (error) {
      console.error("Error assigning room:", error);
      const errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("already has a")) {
        alert(`Room assignment failed: ${errorMsg}. Please select a different room.`);
      } else {
        alert(`Failed to assign room: ${errorMsg}`);
      }
    }
  };


  // Show loading while registering
  if (isRegistering) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-xl mb-2">Registering display device...</div>
          <div className="text-sm text-gray-400">Connecting to backend...</div>
        </div>
      </div>
    );
  }

  // Block everything until room is assigned (same as tablet-app)
  if (showRoomSelect || !roomId) {
    return (
      <RoomSelectModal
        rooms={rooms}
        device={deviceInfo}
        onSelect={handleRoomSelect}
        onClose={() => {
          // Don't allow closing - device must be assigned
          alert("Please select a room to continue.");
        }}
      />
    );
  }

  // Only show Display component after room is selected
  return <Display roomId={roomId} />;
}
