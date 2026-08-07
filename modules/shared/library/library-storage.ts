import { supabase } from '../../../lib/supabase';

const LIBRARY_BUCKET = 'biblioteca';
const SIGNED_URL_TTL_SECONDS = 10 * 60;

export const getLibraryStoragePath = (fileUrl?: string | null): string | null => {
  if (!fileUrl) return null;
  if (!/^https?:\/\//i.test(fileUrl)) return fileUrl.replace(/^\/+/, '');

  try {
    const parsedUrl = new URL(fileUrl);
    const markers = [
      `/storage/v1/object/public/${LIBRARY_BUCKET}/`,
      `/storage/v1/object/sign/${LIBRARY_BUCKET}/`,
      `/storage/v1/object/authenticated/${LIBRARY_BUCKET}/`,
    ];
    const marker = markers.find((candidate) => parsedUrl.pathname.includes(candidate));
    if (!marker) return null;
    return decodeURIComponent(parsedUrl.pathname.split(marker)[1] || '') || null;
  } catch {
    return null;
  }
};

export const resolveLibraryFileUrl = async (fileUrl?: string | null): Promise<string> => {
  const path = getLibraryStoragePath(fileUrl);
  if (!path) return fileUrl || '';

  const { data, error } = await supabase.storage
    .from(LIBRARY_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
};

