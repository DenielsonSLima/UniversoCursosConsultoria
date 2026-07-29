import { buildAuthRedirectUrl } from '../../../lib/app-url';
import { supabase } from '../../../lib/supabase';
import {
  EmailUpdateResult,
  MeuPerfilGestorData,
  MeuPerfilGestorUpdate,
} from './meu-perfil.types';

const AVATAR_BUCKET = 'avatares-perfil';
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
const ACCEPTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const normalizeProfileRow = (row: any): MeuPerfilGestorData => ({
  id: String(row.id),
  nome: String(row.nome || ''),
  email: String(row.email || ''),
  telefone: row.telefone ? String(row.telefone) : null,
  fotoPath: row.foto_path ? String(row.foto_path) : null,
});

const getAuthenticatedAvatarPath = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Sua sessão expirou. Entre novamente para alterar a foto.');
  }

  return `${data.user.id}/avatar/${crypto.randomUUID()}`;
};

const validateAvatar = (file: File) => {
  if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
    throw new Error('Envie uma imagem em JPG, PNG ou WEBP.');
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }
};

export const meuPerfilService = {
  async saveProfile(input: MeuPerfilGestorUpdate): Promise<MeuPerfilGestorData> {
    const { data, error } = await supabase.rpc('salvar_meu_perfil_gestor', {
      p_nome: input.nome.trim(),
      p_telefone: input.telefone.trim() || null,
      p_foto_path: input.fotoPath,
    });

    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('O perfil não foi retornado após a atualização.');
    return normalizeProfileRow(row);
  },

  async saveAvatar(fotoPath: string | null): Promise<MeuPerfilGestorData> {
    const { data, error } = await supabase.rpc('salvar_meu_avatar_gestor', {
      p_foto_path: fotoPath,
    });

    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('O perfil não foi retornado após a atualização da foto.');
    return normalizeProfileRow(row);
  },

  async createAvatarUrl(path?: string | null): Promise<string | null> {
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.warn('Não foi possível carregar a foto privada do perfil.', error);
      return null;
    }

    const separator = data.signedUrl.includes('?') ? '&' : '?';
    return `${data.signedUrl}${separator}v=${Date.now()}`;
  },

  async uploadAvatar(
    file: File,
    currentPath?: string | null,
  ): Promise<MeuPerfilGestorData> {
    validateAvatar(file);
    const path = await getAuthenticatedAvatarPath();
    const storage = supabase.storage.from(AVATAR_BUCKET);
    const { error: uploadError } = await storage.upload(path, file, {
      cacheControl: '60',
      contentType: file.type,
      upsert: true,
    });

    if (uploadError) {
      throw new Error(uploadError.message || 'Não foi possível enviar a foto.');
    }

    try {
      const updatedProfile = await this.saveAvatar(path);
      if (currentPath && currentPath !== path) {
        const { error: cleanupError } = await storage.remove([currentPath]);
        if (cleanupError) {
          console.warn('A nova foto foi salva, mas a anterior não pôde ser removida.', cleanupError);
        }
      }
      return updatedProfile;
    } catch (error) {
      await storage.remove([path]).catch(() => undefined);
      throw error;
    }
  },

  async removeAvatar(
    currentPath?: string | null,
  ): Promise<MeuPerfilGestorData> {
    const updatedProfile = await this.saveAvatar(null);
    if (currentPath) {
      const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([currentPath]);
      if (error) {
        console.warn('O perfil foi atualizado, mas o arquivo anterior não pôde ser removido.', error);
      }
    }
    return updatedProfile;
  },

  async requestEmailUpdate(newEmail: string): Promise<EmailUpdateResult> {
    const normalizedEmail = newEmail.trim().toLowerCase();
    const { data, error } = await supabase.auth.updateUser(
      { email: normalizedEmail },
      { emailRedirectTo: buildAuthRedirectUrl('/gestor') },
    );

    if (error) throw new Error(error.message);
    const effectiveEmail = data.user?.email?.trim().toLowerCase() || normalizedEmail;

    return {
      email: effectiveEmail,
      pendingConfirmation: effectiveEmail !== normalizedEmail,
    };
  },
};
