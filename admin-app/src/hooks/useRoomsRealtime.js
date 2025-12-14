import { useEffect } from "react";
import { api } from "../api";

export default function useRoomsRealtime(callback) {
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const data = await api("/rooms");
        callback(data.data || data);
      } catch (err) {
        console.error("Error fetching rooms:", err);
      }
    };
    
    fetchRooms();
    const id = setInterval(fetchRooms, 2000);
    return () => clearInterval(id);
  }, [callback]);
}
