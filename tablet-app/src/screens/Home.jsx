import { useState, useMemo, useEffect } from "react";
import Header from "../components/Header.jsx";
import SearchBar from "../components/SearchBar.jsx";
import SearchResults from "../components/SearchResults.jsx";
import TopArtists from "../components/TopArtists.jsx";
import MostPlayed from "../components/MostPlayed.jsx";
import QueueList from "../components/QueueList.jsx";
import ReadyToSing from "../components/ReadyToSing.jsx";
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

  // Check if there are active filters (including selectedArtist)
  const hasActiveFilters = filters.language !== "all" || filters.artist || filters.singer || filters.album || filters.songName || selectedArtist;

  const filteredSongs = useMemo(() => {
    console.log('=== FILTERING SONGS ===');
    console.log('Total songs available:', allSongs?.length || 0);
    console.log('Active filters:', { 
      language: filters.language, 
      artist: filters.artist, 
      singer: filters.singer,
      selectedArtist, 
      album: filters.album, 
      songName: filters.songName 
    });
    
    if (!allSongs || allSongs.length === 0) {
      console.log('No songs available for filtering');
      return [];
    }
    
    // Log sample song structure for debugging
    if (allSongs.length > 0) {
      console.log('Sample song structure:', {
        id: allSongs[0].id,
        title: allSongs[0].title,
        language: allSongs[0].language,
        artist: allSongs[0].artist,
        artist_name: allSongs[0].artist_name,
        artists: allSongs[0].artists, // Log the full artists array
        album: allSongs[0].album
      });
      
      // Log a few songs that might have Arijit Singh (check all roles)
      const arijitSongs = allSongs.filter(s => {
        const artists = s.artists || [];
        return artists.some(a => {
          const name = (typeof a === 'object' ? a.name : a) || '';
          return name.toLowerCase().includes('arijit');
        }) || (s.artist_name && s.artist_name.toLowerCase().includes('arijit')) ||
             (s.artist && s.artist.toLowerCase().includes('arijit'));
      });
      if (arijitSongs.length > 0) {
        console.log(`Found ${arijitSongs.length} songs with Arijit Singh (any role):`, arijitSongs.slice(0, 5).map(s => ({
          id: s.id,
          title: s.title,
          artists: s.artists, // This should show roles now
          artist_name: s.artist_name,
          artist: s.artist
        })));
        
        // Check specifically for singer role
        const arijitSingerSongs = arijitSongs.filter(s => {
          const artists = s.artists || [];
          return artists.some(a => {
            if (typeof a === 'object' && a.name) {
              const name = String(a.name).toLowerCase();
              const role = a.role ? String(a.role).toLowerCase().trim() : null;
              return name.includes('arijit') && role === 'singer';
            }
            return false;
          });
        });
        console.log(`Found ${arijitSingerSongs.length} songs with Arijit Singh as SINGER:`, arijitSingerSongs.slice(0, 3).map(s => ({
          id: s.id,
          title: s.title,
          artists: s.artists
        })));
      } else {
        console.warn('⚠️ No songs found with Arijit Singh in initial data');
      }
    }
    
    let filtered = [...allSongs];
    const initialCount = filtered.length;
    
    // Filter by language
    if (filters.language !== "all") {
      const before = filtered.length;
      const filterLangLower = filters.language.toLowerCase().trim();
      filtered = filtered.filter(song => {
        const songLang = song.language;
        if (!songLang) {
          if (before < 20) {
            console.log(`Song ${song.id} (${song.title}) has no language field`);
          }
          return false;
        }
        const songLangLower = String(songLang).toLowerCase().trim();
        const matches = songLangLower === filterLangLower;
        
        if (!matches && before < 20) {
          console.log(`Language mismatch: song "${song.title}" language="${songLang}" (${songLangLower}) vs filter="${filters.language}" (${filterLangLower})`);
        }
        return matches;
      });
      console.log(`Language filter (${filters.language}): ${before} -> ${filtered.length}`);
      if (filtered.length === 0 && before > 0) {
        // Show available languages from the unfiltered list
        const availableLangs = [...new Set(
          allSongs.map(s => s.language).filter(Boolean)
        )].slice(0, 10);
        console.warn(`⚠️ No songs found for language "${filters.language}". Available languages in database:`, availableLangs);
        console.warn(`Sample songs with languages:`, allSongs.slice(0, 5).map(s => ({ title: s.title, language: s.language })));
      }
    }
    
    // Filter by artist (use selectedArtist if set, otherwise use filters.artist)
    const artistFilter = selectedArtist || filters.artist;
    if (artistFilter) {
      const before = filtered.length;
      // Handle both string and object for selectedArtist
      const filterValue = typeof artistFilter === 'string' ? artistFilter : (artistFilter.name || artistFilter.artist || '');
      const filterLower = filterValue.toLowerCase().trim();
      
      if (!filterLower) {
        console.log('Empty artist filter, skipping');
      } else {
      filtered = filtered.filter(song => {
        // Check all artists in the artists array, not just the first one
        // For "Artist" field, we want ONLY composers (role="composer")
        // Fallback to artist_name/artist if artists array is missing
        let artistsArray = Array.isArray(song.artists) ? song.artists : [];
        
        // If no artists array, create one from fallback fields (assume composer role)
        if (artistsArray.length === 0) {
          if (song.artist_name) {
            artistsArray = [{ name: song.artist_name, role: "composer" }];
          } else if (song.artist) {
            artistsArray = [{ name: song.artist, role: "composer" }];
          }
        }
        
        // Extract artist names from the array - filter by role="composer"
        const allArtistNames = [];
        let hasRoleInfo = false;
        
        // Process artists array - only include composers for "Artist" field
        artistsArray.forEach(a => {
          if (a === null || a === undefined) return;
          
          // Check role - for "Artist" field, ONLY include "composer" role
          const role = a.role ? String(a.role).toLowerCase().trim() : null;
          if (role) {
            hasRoleInfo = true;
            if (role !== 'composer') {
              // Skip non-composers when searching in "Artist" field
              return;
            }
          } else {
            // If no role info, we'll include it as fallback (for backward compatibility)
            // But only if we don't have any role info at all
          }
          
          // Handle object format: {id: 275, name: "Arijit Singh", role: "composer"}
          if (typeof a === 'object' && a !== null) {
            // Try to get name from various possible fields
            const name = a.name || a.artist || a.artist_name;
            if (name) {
              allArtistNames.push(String(name));
            } else {
              // If no name field, try to stringify the object (fallback)
              // But skip if it's just an object with only id
              const keys = Object.keys(a);
              if (keys.length > 1 || !keys.includes('id')) {
                allArtistNames.push(String(a));
              }
            }
          } else {
            // Handle string format - only include if no role info or role is composer
            if (!hasRoleInfo || role === 'composer') {
              allArtistNames.push(String(a));
            }
          }
        });
        
        // Note: We already handled fallback above by creating artistsArray from artist_name/artist
        // So we don't need to add them again here
        
        // Remove duplicates and empty values
        const uniqueNames = [...new Set(allArtistNames.filter(Boolean))];
        
        if (uniqueNames.length === 0) {
          if (before < 20) {
            console.log(`Song ${song.id} (${song.title}) has no non-singer artists:`, {
              artists: song.artists,
              artist_name: song.artist_name,
              artist: song.artist
            });
          }
          return false;
        }
        
        // Normalize function to handle special characters and whitespace
        const normalize = (str) => {
          return String(str)
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
            .replace(/[^\w\s]/g, '') // Remove special characters for comparison
            .trim();
        };
        
        const normalizedFilter = normalize(filterLower);
        
        // Check if any artist name matches (with normalization)
        const matches = uniqueNames.some(artistName => {
          const normalizedArtist = normalize(artistName);
          
          // Try multiple matching strategies:
          // 1. Exact match after normalization
          if (normalizedArtist === normalizedFilter) return true;
          
          // 2. Contains match (normalized)
          if (normalizedArtist.includes(normalizedFilter)) return true;
          if (normalizedFilter.includes(normalizedArtist)) return true;
          
          // 3. Word boundary match (for partial names)
          const filterWords = normalizedFilter.split(/\s+/).filter(w => w.length > 0);
          const artistWords = normalizedArtist.split(/\s+/).filter(w => w.length > 0);
          
          // Check if all filter words appear in artist name
          if (filterWords.length > 0 && filterWords.every(word => 
            artistWords.some(aw => aw.includes(word) || word.includes(aw))
          )) {
            return true;
          }
          
          // 4. Original string match (case-insensitive, with special chars)
          const artistLower = String(artistName).toLowerCase().trim();
          if (artistLower.includes(filterLower) || filterLower.includes(artistLower)) {
            return true;
          }
          
          return false;
        });
        
        if (!matches && before < 20) {
          console.log(`Artist (composer) mismatch: song ${song.id} "${song.title}" artists="${uniqueNames.join(', ')}" vs filter="${filterValue}" (${filterLower})`);
          console.log(`  Normalized: "${uniqueNames.map(n => normalize(n)).join(', ')}" vs "${normalizedFilter}"`);
          console.log(`  Raw artists array:`, song.artists);
        }
        return matches;
        });
        console.log(`Artist filter (${filterValue}): ${before} -> ${filtered.length}`);
        if (filtered.length === 0 && before > 0) {
          // Show available artists from the unfiltered list
          const availableArtists = [...new Set(
            allSongs.flatMap(s => {
              const artists = s.artists || [];
              const names = artists.map(a => {
                if (typeof a === 'object' && a !== null) {
                  return a.name || a.artist || String(a);
                }
                return String(a);
              }).filter(Boolean);
              if (s.artist_name) names.push(String(s.artist_name));
              if (s.artist) names.push(String(s.artist));
              return names;
            }).filter(Boolean)
          )].slice(0, 20); // Show more artists for debugging
          
          // Also show artists that are similar to the search term
          const similarArtists = availableArtists.filter(a => {
            const normalize = (str) => String(str).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
            const normalizedFilter = normalize(filterLower);
            const normalizedArtist = normalize(a);
            return normalizedArtist.includes(normalizedFilter) || normalizedFilter.includes(normalizedArtist);
          });
          
          console.warn(`⚠️ No songs found for artist "${filterValue}". Available artists in database:`, availableArtists);
          if (similarArtists.length > 0) {
            console.warn(`⚠️ Similar artists found:`, similarArtists);
          }
          
          // Debug: Show sample songs with their artists
          console.log('Sample songs with artists:', allSongs.slice(0, 5).map(s => ({
            title: s.title,
            artists: s.artists,
            artist_name: s.artist_name,
            artist: s.artist
          })));
        }
      }
    }
    
    // Filter by singer (works the same as artist - searches all artists associated with song)
    if (filters.singer) {
      const before = filtered.length;
      const filterLower = filters.singer.toLowerCase().trim();
      
      if (!filterLower) {
        console.log('Empty singer filter, skipping');
      } else {
        filtered = filtered.filter(song => {
          // Check all artists in the artists array, not just the first one
          // For "Singer" field, we ONLY want artists with role="singer"
          // Fallback to artist_name/artist if artists array is missing
          let artistsArray = Array.isArray(song.artists) ? song.artists : [];
          
          // If no artists array, create one from fallback fields
          if (artistsArray.length === 0) {
            if (song.artist_name) {
              artistsArray = [{ name: song.artist_name, role: "singer" }];
            } else if (song.artist) {
              artistsArray = [{ name: song.artist, role: "singer" }];
            }
          }
          
          // Extract artist names from the array - filter by role="singer"
          const allArtistNames = [];
          let hasRoleInfo = false;
          
          // Process artists array - only include singers
          artistsArray.forEach(a => {
            if (a === null || a === undefined) return;
            
            // Check role - for "Singer" field, ONLY include "singer" role
            const role = a.role ? String(a.role).toLowerCase().trim() : null;
            if (role) {
              hasRoleInfo = true;
              if (role !== 'singer') {
                // Skip non-singers when searching in "Singer" field
                return;
              }
            }
            // If no role info, we'll include it as fallback (for backward compatibility)
            
            // Handle object format: {id: 275, name: "Arijit Singh", role: "singer"}
            if (typeof a === 'object' && a !== null) {
              // Try to get name from various possible fields
              const name = a.name || a.artist || a.artist_name;
              if (name) {
                allArtistNames.push(String(name));
              } else {
                // If no name field, try to stringify the object (fallback)
                // But skip if it's just an object with only id
                const keys = Object.keys(a);
                if (keys.length > 1 || !keys.includes('id')) {
                  allArtistNames.push(String(a));
                }
              }
            } else {
              // Handle string format - include if no role info or role is singer
              if (!hasRoleInfo || role === 'singer') {
                allArtistNames.push(String(a));
              }
            }
          });
          
          // Also check artist_name and artist for backward compatibility (if no role info)
          // Only include if we don't have role-based filtering
          if (!hasRoleInfo) {
            if (song.artist_name) {
              allArtistNames.push(String(song.artist_name));
            }
            if (song.artist) {
              allArtistNames.push(String(song.artist));
            }
          }
          
          // Remove duplicates and empty values
          const uniqueNames = [...new Set(allArtistNames.filter(Boolean))];
          
          if (uniqueNames.length === 0) {
            if (before < 20) {
              console.log(`Song ${song.id} (${song.title}) has no singers:`, {
                artists: song.artists,
                artist_name: song.artist_name,
                artist: song.artist
              });
            }
            return false;
          }
          
          // Normalize function to handle special characters and whitespace
          const normalize = (str) => {
            return String(str)
              .toLowerCase()
              .trim()
              .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
              .replace(/[^\w\s]/g, '') // Remove special characters for comparison
              .trim();
          };
          
          const normalizedFilter = normalize(filterLower);
          
          // Check if any artist name matches (with normalization)
          const matches = uniqueNames.some(artistName => {
            const normalizedArtist = normalize(artistName);
            
            // Try multiple matching strategies:
            // 1. Exact match after normalization
            if (normalizedArtist === normalizedFilter) return true;
            
            // 2. Contains match (normalized)
            if (normalizedArtist.includes(normalizedFilter)) return true;
            if (normalizedFilter.includes(normalizedArtist)) return true;
            
            // 3. Word boundary match (for partial names)
            const filterWords = normalizedFilter.split(/\s+/).filter(w => w.length > 0);
            const artistWords = normalizedArtist.split(/\s+/).filter(w => w.length > 0);
            
            // Check if all filter words appear in artist name
            if (filterWords.length > 0 && filterWords.every(word => 
              artistWords.some(aw => aw.includes(word) || word.includes(aw))
            )) {
              return true;
            }
            
            // 4. Original string match (case-insensitive, with special chars)
            const artistLower = String(artistName).toLowerCase().trim();
            if (artistLower.includes(filterLower) || filterLower.includes(artistLower)) {
              return true;
            }
            
            return false;
          });
          
          if (!matches && before < 20) {
            console.log(`Singer mismatch: song ${song.id} "${song.title}" singers="${uniqueNames.join(', ')}" vs filter="${filters.singer}" (${filterLower})`);
            console.log(`  Normalized: "${uniqueNames.map(n => normalize(n)).join(', ')}" vs "${normalizedFilter}"`);
            console.log(`  Raw artists array:`, song.artists);
          }
          return matches;
        });
        console.log(`Singer filter (${filters.singer}): ${before} -> ${filtered.length}`);
        if (filtered.length === 0 && before > 0) {
          // Show available artists from the unfiltered list
          const availableArtists = [...new Set(
            allSongs.flatMap(s => {
              const artists = s.artists || [];
              const names = artists.map(a => {
                if (typeof a === 'object' && a !== null) {
                  return a.name || a.artist || String(a);
                }
                return String(a);
              }).filter(Boolean);
              if (s.artist_name) names.push(String(s.artist_name));
              if (s.artist) names.push(String(s.artist));
              return names;
            }).filter(Boolean)
          )].slice(0, 20); // Show more artists for debugging
          
          // Also show artists that are similar to the search term
          const similarArtists = availableArtists.filter(a => {
            const normalize = (str) => String(str).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
            const normalizedFilter = normalize(filterLower);
            const normalizedArtist = normalize(a);
            return normalizedArtist.includes(normalizedFilter) || normalizedFilter.includes(normalizedArtist);
          });
          
          console.warn(`⚠️ No songs found for singer "${filters.singer}". Available artists in database:`, availableArtists);
          if (similarArtists.length > 0) {
            console.warn(`⚠️ Similar artists found:`, similarArtists);
          }
          
          // Debug: Show sample songs with their artists
          console.log('Sample songs with artists:', allSongs.slice(0, 5).map(s => ({
            title: s.title,
            artists: s.artists,
            artist_name: s.artist_name,
            artist: s.artist
          })));
        }
      }
    }
    
    // Filter by album
    if (filters.album) {
      const before = filtered.length;
      const filterLower = filters.album.toLowerCase().trim();
      filtered = filtered.filter(song => {
        const songAlbum = song.album?.trim();
        return songAlbum && songAlbum.toLowerCase().includes(filterLower);
      });
      console.log(`Album filter (${filters.album}): ${before} -> ${filtered.length}`);
    }
    
    // Filter by song name
    if (filters.songName) {
      const before = filtered.length;
      const filterLower = filters.songName.toLowerCase().trim();
      filtered = filtered.filter(song => {
        const songTitle = song.title?.trim();
        return songTitle && songTitle.toLowerCase().includes(filterLower);
      });
      console.log(`Song name filter (${filters.songName}): ${before} -> ${filtered.length}`);
    }
    
    console.log(`Final filtered count: ${filtered.length} from ${initialCount} total songs`);
    
    // Deduplicate by song ID to prevent same song appearing multiple times
    // (e.g., when a song has composer + multiple singers, it might match multiple times)
    const seenIds = new Set();
    const deduplicated = filtered.filter(song => {
      const songId = song.id;
      if (seenIds.has(songId)) {
        console.log(`⚠️ Duplicate song filtered out: ${song.title} (ID: ${songId})`);
        return false;
      }
      seenIds.add(songId);
      return true;
    });
    
    if (deduplicated.length < filtered.length) {
      console.log(`✅ Deduplicated: ${filtered.length} -> ${deduplicated.length} songs`);
    }
    
    if (deduplicated.length > 0) {
      console.log('Sample filtered song:', deduplicated[0]);
      console.log('First few filtered songs:', deduplicated.slice(0, 3).map(s => ({
        title: s.title,
        language: s.language,
        artist: s.artist || s.artist_name
      })));
    } else if (initialCount > 0) {
      console.warn('⚠️ All songs were filtered out!');
      console.warn('Available languages in songs:', [...new Set(allSongs.map(s => s.language).filter(Boolean))]);
      console.warn('Available artists in songs:', [...new Set(allSongs.map(s => s.artist || s.artist_name).filter(Boolean))].slice(0, 10));
    }
    console.log('=== END FILTERING ===');
    
    return deduplicated;
  }, [allSongs, filters, selectedArtist]);

  const topArtists = useMemo(() => {
    console.log('=== COMPUTING TOP ARTISTS ===');
    console.log('Total songs:', allSongs?.length || 0);
    
    const map = {};
    let songsWithArtists = 0;
    let songsWithoutArtists = 0;
    
    allSongs.forEach(s => {
      // Use artist_name from join, fallback to artist field
      const artistName = s.artist_name || s.artist;
      if (!artistName) {
        songsWithoutArtists++;
        return;
      }
      // Normalize artist name to avoid duplicates (case-insensitive)
      const normalizedName = artistName.trim();
      if (!normalizedName) {
        songsWithoutArtists++;
        return;
      }
      
      songsWithArtists++;
      
      if (!map[normalizedName]) {
        map[normalizedName] = {
          name: normalizedName,
          songCount: 0,
          image: s.artist_image || "/default-artist.jpg",
        };
      }
      map[normalizedName].songCount += 1;
    });

    console.log(`Songs with artists: ${songsWithArtists}, without: ${songsWithoutArtists}`);
    console.log(`Unique artists found: ${Object.keys(map).length}`);
    console.log('Artist names:', Object.keys(map).slice(0, 10));

    // Get unique artists, sort by song count, limit to 6
    const result = Object.values(map)
      .sort((a, b) => b.songCount - a.songCount)
      .slice(0, 6)
      .map((artist, index) => ({
        id: artist.name.toLowerCase().replace(/\s+/g, '-'),
        name: artist.name,
        songCount: artist.songCount,
        image: artist.image,
      }));
    
    console.log('Top artists result:', result);
    console.log('=== END TOP ARTISTS ===');
    
    return result;
  }, [allSongs]);

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
            // When user types in search bar, clear selectedArtist
            if (key === "artist") {
              setSelectedArtist(null);
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
            {/* Top Artists - Always visible */}
            <TopArtists 
              artists={topArtists} 
              selectedArtistName={selectedArtist}
              onArtistSelect={(a) => {
                if (a === null) {
                  // Clear selection
                  setSelectedArtist(null);
                } else {
                  // Set selectedArtist (doesn't show in search bar) and clear search bar artist filter
                  setSelectedArtist(a.name);
                  setFilters(p => ({ ...p, artist: "" }));
                }
              }} 
            />
            
            {/* Show selected artist indicator */}
            {selectedArtist && (
              <div className="bg-cyan-500/20 border border-cyan-500/50 rounded-lg flex items-center justify-between" style={{ marginTop: "1rem", padding: "1rem 1rem", minHeight: "2rem" }}>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">🎤</span>
                  <span className="text-white font-semibold">Showing songs by: <span className="text-cyan-300">{selectedArtist}</span></span>
                </div>
                <button
                  onClick={() => setSelectedArtist(null)}
                  className="text-gray-400 hover:text-white text-sm underline"
                >
                  Clear
                </button>
              </div>
            )}
            
            {/* Show search results when filters are active, otherwise show Most Played */}
            <div style={{ marginTop: "2rem", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
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
