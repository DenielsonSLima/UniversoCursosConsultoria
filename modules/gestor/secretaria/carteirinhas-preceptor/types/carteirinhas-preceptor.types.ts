import type { CanonicalDocumentRenderPayload } from '../../shared/canonical-document-render.types';

export type CarteirinhaPreceptorEmissionMode = 'INDIVIDUAL' | 'LOTE' | 'PERSONALIZADO';

export interface CarteirinhaPreceptorTarget {
  professorId: string;
  professorNome: string;
  cargo: string | null;
  areaAtuacao: string | null;
  statusLabel: string | null;
  elegivel: boolean;
  mensagemElegibilidade: string | null;
}

export interface CarteirinhaPreceptorTemplateInfo {
  id: string | null;
  nome: string;
  versao: string | null;
  status: string | null;
  marcaDaguaAtiva: boolean | null;
  qrCodeAtivo: boolean | null;
}

export interface CarteirinhaPreceptorValidationPolicy {
  validadeLabel: string | null;
  validacaoPublica: boolean | null;
}

export interface CarteirinhasPreceptorWorkspace {
  targets: CarteirinhaPreceptorTarget[];
  template: CarteirinhaPreceptorTemplateInfo | null;
  policy: CarteirinhaPreceptorValidationPolicy | null;
  generatedAt: string | null;
}

export interface CarteirinhaPreceptorPreparationInput {
  poloId: string;
  mode: CarteirinhaPreceptorEmissionMode;
  professorIds: string[];
  customMessage: string;
  idempotencyKey: string;
}

export interface CarteirinhaPreceptorPreparedDocument {
  emissionId: string;
  documentId: string | null;
  title: string;
  targetName: string;
  validationCode: string | null;
  validationUrl: string | null;
  validUntil: string | null;
  fileUrl: string | null;
  statusLabel: string | null;
  renderPayload: CanonicalDocumentRenderPayload | null;
}

export interface CarteirinhaPreceptorPreparationResult {
  documents: CarteirinhaPreceptorPreparedDocument[];
  message: string | null;
  generatedAt: string | null;
}
