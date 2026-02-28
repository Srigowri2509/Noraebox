import React, { useState } from "react";

export default function TopArtists({ artists = [], onArtistSelect, selectedArtistName = null }) {
  const [localSelectedArtist, setLocalSelectedArtist] = useState(null);

  const handleArtistClick = (artist) => {
    const artistName = artist.name || artist.artist;
    // If clicking the same artist, deselect
    if (localSelectedArtist === artistName || selectedArtistName === artistName) {
      setLocalSelectedArtist(null);
      if (onArtistSelect) {
        onArtistSelect(null); // Clear selection
      }
      return;
    }
    // Select the artist
    setLocalSelectedArtist(artistName);
    if (onArtistSelect) {
      onArtistSelect(artist);
    }
  };
  
  // Use parent's selectedArtistName if provided, otherwise use local state
  const displaySelectedArtist = selectedArtistName !== null ? selectedArtistName : localSelectedArtist;

  // Only use actual artists from database - no fallback demo data
  const list = artists || [];


  return (
    <section>
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sky-300 text-xl">🎵</span>
        <h3 className="text-white font-semibold text-lg">Top Artists</h3>
      </div>

      {list.length === 0 ? (
        <div className="text-slate-400 py-6 text-center">
          No artists found. Add songs to your database to see artists here.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {list.map((a, i) => {
          const artistName = a.name || a.artist;
          const songCount = a.songCount || a.count || 0;
          return (
            <div
              key={i}
              onClick={() => {
                handleArtistClick(a);
                if (onArtistSelect) {
                  onArtistSelect(a);
                }
              }}
              className={`rounded-lg border bg-slate-800/80 border-slate-600 p-3 cursor-pointer hover:-translate-y-1 transition-transform shadow-md ${
                displaySelectedArtist === artistName ? "border-sky-400 shadow-sky-400/20" : ""
              }`}
            >
              <div className="aspect-square w-full rounded-lg bg-slate-700/70 flex items-center justify-center mb-2 overflow-hidden object-contain relative">
                {a.image && a.image !== "/default-artist.jpg" ? (
                  <img
                    src={a.image}
                    alt={artistName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.log(`Failed to load image: ${a.image}`);
                      e.target.style.display = 'none';
                    }}
                  />
                ) : null}
                {(!a.image || a.image === "/default-artist.jpg") && (
                  <span className="text-4xl text-slate-300">🎤</span>
                )}
              </div>
              <div className="text-white font-bold text-sm truncate text-center mb-1">
                {artistName}
              </div>
              <div className="text-slate-400 text-xs text-center">
                {songCount} songs
              </div>
            </div>
          );
        })}
        </div>
      )}

    </section>
  );
}
