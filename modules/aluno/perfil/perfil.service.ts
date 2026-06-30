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

  uploadProfilePhoto: (alunoId: string, currentProfile: PerfilData, file: File) =>
    parceirosService.uploadProfilePhoto(alunoId, currentProfile, file),
};
