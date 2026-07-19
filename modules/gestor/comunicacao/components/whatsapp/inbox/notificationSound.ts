const SOUND_KEY = 'whatsapp_notification_sound';
let audioContext: AudioContext | null = null;
let unlockCleanup: (() => void) | null = null;

const getAudioContext = () => {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
};

export const isWhatsAppSoundEnabled = () =>
  localStorage.getItem(SOUND_KEY) !== 'off';

export const setWhatsAppSoundEnabled = (enabled: boolean) => {
  localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
};

export const playIncomingWhatsAppSound = async () => {
  if (!isWhatsAppSoundEnabled()) return;

  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === 'suspended') await context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
  } catch {
    // Browser audio policies can block sound before the first user gesture.
  }
};

export const installWhatsAppSoundUnlock = () => {
  if (unlockCleanup) return unlockCleanup;

  const unlock = async () => {
    try {
      const context = getAudioContext();
      if (context?.state === 'suspended') await context.resume();
    } catch {
      // A próxima interação do usuário fará uma nova tentativa.
    }
  };
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
  events.forEach((event) => window.addEventListener(event, unlock, { passive: true }));
  unlockCleanup = () => {
    events.forEach((event) => window.removeEventListener(event, unlock));
    unlockCleanup = null;
  };
  return unlockCleanup;
};
