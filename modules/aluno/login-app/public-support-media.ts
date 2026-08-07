export const PUBLIC_SUPPORT_MAX_FILE_BYTES = 12 * 1024 * 1024;

export const PUBLIC_SUPPORT_ACCEPTED_FILES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav',
].join(',');

const allowedMimeTypes = new Set(PUBLIC_SUPPORT_ACCEPTED_FILES.split(','));
const allowedExtensions = /\.(?:jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?|webm|ogg|oga|mp4|m4a|mp3|mpeg|wav)$/i;
const audioExtensions = /\.(?:webm|ogg|oga|mp4|m4a|mp3|mpeg|wav)$/i;
const imageExtensions = /\.(?:jpe?g|png|gif|webp)$/i;

export const formatPublicSupportFileSize = (bytes: number) => (
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KB`
);

export const validatePublicSupportFile = (file: File) => {
  if (file.size <= 0) return 'O arquivo selecionado está vazio.';
  if (file.size > PUBLIC_SUPPORT_MAX_FILE_BYTES) return 'O arquivo deve ter no máximo 12 MB.';
  const mimeType = file.type.toLowerCase();
  if (!allowedMimeTypes.has(mimeType) || !allowedExtensions.test(file.name)) {
    return 'Formato não aceito. Envie imagem, PDF, Office ou áudio.';
  }
  return null;
};

export const getPublicSupportAttachmentName = (path?: string | null) => {
  const fallback = 'anexo';
  if (!path) return fallback;
  const lastSegment = path.split('/').pop();
  if (!lastSegment) return fallback;
  try {
    return decodeURIComponent(lastSegment).replace(/^[0-9a-f-]{16,}-/i, '') || fallback;
  } catch {
    return lastSegment.replace(/^[0-9a-f-]{16,}-/i, '') || fallback;
  }
};

export const getSafePublicSupportAttachmentUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
};

export const isPublicSupportAudio = (path?: string | null) => audioExtensions.test(path || '');
export const isPublicSupportImage = (path?: string | null) => imageExtensions.test(path || '');

let notificationContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  notificationContext ||= new AudioContextClass();
  return notificationContext;
};

export const unlockPublicSupportSound = async () => {
  const context = getAudioContext();
  if (context?.state === 'suspended') await context.resume().catch(() => undefined);
};

export const playPublicSupportMessageSound = async () => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') await context.resume().catch(() => undefined);
  if (context.state !== 'running') return;

  const now = context.currentTime;
  [0, 0.11].forEach((delay, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(index === 0 ? 660 : 880, now + delay);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + 0.13);
  });
};
