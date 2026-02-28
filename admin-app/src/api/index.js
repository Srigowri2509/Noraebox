export const API_BASE = import.meta.env.VITE_API_URL || "http://98.130.120.10:8000";

export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const text = await res.text();
  try {
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.detail || data?.message || "API error");
    return data;
  } catch (e) {
    if (res.ok) return text;
    throw e;
  }
}

