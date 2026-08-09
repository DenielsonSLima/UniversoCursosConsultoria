import type { CanonicalDocumentRenderPayload } from '../../shared/canonical-document-render.types';

export const CONTRATO_ALUNO_MODALIDADES = ['TECNICO', 'LIVRE', 'SUPERIOR'] as const;

export type ContratoAlunoModalidade = typeof CONTRATO_ALUNO_MODALIDADES[number];
export type ContratoAlunoEmissionMode = 'INDIVIDUAL' | 'LOTE' | 'PERSONALIZADO';

export interface ContratoAlunoTurma {
  id: string;
  nome: string;
  codigo: string;
  cursoNome: string;
  modalidade: ContratoAlunoModalidade | string;
}

export interface ContratoAlunoTarget {
  enrollmentId: string;
  poloId: string;
  dataMatricula: string | null;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string | null;
  alunoRg: string | null;
  alunoFotoUrl: string | null;
  cursoNome: string;
  modalidade: ContratoAlunoModalidade | string;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  statusLabel: string | null;
  elegivel: boolean;
  mensagemElegibilidade: string | null;
}

export interface ContratoAlunoTemplateInfo {
  id: string | null;
  nome: string;
  versao: string | null;
  modalidade: string | null;
  status: string | null;
  marcaDaguaAtiva: boolean | null;
  qrCodeAtivo: boolean | null;
}

export interface ContratoAlunoValidationPolicy {
  validadeLabel: string | null;
  validacaoPublica: boolean | null;
}

export interface ContratoAlunoWorkspace {
  targets: ContratoAlunoTarget[];
  turmas: ContratoAlunoTurma[];
  templates: ContratoAlunoTemplateInfo[];
  policy: ContratoAlunoValidationPolicy | null;
  generatedAt: string | null;
}

export interface ContratoAlunoPreparationInput {
  poloId: string;
  mode: ContratoAlunoEmissionMode;
  enrollmentIds: string[];
  customMessage: string;
  idempotencyKey: string;
}

export interface ContratoAlunoPreparedDocument {
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

export interface ContratoAlunoPreparationResult {
  documents: ContratoAlunoPreparedDocument[];
  message: string | null;
  generatedAt: string | null;
}
