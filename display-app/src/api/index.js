export const API_BASE = import.meta.env.VITE_API_URL || "http://98.130.120.10:8000";

export async function api(path, options = {}) {
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
    clearTimeout(timeoutId);
    
    const text = await res.text();
    try {
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.detail || data?.message || `API error: ${res.status}`);
      return data;
    } catch (e) {
      if (res.ok) return text;
      throw e;
    }
  } catch (error) {
    clearTimeout(timeoutId);
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

