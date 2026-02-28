import React, { useEffect, useState, useRef } from "react";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import NextBanner from "../components/NextBanner";
import { api } from "../api";

/*
  Display app behavior:
  - Polls backend /rooms/{roomId}/status every 2 seconds
  - Gets current_song_id and fetches song details
  - Calculates timer from started_at + total_minutes
  - Shows video when current_song_id is set
  - Shows default background when session ends or no active session
*/

export default function Display({ roomId }) {
  const [currentSong, setCurrentSong] = useState(null); // song object with videoUrl
  const [nextSong, setNextSong] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null); // milliseconds remaining
  const [isActive, setIsActive] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const videoRef = useRef();
  const lastSongIdRef = useRef(null);

  // Enable autoplay on any user interaction (click, touch, keypress)
  useEffect(() => {
    const enableAutoplay = () => {
      sessionStorage.setItem('video_autoplay_enabled', 'true');
      console.log("✅ Autoplay enabled via user interaction");
    };
    
    // Check if already enabled
    if (sessionStorage.getItem('video_autoplay_enabled') === 'true') {
      console.log("✅ Autoplay already enabled from previous session");
    }
    
    // Listen for any user interaction on the page
    const events = ['click', 'touchstart', 'keydown', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, enableAutoplay, { once: true, passive: true });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, enableAutoplay);
      });
    };
  }, []);

  // Poll room session from backend
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;
    let pollInterval;

    const pollRoomStatus = async () => {
      try {
        // Use GET /rooms/{id}/session endpoint (reads from room_sessions)
        const sessionData = await api(`/rooms/${roomId}/session`);
        if (!mounted) return;

        const session = sessionData.session;
        console.log("Display polling session for room:", roomId);
        console.log("Session data:", session);

        // If no session, show idle
        if (!session) {
          setIsActive(false);
          setTimeLeft(null);
          setSessionEnded(true);
          setCurrentSong(null);
          return;
        }

        // Check if session is active (not ended or finished)
        const isSessionEnded = session.status === "ended" || session.status === "finished";
        const active = !isSessionEnded && (session.status === "playing" || session.status === "idle" || session.status === "active");
        setIsActive(active);

        // If session is ended, clear everything
        if (isSessionEnded) {
          setSessionEnded(true);
          setCurrentSong(null);
          setTimeLeft(null);
          setNextSong(null);
          lastSongIdRef.current = null;
          console.log("Display: Session ended, clearing all state");
          return;
        }

        // Get current song ID from session
        const currentSongId = session.current_song_id;

        // Calculate timer from session_start_time + total_minutes
        // Timer only shows when session_start_time exists (first song played)
        if (session.session_start_time && session.total_minutes) {
          try {
            const startedAt = new Date(session.session_start_time);
            const now = new Date();
            const totalSeconds = session.total_minutes * 60;
            const elapsedSeconds = Math.floor((now - startedAt) / 1000);
            const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
            const remainingMs = remainingSeconds * 1000;

            // Show timer (session has started)
            setTimeLeft(remainingMs);

            // Check if session ended
            if (remainingSeconds === 0 || session.status === "finished" || session.status === "ended") {
              setSessionEnded(true);
              setCurrentSong(null); // Clear song when session ends
              setTimeLeft(null);
              setNextSong(null);
              lastSongIdRef.current = null;
            } else {
              setSessionEnded(false);
            }
          } catch (e) {
            console.error("Error calculating timer:", e);
            setTimeLeft(null);
          }
        } else {
          // Session ready but idle - no timer yet (session_start_time is NULL)
          setTimeLeft(null);
          setSessionEnded(false);
          // Don't clear currentSong here - might be waiting for first song
        }

        // Handle current song
        if (currentSongId && currentSongId !== lastSongIdRef.current) {
          // New song started - fetch song details
          lastSongIdRef.current = currentSongId;
          try {
            console.log("🎵 Display: Fetching song details for ID:", currentSongId);
            const songData = await api(`/songs/${currentSongId}`);
            console.log("🎵 Display: Song data fetched:", songData);
            
            // Map file_url to videoUrl for VideoPlayer component
            const videoUrl = songData.file_url || songData.video_url || songData.url;
            if (!videoUrl) {
              console.error("❌ Display: Song has no file_url!", songData);
              setCurrentSong(null);
            } else {
              setCurrentSong({
                ...songData,
                videoUrl: videoUrl
              });
              console.log("✅ Display: New song loaded:", songData.title, "Video URL:", videoUrl);
            }
          } catch (err) {
            console.error("❌ Display: Error fetching song:", err);
            setCurrentSong(null);
          }
        } else if (!currentSongId) {
          // No current song - clear if session is ended or if we had a song before
          if (lastSongIdRef.current) {
            console.log("Display: Song ended, clearing current song");
            setCurrentSong(null);
          }
          lastSongIdRef.current = null;
          if (session.status === "finished" || session.status === "ended" || !session) {
            setCurrentSong(null);
            setNextSong(null);
          }
        }

        // Get next song from queue (from sessionData.queue)
        try {
          const queue = sessionData.queue || [];
          console.log("Display: Queue data:", queue);
          if (queue.length > 0) {
            const nextSongData = queue[0];
            console.log("Display: Next song data:", nextSongData);
            setNextSong({
              title: nextSongData.title || nextSongData.song?.title || "Unknown",
              artist: nextSongData.artist || nextSongData.artist_name || nextSongData.song?.artist || nextSongData.song?.artist_name || ""
            });
          } else {
            console.log("Display: Queue is empty, no next song");
            setNextSong(null);
          }
        } catch (err) {
          console.error("Error getting queue:", err);
          setNextSong(null);
        }

      } catch (error) {
        console.error("Error polling room status:", error);
        if (!mounted) return;
      }
    };

    // Poll immediately and then every 1 second for faster autoplay
    pollRoomStatus();
    pollInterval = setInterval(pollRoomStatus, 1000);

    return () => {
      mounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [roomId]);

  // Update timer every second
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1000) return 0;
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Handle video ended - call backend to mark playback ended and auto-start next song
  const handleVideoEnded = async () => {
    console.log("🎵 Video ended, notifying backend for autoplay");
    try {
      const response = await api(`/rooms/${roomId}/playback/ended`, {
        method: "POST"
      });
      
      console.log("✅ Playback ended response:", response);
      
      // If backend auto-started next song, use it immediately
      if (response && response.status === "next_started") {
        console.log("🎵 Backend auto-started next song:", response.song_id);
        
        // Try to use song data from response first (faster)
        if (response.song && response.song.file_url) {
          const videoUrl = response.song.file_url;
          // Get signed URL for the song
          try {
            const signedUrlResponse = await api(`/songs/${response.song_id}/signed-url`);
            const finalVideoUrl = signedUrlResponse.signed_url || signedUrlResponse.url || videoUrl;
            
            setCurrentSong({
              ...response.song,
              videoUrl: finalVideoUrl
            });
            console.log("✅ Next song loaded immediately from response:", response.song.title);
            return; // Successfully loaded next song
          } catch (urlErr) {
            console.warn("⚠️ Could not get signed URL, using file_url directly:", urlErr);
            // Fallback to file_url if signed URL fails
            setCurrentSong({
              ...response.song,
              videoUrl: videoUrl
            });
            console.log("✅ Next song loaded with file_url:", response.song.title);
            return;
          }
        }
        
        // Fallback: fetch song details if not in response
        if (response.song_id) {
          try {
            const songData = await api(`/songs/${response.song_id}`);
            const videoUrl = songData.file_url || songData.video_url || songData.url;
            if (videoUrl) {
              // Get signed URL
              try {
                const signedUrlResponse = await api(`/songs/${response.song_id}/signed-url`);
                const finalVideoUrl = signedUrlResponse.signed_url || signedUrlResponse.url || videoUrl;
                setCurrentSong({
                  ...songData,
                  videoUrl: finalVideoUrl
                });
              } catch (urlErr) {
                // Use file_url if signed URL fails
                setCurrentSong({
                  ...songData,
                  videoUrl: videoUrl
                });
              }
              console.log("✅ Next song loaded immediately:", songData.title);
              return; // Don't clear current song, we already set the new one
            }
          } catch (err) {
            console.error("❌ Error fetching next song:", err);
          }
        }
      }
      
      // No next song available or fetch failed
      if (response && response.status === "ended") {
        console.log("ℹ️ No more songs in queue");
      }
      
      // Clear current song if no next song or fetch failed
      setCurrentSong(null);
      // Will be updated on next poll (2 seconds) if a new song is added
    } catch (error) {
      console.error("❌ Error notifying playback ended:", error);
      // Don't clear current song on error - let it retry or wait for next poll
    }
  };

  // Format timeLeft ms -> "HH:MM:SS" or "MM:SS"
  const fmt = (ms) => {
    if (ms == null || ms <= 0) return "--:--:--";
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="display-root" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar timeText={fmt(timeLeft)} roomId={roomId} nextSong={nextSong} />

      <div className="display-content" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Center: Video or Default Background - Fullscreen excluding navbar */}
        <div className="display-center" style={{ 
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%"
        }}>
          {currentSong && !sessionEnded ? (
            <VideoPlayer
              ref={videoRef}
              song={currentSong}
              onEnded={handleVideoEnded}
            />
          ) : (
            <div className="logo-fallback-wrapper" style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <img
                src="/logo_norebox.jpg"
                alt="Norebox logo"
                className="logo-fallback"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
