import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const KNOWN_GOOD_TEST_URL = "https://www.w3schools.com/html/mov_bbb.mp4";

/*
  Video player for display-app (karaoke TV screen).
  
  Autoplay strategy:
  1. Start muted (browsers always allow muted autoplay)
  2. ALWAYS try to unmute immediately after play starts (aggressive)
  3. If unmute succeeds → great, video plays with sound
  4. If browser blocks unmute → show "click to unmute" overlay
  5. On first click/touch → unmute and remember for all future videos
*/
const VideoPlayer = forwardRef(({ song, onEnded, onError }, ref) => {
  const vref = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(true); // React-controlled muted state
  const [activeVideoUrl, setActiveVideoUrl] = useState("");
  const [usedCodecFallback, setUsedCodecFallback] = useState(false);

  // Track user interaction (once true, stays true for the session)
  const userInteractedRef = useRef(
    sessionStorage.getItem("video_autoplay_enabled") === "true"
  );

  // On any user interaction: unmute + remember
  useEffect(() => {
    const unlock = () => {
      userInteractedRef.current = true;
      sessionStorage.setItem("video_autoplay_enabled", "true");

      // Unmute the current video immediately on any click/touch
      const video = vref.current;
      if (video) {
        video.muted = false;
        setIsMuted(false);
        // If video was paused due to autoplay failure, try playing
        if (video.paused && video.src) {
          video.play().catch(() => {});
        }
        console.log("✅ Unmuted video after user interaction");
      }
    };

    const events = ["click", "touchstart", "keydown", "pointerdown"];
    events.forEach((e) =>
      document.addEventListener(e, unlock, { passive: true })
    );
    return () => events.forEach((e) => document.removeEventListener(e, unlock));
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const video = vref.current;
      if (!video) return;

      const code = event.code || event.key || "";
      const keyCode = event.keyCode;
      const isToggle =
        code === "MediaPlayPause" ||
        code === "Space" ||
        code === "Enter" ||
        keyCode === 415 ||
        keyCode === 19 ||
        keyCode === 179;

      const isPause = code === "MediaPause" || keyCode === 413;
      const isPlay = code === "MediaPlay" || keyCode === 415;

      if (!(isToggle || isPause || isPlay)) return;
      event.preventDefault();

      userInteractedRef.current = true;
      sessionStorage.setItem("video_autoplay_enabled", "true");
      video.muted = false;
      setIsMuted(false);

      if (isPause) {
        video.pause();
        return;
      }
      if (isPlay) {
        video.play().catch(() => {});
        return;
      }
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (song && song.videoUrl) {
      setActiveVideoUrl(song.videoUrl);
      setUsedCodecFallback(false);
      setError(null);
    } else {
      setActiveVideoUrl("");
      setUsedCodecFallback(false);
      setError(null);
    }
  }, [song]);

  // ── Main playback effect ──
  useEffect(() => {
    if (!activeVideoUrl) {
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
      video.muted = false;
      // Check if browser actually allowed the unmute
      if (!video.muted) {
        setIsMuted(false);
        userInteractedRef.current = true;
        sessionStorage.setItem("video_autoplay_enabled", "true");
        console.log("✅ Video unmuted successfully");
      } else {
        console.log("⚠️ Browser blocked unmute – overlay will appear");
      }
    };

    const onCanPlay = () => {
      setLoading(false);
      console.log("VideoPlayer: canplay – trying unmute");
      tryUnmute();
    };

    const onPlaying = () => {
      setLoading(false);
      console.log("VideoPlayer: playing event – trying unmute");
      tryUnmute();
    };

    const onErrorHandler = (e) => {
      const code = video && video.error && video.error.code;
      const msg = video && video.error && video.error.message;
      console.error("VideoPlayer error:", { code, msg, src: activeVideoUrl });
      setLoading(false);

      if (!usedCodecFallback && activeVideoUrl !== KNOWN_GOOD_TEST_URL) {
        console.warn("VideoPlayer: primary URL failed, trying codec test URL");
        setUsedCodecFallback(true);
        setError("Primary video failed. Testing fallback video...");
        setActiveVideoUrl(KNOWN_GOOD_TEST_URL);
        return;
      }

      setError("Failed to load video");
      if (!hasNotifiedError && onError) {
        hasNotifiedError = true;
        onError({
          title: song && song.title,
          videoUrl: song && song.videoUrl,
          code,
          message: msg,
        });
      }
    };

    /* ---- attach listeners ---- */
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onErrorHandler);

    /* ---- load & play ---- */
    console.log("VideoPlayer: loading", song.title, activeVideoUrl.substring(0, 80));
    video.src = activeVideoUrl;
    video.muted = true; // start muted so autoplay always works
    setIsMuted(true);
    video.load();

    const startPlayback = async () => {
      try {
        // Step 1: Play muted (guaranteed by all browsers)
        await video.play();
        console.log("VideoPlayer: muted play started ✅");
        setLoading(false);

        // Step 2: ALWAYS try to unmute immediately
        video.muted = false;
        if (!video.muted) {
          // Browser allowed unmuted playback!
          setIsMuted(false);
          userInteractedRef.current = true;
          sessionStorage.setItem("video_autoplay_enabled", "true");
          console.log("VideoPlayer: auto-unmuted ✅ (browser allowed it)");
        } else {
          console.log("VideoPlayer: browser kept muted – showing overlay");
          // Retry once more after a brief delay
          setTimeout(() => {
            if (video.muted && !video.paused) {
              video.muted = false;
              if (!video.muted) {
                setIsMuted(false);
                console.log("VideoPlayer: delayed auto-unmute succeeded ✅");
              }
            }
          }, 200);
        }
      } catch (err) {
        console.warn("VideoPlayer: muted play() rejected:", err.message);
        // Try unmuted play directly (some browsers prefer this)
        try {
          video.muted = false;
          setIsMuted(false);
          await video.play();
          console.log("VideoPlayer: unmuted play succeeded ✅");
        } catch {
          // Last resort: play muted
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {});
          console.log("VideoPlayer: fell back to muted play");
        }
      }
    };

    startPlayback();

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onErrorHandler);
    };
  }, [song, activeVideoUrl, usedCodecFallback]);

  useImperativeHandle(ref, () => ({
    play: () => {
      if (vref.current) vref.current.play();
    },
    pause: () => {
      if (vref.current) vref.current.pause();
    },
  }));

  /* ---- Render states ---- */
  if (!song || !song.videoUrl) {
    return (
      <div className="video-placeholder">
        <img
          src="/logo_norebox.jpg"
          alt="Norebox logo"
          className="logo-fallback"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="video-placeholder"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000",
        }}
      >
        <img
          src="/logo_norebox.jpg"
          alt="Norebox logo"
          className="logo-fallback"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
        <div
          className="poster-text"
          style={{
            position: "absolute",
            top: 80,
            left: 20,
            color: "#ff6b6b",
            background: "rgba(0,0,0,0.5)",
            padding: "8px 12px",
            borderRadius: 8,
          }}
        >
          {error}
          {usedCodecFallback && (
            <small style={{ fontSize: "13px", marginLeft: 8, color: "#fcd34d" }}>
              (Fallback URL: mov_bbb.mp4)
            </small>
          )}
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
          if (onEnded) onEnded();
        }}
        onError={() => {
          const video = vref.current;
          if (onError) {
            onError({
              title: song && song.title,
              videoUrl: song && song.videoUrl,
              code: video && video.error && video.error.code,
              message: video && video.error && video.error.message,
            });
          }
        }}
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
