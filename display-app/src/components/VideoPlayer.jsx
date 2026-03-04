import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/*
  Very simple video player wrapper.
  - if song && song.videoUrl => plays it
  - else shows a poster/placeholder
  - forwards `play`, `pause` if needed
  - Handles autoplay restrictions by starting muted
*/
const VideoPlayer = forwardRef(({ song, onEnded }, ref) => {
  const vref = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Track if we've had user interaction globally (persists across songs)
  const [hasUserInteracted, setHasUserInteracted] = useState(() => {
    // Check if user has interacted before (stored in sessionStorage)
    return sessionStorage.getItem('video_autoplay_enabled') === 'true';
  });

  // Enable autoplay on any user interaction with the page
  useEffect(() => {
    const enableAutoplay = () => {
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
        sessionStorage.setItem('video_autoplay_enabled', 'true');
        console.log("✅ Autoplay enabled for session");
      }
    };
    
    // Listen for any user interaction
    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, enableAutoplay, { once: true });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, enableAutoplay);
      });
    };
  }, [hasUserInteracted]);

  // Simplified playback: load and play the given URL, rely on browser controls/autoplay.
  useEffect(() => {
    if (!song || !song.videoUrl) {
      setError(null);
      setLoading(false);
      return;
    }

    const video = vref.current;
    console.log("VideoPlayer: Simple effect. Has ref?", !!video, "URL:", song.videoUrl);
    if (!video) {
      // Ref not attached yet; wait for next render
      return;
    }

    setError(null);
    setLoading(true);

    const handleCanPlay = () => {
      console.log("VideoPlayer: canplay");
      setLoading(false);
    };

    const handlePlaying = () => {
      console.log("VideoPlayer: playing");
      setLoading(false);
    };

    const handleError = (e) => {
      console.error("VideoPlayer: Video error (simple):", e);
      console.error("VideoPlayer: simple error details:", {
        code: video.error?.code,
        message: video.error?.message,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.currentSrc || video.src,
      });
      setError("Failed to load video");
      setLoading(false);
    };

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);

    try {
      // Autoplay muted to satisfy browser policies
      video.muted = true;
      video.autoplay = true;
      console.log("VideoPlayer: Calling load() and play()");
      video.load();
      const playPromise = video.play();
      if (playPromise && playPromise.then) {
        playPromise
          .then(() => {
            console.log("VideoPlayer: play() resolved");
            setLoading(false);
          })
          .catch((err) => {
            console.warn("VideoPlayer: play() rejected:", err);
            setLoading(false);
          });
      }
    } catch (e) {
      console.error("VideoPlayer: Exception during simple setup:", e);
      setLoading(false);
    }

    return () => {
      console.log("VideoPlayer: Cleaning up simple listeners");
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
    };
  }, [song]);

  useImperativeHandle(ref, () => ({
    play: () => {
      if (vref.current) {
        return vref.current.play();
      }
    },
    pause: () => {
      if (vref.current) {
        vref.current.pause();
      }
    },
  }));

  if (!song || !song.videoUrl) {
    // placeholder (empty stage)
    return (
      <div className="video-placeholder">
        <div className="poster-text">Waiting for song...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-placeholder">
        <div className="poster-text" style={{ color: '#ff6b6b' }}>
          {error}
          <br />
          <small style={{ fontSize: '14px', marginTop: '8px', display: 'block' }}>
            URL: {song.videoUrl.substring(0, 50)}...
          </small>
        </div>
      </div>
    );
  }


  console.log("VideoPlayer: Rendering with song:", song ? { title: song.title, videoUrl: song.videoUrl?.substring(0, 50) + '...' } : null);
  console.log("VideoPlayer: Loading state:", loading);
  console.log("VideoPlayer: Error state:", error);
  
  return (
    <div className="video-wrapper" style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1 }}>
      {/* No explicit loading overlay - while loading, the default page is visible behind */}
      <video
        ref={vref}
        className="video-element"
        onEnded={() => {
          console.log("VideoPlayer: Video ended");
          onEnded && onEnded();
        }}
        onClick={() => {
          // Mark interaction so browser is allowed to autoplay with sound later
          if (!hasUserInteracted) {
            setHasUserInteracted(true);
            sessionStorage.setItem("video_autoplay_enabled", "true");
          }
        }}
        controls={true}
        disablePictureInPicture={true}
        controlsList="nodownload nofullscreen noremoteplayback"
        playsInline
        autoPlay
        muted={true}
        preload="auto"
        crossOrigin="anonymous"
        style={{ 
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          pointerEvents: 'auto', 
          cursor: 'default',
          backgroundColor: 'black'
        }}
        src={song.videoUrl}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

export default VideoPlayer;
