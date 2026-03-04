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
      console.log("VideoPlayer: No song or videoUrl", { hasSong: !!song, videoUrl: song?.videoUrl });
      setError(null);
      setLoading(false);
      return;
    }

    const video = vref.current;
    console.log("VideoPlayer: Simple effect. Has ref?", !!video, "URL:", song.videoUrl);
    console.log("VideoPlayer: Full song object:", { title: song.title, videoUrl: song.videoUrl, file_url: song.file_url });
    if (!video) {
      // Ref not attached yet; wait for next render
      console.log("VideoPlayer: Video ref not attached yet, waiting...");
      return;
    }

    setError(null);
    setLoading(true);

    const handleCanPlay = () => {
      console.log("VideoPlayer: canplay - video is ready to play");
      setLoading(false);
      
      // If user has interacted, unmute for audio playback
      if (hasUserInteracted && video.muted) {
        video.muted = false;
        console.log("VideoPlayer: Unmuting video (user has interacted)");
      }
      
      // Try to play when ready
      if (video.paused) {
        const playPromise = video.play();
        if (playPromise && playPromise.then) {
          playPromise
            .then(() => {
              console.log("VideoPlayer: Successfully started playing after canplay");
              // Unmute after successful play if user has interacted
              if (hasUserInteracted && video.muted) {
                video.muted = false;
                console.log("VideoPlayer: Unmuting after successful play");
              }
            })
            .catch((err) => {
              console.warn("VideoPlayer: Play failed after canplay:", err);
            });
        }
      }
    };

    const handleCanPlayThrough = () => {
      console.log("VideoPlayer: canplaythrough - video can play through without buffering");
      setLoading(false);
    };

    const handlePlaying = () => {
      console.log("VideoPlayer: playing - video is now playing");
      setLoading(false);
    };

    const handleLoadedData = () => {
      console.log("VideoPlayer: loadeddata - video data loaded");
    };

    const handleError = (e) => {
      console.error("VideoPlayer: Video error (simple):", e);
      console.error("VideoPlayer: simple error details:", {
        code: video.error?.code,
        message: video.error?.message,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.currentSrc || video.src,
        videoUrl: song.videoUrl,
      });
      
      // Log more details about the error
      if (video.error) {
        const errorCode = video.error.code;
        const errorMessages = {
          1: "MEDIA_ERR_ABORTED - The user aborted the video",
          2: "MEDIA_ERR_NETWORK - Network error while loading video",
          3: "MEDIA_ERR_DECODE - Error decoding video",
          4: "MEDIA_ERR_SRC_NOT_SUPPORTED - Video format not supported or source not found"
        };
        console.error(`VideoPlayer: Error code ${errorCode}: ${errorMessages[errorCode] || "Unknown error"}`);
      }
      
      setError("Failed to load video");
      setLoading(false);
    };

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("canplaythrough", handleCanPlayThrough);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("error", handleError);

    try {
      // Set source first
      console.log("VideoPlayer: Setting video src to:", song.videoUrl);
      video.src = song.videoUrl;
      
      // Autoplay: Start muted to satisfy browser policies, but unmute if user has already interacted
      // This allows audio to play automatically after the first user interaction
      video.muted = !hasUserInteracted;
      video.autoplay = true;
      console.log(`VideoPlayer: Starting video ${hasUserInteracted ? 'unmuted' : 'muted'} (hasUserInteracted: ${hasUserInteracted})`);
      video.load();
      
      // Try to play immediately (browser may allow muted autoplay)
      // If it fails, the canplay event handler will retry
      const playPromise = video.play();
      if (playPromise && playPromise.then) {
        playPromise
          .then(() => {
            console.log("VideoPlayer: play() resolved immediately - video should start playing");
            setLoading(false);
            // Unmute after successful play if user has interacted
            if (hasUserInteracted && video.muted) {
              video.muted = false;
              console.log("VideoPlayer: Unmuting after successful immediate play");
            }
          })
          .catch((err) => {
            console.warn("VideoPlayer: play() rejected immediately (will retry on canplay):", err);
            // Don't set loading to false yet - wait for canplay event
          });
      } else {
        console.log("VideoPlayer: play() returned non-promise");
      }
    } catch (e) {
      console.error("VideoPlayer: Exception during simple setup:", e);
      setLoading(false);
    }

    return () => {
      console.log("VideoPlayer: Cleaning up simple listeners");
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("canplaythrough", handleCanPlayThrough);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("loadeddata", handleLoadedData);
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
          // Mark interaction so browser is allowed to autoplay with sound
          if (!hasUserInteracted) {
            setHasUserInteracted(true);
            sessionStorage.setItem("video_autoplay_enabled", "true");
          }
          // Unmute immediately on click
          if (vref.current) {
            vref.current.muted = false;
            console.log("VideoPlayer: Unmuted on user click");
          }
        }}
        controls={true}
        disablePictureInPicture={true}
        controlsList="nodownload nofullscreen noremoteplayback"
        playsInline
        muted={!hasUserInteracted}
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
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

export default VideoPlayer;
