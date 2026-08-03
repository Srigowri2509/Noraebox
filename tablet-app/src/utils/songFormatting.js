export function parseArtists(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function formatSongSubtitle(song = {}) {
  const artists = parseArtists(song.artists);
  const singers = artists
    .filter((artist) => artist.role === "singer")
    .map((artist) => artist.name)
    .filter(Boolean);
  const composers = artists
    .filter((artist) => artist.role === "composer")
    .map((artist) => artist.name)
    .filter(Boolean);

  const main = singers.join(", ") || composers.join(", ") || song.artist_name || song.artist || "";
  return `${main}${song.album ? ` • ${song.album}` : ""}`;
}
