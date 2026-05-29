// Playing a silent clip inside the user-gesture handler unlocks audio output
// for the whole session on aggressive WebViews (Android TV blocks audio more
// eagerly than Chrome). Safe to call repeatedly; only the first call does work.

// Minimal valid 44.1kHz mono 16-bit WAV with zero samples.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

let unlocked = false;

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    const a = new Audio(SILENT_WAV);
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
  // Resume a suspended WebAudio context if one exists.
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
