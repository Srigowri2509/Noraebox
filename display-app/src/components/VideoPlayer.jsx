import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/*
  Video player for display-app (karaoke TV screen).
  
  Autoplay strategy:
  1. Start muted (browsers always allow muted autoplay)
  2. Immediately unmute after play starts
  3. If unmuted play is blocked (no user interaction yet),
     keep playing muted and unmute on first click/touch
  4. Once user interacts once, all future videos play with sound automatically
*/
const VideoPlayer = forwardRef(({ song, onEnded, onError }, ref) => {
  const vref = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(true); // React-controlled muted state

  // Track user interaction (once true, stays true for the session)
  const userInteractedRef = useRef(
    sessionStorage.getItem("video_autoplay_enabled") === "true"
  );

  // On first user interaction: unmute + remember
  useEffect(() => {
    const unlock = () => {
      if (userInteractedRef.current) return;
      userInteractedRef.current = true;
      sessionStorage.setItem("video_autoplay_enabled", "true");
      console.log("✅ User interaction detected – autoplay with sound enabled");

      // Unmute the current video immediately
      const video = vref.current;
      if (video && !video.paused) {
        video.muted = false;
        setIsMuted(false);
        console.log("✅ Unmuted playing video after user interaction");
      }
    };

    const events = ["click", "touchstart", "keydown", "pointerdown"];
    events.forEach((e) =>
      document.addEventListener(e, unlock, { once: false, passive: true })
    );
    return () => events.forEach((e) => document.removeEventListener(e, unlock));
  }, []);

  // ── Main playback effect ──
  useEffect(() => {
    if (!song?.videoUrl) {
      setError(null);
      setLoading(false);
      return;
    }

    const video = vref.current;
    if (!video) return;

    setError(null);
    setLoading(true);

    let hasNotifiedError = false;

    /* ---- helpers ---- */
    const tryUnmute = () => {
      if (!video.muted) return; // already unmuted
      try {
        video.muted = false;
        setIsMuted(false);
        console.log("✅ Video unmuted");
      } catch {
        console.log("⚠️ Could not unmute (will retry on user interaction)");
      }
    };

    const onCanPlay = () => {
      setLoading(false);
      console.log("VideoPlayer: canplay");
    };

    const onPlaying = () => {
      setLoading(false);
      console.log("VideoPlayer: playing event – attempting unmute");
      // Once the video is actually playing, try to unmute
      if (userInteractedRef.current) {
        tryUnmute();
      }
    };

    const onError = (e) => {
      const code = video.error?.code;
      const msg = video.error?.message;
      console.error("VideoPlayer error:", { code, msg, src: song.videoUrl });
      setError("Failed to load video");
      setLoading(false);

      if (!hasNotifiedError && onError) {
        hasNotifiedError = true;
      }
      // Notify parent so display can skip to next song
      if (!hasNotifiedError) {
        hasNotifiedError = true;
        // Use the onError callback from props (captured in closure via parent param name collision)
      }
    };

    /* ---- attach listeners ---- */
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);

    /* ---- load & play ---- */
    console.log("VideoPlayer: loading", song.title, song.videoUrl.substring(0, 80));
    video.src = song.videoUrl;
    video.muted = true; // start muted so autoplay always works
    setIsMuted(true);
    video.load();

    const startPlayback = async () => {
      try {
        // Step 1: Play muted (guaranteed by browsers)
        await video.play();
        console.log("VideoPlayer: muted play started ✅");
        setLoading(false);

        // Step 2: If user has interacted, unmute immediately
        if (userInteractedRef.current) {
          try {
            video.muted = false;
            setIsMuted(false);
            console.log("VideoPlayer: unmuted after play ✅");
          } catch {
            console.log("VideoPlayer: unmute failed, will retry");
          }

          // Double-check after a tick (some browsers need this)
          setTimeout(() => {
            if (video.muted && !video.paused && userInteractedRef.current) {
              video.muted = false;
              setIsMuted(false);
              console.log("VideoPlayer: force-unmuted after delay ✅");
            }
          }, 150);
        } else {
          console.log("VideoPlayer: playing muted – waiting for user interaction to unmute");
        }
      } catch (err) {
        console.warn("VideoPlayer: play() rejected:", err.message);
        // canplay listener will retry
      }
    };

    startPlayback();

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
    };
  }, [song]);

  // ── Handle video error via props ──
  const handleVideoError = () => {
    const video = vref.current;
    if (onError) {
      onError({
        title: song?.title,
        videoUrl: song?.videoUrl,
        code: video?.error?.code,
        message: video?.error?.message,
      });
    }
  };

  useImperativeHandle(ref, () => ({
    play: () => vref.current?.play(),
    pause: () => vref.current?.pause(),
  }));

  /* ---- Render states ---- */
  if (!song || !song.videoUrl) {
    return (
      <div className="video-placeholder">
        <div className="poster-text">Waiting for song...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-placeholder">
        <div className="poster-text" style={{ color: "#ff6b6b" }}>
          {error}
          <br />
          <small style={{ fontSize: "14px", marginTop: "8px", display: "block" }}>
            URL: {song.videoUrl.substring(0, 50)}...
          </small>
        </div>
      </div>
    );
  }

  return (
    <div
      className="video-wrapper"
      style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}
    >
      <video
        ref={vref}
        className="video-element"
        onEnded={() => {
          console.log("VideoPlayer: video ended");
          onEnded?.();
        }}
        onError={handleVideoError}
        onClick={() => {
          // User click → mark interaction, unmute, and toggle play/pause
          if (!userInteractedRef.current) {
            userInteractedRef.current = true;
            sessionStorage.setItem("video_autoplay_enabled", "true");
          }
          const video = vref.current;
          if (video) {
            video.muted = false;
            setIsMuted(false);
          }
        }}
        controls
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        playsInline
        autoPlay
        muted={isMuted}
        preload="auto"
        crossOrigin="anonymous"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          pointerEvents: "auto",
          cursor: "default",
          backgroundColor: "black",
        }}
      >
        Your browser does not support the video tag.
      </video>

      {/* Show "click to unmute" hint if video is playing muted */}
      {isMuted && !loading && !error && (
        <div
          onClick={() => {
            userInteractedRef.current = true;
            sessionStorage.setItem("video_autoplay_enabled", "true");
            const video = vref.current;
            if (video) {
              video.muted = false;
              setIsMuted(false);
            }
          }}
          style={{
            position: "absolute",
            bottom: 60,
            right: 20,
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 16,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          🔇 Click anywhere to unmute
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
