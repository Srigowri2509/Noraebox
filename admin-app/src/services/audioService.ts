type WindowWithWebAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;
const playedSessionEndSounds = new Set<string>();
const pendingSessionEndSounds = new Set<string>();

function getAudioContext(): AudioContext | null {
  const AudioContextClass =
    window.AudioContext || (window as WindowWithWebAudio).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass();
  }

  return sharedAudioContext;
}

export async function unlockAdminAudio(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    await context.resume();
  }

  // A silent, zero-length tone completes the browser's user-gesture audio
  // unlock without making a sound when the operator first touches the page.
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = 0;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.01);
}

async function playPreviousAlarmSound(): Promise<void> {
  const context = getAudioContext();
  if (!context) throw new Error("Web Audio is not supported.");

  if (context.state === "suspended") {
    await context.resume();
  }

  if (context.state !== "running") {
    throw new Error("Browser audio is not unlocked yet.");
  }

  const startAt = context.currentTime + 0.05;
  const beepLength = 0.32;
  const gap = 0.18;

  // Preserve the original four alternating beeps, now used only when the
  // session timer reaches 00:00.
  [880, 660, 880, 660].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const beepStart = startAt + index * (beepLength + gap);
    const beepEnd = beepStart + beepLength;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, beepStart);
    gain.gain.setValueAtTime(0.001, beepStart);
    gain.gain.exponentialRampToValueAtTime(0.22, beepStart + 0.025);
    gain.gain.setValueAtTime(0.22, beepEnd - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, beepEnd);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(beepStart);
    oscillator.stop(beepEnd + 0.01);
  });
}

export async function playSessionFinishedSound(sessionId: string): Promise<void> {
  const key = String(sessionId || "unknown-session");
  if (playedSessionEndSounds.has(key) || pendingSessionEndSounds.has(key)) return;

  pendingSessionEndSounds.add(key);
  try {
    await playPreviousAlarmSound();
    playedSessionEndSounds.add(key);
  } finally {
    pendingSessionEndSounds.delete(key);
  }
}
