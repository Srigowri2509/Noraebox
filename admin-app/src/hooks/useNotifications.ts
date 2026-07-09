import { useCallback, useEffect, useRef } from "react";
import {
  notifySessionFinished,
  requestPermission,
} from "../services/notificationService";
import { SessionFinishedEvent } from "../services/websocketService";

const NOTIFIED_SESSION_IDS_KEY = "noraebox.notifiedSessionIds";

function loadNotifiedSessionIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(NOTIFIED_SESSION_IDS_KEY);
    const values = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(values);
  } catch {
    return new Set();
  }
}

function saveNotifiedSessionIds(sessionIds: Set<string>): void {
  try {
    window.localStorage.setItem(
      NOTIFIED_SESSION_IDS_KEY,
      JSON.stringify(Array.from(sessionIds).slice(-500))
    );
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}

export function useNotifications(
  onSessionFinished: (event: SessionFinishedEvent) => void
): {
  handleSessionFinished: (event: SessionFinishedEvent) => void;
  acknowledgeSessionNotification: (sessionId: string) => void;
} {
  const notifiedSessionIdsRef = useRef<Set<string>>(loadNotifiedSessionIds());

  useEffect(() => {
    requestPermission().catch((error) => {
      console.warn("Notification permission request failed.", error);
    });
  }, []);

  const handleSessionFinished = useCallback(
    (event: SessionFinishedEvent) => {
      onSessionFinished(event);

      if (notifiedSessionIdsRef.current.has(event.sessionId)) {
        return;
      }

      notifiedSessionIdsRef.current.add(event.sessionId);
      saveNotifiedSessionIds(notifiedSessionIdsRef.current);
      notifySessionFinished(event).catch((error) => {
        console.warn("Session finished notification failed.", error);
      });
    },
    [onSessionFinished]
  );

  const acknowledgeSessionNotification = useCallback((sessionId: string) => {
    notifiedSessionIdsRef.current.add(sessionId);
    saveNotifiedSessionIds(notifiedSessionIdsRef.current);
  }, []);

  return {
    handleSessionFinished,
    acknowledgeSessionNotification,
  };
}
