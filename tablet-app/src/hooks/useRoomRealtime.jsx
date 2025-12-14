import { useEffect } from "react";

// Replaced with polling - this hook is kept for compatibility but does nothing
export default function useRoomsRealtime(onChange) {
  useEffect(() => {
    // Polling is handled in components that need realtime updates
    // This hook is deprecated but kept for compatibility
  }, [onChange]);
}
