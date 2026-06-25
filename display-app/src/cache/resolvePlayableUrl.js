import { isCacheEnabled } from "../utils/device";
import { fetchSongWithUrl } from "../utils/fetchSongWithUrl";
import { getLocalUrl } from "./nextSongCache";

/**
 * Resolve a playable video URL for handoff paths.
 * When cache is disabled, identical to fetchSongWithUrl (Build 64).
 */
export async function resolvePlayableUrl(songId) {
  if (!isCacheEnabled()) {
    return fetchSongWithUrl(songId);
  }

  const localUrl = await getLocalUrl(songId);
  if (localUrl) {
    console.log("[CACHE] hit", songId);
    return { id: songId, videoUrl: localUrl, source: "local" };
  }

  console.log("[CACHE] miss", songId);
  const remote = await fetchSongWithUrl(songId);
  if (!remote?.videoUrl) return null;
  return { ...remote, source: "remote" };
}
