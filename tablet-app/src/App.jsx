import React, { useState, useEffect, useRef } from "react";
import Home from "./screens/Home";
import RoomSelectModal from "./components/RoomSelectModal";
import { ensureDeviceRegistered } from "./init/registerDevice";
import { api } from "./api";
import updateService from "./services/updateService";
import { loadRemoteConfig } from "./config";
import { useRoom } from "./context/RoomContext";

export default function App() {
  const { roomId, setRoomId } = useRoom(); // Use RoomContext instead of local state
  const [showRoomSelect, setShowRoomSelect] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const timeoutRef = useRef(null);

  // Load remote config and initialize update service
  useEffect(() => {
    // Clear any cached config with old URL
    const cachedConfig = localStorage.getItem('app_config');
    if (cachedConfig) {
      try {
        const config = JSON.parse(cachedConfig);
        if (config.api_url && config.api_url.includes('98.130.120.10')) {
          console.log('Clearing cached config with old URL');
          localStorage.removeItem('app_config');
        }
      } catch (e) {
        // Invalid config, clear it
        localStorage.removeItem('app_config');
      }
    }
    
    // Load remote config first (this updates API URL without rebuilding)
    loadRemoteConfig().then((config) => {
      console.log('✅ Config loaded:', config);
    }).catch(() => {
      console.log('Using default config');
    });
    
    // Check for updates on startup (after 5 seconds to let app load)
    updateService.checkOnStartup();
    
    // Schedule daily update checks at 2 AM
    updateService.scheduleDailyCheck(2, 0);
    
    return () => {
      updateService.stopScheduledChecks();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    // Set a maximum timeout to prevent infinite waiting (12 seconds)
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        console.warn("Device registration timeout - showing room selection");
        // Clear any stale room data and show room selection
        localStorage.removeItem("room_id");
        localStorage.removeItem("roomId");
        setShowRoomSelect(true);
        setRooms([]);
        setIsChecking(false);
        setError("Backend connection timeout. Please start the backend server or select a room.");
      }
    }, 12000);
    
    (async () => {
      try {
        const result = await ensureDeviceRegistered();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (!mountedRef.current) return;
        
        setDeviceInfo(result.device);
        
        // Clear any stale room data from localStorage first
        localStorage.removeItem("room_id");
        localStorage.removeItem("roomId");
        
        if (!result.assigned || !result.room_id) {
          // Device not assigned - show room selection
          setRooms(result.rooms || []);
          setShowRoomSelect(true);
          setRoomId(""); // Clear room in context
        } else {
          // Device is assigned - use the assigned room
          setRoomId(result.room_id); // Update RoomContext (also updates localStorage)
        }
      } catch (error) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        console.error("Error registering device:", error);
        if (!mountedRef.current) return;
        
        // Backend is down - always show room select (don't use stale localStorage data)
        console.warn("Backend unavailable. Showing room select.");
        // Clear any stale room data
        localStorage.removeItem("room_id");
        localStorage.removeItem("roomId");
        setShowRoomSelect(true);
        setRooms([]);
        setError(error.message || "Cannot connect to backend");
      } finally {
        if (mountedRef.current) {
          setIsChecking(false);
        }
      }
    })();
    
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleRoomSelected = async (selectedRoomId) => {
    if (!selectedRoomId) return;
    
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
      console.log("Device assigned to room:", selectedRoomId);
      
      // Update RoomContext (this also updates localStorage)
      setRoomId(selectedRoomId);
      setShowRoomSelect(false);
      // No need to reload - RoomContext will update all components
    } catch (error) {
      console.error("Error assigning device to room:", error);
      alert(`Failed to assign room: ${error.message || "Unknown error"}`);
    }
  };

  if (isChecking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0B0F17] text-white">
        <div className="text-center">
          <div className="text-xl mb-2">Registering device...</div>
          <div className="text-sm text-gray-400">Connecting to backend...</div>
          {error && (
            <div className="text-sm text-yellow-400 mt-4">{error}</div>
          )}
        </div>
      </div>
    );
  }

  // Block everything until room is assigned
  if (showRoomSelect || !roomId) {
    return (
      <RoomSelectModal
        rooms={rooms}
        device={deviceInfo}
        onSelect={handleRoomSelected}
        onClose={() => {
          // Don't allow closing - device must be assigned
          alert("Please select a room to continue.");
        }}
      />
    );
  }

  // Only show Home after room is assigned
  return <Home />;
}
