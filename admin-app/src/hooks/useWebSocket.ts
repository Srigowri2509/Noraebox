import { useEffect } from "react";
import {
  AdminWebSocketEvent,
  AdminWebSocketListener,
  websocketService,
} from "../services/websocketService";

export function useWebSocket(onEvent: AdminWebSocketListener): void {
  useEffect(() => {
    const unsubscribe = websocketService.subscribe((event: AdminWebSocketEvent) => {
      onEvent(event);
    });

    return unsubscribe;
  }, [onEvent]);
}
