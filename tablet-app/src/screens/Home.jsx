import { useState, useMemo, useEffect } from "react";
import Header from "../components/Header.jsx";
import SearchBar from "../components/SearchBar.jsx";
import SearchResults from "../components/SearchResults.jsx";
import MostPlayed from "../components/MostPlayed.jsx";
import QueueList from "../components/QueueList.jsx";
import ReadyToSing from "../components/ReadyToSing.jsx";
import Playlists from "../components/Playlists.jsx";
import useSongSearch from "../hooks/useSongSearch.jsx";
import { useRoomContext } from "../context/RoomContext.jsx";
import { api, API_BASE } from "../api";

export default function Home() {
  const [filters, setFilters] = useState({
    language: "all",
    artist: "",
    singer: "",
    album: "",
    songName: "",
  });

  // Separate state for artist selected from TopArtists (doesn't show in search bar)
  const [selectedArtist, setSelectedArtist] = useState(null);
  
  // Playlists state
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [playlistSongs, setPlaylistSongs] = useState([]);

  const { room, roomId, queue, setQueue } = useRoomContext();
  const { all: allSongs = [], loading: songsLoading, search } = useSongSearch();

  // Fail-fast check for songs
  useEffect(() => {
    if (!songsLoading) {
      if (!allSongs || allSongs.length === 0) {
        console.error("❌ NO SONGS RECEIVED FROM BACKEND");
        console.error("allSongs value:", allSongs);
      } else {
        console.log("✅ SONGS LOADED:", allSongs.length);
        console.log("Sample song structure:", allSongs[0]);
      }
    }
  }, [allSongs, songsLoading]);

  // Fetch unique languages from backend
  const [languages, setLanguages] = useState([]);
  useEffect(() => {
    async function fetchLanguages() {
      try {
        const res = await api('/songs/languages');
        // Handle both array response and wrapped response
        const langList = Array.isArray(res) ? res : (res.data || []);
        if (Array.isArray(langList)) {
          setLanguages(langList);
          console.log('Fetched languages from backend:', langList.length, langList);
        }
      } catch (error) {
        console.warn("Error fetching languages:", error);
        // Fallback: extract from songs if endpoint fails
        if (allSongs && allSongs.length > 0) {
          const uniqueLanguages = [
            ...new Set(
              allSongs
                .map(s => s.language)
                .filter(l => typeof l === "string" && l.length > 0)
            )
          ].sort();
          setLanguages(uniqueLanguages);
          console.log('Using fallback languages from songs:', uniqueLanguages);
        }
      }
    }
    fetchLanguages();
  }, [allSongs]); // Re-fetch when songs are loaded for fallback

  // Fetch playlists from backend
  useEffect(() => {
    async function fetchPlaylists() {
      try {
        console.log('Fetching playlists from /playlists...');
        const res = await api("/playlists");
        console.log('Playlists API response:', res);
        
        // Handle different response formats
        let playlistsData = null;
        if (Array.isArray(res)) {
          // Direct array response
          playlistsData = res;
        } else if (res && Array.isArray(res.data)) {
          // Wrapped in data property
          playlistsData = res.data;
        } else if (res && res.playlists && Array.isArray(res.playlists)) {
          // Wrapped in playlists property
          playlistsData = res.playlists;
        } else {
          console.warn('Unexpected playlists response format:', res);
          playlistsData = [];
        }
        
        if (Array.isArray(playlistsData) && playlistsData.length > 0) {
          setPlaylists(playlistsData);
          console.log('✅ Fetched playlists:', playlistsData.length, playlistsData);
        } else {
          console.log('No playlists found or empty array');
          setPlaylists([]);
        }
      } catch (err) {
        console.error("❌ Failed to fetch playlists", err);
        console.error("Error details:", err.message, err.stack);
        setPlaylists([]);
      }
    }
    fetchPlaylists();
  }, []);

  // Check if there are active filters (including selectedArtist or playlist)
  const hasActiveFilters = filters.language !== "all" || filters.artist || filters.singer || filters.album || filters.songName || selectedArtist || selectedPlaylistId;

const filteredSongs = useMemo(() => {
  // If a playlist is selected, use playlist songs
  if (selectedPlaylistId && playlistSongs.length > 0) {
    return playlistSongs;
  }

  if (!allSongs || allSongs.length === 0) return [];

  const normalize = (v) => String(v || "").toLowerCase().trim();

  return allSongs.filter(song => {

    /* LANGUAGE */
    if (filters.language !== "all") {
      if (normalize(song.language) !== normalize(filters.language)) {
        return false;
      }
    }

    /* ARTIST = COMPOSER */
    if (filters.artist || selectedArtist) {
      const search = normalize(selectedArtist || filters.artist);

      const composers = (song.artists || [])
        .filter(a => a.role === "composer")
        .map(a => normalize(a.name));

      if (!composers.some(name => name.includes(search))) {
        return false;
      }
    }

    /* SINGER */
    if (filters.singer) {
      const search = normalize(filters.singer);

      const singers = (song.artists || [])
        .filter(a => a.role === "singer")
        .map(a => normalize(a.name));

      if (!singers.some(name => name.includes(search))) {
        return false;
      }
    }

    /* ALBUM */
    if (filters.album) {
      if (!normalize(song.album).includes(normalize(filters.album))) {
        return false;
      }
    }

    /* SONG TITLE */
    if (filters.songName) {
      if (!normalize(song.title).includes(normalize(filters.songName))) {
        return false;
      }
    }

    return true;
  });

}, [allSongs, filters, selectedArtist, selectedPlaylistId, playlistSongs]);

  // Fetch most played songs based on play_count
  const [mostPlayed, setMostPlayed] = useState([]);
  useEffect(() => {
    async function fetchMostPlayed() {
      try {
        const res = await api('/songs');
        const songs = res.data || res;
        if (Array.isArray(songs)) {
          const mostPlayedSongs = songs
            .filter(s => s.play_count > 0)
            .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
            .slice(0, 5)
            .map((s, index) => ({
              ...s,
              rank: index + 1,
              image: s.image || s.album_art || "/default-cover.jpg",
            }));
          setMostPlayed(mostPlayedSongs);
        } else {
          setMostPlayed([]);
        }
      } catch (error) {
        console.warn("Error fetching most played:", error);
        setMostPlayed([]);
      }
    }
    fetchMostPlayed();
  }, [room?.id]);

  const [isAddingToQueue, setIsAddingToQueue] = useState(false);
  const [addingSongId, setAddingSongId] = useState(null); // Track which song is being added
  
  // Helper function to check if a song is already in the queue (by song_id only)
  // Queue is independent of artists/composers - only uses song_id
  const isSongInQueue = (song, currentQueue) => {
    if (!song || !currentQueue || currentQueue.length === 0) return false;
    
    const songId = song.id || song.song_id;
    if (!songId) return false;
    
    // Check by song_id only (not by title or artist)
    const foundById = currentQueue.some(q => {
      const queueSongId = q.song_id || q.id;
      return queueSongId === songId;
    });
    
    return foundById;
  };

  const handleAddToQueue = async (song) => {
    if (!song || !song.id) {
      console.error("Invalid song object:", song);
      alert("Invalid song. Please try again.");
      return;
    }
    
    const songId = song.id;
    
    // Prevent multiple rapid clicks on the same song
    if (isAddingToQueue && addingSongId === songId) {
      console.log("⏳ Already adding this song to queue, please wait...");
      return;
    }
    
    // Get room ID - use roomId from context or room.id
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId || currentRoomId === "") {
      alert("No room selected. Please select a room first.");
      return;
    }
    
    // Frontend check: prevent adding if song is already in queue
    if (isSongInQueue(song, queue)) {
      console.log("ℹ️ Song already in queue (frontend check):", song.title, "song_id:", songId);
      console.log("Current queue:", queue);
      alert("This song is already in the queue.");
      return;
    }
    
    // Set flags synchronously before async operations to prevent race conditions
    setIsAddingToQueue(true);
    setAddingSongId(songId);
    
    try {
      // Add to queue via REST API first (don't update local state optimistically)
      const response = await api(`/rooms/${currentRoomId}/queue/add`, {
        method: "POST",
        body: JSON.stringify({
          song_id: songId,
          added_by: "tablet"
        })
      });
      
      console.log("Queue add response:", response);
      
      // Only update local state if song was actually added (not already exists)
      if (response.status === "added") {
        // Refresh queue from backend to get the correct structure with position, etc.
        try {
          const queueRes = await api(`/rooms/${currentRoomId}/queue`);
          setQueue(queueRes || []);
      console.log("✅ Successfully added to queue:", song.title);
        } catch (err) {
          console.error("Error refreshing queue after add:", err);
          // Fallback: add to local state if refresh fails (with duplicate check)
          setQueue((prev) => {
            const newItem = { ...song, song_id: songId };
            if (isSongInQueue(newItem, prev)) {
              console.log("⚠️ Song already in queue (fallback check):", song.title);
              return prev; // already in queue
            }
            return [...prev, newItem];
          });
        }
      } else if (response.status === "already_exists") {
        console.log("ℹ️ Song already in queue (backend check):", song.title);
        alert("This song is already in the queue.");
        // Refresh queue from backend to get latest state
        try {
          const queueRes = await api(`/rooms/${currentRoomId}/queue`);
          setQueue(queueRes || []);
        } catch (err) {
          console.error("Error refreshing queue:", err);
        }
      }
    } catch (error) {
      console.error("Error adding to queue:", error);
      alert(`Failed to add song: ${error.message || "Unknown error"}`);
    } finally {
      setIsAddingToQueue(false);
      setAddingSongId(null);
    }
  };

  const handleRemoveFromQueue = async (index) => {
    if (!room?.id) {
      console.warn("Cannot remove from queue: No room ID");
      return;
    }
    
    if (index < 0 || index >= (queue?.length || 0)) {
      console.warn("Invalid index for queue removal:", index);
      return;
    }
    
    const songToRemove = queue[index];
    console.log("🗑️ Removing song from queue:", songToRemove?.title || songToRemove?.id, "at index:", index);
    
    // Get the actual position from the queue item (backend uses 1-based positions)
    // If position is not available, use index + 1 (convert 0-based to 1-based)
    const position = songToRemove?.position ?? (index + 1);
    
    // Update local state immediately for instant feedback
    const newQueue = queue.filter((_, i) => i !== index);
    setQueue(newQueue);
    
    // Remove from backend
    try {
      await api(`/rooms/${room.id}/queue/remove`, {
        method: "POST",
        body: JSON.stringify({ position: position })
      });
      console.log("✅ Queue item removed from backend at position:", position);
    } catch (error) {
      console.error("Error removing from queue:", error);
      // Revert local state if backend call fails
      setQueue(queue);
      alert("Failed to remove song from queue. Please try again.");
    }
  };

  const handlePlaySong = async (song) => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId || currentRoomId === "") {
      alert("No room selected. Please select a room first.");
      return;
    }
    try {
      // Set current song via REST API
      await api(`/rooms/${currentRoomId}/current`, {
        method: "PUT",
        body: JSON.stringify({
          current_song_id: song.id
        })
      });
      console.log("✅ Started playing:", song.title);
    } catch (error) {
      console.error("Error starting song:", error);
      throw error;
    }
  };

  const handleReadyToSing = async () => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId || currentRoomId === "") {
      alert("No room selected. Please select a room first.");
      return;
    }
    
    console.log("🎬 ========================================");
    console.log("🎬 READY TO SING BUTTON CLICKED!");
    console.log("🎬 ========================================");
    console.log("📋 Room ID:", currentRoomId);
    console.log("📋 Queue length:", queue?.length || 0);
    console.log("🔍 Filtered songs:", filteredSongs.length);
    
    try {
      // First, ensure a session is started (60 minutes default)
      try {
        console.log("🎬 Starting session for room:", currentRoomId);
        const sessionResponse = await api(`/rooms/${currentRoomId}/start`, {
          method: "POST",
          body: JSON.stringify({
            minutes: 60
          })
        });
        console.log("✅ Session started:", sessionResponse);
      } catch (sessionError) {
        console.warn("⚠️ Session might already exist or error starting session:", sessionError);
        // Continue anyway - session might already exist
      }
      
      if (queue?.length > 0) {
        console.log("▶️ Playing queue with", queue.length, "songs");
        console.log("🎵 First song in queue:", queue[0]?.title);
        
        // Start next song from queue - this will immediately start playback on display app
        const response = await api(`/rooms/${currentRoomId}/playback/start_next`, {
          method: "POST"
        });
        
        console.log("✅ Play command sent to backend, response:", response);
        // Display app will automatically detect the new current_song_id and start playing
      } else if (filteredSongs.length > 0) {
        console.log("▶️ Playing first filtered song:", filteredSongs[0].title);
        
        // Add to queue first, then start playing
        try {
          // Add song to queue
          await api(`/rooms/${currentRoomId}/queue/add`, {
            method: "POST",
            body: JSON.stringify({
              song_id: filteredSongs[0].id,
              added_by: "tablet"
            })
          });
          
          // Then start playing from queue
          const response = await api(`/rooms/${currentRoomId}/playback/start_next`, {
            method: "POST"
          });
          
          console.log("✅ Song added to queue and started, response:", response);
        } catch (err) {
          console.error("Error adding/playing song:", err);
          // Fallback: try direct play
        await handlePlaySong(filteredSongs[0]);
        }
      } else {
        alert("No songs available to play. Please add songs to queue or filter songs.");
      }
    } catch (error) {
      console.error("❌ Error playing song:", error);
      console.error("❌ Error details:", error.message, error.stack);
      alert(`Failed to play song: ${error.message}. Check console for details.`);
    }
  };

  const handleSkip = async () => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId || currentRoomId === "") {
      alert("No room selected. Please select a room first.");
      return;
    }
    
    // Check if there are songs in queue
    if (!queue || queue.length === 0) {
      alert("No songs in queue to skip to.");
      return;
    }
    
    console.log("⏭️ Skipping to next song...");
    try {
      const response = await api(`/rooms/${currentRoomId}/playback/start_next`, {
        method: "POST"
      });
      
      console.log("✅ Skip response:", response);
      
      if (response.status === "no_songs") {
        alert("No more songs in queue.");
      } else if (response.status === "playing") {
        console.log("✅ Successfully skipped to next song:", response.song_title);
        // Refresh queue to update the list
        try {
          const queueRes = await api(`/rooms/${currentRoomId}/queue`);
          setQueue(queueRes || []);
        } catch (err) {
          console.error("Error refreshing queue after skip:", err);
        }
      }
    } catch (error) {
      console.error("❌ Error skipping song:", error);
      alert(`Failed to skip song: ${error.message || "Unknown error"}`);
    }
  };

  // Poll queue to check for changes and auto-play next song
  useEffect(() => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId || currentRoomId === "") return;

    let mounted = true;
    const pollQueue = async () => {
      try {
        const res = await api(`/rooms/${currentRoomId}/queue`);
        const queueData = res.data || res;
        if (mounted && Array.isArray(queueData)) {
          // Update queue from backend - preserve position field from backend
          setQueue(queueData.map(item => {
            // If item has nested song data, merge it, otherwise use item as-is
            const queueItem = item.songs || item;
            // Ensure position is preserved
            return {
              ...queueItem,
              position: item.position || queueItem.position
            };
          }));
        }
      } catch (error) {
        console.error("Error polling queue:", error);
      }
    };

    pollQueue();
    const interval = setInterval(pollQueue, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [room?.id]);

  // Debug: Log room and queue status
  useEffect(() => {
    console.log("Room status:", { roomId: room?.id, queueLength: queue?.length, room });
  }, [room, queue]);

  // Handle playlist selection
  const handlePlaylistSelect = async (playlist) => {
    try {
      // If clicking the same playlist, deselect it
      if (selectedPlaylistId === playlist.id) {
        setSelectedPlaylistId(null);
        setPlaylistSongs([]);
        return;
      }

      setSelectedPlaylistId(playlist.id);
      
      // Clear other filters when selecting a playlist
      setSelectedArtist(null);
      setFilters({
        language: "all",
        artist: "",
        singer: "",
        album: "",
        songName: "",
      });

      // Fetch playlist songs
      const res = await api(`/playlists/${playlist.id}/songs`);
      const songs = res.data || res;
      if (Array.isArray(songs)) {
        setPlaylistSongs(songs);
        console.log(`Loaded ${songs.length} songs from playlist:`, playlist.name);
      } else {
        setPlaylistSongs([]);
      }
    } catch (err) {
      console.error("Failed to load playlist songs", err);
      setPlaylistSongs([]);
      alert("Failed to load playlist songs. Please try again.");
    }
  };

  return (
    <div 
      className="h-screen text-white py-6 relative flex flex-col"
      style={{
        backgroundImage: "url('/background.jpg')",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        paddingLeft: "5%",
        paddingRight: "5%"
      }}
    >
      {/* Semi-transparent overlay for readability */}
      <div className="fixed inset-0 bg-[#0B0F17]/70 -z-10"></div>
      
      <Header />

      <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
        <SearchBar 
          filters={filters} 
          onFilterChange={(key, val) => {
            // When user types in search bar, clear selectedArtist and playlist
            if (key === "artist") {
              setSelectedArtist(null);
            }
            // Clear playlist selection when any filter is changed
            if (selectedPlaylistId) {
              setSelectedPlaylistId(null);
              setPlaylistSongs([]);
            }
            setFilters(p => ({ ...p, [key]: val }));
          }}
          languages={languages}
        />
      </div>

      {songsLoading ? (
        <div className="text-center py-20">
          <div className="text-cyan-400 text-xl">Loading songs...</div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6 flex-1" style={{ alignItems: "stretch", minHeight: 0 }}>
          {/* LEFT */}
          <div className="col-span-8 space-y-6" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Playlists section - above results */}
            <Playlists 
              playlists={playlists} 
              onPlaylistSelect={handlePlaylistSelect}
              selectedPlaylistId={selectedPlaylistId}
            />
            
            {/* Show selected playlist indicator */}
            {selectedPlaylistId && (
              <div className="bg-cyan-500/20 border border-cyan-500/50 rounded-lg flex items-center justify-between" style={{ padding: "1rem 1rem", minHeight: "2rem" }}>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">📋</span>
                  <span className="text-white font-semibold">
                    Showing playlist: <span className="text-cyan-300">
                      {playlists.find(p => p.id === selectedPlaylistId)?.name || "Playlist"}
                    </span>
                    {playlistSongs.length > 0 && (
                      <span className="text-slate-400 text-sm ml-2">
                        ({playlistSongs.length} {playlistSongs.length === 1 ? 'song' : 'songs'})
                      </span>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSelectedPlaylistId(null);
                    setPlaylistSongs([]);
                  }}
                  className="text-gray-400 hover:text-white text-sm underline"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Show search results when filters are active, otherwise show Most Played */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              {hasActiveFilters ? (
                <div className="card-surface p-6" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <SearchResults 
                    songs={filteredSongs} 
                    onAddToQueue={handleAddToQueue}
                    loading={songsLoading}
                  />
                </div>
              ) : (
                <div className="card-surface p-6" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <MostPlayed songs={mostPlayed} onSongSelect={handleAddToQueue} />
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="col-span-4 space-y-6" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <ReadyToSing 
              onPlay={handleReadyToSing}
              onSkip={handleSkip}
              queueLength={queue?.length || 0}
            />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", marginTop: "2rem", minHeight: 0 }}>
              <QueueList 
                queue={queue || []} 
                onRemove={handleRemoveFromQueue}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
