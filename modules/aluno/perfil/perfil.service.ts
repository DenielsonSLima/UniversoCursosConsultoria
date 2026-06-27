import { supabase } from '../../../lib/supabase';
import { parceirosService } from '../../gestor/parceiros/parceiros.service';
import { PerfilData, PerfilUpdatePayload } from './perfil.types';

export const alunoPerfilKeys = {
  profile: (alunoId: string) => ['aluno-perfil', alunoId] as const,
  documents: (alunoId: string) => ['aluno-documentos', alunoId] as const,
};

export const alunoPerfilService = {
  getProfile: (alunoId: string) => parceirosService.getById(alunoId),

  getDocuments: (alunoId: string) => parceirosService.getDocumentos(alunoId),

  updateProfile: (alunoId: string, currentProfile: PerfilData, payload: PerfilUpdatePayload) => {
    const { email, cpf, cnpj, cpf_cnpj, nome, nomeCompleto, ...editableProfile } = currentProfile || {};
    return parceirosService.update(alunoId, { ...editableProfile, ...payload });
  },

  uploadDocument: (alunoId: string, docName: string, file: File) =>
    parceirosService.uploadDocumento(alunoId, docName, file),

  async uploadProfilePhoto(alunoId: string, currentProfile: PerfilData, file: File) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Envie uma imagem em JPG, PNG ou WEBP.');
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `${alunoId}/perfil/foto_${Date.now()}.${fileExt}`;

    const { data, error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(data.path);
    const publicUrl = urlData.publicUrl;

    const { email, cpf, cnpj, cpf_cnpj, nome, nomeCompleto, ...editableProfile } = currentProfile || {};
    await parceirosService.update(alunoId, { ...editableProfile, foto: publicUrl });
    return publicUrl;
  },
};
