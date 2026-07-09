const NOTIFICATION_SOUND_URL = "/notification.mp3";

type WindowWithWebAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function playFallbackTone(): void {
  const AudioContextClass =
    window.AudioContext || (window as WindowWithWebAudio).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
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
