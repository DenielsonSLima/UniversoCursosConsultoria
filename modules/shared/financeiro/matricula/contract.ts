export const FINANCIAL_ORIGINS = [
  'PROESC_HISTORY', 'BANESE_LEGACY_IMPORTED', 'UNIVERSO_NATIVE', 'LOCAL', 'UNKNOWN', 'CONFLICT',
] as const;
export type FinancialOrigin = typeof FINANCIAL_ORIGINS[number];
export interface FinancialRowDiagnostic { matriculaId: string | null; mensagem: string }
export interface EnrollmentFinancialContext {
  versao: 1;
  matriculaId: string;
  fontes: { origem: FinancialOrigin; provedor: string | null; canal: string | null; quantidade: number }[];
  mensalidades: {
    lancadas: number; emitidas: number; bancariasEmitidas: number; externasConhecidas: number;
    canceladas: number; pagas: number; emRevisao: number;
  };
  taxas: number;
  ajustesResiduais: number;
  ciclosComprovados: {
    numero: number; origem: string; confirmadoEm: string; identidadeConfirmada: boolean; emRevisao: boolean;
  }[];
  operacoes: { cicloNumero: number; estado: string; requestId: string | null; quantidadeItens: number }[];
}
export interface ManagerCycleDecision {
  versao: 1;
  naoEmitirPermitido: true;
  opcoes: { cicloNumero: 1 | 2; acao: 'CRIAR' | 'RETOMAR' | 'CONSULTAR'; podeGerar: boolean; motivo: string | null }[];
}
export interface EnrollmentFinancialProjection {
  financeiroMatricula?: EnrollmentFinancialContext;
  decisaoGestor?: ManagerCycleDecision;
  diagnosticoFinanceiro?: string;
}
