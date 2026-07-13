const SOUND_KEY = 'whatsapp_notification_sound';
let audioContext: AudioContext | null = null;

export const isWhatsAppSoundEnabled = () =>
  localStorage.getItem(SOUND_KEY) !== 'off';

export const setWhatsAppSoundEnabled = (enabled: boolean) => {
  localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
};

export const playIncomingWhatsAppSound = async () => {
  if (!isWhatsAppSoundEnabled()) return;

  try {
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(540, audioContext.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch {
    // Browser audio policies can block sound before the first user gesture.
  }
};
