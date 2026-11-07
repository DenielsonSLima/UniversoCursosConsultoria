import type { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { profilePhotoPath } from './profile-photo-transport';

const PHOTO_BUCKET = 'fotos-perfil';
const SIGNED_PREFIX = `/storage/v1/object/sign/${PHOTO_BUCKET}/`;
const TTL_SECONDS = 300;

const ownPhotoPath = (src: string, origin: string): string | null => {
  try {
    const url = new URL(src);
    if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith(SIGNED_PREFIX)) return null;
    return profilePhotoPath(`profile-photo://${decodeURIComponent(url.pathname.slice(SIGNED_PREFIX.length))}`);
  } catch {
    return null;
  }
};

const currentSessionScope = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session?.access_token || !session.user.id) return null;
  const bytes = new TextEncoder().encode(`${session.user.id}\n${session.access_token}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/** One UI recovery uses the current SDK session; only concurrent identical requests share work. */
export async function recoverPartnerPhoto(queryClient: QueryClient, src: string): Promise<string | null> {
  try {
    const projectUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.REACT_APP_SUPABASE_URL;
    const origin = new URL(projectUrl).origin;
    const path = ownPhotoPath(src, origin);
    if (!path) return null;
    const scope = await currentSessionScope();
    if (!scope) return null;
    return await queryClient.fetchQuery({
      queryKey: ['partner-photo-recovery', origin, path, scope],
      staleTime: 0,
      gcTime: 0,
      retry: false,
      queryFn: async () => {
        if (await currentSessionScope() !== scope) return null;
        const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, TTL_SECONDS);
        if (error || await currentSessionScope() !== scope) return null;
        return data?.signedUrl && ownPhotoPath(data.signedUrl, origin) === path ? data.signedUrl : null;
      },
    });
  } catch {
    return null;
  }
}
