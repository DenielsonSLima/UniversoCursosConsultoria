import { PrazoConfig, Solicitacao } from '../../gestor/secretaria/secretaria.service';

export type AlunoSecretariaSolicitacaoTipo = Solicitacao['tipo'];

export interface AlunoSecretariaMatricula {
  id: string;
  status?: string | null;
  data_matricula?: string | null;
  polo_id?: string | null;
  turma_id?: string | null;
  turmas?: {
    id?: string | null;
    nome?: string | null;
    codigo?: string | null;
    status?: string | null;
    polo_id?: string | null;
    cursos?: {
      id?: string | null;
      nome?: string | null;
      modalidade?: string | null;
    } | null;
    polos?: {
      nome?: string | null;
    } | null;
  } | null;
}

export interface AlunoSecretariaEligibility {
  hasOnlineOnlyAccess: boolean;
  hasAnyTechnicalEnrollment: boolean;
  hasActiveTechnicalEnrollment: boolean;
  hasHistoricalTechnicalEnrollment: boolean;
  canEmitStudentCard: boolean;
  canEmitInternshipBadge: boolean;
  canEmitBulletin: boolean;
  canEmitEnrollmentDeclaration: boolean;
  canEmitIrpf: boolean;
  canRequestHistory: boolean;
  canRequestIrpf: boolean;
  canRequestTransfer: boolean;
  primaryEnrollment: AlunoSecretariaMatricula | null;
  technicalIdentityEnrollment: AlunoSecretariaMatricula | null;
  bulletinEnrollment: AlunoSecretariaMatricula | null;
  declarationEnrollment: AlunoSecretariaMatricula | null;
  irpfEnrollment: AlunoSecretariaMatricula | null;
  requestEnrollment: AlunoSecretariaMatricula | null;
  allowedRequests: AlunoSecretariaSolicitacaoTipo[];
  blockedSummary: string;
}

export interface AlunoSecretariaData {
  aluno: any | null;
  matriculas: AlunoSecretariaMatricula[];
  solicitacoes: Solicitacao[];
  prazos: Record<string, PrazoConfig>;
}

export interface AlunoSecretariaIrpfPagamento {
  turma_id: string;
  turma_nome: string | null;
  parcela_id: string;
  matricula_id: string;
  status: string;
  valor: number;
  valor_pago?: number | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  asaas_invoice: string | null;
}
