import { useState, useMemo, useEffect } from "react";
import Header from "../components/Header.jsx";
import SearchBar from "../components/SearchBar.jsx";
import SearchResults from "../components/SearchResults.jsx";
import MostPlayed from "../components/MostPlayed.jsx";
import QueueList from "../components/QueueList.jsx";
import Playlists from "../components/Playlists.jsx";
import useSongSearch from "../hooks/useSongSearch.jsx";
import usePrefixSearch from "../hooks/usePrefixSearch.jsx";
import { useRoomContext } from "../context/RoomContext.jsx";
import { api, API_BASE } from "../api";

export default function Home() {
  const [filters, setFilters] = useState({
    language: "all",
    artist: "",
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

  // --- Prefix search hooks (hit backend /songs/search) ---
  // Enable when user has typed ≥1 char in the respective field
  const songNameQuery = filters.songName || "";
  const artistQuery = selectedArtist || filters.artist || "";
  const albumQuery = filters.album || "";
  const usingSongNameSearch = songNameQuery.trim().length >= 1;
  const usingArtistSearch = artistQuery.trim().length >= 1;
  const usingAlbumSearch = albumQuery.trim().length >= 1;

  const {
    results: songNameResults,
    loading: songNameSearchLoading,
  } = usePrefixSearch(songNameQuery, "title", usingSongNameSearch, allSongs);

  const {
    results: artistResults,
    loading: artistSearchLoading,
  } = usePrefixSearch(artistQuery, "artist", usingArtistSearch, allSongs);

  const {
    results: albumResults,
    loading: albumSearchLoading,
  } = usePrefixSearch(albumQuery, "album", usingAlbumSearch, allSongs);

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
  const hasActiveFilters = filters.language !== "all" || filters.artist || filters.album || filters.songName || selectedArtist || selectedPlaylistId;
  const isSearching = songNameSearchLoading || artistSearchLoading || albumSearchLoading;

const filteredSongs = useMemo(() => {
  // If a playlist is selected, use playlist songs
  if (selectedPlaylistId && playlistSongs.length > 0) {
    return playlistSongs;
  }

  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // ── Collect backend result sets that are active ──
  // Each active search field contributes a set of song IDs.
  // We intersect all active sets to get the final pool.
  const activeSets = [];
  if (usingSongNameSearch && songNameResults.length > 0) {
    activeSets.push({ ids: new Set(songNameResults.map(s => s.id)), songs: songNameResults });
  }
  if (usingArtistSearch && artistResults.length > 0) {
    activeSets.push({ ids: new Set(artistResults.map(s => s.id)), songs: artistResults });
  }
  if (usingAlbumSearch && albumResults.length > 0) {
    activeSets.push({ ids: new Set(albumResults.map(s => s.id)), songs: albumResults });
  }

  let pool;
  const anyBackendSearchActive = usingSongNameSearch || usingArtistSearch || usingAlbumSearch;

  if (anyBackendSearchActive && activeSets.length > 0) {
    // Start from the first set's songs, then filter by intersection with other sets' IDs
    pool = activeSets[0].songs;
    for (let i = 1; i < activeSets.length; i++) {
      pool = pool.filter(s => activeSets[i].ids.has(s.id));
    }
  } else if (anyBackendSearchActive && activeSets.length === 0) {
    // Backend search is active but returned no results (or still loading) → empty
    pool = [];
  } else {
    // No text search active → use full song list
    pool = allSongs || [];
  }

  if (pool.length === 0) return [];

  // ── Apply LANGUAGE filter locally (language is a dropdown, not a prefix search) ──
  return pool.filter(song => {
    if (filters.language !== "all") {
      if (normalize(song.language) !== normalize(filters.language)) {
        return false;
      }
    }
    return true;
  });

}, [allSongs, filters, selectedPlaylistId, playlistSongs,
    usingSongNameSearch, usingArtistSearch, usingAlbumSearch,
    songNameResults, artistResults, albumResults]);

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
  const [isClearingQueue, setIsClearingQueue] = useState(false);
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


  const handleClearQueue = async () => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId) {
      console.warn("Cannot clear queue: No room ID");
      return;
    }
    if (!queue?.length) return;

    if (!window.confirm("Clear all songs from the queue?")) return;

    const previousQueue = queue;
    setIsClearingQueue(true);
    setQueue([]);

    try {
      await api(`/rooms/${currentRoomId}/queue/clear`, { method: "POST" });
      const queueRes = await api(`/rooms/${currentRoomId}/queue`);
      setQueue(Array.isArray(queueRes) ? queueRes : []);
      console.log("✅ Queue cleared");
    } catch (error) {
      console.error("Error clearing queue:", error);
      setQueue(previousQueue);
      alert("Failed to clear queue. Please try again.");
    } finally {
      setIsClearingQueue(false);
    }
  };

  const handleReorderQueue = async (fromIndex, toIndex) => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId) {
      console.warn("Cannot reorder: No room ID");
      return;
    }
    if (fromIndex === toIndex) return;

    // Optimistic local reorder
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    setQueue(newQueue);

    // Persist to backend (1-based positions)
    try {
      await api(`/rooms/${currentRoomId}/queue/reorder`, {
        method: "POST",
        body: JSON.stringify({
          from_position: fromIndex + 1,
          to_position: toIndex + 1,
        }),
      });
      console.log(`✅ Queue reordered: ${fromIndex + 1} → ${toIndex + 1}`);
    } catch (error) {
      console.error("Error reordering queue:", error);
      // Revert on failure
      setQueue(queue);
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
    
    console.log("🎬 READY TO SING BUTTON CLICKED!");
    console.log("📋 Room ID:", currentRoomId);
    console.log("📋 Queue length:", queue?.length || 0);
    
    try {
      // Check if admin has started a session for this room
      let hasActiveSession = false;
      try {
        const sessionData = await api(`/rooms/${currentRoomId}/session`);
        const session = sessionData.session;
        hasActiveSession = session && (session.status === "active" || session.status === "playing");
      } catch (err) {
        console.warn("Could not check session status:", err);
      }

      if (!hasActiveSession) {
        alert("Session not started. Ask the admin to start a session for this room.");
        return;
      }

      if (queue?.length > 0) {
        console.log("▶️ Playing queue with", queue.length, "songs");
        
        // Start next song from queue
        const response = await api(`/rooms/${currentRoomId}/playback/start_next`, {
          method: "POST"
        });
        
        if (response.status === "no_session") {
          alert("Session not started. Ask the admin to start a session for this room.");
          return;
        }
        
        console.log("✅ Play command sent to backend, response:", response);
      } else if (filteredSongs.length > 0) {
        // Add to queue first, then start playing
        try {
          await api(`/rooms/${currentRoomId}/queue/add`, {
            method: "POST",
            body: JSON.stringify({
              song_id: filteredSongs[0].id,
              added_by: "tablet"
            })
          });
          
          const response = await api(`/rooms/${currentRoomId}/playback/start_next`, {
            method: "POST"
          });
          
          if (response.status === "no_session") {
            alert("Session not started. Ask the admin to start a session for this room.");
            return;
          }
          
          console.log("✅ Song added to queue and started, response:", response);
        } catch (err) {
          console.error("Error adding/playing song:", err);
        }
      } else {
        alert("No songs available to play. Please add songs to queue or filter songs.");
      }
    } catch (error) {
      console.error("❌ Error playing song:", error);
      alert(`Failed to play song: ${error.message}`);
    }
  };

  const handleSkip = async () => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId || currentRoomId === "") {
      alert("No room selected. Please select a room first.");
      return;
    }
    
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
      
      if (response.status === "no_session") {
        alert("Session not started. Ask the admin to start a session for this room.");
      } else if (response.status === "no_songs") {
        alert("No more songs in queue.");
      } else if (response.status === "playing") {
        console.log("✅ Successfully skipped to next song:", response.song_title);
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

  // Handle adding entire playlist to queue
  const handleAddPlaylistToQueue = async (songs) => {
    const currentRoomId = roomId || room?.id;
    if (!currentRoomId || currentRoomId === "") {
      alert("No room selected. Please select a room first.");
      return;
    }

    if (!songs || songs.length === 0) {
      alert("No songs to add.");
      return;
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const song of songs) {
      if (!song || !song.id) {
        skippedCount++;
        continue;
      }

      // Check if already in queue
      if (isSongInQueue(song, queue)) {
        skippedCount++;
        continue;
      }

      try {
        const response = await api(`/rooms/${currentRoomId}/queue/add`, {
          method: "POST",
          body: JSON.stringify({
            song_id: song.id,
            added_by: "tablet"
          })
        });

        if (response.status === "added") {
          addedCount++;
        } else if (response.status === "already_exists") {
          skippedCount++;
        }
      } catch (error) {
        console.error(`Error adding song ${song.id} to queue:`, error);
        skippedCount++;
      }
    }

    // Refresh queue from backend
    try {
      const queueRes = await api(`/rooms/${currentRoomId}/queue`);
      setQueue(queueRes || []);
    } catch (err) {
      console.error("Error refreshing queue:", err);
    }

    // Log result (no alert)
    if (addedCount > 0) {
      console.log(`✅ Added ${addedCount} song${addedCount === 1 ? '' : 's'} to queue${skippedCount > 0 ? ` (${skippedCount} already in queue)` : ''}`);
    } else {
      console.log(`ℹ️ All songs are already in the queue.`);
    }
  };

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
      className="home-root text-white relative flex min-h-0 w-full max-w-[1920px] mx-auto flex-col"
      style={{
        backgroundImage: `url('${import.meta.env.BASE_URL}background.jpg')`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        paddingLeft:
          "max(env(safe-area-inset-left, 0px), var(--home-pad-x, clamp(12px, 2.5vw, 32px)))",
        paddingRight:
          "max(env(safe-area-inset-right, 0px), var(--home-pad-x, clamp(12px, 2.5vw, 32px)))",
        paddingTop: "var(--home-pad-y-top, max(0.5rem, env(safe-area-inset-top, 0px)))",
        paddingBottom:
          "var(--home-pad-y-bottom, max(0.75rem, env(safe-area-inset-bottom, 0px)))",
      }}
    >
      {/* Semi-transparent overlay for readability (stronger so UI stays legible on busy art) */}
      <div className="fixed inset-0 bg-[#0B0F17]/78 -z-10" aria-hidden />

      <Header />

      <div className="mt-3 mb-3 shrink-0 md:mt-4 md:mb-4">
        <SearchBar 
          filters={filters} 
          onFilterChange={(key, val) => {
            // Manual typing should override any previously selected artist chip state.
            setSelectedArtist(null);
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

      <div className="home-scroll-body">
      {songsLoading ? (
        <div className="main-content-area flex flex-1 items-center justify-center py-12">
          <div className="text-cyan-400 text-xl md:text-2xl">Loading songs...</div>
        </div>
      ) : (
        <div className="main-content-area">
          {/* ═══ ROW 1: Playlists title, then rail (cards + playback same height) ═══ */}
          <div className="row-1-wrap flex min-h-0 shrink-0 flex-col gap-2 sm:gap-2.5 md:gap-2">
            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              <span className="text-xl text-sky-300 md:text-2xl">🎵</span>
              <h3 className="text-lg font-semibold text-white md:text-xl lg:text-2xl">Playlists</h3>
            </div>
            <div className="row-1-grid min-h-0">
              <div
                className="row-1-left min-h-0 min-w-0 overflow-hidden"
                style={{ display: "flex", flexDirection: "column" }}
              >
                <div className="playlist-cards-container shrink-0 overflow-hidden" style={{ flexShrink: 0 }}>
                  <Playlists
                    playlists={playlists}
                    onPlaylistSelect={handlePlaylistSelect}
                    selectedPlaylistId={selectedPlaylistId}
                  />
                </div>
              </div>

              <div className="row-1-right flex min-h-0 min-w-0 flex-col overflow-x-visible">
                <div className="playback-rail-height flex w-full shrink-0 flex-col items-center justify-center gap-1 overflow-x-visible overflow-y-hidden rounded-2xl border border-white/[0.08] bg-slate-900/75 px-4 py-1.5 shadow-lg md:gap-1.5 md:px-5 md:py-2 lg:px-6">
                  <div className="flex min-w-0 max-w-full shrink-0 flex-nowrap flex-row items-center justify-center gap-1 md:gap-1.5">
                    <button
                      type="button"
                      onClick={handleReadyToSing}
                      disabled={!queue || queue.length === 0}
                      className={`playback-action-btn flex min-h-[38px] w-auto shrink-0 flex-row items-center justify-center gap-1.5 rounded-full border-0 px-5 py-2 text-xs font-semibold tracking-wide text-white outline-none transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 min-w-[6rem] md:min-h-[44px] md:min-w-[8rem] md:gap-2 md:px-7 md:py-2.5 md:text-sm lg:min-h-[46px] lg:min-w-[9rem] lg:px-9 lg:text-base
                      ${(!queue || queue.length === 0)
                        ? "cursor-not-allowed opacity-45"
                        : "cursor-pointer hover:scale-[1.03] active:scale-[0.98]"}
                    `}
                      style={{
                        backgroundColor: (!queue || queue.length === 0) ? "#475569" : "#ff4081",
                        borderRadius: 9999,
                        boxShadow:
                          !queue || queue.length === 0
                            ? "inset 0 1px 0 rgba(255,255,255,0.08)"
                            : "0 0 0 1px rgba(255,255,255,0.28), 0 4px 12px rgba(0,0,0,0.32), 0 0 22px rgba(255,64,129,0.8), 0 0 48px rgba(255,64,129,0.38)",
                      }}
                    >
                      <span className="text-lg leading-none drop-shadow-sm md:text-xl">▶</span>
                      <span className="leading-none drop-shadow-sm">Play</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSkip}
                      disabled={!queue || queue.length === 0}
                      className={`playback-action-btn flex min-h-[38px] w-auto shrink-0 flex-row items-center justify-center gap-1.5 rounded-full border-0 px-4 py-2 text-xs font-semibold tracking-wide text-white outline-none transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 min-w-[7.75rem] md:min-h-[44px] md:min-w-[10rem] md:gap-2 md:px-7 md:py-2.5 md:text-sm lg:min-h-[46px] lg:min-w-[11.25rem] lg:px-9 lg:text-base
                      ${(!queue || queue.length === 0)
                        ? "cursor-not-allowed opacity-45"
                        : "cursor-pointer hover:scale-[1.03] active:scale-[0.98]"}
                    `}
                      style={{
                        backgroundColor: (!queue || queue.length === 0) ? "#475569" : "#00bcd4",
                        borderRadius: 9999,
                        boxShadow:
                          !queue || queue.length === 0
                            ? "inset 0 1px 0 rgba(255,255,255,0.08)"
                            : "0 0 0 1px rgba(255,255,255,0.28), 0 4px 12px rgba(0,0,0,0.32), 0 0 22px rgba(0,229,255,0.7), 0 0 48px rgba(0,188,212,0.42)",
                      }}
                    >
                      <span className="text-lg leading-none drop-shadow-sm md:text-xl">⏭</span>
                      <span className="leading-none drop-shadow-sm">Skip to Next</span>
                    </button>
                  </div>
                  <p className="line-clamp-2 max-w-[95%] shrink-0 px-0.5 text-center text-[10px] italic leading-snug text-slate-400 md:text-[11px] lg:text-xs">
                    &ldquo;Where words fail, music speaks.&rdquo;{" "}
                    <span className="whitespace-nowrap">&mdash; Hans Christian Andersen</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ ROW 2: Most Played / Results + Queue ═══ */}
          <div className="main-row-grow row-2-grid">
            {/* Most Played / Search Results */}
            <div className="row-2-left">
              {hasActiveFilters ? (
                <div className="card-surface panel-fill p-3 sm:p-4 md:p-6 lg:p-7">
                  {selectedPlaylistId && (
                    <div className="mb-0 flex min-h-[46px] shrink-0 flex-wrap items-center justify-start gap-4 rounded-xl border border-blue-500/40 bg-gradient-to-r from-slate-950/95 via-[#0f172a]/95 to-blue-950/70 py-2.5 pl-3.5 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:min-h-[50px] md:gap-5 md:py-3 md:pl-4 md:pr-2.5 lg:min-h-[52px]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-base text-sky-300 md:text-lg">📋</span>
                        <span className="min-w-0 text-[15px] font-semibold leading-snug text-white md:text-lg">
                          Showing playlist:{" "}
                          <span className="text-sky-200">
                            {playlists.find((p) => p.id === selectedPlaylistId)?.name || "Playlist"}
                          </span>
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 md:gap-2.5">
                        <button
                          type="button"
                          onClick={async () => {
                            if (playlistSongs.length === 0) {
                              alert("No songs in this playlist to add.");
                              return;
                            }
                            await handleAddPlaylistToQueue(playlistSongs);
                          }}
                          className="rounded-[1rem] bg-sky-500 px-3.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-sky-400 md:rounded-[1.125rem] md:px-4 md:py-2 md:text-xs"
                        >
                          Add All to Queue
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlaylistId(null);
                            setPlaylistSongs([]);
                          }}
                          className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-white md:text-xs"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                  <div
                    className={
                      selectedPlaylistId
                        ? "mt-5 flex min-h-0 flex-1 flex-col overflow-hidden md:mt-8"
                        : "flex min-h-0 flex-1 flex-col overflow-hidden"
                    }
                  >
                    <SearchResults
                      songs={filteredSongs}
                      onAddToQueue={handleAddToQueue}
                      loading={songsLoading || isSearching}
                      languageLabel={
                        !selectedPlaylistId && filters.language !== "all"
                          ? filters.language
                          : null
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="card-surface panel-fill p-3 sm:p-4 md:p-6 lg:p-7">
                  <MostPlayed songs={mostPlayed} onSongSelect={handleAddToQueue} />
                </div>
              )}
            </div>

            {/* Queue */}
            <div className="row-2-right">
              <QueueList 
                queue={queue || []} 
                onRemove={handleRemoveFromQueue}
                onReorder={handleReorderQueue}
                onClear={handleClearQueue}
                clearing={isClearingQueue}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
