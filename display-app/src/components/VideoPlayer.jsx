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

  // Aggressive periodic check to ensure video keeps playing (prevents getting stuck)
  useEffect(() => {
    if (!song || !song.videoUrl || !vref.current) return;
    
    const video = vref.current;
    let lastPlayTime = video.currentTime;
    let stuckCount = 0;
    
    const playCheckInterval = setInterval(() => {
      if (!video) return;
      
      // Check if video should be playing but is paused (and not ended)
      if (!video.ended && video.paused && video.readyState >= 2) {
        const timeRemaining = video.duration - video.currentTime;
        // Only auto-resume if there's significant time left (more than 1 second)
        if (timeRemaining > 1) {
          console.log("VideoPlayer: Auto-resuming paused video (periodic check)");
          video.play().catch(err => {
            console.error("VideoPlayer: Failed to auto-resume:", err);
          });
        }
      }
      
      // Check if video is stuck (not progressing even though it's playing)
      if (!video.paused && !video.ended && video.readyState >= 2) {
        const currentTime = video.currentTime;
        // If time hasn't changed in 3 seconds, video is stuck
        if (Math.abs(currentTime - lastPlayTime) < 0.1) {
          stuckCount++;
          if (stuckCount >= 3) { // Stuck for 3+ checks (3+ seconds)
            console.warn("⚠️ VideoPlayer: Video appears stuck, attempting to resume...");
            const savedTime = currentTime;
            video.pause();
            setTimeout(() => {
              if (video && !video.ended) {
                video.currentTime = savedTime;
                video.play().catch(err => {
                  console.error("VideoPlayer: Failed to resume stuck video:", err);
                });
              }
            }, 100);
            stuckCount = 0;
          }
        } else {
          stuckCount = 0; // Reset if video is progressing
        }
        lastPlayTime = currentTime;
      } else {
        stuckCount = 0; // Reset if paused or ended
      }
    }, 1000); // Check every 1 second (more frequent)
    
    return () => clearInterval(playCheckInterval);
  }, [song]);
  
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
      
      // Handle unexpected pauses - auto-resume if video stops unexpectedly
      const handlePause = () => {
        // Only auto-resume if pause wasn't intentional (e.g., not at end)
        if (video && !video.ended && video.currentTime > 0 && video.duration > 0) {
          const timeRemaining = video.duration - video.currentTime;
          // If there's more than 1 second left, it's an unexpected pause
          if (timeRemaining > 1) {
            console.warn("⚠️ VideoPlayer: Unexpected pause detected, resuming...");
            setTimeout(() => {
              if (video && video.paused && !video.ended) {
                video.play().catch(err => {
                  console.error("VideoPlayer: Failed to resume after pause:", err);
                });
              }
            }, 100);
          }
        }
      };
      
      // Handle buffering/stalled - aggressively resume when ready
      const handleWaiting = () => {
        console.log("VideoPlayer: Video waiting/buffering...");
        // Set up a timeout to force resume if buffering takes too long
        const bufferingTimeout = setTimeout(() => {
          if (video && video.readyState >= 2 && !video.ended) {
            console.log("VideoPlayer: Buffering timeout, attempting to resume...");
            video.play().catch(err => {
              console.error("VideoPlayer: Failed to resume after buffering timeout:", err);
            });
          }
        }, 5000); // Force resume after 5 seconds of buffering
        
        // Clean up timeout when video starts playing again
        const handleResumeAfterWait = () => {
          clearTimeout(bufferingTimeout);
          video.removeEventListener('playing', handleResumeAfterWait);
          video.removeEventListener('canplay', handleResumeAfterWait);
        };
        video.addEventListener('playing', handleResumeAfterWait, { once: true });
        video.addEventListener('canplay', handleResumeAfterWait, { once: true });
      };
      
      const handlePlaying = () => {
        console.log("VideoPlayer: Video is playing");
        setLoading(false);
      };
      
      // Handle when video can continue playing after buffering/stalling
      const handleCanPlayAfterStall = () => {
        console.log("VideoPlayer: Video stalled, attempting to resume...");
        if (video && !video.ended) {
          // More aggressive resume - try multiple times
          const attemptResume = (attempt = 1) => {
            if (video && !video.ended && video.readyState >= 2) {
              if (video.paused) {
                video.play()
                  .then(() => {
                    console.log("✅ VideoPlayer: Successfully resumed after stalling");
                  })
                  .catch(err => {
                    console.error(`VideoPlayer: Resume attempt ${attempt} failed:`, err);
                    // Retry up to 3 times
                    if (attempt < 3) {
                      setTimeout(() => attemptResume(attempt + 1), 500);
                    }
                  });
              } else {
                // Video is playing but stalled - try seeking slightly forward
                const currentTime = video.currentTime;
                video.currentTime = currentTime + 0.1;
                console.log("VideoPlayer: Seeking forward to unstuck video");
              }
            }
          };
          setTimeout(() => attemptResume(), 100);
        }
      };
      
      // Handle suspend event (browser paused video to save resources)
      const handleSuspend = () => {
        console.log("VideoPlayer: Video suspended by browser, will resume when ready");
      };
      
      // Handle progress event - track if video is actually loading
      let lastBufferedEnd = 0;
      const handleProgress = () => {
        if (video && video.buffered.length > 0) {
          const bufferedEnd = video.buffered.end(video.buffered.length - 1);
          if (bufferedEnd > lastBufferedEnd) {
            lastBufferedEnd = bufferedEnd;
            // Video is buffering, ensure it plays when ready
            if (video.paused && !video.ended && video.readyState >= 3) {
              video.play().catch(err => {
                console.error("VideoPlayer: Failed to play after progress:", err);
              });
            }
          }
        }
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
      video.addEventListener('pause', handlePause);
      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('playing', handlePlaying);
      video.addEventListener('stalled', handleCanPlayAfterStall);
      video.addEventListener('suspend', handleSuspend);
      video.addEventListener('progress', handleProgress);
      
      // Load and play video
      // Always start muted to bypass autoplay restrictions
      try {
        console.log("VideoPlayer: Setting up video element");
        // Only reload if the source actually changed
        const currentSrc = video.currentSrc || video.src;
        if (currentSrc !== song.videoUrl) {
          video.muted = true; // Start muted - browsers allow muted autoplay
          video.load();
          console.log("VideoPlayer: Video load() called (source changed)");
        } else {
          // Same source - just ensure it's playing
          console.log("VideoPlayer: Same source, ensuring playback continues");
          if (video.paused && !video.ended) {
            video.play().catch(err => {
              console.warn("VideoPlayer: Could not resume same video:", err);
            });
          }
        }
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
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('stalled', handleCanPlayAfterStall);
        video.removeEventListener('suspend', handleSuspend);
        video.removeEventListener('progress', handleProgress);
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
