import { parceirosService } from '../../gestor/parceiros/parceiros.service';
import { PerfilData, PerfilUpdatePayload } from './perfil.types';
import { updateAlunoEditableProfile } from './perfil-update.service';
import { documentosAlunoV2Service } from '../../shared/documentos-aluno/documentos-aluno.service';
import { documentosAlunoKeys } from '../../shared/documentos-aluno/documentos-aluno.query-keys';

export const alunoPerfilKeys = {
  profile: (alunoId: string) => ['aluno-perfil', alunoId] as const,
  documents: (alunoId: string) => documentosAlunoKeys.painel(alunoId, 'aluno'),
  vacinaContexts: (alunoId: string) => ['aluno-perfil-vacina-contexts', alunoId] as const,
  vacinas: (alunoId: string) => ['aluno-perfil-vacinas', alunoId] as const,
};

export const alunoPerfilService = {
  getProfile: (alunoId: string) => parceirosService.getById(alunoId),

  getDocuments: (alunoId: string) => documentosAlunoV2Service.getPainel(alunoId),

  updateProfile: (alunoId: string, _currentProfile: PerfilData, payload: PerfilUpdatePayload) =>
    updateAlunoEditableProfile(alunoId, payload),

  uploadSeparateDocuments: (documentoId: string, files: File[]) =>
    documentosAlunoV2Service.uploadSeparado(documentoId, files),

  uploadConsolidatedPdf: (documentoIds: string[], file: File) =>
    documentosAlunoV2Service.uploadPdfUnico(documentoIds, file),

  cancelDocumentBatch: (
    loteId: string,
    arquivos: Array<{ bucket: string; path: string }>,
  ) => documentosAlunoV2Service.cancelarLote(loteId, arquivos),

  uploadProfilePhoto: (alunoId: string, currentProfile: PerfilData, file: File) =>
    parceirosService.uploadProfilePhoto(alunoId, currentProfile, file),
};
