const NOTIFICATION_SOUND_URL = "/notification.mp3";

type WindowWithWebAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;

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

function playFallbackTone(): void {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.4);
}

export async function playTenMinuteAlarm(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    await context.resume();
  }

  if (context.state !== "running") {
    throw new Error("Browser audio is not unlocked yet.");
  }

  const startAt = context.currentTime + 0.05;
  const beepLength = 0.32;
  const gap = 0.18;

  // Four alternating beeps are distinct from the short session-finished
  // notification and work even when the MP3 asset is unavailable.
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

export async function playNotificationSound(): Promise<void> {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.preload = "auto";
    audio.volume = 0.9;
    await audio.play();
  } catch (error) {
    console.warn("Notification sound file could not play, using fallback tone.", error);
    try {
      playFallbackTone();
    } catch (fallbackError) {
      console.warn("Notification fallback tone could not play.", fallbackError);
    }
  }
}
