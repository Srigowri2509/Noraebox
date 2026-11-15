import { useCallback, useEffect, useMemo, useState } from "react";
import {
  advanceRecommendationSession,
  createInitialRecommendationSession,
} from "../utils/recommendSongs.js";

const storageKeyFor = (roomId) => roomId ? `noraebox:recommendations:${roomId}` : null;

function loadSession(storageKey) {
  if (!storageKey) return createInitialRecommendationSession();
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? { ...createInitialRecommendationSession(), ...JSON.parse(saved) } : createInitialRecommendationSession();
  } catch {
    return createInitialRecommendationSession();
  }
}

export default function useRecommendationSession(roomId) {
  const storageKey = useMemo(() => storageKeyFor(roomId), [roomId]);
  const sessionKey = storageKey || "unassigned-room";
  const loadedSession = useMemo(() => loadSession(storageKey), [storageKey]);
  const [sessions, setSessions] = useState({});
  const session = sessions[sessionKey] || loadedSession;

  useEffect(() => {
    if (!storageKey || !sessions[sessionKey]) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sessions[sessionKey]));
    } catch {
      // Recommendations still work in memory when storage is unavailable.
    }
  }, [sessionKey, sessions, storageKey]);

  const recordSelection = useCallback((song, shownSongs) => {
    setSessions((current) => {
      const base = current[sessionKey] || loadSession(storageKey);
      return {
        ...current,
        [sessionKey]: advanceRecommendationSession(base, song, shownSongs),
      };
    });
  }, [sessionKey, storageKey]);

  return { session, recordSelection };
}
