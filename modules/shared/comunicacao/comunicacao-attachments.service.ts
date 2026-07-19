import { supabase } from '../../../lib/supabase';

const ATTACHMENT_BUCKET = 'anexos';
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const SIGNED_URL_CACHE_MS = 8 * 60 * 1000;

interface SignedUrlCacheEntry {
  expiresAt: number;
  url: string;
}

export interface CommunicationAttachmentRecord {
  anexo_path?: string | null;
  anexo_url?: string | null;
  anexo_display_url?: string | null;
}

export type CommunicationAttachmentActor =
  | { type: 'aluno'; id: string }
  | { type: 'professor'; id: string }
  | { type: 'gestor' };

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

const safeFileName = (name: string) => {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.slice(-120) || 'anexo';
};

const decodeStoragePath = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const getCommunicationAttachmentPath = (
  attachment: CommunicationAttachmentRecord,
): string | null => {
  if (attachment.anexo_path) return attachment.anexo_path;

  const legacyUrl = String(attachment.anexo_url || '').trim();
  if (!legacyUrl) return null;
  if (!/^https?:\/\//i.test(legacyUrl)) return legacyUrl.replace(/^\/+/, '');

  try {
    const url = new URL(legacyUrl);
    const markers = [
      '/storage/v1/object/public/anexos/',
      '/storage/v1/object/sign/anexos/',
      '/storage/v1/object/authenticated/anexos/',
    ];
    const marker = markers.find((candidate) => url.pathname.includes(candidate));
    if (!marker) return null;
    return decodeStoragePath(url.pathname.split(marker)[1] || '') || null;
  } catch {
    return null;
  }
};

export const getCommunicationAttachmentDisplayUrl = (
  attachment: CommunicationAttachmentRecord,
) => attachment.anexo_display_url || null;

export const getCommunicationAttachmentFileName = (
  attachment: CommunicationAttachmentRecord,
) => {
  const path = getCommunicationAttachmentPath(attachment);
  if (path) return decodeStoragePath(path.split('/').pop() || 'anexo');

  return 'anexo';
};

export const resolveCommunicationAttachmentUrls = async <T extends CommunicationAttachmentRecord>(
  records: T[],
): Promise<T[]> => {
  const now = Date.now();
  const paths = [...new Set(records.map(getCommunicationAttachmentPath).filter(Boolean))] as string[];
  const missingPaths = paths.filter((path) => {
    const cached = signedUrlCache.get(path);
    return !cached || cached.expiresAt <= now;
  });

  if (missingPaths.length > 0) {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(missingPaths, SIGNED_URL_TTL_SECONDS);
    // Um anexo legado ausente não deve impedir a abertura do restante do chat.
    // A política de SELECT continua sendo aplicada pelo Storage antes de assinar.
    if (error) {
      console.warn('Não foi possível assinar alguns anexos da conversa:', error);
    }

    (data || []).forEach((item) => {
      if (!item.signedUrl) return;
      signedUrlCache.set(item.path, {
        url: item.signedUrl,
        expiresAt: now + SIGNED_URL_CACHE_MS,
      });
    });
  }

  return records.map((record) => {
    const path = getCommunicationAttachmentPath(record);
    return {
      ...record,
      anexo_display_url: path
        ? signedUrlCache.get(path)?.url || null
        : null,
    };
  });
};

export const uploadCommunicationAttachment = async ({
  actor,
  chatId,
  file,
}: {
  actor: CommunicationAttachmentActor;
  chatId: string;
  file: File;
}) => {
  if (file.type.toLowerCase().includes('image/svg+xml') || /\.svg$/i.test(file.name.trim())) {
    throw new Error('Arquivos SVG não são permitidos em anexos.');
  }
  const actorSegment = actor.type === 'gestor' ? 'gestor' : `${actor.type}/${actor.id}`;
  const path = [
    'comunicacao',
    'chats',
    chatId,
    actorSegment,
    `${crypto.randomUUID()}-${safeFileName(file.name)}`,
  ].join('/');
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return path;
};

export const removeCommunicationAttachmentPaths = async (paths: string[]) => {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return;

  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).remove(uniquePaths);
  if (error) throw error;
  uniquePaths.forEach((path) => signedUrlCache.delete(path));
};

export const removeCommunicationAttachments = async (
  records: CommunicationAttachmentRecord[],
) => removeCommunicationAttachmentPaths(
  records.map(getCommunicationAttachmentPath).filter(Boolean) as string[],
);
