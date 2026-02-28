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

  useEffect(() => {
    if (song && song.videoUrl && vref.current) {
      console.log("VideoPlayer: Loading video:", song.videoUrl);
      setError(null);
      setLoading(true);
      
      const video = vref.current;
      
      // Set up error handlers
      const handleError = (e) => {
        console.error("VideoPlayer: Video error:", e);
        console.error("VideoPlayer: Error details:", {
          code: video.error?.code,
          message: video.error?.message,
          networkState: video.networkState,
          readyState: video.readyState
        });
        setError("Failed to load video");
        setLoading(false);
      };
      
      const handleCanPlay = () => {
        console.log("VideoPlayer: Video can play");
        setLoading(false);
      };
      
      const handleLoadedData = () => {
        console.log("VideoPlayer: Video data loaded");
      };
      
      // Wait for video to be ready before playing to avoid interruption
      const handleCanPlayThrough = () => {
        console.log("VideoPlayer: Video can play through");
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
        const playPromise = video.play();
        if (playPromise && playPromise.then) {
          playPromise
            .then(() => {
              console.log("✅ VideoPlayer: Video playing successfully (muted)");
              setLoading(false);
              // Unmute after a short delay to ensure playback started
              setTimeout(() => {
                if (video && !video.paused) {
                  try {
                    video.muted = false;
                    console.log("✅ VideoPlayer: Video unmuted");
                  } catch (e) {
                    console.warn("VideoPlayer: Could not unmute:", e);
                  }
                }
              }, 800);
            })
            .catch((err) => {
              console.warn("⚠️ VideoPlayer: Muted autoplay blocked:", err);
              // If muted autoplay fails, try again after a brief delay
              setTimeout(() => {
                if (video && hasUserInteracted) {
                  video.muted = false;
                  video.play().catch(e => {
                    console.error("VideoPlayer: Play failed even with interaction:", e);
                    setError("Playback failed");
                    setLoading(false);
                  });
                } else {
                  // Still try muted play
                  video.muted = true;
                  video.play().then(() => {
                    setLoading(false);
                    setTimeout(() => {
                      if (video && !video.paused) {
                        video.muted = false;
                      }
                    }, 800);
                  }).catch(e => {
                    console.error("VideoPlayer: All autoplay attempts failed:", e);
                    setLoading(false);
                  });
                }
              }, 100);
            });
        }
      };
      
      video.addEventListener('error', handleError);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('canplaythrough', handleCanPlayThrough);
      
      // Load and play video
      // Always start muted to bypass autoplay restrictions
      try {
        console.log("VideoPlayer: Setting up video element");
        video.muted = true; // Start muted - browsers allow muted autoplay
        video.load();
        console.log("VideoPlayer: Video load() called");
      } catch (e) {
        console.error("VideoPlayer: Exception during setup:", e);
        setLoading(false);
      }
      
      return () => {
        console.log("VideoPlayer: Cleaning up event listeners");
        video.removeEventListener('error', handleError);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
      };
    } else if (!song || !song.videoUrl) {
      setError(null);
      setLoading(false);
    }
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
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          zIndex: 10,
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '20px',
          borderRadius: '8px'
        }}>
          Loading video...
        </div>
      )}
      <video
        ref={vref}
        className="video-element"
        onEnded={() => {
          console.log("VideoPlayer: Video ended");
          onEnded && onEnded();
        }}
        onClick={() => {
          // Enable autoplay on click if not already enabled
          if (!hasUserInteracted) {
            setHasUserInteracted(true);
            sessionStorage.setItem('video_autoplay_enabled', 'true');
            if (vref.current && !vref.current.paused) {
              vref.current.muted = false;
            }
          }
        }}
        controls={false}
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
        <source src={song.videoUrl} type="video/mp4" />
        <source src={song.videoUrl} type="video/webm" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

export default VideoPlayer;
