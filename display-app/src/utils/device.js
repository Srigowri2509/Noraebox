/** Capacitor display APK running on Android hardware. */
export function isNativeAndroidDisplay() {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.getPlatform?.() === "android") return true;
  if (window.Capacitor?.isNativePlatform?.() && /android/i.test(navigator.userAgent || "")) {
    return true;
  }
  const href = String(window.location?.href || "");
  return /android/i.test(navigator.userAgent || "") && href.includes("localhost");
}

/**
 * Emergency fallback: skip transition clips and jump straight to the next song.
 * Off by default — set VITE_LOW_POWER=true only if a device cannot play transitions.
 */
export function isLowPowerDevice() {
  const forced = import.meta.env?.VITE_LOW_POWER;
  return forced === "true" || forced === "1";
}

/** Next-song file cache (native Android TV only). On by default; set VITE_CACHE_ENABLED=false to disable. */
export function isCacheEnabled() {
  if (!isNativeAndroidDisplay()) return false;
  const flag = import.meta.env?.VITE_CACHE_ENABLED;
  if (flag === "false" || flag === "0") return false;
  return true;
}
