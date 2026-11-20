const warmedUrls = new Map();
const connectedOrigins = new Set();

const WARM_BYTES = 1024 * 1024;
const WARM_TIMEOUT_MS = 8000;
const MAX_WARMED_URLS = 6;

function isRemoteMediaUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

/**
 * Open the DNS/TCP/TLS path to the media host without allocating another
 * video decoder. This matters on Samsung TVs, where a hidden second <video>
 * can stop or blank the currently-playing song.
 */
function preconnectMediaOrigin(url) {
  if (typeof document === "undefined" || !isRemoteMediaUrl(url)) return;

  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  if (!origin || connectedOrigins.has(origin)) return;
  connectedOrigins.add(origin);

  const dns = document.createElement("link");
  dns.rel = "dns-prefetch";
  dns.href = origin;
  document.head.appendChild(dns);

  const connection = document.createElement("link");
  connection.rel = "preconnect";
  connection.href = origin;
  connection.crossOrigin = "anonymous";
  document.head.appendChild(connection);
}

function remember(url, promise) {
  warmedUrls.set(url, promise);
  while (warmedUrls.size > MAX_WARMED_URLS) {
    const oldest = warmedUrls.keys().next().value;
    warmedUrls.delete(oldest);
  }
  return promise;
}

/**
 * Warm the first media chunk while the current song is still playing.
 * The exact same signed URL is handed to the player later, allowing the
 * browser to reuse the open connection and, when supported, cached bytes.
 * Failures are deliberately non-fatal because normal video loading remains
 * the authoritative fallback.
 */
export function warmMediaUrl(url) {
  if (!isRemoteMediaUrl(url) || typeof fetch !== "function") {
    return Promise.resolve(false);
  }

  preconnectMediaOrigin(url);
  const existing = warmedUrls.get(url);
  if (existing) return existing;

  const promise = (async () => {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), WARM_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Range: `bytes=0-${WARM_BYTES - 1}` },
        cache: "force-cache",
        credentials: "omit",
        ...(controller ? { signal: controller.signal } : {}),
      });

      const partial = response.status === 206 || Boolean(response.headers.get("content-range"));
      if (partial) {
        await response.arrayBuffer();
      } else if (response.body?.cancel) {
        // Never download an entire song if a media host ignores Range.
        await response.body.cancel();
      }
      console.log("[MEDIA_WARMUP] ready", {
        host: new URL(url).host,
        status: response.status,
        partial,
      });
      return response.ok;
    } catch (error) {
      console.log("[MEDIA_WARMUP] skipped", error?.name || error?.message || String(error));
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();

  return remember(url, promise);
}
