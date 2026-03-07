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
      
      // Always try to unmute for display apps
      if (video.muted) {
        video.muted = false;
        console.log("VideoPlayer: Unmuting video on canplay");
      }
      
      // Always try to play when ready (auto-play when song starts)
      if (video.paused) {
        // Ensure unmuted before playing
        if (video.muted) {
          video.muted = false;
        }
        
        const playPromise = video.play();
        if (playPromise && playPromise.then) {
          playPromise
            .then(() => {
              console.log("VideoPlayer: Successfully started playing after canplay");
              // Ensure unmuted after successful play
              if (video.muted) {
                video.muted = false;
                console.log("VideoPlayer: Unmuting after successful play");
              }
              
              // Double-check unmute after a brief delay
              setTimeout(() => {
                if (video.muted && !video.paused) {
                  video.muted = false;
                  console.log("VideoPlayer: Force unmuting after canplay delay");
                }
              }, 200);
            })
            .catch((err) => {
              console.warn("VideoPlayer: Play failed after canplay:", err);
              // If unmuted play failed, try muted as fallback
              if (!video.muted && err.name === 'NotAllowedError') {
                console.log("VideoPlayer: Trying muted play as fallback");
                video.muted = true;
                video.play()
                  .then(() => {
                    console.log("VideoPlayer: Muted play succeeded, will unmute");
                    // Try to unmute after muted play succeeds
                    setTimeout(() => {
                      video.muted = false;
                    }, 100);
                  })
                  .catch(() => {
                    console.warn("VideoPlayer: Muted play also failed");
                  });
              }
            });
        }
      } else {
        // Video is already playing, ensure it's unmuted
        if (video.muted) {
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
      // Always ensure audio is unmuted when playing (for display apps)
      if (video.muted) {
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
      
      // For display apps: Always start muted to ensure autoplay works
      // Browsers allow muted autoplay, then we'll unmute immediately after play starts
      video.muted = true; // Start muted to guarantee autoplay
      video.autoplay = true;
      video.playsInline = true;
      console.log(`VideoPlayer: Starting video muted for guaranteed autoplay (will unmute after play starts)`);
      video.load();
      
      // Try to play immediately - start muted, then unmute
      const tryPlay = async () => {
        try {
          // Play muted first (browsers always allow this)
          const playPromise = video.play();
          if (playPromise && playPromise.then) {
            await playPromise;
            console.log("VideoPlayer: play() resolved - video started playing (muted)");
            setLoading(false);
            
            // Immediately try to unmute after play starts
            // For display apps, we assume autoplay is allowed
            try {
              video.muted = false;
              console.log("VideoPlayer: Unmuted immediately after play started");
              
              // Double-check unmute after a brief delay
              setTimeout(() => {
                if (video.muted) {
                  video.muted = false;
                  console.log("VideoPlayer: Force unmuted after delay");
                }
              }, 100);
            } catch (unmuteErr) {
              console.warn("VideoPlayer: Could not unmute immediately:", unmuteErr);
              // Will retry on canplay/playing events
            }
          } else {
            setLoading(false);
          }
        } catch (err) {
          console.warn("VideoPlayer: play() rejected immediately (will retry on canplay):", err);
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
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

export default VideoPlayer;
