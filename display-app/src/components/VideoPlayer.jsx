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
    // Also check if we're in a kiosk/display mode where autoplay should be enabled
    const stored = sessionStorage.getItem('video_autoplay_enabled') === 'true';
    // For display apps, assume autoplay is allowed (user will interact eventually)
    // This allows videos to start playing immediately
    return stored || true; // Default to true for display app
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
    const events = ['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'];
    events.forEach(event => {
      document.addEventListener(event, enableAutoplay, { once: true, passive: true });
    });
    
    // Also try to enable autoplay immediately on page load for display apps
    // This helps with automatic playback
    if (!hasUserInteracted) {
      // Try to enable autoplay by simulating a user gesture
      // Some browsers allow this for display/kiosk apps
      try {
        // Create a temporary audio context to "unlock" audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
            console.log("✅ Audio context resumed - autoplay enabled");
            setHasUserInteracted(true);
            sessionStorage.setItem('video_autoplay_enabled', 'true');
          });
        } else {
          setHasUserInteracted(true);
          sessionStorage.setItem('video_autoplay_enabled', 'true');
        }
      } catch (e) {
        console.log("Note: Audio context not available, will wait for user interaction");
      }
    }
    
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
      
      // Automatically unmute if user has interacted before
      if (hasUserInteracted && video.muted) {
        video.muted = false;
        console.log("VideoPlayer: Unmuting video for auto-play (user has interacted)");
      }
      
      // Always try to play when ready (auto-play when song starts)
      if (video.paused) {
        // Try playing unmuted first if user has interacted
        if (hasUserInteracted && video.muted) {
          video.muted = false;
        }
        
        const playPromise = video.play();
        if (playPromise && playPromise.then) {
          playPromise
            .then(() => {
              console.log("VideoPlayer: Successfully started playing after canplay");
              // Ensure unmuted after successful play if user has interacted
              if (hasUserInteracted && video.muted) {
                video.muted = false;
                console.log("VideoPlayer: Unmuting after successful play");
              }
              
              // Double-check unmute after a brief delay
              setTimeout(() => {
                if (hasUserInteracted && video.muted && !video.paused) {
                  video.muted = false;
                  console.log("VideoPlayer: Force unmuting after canplay delay");
                }
              }, 200);
            })
            .catch((err) => {
              console.warn("VideoPlayer: Play failed after canplay:", err);
              // If unmuted play failed, try muted
              if (!video.muted && err.name === 'NotAllowedError') {
                video.muted = true;
                video.play().catch(() => {
                  console.warn("VideoPlayer: Muted play also failed");
                });
              }
            });
        }
      } else {
        // Video is already playing, but ensure it's unmuted if user has interacted
        if (hasUserInteracted && video.muted) {
          video.muted = false;
          console.log("VideoPlayer: Unmuting already playing video");
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
      // Ensure audio is unmuted when playing if user has interacted
      if (hasUserInteracted && video.muted) {
        video.muted = false;
        console.log("VideoPlayer: Unmuting on playing event");
      }
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
      
      // For display apps, try to play with audio immediately
      // Start unmuted if user has interacted, otherwise start muted but unmute as soon as possible
      video.muted = !hasUserInteracted;
      video.autoplay = true;
      video.playsInline = true;
      console.log(`VideoPlayer: Starting video ${hasUserInteracted ? 'unmuted' : 'muted'} (hasUserInteracted: ${hasUserInteracted})`);
      video.load();
      
      // Try to play immediately when song starts - try unmuted first if possible
      const tryPlay = async () => {
        try {
          // First attempt: try playing unmuted if user has interacted
          if (hasUserInteracted && video.muted) {
            video.muted = false;
          }
          
          const playPromise = video.play();
          if (playPromise && playPromise.then) {
            await playPromise;
            console.log("VideoPlayer: play() resolved immediately - video should start playing");
            setLoading(false);
            
            // Ensure unmuted after successful play
            if (hasUserInteracted && video.muted) {
              video.muted = false;
              console.log("VideoPlayer: Auto-unmuting after successful immediate play");
            }
            
            // If still muted, try to unmute after a short delay (some browsers allow this)
            if (video.muted) {
              setTimeout(() => {
                if (hasUserInteracted && video.muted) {
                  video.muted = false;
                  console.log("VideoPlayer: Unmuting after delay");
                }
              }, 100);
            }
          } else {
            setLoading(false);
          }
        } catch (err) {
          console.warn("VideoPlayer: play() rejected immediately (will retry on canplay):", err);
          // If unmuted play failed, try muted play as fallback
          if (!video.muted && err.name === 'NotAllowedError') {
            console.log("VideoPlayer: Trying muted play as fallback");
            video.muted = true;
            try {
              await video.play();
              console.log("VideoPlayer: Muted play succeeded, will unmute on canplay");
            } catch (mutedErr) {
              console.warn("VideoPlayer: Muted play also failed:", mutedErr);
            }
          }
          // Don't set loading to false yet - wait for canplay event
        }
      };
      
      // Try playing immediately
      tryPlay();
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
  }, [song, hasUserInteracted]);

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
        autoPlay
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
