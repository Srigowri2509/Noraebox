import { getConfig } from '../config';

// Get API URL from runtime config (can be updated remotely)
// This function is called each time to get the latest config
export function getApiBase() {
  // Check for environment variable first (for development)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Get from runtime config (can be updated remotely)
  const config = getConfig();
  return config.api_url || "http://16.112.69.4:8000";
}

// Export as function so it's always fresh
export const API_BASE = getApiBase();

export async function api(path, options = {}) {
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    // Get fresh API base each time (in case config was updated)
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}${path}`, {
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
      throw new Error('Request timeout - backend may be down');
    }
    // Check for network errors
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Failed to fetch') || 
        errorMsg.includes('NetworkError') || 
        errorMsg.includes('Network request failed') ||
        errorMsg.includes('ERR_CONNECTION_REFUSED') ||
        errorMsg.includes('ERR_INTERNET_DISCONNECTED')) {
      throw new Error('Cannot connect to backend. Is the server running?');
    }
    throw error;
  }
}

