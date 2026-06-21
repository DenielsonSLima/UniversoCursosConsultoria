import { SecretariaContext, SecretariaDocumentoId } from './secretaria-documentos.types';

export const secretariaDocumentosKeys = {
  all: ['secretaria-documentos'] as const,
  context: (context: SecretariaContext) =>
    [...secretariaDocumentosKeys.all, context.userId, context.poloId] as const,
  document: (context: SecretariaContext, documentId: SecretariaDocumentoId) =>
    [...secretariaDocumentosKeys.context(context), documentId] as const,
  search: (context: SecretariaContext, documentId: SecretariaDocumentoId, term: string) =>
    [...secretariaDocumentosKeys.document(context, documentId), 'alunos', term] as const,
  matriculas: (context: SecretariaContext, documentId: SecretariaDocumentoId, alunoId: string) =>
    [...secretariaDocumentosKeys.document(context, documentId), 'matriculas', alunoId] as const,
  turmas: (context: SecretariaContext, documentId: SecretariaDocumentoId, technicalOnly: boolean) =>
    [...secretariaDocumentosKeys.document(context, documentId), 'turmas', { technicalOnly }] as const,
  turmaSummary: (context: SecretariaContext, documentId: SecretariaDocumentoId, turmaId: string) =>
    [...secretariaDocumentosKeys.document(context, documentId), 'turma', turmaId] as const,
  emissions: (context: SecretariaContext, documentId: SecretariaDocumentoId) =>
    [...secretariaDocumentosKeys.document(context, documentId), 'emissoes'] as const,
};
