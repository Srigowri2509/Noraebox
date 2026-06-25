export const API_BASE = import.meta.env.VITE_API_URL || "http://16.112.20.5:8000";

export async function api(path, options = {}) {
  // Android TV WebViews often break fetch() when AbortController/signal is used.
  // Use a plain fetch with a single Promise.race timeout instead.
  const TIMEOUT_MS =
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "")
      ? 30000
      : 20000;

  let hardTimer;
  const hardTimeout = new Promise((_, reject) => {
    hardTimer = setTimeout(
      () => reject(new Error("Request timeout - backend may be down or unreachable")),
      TIMEOUT_MS
    );
  });

  try {
    const res = await Promise.race([
      fetch(`${API_BASE}${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        ...options
      }),
      hardTimeout
    ]);
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
