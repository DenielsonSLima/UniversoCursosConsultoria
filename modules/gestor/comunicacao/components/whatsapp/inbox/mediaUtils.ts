import { WhatsAppMessage } from '../whatsapp.types';

export const mediaPayloadFor = (message: WhatsAppMessage) => {
  const raw = message.raw_payload || {};
  const type = String(message.message_type || raw.type || '').toLowerCase();
  const payload = raw[type] || raw.message?.[type] || raw.media || {};
  const id = payload?.id || raw.media_id || raw.mediaId || null;

  return {
    id: id ? String(id) : null,
    type,
    link: payload?.link || raw.media_url || raw.mediaUrl || null,
    caption: payload?.caption || message.conteudo,
    filename: payload?.filename || raw.filename || `${type || 'arquivo'}-${message.id}`,
    mime: payload?.mime_type || raw.mime_type || '',
    transcription: raw.transcription || raw.transcript || '',
  };
};

export const isMediaMessage = (message: WhatsAppMessage) =>
  ['image', 'audio', 'document'].includes(String(message.message_type || '').toLowerCase());

export const isMediaPlaceholder = (content?: string | null) =>
  /^\[(imagem|image|foto|audio|áudio|documento|document)\]$/i.test(String(content || '').trim());

export const mediaKindFromFile = (file: File) => {
  if (file.type.startsWith('image/')) return 'image' as const;
  if (file.type.startsWith('audio/')) return 'audio' as const;
  return 'document' as const;
};

export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const mediaDataUrl = (base64: string, mime: string) =>
  `data:${mime || 'application/octet-stream'};base64,${base64}`;
