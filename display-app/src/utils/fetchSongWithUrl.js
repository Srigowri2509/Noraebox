import { api, API_BASE } from "../api";

/** Fetch song metadata and resolve a directly-playable (S3) media URL. */
export async function fetchSongWithUrl(songId) {
  try {
    const songData = await api(`/songs/${songId}`);
    let videoUrl = songData.file_url || songData.video_url || songData.url || "";
    if (videoUrl) {
      const needsSign =
        !videoUrl.startsWith("http://") && !videoUrl.startsWith("https://");
      if (needsSign) {
        try {
          const signed = await api(`/songs/${songId}/signed-url`);
          videoUrl = signed.signed_url || signed.url || videoUrl;
        } catch {
          /* use file_url as-is */
        }
      }
      return { ...songData, id: songId, videoUrl };
    }
    const base = (API_BASE || "").replace(/\/$/, "");
    return { ...songData, id: songId, videoUrl: `${base}/songs/${songId}/stream` };
  } catch (err) {
    console.error("[DISPLAY] fetch song failed:", err);
    return null;
  }
}
