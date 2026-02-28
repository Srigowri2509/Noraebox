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
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Handle user interaction to enable autoplay
  const handleUserInteraction = () => {
    setHasUserInteracted(true);
    setNeedsInteraction(false);
    if (vref.current && song && song.videoUrl) {
      const video = vref.current;
      video.muted = false;
      const playPromise = video.play();
      if (playPromise) {
        playPromise.catch(err => {
          console.error("VideoPlayer: Play failed after interaction:", err);
        });
      }
    }
  };

  useEffect(() => {
    if (song && song.videoUrl && vref.current) {
      console.log("VideoPlayer: Loading video:", song.videoUrl);
      setError(null);
      setLoading(true);
      setNeedsInteraction(false);
      
      const video = vref.current;
      
      // Set up error handlers
      const handleError = (e) => {
        console.error("VideoPlayer: Video error:", e);
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
      
      video.addEventListener('error', handleError);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('loadeddata', handleLoadedData);
      
      // Load and play video
      // Always start muted to bypass autoplay restrictions
      try {
        video.muted = true; // Start muted - browsers allow muted autoplay
        video.load();
        
        // Try to play immediately (muted autoplay should work)
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
              }, 1000); // Wait 1 second before unmuting
            })
            .catch((err) => {
              console.warn("⚠️ VideoPlayer: Autoplay blocked, will need user interaction");
              setNeedsInteraction(true);
              setLoading(false);
              // Don't set error - show click to play button instead
            });
        } else {
          // Play promise not supported, try direct play
          video.play().catch((err) => {
            console.warn("⚠️ VideoPlayer: Direct play failed:", err);
            setNeedsInteraction(true);
            setLoading(false);
          });
        }
      } catch (e) {
        console.error("VideoPlayer: Exception during play:", e);
        setNeedsInteraction(true);
        setLoading(false);
      }
      
      return () => {
        video.removeEventListener('error', handleError);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadeddata', handleLoadedData);
      };
    } else if (!song || !song.videoUrl) {
      setError(null);
      setLoading(false);
      setNeedsInteraction(false);
    }
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

  // Show "Click to Play" overlay if autoplay is blocked
  if (needsInteraction && !hasUserInteracted) {
    return (
      <div className="video-wrapper" style={{ position: 'relative' }}>
        <video
          ref={vref}
          className="video-element"
          onEnded={() => {
            console.log("VideoPlayer: Video ended");
            onEnded && onEnded();
          }}
          onClick={handleUserInteraction}
          controls={false}
          disablePictureInPicture={true}
          controlsList="nodownload nofullscreen noremoteplayback"
          playsInline
          muted={true}
          preload="auto"
          crossOrigin="anonymous"
          style={{ opacity: 0.3, pointerEvents: 'auto' }} // Allow clicks for interaction
        >
          <source src={song.videoUrl} type="video/mp4" />
          <source src={song.videoUrl} type="video/webm" />
          Your browser does not support the video tag.
        </video>
        <div
          onClick={handleUserInteraction}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '20px 40px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '24px',
            fontWeight: 'bold',
            textAlign: 'center',
            zIndex: 10,
            transition: 'all 0.3s',
          }}
          onMouseEnter={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.9)'}
          onMouseLeave={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.8)'}
        >
          <div>▶️ Click to Play</div>
          <small style={{ fontSize: '14px', display: 'block', marginTop: '8px', opacity: 0.8 }}>
            {song.title || 'Song'}
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className="video-wrapper">
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          zIndex: 10
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
        controls={false}
        disablePictureInPicture={true}
        controlsList="nodownload nofullscreen noremoteplayback"
        playsInline
        autoPlay
        muted={true}
        preload="auto"
        crossOrigin="anonymous"
        style={{ pointerEvents: 'none' }} // Prevent any click interactions
      >
        <source src={song.videoUrl} type="video/mp4" />
        <source src={song.videoUrl} type="video/webm" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

export default VideoPlayer;
