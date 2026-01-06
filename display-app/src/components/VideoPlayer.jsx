import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/*
  Very simple video player wrapper.
  - if song && song.videoUrl => plays it
  - else shows a poster/placeholder
  - forwards `play`, `pause` if needed
*/
const VideoPlayer = forwardRef(({ song, onEnded }, ref) => {
  const vref = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (song && song.videoUrl && vref.current) {
      console.log("VideoPlayer: Loading video:", song.videoUrl);
      setError(null);
      setLoading(true);
      
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
      // Start muted to allow autoplay, then unmute after playback starts
      try {
        video.muted = true; // Start muted to bypass autoplay restrictions
        video.load();
        const playPromise = video.play();
        
        if (playPromise && playPromise.then) {
          playPromise
            .then(() => {
              console.log("VideoPlayer: Video playing successfully (muted)");
              // Unmute after playback starts
              setTimeout(() => {
                if (video) {
                  video.muted = false;
                  console.log("VideoPlayer: Video unmuted");
                }
              }, 500);
              setLoading(false);
            })
            .catch((err) => {
              console.error("VideoPlayer: Play promise rejected:", err);
              // Try playing with muted (browsers allow muted autoplay)
              video.muted = true;
              video.play()
                .then(() => {
                  console.log("VideoPlayer: Video playing muted after retry");
                  // Unmute after playback starts
                  setTimeout(() => {
                    if (video) {
                      video.muted = false;
                      console.log("VideoPlayer: Video unmuted after retry");
                    }
                  }, 500);
                  setLoading(false);
                })
                .catch((e) => {
                  console.error("VideoPlayer: Muted play also failed:", e);
                  setError("Autoplay blocked. Please interact with the page first.");
                  setLoading(false);
                });
            });
        }
      } catch (e) {
        console.error("VideoPlayer: Exception during play:", e);
        setError("Failed to play video");
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
        playsInline
        autoPlay
        muted={true}
        preload="auto"
        crossOrigin="anonymous"
      >
        <source src={song.videoUrl} type="video/mp4" />
        <source src={song.videoUrl} type="video/webm" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

export default VideoPlayer;
