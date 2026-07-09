import { API_BASE } from "../api";

export type SessionFinishedEvent = {
  type: "session_finished";
  sessionId: string;
  roomId: string;
  roomName: string;
  finishedAt: string;
};

export type AdminWebSocketEvent = SessionFinishedEvent;
export type AdminWebSocketListener = (event: AdminWebSocketEvent) => void;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

function getWebSocketUrl(): string {
  const apiUrl = new URL(API_BASE);
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = "/ws/admin";
  apiUrl.search = "";
  return apiUrl.toString();
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private listeners = new Set<AdminWebSocketListener>();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;

  connect(): void {
    this.shouldReconnect = true;

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.socket = new WebSocket(getWebSocketUrl());

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as AdminWebSocketEvent;
        this.listeners.forEach((listener) => listener(event));
      } catch (error) {
        console.warn("Ignoring invalid admin WebSocket event.", error);
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.socket?.close();
    this.socket = null;
  }

  subscribe(listener: AdminWebSocketListener): () => void {
    this.listeners.add(listener);
    this.connect();

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts
    );
    this.reconnectAttempts += 1;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const websocketService = new WebSocketService();
