import { api } from "../api";
import { safeGet, safeSet } from "../utils/safeStorage";

// Simple UUID v4 generator (fallback if uuid package not available)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Keeps the device id stable for the session even if storage is unavailable
// (Android TV WebView can throw on localStorage), so a single TV never spams
// the backend with a brand-new UUID on every poll/restart.
let sessionDeviceId = null;

export async function ensureDeviceRegistered() {
  let deviceId = safeGet("device_uuid") || sessionDeviceId;
  if (!deviceId) {
    deviceId = generateUUID();
    safeSet("device_uuid", deviceId);
  }
  sessionDeviceId = deviceId;

  const deviceName = safeGet("device_name") || "Display Device";
  
  try {
    // First, try to register device with device_type
    const registerRes = await api("/devices/register", {
      method: "POST",
      body: JSON.stringify({ 
        device_uuid: deviceId,
        device_type: "display",  // REQUIRED: device_type
        name: deviceName, 
        meta: { app: "display-app", version: "1.0" } 
      })
    });
    
    console.log("Display device registration response:", registerRes);
    
    // Registration endpoint already returns assigned status and rooms
    // No need to call /devices/me - use the registration response directly
    if (registerRes.assigned && registerRes.room_id) {
      safeSet("room_id", registerRes.room_id);
      safeSet("roomId", registerRes.room_id);
      return { assigned: true, room_id: registerRes.room_id, device: registerRes.device };
    } else {
      // Device not assigned - use rooms from registration response or fetch them
      const rooms = registerRes.rooms || [];
      if (rooms.length === 0) {
        // If registration didn't return rooms, fetch them
        try {
          console.log("Fetching rooms from /rooms endpoint...");
          const roomsRes = await api("/rooms");
          const fetchedRooms = Array.isArray(roomsRes) ? roomsRes : (roomsRes.data || []);
          console.log(`Successfully fetched ${fetchedRooms.length} rooms`);
          return { assigned: false, rooms: fetchedRooms, device: registerRes.device };
        } catch (error) {
          console.error("Error fetching rooms:", error);
          // Return empty rooms list if fetch fails - user can still enter room ID manually
          return { assigned: false, rooms: [], device: registerRes.device };
        }
      } else {
        console.log(`Using ${rooms.length} rooms from registration response`);
        return { assigned: false, rooms: rooms, device: registerRes.device };
      }
    }
  } catch (error) {
    console.error("Error registering display device:", error);
    // Return empty rooms list on error - user can still select room manually
    return { assigned: false, rooms: [], device: null, error: error.message };
  }
}

