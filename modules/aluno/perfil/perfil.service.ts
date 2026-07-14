import { parceirosService } from '../../gestor/parceiros/parceiros.service';
import { PerfilData, PerfilUpdatePayload } from './perfil.types';
import { updateAlunoEditableProfile } from './perfil-update.service';

export const alunoPerfilKeys = {
  profile: (alunoId: string) => ['aluno-perfil', alunoId] as const,
  documents: (alunoId: string) => ['aluno-documentos', alunoId] as const,
  vacinaContexts: (alunoId: string) => ['aluno-perfil-vacina-contexts', alunoId] as const,
  vacinas: (alunoId: string) => ['aluno-perfil-vacinas', alunoId] as const,
};

export const alunoPerfilService = {
  getProfile: (alunoId: string) => parceirosService.getById(alunoId),

  getDocuments: (alunoId: string) => parceirosService.getDocumentos(alunoId),

  updateProfile: (alunoId: string, _currentProfile: PerfilData, payload: PerfilUpdatePayload) =>
    updateAlunoEditableProfile(alunoId, payload),

  uploadDocument: (alunoId: string, docName: string, file: File) =>
    parceirosService.uploadDocumento(alunoId, docName, file),

  uploadProfilePhoto: (alunoId: string, currentProfile: PerfilData, file: File) =>
    parceirosService.uploadProfilePhoto(alunoId, currentProfile, file),
};
