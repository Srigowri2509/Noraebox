import { api } from "../api";

// Simple UUID v4 generator (fallback if uuid package not available)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function ensureDeviceRegistered() {
  let deviceId = localStorage.getItem("device_uuid");
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem("device_uuid", deviceId);
  }

  const deviceName = localStorage.getItem("device_name") || null;
  
  // First, try to register device with device_type
  try {
    const registerRes = await api("/devices/register", {
      method: "POST",
      body: JSON.stringify({ 
        device_uuid: deviceId,
        device_type: "tablet",  // REQUIRED: device_type
        name: deviceName, 
        meta: { app: "tablet-app", version: "1.0" } 
      })
    });
    
    console.log("Device registration response:", registerRes);
    
    // Registration endpoint already returns assigned status and rooms
    // No need to call /devices/me - use the registration response directly
    if (registerRes.assigned && registerRes.room_id) {
      localStorage.setItem("room_id", registerRes.room_id);
      localStorage.setItem("roomId", registerRes.room_id);
      return { assigned: true, room_id: registerRes.room_id, device: registerRes.device };
    } else {
      // Device not assigned - use rooms from registration response or fetch them
      const rooms = registerRes.rooms || [];
      if (rooms.length === 0) {
        // If registration didn't return rooms, fetch them
        try {
          console.log("Fetching rooms from /rooms endpoint...");
          const roomsRes = await api("/rooms");
          console.log("Rooms response:", roomsRes);
          const fetchedRooms = Array.isArray(roomsRes) ? roomsRes : (roomsRes.data || []);
          console.log(`Successfully fetched ${fetchedRooms.length} rooms`);
          return { assigned: false, rooms: fetchedRooms, device: registerRes.device };
        } catch (error) {
          console.error("Error fetching rooms:", error);
          console.error("Error details:", error.message, error.stack);
          // Return empty rooms list if fetch fails - user can still enter room ID manually
          return { assigned: false, rooms: [], device: registerRes.device };
        }
      } else {
        console.log(`Using ${rooms.length} rooms from registration response`);
        return { assigned: false, rooms: rooms, device: registerRes.device };
      }
    }
  } catch (error) {
    console.error("Error in device registration:", error);
    throw error;
  }
}

