import { useEffect, useState } from "react";
import { api, API_BASE } from "../api";

export default function useSongSearch() {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        console.log('Fetching songs from backend...');
        console.log('API Base URL:', API_BASE);
        console.log('Full endpoint:', `${API_BASE}/songs`);
        const res = await api('/songs');
        console.log("RAW /songs RESPONSE:", res);
        console.log("Response type:", typeof res);
        console.log("Is array?", Array.isArray(res));
        
        // Handle different response formats - backend should return flat array
        let songs = [];
        if (Array.isArray(res)) {
          songs = res;
        } else if (res?.data && Array.isArray(res.data)) {
          songs = res.data;
        } else if (res?.data && !Array.isArray(res.data)) {
          songs = [res.data];
        } else {
          console.error("Unexpected response format:", res);
          songs = [];
        }
        
        console.log("PARSED SONGS:", songs);
        console.log('Processed songs count:', songs.length);
        if (songs.length > 0) {
          console.log('First song sample:', songs[0]);
          console.log('Song fields check:', {
            id: songs[0].id,
            title: songs[0].title,
            has_artist_name: !!songs[0].artist_name,
            has_artist_image: !!songs[0].artist_image,
            artist_name: songs[0].artist_name,
            artist_image: songs[0].artist_image,
            language: songs[0].language,
            all_keys: Object.keys(songs[0])
          });
        } else {
          console.error("❌ NO SONGS IN RESPONSE - Backend returned empty array or wrong format");
        }
        
        if (mounted) setAll(songs);
      } catch (err) {
        console.error('Error fetching songs:', err);
        console.error('Error details:', err.message, err.stack);
        if (mounted) setAll([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  const search = (q) => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (x) =>
        (x.title || "").toLowerCase().includes(s) ||
        (x.artist || "").toLowerCase().includes(s) ||
        (x.album || "").toLowerCase().includes(s)
    );
  };

  return { all, loading, search };
}
