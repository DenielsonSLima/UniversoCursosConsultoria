import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

interface PartnerWithPhoto {
  id?: string | null;
  tipo?: string | null;
  foto_url?: string | null;
}

const getTrustedGoogleAvatarUrl = (user: User): string | null => {
  const googleIdentity = user.identities?.find((identity) => identity.provider === 'google');
  const identityData = googleIdentity?.identity_data;
  const rawUrl = identityData?.avatar_url || identityData?.picture;
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;

  try {
    const avatarUrl = new URL(rawUrl.trim());
    if (avatarUrl.protocol !== 'https:' || avatarUrl.hostname !== 'lh3.googleusercontent.com') {
      return null;
    }
    return avatarUrl.toString();
  } catch {
    return null;
  }
};

export const syncAlunoGoogleAvatar = async <T extends PartnerWithPhoto>(
  partner: T,
  user: User,
): Promise<T> => {
  if (!partner?.id || partner.tipo !== 'Aluno' || partner.foto_url?.trim()) {
    return partner;
  }

  const avatarUrl = getTrustedGoogleAvatarUrl(user);
  if (!avatarUrl) return partner;

  let updateQuery = supabase
    .from('parceiros')
    .update({ foto_url: avatarUrl })
    .eq('id', partner.id);

  updateQuery = partner.foto_url == null
    ? updateQuery.is('foto_url', null)
    : updateQuery.eq('foto_url', partner.foto_url);

  const { data, error } = await updateQuery
    .select('foto_url')
    .maybeSingle();

  if (error) {
    console.warn('Não foi possível sincronizar a foto do Google no perfil do aluno.');
    return partner;
  }

  return data?.foto_url
    ? { ...partner, foto_url: data.foto_url }
    : partner;
};
