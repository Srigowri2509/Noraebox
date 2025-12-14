import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * useRoomPlayer(roomId)
 * - listens to PLAY broadcast
 * - controls currentSong, timerLeft (seconds), sessionEnded flag
 * - provides start/stop controls (not strictly necessary)
 */
export default function useRoomPlayer(roomId) {
  const [currentSong, setCurrentSong] = useState(null);
  const [timerLeft, setTimerLeft] = useState(null); // seconds
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionEndImage, setSessionEndImage] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const timerRef = useRef(null);

  // start a countdown in seconds
  const startTimer = (seconds) => {
    clearInterval(timerRef.current);
    if (!seconds || seconds <= 0) return;
    setTimerLeft(seconds);
    setSessionEnded(false);

    timerRef.current = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timerRef.current);
          // mark session ended
          setTimerLeft(0);
          setSessionEnded(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    setTimerLeft(null);
  };

  // poll room status for current song and timer
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;
    let pollTimer;

    const poll = async () => {
      try {
        const data = await api(`/rooms/${roomId}/status`);
        if (!mounted) return;

        // Extract current song from room status
        if (data.current_song) {
          const songObj = typeof data.current_song === "object" 
            ? data.current_song 
            : { video_url: data.current_song };
          setCurrentSong(songObj);
          setIsPlaying(true);
        } else if (data.current_song_id) {
          // If only ID is present, fetch song details
          try {
            const songData = await api(`/songs/${data.current_song_id}`);
            setCurrentSong(songData);
            setIsPlaying(true);
          } catch (err) {
            console.error("Error fetching song:", err);
          }
        } else {
          setCurrentSong(null);
          setIsPlaying(false);
        }

        // Handle timer from end_time
        if (data.end_time) {
          const endTime = new Date(data.end_time).getTime();
          const now = Date.now();
          const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
          
          if (remainingSeconds > 0) {
            if (!timerRef.current || timerLeft === null || timerLeft === 0) {
              startTimer(remainingSeconds);
            }
          } else if (data.is_active === false) {
            setSessionEnded(true);
            setTimerLeft(0);
            stopTimer();
          }
        }

        // Handle session end image
        if (data.session_end_image) {
          setSessionEndImage(data.session_end_image);
        }
      } catch (err) {
        console.error("polling error:", err);
      }
    };

    poll();
    pollTimer = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(pollTimer);
      clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // helpers for external control
  const markVideoEnded = () => {
    setIsPlaying(false);
    // if sessionEnded is true, caller should display session end image — handled by component
  };

  return {
    currentSong,
    setCurrentSong,
    isPlaying,
    setIsPlaying,
    timerLeft,
    sessionEnded,
    sessionEndImage,
    startTimer,
    stopTimer,
    markVideoEnded
  };
}
