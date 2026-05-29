export const API_BASE = import.meta.env.VITE_API_URL || "http://16.112.20.5:8000";

export async function api(path, options = {}) {
  const TIMEOUT_MS = 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  }, TIMEOUT_MS);

  // Hard timeout that settles the promise even if the WebView ignores
  // AbortController. Older Android TV WebViews don't always honor fetch abort,
  // which would otherwise hang the request — and any poll loop awaiting it —
  // forever. Promise.race guarantees api() always resolves or rejects.
  let hardTimer;
  const hardTimeout = new Promise((_, reject) => {
    hardTimer = setTimeout(
      () => reject(new Error("Request timeout - backend may be down or unreachable")),
      TIMEOUT_MS + 1000
    );
  });

  try {
    const res = await Promise.race([
      fetch(`${API_BASE}${path}`, {
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        ...options
      }),
      hardTimeout
    ]);
    clearTimeout(timeoutId);
    clearTimeout(hardTimer);

    const text = await res.text();
    try {
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new Error(
          (data && data.detail) ||
          (data && data.message) ||
          `API error: ${res.status}`
        );
      }
      return data;
    } catch (e) {
      if (res.ok) return text;
      throw e;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    clearTimeout(hardTimer);
    // Handle different error types
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - backend may be down or unreachable');
    }
    // Check for network errors
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Failed to fetch') || 
        errorMsg.includes('NetworkError') || 
        errorMsg.includes('Network request failed') ||
        errorMsg.includes('ERR_CONNECTION_REFUSED') ||
        errorMsg.includes('ERR_INTERNET_DISCONNECTED')) {
      throw new Error(`Cannot connect to backend at ${API_BASE}. Is the server running?`);
    }
    throw error;
  }
}
