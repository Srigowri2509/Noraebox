type WindowWithWebAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;
const playedSessionEndSounds = new Set<string>();
const pendingSessionEndSounds = new Set<string>();
const playedFoodOrderSounds = new Set<string>();
const pendingFoodOrderSounds = new Set<string>();
const queuedFoodOrderSounds = new Set<string>();

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

  // Browsers block audio until the operator interacts with the page. If an
  // order arrived first, play its queued alert as soon as that first click or
  // key press unlocks audio.
  const queuedOrderIds = [...queuedFoodOrderSounds];
  queuedFoodOrderSounds.clear();
  if (queuedOrderIds.length > 0) {
    await playFoodOrderSound(queuedOrderIds[0]);
    queuedOrderIds.slice(1).forEach((orderId) => playedFoodOrderSounds.add(orderId));
  }
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

export async function playFoodOrderSound(orderId?: string): Promise<void> {
  const key = String(orderId || "new-food-order");
  if (playedFoodOrderSounds.has(key) || pendingFoodOrderSounds.has(key)) return;

  pendingFoodOrderSounds.add(key);
  const context = getAudioContext();
  if (!context) {
    pendingFoodOrderSounds.delete(key);
    throw new Error("Web Audio is not supported.");
  }

  try {
    if (context.state === "suspended") {
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 150)),
      ]);
    }

    if (context.state !== "running") {
      queuedFoodOrderSounds.add(key);
      throw new Error("Browser audio is not unlocked yet.");
    }

    const startAt = context.currentTime + 0.02;

    // Two bright service-bell strikes are intentionally unlike the alternating
    // square-wave beeps used when a session finishes.
    [startAt, startAt + 0.42].forEach((strikeAt) => {
      [1046.5, 2093, 3139.5].forEach((frequency, harmonicIndex) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const strikeEnd = strikeAt + 0.55;
        const peak = [0.35, 0.14, 0.06][harmonicIndex];

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, strikeAt);
        gain.gain.setValueAtTime(0.001, strikeAt);
        gain.gain.exponentialRampToValueAtTime(peak, strikeAt + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, strikeEnd);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(strikeAt);
        oscillator.stop(strikeEnd + 0.01);
      });
    });

    playedFoodOrderSounds.add(key);
    queuedFoodOrderSounds.delete(key);
  } catch (error) {
    if (context.state !== "running") queuedFoodOrderSounds.add(key);
    throw error;
  } finally {
    pendingFoodOrderSounds.delete(key);
  }
}
